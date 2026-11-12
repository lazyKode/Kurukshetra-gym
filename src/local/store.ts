// On-device document store used by the GitHub Pages (offline) build.
// It keeps the same collection/document shape as Firestore, but everything
// lives in this browser's IndexedDB, so the app works with no server at all.

const DB_NAME = "kurukshetra-gym";
const DB_VERSION = 1;
const STORE = "docs";

export type LocalDoc = { id: string; data: Record<string, any> };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Local storage (IndexedDB) is not available in this browser."));
  }
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE);
          // The demo admin identity the admin login form signs in as.
          store.put({ userName: "Admin", isAdmin: true, isForumBlocked: false }, "users/admin001");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open local database."));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
    // Ask the browser not to evict the data under storage pressure (best effort).
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* ignore */
    }
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        let result: T;
        if (request) {
          request.onsuccess = () => {
            result = request.result;
          };
        }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error("Local database error."));
        tx.onabort = () => reject(tx.error ?? new Error("Local database write was aborted."));
      })
  );
}

const key = (collection: string, id: string) => `${collection}/${id}`;

export function newId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function getDoc(collection: string, id: string): Promise<Record<string, any> | undefined> {
  return run<Record<string, any> | undefined>("readonly", (store) => store.get(key(collection, id)));
}

export async function setDoc(collection: string, id: string, data: Record<string, any>): Promise<void> {
  await run("readwrite", (store) => store.put(data, key(collection, id)));
}

/** Merges fields into an existing document; fails if it does not exist (like Firestore update). */
export async function updateDoc(collection: string, id: string, patch: Record<string, any>): Promise<void> {
  const existing = await getDoc(collection, id);
  if (!existing) {
    throw new Error(`No document to update: ${collection}/${id}`);
  }
  await setDoc(collection, id, { ...existing, ...patch });
}

export async function deleteDoc(collection: string, id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(key(collection, id)));
}

export async function listDocs(collection: string): Promise<LocalDoc[]> {
  const prefix = `${collection}/`;
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
  const db = await openDb();
  return new Promise<LocalDoc[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const docs: LocalDoc[] = [];
    const cursorRequest = tx.objectStore(STORE).openCursor(range);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        docs.push({ id: String(cursor.key).slice(prefix.length), data: cursor.value });
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve(docs);
    tx.onerror = () => reject(tx.error ?? new Error("Local database error."));
  });
}

export const toDate = (value: any): Date | undefined => {
  if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
};

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
