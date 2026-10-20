import json

def limit_expense(budget_id):
    with open("budget.json", "r") as file:
        data = json.load(file)
        
        budget_id_found = False
        for budgets in data:
            if str(budgets.get('budget_id')).strip() == str(budget_id).strip():
                budget_id_found = True

            if  "target_limit" not in budgets:
                budgets['target_limit'] = {}
            while True:
                    userinput1 = input("Enter category. (eg 'food', 'data') or 'quit'").strip()
                    if userinput1.lower() == 'quit':
                        break
                    try:
                        userinput2 = int(input("Enter target_limit: "))       
                    except ValueError:
                        print("Only numbers are allowed!")

                    budgets['target_limit'][userinput1] = userinput2
                    print(f"Adding category: {userinput1}")
            if budget_id_found:
                break
        if not budget_id_found:
            print("budget id not found")
    with open("budget.json", "w") as file:
        json.dump(data, file, indent=4)
        print("target set successfully")                

