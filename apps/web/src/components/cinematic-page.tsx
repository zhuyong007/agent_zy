import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CinematicProject, StoryboardShot } from "@agent-zy/shared-types";

import {
  type CinematicGenerateInput,
  deleteCinematicProject,
  fetchCinematic,
  fetchDashboard,
  generateCinematic,
  openDashboardStream,
  updateCinematicProject
} from "../api";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";

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

export function buildStoryboardVideoPrompt(project: CinematicProject) {
  const limit = 500;
  const compact = (value: string | undefined, maxLength: number) =>
    Array.from((value ?? "").replace(/\s+/g, " ").trim()).slice(0, maxLength).join("");
  const buildShotChain = (maxLength: number, tokenSize: { title: number; movement: number; transition: number }) => {
    const tokens = project.storyboard.map((shot, index) =>
      `${index + 1}.${compact(shot.title, tokenSize.title)}/${compact(shot.cameraMovement, tokenSize.movement)}/${compact(shot.transition, tokenSize.transition)}`
    );
    const selected: string[] = [];

    for (const token of tokens) {
      const next = [...selected, token].join("→");
      const remaining = tokens.length - selected.length - 1;
      const suffix = remaining > 0 ? `→后续${remaining}镜沿同一空间推进` : "";

      if ((next + suffix).length <= maxLength) {
        selected.push(token);
      } else {
        break;
      }
    }

    if (!selected.length) {
      return tokens.length ? `1.${compact(project.storyboard[0]?.title, 6)}` : "按分镜顺序推进";
    }

    const remaining = tokens.length - selected.length;
    const chain = selected.join("→");
    const suffix = remaining > 0 ? `→后续${remaining}镜沿同一空间推进` : "";

    return chain + suffix;
  };
  const buildSceneAnchors = (maxAnchorLength: number) =>
    project.scenePlan?.scenes.length
      ? project.scenePlan.scenes
          .slice(0, 3)
          .map((scene) => `${scene.id}:${compact(scene.anchor, maxAnchorLength)}`)
          .join("；")
      : `scene-1:${compact(project.storyboard[0]?.sceneAnchor || project.storyboard[0]?.composition || project.concept, maxAnchorLength)}`;
  const sceneCount = project.scenePlan?.sceneCount ?? Math.min(Math.max(project.storyboard.length ? 1 : 0, 1), 3);
  const maxDurationSeconds = project.scenePlan?.maxDurationSeconds ?? 15;
  const buildPrompt = (options: {
    sceneAnchorLength: number;
    shotChainLength: number;
    continuityLength: number;
    styleLength: number;
    tokenSize: { title: number; movement: number; transition: number };
  }) => {
    const continuity =
      compact(project.continuity?.spatialLine, options.continuityLength) ||
      `围绕${compact(project.concept, 18)}保持同一地点、主体位置、光线方向和景别关系`;
    const style = compact(project.style || "电影感", options.styleLength);

    return [
      `请按上传顺序把${project.storyboard.length}张分镜图生成一条连贯视频，总长≤${maxDurationSeconds}秒，画面连贯优先。`,
      `只用${sceneCount}个连续场景（最多1-3个），不要一图一景；场景锚点：${buildSceneAnchors(options.sceneAnchorLength)}。`,
      "保持角色、服装、主体构图、光线方向、色彩和画幅一致，禁止变脸、跳切、场景漂移、字幕水印。",
      `镜头运动是串联重点，镜头链：${buildShotChain(options.shotChainLength, options.tokenSize)}。`,
      `连续性：${continuity}。`,
      `整体风格：${style}；画面质感和速度变化保持统一。`
    ].join("");
  };
  const attempts = [
    { sceneAnchorLength: 42, shotChainLength: 190, continuityLength: 74, styleLength: 34, tokenSize: { title: 8, movement: 6, transition: 6 } },
    { sceneAnchorLength: 30, shotChainLength: 150, continuityLength: 54, styleLength: 24, tokenSize: { title: 7, movement: 5, transition: 5 } },
    { sceneAnchorLength: 22, shotChainLength: 110, continuityLength: 38, styleLength: 18, tokenSize: { title: 6, movement: 4, transition: 4 } }
  ];

  for (const options of attempts) {
    const prompt = buildPrompt(options);

    if (prompt.length <= limit) {
      return prompt;
    }
  }

  return `请按上传顺序把${project.storyboard.length}张分镜图生成一条连贯视频，总长≤${maxDurationSeconds}秒；只用${sceneCount}个连续场景，不要一图一景。镜头链：${buildShotChain(96, { title: 5, movement: 3, transition: 3 })}。保持角色、服装、构图、光线和色彩一致，禁止变脸、跳切、场景漂移、字幕水印。`;
}

export function buildCinematicMarkdown(project: CinematicProject) {
  const shots = project.storyboard
    .map(
      (shot, index) => `## ${index + 1}. ${shot.title}

- 目标：${shot.purpose}
- 时长：${shot.duration}
- 镜头类型：${shot.shotType}
- 摄影机运动：${shot.cameraMovement}
- 构图：${shot.composition}
- 转场：${shot.transition}
- 声音：${shot.audioHint}
- 情绪：${shot.emotionalBeat}

### 中文提示词

${shot.prompt.zh}

### English Prompt

${shot.prompt.en}`
    )
    .join("\n\n");

  return `# ${project.title}

- 概念：${project.concept}
- 核心情绪：${project.mood}
- 风格：${project.style}
- 节奏：${project.pace}
- 镜头数：${project.storyboard.length}

## 短视频文案

${project.script}

## 分镜串联视频提示词

${buildStoryboardVideoPrompt(project)}

${shots}
`;
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function copyText(value: string) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(value);
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

function buildGenerateInput(input: {
  concept: string;
  style: string;
  visualStyle: string;
  pace: string;
  visualFocus: string;
  negativePrompt: string;
  targetShotCount: number | "";
}): CinematicGenerateInput {
  return {
    concept: input.concept.trim(),
    style: input.style.trim() || undefined,
    visualStyle: input.visualStyle.trim() || undefined,
    pace: input.pace.trim() || undefined,
    visualFocus: input.visualFocus.trim() || undefined,
    negativePrompt: input.negativePrompt.trim() || undefined,
    targetShotCount: typeof input.targetShotCount === "number" ? input.targetShotCount : undefined
  };
}

function ShotList({
  project,
  selectedShotId,
  onSelectShot
}: {
  project: CinematicProject;
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
}) {
  return (
    <div className="cinematic-shot-list" aria-label="分镜结构">
      {project.storyboard.map((shot, index) => (
        <button
          key={shot.id}
          type="button"
          className={`cinematic-shot-item${shot.id === selectedShotId ? " is-active" : ""}`}
          onClick={() => onSelectShot(shot.id)}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{shot.title}</strong>
          <p>{shot.purpose}</p>
          <small>{shot.duration} · {shot.cameraMovement}</small>
        </button>
      ))}
    </div>
  );
}

function ShotDetail({ shot }: { shot: StoryboardShot | null }) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!shot) {
    return <div className="edge-empty">选择一个镜头查看详细提示词。</div>;
  }

  const currentShot = shot;

  async function handleCopy(kind: "zh" | "en" | "both") {
    const value =
      kind === "both"
        ? `${currentShot.prompt.zh}\n\n${currentShot.prompt.en}`
        : kind === "zh"
          ? currentShot.prompt.zh
          : currentShot.prompt.en;

    await copyText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <article className="cinematic-shot-detail">
      <header>
        <span>{shot.shotType}</span>
        <h2>{shot.title}</h2>
        <p>{shot.emotionalBeat}</p>
      </header>
      <section className="cinematic-prompt-block">
        <div>
          <h3>中文提示词</h3>
          <button type="button" onClick={() => void handleCopy("zh")}>
            {copied === "zh" ? "已复制" : "复制"}
          </button>
        </div>
        <p>{shot.prompt.zh}</p>
      </section>
      <section className="cinematic-prompt-block">
        <div>
          <h3>English Prompt</h3>
          <button type="button" onClick={() => void handleCopy("en")}>
            {copied === "en" ? "Copied" : "Copy"}
          </button>
        </div>
        <p>{shot.prompt.en}</p>
      </section>
      <button type="button" className="cinematic-copy-all" onClick={() => void handleCopy("both")}>
        {copied === "both" ? "中英提示词已复制" : "一键复制提示词"}
      </button>
    </article>
  );
}

function StoryboardVideoPromptPanel({ project }: { project: CinematicProject | null }) {
  const [copied, setCopied] = useState(false);

  if (!project) {
    return null;
  }

  const prompt = buildStoryboardVideoPrompt(project);

  async function handleCopy() {
    await copyText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="cinematic-prompt-block cinematic-prompt-block--video">
      <div>
        <h3>分镜串联视频提示词</h3>
        <button type="button" onClick={() => void handleCopy()}>
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <p>{prompt}</p>
    </section>
  );
}

export function CinematicPage() {
  const queryClient = useQueryClient();
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [concept, setConcept] = useState("");
  const [style, setStyle] = useState("");
  const [visualStyle, setVisualStyle] = useState("");
  const [pace, setPace] = useState("");
  const [visualFocus, setVisualFocus] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [targetShotCount, setTargetShotCount] = useState<number | "">("");
  const { layout } = useHomeLayoutPreferences();

  const cinematicQuery = useQuery({
    queryKey: ["cinematic"],
    queryFn: fetchCinematic
  });
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard
  });
  const generateMutation = useMutation({
    mutationFn: generateCinematic,
    onSuccess: (next) => {
      queryClient.setQueryData(["cinematic"], next);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSelectedProjectId(next.recentProjectIds[0] ?? next.projects[0]?.id ?? null);
      setConcept("");
    }
  });
  const updateMutation = useMutation({
    mutationFn: (input: { id: string; patch: Partial<CinematicProject> }) =>
      updateCinematicProject(input.id, input.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cinematic"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCinematicProject(id),
    onSuccess: (next) => {
      queryClient.setQueryData(["cinematic"], next);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      const nextProject = next.projects.find((project) => project.id === next.recentProjectIds[0]) ?? next.projects[0] ?? null;
      setSelectedProjectId(nextProject?.id ?? null);
      setSelectedShotId(nextProject?.storyboard[0]?.id ?? null);
    }
  });

  useEffect(() => {
    return openDashboardStream((data) => {
      queryClient.setQueryData(["home-layout"], data.homeLayout);
      queryClient.setQueryData(["dashboard"], data);
      queryClient.setQueryData(["cinematic"], data.cinematic);
    });
  }, [queryClient]);

  const cinematic = cinematicQuery.data ?? dashboardQuery.data?.cinematic;
  const projects = cinematic?.projects ?? [];
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId]
  );
  const selectedShot = useMemo(
    () => selectedProject?.storyboard.find((shot) => shot.id === selectedShotId) ?? selectedProject?.storyboard[0] ?? null,
    [selectedProject, selectedShotId]
  );

  useEffect(() => {
    if (selectedProject && selectedProject.id !== selectedProjectId) {
      setSelectedProjectId(selectedProject.id);
    }
  }, [selectedProject, selectedProjectId]);

  useEffect(() => {
    if (selectedShot && selectedShot.id !== selectedShotId) {
      setSelectedShotId(selectedShot.id);
    }
  }, [selectedShot, selectedShotId]);

  if (cinematicQuery.isLoading && !cinematic) {
    return <div className="loading-shell">正在连接电影镜头设计台...</div>;
  }

  return (
    <main className="workspace cinematic-workspace">
      <CommandRail
        activeSection="cinematic"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[
          { label: "projects", value: String(projects.length) },
          { label: "shots", value: String(projects.reduce((count, project) => count + project.storyboard.length, 0)) },
          { label: "更新", value: formatDateTime(cinematic?.lastGeneratedAt) }
        ]}
      />

      <section className="cinematic-board">
        <aside className="cinematic-projects">
          <div className="cinematic-section-heading">
            <p className="eyebrow">Concepts</p>
            <h1>电影镜头设计</h1>
          </div>
          <form
            className="cinematic-generate-form"
            onSubmit={(event) => {
              event.preventDefault();
              generateMutation.mutate(buildGenerateInput({ concept, style, visualStyle, pace, visualFocus, negativePrompt, targetShotCount }));
            }}
          >
            <div className="cinematic-generate-form__lead">
              <span>新建分镜</span>
              <p>只填你确定的内容；全部留空时，AI 会自行选择概念、风格、节奏和镜头数量。</p>
            </div>
            <label className="cinematic-field cinematic-field--concept">
              <span>画面概念（可留空）</span>
              <textarea
                value={concept}
                onChange={(event) => setConcept(event.target.value)}
                placeholder="例如：孤独感的城市夜晚。留空则由 AI 自选一个适合生成的电影概念。"
                aria-label="视频概念"
              />
            </label>
            <div className="cinematic-optional-grid">
              <label className="cinematic-field">
                <span>风格偏好（可留空）</span>
                <input
                  value={style}
                  onChange={(event) => setStyle(event.target.value)}
                  placeholder="例如：冷蓝霓虹、低饱和胶片感"
                  aria-label="风格"
                />
              </label>
              <label className="cinematic-field">
                <span>画面风格（可选）</span>
                <select
                  value={visualStyle}
                  onChange={(event) => setVisualStyle(event.target.value)}
                  aria-label="画面风格"
                >
                  <option value="">自动</option>
                  <option value="真实影像">真实</option>
                  <option value="动漫">动漫</option>
                  <option value="插画">插画</option>
                  <option value="3D 渲染">3D</option>
                </select>
              </label>
              <label className="cinematic-field">
                <span>必须出现的静态画面元素（可留空）</span>
                <input
                  value={visualFocus}
                  onChange={(event) => setVisualFocus(event.target.value)}
                  placeholder="例如：红色雨伞、便利店门口、湿润柏油路"
                  aria-label="静态画面元素"
                />
              </label>
              <label className="cinematic-field">
                <span>不要出现的内容（可留空）</span>
                <input
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder="例如：瞳孔变化、文字水印、怪物化"
                  aria-label="不要出现的内容"
                />
              </label>
              <label className="cinematic-field">
                <span>节奏偏好（可留空）</span>
                <input
                  value={pace}
                  onChange={(event) => setPace(event.target.value)}
                  placeholder="例如：缓慢建立，结尾留白"
                  aria-label="节奏"
                />
              </label>
              <label className="cinematic-field">
                <span>镜头数量（可留空）</span>
                <input
                  type="number"
                  min={4}
                  max={12}
                  value={targetShotCount}
                  onChange={(event) =>
                    setTargetShotCount(event.target.value ? Number(event.target.value) : "")
                  }
                  placeholder="自动"
                  aria-label="镜头数量"
                />
              </label>
            </div>
            <div className="cinematic-generate-actions">
              <button type="submit" disabled={generateMutation.isPending}>
                {generateMutation.isPending ? "生成中..." : "生成分镜"}
              </button>
              <button
                type="button"
                className="cinematic-generate-actions__ghost"
                disabled={generateMutation.isPending}
                onClick={() => {
                  setConcept("");
                  setStyle("");
                  setVisualStyle("");
                  setPace("");
                  setVisualFocus("");
                  setNegativePrompt("");
                  setTargetShotCount("");
                  generateMutation.mutate({
                    concept: ""
                  });
                }}
              >
                一切交给 AI
              </button>
            </div>
          </form>
          <div className="cinematic-project-list" aria-label="项目列表">
            {projects.length > 0 ? (
              projects.map((project) => (
                <div
                  key={project.id}
                  className="cinematic-project-card-shell"
                >
                  <button
                    type="button"
                    className={`cinematic-project-card${project.id === selectedProject?.id ? " is-active" : ""}`}
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setSelectedShotId(project.storyboard[0]?.id ?? null);
                    }}
                  >
                    <span>{formatDateTime(project.updatedAt)}</span>
                    <strong>{project.title}</strong>
                    <p>{project.concept}</p>
                  </button>
                  <button
                    type="button"
                    className="cinematic-project-delete"
                    aria-label={`删除生成历史：${project.title}`}
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(project.id)}
                  >
                    删除
                  </button>
                </div>
              ))
            ) : (
              <div className="edge-empty">暂无分镜项目。</div>
            )}
          </div>
          <Link to="/" className="history-archive__back">
            返回首页工作台
          </Link>
        </aside>

        <section className="cinematic-structure">
          {selectedProject ? (
            <>
              <header className="cinematic-hero">
                <div>
                  <p className="eyebrow">Storyboard</p>
                  <h2>{selectedProject.title}</h2>
                  <p>{selectedProject.script}</p>
                </div>
                <div className="cinematic-export-actions">
                  <button
                    type="button"
                    onClick={() => {
                      generateMutation.mutate({
                        concept: selectedProject.concept,
                        style: selectedProject.style || undefined,
                        pace: selectedProject.pace || undefined,
                        targetShotCount: selectedProject.targetShotCount
                      });
                    }}
                    disabled={generateMutation.isPending}
                  >
                    重新生成分镜
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText(`${selectedProject.title}.md`, buildCinematicMarkdown(selectedProject), "text/markdown")}
                  >
                    导出 markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText(`${selectedProject.title}.json`, JSON.stringify(selectedProject, null, 2), "application/json")}
                  >
                    导出 JSON
                  </button>
                </div>
              </header>
              <div className="cinematic-project-controls">
                <label>
                  <span>风格</span>
                  <input
                    value={selectedProject.style}
                    onChange={(event) =>
                      updateMutation.mutate({ id: selectedProject.id, patch: { style: event.target.value } })
                    }
                  />
                </label>
                <label>
                  <span>节奏</span>
                  <input
                    value={selectedProject.pace}
                    onChange={(event) =>
                      updateMutation.mutate({ id: selectedProject.id, patch: { pace: event.target.value } })
                    }
                  />
                </label>
                <label>
                  <span>镜头数</span>
                  <input
                    type="number"
                    min={4}
                    max={12}
                    value={selectedProject.targetShotCount}
                    onChange={(event) =>
                      updateMutation.mutate({
                        id: selectedProject.id,
                        patch: { targetShotCount: Number(event.target.value) || selectedProject.targetShotCount }
                      })
                    }
                  />
                </label>
              </div>
              <div className="cinematic-section-heading">
                <p className="eyebrow">Shot Plan</p>
                <h2>分镜结构</h2>
              </div>
              <ShotList project={selectedProject} selectedShotId={selectedShot?.id ?? null} onSelectShot={setSelectedShotId} />
            </>
          ) : (
            <div className="edge-empty">输入一个概念，生成第一套电影镜头设计。</div>
          )}
        </section>

        <aside className="cinematic-detail">
          <StoryboardVideoPromptPanel project={selectedProject} />
          <ShotDetail shot={selectedShot} />
        </aside>
      </section>
      {generateMutation.isError ? (
        <div className="news-error">
          错误：
          {generateMutation.error instanceof Error ? generateMutation.error.message : "电影分镜生成失败"}
        </div>
      ) : null}
    </main>
  );
}
