import { expect, it, vi } from 'vitest'
import { searchCrossrefEvidence } from '../src/evidence/crossref'
import { searchOpenAlexEvidence } from '../src/evidence/openalex'
import { cleanMetadata, evidenceClaim } from '../src/evidence/shared'

const input = { researchInterest: 'assessment', problemDomain: '', seedIdea: '' }

it('decodes named and numeric entities and strips encoded and literal tags', () => {
  expect(cleanMetadata('&lt;i&gt;Assessment&lt;/i&gt; &amp; <b>Evaluation</b> &quot;A&quot; &#39;B&#39; &#x43; &#68; &gt;'))
    .toBe('Assessment & Evaluation "A" \'B\' C D >')
  expect(cleanMetadata('&#x110000;')).toBe('&#x110000;')
  expect(evidenceClaim('Journal', 2025, 100)).toBe('Published in Journal (2025), cited 100×.')
  expect(evidenceClaim('Journal', 2025, 101)).toContain('Highly cited.')
})

it.each(['crossref', 'openalex'] as const)('%s cleans metadata, deduplicates, prefers journal DOIs, and numbers the retained results', async provider => {
  const titles = ['<i>Assessment</i> &amp; Evaluation', 'assessment evaluation!', 'ASSESSMENT: evaluation', '', 'Another &#x70;aper', 'Third paper']
  const works = titles.map((title, i) => provider === 'crossref' ? {
    title: [title], DOI: `10.1/${i}`, type: i === 0 ? 'posted-content' : 'journal-article',
    'container-title': ['Assessment &amp; Evaluation'], publisher: 'Elsevier BV',
    issued: { 'date-parts': [[2025]] }, 'is-referenced-by-count': 1,
  } : {
    id: `https://openalex.org/W${i}`, title, doi: `https://doi.org/10.1/${i}`,
    publication_year: 2025, cited_by_count: 1,
    primary_location: { source: { display_name: 'Assessment &amp; Evaluation', host_organization_name: 'Elsevier BV', type: i === 0 ? 'repository' : 'journal' } },
  })
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(provider === 'crossref' ? { message: { items: works } } : { results: works }))
  const search = provider === 'crossref' ? searchCrossrefEvidence : searchOpenAlexEvidence
  const result = await search(input, fetcher, 3)
  expect(result.map(item => item.id)).toEqual(['E1', 'E2', 'E3'])
  expect(result.map(item => item.title)).toEqual(['assessment evaluation!', 'Another paper', 'Third paper'])
  expect(result[0]).toMatchObject({ url: 'https://doi.org/10.1/1', tier: 'T1', claim: 'Published in Assessment & Evaluation (2025), cited 1×.' })
  expect(result[0].source).toBe(`${provider === 'crossref' ? 'Crossref' : 'OpenAlex'} | Assessment & Evaluation`)
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get(provider === 'crossref' ? 'rows' : 'per-page')).toBe('7')
})
