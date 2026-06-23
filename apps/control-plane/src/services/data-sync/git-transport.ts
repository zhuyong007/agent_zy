import type { DataSyncModule } from "@agent-zy/shared-types";

import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface GitSyncWorkspace {
  rootDir: string;
  baselineRootDir: string | null;
  remoteCommit: string | null;
}

export interface GitDataSyncTransport {
  open(lastCommit: string | null): Promise<GitSyncWorkspace>;
  commitAndPush(workspace: GitSyncWorkspace, module: DataSyncModule): Promise<string>;
  close(workspace: GitSyncWorkspace): Promise<void>;
}

export class GitNonFastForwardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitNonFastForwardError";
  }
}

interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function sanitizeGitError(value: string) {
  return value.replace(/(https?:\/\/)[^/@\s]+@/g, "$1***@").trim();
}

function runGit(
  cwd: string,
  args: string[],
  allowedExitCodes: number[] = [0]
): Promise<GitCommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 30_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const normalizedExitCode = exitCode ?? -1;
      if (!allowedExitCodes.includes(normalizedExitCode)) {
        rejectPromise(
          new Error(sanitizeGitError(stderr || stdout) || `git ${args[0]} 执行失败`)
        );
        return;
      }
      resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: normalizedExitCode });
    });
  });
}

async function resolveRef(projectDir: string, ref: string) {
  const result = await runGit(projectDir, ["rev-parse", "--verify", ref], [0, 128]);
  return result.exitCode === 0 ? result.stdout : null;
}

export function createGitDataSyncTransport(options: {
  projectDir: string;
  dataDir: string;
  remote?: string;
  branch?: string;
}): GitDataSyncTransport {
  const remote = options.remote ?? "origin";
  const branch = options.branch ?? "agent-zy-data";
  const syncRoot = join(options.dataDir, "git-sync");
  const workspacePaths = new Map<GitSyncWorkspace, string[]>();

  return {
    async open(lastCommit) {
      mkdirSync(syncRoot, { recursive: true });
      await runGit(options.projectDir, ["fetch", remote]);
      const remoteRef = `refs/remotes/${remote}/${branch}`;
      const remoteCommit = await resolveRef(options.projectDir, remoteRef);
      const mainRef = (await resolveRef(options.projectDir, `refs/remotes/${remote}/main`)) ?? "HEAD";
      const rootDir = join(syncRoot, `remote-${randomUUID()}`);
      await runGit(options.projectDir, ["worktree", "add", "--detach", rootDir, remoteCommit ?? mainRef]);
      const paths = [rootDir];
      let baselineRootDir: string | null = null;

      try {
        if (lastCommit) {
          const baselineCommit = await resolveRef(options.projectDir, `${lastCommit}^{commit}`);
          if (!baselineCommit) throw new Error(`找不到上次同步提交：${lastCommit}`);
          baselineRootDir = join(syncRoot, `baseline-${randomUUID()}`);
          await runGit(options.projectDir, ["worktree", "add", "--detach", baselineRootDir, baselineCommit]);
          paths.push(baselineRootDir);
        }
      } catch (error) {
        await runGit(options.projectDir, ["worktree", "remove", "--force", rootDir], [0, 128]);
        throw error;
      }

      const workspace = { rootDir, baselineRootDir, remoteCommit };
      workspacePaths.set(workspace, paths);
      return workspace;
    },
    async commitAndPush(workspace, module) {
      const relativePath = `sync-data/${module}`;
      await runGit(workspace.rootDir, ["add", "--", relativePath]);
      const diff = await runGit(
        workspace.rootDir,
        ["diff", "--cached", "--quiet", "--", relativePath],
        [0, 1]
      );
      if (diff.exitCode === 1) {
        await runGit(workspace.rootDir, [
          "commit",
          "-m",
          `data(${module}): sync ${new Date().toISOString()}`,
          "--",
          relativePath
        ]);
      }
      const commit = (await runGit(workspace.rootDir, ["rev-parse", "HEAD"])).stdout;
      if (diff.exitCode === 1 || workspace.remoteCommit === null) {
        try {
          await runGit(workspace.rootDir, [
            "push",
            remote,
            `HEAD:refs/heads/${branch}`
          ]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "git push 执行失败";
          if (/non-fast-forward|fetch first|rejected/i.test(message)) {
            throw new GitNonFastForwardError(message);
          }
          throw error;
        }
      }
      return commit;
    },
    async close(workspace) {
      const paths = workspacePaths.get(workspace) ?? [];
      for (const path of [...paths].reverse()) {
        await runGit(options.projectDir, ["worktree", "remove", "--force", path], [0, 128]);
      }
      workspacePaths.delete(workspace);
      await runGit(options.projectDir, ["worktree", "prune"], [0]);
    }
  };
}
