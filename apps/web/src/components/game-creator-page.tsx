import { useEffect, useMemo, useRef, useState } from "react";

import type {
  GameCreatorDraft,
  GameCreatorState,
  GameCreatorWorkflowStageId
} from "@agent-zy/shared-types";

import { fetchGameCreatorState, saveGameCreatorState } from "../api";
import { DataSyncControl } from "./data-sync-control";
import {
  CommandRail,
  useHomeLayoutPreferences,
  useLiveClock,
  useThemePreference
} from "./dashboard-page";

export const GAME_CREATOR_STORAGE_KEY = "agent-zy-game-creator-v1";

interface WorkflowTask {
  id: string;
  label: string;
}

interface WorkflowStage {
  id: GameCreatorWorkflowStageId;
  index: string;
  label: string;
  summary: string;
  tasks: WorkflowTask[];
}

interface QualityCheck {
  id: string;
  label: string;
  description: string;
  weight: number;
  critical?: boolean;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export interface GameCreatorRemoteActions {
  fetch: () => Promise<GameCreatorState | null>;
  save: (state: GameCreatorState) => Promise<GameCreatorState>;
}

const DEFAULT_REMOTE_ACTIONS: GameCreatorRemoteActions = {
  fetch: fetchGameCreatorState,
  save: saveGameCreatorState
};
const DEFAULT_NOW = () => new Date();

const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: "brief",
    index: "01",
    label: "定位",
    summary: "先确定观众和这期视频唯一承诺。",
    tasks: [
      { id: "brief-audience", label: "写清目标观众" },
      { id: "brief-angle", label: "选择攻略、解析、推荐、挑战或杂谈角度" },
      { id: "brief-promise", label: "用一句话写出观众看完能得到什么" }
    ]
  },
  {
    id: "script",
    index: "02",
    label: "脚本",
    summary: "先写开头和结构，再补正文。",
    tasks: [
      { id: "script-opening", label: "前 30 秒兑现标题和封面承诺" },
      { id: "script-outline", label: "拆成 3–5 个递进段落" },
      { id: "script-payoff", label: "每段安排一个信息增量或情绪看点" }
    ]
  },
  {
    id: "capture",
    index: "03",
    label: "素材",
    summary: "只录支撑叙事的证据，不堆无效游戏画面。",
    tasks: [
      { id: "capture-list", label: "列出必须录到的游戏画面与数据" },
      { id: "capture-proof", label: "关键观点有演示、对比或来源支撑" },
      { id: "capture-rights", label: "确认音乐、图片和他人素材可用" }
    ]
  },
  {
    id: "edit",
    index: "04",
    label: "剪辑",
    summary: "删掉等待和重复，让画面持续服务信息。",
    tasks: [
      { id: "edit-rough", label: "完成 5–15 分钟粗剪" },
      { id: "edit-pace", label: "清理停顿、重复和无意义过场" },
      { id: "edit-audio", label: "统一人声响度并检查字幕可读性" }
    ]
  },
  {
    id: "package",
    index: "05",
    label: "包装",
    summary: "标题与封面一起表达一个准确、具体的点击理由。",
    tasks: [
      { id: "package-title", label: "标题前半段放核心信息" },
      { id: "package-cover", label: "封面只保留一个视觉重点" },
      { id: "package-match", label: "标题、封面与开头表达同一承诺" }
    ]
  },
  {
    id: "review",
    index: "06",
    label: "质检",
    summary: "80 分且四项关键检查通过，才算质量达标。",
    tasks: [
      { id: "review-full", label: "完整观看导出成片一次" },
      { id: "review-mobile", label: "在手机尺寸检查封面和字幕" },
      { id: "review-gate", label: "完成发布质量门槛" }
    ]
  },
  {
    id: "publish",
    index: "07",
    label: "复盘",
    summary: "记录结果，让下一条视频继承有效经验。",
    tasks: [
      { id: "publish-link", label: "记录 B站稿件链接" },
      { id: "publish-data", label: "发布后补播放、留存与互动观察" },
      { id: "publish-learning", label: "写下一条保留和改进各一项" }
    ]
  }
];

const QUALITY_CHECKS: QualityCheck[] = [
  {
    id: "quality-title",
    label: "标题真实具体",
    description: "没有标题党，前半段能看懂核心价值。",
    weight: 15,
    critical: true
  },
  {
    id: "quality-cover",
    label: "封面一眼可读",
    description: "一个视觉重点，缩小后文字仍清楚。",
    weight: 15,
    critical: true
  },
  {
    id: "quality-promise",
    label: "承诺前后一致",
    description: "标题、封面、开头和正文交付同一件事。",
    weight: 15,
    critical: true
  },
  {
    id: "quality-hook",
    label: "前 30 秒成立",
    description: "快速给出结果预告、冲突或明确问题。",
    weight: 15,
    critical: true
  },
  {
    id: "quality-proof",
    label: "观点有证据",
    description: "关键结论有实机、数据、对比或可靠来源。",
    weight: 10
  },
  {
    id: "quality-pace",
    label: "节奏无空转",
    description: "没有长停顿、重复解释和无效跑图。",
    weight: 10
  },
  {
    id: "quality-audio",
    label: "声音字幕合格",
    description: "人声清楚稳定，字幕无明显错字且不挡画面。",
    weight: 10
  },
  {
    id: "quality-rights",
    label: "版权与规范安全",
    description: "素材有权使用，内容符合 B站社区与投稿规范。",
    weight: 10
  }
];

const PRE_RELEASE_TASK_IDS = WORKFLOW_STAGES
  .filter((stage) => stage.id !== "publish")
  .flatMap((stage) => stage.tasks)
  .map((task) => task.id)
  .filter((id) => id !== "review-gate");

const METHODOLOGY = [
  {
    index: "01",
    title: "先定观众，再定内容",
    body: "不限游戏不等于没有定位。每条视频只服务一类观众、解决一个问题。"
  },
  {
    index: "02",
    title: "四类选题形成组合",
    body: "可搜索攻略负责长期流量，版本热点负责时效，深度解析建立专业度，挑战与故事建立人格。"
  },
  {
    index: "03",
    title: "包装先于制作",
    body: "开拍前先写标题草案、封面核心画面和一句观众承诺；三者说不清，脚本先不扩写。"
  },
  {
    index: "04",
    title: "用兑现组织 5–15 分钟",
    body: "前 30 秒证明值得看，正文每个段落增加新信息或新冲突，结尾给结论与具体互动问题。"
  },
  {
    index: "05",
    title: "让数据指导下一条",
    body: "发布后对照点击、前段留存、平均观看与点赞投币收藏评论，判断问题在包装还是内容。"
  }
];

function getTodayKey(now: Date) {
  return now.toLocaleDateString("sv-SE");
}

function createProjectId(now: Date) {
  return `game-video-${now.getTime()}`;
}

export function createInitialGameCreatorState(now = new Date()): GameCreatorState {
  return {
    version: 1,
    date: getTodayKey(now),
    projectId: createProjectId(now),
    updatedAt: now.toISOString(),
    activeStage: "brief",
    completedTaskIds: [],
    checkedQualityIds: [],
    ready: false,
    completedVideos: 0,
    draft: {
      game: "",
      audience: "",
      format: "5–15 分钟 · B站横版中视频",
      promise: "",
      angle: "攻略 / 教学",
      title: "",
      coverCopy: "",
      opening: "",
      outline: "",
      assetNotes: "",
      editNotes: "",
      tags: "",
      publishedUrl: "",
      retrospective: ""
    }
  };
}

function isStoredGameCreatorState(value: unknown): value is Omit<GameCreatorState, "updatedAt"> & {
  updatedAt?: string;
} {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<GameCreatorState>;
  return (
    state.version === 1 &&
    typeof state.date === "string" &&
    typeof state.projectId === "string" &&
    typeof state.activeStage === "string" &&
    Array.isArray(state.completedTaskIds) &&
    Array.isArray(state.checkedQualityIds) &&
    typeof state.completedVideos === "number" &&
    typeof state.draft === "object" &&
    state.draft !== null
  );
}

function inferLegacyUpdatedAt(projectId: string, fallback: Date) {
  const timestamp = Number(projectId.replace("game-video-", ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback.toISOString();
}

function readStoredGameCreatorState(storage: StorageLike | null, now: Date) {
  try {
    const stored = storage?.getItem(GAME_CREATOR_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    if (isStoredGameCreatorState(parsed)) {
      return {
        ...parsed,
        date: getTodayKey(now),
        updatedAt:
          typeof parsed.updatedAt === "string" && !Number.isNaN(Date.parse(parsed.updatedAt))
            ? parsed.updatedAt
            : inferLegacyUpdatedAt(parsed.projectId, now)
      };
    }
  } catch {
    // A broken browser entry should never block the creator workspace.
  }

  return null;
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
    dirty:
      remote.updatedAt !== local.updatedAt ||
      JSON.stringify(remote) !== JSON.stringify(local)
  };
}

export function getQualityScore(state: GameCreatorState) {
  const checked = new Set(state.checkedQualityIds);
  return QUALITY_CHECKS.reduce(
    (score, item) => score + (checked.has(item.id) ? item.weight : 0),
    0
  );
}

export function getReadyBlockers(state: GameCreatorState) {
  const blockers: string[] = [];
  const requiredFields: Array<[keyof GameCreatorDraft, string]> = [
    ["game", "填写本期游戏"],
    ["audience", "写清目标观众"],
    ["promise", "写清观众承诺"],
    ["title", "填写标题草案"],
    ["coverCopy", "填写封面主文案"],
    ["opening", "写完前 30 秒"],
    ["outline", "写完正文结构"],
    ["assetNotes", "补齐素材与证据清单"],
    ["editNotes", "补齐剪辑检查记录"]
  ];

  requiredFields.forEach(([key, message]) => {
    if (!state.draft[key].trim()) blockers.push(message);
  });

  const score = getQualityScore(state);
  if (score < 80) blockers.push(`质量分还差 ${80 - score} 分`);

  const checked = new Set(state.checkedQualityIds);
  QUALITY_CHECKS.filter((item) => item.critical).forEach((item) => {
    if (!checked.has(item.id)) blockers.push(`关键项未过：${item.label}`);
  });

  const completed = new Set(state.completedTaskIds);
  const incompleteTaskCount = PRE_RELEASE_TASK_IDS.filter((id) => !completed.has(id)).length;
  if (incompleteTaskCount) blockers.push(`还有 ${incompleteTaskCount} 项发布前流程未完成`);

  return blockers;
}

function getDailyTargets(state: GameCreatorState) {
  const completed = new Set(state.completedTaskIds);
  const activeStage =
    WORKFLOW_STAGES.find((stage) => stage.tasks.some((task) => !completed.has(task.id))) ??
    WORKFLOW_STAGES.at(-1)!;
  const openTasks = activeStage.tasks.filter((task) => !completed.has(task.id));
  const targets = openTasks.slice(0, 2).map((task) => ({
    id: task.id,
    label: task.label,
    done: false
  }));

  if (activeStage.id === "brief" && !state.draft.game.trim()) {
    targets.unshift({
      id: "daily-game",
      label: "确定今天要做的游戏与具体问题",
      done: false
    });
  }

  if (getQualityScore(state) < 80 && targets.length < 3) {
    targets.push({
      id: "daily-quality",
      label: "把发布质量门槛推进到 80 分",
      done: false
    });
  }

  return {
    stage: activeStage,
    items: targets.slice(0, 3)
  };
}

function toggleId(items: string[], id: string) {
  return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
}

function stageProgress(state: GameCreatorState) {
  const taskCount = WORKFLOW_STAGES.reduce((count, stage) => count + stage.tasks.length, 0);
  return Math.round((state.completedTaskIds.length / taskCount) * 100);
}

function TextField({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="game-creator-field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  placeholder,
  rows = 5,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="game-creator-field">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function GameCreatorWorkspace({
  storage = typeof window === "undefined" ? null : window.localStorage,
  now = DEFAULT_NOW,
  remoteActions = DEFAULT_REMOTE_ACTIONS
}: {
  storage?: StorageLike | null;
  now?: () => Date;
  remoteActions?: GameCreatorRemoteActions | null;
}) {
  const initialSnapshot = useMemo(() => {
    const currentTime = now();
    const stored = readStoredGameCreatorState(storage, currentTime);
    return {
      hasLocalSnapshot: Boolean(stored),
      state: stored ?? createInitialGameCreatorState(currentTime)
    };
  }, [now, storage]);
  const [state, setState] = useState(initialSnapshot.state);
  const hadLocalSnapshot = useRef(initialSnapshot.hasLocalSnapshot);
  const stateRef = useRef(state);
  const [notice, setNotice] = useState("");
  const [syncDirty, setSyncDirty] = useState(true);
  const activeStage = WORKFLOW_STAGES.find((stage) => stage.id === state.activeStage) ?? WORKFLOW_STAGES[0];
  const qualityScore = getQualityScore(state);
  const blockers = getReadyBlockers(state);
  const daily = useMemo(() => getDailyTargets(state), [state]);
  const progress = stageProgress(state);

  function persistLocal(next: GameCreatorState) {
    stateRef.current = next;
    setState(next);
    try {
      storage?.setItem(GAME_CREATOR_STORAGE_KEY, JSON.stringify(next));
    } catch {
      setNotice("浏览器存储不可用，本次进度只保留到页面关闭。");
    }
  }

  function commit(next: GameCreatorState) {
    persistLocal({
      ...next,
      updatedAt: now().toISOString()
    });
    setSyncDirty(true);
  }

  function applySyncedState(next: GameCreatorState) {
    persistLocal({
      ...next,
      date: getTodayKey(now())
    });
    setSyncDirty(false);
  }

  useEffect(() => {
    if (!remoteActions) return;
    let cancelled = false;

    remoteActions.fetch()
      .then((remote) => {
        if (cancelled) return;
        const selected = chooseNewestGameCreatorState(
          stateRef.current,
          remote,
          hadLocalSnapshot.current
        );
        persistLocal({
          ...selected.state,
          date: getTodayKey(now())
        });
        setSyncDirty(selected.dirty);
      })
      .catch((error) => {
        if (cancelled) return;
        setNotice(error instanceof Error ? error.message : "读取同步数据失败");
      });

    return () => {
      cancelled = true;
    };
  }, [remoteActions, storage]);

  async function saveBeforeSync() {
    if (!remoteActions) return;
    await remoteActions.save(stateRef.current);
  }

  async function refreshAfterSync() {
    if (!remoteActions) return;
    const remote = await remoteActions.fetch();
    if (remote) applySyncedState(remote);
  }

  function updateDraft(key: keyof GameCreatorDraft, value: string) {
    commit({
      ...state,
      ready: false,
      draft: {
        ...state.draft,
        [key]: value
      }
    });
  }

  function toggleTask(id: string) {
    commit({
      ...state,
      completedTaskIds: toggleId(state.completedTaskIds, id)
    });
  }

  function toggleQuality(id: string) {
    commit({
      ...state,
      ready: false,
      checkedQualityIds: toggleId(state.checkedQualityIds, id)
    });
  }

  function markReady() {
    if (blockers.length) {
      setNotice(`还不能标记达标：${blockers[0]}`);
      return;
    }
    commit({
      ...state,
      ready: true,
      activeStage: "publish",
      completedTaskIds: state.completedTaskIds.includes("review-gate")
        ? state.completedTaskIds
        : [...state.completedTaskIds, "review-gate"]
    });
    setNotice("这条视频已达到发布门槛，可以投稿并进入数据复盘。");
  }

  function archiveVideo() {
    if (!state.ready || !state.draft.publishedUrl.trim() || !state.draft.retrospective.trim()) {
      setNotice("归档前需要先达标，并填写稿件链接和复盘结论。");
      return;
    }
    const next = createInitialGameCreatorState(now());
    commit({
      ...next,
      completedVideos: state.completedVideos + 1
    });
    setNotice("上一条已归档，下一条视频的今日计划已经生成。");
  }

  function renderStageFields() {
    if (activeStage.id === "brief") {
      return (
        <div className="game-creator-fields game-creator-fields--two">
          <TextField label="本期游戏" value={state.draft.game} placeholder="例如：黑神话：悟空"
            onChange={(value) => updateDraft("game", value)} />
          <TextField label="目标观众" value={state.draft.audience} placeholder="例如：刚过第一章、卡在配装的新玩家"
            onChange={(value) => updateDraft("audience", value)} />
          <label className="game-creator-field">
            <span>内容角度</span>
            <select value={state.draft.angle} onChange={(event) => updateDraft("angle", event.target.value)}>
              <option>攻略 / 教学</option>
              <option>机制 / 剧情解析</option>
              <option>评测 / 推荐</option>
              <option>挑战 / 实验</option>
              <option>行业 / 观点杂谈</option>
            </select>
          </label>
          <TextField label="视频规格" value={state.draft.format} placeholder="5–15 分钟 · B站横版中视频"
            onChange={(value) => updateDraft("format", value)} />
          <div className="game-creator-field game-creator-field--wide">
            <TextField label="一句话观众承诺" value={state.draft.promise}
              placeholder="看完后，观众能够……" onChange={(value) => updateDraft("promise", value)} />
          </div>
        </div>
      );
    }

    if (activeStage.id === "script") {
      return (
        <div className="game-creator-fields">
          <TextField label="工作标题" value={state.draft.title}
            placeholder="先写清价值，不急着追求花活" onChange={(value) => updateDraft("title", value)} />
          <TextAreaField label="前 30 秒" value={state.draft.opening}
            placeholder="结果预告 / 冲突 / 问题 → 为什么值得看 → 本期会给出什么"
            onChange={(value) => updateDraft("opening", value)} />
          <TextAreaField label="正文结构" value={state.draft.outline} rows={8}
            placeholder={"01 现状与问题\n02 第一个关键发现\n03 演示或对比\n04 结论与适用边界\n05 留给评论区的具体问题"}
            onChange={(value) => updateDraft("outline", value)} />
        </div>
      );
    }

    if (activeStage.id === "capture") {
      return (
        <TextAreaField label="素材清单与证据" value={state.draft.assetNotes} rows={12}
          placeholder={"实机画面：\n- 开场结果镜头\n- 操作前后对比\n\n证据与来源：\n- 版本号 / 测试条件\n- 可引用的数据或公告\n\n版权：\n- 音乐 / 图片 / 他人片段授权"}
          onChange={(value) => updateDraft("assetNotes", value)} />
      );
    }

    if (activeStage.id === "edit") {
      return (
        <TextAreaField label="剪辑检查记录" value={state.draft.editNotes} rows={12}
          placeholder={"粗剪时长：\n开头首次兑现时间：\n需要删掉的等待 / 重复：\n每段看点时间码：\n音频与字幕问题："}
          onChange={(value) => updateDraft("editNotes", value)} />
      );
    }

    if (activeStage.id === "package") {
      return (
        <div className="game-creator-fields">
          <TextField label="最终标题" value={state.draft.title}
            placeholder="核心信息放前面，准确胜过夸张" onChange={(value) => updateDraft("title", value)} />
          <TextField label="封面主文案" value={state.draft.coverCopy}
            placeholder="建议 4–10 个字，只表达一个重点" onChange={(value) => updateDraft("coverCopy", value)} />
          <TextField label="分区与标签" value={state.draft.tags}
            placeholder="游戏分区 / 游戏名 / 玩法或主题关键词" onChange={(value) => updateDraft("tags", value)} />
          <div className="game-creator-package-preview">
            <span>BILIBILI PACKAGE CHECK</span>
            <strong>{state.draft.coverCopy || "封面主文案"}</strong>
            <p>{state.draft.title || "标题会显示在这里"}</p>
            <small>{state.draft.promise || "标题、封面、开头应兑现同一个承诺"}</small>
          </div>
        </div>
      );
    }

    if (activeStage.id === "review") {
      return (
        <div className="game-creator-quality">
          <div className="game-creator-quality__score">
            <span>发布质量分</span>
            <strong>{qualityScore}</strong>
            <small>/ 100 · 门槛 80</small>
          </div>
          <div className="game-creator-quality__checks">
            {QUALITY_CHECKS.map((item) => {
              const checked = state.checkedQualityIds.includes(item.id);
              return (
                <button key={item.id} type="button"
                  className={checked ? "is-checked" : ""}
                  aria-pressed={checked}
                  onClick={() => toggleQuality(item.id)}>
                  <span>{checked ? "✓" : item.weight}</span>
                  <strong>{item.label}{item.critical ? " · 关键" : ""}</strong>
                  <small>{item.description}</small>
                </button>
              );
            })}
          </div>
          <div className={`game-creator-gate${blockers.length ? "" : " is-clear"}`}>
            <div>
              <span>{blockers.length ? "仍有阻塞" : "质量门槛已满足"}</span>
              <p>{blockers[0] ?? "四项关键检查通过，质量分达到 80，可以进入发布。"}</p>
            </div>
            <button type="button" onClick={markReady}>标记视频达标</button>
          </div>
        </div>
      );
    }

    return (
      <div className="game-creator-fields">
        <TextField label="B站稿件链接" value={state.draft.publishedUrl}
          placeholder="https://www.bilibili.com/video/..."
          onChange={(value) => updateDraft("publishedUrl", value)} />
        <TextAreaField label="发布后复盘" value={state.draft.retrospective} rows={10}
          placeholder={"包装：点击表现说明了什么？\n内容：前段留存和平均观看说明了什么？\n互动：点赞、投币、收藏、评论分别反馈了什么？\n下一条保留：\n下一条改进："}
          onChange={(value) => updateDraft("retrospective", value)} />
        <button className="game-creator-archive" type="button" onClick={archiveVideo}>
          归档并开始下一条
        </button>
      </div>
    );
  }

  return (
    <section className="game-creator-workspace">
      <header className="game-creator-header">
        <div>
          <p className="eyebrow">BILIBILI · GAME VIDEO SYSTEM</p>
          <h1>游戏创作台</h1>
          <p>每天推进一段，把想法变成一条质量达标的 5–15 分钟游戏视频。</p>
        </div>
        <div className="game-creator-header__aside">
          <div className="game-creator-header__status">
            <span>项目进度</span>
            <strong>{progress}%</strong>
            <div aria-label={`项目进度 ${progress}%`}><i style={{ width: `${progress}%` }} /></div>
            <small>已完成 {state.completedVideos} 条 · 本机自动保存</small>
          </div>
          {remoteActions ? (
            <DataSyncControl
              module="game-creator"
              dirty={syncDirty}
              beforeSync={saveBeforeSync}
              onSynced={refreshAfterSync}
            />
          ) : null}
        </div>
      </header>

      {notice ? <button type="button" className="game-creator-notice" onClick={() => setNotice("")}>{notice}</button> : null}

      <div className="game-creator-layout">
        <div className="game-creator-primary">
          <section className="game-creator-daily">
            <header>
              <div>
                <span>TODAY / {state.date}</span>
                <h2>今天只做三件事</h2>
              </div>
              <p>当前重点：{daily.stage.label}</p>
            </header>
            <ol>
              {daily.items.map((item, index) => (
                <li key={item.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.label}</strong>
                </li>
              ))}
            </ol>
          </section>

          <nav className="game-creator-stages" aria-label="视频创作阶段">
            {WORKFLOW_STAGES.map((stage) => {
              const doneCount = stage.tasks.filter((task) => state.completedTaskIds.includes(task.id)).length;
              return (
                <button key={stage.id} type="button"
                  className={`${stage.id === activeStage.id ? "is-active" : ""}${doneCount === stage.tasks.length ? " is-complete" : ""}`}
                  onClick={() => commit({ ...state, activeStage: stage.id })}>
                  <span>{stage.index}</span>
                  <strong>{stage.label}</strong>
                  <small>{doneCount}/{stage.tasks.length}</small>
                </button>
              );
            })}
          </nav>

          <section className="game-creator-stage" key={activeStage.id}>
            <header>
              <div>
                <span>STAGE {activeStage.index}</span>
                <h2>{activeStage.label}</h2>
              </div>
              <p>{activeStage.summary}</p>
            </header>
            {renderStageFields()}
            <div className="game-creator-taskline">
              {activeStage.tasks.map((task) => {
                const checked = state.completedTaskIds.includes(task.id);
                return (
                  <button key={task.id} type="button" className={checked ? "is-checked" : ""}
                    aria-pressed={checked} onClick={() => toggleTask(task.id)}>
                    <span>{checked ? "✓" : ""}</span>
                    {task.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="game-creator-method">
          <header>
            <span>METHOD / 2026.07</span>
            <h2>B站游戏内容方法论</h2>
            <p>不是爆款公式，而是一套可持续复用的创作判断。</p>
          </header>
          <div>
            {METHODOLOGY.map((item) => (
              <article key={item.index}>
                <span>{item.index}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <footer>
            <strong>复盘判断</strong>
            <p>点击弱，先改标题封面；前段掉，先改开头；中段掉，先删空转；互动弱，检查观点与提问是否具体。</p>
          </footer>
        </aside>
      </div>
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
          { label: "platform", value: "bilibili" },
          { label: "duration", value: "5–15 min" }
        ]}
      />
      <GameCreatorWorkspace />
    </main>
  );
}
