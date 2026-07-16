from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.database import get_db
from app.models.season import Season
from app.models.ml_futures import MLFutures
from app.schemas.ml_futures import MLFuturesIn, MLFuturesOut

router = APIRouter(prefix="/ml-futures", tags=["ml-futures"])


@router.get("/", response_model=MLFuturesOut)
def get_futures(season: int, db: Session = Depends(get_db)):
    """GET /ml-futures?season=2025 — returns saved futures, or 404 if none."""
    db_season = db.query(Season).filter(Season.year == season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    record = db.query(MLFutures).filter(MLFutures.season_id == db_season.season_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="No futures data for this season")
    return record


@router.post("/", response_model=MLFuturesOut)
def save_futures(body: MLFuturesIn, db: Session = Depends(get_db)):
    """
    POST /ml-futures
    Upserts futures data for a season (create or update existing).
    """
    db_season = db.query(Season).filter(Season.year == body.season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    record = db.query(MLFutures).filter(MLFutures.season_id == db_season.season_id).first()
    if record:
        record.playoffs = body.playoffs
        record.wintotals = body.wintotals
        record.division_odds = body.division_odds
        record.conference_odds = body.conference_odds
        record.superbowl_odds = body.superbowl_odds
        record.updated_at = datetime.now(timezone.utc)
    else:
        record = MLFutures(
            season_id=db_season.season_id,
            playoffs=body.playoffs,
            wintotals=body.wintotals,
            division_odds=body.division_odds,
            conference_odds=body.conference_odds,
            superbowl_odds=body.superbowl_odds,
        )
        db.add(record)

    db.commit()
    db.refresh(record)
    return record
