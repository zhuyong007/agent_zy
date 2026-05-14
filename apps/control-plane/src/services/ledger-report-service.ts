import type {
  LedgerFactRecord,
  LedgerReportRecord,
  LedgerSemanticRecord
} from "@agent-zy/shared-types";

export interface LedgerReportService {
  generateReport(input: {
    kind: LedgerReportRecord["kind"];
    facts: LedgerFactRecord[];
    semantics: LedgerSemanticRecord[];
    now?: Date;
    periodStart?: string;
    periodEnd?: string;
  }): LedgerReportRecord;
  listReports(input: {
    reports: LedgerReportRecord[];
    now?: Date;
  }): LedgerReportRecord[];
}

function toDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const date = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function formatCurrency(amountCents: number): string {
  return `${(amountCents / 100).toFixed(2)} 元`;
}

function isFinancialDirection(
  direction: LedgerFactRecord["direction"]
): direction is "expense" | "income" {
  return direction === "expense" || direction === "income";
}

function resolveWeeklyPeriod(now: Date) {
  const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekDay = currentWeekStart.getDay();
  const mondayOffset = weekDay === 0 ? -6 : 1 - weekDay;
  currentWeekStart.setDate(currentWeekStart.getDate() + mondayOffset);

  const periodStart = new Date(currentWeekStart.getTime());
  periodStart.setDate(periodStart.getDate() - 7);

  const periodEnd = new Date(currentWeekStart.getTime());
  periodEnd.setDate(periodEnd.getDate() - 1);

  return {
    periodStart: toDateKey(periodStart),
    periodEnd: toDateKey(periodEnd)
  };
}

function resolveMonthlyPeriod(now: Date) {
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  return {
    periodStart: toDateKey(periodStart),
    periodEnd: toDateKey(periodEnd)
  };
}

function resolvePeriod(input: {
  kind: LedgerReportRecord["kind"];
  now: Date;
  periodStart?: string;
  periodEnd?: string;
}) {
  if (input.periodStart && input.periodEnd) {
    return {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd
    };
  }

  return input.kind === "weekly" ? resolveWeeklyPeriod(input.now) : resolveMonthlyPeriod(input.now);
}

function buildReportId(kind: LedgerReportRecord["kind"], periodStart: string): string {
  if (kind === "weekly") {
    return `weekly-${periodStart}`;
  }

  return `monthly-${periodStart.slice(0, 7)}`;
}

function getPeriodLabel(kind: LedgerReportRecord["kind"]): string {
  return kind === "weekly" ? "上周" : "上月";
}

function getPeriodRangeLabel(periodStart: string, periodEnd: string): string {
  return `（${periodStart} ~ ${periodEnd}）`;
}

export function createLedgerReportService(): LedgerReportService {
  return {
    generateReport({
      kind,
      facts,
      semantics,
      now = new Date(),
      periodStart,
      periodEnd
    }) {
      const period = resolvePeriod({
        kind,
        now,
        periodStart,
        periodEnd
      });
      const semanticByFactId = new Map(semantics.map((semantic) => [semantic.factId, semantic]));
      const factsInPeriod = facts.filter((fact) => {
        const dateKey = toDateKey(new Date(fact.occurredAt));
        return dateKey >= period.periodStart && dateKey <= period.periodEnd;
      });
      const confirmedFacts = factsInPeriod.filter((fact) => fact.status === "confirmed");
      const financialFacts = confirmedFacts.filter((fact) => isFinancialDirection(fact.direction));
      const expenseFacts = financialFacts.filter((fact) => fact.direction === "expense");
      const incomeFacts = financialFacts.filter((fact) => fact.direction === "income");
      const pendingReviewCount = factsInPeriod.filter((fact) => fact.status === "needs_review").length;
      const totalExpenseCents = expenseFacts.reduce((sum, fact) => sum + fact.amountCents, 0);
      const totalIncomeCents = incomeFacts.reduce((sum, fact) => sum + fact.amountCents, 0);
      const netCents = totalIncomeCents - totalExpenseCents;
      const categoryExpenseTotals = new Map<string, number>();
      let semanticCoverageCount = 0;

      for (const fact of expenseFacts) {
        const semantic = semanticByFactId.get(fact.id);
        const category = semantic?.primaryCategory?.trim() || "未分类";

        if (semantic) {
          semanticCoverageCount += 1;
        }

        categoryExpenseTotals.set(category, (categoryExpenseTotals.get(category) ?? 0) + fact.amountCents);
      }

      for (const fact of incomeFacts) {
        if (semanticByFactId.has(fact.id)) {
          semanticCoverageCount += 1;
        }
      }

      const topExpenseCategoryEntry = [...categoryExpenseTotals.entries()].sort(
        (left, right) => right[1] - left[1]
      )[0];
      const largestExpense = [...expenseFacts].sort((left, right) => right.amountCents - left.amountCents)[0];
      const periodLabel = getPeriodLabel(kind);
      const periodRangeLabel = getPeriodRangeLabel(period.periodStart, period.periodEnd);
      const insights: string[] = [];
      const risks: string[] = [];
      const opportunities: string[] = [];

      const summary =
        financialFacts.length > 0
          ? `${periodLabel}${periodRangeLabel}已确认 ${financialFacts.length} 笔收支，支出 ${formatCurrency(totalExpenseCents)}，收入 ${formatCurrency(totalIncomeCents)}，净额 ${formatCurrency(netCents)}。`
          : `${periodLabel}${periodRangeLabel}暂无已确认收支记录，正式报告已生成，等待更多账本数据累积。`;

      if (financialFacts.length > 0) {
        insights.push(
          `${periodLabel}${periodRangeLabel}总支出 ${formatCurrency(totalExpenseCents)}，总收入 ${formatCurrency(totalIncomeCents)}。`
        );
      }

      if (topExpenseCategoryEntry) {
        insights.push(
          `支出最高分类为 ${topExpenseCategoryEntry[0]}，合计 ${formatCurrency(topExpenseCategoryEntry[1])}。`
        );
      }

      if (largestExpense) {
        insights.push(
          `单笔最大支出为 ${formatCurrency(largestExpense.amountCents)}，内容为“${largestExpense.rawText}”。`
        );
      }

      if (financialFacts.length === 0) {
        insights.push("当前周期暂无正式可分析收支，后续会随正式调度报告替换为真实统计。");
      }

      if (pendingReviewCount > 0) {
        risks.push(`${periodLabel}${periodRangeLabel}仍有 ${pendingReviewCount} 笔记录待复核，可能影响统计准确性。`);
      }

      if (netCents < 0) {
        risks.push(`${periodLabel}${periodRangeLabel}净流出 ${formatCurrency(Math.abs(netCents))}，需要关注现金流压力。`);
      }

      if (
        topExpenseCategoryEntry &&
        totalExpenseCents > 0 &&
        topExpenseCategoryEntry[1] / totalExpenseCents >= 0.5
      ) {
        risks.push(`支出集中在 ${topExpenseCategoryEntry[0]}，超过总支出的 50%。`);
      }

      if (financialFacts.length === 0) {
        opportunities.push("先持续补充日常账本记录，后续周报/月报才能提供更稳定的趋势判断。");
      } else {
        opportunities.push("继续保持规则化记账，减少跨天补录带来的统计偏差。");
      }

      if (semanticCoverageCount < financialFacts.length) {
        opportunities.push("补齐未分类记录的语义标签，便于后续按场景和分类追踪。");
      }

      if (topExpenseCategoryEntry) {
        opportunities.push(`可为 ${topExpenseCategoryEntry[0]} 设置简单预算或复盘提醒。`);
      }

      if (incomeFacts.length === 0 && expenseFacts.length > 0) {
        opportunities.push("如存在工资、报销或转账收入，建议同步补录收入侧记录。");
      }

      return {
        id: buildReportId(kind, period.periodStart),
        kind,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        generatedAt: now.toISOString(),
        summary,
        insights: insights.slice(0, 3),
        risks: risks.slice(0, 3),
        opportunities: opportunities.slice(0, 3),
        promptVersion: "rule-report-v1"
      };
    },
    listReports({ reports, now = new Date() }) {
      if (reports.length > 0) {
        return reports;
      }

      const periodEnd = new Date(now.getTime());
      const periodStart = new Date(now.getTime());
      periodStart.setDate(periodStart.getDate() - 6);

      return [
        {
          id: `fallback-weekly-${toDateKey(periodEnd)}`,
          kind: "weekly",
          periodStart: toDateKey(periodStart),
          periodEnd: toDateKey(periodEnd),
          generatedAt: now.toISOString(),
          summary: "账本周报尚未生成，当前返回最小占位报告。",
          insights: ["已支持事实与语义落库，可在后续任务中生成正式周报。"],
          risks: [],
          opportunities: ["继续积累账本记录，便于后续周报和月报分析。"],
          promptVersion: "fallback-report-v1"
        }
      ];
    }
  };
}
