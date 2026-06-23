// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchDataSyncStatus, syncModuleData } = vi.hoisted(() => ({
  fetchDataSyncStatus: vi.fn(),
  syncModuleData: vi.fn()
}));

vi.mock("../api", () => ({ fetchDataSyncStatus, syncModuleData }));

import { DataSyncControl } from "./data-sync-control";

describe("DataSyncControl", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    vi.clearAllMocks();
  });

  async function renderControl(onSynced = vi.fn()) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        React.createElement(
          QueryClientProvider,
          { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
          React.createElement(DataSyncControl, { module: "history", onSynced })
        )
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return onSynced;
  }

  it("disables synchronization until the private-repository safety flag is enabled", async () => {
    fetchDataSyncStatus.mockResolvedValue({
      enabled: false,
      branch: "agent-zy-data",
      modules: { history: { module: "history", status: "idle", lastSyncedAt: null, lastCommit: null, error: null } }
    });

    await renderControl();

    expect((container.querySelector('[data-action="sync-data"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain("确认仓库为 Private");
  });

  it("synchronizes the module and exposes the latest commit", async () => {
    fetchDataSyncStatus.mockResolvedValue({
      enabled: true,
      branch: "agent-zy-data",
      modules: { history: { module: "history", status: "idle", lastSyncedAt: null, lastCommit: null, error: null } }
    });
    syncModuleData.mockResolvedValue({
      status: "synced",
      module: "history",
      commitSha: "abcdef123456",
      pulledCount: 1,
      pushedCount: 2,
      deletedCount: 0,
      lastSyncedAt: "2026-06-22T10:00:00.000Z"
    });
    const onSynced = await renderControl();

    await act(async () => {
      (container.querySelector('[data-action="sync-data"]') as HTMLButtonElement).click();
    });

    expect(syncModuleData).toHaveBeenCalledWith("history", {});
    expect(onSynced).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("abcdef1");
  });

  it("requires a per-record choice before resolving conflicts", async () => {
    fetchDataSyncStatus.mockResolvedValue({
      enabled: true,
      branch: "agent-zy-data",
      modules: { history: { module: "history", status: "idle", lastSyncedAt: null, lastCommit: null, error: null } }
    });
    syncModuleData
      .mockResolvedValueOnce({
        status: "conflict",
        module: "history",
        conflictToken: "token-1",
        remoteCommitSha: "remote-1",
        conflicts: [{ key: "notification:one", recordType: "notification", recordId: "one", baseline: null, local: { title: "本地" }, remote: { title: "远端" } }]
      })
      .mockResolvedValueOnce({
        status: "synced",
        module: "history",
        commitSha: "resolved-1",
        pulledCount: 1,
        pushedCount: 0,
        deletedCount: 0,
        lastSyncedAt: "2026-06-22T10:00:00.000Z"
      });
    await renderControl();

    await act(async () => {
      (container.querySelector('[data-action="sync-data"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("本地");
    expect(container.textContent).toContain("远端");
    expect((container.querySelector('[data-action="resolve-conflicts"]') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      (container.querySelector('[data-resolution="remote"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-action="resolve-conflicts"]') as HTMLButtonElement).click();
    });

    expect(syncModuleData).toHaveBeenLastCalledWith("history", {
      conflictToken: "token-1",
      resolutions: [{ key: "notification:one", choice: "remote" }]
    });
  });
});
