import sqlite3

def limit_expense(budget_id, category_name, max_amount):
    conn = sqlite3.connect("nysc_companion.db")
    cursor = conn.cursor()

    cursor.execute("""
      INSERT INTO target_limits(budget_id, category_name, max_amount) VALUES (?, ?, ?, ?) 
    """, (budget_id, category_name, float(max_amount)))

    conn.commit()
    conn.close()