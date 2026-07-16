"""
Mock solver — replays pre-computed solutions from a template run.

Replaces build_and_solve_model() from the proprietary solver.
Reads timing configuration from the mock_solver_config table (editable
via SolverConfigPage) so a portfolio reviewer can change replay speed.

Template run IDs:
    PenaltyOnly:    f995f4be-47ba-4a35-9325-b3da61f0c30b  (112 solutions)
    MultiObjective: 6872f886-b6f6-4a99-b56d-13c8ea5f47d5  (420 solutions)

Sleep logic per solution:
    gap = found_at[i] - found_at[i-1]   (real elapsed time between incumbents)
    sleep_time = min(gap.total_seconds() * TIME_MULTIPLE, MAX_GAP_SECONDS)

This preserves the shape of the real solve — early incumbents arrive quickly,
later ones arrive farther apart — while compressing total replay time.
"""

import logging
import threading
from datetime import datetime
from typing import Callable

from sqlalchemy.orm import Session, sessionmaker

from app.database import engine
from app.models.solution import Solution

logger = logging.getLogger(__name__)

TEMPLATE_RUN_IDS = {
    "PenaltyOnly":    "767ba9c5-edd7-4f56-8c86-8aa92def8e6e",  # Apr19_2 — monotonic
    "MultiObjective": "6872f886-b6f6-4a99-b56d-13c8ea5f47d5",
}


def mock_solve(
    run_id: str,
    run_type: str,
    db: Session,
    publish_fn: Callable[[str, dict], None],
    stop_event: threading.Event,
) -> None:
    """
    Replay template solutions into a new run.

    Args:
        run_id:     The run being executed (new Solution rows written here).
        run_type:   "PenaltyOnly" or "MultiObjective" — selects template + timing.
        db:         SQLAlchemy session for the current run's writes.
        publish_fn: publish_fn(event, payload) — sends to Redis pub/sub.
        stop_event: Set by the cancel flow; mock_solve exits cleanly when set.
    """
    from app.models.mock_solver_config import MockSolverConfig

    cfg = db.query(MockSolverConfig).filter_by(id=1).first()
    if run_type == "MultiObjective":
        multiplier = cfg.multi_objective_multiplier if cfg else 0.05
        max_gap    = cfg.multi_objective_max_gap    if cfg else 15.0
    else:
        multiplier = cfg.penalty_only_multiplier if cfg else 0.15
        max_gap    = cfg.penalty_only_max_gap    if cfg else 15.0

    template_id = TEMPLATE_RUN_IDS.get(run_type, TEMPLATE_RUN_IDS["PenaltyOnly"])

    # Use a separate session to read template rows so writes to db stay isolated.
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    tdb = SessionLocal()
    try:
        templates = (
            tdb.query(Solution)
            .filter(
                Solution.run_id == template_id,
                Solution.is_perturbation == False,      # noqa: E712
                Solution.schedule_records_json != None,  # noqa: E711
            )
            .order_by(Solution.incumbent_number)
            .all()
        )

        if not templates:
            logger.warning("mock_solve: no template solutions found for run_type=%s", run_type)
            return

        for i, tmpl in enumerate(templates):
            if stop_event.is_set():
                return

            if i > 0:
                prev_ts = templates[i - 1].found_at
                curr_ts = tmpl.found_at
                if prev_ts and curr_ts:
                    gap_s = (curr_ts - prev_ts).total_seconds()
                    sleep_s = min(max(gap_s, 0) * multiplier, max_gap)
                    stop_event.wait(timeout=sleep_s)
                    if stop_event.is_set():
                        return

            sol = Solution(
                run_id=run_id,
                # Renumber sequentially (1..N) so the displayed incumbent number
                # matches the replayed solution count. The source template can
                # skip numbers (incumbents without a stored schedule are filtered
                # out above), which would otherwise leave gaps.
                incumbent_number=i + 1,
                sol_file_path=None,
                objective_value=tmpl.objective_value,
                penalty_total=tmpl.penalty_total,
                ratings_total=tmpl.ratings_total,
                sanity_ok=tmpl.sanity_ok,
                schedule_records_json=tmpl.schedule_records_json,
                dh_by_week_json=tmpl.dh_by_week_json,
                is_perturbation=False,
                found_at=datetime.utcnow(),
            )
            db.add(sol)
            db.commit()
            db.refresh(sol)

            publish_fn("incumbent", {
                "incumbent_num": sol.incumbent_number,
                "obj_value":     sol.objective_value,
                "solution_id":   sol.solution_id,
                "penalty_total": sol.penalty_total,
                "ratings_total": sol.ratings_total,
                "sanity_ok":     sol.sanity_ok,
                "assignment_changes": None,
            })

    finally:
        tdb.close()
