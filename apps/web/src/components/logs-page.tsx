import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { EventLogLevel, EventLogQuery } from "@agent-zy/shared-types";

import { clearEventLogs, fetchEventLogs } from "../api";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";

const LEVELS: Array<{ value: "" | EventLogLevel; label: string }> = [
  { value: "", label: "全部级别" },
  { value: "error", label: "错误" },
  { value: "warn", label: "警告" },
  { value: "info", label: "信息" },
  { value: "debug", label: "调试" }
];

function formatTimestamp(timestamp?: string | null) {
  return timestamp ? new Date(timestamp).toLocaleString("zh-CN") : "--";
}

export function LogsPage() {
  const queryClient = useQueryClient();
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<EventLogQuery>({ limit: 200 });
  const { layout } = useHomeLayoutPreferences();
  const logsQuery = useQuery({
    queryKey: ["event-logs", filters],
    queryFn: () => fetchEventLogs(filters),
    refetchInterval: 5000
  });
  const clearMutation = useMutation({
    mutationFn: clearEventLogs,
    onSuccess: () => {
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ["event-logs"] });
    }
  });
  const data = logsQuery.data;
  const selected = useMemo(
    () => data?.items.find((item) => item.id === selectedId) ?? null,
    [data?.items, selectedId]
  );

  function updateFilter(key: keyof EventLogQuery, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value || undefined
    }));
  }

  return (
    <main className="workspace logs-workspace">
      <CommandRail
        activeSection="logs"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[]}
      />
      <section className="logs-shell">
        <header className="logs-header">
          <div>
            <p className="eyebrow">Operations Timeline</p>
            <h1>结构化日志</h1>
            <p>查看前端关键操作、API、任务、Agent 和模型调用。</p>
          </div>
          <div className="logs-actions">
            <button type="button" onClick={() => void logsQuery.refetch()}>刷新</button>
            <button
              type="button"
              disabled={clearMutation.isPending}
              onClick={() => {
                if (window.confirm("确认清空结构化日志？业务状态和 dev 日志不会被删除。")) {
                  clearMutation.mutate();
                }
              }}
            >
              {clearMutation.isPending ? "清空中..." : "清空"}
            </button>
          </div>
        </header>
        <section className="logs-summary">
          <div><span>事件</span><strong>{data?.summary.total ?? 0}</strong></div>
          <div><span>错误</span><strong>{data?.summary.errorCount ?? 0}</strong></div>
          <div><span>最近更新</span><strong>{formatTimestamp(data?.summary.latestTimestamp)}</strong></div>
        </section>
        <section className="logs-filters">
          <select value={filters.level ?? ""} onChange={(event) => updateFilter("level", event.target.value)}>
            {LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
          </select>
          <input placeholder="分类，例如 model" value={filters.category ?? ""} onChange={(event) => updateFilter("category", event.target.value)} />
          <input placeholder="Agent" value={filters.agentId ?? ""} onChange={(event) => updateFilter("agentId", event.target.value)} />
          <input placeholder="taskId" value={filters.taskId ?? ""} onChange={(event) => updateFilter("taskId", event.target.value)} />
          <input placeholder="requestId" value={filters.requestId ?? ""} onChange={(event) => updateFilter("requestId", event.target.value)} />
          <input placeholder="关键词" value={filters.q ?? ""} onChange={(event) => updateFilter("q", event.target.value)} />
        </section>
        {data?.warnings.map((warning) => <p className="logs-warning" key={warning}>{warning}</p>)}
        <section className="logs-board">
          <div className="logs-list">
            {logsQuery.isLoading ? <p>正在读取日志...</p> : null}
            {data?.items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`logs-row logs-row--${item.level}${selectedId === item.id ? " is-active" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                <time>{formatTimestamp(item.timestamp)}</time>
                <strong>{item.category} · {item.action}</strong>
                <span>{item.message}</span>
                <small>{item.agentId ?? item.taskId ?? ""}</small>
              </button>
            ))}
          </div>
          <aside className="logs-detail">
            {selected ? (
              <>
                <p className="eyebrow">{selected.level}</p>
                <h2>{selected.category} · {selected.action}</h2>
                <p>{selected.message}</p>
                <pre>{JSON.stringify(selected, null, 2)}</pre>
              </>
            ) : <p>选择一条日志查看脱敏详情。</p>}
          </aside>
        </section>
      </section>
    </main>
  );
}
