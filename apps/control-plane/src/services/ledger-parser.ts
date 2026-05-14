import type { LedgerFactRecord } from "@agent-zy/shared-types";

const RULE_PARSER_VERSION = "rule-parser-v1";

const EXPENSE_KEYWORDS = ["花", "支出", "买", "付", "吃", "充"];
const INCOME_KEYWORDS = ["赚", "收入", "卖货", "卖了", "到账", "收到", "回款"];
const PEOPLE_HINTS = ["老婆", "老公", "对象", "女朋友", "男朋友", "朋友", "同事"];
const SCENE_HINTS = ["梦幻西游", "火锅", "奶茶", "咖啡"];

export type LedgerParseIssue = "amount_missing" | "direction_unknown";
export type LedgerDirectionDraft = "expense" | "income" | null;

export interface ParsedLedgerFactDraft {
  sourceType: LedgerFactRecord["sourceType"];
  rawText: string;
  normalizedText: string;
  direction: LedgerDirectionDraft;
  amountCents: number | null;
  currency: LedgerFactRecord["currency"];
  occurredAt: string;
  recordedAt: string;
  counterparty?: string;
  status: LedgerFactRecord["status"];
}

export interface ParsedLedgerSemanticDraft {
  primaryCategory: string | null;
  secondaryCategories: string[];
  tags: string[];
  people: string[];
  scene: string | null;
  confidence: number;
  reasoningSummary: string;
  parserVersion: string;
}

export interface ParsedLedgerInputDraft {
  status: LedgerFactRecord["status"];
  issues: LedgerParseIssue[];
  fact: ParsedLedgerFactDraft;
  semantic: ParsedLedgerSemanticDraft;
}

function normalizeMessage(message: string): string {
  return message.trim().replace(/\s+/g, " ");
}

function detectDirection(message: string): LedgerDirectionDraft {
  const hasIncomeKeyword = INCOME_KEYWORDS.some((keyword) => message.includes(keyword));
  const hasExpenseKeyword = EXPENSE_KEYWORDS.some((keyword) => message.includes(keyword));

  if (hasIncomeKeyword === hasExpenseKeyword) {
    return null;
  }

  return hasIncomeKeyword ? "income" : "expense";
}

function extractAmountCents(message: string): number | null {
  const matches = [...message.matchAll(/\d+(?:\.\d{1,2})?/g)];
  const rawAmount = matches.at(-1)?.[0];

  if (!rawAmount) {
    return null;
  }

  return Math.round(Number(rawAmount) * 100);
}

function resolveOccurredAt(message: string, now: Date): string {
  const occurredAt = new Date(now.getTime());

  if (message.includes("昨天")) {
    occurredAt.setDate(occurredAt.getDate() - 1);
  }

  return occurredAt.toISOString();
}

function pickPeople(message: string): string[] {
  return PEOPLE_HINTS.filter((hint) => message.includes(hint));
}

function pickScene(message: string): string | null {
  return SCENE_HINTS.find((hint) => message.includes(hint)) ?? null;
}

function pickPrimaryCategory(message: string): string | null {
  if (message.includes("梦幻西游") || message.includes("游戏") || message.includes("卖货")) {
    return "游戏";
  }

  if (
    message.includes("火锅") ||
    message.includes("吃") ||
    message.includes("奶茶") ||
    message.includes("咖啡") ||
    message.includes("饭")
  ) {
    return "餐饮";
  }

  return null;
}

export function parseLedgerInput(message: string, now: Date): ParsedLedgerInputDraft {
  const normalizedText = normalizeMessage(message);
  const direction = detectDirection(normalizedText);
  const amountCents = extractAmountCents(normalizedText);
  const issues: LedgerParseIssue[] = [];

  if (amountCents === null) {
    issues.push("amount_missing");
  }

  if (direction === null) {
    issues.push("direction_unknown");
  }

  const people = pickPeople(normalizedText);
  const scene = pickScene(normalizedText);
  const primaryCategory = pickPrimaryCategory(normalizedText);
  const status: LedgerFactRecord["status"] = issues.length > 0 ? "needs_review" : "confirmed";
  const reasoningParts = [
    direction === "income" ? "命中收入关键词" : direction === "expense" ? "命中支出关键词" : "方向不明确",
    amountCents === null ? "缺少金额" : "识别到金额",
    normalizedText.includes("昨天")
      ? "识别到昨天"
      : normalizedText.includes("今天")
        ? "识别到今天"
        : "使用当前时间"
  ];

  return {
    status,
    issues,
    fact: {
      sourceType: "chat",
      rawText: message,
      normalizedText,
      direction,
      amountCents,
      currency: "CNY",
      occurredAt: resolveOccurredAt(normalizedText, now),
      recordedAt: now.toISOString(),
      ...(people[0] ? { counterparty: people[0] } : {}),
      status
    },
    semantic: {
      primaryCategory,
      secondaryCategories: scene ? [scene] : [],
      tags: [],
      people,
      scene,
      confidence: amountCents === null ? 0.45 : 0.86,
      reasoningSummary: reasoningParts.join("，"),
      parserVersion: RULE_PARSER_VERSION
    }
  };
}
