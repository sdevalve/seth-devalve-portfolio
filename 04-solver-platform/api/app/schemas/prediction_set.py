from pydantic import BaseModel, ConfigDict
from datetime import datetime


class PredictionSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    prediction_set_id: str
    season_id: str
    name: str
    status: str
    created_at: datetime
