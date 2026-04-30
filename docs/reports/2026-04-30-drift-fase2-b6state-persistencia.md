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

### 3.2 Schema versioning

**Decisión**: política mandatory/opcional/per-shape para shapes que evolucionan en formato persistido.

#### Estado actual

- 1 site con versioning explícito: `workflowSlice.ts:14-79` con `STORAGE_VERSION = 1` + `PersistedEnvelopeSchema.strict()` que rechaza envelopes con version distinta.
- 1 site con forward-compat parcial: `avatarLibrary.ts ProfileSchema.catchall(measurementValueSchema)` — acepta fields nuevos pero no migra existing fields.
- 22 sites sin versioning ni forward-compat: incluye los 8 canonical post-BUG-10, los 12 ad-hoc, los 3 LS-only legitimate menos design log/quarantine.

#### Opción A — Versioning mandatory para todo IDB-canonical

**Propuesta:**
- Cada shape persistido en IDB envuelve el payload con `{ version: number, data: T }`.
- Read-side rechaza versiones desconocidas (returns null/default) o invoca migration helper si está registrado.
- Migration helpers se enrolan en un registry centralizado (`src/utils/storage.ts: registerMigration(store, key, fromVersion, toVersion, fn)`).
- Schema actual = version 1 por convención.

**Pros:**
- Forward-compat por construcción para todos los shapes IDB.
- Future shape changes son explícitos (incrementar version + escribir migration) en vez de implícitos (mudar shape, rezar).
- Precedente de workflowSlice formaliza el pattern; es replicable.

**Contras:**
- Boilerplate per-shape (cada `storageSet` envuelve payload, cada `storageGet` desenvuelve).
- Cost desproporcionado para shapes que nunca cambian (e.g., capsule position si decidiera vivir en IDB).
- Migration helpers son código permanente — incluso para shapes que evolucionaron una sola vez, el helper queda forever.

#### Opción B — Versioning opcional, mandatory cuando shape cambia

**Propuesta:**
- Default: shapes persisten sin envelope (igual que hoy).
- Cuando un shape cambia formato y debe convivir con datos legacy, **se opta-in al envelope** y se introduce migration.
- Convención: helper `storageSetVersioned(store, key, value, version)` + `storageGetVersioned(store, key, currentVersion, migrations)` para sites que opt-in.
- workflowSlice queda como ejemplo.

**Pros:**
- Zero overhead en shapes estables.
- Versioning cuando es needed, sin imponer overhead a casos triviales.
- Realidad: la mayoría de los shapes no cambian (auth config, plugin metadata, sortable preferences). Imponer envelope para shapes estables es waste.

**Contras:**
- Requiere disciplina del equipo: cuando alguien cambia shape, debe recordar migrar a envelope versionado en vez de simplemente shipping. Olvido = silent breakage.
- No hay enforcement automático; solo policy + code review.
- Cuando sí se necesita versioning, el opt-in es retroactivo (datos viejos no tienen version field, hay que treat unversioned = version 1).

#### Opción C — Forward-compat por convención (`.catchall()` zod) sin versioning

**Propuesta:**
- Adoptar `ProfileSchema.catchall()` pattern: zod schemas con `.catchall(z.unknown())` o `.passthrough()` para que reads acepten fields nuevos sin breakage.
- Shape changes son additive-only (nuevos fields opcionales). Cambios destructivos son explícitos breaking changes que requieren manual data migration.
- Sin envelope, sin migration registry. Schema-driven forward-compat.

**Pros:**
- Mucho menor boilerplate que Opción A.
- Aprovecha el zod boundary (sub-decisión #4 — si zod boundary es policy, esto se obtiene gratis).
- Forward-compat suficiente para los cambios típicos (agregar fields, defaultear missing fields).

**Contras:**
- No cubre breaking changes (cambios destructivos como rename de field, change de type). Para esos, igual hay que escribir migration manual.
- Asume que zod boundary parsing es policy (sub-decisión #4). Si zod boundary se decide opcional, esta opción cae.
- workflowSlice precedente queda como excepción — no se aplicaría uniforme.

#### Recomendación 3.2

**Opción B (versioning opt-in con helpers) con confianza media.**

**Razones:**

1. **Reality check**: en 8 sites canonical post-BUG-10, ninguno cambió shape en los últimos 3 meses. Imponer Opción A introduce boilerplate forever para casos que no lo necesitan.
2. **workflowSlice precedente** valida la viabilidad de Opción B: cuando se necesitó versioning (porque workflow state evolucionó), se opt-in con envelope strict + zod. El pattern funciona y es discoverable (un dev nuevo puede leer workflowSlice y replicar).
3. **Opción C es seductora pero incompleta** — `.catchall()` cubre additive changes, no breaking changes. Apoyarse exclusivamente en zod forward-compat deja la mitad del problema sin resolver.
4. **Confianza media (no alta)** porque B requiere disciplina del equipo + convention sin enforcement automático. Si en 6 meses se observa que la opt-in fue olvidada en algún breaking change, reabrimos como sub-decisión `B-revised` con enforcement (e.g., custom ESLint rule que requiere envelope para shapes de `storage.ts:`).

**Trigger de reapertura:** observación de un shape change shipped sin versioning donde después se necesitó migration urgent. Documenta el caso, evalúa Opción A vs `B-revised` con enforcement.

**Implementation plan (post-policy ratification, fuera de scope Fase 2):**
- Agregar `storageSetVersioned`/`storageGetVersioned` a `storage.ts` como helpers opcionales.
- Documentar inline en `storage.ts` cuándo opt-in (cambio de shape destructivo o additive con default-needed).
- Sin migración retroactiva: shapes existentes quedan como están hasta que cambien.

---

### 3.3 Multi-store transactions

**Decisión**: diseñar capability nueva o aceptar eventually-consistent en los acoplamientos lógicos existentes.

#### Estado actual

3 acoplamientos lógicos sin atomic transactions:

| Acoplamiento | Stores | Riesgo si falla parcialmente |
|---|---|---|
| Saved poses ↔ Avatar profiles | `avatars: profiles`, `avatars: saved-poses` | Pose huérfana referenciando profile borrado. Bajo (no hay enforcement de FK). |
| Provider config ↔ Fallback provider | `settings: provider-config`, `settings: fallback-provider` | Fallback configurado para provider que ya no es primary. Bajo (logical consistency, app valida en runtime). |
| Installed plugins ↔ Per-plugin storage | `plugins: installed`, `plugins: plugin:{id}` | Per-plugin storage huérfana (plugin desinstalado pero data residual). Bajo-medio (consume quota, no breaks runtime). |

Cero `Promise.all([storageSet(...), storageSet(...)])` en codebase. Cero IDB transactions multi-store.

#### Opción A — Diseñar capability multi-store transaction wrapper

**Propuesta:**
- `storage.ts` exporta `storageTransaction(operations: Array<{ store, key, value }>) → Promise<void>`.
- Internamente abre un IDB transaction sobre todos los stores afectados, ejecuta writes en orden, commit o rollback.
- Los 3 acoplamientos identificados se refactorian para usar la API nueva.
- Future couplings se discoveran por code review.

**Pros:**
- Capability formalizada y reusable.
- Elimina por construcción los 3 risks identificados (small pero non-zero).
- Future-proof: si aparece un acoplamiento de mayor blast radius (ej. plugin install que toca multiple stores), está cubierto.

**Contras:**
- Costo de diseño + implementación + tests significativo (~15-25h de dev work).
- IDB transaction semantics across stores es API-level boilerplate (open transaction, get object stores, batch writes, await done).
- Hoy no hay evidencia de bugs de race observados en producción para los 3 acoplamientos. El payoff es preventivo, no correctivo.
- Performance: transactions multi-store son más lentos que individual writes (sequencial bottleneck, abort retry overhead). Para los 3 casos identificados (pequeños y no-frecuentes), el cost es overkill.

#### Opción B — Aceptar eventually-consistent + add cleanup helpers

**Propuesta:**
- No diseñar transaction API.
- Cada acoplamiento mantiene independent writes.
- Add cleanup helpers que detectan + reparan inconsistencias on read:
  - `loadSavedPosesAsync()` filtra poses cuyo profileId no existe en profiles list.
  - `loadFallbackProvider()` valida que el provider referenciado tiene config válido.
  - `loadPluginStorage()` retorna null para plugins no instalados (force unlock cleanup).
- Documenta inline cada acoplamiento como "eventually consistent + read-side cleanup".

**Pros:**
- Zero refactor estructural; preserva la simplicidad write-side actual.
- Read-side cleanup es defensive programming bien-recibido.
- Costo bounded: 3 cleanup checks adicionales (~3h dev).

**Contras:**
- Read-side cleanup no fixes root cause; solo masca el síntoma. Si IDB queda inconsistent, el cleanup happens silently — usuario ve "data lost" sin entender por qué.
- Future couplings de mayor blast radius requerirían rediseño (Opción A reactiva).
- "Eventually consistent" semantics sin atomic boundary es difícil de razonar — qué garantías tiene el caller? Cuándo es safe leer?

#### Opción C — Defer (no decidir ahora)

**Propuesta:**
- B6-state ratifica que los 3 acoplamientos identificados tienen blast radius bajo.
- Documenta los 3 inline en código + en Sec 9 de este doc.
- Si en 6 meses aparece un caso de mayor blast radius o se observa bug en producción, reabrimos como sub-decisión propia.

**Pros:**
- Zero costo ahora. Prioriza decisiones de mayor payoff (políticas globales sobre infra puntual).
- No-decisiones son defensible cuando el problema es pre-mature optimization (cero bugs observados, blast radius bajo en los 3 casos).

**Contras:**
- Si Fase 3 introduce un caso de coupling complejo (ej. cross-store changes durante save batch), no hay infra preparada — requiere reactive design.
- Documentar "deferred" sin criterio explícito de cuándo reabrir es deuda mal definida.

#### Recomendación 3.3

**Opción C (defer con criterio explícito de reapertura) con confianza alta.**

**Razones:**

1. **Cost-benefit asimétrico hoy**: los 3 acoplamientos identificados tienen blast radius bajo. Diseñar capability multi-store transaction (Opción A, ~15-25h) es preventive over-engineering para cases que no han producido bugs en producción.
2. **Read-side cleanup (Opción B) es band-aid**: no fixes root cause y obscurece el logical model — preferible no-cleanup que cleanup-silent.
3. **Trigger explícito hace el defer responsible**: reabrir si (a) aparece un acoplamiento con blast radius alto (e.g., user-visible data loss), (b) Fase 3 introduce nueva capability que requiere atomicity (e.g., bulk import que escribe a múltiples stores).
4. **Confianza alta** porque los 3 acoplamientos están enumerados y documentados — la opción es "no ahora, revisable bajo trigger explícito" no "ignorar".

**Trigger de reapertura:**
- Bug report de inconsistencia inter-store que no se resuelve con read-side cleanup.
- Diseño de capability nueva (ej. project save bulk, plugin marketplace install batch) que cruza stores y requiere atomicity para correctness.
- Observabilidad de quota consumption por orphan data (per-plugin storage de plugins desinstalados acumulándose).

**Implementation plan (post-policy ratification):**
- Add comentario inline en cada uno de los 3 sitios documentando el coupling y los read-side cleanup expectations.
- Sin cambio estructural ahora.

---

### 3.4 zod boundary parsing

**Decisión**: política uniform-on-IDB-read, scope limitado a riesgo, o per-shape.

#### Estado actual

3 boundaries con zod parsing:
- `projectSchema.ts` — JSON file import/export (file boundary, no IDB).
- `avatarLibrary.ProfileSchema` + `MeasurementsSchema` — read boundary IDB+LS.
- `workflowSlice.PersistedEnvelopeSchema` — read boundary LS.

5 de 8 sites canonical post-BUG-10 leen IDB sin parse: agent-config, saved-poses, per-plugin storage, installed plugins, provider-config, ollama-config, fallback-provider.

#### Opción A — Mandatory zod parse en todo IDB read boundary

**Propuesta:**
- Cada `storageGet` consumer envuelve el resultado en zod parse.
- Schemas se definen co-located con el shape (e.g., `avatarConfigSchema` en `CopilotPanel.tsx` o file dedicado).
- Failure = return null + log warning + (opcionalmente) quarantine raw blob.

**Pros:**
- Garantías fuertes en boundary: cualquier corruption (manual edit, tab desync, partial write) se detecta y rechaza en lugar de propagarse.
- Forward-compat via `.catchall()` se obtiene en sub-decisión #2 sin extra effort.
- Consistente con projectSchema philosophy.

**Contras:**
- Boilerplate per-site (~10-30 líneas de zod schema por shape).
- Para shapes triviales (boolean flag, single string), el overhead es desproporcionado.
- Performance: zod parse en hot path (mount-time read) tiene cost (~1ms para shapes grandes como profiles).

#### Opción B — Zod parse mandatory para "user-generated data" + opcional para "internal config"

**Propuesta:**
- User-generated (poses, profiles, projects, marketplace skills) requiere zod en read boundary.
- Internal config (provider-config, ollama-config, agent-config, layoutSlice) puede saltar zod si shape es primitive-typed-by-typescript.
- Criterio greppable: shape contains user-input strings o user-defined arrays → mandatory zod. Shape es discriminated union de tipos enum + primitives → optional.

**Pros:**
- Boilerplate solo donde el riesgo es real (user input es untrusted).
- Performance: zod parse en hot path solo cuando necesario.
- Reconoce la realidad: agent-config schema (3 fields, 2 strings 1 enum) no se beneficia de zod del mismo modo que pose array (50+ items con joints + matrices).

**Contras:**
- Criterio "user-generated vs internal config" tiene zonas grises (¿es ollama-config "internal"? El URL es user input).
- Cognitive overhead: cada nuevo shape requiere decisión de criterio.
- Inconsistente con Opción A precedent (workflowSlice ya tiene zod).

#### Opción C — Status quo + close gaps documented

**Propuesta:**
- B6-state documenta los 5 IDB sites sin parse como "deferred risk".
- No mandatorea zod nuevo.
- Si en 6 meses se observa corruption bug en alguno, agrega zod ad-hoc.

**Pros:**
- Zero cost ahora.
- Reactive cuando el cost-benefit es claro (bug observado, schema demonstrably needed).

**Contras:**
- Anti-patrón cobarde: documenta drift sin resolver.
- Los 5 sites IDB sin parse son un blind spot — corruption silenciosa de cualquiera de ellos podría producir bug confuso difícil de attribuir a falta de schema.

#### Recomendación 3.4

**Opción B (zod mandatory para user-generated, opcional para internal config) con confianza media-alta.**

**Razones:**

1. **Cost-benefit calibrado**: zod overhead solo donde el risk de corruption importa (user-generated data has unbounded shape surface). Internal config con types TS-narrow tiene risk surface chica.
2. **Precedente consistent**: avatarLibrary ya aplica zod a profiles (user-generated). projectSchema aplica a project import (user-generated). workflowSlice aplica a versioned envelope (user-driven workflow state). Los 3 precedentes son user-generated.
3. **Confianza media-alta** (no alta) por la zona gris del criterio. Mitigación: la sub-decisión incluye una tabla explícita por site (ver Implementation plan abajo) clasificando cada uno como "user-gen" o "internal", con razón inline. Future shapes nuevos siguen la misma tabla.

**Tabla de clasificación de los 8 sites canonical post-BUG-10:**

| Site | Clasificación | Zod policy |
|---|---|---|
| `agent-config` | Internal (3 fields fixed shape) | Optional (skip OK) |
| `saved-poses` | User-generated (variable count, user-named, user-jointed) | **Mandatory zod parse** |
| `avatar profiles` | User-generated (already has ProfileSchema) | Mandatory ✓ done |
| `per-plugin storage` | Plugin-generated (untrusted by definition) | **Mandatory zod parse** at canonical boundary; plugin's own schema |
| `installed plugins` | Internal-ish (registry data, version + name, pero plugin manifests son user-generated por el plugin author) | **Mandatory zod parse** (precedente plugin manifest validation) |
| `provider-config` | Internal (provider enum + URL string) | Optional (skip OK) |
| `ollama-config` | Mixed (URL is user input, other fields are TS-typed) | Optional w/ basic url validation |
| `fallback-provider` | Internal (similar a provider-config) | Optional (skip OK) |

**Implementation plan (post-policy ratification):**
- Add zod schema for `saved-poses` (mandatory user-gen).
- Add zod schema for `installed plugins list` (mandatory plugin metadata).
- Document the table above en `storage.ts` comment.

**Trigger de reapertura:**
- Corruption bug observado en uno de los 4 sites clasificados como "internal" → reclasificar y agregar zod.
- Plugin schema escape (per-plugin storage corruption from sandboxed plugin) → tighten zod boundary on plugin-generated data.

---

### 3.5 Sync API policy

**Decisión**: ratificar cache-shadowing como exception documentada o migrar a async-only con loading states.

#### Estado actual

2 sites con cache pattern post-BUG-10 + failure modes documentados inline:

| Site | Sync consumer | Failure modes documentados |
|---|---|---|
| `pluginManager.installedCache` | `installPluginFromManifest`, test fixtures | Order-dependent staleness, silent IDB write failure |
| `providers/ollama.ollamaConfigCache` | `AgentSettings.tsx:108` (render-time read in form) | Same |

#### Opción A — Ratificar cache-shadowing (status quo) con policy explícita

**Propuesta:**
- B6-state ratifica que sync API + cache shadow es exception legítima cuando: (a) sync API es contract público (plugin handlers, render path), (b) failure modes están documentados inline.
- No migration needed; los 2 sites quedan como están.
- Future cache sites se ratifican individualmente con el mismo criterio.

**Pros:**
- Zero refactor cost.
- Preserva sync contracts que tienen consumers (tests, render).
- Failure modes ya documentados inline (post-chore-docs commit `d291494`); no requiere extra work.

**Contras:**
- Los 2 failure modes (order staleness + silent IDB write failure) **persisten en producción**. Si algún día se observa data loss debido a uno de ellos, la mitigation es reactive.
- Cache pattern es duplication: 2 sites con el mismo shape (`xxxCache: T | null` + lazy LS init + sync API + async hydrate). Podría unificarse en un helper canonical, pero hacerlo refactor.

#### Opción B — Migrar ambos a async-only con loading state

**Propuesta:**
- `pluginManager.installPluginFromManifest` se vuelve async; tests + plugin handlers refactoran.
- `AgentSettings.tsx` usa loading state mientras `loadOllamaConfigAsync` resuelve; UI muestra spinner ~5ms en mount.
- Cache fields se eliminan; storage.ts es source of truth.

**Pros:**
- Elimina los 2 failure modes por construcción.
- Consistencia con los otros 6 canonical sites (todos async).
- Reduce surface area de la canonical pattern (cero excepciones).

**Contras:**
- Refactor cost: ~6-10h (test fixtures + AgentSettings UI loading state + plugin handler audit).
- Plugin API contract en `pluginManager` es plugin-facing; cambiar a async puede requerir version bump del plugin API.
- Loading state UI <5ms en `AgentSettings` mount es perceptible si la app es slow generally; visual flicker non-zero.

#### Opción C — Cache-shadowing OK + extract canonical helper

**Propuesta:**
- Mantener cache-shadowing pattern.
- Extraer un helper canonical en `storage.ts` que encapsula el cache + sync read + async hydrate + sync write + IDB persist.
- Los 2 sitios se refactoran para usar el helper.
- Future cache sites usan el mismo helper sin re-implementar.

**Pros:**
- Combina las ventajas de A (no UI breakage) y B (reducir surface duplicada).
- Failure modes quedan documentados en un solo lugar (el helper) en vez de 2 sites.

**Contras:**
- Cost intermedio (~3-5h para diseñar helper + refactor 2 sitios).
- Helper API has 4-5 callbacks (legacy LS read, schema validate, async hydrate, sync write, async persist) — surface más complicada que la del cache pattern simple.
- "Generalizar para 2 casos" puede ser premature abstraction si los 2 casos no comparten más que shape.

#### Recomendación 3.5

**Opción A (ratificar status quo con policy explícita) con confianza alta.**

**Razones:**

1. **Cost-benefit favorable**: Opción A es zero-cost; los failure modes ya están documentados inline (`d291494`). Opción B introduce refactor de plugin API que cruza la línea de "BUG-10 implementation no debe pre-empt plugin contract".
2. **Opción C es premature abstraction**: 2 sites con cache pattern no justifican un helper canonical con 4-5 callbacks. Si en 6 meses aparece un tercer cache site con shape similar, evaluamos extracción ahí.
3. **Failure modes son documented + bounded**: order staleness se mitiga si components dispatch async hydrate en mount (igual que los otros sites canonical hacen). Silent IDB write failure es shared con los 6 sites async fire-and-forget — no es exclusivo de cache sites.
4. **Confianza alta** porque los 2 failure modes están enumerados, los 2 sites están enumerados, y el path de mitigation está claro (mount effect dispatch async hydrate, tests use cache reset helper).

**Trigger de reapertura:**
- Bug observado de "stale cached value" en producción.
- Tercer cache site emerge con shape similar (justifies helper extraction, Opción C revisited).
- E-async-states sub-track decide policy global de loading states que invalida cache-shadowing como exception.

**Implementation plan:**
- Cero refactor.
- Opcional cleanup: mejorar el wording de los inline comments en `installedCache` y `ollamaConfigCache` para incluir explícitamente "ratificado por B6-state Fase 2 § 3.5 como sync API exception" (1-líneas adicionales). Lo hago como sub-bullet del cleanup commit post-PR ratificación.

---
