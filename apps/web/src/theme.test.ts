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
  test("defines color and image themes for the switcher", () => {
    expect(themeOptions.filter((theme) => theme.kind === "color")).toHaveLength(6);
    expect(themeOptions.filter((theme) => theme.kind === "image")).toHaveLength(3);
    expect(themeOptions).toContainEqual({
      key: "midnight-agent",
      label: "夜航",
      kind: "color"
    });
  });

  test("rejects unknown stored theme keys and falls back to the default theme", () => {
    const storage = new MemoryStorage();

    storage.setItem("agent-zy-theme", "unknown-theme");

    expect(getInitialThemeKey(storage)).toBe("midnight-agent");
    expect(isThemeKey("unknown-theme")).toBe(false);
  });

  test("persists valid theme selection and applies it to the target dataset", () => {
    const storage = new MemoryStorage();
    const target: { dataset: { theme?: string } } = { dataset: {} };

    persistTheme("quiet-forest", storage);
    applyTheme("quiet-forest", target);

    expect(getInitialThemeKey(storage)).toBe("quiet-forest");
    expect(target.dataset.theme).toBe("quiet-forest");
  });
});
