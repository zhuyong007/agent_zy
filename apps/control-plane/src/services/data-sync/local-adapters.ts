import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  BrowserAutomationState,
  DataSyncModule,
  HistoryXhsState,
  MhxyAssetFlipRecord,
  MhxyGameCoinPurchaseRecord,
  MhxyInventoryTarget,
  MhxyInventoryTransferRecord,
  MhxyPriceSnapshot,
  MhxyTradeRecord,
  NotificationRecord
} from "@agent-zy/shared-types";

import { createMhxyRepository } from "../mhxy-repository";
import type { ControlPlaneStore } from "../store";
import { canonicalJson, type SyncRecord, type SyncRecordMap } from "./merge";

export interface LocalDataSyncAdapter {
  read(): SyncRecordMap;
  write(records: SyncRecordMap): void;
}

export type LocalDataSyncAdapters = Record<DataSyncModule, LocalDataSyncAdapter>;

interface HistoryTopicArchiveEntry {
  topic: string;
  firstGeneratedAt: string;
  lastGeneratedAt: string;
  generatedCount: number;
}

function atomicWriteJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
}

function asRecord(value: unknown, label: string): SyncRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 不是有效对象`);
  }
  return structuredClone(value as SyncRecord);
}

function recordsWithPrefix(records: SyncRecordMap, prefix: string) {
  return [...records.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => structuredClone(value));
}

function assertKnownPrefixes(records: SyncRecordMap, prefixes: string[], label: string) {
  for (const key of records.keys()) {
    if (!prefixes.some((prefix) => key.startsWith(prefix))) {
      throw new Error(`${label}同步快照包含未知记录类型：${key}`);
    }
  }
}

function assertRecordIds(records: SyncRecordMap, prefix: string, label: string) {
  for (const [key, value] of records) {
    if (!key.startsWith(prefix)) continue;
    if (typeof value.id !== "string" || value.id !== key.slice(prefix.length)) {
      throw new Error(`${label}记录 ID 与同步键不匹配：${key}`);
    }
  }
}

function createHistoryAdapter(options: {
  dataDir: string;
  projectDir: string;
  store: ControlPlaneStore;
}): LocalDataSyncAdapter {
  const archivePath = join(options.dataDir, "history", "topic-archive.json");
  const seedPath = join(options.projectDir, "data", "history", "topic-archive.json");

  function ensureArchive() {
    if (existsSync(archivePath)) return;
    mkdirSync(dirname(archivePath), { recursive: true });
    if (existsSync(seedPath)) copyFileSync(seedPath, archivePath);
    else atomicWriteJson(archivePath, { entries: [] });
  }

  function readArchive(): HistoryTopicArchiveEntry[] {
    ensureArchive();
    const parsed = JSON.parse(readFileSync(archivePath, "utf8")) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) throw new Error(`历史选题归档格式无效：${archivePath}`);
    return parsed.entries.map((entry) => asRecord(entry, "历史选题") as unknown as HistoryTopicArchiveEntry);
  }

  return {
    read() {
      const state = options.store.getState();
      const records: SyncRecordMap = new Map();
      for (const notification of state.notifications.filter((item) => item.kind === "history-post")) {
        records.set(`notification:${notification.id}`, asRecord(notification, "历史内容"));
      }
      for (const post of state.historyXhs?.posts ?? []) {
        records.set(`xhs-post:${post.id}`, asRecord(post, "小红书指标"));
      }
      const xhs = state.historyXhs;
      if (xhs) {
        records.set("xhs-meta:state", {
          id: "state",
          overview: structuredClone(xhs.overview),
          lastSyncedAt: xhs.lastSyncedAt,
          sourceUrl: xhs.sourceUrl
        });
      }
      for (const entry of readArchive()) {
        records.set(`topic:${entry.topic}`, asRecord(entry, "历史选题"));
      }
      return records;
    },
    write(records) {
      assertKnownPrefixes(records, ["notification:", "xhs-post:", "xhs-meta:", "topic:"], "历史知识");
      assertRecordIds(records, "notification:", "历史内容");
      assertRecordIds(records, "xhs-post:", "小红书指标");
      for (const [key, value] of records) {
        if (key.startsWith("topic:") && value.topic !== key.slice("topic:".length)) {
          throw new Error(`历史选题与同步键不匹配：${key}`);
        }
      }
      const state = options.store.getState();
      const historyNotifications = recordsWithPrefix(records, "notification:") as unknown as NotificationRecord[];
      for (const notification of historyNotifications) {
        if (notification.kind !== "history-post" || !notification.id) {
          throw new Error("同步数据包含无效历史内容");
        }
      }
      const posts = recordsWithPrefix(records, "xhs-post:") as unknown as HistoryXhsState["posts"];
      const meta = records.get("xhs-meta:state") as
        | { overview?: HistoryXhsState["overview"]; lastSyncedAt?: string | null; sourceUrl?: string }
        | undefined;
      const currentXhs = state.historyXhs;
      state.notifications = [
        ...state.notifications.filter((item) => item.kind !== "history-post"),
        ...historyNotifications
      ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      state.historyXhs = {
        posts,
        overview: meta?.overview ?? currentXhs?.overview ?? {
          postCount: 0,
          totalViews: 0,
          totalLikes: 0,
          totalCollects: 0,
          totalComments: 0,
          totalShares: 0,
          engagementRate: null
        },
        lastSyncedAt: meta?.lastSyncedAt ?? null,
        sourceUrl: meta?.sourceUrl ?? currentXhs?.sourceUrl ?? "https://creator.xiaohongshu.com/statistics/data-analysis",
        status: currentXhs?.status ?? "idle",
        lastError: currentXhs?.lastError ?? null
      };
      const entries = recordsWithPrefix(records, "topic:") as unknown as HistoryTopicArchiveEntry[];
      atomicWriteJson(archivePath, { entries: entries.sort((left, right) => left.topic.localeCompare(right.topic)) });
      options.store.replaceState(state);
    }
  };
}

function createBrowserAdapter(store: ControlPlaneStore): LocalDataSyncAdapter {
  return {
    read() {
      const browser = store.getState().browserAutomation;
      const records: SyncRecordMap = new Map();
      for (const workflow of browser?.workflows ?? []) {
        records.set(`workflow:${workflow.id}`, asRecord(workflow, "浏览器工作流"));
      }
      for (const rule of browser?.triggerRules ?? []) {
        records.set(`trigger-rule:${rule.id}`, asRecord(rule, "浏览器触发规则"));
      }
      return records;
    },
    write(records) {
      assertKnownPrefixes(records, ["workflow:", "trigger-rule:"], "浏览器自动化");
      assertRecordIds(records, "workflow:", "浏览器工作流");
      assertRecordIds(records, "trigger-rule:", "浏览器触发规则");
      const current = store.getState().browserAutomation;
      store.setBrowserAutomationState({
        workflows: recordsWithPrefix(records, "workflow:") as unknown as BrowserAutomationState["workflows"],
        triggerRules: recordsWithPrefix(records, "trigger-rule:") as unknown as BrowserAutomationState["triggerRules"],
        runs: current?.runs ?? [],
        lastUpdatedAt: current?.lastUpdatedAt ?? null
      });
    }
  };
}

function createMhxyAdapter(dataDir: string): LocalDataSyncAdapter {
  const repository = createMhxyRepository(dataDir);
  return {
    read() {
      const records: SyncRecordMap = new Map();
      for (const item of repository.readTrades()) records.set(`trade:${item.id}`, asRecord(item, "梦幻交易"));
      for (const item of repository.readPriceSnapshots()) records.set(`price-snapshot:${item.id}`, asRecord(item, "价格快照"));
      for (const item of repository.readInventoryTransfers()) records.set(`inventory-transfer:${item.id}`, asRecord(item, "库存转移"));
      for (const item of repository.readInventoryTargets()) {
        const identity = canonicalJson([item.itemName, item.serverName, item.characterName]);
        records.set(`inventory-target:${identity}`, asRecord(item, "库存目标"));
      }
      for (const item of repository.readAssetFlips()) records.set(`asset-flip:${item.id}`, asRecord(item, "召唤兽装备记录"));
      for (const item of repository.readGameCoinPurchases()) records.set(`game-coin-purchase:${item.id}`, asRecord(item, "游戏币购入记录"));
      return records;
    },
    write(records) {
      const prefixes = [
        "trade:",
        "price-snapshot:",
        "inventory-transfer:",
        "inventory-target:",
        "asset-flip:",
        "game-coin-purchase:"
      ];
      assertKnownPrefixes(records, prefixes, "梦幻西游");
      for (const prefix of prefixes.filter((item) => item !== "inventory-target:")) {
        assertRecordIds(records, prefix, "梦幻西游");
      }
      for (const [key, value] of records) {
        if (!key.startsWith("inventory-target:")) continue;
        const identity = canonicalJson([value.itemName, value.serverName, value.characterName]);
        if (key !== `inventory-target:${identity}`) {
          throw new Error(`库存目标与同步键不匹配：${key}`);
        }
      }

      const current = {
        trades: repository.readTrades(),
        snapshots: repository.readPriceSnapshots(),
        transfers: repository.readInventoryTransfers(),
        targets: repository.readInventoryTargets(),
        assetFlips: repository.readAssetFlips(),
        gameCoinPurchases: repository.readGameCoinPurchases()
      };
      const next = {
        trades: recordsWithPrefix(records, "trade:") as unknown as MhxyTradeRecord[],
        snapshots: recordsWithPrefix(records, "price-snapshot:") as unknown as MhxyPriceSnapshot[],
        transfers: recordsWithPrefix(records, "inventory-transfer:") as unknown as MhxyInventoryTransferRecord[],
        targets: recordsWithPrefix(records, "inventory-target:") as unknown as MhxyInventoryTarget[],
        assetFlips: recordsWithPrefix(records, "asset-flip:") as unknown as MhxyAssetFlipRecord[],
        gameCoinPurchases: recordsWithPrefix(records, "game-coin-purchase:") as unknown as MhxyGameCoinPurchaseRecord[]
      };
      try {
        repository.writeTrades(next.trades);
        repository.writePriceSnapshots(next.snapshots);
        repository.writeInventoryTransfers(next.transfers);
        repository.writeInventoryTargets(next.targets);
        repository.writeAssetFlips(next.assetFlips);
        repository.writeGameCoinPurchases(next.gameCoinPurchases);
      } catch (error) {
        repository.writeTrades(current.trades);
        repository.writePriceSnapshots(current.snapshots);
        repository.writeInventoryTransfers(current.transfers);
        repository.writeInventoryTargets(current.targets);
        repository.writeAssetFlips(current.assetFlips);
        repository.writeGameCoinPurchases(current.gameCoinPurchases);
        throw error;
      }
    }
  };
}

export function createLocalDataSyncAdapters(options: {
  dataDir: string;
  projectDir: string;
  store: ControlPlaneStore;
}): LocalDataSyncAdapters {
  return {
    history: createHistoryAdapter(options),
    mhxy: createMhxyAdapter(options.dataDir),
    "browser-automation": createBrowserAdapter(options.store)
  };
}
