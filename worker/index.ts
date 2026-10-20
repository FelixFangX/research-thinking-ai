import { toLedringTrace, traceFilename, TraceRecordSchema } from '../src/ledringTrace'
import traceSample from '../src/fixtures/trace-demo.json'
import { HttpError, json, readBody, securityHeaders } from './http'
import { buildAIInput, estimateCost, models, normalizeSSE, validateLLM } from './llm'
import { buckets, D1Store, quotaDecision, type UsageStore } from './quota'
import { evidence } from './evidence'
export interface Env {
  ASSETS: Fetcher
  AI: Ai
  DB: D1Database
  GLOBAL_DAILY_NEURONS: string
  IP_DAILY_NEURONS: string
  IP_REQUESTS_PER_MINUTE: string
  EVIDENCE_IP_REQUESTS_PER_MINUTE: string
  OPENALEX_MAILTO: string
  OPENALEX_API_KEY?: string
}
export async function handle(request: Request, env: Env, ctx: ExecutionContext, store: UsageStore = new D1Store(env.DB)): Promise<Response> {
  const path = new URL(request.url).pathname
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: securityHeaders })
  try {
    if (path === '/api/trace' || path === '/api/trace/sample') {
      const sample = path.endsWith('/sample')
      if (request.method !== (sample ? 'GET' : 'POST')) throw new HttpError(405, 'method_not_allowed')
      const body = sample ? traceSample : await readBody(request, 256 * 1024)
      const parsed = TraceRecordSchema.safeParse('record' in body ? body.record : body)
      if (!parsed.success) throw new HttpError(400, 'invalid_request')
      const trace = toLedringTrace(parsed.data)
      return json(trace, 200, { 'content-disposition': `attachment; filename="${traceFilename(trace.id)}"`,
        ...(sample ? { 'cache-control': 'public, max-age=3600' } : {}) })
    }
    const now = Date.now(), b = await buckets(request.headers.get('CF-Connecting-IP') ?? 'unknown', new Date(now))
    if (Math.random() < 0.02) ctx.waitUntil(env.DB.prepare('DELETE FROM usage WHERE updated_at < ?').bind(now - 3 * 86400000).run())
    const globalLimit = Number(env.GLOBAL_DAILY_NEURONS), ipLimit = Number(env.IP_DAILY_NEURONS)
    if (path === '/api/status') {
      if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed')
      const [globalUsed, ipUsed] = await Promise.all([store.used(b.global), store.used(b.ip)])
      return json({ models, quota: { day: b.day, globalLimit, globalUsed, globalRemaining: Math.max(0, globalLimit - globalUsed), ipLimit, ipUsed, ipRemaining: Math.max(0, ipLimit - ipUsed), exhausted: globalUsed >= globalLimit || ipUsed >= ipLimit, resetsAt: b.resetsAt } })
    }
    if (path === '/api/evidence') {
      if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
      if (await store.increment(b.evidence, now) > Number(env.EVIDENCE_IP_REQUESTS_PER_MINUTE)) return json({ error: 'rate_limited', retryAfter: b.retryAfter }, 429, { 'Retry-After': String(b.retryAfter) })
      return await evidence(request, env, ctx)
    }
    if (path !== '/api/llm') return json({ error: 'not_found' }, 404)
    const input = validateLLM(await readBody(request, 48 * 1024))
    const chars = input.messages.reduce((n, m) => n + m.content.length, 0)
    const estimate = estimateCost(input.model, chars, input.max_tokens)
    const count = await store.increment(b.minute, now)
    const [globalUsed, ipUsed] = await Promise.all([store.used(b.global), store.used(b.ip)])
    const decision = quotaDecision(globalUsed, ipUsed, estimate, globalLimit, ipLimit, count, Number(env.IP_REQUESTS_PER_MINUTE))
    if (decision === 'rate_limited') return json({ error: 'rate_limited', retryAfter: b.retryAfter }, 429, { 'Retry-After': String(b.retryAfter) })
    if (decision) return json({ error: 'quota_exhausted', scope: decision, resetsAt: b.resetsAt }, 429)
    if (!await store.reserve(b.global, b.ip, estimate, globalLimit, ipLimit, now)) {
      const global = await store.used(b.global)
      return json({ error: 'quota_exhausted', scope: global + estimate > globalLimit ? 'global' : 'ip', resetsAt: b.resetsAt }, 429)
    }
    let upstream: ReadableStream<Uint8Array>
    try {
      // The only inference destination is the Workers AI binding. No client URL is read.
      const run = (json: boolean) => env.AI.run(input.model as Parameters<Ai['run']>[0], buildAIInput(input, json))
      let result
      try { result = await run(input.json) } catch (error) {
        if (!input.json) throw error
        result = await run(false)
      }
      if (!(result instanceof ReadableStream)) throw new Error('Expected stream')
      upstream = result as ReadableStream<Uint8Array>
    } catch {
      await store.adjust(b.global, b.ip, -estimate, now)
      return json({ error: 'upstream_error' }, 502)
    }
    const transform = normalizeSSE(input.model, chars, actual => store.adjust(b.global, b.ip, actual - estimate, Date.now()))
    // Track stream completion beyond the response lifetime; failed streams retain their reservation.
    ctx.waitUntil(upstream.pipeTo(transform.writable).catch(() => {}))
    return new Response(transform.readable, { headers: { ...securityHeaders, 'content-type': 'text/event-stream', 'cache-control': 'no-store, no-transform' } })
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.code }, error.status)
    return json({ error: 'internal_error' }, 500)
  }
}
export default { fetch: handle }
