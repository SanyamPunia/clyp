/**
 * Draft persistence, so a reload does not discard the screenshot.
 *
 * The image goes to IndexedDB rather than localStorage. A data URL of a full
 * page capture runs to tens of megabytes and localStorage caps at roughly five
 * per origin, so large screenshots would throw QuotaExceededError. The style
 * options are a few hundred bytes and stay in localStorage.
 *
 * Every call swallows its errors and reports absence instead. Storage is
 * unavailable in a private window and can be switched off entirely, and
 * neither is a reason to break the editor.
 */

import type { StyleOptions } from "@/types/screenshot";

const DB_NAME = "clyp";
const DB_VERSION = 1;
const STORE = "draft";
const IMAGE_KEY = "image";
const STYLE_KEY = "clyp:style";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;

  try {
    const db = await openDatabase();
    return await new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export function readImage(): Promise<string | null> {
  return withStore<string>("readonly", (store) => store.get(IMAGE_KEY));
}

export async function writeImage(dataUrl: string): Promise<void> {
  await withStore("readwrite", (store) => store.put(dataUrl, IMAGE_KEY));
}

export async function deleteImage(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(IMAGE_KEY));
}

/**
 * Merged over the caller's defaults, so a stored object written by an older
 * build cannot leave a field undefined.
 */
export function readStyle(defaults: StyleOptions): StyleOptions {
  try {
    const raw = localStorage.getItem(STYLE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Partial<StyleOptions>;
    return {
      ...defaults,
      ...parsed,
      imageCorners: { ...defaults.imageCorners, ...parsed.imageCorners },
    };
  } catch {
    return defaults;
  }
}

export function writeStyle(style: StyleOptions): void {
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify(style));
  } catch {
    // Nothing to do. The editor works, the next reload just starts fresh.
  }
}

export function deleteStyle(): void {
  try {
    localStorage.removeItem(STYLE_KEY);
  } catch {
    // See writeStyle.
  }
}
