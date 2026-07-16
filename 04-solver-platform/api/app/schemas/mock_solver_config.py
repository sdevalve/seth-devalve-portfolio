from pydantic import BaseModel


class MockSolverConfigOut(BaseModel):
    id:                         int
    penalty_only_multiplier:    float
    penalty_only_max_gap:       float
    multi_objective_multiplier: float
    multi_objective_max_gap:    float

    model_config = {"from_attributes": True}


class MockSolverConfigIn(BaseModel):
    penalty_only_multiplier:    float
    penalty_only_max_gap:       float
    multi_objective_multiplier: float
    multi_objective_max_gap:    float
