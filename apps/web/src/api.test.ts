import { afterEach, describe, expect, it, vi } from "vitest";

import { generateHistory } from "./api";

describe("generateHistory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to chat and dashboard refresh when dedicated endpoint is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          route: {
            agentId: "history-agent",
            confidence: 0.8,
            reason: "fallback"
          },
          task: {
            status: "completed"
          },
          message: {
            content: "已生成今日历史知识点小红书策划"
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          notifications: [
            {
              kind: "history-post",
              title: "每日历史知识点：测试主题"
            }
          ]
        })
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateHistory();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/history/generate");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/api/chat");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/api/dashboard");
    expect(result).toMatchObject({
      notifications: [
        {
          kind: "history-post",
          title: "每日历史知识点：测试主题"
        }
      ]
    });
  });
});
