import sqlite3

def budget_track(user_id, monthly_income: float):
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    cursor = conn.cursor()

    cursor.execute("""
    INSERT INTO budgets (user_id, monthly_income) VALUES (?, ?) 
    """, (user_id, monthly_income))

    generated_id = cursor.lastrowid
    conn.commit()
    conn.close()
    print("Budget initialized and saved successfully!")
    return generated_id


