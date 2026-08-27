"""
RAG router — workspace indexing and semantic search endpoints.

Endpoints:
  POST /api/rag/index   — trigger a full workspace re-index
  GET  /api/rag/search   — semantic search over indexed code
  GET  /api/rag/status   — indexing statistics
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Query

from services.indexer import index_workspace, search, get_index_stats

router = APIRouter(prefix="/api/rag", tags=["rag"])
logger = logging.getLogger(__name__)


@router.post("/index")
async def trigger_index() -> dict[str, Any]:
    """
    Trigger a full workspace re-index.

    Walks all eligible files, chunks them, generates embeddings via Ollama,
    and stores them in ChromaDB.
    """
    try:
        stats = await index_workspace()
        return {
            "success": True,
            "files_indexed": stats.files_indexed,
            "chunks_created": stats.chunks_created,
            "chunks_embedded": stats.chunks_embedded,
            "duration_seconds": round(stats.duration_seconds, 2),
            "errors": stats.errors[:10],  # Cap error list
        }
    except Exception as e:
        logger.error(f"Indexing failed: {e}")
        return {
            "success": False,
            "error": str(e),
        }


@router.get("/search")
async def search_code(
    q: str = Query(..., description="Search query"),
    n: int = Query(5, ge=1, le=20, description="Number of results"),
) -> dict[str, Any]:
    """
    Semantic search over indexed workspace code.

    Returns the top-N most relevant code chunks with file paths and line numbers.
    """
    try:
        results = await search(q, n_results=n)
        return {
            "query": q,
            "results": [
                {
                    "text": r.text,
                    "file_path": r.file_path,
                    "start_line": r.start_line,
                    "end_line": r.end_line,
                    "language": r.language,
                    "distance": round(r.distance, 4),
                }
                for r in results
            ],
        }
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return {"query": q, "results": [], "error": str(e)}


@router.get("/status")
async def rag_status() -> dict[str, Any]:
    """Return current indexing statistics."""
    try:
        stats = get_index_stats()
        return {"online": True, **stats}
    except Exception as e:
        return {"online": False, "error": str(e)}
