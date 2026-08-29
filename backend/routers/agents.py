"""
Agent Orchestration Router.
Handles chat endpoints that include tool calling (Plan -> Act -> Observe).
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from config import OLLAMA_BASE_URL, DEFAULT_MODEL
from agents.tools import AVAILABLE_TOOLS
from agents.engine import process_tool_calls

router = APIRouter(prefix="/api/agents", tags=["agents"])
logger = logging.getLogger(__name__)

AGENT_SYSTEM_PROMPT = (
    "You are an autonomous AI Agent in an IDE. You have access to tools. "
    "If you need to read a file or list a directory, use the tools provided. "
    "When you use a tool, you will receive its output in the next message, after which you should answer the user."
)


@router.post("/chat")
async def agent_chat(request: Request) -> StreamingResponse:
    """
    Stream a chat completion from Ollama, with tools enabled.
    """
    body = await request.json()
    messages = body.get("messages", [])
    model = body.get("model", DEFAULT_MODEL)

    # 1. If the last message contains tool_calls, we assume the user approved them.
    # We intercept here, execute the tools, and append the results.
    messages = process_tool_calls(messages)

    # 2. Build the payload for Ollama
    full_messages = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}] + messages
    
    tools_schema = [tool.to_ollama_schema() for tool in AVAILABLE_TOOLS.values()]

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=10.0)) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": model, 
                        "messages": full_messages, 
                        "stream": True,
                        "tools": tools_schema
                    },
                ) as resp:
                    resp.raise_for_status()
                    
                    # Ollama streaming logic for tools is tricky.
                    # Sometimes it yields a `tool_calls` block inside the message chunks.
                    
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                            message_data = chunk.get("message", {})
                            
                            # We might get content, tool_calls, or both.
                            token = message_data.get("content", "")
                            tool_calls = message_data.get("tool_calls", [])
                            done = chunk.get("done", False)
                            
                            sse_payload = {
                                "token": token,
                                "done": done
                            }
                            
                            # If tool calls are present, stream them so the frontend knows
                            if tool_calls:
                                sse_payload["tool_calls"] = tool_calls
                                
                            yield f"data: {json.dumps(sse_payload)}\n\n"
                            
                            if done:
                                break
                        except json.JSONDecodeError:
                            continue
        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': 'Cannot connect to Ollama. Is it running?', 'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
