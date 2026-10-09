# La IA de Vina — subproyecto 1, entrega 1b (segunda mitad, parte A): el ciclo del ajuste

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un agente pueda cerrar el ciclo del ajuste por la superficie: decir qué es cada pieza (`classify`), darle tela (`assign_fabric`), vestir el avatar (`dress`), simular hasta que la tela se asiente (`simulate`) y leer cómo queda cada pieza (`fit_map`). Cada respuesta dice la verdad con números, también cuando la simulación no puede avanzar.

**Architecture:**
- **Dos verbos de la prenda** (`verbos/prenda.ts`): escriben con `actuar` y los reductores de siempre (`updatePiece`, `setPieceFabric`), un paso de Ctrl+Z cada uno.
- **Dos verbos del vestido** (`verbos/vestir.ts`): no escriben el patrón. Mueven la vista y la simulación (`setViewMode`, `setViewMode3D`, `startSimulation`, `pauseSimulation`, `resetSimulation`) y miden.
- **Un ojo nuevo** (`verbos/ajuste.ts`): el mapa de ajuste por pieza, con las mismas fórmulas que la app (`computePerVertexStrain`) sobre la malla que ella dibuja (`getClothGeometry` y su manifiesto).
- **El latido** (`solverRuntimeTracker.ts`): `GarmentSimulation` cuenta cada cuadro de tela nueva que dibuja y deja a la vista las aristas del solver. `simulate` mira el latido para saber si la tela avanza, y `asentamiento.ts` decide cuándo está quieta.

**Tech Stack:** TypeScript, Redux Toolkit, zod 4, React Three Fiber, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md` (§ 5.1 «Medir» y «Actuar», § 5.2, § 5.3, § 5.4). La Task 6 le añade la nota de esta entrega en § 5.7.

## Global Constraints

- **Idioma.** La superficie va en inglés: nombres en `snake_case`, descripciones, claves del recibo y textos de los `warnings` (D8). Los pasos del historial, que ve María, siguen la forma aprobada el 09-10: «IA: <verbo> <objeto>». Los comentarios, en español.
- **No se reescribe ni la geometría ni la física.** Los verbos leen lo que ya existe: `detectSemanticEdges`, `computeEffectiveRegions`, `computePerVertexStrain`, `fabricToFitParams`, `getClothGeometry`.
- **Un escritor por hecho.** Clasificar va por `updatePiece`; la tela, por `setPieceFabric` y `setDefaultFabric`; la vista, por `setViewMode` y `setViewMode3D`; la simulación, por `startSimulation`, `pauseSimulation` y `resetSimulation`.
- **Los verbos no van al registro** (`registry.size === 232` está congelado). `tests/repo/la-superficie-es-corta.test.ts`: como mucho 24 verbos y 30.000 caracteres de definiciones.
- **Nada visual.** Fuera de la superficie solo cambian dos llamadas en el `useFrame` de `GarmentSimulation.tsx`, `shouldRequestEdgeData` y el sitio de `DEFAULT_FIT_PARAMS`. No hace falta el contrato de interfaz: ninguna cadena, color ni superficie nueva.
- **Gates.** `npx tsc -b --noEmit`; nada de `--no-verify`; `node scripts/ui-contract-lint.mjs` no sube ningún contador; cada tarea cierra con la suite entera, redirigida a un archivo y avisando antes a la sesión vina-ed. `<scratchpad>` es el directorio scratchpad de la sesión que ejecuta.
- **Dónde.** Worktree `.claude/worktrees/ia-1b2`, rama `feat/ia-superficie-1b-2` desde `main` `44dec473`. Sondas y e2e en el puerto 5179 (`VINA_E2E_PORT=5179`): el 5174 es del gate del deploy.
- **`git add`** con rutas explícitas; nunca `.maria-avatar.mjs`.

## Review Focus

1. **Vina deja de verse a mitad de `simulate`** (pestaña de fondo, ventana minimizada o tapada). El recibo lo dice en segundos, sin esperar el plazo y sin declarar la tela asentada. → Task 5.
2. **El tier WASM** (sin WebGPU) da un cuadro cada uno o dos segundos. La camisa no se asienta en el plazo, el recibo lo dice con el tier y el ritmo, y `fit_map` mide igual. → Tasks 5 y 7.
3. **Una pieza sin categoría, con un nombre que no dice nada.** `dress` la nombra y no da `done`. → Task 2.
4. **Clasificar una pieza ya cosida.** Sus bordes no cambian de nombre, porque las costuras los guardan por nombre. → Task 1.
5. **Telas distintas por pieza.** El simulador viste con una sola; el recibo lo dice y no miente. → Task 1.

## Medido el 09-10 (las dos sondas)

**Con Vina fuera de la vista** (`scratchpad/sonda-oculta.mjs`: Chromium con ventana y sin los flags con que Playwright evita frenar las ventanas):

| Escenario | Cuadros por segundo | ¿La tela avanza? |
|---|---|---|
| 3D a la vista | 54 | sí |
| Otra pestaña delante | 1 | no |
| Ventana minimizada | 1 | no |
| Tapada por otra ventana del mismo Chromium | 53 | sí (en esta sonda) |

`playwright.webgpu.config.ts` apaga a propósito el freno de las ventanas tapadas: el freno existe. Bajo Playwright, `document.visibilityState` decía `visible` incluso minimizada. Por eso el latido manda y la visibilidad solo afina el aviso.

**La camisa de María cosida, hasta asentarse** (`scratchpad/sonda-asentamiento.mjs`, 29.338 vértices, desplazamiento por cuadro):

- **WebGPU.**
  - La tela empieza a moverse a los ~4,9 s.
  - El percentil 95 del desplazamiento baja así: 4,87 mm → 0,54 (6,7 s) → 0,14 (9,8 s) → 0,05 (16,4 s) → 0,013 (24,9 s).
  - Desde ahí se queda entre 0,006 y 0,015 mm por cuadro. El máximo nunca baja de 0,14: unos pocos vértices tiemblan siempre.
- **WASM.** El worker entrega un cuadro cada 1-2 s. A los 40 s, el percentil 95 seguía en 0,058 mm por cuadro de pantalla, unos 3 mm por cuadro del solver: la tela seguía bajando.

## Decisiones de este plan

Afinan la spec sin cambiar su intención. La Task 6 las anota en ella.

1. **Dos partes.** Esta lleva el ciclo del ajuste: `classify`, `assign_fabric`, `dress`, `simulate` y `fit_map`. La siguiente, `dart`, `seam_allowance`, `grade` y `export`.
2. **La simulación solo avanza con Vina a la vista.** `simulate` mira el latido (cuadros de tela nueva que la app dibujó) y no espera de balde:
   - con la pestaña oculta 2 s, lo dice;
   - sin cuadro nuevo en 10 s, lo dice;
   - sin ningún cuadro en 30 s, dice que no arrancó y lo último que dijo el solver.
3. **Asentada:** pasados 180 cuadros, la tela se mueve menos de 0,02 mm por cuadro (percentil 95 de sus vértices) en tres lecturas seguidas, separadas por al menos 30 cuadros. Medido en la camisa de María en WebGPU: unos 500 cuadros.
4. **`wait_seconds`**, de 1 a 110 y por defecto 60. Son los 60 s de la spec, y siempre quedan por debajo de los 120 s del puente.
5. **En el tier WASM la camisa no se asienta en el plazo.** El recibo lo dice con el tier, los cuadros por segundo y lo que se mueve todavía.
6. **`stop` pausa.** La app libera el solver y la tela se queda donde estaba; un `start` después vuelve a vestir desde la pose del vestido. Es lo que hace la app hoy (`useSimulationLifecycle.ts:823-841`).
7. **`fit_map` mide cada pieza por sus vértices** (el manifiesto de la malla), con la tela de la simulación y sin el cuerpo. «Ajustado» y «no se puede poner» cuentan la pieza entera, no solo donde toca el cuerpo, como hace la app hoy (pasa el avatar como `null`).
8. **Las aristas del solver se piden mientras falten**, con el mapa de ajuste en pantalla o sin él. Antes solo se pedían con el mapa encendido, y `fit_map` se habría quedado sin ellas.
9. **`dress` no escribe el patrón ni borra lo que María movió a mano.** La herramienta vieja (`arrangeGarment`) lo borraba. Si la simulación corre, la para y deja el 3D en vestir.
10. **Desde 2D, `dress` y `simulate` pasan la vista a Split**, como el panel de render (`renderSettingsThunk.ts`).
11. **`classify` nombra de nuevo los bordes solo si nada los usa** (costuras, grupos de costura, pliegues, elásticos, puntos de medida). Si algo los usa, los deja y lo avisa. Sin `side`, el lado viejo se va.
12. **El candado protege el contorno y las internas.** `classify` y `assign_fabric` no los tocan, así que se permiten, como coser (decisión 13 de la primera mitad).
13. **`assign_fabric` pone la tela en las piezas**, y Ctrl+Z la quita. Si todas las piezas activas comparten una, la simulación la usa (`setDefaultFabric`). Eso no se deshace: es estado de la simulación, como la vista. Si las telas difieren, la simulación sigue con la suya y el recibo lo dice.
14. **Pasos del historial:** «IA: clasificar Manga» y «IA: poner Mezclilla a 5 piezas» (el `nameEs` de la tela).
15. **Las instrucciones** añaden que la simulación corre en el navegador y solo avanza con Vina a la vista. La línea del candado dice lo que protege.

## Archivos

| Archivo | Qué |
|---|---|
| `src/copilot/superficie/verbos/prenda.ts` (nuevo) | `classify`, `assign_fabric`. |
| `src/copilot/superficie/verbos/vestir.ts` (nuevo) | `dress`, `simulate`, `verElTres`. |
| `src/copilot/superficie/verbos/ajuste.ts` (nuevo) | `fit_map`, `ajusteDeLaTela`. |
| `src/copilot/superficie/asentamiento.ts` (nuevo) | `movimientoP95`, `estaAsentada` y sus umbrales. |
| `src/copilot/superficie/index.ts` | Registra los cinco. |
| `src/copilot/superficie/instrucciones.ts` | La simulación y el candado. |
| `mcp/superficie.json` | Regenerado (`MCP_SUPERFICIE_UPDATE=1`). |
| `src/utils/cloth/solverRuntimeTracker.ts` | `latirLaSimulacion`, `latidosDeLaSimulacion`, `aristasDeLaTela`. |
| `src/components/Viewport3D/GarmentSimulation.tsx` | El latido en los dos caminos del `useFrame`; `DEFAULT_FIT_PARAMS` sale de `fitMaps.ts`. |
| `src/utils/cloth/fitMaps.ts` | `DEFAULT_FIT_PARAMS`; `shouldRequestEdgeData` sin el modo. |
| `src/copilot/superficie/__tests__/fixtures.ts` | `tienda()` con la simulación. |
| Tests nuevos | `prenda.test.ts`, `vestir.test.ts`, `ajuste.test.ts`, `asentamiento.test.ts`, `simular.test.ts`; casos en `solverRuntimeTracker.test.ts`, `fitMaps.test.ts` y `ciclo.maria.test.ts`; e2e `tests/e2e/ia-ciclo-del-ajuste.spec.ts`. |
| `scripts/deploy-prod.sh` | El e2e nuevo entra en el gate. |
| La spec | La nota de esta entrega (Task 6). |

---

### Task 1: `classify` y `assign_fabric`

**Files:**
- Create: `src/copilot/superficie/verbos/prenda.ts`, `src/copilot/superficie/__tests__/prenda.test.ts`
- Modify: `src/copilot/superficie/__tests__/fixtures.ts`

**Interfaces:**
- Consumes: `actuar`, `cerrar`, `rehusar`, `piezaDe` (`actuar.ts`); `bordesDe` (`verbos/leer.ts`); `updatePiece`, `setPieceFabric` (`projectSlice`); `setDefaultFabric` (`simulationSlice`); `detectSemanticEdges`; `computeEffectiveRegions`; `PHYSICAL_FABRIC_LIBRARY`, `getPhysicalFabric`.
- Produces: `VERBOS_DE_PRENDA: readonly Verbo[]` (`classify`, `assign_fabric`); `tienda(pieces, seams, proyecto, workflow, simulacion)` con el reductor `simulation`; `suelta(id, name, over)` en `fixtures.ts`.

- [ ] **Step 1: La tienda con la simulación, y una pieza suelta**

En `fixtures.ts`, importa `simulationReducer from '../../../store/simulationSlice'`, añade `simulation: simulationReducer` al `combineReducers` de `tienda()` y un quinto parámetro:

```ts
export function tienda(
  pieces: PatternPiece[] = [],
  seams: Seam[] = [],
  proyecto: Record<string, unknown> = {},
  workflow: Record<string, unknown> = {},
  simulacion: Record<string, unknown> = {},
) {
  const inicio = { type: '@@prueba/inicio' };
  const reducer = combineReducers({ project: projectReducer, editor: editorReducer, copilotUI: copilotUIReducer, workflow: workflowReducer, simulation: simulationReducer });
  type Estado = ReturnType<typeof reducer>;
  const preloadedState: Partial<Estado> = {
    project: { ...projectReducer(undefined, inicio), pieces, seams, ...proyecto } as Estado['project'],
    workflow: { ...workflowReducer(undefined, inicio), ...workflow } as Estado['workflow'],
    simulation: { ...simulationReducer(undefined, inicio), ...simulacion } as Estado['simulation'],
  };
  // …lo demás igual
```

Y al final del archivo:

```ts
/** Un rectángulo de 400 × 600 mm con los bordes que le daría `addPiece` (por su nombre y su categoría). */
export function suelta(id: string, name = id, over: Partial<PatternPiece> = {}): PatternPiece {
  const p: PatternPiece = {
    id, name, position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0, internals: [],
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [400, 0] }, { type: 'L', values: [400, 600] },
      { type: 'L', values: [0, 600] }, { type: 'Z', values: [] },
    ],
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0, ...over,
  };
  return { ...p, edges: over.edges ?? detectSemanticEdges(p) };
}
```

- [ ] **Step 2: Los tests (rojo)**

Crea `src/copilot/superficie/__tests__/prenda.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { undo } from '../../../store/editorSlice';
import { detectSemanticEdges } from '../../../utils/semanticEdges';
import { ejecutarVerbo } from '../ejecutar';
import { VERBOS_DE_PRENDA } from '../verbos/prenda';
import type { ContextoDeVerbo, Recibo } from '../tipos';
import { costura, suelta, tienda } from './fixtures';

const actuarCon = async (ctx: ContextoDeVerbo, nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_PRENDA, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('classify', () => {
  it('le pone categoría y lado, nombra sus bordes por la categoría y dice dónde va al vestir', async () => {
    const p = suelta('p1', 'Pieza 1');
    const { store, ctx } = tienda([p]);
    const r = await actuarCon(ctx, 'classify', { piece_id: 'p1', category: 'bodice', side: 'back' });
    expect(r.done).toBe(true);
    const despues = store.getState().project.pieces[0];
    expect(despues).toMatchObject({ category: 'bodice', side: 'back' });
    const esperados = detectSemanticEdges({ ...p, category: 'bodice', side: 'back' }).map(e => e.name);
    // Que el test muerda: los nombres por la categoría no son los que tenía.
    expect(esperados).not.toEqual(p.edges!.map(e => e.name));
    expect(despues.edges!.map(e => e.name)).toEqual(esperados);
    expect(r.measure).toMatchObject({ category: 'bodice', side: 'back', region: 'back-torso', edges_renamed: true });
    expect((r.measure.edges as { name: string }[]).map(e => e.name)).toEqual(esperados);
  });

  it('sin lado, el lado viejo se va', async () => {
    const { store, ctx } = tienda([suelta('p1', 'Pieza 1', { category: 'bodice', side: 'front' })]);
    const r = await actuarCon(ctx, 'classify', { piece_id: 'p1', category: 'sleeve' });
    expect(store.getState().project.pieces[0].side).toBeUndefined();
    expect(r.measure).toMatchObject({ side: null, region: 'left-sleeve' });
  });

  it('una pieza cosida conserva los nombres de sus bordes, y lo dice', async () => {
    const a = suelta('a', 'Pieza A');
    const b = suelta('b', 'Pieza B');
    const borde = a.edges![0].name;
    const seam = costura({ pieceA: { pieceId: 'a', edgeName: borde }, pieceB: { pieceId: 'b', edgeName: b.edges![0].name } });
    const { store, ctx } = tienda([a, b], [seam]);
    const r = await actuarCon(ctx, 'classify', { piece_id: 'a', category: 'bodice', side: 'front' });
    expect(r.done).toBe(true);
    expect(store.getState().project.pieces[0].edges).toEqual(a.edges);
    expect(r.measure.edges_renamed).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/keep their names/);
  });

  it('un Ctrl+Z la deja como estaba', async () => {
    const p = suelta('p1', 'Pieza 1');
    const { store, ctx } = tienda([p]);
    await actuarCon(ctx, 'classify', { piece_id: 'p1', category: 'bodice', side: 'back' });
    store.dispatch(undo());
    const vuelta = store.getState().project.pieces[0];
    expect(vuelta.category).toBeUndefined();
    expect(vuelta.edges).toEqual(p.edges);
  });

  it('una categoría que no existe no pasa', async () => {
    const { ctx } = tienda([suelta('p1')]);
    const r = await ejecutarVerbo(VERBOS_DE_PRENDA, 'classify', { piece_id: 'p1', category: 'shoe' }, ctx);
    expect(r).toMatchObject({ ok: false });
  });
});

describe('assign_fabric', () => {
  it('a toda la prenda: cada pieza activa y la simulación', async () => {
    const { store, ctx } = tienda([suelta('a'), suelta('b'), suelta('c', 'c', { active: false })]);
    const r = await actuarCon(ctx, 'assign_fabric', { fabric: 'denim-12oz' });
    expect(r.done).toBe(true);
    const telas = store.getState().project.pieces.map(p => p.fabricId);
    expect(telas).toEqual(['denim-12oz', 'denim-12oz', undefined]);
    expect(store.getState().simulation.defaultFabricId).toBe('denim-12oz');
    expect(r.measure).toMatchObject({ fabric: { id: 'denim-12oz' }, simulation_fabric: 'denim-12oz' });
    expect(r.warnings).toEqual([]);
  });

  it('una sola pieza con otra tela: la simulación sigue con la suya, y lo dice', async () => {
    const { store, ctx } = tienda([suelta('a'), suelta('b')]);
    const r = await actuarCon(ctx, 'assign_fabric', { fabric: 'denim-12oz', piece_ids: ['a'] });
    expect(r.done).toBe(true);
    expect(store.getState().project.pieces.map(p => p.fabricId)).toEqual(['denim-12oz', undefined]);
    expect(store.getState().simulation.defaultFabricId).toBe('cotton-poplin');
    expect(r.measure.simulation_fabric).toBe('cotton-poplin');
    expect(r.warnings.join(' ')).toMatch(/one fabric.*cotton-poplin/);
  });

  it('Ctrl+Z devuelve las telas de las piezas', async () => {
    const { store, ctx } = tienda([suelta('a'), suelta('b')]);
    await actuarCon(ctx, 'assign_fabric', { fabric: 'denim-12oz' });
    store.dispatch(undo());
    expect(store.getState().project.pieces.map(p => p.fabricId)).toEqual([undefined, undefined]);
  });

  it('una tela que no está en la biblioteca no pasa', async () => {
    const { ctx } = tienda([suelta('a')]);
    const r = await ejecutarVerbo(VERBOS_DE_PRENDA, 'assign_fabric', { fabric: 'jersey-knit' }, ctx);
    expect(r).toMatchObject({ ok: false });
  });
});
```

(`jersey-knit` está en `FABRIC_LIBRARY`, la otra biblioteca, y no en `PHYSICAL_FABRIC_LIBRARY`, que es la que lee el simulador.)

- [ ] **Step 3: Verlos fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/prenda.test.ts`
Expected: FAIL — `Cannot find module '../verbos/prenda'`.

- [ ] **Step 4: Los dos verbos**

Crea `src/copilot/superficie/verbos/prenda.ts`:

```ts
import { z } from 'zod';
import type { PatternPiece, PieceCategory, PieceSide } from '../../../types/types';
import type { RootState } from '../../../store';
import { definirVerbo, type Verbo } from '../tipos';
import { setPieceFabric, updatePiece } from '../../../store/projectSlice';
import { setDefaultFabric } from '../../../store/simulationSlice';
import { detectSemanticEdges } from '../../../utils/semanticEdges';
import { computeEffectiveRegions } from '../../../utils/cloth/garmentPlacement';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric } from '../../../utils/cloth/physicalFabric';
import { actuar, cerrar, piezaDe, rehusar } from '../actuar';
import { bordesDe } from './leer';

type Proyecto = RootState['project'];

const CATEGORIAS = ['bodice', 'sleeve', 'collar', 'skirt', 'trouser', 'waistband', 'facing', 'lining', 'pocket', 'cuff', 'hood', 'yoke', 'other'] as const satisfies readonly PieceCategory[];
const LADOS = ['front', 'back', 'left', 'right', 'center', 'both'] as const satisfies readonly PieceSide[];
const TELAS = PHYSICAL_FABRIC_LIBRARY.map(f => f.id) as [string, ...string[]];

/** Lo que guarda por nombre un borde de la pieza: si algo lo hace, nombrarlos de nuevo lo dejaría colgando. */
function quienNombraSusBordes(id: string, p: Proyecto): string[] {
  const es = (x: { pieceId: string }) => x.pieceId === id;
  const quien: string[] = [];
  if (p.seams.some(s => es(s.pieceA) || es(s.pieceB))) quien.push('seams');
  if (p.seamGroups.some(g => g.edgesA.some(es) || g.edgesB.some(es))) quien.push('seam groups');
  if (p.pleats.some(es)) quien.push('pleats');
  if (p.elastics.some(es)) quien.push('elastics');
  if (p.poms.some(m => es(m.pointA) || es(m.pointB))) quien.push('points of measure');
  return quien;
}

/** La región del cuerpo que le toca a la pieza al vestir, entre las activas (la misma que usa la colocación). */
export function regionAlVestir(pieces: readonly PatternPiece[], id: string): string | null {
  const activas = pieces.filter(p => p.active);
  const i = activas.findIndex(p => p.id === id);
  if (i < 0) return null;
  const r = computeEffectiveRegions(activas)[i];
  return r === 'unknown' ? null : r;
}

const classify = definirVerbo({
  name: 'classify',
  description:
    'Say what a piece is: its category and its side. Dressing reads them to place the piece on the body. If no seam, seam group, pleat, elastic or point of measure uses the piece yet, its edges are detected again and named for the category (armhole, sleeveCap, neckline...); otherwise they keep their names. Omit side for a piece with no side. Returns the category, the side, where the piece goes when dressed, and its edges, measured.',
  args: z.object({
    piece_id: z.string().describe('a piece id from read_pattern'),
    category: z.enum(CATEGORIAS),
    side: z.enum(LADOS).optional(),
  }),
  run: ({ piece_id, category, side }, ctx) => {
    const piece = piezaDe(ctx, piece_id);
    const usan = quienNombraSusBordes(piece.id, ctx.getState().project);
    const nueva: PatternPiece = { ...piece, category, side };
    if (usan.length === 0) {
      const edges = detectSemanticEdges(nueva);
      // Un contorno que el detector no entiende da cero bordes: mejor los de antes que ninguno.
      if (edges.length > 0) nueva.edges = edges;
    }
    const renombrados = nueva.edges !== piece.edges;
    const e = actuar(ctx, 'classify', `clasificar ${piece.name}`, () => { ctx.dispatch(updatePiece(nueva)); });
    const despues = e.despues.pieces.find(p => p.id === piece.id)!;
    return cerrar(ctx, 'classify', e, {
      done: despues.category === category && despues.side === side,
      measure: {
        piece_id,
        category: despues.category ?? null,
        side: despues.side ?? null,
        region: regionAlVestir(e.despues.pieces, piece.id),
        edges: bordesDe(despues),
        edges_renamed: renombrados,
      },
      warnings: usan.length > 0 ? [`the edges keep their names because ${usan.join(', ')} use them`] : [],
    });
  },
});

const assignFabric = definirVerbo({
  name: 'assign_fabric',
  description:
    "Give pieces a fabric from Vina's library; by default every active piece. The simulation drapes the whole garment with one fabric: when all the active pieces share one, the simulation uses it; when they differ, it keeps its own and the receipt says which. Returns the fabric of each piece and the fabric the simulation uses.",
  args: z.object({
    fabric: z.enum(TELAS),
    piece_ids: z.array(z.string()).min(1).optional().describe('piece ids from read_pattern; default every active piece'),
  }),
  run: ({ fabric, piece_ids }, ctx) => {
    const objetivo = piece_ids
      ? piece_ids.map(id => piezaDe(ctx, id))
      : ctx.getState().project.pieces.filter(p => p.active);
    if (objetivo.length === 0) return rehusar('there are no active pieces');
    const tela = getPhysicalFabric(fabric)!;
    const a = objetivo.length === 1 ? objetivo[0].name : `${objetivo.length} piezas`;
    const e = actuar(ctx, 'assign_fabric', `poner ${tela.nameEs} a ${a}`, () => {
      for (const p of objetivo) ctx.dispatch(setPieceFabric({ pieceId: p.id, fabricId: fabric }));
    });
    const activas = e.despues.pieces.filter(p => p.active);
    if (activas.length > 0 && activas.every(p => p.fabricId === fabric)) ctx.dispatch(setDefaultFabric(fabric));
    const simulacion = ctx.getState().simulation.defaultFabricId;
    const telaDe = (id: string) => e.despues.pieces.find(p => p.id === id)?.fabricId ?? null;
    return cerrar(ctx, 'assign_fabric', e, {
      done: objetivo.every(p => telaDe(p.id) === fabric),
      measure: {
        fabric: { id: tela.id, name: tela.name },
        pieces: objetivo.map(p => ({ piece_id: p.id, name: p.name, fabric_id: telaDe(p.id) })),
        simulation_fabric: simulacion,
      },
      warnings: simulacion === fabric
        ? []
        : [`the active pieces have different fabrics, and the simulation drapes the whole garment with one fabric: ${simulacion}`],
    });
  },
});

export const VERBOS_DE_PRENDA: readonly Verbo[] = [classify, assignFabric];
```

- [ ] **Step 5: Verlos pasar**

Run: `npx vitest run src/copilot/superficie/__tests__/prenda.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Mutar las guardas**

Cambia a mano, una a una, y mira caer su test (luego deshazlas con Edit, nunca con `git checkout`):
- `if (usan.length === 0)` → `if (true)` → cae «una pieza cosida conserva…».
- `activas.every(p => p.fabricId === fabric)` → `true` → cae «una sola pieza con otra tela…».

- [ ] **Step 7: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test > <scratchpad>/1b2-t1.log 2>&1; tail -8 <scratchpad>/1b2-t1.log
git add src/copilot/superficie/verbos/prenda.ts src/copilot/superficie/__tests__/prenda.test.ts src/copilot/superficie/__tests__/fixtures.ts
git commit -m "feat(superficie): classify y assign_fabric, con el recibo de lo que lee el vestido"
```

---

### Task 2: `dress`

**Files:**
- Create: `src/copilot/superficie/verbos/vestir.ts`, `src/copilot/superficie/__tests__/vestir.test.ts`
- Modify: `src/utils/cloth/garmentPlacement.ts` (exporta `rawRegions`)

**Interfaces:**
- Consumes: `tienda`, `suelta` (Task 1); `computeEffectiveRegions`, `rawRegions`; `setViewMode` (`editorSlice`); `setViewMode3D`, `resetSimulation` (`simulationSlice`); `revisionDelProyecto`.
- Produces: `VERBOS_DE_VESTIR` (aquí con `dress`; la Task 5 le suma `simulate`); `verElTres(ctx): boolean` (true si cambió la vista); `sinCambios(): Recibo['changed']`.

- [ ] **Step 1: Los tests (rojo)**

Crea `src/copilot/superficie/__tests__/vestir.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { setViewMode } from '../../../store/editorSlice';
import { startSimulation } from '../../../store/simulationSlice';
import { ejecutarVerbo } from '../ejecutar';
import { VERBOS_DE_VESTIR } from '../verbos/vestir';
import type { ContextoDeVerbo, Recibo } from '../tipos';
import { suelta, tienda } from './fixtures';

const actuarCon = async (ctx: ContextoDeVerbo, nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_VESTIR, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('dress', () => {
  it('dice dónde va cada pieza y qué lo decidió, sin tocar el patrón, y deja el 3D en vestir', async () => {
    const { store, ctx } = tienda([
      suelta('d', 'Pieza A', { category: 'bodice', side: 'front' }),
      suelta('m', 'Manga'),
    ]);
    const antes = store.getState().project;
    const r = await actuarCon(ctx, 'dress', {});
    expect(r.done).toBe(true);
    expect(r.measure.pieces).toEqual([
      { piece_id: 'd', name: 'Pieza A', region: 'front-torso', decided_by: 'category' },
      { piece_id: 'm', name: 'Manga', region: 'left-sleeve', decided_by: 'name' },
    ]);
    expect(store.getState().project).toBe(antes);
    expect(r.changed).toEqual({ created: [], modified: [], deleted: [] });
    expect(r.revision.after).toBe(r.revision.before);
    expect(store.getState().simulation.viewMode3D).toBe('arrange');
  });

  it('una pieza que Vina no sabe dónde poner: la nombra y no da done', async () => {
    const { ctx } = tienda([suelta('d', 'Pieza A', { category: 'bodice' }), suelta('x', 'Pieza 7')]);
    const r = await actuarCon(ctx, 'dress', {});
    expect(r.done).toBe(false);
    expect(r.measure.pieces).toContainEqual({ piece_id: 'x', name: 'Pieza 7', region: null, decided_by: 'none' });
    expect(r.warnings.join(' ')).toMatch(/Pieza 7.*front torso.*classify/i);
  });

  it('ninguna clasificada: dice que las alterna entre delante y detrás', async () => {
    const { ctx } = tienda([suelta('x', 'Pieza 1'), suelta('y', 'Pieza 2')]);
    const r = await actuarCon(ctx, 'dress', {});
    expect(r.done).toBe(false);
    expect((r.measure.pieces as { region: string }[]).map(p => p.region)).toEqual(['front-torso', 'back-torso']);
    expect(r.warnings.join(' ')).toMatch(/no piece is classified/);
  });

  it('desde 2D pasa a Split', async () => {
    const { store, ctx } = tienda([suelta('d', 'Delantero', { category: 'bodice' })]);
    store.dispatch(setViewMode('2d'));
    const r = await actuarCon(ctx, 'dress', {});
    expect(store.getState().editor.viewMode).toBe('split');
    expect(r.measure).toMatchObject({ view: 'split', view_changed: true });
  });

  it('con la simulación corriendo, la para para vestir', async () => {
    const { store, ctx } = tienda([suelta('d', 'Delantero', { category: 'bodice' })]);
    store.dispatch(startSimulation());
    await actuarCon(ctx, 'dress', {});
    expect(store.getState().simulation.simulationState).toBe('idle');
  });

  it('las piezas apagadas no se visten, y lo movido a mano lo dice', async () => {
    const { ctx } = tienda(
      [suelta('d', 'Delantero', { category: 'bodice' }), suelta('z', 'Bolsillo', { category: 'pocket', active: false })],
      [],
      { arrangementOverrides: { d: [0, 1.2, 0.2] } },
    );
    const r = await actuarCon(ctx, 'dress', {});
    expect(r.measure.pieces).toEqual([
      { piece_id: 'd', name: 'Delantero', region: 'front-torso', decided_by: 'category', moved_by_hand: true },
    ]);
    expect(r.measure.inactive).toEqual([{ piece_id: 'z', name: 'Bolsillo' }]);
  });

  it('sin piezas activas no viste nada', async () => {
    const { ctx } = tienda([suelta('z', 'z', { active: false })]);
    const r = await actuarCon(ctx, 'dress', {});
    expect(r).toMatchObject({ done: false, warnings: ['there are no active pieces to dress'] });
  });
});
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/vestir.test.ts`
Expected: FAIL — `Cannot find module '../verbos/vestir'`.

- [ ] **Step 3: `dress`**

En `garmentPlacement.ts`, `rawRegions` pasa a `export function rawRegions`, y su comentario dice por qué: «Exportada para que `dress` (IA 1b-2) distinga una pieza sin región de la alternancia delante/detrás que `computeEffectiveRegions` le pone a un patrón sin clasificar. Sigue siendo el único sitio que reinicia los toggles». Luego crea `src/copilot/superficie/verbos/vestir.ts`:

```ts
import { z } from 'zod';
import type { PatternPiece } from '../../../types/types';
import { definirVerbo, type ContextoDeVerbo, type Recibo, type Verbo } from '../tipos';
import { setViewMode } from '../../../store/editorSlice';
import { resetSimulation, setViewMode3D } from '../../../store/simulationSlice';
import { computeEffectiveRegions, rawRegions } from '../../../utils/cloth/garmentPlacement';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { rehusar } from '../actuar';

/** Un objeto nuevo cada vez: un recibo no comparte su `changed` con otro. */
export const sinCambios = (): Recibo['changed'] => ({ created: [], modified: [], deleted: [] });

/** El vestido y la simulación se ven en 3D: desde 2D la vista pasa a Split, como el panel de render (`renderSettingsThunk.ts`). */
export function verElTres(ctx: ContextoDeVerbo): boolean {
  if (ctx.getState().editor.viewMode !== '2d') return false;
  ctx.dispatch(setViewMode('split'));
  return true;
}

/** Qué decidió la región: la categoría, el nombre, o nada (la región cruda, antes de alternar). */
function decididaPor(p: PatternPiece, cruda: string): 'category' | 'name' | 'none' {
  if (cruda === 'unknown') return 'none';
  return p.category && p.category !== 'other' ? 'category' : 'name';
}

const dress = definirVerbo({
  name: 'dress',
  description:
    'Place the pieces on the avatar, in the 3D view (arrange mode; from 2D the view switches to Split), ready to simulate. It changes nothing in the pattern, and stops the simulation if it runs. Returns where each active piece goes and what decided it (its category and side, or its name), the pieces left out and why, and how many seams are active. A piece Vina cannot place drapes on the front torso: classify it.',
  args: z.object({}),
  run: (_args, ctx) => {
    const { project, simulation } = ctx.getState();
    const activas = project.pieces.filter(p => p.active);
    if (activas.length === 0) return rehusar('there are no active pieces to dress');
    // Las regiones que se usan, y las crudas: sin clasificar ninguna, Vina las
    // alterna delante/detrás (`garmentPlacement.ts:644-654`) y eso no es saber.
    const regiones = computeEffectiveRegions(activas);
    const crudas = rawRegions(activas);
    const todasSinClase = crudas.every(r => r === 'unknown');
    const view_changed = verElTres(ctx);
    if (simulation.simulationState !== 'idle') ctx.dispatch(resetSimulation());
    ctx.dispatch(setViewMode3D('arrange'));
    const piezas = activas.map((p, i) => ({
      piece_id: p.id,
      name: p.name,
      region: regiones[i] === 'unknown' ? null : regiones[i],
      decided_by: decididaPor(p, crudas[i]),
      ...(project.arrangementOverrides[p.id] ? { moved_by_hand: true } : {}),
    }));
    const warnings = todasSinClase
      ? ['no piece is classified: Vina alternates them between the front and the back torso. Classify them.']
      : piezas.filter(p => p.region === null).map(p =>
        `piece ${p.name} (${p.piece_id}) has no category and its name does not say where it goes: it would drape on the front torso. Classify it.`);
    const r = revisionDelProyecto();
    return {
      done: warnings.length === 0,
      changed: sinCambios(),
      measure: {
        pieces: piezas,
        inactive: project.pieces.filter(p => !p.active).map(p => ({ piece_id: p.id, name: p.name })),
        seams: { active: project.seams.filter(s => s.active).length, inactive: project.seams.filter(s => !s.active).length },
        view: ctx.getState().editor.viewMode,
        view_changed,
      },
      warnings,
      revision: { before: r, after: r },
    } satisfies Recibo;
  },
});

export const VERBOS_DE_VESTIR: readonly Verbo[] = [dress];
```

- [ ] **Step 4: Verlos pasar**

Run: `npx vitest run src/copilot/superficie/__tests__/vestir.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test > <scratchpad>/1b2-t2.log 2>&1; tail -8 <scratchpad>/1b2-t2.log
git add src/copilot/superficie/verbos/vestir.ts src/copilot/superficie/__tests__/vestir.test.ts src/utils/cloth/garmentPlacement.ts
git commit -m "feat(superficie): dress dice dónde va cada pieza y qué lo decidió, sin tocar el patrón"
```

---

### Task 3: El latido de la simulación y las aristas que siempre se piden

**Files:**
- Modify: `src/utils/cloth/solverRuntimeTracker.ts`, `src/components/Viewport3D/GarmentSimulation.tsx`, `src/utils/cloth/fitMaps.ts`
- Test: `src/utils/cloth/__tests__/solverRuntimeTracker.test.ts`, `src/utils/cloth/__tests__/fitMaps.test.ts`

**Interfaces:**
- Produces: `latirLaSimulacion(edges: SolverEdgeData | null): void`, `latidosDeLaSimulacion(): number`, `aristasDeLaTela(): SolverEdgeData | null`; `DEFAULT_FIT_PARAMS: FabricFitParams` en `fitMaps.ts`; `shouldRequestEdgeData(edgeData, nowMs, lastRequestMs, intervalMs?)` sin el modo.

- [ ] **Step 1: Los tests (rojo)**

En `solverRuntimeTracker.test.ts`, importa `latirLaSimulacion`, `latidosDeLaSimulacion` y `aristasDeLaTela`, y añade:

```ts
describe('solverRuntimeTracker — el latido de la tela (IA 1b-2)', () => {
  it('cada latido cuenta un cuadro de tela nueva y deja a la vista las aristas del solver', () => {
    const antes = latidosDeLaSimulacion();
    const aristas = { stretchingIds: new Int32Array([0, 1]), stretchingLengths: new Float32Array([0.1]) };
    latirLaSimulacion(aristas);
    latirLaSimulacion(aristas);
    expect(latidosDeLaSimulacion()).toBe(antes + 2);
    expect(aristasDeLaTela()).toBe(aristas);
    latirLaSimulacion(null);
    expect(aristasDeLaTela()).toBeNull();
  });
});
```

En `fitMaps.test.ts`, el bloque `shouldRequestEdgeData (#1010)` pierde el primer argumento en todas las llamadas, y el primer test cambia de premisa:

```ts
  it('pide aunque el mapa de ajuste esté apagado: la superficie lo lee (fit_map, IA 1b-2)', () => {
    expect(shouldRequestEdgeData(null, 10_000, 0)).toBe(true);
  });
```

Los demás quedan así: `shouldRequestEdgeData(EDGE_DATA, 10_000, 0)` → false; `(null, 10_000, 0)` → true; `(EMPTY_EDGE_DATA, 10_000, 0)` → true; `(null, 10_300, 10_000)` → false; `(null, 11_000, 10_000)` → true.

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run src/utils/cloth/__tests__/solverRuntimeTracker.test.ts src/utils/cloth/__tests__/fitMaps.test.ts`
Expected: FAIL — `latirLaSimulacion is not a function`, y los casos de `shouldRequestEdgeData` con la firma vieja.

- [ ] **Step 3: El latido**

Al final de la sección «Geometría de la tela» de `solverRuntimeTracker.ts`:

```ts
// ─── El latido de la tela (IA 1b-2) ─────────────────────────────────────────

let latidos = 0;
let aristas: SolverEdgeData | null = null;

/**
 * Un cuadro en que la app dibujó tela nueva (el `useFrame` de
 * GarmentSimulation, pasadas sus compuertas). Lo cuenta la superficie para
 * saber si la simulación avanza: con Vina oculta el navegador no dibuja, y el
 * latido se para aunque un worker siga calculando. Lleva las aristas del
 * solver, que el mapa de ajuste por pieza necesita (`fit_map`).
 */
export function latirLaSimulacion(edges: SolverEdgeData | null): void {
  latidos += 1;
  aristas = edges;
}

export function latidosDeLaSimulacion(): number {
  return latidos;
}

export function aristasDeLaTela(): SolverEdgeData | null {
  return aristas;
}
```

con `import type { SolverEdgeData } from './fitMaps';` arriba.

- [ ] **Step 4: `shouldRequestEdgeData` sin el modo, y `DEFAULT_FIT_PARAMS` en su sitio**

En `fitMaps.ts`, la firma pasa a `shouldRequestEdgeData(edgeData, nowMs, lastRequestMs, intervalMs = 1000)` y se borra `if (fitMapMode === 'none') return false;`. El comentario de `@param fitMapMode` sale, y el de arriba añade: «Se pide haya o no mapa en pantalla: la superficie lo lee por pieza (`fit_map`)».

Mueve la constante de `GarmentSimulation.tsx:171-173` a `fitMaps.ts`, junto a `DEFAULT_FIT_MAP_CONFIG`:

```ts
/** Los parámetros de ajuste cuando la tela de la simulación no está en la biblioteca. */
export const DEFAULT_FIT_PARAMS: FabricFitParams = {
  maxStretchRatio: 0.08, weight: 150, thickness: 0.4, avgStretch: 0.025,
};
```

y en `GarmentSimulation.tsx` importa `DEFAULT_FIT_PARAMS` desde `../../utils/cloth/fitMaps` en lugar de definirla.

- [ ] **Step 5: El latido en los dos caminos del `useFrame`**

En `GarmentSimulation.tsx`:
1. Importa `latirLaSimulacion` junto a `registerClothGeometry`.
2. Declara, con los demás refs: `const ultimaTelaCopiadaRef = useRef<Float32Array | null>(null);`.
3. La llamada de la línea 580 queda `if (shouldRequestEdgeData(edgeDataRef.current, performance.now(), lastEdgeDataRequestRef.current)) {`.
4. En el camino TSL, justo después del bucle `for (let s = 0; s < substeps; s++) { renderer.compute(substepNodes); }`:

```ts
      // IA 1b-2: un cuadro de tela nueva (en TSL, render y sim van al mismo paso).
      latirLaSimulacion(edgeDataRef.current);
```

5. En el camino de readback (WASM/CPU/neural), dentro de `if (posAttr && posAttr.array.length === positions.length) { … }`, después de `computeBoundingSphere()`:

```ts
          // IA 1b-2: cada cuadro del worker llega en un array nuevo
          // (transferido, o copiado en el neural): solo ese cuenta como latido.
          if (positions !== ultimaTelaCopiadaRef.current) {
            ultimaTelaCopiadaRef.current = positions;
            latirLaSimulacion(edgeDataRef.current);
          }
```

- [ ] **Step 6: Verlos pasar, y la suite de la simulación**

Run: `npx vitest run src/utils/cloth src/components/Viewport3D`
Expected: PASS.

- [ ] **Step 7: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test > <scratchpad>/1b2-t3.log 2>&1; tail -8 <scratchpad>/1b2-t3.log
npm run lint:ui
git add src/utils/cloth/solverRuntimeTracker.ts src/utils/cloth/fitMaps.ts src/components/Viewport3D/GarmentSimulation.tsx src/utils/cloth/__tests__/solverRuntimeTracker.test.ts src/utils/cloth/__tests__/fitMaps.test.ts
git commit -m "feat(simulacion): el latido de la tela y las aristas que se piden mientras falten"
```

---

### Task 4: `fit_map`

**Files:**
- Create: `src/copilot/superficie/verbos/ajuste.ts`, `src/copilot/superficie/__tests__/ajuste.test.ts`

**Interfaces:**
- Consumes: `getClothGeometry`, `registerClothGeometry`, `aristasDeLaTela`, `latirLaSimulacion`, `getActiveSolverTier`, `setActiveSolverTier` (Task 3); `computePerVertexStrain`, `fabricToFitParams`, `DEFAULT_FIT_PARAMS`, `DEFAULT_FIT_MAP_CONFIG`; `getPhysicalFabric`; `unDecimal` (`costuras.ts`).
- Produces: `ajusteDeLaTela(ctx): Ajuste`; `VERBOS_DE_AJUSTE: readonly Verbo[]` (`fit_map`).

- [ ] **Step 1: Los tests (rojo)**

Crea `src/copilot/superficie/__tests__/ajuste.test.ts`:

```ts
import { afterEach, describe, it, expect } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import {
  clearActiveSolverTier, latirLaSimulacion, registerClothGeometry, setActiveSolverTier,
} from '../../../utils/cloth/solverRuntimeTracker';
import { ejecutarVerbo } from '../ejecutar';
import { VERBOS_DE_AJUSTE } from '../verbos/ajuste';
import type { ContextoDeVerbo } from '../tipos';
import { suelta, tienda } from './fixtures';

/**
 * Una tela de mentira: cada pieza son dos vértices unidos por una arista de
 * 0,1 m en reposo, estirada por su factor. El estiramiento por vértice es
 * ese factor (`computePerVertexStrain`).
 */
function tela(trozos: { pieceId: string; factor: number }[]) {
  const pos: number[] = [];
  const ids: number[] = [];
  trozos.forEach((t, i) => {
    pos.push(0, 0, 0, 0.1 * t.factor, 0, 0);
    ids.push(2 * i, 2 * i + 1);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  registerClothGeometry(geometry, trozos.map((t, i) => ({ pieceId: t.pieceId, vertexOffset: 2 * i, vertexCount: 2, triCount: 0 })));
  latirLaSimulacion({ stretchingIds: new Int32Array(ids), stretchingLengths: new Float32Array(trozos.map(() => 0.1)) });
}

const leer = async (ctx: ContextoDeVerbo) => {
  const r = await ejecutarVerbo(VERBOS_DE_AJUSTE, 'fit_map', {}, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Record<string, unknown>;
};

afterEach(() => {
  registerClothGeometry(null, []);
  latirLaSimulacion(null);
  clearActiveSolverTier();
});

describe('fit_map', () => {
  it('sin simulación no hay mapa, y dice qué hacer', async () => {
    const { ctx } = tienda([suelta('a')]);
    expect(await leer(ctx)).toMatchObject({ available: false, reason: expect.stringMatching(/simulate/) });
  });

  it('mide cada pieza por sus vértices, con la tela de la simulación', async () => {
    // Popelina: se rompe al 8 % (`maxStretchBeforeBreak: 8`). Al 20 % no se puede
    // poner (2,5 veces lo que aguanta); al 7 % está ajustada (0,875); sin estirar, bien.
    tela([{ pieceId: 'a', factor: 1.2 }, { pieceId: 'b', factor: 1.07 }, { pieceId: 'c', factor: 1 }]);
    setActiveSolverTier('webgpu');
    const { ctx } = tienda([suelta('a', 'Delantero'), suelta('b', 'Espalda'), suelta('c', 'Cuello')], [], {}, {}, { simulationState: 'running' });
    const r = await leer(ctx);
    expect(r).toMatchObject({ available: true, tier: 'webgpu', fabric: { id: 'cotton-poplin', max_stretch_pct: 8 } });
    expect(r.pieces).toEqual([
      { piece_id: 'a', name: 'Delantero', strain_max_pct: 20, strain_mean_pct: 20, tight_pct: 0, cant_wear_pct: 100 },
      { piece_id: 'b', name: 'Espalda', strain_max_pct: 7, strain_mean_pct: 7, tight_pct: 100, cant_wear_pct: 0 },
      { piece_id: 'c', name: 'Cuello', strain_max_pct: 0, strain_mean_pct: 0, tight_pct: 0, cant_wear_pct: 0 },
    ]);
    expect(r.garment).toMatchObject({ strain_max_pct: 20, tight_pct: 33.3, cant_wear_pct: 33.3 });
  });

  it('sin las aristas del solver, lo dice', async () => {
    tela([{ pieceId: 'a', factor: 1 }]);
    latirLaSimulacion(null);
    const { ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'paused' });
    expect(await leer(ctx)).toMatchObject({ available: false, reason: expect.stringMatching(/edge data/) });
  });
});
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/ajuste.test.ts`
Expected: FAIL — `Cannot find module '../verbos/ajuste'`.

- [ ] **Step 3: `fit_map`**

Crea `src/copilot/superficie/verbos/ajuste.ts`:

```ts
import { z } from 'zod';
import { definirVerbo, type ContextoDeVerbo, type Verbo } from '../tipos';
import { aristasDeLaTela, getActiveSolverTier, getClothGeometry } from '../../../utils/cloth/solverRuntimeTracker';
import {
  computePerVertexStrain, DEFAULT_FIT_MAP_CONFIG, DEFAULT_FIT_PARAMS, fabricToFitParams,
} from '../../../utils/cloth/fitMaps';
import { getPhysicalFabric } from '../../../utils/cloth/physicalFabric';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { unDecimal } from '../costuras';

interface Medida { strain_max_pct: number; strain_mean_pct: number; tight_pct: number; cant_wear_pct: number }

export type Ajuste =
  | { available: false; reason: string }
  | {
    available: true;
    tier: string;
    fabric: { id: string; max_stretch_pct: number };
    garment: Medida;
    pieces: Array<{ piece_id: string; name: string } & Medida>;
  };

/**
 * El mapa de ajuste por pieza, medido ahora sobre la tela que la app dibuja:
 * las mismas fórmulas que el mapa en pantalla (`fitMaps.ts`) y la misma tela
 * de la simulación. Cada pieza es su tramo de vértices en el manifiesto de la
 * malla. Sin el cuerpo, como hoy la app: cuenta la pieza entera.
 */
export function ajusteDeLaTela(ctx: ContextoDeVerbo): Ajuste {
  const { simulation, project } = ctx.getState();
  if (simulation.simulationState === 'idle') return { available: false, reason: 'there is no simulation: call simulate first' };
  const tela = getClothGeometry();
  const pos = tela?.geometry.getAttribute('position');
  if (!tela || !pos) return { available: false, reason: 'the cloth is not built yet; try again when the simulation has started' };
  const aristas = aristasDeLaTela();
  if (!aristas || aristas.stretchingIds.length === 0) {
    return { available: false, reason: 'the solver has not sent its edge data yet; try again in a moment' };
  }
  const fabric = getPhysicalFabric(simulation.defaultFabricId);
  const params = fabric ? fabricToFitParams(fabric) : DEFAULT_FIT_PARAMS;
  const aguanta = Math.max(params.maxStretchRatio, 0.001);
  const [ajustada, noSePone] = DEFAULT_FIT_MAP_CONFIG.fitThresholds;
  const estirado = computePerVertexStrain(pos.array as Float32Array, pos.count, aristas);
  const medir = (desde: number, cuantos: number): Medida => {
    let max = 1, suma = 0, justas = 0, rotas = 0;
    const hasta = Math.min(desde + cuantos, estirado.length);
    for (let i = desde; i < hasta; i++) {
      const s = estirado[i];
      if (s > max) max = s;
      suma += s;
      const fit = Math.max(0, s - 1) / aguanta;
      if (fit > noSePone) rotas++;
      else if (fit > ajustada) justas++;
    }
    const n = Math.max(hasta - desde, 1);
    return {
      strain_max_pct: unDecimal((max - 1) * 100),
      strain_mean_pct: unDecimal((suma / n - 1) * 100),
      tight_pct: unDecimal((justas / n) * 100),
      cant_wear_pct: unDecimal((rotas / n) * 100),
    };
  };
  const nombre = new Map(project.pieces.map(p => [p.id, p.name]));
  return {
    available: true,
    tier: getActiveSolverTier(),
    fabric: { id: simulation.defaultFabricId, max_stretch_pct: unDecimal(aguanta * 100) },
    garment: medir(0, pos.count),
    pieces: tela.manifest.map(m => ({ piece_id: m.pieceId, name: nombre.get(m.pieceId) ?? m.pieceId, ...medir(m.vertexOffset, m.vertexCount) })),
  };
}

const fitMap = definirVerbo({
  name: 'fit_map',
  description:
    "How the simulated garment fits, piece by piece, measured now on the cloth: strain (how much the fabric is stretched, in %), and the share of each piece that is tight or can't be worn (stretched past 80% or 100% of what its fabric takes before breaking). It counts the whole piece; contact with the body is not measured. Needs a simulation (simulate).",
  args: z.object({}),
  run: (_args, ctx) => ({ revision: revisionDelProyecto(), ...ajusteDeLaTela(ctx) }),
});

export const VERBOS_DE_AJUSTE: readonly Verbo[] = [fitMap];
```

- [ ] **Step 4: Verlos pasar**

Run: `npx vitest run src/copilot/superficie/__tests__/ajuste.test.ts`
Expected: PASS (3 tests). Si `unDecimal` redondea a un decimal, 33,33 sale 33,3 como espera el test.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test > <scratchpad>/1b2-t4.log 2>&1; tail -8 <scratchpad>/1b2-t4.log
git add src/copilot/superficie/verbos/ajuste.ts src/copilot/superficie/__tests__/ajuste.test.ts
git commit -m "feat(superficie): fit_map mide el ajuste pieza por pieza, sobre la tela que se dibuja"
```

---

### Task 5: `simulate`, y cuándo está quieta la tela

**Files:**
- Create: `src/copilot/superficie/asentamiento.ts`, `src/copilot/superficie/__tests__/asentamiento.test.ts`, `src/copilot/superficie/__tests__/simular.test.ts`
- Modify: `src/copilot/superficie/verbos/vestir.ts`

**Interfaces:**
- Consumes: `latidosDeLaSimulacion`, `getClothGeometry`, `getActiveSolverTier`, `getSolverEvents` (Task 3 y antes); `ajusteDeLaTela` (Task 4); `verElTres`, `sinCambios` (Task 2); `startSimulation`, `pauseSimulation`, `setViewMode3D`.
- Produces: `movimientoP95(antes, despues, cuadros): number` (mm por cuadro); `estaAsentada(movimientos, cuadros): boolean`; `UMBRAL_MM_POR_CUADRO = 0.02`, `SEGUIDAS = 3`, `MINIMO_DE_CUADROS = 180`, `CUADROS_POR_LECTURA = 30`; `VERBOS_DE_VESTIR = [dress, simulate]`.

- [ ] **Step 1: Los tests de la quietud (rojo)**

Crea `src/copilot/superficie/__tests__/asentamiento.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { estaAsentada, MINIMO_DE_CUADROS, movimientoP95, UMBRAL_MM_POR_CUADRO } from '../asentamiento';

/** 100 vértices en el origen, y los mismos movidos en x: los primeros `n` por `a` metros, el resto por `b`. */
function lecturas(n: number, a: number, b: number) {
  const antes = new Float32Array(300);
  const despues = new Float32Array(300);
  for (let i = 0; i < 100; i++) despues[3 * i] = i < n ? a : b;
  return { antes, despues };
}

describe('movimientoP95', () => {
  it('es el percentil 95 del desplazamiento, en mm por cuadro: los pocos que tiemblan no cuentan', () => {
    // 96 vértices se movieron 1 mm y 4 tiemblan 10 mm, en 10 cuadros.
    const { antes, despues } = lecturas(96, 0.001, 0.01);
    expect(movimientoP95(antes, despues, 10)).toBeCloseTo(0.1, 6);
  });

  it('con más de un 5 % moviéndose, sí cuenta', () => {
    const { antes, despues } = lecturas(90, 0.001, 0.01);
    expect(movimientoP95(antes, despues, 10)).toBeCloseTo(1, 6);
  });
});

describe('estaAsentada', () => {
  const quieta = UMBRAL_MM_POR_CUADRO / 2;
  it('tres lecturas seguidas bajo el umbral, pasados los cuadros mínimos', () => {
    expect(estaAsentada([1, quieta, quieta, quieta], MINIMO_DE_CUADROS)).toBe(true);
  });
  it('antes de los cuadros mínimos, no: la tela todavía no tocó el cuerpo', () => {
    expect(estaAsentada([quieta, quieta, quieta], MINIMO_DE_CUADROS - 1)).toBe(false);
  });
  it('una lectura que se mueve rompe la racha', () => {
    expect(estaAsentada([quieta, quieta, UMBRAL_MM_POR_CUADRO * 2, quieta, quieta], 1000)).toBe(false);
  });
});
```

- [ ] **Step 2: Verlos fallar, y la quietud**

Run: `npx vitest run src/copilot/superficie/__tests__/asentamiento.test.ts`
Expected: FAIL — `Cannot find module '../asentamiento'`.

Crea `src/copilot/superficie/asentamiento.ts`:

```ts
/**
 * Cuándo está quieta la tela (IA 1b-2). Medido el 09-10 con la camisa de
 * María en WebGPU: el percentil 95 del desplazamiento por cuadro baja de
 * 4,9 mm a ~0,01 mm hacia el cuadro 500, y ahí se queda entre 0,006 y 0,015;
 * el máximo nunca baja de 0,14, porque unos pocos vértices tiemblan siempre.
 * Plan `docs/superpowers/plans/2026-10-09-ia-superficie-1b2-ajuste.md`.
 */

/** Por debajo de esto por cuadro (percentil 95), la tela no se mueve: ~1,2 mm/s de simulación. */
export const UMBRAL_MM_POR_CUADRO = 0.02;
/** Lecturas seguidas bajo el umbral. */
export const SEGUIDAS = 3;
/** Antes no: a los 150 cuadros el tirante del cuerpo (TSL) recaptura la tela y cambia cómo cae. */
export const MINIMO_DE_CUADROS = 180;
/** Entre dos lecturas: en TSL la malla se relee del GPU cada 15 cuadros. */
export const CUADROS_POR_LECTURA = 30;

/** Cuánto se movió la tela entre dos lecturas: el percentil 95 de sus vértices, en mm por cuadro. */
export function movimientoP95(antes: Float32Array, despues: Float32Array, cuadros: number): number {
  const n = Math.floor(Math.min(antes.length, despues.length) / 3);
  if (n === 0 || cuadros <= 0) return 0;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = 3 * i;
    d[i] = Math.hypot(despues[k] - antes[k], despues[k + 1] - antes[k + 1], despues[k + 2] - antes[k + 2]);
  }
  d.sort();
  return (d[Math.min(n - 1, Math.floor(0.95 * n))] * 1000) / cuadros;
}

/** Quieta: pasados los cuadros mínimos, las últimas lecturas se mueven menos que el umbral. */
export function estaAsentada(movimientos: readonly number[], cuadros: number): boolean {
  if (cuadros < MINIMO_DE_CUADROS || movimientos.length < SEGUIDAS) return false;
  return movimientos.slice(-SEGUIDAS).every(m => m < UMBRAL_MM_POR_CUADRO);
}
```

Run: `npx vitest run src/copilot/superficie/__tests__/asentamiento.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Los tests de `simulate` (rojo)**

Crea `src/copilot/superficie/__tests__/simular.test.ts`:

```ts
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { pauseSimulation } from '../../../store/simulationSlice';
import { setViewMode } from '../../../store/editorSlice';
import {
  clearActiveSolverTier, clearSolverEvents, latirLaSimulacion, pushSolverEvent, registerClothGeometry, setActiveSolverTier,
} from '../../../utils/cloth/solverRuntimeTracker';
import { ejecutarVerbo } from '../ejecutar';
import { VERBOS_DE_VESTIR } from '../verbos/vestir';
import type { ContextoDeVerbo, Recibo } from '../tipos';
import { suelta, tienda } from './fixtures';

const ARISTAS = { stretchingIds: new Int32Array([0, 1]), stretchingLengths: new Float32Array([0.1]) };

/** Una tela de 20 vértices de una sola pieza; `mover` la desplaza en x. */
function tela() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(60), 3));
  registerClothGeometry(geometry, [{ pieceId: 'a', vertexOffset: 0, vertexCount: 20, triCount: 0 }]);
  const pos = geometry.getAttribute('position').array as Float32Array;
  return { mover: (m: number) => { for (let i = 0; i < 20; i++) pos[3 * i] += m; } };
}

/** El simulador de mentira: cada 250 ms dibuja `cuadros` cuadros y mueve la tela `mm(k)` en total. */
async function correr(pasos: number, cuadros: number, mm: (k: number) => number, mover: (m: number) => void, cada?: (k: number) => void) {
  for (let k = 0; k < pasos; k++) {
    cada?.(k);
    mover(mm(k) / 1000);
    for (let c = 0; c < cuadros; c++) latirLaSimulacion(ARISTAS);
    await vi.advanceTimersByTimeAsync(250);
  }
}

const simular = (ctx: ContextoDeVerbo, args: unknown) => ejecutarVerbo(VERBOS_DE_VESTIR, 'simulate', args, ctx);
const recibo = async (p: ReturnType<typeof simular>) => {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

beforeEach(() => { vi.useFakeTimers(); clearSolverEvents(); });
afterEach(() => {
  vi.useRealTimers();
  registerClothGeometry(null, []);
  clearActiveSolverTier();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('simulate', () => {
  it('arranca, y responde cuando la tela se queda quieta, con el ajuste', async () => {
    const { store, ctx } = tienda([suelta('a', 'Delantero', { category: 'bodice' })]);
    const { mover } = tela();
    setActiveSolverTier('webgpu');
    const p = simular(ctx, { action: 'start' });
    // 8 lecturas moviéndose 3 mm (0,1 mm por cuadro), luego quieta (0,003 mm por cuadro).
    await correr(16, 30, k => (k < 8 ? 3 : 0.1), mover);
    const r = await recibo(p);
    expect(r.done).toBe(true);
    expect(r.measure).toMatchObject({ state: 'running', tier: 'webgpu', settled: true });
    expect(r.measure.frames as number).toBeGreaterThanOrEqual(180);
    expect(r.measure.fit).toMatchObject({ available: true });
    expect(store.getState().simulation).toMatchObject({ simulationState: 'running', viewMode3D: 'simulate' });
  });

  it('con Vina oculta no espera el plazo: lo dice en segundos', async () => {
    const { ctx } = tienda([suelta('a')]);
    tela();
    setActiveSolverTier('webgpu');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const p = simular(ctx, { action: 'start' });
    await vi.advanceTimersByTimeAsync(3_000);
    const r = await recibo(p);
    expect(r.done).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/hidden.*front/i);
  });

  it('si la tela deja de llegar sin estar oculta, también lo dice', async () => {
    const { ctx } = tienda([suelta('a')]);
    const { mover } = tela();
    setActiveSolverTier('wasm');
    const p = simular(ctx, { action: 'start' });
    await correr(4, 30, () => 3, mover);
    await vi.advanceTimersByTimeAsync(11_000);
    const r = await recibo(p);
    expect(r.done).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/stopped advancing.*10 s/);
  });

  it('si no llega ningún cuadro, dice que no arrancó y lo que dijo el solver', async () => {
    const { ctx } = tienda([suelta('a')]);
    pushSolverEvent('start:failed', { tier: 'webgpu', reason: 'adapter is null' });
    const p = simular(ctx, { action: 'start' });
    await vi.advanceTimersByTimeAsync(31_000);
    const r = await recibo(p);
    expect(r.done).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/did not start within 30 s.*adapter is null/);
  });

  it('pasado el plazo sin quietud, lo dice con el tier y el ritmo', async () => {
    const { ctx } = tienda([suelta('a')]);
    const { mover } = tela();
    setActiveSolverTier('wasm');
    const p = simular(ctx, { action: 'start', wait_seconds: 5 });
    await correr(24, 30, () => 3, mover);
    const r = await recibo(p);
    expect(r.done).toBe(false);
    expect(r.measure).toMatchObject({ settled: false, tier: 'wasm' });
    expect(r.warnings.join(' ')).toMatch(/did not settle within 5 s.*wasm.*frames per second.*0\.1 mm per frame/);
  });

  it('si María la para mientras espera, lo dice', async () => {
    const { store, ctx } = tienda([suelta('a')]);
    const { mover } = tela();
    setActiveSolverTier('webgpu');
    const p = simular(ctx, { action: 'start' });
    await correr(4, 30, () => 3, mover, k => { if (k === 3) store.dispatch(pauseSimulation()); });
    const r = await recibo(p);
    expect(r.done).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/stopped while waiting/);
  });

  it('sin esperar, responde al arrancar', async () => {
    const { store, ctx } = tienda([suelta('a')]);
    const r = await recibo(simular(ctx, { action: 'start', wait: false }));
    expect(r.done).toBe(true);
    expect(store.getState().simulation.simulationState).toBe('running');
  });

  it('desde 2D pasa a Split', async () => {
    const { store, ctx } = tienda([suelta('a')]);
    store.dispatch(setViewMode('2d'));
    const r = await recibo(simular(ctx, { action: 'start', wait: false }));
    expect(store.getState().editor.viewMode).toBe('split');
    expect(r.measure).toMatchObject({ view_changed: true });
  });

  it('stop la pausa', async () => {
    const { store, ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'running' });
    const r = await recibo(simular(ctx, { action: 'stop' }));
    expect(r).toMatchObject({ done: true, measure: { state: 'paused' } });
    expect(store.getState().simulation.simulationState).toBe('paused');
  });

  it('sin piezas activas no arranca', async () => {
    const { ctx } = tienda([suelta('a', 'a', { active: false })]);
    const r = await recibo(simular(ctx, { action: 'start' }));
    expect(r).toMatchObject({ done: false, warnings: ['there are no active pieces to simulate'] });
  });
});
```

- [ ] **Step 4: Verlos fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/simular.test.ts`
Expected: FAIL — `unknown verb: simulate`.

- [ ] **Step 5: `simulate`**

En `vestir.ts` añade los imports:

```ts
import { pauseSimulation, startSimulation } from '../../../store/simulationSlice';
import {
  getActiveSolverTier, getClothGeometry, getSolverEvents, latidosDeLaSimulacion,
} from '../../../utils/cloth/solverRuntimeTracker';
import { CUADROS_POR_LECTURA, estaAsentada, movimientoP95, UMBRAL_MM_POR_CUADRO } from '../asentamiento';
import { ajusteDeLaTela } from './ajuste';
import { unDecimal } from '../costuras';
```

(`setViewMode3D` y `resetSimulation` ya están), y antes de `VERBOS_DE_VESTIR`:

```ts
const PAUSA_MS = 250;
/** La pestaña oculta tanto tiempo: el navegador no dibuja, y la tela no avanza. */
const OCULTA_MS = 2_000;
/** Sin un cuadro nuevo tanto tiempo, con la pestaña a la vista: el WASM da uno cada 1-2 s. */
const SIN_CUADROS_MS = 10_000;
/** El primer cuadro: la cascada de tiers tarda hasta 12-15 s por tier en arrancar. */
const ARRANQUE_MS = 30_000;

const dormir = (ms: number) => new Promise<void>(r => { setTimeout(r, ms); });
const oculta = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

const OCULTA =
  "Vina is hidden (its tab is in the background, or the window is minimized or covered), so the browser does not draw it and the simulation does not advance. Ask the user to bring Vina to the front, then call simulate again.";

/** Lo último que dijo el solver al fallar, si dijo algo. */
function loQueDijoElSolver(): string {
  const e = [...getSolverEvents()].reverse().find(x => x.kind === 'start:failed' || x.kind === 'tier:failed');
  return e ? `${e.kind}: ${JSON.stringify(e.data)}` : 'no solver reported an error';
}

interface Espera { settled: boolean; warnings: string[]; frames: number; seconds: number; speed: number | null }

/**
 * Espera a que la tela se quede quieta mirando el latido (`latidosDeLaSimulacion`)
 * y la malla que la app dibuja. No espera de balde: si Vina no se ve, si la
 * tela deja de llegar o si nunca arrancó, lo dice (decisión 2 del plan).
 */
async function esperarQuieta(ctx: ContextoDeVerbo, plazoS: number): Promise<Espera> {
  const t0 = Date.now();
  const desde = latidosDeLaSimulacion();
  const movimientos: number[] = [];
  let previa: { latidos: number; pos: Float32Array } | null = null;
  let ultimo = desde;
  let ultimoCambio = t0;
  let ocultaDesde: number | null = null;
  for (;;) {
    await dormir(PAUSA_MS);
    const ahora = Date.now();
    const latidos = latidosDeLaSimulacion();
    const frames = latidos - desde;
    const seconds = unDecimal((ahora - t0) / 1000);
    const speed = movimientos.length ? Math.round(movimientos[movimientos.length - 1] * 1e4) / 1e4 : null;
    const fin = (settled: boolean, warnings: string[] = []): Espera => ({ settled, warnings, frames, seconds, speed });

    if (ctx.getState().simulation.simulationState !== 'running') return fin(false, ['the simulation was stopped while waiting']);
    if (latidos !== ultimo) { ultimo = latidos; ultimoCambio = ahora; }
    ocultaDesde = oculta() ? (ocultaDesde ?? ahora) : null;
    if (ocultaDesde !== null && ahora - ocultaDesde >= OCULTA_MS) return fin(false, [OCULTA]);
    if (frames === 0 && ahora - t0 >= ARRANQUE_MS) {
      return fin(false, [`the simulation did not start within ${ARRANQUE_MS / 1000} s (${loQueDijoElSolver()})`]);
    }
    if (frames > 0 && ahora - ultimoCambio >= SIN_CUADROS_MS) {
      return fin(false, [`the simulation stopped advancing: no new frame of cloth in ${SIN_CUADROS_MS / 1000} s. Vina may be hidden or covered by another window: ask the user to bring it to the front, then call simulate again.`]);
    }

    const malla = getClothGeometry()?.geometry.getAttribute('position');
    if (malla && (!previa || latidos - previa.latidos >= CUADROS_POR_LECTURA)) {
      const pos = (malla.array as Float32Array).slice();
      if (previa && previa.pos.length === pos.length) movimientos.push(movimientoP95(previa.pos, pos, latidos - previa.latidos));
      previa = { latidos, pos };
    }
    if (estaAsentada(movimientos, frames)) return fin(true);
    if ((ahora - t0) / 1000 >= plazoS) {
      const porSegundo = unDecimal(frames / Math.max((ahora - t0) / 1000, 0.001));
      const aun = speed === null ? 'how much it still moves is not measured yet' : `the cloth still moves ${speed} mm per frame`;
      return fin(false, [
        `did not settle within ${plazoS} s: ${frames} frames on the ${getActiveSolverTier()} tier (${porSegundo} frames per second); ${aun} (it counts as settled under ${UMBRAL_MM_POR_CUADRO})`,
      ]);
    }
  }
}

const simulate = definirVerbo({
  name: 'simulate',
  description:
    "Start or stop the cloth simulation on the avatar, in the 3D view (from 2D the view switches to Split). start drapes from the dressed pose; stop pauses it and the cloth stays where it is. With wait (default), it answers when the cloth settles, with the fit map, or after wait_seconds with done: false and why. The simulation runs in the user's browser and only advances while Vina is visible on screen.",
  args: z.object({
    action: z.enum(['start', 'stop']),
    wait: z.boolean().default(true),
    wait_seconds: z.number().int().min(1).max(110).default(60).describe('how long to wait for the cloth to settle; default 60'),
  }),
  run: async ({ action, wait, wait_seconds }, ctx) => {
    const before = revisionDelProyecto();
    const recibo = (done: boolean, measure: Recibo['measure'], warnings: string[] = []): Recibo => ({
      done, changed: sinCambios(), measure, warnings, revision: { before, after: revisionDelProyecto() },
    });
    const { project, simulation } = ctx.getState();
    if (action === 'stop') {
      if (simulation.simulationState === 'running') ctx.dispatch(pauseSimulation());
      const state = ctx.getState().simulation.simulationState;
      return recibo(state !== 'running', { state });
    }
    if (!project.pieces.some(p => p.active)) return rehusar('there are no active pieces to simulate');
    if (!simulation.showGarment) return rehusar('the garment is hidden in the 3D view; the user can show it again there');
    const view_changed = verElTres(ctx);
    ctx.dispatch(setViewMode3D('simulate'));
    if (simulation.simulationState !== 'running') ctx.dispatch(startSimulation());
    if (!wait) {
      return recibo(ctx.getState().simulation.simulationState === 'running', { state: 'running', tier: getActiveSolverTier(), view_changed });
    }
    const e = await esperarQuieta(ctx, wait_seconds);
    return recibo(e.settled, {
      state: ctx.getState().simulation.simulationState,
      tier: getActiveSolverTier(),
      settled: e.settled,
      seconds: e.seconds,
      frames: e.frames,
      speed_mm_per_frame: e.speed,
      view_changed,
      ...(e.settled ? { fit: ajusteDeLaTela(ctx) } : {}),
    }, e.warnings);
  },
});
```

y la lista pasa a `export const VERBOS_DE_VESTIR: readonly Verbo[] = [dress, simulate];`.

- [ ] **Step 6: Verlos pasar**

Run: `npx vitest run src/copilot/superficie/__tests__/simular.test.ts src/copilot/superficie/__tests__/vestir.test.ts src/copilot/superficie/__tests__/asentamiento.test.ts`
Expected: PASS. Si `vi.advanceTimersByTimeAsync` no deja correr el `await` del verbo entre lecturas, el arreglo va en el test (un `await Promise.resolve()` más en `correr`), nunca en el umbral.

- [ ] **Step 7: Mutar las guardas**

Una a una, con Edit, y mira caer su test:
- `OCULTA_MS = 2_000` → `60_000` → cae «con Vina oculta…».
- `SIN_CUADROS_MS = 10_000` → `600_000` → cae «si la tela deja de llegar…».
- `movimientos.slice(-SEGUIDAS)` → `movimientos.slice(-1)` → cae «una lectura que se mueve rompe la racha».
- `cuadros < MINIMO_DE_CUADROS` → `false` → cae «antes de los cuadros mínimos…».

- [ ] **Step 8: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test > <scratchpad>/1b2-t5.log 2>&1; tail -8 <scratchpad>/1b2-t5.log
git add src/copilot/superficie/asentamiento.ts src/copilot/superficie/verbos/vestir.ts src/copilot/superficie/__tests__/asentamiento.test.ts src/copilot/superficie/__tests__/simular.test.ts
git commit -m "feat(superficie): simulate espera a que la tela se quede quieta, y dice por qué cuando no puede"
```

---

### Task 6: Los cinco en la superficie, las instrucciones, la camisa de María y la nota de la spec

**Files:**
- Modify: `src/copilot/superficie/index.ts`, `src/copilot/superficie/instrucciones.ts`, `src/copilot/superficie/__tests__/ciclo.maria.test.ts`, `mcp/superficie.json`, `docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md` (§ 5.7)

**Interfaces:**
- Consumes: `VERBOS_DE_PRENDA`, `VERBOS_DE_VESTIR`, `VERBOS_DE_AJUSTE`.
- Produces: `SUPERFICIE` con 17 verbos.

- [ ] **Step 1: Medir lo que da la camisa al vestirla**

Antes de escribir el test, una sonda de una sola vez (`npx vitest run` de un archivo temporal en el scratchpad, o un `it.only` que se borra): `camisaDeMaria()` → `dress` → imprime `measure.pieces`. Anota en el ledger qué piezas salen con región y cuáles no. El test del Step 2 no depende de eso: clasifica lo que no tenga región y vuelve a vestir.

- [ ] **Step 2: El ciclo (rojo)**

En `ciclo.maria.test.ts`, importa `VERBOS_DE_PRENDA` y `VERBOS_DE_VESTIR` para nada: el ciclo va por `SUPERFICIE`. Cambia el test de la lista y añade el de vestir:

```ts
  it('vestir la camisa: lo que Vina no sabe ubicar se clasifica, y entonces se viste entera', async () => {
    const { piezas, seams } = camisaDeMaria();
    const { ctx } = tienda(piezas, seams);
    type Pieza = { piece_id: string; region: string | null };
    const r1 = await actuarCon(ctx, 'dress', {});
    // En la camisa, lo que el clasificador geométrico no ubique solo puede ser la tira del cuello.
    for (const p of (r1.measure.pieces as Pieza[]).filter(x => x.region === null)) {
      await actuarCon(ctx, 'classify', { piece_id: p.piece_id, category: 'collar' });
    }
    const r2 = await actuarCon(ctx, 'dress', {});
    expect(r2.done).toBe(true);
    expect((r2.measure.pieces as Pieza[]).map(p => p.region).sort()).toEqual(
      ['back-torso', 'collar', 'front-torso', 'left-sleeve', 'right-sleeve'],
    );
  });

  it('la superficie tiene los diecisiete verbos', () => {
    expect(SUPERFICIE.map(v => v.name)).toEqual([
      'read_pattern', 'read_piece', 'measure', 'walk_seam', 'verify', 'fit_map',
      'create_piece', 'edit_outline', 'sew', 'unsew', 'notch', 'remove', 'undo',
      'classify', 'assign_fabric', 'dress', 'simulate',
    ]);
  });
```

(Si el Step 1 mostró una pieza sin región que NO es el cuello, el test se queda y el comentario se corrige con lo medido: es la verdad de la camisa, no un supuesto.)

Run: `npx vitest run src/copilot/superficie/__tests__/ciclo.maria.test.ts`
Expected: FAIL — `unknown verb: dress` y la lista de 12.

- [ ] **Step 3: Registrarlos**

En `index.ts`:

```ts
import { VERBOS_DE_AJUSTE } from './verbos/ajuste';
import { VERBOS_DE_PRENDA } from './verbos/prenda';
import { VERBOS_DE_VESTIR } from './verbos/vestir';

/**
 * …1a leer y medir; 1b, primera mitad, las manos; segunda mitad, parte A, el
 * ciclo del ajuste (clasificar, tela, vestir, simular y el mapa de ajuste).
 */
export const SUPERFICIE: readonly Verbo[] = [
  ...VERBOS_DE_LEER, ...VERBOS_DE_MEDIR, ...VERBOS_DE_AJUSTE,
  ...VERBOS_DE_PIEZA, ...VERBOS_DE_COSTURA, ...VERBOS_DE_PIQUETE, ...VERBOS_DE_BORRAR,
  ...VERBOS_DE_PRENDA, ...VERBOS_DE_VESTIR,
];
```

- [ ] **Step 4: Las instrucciones**

En `instrucciones.ts`, la línea del candado y una nueva antes de la del español:

```ts
  'A locked piece keeps its shape: the tools that would change its outline or internal lines, or remove it, answer done: false.',
  "The simulation runs in the user's browser and only advances while Vina is visible on screen. simulate waits for the cloth to settle and says why when it cannot; fit_map reads the result piece by piece.",
```

- [ ] **Step 5: La superficie horneada y los trinquetes**

```bash
MCP_SUPERFICIE_UPDATE=1 npx vitest run src/copilot/superficie/__tests__/horneado.test.ts
npx vitest run src/copilot/superficie tests/repo/la-superficie-es-corta.test.ts tests/mcp
```

Expected: PASS (17 verbos de 24; las definiciones por debajo de 30.000 caracteres). Anota en el ledger cuántos caracteres miden ahora.

- [ ] **Step 6: La nota de la spec**

Añade al final de § 5.7 la «Nota del plan de la entrega 1b, segunda mitad, parte A (2026-10-09)»: el plan, las decisiones 1-15 en una línea cada una, lo medido con las dos sondas, lo que dio la camisa al vestirla (Step 1) y los caracteres de las definiciones (Step 5).

- [ ] **Step 7: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test > <scratchpad>/1b2-t6.log 2>&1; tail -8 <scratchpad>/1b2-t6.log
npm run lint > <scratchpad>/1b2-t6-lint.log 2>&1; tail -3 <scratchpad>/1b2-t6-lint.log
npm run lint:ui
git add src/copilot/superficie/index.ts src/copilot/superficie/instrucciones.ts src/copilot/superficie/__tests__/ciclo.maria.test.ts mcp/superficie.json docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md
git commit -m "feat(superficie): el ciclo del ajuste en la superficie, probado con la camisa de María"
```

---

### Task 7: El ciclo por el puente, en un navegador de verdad

**Files:**
- Create: `tests/e2e/ia-ciclo-del-ajuste.spec.ts`
- Modify: `scripts/deploy-prod.sh` (la lista del gate)

**Interfaces:**
- Consumes: el puente (`mcp/bin/vina-mcp.mjs`), `abrirAppVacia`, `cargarDxfDeMaria` (`tests/e2e/helpers/estados.ts`).

- [ ] **Step 1: El e2e**

Crea `tests/e2e/ia-ciclo-del-ajuste.spec.ts` sobre la misma mecánica de `puente-mcp.spec.ts` (el test hace de agente por el stdio de `vina-mcp`), con el puerto 18463 para no chocar con aquel:

```ts
import { test, expect } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { abrirAppVacia, cargarDxfDeMaria } from './helpers/estados';

/**
 * El ciclo del ajuste por el puente MCP (plan 2026-10-09-ia-superficie-1b2-ajuste):
 * el test hace de agente. Viste la camisa de María, simula y lee el ajuste
 * pieza por pieza. Con SwiftShader no hay WebGPU: corre el tier WASM, que tarda
 * en arrancar, da un cuadro cada uno o dos segundos y no se asienta en 45 s. El
 * recibo tiene que decirlo, y fit_map medir igual.
 */
test.describe.configure({ timeout: process.env.CI ? 300_000 : 180_000 });
test.use({ viewport: { width: 1366, height: 643 } });

const PUERTO = 18463;

type Respuesta = { result?: { content?: Array<{ text: string }>; isError?: boolean } };

function agente(proc: ChildProcessWithoutNullStreams) {
  let id = 0;
  const esperando = new Map<number, (r: Respuesta) => void>();
  createInterface({ input: proc.stdout }).on('line', (l) => {
    const m = JSON.parse(l) as Respuesta & { id?: number };
    if (m.id !== undefined) esperando.get(m.id)?.(m);
  });
  const pedir = (method: string, params: unknown = {}) => {
    const mio = ++id;
    return new Promise<Respuesta>((ok) => {
      esperando.set(mio, ok);
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mio, method, params }) + '\n');
    });
  };
  return {
    pedir,
    avisar: (method: string) => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'),
    async llamar(name: string, args: unknown) {
      const r = await pedir('tools/call', { name, arguments: args });
      expect(r.result?.isError, JSON.stringify(r.result)).toBeFalsy();
      return JSON.parse(r.result!.content![0].text).result as Record<string, unknown> & { done?: boolean; measure?: Record<string, unknown>; warnings?: string[] };
    },
  };
}

test('tu agente viste la camisa, la simula y lee el ajuste de cada pieza', async ({ page }) => {
  const proc = spawn(process.execPath, ['mcp/bin/vina-mcp.mjs'], { env: { ...process.env, VINA_MCP_PORT: String(PUERTO), VINA_MCP_ALLOW_LOCAL: '1' } });
  try {
    const yo = agente(proc);
    await yo.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: 'e2e' } });
    yo.avisar('notifications/initialized');

    await page.addInitScript((p) => localStorage.setItem('vina-puente-puerto', String(p)), PUERTO);
    await abrirAppVacia(page);
    await cargarDxfDeMaria(page);
    await page.getByRole('button', { name: 'Tu agente', exact: true }).click();
    await page.locator('.hoja-del-agente').getByRole('button', { name: 'Conectar', exact: true }).click();
    await expect(page.locator('.hoja-del-agente')).toContainText('Conectado a Claude Code');

    const vestido = await yo.llamar('dress', {});
    expect(vestido.measure!.pieces).toHaveLength(5);
    expect(vestido.measure).toMatchObject({ view: 'split', view_changed: true });

    const simulada = await yo.llamar('simulate', { action: 'start', wait_seconds: 45 });
    expect(simulada.measure).toMatchObject({ state: 'running' });
    expect(simulada.measure!.frames as number).toBeGreaterThan(0);
    expect(simulada.measure!.tier).not.toBe('none');
    if (!simulada.done) expect(simulada.warnings!.join(' ')).toMatch(/did not settle within 45 s/);

    const ajuste = await yo.llamar('fit_map', {});
    expect(ajuste.available).toBe(true);
    const piezas = ajuste.pieces as Array<{ strain_max_pct: number }>;
    expect(piezas).toHaveLength(5);
    for (const p of piezas) expect(Number.isFinite(p.strain_max_pct) && p.strain_max_pct >= 0).toBe(true);

    const parada = await yo.llamar('simulate', { action: 'stop' });
    expect(parada).toMatchObject({ done: true, measure: { state: 'paused' } });
  } finally {
    proc.kill();
  }
});
```

- [ ] **Step 2: Correrlo** (avisando antes a la sesión vina-ed)

Run: `VINA_E2E_PORT=5179 npx playwright test tests/e2e/ia-ciclo-del-ajuste.spec.ts tests/e2e/puente-mcp.spec.ts --workers=1 --retries=0`
Expected: PASS (2 tests). Anota en el ledger el tier, los cuadros y los segundos que dio `simulate`.

- [ ] **Step 3: La sonda en WebGPU, con el verbo de verdad**

Con Vite en el 5179 y un Chromium con ventana y WebGPU (como `scratchpad/sonda-asentamiento.mjs`), conecta un agente por el puente (o llama `ejecutarVerbo` desde `page.evaluate` si el módulo está a mano en el dev server) y corre `dress` + `simulate` con la camisa cosida. Expected: `done: true` y `settled: true` antes de 60 s, con el ajuste de las 5 piezas. Anota los números en la nota de la spec.

- [ ] **Step 4: El gate del deploy**

En `scripts/deploy-prod.sh`, añade `tests/e2e/ia-ciclo-del-ajuste.spec.ts \` justo después de `tests/e2e/puente-mcp.spec.ts \`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/ia-ciclo-del-ajuste.spec.ts scripts/deploy-prod.sh
git commit -m "test(e2e): el ciclo del ajuste por el puente, y entra en el gate del deploy"
```

---

## Después del plan

1. Revisión final de la rama entera con un subagente Opus («revisa sin escribir en git ni desplegar»), con el foco de arriba y las mutaciones de cada guarda (`OCULTA_MS`, `SIN_CUADROS_MS`, `ARRANQUE_MS`, `SEGUIDAS`, `MINIMO_DE_CUADROS`, `quienNombraSusBordes`, la tela de la simulación).
2. Ensayo del deploy (`bash scripts/deploy-prod.sh --ensayo`) antes de pedir el merge, avisando antes a la sesión vina-ed por la carga de la máquina. Si Claude Code lo corta por memoria, no se relanza solo.
3. Push, PR, merge y deploy esperan la orden de Samuel.
4. La parte B (`dart`, `seam_allowance`, `grade`, `export`) tiene su propio plan.
