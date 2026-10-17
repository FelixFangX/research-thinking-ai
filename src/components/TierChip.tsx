import { useI18n } from '../i18n'

export function TierChip({ tier }: { tier: string }) {
  const { t } = useI18n()
  const level = Math.max(1, Math.min(3, Number(tier.replace(/\D/g, '')) || 3))
  return <span data-testid="tier-chip" className="tier-chip" aria-label={t('inst.tier', { n: level })}>
    <span>T{level}</span><span className="tier-leds" aria-hidden="true">{Array.from({ length: 3 }, (_, i) => <span key={i} className={`tier-led ${i < 4 - level ? 'filled' : ''}`} />)}</span>
  </span>
}
