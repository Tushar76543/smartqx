"""
Authentication module: signup, login, JWT session tokens, and dependency helpers.
Session tokens (for login) are separate from queue ticket tokens.
"""

import datetime
import os
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Header
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import User

SECRET_KEY = os.environ.get("SECRET_KEY", "super_secret_offline_key_for_demo")
SESSION_EXPIRY_HOURS = 24


# ── Request / Response schemas ──

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "user"  # "user" or "admin"


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


# ── Password helpers ──

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ── Session JWT helpers ──

def create_session_token(user: User) -> str:
    payload = {
        "sub": user.email,
        "uid": user.id,
        "name": user.name,
        "role": user.role,
        "type": "session",
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=SESSION_EXPIRY_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_session_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "session":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session token.")


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "created_at": user.created_at.isoformat(),
    }


# ── Dependencies ──

def get_current_user(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.split(" ", 1)[1]
    payload = decode_session_token(token)

    user = session.exec(select(User).where(User.email == payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Endpoint handlers ──

def signup(req: SignupRequest, session: Session) -> AuthResponse:
    existing = session.exec(select(User).where(User.email == req.email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    if req.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'")

    user = User(
        name=req.name,
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_session_token(user)
    return AuthResponse(token=token, user=serialize_user(user))


def login(req: LoginRequest, session: Session) -> AuthResponse:
    user = session.exec(select(User).where(User.email == req.email)).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_session_token(user)
    return AuthResponse(token=token, user=serialize_user(user))
