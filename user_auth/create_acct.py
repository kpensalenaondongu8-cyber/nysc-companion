import sqlite3
from argon2 import PasswordHasher

ph = PasswordHasher()
def create_account(first_name, middle_name, last_name, number, email, password):
    
    conn = sqlite3.connect("nysc_companion.db")
    cursor = conn.cursor()
    hashed_password = ph.hash(password)    
    cursor.execute(
        "INSERT INTO users (first_name, middle_name, last_name, number, email, password) VALUES (?, ?, ?, ?, ?, ?)",
        (first_name, middle_name, last_name, number, email, hashed_password)
    )
    conn.commit()
    conn.close()

    print("Table Created and values assigned successfully!")