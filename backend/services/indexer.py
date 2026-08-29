"""
Workspace Indexer — chunks project files and stores embeddings in ChromaDB.

Responsibilities:
  - Walk the workspace directory tree
  - Split source files into overlapping text chunks
  - Embed chunks via the embedding service
  - Upsert into a ChromaDB collection
  - Provide semantic search over indexed chunks
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import chromadb

from config import (
    WORKSPACE_ROOT,
    CHROMA_PERSIST_DIR,
    INDEXABLE_EXTENSIONS,
    SKIP_DIRS,
)
from services.embeddings import embed_texts, embed_query

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ChromaDB client (singleton, persistent)
# ---------------------------------------------------------------------------
_chroma_client = chromadb.PersistentClient(path=str(CHROMA_PERSIST_DIR))
COLLECTION_NAME = "workspace_code"


def _get_collection() -> chromadb.Collection:
    """Get or create the workspace code collection."""
    return _chroma_client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Chunk:
    """A text chunk from a source file."""
    id: str
    text: str
    file_path: str
    start_line: int
    end_line: int
    language: str


@dataclass
class SearchResult:
    """A single search result from the vector store."""
    text: str
    file_path: str
    start_line: int
    end_line: int
    language: str
    distance: float


@dataclass
class IndexStats:
    """Statistics from an indexing run."""
    files_indexed: int = 0
    chunks_created: int = 0
    chunks_embedded: int = 0
    errors: list[str] = field(default_factory=list)
    duration_seconds: float = 0.0


# ---------------------------------------------------------------------------
# File extension → language mapping
# ---------------------------------------------------------------------------
EXT_TO_LANG: dict[str, str] = {
    ".py": "python", ".ts": "typescript", ".tsx": "typescriptreact",
    ".js": "javascript", ".jsx": "javascriptreact", ".css": "css",
    ".html": "html", ".md": "markdown", ".json": "json",
    ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".sql": "sql", ".sh": "shell", ".go": "go",
    ".rs": "rust", ".java": "java", ".c": "c", ".cpp": "cpp", ".h": "c",
}


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def chunk_file(
    file_path: str,
    content: str,
    chunk_size: int = 500,
    overlap: int = 100,
) -> list[Chunk]:
    """
    Split a file's content into overlapping character-based chunks.

    Each chunk tracks its source file, start/end line numbers, and language.
    """
    if not content.strip():
        return []

    ext = Path(file_path).suffix.lower()
    language = EXT_TO_LANG.get(ext, "text")
    lines = content.split("\n")
    chunks: list[Chunk] = []

    # Build chunks by character position, then map back to line numbers
    pos = 0
    chunk_idx = 0
    while pos < len(content):
        end = min(pos + chunk_size, len(content))
        chunk_text = content[pos:end]

        # Find the line numbers for this chunk
        char_count = 0
        start_line = 1
        end_line = len(lines)
        for i, line in enumerate(lines):
            line_len = len(line) + 1  # +1 for newline
            if char_count + line_len > pos and start_line == 1:
                start_line = i + 1
            if char_count + line_len >= end:
                end_line = i + 1
                break
            char_count += line_len

        # Create a stable ID based on file path and chunk index
        chunk_id = f"{file_path}::chunk-{chunk_idx}"
        chunks.append(Chunk(
            id=chunk_id,
            text=chunk_text,
            file_path=file_path,
            start_line=start_line,
            end_line=end_line,
            language=language,
        ))

        chunk_idx += 1
        pos += chunk_size - overlap
        if pos >= len(content):
            break

    return chunks


# ---------------------------------------------------------------------------
# Indexing
# ---------------------------------------------------------------------------

def _collect_files(workspace: Path) -> list[Path]:
    """Walk the workspace and collect indexable files."""
    files: list[Path] = []
    for path in workspace.rglob("*"):
        # Skip excluded directories
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.is_file() and path.suffix.lower() in INDEXABLE_EXTENSIONS:
            # Skip very large files (> 100KB)
            try:
                if path.stat().st_size > 100_000:
                    continue
            except OSError:
                continue
            files.append(path)
    return files


import asyncio

def run_indexing_sync(workspace: Path | None = None) -> dict:
    """Synchronous wrapper for RQ worker to run the async indexing."""
    stats = asyncio.run(index_workspace(workspace))
    return {
        "files_indexed": stats.files_indexed,
        "chunks_created": stats.chunks_created,
        "chunks_embedded": stats.chunks_embedded,
        "duration_seconds": stats.duration_seconds,
    }

async def index_workspace(workspace: Path | None = None) -> IndexStats:
    """
    Index all eligible files in the workspace into ChromaDB.

    Clears the existing collection and re-indexes from scratch.
    """
    workspace = workspace or WORKSPACE_ROOT
    stats = IndexStats()
    start = time.time()

    # Collect files
    files = _collect_files(workspace)
    logger.info(f"Found {len(files)} indexable files in {workspace}")

    # Chunk all files
    all_chunks: list[Chunk] = []
    for fpath in files:
        try:
            content = fpath.read_text(encoding="utf-8", errors="replace")
            rel_path = str(fpath.relative_to(workspace))
            chunks = chunk_file(rel_path, content)
            all_chunks.extend(chunks)
            stats.files_indexed += 1
        except Exception as e:
            stats.errors.append(f"{fpath}: {e}")
            logger.warning(f"Failed to read {fpath}: {e}")

    stats.chunks_created = len(all_chunks)
    logger.info(f"Created {len(all_chunks)} chunks from {stats.files_indexed} files")

    if not all_chunks:
        stats.duration_seconds = time.time() - start
        return stats

    # Embed in batches (Ollama can handle reasonable batch sizes)
    BATCH_SIZE = 50
    collection = _get_collection()

    # Clear existing data for a clean re-index
    try:
        _chroma_client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
    collection = _get_collection()

    for i in range(0, len(all_chunks), BATCH_SIZE):
        batch = all_chunks[i : i + BATCH_SIZE]
        texts = [c.text for c in batch]

        try:
            embeddings = await embed_texts(texts)
            collection.upsert(
                ids=[c.id for c in batch],
                embeddings=embeddings,
                documents=texts,
                metadatas=[
                    {
                        "file_path": c.file_path,
                        "start_line": c.start_line,
                        "end_line": c.end_line,
                        "language": c.language,
                    }
                    for c in batch
                ],
            )
            stats.chunks_embedded += len(batch)
        except Exception as e:
            stats.errors.append(f"Batch {i}-{i+len(batch)}: {e}")
            logger.error(f"Embedding batch failed: {e}")

    stats.duration_seconds = time.time() - start
    logger.info(
        f"Indexing complete: {stats.chunks_embedded}/{stats.chunks_created} chunks "
        f"in {stats.duration_seconds:.1f}s"
    )
    return stats


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

async def search(query: str, n_results: int = 5) -> list[SearchResult]:
    """
    Embed the query and find the most semantically similar code chunks.
    """
    collection = _get_collection()

    # Check if collection has any data
    if collection.count() == 0:
        return []

    query_embedding = await embed_query(query)

    results: dict[str, Any] = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    search_results: list[SearchResult] = []
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    for doc, meta, dist in zip(documents, metadatas, distances):
        search_results.append(SearchResult(
            text=doc,
            file_path=meta.get("file_path", ""),
            start_line=meta.get("start_line", 0),
            end_line=meta.get("end_line", 0),
            language=meta.get("language", ""),
            distance=dist,
        ))

    return search_results


def get_index_stats() -> dict[str, Any]:
    """Return current index statistics."""
    collection = _get_collection()
    return {
        "total_chunks": collection.count(),
        "collection_name": COLLECTION_NAME,
        "persist_dir": str(CHROMA_PERSIST_DIR),
    }
