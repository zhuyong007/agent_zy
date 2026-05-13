import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchDashboard, generateHistory, openDashboardStream } from "../api";
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

export function HistoryPage() {
  const queryClient = useQueryClient();
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { layout } = useHomeLayoutPreferences();

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard
  });
  const historyGenerateMutation = useMutation({
    mutationFn: () => generateHistory("manual"),
    onSuccess: (nextDashboard) => {
      console.info("[history-page] generate:onSuccess", {
        notifications: nextDashboard.notifications.length
      });
      queryClient.setQueryData(["home-layout"], nextDashboard.homeLayout);
      queryClient.setQueryData(["dashboard"], nextDashboard);

      const nextNotifications = getHistoryNotifications(nextDashboard.notifications);
      setSelectedId(nextNotifications[0]?.id ?? null);
    },
    onError: (error) => {
      console.error("[history-page] generate:onError", error);
    }
  });

  useEffect(() => {
    return openDashboardStream((data) => {
      queryClient.setQueryData(["home-layout"], data.homeLayout);
      queryClient.setQueryData(["dashboard"], data);
    });
  }, [queryClient]);

  const dashboard = dashboardQuery.data;
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
              <button
                type="button"
                className="history-generate-button"
                onClick={() => {
                  console.info("[history-page] generate:click");
                  historyGenerateMutation.mutate();
                }}
                disabled={historyGenerateMutation.isPending}
              >
                {historyGenerateMutation.isPending ? "生成中..." : "立即生成"}
              </button>
            </div>
          </header>

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

              <section className="history-stage__section">
                <div className="history-stage__heading">
                  <p className="eyebrow">Card Plan</p>
                  <h2>图文拆解</h2>
                </div>
                <div className="history-stage__cards">
                  {selectedPayload.cards.map((card, index) => (
                    <article key={`${selectedNotification.id}-${card.title}`} className="history-stage-card">
                      <span>图 {index + 1}</span>
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
                  <button
                    key={notification.id}
                    type="button"
                    className={`history-archive__item${active ? " is-active" : ""}`}
                    onClick={() => setSelectedId(notification.id)}
                  >
                    <span>{formatDateTime(notification.payload.generatedAt)}</span>
                    <strong>{notification.payload.topic}</strong>
                    <p>{notification.payload.summary}</p>
                  </button>
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
