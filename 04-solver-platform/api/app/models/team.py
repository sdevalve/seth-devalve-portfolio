from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.database import Base


class Team(Base):
    __tablename__ = "teams"

    team_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    season_id = Column(String, ForeignKey("seasons.season_id"), nullable=False, index=True)
    abbreviation = Column(String, nullable=False)  # e.g. "KC", "NE"
    city = Column(String, nullable=False)
    mascot = Column(String, nullable=False)
    tv_code = Column(String, nullable=False, default="")  # e.g. "CHIEF", "PATS"
    conference = Column(String, nullable=False)  # "AFC" or "NFC"
    division = Column(String, nullable=False)    # e.g. "West", "North"
    timezone = Column(Integer, nullable=False, default=0)  # 0=Eastern, 1=Central, 2=Mountain, 3=Pacific

    season = relationship("Season", back_populates="teams")
