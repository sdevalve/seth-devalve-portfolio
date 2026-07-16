from pydantic import BaseModel, ConfigDict
from typing import Any, List, Optional
from datetime import datetime


class SolutionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    solution_id:           str
    run_id:                str
    job_id:                Optional[str]        = None
    incumbent_number:      int
    sol_file_path:         Optional[str]        = None
    objective_value:       Optional[float]      = None
    penalty_score:         Optional[float]      = None   # null until enriched
    ratings_score:         Optional[float]      = None   # null until enriched
    penalty_total:         Optional[float]      = None
    ratings_total:         Optional[float]      = None
    sanity_ok:             Optional[bool]       = None
    optimality_gap:        Optional[float]      = None
    is_final:              bool
    is_perturbation:       bool                 = False
    assignment_changes:    Optional[int]        = None   # sum(t_abs) for Perturbation run_type
    found_at:              datetime
    schedule_records_json: Optional[List[Any]]  = None
    dh_by_week_json:       Optional[dict]        = None
