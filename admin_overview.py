"""/api/admin/overview - the admin's picture of the whole app.

Counts only. It shows how many corps members, agents, houses and posts there are, what is waiting
for the admin, how many new accounts joined each day, and, for each LGA, how many corps members
there are next to how many houses are on offer. No names, numbers or messages are returned.
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends

import locator_db as db
from locator_routes import current_admin_id

router = APIRouter(prefix="/api/admin")

CHART_DAYS = 14
LGA_ROWS = 12


def _one(conn, sql, args=()):
    return conn.execute(sql, args).fetchone()[0] or 0


def _table_exists(conn, name):
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


@router.get("/overview")
def overview(admin_id: int = Depends(current_admin_id)):
    conn = db._connect()
    try:
        today = date.today()
        week_ago = (datetime.now() - timedelta(days=7)).isoformat(timespec="seconds")

        corpers = _one(conn, "SELECT COUNT(*) FROM users WHERE role = 'corper'")
        agents = {s: _one(conn, """SELECT COUNT(*) FROM agents a JOIN users u ON u.id = a.owner_id
                                   WHERE a.is_sample = 0 AND u.role = 'agent' AND a.verification_status = ?
                                     AND a.office_address != '' AND a.verification_note != ''""", (s,))
                  for s in ("pending", "approved", "rejected")}
        live = """h.is_sample = 0 AND EXISTS (SELECT 1 FROM agents a WHERE a.owner_id = h.owner_id
                                              AND a.verification_status = 'approved')"""
        houses = {
            "available": _one(conn, f"SELECT COUNT(*) FROM houses h WHERE {live} AND h.status = 'available'"),
            "taken": _one(conn, f"SELECT COUNT(*) FROM houses h WHERE {live} AND h.status = 'taken'"),
        }
        reviews = _one(conn, "SELECT COUNT(*) FROM reviews")
        active_week = _one(conn, """SELECT COUNT(DISTINCT s.user_id) FROM sessions s JOIN users u ON u.id = s.user_id
                                    WHERE u.role != 'admin' AND s.created_at >= ?""", (week_ago,))

        posts = hidden_posts = hidden_replies = 0
        if _table_exists(conn, "board_posts"):
            posts = _one(conn, "SELECT COUNT(*) FROM board_posts WHERE hidden = 0")
            hidden_posts = _one(conn, "SELECT COUNT(*) FROM board_posts WHERE hidden = 1")
            hidden_replies = _one(conn, "SELECT COUNT(*) FROM board_replies WHERE hidden = 1")

        # New accounts per day (corps members and agents together), last 14 days.
        start = today - timedelta(days=CHART_DAYS - 1)
        per_day = {r[0]: r[1] for r in conn.execute(
            """SELECT substr(created_at, 1, 10) d, COUNT(*) FROM users
               WHERE role != 'admin' AND created_at >= ? GROUP BY d""", (start.isoformat(),))}
        chart = []
        for i in range(CHART_DAYS):
            d = (start + timedelta(days=i)).isoformat()
            chart.append({"day": d, "new": per_day.get(d, 0)})
        new_week = sum(c["new"] for c in chart[-7:])

        # Corps members and houses on offer, side by side, for each LGA.
        want = {}
        for r in conn.execute("""SELECT p.state, p.lga, COUNT(*) FROM ppas p JOIN users u ON u.id = p.user_id
                                 WHERE u.role = 'corper' AND p.lga != '' GROUP BY lower(trim(p.state)), lower(trim(p.lga))"""):
            want[(r[0].strip().lower(), r[1].strip().lower())] = {"state": r[0].strip(), "lga": r[1].strip(), "corpers": r[2], "houses": 0}
        for r in conn.execute(f"""SELECT h.state, h.lga, COUNT(*) FROM houses h WHERE {live} AND h.status = 'available'
                                  GROUP BY lower(trim(h.state)), lower(trim(h.lga))"""):
            key = (r[0].strip().lower(), r[1].strip().lower())
            row = want.setdefault(key, {"state": r[0].strip(), "lga": r[1].strip(), "corpers": 0, "houses": 0})
            row["houses"] = r[2]
        places = sorted(want.values(), key=lambda x: (-x["corpers"], -x["houses"], x["lga"]))
        # Places where corps members are waiting on houses: the list the admin can act on (find agents there).
        short = [p for p in places if p["corpers"] >= 1 and p["houses"] == 0]
        places = places[:LGA_ROWS]
    finally:
        conn.close()

    return {
        "totals": {"corpers": corpers, "agents": agents, "houses": houses, "reviews": reviews,
                   "posts": posts, "active_week": active_week, "new_week": new_week},
        "attention": {"agents_waiting": agents["pending"], "hidden_posts": hidden_posts,
                      "hidden_replies": hidden_replies},
        "chart": chart,
        "places": places,
        "no_houses": [{"state": p["state"], "lga": p["lga"], "corpers": p["corpers"]} for p in short[:LGA_ROWS]],
    }
