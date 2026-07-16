from sqlalchemy import Column, String, ForeignKey, JSON
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.database import Base


class Weekmap(Base):
    __tablename__ = "weekmaps"

    weekmap_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    # One weekmap per season (unique constraint enforced at DB level).
    season_id = Column(String, ForeignKey("seasons.season_id"), nullable=False, unique=True)
    # data shape: { "CBS Early": [null, "CBS", null, ...], ... }
    # Outer key = slot name; inner list = one entry per week (network or null).
    data = Column(JSON, default=dict)

    season = relationship("Season", back_populates="weekmap")
