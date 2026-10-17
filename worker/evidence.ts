import { searchCrossrefEvidence, EVIDENCE_USER_AGENT } from '../src/evidence/crossref'
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
    let items
    let source: 'openalex' | 'crossref' = 'openalex'
    try {
      items = await searchOpenAlexEvidence(input, fetch, limit, { mailto: env.OPENALEX_MAILTO, apiKey: env.OPENALEX_API_KEY, userAgent: EVIDENCE_USER_AGENT })
      if (!items.length) throw new Error('OpenAlex empty')
    } catch (primaryError) {
      try {
        items = await searchCrossrefEvidence(input, fetch, limit, { mailto: env.OPENALEX_MAILTO })
        if (!items.length) throw new Error('Crossref empty')
        source = 'crossref'
      } catch {
        throw primaryError
      }
    }
    const data = { evidence: items, query, source, cached: false }
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } })))
    return json(data)
  } catch (error) {
    return error instanceof Error && error.message === 'OpenAlex 429' ? json({ error: 'evidence_rate_limited' }, 503) : json({ error: 'evidence_unavailable' }, 502)
  }
}
