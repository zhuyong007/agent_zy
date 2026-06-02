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

  it("unwraps nested transport result envelopes", () => {
    expect(
      normalizeModelOutput({
        data: {
          result: {
            output: {
              choices: [
                {
                  message: {
                    content: '{"topic":"丝绸之路","cardCount":3}'
                  }
                }
              ]
            }
          }
        }
      })
    ).toEqual({
      topic: "丝绸之路",
      cardCount: 3
    });
  });

  it("unwraps Responses API output content blocks", () => {
    expect(
      normalizeModelOutput({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: '{"topic":"都江堰","cardCount":4}'
              }
            ]
          }
        ]
      })
    ).toEqual({
      topic: "都江堰",
      cardCount: 4
    });
  });

  it("unwraps object-shaped text values from compatible proxies", () => {
    expect(
      normalizeModelOutput({
        response: {
          text: {
            value: '```json\n{"topic":"郑和下西洋","cardCount":5}\n```'
          }
        }
      })
    ).toEqual({
      topic: "郑和下西洋",
      cardCount: 5
    });
  });
});
