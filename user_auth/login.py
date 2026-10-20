import sqlite3
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()
def login(user_number, user_password):
    conn = sqlite3.connect("nysc_companion.db")
    cursor = conn.cursor()

    cursor.execute(
        "SELECT password FROM users WHERE number = ?",
        (user_number,)
    )
    result = cursor.fetchone()
    conn.close()

    if result == None:
        print("Login Failed!")
        return False
    hashed_password = result[0]
    try:
        ph.verify(hashed_password, user_password)
        print("LOgin Succesful! Access granted")
        return True
    except VerifyMismatchError:
        print("Login Failed: Incorrect passowrd!")
        return False    