import type { HomeModuleId, HomeModuleSize } from "@agent-zy/shared-types";

export const HOME_MODULE_CONTRACT_IDS = [
  "news",
  "chat",
  "mhxy",
  "todo",
  "ledger",
  "history",
  "summary",
  "browserAutomation"
] as const;

export type ContractHomeModuleId = (typeof HOME_MODULE_CONTRACT_IDS)[number];

export type HomeModuleFeature =
  | "activity"
  | "calendar"
  | "composer"
  | "details"
  | "filters"
  | "internalScroll"
  | "latest"
  | "list"
  | "metrics"
  | "progress"
  | "quickCreate"
  | "recent"
  | "secondaryAction"
  | "status"
  | "summary"
  | "tags"
  | "timeline";

export interface HomeModuleSizeRule {
  variant: `${ContractHomeModuleId}:${HomeModuleSize}`;
  mustShow: readonly string[];
  mayOmit: readonly string[];
  primaryAction: string;
  maxItems: number;
  features: readonly HomeModuleFeature[];
}

export const COLLAPSED_HOME_MODULE_RULE = {
  mustShow: ["identity", "status", "expandControl"],
  mayOmit: ["allDetails", "secondaryActions"],
  primaryAction: "expand",
  maxItems: 0
} as const;

function rule(
  moduleId: ContractHomeModuleId,
  size: HomeModuleSize,
  primaryAction: string,
  maxItems: number,
  features: readonly HomeModuleFeature[],
  mustShow: readonly string[],
  mayOmit: readonly string[]
): HomeModuleSizeRule {
  return {
    variant: `${moduleId}:${size}`,
    mustShow: ["identity", "primaryAction", ...mustShow],
    mayOmit,
    primaryAction,
    maxItems,
    features
  };
}

export const HOME_MODULE_SIZE_RULES = {
  news: {
    max: rule("news", "max", "refresh", 7, ["filters", "timeline", "summary", "tags", "details", "internalScroll"], ["updatedAt", "date"], []),
    large: rule("news", "large", "refresh", 5, ["filters", "timeline", "summary", "tags", "internalScroll"], ["updatedAt", "date"], ["longSummary"]),
    medium: rule("news", "medium", "openFeed", 4, ["filters", "timeline", "summary"], ["updatedAt"], ["date", "tags"]),
    smaller: rule("news", "smaller", "openFeed", 3, ["timeline", "summary"], ["updatedAt"], ["filters", "date", "tags"]),
    small: rule("news", "small", "openFeed", 1, ["latest", "status"], ["headline"], ["filters", "date", "summary", "tags"])
  },
  chat: {
    max: rule("chat", "max", "sendMessage", 8, ["composer", "timeline", "progress", "details", "internalScroll"], ["session", "connectionStatus"], []),
    large: rule("chat", "large", "sendMessage", 6, ["composer", "timeline", "progress", "internalScroll"], ["session", "connectionStatus"], ["stepDetails"]),
    medium: rule("chat", "medium", "sendMessage", 4, ["composer", "timeline"], ["session", "connectionStatus"], ["progress"]),
    smaller: rule("chat", "smaller", "sendMessage", 2, ["composer", "latest", "status"], ["session"], ["progress", "stepDetails"]),
    small: rule("chat", "small", "sendMessage", 1, ["composer", "latest", "status"], ["connectionStatus"], ["progress", "stepDetails"])
  },
  mhxy: {
    max: rule("mhxy", "max", "openLedger", 6, ["metrics", "list", "details", "recent", "internalScroll"], ["valuationStatus"], []),
    large: rule("mhxy", "large", "openLedger", 5, ["metrics", "list", "recent", "internalScroll"], ["valuationStatus"], ["detailRows"]),
    medium: rule("mhxy", "medium", "openLedger", 3, ["metrics", "status"], ["valuationStatus"], ["list", "recent"]),
    smaller: rule("mhxy", "smaller", "openLedger", 3, ["metrics", "status"], ["valuationStatus"], ["list", "recent"]),
    small: rule("mhxy", "small", "openLedger", 1, ["status"], ["holdingValue"], ["list", "recent", "secondaryMetrics"])
  },
  todo: {
    max: rule("todo", "max", "openTodos", 8, ["calendar", "list", "metrics", "details", "internalScroll"], ["todayStatus"], ["quickCreate"]),
    large: rule("todo", "large", "openTodos", 6, ["list", "metrics", "internalScroll"], ["todayStatus"], ["calendar", "quickCreate"]),
    medium: rule("todo", "medium", "openTodos", 4, ["list", "metrics"], ["todayStatus"], ["calendar", "quickCreate", "details"]),
    smaller: rule("todo", "smaller", "openTodos", 3, ["list", "metrics", "status"], ["todayStatus"], ["calendar", "quickCreate"]),
    small: rule("todo", "small", "openTodos", 1, ["latest", "status"], ["todayStatus"], ["calendar", "quickCreate", "details"])
  },
  ledger: {
    max: rule("ledger", "max", "record", 6, ["composer", "metrics", "details", "recent", "internalScroll"], ["todayNet"], []),
    large: rule("ledger", "large", "record", 4, ["composer", "metrics", "recent"], ["todayNet"], ["coachDetails"]),
    medium: rule("ledger", "medium", "record", 3, ["composer", "metrics"], ["todayNet"], ["recent", "coachDetails"]),
    smaller: rule("ledger", "smaller", "record", 2, ["composer", "metrics"], ["todayNet"], ["recent", "coachDetails"]),
    small: rule("ledger", "small", "record", 0, ["composer", "status"], ["todayNet"], ["metrics", "recent", "coachDetails"])
  },
  history: {
    max: rule("history", "max", "generate", 6, ["composer", "metrics", "list", "summary", "details", "internalScroll"], ["updatedAt"], []),
    large: rule("history", "large", "generate", 4, ["composer", "metrics", "list", "summary", "internalScroll"], ["updatedAt"], ["prompts"]),
    medium: rule("history", "medium", "generate", 3, ["composer", "list", "summary"], ["updatedAt"], ["metrics", "prompts"]),
    smaller: rule("history", "smaller", "openArchive", 2, ["list", "summary", "status"], ["updatedAt"], ["composer", "metrics", "prompts"]),
    small: rule("history", "small", "openArchive", 1, ["latest", "status"], ["updatedAt"], ["composer", "metrics", "summary", "prompts"])
  },
  summary: {
    max: rule("summary", "max", "newSummary", 6, ["metrics", "latest", "summary", "tags", "recent", "internalScroll"], ["periodStatus"], []),
    large: rule("summary", "large", "newSummary", 4, ["metrics", "latest", "summary", "tags"], ["periodStatus"], ["recent"]),
    medium: rule("summary", "medium", "newSummary", 3, ["metrics", "latest", "summary"], ["periodStatus"], ["tags", "recent"]),
    smaller: rule("summary", "smaller", "openSummaries", 2, ["metrics", "latest", "status"], ["periodStatus"], ["summary", "tags", "recent"]),
    small: rule("summary", "small", "openSummaries", 1, ["latest", "status"], ["todayStatus"], ["summary", "tags", "recent"])
  },
  browserAutomation: {
    max: rule("browserAutomation", "max", "openAutomation", 6, ["status", "metrics", "activity", "list", "details", "internalScroll"], ["latestRun"], []),
    large: rule("browserAutomation", "large", "openAutomation", 5, ["status", "metrics", "activity", "list", "internalScroll"], ["latestRun"], ["stepDetails"]),
    medium: rule("browserAutomation", "medium", "openAutomation", 3, ["status", "metrics", "activity"], ["latestRun"], ["list", "stepDetails"]),
    smaller: rule("browserAutomation", "smaller", "openAutomation", 2, ["status", "activity"], ["latestRun"], ["metrics", "list", "stepDetails"]),
    small: rule("browserAutomation", "small", "openAutomation", 1, ["latest", "status"], ["latestRun"], ["metrics", "activity", "stepDetails"])
  }
} as const satisfies Record<
  ContractHomeModuleId,
  Record<HomeModuleSize, HomeModuleSizeRule>
>;

const FALLBACK_RULE = HOME_MODULE_SIZE_RULES.browserAutomation.smaller;

export function getHomeModuleSizeRule(
  moduleId: HomeModuleId,
  size: HomeModuleSize
): HomeModuleSizeRule {
  return HOME_MODULE_SIZE_RULES[moduleId as ContractHomeModuleId]?.[size] ?? {
    ...FALLBACK_RULE,
    variant: `browserAutomation:${size}`
  };
}

export function homeModuleHasFeature(
  rule: HomeModuleSizeRule,
  feature: HomeModuleFeature
) {
  return rule.features.includes(feature);
}
