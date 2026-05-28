import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ClassicShotProject, ClassicShotStoryboard, ClassicShotTargetPlatform } from "@agent-zy/shared-types";

import { fetchClassicShots, generateClassicShot, generateClassicShotFromVideo } from "../api";

const platformOptions: Array<{ value: ClassicShotTargetPlatform; label: string }> = [
  { value: "generic", label: "通用" },
  { value: "jianying", label: "剪映" },
  { value: "jimeng", label: "即梦" },
  { value: "kling", label: "可灵" },
  { value: "runway", label: "Runway" },
  { value: "seedance", label: "Seedance" }
];

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

function SourceBlock({ project }: { project: ClassicShotProject }) {
  return (
    <section className="cinematic-prompt-block">
      <div>
        <h3>镜头出处</h3>
      </div>
      <p>
        导演：{project.source.director}
        <br />
        电影：{project.source.film}
        <br />
        上映年份：{project.source.year}
        <br />
        经典镜头名称：{project.source.shotName}
        <br />
        镜头位置：{project.source.shotPosition}
      </p>
    </section>
  );
}

function ShotPrompt({ shot }: { shot: ClassicShotStoryboard }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyText(shot.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="cinematic-prompt-block">
      <div>
        <h3>{shot.title}</h3>
        <button type="button" onClick={() => void handleCopy()}>
          {copied ? "已复制" : "复制分镜提示词"}
        </button>
      </div>
      <p>{shot.function}</p>
      <p>{shot.prompt}</p>
      <p>
        运镜关键词：{shot.movementKeywords.join(" / ")}
        <br />
        画面关键词：{shot.visualKeywords.join(" / ")}
      </p>
    </section>
  );
}

function MarkdownPanel({ project }: { project: ClassicShotProject }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyText(project.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="cinematic-prompt-block cinematic-prompt-block--video">
      <div>
        <h3>完整 Markdown</h3>
        <button type="button" onClick={() => void handleCopy()}>
          {copied ? "已复制" : "复制完整 Markdown"}
        </button>
      </div>
      <p>{project.markdown}</p>
    </section>
  );
}

export function ClassicShotPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"text" | "video">("text");
  const [input, setInput] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [revisionInstruction, setRevisionInstruction] = useState("保留镜头结构，改变画面风格和场景，避免生成一模一样的视频");
  const [frameCount, setFrameCount] = useState(6);
  const [targetPlatform, setTargetPlatform] = useState<ClassicShotTargetPlatform>("generic");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const classicShotsQuery = useQuery({
    queryKey: ["classic-shots"],
    queryFn: fetchClassicShots
  });
  const generateMutation = useMutation({
    mutationFn: () =>
      generateClassicShot({
        input: input.trim() || "随机生成一个经典镜头",
        targetPlatform
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["classic-shots"], next);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSelectedProjectId(next.recentProjectIds[0] ?? next.projects[0]?.id ?? null);
      setInput("");
    }
  });
  const videoGenerateMutation = useMutation({
    mutationFn: () => {
      if (!videoFile) {
        throw new Error("请先选择视频文件");
      }

      const formData = new FormData();
      formData.append("video", videoFile);
      formData.append("targetPlatform", targetPlatform);
      formData.append("frameCount", String(frameCount));
      formData.append("revisionInstruction", revisionInstruction.trim());

      return generateClassicShotFromVideo(formData);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["classic-shots"], next);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSelectedProjectId(next.recentProjectIds[0] ?? next.projects[0]?.id ?? null);
      setVideoFile(null);
    }
  });

  const projects = classicShotsQuery.data?.projects ?? [];
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId]
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!generateMutation.isPending) {
      generateMutation.mutate();
    }
  }

  function handleVideoSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!videoGenerateMutation.isPending) {
      videoGenerateMutation.mutate();
    }
  }

  return (
    <main className="cinematic-page">
      <header className="cinematic-page__topbar">
        <div>
          <p className="eyebrow">Classic Shot Recreation</p>
          <h1>经典镜头复刻</h1>
          <p>把有明确出处的经典电影镜头拆解成可直接投喂 AI 视频工具的连续分镜提示词。</p>
        </div>
        <Link to="/" className="panel-link">
          返回工作台
        </Link>
      </header>

      <section className="cinematic-workbench">
        <aside className="cinematic-sidebar">
          <div className="cinematic-mode-tabs" aria-label="经典镜头复刻模式">
            <button type="button" className={mode === "text" ? "is-active" : ""} onClick={() => setMode("text")}>
              文本复刻
            </button>
            <button
              type="button"
              className={mode === "video" ? "is-active" : ""}
              onClick={() => setMode("video")}
              data-testid="classic-shot-video-tab"
            >
              上传视频复刻
            </button>
          </div>
          {mode === "text" ? (
            <form className="cinematic-generate-form" onSubmit={handleSubmit}>
              <label>
                输入导演、电影、经典镜头或风格
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="例如：王家卫 花样年华 走廊擦肩镜头"
                  disabled={generateMutation.isPending}
                />
              </label>
              <label>
                目标平台
                <select
                  value={targetPlatform}
                  onChange={(event) => setTargetPlatform(event.target.value as ClassicShotTargetPlatform)}
                  disabled={generateMutation.isPending}
                >
                  {platformOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={generateMutation.isPending}>
                {generateMutation.isPending ? "生成中" : "生成复刻方案"}
              </button>
            </form>
          ) : (
            <form className="cinematic-generate-form" onSubmit={handleVideoSubmit} data-testid="classic-shot-video-form">
              <label>
                上传视频
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
                  disabled={videoGenerateMutation.isPending}
                />
              </label>
              <label>
                改写要求
                <textarea
                  name="revisionInstruction"
                  value={revisionInstruction}
                  onChange={(event) => setRevisionInstruction(event.target.value)}
                  onInput={(event) => setRevisionInstruction(event.currentTarget.value)}
                  disabled={videoGenerateMutation.isPending}
                />
              </label>
              <label>
                抽帧数量
                <input
                  type="number"
                  min={3}
                  max={8}
                  value={frameCount}
                  onChange={(event) => setFrameCount(Number(event.target.value))}
                  disabled={videoGenerateMutation.isPending}
                />
              </label>
              <label>
                目标平台
                <select
                  value={targetPlatform}
                  onChange={(event) => setTargetPlatform(event.target.value as ClassicShotTargetPlatform)}
                  disabled={videoGenerateMutation.isPending}
                >
                  {platformOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={videoGenerateMutation.isPending || !videoFile}>
                {videoGenerateMutation.isPending ? "分析中" : "根据视频生成"}
              </button>
            </form>
          )}
          <div className="cinematic-shot-list" aria-label="经典镜头历史">
            {projects.map((project, index) => (
              <button
                key={project.id}
                type="button"
                className={`cinematic-shot-item${project.id === selectedProject?.id ? " is-active" : ""}`}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{project.title}</strong>
                <p>{project.source.director}《{project.source.film}》</p>
                <small>{project.storyboard.length} 分镜 · {project.targetPlatform}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="cinematic-main">
          {selectedProject ? (
            <>
              <article className="cinematic-shot-detail">
                <header>
                  <span>{selectedProject.source.year}</span>
                  <h2>{selectedProject.title}</h2>
                  <p>{selectedProject.coreValue}</p>
                </header>
                <div className="cinematic-shot-meta">
                  <div><span>摄影机运动</span><strong>{selectedProject.analysis.cameraMovement}</strong></div>
                  <div><span>光影结构</span><strong>{selectedProject.analysis.lighting}</strong></div>
                  <div><span>情绪曲线</span><strong>{selectedProject.analysis.emotionCurve}</strong></div>
                  <div><span>最少分镜</span><strong>{selectedProject.minimumStoryboardCount}</strong></div>
                </div>
                <SourceBlock project={selectedProject} />
                {selectedProject.videoReference ? (
                  <section className="cinematic-prompt-block">
                    <div>
                      <h3>上传视频参考</h3>
                    </div>
                    <p>
                      文件：{selectedProject.videoReference.fileName}
                      <br />
                      时长：{selectedProject.videoReference.durationSeconds} 秒
                      <br />
                      抽帧：{selectedProject.videoReference.extractedFrameCount} 帧
                      <br />
                      改写：{selectedProject.videoReference.revisionInstruction}
                    </p>
                  </section>
                ) : null}
                <MarkdownPanel project={selectedProject} />
                {selectedProject.storyboardVideoPrompt ? (
                  <section className="cinematic-prompt-block cinematic-prompt-block--video">
                    <div>
                      <h3>分镜串联提示词</h3>
                    </div>
                    <p>{selectedProject.storyboardVideoPrompt}</p>
                  </section>
                ) : null}
                {selectedProject.storyboard.map((shot) => (
                  <ShotPrompt key={shot.id} shot={shot} />
                ))}
              </article>
            </>
          ) : (
            <div className="edge-empty">还没有经典镜头复刻方案。</div>
          )}
          {generateMutation.isError ? (
            <div className="news-error">
              错误：
              {generateMutation.error instanceof Error
                ? generateMutation.error.message
                : "经典镜头复刻生成失败"}
            </div>
          ) : null}
          {videoGenerateMutation.isError ? (
            <div className="news-error">
              错误：
              {videoGenerateMutation.error instanceof Error
                ? videoGenerateMutation.error.message
                : "上传视频复刻生成失败"}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
