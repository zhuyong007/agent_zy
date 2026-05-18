import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SummaryEntry, SummaryType } from "@agent-zy/shared-types";

import {
  createSummary,
  deleteSummary,
  exportSummaries,
  fetchSummaries,
  generateSummaryDraft,
  importSummaries,
  updateSummary,
  type SummaryExportPayload
} from "../api";
import {
  CommandRail,
  useHomeLayoutPreferences,
  useLiveClock,
  useThemePreference
} from "./dashboard-page";

const typeTabs: Array<{ value: SummaryType; label: string }> = [
  { value: "daily", label: "日" },
  { value: "weekly", label: "周" },
  { value: "monthly", label: "月" },
  { value: "yearly", label: "年" }
];

function emptyDraft(summaryType: SummaryType): SummaryEntry {
  const now = new Date().toISOString();
  const date = now.slice(0, 10);

  return {
    id: "",
    summaryType,
    periodStart: date,
    periodEnd: date,
    title: "",
    rawInput: "",
    structuredFields: {},
    aiDraft: "",
    finalSummary: "",
    moodTags: [],
    energyLevel: null,
    keywords: [],
    createdAt: now,
    updatedAt: now,
    version: 1
  };
}

function formatPeriod(entry: SummaryEntry) {
  return entry.periodStart === entry.periodEnd
    ? entry.periodStart
    : `${entry.periodStart} ~ ${entry.periodEnd}`;
}

export function SummaryPage() {
  const queryClient = useQueryClient();
  const [railExpanded, setRailExpanded] = useState(true);
  const [themeKey, setThemeKey] = useThemePreference();
  const clockLine = useLiveClock();
  const { layout } = useHomeLayoutPreferences();
  const [summaryType, setSummaryType] = useState<SummaryType>("daily");
  const [query, setQuery] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<SummaryEntry>(() => emptyDraft("daily"));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const summariesQuery = useQuery({
    queryKey: ["summaries", summaryType, query, start, end],
    queryFn: () => fetchSummaries({ summaryType, q: query, start, end })
  });
  const entries = summariesQuery.data?.entries ?? [];

  useEffect(() => {
    if (selectedId && entries.some((entry) => entry.id === selectedId)) {
      return;
    }

    const first = entries[0];
    setSelectedId(first?.id ?? null);
    setEditor(first ?? emptyDraft(summaryType));
  }, [entries, selectedId, summaryType]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["summaries"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const draftMutation = useMutation({
    mutationFn: generateSummaryDraft,
    onSuccess: (draft) => {
      setEditor({
        ...draft,
        id: editor.id,
        finalSummary: editor.finalSummary || draft.finalSummary
      });
      invalidate();
    }
  });
  const saveMutation = useMutation({
    mutationFn: (entry: SummaryEntry) => entry.id ? updateSummary(entry.id, entry) : createSummary(entry),
    onSuccess: (entry) => {
      setSelectedId(entry.id);
      setEditor(entry);
      invalidate();
    }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSummary,
    onSuccess: () => {
      setSelectedId(null);
      setEditor(emptyDraft(summaryType));
      invalidate();
    }
  });
  const exportMutation = useMutation({
    mutationFn: exportSummaries,
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `agent-zy-summaries-${payload.exportedAt.slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  });
  const importMutation = useMutation({
    mutationFn: importSummaries,
    onSuccess: invalidate
  });

  function selectEntry(entry: SummaryEntry) {
    setSelectedId(entry.id);
    setEditor(entry);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate({
      ...editor,
      summaryType
    });
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const payload = JSON.parse(await file.text()) as SummaryExportPayload;
    importMutation.mutate(payload);
    event.target.value = "";
  }

  return (
    <main className="workspace workspace--ops">
      <CommandRail
        activeSection="summary"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[
          { label: "view", value: "summaries" },
          { label: "count", value: String(entries.length) }
        ]}
      />

      <section className="summary-center">
        <header className="summary-center__header">
          <div>
            <p className="eyebrow">Reflection System</p>
            <h1>总结中心</h1>
          </div>
          <div className="summary-center__actions">
            <button type="button" onClick={() => setEditor(emptyDraft(summaryType))}>
              新建总结
            </button>
            <button type="button" onClick={() => exportMutation.mutate()}>
              JSON 导出
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              JSON 导入
            </button>
            <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImport} />
          </div>
        </header>

        <div className="summary-center__tabs" role="tablist" aria-label="总结类型">
          {typeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={summaryType === tab.value ? "is-active" : ""}
              onClick={() => {
                setSummaryType(tab.value);
                setSelectedId(null);
                setEditor(emptyDraft(tab.value));
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="summary-center__filters">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、关键词、正文" />
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
        </div>

        <div className="summary-center__grid">
          <aside className="summary-list">
            {entries.length > 0 ? (
              entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={entry.id === selectedId ? "is-active" : ""}
                  onClick={() => selectEntry(entry)}
                >
                  <span>{formatPeriod(entry)}</span>
                  <strong>{entry.title || "未命名总结"}</strong>
                  <small>{entry.keywords.slice(0, 3).join(" / ") || "无关键词"}</small>
                </button>
              ))
            ) : (
              <div className="edge-empty">还没有这个类型的总结。</div>
            )}
          </aside>

          <form className="summary-editor" onSubmit={handleSubmit}>
            <input
              value={editor.title}
              onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))}
              placeholder="总结标题"
            />
            <div className="summary-editor__period">
              <input
                type="date"
                value={editor.periodStart}
                onChange={(event) => setEditor((current) => ({ ...current, periodStart: event.target.value }))}
              />
              <input
                type="date"
                value={editor.periodEnd}
                onChange={(event) => setEditor((current) => ({ ...current, periodEnd: event.target.value }))}
              />
            </div>
            <textarea
              value={editor.rawInput}
              onChange={(event) => setEditor((current) => ({ ...current, rawInput: event.target.value }))}
              placeholder="原始记录素材"
              rows={5}
            />
            <textarea
              value={editor.finalSummary}
              onChange={(event) => setEditor((current) => ({ ...current, finalSummary: event.target.value }))}
              placeholder="正式总结"
              rows={8}
            />
            <div className="summary-editor__actions">
              <button
                type="button"
                onClick={() => draftMutation.mutate({ summaryType, rawInput: editor.rawInput })}
                disabled={!editor.rawInput.trim() || draftMutation.isPending}
              >
                重新生成草稿
              </button>
              <button
                type="button"
                onClick={() => setEditor((current) => ({ ...current, finalSummary: current.aiDraft }))}
                disabled={!editor.aiDraft}
              >
                草稿转正式
              </button>
              {editor.id ? (
                <button type="button" onClick={() => deleteMutation.mutate(editor.id)}>
                  删除
                </button>
              ) : null}
              <button type="submit" disabled={saveMutation.isPending}>
                保存总结
              </button>
            </div>
          </form>

          <aside className="summary-insight">
            <p className="eyebrow">AI Insight</p>
            <h2>草稿与观察</h2>
            <p>{editor.aiDraft || "输入原始记录后生成草稿。"}</p>
            <div>
              <span>情绪</span>
              <strong>{editor.moodTags.join(" / ") || "未标记"}</strong>
            </div>
            <div>
              <span>关键词</span>
              <strong>{editor.keywords.join(" / ") || "未提取"}</strong>
            </div>
            <Link to="/">返回工作台</Link>
          </aside>
        </div>
        {draftMutation.isError || saveMutation.isError || importMutation.isError ? (
          <div className="news-error">总结操作失败，请检查输入内容。</div>
        ) : null}
      </section>
    </main>
  );
}
