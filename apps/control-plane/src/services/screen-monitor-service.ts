import { spawn } from "node:child_process";

import { nanoid } from "nanoid";
import { parseModelJson } from "@agent-zy/agent-sdk";
import type {
  ScreenMonitorObservation,
  ScreenMonitorObservationTrigger,
  ScreenMonitorSession,
  ScreenMonitorState
} from "@agent-zy/shared-types";

import type { ControlPlaneStore } from "./store";
import type { ModelRuntime } from "./model-runtime";
import { createPyAutoGuiDesktopController, type DesktopAutomationController } from "./browser-automation-desktop-executor";

export const SCREEN_MONITOR_DEFAULT_INTERVAL_MS = 180000;
export const SCREEN_MONITOR_MIN_INTERVAL_MS = 30000;
export const SCREEN_MONITOR_MAX_INTERVAL_MS = 1800000;

export interface ScreenMonitorCaptureResult {
  dataUrl: string;
  capturedAt: string;
}

export interface ScreenMonitorScreenCapture {
  capture(): Promise<ScreenMonitorCaptureResult>;
}

export interface ScreenMonitorNotifier {
  announce(text: string): Promise<{ ok: boolean; message?: string }>;
}

export interface ScreenMonitorService {
  getState(): ScreenMonitorState;
  startSession(input: unknown): Promise<ScreenMonitorSession>;
  stopSession(id: string): ScreenMonitorSession;
  checkSession(id: string, trigger?: ScreenMonitorObservationTrigger): Promise<ScreenMonitorObservation>;
}

type TimerHandle = ReturnType<typeof setInterval>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInterval(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return SCREEN_MONITOR_DEFAULT_INTERVAL_MS;
  }

  const intervalMs = Number(value);
  if (!Number.isFinite(intervalMs) || intervalMs < SCREEN_MONITOR_MIN_INTERVAL_MS || intervalMs > SCREEN_MONITOR_MAX_INTERVAL_MS) {
    throw new Error(`检查间隔必须在 ${SCREEN_MONITOR_MIN_INTERVAL_MS} 到 ${SCREEN_MONITOR_MAX_INTERVAL_MS} 毫秒之间`);
  }

  return Math.round(intervalMs);
}

function emptyScreenMonitorState(): ScreenMonitorState {
  return {
    sessions: [],
    activeSessionId: null,
    lastUpdatedAt: null
  };
}

function parseVisionResult(text: string) {
  const parsed = parseModelJson(text);
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;

  if (!record) {
    throw new Error("视觉模型没有返回有效 JSON");
  }

  const resultText = asTrimmedString(record.resultText);
  if (!resultText) {
    throw new Error("视觉模型没有返回 resultText");
  }

  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence)
    ? Math.max(0, Math.min(1, record.confidence))
    : null;
  const announcement = asTrimmedString(record.announcement) || resultText;
  const reason = asTrimmedString(record.reason);

  return {
    resultText,
    confidence,
    done: record.done === true,
    announcement,
    reason
  };
}

function createObservation(input: Omit<ScreenMonitorObservation, "id">): ScreenMonitorObservation {
  return {
    id: `screen-observation-${nanoid()}`,
    ...input
  };
}

export function createSystemSpeechNotifier(options: {
  platform?: NodeJS.Platform;
  spawnFn?: typeof spawn;
} = {}): ScreenMonitorNotifier {
  const platform = options.platform ?? process.platform;
  const spawnFn = options.spawnFn ?? spawn;

  return {
    announce(text) {
      if (platform !== "darwin") {
        return Promise.resolve({
          ok: false,
          message: "当前系统暂不支持系统语音播报"
        });
      }

      return new Promise((resolve) => {
        const child = spawnFn("say", [text], {
          stdio: "ignore"
        });
        child.on("error", (error) => {
          resolve({
            ok: false,
            message: error.message
          });
        });
        child.on("close", (code) => {
          resolve(
            code === 0
              ? { ok: true }
              : { ok: false, message: `系统语音播报退出码：${code}` }
          );
        });
      });
    }
  };
}

export function createPyAutoGuiScreenCapture(options: {
  controller?: Pick<DesktopAutomationController, "screenshot">;
} = {}): ScreenMonitorScreenCapture {
  const controller = options.controller ?? createPyAutoGuiDesktopController();

  return {
    async capture() {
      const screenshot = await controller.screenshot();
      const dataUrl = typeof screenshot === "string" ? screenshot : screenshot.dataUrl;

      return {
        dataUrl,
        capturedAt: new Date().toISOString()
      };
    }
  };
}

export function createScreenMonitorService(options: {
  store: ControlPlaneStore;
  modelRuntime: ModelRuntime;
  capture?: ScreenMonitorScreenCapture;
  notifier?: ScreenMonitorNotifier;
  now?: () => string;
  setIntervalFn?: (callback: () => void, ms: number) => TimerHandle;
  clearIntervalFn?: (timer: TimerHandle) => void;
}): ScreenMonitorService {
  const capture = options.capture ?? createPyAutoGuiScreenCapture();
  const notifier = options.notifier ?? createSystemSpeechNotifier();
  const now = options.now ?? (() => new Date().toISOString());
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const timers = new Map<string, TimerHandle>();

  function getState() {
    return options.store.getState().screenMonitor ?? emptyScreenMonitorState();
  }

  function setState(patch: Partial<ScreenMonitorState>) {
    const current = getState();
    return options.store.setScreenMonitorState({
      ...current,
      ...patch,
      lastUpdatedAt: now()
    });
  }

  function upsertSession(session: ScreenMonitorSession) {
    const current = getState();
    return setState({
      sessions: [session, ...current.sessions.filter((item) => item.id !== session.id)].slice(0, 20),
      activeSessionId: session.status === "running"
        ? session.id
        : current.activeSessionId === session.id
          ? null
          : current.activeSessionId
    });
  }

  function getSession(id: string) {
    const session = getState().sessions.find((item) => item.id === id);

    if (!session) {
      throw new Error("screen monitor session not found");
    }

    return session;
  }

  function clearTimer(id: string) {
    const timer = timers.get(id);

    if (timer) {
      clearIntervalFn(timer);
      timers.delete(id);
    }
  }

  function schedule(session: ScreenMonitorSession) {
    clearTimer(session.id);
    const timer = setIntervalFn(() => {
      void service.checkSession(session.id, "interval").catch(() => undefined);
    }, session.intervalMs);
    timers.set(session.id, timer);
  }

  async function analyzeScreenshot(prompt: string, screenshotDataUrl: string) {
    const result = await options.modelRuntime.chat({
      kind: "chat",
      purpose: "vision",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "请理解当前屏幕截图，并完成用户的监控要求。",
                "只返回 JSON：{\"resultText\":\"当前结果\",\"confidence\":0到1,\"done\":boolean,\"announcement\":\"适合语音播报的一句话\",\"reason\":\"简短依据\"}。",
                "resultText 要稳定、简短，便于判断相邻两次结果是否变化。",
                `用户要求：${prompt}`
              ].join("\n")
            },
            {
              type: "image_url",
              image_url: {
                url: screenshotDataUrl
              }
            }
          ]
        }
      ],
      responseFormat: "json",
      temperature: 0,
      maxTokens: 500,
      timeoutMs: 60000
    });

    return parseVisionResult(result.text);
  }

  const service: ScreenMonitorService = {
    getState,
    async startSession(input) {
      const record = asRecord(input);
      const prompt = asTrimmedString(record.prompt);

      if (!prompt) {
        throw new Error("监控要求不能为空");
      }

      const current = getState();
      for (const session of current.sessions) {
        if (session.status === "running") {
          clearTimer(session.id);
        }
      }

      const createdAt = now();
      const session: ScreenMonitorSession = {
        id: `screen-session-${nanoid()}`,
        prompt,
        intervalMs: normalizeInterval(record.intervalMs),
        muted: record.muted === true,
        status: "running",
        createdAt,
        updatedAt: createdAt,
        startedAt: createdAt,
        stoppedAt: null,
        lastObservationId: null,
        lastResultText: null,
        lastAnnouncement: null,
        lastError: null,
        observations: []
      };
      const stoppedSessions = current.sessions.map((item) =>
        item.status === "running"
          ? { ...item, status: "stopped" as const, stoppedAt: createdAt, updatedAt: createdAt }
          : item
      );
      options.store.setScreenMonitorState({
        sessions: [session, ...stoppedSessions].slice(0, 20),
        activeSessionId: session.id,
        lastUpdatedAt: createdAt
      });
      schedule(session);
      await service.checkSession(session.id, "initial");

      return getSession(session.id);
    },
    stopSession(id) {
      const session = getSession(id);
      const stoppedAt = now();
      const stopped: ScreenMonitorSession = {
        ...session,
        status: "stopped",
        stoppedAt,
        updatedAt: stoppedAt
      };

      clearTimer(id);
      upsertSession(stopped);

      return stopped;
    },
    async checkSession(id, trigger = "manual") {
      const session = getSession(id);
      const checkedAt = now();
      let observation: ScreenMonitorObservation;

      try {
        const screenshot = await capture.capture();
        const result = await analyzeScreenshot(session.prompt, screenshot.dataUrl);
        const changed = session.lastResultText !== result.resultText;
        let announced = false;
        let announcementError: string | null = null;

        if (!session.muted && changed && result.announcement) {
          const notifyResult = await notifier.announce(result.announcement);
          announced = notifyResult.ok;
          announcementError = notifyResult.ok ? null : notifyResult.message ?? "系统语音播报失败";
        }

        observation = createObservation({
          sessionId: session.id,
          checkedAt,
          status: "completed",
          trigger,
          resultText: result.resultText,
          confidence: result.confidence,
          done: result.done,
          announcement: result.announcement,
          reason: result.reason,
          announced,
          error: announcementError
        });
      } catch (error) {
        observation = createObservation({
          sessionId: session.id,
          checkedAt,
          status: "failed",
          trigger,
          resultText: "",
          confidence: null,
          done: false,
          announcement: "",
          reason: "",
          announced: false,
          error: error instanceof Error ? error.message : "屏幕监控检查失败"
        });
      }

      const latest = getSession(id);
      const updated: ScreenMonitorSession = {
        ...latest,
        updatedAt: checkedAt,
        lastObservationId: observation.id,
        lastResultText: observation.status === "completed" ? observation.resultText : latest.lastResultText,
        lastAnnouncement: observation.status === "completed" ? observation.announcement : latest.lastAnnouncement,
        lastError: observation.error,
        observations: [observation, ...latest.observations].slice(0, 50)
      };
      upsertSession(updated);

      return observation;
    }
  };

  return service;
}
