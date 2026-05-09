import {
  canShowHomeModuleInNavigation,
  DEFAULT_HOME_LAYOUT,
  HOME_LAYOUT_STORAGE_KEY,
  HOME_MODULE_DEFINITIONS,
  HOME_MODULE_SIZE_GEOMETRY,
  getDefaultHomeLayout,
  getHomeModuleGeometry,
  getHomeModulePlacements,
  getHomeModulePreviewSize,
  loadHomeLayout,
  moveHomeModule,
  persistHomeLayout,
  resetHomeLayout,
  updateHomeModulePreference
} from "./home-layout";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("home-layout", () => {
  test("defines the default homepage modules in the current dashboard order", () => {
    expect(DEFAULT_HOME_LAYOUT.map((item) => item.id)).toEqual([
      "news",
      "chat",
      "todo",
      "ledger",
      "topics",
      "history"
    ]);
    expect(DEFAULT_HOME_LAYOUT.map((item) => item.size)).toEqual([
      "large",
      "max",
      "medium",
      "small",
      "smaller",
      "smaller"
    ]);
    expect(DEFAULT_HOME_LAYOUT.map((item) => item.visible)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false
    ]);
    expect(DEFAULT_HOME_LAYOUT.map((item) => item.showInNavigation)).toEqual([
      true,
      false,
      true,
      true,
      true,
      false
    ]);
    expect(DEFAULT_HOME_LAYOUT.every((item) => !item.collapsed)).toBe(true);
  });

  test("allows history module to opt into top navigation from manage page", () => {
    expect(canShowHomeModuleInNavigation("history")).toBe(true);
    expect(DEFAULT_HOME_LAYOUT.find((item) => item.id === "history")).toMatchObject({
      visible: false,
      showInNavigation: false
    });
  });

  test("defines fixed homepage size geometry for the approved layout shapes", () => {
    expect(HOME_MODULE_SIZE_GEOMETRY).toEqual({
      max: { columns: 8, rows: 12 },
      large: { columns: 4, rows: 6 },
      medium: { columns: 8, rows: 3 },
      smaller: { columns: 4, rows: 4 },
      small: { columns: 4, rows: 2 }
    });
  });

  test("keeps module width but uses one row when collapsed", () => {
    expect(getHomeModuleGeometry("max", false)).toEqual({ columns: 8, rows: 12 });
    expect(getHomeModuleGeometry("max", true)).toEqual({ columns: 8, rows: 1 });
    expect(getHomeModuleGeometry("large", true)).toEqual({ columns: 4, rows: 1 });
    expect(getHomeModuleGeometry("medium", true)).toEqual({ columns: 8, rows: 1 });
    expect(getHomeModuleGeometry("smaller", true)).toEqual({ columns: 4, rows: 1 });
    expect(getHomeModuleGeometry("small", true)).toEqual({ columns: 4, rows: 1 });
  });

  test("calculates preview dimensions with the same horizontal and vertical unit", () => {
    expect(getHomeModulePreviewSize("smaller", false)).toEqual({ width: 394, height: 394 });
    expect(getHomeModulePreviewSize("large", false)).toEqual({ width: 394, height: 598 });
    expect(getHomeModulePreviewSize("max", false)).toEqual({ width: 802, height: 1210 });
    expect(getHomeModulePreviewSize("medium", true)).toEqual({ width: 802, height: 88 });
  });

  test("collapsing a module only moves modules directly below its baseline position", () => {
    const layout = [
      { id: "news", visible: true, showInNavigation: true, size: "large", collapsed: true, order: 0 },
      { id: "chat", visible: true, showInNavigation: false, size: "max", collapsed: false, order: 1 },
      { id: "todo", visible: true, showInNavigation: true, size: "small", collapsed: false, order: 2 },
      { id: "ledger", visible: true, showInNavigation: true, size: "small", collapsed: false, order: 3 }
    ] as const;

    const placements = getHomeModulePlacements(layout, 12);

    expect(placements.find((item) => item.id === "news")).toMatchObject({
      columnStart: 1,
      rowStart: 1,
      rows: 1
    });
    expect(placements.find((item) => item.id === "todo")).toMatchObject({
      rowStart: 2
    });
    expect(placements.find((item) => item.id === "chat")).toMatchObject({
      columnStart: 5,
      rowStart: 1
    });
    expect(placements.find((item) => item.id === "ledger")).toMatchObject({
      rowStart: 9
    });
  });

  test("persists layout preferences and reloads them from local storage", () => {
    const storage = new MemoryStorage();
    const changed = updateHomeModulePreference(DEFAULT_HOME_LAYOUT, "topics", {
      visible: false,
      showInNavigation: false,
      size: "medium",
      collapsed: true
    });

    persistHomeLayout(changed, storage);

    expect(loadHomeLayout(storage).find((item) => item.id === "topics")).toMatchObject({
      visible: false,
      showInNavigation: false,
      size: "medium",
      collapsed: true
    });
  });

  test("migrates stored layouts without navigation preferences from module visibility", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      HOME_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        layout: [
          { id: "news", visible: true, size: "large", collapsed: false, order: 0 },
          { id: "chat", visible: true, size: "max", collapsed: false, order: 1 },
          { id: "todo", visible: false, size: "medium", collapsed: false, order: 2 }
        ]
      })
    );

    const loaded = loadHomeLayout(storage);

    expect(loaded.find((item) => item.id === "news")).toMatchObject({
      showInNavigation: true
    });
    expect(loaded.find((item) => item.id === "chat")).toMatchObject({
      showInNavigation: false
    });
    expect(loaded.find((item) => item.id === "todo")).toMatchObject({
      showInNavigation: false
    });
  });

  test("migrates legacy four-size storage without inflating old max modules", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      HOME_LAYOUT_STORAGE_KEY,
      JSON.stringify([
        { id: "news", visible: true, size: "max", collapsed: false, order: 0 },
        { id: "chat", visible: true, size: "max", collapsed: false, order: 1 },
        { id: "todo", visible: true, size: "large", collapsed: false, order: 2 },
        { id: "topics", visible: true, size: "medium", collapsed: false, order: 3 },
        { id: "ledger", visible: true, size: "small", collapsed: false, order: 4 }
      ])
    );

    const loaded = loadHomeLayout(storage);

    expect(loaded.find((item) => item.id === "news")).toMatchObject({ size: "large" });
    expect(loaded.find((item) => item.id === "chat")).toMatchObject({ size: "max" });
    expect(loaded.find((item) => item.id === "todo")).toMatchObject({ size: "medium" });
    expect(loaded.find((item) => item.id === "topics")).toMatchObject({ size: "smaller" });
    expect(loaded.find((item) => item.id === "ledger")).toMatchObject({ size: "small" });
  });

  test("keeps future registered modules hidden when merging stored preferences", () => {
    const storage = new MemoryStorage();
    const persisted = DEFAULT_HOME_LAYOUT.filter((item) => item.id !== "ledger");
    const definitions = [
      ...HOME_MODULE_DEFINITIONS,
      {
        id: "future",
        label: "未来模块",
        description: "后续注册模块",
        defaultSize: "medium",
        defaultVisible: true
      }
    ] as const;

    persistHomeLayout(persisted, storage);

    const loaded = loadHomeLayout(storage, definitions);

    expect(loaded.find((item) => item.id === "ledger")).toMatchObject({
      id: "ledger",
      visible: false,
      size: "small"
    });
    expect(loaded.find((item) => item.id === "future")).toMatchObject({
      id: "future",
      visible: false,
      showInNavigation: false,
      size: "medium"
    });
  });

  test("moves modules by id and normalizes their order values", () => {
    const moved = moveHomeModule(DEFAULT_HOME_LAYOUT, "topics", "news");

    expect(moved.map((item) => item.id)).toEqual([
      "topics",
      "news",
      "chat",
      "todo",
      "ledger",
      "history"
    ]);
    expect(moved.map((item) => item.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("resets stored layout back to the default homepage layout", () => {
    const storage = new MemoryStorage();

    persistHomeLayout(
      updateHomeModulePreference(DEFAULT_HOME_LAYOUT, "news", {
        visible: false,
        collapsed: true
      }),
      storage
    );

    const reset = resetHomeLayout(storage);

    expect(storage.getItem(HOME_LAYOUT_STORAGE_KEY)).toBeNull();
    expect(reset).toEqual(getDefaultHomeLayout());
  });
});
