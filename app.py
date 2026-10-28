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

@app.get("/")
def home():
    return{"message": "Welcome to the NYSC Companion Web Server!"}

@app.post("/auth/SignUp")
def signup(user_data: SignUpRequest):
    print(f"Data arrived successfully! First_Name: {user_data.first_name}")
    return{"Status": "Ok",
           "Message": f"Hey {user_data.first_name} your request reached the server"}
@app.post("/auth/login")
def login(login_data: LoginRequest):
    user_id = login(
        user_number = login_data.number,
        user_password = login_data.password
    )
    if user_id:
        return {"status": "Ok",
                "message": "Login Successful!"
                }
    else:
        return{"status": "failed",
               "message": "Login Failed: Wrong number or password."}  