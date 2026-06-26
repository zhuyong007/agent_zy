// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import type { InterviewOverview } from "@agent-zy/shared-types";

import { InterviewWorkspace } from "./interview-page";

describe("InterviewWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function overview(): InterviewOverview {
    const now = "2026-06-26T09:00:00.000Z";
    return {
      skillModules: [
        {
          id: "python-basics",
          label: "Python 基础",
          category: "基础高频",
          description: "语法、数据结构、异常处理和常见标准库。",
          targetSkills: ["函数", "异常处理"],
          defaultWeight: 3,
          weaknessBoost: 2
        }
      ],
      weakModules: [
        {
          id: "python-basics",
          label: "Python 基础",
          category: "基础高频",
          score: null,
          reason: "默认弱项，优先训练。"
        }
      ],
      todaySession: {
        id: "session-2026-06-26",
        date: "2026-06-26",
        moduleIds: ["python-basics"],
        status: "active",
        createdAt: now,
        updatedAt: now,
        questions: [
          {
            id: "q-1",
            sessionId: "session-2026-06-26",
            date: "2026-06-26",
            moduleId: "python-basics",
            type: "short-answer",
            difficulty: "middle",
            prompt: "Python 中如何处理接口调用失败后的重试？",
            targetSkill: "异常处理",
            expectedPoints: ["超时", "重试", "日志"],
            referenceAnswer: "设置超时、捕获异常、有限重试并记录日志。",
            rubric: ["主流程", "失败处理"],
            createdAt: now
          }
        ],
        answers: [],
        report: {
          id: "report-2026-06-26",
          date: "2026-06-26",
          sessionId: "session-2026-06-26",
          completedCount: 0,
          totalCount: 1,
          averageScore: null,
          moduleScores: [],
          weakPoints: ["Python 基础"],
          summary: "今天还未开始答题。",
          nextSuggestions: ["先完成 Python 基础题"],
          updatedAt: now
        }
      },
      recentReports: [],
      wrongAnswers: [],
      todayReport: {
        id: "report-2026-06-26",
        date: "2026-06-26",
        sessionId: "session-2026-06-26",
        completedCount: 0,
        totalCount: 1,
        averageScore: null,
        moduleScores: [],
        weakPoints: ["Python 基础"],
        summary: "今天还未开始答题。",
        nextSuggestions: ["先完成 Python 基础题"],
        updatedAt: now
      },
      streakDays: 0,
      estimatedMinutes: 8
    };
  }

  async function renderWorkspace(actions: Parameters<typeof InterviewWorkspace>[0]) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(InterviewWorkspace, actions));
    });
  }

  function typeInto(input: HTMLTextAreaElement, value: string) {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("renders today's module questions and shows grading feedback after submitting an answer", async () => {
    const fetchOverviewAction = vi.fn(async () => overview());
    const createSessionAction = vi.fn(async () => overview().todaySession!);
    const submitAnswerAction = vi.fn(async () => ({
      id: "answer-1",
      questionId: "q-1",
      sessionId: "session-2026-06-26",
      date: "2026-06-26",
      answerText: "设置超时，捕获异常，最多重试三次并记录日志。",
      aiScore: 86,
      manualScore: null,
      finalScore: 86,
      feedback: "回答覆盖核心点，可以补充退避策略。",
      strengths: ["覆盖超时和重试"],
      gaps: ["缺少退避"],
      mistakeTags: ["可靠性"],
      referenceAnswer: "设置超时、捕获异常、有限重试并记录日志。",
      mastery: "基本掌握" as const,
      note: "",
      createdAt: "2026-06-26T09:05:00.000Z",
      updatedAt: "2026-06-26T09:05:00.000Z"
    }));
    const updateAnswerAction = vi.fn();
    const regenerateReportAction = vi.fn(async () => overview().todayReport!);

    await renderWorkspace({
      fetchOverviewAction,
      createSessionAction,
      submitAnswerAction,
      updateAnswerAction,
      regenerateReportAction
    });

    expect(container.textContent).toContain("面试训练");
    expect(container.textContent).toContain("Python 基础");
    expect(container.textContent).toContain("Python 中如何处理接口调用失败后的重试？");
    expect(container.textContent).toContain("今天还未开始答题。");

    await act(async () => {
      typeInto(container.querySelector('textarea[name="answer-q-1"]') as HTMLTextAreaElement, "设置超时，捕获异常，最多重试三次并记录日志。");
    });
    await act(async () => {
      container.querySelector('form[data-question-id="q-1"]')
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(submitAnswerAction).toHaveBeenCalledWith({
      questionId: "q-1",
      answerText: "设置超时，捕获异常，最多重试三次并记录日志。"
    });
    expect(container.textContent).toContain("86");
    expect(container.textContent).toContain("回答覆盖核心点");
    expect(container.textContent).toContain("设置超时、捕获异常、有限重试并记录日志。");
  });

  it("keeps the interview page scrollable inside the fixed app workspace", () => {
    const css = readFileSync(join(process.cwd(), "apps/web/src/styles.css"), "utf8");
    const block = css.match(/\.interview-workspace\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(block).toContain("min-height: 0");
    expect(block).toContain("overflow-y: auto");
    expect(block).toContain("overscroll-behavior: contain");
  });
});
