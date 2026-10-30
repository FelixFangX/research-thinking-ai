import { isLLMConfigured, type LLMConfig } from '../llm'

export function shouldUseSample(config: LLMConfig, options: { requested?: boolean; quotaExhausted?: boolean } = {}): boolean {
  return Boolean(options.requested) || !isLLMConfigured(config) || (config.provider === 'free' && Boolean(options.quotaExhausted))
}
