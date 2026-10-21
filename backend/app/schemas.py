from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class HoldingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quantity: Decimal = Field(
        gt=0, le=1_000_000_000, max_digits=24, decimal_places=10, allow_inf_nan=False
    )
    average_cost: Decimal = Field(
        ge=0, le=1_000_000_000, max_digits=24, decimal_places=10, allow_inf_nan=False
    )


class Claim(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=10, max_length=1200)
    source_ids: list[str] = Field(min_length=1, max_length=8)


class OutlookBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: Claim
    narrative: Claim
    bull_case: list[Claim] = Field(min_length=1, max_length=4)
    bear_case: list[Claim] = Field(min_length=1, max_length=4)


def validate_citations(body: OutlookBody, source_ids: set[str]):
    claims = [body.summary, body.narrative, *body.bull_case, *body.bear_case]
    if any(not set(c.source_ids).issubset(source_ids) for c in claims):
        raise ValueError("Outlook contains unknown source references")
    return body
