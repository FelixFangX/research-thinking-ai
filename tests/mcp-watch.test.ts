import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../server/mcp'
import { collectDigest, collectDigestEvidence, diffDirections, renderWatchNote } from '../server/watch'

// Fake OpenAlex: search returns two works, lookups resolve them.
const works = [
  { id: 'https://openalex.org/W1', doi: 'https://doi.org/10.1234/a', title: 'Graph retrieval for legal question answering', publication_year: 2025, cited_by_count: 120 },
  { id: 'https://openalex.org/W2', doi: null, title: 'Citation graphs in case law', publication_year: 2024, cited_by_count: 5 },
]
const fakeFetch = (async (url: string) => {
  if (url.includes('/works?search=')) return new Response(JSON.stringify({ results: works }))
  if (url.includes('doi:10.1234')) return new Response(JSON.stringify({ title: works[0].title }))
  if (url.includes('/works/W2')) return new Response(JSON.stringify({ title: works[1].title }))
  return new Response('{}', { status: 404 })
}) as typeof fetch

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 't', version: '0' })
  await Promise.all([createServer({ fetch: fakeFetch }).connect(a), client.connect(b)])
  return client
}
const body = (r: unknown) => JSON.parse(((r as { content: { text: string }[] }).content)[0].text)

describe('MCP server', () => {
  it('exposes two read-only tools', async () => {
    const { tools } = await (await connect()).listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['expand', 'propose_directions'])
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true)
  })

  it('propose_directions returns ranked directions with verified citations', async () => {
    const r = body(await (await connect()).callTool({ name: 'propose_directions', arguments: { interest: 'graph RAG for legal QA' } }))
    expect(r.schemaVersion).toBe(1)
    expect(r.directions.length).toBeGreaterThanOrEqual(3)
    expect(r.directions[0]).toHaveProperty('firstExperiment')
    expect(r.evidence.map((e: { citation: string }) => e.citation)).toEqual(['verified', 'verified'])
  })

  it('expand returns one direction with supporting evidence', async () => {
    const r = body(await (await connect()).callTool({ name: 'expand', arguments: { direction: 'Citation graph retrieval', interest: 'legal QA' } }))
    expect(r.direction.name).toBeTruthy()
    expect(r.direction.stopCondition).toBeTruthy()
    expect(r.evidence.length).toBe(2)
  })

  it('demo evidence is labelled as unverified', async () => {
    const r = body(await (await connect()).callTool({ name: 'propose_directions', arguments: { interest: 'swarm robotics', evidence: 'demo' } }))
    expect(r.evidence.every((e: { citation: string }) => e.citation !== 'verified')).toBe(true)
  })
})

describe('weekly watch', () => {
  it('collects matching digest papers from the last 7 days of digest.json', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dg-'))
    const item = (id: string, title: string, category = 'paper') => ({ id, category, title, url: `https://doi.org/10.1234/${id}`, text: '', tags: [] })
    writeFileSync(path.join(dir, '2026-10-13.json'), JSON.stringify({ date: '2026-10-13', items: [item('a', 'Legal question answering with graphs'), item('b', 'Cooking robots'), item('c', 'legal repo', 'repo')] }))
    writeFileSync(path.join(dir, '2026-09-01.json'), JSON.stringify({ date: '2026-09-01', items: [item('d', 'Legal QA old')] }))
    const ev = await collectDigestEvidence({ dir }, 'legal question answering', '2026-10-14')
    expect(ev.map((e) => e.title)).toEqual(['Legal question answering with graphs'])
  })

  it('works when there is no digest data', async () => {
    expect(await collectDigestEvidence({ dir: '/nonexistent' }, 'x', '2026-10-14')).toEqual([])
  })

  it('reports the digest as off, unavailable or empty instead of failing', async () => {
    expect((await collectDigest({}, 'x', '2026-10-14')).status).toBe('off')
    const denied = (async () => new Response('', { status: 401 })) as unknown as typeof fetch
    expect(await collectDigest({ baseUrl: 'https://example.test/daily', fetch: denied }, 'x', '2026-10-14')).toEqual({ status: 'unavailable', daysWithData: 0, evidence: [] })
    const down = (async () => { throw new Error('ENOTFOUND') }) as unknown as typeof fetch
    expect((await collectDigest({ baseUrl: 'https://example.test/daily', fetch: down }, 'x', '2026-10-14')).status).toBe('unavailable')
    const missing = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
    expect((await collectDigest({ baseUrl: 'https://example.test/daily', fetch: missing }, 'x', '2026-10-14')).status).toBe('empty')
    const next = { date: '2026-10-14', directions: [{ id: 'a', name: 'A', score: 1 }], evidence: [] }
    expect(renderWatchNote('x', next, diffDirections(null, next), 'unavailable')).toMatch(/OpenAlex only/)
  })

  it('diffs direction rankings and renders a what-changed note', () => {
    const prev = { date: '2026-10-07', directions: [{ id: 'P1', name: 'A', score: 70 }, { id: 'P2', name: 'B', score: 60 }], evidence: [{ title: 'Old paper', url: 'u1' }] }
    const next = { date: '2026-10-14', directions: [{ id: 'P2', name: 'B', score: 75 }, { id: 'P3', name: 'C', score: 50 }], evidence: [{ title: 'Old paper', url: 'u1' }, { title: 'New paper', url: 'u2' }] }
    const d = diffDirections(prev, next)
    expect(d.moved).toEqual([{ name: 'B', from: 2, to: 1 }])
    expect(d.added).toEqual(['C'])
    expect(d.dropped).toEqual(['A'])
    expect(d.newEvidence.map((e) => e.title)).toEqual(['New paper'])
    const md = renderWatchNote('legal QA', next, d)
    expect(md).toContain('# What changed: legal QA')
    expect(md).toContain('New paper')
  })

  it('first run has no previous snapshot', () => {
    const next = { date: '2026-10-14', directions: [{ id: 'P1', name: 'A', score: 1 }], evidence: [] }
    expect(diffDirections(null, next).added).toEqual(['A'])
  })
})
