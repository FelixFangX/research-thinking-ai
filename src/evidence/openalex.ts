import type { EvidenceItem, TopicInput } from '../types'
import { cleanMetadata, evidenceClaim, evidenceTier, uniqueEvidence } from './shared'
export { evidenceTier } from './shared'

// Node/browser port of supabase/functions/openalex-search, with resolvable URLs
// (the DOI when there is one, else the OpenAlex work page).

interface Work {
  id: string
  doi?: string | null
  title?: string | null
  publication_year?: number
  cited_by_count?: number
  primary_location?: { source?: { display_name?: string; host_organization_name?: string; type?: string } | null } | null
}

export function buildQuery(input: Pick<TopicInput, 'researchInterest' | 'problemDomain' | 'seedIdea'>): string {
  return [input.researchInterest, input.problemDomain, input.seedIdea]
    .join(' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8)
    .join(' ')
}

export async function searchOpenAlexEvidence(
  input: Pick<TopicInput, 'researchInterest' | 'problemDomain' | 'seedIdea'>,
  fetchImpl: typeof fetch = fetch,
  limit = 8,
  options: { mailto?: string; apiKey?: string; userAgent?: string } = {},
): Promise<EvidenceItem[]> {
  const q = encodeURIComponent(buildQuery(input))
  const params = new URLSearchParams()
  if (options.mailto) params.set("mailto", options.mailto)
  if (options.apiKey) params.set("api_key", options.apiKey)
  const r = await fetchImpl(`https://api.openalex.org/works?search=${q}&per-page=${limit + 4}&sort=relevance_score:desc&select=id,doi,title,publication_year,cited_by_count,primary_location${params.size ? `&${params}` : ""}`, options.userAgent ? { headers: { "User-Agent": options.userAgent } } : undefined)
  if (!r.ok) throw new Error(`OpenAlex ${r.status}`)
  const works = ((await r.json()) as { results?: Work[] }).results ?? []
  return uniqueEvidence(works.map(w => ({
    work: w,
    title: cleanMetadata(w.title ?? ''),
    preprint: w.primary_location?.source?.type === 'repository' || /arxiv|biorxiv|medrxiv/i.test(w.primary_location?.source?.display_name ?? ''),
    journalDoi: !!w.doi && w.primary_location?.source?.type === 'journal',
  })), limit).map(({ work: w, title }, i) => {
    const tier = evidenceTier(w.primary_location?.source?.host_organization_name ?? '', w.cited_by_count ?? 0)
    const cited = w.cited_by_count ?? 0
    const source = cleanMetadata(w.primary_location?.source?.display_name ?? '') || 'OpenAlex'
    return {
      id: `E${i + 1}`,
      title,
      source: `OpenAlex | ${source}`,
      url: w.doi || w.id,
      year: w.publication_year ?? 0,
      tier,
      claim: evidenceClaim(source, w.publication_year ?? 0, cited),
      relevance: Math.min(95, 60 + Math.min(cited, 35)),
      credibility: tier === 'T1' ? 88 : tier === 'T2' ? 72 : 55,
      conflictsWith: [],
    }
  })
}
