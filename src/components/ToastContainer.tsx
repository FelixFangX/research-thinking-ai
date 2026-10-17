import { useI18n } from '../i18n'
import type { ToastItem } from '../hooks/useToast'

const ICONS: Record<string, string> = {
  success: '✓',
  info: 'ℹ',
  warning: '⚠',
  error: '✕',
}

interface Props {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: Props) {
  const { t: translate } = useI18n()
  if (toasts.length === 0) return null

  return (
    <div className="toast-container" aria-live="polite" aria-relevant="additions removals">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status">
          <span className="toast-icon" aria-hidden="true">{ICONS[t.type]}</span>
          <span className="toast-message">{t.message}</span>
          <button
            className="toast-close"
            onClick={() => onDismiss(t.id)}
            type="button"
            aria-label={translate('aria.dismiss')}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
