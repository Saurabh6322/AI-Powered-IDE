"""
AI chat router — unified multi-provider LLM gateway.

Providers:
  - ollama  (local, default)
  - groq    (cloud free tier, opt-in)
  - gemini  (cloud free tier, opt-in)

Endpoints:
  GET  /api/ai/status          — check if Ollama is reachable (legacy compat)
  GET  /api/ai/models          — list locally available models (legacy compat)
  GET  /api/ai/providers       — list all providers with status + models
  GET  /api/ai/providers/{id}/status — check one provider
  GET  /api/ai/providers/{id}/models — list one provider's models
  POST /api/ai/chat            — stream a chat completion via SSE (any provider)
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from config import DEFAULT_MODEL
from services.llm_providers import PROVIDERS

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an expert coding assistant embedded in an AI-powered IDE. "
    "You help users write, debug, explain, and improve code. "
    "Always format code in markdown fenced code blocks with the language specified. "
    "Be concise and precise. When explaining code, use bullet points."
)


# ---------------------------------------------------------------------------
# Legacy endpoints (backwards compat with existing frontend)
# ---------------------------------------------------------------------------

@router.get("/status")
async def ai_status() -> dict[str, Any]:
    result = await PROVIDERS["ollama"]["status"]()
    return {**result, "url": "ollama"}


@router.get("/models")
async def list_models() -> dict[str, Any]:
    models = await PROVIDERS["ollama"]["models"]()
    return {"models": models, "default": DEFAULT_MODEL}


# ---------------------------------------------------------------------------
# Multi-provider endpoints
# ---------------------------------------------------------------------------

@router.get("/providers")
async def list_providers() -> dict[str, Any]:
    """Return all providers with their status and available models."""
    result = []
    for provider_id, provider in PROVIDERS.items():
        status = await provider["status"]()
        models = await provider["models"]() if status["online"] else []
        result.append({
            "id": provider_id,
            "display_name": provider["display_name"],
            "type": provider["type"],
            "online": status["online"],
            "error": status.get("error"),
            "models": models,
            "default_model": provider["default_model"],
        })
    return {"providers": result}


@router.get("/providers/{provider_id}/status")
async def provider_status(provider_id: str) -> dict[str, Any]:
    provider = PROVIDERS.get(provider_id)
    if not provider:
        return {"online": False, "error": f"Unknown provider: {provider_id}"}
    status = await provider["status"]()
    return {"provider": provider_id, **status}


@router.get("/providers/{provider_id}/models")
async def provider_models(provider_id: str) -> dict[str, Any]:
    provider = PROVIDERS.get(provider_id)
    if not provider:
        return {"models": [], "error": f"Unknown provider: {provider_id}"}
    models = await provider["models"]()
    return {"provider": provider_id, "models": models, "default": provider["default_model"]}


# ---------------------------------------------------------------------------
# Unified chat endpoint
# ---------------------------------------------------------------------------

@router.post("/chat")
async def chat(request: Request) -> StreamingResponse:
    """
    Stream a chat completion via SSE from any configured provider.

    JSON body:
      messages:  [{ role, content }, ...]
      provider:  "ollama" | "groq" | "gemini"  (default: "ollama")
      model:     model name (default: provider's default)
      use_context: bool — augment system prompt with RAG results
    """
    body = await request.json()
    messages = body.get("messages", [])
    provider_id = body.get("provider", "ollama")
    model = body.get("model") or None
    use_context = body.get("use_context", False)

    provider = PROVIDERS.get(provider_id)
    if not provider:
        async def error_stream():
            yield f"data: {json.dumps({'error': f'Unknown provider: {provider_id}', 'done': True})}\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    augmented_system_prompt = SYSTEM_PROMPT

    if use_context and messages:
        last_user_msg = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"),
            None,
        )
        if last_user_msg:
            try:
                from services.indexer import search
                results = await search(last_user_msg, n_results=3)
                if results:
                    context_str = "\n\n".join(
                        f"File: {r.file_path} (Lines {r.start_line}-{r.end_line})\n"
                        f"```{r.language}\n{r.text}\n```"
                        for r in results
                    )
                    augmented_system_prompt += (
                        "\n\nHere is some context from the user's codebase:\n"
                        f"{context_str}"
                    )
            except Exception as e:
                logger.error(f"Failed to fetch context: {e}")

    full_messages = [{"role": "system", "content": augmented_system_prompt}] + messages

    async def event_stream():
        try:
            async for token in provider["stream"](full_messages, model):
                sse_data = json.dumps({"token": token, "done": False})
                yield f"data: {sse_data}\n\n"
            yield f"data: {json.dumps({'token': '', 'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
