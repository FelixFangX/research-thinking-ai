import type {
  AgentRunResult,
  ArchitectureDecision,
  ArchitectureMode,
  CandidatePath,
  ComplexityAssessment,
  ComplexityLevel,
  DecisionWeights,
  EvaluationMetric,
  EvidenceItem,
  ParticipationMode,
  PipelineStageProgress,
  Recommendation,
  SourcePolicy,
  TopicInput,
  WorkflowStep,
} from './types'
import { isLLMConfigured, streamLLM, type LLMConfig } from './llm'
import { parseStage, RetrieveStage, MapStage, CompareStage, ConvergeStage } from './schemas'
import { t, type Locale } from './i18n'

/** pace: false skips the typing animation (headless runs, evals, MCP). */
export interface RunOptions {
  pace?: boolean
}

export type StreamCallback = (stageId: string, text: string) => void
export type ThinkingCallback = (stageId: string, text: string) => void

const HIGH_STAKES_PATTERN =
  /(医疗|临床|药物|金融|法律|政策|隐私|安全|自动驾驶|教育评估|medical|clinical|drug|finance|legal|policy|privacy|safety|autonomous|education)/i
const GRAPH_PATTERN = /(知识图谱|引文网络|实体关系|ontology|citation network|knowledge graph|entity relation)/i
const CROSS_DOMAIN_PATTERN = /(跨学科|多模态|多源|生态|系统|复杂网络|interdisciplinary|multimodal|multi-source|ecosystem|complex network)/i

function getWorkflowSteps(locale: Locale): WorkflowStep[] {
  const z = locale === 'zh'
  return [
    {
      id: 'retrieve',
      name: z ? '文献检索' : 'Literature Retrieval',
      goal: z ? '把研究兴趣拆成可检索的查询集' : 'Decompose research interest into searchable queries',
      autoAction: z ? '生成检索式，分库检索并去重' : 'Generate search queries, retrieve & deduplicate',
      output: z ? '主题文献池 + 时间线 + 关键词漂移图' : 'Literature pool + timeline + keyword drift map',
      humanGate: z ? '确认纳入/排除标准是否合理' : 'Confirm inclusion/exclusion criteria',
      requiredMode: 'both',
    },
    {
      id: 'map',
      name: z ? '方向全景梳理' : 'Landscape Mapping',
      goal: z ? '建立问题-方法-证据的全景地图' : 'Build problem-method-evidence panoramic map',
      autoAction: z ? '抽取核心论点、方法、数据集和评测指标' : 'Extract core claims, methods, datasets & metrics',
      output: z ? '方向地图 + 研究空白候选清单' : 'Direction map + research gap candidates',
      humanGate: z ? '确认关键论文未遗漏（尤其是导师/领域公认工作）' : 'Confirm no key papers are missing',
      requiredMode: 'high_only',
    },
    {
      id: 'compare',
      name: z ? '候选路径比较' : 'Path Comparison',
      goal: z ? '形成可执行、可比较的3条候选路径' : 'Form 3 executable, comparable candidate paths',
      autoAction: z ? '按新颖性/可行性/影响力/风险/证据覆盖打分' : 'Score by novelty / feasibility / impact / risk / evidence',
      output: z ? '候选路径矩阵 + 风险与止损条件' : 'Candidate path matrix + risk & stop conditions',
      humanGate: z ? '确认评分权重与个人阶段匹配' : 'Confirm scoring weights match personal goals',
      requiredMode: 'both',
    },
    {
      id: 'converge',
      name: z ? '收敛与判断支持' : 'Convergence & Decision',
      goal: z ? '推荐最优路径并给出7天可执行动作' : 'Recommend optimal path with 7-day action plan',
      autoAction: z ? '做冲突证据归因，输出推荐与备选' : 'Attribute conflicting evidence, output recommendation',
      output: z ? '推荐路径 + 证据链 + 可证伪实验' : 'Recommended path + evidence chain + falsifiable experiment',
      humanGate: z ? '最终确认"是否现在做、为何不是另外两条"' : 'Final confirmation: proceed now? Why not the other two?',
      requiredMode: 'both',
    },
  ]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function splitConstraints(text: string): string[] {
  return text
    .split(/[\n,，;；]/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
}

function normalizeWeights(weights: DecisionWeights): DecisionWeights {
  const sum =
    weights.novelty +
    weights.feasibility +
    weights.impact +
    weights.riskControl +
    weights.evidence
  const safeSum = sum <= 0 ? 1 : sum
  return {
    novelty: weights.novelty / safeSum,
    feasibility: weights.feasibility / safeSum,
    impact: weights.impact / safeSum,
    riskControl: weights.riskControl / safeSum,
    evidence: weights.evidence / safeSum,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}

async function emitLines(
  lines: string[],
  stageId: string,
  onStream: StreamCallback,
  buf = '',
  pace = true,
): Promise<string> {
  let out = buf
  for (const line of lines) {
    if (pace) await delay(80 + Math.random() * 140)
    out += line + '\n'
    onStream(stageId, out)
  }
  return out
}

function hashScore(seed: string, salt: number): number {
  let hash = 7 + salt * 13
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 1000003
  }
  return hash % 100
}

function deriveLevel(score: number): ComplexityLevel {
  if (score < 35) return 'low'
  if (score < 55) return 'medium'
  if (score < 78) return 'high'
  return 'frontier'
}

function formatArchitectureLabel(mode: ArchitectureMode, locale: Locale = 'zh'): string {
  const z = locale === 'zh'
  const mapping: Record<ArchitectureMode, string> = {
    single_agent: z ? '单 Agent' : 'Single Agent',
    workflow_orchestrator: z ? '工作流编排 Agent' : 'Workflow Orchestrator Agent',
    multi_agent: z ? '多 Agent 协作' : 'Multi-Agent Collaboration',
    rag_workflow: z ? 'RAG + 工作流编排' : 'RAG + Workflow Orchestration',
    kg_orchestrated: z ? '知识图谱 + 编排 Agent' : 'Knowledge Graph + Orchestrator Agent',
  }
  return mapping[mode]
}

export function getDefaultWeights(mode: ParticipationMode): DecisionWeights {
  if (mode === 'high') {
    return {
      novelty: 24,
      feasibility: 22,
      impact: 20,
      riskControl: 18,
      evidence: 16,
    }
  }
  return {
    novelty: 18,
    feasibility: 26,
    impact: 20,
    riskControl: 22,
    evidence: 14,
  }
}

export function createDefaultInput(locale: Locale = 'en'): TopicInput {
  const z = locale === 'zh'
  return {
    researchInterest: z
      ? '大模型在教育反馈中的可解释性'
      : 'Interpretability of LLMs in educational feedback',
    problemDomain: z
      ? '高等教育学习分析'
      : 'Higher education learning analytics',
    seedIdea: z
      ? '想做一个能解释"为什么给出该反馈"的研究方向，而非只提升分数。'
      : 'Explore a research direction that explains "why this feedback was given" rather than just improving scores.',
    constraints: z
      ? '2个月内起步, 需要公开数据, 可复现实验'
      : 'Start within 2 months, public data required, reproducible experiments',
    expectedTimelineWeeks: 8,
    complexityHint: 3,
    participationMode: 'high',
    decisionWeights: getDefaultWeights('high'),
  }
}

export function assessComplexity(input: TopicInput, locale: Locale = 'zh'): ComplexityAssessment {
  const z = locale === 'zh'
  const combinedText = `${input.researchInterest} ${input.problemDomain} ${input.seedIdea}`
  const constraints = splitConstraints(input.constraints)

  let score = input.complexityHint * 14
  score += clamp(Math.floor(combinedText.length / 11), 4, 18)
  score += clamp(constraints.length * 5, 0, 18)

  const rationale: string[] = []

  if (HIGH_STAKES_PATTERN.test(combinedText)) {
    score += 14
    rationale.push(z
      ? '问题域含高风险决策场景，需要更强证据治理'
      : 'Domain involves high-stakes decisions requiring stronger evidence governance')
  }

  if (CROSS_DOMAIN_PATTERN.test(combinedText)) {
    score += 11
    rationale.push(z
      ? '存在跨学科或多模态信号，任务拆解复杂'
      : 'Cross-disciplinary or multimodal signals detected; complex task decomposition needed')
  }

  if (GRAPH_PATTERN.test(combinedText)) {
    score += 8
    rationale.push(z
      ? '存在实体关系与引文网络需求，适合图谱化组织'
      : 'Entity-relation and citation network needs detected; knowledge graph organization suitable')
  }

  if (constraints.length >= 3) {
    rationale.push(z
      ? '约束条件较多，需要在可行性上做强收敛'
      : 'Multiple constraints require strong convergence on feasibility')
  }

  score = clamp(score, 12, 95)
  const level = deriveLevel(score)
  if (rationale.length === 0) {
    rationale.push(z
      ? '问题相对聚焦，可用轻量流程快速形成候选方向'
      : 'Problem is relatively focused; lightweight pipeline can quickly generate candidate directions')
  }

  return {
    level,
    score,
    rationale,
  }
}

export function decideArchitecture(
  input: TopicInput,
  complexity: ComplexityAssessment,
  locale: Locale = 'zh',
): ArchitectureDecision {
  const z = locale === 'zh'
  const allText = `${input.researchInterest} ${input.problemDomain} ${input.seedIdea}`
  const needsGraph = GRAPH_PATTERN.test(allText)
  const isHighStakes = HIGH_STAKES_PATTERN.test(allText)

  let mode: ArchitectureMode = 'single_agent'
  if (needsGraph && complexity.score >= 60) {
    mode = 'kg_orchestrated'
  } else if (isHighStakes && complexity.score >= 48) {
    mode = 'rag_workflow'
  } else if (complexity.score >= 80) {
    mode = 'multi_agent'
  } else if (complexity.score >= 45) {
    mode = 'workflow_orchestrator'
  }

  const moduleMap: Record<ArchitectureMode, string[]> = {
    single_agent: ['Query Planner', 'Literature Synthesizer', 'Ranking'],
    workflow_orchestrator: [
      'Query Planner',
      'Retriever',
      'Evidence Mapper',
      'Path Comparator',
      'Convergence Judge',
    ],
    multi_agent: [
      'Retriever Agent',
      'Panorama Agent',
      z ? 'Devil Agent(反证)' : 'Devil Agent (Counter-evidence)',
      'Decision Agent',
      'Supervisor',
    ],
    rag_workflow: [
      'Retriever + Vector Index',
      'Citation Guard',
      'Conflict Resolver',
      'Scoring Agent',
      'Judge Agent',
    ],
    kg_orchestrated: [
      'Entity Extractor',
      'Citation Graph Builder',
      'Graph Retriever',
      'Path Comparator',
      'Judge Agent',
    ],
  }

  const archLabel = formatArchitectureLabel(mode, locale)
  return {
    mode,
    reason: z
      ? `复杂度 ${complexity.score}/100，自动采用 ${archLabel}，核心原因：${complexity.rationale[0]}`
      : `Complexity ${complexity.score}/100 — auto-selected ${archLabel}. Primary reason: ${complexity.rationale[0]}`,
    modules: moduleMap[mode],
  }
}

function buildEvidence(input: TopicInput, locale: Locale = 'zh'): EvidenceItem[] {
  const z = locale === 'zh'
  const topic = `${input.researchInterest} ${input.problemDomain}`.trim()
  const encoded = encodeURIComponent(topic || 'research topic')
  const fallback = z ? '目标问题域' : 'target problem domain'

  return [
    {
      id: 'E1',
      title: z
        ? `OpenAlex 高被引综述聚类：${topic || fallback}`
        : `OpenAlex highly-cited review clustering: ${topic || fallback}`,
      source: 'OpenAlex + Crossref',
      url: `https://openalex.org/works?search=${encoded}`,
      year: 2025,
      tier: 'T1',
      claim: z
        ? '近五年热点集中在"可解释 + 反馈闭环 + 小样本评测"。'
        : 'Hot topics over the past five years center on interpretability, feedback loops, and few-shot evaluation.',
      relevance: 88,
      credibility: 90,
      conflictsWith: [],
    },
    {
      id: 'E2',
      title: z
        ? `Semantic Scholar 代表性论文链路：${topic || fallback}`
        : `Semantic Scholar representative paper trail: ${topic || fallback}`,
      source: 'Semantic Scholar',
      url: `https://www.semanticscholar.org/search?q=${encoded}`,
      year: 2024,
      tier: 'T1',
      claim: z
        ? '高影响力工作普遍采用公开基准 + 消融实验组合验证。'
        : 'High-impact works commonly adopt public benchmarks combined with ablation studies for validation.',
      relevance: 85,
      credibility: 86,
      conflictsWith: [],
    },
    {
      id: 'E3',
      title: z
        ? '最新预印本：大模型端到端方案在多数指标上领先'
        : 'Latest preprints: LLM end-to-end solutions lead on most metrics',
      source: 'arXiv',
      url: `https://arxiv.org/search/?query=${encoded}&searchtype=all`,
      year: 2026,
      tier: 'T2',
      claim: z
        ? '规模化模型在标准评测上持续领先，但可解释性证据不足。'
        : 'Scaled models continue leading on standard benchmarks, but interpretability evidence is lacking.',
      relevance: 78,
      credibility: 68,
      conflictsWith: ['E4'],
    },
    {
      id: 'E4',
      title: z
        ? '期刊论文：因果/结构化方法在小样本情境更稳健'
        : 'Journal paper: Causal/structured methods more robust in low-data settings',
      source: 'Nature Portfolio / IEEE / ACM',
      url: `https://scholar.google.com/scholar?q=${encodeURIComponent(`${topic} causal interpretable`)}`,
      year: 2025,
      tier: 'T1',
      claim: z
        ? '在受限样本与高解释要求任务中，结构化方法更稳定。'
        : 'In limited-sample and high-interpretability tasks, structured methods are more stable.',
      relevance: 81,
      credibility: 89,
      conflictsWith: ['E3'],
    },
    {
      id: 'E5',
      title: z
        ? '领域会议报告：真实部署中的评价指标漂移'
        : 'Conference report: Metric drift in real-world deployments',
      source: 'Top Conference Proceedings',
      url: `https://dblp.org/search?q=${encoded}`,
      year: 2025,
      tier: 'T2',
      claim: z
        ? '离线指标与真实用户收益存在明显偏差，需要在线验证设计。'
        : 'Offline metrics diverge significantly from real user outcomes; online validation design is needed.',
      relevance: 76,
      credibility: 74,
      conflictsWith: ['E6'],
    },
    {
      id: 'E6',
      title: z
        ? '产业白皮书：低延迟优先比可解释模块更关键'
        : 'Industry whitepaper: Low latency is more critical than interpretability modules',
      source: 'Industry Whitepaper',
      url: `https://scholar.google.com/scholar?q=${encoded}`,
      year: 2024,
      tier: 'T3',
      claim: z
        ? '在商用场景中，速度优先于解释性能，建议先做工程优化。'
        : 'In commercial settings, speed takes priority over interpretability — engineering optimization first.',
      relevance: 63,
      credibility: 48,
      conflictsWith: ['E5'],
    },
  ]
}

function scoreCandidate(candidate: CandidatePath, weights: DecisionWeights): CandidatePath {
  const normalized = normalizeWeights(weights)
  const riskSafe = 100 - candidate.risk
  const score =
    candidate.novelty * normalized.novelty +
    candidate.feasibility * normalized.feasibility +
    candidate.impact * normalized.impact +
    riskSafe * normalized.riskControl +
    candidate.evidenceCoverage * normalized.evidence

  const confidence =
    score * 0.52 +
    candidate.evidenceCoverage * 0.28 +
    (100 - Math.abs(candidate.novelty - candidate.feasibility)) * 0.2

  return {
    ...candidate,
    score: Math.round(score),
    confidence: Math.round(clamp(confidence, 35, 95)),
  }
}

function buildCandidates(input: TopicInput, evidence: EvidenceItem[], locale: Locale = 'zh'): CandidatePath[] {
  const z = locale === 'zh'
  const seed = `${input.researchInterest}|${input.problemDomain}|${input.seedIdea}`
  const baseA = hashScore(seed, 1)
  const baseB = hashScore(seed, 2)
  const baseC = hashScore(seed, 3)

  const coverageA = 60 + (evidence.length % 6) * 4
  const coverageB = 68 + (baseB % 16)
  const coverageC = 58 + (baseC % 18)

  const candidates: CandidatePath[] = [
    {
      id: 'P1',
      name: z ? '机制澄清型选题' : 'Mechanism Clarification',
      hypothesis: z
        ? '优先解释"为什么有效"，以小范围强证据建立机制假设。'
        : 'Prioritize explaining "why it works" — build mechanism hypothesis with focused, strong evidence.',
      method: z
        ? '构建可解释基线 + 反事实/因果验证 + 小样本稳健性测试'
        : 'Interpretable baseline + counterfactual/causal verification + few-shot robustness test',
      novelty: 66 + (baseA % 18),
      feasibility: 70 + (baseB % 14),
      impact: 64 + (baseC % 16),
      risk: 34 + (baseA % 24),
      evidenceCoverage: coverageA,
      score: 0,
      confidence: 0,
      firstExperiment: z
        ? '1周内复现2篇代表论文，并在公开数据上补做可解释性指标。'
        : 'Reproduce 2 representative papers within 1 week and add interpretability metrics on public data.',
      stopCondition: z
        ? '若两轮实验均无法提升解释一致性 >= 8%，暂停该路径。'
        : 'Pause this path if two rounds of experiments fail to improve explanation consistency by >= 8%.',
      evidenceIds: ['E1', 'E2', 'E4'],
    },
    {
      id: 'P2',
      name: z ? '工程验证型选题' : 'Engineering Validation',
      hypothesis: z
        ? '优先做可复现工程基线，在真实流程中验证研究价值。'
        : 'Prioritize a reproducible engineering baseline; validate research value in real workflows.',
      method: z
        ? '基准重跑 + 数据切片误差分析 + 在线A/B可观测性设计'
        : 'Benchmark re-run + data-slice error analysis + online A/B observability design',
      novelty: 54 + (baseB % 14),
      feasibility: 78 + (baseA % 16),
      impact: 68 + (baseC % 18),
      risk: 24 + (baseB % 20),
      evidenceCoverage: coverageB,
      score: 0,
      confidence: 0,
      firstExperiment: z
        ? '先做端到端最小可运行链路，记录误差分布与解释失败案例。'
        : 'Build a minimal end-to-end pipeline first; record error distribution and explanation failure cases.',
      stopCondition: z
        ? '若两周内无法形成可复现实验基线，缩减问题范围。'
        : 'Narrow scope if a reproducible experimental baseline cannot be formed within two weeks.',
      evidenceIds: ['E1', 'E2', 'E5'],
    },
    {
      id: 'P3',
      name: z ? '跨域迁移型选题' : 'Cross-Domain Transfer',
      hypothesis: z
        ? '把成熟方法迁移到新场景，追求更高影响但承担更高不确定性。'
        : 'Transfer mature methods to new domains — pursuing higher impact while accepting higher uncertainty.',
      method: z
        ? '跨域数据适配 + 迁移学习 + 错误归因与失效边界分析'
        : 'Cross-domain data adaptation + transfer learning + error attribution & failure boundary analysis',
      novelty: 74 + (baseC % 14),
      feasibility: 52 + (baseA % 16),
      impact: 78 + (baseB % 14),
      risk: 46 + (baseC % 24),
      evidenceCoverage: coverageC,
      score: 0,
      confidence: 0,
      firstExperiment: z
        ? '验证跨域迁移最小样本设置，确认是否出现明显负迁移。'
        : 'Verify cross-domain transfer with minimum sample settings; check for significant negative transfer.',
      stopCondition: z
        ? '若负迁移持续 > 2 轮迭代且无解释性改进，切回 P1 或 P2。'
        : 'Fall back to P1 or P2 if negative transfer persists > 2 iterations with no interpretability improvement.',
      evidenceIds: ['E2', 'E3', 'E6'],
    },
  ]

  return candidates.map((candidate) => scoreCandidate(candidate, input.decisionWeights))
}

function buildRecommendation(
  candidates: CandidatePath[],
  mode: ParticipationMode,
  locale: Locale = 'zh',
): Recommendation {
  const z = locale === 'zh'
  const sorted = [...candidates].sort((a, b) => b.score - a.score)
  const selected = sorted[0]

  const confirmations =
    mode === 'high'
      ? z
        ? [
            '确认纳入/排除文献标准',
            '确认候选路径打分权重',
            '确认首个可证伪实验设计',
            '确认止损条件',
          ]
        : [
            'Confirm inclusion/exclusion criteria',
            'Confirm candidate path scoring weights',
            'Confirm first falsifiable experiment design',
            'Confirm stop conditions',
          ]
      : z
        ? ['确认推荐路径是否符合导师/课题组资源约束', '确认是否需要手动纠偏并重跑']
        : ['Confirm recommended path fits advisor/group resource constraints', 'Confirm whether manual correction and re-run is needed']

  const modeLabel = mode === 'high'
    ? (z ? '高参与共创' : 'High Participation')
    : (z ? '低参与自动' : 'Low Participation')

  return {
    selectedPathId: selected.id,
    why: z
      ? [
          `综合得分最高 (${selected.score}/100)，且证据覆盖 ${selected.evidenceCoverage}/100。`,
          `风险水平 ${selected.risk}/100，处于可管理区间。`,
          `首周实验动作清晰，适合 ${modeLabel} 流程。`,
        ]
      : [
          `Highest composite score (${selected.score}/100) with evidence coverage ${selected.evidenceCoverage}/100.`,
          `Risk level ${selected.risk}/100 — within manageable range.`,
          `First-week experiments are well-defined; suitable for ${modeLabel} workflow.`,
        ],
    nextSevenDays: z
      ? [
          `Day1-2: 完成 ${selected.id} 的检索式复核与关键文献清单确认。`,
          'Day3-4: 复现最小实验并记录失败样本。',
          'Day5: 与导师评审"继续/暂停"条件。',
          'Day6-7: 根据证据冲突结果调整研究假设。',
        ]
      : [
          `Day1-2: Complete search query review and key literature list confirmation for ${selected.id}.`,
          'Day3-4: Reproduce minimal experiment and record failure samples.',
          'Day5: Review "continue/pause" conditions with advisor.',
          'Day6-7: Adjust research hypothesis based on evidence conflict results.',
        ],
    manualConfirmations: confirmations,
  }
}

function buildSourcePolicy(locale: Locale = 'zh'): SourcePolicy {
  const z = locale === 'zh'
  return {
    citationTemplate: z
      ? '[Tier|EvidenceId] 标题 (年份) - 关键结论 - URL'
      : '[Tier|EvidenceId] Title (Year) - Key Conclusion - URL',
    tiers: [
      {
        tier: 'T1',
        label: z ? '高可信学术源' : 'High-credibility Academic Source',
        rule: z
          ? '期刊/顶会/官方数据库；优先作为结论依据'
          : 'Journals / top conferences / official databases; prioritized as basis for conclusions',
      },
      {
        tier: 'T2',
        label: z ? '中可信前沿源' : 'Medium-credibility Frontier Source',
        rule: z
          ? '预印本/会议报告；可用于前沿假设，不单独决策'
          : 'Preprints / conference reports; usable for frontier hypotheses, not as sole decision basis',
      },
      {
        tier: 'T3',
        label: z ? '低可信补充源' : 'Low-credibility Supplementary Source',
        rule: z
          ? '博客/白皮书/社区帖；仅做背景，不做核心证据'
          : 'Blogs / whitepapers / community posts; background only, not core evidence',
      },
    ],
    conflictRules: z
      ? [
          '同层冲突：标记为 unresolved，要求人工确认后才能收敛。',
          '跨层冲突：默认采用高层证据，除非低层证据具备更新时效与可复现数据。',
          '若冲突直接影响选题结论，系统强制给出"可证伪实验"而不是直接拍板。',
          '任何无引用结论不进入候选路径评分。',
        ]
      : [
          'Same-tier conflict: mark as unresolved; require human confirmation before convergence.',
          'Cross-tier conflict: default to higher-tier evidence unless lower tier has newer data and reproducible results.',
          'If conflict directly impacts topic conclusion, the system forces a falsifiable experiment instead of deciding outright.',
          'Any conclusion without citations is excluded from candidate path scoring.',
        ],
  }
}

function buildEvaluationPlan(locale: Locale = 'zh'): EvaluationMetric[] {
  const z = locale === 'zh'
  return [
    {
      id: 'M1',
      type: 'product',
      name: 'time_to_shortlist',
      definition: z
        ? '从输入到形成3条候选路径的时长'
        : 'Time from input to generating 3 candidate paths',
      target: z ? '<= 20 分钟' : '<= 20 min',
      event: 'candidate_shortlist_generated',
    },
    {
      id: 'M2',
      type: 'product',
      name: 'completion_rate',
      definition: z
        ? '完成"输入-比较-收敛"全流程的用户占比'
        : 'Percentage of users completing the full input-compare-converge flow',
      target: '>= 65%',
      event: 'topic_flow_completed',
    },
    {
      id: 'M3',
      type: 'product',
      name: 'manual_override_rate',
      definition: z
        ? '用户对推荐路径进行手动改写的比例'
        : 'Rate at which users manually override recommended paths',
      target: '20% ~ 45%',
      event: 'recommendation_overridden',
    },
    {
      id: 'M4',
      type: 'product',
      name: 'seven_day_return_rate',
      definition: z
        ? '7天内返回继续迭代选题的比例'
        : 'Percentage of users returning within 7 days to continue iterating',
      target: '>= 35%',
      event: 'session_returned_7d',
    },
    {
      id: 'M5',
      type: 'ai_quality',
      name: 'citation_grounding_rate',
      definition: z
        ? '推荐结论中带证据引用的句子占比'
        : 'Ratio of evidence-cited sentences in recommendations',
      target: '>= 90%',
      event: 'citation_grounding_scored',
    },
    {
      id: 'M6',
      type: 'ai_quality',
      name: 'conflict_detection_recall',
      definition: z
        ? '已知冲突证据被识别的召回率'
        : 'Recall rate of known conflicting evidence detection',
      target: '>= 80%',
      event: 'conflict_detected',
    },
    {
      id: 'M7',
      type: 'ai_quality',
      name: 'human_acceptance_rate',
      definition: z
        ? '人工评审后接受系统推荐路径的比例'
        : 'Rate of acceptance of system-recommended paths after human review',
      target: '>= 55%',
      event: 'recommendation_accepted',
    },
    {
      id: 'M8',
      type: 'ai_quality',
      name: 'novelty_feasibility_balance',
      definition: z
        ? '新颖性与可行性平衡指数'
        : 'Novelty-feasibility balance index',
      target: '>= 0.7',
      event: 'balance_index_calculated',
    },
  ]
}


function retrieveMessages(input: TopicInput, locale: Locale) {
  const z = locale === 'zh'
  return [
    {
      role: 'system' as const,
      content: t(locale, 'llm.retrieve.sys'),
    },
    {
      role: 'user' as const,
      content: z
        ? `基于以下研究背景，生成 6 条相关学术文献证据条目。

研究兴趣: ${input.researchInterest}
问题域: ${input.problemDomain}
初步想法: ${input.seedIdea}
约束: ${input.constraints}

返回 JSON:
{
  "evidence": [
    {
      "id": "E1",
      "title": "论文/来源标题",
      "source": "期刊/会议/数据库",
      "url": "来源链接",
      "year": 2025,
      "tier": "T1",
      "claim": "核心发现",
      "relevance": 85,
      "credibility": 88,
      "conflictsWith": []
    }
  ]
}

层级: T1=高可信学术源, T2=预印本/会议报告, T3=博客/白皮书。
请包含 1-2 组 conflictsWith 冲突对。ID 从 E1 到 E6。`
        : `Based on the following research background, generate 6 relevant academic evidence items.

Research Interest: ${input.researchInterest}
Problem Domain: ${input.problemDomain}
Seed Idea: ${input.seedIdea}
Constraints: ${input.constraints}

Return JSON:
{
  "evidence": [
    {
      "id": "E1",
      "title": "Paper/source title",
      "source": "Journal/conference/database",
      "url": "Source URL",
      "year": 2025,
      "tier": "T1",
      "claim": "Key finding",
      "relevance": 85,
      "credibility": 88,
      "conflictsWith": []
    }
  ]
}

Tiers: T1=High-credibility academic source, T2=Preprints/conference reports, T3=Blogs/whitepapers.
Include 1-2 conflictsWith pairs. IDs from E1 to E6.`,
    },
  ]
}

function mapMessages(input: TopicInput, evidence: EvidenceItem[], locale: Locale) {
  const z = locale === 'zh'
  return [
    {
      role: 'system' as const,
      content: t(locale, 'llm.map.sys'),
    },
    {
      role: 'user' as const,
      content: z
        ? `评估研究复杂度并推荐 AI 编排架构。

研究兴趣: ${input.researchInterest}
问题域: ${input.problemDomain}
复杂度提示 (1-5): ${input.complexityHint}
证据池: ${JSON.stringify(evidence.map((e) => ({ id: e.id, title: e.title, tier: e.tier, claim: e.claim })))}

返回 JSON:
{
  "complexity": {
    "level": "low"|"medium"|"high"|"frontier",
    "score": 0-100,
    "rationale": ["原因1", "原因2"]
  },
  "architecture": {
    "mode": "single_agent"|"workflow_orchestrator"|"multi_agent"|"rag_workflow"|"kg_orchestrated",
    "reason": "选择原因",
    "modules": ["模块1", "模块2", "模块3"]
  }
}`
        : `Evaluate research complexity and recommend an AI orchestration architecture.

Research Interest: ${input.researchInterest}
Problem Domain: ${input.problemDomain}
Complexity Hint (1-5): ${input.complexityHint}
Evidence Pool: ${JSON.stringify(evidence.map((e) => ({ id: e.id, title: e.title, tier: e.tier, claim: e.claim })))}

Return JSON:
{
  "complexity": {
    "level": "low"|"medium"|"high"|"frontier",
    "score": 0-100,
    "rationale": ["reason1", "reason2"]
  },
  "architecture": {
    "mode": "single_agent"|"workflow_orchestrator"|"multi_agent"|"rag_workflow"|"kg_orchestrated",
    "reason": "Selection rationale",
    "modules": ["module1", "module2", "module3"]
  }
}`,
    },
  ]
}

function compareMessages(
  input: TopicInput,
  evidence: EvidenceItem[],
  architecture: ArchitectureDecision,
  locale: Locale,
) {
  const z = locale === 'zh'
  return [
    {
      role: 'system' as const,
      content: t(locale, 'llm.compare.sys'),
    },
    {
      role: 'user' as const,
      content: z
        ? `生成 3 条差异化候选研究路径。

研究兴趣: ${input.researchInterest}
初步想法: ${input.seedIdea}
约束: ${input.constraints}
架构: ${architecture.mode}
证据: ${JSON.stringify(evidence.map((e) => ({ id: e.id, title: e.title, claim: e.claim })))}

返回 JSON:
{
  "candidates": [
    {
      "id": "P1",
      "name": "路径名称",
      "hypothesis": "核心假设",
      "method": "研究方法",
      "novelty": 0-100,
      "feasibility": 0-100,
      "impact": 0-100,
      "risk": 0-100,
      "evidenceCoverage": 0-100,
      "firstExperiment": "第一周实验",
      "stopCondition": "止损条件",
      "evidenceIds": ["E1", "E2"]
    }
  ]
}

要求: 3 条路径 (P1/P2/P3)，有明显差异 (保守/均衡/激进)，每条引用 2-3 个证据 ID。`
        : `Generate 3 differentiated candidate research paths.

Research Interest: ${input.researchInterest}
Seed Idea: ${input.seedIdea}
Constraints: ${input.constraints}
Architecture: ${architecture.mode}
Evidence: ${JSON.stringify(evidence.map((e) => ({ id: e.id, title: e.title, claim: e.claim })))}

Return JSON:
{
  "candidates": [
    {
      "id": "P1",
      "name": "Path name",
      "hypothesis": "Core hypothesis",
      "method": "Research method",
      "novelty": 0-100,
      "feasibility": 0-100,
      "impact": 0-100,
      "risk": 0-100,
      "evidenceCoverage": 0-100,
      "firstExperiment": "First week experiment",
      "stopCondition": "Stop condition",
      "evidenceIds": ["E1", "E2"]
    }
  ]
}

Requirements: 3 paths (P1/P2/P3), clearly differentiated (conservative/balanced/aggressive), each citing 2-3 evidence IDs.`,
    },
  ]
}

function convergeMessages(input: TopicInput, candidates: CandidatePath[], locale: Locale) {
  const z = locale === 'zh'
  const confirmations = z
    ? (input.participationMode === 'high'
        ? '["确认纳入/排除文献标准", "确认候选路径打分权重", "确认首个可证伪实验设计", "确认止损条件"]'
        : '["确认推荐路径是否符合导师/课题组资源约束", "确认是否需要手动纠偏并重跑"]')
    : (input.participationMode === 'high'
        ? '["Confirm inclusion/exclusion criteria", "Confirm candidate scoring weights", "Confirm first falsifiable experiment", "Confirm stop conditions"]'
        : '["Confirm path fits advisor/group resources", "Confirm if manual correction and re-run needed"]')

  return [
    {
      role: 'system' as const,
      content: t(locale, 'llm.converge.sys'),
    },
    {
      role: 'user' as const,
      content: z
        ? `选择最优路径并制定 7 天行动计划。

研究: ${input.researchInterest}
约束: ${input.constraints}
模式: ${input.participationMode}
权重: ${JSON.stringify(input.decisionWeights)}
候选: ${JSON.stringify(candidates.map((c) => ({ id: c.id, name: c.name, score: c.score, confidence: c.confidence })))}

返回 JSON:
{
  "recommendation": {
    "selectedPathId": "P1"|"P2"|"P3",
    "why": ["原因1", "原因2", "原因3"],
    "nextSevenDays": ["Day1-2: ...", "Day3-4: ...", "Day5: ...", "Day6-7: ..."],
    "manualConfirmations": ${confirmations}
  }
}`
        : `Select the optimal path and create a 7-day action plan.

Research: ${input.researchInterest}
Constraints: ${input.constraints}
Mode: ${input.participationMode}
Weights: ${JSON.stringify(input.decisionWeights)}
Candidates: ${JSON.stringify(candidates.map((c) => ({ id: c.id, name: c.name, score: c.score, confidence: c.confidence })))}

Return JSON:
{
  "recommendation": {
    "selectedPathId": "P1"|"P2"|"P3",
    "why": ["reason1", "reason2", "reason3"],
    "nextSevenDays": ["Day1-2: ...", "Day3-4: ...", "Day5: ...", "Day6-7: ..."],
    "manualConfirmations": ${confirmations}
  }
}`,
    },
  ]
}

export async function runTopicAgentWithProgress(
  input: TopicInput,
  onProgress: (update: PipelineStageProgress) => void,
  onStream: StreamCallback,
  locale: Locale,
  llmConfig?: LLMConfig | null,
  onThinking?: ThinkingCallback,
  realEvidenceProvider?: () => Promise<EvidenceItem[]>,
  options: RunOptions = {},
): Promise<AgentRunResult> {
  const useLLM = isLLMConfigured(llmConfig)
  const pace = options.pace !== false
  const emit = (lines: string[], stageId: string, cb: StreamCallback) => emitLines(lines, stageId, cb, '', pace)

  onProgress({
    id: 'retrieve',
    name: t(locale, 'stg.retrieve'),
    status: 'running',
    detail: t(locale, 'stg.retrieve.start'),
    progress: 0,
  })

  let liveEvidence: EvidenceItem[] | undefined
  if (realEvidenceProvider) {
    try { liveEvidence = await realEvidenceProvider() } catch { /* Continue with model or demo evidence. */ }
  }
  let evidence: EvidenceItem[]
  if (liveEvidence) {
    // Live evidence is included in all subsequent stage prompts.
    onProgress({
      id: 'retrieve',
      name: t(locale, 'stg.retrieve'),
      status: 'running',
      detail: t(locale, 'stg.retrieve.start'),
      progress: 0,
    })
    evidence = liveEvidence
    await emit(
      [
        t(locale, 'mock.ret.1'),
        t(locale, 'mock.ret.2', { interest: input.researchInterest }),
        t(locale, 'mock.ret.3', { domain: input.problemDomain }),
        '',
        t(locale, 'mock.ret.9', { n: evidence.length }),
        t(locale, 'mock.ret.10', { t1: evidence.filter(e => e.tier === 'T1').length, t2: evidence.filter(e => e.tier === 'T2').length, t3: evidence.filter(e => e.tier === 'T3').length }),
      ],
      'retrieve',
      onStream,
    )
  } else if (useLLM && llmConfig) {
    let buf = ''
    let thinkBuf = ''
    const raw = await streamLLM(retrieveMessages(input, locale), llmConfig, (chunk) => {
      buf += chunk
      onStream('retrieve', buf)
    }, onThinking ? (chunk) => {
      thinkBuf += chunk
      onThinking('retrieve', thinkBuf)
    } : undefined)
    evidence = parseStage(RetrieveStage, raw).evidence
  } else {
    evidence = buildEvidence(input, locale)
    const tc: Record<string, number> = { T1: 0, T2: 0, T3: 0 }
    for (const e of evidence) tc[e.tier]++
    const conflicts = evidence.filter((e) => e.conflictsWith.length > 0)
    await emit(
      [
        t(locale, 'mock.ret.1'),
        t(locale, 'mock.ret.2', { interest: input.researchInterest }),
        t(locale, 'mock.ret.3', { domain: input.problemDomain }),
        '',
        t(locale, 'mock.ret.4'),
        t(locale, 'mock.ret.5'),
        t(locale, 'mock.ret.6'),
        '',
        t(locale, 'mock.ret.8'),
        t(locale, 'mock.ret.9', { n: evidence.length }),
        t(locale, 'mock.ret.10', { t1: tc.T1, t2: tc.T2, t3: tc.T3 }),
        t(locale, 'mock.ret.11', {
          info:
            conflicts.length > 0
              ? conflicts.map((e) => `${e.id}↔${e.conflictsWith[0]}`).join(', ')
              : t(locale, 'mock.ret.none'),
        }),
      ],
      'retrieve',
      onStream,
    )
  }

  onProgress({
    id: 'retrieve',
    name: t(locale, 'stg.retrieve'),
    status: 'done',
    detail: t(locale, 'stg.retrieve.done', { n: evidence.length }),
    progress: 25,
  })

  onProgress({
    id: 'map',
    name: t(locale, 'stg.map'),
    status: 'running',
    detail: t(locale, 'stg.map.start'),
    progress: 25,
  })

  let complexity: ComplexityAssessment
  let architecture: ArchitectureDecision
  if (useLLM && llmConfig) {
    let buf = ''
    let thinkBuf = ''
    const raw = await streamLLM(mapMessages(input, evidence, locale), llmConfig, (chunk) => {
      buf += chunk
      onStream('map', buf)
    }, onThinking ? (chunk) => {
      thinkBuf += chunk
      onThinking('map', thinkBuf)
    } : undefined)
    const parsed = parseStage(MapStage, raw)
    complexity = parsed.complexity
    architecture = parsed.architecture
  } else {
    complexity = assessComplexity(input, locale)
    architecture = decideArchitecture(input, complexity, locale)
    await emit(
      [
        t(locale, 'mock.map.1'),
        t(locale, 'mock.map.2'),
        t(locale, 'mock.map.3'),
        t(locale, 'mock.map.4'),
        '',
        t(locale, 'mock.map.5'),
        t(locale, 'mock.map.6', { score: complexity.score, level: complexity.level }),
        t(locale, 'mock.map.7', { arch: formatArchitectureLabel(architecture.mode, locale) }),
        t(locale, 'mock.map.8', { modules: architecture.modules.join(' → ') }),
      ],
      'map',
      onStream,
    )
  }

  onProgress({
    id: 'map',
    name: t(locale, 'stg.map'),
    status: 'done',
    detail: t(locale, 'stg.map.done', { score: complexity.score, mode: architecture.mode }),
    progress: 50,
  })

  onProgress({
    id: 'compare',
    name: t(locale, 'stg.compare'),
    status: 'running',
    detail: t(locale, 'stg.compare.start'),
    progress: 50,
  })

  let candidates: CandidatePath[]
  if (useLLM && llmConfig) {
    let buf = ''
    let thinkBuf = ''
    const raw = await streamLLM(compareMessages(input, evidence, architecture, locale), llmConfig, (chunk) => {
      buf += chunk
      onStream('compare', buf)
    }, onThinking ? (chunk) => {
      thinkBuf += chunk
      onThinking('compare', thinkBuf)
    } : undefined)
    const parsed = parseStage(CompareStage, raw)
    candidates = parsed.candidates
      .map((c) => scoreCandidate(c, input.decisionWeights))
      .sort((a, b) => b.score - a.score)
  } else {
    candidates = buildCandidates(input, evidence, locale).sort((a, b) => b.score - a.score)
    const nw = normalizeWeights(input.decisionWeights)
    await emit(
      [
        t(locale, 'mock.cmp.1'),
        t(locale, 'mock.cmp.2'),
        t(locale, 'mock.cmp.3'),
        t(locale, 'mock.cmp.4'),
        t(locale, 'mock.cmp.5'),
        '',
        t(locale, 'mock.cmp.6'),
        t(locale, 'mock.cmp.7', {
          nov: Math.round(nw.novelty * 100),
          feas: Math.round(nw.feasibility * 100),
          imp: Math.round(nw.impact * 100),
        }),
        t(locale, 'mock.cmp.8', { ranking: candidates.map((c) => `${c.id}(${c.score})`).join(' > ') }),
        t(locale, 'mock.cmp.9', { conf: candidates[0]?.confidence ?? 0 }),
      ],
      'compare',
      onStream,
    )
  }

  onProgress({
    id: 'compare',
    name: t(locale, 'stg.compare'),
    status: 'done',
    detail: t(locale, 'stg.compare.done', { n: candidates.length }),
    progress: 75,
  })

  onProgress({
    id: 'converge',
    name: t(locale, 'stg.converge'),
    status: 'running',
    detail: t(locale, 'stg.converge.start'),
    progress: 75,
  })

  let recommendation: Recommendation
  if (useLLM && llmConfig) {
    let buf = ''
    let thinkBuf = ''
    const raw = await streamLLM(convergeMessages(input, candidates, locale), llmConfig, (chunk) => {
      buf += chunk
      onStream('converge', buf)
    }, onThinking ? (chunk) => {
      thinkBuf += chunk
      onThinking('converge', thinkBuf)
    } : undefined)
    recommendation = parseStage(ConvergeStage, raw).recommendation
  } else {
    const topPath = candidates[0]
    const conflicts = evidence.filter((e) => e.conflictsWith.length > 0)
    recommendation = buildRecommendation(candidates, input.participationMode, locale)
    await emit(
      [
        t(locale, 'mock.cvg.1'),
        ...(conflicts.length > 0
          ? conflicts.map((e) =>
              t(locale, 'mock.cvg.conflict', { id: e.id, targets: e.conflictsWith.join(', ') }),
            )
          : [t(locale, 'mock.cvg.noConflict')]),
        t(locale, 'mock.cvg.2'),
        '',
        t(locale, 'mock.cvg.3'),
        t(locale, 'mock.cvg.4', { id: recommendation.selectedPathId, name: topPath?.name ?? 'N/A' }),
        ...recommendation.why.map((w) => `  - ${w}`),
        t(locale, 'mock.cvg.5'),
      ],
      'converge',
      onStream,
    )
  }

  onProgress({
    id: 'converge',
    name: t(locale, 'stg.converge'),
    status: 'done',
    detail: t(locale, 'stg.converge.done', { id: recommendation.selectedPathId }),
    progress: 100,
  })

  const workflow = getWorkflowSteps(locale).map((step) => ({
    ...step,
    humanGate:
      input.participationMode === 'low' && step.requiredMode === 'high_only'
        ? t(locale, 'engine.gate.skip')
        : step.humanGate,
  }))

  return {
    complexity,
    architecture,
    workflow,
    evidence,
    candidates,
    recommendation,
    sourcePolicy: buildSourcePolicy(locale),
    evaluationPlan: buildEvaluationPlan(locale),
  }
}

export async function runTopicAgent(input: TopicInput): Promise<AgentRunResult> {
  return runTopicAgentWithProgress(input, () => undefined, () => undefined, 'en')
}

export function formatMode(mode: ParticipationMode, locale: Locale = 'en'): string {
  return mode === 'high' ? t(locale, 'engine.mode.high') : t(locale, 'engine.mode.low')
}

export function formatArchitecture(mode: ArchitectureMode, locale: Locale = 'en'): string {
  return formatArchitectureLabel(mode, locale)
}
