import type {
  KanbanGroups,
  TaskRecord,
  TaskStatus,
  TaskTrigger
} from "@agent-zy/shared-types";

interface CreateTaskInput {
  id: string;
  agentId: string;
  input: Record<string, unknown>;
  summary: string;
  trigger?: TaskTrigger;
  now?: string;
}

const TERMINAL_STATUSES = new Set<TaskStatus>(["completed", "failed"]);

export function createTaskRecord(input: CreateTaskInput): TaskRecord {
  const now = input.now ?? new Date().toISOString();

  return {
    id: input.id,
    agentId: input.agentId,
    input: input.input,
    summary: input.summary,
    trigger: input.trigger ?? "user",
    status: "queued",
    createdAt: now,
    updatedAt: now,
    history: [
      {
        status: "queued",
        at: now,
        note: "Task created"
      }
    ]
  };
}

export function transitionTaskStatus(
  task: TaskRecord,
  status: TaskStatus,
  note: string,
  now = new Date().toISOString()
): TaskRecord {
  if (TERMINAL_STATUSES.has(task.status) && task.status !== status) {
    throw new Error(`Cannot transition task from terminal state: ${task.status}`);
  }

  return {
    ...task,
    status,
    updatedAt: now,
    history: [
      ...task.history,
      {
        status,
        at: now,
        note
      }
    ]
  };
}

export function groupTasksByStatus(tasks: TaskRecord[]): KanbanGroups {
  const sorted = [...tasks].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );

  return {
    todo: sorted.filter((task) => task.status === "queued"),
    inProgress: sorted.filter((task) => task.status === "running"),
    waitingFeedback: sorted.filter((task) => task.status === "waiting_feedback"),
    done: sorted.filter(
      (task) => task.status === "completed" || task.status === "failed"
    )
  };
}
