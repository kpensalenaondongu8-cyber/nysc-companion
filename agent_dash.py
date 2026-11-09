"""/api/agent-dash - the house agent's dashboard.

  GET  /api/agent-dash                       numbers for every house the agent posted, and a 14-day chart
  PUT  /api/agent-dash/house/{id}            change the rent, or mark the house taken / available again
  POST /api/houses/{id}/event                a corps member tapped Call or WhatsApp (counted for the agent)

The agent sees counts only. Corps members' names and numbers are never shown to them.
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import house_events
import locator_db as db
from locator_routes import current_agent_id, current_corper_id

router = APIRouter(prefix="/api")

STATUSES = ("available", "taken")
MAX_RENT = 1_000_000_000
CHART_DAYS = 14


class HouseUpdate(BaseModel):
    rent_per_year: float | None = Field(default=None, ge=0, le=MAX_RENT)
    status: str | None = None


class EventBody(BaseModel):
    kind: str


def _tip(h):
    """One plain sentence that says what to do about a house, or None."""
    if h["status"] != "available":
        return None
    if h["days_listed"] >= 7 and h["views"] == 0:
        return "No corps member has opened this yet. Check that the state, LGA and town are right."
    if h["views"] >= 8 and h["contacts"] == 0:
        return "Corps members look at this but nobody calls. Check the rent, and whether the pictures show the house well."
    if h["days_listed"] >= 30 and h["contacts"] > 0:
        return "Listed for over a month. If it is rented, mark it as taken so people stop calling."
    return None


@router.get("/agent-dash")
def dashboard(user_id: int = Depends(current_agent_id)):
    today = date.today()
    since7 = (today - timedelta(days=6)).isoformat()
    first_day = today - timedelta(days=CHART_DAYS - 1)

    conn = house_events._connect()
    try:
        houses = [dict(r) for r in conn.execute(
            """SELECT h.id, h.title, h.town, h.house_type, h.rent_per_year, h.status, h.created_at,
                      (SELECT filename FROM house_photos p WHERE p.house_id = h.id ORDER BY position, id LIMIT 1) AS cover
               FROM houses h WHERE h.owner_id = ? ORDER BY h.status, h.id DESC""", (user_id,))]
        ids = [h["id"] for h in houses]
        events = []
        if ids:
            marks = ",".join("?" * len(ids))
            events = conn.execute(
                f"SELECT house_id, user_id, kind, day FROM house_events WHERE house_id IN ({marks})", ids).fetchall()
    finally:
        conn.close()

    by_house = {h["id"]: {"views": 0, "views7": 0, "whatsapp": 0, "calls": 0, "contacters": set(), "contacters7": set()} for h in houses}
    chart = {(first_day + timedelta(days=i)).isoformat(): 0 for i in range(CHART_DAYS)}
    for e in events:
        s = by_house[e["house_id"]]
        recent = e["day"] >= since7
        if e["kind"] == "view":
            s["views"] += 1
            if recent:
                s["views7"] += 1
            if e["day"] in chart:
                chart[e["day"]] += 1
        else:
            s["whatsapp" if e["kind"] == "whatsapp" else "calls"] += 1
            s["contacters"].add(e["user_id"])
            if recent:
                s["contacters7"].add(e["user_id"])

    out = []
    for h in houses:
        s = by_house[h["id"]]
        try:
            days = (datetime.now() - datetime.fromisoformat(h["created_at"])).days
        except ValueError:
            days = 0
        h.update(views=s["views"], views7=s["views7"], whatsapp=s["whatsapp"], calls=s["calls"],
                 contacts=len(s["contacters"]), contacts7=len(s["contacters7"]), days_listed=days)
        h["tip"] = _tip(h)
        out.append(h)

    live = [h for h in out if h["status"] == "available"]
    best = max(live, key=lambda h: (h["contacts"], h["views"]), default=None)
    return {
        "summary": {
            "available": len(live), "taken": len(out) - len(live),
            "views": sum(h["views"] for h in out), "views7": sum(h["views7"] for h in out),
            "contacts": sum(h["contacts"] for h in out), "contacts7": sum(h["contacts7"] for h in out),
            "best": {"id": best["id"], "title": best["title"]} if best and (best["views"] or best["contacts"]) else None,
        },
        "chart": [{"day": d, "views": n} for d, n in chart.items()],
        "houses": out,
    }


@router.put("/agent-dash/house/{house_id}")
def update_house(house_id: int, body: HouseUpdate, user_id: int = Depends(current_agent_id)):
    if body.rent_per_year is None and body.status is None:
        raise HTTPException(status_code=400, detail="Nothing to change.")
    if body.status is not None and body.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Pick available or taken.")
    if body.rent_per_year is not None and body.rent_per_year <= 0:
        raise HTTPException(status_code=400, detail="Enter the yearly rent in naira.")
    conn = db._connect()
    try:
        if not conn.execute("SELECT 1 FROM houses WHERE id = ? AND owner_id = ?", (house_id, user_id)).fetchone():
            raise HTTPException(status_code=404, detail="That is not one of your houses.")
        if body.rent_per_year is not None:
            conn.execute("UPDATE houses SET rent_per_year = ? WHERE id = ?", (body.rent_per_year, house_id))
        if body.status is not None:
            conn.execute("UPDATE houses SET status = ? WHERE id = ?", (body.status, house_id))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.post("/houses/{house_id}/event")
def house_event(house_id: int, body: EventBody, user_id: int = Depends(current_corper_id)):
    """Called when a corps member taps Call or WhatsApp. Only houses they can see are counted."""
    if body.kind not in ("whatsapp", "call"):
        raise HTTPException(status_code=400, detail="Unknown action.")
    house = db.get_house(house_id)
    ppa = db.get_ppa(user_id)
    if (house is None or ppa is None or house["is_sample"] or house.get("status") != "available"
            or house.get("agent_status") != "approved"
            or house["state"].strip().lower() != ppa["state"].strip().lower()
            or house["lga"].strip().lower() != ppa["lga"].strip().lower()):
        raise HTTPException(status_code=404, detail="That house was not found in your area.")
    house_events.record_event(house_id, user_id, body.kind)
    return {"ok": True}
