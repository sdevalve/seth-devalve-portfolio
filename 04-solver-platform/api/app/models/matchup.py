from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.database import Base


class Matchup(Base):
    __tablename__ = "matchups"

    matchup_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    season_id = Column(String, ForeignKey("seasons.season_id"), nullable=False, index=True)
    # Stored as mascot names (e.g. "Chiefs", "Patriots").
    home_team = Column(String, nullable=False)
    away_team = Column(String, nullable=False)

    season = relationship("Season", back_populates="matchups")
