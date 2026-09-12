# Trazos (líneas de construcción) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que María pueda trazar rayas sueltas en el lienzo con la Pluma (cerrado = pieza, abierto = trazo), enganchar a ellas, medirlas, editarlas por tramo y borrarlas — sin que ninguna sea una «pieza abierta» ni vaya al 3D.

**Architecture:** un `Trazo { id, path, createdAt }` vive en `project.trazos`, hermano de `referenceImages`, con el `path` en coordenadas de patrón y sin anfitriona. La Pluma reparte al terminar: cerrado → `addPiece`, abierto → `addTrazo`; Esc y el cambio de herramienta terminan el trazo en vez de tirarlo. Todo lo demás reutiliza la gramática de la línea interna: el índice de enganche (`snapIndex`) recibe los trazos, la selección es por tramo (`editor.selectedTrazo`), el chip de cota es el de las internas (`cotasDeTrazo`), Supr borra el tramo, Seleccionar arrastra las puntas. Un `TrazosLayer` los pinta con el estilo de la interna de referencia, encima de las piezas y debajo de las cotas.

**Tech Stack:** React 18 + Redux Toolkit (`projectSlice`, `editorSlice`, `undoMiddleware`), SVG, vitest (+ `@testing-library/react` para hooks, `// @vitest-environment jsdom`), Playwright para e2e con la caja negra (`tests/e2e/helpers/{lienzo,bitacora}.ts`).

**Spec:** `docs/superpowers/specs/2026-09-12-trazos-lineas-de-construccion-design.md` — el plan argumenta desde ahí; léela entera antes de la tarea 1. Issue: #1158.

## Global Constraints

- **Nombre en código:** `Trazo` / `trazos` / `selectedTrazo` / `showTrazos`. **Nunca** `construction`: ese nombre es del copiloto (`s.construction`, `ConstructionOverlay.tsx`). En pantalla: «Construcción» (interruptor) y «trazo» (pista, tira).
- **Contrato de interfaz** (`.claude/skills/contrato-de-interfaz/`): ningún color literal fuera de `tokens.css`; los trazos usan `var(--ink-on-light-3)` (el mismo que `internalLineColor` da a `'reference'`) y el acento `var(--accent-2d)` para el tramo seleccionado; nada de `z-index` literal; todo `:hover` con `:focus-visible`. `node scripts/ui-contract-lint.mjs` no puede subir ningún contador.
- **Copy:** español de Venezuela, sentence case, sin «¡». Términos: «trazo», «construcción», «tramo», «pieza».
- **IDs:** `newId()` de `src/utils/ids.ts`. **Un trazo terminado no queda seleccionado** (spec § 3.1).
- **Deshacer:** un trazo terminado = una entrada; borrar un tramo = una; arrastrar una punta = un lote (`beginUndoBatch` / `endUndoBatch`).
- **Caja negra:** toda superficie nueva nace instrumentada con `pushJournal('gesture', …)` (`src/utils/telemetry/journal.ts:77`).
- **Trazos ocultos** (`showTrazos === false`) ni se pintan, ni enganchan, ni se seleccionan.
- **Gates antes de cada commit:** `npx tsc -b --noEmit && npm run lint` (el hook de pre-commit corre typecheck + lint-staged + trinquete de UI). Antes del último commit de la rama: `npm run test && npm run lint:ui` completos.
- **Commits:** en la rama `feat/trazos` (creada en la tarea 1 desde `main`). Mensaje en español; cada commit termina con las dos líneas de atribución de la sesión (`Co-Authored-By: …` y `Claude-Session: …`) que el orquestador pasa al ejecutor.
- **No se hace** (spec § 6): relaciones entre trazos, «convertir en pieza», Línea interna fuera de pieza, exportar trazos, trazos en 3D, curva por puntos en trazos, cruces con curvas, hover de trazos en Seleccionar (las internas tampoco lo tienen hoy — paridad), vértices interiores arrastrables.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/types.ts` | `Trazo`, `TrazoSelection`; `VinaProject.trazos?`; `EditorState.selectedTrazo` / `showTrazos` |
| `src/components/PatternEditor/trazos/trazoPath.ts` **(nuevo)** | geometría pura de un trazo: anclas, puntas, `quitarTramo`, `moverPunta`, `tramoMasCercano`, `cruceDeRectas`, `crucesDeTrazos` |
| `src/store/projectSlice.ts` | `trazos` en el estado, backfill, reducers `addTrazo` / `updateTrazo` / `removeTrazo` / `removeTramoDeTrazo` |
| `src/store/undoMiddleware.ts` | etiquetas de las cuatro acciones |
| `src/store/editorSlice.ts` | `selectedTrazo`, `showTrazos`, `selectTrazo`, `toggleTrazos`; limpieza cruzada con la selección de piezas e internas |
| `src/store/borradoDeSeleccion.ts` | sujeto `'trazo'` para Supr |
| `src/hooks/useKeyboardShortcuts.ts`, `src/components/shell/LogoMenu.tsx` | Supr → `removeTramoDeTrazo`; menú Ver ▸ «Construcción» |
| `src/components/PatternEditor/snapIndex.ts` | índice y resolutor con trazos: `trazoEnd`, `trazoCross`, anclas como `vertex`, recorrido como `outline` |
| `src/components/PatternEditor/usePenTool.ts` | `onComplete(PenResult)`: cerrado → pieza, abierto → trazo; Esc / cambio de herramienta terminan; bitácora `pen:complete` |
| `src/components/PatternEditor/usePolyPenTool.ts`, `useMeasureTool.ts` | reciben `trazos` para el índice |
| `src/components/PatternEditor/renderers/TrazosLayer.tsx` **(nuevo)** | pinta los trazos (estilo referencia), puntas siempre, tramo seleccionado en acento |
| `src/components/PatternEditor/renderers/HintText.tsx` | pista de la Pluma |
| `src/components/PatternEditor/FilaDeCapas.tsx` | interruptor «Construcción» |
| `src/components/PatternEditor/cotas/cotas.ts`, `cotas/sujeto.ts` | `cotasDeTrazo`, `CotaUpdate` `'trazo'`, rama del sujeto |
| `src/components/PatternEditor/PatternEditor.tsx` | cableado: `trazosVisibles`, `handlePenComplete`, `<TrazosLayer>`, `aplicarCota`, sujeto, herramientas |
| `src/components/PatternEditor/useEditorInteractions.ts` | Seleccionar: clic en tramo de trazo, arrastre de punta |
| `tests/e2e/trazos.spec.ts` **(nuevo)** | los diez recorridos de la spec § 9 |
| `docs/superpowers/specs/2026-09-09-lo-que-se-ve-y-cuando-design.md`, `2026-09-06-escalera-de-escape-design.md`, `docs/specs/2026-07-16-ui-copy-es-glosario.md` | enmiendas (spec § 8) |

---

### Task 1: Geometría pura de un trazo

**Files:**
- Create: `src/components/PatternEditor/trazos/trazoPath.ts`
- Test: `src/components/PatternEditor/trazos/__tests__/trazoPath.test.ts`

**Interfaces:**
- Consumes: `getAnchor(cmd)` de `../nodeEditorUtils` (devuelve el ancla de `M`/`L`/`C`/`Q` o `null`); `distToSegmentWithT` de `src/utils/geometry/distance.ts`.
- Produces: `anclasDeTrazo(path): Point2D[]`, `puntasDeTrazo(path): [Point2D, Point2D] | null`, `quitarTramo(path, segmentIndex): [PathCommand[] | null, PathCommand[] | null]`, `moverPunta(path, extremo: 0 | 1, a: Point2D): PathCommand[]`, `tramoMasCercano(path, p): { distance, segmentIndex, point } | null`, `cruceDeRectas(a1, a2, b1, b2): Point2D | null`, `crucesDeTrazos(trazos): Point2D[]`.

- [ ] **Step 1: Crear la rama y escribir los tests (rojos)**

```bash
cd /d/Desktop/projects/vina && git checkout main && git pull -q && git checkout -b feat/trazos
```

`src/components/PatternEditor/trazos/__tests__/trazoPath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../../types/types';
import {
  anclasDeTrazo, puntasDeTrazo, quitarTramo, moverPunta, tramoMasCercano, cruceDeRectas, crucesDeTrazos,
} from '../trazoPath';

const L = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });
const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });
const tres: PathCommand[] = [M(0, 0), L(100, 0), L(100, 100), L(0, 100)]; // 4 anclas, 3 tramos

describe('trazoPath — anclas y puntas', () => {
  it('lista las anclas en orden y las dos puntas', () => {
    expect(anclasDeTrazo(tres)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
    expect(puntasDeTrazo(tres)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 100 }]);
    expect(puntasDeTrazo([M(0, 0)])).toBeNull();
  });
});

describe('trazoPath — quitarTramo (contrato 08-09 § 5: Supr borra solo BC)', () => {
  it('del medio: dos trazos, cada uno con sus anclas', () => {
    const [izq, der] = quitarTramo(tres, 2); // tramo (100,0)→(100,100)
    expect(izq).toEqual([M(0, 0), L(100, 0)]);
    expect(der).toEqual([M(100, 100), L(0, 100)]);
  });
  it('el primero: solo queda la derecha', () => {
    const [izq, der] = quitarTramo(tres, 1);
    expect(izq).toBeNull();
    expect(der).toEqual([M(100, 0), L(100, 100), L(0, 100)]);
  });
  it('el último: solo queda la izquierda', () => {
    const [izq, der] = quitarTramo(tres, 3);
    expect(izq).toEqual([M(0, 0), L(100, 0), L(100, 100)]);
    expect(der).toBeNull();
  });
  it('de un trazo de dos anclas no queda nada', () => {
    expect(quitarTramo([M(0, 0), L(10, 0)], 1)).toEqual([null, null]);
  });
  it('un índice fuera de rango no toca el trazo', () => {
    expect(quitarTramo(tres, 0)).toEqual([tres, null]);
    expect(quitarTramo(tres, 9)).toEqual([tres, null]);
  });
});

describe('trazoPath — moverPunta', () => {
  it('mueve la primera y la última punta sin tocar las demás', () => {
    expect(anclasDeTrazo(moverPunta(tres, 0, { x: 5, y: 5 }))[0]).toEqual({ x: 5, y: 5 });
    const movido = moverPunta(tres, 1, { x: -1, y: 99 });
    expect(anclasDeTrazo(movido)[3]).toEqual({ x: -1, y: 99 });
    expect(anclasDeTrazo(movido).slice(0, 3)).toEqual(anclasDeTrazo(tres).slice(0, 3));
    expect(tres[3].values).toEqual([0, 100]); // no muta el original
  });
  it('en una curva C arrastra el manejador de llegada con el ancla', () => {
    const curva: PathCommand[] = [M(0, 0), { type: 'C', values: [10, 0, 90, 0, 100, 0] }];
    const movido = moverPunta(curva, 1, { x: 100, y: 50 });
    expect(movido[1].values).toEqual([10, 0, 90, 50, 100, 50]);
  });
});

describe('trazoPath — tramoMasCercano', () => {
  it('devuelve el tramo, la distancia y el punto proyectado', () => {
    const hit = tramoMasCercano(tres, { x: 50, y: 3 });
    expect(hit).toEqual({ distance: 3, segmentIndex: 1, point: { x: 50, y: 0 } });
    expect(tramoMasCercano([M(0, 0)], { x: 1, y: 1 })).toBeNull();
  });
});

describe('trazoPath — cruces', () => {
  it('dos rectas que se cruzan por dentro dan un punto; paralelas o en la punta, no', () => {
    expect(cruceDeRectas({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toEqual({ x: 5, y: 5 });
    expect(cruceDeRectas({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBeNull();
    expect(cruceDeRectas({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })).toBeNull();
  });
  it('crucesDeTrazos cruza tramos rectos de trazos distintos y del mismo trazo si no son vecinos', () => {
    const a = { id: 'a', path: [M(0, 5), L(10, 5)] };
    const b = { id: 'b', path: [M(5, 0), L(5, 10)] };
    expect(crucesDeTrazos([a, b])).toEqual([{ x: 5, y: 5 }]);
    const zeta = { id: 'z', path: [M(0, 0), L(10, 0), L(0, 10), L(10, 10)] }; // el 1.º y el 3.º tramo no se tocan
    expect(crucesDeTrazos([zeta])).toEqual([]);
    const curva = { id: 'c', path: [M(0, 5), { type: 'C' as const, values: [3, 5, 7, 5, 10, 5] }] };
    expect(crucesDeTrazos([curva, b])).toEqual([]); // las curvas no cruzan (spec § 6)
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/components/PatternEditor/trazos/__tests__/trazoPath.test.ts`
Expected: FAIL — `Cannot find module '../trazoPath'`.

- [ ] **Step 3: Implementar `trazoPath.ts`**

```ts
import type { PathCommand, Point2D } from '../../../types/types';
import { getAnchor } from '../nodeEditorUtils';
import { distToSegmentWithT } from '../../../utils/geometry/distance';

/**
 * Geometría pura de un trazo (línea de construcción, spec 2026-09-12 § 2).
 * El `path` va en coordenadas de patrón, sin `Z`; el tramo `k` es el que
 * llega al comando `k` (misma convención que `segmentPolar` y las internas).
 */

const copia = (c: PathCommand): PathCommand => ({ ...c, values: [...c.values] });

/** Anclas del trazo en orden (M, L, C, Q…). */
export function anclasDeTrazo(path: PathCommand[]): Point2D[] {
  const out: Point2D[] = [];
  for (const cmd of path) {
    const a = getAnchor(cmd);
    if (a) out.push(a);
  }
  return out;
}

/** Las dos puntas, o null si no llega a dos anclas. */
export function puntasDeTrazo(path: PathCommand[]): [Point2D, Point2D] | null {
  const a = anclasDeTrazo(path);
  return a.length >= 2 ? [a[0], a[a.length - 1]] : null;
}

/**
 * Quita el tramo que llega al comando `segmentIndex`. Devuelve [izquierda,
 * derecha]; un lado es null si le queda menos de dos anclas. Un índice que no
 * es tramo (0, o fuera) devuelve el trazo intacto.
 */
export function quitarTramo(
  path: PathCommand[],
  segmentIndex: number,
): [PathCommand[] | null, PathCommand[] | null] {
  if (segmentIndex < 1 || segmentIndex >= path.length) return [path, null];
  const izquierda = path.slice(0, segmentIndex).map(copia);
  const anclaK = getAnchor(path[segmentIndex]);
  const derecha = anclaK
    ? [{ type: 'M' as const, values: [anclaK.x, anclaK.y] }, ...path.slice(segmentIndex + 1).map(copia)]
    : null;
  return [
    anclasDeTrazo(izquierda).length >= 2 ? izquierda : null,
    derecha && anclasDeTrazo(derecha).length >= 2 ? derecha : null,
  ];
}

/**
 * Mueve una punta (0 = primera, 1 = última). Una llegada en curva arrastra su
 * manejador de llegada con el ancla — lo mismo que hace Seleccionar con las
 * puntas de una interna (`useEditorInteractions.ts`).
 */
export function moverPunta(path: PathCommand[], extremo: 0 | 1, a: Point2D): PathCommand[] {
  const nuevo = path.map(copia);
  if (extremo === 0) {
    nuevo[0].values[0] = a.x;
    nuevo[0].values[1] = a.y;
    return nuevo;
  }
  const last = nuevo[nuevo.length - 1];
  if (last.type === 'L' || last.type === 'M') {
    last.values[0] = a.x; last.values[1] = a.y;
  } else if (last.type === 'C') {
    const dx = a.x - last.values[4], dy = a.y - last.values[5];
    last.values[4] = a.x; last.values[5] = a.y;
    last.values[2] += dx; last.values[3] += dy;
  } else if (last.type === 'Q') {
    const dx = a.x - last.values[2], dy = a.y - last.values[3];
    last.values[2] = a.x; last.values[3] = a.y;
    last.values[0] += dx; last.values[1] += dy;
  }
  return nuevo;
}

/**
 * Tramo más cercano a `p` por la cuerda entre anclas (como `hitInternalLine`).
 * ponytail: una curva se mide por su cuerda; si hace falta afinar, aplanarla
 * con los seeds de `parseV2` sin el cierre implícito de `buildRing`.
 */
export function tramoMasCercano(
  path: PathCommand[],
  p: Point2D,
): { distance: number; segmentIndex: number; point: Point2D } | null {
  let mejor: { distance: number; segmentIndex: number; point: Point2D } | null = null;
  let prev: Point2D | null = null;
  path.forEach((cmd, i) => {
    const a = getAnchor(cmd);
    if (!a) return;
    if (cmd.type !== 'M' && prev) {
      const d = distToSegmentWithT(p.x, p.y, prev.x, prev.y, a.x, a.y);
      if (!mejor || d.distance < mejor.distance) mejor = { distance: d.distance, segmentIndex: i, point: d.point };
    }
    prev = a;
  });
  return mejor;
}

/** Cruce propio de dos segmentos rectos (ni paralelos ni tocándose en una punta). */
export function cruceDeRectas(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): Point2D | null {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

interface Recta { trazoId: string; i: number; a: Point2D; b: Point2D }

function rectasDe(trazos: ReadonlyArray<{ id: string; path: PathCommand[] }>): Recta[] {
  const out: Recta[] = [];
  for (const t of trazos) {
    let prev: Point2D | null = null;
    t.path.forEach((cmd, i) => {
      const a = getAnchor(cmd);
      if (!a) return;
      if (cmd.type === 'L' && prev) out.push({ trazoId: t.id, i, a: prev, b: a });
      prev = a;
    });
  }
  return out;
}

/**
 * Cruces entre tramos rectos: de trazos distintos, o del mismo trazo si no
 * son vecinos. Las curvas no entran (spec § 6).
 * ponytail: O(n²) sobre tramos rectos; con cientos de trazos sigue cabiendo
 * en el memo del índice, que se rehace por identidad de la lista.
 */
export function crucesDeTrazos(trazos: ReadonlyArray<{ id: string; path: PathCommand[] }>): Point2D[] {
  const rectas = rectasDe(trazos);
  const out: Point2D[] = [];
  for (let i = 0; i < rectas.length; i++) {
    for (let j = i + 1; j < rectas.length; j++) {
      const r = rectas[i], s = rectas[j];
      if (r.trazoId === s.trazoId && Math.abs(r.i - s.i) <= 1) continue;
      const p = cruceDeRectas(r.a, r.b, s.a, s.b);
      if (p) out.push(p);
    }
  }
  return out;
}
```

- [ ] **Step 4: Ver que pasan**

Run: `npx vitest run src/components/PatternEditor/trazos/__tests__/trazoPath.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/trazos && git commit -m "feat(2d): geometría pura de un trazo — puntas, quitar tramo, mover punta, cruces (#1158)"
```

---

### Task 2: El dato — tipos, `projectSlice`, deshacer

**Files:**
- Modify: `src/types/types.ts:135-147` (tras `ReferenceImage`), `:705` (`VinaProject.referenceImages?`)
- Modify: `src/store/projectSlice.ts:3` (import), `:218` (`ProjectState`), `:251` (`initialState`), `:351` (backfill), `:1024` (tras `updateReferenceImage`), `:1655+` (exports)
- Modify: `src/store/undoMiddleware.ts:319` (tras `'project/setInternalLine'`)
- Test: `src/store/__tests__/projectSlice.trazos.test.ts`

**Interfaces:**
- Consumes: `quitarTramo` (Task 1).
- Produces: `interface Trazo { id: string; path: PathCommand[]; createdAt: number }`, `interface TrazoSelection { trazoId: string; segmentIndex: number }`, `ProjectState.trazos: Trazo[]`, `VinaProject.trazos?: Trazo[]`, acciones `addTrazo(Trazo)`, `updateTrazo({ id, path })`, `removeTrazo(id)`, `removeTramoDeTrazo({ trazoId, segmentIndex })`.

- [ ] **Step 1: Tests (rojos)**

`src/store/__tests__/projectSlice.trazos.test.ts` (copia el `baseState` de `projectSlice.referenceImage.test.ts`, añadiendo `trazos: []`):

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, { addTrazo, updateTrazo, removeTrazo, removeTramoDeTrazo, restoreProject } from '../projectSlice';
import type { PathCommand, Trazo } from '../../types/types';

const L = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });
const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });

function baseState(overrides: Record<string, any> = {}) {
  return {
    id: 'test', name: 'Test', pieces: [] as any[], seams: [], fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
    avatarMode: 'model' as const, avatarModelUrl: null, isDirty: false,
    arrangementOverrides: {}, groups: [], seamGroups: [], poms: [] as any[],
    pleats: [], elastics: [], trims: [],
    referenceImages: [], trazos: [] as Trazo[],
    colorways: [], activeColorwayId: null,
    layerNames: {}, layerLocked: {},
    loadDiagnostics: [],
    loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
    ...overrides,
  };
}

const trazo = (id: string, path: PathCommand[]): Trazo => ({ id, path, createdAt: 1 });

describe('projectSlice — trazos (spec 2026-09-12 § 2)', () => {
  it('addTrazo lo guarda tal cual y ensucia el proyecto', () => {
    const s = reducer(baseState() as any, addTrazo(trazo('t1', [M(0, 0), L(10, 0)])));
    expect(s.trazos).toHaveLength(1);
    expect(s.trazos[0].path).toEqual([M(0, 0), L(10, 0)]);
    expect(s.isDirty).toBe(true);
  });

  it('updateTrazo reemplaza el path y removeTrazo lo quita', () => {
    let s = reducer(baseState() as any, addTrazo(trazo('t1', [M(0, 0), L(10, 0)])));
    s = reducer(s, updateTrazo({ id: 't1', path: [M(0, 0), L(20, 0)] }));
    expect(s.trazos[0].path[1].values).toEqual([20, 0]);
    s = reducer(s, removeTrazo('t1'));
    expect(s.trazos).toHaveLength(0);
  });

  it('removeTramoDeTrazo del medio deja dos trazos; el original conserva su id', () => {
    let s = reducer(baseState() as any, addTrazo(trazo('t1', [M(0, 0), L(100, 0), L(100, 100), L(0, 100)])));
    s = reducer(s, removeTramoDeTrazo({ trazoId: 't1', segmentIndex: 2 }));
    expect(s.trazos).toHaveLength(2);
    expect(s.trazos[0].id).toBe('t1');
    expect(s.trazos[0].path).toEqual([M(0, 0), L(100, 0)]);
    expect(s.trazos[1].id).not.toBe('t1');
    expect(s.trazos[1].path).toEqual([M(100, 100), L(0, 100)]);
  });

  it('removeTramoDeTrazo sobre un trazo de dos anclas lo borra entero', () => {
    let s = reducer(baseState() as any, addTrazo(trazo('t1', [M(0, 0), L(10, 0)])));
    s = reducer(s, removeTramoDeTrazo({ trazoId: 't1', segmentIndex: 1 }));
    expect(s.trazos).toHaveLength(0);
  });

  it('un proyecto viejo sin trazos carga con la lista vacía', () => {
    const viejo = { ...baseState() } as any;
    delete viejo.trazos;
    const s = reducer(baseState() as any, restoreProject(viejo));
    expect(s.trazos).toEqual([]);
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/store/__tests__/projectSlice.trazos.test.ts`
Expected: FAIL — `addTrazo` no exportado / `trazos` undefined.

- [ ] **Step 3: Tipos**

En `src/types/types.ts`, justo después de `ReferenceImage` (línea 147):

```ts
/**
 * Línea de construcción suelta en el lienzo (spec 2026-09-12 § 2). El `path`
 * va en coordenadas de patrón y nunca lleva `Z`; no tiene anfitriona,
 * posición ni rotación: está donde se dibujó, como una raya en el papel.
 */
export interface Trazo {
  id: string;
  path: PathCommand[];
  createdAt: number;
}

/** Selección de un trazo: siempre por tramo (contrato 08-09 § 5). `segmentIndex` es el comando de llegada. */
export interface TrazoSelection {
  trazoId: string;
  segmentIndex: number;
}
```

En `VinaProject` (línea 705), tras `referenceImages?: ReferenceImage[];`:

```ts
  trazos?: Trazo[];
```

- [ ] **Step 4: `projectSlice`**

Import (línea 3): añadir `Trazo` a la lista de `'../types/types'`. Añadir `import { quitarTramo } from '../components/PatternEditor/trazos/trazoPath';` — si el linter de capas (`npm run lint`) rechaza que el store importe de `components/`, mover `trazoPath.ts` a `src/utils/geometry/trazoPath.ts` y actualizar los imports de la Task 1 (el archivo es puro, no tiene React).

`ProjectState` (tras `referenceImages`, línea 218):

```ts
  /** Líneas de construcción sueltas en el lienzo (spec 2026-09-12). */
  trazos: Trazo[];
```

`initialState` (tras `referenceImages: [],`): `trazos: [],`

Backfill (tras la línea 351 `state.referenceImages = …`):

```ts
  // Trazos (spec 2026-09-12 § 2.3): un proyecto anterior no los tiene.
  state.trazos = (p as any).trazos ?? [];
```

Reducers, tras `updateReferenceImage` (línea 1024):

```ts
    // ─── Trazos: líneas de construcción (spec 2026-09-12) ───
    addTrazo(state, action: PayloadAction<Trazo>) {
      state.trazos.push(action.payload);
      state.isDirty = true;
    },
    updateTrazo(state, action: PayloadAction<{ id: string; path: PathCommand[] }>) {
      const trazo = state.trazos.find(t => t.id === action.payload.id);
      if (!trazo) return;
      trazo.path = action.payload.path;
      state.isDirty = true;
    },
    removeTrazo(state, action: PayloadAction<string>) {
      state.trazos = state.trazos.filter(t => t.id !== action.payload);
      state.isDirty = true;
    },
    /**
     * Supr sobre un tramo borra SOLO ese tramo (contrato 08-09 § 5). Del
     * medio quedan dos trazos: el original conserva su id a la izquierda y
     * la derecha nace con id nuevo. Con un solo nodo restante, se va.
     */
    removeTramoDeTrazo(state, action: PayloadAction<{ trazoId: string; segmentIndex: number }>) {
      const idx = state.trazos.findIndex(t => t.id === action.payload.trazoId);
      if (idx < 0) return;
      const trazo = state.trazos[idx];
      const [izquierda, derecha] = quitarTramo(trazo.path, action.payload.segmentIndex);
      const nuevos: Trazo[] = [];
      if (izquierda) nuevos.push({ ...trazo, path: izquierda });
      if (derecha) nuevos.push({ id: newId(), path: derecha, createdAt: Date.now() });
      state.trazos.splice(idx, 1, ...nuevos);
      state.isDirty = true;
    },
```

Exports (línea 1655+): añadir `addTrazo, updateTrazo, removeTrazo, removeTramoDeTrazo,` en la línea de `addInternalLine, …`.

Si `PathCommand` no estaba importado en `projectSlice.ts`, ya lo está (línea 3). `newId` también (se usa en la línea 1650).

- [ ] **Step 5: Etiquetas de deshacer**

`src/store/undoMiddleware.ts`, tras `'project/setInternalLine': 'Set Internal Line',`:

```ts
  'project/addTrazo': 'Trazo',
  'project/updateTrazo': 'Editar trazo',
  'project/removeTrazo': 'Borrar trazo',
  'project/removeTramoDeTrazo': 'Borrar tramo',
```

- [ ] **Step 6: Ver que pasan + typecheck**

Run: `npx vitest run src/store/__tests__/projectSlice.trazos.test.ts && npx tsc -b --noEmit`
Expected: PASS (5 tests); typecheck limpio. Si `tsc` se queja de mocks de `ProjectState` en otros tests (les falta `trazos`), añadir `trazos: []` a esos `baseState` — lista los archivos con `grep -rln "referenceImages: \[\]" src --include=*.test.ts*`.

- [ ] **Step 7: Commit**

```bash
git add src/types/types.ts src/store && git commit -m "feat(2d): Trazo en el proyecto — tipo, reducers, backfill y deshacer (#1158)"
```

---

### Task 3: Estado del editor, Supr y menú

**Files:**
- Modify: `src/types/types.ts` (`EditorState`, junto a `selectedInternalLine` ~línea 828)
- Modify: `src/store/editorSlice.ts:27-30` (estado), `:51-125` (selección), `:196` (toggles)
- Modify: `src/store/borradoDeSeleccion.ts:44-52`
- Modify: `src/hooks/useKeyboardShortcuts.ts:60`, `:88-105`
- Modify: `src/components/shell/LogoMenu.tsx:125`, `:157`
- Test: `src/store/__tests__/editorSlice.trazos.test.ts`, `src/store/__tests__/borradoDeSeleccion.test.ts` (añadir un caso; si no existe, crearlo con solo ese caso)

**Interfaces:**
- Produces: `EditorState.selectedTrazo: TrazoSelection | null`, `EditorState.showTrazos: boolean`; acciones `selectTrazo(TrazoSelection)`, `toggleTrazos()`; `resolverBorrado` acepta `selectedTrazo` y devuelve `{ kind: 'trazo'; trazoId; segmentIndex }`.

- [ ] **Step 1: Tests (rojos)**

`src/store/__tests__/editorSlice.trazos.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import reducer, { selectTrazo, selectPiece, selectInternalLine, clearSelection, toggleTrazos } from '../editorSlice';

const estado = () => reducer(undefined, { type: '@@init' });

describe('editorSlice — selección de trazo (spec 2026-09-12 § 5.2)', () => {
  it('nace sin trazo seleccionado y con la construcción visible', () => {
    const s = estado();
    expect(s.selectedTrazo).toBeNull();
    expect(s.showTrazos).toBe(true);
  });
  it('selectTrazo es excluyente con piezas e internas', () => {
    let s = reducer(estado(), selectPiece('p1'));
    s = reducer(s, selectTrazo({ trazoId: 't1', segmentIndex: 1 }));
    expect(s.selectedTrazo).toEqual({ trazoId: 't1', segmentIndex: 1 });
    expect(s.selectedPieceIds).toEqual([]);
    expect(s.selectedInternalLine).toBeNull();
  });
  it('seleccionar una pieza o una interna suelta el trazo; clearSelection también', () => {
    let s = reducer(estado(), selectTrazo({ trazoId: 't1', segmentIndex: 1 }));
    expect(reducer(s, selectPiece('p1')).selectedTrazo).toBeNull();
    expect(reducer(s, selectInternalLine({ pieceId: 'p1', lineId: 'l1' })).selectedTrazo).toBeNull();
    expect(reducer(s, clearSelection()).selectedTrazo).toBeNull();
  });
  it('apagar «Construcción» suelta la selección; encenderla no la devuelve', () => {
    let s = reducer(estado(), selectTrazo({ trazoId: 't1', segmentIndex: 1 }));
    s = reducer(s, toggleTrazos());
    expect(s.showTrazos).toBe(false);
    expect(s.selectedTrazo).toBeNull();
    s = reducer(s, toggleTrazos());
    expect(s.showTrazos).toBe(true);
    expect(s.selectedTrazo).toBeNull();
  });
});
```

Caso para `borradoDeSeleccion`:

```ts
import { describe, it, expect } from 'vitest';
import { resolverBorrado } from '../borradoDeSeleccion';

describe('resolverBorrado — trazo', () => {
  it('con un tramo de trazo seleccionado, el sujeto es ese tramo', () => {
    expect(resolverBorrado({
      activeTool: 'select', selectedPieceIds: [], selectedSeamId: null, selectedPOMId: null,
      selectedInternalLine: null, selectedTrazo: { trazoId: 't1', segmentIndex: 2 }, piezasBloqueadas: new Set(),
    })).toEqual({ kind: 'trazo', trazoId: 't1', segmentIndex: 2 });
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/store/__tests__/editorSlice.trazos.test.ts src/store/__tests__/borradoDeSeleccion.test.ts`
Expected: FAIL.

- [ ] **Step 3: `EditorState` y `editorSlice`**

En `src/types/types.ts`, junto a `selectedInternalLine: InternalLineSelection | null;` (línea 828):

```ts
  /** Tramo de trazo seleccionado (spec 2026-09-12 § 5.2). Excluyente con piezas e internas. */
  selectedTrazo: TrazoSelection | null;
  /** Interruptor «Construcción»: apagado, los trazos ni se pintan ni enganchan ni se seleccionan. */
  showTrazos: boolean;
```

En `src/store/editorSlice.ts`:

- `initialState`: añadir `selectedTrazo: null,` junto a `selectedInternalLine` y `showTrazos: true,` junto a `showLineLengths`.
- Importar `TrazoSelection` de `'../types/types'`.
- En `selectPiece`, `togglePieceSelection`, `clearSelection`, `selectAllPieces` y `selectInternalLine`: añadir `state.selectedTrazo = null;`.
- Nuevos reducers, tras `selectInternalLine`:

```ts
    /** Un trazo se selecciona por tramo y desplaza a todo lo demás (spec 2026-09-12 § 5.2). */
    selectTrazo(state, action: PayloadAction<TrazoSelection>) {
      state.selectedTrazo = action.payload;
      state.selectedPieceIds = [];
      state.selectedSeamId = null;
      state.selectedPOMId = null;
      state.selectedInternalLine = null;
      state.saSelection = null;
    },
```

y tras `toggleLineLengths`:

```ts
    toggleTrazos(state) {
      state.showTrazos = !state.showTrazos;
      // Lo oculto no se edita: apagar la construcción suelta el tramo vivo.
      if (!state.showTrazos) state.selectedTrazo = null;
    },
```

- Exportar `selectTrazo` y `toggleTrazos` en la lista de acciones del slice.

- [ ] **Step 4: `borradoDeSeleccion.ts`**

En `EstadoParaBorrado` añadir `selectedTrazo?: TrazoSelection | null;` (import del tipo). En `SujetoBorrable` añadir la variante `| { kind: 'trazo'; trazoId: string; segmentIndex: number }`. En `resolverBorrado`, justo antes de `if (e.selectedInternalLine)`:

```ts
  if (e.selectedTrazo) {
    return { kind: 'trazo', ...e.selectedTrazo };
  }
```

- [ ] **Step 5: Supr y menú**

`src/hooks/useKeyboardShortcuts.ts`: tras `const selectedInternalLine = useSelector(…)` añadir `const selectedTrazo = useSelector((s: RootState) => s.editor.selectedTrazo);`; pasarlo a `resolverBorrado({ …, selectedTrazo })`; añadir el caso al `switch`:

```ts
        case 'trazo':
          dispatch(removeTramoDeTrazo({ trazoId: sujeto.trazoId, segmentIndex: sujeto.segmentIndex }));
          dispatch(clearSelection());
          break;
```

(importar `removeTramoDeTrazo` de `'../store/projectSlice'`; añadir `selectedTrazo` al array de dependencias del `useEffect` donde ya está `selectedInternalLine`).

`src/components/shell/LogoMenu.tsx`: en el `switch` de Edición ▸ Eliminar (línea 125) el mismo `case 'trazo'` (y `selectedTrazo` en la llamada a `resolverBorrado`). En el menú Ver, tras `'Largos de línea'` (línea 157):

```ts
  { label: 'Construcción', action: (d) => d(toggleTrazos()), checked: (s) => s.editor.showTrazos },
```

- [ ] **Step 6: Ver que pasan + typecheck**

Run: `npx vitest run src/store/__tests__/editorSlice.trazos.test.ts src/store/__tests__/borradoDeSeleccion.test.ts && npx tsc -b --noEmit`
Expected: PASS; typecheck limpio (a los mocks de `EditorState` en tests que fallen por los dos campos nuevos se les añade `selectedTrazo: null, showTrazos: true`).

- [ ] **Step 7: Commit**

```bash
git add src/types/types.ts src/store src/hooks/useKeyboardShortcuts.ts src/components/shell/LogoMenu.tsx && git commit -m "feat(2d): selección de trazo por tramo, interruptor Construcción y Supr por tramo (#1158)"
```

---

### Task 4: El índice de enganche recibe los trazos

**Files:**
- Modify: `src/components/PatternEditor/snapIndex.ts:34-175`
- Test: `src/components/PatternEditor/__tests__/snapIndex.trazos.test.ts`

**Interfaces:**
- Consumes: `anclasDeTrazo`, `puntasDeTrazo`, `tramoMasCercano`, `crucesDeTrazos` (Task 1); `Trazo` (Task 2).
- Produces: `buildSnapIndex(pieces, trazos = SIN_TRAZOS)`; `SnapKind` += `'trazoEnd' | 'trazoCross'`; `SnapTarget.trazoId?: string`; `verticesVisibles(index)` incluye las anclas de los trazos.

- [ ] **Step 1: Tests (rojos)**

```ts
import { describe, it, expect } from 'vitest';
import { buildSnapIndex, resolveSnap, verticesVisibles } from '../snapIndex';
import type { PatternPiece, PathCommand, Trazo } from '../../../types/types';

const L = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });
const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });
const pieza = (id: string, x: number, y: number): PatternPiece => ({
  id, name: id, outline: [M(0, 0), L(100, 0), L(100, 100), L(0, 100), { type: 'Z', values: [] }],
  internals: [], position: { x, y }, rotation: 0, mirrored: false, seamAllowance: 0, createdAt: 1, updatedAt: 1,
} as PatternPiece);
const trazo = (id: string, path: PathCommand[]): Trazo => ({ id, path, createdAt: 1 });

describe('snapIndex — trazos (spec 2026-09-12 § 5.1)', () => {
  it('sin trazos, el índice es el de siempre', () => {
    const i = buildSnapIndex([pieza('p', 0, 0)]);
    expect(i.trazos).toEqual([]);
    expect(resolveSnap(i, { x: 100.5, y: 0 }, 2)?.kind).toBe('vertex');
  });

  it('las puntas enganchan como trazoEnd y las anclas interiores como vertex con trazoId', () => {
    const i = buildSnapIndex([], [trazo('t', [M(0, 0), L(50, 0), L(50, 50)])]);
    expect(resolveSnap(i, { x: 1, y: 0 }, 2)).toEqual({ kind: 'trazoEnd', pieceId: null, trazoId: 't', point: { x: 0, y: 0 } });
    expect(resolveSnap(i, { x: 50, y: 1 }, 2)).toEqual({ kind: 'vertex', pieceId: null, trazoId: 't', point: { x: 50, y: 0 } });
  });

  it('el recorrido de un trazo engancha como outline con trazoId, sin cierre fantasma', () => {
    const i = buildSnapIndex([], [trazo('t', [M(0, 0), L(100, 0), L(100, 100)])]);
    expect(resolveSnap(i, { x: 40, y: 3 }, 5)).toEqual({ kind: 'outline', pieceId: null, trazoId: 't', point: { x: 40, y: 0 } });
    // Entre (0,0) y (100,100) NO hay tramo: un anillo cerrado lo inventaría.
    expect(resolveSnap(i, { x: 50, y: 50 }, 5)).toBeNull();
  });

  it('el cruce de dos rectas engancha como trazoCross, por encima de las puntas', () => {
    const i = buildSnapIndex([], [trazo('a', [M(0, 5), L(10, 5)]), trazo('b', [M(5, 0), L(5, 10)])]);
    expect(resolveSnap(i, { x: 5.5, y: 5.5 }, 2)).toEqual({ kind: 'trazoCross', pieceId: null, point: { x: 5, y: 5 } });
  });

  it('un vértice de pieza gana a la punta de un trazo en el mismo sitio (spec § 5.2)', () => {
    const i = buildSnapIndex([pieza('p', 0, 0)], [trazo('t', [M(100, 0), L(200, 0)])]);
    const s = resolveSnap(i, { x: 100.5, y: 0.5 }, 2);
    expect(s?.kind).toBe('vertex');
    expect(s?.pieceId).toBe('p');
  });

  it('verticesVisibles incluye las anclas de los trazos, sin duplicar', () => {
    const i = buildSnapIndex([pieza('p', 0, 0)], [trazo('t', [M(100, 0), L(200, 0)])]);
    const v = verticesVisibles(i);
    expect(v).toContainEqual({ x: 200, y: 0 });
    expect(v.filter(q => q.x === 100 && q.y === 0)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/components/PatternEditor/__tests__/snapIndex.trazos.test.ts`
Expected: FAIL (`trazos` undefined; `resolveSnap` sin trazos).

- [ ] **Step 3: Implementar**

En `snapIndex.ts`:

```ts
import type { Trazo } from '../../types/types';
import { anclasDeTrazo, puntasDeTrazo, tramoMasCercano, crucesDeTrazos } from './trazos/trazoPath';

export type SnapKind = 'firstNode' | 'vertex' | 'trazoCross' | 'internalEnd' | 'trazoEnd' | 'outline';

export interface SnapTarget {
  kind: SnapKind;
  pieceId: string | null;
  /** El trazo que enganchó, cuando es uno (spec 2026-09-12 § 5.1). */
  trazoId?: string;
  /** Mundo (patrón). */
  point: Point2D;
}

export interface SnapIndex {
  pieces: PatternPiece[];
  nodesByPiece: Map<string, EditableNode[]>;
  endsByPiece: Map<string, Point2D[]>;
  ringsByPiece: Map<string, OutlineRing>;
  /** Trazos VISIBLES (ya filtrados por `showTrazos`). */
  trazos: Trazo[];
  /** Anclas interiores (sin las puntas) por trazo, en mundo. */
  interioresByTrazo: Map<string, Point2D[]>;
  /** Las dos puntas por trazo. */
  puntasByTrazo: Map<string, [Point2D, Point2D]>;
  /** Cruces entre tramos rectos de trazos. */
  cruces: Point2D[];
}

const SIN_TRAZOS: Trazo[] = [];

export function buildSnapIndex(pieces: PatternPiece[], trazos: Trazo[] = SIN_TRAZOS): SnapIndex {
  // … (el cuerpo actual para piezas, sin cambios) …
  const interioresByTrazo = new Map<string, Point2D[]>();
  const puntasByTrazo = new Map<string, [Point2D, Point2D]>();
  for (const t of trazos) {
    const anclas = anclasDeTrazo(t.path);
    if (anclas.length >= 2) interioresByTrazo.set(t.id, anclas.slice(1, -1));
    const puntas = puntasDeTrazo(t.path);
    if (puntas) puntasByTrazo.set(t.id, puntas);
  }
  return { pieces, nodesByPiece, endsByPiece, ringsByPiece, trazos, interioresByTrazo, puntasByTrazo, cruces: crucesDeTrazos(trazos) };
}
```

`resolveSnap`, en este orden (spec § 5.1: vértice → cruce → extremo → recorrido; dentro de cada clase, primero las piezas):

```ts
  // 1. vértices de pieza (bucle actual, sin cambios)
  // 2. anclas interiores de trazo
  for (let i = index.trazos.length - 1; i >= 0; i--) {
    const t = index.trazos[i];
    for (const a of index.interioresByTrazo.get(t.id) ?? []) {
      if (dist(world, a) <= radius) return { kind: 'vertex', pieceId: null, trazoId: t.id, point: a };
    }
  }
  // 3. cruces
  for (const c of index.cruces) {
    if (dist(world, c) <= radius) return { kind: 'trazoCross', pieceId: null, point: c };
  }
  // 4. extremos de internas (bucle actual) …
  // 5. puntas de trazo
  for (let i = index.trazos.length - 1; i >= 0; i--) {
    const t = index.trazos[i];
    for (const p of index.puntasByTrazo.get(t.id) ?? []) {
      if (dist(world, p) <= radius) return { kind: 'trazoEnd', pieceId: null, trazoId: t.id, point: p };
    }
  }
  // 6. contorno de pieza (bucle actual) …
  // 7. recorrido de trazo — por la cuerda, sin `buildRing`: ese cierra todo
  //    subpath aunque no tenga Z (`outlineRing.ts:361`) e inventaría un tramo.
  for (let i = index.trazos.length - 1; i >= 0; i--) {
    const t = index.trazos[i];
    const hit = tramoMasCercano(t.path, world);
    if (hit && hit.distance <= radius) return { kind: 'outline', pieceId: null, trazoId: t.id, point: hit.point };
  }
  return null;
```

`verticesVisibles`: tras el bucle de piezas, añadir las anclas de cada trazo con el mismo dedupe por clave `${round(x·1e4)}|${round(y·1e4)}`:

```ts
  for (const t of index.trazos) {
    for (const q of anclasDeTrazo(t.path)) {
      const k = `${Math.round(q.x * 1e4)}|${Math.round(q.y * 1e4)}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      puntos.push(q);
    }
  }
```

- [ ] **Step 4: Ver que pasan, y que los tests viejos del índice siguen verdes**

Run: `npx vitest run src/components/PatternEditor/__tests__/snapIndex.trazos.test.ts src/components/PatternEditor/__tests__/1068-measure-snap-pieza-girada.test.ts src/components/PatternEditor/__tests__/usePolyPenTool.test.tsx && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/snapIndex.ts src/components/PatternEditor/__tests__/snapIndex.trazos.test.ts && git commit -m "feat(2d): el índice de enganche lee los trazos — puntas, cruces, anclas y recorrido (#1158)"
```

---

### Task 5: La Pluma reparte — cerrado es pieza, abierto es trazo

**Files:**
- Modify: `src/components/PatternEditor/usePenTool.ts:66-80` (firma), `:98` (índice), `:167-181` (`complete`), `:263-267` (`reset`), `:271-280` (doble clic), `:337-356` (`handleKeyDown`)
- Modify: `src/components/PatternEditor/renderers/HintText.tsx:73-75`
- Test: `src/components/PatternEditor/__tests__/usePenTool.test.ts` (nuevo `describe` + ajuste de las aserciones existentes sobre `onComplete`)

**Interfaces:**
- Consumes: `buildSnapIndex(pieces, trazos)` (Task 4).
- Produces: `export type PenVia = 'close' | 'enter' | 'dblclick' | 'esc' | 'toolChange'`; `export type PenResult = { kind: 'pieza'; piece: Omit<PatternPiece, 'id' | 'createdAt' | 'updatedAt'> } | { kind: 'trazo'; path: PathCommand[] }`; `usePenTool(zoom, pan, onComplete: (r: PenResult) => void, pieces = VACIO, trazos = SIN_TRAZOS)`. Bitácora: `pen:complete { kind, nodes, via }`.

- [ ] **Step 1: Tests (rojos)** — añadir al final de `usePenTool.test.ts`:

```ts
/**
 * Spec 2026-09-12 § 3: cerrado → pieza; abierto → trazo. Esc y el cambio de
 * herramienta TERMINAN el trazo (Illustrator/Figma), nunca lo tiran.
 */
describe('usePenTool — cerrado es pieza, abierto es trazo', () => {
  const key = (k: string) => new KeyboardEvent('keydown', { key: k });
  function setup() {
    const onComplete = vi.fn();
    const hook = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete));
    const click = (x: number, y: number) => {
      act(() => hook.result.current.handleMouseDown(clickAt(x, y)));
      act(() => hook.result.current.handleMouseUp());
    };
    return { onComplete, hook, click };
  }

  it('Enter con dos nodos → trazo abierto, sin Z', () => {
    const { onComplete, hook, click } = setup();
    click(0, 0); click(100, 0);
    act(() => { hook.result.current.handleKeyDown(key('Enter')); });
    expect(onComplete).toHaveBeenCalledWith({ kind: 'trazo', path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }] });
    expect(hook.result.current.nodes).toHaveLength(0);
  });

  it('Enter con tres nodos → pieza cerrada (D4 del 09-09 se conserva)', () => {
    const { onComplete, click, hook } = setup();
    click(0, 0); click(100, 0); click(100, 100);
    act(() => { hook.result.current.handleKeyDown(key('Enter')); });
    const r = onComplete.mock.calls[0][0];
    expect(r.kind).toBe('pieza');
    expect(r.piece.outline.at(-1)).toEqual({ type: 'Z', values: [] });
  });

  it('Esc con tres nodos → trazo; con uno → nada; con el chip abierto solo cierra el chip', () => {
    const { onComplete, click, hook } = setup();
    click(0, 0); click(100, 0); click(100, 100);
    act(() => { hook.result.current.openNextPoint(); });
    expect(hook.result.current.nextPoint).not.toBeNull();
    act(() => { hook.result.current.handleKeyDown(key('Escape')); });
    expect(hook.result.current.nextPoint).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();        // el primer Esc solo soltó el chip
    act(() => { hook.result.current.handleKeyDown(key('Escape')); });
    expect(onComplete).toHaveBeenCalledWith({ kind: 'trazo', path: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] },
    ] });

    const solo = setup();
    solo.click(5, 5);
    act(() => { solo.hook.result.current.handleKeyDown(key('Escape')); });
    expect(solo.onComplete).not.toHaveBeenCalled();
    expect(solo.hook.result.current.nodes).toHaveLength(0);
  });

  it('reset (cambio de herramienta) con dos nodos termina el trazo; con uno lo suelta', () => {
    const { onComplete, click, hook } = setup();
    click(0, 0); click(50, 0);
    act(() => hook.result.current.reset());
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ kind: 'trazo' }));
  });

  it('la bitácora dice qué terminó y por dónde', () => {
    clearJournal();
    const { click, hook } = setup();
    click(0, 0); click(100, 0);
    act(() => { hook.result.current.handleKeyDown(key('Escape')); });
    const fin = getJournal().events.find((e) => e.name === 'pen:complete');
    expect(fin?.data).toEqual({ kind: 'trazo', nodes: 2, via: 'esc' });
  });
});
```

Y en los tests existentes del archivo que afirman `onComplete` con la forma de pieza (busca `toHaveBeenCalledWith(` y `mock.calls[0][0]` sobre `onComplete`): la pieza pasa a viajar dentro de `{ kind: 'pieza', piece }`. Ajusta cada aserción a `expect(onComplete.mock.calls[0][0]).toEqual({ kind: 'pieza', piece: expect.objectContaining({ … }) })` conservando lo que ya comprobaban. El test `usePenTool reset — clears in-progress nodes` usa **un** nodo y sigue valiendo tal cual.

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/components/PatternEditor/__tests__/usePenTool.test.ts`
Expected: FAIL (los nuevos y los ajustados).

- [ ] **Step 3: Implementar**

Tipos y firma (`usePenTool.ts`, tras `NextPointState`):

```ts
/** Por dónde terminó el trazo, para la bitácora (spec 2026-09-12 § 3.4). */
export type PenVia = 'close' | 'enter' | 'dblclick' | 'esc' | 'toolChange';

/** Lo que la Pluma entrega al terminar: cerrado es pieza, abierto es trazo (spec 2026-09-12 § 3.1). */
export type PenResult =
  | { kind: 'pieza'; piece: Omit<PatternPiece, 'id' | 'createdAt' | 'updatedAt'> }
  | { kind: 'trazo'; path: PathCommand[] };

const SIN_TRAZOS: Trazo[] = [];

export function usePenTool(
  zoom: number,
  pan: Point2D,
  onComplete: (resultado: PenResult) => void,
  pieces: PatternPiece[] = VACIO,
  /** Trazos VISIBLES: enganchan igual que las piezas (spec 2026-09-12 § 5.1). */
  trazos: Trazo[] = SIN_TRAZOS,
) {
```

(importar `Trazo` de `'../../types/types'`). Índice: `const indice = useMemo(() => buildSnapIndex(pieces, trazos), [pieces, trazos]);`

`complete`:

```ts
  const complete = useCallback((nodes: PenNode[], closed: boolean, via: PenVia) => {
    const commands = nodesToCommands(nodes, closed);
    pushJournal('gesture', 'pen:complete', { kind: closed ? 'pieza' : 'trazo', nodes: nodes.length, via });
    if (closed) {
      onComplete({ kind: 'pieza', piece: { name: `Piece ${Date.now().toString(36)}`, outline: commands, ...draftedPieceDefaults() } });
    } else {
      // Abierto nunca es pieza: es una raya de construcción (spec § 3.1).
      onComplete({ kind: 'trazo', path: commands });
    }
    pressRef.current = null;
    setHover(null);
    setState(EMPTY);
  }, [nodesToCommands, onComplete]);
```

Llamadas: en `handleMouseDown` (cierre sobre el primer punto) `complete(nodes, true, 'close')`; en `handleDoubleClick` `complete(nodes, nodes.length >= 3, 'dblclick')`; en `handleKeyDown` Enter `complete(nodes, nodes.length >= 3, 'enter')`.

`reset` (cambio de herramienta y `pointercancel`):

```ts
  /** Salir de la Pluma no tira lo dibujado: con dos o más nodos queda un trazo (spec § 3.2). */
  const reset = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length >= 2) { complete(nodes, false, 'toolChange'); return; }
    setHover(null);
    pressRef.current = null;
    setState(EMPTY);
  }, [complete]);
```

(`reset` tiene que declararse DESPUÉS de `complete`; mover el bloque si hace falta.)

`handleKeyDown`, caso Escape:

```ts
      case 'Escape':
        // Escalera (#1129): con el tramo congelado, Escape lo SUELTA y el
        // trazo sigue vivo. El chip en edición gestiona sus propios Esc antes
        // de que la tecla llegue aquí.
        if (nextPointRef.current) { closeNextPoint(); return true; }
        if (nodes.length === 0) return false;
        // Spec 2026-09-12 § 3.2: Esc TERMINA el trazo (Illustrator/Figma). Con
        // un solo nodo no hay trazo que dejar. Lo que no se quería, Ctrl+Z.
        if (nodes.length >= 2) { complete(nodes, false, 'esc'); return true; }
        setState(EMPTY);
        return true;
```

`HintText.tsx` línea 74:

```tsx
        <Pie>Clic añade · arrastra para curvar · Tab escribe largo y ángulo · clic en el primer punto cierra · Enter o doble clic cierra la pieza · Esc deja el trazo · Retroceso quita el último</Pie>
```

- [ ] **Step 4: Ver que pasan + typecheck**

Run: `npx vitest run src/components/PatternEditor/__tests__/usePenTool.test.ts && npx tsc -b --noEmit`
Expected: PASS. `tsc` señalará `PatternEditor.tsx:221` (`handlePieceComplete` ya no encaja con `onComplete`): se arregla en la Task 6 — para que este commit compile, cablea ya en `PatternEditor.tsx` el `handlePenComplete` de la Task 6 Step 3 (solo ese bloque).

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/usePenTool.ts src/components/PatternEditor/__tests__/usePenTool.test.ts src/components/PatternEditor/renderers/HintText.tsx src/components/PatternEditor/PatternEditor.tsx && git commit -m "feat(2d): la Pluma reparte — cerrado es pieza, abierto es trazo; Esc termina, no tira (#1158, #1161)"
```

---

### Task 6: Pintar los trazos, el interruptor y el cableado del editor

**Files:**
- Create: `src/components/PatternEditor/renderers/TrazosLayer.tsx`
- Modify: `src/components/PatternEditor/FilaDeCapas.tsx:3-25`
- Modify: `src/components/PatternEditor/PatternEditor.tsx:186-221` (handlers y `usePenTool`), `:368` (`useMeasureTool`), `:433-438` (`usePolyPenTool`), `:1278` (montaje, antes de `<CotaLines`)
- Modify: `src/components/PatternEditor/usePolyPenTool.ts:40-48` (`InternalLineToolOptions.trazos`), `:102`
- Modify: `src/components/PatternEditor/useMeasureTool.ts:165-170`
- Test: `src/components/PatternEditor/renderers/__tests__/TrazosLayer.test.tsx`, `src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx` (si ya existe uno de la fila, añadir el caso ahí)

**Interfaces:**
- Consumes: `PenResult` (Task 5), `addTrazo` (Task 2), `showTrazos` / `selectedTrazo` / `toggleTrazos` (Task 3), `buildSnapIndex(pieces, trazos)` (Task 4), `puntasDeTrazo` / `anclasDeTrazo` (Task 1).
- Produces: `<TrazosLayer trazos seleccion zoom2D />`; en `PatternEditor`: `trazosVisibles: Trazo[]`, `handlePenComplete(r: PenResult)`.

- [ ] **Step 1: Tests (rojos)**

`src/components/PatternEditor/renderers/__tests__/TrazosLayer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import TrazosLayer from '../TrazosLayer';
import type { Trazo } from '../../../../types/types';

afterEach(cleanup);
const t = (id: string): Trazo => ({ id, createdAt: 1, path: [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] },
] });

describe('TrazosLayer (spec 2026-09-12 § 4)', () => {
  it('pinta cada trazo con la tinta de referencia y sus dos puntas, sin color literal', () => {
    const { container } = render(<svg><TrazosLayer trazos={[t('a')]} seleccion={null} zoom2D={1} /></svg>);
    const path = container.querySelector('[data-trazo-id="a"] path')!;
    expect(path.getAttribute('stroke')).toBe('var(--ink-on-light-3)');
    expect(path.getAttribute('fill')).toBe('none');
    expect(container.querySelectorAll('[data-trazo-id="a"] [data-anchor-role]')).toHaveLength(2);
  });
  it('con un tramo seleccionado resalta solo ese tramo en acento y enseña todas las anclas', () => {
    const { container } = render(<svg><TrazosLayer trazos={[t('a')]} seleccion={{ trazoId: 'a', segmentIndex: 2 }} zoom2D={1} /></svg>);
    const sel = container.querySelector('.trazo__tramo--seleccionado')!;
    expect(sel.getAttribute('stroke')).toBe('var(--accent-2d)');
    expect(sel.getAttribute('d')).toBe('M100,0 L100,100');
    expect(container.querySelectorAll('[data-trazo-id="a"] [data-anchor-role]')).toHaveLength(3);
  });
  it('sin trazos no pinta nada', () => {
    const { container } = render(<svg><TrazosLayer trazos={[]} seleccion={null} zoom2D={1} /></svg>);
    expect(container.querySelector('.trazos')).toBeNull();
  });
});
```

Si `AnchorGlyph` no expone `data-anchor-role`, en el test usar el selector que sí exponga (léelo en `AnchorGlyph.tsx`) y ajustar `TrazosLayer` para que cada glifo sea localizable por rol.

Caso para la fila de capas (`src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx`):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import FilaDeCapas from '../FilaDeCapas';

afterEach(cleanup);

describe('FilaDeCapas — Construcción', () => {
  it('el sexto interruptor es «Construcción», nace encendido y apaga showTrazos', () => {
    const { getByRole } = render(<Provider store={store}><FilaDeCapas /></Provider>);
    const boton = getByRole('button', { name: 'Construcción' });
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(boton);
    expect(store.getState().editor.showTrazos).toBe(false);
  });
});
```

(Si `../../../store` exporta la store con otro nombre, usa el que use `CotasLayer.test.tsx`.)

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/TrazosLayer.test.tsx src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `TrazosLayer.tsx`**

```tsx
import { memo } from 'react';
import type { Trazo, TrazoSelection } from '../../../types/types';
import { pathToSVG } from '../utils';
import { getAnchor } from '../nodeEditorUtils';
import { anclasDeTrazo, puntasDeTrazo } from '../trazos/trazoPath';
import AnchorGlyph from './AnchorGlyph';

/**
 * Las líneas de construcción (spec 2026-09-12 § 4): tinta de referencia —la
 * misma que `internalLineColor` da a una interna `'reference'`—, puntas
 * siempre a la vista (lo que el imán encuentra se ve, #1157), tramo
 * seleccionado en acento, y las anclas interiores solo con el trazo
 * seleccionado. Se monta encima de las piezas y debajo de las cotas.
 *
 * Sin hover a propósito: las internas tampoco lo tienen en Seleccionar.
 */
interface TrazosLayerProps {
  trazos: readonly Trazo[];
  seleccion: TrazoSelection | null;
  zoom2D: number;
}

function TrazosLayer({ trazos, seleccion, zoom2D }: TrazosLayerProps) {
  if (trazos.length === 0) return null;
  const guion = `${4 / zoom2D} ${4 / zoom2D}`;
  return (
    <g className="trazos" data-trazos={trazos.length}>
      {trazos.map((trazo) => {
        const tramo = seleccion?.trazoId === trazo.id ? seleccion.segmentIndex : null;
        const cmd = tramo !== null ? trazo.path[tramo] : undefined;
        const inicio = tramo !== null ? getAnchor(trazo.path[tramo - 1]) : null;
        const tramoD = cmd && inicio && (cmd.type === 'L' || cmd.type === 'C' || cmd.type === 'Q')
          ? pathToSVG([{ type: 'M', values: [inicio.x, inicio.y] }, cmd])
          : null;
        const puntos = tramo !== null ? anclasDeTrazo(trazo.path) : (puntasDeTrazo(trazo.path) ?? []);
        return (
          <g key={trazo.id} className="trazo" data-trazo-id={trazo.id}>
            <path
              d={pathToSVG(trazo.path)}
              fill="none"
              stroke="var(--ink-on-light-3)"
              strokeWidth={1 / zoom2D}
              strokeDasharray={guion}
              pointerEvents="none"
            />
            {tramoD && (
              <path
                className="trazo__tramo--seleccionado"
                d={tramoD}
                fill="none"
                stroke="var(--accent-2d)"
                strokeWidth={2 / zoom2D}
                pointerEvents="none"
              />
            )}
            {puntos.map((p, i) => (
              <AnchorGlyph key={i} role="lineEnd" position={p} zoom2D={zoom2D} state={tramo !== null ? 'selected' : 'idle'} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

export default memo(TrazosLayer);
```

Comprueba con `grep -n "pathToSVG" src/components/PatternEditor/utils*` que la ruta de import es la misma que usa `PieceRenderer.tsx:7`.

- [ ] **Step 4: `FilaDeCapas.tsx`**

Importar `toggleTrazos`; añadir a `CAPAS` la sexta entrada `{ label: 'Construcción', flag: 'showTrazos', action: toggleTrazos }` y a `selectCapasVisibles` `showTrazos: state.editor.showTrazos`.

- [ ] **Step 5: Cableado en `PatternEditor.tsx`**

Imports: `import TrazosLayer from './renderers/TrazosLayer';`, `import { addTrazo, updateTrazo } from '../../store/projectSlice';` (añadir a la línea existente), `import type { PenResult } from './usePenTool';`, `import type { Trazo } from '../../types/types';`.

Junto a `handlePieceComplete` (línea 186):

```ts
  const SIN_TRAZOS = useMemo<Trazo[]>(() => [], []);
  const trazos = useSelector((s: RootState) => s.project.trazos);
  const showTrazos = useSelector((s: RootState) => s.editor.showTrazos);
  // Lo oculto no engancha ni se pinta: la lista vacía tiene identidad estable
  // para que el índice de enganche no se rehaga por render.
  const trazosVisibles = useMemo(() => (showTrazos ? trazos : SIN_TRAZOS), [showTrazos, trazos, SIN_TRAZOS]);

  /** La Pluma reparte (spec 2026-09-12 § 3.1). Un trazo terminado NO queda seleccionado (#1154). */
  const handlePenComplete = useCallback((r: PenResult) => {
    if (r.kind === 'pieza') { handlePieceComplete(r.piece); return; }
    dispatch(addTrazo({ id: newId(), path: r.path, createdAt: Date.now() }));
  }, [dispatch, handlePieceComplete]);
```

Línea 221: `const pen = usePenTool(zoom2D, pan2D, handlePenComplete, drawablePieces, trazosVisibles);`
Línea 368: `const measureTool = useMeasureTool(zoom2D, pan2D, drawablePieces, trazosVisibles);`
Líneas 433-438: añadir `trazos: trazosVisibles,` a las opciones de `usePolyPenTool`.

Montaje: justo antes de `<CotaLines cotas={sujeto.cotas} zoom2D={zoom2D} />` (línea 1278):

```tsx
          <TrazosLayer trazos={trazosVisibles} seleccion={editor.selectedTrazo} zoom2D={zoom2D} />
```

- [ ] **Step 6: `usePolyPenTool.ts` y `useMeasureTool.ts`**

`InternalLineToolOptions`: añadir `/** Trazos VISIBLES: enganchan como las piezas. */ trazos?: Trazo[];`. Línea 102: `const { pieces, trazos = SIN_TRAZOS } = opts;` con `const SIN_TRAZOS: Trazo[] = [];` a nivel de módulo, y `buildSnapIndex(pieces, trazos)` con `[pieces, trazos]` en el memo.

`useMeasureTool(zoom, pan, visiblePieces?, trazos: Trazo[] = SIN_TRAZOS)`: `buildSnapIndex(snapPieces, trazos)` con `[snapPieces, trazos]`.

- [ ] **Step 7: Ver que pasan + gates rápidos**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/TrazosLayer.test.tsx src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx src/components/PatternEditor/__tests__/usePolyPenTool.test.tsx && npx tsc -b --noEmit && npm run lint && node scripts/ui-contract-lint.mjs`
Expected: PASS; typecheck limpio; lint 0 errores; el trinquete no sube ningún contador.

- [ ] **Step 8: Commit**

```bash
git add src/components/PatternEditor && git commit -m "feat(2d): los trazos se pintan, enganchan y se apagan con «Construcción» (#1158)"
```

---

### Task 7: El chip de cota de un tramo de trazo

**Files:**
- Modify: `src/components/PatternEditor/cotas/cotas.ts:18-44` (`CotaUpdate`), `:257-330` (extraer `cotasDeTramos`), nueva `cotasDeTrazo`
- Modify: `src/components/PatternEditor/cotas/sujeto.ts:14-45` (input), `:228` (rama)
- Modify: `src/components/PatternEditor/PatternEditor.tsx:812-817` (input del sujeto), `:947-953` (`aplicarCota`)
- Test: `src/components/PatternEditor/cotas/__tests__/cotasDeTrazo.test.ts`, `src/components/PatternEditor/cotas/__tests__/sujeto.trazo.test.ts`

**Interfaces:**
- Consumes: `Trazo`, `TrazoSelection` (Task 2), `updateTrazo` (Task 2).
- Produces: `CotaUpdate` += `{ kind: 'trazo'; trazoId: string; path: PathCommand[] }`; `cotasDeTrazo(trazo: Trazo, segmentIndex: number): Cota[]`; `SujetoInput.trazos?: readonly Trazo[]`, `SujetoInput.selectedTrazo?: TrazoSelection | null`.

- [ ] **Step 1: Tests (rojos)**

`cotasDeTrazo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cotasDeTrazo } from '../cotas';
import type { Trazo } from '../../../../types/types';

const trazo: Trazo = { id: 't', createdAt: 1, path: [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 50] },
] };

describe('cotasDeTrazo (spec 2026-09-12 § 5.3)', () => {
  it('un tramo da largo y ángulo, en patrón, y escribir el largo mueve solo su nodo final', () => {
    const cotas = cotasDeTrazo(trazo, 2);
    expect(cotas.map(c => c.kind)).toEqual(['tramo-largo', 'tramo-angulo']);
    expect(cotas[0].valueMm).toBe(50);
    expect(cotas[1].valueMm).toBe(-90); // hacia abajo en pantalla = −90° (convención 29-08)
    const u = cotas[0].apply(80);
    expect(u).toEqual({ kind: 'trazo', trazoId: 't', path: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 80] },
    ] });
  });
  it('un índice que no es tramo no da cotas', () => {
    expect(cotasDeTrazo(trazo, 0)).toEqual([]);
    expect(cotasDeTrazo(trazo, 7)).toEqual([]);
  });
});
```

`sujeto.trazo.test.ts` (copia el `input` mínimo de un test vecino de `sujeto`, p. ej. el que cubre `selectedInternalLine`, y añade):

```ts
it('con un tramo de trazo seleccionado, el sujeto son sus dos cotas y la tira lo dice', () => {
  const s = cotasDelSujeto({ ...base, activeTool: 'select', trazos: [trazo], selectedTrazo: { trazoId: 't', segmentIndex: 2 } }, defaultRect);
  expect(s.piece).toBeNull();
  expect(s.cotas.map(c => c.kind)).toEqual(['tramo-largo', 'tramo-angulo']);
  expect(s.lineaDeSujeto).toBe('Editando: el tramo seleccionado');
  expect(s.disabled).toBe(false);
});
it('arrastrando, o con la construcción oculta, no hay sujeto de trazo', () => {
  expect(cotasDelSujeto({ ...base, trazos: [trazo], selectedTrazo: { trazoId: 't', segmentIndex: 2 }, isDragging: true }, defaultRect).cotas).toEqual([]);
  expect(cotasDelSujeto({ ...base, trazos: [], selectedTrazo: { trazoId: 't', segmentIndex: 2 } }, defaultRect).cotas).toEqual([]);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/components/PatternEditor/cotas/__tests__/cotasDeTrazo.test.ts src/components/PatternEditor/cotas/__tests__/sujeto.trazo.test.ts`
Expected: FAIL.

- [ ] **Step 3: `cotas.ts` — extraer el bucle por tramo y añadir `cotasDeTrazo`**

`CotaUpdate`: añadir `| { kind: 'trazo'; trazoId: string; path: PathCommand[] }`.

Extraer de `cotasDeLineaInterna` (líneas 269-330) una función a nivel de módulo:

```ts
/**
 * Las dos cotas (largo · ángulo) de cada tramo `L` de un path. `aPatron` y
 * `aLocal` convierten entre el marco del path y el de pantalla: para una
 * interna son las de la pieza; para un trazo, la identidad (ya está en mundo).
 */
function cotasDeTramos(opts: {
  path: PathCommand[];
  idBase: string;
  centro: Point2D;
  aPatron: (p: Point2D) => Point2D;
  aLocal: (p: Point2D) => Point2D;
  escribir: (path: PathCommand[]) => CotaUpdate | null;
  segmentIndex?: number;
}): Cota[] {
  const { path, idBase, centro, aPatron, aLocal, escribir, segmentIndex } = opts;
  const cotas: Cota[] = [];
  for (const segment of segmentPolar(path)) {
    if (segmentIndex !== undefined && segment.toCommandIndex !== segmentIndex) continue;
    const from = aPatron(segment.from);
    const to = aPatron(segment.to);
    const outward = normalHaciaFuera(from, to, centro);
    const anguloPatron = polarOf(from, to).angleDeg;
    const grupo = `${idBase}-tramo-${segment.toCommandIndex}`;
    cotas.push({
      id: `${grupo}-largo`, grupo, kind: 'tramo-largo', label: 'Largo', valueMm: segment.lengthMm, unit: 'mm',
      min: 0.1, max: 99999, primary: true, a: from, b: to, outward,
      apply: (mm) => {
        const nuevo = copiaConNodoFinal(path, segment.toCommandIndex, segment.writeLength(mm));
        return nuevo ? escribir(nuevo) : null;
      },
    });
    cotas.push({
      id: `${grupo}-angulo`, grupo, kind: 'tramo-angulo', label: 'Ángulo', valueMm: anguloPatron, unit: 'deg',
      min: -180, max: 180, primary: true, a: from, b: to, outward,
      apply: (deg) => {
        const nuevo = copiaConNodoFinal(path, segment.toCommandIndex, aLocal(polarPoint(from, segment.lengthMm, deg)));
        return nuevo ? escribir(nuevo) : null;
      },
    });
  }
  return cotas;
}
```

`cotasDeLineaInterna` pasa a: el mismo guard de `notch`/`dart`, el mismo `centro`, y luego

```ts
  const cotas = cotasDeTramos({
    path: line.path, idBase: `${piece.id}-${line.id}`, centro,
    aPatron: (p) => pieceLocalToPattern(p, piece),
    aLocal: (p) => patternToPieceLocal(p, piece),
    escribir: (path) => ({ kind: 'internal', pieceId: piece.id, lineId: line.id, path }),
    segmentIndex,
  });
```

seguido del bloque de cotas de borde que ya tenía (sin cambios). Los ids y grupos quedan idénticos a los de antes (`cotas.test.ts` lo vigila).

Nueva:

```ts
/** Las cotas de un tramo de trazo (spec 2026-09-12 § 5.3): el path ya está en patrón. */
export function cotasDeTrazo(trazo: Trazo, segmentIndex: number): Cota[] {
  const anclas = trazo.path.map(getAnchor).filter((a): a is Point2D => a !== null);
  if (anclas.length < 2) return [];
  const centro = { x: anclas.reduce((s, a) => s + a.x, 0) / anclas.length, y: anclas.reduce((s, a) => s + a.y, 0) / anclas.length };
  const identidad = (p: Point2D) => p;
  return cotasDeTramos({
    path: trazo.path, idBase: `trazo-${trazo.id}`, centro, aPatron: identidad, aLocal: identidad,
    escribir: (path) => ({ kind: 'trazo', trazoId: trazo.id, path }),
    segmentIndex,
  });
}
```

(importar `Trazo` del tipo).

- [ ] **Step 4: `sujeto.ts`**

`SujetoInput`: añadir `trazos?: readonly Trazo[];` y `selectedTrazo?: TrazoSelection | null;` (imports). Antes de `if (input.selectedInternalLine) {` (línea 228):

```ts
  if (input.selectedTrazo) {
    if (input.isDragging || input.contextMenuOpen || input.calibrationActive) return nada(lineaRect);
    const trazo = input.trazos?.find(t => t.id === input.selectedTrazo!.trazoId) ?? null;
    // Oculto (`trazos` ya viene filtrado) o borrado por deshacer: sin sujeto.
    if (trazo) {
      return {
        piece: null, caliente: false,
        cotas: cotasDeTrazo(trazo, input.selectedTrazo.segmentIndex),
        lectura: null, lecturaApagada: false, bordeLeido: null, disabled: false,
        lineaDeSujeto: 'Editando: el tramo seleccionado',
      };
    }
  }
```

- [ ] **Step 5: `PatternEditor.tsx`**

Input del sujeto (línea 812): añadir `trazos: trazosVisibles, selectedTrazo: editor.selectedTrazo,` y los dos al array de dependencias del `useMemo`.

`aplicarCota` (antes del `else` final que aplica `'internal'`):

```ts
    } else if (update.kind === 'trazo') {
      if (!trazos.some(t => t.id === update.trazoId)) return;
      const accion = updateTrazo({ id: update.trazoId, path: update.path });
      dispatch(token ? withUndoBatchToken(accion, token) : accion);
```

y `trazos` en las dependencias del `useCallback`.

- [ ] **Step 6: Ver que pasan (y las cotas viejas)**

Run: `npx vitest run src/components/PatternEditor/cotas && npx tsc -b --noEmit`
Expected: PASS entero (la carpeta `cotas` tiene los tests de internas que vigilan la extracción).

- [ ] **Step 7: Commit**

```bash
git add src/components/PatternEditor/cotas src/components/PatternEditor/PatternEditor.tsx && git commit -m "feat(2d): el tramo de un trazo tiene su chip de largo y ángulo, el mismo de las internas (#1158)"
```

---

### Task 8: Seleccionar un tramo de trazo y arrastrar sus puntas

**Files:**
- Modify: `src/components/PatternEditor/useEditorInteractions.ts:5-7` (imports), `:331-345` (selectores y refs), `:858` (antes del arrastre de extremo de interna), `:893-975` (hit-test), `:995` (mousemove), `:1202` y `:1265` (soltar)

**Interfaces:**
- Consumes: `selectTrazo` (Task 3), `updateTrazo` (Task 2), `tramoMasCercano` / `puntasDeTrazo` / `moverPunta` (Task 1), `beginUndoBatch` / `endUndoBatch` / `withUndoBatchToken` de `../../store/undoMiddleware`.
- Produces: en Seleccionar, clic sobre un trazo visible → `selectTrazo({ trazoId, segmentIndex })`; con un trazo seleccionado, arrastrar una punta → `updateTrazo` en un lote de deshacer. Bitácora: `trazo:select`, `trazo:drag`.

Esta tarea no lleva test unitario propio (el hook no se monta en jsdom con sentido; `hitInternalLine` tampoco lo tiene): la cubren el e2e de la Task 9 (recorridos 10 y 11) y los tests de `tramoMasCercano` / `moverPunta` de la Task 1.

- [ ] **Step 1: Estado y refs**

Imports: añadir `selectTrazo` a la línea de `editorSlice`, `updateTrazo` a la de `projectSlice`, `import { tramoMasCercano, puntasDeTrazo, moverPunta } from './trazos/trazoPath';`, `import { beginUndoBatch, endUndoBatch, withUndoBatchToken, type UndoBatchToken } from '../../store/undoMiddleware';`.

Junto a `const selectedInternalLine = useSelector(…)` (línea 331):

```ts
  const selectedTrazo = useSelector((s: RootState) => s.editor.selectedTrazo);
  const trazos = useSelector((s: RootState) => s.project.trazos);
  const showTrazos = useSelector((s: RootState) => s.editor.showTrazos);
```

Junto a `internalLineDragRef` (línea 337):

```ts
  const trazoDragRef = useRef<{
    trazoId: string; extremo: 0 | 1; startMouse: Point2D; startPos: Point2D; token: UndoBatchToken;
  } | null>(null);
```

- [ ] **Step 2: `handleMouseDown`, en `activeTool === 'select'`**

Justo antes de `// Check if dragging an endpoint of the currently selected internal line` (línea 858):

```ts
      // Arrastrar una punta del trazo seleccionado (spec 2026-09-12 § 5.3), como con las internas.
      if (selectedTrazo && showTrazos) {
        const trazo = trazos.find(t => t.id === selectedTrazo.trazoId);
        const puntas = trazo && puntasDeTrazo(trazo.path);
        if (puntas) {
          const EP_THRESHOLD = screenToPatternLength(8, zoom2D);
          for (let i = 0; i < 2; i++) {
            if (Math.hypot(clickX - puntas[i].x, clickY - puntas[i].y) <= EP_THRESHOLD) {
              trazoDragRef.current = {
                trazoId: selectedTrazo.trazoId, extremo: i as 0 | 1,
                startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...puntas[i] },
                token: beginUndoBatch(dispatch, 'Mover trazo'),
              };
              setIsDraggingEndpoint(true);
              pushJournal('gesture', 'trazo:drag', { trazoId: selectedTrazo.trazoId, extremo: i });
              return;
            }
          }
        }
      }

      // Un tramo de trazo se pinta encima de las piezas, así que gana al cuerpo
      // de una pieza; pierde contra un vértice de pieza (spec § 5.2), que se
      // comprueba más abajo con `findClickedAnchorPoint` antes de usar esto.
      const trazoHit = (() => {
        if (!showTrazos) return null;
        const umbral = screenToPatternLength(5, zoom2D);
        let mejor: { trazoId: string; segmentIndex: number; distance: number } | null = null;
        for (const t of trazos) {
          const h = tramoMasCercano(t.path, { x: clickX, y: clickY });
          if (h && h.distance <= umbral && (!mejor || h.distance < mejor.distance)) {
            mejor = { trazoId: t.id, segmentIndex: h.segmentIndex, distance: h.distance };
          }
        }
        return mejor;
      })();
      const seleccionarTrazo = () => {
        pushJournal('gesture', 'trazo:select', { trazoId: trazoHit!.trazoId, segmentIndex: trazoHit!.segmentIndex });
        dispatch(selectTrazo({ trazoId: trazoHit!.trazoId, segmentIndex: trazoHit!.segmentIndex }));
      };
```

Dentro de `if (pieceId) { … if (piece) {`, justo después del bloque `if (selectedIds.has(pieceId)) { const clickedNode = … }` y antes de `// Check if clicking on an internal line`:

```ts
          if (trazoHit) { seleccionarTrazo(); return; }
```

En la rama `else` (área vacía), como primera línea:

```ts
        if (trazoHit) { seleccionarTrazo(); return; }
```

Añadir `selectedTrazo, trazos, showTrazos` al array de dependencias del `useCallback` de `handleMouseDown`.

- [ ] **Step 3: `handleMouseMove`**

Justo antes de `if (internalLineDragRef.current && activeTool === 'select') {` (línea 995):

```ts
    if (trazoDragRef.current && activeTool === 'select') {
      const d = trazoDragRef.current;
      const dx = screenToPatternLength(e.clientX - d.startMouse.x, zoom2D);
      const dy = screenToPatternLength(e.clientY - d.startMouse.y, zoom2D);
      const trazo = trazos.find(t => t.id === d.trazoId);
      if (trazo) {
        const path = moverPunta(trazo.path, d.extremo, { x: d.startPos.x + dx, y: d.startPos.y + dy });
        dispatch(withUndoBatchToken(updateTrazo({ id: d.trazoId, path }), d.token));
      }
      return;
    }
```

(`trazos` en las dependencias.)

- [ ] **Step 4: Soltar**

En los dos sitios donde hoy se hace `internalLineDragRef.current = null; setIsDraggingEndpoint(false);` (líneas 1202 y 1265), añadir antes:

```ts
    if (trazoDragRef.current) {
      endUndoBatch(dispatch, trazoDragRef.current.token);
      trazoDragRef.current = null;
    }
```

Comprueba en `undoMiddleware.ts` la firma real de `endUndoBatch` (en `PatternEditor.tsx:996` se llama como `endUndoBatch(dispatch, s.token)`) y usa esa.

- [ ] **Step 5: Typecheck, lint y la suite de interacciones**

Run: `npx tsc -b --noEmit && npm run lint && npx vitest run src/components/PatternEditor/__tests__`
Expected: limpio y verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/PatternEditor/useEditorInteractions.ts && git commit -m "feat(2d): Seleccionar coge un tramo de trazo y arrastra sus puntas (#1158)"
```

---

### Task 9: El recorrido de María, de punta a punta (e2e)

**Files:**
- Create: `tests/e2e/trazos.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior; helpers `st`, `dispatch`, `toScreen`, `clickAt`, `activarHerramienta` de `tests/e2e/helpers/lienzo.ts`; `waitForApp` de `helpers/sim.ts`; `leerBitacora` de `helpers/bitacora.ts`.

- [ ] **Step 1: Escribir el e2e**

```ts
/**
 * Trazos — líneas de construcción (spec 2026-09-12 § 9). En el orden en que
 * María lo haría el 10-09: rayas sueltas con la Pluma, sin avisos, y la pieza
 * calcada encima enganchando a ellas.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, toScreen, activarHerramienta, addPiece } from './helpers/lienzo';
import { leerBitacora } from './helpers/bitacora';

type Estado = Awaited<ReturnType<typeof st>> & {
  project: { trazos: Array<{ id: string; path: Array<{ type: string; values: number[] }> }> };
  editor: { selectedTrazo: { trazoId: string; segmentIndex: number } | null; showTrazos: boolean };
};
const estado = (page: Page) => st(page) as Promise<Estado>;

async function clic(page: Page, p: { x: number; y: number }) {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(120);
}

const aviso = (page: Page) => page.locator('text=abierta: no se puede simular');

test.describe('trazos — líneas de construcción', () => {
  test.setTimeout(120_000);

  test('dos clics y Enter → un trazo, ninguna pieza, ningún aviso', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 });
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const e = await estado(page);
    expect(e.project.trazos).toHaveLength(1);
    expect(e.project.pieces).toHaveLength(0);
    await expect(aviso(page)).toHaveCount(0);
    expect(e.editor.selectedTrazo).toBeNull(); // un trazo terminado no queda seleccionado
    await expect(page.locator('[data-trazo-id]')).toHaveCount(1);
  });

  test('tres clics y Enter → pieza cerrada, ningún trazo', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 }); await clic(page, { x: 300, y: 250 });
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const e = await estado(page);
    expect(e.project.pieces).toHaveLength(1);
    expect(e.project.pieces[0].outline.at(-1)?.type).toBe('Z');
    expect(e.project.trazos).toHaveLength(0);
  });

  test('tres clics y Esc → trazo de tres nodos; la bitácora dice via esc', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 }); await clic(page, { x: 300, y: 250 });
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const e = await estado(page);
    expect(e.project.trazos).toHaveLength(1);
    expect(e.project.trazos[0].path).toHaveLength(3);
    expect(e.project.pieces).toHaveLength(0);
    const fin = (await leerBitacora(page)).find(ev => ev.name === 'pen:complete');
    expect(fin?.data).toMatchObject({ kind: 'trazo', nodes: 3, via: 'esc' });
  });

  test('Tab, 100, Enter, Esc → queda el trazo con su tramo de 100 (#1161 fallo 3)', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 });
    await page.keyboard.press('Tab');
    await expect(page.locator('input.cota--editando[aria-label="Largo"]')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Control+a'); await page.keyboard.type('100');
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150); // cierra el chip reabierto
    await page.keyboard.press('Escape'); await page.waitForTimeout(150); // suelta el congelado
    await page.keyboard.press('Escape'); await page.waitForTimeout(250); // termina el trazo
    const e = await estado(page);
    expect(e.project.trazos, 'lo dibujado desapareció').toHaveLength(1);
    const [a, b] = e.project.trazos[0].path.map(c => c.values);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(100, 3);
  });

  test('la Pluma engancha a la punta de un trazo y al cruce de dos', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 200 }); await clic(page, { x: 300, y: 200 }); await page.keyboard.press('Enter');
    await clic(page, { x: 200, y: 100 }); await clic(page, { x: 200, y: 300 }); await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    // Nueva pieza: primer clic a 3 mm de la punta (100,200), segundo a 3 mm del cruce (200,200).
    await clic(page, { x: 103, y: 202 }); await clic(page, { x: 203, y: 198 }); await clic(page, { x: 100, y: 300 });
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const e = await estado(page);
    const p = e.project.pieces[0];
    const abs = (c: { values: number[] }) => [c.values[0] + p.position.x, c.values[1] + p.position.y];
    expect(abs(p.outline[0])).toEqual([100, 200]);
    expect(abs(p.outline[1])).toEqual([200, 200]);
    const presses = (await leerBitacora(page)).filter(ev => ev.name === 'pen:press').map(ev => ev.data?.snap);
    expect(presses).toContain('trazoEnd');
    expect(presses).toContain('trazoCross');
  });

  test('«Construcción» apagada: ni se pinta, ni engancha, ni se selecciona', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 200 }); await clic(page, { x: 300, y: 200 }); await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Construcción' }).click();
    await page.waitForTimeout(150);
    await expect(page.locator('[data-trazo-id]')).toHaveCount(0);
    await clic(page, { x: 103, y: 202 }); await clic(page, { x: 200, y: 100 }); await clic(page, { x: 100, y: 100 });
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const e = await estado(page);
    const p = e.project.pieces[0];
    expect([p.outline[0].values[0] + p.position.x, p.outline[0].values[1] + p.position.y]).toEqual([103, 202]);
    await activarHerramienta(page, 'z', 'select');
    await clic(page, { x: 200, y: 200 });
    expect((await estado(page)).editor.selectedTrazo).toBeNull();
  });

  test('recargar conserva los trazos', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 }); await page.keyboard.press('Enter');
    await page.waitForTimeout(1500); // autosave
    await page.reload(); await waitForApp(page);
    expect((await estado(page)).project.trazos).toHaveLength(1);
  });

  test('cambiar de herramienta a mitad de trazo lo deja', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 });
    await activarHerramienta(page, 'z', 'select');
    expect((await estado(page)).project.trazos).toHaveLength(1);
  });

  test('Seleccionar: clic en un tramo → chip de largo; Supr parte el trazo; Ctrl+Z lo devuelve', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 }); await clic(page, { x: 300, y: 300 }); await clic(page, { x: 100, y: 300 });
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await activarHerramienta(page, 'z', 'select');
    await clic(page, { x: 300, y: 200 }); // tramo del medio
    let e = await estado(page);
    expect(e.editor.selectedTrazo).toMatchObject({ segmentIndex: 2 });
    await expect(page.locator('.cotas button.cota[aria-label^="Largo:"]')).toHaveCount(1);
    await expect(page.locator('.tool-strip')).toContainText('Editando: el tramo seleccionado');
    await page.keyboard.press('Delete'); await page.waitForTimeout(200);
    e = await estado(page);
    expect(e.project.trazos).toHaveLength(2);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    e = await estado(page);
    expect(e.project.trazos).toHaveLength(1);
    expect(e.project.trazos[0].path).toHaveLength(4);
  });

  test('el vértice de una pieza gana a la punta de un trazo en el mismo sitio (spec § 5.2)', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p', { x: 100, y: 100 }); // esquina en (100,100)
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 102, y: 101 }); await clic(page, { x: 100, y: 0 }); await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    expect((await estado(page)).project.trazos[0].path[0].values).toEqual([100, 100]); // enganchó al vértice
    await activarHerramienta(page, 'z', 'select');
    await clic(page, { x: 150, y: 150 }); // selecciona la pieza
    await clic(page, { x: 101, y: 101 }); // sobre el vértice: entra a editar el nodo, no coge el trazo
    expect((await estado(page)).editor.selectedTrazo).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el e2e con el servidor caliente y pocos workers**

En una terminal: `npm run dev` (y esperar a que Vite compile una vez). En otra:

Run: `npx playwright test tests/e2e/trazos.spec.ts --workers=2`
Expected: 10/10. Si un recorrido falla por coordenadas de enganche (radio de 12 px → en mm depende del zoom inicial), ajusta los «3 mm» de los clics a algo dentro del radio real leído en `EDGE_HIT_PX` y el `zoom2D` de arranque (`(await st(page)).editor.zoom2D`), no el código de producción.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/trazos.spec.ts && git commit -m "test(e2e): el recorrido de los trazos — pieza o trazo, Esc, enganche, interruptor, Supr (#1158)"
```

---

### Task 10: Enmiendas escritas, glosario y gates completos

**Files:**
- Modify: `docs/superpowers/specs/2026-09-09-lo-que-se-ve-y-cuando-design.md` § 4
- Modify: `docs/superpowers/specs/2026-09-06-escalera-de-escape-design.md` (peldaño de la Pluma)
- Modify: `docs/specs/2026-07-16-ui-copy-es-glosario.md` (tabla de términos del oficio)
- Modify: `docs/superpowers/specs/2026-09-08-contexto-y-control-numerico-design.md` § 5 (una línea)

- [ ] **Step 1: Enmiendas**

`2026-09-09-lo-que-se-ve-y-cuando-design.md`, en § 4 (D4), sustituir la fila «**2** | no hay área que cerrar: se crea abierta y **el aviso se queda**…» por:

```
| **2**, o Esc con ≥ 2 | no hay pieza: queda un **trazo** (línea de construcción). La Pluma no crea piezas abiertas — `2026-09-12-trazos-lineas-de-construccion-design.md` § 3 |
```

y añadir bajo «Por qué Pluma sí y las internas no»:

```
> **Enmendado el 2026-09-12.** Los trazos de construcción ya no van por Línea interna: son `Trazo`, sueltos en el lienzo, y nacen de la Pluma al terminar abierta. María [13:31]: *"son las líneas que uno traza para poder seguir dibujando"*. Spec de trazos § 1.
```

`2026-09-06-escalera-de-escape-design.md`: en la fila de la Pluma de la tabla de peldaños, cambiar «Esc cancela el trazo entero» por «Esc **termina** el trazo como línea de construcción (spec 2026-09-12 § 3.3); con un solo nodo, lo suelta».

`2026-09-08-contexto-y-control-numerico-design.md` § 5: añadir tras «**La unidad seleccionable es el tramo entre dos nodos consecutivos.**»: «Vale igual para los trazos (líneas de construcción, spec 2026-09-12 § 5.2).»

Glosario, tabla «Términos del oficio»:

```
| construction line / trazo | trazo · construcción | «trazo» para la línea; «Construcción» para el interruptor de la fila de capas. Spec 2026-09-12. |
```

- [ ] **Step 2: Gates completos**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde; el trinquete de UI sin subir ningún contador. Si `lint:ui` bajó algún contador, `node scripts/ui-contract-lint.mjs --update` y commitear el baseline.

- [ ] **Step 3: Commit y PR**

```bash
git add docs && git commit -m "docs: enmiendas por los trazos — D4 del 09-09, escalera de Escape, § 5 del 08-09, glosario (#1158)"
git push -u origin feat/trazos
gh pr create --title "Trazos: líneas de construcción fuera de una pieza (#1158)" --body-file <cuerpo con: qué cambia (spec § 3-5), qué NO (§ 6), test plan con los diez recorridos, y las líneas de atribución>
```

El cuerpo de la PR termina con las dos líneas de atribución de la sesión. No se despliega hasta que Samuel lo pida (`bash scripts/deploy-prod.sh`, con `gates-locales` antes).

---

## Autorrevisión del plan (hecha al escribirlo)

- **Cobertura de la spec:** § 2 (dato) → T2; § 3.1-3.2 (Pluma, Esc, cambio de herramienta) → T5; § 3.3 (escalera) → T5 + T10; § 3.4 (pista, bitácora) → T5; § 4 (estilo, orden, puntas, estados, interruptor, copy) → T6 + T3 + T10; § 5.1 (enganche, cruces) → T1 + T4; § 5.2 (selección por tramo, empates) → T3 + T8; § 5.3 (chip, puntas) → T7 + T8; § 5.4 (Supr) → T1 + T2 + T3; § 5.5 (medir, mover) → T6 (índice) y por construcción; § 5.6 (caja negra) → T5 + T8; § 7 (casos raros) → T3 (interruptor suelta selección), T5 (Esc con chip / un nodo / cambio de herramienta), T2 (proyecto viejo); § 8 (enmiendas) → T10; § 9 (pruebas) → cada tarea + T9.
- **Sin placeholders:** cada paso de código trae el código.
- **Nombres consistentes:** `Trazo`, `TrazoSelection`, `selectedTrazo`, `showTrazos`, `selectTrazo`, `toggleTrazos`, `addTrazo`, `updateTrazo`, `removeTrazo`, `removeTramoDeTrazo`, `trazosVisibles`, `handlePenComplete`, `PenResult`, `PenVia`, `cotasDeTrazo`, `cotasDeTramos`, `tramoMasCercano`, `puntasDeTrazo`, `anclasDeTrazo`, `moverPunta`, `quitarTramo`, `cruceDeRectas`, `crucesDeTrazos`, `trazoEnd`, `trazoCross`, `TrazosLayer` — los mismos en todas las tareas.
