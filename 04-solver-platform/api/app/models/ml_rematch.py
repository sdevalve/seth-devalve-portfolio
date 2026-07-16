from sqlalchemy import Column, String, ForeignKey
from uuid import uuid4

from app.database import Base


class MLRematch(Base):
    __tablename__ = "ml_rematches"

    rematch_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    # Multiple rematches per season — no unique constraint on season_id alone.
    season_id = Column(String, ForeignKey("seasons.season_id"), nullable=False)
    away_team = Column(String, nullable=False)
    home_team = Column(String, nullable=False)
