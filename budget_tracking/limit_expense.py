import sqlite3

def limit_expense(budget_id, category_name, max_amount):
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    cursor = conn.cursor()
    
    try:
       cursor.execute("""
          INSERT INTO target_limits(budget_id, category_name, max_amount) VALUES (?, ?, ?) 
           """, (budget_id, category_name, float(max_amount)))
       conn.commit()
    except sqlite3.IntegrityError:
        print("Error: That target limit already exists!")

    except ValueError: 
        print("Error: Invalid number entry.")
    finally:       
        conn.close()