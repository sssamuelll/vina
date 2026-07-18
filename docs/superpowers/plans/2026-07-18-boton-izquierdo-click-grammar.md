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
