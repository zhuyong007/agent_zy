import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { DashboardData, ScheduleItem, ScheduleUrgency } from "@agent-zy/shared-types";

import { fetchDashboard, openDashboardStream } from "../api";
import type { HomeModuleSize } from "../home-layout";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";
import {
  EMPTY_TODO_WORKSPACE_STATE,
  applyTodoWorkspaceState,
  buildTodoWorkspaceSnapshot,
  estimateScheduleItemMinutes,
  formatTodoDateLabel,
  toDateKey,
  type TodoMetric,
  type TodoWorkspaceState
} from "./todo-utils";

const TODO_WORKSPACE_STORAGE_KEY = "agent-zy-todo-workspace-v1";
const SIZE_FILTERS: Array<HomeModuleSize> = ["max", "large", "medium", "smaller", "small"];

function formatRuntimeStatus(status: DashboardData["recentTasks"][number]["status"]) {
  if (status === "queued") {
    return "待执行";
  }

  if (status === "running") {
    return "进行中";
  }

  if (status === "waiting_feedback") {
    return "阻塞";
  }

  if (status === "completed") {
    return "已完成";
  }

  return "失败";
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

function readTodoWorkspaceState() {
  if (typeof window === "undefined") {
    return EMPTY_TODO_WORKSPACE_STATE;
  }

  try {
    const raw = window.localStorage.getItem(TODO_WORKSPACE_STORAGE_KEY);

    if (!raw) {
      return EMPTY_TODO_WORKSPACE_STATE;
    }

    const parsed = JSON.parse(raw) as Partial<TodoWorkspaceState>;

    return {
      addedItems: Array.isArray(parsed.addedItems) ? parsed.addedItems : [],
      statusOverrides:
        parsed.statusOverrides && typeof parsed.statusOverrides === "object" ? parsed.statusOverrides : {}
    };
  } catch {
    return EMPTY_TODO_WORKSPACE_STATE;
  }
}

function persistTodoWorkspaceState(state: TodoWorkspaceState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TODO_WORKSPACE_STORAGE_KEY, JSON.stringify(state));
}

function getMetricValue(metrics: TodoMetric[], id: TodoMetric["id"]) {
  return metrics.find((item) => item.id === id)?.value ?? "--";
}

function getUrgencyLabel(urgency: ScheduleUrgency) {
  if (urgency === "high") {
    return "高优先";
  }

  if (urgency === "medium") {
    return "中优先";
  }

  return "低优先";
}

function getFilteredSize(size: HomeModuleSize) {
  return SIZE_FILTERS.includes(size) ? size : "smaller";
}

export function useTodoWorkspaceDashboard(baseDashboard?: DashboardData) {
  const [workspace, setWorkspace] = useState<TodoWorkspaceState>(() => readTodoWorkspaceState());

  useEffect(() => {
    persistTodoWorkspaceState(workspace);
  }, [workspace]);

  const dashboard = useMemo(
    () => (baseDashboard ? applyTodoWorkspaceState(baseDashboard, workspace) : undefined),
    [baseDashboard, workspace]
  );

  return {
    dashboard,
    addItem: (input: { date: string; title: string; urgency: ScheduleUrgency; suggestedWindow: string }) => {
      const trimmedTitle = input.title.trim();

      if (trimmedTitle.length === 0) {
        return;
      }

      setWorkspace((current) => ({
        ...current,
        addedItems: [
          ...current.addedItems,
          {
            id: `local_schedule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            title: trimmedTitle,
            date: input.date,
            urgency: input.urgency,
            suggestedWindow: input.suggestedWindow.trim() || "待安排",
            status: "pending"
          }
        ]
      }));
    },
    toggleItemStatus: (item: ScheduleItem) => {
      setWorkspace((current) => {
        const nextStatus = item.status === "done" ? "pending" : "done";
        const nextCompletedAt = nextStatus === "done" ? new Date().toISOString() : undefined;
        const localItemIndex = current.addedItems.findIndex((candidate) => candidate.id === item.id);

        if (localItemIndex >= 0) {
          const nextAddedItems = [...current.addedItems];
          nextAddedItems[localItemIndex] = {
            ...nextAddedItems[localItemIndex],
            status: nextStatus,
            completedAt: nextCompletedAt
          };

          return {
            ...current,
            addedItems: nextAddedItems
          };
        }

        return {
          ...current,
          statusOverrides: {
            ...current.statusOverrides,
            [item.id]: {
              status: nextStatus,
              completedAt: nextCompletedAt
            }
          }
        };
      });
    }
  };
}

export function getTodoModuleSummary(dashboard: DashboardData) {
  const pendingCount = dashboard.schedule.todayItems.filter((item) => item.status === "pending").length;
  return `${String(pendingCount).padStart(2, "0")} 项待处理`;
}

function TodoQuickCreate({
  selectedDate,
  onCreate
}: {
  selectedDate: string;
  onCreate: (input: { date: string; title: string; urgency: ScheduleUrgency; suggestedWindow: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [urgency, setUrgency] = useState<ScheduleUrgency>("medium");
  const [windowLabel, setWindowLabel] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (title.trim().length === 0) {
      return;
    }

    onCreate({
      date: selectedDate,
      title,
      urgency,
      suggestedWindow: windowLabel
    });
    setTitle("");
    setUrgency("medium");
    setWindowLabel("");
  };

  return (
    <form className="todo-quick-create" onSubmit={handleSubmit}>
      <div className="todo-quick-create__head">
        <div>
          <p className="eyebrow">Quick Add</p>
          <h3>为 {formatTodoDateLabel(selectedDate)} 补位</h3>
        </div>
      </div>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="例如：补写周报结论"
        aria-label="新任务标题"
      />
      <div className="todo-quick-create__row">
        <select value={urgency} onChange={(event) => setUrgency(event.target.value as ScheduleUrgency)}>
          <option value="high">高优先</option>
          <option value="medium">中优先</option>
          <option value="low">低优先</option>
        </select>
        <input
          value={windowLabel}
          onChange={(event) => setWindowLabel(event.target.value)}
          placeholder="14:00-15:00"
          aria-label="建议时间窗"
        />
      </div>
      <button type="submit" disabled={title.trim().length === 0}>
        加入作战表
      </button>
    </form>
  );
}

function TodoMetricButton({
  metric,
  active,
  onSelect
}: {
  metric: TodoMetric;
  active: boolean;
  onSelect: (filter: TodoMetric["filter"]) => void;
}) {
  return (
    <button
      type="button"
      className={`todo-metric-card todo-metric-card--${metric.accent ?? "default"}${active ? " is-active" : ""}`}
      onClick={() => onSelect(metric.filter)}
    >
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <small>{metric.hint}</small>
    </button>
  );
}

function TodoMiniTaskList({
  items,
  onToggleItem,
  limit,
  showWindow
}: {
  items: ScheduleItem[];
  onToggleItem: (item: ScheduleItem) => void;
  limit: number;
  showWindow?: boolean;
}) {
  const visibleItems = items.slice(0, limit);

  if (visibleItems.length === 0) {
    return <div className="edge-empty">当前筛选下没有任务。</div>;
  }

  return (
    <div className="todo-compact-list">
      {visibleItems.map((item) => (
        <article key={item.id} className={`todo-compact-item todo-compact-item--${item.status}`}>
          <button
            type="button"
            className={`todo-compact-item__check${item.status === "done" ? " is-done" : ""}`}
            onClick={() => onToggleItem(item)}
            aria-label={item.status === "done" ? "标记为未完成" : "标记为完成"}
          />
          <div>
            <strong>{item.title}</strong>
            <small>
              {getUrgencyLabel(item.urgency)}
              {showWindow ? ` · ${item.suggestedWindow}` : ""}
            </small>
          </div>
        </article>
      ))}
    </div>
  );
}

function TodoStatusBand({
  metrics,
  activeFilter,
  onSelect
}: {
  metrics: TodoMetric[];
  activeFilter: TodoMetric["filter"];
  onSelect: (filter: TodoMetric["filter"]) => void;
}) {
  const visibleMetrics = metrics.slice(0, 6);

  return (
    <section className="todo-status-band">
      {visibleMetrics.map((metric) => (
        <TodoMetricButton key={metric.id} metric={metric} active={activeFilter === metric.filter} onSelect={onSelect} />
      ))}
    </section>
  );
}

function TodoCalendarPanel({
  days,
  onSelectDate
}: {
  days: ReturnType<typeof buildTodoWorkspaceSnapshot>["calendarDays"];
  onSelectDate: (date: string) => void;
}) {
  return (
    <section className="todo-calendar-panel">
      <div className="todo-section-head">
        <div>
          <p className="eyebrow">Calendar Field</p>
          <h3>月历沙盘</h3>
        </div>
      </div>
      <div className="todo-calendar-weekdays">
        {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="todo-calendar-grid">
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            className={`todo-calendar-day${day.isCurrentMonth ? "" : " is-outside"}${day.isToday ? " is-today" : ""}${
              day.isSelected ? " is-selected" : ""
            }`}
            onClick={() => onSelectDate(day.date)}
          >
            <div className="todo-calendar-day__head">
              <span>{day.dayNumber}</span>
              {day.totalCount > 0 ? <small>{day.totalCount}</small> : null}
            </div>
            <div className="todo-calendar-day__markers">
              {day.totalCount > 0 ? <i className="is-normal" /> : null}
              {day.highCount > 0 ? <i className="is-high" /> : null}
              {day.overdueCount > 0 ? <i className="is-overdue" /> : null}
              {day.doneAll ? <i className="is-done" /> : null}
              {day.hasMilestone ? <i className="is-milestone" /> : null}
              {day.hasReminder ? <i className="is-reminder" /> : null}
              {day.hasRepeat ? <i className="is-repeat" /> : null}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function TodoRuntimePanel({
  tasks
}: {
  tasks: ReturnType<typeof buildTodoWorkspaceSnapshot>["selectedRuntimeTasks"];
}) {
  return (
    <section className="todo-runtime-panel">
      <div className="todo-section-head">
        <div>
          <p className="eyebrow">Runtime Watch</p>
          <h3>执行态观察席</h3>
        </div>
        <span>{tasks.length} 条</span>
      </div>
      {tasks.length > 0 ? (
        <div className="todo-runtime-list">
          {tasks.map((task) => (
            <article key={task.id} className={`todo-runtime-item todo-runtime-item--${task.status}`}>
              <div>
                <strong>{task.summary}</strong>
                <p>{task.agentId}</p>
              </div>
              <div>
                <span>{formatRuntimeStatus(task.status)}</span>
                <small>{formatTime(task.updatedAt)}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="edge-empty">当前没有执行态任务。</div>
      )}
    </section>
  );
}

function TodoRouteLayout({
  snapshot,
  activeFilter,
  onSelectFilter,
  onSelectDate,
  onToggleItem,
  onAddItem
}: {
  snapshot: ReturnType<typeof buildTodoWorkspaceSnapshot>;
  activeFilter: TodoMetric["filter"];
  onSelectFilter: (filter: TodoMetric["filter"]) => void;
  onSelectDate: (date: string) => void;
  onToggleItem: (item: ScheduleItem) => void;
  onAddItem: (input: { date: string; title: string; urgency: ScheduleUrgency; suggestedWindow: string }) => void;
}) {
  return (
    <section className="todo-command-deck">
      <header className="todo-command-deck__hero">
        <div className="todo-command-deck__copy">
          <p className="eyebrow">Mission Control</p>
          <h1>待办作战室</h1>
          <p>{snapshot.aiSummary}</p>
        </div>
        <div className="todo-command-deck__orbital">
          <div className="todo-orbit-ring">
            <span>{snapshot.monthLabel}</span>
            <strong>{getMetricValue(snapshot.metrics, "selectedPending")}</strong>
            <small>待推进</small>
          </div>
          <div className="todo-orbit-badges">
            <span>逾期 {getMetricValue(snapshot.metrics, "overdue")}</span>
            <span>高优先 {getMetricValue(snapshot.metrics, "highPriority")}</span>
            <span>阻塞 {getMetricValue(snapshot.metrics, "blocked")}</span>
          </div>
        </div>
      </header>

      <TodoStatusBand metrics={snapshot.metrics} activeFilter={activeFilter} onSelect={onSelectFilter} />

      <section className="todo-command-deck__main">
        <TodoCalendarPanel days={snapshot.calendarDays} onSelectDate={onSelectDate} />

        <section className="todo-ops-panel">
          <div className="todo-section-head">
            <div>
              <p className="eyebrow">Day Ops</p>
              <h3>{snapshot.activeDateLabel}</h3>
            </div>
            <span>{activeFilter === "all" ? "全量" : "已筛选"}</span>
          </div>

          <TodoQuickCreate selectedDate={snapshot.activeDate} onCreate={onAddItem} />

          <div className="todo-day-card__list">
            {snapshot.selectedItems.length > 0 ? (
              snapshot.selectedItems.map((item) => (
                <article key={item.id} className={`todo-day-item todo-day-item--${item.status}`}>
                  <button
                    type="button"
                    className={`todo-day-item__check${item.status === "done" ? " is-done" : ""}`}
                    onClick={() => onToggleItem(item)}
                    aria-label={item.status === "done" ? "标记为未完成" : "标记为完成"}
                  />
                  <div>
                    <div className="todo-day-item__title">
                      <h4>{item.title}</h4>
                      <span className={`todo-urgency todo-urgency--${item.urgency}`}>{getUrgencyLabel(item.urgency)}</span>
                    </div>
                    <p>
                      {item.suggestedWindow} · 预计 {estimateScheduleItemMinutes(item)} 分钟
                    </p>
                    <small>
                      {item.date < snapshot.today && item.status === "pending"
                        ? "逾期"
                        : item.status === "done"
                          ? "已完成"
                          : "待处理"}
                    </small>
                  </div>
                </article>
              ))
            ) : (
              <div className="edge-empty">当前筛选下，这一天没有待办。</div>
            )}
          </div>
        </section>
      </section>

      <TodoRuntimePanel tasks={snapshot.selectedRuntimeTasks} />
    </section>
  );
}

function TodoModuleSmall({
  snapshot
}: {
  snapshot: ReturnType<typeof buildTodoWorkspaceSnapshot>;
}) {
  return (
    <section className="todo-module-scene todo-module-scene--small">
      <div className="todo-scene-core">
        <p className="eyebrow">Live</p>
        <strong>{getMetricValue(snapshot.metrics, "selectedPending")}</strong>
        <span>今日待推进</span>
      </div>
      <p className="todo-scene-summary">{snapshot.aiSummary}</p>
      <div className="todo-chip-row">
        <span>逾期 {getMetricValue(snapshot.metrics, "overdue")}</span>
        <span>高优先 {getMetricValue(snapshot.metrics, "highPriority")}</span>
      </div>
      <Link to="/todo" className="todo-inline-link">
        进入作战室
      </Link>
    </section>
  );
}

function TodoModuleSmaller({
  snapshot,
  onToggleItem
}: {
  snapshot: ReturnType<typeof buildTodoWorkspaceSnapshot>;
  onToggleItem: (item: ScheduleItem) => void;
}) {
  return (
    <section className="todo-module-scene todo-module-scene--smaller">
      <header className="todo-scene-head">
        <div>
          <p className="eyebrow">Brief</p>
          <h3>{snapshot.activeDateLabel}</h3>
        </div>
        <strong>{getMetricValue(snapshot.metrics, "selectedPending")}</strong>
      </header>
      <p className="todo-scene-summary">{snapshot.aiSummary}</p>
      <div className="todo-mini-band">
        <span>已完成 {getMetricValue(snapshot.metrics, "selectedDone")}</span>
        <span>阻塞 {getMetricValue(snapshot.metrics, "blocked")}</span>
        <span>剩余 {getMetricValue(snapshot.metrics, "selectedRemaining")}</span>
      </div>
      <TodoMiniTaskList items={snapshot.selectedItems} onToggleItem={onToggleItem} limit={2} />
    </section>
  );
}

function TodoModuleMedium({
  snapshot,
  activeFilter,
  onSelectFilter,
  onToggleItem
}: {
  snapshot: ReturnType<typeof buildTodoWorkspaceSnapshot>;
  activeFilter: TodoMetric["filter"];
  onSelectFilter: (filter: TodoMetric["filter"]) => void;
  onToggleItem: (item: ScheduleItem) => void;
}) {
  const visibleMetrics = snapshot.metrics.filter((item) =>
    ["selectedPending", "selectedDone", "highPriority", "selectedRemaining"].includes(item.id)
  );

  return (
    <section className="todo-module-scene todo-module-scene--medium">
      <header className="todo-strip-head">
        <div>
          <p className="eyebrow">Command Strip</p>
          <h3>{snapshot.aiSummary}</h3>
        </div>
        <Link to="/todo" className="todo-inline-link">
          展开
        </Link>
      </header>
      <div className="todo-strip-metrics">
        {visibleMetrics.map((metric) => (
          <TodoMetricButton key={metric.id} metric={metric} active={activeFilter === metric.filter} onSelect={onSelectFilter} />
        ))}
      </div>
      <TodoMiniTaskList items={snapshot.selectedItems} onToggleItem={onToggleItem} limit={3} showWindow />
    </section>
  );
}

function TodoModuleLarge({
  snapshot,
  activeFilter,
  onSelectFilter,
  onSelectDate,
  onToggleItem
}: {
  snapshot: ReturnType<typeof buildTodoWorkspaceSnapshot>;
  activeFilter: TodoMetric["filter"];
  onSelectFilter: (filter: TodoMetric["filter"]) => void;
  onSelectDate: (date: string) => void;
  onToggleItem: (item: ScheduleItem) => void;
}) {
  const visibleMetrics = snapshot.metrics.filter((item) =>
    ["selectedPending", "overdue", "highPriority", "selectedRemaining"].includes(item.id)
  );
  const focusedDays = snapshot.calendarDays.filter((day) => day.isCurrentMonth).slice(0, 14);

  return (
    <section className="todo-module-scene todo-module-scene--large">
      <div className="todo-large-copy">
        <p className="eyebrow">Field Summary</p>
        <h3>{snapshot.aiSummary}</h3>
        <div className="todo-strip-metrics todo-strip-metrics--compact">
          {visibleMetrics.map((metric) => (
            <TodoMetricButton key={metric.id} metric={metric} active={activeFilter === metric.filter} onSelect={onSelectFilter} />
          ))}
        </div>
        <TodoMiniTaskList items={snapshot.selectedItems} onToggleItem={onToggleItem} limit={3} showWindow />
      </div>
      <div className="todo-large-map">
        <div className="todo-large-map__head">
          <span>{snapshot.monthLabel}</span>
          <strong>{snapshot.activeDateLabel}</strong>
        </div>
        <div className="todo-large-map__grid">
          {focusedDays.map((day) => (
            <button
              key={day.date}
              type="button"
              className={`todo-map-day${day.isSelected ? " is-selected" : ""}${day.isToday ? " is-today" : ""}`}
              onClick={() => onSelectDate(day.date)}
            >
              <span>{day.dayNumber}</span>
              <small>{day.totalCount}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function TodoModuleMax({
  snapshot,
  activeFilter,
  onSelectFilter,
  onSelectDate,
  onToggleItem
}: {
  snapshot: ReturnType<typeof buildTodoWorkspaceSnapshot>;
  activeFilter: TodoMetric["filter"];
  onSelectFilter: (filter: TodoMetric["filter"]) => void;
  onSelectDate: (date: string) => void;
  onToggleItem: (item: ScheduleItem) => void;
}) {
  return (
    <section className="todo-module-scene todo-module-scene--max">
      <header className="todo-scene-hero">
        <div>
          <p className="eyebrow">War Room</p>
          <h3>今天先把关键事项收口</h3>
          <p>{snapshot.aiSummary}</p>
        </div>
        <div className="todo-scene-hero__meta">
          <span>{snapshot.monthLabel}</span>
          <strong>{getMetricValue(snapshot.metrics, "selectedPending")}</strong>
          <small>待推进</small>
        </div>
      </header>
      <div className="todo-strip-metrics">
        {snapshot.metrics.slice(0, 6).map((metric) => (
          <TodoMetricButton key={metric.id} metric={metric} active={activeFilter === metric.filter} onSelect={onSelectFilter} />
        ))}
      </div>
      <div className="todo-scene-grid">
        <div className="todo-scene-grid__calendar">
          <TodoCalendarPanel days={snapshot.calendarDays} onSelectDate={onSelectDate} />
        </div>
        <div className="todo-scene-grid__tasks">
          <div className="todo-section-head">
            <div>
              <p className="eyebrow">Action List</p>
              <h3>{snapshot.activeDateLabel}</h3>
            </div>
            <Link to="/todo" className="todo-inline-link">
              全屏
            </Link>
          </div>
          <TodoMiniTaskList items={snapshot.selectedItems} onToggleItem={onToggleItem} limit={4} showWindow />
          <TodoRuntimePanel tasks={snapshot.selectedRuntimeTasks.slice(0, 2)} />
        </div>
      </div>
    </section>
  );
}

function TodoModuleLayout({
  size,
  snapshot,
  activeFilter,
  onSelectFilter,
  onSelectDate,
  onToggleItem
}: {
  size: HomeModuleSize;
  snapshot: ReturnType<typeof buildTodoWorkspaceSnapshot>;
  activeFilter: TodoMetric["filter"];
  onSelectFilter: (filter: TodoMetric["filter"]) => void;
  onSelectDate: (date: string) => void;
  onToggleItem: (item: ScheduleItem) => void;
}) {
  const normalizedSize = getFilteredSize(size);

  if (normalizedSize === "small") {
    return <TodoModuleSmall snapshot={snapshot} />;
  }

  if (normalizedSize === "smaller") {
    return <TodoModuleSmaller snapshot={snapshot} onToggleItem={onToggleItem} />;
  }

  if (normalizedSize === "medium") {
    return (
      <TodoModuleMedium
        snapshot={snapshot}
        activeFilter={activeFilter}
        onSelectFilter={onSelectFilter}
        onToggleItem={onToggleItem}
      />
    );
  }

  if (normalizedSize === "large") {
    return (
      <TodoModuleLarge
        snapshot={snapshot}
        activeFilter={activeFilter}
        onSelectFilter={onSelectFilter}
        onSelectDate={onSelectDate}
        onToggleItem={onToggleItem}
      />
    );
  }

  return (
    <TodoModuleMax
      snapshot={snapshot}
      activeFilter={activeFilter}
      onSelectFilter={onSelectFilter}
      onSelectDate={onSelectDate}
      onToggleItem={onToggleItem}
    />
  );
}

function TodoWarRoom({
  dashboard,
  size,
  mode,
  onToggleItem,
  onAddItem
}: {
  dashboard: DashboardData;
  size: HomeModuleSize;
  mode: "module" | "page";
  onToggleItem: (item: ScheduleItem) => void;
  onAddItem: (input: { date: string; title: string; urgency: ScheduleUrgency; suggestedWindow: string }) => void;
}) {
  const [activeDate, setActiveDate] = useState(() => toDateKey(new Date()));
  const [activeFilter, setActiveFilter] = useState<
    "all" | "pending" | "done" | "highPriority" | "overdue" | "inProgress" | "blocked"
  >("all");
  const snapshot = useMemo(
    () => buildTodoWorkspaceSnapshot(dashboard, activeDate, activeFilter),
    [dashboard, activeDate, activeFilter]
  );

  useEffect(() => {
    if (!dashboard.schedule.items.some((item) => item.date === activeDate) && snapshot.today !== activeDate) {
      setActiveDate(snapshot.today);
    }
  }, [activeDate, dashboard.schedule.items, snapshot.today]);

  if (mode === "page") {
    return (
      <TodoRouteLayout
        snapshot={snapshot}
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
        onSelectDate={setActiveDate}
        onToggleItem={onToggleItem}
        onAddItem={onAddItem}
      />
    );
  }

  return (
    <TodoModuleLayout
      size={size}
      snapshot={snapshot}
      activeFilter={activeFilter}
      onSelectFilter={setActiveFilter}
      onSelectDate={setActiveDate}
      onToggleItem={onToggleItem}
    />
  );
}

export function TodoPanel({
  dashboard,
  size,
  onToggleItem,
  onAddItem
}: {
  dashboard: DashboardData;
  size: HomeModuleSize;
  onToggleItem: (item: ScheduleItem) => void;
  onAddItem: (input: { date: string; title: string; urgency: ScheduleUrgency; suggestedWindow: string }) => void;
}) {
  return <TodoWarRoom dashboard={dashboard} size={size} mode="module" onToggleItem={onToggleItem} onAddItem={onAddItem} />;
}

export function TodoPage() {
  const queryClient = useQueryClient();
  const [themeKey, setThemeKey] = useThemePreference();
  const clockLine = useLiveClock();
  const { layout } = useHomeLayoutPreferences();
  const [railExpanded, setRailExpanded] = useState(true);
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard
  });

  useEffect(() => {
    return openDashboardStream((data) => {
      queryClient.setQueryData(["home-layout"], data.homeLayout);
      queryClient.setQueryData(["dashboard"], data);
    });
  }, [queryClient]);

  const { dashboard, addItem, toggleItemStatus } = useTodoWorkspaceDashboard(dashboardQuery.data);

  if (dashboardQuery.isLoading || !dashboard) {
    return <div className="loading-shell">正在连接待办作战室...</div>;
  }

  return (
    <main className="workspace todo-workspace">
      <CommandRail
        activeSection="todo"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[
          { label: "today", value: String(dashboard.schedule.todayItems.length) },
          { label: "pending", value: String(dashboard.schedule.todayItems.filter((item) => item.status === "pending").length) },
          { label: "updated", value: formatDateTime(dashboard.recentTasks[0]?.updatedAt) }
        ]}
      />

      <section className="todo-page-shell">
        <TodoWarRoom dashboard={dashboard} size="max" mode="page" onToggleItem={toggleItemStatus} onAddItem={addItem} />
      </section>
    </main>
  );
}
