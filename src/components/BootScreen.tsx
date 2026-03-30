import { useEffect, useState } from 'react'

const BOOT_LINES = [
  { text: '> BIOS CHECK...................', delay: 200, suffix: 'OK' },
  { text: '> MEMORY TEST 640K.............', delay: 350, suffix: 'PASS' },
  { text: '> LOADING KERNEL...............', delay: 400, suffix: 'OK' },
  { text: '> MOUNTING FILE SYSTEM.........', delay: 300, suffix: 'OK' },
  { text: '> INITIALIZING GPU CORES.......', delay: 500, suffix: '4096 UNITS' },
  { text: '> LOADING AI MODEL WEIGHTS.....', delay: 600, suffix: 'OK' },
  { text: '> COMPILING RESEARCH AGENTS....', delay: 450, suffix: 'OK' },
  { text: '> CONNECTING KNOWLEDGE BASE....', delay: 350, suffix: 'LINKED' },
  { text: '> CALIBRATING NLP PIPELINE.....', delay: 400, suffix: 'READY' },
  { text: '> SYSTEM STATUS................', delay: 300, suffix: 'ALL GREEN' },
]

interface Props {
  onComplete: () => void
}

export function BootScreen({ onComplete }: Props) {
  const [lines, setLines] = useState<Array<{ text: string; done: boolean; suffix: string }>>([])
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'boot' | 'logo' | 'done'>('boot')

  useEffect(() => {
    let cancelled = false
    async function run() {
      for (let i = 0; i < BOOT_LINES.length; i++) {
        if (cancelled) return
        const line = BOOT_LINES[i]
        setLines((prev) => [...prev, { text: line.text, done: false, suffix: line.suffix }])
        setProgress(((i + 0.5) / BOOT_LINES.length) * 100)
        await new Promise((r) => setTimeout(r, line.delay))
        if (cancelled) return
        setLines((prev) =>
          prev.map((l, idx) => (idx === i ? { ...l, done: true } : l)),
        )
        setProgress(((i + 1) / BOOT_LINES.length) * 100)
      }
      if (cancelled) return
      await new Promise((r) => setTimeout(r, 400))
      setPhase('logo')
      await new Promise((r) => setTimeout(r, 1800))
      if (cancelled) return
      setPhase('done')
      onComplete()
    }
    void run()
    return () => { cancelled = true }
  }, [onComplete])

  if (phase === 'done') return null

  return (
    <div className="boot-screen">
      {phase === 'boot' && (
        <div className="boot-terminal">
          <div className="boot-header">
            <span className="boot-brand">RESEARCH TOPIC AGENT</span>
            <span className="boot-ver">v1.0</span>
          </div>
          <div className="boot-lines">
            {lines.map((l, i) => (
              <div key={i} className={`boot-line ${l.done ? 'done' : 'pending'}`}>
                <span className="boot-cmd">{l.text}</span>
                {l.done ? (
                  <span className="boot-ok">{l.suffix}</span>
                ) : (
                  <span className="boot-spinner" />
                )}
              </div>
            ))}
          </div>
          <div className="boot-progress-bar">
            <div className="boot-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="boot-progress-label">{Math.round(progress)}%</div>
        </div>
      )}
      {phase === 'logo' && (
        <div className="boot-logo-reveal">
          <div className="boot-logo-glow">
            <img src="/logo.svg" alt="" className="boot-logo-icon" width="80" height="80" />
            <h1 className="boot-logo-text">RESEARCH TOPIC AGENT</h1>
            <p className="boot-logo-sub">AI-Powered Research Direction System</p>
          </div>
          <div className="boot-particles" aria-hidden="true">
            {Array.from({ length: 20 }).map((_, i) => (
              <span key={i} className="boot-particle" style={{
                '--px': `${Math.random() * 100}%`,
                '--py': `${Math.random() * 100}%`,
                '--d': `${0.5 + Math.random() * 1.5}s`,
              } as React.CSSProperties} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
