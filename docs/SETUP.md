# Run Market Outlook

## Start the complete app

Install and open [Docker Desktop](https://www.docker.com/products/docker-desktop/), then run from the repository root:

```sh
docker compose up --build -d
```

Open **http://127.0.0.1:5173**. The first start downloads images, builds the app, applies database migrations, and creates a sample portfolio. No API keys or paid accounts are needed for demo mode.

```sh
docker compose ps           # Check the services
docker compose logs api    # Inspect API startup
docker compose stop        # Stop without removing saved data
docker compose up -d       # Start again
```

The PostgreSQL volume keeps holdings, watchlists, and saved outlooks. `docker compose down` also preserves it; **do not add `-v` unless you intend to erase all saved data**. Clearing the portfolio through the interface does not reseed it on restart.

Ports: web **5173**, API **8000**, database **5433**. All host ports bind to loopback. Stop other services using those ports before starting Compose. This V1 is a local, single-user app without login; do not expose these ports to the internet.

## Demo and live workspaces

Demo mode uses deterministic synthetic prices, fictional news briefs, and curated sample outlooks dated October 16, 2026. Its Generate button demonstrates the complete evidence workflow without calling Gemini. Portfolio and watchlist changes still persist in PostgreSQL.

Live mode uses a separate portfolio and watchlist, initially empty. Switching modes never converts sample holdings into real holdings. No live provider failure falls back to sample prices or analysis.

The V1 catalog contains 16 supported stocks, ETFs, and cryptocurrencies. Search is limited to that catalog; it is not an exchange-wide symbol search.

## Optional live data

Copy `.env.example` to `.env` in the repository root, fill in the providers you want, and set `DATA_MODE=live`. Keep `.env` private; it is ignored by Git. The frontend never receives API keys.

| Variable | Purpose |
| --- | --- |
| `MASSIVE_API_KEY` | Stock/ETF daily prices and the default news feed |
| `COINGECKO_API_KEY` | CoinGecko Demo API: crypto quotes and daily history |
| `ALPHA_VANTAGE_API_KEY` | Optional alternative news provider; news may require a premium plan |
| `NEWS_PROVIDER` | `massive` (default) or `alpha_vantage` |
| `GEMINI_API_KEY` | Structured market outlook generation |
| `GEMINI_MODEL` | Model supporting structured JSON output; default `gemini-3.1-flash-lite` |

Then run:

```sh
docker compose up -d --force-recreate api web
```

Official provider documentation: [Massive aggregates](https://massive.com/docs/rest/stocks/aggregates/custom-bars), [CoinGecko](https://docs.coingecko.com/reference/introduction), [Alpha Vantage news](https://www.alphavantage.co/documentation/#news-sentiment), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output).

Provider access, free quotas, and model availability can change. Confirm access to the endpoints above on your chosen plan. You do not need to configure all providers: unavailable data is shown explicitly. Stock prices are **end-of-day**, not streaming. Crypto prices carry the provider's observation time. Live integrations have adapter and failure-path tests. Account entitlements still depend on your own keys and plan.

Massive supplies the default news feed using the same key as stock prices; its [news endpoint documentation](https://massive.com/docs/rest/stocks/news) lists access on the Stocks Basic plan. Stock/ETF articles are ticker-filtered. Crypto coverage searches explicit asset names in a shared snapshot of the latest 1,000 articles within seven days. This is a bounded sample, not comprehensive crypto news; some assets may have insufficient coverage for an outlook. Alpha Vantage remains an optional alternative, selected with `NEWS_PROVIDER=alpha_vantage`; its news endpoint returned a premium-plan requirement during live verification.

### Quotas and freshness

- Stock quotes/history: cached for 3 hours; stock prices and Massive news share a 5-request-per-minute budget.
- Crypto quotes: 60 seconds; history: 15 minutes; combined request guard: 90 per minute.
- News: 30-minute feed cache; only the last 7 days are eligible; up to 8 deduplicated articles. Optional Alpha Vantage news has a 25-request-per-24-hour guard.
- Outlooks: saved in PostgreSQL and reused for 3 hours; at most 3 model requests per minute.

These are local guards, not guarantees about a provider's allowance. Price/news caches and counters reset when the API restarts. Run one API worker. On a first uncached load, a broad stock watchlist can exceed the minute allowance; wait and use **Refresh prices** or **Retry**. Existing holdings and outlooks remain saved.

Outlooks require at least two recent articles. Gemini receives only the selected asset and article metadata, never your holdings or portfolio. The backend checks the output structure and every citation ID before saving. This verifies reference integrity, not the truth or completeness of the generated analysis. Sources remain attached to the saved outlook even after the news cache changes.

## Local development without containerized web/API

Requirements: Python 3.13, Node 22.12+ (or Node 20.19+), and Docker for PostgreSQL.

From the repository root:

```sh
docker compose up -d db
python3.13 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
cd frontend
npm ci
```

Start each service in its own terminal:

```sh
# Terminal 1, from backend/
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

```sh
# Terminal 2, from frontend/
npm run dev
```

Open http://127.0.0.1:5173. Press **Control+C** in each terminal to stop it. Stop the database with `docker compose stop db` from the root. The Vite and nginx proxies preserve the browser Host header so the API can reject cross-origin writes. API documentation is at http://127.0.0.1:8000/docs.

## Verification

```sh
# From frontend/
npm run format:check
npm run build

# From backend/
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/python -m unittest discover -s tests -v
```

To include PostgreSQL integration tests, start the database and run from `backend/`:

```sh
TEST_DATABASE_URL=postgresql+psycopg://market:market_local@127.0.0.1:5433/market_outlook \
  .venv/bin/python -m unittest discover -s tests -v
.venv/bin/alembic check
```

Integration tests create and remove uniquely named test schemas, leaving application tables untouched. GitHub Actions runs formatting, type checking, the production frontend build, database migrations, and unit/integration tests on pushes to `main` and on pull requests.

## Hosting later

GitHub Pages can host static frontend files, but cannot run this Python API or PostgreSQL database. Public deployment needs backend/database hosting, authentication or another access-control choice, and a review of each provider's public-display rights. The current Docker configuration intentionally serves only your computer.
