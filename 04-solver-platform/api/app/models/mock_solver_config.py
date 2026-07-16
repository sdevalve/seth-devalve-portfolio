from sqlalchemy import Column, Integer, Float

from app.database import Base


class MockSolverConfig(Base):
    __tablename__ = "mock_solver_config"

    id                         = Column(Integer, primary_key=True, default=1)
    penalty_only_multiplier    = Column(Float, default=0.15)
    penalty_only_max_gap       = Column(Float, default=15.0)
    multi_objective_multiplier = Column(Float, default=0.05)
    multi_objective_max_gap    = Column(Float, default=15.0)
