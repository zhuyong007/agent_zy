import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createGitDataSyncTransport } from "./git-transport";
import { readModuleSnapshot, writeModuleSnapshot } from "./snapshot";

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("git data sync transport", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "agent-zy-sync-git-"));
    roots.push(root);
    const remote = join(root, "origin.git");
    const project = join(root, "project");
    git(root, "init", "--bare", remote);
    git(root, "init", "-b", "main", project);
    git(project, "config", "user.name", "Sync Test");
    git(project, "config", "user.email", "sync@example.test");
    writeFileSync(join(project, "README.md"), "initial\n");
    git(project, "add", "README.md");
    git(project, "commit", "-m", "initial");
    git(project, "remote", "add", "origin", remote);
    git(project, "push", "-u", "origin", "main");
    return { root, remote, project };
  }

  it("creates the data branch and commits only the selected module snapshot", async () => {
    const { project, remote } = fixture();
    writeFileSync(join(project, "README.md"), "uncommitted code change\n");
    const transport = createGitDataSyncTransport({
      projectDir: project,
      dataDir: join(project, ".agent-zy-data")
    });
    const workspace = await transport.open(null);
    writeModuleSnapshot(workspace.rootDir, "history", new Map([["notification:one", { id: "one" }]]));

    const commit = await transport.commitAndPush(workspace, "history");
    await transport.close(workspace);

    expect(git(remote, "rev-parse", "refs/heads/agent-zy-data")).toBe(commit);
    const changed = git(remote, "diff-tree", "--no-commit-id", "--name-only", "-r", commit)
      .split("\n")
      .filter(Boolean);
    expect(changed.every((path) => path.startsWith("sync-data/history/"))).toBe(true);
    expect(git(project, "status", "--short")).toContain("README.md");
  });

  it("opens the remote data branch and the previous commit as separate read roots", async () => {
    const { project } = fixture();
    const transport = createGitDataSyncTransport({ projectDir: project, dataDir: join(project, ".agent-zy-data") });
    const first = await transport.open(null);
    writeModuleSnapshot(first.rootDir, "mhxy", new Map([["trade:one", { id: "one" }]]));
    const commit = await transport.commitAndPush(first, "mhxy");
    await transport.close(first);

    const second = await transport.open(commit);

    expect(second.remoteCommit).toBe(commit);
    expect(second.baselineRootDir).not.toBeNull();
    expect(readModuleSnapshot(second.rootDir, "mhxy").has("trade:one")).toBe(true);
    expect(readModuleSnapshot(second.baselineRootDir as string, "mhxy").has("trade:one")).toBe(true);
    await transport.close(second);
  });
});
