from sqlalchemy import Column, String, Boolean, Integer, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

from app.database import Base


class Ruleset(Base):
    __tablename__ = "rulesets"

    ruleset_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    # season_id is NULL for "evergreen" rulesets that apply to any season.
    season_id = Column(String, ForeignKey("seasons.season_id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    parent_ruleset_id = Column(String, ForeignKey("rulesets.ruleset_id"), nullable=True)
    is_snapshot = Column(Boolean, default=False)
    feasibility_status = Column(String, nullable=True)  # None | "feasible" | "infeasible"
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, default="system")

    rules = relationship("Rule", back_populates="ruleset", cascade="all, delete-orphan")


class Rule(Base):
    __tablename__ = "rules"

    rule_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    ruleset_id = Column(String, ForeignKey("rulesets.ruleset_id"), nullable=False, index=True)

    # Column names match the TypeScript Rule interface exactly.
    active = Column(Integer, default=1)           # 0 | 1
    operator = Column(String, default="Max")       # "Max" | "Min"
    games = Column(Integer, default=1)
    weeks = Column(String, nullable=True)          # int or comma-separated string
    week_start = Column(String, nullable=True)
    week_end = Column(String, nullable=True)
    slot = Column(String, nullable=True)
    penalty = Column(Float, default=0.0)
    constraint_type = Column(String, nullable=False)
    hard = Column(String, default="")             # "hard" | ""
    penalty_cap = Column(Integer, default=0)      # 0 | 1
    comment = Column(String, default="")
    slack_bound = Column(Float, default=0.0)
    ti = Column(Integer, default=0)               # 0 | 1
    teams = Column(String, default="")            # comma-separated abbreviations

    ruleset = relationship("Ruleset", back_populates="rules")
