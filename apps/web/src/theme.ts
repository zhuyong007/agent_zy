export type ThemeKind = "color" | "image";

export type ThemeOption = {
  key: string;
  label: string;
  kind: ThemeKind;
};

export type BackgroundImageRecord = {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
};

export const THEME_STORAGE_KEY = "agent-zy-theme";
export const BACKGROUND_GALLERY_STORAGE_KEY = "agent-zy-background-gallery-v1";
export const ACTIVE_BACKGROUND_STORAGE_KEY = "agent-zy-active-background-v1";
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
    backgroundMode?: string;
  };
  style?: {
    setProperty: (name: string, value: string) => void;
    removeProperty: (name: string) => void;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBackgroundImageRecord(value: unknown): value is BackgroundImageRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.dataUrl === "string" &&
    typeof value.createdAt === "string"
  );
}

export function getBackgroundGallery(
  storage: StorageLike | null = getBrowserStorage()
): BackgroundImageRecord[] {
  try {
    const raw = storage?.getItem(BACKGROUND_GALLERY_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter(isBackgroundImageRecord) : [];
  } catch {
    return [];
  }
}

export function persistBackgroundGallery(
  gallery: readonly BackgroundImageRecord[],
  storage: StorageLike | null = getBrowserStorage()
) {
  try {
    storage?.setItem(BACKGROUND_GALLERY_STORAGE_KEY, JSON.stringify(gallery));
  } catch {
    // Background persistence should fail silently so page theming still works.
  }
}

export function getActiveBackgroundId(storage: StorageLike | null = getBrowserStorage()) {
  try {
    const value = storage?.getItem(ACTIVE_BACKGROUND_STORAGE_KEY);

    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function persistActiveBackgroundId(
  backgroundId: string | null,
  storage: StorageLike | null = getBrowserStorage()
) {
  try {
    if (!backgroundId) {
      storage?.setItem(ACTIVE_BACKGROUND_STORAGE_KEY, "");
      return;
    }

    storage?.setItem(ACTIVE_BACKGROUND_STORAGE_KEY, backgroundId);
  } catch {
    // Active background is cosmetic preference and should not block rendering.
  }
}

export function resolveActiveBackground(
  storage: StorageLike | null = getBrowserStorage()
): BackgroundImageRecord | null {
  const activeId = getActiveBackgroundId(storage);

  if (!activeId) {
    return null;
  }

  return getBackgroundGallery(storage).find((item) => item.id === activeId) ?? null;
}

export function deleteBackgroundImage(
  backgroundId: string,
  storage: StorageLike | null = getBrowserStorage()
) {
  const nextGallery = getBackgroundGallery(storage).filter((item) => item.id !== backgroundId);

  persistBackgroundGallery(nextGallery, storage);

  if (getActiveBackgroundId(storage) === backgroundId) {
    persistActiveBackgroundId(null, storage);
  }

  return nextGallery;
}

export function applyBackgroundSelection(
  background: BackgroundImageRecord | null,
  target: ThemeTarget = document.body
) {
  if (background) {
    target.dataset.backgroundMode = "custom";
    target.style?.setProperty("--custom-scene-backdrop", `url("${background.dataUrl}")`);
    return;
  }

  target.dataset.backgroundMode = "default";
  target.style?.removeProperty("--custom-scene-backdrop");
}
