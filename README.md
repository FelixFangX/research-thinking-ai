# Research Topic Agent

[中文文档](README.zh-CN.md)

An AI-powered research topic selection system that transforms vague research interests into actionable, evidence-backed research directions. Built with React, TypeScript, and real-time LLM integration.

## Features

- **4-Stage Pipeline**: Literature Retrieval → Landscape Mapping → Path Comparison → Convergence
- **Dual Participation Modes**: HIGH (step-by-step confirmation) / LOW (auto with post-hoc override)
- **Multi-Provider LLM**: Supports OpenAI and Anthropic APIs with SSE streaming
- **Evidence Governance**: Tiered source credibility (T1/T2/T3), conflict detection, citation tracking
- **Complexity-Aware Routing**: Auto-selects architecture (Single Agent / Orchestrator / Multi-Agent / RAG / KG)
- **Iteration Tracking**: 7-day action plan, research journal, run comparison
- **Secure Key Storage**: API Key encrypted with AES-GCM via Web Crypto API; passwords hashed with SHA-256
- **Subscription System**: Free / Pro tier paywall with export gating
- **Boot Animation**: Pixel-art system boot sequence with logo reveal
- **Session History**: Clickable history records stored in IndexedDB with full result replay
- **Smart Auto-Scroll**: Follows pipeline progress, pauses on manual scroll
- **No-LLM Guard**: Dialog prompt when API key is missing — configure, mock preview, or cancel
- **i18n**: English and Chinese with IP-based auto-detection
- **Full-Stack i18n**: All pipeline data, LLM prompts, mock data, and export reports are locale-aware (not just UI strings)
- **API Connectivity Test**: Test LLM connection directly from settings
- **Markdown + Data Visualization**: AI thinking rendered as Markdown; structured JSON results rendered as visual data cards (evidence cards, architecture diagrams, candidate metric bars, recommendation timelines)
- **Collapsible Thinking Blocks**: Anthropic thinking_delta stream rendered in collapsible panels
- **Auth Page Theme Toggle**: Language and theme switching available on the login page
- **Theming**: Light/dark mode + 4 color schemes (CRT Green, Cyberpunk, Amber, Classic)
- **Analytics**: PostHog integration for product metrics

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Configuration

### LLM Provider

Click `[CFG]` in the top bar to configure:
- **Provider**: OpenAI or Anthropic
- **API Base URL**: Supports OpenAI-compatible endpoints (DeepSeek, Moonshot, etc.)
- **API Key**: Required for real LLM analysis; falls back to mock data if not configured
- **Model**: Configurable model selection
- **Remember Key**: Optional AES-GCM encrypted persistence across sessions

### Analytics (Optional)

Create `.env.local`:

```bash
VITE_POSTHOG_KEY=phc_xxx
VITE_POSTHOG_HOST=https://app.posthog.com
```

## Architecture

```
React SPA (Vite + TypeScript)
├── Pipeline Engine (4-stage orchestration)
│   ├── Retrieval — multi-source literature search
│   ├── Mapping — complexity assessment & architecture routing
│   ├── Comparison — candidate path scoring
│   └── Convergence — recommendation & action plan
├── LLM Client (SSE streaming, multi-provider)
├── IndexedDB Storage (sessions, iterations)
├── Key Vault (AES-GCM encryption, PBKDF2 derivation)
├── Auth Module (client-side, extensible)
├── Subscription (Free/Pro paywall)
├── i18n (context-based, IP auto-detection)
├── Markdown Renderer (react-markdown + remark-gfm)
└── Analytics (PostHog events)
```

See [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md) for the full production architecture design.

## Project Structure

```
src/
├── components/    # UI components (AuthGate, BootScreen, Paywall, NoLLMDialog, etc.)
├── hooks/         # Custom React hooks (useAuth, useSettings, useHistory, useIteration, useToast)
├── i18n/          # Internationalization (translations, detection, context)
├── lib/           # Utilities (db.ts IndexedDB, keyVault.ts AES-GCM)
├── engine.ts      # Pipeline orchestration engine
├── llm.ts         # LLM client (OpenAI/Anthropic SSE)
├── analytics.ts   # Event tracking
├── blueprint.ts   # Product blueprint data
├── types.ts       # TypeScript type definitions
└── App.tsx        # Main application
```

## Tech Stack

- **Framework**: React 19 + TypeScript + Vite 8
- **State**: @tanstack/react-query
- **Storage**: IndexedDB (via custom wrapper)
- **Crypto**: Web Crypto API (AES-GCM, PBKDF2, SHA-256)
- **Analytics**: posthog-js
- **Fonts**: Press Start 2P (pixel), VT323 (terminal), Fira Code
- **Markdown**: react-markdown + remark-gfm

## License

MIT
