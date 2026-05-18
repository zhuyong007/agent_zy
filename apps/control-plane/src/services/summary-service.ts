import { nanoid } from "nanoid";

import type { SummaryEntry, SummaryState, SummaryType } from "@agent-zy/shared-types";
import { createSummaryDraft } from "../../../../agents/summary-agent/src/index";

import type { ControlPlaneStore } from "./store";

export interface SummaryListQuery {
  summaryType?: SummaryType;
  q?: string;
  start?: string;
  end?: string;
}

export interface SummaryExportPayload {
  version: 1;
  exportedAt: string;
  metadata: {
    source: "agent-zy";
    count: number;
  };
  entries: SummaryEntry[];
}

const SUMMARY_TYPES = new Set<SummaryType>(["daily", "weekly", "monthly", "yearly"]);

function isSummaryType(value: unknown): value is SummaryType {
  return typeof value === "string" && SUMMARY_TYPES.has(value as SummaryType);
}

function sortEntries(entries: SummaryEntry[]): SummaryEntry[] {
  return [...entries].sort((left, right) => {
    const periodDelta = right.periodStart.localeCompare(left.periodStart);

    if (periodDelta !== 0) {
      return periodDelta;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeEntry(input: unknown, now: string, fallbackId = nanoid()): SummaryEntry {
  if (!isRecord(input)) {
    throw new Error("summary entry must be an object");
  }

  if (!isSummaryType(input.summaryType)) {
    throw new Error("summaryType must be daily, weekly, monthly, or yearly");
  }

  const periodStart = typeof input.periodStart === "string" ? input.periodStart : now.slice(0, 10);
  const periodEnd = typeof input.periodEnd === "string" ? input.periodEnd : periodStart;
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : now;
  const updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : now;

  return {
    id: typeof input.id === "string" && input.id.trim().length > 0 ? input.id : fallbackId,
    summaryType: input.summaryType,
    periodStart,
    periodEnd,
    title: typeof input.title === "string" ? input.title : `${input.summaryType} ${periodStart}`,
    rawInput: typeof input.rawInput === "string" ? input.rawInput : "",
    structuredFields: isRecord(input.structuredFields) ? input.structuredFields as SummaryEntry["structuredFields"] : {},
    aiDraft: typeof input.aiDraft === "string" ? input.aiDraft : "",
    finalSummary: typeof input.finalSummary === "string" ? input.finalSummary : "",
    moodTags: stringArray(input.moodTags),
    energyLevel: typeof input.energyLevel === "number" ? input.energyLevel : null,
    keywords: stringArray(input.keywords),
    createdAt,
    updatedAt,
    version: typeof input.version === "number" && input.version > 0 ? input.version : 1
  };
}

function matchesQuery(entry: SummaryEntry, query: SummaryListQuery) {
  if (query.summaryType && entry.summaryType !== query.summaryType) {
    return false;
  }

  if (query.start && entry.periodEnd < query.start) {
    return false;
  }

  if (query.end && entry.periodStart > query.end) {
    return false;
  }

  if (query.q) {
    const q = query.q.toLowerCase();
    const haystack = [
      entry.title,
      entry.rawInput,
      entry.aiDraft,
      entry.finalSummary,
      ...entry.keywords,
      ...entry.moodTags
    ].join("\n").toLowerCase();

    if (!haystack.includes(q)) {
      return false;
    }
  }

  return true;
}

function mergeState(state: SummaryState, patch: Partial<SummaryState>): SummaryState {
  return {
    ...state,
    ...patch,
    entries: sortEntries(patch.entries ?? state.entries),
    drafts: sortEntries(patch.drafts ?? state.drafts)
  };
}

export interface SummaryService {
  list(query?: SummaryListQuery): { entries: SummaryEntry[] };
  get(id: string): SummaryEntry | null;
  create(input: unknown): SummaryEntry;
  update(id: string, input: unknown): SummaryEntry;
  delete(id: string): { ok: true };
  generateDraft(input: { summaryType?: unknown; rawInput?: unknown }): SummaryEntry;
  export(): SummaryExportPayload;
  import(payload: unknown): { importedCount: number; skippedCount: number; entries: SummaryEntry[] };
}

export function createSummaryService(store: ControlPlaneStore): SummaryService {
  function save(next: SummaryState): SummaryState {
    return store.setSummaryState({
      ...next,
      lastUpdatedAt: new Date().toISOString()
    });
  }

  return {
    list(query = {}) {
      const entries = store.getState().summary.entries.filter((entry) => matchesQuery(entry, query));

      return {
        entries: sortEntries(entries)
      };
    },
    get(id) {
      return store.getState().summary.entries.find((entry) => entry.id === id) ?? null;
    },
    create(input) {
      const now = new Date().toISOString();
      const entry = normalizeEntry(input, now);
      const state = store.getState().summary;
      save(
        mergeState(state, {
          entries: [entry, ...state.entries.filter((item) => item.id !== entry.id)],
          drafts: state.drafts.filter((item) => item.id !== entry.id)
        })
      );

      return entry;
    },
    update(id, input) {
      const state = store.getState().summary;
      const current = state.entries.find((entry) => entry.id === id);

      if (!current || !isRecord(input)) {
        throw new Error("summary not found");
      }

      const updated = normalizeEntry(
        {
          ...current,
          ...input,
          id,
          createdAt: current.createdAt,
          updatedAt: new Date().toISOString(),
          version: current.version + 1
        },
        new Date().toISOString(),
        id
      );

      save(
        mergeState(state, {
          entries: [updated, ...state.entries.filter((entry) => entry.id !== id)]
        })
      );

      return updated;
    },
    delete(id) {
      const state = store.getState().summary;
      save(
        mergeState(state, {
          entries: state.entries.filter((entry) => entry.id !== id),
          drafts: state.drafts.filter((entry) => entry.id !== id)
        })
      );

      return {
        ok: true
      };
    },
    generateDraft(input) {
      const rawInput = typeof input.rawInput === "string" ? input.rawInput.trim() : "";

      if (rawInput.length === 0) {
        throw new Error("rawInput is required");
      }

      const summaryType = isSummaryType(input.summaryType)
        ? input.summaryType
        : store.getState().summary.settings.defaultSummaryType;
      const draft = createSummaryDraft({
        summaryType,
        rawInput,
        requestedAt: new Date().toISOString()
      });
      const state = store.getState().summary;
      save(
        mergeState(state, {
          drafts: [draft, ...state.drafts].slice(0, 20)
        })
      );

      return draft;
    },
    export() {
      const entries = sortEntries(store.getState().summary.entries);

      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        metadata: {
          source: "agent-zy",
          count: entries.length
        },
        entries
      };
    },
    import(payload) {
      if (!isRecord(payload) || !Array.isArray(payload.entries)) {
        throw new Error("invalid summary import payload");
      }

      const now = new Date().toISOString();
      const state = store.getState().summary;
      const existingIds = new Set(state.entries.map((entry) => entry.id));
      const existingKeys = new Set(
        state.entries.map((entry) => `${entry.summaryType}:${entry.periodStart}:${entry.periodEnd}:${entry.title}`)
      );
      const imported: SummaryEntry[] = [];
      let skippedCount = 0;

      for (const rawEntry of payload.entries) {
        const entry = normalizeEntry(rawEntry, now);
        const key = `${entry.summaryType}:${entry.periodStart}:${entry.periodEnd}:${entry.title}`;

        if (existingIds.has(entry.id) || existingKeys.has(key)) {
          skippedCount += 1;
          continue;
        }

        imported.push(entry);
        existingIds.add(entry.id);
        existingKeys.add(key);
      }

      if (imported.length > 0) {
        save(
          mergeState(state, {
            entries: [...imported, ...state.entries]
          })
        );
      }

      return {
        importedCount: imported.length,
        skippedCount,
        entries: imported
      };
    }
  };
}
