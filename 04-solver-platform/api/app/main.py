from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import engine
import app.models  # noqa: F401 — imports all models so SQLAlchemy sees every table
from app.database import Base
from app.routers import (
    seasons, teams, matchups, weekmaps, rulesets, runs, solutions,
    ml_rematch, ml_futures, net_cats, color_policy, fixed_game_sets,
    mock_solver_config, prediction_sets,
)

Base.metadata.create_all(bind=engine)

_COLUMN_MIGRATIONS = [
    "ALTER TABLE solutions ADD COLUMN penalty_total REAL",
    "ALTER TABLE solutions ADD COLUMN ratings_total REAL",
    "ALTER TABLE solutions ADD COLUMN sanity_ok        INTEGER",
    "ALTER TABLE solutions ADD COLUMN is_perturbation       INTEGER DEFAULT 0",
    "ALTER TABLE solutions ADD COLUMN schedule_records_json TEXT",
    "ALTER TABLE solutions ADD COLUMN dh_by_week_json      TEXT",
    "ALTER TABLE seasons  ADD COLUMN week_labels           TEXT",
    "ALTER TABLE rulesets  ADD COLUMN feasibility_status   TEXT",
    "ALTER TABLE solutions ADD COLUMN assignment_changes   INTEGER",
    "ALTER TABLE net_cats  ADD COLUMN team_popularity_json TEXT",
]
with engine.connect() as _conn:
    for _stmt in _COLUMN_MIGRATIONS:
        try:
            _conn.execute(text(_stmt))
            _conn.commit()
        except Exception:
            pass  # column already exists


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Schedule Optimizer API",
    version="0.1.0",
    description="Portfolio demo — async optimization platform with React + FastAPI + Celery + Redis.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(seasons.router)
app.include_router(teams.router)
app.include_router(matchups.router)
app.include_router(weekmaps.router)
app.include_router(rulesets.router)
app.include_router(runs.router)
app.include_router(solutions.router)
app.include_router(ml_rematch.router)
app.include_router(ml_futures.router)
app.include_router(net_cats.router)
app.include_router(color_policy.router)
app.include_router(fixed_game_sets.router)
app.include_router(mock_solver_config.router)
app.include_router(prediction_sets.router)


@app.get("/health")
def health():
    return {"status": "ok"}
