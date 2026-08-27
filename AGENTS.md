# AGENTS.md — AI-Powered IDE Project

This file defines the fixed architecture, constraints, and conventions for this project.
Read this fully before creating any task.md, plan, or code. Do not substitute alternative
technologies for anything listed below without asking first — these were deliberately chosen
over specific alternatives, and the reasoning matters as much as the choice.

## Project Overview

Building a browser-based AI-powered IDE (Cursor/Copilot-like) from scratch, as a learning
project. Core principle: **learn → implement → integrate → test**, every sprint ships something
demoable. The developer is a Computer Engineering student with Java/web/AI fundamentals —
do not over-explain basics, do not skip implementation detail.

Full roadmap: 22 sprints (2 weeks each), organized in phases:
1. Core IDE (editor, file explorer, terminal, sandboxed execution, auth)
2. Real-time collaboration (CRDT-based multi-user editing) + multi-theme UI
3. AI Assistant (chat, codegen, explanation, debugging)
4. RAG / project-wide context-aware AI
5. Advanced agents (coding, testing, debugging, review agents) + Git integration
6. Prompt Polisher integration (external service)
7. Extraordinary features (multi-model, LSP, quick wins)
8. Social sign-in
9. Final polish

## Tech Stack — Do Not Substitute

| Layer | Required choice | Explicitly rejected alternative | Why |
|---|---|---|---|
| Frontend | React + Vite | — | Fast dev loop, ecosystem fit for Monaco/xterm |
| Styling | Tailwind CSS, driven by CSS custom properties for theming | Tailwind's built-in `dark:` mode alone | Need N custom themes, not just light/dark |
| Editor | Monaco Editor | — | Same engine as VS Code |
| Terminal | xterm.js | — | Standard for browser terminal emulation |
| Backend | FastAPI (Python) | Node/Express | Async-native, same language as AI/RAG logic |
| Real-time transport | Native WebSockets + y-websocket (for collab) | Socket.IO | One transport layer covers terminal, AI streaming, and collab sync |
| Collaboration | Yjs (CRDT) + y-websocket + y-monaco | Operational Transform (hand-rolled) | CRDTs are the standard, OT is notoriously hard to get right from scratch |
| Relational DB | PostgreSQL | MongoDB | Data is relational (users/projects/permissions/chat history), not document-shaped |
| Cache/Queue | Redis | — | Session caching, background indexing jobs |
| Sandboxed execution | Docker | — | Non-negotiable for running arbitrary user code safely |
| LLM (primary) | **Ollama, local** (Qwen2.5-Coder or DeepSeek-Coder recommended) | OpenAI/Anthropic API as default | Zero cost, offline-capable, no per-token billing even under heavy agent iteration |
| LLM (optional cloud fallback) | Groq free tier or Gemini free tier, opt-in only | — | Free-tier quality boost when needed, never required |
| Embeddings | Ollama `nomic-embed-text` or local `sentence-transformers` | OpenAI embeddings | Zero cost, no rate limits |
| Vector DB | ChromaDB | Pinecone | Free, local, no vendor account needed |
| Agent orchestration | Hand-rolled Python agent loop (plan → act → observe) | LangChain (as default) | Build the real mechanics first; LangChain may be added later as an optional refactor, never a dependency from day one |
| Git integration | GitPython + GitHub REST API | — | Programmatic git ops + PR/commit metadata |
| CI/CD | GitHub Actions | — | Free, integrated with GitHub flow already in use |
| Deployment | Render (backend) free tier + Vercel (frontend) free tier | AWS as default | Zero DevOps overhead; AWS only if project outgrows free tiers |
| Auth | JWT (email/password) first, then Authlib for OAuth (Google + GitHub) added **last** | Auth0/Clerk as default | Reinforces the same auth mental model built in Phase 1 rather than replacing it with a managed black box |
| LSP | Monaco Language Client + open-source language servers (pyright, typescript-language-server, gopls, etc.) | — | Real intellisense, not just syntax highlighting |

## Hard Constraints

- **No paid APIs, ever, by default.** Every feature must work at $0 cost for personal/demo use.
  If a task seems to require a paid service, stop and ask instead of substituting one silently.
- **All AI features route through Ollama** unless the user explicitly selects a cloud fallback
  provider in a multi-model picker. Do not wire chat/codegen/agents to Gemini or any cloud model
  by default just because Antigravity itself runs on Gemini — that's a separate system.
- **Review-driven, not autonomous.** Do not auto-execute multi-step plans without producing a
  visible plan/task.md first and pausing for approval on meaningful steps. This project is a
  learning exercise — no "vibe coding" mode. The user wants to understand what's built, not just
  receive finished output.
- **One phase's foundation must be stable before the next phase builds on it.** Don't jump ahead
  to agents/RAG before the core editor, auth, and file system are solid.
- Docker containers running user code must have resource limits, run as non-root, and not mount
  the host filesystem beyond the project workspace.

## Workflow Conventions

- Git: feature branches → PR → merge. Never commit directly to main.
- Testing: pytest for backend, React Testing Library for frontend. Every sprint that ships a
  feature also ships tests for it.
- Before starting any sprint's work: read this file, then generate a `task.md` breaking that
  sprint into concrete steps, and wait for approval before writing code.
- Folder structure: `/frontend` (React+Vite), `/backend` (FastAPI), keep them cleanly separated.

## Do Not Introduce (Postponed Indefinitely or Explicitly Dropped)

- MongoDB, Pinecone, Socket.IO, AWS, Kubernetes — see table above for reasoning.
- Multi-agent frameworks (AutoGen, CrewAI, etc.) — build single-agent and chained-agent loops
  by hand first.
- "Vibe coding" mode (continuous autonomous iteration with minimal review) — explicitly rejected
  for this project.
- Deep formal System Design study as a dedicated block — pick it up incidentally while scaling
  this project, not as separate theory.
