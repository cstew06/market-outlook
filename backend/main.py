import threading
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app import config, demo
from app.catalog import CATALOG, public_asset
from app.database import (
    Holding,
    OutlookRecord,
    SessionLocal,
    WatchItem,
    Workspace,
    get_db,
)
from app.portfolio import summarize
from app.providers import generate_outlook, get_history, get_news, get_quote
from app.schemas import HoldingInput, validate_citations

outlook_locks = {key: threading.Lock() for key in CATALOG}


@asynccontextmanager
async def lifespan(app):
    with SessionLocal() as db:
        if not db.get(Workspace, config.MODE):
            db.add(Workspace(name=config.MODE))
            if config.MODE == "demo":
                for asset_id, qty, cost in [
                    ("NVDA", "24", "102.50"),
                    ("AAPL", "15", "192.40"),
                    ("MSFT", "8", "380.20"),
                    ("BTC", ".085", "52800"),
                ]:
                    db.add(
                        Holding(
                            workspace="demo",
                            asset_id=asset_id,
                            quantity=Decimal(qty),
                            average_cost=Decimal(cost),
                        )
                    )
                for asset_id in ("NVDA", "AAPL", "MSFT", "BTC", "ETH"):
                    db.add(WatchItem(workspace="demo", asset_id=asset_id))
            db.commit()
    yield


app = FastAPI(title="Market Outlook API", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def local_mutation_guard(request: Request, call_next):
    # No authentication in local V1. Reject cross-origin browser writes.
    if request.method in ("POST", "PUT", "DELETE", "PATCH"):
        origin = request.headers.get("origin")
        from urllib.parse import urlparse

        if origin and urlparse(origin).netloc != request.headers.get("host"):
            return JSONResponse(
                {"detail": "Cross-origin changes are not allowed."}, status_code=403
            )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(SQLAlchemyError)
async def database_error(request, exc):
    return JSONResponse(
        {
            "detail": "The database is unavailable. Check that PostgreSQL is running and migrations have completed."
        },
        status_code=503,
    )


def asset_or_404(asset_id):
    asset = CATALOG.get(asset_id.upper())
    if not asset:
        raise HTTPException(404, "This asset is not in the supported V1 catalog.")
    return asset


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/api/config")
def configuration():
    return dict(
        mode=config.MODE,
        news_provider=config.NEWS_PROVIDER,
        sample_as_of=demo.AS_OF.isoformat() if config.MODE == "demo" else None,
        providers=[
            dict(name=name, configured=bool(key))
            for name, key in [
                ("Massive", config.MASSIVE_KEY),
                ("CoinGecko", config.COINGECKO_KEY),
                ("Alpha Vantage", config.NEWS_KEY),
                ("Gemini", config.GEMINI_KEY),
            ]
        ],
        outlook_ttl_hours=config.OUTLOOK_TTL // 3600,
        gemini_model=config.GEMINI_MODEL,
    )


@app.get("/api/assets")
def assets(q: str = Query("", max_length=80)):
    query = q.strip().casefold()
    return [
        public_asset(a)
        for a in CATALOG.values()
        if query in f"{a['symbol']} {a['name']}".casefold()
    ]


@app.get("/api/overview")
def overview(db: Session = Depends(get_db)):
    holdings = db.scalars(
        select(Holding).where(Holding.workspace == config.MODE).order_by(Holding.asset_id)
    ).all()
    watchlist = db.scalars(
        select(WatchItem.asset_id)
        .where(WatchItem.workspace == config.MODE)
        .order_by(WatchItem.asset_id)
    ).all()
    ids = list(
        dict.fromkeys([h.asset_id for h in holdings] + watchlist + ["SPY", "QQQ", "BTC", "ETH"])
    )
    quotes, errors = {}, {}
    for asset_id in ids:
        try:
            quotes[asset_id] = get_quote(asset_id)
        except HTTPException as error:
            errors[asset_id] = error.detail
    return dict(
        mode=config.MODE,
        assets=[public_asset(a) for a in CATALOG.values()],
        watchlist=watchlist,
        quotes=quotes,
        quote_errors=errors,
        portfolio=summarize(holdings, quotes),
    )


@app.get("/api/assets/{asset_id}")
def asset_detail(asset_id: str):
    asset = asset_or_404(asset_id)
    result = dict(asset=public_asset(asset), quote=None, history=[], news=[], errors={})
    for field, loader in [
        ("quote", get_quote),
        ("history", get_history),
        ("news", get_news),
    ]:
        try:
            result[field] = loader(asset["id"])
        except HTTPException as error:
            result["errors"][field] = error.detail
    return result


@app.put("/api/watchlist/{asset_id}")
def add_watch(asset_id: str, db: Session = Depends(get_db)):
    asset_id = asset_or_404(asset_id)["id"]
    if not db.get(WatchItem, (config.MODE, asset_id)):
        db.add(WatchItem(workspace=config.MODE, asset_id=asset_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()  # Concurrent duplicate adds are idempotent.
    return {"asset_id": asset_id}


@app.delete("/api/watchlist/{asset_id}", status_code=204)
def remove_watch(asset_id: str, db: Session = Depends(get_db)):
    asset_id = asset_or_404(asset_id)["id"]
    item = db.get(WatchItem, (config.MODE, asset_id))
    if item:
        db.delete(item)
        db.commit()


@app.put("/api/holdings/{asset_id}")
def save_holding(asset_id: str, body: HoldingInput, db: Session = Depends(get_db)):
    asset_id = asset_or_404(asset_id)["id"]
    row = db.get(Holding, (config.MODE, asset_id))
    if not row:
        row = Holding(workspace=config.MODE, asset_id=asset_id)
        db.add(row)
    row.quantity, row.average_cost = body.quantity, body.average_cost
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409, "This holding changed in another request. Refresh and try again."
        ) from None
    return {"asset_id": asset_id}


@app.delete("/api/holdings/{asset_id}", status_code=204)
def remove_holding(asset_id: str, db: Session = Depends(get_db)):
    asset_id = asset_or_404(asset_id)["id"]
    row = db.get(Holding, (config.MODE, asset_id))
    if not row:
        raise HTTPException(404, "Holding not found.")
    db.delete(row)
    db.commit()


@app.get("/api/assets/{asset_id}/outlook")
def read_outlook(asset_id: str, db: Session = Depends(get_db)):
    asset_id = asset_or_404(asset_id)["id"]
    record = db.get(OutlookRecord, (config.MODE, asset_id))
    if not record:
        return None
    return dict(
        record.payload,
        cached=True,
        stale=(datetime.now(UTC) - record.generated_at).total_seconds() > config.OUTLOOK_TTL,
    )


@app.post("/api/assets/{asset_id}/outlook")
def create_outlook(asset_id: str, db: Session = Depends(get_db)):
    asset_id = asset_or_404(asset_id)["id"]
    with outlook_locks[asset_id]:
        record = db.get(OutlookRecord, (config.MODE, asset_id))
        now = datetime.now(UTC)
        if record and (now - record.generated_at).total_seconds() < config.OUTLOOK_TTL:
            return dict(record.payload, cached=True, stale=False)
        sources = get_news(asset_id)
        body = validate_citations(generate_outlook(asset_id, sources), {s["id"] for s in sources})
        payload = dict(
            body.model_dump(),
            sources=sources,
            generated_at=now.isoformat(),
            sample_as_of=demo.AS_OF.isoformat() if config.MODE == "demo" else None,
            is_sample=config.MODE == "demo",
            model="Curated sample analysis" if config.MODE == "demo" else config.GEMINI_MODEL,
        )
        if not record:
            record = OutlookRecord(workspace=config.MODE, asset_id=asset_id)
            db.add(record)
        record.generated_at, record.payload = now, payload
        db.commit()
        return dict(payload, cached=False, stale=False)
