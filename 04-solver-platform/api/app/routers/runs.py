import json
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.fixed_game_set import FixedGameSet
from app.models.net_cats import NetCats
from app.models.prediction_set import PredictionSet
from app.models.ruleset import Ruleset
from app.models.season import Season
from app.models.run import Run
from app.schemas.run import RunCreate, RunOut
from app.worker.celery_app import celery_app
from app.worker.tasks import dispatch_run

router = APIRouter(prefix="/runs", tags=["runs"])

_REDIS_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")


def _build_run_params(body: RunCreate, db: Session) -> dict:
    """Snapshot run configuration at launch time for historical reproducibility."""
    ruleset = db.query(Ruleset).filter(Ruleset.ruleset_id == body.ruleset_id).first()

    fixed_game_set_name = None
    if body.fixed_game_set_id:
        fgs = db.query(FixedGameSet).filter(
            FixedGameSet.fixed_game_set_id == body.fixed_game_set_id
        ).first()
        fixed_game_set_name = fgs.name if fgs else None

    net_cats_name = None
    if body.net_cats_id:
        nc = db.query(NetCats).filter(NetCats.net_cats_id == body.net_cats_id).first()
        net_cats_name = nc.name if nc else None

    prediction_set_name = None
    if body.prediction_set_id:
        ps = db.query(PredictionSet).filter(
            PredictionSet.prediction_set_id == body.prediction_set_id
        ).first()
        prediction_set_name = ps.name if ps else None

    return {
        "run_type":            body.run_type,
        "scope":               body.scope,
        "ruleset_name":        ruleset.name if ruleset else None,
        "net_cats_name":       net_cats_name,
        "prediction_set_name": prediction_set_name,
        "fixed_game_set_name": fixed_game_set_name,
        "comments":            body.comments or None,
    }


@router.get("/", response_model=list[RunOut])
def list_runs(season: int, db: Session = Depends(get_db)):
    """GET /runs?season=2025 — list all runs for a season."""
    db_season = db.query(Season).filter(Season.year == season).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    return (
        db.query(Run)
        .filter(Run.season_id == db_season.season_id)
        .order_by(Run.created_at.desc())
        .all()
    )


@router.post("/", response_model=RunOut, status_code=201)
def create_run(body: RunCreate, db: Session = Depends(get_db)):
    """
    POST /runs
    Creates the Run record (status=queued), then enqueues a Celery task
    that will build and solve the model.  The Celery task ID is stored on
    the Run row so the cancel endpoint can revoke it.
    """
    year = int(body.season_id)
    db_season = db.query(Season).filter(Season.year == year).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="Season not found")

    if db.query(Run).filter(Run.season_id == db_season.season_id, Run.name == body.name).first():
        raise HTTPException(
            status_code=422,
            detail=f"A run named '{body.name}' already exists for season {year}.",
        )

    run_params = _build_run_params(body, db)

    run = Run(
        season_id=db_season.season_id,
        ruleset_id=body.ruleset_id,
        fixed_game_set_id=body.fixed_game_set_id or None,
        net_cats_id=body.net_cats_id or None,
        name=body.name,
        comments=body.comments or None,
        run_type=body.run_type,
        scope=body.scope,
        status="queued",
        run_params=run_params,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    dispatch_run.delay(run.run_id)

    return run


@router.get("/{run_id}", response_model=RunOut)
def get_run(run_id: str, db: Session = Depends(get_db)):
    """GET /runs/{run_id}"""
    run = db.query(Run).filter(Run.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/{run_id}/stream")
async def stream_run(run_id: str, db: Session = Depends(get_db)):
    """
    GET /runs/{run_id}/stream — Server-Sent Events endpoint.

    1. Immediately emits the current run status from the DB.
    2. Subscribes to the Redis pub/sub channel "run:{run_id}" and forwards
       every message the Celery worker publishes.
    3. Closes automatically when a terminal event arrives.
    """
    run = db.query(Run).filter(Run.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    current_status = run.status

    async def event_generator():
        import redis.asyncio as aioredis

        yield (
            f"event: status\n"
            f"data: {json.dumps({'status': current_status})}\n\n"
        )

        if current_status in ("complete", "failed", "stopped", "infeasible"):
            yield f"event: {current_status}\ndata: {{}}\n\n"
            return

        r = aioredis.from_url(_REDIS_URL, decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(f"run:{run_id}")

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                payload: dict = json.loads(message["data"])
                event = payload.get("event", "status")

                yield f"event: {event}\ndata: {json.dumps(payload)}\n\n"

                if event in ("complete", "failed", "stopped", "infeasible"):
                    break
        finally:
            await pubsub.unsubscribe(f"run:{run_id}")
            await r.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{run_id}/cancel", response_model=RunOut)
def cancel_run(run_id: str, db: Session = Depends(get_db)):
    """
    POST /runs/{run_id}/cancel

    1. Revokes the Celery task (SIGTERM) so the worker stops.
    2. Sets run.status = "stopped" in the DB.
    3. Publishes a "stopped" event to the Redis pub/sub channel.
    """
    run = db.query(Run).filter(Run.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status in ("complete", "failed", "stopped", "infeasible"):
        return run

    if run.celery_task_id:
        celery_app.control.revoke(
            run.celery_task_id,
            terminate=True,
            signal="SIGTERM",
        )

    run.status = "stopped"
    db.commit()
    db.refresh(run)

    try:
        import redis as sync_redis
        r = sync_redis.from_url(_REDIS_URL, decode_responses=True)
        r.publish(
            f"run:{run_id}",
            json.dumps({"event": "stopped", "status": "stopped"}),
        )
        r.setex(f"run:{run_id}:terminate", 3600, "1")
    except Exception:
        pass

    return run


@router.get("/{run_id}/log")
def get_run_log(run_id: str, db: Session = Depends(get_db)):
    """GET /runs/{run_id}/log — always empty in portfolio demo (no Gurobi log files)."""
    run = db.query(Run).filter(Run.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"instances": {"0": []}}
