import { FormEvent, useEffect, useMemo, useState } from "react";

import type {
  InterviewAnswer,
  InterviewDailyReport,
  InterviewDailySession,
  InterviewOverview,
  InterviewQuestion,
  InterviewSkillModule
} from "@agent-zy/shared-types";

import {
  createInterviewDailySession,
  fetchInterviewOverview,
  regenerateInterviewReport,
  submitInterviewAnswer,
  updateInterviewAnswer
} from "../api";
import {
  CommandRail,
  useHomeLayoutPreferences,
  useLiveClock,
  useThemePreference
} from "./dashboard-page";

export interface InterviewWorkspaceActions {
  fetchOverviewAction?: () => Promise<InterviewOverview>;
  createSessionAction?: () => Promise<InterviewDailySession>;
  submitAnswerAction?: (input: { questionId: string; answerText: string }) => Promise<InterviewAnswer>;
  updateAnswerAction?: (id: string, input: Partial<Pick<InterviewAnswer, "manualScore" | "mastery" | "note">>) => Promise<InterviewAnswer>;
  regenerateReportAction?: (date: string) => Promise<InterviewDailyReport>;
}

function groupQuestionsByModule(
  questions: InterviewQuestion[],
  modules: InterviewSkillModule[]
) {
  const labels = new Map(modules.map((module) => [module.id, module]));
  const grouped = new Map<string, InterviewQuestion[]>();
  for (const question of questions) {
    grouped.set(question.moduleId, [...(grouped.get(question.moduleId) ?? []), question]);
  }

  return [...grouped.entries()].map(([moduleId, items]) => ({
    module: labels.get(moduleId),
    moduleId,
    questions: items
  }));
}

function findAnswer(session: InterviewDailySession | null, questionId: string) {
  return session?.answers.find((answer) => answer.questionId === questionId) ?? null;
}

function replaceAnswer(session: InterviewDailySession, answer: InterviewAnswer): InterviewDailySession {
  return {
    ...session,
    answers: [answer, ...session.answers.filter((item) => item.id !== answer.id && item.questionId !== answer.questionId)]
  };
}

export function InterviewWorkspace({
  fetchOverviewAction = fetchInterviewOverview,
  createSessionAction = () => createInterviewDailySession(),
  submitAnswerAction = submitInterviewAnswer,
  updateAnswerAction = updateInterviewAnswer,
  regenerateReportAction = regenerateInterviewReport
}: InterviewWorkspaceActions) {
  const [overview, setOverview] = useState<InterviewOverview | null>(null);
  const [session, setSession] = useState<InterviewDailySession | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [manualScores, setManualScores] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetchOverviewAction()
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        setSession(data.todaySession);
        setStatus("idle");
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "读取面试训练失败");
        setStatus("idle");
      });

    return () => {
      cancelled = true;
    };
  }, [fetchOverviewAction]);

  const currentReport = session?.report ?? overview?.todayReport ?? null;
  const moduleGroups = useMemo(
    () => groupQuestionsByModule(session?.questions ?? [], overview?.skillModules ?? []),
    [overview?.skillModules, session?.questions]
  );

  async function startSession() {
    setStatus("creating");
    setError(null);
    try {
      const nextSession = await createSessionAction();
      setSession(nextSession);
      setOverview((current) => current ? { ...current, todaySession: nextSession, todayReport: nextSession.report } : current);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "生成今日题目失败");
    } finally {
      setStatus("idle");
    }
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>, questionId: string) {
    event.preventDefault();
    const answerText = (answers[questionId] ?? "").trim();
    if (!answerText) {
      setError("请先填写答案");
      return;
    }

    setStatus(`grading:${questionId}`);
    setError(null);
    try {
      const answer = await submitAnswerAction({ questionId, answerText });
      setSession((current) => current ? replaceAnswer(current, answer) : current);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "提交答案失败");
    } finally {
      setStatus("idle");
    }
  }

  async function saveManualScore(answer: InterviewAnswer) {
    const rawScore = manualScores[answer.id];
    const manualScore = rawScore === "" || rawScore === undefined ? null : Number(rawScore);
    setStatus(`patching:${answer.id}`);
    setError(null);
    try {
      const updated = await updateAnswerAction(answer.id, {
        manualScore,
        mastery: answer.mastery,
        note: answer.note
      });
      setSession((current) => current ? replaceAnswer(current, updated) : current);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "修正评分失败");
    } finally {
      setStatus("idle");
    }
  }

  async function regenerate() {
    if (!session) return;
    setStatus("reporting");
    setError(null);
    try {
      const report = await regenerateReportAction(session.date);
      setSession({ ...session, report });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "生成报告失败");
    } finally {
      setStatus("idle");
    }
  }

  if (status === "loading" && !overview) {
    return <section className="interview-workspace"><p className="interview-empty">正在读取面试训练...</p></section>;
  }

  return (
    <section className="interview-workspace">
      <header className="interview-header">
        <div>
          <p className="eyebrow">AI Full-stack Interview</p>
          <h1>面试训练</h1>
          <p>中级实战 AI 全栈开发，每天轮换模块训练并记录答题报告。</p>
        </div>
        <div className="interview-header__actions">
          <button type="button" onClick={startSession} disabled={status !== "idle"}>
            {session ? "刷新今日题组" : "生成今日题目"}
          </button>
          <button type="button" onClick={regenerate} disabled={!session || status !== "idle"}>
            更新日报
          </button>
        </div>
      </header>

      {error ? <p className="interview-notice interview-notice--error">{error}</p> : null}

      <div className="interview-metrics" aria-label="今日训练概览">
        <div><span>今日进度</span><strong>{currentReport ? `${currentReport.completedCount}/${currentReport.totalCount}` : "0/0"}</strong></div>
        <div><span>平均分</span><strong>{currentReport?.averageScore ?? "-"}</strong></div>
        <div><span>连续天数</span><strong>{overview?.streakDays ?? 0}</strong></div>
        <div><span>预计耗时</span><strong>{overview?.estimatedMinutes ?? 0} 分钟</strong></div>
      </div>

      <div className="interview-layout">
        <div className="interview-main">
          {session ? moduleGroups.map(({ module, moduleId, questions }) => (
            <section className="interview-module" key={moduleId}>
              <div className="interview-module__header">
                <div>
                  <span>{module?.category ?? "能力模块"}</span>
                  <h2>{module?.label ?? moduleId}</h2>
                </div>
                <small>{questions.length} 题</small>
              </div>
              {questions.map((question, index) => {
                const answer = findAnswer(session, question.id);
                return (
                  <article className="interview-question" key={question.id}>
                    <div className="interview-question__prompt">
                      <span>{String(index + 1).padStart(2, "0")} · {question.type === "code" ? "代码题" : "问答题"}</span>
                      <h3>{question.prompt}</h3>
                      <p>考察点：{question.expectedPoints.join("、")}</p>
                    </div>
                    <form data-question-id={question.id} onSubmit={(event) => void submitAnswer(event, question.id)}>
                      <textarea
                        name={`answer-${question.id}`}
                        value={answers[question.id] ?? answer?.answerText ?? ""}
                        onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                        placeholder="写下你的回答、代码思路或关键步骤"
                      />
                      <button type="submit" disabled={status !== "idle"}>
                        {status === `grading:${question.id}` ? "评分中..." : answer ? "重新提交" : "提交评分"}
                      </button>
                    </form>
                    {answer ? (
                      <div className="interview-feedback">
                        <div className="interview-feedback__score">
                          <strong>{answer.finalScore ?? "-"}</strong>
                          <span>{answer.mastery}</span>
                        </div>
                        <div>
                          <p>{answer.feedback}</p>
                          <small>参考答案：{answer.referenceAnswer}</small>
                          <div className="interview-score-edit">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={manualScores[answer.id] ?? answer.manualScore ?? ""}
                              onChange={(event) => setManualScores((current) => ({ ...current, [answer.id]: event.target.value }))}
                              placeholder="修正分"
                            />
                            <button type="button" onClick={() => void saveManualScore(answer)} disabled={status !== "idle"}>
                              保存修正
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          )) : (
            <div className="interview-empty">
              <strong>今天还没有题组</strong>
              <p>生成后会按 2-3 个模块轮换，每个模块至少 3 题。</p>
            </div>
          )}
        </div>

        <aside className="interview-side">
          <section>
            <span>今日简报</span>
            <p>{currentReport?.summary ?? "生成题组后开始记录今日回答情况。"}</p>
            <ul>
              {(currentReport?.nextSuggestions ?? ["先生成今日题目"]).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
          <section>
            <span>薄弱模块</span>
            {(overview?.weakModules ?? []).slice(0, 4).map((module) => (
              <div className="interview-weak" key={module.id}>
                <strong>{module.label}</strong>
                <small>{module.reason}</small>
              </div>
            ))}
          </section>
          <section>
            <span>历史日报</span>
            {(overview?.recentReports ?? []).length ? overview!.recentReports.map((report) => (
              <div className="interview-report-row" key={report.id}>
                <strong>{report.date}</strong>
                <small>{report.completedCount}/{report.totalCount} · {report.averageScore ?? "-"} 分</small>
              </div>
            )) : <p>暂无历史日报。</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}

export function InterviewPage() {
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const { layout } = useHomeLayoutPreferences();

  return (
    <main className="workspace workspace--ops">
      <CommandRail
        activeSection="interview"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[
          { label: "role", value: "AI full-stack" },
          { label: "level", value: "middle" }
        ]}
      />
      <InterviewWorkspace />
    </main>
  );
}
