import json
from datetime import datetime


def add_expense(budget_id, category, amount, description):  
        
    with open("budget.json", "r") as file:
        data = json.load(file)  
        budget_id_found = False
        for budget in data: 
            if str(budget['budget_id']).strip() == str(budget_id).strip():
                budget_id_found = True
            if "expenses" not in budget:
                budget['expenses'] = []
            
            now = datetime.now()
            expense_id = len(budget['expenses'])+1

            new_expense = {
                "expense_id": expense_id,
                "category": category,
                "amount": amount,
                "description": description,
                "date": now.strftime("%B-%d-%Y")

            }
            for item in data:
                item["expenses"].append(new_expense)

            with open("budget.json", "w") as file:
                json.dump(item, file, indent=4)    
        if budget_id_found == False:
            print("Budget id not found")
            return False
