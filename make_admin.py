"""Make an existing account the admin (the person who approves house agents).

Usage:   python make_admin.py 08031234567
Register that phone number on the website first (as a normal corps member account),
then run this once. Log in again and you will land on the Admin page.
There is no way to become admin from the website, on purpose.
"""
import sqlite3
import sys

from db_directory.data_base import init__db

if len(sys.argv) != 2:
    sys.exit("Usage: python make_admin.py <phone number>   e.g. python make_admin.py 08031234567")

init__db()                                   # makes sure the role column exists
number = sys.argv[1].replace(" ", "").replace("-", "")
conn = sqlite3.connect("nysc_companion.db", timeout=10)
cursor = conn.execute("UPDATE users SET role = 'admin' WHERE number = ?", (number,))
conn.commit()
conn.close()
if cursor.rowcount:
    print(f"Done: {number} is now an admin. Log out and log in again.")
else:
    print(f"No account with the phone number {number}. Register it on the website first.")
