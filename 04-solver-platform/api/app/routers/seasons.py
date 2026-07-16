from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.season import Season
from app.models.team import Team
from app.models.matchup import Matchup
from app.models.weekmap import Weekmap
from app.models.ruleset import Ruleset
from app.models.run import Run
from app.schemas.season import SeasonCreate, SeasonUpdate, SeasonOut, SeasonProgress

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("/", response_model=list[SeasonOut])
def list_seasons(db: Session = Depends(get_db)):
    """Return all seasons ordered newest first."""
    return db.query(Season).order_by(Season.year.desc()).all()


@router.post("/", response_model=SeasonOut, status_code=201)
def create_season(body: SeasonCreate, db: Session = Depends(get_db)):
    """
    Create a new season from a year number.
    Returns 409 if the year already exists so the frontend can show
    the 'already exists' alert without needing a separate check call.
    """
    existing = db.query(Season).filter(Season.year == body.year).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Season {body.year} already exists")

    season = Season(year=body.year)
    db.add(season)
    db.commit()
    db.refresh(season)
    return season


# IMPORTANT: define /{year}/progress BEFORE /{year} so FastAPI
# doesn't accidentally try to parse "progress" as an integer.
@router.get("/{year}/progress", response_model=SeasonProgress)
def get_progress(year: int, db: Session = Depends(get_db)):
    """
    Check how many of the 6 workflow steps are complete for a season.
    The home page renders a green/grey badge next to each step link.
    """
    season = db.query(Season).filter(Season.year == year).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    sid = season.season_id

    has_teams = db.query(Team).filter(Team.season_id == sid).count() > 0
    has_matchups = db.query(Matchup).filter(Matchup.season_id == sid).count() > 0
    has_weekmap = db.query(Weekmap).filter(Weekmap.season_id == sid).first() is not None
    has_ruleset_snapshot = (
        db.query(Ruleset)
        .filter(Ruleset.season_id == sid, Ruleset.is_snapshot == True)  # noqa: E712
        .count() > 0
    )
    has_run = db.query(Run).filter(Run.season_id == sid).count() > 0

    # Season settings: true as soon as basic fields exist (always true after creation).
    settings_done = bool(season.num_weeks)
    # Slots & Networks: true once the user has saved at least one slot and one network.
    slots_networks_done = bool(season.slots and season.networks)

    return SeasonProgress(
        season_settings=settings_done,
        teams=has_teams,
        matchups=has_matchups,
        slots_networks=slots_networks_done,
        slots_weekmap=has_weekmap,
        ruleset=has_ruleset_snapshot,
        run=has_run,
    )


@router.get("/{year}", response_model=SeasonOut)
def get_season(year: int, db: Session = Depends(get_db)):
    """Fetch a season by its year number (e.g. GET /seasons/2025)."""
    season = db.query(Season).filter(Season.year == year).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return season


@router.put("/{season_id}", response_model=SeasonOut)
def update_season(season_id: str, body: SeasonUpdate, db: Session = Depends(get_db)):
    """
    Update season settings by UUID.
    Only fields present in the request body are changed (partial update).
    """
    season = db.query(Season).filter(Season.season_id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(season, field, value)

    db.commit()
    db.refresh(season)
    return season
