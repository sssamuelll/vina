# El grupo coincidente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un grupo de comandos que comparten coordenada de ancla se comporte como un solo punto al seleccionar, arrastrar, borrar y dibujar, y usar esa multiplicidad como señal derivada del tipo de punto.

**Architecture:** Un helper puro agrupa los índices de comando por coordenada exacta de ancla. `applyNodeMove` resuelve el grupo antes de escribir, lo que corrige las dos superficies de edición desde un solo sitio porque es su único punto compartido. `classifyEditableAnchors` se reescribe sobre esos grupos: una esquina detectada colorea a todos los miembros, y un grupo sin quiebre angular estrena el rol `lineEnd`. Nada se persiste; todo se recalcula por render.

**Tech Stack:** React 18, TypeScript 5.6, Redux Toolkit, SVG, Vitest 4 + Testing Library.

## Global Constraints

- Cero campos persistidos. No se tocan `PatternPiece`, `PathCommand`, el esquema zod ni IndexedDB.
- No se tocan `detectCorners`, `CORNER_ANGLE_THRESHOLD_DEG = 30` ni `outlineAnalysis`. El anclaje de piquetes debe quedar byte-idéntico.
- El agrupamiento usa igualdad **exacta** de coordenada, cuantizada con `Math.round(v * 1e6)`. Nunca épsilon.
- `ANCHOR_MATCH_EPS_MM = 0.05` se conserva solo para el emparejamiento esquina↔nodo, no para agrupar.
- `HIT_RADIUS_PX = 8` no cambia. El renderer no participa en hit-testing.
- Prioridad de rol exacta: `openEndpoint > corner > bezierAnchor > lineEnd > smoothSample`.
- Tamaños de pantalla exactos: endpoint diamante 10 px, corner cuadrado 10 px relleno, Bézier anillo 9 px, `lineEnd` cuadrado 8 px hueco, `smoothSample` círculo 4 px sin borde.
- Los tests de `AnchorGlyph` renderizan con `zoom2D={2}`, así que las aserciones de tamaño valen la mitad del valor de pantalla.
- No se deduplican vértices coincidentes en el importador. Este trabajo depende de que existan.
- No se corrige el resync de `useEditCurve` ni se unifica el hit-testing de los dos hooks.
- Verificación final obligatoria: `npx tsc -b --noEmit`, `npm run test` y `npm run lint`.

---

## File map

### Núcleo puro

- `src/components/PatternEditor/nodeEditorUtils.ts`: helpers de agrupamiento nuevos y `applyNodeMove` agrupado. Es el único punto compartido por las dos superficies de edición.
- `src/components/PatternEditor/anchorRoles.ts`: clasificación reescrita sobre grupos; `matchCornerCommandIndices` se elimina.

### Interacción

- `src/components/PatternEditor/useEditPattern.ts`: expansión de la selección al grupo en `handleMouseDown` y borrado todo-o-nada en el handler de `Delete`.

### Visual

- `src/components/PatternEditor/renderers/AnchorGlyph.tsx`: rama `lineEnd` y adelgazamiento de `smoothSample`.

### Pruebas

- `src/components/PatternEditor/__tests__/nodeEditorUtils.groups.test.ts` (nuevo)
- `src/components/PatternEditor/__tests__/anchorRoles.test.ts` (invertir un caso)
- `src/components/PatternEditor/__tests__/anchorRoles.maria.test.ts` (conteos reales)
- `src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx` (invertir dos aserciones)
- `src/components/PatternEditor/__tests__/useEditPattern.groupDelete.test.tsx` (nuevo)
- `src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx` (tamaños y quinta forma)
- `src/components/PatternEditor/renderers/__tests__/AnchorOverlayParity.test.tsx` (paridad con el rol nuevo)

### Números de referencia (medidos sobre el fixture real, no estimados)

`tests/fixtures/garments/maria_patrones_samuel_2M.dxf`, cargado con `importDXFContent(content, { unit: 'auto', autoDetect: true })`:

- 5 piezas, 892 comandos, 887 nodos editables, 28 esquinas detectadas.
- 40 grupos coincidentes con 85 miembros: 35 de tamaño 2 y 5 de tamaño 3.
- 28 grupos llevan esquina (58 miembros); 12 son suaves (27 miembros).
- Roles hoy: `corner` 28, `smoothSample` 859.
- Roles después: `corner` 58, `lineEnd` 27, `smoothSample` 802.

---

### Task 1: Helpers de agrupamiento coincidente

**Files:**
- Modify: `src/components/PatternEditor/nodeEditorUtils.ts:44-59` (después de `getAnchor`)
- Create: `src/components/PatternEditor/__tests__/nodeEditorUtils.groups.test.ts`

**Interfaces:**
- Consumes: `getAnchor(cmd: PathCommand): Point2D | null` (ya existe, línea 44).
- Produces:
  - `coincidentAnchorGroups(outline: PathCommand[]): Map<string, number[]>`
  - `anchorGroupOf(outline: PathCommand[], commandIndex: number): number[]`

- [ ] **Step 1: Escribir el test rojo de agrupamiento**

Crear `src/components/PatternEditor/__tests__/nodeEditorUtils.groups.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PathCommand } from '../../../types/types';
import { anchorGroupOf, coincidentAnchorGroups } from '../nodeEditorUtils';

const square: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

const doubledCorner: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

describe('coincidentAnchorGroups', () => {
  it('finds no group when every anchor is unique', () => {
    const groups = [...coincidentAnchorGroups(square).values()];
    expect(groups.filter((members) => members.length >= 2)).toEqual([]);
  });

  it('groups a doubled vertex and skips Z', () => {
    const groups = coincidentAnchorGroups(doubledCorner);
    const multi = [...groups.values()].filter((members) => members.length >= 2);
    expect(multi).toEqual([[1, 2]]);
    expect([...groups.values()].flat()).not.toContain(5);
  });

  it('returns a group of three in commandIndex order', () => {
    const tripled: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    expect(anchorGroupOf(tripled, 2)).toEqual([1, 2, 3]);
  });

  it('does not group anchors that are merely close', () => {
    const nearly: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100.001, 0] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    expect(anchorGroupOf(nearly, 1)).toEqual([1]);
  });

  it('groups the anchor of a C command by its endpoint', () => {
    const curved: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 10, 20, 20, 100, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    expect(anchorGroupOf(curved, 1)).toEqual([1, 2]);
  });

  it('returns an empty group for a Z command', () => {
    expect(anchorGroupOf(square, 4)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar el rojo**

Run: `npx vitest run src/components/PatternEditor/__tests__/nodeEditorUtils.groups.test.ts`
Expected: FAIL — `coincidentAnchorGroups is not a function` / `anchorGroupOf is not a function`.

- [ ] **Step 3: Implementar los helpers**

En `src/components/PatternEditor/nodeEditorUtils.ts`, insertar justo después de `getAnchor` (que termina en la línea 59) y antes del comentario `// ─── Public Functions ───`:

```ts
/** Grouping key for an anchor: exact coordinate quantised to the nanometre. */
function anchorKey(point: Point2D): string {
  return `${Math.round(point.x * 1e6)}|${Math.round(point.y * 1e6)}`;
}

/**
 * Command indices grouped by exact anchor coordinate. Z contributes nothing.
 *
 * CLO doubles the vertex at every turn point, so a corner arrives as two (or
 * three) commands at the identical coordinate. Treating that group as one
 * point is what keeps a drag from tearing the outline into a spike.
 *
 * ponytail: exact equality, never epsilon — epsilon grouping is non-transitive
 * (A~B, B~C, A!~C) and would make the result depend on iteration order, which
 * is the opposite of a deterministic attribute. Two anchors 0.001mm apart do
 * not group; moving one leaves the other 0.001mm away, geometrically inert.
 */
export function coincidentAnchorGroups(outline: PathCommand[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < outline.length; i++) {
    const anchor = getAnchor(outline[i]);
    if (!anchor) continue;
    const key = anchorKey(anchor);
    const bucket = groups.get(key);
    if (bucket) bucket.push(i);
    else groups.set(key, [i]);
  }
  return groups;
}

/** Command indices sharing an anchor with `commandIndex`, including itself. */
export function anchorGroupOf(outline: PathCommand[], commandIndex: number): number[] {
  const anchor = getAnchor(outline[commandIndex]);
  if (!anchor) return [];
  return coincidentAnchorGroups(outline).get(anchorKey(anchor)) ?? [];
}
```

- [ ] **Step 4: Correr el test para confirmar el verde**

Run: `npx vitest run src/components/PatternEditor/__tests__/nodeEditorUtils.groups.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/nodeEditorUtils.ts \
        src/components/PatternEditor/__tests__/nodeEditorUtils.groups.test.ts
git commit -m "feat(pattern-edit): agrupar anclas coincidentes por coordenada exacta

CLO duplica el vertice en cada punto de trazado. Agruparlos es la base para
que una esquina se comporte como un solo punto.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `applyNodeMove` mueve el grupo completo

**Files:**
- Modify: `src/components/PatternEditor/nodeEditorUtils.ts:112-173`
- Modify: `src/components/PatternEditor/__tests__/nodeEditorUtils.groups.test.ts`
- Modify: `src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx:271-272`

**Interfaces:**
- Consumes: `anchorGroupOf` de la Task 1.
- Produces: `applyNodeMove(outline, commandIndex, pointType, newPos)` conserva su firma exacta; cambia solo el comportamiento cuando `pointType === 'anchor'`.

- [ ] **Step 1: Escribir los tests rojos del movimiento agrupado**

Añadir al final de `src/components/PatternEditor/__tests__/nodeEditorUtils.groups.test.ts`:

```ts
import { applyNodeMove } from '../nodeEditorUtils';

describe('applyNodeMove sobre un grupo coincidente', () => {
  it('moves every member of the group to the same coordinate', () => {
    const moved = applyNodeMove(doubledCorner, 1, 'anchor', { x: 140, y: 40 });
    expect(moved[1].values).toEqual([140, 40]);
    expect(moved[2].values).toEqual([140, 40]);
    expect(moved).toHaveLength(doubledCorner.length);
  });

  it('keeps the group intact so a second drag still finds it', () => {
    const moved = applyNodeMove(doubledCorner, 1, 'anchor', { x: 140, y: 40 });
    expect(anchorGroupOf(moved, 2)).toEqual([1, 2]);
  });

  it('leaves untouched commands byte-identical', () => {
    const moved = applyNodeMove(doubledCorner, 1, 'anchor', { x: 140, y: 40 });
    expect(moved[0].values).toEqual([0, 0]);
    expect(moved[3].values).toEqual([100, 100]);
    expect(moved[4].values).toEqual([0, 100]);
  });

  it('moves a lone anchor exactly as before', () => {
    const moved = applyNodeMove(square, 1, 'anchor', { x: 140, y: 40 });
    expect(moved[1].values).toEqual([140, 40]);
    expect(moved[2].values).toEqual([100, 100]);
  });

  it('does not group control-point moves', () => {
    const curved: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 10, 20, 20, 100, 0] },
      { type: 'C', values: [30, 30, 40, 40, 100, 0] },
      { type: 'Z', values: [] },
    ];
    const moved = applyNodeMove(curved, 1, 'cp1', { x: 55, y: 55 });
    expect(moved[1].values.slice(0, 2)).toEqual([55, 55]);
    expect(moved[2].values.slice(0, 2)).toEqual([30, 30]);
  });
});
```

- [ ] **Step 2: Correr el archivo para confirmar el rojo**

Run: `npx vitest run src/components/PatternEditor/__tests__/nodeEditorUtils.groups.test.ts`
Expected: FAIL en "moves every member", "keeps the group intact" y "keeps... a second drag" — `moved[2].values` sigue en `[100, 0]`.

- [ ] **Step 3: Reescribir `applyNodeMove` sobre el grupo**

Reemplazar el cuerpo completo de `applyNodeMove` (`nodeEditorUtils.ts:112-173`) por:

```ts
/**
 * Apply a node position change back to the PathCommand array (immutable).
 *
 * An anchor move applies to the whole coincident group: CLO doubles the vertex
 * at every turn point, and writing to only one member leaves the twin behind,
 * which tears the outline into a spike and leaves a glyph stranded at the old
 * coordinate. Control-point moves are never grouped — handles are not anchors.
 *
 * ponytail: for a group whose members are C/Q the per-command handle coupling
 * runs once per member. No known file has coincident Bézier anchors; if one
 * appears, that is the case to test.
 */
export function applyNodeMove(
  outline: PathCommand[],
  commandIndex: number,
  pointType: 'anchor' | 'cp1' | 'cp2',
  newPos: Point2D,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  if (!cmds[commandIndex]) return cmds;

  const targets = pointType === 'anchor'
    ? anchorGroupOf(outline, commandIndex)
    : [commandIndex];

  for (const index of targets) moveOneCommand(cmds, index, pointType, newPos);

  return cmds;
}

/** Write a single command in place. Extracted so a group can reuse it. */
function moveOneCommand(
  cmds: PathCommand[],
  commandIndex: number,
  pointType: 'anchor' | 'cp1' | 'cp2',
  newPos: Point2D,
): void {
  const cmd = cmds[commandIndex];
  if (!cmd) return;

  switch (cmd.type) {
    case 'M':
    case 'L':
      if (pointType === 'anchor') {
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      }
      break;
    case 'C':
      if (pointType === 'anchor') {
        // Move anchor (v[4], v[5]) and drag control points with it
        const dx = newPos.x - cmd.values[4];
        const dy = newPos.y - cmd.values[5];
        cmd.values[4] = newPos.x;
        cmd.values[5] = newPos.y;
        // Move cp2 (incoming handle) with anchor
        cmd.values[2] += dx;
        cmd.values[3] += dy;
        // Also move cp1 of NEXT command if it's a C
        const nextIdx = commandIndex + 1;
        if (nextIdx < cmds.length && cmds[nextIdx].type === 'C') {
          cmds[nextIdx].values[0] += dx;
          cmds[nextIdx].values[1] += dy;
        }
      } else if (pointType === 'cp1') {
        // cp1 = outgoing handle of PREVIOUS node = values[0,1]
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      } else if (pointType === 'cp2') {
        // cp2 = incoming handle of THIS node = values[2,3]
        cmd.values[2] = newPos.x;
        cmd.values[3] = newPos.y;
      }
      break;
    case 'Q':
      if (pointType === 'anchor') {
        const qdx = newPos.x - cmd.values[2];
        const qdy = newPos.y - cmd.values[3];
        cmd.values[2] = newPos.x;
        cmd.values[3] = newPos.y;
        cmd.values[0] += qdx;
        cmd.values[1] += qdy;
      } else if (pointType === 'cp1') {
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      }
      break;
  }
}
```

- [ ] **Step 4: Invertir las dos aserciones que congelan el desgarre**

En `src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx`, sustituir las líneas 271-272:

```ts
      expect(changedIndices).toEqual([target!.node.ref.commandIndex]);
      expect(maxCoincidentMultiplicity(moved)).toBeLessThanOrEqual(originalMultiplicity);
```

por:

```ts
      // A coincident group is one point: every member moves, or the outline
      // tears. The old assertion demanded exactly one changed command, which
      // is the bug María reported as "a phantom point appeared".
      expect(changedIndices).toEqual(
        anchorGroupOf(piece.outline, target!.node.ref.commandIndex),
      );
      expect(maxCoincidentMultiplicity(moved)).toBe(originalMultiplicity);
```

Y añadir `anchorGroupOf` al import existente de `../nodeEditorUtils` en ese archivo.

- [ ] **Step 5: Correr los dos archivos y confirmar el verde**

Run:
```bash
npx vitest run src/components/PatternEditor/__tests__/nodeEditorUtils.groups.test.ts \
               src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx
```
Expected: PASS. El caso `'corner'` del `it.each` ahora afirma el grupo completo; el caso `'smoothSample'` sigue afirmando un solo índice porque su grupo tiene un solo miembro.

- [ ] **Step 6: Correr la regresión de las dos superficies**

Run: `npx vitest run src/components/PatternEditor/__tests__`
Expected: PASS. `useEditCurve` no se tocó y hereda el arreglo por compartir `applyNodeMove`.

- [ ] **Step 7: Commit**

```bash
git add src/components/PatternEditor/nodeEditorUtils.ts \
        src/components/PatternEditor/__tests__/nodeEditorUtils.groups.test.ts \
        src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx
git commit -m "fix(pattern-edit): arrastrar una esquina mueve el grupo, no un gemelo

applyNodeMove escribia en un solo comando. En el DXF de Maria cada esquina
son 2-3 comandos coincidentes, asi que arrastrar movia uno y dejaba el otro:
el contorno se abria en una pua y el glifo quedaba varado en el sitio viejo.
Eso es el 'punto extra que aparece de la nada' de la nota #167.

Los dos llamadores (useEditPattern y useEditCurve) heredan el arreglo.

El test de la esquina afirmaba toEqual([un indice]) y toBeLessThanOrEqual
sobre la multiplicidad: congelaba el desgarre como correcto. Invertidos.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Selección y borrado agrupados

**Files:**
- Modify: `src/components/PatternEditor/useEditPattern.ts:314-357` (selección en `handleMouseDown`)
- Modify: `src/components/PatternEditor/useEditPattern.ts:575-612` (handler de `Delete`)
- Create: `src/components/PatternEditor/__tests__/useEditPattern.groupDelete.test.tsx`

**Interfaces:**
- Consumes: `anchorGroupOf` de la Task 1; `deletePoint(outline, commandIndex)` (ya existe, `nodeEditorUtils.ts:401`), que lanza si quedarían menos de 3 anclas.
- Produces: ningún símbolo nuevo. `state.selectedNodes` pasa a contener siempre grupos completos.

**Nota de implementación, ya verificada leyendo el código:** el bucle de arrastre de `useEditPattern.ts:458-464` **no necesita cambio**. `drag.startPositions` guarda las coordenadas de *antes* del arrastre, y los gemelos comparten esa coordenada, así que cada iteración calcula el mismo `newPos` y la segunda pasada es un no-op idempotente.

- [ ] **Step 1: Escribir el test rojo de borrado agrupado**

Crear `src/components/PatternEditor/__tests__/useEditPattern.groupDelete.test.tsx`. Reusar el harness compartido del área copiando el `setup` de `useEditPattern.undo.test.tsx` (mismo store real y mismo `renderHook`); no inventar uno nuevo.

```tsx
// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { setup, mouseAt, pieceLocalToPattern } from './useEditPattern.undo.test';

function pieceWithDoubledCorner(): PatternPiece {
  return {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, internals: [],
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'L', values: [0, 50] },
      { type: 'Z', values: [] },
    ],
  } as PatternPiece;
}

describe('useEditPattern — borrado de un grupo coincidente', () => {
  it('selects the whole group when one member is clicked', () => {
    const piece = pieceWithDoubledCorner();
    const { ref } = setup(piece);
    act(() => {
      ref.current!.handleMouseDown(
        mouseAt(pieceLocalToPattern({ x: 100, y: 0 }, piece)),
      );
    });
    expect([...ref.current!.selectedNodes].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('deletes both members so the corner really disappears', () => {
    const piece = pieceWithDoubledCorner();
    const { store, ref } = setup(piece);
    act(() => {
      ref.current!.handleMouseDown(
        mouseAt(pieceLocalToPattern({ x: 100, y: 0 }, piece)),
      );
    });
    act(() => {
      ref.current!.handleKeyDown(
        new KeyboardEvent('keydown', { key: 'Delete' }),
      );
    });
    const outline = store.getState().project.pieces[0].outline;
    expect(outline).toHaveLength(5);
    expect(outline.some((c) => c.values[0] === 100 && c.values[1] === 0)).toBe(false);
  });

  it('deletes nothing when the group would drop the piece below three anchors', () => {
    const piece = {
      ...pieceWithDoubledCorner(),
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    } as PatternPiece;
    const { store, ref } = setup(piece);
    const before = store.getState().project.pieces[0].outline;
    act(() => {
      ref.current!.handleMouseDown(
        mouseAt(pieceLocalToPattern({ x: 100, y: 0 }, piece)),
      );
    });
    act(() => {
      ref.current!.handleKeyDown(
        new KeyboardEvent('keydown', { key: 'Delete' }),
      );
    });
    expect(store.getState().project.pieces[0].outline).toEqual(before);
  });
});
```

Y el mismo caso sobre el archivo real, que es el que le importa a María:

```tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importDXFContent } from '../../../utils/dxf';
import { extractNodes, anchorGroupOf } from '../nodeEditorUtils';
import { classifyEditableAnchors } from '../anchorRoles';

const MARIA_FIXTURE = resolve(
  __dirname,
  '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf',
);

it('deletes a real corner of María pattern, group and all', () => {
  const pieces = importDXFContent(readFileSync(MARIA_FIXTURE, 'utf8'), {
    unit: 'auto', autoDetect: true,
  }).pieces;
  const piece = pieces.find((item) => item.outline.length > 100)!;
  const corner = classifyEditableAnchors(piece, extractNodes(piece))
    .find((item) => item.role === 'corner')!;
  const group = anchorGroupOf(piece.outline, corner.node.ref.commandIndex);
  expect(group.length).toBeGreaterThanOrEqual(2);

  const { store, ref } = setup(piece);
  const before = store.getState().project.pieces[0].outline.length;

  act(() => {
    ref.current!.handleMouseDown(
      mouseAt(pieceLocalToPattern(corner.node.position, piece)),
    );
  });
  act(() => {
    ref.current!.handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete' }));
  });

  expect(store.getState().project.pieces[0].outline).toHaveLength(before - group.length);
});
```

`setup`, `mouseAt` y `pieceLocalToPattern` viven hoy en `useEditPattern.undo.test.tsx` sin exportar. Exportarlos ahí en este mismo paso (añadir `export` a las tres declaraciones) en vez de duplicarlos.

- [ ] **Step 2: Correr el archivo para confirmar el rojo**

Run: `npx vitest run src/components/PatternEditor/__tests__/useEditPattern.groupDelete.test.tsx`
Expected: FAIL — la selección devuelve `[1]` y el borrado deja el gemelo, así que el contorno conserva 6 comandos.

- [ ] **Step 3: Expandir la selección al grupo**

En `useEditPattern.ts`, dentro de `handleMouseDown`, sustituir el bloque de las líneas 316-348 por:

```ts
      if (nodeHit) {
        const idx = nodeHit.commandIndex;
        const shift = e.shiftKey;
        // A coincident group is one point: selecting a member selects them all,
        // so Delete removes the corner instead of leaving its twin behind.
        const group = anchorGroupOf(piece.outline, idx);

        setState(s => {
          const newSelected = new Set(shift ? s.selectedNodes : []);
          if (shift && s.selectedNodes.has(idx)) {
            for (const ci of group) newSelected.delete(ci);
          } else {
            for (const ci of group) newSelected.add(ci);
          }
          return {
            ...s,
            selectedNodes: newSelected,
            selectedSegments: new Set<number>(),
          };
        });

        // Build startPositions for all selected nodes (including the new group)
        const selectedAfterClick = new Set(e.shiftKey ? state.selectedNodes : []);
        if (e.shiftKey && state.selectedNodes.has(idx)) {
          for (const ci of group) selectedAfterClick.delete(ci);
        } else {
          for (const ci of group) selectedAfterClick.add(ci);
        }

        const startPositions = new Map<number, Point2D>();
        for (const ci of selectedAfterClick) {
          const node = state.nodes.find(n => n.ref.commandIndex === ci);
          if (node) {
            startPositions.set(ci, { ...node.position });
          }
        }
```

Añadir `anchorGroupOf` al import existente desde `./nodeEditorUtils` (que hoy trae `hitTestNode`, `applyNodeMove` y `splitSegmentAt`, líneas 25-28).

- [ ] **Step 4: Hacer el borrado todo-o-nada**

En `useEditPattern.ts`, sustituir el bloque de las líneas 581-595 por:

```ts
        // Sort indices descending to preserve earlier indices when deleting
        const indices = [...state.selectedNodes].sort((a, b) => b - a);

        // All-or-nothing: deleting part of a coincident group would leave a
        // stranded twin, and a partial multi-delete is worse than none.
        const anchorCount = piece.outline.filter(c => c.type !== 'Z').length;
        if (anchorCount - indices.length < 3) return;

        let outline = piece.outline;
        let deletedCount = 0;
        for (const idx of indices) {
          outline = deletePoint(outline, idx);
          deletedCount++;
        }
```

El `try`/`catch` desaparece: el guard de arriba ya garantiza que `deletePoint` no lanza.

- [ ] **Step 5: Correr el archivo nuevo y las regresiones del área**

Run:
```bash
npx vitest run src/components/PatternEditor/__tests__/useEditPattern.groupDelete.test.tsx \
               src/components/PatternEditor/__tests__/useEditPattern.test.tsx \
               src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx
```
Expected: PASS los tres archivos.

- [ ] **Step 6: Commit**

```bash
git add src/components/PatternEditor/useEditPattern.ts \
        src/components/PatternEditor/__tests__/useEditPattern.groupDelete.test.tsx \
        src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx
git commit -m "fix(pattern-edit): seleccionar y borrar una esquina toma el grupo entero

Delete borraba un gemelo y dejaba el otro en la misma coordenada. Como un
vertice duplicado es geometricamente inerte, el contorno no cambiaba de
forma: para Maria, Delete sobre una esquina no hacia nada, pero el historial
si se ensuciaba.

El borrado pasa a ser todo-o-nada; un borrado parcial deja media esquina.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Clasificación sobre grupos y el rol `lineEnd`

**Files:**
- Modify: `src/components/PatternEditor/anchorRoles.ts:1-85` (archivo completo)
- Modify: `src/components/PatternEditor/__tests__/anchorRoles.test.ts:77-89`

**Interfaces:**
- Consumes: `coincidentAnchorGroups` de la Task 1; `detectCorners` de `src/utils/notchAnchor.ts` (sin cambios).
- Produces: `AnchorRole` gana el miembro `'lineEnd'`. `classifyEditableAnchors(piece, nodes)` conserva firma, orden y `commandIndex`. `matchCornerCommandIndices` deja de existir; `ANCHOR_MATCH_EPS_MM` se conserva exportada.

- [ ] **Step 1: Invertir el test que pide el defecto**

En `src/components/PatternEditor/__tests__/anchorRoles.test.ts`, sustituir el bloque de las líneas 77-89 por:

```ts
  it('gives the corner role to every command sharing the coordinate', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ]);
    const coincident = result.filter((item) =>
      item.node.position.x === 100 && item.node.position.y === 0);
    expect(coincident).toHaveLength(2);
    expect(coincident.map((item) => item.role)).toEqual(['corner', 'corner']);
  });

  it('marks a smooth doubled vertex as lineEnd', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ]);
    const coincident = result.filter((item) =>
      item.node.position.x === 50 && item.node.position.y === 0);
    expect(coincident.map((item) => item.role)).toEqual(['lineEnd', 'lineEnd']);
  });

  it('does not invent lineEnd where no vertex is doubled', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ]);
    expect(result.some((item) => item.role === 'lineEnd')).toBe(false);
  });

  it('keeps openEndpoint above the group role on an open path', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 0] },
    ]);
    // El último nodo comparte coordenada con el anterior; el extremo abierto
    // manda igual, que es la prioridad declarada en la spec §7.
    expect(result[0].role).toBe('openEndpoint');
    expect(result[3].role).toBe('openEndpoint');
  });
```

- [ ] **Step 2: Correr el archivo para confirmar el rojo**

Run: `npx vitest run src/components/PatternEditor/__tests__/anchorRoles.test.ts`
Expected: FAIL — el segundo gemelo sale `smoothSample`, y `'lineEnd'` no existe en el tipo `AnchorRole`.

- [ ] **Step 3: Reescribir el clasificador sobre grupos**

Sustituir el contenido completo de `src/components/PatternEditor/anchorRoles.ts` por:

```ts
import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { detectCorners } from '../../utils/notchAnchor';
import { coincidentAnchorGroups, type EditableNode } from './nodeEditorUtils';

export const ANCHOR_MATCH_EPS_MM = 0.05;

export type AnchorRole =
  | 'openEndpoint'
  | 'corner'
  | 'bezierAnchor'
  | 'lineEnd'
  | 'smoothSample';

export interface ClassifiedAnchor {
  node: EditableNode;
  role: AnchorRole;
}

function isBezierCommand(command: PathCommand | undefined): boolean {
  return command?.type === 'C' || command?.type === 'Q';
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * View-only role per editable anchor. Nothing here is persisted.
 *
 * Two signals, both already in the outline. The angular break (detectCorners,
 * 30°) says whether the direction of travel snaps. The coincident group says
 * whether the vertex was *declared*: CLO writes the vertex twice wherever one
 * drawn line ends and the next begins, and never on a curve sample. That is
 * the difference María asked about in note #167.
 *
 * ponytail: lineEnd depends on CLO's doubled vertex. A piece drawn inside
 * OpenClo has no twins and gets no lineEnd — it still gets corners by angle.
 * If the importer ever dedupes coincident anchors, lineEnd goes to zero; the
 * counts pinned in anchorRoles.maria.test.ts go red that day, which is the
 * moment to read DXF layers 2/3 instead.
 */
export function classifyEditableAnchors(
  piece: PatternPiece,
  nodes: EditableNode[],
): ClassifiedAnchor[] {
  const closed = piece.outline.some((command) => command.type === 'Z');
  const endpoints = new Set<number>();
  if (!closed && nodes.length > 0) {
    endpoints.add(nodes[0].ref.commandIndex);
    endpoints.add(nodes[nodes.length - 1].ref.commandIndex);
  }

  const groupOf = new Map<number, number[]>();
  for (const members of coincidentAnchorGroups(piece.outline).values()) {
    for (const index of members) groupOf.set(index, members);
  }

  // A detected corner colours every member of its group. Claiming one node per
  // corner is what stacked a 6px curve dot on top of every 10px corner square.
  const detected = detectCorners(piece.outline);
  const corners = new Set<number>();
  for (const node of nodes) {
    const hit = detected.some(
      (corner) => distance(corner, node.position) <= ANCHOR_MATCH_EPS_MM,
    );
    if (!hit) continue;
    for (const index of groupOf.get(node.ref.commandIndex) ?? [node.ref.commandIndex]) {
      corners.add(index);
    }
  }

  return nodes.map((node) => {
    const index = node.ref.commandIndex;
    let role: AnchorRole = 'smoothSample';
    if (endpoints.has(index)) {
      role = 'openEndpoint';
    } else if (corners.has(index)) {
      role = 'corner';
    } else if (
      isBezierCommand(piece.outline[index]) ||
      isBezierCommand(piece.outline[index + 1])
    ) {
      role = 'bezierAnchor';
    } else if ((groupOf.get(index)?.length ?? 1) >= 2) {
      role = 'lineEnd';
    }
    return { node, role };
  });
}
```

- [ ] **Step 4: Correr el clasificador y sus consumidores**

Run:
```bash
npx vitest run src/components/PatternEditor/__tests__/anchorRoles.test.ts \
               src/components/PatternEditor/__tests__/anchorRoles.maria.test.ts \
               src/components/PatternEditor/renderers/__tests__
```
Expected: PASS `anchorRoles.test.ts`. `AnchorOverlayParity` y `EditPatternOverlay` deben seguir verdes porque el contrato de un glifo por nodo no cambió.

- [ ] **Step 5: Correr la regresión de piquetes para probar que no se movió el anclaje**

Run: `npx vitest run src/utils/__tests__ -t notch`
Expected: PASS. No se tocó `detectCorners`, solo cómo se proyecta su salida.

- [ ] **Step 6: Commit**

```bash
git add src/components/PatternEditor/anchorRoles.ts \
        src/components/PatternEditor/__tests__/anchorRoles.test.ts
git commit -m "feat(pattern-edit): rol por grupo coincidente y lineEnd (nota #167)

Una esquina detectada colorea a TODOS los miembros de su grupo, no a uno:
matchCornerCommandIndices reclamaba un nodo por esquina con available.delete
y el gemelo caia a smoothSample, asi que las 28 esquinas del patron de Maria
pintaban un circulo de 6px encima del cuadrado de 10px.

lineEnd es el rol nuevo: vertice duplicado sin quiebre angular, o sea donde
CLO cerro una linea y abrio la siguiente. Es la respuesta afirmativa a
'los puntos de principio y fin de segmento deberian ser distintos'.

El test 'assigns one corner role when consecutive commands share a
coordinate' pedia el defecto por su nombre. Invertido.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Glifo de `lineEnd` y adelgazamiento de `smoothSample`

**Files:**
- Modify: `src/components/PatternEditor/renderers/AnchorGlyph.tsx:20-68`
- Modify: `src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx:37-66`

**Interfaces:**
- Consumes: `AnchorRole` de la Task 4, ya con `'lineEnd'`.
- Produces: ningún símbolo nuevo. `AnchorGlyphProps` no cambia.

- [ ] **Step 1: Escribir los tests rojos del glifo**

En `src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx`, sustituir el test de las líneas 37-47 por:

```tsx
  it('renders exact screen-space sizes through zoom compensation', () => {
    const corner = draw('corner').container.querySelector('rect')!;
    expect(Number(corner.getAttribute('width'))).toBe(5);
    cleanup();
    const smooth = draw('smoothSample').container.querySelector('circle')!;
    expect(Number(smooth.getAttribute('r'))).toBe(1);
    cleanup();
    const bezier = draw('bezierAnchor').container.querySelectorAll('circle');
    expect(bezier).toHaveLength(2);
    expect(Number(bezier[0].getAttribute('r'))).toBe(2.25);
    cleanup();
    const lineEnd = draw('lineEnd').container.querySelectorAll('rect');
    expect(lineEnd).toHaveLength(2);
    expect(Number(lineEnd[0].getAttribute('width'))).toBe(4);
  });
```

y el test de las líneas 58-66 por:

```tsx
  it('uses diamond, square, ring, hollow square and dot as distinct glyphs', () => {
    expect(draw('openEndpoint').container.querySelector('polygon')).toBeTruthy();
    cleanup();
    expect(draw('corner').container.querySelector('rect')?.getAttribute('fill'))
      .toBe('#4A9EFF');
    cleanup();
    expect(draw('bezierAnchor').container.querySelectorAll('circle')).toHaveLength(2);
    cleanup();
    const lineEnd = draw('lineEnd').container.querySelectorAll('rect');
    expect(lineEnd).toHaveLength(2);
    expect(lineEnd[1].getAttribute('fill')).toBe('none');
    cleanup();
    expect(draw('smoothSample').container.querySelectorAll('circle')).toHaveLength(1);
  });

  it('draws the curve dot without a white halo so corners stay legible', () => {
    const smooth = draw('smoothSample').container.querySelector('circle')!;
    expect(smooth.getAttribute('stroke')).toBeNull();
  });
```

- [ ] **Step 2: Correr el archivo para confirmar el rojo**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx`
Expected: FAIL — `smoothSample` mide 1.5, `lineEnd` no dibuja nada y el punto de curva conserva `stroke="#fff"`.

- [ ] **Step 3: Implementar las dos formas**

En `src/components/PatternEditor/renderers/AnchorGlyph.tsx`, añadir bajo `const halfLarge = 5 / zoom2D;` (línea 25):

```tsx
  const halfSmall = 4 / zoom2D;
```

Insertar la rama nueva entre `bezierAnchor` y `smoothSample`:

```tsx
      {role === 'lineEnd' && (
        <>
          <rect
            x={-halfSmall} y={-halfSmall}
            width={halfSmall * 2} height={halfSmall * 2}
            fill="none" stroke="#fff" strokeWidth={3 / zoom2D}
          />
          <rect
            x={-halfSmall} y={-halfSmall}
            width={halfSmall * 2} height={halfSmall * 2}
            fill="none" stroke={color} strokeWidth={1.5 / zoom2D}
          />
        </>
      )}
```

Y sustituir la rama `smoothSample` (líneas 60-65) por:

```tsx
      {role === 'smoothSample' && (
        <circle r={2 / zoom2D} fill={color} />
      )}
```

- [ ] **Step 4: Correr los tests visuales completos**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__`
Expected: PASS sin tocar `AnchorOverlayParity.test.tsx`. Ese archivo no fija una lista cerrada de roles: compara la secuencia de roles entre los dos overlays (`:60-61`) y usa `toContain('corner')` y `toContain('smoothSample')` (`:62-63`), así que el miembro nuevo de la unión no lo rompe. Si aun así se pusiera rojo, es señal de que la paridad entre overlays se rompió de verdad — investigar, no ajustar la aserción.

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/renderers/AnchorGlyph.tsx \
        src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx
git commit -m "feat(pattern-edit): cuadrado hueco para lineEnd y punto de curva mas fino

lineEnd entra en la familia visual de la esquina con menos peso: comunica
'estructural pero sin quiebre'.

smoothSample baja de 6px con borde blanco a 4px sin borde. Hoy 802 de los
887 puntos que Maria ve son muestras de curva con halo, y esa masa es la
razon material de que no distinga nada.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Contrato contra el DXF real y guarda anti-deduplicación

**Files:**
- Modify: `src/components/PatternEditor/__tests__/anchorRoles.maria.test.ts`

**Interfaces:**
- Consumes: `coincidentAnchorGroups` (Task 1), `classifyEditableAnchors` (Task 4), `importDXFContent` de `src/utils/dxf`, `extractNodes` de `nodeEditorUtils`.
- Produces: ningún símbolo. Fija los conteos medidos como contrato.

- [ ] **Step 1: Escribir el contrato rojo sobre el fixture**

El archivo hoy tiene un único `describe` y carga el fixture en línea dentro del `it` (`:15-17`), con la constante `FIXTURE` ya definida en `:8-11`. Primero extraer el helper y ampliar el import — la línea 5 hoy importa solo `extractNodes`:

```ts
import { extractNodes, coincidentAnchorGroups } from '../nodeEditorUtils';

function mariaPieces() {
  return importDXFContent(readFileSync(FIXTURE, 'utf8'), {
    unit: 'auto', autoDetect: true,
  }).pieces;
}
```

y luego añadir el `describe` nuevo al final del archivo:

```ts
describe('DXF real de María — contrato de grupos y roles', () => {
  it('carries 40 coincident groups, 28 of them on corners', () => {
    let groups = 0;
    let members = 0;
    for (const piece of mariaPieces()) {
      const multi = [...coincidentAnchorGroups(piece.outline).values()]
        .filter((g) => g.length >= 2);
      groups += multi.length;
      members += multi.reduce((sum, g) => sum + g.length, 0);
    }
    expect(groups).toBe(40);
    expect(members).toBe(85);
  });

  it('classifies 58 corners, 27 lineEnds and 802 curve samples', () => {
    const total: Record<string, number> = {};
    for (const piece of mariaPieces()) {
      for (const item of classifyEditableAnchors(piece, extractNodes(piece))) {
        total[item.role] = (total[item.role] ?? 0) + 1;
      }
    }
    expect(total).toEqual({ corner: 58, lineEnd: 27, smoothSample: 802 });
  });

  it('never stacks two different glyphs on the same coordinate', () => {
    for (const piece of mariaPieces()) {
      const roleByIndex = new Map(
        classifyEditableAnchors(piece, extractNodes(piece))
          .map((item) => [item.node.ref.commandIndex, item.role]),
      );
      for (const members of coincidentAnchorGroups(piece.outline).values()) {
        const roles = new Set(members.map((index) => roleByIndex.get(index)));
        expect(roles.size).toBe(1);
      }
    }
  });
});
```

- [ ] **Step 2: Correr el archivo**

Run: `npx vitest run src/components/PatternEditor/__tests__/anchorRoles.maria.test.ts`
Expected: PASS los tres. Estos números salieron de una medición real; si alguno falla, **la implementación está mal, no el número** — reabrir la Task 4 antes de tocar la aserción.

- [ ] **Step 3: Documentar la guarda en el propio archivo**

Añadir encima del `describe` nuevo:

```ts
// Estos conteos son el seguro contra una trampa concreta: si algún día el
// importador deduplica los vértices coincidentes de CLO —cosa razonable de
// querer hacer— `lineEnd` se iría a cero en silencio y nadie se enteraría
// hasta que María lo reporte. Este archivo se pone rojo ese día y obliga a
// decidir explícitamente si se leen las capas 2/3 del DXF en su lugar.
```

- [ ] **Step 4: Commit**

```bash
git add src/components/PatternEditor/__tests__/anchorRoles.maria.test.ts
git commit -m "test(pattern-edit): fijar los conteos reales del DXF de Maria

40 grupos coincidentes con 85 miembros; roles corner 58, lineEnd 27,
smoothSample 802; y cero glifos apilados en las cinco piezas.

Es la guarda anti-deduplicacion: si el importador colapsa los gemelos,
lineEnd se iria a cero en silencio. Ahora se pone rojo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Gate completo

**Files:** ninguno nuevo.

**Interfaces:** ninguna.

- [ ] **Step 1: Typecheck en modo build**

Run: `npx tsc -b --noEmit`
Expected: sin salida. Bare `tsc --noEmit` no sirve: el tsconfig raíz tiene `"files": []` y pasa vacuamente.

- [ ] **Step 2: Suite completa**

Run: `npm run test`
Expected: PASS. Los archivos que tocan `AnchorRole` como unión cerrada deben compilar con el miembro nuevo.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: cero errores y cero warnings.

- [ ] **Step 4: Auditar los no objetivos en el diff**

Run: `git diff main...HEAD --stat`

Comprobar que el diff **no** toca: `src/types/types.ts`, `src/store/projectSchema.ts`, `src/utils/dxf/`, `src/utils/notchAnchor.ts`, `src/utils/outlineAnalysis.ts`, `src/components/PatternEditor/useEditCurve.ts`. Si alguno aparece, se salió del alcance de la spec y hay que revertir esa parte.

- [ ] **Step 5: Commit de cierre si quedó algo pendiente**

Si los pasos anteriores no exigieron cambios, no hay commit. Si sí, commitear con el prefijo que corresponda y volver a correr el gate entero.

---

## Verificación manual sugerida (no bloqueante)

Con `npm run dev`, importar `tests/fixtures/garments/maria_patrones_samuel_2M.dxf`, activar `Editar patrón` con `Q` y sobre una esquina:

1. Arrastrarla: debe moverse entera al primer intento, sin dejar punto atrás ni abrir púa.
2. Ctrl+Z: el contorno vuelve. (Si los glifos quedan flotando, eso es el bug de resync de `useEditCurve`, que es otro PR — solo ocurre entrando con doble clic desde `Seleccionar`.)
3. Seleccionarla y pulsar `Delete`: la esquina desaparece de verdad.
4. Mirar el escote: los cuadrados deben verse limpios, sin círculo estampado, y los puntos de curva más discretos.
