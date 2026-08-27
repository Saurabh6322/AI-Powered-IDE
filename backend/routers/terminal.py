"""
Terminal WebSocket API.

Bridges a FastAPI WebSocket to a sandboxed Docker container's PTY.
Allows running an interactive bash session mapped to the workspace.
"""

import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import docker
from docker.errors import DockerException

from config import WORKSPACE_ROOT

router = APIRouter(prefix="/api/terminal", tags=["terminal"])
logger = logging.getLogger(__name__)

# Initialize Docker client
try:
    docker_client = docker.from_env()
except DockerException:
    logger.warning("Docker is not running or not accessible. Terminal will fail.")
    docker_client = None


async def _read_from_docker(sock, websocket: WebSocket):
    """Continuously read from the Docker raw socket and push to WebSocket."""
    loop = asyncio.get_event_loop()
    try:
        while True:
            # sock.recv is blocking; run in thread pool
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


@router.websocket("/ws")
async def terminal_websocket(websocket: WebSocket):
    await websocket.accept()

    if not docker_client:
        await websocket.send_text("Error: Docker is not available on the server.\r\n")
        await websocket.close()
        return

    container = None
    sock = None
    try:
        # Spawn sandboxed container
        container = docker_client.containers.run(
            "python:3.11-slim",
            command="/bin/bash",
            detach=True,
            tty=True,
            stdin_open=True,
            network_mode="bridge",  # Optional: use "none" for strict offline
            volumes={str(WORKSPACE_ROOT): {"bind": "/workspace", "mode": "rw"}},
            working_dir="/workspace",
        )

        # Get raw socket for PTY streams
        # Use underlying API to get the socket object
        sock = container.attach_socket(params={"stdin": 1, "stdout": 1, "stderr": 1, "stream": 1})

        # Set default size
        container.resize(height=24, width=80)

        # Start background reader task
        reader_task = asyncio.create_task(_read_from_docker(sock, websocket))

        # Read from WebSocket and write to Docker
        while True:
            message_text = await websocket.receive_text()
            try:
                msg = json.loads(message_text)
                msg_type = msg.get("type")
                
                if msg_type == "data":
                    data = msg.get("data", "")
                    if data:
                        # Write to Docker socket (blocking call in a fast loop is usually okay for small chunks,
                        # but ideally wrapped in executor if it blocks)
                        sock.sendall(data.encode("utf-8"))
                        
                elif msg_type == "resize":
                    cols = msg.get("cols", 80)
                    rows = msg.get("rows", 24)
                    try:
                        container.resize(height=rows, width=cols)
                    except Exception as e:
                        logger.warning(f"Failed to resize terminal: {e}")
                        
            except json.JSONDecodeError:
                # If it's not JSON, assume raw data
                sock.sendall(message_text.encode("utf-8"))

    except WebSocketDisconnect:
        logger.debug("Terminal websocket disconnected")
    except Exception as e:
        logger.error(f"Terminal error: {e}")
        try:
            await websocket.send_text(f"Terminal Error: {e}\r\n")
            await websocket.close()
        except Exception:
            pass
    finally:
        # Cleanup container and socket
        if sock:
            try:
                sock.close()
            except Exception:
                pass
        if container:
            try:
                # Force remove to clean up immediately
                container.remove(force=True)
            except Exception:
                pass
