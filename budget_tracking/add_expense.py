import sqlite3
from datetime import datetime



def add_expense(budget_id, category, amount, description):
    conn = sqlite3 .connect("nysc_companion.db")
    cursor = conn.cursor()


    cursor.execute("SELECT COUNT(*) FROM expenses WHERE budget_id = ?", (budget_id,))
    current_count = cursor.fetchone()[0]
    time = datetime.now()
    time_format = time.strftime("%I:%M:%S %p")
    date_format =  time.strftime("%B-%d-%Y")
    next_id = current_count + 1
    expense_uuid = f"F{next_id:03d}"
    


    cursor.execute(
       """INSERT INTO expenses(expense_uuid, budget_id, category, amount, description, time, date) VALUES (?, ?, ?, ?, ?, ?, ?)""",  
        (expense_uuid, budget_id, category, float(amount), description, time_format, date_format)
    )
    conn.commit()
    conn.close()
    print("Expense added successfully")