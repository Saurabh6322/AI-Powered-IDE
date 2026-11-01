# AI-Powered IDE: Full Project Task Tracker

This document tracks the entire 22-sprint (9-phase) roadmap as defined in `AGENTS.md`.

## Phase 1: Core IDE (Sprints 1-4)
- ✅ **Sprint 1: Project Setup & Architecture Foundations**
  - ✅ Initialize React + Vite frontend `/frontend`
  - ✅ Initialize FastAPI backend `/backend`
  - ✅ Set up Tailwind CSS using CSS variables (for multi-theme prep)
  - ✅ Set up PostgreSQL and Redis (via Docker Compose)
  - ✅ Set up Git repository and basic GitHub Actions CI for tests
- ✅ **Sprint 2: Core Editor & File Explorer**
  - ✅ Integrate Monaco Editor in the frontend
  - ✅ Build basic File Explorer UI (tree view)
  - ✅ Implement backend API for local file system operations (read/write/list)
- ✅ **Sprint 3: Terminal & Sandboxed Execution**
  - ✅ Integrate `xterm.js` in the frontend
  - ✅ Implement native WebSockets on FastAPI for terminal streaming
  - ✅ Configure Docker-based sandboxed execution (resource limits, non-root, restricted mounts)
- ✅ **Sprint 4: Authentication & Security (completed in Phase 8)**
  - ✅ Implement JWT (email/password) auth on backend
  - ✅ Build login/registration UI flows
  - ✅ Auth middleware + protected routes

## Phase 2: Real-time Collaboration (Sprints 5-6)
- ✅ **Sprint 5: Real-time Transport & Multi-Theme**
  - ✅ Set up Yjs and `y-websocket` infrastructure
  - ✅ Complete full multi-theme UI support (light, dark, custom)
- ✅ **Sprint 6: Multi-User Editing**
  - ✅ Integrate `y-monaco` for CRDT-based multi-user editing
  - ✅ Sync File Explorer state across connected clients

## Phase 3: AI Assistant (Sprints 7-8)
- ✅ **Sprint 7: Local AI Integration**
  - ✅ Set up Ollama with local models (Qwen2.5-Coder or DeepSeek-Coder)
  - ✅ Build AI Chat UI panel
- ✅ **Sprint 8: Core AI Features**
  - ✅ Implement code generation and insertion
  - ✅ Implement code explanation and basic debugging prompts

## Phase 4: RAG / Context-Aware AI (Sprints 9-10)
- ✅ **Sprint 9: Vector Database & Embeddings**
  - ✅ Set up ChromaDB locally
  - ✅ Generate local embeddings (`nomic-embed-text` or `sentence-transformers`)
- ✅ **Sprint 10: RAG Implementation**
  - ✅ Build background indexing jobs for the project workspace (via Redis queue)
  - ✅ Update AI chat to provide context-aware responses based on workspace files

## Phase 5: Advanced Agents + Git Integration (Sprints 11-13)
- ✅ **Sprint 11: Agent Orchestration Engine**
  - ✅ Build a hand-rolled Python agent loop (Plan → Act → Observe)
- ✅ **Sprint 12: Specialized Agents**
  - ✅ Develop Coding and Testing agents
  - ✅ Develop Debugging and Code Review agents
- ✅ **Sprint 13: Git Integration**
  - ✅ Integrate GitPython and GitHub REST API on backend
  - ✅ Build UI for committing, branching, and viewing PR metadata

## Phase 6: Prompt Polisher (Sprint 14)
- ⏭️ **Sprint 14: Prompt Optimization (SKIPPED)**
  - ⏭️ Integrate the external Prompt Polisher service into the AI workflow

## Phase 7: Extraordinary Features (Sprints 15-17)
- ✅ **Sprint 15: Multi-Model Capabilities**
  - ✅ Add backend config for cloud providers (Groq free tier + Gemini free tier)
  - ✅ Create `/api/ai/providers` endpoint listing available providers and their models
  - ✅ Unified streaming via `services/llm_providers.py` (Ollama, Groq, Gemini)
  - ✅ Refactor `/api/ai/chat` to accept `provider` param and route to correct backend
  - ✅ Build provider/model picker UI in ChatPanel (Ollama local | Groq cloud | Gemini cloud)
  - ✅ Show provider status indicators (online/offline per provider)
  - ✅ Persist user's last-selected provider+model in localStorage
- ✅ **Sprint 16: IDE Quick Wins**
  - ✅ Command Palette (Ctrl+Shift+P) — search & execute IDE actions
  - ✅ Keyboard shortcut overlay / cheat sheet (Ctrl+/)
  - ✅ Find in files (Ctrl+Shift+F) — workspace-wide text search via backend `/api/files/search/text`
  - ✅ Breadcrumb navigation bar above editor (file path)
  - ✅ Notification / toast system for save confirmations, errors, etc.
  - ✅ Status bar at the bottom (line/col, language, encoding, Git branch)
  - ✅ Sidebar toggle (Ctrl+B) and AI panel toggle (Ctrl+J) keyboard shortcuts
  - ✅ Cursor position tracking from Monaco → StatusBar
- ✅ **Sprint 17: Real Intellisense (LSP)**
  - ✅ Create backend WebSocket endpoint `/ws/lsp/{language}` that spawns & proxies to a language server
  - ✅ Support Pyright (Python) and typescript-language-server (TS/JS)
  - ✅ Lightweight `useLSP` hook for JSON-RPC over WebSocket
  - ✅ `useLSPMonaco` hook wires autocomplete, hover, and diagnostics to Monaco
  - ✅ MonacoEditor sends `textDocument/didOpen` and `textDocument/didChange` to LSP
  - ✅ Diagnostics from LSP displayed as Monaco editor markers
  - ✅ `/api/lsp/languages` endpoint lists supported languages

## Phase 8: Authentication & Social Sign-In (Sprints 4 + 18)
- ✅ **Sprint 4+18: JWT Auth + OAuth**
  - ✅ Add SQLAlchemy User model (id, email, hashed_password, name, avatar_url, oauth_provider)
  - ✅ Add password hashing with bcrypt
  - ✅ Implement JWT token creation + verification (access + refresh tokens)
  - ✅ Create auth router: POST /api/auth/register, POST /api/auth/login, GET /api/auth/me, POST /api/auth/refresh
  - ✅ Add Google OAuth: GET /api/auth/google, GET /api/auth/google/callback
  - ✅ Add GitHub OAuth: GET /api/auth/github, GET /api/auth/github/callback
  - ✅ Build Login/Register page UI with email+password form
  - ✅ Add "Sign in with Google" and "Sign in with GitHub" buttons
  - ✅ Store JWT in localStorage, attach to API requests via AuthContext
  - ✅ Protected route: redirect to login if unauthenticated, OAuth callback handler
  - ✅ Show user avatar + name in the title bar with logout button

## Phase 9: Final Polish & Deployment (Sprints 19-22)
- ✅ **Sprint 19: End-to-End Testing**
  - ✅ Backend: pytest tests for auth endpoints (register, login, me, refresh, duplicate, bad token)
  - ✅ Backend: pytest tests for file API (tree, read, write, search)
  - ✅ Backend: pytest tests for health, AI providers, LSP languages
- ✅ **Sprint 20: Performance Optimization**
  - ✅ React.lazy + Suspense for code-splitting (IDELayout, AuthPage, OAuthCallback)
  - ✅ Loading skeleton component with shimmer animation
  - ✅ Error boundary for graceful crash recovery
- ✅ **Sprint 21: Free-Tier Deployment**
  - ✅ Dockerfile for backend (Python 3.12 slim + uvicorn)
  - ✅ render.yaml for Render deployment (free tier, env vars)
  - ✅ vercel.json for Vercel frontend (API proxy rewrites, SPA fallback)
- ✅ **Sprint 22: Final UX Polish**
  - ✅ Splash screen with pulsing logo on initial load
  - ✅ Meta tags (description, theme-color) and favicon
  - ✅ Title updated to "Antigravity IDE"
  - ✅ Toast animations (slide-in)
  - ✅ Error boundary with reload button
