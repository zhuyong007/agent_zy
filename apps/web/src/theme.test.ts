import {
  applyTheme,
  getInitialThemeKey,
  isThemeKey,
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
});
