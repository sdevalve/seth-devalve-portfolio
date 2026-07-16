from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime


class FixedGameIn(BaseModel):
    week: int
    home_abbr: str
    away_abbr: str
    slot: Optional[str] = None
    tod: Optional[int] = None


class FixedGameSetCreate(BaseModel):
    season: Any                          # int year sent by frontend (resolved to season_id)
    name: str
    source_solution_id: Optional[str] = None
    games: List[FixedGameIn]


class FixedGameSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    fixed_game_set_id: str
    season_id: str
    name: str
    source_solution_id: Optional[str] = None
    ruleset_id: Optional[str] = None
    run_id: Optional[str] = None
    games: List[Any]
    created_at: datetime
    created_by: str
