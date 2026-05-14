import {
  applyBackgroundSelection,
  applyTheme,
  clearLegacyBackgroundGallery,
  dataUrlToBlob,
  getActiveBackgroundId,
  getBackgroundVisibility,
  getInitialThemeKey,
  getLegacyBackgroundGallery,
  isThemeKey,
  persistActiveBackgroundId,
  persistBackgroundVisibility,
  persistTheme,
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

  test("persists and clears the active background id", () => {
    const storage = new MemoryStorage();

    persistActiveBackgroundId("bg-2", storage);
    expect(getActiveBackgroundId(storage)).toBe("bg-2");

    persistActiveBackgroundId(null, storage);
    expect(getActiveBackgroundId(storage)).toBeNull();
  });

  test("persists background visibility independently from the selected background", () => {
    const storage = new MemoryStorage();

    expect(getBackgroundVisibility(storage)).toBe(true);

    persistBackgroundVisibility(false, storage);
    expect(getBackgroundVisibility(storage)).toBe(false);
    expect(getActiveBackgroundId(storage)).toBeNull();

    persistActiveBackgroundId("bg-2", storage);
    expect(getActiveBackgroundId(storage)).toBe("bg-2");
    expect(getBackgroundVisibility(storage)).toBe(false);

    persistBackgroundVisibility(true, storage);
    expect(getBackgroundVisibility(storage)).toBe(true);
    expect(getActiveBackgroundId(storage)).toBe("bg-2");
  });

  test("reads and clears legacy background gallery metadata from local storage", () => {
    const storage = new MemoryStorage();
    const legacyGallery = [
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

    storage.setItem("agent-zy-background-gallery-v1", JSON.stringify(legacyGallery));

    expect(getLegacyBackgroundGallery(storage)).toEqual(legacyGallery);

    clearLegacyBackgroundGallery(storage);

    expect(getLegacyBackgroundGallery(storage)).toEqual([]);
  });

  test("converts legacy data url images into blobs without changing bytes", async () => {
    const text = "agent-zy";
    const source = `data:text/plain;base64,${Buffer.from(text).toString("base64")}`;
    const blob = await dataUrlToBlob(source);

    expect(blob.size).toBe(text.length);
    expect(await blob.text()).toBe(text);
  });

  test("applying a selected custom background updates body data and css variables", () => {
    const styleValues = new Map<string, string>();
    const target: {
      dataset: {
        backgroundMode?: string;
        backgroundVisibility?: string;
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
        src: "blob:forest",
        createdAt: "2026-05-12T09:00:00.000Z"
      },
      true,
      target
    );

    expect(target.dataset.backgroundMode).toBe("custom");
    expect(target.dataset.backgroundVisibility).toBe("visible");
    expect(target.style.getPropertyValue("--custom-scene-backdrop")).toContain("blob:forest");

    applyBackgroundSelection(
      {
        id: "bg-2",
        name: "forest.jpg",
        src: "blob:forest",
        createdAt: "2026-05-12T09:00:00.000Z"
      },
      false,
      target
    );

    expect(target.dataset.backgroundMode).toBe("default");
    expect(target.dataset.backgroundVisibility).toBe("hidden");
    expect(target.style.getPropertyValue("--custom-scene-backdrop")).toBe("");

    applyBackgroundSelection(null, true, target);

    expect(target.dataset.backgroundMode).toBe("default");
    expect(target.dataset.backgroundVisibility).toBe("visible");
    expect(target.style.getPropertyValue("--custom-scene-backdrop")).toBe("");
  });
});
