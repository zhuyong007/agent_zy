import type {
  GameCreatorRevisionRequest,
  GameCreatorRevisionResult
} from "@agent-zy/shared-types";

import type { ModelRuntime } from "./model-runtime";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseInput(value: unknown): GameCreatorRevisionRequest {
  if (!isRecord(value)) {
    throw new Error("文稿修改请求格式无效");
  }

  const manuscriptTitle = asText(value.manuscriptTitle);
  const content = asText(value.content);
  const instruction = asText(value.instruction);
  const history = Array.isArray(value.history)
    ? value.history
        .filter(
          (item): item is { role: "user" | "assistant"; content: string } =>
            isRecord(item) &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string"
        )
        .slice(-10)
        .map((item) => ({ role: item.role, content: item.content.slice(0, 6_000) }))
    : [];

  if (!content) throw new Error("请先写下要修改的文稿");
  if (!instruction) throw new Error("请告诉我这次想怎么改");
  if (content.length > 60_000) throw new Error("单次文稿请控制在 6 万字以内");

  return { manuscriptTitle, content, instruction, history };
}

function parseResult(text: string, original: string): GameCreatorRevisionResult {
  try {
    const direct = JSON.parse(text) as unknown;
    if (isRecord(direct)) {
      const reply = asText(direct.reply);
      const revisedText = asText(direct.revisedText);
      if (reply && revisedText) return { reply, revisedText };
    }
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    if (match) {
      try {
        const embedded = JSON.parse(match[0]) as unknown;
        if (isRecord(embedded)) {
          const reply = asText(embedded.reply);
          const revisedText = asText(embedded.revisedText);
          if (reply && revisedText) return { reply, revisedText };
        }
      } catch {
        // Fall through to a useful plain-text result.
      }
    }
  }

  const revisedText = text.trim();
  return {
    reply: revisedText ? "我先按这次要求整理了一版，你可以继续追问。" : "这次没有生成可用修改，请换一种说法再试。",
    revisedText: revisedText || original
  };
}

export function createGameCreatorWritingService(options: { modelRuntime: ModelRuntime }) {
  return {
    async revise(value: unknown): Promise<GameCreatorRevisionResult> {
      const input = parseInput(value);
      const history = input.history.length
        ? input.history.map((item) => `${item.role === "user" ? "用户" : "编辑"}：${item.content}`).join("\n")
        : "无";
      const result = await options.modelRuntime.generateText({
        purpose: "general",
        temperature: 0.45,
        maxTokens: 8_000,
        responseFormat: "json",
        systemPrompt: [
          "你是一位克制、具体的中文游戏视频文稿编辑。",
          "用户可能只给几句话，也可能给完整稿件。严格保留事实、专有名词和个人判断，不擅自补造游戏情节。",
          "根据本轮要求修改；如果用户是在追问理由，也要简短回答，同时给出当前最合适的完整文稿版本。",
          "只返回 JSON：{\"reply\":\"不超过120字的编辑回应\",\"revisedText\":\"修改后的完整文稿\"}。不要 Markdown。"
        ].join("\n"),
        prompt: [
          `文稿标题：${input.manuscriptTitle || "未命名文稿"}`,
          `当前文稿：\n${input.content}`,
          `最近问答：\n${history}`,
          `本轮要求：${input.instruction}`
        ].join("\n\n")
      });

      return parseResult(result.text, input.content);
    }
  };
}

export type GameCreatorWritingService = ReturnType<typeof createGameCreatorWritingService>;
