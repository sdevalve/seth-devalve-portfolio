import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.season import Season
from app.models.net_cats import NetCats, NetCatEntry
from app.schemas.net_cats import NetCatsOut, UpsertWorkingCopyBody, SnapshotBody

router = APIRouter(prefix="/net-cats", tags=["net-cats"])

_WORKING_COPY_NAME = "__working_copy__"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_season(year: int, db: Session) -> Season:
    season = db.query(Season).filter(Season.year == year).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return season


def _get_working_copy(season_id: str, db: Session) -> NetCats | None:
    return (
        db.query(NetCats)
        .filter(NetCats.season_id == season_id, NetCats.is_snapshot == False)  # noqa: E712
        .first()
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

class PopularityBody(BaseModel):
    scores: dict[str, float]


@router.get("/popularity")
def get_popularity(season: int, db: Session = Depends(get_db)):
    """GET /net-cats/popularity?season=2025 — returns saved team popularity scores."""
    db_season = _get_season(season, db)
    wc = _get_working_copy(db_season.season_id, db)
    if wc is None or wc.team_popularity_json is None:
        return {"scores": {}}
    try:
        return {"scores": json.loads(wc.team_popularity_json)}
    except (ValueError, TypeError):
        return {"scores": {}}


@router.put("/popularity")
def save_popularity(season: int, body: PopularityBody, db: Session = Depends(get_db)):
    """PUT /net-cats/popularity?season=2025 — persist team popularity scores."""
    db_season = _get_season(season, db)
    wc = _get_working_copy(db_season.season_id, db)
    if wc is None:
        wc = NetCats(
            season_id=db_season.season_id,
            name=_WORKING_COPY_NAME,
            is_snapshot=False,
        )
        db.add(wc)
        db.flush()
    wc.team_popularity_json = json.dumps(body.scores)
    db.commit()
    return {"scores": body.scores}


@router.get("/", response_model=list[NetCatsOut])
def list_net_cats(season: int, db: Session = Depends(get_db)):
    """GET /net-cats?season=2025 — returns working copy + all snapshots for the season."""
    db_season = _get_season(season, db)
    return (
        db.query(NetCats)
        .filter(NetCats.season_id == db_season.season_id)
        .all()
    )


@router.put("/working-copy", response_model=NetCatsOut)
def upsert_working_copy(season: int, body: UpsertWorkingCopyBody, db: Session = Depends(get_db)):
    """
    PUT /net-cats/working-copy?season=2025
    Creates the working copy if it does not exist, then replaces all entries.
    Auto-save endpoint — called after every add / edit / delete.
    """
    db_season = _get_season(season, db)
    wc = _get_working_copy(db_season.season_id, db)

    if wc is None:
        wc = NetCats(
            season_id=db_season.season_id,
            name=_WORKING_COPY_NAME,
            is_snapshot=False,
        )
        db.add(wc)
        db.flush()

    # Replace all entries
    db.query(NetCatEntry).filter(NetCatEntry.net_cats_id == wc.net_cats_id).delete()
    db.add_all([
        NetCatEntry(
            net_cats_id=wc.net_cats_id,
            slot=e.slot,
            operator=e.operator,
            games=e.games,
            matchups=e.matchups,
        )
        for e in body.entries
    ])
    db.commit()
    db.refresh(wc)
    return wc


@router.post("/{net_cats_id}/snapshot", response_model=NetCatsOut, status_code=201)
def create_snapshot(net_cats_id: str, body: SnapshotBody, db: Session = Depends(get_db)):
    """
    POST /net-cats/{id}/snapshot
    Freezes a named immutable copy of a working copy's current entries.
    Name must be unique among snapshots for this season.
    """
    source = db.query(NetCats).filter(NetCats.net_cats_id == net_cats_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="NetCats not found")
    if source.is_snapshot:
        raise HTTPException(status_code=400, detail="Source is already a snapshot")

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Snapshot name cannot be blank")

    clash = (
        db.query(NetCats)
        .filter(
            NetCats.season_id == source.season_id,
            NetCats.is_snapshot == True,  # noqa: E712
            NetCats.name == name,
        )
        .first()
    )
    if clash:
        raise HTTPException(
            status_code=409,
            detail=f"A snapshot named '{name}' already exists for this season.",
        )

    snapshot = NetCats(
        season_id=source.season_id,
        name=name,
        is_snapshot=True,
    )
    db.add(snapshot)
    db.flush()

    db.add_all([
        NetCatEntry(
            net_cats_id=snapshot.net_cats_id,
            slot=e.slot,
            operator=e.operator,
            games=e.games,
            matchups=e.matchups,
        )
        for e in source.entries
    ])
    db.commit()
    db.refresh(snapshot)
    return snapshot


@router.delete("/{net_cats_id}", status_code=204)
def delete_net_cats(net_cats_id: str, db: Session = Depends(get_db)):
    """
    DELETE /net-cats/{id}
    Deletes a snapshot. Working copies cannot be deleted this way.
    """
    record = db.query(NetCats).filter(NetCats.net_cats_id == net_cats_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="NetCats not found")
    if not record.is_snapshot:
        raise HTTPException(status_code=400, detail="Cannot delete a working copy")

    db.delete(record)
    db.commit()
