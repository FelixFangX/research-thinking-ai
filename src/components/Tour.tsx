import { useCallback, useEffect, useState } from 'react'

export interface TourStep {
  target: string
  title: string
  content: string
  placement?: 'top' | 'bottom'
}

interface Props {
  steps: TourStep[]
  onComplete: () => void
}

const PAD = 8
const GAP = 14

export function Tour({ steps, onComplete }: Props) {
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const step = steps[idx]
  const isLast = idx === steps.length - 1

  const measure = useCallback(() => {
    if (!step) return
    const el = document.querySelector(step.target)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      requestAnimationFrame(() => setRect(el.getBoundingClientRect()))
    }
  }, [step])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onComplete()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onComplete])

  if (!step || !rect) return null

  const vh = window.innerHeight
  const vw = window.innerWidth

  const spaceAbove = rect.top - PAD - GAP
  const spaceBelow = vh - rect.bottom - PAD - GAP

  const mid = vh / 2
  const preferBottom = rect.top + rect.height / 2 <= mid
  const place =
    step.placement ?? (preferBottom && spaceBelow >= 120 ? 'bottom' : spaceAbove >= 120 ? 'top' : 'bottom')

  const spotlightStyle: React.CSSProperties = {
    top: rect.top - PAD,
    left: Math.max(0, rect.left - PAD),
    width: Math.min(rect.width + PAD * 2, vw),
    height: rect.height + PAD * 2,
  }

  const tooltipWidth = Math.min(380, vw - 32)
  const tooltipLeft = Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, vw - tooltipWidth - 16))

  const tooltipStyle: React.CSSProperties = {
    left: tooltipLeft,
    maxHeight: `${Math.min(place === 'bottom' ? spaceBelow : spaceAbove, vh * 0.5)}px`,
    overflowY: 'auto',
    ...(place === 'bottom'
      ? { top: Math.min(rect.bottom + PAD + GAP, vh - 140) }
      : { bottom: Math.max(vh - rect.top + PAD + GAP, 16) }),
  }

  return (
    <>
      <div className="tour-click-block" />
      <div className="tour-spotlight" style={spotlightStyle} />
      <div className="tour-tooltip" style={tooltipStyle}>
        <div className="tour-step-num">
          STEP {idx + 1} / {steps.length}
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-desc">{step.content}</p>
        <div className="tour-actions">
          <button
            className="btn btn-ghost tour-skip-btn"
            type="button"
            onClick={onComplete}
          >
            [ SKIP ]
          </button>
          <div className="tour-nav">
            {idx > 0 && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setIdx((i) => i - 1)}
              >
                [ BACK ]
              </button>
            )}
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => (isLast ? onComplete() : setIdx((i) => i + 1))}
            >
              {isLast ? '[ DONE ]' : '[ NEXT ]'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
