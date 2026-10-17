import type { Locale } from './translations'

export function resolveLocale(): Locale {
  const query = new URLSearchParams(window.location.search).get('lang')
  if (query === 'en' || query === 'zh') {
    try { localStorage.setItem('copilot_locale', query) } catch { /* Storage may be disabled. */ }
    return query
  }
  try {
    const stored = localStorage.getItem('copilot_locale')
    if (stored === 'en' || stored === 'zh') return stored
  } catch { /* Storage may be disabled. */ }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export async function detectLocale(): Promise<Locale> { return resolveLocale() }
