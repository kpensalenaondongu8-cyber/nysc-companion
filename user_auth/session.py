import sqlite3
import secrets
from datetime import datetime, timedelta

# How long a login stays valid before the user must log in again.
SESSION_DAYS = 7


def create_session(user_id):
    """Make a random token, save it against the user, and return it.
    The browser keeps the token and sends it back with every request."""
    token = secrets.token_urlsafe(32)
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()
    return token


def get_user_id(token):
    """Return the user id that owns this token, or None if the token is
    unknown or older than SESSION_DAYS."""
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    row = conn.execute(
        "SELECT user_id, created_at FROM sessions WHERE token = ?", (token,)
    ).fetchone()
    conn.close()

    if row is None:
        return None
    user_id, created_at = row
    if datetime.now() - datetime.fromisoformat(created_at) > timedelta(days=SESSION_DAYS):
        delete_session(token)
        return None
    return user_id


def delete_session(token):
    """Log out: forget the token."""
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()
