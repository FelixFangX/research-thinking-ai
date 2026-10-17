import { useI18n } from '../i18n'

/** Localize generated citation prose while preserving the upstream venue. */
export function EvidenceClaim({ claim }: { claim: string }) {
  const { locale } = useI18n()
  const match = /^Published in (.*?)( \(\d+\))?, cited (\d+)×\.( Highly cited\.)?$/.exec(claim)
  if (!match) return <span data-user-content>{claim}</span>
  const [, venue, year = '', count, highlyCited] = match
  return <>{locale === 'zh' ? '发表于 ' : 'Published in '}<span data-user-content>{venue}</span>{year}{locale === 'zh' ? `，引用 ${count} 次。` : `, cited ${count}×.`}{highlyCited ? (locale === 'zh' ? ' 高引用论文。' : ' Highly cited.') : ''}</>
}
