from sqlalchemy import Column, String, DateTime, ForeignKey
from datetime import datetime

from app.database import Base


class PredictionSet(Base):
    __tablename__ = "prediction_sets"

    prediction_set_id = Column(String, primary_key=True)
    season_id         = Column(String, ForeignKey("seasons.season_id", ondelete="CASCADE"), nullable=False, index=True)
    fixed_game_set_id = Column(String, ForeignKey("fixed_game_sets.fixed_game_set_id", ondelete="SET NULL"), nullable=True)
    name              = Column(String, nullable=False)
    status            = Column(String, nullable=False, default="complete")
    v_primary_path    = Column(String, nullable=True)
    v_secondary_path  = Column(String, nullable=True)
    v_primetime_path  = Column(String, nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow)
