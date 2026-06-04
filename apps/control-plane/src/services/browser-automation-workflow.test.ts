import { describe, expect, it } from "vitest";

import {
  createBrowserAutomationExampleWorkflow,
  normalizeBrowserAutomationWorkflow
} from "./browser-automation-workflow";

describe("browser automation workflow schema", () => {
  it("normalizes the example wait workflow with safe defaults", () => {
    const workflow = createBrowserAutomationExampleWorkflow("2026-06-04T00:00:00.000Z");

    expect(workflow.name).toBe("等待网页状态示例");
    expect(workflow.steps.map((step) => step.type)).toEqual(["openUrl", "waitForCondition"]);
    expect(workflow.steps[1]).toMatchObject({
      type: "waitForCondition",
      intervalMs: 5000,
      timeoutMs: 60000,
      onTimeout: "fail"
    });
  });

  it("rejects branch steps that are not defined inside the current workflow", () => {
    expect(() =>
      normalizeBrowserAutomationWorkflow(
        {
          name: "非法分支流程",
          steps: [
            {
              id: "decide",
              type: "ifElse",
              conditionPrompt: "页面是否已经成功？",
              thenStepIds: ["missing-step"],
              elseStepIds: []
            }
          ]
        },
        "2026-06-04T00:00:00.000Z"
      )
    ).toThrow("unknown step id: missing-step");
  });

  it("applies wait defaults and keeps user timing inside supported bounds", () => {
    const workflow = normalizeBrowserAutomationWorkflow(
      {
        name: "等待流程",
        steps: [
          {
            id: "wait",
            type: "waitForCondition",
            conditionPrompt: "结果区域出现完成提示",
            intervalMs: 100,
            timeoutMs: 999999
          }
        ]
      },
      "2026-06-04T00:00:00.000Z"
    );

    expect(workflow.steps[0]).toMatchObject({
      id: "wait",
      intervalMs: 1000,
      timeoutMs: 300000,
      onTimeout: "fail"
    });
  });

  it("accepts image targets for click and type steps", () => {
    const workflow = normalizeBrowserAutomationWorkflow(
      {
        name: "图片定位流程",
        steps: [
          {
            id: "click-image",
            type: "click",
            imageTarget: {
              imageDataUrl: "data:image/png;base64,aW1hZ2U=",
              prompt: "点击这个按钮"
            }
          },
          {
            id: "type-image",
            type: "type",
            text: "hello",
            imageTarget: {
              imageDataUrl: "data:image/png;base64,aW5wdXQ=",
              prompt: "找到这个输入框"
            }
          }
        ]
      },
      "2026-06-04T00:00:00.000Z"
    );

    expect(workflow.steps[0]).toMatchObject({
      type: "click",
      imageTarget: {
        imageDataUrl: "data:image/png;base64,aW1hZ2U=",
        prompt: "点击这个按钮"
      }
    });
    expect(workflow.steps[1]).toMatchObject({
      type: "type",
      text: "hello",
      imageTarget: {
        imageDataUrl: "data:image/png;base64,aW5wdXQ=",
        prompt: "找到这个输入框"
      }
    });
  });

  it("accepts target prompts for desktop visual fallback", () => {
    const workflow = normalizeBrowserAutomationWorkflow(
      {
        name: "桌面视觉流程",
        steps: [
          {
            id: "click-prompt",
            type: "click",
            targetPrompt: "点击右上角登录按钮"
          },
          {
            id: "type-prompt",
            type: "type",
            targetPrompt: "搜索输入框",
            text: "hello"
          }
        ]
      },
      "2026-06-04T00:00:00.000Z"
    );

    expect(workflow.steps[0]).toMatchObject({
      type: "click",
      targetPrompt: "点击右上角登录按钮"
    });
    expect(workflow.steps[1]).toMatchObject({
      type: "type",
      targetPrompt: "搜索输入框",
      text: "hello"
    });
  });
});
