import { createContext } from 'react'
import type { Locale } from './translations'

export interface I18nCtx {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

export const I18nContext = createContext<I18nCtx>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
})
