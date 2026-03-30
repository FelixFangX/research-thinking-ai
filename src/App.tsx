import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { track } from './analytics'
import {
  API_SKETCH,
  getAiKpis,
  getJourney,
  getPersonas,
  getProductKpis,
  getReleasePlan,
  getSecurityControls,
  getServiceBlueprint,
  getUxDeliverables,
} from './blueprint'
import { AuthGate } from './components/AuthGate'
import { BootScreen } from './components/BootScreen'
import { EmptyState } from './components/EmptyState'
import { NoLLMDialog } from './components/NoLLMDialog'
import { IterationTracker } from './components/IterationTracker'
import { OnboardingBanner } from './components/OnboardingBanner'
import { Paywall, type PlanTier } from './components/Paywall'
import { SettingsPanel } from './components/SettingsPanel'
import { StreamPanel } from './components/StreamPanel'
import { Tour, type TourStep } from './components/Tour'
import { ShareExport } from './components/ShareExport'
import { ToastContainer } from './components/ToastContainer'
import {
  createDefaultInput,
  formatArchitecture,
  formatMode,
  getDefaultWeights,
  runTopicAgentWithProgress,
} from './engine'
import { clearApiKey, loadApiKey } from './lib/keyVault'
import { useI18n } from './i18n'
import { useAuth } from './hooks/useAuth'
import { useHistory } from './hooks/useHistory'
import { useIteration } from './hooks/useIteration'
import { useSettings } from './hooks/useSettings'
import { useToast } from './hooks/useToast'
import type {
  AgentRunResult,
  DecisionWeights,
  ParticipationMode,
  PipelineStageProgress,
  TopicInput,
} from './types'
import './App.css'

type WeightKey = keyof DecisionWeights
type DashboardView = 'workspace' | 'product' | 'ops'

function mergeStage(
  previous: PipelineStageProgress[],
  update: PipelineStageProgress,
): PipelineStageProgress[] {
  return previous.map((item) => (item.id === update.id ? update : item))
}

function App() {
  const { locale, setLocale, t } = useI18n()

  const TOUR_STEPS: TourStep[] = useMemo(() => [
    { target: '.topbar', title: t('tour.1.t'), content: t('tour.1.c'), placement: 'bottom' as const },
    { target: '#btn-lang', title: t('tour.2.t'), content: t('tour.2.c'), placement: 'bottom' as const },
    { target: '#btn-theme', title: t('tour.3.t'), content: t('tour.3.c'), placement: 'bottom' as const },
    { target: '#btn-cfg', title: t('tour.4.t'), content: t('tour.4.c'), placement: 'bottom' as const },
    { target: '.mode-switch', title: t('tour.5.t'), content: t('tour.5.c'), placement: 'bottom' as const },
    { target: '.input-form', title: t('tour.6.t'), content: t('tour.6.c') },
    { target: '.input-form .btn-primary', title: t('tour.7.t'), content: t('tour.7.c'), placement: 'top' as const },
  ], [t])

  const STAGE_TEMPLATE: PipelineStageProgress[] = useMemo(() => [
    { id: 'retrieve' as const, name: t('stg.retrieve'), status: 'idle' as const, detail: t('stg.idle'), progress: 0 },
    { id: 'map' as const, name: t('stg.map'), status: 'idle' as const, detail: t('stg.idle'), progress: 0 },
    { id: 'compare' as const, name: t('stg.compare'), status: 'idle' as const, detail: t('stg.idle'), progress: 0 },
    { id: 'converge' as const, name: t('stg.converge'), status: 'idle' as const, detail: t('stg.idle'), progress: 0 },
  ], [t])

  const { user, isAuthenticated, login, register, logout } = useAuth()
  const { settings, updateSettings, resetSettings } = useSettings()
  const { toasts, toast, dismiss: dismissToast } = useToast()

  const [view, setView] = useState<DashboardView>('workspace')
  const [showSettings, setShowSettings] = useState(false)
  const tourKey = user ? `copilot_guide_completed_${user.id}` : null
  const [tourDismissed, setTourDismissed] = useState(false)
  const showTour = !tourDismissed && !!tourKey && (typeof window === 'undefined' || localStorage.getItem(tourKey) !== '1')
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])
  const mockRef = useRef(false)
  const [input, setInput] = useState<TopicInput>(() => {
    const base = createDefaultInput(locale)
    return {
      ...base,
      participationMode: settings.defaultMode,
      complexityHint: settings.defaultComplexity,
      expectedTimelineWeeks: settings.defaultTimelineWeeks,
      decisionWeights: getDefaultWeights(settings.defaultMode),
    }
  })
  const [result, setResult] = useState<AgentRunResult | null>(null)
  const [pipeline, setPipeline] = useState<PipelineStageProgress[]>(STAGE_TEMPLATE)
  const [streamTexts, setStreamTexts] = useState<Record<string, string>>({})
  const [thinkingTexts, setThinkingTexts] = useState<Record<string, string>>({})
  const { records: history, addRecord: addHistory } = useHistory(user?.id ?? '')
  const [overridePathId, setOverridePathId] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({})
  const [isAccepted, setIsAccepted] = useState(false)
  const [iterView, setIterView] = useState(false)
  const [previousResult, setPreviousResult] = useState<AgentRunResult | null>(null)
  const iteration = useIteration(user?.id ?? '')
  const [booted, setBooted] = useState(() => sessionStorage.getItem('rta_booted') === '1')
  const handleBootComplete = useCallback(() => {
    sessionStorage.setItem('rta_booted', '1')
    setBooted(true)
  }, [])
  const [showNoLLM, setShowNoLLM] = useState(false)
  const [plan, setPlan] = useState<PlanTier>(() => {
    if (typeof window === 'undefined') return 'free'
    return (localStorage.getItem('copilot_plan') as PlanTier) ?? 'free'
  })
  const [showPaywall, setShowPaywall] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    return (localStorage.getItem('copilot_theme') as 'light' | 'dark') ?? 'light'
  })
  const hasTrackedView = useRef(false)
  const autoScrollRef = useRef(true)
  const lastScrollY = useRef(0)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('copilot_theme', theme)
  }, [theme])

  useEffect(() => {
    if (hasTrackedView.current) return
    hasTrackedView.current = true
    track('topic_agent_page_viewed')
  }, [])

  useEffect(() => {
    if (!user) return
    loadApiKey(user.id).then((key) => {
      if (key) updateSettings({ apiKey: key })
    })
  }, [user, updateSettings])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '1') { e.preventDefault(); setView('workspace') }
        if (e.key === '2') { e.preventDefault(); setView('product') }
        if (e.key === '3') { e.preventDefault(); setView('ops') }
      }
      if (e.key === 'Escape') setShowSettings(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const onWheel = () => { autoScrollRef.current = false }
    const onTouchMove = () => { autoScrollRef.current = false }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchmove', onTouchMove)
    }
  }, [])

  useEffect(() => {
    if (!autoScrollRef.current) return
    const y = document.documentElement.scrollHeight
    if (y !== lastScrollY.current) {
      lastScrollY.current = y
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }, [pipeline, streamTexts, thinkingTexts])

  const handleTourComplete = useCallback(() => {
    if (tourKey) localStorage.setItem(tourKey, '1')
    setTourDismissed(true)
  }, [tourKey])

  const onStream = useCallback((stageId: string, text: string) => {
    setStreamTexts((prev) => ({ ...prev, [stageId]: text }))
  }, [])

  const onThinking = useCallback((stageId: string, text: string) => {
    setThinkingTexts((prev) => ({ ...prev, [stageId]: text }))
  }, [])

  const runMutation = useMutation({
    mutationFn: async (payload: TopicInput) => {
      setPipeline(STAGE_TEMPLATE)
      setStreamTexts({})
      setThinkingTexts({})
      const s = settingsRef.current
      const llmCfg = mockRef.current
        ? null
        : s.apiKey
          ? { provider: s.apiProvider, baseUrl: s.apiBaseUrl, apiKey: s.apiKey, model: s.apiModel }
          : null
      return runTopicAgentWithProgress(
        payload,
        (update) => {
          setPipeline((prev) => mergeStage(prev, update))
        },
        onStream,
        locale,
        llmCfg,
        onThinking,
      )
    },
    onMutate: (payload) => {
      toast('info', t('toast.start'))
      track('topic_agent_run_started', {
        participation_mode: payload.participationMode,
        timeline_weeks: payload.expectedTimelineWeeks,
        complexity_hint: payload.complexityHint,
      })
    },
    onSuccess: (agentResult, payload) => {
      mockRef.current = false
      setResult(agentResult)
      setOverridePathId('')
      setOverrideNote('')
      setIsAccepted(false)
      setView('workspace')

      const checks: Record<string, boolean> = {}
      agentResult.recommendation.manualConfirmations.forEach((item) => {
        checks[item] = false
      })
      setManualChecks(checks)

      const topPath = agentResult.candidates[0]
      if (topPath) {
        void addHistory({
          id: crypto.randomUUID(),
          userId: user?.id ?? '',
          createdAt: new Date().toISOString(),
          interest: payload.researchInterest,
          mode: payload.participationMode,
          complexityScore: agentResult.complexity.score,
          architecture: agentResult.architecture.mode,
          selectedPathId: topPath.id,
          confidence: topPath.confidence,
          fullResult: agentResult,
          fullInput: payload,
        })
      }

      toast('success', t('toast.done', { name: topPath?.name ?? 'N/A' }))
      track('candidate_shortlist_generated', {
        candidate_count: agentResult.candidates.length,
        architecture_mode: agentResult.architecture.mode,
      })
      track('topic_agent_run_completed', {
        architecture_mode: agentResult.architecture.mode,
        complexity_score: agentResult.complexity.score,
        selected_path: agentResult.recommendation.selectedPathId,
        participation_mode: payload.participationMode,
      })
    },
    onError: (err) => {
      mockRef.current = false
      setPipeline((prev) =>
        prev.map((item) => ({
          ...item,
          status: item.status === 'done' ? 'done' : 'error',
          detail: item.status === 'done' ? item.detail : t('toast.stageFail'),
        })),
      )
      const msg = err instanceof Error ? err.message : t('toast.unknown')
      toast('error', t('toast.fail', { msg: msg.slice(0, 120) }))
      track('topic_agent_run_failed')
    },
  })

  const selectedPath = useMemo(() => {
    if (!result) return null
    const pathId = overridePathId || result.recommendation.selectedPathId
    return result.candidates.find((item) => item.id === pathId) ?? result.candidates[0] ?? null
  }, [overridePathId, result])

  const unresolvedConflicts = useMemo(
    () => result?.evidence.filter((item) => item.conflictsWith.length > 0) ?? [],
    [result],
  )

  const pipelineProgress = useMemo(() => {
    if (pipeline.length === 0) return 0
    return Math.round(pipeline.reduce((acc, item) => acc + item.progress, 0) / pipeline.length)
  }, [pipeline])

  const manualReady = useMemo(() => {
    if (input.participationMode === 'low') return true
    const values = Object.values(manualChecks)
    if (values.length === 0) return false
    return values.every(Boolean)
  }, [input.participationMode, manualChecks])

  const updateField = <K extends keyof TopicInput>(field: K, value: TopicInput[K]): void => {
    setInput((prev) => ({ ...prev, [field]: value }))
  }

  const updateWeight = (field: WeightKey, value: number): void => {
    setInput((prev) => ({
      ...prev,
      decisionWeights: { ...prev.decisionWeights, [field]: value },
    }))
  }

  const handleModeChange = (mode: ParticipationMode): void => {
    setInput((prev) => ({
      ...prev,
      participationMode: mode,
      decisionWeights: getDefaultWeights(mode),
    }))
    track('participation_mode_selected', { mode })
  }

  const doRun = useCallback((useMock?: boolean) => {
    setResult(null)
    setPipeline(STAGE_TEMPLATE)
    setStreamTexts({})
    setThinkingTexts({})
    setOverridePathId('')
    setOverrideNote('')
    setIsAccepted(false)
    setManualChecks({})
    autoScrollRef.current = true
    if (useMock) {
      mockRef.current = true
    }
    runMutation.mutate(input)
  }, [input, runMutation, STAGE_TEMPLATE])

  const handleRun = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const s = settingsRef.current
    if (!s.apiKey) {
      setShowNoLLM(true)
      return
    }
    doRun()
  }

  const toggleGate = (gate: string): void => {
    setManualChecks((prev) => {
      const nextValue = !prev[gate]
      track('manual_gate_toggled', { gate_name: gate, is_checked: nextValue })
      return { ...prev, [gate]: nextValue }
    })
  }

  const handleCorrection = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!result || !overridePathId) return
    toast('info', t('toast.override', { id: overridePathId }))
    track('recommendation_overridden', {
      from_path: result.recommendation.selectedPathId,
      to_path: overridePathId,
      has_note: overrideNote.trim().length > 0,
    })
  }

  const handleAccept = (): void => {
    if (!selectedPath || !result) return
    if (!manualReady) {
      toast('warning', t('toast.gateWarn'))
      track('accept_blocked_manual_gate')
      return
    }
    setIsAccepted(true)
    void iteration.create(input, result)
    setIterView(true)
    toast('success', t('iter.toastCreated'))
    track('recommendation_accepted', {
      path_id: selectedPath.id,
      confidence: selectedPath.confidence,
      score: selectedPath.score,
    })
    track('topic_flow_completed', {
      path_id: selectedPath.id,
      participation_mode: input.participationMode,
    })
  }

  const handleRerun = (): void => {
    setPreviousResult(result)
    setIterView(false)
    setIsAccepted(false)
    runMutation.mutate(input)
  }

  const handleIterBack = (): void => {
    setIterView(false)
  }

  const handleIterComplete = (planId: string): void => {
    void iteration.setStatus(planId, 'completed')
    toast('success', t('iter.toastCompleted'))
    setIterView(false)
  }

  const handleIterAbandon = (planId: string): void => {
    void iteration.setStatus(planId, 'abandoned')
    toast('info', t('iter.toastAbandoned'))
    setIterView(false)
  }

  const handleToast = useCallback(
    (type: 'success' | 'info' | 'error', message: string) => { toast(type, message) },
    [toast],
  )

  if (!isAuthenticated) {
    return (
      <>
        {!booted && <BootScreen onComplete={handleBootComplete} />}
        {booted && (
          <>
            <div className="auth-toolbar">
              <button
                className="settings-btn"
                onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
                type="button"
                aria-label="Switch language"
              >
                {locale === 'zh' ? '[EN]' : '[中]'}
              </button>
              <button
                className="settings-btn"
                onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
                type="button"
                aria-label={theme === 'light' ? t('cfg.theme.dark') : t('cfg.theme.light')}
              >
                {theme === 'light' ? '[◐]' : '[◑]'}
              </button>
            </div>
            <AuthGate onLogin={login} onRegister={register} />
          </>
        )}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar panel">
        <div className="topbar-left">
          <span className="badge">
            <span className="badge-dot" aria-hidden="true" />
            {t('app.badge')}
          </span>
          <h1>{t('app.title')}</h1>
          <p className="muted">
            {t('app.subtitle')}
          </p>
        </div>
        <div className="topbar-right">
          <nav className="tabs" role="tablist" aria-label={t('aria.nav')}>
            <button
              type="button"
              role="tab"
              className={view === 'workspace' ? 'tab active' : 'tab'}
              aria-selected={view === 'workspace'}
              onClick={() => { setView('workspace'); track('dashboard_view_changed', { view: 'workspace' }) }}
            >
              WORKSPACE
            </button>
            <button
              type="button"
              role="tab"
              className={view === 'product' ? 'tab active' : 'tab'}
              aria-selected={view === 'product'}
              onClick={() => { setView('product'); track('dashboard_view_changed', { view: 'product' }) }}
            >
              PRODUCT
            </button>
            <button
              type="button"
              role="tab"
              className={view === 'ops' ? 'tab active' : 'tab'}
              aria-selected={view === 'ops'}
              onClick={() => { setView('ops'); track('dashboard_view_changed', { view: 'ops' }) }}
            >
              OPS
            </button>
          </nav>
          <div className="user-info">
            <span className="user-info-name">{user?.displayName}</span>
          </div>
          <button
            id="btn-lang"
            className="settings-btn"
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
            type="button"
            aria-label="Switch language"
          >
            {locale === 'zh' ? '[EN]' : '[中]'}
          </button>
          <button
            id="btn-theme"
            className="settings-btn"
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            type="button"
            aria-label={theme === 'light' ? t('cfg.theme.dark') : t('cfg.theme.light')}
          >
            {theme === 'light' ? '[◐]' : '[◑]'}
          </button>
          <button
            id="btn-cfg"
            className="settings-btn"
            onClick={() => setShowSettings(true)}
            type="button"
            aria-label={t('aria.settings')}
          >
            [CFG]
          </button>
          <button className="logout-btn" onClick={() => { clearApiKey(); logout() }} type="button" aria-label={t('aria.logout')}>
            [EXIT]
          </button>
        </div>
      </header>

      <section className="layout">
        <aside className="panel sidebar" aria-label={t('aria.sidebar')}>
          <h2>{t('sidebar.log')}</h2>
          <p className="muted">{t('sidebar.logDesc')}</p>
          {history.length === 0 ? (
            <EmptyState
              icon=">"
              title={t('sidebar.empty.title')}
              description={t('sidebar.empty.desc')}
            />
          ) : (
            <ul className="history-list">
              {history.map((item) => (
                <li
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  title={t('sidebar.viewDetail')}
                  onClick={() => {
                    if (item.fullResult) {
                      setResult(item.fullResult)
                      if (item.fullInput) setInput(item.fullInput)
                      setOverridePathId('')
                      setOverrideNote('')
                      setIsAccepted(false)
                      const checks: Record<string, boolean> = {}
                      item.fullResult.recommendation.manualConfirmations.forEach((c) => { checks[c] = false })
                      setManualChecks(checks)
                      setIterView(false)
                      setView('workspace')
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      ;(e.target as HTMLElement).click()
                    }
                  }}
                >
                  <strong>{item.interest.slice(0, 20)}</strong>
                  <div className="muted">
                    {formatMode(item.mode, locale).slice(0, 4)} // {item.complexityScore} // {formatArchitecture(item.architecture, locale)}
                  </div>
                  <div className="muted">
                    PATH {item.selectedPathId} // CONF {item.confidence}%
                  </div>
                  <div className="muted" style={{ fontSize: 'var(--font-xs)' }}>
                    {new Date(item.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {iteration.activePlan && (
            <button
              type="button"
              className="btn btn-primary sidebar-iter-btn"
              onClick={() => { setView('workspace'); setIterView(true) }}
            >
              {t('iter.status.active')}: {iteration.activePlan.pathName.slice(0, 16)}
            </button>
          )}

          <h3>{t('sidebar.pipeline')}</h3>
          <div className="progress-bar" role="progressbar" aria-valuenow={pipelineProgress} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${pipelineProgress}%` }} />
          </div>
          <div className="small-hint">{pipelineProgress}%</div>
          <div className="pipeline-list">
            {pipeline.map((item) => (
              <div key={item.id} className={`pipeline-item status-${item.status}`}>
                <div className="pipeline-title">
                  <span>{item.name}</span>
                  <span>{item.progress}%</span>
                </div>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>

          <h3>{t('sidebar.events')}</h3>
          <ul className="analytics-list">
            <li>run_started</li>
            <li>shortlist_generated</li>
            <li>overridden</li>
            <li>accepted</li>
            <li>flow_completed</li>
          </ul>
        </aside>

        <section className="content" role="tabpanel">
          {view === 'workspace' && iterView && iteration.activePlan && (
            <IterationTracker
              plan={iteration.activePlan}
              currentResult={result}
              previousResult={previousResult}
              onToggleDay={iteration.toggleDay}
              onAddJournal={iteration.addJournal}
              onComplete={handleIterComplete}
              onAbandon={handleIterAbandon}
              onRerun={handleRerun}
              onBack={handleIterBack}
            />
          )}

          {view === 'workspace' && !iterView && (
            <>
              <OnboardingBanner />

              <section className="panel animate-in" id="sec-input">
                <h2>{t('ws.title')}</h2>
                <p className="muted">{t('ws.desc')}</p>
                <form className="input-form" onSubmit={handleRun}>
                  <div className="mode-switch">
                    <button
                      type="button"
                      className={input.participationMode === 'high' ? 'mode active' : 'mode'}
                      onClick={() => handleModeChange('high')}
                      aria-pressed={input.participationMode === 'high'}
                    >
                      {t('ws.mode.high')}
                    </button>
                    <button
                      type="button"
                      className={input.participationMode === 'low' ? 'mode active' : 'mode'}
                      onClick={() => handleModeChange('low')}
                      aria-pressed={input.participationMode === 'low'}
                    >
                      {t('ws.mode.low')}
                    </button>
                  </div>

                  <label>
                    {t('ws.interest')}
                    <textarea
                      value={input.researchInterest}
                      onChange={(e) => updateField('researchInterest', e.target.value)}
                      rows={2}
                      placeholder={t('ws.interest.ph')}
                    />
                  </label>
                  <label>
                    {t('ws.domain')}
                    <input
                      value={input.problemDomain}
                      onChange={(e) => updateField('problemDomain', e.target.value)}
                      placeholder={t('ws.domain.ph')}
                    />
                  </label>
                  <label>
                    {t('ws.idea')}
                    <textarea
                      value={input.seedIdea}
                      onChange={(e) => updateField('seedIdea', e.target.value)}
                      rows={3}
                      placeholder={t('ws.idea.ph')}
                    />
                  </label>
                  <label>
                    {t('ws.constraints')}
                    <textarea
                      value={input.constraints}
                      onChange={(e) => updateField('constraints', e.target.value)}
                      rows={2}
                      placeholder={t('ws.constraints.ph')}
                    />
                  </label>

                  <div className="grid-two">
                    <label>
                      {t('ws.timeline')}
                      <input
                        type="number"
                        min={1}
                        max={52}
                        value={input.expectedTimelineWeeks}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          updateField('expectedTimelineWeeks', Number.isNaN(v) ? 8 : v)
                        }}
                      />
                    </label>
                    <label>
                      {t('ws.complexity')}
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={input.complexityHint}
                        onChange={(e) => updateField('complexityHint', Number(e.target.value))}
                      />
                      <div className="small-hint">{t('ws.level', { n: input.complexityHint })}</div>
                    </label>
                  </div>

                  <h3>{t('ws.weights')}</h3>
                  <div className="weights">
                    {(
                      [
                        ['novelty', t('w.novelty')],
                        ['feasibility', t('w.feasibility')],
                        ['impact', t('w.impact')],
                        ['riskControl', t('w.risk')],
                        ['evidence', t('w.evidence')],
                      ] as Array<[WeightKey, string]>
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <span>{input.decisionWeights[key]}</span>
                        <input
                          type="range"
                          min={5}
                          max={40}
                          value={input.decisionWeights[key]}
                          onChange={(e) => updateWeight(key, Number(e.target.value))}
                        />
                      </label>
                    ))}
                  </div>

                  <button className="btn btn-primary" type="submit" disabled={runMutation.isPending}>
                    {runMutation.isPending ? t('ws.running') : t('ws.run')}
                  </button>
                </form>
              </section>

              <StreamPanel pipeline={pipeline} streamTexts={streamTexts} thinkingTexts={thinkingTexts} />

              {result && (
                <>
                  <section className="panel" id="sec-arch">
                    <div className="section-header">
                      <h2>{t('r.arch')}</h2>
                      <ShareExport input={input} result={result} onToast={handleToast} plan={plan} onPaywall={() => setShowPaywall(true)} />
                    </div>
                    <div className="result-grid">
                      <article>
                        <h3>{t('r.complexity')}</h3>
                        <p className="big">{result.complexity.score}</p>
                        <p className="muted">{result.complexity.level.toUpperCase()}</p>
                        <ul>
                          {result.complexity.rationale.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </article>
                      <article>
                        <h3>{t('r.architecture')}</h3>
                        <p className="big">{formatArchitecture(result.architecture.mode, locale)}</p>
                        <p className="muted">{result.architecture.reason}</p>
                        <ul>
                          {result.architecture.modules.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      </article>
                      <article>
                        <h3>{t('r.interaction')}</h3>
                        <p className="big">{formatMode(input.participationMode, locale)}</p>
                        <p className="muted">
                          {input.participationMode === 'high'
                            ? t('r.interact.high')
                            : t('r.interact.low')}
                        </p>
                      </article>
                    </div>
                  </section>

                  <section className="panel" id="sec-evidence">
                    <h2>{t('r.evidence')}</h2>
                    <p className="muted">
                      FORMAT: {result.sourcePolicy.citationTemplate}
                    </p>
                    <div className="evidence-cards">
                      {result.evidence.map((item) => (
                        <article key={item.id} className={`evidence-card ${item.conflictsWith.length > 0 ? 'evidence-conflict' : ''}`}>
                          <div className="evidence-card-header">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="evidence-title"
                              onClick={() =>
                                track('evidence_opened', {
                                  evidence_id: item.id,
                                  source_tier: item.tier,
                                })
                              }
                            >
                              [{item.id}] {item.title}
                            </a>
                            <span className={`evidence-tier tier-${item.tier}`}>{item.tier}</span>
                          </div>
                          <p className="evidence-claim">{item.claim}</p>
                          <div className="evidence-metrics">
                            <span className="evidence-metric">
                              <span className="evidence-metric-label">REL</span>
                              <span className="evidence-metric-bar">
                                <span style={{ width: `${item.relevance}%` }} />
                              </span>
                              <span>{item.relevance}</span>
                            </span>
                            <span className="evidence-metric">
                              <span className="evidence-metric-label">CRED</span>
                              <span className="evidence-metric-bar">
                                <span style={{ width: `${item.credibility}%` }} />
                              </span>
                              <span>{item.credibility}</span>
                            </span>
                          </div>
                          {item.conflictsWith.length > 0 && (
                            <div className="warn evidence-conflict-note">CONFLICT: {item.conflictsWith.join(', ')}</div>
                          )}
                        </article>
                      ))}
                    </div>
                    {unresolvedConflicts.length > 0 && (
                      <p className="warn">
                        {t('r.conflictWarn', { n: unresolvedConflicts.length })}
                      </p>
                    )}
                  </section>

                  <section className="panel" id="sec-paths">
                    <h2>{t('r.paths')}</h2>
                    <div className="path-cards">
                      {result.candidates.map((item) => {
                        const isSel = selectedPath?.id === item.id
                        return (
                          <article key={item.id} className={`path-card ${isSel ? 'path-selected' : ''}`}>
                            <div className="path-card-header">
                              <span className="path-card-id">{item.id}</span>
                              <span className="path-card-name">{item.name}</span>
                              <span className="path-card-score">{item.score}<span className="muted">/100</span></span>
                            </div>
                            <div className="path-card-bars">
                              {([
                                ['NOV', item.novelty],
                                ['FEAS', item.feasibility],
                                ['IMP', item.impact],
                                ['RISK', item.risk],
                                ['EVID', item.evidenceCoverage],
                              ] as [string, number][]).map(([label, val]) => (
                                <div key={label} className="path-bar-row">
                                  <span className="path-bar-label">{label}</span>
                                  <span className="path-bar-track"><span style={{ width: `${val * 10}%` }} /></span>
                                  <span className="path-bar-val">{val}</span>
                                </div>
                              ))}
                            </div>
                            <div className="path-card-conf">CONF {item.confidence}%</div>
                            {isSel && (
                              <div className="path-card-detail">
                                <p><strong>HYPOTHESIS:</strong> {item.hypothesis}</p>
                                <p><strong>METHOD:</strong> {item.method}</p>
                                <p><strong>EXPERIMENT:</strong> {item.firstExperiment}</p>
                                <p><strong>STOP_COND:</strong> {item.stopCondition}</p>
                              </div>
                            )}
                          </article>
                        )
                      })}
                    </div>

                    {input.participationMode === 'low' ? (
                      <form className="correction-form" onSubmit={handleCorrection}>
                        <h3>{t('r.override')}</h3>
                        <label>
                          {t('r.override.label')}
                          <select
                            value={overridePathId}
                            onChange={(e) => setOverridePathId(e.target.value)}
                          >
                            <option value="">{t('r.override.keep')}</option>
                            {result.candidates.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.id} // {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {t('r.override.note')}
                          <textarea
                            rows={3}
                            value={overrideNote}
                            onChange={(e) => setOverrideNote(e.target.value)}
                            placeholder={t('r.override.ph')}
                          />
                        </label>
                        <button className="btn btn-secondary" type="submit">
                          {t('r.override.submit')}
                        </button>
                      </form>
                    ) : (
                      <div className="gate-list">
                        <h3>{t('r.gates')}</h3>
                        {result.recommendation.manualConfirmations.map((item) => (
                          <label key={item} className="gate-item">
                            <input
                              type="checkbox"
                              checked={Boolean(manualChecks[item])}
                              onChange={() => toggleGate(item)}
                            />
                            {item}
                          </label>
                        ))}
                        {!manualReady && (
                          <p className="warn">{t('r.gates.warn')}</p>
                        )}
                      </div>
                    )}

                    <button className="btn btn-primary" type="button" onClick={handleAccept}>
                      {t('r.accept')}
                    </button>
                    {isAccepted && <p className="ok">{t('r.accepted')}</p>}
                  </section>
                </>
              )}
            </>
          )}

          {view === 'product' && (
            <>
              <section className="panel animate-in">
                <h2>{t('pv.personas')}</h2>
                <div className="user-grid">
                  {getPersonas(locale).map((item) => (
                    <article key={item.name}>
                      <h3>{item.name}</h3>
                      <p><strong>PAIN:</strong> {item.pain}</p>
                      <p><strong>SUCCESS:</strong> {item.success}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel animate-in animate-in-delay-1">
                <h2>{t('pv.uxFlow')}</h2>
                <div className="grid-two">
                  <article>
                    <h3>{t('pv.journey')}</h3>
                    <ol>
                      {getJourney(locale).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                  </article>
                  <article>
                    <h3>{t('pv.deliverables')}</h3>
                    <ul>
                      {getUxDeliverables(locale).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              </section>

              <section className="panel animate-in animate-in-delay-2">
                <h2>{t('pv.metrics')}</h2>
                <div className="grid-two">
                  <article>
                    <h3>{t('pv.prodKpi')}</h3>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>METRIC</th><th>DEF</th><th>TARGET</th><th>OWNER</th></tr>
                        </thead>
                        <tbody>
                          {getProductKpis(locale).map((item) => (
                            <tr key={item.id}>
                              <td>{item.name}</td>
                              <td>{item.definition}</td>
                              <td>{item.target}</td>
                              <td>{item.owner}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                  <article>
                    <h3>{t('pv.aiQuality')}</h3>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>METRIC</th><th>DEF</th><th>TARGET</th><th>OWNER</th></tr>
                        </thead>
                        <tbody>
                          {getAiKpis(locale).map((item) => (
                            <tr key={item.id}>
                              <td>{item.name}</td>
                              <td>{item.definition}</td>
                              <td>{item.target}</td>
                              <td>{item.owner}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                </div>
              </section>
            </>
          )}

          {view === 'ops' && (
            <>
              <section className="panel animate-in">
                <h2>{t('ops.topology')}</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>SERVICE</th><th>ROLE</th><th>STACK</th><th>SLO</th></tr>
                    </thead>
                    <tbody>
                      {getServiceBlueprint(locale).map((service) => (
                        <tr key={service.service}>
                          <td><strong>{service.service}</strong></td>
                          <td>{service.role}</td>
                          <td>{service.stack}</td>
                          <td>{service.slo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel animate-in animate-in-delay-1">
                <h2>{t('ops.security')}</h2>
                <div className="user-grid">
                  {getSecurityControls(locale).map((item) => (
                    <article key={item.id}>
                      <h3>{item.id} // RULE</h3>
                      <p>{item.rule}</p>
                      <p className="muted">CTRL: {item.control}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel animate-in animate-in-delay-2">
                <h2>{t('ops.release')}</h2>
                <div className="grid-two">
                  <article>
                    <h3>{t('ops.releasePlan')}</h3>
                    <ul>
                      {getReleasePlan(locale).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article>
                    <h3>{t('ops.endpoints')}</h3>
                    <ul>
                      {API_SKETCH.map((item) => (
                        <li key={item}><code>{item}</code></li>
                      ))}
                    </ul>
                  </article>
                </div>
              </section>
            </>
          )}
        </section>
      </section>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          userId={user?.id ?? ''}
          onUpdate={updateSettings}
          onReset={resetSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showNoLLM && (
        <NoLLMDialog
          onConfigure={() => { setShowNoLLM(false); setShowSettings(true) }}
          onMockPreview={() => { setShowNoLLM(false); doRun(true) }}
          onCancel={() => setShowNoLLM(false)}
        />
      )}

      {showPaywall && (
        <Paywall
          currentPlan={plan}
          onUpgrade={() => {
            setPlan('pro')
            localStorage.setItem('copilot_plan', 'pro')
            setShowPaywall(false)
            toast('success', t('pay.toast.upgrade'))
          }}
          onClose={() => setShowPaywall(false)}
        />
      )}

      {showTour && <Tour steps={TOUR_STEPS} onComplete={handleTourComplete} />}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {view === 'workspace' && !iterView && result && (
        <nav className="quick-nav" aria-label="Quick navigation">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="quick-nav-btn">{t('nav.top')}</button>
          <button type="button" onClick={() => document.getElementById('sec-input')?.scrollIntoView({ behavior: 'smooth' })} className="quick-nav-btn">{t('nav.input')}</button>
          <button type="button" onClick={() => document.getElementById('sec-thinking')?.scrollIntoView({ behavior: 'smooth' })} className="quick-nav-btn">{t('nav.thinking')}</button>
          <button type="button" onClick={() => document.getElementById('sec-arch')?.scrollIntoView({ behavior: 'smooth' })} className="quick-nav-btn">{t('nav.arch')}</button>
          <button type="button" onClick={() => document.getElementById('sec-evidence')?.scrollIntoView({ behavior: 'smooth' })} className="quick-nav-btn">{t('nav.evidence')}</button>
          <button type="button" onClick={() => document.getElementById('sec-paths')?.scrollIntoView({ behavior: 'smooth' })} className="quick-nav-btn">{t('nav.paths')}</button>
        </nav>
      )}
    </main>
  )
}

export default App
