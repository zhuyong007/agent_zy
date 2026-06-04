import type {
  BrowserAutomationStep,
  BrowserAutomationWorkflow
} from "@agent-zy/shared-types";

const MIN_WAIT_INTERVAL_MS = 1000;
const MAX_WAIT_TIMEOUT_MS = 300000;
const DEFAULT_WAIT_INTERVAL_MS = 5000;
const DEFAULT_WAIT_TIMEOUT_MS = 60000;
const DEFAULT_STEP_TIMEOUT_MS = 30000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalString(value: unknown): string | undefined {
  const text = asString(value);
  return text || undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(asNumber(value, fallback)), min), max);
}

function asStepIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter(Boolean)
    : [];
}

function normalizeImageTarget(value: unknown) {
  const record = asRecord(value);
  const imageDataUrl = asString(record.imageDataUrl);

  if (!imageDataUrl) {
    return undefined;
  }

  if (!/^data:image\//i.test(imageDataUrl)) {
    throw new Error("image target must be a data:image URL");
  }

  return {
    imageDataUrl,
    ...(asOptionalString(record.prompt) ? { prompt: asOptionalString(record.prompt) } : {})
  };
}

function normalizeBase(record: Record<string, unknown>, index: number) {
  return {
    id: asString(record.id) || `step-${index + 1}`,
    ...(asOptionalString(record.label) ? { label: asOptionalString(record.label) } : {}),
    timeoutMs: clampInteger(record.timeoutMs, DEFAULT_STEP_TIMEOUT_MS, 1000, MAX_WAIT_TIMEOUT_MS)
  };
}

function normalizeStep(value: unknown, index: number): BrowserAutomationStep {
  const record = asRecord(value);
  const type = asString(record.type);
  const base = normalizeBase(record, index);

  if (type === "openUrl") {
    const url = asString(record.url);

    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`step ${base.id} url must be an http or https URL`);
    }

    return {
      ...base,
      type,
      url
    };
  }

  if (type === "click") {
    const selector = asOptionalString(record.selector);
    const imageTarget = normalizeImageTarget(record.imageTarget);
    const targetPrompt = asOptionalString(record.targetPrompt);
    const x = typeof record.x === "number" ? record.x : undefined;
    const y = typeof record.y === "number" ? record.y : undefined;

    if (!selector && !imageTarget && !targetPrompt && (x === undefined || y === undefined)) {
      throw new Error(`step ${base.id} requires target prompt, image target, selector, or x/y`);
    }

    return {
      ...base,
      type,
      ...(selector ? { selector } : {}),
      ...(imageTarget ? { imageTarget } : {}),
      ...(targetPrompt ? { targetPrompt } : {}),
      ...(x !== undefined ? { x } : {}),
      ...(y !== undefined ? { y } : {})
    };
  }

  if (type === "type") {
    const selector = asOptionalString(record.selector);
    const imageTarget = normalizeImageTarget(record.imageTarget);
    const targetPrompt = asOptionalString(record.targetPrompt);

    if (!selector && !imageTarget && !targetPrompt) {
      throw new Error(`step ${base.id} selector, image target, or target prompt is required`);
    }

    return {
      ...base,
      type,
      ...(selector ? { selector } : {}),
      ...(imageTarget ? { imageTarget } : {}),
      ...(targetPrompt ? { targetPrompt } : {}),
      text: asString(record.text),
      clearBeforeType: asBoolean(record.clearBeforeType, true)
    };
  }

  if (type === "press") {
    const key = asString(record.key);

    if (!key) {
      throw new Error(`step ${base.id} key is required`);
    }

    return {
      ...base,
      type,
      key
    };
  }

  if (type === "delay") {
    return {
      ...base,
      type,
      durationMs: clampInteger(record.durationMs, 1000, 0, MAX_WAIT_TIMEOUT_MS)
    };
  }

  if (type === "extract") {
    const name = asString(record.name);

    if (!name) {
      throw new Error(`step ${base.id} extract name is required`);
    }

    return {
      ...base,
      type,
      name,
      ...(asOptionalString(record.selector) ? { selector: asOptionalString(record.selector) } : {})
    };
  }

  if (type === "waitForCondition") {
    const conditionPrompt = asString(record.conditionPrompt);

    if (!conditionPrompt) {
      throw new Error(`step ${base.id} conditionPrompt is required`);
    }

    const onTimeoutIds = asStepIds(record.onTimeout);

    return {
      ...base,
      type,
      conditionPrompt,
      intervalMs: clampInteger(record.intervalMs, DEFAULT_WAIT_INTERVAL_MS, MIN_WAIT_INTERVAL_MS, MAX_WAIT_TIMEOUT_MS),
      timeoutMs: clampInteger(record.timeoutMs, DEFAULT_WAIT_TIMEOUT_MS, MIN_WAIT_INTERVAL_MS, MAX_WAIT_TIMEOUT_MS),
      ...(asStepIds(record.onMatched).length ? { onMatched: asStepIds(record.onMatched) } : {}),
      onTimeout: onTimeoutIds.length ? onTimeoutIds : "fail"
    };
  }

  if (type === "ifElse") {
    const conditionPrompt = asString(record.conditionPrompt);

    if (!conditionPrompt) {
      throw new Error(`step ${base.id} conditionPrompt is required`);
    }

    return {
      ...base,
      type,
      conditionPrompt,
      thenStepIds: asStepIds(record.thenStepIds),
      elseStepIds: asStepIds(record.elseStepIds)
    };
  }

  throw new Error(`unsupported browser automation step type: ${type || "(empty)"}`);
}

function validateStepIds(steps: BrowserAutomationStep[]) {
  const ids = new Set<string>();

  for (const step of steps) {
    if (ids.has(step.id)) {
      throw new Error(`duplicate step id: ${step.id}`);
    }

    ids.add(step.id);
  }

  const references = steps.flatMap((step) => {
    if (step.type === "ifElse") {
      return [...step.thenStepIds, ...step.elseStepIds];
    }

    if (step.type === "waitForCondition") {
      return [
        ...(step.onMatched ?? []),
        ...(Array.isArray(step.onTimeout) ? step.onTimeout : [])
      ];
    }

    return [];
  });

  for (const reference of references) {
    if (!ids.has(reference)) {
      throw new Error(`unknown step id: ${reference}`);
    }
  }
}

export function normalizeBrowserAutomationWorkflow(
  input: unknown,
  now: string,
  existing?: Pick<BrowserAutomationWorkflow, "id" | "createdAt">
): BrowserAutomationWorkflow {
  const record = asRecord(input);
  const steps = (Array.isArray(record.steps) ? record.steps : []).map(normalizeStep);

  if (!steps.length) {
    throw new Error("workflow requires at least one step");
  }

  validateStepIds(steps);

  return {
    id: existing?.id ?? (asString(record.id) || `browser-workflow-${crypto.randomUUID()}`),
    name: asString(record.name) || "未命名浏览器流程",
    description: asString(record.description),
    enabled: asBoolean(record.enabled, true),
    steps,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

export function createBrowserAutomationExampleWorkflow(now: string): BrowserAutomationWorkflow {
  return normalizeBrowserAutomationWorkflow(
    {
      id: "browser-workflow-wait-example",
      name: "等待网页状态示例",
      description: "打开示例页面，每隔 5 秒判断页面是否满足条件。",
      steps: [
        {
          id: "open",
          type: "openUrl",
          url: "https://example.com"
        },
        {
          id: "wait-ready",
          type: "waitForCondition",
          conditionPrompt: "页面已经加载完成，并显示可继续操作的内容。",
          intervalMs: DEFAULT_WAIT_INTERVAL_MS,
          timeoutMs: DEFAULT_WAIT_TIMEOUT_MS
        }
      ]
    },
    now
  );
}
