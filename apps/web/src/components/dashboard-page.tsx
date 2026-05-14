import type { CSSProperties, ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
  HomeModulePreference,
  NotificationRecord,
  NewsCategory,
  NewsFeedItem,
  ScheduleItem
} from "@agent-zy/shared-types";

import {
  cancelNotification,
  fetchDashboard,
  fetchHomeLayout,
  generateHistory,
  openDashboardStream,
  recordLedger,
  refreshNews,
  saveHomeLayout,
  sendChat
} from "../api";
import {
  addSession,
  applyChatSuccess,
  applyOptimisticPrompt,
  createInitialChatWorkspace,
  removeSession,
  type ChatProgressStep
} from "../chat-workspace";
import {
  applyBackgroundSelection,
  applyTheme,
  deleteBackgroundImage,
  getActiveBackgroundId,
  getBackgroundVisibility,
  getInitialThemeKey,
  isThemeKey,
  listBackgroundGallery,
  migrateLegacyBackgroundGallery,
  persistActiveBackgroundId,
  persistBackgroundVisibility,
  persistTheme,
  saveBackgroundImage,
  type BackgroundImageViewRecord,
  type StoredBackgroundImageRecord,
  type ThemeKey,
  themeOptions
} from "../theme";
import { homeImageAssets } from "../image-assets";
import {
  HOME_MODULE_DEFINITIONS,
  HOME_MODULE_SIZE_OPTIONS,
  canShowHomeModuleInNavigation,
  getDefaultHomeLayout,
  getHomeModuleGeometry,
  getHomeModulePreviewSize,
  loadHomeLayout,
  moveHomeModule,
  moveHomeModuleByOffset,
  persistHomeLayout,
  resetHomeLayout,
  updateHomeModulePreference,
  type HomeModuleId,
  type HomeModuleSize
} from "../home-layout";
import {
  buildCaptionExcerpt,
  getHistoryHomePreviewRule,
  getHistoryNotifications
} from "../history-view";

export type RailSection = "home" | "manage" | "news" | "topics" | "history" | "ledger" | "todo";
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
  { key: "history", label: "历史知识", stamp: "04", to: "/history", moduleId: "history" },
  { key: "ledger", label: "记账", stamp: "05", to: "/ledger", moduleId: "ledger" },
  { key: "todo", label: "待办", stamp: "06", to: "/todo", moduleId: "todo" }
];

const weekdayMap = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const moduleDefinitionsById = new Map<HomeModuleId, (typeof HOME_MODULE_DEFINITIONS)[number]>(
  HOME_MODULE_DEFINITIONS.map((definition) => [definition.id, definition])
);
const newsCategoryFilters: Array<[NewsFilter, string]> = [
  ["all", "全部"],
  ["ai-models", "模型"],
  ["ai-products", "产品"],
  ["industry", "行业"],
  ["paper", "论文"],
  ["tip", "技巧"]
];

function syncStoredHomeLayout(layout: readonly HomeModulePreference[]) {
  persistHomeLayout(layout);
}

function getModuleDisplayName(
  id: HomeModuleId,
  layout: readonly HomeModulePreference[]
) {
  const preference = layout.find((item) => item.id === id);

  if (preference && Object.prototype.hasOwnProperty.call(preference, "customName")) {
    return preference.customName ?? "";
  }

  return getModuleDefinition(id).label;
}

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

function getModuleFrameStyle(size: HomeModuleSize, collapsed: boolean) {
  const geometry = getHomeModuleGeometry(size, collapsed);
  const previewSize = getHomeModulePreviewSize(size, collapsed);

  return {
    "--home-module-columns": String(geometry.columns),
    "--home-module-rows": String(geometry.rows),
    "--home-module-preview-width": `${previewSize.width}px`,
    "--home-module-preview-height": `${previewSize.height}px`
  } as CSSProperties;
}

function getModuleSummary(id: HomeModuleId, dashboard: DashboardData) {
  if (id === "news") {
    return `${formatShortCount(dashboard.news.feed.items.length)} 条热点`;
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

  if (id === "history") {
    const historyCount = dashboard.notifications.filter((item) => item.kind === "history-post" && item.payload).length;
    return `${formatShortCount(historyCount)} 条知识卡`;
  }

  return "待接入";
}

export function useHomeLayoutPreferences() {
  const queryClient = useQueryClient();
  const layoutQuery = useQuery({
    queryKey: ["home-layout"],
    queryFn: fetchHomeLayout,
    initialData: () => loadHomeLayout()
  });
  const saveMutation = useMutation({
    mutationFn: saveHomeLayout,
    onSuccess: (nextLayout) => {
      syncStoredHomeLayout(nextLayout);
      queryClient.setQueryData(["home-layout"], nextLayout);
      queryClient.setQueryData(["dashboard"], (current: DashboardData | undefined) =>
        current
          ? {
              ...current,
              homeLayout: nextLayout
            }
          : current
      );
    }
  });
  const layout = layoutQuery.data ?? getDefaultHomeLayout();

  useEffect(() => {
    syncStoredHomeLayout(layout);
  }, [layout]);

  function commitLayout(nextLayout: HomeModulePreference[]) {
    syncStoredHomeLayout(nextLayout);
    queryClient.setQueryData(["home-layout"], nextLayout);
    queryClient.setQueryData(["dashboard"], (current: DashboardData | undefined) =>
      current
        ? {
            ...current,
            homeLayout: nextLayout
          }
        : current
    );
    saveMutation.mutate(nextLayout);
  }

  function applyLayoutUpdate(updater: (current: HomeModulePreference[]) => HomeModulePreference[]) {
    commitLayout(updater(layout));
  }

  return {
    layout,
    updateModule: (
      id: HomeModuleId,
      patch: Partial<
        Pick<HomeModulePreference, "visible" | "showInNavigation" | "size" | "collapsed" | "customName">
      >
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
      commitLayout(next);
    }
  };
}

function useBackgroundGalleryPreferences() {
  const [gallery, setGallery] = useState<StoredBackgroundImageRecord[]>([]);
  const [galleryView, setGalleryView] = useState<BackgroundImageViewRecord[]>([]);
  const [activeBackgroundId, setActiveBackgroundId] = useState<string | null>(() => getActiveBackgroundId());
  const [backgroundVisible, setBackgroundVisible] = useState<boolean>(() => getBackgroundVisibility());
  const objectUrlsRef = useRef(new Map<string, string>());
  const selectedBackground = galleryView.find((item) => item.id === activeBackgroundId) ?? null;
  const activeBackground = backgroundVisible ? selectedBackground : null;

  useEffect(() => {
    let cancelled = false;

    async function loadGallery() {
      try {
        const storedGallery = await migrateLegacyBackgroundGallery();

        if (cancelled) {
          return;
        }

        setGallery(storedGallery);

        if (activeBackgroundId && !storedGallery.some((item) => item.id === activeBackgroundId)) {
          setActiveBackgroundId(null);
          persistActiveBackgroundId(null);
        }
      } catch {
        if (!cancelled) {
          setGallery([]);
        }
      }
    }

    void loadGallery();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nextObjectUrls = new Map<string, string>();

    gallery.forEach((item) => {
      nextObjectUrls.set(item.id, objectUrlsRef.current.get(item.id) ?? URL.createObjectURL(item.blob));
    });

    objectUrlsRef.current.forEach((url, id) => {
      if (!nextObjectUrls.has(id)) {
        URL.revokeObjectURL(url);
      }
    });

    objectUrlsRef.current = nextObjectUrls;
    setGalleryView(
      gallery.map((item) => ({
        id: item.id,
        name: item.name,
        createdAt: item.createdAt,
        src: nextObjectUrls.get(item.id) ?? ""
      }))
    );
  }, [gallery]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      objectUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    applyBackgroundSelection(selectedBackground, backgroundVisible);
  }, [selectedBackground, backgroundVisible]);

  async function refreshGallery() {
    const storedGallery = await listBackgroundGallery();

    setGallery(storedGallery);

    if (activeBackgroundId && !storedGallery.some((item) => item.id === activeBackgroundId)) {
      setActiveBackgroundId(null);
      persistActiveBackgroundId(null);
    }
  }

  return {
    gallery: galleryView,
    activeBackground,
    activeBackgroundId,
    backgroundVisible,
    setActiveBackground: (backgroundId: string | null) => {
      setActiveBackgroundId(backgroundId);
      persistActiveBackgroundId(backgroundId);
    },
    setBackgroundVisible: (visible: boolean) => {
      setBackgroundVisible(visible);
      persistBackgroundVisibility(visible);
    },
    addBackground: async (background: StoredBackgroundImageRecord) => {
      await saveBackgroundImage(background);
      await refreshGallery();
      setActiveBackgroundId(background.id);
      persistActiveBackgroundId(background.id);
      setBackgroundVisible(true);
      persistBackgroundVisibility(true);
    },
    removeBackground: async (backgroundId: string) => {
      await deleteBackgroundImage(backgroundId);
      await refreshGallery();

      if (activeBackgroundId === backgroundId) {
        setActiveBackgroundId(null);
        persistActiveBackgroundId(null);
      }
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
  const [dateTimePart, weekdayPart] = clockLine.split(" · ");
  const timeLabel = dateTimePart?.slice(11, 16) ?? clockLine;
  const dateLabel = [dateTimePart?.slice(5, 10), weekdayPart].filter(Boolean).join(" ");
  const navigationPreferences = navigationLayout ?? loadHomeLayout();
  const shownNavigationIds = new Set(
    navigationPreferences.filter((item) => item.showInNavigation).map((item) => item.id)
  );
  const visibleRailItems = railItems.filter((item) => !item.moduleId || shownNavigationIds.has(item.moduleId));

  return (
    <header className={`command-rail${showNavigation ? "" : " command-rail--compact"}${expanded ? " is-expanded" : ""}`}>
      {showNavigation ? (
        <nav className="command-rail__nav" aria-label="主导航">
          {visibleRailItems.map((item) => {
            const active = activeSection === item.key;
            const label = item.moduleId ? getModuleDisplayName(item.moduleId, navigationPreferences) : item.label;

            return (
              <Link
                key={item.key}
                className={`command-link${active ? " is-active" : ""}${expanded || active ? "" : " is-hidden"}`}
                to={item.to}
              >
                <strong>{label}</strong>
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
        <div className="theme-switcher theme-switcher--inline" role="group" aria-label="切换主题">
          {themeOptions.map((theme) => (
            <button
              key={theme.key}
              type="button"
              className={`theme-switcher__button theme-switcher__button--${theme.key}${
                themeKey === theme.key ? " is-active" : ""
              }`}
              aria-label={theme.label}
              aria-pressed={themeKey === theme.key}
              onClick={() => {
                if (isThemeKey(theme.key)) {
                  onThemeChange(theme.key);
                }
              }}
            >
              <span className="theme-switcher__icon" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

export function NewsPanel({
  items,
  updatedAt,
  size,
  filter,
  onFilterChange,
  onRefresh,
  isRefreshing,
  refreshError
}: {
  items: NewsFeedItem[];
  updatedAt: string | null;
  size: HomeModuleSize;
  filter: NewsFilter;
  onFilterChange: (next: NewsFilter) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  refreshError: string | null;
}) {
  const filteredItems = items.filter((item) => filter === "all" || item.category === filter);
  const visibleItemsBySize: Record<HomeModuleSize, number> = {
    max: 7,
    large: 5,
    medium: 4,
    smaller: 3,
    small: 2
  };
  const showFilters = size === "max" || size === "large" || size === "medium";
  const showSummary = size === "max" || size === "large" || size === "smaller";
  const showTags = size === "max" || size === "large";
  const showDate = size === "max" || size === "large";
  const timelineItems = filteredItems.slice(0, visibleItemsBySize[size]);
  const dateLabel = timelineItems[0]
    ? new Date(timelineItems[0].publishedAt).toLocaleDateString("zh-CN", {
        month: "long",
        day: "numeric"
      })
    : "等待刷新";

  return (
    <aside className={`edge-panel edge-panel--news edge-panel--ops news-panel news-panel--${size}`}>
      <div className="edge-panel__header">
        <div>
          <p className="eyebrow">AI HOT Feed</p>
          <h2>AI 热点</h2>
        </div>
        <div className="edge-panel__actions">
          <button
            type="button"
            className="history-panel__generate"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="立即更新 AI 热点"
          >
            {isRefreshing ? "更新中..." : "立即更新"}
          </button>
          <span className="panel-stamp">{updatedAt ? `刷新 ${formatTime(updatedAt)}` : "等待刷新"}</span>
        </div>
      </div>

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
        {timelineItems.length > 0 ? (
          <div className={`news-mini-timeline news-mini-timeline--${size}`}>
            {showDate ? <div className="news-mini-timeline__date">{dateLabel}</div> : null}
            {timelineItems.map((item) => (
              <Link key={item.id} to="/news" className="news-mini-timeline__item">
                <time>{formatTime(item.publishedAt)}</time>
                <span className="news-mini-timeline__dot" aria-hidden="true" />
                <div className="news-mini-timeline__card">
                  <div className="intel-item__head">
                    <span className="intel-source">{item.source}</span>
                    <span className="intel-time">{formatTime(item.publishedAt)}</span>
                  </div>
                  <h3>{item.title}</h3>
                  {showSummary ? <p>{item.summary}</p> : null}
                  {showTags ? (
                    <div className="news-mini-timeline__tags">
                      <span>{newsCategoryFilters.find(([value]) => value === item.category)?.[1] ?? item.category}</span>
                    </div>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="edge-empty">当前筛选下没有热点摘要。</div>
        )}
      </div>
      <div className="ops-panel-footer">
        <span>{filteredItems.length} 条 AI HOT</span>
        <img src={homeImageAssets.iconMore} alt="" aria-hidden="true" />
      </div>
      {refreshError ? <div className="news-inline-error">错误：{refreshError}</div> : null}
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
  dashboard,
  size
}: {
  dashboard: DashboardData;
  size: HomeModuleSize;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [lastReply, setLastReply] = useState<string | null>(null);
  const summary = dashboard.ledger.summary;
  const coach = dashboard.ledger.dashboard;
  const todayIncome = coach.todayIncomeCents / 100 || summary.todayIncome;
  const todayExpense = coach.todayExpenseCents / 100 || summary.todayExpense;
  const rolling7dNet = coach.rolling7dNetCents / 100;
  const coachTip = coach.coachTip ?? "记录几笔后，AI 会开始提醒你的消费变化和经营投入效果。";
  const compact = size === "small" || size === "smaller";
  const inputOnly = size === "small";
  const ledgerMutation = useMutation({
    mutationFn: recordLedger,
    onSuccess: (response) => {
      setInput("");
      setLastReply(response.message.content);
      void queryClient.invalidateQueries({
        queryKey: ["dashboard"]
      });
    }
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();

    if (message.length === 0 || ledgerMutation.isPending) {
      return;
    }

    ledgerMutation.mutate(message);
  };

  return (
    <section className={`ledger-panel ledger-panel--${size}`}>
      <div className="ledger-panel__header">
        <div>
          <p className="eyebrow">AI Ledger</p>
          <h2>一句话记账</h2>
        </div>
        <Link to="/ledger" className="panel-link">
          时间轴
        </Link>
      </div>
      <form className="ledger-panel__composer" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={compact ? "昨天火锅 280" : "昨天和老婆吃火锅花了 280"}
          aria-label="自然语言记账"
        />
        <button type="submit" disabled={ledgerMutation.isPending || input.trim().length === 0}>
          {ledgerMutation.isPending ? "记录中" : "记录"}
        </button>
      </form>
      {!inputOnly ? (
        <div className="ledger-panel__metrics">
          <div>
            <span>今日支出</span>
            <strong>{formatAmount(todayExpense)}</strong>
          </div>
          <div>
            <span>今日收入</span>
            <strong>{formatAmount(todayIncome)}</strong>
          </div>
          <div>
            <span>近 7 日</span>
            <strong>{formatAmount(rolling7dNet)}</strong>
          </div>
        </div>
      ) : null}
      {ledgerMutation.isError ? (
        <p className="ledger-panel__error">
          {ledgerMutation.error instanceof Error ? ledgerMutation.error.message : "记录失败"}
        </p>
      ) : null}
      {lastReply && !inputOnly ? <p className="ledger-panel__reply">{lastReply}</p> : null}
      {!compact ? (
        <div className="ledger-panel__coach">
          <span>教练提示</span>
          <p>{coachTip}</p>
        </div>
      ) : null}
      {!compact && coach.recentFacts.length > 0 ? (
        <div className="ledger-panel__recent" aria-label="最近记账">
          {coach.recentFacts.slice(0, 2).map((fact) => (
            <span key={fact.id}>
              {fact.direction === "income" ? "收入" : "支出"} {formatAmount(fact.amountCents / 100)}
              {" · "}
              {fact.summary}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TopicPanel({
  buckets,
  generatedAt,
  size
}: {
  buckets: DashboardData["topics"]["currentByDimension"];
  generatedAt: string | null;
  size: HomeModuleSize;
}) {
  const safeBuckets = buckets ?? [];
  const leadBucket = safeBuckets[0];
  const lead = leadBucket?.items[0] ?? null;
  const compact = size === "small";
  const narrow = size === "small" || size === "smaller";
  const showSummary = size !== "small";
  const visibleBuckets =
    size === "max"
      ? safeBuckets.slice(0, 3)
      : size === "large"
        ? safeBuckets.slice(0, 2)
        : size === "medium"
          ? safeBuckets.slice(0, 2)
          : safeBuckets.slice(0, 1);

  return (
    <Link to="/topics" className={`topic-module topic-module--${size}`}>
      <div className="topic-module__header">
        <div>
          <p className="eyebrow">Topic Direction</p>
          <h2>选题</h2>
        </div>
        <span>{generatedAt ? `手动生成 ${formatTime(generatedAt)}` : "等待生成"}</span>
      </div>
      {lead ? (
        <div className="topic-module__hero">
          <div className="topic-module__hero-copy">
            <span>{leadBucket?.label ?? "技术"}</span>
            <strong>{lead.title}</strong>
            {showSummary ? <p>{lead.hook}</p> : null}
          </div>
          {!narrow ? (
            <div className="topic-module__hero-meta">
              <small>{safeBuckets.length} 个方向</small>
              <b>{lead.score}</b>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="edge-empty">还没有选题推送。</div>
      )}
      <div className="topic-module__bands">
        {visibleBuckets.map((bucket) => (
          <section key={bucket.dimensionId} className="topic-module__band">
            <div className="topic-module__band-head">
              <strong>{bucket.label}</strong>
              {!compact ? <span>{bucket.description}</span> : null}
            </div>
            <div className="topic-module__band-list">
              {bucket.items.slice(0, 1).map((item) => (
                <article key={item.id} className="topic-module__band-item">
                  <em>{item.score}</em>
                  <div>
                    <h3>{item.title}</h3>
                    {!compact ? <p>{item.contentDirection}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Link>
  );
}

function HistoryPanel({
  notifications,
  size
}: {
  notifications: NotificationRecord[];
  size: HomeModuleSize;
}) {
  const queryClient = useQueryClient();
  const historyNotifications = getHistoryNotifications(notifications);
  const latestNotification = historyNotifications[0];
  const latestPayload = latestNotification?.payload;
  const rule = getHistoryHomePreviewRule(size);
  const cards = latestPayload?.cards.slice(0, rule.visibleCards) ?? [];
  const countLabel = latestPayload ? `${latestPayload.cardCount} 张图文` : "等待推送";
  const archiveCount = historyNotifications.length;
  const canGenerateInline = size === "max" || size === "large" || size === "medium";
  const historyGenerateMutation = useMutation({
    mutationFn: () => generateHistory("manual"),
    onSuccess: (dashboard) => {
      console.info("[history-panel] generate:onSuccess", {
        notifications: dashboard.notifications.length
      });
      queryClient.setQueryData(["dashboard"], dashboard);
    },
    onError: (error) => {
      console.error("[history-panel] generate:onError", error);
    }
  });

  return (
    <article className={`history-panel history-panel--${size}`}>
      <div className="history-panel__rail" aria-hidden="true" />
      <div className="history-panel__header">
        <div>
          <p className="eyebrow">History Daily</p>
          <h2>历史知识</h2>
        </div>
        <div className="history-panel__actions">
          <span>{latestPayload ? `更新 ${formatTime(latestPayload.generatedAt)}` : "等待推送"}</span>
          {canGenerateInline ? (
            <button
              type="button"
              className="history-panel__generate"
              onClick={() => {
                console.info("[history-panel] generate:click");
                historyGenerateMutation.mutate();
              }}
              disabled={historyGenerateMutation.isPending}
            >
              {historyGenerateMutation.isPending ? "生成中..." : "主动生成"}
            </button>
          ) : null}
        </div>
      </div>
      <Link to="/history" className="history-panel__body-link">
        {latestNotification && latestPayload ? (
          <>
            <div className="history-panel__lead">
              <span className="history-panel__kicker">今日策展主题</span>
              <strong>{latestPayload.topic}</strong>
              {rule.showMetaLine ? (
                <p className="history-panel__meta">
                  <span>{countLabel}</span>
                  <span>{archiveCount} 条存档</span>
                </p>
              ) : null}
              {rule.showSummary ? <p className="history-panel__summary">{latestPayload.summary}</p> : null}
            </div>
            {rule.showStats ? (
              <div className="history-panel__stats">
                <div>
                  <span>主题存档</span>
                  <strong>{archiveCount}</strong>
                </div>
                <div>
                  <span>拆卡进度</span>
                  <strong>{latestPayload.cardCount}</strong>
                </div>
                <div>
                  <span>正文状态</span>
                  <strong>已生成</strong>
                </div>
              </div>
            ) : null}
            <div className="history-panel__list">
              {cards.map((card, index) => (
                <div key={`${latestNotification.id}-${card.title}`} className="history-panel__item">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{card.title}</strong>
                    {size !== "small" ? <p>{card.imageText}</p> : null}
                    {rule.showPrompts ? <small>{card.prompt}</small> : null}
                  </div>
                </div>
              ))}
            </div>
            {rule.showCaption ? (
              <div className="history-panel__caption">
                <span>正文摘录</span>
                <p>{buildCaptionExcerpt(latestPayload.xiaohongshuCaption, size === "max" ? 140 : 96)}</p>
              </div>
            ) : null}
            {!rule.showMetaLine ? (
              <div className="history-panel__status">
                <span>{latestPayload ? `更新 ${formatTime(latestPayload.generatedAt)}` : "等待推送"}</span>
                <strong>{size === "small" ? "已生成" : `${archiveCount} 条存档`}</strong>
              </div>
            ) : null}
          </>
        ) : (
          <div className="edge-empty">还没有历史知识推送。</div>
        )}
      </Link>
      {historyGenerateMutation.isError ? (
        <div className="news-error">
          错误：
          {historyGenerateMutation.error instanceof Error
            ? historyGenerateMutation.error.message
            : "历史知识生成失败，请稍后重试。"}
        </div>
      ) : null}
    </article>
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
  const { layout } = useHomeLayoutPreferences();

  return (
    <main className="workspace">
      <CommandRail
        activeSection={section}
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
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
  title,
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
  title: string;
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
        <strong>{title}</strong>
      </div>
      <div className="home-module__body">
        {preference.collapsed ? (
          <div className="home-module__collapsed-content">
            <div>
              <strong>{title}</strong>
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
  title,
  summary,
  children,
  onToggleCollapsed
}: {
  preference: HomeModulePreference;
  title: string;
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
      title={title}
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
  size,
  onNewsRefresh,
  isNewsRefreshing,
  newsRefreshError
}: {
  id: HomeModuleId;
  dashboard: DashboardData;
  newsFilter: NewsFilter;
  onNewsFilterChange: (next: NewsFilter) => void;
  size: HomeModuleSize;
  onNewsRefresh: () => void;
  isNewsRefreshing: boolean;
  newsRefreshError: string | null;
}) {
  if (id === "news") {
    return (
      <NewsPanel
        items={dashboard.news.feed.items}
        updatedAt={dashboard.news.lastUpdatedAt}
        size={size}
        filter={newsFilter}
        onFilterChange={onNewsFilterChange}
        onRefresh={onNewsRefresh}
        isRefreshing={isNewsRefreshing}
        refreshError={newsRefreshError}
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
    return <LedgerPanel dashboard={dashboard} size={size} />;
  }

  if (id === "topics") {
    return (
      <TopicPanel
        buckets={dashboard.topics.currentByDimension}
        generatedAt={dashboard.topics.lastGeneratedAt}
        size={size}
      />
    );
  }

  if (id === "history") {
    return <HistoryPanel notifications={dashboard.notifications} size={size} />;
  }

  return <div className="edge-empty">模块已注册，内容组件待接入。</div>;
}

function ManageModuleCard({
  preference,
  displayName,
  onVisibleChange,
  onNavigationChange,
  onSizeChange,
  onNameChange
}: {
  preference: HomeModulePreference;
  displayName: string;
  onVisibleChange: (visible: boolean) => void;
  onNavigationChange: (visible: boolean) => void;
  onSizeChange: (size: HomeModuleSize) => void;
  onNameChange: (name: string) => void;
}) {
  const definition = getModuleDefinition(preference.id);
  const supportsNavigation = canShowHomeModuleInNavigation(preference.id);

  return (
    <article className="manage-card manage-card--module">
      <div className="manage-card__header">
        <span className="manage-card__index">{String(preference.order + 1).padStart(2, "0")}</span>
        <div>
          <h3>{displayName}</h3>
          <p>{definition.description}</p>
        </div>
      </div>

      <div className="manage-card__controls">
        <label className="manage-field manage-field--toggle">
          <span>首页展示</span>
          <input
            type="checkbox"
            checked={preference.visible}
            onChange={(event) => onVisibleChange(event.target.checked)}
          />
        </label>

        <label className={`manage-field manage-field--toggle${supportsNavigation ? "" : " is-disabled"}`}>
          <span>顶部导航</span>
          <input
            type="checkbox"
            checked={supportsNavigation && preference.showInNavigation}
            disabled={!supportsNavigation}
            onChange={(event) => onNavigationChange(event.target.checked)}
          />
        </label>

        <label className="manage-field">
          <span>模块名称</span>
          <input
            type="text"
            value={displayName}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </label>

        <label className="manage-field">
          <span>模块尺寸</span>
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
      </div>

      <div className="manage-card__meta">
        <span>{preference.visible ? "已启用" : "已隐藏"}</span>
        <span>
          {supportsNavigation
            ? preference.showInNavigation
              ? "导航可见"
              : "仅首页可见"
            : "导航未接入"}
        </span>
      </div>
    </article>
  );
}

export function HomeManagePage() {
  const [railExpanded, setRailExpanded] = useState(true);
  const [themeKey, setThemeKey] = useThemePreference();
  const clockLine = useLiveClock();
  const { layout, updateModule, resetLayout } = useHomeLayoutPreferences();
  const {
    gallery,
    activeBackground,
    activeBackgroundId,
    backgroundVisible,
    setActiveBackground,
    setBackgroundVisible,
    addBackground,
    removeBackground
  } = useBackgroundGalleryPreferences();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [backgroundUploadError, setBackgroundUploadError] = useState<string | null>(null);
  const visibleCount = layout.filter((item) => item.visible).length;
  const navigationCount = layout.filter((item) => item.showInNavigation).length;
  const backgroundCount = gallery.length;

  async function handleBackgroundUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setBackgroundUploadError(null);

    try {
      await addBackground({
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : String(Date.now()),
        name: file.name,
        blob: file,
        createdAt: new Date().toISOString()
      });
      setBackgroundUploadError(null);
    } catch (error) {
      setBackgroundUploadError(error instanceof Error ? error.message : "背景图上传失败");
    }

    event.target.value = "";
  }

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
          { label: "nav", value: String(navigationCount) },
          { label: "bg", value: String(backgroundCount) }
        ]}
      />

      <section className="manage-shell">
        <div className="manage-shell__header">
          <div>
            <p className="eyebrow">Control Center</p>
            <h1>管理配置中心</h1>
            <p>按模块拆分首页编排与视觉背景，便于继续增加新的配置项，同时保持信息清晰和操作直接。</p>
          </div>
          <div className="manage-shell__actions">
            <button type="button" onClick={resetLayout}>
              重置首页布局
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveBackground(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
            >
              清空背景图
            </button>
          </div>
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
          <div>
            <span>背景历史</span>
            <strong>{backgroundCount}</strong>
          </div>
        </div>

        <div className="manage-groups">
          <section className="manage-group" aria-labelledby="manage-home-layout-heading">
            <div className="manage-group__header">
              <div>
                <p className="eyebrow">Home Layout</p>
                <h2 id="manage-home-layout-heading">首页编排</h2>
                <p>每个模块独立成卡片，统一处理显示、导航和尺寸，后续新增模块也会自然接入这里。</p>
              </div>
            </div>

            <div className="manage-card-grid manage-card-grid--modules">
              {layout.map((preference) => (
                <ManageModuleCard
                  key={preference.id}
                  preference={preference}
                  displayName={getModuleDisplayName(preference.id, layout)}
                  onVisibleChange={(visible) => updateModule(preference.id, { visible })}
                  onNavigationChange={(showInNavigation) =>
                    updateModule(preference.id, { showInNavigation })
                  }
                  onSizeChange={(size) => updateModule(preference.id, { size })}
                  onNameChange={(customName) => updateModule(preference.id, { customName })}
                />
              ))}
            </div>
          </section>

          <section className="manage-group" aria-labelledby="manage-visual-heading">
            <div className="manage-group__header">
              <div>
                <p className="eyebrow">Visual Backgrounds</p>
                <h2 id="manage-visual-heading">视觉背景</h2>
                <p>背景图只保存在当前浏览器本地。上传后会立即应用到项目背景，也可以从历史中重新切换或删除。</p>
              </div>
            </div>

            <div className="manage-card-grid manage-card-grid--visual">
              <article className="manage-card manage-card--theme">
                <div className="manage-card__header">
                  <div>
                    <h3>主题基底</h3>
                    <p>颜色主题与背景图分层控制，保留当前 `day / night` 两套基底。</p>
                  </div>
                </div>

                <div className="theme-switcher" role="group" aria-label="切换主题">
                  {themeOptions.map((theme) => (
                    <button
                      key={theme.key}
                      type="button"
                      className={`theme-switcher__button theme-switcher__button--${theme.key}${
                        themeKey === theme.key ? " is-active" : ""
                      }`}
                      aria-label={theme.label}
                      aria-pressed={themeKey === theme.key}
                      onClick={() => {
                        if (isThemeKey(theme.key)) {
                          setThemeKey(theme.key);
                        }
                      }}
                    >
                      <span className="theme-switcher__icon" />
                      <span className="theme-switcher__label">{theme.label}</span>
                    </button>
                  ))}
                </div>

                <div className="manage-card__meta">
                  <span>当前主题：{themeOptions.find((item) => item.key === themeKey)?.label ?? themeKey}</span>
                  <span>
                    {activeBackground
                      ? "背景图已覆盖"
                      : activeBackgroundId && !backgroundVisible
                        ? "背景图已隐藏"
                        : "使用系统默认背景"}
                  </span>
                </div>
              </article>

              <article className="manage-card manage-card--background-workspace">
                <div className="manage-card__header">
                  <div>
                    <h3>背景工作台</h3>
                    <p>当前背景、上传入口和历史切换放在同一处，减少视线来回跳转。</p>
                  </div>
                </div>

                <div className="background-workspace">
                  <div
                    className={`background-stage${activeBackground ? " has-image" : ""}`}
                    style={
                      activeBackground
                        ? { backgroundImage: `url("${activeBackground.src}")` }
                        : undefined
                    }
                  >
                    <div>
                      <span className="background-stage__eyebrow">当前背景</span>
                      <strong>
                        {activeBackground
                          ? activeBackground.name
                          : activeBackgroundId && !backgroundVisible
                            ? "背景图已隐藏"
                            : "未设置自定义背景"}
                      </strong>
                      <p>
                        {activeBackground
                          ? `最近启用：${formatDateTime(activeBackground.createdAt)}`
                          : activeBackgroundId && !backgroundVisible
                            ? "当前已保留所选背景图，但工作台和管理页都不会展示。"
                            : "上传一张背景图后会立即覆盖当前项目背景。"}
                      </p>
                    </div>
                  </div>

                  <div className="background-controls">
                    <div className="background-controls__section">
                      <span className="background-controls__label">上传背景图</span>
                      <p>支持直接替换当前背景，原图仅保存在本地浏览器。</p>
                      <div className="manage-upload">
                        <input
                          ref={fileInputRef}
                          className="manage-upload__input"
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            void handleBackgroundUpload(event);
                          }}
                        />
                        <button type="button" onClick={() => fileInputRef.current?.click()}>
                          选择图片
                        </button>
                        <span>不压缩原图</span>
                      </div>
                      {backgroundUploadError ? <p className="manage-upload__error">{backgroundUploadError}</p> : null}
                    </div>

                    <div className="background-controls__section background-controls__section--meta">
                      <span className="background-controls__label">当前状态</span>
                      <div className="background-meta-list">
                        <span>{backgroundCount > 0 ? `已保存 ${backgroundCount} 张背景` : "还没有背景历史"}</span>
                        <span>
                          {activeBackground
                            ? "当前背景已启用"
                            : activeBackgroundId && !backgroundVisible
                              ? "当前背景已隐藏"
                              : "正在使用系统默认背景"}
                        </span>
                      </div>
                      <label className="manage-field manage-field--toggle background-visibility-toggle">
                        <span>隐藏背景图</span>
                        <input
                          type="checkbox"
                          checked={!backgroundVisible}
                          onChange={(event) => setBackgroundVisible(!event.target.checked)}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="background-history-shell">
                  <div className="background-history-shell__header">
                    <div>
                      <h4>背景历史</h4>
                      <p>保留最近上传过的背景图，支持重新设为当前或直接删除。</p>
                    </div>
                  </div>

                  {gallery.length === 0 ? (
                    <div className="manage-empty-state">还没有背景历史，先上传一张图片。</div>
                  ) : (
                    <div className="background-history">
                      {gallery.map((background) => (
                        <article
                          key={background.id}
                          className={`background-history__item${
                            activeBackgroundId === background.id ? " is-active" : ""
                          }`}
                        >
                          <div
                            className="background-history__thumb"
                            style={{ backgroundImage: `url("${background.src}")` }}
                          />
                          <div className="background-history__body">
                            <strong>{background.name}</strong>
                            <p>{formatDateTime(background.createdAt)}</p>
                          </div>
                          <div className="background-history__actions">
                            <button
                              type="button"
                              disabled={activeBackgroundId === background.id}
                              onClick={() => setActiveBackground(background.id)}
                            >
                              {activeBackgroundId === background.id ? "当前选择" : "设为当前"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void removeBackground(background.id);
                              }}
                            >
                              删除
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            </div>
          </section>
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
  useBackgroundGalleryPreferences();
  const { activeId, sensors, handleDragStart, handleDragEnd, handleDragCancel } = useSortableModuleDnd(moveModule);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard
  });
  const newsRefreshMutation = useMutation({
    mutationFn: () => refreshNews({ reason: "manual" }),
    onSuccess: (news) => {
      queryClient.setQueryData(["dashboard"], (current: DashboardData | undefined) =>
        current
          ? {
              ...current,
              news
            }
          : current
      );
    }
  });

  useEffect(() => {
    return openDashboardStream((data) => {
      syncStoredHomeLayout(data.homeLayout);
      queryClient.setQueryData(["home-layout"], data.homeLayout);
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
                  title={getModuleDisplayName(preference.id, layout)}
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
                    size: preference.size,
                    onNewsRefresh: () => newsRefreshMutation.mutate(),
                    isNewsRefreshing: newsRefreshMutation.isPending,
                    newsRefreshError:
                      newsRefreshMutation.isError && newsRefreshMutation.error instanceof Error
                        ? newsRefreshMutation.error.message
                        : newsRefreshMutation.isError
                          ? "热点更新失败，请稍后重试。"
                          : null
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
              title={getModuleDisplayName(activePreference.id, layout)}
              summary={getModuleSummary(activePreference.id, dashboard)}
              onToggleCollapsed={() => undefined}
              preview
            >
              {renderHomeModuleContent({
                id: activePreference.id,
                dashboard,
                newsFilter,
                onNewsFilterChange: setNewsFilter,
                size: activePreference.size,
                onNewsRefresh: () => newsRefreshMutation.mutate(),
                isNewsRefreshing: newsRefreshMutation.isPending,
                newsRefreshError:
                  newsRefreshMutation.isError && newsRefreshMutation.error instanceof Error
                    ? newsRefreshMutation.error.message
                    : newsRefreshMutation.isError
                      ? "热点更新失败，请稍后重试。"
                      : null
              })}
            </HomeModuleShell>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}
