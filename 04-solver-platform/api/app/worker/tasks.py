"""
Celery task definitions — portfolio (async-solver-platform) version.

dispatch_run(run_id) is the sole public task.

Lifecycle published to Redis pub/sub (channel: run:{run_id}):
    queued → building → solving → complete | failed | stopped

The mock solver (mock_solver.py) replays pre-computed solutions from the DB,
publishing 'incumbent' events directly — no .sol files required.

# ── Real system: solution file watcher (not used in portfolio) ────────────────
#
# In the full system, a daemon thread watches the solver output directory for
# new .sol files that Gurobi writes as better solutions are found:
#
#   watcher_thread = threading.Thread(
#       target=_solution_watcher,
#       args=(run_id, config.solution_path, stop_event, run.run_type),
#       daemon=True,
#   )
#   watcher_thread.start()
#
# _solution_watcher polls solution_path/**/*.sol every 5 seconds.
# For each new file it:
#   1. Creates a Solution DB row (run_id, incumbent_number, sol_file_path, ...)
#   2. Calls compute_metrics() — decodes the 1-D assignment vector from a
#      NumPy .npz file into schedule_records_json, penalty_total, ratings_total
#   3. Publishes an 'incumbent' event to Redis so RunDetailPage live-updates
#
# The mock solver collapses this entire chain into direct DB writes +
# Redis publishes, reading pre-computed metrics from the template run.
# ─────────────────────────────────────────────────────────────────────────────
"""

import json
import logging
import os
import threading
import time

from sqlalchemy.orm import Session, sessionmaker

from app.database import engine
from app.models.run import Run
from app.worker.celery_app import celery_app
from app.worker.mock_solver import mock_solve

logger = logging.getLogger(__name__)

_REDIS_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        import redis
        _redis_client = redis.from_url(_REDIS_URL, decode_responses=True)
    return _redis_client


def _set_run_status(run_id: str, db: Session, status: str) -> None:
    run = db.query(Run).filter(Run.run_id == run_id).first()
    if run:
        run.status = status
        db.commit()


def _publish(run_id: str, event: str, payload: dict) -> None:
    try:
        _get_redis().publish(f"run:{run_id}", json.dumps({"event": event, **payload}))
    except Exception:
        logger.warning("Redis publish failed for run %s", run_id)


@celery_app.task(bind=True, name="dispatch_run", acks_late=True, task_reject_on_worker_lost=True)
def dispatch_run(self, run_id: str) -> None:
    """
    Main Celery task — executes one schedule optimization run (mock version).

    Status transitions (DB + Redis pub/sub):
        queued → building → solving → complete | failed | stopped
    """
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    stop_event = threading.Event()

    try:
        run = db.query(Run).filter(Run.run_id == run_id).first()
        if not run:
            logger.error("dispatch_run: run %s not found", run_id)
            return

        run.celery_task_id = self.request.id
        db.commit()

        _set_run_status(run_id, db, "building")
        _publish(run_id, "status", {"status": "building"})

        time.sleep(2)

        _set_run_status(run_id, db, "solving")
        _publish(run_id, "status", {"status": "solving"})

        mock_solve(
            run_id=run_id,
            run_type=run.run_type,
            db=db,
            publish_fn=lambda event, payload: _publish(run_id, event, payload),
            stop_event=stop_event,
        )

        db.refresh(run)
        if run.status not in ("stopped", "failed"):
            _set_run_status(run_id, db, "complete")
            _publish(run_id, "complete", {"status": "complete"})

    except Exception:
        logger.exception("dispatch_run failed for run %s", run_id)
        try:
            _set_run_status(run_id, db, "failed")
            _publish(run_id, "failed", {"status": "failed"})
        except Exception:
            pass
        raise

    finally:
        stop_event.set()
        db.close()
