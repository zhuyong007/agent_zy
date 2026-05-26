import { describe, expect, it } from "vitest";

import { normalizeModelOutput, parseModelJson } from "./index";

describe("model output normalization", () => {
  it("parses JSON from markdown fences and surrounding prose", () => {
    expect(parseModelJson('```json\n{"topic":"玄奘取经"}\n```')).toEqual({
      topic: "玄奘取经"
    });
    expect(parseModelJson('模型输出如下：\n{"ok":true}\n请使用。')).toEqual({
      ok: true
    });
  });

  it("unwraps OpenAI-compatible choice payloads into their JSON content", () => {
    expect(
      normalizeModelOutput({
        choices: [
          {
            message: {
              content: '```json\n{"title":"DeepSeek 历史知识"}\n```'
            }
          }
        ]
      })
    ).toEqual({
      title: "DeepSeek 历史知识"
    });
  });

  it("unwraps content block arrays that contain JSON text", () => {
    expect(
      normalizeModelOutput([
        {
          type: "text",
          text: '{"topic":"郑和下西洋","cardCount":1}'
        }
      ])
    ).toEqual({
      topic: "郑和下西洋",
      cardCount: 1
    });
  });

  it("preserves already-normalized business objects and real arrays", () => {
    const objectPayload = {
      topic: "玛雅历法",
      cards: []
    };
    const arrayPayload = [
      {
        topic: "大运河",
        cards: []
      }
    ];

    expect(normalizeModelOutput(objectPayload)).toBe(objectPayload);
    expect(normalizeModelOutput(arrayPayload)).toBe(arrayPayload);
  });
});
