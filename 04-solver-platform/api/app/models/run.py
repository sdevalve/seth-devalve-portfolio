from sqlalchemy import Column, String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

from app.database import Base


class Run(Base):
    """
    One optimization attempt for a season.
    References a ruleset snapshot and an optional fixed game set.
    """
    __tablename__ = "runs"

    run_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    season_id = Column(String, ForeignKey("seasons.season_id"), nullable=False, index=True)
    ruleset_id = Column(String, ForeignKey("rulesets.ruleset_id"), nullable=False)
    fixed_game_set_id = Column(String, ForeignKey("fixed_game_sets.fixed_game_set_id"), nullable=True)
    prediction_set_id = Column(String, nullable=True)  # FK removed — prediction_sets table not in portfolio
    net_cats_id = Column(String, ForeignKey("net_cats.net_cats_id"), nullable=True)
    name = Column(String, nullable=False)
    run_type = Column(String, nullable=False)   # MultiObjective | PenaltyOnly | Perturbation | PartialMatchups
    scope = Column(String, default="Full")       # Full | PrimeTimeOnly
    status = Column(String, default="queued")    # queued | building | feasibility_check | solving | perturbating | infeasible | complete | failed | stopped
    comments = Column(Text, nullable=True)       # user notes about run purpose (maps to readme)
    run_params = Column(JSON, nullable=True)     # snapshot of all config at launch time
    celery_task_id = Column(String, nullable=True)  # set after Celery enqueues; used by cancel endpoint
    npz_path = Column(String, nullable=True)         # path to NPZ containing xvar_dictionary + matchups
    error_message = Column(JSON, nullable=True)      # populated when status = "infeasible" (IIS data)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, default="system")

    season = relationship("Season", back_populates="runs")
    jobs = relationship("Job", back_populates="run", cascade="all, delete-orphan")
    solutions = relationship("Solution", back_populates="run", cascade="all, delete-orphan")


class Job(Base):
    """
    A single Gurobi compute task within a Run.
    In a MultiObjective run there will be many jobs, one per weight combination.
    """
    __tablename__ = "jobs"

    job_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    run_id = Column(String, ForeignKey("runs.run_id"), nullable=False, index=True)
    # objective_weights: { "penalty": 0.8, "ratings": 0.2 }
    objective_weights = Column(JSON, default=dict)
    ec2_instance_id = Column(String, nullable=True)
    status = Column(String, default="queued")
    xvar_dictionary_s3_key = Column(String, nullable=True)
    matchups_s3_key = Column(String, nullable=True)
    tv_ratings_override_s3_key = Column(String, nullable=True)
    gurobi_log_s3_key = Column(String, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    run = relationship("Run", back_populates="jobs")
    solutions = relationship("Solution", back_populates="job", cascade="all, delete-orphan")
