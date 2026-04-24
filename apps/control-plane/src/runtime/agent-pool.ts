import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import { nanoid } from "nanoid";

import type { AgentExecutionRequest, AgentExecutionResult, AgentManifest } from "@agent-zy/agent-sdk";
import type { AgentRuntimeView } from "@agent-zy/shared-types";

import type { EventBus } from "../services/events";

interface WorkerRecord {
  child: ChildProcess;
  agentId: string;
  activeTaskId: string | null;
  lastStartedAt: string | null;
  idleTimer: NodeJS.Timeout | null;
}

export interface AgentWorkerPool {
  execute(
    manifest: AgentManifest,
    payload: AgentExecutionRequest
  ): Promise<AgentExecutionResult>;
  getViews(manifests: AgentManifest[]): AgentRuntimeView[];
  close(): Promise<void>;
}

export function createAgentWorkerPool(options: {
  eventBus: EventBus;
  idleMs?: number;
}): AgentWorkerPool {
  const workerEntry = resolve("apps/control-plane/src/runtime/agent-worker.ts");
  const idleMs = options.idleMs ?? 30_000;
  const workers = new Map<string, WorkerRecord>();

  function emitRuntimeUpdate() {
    options.eventBus.emit("runtime.updated", {
      workerIds: [...workers.keys()]
    });
  }

  function ensureWorker(manifest: AgentManifest): WorkerRecord {
    const existing = workers.get(manifest.id);

    if (existing) {
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer);
        existing.idleTimer = null;
      }

      return existing;
    }

    const child = fork(workerEntry, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      execArgv: ["--import", "tsx"]
    });

    const record: WorkerRecord = {
      child,
      agentId: manifest.id,
      activeTaskId: null,
      lastStartedAt: null,
      idleTimer: null
    };

    workers.set(manifest.id, record);
    emitRuntimeUpdate();

    child.on("exit", () => {
      workers.delete(manifest.id);
      emitRuntimeUpdate();
    });

    return record;
  }

  function scheduleWorkerRetire(record: WorkerRecord) {
    if (record.idleTimer) {
      clearTimeout(record.idleTimer);
    }

    record.idleTimer = setTimeout(() => {
      record.child.kill();
    }, idleMs);
  }

  return {
    execute(manifest, payload) {
      const requestId = nanoid();
      const worker = ensureWorker(manifest);
      worker.activeTaskId = payload.taskId;
      worker.lastStartedAt = new Date().toISOString();
      emitRuntimeUpdate();

      return new Promise<AgentExecutionResult>((resolvePromise, rejectPromise) => {
        const handleMessage = (message: {
          type: "result" | "error";
          requestId: string;
          result?: AgentExecutionResult;
          error?: string;
        }) => {
          if (message.requestId !== requestId) {
            return;
          }

          worker.child.off("message", handleMessage);
          worker.activeTaskId = null;
          scheduleWorkerRetire(worker);
          emitRuntimeUpdate();

          if (message.type === "error") {
            rejectPromise(new Error(message.error ?? "Unknown worker error"));
            return;
          }

          resolvePromise(message.result as AgentExecutionResult);
        };

        worker.child.on("message", handleMessage);
        worker.child.send({
          type: "execute",
          requestId,
          manifest,
          payload
        });
      });
    },
    getViews(manifests) {
      return manifests.map((manifest) => {
        const worker = workers.get(manifest.id);

        return {
          id: manifest.id,
          name: manifest.name,
          status: worker?.activeTaskId ? "busy" : "idle",
          activeTaskId: worker?.activeTaskId ?? null,
          lastStartedAt: worker?.lastStartedAt ?? null,
          capabilities: manifest.capabilities
        };
      });
    },
    async close() {
      for (const worker of workers.values()) {
        if (worker.idleTimer) {
          clearTimeout(worker.idleTimer);
        }
        worker.child.kill();
      }

      workers.clear();
      emitRuntimeUpdate();
    }
  };
}
