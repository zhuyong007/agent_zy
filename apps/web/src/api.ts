import type {
  ChatResponse,
  DashboardData,
  NewsItemArticlesResponse,
  NewsCategory,
  NewsState
} from "@agent-zy/shared-types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4378";

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch(`${API_BASE}/api/dashboard`);

  if (!response.ok) {
    throw new Error("Failed to fetch dashboard");
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

export async function addNewsSource(source: {
  name: string;
  url: string;
  category: NewsCategory;
}): Promise<NewsState> {
  const response = await fetch(`${API_BASE}/api/news/sources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(source)
  });

  if (!response.ok) {
    throw new Error("Failed to add news source");
  }

  return response.json();
}

export async function updateNewsSource(
  sourceId: string,
  patch: Partial<{
    name: string;
    url: string;
    category: NewsCategory;
    enabled: boolean;
  }>
): Promise<NewsState> {
  const response = await fetch(`${API_BASE}/api/news/sources/${sourceId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    throw new Error("Failed to update news source");
  }

  return response.json();
}

export async function deleteNewsSource(sourceId: string): Promise<NewsState> {
  const response = await fetch(`${API_BASE}/api/news/sources/${sourceId}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error("Failed to delete news source");
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

export async function summarizeNews(): Promise<NewsState> {
  const response = await fetch(`${API_BASE}/api/news/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      reason: "manual-summary",
      forceSummary: true
    })
  });

  if (!response.ok) {
    throw new Error("Failed to summarize news");
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

export async function fetchNewsItemArticles(
  itemId: string
): Promise<NewsItemArticlesResponse> {
  const response = await fetch(`${API_BASE}/api/news/items/${itemId}/articles`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error("Failed to fetch news item articles");
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
