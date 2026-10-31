"""
Git Service — wraps GitPython to provide git operations on the workspace.

All operations are scoped to WORKSPACE_ROOT from config.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from git import Repo, InvalidGitRepositoryError, GitCommandNotFound
from git.exc import GitCommandError

from config import WORKSPACE_ROOT

logger = logging.getLogger(__name__)


def is_git_repo() -> bool:
    """Check if the workspace is a git repository."""
    try:
        Repo(str(WORKSPACE_ROOT))
        return True
    except (InvalidGitRepositoryError, Exception):
        return False


def _get_repo() -> Repo:
    """Get the Repo object for the workspace. Raises if not a git repo."""
    return Repo(str(WORKSPACE_ROOT))


def init_repo() -> dict[str, Any]:
    """Initialize a new git repository in the workspace."""
    try:
        repo = Repo.init(str(WORKSPACE_ROOT))
        # Create initial branch as 'main'
        # (Git defaults may vary; explicitly set if possible)
        return {
            "success": True,
            "message": "Repository initialized.",
            "branch": repo.active_branch.name if not repo.head.is_detached else "main",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_status() -> dict[str, Any]:
    """
    Get the current repository status.
    Returns: branch name, staged files, unstaged files, untracked files.
    """
    if not is_git_repo():
        return {"is_repo": False}

    try:
        repo = _get_repo()

        # Current branch
        try:
            branch = repo.active_branch.name
        except TypeError:
            branch = "(detached HEAD)"

        # Changed files
        staged = []
        unstaged = []
        untracked = list(repo.untracked_files)

        # Staged changes (index vs HEAD)
        if repo.head.is_valid():
            diff_staged = repo.index.diff("HEAD")
            for d in diff_staged:
                staged.append({
                    "path": d.a_path or d.b_path,
                    "change_type": d.change_type,  # 'A', 'M', 'D', 'R'
                })

        # Unstaged changes (working tree vs index)
        diff_unstaged = repo.index.diff(None)
        for d in diff_unstaged:
            unstaged.append({
                "path": d.a_path or d.b_path,
                "change_type": d.change_type,
            })

        return {
            "is_repo": True,
            "branch": branch,
            "staged": staged,
            "unstaged": unstaged,
            "untracked": untracked,
        }
    except Exception as e:
        logger.error(f"Error getting git status: {e}")
        return {"is_repo": True, "error": str(e)}


def stage_file(path: str) -> dict[str, Any]:
    """Stage a specific file."""
    try:
        repo = _get_repo()
        repo.index.add([path])
        return {"success": True, "message": f"Staged: {path}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def unstage_file(path: str) -> dict[str, Any]:
    """Unstage a specific file (reset from index)."""
    try:
        repo = _get_repo()
        if repo.head.is_valid():
            repo.index.reset(paths=[path])
        else:
            # For initial commits, there's no HEAD to reset against
            repo.index.remove([path], working_tree=False)
        return {"success": True, "message": f"Unstaged: {path}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def stage_all() -> dict[str, Any]:
    """Stage all changes (modified, new, deleted)."""
    try:
        repo = _get_repo()
        repo.git.add(A=True)
        return {"success": True, "message": "All changes staged."}
    except Exception as e:
        return {"success": False, "error": str(e)}


def commit(message: str) -> dict[str, Any]:
    """Create a commit with the given message."""
    if not message.strip():
        return {"success": False, "error": "Commit message cannot be empty."}

    try:
        repo = _get_repo()
        c = repo.index.commit(message.strip())
        return {
            "success": True,
            "hash": c.hexsha[:8],
            "message": c.message,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_log(n: int = 20) -> list[dict[str, Any]]:
    """Return the last N commits."""
    try:
        repo = _get_repo()
        if not repo.head.is_valid():
            return []

        commits = []
        for c in repo.iter_commits(max_count=n):
            commits.append({
                "hash": c.hexsha[:8],
                "full_hash": c.hexsha,
                "message": c.message.strip(),
                "author": str(c.author),
                "date": c.committed_datetime.isoformat(),
            })
        return commits
    except Exception as e:
        logger.error(f"Error getting git log: {e}")
        return []


def get_branches() -> dict[str, Any]:
    """List all branches and the current one."""
    try:
        repo = _get_repo()
        branches = [b.name for b in repo.branches]

        try:
            current = repo.active_branch.name
        except TypeError:
            current = "(detached)"

        return {"branches": branches, "current": current}
    except Exception as e:
        return {"branches": [], "current": "", "error": str(e)}


def checkout_branch(name: str) -> dict[str, Any]:
    """Switch to an existing branch."""
    try:
        repo = _get_repo()
        repo.git.checkout(name)
        return {"success": True, "branch": name}
    except Exception as e:
        return {"success": False, "error": str(e)}


def create_branch(name: str) -> dict[str, Any]:
    """Create a new branch and switch to it."""
    try:
        repo = _get_repo()
        repo.git.checkout("-b", name)
        return {"success": True, "branch": name}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_diff(path: str | None = None) -> dict[str, Any]:
    """
    Get diff output.
    If path is provided, diff that specific file.
    Otherwise, diff all changes.
    """
    try:
        repo = _get_repo()
        if path:
            diff_text = repo.git.diff(path)
            if not diff_text:
                diff_text = repo.git.diff("--cached", path)
        else:
            diff_text = repo.git.diff()
            cached = repo.git.diff("--cached")
            if cached:
                diff_text = f"--- Staged ---\n{cached}\n\n--- Unstaged ---\n{diff_text}"

        return {"success": True, "diff": diff_text or "(no changes)"}
    except Exception as e:
        return {"success": False, "error": str(e)}
