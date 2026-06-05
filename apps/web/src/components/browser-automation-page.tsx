import { useEffect, useMemo, useState } from "react";

import type {
  BrowserAutomationImageTarget,
  BrowserAutomationRun,
  BrowserAutomationState,
  BrowserAutomationStep,
  BrowserAutomationTriggerRule,
  BrowserAutomationWorkflow
} from "@agent-zy/shared-types";

import {
  createBrowserAutomationTriggerRule,
  createBrowserAutomationWorkflow,
  fetchBrowserAutomation,
  runBrowserAutomationWorkflow,
  stopBrowserAutomationRun,
  updateBrowserAutomationWorkflow
} from "../api";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";
import { ToolsBackLink } from "./tools-page";

type BrowserAutomationWorkspaceProps = {
  fetchAction?: () => Promise<BrowserAutomationState>;
  createAction?: (input: unknown) => Promise<BrowserAutomationWorkflow>;
  updateAction?: (id: string, input: unknown) => Promise<BrowserAutomationWorkflow>;
  runAction?: (id: string) => Promise<BrowserAutomationRun>;
  stopAction?: (id: string) => Promise<{ ok: true }>;
  createRuleAction?: (input: unknown) => Promise<BrowserAutomationTriggerRule>;
};

type WorkflowDraft = {
  id?: string;
  name: string;
  description: string;
  enabled: boolean;
  steps: BrowserAutomationStep[];
};

const STEP_TYPE_OPTIONS: Array<{ value: BrowserAutomationStep["type"]; label: string }> = [
  { value: "openUrl", label: "打开网页" },
  { value: "click", label: "点击" },
  { value: "type", label: "输入文字" },
  { value: "press", label: "按键" },
  { value: "waitForCondition", label: "等待条件" },
  { value: "ifElse", label: "条件分支" },
  { value: "delay", label: "延迟" },
  { value: "extract", label: "提取内容" }
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function workflowToDraft(workflow: BrowserAutomationWorkflow | null): WorkflowDraft {
  if (!workflow) {
    return {
      name: "新浏览器流程",
      description: "",
      enabled: true,
      steps: [
        {
          id: "open",
          type: "openUrl",
          url: "https://example.com",
          timeoutMs: 30000
        }
      ]
    };
  }

  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    enabled: workflow.enabled,
    steps: workflow.steps.map((step) => {
      if (step.type === "click" || step.type === "type") {
        const { selector: _selector, ...nextStep } = step;
        return nextStep as BrowserAutomationStep;
      }

      return step;
    })
  };
}

function createStep(type: BrowserAutomationStep["type"], index: number): BrowserAutomationStep {
  const base = {
    id: `step-${index + 1}`,
    timeoutMs: 30000
  };

  if (type === "click") {
    return { ...base, type, targetPrompt: "要点击的按钮" };
  }

  if (type === "type") {
    return { ...base, type, targetPrompt: "要输入的输入框", text: "", clearBeforeType: true };
  }

  if (type === "press") {
    return { ...base, type, key: "Enter" };
  }

  if (type === "waitForCondition") {
    return {
      ...base,
      type,
      conditionPrompt: "页面显示任务完成",
      intervalMs: 5000,
      timeoutMs: 60000,
      onTimeout: "fail"
    };
  }

  if (type === "ifElse") {
    return { ...base, type, conditionPrompt: "页面是否满足条件", thenStepIds: [], elseStepIds: [] };
  }

  if (type === "delay") {
    return { ...base, type, durationMs: 1000 };
  }

  if (type === "extract") {
    return { ...base, type, name: "result", selector: "body" };
  }

  return { ...base, type: "openUrl", url: "https://example.com" };
}

function stepIdsToText(ids: string[] | undefined) {
  return (ids ?? []).join(", ");
}

function textToStepIds(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function workflowToJsonPreview(draft: WorkflowDraft) {
  return JSON.stringify({
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name,
    description: draft.description,
    enabled: draft.enabled,
    steps: draft.steps
  }, null, 2);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("图片读取失败")));
    reader.readAsDataURL(file);
  });
}

export function BrowserAutomationWorkspace({
  fetchAction = fetchBrowserAutomation,
  createAction = createBrowserAutomationWorkflow,
  updateAction = updateBrowserAutomationWorkflow,
  runAction = runBrowserAutomationWorkflow,
  stopAction = stopBrowserAutomationRun,
  createRuleAction = createBrowserAutomationTriggerRule
}: BrowserAutomationWorkspaceProps) {
  const [state, setState] = useState<BrowserAutomationState>({
    workflows: [],
    runs: [],
    triggerRules: [],
    lastUpdatedAt: null
  });
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const selectedWorkflow = useMemo(
    () => selectedWorkflowId ? state.workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null : null,
    [selectedWorkflowId, state.workflows]
  );
  const [draft, setDraft] = useState<WorkflowDraft>(() => workflowToDraft(null));
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "running" | "stopping" | "rule">("loading");
  const [error, setError] = useState<string | null>(null);
  const [ruleAgentId, setRuleAgentId] = useState("ledger-agent");

  async function refresh() {
    setStatus("loading");
    setError(null);

    try {
      const nextState = await fetchAction();
      setState(nextState);
      setSelectedWorkflowId((current) => current ?? nextState.workflows[0]?.id ?? null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setDraft(workflowToDraft(selectedWorkflow));
  }, [selectedWorkflow?.id]);

  function handleNewWorkflow() {
    setSelectedWorkflowId(null);
    setDraft(workflowToDraft(null));
    setError(null);
  }

  function updateDraft(patch: Partial<WorkflowDraft>) {
    setDraft((current) => ({
      ...current,
      ...patch
    }));
  }

  function updateStep(index: number, patch: Partial<BrowserAutomationStep>) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } as BrowserAutomationStep : step)
    }));
  }

  function updateStepImageTarget(index: number, patch: Partial<BrowserAutomationImageTarget> | null) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => {
        if (stepIndex !== index || (step.type !== "click" && step.type !== "type")) {
          return step;
        }

        if (!patch) {
          const { imageTarget: _imageTarget, ...nextStep } = step;
          return nextStep as BrowserAutomationStep;
        }

        const imageTarget = {
          ...(step.imageTarget ?? { imageDataUrl: "" }),
          ...patch
        };

        if (!imageTarget.imageDataUrl) {
          const { imageTarget: _imageTarget, ...nextStep } = step;
          return nextStep as BrowserAutomationStep;
        }

        return {
          ...step,
          imageTarget
        } as BrowserAutomationStep;
      })
    }));
  }

  async function handleImageTargetUpload(index: number, file: File | undefined) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件作为目标截图");
      return;
    }

    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      updateStepImageTarget(index, { imageDataUrl });
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  }

  function changeStepType(index: number, type: BrowserAutomationStep["type"]) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => {
        if (stepIndex !== index) {
          return step;
        }

        return {
          ...createStep(type, index),
          id: step.id,
          label: step.label,
          timeoutMs: step.timeoutMs
        } as BrowserAutomationStep;
      })
    }));
  }

  function addStep() {
    setDraft((current) => ({
      ...current,
      steps: [...current.steps, createStep("openUrl", current.steps.length)]
    }));
  }

  function removeStep(index: number) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.filter((_step, stepIndex) => stepIndex !== index)
    }));
  }

  async function handleSaveWorkflow() {
    setStatus("saving");
    setError(null);

    try {
      const payload = {
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name,
        description: draft.description,
        enabled: draft.enabled,
        steps: draft.steps
      };
      const saved = draft.id && state.workflows.some((workflow) => workflow.id === draft.id)
        ? await updateAction(draft.id, payload)
        : await createAction(payload);
      setState((current) => ({
        ...current,
        workflows: [saved, ...current.workflows.filter((workflow) => workflow.id !== saved.id)]
      }));
      setSelectedWorkflowId(saved.id);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  async function handleRunWorkflow() {
    if (!selectedWorkflow) {
      return;
    }

    setStatus("running");
    setError(null);

    try {
      const run = await runAction(selectedWorkflow.id);
      setState((current) => ({
        ...current,
        runs: [run, ...current.runs.filter((item) => item.id !== run.id)]
      }));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  async function handleStopLatestRun() {
    const latestRunning = state.runs.find((run) => run.status === "running");

    if (!latestRunning) {
      return;
    }

    setStatus("stopping");
    setError(null);

    try {
      await stopAction(latestRunning.id);
      await refresh();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  async function handleCreateRule() {
    if (!selectedWorkflow) {
      return;
    }

    setStatus("rule");
    setError(null);

    try {
      const rule = await createRuleAction({
        name: `${ruleAgentId} 完成后运行`,
        workflowId: selectedWorkflow.id,
        enabled: true,
        match: {
          agentId: ruleAgentId,
          status: "completed"
        }
      });
      setState((current) => ({
        ...current,
        triggerRules: [rule, ...current.triggerRules.filter((item) => item.id !== rule.id)]
      }));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  function renderImageTargetControls(step: BrowserAutomationStep, index: number) {
    if (step.type !== "click" && step.type !== "type") {
      return null;
    }

    const target = step.imageTarget;

    return (
      <div className="browser-automation-image-target browser-automation-field-wide">
        <div className="browser-automation-image-target__header">
          <strong>目标定位</strong>
          <button type="button" onClick={() => updateStepImageTarget(index, null)} disabled={!target}>
            移除图片
          </button>
        </div>
        <div className="browser-automation-fields">
          <label>
            <span>目标截图（可选）</span>
            <input
              name={`step-${step.type}-image`}
              type="file"
              accept="image/*"
              onChange={(event) => void handleImageTargetUpload(index, event.currentTarget.files?.[0])}
            />
          </label>
          <label>
            <span>目标说明</span>
            <input
              value={step.targetPrompt ?? target?.prompt ?? ""}
              placeholder="例如：蓝色提交按钮、搜索框"
              onChange={(event) => updateStep(index, { targetPrompt: event.currentTarget.value })}
            />
          </label>
        </div>
        {target?.imageDataUrl ? (
          <div className="browser-automation-image-preview">
            <img src={target.imageDataUrl} alt="目标截图预览" />
            <span>运行时先用本地图片匹配；找不到时再用视觉模型定位。</span>
          </div>
        ) : (
          <p>上传按钮、输入框或局部截图可减少模型调用；未上传时使用目标说明让视觉模型定位。</p>
        )}
      </div>
    );
  }

  const latestRun = state.runs[0] ?? null;
  const latestRunning = state.runs.find((run) => run.status === "running");

  return (
    <section className="browser-automation-shell">
      <header className="tools-page-header">
        <div>
          <p className="eyebrow">Local Automation</p>
          <h1>浏览器自动化</h1>
          <p>使用当前桌面浏览器执行流程；本地图片匹配优先，找不到时再调用视觉模型。</p>
        </div>
        <div className="tools-page-header__actions">
          <ToolsBackLink />
          <button type="button" onClick={refresh} disabled={status === "loading"}>
            刷新
          </button>
        </div>
      </header>

      {error ? <div className="tools-notice tools-notice--error">{error}</div> : null}

      <div className="browser-automation-layout">
        <aside className="browser-automation-list" aria-label="浏览器流程">
          <div className="browser-automation-list__header">
            <strong>流程</strong>
            <span>{state.workflows.length}</span>
          </div>
          <button type="button" data-action="new-workflow" onClick={handleNewWorkflow}>
            <strong>新建流程</strong>
            <span>从表单开始</span>
          </button>
          {state.workflows.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              className={workflow.id === selectedWorkflow?.id ? "is-active" : ""}
              onClick={() => setSelectedWorkflowId(workflow.id)}
            >
              <strong>{workflow.name}</strong>
              <span>{workflow.steps.length} steps</span>
            </button>
          ))}
        </aside>

        <div className="browser-automation-editor">
          <div className="browser-automation-toolbar">
            <button
              type="button"
              data-action="save-workflow"
              onClick={handleSaveWorkflow}
              disabled={status === "saving"}
            >
              保存流程
            </button>
            <button
              type="button"
              data-action="run-workflow"
              onClick={handleRunWorkflow}
              disabled={!selectedWorkflow || status === "running"}
            >
              运行
            </button>
            <button
              type="button"
              data-action="stop-run"
              onClick={handleStopLatestRun}
              disabled={!latestRunning || status === "stopping"}
            >
              停止
            </button>
          </div>
          <div className="browser-automation-form">
            <section className="browser-automation-form-section">
              <h2>流程信息</h2>
              <div className="browser-automation-fields">
                <label>
                  <span>流程名称</span>
                  <input
                    name="workflowName"
                    value={draft.name}
                    onChange={(event) => updateDraft({ name: event.currentTarget.value })}
                  />
                </label>
                <label>
                  <span>说明</span>
                  <input
                    name="workflowDescription"
                    value={draft.description}
                    onChange={(event) => updateDraft({ description: event.currentTarget.value })}
                  />
                </label>
                <label className="browser-automation-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => updateDraft({ enabled: event.currentTarget.checked })}
                  />
                  <span>启用流程</span>
                </label>
              </div>
            </section>

            <section className="browser-automation-form-section">
              <div className="browser-automation-section-title">
                <h2>步骤</h2>
                <button type="button" data-action="add-step" onClick={addStep}>添加步骤</button>
              </div>
              <div className="browser-automation-steps">
                {draft.steps.map((step, index) => (
                  <article className="browser-automation-step" key={`${step.id}-${index}`}>
                    <div className="browser-automation-step__header">
                      <strong>{index + 1}. {STEP_TYPE_OPTIONS.find((option) => option.value === step.type)?.label ?? step.type}</strong>
                      <button type="button" onClick={() => removeStep(index)} disabled={draft.steps.length <= 1}>
                        删除
                      </button>
                    </div>
                    <div className="browser-automation-fields browser-automation-fields--step">
                      <label>
                        <span>步骤类型</span>
                        <select
                          value={step.type}
                          onChange={(event) => changeStepType(index, event.currentTarget.value as BrowserAutomationStep["type"])}
                        >
                          {STEP_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>步骤 ID</span>
                        <input
                          value={step.id}
                          onChange={(event) => updateStep(index, { id: event.currentTarget.value })}
                        />
                      </label>
                      <label>
                        <span>显示名称</span>
                        <input
                          value={step.label ?? ""}
                          onChange={(event) => updateStep(index, { label: event.currentTarget.value })}
                        />
                      </label>
                      <label>
                        <span>超时毫秒</span>
                        <input
                          type="number"
                          min="0"
                          value={step.timeoutMs ?? 30000}
                          onChange={(event) => updateStep(index, { timeoutMs: Number(event.currentTarget.value) })}
                        />
                      </label>

                      {step.type === "openUrl" ? (
                        <label className="browser-automation-field-wide">
                          <span>网址</span>
                          <input
                            name="step-open-url"
                            value={step.url}
                            onChange={(event) => updateStep(index, { url: event.currentTarget.value })}
                          />
                        </label>
                      ) : null}

                      {step.type === "click" ? (
                        <>
                          {renderImageTargetControls(step, index)}
                          <label>
                            <span>屏幕 X 坐标（高级）</span>
                            <input
                              type="number"
                              value={step.x ?? ""}
                              onChange={(event) => updateStep(index, {
                                x: event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value)
                              })}
                            />
                          </label>
                          <label>
                            <span>屏幕 Y 坐标（高级）</span>
                            <input
                              type="number"
                              value={step.y ?? ""}
                              onChange={(event) => updateStep(index, {
                                y: event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value)
                              })}
                            />
                          </label>
                        </>
                      ) : null}

                      {step.type === "type" ? (
                        <>
                          {renderImageTargetControls(step, index)}
                          <label className="browser-automation-field-wide">
                            <span>输入内容</span>
                            <input value={step.text} onChange={(event) => updateStep(index, { text: event.currentTarget.value })} />
                          </label>
                          <label className="browser-automation-checkbox">
                            <input
                              type="checkbox"
                              checked={step.clearBeforeType ?? true}
                              onChange={(event) => updateStep(index, { clearBeforeType: event.currentTarget.checked })}
                            />
                            <span>输入前清空</span>
                          </label>
                        </>
                      ) : null}

                      {step.type === "press" ? (
                        <label>
                          <span>按键</span>
                          <input value={step.key} onChange={(event) => updateStep(index, { key: event.currentTarget.value })} />
                        </label>
                      ) : null}

                      {step.type === "waitForCondition" ? (
                        <>
                          <label className="browser-automation-field-wide">
                            <span>等待条件</span>
                            <input value={step.conditionPrompt} onChange={(event) => updateStep(index, { conditionPrompt: event.currentTarget.value })} />
                          </label>
                          <label>
                            <span>识别间隔毫秒</span>
                            <input type="number" value={step.intervalMs} onChange={(event) => updateStep(index, { intervalMs: Number(event.currentTarget.value) })} />
                          </label>
                          <label>
                            <span>总超时毫秒</span>
                            <input type="number" value={step.timeoutMs} onChange={(event) => updateStep(index, { timeoutMs: Number(event.currentTarget.value) })} />
                          </label>
                          <label>
                            <span>满足后步骤 ID</span>
                            <input value={stepIdsToText(step.onMatched)} onChange={(event) => updateStep(index, { onMatched: textToStepIds(event.currentTarget.value) })} />
                          </label>
                          <label>
                            <span>超时后步骤 ID</span>
                            <input
                              value={Array.isArray(step.onTimeout) ? stepIdsToText(step.onTimeout) : ""}
                              onChange={(event) => updateStep(index, { onTimeout: textToStepIds(event.currentTarget.value) })}
                              placeholder="留空则失败"
                            />
                          </label>
                        </>
                      ) : null}

                      {step.type === "ifElse" ? (
                        <>
                          <label className="browser-automation-field-wide">
                            <span>判断条件</span>
                            <input value={step.conditionPrompt} onChange={(event) => updateStep(index, { conditionPrompt: event.currentTarget.value })} />
                          </label>
                          <label>
                            <span>命中步骤 ID</span>
                            <input value={stepIdsToText(step.thenStepIds)} onChange={(event) => updateStep(index, { thenStepIds: textToStepIds(event.currentTarget.value) })} />
                          </label>
                          <label>
                            <span>未命中步骤 ID</span>
                            <input value={stepIdsToText(step.elseStepIds)} onChange={(event) => updateStep(index, { elseStepIds: textToStepIds(event.currentTarget.value) })} />
                          </label>
                        </>
                      ) : null}

                      {step.type === "delay" ? (
                        <label>
                          <span>等待毫秒</span>
                          <input type="number" value={step.durationMs} onChange={(event) => updateStep(index, { durationMs: Number(event.currentTarget.value) })} />
                        </label>
                      ) : null}

                      {step.type === "extract" ? (
                        <>
                          <label>
                            <span>字段名</span>
                            <input value={step.name} onChange={(event) => updateStep(index, { name: event.currentTarget.value })} />
                          </label>
                          <label>
                            <span>选择器</span>
                            <input value={step.selector ?? ""} onChange={(event) => updateStep(index, { selector: event.currentTarget.value })} />
                          </label>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <details className="browser-automation-json-preview">
              <summary>查看生成的 JSON</summary>
              <pre>{workflowToJsonPreview(draft)}</pre>
            </details>
          </div>
        </div>

        <aside className="browser-automation-side">
          <section>
            <h2>触发规则</h2>
            <div className="browser-automation-rule">
              <input
                value={ruleAgentId}
                onChange={(event) => setRuleAgentId(event.currentTarget.value)}
                aria-label="Agent ID"
              />
              <button type="button" onClick={handleCreateRule} disabled={!selectedWorkflow || status === "rule"}>
                添加
              </button>
            </div>
            <div className="browser-automation-rules">
              {state.triggerRules.map((rule) => (
                <div key={rule.id}>
                  <strong>{rule.name}</strong>
                  <span>{rule.match.agentId ?? "*"} / {rule.match.status ?? "*"}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>最近运行</h2>
            {latestRun ? (
              <div className="browser-automation-run">
                <strong>{latestRun.status}</strong>
                <span>{latestRun.workflowName}</span>
                {latestRun.lastObservation ? <small>{latestRun.lastObservation.title || latestRun.lastObservation.url}</small> : null}
                <div className="browser-automation-logs">
                  {latestRun.logs.map((log) => (
                    <p key={log.id}>{log.message}</p>
                  ))}
                </div>
              </div>
            ) : (
              <p>暂无运行记录</p>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

export function BrowserAutomationPage() {
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
      <BrowserAutomationWorkspace />
    </main>
  );
}
