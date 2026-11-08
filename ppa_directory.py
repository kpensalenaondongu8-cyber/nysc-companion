"""The shared PPA list, built by the corps members themselves (no paid map service needed).

How it fills up:
  1. A corper pins their PPA and saves it (with "share" ticked).
  2. We add it to this list, or, if the same place is already there, count it as one more confirmation.
  3. The next corper searches by name + town, finds it, and taps it: the map jumps to the pin.

Keeping it clean:
  * one vote per corper per place ("confirm" or "report wrong")
  * a place reported wrong by 3 or more corpers (and more than confirmed it) is hidden
  * one corper can add at most 3 new places
  * the admin can delete any place
"""
import math
import sqlite3
from datetime import datetime
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException

from api_routes import current_user_id
import locator_db as db

router = APIRouter(prefix="/api/ppa-directory")

MAX_NEW_PER_USER = 3
SAME_PLACE_METRES = 150
HIDE_AFTER_REPORTS = 3

_ready = False


def _connect():
    global _ready
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    conn.row_factory = sqlite3.Row
    if not _ready:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS ppa_directory(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              state TEXT NOT NULL,
              lga TEXT NOT NULL DEFAULT '',
              town TEXT NOT NULL DEFAULT '',
              address TEXT NOT NULL DEFAULT '',
              lat REAL NOT NULL,
              lon REAL NOT NULL,
              added_by INTEGER,
              created_at TEXT NOT NULL,
              confirmations INTEGER NOT NULL DEFAULT 1,
              reports INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS ppa_votes(
              user_id INTEGER NOT NULL,
              place_id INTEGER NOT NULL,
              kind TEXT NOT NULL,
              PRIMARY KEY (user_id, place_id),
              FOREIGN KEY (place_id) REFERENCES ppa_directory (id) ON DELETE CASCADE
            );
        """)
        conn.commit()
        _ready = True
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ---------- matching names ("GSS" ~ "Government Secondary School") ----------

WORD_FIX = {
    "govt": "government", "gov": "government", "gsss": "government secondary school", "gss": "government secondary school",
    "gjss": "government junior secondary school", "gdss": "government day secondary school",
    "phc": "primary health centre", "pry": "primary", "pri": "primary", "sec": "secondary", "sch": "school",
    "schl": "school", "hosp": "hospital", "ctr": "centre", "cntr": "centre", "center": "centre",
    "centers": "centre", "centres": "centre", "hc": "health centre", "nur": "nursery", "jnr": "junior",
    "snr": "senior", "comp": "comprehensive", "cmd": "command", "lg": "local government",
    "lga": "local government", "st": "saint", "saints": "saint",
}
SKIP = {"the", "of", "and", "in", "at", "for", "a"}


def words(text):
    out = []
    cleaned = "".join(ch if ch.isalnum() else " " for ch in (text or "").lower().replace("'", "").replace(".", ""))
    for w in cleaned.split():
        for x in WORD_FIX.get(w, w).split():
            if x not in SKIP:
                out.append(x)
    return out


def name_score(typed, name):
    """0..1: how much of what was typed shows up (roughly) in this name."""
    q, n = words(typed), words(name)
    if not q:
        return 0.0
    total = 0.0
    for w in q:
        best = 0.0
        for x in n:
            if x == w:
                best = 1.0
                break
            if len(w) >= 3 and min(len(w), len(x)) >= 3 and (x.startswith(w) or w.startswith(x)):
                best = max(best, 0.8)
            elif len(w) >= 4 and SequenceMatcher(None, w, x).ratio() >= 0.8:
                best = max(best, 0.7)
        total += best
    return total / len(q)


def _metres(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


_VISIBLE = f"NOT (reports >= {HIDE_AFTER_REPORTS} AND reports > confirmations)"


def _public(r):
    return {"id": r["id"], "name": r["name"], "state": r["state"], "lga": r["lga"], "town": r["town"],
            "address": ", ".join(x for x in [r["address"], r["town"], r["lga"], r["state"]] if x),
            "lat": r["lat"], "lon": r["lon"], "confirmations": r["confirmations"]}


# ---------- database functions ----------

def search(name, town, state, limit=20):
    conn = _connect()
    sql, args = f"SELECT * FROM ppa_directory WHERE {_VISIBLE}", []
    if state:
        sql += " AND LOWER(state) = LOWER(?)"
        args.append(state)
    if town:
        like = f"%{town.lower()}%"
        sql += " AND (LOWER(town) LIKE ? OR LOWER(lga) LIKE ? OR LOWER(address) LIKE ?)"
        args += [like, like, like]
    rows = conn.execute(sql, args).fetchall()
    conn.close()
    scored = []
    for r in rows:
        s = name_score(name, r["name"]) if name else 0.0
        if name and s < 0.34:
            continue
        scored.append((s, r["confirmations"], r))
    scored.sort(key=lambda x: (-x[0], -x[1]))
    return [_public(r) for _, _, r in scored[:limit]]


def share(user_id, name, state, lga, town, address, lat, lon):
    """Add this PPA to the shared list, or count it as a confirmation of the same place. Returns the place id."""
    conn = _connect()
    near = conn.execute(f"SELECT * FROM ppa_directory WHERE LOWER(state) = LOWER(?) AND {_VISIBLE}", (state,)).fetchall()
    for r in near:
        if _metres(lat, lon, r["lat"], r["lon"]) <= SAME_PLACE_METRES and name_score(name, r["name"]) >= 0.8:
            _vote(conn, user_id, r["id"], "confirm")
            conn.commit()
            conn.close()
            return r["id"]
    made = conn.execute("SELECT COUNT(*) FROM ppa_directory WHERE added_by = ?", (user_id,)).fetchone()[0]
    if made >= MAX_NEW_PER_USER:
        conn.close()
        return None
    cur = conn.execute(
        """INSERT INTO ppa_directory (name, state, lga, town, address, lat, lon, added_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (name, state, lga, town, address, lat, lon, user_id, datetime.now().isoformat(timespec="seconds")))
    conn.execute("INSERT INTO ppa_votes (user_id, place_id, kind) VALUES (?, ?, 'confirm')", (user_id, cur.lastrowid))
    conn.commit()
    conn.close()
    return cur.lastrowid


def _vote(conn, user_id, place_id, kind):
    """One vote per corper per place. Changing your vote moves the counters."""
    old = conn.execute("SELECT kind FROM ppa_votes WHERE user_id = ? AND place_id = ?", (user_id, place_id)).fetchone()
    if old and old["kind"] == kind:
        return False
    if old:
        col_old = "confirmations" if old["kind"] == "confirm" else "reports"
        conn.execute(f"UPDATE ppa_directory SET {col_old} = MAX({col_old} - 1, 0) WHERE id = ?", (place_id,))
        conn.execute("UPDATE ppa_votes SET kind = ? WHERE user_id = ? AND place_id = ?", (kind, user_id, place_id))
    else:
        conn.execute("INSERT INTO ppa_votes (user_id, place_id, kind) VALUES (?, ?, ?)", (user_id, place_id, kind))
    col = "confirmations" if kind == "confirm" else "reports"
    conn.execute(f"UPDATE ppa_directory SET {col} = {col} + 1 WHERE id = ?", (place_id,))
    return True


def vote(user_id, place_id, kind):
    conn = _connect()
    if not conn.execute("SELECT 1 FROM ppa_directory WHERE id = ?", (place_id,)).fetchone():
        conn.close()
        return False
    _vote(conn, user_id, place_id, kind)
    conn.commit()
    conn.close()
    return True


def delete(place_id):
    conn = _connect()
    n = conn.execute("DELETE FROM ppa_directory WHERE id = ?", (place_id,)).rowcount
    conn.commit()
    conn.close()
    return n > 0


# ---------- routes ----------

@router.get("/search")
def search_route(name: str = "", town: str = "", state: str = "", user_id: int = Depends(current_user_id)):
    return {"results": search(name.strip()[:100], town.strip()[:80], state.strip()[:40])}


@router.post("/{place_id}/confirm")
def confirm_route(place_id: int, user_id: int = Depends(current_user_id)):
    if not vote(user_id, place_id, "confirm"):
        raise HTTPException(404, "That place is not on the list.")
    return {"ok": True}


@router.post("/{place_id}/report")
def report_route(place_id: int, user_id: int = Depends(current_user_id)):
    if not vote(user_id, place_id, "report"):
        raise HTTPException(404, "That place is not on the list.")
    return {"ok": True}


@router.delete("/{place_id}")
def delete_route(place_id: int, user_id: int = Depends(current_user_id)):
    if db.get_role(user_id) != "admin":
        raise HTTPException(403, "This is for the admin only.")
    if not delete(place_id):
        raise HTTPException(404, "That place is not on the list.")
    return {"ok": True}
