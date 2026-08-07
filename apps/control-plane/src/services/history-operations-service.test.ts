import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createControlPlaneStore } from "./store";
import {
  buildHistoryOperationsDashboard,
  createDefaultHistoryOperationsState,
  createHistoryOperationsService
} from "./history-operations-service";

describe("history operations service", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
  });

  function setup() {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-history-ops-"));
    tempDirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);
    return { store, service: createHistoryOperationsService(store) };
  }

  it("starts with editable content directions instead of fixed series", () => {
    const state = createDefaultHistoryOperationsState("2026-08-07T00:00:00.000Z");
    expect(state.directions).toHaveLength(6);
    expect(state.directions.map((item) => item.name)).toContain("古人的日常生活");
    expect(state.directions.map((item) => item.name)).not.toContain("最系列");
    expect(state.topics).toEqual([]);
  });

  it("allows a three-post-per-day weekly target and caps larger values at 21", () => {
    const { service } = setup();

    expect(service.updateStrategy({ weeklyCadence: 21 }).strategy.weeklyCadence).toBe(21);
    expect(service.updateStrategy({ weeklyCadence: 22 }).strategy.weeklyCadence).toBe(21);
  });

  it("persists custom directions, topics, scores and fact cards", () => {
    const { store, service } = setup();
    const direction = service.createDirection({ name: "城市史", description: "从街道、市场和公共空间讲历史" });
    const topic = service.createTopic({ title: "宋代夜市真的通宵吗", directionId: direction.id });
    const updated = service.updateTopic(topic.id, {
      status: "ready",
      scores: { ...topic.scores, collectability: 5, evidenceStrength: 4 },
      sourceCards: [{
        id: "source-1",
        title: "东京梦华录",
        sourceType: "primary",
        citation: "卷二",
        url: null,
        claim: "记录北宋东京夜市活动",
        confidence: "A",
        notes: "仍需结合成书背景解释"
      }]
    });

    expect(updated.status).toBe("ready");
    expect(updated.sourceCards[0]?.confidence).toBe("A");
    expect(store.getState().historyOperations?.topics[0]?.scores.collectability).toBe(5);
  });

  it("builds normalized performance benchmarks and comment signals", () => {
    const state = createDefaultHistoryOperationsState();
    state.topics = [{
      id: "topic-1",
      title: "宋代夜市",
      directionId: "ordinary-life",
      angle: "城市生活",
      targetAudience: "普通读者",
      hook: "夜市是否真的通宵",
      status: "published",
      scores: { demand: 4, curiosity: 5, contrast: 4, collectability: 5, visualPotential: 4, evidenceStrength: 4, extensibility: 4, risk: 2 },
      sourceCards: [{ id: "source-1", title: "东京梦华录", sourceType: "primary", citation: "", url: null, claim: "", confidence: "A", notes: "" }],
      riskNotes: [],
      scheduledFor: null,
      linkedNotificationId: null,
      publishedPostId: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z"
    }];
    const report = buildHistoryOperationsDashboard(state, {
      posts: [{ id: "post-1", title: "宋代夜市真的通宵吗", publishedAt: null, url: null, views: 1000, likes: 80, collects: 120, comments: 20, shares: 10 }],
      overview: { postCount: 1, totalViews: 1000, totalLikes: 80, totalCollects: 120, totalComments: 20, totalShares: 10, engagementRate: 0.23 },
      lastSyncedAt: null,
      status: "idle",
      lastError: null,
      sourceUrl: "test"
    }, {
      records: [{ id: "reply-1", targetNotificationId: "n1", targetModuleType: null, sourceTitle: "宋代夜市", commenterName: null, commentText: "这个说法有什么史料依据吗", replyText: "待核实", inputMode: "manual", detectedNoteTitle: null, factualStatus: "needs-verification", verificationNote: null, createdAt: "2026-08-07T00:00:00.000Z", updatedAt: "2026-08-07T00:00:00.000Z" }]
    });

    expect(report.performance[0]).toMatchObject({ collectRate: 0.12, matchedTopicId: "topic-1" });
    expect(report.benchmarks.medianViews).toBe(1000);
    expect(report.evidenceCoverage).toBe(1);
    expect(report.commentSignals[0]?.label).toBe("事实质疑");
  });
});
