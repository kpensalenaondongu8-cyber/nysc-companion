"""/api routes for the PPA locator: my PPA, houses for rent, house agents, reviews, home summary.

Three kinds of account:
  corper - saves a PPA, sees houses near it, contacts agents, reads and writes reviews
  agent  - has a profile and posts houses with pictures, but only after an admin APPROVES them
  admin  - checks agents (phone call) and approves or rejects them
The checks below are done on the server, so they cannot be skipped from the browser.
"""
import re
import sqlite3
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api_routes import current_user_id, clean_number
from budget_tracking.dashboard import get_budget, build_dashboard
import locator_db as db
import photo_store
import ppa_directory
import house_events

router = APIRouter(prefix="/api")

# A pin must be inside Nigeria (rough box around the country).
NIGERIA_LAT = (4.0, 14.0)
NIGERIA_LON = (2.5, 15.0)

HOUSE_TYPES = ["Room", "Room and parlour", "Self-contain", "Mini flat",
               "2-bedroom flat", "3-bedroom flat", "Duplex", "Shared apartment"]


# ---------- what the browser is allowed to send us ----------

class PpaBody(BaseModel):
    ppa_name: str = Field(min_length=1, max_length=100)
    address: str = Field(default="", max_length=200)
    state: str = Field(min_length=1, max_length=40)
    lga: str = Field(min_length=1, max_length=60)
    town: str = Field(default="", max_length=60)
    lat: float | None = None                 # exact pin (optional)
    lon: float | None = None
    photo: str | None = None                 # new photo of the gate/signboard, as a data URL (optional)
    remove_photo: bool = False
    clear_pin: bool = False                  # forget the saved pin
    share: bool = True                       # add this pinned PPA to the shared list for other corps members

class HouseBody(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=600)
    house_type: str = Field(min_length=1, max_length=40)
    rooms: int = Field(ge=1, le=20)
    rent_per_year: float = Field(gt=0, lt=1_000_000_000)
    state: str = Field(min_length=1, max_length=40)
    lga: str = Field(min_length=1, max_length=60)
    town: str = Field(min_length=1, max_length=60)
    address: str = Field(default="", max_length=200)
    photos: list[str] = Field(min_length=1, max_length=photo_store.MAX_PHOTOS)   # pictures as data URLs

class AgentBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    agency: str = Field(default="", max_length=80)
    phone: str
    state: str = Field(min_length=1, max_length=40)
    lga: str = Field(min_length=1, max_length=60)
    towns: str = Field(default="", max_length=200)
    about: str = Field(default="", max_length=300)
    office_address: str = Field(default="", max_length=200)       # for verification (not shown to corpers)
    verification_note: str = Field(default="", max_length=500)    # for verification (not shown to corpers)

class RejectBody(BaseModel):
    reason: str = Field(min_length=3, max_length=300)

class ReviewBody(BaseModel):
    target_type: str                                   # 'ppa' or 'agent'
    agent_id: int | None = None
    ppa_name: str = Field(default="", max_length=100)
    state: str = Field(default="", max_length=40)
    lga: str = Field(default="", max_length=60)
    town: str = Field(default="", max_length=60)
    rating: int = Field(ge=1, le=5)
    body: str = Field(min_length=20, max_length=1000)
    service_year: int = Field(ge=2000, le=2100)
    served: bool                                       # "I have completed my service"


# ---------- role checks ----------

def current_corper_id(user_id: int = Depends(current_user_id)):
    if db.get_role(user_id) != "corper":
        raise HTTPException(status_code=403, detail="This is for corps members only.")
    return user_id


def current_agent_id(user_id: int = Depends(current_user_id)):
    if db.get_role(user_id) != "agent":
        raise HTTPException(status_code=403, detail="This is for house agents only. Log in with an agent account.")
    return user_id


def current_admin_id(user_id: int = Depends(current_user_id)):
    if db.get_role(user_id) != "admin":
        raise HTTPException(status_code=403, detail="This is for the admin only.")
    return user_id


def valid_phone(number):
    number = clean_number(number)
    if not re.fullmatch(r"0[789][01]\d{8}", number):
        raise HTTPException(status_code=400, detail="Enter an 11-digit Nigerian phone number, like 08030000000.")
    return number


def _user_with_role(user_id):
    user = build_dashboard(user_id)["user"]
    user["role"] = db.get_role(user_id)
    return user


# ---------- home / PPA ----------

@router.get("/home")
def home(user_id: int = Depends(current_user_id)):
    ppa = db.get_ppa(user_id)
    budget = get_budget(user_id)
    dashboard = build_dashboard(user_id)
    return {
        "user": _user_with_role(user_id),
        "ppa": ppa,
        "houses_nearby": db.count_near("houses", ppa["state"], ppa["lga"]) if ppa else 0,
        "agents_nearby": db.count_near("agents", ppa["state"], ppa["lga"]) if ppa else 0,
        "allowance": budget[1] if budget else None,
        "remaining": dashboard["budget"]["remaining"] if budget else None,
    }


def _same_place(old, name, state, lga, town):
    norm = lambda s: (s or "").strip().lower()
    return (old is not None and norm(old["ppa_name"]) == norm(name) and norm(old["state"]) == norm(state)
            and norm(old["lga"]) == norm(lga) and norm(old["town"]) == norm(town))


@router.put("/ppa")
def save_ppa(body: PpaBody, user_id: int = Depends(current_corper_id)):
    name, state, lga, town = body.ppa_name.strip(), body.state.strip(), body.lga.strip(), body.town.strip()
    old = db.get_ppa(user_id)

    # The pin: use the new one if sent; otherwise keep the old pin, but only if it is still the same place.
    if (body.lat is None) != (body.lon is None):
        raise HTTPException(status_code=400, detail="A pin needs both a latitude and a longitude.")
    if body.lat is not None:
        if not (NIGERIA_LAT[0] <= body.lat <= NIGERIA_LAT[1] and NIGERIA_LON[0] <= body.lon <= NIGERIA_LON[1]):
            raise HTTPException(status_code=400, detail="That pin is outside Nigeria. Move it onto your PPA.")
        lat, lon = round(body.lat, 6), round(body.lon, 6)
    elif _same_place(old, name, state, lga, town) and not body.clear_pin:
        lat, lon = old["lat"], old["lon"]
    else:
        lat = lon = None

    # The gate photo: replace, remove, or keep the old one.
    old_photo = old["photo"] if old else ""
    photo = old_photo
    if body.photo:
        try:
            photo = photo_store.save_photo(body.photo, photo_store.PPA_DIR)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    elif body.remove_photo:
        photo = ""

    db.save_ppa(user_id, name, body.address.strip(), state, lga, town, lat, lon, photo)
    if lat is not None and body.share:
        try:
            ppa_directory.share(user_id, name, state, lga, town, body.address.strip(), lat, lon)
        except Exception:
            pass                                 # sharing is a bonus: never stop the save because of it
    if old_photo and old_photo != photo:
        photo_store.delete_photos([old_photo], photo_store.PPA_DIR)
    return home(user_id)


# ---------- houses (what corpers see) ----------

def _public_house(h, with_phone):
    """What we send to the browser. Sample listings never show a contact."""
    is_sample = bool(h["is_sample"])
    out = {
        "id": h["id"], "title": h["title"], "description": h["description"],
        "house_type": h["house_type"], "rooms": h["rooms"], "rent_per_year": h["rent_per_year"],
        "state": h["state"], "lga": h["lga"], "town": h["town"], "address": h["address"],
        "is_sample": is_sample, "created_at": h["created_at"], "status": h.get("status", "available"),
        "cover": h.get("cover"), "photo_count": h.get("photo_count", 0),
        "agent": None,
    }
    if not is_sample and h.get("agent_id"):
        out["agent"] = {
            "id": h["agent_id"], "name": h["agent_name"], "agency": h["agent_agency"],
            "rating": h["agent_rating"], "review_count": h["agent_reviews"],
        }
        if with_phone:
            out["agent"]["phone"] = h["agent_phone"]
    return out


@router.get("/houses")
def houses(town: str = "", max_rent: float | None = None, min_rooms: int | None = None,
           user_id: int = Depends(current_corper_id)):
    """Houses in the corper's own state and LGA only. The area comes from their saved PPA,
    not from the web address, so nobody can ask for houses outside it."""
    ppa = db.get_ppa(user_id)
    if ppa is None:
        return {"area": None, "houses": []}
    rows = db.houses_near_ppa(ppa, town.strip(), max_rent, min_rooms)
    return {
        "area": {"state": ppa["state"], "lga": ppa["lga"], "town": ppa["town"]},
        "houses": [_public_house(h, with_phone=False) for h in rows],
    }


@router.get("/houses/{house_id}")
def one_house(house_id: int, user_id: int = Depends(current_user_id)):
    house = db.get_house(house_id)
    role = db.get_role(user_id)
    allowed = False
    if house is not None:
        if role == "agent":
            allowed = house["owner_id"] == user_id            # an agent can preview their own houses
        else:
            ppa = db.get_ppa(user_id)
            visible = house["is_sample"] or house.get("agent_status") == "approved"
            allowed = (ppa is not None and visible
                       and house["state"].strip().lower() == ppa["state"].strip().lower()
                       and house["lga"].strip().lower() == ppa["lga"].strip().lower())
    if not allowed:
        raise HTTPException(status_code=404, detail="That house was not found in your area.")
    # Count one view per corps member per day (the agent sees only the number, never who).
    if role != "agent" and not house["is_sample"] and house.get("status") == "available":
        try:
            house_events.record_event(house_id, user_id, "view")
        except Exception:
            pass                                    # counting must never stop someone seeing a house
    out = _public_house(house, with_phone=house.get("status") == "available")
    if house.get("status") != "available" and out["agent"]:
        out["agent"].pop("phone", None)
    out["photos"] = house["photos"]
    return out


# ---------- houses (what agents do) ----------

@router.get("/my/houses")
def my_houses(user_id: int = Depends(current_agent_id)):
    return {"houses": [_public_house(h, with_phone=False) for h in db.my_houses(user_id)]}


@router.post("/houses", status_code=201)
def post_house(body: HouseBody, user_id: int = Depends(current_agent_id)):
    agent = db.get_my_agent(user_id)
    if agent is None or not agent["state"] or not agent["lga"] or not agent["office_address"]:
        raise HTTPException(status_code=400, detail="Finish your agent profile first, then post houses.")
    if agent["verification_status"] != "approved":
        raise HTTPException(status_code=403, detail="Your agent account has not been approved yet. You can post houses once it is.")
    if body.house_type not in HOUSE_TYPES:
        raise HTTPException(status_code=400, detail="Choose a house type from the list.")

    saved = []
    try:
        for data_url in body.photos:
            saved.append(photo_store.save_photo(data_url))
    except ValueError as e:
        photo_store.delete_photos(saved)                       # throw away the ones already saved
        raise HTTPException(status_code=400, detail=str(e))

    try:
        house_id = db.add_house(user_id, body.title.strip(), body.description.strip(), body.house_type,
                                body.rooms, body.rent_per_year, body.state.strip(), body.lga.strip(),
                                body.town.strip(), body.address.strip(), agent["name"], agent["phone"], saved)
    except Exception:
        photo_store.delete_photos(saved)
        raise
    return {"ok": True, "id": house_id}


@router.delete("/houses/{house_id}")
def remove_house(house_id: int, user_id: int = Depends(current_agent_id)):
    if not db.delete_house(user_id, house_id):
        raise HTTPException(status_code=404, detail="That listing was not found, or it is not yours.")
    return {"ok": True}


# ---------- agents ----------

@router.get("/agents")
def agents(state: str = "", lga: str = "", town: str = "", user_id: int = Depends(current_user_id)):
    return {"agents": db.search_agents(user_id, state.strip(), lga.strip(), town.strip())}


@router.get("/agents/me")
def my_agent(user_id: int = Depends(current_agent_id)):
    return {"agent": db.get_my_agent(user_id)}


@router.put("/agents/me")
def save_agent(body: AgentBody, user_id: int = Depends(current_agent_id)):
    phone = valid_phone(body.phone)
    if len(body.office_address.strip()) < 5 or len(body.verification_note.strip()) < 10 or not body.agency.strip():
        raise HTTPException(status_code=400, detail="Add your agency name, office address and a short note about your work, so we can verify you.")
    db.save_my_agent(user_id, body.name.strip(), body.agency.strip(), phone, body.state.strip(),
                     body.lga.strip(), body.towns.strip(), body.about.strip(),
                     body.office_address.strip(), body.verification_note.strip())
    return {"ok": True, "agent": db.get_my_agent(user_id)}


# ---------- reviews ----------

@router.get("/reviews")
def reviews(target_type: str = "", state: str = "", lga: str = "", q: str = "",
            agent_id: int | None = None, user_id: int = Depends(current_user_id)):
    items = db.list_reviews(user_id, target_type, state.strip(), lga.strip(), q.strip(), agent_id)
    ratings = [r["rating"] for r in items]
    return {
        "reviews": items,
        "count": len(items),
        "average": round(sum(ratings) / len(ratings), 1) if ratings else None,
        "can_write": db.get_role(user_id) == "corper",
    }


@router.post("/reviews", status_code=201)
def write_review(body: ReviewBody, user_id: int = Depends(current_corper_id)):
    if not body.served:
        raise HTTPException(status_code=400, detail="Reviews are for corps members who have completed their service. Tick the box to confirm.")
    if body.service_year > datetime.now().year:
        raise HTTPException(status_code=400, detail="The service year cannot be in the future.")

    if body.target_type == "agent":
        agent = db.get_agent(body.agent_id) if body.agent_id else None
        if agent is None or agent["is_sample"] or agent["verification_status"] != "approved":
            raise HTTPException(status_code=400, detail="Choose a verified house agent to review.")
        if agent["owner_id"] == user_id:
            raise HTTPException(status_code=400, detail="You cannot review yourself.")
        args = {"agent_id": agent["id"]}
    elif body.target_type == "ppa":
        if not body.ppa_name.strip() or not body.state.strip() or not body.lga.strip():
            raise HTTPException(status_code=400, detail="Enter the PPA name, state and LGA.")
        args = {"ppa_name": body.ppa_name.strip(), "state": body.state.strip(),
                "lga": body.lga.strip(), "town": body.town.strip()}
    else:
        raise HTTPException(status_code=400, detail="Choose whether you are reviewing a PPA or an agent.")

    try:
        db.add_review(user_id, body.target_type, body.rating, body.body.strip(), body.service_year, **args)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="You have already reviewed this one. Delete your old review first if you want to write it again.")
    return {"ok": True}


@router.delete("/reviews/{review_id}")
def remove_review(review_id: int, user_id: int = Depends(current_user_id)):
    if not db.delete_review(user_id, review_id):
        raise HTTPException(status_code=404, detail="That review was not found, or it is not yours.")
    return {"ok": True}


# ---------- admin: approve or reject agents ----------

@router.get("/admin/agents")
def admin_agents(status: str = "pending", admin_id: int = Depends(current_admin_id)):
    if status not in ("pending", "approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be pending, approved or rejected.")
    agents, counts = db.list_agents_for_admin(status)
    return {"agents": agents, "counts": counts}


@router.post("/admin/agents/{agent_id}/approve")
def admin_approve(agent_id: int, admin_id: int = Depends(current_admin_id)):
    if not db.set_agent_status(agent_id, "approved"):
        raise HTTPException(status_code=404, detail="That agent was not found.")
    return {"ok": True}


@router.post("/admin/agents/{agent_id}/reject")
def admin_reject(agent_id: int, body: RejectBody, admin_id: int = Depends(current_admin_id)):
    if not db.set_agent_status(agent_id, "rejected", body.reason.strip()):
        raise HTTPException(status_code=404, detail="That agent was not found.")
    return {"ok": True}
