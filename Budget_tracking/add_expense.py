import json
from datetime import datetime


def add_expense(budget_id, category, amount, description):
    with open("budget.json", "r") as file:
        data = json.load(file)
        
        budget_id_found = False

        for items in data:
            if str(items['budget_id']).strip() == str(budget_id).strip():
                budget_id_found = True
            
            if "expenses" not in items:
                items['expenses'] = []

            id = len(items['expenses']) + 1
            expense_id = f"F{id:03d}"
            time = datetime.now()


            new_expense = {
                "expense_id": expense_id,
                "category": category,
                "amount": amount,
                "description": description,
                "time": time.strftime("%I:%M:%S %p"),
                "date": time.strftime("%B-%d-%Y")
            }
            
            items['expenses'].append(new_expense)
            break

        if not budget_id_found:
            print("Budget_id not found!")

        with open("budget.json", "w") as file:
            json.dump(data, file, indent=4)
            print("expense added successfully")