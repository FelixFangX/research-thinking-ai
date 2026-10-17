import type { EvidenceItem } from '../types'

export function cleanMetadata(value: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    if (!code.startsWith('#')) return entities[code.toLowerCase()] ?? entity
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity
  }).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

export function evidenceTier(host: string, cited: number): EvidenceItem['tier'] {
  if (cited > 100 || /nature|science|pnas|ieee|acm|springer|elsevier|oxford|cambridge|mit press/i.test(host)) return 'T1'
  if (/arxiv|biorxiv|medrxiv|ceur|scholarworks/i.test(host) || cited > 10) return 'T2'
  return 'T3'
}

export function evidenceClaim(venue: string, year: number, cited: number): string {
  return `Published in ${venue}${year ? ` (${year})` : ''}, cited ${cited}×.${cited > 100 ? ' Highly cited.' : ''}`
}

// Preserve upstream order, replacing a preprint in place only for a journal DOI.
export function uniqueEvidence<T extends { title: string; journalDoi: boolean; preprint: boolean }>(items: T[], limit: number): T[] {
  const unique = new Map<string, T>()
  for (const item of items) {
    const key = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    if (!key) continue
    const previous = unique.get(key)
    if (!previous || (previous.preprint && item.journalDoi)) unique.set(key, item)
  }
  return [...unique.values()].slice(0, limit)
}
