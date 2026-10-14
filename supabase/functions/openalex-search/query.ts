// Pure helpers shared by the edge function and its tests (no Deno imports).

export function buildSearchQuery(topic = '', domain = '', seedIdea = ''): string {
  return [topic, domain, seedIdea]
    .join(' ')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8)
    .join(' ')
}

// Sort by relevance, not citations: citation sort over a loose search returns
// famous but off-topic papers (2/80 on-topic titles vs 80/80, see PR).
export function openAlexSearchUrl(query: string, perPage = 12): string {
  return `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${perPage}&sort=relevance_score:desc`
}

export const USER_AGENT = 'research-thinking-ai/1.0 (https://github.com/FelixFangX/research-thinking-ai)'
