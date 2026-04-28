# Inventario de drift — Fase 1 (solo lectura)

**Fecha:** 2026-04-28
**Alcance:** Auditoría completa del repo OpenClo en busca de "ejes" — cosas que se hacen en >1 lugar de >1 manera.
**Método:** 4 exploradores en paralelo cubriendo (A) bridge Rust↔WASM↔JS, (B) state management, (C) rendering/coords/unidades, (D) naming/errores/forms/layering.

---

## Resumen ejecutivo

- **30 ejes inventariados.**
- **18 con drift real** (vale la pena unificar).
- **5 con drift cosmético** (decidir caso a caso si vale la pena).
- **7 sin drift / justificado** (no tocar).
- **13 BUGS reales detectados** durante la auditoría — **no son drift**, son comportamientos divergentes que deben trackearse aparte (ver sección dedicada).

> Los ejes con asterisco (★) son los que tienen mayor riesgo / ROI alto si se unifican. Sugerencia para priorizar Fase 2.

---

## BUGS encontrados (NO son drift — requieren fix aparte)

Estos aparecieron mientras inventariábamos. Son comportamientos genuinamente incorrectos, no variantes equivalentes que haya que unificar. **Recomendación:** abrir issues separados; no mezclar con el plan de unificación.

### B1 ★ — WASM bend constraints reciben ángulos donde Rust espera distancias
- `src/utils/cloth/gpu/gpuBuffers.ts:237–241` calcula `restAngles` como ángulo diedro en radianes (0–π).
- `src/utils/cloth/wasm/wasmSolverWorker.ts:354` los pasa a `solver.set_bend_with_types(...)`.
- `crates/xpbd-wasm/src/lib.rs:441` (`solve_bend`) los trata como distancias en metros.
- **Síntoma:** WASM tier produce bending rígido / asimétrico; CPU usa distancias correctas (`xpbdSolver.ts:545–549`).

### B2 ★ — Fricción de superficie no funcional en WASM tier
- `src/utils/cloth/wasm/wasmSolverWorker.ts:163` llama `solveTriangleCollision(...)` **sin pasar `prevPos`**.
- `src/utils/cloth/xpbdSolver.ts:1354–1365` (CPU path) sí pasa `prevPos`.
- **Síntoma:** `body.friction > 0` se ignora silenciosamente en WASM. La cloth resbala como si friction=0.

### B3 ★ — Seams siempre infinitamente rígidos en WASM
- `crates/xpbd-wasm/src/lib.rs:460–495` (`solve_seams`) hardcodea `alpha = 0.0 / (sdt * sdt)`.
- `tension`/`strength` de `SeamInitData` se ignoran.
- **Síntoma:** seams comportamiento idéntico para cualquier valor de tensión en WASM tier; CPU sí respeta el valor.

### B4 — `setConfig` en WASM worker solo actualiza `substeps`
- `src/utils/cloth/wasm/wasmSolverWorker.ts:503–508` extrae solo `substeps`.
- Cambios runtime a `damping`, `gravity`, `dragCoefficient`, `selfCollision`, etc. son no-ops silenciosos.

### B5 — Self-collision muerta en WASM tier
- Rust solver tiene campo `self_collision` y método `set_adjacency`, pero el worker nunca llama `set_adjacency`.
- `config.selfCollision` se pasa a `configure()` pero queda siempre en `false` por default en `wasmSolverWorker.ts:401`.

### B6 — `cellSize` de spatial hash hardcoded en WASM worker
- WASM: `0.05` fijo (`wasmSolverWorker.ts:439, 451, 458`).
- CPU: adaptativo `Math.max(0.02, clothThickness * 10)` (`xpbdSolver.ts:699`).
- Para tela de 2mm: CPU=0.02, WASM=0.05 → resolución de colisión distinta entre tiers.

### B7 ★ — `linkedEditing` rompe undo de un solo paso
- `src/store/linkedEditingMiddleware.ts:81` despacha `updatePiece` secundario para sincronizar el partner.
- `undoMiddleware` ve este segundo dispatch y crea un snapshot extra.
- **Síntoma:** Ctrl+Z una vez revierte solo al partner; hay que hacer dos Ctrl+Z para deshacer una edición linked.

### B8 — `ACTION_LABELS` en undoMiddleware referencia action types inexistentes
- `src/store/undoMiddleware.ts:148–150`: `'project/setFabric'`, `'project/setAvatarMeasurements'`, `'project/setSeamAllowance'`, `'project/importPieces'`, `'project/applyGrading'`, `'project/updateGrainLine'` — ninguno existe en `projectSlice.ts`.
- **Síntoma:** History panel muestra labels falback con nombres incorrectos.

### B9 — Geometrías Three.js no dispuestas (memory leak GPU)
- `src/components/Viewport3D/GarmentSimulation.tsx:255` — `useMemo` recrea `staticGeometry` sin cleanup.
- `src/components/Viewport3D/FloorGrid.tsx:57–61`, `Mannequin.tsx:96–99` — geometrías sin `.dispose()` al desmontar.
- **Síntoma:** GPU memory crece con cada toggle de avatar / re-mesh.

### B10 — Doble escritura `localStorage` + IndexedDB sin transacción atómica
- `src/store/avatarSlice.ts:204–209`: poses escritas a ambos storages simultáneamente.
- Mismo patrón en `agent-config` y otros 3 lugares.
- **Síntoma:** si una escritura falla y la otra no, los dos backings divergen sin detección.

### B11 — Prefijos de localStorage inconsistentes (`webclo-` vs `openclo-`)
- `src/utils/cloth/gpu/webgpuDetect.ts:49`: `'webclo-use-webgpu'`.
- Resto del codebase: `'openclo-*'` (workflow, layout, agent-config).
- **Síntoma:** keys huérfanas si se renombran inconsistentemente en migraciones.

### B12 — `defaultSeamAllowanceWidth: 10` hardcoded sin importar de `defaults.ts`
- `src/store/editorSlice.ts:17` hardcodea `10`.
- `src/utils/defaults.ts:13` declara `DEFAULT_SEAM_ALLOWANCE = 10`.
- Mismo valor, fuentes distintas. CLAUDE.md prescribe single source of truth — incumplido.

### B13 — `pluginSlice.enabledPlugins[]` redundante con `installedPlugins[].enabled`
- Dos representaciones del mismo estado de activación; ambos reducers escriben a los dos.
- **Síntoma:** si la carga desde localStorage rehidrata uno solo, la app queda inconsistente.

### B14 — `protocol.ts` posiblemente código muerto
- `src/copilot/protocol.ts` define `CopilotCommand`/`CopilotResponse`/`CopilotContext` para un agente externo HTTP/WebSocket.
- El sistema actual usa `AgenticLoop` con providers; ese flujo ya no existe.
- **Acción:** confirmar y eliminar.

### B15 — Evento `error` del `AgenticLoop` no manejado en hook
- `src/copilot/reasoning/bridge/AgenticLoop.ts` emite eventos `{ type: 'error' }`.
- `src/copilot/hooks/useAgenticLoop.ts` solo maneja `tool:start`/`tool:complete`/`tool:error`/`complete`.
- **Síntoma:** errores de loop (red caída, etc.) no actualizan estado UI.

---

## Grupo A — Bridge Rust ↔ WASM ↔ JS

### A1 — WASM export surface (`positions_ptr` zero-copy vs copy-in setters)
- **Estado:** sin drift / justificado.
- Variantes: pointer exports (read path, zero-copy) vs `&[f32]` setters (write path, una vez al init).
- **Recomendación:** no tocar.

### A2 ★ — Cross-boundary serialization
- **Estado:** drift real.
- Variantes:
  - **A.** Zero-copy via `new Float32Array(mem.buffer, ptr, n)` (~8 usos en `wasmSolverWorker.ts:133–135, 276`).
  - **B.** Copia completa en init / snapshots (~10 usos).
  - **C.** Config campo a campo, 16 args posicionales (`wasmSolverWorker.ts:395–412`, `lib.rs:226`).
- **Diferencia funcional:** Variante C no tiene tipo compartido. CPU worker acepta `Partial<ClothSimConfig>` tipado; WASM acepta objeto plano con defaults hardcoded. Agregar parámetro al `configure()` Rust requiere tocar el worker manualmente — propenso a desincronizar.
- **Detalle adicional:** `bendCompliance` default difiere entre workers (WASM=0.01, CPU=1.0).

### A3 — Cross-boundary error handling
- **Estado:** drift real.
- Variantes:
  - **A.** `panic!` Rust sin `console_error_panic_hook` → aborta instancia silenciosamente.
  - **B.** try/catch global en worker → `postMessage({type:'error'})`.
  - **C.** NaN guard en colisión → reset silencioso a `prevPos` sin reportar (`wasmSolverWorker.ts:166–178`).
- **Diferencia funcional:** un panic Rust no genera error observable; un NaN se enmascara sin log.

### A4 ★ — Geometry / mesh ops Rust ↔ TS
- **Estado:** drift real (con bugs anidados, ver B1).
- Variantes:
  - Spatial hash: 2 implementaciones TS distintas (`triangleCollision.ts:95` `TriangleSpatialHash` vs `selfCollision.ts:53` `SpatialHashGrid`). Rust no tiene spatial hash.
  - Constraint extraction: 2 implementaciones TS (`gpuBuffers.ts:150` `Set<string>` vs `xpbdSolver.ts:403–440` `findTriNeighbors`). Diferentes tipos (`Uint32Array` vs `Int32Array`).
  - Bend rest semantics: ver bug B1.
- **Diferencia funcional:** real — afecta numérica del WASM tier.

### A5 — Imports / layering del WASM en JS
- **Estado:** sin drift.
- Único punto de import: `wasmSolverWorker.ts:311`. UI siempre accede via `WasmSolverClient`. Arquitectura limpia.

### A6 ★ — Worker message protocol asimétrico
- **Estado:** drift real.
- CPU-only messages (~9): `init`, `reset`, `step`, `setFabric`, `setGravity`, `setConfig` (full), `setSphereColliders`, `setCapsuleColliders`, `pinParticle`, `unpinParticle`.
- WASM-only messages (~4): `applyInitialTriangleCollision`, `setWind`, `setElastics`, `setConfig` (solo substeps).
- Compartidos (~14): `setCollisionMesh`, `saveSnapshot`, etc.
- **Diferencia funcional:** sí, cambiar fabric/gravity en runtime solo funciona en CPU. `pinParticle` (CPU: masa=0) vs `setPins` (WASM: posición target) tienen semántica distinta. No hay interface común entre `ClothWorkerClient` y `WasmSolverClient`.

### A7 ★ — WASM vs CPU solver: equivalencia comportamental
- **Estado:** drift real con consecuencias funcionales.
- 6 divergencias documentadas:
  1. Adaptive substeps solo CPU (10–30 vs WASM fijo en 15).
  2. Velocity clamp: CPU en `postSolve`; WASM en JS wrapper externo.
  3. Friction de cuerpo no funcional en WASM (bug B2).
  4. Self-collision no operativa en WASM (bug B5).
  5. LRA / pressure / fold / piece stiffness solo CPU (4 features ausentes en Rust).
  6. Seam compliance siempre 0 en WASM (bug B3).

---

## Grupo B — State management

### B1-state — Slice patterns (RTK `createSlice` everywhere)
- **Estado:** sin drift.
- 21/21 slices usan `createSlice`. No hay reducers hand-rolled. Coherente.

### B2-state — Forma de colecciones de entidades
- **Estado:** drift real.
- Variantes:
  - Array plano + `find`/`findIndex` (16/21 slices, entidades primarias: pieces, seams, trims).
  - `Record<id, T>` (15+ campos secundarios: pieceFabrics, pinnedVertices).
  - RTK `EntityAdapter` (0 usos).
- **Diferencia funcional:** ninguna en runtime hoy (colecciones <200 elementos), pero `pinnedVertices` (Record) sería el caso natural para EntityAdapter mientras `pieces` (array) no — la elección actual es invertida.

### B3-state ★ — Mutaciones del estado: quién escribe
- **Estado:** drift real (especialmente Variante D).
- Variantes:
  - `dispatch` desde componentes (dominante).
  - `execute(params, dispatch, getState)` desde tools copilot (~231 tools, uniforme).
  - `store.getState()` directo al singleton (2 callsites en `CopilotPanel`).
  - **Middleware dispatching en cascada** — fuente del bug B7 (linkedEditing+undo).

### B4-state — Selectors / derivaciones
- **Estado:** drift cosmético.
- Variantes: inline `useSelector` (mayoría), selectores nombrados solo en `bomSlice.ts` (5 selectores), 0 usos de `createSelector` (reselect).
- **Riesgo concreto:** `selectBOMForColorway` construye array sin memo → fuerza re-render global si se usa sin `shallowEqual`.

### B5-state — Patrones de middleware
- **Estado:** drift cosmético.
- Variantes: factory function (2: confirmation, reactiveSolver) vs constante exportada (3: undo, linkedEditing, gradingStaleness).
- Convención de `meta` flags (`skipConfirmation`, `fromToolMemory`) inconsistente — no hay tipo central.

### B6-state ★ — Persistencia
- **Estado:** drift real.
- Variantes:
  - localStorage sync inline en reducer (`layoutSlice.ts:72`).
  - localStorage sync debounced con versioned envelope (`workflowSlice` — único con versionado).
  - IndexedDB async via `storageSet` (proyectos, plugins).
  - **Doble escritura localStorage+IDB** (avatarSlice, agent-config — ver bug B10).
- **Diferencia funcional:** real. Tres estrategias para tres categorías; doble-escritura es propensa a divergencia.

### B7-state — Zustand vs Redux
- **Estado:** sin drift. Zustand no está en `package.json`. La referencia en CLAUDE.md a `stores/` es vestigial. Solo Redux + RTK + `useState` local para estado transitorio.

### B8-state ★ — Loading / error / empty states (capa de estado)
- **Estado:** drift real. Ver también C8 (capa de render).
- Variantes:
  - Estado en Redux (~3 slices: inspector, simulation, animation).
  - Estado en `useState` local (CopilotPanel, AgenticLoop).
  - **Sin estado** (~10 features: nesting, grading, BOM extraction, DXF export, mesh import, WASM init, RAG search).

### B9-state — Copilot tools como writers
- **Estado:** sin drift.
- Firma uniforme `execute(params, dispatch, getState) => Promise<ToolResult>` en ~231 tools. Campo `rollback?` opcional, raramente implementado (encontrado 0 implementaciones).

### B10-state ★ — Fuente de verdad: estado superpuesto
- **Estado:** drift real.
- Casos:
  - `project.pieces[].fabricId` vs `simulation.pieceFabrics` (2 mappings de tela; legacy + activo).
  - `project.avatar.measurements` vs `parametric.baseMeasurements` (resuelto con OR hardcoded en `reactiveSolverMiddleware.ts:233`).
  - `project.arrangementOverrides` vs `simulation.arrangementSnapshot` (conceptos distintos pero confundibles).

### B11-state — Generación de IDs
- **Estado:** drift real.
- Variantes:
  - `uid()` interno (~3 callsites).
  - `${Date.now()}-${Math.random().toString(36)}` (~8 en projectSlice + constructionSlice).
  - `crypto.randomUUID()` (~4 en bomSlice, copilotUI, linkedEditing).
- **Diferencia funcional:** `Date.now()+random` puede colisionar bajo batch ops del copilot en mismo ms.

### B12-state — Cobertura de `NEW_PROJECT` reset
- **Estado:** drift cosmético.
- 15 slices reset total, 3 reset selectivo (workflow, avatar, bom — preservan settings de app), 3 sin handler (plugin, renderSettings, marker — ¿intencional?).

> **Estado real (verificado 2026-04-28 durante Fase 2):** canónico ya existía cuando se escribió este inventario. `src/store/newProjectRegistry.ts` formaliza la política y `src/store/__tests__/newProjectReset.test.ts` la enforce con 27 tests (5 invariantes). `markerSlice` SÍ resetea (estaba mal-clasificado en este inventario); `pluginSlice` y `renderSettingsSlice` están documentados con reason explícita (no "asumiblemente intencional"). Eje cerrado por ratificación — ver `drift-fase2-b12state-newproject-reset.md`. Ningún cambio de código.

---

## Grupo C — Rendering / coordenadas / unidades

### C1 ★ — Buffer / attribute lifecycle Three.js
- **Estado:** drift real (con leaks documentados — bug B9).
- Variantes:
  - `new BufferGeometry` imperativo en `useMemo` sin cleanup (~8 sitios; leaks).
  - `StorageBufferAttribute` TSL (lifecycle gestionado por `GpuSolverClient`, correcto).
  - `Float32BufferAttribute` inline en geometrías paramétricas (FloorGrid, Mannequin — leak).

### C2 — Scene graph patterns / R3F
- **Estado:** drift real, parcialmente justificado.
- Variantes:
  - JSX declarativo (~10 componentes, dominante, lifecycle automático).
  - `new MeshStandardNodeMaterial()` imperativo (1 sitio justificado: TSL needs storage node refs).
  - `<primitive object={scene}>` para meshes externos (2 sitios sin disposal).
  - `useLoader` para GLTF + `useEffect` manual para OBJ/FBX en el mismo `AvatarModel.tsx` (ver C7).

### C3 — Pipeline 2D
- **Estado:** sin drift / justificado.
- SVG declarativo para edición de patrones (PatternEditor); `<canvas>` 2D para nesting. Justificado por caso de uso (interactividad por elemento vs render estático masivo).

### C4 ★ — TSL / WebGPU compute coexiste con WASM/CPU activo
- **Estado:** drift real.
- 3 paths activos simultáneamente (WebGPU/TSL feature-flagged off, WASM default, CPU TS fallback).
- `GarmentSimulation.tsx:380–493` bifurca en `if (solver)` y duplica lógica de tools (steam brush, mesh grab) para los dos paths: TSL usa uniforms; WASM usa `setPins`. Tres handlers afectados (`handlePointerDown`, `handlePointerMove`, raycaster).

### C5 ★ — Sistemas de coordenadas y transforms
- **Estado:** drift real.
- 4 espacios:
  - Pattern space: mm, Y-down, origen top-left (SVG).
  - Three.js world: metros, Y-up.
  - Nesting: mm, Y-down, escalado local.
  - Mannequin: cm → metros con `*0.01` inline.
- **Conversiones repetidas inline sin utilidad central:**
  - `(e.clientX - rect.left - pan2D.x) / zoom2D` se repite literalmente en ≥6 sitios (PatternEditor + cada hook de tool).
  - mm→m con `0.001`, `/1000`, `/100` (cm→m), todos hardcoded en distintos sitios. `PieceMesh.tsx:14` no importa de `defaults.ts`.

### C6 ★ — Unidades & medidas
- **Estado:** drift real.
- Convención mayoritaria: mm internamente (~95% del código).
- **Excepción problemática:** `BodyMeasurements` está en cm sin documentar (`height=170` significa 170cm). `PatternPiece.seamAllowance` en mm. No hay branded type (`type Mm = number & {_mm}`) que prevenga mezclas. Ver bug B12.
- Rust solver opera en metros (asume conversión previa).

### C7 — Camera / viewport controls
- **Estado:** drift cosmético / justificado.
- 3D: OrbitControls (drei) + pan manual con PointerCapture (Viewport3D.tsx:207–237 reimplementa lo que OrbitControls ya tiene, solo para cambiar mapeo de botones).
- 2D: zoom/pan en Redux (`zoom2D`, `pan2D`).
- `react-zoom-pan-pinch` está en deps pero no se usa en viewports principales.

> **Estado real (verificado 2026-04-28 durante Fase 2):** axis cerrado como **no-drift, misclassified**. El custom pan es feature intencional con semántica deliberadamente distinta de OrbitControls native pan (pan mueve solo `camera.position`, target queda fijo en avatar para preservar orbit-around-avatar). El inventario hizo lectura superficial sin verificar la diferencia semántica. Hallazgo separado durante la investigación: `patchMouseButtons` polling workaround (Viewport3D.tsx:184–201) es drift real pero es su propio axis — capturado como issue **#629**, NO incluido en el cierre de C7. Ratificado en `drift-fase2-c7-camera-controls.md`. Ningún cambio de código para C7.

### C8 — Mesh import normalization (bypass parcial)
- **Estado:** drift real.
- `meshImporter.importMesh` es el path canónico (con safety, warnings, ImportResult).
- `AvatarModel.tsx:169, 217–269` bypassa: usa `useLoader(GLTFLoader)` para GLTF y `loadAsync` directo para OBJ/FBX, con normalización propia inline. Sin límite de tamaño (vs `MeshImportLimitError` del path canónico). El `useLoader` con `'/default-avatar.glb'` dummy puede cargar modelo fantasma cuando el formato no es GLTF.

---

## Grupo D — Naming, errores, forms, layering

### D1 — Nomenclatura de dominio (concepto por concepto)

| Concepto | Variantes encontradas | Drift real? |
|---|---|---|
| Pattern Piece / Block / Sloper | `PatternPiece` (~300+), `Piece` (var), `CPiece` (~30, distinto), `Block` (~10, blueprint), `Sloper` (0) | Cosmético. `Block` en `blueprint.ts` vs `blockId` en CPoint — overlap confuso. |
| Seam / Edge / Stitch | `Seam` (~150, conexión), `SemanticEdge` (~40, borde geom), `SeamGroup` (~15), `Stitch` (5, solo en tool name) | Sin drift. Bien diferenciado. |
| Dart / Pleat / Tuck | `Dart` rico (~30) **vs** `InternalLine{type:'dart'}` (~20) | **Drift real.** Misma entidad, dos representaciones; `extractDarts` adapta. Migración incompleta. |
| Measurement / Dimension / POM | `BodyMeasurements`, `PointOfMeasure/POM`, `measureDistance` tool, `modifyDimension` tool | Cosmético. 3 rutas para "medir" desde copilot — confuso para LLM. |
| Trim / Notion / Hardware | `Trim` (~80), `Notion` (0), `Hardware` (0) | Sin drift. `trim` canónico. |
| Notch / Mark / Marker | `notch` (~30, muesca), `Marker` (~15, layout corte papel) | Sin drift. Conceptos industria distintos. |
| Grain / Grainline | `GrainLine` tipo, `grainLine` prop (~40), `grainline` InternalLineType (~15) | Cosmético — 3 casings. Y dualidad rico vs InternalLine como en Dart. |
| Pattern / Blueprint / Template | `Blueprint` (construcción), `template` (Seamly2D import), `pattern` (genérico) | Sin drift; conceptos distintos. |

### D2 ★ — Manejo de errores JS (4+ estrategias conviven)
- **Estado:** drift real.
- Variantes:
  - **A.** `ToolResult { success: false, error }` — patrón canónico en ~150 callsites de tools copilot. Correcto.
  - **B.** `throw new Error` — ~40 callsites. Atrapado por AgenticLoop globalmente, pero en utils sueltas el llamador debe capturar.
  - **C.** `console.error` / `console.warn` y continuar — ~30+ callsites. No llega a UI.
  - **D.** Swallow silently `catch { /* ignore */ }` — ~8. Aceptable para localStorage degradable, cuestionable para agent config.
  - **E.** `return null` / `return undefined` — ~20. Propagación silenciosa con `??`.
  - **F.** Toast custom (`copilotUISlice.showToast`) — mecanismo existe pero infrautilizado; no hay librería externa de toast.

### D3 — Forms / inputs
- **Estado:** drift real.
- No hay librería de forms (no react-hook-form, no formik). Confirmado.
- Patrones:
  - Controlled + dispatch en cada keystroke (~30 inputs).
  - `parseFloat(...) || 0` en onChange (~10 numéricos) — **antipattern**: campo vacío salta a 0.
  - Sin validación visible.
- **Zod presente** (`v4.3.6` en deps) pero usado solo en 3 schemas de validation.ts del copilot. UI no usa Zod.
- **No hay componente reutilizable** `MeasurementInput` / `UnitInput` para mm/cm/in. `UnitSystem = 'mm'|'cm'|'inches'` definido en types pero conversión inexistente en componentes.

### D4 — Composición de componentes / dónde vive el estado
- **Estado:** drift real.
- `CopilotPanel.tsx` tiene **11 `useState`** inline + lógica de envío sin extraer a hook (vs InspectorTab/AgenticLoop que sí están en hooks). Historial de mensajes en estado local — se pierde al desmontar.
- Mezcla de container/presentational: `BodyItem` recibe `dispatch` como prop; `CategoryGroup` (BOMTab) usa el patrón correcto (callbacks).

### D5 — Imports / layering
- **Estado:** mayormente OK con violaciones puntuales.
- `components/CopilotPanel/CopilotPanel.tsx` importa 17 símbolos de `copilot/` (esperable; es la UI del copilot pero acopla fuerte).
- `components/ProgressMessage/ProgressMessage.tsx:2` importa de `copilot/hooks/`.
- `store/confirmationMiddleware.ts` importa de `store/copilotUISlice.ts` (acoplamiento bidireccional store↔copilot).
- `store/reactiveSolverMiddleware.ts` importa de `utils/construction/`, `utils/seamly2d/` (aceptable, orquestación).
- **Capa `core/` documentada en CLAUDE.md no existe** — el motor de patrones vive mezclado en `utils/`.

### D6 ★ — Tipos de Fabric duplicados
- **Estado:** drift real.
- 3 tipos para "tela":
  - `Fabric` (`types.ts:393`) — simple. Lo usa BOM y `project.fabrics[]`.
  - `PhysicalFabric` (`utils/cloth/physicalFabric.ts`) — rico, con KES/FAST. Lo usa el simulador.
  - `FabricMaterial` (`utils/cloth/fabricLibrary.ts`) — intermedio.
- Migración a `PhysicalFabric` en curso pero los tres coexisten.

### D7 — Tipos de Diagnostic duplicados
- **Estado:** drift cosmético.
- `ValidationDiagnostic` (`utils/projectValidator.ts:32`) — para validación al cargar.
- `Diagnostic` (`diagnostics/types.ts:103`) — para inspector.
- Campos parecidos (severity, message, detail), tipos distintos, sin adaptador.

### D8 ★ — Cobertura de loading / error / empty UI
- **Estado:** drift real con brechas críticas. (Solapa con B8-state.)
- Brechas:
  - `CollisionBodyMesh.tsx:42–44`: `importMesh` falla con `console.warn`, sin error en panel.
  - `wasmSolverWorker.ts:324`: si no puede acceder a `WebAssembly.Memory`, continúa con posiciones en cero, sin feedback.
  - Loading no manejado en `useAgenticLoop` para evento `error` del loop (bug B15).
  - `validateAndRepairProject` produce diagnósticos al cargar pero ningún componente los muestra.
  - Worker pool de construcción paramétrica sin UI de estado.

---

## Tabla resumen para Fase 2

| ID | Eje | Estado | Prioridad sugerida |
|---|---|---|---|
| A1 | WASM export surface | sin drift | — |
| A2 ★ | Cross-boundary serialization | drift real | M |
| A3 | Cross-boundary error handling | drift real | M |
| A4 ★ | Geometry/mesh ops Rust↔TS | drift real | L (anidados con bugs) |
| A5 | Imports WASM en JS | sin drift | — |
| A6 ★ | Worker message protocol | drift real | M |
| A7 ★ | WASM vs CPU equivalencia | drift real | XL (bugs separan; lo que queda es S/M) |
| B1-state | Slice patterns | sin drift | — |
| B2-state | Forma de colecciones | drift real | S |
| B3-state ★ | Mutaciones / cascada middleware | drift real | M |
| B4-state | Selectors | drift cosmético | S |
| B5-state | Middleware patterns | drift cosmético | S |
| B6-state ★ | Persistencia | drift real | M |
| B7-state | Zustand vs Redux | sin drift | — |
| B8-state ★ | Loading/error states (estado) | drift real | M |
| B9-state | Copilot tools writers | sin drift | — |
| B10-state ★ | Fuente de verdad superpuesta | drift real | M |
| B11-state | ID generation | drift real | S |
| B12-state | NEW_PROJECT reset | drift cosmético | S |
| C1 ★ | Buffer lifecycle Three.js | drift real | M (con bug B9) |
| C2 | Scene graph R3F | drift parcial | S |
| C3 | Pipeline 2D | sin drift | — |
| C4 ★ | TSL/WebGPU coexistence | drift real | L (afecta arq.) |
| C5 ★ | Coord systems / transforms | drift real | M |
| C6 ★ | Unidades & medidas | drift real | M |
| C7 | Camera/viewport controls | cosmético | S |
| C8 | Mesh import bypass | drift real | S |
| D1 | Nomenclatura dominio | mixto | S–M (Dart/InternalLine concretamente) |
| D2 ★ | Error handling JS | drift real | M |
| D3 | Forms / inputs | drift real | M |
| D4 | Composición componentes | drift real | S |
| D5 | Imports / layering | OK con violaciones | S |
| D6 ★ | Fabric tipos triples | drift real | M |
| D7 | Diagnostic tipos | cosmético | S |
| D8 ★ | Loading/error UI | drift real | M (solapa B8) |

**Tamaños:** S = 1 commit pequeño, M = varios commits acotados, L = requiere subdividir en sub-ejes, XL = no abordar como un solo eje.

---

## Recomendaciones para Fase 2 (siguiente paso)

1. **Tratar los 15 BUGS aparte** — issues separados, no se "unifican". B1, B2, B3 (los 3 bugs WASM físicos) son los más urgentes si la simulación se usa en producción.
2. **Prioridad alta para drift con riesgo concreto** (★ en la tabla): A2/A6/A7 (bridge), B3-state/B6-state/B10-state (state), C1/C5/C6 (rendering), D2/D6/D8 (UI/dominio).
3. **Sugerir orden** cuando tu apruebes Fase 2: empezar por ejes pequeños y autocontenidos (B11 IDs, B12 reset, D7 diagnostics) para calibrar el proceso, luego ir a los ★.
4. **No mezclar bugs y unificación** en los mismos commits — el plan de drift debe ser comportamiento idéntico antes/después.

---

**FIN DE FASE 1.** Esperando revisión antes de proponer canónicos en Fase 2.
