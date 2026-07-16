from pydantic import BaseModel, ConfigDict
from typing import Optional, Any, Dict
from datetime import datetime


class RunCreate(BaseModel):
    """
    Body for POST /runs.
    season_id is the year number (the frontend's Zustand selected season).
    The API resolves it to a season UUID internally.
    """
    season_id: Any                          # int (year) sent by frontend
    ruleset_id: str
    fixed_game_set_id: Optional[str] = None
    prediction_set_id: Optional[str] = None
    net_cats_id: Optional[str] = None
    name: str
    comments: Optional[str] = None
    run_type: str                           # MultiObjective | PenaltyOnly | Perturbation | PartialMatchups
    scope: str = "Full"                     # Full | PrimeTimeOnly

    # ── Warm start / feasible point (all optional) ───────────────────────────
    warm_start_solution_id:   Optional[str]   = None
    perturbate_if_infeasible: bool            = False
    perturbation_time_limit:  float           = -1.0  # seconds; -1 = no limit

    # ── Advanced solver options ───────────────────────────────────────────────
    skip_feasibility_check: bool = False  # skip LP relaxation screen before EC2 solve


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    run_id: str
    season_id: str         # UUID stored in DB
    ruleset_id: str
    fixed_game_set_id: Optional[str] = None
    prediction_set_id: Optional[str] = None
    net_cats_id: Optional[str] = None
    name: str
    comments: Optional[str] = None
    run_type: str
    scope: str
    status: str
    run_params:    Optional[Dict[str, Any]] = None
    npz_path:      Optional[str]            = None
    error_message: Optional[Dict[str, Any]] = None
    created_at: datetime
    created_by: str
