import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { nanoid } from "nanoid";
import { parseModelJson } from "@agent-zy/agent-sdk";
import type {
  BrowserAutomationObservation,
  BrowserAutomationImageTarget,
  BrowserAutomationRunLog,
  BrowserAutomationStep,
  BrowserAutomationWorkflow
} from "@agent-zy/shared-types";

import type { BrowserAutomationExecutor, BrowserAutomationExecutorResult } from "./browser-automation-service";
import type { ModelRuntime } from "./model-runtime";

type PlaywrightPage = any;

function createLog(input: Omit<BrowserAutomationRunLog, "id" | "createdAt">): BrowserAutomationRunLog {
  return {
    id: `browser-log-${nanoid()}`,
    createdAt: new Date().toISOString(),
    ...input
  };
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("browser automation run stopped"));
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("browser automation run stopped"));
      },
      { once: true }
    );
  });
}

async function importPlaywright(): Promise<any> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;
    return await dynamicImport("playwright");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Playwright 未安装或不可用，请先运行 npm install。原因：${reason}`);
  }
}

async function observePage(page: PlaywrightPage): Promise<BrowserAutomationObservation> {
  const [title, text, screenshot] = await Promise.all([
    page.title().catch(() => ""),
    page.locator("body").innerText({ timeout: 3000 }).catch(() => ""),
    page.screenshot({ type: "jpeg", quality: 70, fullPage: false }).catch(() => null)
  ]);

  return {
    url: page.url(),
    title,
    text: String(text).slice(0, 12000),
    ...(screenshot ? { screenshotDataUrl: `data:image/jpeg;base64,${Buffer.from(screenshot).toString("base64")}` } : {}),
    capturedAt: new Date().toISOString()
  };
}

function parseModelDecision(text: string): { matched: boolean; reason: string } {
  const parsed = parseModelJson(text);
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};

  return {
    matched: record.matched === true,
    reason: typeof record.reason === "string" ? record.reason : text.slice(0, 200)
  };
}

function parsePointDecision(text: string): { x: number; y: number; confidence: number; reason: string } {
  const parsed = parseModelJson(text);
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
  const x = typeof record.x === "number" && Number.isFinite(record.x) ? record.x : NaN;
  const y = typeof record.y === "number" && Number.isFinite(record.y) ? record.y : NaN;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("视觉模型没有返回可点击坐标");
  }

  return {
    x,
    y,
    confidence: typeof record.confidence === "number" && Number.isFinite(record.confidence) ? record.confidence : 0,
    reason: typeof record.reason === "string" ? record.reason : text.slice(0, 200)
  };
}

async function evaluateCondition(input: {
  modelRuntime?: ModelRuntime;
  observation: BrowserAutomationObservation;
  conditionPrompt: string;
}) {
  if (!input.modelRuntime) {
    throw new Error("视觉模型运行时不可用，无法判断自然语言网页条件");
  }

  const content = [
    {
      type: "text" as const,
      text: [
        "判断网页当前状态是否满足用户条件，只返回 JSON：{\"matched\":boolean,\"reason\":\"简短原因\"}。",
        `条件：${input.conditionPrompt}`,
        `URL：${input.observation.url}`,
        `标题：${input.observation.title}`,
        `页面文本：${input.observation.text.slice(0, 6000)}`
      ].join("\n")
    },
    ...(input.observation.screenshotDataUrl
      ? [
          {
            type: "image_url" as const,
            image_url: {
              url: input.observation.screenshotDataUrl
            }
          }
        ]
      : [])
  ];
  const result = await input.modelRuntime.chat({
    kind: "chat",
    purpose: "vision",
    messages: [
      {
        role: "user",
        content
      }
    ],
    responseFormat: "json",
    temperature: 0,
    maxTokens: 300,
    timeoutMs: 60000
  });

  return parseModelDecision(result.text);
}

async function locateImageTarget(input: {
  modelRuntime?: ModelRuntime;
  observation: BrowserAutomationObservation;
  target: BrowserAutomationImageTarget;
}) {
  if (!input.modelRuntime) {
    throw new Error("视觉模型运行时不可用，无法按图片定位网页元素");
  }

  if (!input.observation.screenshotDataUrl) {
    throw new Error("当前页面截图不可用，无法按图片定位网页元素");
  }

  const result = await input.modelRuntime.chat({
    kind: "chat",
    purpose: "vision",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "你会看到两张图：第一张是当前浏览器页面截图，第二张是用户上传的目标元素截图。",
              "请在第一张页面截图中找到第二张目标图最匹配的位置，返回目标中心点坐标。",
              "只返回 JSON：{\"x\":number,\"y\":number,\"confidence\":0到1,\"reason\":\"简短原因\"}。",
              "坐标必须基于第一张页面截图左上角，单位是像素。",
              input.target.prompt ? `用户补充说明：${input.target.prompt}` : ""
            ].filter(Boolean).join("\n")
          },
          {
            type: "image_url",
            image_url: {
              url: input.observation.screenshotDataUrl
            }
          },
          {
            type: "image_url",
            image_url: {
              url: input.target.imageDataUrl
            }
          }
        ]
      }
    ],
    responseFormat: "json",
    temperature: 0,
    maxTokens: 300,
    timeoutMs: 60000
  });

  return parsePointDecision(result.text);
}

export function createPlaywrightBrowserAutomationExecutor(options: {
  dataDir: string;
  modelRuntime?: ModelRuntime;
  playwright?: any;
}): BrowserAutomationExecutor {
  const profileDir = join(options.dataDir, "browser-automation", "chrome-profile");
  let contextPromise: Promise<any> | null = null;

  async function getContext() {
    if (contextPromise) {
      return contextPromise;
    }

    contextPromise = (async () => {
      const { chromium } = options.playwright ?? await importPlaywright();
      mkdirSync(profileDir, { recursive: true });

      return chromium.launchPersistentContext(profileDir, {
        channel: "chrome",
        headless: false,
        viewport: {
          width: 1365,
          height: 900
        }
      });
    })();

    try {
      return await contextPromise;
    } catch (error) {
      contextPromise = null;
      throw error;
    }
  }

  return {
    async runWorkflow(input): Promise<BrowserAutomationExecutorResult> {
      const logs: BrowserAutomationRunLog[] = [];
      const extracted: Record<string, string> = {};
      let lastObservation: BrowserAutomationObservation | null = null;
      const context = await getContext();
      let page = context.pages()[0] ?? await context.newPage();
      const stepById = new Map(input.workflow.steps.map((step) => [step.id, step]));
      const executedStepIds = new Set<string>();

      async function runStep(step: BrowserAutomationStep) {
        if (input.signal.aborted) {
          throw new Error("browser automation run stopped");
        }

        if (executedStepIds.has(step.id)) {
          return;
        }

        executedStepIds.add(step.id);

        logs.push(createLog({
          stepId: step.id,
          level: "info",
          message: `执行步骤：${step.label || step.id} (${step.type})`
        }));

        if (step.type === "openUrl") {
          page = await context.newPage();
          await page.goto(step.url, {
            waitUntil: "domcontentloaded",
            timeout: step.timeoutMs
          });
          lastObservation = await observePage(page);
          return;
        }

        if (step.type === "click") {
          if (step.selector) {
            await page.locator(step.selector).click({ timeout: step.timeoutMs });
          } else if (step.imageTarget) {
            lastObservation = await observePage(page);
            const point = await locateImageTarget({
              modelRuntime: options.modelRuntime,
              observation: lastObservation,
              target: step.imageTarget
            });
            logs.push(createLog({
              stepId: step.id,
              level: "info",
              message: `图片定位点击：(${Math.round(point.x)}, ${Math.round(point.y)}) ${point.reason}`
            }));
            await page.mouse.click(point.x, point.y);
          } else {
            await page.mouse.click(step.x ?? 0, step.y ?? 0);
          }
          lastObservation = await observePage(page);
          return;
        }

        if (step.type === "type") {
          if (step.selector) {
            const locator = page.locator(step.selector);
            if (step.clearBeforeType) {
              await locator.fill("", { timeout: step.timeoutMs });
              await locator.fill(step.text, { timeout: step.timeoutMs });
            } else {
              await locator.type(step.text, { timeout: step.timeoutMs });
            }
          } else {
            if (!step.imageTarget) {
              throw new Error("输入步骤缺少元素选择器或目标图片");
            }
            lastObservation = await observePage(page);
            const point = await locateImageTarget({
              modelRuntime: options.modelRuntime,
              observation: lastObservation,
              target: step.imageTarget
            });
            logs.push(createLog({
              stepId: step.id,
              level: "info",
              message: `图片定位输入：(${Math.round(point.x)}, ${Math.round(point.y)}) ${point.reason}`
            }));
            await page.mouse.click(point.x, point.y);
            if (step.clearBeforeType) {
              const modifier = process.platform === "darwin" ? "Meta" : "Control";
              await page.keyboard.press(`${modifier}+A`);
            }
            await page.keyboard.type(step.text);
          }
          lastObservation = await observePage(page);
          return;
        }

        if (step.type === "press") {
          await page.keyboard.press(step.key);
          lastObservation = await observePage(page);
          return;
        }

        if (step.type === "delay") {
          await delay(step.durationMs, input.signal);
          return;
        }

        if (step.type === "extract") {
          const value = step.selector
            ? await page.locator(step.selector).innerText({ timeout: step.timeoutMs })
            : (await observePage(page)).text;
          extracted[step.name] = String(value).slice(0, 12000);
          lastObservation = await observePage(page);
          return;
        }

        if (step.type === "waitForCondition") {
          const startedAt = Date.now();

          while (Date.now() - startedAt <= step.timeoutMs) {
            lastObservation = await observePage(page);
            const decision = await evaluateCondition({
              modelRuntime: options.modelRuntime,
              observation: lastObservation,
              conditionPrompt: step.conditionPrompt
            });
            logs.push(createLog({
              stepId: step.id,
              level: "info",
              message: decision.matched ? `等待条件已满足：${decision.reason}` : `等待条件未满足：${decision.reason}`
            }));

            if (decision.matched) {
              await runStepIds(step.onMatched ?? []);
              return;
            }

            await delay(step.intervalMs, input.signal);
          }

          if (Array.isArray(step.onTimeout)) {
            await runStepIds(step.onTimeout);
            return;
          }

          throw new Error(`等待条件超时：${step.conditionPrompt}`);
        }

        if (step.type === "ifElse") {
          lastObservation = await observePage(page);
          const decision = await evaluateCondition({
            modelRuntime: options.modelRuntime,
            observation: lastObservation,
            conditionPrompt: step.conditionPrompt
          });
          logs.push(createLog({
            stepId: step.id,
            level: "info",
            message: decision.matched ? `条件命中：${decision.reason}` : `条件未命中：${decision.reason}`
          }));
          await runStepIds(decision.matched ? step.thenStepIds : step.elseStepIds);
        }
      }

      async function runStepIds(ids: string[]) {
        for (const id of ids) {
          const step = stepById.get(id);

          if (!step) {
            throw new Error(`unknown browser automation step: ${id}`);
          }

          await runStep(step);
        }
      }

      try {
        await runWorkflowSteps(input.workflow, runStep);
        return {
          status: "completed",
          logs,
          lastObservation,
          extracted
        };
      } catch (error) {
        return {
          status: input.signal.aborted ? "stopped" : "failed",
          logs: [
            ...logs,
            createLog({
              level: "error",
              message: error instanceof Error ? error.message : "浏览器流程执行失败"
            })
          ],
          lastObservation,
          extracted,
          error: error instanceof Error ? error.message : "浏览器流程执行失败"
        };
      }
    }
  };
}

async function runWorkflowSteps(
  workflow: BrowserAutomationWorkflow,
  runStep: (step: BrowserAutomationStep) => Promise<void>
) {
  for (const step of workflow.steps) {
    await runStep(step);
  }
}
