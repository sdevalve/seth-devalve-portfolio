from sqlalchemy import Column, String, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

from app.database import Base


class FixedGameSet(Base):
    """
    A named collection of pre-locked game assignments.
    The 'games' JSON column holds a list of FixedGame objects:
    [{ week, home_abbr, away_abbr, slot?, tod? }, ...]
    """
    __tablename__ = "fixed_game_sets"

    fixed_game_set_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    season_id = Column(String, ForeignKey("seasons.season_id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    source_solution_id = Column(String, nullable=True)
    ruleset_id = Column(String, nullable=True)
    run_id = Column(String, nullable=True)
    games = Column(JSON, default=list)   # list[FixedGame]
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, default="system")

    season = relationship("Season", back_populates="fixed_game_sets")
