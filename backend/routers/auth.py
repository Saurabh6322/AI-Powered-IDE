"""
Authentication router — JWT email/password + OAuth (Google, GitHub).

Endpoints:
  POST /api/auth/register        — create account with email + password
  POST /api/auth/login           — get access + refresh tokens
  POST /api/auth/refresh         — exchange refresh token for new access token
  GET  /api/auth/me              — get current user (requires auth)
  GET  /api/auth/google          — redirect to Google OAuth
  GET  /api/auth/google/callback — handle Google OAuth callback
  GET  /api/auth/github          — redirect to GitHub OAuth
  GET  /api/auth/github/callback — handle GitHub OAuth callback
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    OAUTH_REDIRECT_BASE,
)
from models import User, get_db, init_db
from services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_user_id,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# Ensure DB tables exist on import
init_db()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Extract and validate the Bearer token, return the User."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = auth[7:]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _user_to_dict(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "oauth_provider": user.oauth_provider,
    }


def _create_tokens(user: User) -> dict[str, Any]:
    return {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
        "user": _user_to_dict(user),
    }


# ---------------------------------------------------------------------------
# Email/Password auth
# ---------------------------------------------------------------------------

@router.post("/register")
async def register(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    body = await request.json()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")
    name = body.get("name", "").strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        id=generate_user_id(),
        email=email,
        hashed_password=hash_password(password),
        name=name or email.split("@")[0],
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return _create_tokens(user)


@router.post("/login")
async def login(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    body = await request.json()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return _create_tokens(user)


@router.post("/refresh")
async def refresh(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    body = await request.json()
    token = body.get("refresh_token", "")
    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
    }


@router.get("/me")
async def me(user: User = Depends(_get_current_user)) -> dict[str, Any]:
    return {"user": _user_to_dict(user)}


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


@router.get("/google")
async def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    redirect_uri = f"{OAUTH_REDIRECT_BASE}/auth/google/callback"
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    url = f"{GOOGLE_AUTH_URL}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
    return RedirectResponse(url)


@router.get("/google/callback")
async def google_callback(code: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    redirect_uri = f"{OAUTH_REDIRECT_BASE}/auth/google/callback"
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange code for token")
        tokens = token_resp.json()

        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get user info from Google")
        info = userinfo_resp.json()

    email = info.get("email", "").lower()
    google_id = info.get("id", "")

    user = db.query(User).filter(User.email == email).first()
    if user:
        if not user.oauth_provider:
            user.oauth_provider = "google"
            user.oauth_id = google_id
        if info.get("picture"):
            user.avatar_url = info["picture"]
        db.commit()
    else:
        user = User(
            id=generate_user_id(),
            email=email,
            name=info.get("name", email.split("@")[0]),
            avatar_url=info.get("picture"),
            oauth_provider="google",
            oauth_id=google_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token_data = _create_tokens(user)
    redirect_url = (
        f"{OAUTH_REDIRECT_BASE}/auth/callback"
        f"?access_token={token_data['access_token']}"
        f"&refresh_token={token_data['refresh_token']}"
    )
    return RedirectResponse(redirect_url)


# ---------------------------------------------------------------------------
# GitHub OAuth
# ---------------------------------------------------------------------------

GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"


@router.get("/github")
async def github_login():
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")
    redirect_uri = f"{OAUTH_REDIRECT_BASE}/auth/github/callback"
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": "read:user user:email",
    }
    url = f"{GITHUB_AUTH_URL}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
    return RedirectResponse(url)


@router.get("/github/callback")
async def github_callback(code: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    redirect_uri = f"{OAUTH_REDIRECT_BASE}/auth/github/callback"
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GITHUB_TOKEN_URL,
            json={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange code for token")
        tokens = token_resp.json()
        gh_token = tokens.get("access_token", "")

        user_resp = await client.get(
            GITHUB_USER_URL,
            headers={"Authorization": f"Bearer {gh_token}"},
        )
        user_info = user_resp.json()

        emails_resp = await client.get(
            GITHUB_EMAILS_URL,
            headers={"Authorization": f"Bearer {gh_token}"},
        )
        emails = emails_resp.json()

    primary_email = next(
        (e["email"] for e in emails if e.get("primary") and e.get("verified")),
        user_info.get("email", ""),
    )
    if not primary_email:
        raise HTTPException(status_code=400, detail="Could not retrieve email from GitHub")
    primary_email = primary_email.lower()
    github_id = str(user_info.get("id", ""))

    user = db.query(User).filter(User.email == primary_email).first()
    if user:
        if not user.oauth_provider:
            user.oauth_provider = "github"
            user.oauth_id = github_id
        if user_info.get("avatar_url"):
            user.avatar_url = user_info["avatar_url"]
        db.commit()
    else:
        user = User(
            id=generate_user_id(),
            email=primary_email,
            name=user_info.get("name") or user_info.get("login", primary_email.split("@")[0]),
            avatar_url=user_info.get("avatar_url"),
            oauth_provider="github",
            oauth_id=github_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token_data = _create_tokens(user)
    redirect_url = (
        f"{OAUTH_REDIRECT_BASE}/auth/callback"
        f"?access_token={token_data['access_token']}"
        f"&refresh_token={token_data['refresh_token']}"
    )
    return RedirectResponse(redirect_url)
