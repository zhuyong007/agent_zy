export type ThemeKind = "color" | "image";

export type ThemeOption = {
  key: string;
  label: string;
  kind: ThemeKind;
};

export type BackgroundImageRecord = {
  id: string;
  name: string;
  createdAt: string;
};

export type StoredBackgroundImageRecord = BackgroundImageRecord & {
  blob: Blob;
};

export type BackgroundImageViewRecord = BackgroundImageRecord & {
  src: string;
};

type LegacyBackgroundImageRecord = BackgroundImageRecord & {
  dataUrl: string;
};

export const THEME_STORAGE_KEY = "agent-zy-theme";
export const BACKGROUND_GALLERY_STORAGE_KEY = "agent-zy-background-gallery-v1";
export const ACTIVE_BACKGROUND_STORAGE_KEY = "agent-zy-active-background-v1";
export const DEFAULT_THEME_KEY = "night";

const BACKGROUND_DATABASE_NAME = "agent-zy-background-gallery";
const BACKGROUND_DATABASE_VERSION = 1;
const BACKGROUND_OBJECT_STORE = "backgrounds";

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

function getBrowserIndexedDb(): IDBFactory | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.indexedDB;
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
    typeof value.createdAt === "string"
  );
}

function isLegacyBackgroundImageRecord(value: unknown): value is LegacyBackgroundImageRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.dataUrl === "string"
  );
}

function isStoredBackgroundImageRecord(value: unknown): value is StoredBackgroundImageRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.createdAt === "string" &&
    typeof Blob !== "undefined" &&
    value.blob instanceof Blob
  );
}

function sortBackgroundGallery(gallery: readonly StoredBackgroundImageRecord[]) {
  return [...gallery].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function openBackgroundDatabase(indexedDb: IDBFactory | null = getBrowserIndexedDb()) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!indexedDb) {
      reject(new Error("当前环境不支持本地背景图库"));
      return;
    }

    const request = indexedDb.open(BACKGROUND_DATABASE_NAME, BACKGROUND_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(BACKGROUND_OBJECT_STORE)) {
        database.createObjectStore(BACKGROUND_OBJECT_STORE, {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("背景图库打开失败"));
  });
}

function closeBackgroundDatabase(database: IDBDatabase) {
  database.close();
}

export async function listBackgroundGallery(indexedDb: IDBFactory | null = getBrowserIndexedDb()) {
  const database = await openBackgroundDatabase(indexedDb);

  try {
    return await new Promise<StoredBackgroundImageRecord[]>((resolve, reject) => {
      const transaction = database.transaction(BACKGROUND_OBJECT_STORE, "readonly");
      const store = transaction.objectStore(BACKGROUND_OBJECT_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const records = Array.isArray(request.result)
          ? request.result.filter(isStoredBackgroundImageRecord)
          : [];

        resolve(sortBackgroundGallery(records));
      };
      request.onerror = () => reject(request.error ?? new Error("背景图库读取失败"));
    });
  } finally {
    closeBackgroundDatabase(database);
  }
}

export async function saveBackgroundImage(
  background: StoredBackgroundImageRecord,
  indexedDb: IDBFactory | null = getBrowserIndexedDb()
) {
  const database = await openBackgroundDatabase(indexedDb);

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(BACKGROUND_OBJECT_STORE, "readwrite");
      const store = transaction.objectStore(BACKGROUND_OBJECT_STORE);
      const request = store.put(background);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("背景图保存失败"));
    });
  } finally {
    closeBackgroundDatabase(database);
  }
}

export async function deleteBackgroundImage(
  backgroundId: string,
  indexedDb: IDBFactory | null = getBrowserIndexedDb()
) {
  const database = await openBackgroundDatabase(indexedDb);

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(BACKGROUND_OBJECT_STORE, "readwrite");
      const store = transaction.objectStore(BACKGROUND_OBJECT_STORE);
      const request = store.delete(backgroundId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("背景图删除失败"));
    });
  } finally {
    closeBackgroundDatabase(database);
  }
}

export async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);

  if (!response.ok) {
    throw new Error("旧背景图迁移失败");
  }

  return response.blob();
}

export function getLegacyBackgroundGallery(
  storage: StorageLike | null = getBrowserStorage()
): LegacyBackgroundImageRecord[] {
  try {
    const raw = storage?.getItem(BACKGROUND_GALLERY_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter(isLegacyBackgroundImageRecord) : [];
  } catch {
    return [];
  }
}

export function clearLegacyBackgroundGallery(storage: StorageLike | null = getBrowserStorage()) {
  try {
    storage?.setItem(BACKGROUND_GALLERY_STORAGE_KEY, "[]");
  } catch {
    // Legacy background cache is best-effort cleanup only.
  }
}

export async function migrateLegacyBackgroundGallery(
  storage: StorageLike | null = getBrowserStorage(),
  indexedDb: IDBFactory | null = getBrowserIndexedDb()
) {
  const existingGallery = await listBackgroundGallery(indexedDb);

  if (existingGallery.length > 0) {
    return existingGallery;
  }

  const legacyGallery = getLegacyBackgroundGallery(storage);

  if (legacyGallery.length === 0) {
    return [];
  }

  const migratedGallery = await Promise.all(
    legacyGallery.map(async (background) => ({
      id: background.id,
      name: background.name,
      createdAt: background.createdAt,
      blob: await dataUrlToBlob(background.dataUrl)
    }))
  );

  for (const background of migratedGallery) {
    await saveBackgroundImage(background, indexedDb);
  }

  clearLegacyBackgroundGallery(storage);

  return sortBackgroundGallery(migratedGallery);
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

export function applyBackgroundSelection(
  background: BackgroundImageViewRecord | null,
  target: ThemeTarget = document.body
) {
  if (background) {
    target.dataset.backgroundMode = "custom";
    target.style?.setProperty("--custom-scene-backdrop", `url("${background.src}")`);
    return;
  }

  target.dataset.backgroundMode = "default";
  target.style?.removeProperty("--custom-scene-backdrop");
}
