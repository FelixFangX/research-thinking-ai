# Research Topic Agent

> Cloudflare 免登录演示（预览）说明见英文 README 的 "Cloudflare demo" 一节。

[English](README.md)

一个 AI 驱动的研究选题系统，将模糊的研究兴趣转化为可操作的、有证据支撑的研究方向。基于 React、TypeScript 和实时 LLM 集成构建。

## 功能特性

- **4 阶段 Pipeline**：文献检索 → 全景梳理 → 路径对比 → 收敛推荐
- **双参与模式**：HIGH（逐步确认）/ LOW（自动执行 + 事后覆盖）
- **多 Provider LLM**：支持 OpenAI 和 Anthropic API，SSE 流式传输
- **证据治理**：分层来源可信度（T1/T2/T3）、冲突检测、引用追踪
- **复杂度感知路由**：自动选择架构模式（Single Agent / Orchestrator / Multi-Agent / RAG / KG）
- **迭代追踪**：7 天行动计划、研究日志、多次运行对比
- **安全存储**：API Key 使用 AES-GCM 加密（Web Crypto API）；密码 SHA-256 加盐哈希
- **订阅系统**：Free / Pro 订阅墙，导出功能限制
- **开机动画**：像素风系统启动序列 + Logo 揭示
- **会话历史**：可点击的历史记录，存储于 IndexedDB，支持完整结果回放
- **智能自动滚动**：跟随 Pipeline 进度滚动，手动滚动时自动暂停
- **无 LLM 配置守卫**：未配置 API Key 时弹窗提示——前往配置 / Mock 预览 / 取消
- **国际化**：中英双语，基于 IP 地理位置自动检测
- **全栈 i18n**：Pipeline 数据、LLM 提示词、Mock 数据与导出报告均随区域设置变化（不仅限于 UI 文案）
- **API 连通性测试**：可在设置中直接测试 LLM 连接
- **Markdown + 数据可视化**：AI 思考以 Markdown 呈现；结构化 JSON 结果以可视化数据卡片展示（证据卡片、架构图、候选指标条、推荐时间线）
- **可折叠思考块**：Anthropic thinking_delta 流在可折叠面板中渲染
- **登录页主题切换**：登录页支持语言与主题切换
- **主题系统**：浅色/深色模式 + 4 种配色方案（CRT Green、Cyberpunk、Amber、Classic）
- **数据分析**：PostHog 集成，产品指标追踪

## Trace 导出（LEDRING）

在完成的结果或历史记录中点击 **下载 trace**，保存经过校验的 `ledring.trace.v1` 文件。文件包含阶段选择、证据标题和 ID、最终路径，以及已记录的时间、模型使用情况和引用检查状态。旧记录可能缺少这些信息。文件不包含完整提示词、密钥或用户 ID；运行记录保留在浏览器中。

`POST /api/trace` 将完成的会话记录（直接提交或使用 `{ "record": ... }` 包装，JSON，最大 256 KB）转换为 trace 下载。`GET /api/trace/sample` 提供固定的确定性演示样本。两个接口均不调用 AI、不预留 LLM 配额，也不在服务器保存运行记录。

```bash
curl -s https://research.ledring.dev/api/trace/sample -o sample.ledring.json
curl -s https://research.ledring.dev/api/trace -H 'Content-Type: application/json' --data-binary @record.json -o run.ledring.json
ledring flowchart sample.ledring.json
ledring instability sample.ledring.json
```


## 快速开始

```bash
npm install
npm run dev
```

在浏览器中打开 `http://localhost:5173`。

## 配置

### LLM Provider

点击顶部栏的 `[CFG]` 按钮进行配置：
- **Provider**：OpenAI 或 Anthropic
- **API Base URL**：支持 OpenAI 兼容的端点（DeepSeek、Moonshot 等）
- **API Key**：用于真实 LLM 分析；未配置时弹窗提示，可选 Mock 预览
- **Model**：可配置模型选择
- **记住 Key**：可选开启，使用 AES-GCM 加密后跨会话持久化

### 数据分析（可选）

创建 `.env.local`：

```bash
VITE_POSTHOG_KEY=phc_xxx
VITE_POSTHOG_HOST=https://app.posthog.com
```

## 架构

```
React SPA (Vite + TypeScript)
├── Pipeline Engine（4 阶段编排）
│   ├── Retrieval — 多源文献检索
│   ├── Mapping — 复杂度评估 & 架构路由
│   ├── Comparison — 候选路径评分
│   └── Convergence — 推荐 & 行动计划
├── LLM Client（SSE 流式传输，多 Provider）
├── IndexedDB Storage（会话记录、迭代计划）
├── Key Vault（AES-GCM 加密、PBKDF2 派生）
├── Auth Module（客户端鉴权，可扩展）
├── Subscription（Free/Pro 订阅墙）
├── i18n（Context 模式，IP 自动检测）
├── Markdown 渲染（react-markdown + remark-gfm）
└── Analytics（PostHog 事件追踪）
```

完整的生产架构设计请参阅 [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md)。

## 项目结构

```
src/
├── components/    # UI 组件（AuthGate、BootScreen、Paywall、NoLLMDialog 等）
├── hooks/         # 自定义 React Hooks（useAuth、useSettings、useHistory、useIteration、useToast）
├── i18n/          # 国际化（翻译字典、语言检测、Context）
├── lib/           # 工具库（db.ts IndexedDB、keyVault.ts AES-GCM）
├── engine.ts      # Pipeline 编排引擎
├── llm.ts         # LLM 客户端（OpenAI/Anthropic SSE）
├── analytics.ts   # 事件追踪
├── blueprint.ts   # 产品蓝图数据
├── types.ts       # TypeScript 类型定义
└── App.tsx        # 主应用
```

## 技术栈

- **框架**：React 19 + TypeScript + Vite 8
- **状态管理**：@tanstack/react-query
- **持久化**：IndexedDB（自定义封装）
- **加密**：Web Crypto API（AES-GCM、PBKDF2、SHA-256）
- **数据分析**：posthog-js
- **字体**：Press Start 2P（像素）、VT323（终端）、Fira Code
- **Markdown**：react-markdown + remark-gfm

## 许可证

MIT
