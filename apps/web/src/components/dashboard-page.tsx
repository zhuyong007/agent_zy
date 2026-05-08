import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type {
  DashboardData,
  NotificationRecord,
  NewsCategory,
  NewsItem,
  ScheduleItem,
  TopicIdea
} from "@agent-zy/shared-types";

import { cancelNotification, fetchDashboard, openDashboardStream, sendChat } from "../api";
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
import {
  HOME_MODULE_DEFINITIONS,
  HOME_MODULE_SIZE_OPTIONS,
  canShowHomeModuleInNavigation,
  getHomeModuleGeometry,
  getHomeModulePreviewSize,
  loadHomeLayout,
  moveHomeModule,
  moveHomeModuleByOffset,
  persistHomeLayout,
  resetHomeLayout,
  updateHomeModulePreference,
  type HomeModuleId,
  type HomeModulePreference,
  type HomeModuleSize
} from "../home-layout";

export type RailSection = "home" | "manage" | "news" | "topics" | "ledger" | "todo";
type NewsFilter = "all" | NewsCategory;

const railItems: Array<{
  key: RailSection;
  label: string;
  stamp: string;
  to: string;
  moduleId?: HomeModuleId;
}> = [
  { key: "home", label: "工作台", stamp: "00", to: "/" },
  { key: "manage", label: "管理", stamp: "01", to: "/manage" },
  { key: "news", label: "热点情报", stamp: "02", to: "/news", moduleId: "news" },
  { key: "topics", label: "选题", stamp: "03", to: "/topics", moduleId: "topics" },
  { key: "ledger", label: "记账", stamp: "04", to: "/ledger", moduleId: "ledger" },
  { key: "todo", label: "待办", stamp: "05", to: "/todo", moduleId: "todo" }
];

const weekdayMap = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const colorThemes = themeOptions.filter((theme) => theme.kind === "color");
const imageThemes = themeOptions.filter((theme) => theme.kind === "image");
const moduleDefinitionsById = new Map<HomeModuleId, (typeof HOME_MODULE_DEFINITIONS)[number]>(
  HOME_MODULE_DEFINITIONS.map((definition) => [definition.id, definition])
);
const moduleSizeLabels = new Map(HOME_MODULE_SIZE_OPTIONS.map((item) => [item.value, item.label]));
const newsCategoryFilters: Array<[NewsFilter, string]> = [
  ["all", "全部"],
  ["ai-models", "模型"],
  ["ai-products", "产品"],
  ["industry", "行业"],
  ["paper", "论文"],
  ["tip", "技巧"]
];

const moduleFramesBySize: Record<HomeModuleSize, string> = {
  max: homeImageAssets.newsPanelFrame,
  large: homeImageAssets.newsPanelFrame,
  medium: homeImageAssets.todoPanelFrame,
  smaller: homeImageAssets.topicPanelFrame,
  small: homeImageAssets.routeFrame
};

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

function formatAmount(amount: number) {
  return amount.toLocaleString("zh-CN");
}

function formatShortCount(count: number) {
  return count.toLocaleString("zh-CN", {
    minimumIntegerDigits: count < 10 ? 2 : 1,
    useGrouping: false
  });
}

function getModuleDefinition(id: HomeModuleId) {
  return moduleDefinitionsById.get(id) ?? {
    id,
    label: id,
    description: "模块已注册，内容组件待接入。",
    defaultSize: "smaller" as HomeModuleSize,
    defaultVisible: false
  };
}

function getModuleSizeLabel(size: HomeModuleSize) {
  return moduleSizeLabels.get(size) ?? size;
}

function getModuleFrameStyle(size: HomeModuleSize, collapsed: boolean) {
  const geometry = getHomeModuleGeometry(size, collapsed);
  const previewSize = getHomeModulePreviewSize(size, collapsed);

  return {
    "--home-module-frame": `url("${moduleFramesBySize[size]}")`,
    "--home-module-columns": String(geometry.columns),
    "--home-module-rows": String(geometry.rows),
    "--home-module-preview-width": `${previewSize.width}px`,
    "--home-module-preview-height": `${previewSize.height}px`
  } as CSSProperties;
}

function getModuleSummary(id: HomeModuleId, dashboard: DashboardData) {
  if (id === "news") {
    return `${formatShortCount(dashboard.news.items.length)} 条热点`;
  }

  if (id === "chat") {
    return dashboard.tasks.inProgress.length > 0 ? "会话运行中" : `${formatShortCount(dashboard.messages.length)} 条消息`;
  }

  if (id === "todo") {
    const pendingCount = dashboard.schedule.todayItems.filter((item) => item.status === "pending").length;
    return `${formatShortCount(pendingCount)} 项待处理`;
  }

  if (id === "ledger") {
    return `结余 ${formatAmount(dashboard.ledger.summary.balance)}`;
  }

  if (id === "topics") {
    return `${formatShortCount(dashboard.topics.current.length)} 个选题`;
  }

  return "待接入";
}

function useHomeLayoutPreferences() {
  const [layout, setLayout] = useState<HomeModulePreference[]>(() => loadHomeLayout());

  function applyLayoutUpdate(updater: (current: HomeModulePreference[]) => HomeModulePreference[]) {
    setLayout((current) => {
      const next = updater(current);
      persistHomeLayout(next);
      return next;
    });
  }

  return {
    layout,
    updateModule: (
      id: HomeModuleId,
      patch: Partial<Pick<HomeModulePreference, "visible" | "showInNavigation" | "size" | "collapsed">>
    ) => {
      applyLayoutUpdate((current) => updateHomeModulePreference(current, id, patch));
    },
    moveModule: (sourceId: HomeModuleId, targetId: HomeModuleId) => {
      applyLayoutUpdate((current) => moveHomeModule(current, sourceId, targetId));
    },
    moveModuleByOffset: (id: HomeModuleId, offset: -1 | 1) => {
      applyLayoutUpdate((current) => moveHomeModuleByOffset(current, id, offset));
    },
    resetLayout: () => {
      const next = resetHomeLayout();
      setLayout(next);
    }
  };
}

function useSortableModuleDnd(onMove: (sourceId: HomeModuleId, targetId: HomeModuleId) => void) {
  const [activeId, setActiveId] = useState<HomeModuleId | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id) as HomeModuleId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const sourceId = String(event.active.id) as HomeModuleId;
    const targetId = event.over ? (String(event.over.id) as HomeModuleId) : null;

    setActiveId(null);

    if (targetId && sourceId !== targetId) {
      onMove(sourceId, targetId);
    }
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  return {
    activeId,
    sensors,
    handleDragStart,
    handleDragEnd,
    handleDragCancel
  };
}

export function CommandRail({
  activeSection,
  expanded,
  onToggle,
  themeKey,
  onThemeChange,
  rightMeta: _rightMeta,
  clockLine,
  showNavigation = true,
  navigationLayout
}: {
  activeSection: RailSection;
  expanded: boolean;
  onToggle: () => void;
  themeKey: ThemeKey;
  onThemeChange: (next: ThemeKey) => void;
  rightMeta: Array<{ label: string; value: string }>;
  clockLine: string;
  showNavigation?: boolean;
  navigationLayout?: readonly HomeModulePreference[];
}) {
  const railStyle = {
    "--route-frame": `url("${homeImageAssets.routeFrame}")`
  } as CSSProperties;
  const [dateTimePart, weekdayPart] = clockLine.split(" · ");
  const timeLabel = dateTimePart?.slice(11, 16) ?? clockLine;
  const dateLabel = [dateTimePart?.slice(5, 10), weekdayPart].filter(Boolean).join(" ");
  const navigationPreferences = navigationLayout ?? loadHomeLayout();
  const shownNavigationIds = new Set(
    navigationPreferences.filter((item) => item.showInNavigation).map((item) => item.id)
  );
  const visibleRailItems = railItems.filter((item) => !item.moduleId || shownNavigationIds.has(item.moduleId));

  return (
    <header
      className={`command-rail${showNavigation ? "" : " command-rail--compact"}${expanded ? " is-expanded" : ""}`}
      style={railStyle}
    >
      {showNavigation ? (
        <nav className="command-rail__nav" aria-label="主导航">
          {visibleRailItems.map((item) => {
            const active = activeSection === item.key;

            return (
              <Link
                key={item.key}
                className={`command-link${active ? " is-active" : ""}${expanded || active ? "" : " is-hidden"}`}
                to={item.to}
              >
                <strong>{item.label}</strong>
              </Link>
            );
          })}
          <button
            type="button"
            className="command-route__toggle"
            onClick={onToggle}
            aria-label={expanded ? "收回顶栏路由" : "展开顶栏路由"}
            aria-expanded={expanded}
          >
            <span aria-hidden="true" />
          </button>
        </nav>
      ) : null}
      <div className="command-rail__tools">
        <div className="command-clock">
          <strong>{timeLabel}</strong>
          <span>{dateLabel}</span>
        </div>
        <label className="theme-switcher theme-switcher--inline">
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
      </div>
    </header>
  );
}

function NewsPanel({
  items,
  updatedAt,
  size,
  filter,
  onFilterChange
}: {
  items: NewsItem[];
  updatedAt: string | null;
  size: HomeModuleSize;
  filter: NewsFilter;
  onFilterChange: (next: NewsFilter) => void;
}) {
  const filteredItems = items.filter((item) => filter === "all" || item.category === filter);
  const lead = filteredItems[0];
  const visibleItemsBySize: Record<HomeModuleSize, number> = {
    max: 8,
    large: 5,
    medium: 3,
    smaller: 3,
    small: 2
  };
  const showFilters = size === "max" || size === "large" || size === "medium";
  const showSummary = size === "max" || size === "large" || size === "smaller";
  const showSources = size === "max" || size === "large";

  return (
    <aside className={`edge-panel edge-panel--news edge-panel--ops news-panel news-panel--${size}`}>
      <div className="edge-panel__header">
        <div>
          <p className="eyebrow">AI HOT Feed</p>
          <h2>AI 热点</h2>
        </div>
        <div className="edge-panel__actions">
          <span className="panel-stamp">{updatedAt ? `刷新 ${formatTime(updatedAt)}` : "等待刷新"}</span>
        </div>
      </div>

      {size === "max" && lead ? (
        <Link to="/news" className="news-panel__lead">
          <span>{lead.sources[0] ?? "AI HOT"}</span>
          <strong>{lead.title}</strong>
          <p>{lead.summary}</p>
        </Link>
      ) : null}

      {showFilters ? (
        <div className="filter-strip" role="tablist" aria-label="热点筛选">
          {newsCategoryFilters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`filter-chip${filter === value ? " is-active" : ""}`}
              onClick={() => onFilterChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="edge-panel__scroll">
        {filteredItems.length > 0 ? (
          filteredItems.slice(size === "max" && lead ? 1 : 0, visibleItemsBySize[size]).map((item) => (
            <Link key={item.id} to="/news" className="intel-item">
              <div className="intel-item__head">
                <span className="intel-source">{item.sources[0] ?? "AI HOT"}</span>
                <span className="intel-time">{formatTime(item.updatedAt)}</span>
              </div>
              <h3>{item.title}</h3>
              {showSummary ? (
                <ul>
                  <li>{item.summary}</li>
                  {showSources ? <li>{item.sources.slice(0, 3).join(" / ")}</li> : null}
                </ul>
              ) : null}
            </Link>
          ))
        ) : (
          <div className="edge-empty">当前筛选下没有热点摘要。</div>
        )}
      </div>
      <div className="ops-panel-footer">
        <span>{filteredItems.length} 条 AI HOT</span>
        <img src={homeImageAssets.iconMore} alt="" aria-hidden="true" />
      </div>
    </aside>
  );
}

function TodoPanel({
  items
}: {
  items: ScheduleItem[];
}) {
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const completedCount = items.filter((item) => item.status === "done").length;
  const highPriorityCount = items.filter((item) => item.urgency === "high" && item.status !== "done").length;
  const pendingNote = pendingCount > 0 ? "优先清掉关键事项" : "当前没有未完成事项";
  const footerNote =
    items.length > 0 ? `共 ${formatShortCount(items.length)} 项任务，建议先处理高优先事项。` : "今天还没有待办安排。";

  return (
    <aside className="edge-panel edge-panel--todo edge-panel--ops edge-panel--right">
      <div className="edge-panel__header edge-panel__header--compact">
        <div>
          <p className="eyebrow">Today Focus</p>
          <h2>今日待办</h2>
        </div>
      </div>
      <div className="todo-panel__summary">
        <div className="todo-panel__hero">
          <span>待处理</span>
          <strong>{formatShortCount(pendingCount)}</strong>
          <small>{pendingNote}</small>
        </div>
        <div className="todo-summary-grid">
          <div className="todo-summary-tile">
            <span>高优先</span>
            <strong>{formatShortCount(highPriorityCount)}</strong>
            <small>需要尽快处理</small>
          </div>
          <div className="todo-summary-tile">
            <span>已完成</span>
            <strong>{formatShortCount(completedCount)}</strong>
            <small>今日已勾选</small>
          </div>
        </div>
      </div>
      <div className="todo-panel__footer">
        <p>{footerNote}</p>
        <Link to="/todo" className="panel-link">
          进入任务页
        </Link>
      </div>
    </aside>
  );
}

function LedgerPanel({
  balance,
  todayIncome,
  todayExpense
}: {
  balance: number;
  todayIncome: number;
  todayExpense: number;
}) {
  return (
    <Link to="/ledger" className="ledger-panel">
      <div className="ledger-panel__header">
        <p className="eyebrow">Ledger Snapshot</p>
        <h2>记账</h2>
      </div>
      <div className="ledger-panel__metrics">
        <div>
          <span>支出</span>
          <strong>{formatAmount(todayExpense)}</strong>
        </div>
        <div>
          <span>收入</span>
          <strong>{formatAmount(todayIncome)}</strong>
        </div>
        <div>
          <span>结余</span>
          <strong>{formatAmount(balance)}</strong>
        </div>
      </div>
    </Link>
  );
}

function TopicPanel({
  items,
  generatedAt
}: {
  items: TopicIdea[];
  generatedAt: string | null;
}) {
  const lead = items[0];

  return (
    <Link to="/topics" className="topic-panel">
      <div className="topic-panel__header">
        <div>
          <p className="eyebrow">AI Media Topics</p>
          <h2>AI 自媒体选题</h2>
        </div>
        <span>{generatedAt ? `更新 ${formatTime(generatedAt)}` : "等待推送"}</span>
      </div>
      {lead ? (
        <div className="topic-panel__lead">
          <strong>{lead.title}</strong>
          <p>{lead.hook}</p>
        </div>
      ) : (
        <div className="edge-empty">还没有选题推送。</div>
      )}
      <div className="topic-panel__list">
        {items.slice(0, 3).map((item) => (
          <div key={item.id} className="topic-panel__item">
            <span>{item.score}</span>
            <p>{item.contentDirection}</p>
          </div>
        ))}
      </div>
    </Link>
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

function HistoryNotificationTray({
  notifications
}: {
  notifications: NotificationRecord[];
}) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(notifications[0]?.id ?? null);
  const historyNotifications = notifications.filter(
    (notification) => notification.kind === "history-post" && notification.payload
  );
  const cancelMutation = useMutation({
    mutationFn: cancelNotification,
    onSuccess: (dashboard) => {
      queryClient.setQueryData(["dashboard"], dashboard);
    }
  });

  useEffect(() => {
    if (historyNotifications[0] && !historyNotifications.some((item) => item.id === expandedId)) {
      setExpandedId(historyNotifications[0].id);
    }
  }, [expandedId, historyNotifications]);

  if (historyNotifications.length === 0) {
    return null;
  }

  return (
    <section className="history-notice-tray" aria-label="每日历史知识点通知">
      {historyNotifications.map((notification) => {
        const payload = notification.payload;
        const expanded = expandedId === notification.id;

        if (!payload) {
          return null;
        }

        return (
          <article className="history-notice" key={notification.id}>
            <div className="history-notice__head">
              <button
                type="button"
                className="history-notice__title"
                onClick={() => setExpandedId(expanded ? null : notification.id)}
              >
                <span>常驻通知</span>
                <strong>{notification.title}</strong>
              </button>
              <button
                type="button"
                className="history-notice__cancel"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(notification.id)}
              >
                取消
              </button>
            </div>
            <p>{notification.body}</p>
            {expanded ? (
              <div className="history-notice__detail">
                <div className="history-notice__caption">
                  <span>小红书正文</span>
                  <p>{payload.xiaohongshuCaption}</p>
                </div>
                <div className="history-notice__cards">
                  {payload.cards.map((card, index) => (
                    <div className="history-card-plan" key={`${notification.id}-${card.title}`}>
                      <span>图 {index + 1}</span>
                      <strong>{card.title}</strong>
                      <p>{card.imageText}</p>
                      <small>{card.prompt}</small>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
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

      <HistoryNotificationTray notifications={dashboard.notifications} />

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
  section: RailSection;
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

function HomeModuleShell({
  preference,
  summary,
  children,
  onToggleCollapsed,
  setNodeRef,
  sortableStyle,
  dragAttributes,
  dragListeners,
  preview = false,
  isDragging = false
}: {
  preference: HomeModulePreference;
  summary: string;
  children: ReactNode;
  onToggleCollapsed: () => void;
  setNodeRef?: (node: HTMLElement | null) => void;
  sortableStyle?: CSSProperties;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  preview?: boolean;
  isDragging?: boolean;
}) {
  const definition = getModuleDefinition(preference.id);
  const moduleStyle = {
    ...getModuleFrameStyle(preference.size, preference.collapsed),
    ...sortableStyle
  } as CSSProperties;

  return (
    <article
      ref={setNodeRef}
      className={`home-module home-module--size-${preference.size}${preference.collapsed ? " is-collapsed" : ""}${
        isDragging ? " is-dragging" : ""
      }${preview ? " home-module--drag-overlay" : ""}`}
      style={moduleStyle}
      {...(dragAttributes ?? {})}
      {...(dragListeners ?? {})}
    >
      <div className="home-module__meta" aria-hidden="true">
        <span>{getModuleSizeLabel(preference.size)}</span>
        <strong>{definition.label}</strong>
      </div>
      <div className="home-module__body">
        {preference.collapsed ? (
          <div className="home-module__collapsed-content">
            <div>
              <strong>{definition.label}</strong>
              <span>{summary}</span>
            </div>
            <span>已收起</span>
          </div>
        ) : (
          children
        )}
      </div>
      {preview ? null : (
        <div className="home-module__actions" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="home-module__collapse"
            onClick={onToggleCollapsed}
          >
            {preference.collapsed ? "展开" : "收起"}
          </button>
        </div>
      )}
    </article>
  );
}

function SortableHomeModuleShell({
  preference,
  summary,
  children,
  onToggleCollapsed
}: {
  preference: HomeModulePreference;
  summary: string;
  children: ReactNode;
  onToggleCollapsed: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: preference.id
  });
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition
  } as CSSProperties;

  return (
    <HomeModuleShell
      preference={preference}
      summary={summary}
      onToggleCollapsed={onToggleCollapsed}
      setNodeRef={setNodeRef}
      sortableStyle={sortableStyle}
      dragAttributes={attributes}
      dragListeners={listeners}
      isDragging={isDragging}
    >
      {children}
    </HomeModuleShell>
  );
}

function renderHomeModuleContent({
  id,
  dashboard,
  newsFilter,
  onNewsFilterChange,
  size
}: {
  id: HomeModuleId;
  dashboard: DashboardData;
  newsFilter: NewsFilter;
  onNewsFilterChange: (next: NewsFilter) => void;
  size: HomeModuleSize;
}) {
  if (id === "news") {
    return (
      <NewsPanel
        items={dashboard.news.items}
        updatedAt={dashboard.news.lastUpdatedAt}
        size={size}
        filter={newsFilter}
        onFilterChange={onNewsFilterChange}
      />
    );
  }

  if (id === "chat") {
    return <ChatPanel dashboard={dashboard} />;
  }

  if (id === "todo") {
    return <TodoPanel items={dashboard.schedule.todayItems} />;
  }

  if (id === "ledger") {
    return (
      <LedgerPanel
        balance={dashboard.ledger.summary.balance}
        todayIncome={dashboard.ledger.summary.todayIncome}
        todayExpense={dashboard.ledger.summary.todayExpense}
      />
    );
  }

  if (id === "topics") {
    return (
      <TopicPanel
        items={dashboard.topics.current}
        generatedAt={dashboard.topics.lastGeneratedAt}
      />
    );
  }

  return <div className="edge-empty">模块已注册，内容组件待接入。</div>;
}

function ManageItem({
  preference,
  onVisibleChange,
  onNavigationChange,
  onSizeChange
}: {
  preference: HomeModulePreference;
  onVisibleChange: (visible: boolean) => void;
  onNavigationChange: (visible: boolean) => void;
  onSizeChange: (size: HomeModuleSize) => void;
}) {
  const definition = getModuleDefinition(preference.id);
  const supportsNavigation = canShowHomeModuleInNavigation(preference.id);

  return (
    <article className="manage-item">
      <div className="manage-item__identity">
        <span>{String(preference.order + 1).padStart(2, "0")}</span>
        <div>
          <strong>{definition.label}</strong>
          <p>{definition.description}</p>
        </div>
      </div>

      <label className="manage-switch">
        <input
          type="checkbox"
          checked={preference.visible}
          onChange={(event) => onVisibleChange(event.target.checked)}
        />
        <span>{preference.visible ? "展示" : "隐藏"}</span>
      </label>

      <label className={`manage-switch${supportsNavigation ? "" : " is-disabled"}`}>
        <input
          type="checkbox"
          checked={supportsNavigation && preference.showInNavigation}
          disabled={!supportsNavigation}
          onChange={(event) => onNavigationChange(event.target.checked)}
        />
        <span>{supportsNavigation ? (preference.showInNavigation ? "导航展示" : "不进导航") : "未接入导航"}</span>
      </label>

      <label className="manage-select">
        <span>大小</span>
        <select
          value={preference.size}
          onChange={(event) => onSizeChange(event.target.value as HomeModuleSize)}
        >
          {HOME_MODULE_SIZE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

export function HomeManagePage() {
  const [railExpanded, setRailExpanded] = useState(true);
  const [themeKey, setThemeKey] = useThemePreference();
  const clockLine = useLiveClock();
  const { layout, updateModule, resetLayout } = useHomeLayoutPreferences();
  const visibleCount = layout.filter((item) => item.visible).length;
  const navigationCount = layout.filter((item) => item.showInNavigation).length;

  return (
    <main className="workspace workspace--ops">
      <CommandRail
        activeSection="manage"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[
          { label: "modules", value: String(layout.length) },
          { label: "visible", value: String(visibleCount) },
          { label: "nav", value: String(navigationCount) }
        ]}
      />

      <section className="manage-shell">
        <div className="manage-shell__header">
          <div>
            <p className="eyebrow">Module Registry</p>
            <h1>首页模块管理</h1>
            <p>配置首页展示、导航入口和模块尺寸。新模块会按注册顺序进入这里，默认不打扰现有导航。</p>
          </div>
          <button type="button" onClick={resetLayout}>
            恢复默认布局
          </button>
        </div>

        <div className="manage-overview" aria-label="模块配置摘要">
          <div>
            <span>总模块</span>
            <strong>{layout.length}</strong>
          </div>
          <div>
            <span>首页展示</span>
            <strong>{visibleCount}</strong>
          </div>
          <div>
            <span>导航展示</span>
            <strong>{navigationCount}</strong>
          </div>
        </div>

        <div className="manage-list">
          {layout.map((preference) => (
            <ManageItem
              key={preference.id}
              preference={preference}
              onVisibleChange={(visible) => updateModule(preference.id, { visible })}
              onNavigationChange={(showInNavigation) =>
                updateModule(preference.id, { showInNavigation })
              }
              onSizeChange={(size) => updateModule(preference.id, { size })}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [railExpanded, setRailExpanded] = useState(false);
  const [newsFilter, setNewsFilter] = useState<NewsFilter>("all");
  const [themeKey, setThemeKey] = useThemePreference();
  const clockLine = useLiveClock();
  const { layout, updateModule, moveModule } = useHomeLayoutPreferences();
  const { activeId, sensors, handleDragStart, handleDragEnd, handleDragCancel } = useSortableModuleDnd(moveModule);

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
  const visibleLayout = layout.filter((item) => item.visible);
  const activePreference = activeId ? visibleLayout.find((item) => item.id === activeId) : null;

  return (
    <main className="workspace workspace--ops">
      <CommandRail
        activeSection="home"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[
          { label: "agents", value: String(dashboard.agents.length) },
          { label: "tasks", value: String(dashboard.recentTasks.length) },
          { label: "runtime", value: dashboard.tasks.inProgress.length > 0 ? "running" : "idle" }
        ]}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={visibleLayout.map((item) => item.id)} strategy={rectSortingStrategy}>
          <div className="workspace-grid">
            {visibleLayout.length > 0 ? (
              visibleLayout.map((preference) => (
                <SortableHomeModuleShell
                  key={preference.id}
                  preference={preference}
                  summary={getModuleSummary(preference.id, dashboard)}
                  onToggleCollapsed={() =>
                    updateModule(preference.id, {
                      collapsed: !preference.collapsed
                    })
                  }
                >
                  {renderHomeModuleContent({
                    id: preference.id,
                    dashboard,
                    newsFilter,
                    onNewsFilterChange: setNewsFilter,
                    size: preference.size
                  })}
                </SortableHomeModuleShell>
              ))
            ) : (
              <section className="home-empty">
                <p className="eyebrow">Home Modules</p>
                <h1>首页暂无展示模块</h1>
                <Link to="/manage">进入管理页开启模块</Link>
              </section>
            )}
          </div>
        </SortableContext>
        <DragOverlay>
          {activePreference ? (
            <HomeModuleShell
              preference={activePreference}
              summary={getModuleSummary(activePreference.id, dashboard)}
              onToggleCollapsed={() => undefined}
              preview
            >
              {renderHomeModuleContent({
                id: activePreference.id,
                dashboard,
                newsFilter,
                onNewsFilterChange: setNewsFilter,
                size: activePreference.size
              })}
            </HomeModuleShell>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}
