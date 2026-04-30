# BUG-10 fix-options — atomicity-less double-write LS + IDB

**Fecha:** 2026-04-30
**Estado:** PROPUESTA (PR draft). Esperando aprobación del canonical antes de implementación.
**Issue:** [#613](https://github.com/sssamuelll/openclo/issues/613)
**Eje futuro relacionado:** B6-state (Persistencia)
**Branch:** `drift/bug-10-fix-options`

> Nota previa requerida según `docs/reports/2026-04-28-drift-fase2-classification.md` § "Aplicación a los 7 bugs prioritarios" — BUG-10 inherentemente toca arquitectura de persistencia (eje B6-state). El propósito de esta nota es asegurar que el fix mínimo de BUG-10 NO pre-empta la decisión arquitectónica que B6-state debe tomar.

---

## 1. Estado actual de persistencia

### 1.1 Hallazgo principal: el canonical Option A ya existe en el codebase

`src/utils/storage.ts:163-178` define:

```typescript
const AUTOSAVE_KEY = 'autosave';
const LEGACY_AUTOSAVE_KEY = 'openclo-autosave';

/** Save project to IndexedDB autosave slot. */
export async function saveProject(project: unknown): Promise<void> {
  await storageSet('projects', AUTOSAVE_KEY, project);
}

/** Load project from IndexedDB autosave slot. Migrates from localStorage if needed. */
export async function loadProject(): Promise<unknown | undefined> {
  const existing = await storageGet('projects', AUTOSAVE_KEY);
  if (existing) return existing;
  return migrateFromLocalStorage(LEGACY_AUTOSAVE_KEY, 'projects', AUTOSAVE_KEY);
}
```

Ese es el patrón canonical para BUG-10:

- **Write side** = IDB-primary, LS no se toca.
- **Read side** = IDB primero, fallback a `migrateFromLocalStorage()` helper que mueve LS legacy → IDB y devuelve el valor.
- Helper `migrateFromLocalStorage` ya existe y es reusable para los otros sites.

Confianza alta en que este es el canonical correcto: introducido junto con la migración LS → IDB original (commit 4f6f5fa, 2026-02-23) y nunca fue propuesto como temporal o transicional.

### 1.2 Doble inventario greppable

**Writers a localStorage (production, no tests):** ver Sec 2 tabla. Total relevante: 8 keys con par IDB.

**Writers a IndexedDB (production, vía `storageSet` o `indexedDB.open` directo):**

- `storageSet('projects', 'autosave', ...)` — `storage.ts:165` (canonical, sin par LS)
- `storageSet('settings', 'agent-config', ...)` — `CopilotPanel.tsx:43` (con par LS)
- `storageSet('settings', 'fallback-provider', ...)` — `errorRecovery.ts:356, 415` (con par LS)
- `storageSet('settings', 'ollama-config', ...)` — `ollama.ts:65` (con par LS)
- `storageSet('settings', 'provider-config', ...)` — `providers/types.ts:218` (con par LS)
- `storageSet('settings', idbKey(projectId), ...)` — `ProjectMemory.ts:172, 199` (sin par LS — API funcional separada por diseño, ver Sec 9)
- `storageSet('plugins', 'installed', ...)` — `pluginManager.ts:92` (con par LS)
- `storageSet('plugins', 'plugin:${pluginId}', ...)` — `pluginLoader.ts:462` (con par LS)
- `storageSet('avatars', 'saved-poses', ...)` — `avatarSlice.ts:207` (con par LS)
- `storageSet('avatars', 'profiles', ...)` — `avatarLibrary.ts:228, 234` (con par LS)
- `indexedDB.open(...)` directo — `skillPersistence.ts:39`, `referenceImageStore.ts:18` (DBs propios, fuera de la abstracción `storage.ts`; fuera de scope BUG-10)

### 1.3 Schema y versionado

- **Zod schemas existen** para project (`src/utils/projectSchema.ts`) y avatar profiles (`avatarLibrary.ts:79-100` con `ProfileSchema` + `MeasurementsSchema`).
- **No hay campo `version` explícito** en ninguno de los shapes persistidos del scope BUG-10 (poses, profiles, agent-config, plugins, configs). `updatedAt` timestamps existen en algunos pero no como discriminador de schema version.
- **Helper `migrateFromLocalStorage`** existe en `storage.ts` y maneja la transición LS → IDB sin requerir versionado de schema (asume shape estable).

---

## 2. Sites del double-write

8 sites verificados con shape idéntico: **LS-sync write** (`safeSetItem` o `localStorage.setItem` directo) **+ IDB-async fire-and-forget** (`import('../../utils/storage').then(({ storageSet }) => storageSet(...))`). Cada writer entry escribe la misma data lógica a ambos backends sin coordinación transaccional.

| # | Data | LS site | IDB site | Origin commit | Fecha |
|---|---|---|---|---|---|
| 1 | agent-config | `CopilotPanel.tsx:44` | `CopilotPanel.tsx:43` | `4f6f5fa` | 2026-02-23 |
| 2 | saved-poses | `avatarSlice.ts:209` | `avatarSlice.ts:207` | `4f6f5fa` | 2026-02-23 |
| 3 | avatar profiles | `avatarLibrary.ts:229, 235` | `avatarLibrary.ts:228, 234` | `4f6f5fa` | 2026-02-23 |
| 4 | per-plugin storage | `pluginLoader.ts:463` | `pluginLoader.ts:462` | `4f6f5fa` | 2026-02-23 |
| 5 | provider-config | `providers/types.ts:219` | `providers/types.ts:218` | `4a115f73` | 2026-03-02 |
| 6 | fallback-provider | `errorRecovery.ts:345, 417` | `errorRecovery.ts:350, 415` | `84c9d18a` / `e2e66212` | 2026-03-23/24 |
| 7 | installed plugins | `pluginManager.ts:93` | `pluginManager.ts:92` | `e2e66212` | 2026-03-24 |
| 8 | ollama-config | `ollama.ts:66` | `ollama.ts:65` | `e2e66212` | 2026-03-24 |

### 2.1 Tres oleadas de drift acumulado, no un commit aislado

Los 8 sites se introdujeron en **4 commits distintos a lo largo de un mes**, todos posteriores al commit que introdujo el canonical:

- **Oleada 1 — 2026-02-23 (`4f6f5fa`)**: `feat: #10 migrate persistence from localStorage to IndexedDB`. Introduce 4 sites de double-write **junto con el canonical `saveProject`** en el mismo commit. Comentario inline en `avatarSlice.ts:205`: `// Write to both IndexedDB and localStorage (for sync access)`. La intención original era backward compat durante la migración.
- **Oleada 2 — 2026-03-02 (`4a115f73`)**: `feat(copilot): migrate API keys to SecureStorage`. Añade provider-config copy-pasteando el shape double-write en vez de adoptar canonical (que existía hace 7 días).
- **Oleada 3 — 2026-03-23 (`84c9d18a`) y 2026-03-24 (`e2e66212`)**: `fix(security): address review feedback…` y `fix: replace silent localStorage catches with safeStorage wrapper`. Añaden 3 sites más (errorRecovery IDB, ollama-config, pluginManager) con shape double-write. El segundo commit explícitamente "wrappea" `localStorage.setItem` con `safeSetItem` — refinó el shape sin convertir a canonical.

**Conclusión:** el canonical existió desde 2026-02-23 pero no se propagó. Tres commits posteriores duplicaron el patrón LS+IDB en vez de adoptarlo. Esto refuerza la necesidad de adopción uniforme + documentación explícita del canonical (este doc + comentario en `storage.ts`) para evitar oleada 4.

### 2.2 Failure modes per site

Todos los 8 sites comparten el mismo shape de race:

- **LS write succeeds, IDB write fails (quota, IDB unavailable, dynamic import network error)** → próxima lectura sync ve LS actualizado, próxima lectura async ve IDB stale; la UI puede leer una de las dos según el path de carga.
- **LS write fails (quota, Safari private mode), IDB write succeeds** → datos persistidos en IDB pero el caller asume sync write ok porque `safeSetItem` swallowed el error; UI inmediato lee `null`/default sync, IDB tiene la data correcta.
- **Sin coordinación**: la escritura IDB usa dynamic import + `.then(...).catch(() => {})` (errorRecovery, pluginLoader, pluginManager, ollama, providers/types) o `import().then(...)` sin `.catch` (avatarSlice, avatarLibrary, CopilotPanel). Errores en escritura IDB son silently swallowed o producen `console.warn` en stderr — no son surfaced a la UI ni al usuario.

---

## 3. Opciones de migración

> Estas son **opciones de migración**, no de arquitectura. La arquitectura ya está decidida (canonical Option A existe en `storage.ts:163-178`). El espacio de decisión abierto es **cómo migrar los 8 sites a ese canonical**.

### Opción A — Adoptar canonical uniformemente (RECOMENDADA)

**Propuesta:** cada uno de los 8 sites pasa a usar `storageSet('store', key, value)` IDB-only en write side; lecturas migran a `storageGet` con fallback a `migrateFromLocalStorage(legacyLSKey, store, key)` para handover one-time desde LS legacy.

**Pros:**
- Ratifica + extiende el canonical existente. Cero arquitectura nueva.
- Elimina la race condition por construcción (single write target).
- Helper `migrateFromLocalStorage` ya existe — read-side migration es 1 línea por site.
- Mismo comportamiento para usuarios con LS legacy: la primera lectura post-deploy hace handover, escrituras siguientes van solo a IDB.
- Si B6-state Fase 2 después decide que el canonical necesita extension (versionado, multi-store transactions, zod parsing en boundary), los 8 sites migran de v1 canonical a v2 canonical con un commit barato — todos están alineados.

**Contras:**
- Requiere que cada caller tolere lectura async donde antes la lectura era sync (ej. CopilotPanel mount). Para sites con uso sync inmediato, la adopción puede requerir un loading state UI breve durante la migración. Mitigation: `migrateFromLocalStorage` es rápido (single LS read + IDB write); en práctica no agrega latencia perceptible.
- Pequeña cantidad de código de migración one-time que puede borrarse después de N releases (cuando se asume que no quedan usuarios con la versión legacy).

**Migration path por site:**

1. Sustituir `safeSetItem(LS_KEY, JSON.stringify(value))` + `import('storage').then(({ storageSet }) => storageSet(store, key, value))` por `await storageSet(store, key, value)`.
2. Sustituir read side `safeGetItem(LS_KEY)` por `(await storageGet(store, key)) ?? (await migrateFromLocalStorage(LS_KEY, store, key))` (o equivalente según signature actual del helper).
3. Si caller era sync, convertir a async (con loading state si aplica) o mover el read a init phase async.

**Tamaño estimado:** S–M. Por site: ~10–30 líneas modificadas + 1–3 lecturas migradas. Total: 8 sites × ~20 líneas promedio ≈ 160 líneas, en 5–8 archivos.

**Tests:** cada site debe tener un test de roundtrip (write → read returns same value) + un test de migration (LS legacy populated → first read migrates to IDB → second read goes through IDB).

### Opción B — Extender canonical antes de adoptar

**Propuesta:** agregar schema versioning, multi-store transaction wrapper, o zod parsing en boundary AL canonical, después adoptarlo en los 8 sites con la versión extendida.

**Pros:**
- Si B6-state Fase 2 va a pedir versionado de schemas (probable per `projectSchema.ts` precedent), tener el canonical ya extendido ahorra una segunda migración.

**Contras:**
- **Pre-empta B6-state**. La decisión sobre si el canonical necesita versionado es precisamente lo que B6-state Fase 2 debe decidir (ver Sec 5). BUG-10 inventando esa decisión sin que el eje formal haya pasado por su review es exactamente el patrón anti-cobarde que el audit busca evitar.
- Acopla BUG-10 a B6-state Fase 2. BUG-10 deja de ser fix puntual, se vuelve sub-track de B6-state. Eso bloquea cierre de BUG-10 hasta que B6-state corra (no inmediato).
- El argumento pro (segunda migración) es débil: si el canonical necesita extension a v2, los 8 sites alineados en v1 migran trivialmente (mismo helper, nuevo schema). El costo es bajo y diferible.

**Recomendación:** **descartar**. Si B6-state después decide que el canonical necesita extension, los 8 sites pasan de v1 a v2 con un commit por feature. Ese costo diferido es menor al costo de bloquear BUG-10 ahora.

### Opción C — Migración per-site con criterio case-by-case

**Propuesta:** evaluar cada site y decidir individualmente si migrar a canonical, dejar LS-only, o aplicar variante. Por ejemplo: agent-config y poses adoptan canonical; provider-config queda LS-only por su tamaño pequeño; plugins quedan double-write porque "se accede en sync".

**Pros:**
- Permite optimizaciones locales por shape de data (small-sync vs large-async).

**Contras:**
- **Ratificación inconsistente**. El shape del bug es uniforme (los 8 sites tienen la misma race condition), separar el fix por criterio editorial reproduce el smell que motivó cubrir 8 vs 6 vs 3 en el conteo (ver Sec 2.1 — el drift acumuló justamente porque cada commit decidió per-site sin canonical uniforme).
- **Pre-empta B6-state** desde el otro lado: la decisión "este site queda LS-only por shape de data" es exactamente shape-based separation, decisión arquitectónica que B6-state debe ratificar para *todos* los datos persistidos, no para 1–2 puntuales.
- Genera 8 micro-decisiones que individualmente pueden ser razonables pero juntas crean un sistema sin política única.

**Recomendación:** **descartar**. Si B6-state después decide que ciertos shapes deberían quedar LS-only (small/sync metadata vs large/async project data), la migración a esa política es un commit por site partiendo del canonical adoptado uniformemente — más limpio que partir de 8 micro-políticas heterogéneas.

---

## 4. Recomendación

**Adoptar Opción A.** Confianza **alta**.

Razones que sostienen la confianza alta:

1. **El canonical ya existe en el codebase** (`storage.ts:163-178`). No es propuesta, es ratificación.
2. **El helper de migración ya existe** (`migrateFromLocalStorage`). No requiere nueva infra.
3. **Los 8 sites tienen shape idéntico**, verificado por grep + git blame. La adopción uniforme no requiere decisiones per-site.
4. **Las extensiones plausibles del canonical (versionado, zod boundary) son diferibles** — su costo si se materializan es bajo (commit incremental por feature), y son parte del scope explícito de B6-state Fase 2.
5. **Las tres oleadas históricas de drift** (Sec 2.1) son evidencia de que el canonical existía pero no fue documentado/codificado lo suficiente para frenar copy-paste del patrón viejo. Esta nota + la adopción uniforme + un comentario en `storage.ts` apuntando a este doc cierran ese gap.

Esta no es deferral cobarde — es ratificación + extensión coherente del canonical existente. La arquitectura está decidida; lo abierto es la migration path, y Opción A es la única migration path consistente con el canonical sin pre-empt B6-state.

---

## 5. Preguntas para B6-state Fase 2

Estas son las preguntas que la nota deja **explícitamente abiertas** para B6-state Fase 2 absorber sin re-investigación. Distintas de las preguntas que el fix de BUG-10 necesita decidir (que están todas resueltas en favor de Opción A).

### 5.1 Preguntas sobre el canonical actual

- **¿El canonical actual (IDB-only via `storageSet`, sin schema versioning, sin multi-store transactions) es suficiente para todos los datos persistidos del proyecto, o necesita extension?**
  - Sub-pregunta: ¿zod parsing en boundary (precedente `projectSchema.ts`) se aplica a todas las lecturas IDB, o solo a project import/export desde JSON files?
  - Sub-pregunta: ¿hay casos donde se requiere transaccionalidad cross-store (ej. update poses + profile coupled)?
  - Sub-pregunta: ¿schema versioning con migrations es requerido (precedente Cantidad de schemas en `projectSchema.ts` que cambiarán con feature evolution)?

### 5.2 Preguntas sobre alcance del canonical

- **¿La política IDB-primary es canonical para *todos* los datos persistidos del proyecto, o solo para large/async data?**
  - Hay casos donde LS-only es deliberado (ej. `projectIO.ts:155 quarantine` para Safari private mode resilience — la quarantine *requiere* funcionar incluso si IDB está caído porque es el último-recurso de recovery). B6-state debe ratificar esos casos como excepción explícita.
  - Hay casos LS-only por convención evolutiva (ProjectMemory class API, DesignLogManager — ver Sec 9). B6-state decide si se migran a canonical o se ratifican como excepciones documentadas.

### 5.3 Preguntas sobre boundary parsing

- **¿zod schemas se aplican a IDB read boundary?** Hoy `projectSchema.ts` se aplica a JSON file imports; `avatarLibrary.ts` aplica `ProfileSchema` en algunas rutas. La política uniforme de "parse on read from any persistence boundary" es una decisión de arquitectura que B6-state puede ratificar/extender.

---

## 6. Lo que la nota NO decide

Explícito para evitar pre-empt:

- **Schema versioning.** Si el canonical necesita `version: number`, esa decisión es B6-state. BUG-10 fix usa shape sin versionado (consistent con canonical actual `saveProject`).
- **Política global de persistencia.** Si IDB-only es canonical para todos los datos, o si small/sync metadata queda LS-only, es B6-state. BUG-10 migra los 8 sites de double-write a canonical actual; los 3 LS-only legitimate (Sec 9) quedan tal cual hasta que B6-state decida.
- **zod boundary parsing**. BUG-10 no agrega zod parsing en lecturas de los 8 sites (no las quita tampoco — donde existe se preserva). B6-state decide la política uniforme.
- **Multi-store transactions / atomicity cross-key.** No existe hoy en canonical, BUG-10 no lo agrega. Si se necesita, es B6-state.
- **Eliminación del migration code.** El `migrateFromLocalStorage` permanece después del fix. La eliminación post-N-releases es decisión de mantenimiento, no de arquitectura.

---

## 7. Plan de implementación (post-aprobación de canonical)

Branch: `drift/bug-10-fix` (separada de la branch de esta nota).

Commits atómicos, uno por archivo o por par de sites coupled:

1. **`fix(persistence): adopt IDB canonical for agent-config (BUG-10)`** — `CopilotPanel.tsx`.
2. **`fix(persistence): adopt IDB canonical for saved-poses (BUG-10)`** — `avatarSlice.ts`.
3. **`fix(persistence): adopt IDB canonical for avatar profiles (BUG-10)`** — `avatarLibrary.ts`.
4. **`fix(persistence): adopt IDB canonical for per-plugin storage (BUG-10)`** — `pluginLoader.ts`.
5. **`fix(persistence): adopt IDB canonical for installed plugins list (BUG-10)`** — `pluginManager.ts`.
6. **`fix(persistence): adopt IDB canonical for provider-config (BUG-10)`** — `providers/types.ts`.
7. **`fix(persistence): adopt IDB canonical for ollama-config (BUG-10)`** — `ollama.ts`.
8. **`fix(persistence): adopt IDB canonical for fallback-provider (BUG-10)`** — `errorRecovery.ts`.

Sites en mismo archivo coupled (errorRecovery tiene 4 lines = 2 pares; avatarLibrary tiene 4 lines = 2 pares en mismas funciones) van en mismo commit del archivo.

Cada commit pasa gates antes del siguiente: `npx tsc -b --noEmit && npx eslint --max-warnings=0 <files> && npx vitest run <relevant>`.

Adicional commit final: **`docs(persistence): document canonical pattern in storage.ts`** — comentario inline en `storage.ts:163` apuntando a este doc + breve descripción del pattern. Cierra el gap que permitió las 3 oleadas históricas.

Tests por site: roundtrip (write → read returns same value) + migration (LS legacy populated → first read migrates → second read goes IDB).

---

## 8. Comportamiento idéntico antes/después (excepto la race condition fixed)

Invariante audit: el fix preserva comportamiento observable excepto el bug específico.

- **Datos persistidos pre-fix** (LS legacy populated por usuarios existentes) son leídos correctamente post-fix vía `migrateFromLocalStorage`.
- **Estructura de los datos** no cambia (no hay schema migration; mismo shape JSON pre/post).
- **Latencia de write** baja (de write-LS-sync + write-IDB-async fire-and-forget a write-IDB-async único). La race se elimina; el IDB write debe esperarse en lugar de fire-and-forget — los callers que asumían sync ahora son async (ver Sec 7 commit-by-commit handling).
- **Latencia de read first-time post-deploy** sube ligeramente (LS read + IDB write para migrate, una sola vez por usuario). Nulo después.
- **Errores en write** ahora se surfaceaban silently (quota exceeded en LS, IDB unavailable) — post-fix se surface explicitly via async error path en cada site, lo cual es mejora (caller puede mostrar toast). Esta es una mejora colateral del fix; no es feature change.

---

## 9. Out of scope BUG-10 — captured para B6-state Fase 2

Sites LS-only adyacentes que **no son double-writes** y por tanto fuera del scope strict de BUG-10. Se capturan acá explícitamente para evitar re-investigación cuando B6-state Fase 2 arranque.

| Site | Por qué LS-only hoy | Decisión diferida a B6-state |
|---|---|---|
| `ProjectMemory.ts:86` (`ProjectMemory.save()`) | Class API explícita y deliberada — el file header documenta el split: "Class-based API (ProjectMemory) for session-level message history + decisions. Stored in localStorage for synchronous access from CopilotPanel." vs functional API IDB-async. Los dos shapes son distintos (CopilotMessage[] + decisions vs CopilotDecision[] + preferences + notes). | ¿La duplicación class-LS-sync vs functional-IDB-async es legítima por uso (sync access from CopilotPanel mount) o se debería migrar todo a IDB con loading state? ¿Se mantiene el split intencional o se unifica? |
| `designLog.ts:325` (`DesignLogManager.save()`) | Per-project design log. Usa `localStorage.setItem` directo (sin wrapper `safeSetItem`). Sin par IDB. | ¿Migrar a IDB usando canonical? ¿Adoptar `safeSetItem` antes/después de migration? ¿Mismo store ('settings') o store dedicado? |
| `projectIO.ts:155` (quarantine) | Deliberadamente LS-only — quarantine de project loads que fallaron parse. Comentario inline: `// localStorage may be unavailable (Safari private mode, quota exceeded); we already lost the chance to recover but parse error is logged by caller`. La quarantine es last-resort recovery; debe funcionar incluso si IDB está caído. | Ratificar como excepción explícita en política B6-state. Lista de excepciones LS-only legitimate (quarantine + cualquier otra que B6-state identifique). |

**`PluginBridge.ts:622`** (sandbox plugin storage) queda **explícitamente fuera de cualquier eje del audit** — es boundary de aislamiento de plugins, comportamiento intencional para que plugins no compartan storage con app principal. Mencionado solo para evitar re-encontrarlo en sweeps futuros.

**Sin issues separadas para los 3 LS-only adyacentes.** Su actionability depende de B6-state Fase 2 decidir policy (canonical IDB-only para todo, o shape-based separation con LS-only legitimate). Abrir issues ahora forzaría decisiones prematuras. Esta nota es el artifact que B6-state Fase 2 lee para tomar las 3 decisiones cuando arranque.

### 9.1 Cache pattern emergente durante implementación (input para B6-state)

Durante la migración (commits 5 y 7 del PR de implementación), 2 sitios requirieron un **module-level cache** para preservar la sync API mientras se adopta la canonical IDB:

| Site | Cache símbolo | Por qué cache | Sync caller(s) que lo justifican |
|---|---|---|---|
| `pluginManager.ts` | `installedCache` | Sync API contract (install → enable → list en mismo flow sync de tests + handlers) | `installPluginFromManifest`, `listInstalledPlugins`, `enablePlugin`/`disablePlugin` |
| `providers/ollama.ts` | `ollamaConfigCache` | Sync API contract — `loadOllamaConfig()` se llama en render de `AgentSettings` | `AgentSettings.tsx:108` (render-time read) |

**Failure modes que el cache pattern preserva** (commented inline en cada símbolo):

- **Order-dependent staleness**: si la sync `loadX()` corre antes que la async `loadXAsync()` en una sesión, el cache lazy-init lee LS legacy. La hidratación async reconcilia solo si corre y si IDB tiene data.
- **Silent IDB write failure**: `saveX` dispara la escritura IDB con `.catch(() => {})`; escrituras fallidas dejan cache e IDB diverged silently. Mismo failure class que el canonical eliminó para los 6 sitios sin cache; preservado intencionalmente para mantener el sync API contract.

**Pregunta para B6-state Fase 2**: ¿la sync API para estos stores stays como cache-shadowing (preserva contrato actual, mantiene los 2 failure modes documentados), o migra a async-only con loading state en los componentes consumidores (`AgentSettings`, plugin handlers)? La decisión interactúa con la política global de async-states — si B6-state ratifica cache-shadowing como excepción legítima, los 2 sitios stay; si ratifica async-only, ambos requieren refactor de sus consumers sync.

### 9.2 Pattern emergente — pure function thread-by-reducer (input para B6-state)

`avatarLibrary.saveProfile(profile, current) → next` y `deleteProfile(id, current) → next` cambiaron durante esta migración de mutation con LS round-trip a **pure function list-in/list-out**. El reducer Redux (`addProfile`, `updateProfile`, `deleteProfile` en `avatarSlice`) thread `state.avatarProfiles` como `current`, asigna el resultado a `state.avatarProfiles`, y la función pura dispara la persistencia IDB fire-and-forget como side effect.

Beneficios observables:
- Sin LS round-trip dentro del reducer.
- Lógica testeable sin mockear storage (los tests post-migration en `avatarLibrary.test.ts` ya no necesitan `localStorage` mock para verificar la lógica de upsert/delete; solo verifican el list-in/list-out shape).
- Composable (cualquier reducer puede usar el helper sin acoplamiento a un storage backend específico).

Cuando B6-state Fase 2 evalúe migraciones similares (workflowSlice, userPreferences, otros library helpers consumidos por reducers Redux), este shape change es **candidate canonical para "library helpers consumidos por reducers Redux"**. La ratificación o el descarte queda para B6-state.

---

## 10. Cross-references

- **Issue:** [#613](https://github.com/sssamuelll/openclo/issues/613)
- **Eje futuro:** B6-state (Persistencia) — `docs/reports/2026-04-28-drift-fase2-classification.md` § (b) Decisión producto/arq.
- **Canonical actual:** `src/utils/storage.ts:163-178` (`saveProject`/`loadProject`/`migrateFromLocalStorage`).
- **Origin commits del double-write:** `4f6f5fa` (2026-02-23), `4a115f73` (2026-03-02), `84c9d18a` (2026-03-23), `e2e66212` (2026-03-24).
- **Methodology rules anclados durante este sweep:** regla 1 v3 (look outside obvious directory + verify divergence) — la progresión inventory 3→6→8 sites es evidencia del lower-bound rule funcionando.
