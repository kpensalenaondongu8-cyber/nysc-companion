"""/api/me - the account settings every person has: name, phone, email, password, profile picture.

Changing the phone number or the password asks for the current password first, so a stranger
holding an unlocked phone cannot take over the account. A new password logs the account out
of every other device.
"""
import re
import sqlite3
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

import locator_db as db
import photo_store
from api_routes import clean_number, current_user_id
from user_auth.session import delete_session

router = APIRouter(prefix="/api/me")
ph = PasswordHasher()

AVATAR_DIR = Path("uploads") / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
FILE_NAME = re.compile(r"^[0-9a-f]{24}\.jpg$")


class ProfileBody(BaseModel):
    first_name: str = Field(min_length=1, max_length=50)
    middle_name: str = Field(default="", max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: str = Field(max_length=120)


class NumberBody(BaseModel):
    number: str
    password: str


class PasswordBody(BaseModel):
    current: str
    new: str = Field(min_length=8, max_length=128)


class PhotoBody(BaseModel):
    photo: str


class PasswordOnly(BaseModel):
    password: str


def _user(conn, user_id):
    return conn.execute("SELECT id, first_name, middle_name, last_name, number, email, role, photo "
                        "FROM users WHERE id = ?", (user_id,)).fetchone()


def _check_password(conn, user_id, password):
    row = conn.execute("SELECT password FROM users WHERE id = ?", (user_id,)).fetchone()
    try:
        ph.verify(row["password"], password)
    except VerifyMismatchError:
        raise HTTPException(status_code=400, detail="Your current password is not right.")


def _token(authorization):
    return authorization[len("Bearer "):] if authorization and authorization.startswith("Bearer ") else ""


@router.get("")
def get_me(user_id: int = Depends(current_user_id)):
    conn = db._connect()
    try:
        return dict(_user(conn, user_id))
    finally:
        conn.close()


@router.put("/profile")
def save_profile(body: ProfileBody, user_id: int = Depends(current_user_id)):
    email = body.email.strip().lower()
    if not re.fullmatch(r"\S+@\S+\.\S+", email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    conn = db._connect()
    try:
        try:
            conn.execute("UPDATE users SET first_name = ?, middle_name = ?, last_name = ?, email = ? WHERE id = ?",
                         (body.first_name.strip(), body.middle_name.strip(), body.last_name.strip(), email, user_id))
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="That email address is already registered.")
        return dict(_user(conn, user_id))
    finally:
        conn.close()


@router.put("/number")
def change_number(body: NumberBody, user_id: int = Depends(current_user_id)):
    number = clean_number(body.number)
    if not re.fullmatch(r"0[789][01]\d{8}", number):
        raise HTTPException(status_code=400, detail="Enter an 11-digit Nigerian phone number, like 08030000000.")
    conn = db._connect()
    try:
        _check_password(conn, user_id, body.password)
        try:
            conn.execute("UPDATE users SET number = ? WHERE id = ?", (number, user_id))
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="That phone number is already registered.")
        return dict(_user(conn, user_id))
    finally:
        conn.close()


@router.put("/password")
def change_password(body: PasswordBody, user_id: int = Depends(current_user_id),
                    authorization: str | None = Header(default=None)):
    conn = db._connect()
    try:
        _check_password(conn, user_id, body.current)
        if body.current == body.new:
            raise HTTPException(status_code=400, detail="Choose a password you have not used just now.")
        conn.execute("UPDATE users SET password = ? WHERE id = ?", (ph.hash(body.new), user_id))
        # Every other device is logged out. This one stays.
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND token != ?", (user_id, _token(authorization)))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/photo")
def set_photo(body: PhotoBody, user_id: int = Depends(current_user_id)):
    try:
        name = photo_store.save_photo(body.photo, AVATAR_DIR)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    conn = db._connect()
    try:
        old = conn.execute("SELECT photo FROM users WHERE id = ?", (user_id,)).fetchone()["photo"]
        conn.execute("UPDATE users SET photo = ? WHERE id = ?", (name, user_id))
        conn.commit()
    finally:
        conn.close()
    if old and FILE_NAME.match(old):
        photo_store.delete_photos([old], AVATAR_DIR)
    return {"photo": name}


@router.delete("/photo")
def remove_photo(user_id: int = Depends(current_user_id)):
    conn = db._connect()
    try:
        old = conn.execute("SELECT photo FROM users WHERE id = ?", (user_id,)).fetchone()["photo"]
        conn.execute("UPDATE users SET photo = '' WHERE id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()
    if old and FILE_NAME.match(old):
        photo_store.delete_photos([old], AVATAR_DIR)
    return {"photo": ""}


@router.post("/logout-all")
def logout_all(user_id: int = Depends(current_user_id)):
    conn = db._connect()
    try:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.post("/delete")
def delete_account(body: PasswordOnly, user_id: int = Depends(current_user_id)):
    """Delete the account and everything the person put in the app. Cannot be undone."""
    conn = db._connect()
    try:
        user = _user(conn, user_id)
        if user["role"] == "admin":
            raise HTTPException(status_code=400, detail="The admin account cannot be deleted here.")
        _check_password(conn, user_id, body.password)

        # Picture files first (the rows that name them go next).
        house_files = [r[0] for r in conn.execute(
            "SELECT p.filename FROM house_photos p JOIN houses h ON h.id = p.house_id WHERE h.owner_id = ?", (user_id,))]
        ppa_files = [r[0] for r in conn.execute("SELECT photo FROM ppas WHERE user_id = ?", (user_id,))]
        cds_files = [r[0] for r in conn.execute("SELECT photo FROM cds_updates WHERE user_id = ?", (user_id,))]

        # Tables that are not tied to the user by a database rule are cleared by hand.
        for sql in (
            "DELETE FROM board_reports WHERE user_id = ? OR (kind = 'post' AND target_id IN (SELECT id FROM board_posts WHERE user_id = ?))"
            " OR (kind = 'reply' AND target_id IN (SELECT id FROM board_replies WHERE user_id = ?))",
        ):
            conn.execute(sql, (user_id, user_id, user_id))
        conn.execute("DELETE FROM board_reports WHERE kind = 'reply' AND target_id IN "
                     "(SELECT r.id FROM board_replies r JOIN board_posts p ON p.id = r.post_id WHERE p.user_id = ?)", (user_id,))
        conn.execute("DELETE FROM board_replies WHERE user_id = ? OR post_id IN (SELECT id FROM board_posts WHERE user_id = ?)",
                     (user_id, user_id))
        for table in ("board_posts", "house_events", "checklist_settings", "checklist_done", "checklist_custom",
                      "cds_profile", "cds_sessions", "cds_updates", "password_resets", "ppa_review_reports", "ppa_reviews"):
            try:
                conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
            except sqlite3.OperationalError:
                pass                      # a table that was never created because the feature was never used
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))   # houses, agent profile, reviews, budget, sessions follow
        conn.commit()
        avatar = user["photo"]
    finally:
        conn.close()

    photo_store.delete_photos(house_files)
    photo_store.delete_photos(ppa_files, photo_store.PPA_DIR)
    photo_store.delete_photos(cds_files, Path("uploads") / "cds")
    if avatar and FILE_NAME.match(avatar):
        photo_store.delete_photos([avatar], AVATAR_DIR)
    return {"ok": True}
