# AGENTS.md

- Install/test: `pnpm install && pnpm lint && pnpm test && pnpm build` (CI: Node 22, pnpm 10).
- Seams: `runResearch` (src/headless.ts), `parseStage` + stage schemas (src/schemas.ts), `checkCitations` (src/citations.ts), `searchOpenAlexEvidence` (src/evidence/openalex.ts), `assessComplexity`/`decideArchitecture` (src/engine.ts). Fake fetch and the LLM in tests.
- Eval: `pnpm eval --mode demo|openalex|edge|llm --out evals/results-<mode>.json`. Only publish numbers from a real run, with the date.
- LLM output must go through `parseStage`; don't add new `parseJSON<T>` casts.
- Edge functions in `supabase/functions/` are deployed separately (`supabase functions deploy`); changing the source doesn't change production. After deploying, run `pnpm eval --mode edge` to confirm. The query lives in `supabase/functions/openalex-search/query.ts` (tested).
- Keys: never commit real keys. The UI stores user keys encrypted in the browser only.
- Agent surfaces: `server/mcp.ts` (`createServer({ fetch, llm })`), `server/research.ts` (`propose`), `server/watch.ts`. All read-only; `pnpm typecheck:server` covers them.
- The weekly watch only writes files (`watch/out`, `watch/state`, both gitignored). Don't give it write permissions.
