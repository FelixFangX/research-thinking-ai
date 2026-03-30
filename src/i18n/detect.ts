import type { Locale } from './translations'

const CHINESE_REGIONS = ['CN', 'TW', 'HK', 'MO', 'SG']

export async function detectLocale(): Promise<Locale> {
  try {
    const res = await fetch('https://ipapi.co/json/', {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json()
    return CHINESE_REGIONS.includes(data.country_code) ? 'zh' : 'en'
  } catch {
    return navigator.language.startsWith('zh') ? 'zh' : 'en'
  }
}
