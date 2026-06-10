import { useMemo, useState } from "react";
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

const workflowSteps = ["图片分析", "视频设计", "关键帧", "素材审核", "最终提示词"];
const stageIndex: Record<ImageToVideoProject["stage"], number> = {
  INIT: 0,
  FIRST_IMAGE_UPLOADED: 0,
  IMAGE_ANALYZED: 0,
  VIDEO_PLAN_GENERATED: 1,
  WAITING_FOR_KEYFRAMES: 3,
  MATERIALS_READY: 3,
  FINAL_PROMPT_GENERATED: 4
};

function copyText(value: string) {
  return navigator.clipboard?.writeText(value) ?? Promise.resolve();
}

function AssetImage({ project, assetId, alt }: { project: ImageToVideoProject; assetId?: string | null; alt: string }) {
  const asset = project.assets.find((item) => item.id === assetId);
  return asset ? <img src={resolveImageToVideoAssetUrl(asset.url)} alt={alt} /> : <div className="itv-empty-image">等待上传</div>;
}

function ResultLine({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="itv-result-line">
      <dt>{label}</dt>
      <dd>{value || "--"}</dd>
    </div>
  );
}

function KeyframeDetail({
  project,
  keyframe,
  onReview,
  onOverride,
  pending
}: {
  project: ImageToVideoProject;
  keyframe: KeyframeRequirement;
  onReview: (file: File) => void;
  onOverride: () => void;
  pending: boolean;
}) {
  return (
    <section className="itv-keyframe-detail">
      <div className="itv-keyframe-media">
        <AssetImage project={project} assetId={keyframe.imageAssetId} alt={`${keyframe.timestamp}s ${keyframe.role}`} />
        <label className="itv-upload-button">
          {pending ? "审核中..." : keyframe.imageAssetId ? "替换并重新审核" : "上传补帧并审核"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending}
            onChange={(event) => event.target.files?.[0] && onReview(event.target.files[0])}
          />
        </label>
      </div>
      <div className="itv-inspector">
        <header>
          <div>
            <p className="eyebrow">{keyframe.timestamp}s · {keyframe.role}</p>
            <h2>{keyframe.purpose}</h2>
          </div>
          <span className={`itv-status itv-status--${keyframe.status.toLowerCase()}`}>{keyframe.status}</span>
        </header>
        <ResultLine label="所需画面" value={keyframe.requiredImageDescription} />
        <ResultLine label="衔接关系" value={keyframe.transitionRelation} />
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
            <strong>审核分数 {keyframe.reviewResult.score}</strong>
            <p>{keyframe.reviewResult.problems.join("；") || "未发现明显问题"}</p>
            <p>{keyframe.reviewResult.improvementAdvice}</p>
            {!keyframe.reviewResult.approved && keyframe.imageAssetId ? (
              <button type="button" className="itv-secondary" onClick={onOverride}>强制通过此帧</button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ImageToVideoPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
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

  function confirmReset(message: string) {
    return typeof window === "undefined" || window.confirm(message);
  }

  return (
    <main className="itv-page">
      <aside className="itv-projects">
        <div className="itv-projects__header">
          <div><p className="eyebrow">Projects</p><h2>策划项目</h2></div>
          <Link to="/" className="panel-link">工作台</Link>
        </div>
        <label className="itv-new-project">
          新建项目
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && analyze.mutate({ file: event.target.files[0] })} />
        </label>
        <nav>
          {query.isLoading ? <p className="itv-empty-copy">正在读取策划项目...</p> : null}
          {query.error instanceof Error ? <p className="itv-empty-copy">读取失败：{query.error.message}</p> : null}
          {projects.map((item) => (
            <button key={item.id} type="button" className={item.id === project?.id ? "is-active" : ""} onClick={() => setSelectedId(item.id)}>
              <strong>{item.title}</strong><span>{item.stage}</span>
            </button>
          ))}
          {!query.isLoading && !query.error && !projects.length ? <p className="itv-empty-copy">上传第一张图片开始策划。</p> : null}
        </nav>
      </aside>

      <section className="itv-workspace">
        <header className="itv-topbar">
          <div><p className="eyebrow">Image to Video Planner</p><h1>图片转视频策划</h1></div>
          {project ? <button type="button" className="itv-danger" onClick={() => window.confirm("删除这个策划项目？") && remove.mutate(project.id)}>删除</button> : null}
        </header>
        <ol className="itv-steps">
          {workflowSteps.map((step, index) => <li key={step} className={project && index <= stageIndex[project.stage] ? "is-reached" : ""}><span>{index + 1}</span>{step}</li>)}
        </ol>
        {error ? <div className="itv-error">{error.message}</div> : null}

        {!project ? (
          <section className="itv-empty-state">
            <h2>上传图片，开始分阶段策划</h2>
            <p>系统会先分析图片，再逐步设计视频、规划关键帧并审核补帧。</p>
            <label className="itv-upload-button">选择首张图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && analyze.mutate({ file: event.target.files[0] })} /></label>
          </section>
        ) : (
          <>
            <section className="itv-analysis-band">
              <div className="itv-original">
                <AssetImage project={project} assetId={project.originalImageAssetId} alt="原始图片" />
                <label className="itv-secondary">替换首图<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && confirmReset("替换首图会清空后续方案和关键帧，继续？") && analyze.mutate({ file: event.target.files[0], projectId: project.id })} /></label>
              </div>
              <dl>
                <ResultLine label="主体" value={project.imageAnalysis?.subjectDescription} />
                <ResultLine label="场景" value={project.imageAnalysis?.sceneDescription} />
                <ResultLine label="建议角色" value={project.imageAnalysis?.roleSuggestion} />
                <ResultLine label="运动潜力" value={project.imageAnalysis?.motionPotential} />
                <ResultLine label="风险" value={project.imageAnalysis?.risks.join("；")} />
              </dl>
            </section>

            <section className="itv-action-row">
              <button type="button" disabled={busy || !project.imageAnalysis} onClick={() => confirmReset("重新生成视频方案会清空关键帧和最终提示词，继续？") && plan.mutate(project.id)}>
                {plan.isPending ? "设计中..." : project.videoPlan ? "重新生成视频方案" : "确认分析并生成视频方案"}
              </button>
              <button type="button" disabled={busy || !project.videoPlan} onClick={() => confirmReset("重新规划会清空现有补帧和审核结果，继续？") && keyframes.mutate(project.id)}>
                {keyframes.isPending ? "规划中..." : project.keyframes.length ? "重新规划关键帧" : "确认方案并规划关键帧"}
              </button>
              <button type="button" disabled={busy || project.stage !== "MATERIALS_READY"} onClick={() => finalize.mutate(project.id)}>
                {finalize.isPending ? "生成中..." : "生成最终视频提示词"}
              </button>
            </section>

            {project.videoPlan ? <section className="itv-plan">
              <header><div><p className="eyebrow">{project.videoPlan.videoDuration}s Plan</p><h2>{project.videoPlan.coreConcept}</h2></div><strong>{project.videoPlan.visualStyle}</strong></header>
              <dl><ResultLine label="镜头运动" value={project.videoPlan.cameraMovement} /><ResultLine label="主体动作" value={project.videoPlan.subjectMovement} /><ResultLine label="情绪变化" value={project.videoPlan.emotionalArc} /><ResultLine label="声音" value={`${project.videoPlan.bgmSuggestion} / ${project.videoPlan.soundEffectSuggestion}`} /></dl>
            </section> : null}

            {project.keyframes.length ? <section className="itv-timeline-section">
              <header><div><p className="eyebrow">Keyframe Timeline</p><h2>关键帧与素材审核</h2></div><span>{project.keyframes.filter((item) => ["APPROVED", "APPROVED_BY_USER"].includes(item.status)).length}/{project.keyframes.length} 已通过</span></header>
              <div className="itv-timeline">{project.keyframes.map((item) => <button key={item.keyframeId} type="button" className={item.keyframeId === selectedKeyframe?.keyframeId ? "is-active" : ""} onClick={() => setSelectedKeyframeId(item.keyframeId)}><span>{item.timestamp}s</span><strong>{item.role}</strong><small>{item.status}</small></button>)}</div>
              {selectedKeyframe ? <KeyframeDetail project={project} keyframe={selectedKeyframe} pending={review.isPending} onReview={(file) => review.mutate({ projectId: project.id, keyframeId: selectedKeyframe.keyframeId, file })} onOverride={() => window.confirm("模型认为此帧存在风险，仍要强制通过？") && override.mutate({ projectId: project.id, keyframeId: selectedKeyframe.keyframeId })} /> : null}
            </section> : null}

            {project.finalPrompt ? <section className="itv-final"><header><div><p className="eyebrow">Final Prompt</p><h2>最终视频提示词</h2></div><button type="button" onClick={() => void copyText(project.finalPrompt!.promptText)}>复制提示词</button></header><p>{project.finalPrompt.promptText}</p><dl><ResultLine label="负面提示词" value={project.finalPrompt.negativePrompt} /><ResultLine label="BGM" value={project.finalPrompt.bgm} /><ResultLine label="音效" value={project.finalPrompt.soundEffects.join("；")} /><ResultLine label="使用说明" value={project.finalPrompt.usageNotes} /></dl></section> : null}
          </>
        )}
      </section>
    </main>
  );
}
