import { describe, expect, it } from "vitest";

import type { AgentManifest, RouterModel } from "@agent-zy/agent-sdk";

import { createHybridRouter } from "./index";

const manifests: AgentManifest[] = [
  {
    id: "ledger-agent",
    name: "账本 Agent",
    description: "处理收入支出和账本模块",
    version: "0.1.0",
    capabilities: ["ledger.record", "ledger.summary", "ledger.capture", "ledger.review"],
    triggers: ["user"],
    modulePath: "agents/ledger-agent/src/index.ts",
    manifestPath: "agents/ledger-agent/src/manifest.ts",
    tags: ["ledger", "money", "expense", "income", "accounting", "转账", "转给", "记一笔"]
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
  },
  {
    id: "cinematic-agent",
    name: "电影镜头设计 Agent",
    description: "生成电影感视频创意、短视频文案、分镜结构和中英双语镜头提示词",
    version: "0.1.0",
    capabilities: [
      "cinematic_storyboard",
      "cinematic_prompt_generation",
      "video_structure_analysis",
      "shot_design",
      "visual_mood_design"
    ],
    triggers: ["user", "system"],
    modulePath: "agents/cinematic-agent/src/index.ts",
    manifestPath: "agents/cinematic-agent/src/manifest.ts",
    tags: ["电影感", "分镜", "镜头", "视频文案", "提示词", "构图", "光影", "氛围"]
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

  it("keeps transfer-like ledger chat routed to ledger-agent", async () => {
    const model: RouterModel = {
      async selectCandidate() {
        return null;
      }
    };

    const router = createHybridRouter({ model });
    const route = await router.route(
      {
        message: "转给老婆 200，帮我记一笔",
        trigger: "user"
      },
      manifests
    );

    expect(route.agentId).toBe("ledger-agent");
    expect(route.candidates[0].id).toBe("ledger-agent");
  });

  it("routes cinematic storyboard requests to cinematic-agent", async () => {
    const model: RouterModel = {
      async selectCandidate() {
        return null;
      }
    };

    const router = createHybridRouter({ model });
    const route = await router.route(
      {
        message: "帮我把孤独感的城市夜晚做成电影感分镜和视频提示词，要有镜头语言、构图和光影",
        trigger: "user"
      },
      manifests
    );

    expect(route.agentId).toBe("cinematic-agent");
    expect(route.candidates[0].id).toBe("cinematic-agent");
  });
});
