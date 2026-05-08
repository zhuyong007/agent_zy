import { describe, expect, it } from "vitest";

import {
  SUB_AGENT_HOME_MODULE_DEFINITIONS,
  SUB_AGENT_MANIFESTS,
  SUB_AGENT_ROUTES
} from "./sub-agents";

describe("sub-agent route config", () => {
  it("is the single source for registered sub-agent manifests", () => {
    expect(SUB_AGENT_MANIFESTS.map((manifest) => manifest.id)).toEqual([
      "ledger-agent",
      "schedule-agent",
      "news-agent",
      "topic-agent",
      "history-agent"
    ]);
  });

  it("keeps route metadata aligned with each manifest", () => {
    for (const route of SUB_AGENT_ROUTES) {
      expect(route.manifest.id).toBe(route.agentId);
    }
  });

  it("provides a management module for every configured sub-agent", () => {
    expect(SUB_AGENT_ROUTES.every((route) => route.homeModule)).toBe(true);
    expect(SUB_AGENT_HOME_MODULE_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "news",
      "todo",
      "ledger",
      "topics",
      "history"
    ]);
  });
});
