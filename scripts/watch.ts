// Weekly watch: re-rank directions per topic using digest.json + OpenAlex, and write a "what changed" note.
//   pnpm watch [--digest-dir <digest daily/ dir> | --digest-url <base>]   (both optional; without them: OpenAlex only) [--state watch/state] [--out watch/out] [--json]
// Never commits, posts or sends anything; it only writes files under --state and --out.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { propose } from '../server/research'
import { collectDigest, diffDirections, renderWatchNote, type Snapshot } from '../server/watch'

const args = process.argv.slice(2)
const opt = (n: string, d?: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const stateDir = opt('--state', 'watch/state')!
const outDir = opt('--out', 'watch/out')!
const today = opt('--date', new Date().toISOString().slice(0, 10))!
const topics = JSON.parse(readFileSync(opt('--topics', 'watch/topics.json')!, 'utf8')) as Array<{ topic: string; domain?: string }>
const src = { dir: opt('--digest-dir') || undefined, baseUrl: opt('--digest-url') || undefined }
mkdirSync(stateDir, { recursive: true })
mkdirSync(outDir, { recursive: true })

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const summary = []
for (const { topic, domain } of topics) {
  const dg = await collectDigest(src, topic, today)
  const digest = dg.evidence
  const r = await propose({ interest: topic, domain, extraEvidence: digest }, { llm: null })
  const next: Snapshot = { date: today, directions: r.directions.map(({ id, name, score }) => ({ id, name, score })), evidence: r.evidence }
  const statePath = path.join(stateDir, `${slug(topic)}.json`)
  const prev: Snapshot | null = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null
  const d = diffDirections(prev, next)
  const notePath = path.join(outDir, `${slug(topic)}-${today}.md`)
  writeFileSync(notePath, renderWatchNote(topic, next, d, dg.status))
  writeFileSync(statePath, JSON.stringify(next, null, 2) + '\n')
  summary.push({
    topic,
    note: notePath,
    digest: dg.status,
    digestItems: digest.length,
    evidence: r.evidence.length,
    verified: r.evidence.filter((e) => e.citation === 'verified').length,
    moved: d.moved.length,
    added: d.added.length,
    newEvidence: d.newEvidence.length,
    firstRun: !prev,
  })
}
const result = { schemaVersion: 1, date: today, topics: summary }
writeFileSync(path.join(outDir, 'status.json'), JSON.stringify(result, null, 2) + '\n')
console.log(args.includes('--json') ? JSON.stringify(result) : JSON.stringify(result, null, 2))
