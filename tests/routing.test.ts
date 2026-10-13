import { describe, expect, it } from 'vitest'
import { assessComplexity, createDefaultInput, decideArchitecture } from '../src/engine'
import type { TopicInput } from '../src/types'

const input = (over: Partial<TopicInput>): TopicInput => ({ ...createDefaultInput('en'), constraints: '', ...over })
const route = (over: Partial<TopicInput>) => {
  const i = input(over)
  const c = assessComplexity(i, 'en')
  return { complexity: c, mode: decideArchitecture(i, c, 'en').mode }
}

describe('complexity-aware routing', () => {
  it('a small, focused topic gets a single agent', () => {
    const r = route({ researchInterest: 'sorting', problemDomain: 'algorithms', seedIdea: 'compare', complexityHint: 1 })
    expect(r.mode).toBe('single_agent')
    expect(r.complexity.score).toBeGreaterThanOrEqual(12)
  })
  it('a knowledge-graph topic with enough complexity is graph-orchestrated', () => {
    const r = route({ researchInterest: 'citation network analysis with a knowledge graph', complexityHint: 4 })
    expect(r.mode).toBe('kg_orchestrated')
  })
  it('a high-stakes domain routes to RAG with citation guard', () => {
    const r = route({ researchInterest: 'clinical decision support', problemDomain: 'hospital', seedIdea: 'triage', complexityHint: 3 })
    expect(r.mode).toBe('rag_workflow')
  })
  it('complexity score is always clamped to 12..95', () => {
    for (const hint of [0, 1, 5, 10]) {
      const s = assessComplexity(input({ complexityHint: hint, constraints: 'a, b, c, d, e' }), 'en').score
      expect(s).toBeGreaterThanOrEqual(12)
      expect(s).toBeLessThanOrEqual(95)
    }
  })
  it('explains itself: rationale is never empty', () => {
    expect(assessComplexity(input({ complexityHint: 1 }), 'en').rationale.length).toBeGreaterThan(0)
  })
})
