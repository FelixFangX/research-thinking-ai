import type { EvidenceItem, TopicInput } from '../types'
export async function fetchEvidence(input: Pick<TopicInput, 'researchInterest'> & Partial<Pick<TopicInput, 'problemDomain' | 'seedIdea'>> & { limit?: number }, baseUrl = ''): Promise<{ evidence: EvidenceItem[]; source: 'openalex' | 'crossref' }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/evidence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return await res.json() as { evidence: EvidenceItem[]; source: 'openalex' | 'crossref' }
}
