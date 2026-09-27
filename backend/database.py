"""Database connection, initialization, and helper functions for Agora backend."""

import sqlite3
import os

DB_PATH = os.getenv("AGORA_DB_PATH", "/data/agora.db")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/data/uploads")


def get_db():
    """Return a sqlite3 connection with Row factory and foreign keys enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_db():
    """Create tables and indexes if they don't exist."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    with get_db() as conn:
        # --- Notes ---
        conn.execute("""CREATE TABLE IF NOT EXISTS notes
                       (id TEXT PRIMARY KEY,
                        folder_id TEXT,
                        parent_id TEXT,
                        title TEXT,
                        body TEXT,
                        created_at INTEGER,
                        updated_at INTEGER)""")

        # Migrations: add columns that may already exist
        for col, default in [("parent_id", None), ("pinned", "0")]:
            try:
                conn.execute(f"ALTER TABLE notes ADD COLUMN {col} TEXT" if default is None
                             else f"ALTER TABLE notes ADD COLUMN {col} INTEGER DEFAULT {default}")
            except sqlite3.OperationalError:
                pass

        # --- Folders (legacy, kept for compatibility) ---
        conn.execute("""CREATE TABLE IF NOT EXISTS folders
                       (id TEXT PRIMARY KEY,
                        title TEXT,
                        created_at INTEGER,
                        updated_at INTEGER)""")

        # --- Tags ---
        conn.execute("""CREATE TABLE IF NOT EXISTS tags
                       (id TEXT PRIMARY KEY,
                        name TEXT UNIQUE NOT NULL,
                        created_at INTEGER)""")

        # --- Note ↔ Tag junction ---
        conn.execute("""CREATE TABLE IF NOT EXISTS note_tags
                       (note_id TEXT NOT NULL,
                        tag_id TEXT NOT NULL,
                        PRIMARY KEY (note_id, tag_id),
                        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
                        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE)""")

        # --- Indexes ---
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_body ON notes(body)")

        # --- Attachments ---
        conn.execute("""CREATE TABLE IF NOT EXISTS attachments
                       (id TEXT PRIMARY KEY,
                        note_id TEXT,
                        filename TEXT,
                        original_filename TEXT,
                        content_type TEXT,
                        file_path TEXT,
                        file_size INTEGER,
                        created_at INTEGER,
                        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE)""")

        # --- Calendar Events ---
        conn.execute("""CREATE TABLE IF NOT EXISTS calendar_events
                       (id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        start_date TEXT NOT NULL,
                        end_date TEXT,
                        all_day INTEGER DEFAULT 1,
                        color TEXT DEFAULT '#06b6d4',
                        description TEXT,
                        location TEXT,
                        recurrence TEXT,
                        recurrence_end TEXT,
                        original_date TEXT,
                        created_at INTEGER,
                        updated_at INTEGER)""")

        conn.execute("CREATE INDEX IF NOT EXISTS idx_cal_start ON calendar_events(start_date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_cal_end ON calendar_events(end_date)")

        # Migration: add excluded_dates column if missing
        try:
            conn.execute("ALTER TABLE calendar_events ADD COLUMN excluded_dates TEXT")
        except sqlite3.OperationalError:
            pass

        # Migration: add start_time/end_time columns if missing
        for col in [("start_time", "TEXT"), ("end_time", "TEXT")]:
            try:
                conn.execute(f"ALTER TABLE calendar_events ADD COLUMN {col[0]} {col[1]}")
            except sqlite3.OperationalError:
                pass
