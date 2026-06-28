import { describe, expect, it } from "vitest";

import { canonicalJson, mergeRecordMaps } from "./merge";

describe("data sync merge", () => {
  it("canonicalizes object keys recursively", () => {
    expect(canonicalJson({ z: 1, nested: { b: 2, a: 1 }, values: [{ y: 2, x: 1 }] })).toBe(
      '{"nested":{"a":1,"b":2},"values":[{"x":1,"y":2}],"z":1}'
    );
  });

  it("imports remote records on first sync without treating local absence as deletion", () => {
    const result = mergeRecordMaps({
      hasBaseline: false,
      baseline: new Map(),
      local: new Map(),
      remote: new Map([["history:remote", { id: "remote", title: "远端历史" }]])
    });

    expect(result.conflicts).toEqual([]);
    expect(result.records.get("history:remote")).toEqual({ id: "remote", title: "远端历史" });
  });

  it("merges independent local and remote additions", () => {
    const result = mergeRecordMaps({
      hasBaseline: true,
      baseline: new Map(),
      local: new Map([["trade:local", { id: "local", amount: 1 }]]),
      remote: new Map([["trade:remote", { id: "remote", amount: 2 }]])
    });

    expect([...result.records.keys()].sort()).toEqual(["trade:local", "trade:remote"]);
    expect(result.conflicts).toEqual([]);
  });

  it("reports concurrent edits to the same record", () => {
    const baseline = new Map([["workflow:one", { id: "one", name: "初始" }]]);
    const result = mergeRecordMaps({
      hasBaseline: true,
      baseline,
      local: new Map([["workflow:one", { id: "one", name: "本地" }]]),
      remote: new Map([["workflow:one", { id: "one", name: "远端" }]])
    });

    expect(result.conflicts).toEqual([
      {
        key: "workflow:one",
        baseline: { id: "one", name: "初始" },
        local: { id: "one", name: "本地" },
        remote: { id: "one", name: "远端" }
      }
    ]);
  });

  it("applies explicit conflict resolutions", () => {
    const result = mergeRecordMaps({
      hasBaseline: true,
      baseline: new Map([["target:one", { id: "one", server: "A" }]]),
      local: new Map([["target:one", { id: "one", server: "B" }]]),
      remote: new Map([["target:one", { id: "one", server: "C" }]]),
      resolutions: { "target:one": "remote" }
    });

    expect(result.conflicts).toEqual([]);
    expect(result.records.get("target:one")).toEqual({ id: "one", server: "C" });
  });
});
