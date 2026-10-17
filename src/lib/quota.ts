import { QuotaError } from '../llm'

export const NEURONS_PER_RUN = 150
export const FREE_MODELS = [
  { id: '@cf/zai-org/glm-4.7-flash', label: 'GLM-4.7 Flash' },
  { id: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4 26B' },
]
export interface FreeStatus {
  models: typeof FREE_MODELS
  quota: { globalRemaining: number; ipRemaining: number; exhausted: boolean; resetsAt: string }
}
export function runsLeft(quota: Pick<FreeStatus['quota'], 'globalRemaining' | 'ipRemaining'>): number {
  return Math.max(0, Math.floor(Math.min(quota.globalRemaining, quota.ipRemaining) / NEURONS_PER_RUN))
}
export function freeErrorNotice(error: unknown, now = new Date(), locale?: string): { key: string; params: Record<string, string | number> } | null {
  if (error instanceof QuotaError) {
    if (error.kind === 'rate_limited') return { key: 'free.rateLimited', params: { n: Math.max(1, Math.ceil(error.retryAfter ?? 60)) } }
    const nextMidnight = new Date(now)
    nextMidnight.setUTCHours(24, 0, 0, 0)
    const reset = error.resetsAt ? new Date(error.resetsAt) : nextMidnight
    return { key: 'free.exhausted', params: { time: (Number.isNaN(reset.getTime()) ? nextMidnight : reset).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) } }
  }
  if (error instanceof Error && /^API 502\b/.test(error.message)) return { key: 'free.unavailable', params: {} }
  return null
}

/** Localized, user-facing error text. Raw API responses never reach the UI. */
export function errorMessageNotice(error: unknown, now = new Date(), locale?: string): { key: string; params: Record<string, string | number> } {
  const notice = freeErrorNotice(error, now, locale)
  if (notice) return notice
  if (error instanceof Error && /^API \d+\b/.test(error.message)) return { key: 'error.api', params: {} }
  return error instanceof Error && error.message ? { key: 'toast.fail', params: { msg: error.message.slice(0, 120) } } : { key: 'toast.unknown', params: {} }
}
