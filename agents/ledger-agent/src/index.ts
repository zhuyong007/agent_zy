import { nanoid } from "nanoid";

import { defineAgent } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";

function inferDirection(message: string): "expense" | "income" {
  if (/(赚|收入|收到|进账)/.test(message)) {
    return "income";
  }

  return "expense";
}

function inferModule(message: string, modules: string[]): string {
  for (const module of modules) {
    if (message.includes(module)) {
      return module;
    }
  }

  if (/(工作|报销|项目|客户)/.test(message)) {
    return "工作";
  }

  if (/(游戏|steam|充值)/i.test(message)) {
    return "游戏";
  }

  return "生活";
}

function parseAmount(message: string): number | null {
  const match = message.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function buildSummary(result: AgentExecutionResult, amount: number, module: string) {
  return `${result.status === "completed" ? "已记录" : "未记录"} ${module} 模块 ${amount} 元`;
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const message = input.message ?? "";
    const amount = parseAmount(message);

    if (amount === null) {
      return {
        status: "failed",
        summary: "缺少金额",
        assistantMessage: "我没有识别到金额，请告诉我具体花了或赚了多少钱。"
      };
    }

    const direction = inferDirection(message);
    const module = inferModule(message, input.state.ledger.modules);
    const note = message.replace(/\s+/g, " ").trim();

    const updatedLedger = {
      ...input.state.ledger,
      modules: input.state.ledger.modules.includes(module)
        ? input.state.ledger.modules
        : [...input.state.ledger.modules, module],
      entries: [
        {
          id: nanoid(),
          module,
          direction,
          amount,
          note,
          createdAt: input.requestedAt,
          taskId: input.taskId
        },
        ...input.state.ledger.entries
      ]
    };

    const result: AgentExecutionResult = {
      status: "completed",
      summary: `${direction === "income" ? "记录收入" : "记录支出"} ${amount} 元`,
      assistantMessage: `已为你记录一笔${direction === "income" ? "收入" : "支出"}：${module} 模块 ${amount} 元。`,
      domainUpdates: {
        ledger: updatedLedger
      }
    };

    result.summary = buildSummary(result, amount, module);

    return result;
  }
});

export default agent;
