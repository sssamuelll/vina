/**
 * IndexedDB store for reference image blobs.
 *
 * Design note: blobs are NOT deleted on removeReferenceImage (to support undo).
 * Cleanup is deferred to garbageCollect(), called on NEW_PROJECT / loadProject.
 */

const DB_NAME = 'openclo-reference-images';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

/** Cached DB promise — opened lazily on first call. */
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }
  return dbPromise;
}

/** Store a blob under the given imageId key. Overwrites any existing entry. */
export async function storeImageBlob(imageId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(blob, imageId);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/** Load a blob by imageId. Returns null if not found. */
export async function loadImageBlob(imageId: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(imageId);
    request.onsuccess = (event) => {
      const result = (event.target as IDBRequest<Blob | undefined>).result;
      resolve(result ?? null);
    };
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/** Delete a single blob entry by imageId. No-op if key does not exist. */
export async function removeImageBlob(imageId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(imageId);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/** Clear the entire object store. Used when starting a new project. */
export async function clearAllImageBlobs(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/**
 * Remove any stored blobs whose keys are NOT in activeImageIds.
 * Call this on new project creation or project load to reclaim storage.
 */
export async function garbageCollect(activeImageIds: string[]): Promise<void> {
  const db = await openDb();
  const activeSet = new Set(activeImageIds);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const keysRequest = store.getAllKeys();

    keysRequest.onsuccess = (event) => {
      const keys = (event.target as IDBRequest<IDBValidKey[]>).result;
      for (const key of keys) {
        if (!activeSet.has(key as string)) {
          store.delete(key);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = (txEvent) => reject((txEvent.target as IDBTransaction).error);
    };

    keysRequest.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/**
 * Reset the cached DB promise.
 * ONLY for use in tests — allows each test to get a fresh connection.
 * @internal
 */
export function _resetDbForTesting(): void {
  dbPromise = null;
}
