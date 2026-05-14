# AI 记账模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有极简 `ledger` 模块升级为“文件持久化的 AI-first 个人财务教练 MVP”，打通首页模块记账、`/ledger` 工作台、双层模型、报告生成和页内问答。

**Architecture:** 后端保留现有 `state.json` 作为全局应用状态入口，但将 ledger 明细迁移到 `.agent-zy-data/ledger/*.json` 文件仓储中；`state.json` 只保留 dashboard 级摘要与最小兼容字段。自然语言入账采用“规则解析事实层 + 语义服务补全语义层 + 失败可降级”的混合链路。前端首页只保留 `ledger` 模块作为记账入口，`/ledger` 页面承接时间轴、洞察、报告和页内对话。

**Tech Stack:** TypeScript, Fastify, React, TanStack Query, TanStack Router, Vitest, CSS

---

### Task 1: 扩展共享类型并定义双层 ledger 领域模型

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/package.json`
- Test: `packages/shared-types/src/index.ts`（通过 `npm run typecheck` 间接校验）

- [ ] **Step 1: 先在共享类型里定义新的 ledger 类型和 dashboard 摘要类型**

```ts
export type LedgerSourceType =
  | "chat"
  | "ledger_quick_input"
  | "voice"
  | "ocr"
  | "manual_edit";

export type LedgerFactDirection = "expense" | "income" | "transfer" | "refund";

export interface LedgerFactRecord {
  id: string;
  sourceType: LedgerSourceType;
  rawText: string;
  normalizedText: string;
  direction: LedgerFactDirection;
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

export interface LedgerSemanticRecord {
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

- [ ] **Step 2: 补 lifecycle、report、memory 和 dashboard 摘要结构**

```ts
export interface LifeStageRecord {
  id: string;
  name: string;
  startAt: string;
  endAt?: string;
  status: "active" | "closed";
  description: string;
  tags: string[];
}

export interface LedgerReportRecord {
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

export interface LedgerCoachMemory {
  id: string;
  date: string;
  type: "pattern" | "risk" | "milestone" | "preference";
  title: string;
  content: string;
  relatedFactIds: string[];
  score: number;
}

export interface LedgerDashboardSummary {
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

- [ ] **Step 3: 把 `LedgerState` 和 `DashboardData` 改成“兼容旧结构 + 支持新摘要”的形态**

```ts
export interface LedgerState {
  entries: LedgerEntry[]; // legacy compatibility
  modules: string[]; // legacy compatibility
  summary?: {
    todayExpense: number;
    todayIncome: number;
    balance: number;
  };
  dashboard?: LedgerDashboardSummary;
}

export interface DashboardData {
  tasks: KanbanGroups;
  recentTasks: TaskRecord[];
  messages: ChatMessage[];
  notifications: NotificationRecord[];
  homeLayout: HomeModulePreference[];
  ledger: LedgerState & {
    summary: {
      todayExpense: number;
      todayIncome: number;
      balance: number;
    };
    dashboard: LedgerDashboardSummary;
  };
}
```

- [ ] **Step 4: 跑类型检查，确认共享类型没有把前后端一起打断**

Run: `npm run typecheck`
Expected: FAIL，先暴露所有受影响的编译错误，后续任务逐步修复。

### Task 2: 新建 ledger 文件仓储，并让 store 能从文件摘要恢复 dashboard

**Files:**
- Create: `apps/control-plane/src/services/ledger-repository.ts`
- Create: `apps/control-plane/src/services/ledger-repository.test.ts`
- Modify: `apps/control-plane/src/services/store.ts`
- Modify: `apps/control-plane/src/services/store.test.ts`

- [ ] **Step 1: 先写 ledger 仓储测试，覆盖首次初始化、读写 facts/semantics/reports/stages/memories**

```ts
it("creates ledger json files on first load", () => {
  const repository = createLedgerRepository(tempDir);

  expect(repository.readFacts()).toEqual([]);
  expect(repository.readSemantics()).toEqual([]);
  expect(repository.readReports()).toEqual([]);
});

it("persists facts and semantics into dedicated ledger files", () => {
  repository.writeFacts([sampleFact]);
  repository.writeSemantics([sampleSemantic]);

  expect(repository.readFacts()[0]?.id).toBe(sampleFact.id);
  expect(repository.readSemantics()[0]?.factId).toBe(sampleFact.id);
});
```

- [ ] **Step 2: 运行仓储测试，确认先失败**

Run: `npm test -- apps/control-plane/src/services/ledger-repository.test.ts`
Expected: FAIL，提示缺少 `createLedgerRepository` 或对应读写方法。

- [ ] **Step 3: 实现 ledger 仓储，显式管理 `.agent-zy-data/ledger/*.json`**

```ts
export interface LedgerRepository {
  readFacts(): LedgerFactRecord[];
  writeFacts(records: LedgerFactRecord[]): void;
  readSemantics(): LedgerSemanticRecord[];
  writeSemantics(records: LedgerSemanticRecord[]): void;
  readStages(): LifeStageRecord[];
  writeStages(records: LifeStageRecord[]): void;
  readReports(): LedgerReportRecord[];
  writeReports(records: LedgerReportRecord[]): void;
  readMemories(): LedgerCoachMemory[];
  writeMemories(records: LedgerCoachMemory[]): void;
}
```

- [ ] **Step 4: 让 store 初始化时创建仓储，并保留旧 `state.json` 的最小兼容字段**

```ts
const ledgerRepository = createLedgerRepository(dataDir);

function createInitialState(): AppState {
  return {
    tasks: [],
    messages: [],
    notifications: [],
    homeLayout: getDefaultHomeLayout(),
    ledger: {
      entries: [],
      modules: ["工作", "游戏", "生活"],
      dashboard: {
        todayIncomeCents: 0,
        todayExpenseCents: 0,
        rolling7dNetCents: 0,
        recentFacts: [],
        coachTip: null,
        pendingReviewCount: 0
      }
    }
  };
}
```

- [ ] **Step 5: 在 `store.test.ts` 补一条加载老状态时仍能启动、且新 ledger 文件被初始化的测试**

```ts
it("initializes dedicated ledger files when loading a legacy state.json", () => {
  const store = createControlPlaneStore(dataDir);

  expect(existsSync(join(dataDir, "ledger", "facts.json"))).toBe(true);
  expect(store.getState().ledger.dashboard?.recentFacts).toEqual([]);
});
```

- [ ] **Step 6: 跑 store 与仓储测试，确认变绿**

Run: `npm test -- apps/control-plane/src/services/ledger-repository.test.ts apps/control-plane/src/services/store.test.ts`
Expected: PASS

### Task 3: 实现规则解析器和 dashboard 摘要聚合器

**Files:**
- Create: `apps/control-plane/src/services/ledger-parser.ts`
- Create: `apps/control-plane/src/services/ledger-parser.test.ts`
- Modify: `apps/control-plane/src/services/store.ts`
- Test: `apps/control-plane/src/services/store.test.ts`

- [ ] **Step 1: 先写解析器测试，覆盖金额、时间、方向和兜底分类**

```ts
it("parses expense text into a normalized fact draft", () => {
  expect(parseLedgerInput("昨天和老婆吃火锅花了 280", fixedNow)).toMatchObject({
    direction: "expense",
    amountCents: 28000,
    occurredAt: "2026-05-13T12:00:00.000Z"
  });
});

it("parses income text into a normalized fact draft", () => {
  expect(parseLedgerInput("今天梦幻西游卖货赚了 500", fixedNow)).toMatchObject({
    direction: "income",
    amountCents: 50000
  });
});

it("returns an explicit error when amount is missing", () => {
  expect(parseLedgerInput("昨天吃火锅", fixedNow)).toMatchObject({
    ok: false,
    reason: "amount_missing"
  });
});
```

- [ ] **Step 2: 运行解析器测试，确认先失败**

Run: `npm test -- apps/control-plane/src/services/ledger-parser.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现解析器，输出事实层 draft，而不是直接写入 store**

```ts
export interface ParsedLedgerInput {
  ok: true;
  fact: Omit<LedgerFactRecord, "id" | "recordedAt" | "taskId">;
  hints: {
    people: string[];
    scene?: string;
    matchedCategories: string[];
  };
}

export function parseLedgerInput(message: string, now = new Date()):
  | ParsedLedgerInput
  | { ok: false; reason: "amount_missing" | "message_empty" } {
  const normalizedText = message.replace(/\s+/g, " ").trim();
  const amountMatch = normalizedText.match(/(\d+(?:\.\d+)?)/);
  const amountCents = amountMatch ? Math.round(Number(amountMatch[1]) * 100) : null;
  const direction = /(赚|收入|进账|卖货|收到)/.test(normalizedText) ? "income" : "expense";
  const occurredAt = resolveOccurredAt(normalizedText, now);

  if (!normalizedText) {
    return { ok: false, reason: "message_empty" };
  }

  if (amountCents === null) {
    return { ok: false, reason: "amount_missing" };
  }

  return {
    ok: true,
    fact: {
      sourceType: "chat",
      rawText: message,
      normalizedText,
      direction,
      amountCents,
      currency: "CNY",
      occurredAt,
      status: "confirmed"
    },
    hints: {
      people: /(老婆|老公|孩子|儿子|女儿)/.test(normalizedText) ? [normalizedText.match(/老婆|老公|孩子|儿子|女儿/u)?.[0] ?? ""] : [],
      scene: /火锅|外卖|咖啡/.test(normalizedText) ? "饮食" : undefined,
      matchedCategories: inferCategories(normalizedText)
    }
  };
}
```

- [ ] **Step 4: 在 `store.ts` 抽出 dashboard 摘要聚合器，基于仓储中的 facts/semantics 计算首页摘要**

```ts
function buildLedgerDashboardSummary(
  facts: LedgerFactRecord[],
  semantics: LedgerSemanticRecord[]
): LedgerDashboardSummary {
  return {
    todayIncomeCents,
    todayExpenseCents,
    rolling7dNetCents,
    recentFacts,
    coachTip,
    pendingReviewCount
  };
}
```

- [ ] **Step 5: 在 `store.test.ts` 补聚合测试，确保最近 3 条记录和 7 天净流量正确**

```ts
it("builds ledger dashboard summary from dedicated ledger facts", () => {
  const dashboard = store.getDashboard([], []);

  expect(dashboard.ledger.dashboard.recentFacts).toHaveLength(3);
  expect(dashboard.ledger.dashboard.rolling7dNetCents).toBe(220000);
});
```

- [ ] **Step 6: 跑解析器与 store 测试**

Run: `npm test -- apps/control-plane/src/services/ledger-parser.test.ts apps/control-plane/src/services/store.test.ts`
Expected: PASS

### Task 4: 升级 ledger-agent，改成“事实层入账 + 语义层降级”的执行链路

**Files:**
- Modify: `agents/ledger-agent/src/index.ts`
- Create: `agents/ledger-agent/src/index.test.ts`
- Modify: `agents/ledger-agent/src/manifest.ts`
- Modify: `packages/router-core/src/index.test.ts`
- Modify: `packages/task-core/src/index.test.ts`

- [ ] **Step 1: 先为 ledger-agent 写测试，覆盖成功入账、缺金额失败、语义服务失败时降级成功**

```ts
it("records a parsed fact and returns a confirmation message", async () => {
  const result = await agent.execute(buildRequest("昨天和老婆吃火锅花了 280"));

  expect(result.status).toBe("completed");
  expect(result.domainUpdates?.ledger?.dashboard?.recentFacts[0]?.summary).toContain("火锅");
});

it("fails when the message has no amount", async () => {
  const result = await agent.execute(buildRequest("昨天和老婆吃火锅"));

  expect(result.status).toBe("failed");
  expect(result.summary).toContain("缺少金额");
});

it("stores the fact while marking semantic enrichment for retry when ai enrichment fails", async () => {
  const result = await agent.execute(buildRequest("买了 RTX5080，8299"));

  expect(result.status).toBe("completed");
  expect(result.assistantMessage).toContain("AI 理解稍后补齐");
});
```

- [ ] **Step 2: 运行 ledger-agent 测试，确认先失败**

Run: `npm test -- agents/ledger-agent/src/index.test.ts`
Expected: FAIL

- [ ] **Step 3: 重写 ledger-agent，让它消费解析结果并返回新形状的 domain updates**

```ts
export const agent = defineAgent({
  async execute(input) {
    const parsed = parseLedgerInput(input.message ?? "", new Date(input.requestedAt));

    if (!parsed.ok) {
      return {
        status: "failed",
        summary: "缺少金额",
        assistantMessage: "我没有识别到金额，请告诉我具体花了或赚了多少钱。"
      };
    }

    const fact = buildFactRecord(parsed, input);
    const semantic = buildFallbackSemanticRecord(fact, parsed.hints);

    return {
      status: "completed",
      summary: `已记录 ${fact.amountCents / 100} 元`,
      assistantMessage: buildLedgerConfirmationMessage(fact, semantic),
      domainUpdates: {
        ledger: {
          entries: input.state.ledger.entries,
          modules: input.state.ledger.modules,
          summary: input.state.ledger.summary,
          dashboard: input.state.ledger.dashboard
        }
      },
      meta: {
        ledgerFact: fact,
        ledgerSemantic: semantic
      }
    };
  }
});
```

- [ ] **Step 4: 调整 manifest 的能力描述和 tags，让首页聊天仍能命中 ledger-agent**

```ts
capabilities: ["ledger.record", "ledger.summary", "ledger.coach"],
tags: ["记账", "账本", "花了", "赚了", "收入", "支出", "消费", "超支"]
```

- [ ] **Step 5: 在路由与 task 测试里补新用例，防止启发式路由回退**

```ts
expect(route.agentId).toBe("ledger-agent");
expect(route.reason).toContain("tag");
```

- [ ] **Step 6: 跑 agent、router、task 相关测试**

Run: `npm test -- agents/ledger-agent/src/index.test.ts packages/router-core/src/index.test.ts packages/task-core/src/index.test.ts`
Expected: PASS

### Task 5: 让 orchestrator、store 与 app API 正式接管 ledger 文件写入和新接口

**Files:**
- Modify: `apps/control-plane/src/services/orchestrator.ts`
- Modify: `apps/control-plane/src/services/store.ts`
- Modify: `apps/control-plane/src/app.ts`
- Modify: `apps/control-plane/src/app.test.ts`
- Create: `apps/control-plane/src/services/ledger-semantic-service.ts`
- Create: `apps/control-plane/src/services/ledger-report-service.ts`

- [ ] **Step 1: 先写 app/orchestrator 测试，覆盖 `POST /api/ledger/record`、`GET /api/ledger/timeline`、`GET /api/ledger/reports`**

```ts
it("records a ledger fact through the dedicated ledger API", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/ledger/record",
    payload: { message: "昨天和老婆吃火锅花了 280", sourceType: "ledger_quick_input" }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().dashboard.ledger.dashboard.recentFacts[0].summary).toContain("火锅");
});
```

- [ ] **Step 2: 运行 control-plane API 测试，确认先失败**

Run: `npm test -- apps/control-plane/src/app.test.ts`
Expected: FAIL

- [ ] **Step 3: 在 orchestrator 中落盘 ledger 事实和语义，并刷新 dashboard 摘要**

```ts
if (result.meta?.ledgerFact) {
  options.store.appendLedgerFact(result.meta.ledgerFact);
}

if (result.meta?.ledgerSemantic) {
  options.store.appendLedgerSemantic(result.meta.ledgerSemantic);
}

options.eventBus.emit("dashboard.updated", options.store.getState());
```

- [ ] **Step 4: 在 `app.ts` 注册专用 ledger API**

```ts
app.get("/api/ledger/dashboard", async () => orchestrator.getDashboard());
app.get("/api/ledger/timeline", async () => orchestrator.getLedgerTimeline());
app.get("/api/ledger/reports", async () => orchestrator.getLedgerReports());
app.get("/api/ledger/stages", async () => orchestrator.getLedgerStages());
app.post("/api/ledger/record", async (request) => {
  const body = request.body as { message: string; sourceType?: string };
  return orchestrator.recordLedger(body);
});
app.post("/api/ledger/chat", async (request) => {
  const body = request.body as { message: string };
  return orchestrator.answerLedgerQuestion(body.message);
});
```

- [ ] **Step 5: 用最小实现补语义服务和报告服务接口，先支持规则兜底和静态摘要**

```ts
export function enrichLedgerSemantic(input: {
  fact: LedgerFactRecord;
  fallback: LedgerSemanticRecord;
}): LedgerSemanticRecord {
  return input.fallback;
}

export function generateLedgerReport(input: {
  kind: "weekly" | "monthly";
  facts: LedgerFactRecord[];
  semantics: LedgerSemanticRecord[];
}): LedgerReportRecord {
  return {
    id: nanoid(),
    kind: input.kind,
    periodStart,
    periodEnd,
    generatedAt: new Date().toISOString(),
    summary: "本期暂无足够数据，先从持续记录开始。",
    insights: [],
    risks: [],
    opportunities: [],
    promptVersion: "v1"
  };
}
```

- [ ] **Step 6: 跑 control-plane 相关测试**

Run: `npm test -- apps/control-plane/src/app.test.ts apps/control-plane/src/services/store.test.ts`
Expected: PASS

### Task 6: 扩展 scheduler，生成周报/月报和教练记忆入口

**Files:**
- Modify: `apps/control-plane/src/services/scheduler.ts`
- Modify: `apps/control-plane/src/services/scheduler.test.ts`
- Modify: `apps/control-plane/src/services/orchestrator.ts`

- [ ] **Step 1: 先写 scheduler 测试，覆盖每周和每月任务只触发一次**

```ts
it("triggers weekly ledger report once per week window", async () => {
  vi.setSystemTime(new Date("2026-05-18T08:00:00.000Z"));
  scheduler.start();

  expect(runSystemTaskMock).toHaveBeenCalledWith(
    expect.objectContaining({
      agentId: "ledger-agent",
      trigger: "schedule",
      meta: expect.objectContaining({
        action: "generate-weekly-report"
      })
    })
  );
});

it("triggers monthly ledger report once per month window", async () => {
  vi.setSystemTime(new Date("2026-06-01T08:05:00.000Z"));
  scheduler.start();

  expect(runSystemTaskMock).toHaveBeenCalledWith(
    expect.objectContaining({
      agentId: "ledger-agent",
      trigger: "schedule",
      meta: expect.objectContaining({
        action: "generate-monthly-report"
      })
    })
  );
});
```

- [ ] **Step 2: 运行 scheduler 测试，确认先失败**

Run: `npm test -- apps/control-plane/src/services/scheduler.test.ts`
Expected: FAIL

- [ ] **Step 3: 在 scheduler 增加 weekly/monthly ledger 任务分支**

```ts
let weeklyLedgerAttemptedKey: string | null = null;
let monthlyLedgerAttemptedKey: string | null = null;

async function maybeTriggerLedgerReports() {
  if (isWeeklyWindow(now) && weeklyLedgerAttemptedKey !== currentWeekKey) {
    weeklyLedgerAttemptedKey = currentWeekKey;
    await options.orchestrator.runSystemTask({
      agentId: "ledger-agent",
      trigger: "schedule",
      summary: "生成每周财务教练周报",
      meta: { action: "generate-weekly-report" }
    });
  }
}
```

- [ ] **Step 4: 在 orchestrator 中识别 report action，落到报告服务**

```ts
if (input.meta?.action === "generate-weekly-report") {
  const facts = options.store.getLedgerFacts();
  const semantics = options.store.getLedgerSemantics();

  options.store.upsertLedgerReport(
    generateLedgerReport({
      kind: "weekly",
      facts,
      semantics
    })
  );
}
```

- [ ] **Step 5: 跑 scheduler 测试**

Run: `npm test -- apps/control-plane/src/services/scheduler.test.ts`
Expected: PASS

### Task 7: 扩展前端 API 客户端和 `/ledger` 正式页面路由

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/api.test.ts`
- Modify: `apps/web/src/router.tsx`
- Create: `apps/web/src/components/ledger-page.tsx`
- Create: `apps/web/src/components/ledger-page.test.tsx`

- [ ] **Step 1: 先写 API 客户端测试，覆盖 ledger 专用接口**

```ts
it("posts quick ledger records to the dedicated endpoint", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(mockDashboard), { status: 200 }));

  await recordLedger("昨天和老婆吃火锅花了 280");

  expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/ledger/record");
});
```

- [ ] **Step 2: 运行 API 测试，确认先失败**

Run: `npm test -- apps/web/src/api.test.ts`
Expected: FAIL

- [ ] **Step 3: 在 `api.ts` 增加 ledger 数据请求方法**

```ts
export async function recordLedger(message: string, sourceType = "ledger_quick_input") {
  const response = await fetch(`${API_BASE}/api/ledger/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sourceType })
  });

  if (!response.ok) {
    throw new Error("Failed to record ledger item");
  }

  return response.json();
}

export async function fetchLedgerTimeline() {
  const response = await fetch(`${API_BASE}/api/ledger/timeline`);

  if (!response.ok) {
    throw new Error("Failed to fetch ledger timeline");
  }

  return response.json();
}

export async function fetchLedgerReports() {
  const response = await fetch(`${API_BASE}/api/ledger/reports`);

  if (!response.ok) {
    throw new Error("Failed to fetch ledger reports");
  }

  return response.json();
}

export async function fetchLedgerStages() {
  const response = await fetch(`${API_BASE}/api/ledger/stages`);

  if (!response.ok) {
    throw new Error("Failed to fetch ledger stages");
  }

  return response.json();
}

export async function askLedgerCoach(message: string) {
  const response = await fetch(`${API_BASE}/api/ledger/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  if (!response.ok) {
    throw new Error("Failed to ask ledger coach");
  }

  return response.json();
}
```

- [ ] **Step 4: 新建 `ledger-page.tsx`，先把工作台结构搭出来并补渲染测试**

```tsx
export function LedgerPage() {
  return (
    <main className="workspace ledger-workspace">
      <CommandRail
        activeSection="ledger"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[
          { label: "income", value: String(dashboard.ledger.dashboard.todayIncomeCents / 100) },
          { label: "expense", value: String(dashboard.ledger.dashboard.todayExpenseCents / 100) },
          { label: "7d", value: String(dashboard.ledger.dashboard.rolling7dNetCents / 100) }
        ]}
      />
      <section className="ledger-hero">
        <QuickRecordComposer />
        <LedgerOverview />
        <LedgerTimeline />
        <LedgerInsightPanel />
        <LedgerCoachPanel />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: 把 `/ledger` 路由从占位页切到正式页面**

```ts
const ledgerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ledger",
  component: LedgerPage
});
```

- [ ] **Step 6: 跑 web API 与 ledger 页面测试**

Run: `npm test -- apps/web/src/api.test.ts apps/web/src/components/ledger-page.test.tsx`
Expected: PASS

### Task 8: 把首页 ledger 模块改成唯一首页入口，并补交互测试

**Files:**
- Modify: `apps/web/src/components/dashboard-page.tsx`
- Modify: `apps/web/src/styles.css`
- Create: `apps/web/src/components/dashboard-ledger-panel.test.tsx`
- Modify: `apps/web/src/home-layout.test.ts`

- [ ] **Step 1: 先写首页 ledger 模块测试，覆盖快速输入、最近记录、AI 提醒和跳转入口**

```tsx
it("renders the home ledger module as the only homepage entry for ledger capture", () => {
  render(<LedgerPanel dashboard={dashboard} size="large" />);

  expect(screen.getByPlaceholderText("例如：昨天和老婆吃火锅花了 280")).toBeInTheDocument();
  expect(screen.getByText("进入记账页")).toBeInTheDocument();
  expect(screen.queryByText("打开聊天记账")).toBeNull();
});
```

- [ ] **Step 2: 运行首页相关测试，确认先失败**

Run: `npm test -- apps/web/src/home-layout.test.ts apps/web/src/components/dashboard-ledger-panel.test.tsx`
Expected: FAIL

- [ ] **Step 3: 重写 `LedgerPanel`，加入首页内输入框和摘要区，但不新增独立聊天模块**

```tsx
function LedgerPanel({ dashboard, size }: { dashboard: DashboardData; size: HomeModuleSize }) {
  return (
    <section className={`ledger-panel ledger-panel--${size}`}>
      <form className="ledger-panel__composer" onSubmit={handleSubmit}>
        <textarea placeholder="例如：昨天和老婆吃火锅花了 280" />
        <button type="submit">记录</button>
      </form>
      <div className="ledger-panel__summary">
        <div><span>今日支出</span><strong>{formatAmount(dashboard.ledger.dashboard.todayExpenseCents / 100)}</strong></div>
        <div><span>今日收入</span><strong>{formatAmount(dashboard.ledger.dashboard.todayIncomeCents / 100)}</strong></div>
      </div>
      <div className="ledger-panel__recent">
        {dashboard.ledger.dashboard.recentFacts.map((fact) => (
          <div key={fact.id}>
            <span>{fact.summary}</span>
            <strong>{formatAmount(fact.amountCents / 100)}</strong>
          </div>
        ))}
      </div>
      <Link to="/ledger" className="panel-link">进入记账页</Link>
    </section>
  );
}
```

- [ ] **Step 4: 把 `renderHomeModuleContent` 的 ledger 分支切到新签名**

```tsx
if (id === "ledger") {
  return <LedgerPanel dashboard={dashboard} size={size} />;
}
```

- [ ] **Step 5: 在样式里补首页 ledger 模块的多尺寸布局，遵守主题变量约束**

```css
.ledger-panel__composer textarea {
  width: 100%;
  min-height: 72px;
  border: 1px solid var(--edge-line);
  border-radius: 18px;
  background: var(--panel-surface);
}

.ledger-panel__recent {
  display: grid;
  gap: 10px;
}
.home-module--size-small .ledger-panel__recent li:nth-child(n + 2) { display: none; }
body[data-theme="day"] .ledger-panel { background: var(--manage-surface); }
```

- [ ] **Step 6: 跑首页模块相关测试和 web 构建**

Run: `npm test -- apps/web/src/home-layout.test.ts apps/web/src/components/dashboard-ledger-panel.test.tsx`
Expected: PASS

Run: `npm run build:web`
Expected: PASS

### Task 9: 加入报告页、阶段页和页内教练问答的最小可用实现

**Files:**
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/components/ledger-page.tsx`
- Create: `apps/web/src/components/ledger-reports-page.tsx`
- Create: `apps/web/src/components/ledger-stages-page.tsx`
- Create: `apps/web/src/components/ledger-reports-page.test.tsx`
- Create: `apps/web/src/components/ledger-stages-page.test.tsx`

- [ ] **Step 1: 先写渲染测试，覆盖报告列表、阶段列表和页内问答空态**

```tsx
it("renders saved ledger reports and empty states", () => {
  render(<LedgerReportsPage reports={[]} />);

  expect(screen.getByText("还没有周报或月报")).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行页面测试，确认先失败**

Run: `npm test -- apps/web/src/components/ledger-reports-page.test.tsx apps/web/src/components/ledger-stages-page.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现报告页和阶段页，并在 `ledger-page.tsx` 中接入页内问答区**

```tsx
<section className="ledger-coach-panel">
  <h2>财务教练</h2>
  <form onSubmit={handleCoachSubmit}>
    <textarea placeholder="例如：我最近为什么总超支？" />
    <button type="submit">提问</button>
  </form>
  <div className="ledger-coach-panel__messages">
    {messages.map((message) => (
      <article key={message.id}>
        <strong>{message.role === "user" ? "我" : "教练"}</strong>
        <p>{message.content}</p>
      </article>
    ))}
  </div>
</section>
```

- [ ] **Step 4: 如需子路由，补 `/ledger/reports` 和 `/ledger/stages`**

```ts
const ledgerReportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ledger/reports",
  component: LedgerReportsPage
});
```

- [ ] **Step 5: 跑页面测试与构建**

Run: `npm test -- apps/web/src/components/ledger-reports-page.test.tsx apps/web/src/components/ledger-stages-page.test.tsx`
Expected: PASS

Run: `npm run build:web`
Expected: PASS

### Task 10: 全量验证与收尾

**Files:**
- Modify: `agents/ledger-agent/src/index.ts`
- Modify: `apps/control-plane/src/services/store.ts`
- Modify: `apps/control-plane/src/app.ts`
- Modify: `apps/control-plane/src/services/scheduler.ts`
- Modify: `apps/web/src/components/dashboard-page.tsx`
- Modify: `apps/web/src/components/ledger-page.tsx`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: 跑后端与 agent 相关测试**

Run: `npm test -- agents/ledger-agent/src/index.test.ts apps/control-plane/src/services/ledger-repository.test.ts apps/control-plane/src/services/ledger-parser.test.ts apps/control-plane/src/services/store.test.ts apps/control-plane/src/app.test.ts apps/control-plane/src/services/scheduler.test.ts`
Expected: PASS

- [ ] **Step 2: 跑前端相关测试**

Run: `npm test -- apps/web/src/api.test.ts apps/web/src/components/ledger-page.test.tsx apps/web/src/components/dashboard-ledger-panel.test.tsx apps/web/src/components/ledger-reports-page.test.tsx apps/web/src/components/ledger-stages-page.test.tsx apps/web/src/home-layout.test.ts`
Expected: PASS

- [ ] **Step 3: 跑类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 跑前端构建**

Run: `npm run build:web`
Expected: PASS

- [ ] **Step 5: 跑最终聚合验证**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: 分阶段提交，避免一个超大 commit**

```bash
git add packages/shared-types/src/index.ts apps/control-plane/src/services/ledger-repository.ts apps/control-plane/src/services/ledger-repository.test.ts apps/control-plane/src/services/store.ts apps/control-plane/src/services/store.test.ts apps/control-plane/src/services/ledger-parser.ts apps/control-plane/src/services/ledger-parser.test.ts
git commit -m "feat: add ledger domain model and file repository"

git add agents/ledger-agent/src/index.ts agents/ledger-agent/src/index.test.ts agents/ledger-agent/src/manifest.ts packages/router-core/src/index.test.ts packages/task-core/src/index.test.ts apps/control-plane/src/services/orchestrator.ts apps/control-plane/src/app.ts apps/control-plane/src/app.test.ts apps/control-plane/src/services/ledger-semantic-service.ts apps/control-plane/src/services/ledger-report-service.ts apps/control-plane/src/services/scheduler.ts apps/control-plane/src/services/scheduler.test.ts
git commit -m "feat: wire ledger orchestration and scheduled reports"

git add apps/web/src/api.ts apps/web/src/api.test.ts apps/web/src/router.tsx apps/web/src/components/dashboard-page.tsx apps/web/src/components/dashboard-ledger-panel.test.tsx apps/web/src/components/ledger-page.tsx apps/web/src/components/ledger-page.test.tsx apps/web/src/components/ledger-reports-page.tsx apps/web/src/components/ledger-reports-page.test.tsx apps/web/src/components/ledger-stages-page.tsx apps/web/src/components/ledger-stages-page.test.tsx apps/web/src/styles.css apps/web/src/home-layout.test.ts
git commit -m "feat: add ai ledger coach workspace and home entry"
```
