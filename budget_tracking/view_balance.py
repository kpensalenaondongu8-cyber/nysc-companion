import sqlite3


def view_balance(budget_id):
    conn = sqlite3.connect("nysc_companion.db")
    cursor = conn.cursor()

    cursor.execute("SELECT monthly_income FROM budgets WHERE budget_id = ?", (budget_id,))
    result = cursor.fetchone()
    if not result:
        print("Monthly_indome not innitialized")

    cursor.execute("SELECT SUM(amount) FROM expenses WHERE budget_id = ?", (budget_id,))
    result_sum = cursor.fetchone()
    if not result_sum:
        print("Internal Server error!")

    remaining = result - result_sum
    if remaining <= 0.0:
        print(f"Warning: You have overspent your entire allowance by {remaining}")
    print("="*19, "MONTHLY FINANCIAL SUMMARY", "="*19)  
    print(f"Total Monthly Income Allowance: {result}")
    print(f"Total Amount Spent So Far: {result_sum}") 
    print("-"*40) 
    print(f"Net Remaining Balance Available: {remaining}")    

    