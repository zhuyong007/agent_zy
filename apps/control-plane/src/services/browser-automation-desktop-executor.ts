import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { nanoid } from "nanoid";
import { parseModelJson } from "@agent-zy/agent-sdk";
import type {
  BrowserAutomationObservation,
  BrowserAutomationRunLog,
  BrowserAutomationStep,
  BrowserAutomationWorkflow
} from "@agent-zy/shared-types";

import type { BrowserAutomationExecutor, BrowserAutomationExecutorResult } from "./browser-automation-service";
import type { ModelRuntime } from "./model-runtime";

type ScreenPoint = {
  x: number;
  y: number;
  confidence?: number;
};

export interface DesktopAutomationController {
  openUrlInNewTab(url: string): Promise<void>;
  screenshot(): Promise<string>;
  locateImageOnScreen(imageDataUrl: string, options?: { confidence?: number }): Promise<ScreenPoint | null>;
  click(x: number, y: number): Promise<void>;
  typeText(text: string): Promise<void>;
  press(key: string): Promise<void>;
  delay(ms: number): Promise<void>;
}

function createLog(input: Omit<BrowserAutomationRunLog, "id" | "createdAt">): BrowserAutomationRunLog {
  return {
    id: `browser-log-${nanoid()}`,
    createdAt: new Date().toISOString(),
    ...input
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

function parsePointDecision(text: string): ScreenPoint & { reason: string } {
  const parsed = parseModelJson(text);
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
  const x = typeof record.x === "number" && Number.isFinite(record.x) ? record.x : NaN;
  const y = typeof record.y === "number" && Number.isFinite(record.y) ? record.y : NaN;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("视觉模型没有返回可操作坐标");
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
    throw new Error("视觉模型运行时不可用，无法判断桌面页面条件");
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
              "判断当前屏幕截图是否满足用户条件，只返回 JSON：{\"matched\":boolean,\"reason\":\"简短原因\"}。",
              `条件：${input.conditionPrompt}`
            ].join("\n")
          },
          {
            type: "image_url",
            image_url: {
              url: input.observation.screenshotDataUrl ?? ""
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

  return parseModelDecision(result.text);
}

async function locateWithVision(input: {
  modelRuntime?: ModelRuntime;
  observation: BrowserAutomationObservation;
  prompt: string;
  imageDataUrl?: string;
}) {
  if (!input.modelRuntime) {
    throw new Error("本地图片匹配失败，且视觉模型运行时不可用，无法定位目标");
  }

  if (!input.observation.screenshotDataUrl) {
    throw new Error("当前屏幕截图不可用，无法定位目标");
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
              input.imageDataUrl
                ? "你会看到当前屏幕截图和用户上传的目标截图。请在当前屏幕截图中找到目标中心点。"
                : "你会看到当前屏幕截图。请根据用户描述找到需要操作的目标中心点。",
              "只返回 JSON：{\"x\":number,\"y\":number,\"confidence\":0到1,\"reason\":\"简短原因\"}。",
              "坐标必须基于当前屏幕截图左上角，单位是像素。",
              `用户描述：${input.prompt}`
            ].join("\n")
          },
          {
            type: "image_url",
            image_url: {
              url: input.observation.screenshotDataUrl
            }
          },
          ...(input.imageDataUrl
            ? [
                {
                  type: "image_url" as const,
                  image_url: {
                    url: input.imageDataUrl
                  }
                }
              ]
            : [])
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

async function observeScreen(controller: DesktopAutomationController): Promise<BrowserAutomationObservation> {
  const screenshotDataUrl = await controller.screenshot();

  return {
    url: "desktop://foreground",
    title: "当前桌面屏幕",
    text: "",
    screenshotDataUrl,
    capturedAt: new Date().toISOString()
  };
}

async function runPyAutoGuiCommand(command: Record<string, unknown>) {
  const workDir = await mkdtemp(join(tmpdir(), "agent-zy-pyautogui-"));
  const payloadPath = join(workDir, "payload.json");
  await writeFile(payloadPath, JSON.stringify(command), "utf-8");

  const script = String.raw`
import base64, io, json, platform, sys, time
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text())

try:
    import pyautogui
except Exception as error:
    print(json.dumps({
        "ok": False,
        "error": "pyautogui 不可用，请先安装 Python 依赖：python3 -m pip install pyautogui pillow opencv-python pyperclip。原因：" + str(error)
    }))
    sys.exit(0)

pyautogui.PAUSE = 0.08

def ok(value=None):
    print(json.dumps({"ok": True, "value": value}))

def data_url_to_file(data_url, filename):
    raw = data_url.split(",", 1)[1] if "," in data_url else data_url
    target = Path(sys.argv[1]).parent / filename
    target.write_bytes(base64.b64decode(raw))
    return str(target)

action = payload.get("action")

try:
    if action == "openUrlInNewTab":
        modifier = "command" if platform.system() == "Darwin" else "ctrl"
        pyautogui.hotkey(modifier, "t")
        pyautogui.write(str(payload.get("url", "")), interval=0.01)
        pyautogui.press("enter")
        ok()
    elif action == "screenshot":
        image = pyautogui.screenshot()
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        ok("data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"))
    elif action == "locateImageOnScreen":
        image_path = data_url_to_file(str(payload.get("imageDataUrl", "")), "target.png")
        confidence = float(payload.get("confidence", 0.86))
        try:
            point = pyautogui.locateCenterOnScreen(image_path, confidence=confidence)
        except TypeError:
            point = pyautogui.locateCenterOnScreen(image_path)
        if point is None:
            ok(None)
        else:
            ok({"x": point.x, "y": point.y, "confidence": confidence})
    elif action == "click":
        pyautogui.click(float(payload.get("x", 0)), float(payload.get("y", 0)))
        ok()
    elif action == "typeText":
        text = str(payload.get("text", ""))
        if all(ord(ch) < 128 for ch in text):
            pyautogui.write(text, interval=0.01)
        else:
            try:
                import pyperclip
            except Exception as error:
                raise RuntimeError("输入包含中文或特殊字符，请安装 pyperclip：python3 -m pip install pyperclip。原因：" + str(error))
            pyperclip.copy(text)
            modifier = "command" if platform.system() == "Darwin" else "ctrl"
            pyautogui.hotkey(modifier, "v")
        ok()
    elif action == "press":
        key = str(payload.get("key", ""))
        if "+" in key:
            pyautogui.hotkey(*[part.strip() for part in key.split("+") if part.strip()])
        else:
            pyautogui.press(key)
        ok()
    elif action == "delay":
        time.sleep(float(payload.get("ms", 0)) / 1000)
        ok()
    else:
        print(json.dumps({"ok": False, "error": "unknown pyautogui action: " + str(action)}))
except Exception as error:
    print(json.dumps({
        "ok": False,
        "error": "桌面自动化失败，请确认已授予辅助功能和屏幕录制权限。原因：" + str(error)
    }))
`;

  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn("python3", ["-c", script, payloadPath], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
          return;
        }

        reject(new Error(stderr.trim() || `pyautogui process exited with code ${code}`));
      });
    });
    const parsed = JSON.parse(output || "{}") as { ok?: boolean; value?: unknown; error?: string };

    if (!parsed.ok) {
      throw new Error(parsed.error || "pyautogui command failed");
    }

    return parsed.value;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("pyautogui 返回了无法解析的结果");
    }

    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function createPyAutoGuiDesktopController(): DesktopAutomationController {
  return {
    async openUrlInNewTab(url) {
      await runPyAutoGuiCommand({ action: "openUrlInNewTab", url });
    },
    async screenshot() {
      return String(await runPyAutoGuiCommand({ action: "screenshot" }));
    },
    async locateImageOnScreen(imageDataUrl, options = {}) {
      const value = await runPyAutoGuiCommand({
        action: "locateImageOnScreen",
        imageDataUrl,
        confidence: options.confidence ?? 0.86
      });

      return value && typeof value === "object" ? value as ScreenPoint : null;
    },
    async click(x, y) {
      await runPyAutoGuiCommand({ action: "click", x, y });
    },
    async typeText(text) {
      await runPyAutoGuiCommand({ action: "typeText", text });
    },
    async press(key) {
      await runPyAutoGuiCommand({ action: "press", key });
    },
    async delay(ms) {
      await runPyAutoGuiCommand({ action: "delay", ms });
    }
  };
}

export function createDesktopBrowserAutomationExecutor(options: {
  controller?: DesktopAutomationController;
  modelRuntime?: ModelRuntime;
} = {}): BrowserAutomationExecutor {
  const controller = options.controller ?? createPyAutoGuiDesktopController();

  return {
    async runWorkflow(input): Promise<BrowserAutomationExecutorResult> {
      const logs: BrowserAutomationRunLog[] = [];
      const extracted: Record<string, string> = {};
      let lastObservation: BrowserAutomationObservation | null = null;
      const stepById = new Map(input.workflow.steps.map((step) => [step.id, step]));
      const executedStepIds = new Set<string>();

      async function locateStepTarget(step: BrowserAutomationStep) {
        if (step.type !== "click" && step.type !== "type") {
          throw new Error(`step ${step.id} does not support target location`);
        }

        if (step.type === "click" && step.x !== undefined && step.y !== undefined) {
          return { point: { x: step.x, y: step.y }, source: "坐标" };
        }

        if (step.imageTarget?.imageDataUrl) {
          const localPoint = await controller.locateImageOnScreen(step.imageTarget.imageDataUrl, {
            confidence: 0.86
          });

          if (localPoint) {
            return { point: localPoint, source: "本地图片匹配" };
          }
        }

        lastObservation = await observeScreen(controller);
        const prompt = step.imageTarget?.prompt ?? step.targetPrompt ?? step.label ?? step.id;
        const point = await locateWithVision({
          modelRuntime: options.modelRuntime,
          observation: lastObservation,
          prompt,
          imageDataUrl: step.imageTarget?.imageDataUrl
        });

        return { point, source: "视觉模型定位" };
      }

      async function runStep(step: BrowserAutomationStep): Promise<void> {
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
          await controller.openUrlInNewTab(step.url);
          lastObservation = await observeScreen(controller);
          return;
        }

        if (step.type === "click") {
          const { point, source } = await locateStepTarget(step);
          const confidence = point.confidence === undefined ? "" : ` confidence=${point.confidence}`;
          logs.push(createLog({
            stepId: step.id,
            level: "info",
            message: `${source}点击：(${Math.round(point.x)}, ${Math.round(point.y)})${confidence}`
          }));
          await controller.click(point.x, point.y);
          lastObservation = await observeScreen(controller);
          return;
        }

        if (step.type === "type") {
          const { point, source } = await locateStepTarget(step);
          const confidence = point.confidence === undefined ? "" : ` confidence=${point.confidence}`;
          logs.push(createLog({
            stepId: step.id,
            level: "info",
            message: `${source}输入：(${Math.round(point.x)}, ${Math.round(point.y)})${confidence}`
          }));
          await controller.click(point.x, point.y);
          if (step.clearBeforeType) {
            await controller.press(process.platform === "darwin" ? "command+a" : "ctrl+a");
          }
          await controller.typeText(step.text);
          lastObservation = await observeScreen(controller);
          return;
        }

        if (step.type === "press") {
          await controller.press(step.key);
          lastObservation = await observeScreen(controller);
          return;
        }

        if (step.type === "delay") {
          await delay(step.durationMs, input.signal);
          await controller.delay(0);
          return;
        }

        if (step.type === "extract") {
          lastObservation = await observeScreen(controller);
          extracted[step.name] = lastObservation.screenshotDataUrl ?? "";
          return;
        }

        if (step.type === "waitForCondition") {
          const startedAt = Date.now();

          while (Date.now() - startedAt <= step.timeoutMs) {
            lastObservation = await observeScreen(controller);
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
          lastObservation = await observeScreen(controller);
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
        for (const step of input.workflow.steps) {
          await runStep(step);
        }

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
              message: error instanceof Error ? error.message : "桌面浏览器流程执行失败"
            })
          ],
          lastObservation,
          extracted,
          error: error instanceof Error ? error.message : "桌面浏览器流程执行失败"
        };
      }
    }
  };
}
