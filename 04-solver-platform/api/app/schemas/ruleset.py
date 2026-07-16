from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime


class RuleIn(BaseModel):
    """One constraint row — mirrors the TypeScript Rule interface."""
    active: int = 1
    operator: str = "Max"
    games: int = 1
    # weeks, week_start, week_end can be int or comma-separated string
    weeks: Optional[Any] = None
    week_start: Optional[Any] = None
    week_end: Optional[Any] = None
    slot: Optional[str] = None
    penalty: float = 0.0
    constraint_type: str
    hard: str = ""          # "hard" | ""
    penalty_cap: int = 0    # 0 | 1
    comment: str = ""
    slack_bound: float = 0.0
    ti: int = 0             # 0 | 1
    teams: str = ""         # comma-separated abbreviations or ""


class RuleOut(RuleIn):
    """Rule with server-assigned IDs added."""
    model_config = ConfigDict(from_attributes=True)

    rule_id: str
    ruleset_id: str


class RulesetIn(BaseModel):
    """Body for POST /rulesets."""
    season_id: Optional[str] = None   # UUID or null (evergreen)
    name: str
    description: Optional[str] = None
    parent_ruleset_id: Optional[str] = None
    is_snapshot: bool = False
    rules: list[RuleIn]


class RulesetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ruleset_id: str
    season_id: Optional[str]
    name: str
    description: Optional[str]
    parent_ruleset_id: Optional[str]
    is_snapshot: bool
    feasibility_status: Optional[str] = None
    rules: list[RuleOut]
    created_at: datetime
    created_by: str
