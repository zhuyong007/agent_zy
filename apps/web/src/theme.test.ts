import {
  applyBackgroundSelection,
  applyTheme,
  deleteBackgroundImage,
  getActiveBackgroundId,
  getBackgroundGallery,
  getInitialThemeKey,
  isThemeKey,
  persistActiveBackgroundId,
  persistBackgroundGallery,
  persistTheme,
  resolveActiveBackground,
  themeOptions
} from "./theme";

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

describe("theme", () => {
  test("defines day and night themes for the icon switcher", () => {
    expect(themeOptions).toHaveLength(2);
    expect(themeOptions.filter((theme) => theme.kind === "color")).toHaveLength(2);
    expect(themeOptions.map((theme) => theme.key)).toEqual(["day", "night"]);
    expect(themeOptions).toContainEqual({
      key: "day",
      label: "日间",
      kind: "color"
    });
    expect(themeOptions).toContainEqual({
      key: "night",
      label: "夜间",
      kind: "color"
    });
  });

  test("rejects unknown stored theme keys and falls back to the default theme", () => {
    const storage = new MemoryStorage();

    storage.setItem("agent-zy-theme", "unknown-theme");

    expect(getInitialThemeKey(storage)).toBe("night");
    expect(isThemeKey("unknown-theme")).toBe(false);
  });

  test("persists valid theme selection and applies it to the target dataset", () => {
    const storage = new MemoryStorage();
    const target: { dataset: { theme?: string } } = { dataset: {} };

    persistTheme("day", storage);
    applyTheme("day", target);

    expect(getInitialThemeKey(storage)).toBe("day");
    expect(target.dataset.theme).toBe("day");
  });

  test("persists custom background gallery and resolves the active background", () => {
    const storage = new MemoryStorage();
    const gallery = [
      {
        id: "bg-1",
        name: "studio.png",
        dataUrl: "data:image/png;base64,AAA",
        createdAt: "2026-05-12T08:00:00.000Z"
      },
      {
        id: "bg-2",
        name: "forest.jpg",
        dataUrl: "data:image/jpeg;base64,BBB",
        createdAt: "2026-05-12T09:00:00.000Z"
      }
    ];

    persistBackgroundGallery(gallery, storage);
    persistActiveBackgroundId("bg-2", storage);

    expect(getBackgroundGallery(storage)).toEqual(gallery);
    expect(getActiveBackgroundId(storage)).toBe("bg-2");
    expect(resolveActiveBackground(storage)).toEqual(gallery[1]);
  });

  test("deleting the active background clears the selection and keeps the remaining history", () => {
    const storage = new MemoryStorage();
    const gallery = [
      {
        id: "bg-1",
        name: "studio.png",
        dataUrl: "data:image/png;base64,AAA",
        createdAt: "2026-05-12T08:00:00.000Z"
      },
      {
        id: "bg-2",
        name: "forest.jpg",
        dataUrl: "data:image/jpeg;base64,BBB",
        createdAt: "2026-05-12T09:00:00.000Z"
      }
    ];

    persistBackgroundGallery(gallery, storage);
    persistActiveBackgroundId("bg-2", storage);

    const nextGallery = deleteBackgroundImage("bg-2", storage);

    expect(nextGallery).toEqual([gallery[0]]);
    expect(getBackgroundGallery(storage)).toEqual([gallery[0]]);
    expect(getActiveBackgroundId(storage)).toBeNull();
    expect(resolveActiveBackground(storage)).toBeNull();
  });

  test("applying a selected custom background updates body data and css variables", () => {
    const styleValues = new Map<string, string>();
    const target: {
      dataset: {
        backgroundMode?: string;
      };
      style: {
        setProperty: (name: string, value: string) => void;
        removeProperty: (name: string) => void;
        getPropertyValue: (name: string) => string;
      };
    } = {
      dataset: {},
      style: {
        setProperty(name: string, value: string) {
          styleValues.set(name, value);
        },
        removeProperty(name: string) {
          styleValues.delete(name);
        },
        getPropertyValue(name: string) {
          return styleValues.get(name) ?? "";
        }
      }
    };

    applyBackgroundSelection(
      {
        id: "bg-2",
        name: "forest.jpg",
        dataUrl: "data:image/jpeg;base64,BBB",
        createdAt: "2026-05-12T09:00:00.000Z"
      },
      target
    );

    expect(target.dataset.backgroundMode).toBe("custom");
    expect(target.style.getPropertyValue("--custom-scene-backdrop")).toContain(
      "data:image/jpeg;base64,BBB"
    );

    applyBackgroundSelection(null, target);

    expect(target.dataset.backgroundMode).toBe("default");
    expect(target.style.getPropertyValue("--custom-scene-backdrop")).toBe("");
  });
});
