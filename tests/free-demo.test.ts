import { afterEach, describe, expect, it, vi } from 'vitest'
import { isLLMConfigured, QuotaError, type LLMConfig } from '../src/llm'
import { freeErrorNotice, runsLeft } from '../src/lib/quota'
import { evidenceSourceKey } from '../src/lib/evidenceSource'
import { fetchEvidence } from '../src/evidence/client'
import { t } from '../src/i18n/translations'
import { runResearch } from '../src/headless'
import { createDefaultInput } from '../src/engine'

afterEach(() => vi.unstubAllGlobals())

describe('evidence source labels', () => {
  it.each([
    ['openalex', 'Source: OpenAlex'],
    ['crossref', 'Source: Crossref'],
    ['model', 'Source: model-generated (unverified)'],
    ['template', 'Source: sample data (demo)'],
  ] as const)('labels %s accurately in both locales', (origin, label) => {
    const key = evidenceSourceKey(origin)!
    expect(t('en', key)).toBe(label)
    expect(t('zh', key)).toBe(label)
  })
  it('leaves old history entries without a label', () => {
    expect(evidenceSourceKey(undefined)).toBeNull()
    expect(evidenceSourceKey(null)).toBeNull()
  })
})

describe('LLM configuration', () => {
  const config: LLMConfig = { provider: 'free', apiKey: '', baseUrl: '', model: '@cf/zai-org/glm-4.7-flash' }
  it('enables free inference without a key', () => {
    expect(isLLMConfigured(config)).toBe(true)
  })
  it('requires a key for each advanced provider', () => {
    for (const provider of ['openai', 'anthropic', 'minimax'] as const) {
      expect(isLLMConfigured({ ...config, provider })).toBe(false)
      expect(isLLMConfigured({ ...config, provider, apiKey: 'test-key' })).toBe(true)
    }
    expect(isLLMConfigured(null)).toBe(false)
    expect(isLLMConfigured()).toBe(false)
  })
})

describe('free quota notices', () => {
  it('estimates complete runs from the smaller remaining allowance', () => {
    expect(runsLeft({ globalRemaining: 3000, ipRemaining: 600 })).toBe(4)
    expect(runsLeft({ globalRemaining: 149, ipRemaining: 600 })).toBe(0)
    expect(runsLeft({ globalRemaining: 1000, ipRemaining: 500 })).toBe(3)
    expect(runsLeft({ globalRemaining: -1, ipRemaining: 600 })).toBe(0)
  })
  it('maps quota exhaustion to a local reset time', () => {
    const resetsAt = '2026-10-18T00:00:00.000Z'
    expect(freeErrorNotice(new QuotaError('quota_exhausted', { resetsAt }))).toEqual({
      key: 'free.exhausted', params: { time: new Date(resetsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) },
    })
    expect(freeErrorNotice(new QuotaError('quota_exhausted'), new Date('2026-10-17T12:00:00Z'))?.params.time)
      .toBe(new Date(resetsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))
  })
  it.each(['en-US', 'zh-CN'])('formats reset time for %s without seconds', (locale) => {
    const resetsAt = '2026-10-18T00:00:35.000Z'
    expect(freeErrorNotice(new QuotaError('quota_exhausted', { resetsAt }), new Date(), locale)?.params.time)
      .toBe(new Date(resetsAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }))
  })
  it('maps rate limits and upstream failures separately', () => {
    expect(freeErrorNotice(new QuotaError('rate_limited', { retryAfter: 12 }))).toEqual({ key: 'free.rateLimited', params: { n: 12 } })
    expect(freeErrorNotice(new QuotaError('rate_limited'))?.params.n).toBe(60)
    expect(freeErrorNotice(new Error('API 502: upstream_error'))?.key).toBe('free.unavailable')
    expect(freeErrorNotice(new Error('API 400: invalid_model'))).toBeNull()
    expect(freeErrorNotice(null)).toBeNull()
  })
})

describe('live evidence fallback', () => {
  it.each(['openalex', 'crossref'] as const)('uses real %s evidence without an LLM', async (source) => {
    const input = createDefaultInput('en')
    const demo = await runResearch(input)
    const evidence = [{ ...demo.evidence[0], title: 'Real provider evidence' }]
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ evidence, source })))
    vi.stubGlobal('fetch', fetchMock)
    const result = await runResearch(input, {
      evidence: async () => (await fetchEvidence(input)).evidence,
    })
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/evidence', expect.objectContaining({ method: 'POST' }))
    expect(result.evidence).toEqual(evidence)
    expect(result.recommendation.selectedPathId).toBeTruthy()
  })

  it('finishes with demo evidence when retrieval fails without an LLM', async () => {
    const result = await runResearch(createDefaultInput('en'), {
      evidence: async () => { throw new Error('API 503') },
    })
    expect(result.evidence.length).toBeGreaterThan(0)
    expect(result.recommendation.selectedPathId).toBeTruthy()
  })

  it('retrieves model evidence after a live failure and passes it to later stages', async () => {
    const input = createDefaultInput('en')
    const demo = await runResearch(input)
    const evidence = [{ ...demo.evidence[0], title: 'Model fallback evidence' }]
    const responses = [
      { evidence },
      { complexity: demo.complexity, architecture: demo.architecture },
      { candidates: demo.candidates },
      { recommendation: demo.recommendation },
    ]
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
      void _url; void _init
      const body = JSON.stringify(responses.shift())
      return new Response(JSON.stringify({ choices: [{ message: { content: body } }] }))
    })
    // Exercise the non-streaming provider response path.
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const response = await fetchMock(url, init)
      Object.defineProperty(response, 'body', { value: null })
      return response
    })
    const result = await runResearch(input, {
      llm: { provider: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'fake', model: 'test' },
      evidence: async () => { throw new Error('Network error') },
    })
    expect(result.evidence).toEqual(evidence)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[1][1].body).toContain('Model fallback evidence')
    expect(fetchMock.mock.calls[2][1].body).toContain('Model fallback evidence')
  })
})
