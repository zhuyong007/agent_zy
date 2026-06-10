import { normalizeModelOutput, parseModelJson } from "@agent-zy/agent-sdk";
import type { z } from "zod";

export * from "./prompts";
export * from "./schemas";

export async function parseModelResultWithRepair<T>(
  rawOutput: string,
  schema: z.ZodType<T>,
  repair: (issue: string) => Promise<string>
): Promise<T> {
  const parse = (value: string) => {
    const parsedJson = parseModelJson(value);
    const normalized = parsedJson === null ? normalizeModelOutput(value) : normalizeModelOutput(parsedJson);
    return schema.safeParse(normalized);
  };
  const initial = parse(rawOutput);

  if (initial.success) {
    return initial.data;
  }

  const repaired = parse(await repair(initial.error.issues.map((issue) => issue.message).join("；")));

  if (!repaired.success) {
    throw new Error(`模型输出校验失败：${repaired.error.issues.map((issue) => issue.message).join("；")}`);
  }

  return repaired.data;
}
