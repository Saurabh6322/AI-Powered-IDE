"""
LSP WebSocket proxy router.

Exposes a WebSocket endpoint at /ws/lsp/{language} that:
1. Spawns a language server process for the requested language
2. Forwards JSON-RPC messages between the browser (Monaco Language Client)
   and the language server via stdio

Supported language servers (must be installed on the system PATH):
  - python:     pyright-langserver (via pyright)
  - typescript: typescript-language-server
  - javascript: typescript-language-server (handles JS too)
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from config import WORKSPACE_ROOT

router = APIRouter(tags=["lsp"])
logger = logging.getLogger(__name__)

# Language → command to start the language server over stdio
LSP_COMMANDS: dict[str, list[str]] = {
    "python": ["pyright-langserver", "--stdio"],
    "typescript": ["typescript-language-server", "--stdio"],
    "javascript": ["typescript-language-server", "--stdio"],
}


def _encode_lsp_message(content: dict[str, Any]) -> bytes:
    """Encode a JSON-RPC message with Content-Length header for LSP stdio."""
    body = json.dumps(content).encode("utf-8")
    header = f"Content-Length: {len(body)}\r\n\r\n".encode("ascii")
    return header + body


async def _read_lsp_message(reader: asyncio.StreamReader) -> dict[str, Any] | None:
    """Read one JSON-RPC message from the language server's stdout."""
    headers: dict[str, str] = {}
    while True:
        line = await reader.readline()
        if not line:
            return None
        decoded = line.decode("utf-8").strip()
        if decoded == "":
            break
        if ":" in decoded:
            key, value = decoded.split(":", 1)
            headers[key.strip().lower()] = value.strip()

    content_length = int(headers.get("content-length", "0"))
    if content_length == 0:
        return None

    body = await reader.readexactly(content_length)
    return json.loads(body.decode("utf-8"))


@router.get("/api/lsp/languages")
async def supported_languages() -> dict[str, Any]:
    """Return which languages have LSP support configured."""
    available: list[dict[str, str]] = []
    for lang, cmd in LSP_COMMANDS.items():
        available.append({"language": lang, "command": cmd[0]})
    return {"languages": available}


@router.websocket("/ws/lsp/{language}")
async def lsp_websocket(websocket: WebSocket, language: str):
    """
    WebSocket endpoint that bridges the Monaco Language Client to a real
    language server process via stdio.
    """
    if language not in LSP_COMMANDS:
        await websocket.close(code=4000, reason=f"Unsupported language: {language}")
        return

    await websocket.accept()
    cmd = LSP_COMMANDS[language]
    logger.info(f"[LSP] Starting {language} language server: {' '.join(cmd)}")

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(WORKSPACE_ROOT),
        )
    except FileNotFoundError:
        logger.error(f"[LSP] {cmd[0]} not found on PATH")
        await websocket.send_json({
            "jsonrpc": "2.0",
            "method": "window/showMessage",
            "params": {
                "type": 1,
                "message": f"Language server '{cmd[0]}' not found. Install it to enable IntelliSense for {language}.",
            },
        })
        await websocket.close(code=4001, reason=f"{cmd[0]} not found")
        return
    except Exception as e:
        logger.error(f"[LSP] Failed to start {language} server: {e}")
        await websocket.close(code=4002, reason=str(e))
        return

    assert process.stdin is not None
    assert process.stdout is not None

    async def ws_to_lsp():
        """Forward messages from WebSocket client to language server stdin."""
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    msg = json.loads(data)
                except json.JSONDecodeError:
                    continue
                encoded = _encode_lsp_message(msg)
                process.stdin.write(encoded)
                await process.stdin.drain()
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.debug(f"[LSP] ws_to_lsp error: {e}")

    async def lsp_to_ws():
        """Forward messages from language server stdout to WebSocket client."""
        try:
            while True:
                msg = await _read_lsp_message(process.stdout)
                if msg is None:
                    break
                await websocket.send_json(msg)
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.debug(f"[LSP] lsp_to_ws error: {e}")

    async def stderr_drain():
        """Drain stderr so the process doesn't block."""
        assert process.stderr is not None
        try:
            while True:
                line = await process.stderr.readline()
                if not line:
                    break
                logger.debug(f"[LSP:{language}] stderr: {line.decode().strip()}")
        except Exception:
            pass

    try:
        await asyncio.gather(ws_to_lsp(), lsp_to_ws(), stderr_drain())
    finally:
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                process.kill()
        logger.info(f"[LSP] {language} server stopped (exit={process.returncode})")
