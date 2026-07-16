from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.fixed_game_set import FixedGameSet
from app.models.season import Season
from app.schemas.fixed_game_set import FixedGameSetCreate, FixedGameSetOut

router = APIRouter(prefix="/fixed-gamesets", tags=["fixed-gamesets"])


@router.get("/", response_model=list[FixedGameSetOut])
def list_fixed_game_sets(season: int, db: Session = Depends(get_db)):
    db_season = db.query(Season).filter(Season.year == season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")
    return (
        db.query(FixedGameSet)
        .filter(FixedGameSet.season_id == db_season.season_id)
        .order_by(FixedGameSet.created_at.desc())
        .all()
    )


@router.post("/", response_model=FixedGameSetOut, status_code=201)
def create_fixed_game_set(body: FixedGameSetCreate, db: Session = Depends(get_db)):
    db_season = db.query(Season).filter(Season.year == int(body.season)).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")
    fgs = FixedGameSet(
        season_id=db_season.season_id,
        name=body.name,
        source_solution_id=body.source_solution_id,
        games=[g.model_dump() for g in body.games],
    )
    db.add(fgs)
    db.commit()
    db.refresh(fgs)
    return fgs


@router.delete("/{fixed_game_set_id}", status_code=204)
def delete_fixed_game_set(fixed_game_set_id: str, db: Session = Depends(get_db)):
    fgs = db.query(FixedGameSet).filter(FixedGameSet.fixed_game_set_id == fixed_game_set_id).first()
    if not fgs:
        raise HTTPException(status_code=404, detail="Fixed game set not found")
    db.delete(fgs)
    db.commit()
