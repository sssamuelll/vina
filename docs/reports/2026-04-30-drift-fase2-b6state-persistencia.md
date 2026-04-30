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

### 3.6 Skill persistence (decisión menor)

**Decisión**: ratificar separación del DB `openclo_skills_v1` y resolver naming collision con el helper canonical `migrateFromLocalStorage`.

#### Estado actual

- DB separado `openclo_skills_v1` (`skillPersistence.ts:14`) con 2 stores (`skills`, `preferences`) e índices custom (source, enabled, installedAt).
- Método custom `migrateFromLocalStorage()` dentro de la clase (`skillPersistence.ts:203`) — homónimo del helper canonical en `storage.ts:141`. **Naming collision**.

#### Recomendación 3.6

**Ratificar separación + alinear naming. Confianza alta.**

**Decisión:**
1. **Separación del DB queda intencional**: schema con índices que el canonical no soporta + lifecycle plugin-managed (skills se instalan/desinstalan dynamically, separación facilita cleanup masivo). Documentar inline en `skillPersistence.ts` el rationale: "Separate DB by design — index requirements + plugin lifecycle isolation. Not subject to BUG-10 canonical."
2. **Renombrar el método custom**: `SkillPersistence.migrateFromLocalStorage()` → `SkillPersistence.migrateLegacySkills()`. Naming consistente con domain (skills) en lugar de mecanismo (LS migration), elimina collision con helper canonical, mejora discoverability.

**Costo:** ~30min — rename + grep callers + inline doc update. Aplicable en chore-commit post-Fase 2 ratificación.

**Trigger de reapertura:**
- Si en future eje aparece otro DB separado con naming collision similar, considerar policy "custom DB methods con prefix `Migrate{Domain}` consistent" como rule.

---

### 3.7 Migration window policy

**Decisión**: cuánto tiempo permanece el `migrateFromLocalStorage` fallback en cada site post-canonical-adoption antes de cleanup.

#### Estado actual

8 sites canonical post-BUG-10 + project autosave usan `migrateFromLocalStorage` para LS legacy → IDB handover. La nota BUG-10 § 6 dejó "eliminación del migration code" out-of-scope (decisión de mantenimiento, no arquitectura). B6-state ratifica policy.

#### Opción A — N-release window (e.g., 3 releases)

**Propuesta:**
- Migration code permanece N releases después de canonical adoption.
- Después de N releases, asume todos los usuarios han hecho upgrade y leído al menos una vez (migrating LS → IDB on first read).
- Cleanup commit elimina el `migrateFromLocalStorage` call + el legacy LS key constant. Sites que nunca leen post-deploy quedan con stale LS data hasta que el usuario clear browser data — aceptable.

**Pros:**
- Bounded code lifetime — el migration code no es forever.
- Calendar simple: tracking en GitHub project board "scheduled cleanup commits" por site.
- Reduce future grep noise (legacy LS keys desaparecen del codebase).

**Contras:**
- N=3 es arbitrario — para users que skipean releases o instalan after-the-fact, datos legacy quedan stranded. Mitigation: N grande (e.g., 6+).
- Tracking is ongoing maintenance burden.

#### Opción B — Indefinite (no remove)

**Propuesta:**
- Migration code permanece forever.
- Costo: ~10 líneas por site, total ~80-100 líneas de migration code persistent.

**Pros:**
- Zero risk de stranded data.
- Zero ongoing maintenance.

**Contras:**
- Codebase noise: legacy LS key constants persisten en archivos canonical para siempre.
- Confusion para devs nuevos: "¿Por qué hay un `LEGACY_AGENT_STORAGE_KEY` aún?"

#### Opción C — Remove on next major version (semver bump)

**Propuesta:**
- Migration code permanece hasta el próximo major version bump (e.g., openclo 1.0).
- En major version, todos los migration paths se borran a la vez.

**Pros:**
- Aligned con semver — usuarios que upgrade a major saben que data migration puede haberse hecho.
- Removes incentive para release-by-release tracking.

**Contras:**
- "Major version" timing es business decision, no architectural — puede ser meses o años away.
- Si openclo nunca sale de 0.x.y, este path nunca cierra.

#### Recomendación 3.7

**Opción B (indefinite, no remove) con confianza media.**

**Razones:**

1. **Cost de cleanup desproporcionado al benefit**: ~80-100 líneas de migration code es bounded; el codebase noise es minor. Cost de mantenimiento de tracking + scheduling cleanup commits es non-trivial.
2. **Risk de stranded data ≠ 0**: usuarios que instalan after-the-fact o skipean releases existen — para apps con users larguísimos como SaaS opcional, "N=3 releases" no garantiza migration completa.
3. **Confianza media** porque la opción es defensible pero no obvia. Si en future eje aparece un patrón de "muchos legacy paths de migration acumulados a través de varios refactors" se reabre como sub-decisión revisable con criterio de tracking.

**Implementation plan:**
- Cero acción ahora.
- Comentario inline en cada site con `migrateFromLocalStorage` call: `// Legacy LS migration; permanent per B6-state § 3.7. Remove only if usage telemetry shows zero reads from legacy key for >12 months.`
- Documentar policy en `storage.ts` cerca del helper.

**Trigger de reapertura:**
- Acumulación de >5 distintos `migrateFromLocalStorage` paths en archivos individuales (signal de patrón de drift en migration paths).
- Telemetría que confirma cero reads de legacy key for >12 months → cleanup justificado para sites específicos.

---

### 3.8 Storage quota / IDB unavailable behavior

**Decisión**: comportamiento esperado del canonical bajo IDB unavailable (Safari private mode, settings disabled, quota exhaustion).

#### Estado actual

`storageSet` (`storage.ts:73-82`):
```typescript
export async function storageSet(store, key, value) {
  try {
    const db = await getDB();
    await db.put(store, value, key);
  } catch {
    safeSetItem(`${DB_NAME}:${store}:${key}`, JSON.stringify(value));  // silent LS fallback
  }
}
```

`storageGet` (`storage.ts:53-66`): mismo pattern — IDB primario, LS fallback silencioso.

`safeSetItem` (`safeStorage.ts`): swallow LS write errors silently (`try {} catch {}`).

Result: IDB unavailable → silent LS fallback. LS quota exceeded → silent failure (no UI signal). Usuario no aware de degraded persistence.

#### Opción A — Surface degraded persistence al usuario

**Propuesta:**
- `storageSet` retorna `Promise<{ ok: true } | { ok: false, reason: 'idb-unavailable' | 'lsquota' }>`.
- Callers chequean el result y dispatch toast a usuario en degraded paths.
- Dashboard / app status indicator cuando IDB no disponible.

**Pros:**
- Transparencia: usuario sabe que sus datos pueden no persistir.
- Diagnostic-friendly cuando data loss reportado.

**Contras:**
- Breaking change al contract de `storageSet` (currently `Promise<void>`). Callers deben actualizar.
- Most callers no necesitan el detail — solo agregan boilerplate.
- Toast spam en Safari private mode (donde IDB siempre falla).

#### Opción B — Status quo + telemetry hook

**Propuesta:**
- Mantener silent LS fallback (compat con código actual).
- Add telemetry hook que cuenta IDB-unavailable events para diagnostic post-hoc.
- Future degraded UX (warning banner) se construye sobre telemetry, no sobre breaking changes al contract.

**Pros:**
- Zero breaking changes.
- Telemetry data informa future decisions (¿está pasando? ¿qué shapes?).
- Degraded UX puede agregarse incremental sobre la telemetry.

**Contras:**
- No ofrece transparencia inmediata al usuario.
- Telemetry hook requiere registry + opt-in mechanism.

#### Opción C — Status quo + document + defer

**Propuesta:**
- B6-state ratifica el status quo silent fallback.
- Documenta en `storage.ts` que silent fallback es policy intencional (resilience over diagnostic visibility).
- Si en future eje (ej. observability sub-track o user-reported data loss) emerge necesidad, reabrir.

**Pros:**
- Zero cost ahora.
- Reactive: implementa solo si necesario.

**Contras:**
- "Silent" es exactamente lo que el audit busca evitar. Documenting a smell as policy es borderline cobarde.

#### Recomendación 3.8

**Opción B (status quo + telemetry hook) con confianza media.**

**Razones:**

1. **El silent fallback es feature, not bug**: en Safari private mode, app debe seguir funcionando. Surface error al usuario en cada write sería UX-rompiente.
2. **Telemetry es middle ground**: preserva el resilience contract (silent fallback) y agrega visibility para diagnostic post-hoc.
3. **Confianza media** porque telemetry hook design depende de B8-state / D2 / D8 (E-async-states). Si E-async-states diseña telemetry framework, este sub-decision se hace cheap. Sin él, requiere infrastructure dedicada.

**Implementation plan:**
- Add telemetry hook stub en `storage.ts` (counter + opcional callback). No-op por default.
- Documentar política inline: "Silent fallback by design for resilience; telemetry hook available for diagnostic. Surface UX warnings depends on E-async-states sub-track decision."

**Trigger de reapertura:**
- E-async-states ratifica policy de surfacing degraded states → integrar storage telemetry en that policy.
- User-reported data loss attributable a silent fallback → reconsidering Option A.

---

## 4. Recomendaciones consolidadas

Resumen accionable de las 8 sub-decisiones de Sec 3. Cada renglón = (sub-decisión, opción recomendada, confianza, costo Fase 3 si se ratifica).

| # | Sub-decisión | Recomendación | Confianza | Costo Fase 3 |
|---|---|---|---|---|
| 1 | Política IDB-vs-LS | Opción B — shape-based criterion greppable (≤1KB + sync + per-browser → LS; resto → IDB) | **Alta** | Migración bucket B (4 sites) ~6-10h |
| 2 | Schema versioning | Opción B — opt-in con helpers `storageSetVersioned`/`storageGetVersioned` | Media | Add helpers ~2h; sin migración retroactiva |
| 3 | Multi-store transactions | Opción C — defer con triggers explícitos | **Alta** | Cero (comentarios inline ~30min) |
| 4 | zod boundary parsing | Opción B — mandatory user-generated, optional internal config | Media-alta | Add zod a saved-poses + installed plugins ~3-5h |
| 5 | Sync API policy | Opción A — ratificar cache-shadowing como exception | **Alta** | Cero |
| 6 | LS-only exception list | (Tratado en Sec 5; 4 buckets) | — | Bucket B migration ~6-10h (overlap con #1); resto ratificación cero-cost |
| 7 | Skill persistence | Ratificar separación + rename a `migrateLegacySkills()` | **Alta** | ~30min rename |
| 9 | Migration window policy | Opción B — indefinite no remove + comentario inline | Media | Cero |
| 10 | Storage quota / IDB unavailable | Opción B — telemetry hook (depends on E-async-states) | Media | Add hook stub ~1-2h |

### Costo total estimado Fase 3 (si todas las recomendaciones se ratifican)

**Optimista**: ~12-18h. Incluye migrations bucket B (overlap con sub-decisión #1), zod schemas para 2 sites mandatory (#4), rename skill persistence (#7), telemetry hook stub (#10).

**Pesimista (con bucket C decisiones individuales)**: ~18-24h. Incluye border-line decisions per-site, posibles refactors de consumers sync.

### Decisiones de mayor blast radius

Las que requieren tu atención más cuidadosa para review:

1. **Sub-decisión #1 (política IDB-vs-LS)** — define el criterio que clasifica los 15 LS sites. Si el criterio cambia (e.g., diferente threshold de tamaño, diferente definición de "sync access required"), todos los 4 buckets de Sec 5 se reclasifican.
2. **Sub-decisión #4 (zod boundary parsing)** — la tabla per-site clasifica 8 sites canonical. Reclasificar afecta cantidad de schemas que Fase 3 debe escribir.
3. **Sub-decisión #2 (schema versioning)** — opt-in vs mandatory afecta forever boilerplate per shape. Si en review preferís Opción A (mandatory), reabrir es costoso post-Fase 3.

Las otras 5 sub-decisiones son menor blast radius — fácilmente revisables sin reabrir scope.

---

## 5. LS-only exception list

15 LS sites totales clasificados en 4 buckets para policy ratification. Bucket A se ratifica directo (no decision needed); B agrupa migration candidates Fase 3; C requiere mini-decisión per-site; D documenta slice-internal patterns.

### 5.1 Bucket A — Trivially LS-only (5 sites, ratify policy direct)

Ratificación: **LS-only intentional, no migration**. Cumple el criterio de la sub-decisión #1: shape ≤1KB + sync-access required for render path or sub-millisecond user input + per-browser UX.

| File:Line | Key | Shape | Razón LS-only |
|---|---|---|---|
| `teachingContext.ts:43` | `openclo-teaching-mode` | `boolean` | UI flag, ephemeral per session; no cross-machine value. |
| `debug/debugAPI.ts:23-24` | `openclo-debug-bridge` | `string` ('true'/'false') | Debug flag; dev-only; no cross-machine. |
| `debug/DebugStore.ts:26` | `openclo-debug-records` | Array of debug events | Debug records buffer; ephemeral; bounded by retention; dev-only. |
| `Toolbar3D.tsx:30` | `SUBTOOL_STORAGE_KEY` | Subtool selection JSON (~100B) | UI state; sub-millisecond access during 3D render. |
| `UnifiedBar.tsx:105` | `openclo-bar-position` | `{ x: number, y: number }` | Capsule floating position; sub-millisecond access during drag handler; per-browser UX. |

### 5.2 Bucket B — Clear migration candidates a IDB canonical (4 sites, Fase 3 migration)

Migración: **Adoptar canonical IDB pattern post-policy ratification**. Cumple criterio user-generated config persistente con cross-machine sync value.

| File:Line | Key actual | Shape | Target IDB store + key | Notas Fase 3 |
|---|---|---|---|---|
| `costManager.ts:253, 356` | `openclo-budget`, `openclo-cost-history-{...}` | Budget number + cost history array | `settings: copilot-budget`, `settings: copilot-cost-history` | History puede crecer; considerar bounded retention en migration. |
| `userPreferences.ts:586` | `openclo-copilot-preferences` | `{ theme, language, modelDefaults: {...} }` | `settings: user-preferences` | User-generated config; cross-machine sync value alto. |
| `skills/marketplace.ts:39, 124` | `openclo-marketplace-registry-url`, `openclo-installed-skills` | URL string + skill metadata array | `settings: marketplace-config` (ambos en un blob) | Note: skill DB separado (`openclo_skills_v1`) maneja skill *runtime data*; este blob es solo metadata + registry config. |
| `ShortcutRegistry.ts:178` | `openclo-shortcuts` | Shortcuts dict `{ [actionId]: keyCombo }` | `settings: shortcuts` | User-defined; cross-machine sync value alto. |

**Migration path por site (Fase 3)**:
1. Add async loader (`load{X}Async`) con IDB-first + `migrateFromLocalStorage` fallback.
2. Add async writer routing through `storageSet`.
3. Update consumers (likely ~1-2 callers each) — cache pattern si sync API needed (sub-decisión #5).
4. Mantener legacy LS key constant per § 3.7 (indefinite, no remove).

### 5.3 Bucket C — Border-line, decisión per-site (3 sites + 1 verification)

Cada uno con mini-decisión explícita:

#### `AgentSettings.tsx:67` — language pref con `localStorage.setItem` raw

**Sub-decisión:**
- Sub-A: Migrate al canonical (ratifica criterio sub-decisión #1: cross-machine value para language pref).
- Sub-B: Wrap en `safeSetItem` y queda LS-only (consistencia con `teachingContext`/`debug`).

**Recomendación: Sub-A** (canonical migration). Razones:
- Language pref es persistent user-config con cross-machine value evidente (usuario que setea español en laptop espera mismo en desktop).
- Aligned con sub-decisión #1 criterion para bucket B.
- Costo equivalente al de bucket B sites (~1h dev).

#### `webgpuDetect.ts:44` — WebGPU feature flag

**Sub-decisión:**
- Sub-A: Migrate al canonical (cross-machine value: hardware capability persistente).
- Sub-B: LS-only (feature detection re-corre on first load anyway; valor es cache).
- Sub-C: Settings store dedicado con TTL (e.g., revalidate cada 7 días).

**Recomendación: Sub-B** (LS-only). Razones:
- WebGPU detection es per-browser per-device; cross-machine sync introduce confusión (laptop ARM vs desktop x86 puede diferir).
- Cache value ya es ephemeral by design (re-detected on first load if cache miss).
- Sub-C (TTL) es over-engineering para un boolean.

#### `SetupWizard.tsx:113` — onboarding completion flag

**Sub-decisión:**
- Sub-A: Migrate al canonical (cross-machine "this user already onboarded").
- Sub-B: LS-only (per-browser fresh onboarding por simplicidad; second device welcome is OK).

**Recomendación: Sub-A** (canonical migration). Razones:
- Cross-machine value: usuario que completa onboarding en laptop no debería re-do en desktop.
- Single-bit flag con shape estable; migration trivial.
- Aligned con bucket B criterion.

### 5.4 Bucket D — Slice-internal LS persistence (2 sites)

Slice-managed persistence (no canonical, no middleware). Documentación de patrón:

#### `layoutSlice.ts:53` (slice-internal `safeSetItem` helper)

**Decisión: Migrate al canonical en Fase 3.**

Razones:
- Layout state es shape >1KB (copilot position, tabs, primaryView, splitRatio, bottomPanel) — fuera del threshold sub-decisión #1 para LS-only.
- Cross-machine sync value: usuario que prefer copilot left en desktop probablemente espera mismo en laptop.
- Cost moderate (~3h): replace `loadLayoutFromStorage`/`saveToStorage` con async via `storageSet`/`storageGet`; sync fallback de LS legacy en initialState (igual que saved-poses).

#### `workflowSlice.ts:99` (slice-internal envelope con versioning + zod)

**Decisión: Mantener slice-internal, ratificar como precedente de versioning.**

Razones:
- Workflow state requiere versioning + strict zod (mature precedente de sub-decisión #2).
- Migrar al canonical IDB introduce overhead (cache pattern para sync access en confirmation middleware) sin clear benefit — workflow state es small + sync-required.
- Documenta inline en `workflowSlice.ts` el rationale: "Slice-internal LS persistence ratificada per B6-state Fase 2 § 5.4 — versioning + zod precedent. Sub-millisecond sync access required for confirmation middleware."

### 5.5 Resumen de buckets

| Bucket | Count | Acción | Costo Fase 3 |
|---|---|---|---|
| A — Trivially LS-only | 5 | Ratificar policy, comment inline | ~30min total |
| B — Clear migration | 4 | Adoptar canonical IDB | ~6-10h total |
| C — Border-line | 3 | Aplicar per-site decisión recomendada (2 migrate + 1 LS-only) | ~3h total |
| D — Slice-internal | 2 | layoutSlice migrate; workflowSlice ratificar | ~3h total |

**Total bucket A/B/C/D**: ~12-15h Fase 3 (overlap con sub-decisión #1 migration).

---

## 6. Cross-references / out-of-scope

Items que cruzan B6-state pero no entran a su scope, capturados explícitamente:

- **#644** AgentConfig → ProviderConfig migration. Shape/schema decision — eje D6 (fabric tipos x3) tiene shape similar para tipos de configuración. Tracked separately.
- **#645** AgenticLoop error surfacing 3-surfaces inconsistency. Input directo a E-async-states sub-track. La sub-decisión #10 de B6-state (storage quota / IDB unavailable) interactúa con E-async-states cuando arranque (telemetry hook integration).
- **`projectSchema.ts`** — JSON file boundary, NOT IDB read boundary. B6-state ratifica que la zod boundary parsing (sub-decisión #4) es policy a aplicar al **read IDB**; el JSON file path queda separate concern.
- **SecureStorage architecture** (`src/copilot/security/secureStorage.ts`). Encrypted secrets en sessionStorage AES-GCM. Boundary "non-secrets en IDB, secrets en SecureStorage" se ratifica acá. Lifecycle / encryption design es separate concern.
- **Plugin sandbox storage** (`PluginBridge.ts:622`). Boundary de aislamiento de plugins. Out of cualquier eje del audit.
- **3 LS-only legitimate** (ProjectMemory, DesignLogManager, projectIO quarantine) — ya tratados en BUG-10 § 9. Ratificación final acá:
  - **ProjectMemory**: Class API explícitamente dual con functional API IDB-async. Ratificada como exception. Documentar inline el split.
  - **DesignLogManager**: Per-project session log. **Sub-decisión menor**: migrar a canonical IDB? Recomendación: **migrate** (consistency con per-project memory pattern, low cost). Costo ~2h.
  - **projectIO quarantine**: Deliberately LS-only por resilience (Safari private mode survival). Ratificada como exception explícita. Documentar inline.

- **`errorRecovery.ts:345`** (defensive cleanup, no regular write): `safeSetItem(FALLBACK_PROVIDER_KEY, JSON.stringify(rest))` dentro de `clearLegacyFallbackKeys()` — escribe el config sin apiKey al LS legacy como parte del scrub de API keys legacy. Solo se ejecuta una vez por usuario con datos pre-2026-03-23. **Out of B6-state policy scope**: no es persistence de regular runtime data; es one-shot security cleanup. Ratificada como tal post-BUG-10. Eventually obsoleta cuando todos los usuarios hayan corrido el scrub al menos una vez (per § 3.7 indefinite-no-remove policy, queda forever sin costo).

### Issues nuevas que B6-state genera (todavía no abiertas)

Después de tu ratificación, abrir:

- `[audit-followup] B6-state policy ratification — Fase 3 migrations` (severity:low, audit, follow-up). Lista las 4+3+1+1 = ~9 migrations que Fase 3 debe ejecutar.
- `[audit-followup] B6-state Sec 3.6 — rename SkillPersistence.migrateFromLocalStorage to migrateLegacySkills` (severity:low). Naming collision fix.
- `[audit-followup] B6-state Sec 3.8 — telemetry hook in storage.ts for IDB-unavailable / quota-exhaustion events` (severity:low, audit, follow-up). Hook stub + integration con E-async-states.

---

## 7. Decisión revisable: triggers para reabrir post-cierre

Esta sección hace explícitos los criterios que justifican reabrir B6-state como sub-RFC posterior. Sin ellos, la ratificación es **stable**.

### Triggers de reapertura

1. **Sub-decisión #1 (IDB-vs-LS)**: si en future eje aparece un site que claramente cumple el criterio LS-only legitimate pero falla a otra dimensión (e.g., cross-machine value emerge tras feature evolution), reclasificar y reabrir el criterio.
2. **Sub-decisión #2 (versioning)**: shape change shipped sin versioning donde después se necesitó migration urgent → reabrir como `B-revised` con enforcement (custom ESLint rule o tipo wrapper que requiere envelope).
3. **Sub-decisión #3 (multi-store)**: bug report de inconsistencia inter-store que no se resuelve con read-side cleanup → reabrir como Opción A (transaction wrapper).
4. **Sub-decisión #4 (zod boundary)**: corruption bug observado en uno de los 4 sites clasificados como "internal" → reclasificar y agregar zod.
5. **Sub-decisión #5 (sync API)**: bug observado de "stale cached value" en producción, o tercer cache site emerge → reabrir como Opción C (canonical helper extraction).
6. **Sub-decisión #6 (LS exception list)**: cualquier site bucket A reabierto por evolución de features (ej. "teaching mode" se vuelve cross-machine).
7. **Sub-decisión #9 (migration window)**: acumulación de >5 distintos `migrateFromLocalStorage` paths en archivos individuales → reabrir como Opción A o C con tracking explícito.
8. **Sub-decisión #10 (storage quota)**: E-async-states ratifica policy de surfacing degraded states → integrar storage telemetry en that policy.

### Triggers que NO justifican reapertura

- Sub-decisión #7 (skill persistence): el rename + ratificación está cerrado. Si emerge necesidad de absorber skill DB en canonical, eso es eje propio (no sub-decisión de B6-state).
- Cambios en SecureStorage architecture: separate concern.
- Issues #644 (AgentConfig migration) o E-async-states activación: no afectan B6-state policy.

### Cuándo cerrar B6-state como axis

B6-state se considera **cerrado** cuando:

1. Esta nota está mergeada en main (PR #653 cerrado).
2. Fase 3 migrations (los ~9 sites identificados en buckets B, C-migrate, D-migrate, plus DesignLogManager) están mergeadas.
3. Issues de follow-up (#3 issues nuevas en Sec 6) están abiertas y trackeadas.
4. Inventory annotation post-merge en `docs/reports/2026-04-28-drift-inventory-fase1.md` captura el closure (mismo pattern que B11/B12/C5/C7/B4/B5/C8/D1/BUG-10).

Ningún trigger preventa este closure path.

---

## 8. Lo que NO decide

Para evitar pre-empt de ejes futuros:

- **Multi-store transaction API design** — defer per § 3.3 Opción C. Si Fase 3 emerge necesidad, eje propio.
- **Versioning enforcement automation** — defer per § 3.2 Opción B. ESLint rule o type wrapper son future option, no current scope.
- **zod schemas concretos para los 5 sites IDB sin parse** — § 3.4 ratifica policy; los schemas concretos los escribe Fase 3.
- **SecureStorage refactor** — completely out of scope.
- **Plugin sandbox storage policy** — out of scope.
- **Storage quota UX (warning banner, status indicator)** — depends on E-async-states. § 3.8 ratifica telemetry hook only.
- **Migration cleanup commits** — § 3.7 Opción B (indefinite). Future eje puede revisitarlo.

---

## 9. Cross-references

- **Issue principal**: [#613](https://github.com/sssamuelll/openclo/issues/613) (BUG-10, cerrado vía PR #652)
- **Note input**: [`docs/reports/2026-04-30-bug-10-fix-options.md`](./2026-04-30-bug-10-fix-options.md) (mergeada en main vía PR #646)
- **Implementation precedent**: PR #652 (merged → `7274c25`)
- **Inventory entry**: `docs/reports/2026-04-28-drift-inventory-fase1.md` líneas 186–195 (B6-state pre-investigation)
- **Classification entry**: `docs/reports/2026-04-28-drift-fase2-classification.md` § (b) eje B6-state
- **Methodology rules anchors**: regla 1 v2 (`001ea93`), regla 1 v3 (`36ba16b`), inventory misclassification rule (CLAUDE.md "Inventory misclassification is itself drift to capture")
- **Related future ejes**:
  - E-async-states (B8-state + D2 + D8) — sub-decisión #5 (sync API) + #10 (storage quota) interactúan.
  - C1 RFC (buffer lifecycle Three.js) — independiente.
  - A2 / A4 / A6 / A7 (Rust↔WASM↔JS bridge) — independientes.
- **Origin commits del double-write (BUG-10 history)**: `4f6f5fa` (2026-02-23), `4a115f73` (2026-03-02), `84c9d18a` (2026-03-23), `e2e66212` (2026-03-24).
- **Adversarial self-review pendiente**: antes de marcar PR #653 como ready-for-review, hacer pase con regla 1 v3 + adversarial self-review (precedente C5: catched B1 PolyPen latent bug). Específicamente:
  - Verificar que la tabla de § 3.4 (zod classification) cubre los 8 sites canonical sin gaps.
  - Verificar que los 15 LS sites de § 5 cubren todos los `localStorage.setItem`/`safeSetItem` en producción (re-grep al final).
  - Verificar que la sub-decisión #1 criterion no excluye casos border que aparezcan en review.

