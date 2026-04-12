export type ParticipationMode = 'high' | 'low'

export type ComplexityLevel = 'low' | 'medium' | 'high' | 'frontier'

export type PipelineStageId = 'retrieve' | 'map' | 'compare' | 'converge'
export type PipelineStageStatus = 'idle' | 'running' | 'done' | 'error'

export type ArchitectureMode =
  | 'single_agent'
  | 'workflow_orchestrator'
  | 'multi_agent'
  | 'rag_workflow'
  | 'kg_orchestrated'

export type SourceTier = 'T1' | 'T2' | 'T3'

export interface DecisionWeights {
  novelty: number
  feasibility: number
  impact: number
  riskControl: number
  evidence: number
}

export interface TopicInput {
  researchInterest: string
  problemDomain: string
  seedIdea: string
  constraints: string
  expectedTimelineWeeks: number
  complexityHint: number
  participationMode: ParticipationMode
  decisionWeights: DecisionWeights
}

export interface ComplexityAssessment {
  level: ComplexityLevel
  score: number
  rationale: string[]
}

export interface ArchitectureDecision {
  mode: ArchitectureMode
  reason: string
  modules: string[]
}

export interface WorkflowStep {
  id: string
  name: string
  goal: string
  autoAction: string
  output: string
  humanGate: string
  requiredMode: 'both' | 'high_only'
}

export interface EvidenceItem {
  id: string
  title: string
  source: string
  url: string
  year: number
  tier: SourceTier
  claim: string
  relevance: number
  credibility: number
  conflictsWith: string[]
}

export interface CandidatePath {
  id: string
  name: string
  hypothesis: string
  method: string
  novelty: number
  feasibility: number
  impact: number
  risk: number
  evidenceCoverage: number
  score: number
  confidence: number
  firstExperiment: string
  stopCondition: string
  evidenceIds: string[]
}

export interface Recommendation {
  selectedPathId: string
  why: string[]
  nextSevenDays: string[]
  manualConfirmations: string[]
}

export interface SourcePolicy {
  citationTemplate: string
  tiers: Array<{
    tier: SourceTier
    label: string
    rule: string
  }>
  conflictRules: string[]
}

export interface EvaluationMetric {
  id: string
  type: 'product' | 'ai_quality'
  name: string
  definition: string
  target: string
  event: string
}

export interface PipelineStageProgress {
  id: PipelineStageId
  name: string
  status: PipelineStageStatus
  detail: string
  progress: number
}

export interface SessionRecord {
  id: string
  userId: string
  createdAt: string
  interest: string
  mode: ParticipationMode
  complexityScore: number
  architecture: ArchitectureMode
  selectedPathId: string
  confidence: number
  fullResult?: AgentRunResult
  fullInput?: TopicInput
}

export interface ProductMetric {
  id: string
  name: string
  definition: string
  target: string
  owner: string
}

export interface ServiceSpec {
  service: string
  role: string
  stack: string
  slo: string
}

export interface SecurityRule {
  id: string
  rule: string
  control: string
}

export interface AgentRunResult {
  complexity: ComplexityAssessment
  architecture: ArchitectureDecision
  workflow: WorkflowStep[]
  evidence: EvidenceItem[]
  candidates: CandidatePath[]
  recommendation: Recommendation
  sourcePolicy: SourcePolicy
  evaluationPlan: EvaluationMetric[]
}

export interface User {
  id: string
  username: string
  displayName: string
  createdAt: string
}

export type ColorScheme = 'crt-green' | 'cyberpunk' | 'amber' | 'classic'

export type ApiProvider = 'openai' | 'anthropic' | 'minimax'

export type IterationStatus = 'active' | 'completed' | 'abandoned'

export interface DayTask {
  id: string
  label: string
  checked: boolean
  completedAt?: string
}

export interface JournalEntry {
  id: string
  date: string
  note: string
}

export interface IterationPlan {
  id: string
  userId: string
  createdAt: string
  interest: string
  pathId: string
  pathName: string
  status: IterationStatus
  days: DayTask[]
  journal: JournalEntry[]
  previousRunId?: string
}

export interface AppSettings {
  colorScheme: ColorScheme
  scanlines: boolean
  crtGlow: boolean
  defaultMode: ParticipationMode
  defaultComplexity: number
  defaultTimelineWeeks: number
  apiProvider: ApiProvider
  apiBaseUrl: string
  apiKey: string
  apiModel: string
}

