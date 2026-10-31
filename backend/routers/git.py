"""
Git router — REST API for git operations on the workspace.

Endpoints:
  GET  /api/git/status       — repo status (branch, changed files)
  POST /api/git/init          — initialize a new repo
  GET  /api/git/log           — recent commit history
  GET  /api/git/branches      — list branches
  POST /api/git/stage         — stage a file
  POST /api/git/unstage       — unstage a file
  POST /api/git/stage-all     — stage all changes
  POST /api/git/commit        — create a commit
  POST /api/git/checkout      — switch branch
  POST /api/git/create-branch — create and switch to new branch
  GET  /api/git/diff          — get diff output
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Query, Request

from services import git_service

router = APIRouter(prefix="/api/git", tags=["git"])
logger = logging.getLogger(__name__)


@router.get("/status")
async def status() -> dict[str, Any]:
    """Return the current repository status."""
    return git_service.get_status()


@router.post("/init")
async def init_repo() -> dict[str, Any]:
    """Initialize a new git repository in the workspace."""
    return git_service.init_repo()


@router.get("/log")
async def git_log(
    n: int = Query(20, ge=1, le=100, description="Number of commits"),
) -> dict[str, Any]:
    """Return recent commit history."""
    commits = git_service.get_log(n=n)
    return {"commits": commits}


@router.get("/branches")
async def branches() -> dict[str, Any]:
    """List all branches and the current one."""
    return git_service.get_branches()


@router.post("/stage")
async def stage(request: Request) -> dict[str, Any]:
    """Stage a specific file."""
    body = await request.json()
    path = body.get("path", "")
    if not path:
        return {"success": False, "error": "Missing 'path' field."}
    return git_service.stage_file(path)


@router.post("/unstage")
async def unstage(request: Request) -> dict[str, Any]:
    """Unstage a specific file."""
    body = await request.json()
    path = body.get("path", "")
    if not path:
        return {"success": False, "error": "Missing 'path' field."}
    return git_service.unstage_file(path)


@router.post("/stage-all")
async def stage_all() -> dict[str, Any]:
    """Stage all changes."""
    return git_service.stage_all()


@router.post("/commit")
async def commit(request: Request) -> dict[str, Any]:
    """Create a commit."""
    body = await request.json()
    message = body.get("message", "")
    if not message:
        return {"success": False, "error": "Missing 'message' field."}
    return git_service.commit(message)


@router.post("/checkout")
async def checkout(request: Request) -> dict[str, Any]:
    """Switch to an existing branch."""
    body = await request.json()
    branch = body.get("branch", "")
    if not branch:
        return {"success": False, "error": "Missing 'branch' field."}
    return git_service.checkout_branch(branch)


@router.post("/create-branch")
async def create_branch(request: Request) -> dict[str, Any]:
    """Create a new branch and switch to it."""
    body = await request.json()
    name = body.get("name", "")
    if not name:
        return {"success": False, "error": "Missing 'name' field."}
    return git_service.create_branch(name)


@router.get("/diff")
async def diff(
    path: str = Query(None, description="Optional file path to diff"),
) -> dict[str, Any]:
    """Get diff output for staged/unstaged changes."""
    return git_service.get_diff(path)
