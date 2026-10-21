import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
MODE = os.getenv("DATA_MODE", "demo").lower()
if MODE not in ("demo", "live"):
    raise RuntimeError("DATA_MODE must be demo or live")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://market:market_local@127.0.0.1:5433/market_outlook",
)
MASSIVE_KEY = os.getenv("MASSIVE_API_KEY", "")
COINGECKO_KEY = os.getenv("COINGECKO_API_KEY", "")
NEWS_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "")
NEWS_PROVIDER = os.getenv("NEWS_PROVIDER", "massive").lower()
if NEWS_PROVIDER not in ("massive", "alpha_vantage"):
    raise RuntimeError("NEWS_PROVIDER must be massive or alpha_vantage")
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
OUTLOOK_TTL = 3 * 60 * 60
