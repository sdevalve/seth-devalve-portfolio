from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

from app.database import Base


class ColorPolicy(Base):
    """
    Per-season color and typography policy used when rendering schedule grids.

    One row per season (enforced by unique constraint on season_id).
    Auto-created with empty defaults on first GET; updated via PUT.

    slot_colors  : {collapsed_slot_name -> hex_string | null}
                   Keys use the collapsed slot name (e.g. "MNF" covers MNF1 and MNF2).
    palette      : ordered list of hex strings the user has saved for re-use.
    tod_formats  : {tod_label -> format_name | null}
                   Keys: "morning", "afternoon", "mid-afternoon", "evening".
                   Values: "bold" | "italic" | "underline" | null.
    dh_format    : "bold" | "italic" | "underline" | null
                   Typography used to distinguish double-header games in schedule rendering.
    """
    __tablename__ = "color_policies"
    __table_args__ = (
        UniqueConstraint("season_id", name="uq_color_policy_season"),
    )

    color_policy_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    season_id       = Column(String, ForeignKey("seasons.season_id"), nullable=False, index=True)

    slot_colors = Column(JSON, nullable=False, default=dict)
    palette     = Column(JSON, nullable=False, default=list)
    tod_formats = Column(JSON, nullable=False, default=dict)
    dh_format   = Column(String, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    season = relationship("Season")
