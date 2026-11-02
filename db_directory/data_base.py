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

    conn.commit()
    conn.close()
if __name__ == "__main__":
    init__db()