# Simular al instante — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que «Simular» mueva la tela en menos de 1 s y sin congelar la interfaz, preparando en reposo lo que hoy se hace al pulsar.

**Arquitectura:** un preparador (`usePrepararTela`, montado en `Viewport3D`) corre con la simulación en reposo y la prenda a la vista. Hace cuatro cosas, todas con caché por contenido:

1. Malla, con la caché y el paralelo que ya existen.
2. Coloca las mallas con una función pura que comparte con `GarmentSimulation`.
3. Arma la tela del solver TSL en un worker (`prepararTela`).
4. Arma el BVH de la colisión en otro worker.

Al pulsar, `useSimulationLifecycle` y `GpuSolverClient` encuentran lo preparado por su huella y solo suben a la GPU. La física no cambia: el código se mueve, no se reescribe, y lo protegen tests de caracterización.

**Stack:** React 18, Redux Toolkit, three 0.184 (WebGPU/TSL), three-mesh-bvh, Vite (workers de módulo), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-simular-al-instante-design.md` (aprobada el 2026-10-11).

## Restricciones globales

- **Rama** `feat/simular-al-instante`, desde `main` después del merge de `fix/drape-estable`. El worktree es `.claude/worktrees/ia-1b2` y el puerto e2e, 5187.
- **Typecheck:** `npx tsc -b --noEmit` en modo build, nunca `tsc --noEmit` a secas.
- **Lint:** `npx eslint --max-warnings=0 <archivos>`.
- **Contrato de interfaz:** `node scripts/ui-contract-lint.mjs`.
- **Suite entera**: `npm run test`, que pide el candado `scripts/pesado.mjs`. Un archivo suelto se corre con `npx vitest run <ruta>`, sin candado.
- **Sin dependencias nuevas.** three, three-mesh-bvh y cdt2d ya están.
- **Workers de módulo** con el patrón de `simulationInitClient.ts`: `new Worker(new URL('./x.ts', import.meta.url), { type: 'module' })`. Si el constructor lanza, el mismo trabajo corre en el hilo principal.
- **La física no cambia.** Las mismas entradas dan los mismos arreglos al solver (tests de caracterización de las tareas 2 y 6).
- **Límites de caché:**
  - mallas: 64, como ya está;
  - telas preparadas: 2;
  - BVH: 2.
- **El preparador corre solo si se cumplen las cuatro cosas**:
  - `simulationState === 'idle'`;
  - `viewMode !== '2d'`;
  - `showGarment`;
  - al menos una pieza que se simula.

  Espera `ESPERA_PARA_PREPARAR_MS = 600` desde el último cambio.
- **Ningún trabajo nuevo** en el hilo principal pasa de 100 ms.
- **Comentarios y tests** en español, con el estilo del repo.
- **Mensajes de commit** en español: el cambio y su porqué técnico. Sin líneas de atribución de IA (ni `Co-Authored-By`, ni enlaces de sesión) y sin narrativa del proceso.
- **Los subagentes no** hacen push, PR, merge ni deploy, y no corren `scripts/deploy-prod.sh`. Eso es del controlador, con la orden de Samuel.

## Foco de la revisión

Cinco entradas que la spec implica y que ninguna prueba feliz toca, de la más probable a la menos. Cada una tiene su test en la tarea dueña.

1. **Pulsar «Simular» mientras el preparador trabaja.** La simulación espera la misma malla y la misma tela que ya están en vuelo, no las hace otra vez. Si el preparador suelta la malla en ese momento, la simulación malla por su cuenta. (Tareas 1 y 7.)
2. **Restablecer y volver a simular con la tela guardada.** El solver escribe en los arreglos que recibe: congelar piezas reescribe `invMass` y el planchado reescribe la flexión. La caché entrega copias y guarda la suya intacta; si no, la segunda corrida arranca con la física de la primera. (Tarea 7.)
3. **La huella dice la verdad en los dos sentidos.** El preparador y la cascada calculan la misma huella con las mismas entradas, y la caché acierta. Un cambio real (una pieza, el cuerpo, la pose, la tela, un interruptor) da otra huella y nunca reusa lo viejo. Un fallo aquí no rompe nada a la vista: el arranque vuelve a ser lento, en silencio. Por eso la cascada empuja `preparar:usada` y la sonda lo lee. (Tareas 7, 8, 9, 11 y 12.)
4. **Editar una pieza durante la preparación.** La malla en vuelo se suelta; lo que termine se guarda con su propia huella y nunca se usa para la pieza editada. (Tareas 4 y 9.)
5. **Un entorno reducido**: sin WebGPU (tier WASM) o sin workers de módulo (CSP, navegador viejo). Sin WebGPU el preparador solo malla. Sin workers todo corre en el hilo principal, como hoy. (Tareas 7, 9 y 11.)

## Archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `src/utils/cloth/simulationInitClient.ts` (modificar) | Comparte las mallas en vuelo | 1 |
| `src/components/Viewport3D/colocarMallas.ts` (crear) | Coloca las mallas sobre el cuerpo (pura) | 2 |
| `src/components/Viewport3D/costurasDeLaSimulacion.ts` (crear) | `seamsToInitData`, movida desde GarmentSimulation | 2 |
| `src/utils/cloth/solverRuntimeTracker.ts` (modificar) | `tela:primer-cuadro`, `preparar:*`, el primer latido de la corrida | 3 |
| `src/store/simulationSlice.ts` (modificar) | `telaEnMovimiento` | 3 |
| `src/components/shell/EstadoDeLaSimulacion.tsx` (modificar) | «Preparando la tela» | 3 |
| `src/components/Viewport3D/usePrepararTela.ts` (crear) | El preparador | 4, 9, 11 |
| `src/components/Viewport3D/mallasDePiezas.ts` (crear) | `MeshedPiece` desde lo mallado (pura) | 9 |
| `src/utils/cloth/gpu/prepararTela.ts` (crear) | La parte CPU del armado TSL (pura, sin three) | 6 |
| `src/utils/cloth/huella.ts` (crear) | Huella de contenido de cualquier dato | 7 |
| `src/utils/cloth/transferibles.ts` (crear) | Los buffers que un worker devuelve transferidos | 7, 11 |
| `src/utils/cloth/gpu/telasPreparadas.ts` (crear) | Caché de telas, en vuelo compartido y armado fuera del hilo | 7 |
| `src/utils/cloth/gpu/prepararTelaWorker.ts` (crear) | Worker del armado | 7 |
| `src/utils/cloth/complianceDeTela.ts` (crear) | La tela que recibe el solver TSL (pura) | 8 |
| `src/utils/cloth/gpu/bvhPreparado.ts` (crear) | Caché de BVH y armado fuera del hilo | 11 |
| `src/utils/cloth/gpu/bvhWorker.ts` (crear) | Worker del BVH | 11 |
| `tests/e2e/drape-sonda.spec.ts` (modificar) | Arranque preparado, primer cuadro, lo usado y tareas largas | 5, 10, 12 |

---

## Entrega 1 — pre-mallado, primer cuadro y «preparando»

### Tarea 1: compartir las mallas en vuelo

**Archivos:**
- Modificar: `src/utils/cloth/simulationInitClient.ts`, el método `meshPiece`.
- Test: `src/utils/cloth/__tests__/mallar-en-paralelo-y-una-vez.test.ts` (agregar casos).

**Interfaces:**
- Consume: la caché `mallasHechas` y `copia()` del mismo archivo.
- Produce: el mismo API público. `meshPiece(piece, particleDistance, worker?)` deja de mallar dos veces la misma clave a la vez.

- [ ] **Paso 1: escribir los tests rojos.** Al final del `describe` existente:

```ts
  it('lo que está en vuelo se comparte: un segundo cliente no pide otra vez la misma malla', async () => {
    const { SimulationInitClient } = await import('../simulationInitClient');
    const piezas = [pieza('a', 100)];
    const primero = new SimulationInitClient();
    const p1 = primero.meshAllPieces(piezas, {}, 5);
    await new Promise((r) => setTimeout(r, 0));
    const segundo = new SimulationInitClient();
    const p2 = segundo.meshAllPieces(piezas, {}, 5);
    await new Promise((r) => setTimeout(r, 0));

    expect(WorkerFalso.todos.reduce((n, w) => n + w.pedidos.length, 0), 'un solo pedido para la misma malla').toBe(1);
    await responderTodo();
    const [a, b] = await Promise.all([p1, p2]);
    expect(Array.from(b[0].vertices)).toEqual(Array.from(a[0].vertices));
    expect(b[0].vertices, 'una copia, no el mismo array').not.toBe(a[0].vertices);
    primero.dispose();
    segundo.dispose();
  });

  it('si el que mallaba se suelta, el que esperaba malla por su cuenta', async () => {
    const { SimulationInitClient } = await import('../simulationInitClient');
    const piezas = [pieza('a', 100)];
    const primero = new SimulationInitClient();
    void primero.meshAllPieces(piezas, {}, 5);
    await new Promise((r) => setTimeout(r, 0));
    const segundo = new SimulationInitClient();
    const p2 = segundo.meshAllPieces(piezas, {}, 5);
    await new Promise((r) => setTimeout(r, 0));

    primero.dispose();
    await new Promise((r) => setTimeout(r, 0));
    await responderTodo();
    expect((await p2).map((m) => m.pieceId)).toEqual(['a']);
    segundo.dispose();
  });
```

- [ ] **Paso 2: ver los rojos.** Correr `npx vitest run src/utils/cloth/__tests__/mallar-en-paralelo-y-una-vez.test.ts --testTimeout=5000`. Esperado: FALLA «un solo pedido para la misma malla» (llegan 2). El segundo caso pasa hoy: es la guarda.

- [ ] **Paso 3: implementar.** Junto a `mallasHechas`:

```ts
/**
 * Las mallas que se están haciendo ahora, por la misma clave: quien pide una
 * que ya está en vuelo espera esa, en vez de mallar dos veces (el preparador y
 * «Simular» a la vez). Si la compartida falla (su cliente se soltó porque
 * cambiaron las entradas), se malla aquí.
 */
const mallasEnVuelo = new Map<string, Promise<Malla>>();
```

En `meshPiece`, entre la consulta a `mallasHechas` y el `await this.mallar(...)`:

```ts
    const enVuelo = mallasEnVuelo.get(clave);
    if (enVuelo) {
      try {
        const m = await enVuelo;
        return copia(mallasHechas.get(clave) ?? m);
      } catch {
        // El que mallaba se soltó: se malla aquí.
      }
    }
    const promesa = this.mallar(piece, options, worker);
    mallasEnVuelo.set(clave, promesa);
    let malla: Malla;
    try {
      malla = await promesa;
    } finally {
      if (mallasEnVuelo.get(clave) === promesa) mallasEnVuelo.delete(clave);
    }
```

Queda lo que ya está: guardar en caché si no está vacía, y devolver `malla`.

- [ ] **Paso 4: ver los verdes.** Mismo comando. Esperado: PASS en los cinco casos.
- [ ] **Paso 5: commit.** `git add` de los dos archivos y `git commit -m "perf(simulación): una malla en vuelo se comparte, no se repite"`.

### Tarea 2: la colocación y las costuras, compartidas

**Archivos:**
- Crear: `src/components/Viewport3D/colocarMallas.ts`
- Crear: `src/components/Viewport3D/costurasDeLaSimulacion.ts`
- Modificar: `src/components/Viewport3D/GarmentSimulation.tsx`. El `useMemo` de `placedMeshes` pasa a llamar a `colocarMallas`. La función local `seamsToInitData` se borra y se importa desde el módulo nuevo.
- Test: `src/components/Viewport3D/__tests__/colocarMallas.test.ts`

**Interfaces:**
- Produce:
  - `colocarMallas(pieceMeshes: MeshedPiece[], activePieces: PatternPiece[], medidas: BodyMeasurements, overrides: Record<string, ArrangementOverride>, armAxis: ArmAxis): PlacedMesh[]`. `PlacedMesh` es el de `useSimulationLifecycle.ts`.
  - `seamsToInitData(seams: Seam[], seamGroups?: SeamGroup[]): SeamInitData[]`.
- Los tipos se toman de donde ya los toma GarmentSimulation. `ArrangementOverride` es el tipo de `project.arrangementOverrides`, y `ArmAxis` el de `simulation.armAxis` (`buildAxisHints.ts` lo importa).

- [ ] **Paso 1: escribir el test.** Tres propiedades que hoy cumple el `useMemo`. Fixture: dos rectángulos de 200 × 300 mm con `category` `'front'` y `'back'`, mallas planas de 4 vértices y `armAxis = { left: null, right: null, ready: false }`.

```ts
import { describe, it, expect } from 'vitest';
import { colocarMallas } from '../colocarMallas';
import { wrapPlacedMesh } from '../../../utils/cloth/arrangement/wrapPlacedMesh';
import { resolveArrangementWithFrames } from '../../../utils/cloth/arrangement/arrangementBinding';
import { buildAxisHints } from '../../../utils/cloth/arrangement/buildAxisHints';
import type { BodyMeasurements, PatternPiece } from '../../../types/types';
import type { MeshedPiece } from '../useMeshing';

const MEDIDAS: BodyMeasurements = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 };

const rect = (id: string, category: string) => ({
  id, name: id, category,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 300] }, { type: 'L', values: [0, 300] }, { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [],
  createdAt: 0, updatedAt: 0, active: true,
}) as unknown as PatternPiece;

const malla = (pieceId: string): MeshedPiece => ({
  pieceId,
  vertices: new Float32Array([-0.1, 0, -0.15, 0.1, 0, -0.15, 0.1, 0, 0.15, -0.1, 0, 0.15]),
  triIds: new Int32Array([0, 1, 2, 0, 2, 3]),
  outline: [],
});

const armAxis = { left: null, right: null, ready: false };

describe('colocarMallas: lo que el solver recibe, desde un solo sitio', () => {
  const piezas = [rect('a', 'front'), rect('b', 'back')];
  const mallas = [malla('a'), malla('b')];

  it('envuelve cada malla con su marco, como el render', () => {
    const colocadas = colocarMallas(mallas, piezas, MEDIDAS, {}, armAxis);
    const marcos = resolveArrangementWithFrames(piezas, MEDIDAS, {}, { axisHints: buildAxisHints(piezas, armAxis), skeletonReady: false });
    expect(Array.from(colocadas[0].vertices)).toEqual(Array.from(wrapPlacedMesh(mallas[0].vertices, marcos[0].frame, marcos[0].wrapParams, marcos[0].flip)));
  });

  it('respeta el orden de las mallas y deja fuera la que ya no tiene pieza', () => {
    const colocadas = colocarMallas([malla('b'), malla('borrada'), malla('a')], piezas, MEDIDAS, {}, armAxis);
    expect(colocadas.map((m) => m.pieceId)).toEqual(['b', 'a']);
  });

  it('lleva región, rigidez y presión de cada pieza', () => {
    const [a] = colocarMallas(mallas, piezas, MEDIDAS, {}, armAxis);
    expect(a.stiffnessMultiplier).toBe(1);
    expect(typeof (a as { region?: string }).region).toBe('string');
    expect((a as { pressurePa?: number }).pressurePa).toBe(0);
  });
});
```

- [ ] **Paso 2: ver el rojo.** Correr `npx vitest run src/components/Viewport3D/__tests__/colocarMallas.test.ts`. Esperado: FALLA porque `../colocarMallas` no existe.
- [ ] **Paso 3: crear `colocarMallas.ts`.** Es el cuerpo del `useMemo` de `placedMeshes` de GarmentSimulation, movido tal cual:

```ts
import type { PatternPiece, BodyMeasurements } from '../../types/types';
import type { MeshedPiece } from './useMeshing';
import type { PlacedMesh } from './useSimulationLifecycle';
import { resolveArrangementWithFrames } from '../../utils/cloth/arrangement/arrangementBinding';
import { computeEffectiveRegions } from '../../utils/cloth/garmentPlacement';
import { wrapPlacedMesh } from '../../utils/cloth/arrangement/wrapPlacedMesh';
import { buildAxisHints } from '../../utils/cloth/arrangement/buildAxisHints';
import { computeStiffnessMultiplier } from '../../utils/cloth/interfacing';

type Overrides = Parameters<typeof resolveArrangementWithFrames>[2];
type ArmAxis = Parameters<typeof buildAxisHints>[1];

/**
 * Las mallas como las recibe el solver: envueltas sobre el cuerpo (el mismo
 * marco que el render), con su región, su rigidez por entretela, su presión y
 * sus internas de doblez. La llaman GarmentSimulation y el preparador
 * (usePrepararTela): con las mismas entradas, la misma tela.
 * El armAxis cuenta: cuando el esqueleto publica la pose A, la tela se vuelve
 * a sembrar en esa pose (#924).
 */
export function colocarMallas(
  pieceMeshes: MeshedPiece[],
  activePieces: PatternPiece[],
  medidas: BodyMeasurements,
  overrides: Overrides,
  armAxis: ArmAxis,
): PlacedMesh[] {
  if (pieceMeshes.length === 0) return [];
  const axisHints = buildAxisHints(activePieces, armAxis);
  const arrangement = resolveArrangementWithFrames(activePieces, medidas, overrides, { axisHints, skeletonReady: armAxis.ready });
  const arrangeById = new Map(activePieces.map((p, i) => [p.id, arrangement[i]]));
  const regions = computeEffectiveRegions(activePieces);
  const regionById = new Map(activePieces.map((p, i) => [p.id, regions[i] as string]));
  return pieceMeshes
    .filter((pm) => arrangeById.has(pm.pieceId))
    .map((pm) => {
      const { frame, flip, wrapParams } = arrangeById.get(pm.pieceId)!;
      const transformed = wrapPlacedMesh(pm.vertices, frame, wrapParams, flip);
      const piece = activePieces.find((p) => p.id === pm.pieceId);
      const stiffnessMultiplier = computeStiffnessMultiplier(piece?.interfacingType, piece?.solidifyFactor);
      const pressurePa = piece?.pressurePa ?? 0;
      const foldInternals = piece?.internals?.filter((l) => l.type === 'fold' && l.foldOptions);
      return { ...pm, vertices: transformed, stiffnessMultiplier, pressurePa, internals: foldInternals, region: regionById.get(pm.pieceId) };
    });
}
```

Antes de pegarlo, comparar línea a línea con el `useMemo` actual (GarmentSimulation, `const placedMeshes = useMemo(`): si el de hoy difiere en algo, manda el de hoy. Si TypeScript se queja del tipo de retorno, se copia el que infiere hoy el `useMemo` y se exporta como tipo. El cuerpo no cambia.

- [ ] **Paso 4: usar la función en GarmentSimulation.** El `useMemo` queda así (las dependencias, igual que hoy):

```ts
  const placedMeshes = useMemo(
    () => colocarMallas(pieceMeshes, activePieces, avatarMeasurements, arrangementOverrides, armAxis),
    // armAxis dep is load-bearing: when AvatarModel publishes posed arm dirs (async), this rebuilds → the solver re-seeds in A-pose. Removing it strands sleeves in T-pose (#924 A-pose).
    [pieceMeshes, activePieces, avatarMeasurements, arrangementOverrides, armAxis],
  );
```

Se borran los imports que queden sin uso. `buildAxisHints`, `resolveArrangementWithFrames` y `wrapPlacedMesh` los sigue usando el memo de `staticGeometry`.

- [ ] **Paso 5: mover `seamsToInitData`.** La función local de GarmentSimulation se mueve sin cambios a `costurasDeLaSimulacion.ts`, se exporta y GarmentSimulation la importa.
- [ ] **Paso 6: verde y suite de la zona.** Correr `npx vitest run src/components/Viewport3D` y `npx tsc -b --noEmit`. Esperado: todo PASS y tsc en 0.
- [ ] **Paso 7: commit.** Mensaje: «refactor(simulación): colocarMallas y seamsToInitData, compartidas con el preparador».

### Tarea 3: el primer cuadro de la corrida y «Preparando la tela»

**Archivos:**
- Modificar: `src/utils/cloth/solverRuntimeTracker.ts`
- Modificar: `src/store/simulationSlice.ts`
- Modificar: `src/components/Viewport3D/GarmentSimulation.tsx` (las dos llamadas a `latirLaSimulacion`)
- Modificar: `src/components/Viewport3D/useSimulationLifecycle.ts` (al empezar la cascada)
- Modificar: `src/components/shell/EstadoDeLaSimulacion.tsx`
- Tests:
  - `src/utils/cloth/__tests__/solverRuntimeTracker.test.ts` (agregar)
  - `src/store/__tests__/simulationSlice.telaEnMovimiento.test.ts` (crear)
  - `src/components/shell/__tests__/EstadoDeLaSimulacion.test.tsx` (agregar)

**Interfaces:**
- Produce:
  - `latirLaSimulacion(edges): boolean`. Devuelve `true` solo en el primer latido de la corrida, y además empuja el evento `tela:primer-cuadro` con `{ ms }`, contados desde su `cascade:start`.
  - `SolverEventKind` suma `'tela:primer-cuadro' | 'preparar:listo' | 'preparar:fallo' | 'preparar:usada'`.
  - Del slice: `simulation.telaEnMovimiento: boolean` y la acción `marcarTelaEnMovimiento(boolean)`.

- [ ] **Paso 1: invocar la skill `contrato-de-interfaz`.** El cambio toca una cadena que se ve.
- [ ] **Paso 2: tests rojos del tracker.**

```ts
it('el primer latido de cada corrida se marca una vez, con lo que tardó desde su cascada', () => {
  clearSolverEvents();
  beginCascade();
  expect(latirLaSimulacion(null)).toBe(true);
  expect(latirLaSimulacion(null)).toBe(false);
  const ev = getSolverEvents().filter((e) => e.kind === 'tela:primer-cuadro');
  expect(ev).toHaveLength(1);
  expect(typeof ev[0].data.ms).toBe('number');
  beginCascade();
  expect(latirLaSimulacion(null), 'una corrida nueva vuelve a empezar').toBe(true);
});
```

- [ ] **Paso 3: implementar en el tracker.** Junto a `generation`:

```ts
let inicioDeLaCorrida = 0;
let latidosDeLaCorrida = 0;
```

En `beginCascade()`, antes del `return`: `inicioDeLaCorrida = Date.now(); latidosDeLaCorrida = 0;`. Y `latirLaSimulacion` queda así:

```ts
export function latirLaSimulacion(edges: SolverEdgeData | null): boolean {
  latidos += 1;
  latidosDeLaTela += 1;
  aristas = edges;
  tierDeLaTela = activeTier;
  latidosDeLaCorrida += 1;
  if (latidosDeLaCorrida !== 1) return false;
  pushSolverEvent('tela:primer-cuadro', { ms: Date.now() - inicioDeLaCorrida });
  return true;
}
```

Sumar los cuatro nombres nuevos a `SolverEventKind`.

- [ ] **Paso 4: el slice.** Test rojo:

```ts
import reducer, { marcarTelaEnMovimiento, startSimulation, pauseSimulation, resetSimulation } from '../simulationSlice';
it('la tela está quieta hasta su primer cuadro, y vuelve a estarlo al restablecer', () => {
  let s = reducer(undefined, startSimulation());
  expect(s.telaEnMovimiento).toBe(false);
  s = reducer(s, marcarTelaEnMovimiento(true));
  s = reducer(s, pauseSimulation());
  s = reducer(s, startSimulation());
  expect(s.telaEnMovimiento, 'pausar y reanudar no la vuelve a preparar').toBe(true);
  s = reducer(s, resetSimulation());
  expect(s.telaEnMovimiento).toBe(false);
});
```

Implementación: `telaEnMovimiento: boolean` en la interfaz del estado, con `false` en `initialState`.

- El reductor `marcarTelaEnMovimiento(state, a: PayloadAction<boolean>)` hace `state.telaEnMovimiento = a.payload`.
- `startSimulation`: si venía de `'idle'`, pone `telaEnMovimiento = false`.
- `resetSimulation`: pone `telaEnMovimiento = false`.
- Exportar la acción.

- [ ] **Paso 5: conectar.**
  - **GarmentSimulation**, en las dos llamadas: `if (latirLaSimulacion(edgeDataRef.current)) dispatch(marcarTelaEnMovimiento(true));`
  - **useSimulationLifecycle**, en la rama viva de la cascada, justo después de `const generation = beginCascade();`: `dispatch(marcarTelaEnMovimiento(false));`.

- [ ] **Paso 6: el estado al pie.** Primero se redacta el texto con la skill `solace-wren`. El candidato es «Preparando la tela»: corto, sin cifra, sin tecnicismos.
  - Test rojo en `EstadoDeLaSimulacion.test.tsx`: con `startSimulation()` y sin `marcarTelaEnMovimiento(true)`, el nombre accesible del botón empieza por «Estado de la simulación: Preparando la tela» (puede seguir el motor) y no dice «Simulando».
  - Implementación: `const preparando = corriendo && !telaEnMovimiento;`, con `useSelector` sobre `s.simulation.telaEnMovimiento`. En `textoDelEstado` y en `cabecera`, `preparando` va antes que `corriendo` y da el texto aprobado; con `fps === 0` no se pinta cifra, como ya pasa.
- [ ] **Paso 7: verde.** Correr `npx vitest run src/utils/cloth/__tests__/solverRuntimeTracker.test.ts src/store/__tests__/simulationSlice.telaEnMovimiento.test.ts src/components/shell/__tests__/EstadoDeLaSimulacion.test.tsx src/components/Viewport3D`. Después, `npx tsc -b --noEmit` y `node scripts/ui-contract-lint.mjs`: ningún contador sube.
- [ ] **Paso 8: commit.** Mensaje: «feat(simulación): el primer cuadro se ve en la caja negra y el estado dice que la tela se prepara».

### Tarea 4: el preparador, mallando en reposo

**Archivos:**
- Crear: `src/components/Viewport3D/usePrepararTela.ts`
- Modificar: `src/components/Viewport3D/Viewport3D.tsx` (llamar al hook)
- Test: `src/components/Viewport3D/__tests__/usePrepararTela.test.tsx`

**Interfaces:**
- Consume: `SimulationInitClient` (tarea 1) y `pushSolverEvent`.
- Produce:

```ts
export const ESPERA_PARA_PREPARAR_MS = 600;
export interface EntradasDeLaTela {
  piezas: PatternPiece[];               // las que se simulan (seSimula), el mismo memo que GarmentSimulation
  densidades: Record<string, number>;   // simulation.pieceParticleDistance
  densidad: number;                     // simulation.particleDistance
}
/** null = no preparar (simulación en marcha, vista 2D, prenda oculta o sin piezas). */
export function usePrepararTela(entradas: EntradasDeLaTela | null): void;
```

- [ ] **Paso 1: tests rojos.** Con `vi.mock('../../../utils/cloth/simulationInitClient')`: un cliente falso cuyo `meshAllPieces` devuelve una promesa controlada y cuyo `dispose` es `vi.fn()`. Con temporizadores falsos:
  1. Con entradas, a los 599 ms no ha mallado; a los 600 ms llamó a `meshAllPieces` una vez, con las piezas y las densidades.
  2. Dos cambios de entradas en 300 ms dan una sola llamada, con las últimas.
  3. Si las entradas pasan a `null` mientras malla (el clic en «Simular»), no se llama a `dispose` hasta que la malla termina.
  4. Si las entradas cambian por otras mientras malla (una edición), se llama a `dispose` en el acto.
  5. Al terminar, empuja `preparar:listo` con `{ fase: 'mallas' }`. Si falla, empuja `preparar:fallo` con `{ fase: 'mallas', message }` y no lanza.
- [ ] **Paso 2: ver los rojos.** Correr `npx vitest run src/components/Viewport3D/__tests__/usePrepararTela.test.tsx`. Esperado: FALLA porque el módulo no existe.
- [ ] **Paso 3: implementar.**

```ts
import { useEffect, useRef } from 'react';
import type { PatternPiece } from '../../types/types';
import { SimulationInitClient } from '../../utils/cloth/simulationInitClient';
import { pushSolverEvent } from '../../utils/cloth/solverRuntimeTracker';

export const ESPERA_PARA_PREPARAR_MS = 600;

export interface EntradasDeLaTela {
  piezas: PatternPiece[];
  densidades: Record<string, number>;
  densidad: number;
}

/**
 * Prepara en segundo plano lo que «Simular» va a necesitar, mientras la prenda
 * está a la vista y la simulación parada (spec 2026-10-11 «simular al
 * instante» § 4.1). Malla con la caché de SimulationInitClient: al pulsar,
 * useMeshing encuentra las mallas hechas (o en vuelo) y no malla otra vez.
 * Un cambio de entradas suelta lo que esté en vuelo; pasar a null (pulsar
 * «Simular») lo deja terminar, porque la simulación lo está esperando.
 */
export function usePrepararTela(entradas: EntradasDeLaTela | null): void {
  const siguiente = useRef<EntradasDeLaTela | null>(entradas);
  siguiente.current = entradas;

  useEffect(() => {
    if (!entradas) return;
    let cliente: SimulationInitClient | null = null;
    let terminado = false;
    const t0 = performance.now();
    const temporizador = setTimeout(() => {
      cliente = new SimulationInitClient();
      cliente.meshAllPieces(entradas.piezas, entradas.densidades, entradas.densidad)
        .then(() => pushSolverEvent('preparar:listo', { fase: 'mallas', ms: Math.round(performance.now() - t0) }))
        .catch((e: unknown) => pushSolverEvent('preparar:fallo', { fase: 'mallas', message: e instanceof Error ? e.message : String(e) }))
        .finally(() => { terminado = true; cliente?.dispose(); });
    }, ESPERA_PARA_PREPARAR_MS);
    return () => {
      clearTimeout(temporizador);
      // Pulsar «Simular» (entradas → null) deja terminar la malla en vuelo: la
      // simulación la espera (mallas en vuelo compartidas). Un cambio de
      // entradas (una edición) la suelta: su malla ya no sirve.
      if (siguiente.current !== null && !terminado) cliente?.dispose();
    };
  }, [entradas]);
}
```

- [ ] **Paso 4: montar en Viewport3D.** Viewport3D ya tiene `simulationState`, `viewMode`, `showGarment` y `activePieces` (el mismo filtro `seSimula` que GarmentSimulation). Faltan dos selectores de densidad:

```ts
  const densidad = useSelector((s: RootState) => s.simulation.particleDistance);
  const densidades = useSelector((s: RootState) => s.simulation.pieceParticleDistance);
  const entradasDeLaTela = useMemo(
    () => (simulationState === 'idle' && viewMode !== '2d' && showGarment && activePieces.length > 0)
      ? { piezas: activePieces, densidades, densidad }
      : null,
    [simulationState, viewMode, showGarment, activePieces, densidades, densidad],
  );
  usePrepararTela(entradasDeLaTela);
```

- [ ] **Paso 5: verde.** Correr `npx vitest run src/components/Viewport3D` y `npx tsc -b --noEmit`.
- [ ] **Paso 6: commit.** Mensaje: «perf(simulación): el preparador malla en reposo, con la prenda a la vista».

### Tarea 5: la sonda mide el arranque preparado (entrega 1)

**Archivos:** modificar `tests/e2e/drape-sonda.spec.ts`.

**Interfaces:** consume los eventos `tela:primer-cuadro`, `preparar:*` y `preparar:usada` del bundle (los dos últimos llegan en las tareas 8 y 11; antes, el filtro da vacío).

- [ ] **Paso 1: esperar la preparación.** Tras `cambiarVista(page, '3D')`, esperar `Number(process.env.SONDA_PREPARAR_MS ?? 8000)` ms antes de la primera foto, para medir el arranque preparado del criterio 1.
- [ ] **Paso 2: leer el primer cuadro y lo preparado.** En el resumen:

```ts
const primerCuadro = eventosSolver.find((e) => e.kind === 'tela:primer-cuadro' && e.t >= marcas.simular);
const preparado = eventosSolver.filter((e) => e.kind === 'preparar:listo' && e.t < marcas.simular).map((e) => e.data);
const usado = eventosSolver.filter((e) => e.kind === 'preparar:usada' && e.t >= marcas.simular).map((e) => e.data);
// en `resumen`:
//   clicAPrimerCuadroMs: primerCuadro ? Math.round(primerCuadro.t - marcas.simular) : null,
//   preparadoAntesDelClic: preparado,
//   usadoDeLoPreparado: usado,
//   tareasDeMasDe100ms: sonda.largas.filter((l) => l.t >= marcas.simular && l.ms > 100).length,
```

- [ ] **Paso 3: lint** con `npx eslint --max-warnings=0 tests/e2e/drape-sonda.spec.ts`.
- [ ] **Paso 4: medir.** Esto lo hace el controlador, bajo el candado: `npm run build:interno`, y después, con `VINA_E2E_BUILD=1 VINA_E2E_PORT=5187`, la sonda con `npx playwright test --config playwright.webgpu.config.ts drape-sonda` y otra vez con `SONDA_TIER=wasm`. Se anotan en el commit `clicAPrimerCuadroMs`, `tareasDeMasDe100ms` y las tareas largas más grandes.
- [ ] **Paso 5: commit.** Mensaje: «test(e2e): la sonda mide el arranque preparado y el primer cuadro».

---

## Entrega 2 — la tela armada en un worker y preparada

### Tarea 6: `prepararTela`, la parte CPU del armado, idéntica

**Archivos:**
- Crear: `src/utils/cloth/gpu/prepararTela.ts`
- Modificar: `src/utils/cloth/gpu/gpuSolverClient.ts`, `initMultiPieceTsl`
- Test: `src/utils/cloth/gpu/__tests__/prepararTela.test.ts`, con el arnés de `gpuSolverClient.test.ts`: se copia su bloque `vi.hoisted` de `sharedMock` (líneas 7-136, con el `MockSBA` que guarda `array`) y sus dos `vi.mock` de three; `FakeGPUDevice` se importa de `./fakeDevice`. `makeQuadPieceAt` es local al `describe` del behavior #11 (línea ~882): se copia también, con los `seamPairs` de ese bloque.

**Interfaces:**
- Produce:

```ts
import type { PieceMeshData } from './gpuSolverClient';
import type { SeamPair } from '../seamPairs';
import type { FabricComplianceConfig, TslSeamConstraintData } from './tslBuffers';
import type { BendConstraints, ColoredConstraints } from './gpuBuffers';

export interface Interruptores { crossBend: boolean; seamScExcl: boolean }

export interface TelaPreparada {
  totalVerts: number;
  pieceVertexRanges: Array<[string, { start: number; count: number }]>;
  positions: Float32Array;
  invMass: Float32Array;          // con la banda F3 aplicada
  originalInvMass: Float32Array;  // snapshot tras la banda (freeze/unfreeze)
  triangles: Uint32Array;
  hasUvs: boolean;
  edgeData: { ids: Int32Array; lengths: Float32Array };
  fabric: FabricComplianceConfig; // la resuelta (con el default)
  colored: ColoredConstraints;
  seam: TslSeamConstraintData | null;
  bendAll: BendConstraints;
  crossQuadCount: number;
  bendColorDelta: number;
  crossQuadPartners: Array<[string, [number, number]]> | null;
  pressedBendCompliance: number | null;
  tetherRadii: Float64Array;
  csr: { offsets: Uint32Array; neighbors: Uint32Array };
  weld: { verts: Uint32Array; offsets: Uint32Array; partners: Uint32Array } | null;
  avisos: string[];               // los console.warn de hoy, para escribirlos en el hilo principal
}

/** Pura: sin window, sin three, sin GPU. Corre en el hilo principal o en un worker. */
export function prepararTela(
  pieces: PieceMeshData[],
  seamPairs: SeamPair[] | undefined,
  fabricCompliance: FabricComplianceConfig | undefined,
  interruptores: Interruptores,
): TelaPreparada;

/** Lee los interruptores de desarrollo en el hilo principal (localStorage). */
export function interruptoresDeTela(): Interruptores;
```

- `initMultiPieceTsl(pieces, seamPairs?, solverConfig?, fabricCompliance?, preparada?: TelaPreparada)`: si llega `preparada` la usa; si no, llama `prepararTela(pieces, seamPairs, fabricCompliance, interruptoresDeTela())`.
- Los nombres y tipos exactos de los campos salen del código que se mueve: si uno de los de arriba no coincide con lo que hoy calcula `initMultiPieceTsl`, manda el código de hoy y se ajusta la interfaz.

- [ ] **Paso 1: tests de caracterización, ANTES de mover nada.** En `prepararTela.test.ts`, dos prendas:
  - **Con costura:** dos piezas, `makeQuadPieceAt` y sus `seamPairs`. Cubre el empaquetado de costuras, los quads entre piezas y la soldadura.
  - **La camisa de María, sin costuras:** `importDXFContent(readFileSync('tests/fixtures/garments/maria_patrones_samuel_2M.dxf', 'utf-8'), { unit: 'auto', autoDetect: true }).pieces` (como `wrapIsometry.test.ts`), malladas en síncrono con `meshPiece(pieza, { yHeight: 0, scale: 0.001, maxEdgeLength: 20, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12 })` de `src/utils/mesh` (las opciones de `SimulationInitClient.meshPiece`, a 20 mm para que el test sea rápido), llevadas a `MeshedPiece` con `{ ...malla, pieceId: pieza.id, outline: pieza.outline }` y colocadas con `colocarMallas` (tarea 2), con las `MEDIDAS` del test de la tarea 2 y `armAxis = { left: null, right: null, ready: false }`. Cubre el tamaño real: coloreado, banda F3, radios del tirante por región y CSR.

  Para cada una:
  1. Inicializar con `initMultiPieceTsl`.
  2. Leer `(client as any).tslBuffers`.
  3. Calcular la huella FNV-1a de todos los `array` de sus SBA, en orden de propiedad: posiciones, invMass, cada grupo de color de estiramiento, flexión, costura, `scBuffers.offsets`/`neighbors` y `weldBuffers`, más los campos `originalInvMass`, `edgeData` y `pieceVertexRanges` del cliente.
  4. Fijar la huella como constante: se corre una vez, se copia el valor que imprime y se fija con `expect(huella).toBe('<valor>')`.

  Así los tests describen el armado de HOY, elemento a elemento: la huella lee los bits de cada arreglo.
- [ ] **Paso 2: correr y fijar.** Correr `npx vitest run src/utils/cloth/gpu/__tests__/prepararTela.test.ts`. Esperado: PASS con la constante fijada. Commit del test solo: «test(gpu): la huella del armado TSL de hoy, antes de moverlo».
- [ ] **Paso 3: mover.** El código va **tal cual** desde `initMultiPieceTsl` a `prepararTela`, en este orden:
  1. La fusión de piezas, `pieceVertexRanges`, `invMass`, `triangles` y las UV.
  2. `buildAdjacency`.
  3. `extractStretchConstraints` y `extractBendConstraints`.
  4. El default de `fabric` y la compliance de estiramiento.
  5. `colorConstraints`.
  6. El empaquetado de costuras, con su `console.warn`, que pasa a `avisos.push(...)`.
  7. La banda F3.
  8. El snapshot `originalInvMass`.
  9. Los quads entre piezas, con la barrera Halberg. Su `console.warn` pasa a `avisos` y el `Map` de partners a un arreglo de entradas.
  10. La exclusión seam↔SC sobre `adjSets`, con `interruptores.seamScExcl` en lugar de `localStorage`.
  11. `buildAdjacencyCSR`.
  12. El CSR de la soldadura de normales, que devuelve arreglos y no `createSBA`.
  13. `buildTetherRadii`.

  Lo que queda en `initMultiPieceTsl`:
  - `this.reportInputNaN(t.positions)`;
  - copiar a los campos del cliente (`pieceVertexRanges = new Map(t.pieceVertexRanges)`, `edgeData`, `originalInvMass`, `crossQuadPartners = t.crossQuadPartners && new Map(t.crossQuadPartners)`, `pressedBendCompliance`);
  - escribir `avisos` con `console.warn`;
  - y, dentro de `withErrorScope`: `disposeTslResources`, `createTslBuffers(...)`, `createSelfCollisionBuffers(t.totalVerts, nextPrime(t.totalVerts * 2), t.csr.offsets, t.csr.neighbors)`, los `createSBA` de la soldadura desde `t.weld`, `createTslSolver` y el `console.log`.

  Ninguna operación numérica cambia de orden.
- [ ] **Paso 4: ver el verde de la caracterización y del archivo entero.** Agregar, para las dos prendas, el camino de la tela preparada: `initMultiPieceTsl(pieces, seamPairs, config, fabric, structuredClone(prepararTela(pieces, seamPairs, fabric, interruptoresDeTela())))` (lo que llega del worker) da la misma huella fijada. Correr `npx vitest run src/utils/cloth/gpu`. Esperado: las huellas iguales y todos los behaviors de `gpuSolverClient.test.ts` en PASS.
- [ ] **Paso 5: `prepararTela` no toca `window` ni carga three.** Dos casos en el test:
  1. Con `vi.stubGlobal('window', undefined)`, `prepararTela` directo no lanza.
  2. El worker no puede cargar three: el texto de `prepararTela.ts` no contiene `from 'three` y todo lo que importa de `./tslBuffers` es `import type`. Se lee con `readFileSync` y se comprueba con dos regex. Hoy `gpuBuffers`, `selfCollision`, `wasm/adjacencyCSR`, `seamAssembly`, `physicalFabric`, `dihedral` y `tetherRadii` no importan three; `tslBuffers` sí, por eso solo sus tipos.
- [ ] **Paso 6: commit.** Mensaje: «refactor(gpu): prepararTela, la parte CPU del armado TSL, pura e idéntica».

### Tarea 7: la huella, la caché de telas y el worker del armado

**Archivos:**
- Crear: `src/utils/cloth/huella.ts`
- Crear: `src/utils/cloth/transferibles.ts`
- Crear: `src/utils/cloth/gpu/telasPreparadas.ts`
- Crear: `src/utils/cloth/gpu/prepararTelaWorker.ts`
- Tests:
  - `src/utils/cloth/__tests__/huella.test.ts`
  - `src/utils/cloth/gpu/__tests__/telasPreparadas.test.ts`

**Interfaces:**
- Produce:

```ts
// huella.ts
/** 64 bits de todo lo que hay en los valores, recorrido en profundidad. */
export function huella(...valores: unknown[]): string;

// telasPreparadas.ts
export const TELAS_GUARDADAS = 2;
export interface EntradasDelArmado {
  pieces: PieceMeshData[];
  seamPairs: SeamPair[] | undefined;
  fabric: FabricComplianceConfig | undefined;
  interruptores: Interruptores;
}
export type OrigenDeLaTela = 'cache' | 'en-vuelo' | 'armada';
/** La guardada, la que ya se arma o una armada ahora fuera del hilo. Cada llamada recibe su copia. */
export function obtenerTela(huellaDeLaTela: string, entradas: EntradasDelArmado): Promise<{ tela: TelaPreparada; origen: OrigenDeLaTela }>;
```

- [ ] **Paso 1: tests rojos de la huella** (`huella.test.ts`).
  - Iguales entradas dan igual huella, aunque sean objetos distintos y sus claves estén en otro orden.
  - Con `it.each`, cada uno de estos cambios da otra huella: un valor de `vertices`, un `triIds`, el `region`, el orden de las piezas, un campo que hoy no existe (`{ ...pieza, nuevo: 1 }`), un `vertexPairs` de una costura, un campo de la tela y un interruptor.
  - `-0` y `+0` en un `Float32Array` dan huellas distintas: se leen los bits.
  - Un campo `undefined` es lo mismo que no tenerlo (`{ a: 1, b: undefined }` y `{ a: 1 }`).
- [ ] **Paso 2: implementar `huella.ts`.**

```ts
/**
 * Huella de contenido: 64 bits (dos mezclas de 32 con constantes distintas,
 * estilo FNV-1a) de todo lo que hay en los valores, recorrido en profundidad.
 * Los arreglos tipados se leen por sus bits, en palabras de 32 cuando se puede;
 * los números sueltos, por los de su Float64 (así -0 y +0 difieren); las
 * claves de un objeto, en orden alfabético, y un campo undefined no cuenta.
 * Es la clave de las cachés del arranque: dos entradas con la misma huella
 * dan el mismo armado.
 */
export function huella(...valores: unknown[]): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  const mezclar = (w: number) => {
    a = Math.imul(a ^ w, 0x01000193);
    b = Math.imul(b ^ w, 0x5bd1e995);
    b ^= b >>> 13;
  };
  const f64 = new Float64Array(1);
  const bits = new Uint32Array(f64.buffer);
  const texto = (s: string) => {
    mezclar(s.length);
    for (let i = 0; i < s.length; i++) mezclar(s.charCodeAt(i));
  };
  const recorrer = (v: unknown): void => {
    if (v === null) return mezclar(1);
    if (v === undefined) return mezclar(2);
    if (typeof v === 'number') { f64[0] = v; mezclar(3); mezclar(bits[0]); return mezclar(bits[1]); }
    if (typeof v === 'boolean') return mezclar(v ? 4 : 5);
    if (typeof v === 'string') { mezclar(6); return texto(v); }
    if (ArrayBuffer.isView(v)) {
      texto(v.constructor.name);
      mezclar(v.byteLength);
      const vista = v.byteOffset % 4 === 0 && v.byteLength % 4 === 0
        ? new Uint32Array(v.buffer, v.byteOffset, v.byteLength / 4)
        : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      for (let i = 0; i < vista.length; i++) mezclar(vista[i]);
      return;
    }
    if (Array.isArray(v)) { mezclar(7); mezclar(v.length); for (const x of v) recorrer(x); return; }
    if (v instanceof Map) { mezclar(8); return recorrer([...v.entries()]); }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const claves = Object.keys(o).filter((k) => o[k] !== undefined).sort();
      mezclar(9);
      mezclar(claves.length);
      for (const k of claves) { texto(k); recorrer(o[k]); }
      return;
    }
    throw new Error(`huella: no sé recorrer un ${typeof v}`);
  };
  for (const v of valores) recorrer(v);
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
```

- [ ] **Paso 3: tests rojos de `obtenerTela`** (`telasPreparadas.test.ts`). `vi.resetModules()` en `beforeEach` e `import()` dinámico, para que cada caso empiece con la caché vacía. Las entradas son las de la tarea 6 (`makeQuadPieceAt` y sus costuras).
  1. La primera llamada da `origen: 'armada'`; la segunda con la misma huella, `'cache'`, con el mismo contenido (se compara con `huella(tela)`).
  2. **Copias:** escribir en la tela recibida (`tela.invMass[0] = 123` y un valor de `tela.bendAll`) no cambia la siguiente que sale de la caché.
  3. **En vuelo:** dos llamadas a la vez con la misma huella arman una sola vez (un `Worker` falso cuenta los `postMessage`). La segunda da `'en-vuelo'`.
  4. **Límite:** con tres huellas distintas, la primera ya no está: vuelve a dar `'armada'`.
  5. **Sin worker** (`vi.stubGlobal('Worker', undefined)`): devuelve lo mismo que `prepararTela` directo (misma `huella`).
  6. **Worker que falla** (falso que dispara `onerror`, o que responde `{ error }`): cae al hilo principal y devuelve lo mismo que `prepararTela`.
  7. **Comprobación barata:** una guardada cuyas piezas no coinciden con las entradas (otros `pieceId` o vértices) se descarta y se arma (`'armada'`).
- [ ] **Paso 4: implementar.**

`telasPreparadas.ts`:

```ts
import { prepararTela, type TelaPreparada, type Interruptores } from './prepararTela';
import type { PieceMeshData } from './gpuSolverClient';
import type { SeamPair } from '../seamPairs';
import type { FabricComplianceConfig } from './tslBuffers';

export const TELAS_GUARDADAS = 2;
/** Si el worker no contesta en este tiempo, se arma en el hilo principal. */
const ESPERA_MAXIMA_DEL_WORKER_MS = 10_000;

export interface EntradasDelArmado {
  pieces: PieceMeshData[];
  seamPairs: SeamPair[] | undefined;
  fabric: FabricComplianceConfig | undefined;
  interruptores: Interruptores;
}

export type OrigenDeLaTela = 'cache' | 'en-vuelo' | 'armada';

const guardadas = new Map<string, TelaPreparada>();
const enVuelo = new Map<string, Promise<TelaPreparada>>();

/** Lo barato de la spec § 4.4: las mismas piezas, en el mismo orden, con los mismos vértices. */
function coincide(t: TelaPreparada, e: EntradasDelArmado): boolean {
  return t.pieceVertexRanges.length === e.pieces.length
    && e.pieces.every((p, i) => t.pieceVertexRanges[i][0] === p.pieceId && t.pieceVertexRanges[i][1].count === p.vertices.length / 3);
}

function guardar(h: string, t: TelaPreparada): void {
  guardadas.delete(h);
  guardadas.set(h, t);
  while (guardadas.size > TELAS_GUARDADAS) guardadas.delete(guardadas.keys().next().value as string);
}

function enElHilo(e: EntradasDelArmado): TelaPreparada {
  return prepararTela(e.pieces, e.seamPairs, e.fabric, e.interruptores);
}

function armarFueraDelHilo(e: EntradasDelArmado): Promise<TelaPreparada> {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./prepararTelaWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve().then(() => enElHilo(e));
  }
  return new Promise<TelaPreparada>((resolve, reject) => {
    const alHilo = () => {
      clearTimeout(reloj);
      worker.terminate();
      try { resolve(enElHilo(e)); } catch (err) { reject(err); }
    };
    const reloj = setTimeout(alHilo, ESPERA_MAXIMA_DEL_WORKER_MS);
    worker.onmessage = (m: MessageEvent<{ tela?: TelaPreparada; error?: string }>) => {
      if (!m.data.tela) return alHilo();
      clearTimeout(reloj);
      worker.terminate();
      resolve(m.data.tela);
    };
    worker.onerror = alHilo;
    // Sin transferir: los arreglos de entrada son de quien llama.
    worker.postMessage(e);
  });
}

/**
 * La tela de esta huella: la guardada, la que ya se está armando o una armada
 * ahora fuera del hilo principal. Cada llamada recibe SU copia: el solver
 * escribe en los arreglos que recibe (congelar piezas reescribe invMass, el
 * planchado reescribe la flexión), y la guardada tiene que quedar como salió
 * del armado para la próxima corrida.
 */
export async function obtenerTela(h: string, e: EntradasDelArmado): Promise<{ tela: TelaPreparada; origen: OrigenDeLaTela }> {
  const guardada = guardadas.get(h);
  if (guardada && coincide(guardada, e)) {
    guardar(h, guardada);
    return { tela: structuredClone(guardada), origen: 'cache' };
  }
  const vuelo = enVuelo.get(h);
  if (vuelo) return { tela: structuredClone(await vuelo), origen: 'en-vuelo' };
  const promesa = armarFueraDelHilo(e);
  enVuelo.set(h, promesa);
  try {
    const tela = await promesa;
    guardar(h, tela);
    return { tela: structuredClone(tela), origen: 'armada' };
  } finally {
    enVuelo.delete(h);
  }
}
```

`src/utils/cloth/transferibles.ts` (lo usan los dos workers, este y el del BVH de la tarea 11):

```ts
/** Los buffers de todos los arreglos tipados de un valor, sin repetir: viajan transferidos en un postMessage. */
export function transferibles(v: unknown, vistos = new Set<ArrayBuffer>()): ArrayBuffer[] {
  if (ArrayBuffer.isView(v)) vistos.add(v.buffer as ArrayBuffer);
  else if (Array.isArray(v)) v.forEach((x) => transferibles(x, vistos));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => transferibles(x, vistos));
  return [...vistos];
}
```

`prepararTelaWorker.ts`:

```ts
import { prepararTela } from './prepararTela';
import { transferibles } from '../transferibles';
import type { EntradasDelArmado } from './telasPreparadas';

self.onmessage = (m: MessageEvent<EntradasDelArmado>) => {
  try {
    const { pieces, seamPairs, fabric, interruptores } = m.data;
    const tela = prepararTela(pieces, seamPairs, fabric, interruptores);
    (self as unknown as Worker).postMessage({ tela }, transferibles(tela));
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
```

`telasPreparadas.ts` importa `prepararTela` (sin three) y el worker importa solo el tipo de `telasPreparadas`: el worker no carga three.

- [ ] **Paso 5: verde.** Correr `npx vitest run src/utils/cloth` y `npx tsc -b --noEmit`.
- [ ] **Paso 6: commit.** Mensaje: «perf(gpu): el armado de la tela fuera del hilo principal, con huella, caché y en vuelo compartido».

### Tarea 8: el solver usa la tela preparada

**Archivos:**
- Crear: `src/utils/cloth/complianceDeTela.ts`
- Modificar: `src/components/Viewport3D/useSimulationLifecycle.ts`, rama `─── WebGPU GPU solver ───`.
- Test: `src/components/Viewport3D/__tests__/tela-preparada.test.tsx`, con el arnés de `pausar-no-vuelve-a-vestir.test.tsx`.

**Interfaces:**
- Produce: `complianceDeTela(fabricId: string): FabricComplianceConfig | undefined`. Es exactamente el objeto que hoy arma la rama GPU: stretch 0, shear 0.001, la flexión de `toXPBDParams` y `density`, con sus comentarios.
- Consume: `huella` y `obtenerTela` (tarea 7), `interruptoresDeTela` (tarea 6) y el quinto parámetro de `initMultiPieceTsl`.

- [ ] **Paso 1: test rojo de `complianceDeTela`.** Para `'cotton-poplin'` devuelve el mismo objeto que la expresión inline de hoy (copiarla al test como referencia). Para una tela inexistente, `undefined`.
- [ ] **Paso 2: tests rojos de la rama GPU** (`GpuSolverClient` falso como en `pausar-no-vuelve-a-vestir`, y `vi.mock` de `telasPreparadas` con un `obtenerTela` falso).
  1. `obtenerTela` se llama una vez, con la huella de `huella(placedMeshes, seamPairs, fabricCompliance, interruptores)` y esas mismas entradas; la tela que devuelve llega a `initMultiPieceTsl` como quinto argumento.
  2. Se empuja `preparar:usada` con `{ fase: 'tela', origen }`, el origen que dio `obtenerTela`.
  3. Si la corrida se cancela mientras `obtenerTela` espera, `initMultiPieceTsl` no se llama.
- [ ] **Paso 3: implementar.** En la rama GPU, `fabricCompliance` pasa a ser `complianceDeTela(fabricId)` (el objeto inline y su comentario se mudan a `complianceDeTela.ts`; `pf` sigue para `tslSolverConfig`). Se mantiene el bloque `__VINA_SEAM_DEBUG__`. La llamada a `initMultiPieceTsl` queda así, con el mismo `withTimeout` de 12 s envolviendo la tela y el armado:

```ts
                const interruptores = interruptoresDeTela();
                await withTimeout(
                  (async () => {
                    const { tela, origen } = await obtenerTela(
                      huella(placedMeshes, seamPairs, fabricCompliance, interruptores),
                      { pieces: placedMeshes, seamPairs, fabric: fabricCompliance, interruptores },
                    );
                    if (cancelled) return;
                    pushSolverEvent('preparar:usada', { fase: 'tela', origen }, generation);
                    await gpuClient.initMultiPieceTsl(placedMeshes, seamPairs, tslSolverConfig, fabricCompliance, tela);
                  })(),
                  12000,
                  'TSL solver init',
                );
                if (cancelled) return;
```

- [ ] **Paso 4: verde.** Correr `npx vitest run src/components/Viewport3D src/utils/cloth` y `npx tsc -b --noEmit`.
- [ ] **Paso 5: commit.** Mensaje: «perf(simulación): la cascada WebGPU arma la tela fuera del hilo y usa la preparada».

### Tarea 9: el preparador arma la tela

**Archivos:**
- Crear: `src/components/Viewport3D/mallasDePiezas.ts`, con el mapeo de `useMeshing` (lo mallado más `outline`, `edges` y `meshMaxEdgeLength`), extraído y usado en sus dos sitios.
- Modificar: `src/components/Viewport3D/useMeshing.ts`, `usePrepararTela.ts` y `Viewport3D.tsx`.
- Test: `usePrepararTela.test.tsx` (agregar casos).

**Interfaces:**
- Produce: `mallasDePiezas(meshed: SimMeshedPiece[], pieces: PatternPiece[], densidades: Record<string, number>, densidad: number): MeshedPiece[]`. `SimMeshedPiece` es el `MeshedPiece` de `simulationInitClient.ts`.
- `EntradasDeLaTela` suma estos campos:

```ts
  medidas: BodyMeasurements; overrides: Record<string, unknown>; armAxis: ArmAxis;
  seams: Seam[]; seamGroups: SeamGroup[] | undefined; fabricId: string;
  conGpu: boolean;   // isWebGPUAvailable() && localStorage 'vina-use-webgpu' !== 'false'
```

- [ ] **Paso 1: extraer `mallasDePiezas`.** El cuerpo del `.map` que hoy está repetido en los dos efectos de `useMeshing` (después de `meshAllPieces`), tal cual. Correr `npx vitest run src/components/Viewport3D`: verde.
- [ ] **Paso 2: tests rojos del preparador** (`obtenerTela` con `vi.mock`).
  1. Con `conGpu: true`, tras mallar llama a `obtenerTela` con la huella y las entradas que daría la cascada: `colocarMallas(mallasDePiezas(...))`, `seamInitDataToPairs(seamsToInitData(seams, seamGroups), colocadas)`, `complianceDeTela(fabricId)` e `interruptoresDeTela()`. El test calcula esa huella por su cuenta, con las mismas funciones, y la compara.
  2. Con `conGpu: false` no llama a `obtenerTela` (foco de revisión 5).
  3. Un cambio de `armAxis` mientras malla suelta esa preparación y, 600 ms después, prepara con la colocación nueva: la huella de la segunda llamada es otra.
  4. Pulsar «Simular» (entradas → `null`) mientras malla no impide que, al terminar, llame a `obtenerTela`: la cascada compartirá esa tela en vuelo (foco de revisión 1).
- [ ] **Paso 3: implementar.** El efecto lleva un `vigente`, que la limpieza pone en `false` en los mismos casos en que suelta la malla (entradas cambiadas por otras, o desmontaje). En el `.then` del mallado, si `entradas.conGpu && vigente`:

```ts
          const colocadas = colocarMallas(
            mallasDePiezas(meshed, entradas.piezas, entradas.densidades, entradas.densidad),
            entradas.piezas, entradas.medidas, entradas.overrides, entradas.armAxis,
          );
          const seamPairs = seamInitDataToPairs(seamsToInitData(entradas.seams, entradas.seamGroups), colocadas);
          const fabric = complianceDeTela(entradas.fabricId);
          const interruptores = interruptoresDeTela();
          const t1 = performance.now();
          await obtenerTela(huella(colocadas, seamPairs, fabric, interruptores), { pieces: colocadas, seamPairs, fabric, interruptores });
          pushSolverEvent('preparar:listo', { fase: 'tela', ms: Math.round(performance.now() - t1) });
```

Un fallo empuja `preparar:fallo` con `{ fase: 'tela', message }` y no lanza.
- [ ] **Paso 4: pasar las entradas nuevas desde Viewport3D.** Viewport3D ya tiene `cuerpo` (las mismas medidas que GarmentSimulation: `medidasDelCuerpo` devuelve referencias estables), `arrangementOverrides`, `armAxis`, `seams` y `defaultFabricId`. Falta `seamGroups`, con `useSelector((s: RootState) => s.project.seamGroups)`. `conGpu` es `isWebGPUAvailable() && isWebGPUFeatureEnabled()`: se exporta `isWebGPUFeatureEnabled` de `useSimulationLifecycle.ts` y se reusa. Todo entra al `useMemo` de `entradasDeLaTela` y a sus dependencias.
- [ ] **Paso 5: verde.** Correr `npx vitest run src/components/Viewport3D` y `npx tsc -b --noEmit`.
- [ ] **Paso 6: commit.** Mensaje: «perf(simulación): el preparador deja armada la tela del solver WebGPU».

### Tarea 10: medir la entrega 2

- [ ] **Paso 1.** El controlador corre la sonda bajo el candado (pasos de la tarea 5, con el build nuevo), en WebGPU y en WASM.
- [ ] **Paso 2.** En WebGPU, `usadoDeLoPreparado` tiene que decir `{ fase: 'tela', origen: 'cache' }`. Si dice `'armada'`, la huella del preparador no es la de la cascada: se busca qué entrada difiere antes de seguir (foco de revisión 3).
- [ ] **Paso 3.** Comprobar que en el arranque ya no aparece la tarea larga del armado (~735 ms). Anotar `clicAPrimerCuadroMs`, `tareasDeMasDe100ms` y la compilación del primer cuadro.
- [ ] **Paso 4.** Si `clicAPrimerCuadroMs` sigue por encima de 1 s y la diferencia es la compilación de kernels, eso lo decide la entrega 4 de la spec (§ 4.6), que se diseña aparte.

---

## Entrega 3 — la colisión preparada

### Tarea 11: el BVH del cuerpo, en un worker y en caché

**Archivos:**
- Crear: `src/utils/cloth/gpu/bvhPreparado.ts`
- Crear: `src/utils/cloth/gpu/bvhWorker.ts`
- Modificar:
  - `src/utils/cloth/gpu/gpuSolverClient.ts`, `setTslCollisionBody`;
  - `src/components/Viewport3D/usePrepararTela.ts`;
  - `src/components/Viewport3D/Viewport3D.tsx`, que pasa la pose y los morphs.
- Test: `src/utils/cloth/gpu/__tests__/bvhPreparado.test.ts`, más un caso en `gpuSolverClient.test.ts`.

**Interfaces:**
- Produce:

```ts
export const BVH_GUARDADOS = 2;
export function guardarBvh(huellaDelCuerpo: string, bvh: LinearBVH): void;
export function bvhGuardado(huellaDelCuerpo: string): LinearBVH | null;  // el usado pasa al final
export function armarBvhFueraDelHilo(mesh: CollisionMeshData): Promise<LinearBVH>;  // worker; sin worker o si falla, buildLinearBVH en el hilo
```

- `setTslCollisionBody`: antes de `buildLinearBVH(mesh)`, prueba `bvhGuardado(huella(mesh))`. Con acierto no reconstruye. Empuja `preparar:usada` con `{ fase: 'bvh', origen: 'cache' | 'armado' }`.
- `EntradasDeLaTela` suma `pose` (`s.avatar.pose.joints`) y `morphs` (`s.avatar.morphTargets`), los mismos selectores que `AvatarModel`. No se usan para la huella: la huella es la de la malla horneada. Solo hacen que el preparador vuelva a hornear cuando el cuerpo cambia.

- [ ] **Paso 1: ¿alguien escribe en el BVH?** El BVH guardado se comparte sin copiar entre corridas. Antes de escribir código, buscar escrituras en sus arreglos después de armarlo: `rg -n "(nodes|skip|triVerts|triNormals|edgePseudonormals|vertexPseudonormals)\[[^\]]+\]\s*=" src/utils/cloth/gpu`, y leer `setTslCollisionBody` y `createTslCollisionBody`. Si algo escribe, `bvhGuardado` devuelve `structuredClone`, como las telas.
- [ ] **Paso 2: tests rojos.**
  1. `setTslCollisionBody` con un BVH guardado para la huella de esa malla no llama a `buildLinearBVH`: `vi.mock('../bvh', async (orig) => ({ ...(await orig()), buildLinearBVH: vi.fn((await orig<typeof import('../bvh')>()).buildLinearBVH) }))`. Empuja `preparar:usada` con `origen: 'cache'`.
  2. Con otra malla (otra pose u otras medidas) sí lo llama y empuja `origen: 'armado'` (foco de revisión 3).
  3. Sin `Worker`, `armarBvhFueraDelHilo` devuelve lo mismo que `buildLinearBVH` (misma `huella`) (foco de revisión 5).
  4. Con tres huellas, la primera ya no está.
- [ ] **Paso 3: implementar.**
  - `bvhWorker.ts`: `self.onmessage = (e) => { const bvh = buildLinearBVH(e.data.mesh); (self as unknown as Worker).postMessage({ bvh }, transferibles(bvh)); }`, con `transferibles` de la tarea 7. Este worker sí carga three y three-mesh-bvh (`bvh.ts` los usa): corre en reposo, fuera del hilo, y su arranque no cuenta para el clic.
  - `bvhPreparado.ts`: la caché de 2 entradas, como `guardar` de la tarea 7, y `armarBvhFueraDelHilo` con el mismo patrón de `armarFueraDelHilo` (sin worker, error o 10 s sin respuesta → en el hilo). El `postMessage` de la malla va sin transferir: la malla sigue siendo de quien llama.
  - El preparador, si `conGpu` y sigue `vigente`, después de la tela:

```ts
          const t2 = performance.now();
          const mesh = await bakeCollisionFromRender();   // ~54 ms en el hilo principal
          if (mesh && vigente) {
            const h = huella(mesh);
            if (!bvhGuardado(h)) guardarBvh(h, await armarBvhFueraDelHilo(mesh));
            pushSolverEvent('preparar:listo', { fase: 'bvh', ms: Math.round(performance.now() - t2) });
          }
```

- [ ] **Paso 4: verde.** Correr `npx vitest run src/utils/cloth/gpu src/components/Viewport3D` y `npx tsc -b --noEmit`.
- [ ] **Paso 5: commit.** Mensaje: «perf(gpu): el BVH del cuerpo se prepara en reposo, fuera del hilo».

### Tarea 12: medir la entrega 3 y fijar el criterio en la sonda

- [ ] **Paso 1.** El controlador corre la sonda bajo el candado, en WebGPU y en WASM.
- [ ] **Paso 2.** En WebGPU, `usadoDeLoPreparado` dice `origen: 'cache'` para la tela y para el BVH. Si el BVH dice `'armado'`, el horneado del cuerpo no se repite igual entre el reposo y «Simular» (pose en movimiento, huesos con muelles): se investiga antes de fijar nada.
- [ ] **Paso 3.** Si `clicAPrimerCuadroMs < 1000` y `tareasDeMasDe100ms === 0` en WebGPU, la sonda fija los dos como aserciones, junto con el acierto de lo preparado, y solo cuando la sonda esperó la preparación (`SONDA_PREPARAR_MS`):

```ts
if (TIER === 'webgpu') {
  expect(resumen.usadoDeLoPreparado, 'la cascada usa lo que preparó el reposo').toEqual(
    expect.arrayContaining([expect.objectContaining({ fase: 'tela', origen: 'cache' }), expect.objectContaining({ fase: 'bvh', origen: 'cache' })]),
  );
  expect(resumen.clicAPrimerCuadroMs, 'criterio 1 de la spec: < 1 s con la prenda preparada').toBeLessThan(1000);
  expect(resumen.tareasDeMasDe100ms, 'criterio 2 de la spec: nada congela más de 100 ms').toBe(0);
}
```

- [ ] **Paso 4.** Si no se cumplen, no se afloja la aserción: se mide qué falta y se decide con Samuel, sea la entrega 4 o lo que diga la medida.
- [ ] **Paso 5: commit.** Mensaje: «test(e2e): la sonda exige el arranque en menos de 1 s y sin congelar».

## Cierre

- **Suite entera** con `npm run test` (bajo el candado) y gate del deploy con `bash scripts/deploy-prod.sh --ensayo` y `VINA_E2E_PORT=5187`, ambos en verde.
- **Revisión final** de la rama con un subagente Opus (lentes: física idéntica, carreras del preparador, memoria y copias de las cachés).
- **Push, PR, merge y deploy**, con la orden de Samuel.
