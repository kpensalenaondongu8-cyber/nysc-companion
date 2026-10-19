from budget import budget_track
from add_expense import add_expense
from history import budget_history
from limit_expense import limit_expense


current_limits = {}
while True:
        print("---- Friendly Budget Tracker----")
        print()
        user_input = input("select mode/n 1.add budget/n2.limit target/n3.add expense/n4.history : ")
        print() 


        if user_input == "1":
            try:
               userinput1 = int(input("Enter Monthly_allowance: "))
               budget_track(userinput1)
            except ValueError:
                print("Invalid Input") 
                continue

        elif user_input == "2":
             user_input1 = input("Enter budget_id: ")
             limit_expense(user_input1)
             continue

        elif user_input == "3":
              userinput1 =  input("Enter budget_id: ")
              user_input2 = input("Enter category: ") 
              try:
                 user_input3 = int(input("Enter amount: "))
              except ValueError:
                   print("Invalid Input!")
                   continue   
              user_input4 = input("Enter description: ")
              add_expense(userinput1, user_input2, user_input3, user_input4)
              continue
        
        elif user_input == "4":
              user_input1 = input("Enter Budget_id: ")
              print()
              budget_history(user_input1)
              continue
        
              