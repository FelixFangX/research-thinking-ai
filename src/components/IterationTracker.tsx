import { useMemo, useState } from 'react'
import type { AgentRunResult, IterationPlan } from '../types'
import { useI18n } from '../i18n'

interface Props {
  plan: IterationPlan
  currentResult: AgentRunResult | null
  previousResult: AgentRunResult | null
  onToggleDay: (planId: string, dayId: string) => void | Promise<void>
  onAddJournal: (planId: string, note: string) => void | Promise<void>
  onComplete: (planId: string) => void | Promise<void>
  onAbandon: (planId: string) => void | Promise<void>
  onRerun: () => void
  onBack: () => void
}

type Tab = 'checklist' | 'journal' | 'actions' | 'compare'

export function IterationTracker({
  plan,
  currentResult,
  previousResult,
  onToggleDay,
  onAddJournal,
  onComplete,
  onAbandon,
  onRerun,
  onBack,
}: Props) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('checklist')
  const [journalDraft, setJournalDraft] = useState('')

  const checked = plan.days.filter((d) => d.checked).length
  const total = plan.days.length
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0
  const elapsed = useMemo(() => {
    const ms = new Date().getTime() - new Date(plan.createdAt).getTime()
    return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)))
  }, [plan.createdAt])

  const handleAddJournal = () => {
    const note = journalDraft.trim()
    if (!note) return
    onAddJournal(plan.id, note)
    setJournalDraft('')
  }

  return (
    <section className="iter-tracker panel animate-in">
      {/* Header */}
      <header className="iter-header">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {t('iter.back')}
        </button>
        <h2>{t('iter.title')}</h2>
        <span className={`iter-status-badge iter-st-${plan.status}`}>
          {t(`iter.status.${plan.status}`)}
        </span>
      </header>

      {/* Meta row */}
      <div className="iter-meta">
        <span className="iter-meta-item">
          <strong>{t('iter.path')}:</strong> {plan.pathName}
        </span>
        <span className="iter-meta-item">
          {t('iter.daysSince', { n: elapsed })}
        </span>
        <span className="iter-meta-item">
          <strong>{t('iter.progress')}:</strong> {checked}/{total} ({pct}%)
        </span>
      </div>

      {/* Progress bar */}
      <div className="iter-progress-bar">
        <div className="iter-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Tab navigation */}
      <nav className="iter-tabs">
        {(['checklist', 'journal', 'actions', 'compare'] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`iter-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {id === 'checklist'
              ? t('iter.checklist')
              : id === 'journal'
                ? t('iter.journal')
                : id === 'actions'
                  ? t('iter.actions')
                  : t('iter.compare')}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="iter-tab-content">
        {tab === 'checklist' && (
          <div className="iter-checklist">
            {plan.days.map((day) => {
              const dayMatch = day.label.match(/^(Day\s*[\d\s\-–~]+):?\s*/i)
              const dayTag = dayMatch ? dayMatch[1].trim() : null
              const desc = dayMatch ? day.label.slice(dayMatch[0].length) : day.label
              return (
                <label key={day.id} className={`iter-day ${day.checked ? 'done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={day.checked}
                    onChange={() => onToggleDay(plan.id, day.id)}
                    disabled={plan.status !== 'active'}
                  />
                  {dayTag && <span className="iter-day-num">{dayTag}</span>}
                  <span className="iter-day-label">{desc}</span>
                  {day.completedAt && (
                    <span className="iter-day-date">
                      {new Date(day.completedAt).toLocaleDateString()}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        )}

        {tab === 'journal' && (
          <div className="iter-journal">
            {plan.status === 'active' && (
              <div className="iter-journal-form">
                <textarea
                  value={journalDraft}
                  onChange={(e) => setJournalDraft(e.target.value)}
                  placeholder={t('iter.journalPlaceholder')}
                  rows={3}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleAddJournal}
                  disabled={!journalDraft.trim()}
                >
                  {t('iter.add')}
                </button>
              </div>
            )}
            {plan.journal.length === 0 && (
              <p className="muted">{t('iter.noEntries')}</p>
            )}
            {plan.journal.map((entry) => (
              <div key={entry.id} className="iter-journal-entry">
                <span className="iter-journal-date">
                  {new Date(entry.date).toLocaleString()}
                </span>
                <p>{entry.note}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'actions' && (
          <div className="iter-actions">
            <div className="iter-action-card">
              <h4>{t('iter.rerun')}</h4>
              <p className="muted">{t('iter.rerunDesc')}</p>
              <button type="button" className="btn btn-secondary" onClick={onRerun}>
                {t('iter.rerun')}
              </button>
            </div>
            <div className="iter-action-card">
              <h4>{t('iter.compare')}</h4>
              <p className="muted">
                {previousResult ? t('iter.compareDesc') : t('iter.noPrev')}
              </p>
              <button
                type="button"
                className="btn"
                disabled={!previousResult}
                onClick={() => setTab('compare')}
              >
                {t('iter.compare')}
              </button>
            </div>
            {plan.status === 'active' && (
              <div className="iter-action-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onComplete(plan.id)}
                >
                  {t('iter.complete')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => onAbandon(plan.id)}
                >
                  {t('iter.abandon')}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'compare' && (
          <div className="iter-compare">
            {previousResult && currentResult ? (
              <CompareView
                current={currentResult}
                previous={previousResult}
                t={t}
              />
            ) : (
              <p className="muted">{t('iter.noPrev')}</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function CompareView({
  current,
  previous,
  t: tr,
}: {
  current: AgentRunResult
  previous: AgentRunResult
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  return (
    <div className="iter-compare-grid">
      <div className="iter-compare-col">
        <h4>{tr('iter.current')}</h4>
        <ul>
          {current.candidates.map((c) => (
            <li key={c.id} className={c.id === current.recommendation.selectedPathId ? 'selected' : ''}>
              <strong>{c.name}</strong> — {c.score}/100 ({c.confidence}%)
            </li>
          ))}
        </ul>
        <p className="muted">
          {current.recommendation.why.join(' ')}
        </p>
      </div>
      <div className="iter-compare-divider" />
      <div className="iter-compare-col">
        <h4>{tr('iter.previous')}</h4>
        <ul>
          {previous.candidates.map((c) => (
            <li key={c.id} className={c.id === previous.recommendation.selectedPathId ? 'selected' : ''}>
              <strong>{c.name}</strong> — {c.score}/100 ({c.confidence}%)
            </li>
          ))}
        </ul>
        <p className="muted">
          {previous.recommendation.why.join(' ')}
        </p>
      </div>
    </div>
  )
}
