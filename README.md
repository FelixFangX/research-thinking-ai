<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/header-dark.svg">
  <img alt="research-thinking-ai — Vague research interest in, evidence-backed directions out." src="./docs/assets/header-light.svg" width="100%">
</picture>

**An agent pipeline that turns a vague research interest into ranked, evidence-tiered research directions and a 7-day action plan.** [Live demo](https://research-thinking-ai.vercel.app) · English | [中文文档](./README.zh-CN.md)

[![Live demo: Research Topic Agent](./docs/assets/live-demo.png)](https://research-thinking-ai.vercel.app)

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
| Stage schemas | `parseStage` in `src/schemas.ts` (zod) | coercion, errors name the stage and field |
| Headless run | `runResearch` in `src/headless.ts` | full pipeline without UI, injectable evidence/LLM |
| Citation check | `checkCitations` in `src/citations.ts` | verified / title-mismatch / not-found / broken / search-link |

Evidence is tiered T1/T2/T3 and conflicts are flagged before convergence. More detail: [`docs/SYSTEM_ARCHITECTURE.md`](./docs/SYSTEM_ARCHITECTURE.md).

## For agents (MCP) and weekly watch

```bash
pnpm mcp      # stdio MCP server: propose_directions(interest, domain?, evidence?) and expand(direction, interest)
pnpm watch --json                          # "what changed" notes in watch/out/ (OpenAlex only)
pnpm watch --digest-dir <daily/> --json    # also use a local digest checkout
```

MCP client config: `{"command": "pnpm", "args": ["--dir", "/abs/path/research-thinking-ai", "-s", "mcp"]}`. Both tools are read-only. Evidence comes from OpenAlex, and every citation carries its check result (`verified`, `not-found`, `broken`, `search-link`). Without `LLM_API_KEY` in the server's env the four stages run the deterministic engine, so directions are generic templates around real evidence. Set `LLM_API_KEY` (plus `LLM_BASE_URL`/`LLM_MODEL`) for model-written directions.

The weekly watch (`.github/workflows/weekly-watch.yml`, Mondays) runs each topic in [`watch/topics.json`](./watch/topics.json) using OpenAlex, plus the last 7 days of `digest.json` when a digest source is available. The digest repo is private, so CI runs OpenAlex-only unless the `DIGEST_URL` repo variable points at a public copy. Each note and `status.json` record the digest as `off`, `unavailable`, `empty` or `ok`; a missing digest never fails the run. It re-ranks directions and publishes a "what changed" note as the job summary and an artifact. It never commits, comments or sends anything.

## Eval

20 sample interests ([`evals/interests.json`](./evals/interests.json)) run headless through the pipeline (`pnpm eval --mode <mode> --out ...`). Each run is scored on: all four stages match their schema, structure (≥3 paths, the selected path exists, evidence ids resolve), interest coverage (share of the interest's terms that appear in the evidence and paths), **on-topic evidence** (share of evidence titles that mention ≥2 of the interest's key terms), and **citations**: every evidence link is looked up in OpenAlex and counts as verified only if it resolves to a real work whose title matches.

Measured on 2026-10-14:

| Mode | Schema valid | Structure OK | Interest coverage | On-topic evidence | Citations verified |
|---|---|---|---|---|---|
| `demo` (no key, templated) | 20/20 | 20/20 | 1.00* | 0.34 | **0%** (100 search-page links, 20 non-paper links) |
| `openalex` (real evidence, deterministic stages) | 20/20 | 20/20 | 0.95 | 0.88 | **100%** (160/160) |
| `edge` (deployed `openalex-search` function, before #9 is deployed) | 20/20 | 20/20 | 0.26 | **0.06** | 100% |
| `llm` | not run yet (needs a key: `LLM_API_KEY=... pnpm eval --mode llm`) | | | | |

\* The demo template echoes the interest, so its coverage is trivially 1.0. Raw results: [`evals/`](./evals). Demo-mode evidence is illustrative only. It isn't a citation, and the eval says so. `edge` mode checks production: `SUPABASE_URL=... SUPABASE_ANON_KEY=... pnpm eval --mode edge`.

## Testing

```bash
pnpm test      # vitest
pnpm build     # tsc -b + vite build
pnpm eval --mode demo --json   # offline eval; --mode openalex hits the public OpenAlex API
```

## License

[MIT](./LICENSE)
