# 梦幻西游交易模块对抗性审查修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复七项已复现问题，并优化 Dashboard 行情估值的重复扫描。

**Architecture:** 保持现有 service/repository/API/page 分层。正确性规则放在规范化和账本回放入口，协议约束放在 Zod 与同步边界，HTTP 状态映射集中在路由辅助函数。

**Tech Stack:** TypeScript、Zod、Fastify、Vitest、React。

---

### Task 1: 交易记账模式与钱包重新分配

**Files:**
- Modify: `apps/control-plane/src/services/mhxy-service.ts`
- Test: `apps/control-plane/src/services/mhxy-service.test.ts`

- [ ] 添加“人民币交易改为游戏币后使用钱包成本”失败测试。
- [ ] 添加“钱包买入数量变化后重新分配”失败测试。
- [ ] 运行 `npm test -- apps/control-plane/src/services/mhxy-service.test.ts`，确认分别因旧模式和旧分配失败。
- [ ] 让 `normalizeTrade` 根据新币种重算模式，并仅对不改变钱包消耗的规范化场景接收显式分配。
- [ ] 重跑服务测试并确认通过。

### Task 2: 同步重复 ID 防护

**Files:**
- Modify: `apps/control-plane/src/services/data-sync/local-adapters.ts`
- Test: `apps/control-plane/src/services/data-sync/local-adapters.test.ts`

- [ ] 添加同类记录重复 ID 时导出失败的测试。
- [ ] 运行目标测试，确认当前实现只导出一条而失败。
- [ ] 在写入同步 Map 前集中校验键唯一并抛出包含记录类型和 ID 的错误。
- [ ] 重跑同步适配器测试。

### Task 3: 页面回归与资产撤销卖出

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/control-plane/src/services/mhxy-validation.ts`
- Modify: `apps/control-plane/src/services/mhxy-service.ts`
- Modify: `apps/web/src/components/mhxy-page.tsx`
- Test: `apps/control-plane/src/mhxy-api.test.ts`
- Test: `apps/web/src/components/mhxy-page.test.ts`

- [ ] 添加 PATCH 同时传 `sellAt: null`、`sellPriceRmb: null` 后恢复持有状态的 API 失败测试。
- [ ] 运行 API 测试，确认 schema/merge 无法表达清除。
- [ ] 将资产 Patch 类型与 Zod schema 扩展为可空，并在规范化时区分“未提供”和“显式清除”。
- [ ] 页面清空卖出字段时发送 `null`；统一总览提示文案与页面断言。
- [ ] 重跑 API 与页面测试。

### Task 4: 未来事件与 HTTP 错误分类

**Files:**
- Modify: `apps/control-plane/src/services/mhxy-game-coin-ledger.ts`
- Modify: `apps/control-plane/src/services/mhxy-service.ts`
- Modify: `apps/control-plane/src/app.ts`
- Test: `apps/control-plane/src/services/mhxy-service.test.ts`
- Test: `apps/control-plane/src/mhxy-api.test.ts`

- [ ] 添加未来交易保留在列表但不进入当前库存的失败测试。
- [ ] 添加 404、409、500 状态码映射测试。
- [ ] 运行目标测试并确认当前全部事件回放、全部异常为 400。
- [ ] 为 service/ledger 注入当前时间并仅回放已发生事件。
- [ ] 增加可识别的领域错误类别，未知错误保留为 500。
- [ ] 重跑服务和 API 测试。

### Task 5: 行情索引与最终验证

**Files:**
- Modify: `apps/control-plane/src/services/mhxy-service.ts`
- Test: `apps/control-plane/src/services/mhxy-service.test.ts`

- [ ] 添加多区服同名行情选择最新快照的回归测试。
- [ ] 运行测试确认现有公式基线。
- [ ] 构建最新行情索引并替换逐库存过滤排序，保持结果不变。
- [ ] 运行 `npm test -- apps/control-plane/src/services/mhxy-service.test.ts apps/control-plane/src/mhxy-api.test.ts apps/control-plane/src/services/data-sync/local-adapters.test.ts apps/web/src/components/mhxy-page.test.ts`。
- [ ] 运行 `npm run typecheck` 和 `npm run build:web`。
