# A deliberately bounded, unambiguous asset universe for V1.
ROWS = [
    ("NVDA", "NVIDIA", "stock", "NASDAQ", "Technology", "#76b900", 138.85, 2.34),
    ("AAPL", "Apple", "stock", "NASDAQ", "Technology", "#64748b", 228.20, 0.86),
    ("MSFT", "Microsoft", "stock", "NASDAQ", "Technology", "#2584df", 428.76, 1.18),
    ("GOOGL", "Alphabet", "stock", "NASDAQ", "Communication", "#4285f4", 165.80, -0.42),
    ("AMZN", "Amazon", "stock", "NASDAQ", "Consumer", "#ed9c26", 187.42, 1.42),
    (
        "META",
        "Meta Platforms",
        "stock",
        "NASDAQ",
        "Communication",
        "#2864e8",
        573.25,
        1.68,
    ),
    ("TSLA", "Tesla", "stock", "NASDAQ", "Consumer", "#d94d50", 242.64, -1.25),
    (
        "AMD",
        "Advanced Micro Devices",
        "stock",
        "NASDAQ",
        "Technology",
        "#b95153",
        155.30,
        2.12,
    ),
    ("JPM", "JPMorgan Chase", "stock", "NYSE", "Financials", "#36577b", 219.60, 0.48),
    ("V", "Visa", "stock", "NYSE", "Financials", "#4e5db3", 283.10, 0.63),
    (
        "SPY",
        "SPDR S&P 500 ETF",
        "etf",
        "NYSE ARCA",
        "US equities",
        "#426b8d",
        572.24,
        0.74,
    ),
    ("QQQ", "Invesco QQQ", "etf", "NASDAQ", "US equities", "#7356b4", 492.34, 1.12),
    ("BTC", "Bitcoin", "crypto", "CRYPTO", "Digital assets", "#f49b26", 67482.50, 2.14),
    ("ETH", "Ethereum", "crypto", "CRYPTO", "Digital assets", "#777bc1", 2645.80, 1.56),
    ("SOL", "Solana", "crypto", "CRYPTO", "Digital assets", "#8065d5", 154.72, 3.28),
    (
        "LINK",
        "Chainlink",
        "crypto",
        "CRYPTO",
        "Digital assets",
        "#2a5ada",
        12.64,
        -0.83,
    ),
]
CATALOG = {
    r[0]: dict(
        zip(
            (
                "id",
                "name",
                "kind",
                "exchange",
                "sector",
                "color",
                "sample_price",
                "sample_change",
            ),
            r,
        ),
        symbol=r[0],
        currency="USD",
    )
    for r in ROWS
}
COIN_IDS = {"BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "LINK": "chainlink"}


def public_asset(asset):
    return {k: v for k, v in asset.items() if not k.startswith("sample_")}
