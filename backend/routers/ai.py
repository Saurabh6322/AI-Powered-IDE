"""
AI chat router — connects the IDE to Ollama for local LLM inference.

Endpoints:
  GET  /api/ai/status  — check if Ollama is reachable
  GET  /api/ai/models  — list locally available models
  POST /api/ai/chat    — stream a chat completion via SSE
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from config import OLLAMA_BASE_URL, DEFAULT_MODEL

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an expert coding assistant embedded in an AI-powered IDE. "
    "You help users write, debug, explain, and improve code. "
    "Always format code in markdown fenced code blocks with the language specified. "
    "Be concise and precise. When explaining code, use bullet points."
)


@router.get("/status")
async def ai_status() -> dict[str, Any]:
    """Check whether Ollama is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
        return {"online": True, "url": OLLAMA_BASE_URL}
    except Exception as e:
        logger.warning(f"Ollama unreachable: {e}")
        return {"online": False, "url": OLLAMA_BASE_URL, "error": str(e)}


@router.get("/models")
async def list_models() -> dict[str, Any]:
    """Return the list of models available in Ollama."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            data = resp.json()
        models = [
            {
                "name": m.get("name", ""),
                "size": m.get("size", 0),
                "modified_at": m.get("modified_at", ""),
            }
            for m in data.get("models", [])
        ]
        return {"models": models, "default": DEFAULT_MODEL}
    except Exception as e:
        return {"models": [], "default": DEFAULT_MODEL, "error": str(e)}


@router.post("/chat")
async def chat(request: Request) -> StreamingResponse:
    """
    Stream a chat completion from Ollama via SSE.

    Expects JSON body: { "messages": [...], "model": "optional-model-name" }
    Each message: { "role": "user"|"assistant", "content": "..." }
    """
    body = await request.json()
    messages = body.get("messages", [])
    model = body.get("model", DEFAULT_MODEL)
    use_context = body.get("use_context", False)

    augmented_system_prompt = SYSTEM_PROMPT

    if use_context and messages:
        last_user_msg = next((m["content"] for m in reversed(messages) if m["role"] == "user"), None)
        if last_user_msg:
            try:
                from services.indexer import search
                results = await search(last_user_msg, n_results=3)
                if results:
                    context_str = "\n\n".join(
                        f"File: {r.file_path} (Lines {r.start_line}-{r.end_line})\n```{r.language}\n{r.text}\n```"
                        for r in results
                    )
                    augmented_system_prompt += (
                        "\n\nHere is some context from the user's codebase that might be relevant:\n"
                        f"{context_str}"
                    )
            except Exception as e:
                logger.error(f"Failed to fetch context: {e}")

    # Prepend system prompt
    full_messages = [{"role": "system", "content": augmented_system_prompt}] + messages

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=10.0)) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={"model": model, "messages": full_messages, "stream": True},
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                            token = chunk.get("message", {}).get("content", "")
                            done = chunk.get("done", False)
                            sse_data = json.dumps({"token": token, "done": done})
                            yield f"data: {sse_data}\n\n"
                            if done:
                                break
                        except json.JSONDecodeError:
                            continue
        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': 'Cannot connect to Ollama. Is it running?', 'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
