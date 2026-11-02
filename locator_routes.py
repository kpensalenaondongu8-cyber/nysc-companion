"""/api routes for the PPA locator: my PPA, houses for rent, house agents, home summary."""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api_routes import current_user_id, clean_number
from budget_tracking.dashboard import get_budget, build_dashboard
import locator_db as db

router = APIRouter(prefix="/api")


class PpaBody(BaseModel):
    ppa_name: str = Field(min_length=1, max_length=100)
    address: str = Field(default="", max_length=200)
    state: str = Field(min_length=1, max_length=40)
    lga: str = Field(min_length=1, max_length=60)
    town: str = Field(default="", max_length=60)

class HouseBody(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=400)
    house_type: str = Field(min_length=1, max_length=40)
    rooms: int = Field(ge=1, le=20)
    rent_per_year: float = Field(gt=0, lt=1_000_000_000)
    state: str = Field(min_length=1, max_length=40)
    lga: str = Field(min_length=1, max_length=60)
    town: str = Field(min_length=1, max_length=60)
    address: str = Field(default="", max_length=200)
    contact_name: str = Field(min_length=1, max_length=60)
    contact_phone: str

class AgentBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    agency: str = Field(default="", max_length=80)
    phone: str
    state: str = Field(min_length=1, max_length=40)
    lga: str = Field(min_length=1, max_length=60)
    towns: str = Field(default="", max_length=200)
    about: str = Field(default="", max_length=300)


def valid_phone(number):
    number = clean_number(number)
    if not re.fullmatch(r"0[789][01]\d{8}", number):
        raise HTTPException(status_code=400, detail="Enter an 11-digit Nigerian phone number, like 08030000000.")
    return number


@router.get("/home")
def home(user_id: int = Depends(current_user_id)):
    ppa = db.get_ppa(user_id)
    budget = get_budget(user_id)
    return {
        "user": build_dashboard(user_id)["user"],
        "ppa": ppa,
        "houses_nearby": db.count_near("houses", ppa["state"], ppa["lga"]) if ppa else 0,
        "agents_nearby": db.count_near("agents", ppa["state"], ppa["lga"]) if ppa else 0,
        "allowance": budget[1] if budget else None,
        "remaining": build_dashboard(user_id)["budget"]["remaining"] if budget else None,
    }


@router.put("/ppa")
def save_ppa(body: PpaBody, user_id: int = Depends(current_user_id)):
    db.save_ppa(user_id, body.ppa_name.strip(), body.address.strip(), body.state.strip(),
                body.lga.strip(), body.town.strip())
    return home(user_id)


@router.get("/houses")
def houses(state: str, lga: str = "", town: str = "", max_rent: float | None = None,
           min_rooms: int | None = None, user_id: int = Depends(current_user_id)):
    return {"houses": db.search_houses(user_id, state.strip(), lga.strip(), town.strip(), max_rent, min_rooms)}


@router.post("/houses", status_code=201)
def post_house(body: HouseBody, user_id: int = Depends(current_user_id)):
    phone = valid_phone(body.contact_phone)
    db.add_house(user_id, body.title.strip(), body.description.strip(), body.house_type.strip(),
                 body.rooms, body.rent_per_year, body.state.strip(), body.lga.strip(), body.town.strip(),
                 body.address.strip(), body.contact_name.strip(), phone)
    return {"ok": True}


@router.delete("/houses/{house_id}")
def remove_house(house_id: int, user_id: int = Depends(current_user_id)):
    if not db.delete_house(user_id, house_id):
        raise HTTPException(status_code=404, detail="That listing was not found, or it is not yours.")
    return {"ok": True}


@router.get("/agents")
def agents(state: str, lga: str = "", town: str = "", user_id: int = Depends(current_user_id)):
    return {"agents": db.search_agents(user_id, state.strip(), lga.strip(), town.strip())}


@router.get("/agents/me")
def my_agent(user_id: int = Depends(current_user_id)):
    return {"agent": db.get_my_agent(user_id)}


@router.put("/agents/me")
def save_agent(body: AgentBody, user_id: int = Depends(current_user_id)):
    phone = valid_phone(body.phone)
    db.save_my_agent(user_id, body.name.strip(), body.agency.strip(), phone, body.state.strip(),
                     body.lga.strip(), body.towns.strip(), body.about.strip())
    return {"ok": True}


@router.delete("/agents/me")
def remove_agent(user_id: int = Depends(current_user_id)):
    db.delete_my_agent(user_id)
    return {"ok": True}
