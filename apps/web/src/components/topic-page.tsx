import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { TopicDimensionBucket, TopicIdea } from "@agent-zy/shared-types";

import { fetchTopics, generateTopics, openDashboardStream } from "../api";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";

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

function getScoreLabel(topic: TopicIdea) {
  if (topic.scoreLabel === "high") {
    return "高潜力";
  }

  if (topic.scoreLabel === "medium") {
    return "可推进";
  }

  return "观察";
}

function TopicIdeaCard({
  topic,
  selected,
  onSelect
}: {
  topic: TopicIdea;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`topic-stage-card${selected ? " is-selected" : ""}`}
      onClick={onSelect}
    >
      <div className="topic-stage-card__meta">
        <span>{getScoreLabel(topic)}</span>
        <time>{formatDateTime(topic.createdAt)}</time>
      </div>
      <h3>{topic.title}</h3>
      <p>{topic.hook}</p>
      <div className="topic-stage-card__footer">
        <strong>{topic.score}</strong>
        <small>{topic.sourceTitles[0] ?? "常青选题"}</small>
      </div>
    </button>
  );
}

function findTopicFromBuckets(
  buckets: TopicDimensionBucket[],
  topicId: string | null
) {
  for (const bucket of buckets) {
    const topic = bucket.items.find((item) => item.id === topicId);

    if (topic) {
      return {
        bucket,
        topic
      };
    }
  }

  return null;
}

export function TopicPage() {
  const queryClient = useQueryClient();
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [view, setView] = useState<"current" | "history">("current");
  const { layout } = useHomeLayoutPreferences();

  const topicsQuery = useQuery({
    queryKey: ["topics"],
    queryFn: fetchTopics
  });

  useEffect(() => {
    return openDashboardStream((data) => {
      queryClient.setQueryData(["home-layout"], data.homeLayout);
      queryClient.setQueryData(["topics"], data.topics);
    });
  }, [queryClient]);

  const generateMutation = useMutation({
    mutationFn: () => generateTopics("manual"),
    onSuccess: async (topics) => {
      const nextTopics = await queryClient.fetchQuery({
        queryKey: ["topics"],
        queryFn: fetchTopics
      });
      const nextBuckets = nextTopics.currentByDimension ?? topics.currentByDimension ?? [];
      const nextCurrent = nextTopics.current ?? topics.current ?? [];
      queryClient.setQueryData(["topics"], nextTopics);
      await queryClient.invalidateQueries({
        queryKey: ["dashboard"]
      });
      setSelectedTopicId(nextBuckets[0]?.items[0]?.id ?? nextCurrent[0]?.id ?? null);
    }
  });

  const topics = topicsQuery.data;
  const currentBuckets = topics?.currentByDimension ?? [];
  const currentItems = topics?.current ?? [];
  const historyItems = topics?.history ?? [];
  const dimensions = topics?.dimensions ?? [];
  const selectedCurrent = useMemo(
    () => findTopicFromBuckets(currentBuckets, selectedTopicId),
    [currentBuckets, selectedTopicId]
  );
  const selectedHistory = historyItems.find((topic) => topic.id === selectedTopicId) ?? historyItems[0] ?? null;

  useEffect(() => {
    if (!topics) {
      return;
    }

    if (!selectedTopicId) {
      setSelectedTopicId(currentBuckets[0]?.items[0]?.id ?? currentItems[0]?.id ?? historyItems[0]?.id ?? null);
    }
  }, [currentBuckets, currentItems, historyItems, topics, selectedTopicId]);

  if (topicsQuery.isLoading || !topics) {
    return <div className="loading-shell">正在连接选题编辑台...</div>;
  }

  const heroTopic = currentBuckets[0]?.items[0] ?? null;
  const detailTopic = view === "current" ? selectedCurrent?.topic ?? heroTopic : selectedHistory;
  const detailBucket = view === "current" ? selectedCurrent?.bucket ?? currentBuckets[0] : null;

  return (
    <main className="workspace topic-workspace">
      <CommandRail
        activeSection="topics"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[
          { label: "dimensions", value: String(dimensions.length) },
          { label: "current", value: String(currentItems.length) },
          { label: "history", value: String(historyItems.length) }
        ]}
      />

      <section className="topic-stage">
        <header className="topic-stage__hero">
          <div className="topic-stage__hero-copy">
            <p className="eyebrow">Manual Topic Studio</p>
            <h1>选题</h1>
            <p>
              只保留主动生成。一次生成，按技术、有趣、故事三个方向各给 1 条，方便你快速在机制、钩子和叙事之间做选择。
            </p>
          </div>
          <div className="topic-stage__hero-actions">
            <button
              type="button"
              className="topic-generate"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? "生成中..." : "主动生成"}
            </button>
            <Link to="/news" className="topic-source-link">
              查看热点情报
            </Link>
          </div>
          <div className="topic-stage__hero-stats">
            <div>
              <span>维度</span>
              <strong>{dimensions.length}</strong>
            </div>
            <div>
              <span>本批方向</span>
              <strong>{currentItems.length}</strong>
            </div>
            <div>
              <span>最近生成</span>
              <strong>{formatDateTime(topics.lastGeneratedAt)}</strong>
            </div>
          </div>
        </header>

        <section className="topic-stage__switch">
          <div className="news-category-tabs topic-tabs" role="tablist" aria-label="选题视图">
            <button
              type="button"
              className={view === "current" ? "is-active" : ""}
              onClick={() => setView("current")}
            >
              当前批次
            </button>
            <button
              type="button"
              className={view === "history" ? "is-active" : ""}
              onClick={() => setView("history")}
            >
              历史选题
            </button>
          </div>
        </section>

        {view === "current" ? (
          <section className="topic-stage__grid">
            <div className="topic-dimension-wall">
              {currentBuckets.map((bucket) => (
                <article key={bucket.dimensionId} className="topic-dimension-column">
                  <div className="topic-dimension-column__head">
                    <span>{bucket.label}</span>
                    <p>{bucket.description}</p>
                  </div>
                  <div className="topic-dimension-column__list">
                    {bucket.items.map((topic) => (
                      <TopicIdeaCard
                        key={topic.id}
                        topic={topic}
                        selected={detailTopic?.id === topic.id}
                        onSelect={() => setSelectedTopicId(topic.id)}
                      />
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <aside className="topic-inspector topic-inspector--stage">
              {detailTopic ? (
                <>
                  <div className="topic-inspector__header">
                    <span className={`topic-score topic-score--${detailTopic.scoreLabel}`}>
                      {detailTopic.score}
                    </span>
                    <div>
                      <p className="eyebrow">{detailBucket?.label ?? getScoreLabel(detailTopic)}</p>
                      <h2>{detailTopic.title}</h2>
                    </div>
                  </div>
                  <dl className="topic-detail-list">
                    <div>
                      <dt>切入钩子</dt>
                      <dd>{detailTopic.hook}</dd>
                    </div>
                    <div>
                      <dt>内容方向</dt>
                      <dd>{detailTopic.contentDirection}</dd>
                    </div>
                    <div>
                      <dt>叙述角度</dt>
                      <dd>{detailTopic.angle}</dd>
                    </div>
                    <div>
                      <dt>目标受众</dt>
                      <dd>{detailTopic.audience}</dd>
                    </div>
                    <div>
                      <dt>为什么现在做</dt>
                      <dd>{detailTopic.whyNow}</dd>
                    </div>
                    <div>
                      <dt>摘要</dt>
                      <dd>{detailTopic.summary}</dd>
                    </div>
                  </dl>
                  <div className="topic-source-block">
                    <span>来源热点</span>
                    {detailTopic.sourceTitles.length > 0 ? (
                      detailTopic.sourceTitles.map((title) => <p key={title}>{title}</p>)
                    ) : (
                      <p>常青题库存档补位</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="edge-empty">点击一条选题查看详情。</div>
              )}
            </aside>
          </section>
        ) : (
          <section className="topic-history-board">
            <div className="topic-history-board__list">
              {historyItems.length > 0 ? (
                historyItems.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    className={`topic-history-row${detailTopic?.id === topic.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedTopicId(topic.id)}
                  >
                    <div>
                      <span>{topic.dimensionId}</span>
                      <strong>{topic.title}</strong>
                    </div>
                    <small>{formatDateTime(topic.createdAt)}</small>
                  </button>
                ))
              ) : (
                <div className="edge-empty">暂无历史选题。</div>
              )}
            </div>

            <aside className="topic-inspector topic-inspector--stage">
              {detailTopic ? (
                <>
                  <div className="topic-inspector__header">
                    <span className={`topic-score topic-score--${detailTopic.scoreLabel}`}>
                      {detailTopic.score}
                    </span>
                    <div>
                      <p className="eyebrow">{detailTopic.dimensionId}</p>
                      <h2>{detailTopic.title}</h2>
                    </div>
                  </div>
                  <dl className="topic-detail-list">
                    <div>
                      <dt>切入钩子</dt>
                      <dd>{detailTopic.hook}</dd>
                    </div>
                    <div>
                      <dt>内容方向</dt>
                      <dd>{detailTopic.contentDirection}</dd>
                    </div>
                    <div>
                      <dt>目标受众</dt>
                      <dd>{detailTopic.audience}</dd>
                    </div>
                    <div>
                      <dt>为什么现在做</dt>
                      <dd>{detailTopic.whyNow}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div className="edge-empty">选择一条历史选题查看详情。</div>
              )}
            </aside>
          </section>
        )}

        {generateMutation.isError ? (
          <div className="news-error">
            错误：
            {generateMutation.error instanceof Error
              ? generateMutation.error.message
              : "选题生成失败，请稍后重试。"}
          </div>
        ) : null}
      </section>
    </main>
  );
}
