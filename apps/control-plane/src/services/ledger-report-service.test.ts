import { describe, expect, it, vi } from "vitest";
import type { LedgerReportRecord, TaskRecord } from "@agent-zy/shared-types";

import { createControlPlaneOrchestrator } from "./orchestrator";
import { createLedgerReportService } from "./ledger-report-service";

describe("control-plane orchestrator ledger report routing", () => {
  it("does not generate a ledger report for non-ledger agents carrying report action", async () => {
    const generatedReports: unknown[] = [];
    const workerCalls: Array<{ manifestId: string; action: unknown }> = [];
    const tasks: Array<{ id: string; status: string }> = [];

    const orchestrator = createControlPlaneOrchestrator({
      store: {
        getState() {
          return {
            tasks: [],
            messages: [],
            notifications: [],
            homeLayout: [],
            ledger: {
              entries: [],
              modules: [],
              dashboard: {
                todayIncomeCents: 0,
                todayExpenseCents: 0,
                rolling7dNetCents: 0,
                recentFacts: [],
                coachTip: null,
                pendingReviewCount: 0
              }
            },
            schedule: {
              items: [],
              pendingReview: null
            },
            news: {
              feed: {
                count: 0,
                hasNext: false,
                nextCursor: null,
                items: []
              },
              daily: null,
              dailyArchive: [],
              lastFetchedAt: null,
              lastUpdatedAt: null,
              lastError: null,
              status: "idle"
            },
            topics: {
              dimensions: [],
              current: [],
              currentByDimension: [],
              history: [],
              lastGeneratedAt: null,
              status: "idle",
              strategy: "manual-curation",
              lastError: null
            },
            historyPush: {
              lastTriggeredDate: null
            },
            nightlyReview: {
              lastTriggeredDate: null
            }
          };
        },
        upsertTask(task: TaskRecord) {
          tasks.push({ id: task.id, status: task.status });
        },
        addMessage() {},
        addNotifications() {},
        applyAgentResult() {},
        appendLedgerFact() {
          throw new Error("unexpected appendLedgerFact");
        },
        appendLedgerSemantic() {
          throw new Error("unexpected appendLedgerSemantic");
        },
        getLedgerFacts() {
          return [];
        },
        getLedgerSemantics() {
          return [];
        },
        getLedgerReports() {
          return [];
        },
        getLedgerStages() {
          return [];
        },
        upsertLedgerReport(report: LedgerReportRecord) {
          generatedReports.push(report);
          return report;
        },
        setHomeLayout() {},
        cancelNotification() {},
        replaceState() {},
        setNightlyReviewDate() {},
        getDashboard() {
          return {} as any;
        }
      } as any,
      registry: {
        get(agentId: string) {
          if (agentId === "news-agent") {
            return {
              id: "news-agent",
              name: "News Agent"
            };
          }

          return null;
        },
        list() {
          return [];
        }
      } as any,
      router: {
        async route() {
          throw new Error("unused");
        }
      } as any,
      workerPool: {
        async execute(manifest: { id: string }, input: { meta?: Record<string, unknown> }) {
          workerCalls.push({
            manifestId: manifest.id,
            action: input.meta?.action
          });

          return {
            status: "completed",
            summary: "worker path used",
            assistantMessage: "ok",
            domainUpdates: {}
          };
        },
        getViews() {
          return [];
        }
      } as any,
      eventBus: {
        emit() {}
      } as any,
      ledgerSemanticService: {
        resolve() {
          return null;
        }
      } as any,
      ledgerReportService: {
        generateReport: vi.fn(() => {
          throw new Error("should not generate report");
        }),
        listReports: vi.fn(({ reports }) => reports)
      }
    });

    const task = await orchestrator.runSystemTask({
      agentId: "news-agent",
      trigger: "schedule",
      summary: "non-ledger report-like action",
      meta: {
        action: "generate-weekly-report"
      }
    });

    expect(task.status).toBe("completed");
    expect(generatedReports).toHaveLength(0);
    expect(workerCalls).toEqual([
      {
        manifestId: "news-agent",
        action: "generate-weekly-report"
      }
    ]);
    expect(tasks.some((item) => item.status === "running")).toBe(true);
  });
});

describe("ledger report service generation", () => {
  it("counts facts on the period boundaries and labels the weekly summary as last week", () => {
    const service = createLedgerReportService();

    const report = service.generateReport({
      kind: "weekly",
      now: new Date("2026-05-11T08:00:00+08:00"),
      periodStart: "2026-05-04",
      periodEnd: "2026-05-10",
      facts: [
        {
          id: "start-boundary-expense",
          sourceType: "chat",
          rawText: "早餐 10 元",
          normalizedText: "早餐 10 元",
          direction: "expense",
          amountCents: 1000,
          currency: "CNY",
          occurredAt: "2026-05-04T00:00:00+08:00",
          recordedAt: "2026-05-04T00:01:00+08:00",
          status: "confirmed"
        },
        {
          id: "end-boundary-income",
          sourceType: "chat",
          rawText: "报销 20 元",
          normalizedText: "报销 20 元",
          direction: "income",
          amountCents: 2000,
          currency: "CNY",
          occurredAt: "2026-05-10T23:59:59+08:00",
          recordedAt: "2026-05-10T23:59:59+08:00",
          status: "confirmed"
        },
        {
          id: "outside-period",
          sourceType: "chat",
          rawText: "晚饭 30 元",
          normalizedText: "晚饭 30 元",
          direction: "expense",
          amountCents: 3000,
          currency: "CNY",
          occurredAt: "2026-05-11T00:00:00+08:00",
          recordedAt: "2026-05-11T00:00:00+08:00",
          status: "confirmed"
        }
      ],
      semantics: [
        {
          factId: "start-boundary-expense",
          primaryCategory: "餐饮",
          secondaryCategories: [],
          tags: [],
          people: [],
          confidence: 0.95,
          reasoningSummary: "早餐消费",
          parserVersion: "rule-v1",
          lifeStageIds: []
        },
        {
          factId: "end-boundary-income",
          primaryCategory: "报销",
          secondaryCategories: [],
          tags: [],
          people: [],
          confidence: 0.95,
          reasoningSummary: "报销入账",
          parserVersion: "rule-v1",
          lifeStageIds: []
        }
      ]
    });

    expect(report.periodStart).toBe("2026-05-04");
    expect(report.periodEnd).toBe("2026-05-10");
    expect(report.summary).toContain("上周");
    expect(report.summary).toContain("2026-05-04");
    expect(report.summary).toContain("2026-05-10");
    expect(report.summary).toContain("已确认 2 笔收支");
    expect(report.summary).toContain("支出 10.00 元");
    expect(report.summary).toContain("收入 20.00 元");
    expect(report.summary).toContain("净额 10.00 元");
    expect(report.insights[0]).toContain("上周");
    expect(report.insights[0]).toContain("10.00 元");
    expect(report.insights[0]).toContain("20.00 元");
  });
});
