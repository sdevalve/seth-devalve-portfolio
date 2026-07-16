from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.season import Season
from app.models.ml_rematch import MLRematch
from app.schemas.ml_rematch import MLRematchIn, MLRematchOut

router = APIRouter(prefix="/ml-rematches", tags=["ml-rematches"])


@router.get("/", response_model=list[MLRematchOut])
def get_rematches(season: int, db: Session = Depends(get_db)):
    """GET /ml-rematches?season=2025 — returns all saved rematches for that season."""
    db_season = db.query(Season).filter(Season.year == season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    return (
        db.query(MLRematch)
        .filter(MLRematch.season_id == db_season.season_id)
        .all()
    )


@router.post("/", response_model=list[MLRematchOut])
def save_rematches(body: MLRematchIn, db: Session = Depends(get_db)):
    """
    POST /ml-rematches
    Bulk-replaces all rematches for a season (delete-all + insert).
    Validation that each pair is a real matchup is done on the frontend.
    """
    db_season = db.query(Season).filter(Season.year == body.season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    db.query(MLRematch).filter(MLRematch.season_id == db_season.season_id).delete()

    new_rematches = [
        MLRematch(
            season_id=db_season.season_id,
            away_team=r.away_team,
            home_team=r.home_team,
        )
        for r in body.rematches
    ]
    db.add_all(new_rematches)
    db.commit()

    return (
        db.query(MLRematch)
        .filter(MLRematch.season_id == db_season.season_id)
        .all()
    )
