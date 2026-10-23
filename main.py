import sys
import sqlite3
from data_base import init__db
from user_auth.create_acct import create_account
from user_auth.login import login
from budget_tracking.budget import budget_track
from budget_tracking.limit_expense import limit_expense
from budget_tracking.add_expense import  add_expense
from budget_tracking.history import  view_history

def main_menu():
    init__db()
    
    current_user_id = None
    active_budget_id = None

    while True:
        print("\n=================== 🇳🇬 NYSC COMPANION ENGINE ===================")
        if not current_user_id:
            print("1. 📝 Create Account (Sign Up)")
            print("2. 🔑 Login")
            print("3. ❌ Exit")
        else:
            print(f"👤 Logged In User ID: {current_user_id} | Active Budget Cycle: {active_budget_id}")
            print("4. 💰 Initialize Monthly Budget Allowance")
            print("5. 🎯 Set Category Target Spending Limits")
            print("6. 💸 Log a New Expense Receipt")
            print("7. 📋 View Transaction History Statement")
            print("8. 🚪 Logout")
            print("9. ❌ Exit")
        print("==================================================================")
        
        choice = input("Select an action item index: ").strip()

        if choice == "1" and not current_user_id:
            f_name = input("First Name: ").strip()
            m_name = input("Middle Name: ").strip()
            l_name = input("Last Name: ").strip()
            num = input("Phone Number: ").strip()
            email = input("Email Address: ").strip()
            pwd = input("Password: ").strip()
            create_account(f_name, m_name, l_name, num, email, pwd)

        elif choice == "2" and not current_user_id:
            num = input("Registered Phone Number: ").strip()
            pwd = input("Password: ").strip()
            user_id = login(num, pwd) 
            
            if user_id:
                current_user_id = user_id
                
                conn = sqlite3.connect("nysc_companion.db")
                cursor = conn.cursor()
                
                cursor.execute("SELECT budget_id FROM budgets WHERE user_id = ?", (user_id,))
                existing_budget = cursor.fetchone()
                conn.close()
                
                if existing_budget:
                    active_budget_id = existing_budget[0]
                    print(f"📂 Welcome back! Loaded active budget cycle ID: {active_budget_id}")

        elif choice == "4" and current_user_id:
            income = input("Enter Monthly Income Allowance (e.g. 33000): ").strip()
            try:
                b_id = budget_track(current_user_id, float(income))
                active_budget_id = b_id
            except ValueError:
                print("❌ Mathematical format error: Input must be a number.")

        elif choice == "5" and current_user_id:
            if not active_budget_id:
                print("⚠️ Action required: Initialize a monthly budget cycle first (Option 4)!")
                continue
            cat = input("Enter Category Target Name (e.g., 'Food', 'Data'): ").strip()
            limit = input(f"Enter Maximum Spending Limit for '{cat}': ").strip()
            try:
                limit_expense(active_budget_id, cat, float(limit))
            except ValueError:
                print("❌ Mathematical format error: Limit must be a decimal value.")

        elif choice == "6" and current_user_id:
            if not active_budget_id:
                print("⚠️ Action required: Open a budget cycle first (Option 4)!")
                continue
            cat = input("Expense Category (e.g., 'Food', 'Data'): ").strip()
            amt = input("Transaction Cost Amount: ").strip()
            desc = input("Item/Receipt Description: ").strip()
            try:
                add_expense(active_budget_id, cat, float(amt), desc)
            except ValueError:
                print("❌ Mathematical format error: Amount must be numeric.")

        elif choice == "7" and current_user_id:
            if not active_budget_id:
                print("⚠️ No statement history found: Open an active budget cycle first.")
                continue
            view_history(active_budget_id)

        elif choice == "8" and current_user_id:
            current_user_id = None
            active_budget_id = None
            print("🚪 Logged out cleanly.")

        elif choice in ["3", "9"]:
            print("👋 System shutting down safely. Goodbye!")
            sys.exit()
        else:
            print("❌ Selection out of bounds or unauthorized. Try again.")

if __name__ == "__main__":
    main_menu()
