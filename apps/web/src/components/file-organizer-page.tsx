import { useEffect, useState, type FormEvent } from "react";

import type {
  FileOrganizerExecuteResult,
  FileOrganizerMode,
  FileOrganizerPreviewInput,
  FileOrganizerPreviewResult,
  FileOrganizerTimeGranularity,
  FileOrganizerTimeSource,
  FileOrganizerUndoResult
} from "@agent-zy/shared-types";

import {
  executeFileOrganization,
  previewFileOrganization,
  undoFileOrganization
} from "../api";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";
import { ToolsBackLink } from "./tools-page";

type FileOrganizerWorkspaceProps = {
  previewAction?: (input: FileOrganizerPreviewInput) => Promise<FileOrganizerPreviewResult>;
  executeAction?: (previewToken: string) => Promise<FileOrganizerExecuteResult>;
  undoAction?: (undoToken: string) => Promise<FileOrganizerUndoResult>;
};

const MODE_OPTIONS: Array<{ value: FileOrganizerMode; label: string; hint: string }> = [
  { value: "time", label: "按时间", hint: "按天、月或年创建文件夹" },
  { value: "type", label: "按类型", hint: "按图片、视频、文档等大类整理" }
];

const GRANULARITY_OPTIONS: Array<{ value: FileOrganizerTimeGranularity; label: string }> = [
  { value: "day", label: "按天" },
  { value: "month", label: "按月" },
  { value: "year", label: "按年" }
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function formatMode(mode: FileOrganizerMode) {
  return mode === "type" ? "按类型" : "按时间";
}

function formatTimeSource(source?: FileOrganizerTimeSource) {
  if (source === "filename") {
    return "文件名日期";
  }

  if (source === "file-birthtime") {
    return "文件创建时间";
  }

  if (source === "file-mtime") {
    return "文件修改时间";
  }

  return source === "unknown" ? "未识别时间" : "类型规则";
}

function formatStatus(status: FileOrganizerPreviewResult["items"][number]["status"], skipReason?: string) {
  if (status === "move") {
    return "等待移动";
  }

  if (status === "unchanged") {
    return "位置无需变化";
  }

  return skipReason ?? "已跳过";
}

export function FileOrganizerWorkspace({
  previewAction = previewFileOrganization,
  executeAction = executeFileOrganization,
  undoAction = undoFileOrganization
}: FileOrganizerWorkspaceProps) {
  const [directoryPath, setDirectoryPath] = useState("");
  const [mode, setMode] = useState<FileOrganizerMode>("time");
  const [timeGranularity, setTimeGranularity] = useState<FileOrganizerTimeGranularity>("month");
  const [preview, setPreview] = useState<FileOrganizerPreviewResult | null>(null);
  const [execution, setExecution] = useState<FileOrganizerExecuteResult | null>(null);
  const [undoResult, setUndoResult] = useState<FileOrganizerUndoResult | null>(null);
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

  function resetPreviewState() {
    setPreview(null);
    setExecution(null);
    setUndoResult(null);
    setConfirmingExecution(false);
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("previewing");
    setError(null);
    resetPreviewState();

    try {
      setPreview(await previewAction({
        directoryPath: directoryPath.trim(),
        mode,
        timeGranularity: mode === "time" ? timeGranularity : undefined
      }));
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
    <section className="file-organizer-shell">
      <header className="tools-page-header">
        <div>
          <p className="eyebrow">Local File Utility</p>
          <h1>文件整理</h1>
          <p>递归扫描文件夹中的普通文件，按时间或类型生成移动方案。预览确认后才会移动文件。</p>
        </div>
        <ToolsBackLink />
      </header>

      <form className="photo-renamer-form" onSubmit={handlePreview}>
        <label>
          <span>文件夹路径</span>
          <input
            name="directoryPath"
            value={directoryPath}
            onChange={(event) => setDirectoryPath(event.target.value)}
            placeholder="例如：D:\下载"
          />
        </label>
        <button type="submit" disabled={!directoryPath.trim() || status !== "idle"}>
          {status === "previewing" ? "正在扫描..." : "扫描并预览"}
        </button>
      </form>

      <section className="photo-renamer-scope">
        <div>
          <strong>整理方式</strong>
          <span>{mode === "time" ? "根据日期创建目标文件夹" : "根据扩展名归入大类文件夹"}</span>
        </div>
        <div className="photo-renamer-scope__options" role="group" aria-label="整理方式">
          {MODE_OPTIONS.map((option) => (
            <button
              type="button"
              aria-pressed={mode === option.value}
              className={mode === option.value ? "is-active" : undefined}
              data-mode={option.value}
              key={option.value}
              title={option.hint}
              onClick={() => {
                setMode(option.value);
                resetPreviewState();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {mode === "time" ? (
        <section className="photo-renamer-scope">
          <div>
            <strong>时间粒度</strong>
            <span>按天、按月或按年创建文件夹</span>
          </div>
          <div className="photo-renamer-scope__options" role="group" aria-label="时间粒度">
            {GRANULARITY_OPTIONS.map((option) => (
              <button
                type="button"
                aria-pressed={timeGranularity === option.value}
                className={timeGranularity === option.value ? "is-active" : undefined}
                data-granularity={option.value}
                key={option.value}
                onClick={() => {
                  setTimeGranularity(option.value);
                  resetPreviewState();
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {error ? <p className="tools-notice tools-notice--error">{error}</p> : null}
      {execution ? (
        <div className="tools-notice tools-notice--success">
          <strong>已移动 {execution.summary.moved} 个文件</strong>
          <button type="button" data-action="undo" disabled={status !== "idle"} onClick={() => void handleUndo()}>
            {status === "undoing" ? "正在撤销..." : "撤销本次整理"}
          </button>
        </div>
      ) : null}
      {undoResult ? (
        <p className="tools-notice tools-notice--success">已恢复 {undoResult.summary.restored} 个文件</p>
      ) : null}

      {preview ? (
        <>
          <section className="photo-renamer-summary">
            <div><span>整理方式</span><strong>{formatMode(preview.mode)}</strong></div>
            <div><span>扫描文件</span><strong>{preview.summary.total}</strong></div>
            <div><span>等待移动</span><strong>{preview.summary.move}</strong></div>
            <div><span>位置不变</span><strong>{preview.summary.unchanged}</strong></div>
            <div><span>跳过</span><strong>{preview.summary.skipped}</strong></div>
          </section>
          <div className="photo-renamer-actions">
            <button
              type="button"
              data-action="execute"
              disabled={preview.summary.move === 0 || status !== "idle" || Boolean(execution)}
              onClick={() => setConfirmingExecution(true)}
            >
              {status === "executing" ? "正在整理..." : "确认执行整理"}
            </button>
          </div>
          <div className="photo-renamer-table-wrap">
            <table className="photo-renamer-table">
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>目标文件夹</th>
                  <th>依据</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {preview.items.map((item) => (
                  <tr key={item.sourcePath}>
                    <td>{item.sourceName}</td>
                    <td>{item.targetFolderName}</td>
                    <td>{formatTimeSource(item.timeSource)}</td>
                    <td>{formatStatus(item.status, item.skipReason)}</td>
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
            aria-labelledby="file-organizer-confirm-title"
            aria-modal="true"
            className="photo-renamer-dialog"
            role="dialog"
          >
            <p className="eyebrow">Confirm File Move</p>
            <h2 id="file-organizer-confirm-title">确认执行整理？</h2>
            <p>即将移动 <strong>{preview.summary.move}</strong> 个文件。</p>
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
                {status === "executing" ? "正在整理..." : "确认并执行"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function FileOrganizerPage() {
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
      <FileOrganizerWorkspace />
    </main>
  );
}
