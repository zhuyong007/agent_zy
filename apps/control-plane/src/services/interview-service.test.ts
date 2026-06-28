import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createControlPlaneStore } from "./store";
import { createInterviewService } from "./interview-service";

describe("interview service", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  function createService(now = new Date("2026-06-26T09:00:00.000Z")) {
    dataDir = mkdtempSync(join(tmpdir(), "agent-zy-interview-service-"));
    const store = createControlPlaneStore(dataDir);
    const modelRuntime = {
      generateText: vi.fn(async () => ({
        text: JSON.stringify({
          score: 82,
          feedback: "回答覆盖了核心流程，但可以补充错误处理和边界条件。",
          strengths: ["能说明实现步骤"],
          gaps: ["错误处理不足"],
          mistakeTags: ["工程化"],
          referenceAnswer: "应说明接口契约、异常处理、测试覆盖和部署验证。"
        })
      }))
    };

    return {
      store,
      modelRuntime,
      service: createInterviewService({
        store,
        modelRuntime: modelRuntime as any,
        now: () => now
      })
    };
  }

  it("generates a stable daily session with three modules and at least three questions per module", async () => {
    const { service } = createService();

    const first = await service.getOrCreateDailySession();
    const second = await service.getOrCreateDailySession();

    expect(first.id).toBe(second.id);
    expect(first.date).toBe("2026-06-26");
    expect(first.moduleIds).toContain("python-basics");
    expect(first.moduleIds).toHaveLength(3);

    for (const moduleId of first.moduleIds) {
      expect(first.questions.filter((question) => question.moduleId === moduleId)).toHaveLength(3);
    }
  });

  it("prioritizes Python basics as the default weak module in the first daily rotation", async () => {
    const { service } = createService();

    const overview = service.getOverview();

    expect(overview.weakModules[0]).toMatchObject({
      id: "python-basics",
      label: "Python 基础"
    });
  });

  it("stores AI grading and lets manual score corrections drive the daily report", async () => {
    const { service, modelRuntime } = createService();
    const session = await service.getOrCreateDailySession();
    const question = session.questions[0];

    const answer = await service.submitAnswer({
      questionId: question.id,
      answerText: "我会先设计接口，再实现服务和测试。"
    });

    expect(modelRuntime.generateText).toHaveBeenCalled();
    expect(answer.aiScore).toBe(82);
    expect(answer.finalScore).toBe(82);
    expect(answer.mistakeTags).toContain("工程化");

    const corrected = service.updateAnswer(answer.id, {
      manualScore: 90,
      mastery: "掌握",
      note: "复盘后补充了错误处理"
    });
    expect(corrected.finalScore).toBe(90);

    const overview = service.getOverview();
    expect(overview.todayReport).toMatchObject({
      date: "2026-06-26",
      completedCount: 1,
      averageScore: 90
    });
  });
});
