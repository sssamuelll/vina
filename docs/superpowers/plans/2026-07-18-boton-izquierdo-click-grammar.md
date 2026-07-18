# Plan de implementación — Gramática de clic-izquierdo del PatternEditor 2D (v1)

> **Para agentes de ejecución:** este plan está escrito para correrse con
> **`superpowers:subagent-driven-development`** o **`superpowers:executing-plans`**.
> Cada tarea trae sus pasos como checkboxes de 2–5 min (test que falla → correr y
> ver FAIL → implementación mínima → correr y ver PASS → commit). Marca cada
> checkbox al completarlo. No saltes el ciclo rojo/verde: el test que falla primero
> es la prueba de que estás arreglando lo correcto.

## Goal

Surface el transform box (mover/escalar/rotar) dentro del verbo `select` por defecto — cerrando la nota 170 de María — y sanear los bugs de runtime que hacen que el clic-izquierdo "apeste": el phantom-move que ensucia el historial, el cursor que miente sobre los handles, las piezas bloqueadas desprotegidas y el doble disparo de Escape.

## Architecture

El hub de interacción es `useEditorInteractions.ts`: un `handleMouseDown`/`Move`/`Up` monolítico ramificado por `activeTool`, consumido por un único sitio (`PatternEditor.tsx:494`). v1 **reutiliza** `useTransformTool` (que ya renderiza el box y hace rotate/scale) enrutándolo dentro de la rama `select` — no construye un resolver tipado, ni verbos destructivos nuevos, ni toca la altitud POINT (que sigue con `useEditCurve` tal cual hoy). Todo el cambio load-bearing vive en `useEditorInteractions.ts` más dos wirings de render (`PatternEditor.tsx`, `ToolOverlay.tsx`) y el arreglo de coordinación de Escape.

## Tech Stack

- React 18 + TypeScript (hooks, SVG inline).
- Redux Toolkit (`editorSlice`, `projectSlice`) + `undoMiddleware`.
- Vitest + `@testing-library/react` (`renderHook`, `act`), entorno jsdom.
- Geometría 2D en `src/utils/geometry` (`screenToPattern`, `screenToPatternLength`).

## Global Constraints

- **Gate antes de cada commit:** `npx tsc -b --noEmit && npm run test && npm run lint`. El pre-commit hook (Husky) corre `tsc -b` + `lint-staged` con `--max-warnings=0`; los tests los corres tú manualmente en el gate completo.
- **Prohibido `--no-verify`.** No se bypassa ningún gate.
- **IDs:** siempre `newId()` desde `src/utils/ids.ts`. No inventar IDs a mano.
- **Persistencia:** solo `storageSet`/`storageGet` desde `src/utils/storage.ts`. (Esta feature no persiste nada nuevo — no hay callsites de storage acá.)
- **Copy de UI en español** según el glosario de `docs/specs`. Esta feature no introduce strings nuevos de UI; si Iris agrega el hint "Enter confirma · Esc cancela" es otra superficie (diferida).
- **Typecheck en build mode:** `npx tsc -b --noEmit`, nunca `tsc --noEmit` pelado.

## Decisiones cerradas (no-código, registradas por el scope cut)

Estas son rulings que el plan honra por **omisión**, no por implementación. No hay código para ellas en v1:

- **Delete es selection-driven, nunca hover-driven** (F1 / 2.5). v1 **no** trae el Delete unificado. El handler existente de línea interna (`useEditorInteractions.ts:310-319`) queda intacto. Cualquier Delete futuro debe ser selection-driven, undoable y respetar `locked`.
- **No se promete Esc-mid-drag-revert para MovingPiece** (RC-2 / RC-3). El drag de pieza es DOM-only hasta el mouseup y es recuperable con Ctrl+Z; anunciar un cancel que silenciosamente no revierte sería mentir. El único drag que SÍ gana Esc-cancel es el transform drag (Tarea 5) — y ahí el cancel es limpio de verdad, porque `useTransformTool` no escribe a Redux hasta el mouseup.

---

## Tarea 1 — Gate de MIN_DRAG en el commit de mover pieza (phantom-move, EB-1/EB-2)

Hoy `handleMouseUp` despacha `movePiece` en cuanto `dragRef.current.lastPos` existe (`useEditorInteractions.ts:778-780`), sin umbral. Cualquier clic con jitter sub-pixel (o el clic #1 de un doble-clic) dispara un `movePiece` de cero intención → una entrada "Move Piece" en el historial de undo. El `MIN_DRAG` de 3px ya existe pero solo se aplica al marquee (`:731`). Esta tarea aplica el mismo umbral al commit de mover.

### Files
- **Modify** `src/components/PatternEditor/useEditorInteractions.ts`
  - Nueva const de módulo tras `MEASURE_TOOL_IDS` (`:35`).
  - Gate en `handleMouseUp` (`:777-780`).
  - Unificar el literal del marquee (`:731`) a la const nombrada.
- **Create** `src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx` (archivo nuevo con los helpers compartidos + tests de esta tarea; las tareas 3–5 le anexan describes).

### Interfaces
- Consume: `movePiece({ id, x, y })` de `projectSlice`; `screenToPatternLength(px, zoom)` de `utils/geometry`.
- Produce: `const MIN_DRAG_PX = 3;` (module scope).

### Steps

- [ ] Crear el archivo de test con los helpers compartidos y los dos tests de phantom-move. Contenido completo:

```tsx
// @vitest-environment jsdom
/**
 * useEditorInteractions — gramática de clic-izquierdo v1 (nota 170 + fixes de
 * runtime). Cubre: gate de phantom-move, enrutado del transform box en select,
 * cursor honesto sobre handles y coordinación de Escape.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { selectPiece } from '../../../store/editorSlice';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import { useEditorInteractions } from '../useEditorInteractions';
import type { PatternPiece, Tool2D } from '../../../types/types';

afterEach(cleanup);

type Tools = Parameters<typeof useEditorInteractions>[4];

/** Nodo-editor inerte: isEditing=false para que el transform box no quede
 *  suprimido por el invariante G7. */
function idleNodeEditor() {
  return {
    isEditing: false,
    hoveredNode: null,
    enterEdit: vi.fn(),
    handleMouseDown: vi.fn(() => false),
    handleMouseMove: vi.fn(() => false),
    handleMouseUp: vi.fn(),
    handleKeyDown: vi.fn(),
  };
}

/** Transform tool inerte y mutable — los tests lo sobrescriben por caso. */
function idleTransform() {
  return {
    isDragging: false,
    handleMouseDown: vi.fn(() => false),
    handleMouseMove: vi.fn(() => false),
    handleMouseUp: vi.fn(),
    handleKeyDown: vi.fn(),
    getCursor: vi.fn(() => null),
  };
}

/** Cada tool es un saco de vi.fn()s salvo los overrides explícitos. */
function makeTools(overrides: Record<string, unknown> = {}): Tools {
  const cache: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  return new Proxy({}, {
    get(_t, tool: string) {
      if (tool in overrides) return overrides[tool];
      cache[tool] ??= {};
      return new Proxy(cache[tool], {
        get(bag, method: string) {
          bag[method] ??= vi.fn();
          return bag[method];
        },
      });
    },
  }) as unknown as Tools;
}

function pieceP1(locked = false): PatternPiece {
  return {
    id: 'p1', name: 'P1', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, locked, seamAllowance: 0,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [], edges: [],
  } as unknown as PatternPiece;
}

function setup(tool: Tool2D, pieces: PatternPiece[], tools: Tools) {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, inputScheme: inputSchemeReducer },
  });
  store.dispatch(restoreState({ ...store.getState().project, pieces }));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    () => useEditorInteractions(tool, 1, { x: 0, y: 0 }, pieces, tools),
    { wrapper },
  );
  return { store, hook };
}

// zoom=1, pan=0, rect en origen → punto de pantalla === punto de patrón.
function downOn(pieceId: string | null, x: number, y: number) {
  return {
    button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    clientX: x, clientY: y,
    target: {
      closest: (_s: string) => (pieceId ? { getAttribute: () => pieceId } : null),
      ownerSVGElement: null,
    },
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}
function moveTo(x: number, y: number) {
  return {
    clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}
function projPos(store: ReturnType<typeof setup>['store']) {
  return (store.getState() as { project: { pieces: PatternPiece[] } }).project.pieces[0].position;
}

describe('gate de phantom-move (EB-1/EB-2)', () => {
  it('no despacha movePiece en un clic con jitter sub-3px', () => {
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: idleTransform() });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 100, 100)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(100, 101)); }); // 1px
    act(() => { hook.result.current.handleMouseUp(); });
    expect(projPos(store)).toEqual({ x: 0, y: 0 });
  });

  it('despacha movePiece pasado el umbral de 3px', () => {
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: idleTransform() });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 100, 100)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(100, 110)); }); // 10px
    act(() => { hook.result.current.handleMouseUp(); });
    expect(projPos(store)).toEqual({ x: 0, y: 10 });
  });
});
```

- [ ] Correr y esperar **FAIL** (el test sub-3px espera `{x:0,y:0}` pero hoy `movePiece` se despacha con `{x:0,y:1}`): `npm run test -- src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx`

- [ ] Agregar la const de módulo tras `MEASURE_TOOL_IDS` (`useEditorInteractions.ts:35`):

```ts
const MEASURE_TOOL_IDS = new Set(['measure', 'measureCurve', 'compareCurves']);

/** Umbral de arrastre (px de pantalla). Debajo de esto, un mousedown+up es un
 *  clic, no un movimiento — no ensucia el historial de undo (EB-1/EB-2). */
const MIN_DRAG_PX = 3;
```

- [ ] Reemplazar el commit de mover pieza en `handleMouseUp` (`:777-780`):

```ts
    // Commit piece position to Redux on mouseUp — solo pasado el umbral de
    // arrastre. Un clic normal tiembla sub-pixel entre down y up; sin este
    // gate cada clic despachaba un "Move Piece" de cero intención al undo
    // (EB-1/EB-2). Espeja el gate del marquee (:731).
    if (dragRef.current?.lastPos) {
      const d = dragRef.current;
      const moved = Math.hypot(d.lastPos.x - d.startPos.x, d.lastPos.y - d.startPos.y);
      if (moved >= screenToPatternLength(MIN_DRAG_PX, zoom2D)) {
        dispatch(movePiece({ id: d.pieceId, x: d.lastPos.x, y: d.lastPos.y }));
      }
    }
```

- [ ] Unificar el literal del marquee (`:731`) a la const nombrada:

```ts
      const MIN_DRAG = screenToPatternLength(MIN_DRAG_PX, zoom2D);
```

- [ ] Correr y esperar **PASS**: `npm run test -- src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx`

- [ ] Commit: `git add -A && git commit -m "fix(pattern-edit): gate de 3px en mover pieza para no ensuciar el undo (nota 170 base)"`

---

## Tarea 2 — Helper `shouldShowTransformBox` + box visible en `select` (EB-3/F7 + guard de locked, F8)

El transform box hoy solo se renderiza cuando `activeTool === 'transform'` (`ToolOverlay.tsx:232`). Esta tarea introduce un helper puro que decide la visibilidad del box (una sola fuente de verdad para render, hit y cursor), lo computa en el hook, y relaja el gate de render para incluir `select` con una selección desbloqueada. El invariante G7 (nada de box en altitud POINT) y la protección de piezas bloqueadas quedan codificados en el helper.

### Files
- **Modify** `src/components/PatternEditor/useEditorInteractions.ts`
  - Export nuevo `shouldShowTransformBox` (antes de `export function useEditorInteractions`, `:225`).
  - Computar `selectionHasLocked` + `showTransformBox` en el hook (tras el destructure de tools, `:245`).
  - Agregar `showTransformBox` al objeto de retorno (`:830`).
- **Modify** `src/components/PatternEditor/PatternEditor.tsx`
  - Destructurar `showTransformBox` del hook (`:494`).
  - Pasarlo a `ToolOverlay` (junto a `transformBbox`, `:738`).
- **Modify** `src/components/PatternEditor/renderers/ToolOverlay.tsx`
  - Prop nueva `showTransformBox: boolean` en `ToolOverlayProps` (`:97`).
  - Gate de render del box (`:232`).
- **Create** `src/components/PatternEditor/__tests__/useEditorInteractions.transformBox.test.ts` (unit puro del helper).

### Interfaces
- Produce:
```ts
export function shouldShowTransformBox(opts: {
  activeTool: Tool2D;
  isNodeEditing: boolean;
  selectedCount: number;
  selectionHasLocked: boolean;
}): boolean
```
- El hook retorna, además de lo actual, `showTransformBox: boolean`.
- `ToolOverlay` consume `showTransformBox: boolean`.

### Steps

- [ ] Crear el test puro del helper:

```ts
import { describe, it, expect } from 'vitest';
import { shouldShowTransformBox } from '../useEditorInteractions';

describe('shouldShowTransformBox', () => {
  it('siempre muestra para el tool transform standalone', () => {
    expect(shouldShowTransformBox({
      activeTool: 'transform', isNodeEditing: false, selectedCount: 0, selectionHasLocked: false,
    })).toBe(true);
  });

  it('muestra en select con una pieza seleccionada, desbloqueada y sin editar nodos', () => {
    expect(shouldShowTransformBox({
      activeTool: 'select', isNodeEditing: false, selectedCount: 1, selectionHasLocked: false,
    })).toBe(true);
  });

  it('oculta en altitud POINT (editando nodos) — invariante G7', () => {
    expect(shouldShowTransformBox({
      activeTool: 'select', isNodeEditing: true, selectedCount: 1, selectionHasLocked: false,
    })).toBe(false);
  });

  it('oculta cuando hay una pieza bloqueada en la selección (F8)', () => {
    expect(shouldShowTransformBox({
      activeTool: 'select', isNodeEditing: false, selectedCount: 1, selectionHasLocked: true,
    })).toBe(false);
  });

  it('oculta con la selección vacía', () => {
    expect(shouldShowTransformBox({
      activeTool: 'select', isNodeEditing: false, selectedCount: 0, selectionHasLocked: false,
    })).toBe(false);
  });
});
```

- [ ] Correr y esperar **FAIL** (`shouldShowTransformBox` no existe aún): `npm run test -- src/components/PatternEditor/__tests__/useEditorInteractions.transformBox.test.ts`

- [ ] Agregar el helper exportado justo antes de `export function useEditorInteractions` (`useEditorInteractions.ts:225`):

```ts
/**
 * Decide si el transform box (mover/escalar/rotar) se muestra y se hit-testea.
 * Única fuente de verdad para render (ToolOverlay), hit (handleMouseDown) y
 * cursor (getCursor) — así los tres coinciden. Reglas:
 *  - `transform` tool: siempre (comportamiento standalone intacto).
 *  - `select`: solo con selección, desbloqueada y fuera de la altitud POINT
 *    (G7: la altitud POINT nunca dibuja el box).
 */
export function shouldShowTransformBox(opts: {
  activeTool: Tool2D;
  isNodeEditing: boolean;
  selectedCount: number;
  selectionHasLocked: boolean;
}): boolean {
  if (opts.activeTool === 'transform') return true;
  return opts.activeTool === 'select'
    && !opts.isNodeEditing
    && opts.selectedCount > 0
    && !opts.selectionHasLocked;
}
```

- [ ] Computar `selectionHasLocked` + `showTransformBox` en el hook, tras el destructure de tools (`useEditorInteractions.ts:245`, después de la línea `const { pen, ... elasticTool } = tools;`):

```ts
  const selectionHasLocked = selectedPieceIds.some(
    id => pieces.find(p => p.id === id)?.locked,
  );
  const showTransformBox = shouldShowTransformBox({
    activeTool,
    isNodeEditing: nodeEditor.isEditing,
    selectedCount: selectedPieceIds.length,
    selectionHasLocked,
  });
```

- [ ] Agregar `showTransformBox` al objeto de retorno del hook (`:830`):

```ts
  return { svgRef, handleWheel, handleDoubleClick, handleMouseDown, handleMouseMove, handleMouseUp, getCursor, selectMarquee, showTransformBox };
```

- [ ] En `PatternEditor.tsx`, destructurar `showTransformBox` del hook (`:494`):

```ts
  const { svgRef, handleWheel, handleDoubleClick, handleMouseDown: editorHandleMouseDown, handleMouseMove: editorHandleMouseMove, handleMouseUp, getCursor, selectMarquee, showTransformBox } =
    useEditorInteractions(activeTool, zoom2D, pan2D, pieces, {
```

- [ ] En `PatternEditor.tsx`, pasar el prop a `ToolOverlay` (junto a `transformBbox`, `:738`):

```tsx
            showTransformBox={showTransformBox}
            transformBbox={transformTool.bbox}
```

- [ ] En `ToolOverlay.tsx`, agregar el prop a la interfaz (`:97`, junto a `transformBbox`):

```ts
  showTransformBox: boolean;
  transformBbox: BBox | null;
```

- [ ] En `ToolOverlay.tsx`, relajar el gate de render del box (`:232`):

```tsx
      {props.showTransformBox && props.transformBbox && (
        <TransformHandlesOverlay
          zoom2D={zoom2D}
          bbox={props.transformBbox}
          handles={props.transformHandles}
          preview={props.transformPreview}
        />
      )}
```

- [ ] Correr el test puro y esperar **PASS**: `npm run test -- src/components/PatternEditor/__tests__/useEditorInteractions.transformBox.test.ts`

- [ ] `npx tsc -b --noEmit` limpio.

- [ ] Commit: `git add -A && git commit -m "feat(pattern-edit): mostrar el transform box en select (nota 170), oculto en piezas bloqueadas y en edición de nodos"`

---

## Tarea 3 — Enrutar `transformTool` (down/move/up) en la rama `select` + guard de locked

El box ya se ve (Tarea 2) pero es inerte: sus handles no se hit-testean en `select`. Esta tarea rutea `transformTool.handleMouseDown/Move/Up` dentro de la rama `select`, gateado por `showTransformBox`. Con una pieza bloqueada `showTransformBox` es `false`, así que el enrutado se salta y la pieza queda protegida (F8). Añade `isDragging` a la interfaz de `transformTool` para poder rutear el move/up del drag activo.

### Files
- **Modify** `src/components/PatternEditor/useEditorInteractions.ts`
  - Interfaz `ToolHooks.transformTool`: agregar `isDragging: boolean` (`:113-119`).
  - Gate de enrutado en la rama `select` de `handleMouseDown` (`:511`).
  - Ruteo del move del drag activo en `handleMouseMove` (tras el bloque de pan, `:621`).
  - Ruteo del up del drag activo en `handleMouseUp` (`:788`).
  - Dependencias de los callbacks: agregar `showTransformBox`.
- **Modify** el archivo de test `useEditorInteractions.grammar.test.tsx` (anexar el describe de esta tarea).

### Interfaces
- Consume: `transformTool.handleMouseDown(e): boolean`, `transformTool.handleMouseMove(e): boolean`, `transformTool.handleMouseUp(): void`, `transformTool.isDragging: boolean` (todos ya producidos por `useTransformTool`).

### Steps

- [ ] Anexar el describe de enrutado al archivo `useEditorInteractions.grammar.test.tsx`:

```tsx
describe('enrutado del transform box en select', () => {
  it('rutea el handle-hit a transformTool y no despacha selectPiece/movePiece', () => {
    const tj = { ...idleTransform(), handleMouseDown: vi.fn(() => true) };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { store.dispatch(selectPiece('p1')); }); // showTransformBox → true
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 5, 5)); });
    act(() => { hook.result.current.handleMouseMove(moveTo(15, 15)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(tj.handleMouseDown).toHaveBeenCalled();
    expect(projPos(store)).toEqual({ x: 0, y: 0 }); // ningún movePiece se coló
  });

  it('rutea move y up cuando el transform drag está activo', () => {
    const tj = { ...idleTransform(), isDragging: true, handleMouseMove: vi.fn(() => true), handleMouseUp: vi.fn() };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { store.dispatch(selectPiece('p1')); });
    act(() => { hook.result.current.handleMouseMove(moveTo(20, 20)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(tj.handleMouseMove).toHaveBeenCalled();
    expect(tj.handleMouseUp).toHaveBeenCalled();
  });

  it('no rutea al transform box si la pieza está bloqueada (F8)', () => {
    const tj = { ...idleTransform(), handleMouseDown: vi.fn(() => true) };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1(true)], tools); // locked
    act(() => { store.dispatch(selectPiece('p1')); });
    act(() => { hook.result.current.handleMouseDown(downOn('p1', 5, 5)); });
    expect(tj.handleMouseDown).not.toHaveBeenCalled();
  });
});
```

- [ ] Correr y esperar **FAIL** (hoy `transformTool.handleMouseDown` nunca se llama en `select`): `npm run test -- src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx`

- [ ] Agregar `isDragging` a la interfaz `ToolHooks.transformTool` (`:113`):

```ts
  transformTool: {
    isDragging: boolean;
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: (pt: Point2D) => string | null;
  };
```

- [ ] Insertar el gate al inicio de la rama `select` de `handleMouseDown` (`:511`, justo después de `if (activeTool === 'select') {`):

```ts
    if (activeTool === 'select') {
      // Transform box en el verbo por defecto (nota 170): sus handles se hit-testean
      // primero. Gateado por showTransformBox → una pieza bloqueada (box oculto) y la
      // altitud POINT (G7) nunca rutean acá.
      if (showTransformBox) {
        const handled = transformTool.handleMouseDown(e);
        if (handled) return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
```

- [ ] Insertar el ruteo del move del drag activo en `handleMouseMove`, justo después del bloque de pan (`:621`, tras el `return;` del `if (panRef.current)`):

```ts
    if (transformTool.isDragging && activeTool === 'select') {
      transformTool.handleMouseMove(e);
      return;
    }
```

- [ ] Extender el commit de `transformTool.handleMouseUp` en `handleMouseUp` (`:788`):

```ts
    if (activeTool === 'transform' || (activeTool === 'select' && transformTool.isDragging)) transformTool.handleMouseUp();
```

- [ ] Agregar `showTransformBox` a las dependencias de `handleMouseDown` (`:606`) y de `handleMouseMove` (`:721`) — al final de cada array de deps, antes del `]`:

```ts
    /* handleMouseDown deps */ ..., pleatTool, elasticTool, showTransformBox]);
    /* handleMouseMove deps */ ..., pleatTool, elasticTool, showTransformBox]);
```

- [ ] Correr y esperar **PASS**: `npm run test -- src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx`

- [ ] `npx tsc -b --noEmit` limpio (el nuevo `isDragging` en la interfaz debe cuadrar con lo que produce `useTransformTool`).

- [ ] Commit: `git add -A && git commit -m "feat(pattern-edit): rutear rotate/scale del transform box dentro de select (nota 170)"`

---

## Tarea 4 — Cursor honesto sobre los handles (parte de F15)

Hoy `getCursor` en `select` solo devuelve `crosshair`/`grabbing`/`default` (`:805`) — nunca consulta `transformTool.getCursor`, así que el cursor miente sobre los handles de scale/rotate. Esta tarea trackea la posición de hover y expone el cursor real del handle bajo el puntero. El estado solo cambia al cruzar el borde de un handle (no por frame), así que el re-render es acotado.

### Files
- **Modify** `src/components/PatternEditor/useEditorInteractions.ts`
  - Estado `hoverCursor` (junto a los otros `useState`, `:242`).
  - Bloque de hover idle en `handleMouseMove` (tras el bloque de `nodeEditor`, `:694`).
  - Caso `select` de `getCursor` (`:805`).
- **Modify** `useEditorInteractions.grammar.test.tsx` (anexar el describe de cursor).

### Interfaces
- Consume: `transformTool.getCursor(pt: Point2D): string | null`; `screenToPattern(x, y, rect, zoom, pan)`.
- Produce: estado interno `hoverCursor: string | null`.

### Steps

- [ ] Anexar el describe de cursor:

```tsx
describe('cursor honesto sobre los handles (F15)', () => {
  it('muestra el cursor del handle al hacer hover en select con selección', () => {
    const tj = { ...idleTransform(), getCursor: vi.fn(() => 'nwse-resize') };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { store.dispatch(selectPiece('p1')); });
    act(() => { hook.result.current.handleMouseMove(moveTo(10, 10)); });
    expect(hook.result.current.getCursor()).toBe('nwse-resize');
  });

  it('devuelve default fuera de los handles', () => {
    const tj = { ...idleTransform(), getCursor: vi.fn(() => null) };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    act(() => { store.dispatch(selectPiece('p1')); });
    act(() => { hook.result.current.handleMouseMove(moveTo(10, 10)); });
    expect(hook.result.current.getCursor()).toBe('default');
  });
});
```

- [ ] Correr y esperar **FAIL** (hoy `getCursor` en select nunca devuelve `nwse-resize`): `npm run test -- src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx`

- [ ] Agregar el estado `hoverCursor` junto a `selectMarquee` (`:242`):

```ts
  const [selectMarquee, setSelectMarquee] = useState<{ start: Point2D; current: Point2D } | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);
```

- [ ] Insertar el bloque de hover idle en `handleMouseMove`, después del bloque de `nodeEditor.isEditing` (`:694`) y antes de `if (activeTool === 'transform')` (`:695`):

```ts
    // Hover idle en select: predice el clic para que el cursor diga la verdad
    // sobre los handles (nota 170). Sin drag activo → barato, acotado a ≤9
    // handles. El functional-update evita re-render salvo al cruzar un borde.
    if (activeTool === 'select') {
      let c: string | null = null;
      if (showTransformBox) {
        const rect = e.currentTarget.getBoundingClientRect();
        const pt = screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
        c = transformTool.getCursor(pt);
      }
      setHoverCursor(prev => (prev === c ? prev : c));
      return;
    }
```

- [ ] Actualizar el caso `select` de `getCursor` (`:805`):

```ts
      case 'select':
        if (dragRef.current) return 'grabbing';
        if (marqueeRef.current) return 'crosshair';
        return hoverCursor ?? 'default';
```

- [ ] Correr y esperar **PASS**: `npm run test -- src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx`

- [ ] `npx tsc -b --noEmit` limpio.

- [ ] Commit: `git add -A && git commit -m "feat(pattern-edit): cursor honesto sobre los handles del transform box en select"`

---

## Tarea 5 — Coordinación de Escape: un Esc = una acción (CF-1)

Hay dos listeners de keydown independientes: `ShortcutProvider` en `document` (`ShortcutProvider.tsx:77`) → `selection.deselect` → `clearSelection`, y el de `useEditorInteractions` en `window`. Sin coordinación, un Escape durante un transform drag despacharía `clearSelection` **y** cancelaría el drag (dos acciones). Esta tarea agrega un listener de **fase de captura** en `window` que, solo cuando hay un transform drag activo en `select`, cancela el drag y consume el evento (`stopPropagation`), de modo que el listener de `document` nunca lo ve. Cuando no hay drag, el Escape fluye normal → `clearSelection` (deseleccionar).

El orden de propagación lo garantiza la fase de captura: un listener de captura en `window` corre **antes** que el listener de burbuja de `document`; `stopPropagation()` ahí detiene toda la propagación posterior.

### Files
- **Modify** `src/components/PatternEditor/useEditorInteractions.ts`
  - `useEffect` nuevo con el listener de captura (tras el effect de keydown existente, `:346`).
- **Modify** `useEditorInteractions.grammar.test.tsx` (anexar el describe de Escape).

### Interfaces
- Consume: `transformTool.isDragging: boolean`, `transformTool.handleKeyDown(e: KeyboardEvent)` (cancela el drag; el revert es limpio porque `useTransformTool` no escribe a Redux hasta el mouseup).

### Steps

- [ ] Anexar el describe de Escape:

```tsx
describe('coordinación de Escape (CF-1)', () => {
  it('Escape durante un transform drag lo cancela y consume el evento (un Esc = una acción)', () => {
    const tj = { ...idleTransform(), isDragging: true, handleKeyDown: vi.fn() };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    void hook;
    act(() => { store.dispatch(selectPiece('p1')); });
    const docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    document.removeEventListener('keydown', docSpy);
    expect(tj.handleKeyDown).toHaveBeenCalled();
    expect(docSpy).not.toHaveBeenCalled(); // clearSelection global bloqueado
  });

  it('Escape en idle no se consume: el deselect global sigue llegando', () => {
    const tj = { ...idleTransform(), isDragging: false, handleKeyDown: vi.fn() };
    const tools = makeTools({ nodeEditor: idleNodeEditor(), transformTool: tj });
    const { hook, store } = setup('select', [pieceP1()], tools);
    void hook;
    act(() => { store.dispatch(selectPiece('p1')); });
    const docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    document.removeEventListener('keydown', docSpy);
    expect(tj.handleKeyDown).not.toHaveBeenCalled();
    expect(docSpy).toHaveBeenCalled();
  });
});
```

- [ ] Correr y esperar **FAIL** (sin el listener de captura, con drag activo el `docSpy` de `document` sí se dispara): `npm run test -- src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx`

- [ ] Insertar el `useEffect` del listener de captura tras el effect de keydown existente (`useEditorInteractions.ts:346`, después del `}, [...]);` que cierra ese effect):

```ts
  // Coordinación de Escape (CF-1): un solo Esc = una sola acción. Durante un
  // transform drag en select, la fase de CAPTURA en window corre antes que el
  // listener de document del ShortcutProvider; cancelamos el drag y detenemos la
  // propagación para que clearSelection no dispare doble. Sin drag activo el
  // Escape fluye normal → deseleccionar.
  useEffect(() => {
    const onEscapeCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (activeTool !== 'select') return;
      if (!transformTool.isDragging) return;
      transformTool.handleKeyDown(e);
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onEscapeCapture, { capture: true });
    return () => window.removeEventListener('keydown', onEscapeCapture, { capture: true });
  }, [activeTool, transformTool]);
```

- [ ] Correr y esperar **PASS**: `npm run test -- src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx`

- [ ] Gate completo: `npx tsc -b --noEmit && npm run test && npm run lint`

- [ ] Commit: `git add -A && git commit -m "fix(pattern-edit): coordinar Escape en select (un Esc = una acción) para no cancelar drag y deseleccionar a la vez"`

---

## Auto-revisión antes de cerrar

**Cobertura vs el core shippable del MODELO FINAL v1 (según el scope cut de Cassian):**

| Ítem del core (HARD) | Tarea | Estado |
|---|---|---|
| EB-1/EB-2 phantom-move: gate de 3px en mover pieza | 1 | ✅ |
| EB-3/F7 transform box en `select` (render) | 2 | ✅ |
| EB-3/F7 transform box en `select` (rotate/scale funcional) | 3 | ✅ |
| F8 guard de pieza bloqueada (box + hit) | 2 (helper) + 3 (gate) | ✅ |
| F15 cursor honesto sobre handles | 4 | ✅ |
| CF-1 Escape: un Esc = una acción | 5 | ✅ |
| F1/2.5 Delete referent → resuelto por deferral (decisión) | — | ✅ registrada arriba |
| RC-2/RC-3 no prometer Esc-mid-drag-revert de MovingPiece (decisión) | — | ✅ registrada arriba |
| `a` como acelerador (el box ya aparece con la selección; icono en dock = Iris) | — | ✅ sin código, delegado |

**Placeholder scan:** cero "TBD", cero "similar a la Tarea N", cero pasos de código sin código. Cada test trae su cuerpo vitest real; cada implementación su código real.

**Consistencia de tipos entre tareas:** `MIN_DRAG_PX` (T1) usado solo en el hook. `shouldShowTransformBox` (T2) exportado y consumido por su test, por el hook y por `PatternEditor`. `ToolHooks.transformTool.isDragging` (T3) cuadra con lo que ya retorna `useTransformTool` (`useTransformTool.ts:193`). `showTransformBox` fluye hook→`PatternEditor`→`ToolOverlay` (prop tipado `boolean`). `hoverCursor: string | null` (T4) local. El listener de Escape (T5) consume `isDragging`/`handleKeyDown` ya declarados en la interfaz por T3. No hay ningún tipo/función referenciado sin definir.

**Regresiones cubiertas:** los tests de `useEditorInteractions.reset.test.tsx` (reset-on-switch) y `useEditPattern.test.tsx` (altitud POINT intacta) deben seguir verdes — v1 no toca `useEditCurve`/`useEditPattern` ni los effects de reset. Correr el gate completo lo confirma.

---

## Diferido (POST-SHIP, con disparador)

Todo esto queda **fuera de v1** por decisión del scope cut. Cada uno con su precondición de revival:

- **Resolver tipado `HitTarget` (D2).** Disparador: un segundo consumer necesita una prioridad de hit distinta (modo edge-first, fase seam-select). Hoy hay un solo consumer → reusar el hit-test propio de `useTransformTool`.
- **G1 deep-pick (Cmd/Ctrl+click).** Disparador: medir que María realmente busca el pick de objeto enterrado. Necesita el resolver + subtipo de notch (F2) + detección de plataforma (que no existe, UC-1) + resolver la colisión con `contextmenu` en macOS.
- **G3 Delete unificado target-sensitive + delete-piece como verbo.** Disparador: ship del contrato completo — undoable, respeta `locked`, cascade-limpia seams cross-pieza. Decisión ya tomada: selection-driven, nunca hover-driven.
- **G4 Esc de dos niveles en las 10 creation tools.** Disparador: construir primero la interfaz de tool-lifecycle (`pending()`/`cancel()`/`exit()`) que Richter 2.8 exige — convenciones copiadas a mano son el mecanismo mismo de F16.
- **G6 hover-highlight de la pieza.** Disparador: medir que la discoverability del hit es dolor real. Perf sin cota en DXF apilados (F13/CI-2).
- **G5 alt-drag duplicate · G8 doble-clic vacío zoom-to-fit · G10 spring quasimode.** Nice-to-have, no core.
- **G9 hint de salida "Enter confirma · Esc cancela".** Superficie de Iris Tane (glifo/placement/estilo). El comportamiento se difiere junto con G4.
- **G2 reset de line + seam al cambiar de tool (F16).** **SOFT.** Disparador: **jálalo a v1 solo si la semana cierra temprano.** Requiere agregar `reset()` a `useLineTool` y a `useFreeSewingTool` (que hoy no lo exponen) + los dos effects espejo de `:299-307` — toca hooks fuera del diff `select`-only, por eso queda como soft-no-shipeado.
- **Consolidación del editor de puntos (`useEditPattern` detrás del doble-clic, #171 in-altitud).** Disparador: su propia task con sus tests. Hoy el doble-clic abre `useEditCurve` (`:439`); v1 deja la altitud POINT **exactamente como está**.
- **Esc-mid-drag-revert para MovingPiece / DraggingILEndpt.** Cortado como promesa: el drag de pieza es DOM-only y recuperable con undo; anunciar un cancel que no revierte sería mentir.
- **`v` como puerta de teclado a la altitud POINT (F5).** Hoy `tool.editCurve` (`v`) está bindeado pero sin branch de ruteo — dead code. Fuera de scope.
- **Cursor de calibración honesto (F15, resto).** El hook nunca recibe `calibrationMode` (es local de `PatternEditor`, `:602`); cerrarlo requiere threadear estado nuevo → fuera del diff `select`-only.
- **Cortes visuales de Iris:** grey de piezas inertes, un box para multi-selección (9 handles, no 9×N), dim al 40% en altitud POINT, hover como stroke sin fill, mínimo de zoom para colapsar handles, SVG custom del cursor rotate. Superficie de Iris Tane; se revisan cuando shippen las features que dependen de ellas.
- **Rechazados (quedan rechazados):** R1 (doble-clic body → zoom, destruye la única puerta a POINT), R2 (split tap-vs-hold de 200ms, modo temporal invisible), R3 (spring por hold de tool-key, re-importa el modo de timing).

---

## Addendum v1.1 — Curación de menús contextuales (2026-07-18)

Este addendum continúa el plan de la gramática de clic-izquierdo (Tareas 1–5) y aterriza el **mandato del dueño**: la curación de las dos superficies de acción (barra flotante + menú de clic-derecho) vive en **un único módulo declarativo** — `src/components/PatternEditor/actionCuration.ts` — que exporta el registro de verbos (`ACTIONS`, propiedad de ingeniería) y la tabla de curación (`CURATION`, propiedad de María). Ambas superficies leen esa misma tabla; curar en el futuro = editar filas de `CURATION`, nunca tocar componentes. Por eso las tareas se ordenan así: **la tabla aterriza primero con sus propios tests (Tarea 6)**, y recién entonces cada superficie la consume. El core que shippea en esta ventana es el **menú de clic-derecho (Surface B, Tarea 7)** — un swap de builder sobre código existente, independiente de T1–T5, con hide-not-disable, gate `!locked` en todo verbo mutador/destructivo (arregla los dos BLOCKERS: `removePiece`/rotate/flip ungated sobre piezas bloqueadas), y separadores por-frontera-de-grupo (mata el bug del separador vacío). La **barra flotante (Surface A)** cabalga interfaces de T1–T5 sin mergear y carga toda la deuda visual (íconos, colisión de azul, threading de `calibrationMode`): se difiere en bloque a la subsección **Diferido del addendum**, con su disparador de revival (merge de T1–T5). La tabla ya autora las columnas `bar` (data lista, apagada por `BAR_ENABLED_KINDS`) para que Surface A la consuma sin cirugía cuando llegue.

---

## Tarea 6 — Módulo declarativo de curación (`actionCuration.ts`) + tests de la tabla

Aterriza la única pieza nueva de lógica: el registro `ACTIONS` (id → verbo existente, con procedencia citada — cierra "solo verbos existentes"), la tabla `CURATION` (filas §2.3 que María edita), y los tres puros que ambas superficies comparten: `resolveTargetKind` (F11: firma normalizada, `point.*` solo con hit-test), `matchRow` (F6: fallback vacío, sin crash) y los lectores `resolveMenuActions`/`resolveBarActions`. El gate `!locked` (F2) se codifica en los `ActionDef` mutadores/destructivos; la fila `multiPiece` **no autora** el id de borrado (F3); ningún slot muerto `5.—` (se autora el conteo real). Cero dependencia de T1–T5.

### Files
- **Create** `src/components/PatternEditor/actionCuration.ts` (módulo declarativo: tipos + `ACTIONS` + `CURATION` + `resolveTargetKind` + `matchRow` + `resolveMenuActions` + `resolveBarActions`).
- **Create** `src/components/PatternEditor/__tests__/actionCuration.test.ts` (tests puros de la tabla y los resolvers).

### Interfaces
- Consume (verbos existentes): `projectSlice` (`removePiece`, `removeSeam`, `reverseSeam`, `rotatePiece`, `duplicatePiece`, `flipPieceH`, `flipPieceV`, `linkPieces`, `unlinkPieces`, `cloneAsLinked`, `bringToFront`, `sendToBack`, `bringForward`, `sendBackward`, `lockPiece`, `unlockPiece`, `addPiece`, `createGroup`, `addPiecesToGroup`, `removePiecesFromGroup`, `deactivatePiece`, `setLayer`, `setSublayer`, `cloneToLayer`, `removeInternalLine` — `projectSlice.ts:518`), `editorSlice` (`selectPiece`, `clearSelection`, `copyPieces`, `createPastedPieces`, `enterSuperimposePickMode`), `inspectorSlice` (`dispatchInspectPiece` — `:221`); tipos `PatternPiece`/`InternalLine`/`InternalLineType`/`Seam`/`PieceGroup` (`types.ts`), `WorkflowStage` (`selectors.ts:28`), `AppDispatch` (`store/index.ts:128`), `SubMenuItem` (`shared/SubMenu`).
- Produce:
```ts
export type TargetKind =
  | 'piece' | 'multiPiece' | 'seam'
  | 'il.notch' | 'il.grainline' | 'il.fold' | 'il.dart' | 'il.other'
  | 'point.node' | 'point.segment' | 'emptyCanvas';
export type GroupId = 'clipboard' | 'transform' | 'order' | 'organize' | 'linked' | 'identity' | 'danger';
export type ActionId = /* unión enumerada — ver módulo */ string;
export interface CurationCtx { /* datos resueltos + dispatch + callbacks + onClose */ }
export interface ActionDef { id; label; icon; shortcut?; group; danger?; gate?; run; submenu?; }
export interface CurationRow { targetKind; stage; altitude; bar: ActionId[]; menu: ActionId[]; }
export const ACTIONS: Record<ActionId, ActionDef>;
export const CURATION: CurationRow[];
export const BAR_MAX_VISIBLE = 5;
export const BAR_ENABLED_KINDS: Set<TargetKind>;
export function resolveTargetKind(t: TargetInput): TargetKind;
export function matchRow(key): CurationRow | null;
export function resolveMenuActions(ctx: CurationCtx): ActionDef[];
export function resolveBarActions(ctx: CurationCtx): ActionDef[];
```

### Steps

- [ ] Crear el test puro del módulo con todos los invariantes. Contenido completo:

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  ACTIONS, CURATION, BAR_MAX_VISIBLE, BAR_ENABLED_KINDS,
  resolveTargetKind, matchRow, resolveMenuActions, resolveBarActions,
  type CurationCtx, type ActionId, type TargetKind,
} from '../actionCuration';
import type { AppDispatch } from '../../../store';
import type { PatternPiece } from '../../../types/types';

function pieceFix(locked = false): PatternPiece {
  return {
    id: 'p1', name: 'P1', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, locked, seamAllowance: 0, outline: [], internals: [], edges: [],
  } as unknown as PatternPiece;
}

function makeCtx(over: Partial<CurationCtx> = {}): CurationCtx {
  return {
    dispatch: vi.fn() as unknown as AppDispatch,
    targetKind: 'piece', stage: 'drafted', altitude: 'body',
    pieceId: 'p1', piece: pieceFix(), selectedPieceIds: ['p1'],
    seamId: null, seam: null,
    internalLineId: null, internalLineType: null, internalLine: null,
    segmentIndex: undefined, segmentIsCurve: undefined,
    clipboard: null, groups: [], pieces: [pieceFix()],
    cb: {}, onClose: vi.fn(),
    ...over,
  };
}

describe('resolveTargetKind — precedencia y refinamiento de altitud', () => {
  it('seam gana sobre línea interna y sobre pieza', () => {
    expect(resolveTargetKind({
      seamId: 's1', pieceId: 'p1', pieceCount: 1,
      internalLineType: 'notch', altitude: 'body', segmentHit: false,
    })).toBe('seam');
  });
  it('línea interna gana sobre pieza; el subtipo cae en su cubo', () => {
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'notch', altitude: 'body' })).toBe('il.notch');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'grainline', altitude: 'body' })).toBe('il.grainline');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'fold', altitude: 'body' })).toBe('il.fold');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'dart', altitude: 'body' })).toBe('il.dart');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'pleat', altitude: 'body' })).toBe('il.other');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'seam', altitude: 'body' })).toBe('il.other');
  });
  it('pieza única, multi y vacío', () => {
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: null, altitude: 'body' })).toBe('piece');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 3, internalLineType: null, altitude: 'body' })).toBe('multiPiece');
    expect(resolveTargetKind({ seamId: null, pieceId: null, pieceCount: 0, internalLineType: null, altitude: 'body' })).toBe('emptyCanvas');
  });
  it('altitud POINT: segmentHit → point.segment, si no → point.node (F11)', () => {
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: null, altitude: 'point', segmentHit: true })).toBe('point.segment');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: null, altitude: 'point', segmentHit: false })).toBe('point.node');
  });
});

describe('matchRow — especificidad y fallback', () => {
  it('empareja la fila del targetKind con stage/altitud comodín', () => {
    const row = matchRow({ targetKind: 'piece', stage: 'sewn', altitude: 'body' });
    expect(row?.targetKind).toBe('piece');
  });
  it('devuelve null si ningún targetKind matchea (F6: sin crash)', () => {
    const row = matchRow({ targetKind: 'unknownKind' as TargetKind, stage: 'drafted', altitude: 'body' });
    expect(row).toBeNull();
  });
});

describe('integridad de CURATION', () => {
  it('todo id de bar y menu existe en ACTIONS', () => {
    for (const row of CURATION) {
      for (const id of [...row.bar, ...row.menu]) {
        expect(ACTIONS[id], `id sin ActionDef: ${id}`).toBeDefined();
      }
    }
  });
  it('paridad: bar ⊆ menu en cada fila', () => {
    for (const row of CURATION) {
      for (const id of row.bar) {
        expect(row.menu, `${row.targetKind}: ${id} en bar pero no en menu`).toContain(id);
      }
    }
  });
  it('ningún verbo danger vive en bar', () => {
    for (const row of CURATION) {
      for (const id of row.bar) {
        expect(ACTIONS[id].danger, `danger en bar: ${id}`).not.toBe(true);
      }
    }
  });
  it('bar autorada no excede el cap de 5', () => {
    for (const row of CURATION) {
      expect(row.bar.length).toBeLessThanOrEqual(BAR_MAX_VISIBLE);
    }
  });
  it('la fila multiPiece NO autora el borrado (F3: verbo diferido = fuera de pantalla)', () => {
    const multi = CURATION.find(r => r.targetKind === 'multiPiece');
    expect(multi).toBeDefined();
    expect(multi!.menu).not.toContain('deletePiece' as ActionId);
    expect(multi!.bar).not.toContain('deletePiece' as ActionId);
  });
});

describe('gate !locked en el menú de pieza (F2)', () => {
  it('pieza bloqueada oculta rotate/flip/delete y conserva desbloquear/copiar/seleccionar', () => {
    const ctx = makeCtx({ piece: pieceFix(true), pieces: [pieceFix(true)] });
    const ids = resolveMenuActions(ctx).map(d => d.id);
    expect(ids).not.toContain('rotate90');
    expect(ids).not.toContain('flipH');
    expect(ids).not.toContain('flipV');
    expect(ids).not.toContain('deletePiece');
    expect(ids).toContain('lockToggle');
    expect(ids).toContain('copy');
    expect(ids).toContain('select');
  });
  it('pieza desbloqueada sí muestra rotate/flip/delete', () => {
    const ids = resolveMenuActions(makeCtx()).map(d => d.id);
    expect(ids).toContain('rotate90');
    expect(ids).toContain('flipH');
    expect(ids).toContain('deletePiece');
  });
});

describe('resolveBarActions — cap, no-danger y BAR_ENABLED_KINDS', () => {
  it('pieza desbloqueada: barra rankeada, ≤5, sin danger', () => {
    const bar = resolveBarActions(makeCtx()).map(d => d.id);
    expect(bar).toEqual(['rotate90', 'duplicate', 'flipH', 'properties', 'lockToggle']);
    expect(bar.length).toBeLessThanOrEqual(BAR_MAX_VISIBLE);
    for (const id of bar) expect(ACTIONS[id].danger).not.toBe(true);
  });
  it('targetKind fuera de BAR_ENABLED_KINDS (seam) → barra vacía', () => {
    expect(BAR_ENABLED_KINDS.has('seam')).toBe(false);
    expect(resolveBarActions(makeCtx({ targetKind: 'seam' }))).toEqual([]);
  });
  it('paste se oculta sin clipboard y aparece con clipboard', () => {
    const empty = makeCtx({ targetKind: 'emptyCanvas', pieceId: null, piece: null });
    expect(resolveMenuActions(empty).map(d => d.id)).not.toContain('paste');
    const withClip = makeCtx({ targetKind: 'emptyCanvas', pieceId: null, piece: null, clipboard: { pieces: [pieceFix()] } });
    expect(resolveMenuActions(withClip).map(d => d.id)).toContain('paste');
  });
});
```

- [ ] Correr y esperar **FAIL** (el módulo `../actionCuration` no existe aún → todos los imports fallan): `npm run test -- src/components/PatternEditor/__tests__/actionCuration.test.ts`

- [ ] Crear el módulo `src/components/PatternEditor/actionCuration.ts` con el código completo:

```ts
/**
 * actionCuration — tabla declarativa de acciones contextuales del PatternEditor 2D.
 *
 * Módulo ÚNICO que ambas superficies consumen (mandato del dueño):
 *  - ACTIONS  → registro de verbos EXISTENTES (propiedad de ingeniería).
 *  - CURATION → tabla de ranking/selección por contexto (propiedad de María).
 * Curar = editar filas de CURATION; nunca tocar componentes.
 *
 * Surface B (menú derecho) consume `resolveMenuActions`. Surface A (barra) —
 * diferida hasta el merge de T1–T5 — consumirá `resolveBarActions`. La columna
 * `bar` ya está autorada (data lista, apagada por BAR_ENABLED_KINDS) para que
 * Surface A la lea sin cirugía.
 */
import type { AppDispatch } from '../../store';
import type { PatternPiece, InternalLine, InternalLineType, Seam, PieceGroup } from '../../types/types';
import type { WorkflowStage } from '../../store/selectors';
import type { SubMenuItem } from '../shared/SubMenu';
import {
  removePiece, removeSeam, reverseSeam, rotatePiece, duplicatePiece,
  flipPieceH, flipPieceV, linkPieces, unlinkPieces, cloneAsLinked,
  bringToFront, sendToBack, bringForward, sendBackward, lockPiece, unlockPiece,
  addPiece, createGroup, addPiecesToGroup, removePiecesFromGroup, deactivatePiece,
  setLayer, setSublayer, cloneToLayer, removeInternalLine,
} from '../../store/projectSlice';
import { selectPiece, clearSelection, copyPieces, createPastedPieces, enterSuperimposePickMode } from '../../store/editorSlice';
import { dispatchInspectPiece } from '../../store/inspectorSlice';

// ── Vocabulario ──────────────────────────────────────────────────────────────

export type TargetKind =
  | 'piece' | 'multiPiece' | 'seam'
  | 'il.notch' | 'il.grainline' | 'il.fold' | 'il.dart' | 'il.other'
  | 'point.node' | 'point.segment' | 'emptyCanvas';

export type GroupId = 'clipboard' | 'transform' | 'order' | 'organize' | 'linked' | 'identity' | 'danger';

/** Orden fijo de grupos del menú (§2.2). El renderer emite un separador SOLO
 *  entre grupos presentes → N grupos = N−1 separadores, ninguno vacío. */
export const GROUP_ORDER: GroupId[] = ['clipboard', 'transform', 'order', 'organize', 'linked', 'identity', 'danger'];

export type ActionId =
  | 'copy' | 'paste' | 'pasteMirror'
  | 'rotate90' | 'flipH' | 'flipV'
  | 'reverseSeam' | 'unfold' | 'unfoldOutlineOnly' | 'offsetInternalLine' | 'optimizeCurves' | 'convertSegment'
  | 'order' | 'layer' | 'lockToggle' | 'activeToggle' | 'groupCreate' | 'addToGroup' | 'removeFromGroup'
  | 'unlinkPieces' | 'selectLinkedPartner' | 'linkSymmetry' | 'linkInstance' | 'cloneLinkedSymmetry' | 'cloneLinkedInstance'
  | 'duplicate' | 'duplicateAll' | 'rename' | 'properties' | 'select' | 'inspect' | 'selectPieceOfLine' | 'selectSeamA' | 'selectSeamB' | 'zoomToFit'
  | 'deletePiece' | 'deleteSeam' | 'deleteInternalLine';

/** Callbacks que Surface B pasa como props (verbos que no son dispatches puros). */
export interface CurationCallbacks {
  onRename?: (pieceId: string) => void;
  onConvertSegment?: (commandIndex: number, toCurve: boolean) => void;
  onZoomToFit?: () => void;
  onUnfold?: (pieceId: string, foldLineId: string, outlineOnly?: boolean) => void;
  onOffsetInternalLine?: (pieceId: string, lineId: string) => void;
  onOptimizeCurves?: (pieceId: string, lineId?: string) => void;
  onOpenProperties?: (pieceId: string) => void;
}

/** Contexto resuelto que consumen gate/label/run/submenu. Lo arma cada superficie
 *  a partir de su fuente (hit-test en B; selección en A). */
export interface CurationCtx {
  dispatch: AppDispatch;
  targetKind: TargetKind;
  stage: WorkflowStage;
  altitude: 'body' | 'point';
  pieceId: string | null;
  piece: PatternPiece | null;
  selectedPieceIds: string[];
  seamId: string | null;
  seam: Seam | null;
  internalLineId: string | null;
  internalLineType: InternalLineType | null;
  internalLine: InternalLine | null;
  segmentIndex?: number;
  segmentIsCurve?: boolean;
  clipboard: { pieces: PatternPiece[] } | null;
  groups: PieceGroup[];
  pieces: PatternPiece[];
  cb: CurationCallbacks;
  onClose: () => void;
}

export interface ActionDef {
  id: ActionId;
  label: string | ((ctx: CurationCtx) => string);
  icon: string;
  shortcut?: string;
  group: GroupId;
  danger?: boolean;
  /** Precondición. Si devuelve false, el ítem se OCULTA (hide-not-disable, §4). */
  gate?: (ctx: CurationCtx) => boolean;
  /** Verbo (dispatch/callback existente). El renderer llama run(ctx) y luego onClose. */
  run: (ctx: CurationCtx) => void;
  /** Si está presente, el ítem se renderiza como SubMenu (Orden/Capa/Grupos). */
  submenu?: (ctx: CurationCtx) => SubMenuItem[];
}

export interface CurationRow {
  targetKind: TargetKind;
  stage: WorkflowStage | '*';
  altitude: 'body' | 'point' | '*';
  bar: ActionId[];
  menu: ActionId[];
}

export const BAR_MAX_VISIBLE = 5;
/** En v1 la barra solo monta para pieza/multi (cabalga el transform box de T2).
 *  Las demás filas traen su `bar` autorada pero apagada — flip para v2 sin cirugía. */
export const BAR_ENABLED_KINDS = new Set<TargetKind>(['piece', 'multiPiece']);

// ── Gates compartidos ──────────────────────────────────────────────────────

const notLocked = (ctx: CurationCtx) => !ctx.piece?.locked;
const hasClipboard = (ctx: CurationCtx) => !!ctx.clipboard;
const isLinked = (ctx: CurationCtx) => !!ctx.piece?.linkedPieceId;
const twoSelected = (ctx: CurationCtx) => !ctx.piece?.linkedPieceId && ctx.selectedPieceIds.length === 2;
const cloneable = (ctx: CurationCtx) => !ctx.piece?.linkedPieceId && ctx.selectedPieceIds.length !== 2;
const canAddToGroup = (ctx: CurationCtx) => !!ctx.pieceId && ctx.groups.some(g => !g.pieceIds.includes(ctx.pieceId!));
const canRemoveFromGroup = (ctx: CurationCtx) => !!ctx.pieceId && ctx.groups.some(g => g.pieceIds.includes(ctx.pieceId!));
const seamBothConnected = (ctx: CurationCtx) => !!(ctx.seam?.pieceA.pieceId && ctx.seam?.pieceB.pieceId);
const hasCurveCmds = (ctx: CurationCtx) => !!ctx.internalLine?.path.some(c => c.type === 'C' || c.type === 'Q');

const pasteRun = (mirror: boolean) => (ctx: CurationCtx) => {
  if (!ctx.clipboard) return;
  createPastedPieces(ctx.clipboard, mirror).forEach(p => ctx.dispatch(addPiece(p)));
};
const seamPartnerName = (ctx: CurationCtx, side: 'A' | 'B') => {
  const id = side === 'A' ? ctx.seam?.pieceA.pieceId : ctx.seam?.pieceB.pieceId;
  return ctx.pieces.find(p => p.id === id)?.name || (side === 'A' ? 'Pieza A' : 'Pieza B');
};
const ilDeleteLabel = (ctx: CurationCtx) => {
  switch (ctx.internalLineType) {
    case 'notch': return 'Eliminar piquete';
    case 'grainline': return 'Eliminar hilo';
    case 'dart': return 'Eliminar pinza';
    default: return 'Eliminar';
  }
};

// ── ACTIONS: id → verbo existente (procedencia entre paréntesis) ─────────────

export const ACTIONS: Record<ActionId, ActionDef> = {
  // clipboard
  copy: { id: 'copy', group: 'clipboard', icon: '📄', label: 'Copiar', shortcut: 'Ctrl+C',
    run: (ctx) => { if (ctx.piece) ctx.dispatch(copyPieces({ pieces: [ctx.piece] })); } },              // editorSlice.copyPieces
  paste: { id: 'paste', group: 'clipboard', icon: '📋', label: 'Pegar', shortcut: 'Ctrl+V',
    gate: hasClipboard, run: pasteRun(false) },                                                          // editorSlice.createPastedPieces + projectSlice.addPiece
  pasteMirror: { id: 'pasteMirror', group: 'clipboard', icon: '🪞', label: 'Pegar en espejo', shortcut: 'Ctrl+R',
    gate: hasClipboard, run: pasteRun(true) },

  // transform (mutadores de geometría → gate !locked, F2)
  rotate90: { id: 'rotate90', group: 'transform', icon: '↻', label: 'Rotar 90°', shortcut: 'R',
    gate: notLocked, run: (ctx) => ctx.dispatch(rotatePiece({ id: ctx.pieceId!, rotation: (ctx.piece?.rotation ?? 0) + 90 })) }, // projectSlice.rotatePiece
  flipH: { id: 'flipH', group: 'transform', icon: '↔', label: 'Voltear horizontal', shortcut: 'H',
    gate: notLocked, run: (ctx) => ctx.dispatch(flipPieceH(ctx.pieceId!)) },                             // projectSlice.flipPieceH
  flipV: { id: 'flipV', group: 'transform', icon: '↕', label: 'Voltear vertical', shortcut: 'V',
    gate: notLocked, run: (ctx) => ctx.dispatch(flipPieceV(ctx.pieceId!)) },                             // projectSlice.flipPieceV
  reverseSeam: { id: 'reverseSeam', group: 'transform', icon: '↔', label: 'Invertir dirección de costura', shortcut: 'Ctrl+B',
    run: (ctx) => ctx.dispatch(reverseSeam(ctx.seamId!)) },                                              // projectSlice.reverseSeam
  unfold: { id: 'unfold', group: 'transform', icon: '⇔', label: 'Desplegar',
    run: (ctx) => ctx.cb.onUnfold?.(ctx.pieceId!, ctx.internalLineId!) },                                // Surface B prop
  unfoldOutlineOnly: { id: 'unfoldOutlineOnly', group: 'transform', icon: '⇔', label: 'Desplegar solo el contorno',
    run: (ctx) => ctx.cb.onUnfold?.(ctx.pieceId!, ctx.internalLineId!, true) },
  offsetInternalLine: { id: 'offsetInternalLine', group: 'transform', icon: '⏛', label: 'Offset como línea interna',
    run: (ctx) => ctx.cb.onOffsetInternalLine?.(ctx.pieceId!, ctx.internalLineId!) },
  optimizeCurves: { id: 'optimizeCurves', group: 'transform', icon: '◇', label: 'Optimizar puntos de curva',
    gate: hasCurveCmds, run: (ctx) => ctx.cb.onOptimizeCurves?.(ctx.pieceId!, ctx.internalLineId!) },
  convertSegment: { id: 'convertSegment', group: 'transform', icon: '⌒',
    label: (ctx) => (ctx.segmentIsCurve ? 'Convertir en línea' : 'Convertir en curva'),
    run: (ctx) => ctx.cb.onConvertSegment?.(ctx.segmentIndex!, !ctx.segmentIsCurve) },

  // order (submenú z-order — colapsa 4 ítems planos en uno)
  order: { id: 'order', group: 'order', icon: '⇅', label: 'Orden', run: () => {},
    submenu: (ctx) => [
      { label: 'Traer al frente', action: () => { ctx.dispatch(bringToFront(ctx.pieceId!)); ctx.onClose(); } },     // projectSlice.bringToFront
      { label: 'Adelantar', action: () => { ctx.dispatch(bringForward(ctx.pieceId!)); ctx.onClose(); } },           // bringForward
      { label: 'Atrasar', action: () => { ctx.dispatch(sendBackward(ctx.pieceId!)); ctx.onClose(); } },             // sendBackward
      { label: 'Enviar al fondo', action: () => { ctx.dispatch(sendToBack(ctx.pieceId!)); ctx.onClose(); } },       // sendToBack
    ] },

  // organize
  layer: { id: 'layer', group: 'organize', icon: '\u{1F4D1}', label: 'Capa', run: () => {},
    submenu: (ctx) => {
      const pid = ctx.pieceId!;
      return [
        { label: `Cambiar capa... (${ctx.piece?.layer ?? 1})`, action: () => { ctx.dispatch(setLayer({ pieceId: pid, layer: ((ctx.piece?.layer ?? 1) % 10) + 1 })); ctx.onClose(); } },       // setLayer
        { label: `Cambiar subcapa... (${ctx.piece?.sublayer ?? 0})`, action: () => { ctx.dispatch(setSublayer({ pieceId: pid, sublayer: ((ctx.piece?.sublayer ?? 0) + 1) % 5 })); ctx.onClose(); } }, // setSublayer
        { separator: true, label: 'Clonar encima', action: () => { ctx.dispatch(cloneToLayer({ pieceId: pid, direction: 'over' })); ctx.onClose(); } },                                        // cloneToLayer
        { label: 'Clonar debajo', action: () => { ctx.dispatch(cloneToLayer({ pieceId: pid, direction: 'under' })); ctx.onClose(); } },
        { separator: true, label: 'Superponer encima...', action: () => { ctx.dispatch(enterSuperimposePickMode({ sourcePieceId: pid, mode: 'over' })); ctx.onClose(); } },                     // enterSuperimposePickMode
        { label: 'Superponer debajo...', action: () => { ctx.dispatch(enterSuperimposePickMode({ sourcePieceId: pid, mode: 'under' })); ctx.onClose(); } },
        { label: 'Superponer al lado...', action: () => { ctx.dispatch(enterSuperimposePickMode({ sourcePieceId: pid, mode: 'side' })); ctx.onClose(); } },
      ];
    } },
  lockToggle: { id: 'lockToggle', group: 'organize', icon: '🔒',
    label: (ctx) => (ctx.piece?.locked ? 'Desbloquear' : 'Bloquear'),
    run: (ctx) => ctx.dispatch(ctx.piece?.locked ? unlockPiece(ctx.pieceId!) : lockPiece(ctx.pieceId!)) },  // lock/unlockPiece — NUNCA gateado por locked (escape hatch)
  activeToggle: { id: 'activeToggle', group: 'organize', icon: '⏸',
    label: (ctx) => (ctx.piece?.active === false ? 'Activar pieza' : 'Desactivar pieza'),
    run: (ctx) => ctx.dispatch(deactivatePiece({ pieceId: ctx.pieceId!, active: ctx.piece?.active === false })) }, // deactivatePiece
  groupCreate: { id: 'groupCreate', group: 'organize', icon: '📁', label: 'Crear grupo con la selección',
    run: (ctx) => {
      const ids = ctx.selectedPieceIds.length > 0 ? ctx.selectedPieceIds : [ctx.pieceId!];
      ctx.dispatch(createGroup({ name: `Grupo ${ctx.groups.length + 1}`, pieceIds: ids }));                  // createGroup
    } },
  addToGroup: { id: 'addToGroup', group: 'organize', icon: '+', label: 'Agregar a grupo', gate: canAddToGroup, run: () => {},
    submenu: (ctx) => ctx.groups.filter(g => !g.pieceIds.includes(ctx.pieceId!)).map(g => ({
      label: `Agregar a "${g.name}"`, action: () => { ctx.dispatch(addPiecesToGroup({ groupId: g.id, pieceIds: [ctx.pieceId!] })); ctx.onClose(); },  // addPiecesToGroup
    })) },
  removeFromGroup: { id: 'removeFromGroup', group: 'organize', icon: '−', label: 'Quitar de grupo', gate: canRemoveFromGroup, run: () => {},
    submenu: (ctx) => ctx.groups.filter(g => g.pieceIds.includes(ctx.pieceId!)).map(g => ({
      label: `Quitar de "${g.name}"`, action: () => { ctx.dispatch(removePiecesFromGroup({ groupId: g.id, pieceIds: [ctx.pieceId!] })); ctx.onClose(); }, // removePiecesFromGroup
    })) },

  // linked (3-vías, idéntico al if/else-if/else de hoy)
  unlinkPieces: { id: 'unlinkPieces', group: 'linked', icon: '🔗', label: 'Quitar edición vinculada', gate: isLinked,
    run: (ctx) => ctx.dispatch(unlinkPieces({ pieceId: ctx.pieceId! })) },                                   // unlinkPieces
  selectLinkedPartner: { id: 'selectLinkedPartner', group: 'linked', icon: '👆', label: 'Seleccionar patrón vinculado', gate: isLinked,
    run: (ctx) => ctx.dispatch(selectPiece(ctx.piece!.linkedPieceId!)) },
  linkSymmetry: { id: 'linkSymmetry', group: 'linked', icon: '🪞', label: 'Aplicar edición vinculada – simetría', gate: twoSelected,
    run: (ctx) => ctx.dispatch(linkPieces({ pieceIdA: ctx.selectedPieceIds[0], pieceIdB: ctx.selectedPieceIds[1], mode: 'symmetry' })) }, // linkPieces
  linkInstance: { id: 'linkInstance', group: 'linked', icon: '📋', label: 'Aplicar edición vinculada – instancia', gate: twoSelected,
    run: (ctx) => ctx.dispatch(linkPieces({ pieceIdA: ctx.selectedPieceIds[0], pieceIdB: ctx.selectedPieceIds[1], mode: 'instance' })) },
  cloneLinkedSymmetry: { id: 'cloneLinkedSymmetry', group: 'linked', icon: '🪞', label: 'Clonar con edición vinculada – simetría', gate: cloneable,
    run: (ctx) => ctx.dispatch(cloneAsLinked({ pieceId: ctx.pieceId!, mode: 'symmetry' })) },               // cloneAsLinked
  cloneLinkedInstance: { id: 'cloneLinkedInstance', group: 'linked', icon: '📋', label: 'Clonar con edición vinculada – instancia', gate: cloneable,
    run: (ctx) => ctx.dispatch(cloneAsLinked({ pieceId: ctx.pieceId!, mode: 'instance' })) },

  // identity
  duplicate: { id: 'duplicate', group: 'identity', icon: '⧉', label: 'Duplicar', shortcut: 'Ctrl+D',
    run: (ctx) => ctx.dispatch(duplicatePiece(ctx.pieceId!)) },                                              // duplicatePiece
  duplicateAll: { id: 'duplicateAll', group: 'identity', icon: '⧉', label: 'Duplicar',
    run: (ctx) => ctx.selectedPieceIds.forEach(id => ctx.dispatch(duplicatePiece(id))) },                    // loop pieza-a-pieza (verbo existente)
  rename: { id: 'rename', group: 'identity', icon: '✏️', label: 'Renombrar…', shortcut: 'F2',
    run: (ctx) => ctx.cb.onRename?.(ctx.pieceId!) },                                                         // Surface B prop → inline rename
  properties: { id: 'properties', group: 'identity', icon: '🎛', label: 'Propiedades…',
    run: (ctx) => ctx.cb.onOpenProperties?.(ctx.pieceId!) },                                                 // Surface B prop → Properties panel
  select: { id: 'select', group: 'identity', icon: '☐', label: 'Seleccionar',
    run: (ctx) => ctx.dispatch(selectPiece(ctx.pieceId!)) },                                                 // selectPiece
  inspect: { id: 'inspect', group: 'identity', icon: '🔍', label: 'Inspeccionar',
    run: (ctx) => dispatchInspectPiece(ctx.dispatch, ctx.pieceId!) },                                        // inspectorSlice.dispatchInspectPiece
  selectPieceOfLine: { id: 'selectPieceOfLine', group: 'identity', icon: '☐', label: 'Seleccionar pieza',
    run: (ctx) => ctx.dispatch(selectPiece(ctx.pieceId!)) },
  selectSeamA: { id: 'selectSeamA', group: 'identity', icon: '☐', gate: seamBothConnected,
    label: (ctx) => `Seleccionar "${seamPartnerName(ctx, 'A')}"`,
    run: (ctx) => ctx.dispatch(selectPiece(ctx.seam!.pieceA.pieceId)) },
  selectSeamB: { id: 'selectSeamB', group: 'identity', icon: '☐', gate: seamBothConnected,
    label: (ctx) => `Seleccionar "${seamPartnerName(ctx, 'B')}"`,
    run: (ctx) => ctx.dispatch(selectPiece(ctx.seam!.pieceB.pieceId)) },
  zoomToFit: { id: 'zoomToFit', group: 'identity', icon: '⊞', label: 'Ajustar zoom al patrón',
    run: (ctx) => ctx.cb.onZoomToFit?.() },                                                                  // Surface B prop

  // danger (destructivos → gate !locked donde aplica, F2)
  deletePiece: { id: 'deletePiece', group: 'danger', icon: '🗑', label: 'Eliminar pieza', shortcut: 'Del', danger: true,
    gate: notLocked, run: (ctx) => ctx.dispatch(removePiece(ctx.pieceId!)) },                                // projectSlice.removePiece (SIN cascade-clean — POST-SHIP)
  deleteSeam: { id: 'deleteSeam', group: 'danger', icon: '🗑', label: 'Eliminar costura', shortcut: 'Del', danger: true,
    run: (ctx) => { ctx.dispatch(removeSeam(ctx.seamId!)); ctx.dispatch(clearSelection()); } },              // removeSeam + clearSelection
  deleteInternalLine: { id: 'deleteInternalLine', group: 'danger', icon: '🗑', label: ilDeleteLabel, danger: true,
    run: (ctx) => ctx.dispatch(removeInternalLine({ pieceId: ctx.pieceId!, lineId: ctx.internalLineId! })) }, // projectSlice.removeInternalLine (:518)
};

// ── CURATION: la tabla que María edita ───────────────────────────────────────
// Leyenda: `bar` rankeada (cap 5, apagada salvo BAR_ENABLED_KINDS); `menu` agrupada por ActionDef.group.

export const CURATION: CurationRow[] = [
  {
    targetKind: 'piece', stage: '*', altitude: 'body',
    bar: ['rotate90', 'duplicate', 'flipH', 'properties', 'lockToggle'],
    menu: [
      'copy', 'paste', 'pasteMirror',
      'rotate90', 'flipH', 'flipV',
      'order',
      'layer', 'lockToggle', 'activeToggle', 'groupCreate', 'addToGroup', 'removeFromGroup',
      'unlinkPieces', 'selectLinkedPartner', 'linkSymmetry', 'linkInstance', 'cloneLinkedSymmetry', 'cloneLinkedInstance',
      'duplicate', 'rename', 'properties', 'select', 'inspect',
      'deletePiece',
    ],
  },
  {
    // Consumida SOLO por Surface A (barra, selección>1). Surface B resuelve por
    // hit-test → siempre pieza única; el caso "2 seleccionadas" lo cubren los
    // gates del row `piece` (linkSymmetry/linkInstance). NO autora deletePiece (F3).
    targetKind: 'multiPiece', stage: '*', altitude: 'body',
    bar: ['duplicateAll', 'groupCreate', 'linkSymmetry', 'linkInstance'],
    menu: ['duplicateAll', 'groupCreate', 'addToGroup', 'linkSymmetry', 'linkInstance'],
  },
  {
    targetKind: 'seam', stage: '*', altitude: 'body',
    bar: ['reverseSeam', 'selectSeamA', 'selectSeamB'], // data v2 (apagada por BAR_ENABLED_KINDS)
    menu: ['reverseSeam', 'selectSeamA', 'selectSeamB', 'deleteSeam'],
  },
  { targetKind: 'il.notch', stage: '*', altitude: 'body', bar: [], menu: ['selectPieceOfLine', 'deleteInternalLine'] },
  { targetKind: 'il.grainline', stage: '*', altitude: 'body', bar: [], menu: ['selectPieceOfLine', 'deleteInternalLine'] },
  {
    targetKind: 'il.fold', stage: '*', altitude: 'body',
    bar: ['unfold', 'unfoldOutlineOnly'], // data v2
    menu: ['unfold', 'unfoldOutlineOnly', 'selectPieceOfLine', 'deleteInternalLine'],
  },
  { targetKind: 'il.dart', stage: '*', altitude: 'body', bar: [], menu: ['optimizeCurves', 'selectPieceOfLine', 'deleteInternalLine'] },
  { targetKind: 'il.other', stage: '*', altitude: 'body', bar: [], menu: ['offsetInternalLine', 'optimizeCurves', 'selectPieceOfLine', 'deleteInternalLine'] },
  { targetKind: 'point.segment', stage: '*', altitude: 'point', bar: [], menu: ['convertSegment'] },
  { targetKind: 'point.node', stage: '*', altitude: 'point', bar: [], menu: [] },
  { targetKind: 'emptyCanvas', stage: '*', altitude: 'body', bar: [], menu: ['paste', 'pasteMirror', 'zoomToFit'] },
];

// ── Resolvers puros ──────────────────────────────────────────────────────────

export interface TargetInput {
  seamId: string | null;
  pieceId: string | null;
  /** Surface A: selectedPieceIds.length. Surface B (hit-test): 0 ó 1. */
  pieceCount: number;
  internalLineType: InternalLineType | null;
  altitude: 'body' | 'point';
  /** Solo Surface B en altitud POINT (hit-test bajo el cursor). */
  segmentHit?: boolean;
}

function ilBucket(t: InternalLineType): 'notch' | 'grainline' | 'fold' | 'dart' | 'other' {
  return (t === 'notch' || t === 'grainline' || t === 'fold' || t === 'dart') ? t : 'other';
}

/**
 * Puro y compartido. Precedencia (la del hit-test existente): altitud POINT >
 * seam > línea interna > pieza. `point.*` SOLO cuando `altitude==='point'`
 * (F11): Surface A nunca pasa esa altitud — su box está suprimido en POINT (G7).
 */
export function resolveTargetKind(t: TargetInput): TargetKind {
  if (t.altitude === 'point') return t.segmentHit ? 'point.segment' : 'point.node';
  if (t.seamId) return 'seam';
  if (t.internalLineType) return `il.${ilBucket(t.internalLineType)}` as TargetKind;
  if (t.pieceCount > 1) return 'multiPiece';
  if (t.pieceId) return 'piece';
  return 'emptyCanvas';
}

/** Fila más específica: stage exacto sobre '*', altitud exacta sobre '*'.
 *  Sin match → null (F6: el lector devuelve menú vacío, sin crash). */
export function matchRow(key: { targetKind: TargetKind; stage: WorkflowStage; altitude: 'body' | 'point' }): CurationRow | null {
  const viable = CURATION.filter(r =>
    r.targetKind === key.targetKind &&
    (r.stage === key.stage || r.stage === '*') &&
    (r.altitude === key.altitude || r.altitude === '*'));
  if (viable.length === 0) return null;
  const score = (r: CurationRow) =>
    (r.stage === key.stage ? 2 : 1) * 10 + (r.altitude === key.altitude ? 2 : 1);
  return viable.reduce((best, r) => (score(r) > score(best) ? r : best));
}

/** Menú (Surface B): fila → ids → ActionDef → filtro por gate. Agrupación/orden
 *  y separadores los aplica el renderer por GROUP_ORDER. */
export function resolveMenuActions(ctx: CurationCtx): ActionDef[] {
  const row = matchRow({ targetKind: ctx.targetKind, stage: ctx.stage, altitude: ctx.altitude });
  if (!row) return [];
  return row.menu.map(id => ACTIONS[id]).filter(Boolean).filter(def => !def.gate || def.gate(ctx));
}

/** Barra (Surface A): solo BAR_ENABLED_KINDS, sin danger, gate aplicado, cap 5. */
export function resolveBarActions(ctx: CurationCtx): ActionDef[] {
  if (!BAR_ENABLED_KINDS.has(ctx.targetKind)) return [];
  const row = matchRow({ targetKind: ctx.targetKind, stage: ctx.stage, altitude: ctx.altitude });
  if (!row) return [];
  return row.bar
    .map(id => ACTIONS[id]).filter(Boolean)
    .filter(def => !def.danger && (!def.gate || def.gate(ctx)))
    .slice(0, BAR_MAX_VISIBLE);
}
```

- [ ] Correr y esperar **PASS**: `npm run test -- src/components/PatternEditor/__tests__/actionCuration.test.ts`

- [ ] `npx tsc -b --noEmit` limpio.

- [ ] Commit: `git add -A && git commit -m "feat(pattern-edit): módulo declarativo de curación de menús (tabla ACTIONS/CURATION + resolvers)"`

---

## Tarea 7 — Surface B (menú derecho) consume la tabla: reescribir el builder de `ContextMenu`

Reemplaza el builder imperativo de `ContextMenu.tsx:146-530` (25+ `items.push`) por una lectura de tabla: arma el `CurationCtx` desde el hit-test (prop `menu`) + Redux, llama `resolveMenuActions`, y renderiza agrupando por `GROUP_ORDER` con separadores por-frontera-de-grupo. Codifica las tres disciplinas del spec §4: **hide-not-disable** (gate false → no se renderiza; muere el "Pegar" deshabilitado), **separador por-frontera** (N grupos = N−1 separadores; muere el separador vacío `:466-471`), y el gate **`!locked`** heredado de `ACTIONS` (F2: rotate/flip/delete ocultos en pieza bloqueada). El hit-test (`PatternEditor.tsx:319-459`), el clamp (`:110-120`), el dismiss (`:123-137`) y la cabecera del objeto (`:538-547`) quedan **intactos**. Cero dependencia de T1–T5.

### Files
- **Modify** `src/components/PatternEditor/ContextMenu.tsx`
  - `ContextMenuState`: agregar `isEditingNodes?: boolean` (`:64-66`, junto a `internalLineType`).
  - Reemplazar el bloque builder `items: MenuItem[]` + `items.push(...)` (`:146-530`) por la construcción del `CurationCtx` + `resolveMenuActions`.
  - Reemplazar el `return`/render (`:532-570`) por el render agrupado por `GROUP_ORDER`.
  - Eliminar la interfaz local `MenuItem` (`:84-93`) y el helper `act` (`:139-142`) — reemplazados por `ActionDef` y por `run(ctx)+onClose` inline.
- **Modify** `src/components/PatternEditor/PatternEditor.tsx`
  - En `handleContextMenu`, agregar `isEditingNodes: editPatternTool.isEditing` al `setCtxMenu` (`:446-458`).
- **Create** `src/components/PatternEditor/__tests__/ContextMenu.curation.test.tsx` (render RTL de la superficie curada).

### Interfaces
- Consume: `resolveMenuActions(ctx)`, `resolveTargetKind`, `GROUP_ORDER`, `ActionDef`, `CurationCtx`, `CurationCallbacks` (Tarea 6); `selectWorkflowStage` (`selectors.ts:36`); `SubMenu`/`SubMenuItem` (intactos).
- Produce: `ContextMenuState.isEditingNodes?: boolean`; `ContextMenu` render table-driven (misma prop-surface `onRename`/`onConvertSegment`/`onZoomToFit`/`onUnfold`/`onOffsetInternalLine`/`onOptimizeCurves`/`onOpenProperties`).

### Steps

- [ ] Crear el test de render de la superficie curada. Contenido completo:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import ContextMenu, { type ContextMenuState } from '../ContextMenu';
import type { PatternPiece } from '../../../types/types';

afterEach(cleanup);

function piece(id: string, over: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id, name: id.toUpperCase(), position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, locked: false, seamAllowance: 0,
    outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] }, { type: 'Z', values: [] }],
    internals: [], edges: [], createdAt: 0, updatedAt: 0, ...over,
  } as unknown as PatternPiece;
}

function renderMenu(menu: ContextMenuState, pieces: PatternPiece[]) {
  const store = configureStore({
    reducer: {
      project: projectReducer,
      editor: editorReducer,
      // stub: selectWorkflowStage solo lee simulationState
      simulation: (s: { simulationState: string } = { simulationState: 'idle' }) => s,
    },
  });
  store.dispatch(restoreState({ ...store.getState().project, pieces }));
  return render(
    <Provider store={store}>
      <ContextMenu menu={menu} onClose={vi.fn()} />
    </Provider>,
  );
}

const base: ContextMenuState = { visible: true, x: 10, y: 10, pieceId: null };

describe('ContextMenu curado (Surface B)', () => {
  it('pieza bloqueada oculta Rotar/Voltear/Eliminar y muestra Desbloquear (F2)', () => {
    renderMenu({ ...base, pieceId: 'p1', pieceName: 'P1' }, [piece('p1', { locked: true })]);
    expect(screen.queryByText('Rotar 90°')).toBeNull();
    expect(screen.queryByText('Voltear horizontal')).toBeNull();
    expect(screen.queryByText('Eliminar pieza')).toBeNull();
    expect(screen.getByText('Desbloquear')).toBeTruthy();
    expect(screen.getByText('Copiar')).toBeTruthy();
  });

  it('pieza desbloqueada muestra Rotar/Voltear/Eliminar', () => {
    renderMenu({ ...base, pieceId: 'p1', pieceName: 'P1' }, [piece('p1')]);
    expect(screen.getByText('Rotar 90°')).toBeTruthy();
    expect(screen.getByText('Eliminar pieza')).toBeTruthy();
  });

  it('piquete: sin Offset ni Optimizar; con Seleccionar pieza y Eliminar piquete (curación por subtipo)', () => {
    renderMenu(
      { ...base, pieceId: 'p1', internalLineId: 'l1', internalLineType: 'notch' },
      [piece('p1', { internals: [{ id: 'l1', type: 'notch', path: [{ type: 'M', values: [0, 0] }] }] as unknown as PatternPiece['internals'] })],
    );
    expect(screen.queryByText('Offset como línea interna')).toBeNull();
    expect(screen.queryByText('Optimizar puntos de curva')).toBeNull();
    expect(screen.getByText('Seleccionar pieza')).toBeTruthy();
    expect(screen.getByText('Eliminar piquete')).toBeTruthy();
  });

  it('Pegar se oculta sin clipboard en canvas vacío (hide-not-disable)', () => {
    renderMenu({ ...base }, []);
    expect(screen.queryByText('Pegar')).toBeNull();
    expect(screen.getByText('Ajustar zoom al patrón')).toBeTruthy();
  });

  it('ningún botón del menú se renderiza en blanco (muere el separador vacío)', () => {
    const { container } = renderMenu({ ...base, pieceId: 'p1', pieceName: 'P1' }, [piece('p1')]);
    const buttons = [...container.querySelectorAll('.context-menu__item')];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect((b.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('point.node (edición de nodos, sin segmento) no monta menú', () => {
    const { container } = renderMenu(
      { ...base, pieceId: 'p1', isEditingNodes: true },
      [piece('p1')],
    );
    expect(container.querySelector('.context-menu')).toBeNull();
  });
});
```

- [ ] Correr y esperar **FAIL** (hoy la pieza bloqueada sí muestra "Rotar 90°"/"Eliminar pieza", el piquete sí muestra "Offset como línea interna", y `point.node` monta el menú de pieza completo): `npm run test -- src/components/PatternEditor/__tests__/ContextMenu.curation.test.tsx`

- [ ] En `ContextMenu.tsx`, agregar `isEditingNodes` a `ContextMenuState` (`:64-66`, junto a `internalLineType`):

```ts
  /** Type of internal line under cursor */
  internalLineType?: string | null;
  /** True cuando el hit-test ocurrió en altitud POINT (edición de nodos). */
  isEditingNodes?: boolean;
```

- [ ] En `ContextMenu.tsx`, reemplazar los imports de verbos + `MenuItem` + `act` + todo el builder `items.push(...)` (`:15-530`) por los imports del módulo y la construcción del ctx. Los imports de verbos de `projectSlice`/`editorSlice`/`inspectorSlice` que solo usaba el builder se ELIMINAN (ahora viven en `actionCuration.ts`); se conservan `RootState`, `SubMenu`/`SubMenuItem` y los hooks. Cabecera de imports:

```ts
import { useCallback, useEffect, useLayoutEffect, useRef, useState, Fragment } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { selectWorkflowStage } from '../../store/selectors';
import type { InternalLineType } from '../../types/types';
import SubMenu from '../../components/shared/SubMenu';
import {
  ACTIONS, GROUP_ORDER, resolveMenuActions, resolveTargetKind,
  type CurationCtx, type CurationCallbacks,
} from './actionCuration';
```

- [ ] En `ContextMenu.tsx`, reemplazar la firma de props para componer `CurationCallbacks` (conserva los nombres actuales), y borrar la interfaz `MenuItem` (`:84-93`):

```ts
interface ContextMenuProps extends CurationCallbacks {
  menu: ContextMenuState;
  onClose: () => void;
}
```

- [ ] En `ContextMenu.tsx`, reemplazar el cuerpo del componente desde `const dispatch = useDispatch();` hasta el `return (...)` final (`:98-570`) por la versión table-driven (clamp/dismiss intactos; builder → ctx + `resolveMenuActions`; render agrupado por `GROUP_ORDER`):

```tsx
export default function ContextMenu(props: ContextMenuProps) {
  const { menu, onClose } = props;
  const cb: CurationCallbacks = props; // onRename/onConvertSegment/onZoomToFit/onUnfold/onOffsetInternalLine/onOptimizeCurves/onOpenProperties
  const dispatch = useDispatch<AppDispatch>();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const clipboard = useSelector((s: RootState) => s.editor.clipboard);
  const groups = useSelector((s: RootState) => s.project.groups);
  const stage = useSelector(selectWorkflowStage);
  const ref = useRef<HTMLDivElement>(null);

  // Clamp into viewport (intacto).
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  useLayoutEffect(() => {
    if (!menu.visible) return;
    const el = ref.current;
    if (!el) { setPos({ x: menu.x, y: menu.y }); return; }
    const pad = 8;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, Math.max(pad, window.innerWidth - r.width - pad)),
      y: Math.min(menu.y, Math.max(pad, window.innerHeight - r.height - pad)),
    });
  }, [menu.visible, menu.x, menu.y]);

  // Dismiss on click-outside / Escape (intacto).
  useEffect(() => {
    if (!menu.visible) return;
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu.visible, onClose]);

  if (!menu.visible) return null;

  // Arma el CurationCtx desde el hit-test (prop menu) + Redux.
  const piece = menu.pieceId ? pieces.find(p => p.id === menu.pieceId) ?? null : null;
  const seam = menu.seamId ? seams.find(s => s.id === menu.seamId) ?? null : null;
  const internalLine = (piece && menu.internalLineId) ? piece.internals.find(l => l.id === menu.internalLineId) ?? null : null;
  const altitude: 'body' | 'point' = menu.isEditingNodes ? 'point' : 'body';
  const targetKind = resolveTargetKind({
    seamId: menu.seamId ?? null,
    pieceId: menu.pieceId,
    pieceCount: menu.pieceId ? 1 : 0, // Surface B: hit-test = objeto único
    internalLineType: (menu.internalLineType as InternalLineType | null) ?? null,
    altitude,
    segmentHit: menu.segmentIndex !== undefined,
  });

  const ctx: CurationCtx = {
    dispatch, targetKind, stage, altitude,
    pieceId: menu.pieceId, piece, selectedPieceIds,
    seamId: menu.seamId ?? null, seam,
    internalLineId: menu.internalLineId ?? null,
    internalLineType: (menu.internalLineType as InternalLineType | null) ?? null,
    internalLine,
    segmentIndex: menu.segmentIndex, segmentIsCurve: menu.segmentIsCurve,
    clipboard, groups, pieces, cb, onClose,
  };

  const defs = resolveMenuActions(ctx);
  if (defs.length === 0) return null; // p.ej. point.node en v1: sin verbo → sin caja fantasma

  // Agrupa por GROUP_ORDER; separador SOLO entre grupos presentes (N−1, cero vacíos).
  const present = GROUP_ORDER
    .map(g => defs.filter(d => d.group === g))
    .filter(g => g.length > 0);

  return (
    <div ref={ref} className="context-menu" style={{ left: pos.x, top: pos.y }}>
      {menu.seamId && (
        <div className="context-menu__header context-menu__header--seam">Costura</div>
      )}
      {menu.pieceId && !menu.seamId && (
        <div className="context-menu__header">{menu.pieceName || menu.pieceId}</div>
      )}
      {present.map((group, gi) => (
        <Fragment key={gi}>
          {group.map((def) => {
            const label = typeof def.label === 'function' ? def.label(ctx) : def.label;
            if (def.submenu) {
              return <SubMenu key={def.id} label={label} icon={def.icon} items={def.submenu(ctx)} />;
            }
            return (
              <button
                key={def.id}
                onClick={() => { def.run(ctx); onClose(); }}
                className={`context-menu__item${def.danger ? ' context-menu__item--danger' : ''}`}
              >
                <span className="context-menu__icon">{def.icon}</span>
                <span className="context-menu__label">{label}</span>
                {def.shortcut && <span className="context-menu__shortcut">{def.shortcut}</span>}
              </button>
            );
          })}
          {gi < present.length - 1 && <div className="context-menu__separator" />}
        </Fragment>
      ))}
    </div>
  );
}
```

Nota: `ACTIONS` se importa para futuros consumidores/tests; si el linter marca no-uso, retíralo del import — el render solo necesita los `ActionDef` que ya trae `resolveMenuActions`. (El helper `useCallback` puede quedar sin uso tras borrar `act`; retíralo del import si eslint lo marca.)

- [ ] En `PatternEditor.tsx`, agregar `isEditingNodes` al `setCtxMenu` de `handleContextMenu` (`:446`):

```tsx
    setCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      pieceId: hitSeamId ? null : (hitPiece?.id ?? null),
      pieceName: hitSeamId ? undefined : hitPiece?.name,
      seamId: hitSeamId,
      segmentIndex,
      segmentIsCurve,
      activeTool,
      internalLineId: hitInternalLineId,
      internalLineType: hitInternalLineType,
      isEditingNodes: editPatternTool.isEditing,
    });
```

- [ ] Correr y esperar **PASS**: `npm run test -- src/components/PatternEditor/__tests__/ContextMenu.curation.test.tsx`

- [ ] Gate completo: `npx tsc -b --noEmit && npm run test && npm run lint`

- [ ] Commit: `git add -A && git commit -m "feat(pattern-edit): menú derecho curado por tabla declarativa (hide-not-disable, !locked, separadores por grupo)"`

---

## Auto-revisión antes de cerrar (addendum)

**Cobertura vs el core shippable (scope cut de Cassian + BLOCKERS de las críticas):**

| Ítem (HARD) | Tarea | Estado |
|---|---|---|
| Tabla declarativa única consumida por ambas superficies (mandato del dueño) | 6 | ✅ |
| F5 registro `ActionId` enumerado con procedencia (cierra "solo verbos existentes") | 6 | ✅ |
| F6 `matchRow` con fallback vacío (sin crash) | 6 | ✅ |
| F11 `resolveTargetKind` puro/compartido; `point.*` solo con hit-test | 6 | ✅ |
| F2 gate `!locked` en rotate/flip/delete de pieza (menú) — BLOCKER | 6 (ActionDef) + 7 (render) | ✅ |
| F1 `removePiece` permanece en `danger`, JAMÁS en barra (paridad); cascade = POST-SHIP — BLOCKER | 6 (danger + parity test) | ✅ |
| F3 fila `multiPiece` NO autora el borrado (verbo diferido = fuera de pantalla) | 6 | ✅ |
| Sin slot muerto `5.—` (conteo real) | 6 | ✅ |
| Hide-not-disable (muere "Pegar" deshabilitado) | 7 | ✅ |
| Separador por-frontera (muere el separador vacío `:466-471`) | 7 | ✅ |
| Curación por subtipo de IL (piquete sin Offset/Optimizar) | 6 (tabla) + 7 (render) | ✅ |
| Hit-test/clamp/dismiss/cabecera intactos | 7 | ✅ |

**Placeholder scan:** cero "TBD", cero pasos de código sin código. Cada test trae su cuerpo vitest real; cada implementación su código real.

**Consistencia de tipos entre tareas:** `CurationCtx`/`ActionDef`/`CurationRow`/`TargetKind`/`ActionId`/`GROUP_ORDER`/`BAR_ENABLED_KINDS` (T6) los consume T7 y (diferido) Surface A. `resolveMenuActions` (T7) y `resolveBarActions` (Surface A) leen la misma `CURATION`. `ContextMenuState.isEditingNodes` (T7) fluye `PatternEditor.handleContextMenu` → `ContextMenu` → `altitude`. Ningún tipo referenciado sin definir.

**Regresiones cubiertas:** el gate completo corre la suite; el menú conserva su prop-surface (`onRename`/`onConvertSegment`/`onZoomToFit`/`onUnfold`/`onOffsetInternalLine`/`onOptimizeCurves`/`onOpenProperties`) → `PatternEditor.tsx:856-869` no cambia salvo el nuevo `isEditingNodes`.

---

## Diferido del addendum (POST-SHIP, con disparador)

Todo esto queda **fuera del core del viernes** por decisión del scope cut. Cada uno con su precondición de revival:

- **Surface A — la barra flotante completa.** **Disparador: merge de T1–T5** (target 2026-07-31). Es la mitad frágil: cabalga `showTransformBox` + `transformTool.bbox` (T2), `isDragging` (T3) y el listener de captura de Escape (T5), todo sin mergear. Consume `resolveBarActions` de la Tarea 6 (data `bar` ya autorada). Dos subtareas cuando T1–T5 esté en `main`:
  - **A4 — Íconos monocromo de la barra.** Subset single-weight de ~8 glifos (`rotate90`, `duplicate`, `flipH`, `properties`, `lockToggle`, `groupCreate`, `linkSymmetry`, `linkInstance`) en un **mapa propio de la barra keyed por `ActionId`** — NO se toca `ActionDef.icon` (el menú conserva su emoji, status quo, cero regresión; ver "no acomodado" abajo). Bloquea A5.
  - **A5 — Componente de barra flotante.** Consume T2 (`showTransformBox` + `transformTool.bbox`), T3 (`isDragging`), T5 (Escape de captura → la barra **sin listener de teclado**, cero race por construcción). Reglas fijadas: `BAR_ENABLED_KINDS = {piece, multiPiece}`, cap 5, icon-only + `ToolTooltip` (labels quedan en el menú), superficie **neutral-dark `#1a1a1a`** (NO azul de selección `#4A9EFF`, NO índigo del menú — evita el "otro handle" y la colisión de dos azules), `z=90` (bajo `unified-bar` z=100, sobre el SVG). **Gap de anclaje resuelto: `ROTATE_HANDLE_GAP = 32px`, no 24** — la corona del handle de rotación vive en `bboxScreen.top − 29px` (`ROTATION_ARM_LENGTH=25` + `ROTATE_RADIUS=4`), así que 32 = 29 + 3px de aire; el placeholder de 24 caía 5px DENTRO del handle. `BAR_GAP = 8px` firme (el caso below-flip despeja los handles inferiores por ~5px). Dismiss incluye **contextmenu abierto → desmonta la barra** (F8: dos superficies no coexisten sobre objetos distintos). Requiere **threadear `calibrationMode`** (hoy local de `PatternEditor.tsx:602`) como prop al gate de la barra (F9) — barra suprimida si `calibrationMode !== null`. Boundary test que fija el contrato de `transformTool.bbox` (F4). `BAR_SETTLE_MS` se tunea aquí (F7: la correctitud la da el unmount reactivo `altitude→point ⇒ box false`; el flicker es cosmético).

- **Flip de `BAR_ENABLED_KINDS` para seam / línea interna / notch / point.** Disparador: María pide verbos rápidos sobre esos objetos. La data `bar` ya está autorada (seam, fold); revivir requiere anclaje propio de línea/costura (nuevo cálculo de bbox, no cabalga el transform box de pieza).

- **Delete unificado multi selection-driven (G3).** Disparador: contrato completo — undoable, respeta `locked`, cascade-limpia costuras cross-pieza. En v1 el borrado multi queda por el handler pieza-a-pieza existente; el verbo unificado NO se promueve ni se autora en `multiPiece`.

- **Cascade-clean de costuras al borrar pieza (`removePiece`).** Disparador: hardening del reducer preexistente. La curación NO introduce el gap — `removePiece` ya vive en `main` y ya deja costuras huérfanas; se conserva en `danger`, gateado `!locked`. Endurecer el cascade es POST-SHIP, independiente de esta curación.

- **`classify` como verbo de menú (F12).** Fuera de estas dos superficies en v1: vive en el paso `classify` del workflow DXF (import → classify → editar). Disparador: si María pide "Reclasificar" desde el menú de pieza, se evalúa agregar el `ActionId` cuando exista el verbo con hogar.

- **Rotar 180° / Rotar −90° en el menú de pieza.** Data-recuperable: María los agrega al array `menu` de la fila `piece` (los `ActionDef` `rotate180`/`rotateMinus90` NO se autoran en v1 por baja frecuencia; 180° = dos Rotar 90°). Disparador: pedido explícito.

- **Rotar/voltear de multi-selección.** Disparador: exista un verbo batch (hoy `rotatePiece`/`flipPieceH` son por-id; ofrecerlo en multi = capacidad nueva). Simétrico con el delete multi excluido.

- **Auditoría §7 (LogoMenu / Dock / menú 3D).** DOC-ONLY, cero build. Recomendaciones post-ship ya escritas en el spec: gatear los 4 toggles `3D:` de `LogoMenu` tras `viewMode !== '2d'` y reubicar unidades de regla a Ajustes; colapsar las 4 etapas no-vacías del dock a `pieces.length>0` (enlaza con el moat #915); mover los 6 presets de cámara del `ContextMenu3D` a un submenú `Cámara ▸`. Se abren como tareas propias cuando toque su superficie.

- **Deshabilitar en vez de ocultar.** Nunca por defecto (regla ÚNICA del spec §4). Revive solo si pruebas con María muestran que oculta un verbo que ella busca (entonces se evalúa un "atenuado" puntual).

- **Variación de la barra/menú por etapa (`stage`).** Mecanismo listo (columna `stage` en `CurationRow` + `matchRow` con especificidad). En v1 ninguna fila la usa (verbos de pieza invariantes al flujo; la sensibilidad de etapa vive en el dock). Disparador: aparece un verbo de pieza dependiente de etapa → María autora una fila `stage`-específica sin cirugía.

- **Submenú/overflow en la barra.** Nunca. La barra es plana, cap 5; el desborde va al clic derecho.

---

# Surface A — barra flotante de acciones (Tareas 8–9)

> **Continuación del addendum** de `docs/superpowers/plans/2026-07-18-boton-izquierdo-click-grammar.md`.
> Aterriza la subsección **Diferido del addendum → Surface A**, ítems **A4** (íconos monocromo) y
> **A5** (componente de barra), ahora que su precondición de revival se cumplió: **T1–T5 mergeadas**
> en `feat/click-grammar-v1` (`847ccebd..731fa8f7`). Las interfaces que Surface A consume ya están
> vivas en el código: `shouldShowTransformBox`/`showTransformBox` (retorno del hook y prop de
> `ToolOverlay`), `ToolHooks.transformTool.isDragging`, y el listener de **fase de captura** de
> Escape (T5) — por eso la barra **no lleva listener de teclado**: la seguridad de Escape es por
> construcción. La tabla de curación (T6, `resolveBarActions`/`BAR_ENABLED_KINDS`) ya autora la
> columna `bar` para pieza/multiPieza; Surface A la lee **sin cirugía**.
>
> Ciclo por checkbox (2–5 min): test que falla → correr y ver **FAIL** → implementación mínima →
> correr y ver **PASS** → commit. No saltes el rojo/verde.

---

### Tarea 8 — Íconos monocromo de la barra (mapa propio)

La barra es **icon-only** sobre superficie neutral-dark; los emoji del menú (`ACTIONS[id].icon`)
renderizan en **color** en la mayoría de plataformas → romperían el look monocromo. A4 resuelve esto
con un **mapa propio de la barra keyed por `ActionId`**, separado de `ACTIONS`: el menú conserva su
emoji (status quo, cero regresión) y la barra usa glifos monocromo de **`lucide-react`** (dep ya
instalada — la usan `unifiedBarCommandDefs.ts`, `TopBar.tsx`, `LogoMenu.tsx`; stroke `currentColor`,
single-weight, garantizado monocromo cross-plataforma). **No se toca `ActionDef.icon`.**

El mapa cubre **todo `ActionId` alcanzable por una fila `bar` de `BAR_ENABLED_KINDS`** (`piece` +
`multiPiece`): los 8 glifos que fija A4 (`rotate90`, `duplicate`, `flipH`, `properties`,
`lockToggle`, `groupCreate`, `linkSymmetry`, `linkInstance`) **más `duplicateAll`** — que la fila
`multiPiece` de T6 (`CURATION`) autora en su `bar` y sin el cual la barra no podría renderizar
icon-only en multi-selección. Un test de integridad ata el mapa a la tabla para que no se
desincronicen.

#### Files
- **Create** `src/components/PatternEditor/barIcons.ts` (mapa `BAR_ICONS: Partial<Record<ActionId, LucideIcon>>`).
- **Create** `src/components/PatternEditor/__tests__/barIcons.test.ts` (integridad del mapa + no-regresión de `ACTIONS.icon`).

#### Interfaces
- **Consume:** `ActionId` (T6, `actionCuration.ts`); `LucideIcon` + `RotateCw`/`Copy`/`FlipHorizontal2`/`SlidersHorizontal`/`Lock`/`Group`/`Link`/`Link2` (`lucide-react`, dep instalada); `ACTIONS`/`CURATION`/`BAR_ENABLED_KINDS` (T6 — solo en el test).
- **Produce:**
  ```ts
  export const BAR_ICONS: Partial<Record<ActionId, LucideIcon>>; // 9 entradas (los 8 de A4 + duplicateAll)
  ```

#### Steps

- [ ] Crear el test de integridad del mapa. Contenido completo:

```ts
import { describe, it, expect } from 'vitest';
import { BAR_ICONS } from '../barIcons';
import { ACTIONS, CURATION, BAR_ENABLED_KINDS } from '../actionCuration';

describe('BAR_ICONS — mapa monocromo propio de la barra (A4)', () => {
  it('cubre TODO ActionId alcanzable por una fila bar de BAR_ENABLED_KINDS', () => {
    for (const row of CURATION) {
      if (!BAR_ENABLED_KINDS.has(row.targetKind)) continue;
      for (const id of row.bar) {
        expect(BAR_ICONS[id], `sin ícono monocromo para el id de barra: ${id}`).toBeDefined();
      }
    }
  });

  it('cada valor es un componente de ícono renderizable (no un string)', () => {
    for (const key of Object.keys(BAR_ICONS)) {
      const Icon = BAR_ICONS[key as keyof typeof BAR_ICONS];
      // lucide expone forwardRef → typeof 'object'; nunca un string (eso es el emoji del menú)
      expect(typeof Icon === 'object' || typeof Icon === 'function').toBe(true);
      expect(typeof Icon).not.toBe('string');
    }
  });

  it('NO toca ActionDef.icon: el menú conserva su emoji (cero regresión)', () => {
    expect(ACTIONS.rotate90.icon).toBe('↻');
    expect(ACTIONS.lockToggle.icon).toBe('🔒');
    expect(ACTIONS.groupCreate.icon).toBe('📁');
    // el ícono de barra es un componente aparte, distinto del glifo emoji del menú
    expect(BAR_ICONS.rotate90).toBeTruthy();
    expect(BAR_ICONS.rotate90).not.toBe(ACTIONS.rotate90.icon);
  });
});
```

- [ ] Correr y esperar **FAIL** (el módulo `../barIcons` no existe aún → los imports fallan): `npm run test -- src/components/PatternEditor/__tests__/barIcons.test.ts`

- [ ] Crear el módulo `src/components/PatternEditor/barIcons.ts` con el código completo:

```ts
/**
 * barIcons — mapa de íconos MONOCROMO de la barra flotante (Surface A), keyed por
 * `ActionId`. Propio de la barra: el menú de clic-derecho conserva `ACTIONS[id].icon`
 * (emoji, status quo) — este mapa NO lo toca. Los emoji renderizan en color en la
 * mayoría de plataformas; la barra necesita glifos single-weight monocromo, así que
 * usa `lucide-react` (stroke `currentColor`).
 *
 * Cubre todo `ActionId` alcanzable por una fila `bar` de `BAR_ENABLED_KINDS`
 * (piece + multiPiece). El test `barIcons.test.ts` ata este mapa a `CURATION` →
 * agregar un id a una fila `bar` enabled sin ícono aquí rompe el gate.
 */
import {
  RotateCw, Copy, FlipHorizontal2, SlidersHorizontal, Lock, Group, Link, Link2,
  type LucideIcon,
} from 'lucide-react';
import type { ActionId } from './actionCuration';

export const BAR_ICONS: Partial<Record<ActionId, LucideIcon>> = {
  // fila `piece`
  rotate90: RotateCw,
  duplicate: Copy,
  flipH: FlipHorizontal2,
  properties: SlidersHorizontal,
  lockToggle: Lock,                 // glifo único; el estado (bloq/desbloq) lo dice el tooltip
  // fila `multiPiece`
  duplicateAll: Copy,               // mismo verbo-familia que `duplicate`
  groupCreate: Group,
  linkSymmetry: Link2,
  linkInstance: Link,
};
```

- [ ] Correr y esperar **PASS**: `npm run test -- src/components/PatternEditor/__tests__/barIcons.test.ts`

- [ ] `npx tsc -b --noEmit` limpio.

- [ ] Commit: `git add -A && git commit -m "feat(pattern-edit): mapa de íconos monocromo de la barra flotante (keyed por ActionId, sin tocar ActionDef.icon)"`

---

### Tarea 9 — Componente FloatingActionBar (Surface A)

Materializa la barra flotante que cabalga el transform box de T2–T5. Consume `resolveBarActions`
(T6) para las acciones, `BAR_ICONS` (T8) para los glifos, y `ToolTooltip` (shell) para los labels
(icon-only: el nombre vive en el tooltip). Se ancla al box vía `transformTool.bbox` (T2/F4)
convertido a pantalla con `pan2D`/`zoom2D` — coords locales del contenedor `.pattern-editor`
(`position: relative`, SVG a 0,0). Toda la disciplina de dismiss vive en **una sola compuerta**
del componente.

**Decisiones fijadas (A5), honradas 1:1:**
- `BAR_ENABLED_KINDS = {piece, multiPiece}`, cap 5, sin `danger` → los tres los aplica
  `resolveBarActions` (T6); la barra solo los lee.
- **icon-only + `ToolTooltip`** (labels quedan en el menú).
- Superficie **neutral-dark `#1a1a1a`** (NUNCA el azul de selección `#4A9EFF` — evita "el otro
  handle" y la colisión de dos azules), **`z-index: 90`** (bajo `unified-bar` z=100, sobre el SVG).
- **`ROTATE_HANDLE_GAP = 32px`**: la corona del handle de rotación vive en `bboxScreen.top − 29px`
  (`ROTATION_ARM_LENGTH=25` en `useTransformTool`/`transform.ts` + `ROTATE_RADIUS=4` en
  `TransformHandlesOverlay`), 32 = 29 + 3px de aire. **`BAR_GAP = 8px`** para el caso below-flip
  (despeja los handles inferiores por ~5px).
- **Sin listener de teclado** en la barra: la seguridad de Escape la da la captura de T5 → cero race
  por construcción (test lo pinnea: la barra no registra `keydown` en `window`).
- **Suprimida en altitud POINT por construcción**: solo monta si `showTransformBox` es `true`, y ese
  helper (T2, invariante G7) ya es `false` en POINT.
- **Dismiss** (una compuerta): deselección / cambio de tool / POINT → `show=false`; `isDragging` (T3);
  `contextMenuOpen` (dos superficies no coexisten); `calibrationActive` (F9 — se **threadea**
  `calibrationMode` como prop porque el hook nunca lo recibe).
- **Boundary test** que fija el contrato de `transformTool.bbox` (F4): la barra lee `{x,y,width,height}`.

#### Files
- **Create** `src/components/PatternEditor/FloatingActionBar.tsx` (componente + `FloatingActionBarProps` + consts de anclaje).
- **Create** `src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx` (render RTL: anclaje/F4, superficie, icon-only, dismiss, Escape-por-construcción).
- **Modify** `src/components/PatternEditor/PatternEditor.tsx`
  - Imports: `FloatingActionBar`, `resolveTargetKind`/`CurationCtx` (`./actionCuration`), `selectWorkflowStage` (`../../store/selectors`).
  - Selectores nuevos junto a `calibrationMode` (`:87`): `stage` + `clipboard`.
  - `barCtx` (`useMemo`) desde la selección.
  - Montar `<FloatingActionBar/>` como hermano del `<svg>` dentro de `.pattern-editor` (tras `</svg>`, `:852`).

#### Interfaces
- **Consume:**
  - T2: `showTransformBox: boolean` (prop `show`) + `transformTool.bbox: BBox | null`.
  - T3: `transformTool.isDragging: boolean`.
  - T5: listener de captura de Escape (por construcción — la barra **no** agrega listener).
  - T6: `resolveBarActions(ctx: CurationCtx): ActionDef[]`, `resolveTargetKind(t): TargetKind`, tipos `CurationCtx`/`ActionDef`/`ActionId`, `BAR_ENABLED_KINDS`.
  - T8: `BAR_ICONS: Partial<Record<ActionId, LucideIcon>>`.
  - Shell: `ToolTooltip` (`{ name, shortcut?, children }`). Store: `selectWorkflowStage`, `s.editor.clipboard`. Geometría: `BBox` (`utils/geometry/transform`).
- **Produce:**
  ```ts
  export interface FloatingActionBarProps {
    show: boolean;                 // showTransformBox (T2)
    bbox: BBox | null;             // transformTool.bbox (T2/F4)
    pan2D: Point2D;
    zoom2D: number;
    isDragging: boolean;           // transformTool.isDragging (T3)
    contextMenuOpen: boolean;      // ctxMenu.visible
    calibrationActive: boolean;    // calibrationMode !== null (F9)
    ctx: CurationCtx | null;       // selección → piece/multiPiece
  }
  export default function FloatingActionBar(props: FloatingActionBarProps): JSX.Element | null;
  ```
  - En `PatternEditor`: `barCtx: CurationCtx | null` (memo desde la selección) + el montaje de la barra.

#### Steps

- [ ] Crear el test de la barra. Contenido completo:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { type ComponentProps } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import FloatingActionBar from '../FloatingActionBar';
import type { CurationCtx } from '../actionCuration';
import type { AppDispatch } from '../../../store';
import type { PatternPiece } from '../../../types/types';
import type { BBox } from '../../../utils/geometry/transform';

afterEach(cleanup);

function pieceFix(locked = false): PatternPiece {
  return {
    id: 'p1', name: 'P1', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, locked, seamAllowance: 0, outline: [], internals: [], edges: [],
  } as unknown as PatternPiece;
}

function makeCtx(over: Partial<CurationCtx> = {}): CurationCtx {
  return {
    dispatch: vi.fn() as unknown as AppDispatch,
    targetKind: 'piece', stage: 'drafted', altitude: 'body',
    pieceId: 'p1', piece: pieceFix(), selectedPieceIds: ['p1'],
    seamId: null, seam: null,
    internalLineId: null, internalLineType: null, internalLine: null,
    segmentIndex: undefined, segmentIsCurve: undefined,
    clipboard: null, groups: [], pieces: [pieceFix()],
    cb: {}, onClose: vi.fn(),
    ...over,
  };
}

const BBOX: BBox = { x: 100, y: 100, width: 200, height: 100 };

function renderBar(over: Partial<ComponentProps<typeof FloatingActionBar>> = {}) {
  return render(
    <FloatingActionBar
      show
      bbox={BBOX}
      pan2D={{ x: 0, y: 0 }}
      zoom2D={1}
      isDragging={false}
      contextMenuOpen={false}
      calibrationActive={false}
      ctx={makeCtx()}
      {...over}
    />,
  );
}

describe('FloatingActionBar — anclaje (F4: contrato de transformTool.bbox)', () => {
  it('ancla sobre el handle de rotación: centro-X del box, tope − 32px, translate(-50%,-100%)', () => {
    const { container } = renderBar();
    const bar = container.querySelector('.floating-action-bar') as HTMLElement;
    expect(bar).toBeTruthy();
    // left = pan.x + (bbox.x + bbox.width/2)*zoom = 0 + (100+100)*1
    expect(bar.style.left).toBe('200px');
    // top = boxTop(100) − ROTATE_HANDLE_GAP(32)
    expect(bar.style.top).toBe('68px');
    expect(bar.style.transform).toBe('translate(-50%, -100%)');
  });

  it('below-flip cuando no hay aire arriba: ancla bajo el box con BAR_GAP y translate(-50%,0)', () => {
    const { container } = renderBar({ bbox: { x: 0, y: 10, width: 100, height: 40 } });
    const bar = container.querySelector('.floating-action-bar') as HTMLElement;
    // boxBottom = (10+40)*1 = 50; top = 50 + BAR_GAP(8)
    expect(bar.style.top).toBe('58px');
    expect(bar.style.transform).toBe('translate(-50%, 0)');
    expect(bar.style.left).toBe('50px');
  });

  it('respeta pan y zoom al convertir patrón → pantalla', () => {
    const { container } = renderBar({
      pan2D: { x: 20, y: 40 }, zoom2D: 2, bbox: { x: 100, y: 100, width: 50, height: 50 },
    });
    const bar = container.querySelector('.floating-action-bar') as HTMLElement;
    // left = 20 + (100+25)*2 = 270; boxTop = 40 + 100*2 = 240; top = 240 − 32 = 208
    expect(bar.style.left).toBe('270px');
    expect(bar.style.top).toBe('208px');
  });
});

describe('FloatingActionBar — superficie neutral-dark (nunca azul de selección)', () => {
  it('fondo #1a1a1a, z-index 90; NO el azul de selección #4A9EFF', () => {
    const { container } = renderBar();
    const bar = container.querySelector('.floating-action-bar') as HTMLElement;
    expect(bar.style.backgroundColor).toBe('rgb(26, 26, 26)');       // #1a1a1a
    expect(bar.style.backgroundColor).not.toBe('rgb(74, 158, 255)'); // #4A9EFF
    expect(bar.style.zIndex).toBe('90');
  });
});

describe('FloatingActionBar — icon-only + labels en tooltip', () => {
  it('renderiza icon-only: un botón por acción, con SVG y sin texto visible', () => {
    renderBar();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5); // rotate90, duplicate, flipH, properties, lockToggle
    for (const b of buttons) {
      expect(b.querySelector('svg')).toBeTruthy();
      expect((b.textContent ?? '').trim()).toBe('');
    }
  });

  it('la acción corre el verbo existente al hacer clic (rotate90 → dispatch)', () => {
    const ctx = makeCtx();
    render(
      <FloatingActionBar
        show bbox={BBOX} pan2D={{ x: 0, y: 0 }} zoom2D={1}
        isDragging={false} contextMenuOpen={false} calibrationActive={false} ctx={ctx}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rotar 90°' }));
    expect(ctx.dispatch).toHaveBeenCalled();
  });
});

describe('FloatingActionBar — dismiss (una sola compuerta)', () => {
  const cases: Array<[string, Partial<ComponentProps<typeof FloatingActionBar>>]> = [
    ['show=false (deselección / cambio de tool / altitud POINT)', { show: false }],
    ['transform drag activo (T3)', { isDragging: true }],
    ['menú contextual abierto (dos superficies no coexisten)', { contextMenuOpen: true }],
    ['calibración activa (F9)', { calibrationActive: true }],
    ['sin ctx', { ctx: null }],
  ];
  it.each(cases)('no monta con %s', (_label, over) => {
    const { container } = renderBar(over);
    expect(container.querySelector('.floating-action-bar')).toBeNull();
  });
});

describe('FloatingActionBar — Escape seguro por construcción (T5)', () => {
  it('no registra ningún listener de teclado en window (cero race con la captura de Escape)', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderBar();
    expect(addSpy.mock.calls.some(c => c[0] === 'keydown')).toBe(false);
    addSpy.mockRestore();
  });
});
```

- [ ] Correr y esperar **FAIL** (el módulo `../FloatingActionBar` no existe aún): `npm run test -- src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx`

- [ ] Crear el componente `src/components/PatternEditor/FloatingActionBar.tsx` con el código completo:

```tsx
/**
 * FloatingActionBar (Surface A) — barra flotante de acciones sobre el transform
 * box en el verbo `select`. Cabalga T2–T5: monta cuando `showTransformBox` es
 * true (⇒ suprimida en altitud POINT por construcción, invariante G7), se ancla
 * a `transformTool.bbox`, y NO lleva listener de teclado — la seguridad de Escape
 * la da la captura de T5. Lee `resolveBarActions` (T6, cap 5, sin danger,
 * BAR_ENABLED_KINDS) y `BAR_ICONS` (T8, monocromo). icon-only + ToolTooltip:
 * el label vive en el tooltip.
 */
import { useMemo } from 'react';
import type { BBox } from '../../utils/geometry/transform';
import type { Point2D } from '../../types/types';
import type { CurationCtx } from './actionCuration';
import { resolveBarActions } from './actionCuration';
import { BAR_ICONS } from './barIcons';
import ToolTooltip from '../shell/ToolTooltip';

/** Gap (px de pantalla) del borde inferior de la barra al tope del box. La corona
 *  del handle de rotación vive en `bboxScreen.top − 29px` (ROTATION_ARM_LENGTH=25
 *  + ROTATE_RADIUS=4); 32 = 29 + 3px de aire → la barra nunca pisa el handle. */
const ROTATE_HANDLE_GAP = 32;
/** Gap del caso below-flip: despeja los handles inferiores (~5px). */
const BAR_GAP = 8;
// ponytail: altura estimada solo para ELEGIR arriba/abajo; el anclaje exacto no
// depende de ella. Subir a medición con ref si el layout real difiere.
const APPROX_BAR_HEIGHT = 40;

export interface FloatingActionBarProps {
  /** showTransformBox (T2): monta SOLO si es true → POINT suprimido por construcción. */
  show: boolean;
  /** transformTool.bbox (T2/F4): anclaje en coords de patrón. */
  bbox: BBox | null;
  pan2D: Point2D;
  zoom2D: number;
  /** transformTool.isDragging (T3): dismiss en cuanto arranca el transform drag. */
  isDragging: boolean;
  /** ctxMenu.visible: dos superficies nunca coexisten. */
  contextMenuOpen: boolean;
  /** calibrationMode !== null (F9): barra suprimida en calibración. */
  calibrationActive: boolean;
  /** Contexto resuelto (selección → piece/multiPiece). null si no hay selección. */
  ctx: CurationCtx | null;
}

export default function FloatingActionBar({
  show, bbox, pan2D, zoom2D, isDragging, contextMenuOpen, calibrationActive, ctx,
}: FloatingActionBarProps) {
  const actions = useMemo(() => (ctx ? resolveBarActions(ctx) : []), [ctx]);

  // Compuerta de montaje: todos los dismiss en un solo lugar.
  if (!show || !bbox || isDragging || contextMenuOpen || calibrationActive || !ctx) return null;
  if (actions.length === 0) return null;

  // Anclaje: box (patrón) → pantalla vía pan/zoom. Coords locales del contenedor
  // .pattern-editor (position:relative; SVG a 0,0).
  const left = pan2D.x + (bbox.x + bbox.width / 2) * zoom2D;
  const boxTop = pan2D.y + bbox.y * zoom2D;
  const boxBottom = pan2D.y + (bbox.y + bbox.height) * zoom2D;
  const flipBelow = boxTop - ROTATE_HANDLE_GAP - APPROX_BAR_HEIGHT < 0;
  const top = flipBelow ? boxBottom + BAR_GAP : boxTop - ROTATE_HANDLE_GAP;
  const transform = flipBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)';

  return (
    <div
      className="floating-action-bar"
      style={{
        position: 'absolute',
        left,
        top,
        transform,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
      }}
    >
      {actions.map((def) => {
        const Icon = BAR_ICONS[def.id];
        const label = typeof def.label === 'function' ? def.label(ctx) : def.label;
        return (
          <ToolTooltip key={def.id} name={label} shortcut={def.shortcut}>
            <button
              type="button"
              className="floating-action-bar__btn"
              aria-label={label}
              onClick={() => def.run(ctx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                padding: 0,
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                color: '#e0e0e0',
                cursor: 'pointer',
              }}
            >
              {Icon && <Icon size={16} />}
            </button>
          </ToolTooltip>
        );
      })}
    </div>
  );
}
```

- [ ] Correr y esperar **PASS**: `npm run test -- src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx`

- [ ] En `PatternEditor.tsx`, agregar los imports (junto a los imports de componentes/store existentes):

```ts
import FloatingActionBar from './FloatingActionBar';
import { resolveTargetKind, type CurationCtx } from './actionCuration';
import { selectWorkflowStage } from '../../store/selectors';
```

- [ ] En `PatternEditor.tsx`, agregar los selectores nuevos junto a `calibrationMode` (`:87`):

```ts
  const calibrationMode = useSelector((s: RootState) => s.editor.calibrationMode);
  const stage = useSelector(selectWorkflowStage);
  const clipboard = useSelector((s: RootState) => s.editor.clipboard);
```

- [ ] En `PatternEditor.tsx`, construir `barCtx` desde la selección (tras el `useMemo` de `groupColors`, `:111` — necesita `selectedPieceIds`, `pieces`, `dispatch`, `stage`, `clipboard`, `groups`, `onOpenPanel`, todos ya en scope):

```ts
  // Contexto de Surface A (barra flotante). Solo pieza/multiPieza (BAR_ENABLED_KINDS);
  // la barra decide el montaje. `properties` de la barra necesita onOpenProperties;
  // el resto son dispatches puros.
  const barCtx: CurationCtx | null = useMemo(() => {
    if (selectedPieceIds.length === 0) return null;
    const firstId = selectedPieceIds[0];
    const piece = pieces.find(p => p.id === firstId) ?? null;
    const targetKind = resolveTargetKind({
      seamId: null,
      pieceId: firstId,
      pieceCount: selectedPieceIds.length,
      internalLineType: null,
      altitude: 'body',
    });
    return {
      dispatch, targetKind, stage, altitude: 'body',
      pieceId: firstId, piece, selectedPieceIds,
      seamId: null, seam: null,
      internalLineId: null, internalLineType: null, internalLine: null,
      segmentIndex: undefined, segmentIsCurve: undefined,
      clipboard, groups, pieces,
      cb: { onOpenProperties: (id: string) => { dispatch(selectPiece(id)); onOpenPanel?.('Properties'); } },
      onClose: () => {},
    };
  }, [selectedPieceIds, pieces, dispatch, stage, clipboard, groups, onOpenPanel]);
```

- [ ] En `PatternEditor.tsx`, montar la barra como hermano del `<svg>`, tras `</svg>` (`:852`, antes del bloque `shouldShowEmptyState`):

```tsx
      </svg>
      <FloatingActionBar
        show={showTransformBox}
        bbox={transformTool.bbox}
        pan2D={pan2D}
        zoom2D={zoom2D}
        isDragging={transformTool.isDragging}
        contextMenuOpen={ctxMenu.visible}
        calibrationActive={calibrationMode !== null}
        ctx={barCtx}
      />
```

- [ ] `npx tsc -b --noEmit` limpio (el `CurationCtx` del `barCtx` debe cuadrar con lo que produce T6; `transformTool.bbox`/`.isDragging` con lo que produce `useTransformTool` tras T2/T3).

- [ ] Gate completo: `npx tsc -b --noEmit && npm run test && npm run lint`

- [ ] Commit: `git add -A && git commit -m "feat(pattern-edit): barra flotante de acciones en select (Surface A) anclada al transform box"`

---

## Auto-revisión antes de cerrar (Surface A)

**Decisiones A5 vs implementación:**

| Decisión fijada (A5/A4) | Dónde vive | Estado |
|---|---|---|
| Mapa monocromo propio keyed por `ActionId`, sin tocar `ActionDef.icon` | T8 `barIcons.ts` + test de no-regresión | ✅ |
| `BAR_ENABLED_KINDS={piece,multiPiece}`, cap 5, sin danger | `resolveBarActions` (T6); la barra solo lee | ✅ |
| icon-only + `ToolTooltip` | T9 componente + test icon-only | ✅ |
| Superficie `#1a1a1a`, nunca `#4A9EFF`, `z=90` | inline styles + test de superficie | ✅ |
| `ROTATE_HANDLE_GAP=32`, `BAR_GAP=8` + below-flip | consts de módulo + tests de anclaje (F4) | ✅ |
| Sin listener de teclado (Escape por construcción, T5) | componente sin `useEffect` de keydown + test `window.addEventListener` | ✅ |
| Suprimida en POINT por construcción | monta solo con `show`=`showTransformBox` (T2, G7) | ✅ |
| Dismiss: deselect/tool-switch/POINT, drag (T3), contextmenu, `calibrationMode!==null` (F9) | una compuerta + threading de `calibrationMode` como prop | ✅ |
| Boundary test del contrato `transformTool.bbox` (F4) | describe "anclaje (F4)" | ✅ |

**Placeholder scan:** cero "TBD", cero "similar a la Tarea N". Cada test trae su cuerpo vitest real;
cada implementación su código real.

**Consistencia de tipos:** `BAR_ICONS` (T8) keyed por `ActionId` (T6); `FloatingActionBarProps.ctx:
CurationCtx` (T6); `bbox: BBox` (geometry/transform, el mismo que produce `transformTool`); `show`
alimentado por `showTransformBox` (T2), `isDragging` por `transformTool.isDragging` (T3). `barCtx`
en `PatternEditor` produce un `CurationCtx` válido con `cb.onOpenProperties` para el verbo
`properties` de la fila `piece`. Ningún tipo referenciado sin definir.

**Nota de alcance honesta (desviación registrada):** A4 lista **8** glifos; el mapa autora **9**
(agrega `duplicateAll`). Razón: la fila `multiPiece` de `CURATION` (T6) autora `duplicateAll` en su
`bar`, y sin su ícono la barra no puede renderizar icon-only en multi-selección — el "~8" del pin es
aproximado y no incluía este id. El test de integridad de T8 ata el mapa a la tabla, así que la
cobertura es exacta, no un número mágico. No hay ninguna otra decisión fijada que no se haya podido
honrar.
