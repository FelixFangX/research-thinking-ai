import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { PipelineStageProgress } from '../types'
import { useI18n } from '../i18n'

const DATA_DELIMITER = '---DATA---'

const remarkPlugins = [remarkGfm]

interface Props {
  pipeline: PipelineStageProgress[]
  streamTexts: Record<string, string>
  thinkingTexts?: Record<string, string>
}

function splitThinkingAndData(text: string): { thinking: string; data: string } {
  const idx = text.indexOf(DATA_DELIMITER)
  if (idx === -1) return { thinking: text, data: '' }
  return {
    thinking: text.slice(0, idx).trim(),
    data: text.slice(idx + DATA_DELIMITER.length).trim(),
  }
}

function tryParseJSON(text: string): unknown | null {
  if (!text) return null
  try {
    const cleaned = text.trim()
    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenced) return JSON.parse(fenced[1].trim())
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

function DataCards({ data, stageId }: { data: unknown; stageId: string }) {
  if (!data || typeof data !== 'object') return null

  const obj = data as Record<string, unknown>

  if (stageId === 'retrieve' && Array.isArray(obj.evidence)) {
    return (
      <div className="sp-data-grid">
        {(obj.evidence as Array<Record<string, unknown>>).map((e, i) => (
          <div key={i} className="sp-data-card sp-evidence-card">
            <div className="sp-card-header">
              <span className="sp-card-badge">{String(e.id ?? `E${i + 1}`)}</span>
              <span className={`sp-tier sp-tier-${String(e.tier ?? 'T2').toLowerCase()}`}>
                {String(e.tier ?? 'T2')}
              </span>
            </div>
            <h4 className="sp-card-title"><a href={String(e.url ?? '')} target="_blank" rel="noopener noreferrer">{String(e.title ?? '')}</a></h4>
            <p className="sp-card-claim">{String(e.claim ?? '')}</p>
            <div className="sp-card-meta">
              <span>{String(e.source ?? '')}</span>
              <span>{String(e.year ?? '')}</span>
              <span>REL {String(e.relevance ?? '—')}</span>
              <span>CRED {String(e.credibility ?? '—')}</span>
            </div>
            {typeof e.url === 'string' && e.url && (
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="sp-card-link">
                Source →
              </a>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (stageId === 'map') {
    const c = obj.complexity as Record<string, unknown> | undefined
    const a = obj.architecture as Record<string, unknown> | undefined
    return (
      <div className="sp-data-grid sp-data-grid-2">
        {c && (
          <div className="sp-data-card">
            <div className="sp-card-header">
              <span className="sp-card-badge">COMPLEXITY</span>
              <span className="sp-score-badge">{String(c.score ?? '—')}/100</span>
            </div>
            <div className="sp-level-bar">
              <div
                className="sp-level-fill"
                style={{ width: `${Math.min(Number(c.score ?? 0), 100)}%` }}
              />
            </div>
            <div className="sp-card-badge-row">
              <span className={`sp-level-tag sp-level-${String(c.level ?? 'medium')}`}>
                {String(c.level ?? 'MEDIUM').toUpperCase()}
              </span>
            </div>
            {Array.isArray(c.rationale) && (
              <ul className="sp-rationale-list">
                {(c.rationale as string[]).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {a && (
          <div className="sp-data-card">
            <div className="sp-card-header">
              <span className="sp-card-badge">ARCHITECTURE</span>
            </div>
            <h4 className="sp-card-title">{String(a.mode ?? '').replace(/_/g, ' ').toUpperCase()}</h4>
            <p className="sp-card-claim">{String(a.reason ?? '')}</p>
            {Array.isArray(a.modules) && (
              <div className="sp-module-flow">
                {(a.modules as string[]).map((m, i) => (
                  <span key={i} className="sp-module-node">
                    {i > 0 && <span className="sp-module-arrow">→</span>}
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (stageId === 'compare' && Array.isArray(obj.candidates)) {
    return (
      <div className="sp-data-grid">
        {(obj.candidates as Array<Record<string, unknown>>).map((c, i) => (
          <div key={i} className="sp-data-card sp-candidate-card">
            <div className="sp-card-header">
              <span className="sp-card-badge">{String(c.id ?? `P${i + 1}`)}</span>
              <span className="sp-score-badge">SCORE {String(c.score ?? '—')}</span>
            </div>
            <h4 className="sp-card-title">{String(c.name ?? '')}</h4>
            <p className="sp-card-claim">{String(c.hypothesis ?? '')}</p>
            <div className="sp-metric-bars">
              {(['novelty', 'feasibility', 'impact', 'risk', 'evidenceCoverage'] as const).map((k) => (
                <div key={k} className="sp-metric-row">
                  <span className="sp-metric-label">{k.slice(0, 4).toUpperCase()}</span>
                  <div className="sp-metric-bar">
                    <div
                      className={`sp-metric-fill ${k === 'risk' ? 'sp-fill-risk' : ''}`}
                      style={{ width: `${Number(c[k] ?? 0)}%` }}
                    />
                  </div>
                  <span className="sp-metric-value">{String(c[k] ?? '—')}</span>
                </div>
              ))}
            </div>
            <div className="sp-card-meta">
              <span>CONF {String(c.confidence ?? '—')}%</span>
              {Array.isArray(c.evidenceIds) && (
                <span>{(c.evidenceIds as string[]).map(id => <a className="citation-chip" href={`#evidence-${id}`} key={id}>{id}</a>)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (stageId === 'converge' && obj.recommendation) {
    const r = obj.recommendation as Record<string, unknown>
    return (
      <div className="sp-converge-layout">
        <div className="sp-data-card sp-rec-card">
          <div className="sp-card-header">
            <span className="sp-card-badge sp-badge-accent">RECOMMENDATION</span>
            <span className="sp-rec-path-badge">{String(r.selectedPathId ?? '—')}</span>
          </div>
          {Array.isArray(r.why) && (
            <ul className="sp-rec-reasons">
              {(r.why as string[]).map((w, i) => (
                <li key={i}>
                  <span className="sp-rec-reason-num">{i + 1}</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {Array.isArray(r.nextSevenDays) && (
          <div className="sp-data-card sp-plan-card">
            <div className="sp-card-header">
              <span className="sp-card-badge">7-DAY ACTION PLAN</span>
            </div>
            <div className="sp-plan-timeline">
              {(r.nextSevenDays as string[]).map((d, i) => {
                const dayMatch = String(d).match(/^(Day\s*\d[\d\s\-–~]*:?\s*)/i)
                const dayLabel = dayMatch ? dayMatch[1].replace(/:?\s*$/, '') : `Day ${i + 1}`
                const dayDesc = dayMatch ? String(d).slice(dayMatch[0].length) : String(d)
                return (
                  <div key={i} className="sp-plan-step">
                    <div className="sp-plan-step-indicator">
                      <span className="sp-plan-dot" />
                      {i < ((r.nextSevenDays as string[]).length - 1) && (
                        <span className="sp-plan-line" />
                      )}
                    </div>
                    <div className="sp-plan-step-content">
                      <span className="sp-plan-day-label">{dayLabel}</span>
                      <span className="sp-plan-day-desc">{dayDesc}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {Array.isArray(r.manualConfirmations) && (r.manualConfirmations as string[]).length > 0 && (
          <div className="sp-data-card sp-confirm-card">
            <div className="sp-card-header">
              <span className="sp-card-badge">CONFIRMATIONS</span>
            </div>
            <ul className="sp-confirm-list">
              {(r.manualConfirmations as string[]).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  return null
}

function ThinkingBlock({ text, isRunning }: { text: string; isRunning: boolean }) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && expanded) el.scrollTop = el.scrollHeight
  }, [text, expanded])

  const handleToggle = useCallback(() => setExpanded((p) => !p), [])

  if (!text) return null

  return (
    <div className="sp-thinking-block">
      <div className="sp-thinking-header">
        <span className="sp-thinking-label">
          {isRunning ? '⟳ ' : '✓ '}THINKING
        </span>
        <button type="button" className="stream-toggle" onClick={handleToggle}>
          {expanded ? t('sp.collapse') : t('sp.expand')}
        </button>
      </div>
      <div
        className={`sp-thinking-body ${expanded ? '' : 'stream-collapsed'}`}
        ref={scrollRef}
      >
        <div className="sp-md-content">
          <Markdown remarkPlugins={remarkPlugins}>{text}</Markdown>
        </div>
      </div>
    </div>
  )
}

function StageContent({
  text,
  thinkingText,
  isRunning,
  isDone,
  stageId,
}: {
  text: string
  thinkingText: string
  isRunning: boolean
  isDone: boolean
  stageId: string
}) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [manualOverride, setManualOverride] = useState<boolean | null>(null)

  const collapsed = manualOverride !== null ? manualOverride : isDone

  const handleToggle = useCallback(() => {
    setManualOverride((prev) => (prev !== null ? !prev : !isDone))
  }, [isDone])

  const { thinking, data } = useMemo(() => splitThinkingAndData(text), [text])
  const parsedData = useMemo(() => tryParseJSON(data), [data])

  useEffect(() => {
    const el = scrollRef.current
    if (el && !collapsed) el.scrollTop = el.scrollHeight
  }, [thinking, collapsed])

  return (
    <div className="stream-text-wrap">
      {thinkingText && (
        <ThinkingBlock text={thinkingText} isRunning={isRunning} />
      )}

      <div className="sp-section-tabs">
        <span className="sp-section-label">
          {isRunning ? t('sp.thinking') : t('sp.data')}
        </span>
        {isDone && (
          <button
            type="button"
            className="stream-toggle"
            onClick={handleToggle}
          >
            {collapsed ? t('sp.expand') : t('sp.collapse')}
          </button>
        )}
      </div>

      <div
        className={`stream-scroll ${collapsed ? 'stream-collapsed' : ''}`}
        ref={scrollRef}
      >
        <div className="sp-md-content">
          <Markdown remarkPlugins={remarkPlugins}>{thinking}</Markdown>
          {isRunning && <span className="stream-cursor">█</span>}
        </div>
      </div>

      {isDone && parsedData !== null && (
        <div className="sp-data-section">
          <DataCards data={parsedData} stageId={stageId} />
        </div>
      )}
    </div>
  )
}

function statusLabel(s: string): string {
  if (s === 'running') return 'RUNNING'
  if (s === 'done') return '✓ DONE'
  if (s === 'error') return '✕ ERROR'
  return 'PENDING'
}

export function StreamPanel({ pipeline, streamTexts, thinkingTexts }: Props) {
  const { t } = useI18n()
  const hasAny = pipeline.some((s) => s.status !== 'idle')
  const [userSelectedIdx, setUserSelectedIdx] = useState<number | null>(null)

  const activeStages = useMemo(
    () => pipeline.filter((s) => s.status !== 'idle'),
    [pipeline],
  )

  const latestIdx = activeStages.length - 1
  const activeIdx = userSelectedIdx !== null && userSelectedIdx <= latestIdx
    ? userSelectedIdx
    : Math.max(0, latestIdx)

  if (!hasAny) return null

  return (
    <section className="stream-panel panel animate-in" id="sec-thinking">
      <h2>{t('sp.title')}</h2>

      <nav className="sp-step-nav" aria-label="Pipeline stages">
        {pipeline.map((stage, i) => {
          const isIdle = stage.status === 'idle'
          const isActive = activeStages[activeIdx]?.id === stage.id
          return (
            <button
              key={stage.id}
              type="button"
              className={`sp-step-btn ${isActive ? 'sp-step-active' : ''} sp-step-${stage.status}`}
              disabled={isIdle}
              onClick={() => {
                const idx = activeStages.findIndex((s) => s.id === stage.id)
                if (idx >= 0) setUserSelectedIdx(idx)
              }}
            >
              <span className="sp-step-num">{i + 1}</span>
              <span className="sp-step-name">{stage.name}</span>
              <span className={`sp-step-badge stream-badge-${stage.status}`}>
                {statusLabel(stage.status)}
              </span>
            </button>
          )
        })}
      </nav>

      {activeStages[activeIdx] && (() => {
        const stage = activeStages[activeIdx]
        const text = streamTexts[stage.id] ?? ''
        const thinkingText = thinkingTexts?.[stage.id] ?? ''
        const isRunning = stage.status === 'running'
        const isDone = stage.status === 'done'

        return (
          <div className="stream-stage stream-active">
            {(text.length > 0 || thinkingText.length > 0) && (
              <StageContent
                text={text}
                thinkingText={thinkingText}
                isRunning={isRunning}
                isDone={isDone}
                stageId={stage.id}
              />
            )}
          </div>
        )
      })()}

      <div className="sp-nav-footer">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={activeIdx <= 0}
          onClick={() => setUserSelectedIdx(activeIdx - 1)}
        >
          ← {t('sp.navPrev')}
        </button>
        <span className="sp-nav-indicator">
          {t('sp.step')} {activeIdx + 1} / {activeStages.length}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={activeIdx >= activeStages.length - 1}
          onClick={() => setUserSelectedIdx(activeIdx + 1)}
        >
          {t('sp.navNext')} →
        </button>
      </div>
    </section>
  )
}
