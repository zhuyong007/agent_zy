import { defineAgent } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type {
  NewsAnalysis,
  NewsArticleBody,
  NewsCategory,
  NewsImportance,
  NewsItem,
  NewsRawItem,
  NewsSource,
  NewsState
} from "@agent-zy/shared-types";

const CATEGORY_LABELS: Record<NewsCategory, string> = {
  ai: "AI",
  technology: "科技",
  economy: "经济",
  entertainment: "娱乐",
  world: "国际"
};
const INITIAL_SOURCE_BOOTSTRAP_LIMIT = 30;

function hashText(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ").trim();
}

function createSourceId(source: Pick<NewsSource, "name" | "url">): string {
  return `source-${hashText(`${source.name}:${source.url}`)}`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    );
}

function cleanText(value: string): string {
  return decodeEntities(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTag(block: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? cleanText(match[1]) : null;
}

function extractAttribute(block: string, attributeName: string): string | null {
  const pattern = new RegExp(`${attributeName}\\s*=\\s*["']([^"']+)["']`, "i");
  const match = block.match(pattern);
  return match ? decodeEntities(match[1]).trim() : null;
}

function resolveUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return baseUrl;
  }
}

function toNewsState(news: Partial<NewsState> | undefined): NewsState {
  return {
    items: news?.items ?? [],
    rawItems: news?.rawItems ?? [],
    sources: news?.sources ?? [],
    lastFetchedAt: news?.lastFetchedAt ?? news?.lastUpdatedAt ?? null,
    lastUpdatedAt: news?.lastUpdatedAt ?? null,
    lastSummarizedAt: news?.lastSummarizedAt ?? null,
    lastSummaryInputItemIds: news?.lastSummaryInputItemIds ?? [],
    lastSummaryProvider: news?.lastSummaryProvider ?? (news?.lastSummarizedAt ? "fallback" : "none"),
    lastSummaryError: news?.lastSummaryError ?? null,
    status: news?.status ?? "idle"
  };
}

function toNewsBodies(newsBodies: NewsArticleBody[] | undefined): NewsArticleBody[] {
  return Array.isArray(newsBodies) ? newsBodies : [];
}

interface ParsedNewsDocumentItem {
  title: string;
  url: string;
  publishedAt: string;
}

function parseDate(value: string | null, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function parseFeedDocument(body: string, source: NewsSource, requestedAt: string): ParsedNewsDocumentItem[] {
  const itemBlocks = [
    ...body.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...body.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)
  ].map((match) => match[1]);

  return itemBlocks
    .map((block) => {
      const title = extractTag(block, "title");
      const rssLink = extractTag(block, "link");
      const atomLinkMatch = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
      const link = rssLink ?? (atomLinkMatch ? decodeEntities(atomLinkMatch[1]).trim() : source.url);
      const publishedAt = parseDate(
        extractTag(block, "pubDate") ?? extractTag(block, "published") ?? extractTag(block, "updated"),
        requestedAt
      );

      if (!title) {
        return null;
      }

      return {
        title,
        url: resolveUrl(link, source.url),
        publishedAt
      };
    })
    .filter((item): item is ParsedNewsDocumentItem => item !== null);
}

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function collectJsonLdNodes(value: unknown, nodes: Record<string, unknown>[]) {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdNodes(item, nodes);
    }
    return;
  }

  const record = asRecord(value);

  if (!record) {
    return;
  }

  nodes.push(record);
  collectJsonLdNodes(record["@graph"], nodes);
  collectJsonLdNodes(record.mainEntity, nodes);
  collectJsonLdNodes(record.itemListElement, nodes);
  collectJsonLdNodes(record.item, nodes);
}

function resolveOptionalUrl(url: string | null, baseUrl: string): string | null {
  if (!url) {
    return null;
  }

  try {
    const resolved = new URL(url, baseUrl);

    if (!["http:", "https:"].includes(resolved.protocol)) {
      return null;
    }

    return resolved.href;
  } catch {
    return null;
  }
}

function extractUrlFromJsonLdNode(record: Record<string, unknown>, baseUrl: string): string | null {
  const direct = asString(record.url) ?? asString(record["@id"]);

  if (direct) {
    return resolveOptionalUrl(direct, baseUrl);
  }

  const mainEntity = asRecord(record.mainEntityOfPage) ?? asRecord(record.mainEntity);
  const nested = asString(mainEntity?.url) ?? asString(mainEntity?.["@id"]);

  return resolveOptionalUrl(nested, baseUrl);
}

function extractItemsFromJsonLd(
  body: string,
  source: NewsSource,
  requestedAt: string
): ParsedNewsDocumentItem[] {
  const scriptMatches = [...body.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const articleTypes = new Set([
    "newsarticle",
    "article",
    "blogposting",
    "report",
    "analysisnewsarticle"
  ]);
  const deduped = new Map<string, ParsedNewsDocumentItem>();

  for (const match of scriptMatches) {
    const parsed = parseJson(match[1].trim());

    if (!parsed) {
      continue;
    }

    const nodes: Record<string, unknown>[] = [];
    collectJsonLdNodes(parsed, nodes);

    for (const node of nodes) {
      const types = asStringArray(node["@type"]).map((type) => type.toLowerCase());
      const isArticleNode = types.some((type) => articleTypes.has(type));
      const title = cleanText(asString(node.headline) ?? asString(node.name) ?? "");

      if (!isArticleNode || !title) {
        continue;
      }

      const url = extractUrlFromJsonLdNode(node, source.url) ?? source.url;
      const publishedAt = parseDate(
        asString(node.datePublished) ?? asString(node.dateCreated) ?? asString(node.dateModified),
        requestedAt
      );
      const key = `${normalizeTitle(title)}:${url}`;

      if (!deduped.has(key)) {
        deduped.set(key, {
          title,
          url,
          publishedAt
        });
      }
    }
  }

  return [...deduped.values()];
}

function extractItemsFromAnchors(
  body: string,
  source: NewsSource,
  requestedAt: string
): ParsedNewsDocumentItem[] {
  const anchorMatches = [...body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const sourceHost = (() => {
    try {
      return new URL(source.url).hostname;
    } catch {
      return "";
    }
  })();
  const deduped = new Map<string, ParsedNewsDocumentItem>();

  for (const match of anchorMatches) {
    const title = cleanText(match[2]);
    const url = resolveOptionalUrl(decodeEntities(match[1]).trim(), source.url);

    if (!title || title.length < 12 || title.length > 160 || !url || url === source.url) {
      continue;
    }

    const host = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "";
      }
    })();

    if (sourceHost && host && host !== sourceHost) {
      continue;
    }

    if (/^(read more|more|next|详情|查看更多|点击查看)$/i.test(title)) {
      continue;
    }

    const key = `${normalizeTitle(title)}:${url}`;

    if (!deduped.has(key)) {
      deduped.set(key, {
        title,
        url,
        publishedAt: requestedAt
      });
    }

    if (deduped.size >= 12) {
      break;
    }
  }

  return [...deduped.values()];
}

function parseHtmlDocument(body: string, source: NewsSource, requestedAt: string): ParsedNewsDocumentItem[] {
  const jsonLdItems = extractItemsFromJsonLd(body, source, requestedAt);

  if (jsonLdItems.length > 0) {
    return jsonLdItems;
  }

  const anchorItems = extractItemsFromAnchors(body, source, requestedAt);

  if (anchorItems.length > 0) {
    return anchorItems;
  }

  const ogTitleMatch = body.match(
    /<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  const reverseOgTitleMatch = body.match(
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["'][^>]*>/i
  );
  const title =
    (ogTitleMatch ? cleanText(ogTitleMatch[1]) : null) ??
    (reverseOgTitleMatch ? cleanText(reverseOgTitleMatch[1]) : null) ??
    extractTag(body, "title");

  if (!title) {
    return [];
  }

  const canonicalMatch = body.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  const reverseCanonicalMatch = body.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  const publishedAt = parseDate(
    extractAttribute(
      body.match(/<meta\b[^>]*(?:property|name)=["']article:published_time["'][^>]*>/i)?.[0] ?? "",
      "content"
    ) ??
      extractAttribute(
        body.match(/<time\b[^>]*datetime=["'][^"']+["'][^>]*>/i)?.[0] ?? "",
        "datetime"
      ),
    requestedAt
  );

  return [
    {
      title,
      url: resolveUrl(canonicalMatch?.[1] ?? reverseCanonicalMatch?.[1] ?? source.url, source.url),
      publishedAt
    }
  ];
}

function parseNewsDocument(
  body: string,
  contentType: string | null,
  source: NewsSource,
  requestedAt: string
): ParsedNewsDocumentItem[] {
  const trimmed = body.trim();
  const looksLikeFeed =
    /(?:rss|atom|xml)/i.test(contentType ?? "") ||
    /^<\?xml/i.test(trimmed) ||
    /<(rss|feed)\b/i.test(trimmed);

  return looksLikeFeed
    ? parseFeedDocument(body, source, requestedAt)
    : parseHtmlDocument(body, source, requestedAt);
}

async function fetchSourceItems(source: NewsSource, requestedAt: string): Promise<NewsRawItem[]> {
  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "agent-zy-news-agent/0.1"
      },
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      return [];
    }

    const body = await response.text();
    const parsedItems = parseNewsDocument(
      body,
      response.headers.get("content-type"),
      source,
      requestedAt
    );
    const sortedItems = [...parsedItems].sort((left, right) =>
      right.publishedAt.localeCompare(left.publishedAt)
    );
    const filteredItems = (() => {
      if (!source.lastFetchedAt) {
        return sortedItems.slice(0, INITIAL_SOURCE_BOOTSTRAP_LIMIT);
      }

      const cutoff = new Date(source.lastFetchedAt);
      return sortedItems.filter((item) => new Date(item.publishedAt) > cutoff);
    })();

    return filteredItems
      .map((item) => {
        const fingerprint = hashText(`${source.id}:${item.url}`);

        return {
          id: `raw-${fingerprint}`,
          sourceId: source.id,
          sourceName: source.name,
          category: source.category,
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt,
          fetchedAt: requestedAt,
          fingerprint
        };
      });
  } catch {
    return [];
  }
}

function dedupeRawItems(items: NewsRawItem[]): NewsRawItem[] {
  const seen = new Set<string>();
  const deduped: NewsRawItem[] = [];

  for (const item of items) {
    if (seen.has(item.fingerprint)) {
      continue;
    }

    seen.add(item.fingerprint);
    deduped.push(item);
  }

  return deduped.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function inferImportance(sourceCount: number, title: string): NewsImportance {
  if (sourceCount >= 3 || /(reshape|global|policy|supply chains)/i.test(title)) {
    return "high";
  }

  if (sourceCount >= 2) {
    return "medium";
  }

  return "low";
}

function sortNewsItems(items: NewsItem[]): NewsItem[] {
  const importanceRank: Record<NewsImportance, number> = {
    high: 3,
    medium: 2,
    low: 1
  };

  return [...items].sort((left, right) => {
    return (
      importanceRank[right.importance] - importanceRank[left.importance] ||
      right.updatedAt.localeCompare(left.updatedAt)
    );
  });
}

function sortNewsBodies(items: NewsArticleBody[]): NewsArticleBody[] {
  return [...items].sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt));
}

function syncNewsBodies(
  newsBodies: NewsArticleBody[],
  rawItems: NewsRawItem[],
  sources: NewsSource[]
): NewsArticleBody[] {
  const rawItemsById = new Map(rawItems.map((rawItem) => [rawItem.id, rawItem]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));

  return sortNewsBodies(
    newsBodies.flatMap((body) => {
      const rawItem = rawItemsById.get(body.rawItemId);
      const source = sourcesById.get(body.sourceId);

      if (!rawItem || !source || rawItem.sourceId !== source.id) {
        return [];
      }

      return [
        {
          ...body,
          sourceName: source.name,
          title: rawItem.title,
          url: rawItem.url
        }
      ];
    })
  );
}

function rebuildNewsItems(previousItems: NewsItem[], rawItems: NewsRawItem[]): NewsItem[] {
  const rawItemsById = new Map(rawItems.map((rawItem) => [rawItem.id, rawItem]));

  return sortNewsItems(
    previousItems.flatMap((item) => {
      const matchedRawItems = item.rawItemIds
        .map((rawItemId) => rawItemsById.get(rawItemId))
        .filter((rawItem): rawItem is NewsRawItem => rawItem !== undefined);

      if (matchedRawItems.length === 0) {
        return [];
      }

      const sources = [...new Set(matchedRawItems.map((rawItem) => rawItem.sourceName))];

      return [
        {
          ...item,
          category: matchedRawItems[0]?.category ?? item.category,
          rawItemIds: matchedRawItems.map((rawItem) => rawItem.id),
          sources,
          sourceCount: sources.length,
          updatedAt:
            matchedRawItems
              .map((rawItem) => rawItem.publishedAt)
              .sort((left, right) => right.localeCompare(left))[0] ?? item.updatedAt
        }
      ];
    })
  );
}

function syncNewsStateFromRawItems(
  news: NewsState,
  rawItems: NewsRawItem[],
  sources: NewsSource[]
): NewsState {
  const items = rebuildNewsItems(news.items, rawItems);
  const rawItemIds = new Set(rawItems.map((rawItem) => rawItem.id));
  const hasDigest = rawItems.length > 0 || items.length > 0;

  return {
    ...news,
    items,
    rawItems,
    sources,
    lastFetchedAt: rawItems.length > 0 ? news.lastFetchedAt : null,
    lastSummarizedAt: hasDigest ? news.lastSummarizedAt : null,
    lastSummaryInputItemIds: news.lastSummaryInputItemIds.filter((rawItemId) =>
      rawItemIds.has(rawItemId)
    ),
    lastSummaryProvider: hasDigest ? news.lastSummaryProvider : "none",
    lastSummaryError: hasDigest ? news.lastSummaryError : null
  };
}

function trimExcerpt(value: string, maxLength = 180): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3)}...`;
}

function stripNonContentTags(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
}

function extractArticleTextFromJsonLd(body: string): string | null {
  const scriptMatches = [...body.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const articleTypes = new Set([
    "newsarticle",
    "article",
    "blogposting",
    "report",
    "analysisnewsarticle"
  ]);

  for (const match of scriptMatches) {
    const parsed = parseJson(match[1].trim());

    if (!parsed) {
      continue;
    }

    const nodes: Record<string, unknown>[] = [];
    collectJsonLdNodes(parsed, nodes);

    for (const node of nodes) {
      const types = asStringArray(node["@type"]).map((type) => type.toLowerCase());

      if (!types.some((type) => articleTypes.has(type))) {
        continue;
      }

      const content = cleanText(
        asString(node.articleBody) ??
          asString(node.text) ??
          asString(node.description) ??
          ""
      );

      if (content) {
        return content;
      }
    }
  }

  return null;
}

function extractArticleTextFromHtml(body: string): {
  content: string;
  excerpt: string;
} {
  const sanitized = stripNonContentTags(body);
  const structured = extractArticleTextFromJsonLd(sanitized);

  if (structured) {
    return {
      content: structured,
      excerpt: trimExcerpt(structured)
    };
  }

  const scope =
    sanitized.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    sanitized.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    sanitized.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    sanitized;
  const paragraphs = [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return {
      content: paragraphs.join("\n\n"),
      excerpt: trimExcerpt(paragraphs[0] ?? "")
    };
  }

  const fallback = cleanText(scope);

  return {
    content: fallback,
    excerpt: trimExcerpt(fallback)
  };
}

function createFailedArticleBody(
  rawItem: NewsRawItem,
  requestedAt: string,
  error: string
): NewsArticleBody {
  return {
    rawItemId: rawItem.id,
    sourceId: rawItem.sourceId,
    sourceName: rawItem.sourceName,
    title: rawItem.title,
    url: rawItem.url,
    content: "",
    excerpt: "",
    fetchedAt: requestedAt,
    status: "failed",
    error
  };
}

async function fetchArticleBody(
  rawItem: NewsRawItem,
  requestedAt: string
): Promise<NewsArticleBody> {
  try {
    const response = await fetch(rawItem.url, {
      headers: {
        "User-Agent": "agent-zy-news-agent/0.1"
      },
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      return createFailedArticleBody(
        rawItem,
        requestedAt,
        `抓取失败，HTTP ${response.status}`
      );
    }

    const body = await response.text();
    const article = extractArticleTextFromHtml(body);

    if (!article.content) {
      return createFailedArticleBody(rawItem, requestedAt, "正文提取失败");
    }

    return {
      rawItemId: rawItem.id,
      sourceId: rawItem.sourceId,
      sourceName: rawItem.sourceName,
      title: rawItem.title,
      url: rawItem.url,
      content: article.content,
      excerpt: article.excerpt,
      fetchedAt: requestedAt,
      status: "ready"
    };
  } catch (error) {
    return createFailedArticleBody(
      rawItem,
      requestedAt,
      error instanceof Error ? error.message : "正文抓取失败"
    );
  }
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function createChineseFallbackTitle(category: NewsCategory, title: string): string {
  if (/[\u4e00-\u9fa5]/.test(title)) {
    return title;
  }

  const compact = title.replace(/\s+/g, " ").trim();

  if (!compact) {
    return `${CATEGORY_LABELS[category]}热点更新`;
  }

  return `${CATEGORY_LABELS[category]}热点：${truncateText(compact, 48)}`;
}

function summarizeLocally(rawItems: NewsRawItem[], previousItems: NewsItem[], requestedAt: string): NewsItem[] {
  const analysisById = new Map(previousItems.map((item) => [item.id, item.analysis]));
  const groups = new Map<string, NewsRawItem[]>();

  for (const rawItem of rawItems) {
    const key = `${rawItem.category}:${normalizeTitle(rawItem.title)}`;
    groups.set(key, [...(groups.get(key) ?? []), rawItem]);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const first = group[0];
      const sources = [...new Set(group.map((item) => item.sourceName))];
      const id = `news-${hashText(key)}`;
      const sourceCount = sources.length;

      return {
        id,
        title: createChineseFallbackTitle(first.category, first.title),
        summary: `${sources.length} 个信源报道：${truncateText(first.title, 72)}。该动态显示 ${CATEGORY_LABELS[first.category]} 方向出现新变化，可继续观察其对个人工作流和决策节奏的影响。`,
        category: first.category,
        importance: inferImportance(sourceCount, first.title),
        sourceCount,
        sources,
        rawItemIds: group.map((item) => item.id),
        updatedAt: group
          .map((item) => item.publishedAt)
          .sort((left, right) => right.localeCompare(left))[0] ?? requestedAt,
        analysis: analysisById.get(id)
      };
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

interface ModelSummaryItem {
  title: string;
  summary: string;
  category?: NewsCategory;
  importance?: NewsImportance;
  rawItemIds?: string[];
}

function extractJsonArray(value: string): unknown {
  const cleaned = value.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");

  if (start < 0 || end < start) {
    throw new Error("Model response does not contain a JSON array");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function isModelSummaryItem(value: unknown): value is ModelSummaryItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<ModelSummaryItem>;
  return typeof item.title === "string" && typeof item.summary === "string";
}

function extractModelErrorMessage(payload: unknown): string | null {
  const record = asRecord(payload);
  const errorRecord = asRecord(record?.error);
  const message =
    asString(errorRecord?.message) ??
    asString(record?.message) ??
    asString(record?.error_message);
  const type = asString(errorRecord?.type);

  if (!message) {
    return null;
  }

  return type ? `${message} (${type})` : message;
}

function extractModelContent(payload: unknown): string | null {
  const record = asRecord(payload);

  if (!record) {
    return null;
  }

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  const delta = asRecord(firstChoice?.delta);

  return (
    asString(message?.content) ??
    asString(delta?.content) ??
    asString(firstChoice?.text) ??
    asString(asRecord(record.output)?.text)
  );
}

function extractContentFromEventStream(body: string): { content: string; error: string | null } {
  let content = "";
  let error: string | null = null;

  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const dataChunk = line.slice(5).trim();

    if (!dataChunk || dataChunk === "[DONE]") {
      continue;
    }

    const parsedChunk = parseJson(dataChunk);

    if (!parsedChunk) {
      continue;
    }

    const chunkError = extractModelErrorMessage(parsedChunk);

    if (chunkError) {
      error = chunkError;
      continue;
    }

    const chunkContent = extractModelContent(parsedChunk);

    if (chunkContent) {
      content += chunkContent;
    }
  }

  return {
    content,
    error
  };
}

function createItemsFromModelSummaries(
  summaries: ModelSummaryItem[],
  newRawItems: NewsRawItem[],
  previousItems: NewsItem[],
  requestedAt: string
): NewsItem[] {
  const rawById = new Map(newRawItems.map((item) => [item.id, item]));
  const analysisById = new Map(previousItems.map((item) => [item.id, item.analysis]));

  return summaries.map((summary, index) => {
    const matchedRawItems =
      summary.rawItemIds
        ?.map((id) => rawById.get(id))
        .filter((item): item is NewsRawItem => item !== undefined) ?? [];
    const group = matchedRawItems.length > 0 ? matchedRawItems : [newRawItems[index] ?? newRawItems[0]];
    const first = group[0];
    const category = summary.category ?? first.category;
    const sources = [...new Set(group.map((item) => item.sourceName))];
    const rawItemIds = [...new Set(group.map((item) => item.id))];
    const displayTitle = createChineseFallbackTitle(category, summary.title);
    const id = `news-${hashText(`${category}:${normalizeTitle(displayTitle)}:${rawItemIds.join(",")}`)}`;
    const sourceCount = sources.length;

    return {
      id,
      title: displayTitle,
      summary: summary.summary,
      category,
      importance: summary.importance ?? inferImportance(sourceCount, displayTitle),
      sourceCount,
      sources,
      rawItemIds,
      updatedAt:
        group
          .map((item) => item.publishedAt)
          .sort((left, right) => right.localeCompare(left))[0] ?? requestedAt,
      analysis: analysisById.get(id)
    };
  });
}

interface ModelScopeSummaryResult {
  items: NewsItem[] | null;
  error: string | null;
}

async function summarizeWithModelScope(
  newRawItems: NewsRawItem[],
  previousItems: NewsItem[],
  requestedAt: string
): Promise<ModelScopeSummaryResult> {
  const apiKey = process.env.MODELSCOPE_API_KEY;

  if (!apiKey) {
    return {
      items: null,
      error: "MODELSCOPE_API_KEY 未配置"
    };
  }

  const baseUrl = process.env.MODELSCOPE_BASE_URL ?? "https://api-inference.modelscope.cn/v1";
  const model = process.env.MODELSCOPE_MODEL ?? "MiniMax/MiniMax-M2.7";
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const inputItems = newRawItems.map((item) => ({
    id: item.id,
    title: item.title,
    source: item.sourceName,
    category: item.category,
    url: item.url,
    publishedAt: item.publishedAt
  }));

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "你是中文新闻编辑。只根据用户提供的新增新闻做聚合归纳，输出严格 JSON 数组，不要输出 Markdown。标题必须是中文。"
          },
          {
            role: "user",
            content: `请把下面这些半小时内新增新闻聚合为页面可展示的热点。只允许使用这些新增新闻，不要引用历史新闻。每项字段：title（中文标题）、summary（中文概括，1-2句，说明事情是什么和为什么值得看）、category（ai/technology/economy/entertainment/world）、importance（low/medium/high）、rawItemIds（被归入该热点的原始新闻 id 数组）。\n${JSON.stringify(inputItems, null, 2)}`
          }
        ],
        stream: true
      })
    });

    const responseText = await response.text();
    const contentType = response.headers.get("content-type");

    if (!response.ok) {
      const parsedErrorPayload = parseJson(responseText);
      const errorMessage = extractModelErrorMessage(parsedErrorPayload);
      return {
        items: null,
        error: errorMessage
          ? `ModelScope 请求失败：${errorMessage}`
          : `ModelScope 请求失败，HTTP ${response.status}`
      };
    }

    const streamResult = /text\/event-stream/i.test(contentType ?? "")
      ? extractContentFromEventStream(responseText)
      : {
          content: extractModelContent(parseJson(responseText)),
          error: extractModelErrorMessage(parseJson(responseText))
        };
    const content = streamResult.content?.trim() ?? "";

    if (!content) {
      return {
        items: null,
        error: streamResult.error ?? "ModelScope 返回内容为空"
      };
    }

    let parsed: unknown;

    try {
      parsed = extractJsonArray(content);
    } catch (error) {
      return {
        items: null,
        error: error instanceof Error ? error.message : "ModelScope 输出解析失败"
      };
    }

    if (!Array.isArray(parsed)) {
      return {
        items: null,
        error: "ModelScope 输出格式不是数组"
      };
    }

    const summaries = parsed.filter(isModelSummaryItem);

    if (summaries.length === 0) {
      return {
        items: null,
        error: "ModelScope 未返回可用的摘要项"
      };
    }

    return {
      items: createItemsFromModelSummaries(summaries, newRawItems, previousItems, requestedAt),
      error: null
    };
  } catch (error) {
    return {
      items: null,
      error: error instanceof Error ? error.message : "ModelScope 调用异常"
    };
  }
}

interface IncrementalSummaryResult {
  items: NewsItem[];
  provider: "llm" | "fallback";
  error: string | null;
}

async function summarizeIncremental(
  newRawItems: NewsRawItem[],
  previousItems: NewsItem[],
  requestedAt: string
): Promise<IncrementalSummaryResult> {
  const modelResult = await summarizeWithModelScope(newRawItems, previousItems, requestedAt);

  if (modelResult.items) {
    return {
      items: modelResult.items,
      provider: "llm",
      error: null
    };
  }

  return {
    items: summarizeLocally(newRawItems, previousItems, requestedAt),
    provider: "fallback",
    error: modelResult.error
  };
}

function addSource(input: AgentExecutionRequest): AgentExecutionResult {
  const news = toNewsState(input.state.news);
  const sourceInput = input.meta?.source as
    | Partial<Pick<NewsSource, "name" | "url" | "category">>
    | undefined;

  if (!sourceInput?.name || !sourceInput.url || !sourceInput.category) {
    return {
      status: "failed",
      summary: "缺少信源信息",
      assistantMessage: "添加信源需要提供名称、URL 和分类。"
    };
  }

  const source: NewsSource = {
    id: createSourceId({
      name: sourceInput.name,
      url: sourceInput.url
    }),
    name: sourceInput.name,
    url: sourceInput.url,
    category: sourceInput.category,
    enabled: true,
    createdAt: input.requestedAt
  };
  const existingIndex = news.sources.findIndex((item) => item.id === source.id);
  const sources =
    existingIndex >= 0
      ? news.sources.map((item) => (item.id === source.id ? { ...item, ...source } : item))
      : [...news.sources, source];

  return {
    status: "completed",
    summary: `添加信源 ${source.name}`,
    assistantMessage: `已添加热点信源：${source.name}。`,
    domainUpdates: {
      news: {
        ...news,
        sources,
        lastUpdatedAt: input.requestedAt
      }
    }
  };
}

function updateSource(input: AgentExecutionRequest): AgentExecutionResult {
  const news = toNewsState(input.state.news);
  const newsBodies = toNewsBodies(input.state.newsBodies);
  const sourceId = String(input.meta?.sourceId ?? "");
  const patch = asRecord(input.meta?.patch) ?? {};
  const source = news.sources.find((candidate) => candidate.id === sourceId);

  if (!source) {
    return {
      status: "failed",
      summary: "未找到信源",
      assistantMessage: "没有找到要更新的热点信源。"
    };
  }

  const requestedName = asString(patch.name)?.trim();
  const requestedUrl = asString(patch.url)?.trim();
  const requestedCategory = asString(patch.category);
  const nextSource: NewsSource = {
    ...source,
    name: requestedName || source.name,
    url: requestedUrl || source.url,
    category:
      requestedCategory && requestedCategory in CATEGORY_LABELS
        ? (requestedCategory as NewsCategory)
        : source.category,
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : source.enabled
  };
  const identityChanged =
    nextSource.url !== source.url || nextSource.category !== source.category;
  const sources = news.sources.map((candidate) =>
    candidate.id === source.id
      ? {
          ...nextSource,
          lastFetchedAt: identityChanged ? undefined : nextSource.lastFetchedAt
        }
      : candidate
  );
  const rawItems = identityChanged
    ? news.rawItems.filter((rawItem) => rawItem.sourceId !== source.id)
    : news.rawItems.map((rawItem) =>
        rawItem.sourceId === source.id
          ? {
              ...rawItem,
              sourceName: nextSource.name,
              category: nextSource.category
            }
          : rawItem
      );
  const nextNews = {
    ...syncNewsStateFromRawItems(news, rawItems, sources),
    lastUpdatedAt: input.requestedAt
  };
  const nextNewsBodies = syncNewsBodies(
    identityChanged
      ? newsBodies.filter((body) => body.sourceId !== source.id)
      : newsBodies.map((body) =>
          body.sourceId === source.id
            ? {
                ...body,
                sourceName: nextSource.name
              }
            : body
        ),
    rawItems,
    sources
  );

  return {
    status: "completed",
    summary: `更新信源 ${nextSource.name}`,
    assistantMessage: identityChanged
      ? `已更新信源 ${nextSource.name}，旧抓取内容已清空，等待下次刷新重新拉取。`
      : `已更新信源 ${nextSource.name}。`,
    domainUpdates: {
      news: nextNews,
      newsBodies: nextNewsBodies
    }
  };
}

function removeSource(input: AgentExecutionRequest): AgentExecutionResult {
  const news = toNewsState(input.state.news);
  const newsBodies = toNewsBodies(input.state.newsBodies);
  const sourceId = String(input.meta?.sourceId ?? "");
  const source = news.sources.find((candidate) => candidate.id === sourceId);

  if (!source) {
    return {
      status: "failed",
      summary: "未找到信源",
      assistantMessage: "没有找到要删除的热点信源。"
    };
  }

  const sources = news.sources.filter((candidate) => candidate.id !== source.id);
  const rawItems = news.rawItems.filter((rawItem) => rawItem.sourceId !== source.id);
  const nextNews = {
    ...syncNewsStateFromRawItems(news, rawItems, sources),
    lastUpdatedAt: input.requestedAt
  };
  const nextNewsBodies = syncNewsBodies(
    newsBodies.filter((body) => body.sourceId !== source.id),
    rawItems,
    sources
  );

  return {
    status: "completed",
    summary: `删除信源 ${source.name}`,
    assistantMessage: `已删除信源 ${source.name}，并清理关联抓取内容。`,
    domainUpdates: {
      news: nextNews,
      newsBodies: nextNewsBodies
    }
  };
}

async function fetchNewsArticles(
  input: AgentExecutionRequest
): Promise<AgentExecutionResult> {
  const news = toNewsState(input.state.news);
  const newsBodies = toNewsBodies(input.state.newsBodies);
  const itemId = String(input.meta?.itemId ?? "");
  const item = news.items.find((candidate) => candidate.id === itemId);

  if (!item) {
    return {
      status: "failed",
      summary: "未找到新闻",
      assistantMessage: "没有找到要查看原文的热点新闻。"
    };
  }

  const rawItemsById = new Map(news.rawItems.map((rawItem) => [rawItem.id, rawItem]));
  const matchedRawItems = item.rawItemIds
    .map((rawItemId) => rawItemsById.get(rawItemId))
    .filter((rawItem): rawItem is NewsRawItem => rawItem !== undefined);

  if (matchedRawItems.length === 0) {
    return {
      status: "failed",
      summary: "缺少原始新闻",
      assistantMessage: "当前热点缺少可抓取的原始新闻记录。"
    };
  }

  const cachedBodiesByRawItemId = new Map(
    newsBodies.map((body) => [body.rawItemId, body])
  );
  const uncachedRawItems = matchedRawItems.filter((rawItem) => {
    const cached = cachedBodiesByRawItemId.get(rawItem.id);
    return !cached || cached.status === "failed";
  });
  const fetchedBodies =
    uncachedRawItems.length > 0
      ? await Promise.all(
          uncachedRawItems.map((rawItem) => fetchArticleBody(rawItem, input.requestedAt))
        )
      : [];
  const nextBodiesByRawItemId = new Map(
    newsBodies.map((body) => [body.rawItemId, body])
  );

  for (const body of fetchedBodies) {
    nextBodiesByRawItemId.set(body.rawItemId, body);
  }

  const nextNewsBodies = syncNewsBodies(
    [...nextBodiesByRawItemId.values()],
    news.rawItems,
    news.sources
  );
  const readyCount = matchedRawItems.filter((rawItem) => {
    const body = nextNewsBodies.find((candidate) => candidate.rawItemId === rawItem.id);
    return body?.status === "ready";
  }).length;

  return {
    status: "completed",
    summary: `缓存原文 ${readyCount} 篇`,
    assistantMessage:
      uncachedRawItems.length > 0
        ? `已抓取并缓存 ${readyCount} 篇原文。`
        : `已返回缓存的 ${readyCount} 篇原文。`,
    domainUpdates: {
      newsBodies: nextNewsBodies
    }
  };
}

async function refreshNews(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
  const news = toNewsState(input.state.news);
  const enabledSources = news.sources.filter((source) => source.enabled);
  const forceSummary = input.meta?.forceSummary === true;
  const fetchedItemGroups = await Promise.all(
    enabledSources.map((source) => fetchSourceItems(source, input.requestedAt))
  );
  const existingFingerprints = new Set(news.rawItems.map((item) => item.fingerprint));
  const newRawItems = fetchedItemGroups
    .flat()
    .filter((item) => !existingFingerprints.has(item.fingerprint));
  const rawItems = dedupeRawItems([...newRawItems, ...news.rawItems]);
  const summaryInputItems =
    newRawItems.length > 0
      ? newRawItems
      : forceSummary
        ? rawItems.slice(0, 30)
        : [];
  const summaryResult =
    summaryInputItems.length > 0
      ? await summarizeIncremental(summaryInputItems, news.items, input.requestedAt)
      : null;
  const newItems = summaryResult?.items ?? [];
  const newRawItemIds = new Set(summaryInputItems.map((item) => item.id));
  const preservedItems = news.items.filter(
    (item) => !item.rawItemIds.some((rawItemId) => newRawItemIds.has(rawItemId))
  );
  const items = summaryInputItems.length > 0 ? sortNewsItems([...newItems, ...preservedItems]) : news.items;
  const sources = news.sources.map((source) =>
    source.enabled ? { ...source, lastFetchedAt: input.requestedAt } : source
  );

  return {
    status: "completed",
    summary: `刷新热点 ${newRawItems.length} 条新增`,
    assistantMessage:
      newRawItems.length > 0
        ? `已增量刷新 ${newRawItems.length} 条新闻，归纳为 ${items.length} 条热点。`
        : forceSummary && summaryInputItems.length > 0
          ? `没有发现新的热点内容，已重新整理 ${summaryInputItems.length} 条已有新闻。`
          : "没有发现新的热点内容，本次未调用归纳流程。",
    notifications:
      input.trigger === "schedule" && newRawItems.length > 0
        ? [
            {
              kind: "news-refresh",
              title: "热点已更新",
              body: `新增 ${newRawItems.length} 条新闻，归纳为 ${items.length} 条热点。`
            }
          ]
        : undefined,
    domainUpdates: {
      news: {
        ...news,
        items,
        rawItems,
        sources,
        lastFetchedAt: input.requestedAt,
        lastUpdatedAt: input.requestedAt,
        lastSummarizedAt: summaryInputItems.length > 0 ? input.requestedAt : news.lastSummarizedAt,
        lastSummaryInputItemIds: summaryInputItems.map((item) => item.id),
        lastSummaryProvider: summaryInputItems.length > 0 ? summaryResult?.provider ?? "fallback" : "none",
        lastSummaryError: summaryInputItems.length > 0 ? summaryResult?.error ?? null : null,
        status: "idle"
      }
    }
  };
}

function createAnalysis(item: NewsItem, requestedAt: string): NewsAnalysis {
  return {
    generatedAt: requestedAt,
    perspectives: [
      `个人效率：${item.title} 可能改变你规划工具、工作流和信息处理节奏的方式。`,
      `产品机会：${item.sourceCount} 个信源同时报道，说明这不是孤立噪声，可以转化为 Agent 能力或工作台功能假设。`,
      `风险提醒：重要程度为 ${item.importance}，需要观察后续是否出现政策、成本或供给侧约束。`
    ],
    personalImpact: "如果你正在构建个人 Agent 工作台，这条新闻可作为功能优先级和技能边界设计的参考。",
    possibleChanges: "它可能推动工具从单点问答转向持续监控、总结、提醒和可追踪执行。",
    relationToMe: "与你的关系在于：可以把热点变化沉淀成自动刷新、人工确认、按需深度分析的产品机制。"
  };
}

function analyzeNews(input: AgentExecutionRequest): AgentExecutionResult {
  const news = toNewsState(input.state.news);
  const itemId = String(input.meta?.itemId ?? "");
  const item = news.items.find((candidate) => candidate.id === itemId);

  if (!item) {
    return {
      status: "failed",
      summary: "未找到新闻",
      assistantMessage: "没有找到要分析的热点新闻。"
    };
  }

  if (item.analysis) {
    return {
      status: "completed",
      summary: "返回缓存新闻分析",
      assistantMessage: `已返回缓存分析：${item.title}`,
      domainUpdates: {
        news
      }
    };
  }

  const items = news.items.map((candidate) =>
    candidate.id === item.id
      ? {
          ...candidate,
          analysis: createAnalysis(candidate, input.requestedAt)
        }
      : candidate
  );

  return {
    status: "completed",
    summary: "生成新闻分析",
    assistantMessage: `已完成分析：${item.title}`,
    domainUpdates: {
      news: {
        ...news,
        items,
        lastUpdatedAt: input.requestedAt
      }
    }
  };
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    switch (input.meta?.action) {
      case "add-source":
        return addSource(input);
      case "update-source":
        return updateSource(input);
      case "remove-source":
        return removeSource(input);
      case "fetch-articles":
        return fetchNewsArticles(input);
      case "analyze":
        return analyzeNews(input);
      default:
        return refreshNews(input);
    }
  }
});

export default agent;
