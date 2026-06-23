import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  DataSyncConflict,
  DataSyncModule,
  DataSyncResolutionChoice,
  DataSyncResult
} from "@agent-zy/shared-types";

import { fetchDataSyncStatus, syncModuleData } from "../api";

const MODULE_LABELS: Record<DataSyncModule, string> = {
  history: "历史知识",
  mhxy: "梦幻西游",
  "browser-automation": "浏览器自动化"
};

function formatJson(value: Record<string, unknown> | null) {
  return value ? JSON.stringify(value, null, 2) : "已删除";
}

export function DataSyncControl(props: {
  module: DataSyncModule;
  onSynced?: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["data-sync-status"],
    queryFn: fetchDataSyncStatus,
    staleTime: 15_000
  });
  const [result, setResult] = useState<DataSyncResult | null>(null);
  const [conflict, setConflict] = useState<Extract<DataSyncResult, { status: "conflict" }> | null>(null);
  const [choices, setChoices] = useState<Record<string, DataSyncResolutionChoice>>({});
  const moduleStatus = statusQuery.data?.modules?.[props.module];
  const enabled = statusQuery.data?.enabled === true;

  const mutation = useMutation({
    mutationFn: (request: Parameters<typeof syncModuleData>[1]) =>
      syncModuleData(props.module, request),
    onSuccess: async (nextResult) => {
      setResult(nextResult);
      if (nextResult.status === "conflict") {
        setConflict(nextResult);
        setChoices({});
        return;
      }
      if (nextResult.status === "synced") {
        setConflict(null);
        setChoices({});
        await queryClient.invalidateQueries({ queryKey: ["data-sync-status"] });
        await props.onSynced?.();
      }
    }
  });

  const allResolved = useMemo(
    () => Boolean(conflict && conflict.conflicts.every((item) => choices[item.key])),
    [choices, conflict]
  );
  const commit = result?.status === "synced" ? result.commitSha : moduleStatus?.lastCommit;
  const error =
    result?.status === "failed"
      ? result.error
      : mutation.error instanceof Error
        ? mutation.error.message
        : moduleStatus?.error;

  function choose(item: DataSyncConflict, choice: DataSyncResolutionChoice) {
    setChoices((current) => ({ ...current, [item.key]: choice }));
  }

  return (
    <div className="data-sync-control">
      <div className="data-sync-control__summary">
        <button
          type="button"
          className="data-sync-control__button"
          data-action="sync-data"
          disabled={!enabled || mutation.isPending || statusQuery.isPending}
          onClick={() => mutation.mutate({})}
        >
          {mutation.isPending ? "同步中…" : "同步数据"}
        </button>
        <span className={`data-sync-control__state is-${result?.status ?? moduleStatus?.status ?? "idle"}`}>
          {commit ? `已同步 ${commit.slice(0, 7)}` : "尚未同步"}
        </span>
      </div>
      {!enabled && !statusQuery.isPending ? (
        <p className="data-sync-control__hint">
          确认仓库为 Private 后设置 AGENT_ZY_DATA_SYNC_ENABLED=true
        </p>
      ) : null}
      {error ? <p className="data-sync-control__error">{error}</p> : null}

      {conflict ? (
        <div className="data-sync-dialog-backdrop" role="presentation">
          <section className="data-sync-dialog" role="dialog" aria-modal="true" aria-label="数据同步冲突">
            <header className="data-sync-dialog__header">
              <div>
                <span>{MODULE_LABELS[props.module]}</span>
                <h2>选择冲突记录</h2>
              </div>
              <button type="button" onClick={() => setConflict(null)} aria-label="关闭冲突弹窗">×</button>
            </header>
            <div className="data-sync-dialog__records">
              {conflict.conflicts.map((item) => (
                <article className="data-sync-conflict" key={item.key}>
                  <div className="data-sync-conflict__title">
                    <strong>{item.recordType}</strong>
                    <code>{item.recordId}</code>
                  </div>
                  <div className="data-sync-conflict__comparison">
                    <button
                      type="button"
                      className={choices[item.key] === "local" ? "is-selected" : ""}
                      data-resolution="local"
                      onClick={() => choose(item, "local")}
                    >
                      <span>保留本地</span>
                      <pre>{formatJson(item.local)}</pre>
                    </button>
                    <button
                      type="button"
                      className={choices[item.key] === "remote" ? "is-selected" : ""}
                      data-resolution="remote"
                      onClick={() => choose(item, "remote")}
                    >
                      <span>采用远端</span>
                      <pre>{formatJson(item.remote)}</pre>
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <footer className="data-sync-dialog__footer">
              <span>{Object.keys(choices).length}/{conflict.conflicts.length} 已选择</span>
              <button
                type="button"
                data-action="resolve-conflicts"
                disabled={!allResolved || mutation.isPending}
                onClick={() => mutation.mutate({
                  conflictToken: conflict.conflictToken,
                  resolutions: conflict.conflicts.map((item) => ({ key: item.key, choice: choices[item.key] }))
                })}
              >
                {mutation.isPending ? "正在提交…" : "确认并继续同步"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
