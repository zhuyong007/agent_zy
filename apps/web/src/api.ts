import type {
  ChatResponse,
  ChildMealOverview,
  ChildMealPlan,
  ChildMealPlanType,
  ChildMealRecord,
  ChildNote,
  ChildProfile,
  BrowserAutomationRun,
  BrowserAutomationState,
  BrowserAutomationTriggerRule,
  BrowserAutomationWorkflow,
  CinematicProject,
  CinematicState,
  ClassicShotState,
  ClassicShotTargetPlatform,
  DashboardData,
  DataSyncModule,
  DataSyncResolution,
  DataSyncResult,
  DataSyncStatusResponse,
  EventLogInput,
  EventLogQuery,
  EventLogQueryResult,
  FileOrganizerExecuteResult,
  FileOrganizerPreviewInput,
  FileOrganizerPreviewResult,
  FileOrganizerUndoResult,
  HistoryCommentExtraction,
  HistoryCommentReplyInputMode,
  HistoryCommentReplyRecord,
  HistoryCommentReplyState,
  HistoryDynastyModuleType,
  HistoryXhsState,
  ImageToVideoProject,
  ImageToVideoState,
  InterviewAnswer,
  InterviewDailyReport,
  InterviewDailySession,
  InterviewOverview,
  HomeModulePreference,
  LedgerFactRecord,
  LedgerReportRecord,
  LedgerSemanticRecord,
  LifeStageRecord,
  ModelCapability,
  ModelProfile,
  ModelProviderDefinition,
  ModelProviderId,
  ModelPurpose,
  ModelSettingsState,
  MhxyAssetFlipInput,
  MhxyAssetFlipRecord,
  MhxyDashboard,
  MhxyGameCoinPurchaseInput,
  MhxyGameCoinPurchaseRecord,
  MhxyGameCoinCashoutInput,
  MhxyGameCoinCashoutRecord,
  MhxyInventoryTarget,
  MhxyInventoryTransferInput,
  MhxyInventoryTransferPatch,
  MhxyInventoryTransferRecord,
  MhxyPriceSnapshot,
  MhxyPriceSnapshotInput,
  MhxyPriceSeriesUpdateInput,
  MhxyPriceSeriesUpdateResult,
  MhxyTradeInput,
  MhxyTradeRecord,
  NewsState,
  PromptTemplateApplyResult,
  PromptTemplateRecord,
  PromptTemplateState,
  PhotoRenameExecuteResult,
  PhotoRenameMediaScope,
  PhotoRenamePreviewResult,
  PhotoRenameUndoResult,
  ScreenMonitorObservation,
  ScreenMonitorSession,
  ScreenMonitorState,
  SummaryEntry,
  SummaryType,
  TopicState
} from "@agent-zy/shared-types";

export async function fetchDataSyncStatus(): Promise<DataSyncStatusResponse> {
  const response = await fetch(`${API_BASE}/api/data-sync/status`);
  if (!response.ok) {
    throw new Error(await readApiError(response, "读取数据同步状态失败"));
  }
  return response.json();
}

export async function syncModuleData(
  module: DataSyncModule,
  request: { conflictToken?: string; resolutions?: DataSyncResolution[] } = {}
): Promise<DataSyncResult> {
  const response = await fetch(`${API_BASE}/api/data-sync/${module}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "同步模块数据失败"));
  }
  return response.json();
}

export function resolveApiBase(
  configuredBase?: string | null,
  locationLike: Pick<Location, "protocol" | "hostname"> | null =
    typeof window === "undefined" ? null : window.location
) {
  const pageHostname = locationLike?.hostname || "127.0.0.1";
  const pageProtocol = locationLike?.protocol === "https:" ? "https:" : "http:";

  if (configuredBase) {
    try {
      const configuredUrl = new URL(configuredBase);
      const configuredHostIsLoopback = ["127.0.0.1", "localhost", "::1"].includes(configuredUrl.hostname);
      const pageHostIsLoopback = ["127.0.0.1", "localhost", "::1"].includes(pageHostname);

      if (configuredHostIsLoopback && !pageHostIsLoopback) {
        configuredUrl.hostname = pageHostname;
        configuredUrl.protocol = pageProtocol;
        return configuredUrl.toString().replace(/\/$/, "");
      }
    } catch {
      return configuredBase;
    }

    return configuredBase;
  }

  return `${pageProtocol}//${pageHostname}:4378`;
}

const API_BASE = resolveApiBase(import.meta.env.VITE_API_URL);

async function childMealRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}/api/tools/child-meal${path}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  });
  if (!response.ok) throw new Error(await readApiError(response, "孩子食谱操作失败"));
  return response.json();
}

export const fetchChildMealOverview = () => childMealRequest<ChildMealOverview>("/overview");
export const saveChildMealProfile = (input: Partial<ChildProfile>) => childMealRequest<ChildMealOverview>("/profile", "POST", input);
export const createChildMealNote = (input: Partial<ChildNote>) => childMealRequest<ChildNote>("/notes", "POST", input);
export const updateChildMealNote = (id: string, input: Partial<ChildNote>) => childMealRequest<ChildNote>(`/notes/${id}`, "PUT", input);
export const deleteChildMealNote = (id: string) => childMealRequest<{ ok: true }>(`/notes/${id}`, "DELETE");
export const createChildMealRecord = (input: Partial<ChildMealRecord>) => childMealRequest<ChildMealRecord>("/records", "POST", input);
export const updateChildMealRecord = (id: string, input: Partial<ChildMealRecord>) => childMealRequest<ChildMealRecord>(`/records/${id}`, "PUT", input);
export const deleteChildMealRecord = (id: string) => childMealRequest<{ ok: true }>(`/records/${id}`, "DELETE");
export const generateChildMealPlan = (input: { planType: ChildMealPlanType; userExtraRequest?: string }) => childMealRequest<ChildMealPlan>("/generate-plan", "POST", input);
export const saveChildMealPlan = (input: ChildMealPlan) => childMealRequest<ChildMealPlan>("/save-plan", "POST", input);
export const convertChildMealPlanMeal = (input: { date: string; meal: ChildMealPlan["days"][number]["meals"][number] }) => childMealRequest<ChildMealRecord>("/records/from-plan", "POST", input);

async function interviewRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}/api/interview${path}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  });
  if (!response.ok) throw new Error(await readApiError(response, "面试训练操作失败"));
  return response.json();
}

export const fetchInterviewOverview = () => interviewRequest<InterviewOverview>("/overview");
export const createInterviewDailySession = (input: { force?: boolean } = {}) =>
  interviewRequest<InterviewDailySession>("/daily-session", "POST", input);
export const submitInterviewAnswer = (input: { questionId: string; answerText: string }) =>
  interviewRequest<InterviewAnswer>("/answers", "POST", input);
export const updateInterviewAnswer = (id: string, input: Partial<Pick<InterviewAnswer, "manualScore" | "mastery" | "note">>) =>
  interviewRequest<InterviewAnswer>(`/answers/${id}`, "PATCH", input);
export const regenerateInterviewReport = (date: string) =>
  interviewRequest<InterviewDailyReport>(`/reports/${date}/regenerate`, "POST");

export function resolveImageToVideoAssetUrl(url: string) {
  return url.startsWith("/api/") ? `${API_BASE}${url}` : url;
}

async function imageToVideoJsonRequest(path: string, body: unknown): Promise<ImageToVideoProject> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "图片转视频策划请求失败"));
  }
  return response.json();
}

export async function fetchImageToVideoProjects(): Promise<ImageToVideoState> {
  const response = await fetch(`${API_BASE}/api/image-to-video/projects`);
  if (!response.ok) {
    throw new Error(await readApiError(response, "读取图片转视频项目失败"));
  }
  return response.json();
}

export async function analyzeImageToVideo(input: FormData): Promise<ImageToVideoProject> {
  const response = await fetch(`${API_BASE}/api/image-to-video/analyze`, { method: "POST", body: input });
  if (!response.ok) {
    throw new Error(await readApiError(response, "图片分析失败"));
  }
  return response.json();
}

export const generateImageToVideoPlan = (projectId: string) =>
  imageToVideoJsonRequest("/api/image-to-video/plan", { projectId });
export const generateImageToVideoKeyframes = (projectId: string) =>
  imageToVideoJsonRequest("/api/image-to-video/keyframes", { projectId });
export const generateImageToVideoFinalPrompt = (projectId: string) =>
  imageToVideoJsonRequest("/api/image-to-video/final-prompt", { projectId });
export const overrideImageToVideoKeyframe = (projectId: string, keyframeId: string) =>
  imageToVideoJsonRequest(`/api/image-to-video/keyframes/${keyframeId}/override`, { projectId });

export async function reviewImageToVideoKeyframe(input: FormData): Promise<ImageToVideoProject> {
  const response = await fetch(`${API_BASE}/api/image-to-video/review-keyframe`, { method: "POST", body: input });
  if (!response.ok) {
    throw new Error(await readApiError(response, "关键帧审核失败"));
  }
  return response.json();
}

export async function deleteImageToVideoProject(projectId: string): Promise<ImageToVideoState> {
  const response = await fetch(`${API_BASE}/api/image-to-video/projects/${projectId}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await readApiError(response, "删除项目失败"));
  }
  return response.json();
}

export async function previewPhotoRenames(
  directoryPath: string,
  mediaScope: PhotoRenameMediaScope = "all"
): Promise<PhotoRenamePreviewResult> {
  const response = await fetch(`${API_BASE}/api/tools/photo-renamer/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ directoryPath, mediaScope })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to preview photo renames"));
  }

  return response.json();
}

export async function executePhotoRenames(previewToken: string): Promise<PhotoRenameExecuteResult> {
  const response = await fetch(`${API_BASE}/api/tools/photo-renamer/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ previewToken })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to execute photo renames"));
  }

  return response.json();
}

export async function undoPhotoRenames(undoToken: string): Promise<PhotoRenameUndoResult> {
  const response = await fetch(`${API_BASE}/api/tools/photo-renamer/undo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ undoToken })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to undo photo renames"));
  }

  return response.json();
}

export async function previewFileOrganization(input: FileOrganizerPreviewInput): Promise<FileOrganizerPreviewResult> {
  const response = await fetch(`${API_BASE}/api/tools/file-organizer/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to preview file organization"));
  }

  return response.json();
}

export async function executeFileOrganization(previewToken: string): Promise<FileOrganizerExecuteResult> {
  const response = await fetch(`${API_BASE}/api/tools/file-organizer/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ previewToken })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to execute file organization"));
  }

  return response.json();
}

export async function undoFileOrganization(undoToken: string): Promise<FileOrganizerUndoResult> {
  const response = await fetch(`${API_BASE}/api/tools/file-organizer/undo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ undoToken })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to undo file organization"));
  }

  return response.json();
}

export async function fetchScreenMonitor(): Promise<ScreenMonitorState> {
  const response = await fetch(`${API_BASE}/api/tools/screen-monitor`);

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to fetch screen monitor state"));
  }

  return response.json();
}

export async function startScreenMonitorSession(input: {
  prompt: string;
  intervalMs?: number;
  muted?: boolean;
}): Promise<ScreenMonitorSession> {
  const response = await fetch(`${API_BASE}/api/tools/screen-monitor/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to start screen monitor session"));
  }

  return response.json();
}

export async function checkScreenMonitorSession(id: string): Promise<ScreenMonitorObservation> {
  const response = await fetch(`${API_BASE}/api/tools/screen-monitor/sessions/${id}/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to check screen monitor session"));
  }

  return response.json();
}

export async function stopScreenMonitorSession(id: string): Promise<ScreenMonitorSession> {
  const response = await fetch(`${API_BASE}/api/tools/screen-monitor/sessions/${id}/stop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to stop screen monitor session"));
  }

  return response.json();
}

export async function fetchPromptTemplates(): Promise<PromptTemplateState> {
  const response = await fetch(`${API_BASE}/api/tools/prompt-templates`);

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to fetch prompt templates"));
  }

  return response.json();
}

export async function createPromptTemplate(input: {
  title: string;
  originalPrompt: string;
}): Promise<PromptTemplateRecord> {
  const response = await fetch(`${API_BASE}/api/tools/prompt-templates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to create prompt template"));
  }

  return response.json();
}

export async function updatePromptTemplate(
  id: string,
  input: Partial<PromptTemplateRecord>
): Promise<PromptTemplateRecord> {
  const response = await fetch(`${API_BASE}/api/tools/prompt-templates/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to update prompt template"));
  }

  return response.json();
}

export async function deletePromptTemplate(id: string): Promise<{ ok: true }> {
  const response = await fetch(`${API_BASE}/api/tools/prompt-templates/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to delete prompt template"));
  }

  return response.json();
}

export async function applyPromptTemplate(
  id: string,
  input: { values: Record<string, string> }
): Promise<PromptTemplateApplyResult> {
  const response = await fetch(`${API_BASE}/api/tools/prompt-templates/${id}/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to apply prompt template"));
  }

  return response.json();
}

export async function fetchBrowserAutomation(): Promise<BrowserAutomationState> {
  const response = await fetch(`${API_BASE}/api/browser-automation`);

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to fetch browser automation state"));
  }

  return response.json();
}

export async function openBrowserAutomationPermissionSettings(
  kind: "accessibility" | "screen-recording"
): Promise<{ opened: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/api/browser-automation/permissions/open`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ kind })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to open desktop automation permission settings"));
  }

  return response.json();
}

export async function createBrowserAutomationWorkflow(input: unknown): Promise<BrowserAutomationWorkflow> {
  const response = await fetch(`${API_BASE}/api/browser-automation/workflows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to create browser automation workflow"));
  }

  return response.json();
}

export async function updateBrowserAutomationWorkflow(id: string, input: unknown): Promise<BrowserAutomationWorkflow> {
  const response = await fetch(`${API_BASE}/api/browser-automation/workflows/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to update browser automation workflow"));
  }

  return response.json();
}

export async function deleteBrowserAutomationWorkflow(id: string): Promise<{ ok: true }> {
  const response = await fetch(`${API_BASE}/api/browser-automation/workflows/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to delete browser automation workflow"));
  }

  return response.json();
}

export async function runBrowserAutomationWorkflow(id: string): Promise<BrowserAutomationRun> {
  const response = await fetch(`${API_BASE}/api/browser-automation/workflows/${id}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to run browser automation workflow"));
  }

  return response.json();
}

export async function stopBrowserAutomationRun(id: string): Promise<{ ok: true }> {
  const response = await fetch(`${API_BASE}/api/browser-automation/runs/${id}/stop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to stop browser automation run"));
  }

  return response.json();
}

export async function createBrowserAutomationTriggerRule(input: unknown): Promise<BrowserAutomationTriggerRule> {
  const response = await fetch(`${API_BASE}/api/browser-automation/trigger-rules`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to create browser automation trigger rule"));
  }

  return response.json();
}

export async function fetchEventLogs(query: EventLogQuery = {}): Promise<EventLogQueryResult> {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }

  const response = await fetch(`${API_BASE}/api/logs${params.size ? `?${params.toString()}` : ""}`);

  if (!response.ok) {
    throw new Error("Failed to fetch event logs");
  }

  return response.json();
}

export async function reportClientEvent(input: Pick<EventLogInput, "action" | "message"> & Partial<EventLogInput>) {
  const response = await fetch(`${API_BASE}/api/logs/client-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      level: "info",
      category: "frontend",
      ...input
    })
  });

  if (!response.ok) {
    throw new Error("Failed to report client event");
  }

  return response.json() as Promise<{ ok: true }>;
}

export async function clearEventLogs() {
  const response = await fetch(`${API_BASE}/api/logs`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error("Failed to clear event logs");
  }

  return response.json() as Promise<{ ok: true }>;
}

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

export type ModelProfileView = ModelProfile & {
  hasApiKey: boolean;
  maskedKey: string | null;
  apiKeySource: "env" | "local" | null;
};

export type ModelProfileInput = {
  displayName: string;
  provider: ModelProviderId;
  modelName: string;
  baseUrl: string;
  apiKey?: string;
  capabilities: ModelCapability[];
  purpose: ModelPurpose[];
  temperature: number | null;
  maxTokens: number | null;
  enabled: boolean;
  isDefault: boolean;
};

export async function fetchModelProviders(): Promise<{ providers: ModelProviderDefinition[] }> {
  const response = await fetch(`${API_BASE}/api/model-providers`);

  if (!response.ok) {
    throw new Error("Failed to fetch model providers");
  }

  return response.json();
}

export async function fetchModelProfiles(): Promise<{
  profiles: ModelProfileView[];
  settings: ModelSettingsState;
  agents: Array<{
    id: string;
    name: string;
    capabilities: string[];
  }>;
}> {
  const response = await fetch(`${API_BASE}/api/model-profiles`);

  if (!response.ok) {
    throw new Error("Failed to fetch model profiles");
  }

  return response.json();
}

export async function createModelProfile(input: ModelProfileInput): Promise<ModelProfileView> {
  const response = await fetch(`${API_BASE}/api/model-profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to create model profile"));
  }

  return response.json();
}

export async function updateModelProfile(
  id: string,
  input: Partial<ModelProfileInput>
): Promise<ModelProfileView> {
  const response = await fetch(`${API_BASE}/api/model-profiles/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to update model profile"));
  }

  return response.json();
}

export async function deleteModelProfile(id: string): Promise<{ ok: true }> {
  const response = await fetch(`${API_BASE}/api/model-profiles/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to delete model profile"));
  }

  return response.json();
}

export async function testModelProfile(id: string): Promise<{ ok: boolean; latencyMs?: number; message: string }> {
  try {
    const response = await fetch(`${API_BASE}/api/model-profiles/${id}/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{}"
    });

    if (!response.ok) {
      return {
        ok: false,
        message: await readApiError(response, "Failed to test model profile")
      };
    }

    return response.json();
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to test model profile"
    };
  }
}

export async function setAgentDefaultModel(input: {
  agentId: string;
  profileId: string | null;
}): Promise<ModelSettingsState> {
  const response = await fetch(`${API_BASE}/api/model-profiles/agent-default`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to set agent default model"));
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

export async function fetchCinematic(): Promise<CinematicState> {
  const response = await fetch(`${API_BASE}/api/cinematic`);

  if (!response.ok) {
    throw new Error("Failed to fetch cinematic projects");
  }

  return response.json();
}

export type CinematicGenerateInput = {
  concept: string;
  style?: string;
  visualStyle?: string;
  pace?: string;
  targetShotCount?: number;
  visualFocus?: string;
  negativePrompt?: string;
};

export async function generateCinematic(input: CinematicGenerateInput): Promise<CinematicState> {
  const response = await fetch(`${API_BASE}/api/cinematic/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to generate cinematic storyboard"));
  }

  return response.json();
}

export async function createCinematicProject(input: Partial<CinematicProject>): Promise<CinematicProject> {
  const response = await fetch(`${API_BASE}/api/cinematic/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to create cinematic project"));
  }

  return response.json();
}

export async function updateCinematicProject(
  id: string,
  input: Partial<CinematicProject>
): Promise<CinematicProject> {
  const response = await fetch(`${API_BASE}/api/cinematic/projects/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to update cinematic project"));
  }

  return response.json();
}

export async function deleteCinematicProject(id: string): Promise<CinematicState> {
  const response = await fetch(`${API_BASE}/api/cinematic/projects/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to delete cinematic project"));
  }

  return response.json();
}

export async function fetchClassicShots(): Promise<ClassicShotState> {
  const response = await fetch(`${API_BASE}/api/classic-shots`);

  if (!response.ok) {
    throw new Error("Failed to fetch classic shot projects");
  }

  return response.json();
}

export type ClassicShotGenerateInput = {
  input: string;
  targetPlatform?: ClassicShotTargetPlatform;
};

export async function generateClassicShot(input: ClassicShotGenerateInput): Promise<ClassicShotState> {
  const response = await fetch(`${API_BASE}/api/classic-shots/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to generate classic shot storyboard"));
  }

  return response.json();
}

export async function generateClassicShotFromVideo(input: FormData): Promise<ClassicShotState> {
  const response = await fetch(`${API_BASE}/api/classic-shots/generate-from-video`, {
    method: "POST",
    body: input
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to generate classic shot storyboard from video"));
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

export type HistoryGenerateInput = {
  reason?: string;
  mode?: "topic" | "dynasty";
  topic?: string;
  dynasty?: string;
};

export async function generateHistory(input: HistoryGenerateInput | string = "manual"): Promise<DashboardData> {
  const request =
    typeof input === "string"
      ? {
          reason: input
        }
      : {
          reason: input.reason ?? "manual",
          mode: input.mode === "dynasty" ? "dynasty" : undefined,
          topic: input.topic?.trim() || undefined,
          dynasty: input.dynasty?.trim() || undefined
        };

  console.info("[history-generate] request:start", {
    endpoint: `${API_BASE}/api/history/generate`,
    reason: request.reason,
    hasTopic: Boolean(request.topic),
    hasDynasty: Boolean(request.dynasty)
  });

  const response = await fetch(`${API_BASE}/api/history/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  console.info("[history-generate] request:response", {
    status: response.status,
    ok: response.ok
  });

  if (response.status === 404) {
    console.warn("[history-generate] dedicated endpoint missing; falling back to chat route");
    const chatPrompt = request.topic
      ? `请围绕「${request.topic}」生成历史知识点小红书推文策划`
      : "请生成今天的历史知识点小红书推文策划";
    const chatResponse = await sendChat(chatPrompt);

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

export async function importHistoryXhsAnalytics(file: File): Promise<DashboardData> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/api/history/xhs/import`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to import history xiaohongshu analytics"));
  }

  const historyXhs = (await response.json()) as HistoryXhsState;
  const dashboard = await fetchDashboard();

  return {
    ...dashboard,
    historyXhs
  };
}

export type HistoryCommentReplyCreateRequest = {
  targetNotificationId: string;
  targetModuleType?: HistoryDynastyModuleType | null;
  commenterName?: string | null;
  commentText: string;
  inputMode: HistoryCommentReplyInputMode;
  detectedNoteTitle?: string | null;
};

export async function extractHistoryCommentScreenshot(file: File): Promise<HistoryCommentExtraction> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/api/history/comment-replies/extract`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "评论截图识别失败"));
  }

  return response.json();
}

export async function createHistoryCommentReply(
  input: HistoryCommentReplyCreateRequest
): Promise<HistoryCommentReplyRecord> {
  const response = await fetch(`${API_BASE}/api/history/comment-replies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "评论回复生成失败"));
  }

  return response.json();
}

export async function updateHistoryCommentReply(
  id: string,
  replyText: string
): Promise<HistoryCommentReplyRecord> {
  const response = await fetch(`${API_BASE}/api/history/comment-replies/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ replyText })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "评论回复重新校验失败"));
  }

  return response.json();
}

export async function deleteHistoryCommentReply(id: string): Promise<HistoryCommentReplyState> {
  const response = await fetch(`${API_BASE}/api/history/comment-replies/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "评论回复删除失败"));
  }

  return response.json();
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

export async function restartProject(): Promise<{ ok: true }> {
  const response = await fetch(`${API_BASE}/api/system/restart`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to restart project"));
  }

  return response.json();
}

export async function fetchSystemStatus(): Promise<{ ok: true; startedAt: string }> {
  const response = await fetch(`${API_BASE}/api/system/status`);

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to fetch system status"));
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

async function mhxyJsonRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        })
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "梦幻西游账本操作失败"));
  }
  return response.json();
}

export const fetchMhxyDashboard = () => mhxyJsonRequest<MhxyDashboard>("/api/mhxy", "GET");
export const createMhxyAssetFlip = (input: MhxyAssetFlipInput) =>
  mhxyJsonRequest<MhxyAssetFlipRecord>("/api/mhxy/asset-flips", "POST", input);
export const updateMhxyAssetFlip = (id: string, input: Partial<MhxyAssetFlipInput>) =>
  mhxyJsonRequest<MhxyAssetFlipRecord>(`/api/mhxy/asset-flips/${id}`, "PATCH", input);
export const deleteMhxyAssetFlip = (id: string) =>
  mhxyJsonRequest<{ id: string }>(`/api/mhxy/asset-flips/${id}`, "DELETE");
export const createMhxyGameCoinPurchase = (input: MhxyGameCoinPurchaseInput) =>
  mhxyJsonRequest<MhxyGameCoinPurchaseRecord>("/api/mhxy/game-coin-purchases", "POST", input);
export const updateMhxyGameCoinPurchase = (id: string, input: Partial<MhxyGameCoinPurchaseInput>) =>
  mhxyJsonRequest<MhxyGameCoinPurchaseRecord>(
    `/api/mhxy/game-coin-purchases/${id}`,
    "PATCH",
    input
  );
export const deleteMhxyGameCoinPurchase = (id: string) =>
  mhxyJsonRequest<{ id: string }>(`/api/mhxy/game-coin-purchases/${id}`, "DELETE");
export const createMhxyGameCoinCashout = (input: MhxyGameCoinCashoutInput) =>
  mhxyJsonRequest<MhxyGameCoinCashoutRecord>("/api/mhxy/game-coin-cashouts", "POST", input);
export const updateMhxyGameCoinCashout = (id: string, input: Partial<MhxyGameCoinCashoutInput>) =>
  mhxyJsonRequest<MhxyGameCoinCashoutRecord>(`/api/mhxy/game-coin-cashouts/${id}`, "PATCH", input);
export const deleteMhxyGameCoinCashout = (id: string) =>
  mhxyJsonRequest<{ id: string }>(`/api/mhxy/game-coin-cashouts/${id}`, "DELETE");
export const createMhxyTrade = (input: MhxyTradeInput) =>
  mhxyJsonRequest<MhxyTradeRecord>("/api/mhxy/trades", "POST", input);
export const updateMhxyTrade = (id: string, input: Partial<MhxyTradeInput>) =>
  mhxyJsonRequest<MhxyTradeRecord>(`/api/mhxy/trades/${id}`, "PATCH", input);
export const deleteMhxyTrade = (id: string) =>
  mhxyJsonRequest<{ id: string }>(`/api/mhxy/trades/${id}`, "DELETE");
export const createMhxyPriceSnapshot = (input: MhxyPriceSnapshotInput) =>
  mhxyJsonRequest<MhxyPriceSnapshot>("/api/mhxy/price-snapshots", "POST", input);
export const deleteMhxyPriceSnapshot = (id: string) =>
  mhxyJsonRequest<{ id: string }>(`/api/mhxy/price-snapshots/${id}`, "DELETE");
export const updateMhxyPriceSeries = (input: MhxyPriceSeriesUpdateInput) =>
  mhxyJsonRequest<MhxyPriceSeriesUpdateResult>("/api/mhxy/price-series", "PATCH", input);
export const createMhxyInventoryTransfer = (input: MhxyInventoryTransferInput) =>
  mhxyJsonRequest<MhxyInventoryTransferRecord>("/api/mhxy/inventory-transfers", "POST", input);
export const updateMhxyInventoryTransfer = (id: string, input: MhxyInventoryTransferPatch) =>
  mhxyJsonRequest<MhxyInventoryTransferRecord>(`/api/mhxy/inventory-transfers/${id}`, "PATCH", input);
export const deleteMhxyInventoryTransfer = (id: string) =>
  mhxyJsonRequest<{ id: string }>(`/api/mhxy/inventory-transfers/${id}`, "DELETE");
export const setMhxyInventoryTarget = (input: Omit<MhxyInventoryTarget, "updatedAt">) =>
  mhxyJsonRequest<MhxyInventoryTarget>("/api/mhxy/inventory-targets", "PUT", input);

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
