# Cloudflare public demo

The no-login demo runs on Workers Static Assets, Workers AI and D1. No routes or custom domains are configured; use the workers.dev address.

- `GET /api/status`: allowed models and current daily quota; no inference charge.
- `POST /api/llm`: validated messages, allowlisted model and normalized content-only SSE, ending with neuron usage and `[DONE]`. No upstream URL is accepted.
- `POST /api/evidence`: OpenAlex evidence, cached by normalized query and limit for 24 hours. Optional `OPENALEX_API_KEY` is a Worker secret; it is never returned or logged.

Workers AI has a shared free allocation of 10,000 neurons/day. This Worker caps reservations at 3,000 neurons/day globally and 600/day per IP, resetting at midnight UTC. LLM requests are capped at 12/minute/IP and evidence requests at 20/minute/IP. Output is capped at 3,072 tokens. Conservative reservations use model token prices and are reconciled against streamed neuron usage; interrupted upstream streams retain their reservation. Quota and rate failures return HTTP 429. These caps protect a shared public demo, so free access can run out.

D1 stores `usage(bucket, neurons, requests, updated_at)`. Global daily, hashed-IP daily and hashed-IP minute buckets share the table. IP hashes use SHA-256 of IP plus UTC day, truncated to 16 hex characters; raw IPs are never stored. Approximately 2% of API requests schedule cleanup of rows older than three days.

Deploy using Node 20 and the existing pnpm dependencies:

```sh
npx wrangler@3 d1 migrations apply research-thinking --remote
pnpm build && npx wrangler@3 deploy
```

The D1 database is already identified in `wrangler.jsonc`. Deploying is separate from changing source. Confirm the deployed backend with a small real eval (it consumes quota):

```sh
WORKER_URL=https://research-thinking.<sub>.workers.dev pnpm eval --mode worker --limit 1 --out evals/results-worker.json
```

Worker eval summaries include consumed neurons when reported. Publish only actual dated run results. BYO keys continue to travel browser → provider directly; they never go to this Worker. Free mode persists only a same-origin base URL. API responses have no cross-origin access headers.
