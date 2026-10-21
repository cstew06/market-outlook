"""Synthetic fixtures, never presented as actual prices or published journalism."""

import hashlib
import math
import random
from datetime import UTC, datetime, timedelta

from .catalog import CATALOG, public_asset

AS_OF = datetime(2026, 10, 16, 20, tzinfo=UTC)


def history(asset_id):
    asset = CATALOG[asset_id]
    seed = int(hashlib.sha256(asset_id.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)
    days = [AS_OF.date() - timedelta(days=i) for i in range(365, -1, -1)]
    days = [d for d in days if asset["kind"] == "crypto" or d.weekday() < 5]
    values, value = [], 100.0
    for i, d in enumerate(days):
        value *= 1 + rng.uniform(-0.018, 0.022) + math.sin(i / 11) * 0.003
        values.append({"time": d.isoformat(), "value": value})
    scale = asset["sample_price"] / values[-1]["value"]
    for p in values:
        p["value"] = round(p["value"] * scale, 4)
    values[-2]["value"] = round(asset["sample_price"] / (1 + asset["sample_change"] / 100), 4)
    return values


def quote(asset_id):
    asset = CATALOG[asset_id]
    price, change = asset["sample_price"], asset["sample_change"]
    return dict(
        public_asset(asset),
        price=price,
        change=round(price - price / (1 + change / 100), 4),
        change_percent=change,
        as_of=AS_OF.isoformat(),
        price_label="Sample price",
        provider="Synthetic demo",
        history=history(asset_id),
    )


def news(asset_id):
    asset = CATALOG[asset_id]
    if asset["kind"] == "crypto":
        subjects = [
            (
                "Institutional participation comes into focus",
                "In this sample scenario, broader participation improves market depth while demand remains sensitive to risk appetite.",
                "Adoption",
            ),
            (
                "Network use and liquidity tell different stories",
                "The sample evidence describes stronger network activity, but uneven liquidity means activity alone does not imply a higher token price.",
                "Network activity",
            ),
            (
                "Macro uncertainty keeps volatility in view",
                "This fictional brief highlights interest-rate uncertainty and rapid changes in liquidity as risks to digital assets.",
                "Macro",
            ),
            (
                "Long-term adoption meets near-term expectations",
                "The illustrative scenario weighs improving access against valuation uncertainty and regulatory developments.",
                "Regulation",
            ),
        ]
    elif asset_id in ("NVDA", "AMD", "MSFT", "GOOGL", "META", "AMZN"):
        subjects = [
            (
                "AI infrastructure demand remains the central debate",
                f"In this illustrative scenario, {asset['name']} benefits from sustained investment in AI infrastructure. The pace of future spending remains uncertain.",
                "AI infrastructure",
            ),
            (
                "Investors look for evidence behind growth expectations",
                "The sample evidence describes healthy demand alongside elevated expectations. Execution and conversion of spending into revenue remain important.",
                "Earnings",
            ),
            (
                "Margins and competition challenge the growth story",
                "This fictional brief highlights competition, rising investment costs, and customer concentration as possible constraints on future margins.",
                "Competition",
            ),
            (
                "Policy uncertainty adds a second layer of risk",
                "The illustrative scenario considers how trade restrictions and changing economic conditions could affect international demand.",
                "Policy",
            ),
        ]
    else:
        subjects = [
            (
                "Demand trends frame the next earnings debate",
                f"This sample scenario places {asset['name']} in a market balancing steady demand against higher expectations.",
                "Earnings",
            ),
            (
                "Resilience depends on execution and margins",
                "The illustrative evidence describes operating discipline and steady cash generation, while acknowledging uncertain future margins.",
                "Fundamentals",
            ),
            (
                "Rate expectations remain a source of uncertainty",
                "This fictional brief considers how changing interest rates and consumer demand could affect valuations.",
                "Macro",
            ),
            (
                "Valuation puts the focus on delivery",
                "The sample scenario weighs potential earnings growth against the risk that current expectations are already reflected in prices.",
                "Valuation",
            ),
        ]
    return [
        dict(
            id=f"{asset_id}-{i + 1}",
            asset_id=asset_id,
            title=title,
            summary=summary,
            source="Market Outlook · sample brief",
            url=None,
            topic=topic,
            published_at=(AS_OF - timedelta(hours=3 + i * 6)).isoformat(),
            is_sample=True,
        )
        for i, (title, summary, topic) in enumerate(subjects)
    ]


def outlook(asset_id):
    asset = CATALOG[asset_id]

    def refs(*i):
        return [f"{asset_id}-{n}" for n in i]

    crypto = asset["kind"] == "crypto"
    return {
        "summary": {
            "text": f"{asset['name']}: the opportunity is visible, but uncertainty remains. This sample outlook weighs demand and adoption against valuation expectations and broader market risks.",
            "source_ids": refs(1, 2, 3),
        },
        "narrative": {
            "text": "The central debate is whether adoption can translate into durable value. Improving participation is constructive, but liquidity and policy remain meaningful uncertainties."
            if crypto
            else "The conversation has shifted from the size of the opportunity to the quality of execution. Demand supports the growth case; margins and already-high expectations are the counterweight.",
            "source_ids": refs(1, 2, 3, 4),
        },
        "bull_case": [
            {
                "text": "Broader adoption and participation could support sustained network use."
                if crypto
                else "Sustained demand could translate into stronger revenue over time.",
                "source_ids": refs(1),
            },
            {
                "text": "Improving market depth could make participation more resilient."
                if crypto
                else "Strong execution could help the business turn investment into durable growth.",
                "source_ids": refs(1, 2),
            },
        ],
        "bear_case": [
            {
                "text": "Liquidity can reverse quickly, making near-term outcomes volatile."
                if crypto
                else "Margins and economic conditions could challenge the growth story.",
                "source_ids": refs(2, 3),
            },
            {
                "text": "Policy changes could outweigh adoption gains."
                if crypto or asset_id in ("NVDA", "AMD", "MSFT", "GOOGL", "META", "AMZN")
                else "High expectations may already be reflected in prices, leaving less room for disappointment.",
                "source_ids": refs(4),
            },
        ],
    }
