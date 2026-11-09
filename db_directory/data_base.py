import sqlite3

def init__db():
    conn = sqlite3.connect("nysc_companion.db")
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")


    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            middle_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            number TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL                 
             );
    """)

    cursor.execute("""
       CREATE TABLE IF NOT EXISTS budgets (
         budget_id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER NOT NULL,
         monthly_income FLOAT NOT NULL, 
         FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE              
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS target_limits (
            limit_id INTEGER PRIMARY KEY AUTOINCREMENT,
            budget_id INTEGER NOT NULL,
            category_name TEXT NOT NULL,
            max_amount REAL NOT NULL,
            UNIQUE(budget_id, category_name),                                                                                    
            FOREIGN KEY (budget_id) REFERENCES budgets (budget_id) ON DELETE CASCADE
        );
    """)

    cursor.execute("""
       CREATE TABLE IF NOT EXISTS expenses(
        expense_uuid TEXT PRIMARY KEY,
        budget_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        time TEXT NOT NULL,
        date TEXT NOT NULL,
        FOREIGN KEY (budget_id) REFERENCES budgets (budget_id) ON DELETE CASCADE          
      );
    """)

    # Login sessions for the website: one row per logged-in browser.
    cursor.execute("""
       CREATE TABLE IF NOT EXISTS sessions(
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    """)

    # Each corps member's place of primary assignment (one per user).
    cursor.execute("""
       CREATE TABLE IF NOT EXISTS ppas(
        user_id INTEGER PRIMARY KEY,
        ppa_name TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL,
        lga TEXT NOT NULL,
        town TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    """)

    # Houses for rent. owner_id is empty for the built-in sample listings.
    cursor.execute("""
       CREATE TABLE IF NOT EXISTS houses(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        house_type TEXT NOT NULL,
        rooms INTEGER NOT NULL,
        rent_per_year REAL NOT NULL,
        state TEXT NOT NULL,
        lga TEXT NOT NULL,
        town TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        contact_name TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        is_sample INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
      );
    """)

    # House agents. towns is a comma-separated list of the areas they cover.
    cursor.execute("""
       CREATE TABLE IF NOT EXISTS agents(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER UNIQUE,
        name TEXT NOT NULL,
        agency TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL,
        state TEXT NOT NULL,
        lga TEXT NOT NULL,
        towns TEXT NOT NULL DEFAULT '',
        about TEXT NOT NULL DEFAULT '',
        is_sample INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
      );
    """)

    # Photos of a house (the pictures themselves are files in the uploads/houses folder).
    cursor.execute("""
       CREATE TABLE IF NOT EXISTS house_photos(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        house_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (house_id) REFERENCES houses (id) ON DELETE CASCADE
      );
    """)

    # Reviews written by former corps members, about a PPA or about a house agent.
    # target_key makes sure one person can review the same PPA / agent only once.
    cursor.execute("""
       CREATE TABLE IF NOT EXISTS reviews(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author_id INTEGER NOT NULL,
        target_type TEXT NOT NULL CHECK (target_type IN ('ppa', 'agent')),
        target_key TEXT NOT NULL,
        agent_id INTEGER,
        ppa_name TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT '',
        lga TEXT NOT NULL DEFAULT '',
        town TEXT NOT NULL DEFAULT '',
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        body TEXT NOT NULL,
        service_year INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (author_id, target_key),
        FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE
      );
    """)

    # Upgrade an older database: accounts now have a role, 'corper' or 'agent'.
    # Everyone who registered before this change stays a corper.
    columns = [row[1] for row in cursor.execute("PRAGMA table_info(users)")]
    if "role" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'corper'")

    # When the account was made (for the admin overview). Older accounts get the date of their first login, if known.
    if "created_at" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN created_at TEXT NOT NULL DEFAULT ''")
        cursor.execute("""UPDATE users SET created_at = COALESCE(
            (SELECT MIN(s.created_at) FROM sessions s WHERE s.user_id = users.id), '')""")

    # Agent verification: an admin approves each agent before their houses go live.
    agent_columns = [row[1] for row in cursor.execute("PRAGMA table_info(agents)")]
    if "verification_status" not in agent_columns:
        cursor.execute("ALTER TABLE agents ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending'")
        cursor.execute("UPDATE agents SET verification_status = 'approved' WHERE is_sample = 1")
    for column in ("office_address", "verification_note", "reject_reason", "reviewed_at"):
        if column not in agent_columns:
            cursor.execute(f"ALTER TABLE agents ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")

    # The exact spot of a PPA (the corper drops a pin) and a photo of its gate or signboard.
    ppa_cols = [row[1] for row in cursor.execute("PRAGMA table_info(ppas)")]
    for column, definition in [("lat", "REAL"), ("lon", "REAL"), ("photo", "TEXT NOT NULL DEFAULT ''")]:
        if column not in ppa_cols:
            cursor.execute(f"ALTER TABLE ppas ADD COLUMN {column} {definition}")

    # Houses: the agent can mark one as taken, and we count how many corps members look at it or contact the agent.
    house_cols = [row[1] for row in cursor.execute("PRAGMA table_info(houses)")]
    if "status" not in house_cols:
        cursor.execute("ALTER TABLE houses ADD COLUMN status TEXT NOT NULL DEFAULT 'available'")
    cursor.execute("""
       CREATE TABLE IF NOT EXISTS house_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        house_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        day TEXT NOT NULL,
        UNIQUE (house_id, user_id, kind, day),
        FOREIGN KEY (house_id) REFERENCES houses (id) ON DELETE CASCADE
      );
    """)

    conn.commit()
    conn.close()
if __name__ == "__main__":
    init__db()