"""Application configuration loaded from environment variables."""
import os
from pathlib import Path

# Root directory where user workspaces / project files are stored.
# In dev, defaults to a ``workspace`` folder next to this file.
WORKSPACE_ROOT: Path = Path(
    os.getenv("WORKSPACE_ROOT", str(Path(__file__).resolve().parent / "workspace"))
).resolve()

# Ensure it exists on startup
WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Ollama (local LLM)
# ---------------------------------------------------------------------------
OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL: str = os.getenv("DEFAULT_MODEL", "qwen2.5-coder:1.5b")

# ---------------------------------------------------------------------------
# ChromaDB (vector store for RAG)
# ---------------------------------------------------------------------------
CHROMA_PERSIST_DIR: Path = Path(
    os.getenv("CHROMA_PERSIST_DIR", str(Path(__file__).resolve().parent / "chroma_data"))
).resolve()
CHROMA_PERSIST_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Embeddings & Indexer
# ---------------------------------------------------------------------------
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")

INDEXABLE_EXTENSIONS: set[str] = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".md",
    ".json", ".yaml", ".yml", ".toml", ".sql", ".sh", ".go",
    ".rs", ".java", ".c", ".cpp", ".h",
}

SKIP_DIRS: set[str] = {
    "node_modules", ".git", "__pycache__", "venv", ".venv",
    "dist", "build", ".next", ".cache", "chroma_data",
}
