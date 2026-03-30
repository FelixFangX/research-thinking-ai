import { type FormEvent, useState } from 'react'
import { useI18n } from '../i18n'

export type AuthErrorCode = 'notFound' | 'wrongPw' | 'nameTooShort' | 'pwTooShort' | 'exists'

interface Props {
  onLogin: (username: string, password: string) => AuthErrorCode | null | Promise<AuthErrorCode | null>
  onRegister: (username: string, password: string, displayName: string) => AuthErrorCode | null | Promise<AuthErrorCode | null>
}

export function AuthGate({ onLogin, onRegister }: Props) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<AuthErrorCode | ''>('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    void (async () => {
      const err =
        mode === 'login'
          ? await onLogin(username, password)
          : await onRegister(username, password, displayName)
      if (err) setError(err)
    })()
  }

  return (
    <div className="auth-gate">
      <div className="auth-terminal">
        <div className="auth-chrome">
          <span className="auth-dots">
            <i /><i /><i />
          </span>
          <span className="auth-chrome-title">terminal@agent ~ auth</span>
        </div>
        <div className="auth-body">
          <pre className="auth-boot">{t('auth.boot')}</pre>
          <img src="/logo.svg" alt="" className="auth-logo-icon" width="48" height="48" />
          <h1 className="auth-logo">{t('auth.logo')}</h1>
          <p className="auth-sub">{t('auth.sub')}</p>
          <p className="auth-cursor">&gt; {mode === 'login' ? t('auth.prompt.login') : t('auth.prompt.register')}<span className="blink">_</span></p>

          <div className="auth-mode-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => { setMode('login'); setError('') }}
            >
              {t('auth.tab.login')}
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => { setMode('register'); setError('') }}
            >
              {t('auth.tab.register')}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <label className="auth-field">
                <span className="auth-prompt">{t('auth.displayName')}</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('auth.displayName.ph')}
                  autoComplete="name"
                />
              </label>
            )}
            <label className="auth-field">
              <span className="auth-prompt">{t('auth.username')}</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('auth.username.ph')}
                autoComplete="username"
                required
              />
            </label>
            <label className="auth-field">
              <span className="auth-prompt">{t('auth.password')}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </label>
            {error && (
              <p className="auth-error">
                {t('auth.error')} {t(`auth.err.${error}`)}
              </p>
            )}
            <button type="submit" className="auth-submit">
              {mode === 'login' ? t('auth.submit.login') : t('auth.submit.register')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
