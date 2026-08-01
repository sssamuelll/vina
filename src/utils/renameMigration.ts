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
    await deleteDB(oldName);
    return;
  }
  const meta = Array.from(old.objectStoreNames).map((name) => {
    const store = old.transaction(name).objectStore(name);
    return { name, keyPath: store.keyPath, autoIncrement: store.autoIncrement };
  });
  const next = await openDB(newName, old.version, {
    upgrade(db) {
      for (const m of meta) {
        if (!db.objectStoreNames.contains(m.name)) {
          db.createObjectStore(m.name, {
            keyPath: m.keyPath ?? undefined,
            autoIncrement: m.autoIncrement,
          });
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
  await deleteDB(oldName);
}

export async function migrateFromOpenClo(): Promise<void> {
  try {
    if (localStorage.getItem(MARKER) !== null) return;
    migrateLocalStorage();
    for (const [o, n] of DB_PAIRS) await cloneDb(o, n);
    localStorage.setItem(MARKER, '1');
  } catch {
    // Storage no disponible o clon fallido: la app arranca igual (variante
    // silent-degradable, E-async-states). Sin marker, el próximo boot reintenta.
  }
}
