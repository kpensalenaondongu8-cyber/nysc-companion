"""Counting how corps members use a house listing, for the agent dashboard.

One row per corps member, per house, per kind of action, per day:
  view      the corps member opened the house page
  whatsapp  they tapped "Message on WhatsApp"
  call      they tapped "Call the agent"
The agent only ever sees counts. Who looked or called is never shown to them.
"""
from datetime import date

import locator_db as db

KINDS = ("view", "whatsapp", "call")


def _connect():
    conn = db._connect()
    # Normally created at start-up (init__db). Repeated here so a database that was not upgraded still works.
    conn.execute("""CREATE TABLE IF NOT EXISTS house_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, house_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
        kind TEXT NOT NULL, day TEXT NOT NULL, UNIQUE (house_id, user_id, kind, day))""")
    return conn


def record_event(house_id, user_id, kind):
    """Save one event. Doing the same thing twice in a day still counts once."""
    if kind not in KINDS:
        return
    conn = _connect()
    try:
        conn.execute("INSERT OR IGNORE INTO house_events (house_id, user_id, kind, day) VALUES (?, ?, ?, ?)",
                     (house_id, user_id, kind, date.today().isoformat()))
        conn.commit()
    finally:
        conn.close()
