import sqlite3

def view_history(budget_id):
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM expenses WHERE budget_id = ?", (budget_id,))

    result = cursor.fetchall()
    if not result:
        return("Empty: No expense logged yet!")
    history_statement = []

    for row in result:
            uuid, budget_id, category, amount, description,  time, date = row
            transaction_line = {"Expense_id": uuid,
                                 "Budget_id": budget_id,
                                "Category": category,
                                "Amount": float(amount),
                                "Description": description,
                                "Timestamp": f"{date} at {time}"
            }     
            history_statement.append(transaction_line)
    return history_statement        
    