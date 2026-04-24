import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { AgentExecutionRequest, AgentManifest, AgentModule } from "@agent-zy/agent-sdk";

interface ExecuteMessage {
  type: "execute";
  requestId: string;
  manifest: AgentManifest;
  payload: AgentExecutionRequest;
}

async function loadAgent(manifest: AgentManifest): Promise<AgentModule> {
  const modulePath = resolve(process.cwd(), manifest.modulePath);
  const loaded = await import(pathToFileURL(modulePath).href);

  return (loaded.agent ?? loaded.default) as AgentModule;
}

process.on("message", async (message: ExecuteMessage) => {
  if (message.type !== "execute") {
    return;
  }

  try {
    const agent = await loadAgent(message.manifest);
    const result = await agent.execute(message.payload);

    process.send?.({
      type: "result",
      requestId: message.requestId,
      result
    });
  } catch (error) {
    process.send?.({
      type: "error",
      requestId: message.requestId,
      error: error instanceof Error ? error.message : "Unknown worker error"
    });
  }
});
