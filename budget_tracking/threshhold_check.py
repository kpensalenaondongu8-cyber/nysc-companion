import sqlite3

def check_threshhold(budget_id, category_name, new_amount):
    conn = sqlite3.connect("nysc_companion.db", timeout=10)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT max_amount FROM target_limits WHERE budget_id = ? AND category_name = ?", (budget_id, category_name))
        result = cursor.fetchone()
        if not result:
            print("Limit not configured!")
            return False
        max_amount = result[0]

        cursor.execute("SELECT SUM(amount) FROM expenses WHERE budget_id = ? AND category = ?", (budget_id, category_name))
        row = cursor.fetchone()
        
        past_spent = 0.0 if row[0] is None else row[0]
        projected_total = past_spent + new_amount

        if projected_total > max_amount:
            print(f"⚠️ Limit Exceeded! Total: {projected_total:,.2f} / Max: {max_amount:,.2f}")
            return True
        else:
            print("✅ Transaction within budget limit.")
            return False
            
    finally:
        conn.close()
