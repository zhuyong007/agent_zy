import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { NewsCategory, NewsItem, NewsRawItem } from "@agent-zy/shared-types";

import {
  analyzeNewsItem,
  fetchNews,
  openDashboardStream,
  refreshNews
} from "../api";
import { CommandRail, useLiveClock, useThemePreference } from "./dashboard-page";

const categories: Array<{
  value: NewsCategory;
  label: string;
}> = [
  { value: "ai-models", label: "模型" },
  { value: "ai-products", label: "产品" },
  { value: "industry", label: "行业" },
  { value: "paper", label: "论文" },
  { value: "tip", label: "技巧" }
];

const importanceLabels: Record<NewsItem["importance"], string> = {
  high: "高",
  medium: "中",
  low: "低"
};

const summaryProviderLabels: Record<"aihot" | "llm" | "fallback" | "none", string> = {
  aihot: "AI HOT",
  llm: "旧版归纳",
  fallback: "旧版归纳",
  none: "未同步"
};

function formatDateTime(timestamp?: string | null) {
  if (!timestamp) {
    return "--";
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function categoryLabel(category: NewsCategory) {
  return categories.find((item) => item.value === category)?.label ?? category;
}

function trimErrorLabel(error: string | null) {
  if (!error) {
    return null;
  }

  return error.length > 42 ? `${error.slice(0, 42)}...` : error;
}

function NewsDigestItem({
  item,
  selected,
  onSelect
}: {
  item: NewsItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`news-digest-item${selected ? " is-selected" : ""}`}
      onClick={onSelect}
    >
      <span className={`news-importance news-importance--${item.importance}`}>
        {importanceLabels[item.importance]}
      </span>
      <div className="news-digest-item__body">
        <div className="news-digest-item__meta">
          <span>{categoryLabel(item.category)}</span>
          <span>{item.sources[0] ?? "AI HOT"}</span>
          <time>{formatDateTime(item.updatedAt)}</time>
        </div>
        <h2>{item.title}</h2>
        <div className="news-digest-item__summary">
          <span>摘要</span>
          <p>{item.summary}</p>
        </div>
      </div>
    </button>
  );
}

function SourceLinkList({
  item,
  rawItemsById
}: {
  item: NewsItem;
  rawItemsById: Map<string, NewsRawItem>;
}) {
  const rawItems = item.rawItemIds
    .map((rawItemId) => rawItemsById.get(rawItemId))
    .filter((rawItem): rawItem is NewsRawItem => rawItem !== undefined);

  if (rawItems.length === 0) {
    return <div className="edge-empty">这条热点暂无原文链接。</div>;
  }

  return (
    <div className="news-source-links">
      {rawItems.map((rawItem) => (
        <a key={rawItem.id} href={rawItem.url} target="_blank" rel="noreferrer">
          <span>{rawItem.sourceName}</span>
          <strong>{rawItem.title}</strong>
          <small>{formatDateTime(rawItem.publishedAt)}</small>
        </a>
      ))}
    </div>
  );
}

export function NewsPage() {
  const queryClient = useQueryClient();
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const [category, setCategory] = useState<NewsCategory | "all">("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const newsQuery = useQuery({
    queryKey: ["news"],
    queryFn: fetchNews
  });

  useEffect(() => {
    return openDashboardStream((data) => {
      queryClient.setQueryData(["news"], data.news);
    });
  }, [queryClient]);

  const refreshMutation = useMutation({
    mutationFn: () => refreshNews("manual"),
    onSuccess: async (news) => {
      queryClient.setQueryData(["news"], news);
      await queryClient.invalidateQueries({
        queryKey: ["dashboard"]
      });
    }
  });

  const analyzeMutation = useMutation({
    mutationFn: analyzeNewsItem,
    onSuccess: (news) => {
      queryClient.setQueryData(["news"], news);
    }
  });

  const news = newsQuery.data;
  const rawItemsById = useMemo(
    () => new Map((news?.rawItems ?? []).map((rawItem) => [rawItem.id, rawItem])),
    [news?.rawItems]
  );
  const items = useMemo(() => {
    const source = news?.items ?? [];
    return source.filter((item) => category === "all" || item.category === category);
  }, [category, news?.items]);
  const selectedItem =
    items.find((item) => item.id === selectedItemId) ??
    news?.items.find((item) => item.id === selectedItemId) ??
    items[0] ??
    news?.items[0] ??
    null;

  useEffect(() => {
    if (!selectedItemId && selectedItem) {
      setSelectedItemId(selectedItem.id);
    }
  }, [selectedItem, selectedItemId]);

  if (newsQuery.isLoading || !news) {
    return <div className="loading-shell">正在连接 AI HOT 工作台...</div>;
  }

  return (
    <main className="workspace news-workspace">
      <CommandRail
        activeSection="news"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        rightMeta={[
          { label: "source", value: "AI HOT" },
          { label: "stories", value: String(news.items.length) },
          { label: "同步于", value: formatDateTime(news.lastUpdatedAt) }
        ]}
      />

      <section className="news-board news-board--aihot">
        <section className="news-digest news-digest--aihot">
          <div className="news-aihot-hero">
            <div>
              <p className="eyebrow">AI HOT Feed</p>
              <h1>AI 热点</h1>
              <p>精选 AI 动态按时间同步，摘要来自 aihot.virxact.com。</p>
            </div>
            <button
              type="button"
              className="news-refresh-button"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending ? "同步中..." : "同步 AI HOT"}
            </button>
          </div>

          <div className="news-digest__toolbar">
            <div className="news-category-tabs" role="tablist" aria-label="AI HOT 分类">
              <button
                type="button"
                className={category === "all" ? "is-active" : ""}
                onClick={() => setCategory("all")}
              >
                全部
              </button>
              {categories.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={category === item.value ? "is-active" : ""}
                  onClick={() => setCategory(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="news-digest__status">
              <span>来源 {summaryProviderLabels[news.lastSummaryProvider]}</span>
              <span>{news.lastSummaryInputItemIds.length} 条本轮同步</span>
              <span>
                {news.lastSummarizedAt
                  ? `最近同步 ${formatDateTime(news.lastSummarizedAt)}`
                  : "最近同步 --"}
              </span>
              {trimErrorLabel(news.lastSummaryError) ? (
                <span title={news.lastSummaryError ?? undefined}>
                  错误 {trimErrorLabel(news.lastSummaryError)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="news-digest__list">
            {items.length > 0 ? (
              items.map((item) => (
                <NewsDigestItem
                  key={item.id}
                  item={item}
                  selected={selectedItem?.id === item.id}
                  onSelect={() => setSelectedItemId(item.id)}
                />
              ))
            ) : (
              <div className="edge-empty">当前分类还没有 AI HOT 条目，点击同步获取最新内容。</div>
            )}
          </div>
        </section>

        <aside className="news-inspector news-inspector--aihot">
          {selectedItem ? (
            <>
              <div className="news-section-heading">
                <p className="eyebrow">Inspector</p>
                <h2>{selectedItem.title}</h2>
              </div>
              <div className="news-inspector__metrics">
                <div>
                  <span>分类</span>
                  <strong>{categoryLabel(selectedItem.category)}</strong>
                </div>
                <div>
                  <span>重要程度</span>
                  <strong>{importanceLabels[selectedItem.importance]}</strong>
                </div>
                <div>
                  <span>更新时间</span>
                  <strong>{formatDateTime(selectedItem.updatedAt)}</strong>
                </div>
              </div>
              <p className="news-inspector__summary">{selectedItem.summary}</p>
              <SourceLinkList item={selectedItem} rawItemsById={rawItemsById} />
              <button
                type="button"
                className="news-analyze-button"
                disabled={analyzeMutation.isPending}
                onClick={() => analyzeMutation.mutate(selectedItem.id)}
              >
                {selectedItem.analysis
                  ? "重新分析"
                  : analyzeMutation.isPending
                    ? "分析中..."
                    : "分析这条热点"}
              </button>
              {selectedItem.analysis ? (
                <div className="news-analysis">
                  <div>
                    <span>对我的作用</span>
                    <p>{selectedItem.analysis.personalImpact}</p>
                  </div>
                  <div>
                    <span>可能变革</span>
                    <p>{selectedItem.analysis.possibleChanges}</p>
                  </div>
                  <div>
                    <span>和我的关系</span>
                    <p>{selectedItem.analysis.relationToMe}</p>
                  </div>
                  <ul>
                    {selectedItem.analysis.perspectives.map((perspective) => (
                      <li key={perspective}>{perspective}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <div className="edge-empty">选择一条 AI HOT 条目查看摘要、原文和按需分析。</div>
          )}
          <Link to="/" className="panel-link">
            返回首页工作台
          </Link>
        </aside>
      </section>
    </main>
  );
}
