import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { EvidenceItem } from '../src/types'

export interface DigestSource {
  /** Local tech-news-digest daily/ directory, or */
  dir?: string
  /** Base URL serving <date>.json files (e.g. raw.githubusercontent.com/<owner>/tech-news-digest/master/daily) */
  baseUrl?: string
  fetch?: typeof fetch
}

interface DigestItem {
  id: string
  category: string
  title: string
  url: string
  text?: string
  tags?: string[]
}

const terms = (t: string) => t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2)

function lastDays(today: string, n: number): string[] {
  const end = new Date(`${today}T00:00:00Z`)
  return Array.from({ length: n }, (_, i) => new Date(end.getTime() - i * 86400000).toISOString().slice(0, 10))
}

async function readDay(src: DigestSource, day: string): Promise<DigestItem[]> {
  try {
    if (src.dir) {
      const files = await readdir(src.dir)
      if (!files.includes(`${day}.json`)) return []
      return JSON.parse(await readFile(path.join(src.dir, `${day}.json`), 'utf8')).items ?? []
    }
    if (src.baseUrl) {
      const r = await (src.fetch ?? fetch)(`${src.baseUrl.replace(/\/$/, '')}/${day}.json`)
      return r.ok ? ((await r.json()) as { items?: DigestItem[] }).items ?? [] : []
    }
  } catch {
    return []
  }
  return []
}

/** Papers from the last 7 days of digest.json that share at least half the topic's terms. */
export async function collectDigestEvidence(src: DigestSource, topic: string, today: string, days = 7): Promise<EvidenceItem[]> {
  const want = [...new Set(terms(topic))]
  const out: EvidenceItem[] = []
  for (const day of lastDays(today, days)) {
    for (const it of await readDay(src, day)) {
      if (it.category !== 'paper' || !it.url) continue
      const have = new Set(terms(`${it.title} ${it.text ?? ''} ${(it.tags ?? []).join(' ')}`))
      const hit = want.filter((w) => have.has(w)).length
      if (want.length && hit / want.length >= 0.5) {
        out.push({ id: it.id, title: it.title, source: 'tech-news-digest', url: it.url, year: Number(day.slice(0, 4)), tier: 'T2', claim: `Surfaced by the daily digest on ${day}.`, relevance: 70, credibility: 70, conflictsWith: [] })
      }
    }
  }
  return out
}

export interface Snapshot {
  date: string
  directions: Array<{ id: string; name: string; score: number }>
  evidence: Array<{ title: string; url: string; citation?: string }>
}

export function diffDirections(prev: Snapshot | null, next: Snapshot) {
  const before = new Map((prev?.directions ?? []).map((d, i) => [d.name, i + 1]))
  const after = new Map(next.directions.map((d, i) => [d.name, i + 1]))
  const moved = [...after].filter(([n, to]) => before.has(n) && before.get(n) !== to).map(([name, to]) => ({ name, from: before.get(name)!, to }))
  const added = [...after.keys()].filter((n) => !before.has(n))
  const dropped = [...before.keys()].filter((n) => !after.has(n))
  const seen = new Set((prev?.evidence ?? []).map((e) => e.url))
  const newEvidence = next.evidence.filter((e) => !seen.has(e.url))
  return { moved, added, dropped, newEvidence }
}

export function renderWatchNote(topic: string, next: Snapshot, d: ReturnType<typeof diffDirections>): string {
  const lines = [`# What changed: ${topic}`, '', `Week of ${next.date}.`, '', '## Directions (ranked)']
  next.directions.forEach((x, i) => lines.push(`${i + 1}. ${x.name} (score ${x.score})`))
  lines.push('', '## Changes')
  if (!d.moved.length && !d.added.length && !d.dropped.length) lines.push('- Ranking unchanged.')
  for (const m of d.moved) lines.push(`- ${m.name}: #${m.from} → #${m.to}`)
  for (const a of d.added) lines.push(`- New: ${a}`)
  for (const x of d.dropped) lines.push(`- Dropped: ${x}`)
  lines.push('', `## New evidence (${d.newEvidence.length})`)
  for (const e of d.newEvidence) lines.push(`- [${e.title}](${e.url})${e.citation ? ` (${e.citation})` : ''}`)
  return lines.join('\n') + '\n'
}
