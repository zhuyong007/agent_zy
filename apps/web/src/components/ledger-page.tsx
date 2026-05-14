import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchDashboard,
  fetchLedgerReports,
  fetchLedgerStages,
  fetchLedgerTimeline,
  openDashboardStream,
  recordLedger
} from "../api";
import {
  CommandRail,
  useHomeLayoutPreferences,
  useLiveClock,
  useThemePreference
} from "./dashboard-page";

function formatAmountFromCents(amountCents: number) {
  return (amountCents / 100).toLocaleString("zh-CN", {
    maximumFractionDigits: 2
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function LedgerPage() {
  const queryClient = useQueryClient();
  const [themeKey, setThemeKey] = useThemePreference();
  const clockLine = useLiveClock();
  const { layout } = useHomeLayoutPreferences();
  const [railExpanded, setRailExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [lastReply, setLastReply] = useState<string | null>(null);
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard
  });
  const timelineQuery = useQuery({
    queryKey: ["ledger-timeline"],
    queryFn: fetchLedgerTimeline
  });
  const reportsQuery = useQuery({
    queryKey: ["ledger-reports"],
    queryFn: fetchLedgerReports
  });
  const stagesQuery = useQuery({
    queryKey: ["ledger-stages"],
    queryFn: fetchLedgerStages
  });
  const recordMutation = useMutation({
    mutationFn: recordLedger,
    onSuccess: (response) => {
      setInput("");
      setLastReply(response.message.content);
      void queryClient.invalidateQueries({
        queryKey: ["dashboard"]
      });
      void queryClient.invalidateQueries({
        queryKey: ["ledger-timeline"]
      });
    }
  });

  useEffect(
    () =>
      openDashboardStream((data) => {
        queryClient.setQueryData(["dashboard"], data);
      }),
    [queryClient]
  );

  const dashboard = dashboardQuery.data;
  const timeline = timelineQuery.data ?? [];
  const latestReport = reportsQuery.data?.[0] ?? null;
  const stages = stagesQuery.data ?? [];

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();

    if (message.length === 0 || recordMutation.isPending) {
      return;
    }

    recordMutation.mutate(message);
  };

  if (!dashboard) {
    return (
      <main className="workspace ledger-workspace">
        <section className="loading-shell">
          <p className="eyebrow">AI Ledger</p>
          <h1>正在读取记账文件</h1>
        </section>
      </main>
    );
  }

  const ledger = dashboard.ledger.dashboard;

  return (
    <main className="workspace ledger-workspace">
      <CommandRail
        activeSection="ledger"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        rightMeta={[
          {
            label: "待确认",
            value: String(ledger.pendingReviewCount)
          }
        ]}
        clockLine={clockLine}
        navigationLayout={layout}
      />

      <section className="ledger-page">
        <div className="ledger-hero">
          <div>
            <p className="eyebrow">AI Life Ledger</p>
            <h1>一句话记录钱和人生阶段</h1>
            <p>
              先用文件长期存储，不依赖浏览器缓存。MVP 聚焦自然语言记录、AI 分类结果和时间轴。
            </p>
          </div>
          <form className="ledger-record" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="例如：今天梦幻西游卖货赚了 500"
              aria-label="自然语言记账"
              rows={3}
            />
            <button type="submit" disabled={recordMutation.isPending || input.trim().length === 0}>
              {recordMutation.isPending ? "记录中" : "记录到账本"}
            </button>
          </form>
        </div>

        {recordMutation.isError ? (
          <p className="ledger-inline-error">
            {recordMutation.error instanceof Error ? recordMutation.error.message : "记录失败"}
          </p>
        ) : null}
        {lastReply ? <p className="ledger-inline-reply">{lastReply}</p> : null}

        <div className="ledger-summary-grid">
          <article>
            <span>今日支出</span>
            <strong>{formatAmountFromCents(ledger.todayExpenseCents)}</strong>
          </article>
          <article>
            <span>今日收入</span>
            <strong>{formatAmountFromCents(ledger.todayIncomeCents)}</strong>
          </article>
          <article>
            <span>近 7 日净流入</span>
            <strong>{formatAmountFromCents(ledger.rolling7dNetCents)}</strong>
          </article>
          <article>
            <span>待确认</span>
            <strong>{ledger.pendingReviewCount}</strong>
          </article>
        </div>

        <div className="ledger-content-grid">
          <section className="ledger-card ledger-timeline">
            <div className="ledger-card__header">
              <div>
                <p className="eyebrow">Timeline</p>
                <h2>钱的时间轴</h2>
              </div>
              <span>{timeline.length} 条</span>
            </div>
            {timeline.length > 0 ? (
              <div className="ledger-timeline__list">
                {timeline.slice(0, 12).map(({ fact, semantic }) => (
                  <article key={fact.id} className="ledger-timeline__item">
                    <time>{formatDateTime(fact.occurredAt)}</time>
                    <div>
                      <strong>
                        {fact.direction === "income" ? "+" : "-"}
                        {formatAmountFromCents(fact.amountCents)}
                      </strong>
                      <p>{fact.rawText}</p>
                      <span>
                        {semantic?.primaryCategory ?? "待分类"}
                        {semantic?.scene ? ` · ${semantic.scene}` : ""}
                        {fact.status === "needs_review" ? " · 待确认" : ""}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="ledger-empty">还没有记录。先输入一句自然语言账单。</p>
            )}
          </section>

          <aside className="ledger-side">
            <section className="ledger-card">
              <p className="eyebrow">Coach</p>
              <h2>财务教练提示</h2>
              <p>{ledger.coachTip ?? "记录几笔后，这里会给出消费行为和风险提示。"}</p>
            </section>

            <section className="ledger-card">
              <p className="eyebrow">Report</p>
              <h2>最近报告</h2>
              {latestReport ? (
                <>
                  <p>{latestReport.summary}</p>
                  <ul>
                    {latestReport.insights.slice(0, 3).map((insight) => (
                      <li key={insight}>{insight}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>周报/月报会由定时任务生成；当前可以先积累账单。</p>
              )}
            </section>

            <section className="ledger-card">
              <p className="eyebrow">Life Stages</p>
              <h2>人生阶段</h2>
              {stages.length > 0 ? (
                <div className="ledger-stage-list">
                  {stages.map((stage) => (
                    <span key={stage.id}>{stage.name}</span>
                  ))}
                </div>
              ) : (
                <p>后续可把 AI 项目、育儿、游戏经营等阶段关联到账单。</p>
              )}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
