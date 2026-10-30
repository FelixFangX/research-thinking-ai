import { describe, expect, it } from 'vitest'
import { shouldUseSample } from '../src/lib/researchConfig'
import type { LLMConfig } from '../src/llm'

const free: LLMConfig = { provider: 'free', apiKey: '', baseUrl: '', model: '@cf/zai-org/glm-4.7-flash' }

describe('research run configuration', () => {
  it('uses free inference on first run without credentials', () => {
    expect(shouldUseSample(free)).toBe(false)
  })
  it.each(['openai', 'anthropic', 'minimax'] as const)('runs a sample for unconfigured %s without a settings gate', provider => {
    expect(shouldUseSample({ ...free, provider })).toBe(true)
    expect(shouldUseSample({ ...free, provider, apiKey: 'test-key' })).toBe(false)
  })
  it('uses a sample when free quota is exhausted, preserving configured providers', () => {
    expect(shouldUseSample(free, { quotaExhausted: true })).toBe(true)
    expect(shouldUseSample({ ...free, provider: 'openai', apiKey: 'test-key' }, { quotaExhausted: true })).toBe(false)
  })
  it('allows explicit samples without affecting the next run', () => {
    expect(shouldUseSample(free, { requested: true })).toBe(true)
    expect(shouldUseSample(free)).toBe(false)
  })
})
