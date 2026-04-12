import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { type AgentRunResult, type TopicInput } from '../types'

interface SharedSession {
  id: string
  input_data: TopicInput
  result_data: AgentRunResult | null
  locale: string
  created_at: string
}

export function SharePage() {
  const { token } = useParams<{ token: string }>()
  const [session, setSession] = useState<SharedSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    fetch(`/functions/share-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session_id: token, action: 'get' }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setSession(data.session)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="share-page loading">
        <div className="pixel-spinner" />
        <p>Loading shared research...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="share-page error">
        <h2>🔬 Session Not Found</h2>
        <p>{error}</p>
        <p className="hint">This link may have expired or been revoked.</p>
      </div>
    )
  }

  if (!session) return null

  const result = session.result_data
  const input = session.input_data
  const isZh = session.locale === 'zh'

  return (
    <div className="share-page">
      <header className="share-header">
        <h1>🔬 Research Topic Agent</h1>
        <p className="subtitle">
          {isZh ? '公开分享的选题研究结果' : 'Public shared research topic results'}
        </p>
        <p className="meta">
          {isZh ? '研究兴趣：' : 'Research Interest: '}{input?.researchInterest}
        </p>
        <p className="meta">
          {isZh ? '问题域：' : 'Problem Domain: '}{input?.problemDomain}
        </p>
        <p className="meta">
          {isZh ? '分享时间：' : 'Shared at: '}
          {new Date(session.created_at).toLocaleString(isZh ? 'zh-CN' : 'en-US')}
        </p>
      </header>

      {result && (
        <>
          {/* Architecture */}
          <section className="share-section">
            <h2>{isZh ? '🏗️ 推荐架构' : '🏗️ Recommended Architecture'}</h2>
            <div className="architecture-card">
              <span className="arch-mode">{result.architecture?.mode}</span>
              <span className="arch-reason">{result.architecture?.reason}</span>
              <div className="arch-modules">
                {result.architecture?.modules?.map((m, i) => (
                  <span key={i} className="module-chip">{m}</span>
                ))}
              </div>
            </div>
          </section>

          {/* Evidence */}
          <section className="share-section">
            <h2>{isZh ? '📚 证据池' : '📚 Evidence Pool'}</h2>
            <div className="evidence-grid">
              {result.evidence?.map(e => (
                <div key={e.id} className={`evidence-card tier-${e.tier}`}>
                  <div className="evidence-header">
                    <span className={`tier-badge tier-${e.tier}`}>{e.tier}</span>
                    <span className="evidence-source">{e.source} ({e.year})</span>
                  </div>
                  <h3>{e.title}</h3>
                  <p>{e.claim}</p>
                  <div className="evidence-footer">
                    <span>🔗 <a href={e.url} target="_blank" rel="noopener noreferrer">View Source</a></span>
                    <span>Relevance: {e.relevance} | Credibility: {e.credibility}</span>
                  </div>
                  {e.conflictsWith && e.conflictsWith.length > 0 && (
                    <div className="conflict-warning">
                      ⚠️ {isZh ? '冲突证据：' : 'Conflicts with: '}{e.conflictsWith.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Candidates */}
          <section className="share-section">
            <h2>{isZh ? '📊 候选路径比较' : '📊 Candidate Path Comparison'}</h2>
            <div className="candidates-table">
              <table>
                <thead>
                  <tr>
                    <th>{isZh ? '路径' : 'Path'}</th>
                    <th>{isZh ? '新颖性' : 'Novelty'}</th>
                    <th>{isZh ? '可行性' : 'Feasibility'}</th>
                    <th>{isZh ? '影响力' : 'Impact'}</th>
                    <th>{isZh ? '风险' : 'Risk'}</th>
                    <th>{isZh ? '证据覆盖' : 'Evidence'}</th>
                    <th>{isZh ? '综合得分' : 'Score'}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.candidates?.map(c => (
                    <tr key={c.id} className={result.recommendation?.selectedPathId === c.id ? 'recommended' : ''}>
                      <td>
                        <strong>{c.id}: {c.name}</strong>
                        {result.recommendation?.selectedPathId === c.id && (
                          <span className="recommended-badge">✓ {isZh ? '推荐' : 'Recommended'}</span>
                        )}
                      </td>
                      <td><div className="score-bar"><div style={{ width: `${c.novelty}%` }} className="fill novelty" /></div>{c.novelty}</td>
                      <td><div className="score-bar"><div style={{ width: `${c.feasibility}%` }} className="fill feasibility" /></div>{c.feasibility}</td>
                      <td><div className="score-bar"><div style={{ width: `${c.impact}%` }} className="fill impact" /></div>{c.impact}</td>
                      <td><div className="score-bar"><div style={{ width: `${c.risk}%` }} className="fill risk" /></div>{c.risk}</td>
                      <td><div className="score-bar"><div style={{ width: `${c.evidenceCoverage}%` }} className="fill evidence" /></div>{c.evidenceCoverage}</td>
                      <td><strong>{c.score}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Recommendation */}
          <section className="share-section">
            <h2>{isZh ? '🎯 收敛推荐' : '🎯 Convergence & Recommendation'}</h2>
            {result.recommendation && (
              <div className="recommendation-card">
                <h3>
                  {isZh ? '推荐路径：' : 'Selected Path: '}
                  {result.recommendation.selectedPathId}
                </h3>
                <div className="why-list">
                  <strong>{isZh ? '选择理由：' : 'Why this path: '}</strong>
                  <ul>
                    {result.recommendation.why?.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
                <div className="seven-days">
                  <strong>{isZh ? '🗓️ 7天行动计划：' : '🗓️ 7-Day Action Plan: '}</strong>
                  <ol>
                    {result.recommendation.nextSevenDays?.map((d, i) => <li key={i}>{d}</li>)}
                  </ol>
                </div>
              </div>
            )}
          </section>

          {/* Evaluation Metrics */}
          <section className="share-section">
            <h2>{isZh ? '📏 评价指标体系' : '📏 Evaluation Metrics'}</h2>
            <div className="metrics-grid">
              {result.evaluationPlan?.map(m => (
                <div key={m.id} className="metric-card">
                  <div className="metric-name">{m.name}</div>
                  <div className="metric-def">{m.definition}</div>
                  <div className="metric-target">Target: {m.target}</div>
                  <div className="metric-type">{m.type}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <footer className="share-footer">
        <p>
          Built with 🔬{' '}
          <a href="https://github.com/ColeFang/research-thinking-ai" target="_blank" rel="noopener noreferrer">
            Research Topic Agent
          </a>
          {' '}|{' '}
          <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">
            Powered by Supabase
          </a>
        </p>
      </footer>
    </div>
  )
}
