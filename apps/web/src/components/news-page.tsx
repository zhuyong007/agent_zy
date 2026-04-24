import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  NewsCategory,
  NewsItem,
  NewsItemArticlesResponse,
  NewsSource
} from "@agent-zy/shared-types";

import {
  addNewsSource,
  analyzeNewsItem,
  deleteNewsSource,
  fetchNews,
  fetchNewsItemArticles,
  openDashboardStream,
  refreshNews,
  summarizeNews,
  updateNewsSource
} from "../api";
import { CommandRail, useLiveClock, useThemePreference } from "./dashboard-page";

const categories: Array<{
  value: NewsCategory;
  label: string;
}> = [
  { value: "ai", label: "AI" },
  { value: "technology", label: "科技" },
  { value: "economy", label: "经济" },
  { value: "entertainment", label: "娱乐" },
  { value: "world", label: "国际" }
];

const importanceLabels: Record<NewsItem["importance"], string> = {
  high: "高",
  medium: "中",
  low: "低"
};

const summaryProviderLabels: Record<"llm" | "fallback" | "none", string> = {
  llm: "LLM",
  fallback: "本地降级",
  none: "未触发"
};

function createSourceDraft() {
  return {
    name: "",
    url: "",
    category: "ai" as NewsCategory
  };
}

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

function SourceRow(props: {
  source: NewsSource;
  editing: boolean;
  draft: ReturnType<typeof createSourceDraft>;
  busy: boolean;
  deleting: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onDraftChange: (
    field: keyof ReturnType<typeof createSourceDraft>,
    value: string
  ) => void;
  onSaveEdit: () => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
}) {
  const {
    source,
    editing,
    draft,
    busy,
    deleting,
    onStartEdit,
    onCancelEdit,
    onDraftChange,
    onSaveEdit,
    onToggleEnabled,
    onDelete
  } = props;

  return (
    <article className={`news-source-row${editing ? " is-editing" : ""}`}>
      {editing ? (
        <>
          <div className="news-source-row__form">
            <input
              value={draft.name}
              onChange={(event) => onDraftChange("name", event.target.value)}
              placeholder="信源名称"
            />
            <input
              value={draft.url}
              onChange={(event) => onDraftChange("url", event.target.value)}
              placeholder="https://..."
            />
            <select
              value={draft.category}
              onChange={(event) => onDraftChange("category", event.target.value)}
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="news-source-row__actions">
            <button
              type="button"
              className="news-source-action news-source-action--primary"
              onClick={onSaveEdit}
              disabled={busy}
            >
              {busy ? "保存中" : "保存"}
            </button>
            <button type="button" className="news-source-action" onClick={onCancelEdit}>
              取消
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="news-source-row__body">
            <div className="news-source-row__title">
              <strong>{source.name}</strong>
              <span
                className={`news-source-status${
                  source.enabled ? " is-enabled" : " is-disabled"
                }`}
              >
                {source.enabled ? "启用中" : "已停用"}
              </span>
            </div>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.url}
            </a>
            <div className="news-source-row__meta">
              <small>{categoryLabel(source.category)}</small>
              <small>最近抓取 {formatDateTime(source.lastFetchedAt)}</small>
            </div>
          </div>
          <div className="news-source-row__actions">
            <button type="button" className="news-source-action" onClick={onStartEdit}>
              编辑
            </button>
            <button
              type="button"
              className="news-source-action"
              onClick={onToggleEnabled}
              disabled={busy}
            >
              {busy ? "处理中" : source.enabled ? "停用" : "启用"}
            </button>
            <button
              type="button"
              className="news-source-action news-source-action--danger"
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? "删除中" : "删除"}
            </button>
          </div>
        </>
      )}
    </article>
  );
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
          <span>{item.sourceCount} 个信源</span>
          <time>{formatDateTime(item.updatedAt)}</time>
        </div>
        <h2>{item.title}</h2>
        <div className="news-digest-item__summary">
          <span>概括</span>
          <p>{item.summary}</p>
        </div>
      </div>
    </button>
  );
}

export function NewsPage() {
  const queryClient = useQueryClient();
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const [category, setCategory] = useState<NewsCategory | "all">("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [sourceDraft, setSourceDraft] = useState(createSourceDraft);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingSourceDraft, setEditingSourceDraft] = useState(createSourceDraft);
  const [updatingSourceId, setUpdatingSourceId] = useState<string | null>(null);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [expandedArticleItemId, setExpandedArticleItemId] = useState<string | null>(null);
  const [articleLoadingItemId, setArticleLoadingItemId] = useState<string | null>(null);
  const [articleCache, setArticleCache] = useState<
    Record<string, NewsItemArticlesResponse>
  >({});
  const [articleErrors, setArticleErrors] = useState<Record<string, string>>({});

  const newsQuery = useQuery({
    queryKey: ["news"],
    queryFn: fetchNews
  });

  useEffect(() => {
    return openDashboardStream((data) => {
      queryClient.setQueryData(["news"], data.news);
    });
  }, [queryClient]);

  const addSourceMutation = useMutation({
    mutationFn: addNewsSource,
    onSuccess: async (news) => {
      queryClient.setQueryData(["news"], news);
      await queryClient.invalidateQueries({
        queryKey: ["dashboard"]
      });
      setSourceDraft(createSourceDraft());
    }
  });

  const updateSourceMutation = useMutation({
    mutationFn: (input: {
      sourceId: string;
      patch: Partial<{
        name: string;
        url: string;
        category: NewsCategory;
        enabled: boolean;
      }>;
    }) => updateNewsSource(input.sourceId, input.patch),
    onMutate: (input) => {
      setUpdatingSourceId(input.sourceId);
    },
    onSuccess: async (news) => {
      queryClient.setQueryData(["news"], news);
      await queryClient.invalidateQueries({
        queryKey: ["dashboard"]
      });
      setEditingSourceId(null);
    },
    onSettled: () => {
      setUpdatingSourceId(null);
    }
  });

  const deleteSourceMutation = useMutation({
    mutationFn: deleteNewsSource,
    onMutate: (sourceId) => {
      setDeletingSourceId(sourceId);
    },
    onSuccess: async (news) => {
      queryClient.setQueryData(["news"], news);
      await queryClient.invalidateQueries({
        queryKey: ["dashboard"]
      });
      setEditingSourceId(null);
    },
    onSettled: () => {
      setDeletingSourceId(null);
    }
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshNews("manual"),
    onSuccess: async (news) => {
      queryClient.setQueryData(["news"], news);
      await queryClient.invalidateQueries({
        queryKey: ["dashboard"]
      });
    }
  });

  const summarizeMutation = useMutation({
    mutationFn: summarizeNews,
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

  const fetchArticlesMutation = useMutation({
    mutationFn: fetchNewsItemArticles,
    onMutate: (itemId) => {
      setArticleLoadingItemId(itemId);
      setArticleErrors((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    },
    onSuccess: (response) => {
      setArticleCache((current) => ({
        ...current,
        [response.itemId]: response
      }));
    },
    onError: (error, itemId) => {
      setArticleErrors((current) => ({
        ...current,
        [itemId]:
          error instanceof Error ? error.message : "抓取新闻全文失败，请稍后重试。"
      }));
    },
    onSettled: () => {
      setArticleLoadingItemId(null);
    }
  });

  const news = newsQuery.data;
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
  const selectedArticles = selectedItem ? articleCache[selectedItem.id]?.articles ?? [] : [];
  const selectedArticleError =
    selectedItem && articleErrors[selectedItem.id] ? articleErrors[selectedItem.id] : null;
  const articlesExpanded = selectedItem ? expandedArticleItemId === selectedItem.id : false;
  const articlesLoading = selectedItem ? articleLoadingItemId === selectedItem.id : false;

  useEffect(() => {
    if (!selectedItemId && selectedItem) {
      setSelectedItemId(selectedItem.id);
    }
  }, [selectedItem, selectedItemId]);

  useEffect(() => {
    if (!news) {
      return;
    }

    const validItemIds = new Set(news.items.map((item) => item.id));

    setArticleCache((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([itemId]) => validItemIds.has(itemId))
      )
    );
    setArticleErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([itemId]) => validItemIds.has(itemId))
      )
    );

    if (expandedArticleItemId && !validItemIds.has(expandedArticleItemId)) {
      setExpandedArticleItemId(null);
    }
  }, [expandedArticleItemId, news]);

  if (newsQuery.isLoading || !news) {
    return <div className="loading-shell">正在连接热点新闻工作台...</div>;
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
          { label: "sources", value: String(news.sources.length) },
          { label: "stories", value: String(news.items.length) },
          { label: "整理于", value: formatDateTime(news.lastSummarizedAt ?? news.lastUpdatedAt) }
        ]}
      />

      <section className="news-board">
        <aside className="news-sources">
          <div className="news-section-heading">
            <p className="eyebrow">Source Control</p>
            <h1>热点新闻</h1>
          </div>

          <form
            className="news-source-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!sourceDraft.name.trim() || !sourceDraft.url.trim()) {
                return;
              }

              addSourceMutation.mutate({
                name: sourceDraft.name.trim(),
                url: sourceDraft.url.trim(),
                category: sourceDraft.category
              });
            }}
          >
            <input
              value={sourceDraft.name}
              onChange={(event) =>
                setSourceDraft((value) => ({ ...value, name: event.target.value }))
              }
              placeholder="信源名称"
            />
            <input
              value={sourceDraft.url}
              onChange={(event) =>
                setSourceDraft((value) => ({ ...value, url: event.target.value }))
              }
              placeholder="https://..."
            />
            <select
              value={sourceDraft.category}
              onChange={(event) =>
                setSourceDraft((value) => ({
                  ...value,
                  category: event.target.value as NewsCategory
                }))
              }
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button type="submit" disabled={addSourceMutation.isPending}>
              {addSourceMutation.isPending ? "添加中" : "添加信源"}
            </button>
          </form>

          <div className="news-source-list">
            {news.sources.length > 0 ? (
              news.sources.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  editing={editingSourceId === source.id}
                  draft={editingSourceDraft}
                  busy={updatingSourceId === source.id}
                  deleting={deletingSourceId === source.id}
                  onStartEdit={() => {
                    setEditingSourceId(source.id);
                    setEditingSourceDraft({
                      name: source.name,
                      url: source.url,
                      category: source.category
                    });
                  }}
                  onCancelEdit={() => {
                    setEditingSourceId(null);
                    setEditingSourceDraft(createSourceDraft());
                  }}
                  onDraftChange={(field, value) =>
                    setEditingSourceDraft((current) => ({
                      ...current,
                      [field]:
                        field === "category" ? (value as NewsCategory) : value
                    }))
                  }
                  onSaveEdit={() => {
                    if (
                      !editingSourceDraft.name.trim() ||
                      !editingSourceDraft.url.trim()
                    ) {
                      return;
                    }

                    updateSourceMutation.mutate({
                      sourceId: source.id,
                      patch: {
                        name: editingSourceDraft.name.trim(),
                        url: editingSourceDraft.url.trim(),
                        category: editingSourceDraft.category
                      }
                    });
                  }}
                  onToggleEnabled={() =>
                    updateSourceMutation.mutate({
                      sourceId: source.id,
                      patch: {
                        enabled: !source.enabled
                      }
                    })
                  }
                  onDelete={() => {
                    const confirmed =
                      typeof window === "undefined"
                        ? true
                        : window.confirm(`删除信源“${source.name}”并清空关联历史？`);

                    if (confirmed) {
                      deleteSourceMutation.mutate(source.id);
                    }
                  }}
                />
              ))
            ) : (
              <div className="edge-empty">还没有信源，添加后再刷新。</div>
            )}
          </div>

          <div className="news-source-footer">
            <button
              type="button"
              className="news-refresh-button"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending ? "刷新中..." : "立即增量刷新"}
            </button>
            <button
              type="button"
              className="news-refresh-button"
              onClick={() => summarizeMutation.mutate()}
              disabled={summarizeMutation.isPending || news.rawItems.length === 0}
            >
              {summarizeMutation.isPending ? "整理中..." : "重新整理"}
            </button>
          </div>
        </aside>

        <section className="news-digest">
          <div className="news-digest__toolbar">
            <div className="news-category-tabs" role="tablist" aria-label="新闻分类">
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
              <span>30m 自动 + 手动触发</span>
              <span>{news.lastSummaryInputItemIds.length} 条进入本轮归纳</span>
              <span>归纳来源 {summaryProviderLabels[news.lastSummaryProvider]}</span>
              <span>
                {news.lastSummarizedAt
                  ? `最近整理 ${formatDateTime(news.lastSummarizedAt)}`
                  : "最近整理 --"}
              </span>
              {trimErrorLabel(news.lastSummaryError) ? (
                <span title={news.lastSummaryError ?? undefined}>
                  降级原因 {trimErrorLabel(news.lastSummaryError)}
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
              <div className="edge-empty">当前分类还没有归纳后的热点，点击刷新获取最新内容。</div>
            )}
          </div>
        </section>

        <aside className="news-inspector">
          {selectedItem ? (
            <>
              <div className="news-section-heading">
                <p className="eyebrow">Inspector</p>
                <h2>{selectedItem.title}</h2>
              </div>
              <div className="news-inspector__metrics">
                <div>
                  <span>重要程度</span>
                  <strong>{importanceLabels[selectedItem.importance]}</strong>
                </div>
                <div>
                  <span>信源覆盖</span>
                  <strong>{selectedItem.sourceCount}</strong>
                </div>
                <div>
                  <span>更新时间</span>
                  <strong>{formatDateTime(selectedItem.updatedAt)}</strong>
                </div>
              </div>
              <div className="news-inspector__sources">
                {selectedItem.sources.map((source) => (
                  <span key={source}>{source}</span>
                ))}
              </div>
              <p className="news-inspector__summary">{selectedItem.summary}</p>

              <div className="news-inspector__actions">
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
                      : "分析这条新闻"}
                </button>
                <button
                  type="button"
                  className="news-analyze-button"
                  disabled={articlesLoading}
                  onClick={() => {
                    if (articlesExpanded) {
                      setExpandedArticleItemId(null);
                      return;
                    }

                    setExpandedArticleItemId(selectedItem.id);

                    const cached = articleCache[selectedItem.id];
                    const needsFetch =
                      !cached ||
                      cached.articles.length === 0 ||
                      cached.articles.every((article) => article.status === "failed");

                    if (needsFetch) {
                      fetchArticlesMutation.mutate(selectedItem.id);
                    }
                  }}
                >
                  {articlesLoading
                    ? "抓取原文中..."
                    : articlesExpanded
                      ? "收起原文"
                      : "查看全部原文"}
                </button>
              </div>

              {articlesExpanded ? (
                <div className="news-articles">
                  <div className="news-articles__header">
                    <span>原文缓存</span>
                    <strong>{selectedArticles.length} 篇</strong>
                  </div>

                  {selectedArticleError ? (
                    <div className="news-inline-error">{selectedArticleError}</div>
                  ) : null}

                  {selectedArticles.length > 0 ? (
                    selectedArticles.map((article) => (
                      <article className="news-article-card" key={article.rawItemId}>
                        <div className="news-article-card__head">
                          <div>
                            <strong>{article.sourceName}</strong>
                            <small>{article.status === "ready" ? "已缓存全文" : "抓取失败"}</small>
                          </div>
                          <a href={article.url} target="_blank" rel="noreferrer">
                            打开链接
                          </a>
                        </div>
                        {article.status === "ready" ? (
                          <>
                            <p className="news-article-card__excerpt">{article.excerpt}</p>
                            <pre className="news-article-card__content">
                              {article.content}
                            </pre>
                          </>
                        ) : (
                          <p className="news-article-card__error">
                            {article.error ?? "正文抓取失败"}
                          </p>
                        )}
                      </article>
                    ))
                  ) : articlesLoading ? (
                    <div className="edge-empty">正在抓取该热点的全文内容...</div>
                  ) : (
                    <div className="edge-empty">点击按钮后抓取并缓存相关新闻全文。</div>
                  )}
                </div>
              ) : null}

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
            <div className="edge-empty">选择一条热点查看信源覆盖、全文和按需分析。</div>
          )}
          <Link to="/" className="panel-link">
            返回首页工作台
          </Link>
        </aside>
      </section>
    </main>
  );
}
