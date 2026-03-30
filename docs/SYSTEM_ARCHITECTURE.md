# System Architecture

## 1. 总体架构

```text
Web App (React SPA)
    -> Pipeline Engine (routing by complexity)
        -> Retriever Stage (LLM-powered literature search)
        -> Mapping Stage (complexity assessment & architecture routing)
        -> Comparison Stage (candidate path scoring)
        -> Convergence Stage (recommendation & action plan)
    -> IndexedDB (sessions, iterations)
    -> Key Vault (AES-GCM encrypted API key storage)
    -> PostHog Analytics / Audit Events
```

生产扩展路径：
```text
Web App (React/Next)
    -> BFF Gateway
        -> Orchestrator (routing by complexity)
            -> Retriever Service
            -> Evidence Graph Service
            -> Recommendation Service
            -> Policy Engine (hard gates)
        -> Session Store / Analytics / Audit Log
```

## 2. 架构路由策略

输入维度：
- 问题复杂度
- 风险等级（医疗/金融/法律等）
- 是否强依赖跨文献关系图

路由结果：
- `single_agent`
- `workflow_orchestrator`
- `multi_agent`
- `rag_workflow`
- `kg_orchestrated`

## 3. 关键模块职责

### Pipeline Engine (`engine.ts`)
- 拆分阶段任务：检索 → 梳理 → 比较 → 收敛
- 管理 LLM 流式调用与 Mock 降级
- 触发人工确认门（HIGH 模式）
- 复杂度感知路由决策

### LLM Client (`llm.ts`)
- SSE 流式传输（OpenAI / Anthropic 双协议）
- 输入净化（`sanitizeInput`）
- 健壮 JSON 解析（三级降级 + 大小保护）

### IndexedDB Storage (`lib/db.ts`)
- `sessions` store：完整运行结果（含 AgentRunResult + TopicInput）
- `iterations` store：迭代计划、日志、状态
- 自动从 localStorage 迁移历史数据

### Key Vault (`lib/keyVault.ts`)
- 默认 sessionStorage（关闭标签页即清除）
- 可选加密持久化：PBKDF2 密钥派生 → AES-GCM 加密 → localStorage
- 登出时清除所有密钥数据

### Auth Module (`hooks/useAuth.ts`)
- SHA-256 + 盐哈希密码（Web Crypto API）
- localStorage 会话管理
- 支持扩展集成 Clerk/Auth0

### Subscription (`components/Paywall.tsx`)
- Free / Pro 双层订阅
- 导出功能按 Plan 限制
- localStorage 持久化（可扩展至后端校验）

## 4. 数据模型与存储

当前实现（纯前端）：
- 会话记录：IndexedDB `sessions` store
- 迭代计划：IndexedDB `iterations` store
- 用户设置：localStorage `copilot_settings`
- API Key：sessionStorage / 加密 localStorage
- 用户认证：localStorage `copilot_users` + `copilot_session`

生产扩展：
- 会话存储：`topic_sessions`（PostgreSQL）
- 证据存储：`evidence_items`
- 评分存储：`candidate_paths`
- 审计日志：`decision_events`
- 向量检索：`pgvector`
- 图结构：`neo4j`（或 Postgres graph projection）

## 5. 可靠性与可观测

- 产品埋点：PostHog（页面浏览、运行启动/完成/失败、模式选择、路径采纳等）
- Pipeline 阶段级进度反馈
- 失败降级：LLM 不可用时自动回退 Mock 数据
- 未配置 API Key 时弹窗守卫（配置 / Mock 预览 / 取消）

生产扩展：
- 任务级 tracing：OpenTelemetry
- 失败重试：按阶段幂等重试
- 告警策略

## 6. 安全与隐私

- API Key：AES-GCM 加密存储（PBKDF2 派生，100k 迭代）
- 密码：SHA-256 + 盐哈希（Web Crypto API）
- LLM 输入：控制字符净化
- JSON 解析：500KB 大小上限
- 设置校验：`validateSettings` 防注入
- 默认结构化摘要输入，不强制上传原文
- 登出时清除所有密钥与会话数据

## 7. 全链路国际化

- **Engine 函数**：`createDefaultInput`、`assessComplexity`、`decideArchitecture`、`buildEvidence`、`buildCandidates`、`buildRecommendation`、`buildSourcePolicy`、`buildEvaluationPlan` 等均接受 `locale` 参数，保证数据层与 UI 语言一致。
- **LLM User Prompt**：用户侧提示为完整双语模板（中文 / 英文），字段标签、示例与要求说明随 `locale` 切换。
- **LLM System Prompt**：系统提示中强制响应语言，例如 `IMPORTANT: You MUST respond entirely in English` 或 `IMPORTANT: You MUST respond entirely in Chinese`。
- **Mock 数据**：Mock 流式输出与静态占位内容按 `locale` 解析，与真实 LLM 路径行为对齐。
- **导出报告**：`ShareExport` 等导出路径根据 `locale` 切换表头、标签与文案。
- **正则与关键词**：`engine.ts` 中用于领域检测、路由等用途的正则同时覆盖中英文关键词（如 `医疗|medical`），避免仅匹配单一语言导致路由偏差。
