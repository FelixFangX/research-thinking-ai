// Public eval: run the pipeline on evals/interests.json and score every run.
//   pnpm eval --mode demo|openalex|edge|llm [--json] [--out evals/results-<mode>.json]
// edge mode calls the deployed openalex-search function (SUPABASE_URL, SUPABASE_ANON_KEY; the public anon key).
// llm mode reads LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_PROVIDER from env (never printed).
import { readFileSync, writeFileSync } from 'node:fs'
import { createDefaultInput } from '../src/engine'
import { runResearch } from '../src/headless'
import { searchOpenAlexEvidence } from '../src/evidence/openalex'
import { checkCitations, openAlexResolver } from '../src/citations'
import { scoreRun, summarizeEval, type RunScore } from '../src/evalScore'
import type { ApiProvider } from '../src/types'

const args = process.argv.slice(2)
const opt = (n: string, d?: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const mode = opt('--mode', 'demo') as 'demo' | 'openalex' | 'edge' | 'llm'
const interests = JSON.parse(readFileSync(new URL('../evals/interests.json', import.meta.url), 'utf8')) as Array<{
  researchInterest: string
  problemDomain: string
}>

const llm =
  mode === 'llm'
    ? {
        provider: (process.env.LLM_PROVIDER ?? 'openai') as ApiProvider,
        apiKey: process.env.LLM_API_KEY ?? '',
        baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
        model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
      }
    : null
if (llm && !llm.apiKey) {
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
for (const it of interests) {
  const input = { ...createDefaultInput('en'), ...it, seedIdea: '' }
  try {
    const result = await runResearch(input, {
      llm,
      evidence: mode === 'openalex' ? () => searchOpenAlexEvidence(input) : mode === 'edge' ? () => edgeEvidence(it) : undefined,
    })
    const citations = await checkCitations(result.evidence, resolver)
    scores.push(scoreRun(it.researchInterest, result, citations))
  } catch (e) {
    scores.push({ interest: it.researchInterest, schemaValid: false, structureOk: false, interestCoverage: 0, evidenceOnTopicRate: 0, citationVerifiedRate: 0, error: String((e as Error).message) })
  }
  if (!args.includes('--json')) process.stderr.write('.')
}

const summary = { mode, ...(llm ? { model: llm.model } : {}), date: new Date().toISOString().slice(0, 10), ...summarizeEval(scores) }
const out = opt('--out')
if (out) writeFileSync(out, JSON.stringify({ ...summary, runs: scores }, null, 2) + '\n')
console.log(args.includes('--json') ? JSON.stringify(summary) : `\n${JSON.stringify(summary, null, 2)}`)
