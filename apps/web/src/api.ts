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

export async function refreshNews(reason = "manual"): Promise<NewsState> {
  const response = await fetch(`${API_BASE}/api/news/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      reason
    })
  });

  if (!response.ok) {
    throw new Error("Failed to refresh news");
  }

  return response.json();
}

export async function analyzeNewsItem(itemId: string): Promise<NewsState> {
  const response = await fetch(`${API_BASE}/api/news/items/${itemId}/analyze`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error("Failed to analyze news item");
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
