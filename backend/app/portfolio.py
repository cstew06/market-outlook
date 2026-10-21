from decimal import ROUND_HALF_UP, Decimal


def money(value):
    return float(value.quantize(Decimal(".01"), rounding=ROUND_HALF_UP))


def summarize(holdings, quotes):
    rows = []
    total = Decimal(0)
    cost = Decimal(0)
    day = Decimal(0)
    complete = True
    day_complete = True
    for holding in holdings:
        quote = quotes.get(holding.asset_id)
        basis = holding.quantity * holding.average_cost
        cost += basis
        value = holding.quantity * Decimal(str(quote["price"])) if quote else None
        gain = value - basis if value is not None else None
        if value is None:
            complete = False
        else:
            total += value
        if not quote or quote["change"] is None:
            day_complete = False
        else:
            day += holding.quantity * Decimal(str(quote["change"]))
        rows.append(
            dict(
                asset_id=holding.asset_id,
                quantity=str(holding.quantity),
                average_cost=str(holding.average_cost),
                cost_basis=money(basis),
                value=money(value) if value is not None else None,
                gain=money(gain) if gain is not None else None,
                gain_percent=float(gain / basis * 100) if gain is not None and basis else None,
            )
        )
    return dict(
        holdings=rows,
        total_value=money(total) if complete else None,
        cost_basis=money(cost),
        total_gain=money(total - cost) if complete else None,
        total_gain_percent=float((total - cost) / cost * 100) if complete and cost else None,
        day_change=money(day) if day_complete else None,
        complete=complete,
    )
