from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.season import Season
from app.models.color_policy import ColorPolicy
from app.schemas.color_policy import ColorPolicyOut, ColorPolicyUpdate

router = APIRouter(prefix="/color-policy", tags=["color-policy"])


def _get_or_create(season_year: int, db: Session) -> ColorPolicy:
    """Return the ColorPolicy for this season, creating an empty one on first access."""
    season = db.query(Season).filter(Season.year == season_year).first()
    if season is None:
        raise HTTPException(status_code=404, detail=f"Season {season_year} not found")

    row = db.query(ColorPolicy).filter(ColorPolicy.season_id == season.season_id).first()
    if row is None:
        row = ColorPolicy(
            season_id=season.season_id,
            slot_colors={},
            palette=[],
            tod_formats={
                "morning":       None,
                "afternoon":     None,
                "mid-afternoon": None,
                "evening":       None,
            },
            dh_format=None,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/", response_model=ColorPolicyOut)
def get_color_policy(season: int, db: Session = Depends(get_db)):
    """GET /color-policy?season=2025 — returns saved policy; auto-creates empty one on first access."""
    return _get_or_create(season, db)


@router.put("/", response_model=ColorPolicyOut)
def update_color_policy(season: int, body: ColorPolicyUpdate, db: Session = Depends(get_db)):
    """PUT /color-policy?season=2025 — upserts all supplied fields."""
    row = _get_or_create(season, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row
