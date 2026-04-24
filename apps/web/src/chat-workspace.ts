import { nanoid } from "nanoid";

import type { ChatMessage, ChatResponse } from "@agent-zy/shared-types";

export interface ChatProgressStep {
  id: string;
  label: string;
  detail: string;
  status: "running" | "completed";
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  progress: ChatProgressStep[];
  createdAt: string;
  updatedAt: string;
  hasCustomTitle: boolean;
}

export interface ChatWorkspaceState {
  sessions: ChatSession[];
  activeSessionId: string;
}

function createSessionId() {
  return `session-${nanoid(8)}`;
}

function createProgressId() {
  return `progress-${nanoid(8)}`;
}

function createEmptySession(now: string): ChatSession {
  return {
    id: createSessionId(),
    title: "新会话",
    messages: [],
    progress: [],
    createdAt: now,
    updatedAt: now,
    hasCustomTitle: false
  };
}

export function createSessionLabelFromPrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "新会话";
  }

  const firstSegment = normalized.split(/[，。！？；,.!?]/)[0]?.trim() ?? normalized;
  const concise = firstSegment || normalized;

  return concise.slice(0, 15).trim();
}

export function createInitialChatWorkspace(messages: ChatMessage[], now: string): ChatWorkspaceState {
  const initialSession = createEmptySession(now);
  const firstUserMessage = messages.find((message) => message.role === "user");

  if (messages.length > 0) {
    initialSession.messages = messages;
    initialSession.updatedAt = messages[messages.length - 1]?.createdAt ?? now;
  }

  if (firstUserMessage?.content.trim()) {
    initialSession.title = createSessionLabelFromPrompt(firstUserMessage.content);
    initialSession.hasCustomTitle = true;
  }

  return {
    sessions: [initialSession],
    activeSessionId: initialSession.id
  };
}

export function addSession(state: ChatWorkspaceState, now: string): ChatWorkspaceState {
  const nextSession = createEmptySession(now);

  return {
    sessions: [...state.sessions, nextSession],
    activeSessionId: nextSession.id
  };
}

export function removeSession(
  state: ChatWorkspaceState,
  sessionId: string,
  now: string
): ChatWorkspaceState {
  const targetIndex = state.sessions.findIndex((session) => session.id === sessionId);

  if (targetIndex === -1) {
    return state;
  }

  const nextSessions = state.sessions.filter((session) => session.id !== sessionId);

  if (nextSessions.length === 0) {
    const fallbackSession = createEmptySession(now);

    return {
      sessions: [fallbackSession],
      activeSessionId: fallbackSession.id
    };
  }

  const nextActiveSession =
    nextSessions[targetIndex] ?? nextSessions[targetIndex - 1] ?? nextSessions[0];

  return {
    sessions: nextSessions,
    activeSessionId: nextActiveSession.id
  };
}

export function applyOptimisticPrompt(
  state: ChatWorkspaceState,
  sessionId: string,
  prompt: string,
  now: string
): ChatWorkspaceState {
  return {
    ...state,
    sessions: state.sessions.map((session) => {
      if (session.id !== sessionId) {
        return session;
      }

      const userMessage: ChatMessage = {
        id: `user-${nanoid(8)}`,
        role: "user",
        content: prompt,
        createdAt: now
      };

      return {
        ...session,
        title: session.hasCustomTitle ? session.title : createSessionLabelFromPrompt(prompt),
        hasCustomTitle: true,
        updatedAt: now,
        messages: [...session.messages, userMessage],
        progress: [
          {
            id: createProgressId(),
            label: "路由分析",
            detail: "主 Agent 正在解析问题并判断需要调用哪些子 Agent。",
            status: "running",
            timestamp: now
          },
          {
            id: createProgressId(),
            label: "等待执行",
            detail: "等待主 Agent 返回路由结果和执行计划。",
            status: "running",
            timestamp: now
          }
        ]
      };
    })
  };
}

export function applyChatSuccess(
  state: ChatWorkspaceState,
  sessionId: string,
  response: ChatResponse,
  now: string
): ChatWorkspaceState {
  return {
    ...state,
    sessions: state.sessions.map((session) => {
      if (session.id !== sessionId) {
        return session;
      }

      return {
        ...session,
        updatedAt: now,
        messages: [...session.messages, response.message],
        progress: [
          {
            id: createProgressId(),
            label: "路由完成",
            detail: `主 Agent 已路由到 ${response.route.agentId}，原因：${response.route.reason}`,
            status: "completed",
            timestamp: response.task.createdAt
          },
          {
            id: createProgressId(),
            label: "执行中",
            detail: `${response.task.agentId} 开始处理：${response.task.summary}`,
            status: response.task.status === "completed" ? "completed" : "running",
            timestamp: response.task.updatedAt
          },
          {
            id: createProgressId(),
            label: "返回结果",
            detail: response.task.resultSummary ?? response.message.content,
            status: "completed",
            timestamp: response.message.createdAt
          }
        ]
      };
    })
  };
}
