import { useEffect, useState, type FormEvent } from "react";

import type {
  PhotoRenameExecuteResult,
  PhotoRenameMediaScope,
  PhotoRenamePreviewResult,
  PhotoRenameTimeSource,
  PhotoRenameUndoResult
} from "@agent-zy/shared-types";

import {
  executePhotoRenames,
  previewPhotoRenames,
  undoPhotoRenames
} from "../api";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";
import { ToolsBackLink } from "./tools-page";

type PhotoRenamerWorkspaceProps = {
  previewAction?: (directoryPath: string, mediaScope: PhotoRenameMediaScope) => Promise<PhotoRenamePreviewResult>;
  executeAction?: (previewToken: string) => Promise<PhotoRenameExecuteResult>;
  undoAction?: (undoToken: string) => Promise<PhotoRenameUndoResult>;
};

const MEDIA_SCOPE_OPTIONS: Array<{ value: PhotoRenameMediaScope; label: string; itemLabel: string }> = [
  { value: "images", label: "图片", itemLabel: "图片文件" },
  { value: "videos", label: "视频", itemLabel: "视频文件" },
  { value: "all", label: "图片 + 视频", itemLabel: "媒体文件" }
];

function getMediaScopeOption(mediaScope: PhotoRenameMediaScope) {
  return MEDIA_SCOPE_OPTIONS.find((option) => option.value === mediaScope) ?? MEDIA_SCOPE_OPTIONS[2];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function formatTimeSource(source: PhotoRenameTimeSource) {
  if (source === "exif") {
    return "照片拍摄时间";
  }

  return source === "video-metadata" ? "视频创建时间" : "文件修改时间";
}

export function PhotoRenamerWorkspace({
  previewAction = previewPhotoRenames,
  executeAction = executePhotoRenames,
  undoAction = undoPhotoRenames
}: PhotoRenamerWorkspaceProps) {
  const [directoryPath, setDirectoryPath] = useState("");
  const [mediaScope, setMediaScope] = useState<PhotoRenameMediaScope>("all");
  const [preview, setPreview] = useState<PhotoRenamePreviewResult | null>(null);
  const [execution, setExecution] = useState<PhotoRenameExecuteResult | null>(null);
  const [undoResult, setUndoResult] = useState<PhotoRenameUndoResult | null>(null);
  const [confirmingExecution, setConfirmingExecution] = useState(false);
  const [status, setStatus] = useState<"idle" | "previewing" | "executing" | "undoing">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmingExecution) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && status !== "executing") {
        setConfirmingExecution(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmingExecution, status]);

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("previewing");
    setError(null);
    setPreview(null);
    setExecution(null);
    setUndoResult(null);
    setConfirmingExecution(false);

    try {
      setPreview(await previewAction(directoryPath.trim(), mediaScope));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  async function handleConfirmExecute() {
    if (!preview) {
      return;
    }

    setStatus("executing");
    setError(null);

    try {
      setExecution(await executeAction(preview.previewToken));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
      setConfirmingExecution(false);
    }
  }

  async function handleUndo() {
    if (!execution) {
      return;
    }

    setStatus("undoing");
    setError(null);

    try {
      setUndoResult(await undoAction(execution.undoToken));
      setExecution(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  return (
    <section className="photo-renamer-shell">
      <header className="tools-page-header">
        <div>
          <p className="eyebrow">Local Media Utility</p>
          <h1>照片和视频名称修改</h1>
          <p>递归扫描文件夹中的照片和视频，按拍摄或创建时间生成名称。预览确认后才会修改文件。</p>
        </div>
        <ToolsBackLink />
      </header>

      <form className="photo-renamer-form" onSubmit={handlePreview}>
        <label>
          <span>媒体文件夹路径</span>
          <input
            name="directoryPath"
            value={directoryPath}
            onChange={(event) => setDirectoryPath(event.target.value)}
            placeholder="例如：D:\照片\旅行"
          />
        </label>
        <button type="submit" disabled={!directoryPath.trim() || status !== "idle"}>
          {status === "previewing" ? "正在扫描..." : "扫描并预览"}
        </button>
      </form>
      <section className="photo-renamer-scope">
        <div>
          <strong>重命名范围</strong>
          <span>选择本次扫描需要处理的文件类型</span>
        </div>
        <div className="photo-renamer-scope__options" role="group" aria-label="重命名范围">
          {MEDIA_SCOPE_OPTIONS.map((option) => (
            <button
              type="button"
              aria-pressed={mediaScope === option.value}
              className={mediaScope === option.value ? "is-active" : undefined}
              data-media-scope={option.value}
              key={option.value}
              onClick={() => {
                setMediaScope(option.value);
                setPreview(null);
                setExecution(null);
                setUndoResult(null);
                setConfirmingExecution(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {error ? <p className="tools-notice tools-notice--error">{error}</p> : null}
      {execution ? (
        <div className="tools-notice tools-notice--success">
          <strong>已重命名 {execution.summary.renamed} 个文件</strong>
          <button type="button" data-action="undo" disabled={status !== "idle"} onClick={() => void handleUndo()}>
            {status === "undoing" ? "正在撤销..." : "撤销本次重命名"}
          </button>
        </div>
      ) : null}
      {undoResult ? (
        <p className="tools-notice tools-notice--success">已恢复 {undoResult.summary.restored} 个文件</p>
      ) : null}

      {preview ? (
        <>
          <section className="photo-renamer-summary">
            <div><span>当前范围</span><strong>{getMediaScopeOption(mediaScope).label}</strong></div>
            <div><span>扫描媒体</span><strong>{preview.summary.total}</strong></div>
            <div><span>等待重命名</span><strong>{preview.summary.rename}</strong></div>
            <div><span>名称无需变化</span><strong>{preview.summary.unchanged}</strong></div>
            <div><span>跳过</span><strong>{preview.summary.skipped}</strong></div>
          </section>
          <div className="photo-renamer-actions">
            <button
              type="button"
              data-action="execute"
              disabled={preview.summary.rename === 0 || status !== "idle" || Boolean(execution)}
              onClick={() => setConfirmingExecution(true)}
            >
              {status === "executing" ? "正在重命名..." : "确认执行重命名"}
            </button>
          </div>
          <div className="photo-renamer-table-wrap">
            <table className="photo-renamer-table">
              <thead>
                <tr>
                  <th>原名称</th>
                  <th>新名称</th>
                  <th>时间来源</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {preview.items.map((item) => (
                  <tr key={item.sourcePath}>
                    <td>{item.sourceName}</td>
                    <td>{item.targetName}</td>
                    <td>{formatTimeSource(item.timeSource)}</td>
                    <td>{item.status === "rename" ? "等待重命名" : item.status === "unchanged" ? "无需变化" : item.skipReason ?? "已跳过"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {confirmingExecution && preview ? (
        <div
          className="photo-renamer-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && status !== "executing") {
              setConfirmingExecution(false);
            }
          }}
        >
          <section
            aria-labelledby="photo-renamer-confirm-title"
            aria-modal="true"
            className="photo-renamer-dialog"
            role="dialog"
          >
            <p className="eyebrow">Confirm Batch Rename</p>
            <h2 id="photo-renamer-confirm-title">确认执行重命名？</h2>
            <p>即将修改 <strong>{preview.summary.rename}</strong> 个{getMediaScopeOption(mediaScope).itemLabel}的名称。</p>
            <p className="photo-renamer-dialog__hint">执行完成后可以撤销当前批次。预览后发生变化的文件会被拒绝处理。</p>
            <div className="photo-renamer-dialog__actions">
              <button
                type="button"
                data-action="cancel-execute"
                disabled={status === "executing"}
                onClick={() => setConfirmingExecution(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="photo-renamer-dialog__primary"
                data-action="confirm-execute"
                disabled={status === "executing"}
                onClick={() => void handleConfirmExecute()}
              >
                {status === "executing" ? "正在重命名..." : "确认并执行"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function PhotoRenamerPage() {
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const { layout } = useHomeLayoutPreferences();

  return (
    <main className="workspace tools-workspace">
      <CommandRail
        activeSection="tools"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[]}
      />
      <PhotoRenamerWorkspace />
    </main>
  );
}
