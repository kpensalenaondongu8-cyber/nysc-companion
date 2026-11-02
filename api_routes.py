"""The /api routes the website talks to.

Every route here reuses your existing functions (create_account, login,
add_expense ...) and returns plain JSON for the pages to draw.
"""
import re
import sqlite3

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from user_auth.create_acct import create_account
from user_auth.login import login
from user_auth.session import create_session, get_user_id, delete_session
from budget_tracking.add_expense import add_expense
from budget_tracking.dashboard import get_budget, save_allowance, save_limit, build_dashboard

router = APIRouter(prefix="/api")


# ---------- what the browser is allowed to send us ----------

class RegisterBody(BaseModel):
    first_name: str = Field(min_length=1, max_length=50)
    middle_name: str = Field(default="", max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    number: str
    email: str
    password: str = Field(min_length=8, max_length=128)

class LoginBody(BaseModel):
    number: str
    password: str

class AllowanceBody(BaseModel):
    monthly_income: float = Field(gt=0, lt=100_000_000)

class ExpenseBody(BaseModel):
    category: str = Field(min_length=1, max_length=40)
    amount: float = Field(gt=0, lt=100_000_000)
    description: str = Field(min_length=1, max_length=80)

class LimitBody(BaseModel):
    category: str = Field(min_length=1, max_length=40)
    max_amount: float = Field(ge=0, lt=100_000_000)


# ---------- helpers ----------

def clean_number(number):
    """'0803 000-0000' -> '08030000000' so the same phone always matches."""
    return re.sub(r"[\s-]", "", number)


def current_user_id(authorization: str | None = Header(default=None)):
    """Runs before every protected route. Reads 'Authorization: Bearer <token>',
    finds the user, or stops the request with a 401 error."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please log in.")
    user_id = get_user_id(authorization[len("Bearer "):])
    if user_id is None:
        raise HTTPException(status_code=401, detail="Your session has expired. Please log in again.")
    return user_id


def login_response(user_id):
    """Start a session and send back the token plus the user's name."""
    data = build_dashboard(user_id)
    return {"token": create_session(user_id), "user": data["user"]}


# ---------- accounts ----------

@router.post("/register", status_code=201)
def register(body: RegisterBody):
    number = clean_number(body.number)
    if not re.fullmatch(r"0[789][01]\d{8}", number):
        raise HTTPException(status_code=400, detail="Enter an 11-digit Nigerian phone number, like 08030000000.")
    if not re.fullmatch(r"\S+@\S+\.\S+", body.email.strip()):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    try:
        create_account(body.first_name.strip(), body.middle_name.strip(), body.last_name.strip(),
                       number, body.email.strip().lower(), body.password)
    except sqlite3.IntegrityError as e:
        if "users.email" in str(e):
            raise HTTPException(status_code=409, detail="That email address is already registered.")
        raise HTTPException(status_code=409, detail="That phone number is already registered.")

    # Log them straight in so they land on the tracker.
    user_id = login(number, body.password)
    return login_response(user_id)


@router.post("/login")
def login_route(body: LoginBody):
    user_id = login(clean_number(body.number), body.password)
    if not user_id:
        raise HTTPException(status_code=401, detail="Wrong phone number or password.")
    return login_response(user_id)


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        delete_session(authorization[len("Bearer "):])
    return {"ok": True}


# ---------- budget ----------

@router.get("/dashboard")
def dashboard(user_id: int = Depends(current_user_id)):
    return build_dashboard(user_id)


@router.post("/allowance")
def set_allowance(body: AllowanceBody, user_id: int = Depends(current_user_id)):
    save_allowance(user_id, body.monthly_income)
    return build_dashboard(user_id)


@router.post("/expenses", status_code=201)
def new_expense(body: ExpenseBody, user_id: int = Depends(current_user_id)):
    budget = get_budget(user_id)
    if budget is None:
        raise HTTPException(status_code=400, detail="Set your monthly allowance first.")
    add_expense(budget[0], body.category.strip(), body.amount, body.description.strip())
    return build_dashboard(user_id)


@router.put("/limits")
def set_limit(body: LimitBody, user_id: int = Depends(current_user_id)):
    budget = get_budget(user_id)
    if budget is None:
        raise HTTPException(status_code=400, detail="Set your monthly allowance first.")
    save_limit(budget[0], body.category.strip(), body.max_amount)
    return build_dashboard(user_id)
