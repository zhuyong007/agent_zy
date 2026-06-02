import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createEventLogService } from "./event-log-service";

describe("event log service", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dataDir of tempDirs.splice(0)) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  function setup(now = "2026-05-31T08:00:00.000Z") {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-event-log-"));
    tempDirs.push(dataDir);

    return {
      dataDir,
      service: createEventLogService(dataDir, {
        now: () => new Date(now)
      })
    };
  }

  it("appends events with redacted sensitive fields and truncated summaries", () => {
    const { service } = setup();

    service.append({
      level: "info",
      category: "model",
      action: "request.completed",
      message: "Bearer sk-live-secret",
      details: {
        apiKey: "sk-live-secret",
        authorization: "Bearer sk-live-secret",
        outputSummary: "x".repeat(700)
      }
    });

    const result = service.query();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      level: "info",
      category: "model",
      action: "request.completed",
      message: "Bearer [redacted]",
      details: {
        apiKey: "[redacted]",
        authorization: "[redacted]"
      }
    });
    expect(String(result.items[0]?.details?.outputSummary)).toHaveLength(503);
    expect(String(result.items[0]?.details?.outputSummary).endsWith("...")).toBe(true);
  });

  it("filters events, skips corrupted lines, and reports a warning", () => {
    const { dataDir, service } = setup();

    service.append({
      level: "error",
      category: "history-agent",
      action: "validate.failed",
      message: "模型输出不是 JSON 对象",
      agentId: "history-agent",
      taskId: "task-history"
    });
    service.append({
      level: "info",
      category: "api",
      action: "request.completed",
      message: "POST /api/history/generate"
    });
    appendFileSync(join(dataDir, "logs", "events.jsonl"), "{broken-json}\n", "utf8");

    const result = service.query({
      level: "error",
      agentId: "history-agent",
      q: "JSON"
    });

    expect(result.items).toHaveLength(1);
    expect(result.summary).toMatchObject({
      total: 1,
      errorCount: 1
    });
    expect(result.warnings).toContain("跳过 1 条损坏的日志记录");
  });

  it("removes events older than fourteen days while appending", () => {
    const { dataDir, service } = setup();
    const logPath = join(dataDir, "logs", "events.jsonl");
    writeFileSync(
      logPath,
      `${JSON.stringify({
        id: "old",
        timestamp: "2026-05-01T08:00:00.000Z",
        level: "info",
        category: "api",
        action: "old",
        message: "old"
      })}\n`,
      "utf8"
    );

    service.append({
      level: "info",
      category: "api",
      action: "new",
      message: "new"
    });

    expect(readFileSync(logPath, "utf8")).not.toContain("\"id\":\"old\"");
    expect(service.query().items).toHaveLength(1);
  });

  it("paginates by cursor and clears only the structured log file", () => {
    const { service } = setup();

    for (let index = 0; index < 3; index += 1) {
      service.append({
        level: "info",
        category: "task",
        action: `step-${index}`,
        message: `step ${index}`
      });
    }

    const firstPage = service.query({ limit: 2 });
    const secondPage = service.query({ limit: 2, cursor: firstPage.nextCursor ?? undefined });

    expect(firstPage.items).toHaveLength(2);
    expect(secondPage.items).toHaveLength(1);
    service.clear();
    expect(service.query().items).toHaveLength(0);
  });
});
