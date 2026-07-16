from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.solution import Solution
from app.schemas.solution import SolutionOut

router = APIRouter(prefix="/solutions", tags=["solutions"])


@router.get("/", response_model=list[SolutionOut])
def list_solutions(run_id: str, db: Session = Depends(get_db)):
    """GET /solutions?run_id=... — list all solutions for a run ordered by incumbent number."""
    return (
        db.query(Solution)
        .filter(Solution.run_id == run_id)
        .order_by(Solution.incumbent_number)
        .all()
    )


@router.get("/{solution_id}", response_model=SolutionOut)
def get_solution(solution_id: str, db: Session = Depends(get_db)):
    """GET /solutions/{solution_id}"""
    solution = db.query(Solution).filter(Solution.solution_id == solution_id).first()
    if not solution:
        raise HTTPException(status_code=404, detail="Solution not found")
    return solution


@router.post("/{solution_id}/export")
def export_solution(solution_id: str):
    """
    Excel export is not available in this portfolio demo.
    In the full system this endpoint calls process_solution() from a proprietary
    schedule analysis module to generate a multi-sheet Excel workbook.
    """
    raise HTTPException(
        status_code=501,
        detail=(
            "Excel export requires the proprietary schedule analysis module "
            "and is not available in this portfolio demo."
        ),
    )
