"""
Agent Orchestration Router.
Handles chat endpoints that include tool calling (Plan -> Act -> Observe).
Supports specialized agent personas with per-persona tool whitelists.
Now supports multi-provider (ollama, groq, gemini).
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
from agents.personas import get_persona, list_personas
from services.llm_providers import PROVIDERS

router = APIRouter(prefix="/api/agents", tags=["agents"])
logger = logging.getLogger(__name__)


@router.get("/personas")
async def get_personas() -> dict[str, Any]:
    return {"personas": list_personas()}


@router.post("/chat")
async def agent_chat(request: Request) -> StreamingResponse:
    """
    Stream a chat completion with tools enabled.
    Accepts optional `persona` and `provider` fields.
    Tool calling only works with Ollama (local) — cloud providers
    fall back to plain streaming with the agent system prompt.
    """
    body = await request.json()
    messages = body.get("messages", [])
    model = body.get("model") or None
    persona_name = body.get("persona", "general")
    provider_id = body.get("provider", "ollama")

    persona = get_persona(persona_name)
    logger.info(f"Agent chat: persona={persona.display_name}, provider={provider_id}")

    messages = process_tool_calls(messages)

    full_messages = [{"role": "system", "content": persona.system_prompt}] + messages

    # Cloud providers: stream without tool calling (their APIs handle it differently)
    if provider_id != "ollama":
        provider = PROVIDERS.get(provider_id)
        if not provider:
            async def error_stream():
                yield f"data: {json.dumps({'error': f'Unknown provider: {provider_id}', 'done': True})}\n\n"
            return StreamingResponse(error_stream(), media_type="text/event-stream")

        async def cloud_stream():
            try:
                async for token in provider["stream"](full_messages, model):
                    yield f"data: {json.dumps({'token': token, 'done': False})}\n\n"
                yield f"data: {json.dumps({'token': '', 'done': True})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

        return StreamingResponse(cloud_stream(), media_type="text/event-stream")

    # Ollama: full tool-calling support
    model = model or DEFAULT_MODEL
    persona_tools = {
        name: tool
        for name, tool in AVAILABLE_TOOLS.items()
        if name in persona.allowed_tools
    }
    tools_schema = [tool.to_ollama_schema() for tool in persona_tools.values()]

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
                        "tools": tools_schema if tools_schema else None,
                    },
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                            message_data = chunk.get("message", {})
                            token = message_data.get("content", "")
                            tool_calls = message_data.get("tool_calls", [])
                            done = chunk.get("done", False)

                            sse_payload: dict[str, Any] = {
                                "token": token,
                                "done": done,
                            }
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
