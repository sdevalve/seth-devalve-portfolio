from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Any

from app.database import get_db
from app.models.season import Season
from app.models.ruleset import Ruleset, Rule
from app.schemas.ruleset import RulesetIn, RulesetOut, RuleIn

router = APIRouter(prefix="/rulesets", tags=["rulesets"])


class UpdateRulesetBody(BaseModel):
    rules: list[RuleIn]
    force_overwrite: bool = False


@router.get("/", response_model=list[RulesetOut])
def list_rulesets(season: int, db: Session = Depends(get_db)):
    """
    GET /rulesets?season=2025
    Returns both:
    - Season-specific rulesets (snapshots saved for this season)
    - Evergreen rulesets (season_id IS NULL — apply to all seasons)
    """
    db_season = db.query(Season).filter(Season.year == season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    return (
        db.query(Ruleset)
        .filter(
            (Ruleset.season_id == db_season.season_id) | (Ruleset.season_id == None)  # noqa: E711
        )
        .all()
    )


@router.post("/", response_model=RulesetOut, status_code=201)
def create_ruleset(body: RulesetIn, db: Session = Depends(get_db)):
    """
    POST /rulesets
    Creates a new ruleset with all its rules in one transaction.
    If season_id is provided it must be a valid UUID that exists in the DB.
    Snapshot names must be unique per season; evergreen names must be unique globally.
    """
    if body.season_id:
        exists = db.query(Season).filter(Season.season_id == body.season_id).first()
        if not exists:
            raise HTTPException(status_code=404, detail="Season not found")

    # Name uniqueness check for snapshots and evergreens
    if body.is_snapshot:
        if body.season_id:
            # Season-specific snapshot: unique name per season
            clash = (
                db.query(Ruleset)
                .filter(
                    Ruleset.season_id == body.season_id,
                    Ruleset.is_snapshot == True,  # noqa: E712
                    Ruleset.name == body.name,
                )
                .first()
            )
            if clash:
                raise HTTPException(
                    status_code=409, detail=f"A snapshot named '{body.name}' already exists for this season."
                )
        else:
            # Evergreen: unique name among all evergreens
            clash = (
                db.query(Ruleset)
                .filter(
                    Ruleset.season_id == None,  # noqa: E711
                    Ruleset.name == body.name,
                )
                .first()
            )
            if clash:
                raise HTTPException(
                    status_code=409, detail=f"An evergreen ruleset named '{body.name}' already exists."
                )

    ruleset = Ruleset(
        season_id=body.season_id,
        name=body.name,
        description=body.description,
        parent_ruleset_id=body.parent_ruleset_id,
        is_snapshot=body.is_snapshot,
    )
    db.add(ruleset)
    db.flush()  # write ruleset to DB so we get its PK before adding rules

    rules = [
        Rule(
            ruleset_id=ruleset.ruleset_id,
            active=r.active,
            operator=r.operator,
            games=r.games,
            weeks=str(r.weeks) if r.weeks is not None else None,
            week_start=str(r.week_start) if r.week_start is not None else None,
            week_end=str(r.week_end) if r.week_end is not None else None,
            slot=r.slot,
            penalty=r.penalty,
            constraint_type=r.constraint_type,
            hard=r.hard,
            penalty_cap=r.penalty_cap,
            comment=r.comment,
            slack_bound=r.slack_bound,
            ti=r.ti,
            teams=r.teams,
        )
        for r in body.rules
    ]
    db.add_all(rules)
    db.commit()
    db.refresh(ruleset)
    return ruleset


@router.put("/{ruleset_id}", response_model=RulesetOut)
def update_ruleset_rules(ruleset_id: str, body: UpdateRulesetBody, db: Session = Depends(get_db)):
    """
    PUT /rulesets/{ruleset_id}
    Replaces all rules for a working copy (is_snapshot=False).
    Snapshots are immutable and cannot be updated.
    """
    ruleset = db.query(Ruleset).filter(Ruleset.ruleset_id == ruleset_id).first()
    if not ruleset:
        raise HTTPException(status_code=404, detail="Ruleset not found")
    if ruleset.is_snapshot:
        if body.force_overwrite and ruleset.feasibility_status != "feasible":
            pass  # allowed — never run (NULL) or infeasible; no solutions exist
        else:
            raise HTTPException(status_code=400, detail="Cannot modify an immutable snapshot")

    # Delete existing rules and replace
    db.query(Rule).filter(Rule.ruleset_id == ruleset_id).delete()

    new_rules = [
        Rule(
            ruleset_id=ruleset_id,
            active=r.active,
            operator=r.operator,
            games=r.games,
            weeks=str(r.weeks) if r.weeks is not None else None,
            week_start=str(r.week_start) if r.week_start is not None else None,
            week_end=str(r.week_end) if r.week_end is not None else None,
            slot=r.slot,
            penalty=r.penalty,
            constraint_type=r.constraint_type,
            hard=r.hard,
            penalty_cap=r.penalty_cap,
            comment=r.comment,
            slack_bound=r.slack_bound,
            ti=r.ti,
            teams=r.teams,
        )
        for r in body.rules
    ]
    db.add_all(new_rules)
    if ruleset.is_snapshot:
        ruleset.feasibility_status = None  # rules changed; status unknown again
    db.commit()
    db.refresh(ruleset)
    return ruleset
