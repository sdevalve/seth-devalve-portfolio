from pydantic import BaseModel, ConfigDict
from datetime import datetime


class NetCatEntryIn(BaseModel):
    slot: str
    operator: str   # "Max" | "Min"
    games: int
    matchups: str   # comma-delimited "AWAY@HOME,..."


class NetCatEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entry_id: str
    net_cats_id: str
    slot: str
    operator: str
    games: int
    matchups: str


class NetCatsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    net_cats_id: str
    season_id: str
    name: str
    is_snapshot: bool
    created_at: datetime
    entries: list[NetCatEntryOut]


class UpsertWorkingCopyBody(BaseModel):
    entries: list[NetCatEntryIn]


class SnapshotBody(BaseModel):
    name: str
