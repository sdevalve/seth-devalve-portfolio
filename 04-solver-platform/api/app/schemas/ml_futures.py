from pydantic import BaseModel, ConfigDict
from typing import Any
from datetime import datetime


class MLFuturesIn(BaseModel):
    """Body for POST /ml-futures — upserts futures data for a season."""
    season: int
    # Each section is a dict keyed by team abbreviation.
    # playoffs: { abbrev: { make: int|null, miss: int|null } }
    # others:   { abbrev: float|int|null }
    playoffs: dict[str, Any] | None = None
    wintotals: dict[str, Any] | None = None
    division_odds: dict[str, Any] | None = None
    conference_odds: dict[str, Any] | None = None
    superbowl_odds: dict[str, Any] | None = None


class MLFuturesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    futures_id: str
    season_id: str
    playoffs: dict[str, Any] | None
    wintotals: dict[str, Any] | None
    division_odds: dict[str, Any] | None
    conference_odds: dict[str, Any] | None
    superbowl_odds: dict[str, Any] | None
    updated_at: datetime
