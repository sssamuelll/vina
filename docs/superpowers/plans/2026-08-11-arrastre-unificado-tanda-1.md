# Arrastre unificado 2D — Tanda 1 (la ley y coser)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un arrastre sobre un borde signifique "solo este tramo" en la herramienta de coser, y que crear y editar costuras sean dos herramientas distintas, como en CLO3D.

**Architecture:** Una ley única — el press manda el objeto, el release manda el valor. Se extrae un gesto de borde genérico (`useEdgeGesture`) que resuelve clic-contra-arrastre una sola vez y lo consumen las herramientas. La herramienta de coser absorbe la geometría de `useSegmentSewingTool` (que pasa de hook a librería) y su máquina de cuatro fases muere. Se añade `seamEdit`, una herramienta de inspección que rutea a `selectSeam` en vez de crear.

**Tech Stack:** React 18 + Redux Toolkit + TypeScript, tests con vitest y `@testing-library/react`, SVG a pelo para el lienzo 2D.

**Spec:** `docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md`
**Issues:** #1029 (M-221), #1028 (M-219), #1022 punto 4 (M-199)

## Global Constraints

- **Umbral de arrastre: 4 px** de pantalla, euclidiano (`Math.hypot`), comparado con `>=`. Nunca `>`. Global, una sola constante exportada.
- **Enganche de borde: 12 px** de pantalla. **Enganche de vértice: 10 px.**
- **Tramo degenerado:** `|Δt| < 0.01` (`MIN_SEGMENT_T`) cae a CLIC, nunca al vacío.
- **Colapso a extremo:** `t < 0.01` → 0; `t > 0.99` → 1 (`EDGE_ENDPOINT_SNAP_T`).
- **Cláusula de compatibilidad:** todo lo que hoy funciona con un clic sigue produciendo exactamente el mismo resultado. El clic es la rama sub-umbral del gesto nuevo. Cada tarea que toque una herramienta lleva un test de no-regresión del clic.
- **Un gesto = una entrada de deshacer.**
- **TDD obligatorio.** Ningún código de producción sin un test que se haya visto fallar antes por la razón correcta.
- **IDs:** `newId()` de `src/utils/ids.ts`. Nunca IDs compuestos nuevos.
- **Typecheck:** `npx tsc -b --noEmit` (modo build), nunca `tsc --noEmit` a secas.
- **Sin `--no-verify`** en ningún commit.
- **Textos visibles para la usuaria** (labels de dock, hints): los de este plan son de trabajo. La redacción final la escribe la skill `solace-wren` antes de desplegar.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/components/PatternEditor/gestureConstants.ts` | **nuevo.** El umbral global y el predicado `isDrag`. Nada más. | 1 |
| `src/components/PatternEditor/edgeGesture.ts` | **nuevo.** Lógica pura del gesto de borde: resolver clic-vs-arrastre y el rango. Sin React. | 2 |
| `src/components/PatternEditor/useEdgeGesture.ts` | **nuevo.** Envoltorio React del anterior: estado, captura de puntero, cancelación. | 2 |
| `src/components/PatternEditor/useFreeSewingTool.ts` | Pasa a ser la herramienta `seam` unificada: clic = borde entero, arrastre = tramo. | 3 |
| `src/components/PatternEditor/seamEdgeLookup.ts` | **nuevo.** Puro: qué costuras tocan un borde dado. | 4 |
| `src/components/PatternEditor/useSeamEditTool.ts` | **nuevo.** La herramienta de inspección. | 4 |
| `src/shortcuts/defaults.ts` | `B` → `seamEdit`, `N` → `seam`; fuera `freeSewing`, `freeSewingAlt`, `segmentSewing`. | 5 |
| `src/components/shell/dock2dTools.ts` | Dos entradas de cosido en el catálogo. | 5 |
| `src/store/dockSlice.ts` | Default nuevo + migración desde el default vigente. | 5 |
| `src/components/PatternEditor/renderers/HintText.tsx` | Una frase por herramienta; muere el mapa de 5 fases. | 6 |
| `src/components/PatternEditor/PatternEditor.tsx` | Régimen de render de costuras, cableado de la herramienta nueva, guard del contextmenu. | 3, 4, 6 |
| `src/components/PatternEditor/useEditorInteractions.ts` | Ruteo de `seam` en mouseUp, Escape generalizado, ruteo de `seamEdit`. | 3, 4 |
| `src/components/PatternEditor/useSegmentSewingTool.ts` | De hook a librería geométrica: mueren fases y registro. | 7 |
| `src/types/types.ts` | `'seamEdit'` en la unión `Tool2D`; fuera `'segmentSewing'`. | 4, 7 |

---

## Task 1: La constante global del umbral

**Files:**
- Create: `src/components/PatternEditor/gestureConstants.ts`
- Create: `src/components/PatternEditor/__tests__/gestureConstants.test.ts`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts:40`
- Modify: `src/components/PatternEditor/useSeamAllowanceTool.ts:11`

**Interfaces:**
- Consumes: nada.
- Produces: `DRAG_THRESHOLD_PX: number` (= 4) y `isDrag(dx: number, dy: number): boolean`. Las tareas 2, 3 y 4 importan `isDrag`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/PatternEditor/__tests__/gestureConstants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DRAG_THRESHOLD_PX, isDrag } from '../gestureConstants';

describe('DRAG_THRESHOLD_PX', () => {
  it('vale 4 — SM_CXDRAG de Windows', () => {
    expect(DRAG_THRESHOLD_PX).toBe(4);
  });
});

describe('isDrag', () => {
  it('3 px en un eje es clic', () => {
    expect(isDrag(3, 0)).toBe(false);
    expect(isDrag(0, -3)).toBe(false);
  });

  it('exactamente 4 px YA es arrastre (comparación >=, no >)', () => {
    expect(isDrag(4, 0)).toBe(true);
    expect(isDrag(0, 4)).toBe(true);
  });

  it('mide euclidiano, no por eje: 3,3 son 4.24 px y es arrastre', () => {
    expect(isDrag(3, 3)).toBe(true);
  });

  it('2,2 son 2.83 px y sigue siendo clic', () => {
    expect(isDrag(2, 2)).toBe(false);
  });

  it('el signo no importa', () => {
    expect(isDrag(-5, 0)).toBe(true);
    expect(isDrag(-1, -1)).toBe(false);
  });

  it('no moverse nada es clic', () => {
    expect(isDrag(0, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/gestureConstants.test.ts`
Expected: FAIL — `Failed to resolve import "../gestureConstants"`.

- [ ] **Step 3: Implementación mínima**

Crear `src/components/PatternEditor/gestureConstants.ts`:

```ts
/**
 * Umbral clic-vs-arrastre, en píxeles de PANTALLA.
 *
 * 4 = `SM_CXDRAG` de Windows: la mano de quien usa la app ya viene calibrada a
 * ese número por el sistema operativo. Es GLOBAL a propósito — un umbral por
 * herramienta enseñaría "en esta hay que moverse más", que es justo lo que un
 * gesto no debe hacer. Si una herramienta pidiera otro número, es olor de
 * diseño y vuelve al spec, no se parchea aquí.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 7
 */
export const DRAG_THRESHOLD_PX = 4;

/** ¿Este recorrido cruzó el umbral? Euclidiano, y `>=` — nunca `>`. */
export function isDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}
```

- [ ] **Step 4: Correr y verlo pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/gestureConstants.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Apuntar los dos call-sites de hoy a la constante**

En `src/components/PatternEditor/useEditorInteractions.ts`, borrar la línea 40 (`const MIN_DRAG_PX = 3;`) y añadir al bloque de imports:

```ts
import { DRAG_THRESHOLD_PX } from './gestureConstants';
```

Después, sustituir cada uso de `MIN_DRAG_PX` por `DRAG_THRESHOLD_PX`. Localízalos con:

```bash
grep -n "MIN_DRAG_PX" src/components/PatternEditor/useEditorInteractions.ts
```

En `src/components/PatternEditor/useSeamAllowanceTool.ts`, borrar la línea 11 (`const DRAG_THRESHOLD_PX = 3;`) y añadir al bloque de imports:

```ts
import { DRAG_THRESHOLD_PX } from './gestureConstants';
```

El nombre local ya coincide, así que no hay más sustituciones que hacer en ese archivo.

- [ ] **Step 6: Correr la suite entera**

Run: `npm run test`
Expected: PASS. Si algún test de `select` o de `seamAllowance` afirmaba un umbral de 3 px, actualízalo a 4 y deja el comentario de por qué (`SM_CXDRAG`). No lo silencies.

- [ ] **Step 7: Gates y commit**

```bash
npx tsc -b --noEmit && npm run lint
git add src/components/PatternEditor/gestureConstants.ts src/components/PatternEditor/__tests__/gestureConstants.test.ts src/components/PatternEditor/useEditorInteractions.ts src/components/PatternEditor/useSeamAllowanceTool.ts
git commit -m "feat(2d): un solo umbral de arrastre, 4px, para todo el editor (#1029)"
```

---

## Task 2: El gesto de borde genérico

**Files:**
- Create: `src/components/PatternEditor/edgeGesture.ts`
- Create: `src/components/PatternEditor/__tests__/edgeGesture.test.ts`
- Create: `src/components/PatternEditor/useEdgeGesture.ts`
- Create: `src/components/PatternEditor/__tests__/useEdgeGesture.test.tsx`

**Interfaces:**
- Consumes: `isDrag` de `./gestureConstants` (Tarea 1). `MIN_SEGMENT_T` y `EDGE_ENDPOINT_SNAP_T` se re-declaran aquí como constantes exportadas propias (la Tarea 7 borra las de `useSegmentSewingTool`).
- Produces:
  - `type EdgeGesturePhase = 'idle' | 'armed' | 'dragging'`
  - `interface EdgeTarget { pieceId: string; edgeIndex: number; edgeRange: [number, number]; t: number; point: Point2D }`
  - `type EdgeCommit = { kind: 'click'; target: EdgeTarget } | { kind: 'drag'; target: EdgeTarget; range: [number, number] }`
  - `function resolveEdgeCommit(press: EdgeTarget, releaseT: number | null, crossedThreshold: boolean): EdgeCommit`

> **Corrección 2026-08-11, tras la revisión de la Tarea 2.** La primera versión de este brief pasaba `dx, dy` y volvía a llamar a `isDrag` dentro de `resolveEdgeCommit`. Eso **contradice el spec**: § 4.1 resuelve el pointerup desde `DRAGGING` solo por `|Δt|`, y § 6 (conflicto 2) dice que el umbral de pantalla, *una vez cruzado, no se re-evalúa*. Con la firma vieja, sobre un borde curvo —una sisa, un escote en U— el cursor puede volver **cerca en pantalla** del punto de partida con el **arco lejísimos**, y el gesto commiteaba un clic ("borde entero") después de haberle enseñado el rango en vivo. `crossedThreshold` es el flag histórico `moved` del hook, que se pone una vez y no se desactiva. `isDrag` se usa **solo** en `useEdgeGesture` para la transición ARMED→DRAGGING, que es su único sitio correcto.
  - `function useEdgeGesture(opts: { resolveTarget: (e: React.MouseEvent<SVGSVGElement>) => EdgeTarget | null; resolveReleaseT: (e: React.MouseEvent<SVGSVGElement>, press: EdgeTarget) => number | null; onCommit: (c: EdgeCommit) => void }): { phase: EdgeGesturePhase; press: EdgeTarget | null; liveRange: [number, number] | null; handleMouseDown; handleMouseMove; handleMouseUp; cancel: () => void; isArmed: () => boolean }`

`isArmed()` es la que consultan el guard de Escape (Tarea 3) y el del menú contextual (Tarea 6): las dos necesitan saber si hay un gesto vivo **sin** provocar un re-render, por eso es una función sobre un ref y no un booleano de estado.

Las tareas 3 y 4 consumen `useEdgeGesture` y `EdgeCommit`.

- [ ] **Step 1: Escribir el test de la lógica pura**

Crear `src/components/PatternEditor/__tests__/edgeGesture.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveEdgeCommit, type EdgeTarget } from '../edgeGesture';

const press = (t: number): EdgeTarget => ({
  pieceId: 'p1',
  edgeIndex: 1,
  edgeRange: [1, 2],
  t,
  point: { x: 0, y: 0 },
});

describe('resolveEdgeCommit', () => {
  it('bajo umbral es CLIC, aunque el t haya cambiado', () => {
    const c = resolveEdgeCommit(press(0.3), 0.9, 2, 2);
    expect(c.kind).toBe('click');
  });

  it('sobre umbral con recorrido real de t es ARRASTRE', () => {
    const c = resolveEdgeCommit(press(0.2), 0.7, 40, 0);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[0]).toBeCloseTo(0.2, 5);
    expect(c.range[1]).toBeCloseTo(0.7, 5);
  });

  it('ordena el rango cuando arrastra hacia atrás', () => {
    const c = resolveEdgeCommit(press(0.8), 0.3, 0, 40);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[0]).toBeCloseTo(0.3, 5);
    expect(c.range[1]).toBeCloseTo(0.8, 5);
  });

  it('cruzó el umbral en pantalla pero el t colapsó: cae a CLIC, no al vacío', () => {
    // arrastró perpendicular al borde — 40px de recorrido, cero avance de t
    const c = resolveEdgeCommit(press(0.5), 0.505, 0, 40);
    expect(c.kind).toBe('click');
  });

  it('soltar fuera del borde (releaseT null) es CLIC', () => {
    const c = resolveEdgeCommit(press(0.5), null, 40, 40);
    expect(c.kind).toBe('click');
  });

  it('colapsa el arranque al extremo: t < 0.01 pasa a 0', () => {
    const c = resolveEdgeCommit(press(0.004), 0.6, 40, 0);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[0]).toBe(0);
  });

  it('colapsa el final al extremo: t > 0.99 pasa a 1', () => {
    const c = resolveEdgeCommit(press(0.4), 0.997, 40, 0);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[1]).toBe(1);
  });

  it('el objetivo del commit es SIEMPRE el del press', () => {
    const p = press(0.1);
    const c = resolveEdgeCommit(p, 0.9, 40, 0);
    expect(c.target).toBe(p);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/edgeGesture.test.ts`
Expected: FAIL — `Failed to resolve import "../edgeGesture"`.

- [ ] **Step 3: Implementar la lógica pura**

Crear `src/components/PatternEditor/edgeGesture.ts`:

```ts
import type { Point2D } from '../../types/types';
import { isDrag } from './gestureConstants';

/** Tramo más corto que esto = el press y el release son el mismo sitio. */
export const MIN_SEGMENT_T = 0.01;

/** Un t a menos del 1% de un extremo cuenta como el extremo exacto — evita
 *  slivers sin coser y deja que extremo-a-extremo colapse a la convención
 *  rango-completo de seamRange.ts (campos ausentes, nunca 0/1). */
export const EDGE_ENDPOINT_SNAP_T = 0.01;

export type EdgeGesturePhase = 'idle' | 'armed' | 'dragging';

/** Lo que el press enganchó. `t` va en arco del BORDE semántico, no del comando. */
export interface EdgeTarget {
  pieceId: string;
  edgeIndex: number;
  edgeRange: [number, number];
  t: number;
  point: Point2D;
}

export type EdgeCommit =
  | { kind: 'click'; target: EdgeTarget }
  | { kind: 'drag'; target: EdgeTarget; range: [number, number] };

/**
 * La ley, en una función: el press manda el objeto, el release manda el valor.
 *
 * Soltar sin haberse movido = clic ("esto entero", y qué signifique eso lo
 * decide la herramienta). Soltar habiéndose movido = arrastre con su rango.
 *
 * Dos caídas a clic que NO son "no pasó nada":
 *  - soltar fuera del borde (`releaseT === null`)
 *  - cruzar el umbral en pantalla con el t colapsado (arrastre perpendicular)
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 4.1
 */
export function resolveEdgeCommit(
  press: EdgeTarget,
  releaseT: number | null,
  dx: number,
  dy: number,
): EdgeCommit {
  if (releaseT === null || !isDrag(dx, dy)) return { kind: 'click', target: press };
  if (Math.abs(releaseT - press.t) < MIN_SEGMENT_T) return { kind: 'click', target: press };

  let t0 = Math.min(press.t, releaseT);
  let t1 = Math.max(press.t, releaseT);
  if (t0 < EDGE_ENDPOINT_SNAP_T) t0 = 0;
  if (t1 > 1 - EDGE_ENDPOINT_SNAP_T) t1 = 1;

  return { kind: 'drag', target: press, range: [t0, t1] };
}
```

- [ ] **Step 4: Correr y verlo pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/edgeGesture.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Escribir el test del hook**

Crear `src/components/PatternEditor/__tests__/useEdgeGesture.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEdgeGesture } from '../useEdgeGesture';
import type { EdgeTarget, EdgeCommit } from '../edgeGesture';

const target: EdgeTarget = {
  pieceId: 'p1', edgeIndex: 1, edgeRange: [1, 2], t: 0.2, point: { x: 0, y: 0 },
};

/** Un MouseEvent de React lo bastante real para el hook: coordenadas, botón y
 *  el currentTarget con la API de captura de puntero. */
function mouseEvent(clientX: number, clientY: number, button = 0) {
  return {
    button,
    clientX,
    clientY,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    },
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function setup(releaseT: number | null, onCommit: (c: EdgeCommit) => void) {
  return renderHook(() => useEdgeGesture({
    resolveTarget: () => target,
    resolveReleaseT: () => releaseT,
    onCommit,
  }));
}

describe('useEdgeGesture', () => {
  it('arranca en idle', () => {
    const { result } = setup(0.8, vi.fn());
    expect(result.current.phase).toBe('idle');
  });

  it('el press arma el gesto y guarda el objetivo', () => {
    const { result } = setup(0.8, vi.fn());
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    expect(result.current.phase).toBe('armed');
    expect(result.current.press).toEqual(target);
  });

  it('moverse sobre el umbral pasa a dragging', () => {
    const { result } = setup(0.8, vi.fn());
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(110, 100)); });
    expect(result.current.phase).toBe('dragging');
  });

  it('moverse por debajo del umbral NO pasa a dragging', () => {
    const { result } = setup(0.8, vi.fn());
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(102, 100)); });
    expect(result.current.phase).toBe('armed');
  });

  it('soltar sin moverse commitea un CLIC y vuelve a idle', () => {
    const onCommit = vi.fn();
    const { result } = setup(0.8, onCommit);
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseUp(mouseEvent(100, 100)); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].kind).toBe('click');
    expect(result.current.phase).toBe('idle');
  });

  it('soltar tras moverse commitea un ARRASTRE con su rango', () => {
    const onCommit = vi.fn();
    const { result } = setup(0.8, onCommit);
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(140, 100)); });
    act(() => { result.current.handleMouseUp(mouseEvent(140, 100)); });
    const commit = onCommit.mock.calls[0][0];
    expect(commit.kind).toBe('drag');
    expect(commit.range[0]).toBeCloseTo(0.2, 5);
    expect(commit.range[1]).toBeCloseTo(0.8, 5);
  });

  it('cancel() a mitad de arrastre no commitea nada', () => {
    const onCommit = vi.fn();
    const { result } = setup(0.8, onCommit);
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(140, 100)); });
    act(() => { result.current.cancel(); });
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('el botón derecho no arma nada', () => {
    const onCommit = vi.fn();
    const { result } = setup(0.8, onCommit);
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100, 2)); });
    expect(result.current.phase).toBe('idle');
  });

  it('el press sin objetivo válido no arma', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useEdgeGesture({
      resolveTarget: () => null,
      resolveReleaseT: () => 0.8,
      onCommit,
    }));
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    expect(result.current.phase).toBe('idle');
  });

  it('captura el puntero en el press para que el release fuera del lienzo llegue', () => {
    const { result } = setup(0.8, vi.fn());
    const e = mouseEvent(100, 100);
    act(() => { result.current.handleMouseDown(e); });
    expect((e.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> })
      .setPointerCapture).toHaveBeenCalled();
  });

  it('mientras arrastra publica el rango en vivo', () => {
    const { result } = setup(0.8, vi.fn());
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(140, 100)); });
    expect(result.current.liveRange).not.toBeNull();
    expect(result.current.liveRange![1]).toBeCloseTo(0.8, 5);
  });
});
```

- [ ] **Step 6: Correrlo y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/useEdgeGesture.test.tsx`
Expected: FAIL — `Failed to resolve import "../useEdgeGesture"`.

- [ ] **Step 7: Implementar el hook**

Crear `src/components/PatternEditor/useEdgeGesture.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import {
  resolveEdgeCommit,
  type EdgeCommit,
  type EdgeGesturePhase,
  type EdgeTarget,
} from './edgeGesture';
import { isDrag } from './gestureConstants';

interface EdgeGestureOptions {
  /** Qué hay bajo el cursor en el press. `null` = no hay objetivo, no se arma. */
  resolveTarget: (e: React.MouseEvent<SVGSVGElement>) => EdgeTarget | null;
  /** El t sobre el MISMO borde del press. `null` = el cursor se salió del borde. */
  resolveReleaseT: (e: React.MouseEvent<SVGSVGElement>, press: EdgeTarget) => number | null;
  onCommit: (commit: EdgeCommit) => void;
}

interface ArmedRef {
  press: EdgeTarget;
  startX: number;
  startY: number;
  moved: boolean;
  /** El elemento que capturó el puntero, para soltarlo al terminar. */
  captured: Element | null;
  pointerId: number | null;
}

/**
 * El gesto de borde, compartido por todas las herramientas que preguntan
 * "cuánto". El press manda el OBJETO y no se re-apunta nunca: mover el cursor
 * a otro borde, a otra pieza o fuera del lienzo no cambia sobre qué se está
 * trabajando, solo dónde a lo largo de él.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 4.1
 */
export function useEdgeGesture(opts: EdgeGestureOptions) {
  const { resolveTarget, resolveReleaseT, onCommit } = opts;
  const armed = useRef<ArmedRef | null>(null);
  const [phase, setPhase] = useState<EdgeGesturePhase>('idle');
  const [press, setPress] = useState<EdgeTarget | null>(null);
  const [liveRange, setLiveRange] = useState<[number, number] | null>(null);

  const reset = useCallback(() => {
    const a = armed.current;
    if (a?.captured && a.pointerId !== null) {
      const el = a.captured as Element & { releasePointerCapture?: (id: number) => void };
      try { el.releasePointerCapture?.(a.pointerId); } catch { /* ya soltado */ }
    }
    armed.current = null;
    setPhase('idle');
    setPress(null);
    setLiveRange(null);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = resolveTarget(e);
    if (!target) return;

    // Captura de puntero: sin esto, soltar fuera del lienzo pierde el mouseup y
    // el gesto se queda armado para siempre.
    const el = e.currentTarget as unknown as {
      setPointerCapture?: (id: number) => void;
    };
    const pointerId = (e as unknown as { pointerId?: number }).pointerId ?? 1;
    let captured: Element | null = null;
    try {
      el.setPointerCapture?.(pointerId);
      captured = e.currentTarget as unknown as Element;
    } catch { /* jsdom o navegador sin soporte: el gesto sigue funcionando */ }

    armed.current = {
      press: target, startX: e.clientX, startY: e.clientY,
      moved: false, captured, pointerId,
    };
    setPhase('armed');
    setPress(target);
    setLiveRange(null);
  }, [resolveTarget]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const a = armed.current;
    if (!a) return;

    if (!a.moved && isDrag(e.clientX - a.startX, e.clientY - a.startY)) {
      a.moved = true;
      setPhase('dragging');
    }
    if (!a.moved) return;

    const t = resolveReleaseT(e, a.press);
    setLiveRange(t === null ? null : [Math.min(a.press.t, t), Math.max(a.press.t, t)]);
  }, [resolveReleaseT]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const a = armed.current;
    if (!a) return;
    const t = a.moved ? resolveReleaseT(e, a.press) : null;
    const commit = resolveEdgeCommit(a.press, t, e.clientX - a.startX, e.clientY - a.startY);
    reset();
    onCommit(commit);
  }, [resolveReleaseT, onCommit, reset]);

  return {
    phase, press, liveRange,
    handleMouseDown, handleMouseMove, handleMouseUp,
    cancel: reset,
    /** ¿Hay un gesto vivo? Lo usa el guard de Escape y el del contextmenu. */
    isArmed: () => armed.current !== null,
  };
}
```

- [ ] **Step 8: Correr y verlo pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/useEdgeGesture.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 9: Gates y commit**

```bash
npx tsc -b --noEmit && npm run lint && npm run test
git add src/components/PatternEditor/edgeGesture.ts src/components/PatternEditor/useEdgeGesture.ts src/components/PatternEditor/__tests__/edgeGesture.test.ts src/components/PatternEditor/__tests__/useEdgeGesture.test.tsx
git commit -m "feat(2d): el gesto de borde — press manda el objeto, release manda el valor (#1029)"
```

---

## Task 3: Coser absorbe el tramo

La herramienta `seam` deja de tirar el `t`. Clic sigue significando el borde entero y produce **exactamente el mismo `Seam` que hoy**; arrastre produce el sub-rango.

**Files:**
- Modify: `src/components/PatternEditor/useFreeSewingTool.ts` (reescritura del cuerpo del hook)
- Create: `src/components/PatternEditor/__tests__/useFreeSewingTool.tramo.test.ts`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts` (ruteo de `seam` en mouseUp)
- Modify: `src/components/PatternEditor/PatternEditor.tsx:199` (la instancia de `seamTool` pierde el argumento `mode`)

**Interfaces:**
- Consumes: `useEdgeGesture`, `EdgeCommit` (Tarea 2). De `./useSegmentSewingTool`: `snapToEdge`, `snapToAnyEdge`, `buildSegmentSeam`, `type SegmentSelection`. De `../../utils/semanticEdges`: `edgeRangeForCommand`.
- Produces: `useFreeSewingTool` con el mismo nombre pero firma nueva:
  `useFreeSewingTool(zoom: number, pan: Point2D, pieces: PatternPiece[], onComplete: (seam: Omit<Seam,'id'>) => void)` — **sin el parámetro `mode`**. Devuelve `{ segmentA, hoveredTarget, liveRange, phase, handleMouseDown, handleMouseMove, handleMouseUp, handleKeyDown, isArmed }`.

**Ojo con el nombre:** el hook viejo devolvía `firstEdge` y `hoveredEdge` (tipo `FreeEdgeSelection`). Los nuevos son `segmentA` (tipo `SegmentSelection`) y `hoveredTarget` (tipo `EdgeTarget`). Todo consumidor de los nombres viejos hay que actualizarlo — localízalos con `grep -rn "firstEdge\|hoveredEdge" src/`. El principal es `ToolOverlay`/`EdgePairOverlay`, que pinta la mitad sostenida.

**Dos funciones privadas que esta tarea exporta.** Verificado contra el árbol: ni `commandTToEdgeT` (`useSegmentSewingTool.ts:161`) ni `snapToAnyEdge` (`:118`) llevan `export` hoy, y las dos hacen falta fuera. Se les añade `export` delante; **sus cuerpos no cambian**. Sin este paso, las Tareas 3 y 4 no compilan.

- [ ] **Step 1: Escribir el test de no-regresión del clic**

Crear `src/components/PatternEditor/__tests__/useFreeSewingTool.tramo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSegmentSeam, type SegmentSelection } from '../useSegmentSewingTool';
import type { PatternPiece } from '../../../types/types';

/** Cuadrado simple: M 0,0 L 100,0 L 100,100 L 0,100 Z */
const square = (id: string, x: number): PatternPiece => ({
  id,
  name: id,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  position: { x, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
});

const seg = (pieceId: string, startT: number, endT: number): SegmentSelection => ({
  pieceId,
  edgeIndex: 1,
  edgeRange: [1, 2],
  startT,
  endT,
  startPoint: { x: 0, y: 0 },
  endPoint: { x: 0, y: 0 },
});

const pieces = [square('pA', 0), square('pB', 300)];

describe('el clic sigue produciendo el borde entero, byte a byte', () => {
  it('rango 0..1 NO escribe tStart/tEnd — es la convención rango-completo', () => {
    const seam = buildSegmentSeam(seg('pA', 0, 1), seg('pB', 0, 1), pieces, 'standard');
    expect(seam.pieceA.tStart).toBeUndefined();
    expect(seam.pieceA.tEnd).toBeUndefined();
    expect(seam.pieceB.tStart).toBeUndefined();
    expect(seam.pieceB.tEnd).toBeUndefined();
  });

  it('y conserva pieceId y edgeName como el flujo de dos clics de hoy', () => {
    const seam = buildSegmentSeam(seg('pA', 0, 1), seg('pB', 0, 1), pieces, 'standard');
    expect(seam.pieceA.pieceId).toBe('pA');
    expect(seam.pieceB.pieceId).toBe('pB');
    expect(seam.type).toBe('standard');
    expect(seam.tension).toBe(100);
    expect(seam.active).toBe(true);
  });
});

describe('el arrastre sí escribe el tramo', () => {
  it('media mitad contra borde entero: A lleva rango, B no', () => {
    const seam = buildSegmentSeam(seg('pA', 0.25, 0.75), seg('pB', 0, 1), pieces, 'standard');
    expect(seam.pieceA.tStart).toBeCloseTo(0.25, 5);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.75, 5);
    expect(seam.pieceB.tStart).toBeUndefined();
    expect(seam.pieceB.tEnd).toBeUndefined();
  });

  it('dos tramos asimétricos conservan cada uno el suyo', () => {
    const seam = buildSegmentSeam(seg('pA', 0.1, 0.4), seg('pB', 0.5, 0.9), pieces, 'standard');
    expect(seam.pieceA.tStart).toBeCloseTo(0.1, 5);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.4, 5);
    expect(seam.pieceB.tStart).toBeCloseTo(0.5, 5);
    expect(seam.pieceB.tEnd).toBeCloseTo(0.9, 5);
  });
});
```

- [ ] **Step 2: Correrlo y verlo pasar (sí, pasar)**

Run: `npx vitest run src/components/PatternEditor/__tests__/useFreeSewingTool.tramo.test.ts`
Expected: PASS. **Esto no es TDD roto**: estos cuatro tests no describen código nuevo, describen el contrato de `buildSegmentSeam` que la fusión va a reutilizar. Son la red que detecta si la fusión lo rompe. El test que sí tiene que verse fallar es el del paso siguiente.

- [ ] **Step 3: Escribir el test que sí falla — el gesto de la herramienta**

Añadir al final del mismo archivo:

```ts
import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import toolReducer from '../../../store/toolSlice';
import { useFreeSewingTool } from '../useFreeSewingTool';

function wrapper({ children }: { children: React.ReactNode }) {
  const store = configureStore({ reducer: { tools: toolReducer } });
  return React.createElement(Provider, { store }, children);
}

/** Evento de ratón sobre el lienzo, en coordenadas de patrón = de pantalla
 *  (zoom 1, pan 0, rect en el origen). */
function ev(clientX: number, clientY: number, button = 0) {
  return {
    button, clientX, clientY,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    },
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

describe('useFreeSewingTool — la fusión', () => {
  it('dos clics en bordes de piezas distintas cosen los bordes enteros', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
      { wrapper },
    );

    // Borde de arriba de pA: y≈0, x entre 0 y 100
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    act(() => { result.current.handleMouseUp(ev(50, 0)); });
    // Borde de arriba de pB: pieza desplazada 300 en x
    act(() => { result.current.handleMouseDown(ev(350, 0)); });
    act(() => { result.current.handleMouseUp(ev(350, 0)); });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const seam = onComplete.mock.calls[0][0];
    expect(seam.pieceA.pieceId).toBe('pA');
    expect(seam.pieceB.pieceId).toBe('pB');
    expect(seam.pieceA.tStart).toBeUndefined();
    expect(seam.pieceB.tStart).toBeUndefined();
  });

  it('arrastrar en la primera pieza cose solo ese tramo', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
      { wrapper },
    );

    // Arrastre del 25% al 75% del borde de arriba de pA
    act(() => { result.current.handleMouseDown(ev(25, 0)); });
    act(() => { result.current.handleMouseMove(ev(75, 0)); });
    act(() => { result.current.handleMouseUp(ev(75, 0)); });
    // Clic entero en pB
    act(() => { result.current.handleMouseDown(ev(350, 0)); });
    act(() => { result.current.handleMouseUp(ev(350, 0)); });

    const seam = onComplete.mock.calls[0][0];
    expect(seam.pieceA.tStart).toBeCloseTo(0.25, 1);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.75, 1);
    expect(seam.pieceB.tStart).toBeUndefined();
  });

  it('el segundo gesto en la MISMA pieza no cierra costura', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    act(() => { result.current.handleMouseUp(ev(50, 0)); });
    act(() => { result.current.handleMouseDown(ev(100, 50)); }); // borde derecho de pA
    act(() => { result.current.handleMouseUp(ev(100, 50)); });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('Escape suelta la mitad sostenida', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, pieces, onComplete),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    act(() => { result.current.handleMouseUp(ev(50, 0)); });
    expect(result.current.segmentA).not.toBeNull();
    act(() => { result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current.segmentA).toBeNull();
  });
});
```

- [ ] **Step 4: Correrlo y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/useFreeSewingTool.tramo.test.ts`
Expected: FAIL en los cuatro tests de "la fusión" — la firma de `useFreeSewingTool` todavía pide `mode` y el hook no expone `handleMouseUp` ni `segmentA`.

- [ ] **Step 5: Exportar las dos funciones de geometría**

En `src/components/PatternEditor/useSegmentSewingTool.ts`:
- línea 118: `function snapToAnyEdge(` → `export function snapToAnyEdge(`
- línea 161: `function commandTToEdgeT(` → `export function commandTToEdgeT(`

Nada más en ese archivo. Comprobar:

```bash
grep -n "^export function snapToAnyEdge\|^export function commandTToEdgeT" src/components/PatternEditor/useSegmentSewingTool.ts
```

Esperado: dos líneas.

- [ ] **Step 6: Reescribir el hook**

Sustituir el contenido entero de `src/components/PatternEditor/useFreeSewingTool.ts` por:

```ts
import { useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { PatternPiece, Point2D, Seam } from '../../types/types';
import { screenToPattern } from './sewingUtils';
import { edgeRangeForCommand } from '../../utils/semanticEdges';
import {
  snapToAnyEdge, commandTToEdgeT, buildSegmentSeam,
  type SegmentSelection,
} from './useSegmentSewingTool';
import { useEdgeGesture } from './useEdgeGesture';
import type { EdgeCommit, EdgeTarget } from './edgeGesture';

/**
 * La herramienta de coser, unificada (#199, #1022, #1029).
 *
 * Un clic marca el borde entero — exactamente lo que hacía antes, y produce el
 * mismo `Seam`. Un arrastre marca el tramo. Dos gestos, uno por pieza, cierran
 * la costura: sin `Enter`, sin fases.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 4.2
 */
export function useFreeSewingTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  onComplete: (seam: Omit<Seam, 'id'>) => void,
) {
  const [segmentA, setSegmentA] = useState<SegmentSelection | null>(null);

  const seamType = useSelector(
    (s: RootState) => (s.tools.toolOptions?.seam?.seamType as Seam['type']) ?? 'standard',
  );

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
  }, [zoom, pan]);

  /** El press: qué borde enganchó, y en qué punto de su arco. */
  const resolveTarget = useCallback((e: React.MouseEvent<SVGSVGElement>): EdgeTarget | null => {
    const pt = toPattern(e);
    // Sosteniendo la mitad A, el segundo gesto va contra OTRA pieza.
    const snap = snapToAnyEdge(pt, pieces, zoom, undefined, undefined);
    if (!snap) return null;
    if (segmentA && snap.pieceId === segmentA.pieceId) return null;

    const piece = pieces.find(p => p.id === snap.pieceId);
    const edgeRange = edgeRangeForCommand(piece, snap.edgeIndex);
    const t = piece
      ? commandTToEdgeT(piece.outline, edgeRange, snap.edgeIndex, snap.t)
      : snap.t;
    return { pieceId: snap.pieceId, edgeIndex: snap.edgeIndex, edgeRange, t, point: snap.point };
  }, [toPattern, pieces, zoom, segmentA]);

  /** El release: el t sobre el MISMO borde del press. Fuera del borde → null,
   *  y el gesto cae a clic (spec § 3.4). */
  const resolveReleaseT = useCallback((
    e: React.MouseEvent<SVGSVGElement>,
    press: EdgeTarget,
  ): number | null => {
    const pt = toPattern(e);
    const snap = snapToAnyEdge(pt, pieces, zoom, press.pieceId, press.edgeRange);
    if (!snap) return null;
    const piece = pieces.find(p => p.id === press.pieceId);
    return piece
      ? commandTToEdgeT(piece.outline, press.edgeRange, snap.edgeIndex, snap.t)
      : snap.t;
  }, [toPattern, pieces, zoom]);

  const onCommit = useCallback((commit: EdgeCommit) => {
    const { target } = commit;
    const [startT, endT] = commit.kind === 'drag' ? commit.range : [0, 1];
    const segment: SegmentSelection = {
      pieceId: target.pieceId,
      edgeIndex: target.edgeIndex,
      edgeRange: target.edgeRange,
      startT,
      endT,
      startPoint: target.point,
      endPoint: target.point,
    };

    if (!segmentA) { setSegmentA(segment); return; }
    onComplete(buildSegmentSeam(segmentA, segment, pieces, seamType));
    setSegmentA(null);
  }, [segmentA, onComplete, pieces, seamType]);

  const gesture = useEdgeGesture({ resolveTarget, resolveReleaseT, onCommit });

  // El resalte al pasar el ratón es independiente del gesto: sin él, el borde
  // solo se encendería mientras se arrastra, y María no vería qué va a coser
  // ANTES de apretar. `gesture.press` solo existe durante el gesto, así que no
  // sirve para esto.
  const [hoveredTarget, setHoveredTarget] = useState<EdgeTarget | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    gesture.handleMouseMove(e);
    if (gesture.isArmed()) return;   // durante el gesto manda el press, no el hover
    setHoveredTarget(resolveTarget(e));
  }, [gesture, resolveTarget]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // Un Esc = una acción (spec § 6, conflicto 7): si cancelamos algo, el evento
    // no sigue viajando hasta `selection.deselect`.
    if (gesture.isArmed()) {
      gesture.cancel();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (segmentA) {
      setSegmentA(null);
      e.preventDefault();
      e.stopPropagation();
    }
  }, [gesture, segmentA]);

  return {
    segmentA,
    phase: segmentA ? ('holdingA' as const) : ('idle' as const),
    hoveredTarget,
    liveRange: gesture.liveRange,
    handleMouseDown: gesture.handleMouseDown,
    handleMouseMove,
    handleMouseUp: gesture.handleMouseUp,
    handleKeyDown,
    isArmed: gesture.isArmed,
  };
}
```

> `useState` y `EdgeTarget` ya están importados arriba en este mismo archivo.

- [ ] **Step 7: Correr y verlo pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/useFreeSewingTool.tramo.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 8: Cablear el mouseUp — sin esto el gesto no cierra**

Verificado contra el árbol: el ruteo de mouseUp de `useEditorInteractions.ts` **no incluye `seam`** hoy (solo `pen`, `rectangle`, `seamAllowance`, `grainline`, `transform`, `nodeEditor`, `editPattern`, `scissors`, `slashAndSpread`, `merge`, `offsetOutline`, `extendTrim`, `polyPen`, `internalShape`, `point`). Sin este paso el gesto se arma y nunca commitea.

Dentro del `useCallback` del mouseUp (empieza hacia la línea 940), añadir junto a las demás líneas de ruteo:

```ts
    if (activeTool === 'seam' && e) seamTool.handleMouseUp(e);
```

Y añadir `seamTool` al array de dependencias de ese `useCallback` (el que termina hacia la línea 958).

Verificar que quedó:

```bash
grep -n "activeTool === 'seam'" src/components/PatternEditor/useEditorInteractions.ts
```

Esperado: cuatro líneas — keyDown (`:382`), mouseDown (`:580`), mouseMove (`:842`) y la nueva de mouseUp.

- [ ] **Step 9: Registrar `seam` en la captura de Escape (CF-1)**

La captura de `window` en `useEditorInteractions.ts:409-426` es una lista cableada: hoy solo conoce el tool `point` armado y el transform-drag de `select`. Para cualquier otro tool, el Escape sigue viajando y dispara **también** `selection.deselect` — dos acciones con una tecla, justo lo que el spec § 6 (conflicto 7) prohíbe.

Dentro de `onEscapeCapture`, después del bloque de `point` y **antes** del `if (activeTool !== 'select') return;`, añadir:

```ts
      // Coser: con un gesto armado o una mitad sostenida, el Esc es del tool.
      // El hook hace preventDefault + stopPropagation cuando cancela algo; si
      // no hay nada que cancelar, el Esc fluye normal → deseleccionar.
      if (activeTool === 'seam') {
        seamTool.handleKeyDown(e);
        return;
      }
```

Añadir `seamTool` al array de dependencias de ese `useEffect` (hoy `[activeTool, transformTool, pointTool]`).

- [ ] **Step 10: Arreglar la instancia del hook**

En `src/components/PatternEditor/PatternEditor.tsx:199`, quitar el último argumento:

```ts
const seamTool = useFreeSewingTool(zoom2D, pan2D, pieces, handleSeamComplete);
```

La segunda instancia (`freeSewingTool`, `:312`) y su variable `freeSewingMode` (`:311`) se borran en la Tarea 7 junto con el resto del tool. Para que esta tarea compile sola, cambiar la línea 312 a:

```ts
const freeSewingTool = seamTool; // TAREA 7 lo borra junto con el tool `freesewing`
```

- [ ] **Step 11: Gates y commit**

```bash
npx tsc -b --noEmit && npm run lint && npm run test
git add -A
git commit -m "feat(sew): coser absorbe el tramo — clic = borde entero, arrastre = tramo (#199, #1029)"
```

---

## Task 4: La herramienta de editar costuras

**Files:**
- Create: `src/components/PatternEditor/seamEdgeLookup.ts`
- Create: `src/components/PatternEditor/__tests__/seamEdgeLookup.test.ts`
- Create: `src/components/PatternEditor/useSeamEditTool.ts`
- Create: `src/components/PatternEditor/__tests__/useSeamEditTool.test.tsx`
- Modify: `src/types/types.ts` (añadir `'seamEdit'` a `Tool2D`, junto a `'seam'`)
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (instanciar y pasar el hook)
- Modify: `src/components/PatternEditor/useEditorInteractions.ts` (ruteo de `seamEdit`)

**Interfaces:**
- Consumes: `snapToAnyEdge` de `./useSegmentSewingTool`; `selectSeam` de `../../store/editorSlice`; `resolveEdgeName` de `./sewingUtils`.
- Produces:
  - `function seamsOnEdge(seams: Seam[], pieceId: string, edgeName: string): Seam[]`
  - `function nextSeamOnEdge(seams: Seam[], currentId: string | null): Seam | null`
  - `useSeamEditTool(zoom, pan, pieces, seams)` → `{ hoveredSeamId, handleMouseDown, handleMouseMove, handleKeyDown }`

- [ ] **Step 1: Escribir el test del lookup**

Crear `src/components/PatternEditor/__tests__/seamEdgeLookup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seamsOnEdge, nextSeamOnEdge } from '../seamEdgeLookup';
import type { Seam } from '../../../types/types';

const seam = (id: string, a: [string, string], b: [string, string]): Seam => ({
  id,
  pieceA: { pieceId: a[0], edgeName: a[1] },
  pieceB: { pieceId: b[0], edgeName: b[1] },
  type: 'standard',
  tension: 100,
  strength: 1,
  active: true,
  taped: false,
  tapeWidth: 10,
});

const s1 = seam('s1', ['pA', 'sideSeam'], ['pB', 'sideSeam']);
const s2 = seam('s2', ['pA', 'armhole'], ['pC', 'sleeveCap']);
const s3 = seam('s3', ['pD', 'armhole'], ['pA', 'armhole']); // pA/armhole otra vez, del lado B

describe('seamsOnEdge', () => {
  it('encuentra la costura por la mitad A', () => {
    expect(seamsOnEdge([s1, s2, s3], 'pA', 'sideSeam').map(s => s.id)).toEqual(['s1']);
  });

  it('encuentra la costura por la mitad B', () => {
    expect(seamsOnEdge([s1, s2, s3], 'pB', 'sideSeam').map(s => s.id)).toEqual(['s1']);
  });

  it('devuelve TODAS las costuras de un borde que lleva varias', () => {
    expect(seamsOnEdge([s1, s2, s3], 'pA', 'armhole').map(s => s.id)).toEqual(['s2', 's3']);
  });

  it('un borde libre no devuelve nada', () => {
    expect(seamsOnEdge([s1, s2, s3], 'pA', 'neckline')).toEqual([]);
  });

  it('no confunde piezas distintas con el mismo nombre de borde', () => {
    expect(seamsOnEdge([s1, s2, s3], 'pZ', 'sideSeam')).toEqual([]);
  });
});

describe('nextSeamOnEdge', () => {
  it('sin selección previa devuelve la primera', () => {
    expect(nextSeamOnEdge([s2, s3], null)?.id).toBe('s2');
  });

  it('cicla a la siguiente', () => {
    expect(nextSeamOnEdge([s2, s3], 's2')?.id).toBe('s3');
  });

  it('desde la última vuelve a la primera', () => {
    expect(nextSeamOnEdge([s2, s3], 's3')?.id).toBe('s2');
  });

  it('si la seleccionada no está en la lista, empieza por la primera', () => {
    expect(nextSeamOnEdge([s2, s3], 's1')?.id).toBe('s2');
  });

  it('lista vacía devuelve null', () => {
    expect(nextSeamOnEdge([], null)).toBeNull();
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/seamEdgeLookup.test.ts`
Expected: FAIL — `Failed to resolve import "../seamEdgeLookup"`.

- [ ] **Step 3: Implementar el lookup**

Crear `src/components/PatternEditor/seamEdgeLookup.ts`:

```ts
import type { Seam } from '../../types/types';

/**
 * Qué costuras tocan este borde, mirando las dos mitades.
 *
 * Un borde puede llevar más de una costura a propósito: una manga contra dos
 * mitades de sisa, un canesú partido. Por eso devuelve una lista y no una sola
 * — y por eso el modo Editar es un modo y no un hit-test que sustituya al de
 * crear (#219).
 */
export function seamsOnEdge(seams: Seam[], pieceId: string, edgeName: string): Seam[] {
  return seams.filter(s =>
    (s.pieceA.pieceId === pieceId && s.pieceA.edgeName === edgeName) ||
    (s.pieceB.pieceId === pieceId && s.pieceB.edgeName === edgeName),
  );
}

/** Clic repetido sobre el mismo borde: cicla por sus costuras. */
export function nextSeamOnEdge(onEdge: Seam[], currentId: string | null): Seam | null {
  if (onEdge.length === 0) return null;
  const i = currentId ? onEdge.findIndex(s => s.id === currentId) : -1;
  return onEdge[(i + 1) % onEdge.length];
}
```

- [ ] **Step 4: Correr y verlo pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/seamEdgeLookup.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Escribir el test del hook**

Crear `src/components/PatternEditor/__tests__/useSeamEditTool.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import editorReducer from '../../../store/editorSlice';
import { useSeamEditTool } from '../useSeamEditTool';
import type { PatternPiece, Seam } from '../../../types/types';

const square = (id: string, x: number): PatternPiece => ({
  id, name: id,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  position: { x, y: 0 },
  rotation: 0, mirrored: false, seamAllowance: 0, internals: [],
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
});

const pieces = [square('pA', 0), square('pB', 300)];

const seam: Seam = {
  id: 's1',
  pieceA: { pieceId: 'pA', edgeName: 'edge-1' },
  pieceB: { pieceId: 'pB', edgeName: 'edge-1' },
  type: 'standard', tension: 100, strength: 1,
  active: true, taped: false, tapeWidth: 10,
};

let store: ReturnType<typeof configureStore>;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(Provider, { store }, children);
}

function ev(clientX: number, clientY: number, button = 0) {
  return {
    button, clientX, clientY,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }) },
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

beforeEach(() => {
  store = configureStore({ reducer: { editor: editorReducer } });
});

describe('useSeamEditTool', () => {
  it('clicar un borde cosido selecciona su costura', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    expect((store.getState() as { editor: { selectedSeamId: string | null } })
      .editor.selectedSeamId).toBe('s1');
  });

  it('clicar un borde libre NO selecciona ni crea nada', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(100, 50)); }); // borde derecho de pA
    expect((store.getState() as { editor: { selectedSeamId: string | null } })
      .editor.selectedSeamId).toBeNull();
  });

  it('pasar el ratón sobre un borde cosido enciende su costura', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseMove(ev(50, 0)); });
    expect(result.current.hoveredSeamId).toBe('s1');
  });

  it('salirse del borde apaga el hover', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseMove(ev(50, 0)); });
    act(() => { result.current.handleMouseMove(ev(50, 50)); }); // centro de la pieza
    expect(result.current.hoveredSeamId).toBeNull();
  });

  it('Escape deselecciona', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0)); });
    act(() => { result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect((store.getState() as { editor: { selectedSeamId: string | null } })
      .editor.selectedSeamId).toBeNull();
  });

  it('el botón derecho no toca la selección', () => {
    const { result } = renderHook(
      () => useSeamEditTool(1, { x: 0, y: 0 }, pieces, [seam]),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(ev(50, 0, 2)); });
    expect((store.getState() as { editor: { selectedSeamId: string | null } })
      .editor.selectedSeamId).toBeNull();
  });
});
```

- [ ] **Step 6: Correrlo y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/useSeamEditTool.test.tsx`
Expected: FAIL — `Failed to resolve import "../useSeamEditTool"`.

- [ ] **Step 7: Implementar el hook**

Crear `src/components/PatternEditor/useSeamEditTool.ts`:

```ts
import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { selectSeam, clearSelection } from '../../store/editorSlice';
import type { PatternPiece, Point2D, Seam } from '../../types/types';
import { screenToPattern, resolveEdgeName } from './sewingUtils';
import { snapToAnyEdge } from './useSegmentSewingTool';
import { seamsOnEdge, nextSeamOnEdge } from './seamEdgeLookup';

/**
 * Editar costuras (#219). El gemelo de inspección de la herramienta de coser.
 *
 * María: "si clico una linea que lleva costura para entender con que otra línea
 * esta cosida, no siempre me muestra esa información [...] es como si estuviera
 * en modo volver a aplicar costura a esa línea."
 *
 * El resalte de ambas mitades YA existe (SeamRenderer lo pinta cuando hay una
 * costura seleccionada). Lo que faltaba era una puerta: aquí el objetivo del
 * hit-test es el BORDE entero, no el trazo de 2,5 px de la costura.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 4.3
 */
export function useSeamEditTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  seams: Seam[],
) {
  const dispatch = useDispatch();
  const selectedSeamId = useSelector((s: RootState) => s.editor.selectedSeamId);
  const [hoveredSeamId, setHoveredSeamId] = useState<string | null>(null);

  /** Qué costuras hay bajo el cursor, por el borde que engancha. */
  const seamsUnder = useCallback((e: React.MouseEvent<SVGSVGElement>): Seam[] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    const snap = snapToAnyEdge(pt, pieces, zoom, undefined, undefined);
    if (!snap) return [];
    const piece = pieces.find(p => p.id === snap.pieceId);
    if (!piece) return [];
    return seamsOnEdge(seams, snap.pieceId, resolveEdgeName(piece, snap.edgeIndex));
  }, [zoom, pan, pieces, seams]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const onEdge = seamsUnder(e);
    // Borde libre: no pasa nada, a propósito. Crear es la otra herramienta.
    if (onEdge.length === 0) return;
    const next = nextSeamOnEdge(onEdge, selectedSeamId);
    if (next) dispatch(selectSeam(next.id));
  }, [seamsUnder, selectedSeamId, dispatch]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const onEdge = seamsUnder(e);
    setHoveredSeamId(onEdge[0]?.id ?? null);
  }, [seamsUnder]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') dispatch(clearSelection());
  }, [dispatch]);

  return { hoveredSeamId, handleMouseDown, handleMouseMove, handleKeyDown };
}
```

- [ ] **Step 8: Correr y verlo pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/useSeamEditTool.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 9: Registrar la herramienta en la unión de tipos**

En `src/types/types.ts`, justo después de la línea `| 'seam'         // connect edges between pieces`, añadir:

```ts
  | 'seamEdit'     // inspect existing seams — the CLO3D "Edit Sewing" half (#219)
```

- [ ] **Step 10: Cablear la herramienta en el editor**

En `src/components/PatternEditor/PatternEditor.tsx`, junto a las demás instancias de hooks de herramienta (cerca de la línea 199):

```ts
const seamEditTool = useSeamEditTool(zoom2D, pan2D, pieces, seams);
```

Añadir el import correspondiente, y `seamEditTool` al objeto `tools` que se pasa a `useEditorInteractions` (la lista de la línea 566).

En `src/components/PatternEditor/useEditorInteractions.ts`:
- añadir `seamEditTool` al tipo del objeto `tools` (cerca de `:173`) y al destructuring (`:293`);
- en keyDown, junto a `:382`: `if (activeTool === 'seamEdit') handlers.push(seamEditTool.handleKeyDown);`
- en mouseDown, junto a `:580`: `if (activeTool === 'seamEdit') { seamEditTool.handleMouseDown(e); return; }`
- en mouseMove, junto a `:842`: `if (activeTool === 'seamEdit') seamEditTool.handleMouseMove(e);`
- en `getCursor`, junto a `:971`: `case 'seamEdit': return 'pointer';`
- añadir `seamEditTool` a los arrays de dependencias de esos `useCallback`.

- [ ] **Step 11: Gates y commit**

```bash
npx tsc -b --noEmit && npm run lint && npm run test
git add -A
git commit -m "feat(sew): herramienta de editar costuras — el borde entero es el objetivo (#219, #1028)"
```

---

## Task 5: Teclas y dock

**Files:**
- Modify: `src/shortcuts/defaults.ts:66-72`
- Modify: `src/hooks/useKeyboardShortcuts.ts:217`
- Modify: `src/components/shell/dock2dTools.ts:34`
- Modify: `src/store/dockSlice.ts:26-52`
- Modify: `src/store/__tests__/dockSlice.test.ts`
- Modify: `src/components/shell/__tests__/dock2dTools.test.ts`

**Interfaces:**
- Consumes: el id `'seamEdit'` de la Tarea 4.
- Produces: `LEGACY_DEFAULT_DOCK_2D_IDS_V3` y un `DEFAULT_DOCK_2D_IDS` de 10 ids.

- [ ] **Step 1: Escribir el test de la migración del dock**

En `src/store/__tests__/dockSlice.test.ts`, añadir dentro del `describe` que ya prueba `migrateDefaultDockTools`:

```ts
  it('el default vigente de 9 migra al de 10 con seamEdit', () => {
    expect(migrateDefaultDockTools([...LEGACY_DEFAULT_DOCK_2D_IDS_V3]))
      .toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('seamEdit va justo detrás de seam', () => {
    const i = DEFAULT_DOCK_2D_IDS.indexOf('seam');
    expect(DEFAULT_DOCK_2D_IDS[i + 1]).toBe('seamEdit');
  });

  it('un set personalizado sigue respetándose byte a byte', () => {
    const custom = ['select', 'seam'];
    expect(migrateDefaultDockTools(custom)).toEqual(custom);
  });
```

Añadir `LEGACY_DEFAULT_DOCK_2D_IDS_V3` al import de ese archivo de test.

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/store/__tests__/dockSlice.test.ts`
Expected: FAIL — `LEGACY_DEFAULT_DOCK_2D_IDS_V3` no existe.

- [ ] **Step 3: Migrar el default del dock**

En `src/store/dockSlice.ts`, tras el bloque de `LEGACY_DEFAULT_DOCK_2D_IDS_V2` (línea 34), añadir:

```ts
/** Default de nueve, previo a partir coser en crear/editar (#1028). */
export const LEGACY_DEFAULT_DOCK_2D_IDS_V3 = [
  'select', 'editPattern', 'point', 'pen', 'line',
  'rectangle', 'scissors', 'measure', 'seam',
] as const;
```

Sustituir el bloque de `DEFAULT_DOCK_2D_IDS` (líneas 36-41) por:

```ts
/** Current default left-dock 2D tool ids, in render order. `point` entre
 *  editar y pluma: es hermano de editar, no de dibujar (maria-203).
 *  `seamEdit` justo detrás de `seam`: son las dos mitades del menú coser de
 *  CLO3D y María las busca juntas (#219). */
export const DEFAULT_DOCK_2D_IDS = [
  'select', 'editPattern', 'point', 'pen', 'line',
  'rectangle', 'scissors', 'measure', 'seam', 'seamEdit',
] as const;
```

Y añadir el nuevo legacy al `if` de `migrateDefaultDockTools` (línea 48):

```ts
  if (
    matches(LEGACY_DEFAULT_DOCK_2D_IDS) ||
    matches(LEGACY_DEFAULT_DOCK_2D_IDS_V2) ||
    matches(LEGACY_DEFAULT_DOCK_2D_IDS_V3)
  ) {
    return [...DEFAULT_DOCK_2D_IDS];
  }
```

- [ ] **Step 4: Correr y verlo pasar**

Run: `npx vitest run src/store/__tests__/dockSlice.test.ts`
Expected: PASS. El test existente que afirma el contenido exacto de `DEFAULT_DOCK_2D_IDS` (hacia `:91`) fallará: actualízalo a los diez ids.

- [ ] **Step 5: Escribir el test del catálogo del dock**

En `src/components/shell/__tests__/dock2dTools.test.ts`, añadir:

```ts
  it('el catálogo tiene las dos mitades del menú coser', () => {
    const ids = DOCK_2D_CATALOG.map(t => t.id);
    expect(ids).toContain('seam');
    expect(ids).toContain('seamEdit');
  });

  it('coser lleva N y editar costuras lleva B, como CLO3D', () => {
    expect(getDockToolById('seam')?.shortcut).toBe('N');
    expect(getDockToolById('seamEdit')?.shortcut).toBe('B');
  });
```

- [ ] **Step 6: Correrlo y verlo fallar**

Run: `npx vitest run src/components/shell/__tests__/dock2dTools.test.ts`
Expected: FAIL — `seamEdit` no está en el catálogo y `seam` sigue con `'B'`.

- [ ] **Step 7: Actualizar el catálogo**

En `src/components/shell/dock2dTools.ts`, sustituir la línea 34 por:

```ts
  { id: 'seam', icon: Spline, label: 'Coser', shortcut: 'N' },
  { id: 'seamEdit', icon: Waypoints, label: 'Editar costuras', shortcut: 'B' },
```

Añadir `Waypoints` al import de `lucide-react` de la línea 1-6.

> Los dos `label` son de trabajo. La redacción final la aprueba `solace-wren` antes de desplegar.

- [ ] **Step 8: Correr y verlo pasar**

Run: `npx vitest run src/components/shell/__tests__/dock2dTools.test.ts`
Expected: PASS.

- [ ] **Step 9: Mover las teclas**

En `src/shortcuts/defaults.ts`, sustituir el bloque de las líneas 66-68 por:

```ts
  { id: 'tool.seamEdit', key: 'b', label: 'Edit Sewing', category: 'Sewing', context: '2d' },
  { id: 'tool.seam', key: 'n', label: 'Segment Sewing', category: 'Sewing', context: '2d' },
```

Borrar la línea de `tool.freeSewing` (era `:67`) y la de `tool.freeSewingAlt` (era `:72`).

En `src/hooks/useKeyboardShortcuts.ts`, sustituir la línea 217 por:

```ts
      ['tool.seamEdit', () => activate2DTool(dispatch, 'seamEdit')],
```

y comprobar que la entrada de `tool.seam` sigue apuntando a `activate2DTool(dispatch, 'seam')`. Borrar cualquier entrada de `tool.freeSewing` / `tool.freeSewingAlt` / `tool.segmentSewing`:

```bash
grep -n "freeSewing\|segmentSewing" src/hooks/useKeyboardShortcuts.ts
```

Esperado tras el cambio: sin resultados.

- [ ] **Step 10: Comprobar que no chocan las teclas**

```bash
grep -nE "key: 'b'|key: 'n'" src/shortcuts/defaults.ts
```

Esperado: `b` solo en `tool.seamEdit`; `n` en `tool.seam` (sin shift) y en `tool.notch` (con `shift: true`). Eso no es colisión: son contextos de modificador distintos.

- [ ] **Step 11: Gates y commit**

```bash
npx tsc -b --noEmit && npm run lint && npm run test
git add -A
git commit -m "feat(sew): B edita y N cose, paridad con CLO3D; dos entradas en el dock (#219, #1028)"
```

---

## Task 6: Lo que se ve — hints y régimen de costuras

**Files:**
- Modify: `src/components/PatternEditor/renderers/HintText.tsx:9-68`
- Modify: `src/components/PatternEditor/PatternEditor.tsx:78, :817, :971-981`
- Create: `src/components/PatternEditor/renderers/__tests__/HintText.sew.test.tsx`

**Interfaces:**
- Consumes: `phase` de `useFreeSewingTool` (Tarea 3), `hoveredSeamId` de `useSeamEditTool` (Tarea 4).
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Escribir el test de los hints**

Crear `src/components/PatternEditor/renderers/__tests__/HintText.sew.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HintText from '../HintText';

const svg = (ui: React.ReactNode) => render(<svg>{ui}</svg>);

describe('HintText — coser', () => {
  it('en reposo enseña las dos mitades del gesto', () => {
    svg(<HintText activeTool="seam" seamPhase="idle" />);
    expect(screen.getByText(/clic/i)).toBeTruthy();
    expect(screen.getByText(/arrastra/i)).toBeTruthy();
  });

  it('sosteniendo la primera mitad pide la segunda pieza', () => {
    svg(<HintText activeTool="seam" seamPhase="holdingA" />);
    expect(screen.getByText(/otra pieza/i)).toBeTruthy();
  });
});

describe('HintText — editar costuras', () => {
  it('dice qué hace el clic', () => {
    svg(<HintText activeTool="seamEdit" />);
    expect(screen.getByText(/costura/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/HintText.sew.test.tsx`
Expected: FAIL — `HintText` no acepta `seamPhase` y no tiene rama para `seamEdit`.

- [ ] **Step 3: Reescribir las ramas de cosido del hint**

En `src/components/PatternEditor/renderers/HintText.tsx`:

1. En la interfaz de props (línea 9), sustituir `segmentSewingPhase?: string;` por `seamPhase?: 'idle' | 'holdingA';`.
2. En el destructuring (línea 20), sustituir `segmentSewingPhase` por `seamPhase`.
3. Borrar entero el bloque `{activeTool === 'segmentSewing' && (() => { ... })()}` (líneas 54-68, el mapa de cinco fases).
4. Borrar el bloque de `seamHasFirstEdge` (líneas 45-52).
5. Añadir en su lugar:

```tsx
      {activeTool === 'seam' && (
        <text className="hint-text" x={x} y={y}>
          {seamPhase === 'holdingA'
            ? 'Ahora marca en la otra pieza. Clic para el lado entero, o arrastra el tramo.'
            : 'Clic en un lado para coserlo entero. Arrastra para coser solo un tramo.'}
        </text>
      )}

      {activeTool === 'seamEdit' && (
        <text className="hint-text" x={x} y={y}>
          Clic en un lado cosido para ver con qué está cosido.
        </text>
      )}
```

> Los tres textos son de trabajo; `solace-wren` los aprueba antes de desplegar. Usa los mismos `x`/`y` y `className` que las otras ramas del archivo.

- [ ] **Step 4: Correr y verlo pasar**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/HintText.sew.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Actualizar el régimen de render de costuras**

En `src/components/PatternEditor/PatternEditor.tsx:78`, sustituir:

```ts
const SEWING_TOOL_IDS = new Set(['seam', 'seamEdit', 'freesewing', 'walkSeam']);
```

En la línea 817, la condición se queda igual — `SEWING_TOOL_IDS.has(activeTool) || editor.selectedSeamId != null` ya cubre las dos herramientas.

Pasar a `SeamRenderer` la señal de régimen, para que en `seamEdit` las costuras vayan a plena señal y en `seam` atenuadas:

```tsx
<SeamRenderer
  /* ...props de hoy... */
  emphasis={activeTool === 'seamEdit' ? 'full' : 'muted'}
  hoveredSeamId={activeTool === 'seamEdit' ? seamEditTool.hoveredSeamId : null}
/>
```

En `SeamRenderer.tsx`, añadir las dos props a su interfaz:

```ts
  /** 'full' en la herramienta de editar (las costuras son la capa protagonista);
   *  'muted' en la de crear, donde estorban. Spec § 4.3. */
  emphasis?: 'full' | 'muted';
  hoveredSeamId?: string | null;
```

y usarlas: cuando `emphasis === 'muted'`, multiplicar la opacidad del grupo por `0.45`; cuando `seam.id === hoveredSeamId`, tratarlo igual que `isSelected` para el ancho de trazo y el halo (la variable `isSelected` de la línea 126 pasa a `const isLit = selectedSeamId === seam.id || hoveredSeamId === seam.id;`, y se usa `isLit` donde hoy se usa `isSelected`).

En las props del `HintText` (líneas 971-981), sustituir `segmentSewingPhase={...}` por `seamPhase={seamTool.phase}` y borrar el `seamHasFirstEdge`.

**Y el tramo en vivo mientras arrastra.** Ampliación añadida el 2026-08-12, tras la revisión de la Tarea 3: hoy, durante el arrastre, `EdgePairOverlay` sigue pintando el **borde entero** resaltado, porque `hoveredTarget` se congela al armarse el gesto y `liveRange` no lo consume nadie. No es que falte feedback: es feedback **contrario** a lo que está pasando. Ella arrastra para marcar medio lado y el lienzo le dice "vas a coser el lado entero". Eso genera otra tarjeta seguro.

Primero, en `src/components/PatternEditor/useFreeSewingTool.ts`, añade el objetivo del gesto vivo a lo que devuelve el hook (el gesto ya lo tiene; solo no se re-exponía):

```ts
    /** El borde que enganchó el press, mientras el gesto sigue vivo. Con
     *  `liveRange` compone el tramo que se está marcando ahora mismo. */
    activeTarget: gesture.press,
```

Después, en `EdgePairOverlay.tsx`, añade la prop y el tramo en vivo:

```tsx
  /** El borde del press mientras el gesto sigue vivo (null fuera de gesto). */
  activeTarget: EdgeTarget | null;
  /** El rango que lleva marcado el arrastre ahora mismo (null si aún no cruzó
   *  el umbral, o si el cursor se salió del borde). */
  liveRange: [number, number] | null;
```

```tsx
  // Mientras arrastra manda el tramo en vivo. Sin esto se le sigue pintando el
  // borde entero, que es justo lo contrario de lo que está haciendo.
  const liveSegment: SegmentSelection | null = activeTarget && liveRange
    ? {
        pieceId: activeTarget.pieceId,
        edgeIndex: activeTarget.edgeIndex,
        edgeRange: activeTarget.edgeRange,
        startT: liveRange[0],
        endT: liveRange[1],
        startPoint: activeTarget.point,
        endPoint: activeTarget.point,
      }
    : null;
```

y en el render, el tramo en vivo **sustituye** al resalte de hover (no se suman): donde hoy se pinta `hoveredSegment`, pinta `liveSegment ?? hoveredSegment`. El color sigue la misma regla que ya usa el hover — `segmentA ? SEWING_PICK_SECOND : SEWING_PICK_FIRST` — y el tramo en vivo va a opacidad plena (1), no a 0.7: lo que está marcando ahora mismo no es una insinuación.

Pásale las dos props desde `PatternEditor.tsx`, donde ya se pasan `segmentA` y `hoveredTarget`.

- [ ] **Step 6: Test del tramo en vivo**

Añadir a `src/components/PatternEditor/renderers/__tests__/` (o al archivo de overlays que ya exista para esto) un test que afirme la sustitución, no solo la presencia:

```tsx
it('mientras arrastra pinta el tramo en vivo, NO el borde entero', () => {
  // activeTarget + liveRange presentes → el resalte va de 0.25 a 0.75,
  // no de 0 a 1 como haría el hover de borde entero.
});
```

Si el `SegmentHighlight` no expone su rango de forma afirmable desde el DOM, afirma sobre el `d` del path o sobre las props con las que se le llama. Lo que no vale es un test que solo compruebe que se renderizó algo.

- [ ] **Step 7: El guard del menú contextual**

Spec § 3.5: durante un arrastre, el botón derecho **cancela el gesto y suprime el menú de ese evento**. Sin esto, el menú se abre a mitad de gesto y hay que navegarlo con el botón izquierdo apretado — un cuasi-modo dentro de otro.

En `src/components/PatternEditor/PatternEditor.tsx`, al principio de `handleContextMenu` (línea 380), antes de cualquier hit-test:

```ts
    // Botón derecho con un gesto de borde vivo: cancela y no abre menú.
    if (activeTool === 'seam' && seamTool.isArmed()) {
      seamTool.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
      e.preventDefault();
      return;
    }
```

- [ ] **Step 8: Gates y commit**

```bash
npx tsc -b --noEmit && npm run lint && npm run test
git add -A
git commit -m "feat(2d): el lienzo distingue coser de editar, y el hint enseña el arrastre (#219, #1029)"
```

---

## Task 7: Retirar la herramienta de tramos

`useSegmentSewingTool.ts` pasa de hook a librería geométrica. Es la última tarea a propósito: hasta aquí el tool viejo seguía funcionando como red.

**Files:**
- Modify: `src/components/PatternEditor/useSegmentSewingTool.ts` (borrar el hook, dejar la geometría)
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (borrar instancias y props)
- Modify: `src/components/PatternEditor/useEditorInteractions.ts` (borrar ruteo)
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx` (borrar props del overlay viejo)
- Modify: `src/types/types.ts` (borrar `'segmentSewing'` de `Tool2D`)
- Modify: `src/tools/index.ts`, `src/tools/definitions/segmentSewing.tsx` (desregistrar)
- Modify: `src/components/PatternEditor/__tests__/useSegmentSewingTool.test.ts` (quitar lo que probaba las fases)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `useSegmentSewingTool.ts` sin export de hook. Siguen exportados: `snapToEdge`, `snapToAnyEdge`, `commandTToEdgeT`, `closeSegment`, `buildSegmentSeam`, `type SnapResult`, `type SegmentSelection`.

- [ ] **Step 1: Confirmar quién depende todavía del hook — en `src/` Y en `tests/`**

```bash
grep -rn "useSegmentSewingTool\|segmentSewing" src/ --include=*.ts --include=*.tsx | grep -v "__tests__"
grep -rln "segmentSewing\|freesewing" tests/e2e/
```

Anota las dos listas. Cada línea que nombre el HOOK o el TOOL se borra; las que importan geometría (`snapToEdge`, `snapToAnyEdge`, `buildSegmentSeam`, `commandTToEdgeT`, `closeSegment`, `SnapResult`, `SegmentSelection`) se quedan.

> **El segundo grep no es opcional.** La Tarea 5 se limitó a `src/` y dejó catorce aserciones de e2e apuntando a teclas que ya no existían. Aquí el riesgo es mayor: **seis specs de e2e activan `segmentSewing` por el store** (`editor-tools`, `maria-201-info-costura`, `maria-207-hover`, `seam-curved-edges`, `seam-fixes`, `seam-parity-replay`), no por tecla, y por eso sobrevivieron a aquella limpieza.

**Qué hacer con esos seis.** No se borran: lo que hacen sigue teniendo sentido. Usaban `segmentSewing` solo como puerta de entrada a la superficie de costuras, y esa puerta ahora es `seam`, que ya está en `SEWING_TOOL_IDS` y hace el mismo trabajo. **Remapea el despacho de `'segmentSewing'` a `'seam'`** y comprueba que cada spec siga afirmando lo mismo. La excepción es el test que la Tarea 5 dejó señalizado con un comentario inline en `seam-parity-replay.spec.ts` (`segment sewing parcial: 4 clicks + Enter`): ese ejercita la máquina de cuatro fases que esta tarea borra, así que **muere aquí** — bórralo junto con el comentario, y di en el commit por qué.

**Y un tercer test andamio que también muere aquí:** el de `useFreeSewingTool.tramo.test.ts` que lee el fuente de `useEditorInteractions.ts` y afirma que contiene la línea de ruteo de mouseUp de `freesewing`. Lo puso la Tarea 3 para que esa herramienta no quedara inerte mientras llegaba esta tarea. Al borrar `freesewing`, bórralo. El de `seam`, si lo hay, se queda.

- [ ] **Step 2: Borrar la máquina de fases**

En `src/components/PatternEditor/useSegmentSewingTool.ts`:
- borrar `type Phase` e `interface SegmentSewingState` (líneas 39-47);
- borrar la función `useSegmentSewingTool` entera (desde `export function useSegmentSewingTool(` en la línea 284 hasta el final del archivo);
- borrar `closeAgainstPending` (líneas 265-280) si ya no la usa nadie tras el paso anterior;
- borrar los imports que se quedaron sin uso (`useState`, `useCallback`, `useDispatch`, `useSelector`, `RootState`, `addSeam`, `selectSeam`, `newId`, `getEdgeEndpoints`, `screenToPattern`) — déjate guiar por el lint.

Cambiar la cabecera del archivo por:

```ts
/**
 * Geometría del tramo de borde — de cursor a `t` en arco del borde semántico.
 *
 * Fue un hook con máquina de cuatro fases (`segmentSewing`, tecla `N` sin botón
 * en el dock). La máquina murió al fusionarse con la herramienta de coser
 * (#1029): hoy un arrastre dice lo mismo en un gesto. Lo que queda es la
 * geometría, que es lo único que sabía hacer lo que María pide, y la consumen
 * `useFreeSewingTool` y `useSeamEditTool`.
 */
```

- [ ] **Step 3: Desregistrar la herramienta**

- `src/types/types.ts`: borrar la línea `| 'segmentSewing' // connect partial edge segments`.
- `src/tools/index.ts`: borrar el import de `segmentSewingTool` (línea 17) y su entrada en el array (línea 104).
- Borrar el archivo `src/tools/definitions/segmentSewing.tsx`.
- `src/components/PatternEditor/PatternEditor.tsx`: borrar `const segmentSewingTool = ...` (línea 306), la entrada `segmentSewingTool` del objeto `tools` (línea 566), las cinco props `segmentSewing*` que se pasan a `ToolOverlay` (líneas 910-914) y la de la línea 976. Borrar también `const freeSewingMode = ...` (línea 311) y `const freeSewingTool = seamTool;` (la línea puente que dejó la Tarea 3), y la entrada `freeSewingTool` del objeto `tools`.
- `src/components/PatternEditor/useEditorInteractions.ts`: borrar las líneas de ruteo de `segmentSewing` (keyDown `:389`, mouseDown `:590`, mouseMove `:852`, cursor `:981`), la entrada `segmentSewingTool` del tipo de `tools` (`:173`) y del destructuring (`:293`), más `freeSewingTool` en los mismos sitios, y quitarlos de los arrays de dependencias.
- `src/components/PatternEditor/renderers/ToolOverlay.tsx`: borrar las cinco props `segmentSewing*` de la interfaz (líneas 141-145) y el bloque de render `{activeTool === 'segmentSewing' && (...)}` (líneas 338-347). Si el componente que ese bloque renderizaba queda sin usar, bórralo también.

- [ ] **Step 4: Podar los tests que guardaban lo que acabas de borrar**

En `src/components/PatternEditor/__tests__/useSegmentSewingTool.test.ts`, borrar cualquier `describe`/`it` que instancie el hook o que afirme transiciones de fase. **Conservar íntegros** los de `snapToEdge`, `closeSegment` y `buildSegmentSeam`: son el contrato de la geometría que ahora sostiene la herramienta de coser.

**Y uno que se te va a poner rojo si no lo ves venir.** La Tarea 3 dejó en `src/components/PatternEditor/__tests__/useFreeSewingTool.tramo.test.ts` un test de regresión que lee el fuente de `useEditorInteractions.ts` y afirma que contiene la línea de ruteo de mouseUp de `freesewing`. Era andamio a propósito, para que esa herramienta no quedara inerte mientras llegaba esta tarea. Al borrar `freesewing` aquí, **borra también ese test** — no lo adaptes ni lo dejes pasar. El de `seam`, si lo hay, se queda.

- [ ] **Step 5: Comprobar que no queda nada colgando — en los dos sitios**

```bash
grep -rn "segmentSewing\|freeSewing\|freesewing" src/ --include=*.ts --include=*.tsx
grep -rn "segmentSewing\|freesewing" tests/e2e/
```

Del primero se espera: solo aciertos dentro de `useSegmentSewingTool.ts` (el nombre del archivo y su comentario de cabecera) y en el nombre del archivo de test. Ninguna referencia a un tool id, una tecla o un hook.

Del segundo se espera: **vacío**.

**Además, quita `'segmentSewing'` de `SEWING_TOOL_IDS`** en `PatternEditor.tsx`. La Tarea 6 lo conservó a propósito, contra la letra de su brief, porque esos seis specs lo necesitaban; una vez remapeados en el paso 1, ya no hace falta y dejarlo sería un id fantasma en un `Set` que decide qué se pinta.

> Nota heredada de la revisión de la Tarea 6: mientras `'segmentSewing'` siguió en ese `Set`, esa herramienta se pintaba a opacidad reducida (`emphasis: 'muted'`) sin que nadie lo hubiera decidido. Al borrarla, ese efecto de segundo orden desaparece solo. No hay nada que arreglar, solo que no te extrañe si lo ves al leer el diff.

- [ ] **Step 6: Gates completos**

```bash
npx tsc -b --noEmit && npm run lint && npm run test
```

Expected: todo verde. Si un test de `useFreeSewingTool.seamType.test.ts` se pone rojo por la firma sin `mode`, actualízalo: la herramienta ya no tiene modos.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(sew): segmentSewing pasa de hook a librería geométrica (#1029)"
```

---

## Task 8: El recorrido de María, de punta a punta

**Files:**
- Create: `tests/e2e/maria-199-coser-arrastrando.spec.ts`

**Interfaces:**
- Consumes: la app entera, ya construida por las tareas 1-7.
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Escribir el e2e**

Crear `tests/e2e/maria-199-coser-arrastrando.spec.ts`. **Copia literalmente** los cuatro helpers del spec hermano `tests/e2e/maria-218-eco-punto-y-mover.spec.ts` — `waitForApp`, `setTool`, `drawRectAt` y `toScreen` — pegándolos al principio del archivo nuevo. No los importes: los specs e2e de este repo son autocontenidos a propósito, y ese archivo es la referencia viva de cómo se dibuja y se cambia de herramienta desde Playwright.

Ábrelo primero y léelos:

```bash
sed -n '1,80p' tests/e2e/maria-218-eco-punto-y-mover.spec.ts
```

Ojo con `setTool`: despacha **dos** acciones (`editor/setActiveTool` y `tools/setActiveTool2D`) contra `window.__VINA_STORE__`. Con una sola no basta.

Después, el cuerpo del test:

```ts
import { test, expect } from '@playwright/test';
// ── aquí van los cuatro helpers copiados de maria-218 ──

test('coser un tramo arrastrando, y verlo en Editar costuras', async ({ page }) => {
  await waitForApp(page);

  // Dos piezas separadas
  await drawRectAt(page, 100, 100, 250, 300);
  await drawRectAt(page, 400, 100, 550, 300);

  // Coser: arrastrar un tramo del lado derecho de la primera
  await setTool(page, 'seam');
  const a1 = await toScreen(page, 250, 150);
  const a2 = await toScreen(page, 250, 250);
  await page.mouse.move(a1.x, a1.y);
  await page.mouse.down();
  await page.mouse.move(a2.x, a2.y, { steps: 10 });
  await page.mouse.up();

  // Clic entero en el lado izquierdo de la segunda
  const b = await toScreen(page, 400, 200);
  await page.mouse.click(b.x, b.y);

  // La costura existe y la mitad A lleva rango parcial
  const seam = await page.evaluate(() =>
    (window as unknown as { __VINA_STORE__: { getState: () => { project: { seams: unknown[] } } } })
      .__VINA_STORE__.getState().project.seams[0]);
  expect(seam).toBeTruthy();
  const half = seam as { pieceA: { tStart?: number; tEnd?: number } };
  expect(half.pieceA.tStart).toBeGreaterThan(0);
  expect(half.pieceA.tEnd).toBeLessThan(1);

  // Editar costuras: clicar el lado enseña la costura seleccionada
  await setTool(page, 'seamEdit');
  await page.mouse.click(b.x, b.y);
  const selected = await page.evaluate(() =>
    (window as unknown as { __VINA_STORE__: { getState: () => { editor: { selectedSeamId: string | null } } } })
      .__VINA_STORE__.getState().editor.selectedSeamId);
  expect(selected).toBeTruthy();
});
```

- [ ] **Step 2: Correrlo**

Run: `npx playwright test tests/e2e/maria-199-coser-arrastrando.spec.ts`
Expected: PASS. Si falla en el arrastre, comprueba primero con `page.evaluate` que el gesto llegó a `dragging` — el sospechoso número uno es el ruteo del mouseUp del paso 8 de la Tarea 3.

- [ ] **Step 3: Comprobar que el árbol quedó limpio**

```bash
git status --porcelain
```

Los e2e pueden reescribir baselines de capturas versionadas. Si aparecen PNG modificados que no tocaste, revíertelos: `git checkout -- <ruta>`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/maria-199-coser-arrastrando.spec.ts
git commit -m "test(e2e): el recorrido de María — coser un tramo arrastrando y verlo en Editar (#199, #219)"
```

---

## Cierre de la tanda

- [ ] Gate completo: `npx tsc -b --noEmit && npm run test && npm run lint`
- [ ] Actualizar los issues: #1028 se cierra; #1029 y #1022 se quedan abiertos con la tanda 2 nombrada; #199 se comenta con lo que cierra y lo que no.
- [ ] Pasar los textos visibles (`Coser`, `Editar costuras`, las tres frases del hint) por `solace-wren`.
- [ ] Revisión adversarial del diff antes de desplegar.
- [ ] Entrega para María siguiendo la convención de `para maria/`, con capturas del antes y el después. **Comprobar la puerta, no solo el cuarto:** que las dos herramientas tengan botón visible en el dock, no solo tecla.
