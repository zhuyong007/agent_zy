import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  DashboardData,
  HistoryCommentExtraction,
  HistoryCommentReplyRecord,
  HistoryDynastyModuleType,
  NotificationRecord
} from "@agent-zy/shared-types";

import {
  createHistoryCommentReply,
  deleteHistoryCommentReply,
  extractHistoryCommentScreenshot,
  updateHistoryCommentReply
} from "../api";
import { isHistoryDynastyPayload, isHistoryPostPayload } from "../history-view";

type ReplyMode = "manual" | "screenshot";

type ContentTarget = {
  key: string;
  targetNotificationId: string;
  targetModuleType: HistoryDynastyModuleType | null;
  sourceTitle: string;
};

function buildTargetKey(notificationId: string, moduleType: HistoryDynastyModuleType | null) {
  return `${notificationId}::${moduleType ?? ""}`;
}

function buildContentTargets(notifications: NotificationRecord[]): ContentTarget[] {
  return notifications.flatMap((notification): ContentTarget[] => {
    if (isHistoryDynastyPayload(notification.payload)) {
      return notification.payload.modules.map((module) => ({
        key: buildTargetKey(notification.id, module.type),
        targetNotificationId: notification.id,
        targetModuleType: module.type,
        sourceTitle: module.topic
      }));
    }
    if (isHistoryPostPayload(notification.payload)) {
      return [
        {
          key: buildTargetKey(notification.id, null),
          targetNotificationId: notification.id,
          targetModuleType: null,
          sourceTitle: notification.payload.topic
        }
      ];
    }
    return [];
  });
}

async function copyText(value: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function HistoryCommentReplyPanel(props: {
  notifications: NotificationRecord[];
  records: HistoryCommentReplyRecord[];
}) {
  const queryClient = useQueryClient();
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ReplyMode>("manual");
  const [targetKey, setTargetKey] = useState("");
  const [commenterName, setCommenterName] = useState("");
  const [commentText, setCommentText] = useState("");
  const [extraction, setExtraction] = useState<HistoryCommentExtraction | null>(null);
  const [screenshotName, setScreenshotName] = useState("");
  const [activeRecord, setActiveRecord] = useState<HistoryCommentReplyRecord | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyDirty, setReplyDirty] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const targets = useMemo(() => buildContentTargets(props.notifications), [props.notifications]);
  const selectedTarget = targets.find((target) => target.key === targetKey) ?? null;

  function replaceDashboardRecords(records: HistoryCommentReplyRecord[]) {
    queryClient.setQueryData<DashboardData>(["dashboard"], (current) =>
      current
        ? {
            ...current,
            historyCommentReplies: { records }
          }
        : current
    );
  }

  function upsertDashboardRecord(record: HistoryCommentReplyRecord) {
    replaceDashboardRecords([record, ...props.records.filter((item) => item.id !== record.id)]);
  }

  function openRecord(record: HistoryCommentReplyRecord) {
    setActiveRecord(record);
    setReplyText(record.replyText);
    setReplyDirty(false);
    setCopied(false);
  }

  const extractionMutation = useMutation({
    mutationFn: (file: File) => extractHistoryCommentScreenshot(file),
    onSuccess: (result) => {
      setExtraction(result);
      setLocalError(null);
      if (result.comments.length === 1) {
        setCommenterName(result.comments[0]?.commenterName ?? "");
        setCommentText(result.comments[0]?.commentText ?? "");
      }
    },
    onError: (error) => setLocalError(errorMessage(error, "评论截图识别失败"))
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTarget) {
        throw new Error("请先确认关联的历史内容");
      }
      return createHistoryCommentReply({
        targetNotificationId: selectedTarget.targetNotificationId,
        targetModuleType: selectedTarget.targetModuleType,
        commenterName: commenterName.trim() || null,
        commentText: commentText.trim(),
        inputMode: mode,
        detectedNoteTitle: extraction?.detectedNoteTitle ?? null
      });
    },
    onSuccess: (record) => {
      upsertDashboardRecord(record);
      openRecord(record);
      setLocalError(null);
    },
    onError: (error) => setLocalError(errorMessage(error, "评论回复生成失败"))
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!activeRecord) {
        throw new Error("回复草稿不存在");
      }
      return updateHistoryCommentReply(activeRecord.id, replyText);
    },
    onSuccess: (record) => {
      upsertDashboardRecord(record);
      openRecord(record);
      setLocalError(null);
    },
    onError: (error) => setLocalError(errorMessage(error, "评论回复重新校验失败"))
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteHistoryCommentReply(id),
    onSuccess: (state, id) => {
      replaceDashboardRecords(state.records);
      if (activeRecord?.id === id) {
        setActiveRecord(null);
        setReplyText("");
        setReplyDirty(false);
      }
    },
    onError: (error) => setLocalError(errorMessage(error, "评论回复删除失败"))
  });

  const visibleError =
    localError ??
    (extractionMutation.isError
      ? errorMessage(extractionMutation.error, "评论截图识别失败")
      : createMutation.isError
        ? errorMessage(createMutation.error, "评论回复生成失败")
        : updateMutation.isError
          ? errorMessage(updateMutation.error, "评论回复重新校验失败")
          : null);
  const canCopy = Boolean(activeRecord && activeRecord.factualStatus === "ready" && !replyDirty && replyText);

  return (
    <section className="history-reply-panel">
      <header className="history-reply-panel__header">
        <div>
          <p className="eyebrow">Comment Desk</p>
          <h2>评论回复</h2>
          <p>确认原内容后生成回复；事实无法支撑时会进入待核实状态。</p>
        </div>
        <div className="history-reply-panel__count">
          <strong>{props.records.length}</strong>
          <span>草稿</span>
        </div>
      </header>

      <div className="history-reply-panel__workspace">
        <div className="history-reply-compose">
          <div className="history-reply-tabs" role="tablist" aria-label="评论输入方式">
            <button
              type="button"
              className={mode === "manual" ? "is-active" : ""}
              aria-label="手动输入评论"
              aria-selected={mode === "manual"}
              onClick={() => setMode("manual")}
            >
              手动输入
            </button>
            <button
              type="button"
              className={mode === "screenshot" ? "is-active" : ""}
              aria-label="截图识别评论"
              aria-selected={mode === "screenshot"}
              onClick={() => setMode("screenshot")}
            >
              截图识别
            </button>
          </div>

          {mode === "screenshot" ? (
            <div className="history-reply-upload">
              <button
                type="button"
                className="history-reply-primary"
                disabled={extractionMutation.isPending}
                onClick={() => screenshotInputRef.current?.click()}
              >
                {extractionMutation.isPending ? "识别中..." : "选择评论截图"}
              </button>
              <input
                ref={screenshotInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="上传评论截图"
                hidden
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                    setLocalError("仅支持 PNG、JPEG 或 WebP 截图");
                    return;
                  }
                  if (file.size > 8 * 1024 * 1024) {
                    setLocalError("截图大小必须在 8 MB 以内");
                    return;
                  }
                  setScreenshotName(file.name);
                  extractionMutation.mutate(file);
                }}
              />
              <span>{screenshotName || "截图仅用于本次识别，不会保存"}</span>
            </div>
          ) : null}

          {extraction ? (
            <div className="history-reply-extraction">
              <div>
                <span>识别标题</span>
                <strong>{extraction.detectedNoteTitle ?? "未识别"}</strong>
              </div>
              {extraction.comments.length > 0 ? (
                <div className="history-reply-choice-list">
                  {extraction.comments.map((comment, index) => (
                    <button
                      key={`${comment.commentText}-${index}`}
                      type="button"
                      aria-label={`选择${comment.commenterName ?? "匿名用户"}的评论`}
                      onClick={() => {
                        setCommenterName(comment.commenterName ?? "");
                        setCommentText(comment.commentText);
                      }}
                    >
                      <strong>{comment.commenterName ?? "匿名用户"}</strong>
                      <span>{comment.commentText}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {extraction.targetCandidates.length > 0 ? (
                <div className="history-reply-candidates">
                  <span>可能关联</span>
                  {extraction.targetCandidates.map((candidate) => {
                    const key = buildTargetKey(candidate.targetNotificationId, candidate.targetModuleType);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={targetKey === key ? "is-active" : ""}
                        onClick={() => setTargetKey(key)}
                      >
                        {candidate.sourceTitle} · {Math.round(candidate.score * 100)}%
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {extraction.warnings.map((warning) => (
                <p key={warning} className="history-reply-warning">{warning}</p>
              ))}
            </div>
          ) : null}

          <label className="history-reply-field">
            <span>关联内容</span>
            <select
              aria-label="选择关联历史内容"
              value={targetKey}
              onChange={(event) => setTargetKey(event.target.value)}
            >
              <option value="">请选择并确认</option>
              {targets.map((target) => (
                <option key={target.key} value={target.key}>
                  {target.targetModuleType ? `${target.targetModuleType} · ` : ""}{target.sourceTitle}
                </option>
              ))}
            </select>
          </label>

          <label className="history-reply-field">
            <span>评论者</span>
            <input
              aria-label="评论者昵称"
              value={commenterName}
              onChange={(event) => setCommenterName(event.target.value)}
              placeholder="可选"
            />
          </label>

          <label className="history-reply-field history-reply-field--comment">
            <span>用户评论</span>
            <textarea
              aria-label="用户评论"
              value={commentText}
              maxLength={1000}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder="粘贴需要回复的评论"
            />
          </label>

          <button
            type="button"
            className="history-reply-primary"
            aria-label="生成评论回复"
            disabled={!selectedTarget || !commentText.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "生成并核实中..." : "生成回复"}
          </button>
        </div>

        <div className="history-reply-review">
          <div className="history-reply-review__head">
            <div>
              <span>回复审稿</span>
              <strong>{activeRecord?.sourceTitle ?? "等待生成"}</strong>
            </div>
            {activeRecord ? (
              <span className={`history-reply-status history-reply-status--${activeRecord.factualStatus}`}>
                {replyDirty
                  ? "待重新校验"
                  : activeRecord.factualStatus === "ready"
                    ? "可复制"
                    : "待核实"}
              </span>
            ) : null}
          </div>

          {activeRecord ? (
            <>
              <blockquote>{activeRecord.commenterName ? `${activeRecord.commenterName}：` : ""}{activeRecord.commentText}</blockquote>
              <textarea
                aria-label="生成的评论回复"
                value={replyText}
                onChange={(event) => {
                  setReplyText(event.target.value);
                  setReplyDirty(event.target.value !== activeRecord.replyText);
                  setCopied(false);
                }}
              />
              {activeRecord.verificationNote ? <p>{activeRecord.verificationNote}</p> : null}
              <div className="history-reply-review__actions">
                {replyDirty ? (
                  <button
                    type="button"
                    className="history-reply-primary"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate()}
                  >
                    {updateMutation.isPending ? "校验中..." : "保存并重新校验"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="history-copy-button"
                  aria-label="复制评论回复"
                  disabled={!canCopy}
                  onClick={() => {
                    void copyText(replyText).then(() => setCopied(true));
                  }}
                >
                  {copied ? "已复制" : "复制回复"}
                </button>
              </div>
            </>
          ) : (
            <div className="history-reply-empty">
              <strong>回复会在这里进入事实审稿</strong>
              <p>未通过核实的内容不会开放复制。</p>
            </div>
          )}
        </div>
      </div>

      {visibleError ? <div className="news-error">{visibleError}</div> : null}

      {props.records.length > 0 ? (
        <div className="history-reply-drafts">
          <div className="history-reply-drafts__head">
            <span>最近草稿</span>
            <strong>{props.records.length} 条</strong>
          </div>
          <div className="history-reply-drafts__list">
            {props.records.map((record) => (
              <article key={record.id} className={activeRecord?.id === record.id ? "is-active" : ""}>
                <button type="button" onClick={() => openRecord(record)}>
                  <span>{record.factualStatus === "ready" ? "可复制" : "待核实"}</span>
                  <strong>{record.sourceTitle}</strong>
                  <p>{record.commentText}</p>
                </button>
                <button
                  type="button"
                  className="history-archive__delete"
                  aria-label={`删除回复草稿 ${record.sourceTitle}`}
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(record.id)}
                >
                  删除
                </button>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
