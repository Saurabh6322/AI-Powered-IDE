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
- ⏭️ **Sprint 4: Authentication & Security (Skipped for now)**
  - ⏭️ Implement JWT (email/password) auth on backend
  - ⏭️ Build login/registration UI flows
  - ⏭️ Secure all API and WebSocket endpoints

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
- ⭕ **Sprint 12: Specialized Agents**
  - ⭕ Develop Coding and Testing agents
  - ⭕ Develop Debugging and Code Review agents
- ⭕ **Sprint 13: Git Integration**
  - ⭕ Integrate GitPython and GitHub REST API on backend
  - ⭕ Build UI for committing, branching, and viewing PR metadata

## Phase 6: Prompt Polisher (Sprint 14)
- ⭕ **Sprint 14: Prompt Optimization**
  - ⭕ Integrate the external Prompt Polisher service into the AI workflow

## Phase 7: Extraordinary Features (Sprints 15-17)
- ⭕ **Sprint 15: Real Intellisense (LSP)**
  - ⭕ Integrate Monaco Language Client
  - ⭕ Connect open-source language servers (e.g., Pyright, TS Language Server)
- ⭕ **Sprint 16: Multi-Model Capabilities**
  - ⭕ Build UI to allow opt-in for free tier cloud models (Groq / Gemini)
- ⭕ **Sprint 17: IDE Quick Wins**
  - ⭕ Implement quality-of-life IDE features and shortcuts

## Phase 8: Social Sign-In (Sprint 18)
- ⭕ **Sprint 18: OAuth Implementation**
  - ⭕ Add Authlib for Google and GitHub OAuth (building on the existing JWT mental model)

## Phase 9: Final Polish & Deployment (Sprints 19-22)
- ⭕ **Sprint 19: End-to-End Testing**
  - ⭕ Comprehensive testing (pytest, React Testing Library)
- ⭕ **Sprint 20: Performance Optimization**
  - ⭕ Optimize load times, state syncing, and LLM response handling
- ⭕ **Sprint 21: Free-Tier Deployment**
  - ⭕ Deploy backend to Render (free tier)
  - ⭕ Deploy frontend to Vercel (free tier)
- ⭕ **Sprint 22: Final UX Polish**
  - ⭕ Resolve any UI glitches, polish animations, and finalize documentation
