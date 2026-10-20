import json

def create_account(first_name, middle_name, last_name, number, email, password):
    with open("users.json", "r") as file:
        data = json.load(file)

        new_account = {
           "first_name": first_name,
           "middle_name": middle_name,
           "last_name": last_name,
           "number": number, 
           "email": email,
           "password": password
        }

        data.append(new_account)

    with open("users.json", "w") as file:
        json.dump(data, file, indent=4)   
        print("account created successfully") 