import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cancelNotification, fetchDashboard, generateHistory, openDashboardStream, syncHistoryXhsAnalytics } from "../api";
import { getHistoryNotifications } from "../history-view";
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

function copyText(value: string) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(value);
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

export function HistoryPage() {
  const queryClient = useQueryClient();
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { layout } = useHomeLayoutPreferences();

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard
  });
  const historyGenerateMutation = useMutation({
    mutationFn: (topic?: string) =>
      generateHistory({
        reason: "manual",
        topic
      }),
    onSuccess: (nextDashboard) => {
      console.info("[history-page] generate:onSuccess", {
        notifications: nextDashboard.notifications.length
      });
      queryClient.setQueryData(["home-layout"], nextDashboard.homeLayout);
      queryClient.setQueryData(["dashboard"], nextDashboard);

      const nextNotifications = getHistoryNotifications(nextDashboard.notifications);
      setSelectedId(nextNotifications[0]?.id ?? null);
      setTopicInput("");
    },
    onError: (error) => {
      console.error("[history-page] generate:onError", error);
    }
  });
  const historyDeleteMutation = useMutation({
    mutationFn: (notificationId: string) => cancelNotification(notificationId),
    onSuccess: (nextDashboard) => {
      queryClient.setQueryData(["home-layout"], nextDashboard.homeLayout);
      queryClient.setQueryData(["dashboard"], nextDashboard);

      const nextNotifications = getHistoryNotifications(nextDashboard.notifications);
      setSelectedId((currentId) =>
        currentId && nextNotifications.some((item) => item.id === currentId)
          ? currentId
          : nextNotifications[0]?.id ?? null
      );
    }
  });
  const historyXhsSyncMutation = useMutation({
    mutationFn: syncHistoryXhsAnalytics,
    onSuccess: (nextDashboard) => {
      queryClient.setQueryData(["home-layout"], nextDashboard.homeLayout);
      queryClient.setQueryData(["dashboard"], nextDashboard);
    }
  });

  async function handleCopy(key: string, value: string) {
    await copyText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1500);
  }

  useEffect(() => {
    return openDashboardStream((data) => {
      queryClient.setQueryData(["home-layout"], data.homeLayout);
      queryClient.setQueryData(["dashboard"], data);
    });
  }, [queryClient]);

  const dashboard = dashboardQuery.data;
  const historyXhs = dashboard?.historyXhs;
  const historyNotifications = useMemo(
    () => getHistoryNotifications(dashboard?.notifications ?? []),
    [dashboard?.notifications]
  );

  useEffect(() => {
    if (historyNotifications[0] && !historyNotifications.some((item) => item.id === selectedId)) {
      setSelectedId(historyNotifications[0].id);
    }
  }, [historyNotifications, selectedId]);

  const selectedNotification =
    historyNotifications.find((notification) => notification.id === selectedId) ?? historyNotifications[0] ?? null;
  const selectedPayload = selectedNotification?.payload ?? null;
  const selectedCover = selectedPayload?.cover ?? null;
  const selectedCoverText = selectedCover
    ? [selectedCover.title, selectedCover.subtitle, selectedCover.imageText].filter(Boolean).join("\n")
    : "";
  const totalCards = historyNotifications.reduce(
    (count, notification) => count + notification.payload.cardCount,
    0
  );

  if (dashboardQuery.isLoading || !dashboard) {
    return <div className="loading-shell">正在连接历史知识工作台...</div>;
  }

  return (
    <main className="workspace history-workspace">
      <CommandRail
        activeSection="history"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[
          { label: "themes", value: String(historyNotifications.length) },
          { label: "cards", value: String(totalCards) },
          { label: "更新", value: formatDateTime(selectedPayload?.generatedAt) }
        ]}
      />

      <section className="history-board">
        <section className="history-stage">
          <header className="history-stage__hero">
            <div>
              <p className="eyebrow">History Storyboard</p>
              <h1>{selectedPayload?.topic ?? "历史知识主动生成"}</h1>
              <p>
                {selectedPayload?.summary ??
                  "手动触发一次历史知识生成，立即拿到今日主题、图文拆解和小红书正文。"}
              </p>
            </div>
            <div className="history-stage__meta">
              <span>{formatDateTime(selectedPayload?.generatedAt)}</span>
              <strong>{selectedPayload ? `${selectedPayload.cardCount} 张图文结构` : "等待生成"}</strong>
              <form
                className="history-topic-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  console.info("[history-page] generate:submit", {
                    hasTopic: Boolean(topicInput.trim())
                  });
                  historyGenerateMutation.mutate(topicInput.trim() || undefined);
                }}
              >
                <input
                  type="text"
                  value={topicInput}
                  onChange={(event) => setTopicInput(event.target.value)}
                  placeholder="输入主题，例如：商鞅变法"
                  disabled={historyGenerateMutation.isPending}
                />
                <button type="submit" className="history-generate-button" disabled={historyGenerateMutation.isPending}>
                  {historyGenerateMutation.isPending ? "生成中..." : "立即生成"}
                </button>
              </form>
            </div>
          </header>

          <section className="history-xhs-panel">
            <div className="history-stage__heading">
              <p className="eyebrow">Xiaohongshu Analytics</p>
              <h2>小红书数据总览</h2>
              <button
                type="button"
                className="history-copy-button"
                disabled={historyXhsSyncMutation.isPending}
                onClick={() => historyXhsSyncMutation.mutate()}
              >
                {historyXhsSyncMutation.isPending ? "获取中..." : "获取小红书数据"}
              </button>
            </div>
            <div className="history-xhs-panel__metrics">
              <div>
                <span>作品</span>
                <strong>{historyXhs?.overview.postCount ?? 0}</strong>
              </div>
              <div>
                <span>浏览</span>
                <strong>{(historyXhs?.overview.totalViews ?? 0).toLocaleString("zh-CN")}</strong>
              </div>
              <div>
                <span>点赞</span>
                <strong>{(historyXhs?.overview.totalLikes ?? 0).toLocaleString("zh-CN")}</strong>
              </div>
              <div>
                <span>收藏</span>
                <strong>{(historyXhs?.overview.totalCollects ?? 0).toLocaleString("zh-CN")}</strong>
              </div>
              <div>
                <span>评论</span>
                <strong>{(historyXhs?.overview.totalComments ?? 0).toLocaleString("zh-CN")}</strong>
              </div>
              <div>
                <span>分享</span>
                <strong>{(historyXhs?.overview.totalShares ?? 0).toLocaleString("zh-CN")}</strong>
              </div>
            </div>
            <div className="history-xhs-panel__footer">
              <span>最近同步 {formatDateTime(historyXhs?.lastSyncedAt)}</span>
              <a href={historyXhs?.sourceUrl ?? "https://creator.xiaohongshu.com/statistics/data-analysis"} target="_blank" rel="noreferrer">
                打开数据分析页
              </a>
            </div>
            {historyXhs?.posts?.length ? (
              <div className="history-xhs-panel__posts">
                {historyXhs.posts.slice(0, 4).map((post) => (
                  <article key={post.id}>
                    <strong>{post.title}</strong>
                    <span>
                      浏览 {post.views.toLocaleString("zh-CN")} / 点赞 {post.likes.toLocaleString("zh-CN")} / 收藏{" "}
                      {post.collects.toLocaleString("zh-CN")}
                    </span>
                  </article>
                ))}
              </div>
            ) : null}
            {historyXhs?.lastError || historyXhsSyncMutation.isError ? (
              <div className="news-error">
                {historyXhs?.lastError ??
                  (historyXhsSyncMutation.error instanceof Error
                    ? historyXhsSyncMutation.error.message
                    : "获取小红书数据失败")}
              </div>
            ) : null}
          </section>

          {selectedNotification && selectedPayload ? (
            <>
              <div className="history-stage__metrics">
                <div>
                  <span>推送标题</span>
                  <strong>{selectedNotification.title}</strong>
                </div>
                <div>
                  <span>正文状态</span>
                  <strong>已生成</strong>
                </div>
                <div>
                  <span>历史存档</span>
                  <strong>{historyNotifications.length} 条</strong>
                </div>
              </div>

              {selectedCover ? (
                <section className="history-stage__section history-stage__section--cover">
                  <div className="history-stage__heading">
                    <div>
                      <p className="eyebrow">Cover Plan</p>
                      <h2>封面方案</h2>
                    </div>
                    <div className="history-cover-card__actions">
                      <button
                        type="button"
                        className="history-copy-button"
                        aria-label="复制封面文案"
                        onClick={() => void handleCopy("cover-text", selectedCoverText)}
                      >
                        {copiedKey === "cover-text" ? "已复制" : "复制文案"}
                      </button>
                      <button
                        type="button"
                        className="history-copy-button"
                        aria-label="复制封面生图提示词"
                        onClick={() => void handleCopy("cover-prompt", selectedCover.prompt)}
                      >
                        {copiedKey === "cover-prompt" ? "已复制" : "复制提示词"}
                      </button>
                    </div>
                  </div>
                  <article className="history-cover-card">
                    <div className="history-cover-card__preview">
                      <span>首图封面</span>
                      <strong>{selectedCover.title}</strong>
                      <p>{selectedCover.subtitle}</p>
                    </div>
                    <div className="history-cover-card__body">
                      <div>
                        <span>封面文字</span>
                        <p>{selectedCover.imageText}</p>
                      </div>
                      <div>
                        <span>生图提示词</span>
                        <small>{selectedCover.prompt}</small>
                      </div>
                    </div>
                  </article>
                </section>
              ) : null}

              <section className="history-stage__section">
                <div className="history-stage__heading">
                  <p className="eyebrow">Card Plan</p>
                  <h2>图文拆解</h2>
                </div>
                <div className="history-stage__cards">
                  {selectedPayload.cards.map((card, index) => (
                    <article key={`${selectedNotification.id}-${card.title}`} className="history-stage-card">
                      <div className="history-stage-card__head">
                        <span>图 {index + 1}</span>
                        <button
                          type="button"
                          className="history-copy-button"
                          aria-label={`复制第${index + 1}张生图提示词`}
                          onClick={() => void handleCopy(`prompt-${index}`, card.prompt)}
                        >
                          {copiedKey === `prompt-${index}` ? "已复制" : "复制"}
                        </button>
                      </div>
                      <strong>{card.title}</strong>
                      <p>{card.imageText}</p>
                      <small>{card.prompt}</small>
                    </article>
                  ))}
                </div>
              </section>

              <section className="history-stage__section history-stage__section--caption">
                <div className="history-stage__heading">
                  <p className="eyebrow">Caption</p>
                  <h2>小红书正文</h2>
                  <button
                    type="button"
                    className="history-copy-button"
                    aria-label="复制正文"
                    onClick={() => void handleCopy("caption", selectedPayload.xiaohongshuCaption)}
                  >
                    {copiedKey === "caption" ? "已复制" : "复制"}
                  </button>
                </div>
                <article className="history-caption-card">
                  <p>{selectedPayload.xiaohongshuCaption}</p>
                </article>
              </section>
            </>
          ) : (
            <div className="edge-empty">还没有历史知识推送，等下一次定时生成后这里会出现内容。</div>
          )}
          {historyGenerateMutation.isError ? (
            <div className="news-error">
              错误：
              {historyGenerateMutation.error instanceof Error
                ? historyGenerateMutation.error.message
                : "历史知识生成失败，请稍后重试。"}
            </div>
          ) : null}
        </section>

        <aside className="history-archive">
          <div className="history-stage__heading">
            <p className="eyebrow">Archive</p>
            <h2>历史记录</h2>
          </div>
          <div className="history-archive__list">
            {historyNotifications.length > 0 ? (
              historyNotifications.map((notification) => {
                const active = notification.id === selectedNotification?.id;

                return (
                  <article
                    key={notification.id}
                    className={`history-archive__item${active ? " is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="history-archive__select"
                      onClick={() => setSelectedId(notification.id)}
                    >
                      <span>{formatDateTime(notification.payload.generatedAt)}</span>
                      <strong>{notification.payload.topic}</strong>
                      <p>{notification.payload.summary}</p>
                    </button>
                    <button
                      type="button"
                      className="history-archive__delete"
                      aria-label={`删除 ${notification.payload.topic}`}
                      disabled={historyDeleteMutation.isPending}
                      onClick={() => historyDeleteMutation.mutate(notification.id)}
                    >
                      删除
                    </button>
                  </article>
                );
              })
            ) : (
              <div className="edge-empty">暂无历史知识存档。</div>
            )}
          </div>
          <Link to="/" className="history-archive__back">
            返回首页工作台
          </Link>
        </aside>
      </section>
    </main>
  );
}
