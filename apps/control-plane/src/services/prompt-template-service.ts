import { nanoid } from "nanoid";

import type {
  PromptTemplateApplyResult,
  PromptTemplateRecord,
  PromptTemplateState,
  PromptTemplateVariable
} from "@agent-zy/shared-types";

import type { ModelRuntime } from "./model-runtime";
import type { ControlPlaneStore } from "./store";

export interface PromptTemplateService {
  list(): PromptTemplateState;
  get(id: string): PromptTemplateRecord | null;
  create(input: unknown): Promise<PromptTemplateRecord>;
  update(id: string, input: unknown): PromptTemplateRecord;
  delete(id: string): { ok: true };
  apply(id: string, input: unknown): Promise<PromptTemplateApplyResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nowDefault() {
  return new Date().toISOString();
}

function emptyState(): PromptTemplateState {
  return {
    items: [],
    lastUpdatedAt: null
  };
}

function createVariableId(key: string) {
  return `prompt-variable-${key.replace(/[^a-z0-9_-]+/gi, "-") || nanoid()}`;
}

function normalizeVariable(input: unknown, index: number, existing?: PromptTemplateVariable): PromptTemplateVariable | null {
  if (!isRecord(input)) {
    return null;
  }

  const key = asString(input.key)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase();

  if (!key) {
    return null;
  }

  const label = asString(input.label) || existing?.label || key;

  return {
    id: asString(input.id) || existing?.id || createVariableId(key),
    key,
    label,
    description: asString(input.description) || existing?.description || "",
    defaultValue: typeof input.defaultValue === "string" ? input.defaultValue : existing?.defaultValue ?? "",
    required: typeof input.required === "boolean" ? input.required : existing?.required ?? true
  };
}

function normalizeVariables(input: unknown, existing: PromptTemplateVariable[] = []): PromptTemplateVariable[] {
  if (!Array.isArray(input)) {
    return existing;
  }

  const existingByKey = new Map(existing.map((variable) => [variable.key, variable]));
  const seen = new Set<string>();
  const variables: PromptTemplateVariable[] = [];

  input.forEach((item, index) => {
    const key = isRecord(item) ? asString(item.key).replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase() : "";
    const variable = normalizeVariable(item, index, key ? existingByKey.get(key) : undefined);

    if (!variable || seen.has(variable.key)) {
      return;
    }

    seen.add(variable.key);
    variables.push(variable);
  });

  return variables;
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);

    if (!match) {
      throw new Error("模型未返回 JSON");
    }

    return JSON.parse(match[0]);
  }
}

function stateWithPatch(state: PromptTemplateState, patch: Partial<PromptTemplateState>, now: string): PromptTemplateState {
  return {
    ...state,
    ...patch,
    items: [...(patch.items ?? state.items)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    lastUpdatedAt: now
  };
}

function buildAnalysisPrompt(originalPrompt: string) {
  return [
    "你是提示词模版整理助手。请分析用户保存的提示词，找出复用时适合替换的元素。",
    "只返回 JSON，不要 Markdown，不要解释。",
    "JSON 结构：{\"templatePrompt\":\"把可替换元素替换成 {{变量key}} 的提示词\",\"variables\":[{\"key\":\"英文或拼音snake_case\",\"label\":\"中文变量名\",\"description\":\"用户应填写什么\",\"defaultValue\":\"原提示词里的值\",\"required\":true}]}",
    "变量应该覆盖主体、比例、风格、平台、时长、场景、对象等复用时通常会变化的内容；不要把固定句式当变量。",
    `原提示词：${originalPrompt}`
  ].join("\n");
}

function buildApplyPrompt(input: {
  originalPrompt: string;
  templatePrompt: string;
  variables: PromptTemplateVariable[];
  values: Record<string, string>;
}) {
  return [
    "你是提示词模版复用助手。请根据原始提示词风格、模版和用户填写的变量，生成最终提示词。",
    "只输出最终提示词正文，不要解释，不要 Markdown。",
    `原始提示词：${input.originalPrompt}`,
    `模版提示词：${input.templatePrompt}`,
    `变量值：${JSON.stringify(input.values, null, 2)}`,
    `变量说明：${JSON.stringify(input.variables, null, 2)}`
  ].join("\n");
}

export function createPromptTemplateService(options: {
  store: ControlPlaneStore;
  modelRuntime: ModelRuntime;
  now?: () => string;
}): PromptTemplateService {
  const now = options.now ?? nowDefault;

  function getState() {
    return options.store.getState().promptTemplates ?? emptyState();
  }

  function save(patch: Partial<PromptTemplateState>) {
    return options.store.setPromptTemplateState(stateWithPatch(getState(), patch, now()));
  }

  function upsert(template: PromptTemplateRecord) {
    const state = getState();
    save({
      items: [template, ...state.items.filter((item) => item.id !== template.id)]
    });

    return template;
  }

  return {
    list() {
      return getState();
    },
    get(id) {
      return getState().items.find((template) => template.id === id) ?? null;
    },
    async create(input) {
      const record = isRecord(input) ? input : {};
      const title = asString(record.title) || "未命名提示词模版";
      const originalPrompt = asString(record.originalPrompt);

      if (!originalPrompt) {
        throw new Error("originalPrompt is required");
      }

      const timestamp = now();
      let templatePrompt = originalPrompt;
      let variables: PromptTemplateVariable[] = [];
      let analysisStatus: PromptTemplateRecord["analysisStatus"] = "completed";
      let analysisError: string | null = null;

      try {
        const result = await options.modelRuntime.generateText({
          purpose: "general",
          responseFormat: "json",
          temperature: 0.2,
          maxTokens: 1600,
          prompt: buildAnalysisPrompt(originalPrompt)
        });
        const parsed = parseJsonObject(result.text);
        const parsedTemplatePrompt = asString(parsed.templatePrompt);

        templatePrompt = parsedTemplatePrompt || originalPrompt;
        variables = normalizeVariables(parsed.variables, []);
      } catch (error) {
        analysisStatus = "failed";
        analysisError = error instanceof Error ? error.message : "模型分析失败";
      }

      return upsert({
        id: `prompt-template-${nanoid()}`,
        title,
        originalPrompt,
        templatePrompt,
        variables,
        analysisStatus,
        analysisError,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastUsedAt: null
      });
    },
    update(id, input) {
      const current = this.get(id);

      if (!current || !isRecord(input)) {
        throw new Error("prompt template not found");
      }

      const updated: PromptTemplateRecord = {
        ...current,
        ...(Object.prototype.hasOwnProperty.call(input, "title") ? { title: asString(input.title) || current.title } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "originalPrompt")
          ? { originalPrompt: asString(input.originalPrompt) || current.originalPrompt }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "templatePrompt")
          ? { templatePrompt: typeof input.templatePrompt === "string" ? input.templatePrompt : current.templatePrompt }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "variables")
          ? { variables: normalizeVariables(input.variables, current.variables) }
          : {}),
        updatedAt: now()
      };

      return upsert(updated);
    },
    delete(id) {
      const state = getState();
      save({
        items: state.items.filter((template) => template.id !== id)
      });

      return { ok: true };
    },
    async apply(id, input) {
      const template = this.get(id);

      if (!template) {
        throw new Error("prompt template not found");
      }

      const record = isRecord(input) ? input : {};
      const valuesRecord = isRecord(record.values) ? record.values : {};
      const values = Object.fromEntries(
        Object.entries(valuesRecord).map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""])
      );
      const missing = template.variables.filter((variable) => variable.required && !values[variable.key]?.trim());

      if (missing.length > 0) {
        throw new Error(`请填写：${missing.map((variable) => variable.label).join("、")}`);
      }

      const mergedValues = Object.fromEntries(
        template.variables.map((variable) => [
          variable.key,
          values[variable.key]?.trim() || variable.defaultValue
        ])
      );
      const result = await options.modelRuntime.generateText({
        purpose: "general",
        temperature: 0.4,
        maxTokens: 2000,
        prompt: buildApplyPrompt({
          originalPrompt: template.originalPrompt,
          templatePrompt: template.templatePrompt,
          variables: template.variables,
          values: mergedValues
        })
      });
      const generatedAt = now();
      const finalPrompt = result.text.trim();
      const updated: PromptTemplateRecord = {
        ...template,
        lastUsedAt: generatedAt,
        updatedAt: generatedAt
      };

      upsert(updated);

      return {
        templateId: template.id,
        finalPrompt,
        values: mergedValues,
        generatedAt
      };
    }
  };
}
