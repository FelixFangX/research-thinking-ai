import { errorMessageNotice } from '../src/lib/quota'
import { describe, expect, it, vi } from 'vitest'
import { messages } from '../src/i18n/translations'
import { outputLanguage, outputLanguageInstruction } from '../src/i18n/outputLanguage'
import { resolveLocale } from '../src/i18n/detect'
import { createDefaultInput, runTopicAgentWithProgress, retrieveMessages, mapMessages, compareMessages, convergeMessages, assessComplexity, decideArchitecture } from '../src/engine'

const cjk = /[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/u

describe('strict bilingual content', () => {
  it('keeps dictionary keys in parity and English free of CJK', () => {
    expect(Object.keys(messages.zh).sort()).toEqual(Object.keys(messages.en).sort())
    expect(Object.entries(messages.en).filter(([, value]) => cjk.test(value))).toEqual([])
  })
  it('maps every worker error code to translated text', () => {
    const codes = ['quota_exhausted', 'rate_limited', 'upstream_error', 'internal_error', 'evidence_unavailable', 'evidence_rate_limited', 'not_found', 'method_not_allowed', 'invalid_request', 'invalid_model', 'invalid_messages', 'body_too_large', 'unsupported_media_type']
    for (const code of codes) {
      const notice = errorMessageNotice(new Error(JSON.stringify({ error: code })))
      expect(messages.en[notice.key]).toBeDefined()
      expect(messages.zh[notice.key]).toMatch(cjk)
      expect(messages.en[notice.key]).not.toMatch(cjk)
    }
  })
  it('selects output language from the interest, with locale as fallback', () => {
    expect(outputLanguage('Learning feedback', 'zh')).toBe('en')
    expect(outputLanguage('学习反馈 AI', 'en')).toBe('zh')
    expect(outputLanguage('123', 'zh')).toBe('zh')
    expect(outputLanguage('', 'en')).toBe('en')
  })
  it('forces and persists query locale before rendering', () => {
    const storage = new Map<string, string>([['copilot_locale', 'zh']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) })
    vi.stubGlobal('window', { location: { search: '?lang=en' } })
    vi.stubGlobal('navigator', { language: 'zh-CN' })
    try {
      expect(resolveLocale()).toBe('en')
      expect(storage.get('copilot_locale')).toBe('en')
      window.location.search = ''
      expect(resolveLocale()).toBe('en')
      storage.clear()
      expect(resolveLocale()).toBe('zh')
    } finally { vi.unstubAllGlobals() }
  })
  it('adds an explicit language instruction to a JSON stage system prompt', async () => {
    const input = createDefaultInput('en')
    const stop = new Error('stop after inspecting prompt')
    await expect(runTopicAgentWithProgress(input, () => {}, () => {}, 'zh', {
      provider: 'openai', apiKey: 'fake', baseUrl: '', model: 'test',
    }, undefined, undefined, { pace: false, streamLLM: async messages => {
      expect(messages.find(m => m.role === 'system')?.content).toContain(outputLanguageInstruction(input.researchInterest, 'zh'))
      throw stop
    } })).rejects.toBe(stop)
  })
  it('instructs all four stages in the language of the research interest', () => {
    for (const locale of ['en', 'zh'] as const) {
      for (const interest of ['English research interest', '中文研究兴趣']) {
        const input = { ...createDefaultInput(locale), researchInterest: interest }
        const architecture = decideArchitecture(input, assessComplexity(input, locale), locale)
        const prompts = [retrieveMessages(input, locale), mapMessages(input, [], locale), compareMessages(input, [], architecture, locale), convergeMessages(input, [], locale)]
        for (const prompt of prompts) expect(prompt[0].content).toContain(outputLanguageInstruction(interest, locale))
      }
    }
  })
  it('keeps the complete English template run free of CJK', async () => {
    const result = await runTopicAgentWithProgress(createDefaultInput('en'), () => {}, () => {}, 'en', null, undefined, undefined, { pace: false })
    expect(cjk.test(JSON.stringify(result))).toBe(false)
  })
})
