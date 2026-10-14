import { describe, expect, it } from 'vitest'
import { runResearch } from '../src/headless'
import { createDefaultInput } from '../src/engine'
import { parseStage, CompareStage, RetrieveStage } from '../src/schemas'
import { checkCitations, classifyUrl, type WorkResolver } from '../src/citations'
import { searchOpenAlexEvidence } from '../src/evidence/openalex'
import { onTopicRate, scoreRun, summarizeEval } from '../src/evalScore'

describe('runResearch: headless pipeline', () => {
  it('runs all four stages without a browser or a key', async () => {
    const r = await runResearch({ ...createDefaultInput('en'), researchInterest: 'graph neural networks for drug discovery' })
    expect(r.candidates.length).toBeGreaterThanOrEqual(3)
    expect(r.evidence.length).toBeGreaterThan(0)
    expect(r.candidates.map((c) => c.id)).toContain(r.recommendation.selectedPathId)
  })

  it('uses an injected evidence provider', async () => {
    const r = await runResearch(createDefaultInput('en'), {
      evidence: async () => [{ id: 'E1', title: 'Real paper', source: 'OpenAlex', url: 'https://doi.org/10.1/x', year: 2024, tier: 'T1', claim: 'c', relevance: 80, credibility: 80, conflictsWith: [] }],
    })
    expect(r.evidence.map((e) => e.title)).toEqual(['Real paper'])
  })
})

describe('parseStage: stage schemas', () => {
  it('coerces numeric strings and fills optional arrays', () => {
    const raw = JSON.stringify({ candidates: [{ id: 'P1', name: 'n', hypothesis: 'h', method: 'm', novelty: '70', feasibility: 60, impact: 50, risk: 20, evidenceCoverage: 40, score: 0, confidence: 50, firstExperiment: 'f', stopCondition: 's' }] })
    const out = parseStage(CompareStage, raw)
    expect(out.candidates[0].novelty).toBe(70)
    expect(out.candidates[0].evidenceIds).toEqual([])
  })
  it('names the stage and field when output is invalid', () => {
    expect(() => parseStage(RetrieveStage, '{"evidence":[{"id":"E1"}]}')).toThrow(/retrieve.*evidence\.0\.title/)
  })
})

describe('citations', () => {
  it('classifies links', () => {
    expect(classifyUrl('https://doi.org/10.1038/nature14539')).toBe('doi')
    expect(classifyUrl('https://openalex.org/W2919115771')).toBe('openalex')
    expect(classifyUrl('https://doi.org/W2919115771')).toBe('invalid-doi')
    expect(classifyUrl('https://scholar.google.com/scholar?q=x')).toBe('search')
    expect(classifyUrl('https://arxiv.org/search/?query=x')).toBe('search')
    expect(classifyUrl('https://example.com/post')).toBe('other')
  })

  const resolver: WorkResolver = async (ref) =>
    ref === 'doi:10.1234/real' ? { title: 'Deep learning for protein folding' } : null

  it('verifies real works with matching titles and flags the rest', async () => {
    const ev = (id: string, url: string, title = 'Deep learning for protein folding') => ({ id, url, title })
    const r = await checkCitations([
      ev('E1', 'https://doi.org/10.1234/real'),
      ev('E2', 'https://doi.org/10.1234/real', 'A totally different paper about cooking'),
      ev('E3', 'https://doi.org/10.1234/missing'),
      ev('E4', 'https://doi.org/W123'),
      ev('E5', 'https://scholar.google.com/scholar?q=x'),
    ], resolver)
    expect(r.items.map((i) => i.status)).toEqual(['verified', 'title-mismatch', 'not-found', 'broken', 'search-link'])
    expect(r.verifiedRate).toBe(0.2)
  })
})

describe('searchOpenAlexEvidence', () => {
  it('maps works to evidence with resolvable URLs (DOI first, else OpenAlex)', async () => {
    const fake = async () => new Response(JSON.stringify({ results: [
      { id: 'https://openalex.org/W1', doi: 'https://doi.org/10.1/a', title: 'A', publication_year: 2024, cited_by_count: 500, primary_location: { source: { display_name: 'Nature', host_organization_name: 'Nature Portfolio' } } },
      { id: 'https://openalex.org/W2', doi: null, title: 'B', publication_year: 2025, cited_by_count: 3 },
    ] }))
    const ev = await searchOpenAlexEvidence({ researchInterest: 'x y z', problemDomain: '', seedIdea: '' }, fake as typeof fetch)
    expect(ev.map((e) => e.url)).toEqual(['https://doi.org/10.1/a', 'https://openalex.org/W2'])
    expect(ev[0].tier).toBe('T1')
  })
})

describe('eval scoring', () => {
  it('scores structure, interest coverage and citations', async () => {
    const r = await runResearch({ ...createDefaultInput('en'), researchInterest: 'federated learning privacy' })
    const s = scoreRun('federated learning privacy', r, { verifiedRate: 0.5, items: [] })
    expect(s.schemaValid).toBe(true)
    expect(s.structureOk).toBe(true)
    expect(s.interestCoverage).toBeGreaterThan(0)
    const sum = summarizeEval([s, { ...s, schemaValid: false, citationVerifiedRate: 0 }])
    expect(sum.schemaValidRate).toBe(0.5)
    expect(sum.meanCitationVerifiedRate).toBe(0.25)
  })
})

describe('evidence on-topic rate', () => {
  it('counts titles that mention at least two key terms of the interest', () => {
    const titles = [
      'Graph Neural Networks for Molecular Drug Discovery',
      'Deep Residual Learning for Image Recognition',
      'A survey of drug repurposing with graph learning',
    ]
    expect(onTopicRate('Graph neural networks for drug discovery', titles)).toBe(0.667)
  })

  it('is 0 with no evidence', () => {
    expect(onTopicRate('federated learning', [])).toBe(0)
  })
})

