import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { readModuleSnapshot, recordFileName, writeModuleSnapshot } from "./snapshot";

describe("data sync snapshot", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function createRoot() {
    const root = mkdtempSync(join(tmpdir(), "agent-zy-sync-snapshot-"));
    roots.push(root);
    return root;
  }

  it("writes records to deterministic sha256 file names with a schema manifest", () => {
    const root = createRoot();
    writeModuleSnapshot(root, "history", new Map([
      ["notification:中文/id", { id: "中文/id", recordType: "notification", title: "历史" }]
    ]));

    const moduleDir = join(root, "sync-data", "history");
    expect(JSON.parse(readFileSync(join(moduleDir, "manifest.json"), "utf8"))).toEqual({
      schemaVersion: 1,
      module: "history"
    });
    expect(readdirSync(join(moduleDir, "records"))).toEqual([
      recordFileName("notification:中文/id")
    ]);
    expect(readModuleSnapshot(root, "history")).toEqual(new Map([
      ["notification:中文/id", { id: "中文/id", recordType: "notification", title: "历史" }]
    ]));
  });

  it("removes stale files only inside the selected module", () => {
    const root = createRoot();
    writeModuleSnapshot(root, "history", new Map([["notification:old", { id: "old" }]]));
    writeModuleSnapshot(root, "mhxy", new Map([["trade:keep", { id: "keep" }]]));

    writeModuleSnapshot(root, "history", new Map([["notification:new", { id: "new" }]]));

    expect(readModuleSnapshot(root, "history").has("notification:old")).toBe(false);
    expect(readModuleSnapshot(root, "history").has("notification:new")).toBe(true);
    expect(readModuleSnapshot(root, "mhxy").has("trade:keep")).toBe(true);
  });

  it("rejects records whose embedded sync key does not match the file content", () => {
    const root = createRoot();
    writeModuleSnapshot(root, "history", new Map([["notification:one", { id: "one" }]]));
    const path = join(
      root,
      "sync-data",
      "history",
      "records",
      recordFileName("notification:one")
    );
    writeFileSync(path, JSON.stringify({ syncKey: "notification:other", value: { id: "one" } }));

    expect(() => readModuleSnapshot(root, "history")).toThrow("快照记录文件名与 syncKey 不匹配");
    expect(existsSync(path)).toBe(true);
  });
});
