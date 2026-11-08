import os
from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from db_directory.data_base import init__db
from api_routes import router as api_router
from locator_routes import router as locator_router
from config_routes import router as config_router
from ppa_directory import router as directory_router
from locator_db import seed_samples
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
from fastapi.middleware.cors import CORSMiddleware

# The database file is found by name, so always work from this file's folder.
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Create the tables if they don't exist yet (a fresh clone has no .db file).
init__db()
seed_samples()            # sample houses and agents, only if those tables are empty

app = FastAPI()
app.include_router(locator_router)
app.include_router(config_router)
app.include_router(directory_router)
app.include_router(api_router)                      # the /api routes the pages use
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")
os.makedirs("uploads/houses", exist_ok=True)            # house pictures agents upload
os.makedirs("uploads/ppa", exist_ok=True)               # photos of PPA gates / signboards
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      
    allow_credentials=True,
    allow_methods=["*"],    
    allow_headers=["*"],
)


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
    user_d: int
    monthly_d: float

class HistoryRequest(BaseModel):
    budget_d: int

class ExpenseRequest(BaseModel):
    budget_d: int
    category_d: str
    amount_d: float
    description_d: str

class LimitRequest(BaseModel):
    budget_d: int
    category_nam: str
    amount_d: float
class BalanceRequest(BaseModel):
    budget_d : int

class PpaRequest(BaseModel):
    user_d: int
    pp_name: str
    addres: str
    stte: str
    lga: str
    town: str 
# ---------- the website pages ----------
@app.get("/")
def home():
    return RedirectResponse("/login")

@app.get("/ppa-route")
def ppa_route_page():
    return FileResponse("frontend/html_files/ppa-route.html")

@app.get("/ppa-locator")
def ppa_locator_page():
    return FileResponse("frontend/html_files/ppa.html")

@app.get("/home")
def home_page():
    return FileResponse("frontend/html_files/home.html")

@app.get("/houses")
def houses_page():
    return FileResponse("frontend/html_files/houses.html")

@app.get("/agents")
def agents_page():
    return FileResponse("frontend/html_files/agents.html")

@app.get("/agent-hub")
def agent_hub_page():
    return FileResponse("frontend/html_files/agent-hub.html")

@app.get("/admin")
def admin_page():
    return FileResponse("frontend/html_files/admin.html")

@app.get("/house")
def house_page():
    return FileResponse("frontend/html_files/house.html")

@app.get("/reviews")
def reviews_page():
    return FileResponse("frontend/html_files/reviews.html")

@app.get("/login")
def login_page():
    return FileResponse("frontend/html_files/login.html")

@app.get("/register")
def register_page():
    return FileResponse("frontend/html_files/register.html")

@app.get("/expenses")
def expenses_page():
    return FileResponse("frontend/html_files/expenses.html")

@app.post("/user_auth/create_acct")
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
            user_id = budget_data.user_d,
            monthly_income = budget_data.monthly_d
        ) 
        return{
            "status": "Success",
            "Message": "Budget innitialized successfully."
        }
    except Exception as e:
        print(f"Failed: {str(e)}")  

@app.post("/budget_tracking/history")
def view_history1(history_data: HistoryRequest):
    data_records = view_history(budget_id= history_data.budget_d)
    return{
        "status": "Success",
        "history": data_records
    }  
  
@app.post("/budget_track/add_expense")
def add_new_expense(expense_data: ExpenseRequest):
    try:
        add_expense(
            budget_id = expense_data.budget_d,
            category = expense_data.category_d,
            amount = expense_data.amount_d,
            description = expense_data.description_d
        )
        return{
            "status": "successful",
            "Message": "Expense added successfully"
        }
    except Exception as e:
        print(f"Error: {str(e)}") 

@app.post("/budget_track/limit")
def limit_exp(limit: LimitRequest):
  try:  
        limit_expense(
            budget_id = limit.budget_d,
            category_name = limit.category_nam,
            max_amount = limit.amount_d
        )
        return {
            "status": "Success",
            "Message": "limit set successfully."
        }
  except Exception as e:
      print(f"Error{str(e)}")  

@app.post("/budget_track/balance")
def view_balance1(balance: BalanceRequest):
    result = view_balance(budget_id= balance.budget_d)
    return {
        "status": "Success",
        "Message": f"{result}"
    }