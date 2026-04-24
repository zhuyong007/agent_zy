import { describe, expect, it } from "vitest";

import type { AgentManifest } from "@agent-zy/agent-sdk";

import { createAgentRegistry } from "./index";

const ledgerManifest: AgentManifest = {
  id: "ledger-agent",
  name: "账本 Agent",
  description: "记录收入和支出",
  version: "0.1.0",
  capabilities: ["ledger.record", "ledger.summary"],
  triggers: ["user"],
  modulePath: "agents/ledger-agent/src/index.ts",
  manifestPath: "agents/ledger-agent/src/manifest.ts",
  tags: ["ledger", "money", "expense"]
};

describe("agent-registry", () => {
  it("registers manifest metadata without loading implementations", () => {
    const registry = createAgentRegistry();

    registry.register(ledgerManifest);

    expect(registry.get("ledger-agent")).toMatchObject({
      id: "ledger-agent",
      modulePath: "agents/ledger-agent/src/index.ts"
    });
    expect(registry.list()).toHaveLength(1);
  });

  it("rejects duplicate manifest ids", () => {
    const registry = createAgentRegistry();
    registry.register(ledgerManifest);

    expect(() => registry.register(ledgerManifest)).toThrow(/duplicate/i);
  });

  it("finds manifests by capability and trigger", () => {
    const registry = createAgentRegistry();
    registry.registerMany([
      ledgerManifest,
      {
        id: "news-agent",
        name: "热点 Agent",
        description: "抓取热点",
        version: "0.1.0",
        capabilities: ["news.refresh", "news.analyze"],
        triggers: ["schedule", "system"],
        modulePath: "agents/news-agent/src/index.ts",
        manifestPath: "agents/news-agent/src/manifest.ts",
        tags: ["news", "analysis"]
      }
    ]);

    expect(registry.findByCapability("news.refresh").map((item) => item.id)).toEqual([
      "news-agent"
    ]);
    expect(registry.findByTrigger("user").map((item) => item.id)).toEqual([
      "ledger-agent"
    ]);
  });
});
