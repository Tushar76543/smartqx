import os
import logging
from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine

# -------------------- Logging --------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -------------------- Env Config --------------------
# Use the environment variable, or fallback to a default only if local
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # If we are in production (Render/Railway), this will raise an error as requested
    # If you are running locally, make sure to set DATABASE_URL in your .env
    raise ValueError("❌ DATABASE_URL is not set. Fix your environment variables.")

# Fix for platforms that use postgres:// (like Heroku/Render)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

logger.info(f"✅ Using DATABASE_URL: {DATABASE_URL}")

# -------------------- Engine --------------------
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

# -------------------- Helpers for main.py --------------------
def get_engine():
    return engine

def get_database_backend() -> str:
    # Extracts the host from the URL to show in the dashboard
    try:
        return DATABASE_URL.split("@")[-1].split("/")[0]
    except:
        return "Connected"

# -------------------- Connection Test --------------------
def test_connection():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        logger.info("✅ Database connection successful")
    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")
        raise

# -------------------- DB Init --------------------
def create_db_and_tables():
    test_connection()  # Fail fast if DB is broken
    SQLModel.metadata.create_all(engine)
    logger.info("✅ Tables created / verified")

# -------------------- Session --------------------
def get_session():
    with Session(engine) as session:
        yield session
