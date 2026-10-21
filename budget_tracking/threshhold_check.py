import sqlite3

def check_threshhold(budget_id, category_name, new_amount):
    conn = sqlite3.connect("nysc_companion.db")
    cursor = conn.cursor()

    cursor.execute("""SELECT max_amount FROM target_limits WHERE budget_id = ? AND category_name = ?;
                  """, (budget_id, category_name))
    result = cursor.fetchone()
    if not result:
        print("Limit not configured!")
        conn.close()
        return False
    max_amount = result[0]

    cursor.execute("""SELECT SUM(amount) FROM expenses WHERE budget_id = ? AND category = ?;
                   """, (budget_id, category_name))
    row = cursor.fetchone()
    conn.close()

    if row[0] is None:
        past_spent = 0.0
    else:
        past_spent = row[0]

    projected_total = past_spent + new_amount

    if projected_total > max_amount:
            print(f"You are exceeding your expense limit for this category! Total: {projected_total:,.2f} / Max: {max_amount:,.2f}")
            return True
    else:
            print("Transaction within budget limit. ")
            return False 
    
          