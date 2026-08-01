# Rename OpenClo → Vina — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renombrar el producto de OpenClo a Vina en todas las superficies — código, datos persistidos del cliente, formato de archivo, branding visible, tooling, repo de GitHub, deploy e infra — sin perder datos de ningún usuario (María en prod, Samuel en localhost) y sin tocar los documentos históricos.

**Architecture:** El rename se hace por capas ordenadas para que el repo quede verde en cada commit: primero el módulo de migración de datos (patrón BUG-11 `webclo→openclo` ya existente en `webgpuDetect.ts`), después claves de storage + migración cableada en un commit atómico, después identificadores internos, tipos, formato de archivo con compat de lectura, branding, tooling/docs, y al final la infra manual del servidor. Los literales legacy (fuentes de migradores) conservan su valor viejo a propósito.

**Tech Stack:** TypeScript/React/Vite, `idb` (ya instalado) para el clon de IndexedDB, `fake-indexeddb` (ya instalado) para los tests, Git Bash `sed` para los sweeps mecánicos, `gh` CLI para el rename del repo, nginx/certbot en `atrium-aws` para la infra.

## Global Constraints

- **Mapa de casing (aplicar exactamente así):** `OpenClo`/`OpenCLO` → `Vina` · `openclo` (slug: claves, ids, filenames, package) → `vina` · `OPENCLO_` → `VINA_` · `__OPENCLO_` → `__VINA_` · `OpenCloProject` → `VinaProject` · `OpenCloPlugin` → `VinaPlugin` · `parseOpenCloProject(Json)` → `parseVinaProject(Json)` · extensión `.openclo` → `.vina`.
- **Intocables:** `docs/**` completo EXCEPTO `docs/specs/**`, `docs/api/**`, `docs/AGENT_SPEC.md` y `docs/AGENT_USAGE.md` (todo lo demás — reports, plans, superpowers, issues, audits, business, research, OPENCLAW_PATTERNS, etc. — es registro histórico y NO se edita). Tampoco: entradas viejas de `CHANGELOG.md`, historial de git, `package-lock.json` a mano (se regenera con npm).
- **Literales legacy que CONSERVAN el valor viejo** (son la fuente de un migrador): `'openclo-autosave'` (`src/utils/storage.ts:293` + sus tests), `'openclo-saved-poses'` (`src/store/avatarSlice.ts:194`), `'webclo-use-webgpu'` (`src/utils/cloth/gpu/webgpuDetect.ts:24` + su test), los literales `openclo*` dentro de `src/utils/renameMigration.ts` (Task 1), la aceptación de `.openclo` en `projectIO`/`exportTools`/`server` (Task 5) y `normalizeLegacyNSID` (Task 5).
- **Cero cambios en** `crates/xpbd-wasm/` y `public/wasm/` — el solver no lleva marca. No se rebuildeo el WASM.
- **Gates tras CADA task, antes de commit:** `npx tsc -b --noEmit && npm run test && npm run lint`. Nunca `--no-verify`.
- **Persistencia:** toda escritura nueva sigue pasando por `storageSet`/`storageGet` con su comentario de shape inline (regla de CLAUDE.md). La migración de este plan es la única excepción justificada de acceso directo a `localStorage`/`indexedDB` (opera ANTES de que la capa canónica abra la base).
- Deuda conocida que NO se arregla aquí: versiones hardcodeadas desincronizadas (`v0.4.0` en server/pluginLoader, `v0.7.0` en LogoMenu vs `0.11.0` real) — solo se actualiza el número si la línea se toca por el rename.

## Decisiones tomadas (Samuel puede vetar al revisar)

1. **Dominio nuevo:** `vina.sdar.dev` (mismo patrón que el resto del portafolio). El viejo `openclo.sdar.dev` sirve la MISMA app nueva durante un período de gracia (María conserva su IndexedDB por origen) y solo pasa a 301 cuando ella confirme.
2. **`<title>`:** `Vina — Patronaje y simulación 3D` (producto en español per glosario `docs/specs/2026-07-16-ui-copy-es-glosario.md`; ajustable).
3. **Datos:** migración one-shot en boot — localStorage prefijo `openclo*`→`vina*` + clon de las 3 bases IDB. sessionStorage (`openclo-secure-*`) NO se migra: es efímero por diseño (API keys de sesión).
4. **Repo GitHub:** `gh repo rename vina` (GitHub redirige la URL vieja automáticamente; los 23 repos son privados así que no hay forks que romper).
5. **Carpeta local** `D:\Desktop\projects\openclo` → `vina`: OPCIONAL, Task 9, porque rompe la ruta de memoria/sesiones de Claude Code si no se mueve a la vez.

---

### Task 1: Módulo de migración de datos del cliente

**Files:**
- Create: `src/utils/renameMigration.ts`
- Test: `src/utils/__tests__/renameMigration.test.ts`

**Interfaces:**
- Consumes: `openDB`, `deleteDB` de `idb` (dependencia ya instalada).
- Produces: `export async function migrateFromOpenClo(): Promise<void>` — idempotente, nunca lanza. Task 2 la cablea en `main.tsx`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/utils/__tests__/renameMigration.test.ts
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { describe, it, expect, beforeEach } from 'vitest';
import { migrateFromOpenClo } from '../renameMigration';

describe('migrateFromOpenClo', () => {
  beforeEach(() => {
    localStorage.clear();
    // reset total de IndexedDB entre tests
    (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  });

  it('copia claves openclo* a vina* y elimina las viejas', async () => {
    localStorage.setItem('openclo-layout', '{"a":1}');
    localStorage.setItem('openclo_budget', '5');
    localStorage.setItem('otra-cosa', 'x');
    await migrateFromOpenClo();
    expect(localStorage.getItem('vina-layout')).toBe('{"a":1}');
    expect(localStorage.getItem('vina_budget')).toBe('5');
    expect(localStorage.getItem('openclo-layout')).toBeNull();
    expect(localStorage.getItem('otra-cosa')).toBe('x');
  });

  it('respeta las claves excluidas (fuentes de migradores legacy dedicados)', async () => {
    localStorage.setItem('openclo-autosave', 'legacy');
    localStorage.setItem('openclo-saved-poses', 'legacy');
    await migrateFromOpenClo();
    expect(localStorage.getItem('openclo-autosave')).toBe('legacy');
    expect(localStorage.getItem('openclo-saved-poses')).toBe('legacy');
    expect(localStorage.getItem('vina-autosave')).toBeNull();
  });

  it('la clave canónica gana si ya existe (no clobber)', async () => {
    localStorage.setItem('openclo-layout', 'vieja');
    localStorage.setItem('vina-layout', 'nueva');
    await migrateFromOpenClo();
    expect(localStorage.getItem('vina-layout')).toBe('nueva');
    expect(localStorage.getItem('openclo-layout')).toBeNull();
  });

  it('es one-shot: con el marker puesto no vuelve a tocar nada', async () => {
    await migrateFromOpenClo();
    localStorage.setItem('openclo-layout', 'tarde');
    await migrateFromOpenClo();
    expect(localStorage.getItem('vina-layout')).toBeNull();
    expect(localStorage.getItem('openclo-layout')).toBe('tarde');
  });

  it('clona la base IDB openclo → vina (datos + claves con prefijo reescrito) y borra la vieja', async () => {
    const old = await openDB('openclo', 1, {
      upgrade(db) { db.createObjectStore('kv'); },
    });
    await old.put('kv', { v: 1 }, 'openclo:settings:foo');
    await old.put('kv', { v: 2 }, 'proyecto-1');
    old.close();

    await migrateFromOpenClo();

    const nueva = await openDB('vina', 1);
    expect(await nueva.get('kv', 'vina:settings:foo')).toEqual({ v: 1 });
    expect(await nueva.get('kv', 'proyecto-1')).toEqual({ v: 2 });
    nueva.close();

    const dbs = await indexedDB.databases();
    expect(dbs.map(d => d.name)).not.toContain('openclo');
  });

  it('si la base vieja no existía, no deja una base basura creada por el probe', async () => {
    await migrateFromOpenClo();
    const dbs = await indexedDB.databases();
    expect(dbs.map(d => d.name)).not.toContain('openclo');
    expect(dbs.map(d => d.name)).not.toContain('openclo-reference-images');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test -- renameMigration`
Expected: FAIL — `Cannot find module '../renameMigration'`.

- [ ] **Step 3: Implementar el módulo**

```ts
// src/utils/renameMigration.ts
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
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm run test -- renameMigration`
Expected: PASS (6 tests). Si `indexedDB.databases()` no existe en el entorno de test, actualizar el test a `openDB('openclo')` + assert `objectStoreNames.length === 0` — no cambiar la implementación.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint
git add src/utils/renameMigration.ts src/utils/__tests__/renameMigration.test.ts
git commit -m "feat(rename): módulo de migración de datos de cliente OpenClo → Vina"
```

---

### Task 2: Renombrar claves de storage + bases IDB + cablear la migración

Este task es atómico a propósito: renombrar las claves SIN la migración cableada = datos "perdidos" un boot; la migración sin el rename movería claves que el código viejo aún lee.

**Files:**
- Modify (constantes de claves — lista exhaustiva del inventario):
  `src/utils/storage.ts` (`DB_NAME 'openclo'→'vina'`; `LEGACY_AUTOSAVE_KEY` NO se toca; revisar si existe prefijo interno `openclo:settings:` y renombrarlo — `mapKey` del Task 1 cubre los datos ya escritos), `src/utils/import/referenceImageStore.ts` (`DB_NAME`), `src/copilot/action/skills/skillPersistence.ts` (`DB_NAME` + `INSTALLED_SKILLS_KEY`), `src/shortcuts/ShortcutRegistry.ts`, `src/store/layoutSlice.ts`, `src/store/dockSlice.ts`, `src/store/workflowSlice.ts`, `src/components/shell/barPosition.ts`, `src/utils/avatar/avatarLibrary.ts`, `src/components/Viewport3D/tetherFlag.ts`, `src/copilot/teachingContext.ts`, `src/copilot/AgentSettings.tsx`, `src/copilot/debug/debugAPI.ts`, `src/copilot/debug/DebugStore.ts`, `src/copilot/costManager.ts` (prefijo `openclo_usage_` + `openclo_budget`), `src/copilot/memory/ProjectMemory.ts` (`openclo_memory_`), `src/copilot/errorRecovery.ts`, `src/copilot/providers/ollama.ts`, `src/copilot/providers/types.ts`, `src/copilot/providers/secureStorage.ts` (`openclo-secure-` → `vina-secure-`, sessionStorage, sin migración), `src/copilot/preferences/userPreferences.ts`, `src/copilot/plugins/pluginManager.ts`, `src/copilot/plugins/pluginLoader.ts` (`getPluginStorageKey` → `vina_plugins_`), `src/copilot/action/skills/marketplace.ts`, `src/copilot/perception/designLog.ts` (`openclo:designLog` → `vina:designLog`), `src/utils/cloth/gpu/webgpuDetect.ts` (`WEBGPU_FEATURE_FLAG_KEY` → `'vina-use-webgpu'`; el migrador BUG-11 apunta ahora `webclo-use-webgpu` → `vina-use-webgpu`), `src/components/Viewport3D/GarmentSimulation.tsx` (kill-switches `openclo-facepoke-on`, `openclo-seamfill`), `src/utils/cloth/gpu/gpuSolverClient.ts` (`openclo-crossbend`, `openclo-seamscx`), `src/utils/safeStorage.ts` (probe `__openclo_storage_test__`), `src/utils/projectIO.ts` (`QUARANTINE_KEY_PREFIX`; `LEGACY_AUTOSAVE` lee `'openclo-autosave'` — NO tocar ese literal), `src/components/Viewport3D/SimulationStatusOverlay.tsx` (string de UI que menciona la clave), `src/main.tsx` (cableado).
- Modify (tests que hardcodean claves): `dockSlice.test.ts`, `agentSettings.test.ts`, `costManager.test.ts`, `memory.test.ts`, `unifiedBarPosition.test.ts`, `pluginManager.edge.test.ts`, `pluginLoader.test.ts` (`getPluginStorageKey` esperado), `marketplace.edge.test.ts`, `ollama.test.ts`, `avatarLibrary.test.ts`, `storageTelemetry.test.ts`, `errorRecovery.test.ts`, `secureStorage.test.ts`, `userPreferences.test.ts`, `webgpuDetect.test.ts`, `tetherFlag.test.ts`, `useSimulationLifecycle.seamInit.test.tsx`, `storage.test.ts` (línea 184 `openclo:settings:big-blob` → `vina:settings:big-blob`; líneas 85-88 legacy autosave NO se tocan), `tests/e2e/helpers/sim.ts` y todos los specs e2e que seteen/lean estas claves.

**Interfaces:**
- Consumes: `migrateFromOpenClo()` del Task 1.
- Produces: todas las claves canónicas con prefijo `vina`; `WEBGPU_FEATURE_FLAG_KEY === 'vina-use-webgpu'`.

- [ ] **Step 1: Sweep mecánico scoped + restauración de legacy**

```bash
cd /d/Desktop/projects/openclo
# Solo prefijos con separador (no toca .openclo, openclo:bodice, __OPENCLO_, openclo.sdar.dev):
git grep -lE "openclo[-_]" -- src tests cli server ':!src/utils/renameMigration.ts' ':!src/utils/__tests__/renameMigration.test.ts' \
  | xargs sed -i "s/openclo-/vina-/g; s/openclo_/vina_/g; s/__openclo_storage_test__/__vina_storage_test__/g"
sed -i "s/'openclo:designLog'/'vina:designLog'/g" src/copilot/perception/designLog.ts
```

Después del sed, RESTAURAR a mano los literales legacy que el sweep rompió:
- `src/utils/storage.ts` → `const LEGACY_AUTOSAVE_KEY = 'openclo-autosave';` (y el sitio de `projectIO.ts:184` que lo lee).
- `src/utils/__tests__/storage.test.ts:85-88` → fixture `'openclo-autosave'`.
- `src/store/avatarSlice.ts:194` → `const LEGACY_POSES_STORAGE_KEY = 'openclo-saved-poses';`.
- Comentarios históricos de `webgpuDetect.ts` que citan la migración BUG-11 pueden quedar renombrados o reescribirse a "legacy `webclo`/`openclo`" — verificar que `LEGACY_WEBGPU_FEATURE_FLAG_KEY = 'webclo-use-webgpu'` sigue intacto y que su test sigue probando `webclo → (ahora) vina-use-webgpu`.
- `DB_NAME` en `storage.ts` es `'openclo'` sin separador — renombrar a mano a `'vina'`. Igual el store de `skillPersistence` (`openclo_skills_v1` sí cae en el sed) y `referenceImageStore` (`openclo-reference-images` sí cae).

- [ ] **Step 2: Cablear la migración en `main.tsx`**

Envolver el render existente (sin top-level await, para no cambiar el grafo de chunks):

```ts
import { migrateFromOpenClo } from './utils/renameMigration';

migrateFromOpenClo().finally(() => {
  // ...el createRoot(...).render(...) existente se mueve aquí adentro
});
```

> **Enmienda (final review 2026-08-01):** el `.finally()` de arriba resultó insuficiente — los imports ES se hoistean, así que un `import App from './App'` (u otro import estático del árbol) en `main.tsx` evalúa `./store` y compañía ANTES de que corran las sentencias de nivel superior de este archivo, sin importar dónde caiga el `.finally()` en el cuerpo. El fix que se shippeó es partir el archivo: `src/main.tsx` queda con un único import estático (`renameMigration`) y carga el resto de la app (`src/bootstrap.tsx`, con el `createRoot(...).render(...)` de siempre) vía `import('./bootstrap')` dinámico dentro del `.finally()` — así el grafo de la app nunca se evalúa hasta que la migración asienta.

- [ ] **Step 3: Revisar el diff completo**

`git diff` — buscar falsos positivos del sed (prosa en comentarios está bien renombrada; lo único prohibido es tocar los 4 literales legacy y `renameMigration.ts`).

- [ ] **Step 4: Gates**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: PASS. Los tests de `webgpuDetect` validan la cadena `webclo → vina-use-webgpu`; los de `renameMigration` no cambian.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(rename): claves de storage y bases IDB openclo→vina + migración cableada en boot"
```

---

### Task 3: Identificadores internos de runtime (globals, eventos, símbolos)

**Files:**
- Modify: `src/main.tsx` (`__OPENCLO_ERRORS__`, `__OPENCLO_ERROR_COUNT__`), `src/store/index.ts` (`__OPENCLO_STORE__`), `src/components/testScenes/CusickHarness.tsx`, `src/components/Viewport3D/Viewport3D.tsx`, `src/components/Viewport3D/GarmentSimulation.tsx` (`__OPENCLO_CLOTH_MESH__`, `__OPENCLO_THREE__`, `__OPENCLO_FACE_POKE__`, `__OPENCLO_FREEZE_FRAME__`, `__OPENCLO_PENETRATION_COUNT__`), `src/components/Viewport3D/useSimulationLifecycle.ts` (`__OPENCLO_SEAM_DEBUG__`), `src/utils/cloth/penetrationMetric.ts` (`__OPENCLO_COLLISION_MESH__`), `src/utils/cloth/gpu/gpuSolverClient.ts` (`__OPENCLO_GPU_CLIENT__`), `src/utils/cloth/gpu/webgpuDebug.ts` (`__OPENCLO_SHADERS__` + 3 `Symbol.for('openclo.webgpuDebug.*')`), `src/copilot/debug/createDebugBridge.ts` (`__openclo_debug`), eventos `CustomEvent` en `useKeyboardShortcuts.ts`, `EmptyState2D.tsx`, `UnifiedBar.tsx`, `UnifiedBarChat.tsx`, `ConnectionsList.tsx`, `GarmentSimulation.tsx`, `exportTools.ts`, `simulationTools.ts`; `userData.opencloRole` en `Mannequin.tsx`, `AvatarModel.tsx`, `sceneCollector.ts`; `OPENCLO_VERSION` en `pluginLoader.ts`.
- Modify (tests): `webgpuDebug.test.ts`, `EmptyState2D.test.tsx`, `sceneCollector.test.ts`, `tests/e2e/helpers/sim.ts` y todos los specs e2e que lean `__OPENCLO_*__` (`webgpu-maria-replay`, `facepoke-ab`, `seam-gap`, `mesh-grab`, `steam-brush`, etc. — el sed los cubre).

**Interfaces:**
- Produces: globals `__VINA_*__`, eventos `vina:*`, `Symbol.for('vina.webgpuDebug.*')`, `userData.vinaRole`, `VINA_VERSION`.

- [ ] **Step 1: Sweep mecánico**

```bash
cd /d/Desktop/projects/openclo
git grep -l "__OPENCLO_" -- src tests | xargs sed -i "s/__OPENCLO_/__VINA_/g"
git grep -l "__openclo_debug" -- src tests | xargs sed -i "s/__openclo_debug/__vina_debug/g"
git grep -l "OPENCLO_VERSION" -- src | xargs sed -i "s/OPENCLO_VERSION/VINA_VERSION/g"
git grep -l "opencloRole" -- src | xargs sed -i "s/opencloRole/vinaRole/g"
git grep -l "Symbol.for('openclo\." -- src | xargs sed -i "s/Symbol.for('openclo\./Symbol.for('vina./g"
# Eventos: renombrar por nombre explícito para NO tocar NSIDs 'openclo:bodice' (Task 5)
for ev in toggleLayersPanel focusChat provider-config-changed export3d exportObjSequence snapshotSave snapshotRestore snapshotDelete; do
  git grep -l "openclo:$ev" -- src tests | xargs -r sed -i "s/openclo:$ev/vina:$ev/g"
done
```

- [ ] **Step 2: Verificar que no queda ningún evento huérfano**

Run: `git grep -nE "'openclo:[a-zA-Z]" -- src tests`
Expected: solo NSIDs (`openclo:bodice`, `openclo:sleeve`, `openclo:skirt`, `openclo:collar`, `openclo:grading`) — se van en Task 5.

- [ ] **Step 3: Gates**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: PASS (unit). Correr también un spec e2e representativo si hay entorno: `npx playwright test tests/e2e/viewport3d.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(rename): globals __VINA_*, eventos vina:*, símbolos y userData"
```

---

### Task 4: Tipos y funciones exportadas

**Files:**
- Modify: `src/types/types.ts` (`OpenCloProject` → `VinaProject`), `src/utils/projectSchema.ts` (`openCloProjectSchema` → `vinaProjectSchema`, `parseOpenCloProject(Json)` → `parseVinaProject(Json)`), `src/utils/projectValidator.ts`, `src/utils/projectIO.ts`, `src/store/projectSlice.ts`, `src/copilot/plugins/types.ts` (`OpenCloPlugin` → `VinaPlugin`), `pluginRegistry.ts`, `pluginManager.ts`, `pluginLoader.ts`, `plugins/index.ts`, `cli/index.ts:164`, y todos los tests que importan estos nombres (`projectSchema.test.ts`, `projectValidator.test.ts`, `projectSlice.restore.test.ts`, `pluginRegistry*.test.ts`, `pluginManager.edge.test.ts`, `pluginLoader*.test.ts`).

**Interfaces:**
- Produces: `VinaProject`, `VinaPlugin`, `parseVinaProject(input: unknown): ProjectParseResult`, `parseVinaProjectJson(json: string): ProjectParseResult`, `vinaProjectSchema`. Firmas idénticas, solo nombre.

- [ ] **Step 1: Sweep mecánico**

```bash
cd /d/Desktop/projects/openclo
git grep -lE "OpenCloProject|OpenCloPlugin|parseOpenClo|openCloProject" -- src cli tests \
  | xargs sed -i "s/OpenCloProject/VinaProject/g; s/OpenCloPlugin/VinaPlugin/g; s/parseOpenCloProject/parseVinaProject/g; s/openCloProjectSchema/vinaProjectSchema/g"
```

- [ ] **Step 2: Gates (tsc atrapa cualquier referencia perdida)**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(rename): VinaProject, VinaPlugin, parseVinaProject"
```

---

### Task 5: Formato de archivo `.vina` + NSIDs + server local

Compatibilidad hacia atrás obligatoria: los `.openclo` existentes (María, `~/.openclo/projects` del server local) se abren PARA SIEMPRE; solo cambia lo que se escribe.

**Files:**
- Modify: `src/utils/projectIO.ts` (download `.vina`, accept `'.vina,.openclo,.json'`), `src/copilot/action/tools/definitions/exportTools.ts` (`save_project` → `.vina`, descripción bilingüe), `src/copilot/action/skills/coreSkills.ts` (NSIDs `vina:*`), `src/copilot/action/skills/nsid.ts` (+`normalizeLegacyNSID`), `src/copilot/action/skills/skillPersistence.ts` (aplicar normalize al leer), `public/skills-registry.json` (`author: 'vina-community'`), `server/index.ts` (dir `~/.vina` con rename one-shot desde `~/.openclo`, `VINA_PORT` aceptando `OPENCLO_PORT` legacy), `server/api.ts` (dual-read de extensión), `server/copilotBridge.ts` (`CONFIG_PATH` bajo `~/.vina`).
- Test: `src/copilot/action/skills/__tests__/nsid.test.ts` (nuevos casos), tests existentes de nsid/skills actualizados a `vina:*`.

**Interfaces:**
- Produces: `normalizeLegacyNSID(nsid: string): string` en `nsid.ts`; `CORE_SKILLS.BODICE === 'vina:bodice'` etc.

- [ ] **Step 1: Test que falla para el alias legacy de NSID**

```ts
// añadir a src/copilot/action/skills/__tests__/nsid.test.ts
import { normalizeLegacyNSID } from '../nsid';

describe('normalizeLegacyNSID', () => {
  it('mapea autores legacy openclo → vina', () => {
    expect(normalizeLegacyNSID('openclo:bodice')).toBe('vina:bodice');
    expect(normalizeLegacyNSID('openclo-community:pleats')).toBe('vina-community:pleats');
  });
  it('deja intactos los demás autores', () => {
    expect(normalizeLegacyNSID('sdar:stretch_bodice')).toBe('sdar:stretch_bodice');
    expect(normalizeLegacyNSID('vina:bodice')).toBe('vina:bodice');
  });
});
```

Run: `npm run test -- nsid` → FAIL (`normalizeLegacyNSID` no existe).

- [ ] **Step 2: Implementar**

```ts
// src/copilot/action/skills/nsid.ts
/**
 * Alias de lectura para NSIDs persistidos antes del rename a Vina (2026-08-01).
 * Solo remapea el autor; el slug queda igual. Aplicar en TODO punto de lectura
 * de NSIDs persistidos (skillPersistence: preferencias + instalados).
 */
export function normalizeLegacyNSID(nsid: string): string {
  if (nsid.startsWith('openclo:')) return `vina:${nsid.slice('openclo:'.length)}`;
  if (nsid.startsWith('openclo-community:')) return `vina-community:${nsid.slice('openclo-community:'.length)}`;
  return nsid;
}
```

En `skillPersistence.ts`, envolver los puntos de lectura (el valor devuelto por `getPreference` y cada NSID del listado de instalados) con `normalizeLegacyNSID(...)`. En `coreSkills.ts` renombrar los 5 NSIDs a `vina:*`. Sweep del resto de literales `openclo:` en skills:

```bash
git grep -l "openclo:" -- src/copilot/action/skills src/copilot/action/skills/__tests__ | xargs sed -i "s/openclo:/vina:/g"
git grep -l "createNSID('openclo'" -- src | xargs -r sed -i "s/createNSID('openclo'/createNSID('vina'/g"
```
Restaurar después los literales `'openclo:'`/`'openclo-community:'` DENTRO de `normalizeLegacyNSID` y sus tests (el sed los rompe — revisar el diff de `nsid.ts` y `nsid.test.ts`).

- [ ] **Step 3: Extensión `.vina` en cliente**

En `projectIO.ts`: `a.download = (filename || state.name || 'project') + '.vina';` y `input.accept = '.vina,.openclo,.json';` (comentario: `// '.openclo' legacy: se abre para siempre, solo cambió lo que se escribe`). En `exportTools.ts`: los dos sitios `'.openclo'` de `save_project` → `'.vina'`, descripción "Save the current project to a .vina file. / Guardar el proyecto actual en un archivo .vina.".

- [ ] **Step 4: Server local — dual-read + rename de dir**

En `server/index.ts` (antes de crear dirs):

```ts
const HOME = process.env.HOME || process.env.USERPROFILE || '.';
// Migración one-shot del dir de datos: ~/.openclo → ~/.vina (rename entero)
if (!fs.existsSync(path.join(HOME, '.vina')) && fs.existsSync(path.join(HOME, '.openclo'))) {
  fs.renameSync(path.join(HOME, '.openclo'), path.join(HOME, '.vina'));
}
const PORT = parseInt(process.env.VINA_PORT || process.env.OPENCLO_PORT || '7700', 10);
const PROJECTS_DIR = path.join(HOME, '.vina', 'projects');
```

En `server/api.ts`:

```ts
const files = fs.readdirSync(projectsDir).filter(f => f.endsWith('.vina') || f.endsWith('.openclo'));
// lectura: probar `${id}.vina`, caer a `${id}.openclo`
// escritura: siempre `${id}.vina`; si existe `${id}.openclo`, fs.unlinkSync tras escribir
// DELETE: borrar ambas variantes si existen
```

`server/copilotBridge.ts`: `CONFIG_PATH` con `'.vina'` (el rename de dir de arriba ya migró el config).

- [ ] **Step 5: Gates y commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint` → PASS.

```bash
git add -A
git commit -m "feat(rename): formato .vina con lectura legacy .openclo, NSIDs vina:* con alias, server local ~/.vina"
```

---

### Task 6: Repo de GitHub + branding visible + prompts del agente

- [ ] **Step 1: Renombrar el repo PRIMERO (las URLs viejas redirigen, así los links nuevos del paso 2 no quedan rotos)**

```bash
gh repo rename vina --yes
git remote set-url origin git@github.com:sssamuelll/vina.git
git remote -v   # verificar
```

- [ ] **Step 2: UI visible**

- `index.html:7` → `<title>Vina — Patronaje y simulación 3D</title>`.
- `src/components/shell/LogoMenu.tsx`: texto del logo `Vina`; links → `https://github.com/sssamuelll/vina` y `/issues`; `'Acerca de Vina'` con alert `'Vina v0.11.0\nMotor de diseño cognitivo para ingeniería de moda'`.
- `src/components/shell/__tests__/LogoMenu.test.tsx`: `/openclo/i` → `/vina/i`.

- [ ] **Step 3: Exporters (cabeceras y filenames que ven terceros)**

- `'# OpenClo OBJ Export'` → `'# Vina OBJ Export'` en `exportOBJ.ts`, `objExporter.ts` + asserts en `exportOBJ.test.ts`, `objExporter.test.ts`.
- `fbxExporter.ts`: `propS('OpenClo')` → `propS('Vina')`, filename fallback `vina-export`.
- `zprjExport.ts`: `software: 'Vina'`. `gerberExport.ts`: comentario.
- Filenames: `gltfExporter.ts`/`objExporter.ts`/`usdzExporter.ts` fallback `'vina-export'`; `stillExporter.ts` `vina-render-*`/`vina-<view>-*`; `Viewport3D.tsx` `vina-fitmap-*`, `vina-turntable-*`, `` `vina-${timestamp}` ``.

- [ ] **Step 4: Prompts del agente y prosa de src**

`src/copilot/protocol.ts` (docstring + los 2 "You are/inside OpenClo"), `src/copilot/PATRONAJE_SOUL.md` (3 sitios), `src/copilot/llm/conversationManager.ts:119` ("for OpenCLO"), `server/copilotBridge.ts:47` (SYSTEM_PROMPT), `src/copilot/plugins/types.ts` (docstrings + ejemplo `com.openclo.dart-manipulator` → `com.vina.dart-manipulator`), `src/copilot/plugins/sandbox/__tests__/protocol.test.ts` (`com.openclo.test` → `com.vina.test`), `cli/index.ts` (banner/usage `vina ...`), `server/index.ts` (banner `Vina v0.4.0`), y el barrido de comentarios restantes en src (`anchorRoles.ts`, `autoSew/index.ts`, `mesh/*.ts`, `dxf/*.ts`, `teachingContext`, `connections/*`, `solverCapabilities`, `penetrationMetric`, `src/tools/README.md`, etc.):

```bash
git grep -lE "OpenClo|OpenCLO" -- src cli server tests scripts | xargs sed -i "s/OpenCLO/Vina/g; s/OpenClo/Vina/g"
```
Revisar el diff: este sed toca solo prosa/strings a esta altura (los identificadores ya se renombraron en Tasks 2-4). Restaurar cualquier mención histórica tipo "legacy OpenClo" que deba conservarse en comentarios de los migradores (`renameMigration.ts` está excluido de sweeps anteriores pero este lo toca — restaurar sus docstrings si el sed los mangló, o añadir `':!src/utils/renameMigration.ts'` al pathspec).

- [ ] **Step 5: Gates y commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint` → PASS.

```bash
git add -A
git commit -m "feat(rename): branding Vina en UI, exporters, prompts del agente y CLI/server"
```

---

### Task 7: package.json, tooling, docs vivos y gate final de grep

**Files:**
- Modify: `package.json` (`name: "vina"`, `bin: { "vina": ..., "vina-server": ... }`), `eslint.config.js` (plugin `'vina'`, regla `'vina/require-use-disposable'`), `eslint-rules/index.js` + `eslint-rules/rules/require-use-disposable.js` (docs/meta), `.gitignore` (añadir `Vina_Review_*.docx`, conservar `OpenClo_Review_*.docx` — los archivos viejos existen), `.github/workflows/deploy.yml` (name `Deploy Vina`, `/tmp/vina-deploy`, `/var/www/vina` — CI está apagado pero el archivo queda honesto), `README.md`, `CLAUDE.md` (título + menciones), `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `ROADMAP.md`, `docs/specs/**`, `docs/api/**`, `docs/AGENT_SPEC.md`, `docs/AGENT_USAGE.md`, `CHANGELOG.md` (SOLO añadir entrada nueva arriba: `## Unreleased — El proyecto pasa a llamarse Vina (antes OpenClo). Formato .vina (los .openclo se siguen abriendo), claves de datos migradas automáticamente, dominio vina.sdar.dev.`), `scripts/seam-allowance-evidence.mjs`, `scripts/create-roadmap-issues.sh`, `.agents/context/PRODUCT.md`.

- [ ] **Step 1: package.json + lockfile**

Editar `name`/`bin` a mano y regenerar el lock (nunca sed sobre el lock):

```bash
npm install --package-lock-only
```

- [ ] **Step 2: eslint plugin namespace**

`eslint.config.js`: `import vinaPlugin from './eslint-rules/index.js'`, `'vina': vinaPlugin`, `'vina/require-use-disposable': 'warn'`.

- [ ] **Step 3: Sweep de docs vivos**

```bash
git grep -liE "openclo" -- README.md CLAUDE.md AGENTS.md CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md ROADMAP.md docs/specs docs/api docs/AGENT_SPEC.md docs/AGENT_USAGE.md .agents scripts .github \
  | xargs sed -i "s/OpenCLO/Vina/g; s/OpenClo/Vina/g; s/openclo\.sdar\.dev/vina.sdar.dev/g; s|sssamuelll/openclo|sssamuelll/vina|g; s/openclo/vina/g"
```
En `CLAUDE.md`, añadir bajo el título: `> Antes "OpenClo" — renombrado 2026-08-01. Los docs en docs/reports, docs/plans, docs/superpowers, docs/issues y docs/business conservan el nombre viejo a propósito (registro histórico).`

- [ ] **Step 4: Gate final de grep — allowlist de remanentes**

```bash
git grep -ilI openclo -- ':!docs' ':!CHANGELOG.md' ':!package-lock.json' ':!design-handoff'
```
Expected — SOLO estos archivos (todos por literales legacy deliberados):
`src/utils/renameMigration.ts` (+ su test), `src/utils/storage.ts`, `src/utils/__tests__/storage.test.ts`, `src/store/avatarSlice.ts`, `src/utils/projectIO.ts`, `src/copilot/action/tools/definitions/exportTools.ts` (si menciona el accept legacy), `src/copilot/action/skills/nsid.ts` (+ test), `server/index.ts`, `server/api.ts`, `.gitignore`. Cualquier otro archivo en la lista = miss del rename → arreglarlo antes de commitear. (`docs/` y `CHANGELOG` se excluyen por ser histórico; `webgpuDetect.ts` solo debe aparecer si sus comentarios citan la clave legacy — aceptable.)

- [ ] **Step 5: Gates completos y commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint` → PASS.
Run: `npm run build` → PASS (sanity del build de producción antes de la infra).

```bash
git add -A
git commit -m "feat(rename): package vina, eslint namespace, docs vivos y changelog"
```

Merge a `main` vía PR como siempre.

---

### Task 8: Infra en atrium-aws + superficies externas (manual, con Samuel presente)

Secuencia pensada para que María no pierda acceso a sus datos (IndexedDB es por origen: `openclo.sdar.dev` debe seguir sirviendo la app hasta que ella confirme).

- [ ] **Step 1: DNS** — crear `A vina.sdar.dev → 16.192.98.132` donde Samuel gestione la zona de `sdar.dev` (manual, fuera del server).

- [ ] **Step 2: vhost nuevo + cert** (el vhost de openclo proxyea `$anthropic_upstream`/`$openai_upstream` — copiar esos bloques TAL CUAL, el copilot pasa por nginx):

```bash
ssh atrium-aws "sudo cp /etc/nginx/sites-available/openclo.sdar.dev /etc/nginx/sites-available/vina.sdar.dev"
# editar: server_name vina.sdar.dev; root /var/www/vina; conservar bloques /api/anthropic y /api/openai
ssh atrium-aws "sudo ln -s /etc/nginx/sites-available/vina.sdar.dev /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx"
ssh atrium-aws "sudo certbot --nginx -d vina.sdar.dev"
```
(Nombres exactos de los archivos de vhost: verificarlos con `ls /etc/nginx/sites-available/` antes de copiar — la skill servidores no fija el filename.)

- [ ] **Step 3: Deploy del build renombrado** (build SIEMPRE local — 1.9 GB de RAM en el server):

```bash
cd /d/Desktop/projects/openclo && npm run build
tar -C dist -czf - . | ssh atrium-aws "rm -rf /tmp/vina-deploy && mkdir -p /tmp/vina-deploy && tar -C /tmp/vina-deploy -xzf -"
ssh atrium-aws "sudo mkdir -p /var/www/vina && sudo rsync -a --delete /tmp/vina-deploy/ /var/www/vina/ && sudo chown -R www-data:www-data /var/www/vina/"
curl -s -o /dev/null -w "%{http_code}" https://vina.sdar.dev/   # → 200
```

- [ ] **Step 4: Período de gracia en el dominio viejo** — editar el vhost de `openclo.sdar.dev` para que `root /var/www/vina` (misma app nueva; la migración de claves corre en ese origen y María conserva su IDB). `sudo nginx -t && reload`. Verificar `https://openclo.sdar.dev/` → 200 con la app Vina.

- [ ] **Step 5: Avisar a María** — dominio nuevo `vina.sdar.dev`; sus proyectos siguen en `openclo.sdar.dev` (mismo app). Pedirle que exporte/importe sus proyectos al origen nuevo cuando pueda, o que siga en el viejo hasta el corte. SOLO cuando confirme: cambiar el vhost viejo a `return 301 https://vina.sdar.dev$request_uri;` (el 301 corta el acceso a su IndexedDB del origen viejo — no antes).

- [ ] **Step 6: Actualizar las superficies de operación** — skill `servidores` (tabla de dominios + runbook `vina-deploy`/`/var/www/vina`), memoria del proyecto (`MEMORY.md` y archivos que citan `openclo.sdar.dev` o el repo), y Trello: renombrar el board a Vina (board id `699736c47b0d89da403f3af4`; **la lista `notas de maria` no se toca**).

- [ ] **Step 7: Limpieza diferida** — semanas después, cuando nadie use el origen viejo: borrar `/var/www/openclo` y dejar el 301 permanente. No antes.

---

### Task 9 (OPCIONAL — decisión de Samuel): carpeta local del repo

Renombrar `D:\Desktop\projects\openclo` → `D:\Desktop\projects\vina` rompe las rutas de Claude Code (memoria en `C:\Users\simon\.claude\projects\D--Desktop-projects-openclo\`, historial de sesiones) y cualquier skill/atajo que cite la ruta. Si se hace:

- [ ] Cerrar todas las sesiones de Claude Code sobre el repo.
- [ ] `mv /d/Desktop/projects/openclo /d/Desktop/projects/vina`
- [ ] Copiar la memoria: `cp -r C:\Users\simon\.claude\projects\D--Desktop-projects-openclo\memory C:\Users\simon\.claude\projects\D--Desktop-projects-vina\memory` (el dir destino lo crea la primera sesión nueva; verificar el slug exacto que genere).
- [ ] Actualizar la skill `servidores` (runbook cita `/d/Desktop/projects/openclo`) y cualquier otra referencia local.

Si no se hace, nada se rompe: el nombre de la carpeta local no es una superficie del producto.

---

## Self-review (hecho al escribir el plan)

- **Cobertura vs inventario:** las 1.457 apariciones en 334 archivos caen en: claves/DB (Task 2), globals/eventos (Task 3), tipos (Task 4), formato/NSID/server (Task 5), branding/prompts (Task 6), tooling/docs vivos (Task 7), infra (Task 8), o son docs históricos deliberadamente intocados (Global Constraints). El gate de grep del Task 7 Step 4 es la verificación mecánica de que no quedó nada fuera.
- **Trampas cubiertas:** literales legacy restaurados tras cada sed (lista explícita), migración cableada en el mismo commit que el rename de claves, eventos renombrados por nombre para no tocar NSIDs, lockfile regenerado y no sedeado, repo renombrado antes de actualizar los links de LogoMenu, 301 del dominio viejo condicionado a la confirmación de María, bloques proxy de nginx conservados.
- **Consistencia de tipos:** `VinaProject`/`VinaPlugin`/`parseVinaProject` se definen en Task 4 y todos los usos posteriores (Task 5 `projectIO`) usan esos nombres.
