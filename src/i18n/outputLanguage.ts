import type { Locale } from './translations'

export function outputLanguage(interest: string, locale: Locale): Locale {
  if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(interest)) return 'zh'
  return /[a-z]/i.test(interest) ? 'en' : locale
}

export function outputLanguageInstruction(interest: string, locale: Locale): string {
  return outputLanguage(interest, locale) === 'zh'
    ? 'Output language: Simplified Chinese. Write all user-facing JSON values and analysis in natural Simplified Chinese. Preserve code, identifiers, URLs, and external source titles.'
    : 'Output language: English. Write all user-facing JSON values and analysis in English, using no CJK characters or full-width punctuation. Preserve code, identifiers, URLs, and external source titles.'
}
