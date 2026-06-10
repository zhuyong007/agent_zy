import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ImageToVideoProject, KeyframeRequirement } from "@agent-zy/shared-types";

import {
  analyzeImageToVideo,
  deleteImageToVideoProject,
  fetchImageToVideoProjects,
  generateImageToVideoFinalPrompt,
  generateImageToVideoKeyframes,
  generateImageToVideoPlan,
  overrideImageToVideoKeyframe,
  resolveImageToVideoAssetUrl,
  reviewImageToVideoKeyframe
} from "../api";

const workflowSteps = ["图片分析", "视频设计", "关键帧规划", "素材审核", "最终提示词"];
const stageIndex: Record<ImageToVideoProject["stage"], number> = {
  INIT: 0,
  FIRST_IMAGE_UPLOADED: 0,
  IMAGE_ANALYZED: 0,
  VIDEO_PLAN_GENERATED: 1,
  WAITING_FOR_KEYFRAMES: 3,
  MATERIALS_READY: 3,
  FINAL_PROMPT_GENERATED: 4
};
const stageLabels: Record<ImageToVideoProject["stage"], string> = {
  INIT: "等待首图",
  FIRST_IMAGE_UPLOADED: "正在分析",
  IMAGE_ANALYZED: "分析完成",
  VIDEO_PLAN_GENERATED: "方案完成",
  WAITING_FOR_KEYFRAMES: "补充关键帧",
  MATERIALS_READY: "素材齐备",
  FINAL_PROMPT_GENERATED: "策划完成"
};
const keyframeStatusLabels: Record<KeyframeRequirement["status"], string> = {
  PENDING: "待上传",
  UPLOADED: "待审核",
  REVIEWING: "审核中",
  APPROVED: "已通过",
  REJECTED: "需调整",
  APPROVED_BY_USER: "人工通过"
};

interface ConfirmDialogState {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  action: () => void;
}

function copyText(value: string) {
  return navigator.clipboard?.writeText(value) ?? Promise.resolve();
}

function displayProjectTitle(title: string) {
  const mojibakeStart = title.search(/[ÃÂæçéèåäïð�]/);
  const cleaned = (mojibakeStart > 0 ? title.slice(0, mojibakeStart) : title).replace(/[-_\s]+$/, "").trim();
  return cleaned || "未命名策划";
}

function AssetImage({ project, assetId, alt }: { project: ImageToVideoProject; assetId?: string | null; alt: string }) {
  const asset = project.assets.find((item) => item.id === assetId);
  return asset ? <img src={resolveImageToVideoAssetUrl(asset.url)} alt={alt} /> : <div className="itv-empty-image">等待上传素材</div>;
}

function ResultLine({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="itv-result-line">
      <dt>{label}</dt>
      <dd>{value || "--"}</dd>
    </div>
  );
}

function ConfirmDialog({
  state,
  onCancel,
  onConfirm
}: {
  state: ConfirmDialogState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="itv-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="itv-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="itv-confirm-title">
        <div className={`itv-confirm-dialog__mark ${state.tone === "danger" ? "is-danger" : ""}`} aria-hidden="true">!</div>
        <div>
          <p className="eyebrow">Confirm action</p>
          <h2 id="itv-confirm-title">{state.title}</h2>
          <p>{state.description}</p>
        </div>
        <footer>
          <button type="button" className="itv-confirm-dialog__cancel" onClick={onCancel}>取消</button>
          <button type="button" className={state.tone === "danger" ? "itv-confirm-dialog__danger" : "itv-confirm-dialog__confirm"} onClick={onConfirm}>
            {state.confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

function UploadLoading({ label }: { label: string }) {
  return (
    <div className="itv-upload-loading" role="status" aria-live="polite">
      <div className="itv-upload-loading__panel">
        <span className="itv-upload-loading__spinner" aria-hidden="true" />
        <div><strong>{label}</strong><p>正在处理图片，请勿关闭页面</p></div>
      </div>
    </div>
  );
}

function ProjectInspector({
  project,
  keyframe,
  onOverride
}: {
  project: ImageToVideoProject;
  keyframe: KeyframeRequirement | null;
  onOverride: () => void;
}) {
  return (
    <aside className="itv-context">
      <header className="itv-context__header">
        <div>
          <p className="eyebrow">{keyframe ? `${keyframe.timestamp}s · ${keyframe.role}` : "Image analysis"}</p>
          <h2>{keyframe ? keyframe.purpose : "图片分析"}</h2>
        </div>
        {keyframe ? (
          <span className={`itv-status itv-status--${keyframe.status.toLowerCase()}`}>
            {keyframeStatusLabels[keyframe.status]}
          </span>
        ) : null}
      </header>

      {keyframe ? (
        <>
          <dl className="itv-inspector-list">
            <ResultLine label="所需画面" value={keyframe.requiredImageDescription} />
            <ResultLine label="衔接关系" value={keyframe.transitionRelation} />
          </dl>
          <div className="itv-prompt">
            <div><strong>生图提示词</strong><button type="button" onClick={() => void copyText(keyframe.generationPrompt)}>复制</button></div>
            <p>{keyframe.generationPrompt}</p>
          </div>
          <div className="itv-prompt itv-prompt--negative">
            <strong>负面提示词</strong>
            <p>{keyframe.negativePrompt}</p>
          </div>
          {keyframe.reviewResult ? (
            <div className="itv-review">
              <div className="itv-review__score"><span>{keyframe.reviewResult.score}</span><small>审核分</small></div>
              <div>
                <strong>{keyframe.reviewResult.approved ? "素材通过" : "建议调整"}</strong>
                <p>{keyframe.reviewResult.problems.join("；") || "未发现明显问题"}</p>
                <p>{keyframe.reviewResult.improvementAdvice}</p>
              </div>
              {!keyframe.reviewResult.approved && keyframe.imageAssetId ? (
                <button type="button" className="itv-text-danger" onClick={onOverride}>仍然使用此帧</button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <dl className="itv-inspector-list">
          <ResultLine label="主体" value={project.imageAnalysis?.subjectDescription} />
          <ResultLine label="场景" value={project.imageAnalysis?.sceneDescription} />
          <ResultLine label="建议角色" value={project.imageAnalysis?.roleSuggestion} />
          <ResultLine label="运动潜力" value={project.imageAnalysis?.motionPotential} />
          <ResultLine label="构图" value={project.imageAnalysis?.composition} />
          <ResultLine label="光线" value={project.imageAnalysis?.lighting} />
          <ResultLine label="风险" value={project.imageAnalysis?.risks.join("；")} />
        </dl>
      )}

      {keyframe && project.imageAnalysis ? (
        <details className="itv-analysis-details">
          <summary>查看首图分析</summary>
          <dl className="itv-inspector-list">
            <ResultLine label="主体" value={project.imageAnalysis.subjectDescription} />
            <ResultLine label="场景" value={project.imageAnalysis.sceneDescription} />
            <ResultLine label="运动潜力" value={project.imageAnalysis.motionPotential} />
            <ResultLine label="风险" value={project.imageAnalysis.risks.join("；")} />
          </dl>
        </details>
      ) : null}
    </aside>
  );
}

export function ImageToVideoPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const query = useQuery({ queryKey: ["image-to-video-projects"], queryFn: fetchImageToVideoProjects });
  const projects = query.data?.projects ?? [];
  const project = useMemo(
    () => projects.find((item) => item.id === selectedId) ?? projects[0] ?? null,
    [projects, selectedId]
  );
  const selectedKeyframe = project?.keyframes.find((item) => item.keyframeId === selectedKeyframeId) ?? project?.keyframes[0] ?? null;

  function storeProject(next: ImageToVideoProject) {
    queryClient.setQueryData(["image-to-video-projects"], (current: any) => ({
      projects: [next, ...(current?.projects ?? []).filter((item: ImageToVideoProject) => item.id !== next.id)],
      recentProjectIds: [next.id, ...(current?.recentProjectIds ?? []).filter((id: string) => id !== next.id)]
    }));
    setSelectedId(next.id);
  }

  const analyze = useMutation({
    mutationFn: ({ file, projectId }: { file: File; projectId?: string }) => {
      const form = new FormData();
      form.append("image", file);
      if (projectId) form.append("projectId", projectId);
      return analyzeImageToVideo(form);
    },
    onSuccess: storeProject
  });
  const plan = useMutation({ mutationFn: generateImageToVideoPlan, onSuccess: storeProject });
  const keyframes = useMutation({ mutationFn: generateImageToVideoKeyframes, onSuccess: storeProject });
  const review = useMutation({
    mutationFn: ({ projectId, keyframeId, file }: { projectId: string; keyframeId: string; file: File }) => {
      const form = new FormData();
      form.append("projectId", projectId);
      form.append("keyframeId", keyframeId);
      form.append("image", file);
      return reviewImageToVideoKeyframe(form);
    },
    onSuccess: storeProject
  });
  const override = useMutation({
    mutationFn: ({ projectId, keyframeId }: { projectId: string; keyframeId: string }) =>
      overrideImageToVideoKeyframe(projectId, keyframeId),
    onSuccess: storeProject
  });
  const finalize = useMutation({ mutationFn: generateImageToVideoFinalPrompt, onSuccess: storeProject });
  const remove = useMutation({
    mutationFn: deleteImageToVideoProject,
    onSuccess: (next) => {
      queryClient.setQueryData(["image-to-video-projects"], next);
      setSelectedId(next.projects[0]?.id ?? null);
    }
  });
  const error = [analyze.error, plan.error, keyframes.error, review.error, override.error, finalize.error, remove.error]
    .find(Boolean) as Error | undefined;
  const busy = analyze.isPending || plan.isPending || keyframes.isPending || review.isPending || override.isPending || finalize.isPending;
  const currentAssetId = selectedKeyframe?.imageAssetId ?? project?.originalImageAssetId;
  const approvedCount = project?.keyframes.filter((item) => ["APPROVED", "APPROVED_BY_USER"].includes(item.status)).length ?? 0;
  const uploadLoadingLabel = analyze.isPending
    ? project ? "正在上传并分析新首图" : "正在上传并分析首图"
    : review.isPending ? "正在上传并审核关键帧" : null;

  useEffect(() => {
    if (!confirmDialog) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirmDialog(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDialog]);

  function requestConfirm(state: ConfirmDialogState) {
    setConfirmDialog(state);
  }

  function runConfirmedAction() {
    const action = confirmDialog?.action;
    setConfirmDialog(null);
    action?.();
  }

  function projectPrimaryAction(current: ImageToVideoProject) {
    if (!current.imageAnalysis) return null;
    if (!current.videoPlan) {
      return <button type="button" className="itv-primary-action" disabled={busy} onClick={() => plan.mutate(current.id)}>{plan.isPending ? "正在设计视频..." : "生成视频方案"}</button>;
    }
    if (!current.keyframes.length) {
      return <button type="button" className="itv-primary-action" disabled={busy} onClick={() => keyframes.mutate(current.id)}>{keyframes.isPending ? "正在规划关键帧..." : "规划关键帧"}</button>;
    }
    if (current.stage === "MATERIALS_READY") {
      return <button type="button" className="itv-primary-action" disabled={busy} onClick={() => finalize.mutate(current.id)}>{finalize.isPending ? "正在生成..." : "生成最终视频提示词"}</button>;
    }
    if (current.stage === "FINAL_PROMPT_GENERATED") {
      return <button type="button" className="itv-primary-action" disabled={busy} onClick={() => finalize.mutate(current.id)}>{finalize.isPending ? "正在重新生成..." : "重新生成最终提示词"}</button>;
    }
    return <span className="itv-action-hint">上传并通过全部关键帧后，可生成最终提示词</span>;
  }

  return (
    <main className="itv-page">
      <aside className="itv-projects">
        <div className="itv-projects__header">
          <div><p className="eyebrow">Video planner</p><h2>策划项目</h2></div>
          <Link to="/" className="panel-link">返回</Link>
        </div>
        <label className="itv-new-project">
          <span aria-hidden="true">＋</span> 新建项目
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && analyze.mutate({ file: event.target.files[0] })} />
        </label>
        <nav aria-label="策划项目">
          {query.isLoading ? <p className="itv-empty-copy">正在读取策划项目...</p> : null}
          {query.error instanceof Error ? <p className="itv-empty-copy">读取失败：{query.error.message}</p> : null}
          {projects.map((item) => (
            <button key={item.id} type="button" className={item.id === project?.id ? "is-active" : ""} onClick={() => { setSelectedId(item.id); setSelectedKeyframeId(null); }}>
              <strong>{displayProjectTitle(item.title)}</strong>
              <span>{stageLabels[item.stage]}</span>
            </button>
          ))}
          {!query.isLoading && !query.error && !projects.length ? <p className="itv-empty-copy">上传第一张图片开始策划。</p> : null}
        </nav>
        <footer><span>{projects.length} 个项目</span><span>本地持久化</span></footer>
      </aside>

      <section className="itv-workspace">
        <header className="itv-topbar">
          <div className="itv-topbar__title">
            <p className="eyebrow">图片转视频策划</p>
            <h1>{project ? displayProjectTitle(project.title) : "新建策划"}</h1>
          </div>
          {project ? <button type="button" className="itv-danger" onClick={() => requestConfirm({
            title: "删除这个策划项目？",
            description: "项目、已上传素材和所有策划结果都会被永久删除，此操作无法撤销。",
            confirmLabel: "删除项目",
            tone: "danger",
            action: () => remove.mutate(project.id)
          })}>删除项目</button> : null}
        </header>

        <ol className="itv-steps">
          {workflowSteps.map((step, index) => (
            <li key={step} className={project && index <= stageIndex[project.stage] ? "is-reached" : ""}>
              <span>{index + 1}</span><strong>{step}</strong>
            </li>
          ))}
        </ol>
        {error ? <div className="itv-error">{error.message}</div> : null}

        {!project ? (
          <section className="itv-empty-state">
            <p className="eyebrow">Start with an image</p>
            <h2>上传首图，开始策划</h2>
            <p>系统将逐步完成图片分析、视频设计、关键帧审核和最终提示词。</p>
            <label className="itv-upload-button">选择首张图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && analyze.mutate({ file: event.target.files[0] })} /></label>
          </section>
        ) : (
          <>
            <section className="itv-stage">
              <div className="itv-stage__meta">
                <span>{selectedKeyframe ? `${selectedKeyframe.timestamp}s · ${selectedKeyframe.role}` : "原始首图"}</span>
                <span>{stageLabels[project.stage]}</span>
              </div>
              <div className="itv-stage__canvas">
                <AssetImage project={project} assetId={currentAssetId} alt={selectedKeyframe ? `${selectedKeyframe.role}素材` : "原始图片"} />
              </div>
              <div className="itv-stage__toolbar">
                {selectedKeyframe ? (
                  <label className="itv-secondary">
                    {review.isPending ? "审核中..." : selectedKeyframe.imageAssetId ? "替换并重新审核" : "上传补帧并审核"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={review.isPending} onChange={(event) => event.target.files?.[0] && review.mutate({ projectId: project.id, keyframeId: selectedKeyframe.keyframeId, file: event.target.files[0] })} />
                  </label>
                ) : (
                  <label className="itv-secondary">替换首图<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) requestConfirm({
                      title: "替换当前首图？",
                      description: "替换后，现有视频方案、关键帧和最终提示词都会失效，需要重新生成。",
                      confirmLabel: "替换并重新分析",
                      action: () => analyze.mutate({ file, projectId: project.id })
                    });
                  }} /></label>
                )}
                <div className="itv-stage__primary">{projectPrimaryAction(project)}</div>
              </div>
            </section>

            {project.videoPlan ? (
              <section className="itv-plan">
                <header>
                  <div><p className="eyebrow">{project.videoPlan.videoDuration} 秒视频方案</p><h2>{project.videoPlan.coreConcept}</h2></div>
                  <button type="button" className="itv-text-action" disabled={busy} onClick={() => requestConfirm({
                    title: "重新设计视频方案？",
                    description: "重新设计后，现有关键帧、审核结果和最终提示词都会被清空。",
                    confirmLabel: "重新设计",
                    action: () => plan.mutate(project.id)
                  })}>重新设计</button>
                </header>
                <dl>
                  <ResultLine label="视觉风格" value={project.videoPlan.visualStyle} />
                  <ResultLine label="镜头运动" value={project.videoPlan.cameraMovement} />
                  <ResultLine label="主体动作" value={project.videoPlan.subjectMovement} />
                  <ResultLine label="情绪变化" value={project.videoPlan.emotionalArc} />
                </dl>
              </section>
            ) : null}

            {project.keyframes.length ? (
              <section className="itv-timeline-section">
                <header>
                  <div><p className="eyebrow">Keyframe timeline</p><h2>关键帧素材</h2></div>
                  <div className="itv-timeline-actions">
                    <span>{approvedCount}/{project.keyframes.length} 已通过</span>
                    <button type="button" className="itv-text-action" disabled={busy} onClick={() => requestConfirm({
                      title: "重新规划关键帧？",
                      description: "现有补帧素材、审核结果和最终提示词都会失效。",
                      confirmLabel: "重新规划",
                      action: () => keyframes.mutate(project.id)
                    })}>重新规划</button>
                  </div>
                </header>
                <div className="itv-timeline">
                  {project.keyframes.map((item) => (
                    <button key={item.keyframeId} type="button" className={item.keyframeId === selectedKeyframe?.keyframeId ? "is-active" : ""} onClick={() => setSelectedKeyframeId(item.keyframeId)}>
                      <span>{item.timestamp}s</span><strong>{item.role}</strong><small>{keyframeStatusLabels[item.status]}</small>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {project.finalPrompt ? (
              <section className="itv-final">
                <header><div><p className="eyebrow">Final prompt</p><h2>最终视频提示词</h2></div><button type="button" onClick={() => void copyText(project.finalPrompt!.promptText)}>复制提示词</button></header>
                <p>{project.finalPrompt.promptText}</p>
                <dl><ResultLine label="负面提示词" value={project.finalPrompt.negativePrompt} /><ResultLine label="BGM" value={project.finalPrompt.bgm} /><ResultLine label="音效" value={project.finalPrompt.soundEffects.join("；")} /><ResultLine label="使用说明" value={project.finalPrompt.usageNotes} /></dl>
              </section>
            ) : null}
          </>
        )}
      </section>

      {project ? <ProjectInspector project={project} keyframe={selectedKeyframe} onOverride={() => selectedKeyframe && requestConfirm({
        title: "仍然使用这个关键帧？",
        description: "模型审核发现此帧存在风险。人工通过后，风险信息会被保留，并允许继续生成最终提示词。",
        confirmLabel: "确认使用",
        tone: "danger",
        action: () => override.mutate({ projectId: project.id, keyframeId: selectedKeyframe.keyframeId })
      })} /> : <aside className="itv-context itv-context--empty"><p>上传首图后，这里将显示分析和审核详情。</p></aside>}
      {uploadLoadingLabel ? <UploadLoading label={uploadLoadingLabel} /> : null}
      {confirmDialog ? <ConfirmDialog state={confirmDialog} onCancel={() => setConfirmDialog(null)} onConfirm={runConfirmedAction} /> : null}
    </main>
  );
}
