import { defineAgentManifest } from "@agent-zy/agent-sdk";

export const manifest = defineAgentManifest({
  id: "ledger-agent",
  name: "账本 Agent",
  description: "记录收入支出、维护模块化账本视图",
  version: "0.1.0",
  capabilities: ["ledger.record", "ledger.summary", "ledger.capture", "ledger.review"],
  triggers: ["user"],
  modulePath: "agents/ledger-agent/src/index.ts",
  manifestPath: "agents/ledger-agent/src/manifest.ts",
  tags: ["记账", "账本", "收入", "支出", "花了", "赚了", "报销", "转账", "转给", "记一笔"]
});
