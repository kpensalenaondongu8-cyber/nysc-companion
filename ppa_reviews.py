"""/api/ppa-reviews - what corps members say about the PPA they serve at.

Rules that keep it honest:
  * only a corps member with a PINNED PPA can write, and only about that PPA (one review each)
  * reviews are anonymous to readers; the writer can edit or delete theirs
  * a review reported by 3 other people is hidden until the admin looks at it
  * reviews of the same place are found by position (within 200 m) plus a matching name, so
    "GSS Gboko" and "Government Secondary School Gboko" end up together
"""
import sqlite3
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import locator_db as db
from api_routes import current_user_id
from locator_routes import current_admin_id, current_corper_id
from ppa_directory import _metres, name_score

router = APIRouter(prefix="/api/ppa-reviews")

SAME_PLACE_METRES = 200
HIDE_AFTER_REPORTS = 3
BOX = 0.003                      # about 330 m: a quick filter before the exact distance check

TAGS = {
    "friendly": "Friendly staff",
    "light": "Light workload",
    "heavy": "Heavy workload",
    "cds": "Lets you attend CDS",
    "no_cds": "Hard to get off for CDS",
    "transport": "Easy to reach",
    "far": "Hard to reach",
    "extra_pay": "Pays an extra allowance",
    "housing": "Helps with accommodation",
    "welfare": "Cares about corps members",
}

_ready = False


def _connect():
    global _ready
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if not _ready:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS ppa_reviews(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL UNIQUE,
              ppa_name TEXT NOT NULL,
              state TEXT NOT NULL DEFAULT '',
              lga TEXT NOT NULL DEFAULT '',
              lat REAL NOT NULL,
              lon REAL NOT NULL,
              rating INTEGER NOT NULL,
              tags TEXT NOT NULL DEFAULT '',
              comment TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              hidden INTEGER NOT NULL DEFAULT 0,
              restored INTEGER NOT NULL DEFAULT 0,
              FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS ppa_review_reports(
              user_id INTEGER NOT NULL,
              review_id INTEGER NOT NULL,
              PRIMARY KEY (user_id, review_id),
              FOREIGN KEY (review_id) REFERENCES ppa_reviews (id) ON DELETE CASCADE,
              FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
        """)
        conn.commit()
        _ready = True
    return conn


def _now():
    return datetime.now().isoformat(timespec="seconds")


def _tag_list(text):
    return [t for t in (text or "").split(",") if t in TAGS]


def _find(conn, name, lat, lon, include_hidden=False):
    """Every review of this place."""
    rows = conn.execute(
        f"""SELECT * FROM ppa_reviews WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
            {'' if include_hidden else 'AND hidden = 0'} ORDER BY updated_at DESC""",
        (lat - BOX, lat + BOX, lon - BOX, lon + BOX)).fetchall()
    out = []
    for r in rows:
        if _metres(lat, lon, r["lat"], r["lon"]) > SAME_PLACE_METRES:
            continue
        if max(name_score(name, r["ppa_name"]), name_score(r["ppa_name"], name)) < 0.5:
            continue
        out.append(r)
    return out


def _summary(rows):
    if not rows:
        return {"count": 0, "avg": 0, "tags": []}
    counts = {}
    for r in rows:
        for t in _tag_list(r["tags"]):
            counts[t] = counts.get(t, 0) + 1
    top = sorted(counts.items(), key=lambda x: (-x[1], x[0]))[:5]
    return {"count": len(rows), "avg": round(sum(r["rating"] for r in rows) / len(rows), 1),
            "tags": [{"id": t, "label": TAGS[t], "count": n} for t, n in top]}


def _public(r, me):
    return {"id": r["id"], "rating": r["rating"], "tags": [{"id": t, "label": TAGS[t]} for t in _tag_list(r["tags"])],
            "comment": r["comment"], "when": r["updated_at"], "mine": r["user_id"] == me}


class ReviewBody(BaseModel):
    rating: int = Field(ge=1, le=5)
    tags: list[str] = Field(default_factory=list, max_length=10)
    comment: str = Field(default="", max_length=500)


class LookupBody(BaseModel):
    places: list[dict] = Field(max_length=30)


@router.get("/tags")
def tags(user_id: int = Depends(current_user_id)):
    return {"tags": [{"id": k, "label": v} for k, v in TAGS.items()]}


@router.get("")
def reviews_for(name: str = "", lat: float = 0, lon: float = 0, user_id: int = Depends(current_user_id)):
    if not name.strip() or not (lat or lon):
        raise HTTPException(status_code=400, detail="Say which place: a name and its position.")
    conn = _connect()
    try:
        rows = _find(conn, name.strip()[:150], lat, lon)
        reported = {r[0] for r in conn.execute("SELECT review_id FROM ppa_review_reports WHERE user_id = ?", (user_id,))}
        out = [dict(_public(r, user_id), reported=r["id"] in reported) for r in rows][:50]
        return {"summary": _summary(rows), "reviews": out}
    finally:
        conn.close()


@router.post("/lookup")
def lookup(body: LookupBody, user_id: int = Depends(current_user_id)):
    """The star rating of several places at once (for the search results list)."""
    conn = _connect()
    try:
        out = []
        for p in body.places:
            try:
                s = _summary(_find(conn, str(p.get("name", ""))[:150], float(p["lat"]), float(p["lon"])))
            except (KeyError, TypeError, ValueError):
                s = {"count": 0, "avg": 0, "tags": []}
            out.append({"count": s["count"], "avg": s["avg"]})
        return {"results": out}
    finally:
        conn.close()


@router.get("/mine")
def mine(user_id: int = Depends(current_user_id)):
    """My PPA, and my review of it if I wrote one. stale = I changed my PPA after writing it."""
    ppa = db.get_ppa(user_id)
    can = bool(ppa and ppa.get("lat") is not None and ppa.get("lon") is not None)
    conn = _connect()
    try:
        r = conn.execute("SELECT * FROM ppa_reviews WHERE user_id = ?", (user_id,)).fetchone()
        stale = False
        if r and can:
            stale = (_metres(ppa["lat"], ppa["lon"], r["lat"], r["lon"]) > SAME_PLACE_METRES
                     or max(name_score(ppa["ppa_name"], r["ppa_name"]), name_score(r["ppa_name"], ppa["ppa_name"])) < 0.5)
        return {
            "ppa": {"name": ppa["ppa_name"], "lat": ppa["lat"], "lon": ppa["lon"], "state": ppa["state"], "lga": ppa["lga"]} if can else None,
            "has_ppa": bool(ppa), "can_review": can,
            "review": {"rating": r["rating"], "tags": _tag_list(r["tags"]), "comment": r["comment"], "place": r["ppa_name"],
                       "hidden": bool(r["hidden"])} if r else None,
            "stale": stale,
        }
    finally:
        conn.close()


@router.put("/mine")
def save_mine(body: ReviewBody, user_id: int = Depends(current_corper_id)):
    ppa = db.get_ppa(user_id)
    if not ppa:
        raise HTTPException(status_code=400, detail="Save your PPA first, then you can review it.")
    if ppa.get("lat") is None or ppa.get("lon") is None:
        raise HTTPException(status_code=400, detail="Pin your PPA on the map first. Reviews are matched to the pin.")
    tags_ = []
    for t in body.tags:
        if t not in TAGS:
            raise HTTPException(status_code=400, detail="Unknown tag.")
        if t not in tags_:
            tags_.append(t)
    comment = " ".join(body.comment.split())[:500]
    conn = _connect()
    try:
        old = conn.execute("SELECT id FROM ppa_reviews WHERE user_id = ?", (user_id,)).fetchone()
        now = _now()
        if old:
            # saving again after the PPA changed moves the review to the new place and clears old reports
            conn.execute("""UPDATE ppa_reviews SET ppa_name=?, state=?, lga=?, lat=?, lon=?, rating=?, tags=?, comment=?, updated_at=?,
                            hidden=0, restored=0 WHERE user_id=?""",
                         (ppa["ppa_name"], ppa["state"], ppa["lga"], ppa["lat"], ppa["lon"], body.rating, ",".join(tags_), comment, now, user_id))
            conn.execute("DELETE FROM ppa_review_reports WHERE review_id = ?", (old["id"],))
        else:
            conn.execute("""INSERT INTO ppa_reviews (user_id, ppa_name, state, lga, lat, lon, rating, tags, comment, created_at, updated_at)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                         (user_id, ppa["ppa_name"], ppa["state"], ppa["lga"], ppa["lat"], ppa["lon"], body.rating, ",".join(tags_), comment, now, now))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/mine")
def delete_mine(user_id: int = Depends(current_user_id)):
    conn = _connect()
    try:
        conn.execute("DELETE FROM ppa_reviews WHERE user_id = ?", (user_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/{review_id}/report")
def report(review_id: int, user_id: int = Depends(current_user_id)):
    conn = _connect()
    try:
        r = conn.execute("SELECT * FROM ppa_reviews WHERE id = ? AND hidden = 0", (review_id,)).fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="That review is not there any more.")
        if r["user_id"] == user_id:
            raise HTTPException(status_code=400, detail="You cannot report your own review. Edit or delete it instead.")
        conn.execute("INSERT OR IGNORE INTO ppa_review_reports (user_id, review_id) VALUES (?, ?)", (user_id, review_id))
        n = conn.execute("SELECT COUNT(*) FROM ppa_review_reports WHERE review_id = ?", (review_id,)).fetchone()[0]
        if n >= HIDE_AFTER_REPORTS and not r["restored"]:
            conn.execute("UPDATE ppa_reviews SET hidden = 1 WHERE id = ?", (review_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- admin ----------

@router.get("/admin/reported")
def admin_reported(admin_id: int = Depends(current_admin_id)):
    conn = _connect()
    try:
        rows = conn.execute("""SELECT r.*, (SELECT COUNT(*) FROM ppa_review_reports x WHERE x.review_id = r.id) AS reports
                               FROM ppa_reviews r
                               WHERE r.hidden = 1 OR EXISTS (SELECT 1 FROM ppa_review_reports x WHERE x.review_id = r.id)
                               ORDER BY r.hidden DESC, reports DESC, r.updated_at DESC LIMIT 50""").fetchall()
        return {"reviews": [{"id": r["id"], "ppa_name": r["ppa_name"], "state": r["state"], "lga": r["lga"], "rating": r["rating"],
                             "comment": r["comment"], "reports": r["reports"], "hidden": bool(r["hidden"])} for r in rows]}
    finally:
        conn.close()


@router.post("/admin/{review_id}/keep")
def admin_keep(review_id: int, admin_id: int = Depends(current_admin_id)):
    """The review is fine: show it again and stop later reports from hiding it."""
    conn = _connect()
    try:
        if not conn.execute("SELECT 1 FROM ppa_reviews WHERE id = ?", (review_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Review not found.")
        conn.execute("UPDATE ppa_reviews SET hidden = 0, restored = 1 WHERE id = ?", (review_id,))
        conn.execute("DELETE FROM ppa_review_reports WHERE review_id = ?", (review_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/admin/{review_id}")
def admin_delete(review_id: int, admin_id: int = Depends(current_admin_id)):
    conn = _connect()
    try:
        conn.execute("DELETE FROM ppa_reviews WHERE id = ?", (review_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
