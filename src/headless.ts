import { runTopicAgentWithProgress } from './engine'
import type { LLMConfig } from './llm'
import type { AgentRunResult, EvidenceItem, TopicInput } from './types'
import type { Locale } from './i18n'

export interface ResearchOptions {
  locale?: Locale
  /** With a key, every stage uses the LLM; without, the deterministic demo engine runs. */
  llm?: LLMConfig | null
  /** Real evidence source (e.g. searchOpenAlexEvidence). Without it, evidence comes from the LLM or the demo template. */
  evidence?: () => Promise<EvidenceItem[]>
}

/** Run the 4-stage pipeline without UI callbacks or typing animation. */
export function runResearch(input: TopicInput, options: ResearchOptions = {}): Promise<AgentRunResult> {
  const noop = () => {}
  return runTopicAgentWithProgress(input, noop, noop, options.locale ?? 'en', options.llm ?? null, undefined, options.evidence, {
    pace: false,
  })
}
