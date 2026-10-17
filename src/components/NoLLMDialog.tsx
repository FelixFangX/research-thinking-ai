import { useI18n } from '../i18n'

interface Props {
  onConfigure: () => void
  onMockPreview: () => void
  onCancel: () => void
}

export function NoLLMDialog({ onConfigure, onMockPreview, onCancel }: Props) {
  const { t } = useI18n()

  return (
    <div className="nollm-overlay" onClick={onCancel} role="dialog" aria-label={t('nollm.aria')}>
      <div className="nollm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nollm-chrome">
          <span className="nollm-title">{t('nollm.title')}</span>
        </div>
        <div className="nollm-body">
          <div className="nollm-icon" aria-hidden="true">⚠</div>
          <p className="nollm-desc">{t('nollm.desc')}</p>
          <div className="nollm-actions">
            <button className="btn btn-secondary" onClick={onConfigure} type="button">
              {t('nollm.configure')}
            </button>
            <button className="btn btn-ghost nollm-mock-btn" onClick={onMockPreview} type="button">
              {t('nollm.mock')}
            </button>
            <button className="btn btn-ghost" onClick={onCancel} type="button">
              {t('nollm.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
