import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createControlPlaneApp } from "./app";

describe("interview API", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-interview-api-"));
  const modelRuntime = {
    generateText: vi.fn(async () => ({
      text: JSON.stringify({
        score: 76,
        feedback: "思路基本正确，需要补充可观测性和失败重试。",
        strengths: ["覆盖主流程"],
        gaps: ["缺少上线排障"],
        mistakeTags: ["可靠性"],
        referenceAnswer: "应补充日志、重试、超时和回滚策略。"
      })
    }))
  } as any;
  const app = createControlPlaneApp({ dataDir, startSchedulers: false, modelRuntime });

  beforeAll(async () => app.ready());
  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns overview, creates today's session, grades answers, and regenerates reports", async () => {
    const overview = await app.inject({ method: "GET", url: "/api/interview/overview" });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().skillModules.length).toBeGreaterThan(8);
    expect(overview.json().weakModules[0].id).toBe("python-basics");

    const sessionResponse = await app.inject({ method: "POST", url: "/api/interview/daily-session" });
    expect(sessionResponse.statusCode).toBe(200);
    const session = sessionResponse.json();
    expect(session.moduleIds).toContain("python-basics");
    expect(session.questions.filter((question: any) => question.moduleId === "python-basics")).toHaveLength(3);

    const answerResponse = await app.inject({
      method: "POST",
      url: "/api/interview/answers",
      payload: {
        questionId: session.questions[0].id,
        answerText: "我会实现接口、补测试，并关注部署失败时的回滚。"
      }
    });
    expect(answerResponse.statusCode).toBe(200);
    expect(answerResponse.json()).toMatchObject({
      aiScore: 76,
      finalScore: 76
    });

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/interview/answers/${answerResponse.json().id}`,
      payload: {
        manualScore: 88,
        mastery: "基本掌握",
        note: "需要补 RAG 缓存策略"
      }
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().finalScore).toBe(88);

    const report = await app.inject({
      method: "POST",
      url: `/api/interview/reports/${session.date}/regenerate`
    });
    expect(report.statusCode).toBe(200);
    expect(report.json()).toMatchObject({
      date: session.date,
      completedCount: 1,
      averageScore: 88
    });
  });
});
