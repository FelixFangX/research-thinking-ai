import { t } from '../i18n/translations'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback" role="alert">
          <div className="error-boundary-icon" aria-hidden="true">!</div>
          <h2>{t('en', 'error.title')}</h2>
          <p className="muted">
            {this.state.error?.message || t('en', 'error.unknown')}
          </p>
          <div className="error-boundary-actions">
            <button className="btn btn-secondary" onClick={this.handleRetry} type="button">
              {t('en', 'error.retry')}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => window.location.reload()}
              type="button"
            >
              {t('en', 'error.reload')}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
