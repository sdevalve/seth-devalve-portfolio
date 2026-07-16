# Import every model here so SQLAlchemy sees all tables before
# Base.metadata.create_all() is called in main.py.
from app.models.season import Season          # noqa: F401
from app.models.team import Team              # noqa: F401
from app.models.matchup import Matchup        # noqa: F401
from app.models.weekmap import Weekmap        # noqa: F401
from app.models.ruleset import Ruleset, Rule  # noqa: F401
from app.models.fixed_game_set import FixedGameSet  # noqa: F401
from app.models.run import Run, Job           # noqa: F401
from app.models.solution import Solution      # noqa: F401
from app.models.ml_rematch import MLRematch  # noqa: F401
from app.models.ml_futures import MLFutures  # noqa: F401
from app.models.net_cats import NetCats, NetCatEntry  # noqa: F401
from app.models.color_policy import ColorPolicy        # noqa: F401
from app.models.mock_solver_config import MockSolverConfig  # noqa: F401
from app.models.prediction_set import PredictionSet         # noqa: F401
