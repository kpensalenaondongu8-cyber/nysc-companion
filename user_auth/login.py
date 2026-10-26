import sqlite3
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()
def login(user_number, user_password):
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, password FROM users WHERE number = ?",
        (user_number,)
    )
    result = cursor.fetchone()
    conn.close()

    if result == None:
        print("Login Failed!")
        return False
    user_db_id = result[0]
    hashed_password = result[1]
    try:
        ph.verify(hashed_password, user_password)
        print("Login Succesful! Access granted")
        return user_db_id
    
    except VerifyMismatchError:
        print("Login Failed: Incorrect passowrd!")
        return False    