import type {
  ChatResponse,
  DashboardData,
  HomeModulePreference,
  LedgerFactRecord,
  LedgerReportRecord,
  LedgerSemanticRecord,
  LifeStageRecord,
  NewsState,
  SummaryEntry,
  SummaryType,
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

export async function fetchHomeLayout(): Promise<HomeModulePreference[]> {
  const response = await fetch(`${API_BASE}/api/home-layout`);

  if (!response.ok) {
    throw new Error("Failed to fetch home layout");
  }

  return response.json();
}

export async function saveHomeLayout(
  layout: readonly HomeModulePreference[]
): Promise<HomeModulePreference[]> {
  const response = await fetch(`${API_BASE}/api/home-layout`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      layout
    })
  });

  if (!response.ok) {
    throw new Error("Failed to save home layout");
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

export type SummaryListInput = {
  summaryType?: SummaryType;
  q?: string;
  start?: string;
  end?: string;
};

export type SummaryExportPayload = {
  version: 1;
  exportedAt: string;
  metadata: {
    source: "agent-zy";
    count: number;
  };
  entries: SummaryEntry[];
};

function buildQuery(input: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  Object.entries(input).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchSummaries(input: SummaryListInput = {}): Promise<{ entries: SummaryEntry[] }> {
  const response = await fetch(`${API_BASE}/api/summaries${buildQuery(input)}`);

  if (!response.ok) {
    throw new Error("Failed to fetch summaries");
  }

  return response.json();
}

export async function createSummary(input: SummaryEntry): Promise<SummaryEntry> {
  const response = await fetch(`${API_BASE}/api/summaries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to create summary"));
  }

  return response.json();
}

export async function updateSummary(id: string, input: Partial<SummaryEntry>): Promise<SummaryEntry> {
  const response = await fetch(`${API_BASE}/api/summaries/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to update summary"));
  }

  return response.json();
}

export async function deleteSummary(id: string): Promise<{ ok: true }> {
  const response = await fetch(`${API_BASE}/api/summaries/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to delete summary"));
  }

  return response.json();
}

export async function generateSummaryDraft(input: {
  summaryType: SummaryType;
  rawInput: string;
}): Promise<SummaryEntry> {
  const response = await fetch(`${API_BASE}/api/summaries/generate-draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to generate summary draft"));
  }

  return response.json();
}

export async function exportSummaries(): Promise<SummaryExportPayload> {
  const response = await fetch(`${API_BASE}/api/summaries/export`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error("Failed to export summaries");
  }

  return response.json();
}

export async function importSummaries(input: SummaryExportPayload): Promise<{
  importedCount: number;
  skippedCount: number;
  entries: SummaryEntry[];
}> {
  const response = await fetch(`${API_BASE}/api/summaries/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to import summaries"));
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

export async function openExternalUrl(url: string): Promise<{ ok: true }> {
  const response = await fetch(`${API_BASE}/api/open-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      url
    })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to open external URL"));
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

export type LedgerTimelineItem = {
  fact: LedgerFactRecord;
  semantic: Pick<
    LedgerSemanticRecord,
    | "primaryCategory"
    | "secondaryCategories"
    | "tags"
    | "people"
    | "confidence"
    | "reasoningSummary"
    | "parserVersion"
    | "lifeStageIds"
    | "scene"
  > | null;
};

async function readApiError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function recordLedger(message: string): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/api/ledger/record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message
    })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to record ledger item"));
  }

  return response.json();
}

export async function askLedgerCoach(message: string): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/api/ledger/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message
    })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to ask ledger coach"));
  }

  return response.json();
}

export async function fetchLedgerTimeline(): Promise<LedgerTimelineItem[]> {
  const response = await fetch(`${API_BASE}/api/ledger/timeline`);

  if (!response.ok) {
    throw new Error("Failed to fetch ledger timeline");
  }

  return response.json();
}

export async function fetchLedgerReports(): Promise<LedgerReportRecord[]> {
  const response = await fetch(`${API_BASE}/api/ledger/reports`);

  if (!response.ok) {
    throw new Error("Failed to fetch ledger reports");
  }

  return response.json();
}

export async function fetchLedgerStages(): Promise<LifeStageRecord[]> {
  const response = await fetch(`${API_BASE}/api/ledger/stages`);

  if (!response.ok) {
    throw new Error("Failed to fetch ledger stages");
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
