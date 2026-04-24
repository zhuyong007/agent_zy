import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  DashboardData,
  NewsCategory,
  NewsItem,
  ScheduleItem
} from "@agent-zy/shared-types";

import { fetchDashboard, openDashboardStream, sendChat } from "../api";
import {
  addSession,
  applyChatSuccess,
  applyOptimisticPrompt,
  createInitialChatWorkspace,
  removeSession,
  type ChatProgressStep
} from "../chat-workspace";
import {
  applyTheme,
  getInitialThemeKey,
  isThemeKey,
  persistTheme,
  type ThemeKey,
  themeOptions
} from "../theme";
import { homeImageAssets } from "../image-assets";

export type RailSection = "home" | "news" | "ledger" | "todo";
type NewsFilter = "all" | NewsCategory;
type SummaryStat = {
  label: string;
  value: string;
  note: string;
};

const railItems: Array<{
  key: RailSection;
  label: string;
  stamp: string;
  to: string;
}> = [
  { key: "home", label: "工作台", stamp: "00", to: "/" },
  { key: "news", label: "热点情报", stamp: "01", to: "/news" },
  { key: "ledger", label: "记账", stamp: "02", to: "/ledger" },
  { key: "todo", label: "待办", stamp: "03", to: "/todo" }
];

const weekdayMap = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const colorThemes = themeOptions.filter((theme) => theme.kind === "color");
const imageThemes = themeOptions.filter((theme) => theme.kind === "image");

export function useThemePreference() {
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => getInitialThemeKey());

  useEffect(() => {
    applyTheme(themeKey);
    persistTheme(themeKey);
  }, [themeKey]);

  return [themeKey, setThemeKey] as const;
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

function formatLunarDate(date: Date) {
  try {
    const formatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "long",
      day: "numeric"
    });

    return formatter.format(date);
  } catch {
    return "--";
  }
}

function formatClockLine(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} · ${weekdayMap[date.getDay()]} · 农历${formatLunarDate(date)}`;
}

export function useLiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return formatClockLine(now);
}

function getMessageLabel(role: DashboardData["messages"][number]["role"]) {
  if (role === "user") {
    return "USER";
  }

  if (role === "system") {
    return "SYSTEM";
  }

  return "AGENT";
}

function getUrgencyLabel(urgency: ScheduleItem["urgency"]) {
  if (urgency === "high") {
    return "高";
  }

  if (urgency === "medium") {
    return "中";
  }

  return "低";
}

function formatAmount(amount: number) {
  return amount.toLocaleString("zh-CN");
}

function formatShortCount(count: number) {
  return count.toLocaleString("zh-CN", {
    minimumIntegerDigits: count < 10 ? 2 : 1,
    useGrouping: false
  });
}

function HomeRouteMenu({ activeSection }: { activeSection: RailSection }) {
  return (
    <nav className="route-stack" aria-label="工作台导航">
      {railItems.map((item) => (
        <Link
          key={item.key}
          className={`route-stack__item${activeSection === item.key ? " is-active" : ""}`}
          to={item.to}
        >
          <span className="route-stack__stamp">{item.stamp}</span>
          <strong>{item.label}</strong>
          <img src={homeImageAssets.iconMore} alt="" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}

function SceneMarker({
  title,
  icon,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  tertiaryLabel,
  tertiaryValue,
  emphasized = false,
  className
}: {
  title: string;
  icon: string;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  tertiaryLabel: string;
  tertiaryValue: string;
  emphasized?: boolean;
  className: string;
}) {
  return (
    <article className={`scene-marker ${className}${emphasized ? " is-emphasized" : ""}`}>
      <div
        className="scene-marker__skin"
        style={{
          backgroundImage: `url(${emphasized ? homeImageAssets.floatingCardTip : homeImageAssets.floatingCard})`
        }}
        aria-hidden="true"
      />
      <div className="scene-marker__body">
        <div className="scene-marker__head">
          <span className="scene-marker__icon-wrap">
            <img src={icon} alt="" aria-hidden="true" className="scene-marker__icon" />
          </span>
          <div>
            <p>{title}</p>
            <strong>{primaryValue}</strong>
          </div>
        </div>
        <dl className="scene-marker__metrics">
          <div>
            <dt>{primaryLabel}</dt>
            <dd>{primaryValue}</dd>
          </div>
          <div>
            <dt>{secondaryLabel}</dt>
            <dd>{secondaryValue}</dd>
          </div>
          <div>
            <dt>{tertiaryLabel}</dt>
            <dd>{tertiaryValue}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

export function CommandRail({
  activeSection,
  expanded,
  onToggle,
  themeKey,
  onThemeChange,
  rightMeta,
  clockLine,
  showNavigation = true
}: {
  activeSection: RailSection;
  expanded: boolean;
  onToggle: () => void;
  themeKey: ThemeKey;
  onThemeChange: (next: ThemeKey) => void;
  rightMeta: Array<{ label: string; value: string }>;
  clockLine: string;
  showNavigation?: boolean;
}) {
  return (
    <header className={`command-rail${showNavigation ? "" : " command-rail--compact"}`}>
      <div className="command-rail__left">
        <div className="command-rail__mark">
          <span className="command-rail__prompt">$</span>
          <span className="command-rail__label">agent.ops</span>
        </div>
        {showNavigation ? (
          <>
            <nav className={`command-rail__nav${expanded ? " is-expanded" : ""}`} aria-label="主导航">
              {railItems.map((item) => (
                <Link
                  key={item.key}
                  className={`command-link${activeSection === item.key ? " is-active" : ""}${
                    item.key !== "home" && !expanded ? " is-hidden" : ""
                  }`}
                  to={item.to}
                >
                  <span>{item.stamp}</span>
                  <strong>{item.label}</strong>
                </Link>
              ))}
            </nav>
            <button
              type="button"
              className="command-rail__toggle"
              onClick={onToggle}
              aria-expanded={expanded}
            >
              {expanded ? "收起路由" : "展开路由"}
            </button>
          </>
        ) : null}
      </div>
      <div className="command-rail__meta">
        <label className="theme-switcher">
          <span>theme</span>
          <select
            value={themeKey}
            aria-label="切换主题"
            onChange={(event) => {
              if (isThemeKey(event.target.value)) {
                onThemeChange(event.target.value);
              }
            }}
          >
            <optgroup label="主要颜色">
              {colorThemes.map((theme) => (
                <option key={theme.key} value={theme.key}>
                  {theme.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="背景图">
              {imageThemes.map((theme) => (
                <option key={theme.key} value={theme.key}>
                  {theme.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <div className="command-clock">
          <span>system time</span>
          <strong>{clockLine}</strong>
        </div>
        {rightMeta.map((item) => (
          <div key={item.label} className="command-meta">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </header>
  );
}

function NewsPanel({
  items,
  updatedAt,
  collapsed,
  filter,
  onFilterChange,
  onToggle,
  summaryStats
}: {
  items: NewsItem[];
  updatedAt: string | null;
  collapsed: boolean;
  filter: NewsFilter;
  onFilterChange: (next: NewsFilter) => void;
  onToggle: () => void;
  summaryStats: SummaryStat[];
}) {
  const filteredItems = items.filter((item) => filter === "all" || item.category === filter);

  if (collapsed) {
    return (
      <aside className="edge-panel edge-panel--collapsed edge-panel--news">
        <button type="button" className="edge-panel__collapsed" onClick={onToggle}>
          <span>Hot News</span>
          <strong>{items.length}</strong>
        </button>
      </aside>
    );
  }

  return (
    <aside className="edge-panel edge-panel--news edge-panel--ops">
      <div
        className="edge-panel__frame-art"
        style={{ backgroundImage: `url(${homeImageAssets.leftPanelFrame})` }}
        aria-hidden="true"
      />
      <div className="edge-panel__content">
        <HomeRouteMenu activeSection="home" />
        <div className="ops-summary-grid">
          {summaryStats.map((item) => (
            <div key={item.label} className="ops-summary-tile">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="edge-panel__header">
        <div>
          <p className="eyebrow">Decision Feed</p>
          <h2>热点情报</h2>
        </div>
        <div className="edge-panel__actions">
          <span className="panel-stamp">{updatedAt ? `刷新 ${formatTime(updatedAt)}` : "等待刷新"}</span>
          <button type="button" className="panel-toggle" onClick={onToggle}>
            收起
          </button>
        </div>
      </div>
      <div className="filter-strip" role="tablist" aria-label="热点筛选">
        {[
          ["all", "全部"],
          ["ai", "AI"],
          ["technology", "科技"],
          ["economy", "经济"],
          ["entertainment", "娱乐"],
          ["world", "国际"]
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`filter-chip${filter === value ? " is-active" : ""}`}
            onClick={() => onFilterChange(value as NewsFilter)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="edge-panel__scroll">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <Link key={item.id} to="/news" className="intel-item">
              <div className="intel-item__head">
                <span className="intel-source">{item.sourceCount} 信源</span>
                <span className="intel-time">{formatTime(item.updatedAt)}</span>
              </div>
              <h3>{item.title}</h3>
              <ul>
                <li>{item.summary}</li>
                <li>{item.sources.slice(0, 3).join(" / ")}</li>
              </ul>
            </Link>
          ))
        ) : (
          <div className="edge-empty">当前筛选下没有热点摘要。</div>
        )}
      </div>
      <div className="ops-panel-footer">
        <span>联动分析</span>
        <img src={homeImageAssets.iconMore} alt="" aria-hidden="true" />
      </div>
    </aside>
  );
}

function TodoPanel({
  items,
  pendingReview,
  collapsed,
  onToggle,
  overviewStats,
  healthLabel
}: {
  items: ScheduleItem[];
  pendingReview: DashboardData["schedule"]["pendingReview"];
  collapsed: boolean;
  onToggle: () => void;
  overviewStats: SummaryStat[];
  healthLabel: string;
}) {
  if (collapsed) {
    return (
      <aside className="edge-panel edge-panel--collapsed edge-panel--todo">
        <button type="button" className="edge-panel__collapsed" onClick={onToggle}>
          <span>Todo</span>
          <strong>{items.length}</strong>
        </button>
      </aside>
    );
  }

  return (
    <aside className="edge-panel edge-panel--todo edge-panel--ops edge-panel--right">
      <div className="edge-panel__header">
        <div>
          <p className="eyebrow">System Status</p>
          <h2>运行状态</h2>
        </div>
        <div className="edge-panel__actions">
          <span className="panel-stamp">{pendingReview ? "待确认" : "稳定在线"}</span>
          <button type="button" className="panel-toggle" onClick={onToggle}>
            收起
          </button>
        </div>
      </div>
      <div className="ops-health-banner">
        <img src={homeImageAssets.iconSensor} alt="" aria-hidden="true" />
        <strong>{healthLabel}</strong>
      </div>
      <div className="ops-summary-grid ops-summary-grid--compact">
        {overviewStats.map((item) => (
          <div key={item.label} className="ops-summary-tile">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>
      <div className="edge-panel__header edge-panel__header--minor">
        <div>
          <p className="eyebrow">Task Preview</p>
          <h2>今日待办</h2>
        </div>
      </div>
      <div className="edge-panel__scroll">
        <div className="todo-list">
          {items.slice(0, 7).map((item) => (
            <Link key={item.id} to="/todo" className="todo-item">
              <div className="todo-item__head">
                <div className="todo-item__title">
                  {item.status === "done" ? (
                    <img src={homeImageAssets.checkboxSelected} alt="" aria-hidden="true" />
                  ) : (
                    <span className="todo-item__checkbox" aria-hidden="true" />
                  )}
                  <h3>{item.title}</h3>
                </div>
                <span className={`todo-badge todo-badge--${item.status}`}>{item.status === "done" ? "DONE" : "TODO"}</span>
              </div>
              <div className="todo-item__meta">
                <span>{item.suggestedWindow}</span>
                <span className={`urgency urgency--${item.urgency}`}>P{getUrgencyLabel(item.urgency)}</span>
              </div>
            </Link>
          ))}
          {items.length === 0 ? <div className="edge-empty">今天还没有待办预览。</div> : null}
        </div>
      </div>
      <div className="ops-guide-card">
        <div className="ops-guide-card__head">
          <span>园区导览</span>
          <img src={homeImageAssets.iconMore} alt="" aria-hidden="true" />
        </div>
        <img src={homeImageAssets.guideMap} alt="" className="ops-guide-card__map" />
      </div>
      <Link to="/todo" className="panel-link">
        进入完整任务页
      </Link>
    </aside>
  );
}

function buildFallbackProgress(dashboard: DashboardData): ChatProgressStep[] {
  const latestTask = dashboard.recentTasks[0];

  if (!latestTask) {
    return [];
  }

  return [
    {
      id: `fallback-route-${latestTask.id}`,
      label: "最近路由",
      detail: `主 Agent 最近调用 ${latestTask.agentId}，准备处理：${latestTask.summary}`,
      status: latestTask.status === "running" ? "running" : "completed",
      timestamp: latestTask.createdAt
    },
    {
      id: `fallback-result-${latestTask.id}`,
      label: "最近结果",
      detail: latestTask.resultSummary ?? "该任务正在执行，等待结果返回。",
      status: latestTask.status === "completed" ? "completed" : "running",
      timestamp: latestTask.updatedAt
    }
  ];
}

function ChatPanel({ dashboard }: { dashboard: DashboardData }) {
  const queryClient = useQueryClient();
  const [workspace, setWorkspace] = useState(() =>
    createInitialChatWorkspace(dashboard.messages, new Date().toISOString())
  );
  const [draftsBySession, setDraftsBySession] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraftsBySession((previous) => {
      const next = { ...previous };

      for (const session of workspace.sessions) {
        if (!(session.id in next)) {
          next[session.id] = "";
        }
      }

      return next;
    });
  }, [workspace.sessions]);

  const mutation = useMutation({
    mutationFn: async ({
      message
    }: {
      message: string;
      sessionId: string;
    }) => sendChat(message),
    onMutate: ({ message, sessionId }) => {
      const now = new Date().toISOString();

      setWorkspace((previous) => applyOptimisticPrompt(previous, sessionId, message, now));
      setDraftsBySession((previous) => ({
        ...previous,
        [sessionId]: ""
      }));

      return { sessionId };
    },
    onSuccess: async (response, _variables, context) => {
      if (context?.sessionId) {
        setWorkspace((previous) =>
          applyChatSuccess(previous, context.sessionId, response, response.message.createdAt)
        );
      }

      await queryClient.invalidateQueries({
        queryKey: ["dashboard"]
      });
    }
  });

  const activeSession =
    workspace.sessions.find((session) => session.id === workspace.activeSessionId) ??
    workspace.sessions[0];
  const draft = activeSession ? draftsBySession[activeSession.id] ?? "" : "";
  const displayedProgress =
    activeSession && activeSession.progress.length > 0
      ? activeSession.progress
      : buildFallbackProgress(dashboard);
  const busyAgents = dashboard.agents.filter((agent) => agent.status === "busy").length;
  const doneToday = dashboard.schedule.todayItems.filter((item) => item.status === "done").length;
  const unreadNotifications = dashboard.notifications.filter((item) => !item.read).length;
  const sceneMarkers = [
    {
      className: "scene-marker--office",
      title: "办公楼",
      icon: homeImageAssets.iconOffice,
      primaryLabel: "余额",
      primaryValue: formatAmount(dashboard.ledger.summary.balance),
      secondaryLabel: "今日入账",
      secondaryValue: formatAmount(dashboard.ledger.summary.todayIncome),
      tertiaryLabel: "提醒",
      tertiaryValue: formatShortCount(unreadNotifications)
    },
    {
      className: "scene-marker--factory",
      title: "多层厂房",
      icon: homeImageAssets.iconFactory,
      primaryLabel: "待办",
      primaryValue: formatShortCount(dashboard.schedule.todayItems.length),
      secondaryLabel: "已完成",
      secondaryValue: formatShortCount(doneToday),
      tertiaryLabel: "高优先",
      tertiaryValue: formatShortCount(
        dashboard.schedule.todayItems.filter((item) => item.urgency === "high").length
      ),
      emphasized: true
    },
    {
      className: "scene-marker--device",
      title: "设备网络",
      icon: homeImageAssets.iconDevice,
      primaryLabel: "Agent",
      primaryValue: formatShortCount(dashboard.agents.length),
      secondaryLabel: "运行中",
      secondaryValue: formatShortCount(busyAgents),
      tertiaryLabel: "任务流",
      tertiaryValue: formatShortCount(dashboard.recentTasks.length)
    },
    {
      className: "scene-marker--intel",
      title: "情报中枢",
      icon: homeImageAssets.iconEnergy,
      primaryLabel: "热点",
      primaryValue: formatShortCount(dashboard.news.items.length),
      secondaryLabel: "信源",
      secondaryValue: formatShortCount(dashboard.news.sources.length),
      tertiaryLabel: "归纳",
      tertiaryValue: dashboard.news.lastUpdatedAt ? formatTime(dashboard.news.lastUpdatedAt) : "--:--"
    }
  ] as const;

  function handleCreateSession() {
    const now = new Date().toISOString();
    let createdSessionId = "";

    setWorkspace((previous) => {
      const next = addSession(previous, now);
      createdSessionId = next.activeSessionId;
      return next;
    });

    if (createdSessionId) {
      setDraftsBySession((previous) => ({
        ...previous,
        [createdSessionId]: ""
      }));
    }
  }

  function handleRemoveSession(sessionId: string) {
    if (!window.confirm("确认删除该会话？删除后无法恢复。")) {
      return;
    }

    setWorkspace((previous) => removeSession(previous, sessionId, new Date().toISOString()));
    setDraftsBySession((previous) => {
      const next = { ...previous };
      delete next[sessionId];
      return next;
    });
  }

  return (
    <section className="console-shell console-shell--ops">
      <div className="ops-stage">
        <div className="ops-stage__backdrop" aria-hidden="true">
          <div className="ops-stage__halo" />
          <div className="ops-stage__terrain ops-stage__terrain--left" />
          <div className="ops-stage__terrain ops-stage__terrain--right" />
          <div className="ops-stage__road ops-stage__road--main" />
          <div className="ops-stage__road ops-stage__road--cross" />
          <div className="ops-stage__block ops-stage__block--a" />
          <div className="ops-stage__block ops-stage__block--b" />
          <div className="ops-stage__block ops-stage__block--c" />
          <div className="ops-stage__block ops-stage__block--d" />
        </div>
        <div className="ops-stage__badge">
          <span className="ops-stage__badge-dot" aria-hidden="true" />
          <span>主工作区</span>
        </div>
        {sceneMarkers.map((marker) => (
          <SceneMarker key={marker.title} {...marker} />
        ))}
        <div
          className="ops-stage__tools"
          style={{ backgroundImage: `url(${homeImageAssets.controlStrip})` }}
          aria-hidden="true"
        >
          <img src={homeImageAssets.iconZoomIn} alt="" />
          <img src={homeImageAssets.iconZoomOut} alt="" />
          <img src={homeImageAssets.iconReset} alt="" />
          <img src={homeImageAssets.iconFullscreen} alt="" />
        </div>
      </div>
      <div className="session-tabs">
        <div className="session-tabs__track">
          {workspace.sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`session-tab${session.id === activeSession?.id ? " is-active" : ""}`}
              onClick={() =>
                setWorkspace((previous) => ({
                  ...previous,
                  activeSessionId: session.id
                }))
              }
            >
              <span className="session-tab__title">{session.title}</span>
              <span
                className="session-tab__close"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  handleRemoveSession(session.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    handleRemoveSession(session.id);
                  }
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="session-tabs__create" onClick={handleCreateSession}>
          ＋ 新建会话
        </button>
      </div>

      <div className="chat-shell">
        <div className="chat-shell__main">
          <div className="chat-shell__messages">
            {activeSession && activeSession.messages.length > 0 ? (
              activeSession.messages.map((message) => (
                <article key={message.id} className={`message-entry message-entry--${message.role}`}>
                  <div className="message-entry__meta">
                    <span>{getMessageLabel(message.role)}</span>
                    <strong>{message.agentId ?? "main-agent"}</strong>
                    <time>{formatDateTime(message.createdAt)}</time>
                  </div>
                  <p>{message.content}</p>
                </article>
              ))
            ) : (
              <div className="edge-empty">新会话已创建，输入问题后这里会显示主 Agent 的回复。</div>
            )}
          </div>

          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();

              if (!draft.trim() || !activeSession) {
                return;
              }

              mutation.mutate({
                message: draft.trim(),
                sessionId: activeSession.id
              });
            }}
          >
            <label className="chat-composer__prompt" htmlFor="agent-console-input">
              <span>$ main-agent</span>
              <span>当前会话输入</span>
            </label>
            <textarea
              id="agent-console-input"
              value={draft}
              onChange={(event) => {
                if (!activeSession) {
                  return;
                }

                setDraftsBySession((previous) => ({
                  ...previous,
                  [activeSession.id]: event.target.value
                }));
              }}
              placeholder="输入你的问题，主 Agent 会在左侧回复，并在右侧展示调用与执行进度。"
              rows={5}
            />
            <div className="chat-composer__actions">
              <span>{draft.trim() ? `${draft.trim().length} chars` : "等待输入"}</span>
              <button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "发送中..." : "发送"}
              </button>
            </div>
          </form>
        </div>

        <aside className="progress-panel">
          <div className="progress-panel__header">
            <div>
              <p className="eyebrow">Progress Timeline</p>
              <h2>处理进度</h2>
            </div>
            <span className="panel-stamp">
              {mutation.isPending && activeSession?.id === workspace.activeSessionId ? "进行中" : "已同步"}
            </span>
          </div>
          <div className="progress-panel__scroll">
            {displayedProgress.length > 0 ? (
              displayedProgress.map((step, index) => (
                <article key={step.id} className="progress-step">
                  <div className="progress-step__line" aria-hidden={index === displayedProgress.length - 1} />
                  <div className={`progress-step__dot progress-step__dot--${step.status}`} />
                  <div className="progress-step__body">
                    <div className="progress-step__meta">
                      <span>{step.label}</span>
                      <time>{formatTime(step.timestamp)}</time>
                    </div>
                    <p>{step.detail}</p>
                  </div>
                </article>
              ))
            ) : (
              <div className="edge-empty">发送问题后，这里会按时间线显示主 Agent 的路由和子 Agent 的处理步骤。</div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function DetailPlaceholderPage({
  section,
  title,
  description
}: {
  section: Exclude<RailSection, "home">;
  title: string;
  description: string;
}) {
  const [railExpanded, setRailExpanded] = useState(true);
  const [themeKey, setThemeKey] = useThemePreference();
  const clockLine = useLiveClock();

  return (
    <main className="workspace">
      <CommandRail
        activeSection={section}
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        rightMeta={[
          { label: "view", value: title },
          { label: "status", value: "reserved" },
          { label: "mode", value: "desktop" }
        ]}
      />

      <section className="placeholder-shell">
        <p className="eyebrow">Placeholder Route</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="placeholder-shell__actions">
          <Link to="/">返回首页</Link>
          <span>这一期只完成首页工作台布局，详情视图已预留路由位置。</span>
        </div>
      </section>
    </main>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [railExpanded, setRailExpanded] = useState(false);
  const [newsCollapsed, setNewsCollapsed] = useState(false);
  const [todoCollapsed, setTodoCollapsed] = useState(false);
  const [newsFilter, setNewsFilter] = useState<NewsFilter>("all");
  const [themeKey, setThemeKey] = useThemePreference();
  const clockLine = useLiveClock();

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard
  });

  useEffect(() => {
    return openDashboardStream((data) => {
      queryClient.setQueryData(["dashboard"], data);
    });
  }, [queryClient]);

  if (dashboardQuery.isLoading || !dashboardQuery.data) {
    return <div className="loading-shell">正在连接控制台并加载首页工作台...</div>;
  }

  const dashboard = dashboardQuery.data;
  const unreadNotifications = dashboard.notifications.filter((item) => !item.read).length;
  const pendingItems = dashboard.schedule.todayItems.filter((item) => item.status === "pending").length;
  const busyAgents = dashboard.agents.filter((agent) => agent.status === "busy").length;
  const newsSummaryStats: SummaryStat[] = [
    {
      label: "今日支出",
      value: formatAmount(dashboard.ledger.summary.todayExpense),
      note: `结余 ${formatAmount(dashboard.ledger.summary.balance)}`
    },
    {
      label: "热点归纳",
      value: formatShortCount(dashboard.news.items.length),
      note: dashboard.news.lastUpdatedAt ? `更新 ${formatTime(dashboard.news.lastUpdatedAt)}` : "等待刷新"
    },
    {
      label: "待处理",
      value: formatShortCount(unreadNotifications),
      note: dashboard.schedule.pendingReview ? "有待复盘" : "无待确认"
    }
  ];
  const todoSummaryStats: SummaryStat[] = [
    {
      label: "Agent",
      value: formatShortCount(dashboard.agents.length),
      note: `${formatShortCount(busyAgents)} 个忙碌`
    },
    {
      label: "任务流",
      value: formatShortCount(dashboard.recentTasks.length),
      note: `${formatShortCount(pendingItems)} 项待办`
    },
    {
      label: "消息",
      value: formatShortCount(unreadNotifications),
      note: dashboard.schedule.pendingReview ? "待确认 01" : "全部已读"
    },
    {
      label: "新闻源",
      value: formatShortCount(dashboard.news.sources.length),
      note: `${formatShortCount(dashboard.news.items.length)} 条归纳`
    }
  ];
  const layoutStyle = {
    "--news-width": newsCollapsed ? "64px" : "326px",
    "--todo-width": todoCollapsed ? "72px" : "332px"
  } as CSSProperties;

  return (
    <main className="workspace workspace--ops">
      <CommandRail
        activeSection="home"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        showNavigation={false}
        rightMeta={[
          { label: "agents", value: String(dashboard.agents.length) },
          { label: "tasks", value: String(dashboard.recentTasks.length) },
          { label: "runtime", value: dashboard.tasks.inProgress.length > 0 ? "running" : "idle" }
        ]}
      />

      <div className="workspace-grid" style={layoutStyle}>
        <NewsPanel
          items={dashboard.news.items}
          updatedAt={dashboard.news.lastUpdatedAt}
          collapsed={newsCollapsed}
          filter={newsFilter}
          onFilterChange={setNewsFilter}
          onToggle={() => setNewsCollapsed((value) => !value)}
          summaryStats={newsSummaryStats}
        />

        <ChatPanel dashboard={dashboard} />

        <TodoPanel
          items={dashboard.schedule.todayItems}
          pendingReview={dashboard.schedule.pendingReview}
          collapsed={todoCollapsed}
          onToggle={() => setTodoCollapsed((value) => !value)}
          overviewStats={todoSummaryStats}
          healthLabel={busyAgents > 0 ? `连续 ${busyAgents} 个执行流在线` : "所有执行流运行平稳"}
        />
      </div>
    </main>
  );
}
