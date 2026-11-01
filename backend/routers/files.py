"""
File-system API router.

Provides endpoints for browsing, reading, writing, creating, and deleting
files inside the configured WORKSPACE_ROOT.  Every path argument is resolved
and validated so that it cannot escape the workspace (path-traversal guard).

Also provides a WebSocket endpoint for live file-system change notifications
powered by ``watchdog``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import threading
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from config import WORKSPACE_ROOT

router = APIRouter(prefix="/api/files", tags=["files"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_resolve(relative: str) -> Path:
    """Resolve *relative* inside WORKSPACE_ROOT, raising 403 on traversal."""
    # Strip leading slashes so Path join works predictably
    cleaned = relative.lstrip("/").lstrip("\\")
    target = (WORKSPACE_ROOT / cleaned).resolve()
    if not str(target).startswith(str(WORKSPACE_ROOT)):
        raise HTTPException(status_code=403, detail="Path traversal denied")
    return target


def _build_tree(directory: Path) -> list[dict[str, Any]]:
    """Return a recursive JSON-friendly tree of *directory*."""
    entries: list[dict[str, Any]] = []
    try:
        children = sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except PermissionError:
        return entries

    for child in children:
        # Skip hidden / system files
        if child.name.startswith("."):
            continue
        node: dict[str, Any] = {
            "name": child.name,
            "path": str(child.relative_to(WORKSPACE_ROOT)).replace("\\", "/"),
            "type": "directory" if child.is_dir() else "file",
        }
        if child.is_dir():
            node["children"] = _build_tree(child)
        entries.append(node)
    return entries


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------

@router.get("/tree")
def get_tree() -> list[dict[str, Any]]:
    """Return the full directory tree under WORKSPACE_ROOT."""
    return _build_tree(WORKSPACE_ROOT)


@router.get("/{file_path:path}")
def read_file(file_path: str) -> PlainTextResponse:
    """Return the text content of a single file."""
    target = _safe_resolve(file_path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if target.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory, not a file")
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not valid UTF-8 text")
    return PlainTextResponse(content)


@router.put("/{file_path:path}")
async def write_file(file_path: str, request: Request) -> dict[str, str]:
    """Overwrite (or create) a file with the raw request body."""
    target = _safe_resolve(file_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    body = await request.body()
    target.write_text(body.decode("utf-8"), encoding="utf-8")
    return {"status": "ok", "path": file_path}


@router.post("/{file_path:path}")
def create_entry(file_path: str, is_directory: bool = False) -> dict[str, str]:
    """Create a new empty file or directory."""
    target = _safe_resolve(file_path)
    if target.exists():
        raise HTTPException(status_code=409, detail="Already exists")
    if is_directory:
        target.mkdir(parents=True, exist_ok=True)
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.touch()
    return {"status": "created", "path": file_path, "type": "directory" if is_directory else "file"}


@router.delete("/{file_path:path}")
def delete_entry(file_path: str) -> dict[str, str]:
    """Delete a file or directory (recursive for directories)."""
    target = _safe_resolve(file_path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Not found")
    # Prevent deleting the workspace root itself
    if target == WORKSPACE_ROOT:
        raise HTTPException(status_code=403, detail="Cannot delete workspace root")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return {"status": "deleted", "path": file_path}


# ---------------------------------------------------------------------------
# Workspace-wide text search
# ---------------------------------------------------------------------------

SEARCH_SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", "venv", ".venv",
    "dist", "build", ".next", ".cache", "chroma_data",
}
SEARCH_MAX_RESULTS = 200

@router.get("/search/text")
def search_text(q: str, max_results: int = SEARCH_MAX_RESULTS) -> dict[str, Any]:
    """Grep-like workspace search. Returns matching lines with context."""
    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters")
    results: list[dict[str, Any]] = []
    query_lower = q.lower()

    for root_dir, dirs, files in os.walk(WORKSPACE_ROOT):
        dirs[:] = [d for d in dirs if d not in SEARCH_SKIP_DIRS and not d.startswith(".")]
        for fname in files:
            if len(results) >= max_results:
                break
            fpath = Path(root_dir) / fname
            if fpath.suffix not in {
                ".py", ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".md",
                ".json", ".yaml", ".yml", ".toml", ".sql", ".sh", ".go",
                ".rs", ".java", ".c", ".cpp", ".h", ".txt", ".cfg", ".ini",
            }:
                continue
            try:
                text = fpath.read_text(encoding="utf-8", errors="ignore")
            except (PermissionError, OSError):
                continue
            for line_num, line in enumerate(text.splitlines(), 1):
                if query_lower in line.lower():
                    results.append({
                        "file": str(fpath.relative_to(WORKSPACE_ROOT)).replace("\\", "/"),
                        "line": line_num,
                        "text": line.strip()[:200],
                    })
                    if len(results) >= max_results:
                        break
    return {"query": q, "results": results, "total": len(results)}


# ---------------------------------------------------------------------------
# File-system watcher (WebSocket)
# ---------------------------------------------------------------------------

# Connected WebSocket clients listening for file-system changes
_fs_watchers: set[WebSocket] = set()
_observer: Observer | None = None
_observer_lock = threading.Lock()


class _WorkspaceChangeHandler(FileSystemEventHandler):
    """Debounced handler that notifies all connected WebSocket clients."""

    def __init__(self):
        super().__init__()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def _notify(self):
        if not self._loop or not _fs_watchers:
            return
        payload = json.dumps({"event": "fs_change"})
        for ws in list(_fs_watchers):
            try:
                asyncio.run_coroutine_threadsafe(ws.send_text(payload), self._loop)
            except Exception:
                pass

    def on_created(self, event):
        self._notify()

    def on_deleted(self, event):
        self._notify()

    def on_moved(self, event):
        self._notify()


_change_handler = _WorkspaceChangeHandler()


def _start_observer():
    """Start the watchdog observer once (idempotent)."""
    global _observer
    with _observer_lock:
        if _observer is not None:
            return
        _observer = Observer()
        _observer.schedule(_change_handler, str(WORKSPACE_ROOT), recursive=True)
        _observer.daemon = True
        _observer.start()
        logger.info("[FileWatcher] Watching %s for changes", WORKSPACE_ROOT)


@router.websocket("/ws")
async def file_watch_websocket(websocket: WebSocket):
    await websocket.accept()
    _fs_watchers.add(websocket)

    # Ensure the observer is running and knows our event loop
    _change_handler.set_loop(asyncio.get_event_loop())
    _start_observer()

    try:
        while True:
            # Keep the connection alive; client doesn't send much
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _fs_watchers.discard(websocket)

