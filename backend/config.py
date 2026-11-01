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
# Groq (free-tier cloud LLM fallback)
# ---------------------------------------------------------------------------
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
GROQ_DEFAULT_MODEL: str = os.getenv("GROQ_DEFAULT_MODEL", "llama-3.3-70b-versatile")

# ---------------------------------------------------------------------------
# Gemini (free-tier cloud LLM fallback)
# ---------------------------------------------------------------------------
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_DEFAULT_MODEL: str = os.getenv("GEMINI_DEFAULT_MODEL", "gemini-2.0-flash")

# ---------------------------------------------------------------------------
# Auth / JWT
# ---------------------------------------------------------------------------
JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM: str = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("JWT_ACCESS_EXPIRE_MIN", "60"))
JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("JWT_REFRESH_EXPIRE_DAYS", "7"))

# ---------------------------------------------------------------------------
# OAuth (Google + GitHub)
# ---------------------------------------------------------------------------
GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
GITHUB_CLIENT_ID: str = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET: str = os.getenv("GITHUB_CLIENT_SECRET", "")
OAUTH_REDIRECT_BASE: str = os.getenv("OAUTH_REDIRECT_BASE", "http://localhost:5173")

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "sqlite:///./ide_users.db"  # SQLite for dev, PostgreSQL for prod
)

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
