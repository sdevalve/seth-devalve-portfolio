from pydantic import BaseModel, ConfigDict


class MatchupPayload(BaseModel):
    """One matchup row — away and home team mascot names."""
    away_team: str
    home_team: str


class MatchupsBulkIn(BaseModel):
    """Body for POST /matchups/bulk."""
    season: int
    matchups: list[MatchupPayload]


class MatchupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    matchup_id: str
    season_id: str
    away_team: str
    home_team: str
