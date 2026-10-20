import json

def budget_history(budget_id):
    with open("budget.json", "r") as file:
        data = json.load(file)

    print("\n================ NYSC EXPENSE HISTORY ================")
    print()
    budget_id_found = False

    for items in data:
        id = items.get("budget_id")
        allowee = items.get("monthly_income")
        print(f"---- budget_id: {id} ----")
        print()
        print(f"---- Monthly_income: {allowee}")
        print()
        if str(items['budget_id']).strip() == str(budget_id).strip():
            budget_id_found = True

            expenses = items.get('expenses', [])
            if expenses == []:
                print()
                print(f"No expense added in {budget_id} yet")
                print()

            for expense in expenses:

                id = expense.get('expense_id')
                category = expense.get('category')
                amount = expense.get('amount')
                description = expense.get('description') 
                time = expense.get('time')
                date = expense.get('date')

                print(f"---- Expense_Id: {id} ----")
                print()
                print(f"---- Category: {category} ----")
                print()
                print(f"---- Amount: {amount} ----")
                print()
                print("*"*50)
                print(f"---- Description: {description} ----")
                print("*" * 50)
                print()
                print(f"---- Time: {time} ----")
                print()
                print(f"---- Date: {date} ----") 
                print()  
            break    
    if not budget_id_found:
        print("Budget id not found")

    print("\n========================================================")       