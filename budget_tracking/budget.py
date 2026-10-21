import sqlite3

def budget_track(user_id, monthly_income: float):
    conn = sqlite3.connect("nysc_companion.db")
    cursor = conn.cursor()

    cursor.execute("""
    INSERT INTO budgets (user_id, monthly_income) VALUES (?, ?) 
    """, (user_id, monthly_income))
    conn.commit()
    conn.close()
    print("Budget initialized and saved successfully!")


