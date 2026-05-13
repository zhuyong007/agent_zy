import { SUB_AGENT_HOME_MODULE_DEFINITIONS } from "@agent-zy/agent-registry/sub-agents";
import type {
  HomeModuleId,
  HomeModulePreference,
  HomeModuleSize
} from "@agent-zy/shared-types";

export const HOME_LAYOUT_STORAGE_KEY = "agent-zy-home-layout-v1";

export type BuiltInHomeModuleId = "news" | "chat" | "todo" | "ledger" | "topics" | "history";
export type { HomeModuleId, HomeModulePreference, HomeModuleSize };

export interface HomeModuleDefinition {
  id: HomeModuleId;
  label: string;
  description: string;
  defaultSize: HomeModuleSize;
  defaultVisible: boolean;
}

export interface HomeModuleGeometry {
  columns: number;
  rows: number;
}

export interface HomeModulePreviewSize {
  width: number;
  height: number;
}

export interface HomeModulePlacement {
  id: HomeModuleId;
  columnStart: number;
  rowStart: number;
  columns: number;
  rows: number;
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

const CORE_HOME_MODULE_DEFINITIONS = [
  {
    id: "chat",
    label: "会话",
    description: "主 Agent 会话和处理进度",
    defaultSize: "max",
    defaultVisible: true
  }
] as const satisfies readonly HomeModuleDefinition[];

export const HOME_MODULE_DEFINITIONS = [
  ...SUB_AGENT_HOME_MODULE_DEFINITIONS.slice(0, 1),
  ...CORE_HOME_MODULE_DEFINITIONS,
  ...SUB_AGENT_HOME_MODULE_DEFINITIONS.slice(1)
] as const satisfies readonly HomeModuleDefinition[];

const sizeValues = new Set<HomeModuleSize>(HOME_MODULE_SIZE_OPTIONS.map((item) => item.value));
const HOME_MODULE_NAVIGATION_ROUTES = new Set<HomeModuleId>(["news", "topics", "ledger", "todo", "history"]);

export function canShowHomeModuleInNavigation(id: HomeModuleId) {
  return HOME_MODULE_NAVIGATION_ROUTES.has(id);
}

function getDefaultNavigationVisibility(definition: HomeModuleDefinition) {
  return canShowHomeModuleInNavigation(definition.id) && definition.defaultVisible;
}

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

function rangesOverlap(
  firstStart: number,
  firstSpan: number,
  secondStart: number,
  secondSpan: number
) {
  return firstStart < secondStart + secondSpan && secondStart < firstStart + firstSpan;
}

function canPlaceModule(
  occupiedCells: Set<string>,
  columnStart: number,
  rowStart: number,
  columns: number,
  rows: number,
  maxColumns: number
) {
  if (columnStart + columns - 1 > maxColumns) {
    return false;
  }

  for (let row = rowStart; row < rowStart + rows; row += 1) {
    for (let column = columnStart; column < columnStart + columns; column += 1) {
      if (occupiedCells.has(`${row}:${column}`)) {
        return false;
      }
    }
  }

  return true;
}

function occupyModuleCells(
  occupiedCells: Set<string>,
  columnStart: number,
  rowStart: number,
  columns: number,
  rows: number
) {
  for (let row = rowStart; row < rowStart + rows; row += 1) {
    for (let column = columnStart; column < columnStart + columns; column += 1) {
      occupiedCells.add(`${row}:${column}`);
    }
  }
}

export function getHomeModulePlacements(
  layout: readonly HomeModulePreference[],
  maxColumns: number
): HomeModulePlacement[] {
  const visibleLayout = normalizeOrder([...layout]).filter((item) => item.visible);
  const safeMaxColumns = Math.max(1, maxColumns);
  const occupiedCells = new Set<string>();
  const baselinePlacements = visibleLayout.map((item) => {
    const expandedGeometry = getHomeModuleGeometry(item.size, false);
    const columns = Math.min(expandedGeometry.columns, safeMaxColumns);
    let rowStart = 1;
    let columnStart = 1;

    while (true) {
      const nextColumn = Array.from({ length: safeMaxColumns - columns + 1 }, (_, index) => index + 1).find(
        (candidateColumn) =>
          canPlaceModule(occupiedCells, candidateColumn, rowStart, columns, expandedGeometry.rows, safeMaxColumns)
      );

      if (nextColumn) {
        columnStart = nextColumn;
        break;
      }

      rowStart += 1;
    }

    occupyModuleCells(occupiedCells, columnStart, rowStart, columns, expandedGeometry.rows);

    return {
      id: item.id,
      columnStart,
      rowStart,
      columns,
      rows: getHomeModuleGeometry(item.size, item.collapsed).rows,
      expandedRows: expandedGeometry.rows,
      collapsed: item.collapsed
    };
  });

  return baselinePlacements.map((placement) => {
    const upwardOffset = baselinePlacements.reduce((offset, candidate) => {
      if (!candidate.collapsed || candidate.id === placement.id) {
        return offset;
      }

      const collapsedRows = getHomeModuleGeometry(
        visibleLayout.find((item) => item.id === candidate.id)?.size ?? "smaller",
        true
      ).rows;
      const rowDelta = candidate.expandedRows - collapsedRows;
      const isDirectlyBelow = placement.rowStart === candidate.rowStart + candidate.expandedRows;
      const isBelowSameStack = rangesOverlap(
        placement.columnStart,
        placement.columns,
        candidate.columnStart,
        candidate.columns
      );

      return isDirectlyBelow && isBelowSameStack ? offset + rowDelta : offset;
    }, 0);

    return {
      id: placement.id,
      columnStart: placement.columnStart,
      rowStart: Math.max(1, placement.rowStart - upwardOffset),
      columns: placement.columns,
      rows: placement.rows
    };
  });
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
    showInNavigation:
      typeof value.showInNavigation === "boolean"
        ? value.showInNavigation
        : canShowHomeModuleInNavigation(value.id) && (typeof value.visible === "boolean" ? value.visible : false),
    size: legacyStorage
      ? migrateLegacyHomeModuleSize(value.id, value.size)
      : isHomeModuleSize(value.size)
        ? value.size
        : "smaller",
    collapsed: typeof value.collapsed === "boolean" ? value.collapsed : false,
    order: typeof value.order === "number" && Number.isFinite(value.order) ? value.order : fallbackOrder,
    ...(Object.prototype.hasOwnProperty.call(value, "customName") && typeof value.customName === "string"
      ? { customName: value.customName }
      : {})
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
    showInNavigation: getDefaultNavigationVisibility(definition),
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
          showInNavigation: canShowHomeModuleInNavigation(definition.id) && stored.showInNavigation,
          size: stored.size,
          collapsed: stored.collapsed,
          order: stored.order,
          ...(Object.prototype.hasOwnProperty.call(stored, "customName")
            ? { customName: stored.customName }
            : {})
        };
      }

      return {
        id: definition.id,
        visible: false,
        showInNavigation: false,
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
  patch: Partial<Pick<HomeModulePreference, "visible" | "showInNavigation" | "size" | "collapsed" | "customName">>
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
