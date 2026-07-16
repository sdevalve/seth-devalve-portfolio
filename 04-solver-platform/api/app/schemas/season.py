from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class SeasonCreate(BaseModel):
    """Body for POST /seasons — only the year is required to bootstrap a season."""
    year: int


class SeasonUpdate(BaseModel):
    """
    Body for PUT /seasons/{season_id} — all fields optional so the frontend
    can send only the fields it has changed (partial update pattern).
    """
    num_weeks: Optional[int] = None
    num_teams: Optional[int] = None
    num_matchups: Optional[int] = None
    networks: Optional[list[str]] = None
    slots: Optional[list[str]] = None
    new_network_dict: Optional[dict[str, str]] = None
    thanksgiving_week: Optional[int] = None
    christmas_week: Optional[int] = None
    double_dh_weeks: Optional[list[int]] = None
    christmas_day: Optional[str] = None
    bye_start: Optional[int] = None
    bye_end: Optional[int] = None
    num_bye_weeks: Optional[int] = None
    min_weeks_between_byes: Optional[int] = None
    max_byes_per_week: Optional[int] = None
    max_consec_home: Optional[int] = None
    max_consec_away: Optional[int] = None
    tv_ratings_s3_key: Optional[str] = None


class SeasonOut(BaseModel):
    """Full season object returned by the API."""
    model_config = ConfigDict(from_attributes=True)  # lets Pydantic read SQLAlchemy models

    season_id: str
    year: int
    num_weeks: int
    num_teams: int
    num_matchups: int
    networks: list[str]
    slots: list[str]
    new_network_dict: Optional[dict[str, str]] = None
    thanksgiving_week: Optional[int] = None
    christmas_week: Optional[int] = None
    double_dh_weeks: Optional[list[int]] = None
    christmas_day: Optional[str] = None
    bye_start: int
    bye_end: int
    num_bye_weeks: int
    min_weeks_between_byes: int
    max_byes_per_week: int
    max_consec_home: int
    max_consec_away: int
    tv_ratings_s3_key: Optional[str]
    week_labels: Optional[dict] = None
    created_at: datetime
    created_by: str


class SeasonProgress(BaseModel):
    """
    Boolean checklist for the 7-step workflow shown on the home page.
    Each field is True once the user has completed that step.
    """
    season_settings: bool
    teams: bool
    matchups: bool
    slots_networks: bool
    slots_weekmap: bool
    ruleset: bool
    run: bool
