from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.files import router as files_router
from routers.terminal import router as terminal_router
from routers.collab import router as collab_router
from routers.ai import router as ai_router
from routers.rag import router as rag_router
from routers.agents import router as agents_router
from routers.git import router as git_router

app = FastAPI(title="AI-Powered IDE Backend")

# ---------------------------------------------------------------------------
# CORS — allow the Vite dev server (and any local origin) during development.
# In production, tighten ``allow_origins`` to the deployed frontend URL.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(files_router)
app.include_router(terminal_router)
app.include_router(collab_router)
app.include_router(ai_router)
app.include_router(rag_router)
app.include_router(agents_router)
app.include_router(git_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend is running!"}
