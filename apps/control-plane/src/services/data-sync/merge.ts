export type SyncRecord = Record<string, unknown>;
export type SyncRecordMap = Map<string, SyncRecord>;
export type SyncResolutionChoice = "local" | "remote";

export interface SyncRecordConflict {
  key: string;
  baseline: SyncRecord | undefined;
  local: SyncRecord | undefined;
  remote: SyncRecord | undefined;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJsonValue(item)])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function recordsEqual(left: SyncRecord | undefined, right: SyncRecord | undefined) {
  if (left === undefined || right === undefined) return left === right;
  return canonicalJson(left) === canonicalJson(right);
}

export function mergeRecordMaps(input: {
  hasBaseline: boolean;
  baseline: SyncRecordMap;
  local: SyncRecordMap;
  remote: SyncRecordMap;
  resolutions?: Record<string, SyncResolutionChoice>;
}): { records: SyncRecordMap; conflicts: SyncRecordConflict[] } {
  const records: SyncRecordMap = new Map();
  const conflicts: SyncRecordConflict[] = [];
  const keys = new Set([...input.baseline.keys(), ...input.local.keys(), ...input.remote.keys()]);

  for (const key of [...keys].sort()) {
    const baseline = input.baseline.get(key);
    const local = input.local.get(key);
    const remote = input.remote.get(key);
    const localChanged = input.hasBaseline ? !recordsEqual(local, baseline) : local !== undefined;
    const remoteChanged = input.hasBaseline ? !recordsEqual(remote, baseline) : remote !== undefined;

    let selected: SyncRecord | undefined;
    if (recordsEqual(local, remote)) {
      selected = local;
    } else if (!localChanged && remoteChanged) {
      selected = remote;
    } else if (localChanged && !remoteChanged) {
      selected = local;
    } else if (!localChanged && !remoteChanged) {
      selected = baseline;
    } else if (input.resolutions?.[key]) {
      selected = input.resolutions[key] === "local" ? local : remote;
    } else {
      conflicts.push({ key, baseline, local, remote });
      continue;
    }

    if (selected !== undefined) records.set(key, selected);
  }

  return { records, conflicts };
}
