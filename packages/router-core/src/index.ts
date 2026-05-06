import type {
  AgentManifest,
  RouteInput,
  RouteSelection,
  RouterModel
} from "@agent-zy/agent-sdk";

const CAPABILITY_KEYWORDS: Record<string, string[]> = {
  ledger: ["记账", "账本", "花", "花了", "赚", "收入", "支出", "报销", "元"],
  schedule: ["日程", "待办", "安排", "计划", "今天", "晚上", "完成"],
  news: ["热点", "新闻", "热搜", "分析", "快讯"],
  topics: ["选题", "自媒体", "内容", "视频", "公众号", "爆款"]
};

function scoreManifest(manifest: AgentManifest, input: RouteInput): number {
  if (!manifest.triggers.includes(input.trigger)) {
    return Number.NEGATIVE_INFINITY;
  }

  const message = input.message.toLowerCase();
  let score = 0;

  for (const tag of manifest.tags) {
    if (message.includes(tag.toLowerCase())) {
      score += 4;
    }
  }

  const capabilityPrefixes = new Set(
    manifest.capabilities.map((capability) => capability.split(".")[0])
  );

  for (const prefix of capabilityPrefixes) {
    for (const keyword of CAPABILITY_KEYWORDS[prefix] ?? []) {
      if (message.includes(keyword.toLowerCase())) {
        score += 3;
      }
    }
  }

  if (message.includes(manifest.name.replace(/\s+/g, "").toLowerCase())) {
    score += 5;
  }

  if (message.includes(manifest.description.toLowerCase())) {
    score += 2;
  }

  return score;
}

export interface HybridRouteResult {
  agentId: string;
  confidence: number;
  reason: string;
  candidates: AgentManifest[];
}

export interface HybridRouter {
  route(
    input: RouteInput,
    manifests: AgentManifest[]
  ): Promise<HybridRouteResult>;
}

export function createHeuristicRouterModel(): RouterModel {
  return {
    async selectCandidate({ candidates, input }) {
      if (candidates.length === 0) {
        return null;
      }

      return {
        agentId: candidates[0].id,
        confidence: 0.72,
        reason: `Heuristic route selected candidate for: ${input.message}`
      };
    }
  };
}

export function createHybridRouter(options: {
  model: RouterModel;
}): HybridRouter {
  return {
    async route(input, manifests) {
      const scored = manifests
        .map((manifest) => ({
          manifest,
          score: scoreManifest(manifest, input)
        }))
        .filter((item) => item.score > Number.NEGATIVE_INFINITY)
        .sort((left, right) => right.score - left.score);

      const candidates = scored
        .filter((item) => item.score > 0)
        .map((item) => item.manifest);
      const narrowed = candidates.length > 0 ? candidates : scored.map((item) => item.manifest);

      if (narrowed.length === 0) {
        throw new Error(`No agents can handle trigger: ${input.trigger}`);
      }

      const modelSelection = await options.model.selectCandidate({
        input,
        candidates: narrowed
      });

      if (modelSelection) {
        const selected = narrowed.find(
          (candidate) => candidate.id === modelSelection.agentId
        );

        if (selected) {
          return {
            agentId: modelSelection.agentId,
            confidence: modelSelection.confidence,
            reason: modelSelection.reason,
            candidates: narrowed
          };
        }
      }

      const fallback = narrowed[0];

      return {
        agentId: fallback.id,
        confidence: 0.6,
        reason: `Fallback heuristic route selected ${fallback.name}`,
        candidates: narrowed
      };
    }
  };
}
