import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createControlPlaneApp } from "./app";
import type { ModelRuntime } from "./services/model-runtime";

function createModelRuntime(): ModelRuntime {
  const generateText = vi.fn<ModelRuntime["generateText"]>()
    .mockResolvedValueOnce({
      text: JSON.stringify({
        templatePrompt: "生成 {{aspect_ratio}} 的 {{subject}} 图片",
        variables: [
          { key: "aspect_ratio", label: "画面比例", defaultValue: "9:16", required: true },
          { key: "subject", label: "主体", defaultValue: "狮子", required: true }
        ]
      })
    })
    .mockResolvedValueOnce({
      text: "生成 1:1 的橘猫图片"
    })
    .mockResolvedValue({
      text: JSON.stringify({
        templatePrompt: "生成 {{aspect_ratio}} 的 {{subject}} 图片",
        variables: [
          { key: "aspect_ratio", label: "画面比例", defaultValue: "9:16", required: true },
          { key: "subject", label: "主体", defaultValue: "狮子", required: true }
        ]
      })
    });

  return {
    generateText,
    chat: vi.fn(),
    embedding: vi.fn(),
    testConnection: vi.fn(),
    execute: vi.fn()
  } as unknown as ModelRuntime;
}

describe("prompt template API", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-prompt-template-api-"));
  const modelRuntime = createModelRuntime();
  const app = createControlPlaneApp({
    dataDir,
    startSchedulers: false,
    modelRuntime
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("creates, lists, updates, applies, and deletes prompt templates", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/tools/prompt-templates",
      payload: {
        title: "狮子图",
        originalPrompt: "生成9:16的狮子的图片"
      }
    });
    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json();
    expect(created).toMatchObject({
      title: "狮子图",
      analysisStatus: "completed",
      templatePrompt: "生成 {{aspect_ratio}} 的 {{subject}} 图片"
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/tools/prompt-templates"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items.map((item: { id: string }) => item.id)).toContain(created.id);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/tools/prompt-templates/${created.id}`,
      payload: {
        variables: created.variables.map((variable: any) => ({
          ...variable,
          description: `${variable.label}说明`
        }))
      }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().variables[0].description).toBe("画面比例说明");

    const applyResponse = await app.inject({
      method: "POST",
      url: `/api/tools/prompt-templates/${created.id}/apply`,
      payload: {
        values: {
          aspect_ratio: "1:1",
          subject: "橘猫"
        }
      }
    });
    expect(applyResponse.statusCode).toBe(200);
    expect(applyResponse.json()).toMatchObject({
      templateId: created.id,
      finalPrompt: "生成 1:1 的橘猫图片"
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/tools/prompt-templates/${created.id}`
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ ok: true });
  });

  it("returns a clear error when required apply values are missing", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/tools/prompt-templates",
      payload: {
        title: "缺变量测试",
        originalPrompt: "生成9:16的狮子的图片"
      }
    });
    const template = createResponse.json();

    const response = await app.inject({
      method: "POST",
      url: `/api/tools/prompt-templates/${template.id}/apply`,
      payload: {
        values: {
          aspect_ratio: "1:1"
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("请填写：主体");
  });
});
