from fastapi import FastAPI
from budget_tracking.budget import budget_track
from budget_tracking.add_expense import add_expense
from budget_tracking.history import view_history
from budget_tracking.limit_expense import limit_expense
from budget_tracking.threshhold_check import check_threshhold
from budget_tracking.view_balance import view_balance
from user_auth.create_acct import create_account
from user_auth.login import login
from pydantic import BaseModel, EmailStr
import sqlite3

app = FastAPI()
class SignUpRequest(BaseModel):
    first_name: str
    middle_name: str
    last_name: str
    email: str
    number: str
    password: str  

class LoginRequest(BaseModel):
    number: str
    password: str

class BudgetRequest(BaseModel):
    user_id: int
    monthly_income: float
    
@app.get("/")
def home():
    return{"message": "Welcome to the NYSC Companion Web Server!"}

@app.post("/user_auth/create_acct)")
def signup(user_data: SignUpRequest):
    try:  
            create_account(
                first_name = user_data.first_name,
                middle_name = user_data.middle_name,
                last_name = user_data.last_name,
                number = user_data.number,
                email = user_data.email,
                password = user_data.password
            )
            return{
            "status": "Success",
                "message": "account created successfully."
                }
             
    except sqlite3.IntegrityError as e:
        error_msg = str(e)
        if "users.email" in error_msg:
            return {"status": "Failed", "message": "Registration blocked: This email address is already in use."}
        elif "users.number" in error_msg:
            return {"status": "Failed", "message": "Registration blocked: This phone number is already in use."}
        else:
            return {"status": "Failed", "message": f"Database integrity block: {error_msg}"}
            
    except Exception as e:
        return {"status": "Error", "message": f"System execution failure: {str(e)}"}

@app.post("/user_auth/login")
def login_user(login_data: LoginRequest):
    user_id = login(
        user_number = login_data.number,
        user_password = login_data.password
    )
    if user_id:
        return {"status": "Success",
                "message": "Login Successful! Access granted.",
                "user_id": user_id
                }
    else:
        return{
               "status": "failed",
               "message": "Login Failed: Invalid phone number or password."
               }  
@app.post("/budget_tracking/budget") 
def budget(budget_data: BudgetRequest):
    try: 
        budget_track(
            user_id = budget_data.user_id,
            monthly_income = budget_data.monthly_income
        ) 
        return{
            "status": "Success",
            "Message": "Budget innitialized successfully."
        }
    except Exception as e:
        print(f"Failed: {str(e)}")  

@app.get("/budget_tracking/history")