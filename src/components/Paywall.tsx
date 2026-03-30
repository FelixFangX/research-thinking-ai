import { useI18n } from '../i18n'

export type PlanTier = 'free' | 'pro'

interface Props {
  currentPlan: PlanTier
  onUpgrade: () => void
  onClose: () => void
}

export function Paywall({ currentPlan, onUpgrade, onClose }: Props) {
  const { t } = useI18n()

  return (
    <div className="paywall-overlay" onClick={onClose} role="dialog" aria-label={t('pay.aria')}>
      <div className="paywall-modal" onClick={(e) => e.stopPropagation()}>
        <div className="paywall-chrome">
          <span className="paywall-title">{t('pay.title')}</span>
          <button className="settings-close" onClick={onClose} type="button" aria-label={t('cfg.close')}>
            [X]
          </button>
        </div>
        <div className="paywall-body">
          <p className="paywall-desc">{t('pay.desc')}</p>

          <div className="paywall-plans">
            <div className={`paywall-plan ${currentPlan === 'free' ? 'current' : ''}`}>
              <div className="plan-badge">{t('pay.free')}</div>
              <div className="plan-price">$0</div>
              <div className="plan-period">{t('pay.forever')}</div>
              <ul className="plan-features">
                <li className="included">{t('pay.f.pipeline')}</li>
                <li className="included">{t('pay.f.mock')}</li>
                <li className="included">{t('pay.f.history')}</li>
                <li className="included">{t('pay.f.i18n')}</li>
                <li className="included">{t('pay.f.theme')}</li>
                <li className="excluded">{t('pay.f.export')}</li>
                <li className="excluded">{t('pay.f.pdf')}</li>
                <li className="excluded">{t('pay.f.unlimited')}</li>
                <li className="excluded">{t('pay.f.priority')}</li>
              </ul>
              {currentPlan === 'free' && (
                <div className="plan-current-tag">{t('pay.current')}</div>
              )}
            </div>

            <div className={`paywall-plan pro ${currentPlan === 'pro' ? 'current' : ''}`}>
              <div className="plan-badge pro-badge">{t('pay.pro')}</div>
              <div className="plan-price">$9.99</div>
              <div className="plan-period">{t('pay.monthly')}</div>
              <ul className="plan-features">
                <li className="included">{t('pay.p.all_free')}</li>
                <li className="included highlight">{t('pay.f.export')}</li>
                <li className="included highlight">{t('pay.f.pdf')}</li>
                <li className="included highlight">{t('pay.f.unlimited')}</li>
                <li className="included highlight">{t('pay.f.priority')}</li>
                <li className="included highlight">{t('pay.p.compare')}</li>
                <li className="included highlight">{t('pay.p.team')}</li>
              </ul>
              {currentPlan === 'pro' ? (
                <div className="plan-current-tag">{t('pay.current')}</div>
              ) : (
                <button className="plan-upgrade-btn" onClick={onUpgrade} type="button">
                  {t('pay.upgrade')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
