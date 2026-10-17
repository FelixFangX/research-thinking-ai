import { useCallback, useState } from 'react'
import { API_DEFAULTS, MODEL_DEFAULTS } from '../hooks/useSettings'
import { isPersistEnabled, setPersistEnabled, saveApiKey } from '../lib/keyVault'
import { FREE_MODELS } from '../lib/quota'
import { testConnection } from '../llm'
import { useI18n } from '../i18n'
import type { ApiProvider, AppSettings, ParticipationMode } from '../types'

interface Props {
  models?: typeof FREE_MODELS
  settings: AppSettings
  userId: string
  onUpdate: (partial: Partial<AppSettings>) => void
  onReset: () => void
  onClose: () => void
}

export function SettingsPanel({ models = FREE_MODELS, settings, userId, onUpdate, onReset, onClose }: Props) {
  const { t, locale, setLocale } = useI18n()
  const [showKey, setShowKey] = useState(false)
  const [persist, setPersist] = useState(() => isPersistEnabled())
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')

  const handleTestConnection = useCallback(async () => {
    if (!settings.apiKey) return
    setTestStatus('testing')
    const result = await testConnection({
      provider: settings.apiProvider,
      baseUrl: settings.apiBaseUrl,
      apiKey: settings.apiKey,
      model: settings.apiModel,
    })
    setTestStatus(result.ok ? 'ok' : 'fail')
    setTestMsg(result.message)
    setTimeout(() => setTestStatus('idle'), 4000)
  }, [settings.apiProvider, settings.apiBaseUrl, settings.apiKey, settings.apiModel])

  const handleProviderChange = (p: ApiProvider) => {
    onUpdate({ apiProvider: p, apiBaseUrl: API_DEFAULTS[p], apiModel: MODEL_DEFAULTS[p] })
  }

  return (
    <div className="settings-overlay" onClick={onClose} role="dialog" aria-label={t('cfg.aria')}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-chrome">
          <span className="settings-title">{t('cfg.title')}</span>
          <button className="settings-close" onClick={onClose} type="button" aria-label={t('cfg.close')}>
            [X]
          </button>
        </div>
        <div className="settings-body">
          <section className="settings-section">
            <h3>{t('cfg.engine')}</h3>
            <fieldset>
              <legend className="settings-label">{t('cfg.engine')}</legend>
              <label><input type="radio" name="engine" checked={settings.apiProvider === 'free'} onChange={() => handleProviderChange('free')} />{t('cfg.free')}</label>
              <label><input type="radio" name="engine" checked={settings.apiProvider !== 'free'} onChange={() => handleProviderChange('openai')} />{t('cfg.advanced')}</label>
            </fieldset>
            {settings.apiProvider === 'free' && <>
              <label className="settings-field"><span>{t('cfg.model')}</span>
                <select value={settings.apiModel} onChange={e => onUpdate({ apiModel: e.target.value })}>
                  {models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
                </select>
              </label>
              <p className="muted">{t('cfg.freeNote')}</p>
            </>}
            <details key={settings.apiProvider === 'free' ? 'free' : 'advanced'}>
              <summary>{t('cfg.advanced')}</summary>
              <p className="muted">{t('cfg.keyPrivacy')}</p>
              {settings.apiProvider !== 'free' && <>
                <div className="settings-row">
                  <span className="settings-label">{t('cfg.provider')}</span>
                  <div className="scheme-grid">
                    <button
                      type="button"
                      className={`scheme-btn ${settings.apiProvider === 'openai' ? 'active' : ''}`}
                      onClick={() => handleProviderChange('openai')}
                    >
                      OPENAI
                    </button>
                    <button
                      type="button"
                      className={`scheme-btn ${settings.apiProvider === 'anthropic' ? 'active' : ''}`}
                      onClick={() => handleProviderChange('anthropic')}
                    >
                      ANTHROPIC
                    </button>
                    <button
                      type="button"
                      className={`scheme-btn ${settings.apiProvider === 'minimax' ? 'active' : ''}`}
                      onClick={() => handleProviderChange('minimax')}
                    >
                      MINIMAX
                    </button>
                  </div>
                </div>
                <label className="settings-field">
                  <span className="settings-label">{t('cfg.model')}</span>
                  <input
                    type="text"
                    value={settings.apiModel}
                    onChange={(e) => onUpdate({ apiModel: e.target.value })}
                    placeholder={MODEL_DEFAULTS[settings.apiProvider]}
                  />
                </label>
                <label className="settings-field">
                  <span className="settings-label">{t('cfg.baseUrl')}</span>
                  <input
                    type="text"
                    value={settings.apiBaseUrl}
                    onChange={(e) => onUpdate({ apiBaseUrl: e.target.value })}
                    placeholder={API_DEFAULTS[settings.apiProvider]}
                  />
                  <span className="muted">
                    {settings.apiProvider === 'openai'
                      ? t('cfg.baseUrl.openai')
                      : t('cfg.baseUrl.anthropic')}
                  </span>
                </label>
                <label className="settings-field">
                  <span className="settings-label">{t('cfg.apiKey')}</span>
                  <div className="api-key-row">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={settings.apiKey}
                      onChange={(e) => {
                        const val = e.target.value
                        onUpdate({ apiKey: val })
                        void saveApiKey(val, userId)
                      }}
                      placeholder={settings.apiProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                    />
                    <button
                      type="button"
                      className="pixel-toggle"
                      onClick={() => setShowKey((v) => !v)}
                    >
                      {showKey ? '[HIDE]' : '[SHOW]'}
                    </button>
                  </div>
                  {settings.apiKey ? (
                    <span className="api-key-status">
                      {(settings.apiProvider === 'openai' && settings.apiKey.startsWith('sk-')) ||
                      (settings.apiProvider === 'anthropic' && settings.apiKey.startsWith('sk-ant-')) ||
                      (settings.apiProvider === 'minimax' && settings.apiKey.length > 8)
                        ? t('cfg.keyOk')
                        : t('cfg.keyBad')}
                    </span>
                  ) : (
                    <span className="muted">{t('cfg.keyEmpty')}</span>
                  )}
                </label>
                {settings.apiKey && (
                  <div className="api-test-row">
                    <button
                      type="button"
                      className={`btn btn-ghost api-test-btn ${testStatus === 'ok' ? 'test-ok' : ''} ${testStatus === 'fail' ? 'test-fail' : ''}`}
                      onClick={() => void handleTestConnection()}
                      disabled={testStatus === 'testing'}
                    >
                      {testStatus === 'testing' ? t('cfg.testing') : testStatus === 'ok' ? t('cfg.testOk') : testStatus === 'fail' ? t('cfg.testFail') : t('cfg.testBtn')}
                    </button>
                    {testStatus === 'fail' && testMsg && (
                      <span className="muted api-test-msg">{testMsg}</span>
                    )}
                  </div>
                )}
                <label className="settings-toggle">
                  <span>{t('cfg.rememberKey')}</span>
                  <button
                    type="button"
                    className={`pixel-toggle ${persist ? 'on' : ''}`}
                    onClick={() => {
                      const next = !persist
                      setPersist(next)
                      setPersistEnabled(next)
                      if (next && settings.apiKey) void saveApiKey(settings.apiKey, userId)
                    }}
                    aria-pressed={persist}
                  >
                    {persist ? '[ON ]' : '[OFF]'}
                  </button>
                </label>
                <span className="muted">{t('cfg.rememberKey.desc')}</span>
              </>}
            </details>
          </section>

          <section className="settings-section">
            <h3>{t('cfg.defaults')}</h3>
            <div className="settings-row">
              <span className="settings-label">{t('cfg.partMode')}</span>
              <div className="scheme-grid">
                {(['high', 'low'] as ParticipationMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`scheme-btn ${settings.defaultMode === m ? 'active' : ''}`}
                    onClick={() => onUpdate({ defaultMode: m })}
                  >
                    {m === 'high' ? 'HIGH' : 'LOW'}
                  </button>
                ))}
              </div>
            </div>
            <label className="settings-toggle">
              <span>{t('cfg.complexHint')}</span>
              <select
                value={settings.defaultComplexity}
                onChange={(e) => onUpdate({ defaultComplexity: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="settings-toggle">
              <span>{t('cfg.timeline')}</span>
              <input
                type="number"
                min={1}
                max={52}
                value={settings.defaultTimelineWeeks}
                onChange={(e) => onUpdate({ defaultTimelineWeeks: Number(e.target.value) || 8 })}
              />
            </label>
          </section>

          <section className="settings-section">
            <h3>{t('cfg.language')}</h3>
            <div className="settings-row">
              <span className="settings-label">Language</span>
              <div className="scheme-grid">
                <button
                  type="button"
                  className={`scheme-btn ${locale === 'zh' ? 'active' : ''}`}
                  onClick={() => setLocale('zh')}
                >
                  中文
                </button>
                <button
                  type="button"
                  className={`scheme-btn ${locale === 'en' ? 'active' : ''}`}
                  onClick={() => setLocale('en')}
                >
                  English
                </button>
              </div>
            </div>
          </section>
        </div>
        <div className="settings-footer">
          <button className="btn btn-ghost" type="button" onClick={onReset}>{t('cfg.reset')}</button>
          <button className="btn btn-primary" type="button" onClick={onClose}>{t('cfg.done')}</button>
        </div>
      </div>
    </div>
  )
}
