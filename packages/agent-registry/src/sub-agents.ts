import type { AgentManifest } from "@agent-zy/agent-sdk";
import { manifest as historyManifest } from "@agent-zy/history-agent/manifest";
import { manifest as ledgerManifest } from "@agent-zy/ledger-agent/manifest";
import { manifest as newsManifest } from "@agent-zy/news-agent/manifest";
import { manifest as scheduleManifest } from "@agent-zy/schedule-agent/manifest";
import { manifest as topicManifest } from "@agent-zy/topic-agent/manifest";

export type SubAgentHomeModuleSize = "max" | "large" | "medium" | "smaller" | "small";

export interface SubAgentHomeModuleDefinition {
  id: string;
  label: string;
  description: string;
  defaultSize: SubAgentHomeModuleSize;
  defaultVisible: boolean;
}

interface OrderedSubAgentHomeModuleDefinition extends SubAgentHomeModuleDefinition {
  order: number;
}

export interface SubAgentRouteConfig {
  agentId: string;
  manifest: AgentManifest;
  homeModule: OrderedSubAgentHomeModuleDefinition;
}

export const SUB_AGENT_ROUTES = [
  {
    agentId: "ledger-agent",
    manifest: ledgerManifest,
    homeModule: {
      id: "ledger",
      label: "记账",
      description: "今日收支和当前结余",
      defaultSize: "small",
      defaultVisible: true,
      order: 3
    }
  },
  {
    agentId: "schedule-agent",
    manifest: scheduleManifest,
    homeModule: {
      id: "todo",
      label: "今日待办",
      description: "今日任务数量、优先级和完成状态",
      defaultSize: "medium",
      defaultVisible: true,
      order: 2
    }
  },
  {
    agentId: "news-agent",
    manifest: newsManifest,
    homeModule: {
      id: "news",
      label: "AI 热点",
      description: "AI HOT 精选动态和分类筛选",
      defaultSize: "large",
      defaultVisible: true,
      order: 0
    }
  },
  {
    agentId: "topic-agent",
    manifest: topicManifest,
    homeModule: {
      id: "topics",
      label: "AI 自媒体选题",
      description: "基于热点生成的选题建议",
      defaultSize: "smaller",
      defaultVisible: true,
      order: 4
    }
  },
  {
    agentId: "history-agent",
    manifest: historyManifest,
    homeModule: {
      id: "history",
      label: "历史知识",
      description: "每日历史知识点推文策划",
      defaultSize: "smaller",
      defaultVisible: false,
      order: 5
    }
  }
] as const satisfies readonly SubAgentRouteConfig[];

export const SUB_AGENT_MANIFESTS = SUB_AGENT_ROUTES.map(({ manifest }) => manifest) satisfies readonly AgentManifest[];

export const SUB_AGENT_HOME_MODULE_DEFINITIONS = SUB_AGENT_ROUTES
  .map(({ homeModule }) => homeModule)
  .sort((first, second) => first.order - second.order)
  .map(({ order: _order, ...definition }) => definition) satisfies readonly SubAgentHomeModuleDefinition[];
