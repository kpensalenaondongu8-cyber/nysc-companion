import json

def budget_track(monthly_income: float):
    try:
        with open("budget.json", "r") as file:
            data = json.load(file)
    except FileNotFoundError:
            print("file not found")  
            return
    budget_id = len(data)+1 

    new_budget_entry = {
        "budget_id": budget_id,
        "monthly_income": monthly_income,
        "expenses": [] 
    }
    
    data.append(new_budget_entry)

    with open("budget.json", "w") as file:
        json.dump(data, file, indent=4) 
        print("Budget initialized and saved successfully!")


