import { z } from 'zod'
import { parseJSON } from './llm'

// One schema per LLM stage. Lenient on types (LLMs send "70" for 70), strict on required fields.
const num = z.coerce.number()
const strs = z.array(z.string()).default([])

export const EvidenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string().default(''),
  url: z.string().default(''),
  year: num.default(0),
  tier: z.enum(['T1', 'T2', 'T3']).catch('T3'),
  claim: z.string().default(''),
  relevance: num.default(0),
  credibility: num.default(0),
  conflictsWith: strs,
})

export const RetrieveStage = z.object({ evidence: z.array(EvidenceSchema).min(1) }).describe('retrieve')

export const MapStage = z
  .object({
    complexity: z.object({
      level: z.enum(['low', 'medium', 'high', 'frontier']).catch('medium'),
      score: num,
      rationale: strs,
    }),
    architecture: z.object({
      mode: z.enum(['single_agent', 'workflow_orchestrator', 'multi_agent', 'rag_workflow', 'kg_orchestrated']).catch('workflow_orchestrator'),
      reason: z.string().default(''),
      modules: strs,
    }),
  })
  .describe('map')

export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  method: z.string().default(''),
  novelty: num,
  feasibility: num,
  impact: num,
  risk: num,
  evidenceCoverage: num.default(0),
  score: num.default(0),
  confidence: num.default(0),
  firstExperiment: z.string().default(''),
  stopCondition: z.string().default(''),
  evidenceIds: strs,
})

export const CompareStage = z.object({ candidates: z.array(CandidateSchema).min(1) }).describe('compare')

export const ConvergeStage = z
  .object({
    recommendation: z.object({
      selectedPathId: z.string(),
      why: strs,
      nextSevenDays: strs,
      manualConfirmations: strs,
    }),
  })
  .describe('converge')

/** Parse raw LLM text and validate it against a stage schema. Errors name the stage and field path. */
export function parseStage<S extends z.ZodTypeAny>(schema: S, raw: string): z.infer<S> {
  const r = schema.safeParse(parseJSON<unknown>(raw))
  if (r.success) return r.data
  const issues = r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
  throw new Error(`Invalid ${schema.description ?? 'stage'} output: ${issues}`)
}
