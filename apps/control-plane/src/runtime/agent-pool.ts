import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import { nanoid } from "nanoid";

import type { AgentExecutionRequest, AgentExecutionResult, AgentManifest } from "@agent-zy/agent-sdk";
import type { AgentRuntimeView } from "@agent-zy/shared-types";

import type { EventBus } from "../services/events";
import type { EventLogService } from "../services/event-log-service";
import type { ModelRuntime, ModelRuntimeRequest } from "../services/model-runtime";

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
  modelRuntime?: ModelRuntime;
  idleMs?: number;
  eventLog?: EventLogService;
  workerEnv?: NodeJS.ProcessEnv;
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
      env: {
        ...process.env,
        ...options.workerEnv,
        AGENT_ZY_WORKER: "1"
      },
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

    child.stdout?.on("data", (chunk) => {
      process.stdout.write(`[agent-worker:${manifest.id}:stdout] ${chunk.toString()}`);
    });

    child.stderr?.on("data", (chunk) => {
      process.stderr.write(`[agent-worker:${manifest.id}:stderr] ${chunk.toString()}`);
    });

    child.on("exit", () => {
      workers.delete(manifest.id);
      emitRuntimeUpdate();
    });

    child.on("message", (message: { type?: string; requestId?: string; payload?: ModelRuntimeRequest }) => {
      if (message.type !== "model-request" || !message.requestId) {
        return;
      }

      if (!options.modelRuntime || !message.payload) {
        child.send({
          type: "model-response",
          requestId: message.requestId,
          error: "Model runtime is not available"
        });
        return;
      }

      options.modelRuntime
        .execute({
          ...message.payload,
          agentId: message.payload.agentId ?? manifest.id,
          taskId: record.activeTaskId ?? undefined,
          requestId: message.requestId
        } as ModelRuntimeRequest)
        .then((result) => {
          child.send({
            type: "model-response",
            requestId: message.requestId,
            result
          });
        })
        .catch((error) => {
          child.send({
            type: "model-response",
            requestId: message.requestId,
            error: error instanceof Error ? error.message : "Model request failed"
          });
        });
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
      options.eventLog?.append({
        level: "info",
        category: "agent",
        action: "worker.started",
        message: manifest.id,
        agentId: manifest.id,
        taskId: payload.taskId,
        requestId
      });

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
            options.eventLog?.append({
              level: "error",
              category: "agent",
              action: "worker.failed",
              message: message.error ?? "Unknown worker error",
              agentId: manifest.id,
              taskId: payload.taskId,
              requestId
            });
            rejectPromise(new Error(message.error ?? "Unknown worker error"));
            return;
          }

          options.eventLog?.append({
            level: message.result?.status === "failed" ? "error" : "info",
            category: "agent",
            action: message.result?.status === "failed" ? "worker.failed" : "worker.completed",
            message: message.result?.summary ?? manifest.id,
            agentId: manifest.id,
            taskId: payload.taskId,
            requestId
          });
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
