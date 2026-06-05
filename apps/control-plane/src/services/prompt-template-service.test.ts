import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelRuntime } from "./model-runtime";
import { createPromptTemplateService } from "./prompt-template-service";
import { createControlPlaneStore } from "./store";

function createModelRuntime(generateText: ModelRuntime["generateText"]): ModelRuntime {
  return {
    generateText,
    chat: vi.fn(),
    embedding: vi.fn(),
    testConnection: vi.fn(),
    execute: vi.fn()
  } as unknown as ModelRuntime;
}

function createFixture(generateText: ModelRuntime["generateText"]) {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-prompt-template-"));
  const store = createControlPlaneStore(dataDir);
  const service = createPromptTemplateService({
    store,
    modelRuntime: createModelRuntime(generateText),
    now: () => "2026-06-04T00:00:00.000Z"
  });

  return { dataDir, store, service };
}

describe("prompt template service", () => {
  const dataDirs: string[] = [];

  afterEach(() => {
    for (const dir of dataDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a template by extracting replaceable variables with the model", async () => {
    const generateText = vi.fn<ModelRuntime["generateText"]>().mockResolvedValue({
      text: JSON.stringify({
        templatePrompt: "生成 {{aspect_ratio}} 的 {{subject}} 图片",
        variables: [
          {
            key: "aspect_ratio",
            label: "画面比例",
            description: "替换画面宽高比",
            defaultValue: "9:16",
            required: true
          },
          {
            key: "subject",
            label: "主体",
            description: "替换图片主体",
            defaultValue: "狮子",
            required: true
          }
        ]
      })
    });
    const fixture = createFixture(generateText);
    dataDirs.push(fixture.dataDir);

    const template = await fixture.service.create({
      title: "狮子图片",
      originalPrompt: "生成9:16的狮子的图片"
    });

    expect(template).toMatchObject({
      title: "狮子图片",
      originalPrompt: "生成9:16的狮子的图片",
      templatePrompt: "生成 {{aspect_ratio}} 的 {{subject}} 图片",
      analysisStatus: "completed",
      analysisError: null
    });
    expect(template.variables.map((variable) => variable.key)).toEqual(["aspect_ratio", "subject"]);
    expect(fixture.store.getState().promptTemplates?.items).toHaveLength(1);
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ purpose: "general", responseFormat: "json" }));
  });

  it("keeps the prompt when variable extraction fails", async () => {
    const fixture = createFixture(vi.fn<ModelRuntime["generateText"]>().mockRejectedValue(new Error("模型不可用")));
    dataDirs.push(fixture.dataDir);

    const template = await fixture.service.create({
      title: "备用模板",
      originalPrompt: "生成9:16的狮子的图片"
    });

    expect(template).toMatchObject({
      title: "备用模板",
      templatePrompt: "生成9:16的狮子的图片",
      variables: [],
      analysisStatus: "failed",
      analysisError: "模型不可用"
    });
  });

  it("applies edited variables to generate the final prompt", async () => {
    const generateText = vi.fn<ModelRuntime["generateText"]>()
      .mockResolvedValueOnce({
        text: JSON.stringify({
          templatePrompt: "生成 {{aspect_ratio}} 的 {{subject}} 图片",
          variables: [{ key: "subject", label: "主体", defaultValue: "狮子", required: true }]
        })
      })
      .mockResolvedValueOnce({
        text: "生成 1:1 的橘猫图片，保持原提示词的简洁风格。"
      });
    const fixture = createFixture(generateText);
    dataDirs.push(fixture.dataDir);
    const template = await fixture.service.create({
      title: "图片模板",
      originalPrompt: "生成9:16的狮子的图片"
    });
    fixture.service.update(template.id, {
      variables: [
        {
          id: "variable-subject",
          key: "subject",
          label: "主体",
          description: "替换图片主体",
          defaultValue: "狮子",
          required: true
        },
        {
          id: "variable-aspect-ratio",
          key: "aspect_ratio",
          label: "画面比例",
          description: "替换画面比例",
          defaultValue: "9:16",
          required: true
        }
      ]
    });

    const result = await fixture.service.apply(template.id, {
      values: {
        subject: "橘猫",
        aspect_ratio: "1:1"
      }
    });

    expect(result.finalPrompt).toBe("生成 1:1 的橘猫图片，保持原提示词的简洁风格。");
    expect(result.templateId).toBe(template.id);
    expect(generateText).toHaveBeenLastCalledWith(expect.objectContaining({ purpose: "general" }));
    expect(fixture.service.get(template.id)?.lastUsedAt).toBe("2026-06-04T00:00:00.000Z");
  });

  it("rejects apply requests missing required variables", async () => {
    const fixture = createFixture(vi.fn<ModelRuntime["generateText"]>().mockResolvedValue({
      text: JSON.stringify({
        templatePrompt: "生成 {{subject}} 图片",
        variables: [{ key: "subject", label: "主体", defaultValue: "狮子", required: true }]
      })
    }));
    dataDirs.push(fixture.dataDir);
    const template = await fixture.service.create({
      title: "图片模板",
      originalPrompt: "生成狮子图片"
    });

    await expect(fixture.service.apply(template.id, { values: {} })).rejects.toThrow("请填写：主体");
  });
});
