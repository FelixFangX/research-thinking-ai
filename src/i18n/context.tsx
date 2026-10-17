import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { I18nContext } from './ctx'
import { resolveLocale } from './detect'
import { t as translate, type Locale } from './translations'

const LOCALE_KEY = 'copilot_locale'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveLocale)

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    const description = translate(locale, 'app.description')
    for (const [selector, content] of [
      ['meta[name="description"]', description],
      ['meta[property="og:title"]', translate(locale, 'app.title')],
      ['meta[property="og:description"]', description],
      ['meta[name="twitter:title"]', translate(locale, 'app.title')],
      ['meta[name="twitter:description"]', description],
    ]) document.querySelector(selector)?.setAttribute('content', content)
  }, [locale])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(LOCALE_KEY, l) } catch { /* Storage may be disabled. */ }
  }, [])

  const tFn = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale],
  )

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: tFn }}>
      {children}
    </I18nContext.Provider>
  )
}
