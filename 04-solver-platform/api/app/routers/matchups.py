from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.season import Season
from app.models.matchup import Matchup
from app.schemas.matchup import MatchupsBulkIn, MatchupOut

router = APIRouter(prefix="/matchups", tags=["matchups"])


@router.get("/", response_model=list[MatchupOut])
def list_matchups(season: int, db: Session = Depends(get_db)):
    """GET /matchups?season=2025"""
    db_season = db.query(Season).filter(Season.year == season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    return db.query(Matchup).filter(Matchup.season_id == db_season.season_id).all()


@router.post("/bulk", response_model=list[MatchupOut])
def save_matchups(body: MatchupsBulkIn, db: Session = Depends(get_db)):
    """
    POST /matchups/bulk
    Replaces all matchups for a season. Same delete-then-insert pattern
    as the teams endpoint.
    """
    db_season = db.query(Season).filter(Season.year == body.season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    db.query(Matchup).filter(Matchup.season_id == db_season.season_id).delete()

    new_matchups = [
        Matchup(
            season_id=db_season.season_id,
            away_team=m.away_team,
            home_team=m.home_team,
        )
        for m in body.matchups
    ]

    db.add_all(new_matchups)
    db.commit()

    return db.query(Matchup).filter(Matchup.season_id == db_season.season_id).all()
