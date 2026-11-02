"""Database functions for the PPA locator: PPA, houses for rent, house agents.
Same style as the rest of the project: open the database, run SQL, close it."""
import sqlite3
from datetime import datetime

DB = "nysc_companion.db"


def _connect():
    conn = sqlite3.connect(DB, timeout=10)
    conn.row_factory = sqlite3.Row          # lets us read columns by name
    return conn


def _rows_to_dicts(rows):
    return [dict(r) for r in rows]


# ---------- PPA ----------

def get_ppa(user_id):
    conn = _connect()
    row = conn.execute("SELECT * FROM ppas WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def save_ppa(user_id, ppa_name, address, state, lga, town):
    """Insert the PPA, or replace it if this user already saved one."""
    conn = _connect()
    conn.execute(
        """INSERT INTO ppas (user_id, ppa_name, address, state, lga, town)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             ppa_name = excluded.ppa_name, address = excluded.address,
             state = excluded.state, lga = excluded.lga, town = excluded.town""",
        (user_id, ppa_name, address, state, lga, town)
    )
    conn.commit()
    conn.close()


# ---------- houses ----------

def search_houses(user_id, state, lga="", town="", max_rent=None, min_rooms=None):
    """State must match exactly. LGA and town match if the text appears in them."""
    sql = "SELECT * FROM houses WHERE lower(state) = lower(?)"
    params = [state]
    if lga:
        sql += " AND lower(lga) LIKE ?"
        params.append("%" + lga.lower() + "%")
    if town:
        sql += " AND lower(town) LIKE ?"
        params.append("%" + town.lower() + "%")
    if max_rent is not None:
        sql += " AND rent_per_year <= ?"
        params.append(max_rent)
    if min_rooms is not None:
        sql += " AND rooms >= ?"
        params.append(min_rooms)
    sql += " ORDER BY id DESC"

    conn = _connect()
    rows = _rows_to_dicts(conn.execute(sql, params).fetchall())
    conn.close()
    for r in rows:
        r["mine"] = r["owner_id"] == user_id    # the page shows a Delete button for these
        del r["owner_id"]
    return rows


def add_house(user_id, title, description, house_type, rooms, rent_per_year,
              state, lga, town, address, contact_name, contact_phone):
    conn = _connect()
    conn.execute(
        """INSERT INTO houses (owner_id, title, description, house_type, rooms, rent_per_year,
                               state, lga, town, address, contact_name, contact_phone, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user_id, title, description, house_type, rooms, rent_per_year,
         state, lga, town, address, contact_name, contact_phone, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()


def delete_house(user_id, house_id):
    """Only the person who posted a house can delete it. Returns True if deleted."""
    conn = _connect()
    cursor = conn.execute("DELETE FROM houses WHERE id = ? AND owner_id = ?", (house_id, user_id))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


# ---------- agents ----------

def search_agents(user_id, state, lga="", town=""):
    sql = "SELECT * FROM agents WHERE lower(state) = lower(?)"
    params = [state]
    if lga:
        sql += " AND lower(lga) LIKE ?"
        params.append("%" + lga.lower() + "%")
    if town:
        # An agent covers a town if it is in their list of areas (or is their LGA).
        sql += " AND (lower(towns) LIKE ? OR lower(lga) LIKE ?)"
        params += ["%" + town.lower() + "%"] * 2
    sql += " ORDER BY id DESC"

    conn = _connect()
    rows = _rows_to_dicts(conn.execute(sql, params).fetchall())
    conn.close()
    for r in rows:
        r["mine"] = r["owner_id"] == user_id
        del r["owner_id"]
    return rows


def save_my_agent(user_id, name, agency, phone, state, lga, towns, about):
    """Each user can have one agent profile: create it, or update it."""
    conn = _connect()
    conn.execute(
        """INSERT INTO agents (owner_id, name, agency, phone, state, lga, towns, about, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(owner_id) DO UPDATE SET
             name = excluded.name, agency = excluded.agency, phone = excluded.phone,
             state = excluded.state, lga = excluded.lga, towns = excluded.towns, about = excluded.about""",
        (user_id, name, agency, phone, state, lga, towns, about, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()


def get_my_agent(user_id):
    conn = _connect()
    row = conn.execute("SELECT * FROM agents WHERE owner_id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_my_agent(user_id):
    conn = _connect()
    conn.execute("DELETE FROM agents WHERE owner_id = ?", (user_id,))
    conn.commit()
    conn.close()


def count_near(table, state, lga):
    """How many houses/agents are in this LGA (used by the home page)."""
    conn = _connect()
    n = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE lower(state) = lower(?) AND lower(lga) = lower(?)",
                     (state, lga)).fetchone()[0]
    conn.close()
    return n


# ---------- sample data ----------

# (title, type, rooms, rent per year, state, lga, town, address, description)
SAMPLE_HOUSES = [
    ("Self-contain near Gboko market", "Self-contain", 1, 180000, "Benue", "Gboko", "Gboko", "Off Jos Road", "Tiled, own toilet and kitchen, prepaid meter."),
    ("2-bedroom flat, Yandev", "2-bedroom flat", 2, 350000, "Benue", "Gboko", "Yandev", "Behind the secondary school", "Fenced compound, borehole water."),
    ("Room and parlour, Makurdi North Bank", "Room and parlour", 1, 220000, "Benue", "Makurdi", "North Bank", "Close to the bridge", "Quiet street, gate and security light."),
    ("3-bedroom bungalow, Wadata", "3-bedroom flat", 3, 600000, "Benue", "Makurdi", "Wadata", "Wadata Plaza area", "Large compound, ideal to share between corps members."),
    ("Mini flat, Gwagwalada", "Mini flat", 1, 450000, "FCT", "Gwagwalada", "Gwagwalada", "Near the university", "Prepaid meter, water available."),
    ("Self-contain, Kubwa", "Self-contain", 1, 500000, "FCT", "Bwari", "Kubwa", "Phase 4", "Tiled floor, fenced estate, steady light."),
    ("2-bedroom flat, Lugbe", "2-bedroom flat", 2, 800000, "FCT", "Abuja Municipal", "Lugbe", "Airport road", "Gated estate, parking space."),
    ("Room and parlour, Ikorodu", "Room and parlour", 1, 400000, "Lagos", "Ikorodu", "Ikorodu", "Near the bus terminal", "Tiled, prepaid meter."),
    ("Self-contain, Ojo", "Self-contain", 1, 350000, "Lagos", "Ojo", "Ojo", "Near the barracks", "Gate, borehole, own kitchen."),
    ("Mini flat, Kaduna North", "Mini flat", 1, 300000, "Kaduna", "Kaduna North", "Kawo", "Kawo roundabout", "Own meter, secure compound."),
    ("2-bedroom flat, Port Harcourt", "2-bedroom flat", 2, 900000, "Rivers", "Port Harcourt", "Rumuokoro", "Off East-West road", "Prepaid meter, water tank."),
    ("Self-contain, Ibadan", "Self-contain", 1, 250000, "Oyo", "Ibadan North", "Bodija", "Near the market", "Tiled floor, fenced compound."),
]

# (name, agency, state, lga, towns, about)
SAMPLE_AGENTS = [
    ("Sample Agent (Gboko)", "Sample Homes Gboko", "Benue", "Gboko", "Gboko, Yandev, Aliade", "Rooms and flats for corps members around Gboko."),
    ("Sample Agent (Makurdi)", "Sample Properties Makurdi", "Benue", "Makurdi", "North Bank, Wadata, High Level", "Houses near Makurdi PPAs and the orientation camp."),
    ("Sample Agent (Gwagwalada)", "Sample Estates Gwagwalada", "FCT", "Gwagwalada", "Gwagwalada, Kuje", "Self-contains and mini flats near the university."),
    ("Sample Agent (Kubwa)", "Sample Realty Kubwa", "FCT", "Bwari", "Kubwa, Bwari", "Affordable flats around Kubwa."),
    ("Sample Agent (Lagos)", "Sample Lagos Rentals", "Lagos", "Ikorodu", "Ikorodu, Ojo, Badagry", "Corps member friendly rentals across Lagos."),
    ("Sample Agent (Kaduna)", "Sample Kaduna Homes", "Kaduna", "Kaduna North", "Kawo, Barnawa", "Short-term and yearly rentals."),
    ("Sample Agent (Port Harcourt)", "Sample PH Properties", "Rivers", "Port Harcourt", "Rumuokoro, Rumuola", "Flats around Port Harcourt."),
    ("Sample Agent (Ibadan)", "Sample Ibadan Estates", "Oyo", "Ibadan North", "Bodija, Agodi", "Rooms near Ibadan PPAs."),
]


def seed_samples():
    """Fill empty tables with clearly-labelled sample listings so the pages are not blank.
    Phone numbers are dummy (0800 000 000x). Real users' listings sit beside them."""
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
