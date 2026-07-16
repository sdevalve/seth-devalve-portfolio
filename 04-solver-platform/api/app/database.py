from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# SQLite database stored as a local file next to the project.
# Swap DATABASE_URL for a PostgreSQL URL when deploying to AWS RDS.
DATABASE_URL = "sqlite:///./nfl.db"

engine = create_engine(
    DATABASE_URL,
    # Required for SQLite — allows the same connection to be used
    # across different threads (FastAPI can handle requests concurrently).
    connect_args={"check_same_thread": False},
)

# SessionLocal is a factory: each call creates a new DB session.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """All SQLAlchemy models inherit from this base class."""
    pass


def get_db():
    """
    FastAPI dependency — yields a DB session for a single request,
    then closes it automatically when the request is done.

    Usage in a router:
        def my_route(db: Session = Depends(get_db)): ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
