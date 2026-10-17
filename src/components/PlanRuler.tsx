import { useI18n } from '../i18n'

export function PlanRuler({ tasks }: { tasks: string[] }) {
  const { t } = useI18n()
  const entries = tasks.map((task, index) => {
    const match = task.match(/^(?:Day\s*|第\s*)([1-7])(?:\s*[-–~至]\s*([1-7]))?\s*(?:天)?\s*[:：·-]?\s*/i)
    const start = match ? Number(match[1]) : Math.min(index + 1, 7)
    const end = match?.[2] ? Math.max(start, Number(match[2])) : start
    return { task: match ? task.slice(match[0].length) : task, start, end }
  })
  return <div className="plan-ruler">
    {Array.from({ length: 7 }, (_, i) => <span key={i} className="plan-major" style={{ gridColumn: i + 1 }}>{t('ui.day', { n: i + 1 })}</span>)}
    {entries.map((entry, i) => <div className="plan-task" key={i} style={{ gridColumn: `${entry.start} / ${entry.end + 1}` }}><span className="plan-mobile-day">{t('ui.day', { n: entry.start })}{entry.end > entry.start ? `–${entry.end}` : ''}</span>{entry.task}</div>)}
  </div>
}
