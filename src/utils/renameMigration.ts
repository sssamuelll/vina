/**
 * Migración one-shot de datos de cliente OpenClo → Vina (2026-08-01).
 *
 * Mismo contrato que migrateLegacyWebGpuFlag (BUG-11, webgpuDetect.ts):
 * idempotente, la clave canónica (vina*) gana si ya existe, la legacy se
 * elimina tras copiar. Corre en main.tsx ANTES de montar la app, para que
 * storage.ts abra ya la base nueva.
 *
 * - localStorage: toda clave `openclo*` → `vina*` (solo el prefijo), salvo
 *   las que un migrador legacy dedicado consume (EXCLUDED).
 * - IndexedDB: clona las 3 bases openclo → vina store a store, reescribiendo
 *   claves string `openclo:*` → `vina:*` (namespace interno de settings),
 *   y borra la base vieja.
 * - sessionStorage NO se migra: 'openclo-secure-*' es efímero por diseño.
 *
 * Acceso directo a localStorage/indexedDB justificado: corre antes de que la
 * capa canónica (storageSet/storageGet) abra la base.
 */
import { openDB, deleteDB } from 'idb';

const MARKER = 'vina-rename-migrated';

// Fuentes de migradores legacy dedicados — esos leen el nombre viejo:
//  - 'openclo-autosave'    → storage.ts (LEGACY_AUTOSAVE_KEY → IDB)
//  - 'openclo-saved-poses' → avatarSlice (LEGACY_POSES_STORAGE_KEY)
const EXCLUDED = new Set(['openclo-autosave', 'openclo-saved-poses']);

const DB_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['openclo', 'vina'],
  ['openclo-reference-images', 'vina-reference-images'],
  ['openclo_skills_v1', 'vina_skills_v1'],
];

function migrateLocalStorage(): void {
  const legacyKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('openclo') && !EXCLUDED.has(k)) legacyKeys.push(k);
  }
  for (const k of legacyKeys) {
    const canonical = 'vina' + k.slice('openclo'.length);
    if (localStorage.getItem(canonical) === null) {
      const v = localStorage.getItem(k);
      if (v !== null) localStorage.setItem(canonical, v);
    }
    localStorage.removeItem(k);
  }
}

function mapKey(k: IDBValidKey): IDBValidKey {
  return typeof k === 'string' && k.startsWith('openclo:')
    ? `vina:${k.slice('openclo:'.length)}`
    : k;
}

async function cloneDb(oldName: string, newName: string): Promise<void> {
  // openDB crea la base si no existe — si el probe la creó vacía, borrarla y salir.
  const old = await openDB(oldName);
  if (old.objectStoreNames.length === 0) {
    old.close();
    // Fire-and-forget: a lingering empty probe-created DB is harmless, and
    // awaiting it can hang the whole migration (and thus app boot) if
    // another tab holds it open (IMPORTANT #2, 2026-08-01 final review).
    void deleteDB(oldName);
    return;
  }
  const meta = Array.from(old.objectStoreNames).map((name) => {
    const store = old.transaction(name).objectStore(name);
    // Preserve indexes too — a clone that drops them silently breaks any
    // `.index()` lookup on the renamed DB (MINOR #5, 2026-08-01 review).
    const indexes = Array.from(store.indexNames).map((indexName) => {
      const index = store.index(indexName);
      return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
    });
    return { name, keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes };
  });
  const next = await openDB(newName, old.version, {
    upgrade(db) {
      for (const m of meta) {
        if (!db.objectStoreNames.contains(m.name)) {
          const store = db.createObjectStore(m.name, {
            keyPath: m.keyPath ?? undefined,
            autoIncrement: m.autoIncrement,
          });
          for (const idx of m.indexes) {
            store.createIndex(idx.name, idx.keyPath, { unique: idx.unique, multiEntry: idx.multiEntry });
          }
        }
      }
    },
  });
  for (const m of meta) {
    const keys = await old.getAllKeys(m.name);
    const vals = await old.getAll(m.name);
    const tx = next.transaction(m.name, 'readwrite');
    for (let i = 0; i < keys.length; i++) {
      const key = mapKey(keys[i]);
      const existing = await tx.store.getKey(m.keyPath ? (keys[i] as IDBValidKey) : key);
      if (existing === undefined) {
        // stores con keyPath llevan la clave dentro del value; out-of-line, explícita
        if (m.keyPath) await tx.store.put(vals[i]);
        else await tx.store.put(vals[i], key);
      }
    }
    await tx.done;
  }
  old.close();
  next.close();
  // Fire-and-forget (not awaited): if another tab still has the old DB open,
  // deleteDB() hangs until that tab closes/navigates — the marker set right
  // after cloneDb() prevents re-cloning regardless, so a lingering old DB is
  // harmless and must not block rendering (IMPORTANT #2, 2026-08-01 review).
  void deleteDB(oldName);
}

export async function migrateFromOpenClo(): Promise<void> {
  try {
    if (localStorage.getItem(MARKER) !== null) return;
    migrateLocalStorage();
    // For fresh users (no legacy DBs at all), skip the cloneDb probe cost —
    // each cloneDb() call opens (and, if empty, creates+deletes) a DB just to
    // check. When indexedDB.databases() is available, list once and only
    // probe names that actually exist (MINOR #6, 2026-08-01 review). Falls
    // back to the current probe-every-name behavior when the API is missing.
    let existing: Set<string> | null = null;
    if (typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      existing = new Set(dbs.map((d) => d.name).filter((n): n is string => Boolean(n)));
    }
    for (const [o, n] of DB_PAIRS) {
      if (existing !== null && !existing.has(o)) continue;
      await cloneDb(o, n);
    }
    localStorage.setItem(MARKER, '1');
  } catch {
    // Storage no disponible o clon fallido: la app arranca igual (variante
    // silent-degradable, E-async-states). Sin marker, el próximo boot reintenta.
  }
}
