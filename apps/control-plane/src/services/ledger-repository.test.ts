import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  LedgerCoachMemory,
  LedgerFactRecord,
  LedgerReportRecord,
  LedgerSemanticRecord,
  LifeStageRecord
} from "@agent-zy/shared-types";
import { afterEach, describe, expect, it } from "vitest";

import { createLedgerRepository } from "./ledger-repository";

describe("ledger repository", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, {
        recursive: true,
        force: true
      });
    }
  });

  it("creates dedicated ledger json files on first load", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-ledger-repository-test-"));
    tempDirs.push(dataDir);

    const repository = createLedgerRepository(dataDir);

    expect(existsSync(join(dataDir, "ledger", "facts.json"))).toBe(true);
    expect(existsSync(join(dataDir, "ledger", "semantics.json"))).toBe(true);
    expect(existsSync(join(dataDir, "ledger", "stages.json"))).toBe(true);
    expect(existsSync(join(dataDir, "ledger", "reports.json"))).toBe(true);
    expect(existsSync(join(dataDir, "ledger", "memories.json"))).toBe(true);
    expect(repository.readFacts()).toEqual([]);
    expect(repository.readSemantics()).toEqual([]);
    expect(repository.readStages()).toEqual([]);
    expect(repository.readReports()).toEqual([]);
    expect(repository.readMemories()).toEqual([]);
  });

  it("persists ledger records into dedicated files", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-ledger-repository-test-"));
    tempDirs.push(dataDir);
    const repository = createLedgerRepository(dataDir);

    const fact: LedgerFactRecord = {
      id: "fact-1",
      sourceType: "chat",
      rawText: "午饭 32 元",
      normalizedText: "午饭32元",
      direction: "expense",
      amountCents: 3200,
      currency: "CNY",
      occurredAt: "2026-05-14T12:00:00.000Z",
      recordedAt: "2026-05-14T12:00:10.000Z",
      status: "confirmed",
      taskId: "task-1"
    };
    const semantic: LedgerSemanticRecord = {
      factId: fact.id,
      primaryCategory: "餐饮",
      secondaryCategories: ["午餐"],
      tags: ["工作日"],
      people: [],
      scene: "办公室附近",
      lifeStageIds: ["stage-1"],
      confidence: 0.9,
      reasoningSummary: "明确餐饮消费",
      parserVersion: "test-v1"
    };
    const stage: LifeStageRecord = {
      id: "stage-1",
      name: "当前工作阶段",
      startAt: "2026-05-01",
      status: "active",
      description: "测试阶段",
      tags: ["工作"]
    };
    const report: LedgerReportRecord = {
      id: "report-1",
      kind: "weekly",
      periodStart: "2026-05-12",
      periodEnd: "2026-05-18",
      generatedAt: "2026-05-18T00:00:00.000Z",
      summary: "本周支出平稳",
      insights: ["餐饮支出占比高"],
      risks: [],
      opportunities: ["可以优化午餐预算"],
      promptVersion: "test-v1"
    };
    const memory: LedgerCoachMemory = {
      id: "memory-1",
      date: "2026-05-14",
      type: "pattern",
      title: "工作日午餐偏高",
      content: "连续出现较高午餐消费",
      relatedFactIds: [fact.id],
      score: 0.8
    };

    repository.writeFacts([fact]);
    repository.writeSemantics([semantic]);
    repository.writeStages([stage]);
    repository.writeReports([report]);
    repository.writeMemories([memory]);

    expect(repository.readFacts()).toEqual([fact]);
    expect(repository.readSemantics()).toEqual([semantic]);
    expect(repository.readStages()).toEqual([stage]);
    expect(repository.readReports()).toEqual([report]);
    expect(repository.readMemories()).toEqual([memory]);
  });

  it("throws when facts.json is corrupted", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-ledger-repository-test-"));
    tempDirs.push(dataDir);
    const repository = createLedgerRepository(dataDir);

    writeFileSync(join(dataDir, "ledger", "facts.json"), "{not-valid-json", "utf8");

    expect(() => repository.readFacts()).toThrow(/facts\.json/);
  });
});
