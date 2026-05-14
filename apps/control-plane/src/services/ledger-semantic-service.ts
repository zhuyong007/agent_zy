import type { AgentExecutionLedgerDraft } from "@agent-zy/agent-sdk";
import type { LedgerFactRecord, LedgerSemanticRecord } from "@agent-zy/shared-types";

export interface LedgerSemanticService {
  resolve(input: {
    fact: LedgerFactRecord;
    semantic?: LedgerSemanticRecord;
    draft?: AgentExecutionLedgerDraft;
  }): LedgerSemanticRecord | null;
}

export function createLedgerSemanticService(): LedgerSemanticService {
  return {
    resolve({ fact, semantic, draft }) {
      if (semantic) {
        return semantic;
      }

      if (!draft) {
        return null;
      }

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
        factId: fact.id,
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
  };
}
