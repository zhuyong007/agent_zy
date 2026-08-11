import { useEffect, useMemo, useRef, useState } from "react";

import type {
  GameCreatorBranchKind,
  GameCreatorBranchNote,
  GameCreatorManuscript,
  GameCreatorProject,
  GameCreatorRevisionRequest,
  GameCreatorRevisionResult,
  GameCreatorState,
  GameCreatorViewId
} from "@agent-zy/shared-types";

import {
  fetchGameCreatorState,
  reviseGameCreatorManuscript,
  saveGameCreatorState
} from "../api";
import { DataSyncControl } from "./data-sync-control";
import {
  CommandRail,
  useHomeLayoutPreferences,
  useLiveClock,
  useThemePreference
} from "./dashboard-page";

export const GAME_CREATOR_STORAGE_KEY = "agent-zy-game-creator-v2";
const LEGACY_STORAGE_KEY = "agent-zy-game-creator-v1";
const DEFAULT_NOW = () => new Date();

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export interface GameCreatorRemoteActions {
  fetch: () => Promise<GameCreatorState | null>;
  save: (state: GameCreatorState) => Promise<GameCreatorState>;
}

type GameCreatorWritingAction = (
  input: GameCreatorRevisionRequest
) => Promise<GameCreatorRevisionResult>;

const DEFAULT_REMOTE_ACTIONS: GameCreatorRemoteActions = {
  fetch: fetchGameCreatorState,
  save: saveGameCreatorState
};

const VIEW_OPTIONS: Array<{ id: GameCreatorViewId; index: string; label: string; hint: string }> = [
  { id: "capture", index: "01", label: "随手记", hint: "打完一小段就记几句" },
  { id: "library", index: "02", label: "支线库", hint: "平时慢慢查、慢慢补" },
  { id: "manuscript", index: "03", label: "文稿间", hint: "短句润色，通关后串稿" }
];

const BRANCH_KINDS: Array<{ id: GameCreatorBranchKind; label: string; mark: string }> = [
  { id: "story", label: "剧情", mark: "剧" },
  { id: "character", label: "人物", mark: "人" },
  { id: "world", label: "设定", mark: "设" },
  { id: "mechanic", label: "机制", mark: "机" },
  { id: "idea", label: "灵感", mark: "想" },
  { id: "research", label: "待查", mark: "查" }
];

const REVISION_PRESETS = ["保持我的语气，只润顺", "更简洁，删掉重复", "增强画面感", "检查逻辑和事实跳跃"];

function getTodayKey(now: Date) {
  return now.toLocaleDateString("sv-SE");
}

function createId(prefix: string, now: Date) {
  return `${prefix}-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createMainManuscript(now: Date, game = ""): GameCreatorManuscript {
  const timestamp = now.toISOString();
  return {
    id: createId("game-manuscript-main", now),
    kind: "main",
    title: game ? `${game}总稿` : "总稿",
    content: "",
    sourceNoteIds: [],
    revisionMessages: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createProject(now: Date, game = ""): GameCreatorProject {
  const timestamp = now.toISOString();
  return {
    id: createId("game-project", now),
    game,
    phase: "playing",
    progress: "",
    creativeQuestion: "",
    branchNotes: [],
    manuscripts: [createMainManuscript(now, game)],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createInitialGameCreatorState(now = new Date()): GameCreatorState {
  const project = createProject(now);
  return {
    version: 2,
    date: getTodayKey(now),
    updatedAt: now.toISOString(),
    activeProjectId: project.id,
    activeView: "capture",
    selectedNoteId: null,
    selectedManuscriptId: project.manuscripts[0].id,
    projects: [project]
  };
}

function isVersionTwoState(value: unknown): value is GameCreatorState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<GameCreatorState>;
  return (
    state.version === 2 &&
    typeof state.date === "string" &&
    typeof state.updatedAt === "string" &&
    typeof state.activeProjectId === "string" &&
    Array.isArray(state.projects) &&
    state.projects.length > 0
  );
}

function migrateLegacyBrowserState(value: unknown, now: Date): GameCreatorState | null {
  if (!value || typeof value !== "object") return null;
  const legacy = value as Record<string, unknown>;
  const draft = legacy.draft;
  if (
    legacy.version !== 1 ||
    typeof legacy.projectId !== "string" ||
    typeof legacy.updatedAt !== "string" ||
    !draft ||
    typeof draft !== "object"
  ) {
    return null;
  }

  const old = draft as Record<string, unknown>;
  const game = typeof old.game === "string" ? old.game : "";
  const project = createProject(now, game);
  project.id = legacy.projectId;
  project.createdAt = legacy.updatedAt;
  project.updatedAt = legacy.updatedAt;
  project.creativeQuestion = typeof old.promise === "string" ? old.promise : "";
  const main = project.manuscripts[0];
  main.id = `${project.id}-main`;
  main.title = typeof old.title === "string" && old.title.trim() ? old.title : `${game || "未命名游戏"}总稿`;
  main.content = [old.opening, old.outline, old.editNotes]
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .join("\n\n");
  main.createdAt = legacy.updatedAt;
  main.updatedAt = legacy.updatedAt;

  if (typeof old.assetNotes === "string" && old.assetNotes.trim()) {
    const note: GameCreatorBranchNote = {
      id: `${project.id}-legacy-assets`,
      kind: "research",
      status: "expanded",
      title: "旧版素材与证据",
      body: old.assetNotes,
      gameProgress: "",
      tags: typeof old.tags === "string" ? old.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean) : [],
      source: "从旧版游戏创作台迁移",
      createdAt: legacy.updatedAt,
      updatedAt: legacy.updatedAt
    };
    project.branchNotes.push(note);
  }

  return {
    version: 2,
    date: getTodayKey(now),
    updatedAt: legacy.updatedAt,
    activeProjectId: project.id,
    activeView: main.content ? "manuscript" : "capture",
    selectedNoteId: project.branchNotes[0]?.id ?? null,
    selectedManuscriptId: main.id,
    projects: [project]
  };
}

function readStoredGameCreatorState(storage: StorageLike | null, now: Date) {
  try {
    const current = storage?.getItem(GAME_CREATOR_STORAGE_KEY);
    const parsed: unknown = current ? JSON.parse(current) : null;
    if (isVersionTwoState(parsed)) {
      return { ...parsed, date: getTodayKey(now) };
    }

    const legacy = storage?.getItem(LEGACY_STORAGE_KEY);
    return migrateLegacyBrowserState(legacy ? JSON.parse(legacy) : null, now);
  } catch {
    return null;
  }
}

export function loadGameCreatorState(
  storage: StorageLike | null = typeof window === "undefined" ? null : window.localStorage,
  now = new Date()
) {
  return readStoredGameCreatorState(storage, now) ?? createInitialGameCreatorState(now);
}

export function chooseNewestGameCreatorState(
  local: GameCreatorState,
  remote: GameCreatorState | null,
  hasLocalSnapshot = true
) {
  if (!remote) return { state: local, dirty: true };
  if (!hasLocalSnapshot) return { state: remote, dirty: false };
  if (Date.parse(remote.updatedAt) > Date.parse(local.updatedAt)) {
    return { state: remote, dirty: false };
  }
  return {
    state: local,
    dirty: remote.updatedAt !== local.updatedAt || JSON.stringify(remote) !== JSON.stringify(local)
  };
}

function kindMeta(kind: GameCreatorBranchKind) {
  return BRANCH_KINDS.find((item) => item.id === kind) ?? BRANCH_KINDS[0];
}

function formatShortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "刚刚"
    : date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function InputField(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="game-creator-input">
      <span>{props.label}</span>
      <input
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

export function GameCreatorWorkspace({
  storage = typeof window === "undefined" ? null : window.localStorage,
  now = DEFAULT_NOW,
  remoteActions = DEFAULT_REMOTE_ACTIONS,
  writingAction = reviseGameCreatorManuscript
}: {
  storage?: StorageLike | null;
  now?: () => Date;
  remoteActions?: GameCreatorRemoteActions | null;
  writingAction?: GameCreatorWritingAction;
}) {
  const initialSnapshot = useMemo(() => {
    const currentTime = now();
    const stored = readStoredGameCreatorState(storage, currentTime);
    return { hasLocalSnapshot: Boolean(stored), state: stored ?? createInitialGameCreatorState(currentTime) };
  }, [now, storage]);
  const [state, setState] = useState(initialSnapshot.state);
  const stateRef = useRef(state);
  const hadLocalSnapshot = useRef(initialSnapshot.hasLocalSnapshot);
  const [notice, setNotice] = useState("");
  const [syncDirty, setSyncDirty] = useState(true);
  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<GameCreatorBranchKind | "all">("all");
  const [capture, setCapture] = useState({
    kind: "world" as GameCreatorBranchKind,
    title: "",
    body: "",
    gameProgress: "",
    tags: "",
    source: ""
  });
  const project = state.projects.find((item) => item.id === state.activeProjectId) ?? state.projects[0];
  const selectedNote = project.branchNotes.find((item) => item.id === state.selectedNoteId) ?? null;
  const selectedManuscript =
    project.manuscripts.find((item) => item.id === state.selectedManuscriptId) ?? project.manuscripts[0];
  const mainManuscript = project.manuscripts.find((item) => item.kind === "main") ?? project.manuscripts[0];
  const filteredNotes = project.branchNotes.filter((note) => {
    const matchesKind = kindFilter === "all" || note.kind === kindFilter;
    const haystack = `${note.title} ${note.body} ${note.tags.join(" ")}`.toLowerCase();
    return matchesKind && haystack.includes(query.trim().toLowerCase());
  });

  function persistLocal(next: GameCreatorState) {
    stateRef.current = next;
    setState(next);
    try {
      storage?.setItem(GAME_CREATOR_STORAGE_KEY, JSON.stringify(next));
    } catch {
      setNotice("浏览器存储不可用，本次内容只会保留到页面关闭。");
    }
  }

  function commit(transform: GameCreatorState | ((current: GameCreatorState) => GameCreatorState)) {
    const current = stateRef.current;
    const next = typeof transform === "function" ? transform(current) : transform;
    persistLocal({ ...next, date: getTodayKey(now()), updatedAt: now().toISOString() });
    setSyncDirty(true);
  }

  function updateProject(
    transform: (current: GameCreatorProject, timestamp: string) => GameCreatorProject,
    projectId = stateRef.current.activeProjectId
  ) {
    commit((current) => {
      const timestamp = now().toISOString();
      return {
        ...current,
        projects: current.projects.map((item) =>
          item.id === projectId ? { ...transform(item, timestamp), updatedAt: timestamp } : item
        )
      };
    });
  }

  useEffect(() => {
    if (!remoteActions) return;
    let cancelled = false;
    remoteActions.fetch()
      .then((remote) => {
        if (cancelled) return;
        const selected = chooseNewestGameCreatorState(stateRef.current, remote, hadLocalSnapshot.current);
        persistLocal({ ...selected.state, date: getTodayKey(now()) });
        setSyncDirty(selected.dirty);
      })
      .catch((error) => {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "读取游戏创作数据失败");
      });
    return () => {
      cancelled = true;
    };
  }, [remoteActions, storage]);

  async function saveWorkspace() {
    if (!remoteActions) {
      setNotice("已自动保存到本机浏览器。");
      return;
    }
    setSaving(true);
    try {
      const saved = await remoteActions.save(stateRef.current);
      persistLocal({ ...saved, date: getTodayKey(now()) });
      setNotice("文稿已保存。跨设备使用时，再点一次“同步数据”。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveBeforeSync() {
    if (remoteActions) await remoteActions.save(stateRef.current);
  }

  async function refreshAfterSync() {
    if (!remoteActions) return;
    const remote = await remoteActions.fetch();
    if (remote) {
      persistLocal({ ...remote, date: getTodayKey(now()) });
      setSyncDirty(false);
    }
  }

  function switchView(view: GameCreatorViewId) {
    commit((current) => ({ ...current, activeView: view }));
  }

  function updateProjectMeta(patch: Partial<Pick<GameCreatorProject, "game" | "progress" | "creativeQuestion">>) {
    updateProject((current) => ({ ...current, ...patch }));
  }

  function addProject() {
    const nextProject = createProject(now());
    commit((current) => ({
      ...current,
      activeProjectId: nextProject.id,
      activeView: "capture",
      selectedNoteId: null,
      selectedManuscriptId: nextProject.manuscripts[0].id,
      projects: [...current.projects, nextProject]
    }));
    setCapture((current) => ({ ...current, gameProgress: "" }));
  }

  function chooseProject(projectId: string) {
    const nextProject = stateRef.current.projects.find((item) => item.id === projectId);
    if (!nextProject) return;
    commit((current) => ({
      ...current,
      activeProjectId: projectId,
      selectedNoteId: nextProject.branchNotes[0]?.id ?? null,
      selectedManuscriptId: nextProject.manuscripts[0]?.id ?? null
    }));
    setCapture((current) => ({ ...current, gameProgress: nextProject.progress }));
  }

  function markGameComplete() {
    updateProject((current) => ({ ...current, phase: "organizing" }));
    commit((current) => ({ ...current, activeView: "library" }));
    setNotice("已切到整理阶段。现在从支线库挑素材，慢慢串进总稿即可。");
  }

  function saveCapture() {
    const body = capture.body.trim();
    if (!body) {
      setNotice("先记下至少一句值得回头看的内容。");
      return;
    }
    const timestamp = now().toISOString();
    const note: GameCreatorBranchNote = {
      id: createId("game-note", now()),
      kind: capture.kind,
      status: "seed",
      title: capture.title.trim() || body.split(/\n|。|！|？/)[0].slice(0, 24) || "未命名支线",
      body,
      gameProgress: capture.gameProgress.trim() || project.progress,
      tags: capture.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      source: capture.source.trim(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    updateProject((current) => ({ ...current, branchNotes: [note, ...current.branchNotes] }));
    commit((current) => ({ ...current, selectedNoteId: note.id }));
    setCapture((current) => ({ ...current, title: "", body: "", tags: "", source: "" }));
    setNotice("支线已收进素材库。今天到这里也可以。");
  }

  function patchNote(noteId: string, patch: Partial<GameCreatorBranchNote>) {
    updateProject((current, timestamp) => ({
      ...current,
      branchNotes: current.branchNotes.map((note) =>
        note.id === noteId ? { ...note, ...patch, updatedAt: timestamp } : note
      )
    }));
  }

  function appendNoteToMain(note: GameCreatorBranchNote) {
    updateProject((current, timestamp) => ({
      ...current,
      branchNotes: current.branchNotes.map((item) =>
        item.id === note.id ? { ...item, status: "used", updatedAt: timestamp } : item
      ),
      manuscripts: current.manuscripts.map((manuscript) =>
        manuscript.id === mainManuscript.id
          ? {
              ...manuscript,
              content: `${manuscript.content.trim()}${manuscript.content.trim() ? "\n\n" : ""}${note.title}\n${note.body}`,
              sourceNoteIds: manuscript.sourceNoteIds.includes(note.id)
                ? manuscript.sourceNoteIds
                : [...manuscript.sourceNoteIds, note.id],
              updatedAt: timestamp
            }
          : manuscript
      )
    }));
    commit((current) => ({ ...current, activeView: "manuscript", selectedManuscriptId: mainManuscript.id }));
    setNotice("这条支线已放进总稿末尾，你可以再调整它的位置。");
  }

  function createFragmentFromNote(note: GameCreatorBranchNote) {
    const timestamp = now().toISOString();
    const manuscript: GameCreatorManuscript = {
      id: createId("game-manuscript", now()),
      kind: "fragment",
      title: note.title,
      content: note.body,
      sourceNoteIds: [note.id],
      revisionMessages: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    updateProject((current) => ({
      ...current,
      branchNotes: current.branchNotes.map((item) =>
        item.id === note.id ? { ...item, status: "expanded", updatedAt: timestamp } : item
      ),
      manuscripts: [...current.manuscripts, manuscript]
    }));
    commit((current) => ({ ...current, activeView: "manuscript", selectedManuscriptId: manuscript.id }));
  }

  function createBlankManuscript() {
    const timestamp = now().toISOString();
    const manuscript: GameCreatorManuscript = {
      id: createId("game-manuscript", now()),
      kind: "fragment",
      title: "新文稿",
      content: "",
      sourceNoteIds: [],
      revisionMessages: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    updateProject((current) => ({ ...current, manuscripts: [...current.manuscripts, manuscript] }));
    commit((current) => ({ ...current, selectedManuscriptId: manuscript.id }));
  }

  function patchManuscript(manuscriptId: string, patch: Partial<GameCreatorManuscript>) {
    updateProject((current, timestamp) => ({
      ...current,
      manuscripts: current.manuscripts.map((manuscript) =>
        manuscript.id === manuscriptId ? { ...manuscript, ...patch, updatedAt: timestamp } : manuscript
      )
    }));
  }

  async function askWritingAssistant() {
    if (!selectedManuscript || !instruction.trim() || writing) return;
    if (!selectedManuscript.content.trim()) {
      setNotice("先写下几句话，再让编辑帮你改。");
      return;
    }
    const askedAt = now().toISOString();
    const question = instruction.trim();
    const manuscriptId = selectedManuscript.id;
    const request: GameCreatorRevisionRequest = {
      manuscriptTitle: selectedManuscript.title,
      content: selectedManuscript.content,
      instruction: question,
      history: selectedManuscript.revisionMessages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    };
    patchManuscript(manuscriptId, {
      revisionMessages: [
        ...selectedManuscript.revisionMessages,
        { id: createId("game-revision-user", now()), role: "user", content: question, createdAt: askedAt }
      ]
    });
    setWriting(true);
    setInstruction("");
    try {
      const result = await writingAction(request);
      const currentProject = stateRef.current.projects.find((item) => item.id === stateRef.current.activeProjectId);
      const currentManuscript = currentProject?.manuscripts.find((item) => item.id === manuscriptId);
      patchManuscript(manuscriptId, {
        revisionMessages: [
          ...(currentManuscript?.revisionMessages ?? []),
          {
            id: createId("game-revision-assistant", now()),
            role: "assistant",
            content: result.reply,
            revisedText: result.revisedText,
            createdAt: now().toISOString()
          }
        ]
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "文稿修改失败");
    } finally {
      setWriting(false);
    }
  }

  function renderCaptureView() {
    return (
      <div className="game-creator-capture game-creator-view" key="capture">
        <section className="game-creator-capture__form">
          <header>
            <span>QUICK CAPTURE</span>
            <h2>刚才有什么值得单独说？</h2>
            <p>不用写完整。先留下当时的判断、疑问和画面。</p>
          </header>
          <div className="game-creator-kind-picker" aria-label="素材类型">
            {BRANCH_KINDS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={capture.kind === item.id ? "is-active" : ""}
                onClick={() => setCapture((current) => ({ ...current, kind: item.id }))}
              >
                <i>{item.mark}</i>{item.label}
              </button>
            ))}
          </div>
          <InputField
            label="给它一个名字（可以稍后再改）"
            value={capture.title}
            placeholder="例如：宗教审判所"
            onChange={(title) => setCapture((current) => ({ ...current, title }))}
          />
          <label className="game-creator-input game-creator-input--large">
            <span>先记几句</span>
            <textarea
              rows={8}
              value={capture.body}
              placeholder="它为什么让我停下来？我当时看到了什么？以后可能从哪个角度讲？"
              onChange={(event) => setCapture((current) => ({ ...current, body: event.target.value }))}
            />
          </label>
          <div className="game-creator-capture__details">
            <InputField label="游戏进度" value={capture.gameProgress} placeholder="第三章 / 12 小时"
              onChange={(gameProgress) => setCapture((current) => ({ ...current, gameProgress }))} />
            <InputField label="标签" value={capture.tags} placeholder="宗教, 权力, NPC"
              onChange={(tags) => setCapture((current) => ({ ...current, tags }))} />
            <InputField label="来源或待查链接" value={capture.source} placeholder="可留空"
              onChange={(source) => setCapture((current) => ({ ...current, source }))} />
          </div>
          <button className="game-creator-primary-action" type="button" data-action="save-branch" onClick={saveCapture}>
            收进支线库 <span>⌘ ↵</span>
          </button>
        </section>
        <aside className="game-creator-recent">
          <div className="game-creator-section-title">
            <div><span>RECENT</span><h3>最近记下</h3></div>
            <button type="button" onClick={() => switchView("library")}>查看全部 {project.branchNotes.length}</button>
          </div>
          {project.branchNotes.length ? project.branchNotes.slice(0, 4).map((note) => (
            <button
              className="game-creator-recent__item"
              type="button"
              key={note.id}
              onClick={() => commit((current) => ({ ...current, activeView: "library", selectedNoteId: note.id }))}
            >
              <i>{kindMeta(note.kind).mark}</i>
              <span><strong>{note.title}</strong><small>{note.body}</small></span>
              <time>{formatShortDate(note.updatedAt)}</time>
            </button>
          )) : (
            <div className="game-creator-empty">
              <span>01</span>
              <p>第一条不需要像选题。<br />只要是你想回头再看的东西。</p>
            </div>
          )}
          <footer>
            <strong>建议</strong>
            <p>录屏和截图仍放在原文件夹，这里只记“它为什么值得说”和文件位置，后面更容易找回来。</p>
          </footer>
        </aside>
      </div>
    );
  }

  function renderLibraryView() {
    return (
      <div className="game-creator-library game-creator-view" key="library">
        <aside className="game-creator-library__list">
          <div className="game-creator-section-title">
            <div><span>BRANCH LIBRARY</span><h2>{project.branchNotes.length} 条支线</h2></div>
            <button type="button" onClick={() => switchView("capture")}>＋ 新记录</button>
          </div>
          <input className="game-creator-search" value={query} placeholder="搜索人物、设定、关键词"
            onChange={(event) => setQuery(event.target.value)} />
          <div className="game-creator-filters">
            <button type="button" className={kindFilter === "all" ? "is-active" : ""} onClick={() => setKindFilter("all")}>全部</button>
            {BRANCH_KINDS.map((item) => (
              <button key={item.id} type="button" className={kindFilter === item.id ? "is-active" : ""}
                onClick={() => setKindFilter(item.id)}>{item.label}</button>
            ))}
          </div>
          <div className="game-creator-note-list">
            {filteredNotes.map((note) => (
              <button key={note.id} type="button" className={note.id === selectedNote?.id ? "is-active" : ""}
                onClick={() => commit((current) => ({ ...current, selectedNoteId: note.id }))}>
                <i>{kindMeta(note.kind).mark}</i>
                <span><strong>{note.title}</strong><small>{note.gameProgress || kindMeta(note.kind).label}</small></span>
                <em>{note.status === "used" ? "已入稿" : note.status === "expanded" ? "已展开" : "待整理"}</em>
              </button>
            ))}
            {!filteredNotes.length ? <p className="game-creator-list-empty">没有符合条件的支线。</p> : null}
          </div>
        </aside>
        <section className="game-creator-note-editor">
          {selectedNote ? (
            <>
              <header>
                <div><span>{kindMeta(selectedNote.kind).label} / {formatShortDate(selectedNote.updatedAt)}</span><h2>{selectedNote.title}</h2></div>
                <select value={selectedNote.status} onChange={(event) => patchNote(selectedNote.id, { status: event.target.value as GameCreatorBranchNote["status"] })}>
                  <option value="seed">待整理</option><option value="expanded">已展开</option><option value="used">已入稿</option>
                </select>
              </header>
              <div className="game-creator-note-editor__meta">
                <label><span>标题</span><input value={selectedNote.title} onChange={(event) => patchNote(selectedNote.id, { title: event.target.value })} /></label>
                <label><span>类型</span><select value={selectedNote.kind} onChange={(event) => patchNote(selectedNote.id, { kind: event.target.value as GameCreatorBranchKind })}>
                  {BRANCH_KINDS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
                <label><span>进度</span><input value={selectedNote.gameProgress} placeholder="第几章 / 几小时" onChange={(event) => patchNote(selectedNote.id, { gameProgress: event.target.value })} /></label>
              </div>
              <label className="game-creator-note-editor__body"><span>这条支线的内容</span><textarea rows={15} value={selectedNote.body}
                onChange={(event) => patchNote(selectedNote.id, { body: event.target.value })} /></label>
              <div className="game-creator-note-editor__meta game-creator-note-editor__meta--bottom">
                <label><span>标签</span><input value={selectedNote.tags.join(", ")} onChange={(event) => patchNote(selectedNote.id, { tags: event.target.value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean) })} /></label>
                <label><span>来源 / 文件位置</span><input value={selectedNote.source} onChange={(event) => patchNote(selectedNote.id, { source: event.target.value })} /></label>
              </div>
              <footer>
                <button type="button" onClick={() => createFragmentFromNote(selectedNote)}>在文稿间展开</button>
                <button className="is-primary" type="button" data-action="append-to-main" onClick={() => appendNoteToMain(selectedNote)}>加入总稿</button>
              </footer>
            </>
          ) : (
            <div className="game-creator-empty game-creator-empty--editor"><span>02</span><p>从左侧选一条支线继续整理，<br />或先去记下今天遇到的东西。</p></div>
          )}
        </section>
      </div>
    );
  }

  function renderManuscriptView() {
    return (
      <div className="game-creator-manuscript game-creator-view" key="manuscript">
        <aside className="game-creator-manuscript__list">
          <div className="game-creator-section-title">
            <div><span>MANUSCRIPTS</span><h2>文稿</h2></div>
            <button type="button" onClick={createBlankManuscript}>＋ 新文稿</button>
          </div>
          <div>
            {project.manuscripts.map((manuscript) => (
              <button key={manuscript.id} type="button" className={manuscript.id === selectedManuscript?.id ? "is-active" : ""}
                onClick={() => commit((current) => ({ ...current, selectedManuscriptId: manuscript.id }))}>
                <i>{manuscript.kind === "main" ? "总" : "稿"}</i>
                <span><strong>{manuscript.title || "未命名文稿"}</strong><small>{manuscript.content.length} 字 · {formatShortDate(manuscript.updatedAt)}</small></span>
              </button>
            ))}
          </div>
          <footer><span>已引用 {mainManuscript.sourceNoteIds.length} 条支线</span><button type="button" onClick={() => switchView("library")}>去挑素材</button></footer>
        </aside>
        {selectedManuscript ? (
          <section className="game-creator-writing-room">
            <div className="game-creator-writing-room__editor">
              <header>
                <input aria-label="文稿标题" value={selectedManuscript.title}
                  onChange={(event) => patchManuscript(selectedManuscript.id, { title: event.target.value })} />
                <div><span>本机自动保存</span><button type="button" data-action="save-manuscript" disabled={saving} onClick={() => void saveWorkspace()}>{saving ? "保存中…" : "保存文稿"}</button></div>
              </header>
              <textarea aria-label="文稿正文" value={selectedManuscript.content}
                placeholder={selectedManuscript.kind === "main" ? "通关前可以先空着。需要时，从支线库把素材放进来。" : "只有几句话也可以，先按你的方式写下来。"}
                onChange={(event) => patchManuscript(selectedManuscript.id, { content: event.target.value })} />
              <footer><span>{selectedManuscript.content.length} 字</span><span>{selectedManuscript.kind === "main" ? "总稿" : "短文稿"}</span></footer>
            </div>
            <aside className="game-creator-ai-editor">
              <header><i>AI</i><div><h3>文稿编辑</h3><p>可以只改几句话，也可以继续追问。</p></div></header>
              <div className="game-creator-ai-editor__chat">
                {!selectedManuscript.revisionMessages.length ? (
                  <div className="game-creator-ai-empty"><p>我会保留你的事实和判断，只处理你明确要求的部分。</p><small>例如：“这段太像书面语，帮我改得像人在讲。”</small></div>
                ) : selectedManuscript.revisionMessages.slice(-8).map((message) => (
                  <article key={message.id} className={`is-${message.role}`}>
                    <span>{message.role === "user" ? "你" : "编辑"}</span>
                    <p>{message.content}</p>
                    {message.revisedText ? (
                      <div><pre>{message.revisedText}</pre><button type="button" data-action="adopt-revision"
                        onClick={() => patchManuscript(selectedManuscript.id, { content: message.revisedText })}>采用这一版</button></div>
                    ) : null}
                  </article>
                ))}
                {writing ? <p className="game-creator-ai-thinking"><i /><i /><i /> 正在读你的文稿</p> : null}
              </div>
              <div className="game-creator-ai-editor__composer">
                <div className="game-creator-ai-presets">
                  {REVISION_PRESETS.map((preset) => <button type="button" key={preset} onClick={() => setInstruction(preset)}>{preset}</button>)}
                </div>
                <label><textarea rows={3} value={instruction} placeholder="这次想怎么改？不满意可以继续追问。"
                  onChange={(event) => setInstruction(event.target.value)} /><button type="button" disabled={writing || !instruction.trim()}
                    onClick={() => void askWritingAssistant()}>{writing ? "…" : "发送"}</button></label>
              </div>
            </aside>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <section className="game-creator-workspace">
      <header className="game-creator-header">
        <div className="game-creator-header__identity">
          <span>GAME NOTES / {state.date}</span>
          <input aria-label="当前游戏" value={project.game} placeholder="正在玩的游戏"
            onChange={(event) => updateProjectMeta({ game: event.target.value })} />
          <p>{project.phase === "playing" ? "边玩边收集，通关后再把它们串起来。" : project.phase === "organizing" ? "游戏已通关，正在从支线里整理出主线。" : "这一期已经完成，经验留给下一次创作。"}</p>
        </div>
        <div className="game-creator-header__project">
          <label><span>项目</span><select value={project.id} onChange={(event) => chooseProject(event.target.value)}>
            {state.projects.map((item) => <option value={item.id} key={item.id}>{item.game || "未命名游戏"}</option>)}</select></label>
          <button type="button" onClick={addProject}>＋ 新游戏</button>
        </div>
        <div className="game-creator-header__aside">
          <div className="game-creator-save-state"><i /><span>自动保存</span><small>{project.branchNotes.length} 条支线 · {project.manuscripts.length} 份文稿</small></div>
          {remoteActions ? <DataSyncControl module="game-creator" dirty={syncDirty} beforeSync={saveBeforeSync} onSynced={refreshAfterSync} /> : null}
        </div>
      </header>

      <section className="game-creator-context">
        <InputField label="当前进度" value={project.progress} placeholder="例如：第三章 / 18 小时"
          onChange={(progress) => updateProjectMeta({ progress })} />
        <InputField label="这次最想弄明白什么" value={project.creativeQuestion} placeholder="先留一个问题，不必急着有答案"
          onChange={(creativeQuestion) => updateProjectMeta({ creativeQuestion })} />
        {project.phase === "playing" ? <button type="button" onClick={markGameComplete}>已通关，开始整理</button> : <span className="game-creator-context__phase">{project.phase === "organizing" ? "整理中" : "已完成"}</span>}
      </section>

      {notice ? <button type="button" className="game-creator-notice" onClick={() => setNotice("")}>{notice}<span>×</span></button> : null}

      <nav className="game-creator-tabs" aria-label="游戏创作工作区">
        {VIEW_OPTIONS.map((view) => (
          <button key={view.id} type="button" className={state.activeView === view.id ? "is-active" : ""} onClick={() => switchView(view.id)}>
            <span>{view.index}</span><strong>{view.label}</strong><small>{view.hint}</small>
          </button>
        ))}
      </nav>

      {state.activeView === "capture" ? renderCaptureView() : state.activeView === "library" ? renderLibraryView() : renderManuscriptView()}
    </section>
  );
}

export function GameCreatorPage() {
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const { layout } = useHomeLayoutPreferences();

  return (
    <main className="workspace workspace--ops">
      <CommandRail
        activeSection="gameCreator"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[
          { label: "mode", value: "branch-first" },
          { label: "save", value: "local + sync" }
        ]}
      />
      <GameCreatorWorkspace />
    </main>
  );
}
