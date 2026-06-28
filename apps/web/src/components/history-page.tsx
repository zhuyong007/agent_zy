import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HistoryDynastyPayload, HistoryPostPayload } from "@agent-zy/shared-types";

import { cancelNotification, fetchDashboard, generateHistory, importHistoryXhsAnalytics, openDashboardStream, reportClientEvent } from "../api";
import {
  getHistoryNotifications,
  getHistoryPayloadSummary,
  getHistoryPayloadTitle,
  getHistoryPayloadUpdatedAt,
  isHistoryDynastyPayload,
  isHistoryPostPayload
} from "../history-view";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";
import { DataSyncControl } from "./data-sync-control";

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
  const [generationMode, setGenerationMode] = useState<"topic" | "dynasty">("topic");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedPromptKeys, setCopiedPromptKeys] = useState<Set<string>>(() => new Set());
  const xhsFileInputRef = useRef<HTMLInputElement | null>(null);
  const { layout } = useHomeLayoutPreferences();

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard
  });
  const historyGenerateMutation = useMutation({
    mutationFn: (input: { mode: "topic" | "dynasty"; value?: string }) => {
      const value = input.value?.trim() || undefined;

      return generateHistory(
        input.mode === "dynasty"
          ? {
              reason: "manual",
              mode: "dynasty",
              dynasty: value
            }
          : {
              reason: "manual",
              topic: value
            }
      );
    },
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
  const historyXhsImportMutation = useMutation({
    mutationFn: (file: File) => {
      void reportClientEvent({
        action: "history.xhs.import.clicked",
        message: "导入小红书数据",
        agentId: "history-agent"
      }).catch(() => undefined);
      return importHistoryXhsAnalytics(file);
    },
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

  async function handlePromptCopy(key: string, value: string) {
    await copyText(value);
    setCopiedPromptKeys((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  function getPromptCopyButtonClass(key: string) {
    return copiedPromptKeys.has(key)
      ? "history-copy-button history-copy-button--copied"
      : "history-copy-button";
  }

  useEffect(() => {
    return openDashboardStream((data) => {
      queryClient.setQueryData(["home-layout"], data.homeLayout);
      queryClient.setQueryData(["dashboard"], data);
    });
  }, [queryClient]);

  const dashboard = dashboardQuery.data;
  const historyXhs = dashboard?.historyXhs;
  const historyXhsSourceIsUrl = /^https?:\/\//.test(historyXhs?.sourceUrl ?? "");
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

  useEffect(() => {
    setCopiedPromptKeys(new Set());
  }, [selectedNotification?.id]);
  const selectedPayload = selectedNotification?.payload ?? null;
  const selectedPostPayload: HistoryPostPayload | null =
    selectedPayload && isHistoryPostPayload(selectedPayload) ? selectedPayload : null;
  const selectedDynastyPayload: HistoryDynastyPayload | null =
    selectedPayload && isHistoryDynastyPayload(selectedPayload) ? selectedPayload : null;
  const selectedCover = selectedPostPayload?.cover ?? null;
  const selectedCoverText = selectedCover
    ? [selectedCover.title, selectedCover.subtitle, selectedCover.imageText].filter(Boolean).join("\n")
    : "";
  const selectedTitle = selectedPayload ? getHistoryPayloadTitle(selectedPayload) : null;
  const selectedSummary = selectedPayload ? getHistoryPayloadSummary(selectedPayload) : null;
  const selectedUpdatedAt = selectedNotification ? getHistoryPayloadUpdatedAt(selectedNotification) : null;
  const totalCards = historyNotifications.reduce(
    (count, notification) =>
      count +
      (isHistoryPostPayload(notification.payload)
        ? notification.payload.cardCount
        : notification.payload.modules.reduce((moduleCount, module) => moduleCount + module.cardCount, 0)),
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
          { label: "更新", value: formatDateTime(selectedUpdatedAt) }
        ]}
      />

      <section className="history-board">
        <section className="history-stage">
          <header className="history-stage__hero">
            <div>
              <p className="eyebrow">History Storyboard</p>
              <h1>{selectedTitle ?? "历史知识主动生成"}</h1>
              <p>
                {selectedSummary ??
                  "手动触发一次历史知识生成，立即拿到今日主题、图文拆解和小红书正文。"}
              </p>
            </div>
            <div className="history-stage__meta">
              <DataSyncControl
                module="history"
                onSynced={() => queryClient.invalidateQueries({ queryKey: ["dashboard"] })}
              />
              <span>{formatDateTime(selectedUpdatedAt)}</span>
              <strong>
                {selectedPostPayload
                  ? `${selectedPostPayload.cardCount} 张图文结构`
                  : selectedDynastyPayload
                    ? `${selectedDynastyPayload.modules.length} 套内容`
                    : "等待生成"}
              </strong>
              <form
                className="history-topic-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  console.info("[history-page] generate:submit", {
                    hasTopic: Boolean(topicInput.trim())
                  });
                  void reportClientEvent({
                    action: "history.generate.clicked",
                    message: "历史知识页面立即生成",
                    agentId: "history-agent",
                    details: {
                      hasTopic: generationMode === "topic" && Boolean(topicInput.trim()),
                      hasDynasty: generationMode === "dynasty" && Boolean(topicInput.trim())
                    }
                  }).catch(() => undefined);
                  historyGenerateMutation.mutate({
                    mode: generationMode,
                    value: topicInput.trim() || undefined
                  });
                }}
              >
                <div className="history-mode-switch" role="tablist" aria-label="历史内容生成模式">
                  <button
                    type="button"
                    className={generationMode === "topic" ? "is-active" : ""}
                    aria-selected={generationMode === "topic"}
                    onClick={() => setGenerationMode("topic")}
                  >
                    主题
                  </button>
                  <button
                    type="button"
                    className={generationMode === "dynasty" ? "is-active" : ""}
                    aria-selected={generationMode === "dynasty"}
                    onClick={() => setGenerationMode("dynasty")}
                  >
                    朝代
                  </button>
                </div>
                <input
                  type="text"
                  value={topicInput}
                  onChange={(event) => setTopicInput(event.target.value)}
                  placeholder={generationMode === "dynasty" ? "输入朝代，例如：东汉" : "输入主题，例如：商鞅变法"}
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
                disabled={historyXhsImportMutation.isPending}
                onClick={() => xhsFileInputRef.current?.click()}
              >
                {historyXhsImportMutation.isPending ? "导入中..." : "导入 Excel"}
              </button>
              <input
                ref={xhsFileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) {
                    historyXhsImportMutation.mutate(file);
                  }
                }}
              />
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
              {historyXhsSourceIsUrl ? (
                <a href={historyXhs?.sourceUrl} target="_blank" rel="noreferrer">
                  打开数据来源
                </a>
              ) : (
                <span>{historyXhs?.sourceUrl ?? "等待导入 Excel"}</span>
              )}
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
            {historyXhs?.lastError || historyXhsImportMutation.isError ? (
              <div className="news-error">
                {historyXhs?.lastError ??
                  (historyXhsImportMutation.error instanceof Error
                    ? historyXhsImportMutation.error.message
                    : "导入小红书数据失败")}
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

              {selectedDynastyPayload ? (
                <section className="history-stage__section history-stage__section--dynasty">
                  <div className="history-stage__heading">
                    <div>
                      <p className="eyebrow">Dynasty Set</p>
                      <h2>朝代四件套</h2>
                    </div>
                    <button
                      type="button"
                      className="history-copy-button"
                      aria-label="复制朝代四件套 JSON"
                      onClick={() =>
                        void handleCopy("dynasty-json", JSON.stringify(selectedDynastyPayload, null, 2))
                      }
                    >
                      {copiedKey === "dynasty-json" ? "已复制" : "复制 JSON"}
                    </button>
                  </div>
                  <div className="history-stage__cards history-stage__cards--dynasty">
                    {selectedDynastyPayload.modules.map((module, index) => (
                      <article key={`${selectedNotification.id}-${module.type}`} className="history-stage-card history-stage-card--dynasty-post">
                        <div className="history-stage-card__head">
                          <span>{String(index + 1).padStart(2, "0")} · {module.type}</span>
                          <button
                            type="button"
                            className="history-copy-button"
                            aria-label={`复制${module.type}小红书正文`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleCopy(`dynasty-caption-${index}`, module.xiaohongshuCaption);
                            }}
                          >
                            {copiedKey === `dynasty-caption-${index}` ? "已复制" : "正文"}
                          </button>
                        </div>
                        <strong>{module.topic}</strong>
                        <p>{module.summary}</p>
                        {module.cover ? (
                          <div className="history-dynasty-cover">
                            <div className="history-dynasty-cover__head">
                              <span>封面方案</span>
                              <button
                                type="button"
                                className={getPromptCopyButtonClass(`dynasty-cover-prompt-${index}`)}
                                aria-label={`复制${module.type}封面生图提示词`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handlePromptCopy(`dynasty-cover-prompt-${index}`, module.cover?.prompt ?? "");
                                }}
                              >
                                {copiedPromptKeys.has(`dynasty-cover-prompt-${index}`) ? "已复制" : "复制提示词"}
                              </button>
                            </div>
                            <strong>{module.cover.title}</strong>
                            <p>{module.cover.subtitle}</p>
                            <small>{module.cover.prompt}</small>
                          </div>
                        ) : null}
                        <div className="history-dynasty-cards">
                          {module.cards.map((card, cardIndex) => (
                            <div key={`${module.type}-${card.title}`} className="history-dynasty-card-plan">
                              <div>
                                <span>图 {cardIndex + 1}</span>
                                <strong>{card.title}</strong>
                              </div>
                              <p>{card.imageText}</p>
                              <small>{card.prompt}</small>
                              <button
                                type="button"
                                className={getPromptCopyButtonClass(`dynasty-card-prompt-${index}-${cardIndex}`)}
                                aria-label={`复制${module.type}第${cardIndex + 1}张生图提示词`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handlePromptCopy(`dynasty-card-prompt-${index}-${cardIndex}`, card.prompt);
                                }}
                              >
                                {copiedPromptKeys.has(`dynasty-card-prompt-${index}-${cardIndex}`) ? "已复制" : "复制提示词"}
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="history-caption-card history-caption-card--compact">
                          <div className="history-caption-card__head">
                            <span>小红书正文</span>
                            <button
                              type="button"
                              className="history-copy-button"
                              aria-label={`复制${module.type}末尾正文`}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleCopy(`dynasty-caption-${index}`, module.xiaohongshuCaption);
                              }}
                            >
                              {copiedKey === `dynasty-caption-${index}` ? "已复制" : "复制正文"}
                            </button>
                          </div>
                          <p>{module.xiaohongshuCaption}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

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
                        className={getPromptCopyButtonClass("cover-prompt")}
                        aria-label="复制封面生图提示词"
                        onClick={() => void handlePromptCopy("cover-prompt", selectedCover.prompt)}
                      >
                        {copiedPromptKeys.has("cover-prompt") ? "已复制" : "复制提示词"}
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

              {selectedPostPayload ? (
                <section className="history-stage__section">
                  <div className="history-stage__heading">
                    <p className="eyebrow">Card Plan</p>
                    <h2>图文拆解</h2>
                  </div>
                  <div className="history-stage__cards">
                    {selectedPostPayload.cards.map((card, index) => (
                      <article key={`${selectedNotification.id}-${card.title}`} className="history-stage-card">
                        <div className="history-stage-card__head">
                          <span>图 {index + 1}</span>
                          <button
                            type="button"
                            className={getPromptCopyButtonClass(`prompt-${index}`)}
                            aria-label={`复制第${index + 1}张生图提示词`}
                            onClick={() => void handlePromptCopy(`prompt-${index}`, card.prompt)}
                          >
                            {copiedPromptKeys.has(`prompt-${index}`) ? "已复制" : "复制"}
                          </button>
                        </div>
                        <strong>{card.title}</strong>
                        <p>{card.imageText}</p>
                        <small>{card.prompt}</small>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {selectedPostPayload ? (
                <section className="history-stage__section history-stage__section--caption">
                  <div className="history-stage__heading">
                    <p className="eyebrow">Caption</p>
                    <h2>小红书正文</h2>
                    <button
                      type="button"
                      className="history-copy-button"
                      aria-label="复制正文"
                      onClick={() => void handleCopy("caption", selectedPostPayload.xiaohongshuCaption)}
                    >
                      {copiedKey === "caption" ? "已复制" : "复制"}
                    </button>
                  </div>
                  <article className="history-caption-card">
                    <p>{selectedPostPayload.xiaohongshuCaption}</p>
                  </article>
                </section>
              ) : null}
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
                const title = getHistoryPayloadTitle(notification.payload);
                const summary = getHistoryPayloadSummary(notification.payload);
                const updatedAt = getHistoryPayloadUpdatedAt(notification);

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
                      <span>{formatDateTime(updatedAt)}</span>
                      <strong>{title}</strong>
                      <p>{summary}</p>
                    </button>
                    <button
                      type="button"
                      className="history-archive__delete"
                      aria-label={`删除 ${title}`}
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
