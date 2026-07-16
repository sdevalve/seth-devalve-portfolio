from sqlalchemy import Column, String, Integer, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

from app.database import Base


class Season(Base):
    __tablename__ = "seasons"

    season_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    year = Column(Integer, unique=True, nullable=False, index=True)
    num_weeks = Column(Integer, default=18)
    num_teams = Column(Integer, default=32)
    num_matchups = Column(Integer, default=272)
    networks = Column(JSON, default=list)             # list[str] — broadcast networks
    slots = Column(JSON, default=list)                # list[str] — named time slots
    new_network_dict = Column(JSON, nullable=True)    # dict[str, str] — new network → analogue mapping
    thanksgiving_week = Column(Integer, nullable=True)
    christmas_week = Column(Integer, nullable=True)
    double_dh_weeks = Column(JSON, nullable=True)      # list[int] — weeks with double-header doubleheaders
    christmas_day = Column(String, nullable=True)      # day of week, e.g. 'Wednesday'
    bye_start = Column(Integer, default=4)
    bye_end = Column(Integer, default=14)
    num_bye_weeks = Column(Integer, default=1)
    min_weeks_between_byes = Column(Integer, default=0)
    max_byes_per_week = Column(Integer, default=6)
    max_consec_home = Column(Integer, default=3)
    max_consec_away = Column(Integer, default=3)
    tv_ratings_s3_key = Column(String, nullable=True)
    week_labels = Column(JSON, nullable=True)            # dict[str, str] — e.g. {"1": "Week 1", ...}
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, default="system")

    # Cascade delete: removing a season also removes all its child data.
    teams = relationship("Team", back_populates="season", cascade="all, delete-orphan")
    matchups = relationship("Matchup", back_populates="season", cascade="all, delete-orphan")
    weekmap = relationship("Weekmap", back_populates="season", uselist=False, cascade="all, delete-orphan")
    runs = relationship("Run", back_populates="season", cascade="all, delete-orphan")
    fixed_game_sets = relationship("FixedGameSet", back_populates="season", cascade="all, delete-orphan")
