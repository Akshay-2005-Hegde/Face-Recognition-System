# backend/database.py
"""
database.py
============
SQLite storage layer. Chosen over PostgreSQL/MongoDB because it needs
zero external service, ships with Python, and easily handles the scale
of a personal/academic enrollment database (hundreds to low thousands
of people) -- see README "Technology Selection" for the full trade-off
discussion.
"""

import sqlite3
import time
import json
from pathlib import Path
from typing import List, Optional, Dict, Any
import numpy as np

DB_PATH = Path(__file__).parent / "data" / "face_recognition.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS people (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                external_id TEXT,
                created_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
                vector BLOB NOT NULL,
                dim INTEGER NOT NULL,
                created_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS thumbnails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
                jpeg BLOB NOT NULL,
                created_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS recognition_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL NOT NULL,
                matched_person_id INTEGER,
                similarity REAL,
                is_known INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )


# ---------------------------------------------------------------- people --

def create_person(name: str, external_id: Optional[str]) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO people (name, external_id, created_at) VALUES (?, ?, ?)",
            (name.strip(), external_id, time.time()),
        )
        return cur.lastrowid


def add_embedding(person_id: int, vector: np.ndarray) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO embeddings (person_id, vector, dim, created_at) VALUES (?, ?, ?, ?)",
            (person_id, vector.astype(np.float32).tobytes(), vector.shape[0], time.time()),
        )


def add_thumbnail(person_id: int, jpeg_bytes: bytes) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO thumbnails (person_id, jpeg, created_at) VALUES (?, ?, ?)",
            (person_id, jpeg_bytes, time.time()),
        )


def delete_person(person_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM people WHERE id = ?", (person_id,))
        return cur.rowcount > 0


def list_people() -> List[Dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT p.id, p.name, p.external_id, p.created_at,
                   COUNT(e.id) AS sample_count
            FROM people p
            LEFT JOIN embeddings e ON e.person_id = p.id
            GROUP BY p.id
            ORDER BY p.created_at DESC
            """
        ).fetchall()
        return [dict(r) for r in rows]


def get_person(person_id: int) -> Optional[Dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM people WHERE id = ?", (person_id,)).fetchone()
        if not row:
            return None
        thumbs = conn.execute(
            "SELECT id, created_at FROM thumbnails WHERE person_id = ? ORDER BY created_at",
            (person_id,),
        ).fetchall()
        return {**dict(row), "thumbnails": [dict(t) for t in thumbs]}


def get_person_by_name(name: str) -> Optional[Dict[str, Any]]:
    """Fetches a person by their exact name to handle enrollment conflicts."""
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM people WHERE name = ?", (name,)).fetchone()
        return dict(row) if row else None


def get_thumbnail(thumbnail_id: int) -> Optional[bytes]:
    with get_conn() as conn:
        row = conn.execute("SELECT jpeg FROM thumbnails WHERE id = ?", (thumbnail_id,)).fetchone()
        return row["jpeg"] if row else None


def all_embeddings() -> List[Dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT e.person_id, p.name, e.vector, e.dim
            FROM embeddings e JOIN people p ON p.id = e.person_id
            """
        ).fetchall()
        out = []
        for r in rows:
            vec = np.frombuffer(r["vector"], dtype=np.float32).reshape(r["dim"])
            out.append({"person_id": r["person_id"], "name": r["name"], "vector": vec})
        return out


def count_people() -> int:
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) c FROM people").fetchone()["c"]


def count_samples() -> int:
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) c FROM embeddings").fetchone()["c"]


# ------------------------------------------------------------ recognition --

def log_recognition(matched_person_id: Optional[int], similarity: float, is_known: bool) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO recognition_log (ts, matched_person_id, similarity, is_known) VALUES (?, ?, ?, ?)",
            (time.time(), matched_person_id, similarity, int(is_known)),
        )


def recognition_stats() -> Dict[str, int]:
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) c FROM recognition_log").fetchone()["c"]
        known = conn.execute("SELECT COUNT(*) c FROM recognition_log WHERE is_known = 1").fetchone()["c"]
        unknown = total - known
        return {"total_attempts": total, "known_matches": known, "unknown_detections": unknown}


# --------------------------------------------------------------- config ---

def set_config(key: str, value: Any) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO config (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, json.dumps(value)),
        )


def get_config(key: str, default: Any = None) -> Any:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM config WHERE key = ?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default