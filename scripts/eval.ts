// Public eval: run the pipeline on evals/interests.json and score every run.
//   pnpm eval --mode demo|openalex|llm [--json] [--out evals/results-<mode>.json]
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
const mode = opt('--mode', 'demo') as 'demo' | 'openalex' | 'llm'
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

const resolver = openAlexResolver()
const scores: Array<RunScore & { error?: string }> = []
for (const it of interests) {
  const input = { ...createDefaultInput('en'), ...it, seedIdea: '' }
  try {
    const result = await runResearch(input, {
      llm,
      evidence: mode === 'openalex' ? () => searchOpenAlexEvidence(input) : undefined,
    })
    const citations = await checkCitations(result.evidence, resolver)
    scores.push(scoreRun(it.researchInterest, result, citations))
  } catch (e) {
    scores.push({ interest: it.researchInterest, schemaValid: false, structureOk: false, interestCoverage: 0, citationVerifiedRate: 0, error: String((e as Error).message) })
  }
  if (!args.includes('--json')) process.stderr.write('.')
}

const summary = { mode, ...(llm ? { model: llm.model } : {}), date: new Date().toISOString().slice(0, 10), ...summarizeEval(scores) }
const out = opt('--out')
if (out) writeFileSync(out, JSON.stringify({ ...summary, runs: scores }, null, 2) + '\n')
console.log(args.includes('--json') ? JSON.stringify(summary) : `\n${JSON.stringify(summary, null, 2)}`)
