export type ThemeKind = "color" | "image";

export type ThemeOption = {
  key: string;
  label: string;
  kind: ThemeKind;
};

export const THEME_STORAGE_KEY = "agent-zy-theme";
export const DEFAULT_THEME_KEY = "night";

export const themeOptions = [
  { key: "day", label: "日间", kind: "color" },
  { key: "night", label: "夜间", kind: "color" }
] as const satisfies readonly ThemeOption[];

export type ThemeKey = (typeof themeOptions)[number]["key"];

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type ThemeTarget = {
  dataset: {
    theme?: string;
  };
};

const themeKeySet = new Set<string>(themeOptions.map((theme) => theme.key));

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function isThemeKey(value: string): value is ThemeKey {
  return themeKeySet.has(value);
}

export function getInitialThemeKey(storage: StorageLike | null = getBrowserStorage()): ThemeKey {
  try {
    const storedTheme = storage?.getItem(THEME_STORAGE_KEY);

    if (storedTheme && isThemeKey(storedTheme)) {
      return storedTheme;
    }
  } catch {
    return DEFAULT_THEME_KEY;
  }

  return DEFAULT_THEME_KEY;
}

export function persistTheme(themeKey: ThemeKey, storage: StorageLike | null = getBrowserStorage()) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, themeKey);
  } catch {
    // Theme persistence is non-critical; applying the visual theme should still succeed.
  }
}

export function applyTheme(themeKey: ThemeKey, target: ThemeTarget = document.body) {
  target.dataset.theme = themeKey;
}
