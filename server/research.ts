import { createDefaultInput } from '../src/engine'
import { runResearch } from '../src/headless'
import { searchOpenAlexEvidence } from '../src/evidence/openalex'
import { checkCitations, openAlexResolver } from '../src/citations'
import type { LLMConfig } from '../src/llm'
import type { ApiProvider, EvidenceItem } from '../src/types'

export interface Deps {
  fetch?: typeof fetch
  /** Optional LLM for the four stages; defaults to env (LLM_API_KEY etc.), else the deterministic engine. */
  llm?: LLMConfig | null
}

export function llmFromEnv(env = process.env): LLMConfig | null {
  if (!env.LLM_API_KEY && env.LLM_PROVIDER !== 'free') return null
  return {
    provider: (env.LLM_PROVIDER ?? 'openai') as ApiProvider,
    apiKey: env.LLM_API_KEY ?? '',
    baseUrl: env.LLM_BASE_URL ?? (env.LLM_PROVIDER === 'free' ? '' : 'https://api.openai.com/v1'),
    model: env.LLM_MODEL ?? (env.LLM_PROVIDER === 'free' ? '@cf/zai-org/glm-4.7-flash' : 'gpt-4o-mini'),
  }
}

export interface ProposeArgs {
  interest: string
  domain?: string
  seed?: string
  evidence?: 'openalex' | 'demo'
  extraEvidence?: EvidenceItem[]
}

/** Run the pipeline and return a stable, agent-facing result (schemaVersion 1). */
export async function propose(args: ProposeArgs, deps: Deps = {}) {
  const f = deps.fetch ?? fetch
  const input = { ...createDefaultInput('en'), researchInterest: args.interest, problemDomain: args.domain ?? '', seedIdea: args.seed ?? '' }
  const mode = args.evidence ?? 'openalex'
  const evidenceProvider =
    mode === 'openalex'
      ? async () => {
          const found = await searchOpenAlexEvidence(input, f)
          const extra = (args.extraEvidence ?? []).filter((e) => !found.some((x) => x.url === e.url))
          return [...found, ...extra].map((e, i) => ({ ...e, id: `E${i + 1}` }))
        }
      : undefined
  const llm = deps.llm === undefined ? llmFromEnv() : deps.llm
  const r = await runResearch(input, { llm, evidence: evidenceProvider })
  const citations = await checkCitations(r.evidence, openAlexResolver(f))
  const status = new Map(citations.items.map((i) => [i.id, i.status]))
  return {
    schemaVersion: 1 as const,
    interest: args.interest,
    evidenceMode: mode,
    stages: llm ? 'llm' : 'deterministic',
    recommended: r.recommendation.selectedPathId,
    nextSevenDays: r.recommendation.nextSevenDays,
    directions: r.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      hypothesis: c.hypothesis,
      method: c.method,
      score: c.score,
      confidence: c.confidence,
      novelty: c.novelty,
      feasibility: c.feasibility,
      impact: c.impact,
      risk: c.risk,
      firstExperiment: c.firstExperiment,
      stopCondition: c.stopCondition,
      evidenceIds: c.evidenceIds,
    })),
    evidence: r.evidence.map((e) => ({ id: e.id, title: e.title, url: e.url, year: e.year, tier: e.tier, citation: status.get(e.id) ?? 'unverified' })),
  }
}
