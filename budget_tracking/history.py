import sqlite3

def view_history(budget_id):
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM expenses WHERE budget_id = ?", (budget_id,))

    result = cursor.fetchall()
    if not result:
        print("Empty: No expense logged yet!")
    else:
        for row in result:
            uuid, budget_id, category, amount, description,  time, date = row
            print(f"Expense_id: {uuid}\nBudget_id: {budget_id}\nCategory: {category}\nAmount: {float(amount):,.2f}\nDescription: {description}\nTimestamp: {date} at {time}")     

    