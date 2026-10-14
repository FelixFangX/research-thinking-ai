import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { EvidenceItem } from '../src/types'

export interface DigestSource {
  /** Local digest daily/ directory (e.g. a checkout of the private tech-news-digest repo), or */
  dir?: string
  /** Base URL serving <date>.json files. Optional: the digest repo is private, so CI runs without it. */
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

/** null = source unreachable (missing dir, HTTP error, network); [] = reachable but no file for that day. */
async function readDay(src: DigestSource, day: string): Promise<DigestItem[] | null> {
  try {
    if (src.dir) {
      const files = await readdir(src.dir)
      if (!files.includes(`${day}.json`)) return []
      return JSON.parse(await readFile(path.join(src.dir, `${day}.json`), 'utf8')).items ?? []
    }
    if (src.baseUrl) {
      const r = await (src.fetch ?? fetch)(`${src.baseUrl.replace(/\/$/, '')}/${day}.json`)
      if (r.status === 404) return []
      return r.ok ? ((await r.json()) as { items?: DigestItem[] }).items ?? [] : null
    }
  } catch {
    return null
  }
  return null
}

export type DigestStatus = 'off' | 'unavailable' | 'empty' | 'ok'

export interface DigestResult {
  /** off: no source configured; unavailable: source unreachable; empty: reachable, no digest files in range. */
  status: DigestStatus
  daysWithData: number
  evidence: EvidenceItem[]
}

/** Papers from the last 7 days of digest.json that share at least half the topic's terms, plus how the source behaved. */
export async function collectDigest(src: DigestSource, topic: string, today: string, days = 7): Promise<DigestResult> {
  if (!src.dir && !src.baseUrl) return { status: 'off', daysWithData: 0, evidence: [] }
  const want = [...new Set(terms(topic))]
  const evidence: EvidenceItem[] = []
  let reachable = 0
  let daysWithData = 0
  for (const day of lastDays(today, days)) {
    const items = await readDay(src, day)
    if (items === null) continue
    reachable++
    if (items.length) daysWithData++
    for (const it of items) {
      if (it.category !== 'paper' || !it.url) continue
      const have = new Set(terms(`${it.title} ${it.text ?? ''} ${(it.tags ?? []).join(' ')}`))
      const hit = want.filter((w) => have.has(w)).length
      if (want.length && hit / want.length >= 0.5) {
        evidence.push({ id: it.id, title: it.title, source: 'tech-news-digest', url: it.url, year: Number(day.slice(0, 4)), tier: 'T2', claim: `Surfaced by the daily digest on ${day}.`, relevance: 70, credibility: 70, conflictsWith: [] })
      }
    }
  }
  const status: DigestStatus = !reachable ? 'unavailable' : daysWithData ? 'ok' : 'empty'
  return { status, daysWithData, evidence }
}

/** Evidence only; see collectDigest for the source status. */
export async function collectDigestEvidence(src: DigestSource, topic: string, today: string, days = 7): Promise<EvidenceItem[]> {
  return (await collectDigest(src, topic, today, days)).evidence
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

const DIGEST_NOTE: Record<DigestStatus, string> = {
  off: 'Digest: not configured; evidence from OpenAlex only.',
  unavailable: 'Digest: unreachable this week; evidence from OpenAlex only.',
  empty: 'Digest: reachable, but no digest files in the last 7 days.',
  ok: 'Digest: included.',
}

export function renderWatchNote(topic: string, next: Snapshot, d: ReturnType<typeof diffDirections>, digest?: DigestStatus): string {
  const lines = [`# What changed: ${topic}`, '', `Week of ${next.date}.${digest ? ` ${DIGEST_NOTE[digest]}` : ''}`, '', '## Directions (ranked)']
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
