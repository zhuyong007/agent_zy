import { useEffect, useMemo, useState, type ClipboardEvent, type DragEvent } from "react";

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
  openBrowserAutomationPermissionSettings,
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
  openPermissionSettingsAction?: (
    kind: "accessibility" | "screen-recording"
  ) => Promise<{ opened: boolean; message: string }>;
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

const KEYBOARD_MODIFIER_KEYS = [
  { value: "ctrl", label: "Ctrl" },
  { value: "shift", label: "Shift" },
  { value: "alt", label: "Alt / Option" },
  { value: "command", label: "Cmd" },
  { value: "win", label: "Win" }
] as const;

const KEYBOARD_COMMON_KEYS = [
  { value: "enter", label: "Enter", width: "wide" },
  { value: "tab", label: "Tab" },
  { value: "esc", label: "Esc" },
  { value: "space", label: "Space", width: "wide" },
  { value: "backspace", label: "Backspace", width: "wide" },
  { value: "delete", label: "Delete" },
  { value: "home", label: "Home" },
  { value: "end", label: "End" },
  { value: "pageup", label: "Page Up" },
  { value: "pagedown", label: "Page Down" },
  { value: "left", label: "←" },
  { value: "up", label: "↑" },
  { value: "down", label: "↓" },
  { value: "right", label: "→" }
] as const;

const KEYBOARD_FUNCTION_KEYS = Array.from({ length: 12 }, (_, index) => ({
  value: `f${index + 1}`,
  label: `F${index + 1}`
}));

const KEYBOARD_ALPHA_NUMERIC_KEYS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789"
].map((key) => ({
  value: key.toLowerCase(),
  label: key
}));

const keyboardModifierValues = new Set(KEYBOARD_MODIFIER_KEYS.map((key) => key.value as string));
const keyboardKeyLabels = new Map(
  [
    ...KEYBOARD_MODIFIER_KEYS,
    ...KEYBOARD_COMMON_KEYS,
    ...KEYBOARD_FUNCTION_KEYS,
    ...KEYBOARD_ALPHA_NUMERIC_KEYS
  ].map((key) => [key.value, key.label])
);

function parseKeyboardCombination(value: string) {
  return value.split("+").map((key) => key.trim().toLowerCase()).filter(Boolean);
}

function toggleKeyboardCombination(value: string, key: string) {
  const selected = parseKeyboardCombination(value);

  if (selected.includes(key)) {
    return selected.filter((item) => item !== key).join("+");
  }

  if (keyboardModifierValues.has(key)) {
    const firstRegularKeyIndex = selected.findIndex((item) => !keyboardModifierValues.has(item));
    const insertIndex = firstRegularKeyIndex < 0 ? selected.length : firstRegularKeyIndex;
    selected.splice(insertIndex, 0, key);
  } else {
    selected.push(key);
  }

  return selected.join("+");
}

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
  createRuleAction = createBrowserAutomationTriggerRule,
  openPermissionSettingsAction = openBrowserAutomationPermissionSettings
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
  const [imageTargetMessages, setImageTargetMessages] = useState<Record<string, string>>({});
  const [collapsedStepIds, setCollapsedStepIds] = useState<Set<string>>(() => new Set());
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);

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

  function toggleStepKey(index: number, key: string) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index && step.type === "press"
          ? { ...step, key: toggleKeyboardCombination(step.key, key) }
          : step
      )
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

  function removeStepImageTarget(index: number, stepId: string) {
    updateStepImageTarget(index, null);
    setImageTargetMessages((current) => {
      const { [stepId]: _removed, ...next } = current;
      return next;
    });
  }

  async function handleImageTargetFile(index: number, file: File | undefined, message: string) {
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
      setImageTargetMessages((current) => ({
        ...current,
        [draft.steps[index]?.id ?? String(index)]: message
      }));
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  }

  async function handleImageTargetPaste(index: number, event: ClipboardEvent<HTMLElement>) {
    const file = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile()
      ?? Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));

    if (!file) {
      setError("剪贴板中未检测到图片");
      return;
    }

    event.preventDefault();
    await handleImageTargetFile(index, file, "已粘贴剪贴板图片");
  }

  async function handleImageTargetDrop(index: number, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));

    if (!file) {
      setError("请拖入图片文件作为目标截图");
      return;
    }

    await handleImageTargetFile(index, file, "已拖入目标图片");
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

  function toggleStepCollapsed(stepId: string) {
    setCollapsedStepIds((current) => {
      const next = new Set(current);

      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }

      return next;
    });
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

  async function handleOpenPermissionSettings(kind: "accessibility" | "screen-recording") {
    setError(null);
    setPermissionMessage(null);

    try {
      const result = await openPermissionSettingsAction(kind);
      setPermissionMessage(result.message);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  }

  function renderKeyboardControls(step: Extract<BrowserAutomationStep, { type: "press" }>, index: number) {
    const selectedKeys = parseKeyboardCombination(step.key);
    const selectedKeySet = new Set(selectedKeys);

    function renderKey(key: { value: string; label: string; width?: string }) {
      const selected = selectedKeySet.has(key.value);

      return (
        <button
          key={key.value}
          type="button"
          className={`browser-automation-key${selected ? " is-selected" : ""}${key.width ? ` is-${key.width}` : ""}`}
          data-key-value={key.value}
          aria-pressed={selected}
          onClick={() => toggleStepKey(index, key.value)}
        >
          {key.label}
        </button>
      );
    }

    return (
      <div className="browser-automation-keyboard browser-automation-field-wide">
        <div className="browser-automation-keyboard__header">
          <div>
            <strong>组合按键</strong>
            <span>选中的按键会作为一个组合同时按下。</span>
          </div>
          <button
            type="button"
            className="browser-automation-keyboard__clear"
            disabled={selectedKeys.length === 0}
            onClick={() => updateStep(index, { key: "" })}
          >
            清空
          </button>
        </div>
        <div className="browser-automation-keyboard__selection" aria-label="已选择按键">
          {selectedKeys.length > 0 ? selectedKeys.map((key, keyIndex) => (
            <span key={`${key}-${keyIndex}`}>
              <button
                type="button"
                aria-label={`移除 ${keyboardKeyLabels.get(key) ?? key}`}
                onClick={() => toggleStepKey(index, key)}
              >
                {keyboardKeyLabels.get(key) ?? key}
              </button>
              {keyIndex < selectedKeys.length - 1 ? <b>+</b> : null}
            </span>
          )) : <small>请选择至少一个按键</small>}
        </div>
        <section className="browser-automation-keyboard__section">
          <span>修饰键</span>
          <div className="browser-automation-keyboard__row">
            {KEYBOARD_MODIFIER_KEYS.map(renderKey)}
          </div>
        </section>
        <section className="browser-automation-keyboard__section">
          <span>常用键</span>
          <div className="browser-automation-keyboard__row">
            {KEYBOARD_COMMON_KEYS.map(renderKey)}
          </div>
        </section>
        <details className="browser-automation-keyboard__more">
          <summary>字母、数字与功能键</summary>
          <div className="browser-automation-keyboard__grid">
            {[...KEYBOARD_ALPHA_NUMERIC_KEYS, ...KEYBOARD_FUNCTION_KEYS].map(renderKey)}
          </div>
        </details>
      </div>
    );
  }

  function renderImageTargetControls(step: BrowserAutomationStep, index: number) {
    if (step.type !== "click" && step.type !== "type") {
      return null;
    }

    const target = step.imageTarget;
    const targetMessage = imageTargetMessages[step.id];

    return (
      <div className="browser-automation-image-target browser-automation-field-wide">
        <div className="browser-automation-image-target__header">
          <div>
            <strong>目标定位</strong>
            <span>优先使用局部截图匹配，说明文字用于视觉模型兜底。</span>
          </div>
          <button type="button" onClick={() => removeStepImageTarget(index, step.id)} disabled={!target}>
            移除图片
          </button>
        </div>
        <div className="browser-automation-target-grid">
          <label className="browser-automation-target-prompt">
            <span>目标说明</span>
            <input
              value={step.targetPrompt ?? target?.prompt ?? ""}
              placeholder="例如：页面右上角的蓝色提交按钮"
              onChange={(event) => updateStep(index, { targetPrompt: event.currentTarget.value })}
            />
            <small>描述得越具体，视觉模型定位越准确。</small>
          </label>
          <div className="browser-automation-target-actions">
            <label
              className="browser-automation-image-upload-zone"
              data-image-upload-target
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => void handleImageTargetDrop(index, event)}
            >
              <input
                name={`step-${step.type}-image`}
                className="browser-automation-image-upload-zone__input"
                type="file"
                accept="image/*"
                onChange={(event) => void handleImageTargetFile(index, event.currentTarget.files?.[0], "已上传目标图片")}
              />
              <span className="browser-automation-image-upload-zone__icon" aria-hidden="true">+</span>
              <strong>{target?.imageDataUrl ? "替换上传图片" : "上传图片"}</strong>
              <small>点击选择或拖入图片</small>
            </label>
            <div
              className="browser-automation-image-paste-zone"
              data-image-paste-target
              tabIndex={0}
              onPaste={(event) => void handleImageTargetPaste(index, event)}
            >
              <span className="browser-automation-image-paste-zone__key">⌘V</span>
              <div>
                <strong>粘贴剪贴板图片</strong>
                <small>点击此处后按 Cmd+V / Ctrl+V</small>
              </div>
            </div>
          </div>
        </div>
        {target?.imageDataUrl ? (
          <div className="browser-automation-image-preview">
            <img src={target.imageDataUrl} alt="目标截图预览" />
            <span>当前目标截图</span>
          </div>
        ) : null}
        {targetMessage ? <p className="browser-automation-image-target__message">{targetMessage}</p> : null}
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
                {draft.steps.map((step, index) => {
                  const typeLabel = STEP_TYPE_OPTIONS.find((option) => option.value === step.type)?.label ?? step.type;
                  const isCollapsed = collapsedStepIds.has(step.id);

                  return (
                  <article className={`browser-automation-step${isCollapsed ? " is-collapsed" : ""}`} key={`${step.id}-${index}`}>
                    <div className="browser-automation-step__header">
                      <div className="browser-automation-step__identity">
                        <span className="browser-automation-step__number">{index + 1}</span>
                        <div>
                          <strong>{step.label || typeLabel}</strong>
                          <span>{step.label ? typeLabel : step.id}</span>
                        </div>
                      </div>
                      <div className="browser-automation-step__actions">
                        <label className="browser-automation-step__type">
                          <span>动作</span>
                          <select
                            value={step.type}
                            onChange={(event) => changeStepType(index, event.currentTarget.value as BrowserAutomationStep["type"])}
                          >
                            {STEP_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="browser-automation-icon-button"
                          aria-label={`${isCollapsed ? "展开" : "折叠"}步骤 ${index + 1}`}
                          title={isCollapsed ? "展开步骤" : "折叠步骤"}
                          onClick={() => toggleStepCollapsed(step.id)}
                        >
                          {isCollapsed ? "▸" : "▾"}
                        </button>
                        <button
                          type="button"
                          className="browser-automation-icon-button browser-automation-icon-button--danger"
                          aria-label={`删除步骤 ${index + 1}`}
                          title="删除步骤"
                          onClick={() => removeStep(index)}
                          disabled={draft.steps.length <= 1}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {!isCollapsed ? (
                    <div className="browser-automation-step__body" data-step-body>
                    <div className="browser-automation-fields browser-automation-fields--step">
                      {step.type === "openUrl" ? (
                        <label className="browser-automation-field-wide">
                          <span>打开网址</span>
                          <input
                            name="step-open-url"
                            value={step.url}
                            placeholder="https://example.com"
                            onChange={(event) => updateStep(index, { url: event.currentTarget.value })}
                          />
                        </label>
                      ) : null}

                      {step.type === "click" ? renderImageTargetControls(step, index) : null}

                      {step.type === "type" ? (
                        <>
                          <label className="browser-automation-field-wide browser-automation-primary-field">
                            <span>输入内容</span>
                            <input value={step.text} onChange={(event) => updateStep(index, { text: event.currentTarget.value })} />
                          </label>
                          <label className="browser-automation-checkbox">
                            <input
                              type="checkbox"
                              checked={step.clearBeforeType ?? true}
                              onChange={(event) => updateStep(index, { clearBeforeType: event.currentTarget.checked })}
                            />
                            <span>输入前清空原内容</span>
                          </label>
                          {renderImageTargetControls(step, index)}
                        </>
                      ) : null}

                      {step.type === "press" ? renderKeyboardControls(step, index) : null}

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
                    <details className="browser-automation-step-advanced">
                      <summary>高级设置</summary>
                      <div className="browser-automation-fields browser-automation-fields--advanced">
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
                            placeholder={typeLabel}
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
                        {step.type === "click" ? (
                          <>
                            <label>
                              <span>屏幕 X 坐标</span>
                              <input
                                type="number"
                                value={step.x ?? ""}
                                onChange={(event) => updateStep(index, {
                                  x: event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value)
                                })}
                              />
                            </label>
                            <label>
                              <span>屏幕 Y 坐标</span>
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
                      </div>
                    </details>
                    </div>
                    ) : null}
                  </article>
                  );
                })}
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
            <h2>桌面权限</h2>
            <p>macOS 需要手动允许运行项目的终端或应用控制键盘鼠标，并读取屏幕。</p>
            <div className="browser-automation-permission-actions">
              <button type="button" onClick={() => void handleOpenPermissionSettings("accessibility")}>
                打开辅助功能设置
              </button>
              <button type="button" onClick={() => void handleOpenPermissionSettings("screen-recording")}>
                打开屏幕录制设置
              </button>
            </div>
            {permissionMessage ? <p className="browser-automation-permission-message">{permissionMessage}</p> : null}
          </section>
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
        activeSection="browserAutomation"
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
