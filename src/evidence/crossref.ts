import type { EvidenceItem, TopicInput } from '../types'
import { buildQuery, evidenceTier } from './openalex'

export const EVIDENCE_USER_AGENT = 'research-thinking/1.0 (+https://github.com/FelixFangX/research-thinking-ai; mailto:felix@ledring.dev)'

interface CrossrefWork {
  DOI?: string
  title?: string[]
  issued?: { 'date-parts'?: number[][] }
  'container-title'?: string[]
  'is-referenced-by-count'?: number
  publisher?: string
}

export async function searchCrossrefEvidence(
  input: Pick<TopicInput, 'researchInterest' | 'problemDomain' | 'seedIdea'>,
  fetchImpl: typeof fetch = fetch,
  limit = 8,
  options: { mailto?: string } = {},
): Promise<EvidenceItem[]> {
  const params = new URLSearchParams({
    'query.bibliographic': buildQuery(input),
    rows: String(limit),
    select: 'DOI,title,issued,container-title,is-referenced-by-count,publisher,type',
    mailto: options.mailto || 'felix@ledring.dev',
    filter: 'type:journal-article,type:proceedings-article,type:posted-content',
  })
  const response = await fetchImpl(`https://api.crossref.org/works?${params}`, { headers: { 'User-Agent': EVIDENCE_USER_AGENT } })
  if (!response.ok) throw new Error(`Crossref ${response.status}`)
  const items = ((await response.json()) as { message?: { items?: CrossrefWork[] } }).message?.items ?? []
  return items.map(work => ({ work, title: (work.title?.[0] ?? '').replace(/<[^>]*>/g, '').trim() }))
    .filter(({ title }) => title.length > 0).slice(0, limit).map(({ work, title }, i) => {
      const cited = work['is-referenced-by-count'] ?? 0
      const tier = evidenceTier(work.publisher ?? '', cited)
      const source = work['container-title']?.[0] || work.publisher || 'Crossref'
      return {
        id: `E${i + 1}`, title, source: `Crossref | ${source}`,
        url: work.DOI ? `https://doi.org/${work.DOI}` : '',
        year: work.issued?.['date-parts']?.[0]?.[0] ?? 0,
        tier,
        claim: `${tier === 'T1' ? 'Highly-cited' : tier === 'T2' ? 'Recent or moderately cited' : 'Supplementary'} work from ${source} (cited ${cited}×).`,
        relevance: Math.min(95, 60 + Math.min(cited, 35)),
        credibility: tier === 'T1' ? 88 : tier === 'T2' ? 72 : 55,
        conflictsWith: [],
      }
    })
}
