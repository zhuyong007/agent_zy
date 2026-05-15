import type {
  DashboardData,
  ScheduleItem,
  ScheduleItemStatus,
  ScheduleUrgency,
  TaskRecord
} from "@agent-zy/shared-types";

export type TodoFilter =
  | "all"
  | "pending"
  | "done"
  | "highPriority"
  | "overdue"
  | "inProgress"
  | "blocked";

export interface TodoWorkspaceState {
  addedItems: ScheduleItem[];
  statusOverrides: Record<string, { status: ScheduleItemStatus; completedAt?: string }>;
}

export interface TodoMetric {
  id:
    | "selectedTotal"
    | "selectedDone"
    | "selectedPending"
    | "selectedInProgress"
    | "overdue"
    | "weekTotal"
    | "weekCompletionRate"
    | "highPriority"
    | "blocked"
    | "streak"
    | "selectedEstimated"
    | "selectedRemaining";
  label: string;
  value: string;
  hint: string;
  filter: TodoFilter;
  accent?: "default" | "warning" | "danger" | "success";
}

export interface TodoCalendarDay {
  date: string;
  dayNumber: number;
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
  totalCount: number;
  highCount: number;
  overdueCount: number;
  completedCount: number;
  doneAll: boolean;
  hasRepeat: boolean;
  hasReminder: boolean;
  hasMilestone: boolean;
}

export interface TodoWorkspaceSnapshot {
  activeDate: string;
  today: string;
  activeDateLabel: string;
  monthLabel: string;
  metrics: TodoMetric[];
  aiSummary: string;
  calendarDays: TodoCalendarDay[];
  selectedItems: ScheduleItem[];
  selectedRuntimeTasks: TaskRecord[];
  selectedPendingCount: number;
  selectedDoneCount: number;
  selectedEstimatedMinutes: number;
  selectedRemainingMinutes: number;
}

const REPEAT_PATTERN = /(重复|例行|每日|每天|每周|每月)/;
const REMINDER_PATTERN = /(提醒|跟进|follow up|follow-up|remind)/i;
const MILESTONE_PATTERN = /(里程碑|milestone|上线|发布|验收|节点)/i;
const WINDOW_RANGE_PATTERN = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/;

export const EMPTY_TODO_WORKSPACE_STATE: TodoWorkspaceState = {
  addedItems: [],
  statusOverrides: {}
};

export function toDateKey(input: Date | string) {
  const date = typeof input === "string" ? new Date(input) : input;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  return new Date(year, month - 1, day);
}

function addDays(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

function startOfWeek(dateKey: string) {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

function endOfWeek(dateKey: string) {
  return addDays(startOfWeek(dateKey), 6);
}

function formatDuration(minutes: number) {
  if (minutes <= 0) {
    return "0m";
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) {
    return `${restMinutes}m`;
  }

  if (restMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${restMinutes}m`;
}

export function formatTodoDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(parseDateKey(dateKey));
}

function formatMonthLabel(dateKey: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long"
  }).format(parseDateKey(dateKey));
}

function inferMinutesFromUrgency(urgency: ScheduleUrgency) {
  if (urgency === "high") {
    return 90;
  }

  if (urgency === "medium") {
    return 60;
  }

  return 30;
}

export function estimateScheduleItemMinutes(item: ScheduleItem) {
  const matched = item.suggestedWindow.match(WINDOW_RANGE_PATTERN);

  if (matched) {
    const [, startHour, startMinute, endHour, endMinute] = matched;
    const start = Number(startHour) * 60 + Number(startMinute);
    const end = Number(endHour) * 60 + Number(endMinute);

    if (end > start) {
      return end - start;
    }
  }

  return inferMinutesFromUrgency(item.urgency);
}

function hasRepeatTag(item: ScheduleItem) {
  return REPEAT_PATTERN.test(item.title);
}

function hasReminderTag(item: ScheduleItem) {
  return REMINDER_PATTERN.test(item.title);
}

function hasMilestoneTag(item: ScheduleItem) {
  return MILESTONE_PATTERN.test(item.title);
}

function isTaskRuntimeActive(task: TaskRecord) {
  return task.status === "queued" || task.status === "running";
}

function isTaskBlocked(task: TaskRecord) {
  return task.status === "waiting_feedback";
}

function groupItemsByDate(items: ScheduleItem[]) {
  const grouped = new Map<string, ScheduleItem[]>();

  items.forEach((item) => {
    const current = grouped.get(item.date);

    if (current) {
      current.push(item);
      return;
    }

    grouped.set(item.date, [item]);
  });

  return grouped;
}

function buildCalendarDays(items: ScheduleItem[], activeDate: string, today: string) {
  const active = parseDateKey(activeDate);
  const firstOfMonth = new Date(active.getFullYear(), active.getMonth(), 1);
  const monthStart = toDateKey(firstOfMonth);
  const gridStart = startOfWeek(monthStart);
  const days: TodoCalendarDay[] = [];
  const itemsByDate = groupItemsByDate(items);

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    const dayItems = itemsByDate.get(date) ?? [];
    const overdueCount = dayItems.filter((item) => item.status === "pending" && item.date < today).length;
    const completedCount = dayItems.filter((item) => item.status === "done").length;

    days.push({
      date,
      dayNumber: parseDateKey(date).getDate(),
      isToday: date === today,
      isSelected: date === activeDate,
      isCurrentMonth: parseDateKey(date).getMonth() === active.getMonth(),
      totalCount: dayItems.length,
      highCount: dayItems.filter((item) => item.urgency === "high" && item.status !== "done").length,
      overdueCount,
      completedCount,
      doneAll: dayItems.length > 0 && completedCount === dayItems.length,
      hasRepeat: dayItems.some(hasRepeatTag),
      hasReminder: dayItems.some(hasReminderTag),
      hasMilestone: dayItems.some(hasMilestoneTag)
    });
  }

  return days;
}

function computeCompletionStreak(items: ScheduleItem[], anchorDate: string) {
  const grouped = groupItemsByDate(items);
  let streak = 0;
  let cursor = anchorDate;

  while (true) {
    const dayItems = grouped.get(cursor) ?? [];

    if (dayItems.length === 0 || dayItems.some((item) => item.status !== "done")) {
      return streak;
    }

    streak += 1;
    cursor = addDays(cursor, -1);
  }
}

function findBusiestDayOfWeek(items: ScheduleItem[], anchorDate: string) {
  const grouped = groupItemsByDate(items);
  const weekStart = startOfWeek(anchorDate);
  let bestDate = weekStart;
  let bestCount = 0;

  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index);
    const count = (grouped.get(date) ?? []).length;

    if (count > bestCount) {
      bestDate = date;
      bestCount = count;
    }
  }

  return {
    date: bestDate,
    count: bestCount
  };
}

function countDelayedDays(items: ScheduleItem[], anchorDate: string) {
  return new Set(items.filter((item) => item.status === "pending" && item.date < anchorDate).map((item) => item.date))
    .size;
}

function buildAiSummary(input: {
  activeDate: string;
  today: string;
  selectedItems: ScheduleItem[];
  selectedPendingCount: number;
  selectedEstimatedMinutes: number;
  overdueCount: number;
  globalHighPriorityCount: number;
  delayedDays: number;
  busiestDay: { date: string; count: number };
}) {
  const {
    activeDate,
    today,
    selectedItems,
    selectedPendingCount,
    selectedEstimatedMinutes,
    overdueCount,
    globalHighPriorityCount,
    delayedDays,
    busiestDay
  } = input;
  const scopeLabel = activeDate === today ? "今天" : `${formatTodoDateLabel(activeDate)}这天`;

  if (selectedItems.length === 0) {
    return `${scopeLabel}任务很轻，可以补一个推进型事项。`;
  }

  if (overdueCount > 0) {
    return `${scopeLabel}前还有 ${overdueCount} 个逾期任务，建议先清障再接新任务。`;
  }

  if (selectedPendingCount >= 6 || selectedEstimatedMinutes >= 8 * 60) {
    return `${scopeLabel}明显过载，建议把低优先级任务后移，先保住最关键的 2 件事。`;
  }

  if (globalHighPriorityCount >= 2) {
    return `${scopeLabel}任务不算多，但有 ${globalHighPriorityCount} 个高优先级事项，不建议再加新任务。`;
  }

  if (busiestDay.count >= 5 && busiestDay.date !== activeDate) {
    return `本周最忙的是 ${formatTodoDateLabel(busiestDay.date)}，有 ${busiestDay.count} 项安排，建议提前分流。`;
  }

  if (delayedDays >= 3) {
    return `已经连续拖延了 ${delayedDays} 天，先处理最老的一项能最快止损。`;
  }

  return `${scopeLabel}节奏可控，按建议时间窗推进，优先把未完成事项收口。`;
}

function buildMetrics(input: {
  activeDate: string;
  today: string;
  selectedItems: ScheduleItem[];
  selectedRuntimeTasks: TaskRecord[];
  weekItems: ScheduleItem[];
  allItems: ScheduleItem[];
  overdueCount: number;
}) {
  const { activeDate, today, selectedItems, selectedRuntimeTasks, weekItems, allItems, overdueCount } = input;
  const selectedLabel = activeDate === today ? "今日" : "所选日";
  const selectedDoneCount = selectedItems.filter((item) => item.status === "done").length;
  const selectedPendingCount = selectedItems.filter((item) => item.status === "pending").length;
  const selectedEstimatedMinutes = selectedItems.reduce((sum, item) => sum + estimateScheduleItemMinutes(item), 0);
  const selectedRemainingMinutes = selectedItems
    .filter((item) => item.status !== "done")
    .reduce((sum, item) => sum + estimateScheduleItemMinutes(item), 0);
  const weekDoneCount = weekItems.filter((item) => item.status === "done").length;
  const globalHighPriorityCount = allItems.filter((item) => item.urgency === "high" && item.status !== "done").length;
  const blockedCount = selectedRuntimeTasks.filter(isTaskBlocked).length;
  const activeRuntimeCount = selectedRuntimeTasks.filter(isTaskRuntimeActive).length;
  const streak = computeCompletionStreak(allItems, activeDate);

  return {
    metrics: [
      {
        id: "selectedTotal",
        label: `${selectedLabel}待办总数`,
        value: String(selectedItems.length),
        hint: "点击查看全部",
        filter: "all"
      },
      {
        id: "selectedDone",
        label: `${selectedLabel}已完成`,
        value: String(selectedDoneCount),
        hint: "完成项",
        filter: "done",
        accent: "success"
      },
      {
        id: "selectedPending",
        label: `${selectedLabel}未完成`,
        value: String(selectedPendingCount),
        hint: "待推进",
        filter: "pending",
        accent: selectedPendingCount > 0 ? "warning" : "default"
      },
      {
        id: "selectedInProgress",
        label: `${selectedLabel}进行中`,
        value: String(activeRuntimeCount),
        hint: "运行态任务",
        filter: "inProgress"
      },
      {
        id: "overdue",
        label: "逾期任务",
        value: String(overdueCount),
        hint: "需要优先清理",
        filter: "overdue",
        accent: overdueCount > 0 ? "danger" : "default"
      },
      {
        id: "weekTotal",
        label: "本周待办总数",
        value: String(weekItems.length),
        hint: `${formatTodoDateLabel(startOfWeek(activeDate))} 起`,
        filter: "all"
      },
      {
        id: "weekCompletionRate",
        label: "本周完成率",
        value: weekItems.length > 0 ? `${Math.round((weekDoneCount / weekItems.length) * 100)}%` : "0%",
        hint: `${weekDoneCount}/${weekItems.length || 0}`,
        filter: "done",
        accent: weekDoneCount === weekItems.length && weekItems.length > 0 ? "success" : "default"
      },
      {
        id: "highPriority",
        label: "高优先级任务",
        value: String(globalHighPriorityCount),
        hint: "全局待处理",
        filter: "highPriority",
        accent: globalHighPriorityCount > 0 ? "warning" : "default"
      },
      {
        id: "blocked",
        label: "被阻塞任务",
        value: String(blockedCount),
        hint: "等待反馈",
        filter: "blocked",
        accent: blockedCount > 0 ? "danger" : "default"
      },
      {
        id: "streak",
        label: "连续完成天数",
        value: String(streak),
        hint: "按天全清",
        filter: "done"
      },
      {
        id: "selectedEstimated",
        label: `${selectedLabel}预计总耗时`,
        value: formatDuration(selectedEstimatedMinutes),
        hint: "按时间窗推算",
        filter: "all"
      },
      {
        id: "selectedRemaining",
        label: `${selectedLabel}剩余预计耗时`,
        value: formatDuration(selectedRemainingMinutes),
        hint: "未完成部分",
        filter: "pending",
        accent: selectedRemainingMinutes > 4 * 60 ? "warning" : "default"
      }
    ] satisfies TodoMetric[],
    selectedDoneCount,
    selectedPendingCount,
    selectedEstimatedMinutes,
    selectedRemainingMinutes,
    globalHighPriorityCount
  };
}

function filterItems(items: ScheduleItem[], filter: TodoFilter, activeDate: string) {
  if (filter === "all") {
    return items;
  }

  if (filter === "pending") {
    return items.filter((item) => item.status === "pending");
  }

  if (filter === "done") {
    return items.filter((item) => item.status === "done");
  }

  if (filter === "highPriority") {
    return items.filter((item) => item.urgency === "high" && item.status !== "done");
  }

  if (filter === "overdue") {
    return items.filter((item) => item.status === "pending" && item.date < activeDate);
  }

  return items;
}

function filterRuntimeTasks(tasks: TaskRecord[], filter: TodoFilter) {
  if (filter === "inProgress") {
    return tasks.filter(isTaskRuntimeActive);
  }

  if (filter === "blocked") {
    return tasks.filter(isTaskBlocked);
  }

  if (filter === "done") {
    return tasks.filter((task) => task.status === "completed");
  }

  return tasks;
}

export function applyTodoWorkspaceState(
  dashboard: DashboardData,
  workspace: TodoWorkspaceState
): DashboardData {
  const mergedItems = dashboard.schedule.items.map((item) => {
    const override = workspace.statusOverrides[item.id];

    return override
      ? {
          ...item,
          status: override.status,
          completedAt: override.completedAt
        }
      : item;
  });
  const localItems = workspace.addedItems.filter((item) => !mergedItems.some((remoteItem) => remoteItem.id === item.id));
  const allItems = [...mergedItems, ...localItems].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    return left.suggestedWindow.localeCompare(right.suggestedWindow);
  });
  const today = toDateKey(new Date());

  return {
    ...dashboard,
    schedule: {
      ...dashboard.schedule,
      items: allItems,
      todayItems: allItems.filter((item) => item.date === today)
    }
  };
}

export function buildTodoWorkspaceSnapshot(
  dashboard: DashboardData,
  activeDate: string,
  filter: TodoFilter
): TodoWorkspaceSnapshot {
  const today = toDateKey(new Date());
  const safeActiveDate = activeDate || today;
  const allItems = dashboard.schedule.items;
  const selectedItems = allItems.filter((item) => item.date === safeActiveDate);
  const weekStart = startOfWeek(safeActiveDate);
  const weekEnd = endOfWeek(safeActiveDate);
  const weekItems = allItems.filter((item) => item.date >= weekStart && item.date <= weekEnd);
  const selectedRuntimeTasks = dashboard.recentTasks.filter((task) => toDateKey(task.createdAt) === safeActiveDate);
  const overdueCount = allItems.filter((item) => item.status === "pending" && item.date < safeActiveDate).length;
  const delayedDays = countDelayedDays(allItems, safeActiveDate);
  const busiestDay = findBusiestDayOfWeek(allItems, safeActiveDate);
  const metricsData = buildMetrics({
    activeDate: safeActiveDate,
    today,
    selectedItems,
    selectedRuntimeTasks,
    weekItems,
    allItems,
    overdueCount
  });

  return {
    activeDate: safeActiveDate,
    today,
    activeDateLabel: formatTodoDateLabel(safeActiveDate),
    monthLabel: formatMonthLabel(safeActiveDate),
    metrics: metricsData.metrics,
    aiSummary: buildAiSummary({
      activeDate: safeActiveDate,
      today,
      selectedItems,
      selectedPendingCount: metricsData.selectedPendingCount,
      selectedEstimatedMinutes: metricsData.selectedEstimatedMinutes,
      overdueCount,
      globalHighPriorityCount: metricsData.globalHighPriorityCount,
      delayedDays,
      busiestDay
    }),
    calendarDays: buildCalendarDays(allItems, safeActiveDate, today),
    selectedItems: filterItems(selectedItems, filter, safeActiveDate),
    selectedRuntimeTasks: filterRuntimeTasks(selectedRuntimeTasks, filter),
    selectedPendingCount: metricsData.selectedPendingCount,
    selectedDoneCount: metricsData.selectedDoneCount,
    selectedEstimatedMinutes: metricsData.selectedEstimatedMinutes,
    selectedRemainingMinutes: metricsData.selectedRemainingMinutes
  };
}
