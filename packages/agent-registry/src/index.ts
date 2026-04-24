import type { AgentManifest, TaskTrigger } from "@agent-zy/agent-sdk";

export interface AgentRegistry {
  register(manifest: AgentManifest): void;
  registerMany(manifests: AgentManifest[]): void;
  list(): AgentManifest[];
  get(id: string): AgentManifest | undefined;
  findByCapability(capability: string): AgentManifest[];
  findByTrigger(trigger: TaskTrigger): AgentManifest[];
}

export function createAgentRegistry(): AgentRegistry {
  const manifests = new Map<string, AgentManifest>();

  return {
    register(manifest) {
      if (manifests.has(manifest.id)) {
        throw new Error(`Duplicate manifest id: ${manifest.id}`);
      }

      manifests.set(manifest.id, manifest);
    },
    registerMany(items) {
      for (const item of items) {
        this.register(item);
      }
    },
    list() {
      return [...manifests.values()];
    },
    get(id) {
      return manifests.get(id);
    },
    findByCapability(capability) {
      return [...manifests.values()].filter((manifest) =>
        manifest.capabilities.includes(capability)
      );
    },
    findByTrigger(trigger) {
      return [...manifests.values()].filter((manifest) =>
        manifest.triggers.includes(trigger)
      );
    }
  };
}
