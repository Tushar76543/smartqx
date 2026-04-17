import sys
from sqlalchemy import text
from database import get_engine, get_database_backend

def upgrade_schema():
    engine = get_engine()
    url = get_database_backend()
    print(f"Applying migrations to: {url}")
    
    with engine.begin() as conn:
        try:
            # Check if columns exist
            if "sqlite" in url:
                conn.execute(text("ALTER TABLE queueentry ADD COLUMN event_id INTEGER REFERENCES event(id);"))
                conn.execute(text("ALTER TABLE queueentry ADD COLUMN guest_name VARCHAR;"))
                conn.execute(text("ALTER TABLE queueentry ADD COLUMN guest_email VARCHAR;"))
            else:
                conn.execute(text("ALTER TABLE queueentry ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES event(id);"))
                conn.execute(text("ALTER TABLE queueentry ADD COLUMN IF NOT EXISTS guest_name VARCHAR;"))
                conn.execute(text("ALTER TABLE queueentry ADD COLUMN IF NOT EXISTS guest_email VARCHAR;"))
                
                # Make user_id nullable if using postgres
                conn.execute(text("ALTER TABLE queueentry ALTER COLUMN user_id DROP NOT NULL;"))
            print("Successfully migrated database schema.")
        except Exception as e:
            print("Error or already migrated:", str(e))

if __name__ == "__main__":
    upgrade_schema()
