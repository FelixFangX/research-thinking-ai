// Offline deterministic fixture. Regenerate with: node --import tsx scripts/generate-trace-fixture.ts
import { writeFile } from 'node:fs/promises'
import { runResearch } from '../src/headless'
import type { SessionRecord, TopicInput } from '../src/types'

const input: TopicInput = {
  researchInterest: 'Reproducible research workflows', problemDomain: 'Research tools',
  seedIdea: '', constraints: '', expectedTimelineWeeks: 4, complexityHint: 40,
  participationMode: 'low', decisionWeights: { novelty: 20, feasibility: 25, impact: 20, riskControl: 15, evidence: 20 },
}
const fullResult = await runResearch(input)
const record: SessionRecord = {
  id: 'demo-research-workflows', userId: 'anonymous', createdAt: '2026-10-20T00:00:00.000Z',
  interest: input.researchInterest, mode: 'low', complexityScore: fullResult.complexity.score,
  architecture: fullResult.architecture.mode, selectedPathId: fullResult.recommendation.selectedPathId,
  confidence: fullResult.candidates[0].confidence, evidenceOrigin: 'template', llmUsed: false,
  fullInput: input, fullResult,
}
await writeFile(new URL('../src/fixtures/trace-demo.json', import.meta.url), JSON.stringify(record, null, 2) + '\n')
