import { describe, expect, it } from 'vitest'
import { buildSearchQuery, openAlexSearchUrl } from '../supabase/functions/openalex-search/query'

describe('openalex-search edge function query', () => {
  it('ranks by relevance, not citation count', () => {
    const url = new URL(openAlexSearchUrl('graph neural networks drug discovery'))
    expect(url.searchParams.get('sort')).toBe('relevance_score:desc')
    expect(url.searchParams.get('search')).toBe('graph neural networks drug discovery')
  })

  it('builds a short keyword query from topic, domain and seed idea', () => {
    expect(buildSearchQuery('LLM hallucination', 'NLP', 'detect it, cheaply!')).toBe('LLM hallucination NLP detect cheaply')
    expect(buildSearchQuery('a b c d e f g h i j k l m', '', '').split(' ').length).toBeLessThanOrEqual(8)
  })
})
