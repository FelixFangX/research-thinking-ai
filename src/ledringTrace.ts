import { z } from 'zod'
import type { SessionRecord } from './types'

// Vendored from FelixFangX/ledring packages/trace/src/schema.ts (ledring.trace.v1).
export const LedringStepSchema = z.object({
  id: z.string(), parentId: z.string().optional(),
  kind: z.enum(['plan', 'llm', 'tool', 'agent', 'handoff', 'human']),
  name: z.string(), signature: z.string(), input: z.unknown().optional(), output: z.unknown().optional(),
  isError: z.boolean().optional(),
  decision: z.object({ verdict: z.enum(['allow', 'deny']), by: z.enum(['human', 'policy', 'unknown']), reason: z.string().optional() }).optional(),
  startedAt: z.string().optional(), endedAt: z.string().optional(),
})
export const LedringTraceSchema = z.object({
  schema: z.literal('ledring.trace.v1'), id: z.string(), source: z.string(),
  instruction: z.string().optional(), cwd: z.string().optional(),
  agent: z.object({ name: z.string().optional(), model: z.string().optional() }).optional(),
  outcome: z.enum(['success', 'failure', 'unknown']).optional(),
  startedAt: z.string().optional(), endedAt: z.string().optional(), steps: z.array(LedringStepSchema),
})
export type StageEvent = { id: 'retrieve' | 'map' | 'compare' | 'converge'; startedAt?: string; endedAt?: string; isError?: boolean; llmUsed?: boolean; confirmed?: boolean }

// Validate only the export projection; unknown fields (including settings and credentials) are discarded.
export const TraceRecordSchema = z.object({
  id: z.string().min(1).max(200), createdAt: z.string().optional(), startedAt: z.string().optional(), endedAt: z.string().optional(),
  interest: z.string(), mode: z.enum(['high', 'low']),
  evidenceOrigin: z.enum(['openalex', 'crossref', 'model', 'template']).optional(),
  model: z.string().optional(), llmUsed: z.boolean().optional(), stageEvents: z.array(z.object({
    id: z.enum(['retrieve', 'map', 'compare', 'converge']), startedAt: z.string().optional(), endedAt: z.string().optional(),
    isError: z.boolean().optional(), llmUsed: z.boolean().optional(), confirmed: z.boolean().optional(),
  })).optional(),
  citationChecks: z.object({ items: z.array(z.object({ id: z.string(), status: z.enum(['verified', 'title-mismatch', 'not-found', 'broken', 'search-link', 'unverified']) })) }).optional(),
  fullInput: z.object({ researchInterest: z.string(), problemDomain: z.string() }),
  fullResult: z.object({
    complexity: z.object({ level: z.enum(['low', 'medium', 'high', 'frontier']), score: z.number() }),
    architecture: z.object({ mode: z.enum(['single_agent', 'workflow_orchestrator', 'multi_agent', 'rag_workflow', 'kg_orchestrated']) }),
    evidence: z.array(z.object({ id: z.string(), title: z.string() })),
    candidates: z.array(z.object({ id: z.string(), name: z.string(), confidence: z.number() })),
    recommendation: z.object({ selectedPathId: z.string().min(1) }),
  }),
})

export function toLedringTrace(record: SessionRecord | z.input<typeof TraceRecordSchema>) {
  const r = TraceRecordSchema.parse(record)
  const result = r.fullResult
  const steps: z.infer<typeof LedringStepSchema>[] = [
    { id: 'assess_complexity', kind: 'plan', name: 'assess_complexity', signature: 'assess_complexity', output: result.complexity },
    { id: 'decide_architecture', kind: 'plan', name: 'decide_architecture', signature: 'decide_architecture', output: result.architecture },
  ]
  for (const id of ['retrieve', 'map', 'compare', 'converge'] as const) {
    const event = r.stageEvents?.find(e => e.id === id)
    const llmUsed = event?.llmUsed ?? (id === 'retrieve' && (r.evidenceOrigin === 'openalex' || r.evidenceOrigin === 'crossref') ? false : r.llmUsed ?? (r.evidenceOrigin === 'model' ? true : r.evidenceOrigin === 'template' ? false : undefined))
    steps.push({ id, name: id, signature: id, kind: llmUsed ? 'llm' : 'tool',
      input: { evidenceOrigin: r.evidenceOrigin ?? 'unknown', llmUsed: llmUsed ?? 'unknown' },
      output: id === 'retrieve' ? result.evidence : id === 'compare' ? result.candidates.map(c => ({ id: c.id, title: c.name })) : undefined,
      startedAt: event?.startedAt, endedAt: event?.endedAt, isError: event?.isError })
    if (id === 'retrieve') {
      if (r.evidenceOrigin === 'openalex' || r.evidenceOrigin === 'crossref') steps.push({ id: 'evidence_lookup', parentId: id, kind: 'tool', name: `${r.evidenceOrigin}.search`, signature: `${r.evidenceOrigin}.search`, output: result.evidence })
      result.evidence.forEach((e, i) => {
        const status = r.citationChecks?.items.find(c => c.id === e.id)?.status
        if (!status) return
        steps.push({ id: `citation_${i}`, parentId: id, kind: 'tool', name: 'check_citation', signature: 'check_citation', input: e, output: { status } })
      })
    }
    if (r.mode === 'high' && event?.confirmed) steps.push({ id: `${id}_confirmation`, parentId: id, kind: 'human', name: 'confirm_stage', signature: 'confirm_stage', decision: { verdict: 'allow', by: 'human' } })
  }
  const pathId = result.recommendation.selectedPathId
  steps.push({ id: 'choose_path', kind: 'plan', name: 'choose_path', signature: `choose_path(${pathId})`, output: { pathId, confidence: result.candidates.find(c => c.id === pathId)?.confidence } })
  return LedringTraceSchema.parse({ schema: 'ledring.trace.v1', id: r.id, source: 'research-thinking-ai',
    instruction: [r.fullInput.researchInterest, r.fullInput.problemDomain].filter(Boolean).join(' — '),
    agent: { name: 'research-thinking-ai', ...(r.model ? { model: r.model } : {}) }, outcome: 'success',
    startedAt: r.startedAt, endedAt: r.endedAt ?? r.createdAt, steps })
}
export function traceFilename(id: string) { return `research-trace-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.ledring.json` }
