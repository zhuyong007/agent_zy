# AI 记账模块设计

## 目标

- 将现有“记账”模块从极简收支记录升级为 AI-first 的个人财务教练模块。
- 首期聚焦 `个人财务教练 MVP`，不做传统财务软件式的复杂账户、预算、报销、对账系统。
- 支持用户以自然语言低摩擦记账，并让系统自动完成结构化提取、语义理解、洞察生成和后续对话分析。
- 数据必须由服务端持久化到本地文件，不能依赖浏览器存储，避免用户清缓存或换设备后丢失。
- 设计必须与当前仓库结构兼容，沿用 `shared-types + control-plane + sub-agent + web` 的既有接入方式。

## 首期范围

### 包含

- 双入口自然语言记账：
  - 首页 `ledger` 模块内输入
  - `/ledger` 页面顶部快速记录区输入
- 自动抽取金额、时间、收支方向、基础分类、语义标签、人物、消费类型、场景、情绪可选项
- 时间轴式记账页
- AI 周报 / 月报
- AI 问答式财务分析
- 人生阶段的半自动关联
- 本地文件持久化

### 不包含

- 银行卡、支付宝、微信账单自动同步
- OCR 截图识别正式接入
- 语音识别正式接入
- 多币种、多账户对账
- 完整经营型 ROI 面板
- 向量数据库或外部数据库

## 产品定位

该模块的定位不是“传统账本”，而是三者结合：

- AI 人生记录
- AI 财务教练
- AI 行为分析系统

它记录的不只是“花了多少钱”，而是：

- 发生了什么
- 这笔钱和谁、在什么场景、以什么动机花掉或赚到
- 它属于哪一类生活阶段或行为模式
- 这类模式是否正在恶化、改善，或值得长期保留

## 产品功能拆解

### 1. 极低摩擦记录

用户可以直接输入自然语言：

- `昨天和老婆吃火锅花了 280`
- `买了 RTX5080，8299`
- `今天梦幻西游卖货赚了 500`

系统自动提取：

- 金额
- 时间
- 收支方向
- 基础分类
- 标签
- 人物
- 消费类型
- 情绪 / 场景（可选）

首期输入方式：

- 文本记账
- 聊天式记账

后续扩展位：

- 语音记账
- 截图 / OCR 记账

### 2. AI 自动分类与理解

系统不止做传统分类，而是采用三层分类体系：

- 基础分类：餐饮、交通、数码、居家、育儿、娱乐、医疗、学习、办公
- 行为分类：社交消费、冲动消费、工具型消费、兴趣消费、情绪消费、习惯性消费
- 经营分类：项目投入、设备投入、AI 成本、自媒体支出、游戏经营收入、长期资产型投入

例如 `买麦克风` 可能同时属于：

- 基础分类：数码
- 行为分类：工具型消费
- 经营分类：视频创作投入、工作投入

### 3. AI 周报 / 月报

报告输出更像个人财务教练，而不是机械报表。核心输出包括：

- 本周消费洞察
- 本月现金流总结
- 消费行为变化
- 高频消费提醒
- 情绪化消费分析
- 风险提示

输出要求：

- 必须引用真实统计结果
- 必须说明与历史窗口相比的变化
- 必须给出 1-3 条可执行建议
- 不允许只堆叠图表和流水摘要

### 4. AI 对话能力

用户可以直接提问：

- `我最近为什么总超支？`
- `我这半年最值的消费是什么？`
- `如果我想一年存 10 万，现在该怎么调整？`
- `最近我在哪些地方浪费钱最多？`

系统基于历史账单、语义理解、报告存档和教练记忆回答。

### 5. 时间轴 / 人生日志模式

模块的主要阅读方式不是传统流水表，而是时间轴。需要把“钱”和“人生阶段”关联起来，例如：

- 买显卡
- 开始做 AI 项目
- 育儿阶段
- 游戏经营阶段
- 视频创作阶段

### 6. 经营型扩展位

虽然首期以个人财务教练为主，但模型需预留以下经营型扩展位：

- 自媒体收入
- AI API 成本
- 视频 ROI
- 游戏交易利润
- 设备投入
- 项目经营

首期不把经营面板做重，但要确保数据模型和标签体系后续可平滑扩展。

## 页面结构

首期页面结构采用 `1 个首页模块 + 1 个独立记账页 + 2 个扩展子页`。

### 首页

首页不新增独立聊天入口。首页中的 `ledger` 模块是唯一的首页记账入口，同时承载：

- 快速输入自然语言
- 聊天式确认和补充
- 今日收支摘要
- 最近 3 条记录
- 1 条 AI 提醒
- 进入 `/ledger` 的跳转入口

这样可以保证首页结构收束，不让记账能力分散到多个位置。

### `/ledger`

`/ledger` 是 AI 财务教练工作台，采用单页多区块结构：

1. `快速记录区`
   顶部大输入框，支持自然语言输入和提交反馈。

2. `今日 / 本周概览`
   展示今日支出、今日收入、近 7 天净流量、1 条 AI 洞察。

3. `时间轴`
   以事件流形式展示最近账单，而不是传统表格。

4. `AI 洞察面板`
   展示近期行为变化、风险提醒、高频支出模式。

5. `对话区`
   在记账页内直接提问和追问，不再在首页单独提供第二个聊天入口。

### `/ledger/reports`

报告归档页，展示：

- 本周周报
- 本月月报
- 历史报告列表
- 关键建议沉淀

### `/ledger/stages`

人生阶段页，展示：

- 阶段列表
- 各阶段总投入 / 总收入 / 代表事件
- 阶段内关键词和标签分布

## 信息架构

首期导航不采用传统财务软件的“账户 / 分类 / 报表”结构，而采用更接近教练系统的结构：

- 记录
- 时间轴
- 洞察
- 报告
- 阶段

这 5 个信息区块可以先在 `/ledger` 页内完成首版编排，等后续复杂度上来再拆更细子路由。

## 数据模型

采用 `事实层 + 语义层` 双层模型。

### 事实层

事实层只存可验证、可追溯、可重建的数据，不依赖模型解释。

```ts
type MoneyDirection = "expense" | "income" | "transfer" | "refund";

interface LedgerFactRecord {
  id: string;
  sourceType: "chat" | "ledger_quick_input" | "voice" | "ocr" | "manual_edit";
  rawText: string;
  normalizedText: string;
  direction: MoneyDirection;
  amountCents: number;
  currency: "CNY";
  occurredAt: string;
  recordedAt: string;
  accountHint?: string;
  counterparty?: string;
  status: "confirmed" | "needs_review";
  taskId?: string;
  revisionOf?: string;
}
```

### 语义层

语义层保存 AI 对事实层的理解结果，允许多标签、多视角解释，但必须挂在事实层之上。

```ts
interface LedgerSemanticRecord {
  factId: string;
  primaryCategory: string;
  secondaryCategories: string[];
  tags: string[];
  people: string[];
  scene?: string;
  emotion?: string;
  consumptionType?: string;
  businessType?: string;
  lifeStageIds: string[];
  confidence: number;
  reasoningSummary: string;
  parserVersion: string;
}
```

### 人生阶段层

```ts
interface LifeStageRecord {
  id: string;
  name: string;
  startAt: string;
  endAt?: string;
  status: "active" | "closed";
  description: string;
  tags: string[];
}
```

### 报告层

```ts
interface LedgerReportRecord {
  id: string;
  kind: "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  summary: string;
  insights: string[];
  risks: string[];
  opportunities: string[];
  promptVersion: string;
}
```

### 教练记忆层

```ts
interface LedgerCoachMemory {
  id: string;
  date: string;
  type: "pattern" | "risk" | "milestone" | "preference";
  title: string;
  content: string;
  relatedFactIds: string[];
  score: number;
}
```

## 文件持久化方案

首期不接数据库，采用服务端本地文件持久化，目录建议如下：

```txt
.agent-zy-data/
  state.json
  ledger/
    facts.json
    semantics.json
    stages.json
    reports.json
    memories.json
    indexes.json
```

说明：

- `state.json` 继续保存全局应用状态和 dashboard 级摘要
- `ledger/facts.json` 保存事实层账单
- `ledger/semantics.json` 保存语义理解结果
- `ledger/stages.json` 保存人生阶段
- `ledger/reports.json` 保存周报月报
- `ledger/memories.json` 保存财务教练记忆
- `ledger/indexes.json` 保存聚合缓存、哈希索引和未来 embedding 元信息

不把完整 ledger 细节继续塞进单个 `state.json`，避免文件持续膨胀并增加冲突和迁移成本。

## Dashboard 摘要模型

由于首页模块只需要摘要，不需要读取全部账单，因此 dashboard 需要单独返回摘要结构，例如：

```ts
interface LedgerDashboardSummary {
  todayIncomeCents: number;
  todayExpenseCents: number;
  rolling7dNetCents: number;
  recentFacts: Array<{
    id: string;
    direction: "expense" | "income";
    amountCents: number;
    occurredAt: string;
    summary: string;
  }>;
  coachTip: string | null;
  pendingReviewCount: number;
}
```

首页 `ledger` 模块只消费该摘要，避免前端直接读取大文件内容或拼多个请求。

## AI 工作流

首期采用 `规则解析 + LLM 语义增强 + LLM 洞察生成` 的混合模式。

### 1. 入账工作流

适用于首页 `ledger` 模块输入和 `/ledger` 页面顶部快速记录区输入。

处理步骤：

1. 规则解析金额、时间、收支方向
2. 生成事实层 `LedgerFactRecord`
3. 规则词典给出基础兜底分类
4. 调用 LLM 生成语义层 `LedgerSemanticRecord`
5. 持久化事实层和语义层
6. 刷新 dashboard 摘要
7. 返回用户确认文案

如果 LLM 失败：

- 事实层照常保存
- 语义层写入兜底分类和 `needs_review` 标记
- 前端提示“已记录，AI 理解稍后补齐”

### 2. 周报 / 月报工作流

通过定时任务触发：

1. 加载时间窗口内的 facts 和 semantics
2. 计算支出、收入、净流量、频率、波动等指标
3. 识别显著变化、高频模式、异常时段
4. 调用 LLM 生成教练式周报或月报
5. 写入 `reports.json`
6. 生成可选 dashboard 通知

### 3. AI 问答工作流

用户在 `/ledger` 页面内提问时：

1. 识别问题类型：诊断、对比、建议、回顾
2. 优先读取摘要、报告、教练记忆
3. 按需检索相关账单和语义记录
4. 组装上下文给 LLM
5. 输出分层回答：
   - 事实
   - 推断
   - 建议

### 4. 人生阶段工作流

首期采用半自动模式：

1. AI 根据近期标签和事件推荐阶段候选
2. 用户确认或修改
3. 语义层记录 `lifeStageIds`

不做全自动强绑定，避免阶段误判后污染长期分析。

## Prompt 设计

### 1. 语义理解 Prompt

输入：

- 原始文本
- 规则解析结果
- 最近可用阶段列表
- 分类体系定义

输出 JSON：

- `primaryCategory`
- `secondaryCategories`
- `tags`
- `people`
- `scene`
- `emotion`
- `consumptionType`
- `businessType`
- `lifeStageIds`
- `confidence`
- `reasoningSummary`
- `needsReview`

要求：

- 不允许自由发挥金额和时间
- 必须以事实层为准
- 若不确定，显式降低置信度

### 2. 报告生成 Prompt

输入：

- 周期统计指标
- 近几期对比结果
- 代表账单样本
- 已有教练记忆

输出：

- 总结段落
- 3-5 条洞察
- 1-3 条风险
- 1-3 条建议

要求：

- 像个人财务教练
- 不写空泛鸡汤
- 每条判断都要有数据依据

### 3. 财务问答 Prompt

输入：

- 用户问题
- 相关事实记录
- 相关语义记录
- 近期报告
- 教练记忆

输出：

- 事实结论
- 推断解释
- 调整建议

要求：

- 明确区分事实与推断
- 没有证据时不要下强结论

## 检索与 Memory 方案

首期不强依赖 embedding 或独立向量库。

### 首期检索

- 时间窗口过滤
- 标签过滤
- 分类过滤
- 关键词匹配
- 报告和教练记忆优先检索

### 首期 Memory

教练记忆用于沉淀：

- 长期重复问题
- 已识别的风险模式
- 价值型消费偏好
- 明显的人生阶段变化

教练记忆比全量流水更适合作为 AI 问答的上层上下文。

### 向量检索扩展位

在 `ledger/indexes.json` 预留 embedding 元信息，未来可支持：

- 语义相似消费检索
- 跨阶段主题回顾
- 更复杂的财务问答召回

首期不引入真正的向量数据库，保持实现简单。

## 后端架构

### 新增或调整模块

- `agents/ledger-agent`
  - 升级为自然语言记账协调入口
- `apps/control-plane/src/services/ledger-repository.ts`
  - 负责 ledger 文件读写
- `apps/control-plane/src/services/ledger-parser.ts`
  - 负责规则解析
- `apps/control-plane/src/services/ledger-semantic-service.ts`
  - 负责 LLM 语义理解
- `apps/control-plane/src/services/ledger-report-service.ts`
  - 负责周报月报
- `apps/control-plane/src/services/ledger-coach-service.ts`
  - 负责问答上下文组织和 coach memory

### API 建议

- `GET /api/ledger/dashboard`
  - 返回首页模块摘要
- `GET /api/ledger/timeline`
  - 返回时间轴分页数据
- `POST /api/ledger/record`
  - 快速记录
- `POST /api/ledger/chat`
  - 记账页内问答
- `GET /api/ledger/reports`
  - 报告列表
- `GET /api/ledger/stages`
  - 阶段列表
- `POST /api/ledger/stages`
  - 创建或确认阶段

控制面统一负责：

- 文件读写
- orchestrator 调用
- 摘要刷新
- 调度任务注册

## 前端架构

### 首页模块

首页模块需要升级为可交互模块，而不是只显示余额卡片。模块内部包含：

- 一行自然语言输入框
- 最近记录列表
- 收支摘要
- AI 提醒

### `/ledger` 页面

从占位页改为正式页面，主要结构：

- 顶部输入区
- 概览卡
- 时间轴主列表
- 洞察区
- 页内对话区

### `/ledger/reports`

- 报告卡片列表
- 当前周报 / 月报详情

### `/ledger/stages`

- 阶段时间轴
- 阶段详情卡

## 定时任务

首期建议增加：

- 每日摘要刷新任务
- 每周周报任务
- 每月月报任务
- 可选教练记忆压缩任务

这些任务都通过 control-plane scheduler 接入，避免前端承担生成责任。

## 错误处理与降级

### 记账失败场景

- 金额无法解析：提示用户补充金额
- 时间无法解析：默认使用当前时间并标记低置信度
- LLM 理解失败：先保存事实层，语义层稍后补齐

### 文件读写失败

- 写事实层失败：任务失败，不返回“已记录”
- 写语义层失败：事实层成功时允许记录成功，但标记需要补齐
- 报告生成失败：保留上次报告，不覆盖已有报告存档

### AI 幻觉控制

- 金额、时间、收支方向必须以规则解析为准
- LLM 只做语义扩展和总结，不主导事实生成
- 所有问答输出都应区分“事实”和“推断”

## 验证策略

至少覆盖以下测试：

- `ledger-agent`：
  - 自然语言解析成功
  - 缺金额失败
  - LLM 失败时走事实层成功、语义层降级
- 控制面服务：
  - 文件初始化
  - 文件读写
  - 报告生成
  - dashboard 摘要刷新
- 前端：
  - 首页 `ledger` 模块交互
  - `/ledger` 页面渲染
  - 报告页和阶段页基础状态

## 实施顺序建议

1. 扩展 `shared-types` 和 ledger 文件仓储
2. 升级 `ledger-agent` 的事实层入账能力
3. 接入首页 `ledger` 模块输入和 `/ledger` 正式页面
4. 加入语义层和 LLM 降级逻辑
5. 加入周报 / 月报
6. 加入 coach memory 与页内问答
7. 加入人生阶段页

## MVP 边界结论

首期 MVP 的成功标准不是做出一套传统账本，而是打通以下闭环：

- 用户一句话记账
- 系统能稳定落盘
- 系统能理解这笔钱代表什么
- 系统能总结最近发生了什么
- 系统能回答“我最近怎么了”

这也是该模块后续从个人记账走向经营分析系统的基础。
