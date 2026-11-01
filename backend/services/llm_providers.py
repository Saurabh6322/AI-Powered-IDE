"""
Unified LLM provider abstraction.

Supports three providers:
  - ollama  (local, always available)
  - groq    (cloud, opt-in, free tier)
  - gemini  (cloud, opt-in, free tier)

Each provider exposes:
  - status check
  - model listing
  - streaming chat (async generator yielding token strings)
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

import httpx

from config import (
    OLLAMA_BASE_URL,
    DEFAULT_MODEL,
    GROQ_API_KEY,
    GROQ_BASE_URL,
    GROQ_DEFAULT_MODEL,
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    GEMINI_DEFAULT_MODEL,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------

async def ollama_status() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
        return {"online": True}
    except Exception as e:
        return {"online": False, "error": str(e)}


async def ollama_models() -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            data = resp.json()
        return [
            {"name": m.get("name", ""), "size": m.get("size", 0)}
            for m in data.get("models", [])
        ]
    except Exception:
        return []


async def ollama_stream(
    messages: list[dict], model: str | None = None
) -> AsyncIterator[str]:
    model = model or DEFAULT_MODEL
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(300.0, connect=10.0)
        ) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_BASE_URL}/api/chat",
                json={"model": model, "messages": messages, "stream": True},
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                        token = chunk.get("message", {}).get("content", "")
                        if token:
                            yield token
                        if chunk.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue
    except httpx.ConnectError:
        yield "\n\n⚠️ Cannot connect to Ollama. Is it running?"
    except Exception as e:
        yield f"\n\n⚠️ Ollama error: {e}"


# ---------------------------------------------------------------------------
# Groq (OpenAI-compatible API)
# ---------------------------------------------------------------------------

async def groq_status() -> dict[str, Any]:
    if not GROQ_API_KEY:
        return {"online": False, "error": "GROQ_API_KEY not set"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{GROQ_BASE_URL}/models",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            )
            resp.raise_for_status()
        return {"online": True}
    except Exception as e:
        return {"online": False, "error": str(e)}


async def groq_models() -> list[dict[str, Any]]:
    if not GROQ_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{GROQ_BASE_URL}/models",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            )
            resp.raise_for_status()
            data = resp.json()
        return [
            {"name": m["id"], "owned_by": m.get("owned_by", "")}
            for m in data.get("data", [])
            if m.get("active", True)
        ]
    except Exception:
        return []


async def groq_stream(
    messages: list[dict], model: str | None = None
) -> AsyncIterator[str]:
    if not GROQ_API_KEY:
        yield "⚠️ Groq API key not configured. Set GROQ_API_KEY in your environment."
        return
    model = model or GROQ_DEFAULT_MODEL
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=10.0)
        ) as client:
            async with client.stream(
                "POST",
                f"{GROQ_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": messages,
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        chunk = json.loads(payload)
                        delta = chunk["choices"][0].get("delta", {})
                        token = delta.get("content", "")
                        if token:
                            yield token
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
    except Exception as e:
        yield f"\n\n⚠️ Groq error: {e}"


# ---------------------------------------------------------------------------
# Gemini (Google Generative AI REST API)
# ---------------------------------------------------------------------------

async def gemini_status() -> dict[str, Any]:
    if not GEMINI_API_KEY:
        return {"online": False, "error": "GEMINI_API_KEY not set"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{GEMINI_BASE_URL}/models?key={GEMINI_API_KEY}"
            )
            resp.raise_for_status()
        return {"online": True}
    except Exception as e:
        return {"online": False, "error": str(e)}


async def gemini_models() -> list[dict[str, Any]]:
    if not GEMINI_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{GEMINI_BASE_URL}/models?key={GEMINI_API_KEY}"
            )
            resp.raise_for_status()
            data = resp.json()
        return [
            {
                "name": m["name"].replace("models/", ""),
                "display_name": m.get("displayName", ""),
            }
            for m in data.get("models", [])
            if "generateContent" in m.get("supportedGenerationMethods", [])
        ]
    except Exception:
        return []


def _to_gemini_contents(messages: list[dict]) -> tuple[str | None, list[dict]]:
    """Convert OpenAI-style messages to Gemini contents format."""
    system_instruction = None
    contents = []
    for msg in messages:
        role = msg["role"]
        text = msg.get("content", "")
        if role == "system":
            system_instruction = text
        elif role == "user":
            contents.append({"role": "user", "parts": [{"text": text}]})
        elif role == "assistant":
            contents.append({"role": "model", "parts": [{"text": text}]})
    return system_instruction, contents


async def gemini_stream(
    messages: list[dict], model: str | None = None
) -> AsyncIterator[str]:
    if not GEMINI_API_KEY:
        yield "⚠️ Gemini API key not configured. Set GEMINI_API_KEY in your environment."
        return
    model = model or GEMINI_DEFAULT_MODEL
    system_instruction, contents = _to_gemini_contents(messages)

    body: dict[str, Any] = {"contents": contents}
    if system_instruction:
        body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    url = (
        f"{GEMINI_BASE_URL}/models/{model}:streamGenerateContent"
        f"?alt=sse&key={GEMINI_API_KEY}"
    )
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=10.0)
        ) as client:
            async with client.stream("POST", url, json=body) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    try:
                        chunk = json.loads(line[6:])
                        parts = (
                            chunk.get("candidates", [{}])[0]
                            .get("content", {})
                            .get("parts", [])
                        )
                        for part in parts:
                            token = part.get("text", "")
                            if token:
                                yield token
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
    except Exception as e:
        yield f"\n\n⚠️ Gemini error: {e}"


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

PROVIDERS = {
    "ollama": {
        "display_name": "Ollama (Local)",
        "type": "local",
        "status": ollama_status,
        "models": ollama_models,
        "stream": ollama_stream,
        "default_model": DEFAULT_MODEL,
    },
    "groq": {
        "display_name": "Groq (Cloud)",
        "type": "cloud",
        "status": groq_status,
        "models": groq_models,
        "stream": groq_stream,
        "default_model": GROQ_DEFAULT_MODEL,
    },
    "gemini": {
        "display_name": "Gemini (Cloud)",
        "type": "cloud",
        "status": gemini_status,
        "models": gemini_models,
        "stream": gemini_stream,
        "default_model": GEMINI_DEFAULT_MODEL,
    },
}
