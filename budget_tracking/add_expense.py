import sqlite3
from datetime import datetime



def add_expense(budget_id, category, amount, description):
    conn = sqlite3 .connect("nysc_companion.db")
    cursor = conn.cursor()
    time = datetime.now()
    time_format = time.strftime("%I:%M:%S %p")
    date_format =  time.strftime("%B-%d-%Y")
    id = len()
    


    cursor.execute(
       """INSERT INTO expenses(id, category, amount, description, time, date) VALUES (?, ?, ?, ?, ?, ?)""",  
        (budget_id, category, float(amount), description, time_format, date_format)
    )
    conn.commit()
    conn.close()
    print("Expense added successfully")