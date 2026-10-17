import { afterEach, expect, it, vi } from 'vitest'
import { searchCrossrefEvidence, EVIDENCE_USER_AGENT } from '../src/evidence/crossref'
import { checkCitations, openAlexResolver } from '../src/citations'
import { evidence } from '../worker/evidence'
import type { Env } from '../worker/index'

const input = { researchInterest: 'graph learning', problemDomain: '', seedIdea: '' }
const item = { DOI: '10.1234/paper', title: ['<i>Graph</i> learning'], publisher: 'Elsevier', 'container-title': ['Journal'], issued: { 'date-parts': [[2025, 1]] }, 'is-referenced-by-count': 20 }
afterEach(() => vi.unstubAllGlobals())

it('maps Crossref metadata, skips empty titles, and sends repeated type filters and polite headers', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: { items: [{ title: ['<i></i>'] }, item, { title: ['Other'], publisher: 'arxiv' }, { title: ['Last'] }] } }))
  const found = await searchCrossrefEvidence(input, fetcher, 4, { mailto: 'test@example.com' })
  expect(found[0]).toEqual({ id: 'E1', title: 'Graph learning', source: 'Crossref | Journal', url: 'https://doi.org/10.1234/paper', year: 2025, tier: 'T1', claim: 'Published in Journal (2025), cited 20×.', relevance: 80, credibility: 88, conflictsWith: [] })
  expect(found[1]).toMatchObject({ id: 'E2', year: 0, tier: 'T2', source: 'Crossref | arxiv', relevance: 60, credibility: 72 })
  expect(found[2]).toMatchObject({ tier: 'T3', credibility: 55 })
  const [url, options] = fetcher.mock.calls[0]
  const params = new URL(String(url)).searchParams
  expect(params.get('filter')).toBe('type:journal-article,type:proceedings-article,type:posted-content')
  expect(params.get('mailto')).toBe('test@example.com')
  expect(params.get('rows')).toBe('8')
  expect(params.get('query.bibliographic')).toBe('graph learning')
  expect(options?.headers).toEqual({ 'User-Agent': EVIDENCE_USER_AGENT })
  const resolverFetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ title: 'Graph learning' }))
  expect((await checkCitations([found[0]], openAlexResolver(resolverFetch))).verifiedRate).toBe(1)
  expect(decodeURIComponent(String(resolverFetch.mock.calls[0][0]))).toBe('https://api.openalex.org/works/doi:10.1234/paper')
})

it.each(['429', '500', 'network', 'empty'])('falls back after OpenAlex %s and caches the Crossref source', async failure => {
  const fetcher = vi.fn<typeof fetch>()
  if (failure === 'network') fetcher.mockRejectedValueOnce(new Error('offline'))
  else fetcher.mockResolvedValueOnce(failure === 'empty' ? Response.json({ results: [] }) : new Response('', { status: Number(failure) }))
  fetcher.mockResolvedValueOnce(Response.json({ message: { items: [item] } }))
  vi.stubGlobal('fetch', fetcher)
  const put = vi.fn(async () => {})
  vi.stubGlobal('caches', { default: { match: async () => undefined, put } })
  const pending: Promise<unknown>[] = []
  const response = await evidence(new Request('https://demo/api/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), { OPENALEX_MAILTO: 'test@example.com' } as Env, { waitUntil: p => pending.push(p) } as ExecutionContext)
  expect(await response.json()).toMatchObject({ source: 'crossref', evidence: [expect.objectContaining({ title: 'Graph learning' })] })
  expect(String(fetcher.mock.calls[0][0])).toContain('api.openalex.org')
  expect(String(fetcher.mock.calls[1][0])).toContain('api.crossref.org')
  await Promise.all(pending)
  expect(put).toHaveBeenCalledTimes(1)
})
