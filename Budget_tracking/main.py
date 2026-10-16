from budget import budget_track
from add_expense import add_expense


while True:
        print("---- Friendly Budget Tracker----")
        user_input = input("select mode/n 1.add budget/n2.add expense:: ") 


        if user_input == "1":
            userinput1 = input("Enter Monthly_allowance: ").strip()
            budget_track(userinput1)
            continue

        elif user_input == "2":
              userinput1 =  input("Enter budget_id: ")
              user_input2 = input("Enter category: ") 
              user_input3 = input("Enter amount: ")
              user_input4 = input("Enter description: ")
              add_expense(userinput1, user_input2, user_input3, user_input4)
              continue