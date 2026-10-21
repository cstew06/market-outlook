"""Financial invariants and external-data validation; no network or database required."""

import unittest
from copy import deepcopy
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from app import config, demo, providers
from app.portfolio import summarize
from app.schemas import HoldingInput, OutlookBody, validate_citations


def holding(symbol, quantity, cost):
    return SimpleNamespace(asset_id=symbol, quantity=Decimal(quantity), average_cost=Decimal(cost))


class PortfolioTests(unittest.TestCase):
    def test_fractional_crypto_and_decimal_rounding(self):
        result = summarize(
            [holding("BTC", ".085", "52800")], {"BTC": {"price": 67482.5, "change": 10}}
        )
        self.assertEqual(result["total_value"], 5736.01)
        self.assertEqual(result["cost_basis"], 4488)
        self.assertEqual(result["total_gain"], 1248.01)
        self.assertEqual(result["day_change"], 0.85)

    def test_missing_quote_hides_total_but_keeps_cost(self):
        result = summarize(
            [holding("AAPL", "2", "100"), holding("BTC", ".1", "10000")],
            {"AAPL": {"price": 110, "change": 1}},
        )
        self.assertFalse(result["complete"])
        self.assertIsNone(result["total_value"])
        self.assertIsNone(result["total_gain"])
        self.assertIsNone(result["day_change"])
        self.assertEqual(result["cost_basis"], 1200)
        self.assertEqual(result["holdings"][0]["gain"], 20)

    def test_zero_cost_is_valid_but_percentage_undefined(self):
        result = summarize([holding("AAPL", "1", "0")], {"AAPL": {"price": 100, "change": None}})
        self.assertEqual(result["total_gain"], 100)
        self.assertIsNone(result["total_gain_percent"])
        self.assertIsNone(result["day_change"])

    def test_empty_portfolio(self):
        result = summarize([], {})
        self.assertEqual(result["total_value"], 0)
        self.assertTrue(result["complete"])
        self.assertIsNone(result["total_gain_percent"])

    def test_invalid_holdings_are_rejected(self):
        for quantity, cost in [
            ("0", "1"),
            ("-1", "1"),
            ("NaN", "1"),
            ("1", "Infinity"),
            ("1", "-1"),
            ("1.00000000001", "1"),
            ("1000000001", "1"),
        ]:
            with (
                self.subTest(quantity=quantity, cost=cost),
                self.assertRaises(ValidationError),
            ):
                HoldingInput(quantity=quantity, average_cost=cost)


class EvidenceTests(unittest.TestCase):
    def test_all_sample_citations_resolve(self):
        for symbol in demo.CATALOG:
            body = OutlookBody.model_validate(demo.outlook(symbol))
            validate_citations(body, {s["id"] for s in demo.news(symbol)})

    def test_unknown_citation_is_rejected(self):
        body = OutlookBody.model_validate(demo.outlook("NVDA"))
        body.summary.source_ids = ["invented"]
        with self.assertRaises(ValueError):
            validate_citations(body, {"NVDA-1"})

    def test_empty_evidence_references_are_rejected(self):
        data = deepcopy(demo.outlook("NVDA"))
        data["summary"]["source_ids"] = []
        with self.assertRaises(ValidationError):
            OutlookBody.model_validate(data)

    def test_news_filters_stale_duplicate_and_unsafe_links(self):
        base = {
            "title": "New earnings report",
            "url": "https://example.com/news",
            "time_published": "20261019T120000",
            "summary": "Coverage",
            "source": "Publisher",
        }
        feed = [
            base,
            dict(base, title="NEW EARNINGS REPORT"),
            dict(base, title="Old", time_published="20261001T120000"),
            dict(base, title="Future", time_published="20261022T120000"),
            dict(base, title="Unsafe", url="javascript:alert(1)"),
            dict(base, title="Credentials", url="https://user:pass@example.com/"),
            {},
            None,
        ]
        result = providers.normalize_news(feed, "NVDA", datetime(2026, 10, 20, tzinfo=UTC))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["title"], base["title"])


class ProviderTests(unittest.TestCase):
    def setUp(self):
        providers._cache.clear()
        providers._calls.clear()
        self.mode = patch.object(config, "MODE", "live")
        self.mode.start()
        self.addCleanup(self.mode.stop)

    def test_cache_coalesces_repeated_calls(self):
        with patch(
            "app.providers.request",
            return_value={
                "bitcoin": {
                    "usd": 100,
                    "usd_24h_change": 25,
                    "last_updated_at": 1792454400,
                }
            },
        ) as request:
            quote = providers.get_quote("BTC")
            providers.get_quote("BTC")
        self.assertEqual(request.call_count, 1)
        self.assertEqual(quote["price"], 100)
        self.assertEqual(quote["change"], 20)

    def test_malformed_quote_is_not_demo_fallback(self):
        with (
            patch("app.providers.request", return_value={"bitcoin": {"usd": "NaN"}}),
            self.assertRaises(HTTPException) as ctx,
        ):
            providers.get_quote("BTC")
        self.assertEqual(ctx.exception.status_code, 502)

    def test_unconfigured_provider_is_explicit(self):
        with self.assertRaises(HTTPException) as ctx:
            providers.request("CoinGecko", "https://example.com", key="")
        self.assertEqual(ctx.exception.status_code, 503)

    def test_request_budget_blocks_excess_calls(self):
        providers.reserve("test", 1, 60)
        with self.assertRaises(HTTPException) as ctx:
            providers.reserve("test", 1, 60)
        self.assertEqual(ctx.exception.status_code, 429)

    def test_incomplete_ai_output_is_rejected(self):
        with (
            patch(
                "app.providers.request",
                return_value={"candidates": [{"finishReason": "MAX_TOKENS"}]},
            ),
            self.assertRaises(HTTPException) as ctx,
        ):
            providers.generate_outlook("NVDA", demo.news("NVDA"))
        self.assertEqual(ctx.exception.status_code, 502)

    def test_ai_cannot_invent_citation(self):
        body = demo.outlook("NVDA")
        body["summary"]["source_ids"] = ["fabricated"]
        import json

        response = {
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {"parts": [{"text": json.dumps(body)}]},
                }
            ]
        }
        with (
            patch("app.providers.request", return_value=response),
            self.assertRaises(HTTPException),
        ):
            providers.generate_outlook("NVDA", demo.news("NVDA"))

    def test_thin_evidence_never_calls_ai(self):
        with (
            patch("app.providers.request") as request,
            self.assertRaises(HTTPException) as ctx,
        ):
            providers.generate_outlook("NVDA", [])
        request.assert_not_called()
        self.assertEqual(ctx.exception.status_code, 422)

    def test_massive_news_maps_publisher_and_rejects_unsafe_urls(self):
        row = {
            "title": "NVIDIA reports results",
            "article_url": "https://example.com/nvidia",
            "description": "A recent report on demand and margins.",
            "publisher": {"name": "Example Publisher"},
            "published_utc": "2026-10-19T15:00:00-04:00",
        }
        news = providers.normalize_massive_news(
            [row, dict(row, title="Unsafe", article_url="javascript:alert(1)"), None],
            "NVDA",
            now=datetime(2026, 10, 20, tzinfo=UTC),
        )
        self.assertEqual(len(news), 1)
        self.assertEqual(news[0]["source"], "Example Publisher")
        self.assertEqual(news[0]["published_at"], "2026-10-19T19:00:00+00:00")
        self.assertFalse(news[0]["is_sample"])

    def test_crypto_news_reuses_feed_and_requires_relevant_mentions(self):
        rows = [
            {
                "title": title,
                "article_url": f"https://example.com/{i}",
                "description": "",
                "publisher": {"name": "Example Publisher"},
                "published_utc": datetime.now(UTC).isoformat(),
            }
            for i, title in enumerate(
                [
                    "Bitcoin adoption",
                    "Ethereum activity",
                    "Bitcoin Cash update",
                    "A new link",
                    "Chainlink adoption",
                ]
            )
        ]
        with patch("app.providers.request", return_value={"results": rows}) as request:
            bitcoin = providers.get_massive_news("BTC")
            ethereum = providers.get_massive_news("ETH")
            chainlink = providers.get_massive_news("LINK")
            solana = providers.get_massive_news("SOL")
        self.assertEqual(request.call_count, 1)
        self.assertEqual([n["title"] for n in bitcoin], ["Bitcoin adoption"])
        self.assertEqual([n["title"] for n in ethereum], ["Ethereum activity"])
        self.assertEqual([n["title"] for n in chainlink], ["Chainlink adoption"])
        self.assertEqual(solana, [])
        self.assertNotIn("ticker", request.call_args.kwargs["params"])

    def test_stock_news_uses_ticker_filter_and_empty_feed_is_valid(self):
        with patch("app.providers.request", return_value={"results": []}) as request:
            self.assertEqual(providers.get_massive_news("NVDA"), [])
        self.assertEqual(request.call_args.kwargs["params"]["ticker"], "NVDA")

    def test_malformed_massive_news_is_explicit(self):
        with (
            patch("app.providers.request", return_value={"results": None}),
            self.assertRaises(HTTPException) as ctx,
        ):
            providers.get_massive_news("NVDA")
        self.assertEqual(ctx.exception.status_code, 502)

    def test_premium_news_error_does_not_echo_provider_response(self):
        with (
            patch.object(config, "NEWS_PROVIDER", "alpha_vantage"),
            patch(
                "app.providers.request",
                return_value={"Information": "Premium endpoint. key=secret-test-value"},
            ),
            self.assertRaises(HTTPException) as ctx,
        ):
            providers.get_news("NVDA")
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertIn("premium plan", ctx.exception.detail)
        self.assertNotIn("secret-test-value", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
