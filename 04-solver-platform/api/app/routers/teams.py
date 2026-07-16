from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.season import Season
from app.models.team import Team
from app.schemas.team import TeamsBulkIn, TeamOut

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("/", response_model=list[TeamOut])
def list_teams(season: int, db: Session = Depends(get_db)):
    """
    GET /teams?season=2025
    Returns all teams for the given season year.
    """
    db_season = db.query(Season).filter(Season.year == season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    return db.query(Team).filter(Team.season_id == db_season.season_id).all()


@router.post("/bulk", response_model=list[TeamOut])
def save_teams(body: TeamsBulkIn, db: Session = Depends(get_db)):
    """
    POST /teams/bulk
    Replaces all teams for a season in one operation.
    Deleting first then re-inserting is simpler than diffing and is safe
    because teams are re-created every time the user saves the grid.
    """
    db_season = db.query(Season).filter(Season.year == body.season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    # Delete existing teams for this season before inserting the new set.
    db.query(Team).filter(Team.season_id == db_season.season_id).delete()

    new_teams = [
        Team(
            season_id=db_season.season_id,
            abbreviation=t.abbreviation,
            city=t.city,
            mascot=t.mascot,
            tv_code=t.tv_code,
            conference=t.conference,
            division=t.division,
            timezone=t.timezone,
        )
        for t in body.teams
    ]

    db.add_all(new_teams)
    db.commit()

    return db.query(Team).filter(Team.season_id == db_season.season_id).all()
