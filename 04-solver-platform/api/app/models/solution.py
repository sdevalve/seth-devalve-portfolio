from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

from app.database import Base


class Solution(Base):
    """
    One incumbent solution found by the Gurobi solver during a Run.

    The solver writes .sol files to disk as incumbents are found during the
    background solve.  The file watcher thread in tasks.py picks these up,
    creates one Solution row per file, and publishes 'incumbent' events to
    Redis so RunDetailPage can live-update the objective value chart.

    penalty_score and ratings_score are null until the user triggers
    solution enrichment (future phase).
    sol_file_path is a local absolute path in V1; becomes an S3 key in V2.
    """
    __tablename__ = "solutions"

    solution_id      = Column(String, primary_key=True, default=lambda: str(uuid4()))
    run_id           = Column(String, ForeignKey("runs.run_id"), nullable=False, index=True)
    job_id           = Column(String, ForeignKey("jobs.job_id"), nullable=True, index=True)  # reserved: V2 multi-job

    incumbent_number = Column(Integer, nullable=False)
    sol_file_path    = Column(String, nullable=True)   # abs path to .sol file on disk
    objective_value  = Column(Float,  nullable=True)   # from .sol file header line
    penalty_score    = Column(Float,  nullable=True)   # populated by enrichment (future)
    ratings_score    = Column(Float,  nullable=True)   # populated by enrichment (future)
    penalty_total    = Column(Float,  nullable=True)   # computed at save time from ledger + slack vars
    ratings_total    = Column(Float,  nullable=True)   # computed at save time from prediction pickles
    sanity_ok        = Column(Boolean, nullable=True)  # False when variable counts fail sanity check
    optimality_gap   = Column(Float,  nullable=True)
    is_final              = Column(Boolean, default=False)
    is_perturbation       = Column(Boolean, default=False)
    assignment_changes    = Column(Integer, nullable=True)   # sum(t_abs) for Perturbation run_type
    found_at              = Column(DateTime, default=datetime.utcnow)
    schedule_records_json = Column(JSON, nullable=True)   # list of {week,slot,tod,home,away}
    dh_by_week_json       = Column(JSON, nullable=True)   # {week_1based: "CBS"|"FOX"|"CBS/FOX"}

    run = relationship("Run", back_populates="solutions")
    job = relationship("Job", back_populates="solutions")
