import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { I18nContext } from './ctx'
import { detectLocale } from './detect'
import { t as translate, type Locale } from './translations'

const LOCALE_KEY = 'copilot_locale'

function loadLocale(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_KEY)
    if (v === 'zh' || v === 'en') return v
  } catch { /* noop */ }
  return null
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => loadLocale() ?? 'en')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current || loadLocale()) return
    ran.current = true
    detectLocale().then((l) => {
      setLocaleState(l)
      localStorage.setItem(LOCALE_KEY, l)
    })
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    localStorage.setItem(LOCALE_KEY, l)
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
