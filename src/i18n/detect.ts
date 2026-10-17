import type { Locale } from './translations'

export async function detectLocale(): Promise<Locale> {
  return navigator.language.startsWith('zh') ? 'zh' : 'en'
}
