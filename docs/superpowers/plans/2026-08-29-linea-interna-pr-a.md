# Línea interna única (PR A) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** una sola herramienta "Línea interna" (`internalShape`, `G`) con enganche a vértices/extremos/contorno, terminar abierta, anfitriona por primer press, tipos de punto mixtos (recta / curva por puntos / bezier), y la muerte de `line` y `polyPen`. Cierra #205, #206, #209 y la mitad visible de #193.

**Architecture:** el motor es `usePolyPenTool` reescrito sobre una geometría pura nueva (`polyPenGeometry.ts`) que también pinta el overlay; el enganche resuelve contra memos por identidad de `pieces` (`extractNodes` / anillos pre-aplanados de `outlineRing`); las teclas del trazo viven en la coordinación de captura CF-1 de `useEditorInteractions`; la anfitriona la fija el primer press por `pointInPolygon` en el orden de dibujo de `PieceRenderer`.

**Tech Stack:** React 18, Redux Toolkit, SVG, vitest + @testing-library/react (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-linea-interna-y-medidas-design.md` (v2). Este plan implementa § 3, § 4, § 8, § 9 y la columna "PR A" de § 13.

## Global Constraints

- Solo Claude (sin codex ni reasonix para código). TDD estricto: test rojo → implementación mínima → verde → gate → commit.
- Gate por tarea: `npx tsc -b --noEmit && npx vitest run <archivos de la tarea> && npx eslint <archivos tocados> --max-warnings=0`. Gate completo antes del PR: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`.
- Contrato de interfaz: ningún color literal en `.tsx`/`.css` nuevos (R3), todo `:hover` con `:focus-visible` (R5), nada de `z-index` literal, español del glosario (`docs/specs/2026-07-16-ui-copy-es-glosario.md`).
- Radio único de enganche: `EDGE_HIT_PX` (12) de `gestureConstants.ts`. Umbral de arrastre `DRAG_THRESHOLD_PX` (4) vía `isDrag()`.
- El id `internalShape` no cambia. `line` y `polyPen` desaparecen del árbol.
- IDs con `newId()`. Sin `--no-verify`.
- Rama: `feat/lineas-internas-y-medidas` (ya creada, con el spec commiteado).

---

### Task 1: `polyPenGeometry.ts` — nodos → comandos, una sola vez

**Files:**
- Create: `src/components/PatternEditor/polyPenGeometry.ts`
- Test: `src/components/PatternEditor/__tests__/polyPenGeometry.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PolyPenNodeType = 'straight' | 'curvePoints' | 'bezier';
  export interface PolyPenNode {
    point: Point2D;                 // mundo (patrón)
    type: PolyPenNodeType;
    handleIn?: Point2D;             // solo bezier
    handleOut?: Point2D;            // solo bezier
  }
  export function nodesToCommands(nodes: PolyPenNode[], closed: boolean): PathCommand[];
  export function commandsToPathD(cmds: PathCommand[]): string;
  ```
- Reglas (spec § 4.5): cada tramo toma en cada extremo el manejador que su nodo aporta; bloque = corrida maximal de `curvePoints`, anclas `[vecino anterior, …bloque, vecino siguiente]`, manejadores por `chainHandles(anclas, false)` de `src/utils/geometry/catmullRom.ts`; recta–recta → `L`; si alguno aporta → `C` (el que no aporta pone su ancla como control); cadenas abiertas; al cerrar, el tramo último→primero es un tramo más, `C`+`Z` si alguno aporta, `Z` si ninguno; con < 2 nodos → `[]`.

- [ ] **Step 1: escribir el test rojo** en `__tests__/polyPenGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nodesToCommands, commandsToPathD, type PolyPenNode } from '../polyPenGeometry';
import { chainHandles } from '../../../utils/geometry/catmullRom';

const P = (x: number, y: number) => ({ x, y });
const straight = (x: number, y: number): PolyPenNode => ({ point: P(x, y), type: 'straight' });
const curve = (x: number, y: number): PolyPenNode => ({ point: P(x, y), type: 'curvePoints' });
const bezier = (x: number, y: number, out: [number, number]): PolyPenNode => ({
  point: P(x, y), type: 'bezier',
  handleOut: P(out[0], out[1]), handleIn: P(2 * x - out[0], 2 * y - out[1]),
});

describe('nodesToCommands', () => {
  it('con menos de dos nodos no hay path', () => {
    expect(nodesToCommands([], false)).toEqual([]);
    expect(nodesToCommands([straight(0, 0)], false)).toEqual([]);
  });

  it('recta-recta es M L', () => {
    expect(nodesToCommands([straight(0, 0), straight(10, 0)], false)).toEqual([
      { type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] },
    ]);
  });

  it('recta-curva-curva-recta da M C C C con los manejadores de Catmull-Rom', () => {
    const nodes = [straight(0, 0), curve(10, 10), curve(20, 10), straight(30, 0)];
    const cmds = nodesToCommands(nodes, false);
    expect(cmds.map(c => c.type)).toEqual(['M', 'C', 'C', 'C']);
    const handles = chainHandles([P(0, 0), P(10, 10), P(20, 10), P(30, 0)], false);
    for (let k = 0; k < 3; k++) {
      const [cp1, cp2] = handles[k];
      expect(cmds[k + 1].values.slice(0, 4)).toEqual([cp1.x, cp1.y, cp2.x, cp2.y]);
    }
    expect(cmds[3].values.slice(4)).toEqual([30, 0]);
  });

  it('un bezier aporta su manejador y el nodo recto vecino pone su ancla', () => {
    const cmds = nodesToCommands([bezier(0, 0, [5, 5]), straight(10, 0)], false);
    expect(cmds[1]).toEqual({ type: 'C', values: [5, 5, 10, 0, 10, 0] });
  });

  it('bezier junto a un bloque de curva: cada extremo aporta lo suyo', () => {
    const nodes = [bezier(0, 0, [5, 5]), curve(10, 10), straight(20, 0)];
    const cmds = nodesToCommands(nodes, false);
    const handles = chainHandles([P(0, 0), P(10, 10), P(20, 0)], false);
    // tramo 0→1: cp1 del bezier, cp2 de Catmull-Rom
    expect(cmds[1].values.slice(0, 2)).toEqual([5, 5]);
    expect(cmds[1].values.slice(2, 4)).toEqual([handles[0][1].x, handles[0][1].y]);
    // tramo 1→2: cp1 de Catmull-Rom, cp2 = ancla del recto
    expect(cmds[2].values.slice(0, 2)).toEqual([handles[1][0].x, handles[1][0].y]);
    expect(cmds[2].values.slice(2, 4)).toEqual([20, 0]);
  });

  it('cerrar con rectas emite Z pelado', () => {
    const cmds = nodesToCommands([straight(0, 0), straight(10, 0), straight(10, 10)], true);
    expect(cmds.map(c => c.type)).toEqual(['M', 'L', 'L', 'Z']);
  });

  it('cerrar con un bezier en el primer nodo emite C de vuelta y luego Z', () => {
    const cmds = nodesToCommands([bezier(0, 0, [5, -5]), straight(10, 0), straight(10, 10)], true);
    expect(cmds.map(c => c.type)).toEqual(['M', 'C', 'L', 'C', 'Z']);
    // el tramo de cierre entra con el ancla del recto y sale por handleIn del bezier
    expect(cmds[3].values).toEqual([10, 10, -5, 5, 0, 0]);
  });

  it('las cadenas son abiertas: un bloque de curva no cruza el cierre', () => {
    const nodes = [curve(0, 0), straight(10, 0), straight(10, 10), curve(0, 10)];
    const cmds = nodesToCommands(nodes, true);
    expect(cmds.map(c => c.type)).toEqual(['M', 'C', 'L', 'C', 'C', 'Z']);
    // bloque A = [phantom, n0, n1]; bloque B = [n2, n3, n0]: se calculan aparte
    const a = chainHandles([P(0, 0), P(10, 0)], false);
    const b = chainHandles([P(10, 10), P(0, 10), P(0, 0)], false);
    expect(cmds[1].values.slice(0, 4)).toEqual([a[0][0].x, a[0][0].y, a[0][1].x, a[0][1].y]);
    expect(cmds[3].values.slice(0, 4)).toEqual([b[0][0].x, b[0][0].y, b[0][1].x, b[0][1].y]);
    expect(cmds[4].values.slice(0, 4)).toEqual([b[1][0].x, b[1][0].y, b[1][1].x, b[1][1].y]);
  });
});

describe('commandsToPathD', () => {
  it('serializa como el resto del editor', () => {
    expect(commandsToPathD([{ type: 'M', values: [1, 2] }, { type: 'L', values: [3, 4] }, { type: 'Z', values: [] }]))
      .toBe('M1,2 L3,4 Z');
  });
});
```

- [ ] **Step 2:** `npx vitest run src/components/PatternEditor/__tests__/polyPenGeometry.test.ts` → falla: módulo no existe.
- [ ] **Step 3:** implementar `polyPenGeometry.ts`:

```ts
import type { PathCommand, Point2D } from '../../types/types';
import { chainHandles } from '../../utils/geometry/catmullRom';

export type PolyPenNodeType = 'straight' | 'curvePoints' | 'bezier';

export interface PolyPenNode {
  point: Point2D;
  type: PolyPenNodeType;
  handleIn?: Point2D;
  handleOut?: Point2D;
}

/** Manejador que el nodo `i` aporta al tramo que SALE de él (out) o ENTRA en él (in). */
type Contribution = { out: (Point2D | null)[]; in: (Point2D | null)[] };

/**
 * Cada tramo toma en cada extremo el manejador que su nodo aporta (spec § 4.5).
 * Un bezier aporta el suyo; un nodo de curva por puntos aporta el de Catmull-Rom
 * de su bloque; un recto no aporta. Las cadenas son abiertas: un bloque nunca
 * cruza el cierre.
 */
function contributions(nodes: PolyPenNode[], closed: boolean): Contribution {
  const n = nodes.length;
  const out: (Point2D | null)[] = nodes.map(nd => nd.type === 'bezier' ? nd.handleOut ?? null : null);
  const inn: (Point2D | null)[] = nodes.map(nd => nd.type === 'bezier' ? nd.handleIn ?? null : null);

  // Bloques maximales de curvePoints, sin cruzar el cierre (índices lineales).
  let i = 0;
  while (i < n) {
    if (nodes[i].type !== 'curvePoints') { i++; continue; }
    let j = i;
    while (j + 1 < n && nodes[j + 1].type === 'curvePoints') j++;
    // Vecinos: el anterior (i-1) y el siguiente (j+1), con envoltura solo si el
    // trazo cierra — el vecino existe aunque el bloque no cruce el cierre.
    const prevIdx = i - 1 >= 0 ? i - 1 : (closed ? n - 1 : -1);
    const nextIdx = j + 1 < n ? j + 1 : (closed ? 0 : -1);
    const idx: number[] = [];
    if (prevIdx >= 0 && prevIdx !== j) idx.push(prevIdx);
    for (let k = i; k <= j; k++) idx.push(k);
    if (nextIdx >= 0 && nextIdx !== i && nextIdx !== prevIdx) idx.push(nextIdx);
    // Un bloque que abarca todos los nodos de un trazo cerrado: vecinos = él mismo.
    if (idx.length >= 2) {
      const handles = chainHandles(idx.map(k => nodes[k].point), false);
      for (let t = 0; t < handles.length; t++) {
        const a = idx[t], b = idx[t + 1];
        const [cp1, cp2] = handles[t];
        if (nodes[a].type === 'curvePoints') out[a] = cp1;
        if (nodes[b].type === 'curvePoints') inn[b] = cp2;
      }
    }
    i = j + 1;
  }
  return { out, in: inn };
}

export function nodesToCommands(nodes: PolyPenNode[], closed: boolean): PathCommand[] {
  if (nodes.length < 2) return [];
  const { out, in: inn } = contributions(nodes, closed);
  const cmds: PathCommand[] = [{ type: 'M', values: [nodes[0].point.x, nodes[0].point.y] }];
  const segment = (a: number, b: number): PathCommand => {
    const cp1 = out[a], cp2 = inn[b];
    const to = nodes[b].point;
    if (!cp1 && !cp2) return { type: 'L', values: [to.x, to.y] };
    const c1 = cp1 ?? nodes[a].point;
    const c2 = cp2 ?? to;
    return { type: 'C', values: [c1.x, c1.y, c2.x, c2.y, to.x, to.y] };
  };
  for (let k = 1; k < nodes.length; k++) cmds.push(segment(k - 1, k));
  if (closed) {
    const last = nodes.length - 1;
    const closing = segment(last, 0);
    if (closing.type === 'C') cmds.push(closing);
    cmds.push({ type: 'Z', values: [] });
  }
  return cmds;
}

export function commandsToPathD(cmds: PathCommand[]): string {
  return cmds.map(c => `${c.type}${c.values.join(',')}`).join(' ');
}
```

- [ ] **Step 4:** correr el test → verde. Si "las cadenas son abiertas" falla por los vecinos envueltos, revisar `prevIdx`/`nextIdx`: en un trazo cerrado el bloque `[n3]` de la prueba tiene vecinos `n2` y `n0`, y el bloque `[n0]` tiene vecinos `n3`... — **no**: el spec dice cadenas abiertas, así que el vecino anterior de `n0` en un cerrado sí es `n3` como PUNTO de contexto, pero cada bloque se calcula por separado. La prueba fija: bloque A = `[n0, n1]` con phantom (sin `n3`), bloque B = `[n2, n3, n0]`. Ajustar: `prevIdx` **no** envuelve (`closed` solo aporta el vecino SIGUIENTE para el bloque que termina en el último nodo). Reescribir la línea de `prevIdx` como `const prevIdx = i - 1;` y dejar `nextIdx` como está.
- [ ] **Step 5:** `npx eslint src/components/PatternEditor/polyPenGeometry.ts src/components/PatternEditor/__tests__/polyPenGeometry.test.ts --max-warnings=0` y `npx tsc -b --noEmit`.
- [ ] **Step 6:** commit `feat(2d): geometría pura del trazo de línea interna (nodos → comandos)`.

---

### Task 2: el motor — `usePolyPenTool.ts` reescrito

**Files:**
- Modify: `src/components/PatternEditor/usePolyPenTool.ts` (reescritura completa)
- Create: `src/components/PatternEditor/__tests__/usePolyPenTool.test.tsx`

**Interfaces:**
- Consumes: `nodesToCommands` (Task 1); `extractNodes`, `hitTestNode` (`nodeEditorUtils.ts`); `buildRing`, `projectToRing` (`src/utils/geometry/outlineRing.ts`); `pointInPolygon` (`src/utils/geometry/slashAndSpread.ts`); `patternToPieceLocal`, `pieceLocalToPattern` (`src/utils/geometry/pieceSpace.ts`); `screenToPattern`, `screenToPatternLength` (`src/utils/geometry`); `isDrag`, `EDGE_HIT_PX` (`gestureConstants.ts`).
- Produces:
  ```ts
  export type SnapKind = 'firstNode' | 'vertex' | 'internalEnd' | 'outline';
  export interface SnapTarget { kind: SnapKind; pieceId: string | null; point: Point2D /* mundo */ }
  export interface InternalLineToolOptions {
    nodeType: 'straight' | 'curvePoints';
    /** Piezas VISIBLES en orden de dibujo (la última, arriba). */
    pieces: PatternPiece[];
    onComplete: (hostId: string, commands: PathCommand[] /* mundo */, closed: boolean) => void;
    onLockedPress?: (pieceId: string) => void;
  }
  export function usePolyPenTool(zoom: number, pan: Point2D, opts: InternalLineToolOptions): {
    nodes: PolyPenNode[]; previewPoint: Point2D | null; isDragging: boolean; dragHandle: Point2D | null;
    hover: SnapTarget | null; hostId: string | null; closeArmed: boolean;
    handleMouseDown(e): void; handleMouseMove(e): void; handleMouseUp(e): void; handleDoubleClick(): void;
    /** true si consumió la tecla (Escape, Enter, Backspace, Delete). Tab NO se consume aquí (PR B). */
    handleKeyDown(e: KeyboardEvent): boolean;
    /** Descarta solo el press vivo (Escape a mitad de press, pointercancel, blur). */
    cancelPress(): void;
    /** Borra nodos Y press (cambio de herramienta). */
    reset(): void;
    isTracing(): boolean;   // nodos.length > 0 || press vivo
    isArmed(): boolean;     // press vivo
  }
  ```
- Reglas del motor (spec § 4.3–§ 4.6): press b0 solamente; press ≤ `EDGE_HIT_PX` del último nodo → no arma; press sobre el nodo 1 con ≥ 3 nodos → arma cierre, commit en release; **zona muerta**: tras un commit en P, un press a ≤ radio de P no arma hasta que un mousemove salga del radio; primer press: anfitriona = pieza del objetivo si engancha, si no la de más arriba con `pointInPolygon(local, outline)`, bloqueada → `onLockedPress` y no arma; nodos siguientes libres; arrastre ≥ 4 px → bezier; release → nodo del tipo latcheado (o bezier); `handleKeyDown`: Escape con press vivo → `cancelPress()` (consumido); Escape con nodos → reset (consumido); Enter con ≥ 2 → commit abierto (consumido); Backspace/Delete con nodos → quita el último (con 1 → reset) (consumido); nada que consumir → `false`. Doble clic con ≥ 2 → commit abierto. `onComplete` se lee de un ref para no cerrar sobre un `pieces` viejo.
- Enganche (hover y press), memos por identidad de `opts.pieces`: `nodesByPiece` (`extractNodes`), `endsByPiece` (primer/último ancla de cada `internals[].path` vía `getInternalLineEndpoints`, que se exporta desde `useEditorInteractions.ts`), `ringsByPiece` (`buildRing(outline, 2)` si `ok`). Prioridad: primer nodo (≥ 3) → vértice (piezas de arriba primero) → extremo de interna → contorno (`projectToRing`, distancia euclídea ≤ radio) → nada. Radio en patrón = `screenToPatternLength(EDGE_HIT_PX, zoom)`.

- [ ] **Step 1: test rojo** `usePolyPenTool.test.tsx` (renderHook, sin Redux). Fixture: pieza A 200×100 en (100,100) sin giro, pieza B 200×100 en (100,300) con `rotation: 90`, y un `svgRect = {left:0, top:0}`; eventos sintéticos `{button, clientX, clientY, currentTarget:{getBoundingClientRect:()=>svgRect}}` con zoom 1, pan 0. Casos (cada `it` es un contrato de § 12.1 #2, #4, #5):
  1. `press dentro de A + release → 1 nodo straight; hostId = A`.
  2. `press fuera de toda pieza → 0 nodos, hostId null`.
  3. `press sobre pieza bloqueada → onLockedPress(id) y 0 nodos`.
  4. `press a 5 px del vértice (100,100) de A → nodo en (100,100) exacto y hover.kind === 'vertex'`.
  5. `press a 5 px del vértice girado de B → nodo coincide con pieceLocalToPattern(vértice, B) a 1e-6; hostId = B` (el objetivo manda sobre el contorno de A).
  6. `press a 6 px del borde superior de A (fuera del vértice) → nodo sobre el borde: y === 100 a 1e-6, x conservado`.
  7. `press sobre el extremo de una interna existente de A → nodo exacto en ese extremo`.
  8. `arrastre ≥ 4 px → nodo bezier con handleOut = release y handleIn simétrico`.
  9. `nodeType 'curvePoints' → nodo curvePoints`.
  10. `press sobre el último nodo → no arma (nodos no cambian)`.
  11. `tres nodos + press/release sobre el nodo 1 → onComplete(A, cmds con Z, closed=true) y nodos = []`.
  12. `dos nodos + Enter → onComplete(A, [M, L], false); handleKeyDown devolvió true`.
  13. `Enter con 1 nodo → false y nada`.
  14. `Escape con press vivo → cancelPress: nodos intactos, release posterior no añade`.
  15. `Escape con nodos y sin press → nodos = [] y true`.
  16. `Backspace con 2 nodos → 1; con 1 → 0`.
  17. `sin nodos, Escape → false`.
  18. `press b2 → no arma`.
  19. `zona muerta: commit por Enter en P; press en P sin mover → no arma; mousemove a 20 px y press → arma`.
  20. `doble clic: tres clics, el tercero seguido de press/release en el mismo sitio (no arma) y handleDoubleClick → onComplete con 3 nodos abierto`.
  21. `reset() con press vivo → release posterior no añade`.
  22. `pieza oculta (no incluida en pieces) no es objetivo` (se prueba pasando solo A y clicando cerca del vértice de B → sin enganche).
- [ ] **Step 2:** correr → rojo (firma vieja).
- [ ] **Step 3:** implementar el hook. Esqueleto de estado:

```ts
interface Press { world: Point2D; screen: Point2D; snap: SnapTarget | null; closes: boolean; moved: boolean; drag: Point2D | null }
const nodesRef = useRef<PolyPenNode[]>([]);
const pressRef = useRef<Press | null>(null);
const hostRef = useRef<string | null>(null);
const deadZoneRef = useRef<Point2D | null>(null);   // mundo; se limpia al alejarse > radio
const optsRef = useRef(opts); optsRef.current = opts;
const [state, setState] = useState<{ nodes; previewPoint; isDragging; dragHandle; hover; hostId; closeArmed }>(…);
```

  `resolveSnap(world)`: orden de la spec. `resolveHost(world, snap)`: `snap?.pieceId ?? topmostContaining(world)`. `topmostContaining` recorre `opts.pieces` desde el final con `pointInPolygon(patternToPieceLocal(world, p), p.outline)`.

  `finish(closed)`: `const cmds = nodesToCommands(nodesRef.current, closed); const host = hostRef.current; const p = nodesRef.current[…]; reset(); if (cmds.length && host) optsRef.current.onComplete(host, cmds, closed); deadZoneRef.current = lastCommitPoint;`

- [ ] **Step 4:** verde en los 22 `it`. Ajustar hasta que cada uno pase por su razón.
- [ ] **Step 5:** eslint + tsc del archivo (el resto del árbol puede estar rojo hasta Task 3; anotar los errores que sean solo de llamadores viejos).
- [ ] **Step 6:** commit `feat(2d): motor de línea interna — enganche, anfitriona por primer press, cierre en el release`.

---

### Task 3: cableado del hub — `useEditorInteractions.ts`, `PatternEditor.tsx`, `ToolOverlay.tsx`, muerte de `line`/`polyPen`

**Files:**
- Modify: `src/components/PatternEditor/useEditorInteractions.ts`, `PatternEditor.tsx`, `renderers/ToolOverlay.tsx`, `usePenTool.ts` (solo `handleKeyDown` → boolean)
- Delete: `useLineTool.ts`, `renderers/overlays/LineToolOverlay.tsx`
- Modify: `src/utils/geometry/hitTest.ts` (borrar `findNearestPiece`), `src/utils/geometry/index.ts`, `src/utils/geometry/__tests__/hitTest.test.ts` (borrar el `describe('findNearestPiece')`), `src/components/PatternEditor/__tests__/1064-hit-testing-con-pieza-girada.test.tsx` (borrar los `it` de `findNearestPiece`, conservar los de `hitTestPieceBBox`)
- Modify: `src/types/types.ts` (quitar `'line'` y `'polyPen'` de `Tool2D`)
- Test: `src/components/PatternEditor/__tests__/useEditorInteractions.teclado.test.tsx` (nuevo)

**Interfaces:**
- Consumes: el motor (Task 2). `getInternalLineEndpoints` pasa a `export function`.
- Produces en `useEditorInteractions`: `ToolHooks.internalShapeTool` = `{ handleMouseDown, handleMouseMove, handleMouseUp, handleDoubleClick, handleKeyDown(e): boolean, cancelPress, reset, isTracing(): boolean, isArmed(): boolean }`; `ToolHooks.pen.handleKeyDown` pasa a devolver `boolean`. Desaparecen `lineTool` y `polyPenTool`.

- [ ] **Step 1: test rojo** `useEditorInteractions.teclado.test.tsx` (mismo `makeTools`/`setup` de `useEditorInteractions.reset.test.tsx`, con `document.body` como target por defecto):
  1. `con internalShape activa y el motor diciendo isTracing() === true, un Escape en window (captura) llama internalShapeTool.handleKeyDown y NO llega a un listener de document` (se registra un `document.addEventListener('keydown', spy)`; el hook mock devuelve `true`).
  2. `si el motor devuelve false, el Escape sí llega a document`.
  3. `Backspace con trazo vivo se consume (no llega a document)`.
  4. `un keydown cuyo target es un <input> no toca el motor` (dispatch del evento sobre un input montado en el body).
  5. `con pen activa, Enter consumido por pen.handleKeyDown → no llega a document`.
- [ ] **Step 2:** rojo.
- [ ] **Step 3:** en `useEditorInteractions.ts`:
  - Importar `isEditableTarget` (crear inline: `const isEditableTarget = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);`).
  - En el efecto CF-1 (`:412-448`), renombrar el handler a `onKeyCapture`, quitar el `if (e.key !== 'Escape') return;` de arriba y poner al principio: `if (isEditableTarget(e.target)) return;`. Añadir ANTES de las ramas existentes:
    ```ts
    if (activeTool === 'internalShape' && internalShapeTool.isTracing()) {
      if (internalShapeTool.handleKeyDown(e)) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (activeTool === 'pen' && pen.handleKeyDown(e)) { e.preventDefault(); e.stopPropagation(); return; }
    ```
    y dejar las ramas viejas (point/notch/seamAllowance/seam/transform) **solo para Escape**: envolverlas en `if (e.key !== 'Escape') return;` justo después de las dos ramas nuevas. Deps: añadir `internalShapeTool`, `pen`.
  - En el efecto de burbuja (`:382-405`): quitar `pen`, `line`, `polyPen`, `internalShape` de la lista.
  - Quitar todas las ramas `activeTool === 'line'` y `activeTool === 'polyPen'` (mousedown :601/:617, move :860/:876, up :978, dblclick :529-532, resets :364-367, ToolHooks :99/:219-226, destructuring :297, deps).
  - `handleMouseDown`: en la rama `internalShape` nada cambia (el motor filtra el botón).
  - `handleMouseUp`: `if (activeTool === 'internalShape') { if (e) internalShapeTool.handleMouseUp(e); else internalShapeTool.cancelPress(); }`.
  - `handlePointerCancel`: añadir `if (activeTool === 'internalShape') internalShapeTool.cancelPress(); if (activeTool === 'pen') pen.reset();` (la pluma no tiene press separable; `rectangle` entra en PR B).
  - `export function getInternalLineEndpoints`.
- [ ] **Step 4:** en `usePenTool.ts`, `handleKeyDown` devuelve `boolean`: Escape con nodos → limpia y `true`; Enter con ≥ 2 → completa y `true`; si no, `false`.
- [ ] **Step 5:** en `PatternEditor.tsx`:
  - Borrar `useLineTool` import/instancia/`handleInternalLineAdd`, `usePolyPenTool` viejo (`polyPenMode`, `polyPenLineType`, `handlePolyPenCompleteInternalLine`, `polyPenTool`), y el overlay de `polyPen` (`:1011-1019`).
  - Añadir `const hiddenLayerIds = useSelector((s: RootState) => s.simulation.hiddenLayerIds);` y
    ```ts
    const drawablePieces = useMemo(
      () => [...pieces].filter(p => !hiddenLayerIds.includes(p.layer ?? 1)).sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0)),
      [pieces, hiddenLayerIds],
    );
    const internalLineType = (toolOptions?.internalShape?.lineType as InternalLineType | undefined) ?? 'reference';
    const internalNodeType = (toolOptions?.internalShape?.nodeType as 'straight' | 'curvePoints' | undefined) ?? 'straight';
    const handleInternalShapeComplete = useCallback((hostId: string, path: PathCommand[]) => {
      const host = pieces.find(p => p.id === hostId);
      if (!host) { dispatch(showInfoToast('La pieza ya no existe: el trazo se descartó.')); return; }
      dispatch(addInternalLine({ pieceId: host.id, line: { id: newId(), type: internalLineType, path: toPieceLocalPath(path, host) } }));
    }, [pieces, dispatch, internalLineType]);
    const internalShapeTool = usePolyPenTool(zoom2D, pan2D, {
      nodeType: internalNodeType, pieces: drawablePieces, onComplete: handleInternalShapeComplete,
      onLockedPress: () => dispatch(showInfoToast('Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.')),
    });
    ```
    (`showInfoToast` ya se importa en `useEditPattern.ts` desde `../../store/copilotUISlice`.)
  - `handleContextMenu`: al principio, `if (activeTool === 'internalShape' && internalShapeTool.isTracing()) { e.preventDefault(); return; }`.
  - `ToolOverlay`: quitar `lineStart/lineCursor/lineLength`.
  - Overlay: `{activeTool === 'internalShape' && <PolyPenToolOverlay nodes={…} previewPoint={…} isDragging={…} dragHandle={…} hover={internalShapeTool.hover} nodeType={internalNodeType} closeArmed={internalShapeTool.closeArmed} zoom2D={zoom2D} units={units} />}` (las props nuevas las consume Task 5; hasta entonces el overlay las ignora).
  - `HintText`: pasar `internalShapeNodesLength={internalShapeTool.nodes.length}` (Task 7 lo pinta).
- [ ] **Step 6:** `ToolOverlay.tsx`: borrar import y render de `LineToolOverlay` y las tres props.
- [ ] **Step 7:** borrar `useLineTool.ts`, `LineToolOverlay.tsx`, `findNearestPiece` (+ export en `geometry/index.ts` + sus `it` en los dos tests). Quitar `'line'` y `'polyPen'` de `Tool2D`. `npx tsc -b --noEmit` es el guardia: arreglar cada referencia que quede (incluye `useEditorInteractions.reset.test.tsx` si Task 4 aún no lo tocó).
- [ ] **Step 8:** `npx vitest run src/components/PatternEditor src/utils/geometry` → verde; eslint de los tocados.
- [ ] **Step 9:** commit `feat(2d): una sola herramienta de línea interna — cableado, teclado en captura, adiós line y polyPen`.

---

### Task 4 (delegable): definiciones, dock, atajos, tests de idioma y nombres, README

**Files:**
- Modify: `src/tools/definitions/internalShape.tsx`, `src/tools/definitions/pen.tsx`, `src/tools/definitions/rectangle.tsx`, `src/tools/index.ts`
- Delete: `src/tools/definitions/line.tsx`, `src/tools/definitions/polyPen.tsx`
- Modify: `src/components/shell/dock2dTools.ts`, `src/store/dockSlice.ts`, `src/shortcuts/defaults.ts`, `src/hooks/useKeyboardShortcuts.ts`, `tools/README.md` (o `src/tools/README.md`, el que exista)
- Tests: `src/tools/__tests__/nombresDeHerramienta.test.ts`, `src/tools/__tests__/idiomaDeOpciones.test.ts`, `src/components/shell/__tests__/dock2dTools.test.ts`, `src/store/__tests__/dockSlice.test.ts`, `src/components/PatternEditor/__tests__/useEditorInteractions.reset.test.tsx`

**No tocar:** `src/types/types.ts`, `useEditorInteractions.ts`, `PatternEditor.tsx`, `useLineTool.ts`, `hitTest.ts` (los borra Task 3).

- [ ] **Step 1: tests rojos primero.**
  - `dockSlice.test.ts`: cambiar la expectativa del default (`:94-98`) a `['select','editPattern','point','pen','internalShape','rectangle','scissors','measure','seam','seamEdit','seamAllowance','notch']`; añadir `LEGACY_DEFAULT_DOCK_2D_IDS_V5` al import y dos `it`:
    ```ts
    it('el default V5 (con line) migra al vigente (con internalShape)', () => {
      expect(migrateDefaultDockTools([...LEGACY_DEFAULT_DOCK_2D_IDS_V5])).toEqual(DEFAULT_DOCK_2D_IDS);
    });
    it('un dock personalizado recibe internalShape en la ranura de line, sin duplicar', () => {
      expect(migrateDefaultDockTools(['select', 'line', 'notch'])).toEqual(['select', 'internalShape', 'notch']);
      expect(migrateDefaultDockTools(['internalShape', 'line', 'notch'])).toEqual(['internalShape', 'notch']);
    });
    ```
    y en los `it` de `reorderDockTool` (`:199-224`) sustituir `'line'` por `'notch'` en los seeds y expectativas (son datos de prueba, no el dock real).
  - `dock2dTools.test.ts`: `toHaveLength(13)`; el `it` de `:10-18` pasa a esperar `getDockToolById('internalShape')?.label).toBe('Línea interna')` y `getDockToolById('line')).toBeUndefined()`; añadir `it('línea interna ocupa la ranura de línea, con G', …)`: `ids.indexOf('internalShape')).toBe(ids.indexOf('pen') + 1)` y `shortcut === 'G'`.
  - `nombresDeHerramienta.test.ts`: en `NOMBRES` quitar `line` y `polyPen`; `internalShape: 'Línea interna'`.
  - `idiomaDeOpciones.test.ts`: `pen: {}` → **quitar la clave `pen`** del objeto y añadir un `it('la pluma no declara opciones que no lee', () => expect(toolRegistry.getTool('pen')!.options ?? []).toEqual([]))`; `rectangle: { width: ['Ancho'], height: ['Alto'] }`; quitar el bloque `polyPen`; añadir `internalShape: { nodeType: ['Tipo de punto', 'Recta', 'Curva por puntos'], lineType: ['Tipo de línea', 'Referencia', 'Doblez', 'Pespunte'] }`.
  - `useEditorInteractions.reset.test.tsx`: el tercer `it` pasa a `setup('internalShape')` y `tools.internalShapeTool.reset`.
- [ ] **Step 2:** correr los cinco archivos → rojos.
- [ ] **Step 3:** implementar:
  - `internalShape.tsx`: `name: 'Línea interna'`, `shortcut: 'g'`, `options: [ { id: 'nodeType', label: 'Tipo de punto', type: 'select', value: 'straight', choices: [{ label: 'Recta', value: 'straight' }, { label: 'Curva por puntos', value: 'curvePoints' }] }, { id: 'lineType', label: 'Tipo de línea', type: 'select', value: 'reference', choices: [{ label: 'Referencia', value: 'reference' }, { label: 'Doblez', value: 'fold' }, { label: 'Pespunte', value: 'topstitch' }] } ]`; `copilot.description` en inglés actualizada ("Draw internal lines: straight, curve-by-points or bezier nodes, snapping to corners and edges…"); `parameterHints` para `nodeType` y `lineType`.
  - `pen.tsx`: borrar `options` y `parameterHints` (dejar `copilot.description` sin mencionar smoothing/grid/angles).
  - `rectangle.tsx`: borrar `cornerStyle` (y su `parameterHint`); `width`/`height` quedan (PR B les pone `control: 'input'` y el rango).
  - `src/tools/index.ts`: quitar imports y registros de `lineTool` y `polyPenTool`.
  - `dock2dTools.ts`: quitar la entrada `line`; mover `{ id: 'internalShape', icon: Shapes, label: 'Línea interna', shortcut: 'G' }` a la posición 5 (tras `pen`); borrar el comentario obsoleto (`:19-21`) y dejar: "Every id is a real Tool2D union member with a canvas handler in useEditorInteractions."
  - `dockSlice.ts`: `LEGACY_DEFAULT_DOCK_2D_IDS_V5 = [...el default actual con 'line']`; `DEFAULT_DOCK_2D_IDS` con `'internalShape'` en lugar de `'line'`; en `migrateDefaultDockTools`, añadir `matches(LEGACY_DEFAULT_DOCK_2D_IDS_V5)` y cambiar el `return [...ids]` final por:
    ```ts
    // 'line' murió en la unificación de líneas internas (spec 2026-08-29): su
    // ranura la hereda internalShape, sin duplicar si ya estaba.
    const out: string[] = [];
    for (const id of ids) {
      const mapped = id === 'line' ? 'internalShape' : id;
      if (!out.includes(mapped)) out.push(mapped);
    }
    return out;
    ```
  - `defaults.ts`: `tool.internalShape` label `'Línea interna'`; borrar `tool.polyPen` (`:60`) y `tool.line` (`:72`).
  - `useKeyboardShortcuts.ts`: borrar las dos entradas `tool.polyPen` (`:211`) y `tool.line` (`:221`).
  - README: en "Tool Options", quitar la línea de Pen y dejar Rectangle como `width, height`.
- [ ] **Step 4:** `npx vitest run src/tools src/components/shell src/store/__tests__/dockSlice.test.ts src/components/PatternEditor/__tests__/useEditorInteractions.reset.test.tsx` → verde. `npx eslint <tocados> --max-warnings=0`. `npx tsc -b --noEmit` (reportar solo errores en archivos de esta tarea; los de `useLineTool`/`PatternEditor` son de Task 3).
- [ ] **Step 5:** NO commitear (lo commitea el orquestador tras revisar el diff).

---

### Task 5: overlay + tokens

**Files:**
- Modify: `src/components/PatternEditor/renderers/overlays/PolyPenToolOverlay.tsx`, `src/styles/tokens.css`, `scripts/ui-contract-baseline.json` (vía `--update`, solo si R3 bajó)
- Test: `src/components/PatternEditor/renderers/__tests__/PolyPenToolOverlay.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `commandsToPathD`, `nodesToCommands` (Task 1); `hover`, `closeArmed`, `nodeType` del motor (Task 2/3); `formatDimension` (`src/utils/units.ts`); `EDGE_HIT_PX`.
- Props: `{ nodes, previewPoint, isDragging, dragHandle, hover: SnapTarget | null, nodeType: 'straight' | 'curvePoints', closeArmed: boolean, zoom2D, units }`.
- Tokens nuevos en `tokens.css` (junto a `--notch-2d`): `--snap-2d: oklch(0.72 0.15 80);` (ámbar del enganche), `--readout-bg-2d: rgba(43, 45, 51, 0.85);`, `--readout-ink-2d: #ffffff;`.

- [ ] **Step 1: test rojo** (render con `@testing-library/react` dentro de un `<svg>`): (a) sin nodos ni hover no pinta nada; (b) con 2 nodos y `previewPoint`, pinta `path` con `d` igual a `commandsToPathD(nodesToCommands(nodes,false))`, la goma termina en `previewPoint`, y la píldora dice largo y ángulo (`formatDimension(hypot)` y `"45.0°"` para un tramo a 45°); (c) con `hover` la goma termina en `hover.point` y hay un `circle.snap-ring` en `hover.point`; (d) el fantasma del nodo lleva `data-node-type` con el tipo latcheado y `fill` `var(--accent-2d)` si es curvePoints / `var(--piece-fill-2d)` si es recta; (e) ningún atributo `fill`/`stroke` del árbol renderizado contiene `#` ni `rgba(` (R3 en runtime).
- [ ] **Step 2:** rojo.
- [ ] **Step 3:** reescribir el overlay: `pathD` desde la geometría compartida; nodos con la regla de relleno (`straight` hueco = `var(--piece-fill-2d)` con borde `var(--accent-2d)`; `curvePoints`/`bezier` rellenos `var(--accent-2d)`); manejadores en `var(--ink-on-light-3)`; goma punteada de último nodo a `hover?.point ?? previewPoint`; anillo `className="snap-ring"` en `hover.point` (`r = EDGE_HIT_PX / zoom2D * 0.5`, `stroke: var(--snap-2d)`, `fill: none`, `strokeWidth: 2/zoom2D`); cuando `closeArmed`, el anillo va sobre el nodo 0; fantasma del nodo en el objetivo con `data-node-type`; píldora (rect `rx` + text) con `fill: var(--readout-bg-2d)` / `var(--readout-ink-2d)`, desplazada `+22/zoom, −18/zoom` del cursor, texto `${formatDimension(len, units)} · ${ang.toFixed(1)}°` con el ángulo 0° a la derecha, 90° arriba (`Math.atan2(-(dy), dx)`). Sin `#2196f3`, sin `#999`, sin `#ff9800`, sin `#4caf50`.
- [ ] **Step 4:** verde; `node scripts/ui-contract-lint.mjs` → R3 debe haber **bajado** (murió `LineToolOverlay`, y el overlay viejo tenía literales); `node scripts/ui-contract-lint.mjs --update` y commitear el baseline.
- [ ] **Step 5:** commit `feat(2d): overlay de línea interna — anillo de enganche, fantasma del nodo, píldora de largo y ángulo (tokens, no literales)`.

---

### Task 6 (delegable): exportador AAMA — polilíneas internas completas

**Files:**
- Modify: `src/utils/dxf/exportAAMA.ts` (`pieceEntities`, :301-340)
- Test: el archivo de tests existente de `exportAAMA` (`src/utils/dxf/__tests__/exportAAMA*.test.ts`; localizar con Glob) — añadir dos `it`.

- [ ] **Step 1: tests rojos**: (a) una interna `type:'fold'` con path `M(0,0) L(50,0) L(50,30) L(0,30)` exporta **una** `LWPOLYLINE` de 4 vértices en la capa DRAW (`AAMA_LAYERS.DRAW`) — hoy sale una sola `LINE` (0,0)-(50,0); (b) la anotación `MTN`/`VAL` de esa `fold` se coloca en el punto medio del **arco** de la polilínea (arco total 130 → medio a 65 → punto (50, 15); en DXF la y va negada: `-(15)`), no en el punto medio del primer tramo.
- [ ] **Step 2:** rojo.
- [ ] **Step 3:** implementar: antes del `if (line.path.length >= 2 && …)`, añadir
  ```ts
  const anchors = line.path.filter(c => c.type !== 'Z').length;
  const curved = line.path.some(c => c.type === 'C' || c.type === 'Q');
  const multi = anchors > 2 || curved;
  if (multi && line.type !== 'grainline' && line.type !== 'notch') {
    s += pathToEntities(line.path, layer, opts);
    if (line.type === 'fold') {
      const mid = midpointAlongPath(line.path);   // nuevo helper local: aplana con flattenPath y camina hasta la mitad del arco
      const dir = line.foldOptions?.direction === 'valley' ? 'VAL' : 'MTN';
      s += textToDXF(dir, mid.x, -(mid.y), 1.5, AAMA_LAYERS.FOLD_DIR);
    }
    continue;
  }
  ```
  `midpointAlongPath` usa `flattenPath` (ya importado o importable de `../geometry/path`); si el arco total es 0 devuelve el primer punto.
- [ ] **Step 4:** verde en el archivo de tests del exportador completo (los `it` viejos de `reference`, grainline y notch no cambian). eslint del archivo.
- [ ] **Step 5:** NO commitear (lo commitea el orquestador).

---

### Task 7: pista, e2e, gates, entrega

**Files:**
- Modify: `src/components/PatternEditor/renderers/HintText.tsx` (+ prop `internalShapeNodesLength`), su test si existe (`HintText.*.test.tsx`)
- Create: `tests/e2e/maria-205-linea-interna.spec.ts`
- Delete: `tests/e2e/_repro_lote_lineas.spec.ts` (tras sacar las capturas "antes" para la entrega — Task 8 del lote, fuera de este plan)

- [ ] **Step 1:** `HintText`: con `activeTool === 'internalShape'`: sin nodos → `Clic dentro de una pieza para empezar · las esquinas y los bordes enganchan`; con nodos → `Clic añade · arrastra para curvar · doble clic o Enter termina · clic en el primer punto cierra · Retroceso quita el último · Esc descarta`. Test unitario del texto (dos `it`).
- [ ] **Step 2:** e2e `maria-205-linea-interna.spec.ts` (mismos helpers que el spec temporal: `waitForApp`, `addPiece`, `toScreen`, `clickAt`, `tool`), cuatro `test`:
  1. `cambiar de herramienta no deja un inicio fantasma`: `g`, clic en (200,200), `z`, `g`, clic en (260,230) → `internals.length === 0`; Enter → sigue 0 (un solo nodo no termina).
  2. `Enter termina una línea abierta y el doble clic también`: tres clics + Enter → 1 interna, tipos `MLL`; luego tres clics + dblclick → 2 internas, la segunda `MLL` (sin nodo repetido).
  3. `clicar a 5 px de un vértice engancha exacto, también con la pieza girada`: pieza A sin giro: clic a (154,153) + clic (250,220) + Enter → `path[0].values` ≈ `[0,0]` (`toBeCloseTo` 6); pieza B con `rotation: 90` en (500,150): clic a 5 px del vértice girado (calcular con `pieceLocalToPattern` en el test vía la fórmula de `pieceSpace.ts`: rotación alrededor del centro del bbox) → `path[0].values` ≈ `[0,0]`.
  4. `la línea cae en la pieza bajo el cursor y el doble clic sobre el primer nodo cierra sin fantasma`: A y B; trazar dentro de A → la interna está en A con `path[0]` ≈ local esperado; después tres clics y dblclick sobre el nodo 1 → una interna con `Z` y `internalShapeTool` sin trazo (probar: `Enter` después no crea nada nuevo).
  Todos con `test.setTimeout(90_000)` y `--workers=1` en local.
- [ ] **Step 3:** correr `npx playwright test tests/e2e/maria-205-linea-interna.spec.ts --workers=1 --retries=0 > log` con el servidor de Vite en 5174 caliente.
- [ ] **Step 4:** gate completo: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`.
- [ ] **Step 5:** `CHANGELOG.md` (Unreleased › Added/Changed/Fixed: la herramienta única, el enganche, la muerte de `line`/`polyPen`, `⇧L`/`Y` libres, el tipo por omisión, los cinco defectos vivos) y `docs/plans/…` no aplica.
- [ ] **Step 6:** commit, push, PR `feat(2d): línea interna única con enganche y medidas en la píldora (María #205 #206 #209 #193)` con cuerpo: qué cambia para María, los cinco defectos cerrados, lo que NO entra (PR B), y "Closes" en inglés solo si hay issues de GitHub asociados (no los hay: las tarjetas son de Trello).
