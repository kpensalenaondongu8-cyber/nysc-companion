"""/api/cds - the corps member's CDS group, attendance and community project.

What it keeps for each corps member:
  * their CDS group (name, meeting day, leader)
  * an attendance log: one line per CDS day (present, absent or excused, with an optional note)
  * their community project (title, what it is about, planned / ongoing / done)
  * "what we did" updates for the project: a date, a note and an optional photo
The page turns all of this into a one-page summary they can print or save as a PDF.
"""
import re
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import locator_db as db
import photo_store
from locator_routes import current_corper_id

router = APIRouter(prefix="/api/cds")

CDS_DIR = Path("uploads") / "cds"
CDS_DIR.mkdir(parents=True, exist_ok=True)

DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
STATUSES = ("present", "absent", "excused")
PROJECT_STATUSES = ("planned", "ongoing", "done")
MAX_SESSIONS = 400
MAX_UPDATES = 100
FILE_NAME = re.compile(r"^[0-9a-f]{24}\.jpg$")


def _connect():
    conn = db._connect()
    conn.execute("""CREATE TABLE IF NOT EXISTS cds_profile (
        user_id INTEGER PRIMARY KEY, group_name TEXT NOT NULL DEFAULT '', meet_day TEXT NOT NULL DEFAULT '',
        leader TEXT NOT NULL DEFAULT '', project_title TEXT NOT NULL DEFAULT '',
        project_about TEXT NOT NULL DEFAULT '', project_status TEXT NOT NULL DEFAULT 'planned')""")
    conn.execute("""CREATE TABLE IF NOT EXISTS cds_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, day TEXT NOT NULL,
        status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', UNIQUE (user_id, day))""")
    conn.execute("""CREATE TABLE IF NOT EXISTS cds_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, day TEXT NOT NULL,
        note TEXT NOT NULL, photo TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)""")
    return conn


def parse_date(text):
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def check_day(text):
    """A date the corps member can log: a real date, not in the future, not before 2015."""
    d = parse_date(text)
    if not d:
        raise HTTPException(status_code=400, detail="Enter the date as day, month and year.")
    if d > date.today():
        raise HTTPException(status_code=400, detail="That date has not come yet. Pick today or an earlier day.")
    if d < date(2015, 1, 1):
        raise HTTPException(status_code=400, detail="That date looks wrong. Check the year.")
    return d.isoformat()


class ProfileBody(BaseModel):
    group_name: str = Field(default="", max_length=80)
    meet_day: str = Field(default="", max_length=12)
    leader: str = Field(default="", max_length=80)
    project_title: str = Field(default="", max_length=100)
    project_about: str = Field(default="", max_length=600)
    project_status: str = "planned"


class SessionBody(BaseModel):
    day: str
    status: str
    note: str = Field(default="", max_length=200)


class UpdateBody(BaseModel):
    day: str
    note: str = Field(min_length=1, max_length=500)
    photo: str | None = None               # a JPEG as a data URL (optional)


@router.get("")
def get_cds(user_id: int = Depends(current_corper_id)):
    conn = _connect()
    prof = conn.execute("SELECT * FROM cds_profile WHERE user_id = ?", (user_id,)).fetchone()
    sessions = [dict(r) for r in conn.execute(
        "SELECT id, day, status, note FROM cds_sessions WHERE user_id = ? ORDER BY day DESC, id DESC", (user_id,))]
    updates = [dict(r) for r in conn.execute(
        "SELECT id, day, note, photo FROM cds_updates WHERE user_id = ? ORDER BY day DESC, id DESC", (user_id,))]
    conn.close()

    counts = {s: sum(1 for x in sessions if x["status"] == s) for s in STATUSES}
    # Excused days do not count against the corps member: the rate is present out of (present + absent).
    counted = counts["present"] + counts["absent"]
    stats = {**counts, "total": len(sessions),
             "rate": round(counts["present"] * 100 / counted) if counted else None}
    profile = dict(prof) if prof else {"group_name": "", "meet_day": "", "leader": "", "project_title": "",
                                       "project_about": "", "project_status": "planned"}
    profile.pop("user_id", None)
    return {"profile": profile, "sessions": sessions, "updates": updates, "stats": stats}


@router.put("/profile")
def save_profile(body: ProfileBody, user_id: int = Depends(current_corper_id)):
    if body.meet_day and body.meet_day not in DAYS:
        raise HTTPException(status_code=400, detail="Pick a day of the week.")
    if body.project_status not in PROJECT_STATUSES:
        raise HTTPException(status_code=400, detail="Pick planned, ongoing or done.")
    conn = _connect()
    conn.execute("""INSERT INTO cds_profile (user_id, group_name, meet_day, leader, project_title, project_about, project_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET group_name = excluded.group_name, meet_day = excluded.meet_day,
                      leader = excluded.leader, project_title = excluded.project_title,
                      project_about = excluded.project_about, project_status = excluded.project_status""",
                 (user_id, body.group_name.strip(), body.meet_day, body.leader.strip(),
                  body.project_title.strip(), body.project_about.strip(), body.project_status))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/session")
def log_session(body: SessionBody, user_id: int = Depends(current_corper_id)):
    if body.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Pick present, absent or excused.")
    day = check_day(body.day)
    conn = _connect()
    try:
        exists = conn.execute("SELECT 1 FROM cds_sessions WHERE user_id = ? AND day = ?", (user_id, day)).fetchone()
        if not exists and conn.execute("SELECT COUNT(*) FROM cds_sessions WHERE user_id = ?", (user_id,)).fetchone()[0] >= MAX_SESSIONS:
            raise HTTPException(status_code=400, detail="That is the most days we can keep. Delete some old ones first.")
        # One line per day: logging the same day again replaces the old line.
        conn.execute("""INSERT INTO cds_sessions (user_id, day, status, note) VALUES (?, ?, ?, ?)
                        ON CONFLICT(user_id, day) DO UPDATE SET status = excluded.status, note = excluded.note""",
                     (user_id, day, body.status, body.note.strip()))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.delete("/session/{sid}")
def delete_session(sid: int, user_id: int = Depends(current_corper_id)):
    conn = _connect()
    cur = conn.execute("DELETE FROM cds_sessions WHERE id = ? AND user_id = ?", (sid, user_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="That day is not in your log.")
    return {"ok": True}


@router.post("/update")
def add_update(body: UpdateBody, user_id: int = Depends(current_corper_id)):
    day = check_day(body.day)
    note = body.note.strip()
    if not note:
        raise HTTPException(status_code=400, detail="Write what you did.")
    conn = _connect()
    try:
        if conn.execute("SELECT COUNT(*) FROM cds_updates WHERE user_id = ?", (user_id,)).fetchone()[0] >= MAX_UPDATES:
            raise HTTPException(status_code=400, detail="You have 100 updates already. Delete some old ones first.")
        photo = ""
        if body.photo:
            try:
                photo = photo_store.save_photo(body.photo, CDS_DIR)
            except ValueError as err:
                raise HTTPException(status_code=400, detail=str(err))
        cur = conn.execute("INSERT INTO cds_updates (user_id, day, note, photo, created_at) VALUES (?, ?, ?, ?, ?)",
                           (user_id, day, note, photo, datetime.now().isoformat(timespec="seconds")))
        conn.commit()
        return {"id": cur.lastrowid}
    finally:
        conn.close()


@router.delete("/update/{uid}")
def delete_update(uid: int, user_id: int = Depends(current_corper_id)):
    conn = _connect()
    row = conn.execute("SELECT photo FROM cds_updates WHERE id = ? AND user_id = ?", (uid, user_id)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="That update is not in your log.")
    conn.execute("DELETE FROM cds_updates WHERE id = ? AND user_id = ?", (uid, user_id))
    conn.commit()
    conn.close()
    if row["photo"] and FILE_NAME.match(row["photo"]):
        photo_store.delete_photos([row["photo"]], CDS_DIR)
    return {"ok": True}
