from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.season import Season
from app.models.weekmap import Weekmap
from app.schemas.weekmap import WeekmapIn, WeekmapOut

router = APIRouter(prefix="/weekmap", tags=["weekmap"])


@router.get("/", response_model=WeekmapOut)
def get_weekmap(season: int, db: Session = Depends(get_db)):
    """GET /weekmap?season=2025"""
    db_season = db.query(Season).filter(Season.year == season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    wm = db.query(Weekmap).filter(Weekmap.season_id == db_season.season_id).first()
    if not wm:
        raise HTTPException(status_code=404, detail="Weekmap not found")
    return wm


@router.post("/", response_model=WeekmapOut)
def save_weekmap(body: WeekmapIn, db: Session = Depends(get_db)):
    """
    POST /weekmap
    Upserts the weekmap for a season (create if none exists, update if it does).
    """
    db_season = db.query(Season).filter(Season.year == body.season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    wm = db.query(Weekmap).filter(Weekmap.season_id == db_season.season_id).first()

    if wm:
        wm.data = body.data
    else:
        wm = Weekmap(season_id=db_season.season_id, data=body.data)
        db.add(wm)

    db.commit()
    db.refresh(wm)
    return wm
