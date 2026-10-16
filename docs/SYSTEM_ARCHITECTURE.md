# System Architecture

## 1. Overall architecture

```text
Web App (React SPA)
    -> Pipeline Engine (routing by complexity)
        -> Retriever Stage (LLM-powered literature search)
        -> Mapping Stage (complexity assessment & architecture routing)
        -> Comparison Stage (candidate path scoring)
        -> Convergence Stage (recommendation & action plan)
    -> IndexedDB (sessions, iterations)
    -> Key Vault (AES-GCM encrypted API key storage)
    -> PostHog Analytics / Audit Events
```

Production scaling path:
```text
Web App (React/Next)
    -> BFF Gateway
        -> Orchestrator (routing by complexity)
            -> Retriever Service
            -> Evidence Graph Service
            -> Recommendation Service
            -> Policy Engine (hard gates)
        -> Session Store / Analytics / Audit Log
```

## 2. Architecture routing strategy

Input dimensions:
- Problem complexity
- Risk level (medical / finance / legal, etc.)
- Whether the problem depends heavily on cross-paper relationship graphs

Routing outcomes:
- `single_agent`
- `workflow_orchestrator`
- `multi_agent`
- `rag_workflow`
- `kg_orchestrated`

## 3. Key module responsibilities

### Pipeline Engine (`engine.ts`)
- Splits the work into stages: retrieve → map → compare → converge
- Manages streaming LLM calls and the Mock fallback
- Triggers human confirmation gates (HIGH mode)
- Makes complexity-aware routing decisions

### LLM Client (`llm.ts`)
- SSE streaming (OpenAI and Anthropic protocols)
- Input sanitization (`sanitizeInput`)
- Robust JSON parsing (three fallback levels + size guard)

### IndexedDB Storage (`lib/db.ts`)
- `sessions` store: full run results (AgentRunResult + TopicInput)
- `iterations` store: iteration plans, logs, status
- Automatically migrates legacy data from localStorage

### Key Vault (`lib/keyVault.ts`)
- sessionStorage by default (cleared when the tab closes)
- Optional encrypted persistence: PBKDF2 key derivation → AES-GCM encryption → localStorage
- Clears all key data on sign-out

### Auth Module (`hooks/useAuth.ts`)
- Passwords hashed with salted SHA-256 (Web Crypto API)
- Session management in localStorage
- Can be extended to integrate Clerk/Auth0

### Subscription (`components/Paywall.tsx`)
- Two tiers: Free / Pro
- Export features gated by plan
- Persisted in localStorage (can be extended to server-side checks)

## 4. Data model and storage

Current implementation (frontend only):
- Session records: IndexedDB `sessions` store
- Iteration plans: IndexedDB `iterations` store
- User settings: localStorage `copilot_settings`
- API keys: sessionStorage / encrypted localStorage
- User auth: localStorage `copilot_users` + `copilot_session`

Production scaling:
- Session storage: `topic_sessions` (PostgreSQL)
- Evidence storage: `evidence_items`
- Score storage: `candidate_paths`
- Audit log: `decision_events`
- Vector search: `pgvector`
- Graph structure: `neo4j` (or a Postgres graph projection)

## 5. Reliability and observability

- Product analytics: PostHog (page views, run start/complete/fail, mode selection, path adoption, etc.)
- Per-stage pipeline progress feedback
- Failure fallback: automatically falls back to Mock data when the LLM is unavailable
- Guard dialog when no API key is configured (configure / Mock preview / cancel)

Production scaling:
- Task-level tracing: OpenTelemetry
- Failure retries: idempotent per-stage retries
- Alerting policy

## 6. Security and privacy

- API keys: stored with AES-GCM encryption (PBKDF2-derived, 100k iterations)
- Passwords: salted SHA-256 hashes (Web Crypto API)
- LLM input: control characters stripped
- JSON parsing: 500KB size limit
- Settings validation: `validateSettings` guards against injection
- Structured summaries are the default input; uploading full source text is never required
- Clears all keys and session data on sign-out

## 7. End-to-end internationalization

- **Engine functions**: `createDefaultInput`, `assessComplexity`, `decideArchitecture`, `buildEvidence`, `buildCandidates`, `buildRecommendation`, `buildSourcePolicy`, `buildEvaluationPlan`, etc. all take a `locale` parameter so the data layer matches the UI language.
- **LLM user prompt**: the user-side prompt is a full bilingual template (Chinese / English); field labels, examples and requirements switch with `locale`.
- **LLM system prompt**: the system prompt enforces the response language, e.g. `IMPORTANT: You MUST respond entirely in English` or `IMPORTANT: You MUST respond entirely in Chinese`.
- **Mock data**: Mock streaming output and static placeholder content are resolved by `locale`, matching the behavior of the real LLM path.
- **Exported reports**: `ShareExport` and other export paths switch table headers, labels and copy based on `locale`.
- **Regexes and keywords**: the regexes in `engine.ts` used for domain detection, routing, etc. cover both Chinese and English keywords (e.g. `医疗|medical`, where 医疗 means "medical"), so routing is not skewed by matching only one language.
