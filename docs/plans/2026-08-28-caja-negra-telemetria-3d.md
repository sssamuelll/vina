# Caja negra 3D — que el bundle cuente qué motor corrió, por qué cayó y cómo estaba la tela

**Fecha:** 2026-08-28 · **Estado:** aprobada por Samuel el 2026-08-28; pasos 0–5 implementados el mismo día en la rama `feat/caja-negra-3d` (plan ejecutable: `docs/superpowers/plans/2026-08-28-caja-negra-telemetria-3d.md`); el replay (§ 4 paso 6) queda como issue con sus dos precondiciones · **Continúa:** `docs/plans/2026-08-27-caja-negra-telemetria-local.md` (v1 2D, PR #1084)

> **Para agentes ejecutores:** este documento es la propuesta. Cuando Samuel la apruebe, se convierte en plan ejecutable con diffs esbozados y tests en rojo por paso (mismo formato que el plan v1), y se ejecuta con `superpowers:subagent-driven-development`. No implementar desde esta versión.

## Historial

- v1 (28-08, mañana): propuesta a partir del censo de la vista 3D.
- v2 (28-08, mediodía): tras revisión adversarial con tres lentes (Serrano: contradicciones y huecos; Halberg: viabilidad en runtime; Vex Rune: complejidad accidental). Cierra 1 BLOCKER y 4 HIGH/MEDIUM que cambian el diseño; recorta 1 archivo, 1 `kind` y 1 campo del bundle; degrada el paso 6 de «opcional» a «no presupuestado». Detalle en § 10.

## 1. Por qué se reabre

El plan v1 dejó por escrito que *«un bug de drapeado 3D no se reproduce desde este bundle»* y fijó el disparador de reapertura en el primer reporte de drapeado de María que no se pudiera reproducir. Samuel adelanta la reapertura el 2026-08-28: la telemetría tiene que funcionar igual de bien en la vista 3D.

El censo de la vista 3D (28-08, lectura completa de `useSimulationLifecycle`, `GarmentSimulation`, los cuatro clientes de solver y los dos workers) dice en qué estado está hoy el bundle frente a un bug de drapeado. Lo que **sí** viaja: `state.simulation` entero (emplazamiento, pins, congelados, pinceles, snapshots, costuras resueltas, fps, partículas, distancia de colisión, viento), `solver.activeTier` y `inspector.seamResolutionErrors`. Lo que **no** viaja, y es lo que un bug de drapeado necesita:

| Dato | Dónde muere hoy | Referencia |
|---|---|---|
| Por qué la cascada eligió o descartó cada tier | `console.warn` en los cuatro `catch` de la cascada; tres razones de descarte de WebGPU colapsadas en un booleano | `useSimulationLifecycle.ts:503`, `:624`, `:680`, `:726`, `:754` |
| Pérdida del device WebGPU (`reason`, `message`) | `console.error` + toast que dice *«recarga la página»* — y al recargar, el dato ya no existe | `GarmentSimulation.tsx:1448-1459`, `Viewport3D.tsx:158` |
| Errores runtime de WASM / CPU / Neural | los tres clientes declaran `onError` y **nadie lo asigna** en todo el repo; el `code` tipado (`wasm_memory_unavailable`) se degrada a string | `wasmSolverClient.ts:109,:372`, `clothWorkerClient.ts:43`, `neuralDrapeClient.ts:125` |
| NaN en el tier GPU (con parada silenciosa del solver) | `console.error` y `this.stop()`; ni Redux ni UI se enteran | `gpuSolverClient.ts:1806-1822`, `:1847-1851` |
| NaN en el worker WASM | contador dentro del worker, declarado como deuda; nunca cruza `postMessage` | `wasmSolverWorker.ts:20-23`, `:274-291` |
| Auto-colisión desactivada por fallo de CSR | `console.warn` dentro del worker; la UI sigue diciendo que está encendida | `wasmSolverWorker.ts:575-583` |
| Colisionador degradado (0 triángulos, BVH vacío) | `console.warn` y `return`; `simulation.bodyCollision` sigue en `true` | `gpuSolverClient.ts:1370-1385` |
| Config **realmente** aplicada al solver | difiere de `state.simulation` en tres ejes: `configBridge` renombra y descarta 8 campos; `SIMULATION_MODES` inyecta substeps/selfCollision del preset; GPU recibe **dos** objetos (`tslSolverConfig` + `fabricCompliance`, con `stretchCompliance=0` y `shearCompliance=0.001` forzados) mientras WASM/CPU solo reciben `fabricDensity`; viento y elásticos se aplican **después** del init con llamadas aparte | `configBridge.ts:51-59,82-108`, `useSimulationLifecycle.ts:545-562,:598,:646,:668-673,:701` |
| Desglose de malla por pieza | `GarmentSimulation` concatena la geometría pieza a pieza con un `vOffset` que no sale de ahí; `useMeshing` despacha solo el total | `GarmentSimulation.tsx:343-374`, `useMeshing.ts:128-129` |
| La posición física de la tela | `positionsRef` es `null` en el tier GPU (frameDriven); los snapshots WASM/CPU viven en un `Map` **dentro del worker** y nunca vuelven | `useSimulationLifecycle.ts:313`, `wasmSolverWorker.ts:96`, `clothWorker.ts:74` |
| Velocidades | **no hay API en ningún tier** (`velocitySBA` existe en GPU pero es privada de `TslSolver`) | `tslBuffers.ts:99`, `tslSolver.ts:143-153` |

Además: `inspector.lastSolverError` **no es del solver de tela** — lo escribe solo `reactiveSolverMiddleware.ts:501` (pool de constraints 2D). Ningún tier 3D escribe en Redux un solo error.

Y un bug preexistente que la revisión destapó y que está **justo donde este plan tiene que escribir** (Halberg): los tres `catch` de la cascada (`:624`, `:680`, `:726`) no miran `cancelled`, y disponen el cliente **por la ref compartida** (`gpuClientRef.current?.dispose()`), no por la variable local. Si Stop→Start o una pérdida de device reentran `startSim` mientras la generación anterior sigue esperando un `withTimeout` de 12–15 s, el `catch` viejo dispone el cliente **vivo** de la generación nueva. Es el escenario exacto que motiva el plan (*«se quedó colgando»* → la usuaria reintenta).

## 2. Qué significa «a la perfección» aquí

Dos niveles, y hay que nombrarlos por separado porque cuestan distinto:

1. **Diagnosticable** (pasos 0–5): al abrir el JSON, se sabe sin adivinar qué motor corrió, qué motores se descartaron y por qué, qué error exacto hubo y en qué fase (adapter / device / init / colisión / timeout / runtime), en qué corrida de la cascada pasó cada cosa, si hubo NaN y cuántos, qué config numérica recibió el solver, cuántos vértices tenía cada pieza, y dónde estaba cada vértice de la tela en el momento de exportar — **también cuando se exporta desde una pantalla de error**. Esto cubre el reporte típico de María («la tela explotó», «se quedó colgando», «el brazo se metió por dentro», «no cosió») al nivel de *saber qué pasó*.
2. **Reproducible** (paso 6): el JSON alimenta un replay sobre el tier oráculo y el replay se convierte en test de regresión. Esto es lo que hace que un bug de drapeado deje de volver. La v2 lo saca del presupuesto (§ 8.1): la revisión demostró que la infraestructura que v1 daba por existente no existe.

## 3. Arquitectura: reutilizar, no construir

La v1 ya dejó los mecanismos que hacen falta. Ninguno se duplica:

- **El ring siempre encendido** (`toolExecutionTracker.ts`: array en módulo, cap 200, sin Redux, sin gate, sin IDB) es el modelo del ring de eventos del solver.
- **`solverRuntimeTracker.ts`** ya existe, ya lo lee el exporter, y ya tiene la responsabilidad correcta: *hechos del runtime del solver que Redux no guarda*. Se amplía; no se crea un módulo nuevo. Después de este plan guarda: el tier activo (como hoy), el ring de eventos, la config aplicada por tier, y **la referencia a la geometría de la tela con su manifiesto por pieza**.
- **`errorTracker.pushError(..., { persistForReload: true })`** ya resuelve el único caso donde el dato tiene que sobrevivir a un reload: la pérdida del device, cuyo propio toast pide recargar.
- **La puerta visible** sigue siendo `Archivo ▸ Exportar diagnóstico` y los fallbacks de los cuatro boundaries. **No se crea UI nueva** y no cambia ninguna cadena visible; por eso este plan no toca el contrato de interfaz (si un paso llegara a cambiar una cadena, se invoca `contrato-de-interfaz` antes).

**Cambio de la v2 — de dónde sale la foto física.** La v1 la leía de `window.__VINA_CLOTH_MESH__`. Ese global se **borra en el cleanup del efecto** de `GarmentSimulation` (`:940-945`), y `SimulationErrorBoundary` envuelve directamente a `GarmentSimulation` (`Viewport3D.tsx:877-879`): en un crash, React desmonta el subárbol, el cleanup borra el global, y **después** aparece el fallback con el botón. La foto saldría `null` justo en el bundle que más la necesita. En v2, `GarmentSimulation` **registra la geometría en el tracker** (`registerClothGeometry(geometry, manifest)`) en el mismo efecto donde hoy fija `geometryRef` (`:928-931`), y **no la des-registra al desmontar**: la siguiente simulación la reemplaza. El `BufferGeometry` sobrevive al unmount porque el tracker lo referencia (Three.js libera lo de GPU con `dispose()`, el `array` del lado CPU se queda) — el coste es retener una geometría (unos MB) entre simulación y simulación, y se documenta con `// ponytail:`. El global `__VINA_CLOTH_MESH__` se queda intacto para los e2e.

Reglas de capa (D5): el tracker vive en `utils/cloth` y **no importa React ni Redux**; sí puede importar el tipo `BufferGeometry` de `three` (ya lo hacen otros módulos de `utils/cloth`). Los clientes de main thread (`gpuSolverClient`, `wasmSolverClient`, `clothWorkerClient`, `neuralDrapeClient`) lo llaman directo. **Los workers no pueden importarlo**: lo suyo cruza por `postMessage` con un mensaje nuevo `diagnostic`, y el cliente lo vuelca al ring.

**Limpieza del ring.** No hay listener de `NEW_PROJECT` (el tracker no escucha Redux, y un reducer no puede tener efectos). El ring es un **log de sesión**: solo lo recorta el cap. Para distinguir corridas, cada evento lleva `generation` (contador de corridas de la cascada, § Paso 0) y `timestamp`; cada corrida abre con `cascade:start`. Un lector distingue proyectos y reintentos por esos dos campos; no hace falta borrar.

Lo que **no** se hace, por la misma razón que en v1: barrido de `console.*` (los ~90 sitios se quedan; el ring se añade *al lado* de los que importan, no en su lugar), `telemetry.emit()` central, IDs de correlación, envelope, sanitización, sink remoto, base ni object store nuevos.

## 4. Pasos

Cada paso: test enfocado en rojo → implementación → verde → gate completo → commit propio. Los rangos de línea son del 28-08-2026 sobre `feat/caja-negra-telemetria`; el ejecutor localiza el símbolo antes de aplicar.

### Paso 0 — Ring de eventos del solver, la cascada contada, y la carrera entre generaciones cerrada

**Qué cambia**
- `src/utils/cloth/solverRuntimeTracker.ts`: añadir `beginCascade(): number` (incrementa y devuelve el contador de generación de módulo), `pushSolverEvent(kind, data, generation)`, `getSolverEvents()`, `clearSolverEvents()` (solo para tests); cap 200. `SolverEvent = { kind, timestamp, generation, tier?, data }` con `kind` en una unión cerrada de **12**: `cascade:start` · `tier:skipped` · `tier:selected` · `tier:failed` · `tier:runtime-error` · `tier:diagnostic` · `device:lost` · `nan:detected` · `nan:solver-stopped` · `collision:degraded` · `meshing:piece-failed` · `start:failed`. (v1 tenía 14: `sim:state` sale porque `simulation.simulationState` ya viaja y su historial no diagnostica drapeado; `gpu:uncapturederror` se funde en `tier:runtime-error{tier:'webgpu', code:'uncaptured-error'}`.)
- `src/components/Viewport3D/useSimulationLifecycle.ts`:
  - Al inicio de `startSim` (`:452`): `const generation = beginCascade()`; todos los `pushSolverEvent` de esa clausura lo pasan. Así un evento de una corrida cancelada lleva **su** generación y no la de la corrida que la reemplazó.
  - `:503` → `cascade:start` **solo como marcador** (sin payload de causa: la causa va en `tier:skipped`, que es lo que la verificación del § 5 lee).
  - `:504-511` → `tier:skipped { tier:'webgpu', reason }` con `reason` en `'flag-off' | 'unavailable' | 'downgraded' | 'no-seams-capability'`. La cuarta rama está **dormida** desde #897 (`GPU_CAPABILITIES.seams === true`; el propio código lo anota en `:504-509`); se instrumenta igual porque es una línea y la guarda existe.
  - `:528`, `:636`, `:691`, `:742` → `tier:selected`.
  - `:624`, `:680`, `:726` → **primero** `if (cancelled) { pushSolverEvent('tier:failed', { tier, phase, message, stale: true }, generation); return; }` y **después** el `dispose()` sobre la **variable local** (`gpuClient` / `wasmClient` / `client`), no sobre `*Ref.current`. Esto cierra la carrera del § 1: un `catch` de una generación vieja ya no puede disponer el cliente vivo de la nueva. Solo si `!cancelled` se limpia la ref. `phase` sale del `label` de `withTimeout` (`'TSL solver init'`, `'Wasm solver init'`, `'CPU worker init'`) o del sitio del `throw` (`adapter` en `:516`, `collision` en `:609`).
  - `:677` → `tier:failed { tier:'wasm', phase:'availability' }` (hoy es el único fallo sin toast ni Redux).
  - `:733-740` → `start:failed { reason:'neural-cannot-sew' }`; `:754` → `start:failed { message }`.
- `src/utils/export/diagnosticExporter.ts`: `solver.events`.

**Test primero**
- `src/utils/cloth/__tests__/solverRuntimeTracker.test.ts`: cap 200 con orden conservado; `beginCascade` incrementa; los eventos llevan la generación que se les pasa.
- `src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx` (ya tiene la infraestructura de mocks de los cuatro clientes): (a) un init de TSL que rechaza produce, en este orden, `cascade:start` → `tier:failed{webgpu, phase:'TSL solver init'}` → `tier:selected{wasm}`, todos con la misma `generation`; (b) **la carrera:** un init de TSL que rechaza *después* de que el efecto se haya re-ejecutado (Stop→Start) deja `tier:failed{stale:true}` con la generación vieja, y el `dispose` del mock **de la generación nueva no se llama**. Este caso es rojo hoy por el bug, no solo por la ausencia del ring.
- `src/utils/export/__tests__/diagnosticExporter.test.ts`: el bundle lleva `solver.events` desde la fuente inyectada.

**Verificación:** `npx vitest run` de los tres archivos; gate completo.
**Tamaño:** ~130 líneas de producción, ~180 de test. Riesgo bajo-medio: la corrección de la carrera toca el flujo real de la cascada, pero solo cambia *qué* se dispone en el `catch`, y el test (b) lo pinea.

### Paso 1 — La pérdida del device sobrevive al reload que su propio toast pide

**Qué cambia** (todo inline; v1 proponía extraer `deviceLossReport.ts` para una función con un solo call-site — Vex Rune, corte PROBABLE aceptado):
- `GarmentSimulation.tsx:1448-1455`: además de lo que ya hace, `pushSolverEvent('device:lost', { source:'renderer', reason: info?.reason, message: info?.message })` y `pushError({ message, source:'webgpu-device-lost', timestamp }, { persistForReload: true })`. Hoy `info.reason` se descarta y `message` solo va a consola.
- `GarmentSimulation.tsx:1442-1446` (device ya muerto de un mount previo): `device:lost { source:'previous-mount' }`.
- `GarmentSimulation.tsx:1456-1459`: `uncapturederror` → `tier:runtime-error { tier:'webgpu', code:'uncaptured-error', message }`.
- `Viewport3D.tsx:158-159` (pérdida en idle): conservar `info` y registrar `device:lost { source:'idle' }`.
- `useSimulationLifecycle.ts:521-525` (device señuelo del lifecycle): `device:lost { source:'lifecycle-decoy' }` — se registra para que el bundle deje claro *cuál* de los dos devices se perdió, que fue exactamente la confusión de #901.
- **Solo en `import.meta.env.DEV`**, junto al listener de `:1448`: `window.__VINA_RENDERER_DEVICE__ = device`, para que el escenario 3 del § 5 pueda perder *el device del renderer* desde la consola. (v1 lo mencionaba solo en la verificación; Serrano: trabajo no escrito en el paso que lo contiene.)

**Nota de diseño, corregida:** la ranura LS de `persistForReload` guarda **un** error, el último que escribe. Si tras la pérdida del device la app además tumba un boundary, cuál sobrevive al reload depende del orden real de ejecución (`device.lost.then` es asíncrono; `componentDidCatch` es síncrono) — **no es determinista** y no se promete. Los dos quedan en el ring en memoria hasta el reload, y `device:lost` queda además en `solver.events`. No se abre una segunda ranura.

**Test primero:** `errorTracker`: tras `initErrorTracker()` en un módulo fresco, el error persistido con `source:'webgpu-device-lost'` aparece en el ring. Las líneas de `GarmentSimulation` se verifican por el escenario 3 del § 5 (el componente no tiene test unitario y no se le inventa uno para seis líneas).
**Tamaño:** ~30 líneas. Riesgo bajo.

### Paso 2 — Los errores runtime de cada tier entran al ring, con su `code`

**Qué cambia** (los clientes llaman al tracker directo; no se cambia la firma de `onError`, que sigue sin asignarse — así no se toca ningún contrato de Epic-746):
- `wasmSolverClient.ts:372-378` (`case 'error'`): `pushSolverEvent('tier:runtime-error', { tier:'wasm', code: msg.code, message })` **antes** de degradar a string. `:152-160` (evento `error` del Worker): ídem con `code:'worker_error'`.
- `wasmSolverClient.ts:118` (`catch {}` de `new Worker`): conservar la causa en el `Error` que se lanza (`{ cause }`), para que el `tier:failed` del paso 0 la lleve.
- `clothWorkerClient.ts:81-88`, `:124-131`, `:391-396`: `tier:runtime-error { tier:'cpu-worker' }` (hoy sin ningún `console.*`: si `onError` es null se pierde por completo).
- `neuralDrapeClient.ts:174-179`, `:337-342`: `tier:diagnostic { tier:'neural-drape', code:'analytical-fallback' | 'inference-failed' }`.
- `gpuSolverClient.ts`:
  - `:1806-1822` `validatePositions`: **una** llamada `nan:detected { tier:'webgpu', frame, particleIndex, component }` en la detección. Sin `count` (el check sale en el primer NaN; un `count` sería siempre 1 — Vex Rune) y sin rate-limit (el `stop()` de `:1850` cancela el loop; no hay segunda detección — Serrano).
  - `:1847-1851`: `nan:solver-stopped { tier:'webgpu' }` junto al `stop()`.
  - `:1370-1385`: `collision:degraded { reason:'no-tsl-solver' | 'zero-triangles' | 'empty-bvh' }`.
  - `:362-369` (NaN en la malla de entrada): `nan:detected { phase:'input', count }` — aquí sí hay conteo porque ese guard cuenta.
- `simulationInitClient.ts:139-141` (pieza que no malla): `meshing:piece-failed { pieceId, message }` — `useMeshing.ts:110` ya hace el toast; aquí solo se registra.

**Test primero:** las suites de contrato existentes (`wasmSolverClient` con `fakeWorker.ts`, `clothWorkerClient` con `fakeClothWorker.ts`, `gpuSolverClient` con `fakeDevice.ts`) ganan un caso cada una: el mensaje `error` del fake deja en `getSolverEvents()` un `tier:runtime-error` con `code`. `validatePositions` con un NaN inyectado deja `nan:detected` con índice y componente correctos.
**Tamaño:** ~60 líneas. Riesgo bajo: son llamadas a un array en módulo, sin efectos sobre la simulación.

### Paso 3 — Lo que pasa dentro del worker WASM sale del worker

**Qué cambia**
- `wasmSolverWorker.ts:285-290` (`guardNaN`): dentro del mismo `if (nanLogLimiter.tryEmit(...))`, `postMessage({ type:'diagnostic', code:'nan_reset', count: nanThisStep, cumulative: nanLogLimiter.count, branch: branchLabel })`. Mismo rate-limit que el `console.warn` (primera + cada 100): cero coste en el camino caliente cuando no hay NaN (Halberg lo confirmó contra `rateLimit.ts:50-64`).
- `wasmSolverWorker.ts:575-583` (fallo de `set_adjacency`): `postMessage({ type:'diagnostic', code:'self_collision_disabled', message })`.
- `wasmSolverWorker.ts:866` (`updateConstraints` no soportado): `diagnostic { code:'warm_start_unsupported' }`.
- Unión de mensajes worker→cliente (localizar el tipo en `wasmSolverWorker.ts` / `wasmSolverClient.ts`): un miembro nuevo `diagnostic`.
- `wasmSolverClient.ts:371` (`switch`): `case 'diagnostic'` → `pushSolverEvent('tier:diagnostic', { tier:'wasm', ...msg })`. No toca `readyReject`: un diagnóstico no es un error de init.
- **Coalescencia (v2, Halberg):** con NaN sostenido y `jsSubsteps` de 15–30 por frame, el limiter deja pasar hasta ~18 mensajes/s, que vaciarían el ring de 200 en ~11 s y desalojarían la cascada. Regla en el `case 'diagnostic'`: si el último evento del ring es `tier:diagnostic` del mismo tier y mismo `code`, se **actualiza en sitio** (`count`, `cumulative`, `timestamp`) en vez de añadir. El ring nunca lleva dos `nan_reset` seguidos.
- Este paso cierra la deuda declarada en `wasmSolverWorker.ts:20-23`; se actualiza ese comentario.

**Observado y fuera:** el tier WASM **no se detiene** ante NaN sostenido (resetea a `prevView` y sigue), a diferencia del GPU; por eso no existe `nan:solver-stopped{wasm}`. Y el worker CPU no tiene guardia de NaN (`clothWorker.ts`). Los dos van como issue de follow-up, no aquí.

**Test primero:** `wasmSolverClient` con `fakeWorker.ts` posteando dos `diagnostic{nan_reset}` seguidos → **un** evento en el ring con el `cumulative` del segundo, y `ready` **no** rechazado. Test del worker: el `guardNaN` existente (si tiene test) o uno nuevo sobre la función extraída, comprobando que el `postMessage` respeta el limiter.
**Tamaño:** ~55 líneas. Riesgo bajo; el mensaje nuevo es aditivo.

### Paso 4 — La config que el solver recibió de verdad, y el manifiesto de la malla que se renderiza

**Qué cambia**
- `solverRuntimeTracker.ts`: `setAppliedSolverConfig(tier, config)` / `getAppliedSolverConfig()`; se limpia en `clearActiveSolverTier()` (que ya se llama en el cleanup de `:756-775`).
- `useSimulationLifecycle.ts`: en los cuatro sitios de init registrar **lo que se pasa**, con esta forma por tier (Serrano: en GPU son dos objetos, no uno; Halberg: viento y elásticos van después del init):
  - `webgpu` (`:598`): `{ init: { solverConfig: tslSolverConfig, fabricCompliance }, postInit: {} }`.
  - `wasm` (`:649-673`): `{ init: <objeto pasado a initMultiPiece>, postInit: { wind: windEnabled ? windForce : null, elastics: elasticsRef.current.length } }` — registrado **después** de `:671-673`, que es donde se aplican.
  - `cpu-worker` (`:703`): igual que WASM.
  - `neural-drape` (`:747`): `{ init: { pieces: placedMeshes.length } }`.
  Nada de reconstruir: se registran las variables que ya existen en ese punto.
- **Manifiesto — cambio de la v2.** v1 lo sacaba de `useMeshing`, pero la geometría que se renderiza y de la que sale la foto se concatena en `GarmentSimulation.tsx:324-374` sobre `validMeshes = pieceMeshes.filter(p => arrangeById.has(p.pieceId))` — un subconjunto, en su propio orden, con su propio `vOffset` (y el comentario de `:352` exige que ese loop sea idéntico al del solver). Si el manifiesto sale de otro loop, los offsets pueden no describir el buffer que se lee (Halberg, Serrano). En v2 el manifiesto se construye **dentro de ese mismo loop** (`{ pieceId, vertexOffset: vOffset, vertexCount: numVerts, triCount: p.triIds.length / 3 }`) y el `useMemo` devuelve `{ staticGeometry, meshManifest }`; el efecto de `:928-931` llama `registerClothGeometry(staticGeometry, meshManifest)`. Por construcción, offsets y buffer concuerdan.
- `diagnosticExporter.ts`: `solver.appliedConfig`, `solver.meshManifest`; y **se borra `solver.config`** (Vex Rune, CERTAIN): es `state.simulation` repetido byte a byte, ya viaja como `simulation`, y ningún test ni consumidor lo lee — con `appliedConfig` en el bundle serían tres cosas llamadas config y solo una verdadera.

**Test primero:** exporter con fuentes inyectadas (y aserción de que `solver.config` ya no existe); lifecycle comprueba que la config registrada para WASM lleva `substeps` del preset (no `numSubsteps`) y `postInit.wind` cuando `windEnabled`; `GarmentSimulation` no tiene test unitario — el manifiesto se pinea en el test del exporter (paso 5) cotejando offsets contra un buffer de dos piezas.
**Tamaño:** ~60 líneas. Riesgo bajo.

### Paso 5 — La foto física de la tela al exportar, también desde una pantalla de error

**Qué cambia**
- `solverRuntimeTracker.ts`: `registerClothGeometry(geometry, manifest)` / `getClothGeometry()`. **No hay `unregister`**: la referencia sobrevive al unmount de `GarmentSimulation` (es la única forma de que un boundary caído exporte la foto — § 3) y la reemplaza la siguiente simulación. `// ponytail: retiene una geometría entre simulaciones; si un perfil de memoria lo acusa, copiar positions al registrar y soltar la geometría`.
- `diagnosticExporter.ts`: nueva fuente `getClothSnapshot()` en `browserSources`: lee `getClothGeometry()` y devuelve `{ vertexCount, encoding:'float32-base64', positions: <base64 de position.array> } | null`. Base64 de un `Float32Array` en vez de `number[]` (v1): `JSON.stringify(bundle, null, 2)` pondría cada float en su propia línea indentada — hasta 300 000 líneas — y el exporter corre **síncrono en el hilo principal desde el `onClick` de un fallback de crash** (Halberg, Serrano). Una cadena base64 de ~1,6 MB se serializa en milisegundos.
- **Cotejo (Halberg):** el exporter compara `vertexCount` con la suma del `meshManifest` registrado con la misma geometría y, si difieren, deja `manifestMismatch: true`. No puede diferir por construcción (paso 4), pero si un día difiere, el JSON lo dice en vez de cortar posiciones por la pieza equivocada en silencio.
- Techo: por encima de **100 000 vértices** se omiten las posiciones y se deja `positionsOmitted: true` con el conteo y el manifiesto. `// ponytail: techo fijo; si un bundle real lo pisa, decidir entonces`.
- **Red en el botón (Halberg):** `downloadDiagnosticBundle` envuelve `build + stringify` en `try/catch`; si falla, reintenta **sin** `clothSnapshot`; si vuelve a fallar, `pushError` y relanza. Hoy no hay ningún `try/catch` en esa cadena y un fallo en el `onClick` del fallback no lo atrapa ningún boundary (los boundaries no capturan errores de handlers).
- `solver.clothSnapshot` en el bundle. El helper de decodificación (`base64 → Float32Array`) vive junto al exporter para el test y para el paso 6.

**Lo que esta foto es y no es, por escrito en el doc del bundle:** en el tier GPU el readback a la geometría corre cada 15 frames (3 con herramienta activa), así que la foto puede tener hasta 15 frames de antigüedad. La lectura es segura frente al readback en vuelo: el `dst.set()` de `gpuSolverClient.ts:1083` es síncrono y JS es de un solo hilo (Halberg). **No lleva velocidades**: no existe API de lectura en ningún tier. Si el paso 6 demuestra que un replay no converge sin ellas, se reabre con una export de `velocitySBA` (GPU) y `prev_positions` (WASM) — no antes.

**Test primero:** exporter con una geometría registrada de 2 piezas (jsdom, `BufferGeometry` real de `three`) → `positions` decodifica a los mismos floats y los offsets del manifiesto cortan cada pieza en su rango; caso por encima del techo → `positionsOmitted`; caso sin geometría → `null`; caso manifiesto desalineado → `manifestMismatch: true`; caso `stringify` que lanza (inyectar un `BigInt` en la fuente) → segundo intento sin snapshot y descarga igual.
**Tamaño:** ~80 líneas. Riesgo bajo.

### Paso 6 — Replay del bundle sobre el tier oráculo (NO presupuestado en esta tanda)

**Lo que v1 decía y era falso (Serrano):** «inicializa el solver WASM en vitest como ya lo hace `cpuWasmParity.test.ts`». Ese test instancia el binding crudo `XpbdSolver` con una malla sintética y arma las costuras a mano; **no** pasa por `initMultiPiece` (mallado multi-pieza, `seamInitDataToPairs`, `buildAdjacencyCSR`). Esa orquestación vive entera dentro del `self.onmessage` de `wasmSolverWorker.ts:463`, sin funciones puras exportadas. Un replay real exige **primero** extraerla del worker a una función pura — un refactor del tier oráculo que no está presupuestado ni revisado.

**Lo que además faltaría (Halberg):** la igualdad de `meshManifest` no prueba que la triangulación sea la misma (mismo conteo, distinta topología por un flip de Delaunay sensible a coma flotante); un replay que diverja tendría que traer `triIds` en el bundle. Y sin velocidades, la comparación contra `clothSnapshot` es de reposo, no de trayectoria.

**Decisión v2:** el paso 6 sale de esta tanda y abre como issue con este documento de referencia y estas dos condiciones previas explícitas (extraer `initMultiPiece` del worker; decidir `triIds`). El primer JSON real de María que un bug de drapeado necesite reproducir es el que lo paga. Estimación honesta: ~350 líneas contando la extracción, riesgo medio-alto.

## 5. Verificación de la puerta, no solo del cuarto

Los tests unitarios prueban que cada punto *escribe*. Lo que hay que probar aparte es que *se alcanza* desde la app real. Cuatro escenarios manuales en `npm run dev`, cada uno terminando en `Archivo ▸ Exportar diagnóstico` (o en el botón del fallback) y abriendo el JSON:

1. **Flag apagado:** `localStorage.setItem('vina-use-webgpu','false')`, Play. El bundle tiene `tier:skipped{webgpu, 'flag-off'}` → `tier:selected{wasm}`, `appliedConfig.init.substeps`, `activeTier:'wasm'`, y `clothSnapshot.vertexCount` igual a la suma del manifiesto.
2. **WASM roto:** bloquear `/wasm/xpbd_wasm_bg.wasm` en DevTools, Play. `tier:failed{wasm, phase:'availability'}` → `tier:selected{cpu-worker}`.
3. **Device perdido:** en consola, `window.__VINA_RENDERER_DEVICE__.destroy()` (DEV). Debe aparecer `device:lost{source:'renderer', reason:'destroyed'}`, el toast, y **tras recargar**, el error sigue en `errors` del bundle.
4. **Crash del visor (el blocker de v1):** provocar un throw dentro de `GarmentSimulation` (en DEV, un `throw` temporal detrás de un flag de consola, que no se commitea) con la simulación corriendo → aparece el fallback de `SimulationErrorBoundary` → su botón exporta un bundle con `clothSnapshot` **no nulo** y `solver.events` con el `tier:selected` de esa corrida.
5. **Reintento durante un init lento (la carrera):** con el tier GPU activo, Play y Stop→Play antes de 12 s con el adapter lento (throttling de CPU en DevTools). El bundle muestra dos `cascade:start` con generaciones distintas; si la primera falló, su `tier:failed` lleva `stale:true` y la segunda corrida sigue viva (el overlay sigue contando fps).

Y un e2e nuevo, el más barato: `tests/e2e/diagnostico-3d.spec.ts` con el escenario 1 (localStorage + Play + `page.waitForEvent('download')` + parsear el JSON + decodificar `positions`). Hoy ningún e2e intercepta descargas; es la primera vez y queda como patrón. Recordar: servidor caliente y pocos workers (`e2e-vina-servidor-caliente-y-pocos-workers`).

## 6. Restricciones (heredadas de v1, más las propias)

- Local. Sin endpoint, sin sink, sin cuenta, sin dependencia nueva.
- El ring de eventos: en memoria, cap 200, sin gate, sin `DebugStore`, sin localStorage ni IDB. Log de sesión; no se limpia por proyecto (§ 3).
- El único dato que se persiste es la pérdida del device, por la ranura LS que ya existe y ya está justificada inline.
- Sin IDs de correlación (`generation` es un contador de módulo, no un ID); sin envelope; sin sanitización.
- `utils/cloth` no importa React ni Redux. Los workers no importan el tracker.
- Ninguna cadena visible cambia. Si un paso lo necesita, `contrato-de-interfaz` primero.
- Los `console.*` existentes se quedan. Se añade al lado, no en lugar de.
- `npx tsc -b --noEmit`; gate `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui` antes de cada commit; nunca `--no-verify`; nunca editar el baseline de UI a mano.
- Las suites de contrato de Epic-746 son el techo: si un paso obligara a cambiar una firma pineada, se para y se documenta.

## 7. Orden, dependencias y tamaño

| Paso | Depende de | Producción | Tests | Nota |
|---|---|---|---|---|
| 0 ring + cascada + carrera | — | ~130 | ~180 | base; incluye la corrección de la carrera |
| 1 device lost | 0 | ~30 | ~20 | — |
| 2 errores runtime por tier | 0 | ~60 | ~80 | — |
| 3 diagnósticos del worker WASM | 0 | ~55 | ~50 | coalescencia incluida |
| 4 config aplicada + manifiesto | 0 | ~60 | ~50 | borra `solver.config` |
| 5 foto física | 4 | ~80 | ~70 | base64 + try/catch + cotejo |
| 6 replay | 4, 5 | ~350 | fixture | **fuera de esta tanda** (§ 4, § 8.1) |

Total de la tanda: ~415 líneas de producción, seis commits, cada uno revertible solo.

1 → 2 → 3 son independientes entre sí (solo dependen del 0); 4 → 5 también. Se ejecutan en el orden numérico por claridad de commits, no por dependencia.

## 8. Decisiones que son de Samuel

1. **Paso 6 fuera de esta tanda.** En v1 era «opcional»; la revisión mostró que su precondición (la orquestación de `initMultiPiece` como función pura fuera del worker) no existe. Recomendación firme: pasos 0–5 ahora; el 6 abre como issue y lo paga el primer bundle real. Si Samuel lo quiere ahora igual, primero va el refactor del worker con su propia revisión.
2. **Solo posiciones, sin velocidades.** No hay API; añadirla toca `TslSolver` y el worker WASM. Se reabre únicamente si el replay lo exige.
3. **La foto sale de la geometría renderizada retenida en el tracker** (≤15 frames de retraso en GPU; retiene unos MB entre simulaciones). La alternativa —readback fresco— rompe la pureza del exporter y con ella la exportación desde un boundary caído. Lo doy por decidido salvo objeción.
4. **La corrección de la carrera va dentro del paso 0.** Es un bug preexistente (`catch` sin `cancelled`, `dispose` por la ref compartida) que vive en las mismas líneas que el paso tiene que tocar, y arreglarlo son tres líneas por `catch` más un test. Alternativa: issue aparte y el paso 0 solo registra; pero entonces el ring documentaría fielmente un fantasma destruyendo al vivo.
5. **Ninguna superficie nueva de UI.** El censo dejó a la vista un hueco de UX que no es de telemetría: cuando WebGPU falla al iniciar (no por costuras, sino por adapter/timeout/shader) la app cae a WASM **sin ningún toast** (`:624`). Este plan lo registra en el ring; enseñárselo a María es otro trabajo y va como issue aparte.

## 9. Fuera de alcance

- Velocidades y `prevPos` (§ 8.2).
- Replay (§ 4 paso 6): issue con dos precondiciones.
- Parada del tier WASM ante NaN sostenido, y guardia de NaN en el worker CPU: follow-up con issue.
- Barrido de `console.*`, `telemetry.emit()`, consolidación de los `window.__VINA_*__` (que siguen siendo la puerta de los e2e).
- `FrameTimeTracker` de `qualityPresets.ts:104-145` (v1 lo llamaba `PerformanceTracker`, nombre equivocado) solo se instancia en su test: candidato a borrar. Va a `vex-rune` en otra sesión.
- UI para los `catch` silenciosos de la cascada (§ 8.5).
- Neural: más allá de registrar el fallback analítico, el tier no se instrumenta (su dirección técnica está en #1006).
- Ninguna de las tarjetas de María abiertas hoy es de drapeado; este plan no cierra ninguna tarjeta por sí mismo — hace que la próxima de drapeado se pueda cerrar.

## 10. Registro de la revisión adversarial (28-08)

| Hallazgo | Fuente | Severidad | Qué cambió en v2 |
|---|---|---|---|
| `__VINA_CLOTH_MESH__` se borra en el cleanup antes de que exista el fallback | Serrano | BLOCKER | La geometría se registra en el tracker sin unregister (§ 3, paso 5) |
| Los `catch` de la cascada no miran `cancelled` y disponen por la ref compartida | Halberg | crítico, preexistente | Paso 0: `generation` por evento + `dispose` de la variable local + test de la carrera |
| El ring no tiene quién lo limpie en `NEW_PROJECT`; la cita a `simulationSlice.ts:752` era de Redux, no del tracker | Serrano, Vex Rune | HIGH | Log de sesión sin limpieza; `generation` + `timestamp` distinguen corridas (§ 3) |
| `cpuWasmParity.test.ts` no pasa por `initMultiPiece`; el harness del replay no existe | Serrano, Halberg | HIGH | Paso 6 fuera de la tanda con precondiciones explícitas |
| `stringify` síncrono sin `try/catch` desde el `onClick` de un fallback | Halberg, Serrano | MEDIUM | Base64 para posiciones; `try/catch` con reintento sin snapshot (paso 5) |
| Manifiesto de `useMeshing` vs geometría de `validMeshes`: subconjunto y orden distintos | Halberg, Serrano | MEDIUM | Manifiesto construido en el mismo loop que la geometría; cotejo en el exporter (pasos 4, 5) |
| GPU init recibe dos objetos de config; viento y elásticos van tras el init | Serrano, Halberg | MEDIUM | `appliedConfig = { init, postInit }` por tier (paso 4) |
| «Gana el boundary» describía una carrera como garantía | Serrano | MEDIUM | Nota reescrita: no determinista, no se promete (paso 1) |
| NaN sostenido en WASM inunda el ring de 200 | Halberg | MEDIUM | Coalescencia de `nan_reset` consecutivos (paso 3) |
| `count` y rate-limit en `nan:detected` de GPU no tienen sustento (salida temprana + `stop()`) | Vex Rune, Serrano | LOW | Quitados (paso 2) |
| `solver.config` duplica `simulation` byte a byte | Vex Rune | CERTAIN | Se borra en el paso 4 |
| `sim:state` no diagnostica drapeado; `simulationState` ya viaja | Vex Rune | PROBABLE | `kind` eliminado (12 en vez de 14) |
| `deviceLossReport.ts` para un solo call-site | Vex Rune | PROBABLE | Inline (paso 1) |
| `gpu:uncapturederror` es un `tier:runtime-error` | Vex Rune | CONSIDER | Fundido |
| `cascade:start` repetía la causa que ya lleva `tier:skipped` | Vex Rune | compresión | `cascade:start` es solo marcador |
| `__VINA_RENDERER_DEVICE__` no existía y solo aparecía en la verificación | Serrano | MEDIUM | Entra al diff del paso 1, DEV-only |
| `PerformanceTracker` se llama `FrameTimeTracker` | Vex Rune | cita | Corregido (§ 9) |
| Rama `no-seams-capability` dormida desde #897 | Serrano | LOW | Se instrumenta igual (una línea), anotado |
| `postMessage` en `guardNaN` con el limiter no añade coste sin NaN | Halberg | confirmado | Sin cambio |
| Lectura de `position.array` segura frente al readback en vuelo | Halberg | confirmado | Sin cambio; anotado en paso 5 |
