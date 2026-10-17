import { afterEach, describe, expect, it, vi } from 'vitest'
import { handle, type Env } from '../worker/index'
import { estimateCost, models, normalizeSSE, validateLLM } from '../worker/llm'
import { buckets, quotaDecision, type UsageStore } from '../worker/quota'
import { searchOpenAlexEvidence } from '../src/evidence/openalex'
import { QuotaError, streamLLM, testConnection } from '../src/llm'

class MemoryStore implements UsageStore {
  neurons = new Map<string, number>()
  requests = new Map<string, number>()
  async used(key: string) { return this.neurons.get(key) ?? 0 }
  async increment(key: string) { const count = (this.requests.get(key) ?? 0) + 1; this.requests.set(key, count); return count }
  async reserve(g: string, ip: string, n: number, gl: number, il: number) {
    if (quotaDecision(await this.used(g), await this.used(ip), n, gl, il)) return false
    await this.adjust(g, ip, n); return true
  }
  async adjust(g: string, ip: string, n: number) { for (const key of [g, ip]) this.neurons.set(key, Math.max(0, (this.neurons.get(key) ?? 0) + n)) }
}
const encoder = new TextEncoder()
function stream(text: string) { return new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < text.length; i += 7) c.enqueue(encoder.encode(text.slice(i, i + 7))); c.close() } }) }
function fixture() {
  const pending: Promise<unknown>[] = []
  const run = vi.fn(async () => stream('data: {"choices":[{"delta":{"content":"hello"}}],"usage":{"neurons":2}}\n\ndata: [DONE]\n\n'))
  const env = { AI: { run }, ASSETS: { fetch: vi.fn(async () => new Response('asset')) }, DB: { prepare: () => ({ bind: () => ({ run: async () => ({}) }) }) }, GLOBAL_DAILY_NEURONS: '3000', IP_DAILY_NEURONS: '600', IP_REQUESTS_PER_MINUTE: '12', EVIDENCE_IP_REQUESTS_PER_MINUTE: '20' } as unknown as Env
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext
  const store = new MemoryStore()
  const request = (body: unknown, headers = { 'content-type': 'application/json' }, method = 'POST') => handle(new Request('https://demo/api/llm', { method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }), env, ctx, store)
  return { request, env, ctx, store, run, pending }
}
const body = { messages: [{ role: 'user', content: 'hello' }] }
afterEach(() => vi.unstubAllGlobals())
describe('Worker validation and accounting', () => {
  it('validates HTTP and input bounds', async () => {
    const f = fixture()
    expect((await f.request(body, {}, 'GET')).status).toBe(405)
    expect((await f.request(body, { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await f.request(body, { 'content-type': 'application/json', 'content-length': '50000' })).status).toBe(413)
    expect((await f.request({ x: 'x'.repeat(50000) })).status).toBe(413)
    for (const invalid of [{ messages: [] }, { messages: Array(13).fill(body.messages[0]) }, { messages: [{ role: 'tool', content: 'x' }] }, { messages: [{ role: 'user', content: 'x'.repeat(24001) }] }, { ...body, model: 'evil' }]) expect((await f.request(invalid)).status).toBe(400)
    expect(f.run).not.toHaveBeenCalled()
  })
  it('clamps controls and computes model prices', () => {
    expect(validateLLM({ ...body, max_tokens: -1, temperature: 7 })).toMatchObject({ max_tokens: 64, temperature: 1.2 })
    expect(validateLLM({ ...body, max_tokens: 9000 })).toMatchObject({ max_tokens: 3072, temperature: 0.6 })
    expect(validateLLM(body).model).toBe(models[0].id)
    expect(validateLLM({ ...body, model: models[1].id }).model).toBe(models[1].id)
    expect(estimateCost(models[0].id, 4, 64)).toBeCloseTo((2 * 5500 + 64 * 36400) / 1e6)
    expect(estimateCost(models[1].id, 3, 64)).toBeCloseTo((9091 + 64 * 27273) / 1e6)
  })
  it('decides quota scope and rate limits', () => {
    expect(quotaDecision(2999, 0, 2, 3000, 600)).toBe('global')
    expect(quotaDecision(0, 599, 2, 3000, 600)).toBe('ip')
    expect(quotaDecision(0, 0, 2, 3000, 600, 13, 12)).toBe('rate_limited')
    expect(quotaDecision(0, 0, 2, 3000, 600, 12, 12)).toBeNull()
  })
  it('never reads a client upstream URL and settles usage', async () => {
    const f = fixture()
    const res = await f.request({ ...body, baseUrl: 'https://evil', upstreamUrl: 'https://evil', max_tokens: 1 })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('"neurons":2')
    await Promise.all(f.pending)
    expect(f.run.mock.calls[0]).toEqual([models[0].id, expect.objectContaining({ max_tokens: 64, chat_template_kwargs: { enable_thinking: false } })])
    expect(JSON.stringify(f.run.mock.calls)).not.toContain('evil')
    expect([...f.store.neurons.values()]).toEqual([2, 2])
  })
  it('refunds inference failures', async () => {
    const f = fixture(); f.run.mockRejectedValue(new Error('secret'))
    const res = await f.request(body)
    expect(res.status).toBe(502); expect(await res.text()).not.toContain('secret')
    expect([...f.store.neurons.values()]).toEqual([0, 0])
  })
  it('hashes IPs and uses UTC bucket boundaries', async () => {
    const b = await buckets('1.2.3.4', new Date('2026-10-17T23:59:59Z'))
    expect(b.global).toBe('g:2026-10-17'); expect(b.ip).toMatch(/^ip:2026-10-17:[a-f0-9]{16}$/)
    expect(b.minute).toMatch(/^m:202610172359:/); expect(b.resetsAt).toBe('2026-10-18T00:00:00.000Z'); expect(b.retryAfter).toBe(1)
  })
})
describe('SSE normalization', () => {
  it.each([false, true])('handles split lines, reasoning and model totals (final total %s)', async final => {
    const settle = vi.fn(async () => {})
    const text = 'data: {"choices":[{"delta":{"content":"A","reasoning_content":"secret"}}],"usage":{"neurons":2}}\r\n\ndata: {"choices":[{"delta":{"content":"B"}}],"usage":{"neurons":3}}\n\n' + (final ? 'data: {"response":"","usage":{"neurons":9}}\n\n' : '') + 'data: [DONE]\n\n'
    const result = await new Response(stream(text).pipeThrough(normalizeSSE(models[0].id, 5, settle))).text()
    expect(result).toContain('"content":"A"'); expect(result).toContain('"content":"B"'); expect(result).not.toContain('secret')
    expect(result.endsWith('data: [DONE]\n\n')).toBe(true); expect(settle).toHaveBeenCalledWith(final ? 9 : 5)
  })
  it('falls back to token estimates without usage', async () => {
    const settle = vi.fn(async () => {})
    await new Response(stream('data: {"choices":[{"delta":{"content":"abcd"}}]}').pipeThrough(normalizeSSE(models[0].id, 4, settle))).text()
    expect(settle).toHaveBeenCalledWith(estimateCost(models[0].id, 4, 2))
  })
})
describe('free client', () => {
  const config = { provider: 'free' as const, baseUrl: '', apiKey: '', model: models[0].id }
  it('parses content and neurons without sending authorization', async () => {
    const onUsage = vi.fn(), token = vi.fn()
    const fetch = vi.fn(async () => new Response(stream('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: {"usage":{"neurons":4}}\n\ndata: [DONE]\n\n')))
    vi.stubGlobal('fetch', fetch)
    expect(await streamLLM(body.messages as { role: 'user'; content: string }[], { ...config, onUsage }, token)).toBe('hi')
    expect(onUsage).toHaveBeenCalledWith(4)
    expect(fetch.mock.calls[0]).toEqual(['/api/llm', expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })])
  })
  it.each(['quota_exhausted', 'rate_limited'] as const)('throws typed %s', async kind => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: kind, scope: 'ip', retryAfter: 20 }), { status: 429 }))
    await expect(streamLLM([], config, () => {})).rejects.toBeInstanceOf(QuotaError)
    await expect(streamLLM([], config, () => {})).rejects.toMatchObject({ kind, message: kind === 'quota_exhausted' ? 'FREE_QUOTA_EXHAUSTED' : 'FREE_RATE_LIMITED' })
  })
  it('tests connection with status only', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ quota: { ipRemaining: 600, globalRemaining: 3000 } })))
    vi.stubGlobal('fetch', fetch)
    expect(await testConnection(config)).toEqual({ ok: true, message: 'Remaining quota: 600 neurons (global: 3000)' })
    expect(fetch).toHaveBeenCalledWith('/api/status')
  })
})

describe('evidence endpoint', () => {
  it('adds OpenAlex selection, credentials and optional user agent', async () => {
    const fetcher = vi.fn(async () => new Response('{"results":[]}'))
    await searchOpenAlexEvidence({ researchInterest: 'test query', problemDomain: '', seedIdea: '' }, fetcher, 4, { mailto: 'test@example.com', apiKey: 'private', userAgent: 'demo' })
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url).searchParams.get('api_key')).toBe('private')
    expect(new URL(url).searchParams.get('mailto')).toBe('test@example.com')
    expect(new URL(url).searchParams.get('select')).toBe('id,doi,title,publication_year,cited_by_count,primary_location')
    expect(options.headers).toEqual({ 'User-Agent': 'demo' })
  })
  it('caches successful evidence and returns API security headers', async () => {
    const entries = new Map<string, Response>()
    vi.stubGlobal('caches', { default: { match: async (r: Request) => entries.get(r.url)?.clone(), put: async (r: Request, response: Response) => { entries.set(r.url, response) } } })
    const fetcher = vi.fn(async () => new Response('{"results":[]}'))
    vi.stubGlobal('fetch', fetcher)
    const f = fixture()
    const request = () => handle(new Request('https://demo/api/evidence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ researchInterest: 'research test' }) }), f.env, f.ctx, f.store)
    const first = await request()
    expect(await first.json()).toMatchObject({ cached: false, source: 'openalex', evidence: [] })
    expect(first.headers.get('access-control-allow-origin')).toBeNull()
    await Promise.all(f.pending)
    expect(await (await request()).json()).toMatchObject({ cached: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([429, 500])('maps OpenAlex failure %s', async status => {
    vi.stubGlobal('caches', { default: { match: async () => undefined } })
    vi.stubGlobal('fetch', async () => new Response('', { status }))
    const f = fixture()
    const res = await handle(new Request('https://demo/api/evidence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ researchInterest: 'research' }) }), f.env, f.ctx, f.store)
    expect(res.status).toBe(status === 429 ? 503 : 502)
    expect(await res.json()).toEqual({ error: status === 429 ? 'evidence_rate_limited' : 'evidence_unavailable' })
  })
})
