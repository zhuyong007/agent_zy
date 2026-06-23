import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { DataSyncService } from "./services/data-sync/service";
import { createControlPlaneApp } from "./app";

describe("data sync API", () => {
  it("returns status and synchronizes only supported modules", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-data-sync-api-"));
    const sync = vi.fn().mockResolvedValue({
      status: "synced",
      module: "history",
      commitSha: "abc123",
      pulledCount: 1,
      pushedCount: 2,
      deletedCount: 0,
      lastSyncedAt: "2026-06-22T10:00:00.000Z"
    });
    const dataSyncService = {
      getStatus: () => ({
        enabled: true,
        branch: "agent-zy-data",
        modules: {
          history: { module: "history", status: "idle", lastSyncedAt: null, lastCommit: null, error: null },
          mhxy: { module: "mhxy", status: "idle", lastSyncedAt: null, lastCommit: null, error: null },
          "browser-automation": { module: "browser-automation", status: "idle", lastSyncedAt: null, lastCommit: null, error: null }
        }
      }),
      sync
    } satisfies DataSyncService;
    const app = createControlPlaneApp({ dataDir, dataSyncService, startSchedulers: false });

    try {
      const status = await app.inject({ method: "GET", url: "/api/data-sync/status" });
      expect(status.statusCode).toBe(200);
      expect(status.json()).toMatchObject({ enabled: true, branch: "agent-zy-data" });

      const response = await app.inject({
        method: "POST",
        url: "/api/data-sync/history",
        payload: { conflictToken: "token", resolutions: [{ key: "notification:one", choice: "local" }] }
      });
      expect(response.statusCode).toBe(200);
      expect(sync).toHaveBeenCalledWith("history", {
        conflictToken: "token",
        resolutions: [{ key: "notification:one", choice: "local" }]
      });

      const invalid = await app.inject({ method: "POST", url: "/api/data-sync/secrets" });
      expect(invalid.statusCode).toBe(400);
      expect(sync).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
