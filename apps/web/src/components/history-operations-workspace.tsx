import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  DashboardData,
  HistoryContentDirection,
  HistoryEditorialStage,
  HistoryEditorialTopic,
  HistorySourceCard
} from "@agent-zy/shared-types";

import {
  createHistoryDirection,
  createHistoryTopic,
  deleteHistoryDirection,
  deleteHistoryTopic,
  updateHistoryDirection,
  updateHistoryStrategy,
  updateHistoryTopic
} from "../api";

export type HistoryWorkspaceView = "today" | "topics" | "production" | "calendar" | "analytics" | "insights";

const WORKSPACES: Array<{ id: HistoryWorkspaceView; label: string; caption: string }> = [
  { id: "today", label: "今日工作台", caption: "策略与推进" },
  { id: "topics", label: "选题库", caption: "方向与事实卡" },
  { id: "production", label: "内容生产", caption: "生成与历史稿" },
  { id: "calendar", label: "发布日历", caption: "排期与状态" },
  { id: "analytics", label: "数据复盘", caption: "表现与实验" },
  { id: "insights", label: "评论洞察", caption: "问题与追更" }
];

const STAGE_LABELS: Record<HistoryEditorialStage, string> = {
  idea: "待评估",
  researching: "研究中",
  ready: "可生产",
  drafting: "制作中",
  scheduled: "待发布",
  published: "已发布",
  archived: "已归档"
};

const STAGES = Object.keys(STAGE_LABELS) as HistoryEditorialStage[];

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? "--" : `${(value * 100).toFixed(2)}%`;
}

function scoreTotal(topic: HistoryEditorialTopic) {
  const scores = topic.scores;
  return scores.demand + scores.curiosity + scores.contrast + scores.collectability + scores.visualPotential
    + scores.evidenceStrength + scores.extensibility - scores.risk;
}

function directionName(topic: HistoryEditorialTopic, directions: HistoryContentDirection[]) {
  return directions.find((direction) => direction.id === topic.directionId)?.name ?? "未分类";
}

export function HistoryOperationsNavigation(props: {
  active: HistoryWorkspaceView;
  onChange: (view: HistoryWorkspaceView) => void;
  dashboard: DashboardData;
}) {
  const operations = props.dashboard.historyOperations;
  const report = props.dashboard.historyOperationsDashboard;

  return (
    <header className="history-ops-masthead">
      <div className="history-ops-masthead__identity">
        <span>HISTORY EDITORIAL OS</span>
        <strong>{operations?.strategy.accountName ?? "历史知识"}</strong>
        <p>{operations?.strategy.promise ?? "从选题到复盘的历史内容工作台"}</p>
      </div>
      <nav className="history-ops-nav" aria-label="历史运营工作区">
        {WORKSPACES.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            className={props.active === workspace.id ? "is-active" : ""}
            aria-current={props.active === workspace.id ? "page" : undefined}
            onClick={() => props.onChange(workspace.id)}
          >
            <strong>{workspace.label}</strong>
            <span>{workspace.caption}</span>
          </button>
        ))}
      </nav>
      <div className="history-ops-masthead__pulse">
        <span>可生产</span><strong>{report?.readyToProduceCount ?? 0}</strong>
        <span>已排期</span><strong>{report?.scheduledCount ?? 0}</strong>
      </div>
    </header>
  );
}

export function HistoryOperationsWorkspace(props: {
  view: Exclude<HistoryWorkspaceView, "production">;
  dashboard: DashboardData;
  onGenerateTopic: (topic: HistoryEditorialTopic) => void;
  generatingTopicId: string | null;
  analyticsDetail?: ReactNode;
  insightsDetail?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const operations = props.dashboard.historyOperations;
  const report = props.dashboard.historyOperationsDashboard;
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicDirectionId, setTopicDirectionId] = useState("");
  const [directionNameInput, setDirectionNameInput] = useState("");
  const [directionDescription, setDirectionDescription] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  const updateTopicMutation = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<HistoryEditorialTopic> }) => updateHistoryTopic(id, patch), onSuccess: refresh });
  const deleteTopicMutation = useMutation({ mutationFn: deleteHistoryTopic, onSuccess: refresh });
  const createTopicMutation = useMutation({
    mutationFn: createHistoryTopic,
    onSuccess: () => { setTopicTitle(""); refresh(); }
  });
  const createDirectionMutation = useMutation({
    mutationFn: createHistoryDirection,
    onSuccess: () => { setDirectionNameInput(""); setDirectionDescription(""); refresh(); }
  });
  const updateDirectionMutation = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<HistoryContentDirection> }) => updateHistoryDirection(id, patch), onSuccess: refresh });
  const deleteDirectionMutation = useMutation({ mutationFn: deleteHistoryDirection, onSuccess: refresh });

  if (!operations || !report) {
    return <section className="history-ops-surface"><div className="edge-empty">运营工作台正在初始化…</div></section>;
  }

  const selectedTopic = operations.topics.find((topic) => topic.id === selectedTopicId) ?? null;

  if (props.view === "today") {
    return <TodayDesk dashboard={props.dashboard} />;
  }

  if (props.view === "calendar") {
    return (
      <section className="history-ops-surface history-calendar-desk">
        <SectionHeading eyebrow="Publishing" title="发布日历" description="把研究完成的内容排进具体日期；“朝代”和“最”只是可选工具，不占固定栏目。" />
        <div className="history-calendar-week">
          {Array.from({ length: 14 }, (_, index) => {
            const date = new Date();
            date.setDate(date.getDate() + index);
            const key = date.toISOString().slice(0, 10);
            const items = operations.topics.filter((topic) => topic.scheduledFor?.slice(0, 10) === key);
            return (
              <article key={key} className={items.length ? "has-items" : ""}>
                <time dateTime={key}>{date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", weekday: "short" })}</time>
                {items.length ? items.map((topic) => <button key={topic.id} type="button" onClick={() => setSelectedTopicId(topic.id)}><strong>{topic.title}</strong><span>{directionName(topic, operations.directions)}</span></button>) : <span>未排期</span>}
              </article>
            );
          })}
        </div>
        <div className="history-calendar-backlog">
          <h3>待排期内容</h3>
          {operations.topics.filter((topic) => topic.status === "ready" && !topic.scheduledFor).map((topic) => (
            <article key={topic.id}><strong>{topic.title}</strong><input type="date" aria-label={`安排 ${topic.title}`} onChange={(event) => updateTopicMutation.mutate({ id: topic.id, patch: { scheduledFor: event.target.value, status: "scheduled" } })} /></article>
          ))}
        </div>
      </section>
    );
  }

  if (props.view === "analytics") {
    return (
      <section className="history-ops-surface history-analytics-desk">
        <SectionHeading eyebrow="Performance" title="数据复盘" description="用中位数和互动率判断内容价值，避免被单篇绝对播放量带偏。" />
        <div className="history-benchmark-strip">
          <Metric label="浏览中位数" value={report.benchmarks.medianViews?.toLocaleString("zh-CN") ?? "--"} />
          <Metric label="点赞率中位数" value={percent(report.benchmarks.medianLikeRate)} />
          <Metric label="收藏率中位数" value={percent(report.benchmarks.medianCollectRate)} />
          <Metric label="分享率中位数" value={percent(report.benchmarks.medianShareRate)} />
          <Metric label="证据覆盖" value={percent(report.evidenceCoverage)} />
        </div>
        <div className="history-review-notes"><h3>本周行动建议</h3>{report.recommendations.map((item) => <p key={item}>{item}</p>)}</div>
        <div className="history-performance-table" role="table" aria-label="小红书内容表现">
          <div role="row" className="history-performance-table__head"><span>笔记</span><span>浏览</span><span>点赞率</span><span>收藏率</span><span>评论率</span><span>分享率</span></div>
          {[...report.performance].sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0)).map((post) => (
            <div role="row" key={post.id}><strong>{post.title}</strong><span>{post.views.toLocaleString("zh-CN")}</span><span>{percent(post.likeRate)}</span><span>{percent(post.collectRate)}</span><span>{percent(post.commentRate)}</span><span>{percent(post.shareRate)}</span></div>
          ))}
          {!report.performance.length ? <div className="edge-empty">暂无数据，请在下方导入小红书 Excel。</div> : null}
        </div>
        {props.analyticsDetail ? <div className="history-ops-detail">{props.analyticsDetail}</div> : null}
      </section>
    );
  }

  if (props.view === "insights") {
    const followUps = props.dashboard.notifications.flatMap((notification) => {
      const payload = notification.payload;
      return payload && "followUpIdeas" in payload && Array.isArray(payload.followUpIdeas) ? payload.followUpIdeas : [];
    }).slice(0, 12);
    return (
      <section className="history-ops-surface history-insight-desk">
        <SectionHeading eyebrow="Audience signals" title="评论洞察" description="把质疑、补充和追更请求沉淀为内容资产。" />
        <div className="history-signal-list">
          {report.commentSignals.map((signal) => <article key={signal.label}><span>{signal.count}</span><div><strong>{signal.label}</strong>{signal.examples.map((example) => <p key={example}>{example}</p>)}</div></article>)}
          {!report.commentSignals.length ? <div className="edge-empty">暂无可归类评论。评论回复草稿增加后，这里会自动聚合信号。</div> : null}
        </div>
        <div className="history-followup-list"><h3>已有稿件建议的续篇</h3>{followUps.map((idea) => <button key={idea} type="button" onClick={() => createTopicMutation.mutate({ title: idea, status: "idea" })}>{idea}<span>加入选题库 ＋</span></button>)}</div>
        {props.insightsDetail ? <div className="history-ops-detail">{props.insightsDetail}</div> : null}
      </section>
    );
  }

  return (
    <section className="history-ops-surface history-topic-desk">
      <SectionHeading eyebrow="Editorial pipeline" title="选题库" description="方向可以持续增删；选题只有完成资料卡后才建议进入生产。" />
      <div className="history-direction-ledger">
        <div className="history-direction-ledger__list">
          {operations.directions.map((direction) => (
            <article key={direction.id} className={direction.active ? "is-active" : ""}>
              <div><strong>{direction.name}</strong><p>{direction.description}</p></div>
              <span>{operations.topics.filter((topic) => topic.directionId === direction.id).length} 个选题</span>
              <button type="button" onClick={() => updateDirectionMutation.mutate({ id: direction.id, patch: { active: !direction.active } })}>{direction.active ? "停用" : "启用"}</button>
              <button type="button" aria-label={`删除方向 ${direction.name}`} onClick={() => { if (window.confirm(`删除内容方向“${direction.name}”？关联选题会变为未分类。`)) deleteDirectionMutation.mutate(direction.id); }}>删除</button>
            </article>
          ))}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); createDirectionMutation.mutate({ name: directionNameInput, description: directionDescription }); }}>
          <input value={directionNameInput} onChange={(event) => setDirectionNameInput(event.target.value)} placeholder="新内容方向" required />
          <input value={directionDescription} onChange={(event) => setDirectionDescription(event.target.value)} placeholder="这个方向解决什么阅读需求" required />
          <button type="submit">新增方向</button>
        </form>
      </div>
      <form className="history-topic-capture" onSubmit={(event) => { event.preventDefault(); createTopicMutation.mutate({ title: topicTitle, directionId: topicDirectionId || null }); }}>
        <span>快速收题</span>
        <input value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} placeholder="输入一个值得研究的问题" required />
        <select value={topicDirectionId} onChange={(event) => setTopicDirectionId(event.target.value)}><option value="">未分类</option>{operations.directions.filter((direction) => direction.active).map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select>
        <button type="submit">加入选题库</button>
      </form>
      <div className="history-topic-ledger">
        <div className="history-topic-ledger__head"><span>选题 / 方向</span><span>阶段</span><span>综合分</span><span>资料</span><span>操作</span></div>
        {[...operations.topics].sort((a, b) => scoreTotal(b) - scoreTotal(a)).map((topic) => (
          <article key={topic.id} className={selectedTopicId === topic.id ? "is-expanded" : ""}>
            <button type="button" className="history-topic-ledger__title" onClick={() => setSelectedTopicId(selectedTopicId === topic.id ? null : topic.id)}><strong>{topic.title}</strong><span>{directionName(topic, operations.directions)}</span></button>
            <select aria-label={`${topic.title}阶段`} value={topic.status} onChange={(event) => updateTopicMutation.mutate({ id: topic.id, patch: { status: event.target.value as HistoryEditorialStage } })}>{STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}</select>
            <strong className="history-topic-score">{scoreTotal(topic)}</strong>
            <span>{topic.sourceCards.length} 条</span>
            <div className="history-topic-ledger__actions"><button type="button" disabled={props.generatingTopicId === topic.id} onClick={() => props.onGenerateTopic(topic)}>{props.generatingTopicId === topic.id ? "生成中" : "生成"}</button><button type="button" onClick={() => { if (window.confirm(`删除选题“${topic.title}”？`)) deleteTopicMutation.mutate(topic.id); }}>删除</button></div>
            {selectedTopicId === topic.id ? <TopicInspector topic={topic} directions={operations.directions} onSave={(patch) => updateTopicMutation.mutate({ id: topic.id, patch })} /> : null}
          </article>
        ))}
        {!operations.topics.length ? <div className="edge-empty">还没有选题。先从一个具体问题开始，不必先决定长期系列。</div> : null}
      </div>
    </section>
  );
}

function TodayDesk({ dashboard }: { dashboard: DashboardData }) {
  const queryClient = useQueryClient();
  const operations = dashboard.historyOperations!;
  const report = dashboard.historyOperationsDashboard!;
  const [strategy, setStrategy] = useState(operations.strategy);
  useEffect(() => setStrategy(operations.strategy), [operations.strategy]);
  const mutation = useMutation({ mutationFn: updateHistoryStrategy, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }) });
  const nextTopics = operations.topics.filter((topic) => !["published", "archived"].includes(topic.status)).slice(0, 6);
  return (
    <section className="history-ops-surface history-today-desk">
      <SectionHeading eyebrow="Editorial command" title="今日工作台" description="先决定下一步动作，再进入内容生产。" />
      <div className="history-today-grid">
        <form className="history-strategy-sheet" onSubmit={(event) => { event.preventDefault(); mutation.mutate(strategy); }}>
          <h3>账号策略</h3>
          <label>账号名称<input value={strategy.accountName} onChange={(event) => setStrategy({ ...strategy, accountName: event.target.value })} /></label>
          <label>目标读者<textarea value={strategy.audience} onChange={(event) => setStrategy({ ...strategy, audience: event.target.value })} /></label>
          <label>内容承诺<textarea value={strategy.promise} onChange={(event) => setStrategy({ ...strategy, promise: event.target.value })} /></label>
          <label>每周目标<input type="number" min="1" max="21" value={strategy.weeklyCadence} onChange={(event) => setStrategy({ ...strategy, weeklyCadence: Number(event.target.value) })} /></label>
          <button type="submit">保存策略</button>
        </form>
        <div className="history-today-pipeline">
          <h3>生产漏斗</h3>
          {STAGES.filter((stage) => stage !== "archived").map((stage) => <div key={stage}><span>{STAGE_LABELS[stage]}</span><strong>{report.pipeline[stage]}</strong><i style={{ width: `${Math.min(100, report.pipeline[stage] * 16)}%` }} /></div>)}
        </div>
        <div className="history-today-actions"><h3>下一步</h3>{report.recommendations.map((item) => <p key={item}>{item}</p>)}</div>
      </div>
      <div className="history-today-queue"><h3>正在推进</h3>{nextTopics.map((topic) => <article key={topic.id}><span>{STAGE_LABELS[topic.status]}</span><strong>{topic.title}</strong><small>{directionName(topic, operations.directions)} · {topic.sourceCards.length} 条资料</small></article>)}</div>
    </section>
  );
}

function TopicInspector(props: { topic: HistoryEditorialTopic; directions: HistoryContentDirection[]; onSave: (patch: Partial<HistoryEditorialTopic>) => void }) {
  const [draft, setDraft] = useState(props.topic);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceClaim, setSourceClaim] = useState("");
  useEffect(() => setDraft(props.topic), [props.topic]);
  function addSource() {
    if (!sourceTitle.trim()) return;
    const source: HistorySourceCard = { id: `source-${Date.now()}`, title: sourceTitle.trim(), sourceType: "reference", citation: "", url: null, claim: sourceClaim.trim(), confidence: "C", notes: "" };
    setDraft({ ...draft, sourceCards: [...draft.sourceCards, source] });
    setSourceTitle(""); setSourceClaim("");
  }
  return (
    <div className="history-topic-inspector">
      <div className="history-topic-inspector__fields">
        <label>内容方向<select value={draft.directionId ?? ""} onChange={(event) => setDraft({ ...draft, directionId: event.target.value || null })}><option value="">未分类</option>{props.directions.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select></label>
        <label>切入角度<textarea value={draft.angle} onChange={(event) => setDraft({ ...draft, angle: event.target.value })} placeholder="这篇内容从哪里切进去" /></label>
        <label>开头钩子<textarea value={draft.hook} onChange={(event) => setDraft({ ...draft, hook: event.target.value })} placeholder="标题和正文必须兑现的核心问题" /></label>
        <label>目标读者<textarea value={draft.targetAudience} onChange={(event) => setDraft({ ...draft, targetAudience: event.target.value })} /></label>
        <label>风险提示<textarea value={draft.riskNotes.join("\n")} onChange={(event) => setDraft({ ...draft, riskNotes: event.target.value.split("\n").filter(Boolean) })} placeholder="争议、口径或视觉还原风险，一行一条" /></label>
        <label>发布日期<input type="date" value={draft.scheduledFor?.slice(0, 10) ?? ""} onChange={(event) => setDraft({ ...draft, scheduledFor: event.target.value || null })} /></label>
      </div>
      <div className="history-score-grid">{(["demand", "curiosity", "contrast", "collectability", "visualPotential", "evidenceStrength", "extensibility", "risk"] as const).map((key) => <label key={key}><span>{({ demand: "需求", curiosity: "好奇", contrast: "反差", collectability: "收藏", visualPotential: "视觉", evidenceStrength: "证据", extensibility: "延展", risk: "风险" })[key]}</span><input type="range" min="1" max="5" value={draft.scores[key]} onChange={(event) => setDraft({ ...draft, scores: { ...draft.scores, [key]: Number(event.target.value) } })} /><strong>{draft.scores[key]}</strong></label>)}</div>
      <div className="history-source-desk"><h4>事实资料卡</h4>{draft.sourceCards.map((source) => <article key={source.id}><select value={source.confidence} onChange={(event) => setDraft({ ...draft, sourceCards: draft.sourceCards.map((item) => item.id === source.id ? { ...item, confidence: event.target.value as HistorySourceCard["confidence"] } : item) })}><option value="A">A 直接证据</option><option value="B">B 主流共识</option><option value="C">C 存在争议</option><option value="D">D 禁止使用</option></select><div><strong>{source.title}</strong><p>{source.claim || "尚未填写可支撑内容"}</p></div><button type="button" onClick={() => setDraft({ ...draft, sourceCards: draft.sourceCards.filter((item) => item.id !== source.id) })}>移除</button></article>)}<div className="history-source-desk__new"><input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="资料名称" /><input value={sourceClaim} onChange={(event) => setSourceClaim(event.target.value)} placeholder="它能支撑什么结论" /><button type="button" onClick={addSource}>添加资料</button></div></div>
      <button type="button" className="history-topic-inspector__save" onClick={() => props.onSave({ directionId: draft.directionId, angle: draft.angle, hook: draft.hook, targetAudience: draft.targetAudience, riskNotes: draft.riskNotes, scheduledFor: draft.scheduledFor, scores: draft.scores, sourceCards: draft.sourceCards, status: draft.scheduledFor && draft.status === "ready" ? "scheduled" : draft.status })}>保存选题资料</button>
    </div>
  );
}

function SectionHeading(props: { eyebrow: string; title: string; description: string }) {
  return <header className="history-ops-heading"><div><span>{props.eyebrow}</span><h1>{props.title}</h1></div><p>{props.description}</p></header>;
}

function Metric(props: { label: string; value: string }) {
  return <div><span>{props.label}</span><strong>{props.value}</strong></div>;
}
