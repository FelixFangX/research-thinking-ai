// Citation check: does each evidence link point to a real work whose title matches?

export type LinkKind = 'doi' | 'openalex' | 'invalid-doi' | 'search' | 'other'
export type CitationStatus = 'verified' | 'title-mismatch' | 'not-found' | 'broken' | 'search-link' | 'unverified'

/** Looks up a work by "doi:<doi>" or "openalex:<W id>"; returns null if it doesn't exist. */
export type WorkResolver = (ref: string) => Promise<{ title: string } | null>

export interface CitationItem {
  id: string
  url: string
  status: CitationStatus
}
export interface CitationReport {
  items: CitationItem[]
  verifiedRate: number
}

const SEARCH = /[?&](q|query|search)=|\/search\b|\/scholar\?/i

export function classifyUrl(url: string): LinkKind {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'other'
  }
  if (u.hostname.endsWith('doi.org')) return /^\/10\.\d{4,9}\//.test(u.pathname) ? 'doi' : 'invalid-doi'
  if (u.hostname.endsWith('openalex.org') && /^\/W\d+$/i.test(u.pathname)) return 'openalex'
  if (SEARCH.test(u.pathname + u.search)) return 'search'
  return 'other'
}

function refFor(url: string, kind: LinkKind): string | null {
  const u = new URL(url)
  if (kind === 'doi') return `doi:${decodeURIComponent(u.pathname.slice(1))}`
  if (kind === 'openalex') return `openalex:${u.pathname.slice(1)}`
  return null
}

const words = (t: string) => new Set(t.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2))

/** Share of the cited title's words found in the real title (0..1). */
export function titleMatch(cited: string, real: string): number {
  const a = words(cited)
  const b = words(real)
  if (!a.size) return 0
  let hit = 0
  for (const w of a) if (b.has(w)) hit++
  return hit / a.size
}

export async function checkCitations(
  evidence: Array<{ id: string; url: string; title: string }>,
  resolve: WorkResolver,
  threshold = 0.6,
): Promise<CitationReport> {
  const items: CitationItem[] = []
  for (const e of evidence) {
    const kind = classifyUrl(e.url)
    let status: CitationStatus
    if (kind === 'search') status = 'search-link'
    else if (kind === 'invalid-doi') status = 'broken'
    else if (kind === 'other') status = 'unverified'
    else {
      const work = await resolve(refFor(e.url, kind)!)
      status = !work ? 'not-found' : titleMatch(e.title, work.title) >= threshold ? 'verified' : 'title-mismatch'
    }
    items.push({ id: e.id, url: e.url, status })
  }
  const verified = items.filter((i) => i.status === 'verified').length
  return { items, verifiedRate: items.length ? Math.round((verified / items.length) * 1000) / 1000 : 0 }
}

/** Resolver backed by the public OpenAlex API (no key needed). */
export function openAlexResolver(fetchImpl: typeof fetch = fetch, mailto?: string): WorkResolver {
  return async (ref) => {
    const [kind, id] = ref.split(/:(.*)/s)
    const path = kind === 'doi' ? `doi:${id}` : id
    const qs = mailto ? `?mailto=${encodeURIComponent(mailto)}` : ''
    const r = await fetchImpl(`https://api.openalex.org/works/${encodeURIComponent(path).replace('%3A', ':')}${qs}`)
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`OpenAlex ${r.status}`)
    const j = (await r.json()) as { title?: string; display_name?: string }
    return { title: j.title ?? j.display_name ?? '' }
  }
}
