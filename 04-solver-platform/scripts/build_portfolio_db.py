#!/usr/bin/env python3
"""
Produces the sanitized portfolio nfl.db from the main application DB.

Run from the async-solver-platform/ directory:
    python scripts/build_portfolio_db.py

Input:  ../../api/nfl.db        (main application DB — not modified)
Output: api/nfl.db              (portfolio DB — committed to this repo)
"""

import json
import shutil
import sqlite3
from pathlib import Path

SRC = Path(__file__).parent.parent.parent / "api" / "nfl.db"  # main repo DB
DST = Path(__file__).parent.parent / "api" / "nfl.db"          # portfolio DB

KEEP_RUN_IDS = [
    "f995f4be-47ba-4a35-9325-b3da61f0c30b",  # PenaltyOnly history (non-monotonic, kept for history display)
    "6872f886-b6f6-4a99-b56d-13c8ea5f47d5",  # MultiObjective template
    "f1a28b26-363e-491f-8a09-c87e90d580cc",  # History enrichment
    "767ba9c5-edd7-4f56-8c86-8aa92def8e6e",  # PenaltyOnly template (monotonic — used by mock solver)
]

DROP_TABLES = [
    "gurobi_settings",
    "ml_models",
    "ml_primetime",
    "solver_data_config",  # holds absolute local paths to proprietary source files
]

ANONYMIZED_RULES = [
    {
        "active": 1, "operator": "Max", "games": 2, "weeks": 3,
        "week_start": 1, "week_end": 18, "slot": "AGlobal",
        "penalty": 1000, "constraint_type": "Team/Slot/Week",
        "hard": "", "penalty_cap": 0,
        "comment": "no 3 game road trip", "slack_bound": 0.0, "ti": 0,
        "teams": "ARI,ATL,BAL,BUF,CAR,CHI,CIN,CLE,DAL,DEN,DET,GB,HOU,IND,JAX,KC,LAC,LAR,LV,MIA,MIN,NE,NO,NYG,NYJ,PHI,PIT,SEA,SF,TB,TEN,WSH",
    },
    {
        "active": 1, "operator": "Max", "games": 1, "weeks": 2,
        "week_start": 1, "week_end": 17, "slot": "SNF,MNF",
        "penalty": 1000, "constraint_type": "Team/Slot/Week",
        "hard": "", "penalty_cap": 0,
        "comment": "no monday night football following sunday night football",
        "slack_bound": 0.0, "ti": 0,
        "teams": "ARI,ATL,BAL,BUF,CAR,CHI,CIN,CLE,DAL,DEN,DET,GB,HOU,IND,JAX,KC,LAC,LAR,LV,MIA,MIN,NE,NO,NYG,NYJ,PHI,PIT,SEA,SF,TB,TEN,WSH",
    },
]


def main():
    if not SRC.exists():
        raise FileNotFoundError(f"Source DB not found: {SRC}")

    DST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(SRC, DST)
    print(f"Copied {SRC} -> {DST}")

    conn = sqlite3.connect(DST)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # 1. Drop proprietary tables
    for table in DROP_TABLES:
        cur.execute(f"DROP TABLE IF EXISTS [{table}]")
    print(f"Dropped tables: {DROP_TABLES}")

    # 2. Delete runs not in keep list
    ph = ",".join("?" * len(KEEP_RUN_IDS))
    cur.execute(f"DELETE FROM runs WHERE run_id NOT IN ({ph})", KEEP_RUN_IDS)
    print(f"Pruned runs table (kept {len(KEEP_RUN_IDS)} rows)")

    # 3. Delete solutions not belonging to kept runs
    cur.execute(f"DELETE FROM solutions WHERE run_id NOT IN ({ph})", KEEP_RUN_IDS)
    print("Pruned solutions table")

    # 4. Nullify sol_file_path on all remaining solutions
    cur.execute("UPDATE solutions SET sol_file_path = NULL")

    # 5. Sanitize runs: nullify npz_path, strip gurobi from run_params
    cur.execute("SELECT run_id, run_params FROM runs")
    for row in cur.fetchall():
        params = json.loads(row["run_params"]) if row["run_params"] else {}
        params.pop("gurobi", None)
        cur.execute(
            "UPDATE runs SET npz_path = NULL, run_params = ? WHERE run_id = ?",
            (json.dumps(params), row["run_id"]),
        )
    print("Sanitized run_params and npz_path")

    # 6. Find the ruleset used by template run and replace all its rules
    import uuid
    cur.execute(
        "SELECT ruleset_id, season_id FROM runs WHERE run_id = ?",
        (KEEP_RUN_IDS[0],),
    )
    row = cur.fetchone()
    if row:
        ruleset_id = row["ruleset_id"]
        season_id = row["season_id"]
        # Wipe ALL rules first so orphaned rows from deleted rulesets don't remain.
        cur.execute("DELETE FROM rules")
        cur.execute("DELETE FROM rulesets WHERE ruleset_id != ?", (ruleset_id,))
        for rule in ANONYMIZED_RULES:
            cur.execute(
                """INSERT INTO rules
                   (rule_id, ruleset_id, active, operator, games, weeks, week_start, week_end,
                    slot, penalty, constraint_type, hard, penalty_cap, comment,
                    slack_bound, ti, teams)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    str(uuid.uuid4()),
                    ruleset_id, rule["active"], rule["operator"], rule["games"],
                    rule["weeks"], rule["week_start"], rule["week_end"], rule["slot"],
                    rule["penalty"], rule["constraint_type"], rule["hard"],
                    rule["penalty_cap"], rule["comment"], rule["slack_bound"],
                    rule["ti"], rule["teams"],
                ),
            )
        print(f"Replaced rules for ruleset {ruleset_id} with 2 anonymized rules")

        # Insert a working copy (is_snapshot=0) so the Ruleset page auto-loads
        # rules on mount. The snapshot (Ruleset12p) stays as a named snapshot in
        # the load dropdown; the working copy is what the page populates by default.
        wc_id = str(uuid.uuid4())
        cur.execute(
            """INSERT INTO rulesets
               (ruleset_id, season_id, name, description, parent_ruleset_id,
                is_snapshot, created_at, created_by, feasibility_status)
               VALUES (?, ?, 'Working Copy', NULL, ?, 0,
                       datetime('now'), 'portfolio_build', NULL)""",
            (wc_id, season_id, ruleset_id),
        )
        for rule in ANONYMIZED_RULES:
            cur.execute(
                """INSERT INTO rules
                   (rule_id, ruleset_id, active, operator, games, weeks, week_start, week_end,
                    slot, penalty, constraint_type, hard, penalty_cap, comment,
                    slack_bound, ti, teams)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    str(uuid.uuid4()),
                    wc_id, rule["active"], rule["operator"], rule["games"],
                    rule["weeks"], rule["week_start"], rule["week_end"], rule["slot"],
                    rule["penalty"], rule["constraint_type"], rule["hard"],
                    rule["penalty_cap"], rule["comment"], rule["slack_bound"],
                    rule["ti"], rule["teams"],
                ),
            )
        print(f"Inserted working copy ruleset {wc_id} with 2 rules")

    # 7. Sanitize prediction_sets: delete real rows (contain proprietary file paths),
    #    then seed two synthetic entries so the MultiObjective dropdown is populated.
    cur.execute("DELETE FROM prediction_sets")
    for ps_name in ("Primetime Ratings Model v1", "Primetime Ratings Model v2"):
        cur.execute(
            """INSERT INTO prediction_sets
               (prediction_set_id, season_id, fixed_game_set_id, name, status,
                v_primary_path, v_secondary_path, v_primetime_path, created_at)
               VALUES (?, ?, NULL, ?, 'complete', NULL, NULL, NULL, datetime('now'))""",
            (str(uuid.uuid4()), season_id, ps_name),
        )
    print("Sanitized prediction_sets: deleted real rows, seeded 2 synthetic entries")

    # 7b. Clear saved team-popularity working copies so the NetCats page seeds
    #     from the app's built-in defaults instead of stale dev values.
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='net_cats'"
    )
    if cur.fetchone():
        cur.execute("UPDATE net_cats SET team_popularity_json = NULL")
        print("Cleared net_cats team_popularity_json")

    # 8. Create mock_solver_config table and seed defaults
    cur.execute("""
        CREATE TABLE IF NOT EXISTS mock_solver_config (
            id                         INTEGER PRIMARY KEY,
            penalty_only_multiplier    REAL DEFAULT 0.15,
            penalty_only_max_gap       REAL DEFAULT 15.0,
            multi_objective_multiplier REAL DEFAULT 0.05,
            multi_objective_max_gap    REAL DEFAULT 15.0
        )
    """)
    cur.execute("""
        INSERT OR REPLACE INTO mock_solver_config
        (id, penalty_only_multiplier, penalty_only_max_gap,
         multi_objective_multiplier, multi_objective_max_gap)
        VALUES (1, 0.15, 15.0, 0.05, 15.0)
    """)
    print("Created and seeded mock_solver_config table")

    conn.commit()
    conn.close()
    print(f"\nPortfolio DB written to: {DST}")


if __name__ == "__main__":
    main()
