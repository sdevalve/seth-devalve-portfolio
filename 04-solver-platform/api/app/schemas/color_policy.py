from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class ColorPolicyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    color_policy_id: str
    season_id:       str
    slot_colors:     dict[str, Optional[str]]
    palette:         list[str]
    tod_formats:     dict[str, Optional[str]]
    dh_format:       Optional[str] = None
    updated_at:      Optional[datetime] = None


class ColorPolicyUpdate(BaseModel):
    """All fields optional — only supplied fields are updated."""
    slot_colors: Optional[dict[str, Optional[str]]] = None
    palette:     Optional[list[str]]                = None
    tod_formats: Optional[dict[str, Optional[str]]] = None
    dh_format:   Optional[str]                      = None
