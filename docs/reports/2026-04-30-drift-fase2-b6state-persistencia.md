# Fase 2 — B6-state: Persistencia (canonical adoption + open architectural decisions)

**Fecha:** 2026-04-30
**Estado:** PROPUESTA. Esperando review de Sam antes de Fase 3 (migration de los sites identificados según política ratificada).
**Branch:** `drift/b6-state-persistencia`
**Inputs directos:**
- `docs/reports/2026-04-30-bug-10-fix-options.md` (nota fix-options, mergeada en main vía PR #646)
- `docs/reports/2026-04-28-drift-fase2-classification.md` § (b) eje B6-state
- `src/utils/storage.ts:163-178` (canonical IDB pattern post-BUG-10)
- Issue [#613](https://github.com/sssamuelll/openclo/issues/613) (BUG-10 cerrado vía PR #652)

> **Pre-requisito metodológico:** este doc se redacta tras BUG-10 implementado y mergeado a main. Las 8 sub-decisiones que originalmente quedaron pendientes en la nota BUG-10 § 5/6 ahora se resuelven explícitamente acá, junto con 2 decisiones nuevas que el sweep B6-state inventory destapó.

---

## 1. Qué decide / qué NO decide este doc

### Decide explícitamente

1. **Política IDB-vs-LS** — criterio greppable que clasifica cada shape persistido como "IDB-canonical" vs "LS-only legitimate".
2. **Schema versioning** — política mandatory/opcional/per-shape para shapes que evolucionan.
3. **Multi-store transactions** — diseñar capability nueva o aceptar eventually-consistent en los acoplamientos lógicos existentes.
4. **zod boundary parsing** — política uniform-on-IDB-read, scope limitado, o per-shape.
5. **Sync API policy** — ratificar cache-shadowing como exception documentada o migrar a async-only con loading states.
6. **LS-only exception list** — 15 sites totales (3 legitimate + 12 ad-hoc) clasificados en 4 buckets con criterio explícito.
7. **Skill persistence** — decisión menor: ratificar separación (DB propio `openclo_skills_v1`) y alinear naming del custom `migrateFromLocalStorage()`.
8. **Migration window policy** — cuánto tiempo permanece el `migrateFromLocalStorage` fallback en cada site post-canonical-adoption antes de cleanup.
9. **Storage quota / IDB unavailable behavior** — comportamiento esperado del canonical bajo IDB unavailable (Safari private mode, quota exhaustion, settings disabled).

### NO decide (cross-references)

- **AgentConfig → ProviderConfig migration** ([#644](https://github.com/sssamuelll/openclo/issues/644)). Es shape/schema migration, no persistence policy. Diferentes capas. B6-state cruza por encima del mismo file (`protocol.ts` exporta `AgentConfig`) pero la decisión de unificar AgentConfig vs ProviderConfig pertenece al issue #644 y al eje D6 (fabric tipos x3) que tiene shape similar para tipos de configuración. **Tracked separately**.
- **Storage formats / serialización de pieces** (parte del scope de edición de proyecto, no de persistencia). Cubierto por `projectSchema.ts` y proyectos ya normales.
- **Plugin sandbox storage** (`PluginBridge.ts:622`) — boundary de aislamiento de plugins, comportamiento intencional, fuera de cualquier eje del audit.
- **SecureStorage architecture** — separate concern para encrypted secrets en sessionStorage. La boundary "non-secrets en IDB, secrets en SecureStorage" es la canonical actual; B6-state ratifica esa boundary pero no rediseña SecureStorage.
- **E-async-states sub-track** (B8-state + D2 + D8). El sync-API policy de B6-state es input para E-async-states cuando arranque (los 2 cache sites con failure modes documentados forman parte del problem statement de E-async-states), pero la decisión de loading-state policy global pertenece a E-async-states.

---

## 2. Estado actual

### 2.1 Pre-existing canonical (regla 1 v2/v3)

Sweep encontró infraestructura canonical robusta, mayormente formalizada por BUG-10 + sus precedentes:

#### Canonical IDB pattern

`src/utils/storage.ts:163-178` (con comentario inline `storage.ts:165` post-BUG-10):

```typescript
// CANONICAL persistence pattern for project-scoped data:
// Use storageSet / storageGet for IDB-primary writes/reads,
// with migrateFromLocalStorage() for one-time LS legacy handover.
export async function saveProject(project: unknown): Promise<void> {
  await storageSet('projects', AUTOSAVE_KEY, project);
}
export async function loadProject(): Promise<unknown | undefined> {
  const existing = await storageGet('projects', AUTOSAVE_KEY);
  if (existing) return existing;
  return migrateFromLocalStorage(LEGACY_AUTOSAVE_KEY, 'projects', AUTOSAVE_KEY);
}
```

**Helpers exportados** (`storage.ts`): `storageGet`, `storageSet`, `storageDel`, `storageKeys`, `storageClear`, `storageClearAll`, `migrateFromLocalStorage`.

**Internal LS fallback dentro de `storageSet`/`storageGet`** (líneas 60-65, 79-80): si IDB no está disponible, el wrapper escribe/lee de LS bajo la key compuesta `${DB_NAME}:${store}:${key}`. Esto es resilience automática, no double-write voluntario.

#### IDB stores definidos

`storage.ts:25` define 4 object stores en DB `openclo` (version 1):

| Store | Keys actuales | Owner |
|---|---|---|
| `projects` | `autosave` | Core (project autosave) |
| `avatars` | `profiles`, `saved-poses` | Core (avatar library) |
| `plugins` | `installed`, `plugin:{pluginId}` | Plugin ecosystem |
| `settings` | `agent-config`, `provider-config`, `ollama-config`, `fallback-provider`, `copilot-memory-{projectId}` | Copilot config + per-project memory |

**Direct IDB usage outside canonical wrapper** (2 sites, deliberadamente segregados):

| DB | Owner | Razón |
|---|---|---|
| `openclo_skills_v1` | `src/copilot/action/skills/skillPersistence.ts` | Skill registry + plugin-managed lifecycle. Schema con índices (source, enabled, installedAt) que el canonical no soporta. |
| `openclo-reference-images` | `src/utils/import/referenceImageStore.ts` | Blob storage para referencias visuales (hasta ~10 MB/imagen). Segregación previene quota exhaustion del DB principal. |

#### Sites canonical post-BUG-10 (8 sites)

| # | Data | File | Sync API? |
|---|---|---|---|
| 1 | agent-config | `CopilotPanel.tsx:34-44` | No (async-only via useEffect on mount) |
| 2 | saved-poses | `avatarSlice.ts:196-225` | Sync fallback de LS legacy en initialState; async hydrate via reducer |
| 3 | avatar profiles | `avatarLibrary.ts:62-260` | Async-only (`loadProfilesAsync`) |
| 4 | per-plugin storage | `pluginLoader.ts:450-490` | Sync `readPluginStorage` (LS legacy only) + async `readPluginStorageAsync` |
| 5 | installed plugins | `pluginManager.ts:60-141` | **Sync via cache** (`installedCache` shadow) |
| 6 | provider-config | `providers/types.ts:154-230` | Sync fallback `loadProviderConfigSync` (no apiKey) + async `loadProviderConfig` |
| 7 | ollama-config | `providers/ollama.ts:50-118` | **Sync via cache** (`ollamaConfigCache` shadow) |
| 8 | fallback-provider | `errorRecovery.ts:300-426` | Async-only |

**Sites con cache pattern** (2 de 8): `pluginManager` + `providers/ollama`. Documentados inline post-BUG-10 con failure modes (`order-dependent staleness`, `silent IDB write failure`). Detalles en `bug-10-fix-options.md` § 9.1.

#### Migration coverage

`migrateFromLocalStorage` se invoca en 8 sites (uno por cada canonical site post-BUG-10) + en `loadProject` (autosave). Helper centralizado. Una excepción: `skillPersistence.ts:203` define un **método custom homónimo** (`migrateFromLocalStorage()` dentro de su clase, no el helper canonical) para migración del DB skill. Naming collision a alinear (sub-decisión #7).

#### Zod schemas en boundaries persistencia

3 boundaries con zod parsing:

| Boundary | Schema | Trigger | Failure mode |
|---|---|---|---|
| JSON file import/export | `parseOpenCloProject()` (zod tree comprehensive, 20+ sub-schemas con DoS caps) | `loadProjectFromJSON()` en `projectIO.ts:93` | Returns `{ ok: false, error: ParseError }`; caller decide quarantine/UI/discard. |
| LS/IDB read (avatar profiles) | `ProfileSchema` + `MeasurementsSchema` con `.catchall(measurementValueSchema)` forward-compat | `parseProfilesJson()` desde `loadProfiles[Async]()` | Per-profile rejection (skip corrupt, keep valid); returns `{ success, data, rejected, firstRejectDetail }`. |
| LS read (workflow envelope) | `PersistedEnvelopeSchema.strict()` + `WorkflowStateSchema` | `loadFromStorage()` en workflowSlice rehydrate | Invalid envelope → null → `initialState` fallback. |

**Asimetría crítica**: 5 de 8 sites canonical post-BUG-10 (agent-config, saved-poses, per-plugin storage, installed plugins, provider-config, ollama-config, fallback-provider) leen del IDB **sin parse**. Solo avatar profiles tiene zod en read boundary IDB.

#### Schema versioning

**Único site con versioning explícito**: `workflowSlice.ts:14-79` con `STORAGE_VERSION = 1`, `PersistedEnvelopeSchema` strict que requiere `version: z.literal(STORAGE_VERSION)`. Rehidratación rechaza envelopes con `version` distinto.

**8 sites canonical post-BUG-10 + 3 LS-only legitimate + 12 ad-hoc**: ninguno con version field explícito. La forward-compat del `ProfileSchema.catchall()` es parcialmente equivalente (acepta fields nuevos) pero no permite migrar shapes que cambian existing fields.

#### SecureStorage (separate concern)

7 sites usan `SecureStorage.set`/`SecureStorage.get` para encrypted API keys (sessionStorage AES-GCM):

| Key | Owner | Paired-with config en IDB |
|---|---|---|
| `{provider}-apikey` (anthropic, openai, deepseek, ollama, etc.) | `providers/types.ts:204, 221`, `AgentSettings.tsx:160` | `provider-config` |
| `fallback-apikey` | `errorRecovery.ts:336, 392, 414` | `fallback-provider` |

Boundary clear: **non-secrets en IDB, secrets en SecureStorage**. Lifecycle: secrets pierden con tab close (sessionStorage) — usuario re-ingresa.

### 2.2 Drift map / open decisions

Mapeo de las 9 sub-decisiones (sin contar la #8 cross-ref a #644) contra el estado actual:

| # | Sub-decisión | Sitios afectados (count) | Estado actual | Conflict con canonical actual? |
|---|---|---|---|---|
| 1 | Política IDB-vs-LS | 23 sites totales (8 canonical + 15 LS) | Mixed; 8 canonical decididos por BUG-10, 15 LS sin política explícita | No, pero 12 ad-hoc viven en limbo |
| 2 | Schema versioning | 23 sites + workflowSlice (precedente) | 1 site con version (workflowSlice), 22 sin version | Solo workflowSlice formaliza; el resto asume shape estable |
| 3 | Multi-store transactions | 3 acoplamientos lógicos (poses↔profiles, provider↔fallback, plugins↔per-plugin) | Cero atomic txs en codebase; eventual consistency implícita | No conflict, pero gap de capability |
| 4 | zod boundary parsing | 8 canonical IDB sites + 12 ad-hoc + 2 separate DBs | 3 boundaries con zod (project import, profiles, workflow envelope); 5 IDB canonical sites sin parse | Asimetría: profiles lee con zod, otros 5 IDB sites no |
| 5 | Sync API policy | 2 cache sites (pluginManager, ollama) + 4 sync fallback sites (saved-poses, per-plugin, provider-config, layoutSlice, workflowSlice) | Cache pattern documentado con failure modes; sync fallbacks transitorios | No conflict, pero failure modes documentados son input para policy |
| 6 | LS-only exception list | 15 LS sites (3 legitimate + 12 ad-hoc) | 3 ratificados como deferred (BUG-10 § 9), 12 sin clasificación | Sin política, política implícita "LS para lo que parecía LS" |
| 7 | Skill persistence | 1 DB separado (`openclo_skills_v1`) + custom `migrateFromLocalStorage()` method | Deliberadamente separado por shape (índices custom); naming collision con helper canonical | Naming-only, no estructural |
| 9 | Migration window policy | 8 sites con `migrateFromLocalStorage` + 1 (project autosave) | Sin policy de cuándo retirar la fallback path | No conflict, pero deuda implícita post-N-releases |
| 10 | Storage quota / IDB unavailable | Todos los 8 canonical sites | `storageSet`/`storageGet` swallow IDB errors → fallback a LS interno (bajo `${DB_NAME}:${store}:${key}`); errores nunca surface al usuario | Failure mode silencioso aceptable o refactor para surface? |

#### Detalles del bucket de los 12 ad-hoc LS sites

Sweep (B6-state inventory) clasificó los 12 según shape + uso. Sec 5 los segrega en 4 buckets para policy ratification:

**Bucket A — trivially LS-only** (4 sites):
- `teachingContext.ts:43` — teaching mode flag
- `debug/debugAPI.ts:23-24` — debug bridge flag
- `debug/DebugStore.ts:26` — debug records buffer
- `Toolbar3D.tsx:30` — selected subtool state
- `UnifiedBar.tsx:105` — capsule floating position (sub-millisecond drag handler access)

(5 sites; UnifiedBar verificado NOT dead, key distinta de layoutSlice).

**Bucket B — clear migration candidates a canonical** (4 sites):
- `costManager.ts:253, 356` — budget + history
- `userPreferences.ts:586` — user prefs (theme, language, model defaults)
- `skills/marketplace.ts:39, 124` — marketplace registry URL + installed skills metadata
- `ShortcutRegistry.ts:178` — custom keyboard shortcuts

**Bucket C — border-line, decisión per-site** (3 sites):
- `AgentSettings.tsx:67` — language pref con `localStorage.setItem` raw (sin `safeSetItem`)
- `webgpuDetect.ts:44` — WebGPU feature flag
- `SetupWizard.tsx:113` — onboarding completion flag

**Bucket D — slice-internal LS persistence** (2 sites):
- `layoutSlice.ts:53` — slice-internal `safeSetItem` helper, no canonical
- `workflowSlice.ts:99` — slice-internal envelope con versioning + zod (precedente)

---

## 3. Opciones por sub-decisión

Cada sub-decisión presenta opciones con tradeoffs concretos. La opción recomendada se identifica al final de cada sub-sección con confianza calibrada. La consolidación final está en Sec 4.

### 3.1 Política IDB-vs-LS

**Decisión**: criterio greppable que clasifica cada shape persistido como "IDB-canonical" vs "LS-only legitimate".

#### Opción A — IDB-canonical para *todos* los shapes persistidos (LS solo como fallback automático del wrapper)

**Propuesta:**
- Todo dato que sobrevive page reload pasa por `storageSet`/`storageGet`.
- LS solo se usa como fallback automático cuando IDB no está disponible (Safari private mode, settings disabled, quota exhaustion). Nunca como primary, nunca como sync access path.
- Excepciones legítimas se ratifican explícitamente (ver Sec 5 buckets) y son enumerable.

**Pros:**
- Política única, fácil de razonar y enforcer.
- Elimina la categoría "LS ad-hoc" — toda escritura LS es legitimate-by-policy o resilience-fallback.
- Compatible con extension futura (versioning, zod boundary, transactions) sin partir un grupo de sites.
- Migra naturalmente los 4 sitios del bucket B (clear migration candidates).

**Contras:**
- Forces async API en sitios sync hoy (los 5 sitios sync — bucket B + algunos del bucket C). Requiere refactor de consumers + loading states.
- Para data <1KB con render-time read (capsule position, subtool state), la latencia de IDB read en mount es perceptible (~5ms vs ~0.1ms LS). UX impact en sitios donde el render path depende del valor.
- Bucket A (4 sitios trivially LS-only) violaría policy si forzamos IDB → necesita exception explícita.

**Migration path:**
- Bucket B (4 sitios): adoptar canonical igual que BUG-10. Read-side migration via `migrateFromLocalStorage`. Los 4 son user-config persistente, son perfectos candidates.
- Bucket A: ratificar como exception list explícita.
- Bucket C: caso por caso (Sec 5).
- Bucket D: layoutSlice migra al canonical; workflowSlice queda como precedente (su versioning ya cubre el read boundary).

#### Opción B — Shape-based separation explícita (criterio greppable)

**Propuesta:**
- Criterio greppable: "small (<1KB) + sync-accessible + per-browser UI state" → LS-only legitimate. Resto → IDB-canonical.
- Ejemplos de la línea: capsule position (LS, <100B), language pref (IDB, <50B pero cross-machine sync), theme (LS por simplicidad o IDB para sync-across-devices — depende), shortcuts (IDB).
- Cada site documenta inline `// LS-only: <reason>` o `// IDB-canonical (BUG-10 pattern)`.

**Pros:**
- Reconoce la realidad UX: <1KB sync-access es un caso real con costo medible (drag handlers, render path).
- Formaliza la línea que el codebase ya usa implícitamente.
- Compatibility-first: no fuerza refactor de los 4 sitios trivially-LS.

**Contras:**
- "<1KB" es threshold arbitrario; bordeline cases (3KB layout) requieren decisión per-site.
- Two-policy implementation cognitive overhead para el equipo: "¿es LS o IDB?" requiere check de criterio cada vez.
- Si "cross-machine sync" entra al criterio, fuerza re-clasificación de muchos sites (theme, language, layout) que históricamente fueron LS.

**Migration path:**
- Bucket A: queda LS-only ratificado.
- Bucket B: migra a IDB (los 4 son persistente cross-machine candidates).
- Bucket C: caso por caso aplicando el criterio.
- Bucket D: depende — layoutSlice (<5KB sync-access para UI 2D/3D split) probablemente queda LS; workflowSlice (versioned, schema-validated) queda LS también.

#### Opción C — Mantener status quo + ratificar política implícita

**Propuesta:**
- Cada slice/módulo mantiene su política actual.
- B6-state documenta lo que existe sin imponer cambio.
- Future drift se evalúa case-by-case.

**Pros:**
- Cero migración. Cero cost ahora.
- Preserva todas las decisiones históricas implícitas.

**Contras:**
- **Anti-patrón explícito del audit**. Ratificación cobarde: documenta drift sin resolverlo.
- Los 4 sitios del bucket B (clear migration candidates por shape user-config) seguirían perpetuando el smell que motivó BUG-10 (LS sin policy, future drift accumulation).
- No hay criterio para preventar que el próximo dev introduzca otro double-write o LS-only sin ratificar.

**Migration path:** ninguno.

#### Recomendación 3.1

**Opción B con confianza alta.** Criterio:

```
LS-only legitimate IFF:
  shape size ≤ 1KB
  AND sync-access required for render path or sub-millisecond user input
  AND per-browser UX (no cross-machine value gain)
ELSE: IDB-canonical (with cache pattern only if sync API contract breaking)
```

**Razones:**

1. La realidad UX es heterogénea — capsule drag handlers (sub-millisecond access para drag smoothness) y user shortcuts (cross-machine sync useful) tienen perfiles distintos. Una política única (Opción A) ignora ese gradiente.
2. El cost-benefit del criterio greppable es positivo: 4 sitios bucket A se ratifican fácil; 4 sitios bucket B migran con clear payoff; 3 sitios bucket C usan el criterio para resolver per-site.
3. La opción A es teóricamente más limpia pero introduce loading-state UX en 4 sitios donde el cost (sub-millisecond read path) es real y el benefit (cross-machine sync) es nulo.

**Confianza alta** porque:
- El criterio ya está implícito en el codebase pre-BUG-10 (los 4 sitios bucket A son obvious LS).
- Los precedentes (workflowSlice, layoutSlice) son consistent con shape-based separation.
- El cost de aplicar el criterio caso por caso es bounded (15 sitios totales, todos enumerados).

---
