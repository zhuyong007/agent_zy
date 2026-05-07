export const HOME_LAYOUT_STORAGE_KEY = "agent-zy-home-layout-v1";

export type BuiltInHomeModuleId = "news" | "chat" | "todo" | "ledger" | "topics";
export type HomeModuleId = BuiltInHomeModuleId | (string & {});
export type HomeModuleSize = "max" | "large" | "medium" | "smaller" | "small";

export interface HomeModuleDefinition {
  id: HomeModuleId;
  label: string;
  description: string;
  defaultSize: HomeModuleSize;
  defaultVisible: boolean;
}

export interface HomeModulePreference {
  id: HomeModuleId;
  visible: boolean;
  size: HomeModuleSize;
  collapsed: boolean;
  order: number;
}

export interface HomeModuleGeometry {
  columns: number;
  rows: number;
}

export interface HomeModulePreviewSize {
  width: number;
  height: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const COLLAPSED_HOME_MODULE_ROWS = 1;
const HOME_GRID_UNIT = 88;
const HOME_GRID_GAP = 14;
const HOME_LAYOUT_STORAGE_VERSION = 2;

export const HOME_MODULE_SIZE_OPTIONS = [
  { value: "max", label: "最大" },
  { value: "large", label: "较大" },
  { value: "medium", label: "中等" },
  { value: "smaller", label: "较小" },
  { value: "small", label: "最小" }
] as const satisfies ReadonlyArray<{ value: HomeModuleSize; label: string }>;

export const HOME_MODULE_SIZE_GEOMETRY = {
  max: { columns: 8, rows: 12 },
  large: { columns: 4, rows: 6 },
  medium: { columns: 8, rows: 3 },
  smaller: { columns: 4, rows: 4 },
  small: { columns: 4, rows: 2 }
} as const satisfies Record<HomeModuleSize, HomeModuleGeometry>;

export const HOME_MODULE_DEFINITIONS = [
  {
    id: "news",
    label: "AI 热点",
    description: "热点情报、信源和分类筛选",
    defaultSize: "large",
    defaultVisible: true
  },
  {
    id: "chat",
    label: "会话",
    description: "主 Agent 会话和处理进度",
    defaultSize: "max",
    defaultVisible: true
  },
  {
    id: "todo",
    label: "今日待办",
    description: "今日任务数量、优先级和完成状态",
    defaultSize: "medium",
    defaultVisible: true
  },
  {
    id: "ledger",
    label: "记账",
    description: "今日收支和当前结余",
    defaultSize: "small",
    defaultVisible: true
  },
  {
    id: "topics",
    label: "AI 自媒体选题",
    description: "基于热点生成的选题建议",
    defaultSize: "smaller",
    defaultVisible: true
  }
] as const satisfies readonly HomeModuleDefinition[];

const sizeValues = new Set<HomeModuleSize>(HOME_MODULE_SIZE_OPTIONS.map((item) => item.value));

export function getHomeModuleGeometry(size: HomeModuleSize, collapsed: boolean): HomeModuleGeometry {
  const geometry = HOME_MODULE_SIZE_GEOMETRY[size];

  return {
    columns: geometry.columns,
    rows: collapsed ? COLLAPSED_HOME_MODULE_ROWS : geometry.rows
  };
}

export function getHomeModulePreviewSize(size: HomeModuleSize, collapsed: boolean): HomeModulePreviewSize {
  const geometry = getHomeModuleGeometry(size, collapsed);

  return {
    width: geometry.columns * HOME_GRID_UNIT + Math.max(geometry.columns - 1, 0) * HOME_GRID_GAP,
    height: geometry.rows * HOME_GRID_UNIT + Math.max(geometry.rows - 1, 0) * HOME_GRID_GAP
  };
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHomeModuleSize(value: unknown): value is HomeModuleSize {
  return typeof value === "string" && sizeValues.has(value as HomeModuleSize);
}

function migrateLegacyHomeModuleSize(id: HomeModuleId, value: unknown): HomeModuleSize {
  if (value === "max") {
    return id === "chat" ? "max" : "large";
  }

  if (value === "large") {
    return "medium";
  }

  if (value === "medium") {
    return "smaller";
  }

  if (value === "small") {
    return "small";
  }

  return "smaller";
}

function normalizeOrder(layout: HomeModulePreference[]) {
  return [...layout]
    .sort((first, second) => first.order - second.order)
    .map((item, index) => ({
      ...item,
      order: index
    }));
}

function assignOrder(layout: HomeModulePreference[]) {
  return layout
    .map((item, index) => ({
      ...item,
      order: index
    }));
}

function parseStoredPreference(
  value: unknown,
  fallbackOrder: number,
  legacyStorage: boolean
): HomeModulePreference | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  return {
    id: value.id,
    visible: typeof value.visible === "boolean" ? value.visible : false,
    size: legacyStorage
      ? migrateLegacyHomeModuleSize(value.id, value.size)
      : isHomeModuleSize(value.size)
        ? value.size
        : "smaller",
    collapsed: typeof value.collapsed === "boolean" ? value.collapsed : false,
    order: typeof value.order === "number" && Number.isFinite(value.order) ? value.order : fallbackOrder
  };
}

function parseStoredLayoutPayload(value: unknown): {
  layout: unknown[];
  legacyStorage: boolean;
} | null {
  if (Array.isArray(value)) {
    return {
      layout: value,
      legacyStorage: true
    };
  }

  if (!isRecord(value) || value.version !== HOME_LAYOUT_STORAGE_VERSION || !Array.isArray(value.layout)) {
    return null;
  }

  return {
    layout: value.layout,
    legacyStorage: false
  };
}

export function getDefaultHomeLayout(
  definitions: readonly HomeModuleDefinition[] = HOME_MODULE_DEFINITIONS
): HomeModulePreference[] {
  return definitions.map((definition, index) => ({
    id: definition.id,
    visible: definition.defaultVisible,
    size: definition.defaultSize,
    collapsed: false,
    order: index
  }));
}

export const DEFAULT_HOME_LAYOUT = getDefaultHomeLayout();

export function mergeHomeLayoutPreferences(
  storedLayout: readonly HomeModulePreference[],
  definitions: readonly HomeModuleDefinition[] = HOME_MODULE_DEFINITIONS
): HomeModulePreference[] {
  const storedById = new Map(storedLayout.map((item) => [item.id, item]));
  const fallbackOrderOffset =
    storedLayout.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1;

  return normalizeOrder(
    definitions.map((definition, index) => {
      const stored = storedById.get(definition.id);

      if (stored) {
        return {
          id: definition.id,
          visible: stored.visible,
          size: stored.size,
          collapsed: stored.collapsed,
          order: stored.order
        };
      }

      return {
        id: definition.id,
        visible: false,
        size: definition.defaultSize,
        collapsed: false,
        order: fallbackOrderOffset + index
      };
    })
  );
}

export function loadHomeLayout(
  storage: StorageLike | null = getBrowserStorage(),
  definitions: readonly HomeModuleDefinition[] = HOME_MODULE_DEFINITIONS
): HomeModulePreference[] {
  try {
    const raw = storage?.getItem(HOME_LAYOUT_STORAGE_KEY);

    if (!raw) {
      return getDefaultHomeLayout(definitions);
    }

    const parsed = JSON.parse(raw);

    const payload = parseStoredLayoutPayload(parsed);

    if (!payload) {
      return getDefaultHomeLayout(definitions);
    }

    const storedLayout = payload.layout
      .map((item, index) => parseStoredPreference(item, index, payload.legacyStorage))
      .filter((item): item is HomeModulePreference => Boolean(item));

    return mergeHomeLayoutPreferences(storedLayout, definitions);
  } catch {
    return getDefaultHomeLayout(definitions);
  }
}

export function persistHomeLayout(
  layout: readonly HomeModulePreference[],
  storage: StorageLike | null = getBrowserStorage()
) {
  storage?.setItem(
    HOME_LAYOUT_STORAGE_KEY,
    JSON.stringify({
      version: HOME_LAYOUT_STORAGE_VERSION,
      layout: normalizeOrder([...layout])
    })
  );
}

export function resetHomeLayout(
  storage: StorageLike | null = getBrowserStorage(),
  definitions: readonly HomeModuleDefinition[] = HOME_MODULE_DEFINITIONS
) {
  storage?.removeItem(HOME_LAYOUT_STORAGE_KEY);
  return getDefaultHomeLayout(definitions);
}

export function updateHomeModulePreference(
  layout: readonly HomeModulePreference[],
  id: HomeModuleId,
  patch: Partial<Pick<HomeModulePreference, "visible" | "size" | "collapsed">>
) {
  return normalizeOrder(
    layout.map((item) =>
      item.id === id
        ? {
            ...item,
            ...patch
          }
        : item
    )
  );
}

export function moveHomeModule(
  layout: readonly HomeModulePreference[],
  sourceId: HomeModuleId,
  targetId: HomeModuleId
) {
  const ordered = normalizeOrder([...layout]);
  const sourceIndex = ordered.findIndex((item) => item.id === sourceId);
  const targetIndex = ordered.findIndex((item) => item.id === targetId);

  if (sourceId === targetId || sourceIndex < 0 || targetIndex < 0) {
    return ordered;
  }

  const [source] = ordered.splice(sourceIndex, 1);
  const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;

  ordered.splice(adjustedTargetIndex, 0, source);

  return assignOrder(ordered);
}

export function moveHomeModuleByOffset(
  layout: readonly HomeModulePreference[],
  id: HomeModuleId,
  offset: -1 | 1
) {
  const ordered = normalizeOrder([...layout]);
  const sourceIndex = ordered.findIndex((item) => item.id === id);
  const targetIndex = sourceIndex + offset;

  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
    return ordered;
  }

  const [source] = ordered.splice(sourceIndex, 1);

  ordered.splice(targetIndex, 0, source);

  return assignOrder(ordered);
}
