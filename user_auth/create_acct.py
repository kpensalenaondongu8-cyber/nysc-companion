import sqlite3
from datetime import datetime
from argon2 import PasswordHasher

ph = PasswordHasher()
def create_account(first_name, middle_name, last_name, number, email, password, role="corper"):
    
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    cursor = conn.cursor()
    hashed_password = ph.hash(password)    
    try:
        cursor.execute(
            "INSERT INTO users (first_name, middle_name, last_name, number, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (first_name, middle_name, last_name, number, email, hashed_password, role, datetime.now().isoformat(timespec="seconds"))
        )
        conn.commit()
        print("Account Created and values assigned successfully!")
    finally:
        # Runs even when the insert fails (e.g. duplicate email). Without this,
        # the half-finished insert keeps the database locked for everyone else.
        conn.close()
