from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.mock_solver_config import MockSolverConfig
from app.schemas.mock_solver_config import MockSolverConfigIn, MockSolverConfigOut

router = APIRouter(prefix="/mock-solver-config", tags=["mock-solver-config"])


def _get_or_create(db: Session) -> MockSolverConfig:
    cfg = db.query(MockSolverConfig).filter_by(id=1).first()
    if not cfg:
        cfg = MockSolverConfig(id=1)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/", response_model=MockSolverConfigOut)
def get_config(db: Session = Depends(get_db)):
    return _get_or_create(db)


@router.put("/", response_model=MockSolverConfigOut)
def update_config(body: MockSolverConfigIn, db: Session = Depends(get_db)):
    cfg = _get_or_create(db)
    cfg.penalty_only_multiplier    = body.penalty_only_multiplier
    cfg.penalty_only_max_gap       = body.penalty_only_max_gap
    cfg.multi_objective_multiplier = body.multi_objective_multiplier
    cfg.multi_objective_max_gap    = body.multi_objective_max_gap
    db.commit()
    db.refresh(cfg)
    return cfg
