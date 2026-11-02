"""
Terminal WebSocket API.

Two modes:
  1. Docker mode — runs an interactive bash inside a sandboxed container (secure)
  2. Local mode  — falls back to a local shell when Docker is unavailable (dev only)
"""

import asyncio
import json
import logging
import os
import platform

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from config import WORKSPACE_ROOT

router = APIRouter(prefix="/api/terminal", tags=["terminal"])
logger = logging.getLogger(__name__)

# Try Docker, but don't crash if unavailable
docker_client = None
try:
    import docker
    docker_client = docker.from_env()
    docker_client.ping()
    logger.info("Docker available — terminal will use sandboxed containers")
except Exception:
    logger.info("Docker unavailable — terminal will use local shell fallback")
    docker_client = None


# ---------------------------------------------------------------------------
# Docker-based terminal
# ---------------------------------------------------------------------------

async def _read_from_docker(sock, websocket: WebSocket):
    loop = asyncio.get_event_loop()
    try:
        while True:
            data = await loop.run_in_executor(None, sock.recv, 2048)
            if not data:
                break
            await websocket.send_bytes(data)
    except Exception as e:
        logger.debug(f"Docker read error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


async def _run_docker_terminal(websocket: WebSocket):
    container = None
    sock = None
    try:
        container = docker_client.containers.run(
            "python:3.11-slim",
            command="/bin/bash",
            detach=True,
            tty=True,
            stdin_open=True,
            network_mode="bridge",
            volumes={str(WORKSPACE_ROOT): {"bind": "/workspace", "mode": "rw"}},
            working_dir="/workspace",
        )
        sock = container.attach_socket(params={"stdin": 1, "stdout": 1, "stderr": 1, "stream": 1})
        container.resize(height=24, width=80)
        reader_task = asyncio.create_task(_read_from_docker(sock, websocket))

        while True:
            message_text = await websocket.receive_text()
            try:
                msg = json.loads(message_text)
                msg_type = msg.get("type")
                if msg_type == "data":
                    data = msg.get("data", "")
                    if data:
                        sock.sendall(data.encode("utf-8"))
                elif msg_type == "resize":
                    cols = msg.get("cols", 80)
                    rows = msg.get("rows", 24)
                    try:
                        container.resize(height=rows, width=cols)
                    except Exception:
                        pass
            except json.JSONDecodeError:
                sock.sendall(message_text.encode("utf-8"))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Docker terminal error: {e}")
        try:
            await websocket.send_text(f"Terminal Error: {e}\r\n")
            await websocket.close()
        except Exception:
            pass
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass
        if container:
            try:
                container.remove(force=True)
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Local shell fallback (dev mode, no Docker)
# ---------------------------------------------------------------------------

async def _run_local_terminal(websocket: WebSocket):
    """Spawn a local shell process and bridge it to the WebSocket."""
    is_windows = platform.system() == "Windows"
    shell = os.environ.get("COMSPEC", "cmd.exe") if is_windows else os.environ.get("SHELL", "/bin/bash")

    try:
        process = await asyncio.create_subprocess_exec(
            shell,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(WORKSPACE_ROOT),
        )
    except Exception as e:
        await websocket.send_text(f"Failed to start shell: {e}\r\n")
        await websocket.close()
        return

    assert process.stdin is not None
    assert process.stdout is not None

    async def read_output():
        try:
            while True:
                data = await process.stdout.read(4096)
                if not data:
                    break
                await websocket.send_bytes(data)
        except Exception:
            pass
        finally:
            try:
                await websocket.close()
            except Exception:
                pass

    reader_task = asyncio.create_task(read_output())

    try:
        while True:
            message_text = await websocket.receive_text()
            try:
                msg = json.loads(message_text)
                msg_type = msg.get("type")
                if msg_type == "data":
                    data = msg.get("data", "")
                    if data:
                        process.stdin.write(data.encode("utf-8"))
                        await process.stdin.drain()
                elif msg_type == "resize":
                    pass  # local subprocess doesn't support resize
            except json.JSONDecodeError:
                process.stdin.write(message_text.encode("utf-8"))
                await process.stdin.drain()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"Local terminal error: {e}")
    finally:
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=3.0)
            except asyncio.TimeoutError:
                process.kill()
        reader_task.cancel()


# ---------------------------------------------------------------------------
# WebSocket endpoint — auto-selects Docker or local
# ---------------------------------------------------------------------------

@router.websocket("/ws")
async def terminal_websocket(websocket: WebSocket):
    await websocket.accept()

    if docker_client:
        await _run_docker_terminal(websocket)
    else:
        await _run_local_terminal(websocket)
