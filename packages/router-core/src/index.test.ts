import { describe, expect, it } from "vitest";

import type { AgentManifest, RouterModel } from "@agent-zy/agent-sdk";

import { createHybridRouter } from "./index";

const manifests: AgentManifest[] = [
  {
    id: "ledger-agent",
    name: "账本 Agent",
    description: "处理收入支出和账本模块",
    version: "0.1.0",
    capabilities: ["ledger.record", "ledger.summary"],
    triggers: ["user"],
    modulePath: "agents/ledger-agent/src/index.ts",
    manifestPath: "agents/ledger-agent/src/manifest.ts",
    tags: ["ledger", "money", "expense", "income", "accounting"]
  },
  {
    id: "schedule-agent",
    name: "日程 Agent",
    description: "安排待办和每天计划",
    version: "0.1.0",
    capabilities: ["schedule.plan", "schedule.review"],
    triggers: ["user", "schedule"],
    modulePath: "agents/schedule-agent/src/index.ts",
    manifestPath: "agents/schedule-agent/src/manifest.ts",
    tags: ["schedule", "todo", "plan", "today"]
  },
  {
    id: "news-agent",
    name: "热点 Agent",
    description: "刷新热点和分析",
    version: "0.1.0",
    capabilities: ["news.refresh", "news.analyze"],
    triggers: ["schedule", "system"],
    modulePath: "agents/news-agent/src/index.ts",
    manifestPath: "agents/news-agent/src/manifest.ts",
    tags: ["news", "analysis", "hot"]
  }
];

describe("router-core", () => {
  it("combines candidate filtering with model-based selection", async () => {
    const model: RouterModel = {
      async selectCandidate({ candidates, input }) {
        expect(candidates.map((item) => item.id)).toEqual([
          "ledger-agent",
          "schedule-agent"
        ]);
        expect(input.message).toContain("128");

        return {
          agentId: "ledger-agent",
          confidence: 0.95,
          reason: "金额和收支语义最强"
        };
      }
    };

    const router = createHybridRouter({ model });
    const route = await router.route(
      {
        message: "今天工作午餐花了 128 元，记到账本",
        trigger: "user"
      },
      manifests
    );

    expect(route.agentId).toBe("ledger-agent");
    expect(route.candidates[0].id).toBe("ledger-agent");
    expect(route.reason).toMatch(/金额/);
  });

  it("falls back to the strongest heuristic candidate when model abstains", async () => {
    const model: RouterModel = {
      async selectCandidate() {
        return null;
      }
    };

    const router = createHybridRouter({ model });
    const route = await router.route(
      {
        message: "帮我看看今天要做什么",
        trigger: "user"
      },
      manifests
    );

    expect(route.agentId).toBe("schedule-agent");
    expect(route.candidates[0].id).toBe("schedule-agent");
  });
});
