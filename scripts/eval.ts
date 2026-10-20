// Public eval: run the pipeline on evals/interests.json and score every run.
//   pnpm eval --mode demo|openalex|edge|llm|worker [--offset N] [--limit N] [--json] [--out evals/results-<mode>.json]
// edge mode calls the deployed openalex-search function (SUPABASE_URL, SUPABASE_ANON_KEY; the public anon key).
// llm mode reads LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_PROVIDER from env (never printed).
// worker mode reads WORKER_URL and optional LLM_MODEL; reports consumed neurons.
import { fetchEvidence } from '../src/evidence/client'
import { readFileSync, writeFileSync } from 'node:fs'
import { createDefaultInput } from '../src/engine'
import { runResearch } from '../src/headless'
import { searchOpenAlexEvidence } from '../src/evidence/openalex'
import { checkCitations, openAlexResolver } from '../src/citations'
import { scoreRun, summarizeEval, type RunScore } from '../src/evalScore'
import type { ApiProvider } from '../src/types'

const args = process.argv.slice(2)
const opt = (n: string, d?: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const mode = opt('--mode', 'demo') as 'demo' | 'openalex' | 'edge' | 'llm' | 'worker'
const interests = JSON.parse(readFileSync(new URL('../evals/interests.json', import.meta.url), 'utf8')) as Array<{
  researchInterest: string
  problemDomain: string
}>

const workerUrl = process.env.WORKER_URL ?? ''
if (mode === 'worker' && !workerUrl) { console.error('worker mode needs WORKER_URL'); process.exit(2) }
const limit = Number(opt('--limit', String(interests.length)))
if (!Number.isInteger(limit) || limit < 1) { console.error('--limit must be a positive integer'); process.exit(2) }
const offset = Number(opt('--offset', '0'))
if (!Number.isInteger(offset) || offset < 0) { console.error('--offset must be a non-negative integer'); process.exit(2) }
let totalNeurons = 0
let usageAvailable = false
const onUsage = (neurons: number) => { totalNeurons += neurons; usageAvailable = true }
const provider = (process.env.LLM_PROVIDER ?? 'openai') as ApiProvider
const llm =
  mode === 'worker' ? { provider: 'free' as const, baseUrl: workerUrl, apiKey: '', model: process.env.LLM_MODEL ?? '@cf/zai-org/glm-4.7-flash', onUsage } :
  mode === 'llm'
    ? {
        provider,
        apiKey: process.env.LLM_API_KEY ?? '',
        baseUrl: process.env.LLM_BASE_URL ?? (provider === 'free' ? '' : 'https://api.openai.com/v1'),
        model: process.env.LLM_MODEL ?? (provider === 'free' ? '@cf/zai-org/glm-4.7-flash' : 'gpt-4o-mini'),
        ...(provider === 'free' ? { onUsage } : {}),
      }
    : null
if (mode === 'llm' && llm?.provider === 'free' && !llm.baseUrl) {
  console.error('llm mode with LLM_PROVIDER=free needs LLM_BASE_URL (Worker origin serving /api/llm)')
  process.exit(2)
}
if (mode === 'llm' && llm && llm.provider !== 'free' && !llm.apiKey) {
  console.error('llm mode needs LLM_API_KEY')
  process.exit(2)
}

const edgeUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const edgeKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
if (mode === 'edge' && (!edgeUrl || !edgeKey)) {
  console.error('edge mode needs SUPABASE_URL and SUPABASE_ANON_KEY')
  process.exit(2)
}
const edgeEvidence = async (it: { researchInterest: string; problemDomain: string }) => {
  const r = await fetch(`${edgeUrl}/functions/v1/openalex-search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${edgeKey}`, apikey: edgeKey! },
    body: JSON.stringify({ topic: it.researchInterest, domain: it.problemDomain, locale: 'en' }),
  })
  if (!r.ok) throw new Error(`edge function ${r.status}`)
  return ((await r.json()) as { evidence: Awaited<ReturnType<typeof searchOpenAlexEvidence>> }).evidence
}

const resolver = openAlexResolver()
const scores: Array<RunScore & { error?: string }> = []
for (const it of interests.slice(offset, offset + limit)) {
  const input = { ...createDefaultInput('en'), ...it, seedIdea: '' }
  try {
    const result = await runResearch(input, {
      llm,
      evidence: mode === 'worker' ? async () => (await fetchEvidence(input, workerUrl)).evidence : mode === 'openalex' ? () => searchOpenAlexEvidence(input) : mode === 'edge' ? () => edgeEvidence(it) : undefined,
    })
    const citations = await checkCitations(result.evidence, resolver)
    scores.push(scoreRun(it.researchInterest, result, citations))
  } catch (e) {
    scores.push({ interest: it.researchInterest, schemaValid: false, structureOk: false, interestCoverage: 0, evidenceOnTopicRate: 0, citationVerifiedRate: 0, error: String((e as Error).message) })
  }
  if (!args.includes('--json')) process.stderr.write('.')
}

const summary = { mode, offset, limit, ...(usageAvailable ? { totalNeurons } : {}), ...(llm ? { model: llm.model } : {}), date: new Date().toISOString().slice(0, 10), ...summarizeEval(scores) }
const out = opt('--out')
if (out) writeFileSync(out, JSON.stringify({ ...summary, runs: scores }, null, 2) + '\n')
console.log(args.includes('--json') ? JSON.stringify(summary) : `\n${JSON.stringify(summary, null, 2)}`)
