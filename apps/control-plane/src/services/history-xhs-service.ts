import * as XLSX from "xlsx";

import type { HistoryXhsPostMetrics, HistoryXhsState } from "@agent-zy/shared-types";

export interface HistoryXhsService {
  importWorkbook(input: { buffer: Buffer; fileName?: string | null }): Promise<HistoryXhsState>;
}

const DEFAULT_SOURCE_LABEL = "小红书笔记明细表";

function buildOverview(posts: HistoryXhsPostMetrics[]): HistoryXhsState["overview"] {
  const totalViews = posts.reduce((sum, post) => sum + post.views, 0);
  const totalLikes = posts.reduce((sum, post) => sum + post.likes, 0);
  const totalCollects = posts.reduce((sum, post) => sum + post.collects, 0);
  const totalComments = posts.reduce((sum, post) => sum + post.comments, 0);
  const totalShares = posts.reduce((sum, post) => sum + post.shares, 0);
  const engagement = totalLikes + totalCollects + totalComments + totalShares;

  return {
    postCount: posts.length,
    totalViews,
    totalLikes,
    totalCollects,
    totalComments,
    totalShares,
    engagementRate: totalViews > 0 ? engagement / totalViews : null
  };
}

export function buildHistoryXhsState(input: {
  posts: HistoryXhsPostMetrics[];
  syncedAt?: string;
  status?: HistoryXhsState["status"];
  lastError?: string | null;
  sourceUrl?: string;
}): HistoryXhsState {
  return {
    posts: input.posts,
    overview: buildOverview(input.posts),
    lastSyncedAt: input.syncedAt ?? new Date().toISOString(),
    status: input.status ?? "idle",
    lastError: input.lastError ?? null,
    sourceUrl: input.sourceUrl ?? DEFAULT_SOURCE_LABEL
  };
}

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function parseMetric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  const normalized = String(value ?? "").replace(/,/g, "").trim();
  const match = normalized.match(/([\d.]+)\s*([万千kK]?)/);

  if (!match) {
    return 0;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return 0;
  }

  const unit = match[2];
  if (unit === "万") {
    return Math.round(base * 10_000);
  }

  if (unit === "千" || unit === "k" || unit === "K") {
    return Math.round(base * 1_000);
  }

  return Math.round(base);
}

function parseChineseDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S))).toISOString();
    }
  }

  const text = String(value ?? "").trim();
  const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:(\d{1,2})时(\d{1,2})分(\d{1,2})秒)?/);
  if (match) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ).toISOString();
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function findHeaderRow(rows: unknown[][]) {
  return rows.findIndex((row) => row.map(normalizeHeader).includes("笔记标题"));
}

function cell(row: unknown[], headerIndex: Map<string, number>, names: string[]) {
  for (const name of names) {
    const index = headerIndex.get(name);
    if (index !== undefined) {
      return row[index];
    }
  }

  return undefined;
}

export function parseHistoryXhsWorkbook(buffer: Buffer, fileName = DEFAULT_SOURCE_LABEL): HistoryXhsState {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true
  });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;

  if (!sheet) {
    return buildHistoryXhsState({
      posts: [],
      status: "failed",
      lastError: "Excel 文件中没有可读取的工作表。",
      sourceUrl: fileName
    });
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: ""
  });
  const headerRowIndex = findHeaderRow(rows);

  if (headerRowIndex < 0) {
    return buildHistoryXhsState({
      posts: [],
      status: "failed",
      lastError: "没有在 Excel 中找到“笔记标题”表头，请导入小红书笔记列表明细表。",
      sourceUrl: fileName
    });
  }

  const headers = rows[headerRowIndex]?.map(normalizeHeader) ?? [];
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const posts = rows
    .slice(headerRowIndex + 1)
    .map((row, index): HistoryXhsPostMetrics | null => {
      const title = String(cell(row, headerIndex, ["笔记标题", "标题"]) ?? "").trim();

      if (!title) {
        return null;
      }

      const publishedAt = parseChineseDate(cell(row, headerIndex, ["首次发布时间", "发布时间"]));
      const views = parseMetric(cell(row, headerIndex, ["观看量", "浏览", "浏览量", "阅读", "阅读量", "曝光"]));
      const likes = parseMetric(cell(row, headerIndex, ["点赞", "点赞数"]));
      const collects = parseMetric(cell(row, headerIndex, ["收藏", "收藏数"]));
      const comments = parseMetric(cell(row, headerIndex, ["评论", "评论数"]));
      const shares = parseMetric(cell(row, headerIndex, ["分享", "分享数"]));

      return {
        id: `xhs-import-${index + 1}`,
        title: title.slice(0, 120),
        publishedAt,
        url: null,
        views,
        likes,
        collects,
        comments,
        shares
      };
    })
    .filter((post): post is HistoryXhsPostMetrics => Boolean(post));

  if (posts.length === 0) {
    return buildHistoryXhsState({
      posts: [],
      status: "failed",
      lastError: "Excel 中没有识别到任何笔记数据。",
      sourceUrl: fileName
    });
  }

  return buildHistoryXhsState({
    posts,
    sourceUrl: fileName
  });
}

export function createHistoryXhsService(): HistoryXhsService {
  return {
    async importWorkbook(input) {
      return parseHistoryXhsWorkbook(input.buffer, input.fileName ?? DEFAULT_SOURCE_LABEL);
    }
  };
}
