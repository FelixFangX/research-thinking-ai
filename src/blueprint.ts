import type { Locale } from './i18n'
import type { ProductMetric, SecurityRule, ServiceSpec } from './types'

export function getPersonas(locale: Locale) {
  return locale === 'zh'
    ? [
        {
          name: '研一/博一用户',
          pain: '兴趣很多但不知道如何收敛，担心选题两个月后推倒重来。',
          success: '72小时内拿到可执行且可辩护的选题路径。',
        },
        {
          name: '课题组新人',
          pain: '导师方向较宽，资料碎片化，难判断“做什么最稳”。',
          success: '在组会前形成带证据链的候选路径比较卡。',
        },
        {
          name: '独立研究者/产品研究员',
          pain: '缺少系统化文献梳理与风险止损机制。',
          success: '在资源受限下仍能稳定筛出可验证方向。',
        },
      ]
    : [
        {
          name: 'First-year grad student',
          pain: 'Too many interests and no clear way to converge — worried about scrapping the topic after two months.',
          success: 'Get an actionable, defensible topic path within 72 hours.',
        },
        {
          name: 'New lab member',
          pain: 'Advisor’s direction is broad, resources are scattered, and it’s hard to tell what’s the safest bet.',
          success: 'Before the next lab meeting, present an evidence-backed candidate comparison card.',
        },
        {
          name: 'Independent / industry researcher',
          pain: 'Lacks systematic literature review and risk stop-loss mechanisms.',
          success: 'Reliably filter verifiable directions under tight resources.',
        },
      ]
}

export function getJourney(locale: Locale) {
  return locale === 'zh'
    ? [
        '开始： 选择高参与共创 / 低参与自动 + 后纠偏',
        '输入： 填写兴趣、问题域、约束与决策权重',
        '流程： 检索 -> 梳理 -> 比较 -> 收敛',
        '决策： 推荐路径 + 备选 + 可证伪实验 + 止损条件',
        '跟进： 7日行动计划 + 会话回访与迭代',
      ]
    : [
        'Onboarding: Choose high-participation co-creation or low-participation auto flow + late override.',
        'Intake: Capture interest, problem domain, constraints, and decision weights.',
        'Pipeline: Retrieve → Map → Compare → Converge.',
        'Decision: Recommended path + alternates + falsifiable experiments + stop conditions.',
        'Follow-up: 7-day action plan + session return and iteration.',
      ]
}

export function getUxDeliverables(locale: Locale) {
  return locale === 'zh'
    ? [
        '信息架构：产品蓝图 / 选题工作台 / 上线运维',
        '关键流程图：高参与逐步确认、低参与自动纠偏、冲突证据回退',
        '页面规范：输入校验、空态、错误态、加载态、结果态',
        '组件规范：证据卡片、路径评分卡、人工确认清单、流程步骤',
        '可访问性：键盘操作、颜色对比、无障碍标签、可读性文案',
      ]
    : [
        'IA: Product blueprint / topic workspace / launch & ops',
        'Key flows: High-participation step-by-step gates, low-participation auto with override, conflict evidence rollback',
        'Page specs: Input validation, empty, error, loading, and result states',
        'Components: EvidenceCard, PathScoreCard, HumanGateChecklist, PipelineStepper',
        'Accessibility: Keyboard use, color contrast, ARIA labels, readable copy',
      ]
}

export function getServiceBlueprint(locale: Locale): ServiceSpec[] {
  return locale === 'zh'
    ? [
        {
          service: 'API 网关',
          role: '鉴权、速率限制、请求编排、统一审计日志',
          stack: 'Next.js Route Handlers / Fastify + Redis',
          slo: 'P95 < 300ms (非LLM路径)',
        },
        {
          service: '流程编排',
          role: '根据复杂度选择单Agent/工作流/多Agent/RAG/KG',
          stack: 'Temporal / Trigger.dev / Celery',
          slo: '任务成功率 > 99.0%',
        },
        {
          service: '文献检索服务',
          role: '多源检索（OpenAlex、Semantic Scholar、Crossref）与去重',
          stack: 'Python + pgvector + BM25 hybrid search',
          slo: '检索召回关键论文命中率 > 85%',
        },
        {
          service: '证据图谱服务',
          role: '证据实体抽取、引用链构图、冲突检测',
          stack: 'Neo4j / PostgreSQL + graph projection',
          slo: '冲突检测延迟 < 2s',
        },
        {
          service: '推荐服务',
          role: '候选路径评分、可证伪实验生成、止损条件建议',
          stack: 'LLM + rule engine + deterministic scorer',
          slo: '推荐可解释覆盖率 > 90%',
        },
        {
          service: '监测与评估',
          role: '产品指标 + AI质量指标 + 回放',
          stack: 'PostHog + OpenTelemetry + warehouse',
          slo: '核心埋点到达率 > 99%',
        },
      ]
    : [
        {
          service: 'BFF API Gateway',
          role: 'Auth, rate limiting, request orchestration, unified audit logging',
          stack: 'Next.js Route Handlers / Fastify + Redis',
          slo: 'P95 < 300ms (non-LLM paths)',
        },
        {
          service: 'Orchestrator',
          role: 'Select single-agent / workflow / multi-agent / RAG / KG by complexity',
          stack: 'Temporal / Trigger.dev / Celery',
          slo: 'Task success rate > 99.0%',
        },
        {
          service: 'Retriever Service',
          role: 'Multi-source retrieval (OpenAlex, Semantic Scholar, Crossref) and deduplication',
          stack: 'Python + pgvector + BM25 hybrid search',
          slo: 'Key paper recall hit rate > 85%',
        },
        {
          service: 'Evidence Graph Service',
          role: 'Evidence entity extraction, citation graph, conflict detection',
          stack: 'Neo4j / PostgreSQL + graph projection',
          slo: 'Conflict detection latency < 2s',
        },
        {
          service: 'Recommendation Service',
          role: 'Candidate path scoring, falsifiable experiment generation, stop-loss suggestions',
          stack: 'LLM + rule engine + deterministic scorer',
          slo: 'Explainable recommendation coverage > 90%',
        },
        {
          service: 'Observability & Eval',
          role: 'Product metrics + AI quality metrics + replay',
          stack: 'PostHog + OpenTelemetry + warehouse',
          slo: 'Core event delivery rate > 99%',
        },
      ]
}

export function getSecurityControls(locale: Locale): SecurityRule[] {
  return locale === 'zh'
    ? [
        {
          id: 'S1',
          rule: '默认不上传用户原文全文；仅上传必要结构化摘要。',
          control: '个人信息脱敏与字段白名单',
        },
        {
          id: 'S2',
          rule: '所有推荐结论必须带引用证据ID。',
          control: '输出结构校验与引用核验',
        },
        {
          id: 'S3',
          rule: '冲突证据影响结论时必须阻断自动拍板。',
          control: '策略规则强制检查',
        },
        {
          id: 'S4',
          rule: '低可信来源不参与最终评分权重上限。',
          control: '按来源级别加权评分',
        },
        {
          id: 'S5',
          rule: '用户会话与评审日志可追溯。',
          control: '不可变审计日志与事件签名',
        },
      ]
    : [
        {
          id: 'S1',
          rule: 'Do not upload full user prose by default; only required structured summaries.',
          control: 'PII redaction + field-level allowlist',
        },
        {
          id: 'S2',
          rule: 'Every recommendation must cite evidence IDs.',
          control: 'response schema guard + citation validator',
        },
        {
          id: 'S3',
          rule: 'When conflicting evidence affects the conclusion, block automatic finalization.',
          control: 'policy engine hard gate',
        },
        {
          id: 'S4',
          rule: 'Low-trust sources do not contribute to final scoring weight caps.',
          control: 'tier-aware weighted scorer',
        },
        {
          id: 'S5',
          rule: 'User sessions and review logs must be traceable.',
          control: 'immutable audit log + event signature',
        },
      ]
}

export function getProductKpis(locale: Locale): ProductMetric[] {
  return locale === 'zh'
    ? [
        {
          id: 'P1',
          name: 'activation_24h',
          definition: '注册后24h内完成首个选题流程',
          target: '>= 45%',
          owner: '增长团队',
        },
        {
          id: 'P2',
          name: 'time_to_shortlist',
          definition: '从输入到形成3条候选路径的中位时长',
          target: '<= 20 分钟',
          owner: '产品团队',
        },
        {
          id: 'P3',
          name: 'week1_retention',
          definition: '7天内至少回访一次并迭代选题',
          target: '>= 35%',
          owner: '增长团队',
        },
        {
          id: 'P4',
          name: 'mentor_share_rate',
          definition: '用户将结果分享给导师/同伴评审的比例',
          target: '>= 40%',
          owner: '产品团队',
        },
      ]
    : [
        {
          id: 'P1',
          name: 'activation_24h',
          definition: 'Complete first topic flow within 24h of signup',
          target: '>= 45%',
          owner: 'Growth',
        },
        {
          id: 'P2',
          name: 'time_to_shortlist',
          definition: 'Median time from input to three candidate paths',
          target: '<= 20 min',
          owner: 'Product',
        },
        {
          id: 'P3',
          name: 'week1_retention',
          definition: 'Return at least once within 7 days to iterate on the topic',
          target: '>= 35%',
          owner: 'Growth',
        },
        {
          id: 'P4',
          name: 'mentor_share_rate',
          definition: 'Share rate of results with advisor or peers for review',
          target: '>= 40%',
          owner: 'Product',
        },
      ]
}

export function getAiKpis(locale: Locale): ProductMetric[] {
  return locale === 'zh'
    ? [
        {
          id: 'A1',
          name: 'citation_grounding_rate',
          definition: '建议文本中可追溯引用句占比',
          target: '>= 90%',
          owner: 'AI 应用团队',
        },
        {
          id: 'A2',
          name: 'conflict_detection_recall',
          definition: '标注冲突样本的识别召回率',
          target: '>= 80%',
          owner: 'AI 应用团队',
        },
        {
          id: 'A3',
          name: 'human_acceptance_rate',
          definition: '人工评审后接受系统推荐的比例',
          target: '>= 55%',
          owner: 'AI 应用团队',
        },
        {
          id: 'A4',
          name: 'hallucination_incident_rate',
          definition: '每千次会话中出现无依据关键结论的次数',
          target: '<= 2',
          owner: 'AI 安全团队',
        },
      ]
    : [
        {
          id: 'A1',
          name: 'citation_grounding_rate',
          definition: 'Share of suggestion text with traceable citations',
          target: '>= 90%',
          owner: 'Applied AI',
        },
        {
          id: 'A2',
          name: 'conflict_detection_recall',
          definition: 'Recall of labeled conflict pairs',
          target: '>= 80%',
          owner: 'Applied AI',
        },
        {
          id: 'A3',
          name: 'human_acceptance_rate',
          definition: 'Rate of system recommendations accepted after human review',
          target: '>= 55%',
          owner: 'Applied AI',
        },
        {
          id: 'A4',
          name: 'hallucination_incident_rate',
          definition: 'Unsupported key claims per thousand sessions',
          target: '<= 2',
          owner: 'AI Safety',
        },
      ]
}

export function getReleasePlan(locale: Locale) {
  return locale === 'zh'
    ? [
        'M0(2周): 闭测版，人工监督 + 规则硬门',
        'M1(4周): 公开测试版，支持真实检索API与会话回放',
        'M2(8周): 增加图谱检索、团队协作、A/B实验',
        'M3(12周): 付费版上线，SLA与安全合规审计',
      ]
    : [
        'M0 (2w): Closed alpha, human oversight + hard rule gates',
        'M1 (4w): Public beta, real retrieval API + session replay',
        'M2 (8w): Graph retrieval, team collaboration, A/B experiments',
        'M3 (12w): Paid tier, SLA and security/compliance audit',
      ]
}

export const API_SKETCH = [
  'POST /api/v1/topic-sessions',
  'POST /api/v1/topic-sessions/{id}/run',
  'GET /api/v1/topic-sessions/{id}/result',
  'POST /api/v1/topic-sessions/{id}/override',
  'POST /api/v1/topic-sessions/{id}/accept',
  'GET /api/v1/topic-sessions?cursor=...',
]
