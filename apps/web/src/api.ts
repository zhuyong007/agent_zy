import type {
  ChatResponse,
  DashboardData,
  NewsState,
  TopicState
} from "@agent-zy/shared-types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4378";

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch(`${API_BASE}/api/dashboard`);

  if (!response.ok) {
    throw new Error("Failed to fetch dashboard");
  }

  return response.json();
}

export async function cancelNotification(notificationId: string): Promise<DashboardData> {
  const response = await fetch(`${API_BASE}/api/notifications/${notificationId}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error("Failed to cancel notification");
  }

  return response.json();
}

export async function fetchNews(): Promise<NewsState> {
  const response = await fetch(`${API_BASE}/api/news`);

  if (!response.ok) {
    throw new Error("Failed to fetch news");
  }

  return response.json();
}

export async function fetchTopics(): Promise<TopicState> {
  const response = await fetch(`${API_BASE}/api/topics`);

  if (!response.ok) {
    throw new Error("Failed to fetch topics");
  }

  return response.json();
}

export async function generateTopics(reason = "manual"): Promise<TopicState> {
  const response = await fetch(`${API_BASE}/api/topics/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      reason
    })
  });

  if (!response.ok) {
    throw new Error("Failed to generate topics");
  }

  return response.json();
}

export async function generateHistory(reason = "manual"): Promise<DashboardData> {
  console.info("[history-generate] request:start", {
    endpoint: `${API_BASE}/api/history/generate`,
    reason
  });

  const response = await fetch(`${API_BASE}/api/history/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      reason
    })
  });

  console.info("[history-generate] request:response", {
    status: response.status,
    ok: response.ok
  });

  if (response.status === 404) {
    console.warn("[history-generate] dedicated endpoint missing; falling back to chat route");
    const chatResponse = await sendChat("请生成今天的历史知识点小红书推文策划");

    console.info("[history-generate] fallback:chat-response", {
      agentId: chatResponse.route.agentId,
      taskStatus: chatResponse.task.status,
      taskSummary: chatResponse.task.resultSummary
    });

    if (chatResponse.task.status !== "completed") {
      throw new Error(chatResponse.message.content || "Failed to generate history");
    }

    return fetchDashboard();
  }

  if (!response.ok) {
    throw new Error("Failed to generate history");
  }

  const dashboard = (await response.json()) as DashboardData;
  const latestHistoryTask = dashboard.recentTasks.find((task) => task.agentId === "history-agent");

  console.info("[history-generate] dashboard:latest-history-task", {
    taskId: latestHistoryTask?.id,
    status: latestHistoryTask?.status,
    resultSummary: latestHistoryTask?.resultSummary
  });

  if (latestHistoryTask && latestHistoryTask.status === "failed") {
    throw new Error(latestHistoryTask.resultSummary ?? "历史知识生成失败");
  }

  return dashboard;
}

export type NewsRefreshInput = {
  reason?: string;
  view?: "all" | "daily";
  category?: string;
  q?: string;
  since?: string;
  take?: number;
  cursor?: string;
  date?: string;
};

export async function refreshNews(input: NewsRefreshInput = {}): Promise<NewsState> {
  const response = await fetch(`${API_BASE}/api/news/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      reason: "manual",
      ...input
    })
  });

  if (!response.ok) {
    throw new Error("Failed to refresh news");
  }

  return response.json();
}

export async function sendChat(message: string): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message
    })
  });

  if (!response.ok) {
    throw new Error("Failed to send chat");
  }

  return response.json();
}

export function openDashboardStream(onData: (data: DashboardData) => void) {
  const stream = new EventSource(`${API_BASE}/api/stream`);

  const handler = (event: MessageEvent<string>) => {
    onData(JSON.parse(event.data) as DashboardData);
  };

  stream.addEventListener("dashboard.bootstrap", handler);
  stream.addEventListener("dashboard.updated", handler);
  stream.addEventListener("runtime.updated", handler);

  return () => {
    stream.close();
  };
}
