"""Forgot password, with the admin's help (no email service needed).

  1. The person contacts the admin and proves who they are (a call, or WhatsApp from their number).
  2. The admin enters their phone number on the Approvals page and gets a one-time code.
  3. The admin gives the person the code. On /forgot they enter phone + code + a new password.

A code works once, for 30 minutes, and is locked after 5 wrong tries. Only a fingerprint of the
code is stored. Setting a new password logs the account out everywhere.
"""
import hashlib
import hmac
import re
import secrets
import sqlite3
from datetime import datetime, timedelta

from argon2 import PasswordHasher
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import locator_db as db
from api_routes import clean_number
from locator_routes import current_admin_id

router = APIRouter(prefix="/api")
ph = PasswordHasher()

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"      # no 0/O or 1/I to mix up when read out loud
MINUTES = 30
MAX_TRIES = 5
BAD_CODE = "That code is wrong or has expired. Ask the admin for a new one."


def _connect():
    conn = db._connect()
    conn.execute("""CREATE TABLE IF NOT EXISTS password_resets (
        user_id INTEGER PRIMARY KEY, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
        tries INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)""")
    return conn


def _hash(code):
    return hashlib.sha256(code.encode()).hexdigest()


def _normal(code):
    return re.sub(r"[^A-Z0-9]", "", code.upper())


class CodeRequest(BaseModel):
    number: str


class ResetBody(BaseModel):
    number: str
    code: str = Field(max_length=20)
    password: str = Field(min_length=8, max_length=128)


@router.post("/admin/reset-code")
def make_code(body: CodeRequest, admin_id: int = Depends(current_admin_id)):
    number = clean_number(body.number)
    conn = _connect()
    try:
        user = conn.execute("SELECT id, first_name, last_name, role FROM users WHERE number = ?", (number,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="No account has that phone number.")
        if user["role"] == "admin":
            raise HTTPException(status_code=400, detail="Admin accounts cannot be reset here. Use make_admin.py or the database.")
        raw = "".join(secrets.choice(ALPHABET) for _ in range(8))
        expires = (datetime.now() + timedelta(minutes=MINUTES)).isoformat(timespec="seconds")
        # A new code replaces any older one for this person.
        conn.execute("""INSERT INTO password_resets (user_id, code_hash, expires_at, tries, created_at)
                        VALUES (?, ?, ?, 0, ?)
                        ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
                          tries = 0, created_at = excluded.created_at""",
                     (user["id"], _hash(raw), expires, datetime.now().isoformat(timespec="seconds")))
        conn.commit()
        return {"name": (user["first_name"] + " " + user["last_name"]).strip(), "role": user["role"],
                "number": number, "code": raw[:4] + "-" + raw[4:], "minutes": MINUTES}
    finally:
        conn.close()


@router.post("/reset-password")
def reset_password(body: ResetBody):
    number = clean_number(body.number)
    code = _normal(body.code)
    conn = _connect()
    try:
        user = conn.execute("SELECT id, role FROM users WHERE number = ?", (number,)).fetchone()
        row = conn.execute("SELECT * FROM password_resets WHERE user_id = ?", (user["id"],)).fetchone() if user else None
        # Same message for every failure, so nobody can use this to find out who has an account.
        if not row or user["role"] == "admin":
            raise HTTPException(status_code=400, detail=BAD_CODE)
        if datetime.fromisoformat(row["expires_at"]) < datetime.now() or row["tries"] >= MAX_TRIES:
            conn.execute("DELETE FROM password_resets WHERE user_id = ?", (user["id"],))
            conn.commit()
            raise HTTPException(status_code=400, detail=BAD_CODE)
        if not hmac.compare_digest(row["code_hash"], _hash(code)):
            conn.execute("UPDATE password_resets SET tries = tries + 1 WHERE user_id = ?", (user["id"],))
            conn.commit()
            raise HTTPException(status_code=400, detail=BAD_CODE)
        conn.execute("UPDATE users SET password = ? WHERE id = ?", (ph.hash(body.password), user["id"]))
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
        conn.execute("DELETE FROM password_resets WHERE user_id = ?", (user["id"],))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
