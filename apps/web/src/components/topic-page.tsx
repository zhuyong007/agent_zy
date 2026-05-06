import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { TopicIdea } from "@agent-zy/shared-types";

import { fetchTopics, generateTopics, openDashboardStream } from "../api";
import { CommandRail, useLiveClock, useThemePreference } from "./dashboard-page";

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

function TopicArticle({
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
      className={`topic-row${selected ? " is-selected" : ""}`}
      onClick={onSelect}
    >
      <span className={`topic-score topic-score--${topic.scoreLabel}`}>
        {topic.score}
      </span>
      <div className="topic-row__body">
        <div className="topic-row__meta">
          <span>{getScoreLabel(topic)}</span>
          <time>{formatDateTime(topic.createdAt)}</time>
        </div>
        <h2>{topic.title}</h2>
        <p>{topic.hook}</p>
      </div>
    </button>
  );
}

export function TopicPage() {
  const queryClient = useQueryClient();
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [view, setView] = useState<"current" | "history">("current");

  const topicsQuery = useQuery({
    queryKey: ["topics"],
    queryFn: fetchTopics
  });

  useEffect(() => {
    return openDashboardStream((data) => {
      queryClient.setQueryData(["topics"], data.topics);
    });
  }, [queryClient]);

  const generateMutation = useMutation({
    mutationFn: () => generateTopics("manual"),
    onSuccess: async (topics) => {
      queryClient.setQueryData(["topics"], topics);
      await queryClient.invalidateQueries({
        queryKey: ["dashboard"]
      });
      setSelectedTopicId(topics.current[0]?.id ?? null);
    }
  });

  const topics = topicsQuery.data;
  const list = useMemo(() => {
    if (!topics) {
      return [];
    }

    return view === "current" ? topics.current : topics.history;
  }, [topics, view]);
  const selectedTopic =
    list.find((topic) => topic.id === selectedTopicId) ??
    topics?.current.find((topic) => topic.id === selectedTopicId) ??
    list[0] ??
    null;

  if (topicsQuery.isLoading || !topics) {
    return <div className="loading-shell">正在连接 AI 自媒体选题工作台...</div>;
  }

  return (
    <main className="workspace topic-workspace">
      <CommandRail
        activeSection="topics"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        rightMeta={[
          { label: "current", value: String(topics.current.length) },
          { label: "history", value: String(topics.history.length) },
          { label: "next", value: formatDateTime(topics.nextRunAt) }
        ]}
      />

      <section className="topic-board">
        <aside className="topic-board__summary">
          <div className="news-section-heading">
            <p className="eyebrow">Topic Push</p>
            <h1>AI 自媒体选题</h1>
          </div>
          <div className="topic-stat-grid">
            <div>
              <span>当前推送</span>
              <strong>{topics.current.length}</strong>
            </div>
            <div>
              <span>历史选题</span>
              <strong>{topics.history.length}</strong>
            </div>
            <div>
              <span>下次运行</span>
              <strong>{formatDateTime(topics.nextRunAt)}</strong>
            </div>
          </div>
          <button
            type="button"
            className="topic-generate"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? "生成中..." : "立即生成"}
          </button>
          <Link to="/news" className="topic-source-link">
            查看热点情报
          </Link>
        </aside>

        <section className="topic-list">
          <div className="news-category-tabs topic-tabs" role="tablist" aria-label="选题视图">
            <button
              type="button"
              className={view === "current" ? "is-active" : ""}
              onClick={() => setView("current")}
            >
              当前推送
            </button>
            <button
              type="button"
              className={view === "history" ? "is-active" : ""}
              onClick={() => setView("history")}
            >
              历史选题
            </button>
          </div>
          <div className="topic-list__scroll">
            {list.length > 0 ? (
              list.map((topic) => (
                <TopicArticle
                  key={topic.id}
                  topic={topic}
                  selected={selectedTopic?.id === topic.id}
                  onSelect={() => setSelectedTopicId(topic.id)}
                />
              ))
            ) : (
              <div className="edge-empty">暂无选题，点击立即生成。</div>
            )}
          </div>
        </section>

        <aside className="topic-inspector">
          {selectedTopic ? (
            <>
              <div className="topic-inspector__header">
                <span className={`topic-score topic-score--${selectedTopic.scoreLabel}`}>
                  {selectedTopic.score}
                </span>
                <div>
                  <p className="eyebrow">{getScoreLabel(selectedTopic)}</p>
                  <h2>{selectedTopic.title}</h2>
                </div>
              </div>
              <dl className="topic-detail-list">
                <div>
                  <dt>钩子</dt>
                  <dd>{selectedTopic.hook}</dd>
                </div>
                <div>
                  <dt>内容方向</dt>
                  <dd>{selectedTopic.contentDirection}</dd>
                </div>
                <div>
                  <dt>目标受众</dt>
                  <dd>{selectedTopic.audience}</dd>
                </div>
                <div>
                  <dt>为什么现在做</dt>
                  <dd>{selectedTopic.whyNow}</dd>
                </div>
                <div>
                  <dt>内容摘要</dt>
                  <dd>{selectedTopic.summary}</dd>
                </div>
              </dl>
              <div className="topic-source-block">
                <span>来源热点</span>
                {selectedTopic.sourceTitles.length > 0 ? (
                  selectedTopic.sourceTitles.map((title) => <p key={title}>{title}</p>)
                ) : (
                  <p>常青选题补位</p>
                )}
              </div>
            </>
          ) : (
            <div className="edge-empty">选择一条选题查看详情。</div>
          )}
        </aside>
      </section>
    </main>
  );
}
