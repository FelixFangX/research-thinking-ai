import { useState } from 'react'
import { useI18n } from '../i18n'

const DISMISSED_KEY = 'copilot_onboarding_dismissed'

export function OnboardingBanner() {
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(DISMISSED_KEY) === '1',
  )

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem(DISMISSED_KEY, '1')
  }

  return (
    <div className="onboarding-banner animate-in" role="region" aria-label={t('ob.aria')}>
      <div className="onboarding-content">
        <div className="onboarding-icon" aria-hidden="true">&gt;</div>
        <div>
          <strong>{t('ob.title')}</strong>
          <p className="muted">
            {t('ob.desc')}
          </p>
        </div>
      </div>
      <button className="onboarding-close" onClick={handleDismiss} type="button" aria-label={t('cfg.close')}>
        [X]
      </button>
    </div>
  )
}
