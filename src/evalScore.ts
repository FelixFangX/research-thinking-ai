import type { AgentRunResult } from './types'
import type { CitationReport } from './citations'
import { CompareStage, ConvergeStage, MapStage, RetrieveStage } from './schemas'

export interface RunScore {
  interest: string
  schemaValid: boolean
  structureOk: boolean
  interestCoverage: number
  citationVerifiedRate: number
  citationStatuses?: Record<string, number>
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'using', 'based', 'via', 'of', 'in', 'on'])
const terms = (t: string) => t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w))

export function scoreRun(interest: string, r: AgentRunResult, citations: CitationReport): RunScore {
  const schemaValid =
    RetrieveStage.safeParse({ evidence: r.evidence }).success &&
    MapStage.safeParse({ complexity: r.complexity, architecture: r.architecture }).success &&
    CompareStage.safeParse({ candidates: r.candidates }).success &&
    ConvergeStage.safeParse({ recommendation: r.recommendation }).success
  const ids = new Set(r.evidence.map((e) => e.id))
  const structureOk =
    r.candidates.length >= 3 &&
    r.candidates.some((c) => c.id === r.recommendation.selectedPathId) &&
    r.candidates.every((c) => c.evidenceIds.every((id) => ids.has(id)))
  const text = [...r.evidence.map((e) => e.title), ...r.candidates.map((c) => `${c.name} ${c.hypothesis}`)].join(' ').toLowerCase()
  const want = [...new Set(terms(interest))]
  const interestCoverage = want.length ? Math.round((want.filter((w) => text.includes(w)).length / want.length) * 1000) / 1000 : 0
  const citationStatuses: Record<string, number> = {}
  for (const i of citations.items) citationStatuses[i.status] = (citationStatuses[i.status] ?? 0) + 1
  return { interest, schemaValid, structureOk, interestCoverage, citationVerifiedRate: citations.verifiedRate, citationStatuses }
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : 0)

export function summarizeEval(scores: RunScore[]) {
  return {
    count: scores.length,
    schemaValidRate: mean(scores.map((s) => (s.schemaValid ? 1 : 0))),
    structureOkRate: mean(scores.map((s) => (s.structureOk ? 1 : 0))),
    meanInterestCoverage: mean(scores.map((s) => s.interestCoverage)),
    meanCitationVerifiedRate: mean(scores.map((s) => s.citationVerifiedRate)),
  }
}
