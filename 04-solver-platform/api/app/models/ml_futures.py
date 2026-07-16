from sqlalchemy import Column, String, ForeignKey, JSON, DateTime
from uuid import uuid4
from datetime import datetime, timezone

from app.database import Base


class MLFutures(Base):
    __tablename__ = "ml_futures"

    futures_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    # One futures record per season.
    season_id = Column(String, ForeignKey("seasons.season_id"), nullable=False, unique=True)
    # { "PHI": { "make": -150, "miss": 120 } }  — null means section not yet saved
    playoffs = Column(JSON, nullable=True)
    # { "PHI": 10.5 }
    wintotals = Column(JSON, nullable=True)
    # { "PHI": -200 }
    division_odds = Column(JSON, nullable=True)
    # { "PHI": -500 }
    conference_odds = Column(JSON, nullable=True)
    # { "PHI": 400 }
    superbowl_odds = Column(JSON, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
