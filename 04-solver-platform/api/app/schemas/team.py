from pydantic import BaseModel, ConfigDict
from typing import Literal


class TeamPayload(BaseModel):
    """One team row — the fields the user fills in the Teams grid."""
    abbreviation: str
    city: str
    mascot: str
    tv_code: str
    conference: Literal["AFC", "NFC"]
    division: str  # e.g. "West", "North", "East", "South"
    timezone: int = 0  # 0=Eastern, 1=Central, 2=Mountain, 3=Pacific


class TeamsBulkIn(BaseModel):
    """
    Body for POST /teams/bulk.
    'season' is the year number (the Zustand store value).
    The API looks up the season UUID internally.
    """
    season: int
    teams: list[TeamPayload]


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    team_id: str
    season_id: str
    abbreviation: str
    city: str
    mascot: str
    tv_code: str
    conference: str
    division: str
    timezone: int
