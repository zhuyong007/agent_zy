import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { NewsCategory, NewsDailyReport, NewsFeedItem } from "@agent-zy/shared-types";

import { fetchNews, openDashboardStream, refreshNews } from "../api";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";

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

type NewsView = "all" | "daily";

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

function formatTimelineDate(timestamp: string) {
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric"
  });
}

function formatTime(timestamp?: string | null) {
  if (!timestamp) {
    return "--:--";
  }

  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function categoryLabel(category: NewsCategory) {
  return categories.find((item) => item.value === category)?.label ?? category;
}

function groupFeedItems(items: NewsFeedItem[]) {
  const groups = new Map<string, NewsFeedItem[]>();

  for (const item of items) {
    const key = item.publishedAt.slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()].map(([date, groupItems]) => ({
    date,
    label: formatTimelineDate(groupItems[0]?.publishedAt ?? date),
    items: groupItems
  }));
}

function FeedTimeline({ items }: { items: NewsFeedItem[] }) {
  const groups = useMemo(() => groupFeedItems(items), [items]);

  if (groups.length === 0) {
    return <div className="edge-empty">当前没有 AI HOT 新闻，点击刷新获取最新内容。</div>;
  }

  return (
    <div className="news-timeline news-timeline--page">
      {groups.map((group) => (
        <section key={group.date} className="news-timeline__group">
          <div className="news-timeline__date">{group.label}</div>
          <div className="news-timeline__items">
            {group.items.map((item) => (
              <article key={item.id} className="news-timeline-item">
                <time className="news-timeline-item__time">{formatTime(item.publishedAt)}</time>
                <span className="news-timeline-item__dot" aria-hidden="true" />
                <a className="news-timeline-card" href={item.url} target="_blank" rel="noreferrer">
                  <div className="news-timeline-card__meta">
                    <span>{item.source}</span>
                    <span>{categoryLabel(item.category)}</span>
                  </div>
                  <h2>{item.title}</h2>
                  <p>{item.summary}</p>
                  <div className="news-timeline-card__tags">
                    <span>{categoryLabel(item.category)}</span>
                    {item.titleEn ? <span>{item.titleEn}</span> : null}
                  </div>
                </a>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DailyReport({ report }: { report: NewsDailyReport | null }) {
  if (!report) {
    return <div className="edge-empty">暂无日报内容，点击刷新同步 AI HOT 日报。</div>;
  }

  return (
    <article className="news-daily-report">
      <header className="news-daily-report__header">
        <div>
          <p className="eyebrow">Daily Report</p>
          <h2>{report.lead.title}</h2>
          <p>{report.lead.summary}</p>
        </div>
        <div className="news-daily-report__meta">
          <span>{report.date}</span>
          <span>{formatDateTime(report.generatedAt)}</span>
        </div>
      </header>
      {report.flashes.length > 0 ? (
        <div className="news-daily-flashes">
          {report.flashes.map((flash) => (
            <span key={flash}>{flash}</span>
          ))}
        </div>
      ) : null}
      <div className="news-daily-sections">
        {report.sections.map((section) => (
          <section key={section.label} className="news-daily-section">
            <h3>{section.label}</h3>
            <div className="news-daily-section__items">
              {section.items.map((item) => (
                <a
                  key={`${section.label}-${item.title}`}
                  href={item.sourceUrl ?? "https://aihot.virxact.com/daily"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{item.sourceName}</span>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

export function NewsPage() {
  const queryClient = useQueryClient();
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const [view, setView] = useState<NewsView>("all");
  const [category, setCategory] = useState<NewsCategory | "all">("all");
  const [query, setQuery] = useState("");
  const { layout } = useHomeLayoutPreferences();

  const newsQuery = useQuery({
    queryKey: ["news"],
    queryFn: fetchNews
  });

  useEffect(() => {
    return openDashboardStream((data) => {
      queryClient.setQueryData(["home-layout"], data.homeLayout);
      queryClient.setQueryData(["news"], data.news);
    });
  }, [queryClient]);

  const refreshMutation = useMutation({
    mutationFn: () =>
      refreshNews(
        view === "daily"
          ? {
              view: "daily"
            }
          : {
              view: "all",
              category: category === "all" ? undefined : category,
              q: query.trim() || undefined,
              take: 50
            }
      ),
    onSuccess: async (news) => {
      queryClient.setQueryData(["news"], news);
      await queryClient.invalidateQueries({
        queryKey: ["dashboard"]
      });
    }
  });

  const archiveMutation = useMutation({
    mutationFn: (date: string) =>
      refreshNews({
        view: "daily",
        date
      }),
    onSuccess: (news) => {
      queryClient.setQueryData(["news"], news);
    }
  });

  const news = newsQuery.data;
  const filteredItems = useMemo(() => {
    const items = news?.feed.items ?? [];
    return items.filter((item) => category === "all" || item.category === category);
  }, [category, news?.feed.items]);

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
        navigationLayout={layout}
        rightMeta={[
          { label: "source", value: "AI HOT" },
          { label: "stories", value: String(news.feed.items.length) },
          { label: "同步于", value: formatDateTime(news.lastUpdatedAt) }
        ]}
      />

      <section className="news-board news-board--aihot news-board--timeline">
        <section className="news-digest news-digest--aihot">
          <div className="news-aihot-hero">
            <div>
              <p className="eyebrow">AI HOT</p>
              <h1>AI 热点</h1>
              <p>全部新闻与日报来自 aihot.virxact.com，按 AI HOT 原始结构展示。</p>
            </div>
            <button
              type="button"
              className="news-refresh-button"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending ? "同步中..." : view === "daily" ? "同步日报" : "同步全部"}
            </button>
          </div>

          <div className="news-view-tabs" role="tablist" aria-label="AI HOT 视图">
            <button
              type="button"
              className={view === "all" ? "is-active" : ""}
              onClick={() => setView("all")}
            >
              全部
            </button>
            <button
              type="button"
              className={view === "daily" ? "is-active" : ""}
              onClick={() => setView("daily")}
            >
              日报
            </button>
          </div>

          {view === "all" ? (
            <>
              <div className="news-digest__toolbar news-digest__toolbar--timeline">
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
                <label className="news-search">
                  <span>搜索</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="关键词"
                  />
                </label>
              </div>
              <FeedTimeline items={filteredItems} />
            </>
          ) : (
            <DailyReport report={news.daily} />
          )}
        </section>

        <aside className="news-inspector news-inspector--aihot news-inspector--daily">
          <div className="news-section-heading">
            <p className="eyebrow">Archive</p>
            <h2>日报归档</h2>
          </div>
          <div className="news-archive-list">
            {news.dailyArchive.length > 0 ? (
              news.dailyArchive.map((item) => (
                <button
                  key={item.date}
                  type="button"
                  className={news.daily?.date === item.date ? "is-active" : ""}
                  onClick={() => {
                    setView("daily");
                    archiveMutation.mutate(item.date);
                  }}
                  disabled={archiveMutation.isPending}
                >
                  <span>{item.date}</span>
                  <strong>{item.leadTitle}</strong>
                  <small>{formatDateTime(item.generatedAt)}</small>
                </button>
              ))
            ) : (
              <div className="edge-empty">刷新日报后会显示归档日期。</div>
            )}
          </div>
          {news.lastError ? <div className="news-error">错误：{news.lastError}</div> : null}
          <Link to="/" className="panel-link">
            返回首页工作台
          </Link>
        </aside>
      </section>
    </main>
  );
}
