# Cloudflare public demo

The login-free preview is at https://research-thinking.ledring.workers.dev. It runs on Workers Static Assets, Workers AI and D1. No routes or custom domains are configured in `wrangler.jsonc`; the custom domain is not attached yet. The web app no longer uses the legacy `supabase/` folder, which remains for reference until retirement.

## Endpoints

Non-API paths use the `ASSETS` binding with single-page application fallback. API POST bodies must be JSON objects with `Content-Type: application/json`. No client-supplied upstream URL is accepted.

- `GET /api/status`: returns the allowed `models` and `quota` (UTC day, global/IP limits, used and remaining neurons, `exhausted`, `resetsAt`); no inference charge.
- `POST /api/llm`: accepts `messages` (1–12 messages, roles `system`, `user` or `assistant`, at most 24,000 characters each), optional `model`, `json`, `max_tokens` and `temperature`. Body limit: 48 KiB. The default model is `@cf/zai-org/glm-4.7-flash` (GLM-4.7 Flash); `@cf/google/gemma-4-26b-a4b-it` (Gemma 4 26B) is also allowed. `max_tokens` defaults to 3,072 and is clamped to 64–3,072; temperature defaults to 0.6 and is clamped to 0–1.2. Responses are normalized content-only SSE (`choices[0].delta.content`), followed by `usage.neurons` and `[DONE]`; reasoning and other upstream fields are stripped.
- `POST /api/evidence`: accepts required nonblank `researchInterest`, optional `problemDomain` and `seedIdea` (each at most 300 characters), and integer `limit` (1–10, default 8). Body limit: 4 KiB. Returns `evidence`, `query`, `source` (`openalex` or `crossref`) and `cached`.

The browser requests JSON mode with `json: true`, mapped to Workers AI `response_format: { type: 'json_object' }`. If that inference call throws, the Worker retries once without the JSON-mode parameter. GLM thinking is disabled. Stage output still goes through the application's `parseStage` validation.

API `OPTIONS` returns 204 without CORS headers. Unknown API paths return 404, wrong methods 405, invalid requests 400, oversized bodies 413 and unsupported media types 415. Inference setup failure returns 502 `upstream_error` and releases the reservation.

## Evidence

OpenAlex is the primary evidence source, with Crossref REST API fallback on errors or empty results. Crossref requires no key and uses `OPENALEX_MAILTO` for its polite pool (default `felix@ledring.dev`). An optional OpenAlex API key can be stored as a Worker secret; it is never returned or logged. Keyless OpenAlex budgets are shared across Worker egress IPs and can be exhausted.

Evidence is cached by normalized query and limit for 24 hours. The Workers Cache API works on `*.workers.dev` and custom domains; caching is per-datacenter and best-effort. If both sources fail or return no results, the response is 503 `evidence_rate_limited` when the primary error was OpenAlex 429, otherwise 502 `evidence_unavailable`.

## Quotas and storage

The configured daily caps are **3,000 neurons globally** (`GLOBAL_DAILY_NEURONS`) and **600 per IP** (`IP_DAILY_NEURONS`), resetting at midnight UTC. LLM requests are capped at **12/minute/IP** (`IP_REQUESTS_PER_MINUTE`), and evidence requests at **20/minute/IP** (`EVIDENCE_IP_REQUESTS_PER_MINUTE`), in UTC calendar-minute buckets. Evidence requests, including cache hits, count toward their rate cap but consume no Workers AI neurons. Status requests consume no inference quota.

A measured full run used about 115 neurons; usage varies. The first-five-interest eval on 2026-10-17 used 357 neurons total (~71/run) with GLM-4.7 Flash; see [`../evals/results-worker.json`](../evals/results-worker.json).

Conservative reservations use model token prices and an input estimate of one token per three characters. Both daily budgets are checked and reserved atomically before inference. A request can be rejected when its reservation would exceed a cap even if the reported remaining quota is positive. Successful streams reconcile against reported neuron usage (or estimated input/output usage if absent); interrupted upstream streams retain their reservation. Quota failures return HTTP 429 `quota_exhausted` with `scope` (`global` or `ip`) and `resetsAt`. Rate failures return HTTP 429 `rate_limited` with `retryAfter` and a `Retry-After` header. These caps protect a shared public demo, so free access can run out.

D1 stores `usage(bucket TEXT PRIMARY KEY, neurons REAL NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)`, created by `worker/migrations/0001_usage.sql`. Global daily (`g:`), hashed-IP daily (`ip:`), LLM minute (`m:`) and evidence minute (`e:`) buckets share the table. IP hashes use SHA-256 of IP plus UTC day, truncated to 16 hex characters; raw IPs are never stored in this table. Approximately 2% of API requests schedule cleanup of rows older than three days. `wrangler.jsonc` enables Worker observability.

## Privacy and headers

BYO keys under Settings → Advanced travel browser → provider directly; they never go to this Worker. Free mode persists only a same-origin base URL. There are no third-party requests on page load, fonts are self-hosted, and analytics is off by default. Optional PostHog requires both `VITE_POSTHOG_*` configuration and explicit user opt-in (`localStorage analytics_opt_in=1`).

`public/_headers` applies `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a Permissions Policy disabling camera, microphone and geolocation. The Content Security Policy restricts scripts and fonts to self, permits inline styles, allows self/data images and self/HTTPS connections, and sets `frame-ancestors 'none'`, `base-uri 'self'` and `form-action 'self'`.

Static responses use `Cache-Control: public, max-age=0, must-revalidate, no-transform`: `no-transform` stops zone-injected Cloudflare Web Analytics on the page. `/assets/*` overrides caching to `public, max-age=31536000, immutable`. Worker API responses separately set `nosniff`, the same referrer policy and `Cache-Control: no-store`; SSE uses `no-store, no-transform`. API responses have no cross-origin access headers.

## Local development and deployment

`pnpm dev` starts the UI without any environment variables. Live evidence and the free model require the Worker. After building, use `pnpm build && npx wrangler@3 dev`; for a fresh local D1 store, first apply the migration with `npx wrangler@3 d1 migrations apply research-thinking --local`. Local inference availability depends on the Workers AI binding.

Deploy using Node 20 and the existing pnpm dependencies:

```sh
npx wrangler@3 d1 migrations apply research-thinking --remote
pnpm build && npx wrangler@3 deploy
# Optional: give OpenAlex its own API budget
npx wrangler@3 secret put OPENALEX_API_KEY
```

The D1 database is already identified in `wrangler.jsonc`. Deploying is separate from changing source. Confirm the deployed backend with a small real eval (it consumes quota):

```sh
WORKER_URL=https://research-thinking.ledring.workers.dev pnpm eval --mode worker --limit 5 --out evals/results-worker.json
```

Worker eval summaries include consumed neurons when reported. Publish only actual dated run results.

## Testing the quota states

Temporarily deploy with a smaller global budget to exercise quota exhaustion, or a one-request minute cap to exercise rate limiting:

```sh
npx wrangler@3 deploy --var GLOBAL_DAILY_NEURONS:100
# Or, independently:
npx wrangler@3 deploy --var IP_REQUESTS_PER_MINUTE:1
```

Try a free-model run and inspect the 429 response and UI state. Existing D1 usage still counts, and reservation checks can reject a request before the cap is fully consumed. For the minute cap, send two LLM requests in the same UTC minute. Then redeploy without vars (`pnpm build && npx wrangler@3 deploy`) to restore the limits from `wrangler.jsonc`; redeployment does not clear usage records.
