import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { nanoid } from "nanoid";

import type {
  EventLogInput,
  EventLogQuery,
  EventLogQueryResult,
  EventLogRecord
} from "@agent-zy/shared-types";

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const SUMMARY_LIMIT = 500;
const DEFAULT_QUERY_LIMIT = 100;
const MAX_QUERY_LIMIT = 500;
const SENSITIVE_KEY = /(api[-_]?key|authorization|token|secret|password|credential)/i;
const SENSITIVE_VALUE = /(bearer\s+)[^\s"']+|(sk-[a-z0-9_-]+)/gi;

function truncate(value: string) {
  return value.length > SUMMARY_LIMIT ? `${value.slice(0, SUMMARY_LIMIT)}...` : value;
}

function redactString(value: string) {
  return truncate(value.replace(SENSITIVE_VALUE, (_match, prefix) => prefix ? `${prefix}[redacted]` : "[redacted]"));
}

function redactValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactValue(entryValue, entryKey)])
    );
  }

  return value;
}

function parseCursor(cursor: string | undefined) {
  if (!cursor) {
    return 0;
  }

  const value = Number.parseInt(cursor, 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export interface EventLogService {
  append(input: EventLogInput): EventLogRecord | null;
  query(query?: EventLogQuery): EventLogQueryResult;
  clear(): void;
}

export function createEventLogService(
  dataDir: string,
  options?: {
    now?: () => Date;
  }
): EventLogService {
  const filePath = resolve(dataDir, "logs", "events.jsonl");
  const now = options?.now ?? (() => new Date());
  mkdirSync(dirname(filePath), { recursive: true });

  function readRecords() {
    let text = "";

    try {
      text = readFileSync(filePath, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { records: [] as EventLogRecord[], corruptedCount: 0 };
      }

      throw error;
    }

    const records: EventLogRecord[] = [];
    let corruptedCount = 0;

    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      try {
        records.push(JSON.parse(line) as EventLogRecord);
      } catch {
        corruptedCount += 1;
      }
    }

    return { records, corruptedCount };
  }

  function pruneExpired(referenceTime: Date) {
    const { records, corruptedCount } = readRecords();
    const cutoff = referenceTime.getTime() - RETENTION_MS;
    const retained = records.filter((record) => {
      const timestamp = Date.parse(record.timestamp);
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    });

    if (retained.length !== records.length || corruptedCount > 0) {
      writeFileSync(filePath, retained.map((record) => JSON.stringify(record)).join("\n") + (retained.length ? "\n" : ""), "utf8");
    }
  }

  return {
    append(input) {
      try {
        const current = now();
        pruneExpired(current);
        const record = redactValue({
          ...input,
          id: input.id ?? nanoid(),
          timestamp: input.timestamp ?? current.toISOString()
        }) as EventLogRecord;
        appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
        return record;
      } catch {
        return null;
      }
    },
    query(query = {}) {
      const { records, corruptedCount } = readRecords();
      const normalizedQuery = query.q?.trim().toLocaleLowerCase("zh-CN");
      const filtered = records
        .filter((record) => !query.level || record.level === query.level)
        .filter((record) => !query.category || record.category === query.category)
        .filter((record) => !query.agentId || record.agentId === query.agentId)
        .filter((record) => !query.taskId || record.taskId === query.taskId)
        .filter((record) => !query.requestId || record.requestId === query.requestId)
        .filter((record) => {
          if (!normalizedQuery) {
            return true;
          }

          return JSON.stringify(record).toLocaleLowerCase("zh-CN").includes(normalizedQuery);
        })
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
      const offset = parseCursor(query.cursor);
      const limit = Math.min(Math.max(query.limit ?? DEFAULT_QUERY_LIMIT, 1), MAX_QUERY_LIMIT);
      const items = filtered.slice(offset, offset + limit);

      return {
        items,
        nextCursor: offset + limit < filtered.length ? String(offset + limit) : null,
        summary: {
          total: filtered.length,
          errorCount: filtered.filter((record) => record.level === "error").length,
          latestTimestamp: filtered[0]?.timestamp ?? null
        },
        warnings: corruptedCount > 0 ? [`跳过 ${corruptedCount} 条损坏的日志记录`] : []
      };
    },
    clear() {
      writeFileSync(filePath, "", "utf8");
    }
  };
}
