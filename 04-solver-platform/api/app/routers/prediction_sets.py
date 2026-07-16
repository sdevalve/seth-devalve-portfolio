from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.prediction_set import PredictionSet
from app.models.season import Season
from app.schemas.prediction_set import PredictionSetOut

router = APIRouter(prefix="/prediction-sets", tags=["prediction-sets"])


@router.get("/", response_model=list[PredictionSetOut])
def list_prediction_sets(season: int, db: Session = Depends(get_db)):
    """GET /prediction-sets?season=2025"""
    db_season = db.query(Season).filter(Season.year == season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    return (
        db.query(PredictionSet)
        .filter(
            PredictionSet.season_id == db_season.season_id,
            PredictionSet.status == "complete",
        )
        .order_by(PredictionSet.created_at)
        .all()
    )
