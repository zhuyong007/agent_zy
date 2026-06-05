import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  PromptTemplateApplyResult,
  PromptTemplateRecord,
  PromptTemplateState,
  PromptTemplateVariable
} from "@agent-zy/shared-types";

import {
  applyPromptTemplate,
  createPromptTemplate,
  deletePromptTemplate,
  fetchPromptTemplates,
  updatePromptTemplate
} from "../api";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";
import { ToolsBackLink } from "./tools-page";

type PromptTemplateWorkspaceProps = {
  fetchAction?: () => Promise<PromptTemplateState>;
  createAction?: (input: { title: string; originalPrompt: string }) => Promise<PromptTemplateRecord>;
  updateAction?: (id: string, input: Partial<PromptTemplateRecord>) => Promise<PromptTemplateRecord>;
  deleteAction?: (id: string) => Promise<{ ok: true }>;
  applyAction?: (id: string, input: { values: Record<string, string> }) => Promise<PromptTemplateApplyResult>;
};

type WorkspaceStatus = "idle" | "loading" | "saving" | "applying" | "deleting";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function createEmptyVariable(): PromptTemplateVariable {
  return {
    id: `draft-variable-${Date.now()}`,
    key: "",
    label: "",
    description: "",
    defaultValue: "",
    required: true
  };
}

function normalizeDraftKey(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase();
}

function mergeItem(items: PromptTemplateRecord[], item: PromptTemplateRecord) {
  return [item, ...items.filter((template) => template.id !== item.id)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function PromptTemplateWorkspace({
  fetchAction = fetchPromptTemplates,
  createAction = createPromptTemplate,
  updateAction = updatePromptTemplate,
  deleteAction = deletePromptTemplate,
  applyAction = applyPromptTemplate
}: PromptTemplateWorkspaceProps) {
  const [items, setItems] = useState<PromptTemplateRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [templatePrompt, setTemplatePrompt] = useState("");
  const [variables, setVariables] = useState<PromptTemplateVariable[]>([]);
  const [applyValues, setApplyValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PromptTemplateApplyResult | null>(null);
  const [status, setStatus] = useState<WorkspaceStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedTemplate = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      setError(null);

      try {
        const state = await fetchAction();

        if (cancelled) {
          return;
        }

        setItems(state.items ?? []);
        const first = state.items?.[0] ?? null;

        if (first) {
          selectTemplate(first);
        } else {
          startNewTemplate();
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(getErrorMessage(nextError));
        }
      } finally {
        if (!cancelled) {
          setStatus("idle");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [fetchAction]);

  function selectTemplate(template: PromptTemplateRecord) {
    setSelectedId(template.id);
    setTitle(template.title);
    setOriginalPrompt(template.originalPrompt);
    setTemplatePrompt(template.templatePrompt);
    setVariables(template.variables);
    setApplyValues(Object.fromEntries(template.variables.map((variable) => [variable.key, variable.defaultValue])));
    setResult(null);
    setCopied(false);
  }

  function startNewTemplate() {
    setSelectedId(null);
    setTitle("");
    setOriginalPrompt("");
    setTemplatePrompt("");
    setVariables([]);
    setApplyValues({});
    setResult(null);
    setCopied(false);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    setCopied(false);

    try {
      const saved = selectedId
        ? await updateAction(selectedId, {
            title,
            originalPrompt,
            templatePrompt,
            variables
          })
        : await createAction({
            title: title.trim(),
            originalPrompt: originalPrompt.trim()
          });

      setItems((current) => mergeItem(current, saved));
      selectTemplate(saved);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  async function handleSaveVariables() {
    if (!selectedId) {
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const saved = await updateAction(selectedId, {
        title,
        originalPrompt,
        templatePrompt,
        variables
      });

      setItems((current) => mergeItem(current, saved));
      selectTemplate(saved);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  async function handleDelete() {
    if (!selectedId) {
      return;
    }

    setStatus("deleting");
    setError(null);

    try {
      await deleteAction(selectedId);
      const remaining = items.filter((item) => item.id !== selectedId);
      setItems(remaining);

      if (remaining[0]) {
        selectTemplate(remaining[0]);
      } else {
        startNewTemplate();
      }
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  async function handleApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedId) {
      return;
    }

    setStatus("applying");
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      setResult(await applyAction(selectedId, { values: applyValues }));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setStatus("idle");
    }
  }

  function updateVariable(index: number, patch: Partial<PromptTemplateVariable>) {
    setVariables((current) => current.map((variable, variableIndex) => {
      if (variableIndex !== index) {
        return variable;
      }

      const next = {
        ...variable,
        ...patch
      };

      return {
        ...next,
        key: patch.key !== undefined ? normalizeDraftKey(patch.key) : next.key
      };
    }));
  }

  async function handleCopy() {
    if (!result?.finalPrompt || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(result.finalPrompt);
    setCopied(true);
  }

  return (
    <section className="prompt-template-shell">
      <header className="tools-page-header">
        <div>
          <p className="eyebrow">Prompt Utility</p>
          <h1>提示词模版</h1>
          <p>保存常用提示词，让模型提炼可替换元素；复用时填写变量，生成符合新需求的最终提示词。</p>
        </div>
        <ToolsBackLink />
      </header>

      {error ? <p className="tools-notice tools-notice--error">{error}</p> : null}

      <div className="prompt-template-layout">
        <aside className="prompt-template-list" aria-label="提示词模版列表">
          <div className="prompt-template-list__header">
            <div>
              <strong>已保存模版</strong>
              <span>{items.length} 条</span>
            </div>
            <button type="button" data-action="new-template" onClick={startNewTemplate}>
              新建
            </button>
          </div>
          <div className="prompt-template-list__items">
            {items.length === 0 ? (
              <p>还没有保存提示词模版。</p>
            ) : items.map((item) => (
              <button
                type="button"
                className={item.id === selectedId ? "is-active" : undefined}
                key={item.id}
                onClick={() => selectTemplate(item)}
              >
                <strong>{item.title}</strong>
                <span>{item.variables.length} 个变量</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="prompt-template-editor">
          <form className="prompt-template-form" data-role="template-editor" onSubmit={handleSave}>
            <section className="prompt-template-panel">
              <div className="prompt-template-panel__title">
                <div>
                  <p className="eyebrow">Save</p>
                  <h2>{selectedId ? "编辑模版" : "保存新模版"}</h2>
                </div>
                {selectedTemplate ? (
                  <span data-analysis-status={selectedTemplate.analysisStatus}>
                    {selectedTemplate.analysisStatus === "completed" ? "已提炼变量" : "提炼失败"}
                  </span>
                ) : null}
              </div>
              {selectedTemplate?.analysisError ? (
                <p className="tools-notice tools-notice--error">{selectedTemplate.analysisError}</p>
              ) : null}
              <div className="prompt-template-fields">
                <label>
                  <span>模版名称</span>
                  <input
                    name="templateTitle"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="例如：图片生成提示词"
                  />
                </label>
                <label>
                  <span>原始提示词</span>
                  <textarea
                    name="originalPrompt"
                    value={originalPrompt}
                    onChange={(event) => setOriginalPrompt(event.target.value)}
                    placeholder="粘贴你想保存的提示词"
                    rows={5}
                  />
                </label>
                <label>
                  <span>模型提炼后的模版</span>
                  <textarea
                    name="templatePrompt"
                    value={templatePrompt}
                    onChange={(event) => setTemplatePrompt(event.target.value)}
                    placeholder="保存后会生成，也可以手动编辑"
                    rows={4}
                  />
                </label>
              </div>
              <div className="prompt-template-actions">
                <button type="submit" disabled={!originalPrompt.trim() || status !== "idle"}>
                  {status === "saving" ? "正在保存..." : selectedId ? "保存模版" : "保存并提炼"}
                </button>
                {selectedId ? (
                  <button type="button" data-action="delete-template" disabled={status !== "idle"} onClick={() => void handleDelete()}>
                    删除
                  </button>
                ) : null}
              </div>
            </section>
          </form>

          <section className="prompt-template-panel">
            <div className="prompt-template-panel__title">
              <div>
                <p className="eyebrow">Variables</p>
                <h2>可替换内容</h2>
              </div>
              <button type="button" onClick={() => setVariables((current) => [...current, createEmptyVariable()])}>
                添加变量
              </button>
            </div>
            <div className="prompt-template-variables">
              {variables.length === 0 ? (
                <p>保存后会显示模型提炼出的变量；也可以手动添加。</p>
              ) : variables.map((variable, index) => (
                <div className="prompt-template-variable" key={variable.id}>
                  <label>
                    <span>变量 key</span>
                    <input
                      name={`variable-${index}-key`}
                      value={variable.key}
                      onChange={(event) => updateVariable(index, { key: event.target.value })}
                      placeholder="subject"
                    />
                  </label>
                  <label>
                    <span>名称</span>
                    <input
                      name={`variable-${index}-label`}
                      value={variable.label}
                      onChange={(event) => updateVariable(index, { label: event.target.value })}
                      placeholder="主体"
                    />
                  </label>
                  <label>
                    <span>默认值</span>
                    <input
                      name={`variable-${index}-defaultValue`}
                      value={variable.defaultValue}
                      onChange={(event) => updateVariable(index, { defaultValue: event.target.value })}
                      placeholder="狮子"
                    />
                  </label>
                  <label className="prompt-template-variable__wide">
                    <span>说明</span>
                    <input
                      name={`variable-${index}-description`}
                      value={variable.description}
                      onChange={(event) => updateVariable(index, { description: event.target.value })}
                      placeholder="复用时用户需要填写什么"
                    />
                  </label>
                  <label className="prompt-template-checkbox">
                    <input
                      checked={variable.required}
                      name={`variable-${index}-required`}
                      type="checkbox"
                      onChange={(event) => updateVariable(index, { required: event.target.checked })}
                    />
                    <span>必填</span>
                  </label>
                  <button
                    type="button"
                    data-action={`delete-variable-${index}`}
                    onClick={() => setVariables((current) => current.filter((_, variableIndex) => variableIndex !== index))}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
            <div className="prompt-template-actions">
              <button
                type="button"
                data-action="save-variables"
                disabled={!selectedId || status !== "idle"}
                onClick={() => void handleSaveVariables()}
              >
                保存变量
              </button>
            </div>
          </section>

          <form className="prompt-template-panel" data-role="template-apply" onSubmit={handleApply}>
            <div className="prompt-template-panel__title">
              <div>
                <p className="eyebrow">Reuse</p>
                <h2>复用生成</h2>
              </div>
            </div>
            <div className="prompt-template-apply-grid">
              {variables.length === 0 ? (
                <p>当前模版没有变量，仍可直接生成最终提示词。</p>
              ) : variables.map((variable) => (
                <label key={variable.id}>
                  <span>{variable.label || variable.key}</span>
                  <input
                    name={`apply-${variable.key}`}
                    value={applyValues[variable.key] ?? ""}
                    onChange={(event) => setApplyValues((current) => ({
                      ...current,
                      [variable.key]: event.target.value
                    }))}
                    placeholder={variable.defaultValue || variable.description}
                  />
                </label>
              ))}
            </div>
            <div className="prompt-template-actions">
              <button type="submit" disabled={!selectedId || status !== "idle"}>
                {status === "applying" ? "正在生成..." : "生成最终提示词"}
              </button>
            </div>
            {result ? (
              <div className="prompt-template-result">
                <div>
                  <strong>最终提示词</strong>
                  <button type="button" data-action="copy-final-prompt" onClick={() => void handleCopy()}>
                    {copied ? "已复制" : "复制"}
                  </button>
                </div>
                <p>{result.finalPrompt}</p>
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}

export function PromptTemplatePage() {
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
      <PromptTemplateWorkspace />
    </main>
  );
}
