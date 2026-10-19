import json

def limit_expense(budget_id):
    with open("budget.json", "r") as file:
        data = json.load(file)

        budget_found = False

        for budget in data:
            if str(budget.get('budget_id')).strip() == str(budget_id).strip():
                budget_found = True

            if 'limit_target' not in budget:
                budget['limit_target'] = {}
            while True:
                user_input1 = input("Enter category (eg. 'Food', 'Transport') or quit ").strip
                if user_input1 == 'quit' or user_input1 is not user_input1:
                    break

                user_input2 = input(f"Enter target for {user_input1}: ")
                if user_input2.lower() == 'quit':
                    break   

                budget['limit_target'][user_input1] = user_input2

            if budget_found:
                break
        if not budget_found:
            print(f"{budget_id} not found")
    with open("budget.json", "w") as file:
        json.dump(data, file, indent=4)
        print("target set successfully")                    