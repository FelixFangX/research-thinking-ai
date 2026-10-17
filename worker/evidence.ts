import { buildQuery, searchOpenAlexEvidence } from '../src/evidence/openalex'
import { HttpError, json, readBody } from './http'
import type { Env } from './index'
export async function evidence(request: Request, env: Env, ctx: ExecutionContext) {
  const body = await readBody(request, 4096)
  for (const key of ['researchInterest', 'problemDomain', 'seedIdea']) {
    if ((key === 'researchInterest' || body[key] !== undefined) && (typeof body[key] !== 'string' || (body[key] as string).length > 300)) throw new HttpError(400, 'invalid_request')
  }
  if (!(body.researchInterest as string).trim()) throw new HttpError(400, 'invalid_request')
  const limit = body.limit ?? 8
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 10) throw new HttpError(400, 'invalid_request')
  const input = { researchInterest: body.researchInterest as string, problemDomain: (body.problemDomain as string) ?? '', seedIdea: (body.seedIdea as string) ?? '' }
  const query = buildQuery(input)
  const key = new Request(`${new URL(request.url).origin}/__evidence?query=${encodeURIComponent(query.toLowerCase())}&limit=${limit}`)
  const cache = caches.default
  const cached = await cache.match(key)
  if (cached) return json({ ...await cached.json() as object, cached: true })
  try {
    const items = await searchOpenAlexEvidence(input, fetch, limit, { mailto: env.OPENALEX_MAILTO, apiKey: env.OPENALEX_API_KEY, userAgent: 'research-thinking/1.0 (+https://github.com/FelixFangX/research-thinking-ai; mailto:felix@ledring.dev)' })
    const data = { evidence: items, query, source: 'openalex', cached: false }
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } })))
    return json(data)
  } catch (error) {
    return error instanceof Error && error.message === 'OpenAlex 429' ? json({ error: 'evidence_rate_limited' }, 503) : json({ error: 'evidence_unavailable' }, 502)
  }
}
