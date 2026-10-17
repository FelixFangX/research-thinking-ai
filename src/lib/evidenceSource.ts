export type EvidenceOrigin = 'openalex' | 'crossref' | 'model' | 'template'

export function evidenceSourceKey(origin: EvidenceOrigin | null | undefined) {
  switch (origin) {
    case 'openalex': return 'evidence.openalex'
    case 'crossref': return 'evidence.crossref'
    case 'model': return 'evidence.model'
    case 'template': return 'evidence.template'
    default: return null
  }
}
