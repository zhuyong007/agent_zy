import { nanoid } from "nanoid";

import { defineAgent } from "@agent-zy/agent-sdk";
import type {
  AgentExecutionLedgerDraft,
  AgentExecutionRequest,
  AgentExecutionResult
} from "@agent-zy/agent-sdk";
import type {
  LedgerFactDirection,
  LedgerFactRecord,
  LedgerSemanticRecord
} from "@agent-zy/shared-types";

import { parseLedgerInput } from "../../../apps/control-plane/src/services/ledger-parser";

function formatAmount(amountCents: number): string {
  return String(amountCents / 100);
}

function resolveFactDirection(
  direction: LedgerFactRecord["direction"] | null,
  normalizedText: string
): LedgerFactDirection {
  if (/(退款|退回|返还|退了)/.test(normalizedText)) {
    return "refund";
  }

  if (/(转账|转给|转了|转)/.test(normalizedText)) {
    return "transfer";
  }

  if (direction) {
    return direction;
  }

  return "expense";
}

function buildLegacyLedgerUpdate(
  input: AgentExecutionRequest,
  moduleName: string | null
) {
  const modules = moduleName && !input.state.ledger.modules.includes(moduleName)
    ? [...input.state.ledger.modules, moduleName]
    : input.state.ledger.modules;

  return {
    ...input.state.ledger,
    modules,
    entries: input.state.ledger.entries
  };
}

function buildLedgerFact(
  input: AgentExecutionRequest,
  amountCents: number,
  direction: LedgerFactDirection,
  draft: ReturnType<typeof parseLedgerInput>
): LedgerFactRecord {
  return {
    id: nanoid(),
    sourceType: "chat",
    rawText: draft.fact.rawText,
    normalizedText: draft.fact.normalizedText,
    direction,
    amountCents,
    currency: draft.fact.currency,
    occurredAt: draft.fact.occurredAt,
    recordedAt: input.requestedAt,
    ...(draft.fact.counterparty ? { counterparty: draft.fact.counterparty } : {}),
    status: draft.status,
    taskId: input.taskId
  };
}

function buildLedgerSemantic(
  factId: string,
  draft: ReturnType<typeof parseLedgerInput>
): LedgerSemanticRecord {
  const tags = [...draft.semantic.tags];

  if (draft.status === "needs_review" && !tags.includes("needs_review")) {
    tags.push("needs_review");
  }

  for (const issue of draft.issues) {
    if (!tags.includes(issue)) {
      tags.push(issue);
    }
  }

  return {
    factId,
    primaryCategory: draft.semantic.primaryCategory ?? "",
    secondaryCategories: draft.semantic.secondaryCategories,
    tags,
    people: draft.semantic.people,
    ...(draft.semantic.scene ? { scene: draft.semantic.scene } : {}),
    lifeStageIds: [],
    confidence: draft.semantic.confidence,
    reasoningSummary: draft.semantic.reasoningSummary,
    parserVersion: draft.semantic.parserVersion
  };
}

function buildLedgerDraftMetadata(
  draft: ReturnType<typeof parseLedgerInput>
): AgentExecutionLedgerDraft {
  return {
    status: draft.status,
    issues: draft.issues,
    fact: {
      rawText: draft.fact.rawText,
      normalizedText: draft.fact.normalizedText,
      direction: draft.fact.direction,
      amountCents: draft.fact.amountCents,
      currency: draft.fact.currency,
      occurredAt: draft.fact.occurredAt,
      recordedAt: draft.fact.recordedAt,
      ...(draft.fact.counterparty ? { counterparty: draft.fact.counterparty } : {}),
      status: draft.fact.status
    },
    semantic: {
      primaryCategory: draft.semantic.primaryCategory,
      secondaryCategories: draft.semantic.secondaryCategories,
      tags: draft.semantic.tags,
      people: draft.semantic.people,
      ...(draft.semantic.scene ? { scene: draft.semantic.scene } : {}),
      confidence: draft.semantic.confidence,
      reasoningSummary: draft.semantic.reasoningSummary,
      parserVersion: draft.semantic.parserVersion
    }
  };
}

function buildLedgerMetadata(input: {
  fact?: LedgerFactRecord;
  semantic?: LedgerSemanticRecord;
  draft?: AgentExecutionLedgerDraft;
}): AgentExecutionResult["metadata"] {
  return {
    ledger: {
      ...(input.fact ? { fact: input.fact } : {}),
      ...(input.semantic ? { semantic: input.semantic } : {}),
      ...(input.draft ? { draft: input.draft } : {})
    }
  };
}

function buildMissingAmountMessage(draft: ReturnType<typeof parseLedgerInput>): string {
  if (draft.issues.includes("direction_unknown")) {
    return "我还没识别到金额，而且这笔记录的方向也不明确。请告诉我具体多少钱，以及这是收入、支出还是转账。";
  }

  if (draft.fact.direction === "income") {
    return "我识别到这像是一笔收入，但还缺具体金额。请告诉我赚了或收到了多少钱。";
  }

  return "我识别到这像是一笔支出，但还缺具体金额。请告诉我具体花了多少钱。";
}

function buildReviewMessage(
  fact: LedgerFactRecord,
  semantic: LedgerSemanticRecord,
  draft: ReturnType<typeof parseLedgerInput>
): AgentExecutionResult {
  const amountLabel = formatAmount(fact.amountCents);
  const categoryLabel = semantic.primaryCategory || "未分类";
  const directionPrompt = draft.issues.includes("direction_unknown")
    ? "这笔记录的方向还不明确，待你确认它是收入、支出、转账还是退款。"
    : "这笔记录还需要待你确认。";

  return {
    status: "completed",
    summary: `已先记录 ${amountLabel} 元（待确认）`,
    assistantMessage: `已先为你记录一笔待确认流水：${categoryLabel} ${amountLabel} 元。${directionPrompt}`,
    metadata: buildLedgerMetadata({
      fact,
      semantic,
      draft: buildLedgerDraftMetadata(draft)
    })
  };
}

function buildCompletedMessage(
  fact: LedgerFactRecord,
  semantic: LedgerSemanticRecord
): AgentExecutionResult {
  const amountLabel = formatAmount(fact.amountCents);
  const directionLabel = fact.direction === "income"
    ? "收入"
    : fact.direction === "expense"
      ? "支出"
      : fact.direction === "transfer"
        ? "转账"
        : "退款";
  const categoryLabel = semantic.primaryCategory || "未分类";

  return {
    status: "completed",
    summary: `已记录${directionLabel} ${amountLabel} 元`,
    assistantMessage: `已为你记录一笔${directionLabel}：${categoryLabel} ${amountLabel} 元。`,
    metadata: buildLedgerMetadata({ fact, semantic })
  };
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const message = input.message ?? "";
    const draft = parseLedgerInput(message, new Date(input.requestedAt));
    const moduleName = draft.semantic.primaryCategory;
    const ledger = buildLegacyLedgerUpdate(input, moduleName);

    if (draft.fact.amountCents === null) {
      return {
        status: "waiting_feedback",
        summary: "缺少金额，待补充",
        assistantMessage: buildMissingAmountMessage(draft),
        metadata: buildLedgerMetadata({
          draft: buildLedgerDraftMetadata(draft)
        }),
        domainUpdates: {
          ledger
        }
      };
    }

    const fact = buildLedgerFact(
      input,
      draft.fact.amountCents,
      resolveFactDirection(draft.fact.direction, draft.fact.normalizedText),
      draft
    );
    const semantic = buildLedgerSemantic(fact.id, draft);
    const result = draft.status === "needs_review"
      ? buildReviewMessage(fact, semantic, draft)
      : buildCompletedMessage(fact, semantic);

    return {
      ...result,
      domainUpdates: {
        ledger
      }
    };
  }
});

export default agent;
