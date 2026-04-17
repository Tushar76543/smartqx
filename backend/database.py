import logging
import os

from dotenv import load_dotenv
from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine

load_dotenv()

logger = logging.getLogger(__name__)


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


PRIMARY_DATABASE_URL = _normalize_database_url(
    os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/smartq")
)
SQLITE_FALLBACK_URL = os.getenv("SQLITE_FALLBACK_URL", "sqlite:///./smartq_demo.db")

engine = None
active_database_url = None


def _build_engine(database_url: str):
    kwargs = {"echo": False, "pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(database_url, **kwargs)


def _test_connection(candidate_engine) -> None:
    with candidate_engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def get_engine():
    global engine, active_database_url

    if engine is not None:
        return engine

    primary_engine = _build_engine(PRIMARY_DATABASE_URL)
    try:
        _test_connection(primary_engine)
        engine = primary_engine
        active_database_url = PRIMARY_DATABASE_URL
        logger.info("Using primary database: %s", PRIMARY_DATABASE_URL)
        return engine
    except Exception as exc:
        fallback_engine = _build_engine(SQLITE_FALLBACK_URL)
        _test_connection(fallback_engine)
        engine = fallback_engine
        active_database_url = SQLITE_FALLBACK_URL
        logger.warning(
            "Primary database unavailable (%s). Falling back to SQLite at %s",
            exc,
            SQLITE_FALLBACK_URL,
        )
        return engine


def get_database_backend() -> str:
    get_engine()
    return active_database_url or "unknown"


def create_db_and_tables():
    SQLModel.metadata.create_all(get_engine())


def get_session():
    with Session(get_engine()) as session:
        yield session
