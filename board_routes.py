"""/api/board - the corps members' noticeboard for each LGA.

A corps member sees the posts of their own LGA (or of their whole state) and can post, reply,
mark their own post as done, and report anything that is not right.

  * Which LGA: taken from the PPA they saved. No saved PPA, no board.
  * Kinds of post: a question, something to sell or give away, something they are looking for, or information.
  * Phone number: never shown unless the author ticks "show my phone" on that post.
  * Safety: a post or reply reported by 3 different corps members is hidden at once. The admin sees the
    hidden ones and can bring one back or delete it. Each person has a daily limit, so nobody can flood the board.
"""
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import locator_db as db
from locator_routes import current_admin_id, current_corper_id, current_user_id

router = APIRouter(prefix="/api/board")

KINDS = {"question": "Question", "sell": "Sell or give away", "wanted": "Looking for", "info": "Information"}
HIDE_AFTER_REPORTS = 3
MAX_POSTS_PER_DAY = 5
MAX_REPLIES_PER_DAY = 25
LIST_LIMIT = 100


def _connect():
    conn = db._connect()
    conn.execute("""CREATE TABLE IF NOT EXISTS board_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        state TEXT NOT NULL, lga TEXT NOT NULL, state_key TEXT NOT NULL, lga_key TEXT NOT NULL,
        kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
        show_contact INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS board_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
        body TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS board_reports (
        kind TEXT NOT NULL, target_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY (kind, target_id, user_id))""")
    conn.execute("CREATE INDEX IF NOT EXISTS board_posts_place ON board_posts (state_key, lga_key, id)")
    return conn


def place_key(text):
    """'Gboko Local Government Area' and 'gboko' are the same place."""
    t = re.sub(r"\s+", " ", (text or "").lower().strip())
    t = re.sub(r"\s*(local government( area)?|l\.?g\.?a\.?)$", "", t).strip()
    return t


def my_place(conn, user_id):
    """The state and LGA of the PPA this corps member saved."""
    row = conn.execute("SELECT state, lga FROM ppas WHERE user_id = ?", (user_id,)).fetchone()
    if not row or not place_key(row["lga"]) or not place_key(row["state"]):
        raise HTTPException(status_code=400, detail="Save your PPA first. The board shows the corps members in your LGA.")
    return {"state": row["state"].strip(), "lga": row["lga"].strip(),
            "state_key": place_key(row["state"]), "lga_key": place_key(row["lga"])}


def author_name(first, last):
    return ((first or "Corps").strip().title() + " " + ((last or "").strip()[:1].upper() + ".")).strip()


def ago(iso):
    try:
        secs = (datetime.now() - datetime.fromisoformat(iso)).total_seconds()
    except ValueError:
        return ""
    if secs < 90:
        return "just now"
    if secs < 3600:
        return f"{int(secs // 60)} min ago"
    if secs < 86400:
        return f"{int(secs // 3600)} h ago"
    days = int(secs // 86400)
    return "yesterday" if days == 1 else f"{days} days ago"


class PostBody(BaseModel):
    kind: str
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(default="", max_length=600)
    show_contact: bool = False


class ReplyBody(BaseModel):
    body: str = Field(min_length=1, max_length=300)


class CloseBody(BaseModel):
    closed: bool


def _post_dict(r, me, reply_count=0, reported=False, phone=None):
    return {"id": r["id"], "kind": r["kind"], "kind_label": KINDS.get(r["kind"], r["kind"]),
            "title": r["title"], "body": r["body"], "lga": r["lga"], "state": r["state"],
            "author": author_name(r["first_name"], r["last_name"]), "mine": r["user_id"] == me,
            "closed": bool(r["closed"]), "when": ago(r["created_at"]), "replies": reply_count,
            "reported": reported, "phone": phone if r["show_contact"] else None}


@router.get("")
def list_posts(scope: str = "lga", kind: str = "", user_id: int = Depends(current_corper_id)):
    conn = _connect()
    try:
        place = my_place(conn, user_id)
        sql = ("SELECT p.*, u.first_name, u.last_name, u.number, "
               "(SELECT COUNT(*) FROM board_replies r WHERE r.post_id = p.id AND r.hidden = 0) AS reply_count, "
               "EXISTS(SELECT 1 FROM board_reports x WHERE x.kind = 'post' AND x.target_id = p.id AND x.user_id = ?) AS reported "
               "FROM board_posts p JOIN users u ON u.id = p.user_id WHERE p.hidden = 0 AND p.state_key = ?")
        args = [user_id, place["state_key"]]
        if scope != "state":
            sql += " AND p.lga_key = ?"
            args.append(place["lga_key"])
        if kind in KINDS:
            sql += " AND p.kind = ?"
            args.append(kind)
        sql += " ORDER BY p.closed, p.id DESC LIMIT ?"
        args.append(LIST_LIMIT)
        posts = [_post_dict(r, user_id, r["reply_count"], bool(r["reported"]), r["number"]) for r in conn.execute(sql, args)]
    finally:
        conn.close()
    return {"place": {"state": place["state"], "lga": place["lga"]}, "scope": "state" if scope == "state" else "lga",
            "kinds": KINDS, "posts": posts}


@router.post("")
def new_post(body: PostBody, user_id: int = Depends(current_corper_id)):
    if body.kind not in KINDS:
        raise HTTPException(status_code=400, detail="Pick what kind of post this is.")
    title, text = body.title.strip(), body.body.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Give your post a short title.")
    conn = _connect()
    try:
        place = my_place(conn, user_id)
        since = (datetime.now() - timedelta(days=1)).isoformat(timespec="seconds")
        if conn.execute("SELECT COUNT(*) FROM board_posts WHERE user_id = ? AND created_at > ?", (user_id, since)).fetchone()[0] >= MAX_POSTS_PER_DAY:
            raise HTTPException(status_code=429, detail=f"You can post {MAX_POSTS_PER_DAY} times a day. Try again tomorrow.")
        cur = conn.execute(
            """INSERT INTO board_posts (user_id, state, lga, state_key, lga_key, kind, title, body, show_contact, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, place["state"], place["lga"], place["state_key"], place["lga_key"], body.kind, title, text,
             1 if body.show_contact else 0, datetime.now().isoformat(timespec="seconds")))
        conn.commit()
        return {"id": cur.lastrowid}
    finally:
        conn.close()


def _visible_post(conn, post_id, user_id):
    """A post in the viewer's own state that is not hidden (the author can always see their own)."""
    place = my_place(conn, user_id)
    row = conn.execute("SELECT p.*, u.first_name, u.last_name, u.number FROM board_posts p JOIN users u ON u.id = p.user_id "
                       "WHERE p.id = ?", (post_id,)).fetchone()
    if not row or row["state_key"] != place["state_key"] or (row["hidden"] and row["user_id"] != user_id):
        raise HTTPException(status_code=404, detail="That post is not on the board any more.")
    return row


@router.get("/post/{post_id}")
def get_post(post_id: int, user_id: int = Depends(current_corper_id)):
    conn = _connect()
    try:
        row = _visible_post(conn, post_id, user_id)
        replies = [{"id": r["id"], "body": r["body"], "author": author_name(r["first_name"], r["last_name"]),
                    "mine": r["user_id"] == user_id, "when": ago(r["created_at"]),
                    "reported": bool(r["reported"])}
                   for r in conn.execute(
                       "SELECT r.*, u.first_name, u.last_name, "
                       "EXISTS(SELECT 1 FROM board_reports x WHERE x.kind = 'reply' AND x.target_id = r.id AND x.user_id = ?) AS reported "
                       "FROM board_replies r JOIN users u ON u.id = r.user_id "
                       "WHERE r.post_id = ? AND r.hidden = 0 ORDER BY r.id", (user_id, post_id))]
    finally:
        conn.close()
    return {"replies": replies}


@router.post("/{post_id}/reply")
def reply(post_id: int, body: ReplyBody, user_id: int = Depends(current_corper_id)):
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Write your reply.")
    conn = _connect()
    try:
        row = _visible_post(conn, post_id, user_id)
        if row["hidden"]:
            raise HTTPException(status_code=404, detail="That post is not on the board any more.")
        since = (datetime.now() - timedelta(days=1)).isoformat(timespec="seconds")
        if conn.execute("SELECT COUNT(*) FROM board_replies WHERE user_id = ? AND created_at > ?", (user_id, since)).fetchone()[0] >= MAX_REPLIES_PER_DAY:
            raise HTTPException(status_code=429, detail="You have replied a lot today. Try again tomorrow.")
        cur = conn.execute("INSERT INTO board_replies (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)",
                           (post_id, user_id, text, datetime.now().isoformat(timespec="seconds")))
        conn.commit()
        return {"id": cur.lastrowid}
    finally:
        conn.close()


@router.post("/{post_id}/close")
def close_post(post_id: int, body: CloseBody, user_id: int = Depends(current_corper_id)):
    conn = _connect()
    cur = conn.execute("UPDATE board_posts SET closed = ? WHERE id = ? AND user_id = ?",
                       (1 if body.closed else 0, post_id, user_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="That is not your post.")
    return {"ok": True}


@router.delete("/{post_id}")
def delete_post(post_id: int, user_id: int = Depends(current_user_id)):
    """The author can delete their own post, and the admin can delete any post."""
    conn = _connect()
    try:
        row = conn.execute("SELECT user_id FROM board_posts WHERE id = ?", (post_id,)).fetchone()
        if not row or (row["user_id"] != user_id and db.get_role(user_id) != "admin"):
            raise HTTPException(status_code=404, detail="That post is not yours or is already gone.")
        conn.execute("DELETE FROM board_replies WHERE post_id = ?", (post_id,))
        conn.execute("DELETE FROM board_reports WHERE kind = 'post' AND target_id = ?", (post_id,))
        conn.execute("DELETE FROM board_posts WHERE id = ?", (post_id,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.delete("/reply/{reply_id}")
def delete_reply(reply_id: int, user_id: int = Depends(current_user_id)):
    conn = _connect()
    try:
        row = conn.execute("SELECT user_id FROM board_replies WHERE id = ?", (reply_id,)).fetchone()
        if not row or (row["user_id"] != user_id and db.get_role(user_id) != "admin"):
            raise HTTPException(status_code=404, detail="That reply is not yours or is already gone.")
        conn.execute("DELETE FROM board_reports WHERE kind = 'reply' AND target_id = ?", (reply_id,))
        conn.execute("DELETE FROM board_replies WHERE id = ?", (reply_id,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


def _report(kind, target_id, user_id):
    table = "board_posts" if kind == "post" else "board_replies"
    conn = _connect()
    try:
        row = conn.execute(f"SELECT user_id FROM {table} WHERE id = ?", (target_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="That is not on the board any more.")
        if row["user_id"] == user_id:
            raise HTTPException(status_code=400, detail="You cannot report your own post. Delete it instead.")
        conn.execute("INSERT OR IGNORE INTO board_reports (kind, target_id, user_id, created_at) VALUES (?, ?, ?, ?)",
                     (kind, target_id, user_id, datetime.now().isoformat(timespec="seconds")))
        n = conn.execute("SELECT COUNT(*) FROM board_reports WHERE kind = ? AND target_id = ?", (kind, target_id)).fetchone()[0]
        if n >= HIDE_AFTER_REPORTS:
            conn.execute(f"UPDATE {table} SET hidden = 1 WHERE id = ?", (target_id,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.post("/{post_id}/report")
def report_post(post_id: int, user_id: int = Depends(current_corper_id)):
    return _report("post", post_id, user_id)


@router.post("/reply/{reply_id}/report")
def report_reply(reply_id: int, user_id: int = Depends(current_corper_id)):
    return _report("reply", reply_id, user_id)


# ---------- the admin ----------

@router.get("/admin/reported")
def reported(admin_id: int = Depends(current_admin_id)):
    """Everything that was hidden by reports, newest first."""
    conn = _connect()
    try:
        posts = [{"type": "post", "id": r["id"], "title": r["title"], "body": r["body"], "place": f'{r["lga"]}, {r["state"]}',
                  "author": author_name(r["first_name"], r["last_name"]), "when": ago(r["created_at"]),
                  "reports": r["reports"]}
                 for r in conn.execute(
                     "SELECT p.*, u.first_name, u.last_name, "
                     "(SELECT COUNT(*) FROM board_reports x WHERE x.kind='post' AND x.target_id=p.id) AS reports "
                     "FROM board_posts p JOIN users u ON u.id = p.user_id WHERE p.hidden = 1 ORDER BY p.id DESC LIMIT 100")]
        replies = [{"type": "reply", "id": r["id"], "title": "Reply to: " + r["post_title"], "body": r["body"],
                    "place": "", "author": author_name(r["first_name"], r["last_name"]), "when": ago(r["created_at"]),
                    "reports": r["reports"]}
                   for r in conn.execute(
                       "SELECT r.*, u.first_name, u.last_name, p.title AS post_title, "
                       "(SELECT COUNT(*) FROM board_reports x WHERE x.kind='reply' AND x.target_id=r.id) AS reports "
                       "FROM board_replies r JOIN users u ON u.id = r.user_id JOIN board_posts p ON p.id = r.post_id "
                       "WHERE r.hidden = 1 ORDER BY r.id DESC LIMIT 100")]
    finally:
        conn.close()
    return {"items": posts + replies}


@router.post("/admin/{kind}/{target_id}/restore")
def restore(kind: str, target_id: int, admin_id: int = Depends(current_admin_id)):
    """Bring a hidden post or reply back and clear its reports, so it is not hidden again by the old ones."""
    if kind not in ("post", "reply"):
        raise HTTPException(status_code=404, detail="Unknown item.")
    table = "board_posts" if kind == "post" else "board_replies"
    conn = _connect()
    cur = conn.execute(f"UPDATE {table} SET hidden = 0 WHERE id = ?", (target_id,))
    conn.execute("DELETE FROM board_reports WHERE kind = ? AND target_id = ?", (kind, target_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="That item is gone.")
    return {"ok": True}
