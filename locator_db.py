"""Database functions for the PPA locator: PPA, houses for rent, house agents, reviews.
Same style as the rest of the project: open the database, run SQL, close it.

Who can do what:
  * corper (corps member): saves a PPA, sees houses near it, calls/WhatsApps agents, can read reviews
                           and (if they say they have served) write reviews.
  * agent (house agent):   has an agent profile and posts houses with pictures.
"""
import sqlite3
from datetime import datetime

import photo_store

DB = "nysc_companion.db"


def _connect():
    conn = sqlite3.connect(DB, timeout=10)
    conn.row_factory = sqlite3.Row          # lets us read columns by name
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _rows_to_dicts(rows):
    return [dict(r) for r in rows]


# ---------- users ----------

def get_role(user_id):
    """'corper' or 'agent'."""
    conn = _connect()
    row = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return row["role"] if row else None


def get_user_name(user_id):
    conn = _connect()
    row = conn.execute("SELECT first_name, last_name FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


# ---------- PPA ----------

def get_ppa(user_id):
    conn = _connect()
    row = conn.execute("SELECT * FROM ppas WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def save_ppa(user_id, ppa_name, address, state, lga, town, lat=None, lon=None, photo=""):
    """Insert the PPA, or replace it if this user already saved one.
    lat/lon are the exact pin (None = not pinned). photo is a file name in uploads/ppa ('' = none)."""
    conn = _connect()
    conn.execute(
        """INSERT INTO ppas (user_id, ppa_name, address, state, lga, town, lat, lon, photo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             ppa_name = excluded.ppa_name, address = excluded.address,
             state = excluded.state, lga = excluded.lga, town = excluded.town,
             lat = excluded.lat, lon = excluded.lon, photo = excluded.photo""",
        (user_id, ppa_name, address, state, lga, town, lat, lon, photo)
    )
    conn.commit()
    conn.close()


# ---------- houses ----------
# A house is visible to corpers if an APPROVED agent posted it (or it is one of the built-in samples).

# A taken house is not shown to corps members any more.
_VISIBLE = "(h.status = 'available' AND (h.is_sample = 1 OR (u.role = 'agent' AND a.verification_status = 'approved')))"

_HOUSE_SELECT = """
    SELECT h.*,
           a.id AS agent_id, a.name AS agent_name, a.agency AS agent_agency, a.phone AS agent_phone,
           a.verification_status AS agent_status,
           (SELECT filename FROM house_photos p WHERE p.house_id = h.id ORDER BY position, id LIMIT 1) AS cover,
           (SELECT COUNT(*) FROM house_photos p WHERE p.house_id = h.id) AS photo_count,
           (SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.agent_id = a.id) AS agent_rating,
           (SELECT COUNT(*) FROM reviews r WHERE r.agent_id = a.id) AS agent_reviews
    FROM houses h
    LEFT JOIN users u ON u.id = h.owner_id
    LEFT JOIN agents a ON a.owner_id = h.owner_id
"""


def houses_near_ppa(ppa, town="", max_rent=None, min_rooms=None):
    """Only houses in the corper's own state and LGA. Houses in their own town come first."""
    sql = _HOUSE_SELECT + " WHERE lower(h.state) = lower(?) AND lower(h.lga) = lower(?) AND " + _VISIBLE
    params = [ppa["state"].strip(), ppa["lga"].strip()]
    if town:
        sql += " AND lower(h.town) LIKE ?"
        params.append("%" + town.lower() + "%")
    if max_rent is not None:
        sql += " AND h.rent_per_year <= ?"
        params.append(max_rent)
    if min_rooms is not None:
        sql += " AND h.rooms >= ?"
        params.append(min_rooms)
    sql += " ORDER BY CASE WHEN lower(h.town) = lower(?) THEN 0 ELSE 1 END, h.id DESC"
    params.append((ppa.get("town") or "").strip())

    conn = _connect()
    rows = _rows_to_dicts(conn.execute(sql, params).fetchall())
    conn.close()
    return rows


def get_house(house_id):
    """One house with all its pictures and its agent. None if it does not exist."""
    conn = _connect()
    row = conn.execute(_HOUSE_SELECT + " WHERE h.id = ?", (house_id,)).fetchone()
    if row is None:
        conn.close()
        return None
    house = dict(row)
    house["photos"] = [r["filename"] for r in conn.execute(
        "SELECT filename FROM house_photos WHERE house_id = ? ORDER BY position, id", (house_id,))]
    conn.close()
    return house


def my_houses(user_id):
    """The houses this agent posted."""
    conn = _connect()
    rows = _rows_to_dicts(conn.execute(
        _HOUSE_SELECT + " WHERE h.owner_id = ? ORDER BY h.id DESC", (user_id,)).fetchall())
    conn.close()
    return rows


def add_house(user_id, title, description, house_type, rooms, rent_per_year,
              state, lga, town, address, contact_name, contact_phone, photo_files):
    """Save the house and its pictures together. Returns the new house id."""
    conn = _connect()
    try:
        cursor = conn.execute(
            """INSERT INTO houses (owner_id, title, description, house_type, rooms, rent_per_year,
                                   state, lga, town, address, contact_name, contact_phone, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, title, description, house_type, rooms, rent_per_year,
             state, lga, town, address, contact_name, contact_phone, datetime.now().isoformat())
        )
        house_id = cursor.lastrowid
        for position, filename in enumerate(photo_files):
            conn.execute("INSERT INTO house_photos (house_id, filename, position) VALUES (?, ?, ?)",
                         (house_id, filename, position))
        conn.commit()
        return house_id
    finally:
        conn.close()


def delete_house(user_id, house_id):
    """Only the agent who posted a house can delete it. Returns True if deleted."""
    conn = _connect()
    files = [r["filename"] for r in conn.execute(
        """SELECT p.filename FROM house_photos p JOIN houses h ON h.id = p.house_id
           WHERE h.id = ? AND h.owner_id = ?""", (house_id, user_id))]
    cursor = conn.execute("DELETE FROM houses WHERE id = ? AND owner_id = ?", (house_id, user_id))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    if deleted:
        photo_store.delete_photos(files)
    return deleted


# ---------- agents ----------

_AGENT_SELECT = """
    SELECT a.*, u.role AS owner_role,
           (SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.agent_id = a.id) AS rating,
           (SELECT COUNT(*) FROM reviews r WHERE r.agent_id = a.id) AS review_count,
           (SELECT COUNT(*) FROM houses h WHERE h.owner_id = a.owner_id AND h.status = 'available') AS house_count
    FROM agents a LEFT JOIN users u ON u.id = a.owner_id
"""


def search_agents(user_id, state="", lga="", town=""):
    """Agents whose profile is filled in. State is optional (empty = all states)."""
    sql = _AGENT_SELECT + (" WHERE (a.is_sample = 1 OR (u.role = 'agent' AND a.verification_status = 'approved'))"
                           " AND a.state != '' AND a.lga != ''")
    params = []
    if state:
        sql += " AND lower(a.state) = lower(?)"
        params.append(state)
    if lga:
        sql += " AND lower(a.lga) LIKE ?"
        params.append("%" + lga.lower() + "%")
    if town:
        # An agent covers a town if it is in their list of areas (or is their LGA).
        sql += " AND (lower(a.towns) LIKE ? OR lower(a.lga) LIKE ?)"
        params += ["%" + town.lower() + "%"] * 2
    sql += " ORDER BY a.is_sample, a.id DESC"

    conn = _connect()
    rows = _rows_to_dicts(conn.execute(sql, params).fetchall())
    conn.close()
    for r in rows:
        r["mine"] = r["owner_id"] == user_id
        for private in ("owner_id", "owner_role", "office_address", "verification_note",
                        "verification_status", "reject_reason", "reviewed_at"):
            r.pop(private, None)
    return rows


def get_agent(agent_id):
    conn = _connect()
    row = conn.execute(_AGENT_SELECT + " WHERE a.id = ?", (agent_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def save_my_agent(user_id, name, agency, phone, state, lga, towns, about,
                  office_address="", verification_note=""):
    """Each agent has one profile: create it, or update it.

    Verification rules:
      * a new profile starts as 'pending';
      * a rejected agent who edits their details goes back to 'pending' (they are resubmitting);
      * an approved agent who changes phone, agency or office address goes back to 'pending',
        because the admin verified the OLD details."""
    conn = _connect()
    old = conn.execute("SELECT * FROM agents WHERE owner_id = ?", (user_id,)).fetchone()
    if old is None:
        conn.execute(
            """INSERT INTO agents (owner_id, name, agency, phone, state, lga, towns, about,
                                   office_address, verification_note, verification_status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
            (user_id, name, agency, phone, state, lga, towns, about,
             office_address, verification_note, datetime.now().isoformat()))
    else:
        status = old["verification_status"]
        if status == "rejected":
            status = "pending"
        elif status == "approved" and (old["phone"] != phone or old["agency"] != agency
                                       or old["office_address"] != office_address):
            status = "pending"
        conn.execute(
            """UPDATE agents SET name = ?, agency = ?, phone = ?, state = ?, lga = ?, towns = ?, about = ?,
                                 office_address = ?, verification_note = ?, verification_status = ?,
                                 reject_reason = CASE WHEN ? = 'pending' THEN '' ELSE reject_reason END
               WHERE owner_id = ?""",
            (name, agency, phone, state, lga, towns, about, office_address, verification_note,
             status, status, user_id))
    conn.commit()
    conn.close()


def get_my_agent(user_id):
    conn = _connect()
    row = conn.execute("SELECT * FROM agents WHERE owner_id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def count_near(table, state, lga):
    """How many houses/agents are in this LGA (used by the home page)."""
    state, lga = state.strip(), lga.strip()
    conn = _connect()
    if table == "houses":
        n = conn.execute(
            """SELECT COUNT(*) FROM houses h LEFT JOIN users u ON u.id = h.owner_id
               LEFT JOIN agents a ON a.owner_id = h.owner_id
               WHERE lower(h.state) = lower(?) AND lower(h.lga) = lower(?) AND """ + _VISIBLE,
            (state, lga)).fetchone()[0]
    else:
        n = conn.execute(
            """SELECT COUNT(*) FROM agents a LEFT JOIN users u ON u.id = a.owner_id
               WHERE lower(a.state) = lower(?) AND lower(a.lga) = lower(?)
                 AND (a.is_sample = 1 OR (u.role = 'agent' AND a.verification_status = 'approved'))""",
            (state, lga)).fetchone()[0]
    conn.close()
    return n


# ---------- admin: approving agents ----------

def list_agents_for_admin(status):
    """Agents who have filled in their details, filtered by verification status."""
    conn = _connect()
    rows = _rows_to_dicts(conn.execute(
        """SELECT a.id, a.name, a.agency, a.phone, a.state, a.lga, a.towns, a.about, a.office_address,
                  a.verification_note, a.verification_status, a.reject_reason, a.reviewed_at, a.created_at,
                  u.email, u.number AS account_number,
                  (SELECT COUNT(*) FROM houses h WHERE h.owner_id = a.owner_id) AS house_count
           FROM agents a JOIN users u ON u.id = a.owner_id
           WHERE a.is_sample = 0 AND u.role = 'agent' AND a.verification_status = ?
             AND a.office_address != '' AND a.verification_note != ''
           ORDER BY a.id DESC""", (status,)).fetchall())
    counts = {}
    for s in ("pending", "approved", "rejected"):
        counts[s] = conn.execute(
            """SELECT COUNT(*) FROM agents a JOIN users u ON u.id = a.owner_id
               WHERE a.is_sample = 0 AND u.role = 'agent' AND a.verification_status = ?
                 AND a.office_address != '' AND a.verification_note != ''""", (s,)).fetchone()[0]
    conn.close()
    return rows, counts


def set_agent_status(agent_id, status, reason=""):
    """Approve or reject an agent. Returns True if the agent exists."""
    conn = _connect()
    cursor = conn.execute(
        """UPDATE agents SET verification_status = ?, reject_reason = ?, reviewed_at = ?
           WHERE id = ? AND is_sample = 0""",
        (status, reason if status == "rejected" else "", datetime.now().isoformat(), agent_id))
    conn.commit()
    changed = cursor.rowcount > 0
    conn.close()
    return changed


# ---------- reviews ----------

def _ppa_key(ppa_name, state, lga):
    return "ppa:" + "|".join(s.strip().lower() for s in (ppa_name, state, lga))


def add_review(author_id, target_type, rating, body, service_year,
               agent_id=None, ppa_name="", state="", lga="", town=""):
    """Save a review. Raises sqlite3.IntegrityError if this person already reviewed the same thing."""
    if target_type == "agent":
        key = f"agent:{agent_id}"
    else:
        key = _ppa_key(ppa_name, state, lga)
    conn = _connect()
    try:
        conn.execute(
            """INSERT INTO reviews (author_id, target_type, target_key, agent_id, ppa_name, state, lga, town,
                                    rating, body, service_year, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (author_id, target_type, key, agent_id, ppa_name, state, lga, town,
             rating, body, service_year, datetime.now().isoformat()))
        conn.commit()
    finally:
        conn.close()


def list_reviews(user_id, target_type="", state="", lga="", q="", agent_id=None):
    sql = """SELECT r.id, r.author_id, r.target_type, r.agent_id, r.ppa_name, r.state, r.lga, r.town,
                    r.rating, r.body, r.service_year, r.created_at,
                    u.first_name, u.last_name, a.name AS agent_name, a.agency AS agent_agency
             FROM reviews r
             JOIN users u ON u.id = r.author_id
             LEFT JOIN agents a ON a.id = r.agent_id
             WHERE 1 = 1"""
    params = []
    if target_type in ("ppa", "agent"):
        sql += " AND r.target_type = ?"
        params.append(target_type)
    if agent_id is not None:
        sql += " AND r.agent_id = ?"
        params.append(agent_id)
    if state:
        sql += " AND lower(r.state) = lower(?)"
        params.append(state)
    if lga:
        sql += " AND lower(r.lga) LIKE ?"
        params.append("%" + lga.lower() + "%")
    if q:
        sql += " AND (lower(r.ppa_name) LIKE ? OR lower(r.body) LIKE ? OR lower(a.name) LIKE ?)"
        params += ["%" + q.lower() + "%"] * 3
    sql += " ORDER BY r.id DESC LIMIT 200"

    conn = _connect()
    rows = _rows_to_dicts(conn.execute(sql, params).fetchall())
    conn.close()

    reviews = []
    for r in rows:
        last = (r["last_name"] or "").strip()
        reviews.append({
            "id": r["id"],
            "mine": r["author_id"] == user_id,
            "author": r["first_name"] + (" " + last[0] + "." if last else ""),   # "Thomas T."
            "target_type": r["target_type"],
            "agent_id": r["agent_id"],
            "agent_name": r["agent_name"],
            "agent_agency": r["agent_agency"],
            "ppa_name": r["ppa_name"], "state": r["state"], "lga": r["lga"], "town": r["town"],
            "rating": r["rating"], "body": r["body"],
            "service_year": r["service_year"], "created_at": r["created_at"],
        })
    return reviews


def delete_review(user_id, review_id):
    conn = _connect()
    cursor = conn.execute("DELETE FROM reviews WHERE id = ? AND author_id = ?", (review_id, user_id))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


# ---------- sample data ----------
# Clearly-labelled sample listings so the pages are not blank on a fresh install.
# Phone numbers are dummy (0800...). Real agents' listings appear beside them.

SAMPLE_HOUSES = [
    # (title, house type, rooms, rent per year, state, lga, town, address, description)
    ("Self-contain near Gboko market", "Self-contain", 1, 250000, "Benue", "Gboko", "Gboko", "Near the main market", "Tiled floor, prepaid meter, borehole water."),
    ("2-bedroom flat, Yandev", "2-bedroom flat", 2, 450000, "Benue", "Gboko", "Yandev", "", "Fenced compound, steady water, quiet area."),
    ("Room and parlour, Makurdi North Bank", "Room and parlour", 2, 300000, "Benue", "Makurdi", "North Bank", "", "Close to the road, shared compound."),
    ("3-bedroom bungalow, Wadata", "3-bedroom flat", 3, 700000, "Benue", "Makurdi", "Wadata", "", "Big compound, security gate."),
    ("Mini flat, Gwagwalada", "Mini flat", 2, 400000, "FCT", "Gwagwalada", "Gwagwalada", "", "Prepaid meter and running water."),
    ("Self-contain, Kubwa", "Self-contain", 1, 500000, "FCT", "Bwari", "Kubwa", "", "Gated estate, good road."),
    ("Room, Surulere", "Room", 1, 350000, "Lagos", "Surulere", "Surulere", "", "Shared bathroom, close to transport."),
    ("2-bedroom flat, Otukpo", "2-bedroom flat", 2, 380000, "Benue", "Otukpo", "Otukpo", "", "Tiled, fenced, borehole."),
]

SAMPLE_AGENTS = [
    # (name, agency, state, lga, towns covered, about)
    ("Sample Agent (Gboko)", "Sample Homes", "Benue", "Gboko", "Gboko, Yandev", "Sample profile for demonstration."),
    ("Sample Agent (Makurdi)", "Sample Homes", "Benue", "Makurdi", "North Bank, Wadata", "Sample profile for demonstration."),
    ("Sample Agent (Gwagwalada)", "Sample Homes", "FCT", "Gwagwalada", "Gwagwalada", "Sample profile for demonstration."),
    ("Sample Agent (Kubwa)", "Sample Homes", "FCT", "Bwari", "Kubwa", "Sample profile for demonstration."),
    ("Sample Agent (Lagos)", "Sample Homes", "Lagos", "Surulere", "Surulere", "Sample profile for demonstration."),
]


def seed_samples():
    """Fill EMPTY tables with sample listings. Does nothing once the tables have rows."""
    conn = _connect()
    now = datetime.now().isoformat()
    if conn.execute("SELECT COUNT(*) FROM houses").fetchone()[0] == 0:
        for i, (title, kind, rooms, rent, state, lga, town, address, desc) in enumerate(SAMPLE_HOUSES):
            conn.execute(
                """INSERT INTO houses (owner_id, title, description, house_type, rooms, rent_per_year,
                                       state, lga, town, address, contact_name, contact_phone, is_sample, created_at)
                   VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sample landlord', ?, 1, ?)""",
                (title, desc, kind, rooms, rent, state, lga, town, address, f"0800000{i:04d}", now))
    if conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0] == 0:
        for i, (name, agency, state, lga, towns, about) in enumerate(SAMPLE_AGENTS):
            conn.execute(
                """INSERT INTO agents (owner_id, name, agency, phone, state, lga, towns, about, is_sample, created_at)
                   VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
                (name, agency, f"0800111{i:04d}", state, lga, towns, about, now))
    conn.commit()
    conn.close()
