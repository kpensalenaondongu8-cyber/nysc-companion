"""/api/checklist - the corps member's service checklist and deadlines.

What it keeps for each corps member:
  * the date they started service (the day they registered at camp) - the 12 months are counted from it
  * which steps they have ticked (a fixed list of steps, plus one "monthly clearance" tick per month)
  * their own reminders (a title and an optional date)
The step list below is a general guide. States and LGAs differ, so the page tells people to
confirm dates with their LGA inspector.
"""
import calendar
import re
import sqlite3
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import locator_db as db
from locator_routes import current_corper_id

router = APIRouter(prefix="/api/checklist")

# (stage id, stage title, [(item id, title, when, note)])
STAGES = [
    ("camp", "Orientation camp", [
        ("callup", "Print your call-up letter", "Before camp", "Bring a few copies, with your other documents."),
        ("register", "Register and get your camp number", "Day 1 of camp", "This is your service start date. Enter it above."),
        ("camp-done", "Finish the 3 weeks of orientation", "End of camp", "Keep your camp documents safe. You will need them later."),
        ("posting", "Collect your posting letter", "End of camp", "It names your PPA. Take a photo of it as a backup."),
    ]),
    ("ppa", "Settling in at your PPA", [
        ("report", "Report to your PPA", "Within the first week", "Go with your posting letter and a photocopy."),
        ("acceptance", "Get your acceptance letter signed", "First week", "Your employer signs it. Then hand it in at the LGA office."),
        ("lgi", "Meet your LGA inspector", "First two weeks", "Ask for the clearance day and where to go."),
        ("bank", "Check your allowance account", "First month", "Make sure the account details you gave are right."),
        ("cds", "Join a CDS group", "First month", "Ask the LGA office which groups meet and on what day."),
    ]),
    ("mid", "During service", [
        ("project", "Pick a community project", "Early in service", "Talk to your CDS group. Write down what you did, with photos."),
        ("cdslog", "Keep a record of your CDS attendance", "All year", "Ask the CDS leader to sign your card or sheet."),
    ]),
    ("end", "Near the end", [
        ("exit-letter", "Get your exit letter from your PPA", "Last month", "Ask for it early so it does not delay you."),
        ("final-clear", "Do your final clearance", "Last month", "Confirm the date with your LGA inspector."),
        ("pop", "Attend your passing out parade", "End of service", "Ask the LGA office where and when it holds."),
        ("cert", "Collect your discharge certificate", "After passing out", "Check that your names are spelled right before you leave."),
    ]),
]
ITEM_IDS = {item[0] for _, _, items in STAGES for item in items}
MONTH_KEY = re.compile(r"^clearance:(\d{4})-(0[1-9]|1[0-2])$")


def _connect():
    conn = db._connect()
    conn.execute("""CREATE TABLE IF NOT EXISTS checklist_settings (
        user_id INTEGER PRIMARY KEY, start_date TEXT)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS checklist_done (
        user_id INTEGER NOT NULL, item_id TEXT NOT NULL, done_at TEXT NOT NULL,
        PRIMARY KEY (user_id, item_id))""")
    conn.execute("""CREATE TABLE IF NOT EXISTS checklist_custom (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        title TEXT NOT NULL, due TEXT, done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)""")
    return conn


def add_months(d, n):
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def service_months(start):
    """The 12 calendar months of service as 'YYYY-MM' keys, starting with the month of the start date."""
    return [f"{add_months(start, i).year}-{add_months(start, i).month:02d}" for i in range(12)]


def parse_date(text):
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


class StartBody(BaseModel):
    start_date: str | None = None          # 'YYYY-MM-DD', or null to clear


class TickBody(BaseModel):
    item_id: str = Field(min_length=1, max_length=40)
    done: bool


class CustomBody(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    due: str | None = None


def _clean_custom(body):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Write what you want to be reminded of.")
    due = None
    if body.due:
        d = parse_date(body.due)
        if not d:
            raise HTTPException(status_code=400, detail="Enter the date as day, month and year.")
        due = d.isoformat()
    return title, due


@router.get("")
def get_checklist(user_id: int = Depends(current_corper_id)):
    conn = _connect()
    row = conn.execute("SELECT start_date FROM checklist_settings WHERE user_id = ?", (user_id,)).fetchone()
    done = {r["item_id"]: r["done_at"] for r in
            conn.execute("SELECT item_id, done_at FROM checklist_done WHERE user_id = ?", (user_id,))}
    custom = [dict(r) for r in conn.execute(
        "SELECT id, title, due, done FROM checklist_custom WHERE user_id = ? "
        "ORDER BY done, due IS NULL, due, id", (user_id,))]
    conn.close()

    start = parse_date(row["start_date"]) if row else None
    end = add_months(start, 12) if start else None
    stages = [{"id": sid, "title": title, "items": [
        {"id": i, "title": t, "when": w, "note": n, "done": i in done} for i, t, w, n in items]}
        for sid, title, items in STAGES]
    months = []
    if start:
        for key in service_months(start):
            months.append({"key": "clearance:" + key, "month": key, "done": ("clearance:" + key) in done})
    total = len(ITEM_IDS) + len(months)
    finished = sum(1 for s in stages for i in s["items"] if i["done"]) + sum(1 for m in months if m["done"])
    today = date.today()
    soon = (today.toordinal() + 7)
    attention = [{"id": c["id"], "title": c["title"], "due": c["due"]} for c in custom
                 if not c["done"] and c["due"] and (parse_date(c["due"]) or today).toordinal() <= soon]
    return {"attention": attention, "start_date": start.isoformat() if start else None,
            "end_date": end.isoformat() if end else None,
            "stages": stages, "months": months,
            "custom": [{**c, "done": bool(c["done"])} for c in custom],
            "progress": {"done": finished, "total": total}}


@router.put("/start")
def set_start(body: StartBody, user_id: int = Depends(current_corper_id)):
    start = None
    if body.start_date:
        start = parse_date(body.start_date)
        if not start:
            raise HTTPException(status_code=400, detail="Enter the date as day, month and year.")
        if not (date(2015, 1, 1) <= start <= add_months(date.today(), 6)):
            raise HTTPException(status_code=400, detail="That date looks wrong. Check the year.")
    conn = _connect()
    conn.execute("""INSERT INTO checklist_settings (user_id, start_date) VALUES (?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET start_date = excluded.start_date""",
                 (user_id, start.isoformat() if start else None))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/tick")
def tick(body: TickBody, user_id: int = Depends(current_corper_id)):
    item = body.item_id
    conn = _connect()
    try:
        if item not in ITEM_IDS:
            m = MONTH_KEY.match(item)
            row = conn.execute("SELECT start_date FROM checklist_settings WHERE user_id = ?", (user_id,)).fetchone()
            start = parse_date(row["start_date"]) if row else None
            if not m or not start or f"{m.group(1)}-{m.group(2)}" not in service_months(start):
                raise HTTPException(status_code=400, detail="That step does not exist.")
        if body.done:
            conn.execute("INSERT OR REPLACE INTO checklist_done (user_id, item_id, done_at) VALUES (?, ?, ?)",
                         (user_id, item, datetime.now().isoformat(timespec="seconds")))
        else:
            conn.execute("DELETE FROM checklist_done WHERE user_id = ? AND item_id = ?", (user_id, item))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.post("/custom")
def add_custom(body: CustomBody, user_id: int = Depends(current_corper_id)):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Write what you want to be reminded of.")
    due = None
    if body.due:
        d = parse_date(body.due)
        if not d:
            raise HTTPException(status_code=400, detail="Enter the date as day, month and year.")
        due = d.isoformat()
    conn = _connect()
    n = conn.execute("SELECT COUNT(*) FROM checklist_custom WHERE user_id = ?", (user_id,)).fetchone()[0]
    if n >= 50:
        conn.close()
        raise HTTPException(status_code=400, detail="You have 50 reminders already. Delete some first.")
    cur = conn.execute("INSERT INTO checklist_custom (user_id, title, due, created_at) VALUES (?, ?, ?, ?)",
                       (user_id, title, due, datetime.now().isoformat(timespec="seconds")))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"id": new_id}


@router.put("/custom/{cid}")
def edit_custom(cid: int, body: CustomBody, user_id: int = Depends(current_corper_id)):
    title, due = _clean_custom(body)
    conn = _connect()
    cur = conn.execute("UPDATE checklist_custom SET title = ?, due = ? WHERE id = ? AND user_id = ?",
                       (title, due, cid, user_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Reminder not found.")
    return {"ok": True}


@router.post("/custom/{cid}/tick")
def tick_custom(cid: int, body: dict, user_id: int = Depends(current_corper_id)):
    conn = _connect()
    cur = conn.execute("UPDATE checklist_custom SET done = ? WHERE id = ? AND user_id = ?",
                       (1 if body.get("done") else 0, cid, user_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Reminder not found.")
    return {"ok": True}


@router.delete("/custom/{cid}")
def delete_custom(cid: int, user_id: int = Depends(current_corper_id)):
    conn = _connect()
    cur = conn.execute("DELETE FROM checklist_custom WHERE id = ? AND user_id = ?", (cid, user_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Reminder not found.")
    return {"ok": True}
