from pydantic import BaseModel, ConfigDict


class MLRematchRow(BaseModel):
    away_team: str
    home_team: str


class MLRematchIn(BaseModel):
    """Body for POST /ml-rematches — replaces all rematches for a season."""
    season: int
    rematches: list[MLRematchRow]


class MLRematchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rematch_id: str
    season_id: str
    away_team: str
    home_team: str
