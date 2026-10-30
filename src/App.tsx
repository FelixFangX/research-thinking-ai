import { downloadTrace } from './lib/downloadTrace'
import type { StageEvent } from './ledringTrace'
import type { SessionRecord } from './types'
import { EvidenceClaim } from './components/EvidenceClaim'
import { TierChip } from './components/TierChip'
import { PlanRuler } from './components/PlanRuler'
import { type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { EmptyState } from './components/EmptyState'
import { IterationTracker } from './components/IterationTracker'
import { SettingsPanel } from './components/SettingsPanel'
import { StreamPanel } from './components/StreamPanel'
import { ShareExport } from './components/ShareExport'
import { ToastContainer } from './components/ToastContainer'
import {
  createDefaultInput,
  formatArchitecture,
  formatMode,
  getDefaultWeights,
  runTopicAgentWithProgress,
} from './engine'
import { loadApiKey } from './lib/keyVault'
import { useI18n } from './i18n'
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
import { isLLMConfigured } from './llm'
import { shouldUseSample } from './lib/researchConfig'
import { fetchEvidence } from './evidence/client'
import { errorMessageNotice, freeErrorNotice, type FreeStatus } from './lib/quota'
import { evidenceSourceKey, type EvidenceOrigin } from './lib/evidenceSource'
import { Ring, PipelineRing } from './components/Ring'
import { updateTabLed, type InstrumentState } from './lib/tabLed'
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

  const STAGE_TEMPLATE: PipelineStageProgress[] = useMemo(() => [
    { id: 'retrieve' as const, name: t('stg.retrieve'), status: 'idle' as const, detail: t('stg.idle'), progress: 0 },
    { id: 'map' as const, name: t('stg.map'), status: 'idle' as const, detail: t('stg.idle'), progress: 0 },
    { id: 'compare' as const, name: t('stg.compare'), status: 'idle' as const, detail: t('stg.idle'), progress: 0 },
    { id: 'converge' as const, name: t('stg.converge'), status: 'idle' as const, detail: t('stg.idle'), progress: 0 },
  ], [t])

  const { settings, updateSettings, resetSettings } = useSettings()
  const { toasts, toast, dismiss: dismissToast } = useToast()

  const formRef = useRef<HTMLFormElement>(null)
  const [stageTimes, setStageTimes] = useState<Record<string, { start: number; end?: number }>>({})
  const [events, setEvents] = useState<string[]>([])
  const [clock, setClock] = useState(0)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'auto')
  const [view, setView] = useState<DashboardView>('workspace')
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])
  const mockRef = useRef(false)
  const [input, setInput] = useState<TopicInput>(() => {
    const base = createDefaultInput(locale)
    return {
      ...base,
      researchInterest: '',
      problemDomain: '',
      seedIdea: '',
      constraints: '',
      participationMode: settings.defaultMode,
      complexityHint: settings.defaultComplexity,
      expectedTimelineWeeks: settings.defaultTimelineWeeks,
      decisionWeights: getDefaultWeights(settings.defaultMode),
    }
  })
  const [pipeline, setPipeline] = useState<PipelineStageProgress[]>(STAGE_TEMPLATE)
  const previousLocale = useRef(locale)
  useEffect(() => {
    const oldDefaults = createDefaultInput(previousLocale.current)
    const newDefaults = createDefaultInput(locale)
    setInput(previous => {
      const fields = ['researchInterest', 'problemDomain', 'seedIdea', 'constraints'] as const
      if (!fields.every(key => previous[key] === oldDefaults[key])) return previous
      return { ...previous, ...Object.fromEntries(fields.map(key => [key, newDefaults[key]])) }
    })
    setPipeline(previous => previous.map(stage => ({ ...stage, name: t(`stg.${stage.id}`), detail: stage.status === 'idle' ? t('stg.idle') : stage.detail })))
    previousLocale.current = locale
  }, [locale, t])
  const [result, setResult] = useState<AgentRunResult | null>(null)
  const [streamTexts, setStreamTexts] = useState<Record<string, string>>({})
  const [thinkingTexts, setThinkingTexts] = useState<Record<string, string>>({})
  const [traceRecord, setTraceRecord] = useState<SessionRecord | null>(null)
  const { records: history, addRecord: addHistory } = useHistory('anonymous')
  const [overridePathId, setOverridePathId] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({})
  const [isAccepted, setIsAccepted] = useState(false)
  const [iterView, setIterView] = useState(false)
  const [previousResult, setPreviousResult] = useState<AgentRunResult | null>(null)
  const iteration = useIteration('anonymous')
  const [isSample, setIsSample] = useState(false)
  const hasTrackedView = useRef(false)
  const autoScrollRef = useRef(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    if (hasTrackedView.current) return
    hasTrackedView.current = true
    track('topic_agent_page_viewed')
  }, [])

  useEffect(() => {
    loadApiKey('anonymous').then((key) => {
      if (key) updateSettings({ apiKey: key })
    })
  }, [updateSettings])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit() }
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
      window.scrollTo({ top: y, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
  }, [pipeline, streamTexts, thinkingTexts])

  const onStream = useCallback((stageId: string, text: string) => {
    setStreamTexts((prev) => ({ ...prev, [stageId]: text }))
  }, [])

  const onThinking = useCallback((stageId: string, text: string) => {
    setThinkingTexts((prev) => ({ ...prev, [stageId]: text }))
  }, [])

  const [status, setStatus] = useState<FreeStatus | null>(null)
  const [freeError, setFreeError] = useState<unknown>(null)
  const [evidenceOrigin, setEvidenceOrigin] = useState<EvidenceOrigin | null>(null)
  const refreshStatus = useCallback(() => {
    void fetch('/api/status').then(async (res) => {
      if (res.ok) setStatus(await res.json())
    }).catch(() => {})
  }, [])
  useEffect(refreshStatus, [refreshStatus])
  const sourceLabelKey = evidenceSourceKey(evidenceOrigin)
  const notice = freeErrorNotice(freeError, new Date(), locale)
  const runMutation = useMutation({
    retry: false,
    onSettled: refreshStatus,
    mutationFn: async (payload: TopicInput) => {
      setStageTimes({})
      setEvents([])
      setFreeError(null)
      setEvidenceOrigin(null)
      setResult(null)
      setPipeline(STAGE_TEMPLATE)
      setStreamTexts({})
      setThinkingTexts({})
      const s = settingsRef.current
      const llmCfg = mockRef.current
        ? null
        : isLLMConfigured({ provider: s.apiProvider, apiKey: s.apiKey, baseUrl: s.apiBaseUrl, model: s.apiModel })
          ? { provider: s.apiProvider, baseUrl: s.apiBaseUrl, apiKey: s.apiKey, model: s.apiModel }
          : null
      const startedAt = new Date().toISOString()
      const stageEvents: StageEvent[] = []
      let origin: EvidenceOrigin = llmCfg ? 'model' : 'template'
      const agentResult = await runTopicAgentWithProgress(
        payload,
        (update) => {
          const now = Date.now()
          setClock(now)
          setStageTimes(previous => {
            const timing = previous[update.id]
            if (update.status === 'running' && !timing) return { ...previous, [update.id]: { start: now } }
            if ((update.status === 'done' || update.status === 'error') && timing) return { ...previous, [update.id]: { ...timing, end: now } }
            return previous
          })
          setEvents(prev => [`${new Date().toLocaleTimeString()} · ${update.name} · ${update.detail}`, ...prev].slice(0, 8))
          setPipeline((prev) => mergeStage(prev, update))
        },
        onStream,
        locale,
        llmCfg,
        onThinking,
        mockRef.current ? undefined : async () => {
          const { evidence, source } = await fetchEvidence(payload)
          origin = source
          return evidence
        },
        { recordStage: (event) => {
          const existing = stageEvents.find(e => e.id === event.id)
          if (existing) Object.assign(existing, event)
          else stageEvents.push(event)
        } },
      )
      return { agentResult, origin, stageEvents, startedAt, model: llmCfg?.model, llmUsed: !!llmCfg }
    },
    onMutate: (payload) => {
      toast('info', t('toast.start'))
      track('topic_agent_run_started', {
        participation_mode: payload.participationMode,
        timeline_weeks: payload.expectedTimelineWeeks,
        complexity_hint: payload.complexityHint,
      })
    },
    onSuccess: ({ agentResult, origin, stageEvents, startedAt, model, llmUsed }, payload) => {
      setEvidenceOrigin(origin)
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
        const record: SessionRecord = {
          startedAt, endedAt: new Date().toISOString(), model, llmUsed, stageEvents,
          id: crypto.randomUUID(),
          userId: 'anonymous',
          createdAt: new Date().toISOString(),
          interest: payload.researchInterest,
          mode: payload.participationMode,
          complexityScore: agentResult.complexity.score,
          architecture: agentResult.architecture.mode,
          selectedPathId: topPath.id,
          confidence: topPath.confidence,
          evidenceOrigin: origin,
          fullResult: agentResult,
          fullInput: payload,
        }
        setTraceRecord(record)
        void addHistory(record)
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
      const now = Date.now()
      setClock(now)
      setStageTimes(previous => Object.fromEntries(Object.entries(previous).map(([id, timing]) => [id, { ...timing, end: timing.end ?? now }])))
      if (settingsRef.current.apiProvider === 'free') setFreeError(err)
      mockRef.current = false
      setPipeline((prev) =>
        prev.map((item) => ({
          ...item,
          status: item.status === 'running' ? 'error' : item.status,
          detail: item.status === 'running' ? t('toast.stageFail') : item.detail,
        })),
      )
      console.error('[research] run failed', err)
      const message = errorMessageNotice(err, new Date(), locale)
      toast('error', t(message.key, message.params))
      track('topic_agent_run_failed')
    },
  })

  const citationText = (value: string) => value.split(/(\bE\d+\b)/g).map((part, index) =>
    result?.evidence.some(e => e.id === part)
      ? <a data-testid="citation" className="citation-chip" key={index} href={`#evidence-${part}`}>[{part}]</a> : part)

  const selectedPath = useMemo(() => {
    if (!result) return null
    const pathId = overridePathId || result.recommendation.selectedPathId
    return result.candidates.find((item) => item.id === pathId) ?? result.candidates[0] ?? null
  }, [overridePathId, result])

  const unresolvedConflicts = useMemo(
    () => result?.evidence.filter((item) => item.conflictsWith.length > 0) ?? [],
    [result],
  )

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
    autoScrollRef.current = false
    const s = settingsRef.current
    mockRef.current = shouldUseSample(
      { provider: s.apiProvider, apiKey: s.apiKey, baseUrl: s.apiBaseUrl, model: s.apiModel },
      { requested: useMock, quotaExhausted: status?.quota.exhausted },
    )
    setIsSample(mockRef.current)
    runMutation.mutate(input)
  }, [input, runMutation, STAGE_TEMPLATE, status])

  const handleRun = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (runMutation.isPending) return
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

  const instrumentState: InstrumentState = runMutation.isPending ? 'processing' : notice || runMutation.isError ? 'error' : result ? 'done' : 'idle'
  const activeIndex = Math.max(0, pipeline.findIndex(stage => stage.status === 'running'))
  const stateText = instrumentState === 'processing' ? t('inst.processing', { stage: pipeline[activeIndex].name, n: activeIndex + 1 })
    : instrumentState === 'done' ? t('inst.done', { n: result?.candidates.length ?? 0, c: result?.evidence.length ?? 0 })
    : instrumentState === 'error' ? t('inst.error', { msg: notice ? t(notice.key, notice.params) : t(errorMessageNotice(runMutation.error, new Date(), locale).key) }) : t('inst.idle')
  useEffect(() => {
    document.documentElement.dataset.state = instrumentState
    const refresh = () => updateTabLed(instrumentState, t('app.title'), t(`inst.tab.${instrumentState}`))
    refresh()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', refresh)
    return () => media.removeEventListener('change', refresh)
  }, [instrumentState, theme, t])
  useEffect(() => {
    if (!runMutation.isPending) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [runMutation.isPending])
  const cycleTheme = () => {
    const next = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto'
    if (next === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch { /* Storage can be unavailable. */ }
    setTheme(next)
  }

  const showSidebar = history.length > 0 || runMutation.isPending || runMutation.isError || result !== null || iteration.activePlan !== null

  return (
    <main className="app-shell">
      <header className="topbar panel">
        <div className="topbar-left">
          <a className="family-link" href="https://ledring.dev" aria-label={t('inst.brand')}><Ring /><span className="label brand-label" onAnimationEnd={(event) => {
            if (event.target === event.currentTarget.lastElementChild) delete document.documentElement.dataset.intro
          }}>{Array.from(t('inst.brand')).map((char, i) => <span aria-hidden="true" key={i} style={{ '--i': i } as CSSProperties}>{char}</span>)}</span></a>
          <span className="tool-name">{t('app.title')}</span>
        </div>
        <div className="topbar-right">
          <button
            id="btn-lang"
            className="settings-btn"
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
            type="button"
          >
            <span lang={locale === 'zh' ? 'en' : 'zh-CN'}>{locale === 'zh' ? 'EN' : '中文'}</span>
            <span className="sr-only"> {t('aria.language')}</span>
          </button>
          <button className="theme-pill" type="button" onClick={cycleTheme}>{theme === 'auto' ? t('inst.auto') : t(`cfg.theme.${theme}`)}</button>
          <a className="github-link" href="https://github.com/FelixFangX/research-thinking-ai" aria-label={t('inst.github')}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg></a>
          <button
            id="btn-cfg"
            data-testid="settings-button"
            className="settings-btn"
            onClick={() => setShowSettings(true)}
            type="button"
            aria-label={t('aria.settings')}
          >
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
      </header>
      <nav className="tabs" role="tablist" aria-label={t('aria.nav')}>
        <button
          type="button"
          role="tab"
          className={view === 'workspace' ? 'tab active' : 'tab'}
          aria-selected={view === 'workspace'}
          onClick={() => { setView('workspace'); track('dashboard_view_changed', { view: 'workspace' }) }}
        >
          {t('nav.workspace')}
        </button>
        <button
          type="button"
          role="tab"
          className={view === 'product' ? 'tab active' : 'tab'}
          aria-selected={view === 'product'}
          onClick={() => { setView('product'); track('dashboard_view_changed', { view: 'product' }) }}
        >
          {t('nav.product')}
        </button>
        <button
          type="button"
          role="tab"
          className={view === 'ops' ? 'tab active' : 'tab'}
          aria-selected={view === 'ops'}
          onClick={() => { setView('ops'); track('dashboard_view_changed', { view: 'ops' }) }}
        >
          {t('nav.ops')}
        </button>
      </nav>

      {runMutation.isPending && <div className="mobile-progress" data-testid="mobile-progress" aria-hidden="true"><PipelineRing stages={pipeline} /><span>{pipeline[activeIndex].name} · {activeIndex + 1}/4</span></div>}
      <section className={`layout${showSidebar ? '' : ' layout-empty'}`}>
        {showSidebar && <aside className="panel sidebar" aria-label={t('aria.sidebar')}>
          <details className="session-log"><summary>{t('sidebar.log')}</summary>
          {history.length === 0 ? (
            <EmptyState title={t('sidebar.empty.title')} />
          ) : (
            <ul className="history-list">
              {history.map((item) => (
                <li key={item.id}>
                <button
                  type="button"
                  className="history-button"
                  title={t('sidebar.viewDetail')}
                  onClick={() => {
                    if (item.fullResult) {
                      setTraceRecord(item)
                      setIsSample(item.llmUsed === false)
                      setResult(item.fullResult)
                      setEvidenceOrigin(item.evidenceOrigin ?? null)
                      if (item.fullInput) setInput(item.fullInput)
                      setOverridePathId('')
                      setOverrideNote('')
                      setIsAccepted(false)
                      const checks: Record<string, boolean> = {}
                      item.fullResult.recommendation.manualConfirmations.forEach((c) => { checks[c] = false })
                      setManualChecks(checks)
                      setIterView(false)
                      setView('workspace')
                      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
                    }
                  }}
                >
                  <strong data-user-content>{item.interest.slice(0, 20)}</strong>
                  <div className="muted">
                    {formatMode(item.mode, locale).slice(0, 4)} · {item.complexityScore} · {formatArchitecture(item.architecture, locale)}
                  </div>
                  <div className="muted">
                    {item.selectedPathId} · {t('ui.confidence')} {item.confidence}%
                  </div>
                  <div className="muted" style={{ fontSize: 'var(--font-xs)' }}>
                    {new Date(item.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </button>
                {item.fullInput && item.fullResult && <button type="button" className="btn btn-text" onClick={() => { if (!downloadTrace(item)) toast('error', t('export.traceFail')) }}>{t('export.trace')}</button>}
                </li>
              ))}
            </ul>
          )}

          {iteration.activePlan && (
            <button
              type="button"
              className="btn btn-secondary sidebar-iter-btn"
              onClick={() => { setView('workspace'); setIterView(true) }}
            >
              {t('iter.status.active')}: {iteration.activePlan.pathName.slice(0, 16)}
            </button>
          )}

          </details>
          <h2 className="label">{t('sidebar.pipeline')}</h2>
          <PipelineRing stages={pipeline} />
          <p className="state-line label" data-testid="state-line" role="status" aria-live="polite">{stateText}</p>
          <div className="pipeline-list">
            {pipeline.map((item) => (
              <div key={item.id} data-testid={`stage-${item.id}`} className={`pipeline-item status-${item.status}`}>
                <div className="pipeline-title">
                  <span>{item.name}</span>
                  <span>{t(`inst.${item.status === 'idle' ? 'pending' : item.status === 'done' ? 'complete' : item.status === 'error' ? 'failed' : 'running'}`)} · {stageTimes[item.id] ? `${Math.max(0, ((stageTimes[item.id].end ?? clock) - stageTimes[item.id].start) / 1000).toFixed(0)}s` : '—'}</span>
                </div>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>

          <details className="events-log" open={window.matchMedia('(min-width: 900px)').matches || undefined}><summary><span className="desktop-events">{t('sidebar.events')}</span><span className="mobile-events">{t('inst.log')}</span></summary>
            <ul className="analytics-list">{events.length === 0 && <li>{t('inst.noEvents')}</li>}{events.map((event, index) => <li key={index}>{event}</li>)}</ul>
          </details>
        </aside>}

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
              <section className="panel animate-in" id="sec-input">
                <h1 className="brief-title">{t('inst.title')}</h1>
                <form ref={formRef} className="input-form" onSubmit={handleRun}>
                  <label>
                    {t('ws.interest')}
                    <textarea
                      data-user-content
                      required
                      value={input.researchInterest}
                      onChange={(e) => updateField('researchInterest', e.target.value)}
                      rows={3}
                      placeholder={t('ws.interest.ph')}
                    />
                  </label>

                  <button data-testid="run" className="btn btn-primary" type="submit" disabled={runMutation.isPending}>
                    <Ring /><span className="run-label">{runMutation.isPending ? t('ws.running') : t('ws.run')}</span>
                    <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘↵' : 'Ctrl+↵'}</kbd>
                  </button>
                  {settings.apiProvider === 'free' && notice && <div data-testid="quota-notice" role="status" className={`quota-notice ${notice.key === 'free.unavailable' ? 'error-callout' : ''}`}>
                    <p>{t(notice.key, notice.params)}</p>
                    <button className="btn btn-ghost" type="button" disabled={runMutation.isPending} onClick={() => doRun(true)}>{t('free.demo')}</button>
                    <button className="btn btn-ghost" type="button" onClick={() => setShowSettings(true)}>{t('free.settings')}</button>
                  </div>}
                  {runMutation.isError && !notice && <div data-testid="quota-notice" role="alert" className="run-error"><p>{(m => t(m.key, m.params))(errorMessageNotice(runMutation.error, new Date(), locale))}</p><button type="button" onClick={() => doRun()}>{t('error.retry')}</button><button type="button" onClick={() => setShowSettings(true)}>{t('free.settings')}</button></div>}
                  {isSample && <span data-testid="sample-badge" className="verify-tag">{t('inst.sample')}</span>}
                  <details className="more-context"><summary>{t('inst.context')}</summary><div className="context-fields">
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
                    {t('ws.domain')}
                    <input
                      data-user-content
                      value={input.problemDomain}
                      onChange={(e) => updateField('problemDomain', e.target.value)}
                      placeholder={t('ws.domain.ph')}
                    />
                  </label>
                  <label>
                    {t('ws.idea')}
                    <textarea
                      data-user-content
                      value={input.seedIdea}
                      onChange={(e) => updateField('seedIdea', e.target.value)}
                      rows={3}
                      placeholder={t('ws.idea.ph')}
                    />
                  </label>
                  <label>
                    {t('ws.constraints')}
                    <textarea
                      data-user-content
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
                      <span className="complexity-ticks" role="group" aria-label={t('ws.complexity')}>
                        {[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-pressed={input.complexityHint === n} onClick={() => updateField('complexityHint', n)}>{n}</button>)}
                      </span>
                    </label>
                  </div>

                  <h2>{t('ws.weights')}</h2>
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

                  </div></details>
                </form>
              </section>

              <StreamPanel pipeline={pipeline} streamTexts={streamTexts} thinkingTexts={thinkingTexts} result={result ?? undefined} />

              {result && (
                <>
                  <section className="panel" id="sec-arch">
                    <div className="section-header">
                      <h2>{t('r.arch')}</h2>
                      <ShareExport record={traceRecord ?? undefined} input={input} result={result} onToast={handleToast} />
                    </div>
                    <div className="result-grid">
                      <article>
                        <h3>{t('r.complexity')}</h3>
                        <p className="big">{result.complexity.score}</p>
                        <p className="muted">{locale === 'zh' ? ({ low: '低', medium: '中', high: '高', frontier: '前沿' }[result.complexity.level]) : result.complexity.level}</p>
                        <ul>
                          {result.complexity.rationale.map((item) => (
                            <li key={item}>{citationText(item)}</li>
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

                  <section className="panel" id="sec-paths">
                    <h2 className="label">{t('inst.directions')}</h2>
                    <ul id="recommendation-note">{result.recommendation.why.map((reason, index) => <li key={index}>{citationText(reason)}</li>)}</ul>
                    {[...result.candidates].sort((a, b) => b.score - a.score)[0]?.id !== result.recommendation.selectedPathId && (
                      <p className="ranking-note"><a href="#recommendation-note">{t('inst.rankedRecommendation', { id: result.recommendation.selectedPathId })}</a></p>
                    )}
                    <div className="path-cards">
                      {[...result.candidates].sort((a, b) => b.score - a.score).map((item, index) => {
                        const isSel = selectedPath?.id === item.id
                        return (
                          <article key={item.id} className={`path-card ${item.id === result.recommendation.selectedPathId ? 'path-selected' : ''}`}>
                            <span className="direction-numeral" data-testid="direction-numeral">{String(index + 1).padStart(2, '0')}</span>
                            <div className="path-card-header">
                              <span className="path-card-id">{item.id}</span>
                              <span className="path-card-name">{item.name}</span>
                              {item.id === result.recommendation.selectedPathId && <span className="recommended-tag">{t('inst.recommended')}</span>}
                              {item.evidenceIds.filter(id => result.evidence.some(e => e.id === id)).map(id => <a data-testid="citation" className="citation-chip" href={`#evidence-${id}`} key={id}>[{id}]</a>)}
                              <span className="path-card-score">{item.score}<span className="muted">/100</span></span>
                            </div>
                            <p className="direction-summary">{citationText(item.hypothesis)}</p>
                            <p className="direction-summary">{citationText(item.method)}</p>
                            <div className="path-card-bars">
                              {([
                                [t('w.novelty'), item.novelty],
                                [t('w.feasibility'), item.feasibility],
                                [t('w.impact'), item.impact],
                                [t('w.risk'), item.risk],
                                [t('w.evidence'), item.evidenceCoverage],
                              ] as [string, number][]).map(([label, val]) => (
                                <div key={label} className="path-bar-row">
                                  <span className="path-bar-label">{label}</span>
                                  <span className="path-bar-track"><span style={{ width: `${val * 10}%` }} /></span>
                                  <span className="path-bar-val">{val}</span>
                                </div>
                              ))}
                            </div>
                            <div className="path-card-conf">{t('ui.confidence')} {item.confidence}%</div>
                            {isSel && (
                              <div className="path-card-detail">
                                <p><strong>{t('ui.hypothesis')}</strong> {citationText(item.hypothesis)}</p>
                                <p><strong>{t('ui.method')}</strong> {citationText(item.method)}</p>
                                <p><strong>{t('ui.experiment')}</strong> {item.firstExperiment}</p>
                                <p><strong>{t('ui.stop')}</strong> {item.stopCondition}</p>
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
                                {item.id} · {item.name}
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

                    <button className="btn btn-secondary" type="button" onClick={handleAccept}>
                      {t('r.accept')}
                    </button>
                    {isAccepted && <p className="ok">{t('r.accepted')}</p>}
                  </section>
                  <section className="panel" id="sec-plan"><h2 className="label">{t('inst.plan')}</h2><PlanRuler tasks={result.recommendation.nextSevenDays} /></section>
                  <section className="panel" id="sec-evidence">
                    <h2>{t('r.evidence')}</h2>
                    {sourceLabelKey && <p data-testid="evidence-source">{t(sourceLabelKey)}</p>}
                    <div data-testid="evidence-list" className="evidence-cards">
                      {result.evidence.map((item) => (
                        <article data-testid="evidence-item" id={`evidence-${item.id}`} key={item.id} className={`evidence-card ${item.conflictsWith.length > 0 ? 'evidence-conflict' : ''}`}>
                          <span className="evidence-number">{item.id}</span>
                          <div className="evidence-card-header">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="evidence-title"
                              onClick={() =>
                                track('evidence_opened', {
                                  evidence_id: item.id,
                                  source_tier: item.tier,
                                })
                              }
                            >
                              <span data-user-content>{item.title}</span>
                            </a>

                          </div>
                          <div className="evidence-metadata" data-user-content>{item.source} · {item.year} · <TierChip tier={item.tier} /></div>
                          <span data-testid="verify-tag" className={`verify-tag ${evidenceOrigin === 'openalex' || evidenceOrigin === 'crossref' ? 'verified' : 'unverified'}`}>{evidenceOrigin === 'openalex' || evidenceOrigin === 'crossref' ? `${t('inst.verified')} · ${evidenceOrigin === 'crossref' ? 'Crossref' : 'OpenAlex'}` : t(evidenceOrigin === 'template' ? 'inst.sample' : 'inst.unverified')}</span>
                          <p className="evidence-claim"><EvidenceClaim claim={item.claim} /></p>
                          <div className="evidence-metrics">
                            <span className="evidence-metric">
                              <span className="evidence-metric-label">{t('ui.relevance')}</span>
                              <span className="evidence-metric-bar">
                                <span style={{ width: `${item.relevance}%` }} />
                              </span>
                              <span>{item.relevance}</span>
                            </span>
                            <span className="evidence-metric">
                              <span className="evidence-metric-label">{t('ui.credibility')}</span>
                              <span className="evidence-metric-bar">
                                <span style={{ width: `${item.credibility}%` }} />
                              </span>
                              <span>{item.credibility}</span>
                            </span>
                          </div>
                          {item.conflictsWith.length > 0 && (
                            <div className="warn evidence-conflict-note">{t('r.conflict')} {item.conflictsWith.join(', ')}</div>
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
                      <p><strong>{t('ui.pain')}</strong> {item.pain}</p>
                      <p><strong>{t('ui.success')}</strong> {item.success}</p>
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
                        <li key={item}>{citationText(item)}</li>
                      ))}
                    </ol>
                  </article>
                  <article>
                    <h3>{t('pv.deliverables')}</h3>
                    <ul>
                      {getUxDeliverables(locale).map((item) => (
                        <li key={item}>{citationText(item)}</li>
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
                          <tr><th>{t('ui.metric')}</th><th>{t('ui.definition')}</th><th>{t('ui.target')}</th><th>{t('ui.owner')}</th></tr>
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
                          <tr><th>{t('ui.metric')}</th><th>{t('ui.definition')}</th><th>{t('ui.target')}</th><th>{t('ui.owner')}</th></tr>
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
                      <tr><th>{t('ui.service')}</th><th>{t('ui.role')}</th><th>{t('ui.stack')}</th><th>{t('ui.slo')}</th></tr>
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
                      <h3>{item.id} · {t('ui.rule')}</h3>
                      <p>{item.rule}</p>
                      <p className="muted">{t('ui.control')} {item.control}</p>
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
                        <li key={item}>{citationText(item)}</li>
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
          models={status?.models}
          settings={settings}
          userId={'anonymous'}
          onUpdate={updateSettings}
          onReset={resetSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <footer className="wall-strip label">{t('inst.footer')}</footer>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {view === 'workspace' && !iterView && result && (
        <nav className="quick-nav" aria-label={t('aria.quickNav')}>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} className="quick-nav-btn">{t('nav.top')}</button>
          <button type="button" onClick={() => document.getElementById('sec-input')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} className="quick-nav-btn">{t('nav.input')}</button>
          <button type="button" onClick={() => document.getElementById('sec-thinking')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} className="quick-nav-btn">{t('nav.thinking')}</button>
          <button type="button" onClick={() => document.getElementById('sec-arch')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} className="quick-nav-btn">{t('nav.arch')}</button>
          <button type="button" onClick={() => document.getElementById('sec-evidence')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} className="quick-nav-btn">{t('nav.evidence')}</button>
          <button type="button" onClick={() => document.getElementById('sec-paths')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} className="quick-nav-btn">{t('nav.paths')}</button>
        </nav>
      )}
    </main>
  )
}

export default App
