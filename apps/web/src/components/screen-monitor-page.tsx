import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  ScreenMonitorObservation,
  ScreenMonitorSession,
  ScreenMonitorState
} from "@agent-zy/shared-types";

import {
  checkScreenMonitorSession,
  fetchScreenMonitor,
  startScreenMonitorSession,
  stopScreenMonitorSession
} from "../api";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";
import { ToolsBackLink } from "./tools-page";

type ScreenMonitorWorkspaceProps = {
  fetchAction?: () => Promise<ScreenMonitorState>;
  startAction?: (input: { prompt: string; intervalMs?: number; muted?: boolean }) => Promise<ScreenMonitorSession>;
  stopAction?: (id: string) => Promise<ScreenMonitorSession>;
  checkAction?: (id: string) => Promise<ScreenMonitorObservation>;
};

const DEFAULT_PROMPT = "每 3 分钟查看当前游戏还剩多少回合，告诉我剩余回合数；如果看不清，请说明原因。";
const DEFAULT_INTERVAL_SECONDS = 180;
const MIN_INTERVAL_SECONDS = 30;
const MAX_INTERVAL_SECONDS = 1800;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "暂无";
  }

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatConfidence(value: number | null) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "未知";
}

function upsertSession(state: ScreenMonitorState, session: ScreenMonitorSession): ScreenMonitorState {
  return {
    ...state,
    sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
    activeSessionId: session.status === "running" ? session.id : state.activeSessionId === session.id ? null : state.activeSessionId,
    lastUpdatedAt: session.updatedAt
  };
}

function appendObservation(session: ScreenMonitorSession, observation: ScreenMonitorObservation): ScreenMonitorSession {
  return {
    ...session,
    updatedAt: observation.checkedAt,
    lastObservationId: observation.id,
    lastResultText: observation.status === "completed" ? observation.resultText : session.lastResultText,
    lastAnnouncement: observation.status === "completed" ? observation.announcement : session.lastAnnouncement,
    lastError: observation.error,
    observations: [observation, ...session.observations.filter((item) => item.id !== observation.id)].slice(0, 50)
  };
}

export function ScreenMonitorWorkspace({
  fetchAction = fetchScreenMonitor,
  startAction = startScreenMonitorSession,
  stopAction = stopScreenMonitorSession,
  checkAction = checkScreenMonitorSession
}: ScreenMonitorWorkspaceProps) {
  const [state, setState] = useState<ScreenMonitorState>({
    sessions: [],
    activeSessionId: null,
    lastUpdatedAt: null
  });
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [intervalSeconds, setIntervalSeconds] = useState(DEFAULT_INTERVAL_SECONDS);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<"loading" | "idle" | "starting" | "checking" | "stopping">("loading");
  const [error, setError] = useState<string | null>(null);
  const activeSession = useMemo(
    () => state.activeSessionId ? state.sessions.find((session) => session.id === state.activeSessionId) ?? null : null,
    [state.activeSessionId, state.sessions]
  );
  const latestSession = activeSession ?? state.sessions[0] ?? null;
  const latestObservation = latestSession?.observations[0] ?? null;

  async function refresh() {
    setStatus("loading");
    setError(null);

    try {
      setState(await fetchAction());
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      setError("请填写监控要求");
      return;
    }

    setStatus("starting");
    setError(null);

    try {
      const session = await startAction({
        prompt: trimmedPrompt,
        intervalMs: Math.round(intervalSeconds * 1000),
        muted
      });
      setState((current) => upsertSession(current, session));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  async function handleCheckNow() {
    if (!latestSession) {
      return;
    }

    setStatus("checking");
    setError(null);

    try {
      const observation = await checkAction(latestSession.id);
      setState((current) => {
        const session = current.sessions.find((item) => item.id === latestSession.id) ?? latestSession;
        return upsertSession(current, appendObservation(session, observation));
      });
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  async function handleStop() {
    if (!activeSession) {
      return;
    }

    setStatus("stopping");
    setError(null);

    try {
      const stopped = await stopAction(activeSession.id);
      setState((current) => upsertSession(current, stopped));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  return (
    <section className="screen-monitor-shell">
      <header className="tools-page-header">
        <div>
          <p className="eyebrow">Screen Monitor</p>
          <h1>屏幕监控</h1>
          <p>定时理解当前屏幕内容，按你的要求提取结果，并在结果变化时通过系统语音播报。</p>
        </div>
        <div className="tools-page-header__actions">
          <ToolsBackLink />
        </div>
      </header>

      {error ? <div className="tools-notice tools-notice--error">{error}</div> : null}

      <div className="screen-monitor-layout">
        <form className="screen-monitor-panel screen-monitor-form" onSubmit={(event) => void handleStart(event)}>
          <div className="screen-monitor-panel__title">
            <div>
              <p className="eyebrow">Task</p>
              <h2>监控任务</h2>
            </div>
            <span>{activeSession ? "运行中" : latestSession?.status === "stopped" ? "已停止" : "待启动"}</span>
          </div>
          <label>
            监控要求
            <textarea
              name="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
            />
          </label>
          <label>
            检查间隔（秒）
            <input
              name="intervalSeconds"
              type="number"
              min={MIN_INTERVAL_SECONDS}
              max={MAX_INTERVAL_SECONDS}
              step={10}
              value={intervalSeconds}
              onChange={(event) => setIntervalSeconds(Number(event.target.value))}
            />
          </label>
          <label className="screen-monitor-checkbox">
            <input
              type="checkbox"
              checked={muted}
              onChange={(event) => setMuted(event.target.checked)}
            />
            <span>静音，只记录结果不语音播报</span>
          </label>
          <div className="screen-monitor-actions">
            <button type="submit" disabled={status === "starting"}>
              {status === "starting" ? "正在启动..." : "开始监控"}
            </button>
            <button
              type="button"
              data-action="check-now"
              disabled={!latestSession || status === "checking"}
              onClick={() => void handleCheckNow()}
            >
              {status === "checking" ? "正在检查..." : "立即检查"}
            </button>
            <button
              type="button"
              data-action="stop"
              disabled={!activeSession || status === "stopping"}
              onClick={() => void handleStop()}
            >
              {status === "stopping" ? "正在停止..." : "停止"}
            </button>
          </div>
        </form>

        <section className="screen-monitor-panel screen-monitor-result">
          <div className="screen-monitor-panel__title">
            <div>
              <p className="eyebrow">Latest</p>
              <h2>最新结果</h2>
            </div>
            <span>{latestObservation ? formatTime(latestObservation.checkedAt) : "暂无检查"}</span>
          </div>
          {latestObservation ? (
            <div className="screen-monitor-result__body">
              <strong>{latestObservation.resultText || latestObservation.error || "暂无结果"}</strong>
              <p>{latestObservation.announcement || latestObservation.reason || latestObservation.error}</p>
              <dl>
                <div>
                  <dt>状态</dt>
                  <dd>{latestObservation.status === "completed" ? "已完成" : "失败"}</dd>
                </div>
                <div>
                  <dt>置信度</dt>
                  <dd>{formatConfidence(latestObservation.confidence)}</dd>
                </div>
                <div>
                  <dt>播报</dt>
                  <dd>{latestObservation.announced ? "已播报" : latestSession?.muted ? "已静音" : "未播报"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="screen-monitor-empty">启动后会在这里显示第一次屏幕理解结果。</div>
          )}
        </section>
      </div>

      <section className="screen-monitor-panel screen-monitor-history">
        <div className="screen-monitor-panel__title">
          <div>
            <p className="eyebrow">History</p>
            <h2>检查历史</h2>
          </div>
          <span>{latestSession?.observations.length ?? 0} 条</span>
        </div>
        {latestSession?.observations.length ? (
          <div className="screen-monitor-history__list">
            {latestSession.observations.map((observation) => (
              <article className="screen-monitor-history__item" key={observation.id}>
                <time>{formatTime(observation.checkedAt)}</time>
                <div>
                  <strong>{observation.resultText || observation.error || "检查失败"}</strong>
                  <p>{observation.reason || observation.announcement || observation.error}</p>
                </div>
                <span>{observation.trigger === "interval" ? "定时" : observation.trigger === "initial" ? "启动" : "手动"}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="screen-monitor-empty">暂无历史记录。</div>
        )}
      </section>
    </section>
  );
}

export function ScreenMonitorPage() {
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
      <ScreenMonitorWorkspace />
    </main>
  );
}
