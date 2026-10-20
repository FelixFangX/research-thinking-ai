import { describe, expect, it, vi } from 'vitest'
import { runResearch } from '../src/headless'
import { runTopicAgentWithProgress } from '../src/engine'
import { LedringTraceSchema, toLedringTrace, TraceRecordSchema } from '../src/ledringTrace'
import fixture from '../src/fixtures/trace-demo.json'
import type { TopicInput } from '../src/types'

const input = fixture.fullInput as TopicInput

describe('LEDRING trace export', () => {
  it('reproduces the deterministic fixture and stable signatures across runs', async () => {
    const first = await runResearch(input)
    const second = await runResearch(input)
    expect(first).toEqual(fixture.fullResult)
    const a = toLedringTrace({ ...fixture, fullResult: first })
    const b = toLedringTrace({ ...fixture, id: 'another-run', fullResult: second })
    expect(LedringTraceSchema.safeParse(a).success).toBe(true)
    expect(a.steps.map(s => s.signature)).toEqual(b.steps.map(s => s.signature))
    expect(a.steps.filter(s => s.kind === 'llm' || s.kind === 'human')).toEqual([])
    expect(a.steps.filter(s => s.name === 'check_citation')).toEqual([])
    expect(a.steps.find(s => s.id === 'retrieve')?.output).toEqual(fixture.fullResult.evidence.map(({ id, title }) => ({ id, title })))
  })

  it('exports a fake LLM run without leaking prompts, settings or keys', async () => {
    const outputs = [ { evidence: fixture.fullResult.evidence },
      { complexity: fixture.fullResult.complexity, architecture: fixture.fullResult.architecture },
      { candidates: fixture.fullResult.candidates }, { recommendation: fixture.fullResult.recommendation } ]
    const llm = vi.fn(async () => JSON.stringify(outputs.shift()))
    const result = await runTopicAgentWithProgress(input, () => {}, () => {}, 'en',
      { provider: 'openai', apiKey: 'SECRET_KEY', baseUrl: 'https://example.invalid', model: 'test-model' }, undefined, undefined,
      { pace: false, streamLLM: llm })
    const trace = toLedringTrace({ ...fixture, fullResult: result, evidenceOrigin: 'model', llmUsed: true, model: 'test-model',
      fullInput: { ...input, constraints: 'SECRET_PROMPT' }, userId: 'PRIVATE_USER', settings: { apiKey: 'SECRET_KEY' } } as unknown as Parameters<typeof toLedringTrace>[0])
    expect(llm).toHaveBeenCalledTimes(4)
    expect(LedringTraceSchema.safeParse(trace).success).toBe(true)
    expect(trace.agent?.model).toBe('test-model')
    expect(trace.steps.filter(s => s.kind === 'llm')).toHaveLength(4)
    expect(JSON.stringify(trace)).not.toMatch(/SECRET_KEY|SECRET_PROMPT|PRIVATE_USER|apiKey|nextSevenDays|hypothesis/)
  })

  it('uses recorded citation results and confirmations only, with stage parent links', () => {
    const record = TraceRecordSchema.parse(fixture)
    const trace = toLedringTrace({ ...record, mode: 'high', evidenceOrigin: 'openalex', llmUsed: true,
      stageEvents: [{ id: 'retrieve', startedAt: 'start', endedAt: 'end', confirmed: true }],
      citationChecks: { items: [{ id: record.fullResult.evidence[0].id, status: 'verified' }, { id: record.fullResult.evidence[1].id, status: 'unverified' }] } })
    expect(trace.steps.find(s => s.id === 'retrieve')).toMatchObject({ kind: 'tool', startedAt: 'start', endedAt: 'end' })
    expect(trace.steps.find(s => s.name === 'openalex.search')).toMatchObject({ parentId: 'retrieve' })
    expect(trace.steps.find(s => s.id === 'citation_0')).toMatchObject({ parentId: 'retrieve', signature: 'check_citation', output: { status: 'verified' } })
    expect(trace.steps.filter(s => s.name === 'check_citation').map(s => s.output)).toEqual([{ status: 'verified' }, { status: 'unverified' }])
    expect(trace.steps.find(s => s.kind === 'human')).toMatchObject({ parentId: 'retrieve', decision: { verdict: 'allow', by: 'human' } })
    expect(toLedringTrace({ ...record, stageEvents: [{ id: 'retrieve', confirmed: true }] }).steps.some(s => s.kind === 'human')).toBe(false)
  })
})

it('records stage timing and errors without recording error text', async () => {
  const events: unknown[] = []
  await expect(runTopicAgentWithProgress(input, () => {}, () => {}, 'en',
    { provider: 'openai', apiKey: 'fake', baseUrl: '', model: 'fake' }, undefined, undefined,
    { pace: false, recordStage: event => events.push(event), streamLLM: async () => { throw new Error('PRIVATE_ERROR') } },
  )).rejects.toThrow('PRIVATE_ERROR')
  expect(events).toEqual([
    { id: 'retrieve', startedAt: expect.any(String) },
    { id: 'retrieve', endedAt: expect.any(String), isError: true },
  ])
  expect(JSON.stringify(events)).not.toContain('PRIVATE_ERROR')
})
