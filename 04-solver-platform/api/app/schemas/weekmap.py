from pydantic import BaseModel, ConfigDict
from typing import Optional


class WeekmapIn(BaseModel):
    """
    Body for POST /weekmap.
    data format: { "CBS Early": [null, "CBS", null, ...], ... }
    One list entry per week; null means no network assigned for that week.
    """
    season: int
    data: dict[str, list[Optional[str]]]


class WeekmapOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    weekmap_id: str
    season_id: str
    data: dict[str, list[Optional[str]]]
