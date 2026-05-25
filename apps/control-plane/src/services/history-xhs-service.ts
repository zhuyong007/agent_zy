import type { HistoryXhsPostMetrics, HistoryXhsState } from "@agent-zy/shared-types";

export const XHS_ANALYTICS_URL = "https://creator.xiaohongshu.com/statistics/data-analysis";

export interface HistoryXhsService {
  sync(): Promise<HistoryXhsState>;
}

type PlaywrightModule = {
  chromium: {
    launch(options: { headless: boolean }): Promise<{
      newPage(): Promise<{
        goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
        waitForTimeout(ms: number): Promise<void>;
        locator(selector: string): {
          innerText(options: { timeout: number }): Promise<string>;
        };
      }>;
      close(): Promise<void>;
    }>;
  };
};

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
    sourceUrl: input.sourceUrl ?? XHS_ANALYTICS_URL
  };
}

async function importPlaywright(): Promise<PlaywrightModule> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<PlaywrightModule>;

    return await dynamicImport("playwright");
  } catch (error) {
    throw new Error("Playwright 未安装，无法自动获取小红书数据。请安装 Playwright 后重试。");
  }
}

function parseMetric(value: string): number {
  const normalized = value.replace(/,/g, "").trim();
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

function pickMetric(line: string, labels: string[]): number {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：]?\\s*([\\d.,万千kK]+)`);
    const match = line.match(pattern);

    if (match) {
      return parseMetric(match[1]);
    }
  }

  return 0;
}

export function parseXhsVisibleText(text: string): HistoryXhsPostMetrics[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const posts: HistoryXhsPostMetrics[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const hasMetric =
      /(浏览|阅读|观看|曝光|点赞|收藏|评论|分享)\s*[:：]?\s*[\d.,万千kK]+/.test(line);

    if (!hasMetric) {
      continue;
    }

    const previous = lines[index - 1] ?? "";
    const title = previous && !/(浏览|阅读|观看|曝光|点赞|收藏|评论|分享)/.test(previous)
      ? previous
      : `小红书作品 ${posts.length + 1}`;

    posts.push({
      id: `xhs-post-${posts.length + 1}`,
      title: title.slice(0, 80),
      publishedAt: null,
      url: null,
      views: pickMetric(line, ["浏览", "阅读", "观看", "曝光"]),
      likes: pickMetric(line, ["点赞"]),
      collects: pickMetric(line, ["收藏"]),
      comments: pickMetric(line, ["评论"]),
      shares: pickMetric(line, ["分享"])
    });
  }

  return posts.slice(0, 100);
}

export function createHistoryXhsService(): HistoryXhsService {
  return {
    async sync() {
      let browser: Awaited<ReturnType<PlaywrightModule["chromium"]["launch"]>> | null = null;

      try {
        const { chromium } = await importPlaywright();
        browser = await chromium.launch({
          headless: false
        });
        const page = await browser.newPage();

        await page.goto(XHS_ANALYTICS_URL, {
          waitUntil: "domcontentloaded",
          timeout: 60_000
        });
        await page.waitForTimeout(5_000);

        const text = await page.locator("body").innerText({
          timeout: 10_000
        });
        const posts = parseXhsVisibleText(text);

        if (posts.length === 0) {
          return buildHistoryXhsState({
            posts: [],
            status: "failed",
            lastError: "没有从小红书页面识别到作品数据，请确认已登录并停留在数据分析页。"
          });
        }

        return buildHistoryXhsState({
          posts
        });
      } catch (error) {
        return buildHistoryXhsState({
          posts: [],
          status: "failed",
          lastError: error instanceof Error ? error.message : "获取小红书数据失败"
        });
      } finally {
        await browser?.close();
      }
    }
  };
}
