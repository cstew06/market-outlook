"""Integration tests in disposable PostgreSQL schemas, enabled by TEST_DATABASE_URL."""

import os
import unittest
from contextlib import ExitStack
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, text
from sqlalchemy.orm import sessionmaker

import main
from app import config
from app.database import Base, Holding, WatchItem, get_db


@unittest.skipUnless(
    os.getenv("TEST_DATABASE_URL"),
    "Set TEST_DATABASE_URL for PostgreSQL integration tests",
)
class ApiTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        engine = create_engine(os.environ["TEST_DATABASE_URL"])
        schema = "test_" + uuid4().hex
        with engine.begin() as connection:
            connection.execute(text(f"CREATE SCHEMA {schema}"))

        def cleanup():
            with engine.begin() as connection:
                connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
            engine.dispose()

        self.stack.callback(cleanup)
        isolated = engine.execution_options(schema_translate_map={None: schema})
        Base.metadata.create_all(isolated)
        self.sessions = sessionmaker(isolated, expire_on_commit=False)

        def session():
            with self.sessions() as db:
                yield db

        main.app.dependency_overrides[get_db] = session
        self.stack.callback(main.app.dependency_overrides.clear)
        self.stack.enter_context(patch.object(main, "SessionLocal", self.sessions))
        self.stack.enter_context(patch.object(config, "MODE", "demo"))
        self.client = self.stack.enter_context(TestClient(main.app))

    def test_holding_lifecycle_and_validation(self):
        self.assertEqual(
            self.client.put(
                "/api/holdings/ETH", json={"quantity": "0.25", "average_cost": "1000"}
            ).status_code,
            200,
        )
        rows = self.client.get("/api/overview").json()["portfolio"]["holdings"]
        eth = next(row for row in rows if row["asset_id"] == "ETH")
        self.assertEqual(eth["cost_basis"], 250)
        self.assertEqual(
            self.client.put(
                "/api/holdings/ETH", json={"quantity": "-1", "average_cost": "1"}
            ).status_code,
            422,
        )
        self.assertEqual(self.client.delete("/api/holdings/ETH").status_code, 204)
        self.assertEqual(self.client.delete("/api/holdings/ETH").status_code, 404)

    def test_watchlist_idempotence(self):
        for _ in range(2):
            self.assertEqual(self.client.put("/api/watchlist/SOL").status_code, 200)
        self.assertEqual(self.client.get("/api/overview").json()["watchlist"].count("SOL"), 1)
        for _ in range(2):
            self.assertEqual(self.client.delete("/api/watchlist/SOL").status_code, 204)

    def test_saved_outlook_survives_another_client(self):
        first = self.client.post("/api/assets/NVDA/outlook").json()
        self.assertFalse(first["cached"])
        with TestClient(main.app) as second_client:
            saved = second_client.get("/api/assets/NVDA/outlook").json()
            reused = second_client.post("/api/assets/NVDA/outlook").json()
        self.assertTrue(saved["cached"])
        self.assertEqual(first["generated_at"], reused["generated_at"])
        self.assertEqual(saved["sources"], first["sources"])

    def test_empty_portfolio_stays_empty_on_restart(self):
        with self.sessions() as db:
            db.execute(delete(Holding))
            db.execute(delete(WatchItem))
            db.commit()
        with TestClient(main.app) as second_client:
            overview = second_client.get("/api/overview").json()
        self.assertEqual(overview["portfolio"]["holdings"], [])
        self.assertEqual(overview["watchlist"], [])

    def test_live_workspace_does_not_inherit_demo(self):
        with (
            patch.object(config, "MODE", "live"),
            patch.object(main, "get_quote", return_value={"price": 100, "change": 1}),
        ):
            with TestClient(main.app) as client:
                data = client.get("/api/overview").json()
        self.assertEqual(data["portfolio"]["holdings"], [])
        self.assertEqual(data["watchlist"], [])

    def test_cross_origin_browser_writes_blocked(self):
        self.assertEqual(
            self.client.put(
                "/api/watchlist/AMD", headers={"Origin": "https://untrusted.example"}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.put(
                "/api/watchlist/AMD", headers={"Origin": "http://testserver"}
            ).status_code,
            200,
        )

    def test_unknown_asset_and_health(self):
        self.assertEqual(self.client.get("/health").json(), {"status": "ok"})
        self.assertEqual(self.client.get("/api/assets/UNKNOWN").status_code, 404)
        self.assertEqual(self.client.post("/api/assets/UNKNOWN/outlook").status_code, 404)
        self.assertEqual(self.client.get("/api/assets?q=nvidia").json()[0]["id"], "NVDA")


if __name__ == "__main__":
    unittest.main()
