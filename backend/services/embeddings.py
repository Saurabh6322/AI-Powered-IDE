"""
Embedding service — generates vector embeddings via Ollama's local API.

Uses the `nomic-embed-text` model by default (768 dimensions, zero cost).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import OLLAMA_BASE_URL, EMBEDDING_MODEL

logger = logging.getLogger(__name__)


async def embed_texts(
    texts: list[str],
    model: str = EMBEDDING_MODEL,
) -> list[list[float]]:
    """
    Embed a batch of text strings into vectors via Ollama's /api/embed endpoint.

    Returns a list of float vectors (one per input text).
    Raises RuntimeError if Ollama is unreachable or the model is not available.
    """
    if not texts:
        return []

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=10.0)
        ) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/embed",
                json={"model": model, "input": texts},
            )
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()

        embeddings = data.get("embeddings", [])
        if len(embeddings) != len(texts):
            logger.warning(
                f"Embedding count mismatch: sent {len(texts)}, got {len(embeddings)}"
            )
        return embeddings

    except httpx.ConnectError:
        raise RuntimeError(
            f"Cannot connect to Ollama at {OLLAMA_BASE_URL}. "
            "Make sure Ollama is running (`ollama serve`)."
        )
    except httpx.HTTPStatusError as e:
        raise RuntimeError(
            f"Ollama returned HTTP {e.response.status_code}. "
            f"Is the model '{model}' pulled? Run: ollama pull {model}"
        )
    except Exception as e:
        raise RuntimeError(f"Embedding failed: {e}")


async def embed_query(text: str, model: str = EMBEDDING_MODEL) -> list[float]:
    """Embed a single query string. Convenience wrapper around embed_texts."""
    results = await embed_texts([text], model=model)
    if not results:
        raise RuntimeError("No embedding returned for query")
    return results[0]
