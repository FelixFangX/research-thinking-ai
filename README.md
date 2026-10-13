<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/header-dark.svg">
  <img alt="research-thinking-ai — Vague research interest in, evidence-backed directions out." src="./docs/assets/header-light.svg" width="100%">
</picture>

**An agent pipeline that turns a vague research interest into ranked, evidence-tiered research directions and a 7-day action plan.** [Live demo](https://research-thinking-ai.vercel.app) · English | [中文文档](./README.zh-CN.md)

## Quickstart

```bash
git clone https://github.com/FelixFangX/research-thinking-ai.git
cd research-thinking-ai && pnpm install
cp .env.example .env.local   # optional: Supabase + PostHog; leave empty to run locally
pnpm dev                     # http://localhost:5173
```

Without an LLM key the app offers a **mock preview**. Add a key under `[CFG]` for real runs.

## Usage

1. Describe the interest, domain, seed idea and constraints.
2. Pick a participation mode: **HIGH** (confirm each stage) or **LOW** (auto, override afterwards).
3. Follow the four stages as they stream: Retrieval → Landscape → Path comparison → Convergence.
4. Export the report or keep iterating. History stays in IndexedDB.

LLM: OpenAI or Anthropic, or any OpenAI-compatible base URL (DeepSeek, Moonshot, local). With "Remember key" on, the key is AES-GCM encrypted in the browser.

## How it works

```text
TopicInput ─▶ assessComplexity ─▶ decideArchitecture ─▶ 4-stage pipeline ─▶ AgentRunResult
                 (score 12–95)      single_agent │ workflow_orchestrator │
                                    multi_agent │ rag_workflow │ kg_orchestrated
                                                         │
                                                  streamLLM (SSE) ── OpenAI / Anthropic / mock
```

| Seam | Where | What's tested |
|---|---|---|
| LLM output → data | `parseJSON` in `src/llm.ts` | plain, fenced, embedded JSON; rejects garbage and oversized input |
| Routing | `assessComplexity` + `decideArchitecture` in `src/engine.ts` | topic → architecture mode, score bounds, rationale |

Evidence is tiered T1/T2/T3 and conflicts are flagged before convergence. More detail: [`docs/SYSTEM_ARCHITECTURE.md`](./docs/SYSTEM_ARCHITECTURE.md).

## Testing

```bash
pnpm test      # vitest
pnpm build     # tsc -b + vite build
```

## License

[MIT](./LICENSE)
