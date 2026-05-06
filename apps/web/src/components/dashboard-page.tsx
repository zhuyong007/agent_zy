import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  DashboardData,
  NewsCategory,
  NewsItem,
  ScheduleItem,
  TopicIdea
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

export type RailSection = "home" | "news" | "topics" | "ledger" | "todo";
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
  { key: "topics", label: "选题", stamp: "02", to: "/topics" },
  { key: "ledger", label: "记账", stamp: "03", to: "/ledger" },
  { key: "todo", label: "待办", stamp: "04", to: "/todo" }
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

function formatAmount(amount: number) {
  return amount.toLocaleString("zh-CN");
}

function formatShortCount(count: number) {
  return count.toLocaleString("zh-CN", {
    minimumIntegerDigits: count < 10 ? 2 : 1,
    useGrouping: false
  });
}

export function CommandRail({
  activeSection,
  expanded,
  onToggle,
  themeKey,
  onThemeChange,
  rightMeta: _rightMeta,
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
  const railStyle = {
    "--route-frame": `url("${homeImageAssets.routeFrame}")`
  } as CSSProperties;
  const [dateTimePart, weekdayPart] = clockLine.split(" · ");
  const timeLabel = dateTimePart?.slice(11, 16) ?? clockLine;
  const dateLabel = [dateTimePart?.slice(5, 10), weekdayPart].filter(Boolean).join(" ");

  return (
    <header
      className={`command-rail${showNavigation ? "" : " command-rail--compact"}${expanded ? " is-expanded" : ""}`}
      style={railStyle}
    >
      {showNavigation ? (
        <nav className="command-rail__nav" aria-label="主导航">
          {railItems.map((item) => {
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
      <div className="edge-panel__content">
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
  section: Exclude<RailSection, "home" | "topics">;
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
  const layoutStyle = {
    "--news-width": newsCollapsed ? "64px" : "326px",
    "--todo-width": "408px",
    "--news-panel-frame": `url("${homeImageAssets.newsPanelFrame}")`,
    "--todo-panel-frame": `url("${homeImageAssets.todoPanelFrame}")`,
    "--ledger-panel-frame": `url("${homeImageAssets.routeFrame}")`,
    "--topic-panel-frame": `url("${homeImageAssets.topicPanelFrame}")`
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

        <div className="workspace-side">
          <TodoPanel items={dashboard.schedule.todayItems} />
          <LedgerPanel
            balance={dashboard.ledger.summary.balance}
            todayIncome={dashboard.ledger.summary.todayIncome}
            todayExpense={dashboard.ledger.summary.todayExpense}
          />
          <TopicPanel
            items={dashboard.topics.current}
            generatedAt={dashboard.topics.lastGeneratedAt}
          />
        </div>
      </div>
    </main>
  );
}
