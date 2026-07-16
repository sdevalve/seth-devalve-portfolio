from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from uuid import uuid4

from app.database import Base


class NetCats(Base):
    __tablename__ = "net_cats"

    net_cats_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    season_id = Column(String, ForeignKey("seasons.season_id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    is_snapshot = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    team_popularity_json = Column(Text, nullable=True)  # JSON: Record<abbr, score>

    entries = relationship(
        "NetCatEntry",
        back_populates="net_cats",
        cascade="all, delete-orphan",
        order_by="NetCatEntry.entry_id",
    )


class NetCatEntry(Base):
    __tablename__ = "net_cat_entries"

    entry_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    net_cats_id = Column(String, ForeignKey("net_cats.net_cats_id"), nullable=False, index=True)
    slot = Column(String, nullable=False)
    operator = Column(String, nullable=False)   # "Max" | "Min"
    games = Column(Integer, nullable=False)
    matchups = Column(String, nullable=False)   # comma-delimited "AWAY@HOME,..."

    net_cats = relationship("NetCats", back_populates="entries")
