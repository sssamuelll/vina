# Cierre de confianza de «Editar patrón» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que «Editar patrón» sea inmediatamente accesible, que sus anclas comuniquen su función geométrica y que cada arrastre sea un único gesto reversible, incluido el DXF real de María.

**Architecture:** El dock y el registro de shortcuts continúan siendo las únicas autoridades de acceso. Un clasificador puro deriva roles visuales desde `PatternPiece.outline` sin persistirlos, y un renderer SVG compartido los proyecta en los dos overlays existentes. El middleware de undo incorpora batches explícitos dirty y `useEditPattern` abre/cierra uno alrededor de cada drag real.

**Tech Stack:** React 18, TypeScript 5.6, Redux Toolkit, SVG, Vitest 4 + Testing Library, Playwright 1.58.

## Global Constraints

- `select` continúa siendo la herramienta activa inicial; `editPattern` queda segunda en el dock, no reemplaza a `select`.
- El orden nuevo exacto es `select`, `editPattern`, `pen`, `line`, `rectangle`, `scissors`, `measure`, `seam`.
- Solo se migra un `tools2d` que coincida exactamente y en el mismo orden con los siete defaults históricos.
- `openclo-docks` conserva `STORAGE_VERSION = 1`; no cambia la forma persistida `DockState`.
- `Q` es `tool.editPattern` en contexto `2d`; `tool3d.camera` conserva `Q` en contexto `3d`; el contexto combinado prioriza 2D por orden de registro.
- `AnchorRole` es exclusivamente view-only: no se agrega a `PatternPiece`, `PathCommand` ni a persistencia.
- `detectCorners` conserva `CORNER_ANGLE_THRESHOLD_DEG = 30`; el match ancla↔esquina usa `ANCHOR_MATCH_EPS_MM = 0.05`.
- Prioridad de rol exacta: `openEndpoint > corner > bezierAnchor > smoothSample`.
- Tamaños de pantalla exactos: endpoint diamante 10 px, corner cuadrado 10 px, Bézier anillo 9 px y muestra suave círculo 6 px.
- El radio de hit sigue siendo `HIT_RADIUS_PX = 8`; el renderer no participa en hit-testing.
- No se convierten, simplifican ni refittean las polilíneas DXF.
- `useEditPattern` y `useEditCurve` continúan siendo superficies distintas.
- Un click sin movimiento no crea historial; un drag de más de 500 ms crea una sola entrada.
- Verificación final obligatoria: `npx tsc -b --noEmit`, `npm run test`, `npm run lint` y el spec Playwright focal.

---

## File map

### Acceso

- `src/store/dockSlice.ts`: defaults históricos/nuevos y migración pura al cargar.
- `src/components/shell/dock2dTools.ts`: orden visible del catálogo.
- `src/shortcuts/defaults.ts`: definición contextual de `Q`.
- `src/hooks/useKeyboardShortcuts.ts`: activación por el single writer existente.
- `src/types/types.ts`: comentario correcto de `Tool2D.editPattern`.

### Semántica visual

- `src/components/PatternEditor/anchorRoles.ts`: clasificación pura y tolerancia de match.
- `src/components/PatternEditor/renderers/AnchorGlyph.tsx`: única gramática SVG de anclas.
- `src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx`: consumidor multi-select.
- `src/components/PatternEditor/renderers/overlays/NodeEditorOverlay.tsx`: consumidor de edición puntual y handles.

### Undo por gesto

- `src/store/undoMiddleware.ts`: API explícita, dirty flag y cierre seguro del batch.
- `src/components/PatternEditor/useEditPattern.ts`: ciclo de vida del batch durante drag.

### Pruebas

- `src/store/__tests__/dockSlice.test.ts`
- `src/components/shell/__tests__/dock2dTools.test.ts`
- `src/shortcuts/__tests__/editPatternReachability.test.tsx`
- `src/components/PatternEditor/__tests__/anchorRoles.test.ts`
- `src/components/PatternEditor/__tests__/anchorRoles.maria.test.ts`
- `src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx`
- `src/components/PatternEditor/renderers/__tests__/EditPatternOverlay.test.tsx`
- `src/components/PatternEditor/renderers/__tests__/AnchorOverlayParity.test.tsx`
- `src/__tests__/store.test.ts`
- `src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx`
- `tests/e2e/edit-pattern-trust.spec.ts`

---

### Task 1: Default del dock y migración conservadora

**Files:**
- Modify: `src/store/dockSlice.ts:13-65,109-113`
- Modify: `src/components/shell/dock2dTools.ts:16-33`
- Modify: `src/store/__tests__/dockSlice.test.ts:1-135`
- Modify: `src/components/shell/__tests__/dock2dTools.test.ts:1-47`

**Interfaces:**
- Consumes: envelope persistido `DockState v1` con `tools2d: string[]`.
- Produces: `LEGACY_DEFAULT_DOCK_2D_IDS`, `DEFAULT_DOCK_2D_IDS` y `migrateDefaultDockTools(ids: readonly string[]): string[]`.

- [ ] **Step 1: Escribir las regresiones rojas de default y migración**

En `dockSlice.test.ts`, amplía el import y reemplaza el test del default de siete ids; agrega estos casos dentro de `describe('dockSlice tools2d', ...)`:

```ts
import dockReducer, {
  pinAuto, unpinAuto, persistDocks, loadDocks, toggleDockSignaling,
  rehydrateDocks, addDockTool, removeDockTool, resetDockTools,
  reorderDockTool, LEGACY_DEFAULT_DOCK_2D_IDS, DEFAULT_DOCK_2D_IDS,
  migrateDefaultDockTools,
} from '../dockSlice';

it('defaults tools2d to the 8 ids with editPattern immediately after select', () => {
  expect(initial().tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
  expect(DEFAULT_DOCK_2D_IDS).toEqual([
    'select', 'editPattern', 'pen', 'line',
    'rectangle', 'scissors', 'measure', 'seam',
  ]);
});

it('migrates only the exact ordered historical default', () => {
  expect(migrateDefaultDockTools(LEGACY_DEFAULT_DOCK_2D_IDS)).toEqual(DEFAULT_DOCK_2D_IDS);
  expect(migrateDefaultDockTools([...LEGACY_DEFAULT_DOCK_2D_IDS].reverse()))
    .toEqual([...LEGACY_DEFAULT_DOCK_2D_IDS].reverse());
  expect(migrateDefaultDockTools(['select', 'pen', 'notch']))
    .toEqual(['select', 'pen', 'notch']);
});

it('does not duplicate editPattern in an already-current or customized dock', () => {
  expect(migrateDefaultDockTools(DEFAULT_DOCK_2D_IDS))
    .toEqual(DEFAULT_DOCK_2D_IDS);
  expect(migrateDefaultDockTools(DEFAULT_DOCK_2D_IDS)
    .filter((id) => id === 'editPattern')).toHaveLength(1);
});

it('loadDocks migrates a persisted historical default and round-trips it as v1', () => {
  localStorage.setItem('openclo-docks', JSON.stringify({
    version: 1,
    data: {
      pinnedExtra: { left: [], right: [] },
      signaling: 'subtle',
      tools2d: [...LEGACY_DEFAULT_DOCK_2D_IDS],
    },
  }));
  const loaded = loadDocks();
  expect(loaded?.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
  persistDocks(loaded!);
  expect(loadDocks()?.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
});
```

En `dock2dTools.test.ts`, sustituye la última expectativa:

```ts
it('the first 8 catalog ids are the defaults in order', () => {
  expect(DOCK_2D_CATALOG.slice(0, 8).map((tool) => tool.id))
    .toEqual(DEFAULT_DOCK_2D_IDS);
});
```

- [ ] **Step 2: Ejecutar las pruebas para confirmar el rojo**

Run:

```bash
npm run test -- src/store/__tests__/dockSlice.test.ts src/components/shell/__tests__/dock2dTools.test.ts
```

Expected: FAIL porque no existen `LEGACY_DEFAULT_DOCK_2D_IDS`/`migrateDefaultDockTools`, el default aún tiene siete ids y el catálogo coloca `editPattern` octavo.

- [ ] **Step 3: Implementar las constantes y la migración pura**

En `dockSlice.ts`, reemplaza la constante actual y aplica la migración al resultado validado:

```ts
/** Historical seven-tool default. Kept only for exact migration matching. */
export const LEGACY_DEFAULT_DOCK_2D_IDS = [
  'select', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam',
] as const;

/** Current default left-dock 2D tool ids, in render order. */
export const DEFAULT_DOCK_2D_IDS = [
  'select', 'editPattern', 'pen', 'line',
  'rectangle', 'scissors', 'measure', 'seam',
] as const;

export function migrateDefaultDockTools(ids: readonly string[]): string[] {
  const isHistoricalDefault =
    ids.length === LEGACY_DEFAULT_DOCK_2D_IDS.length &&
    ids.every((id, index) => id === LEGACY_DEFAULT_DOCK_2D_IDS[index]);
  return isHistoricalDefault ? [...DEFAULT_DOCK_2D_IDS] : [...ids];
}
```

Al final de `loadDocks`, reemplaza el return actual:

```ts
const data = result.data.data;
return { ...data, tools2d: migrateDefaultDockTools(data.tools2d) };
```

Las expresiones existentes con spread siguen siendo válidas:

```ts
const tools2dSchema = z.array(idString).max(MAX_PINNED).default([...DEFAULT_DOCK_2D_IDS]);
const initialState: DockState = {
  pinnedExtra: { left: [], right: [] },
  signaling: 'subtle',
  tools2d: [...DEFAULT_DOCK_2D_IDS],
};
```

En `dock2dTools.ts`, actualiza el comentario a “first 8” y mueve esta entrada justo después de `select`:

```ts
{ id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'Z' },
{ id: 'editPattern', icon: PenLine, label: 'Editar patrón', shortcut: 'Q' },
{ id: 'pen', icon: PenTool, label: 'Pluma', shortcut: 'H' },
```

Elimina la antigua entrada `editPattern` situada después de `seam`.

- [ ] **Step 4: Ejecutar las pruebas verdes del dock**

Run:

```bash
npm run test -- src/store/__tests__/dockSlice.test.ts src/components/shell/__tests__/dock2dTools.test.ts
```

Expected: PASS en ambos archivos; `git diff --check` no reporta errores.

- [ ] **Step 5: Commit del acceso visible**

```bash
git add src/store/dockSlice.ts src/components/shell/dock2dTools.ts src/store/__tests__/dockSlice.test.ts src/components/shell/__tests__/dock2dTools.test.ts
git commit -m "feat(editor): surface edit pattern in default dock"
```

---

### Task 2: Shortcut contextual `Q`

**Files:**
- Create: `src/shortcuts/__tests__/editPatternReachability.test.tsx`
- Modify: `src/shortcuts/defaults.ts:35-42`
- Modify: `src/hooks/useKeyboardShortcuts.ts:185-193`
- Modify: `src/types/types.ts:713-720`

**Interfaces:**
- Consumes: `activate2DTool(dispatch, id)` y resolución ordenada de `ShortcutRegistry`.
- Produces: action id `tool.editPattern` con `key: 'q'`, `context: '2d'` y handler único.

- [ ] **Step 1: Crear la prueba roja de definición, precedencia y activación**

Crea `editPatternReachability.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { DEFAULT_SHORTCUTS } from '../defaults';
import { ShortcutRegistry } from '../ShortcutRegistry';
import { ShortcutProvider } from '../ShortcutProvider';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import editorReducer from '../../store/editorSlice';
import projectReducer from '../../store/projectSlice';
import simulationReducer from '../../store/simulationSlice';
import toolReducer from '../../store/toolSlice';

afterEach(cleanup);

function makeStore() {
  return configureStore({
    reducer: {
      editor: editorReducer,
      project: projectReducer,
      simulation: simulationReducer,
      tools: toolReducer,
    },
  });
}

function Hooked() {
  useKeyboardShortcuts();
  return <div data-shortcut-context="2d" tabIndex={0} data-testid="pattern-focus" />;
}

describe('tool.editPattern shortcut contract', () => {
  it('is plain q in 2d context', () => {
    const def = DEFAULT_SHORTCUTS.find((item) => item.id === 'tool.editPattern');
    expect(def).toMatchObject({ key: 'q', context: '2d', label: 'Editar patrón' });
    expect(def?.ctrl ?? false).toBe(false);
    expect(def?.shift ?? false).toBe(false);
  });

  it('keeps q contextual and gives combined context to the earlier 2d definition', () => {
    const registry = new ShortcutRegistry(DEFAULT_SHORTCUTS);
    const event = new KeyboardEvent('keydown', { key: 'q' });
    expect(registry.matchEvent(event, ['global', '2d'])).toBe('tool.editPattern');
    expect(registry.matchEvent(event, ['global', '3d'])).toBe('tool3d.camera');
    expect(registry.matchEvent(event, ['global', '2d', '3d'])).toBe('tool.editPattern');
  });

  it('pressing q with 2d focus activates both 2d tool authorities', () => {
    const store = makeStore();
    const view = render(
      <Provider store={store}>
        <ShortcutProvider><Hooked /></ShortcutProvider>
      </Provider>,
    );
    const focusTarget = view.getByTestId('pattern-focus');
    focusTarget.focus();
    act(() => {
      focusTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
    });
    expect(store.getState().editor.activeTool).toBe('editPattern');
    expect(store.getState().tools.activeTool2D).toBe('editPattern');
  });
});
```

- [ ] **Step 2: Ejecutar la prueba para confirmar el rojo**

Run:

```bash
npm run test -- src/shortcuts/__tests__/editPatternReachability.test.tsx
```

Expected: FAIL porque `tool.editPattern` no está registrado y `Q` combinado resuelve actualmente a `tool3d.camera`.

- [ ] **Step 3: Registrar definición y handler por la autoridad existente**

En `src/shortcuts/defaults.ts`, inserta la definición inmediatamente después de `tool.select`:

```ts
{ id: 'tool.select', key: 'z', label: 'Edit Pattern (Select)', category: '2D Tools', context: '2d' },
{ id: 'tool.editPattern', key: 'q', label: 'Editar patrón', category: '2D Tools', context: '2d' },
{ id: 'tool.editCurve', key: 'v', label: 'Edit Curve Point', category: '2D Tools', context: '2d' },
```

En `useKeyboardShortcuts.ts`, inserta el handler junto a `tool.select`:

```ts
['tool.select', () => activate2DTool(dispatch, 'select')],
['tool.editPattern', () => activate2DTool(dispatch, 'editPattern')],
['tool.editCurve', () => activate2DTool(dispatch, 'editCurve')],
```

En `src/types/types.ts`, corrige el comentario:

```ts
| 'editPattern'  // edit points and segments (Q key)
```

- [ ] **Step 4: Ejecutar la prueba verde y las regresiones de shortcuts**

Run:

```bash
npm run test -- src/shortcuts/__tests__/editPatternReachability.test.tsx src/shortcuts/__tests__/seamAllowanceReachability.test.tsx src/store/__tests__/toolActivation.test.ts
```

Expected: PASS; `Q` 2D activa `editor.activeTool` y `tools.activeTool2D`, y los precedentes contextuales siguen verdes.

- [ ] **Step 5: Commit del shortcut**

```bash
git add src/shortcuts/defaults.ts src/hooks/useKeyboardShortcuts.ts src/types/types.ts src/shortcuts/__tests__/editPatternReachability.test.tsx
git commit -m "feat(editor): wire edit pattern q shortcut"
```

---

### Task 3: Clasificador geométrico view-only

**Files:**
- Create: `src/components/PatternEditor/anchorRoles.ts`
- Create: `src/components/PatternEditor/__tests__/anchorRoles.test.ts`
- Create: `src/components/PatternEditor/__tests__/anchorRoles.maria.test.ts`

**Interfaces:**
- Consumes: `PatternPiece`, `EditableNode[]`, `detectCorners(outline)`.
- Produces: `AnchorRole`, `ClassifiedAnchor`, `ANCHOR_MATCH_EPS_MM` y `classifyEditableAnchors(piece, nodes)`.

- [ ] **Step 1: Crear los tests rojos sintéticos**

Crea `anchorRoles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { extractNodes } from '../nodeEditorUtils';
import { classifyEditableAnchors } from '../anchorRoles';

function piece(outline: PatternPiece['outline']): PatternPiece {
  return {
    id: 'p', name: 'P', outline, internals: [], position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 0, active: true,
  } as PatternPiece;
}

function roles(outline: PatternPiece['outline']) {
  const value = piece(outline);
  return classifyEditableAnchors(value, extractNodes(value));
}

describe('classifyEditableAnchors', () => {
  it('marks the four vertices of a closed square as corners', () => {
    const result = roles([
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ]);
    expect(result.map((item) => item.role)).toEqual([
      'corner', 'corner', 'corner', 'corner',
    ]);
  });

  it('does not invent corners in a dense smooth circle', () => {
    const points = Array.from({ length: 36 }, (_, index) => {
      const angle = index * Math.PI * 2 / 36;
      return [Math.cos(angle) * 100, Math.sin(angle) * 100];
    });
    const outline: PatternPiece['outline'] = [
      { type: 'M', values: points[0] },
      ...points.slice(1).map((values) => ({ type: 'L' as const, values })),
      { type: 'Z', values: [] },
    ];
    expect(roles(outline).every((item) => item.role === 'smoothSample')).toBe(true);
  });

  it('gives open endpoints priority over an angular turn', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
    ]);
    expect(result[0].role).toBe('openEndpoint');
    expect(result.at(-1)?.role).toBe('openEndpoint');
  });

  it('marks anchors in a smooth closed cubic loop as bezier anchors', () => {
    const result = roles([
      { type: 'M', values: [0, 50] },
      { type: 'C', values: [0, 22, 22, 0, 50, 0] },
      { type: 'C', values: [78, 0, 100, 22, 100, 50] },
      { type: 'C', values: [100, 78, 78, 100, 50, 100] },
      { type: 'C', values: [22, 100, 0, 78, 0, 50] },
      { type: 'Z', values: [] },
    ]);
    expect(result.every((item) => item.role === 'bezierAnchor')).toBe(true);
  });

  it('gives a C-to-L angular union the corner role', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [30, 0, 70, 0, 100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ]);
    expect(result.find((item) => item.node.ref.commandIndex === 1)?.role).toBe('corner');
  });

  it('assigns one corner role when consecutive commands share a coordinate', () => {
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
    expect(coincident.filter((item) => item.role === 'corner')).toHaveLength(1);
  });

  it('preserves node order and commandIndex', () => {
    const value = piece([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
    ]);
    const nodes = extractNodes(value);
    const result = classifyEditableAnchors(value, nodes);
    expect(result.map((item) => item.node.ref.commandIndex))
      .toEqual(nodes.map((node) => node.ref.commandIndex));
  });
});
```

- [ ] **Step 2: Crear el contrato rojo contra el DXF real**

Crea `anchorRoles.maria.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDXFContent } from '../../../utils/dxf';
import { extractNodes } from '../nodeEditorUtils';
import { classifyEditableAnchors } from '../anchorRoles';

const FIXTURE = resolve(
  __dirname,
  '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf',
);

describe('anchor roles — patrón real de María', () => {
  it('separates macro-corners from smooth samples without changing the outline', () => {
    const pieces = importDXFContent(readFileSync(FIXTURE, 'utf8'), {
      unit: 'auto', autoDetect: true,
    }).pieces;
    const piece = pieces.find((item) => item.outline.length > 100)!;
    const before = JSON.stringify(piece.outline);
    const result = classifyEditableAnchors(piece, extractNodes(piece));

    expect(piece.outline.some((cmd) => cmd.type === 'C' || cmd.type === 'Q')).toBe(false);
    expect(result.some((item) => item.role === 'corner')).toBe(true);
    expect(result.some((item) => item.role === 'smoothSample')).toBe(true);
    expect(result.some((item) => item.role === 'bezierAnchor')).toBe(false);
    expect(JSON.stringify(piece.outline)).toBe(before);
  });
});
```

- [ ] **Step 3: Ejecutar ambos archivos para confirmar el rojo**

Run:

```bash
npm run test -- src/components/PatternEditor/__tests__/anchorRoles.test.ts src/components/PatternEditor/__tests__/anchorRoles.maria.test.ts
```

Expected: FAIL porque `anchorRoles.ts` todavía no existe.

- [ ] **Step 4: Implementar el clasificador puro completo**

Crea `anchorRoles.ts`:

```ts
import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { detectCorners } from '../../utils/notchAnchor';
import type { EditableNode } from './nodeEditorUtils';

export const ANCHOR_MATCH_EPS_MM = 0.05;

export type AnchorRole =
  | 'openEndpoint'
  | 'corner'
  | 'bezierAnchor'
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

function matchCornerCommandIndices(
  corners: Point2D[],
  nodes: EditableNode[],
): Set<number> {
  const available = new Set(nodes.map((node) => node.ref.commandIndex));
  const matched = new Set<number>();

  for (const corner of corners) {
    let best: EditableNode | undefined;
    let bestDistance = Infinity;
    for (const node of nodes) {
      if (!available.has(node.ref.commandIndex)) continue;
      const candidateDistance = distance(corner, node.position);
      if (
        candidateDistance <= ANCHOR_MATCH_EPS_MM &&
        (candidateDistance < bestDistance ||
          (candidateDistance === bestDistance &&
            node.ref.commandIndex < (best?.ref.commandIndex ?? Infinity)))
      ) {
        best = node;
        bestDistance = candidateDistance;
      }
    }
    if (best) {
      matched.add(best.ref.commandIndex);
      available.delete(best.ref.commandIndex);
    }
  }
  return matched;
}

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

  const corners = matchCornerCommandIndices(detectCorners(piece.outline), nodes);

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
    }
    return { node, role };
  });
}
```

- [ ] **Step 5: Ejecutar tests del clasificador y detectores base**

Run:

```bash
npm run test -- src/components/PatternEditor/__tests__/anchorRoles.test.ts src/components/PatternEditor/__tests__/anchorRoles.maria.test.ts src/utils/__tests__/notchAnchor.test.ts src/utils/__tests__/mariaShirt.m0.test.ts
```

Expected: PASS; el fixture conserva cinco piezas y ninguna conversión a `C/Q`.

- [ ] **Step 6: Commit del modelo visual derivado**

```bash
git add src/components/PatternEditor/anchorRoles.ts src/components/PatternEditor/__tests__/anchorRoles.test.ts src/components/PatternEditor/__tests__/anchorRoles.maria.test.ts
git commit -m "feat(editor): classify pattern anchors by geometry"
```

---

### Task 4: Renderer SVG compartido y paridad entre overlays

**Files:**
- Create: `src/components/PatternEditor/renderers/AnchorGlyph.tsx`
- Create: `src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx`
- Create: `src/components/PatternEditor/renderers/__tests__/AnchorOverlayParity.test.tsx`
- Modify: `src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx:1-155`
- Modify: `src/components/PatternEditor/renderers/overlays/NodeEditorOverlay.tsx:1-89`
- Modify: `src/components/PatternEditor/renderers/__tests__/EditPatternOverlay.test.tsx:1-105`

**Interfaces:**
- Consumes: `AnchorRole`, `classifyEditableAnchors`, `EditableNode`, `Point2D`.
- Produces: `AnchorGlyphProps`, `AnchorVisualState` y `<AnchorGlyph>` con `data-anchor-role`.

- [ ] **Step 1: Crear los tests rojos del glifo**

Crea `AnchorGlyph.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AnchorGlyph from '../AnchorGlyph';

afterEach(cleanup);

function draw(role: Parameters<typeof AnchorGlyph>[0]['role'], state = 'idle' as const) {
  return render(
    <svg>
      <AnchorGlyph
        role={role}
        position={{ x: 20, y: 30 }}
        zoom2D={2}
        state={state}
      />
    </svg>,
  );
}

describe('AnchorGlyph', () => {
  it('uses one root with role metadata and a position transform', () => {
    const { container } = draw('corner');
    const root = container.querySelector('[data-anchor-role="corner"]')!;
    expect(root.getAttribute('transform')).toBe('translate(20 30)');
  });

  it('renders exact screen-space sizes through zoom compensation', () => {
    const corner = draw('corner').container.querySelector('rect')!;
    expect(Number(corner.getAttribute('width'))).toBe(5);
    cleanup();
    const smooth = draw('smoothSample').container.querySelector('circle')!;
    expect(Number(smooth.getAttribute('r'))).toBe(1.5);
    cleanup();
    const bezier = draw('bezierAnchor').container.querySelectorAll('circle');
    expect(bezier).toHaveLength(2);
    expect(Number(bezier[0].getAttribute('r'))).toBe(2.25);
  });

  it('keeps role shape while selected and hovered state change color', () => {
    const selected = draw('corner', 'selected');
    expect(selected.container.querySelector('[data-anchor-role="corner"]')).toBeTruthy();
    expect(selected.container.querySelector('rect')?.getAttribute('fill')).toBe('#FFD700');
    cleanup();
    const hovered = draw('corner', 'hovered');
    expect(hovered.container.querySelector('rect')?.getAttribute('fill')).toBe('#6BB3FF');
  });

  it('uses diamond, square, ring and small circle as distinct glyphs', () => {
    expect(draw('openEndpoint').container.querySelector('polygon')).toBeTruthy();
    cleanup();
    expect(draw('corner').container.querySelector('rect')).toBeTruthy();
    cleanup();
    expect(draw('bezierAnchor').container.querySelectorAll('circle')).toHaveLength(2);
    cleanup();
    expect(draw('smoothSample').container.querySelectorAll('circle')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Crear la regresión roja de paridad entre overlays**

Crea `AnchorOverlayParity.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../../types/types';
import { extractNodes } from '../../nodeEditorUtils';
import EditPatternOverlay from '../overlays/EditPatternOverlay';
import NodeEditorOverlay from '../overlays/NodeEditorOverlay';

afterEach(cleanup);

const piece = {
  id: 'p', name: 'P', position: { x: 10, y: 20 }, rotation: 30,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [50, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [], mirrored: false, seamAllowance: 0, active: true,
} as PatternPiece;

function roleList(root: Element): string[] {
  return Array.from(root.querySelectorAll('[data-anchor-role]'))
    .map((node) => node.getAttribute('data-anchor-role')!);
}

describe('anchor overlay parity', () => {
  it('renders the same role sequence for the same piece and nodes', () => {
    const nodes = extractNodes(piece);
    const view = render(
      <svg>
        <g data-testid="edit-overlay">
          <EditPatternOverlay
            zoom2D={1} pieces={[piece]} editingPieceId="p" nodes={nodes}
            selectedNodes={new Set()} selectedSegments={new Set()}
            hoveredNode={null} hoveredSegment={null}
            addPointPreview={null} marquee={null}
          />
        </g>
        <g data-testid="node-overlay">
          <NodeEditorOverlay
            zoom2D={1} units="mm" pieces={[piece]}
            nodeEditorEditingPieceId="p" nodeEditorNodes={nodes}
            selectedNode={null} hoveredNode={null}
          />
        </g>
      </svg>,
    );
    expect(roleList(view.getByTestId('edit-overlay')))
      .toEqual(roleList(view.getByTestId('node-overlay')));
    expect(roleList(view.getByTestId('edit-overlay'))).toContain('corner');
    expect(roleList(view.getByTestId('edit-overlay'))).toContain('smoothSample');
  });

  it('rotates the node editor anchor group with the piece', () => {
    const nodes = extractNodes(piece);
    const { container } = render(
      <svg>
        <NodeEditorOverlay
          zoom2D={1} units="mm" pieces={[piece]}
          nodeEditorEditingPieceId="p" nodeEditorNodes={nodes}
          selectedNode={null} hoveredNode={null}
        />
      </svg>,
    );
    expect(container.querySelector('.node-editor')?.getAttribute('transform'))
      .toContain('rotate(30');
  });

  it('keeps a Bezier control handle red and outside the anchor-role grammar', () => {
    const curved = {
      ...piece,
      rotation: 0,
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'C', values: [30, 0, 70, 100, 100, 100] },
        { type: 'Z', values: [] },
      ],
    } as PatternPiece;
    const nodes = extractNodes(curved);
    const { container } = render(
      <svg>
        <NodeEditorOverlay
          zoom2D={1} units="mm" pieces={[curved]}
          nodeEditorEditingPieceId="p" nodeEditorNodes={nodes}
          selectedNode={null} hoveredNode={null}
        />
      </svg>,
    );
    const handle = container.querySelector('.node-editor__control-handle')!;
    expect(handle.getAttribute('stroke')).toBe('#ff6b6b');
    expect(handle.closest('[data-anchor-role]')).toBeNull();
    expect(container.querySelectorAll('[data-anchor-role]')).toHaveLength(nodes.length);
  });
});
```

- [ ] **Step 3: Ejecutar las pruebas nuevas para confirmar el rojo**

Run:

```bash
npm run test -- src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx src/components/PatternEditor/renderers/__tests__/AnchorOverlayParity.test.tsx
```

Expected: FAIL porque `AnchorGlyph.tsx` no existe y los overlays aún usan gramáticas distintas.

- [ ] **Step 4: Implementar el renderer compartido**

Crea `AnchorGlyph.tsx`:

```tsx
import type { Point2D } from '../../../types/types';
import type { AnchorRole } from '../anchorRoles';

export type AnchorVisualState = 'idle' | 'hovered' | 'selected';

export interface AnchorGlyphProps {
  role: AnchorRole;
  position: Point2D;
  zoom2D: number;
  state: AnchorVisualState;
  className?: string;
}

const STATE_COLOR: Record<AnchorVisualState, string> = {
  idle: '#4A9EFF',
  hovered: '#6BB3FF',
  selected: '#FFD700',
};

export default function AnchorGlyph({
  role, position, zoom2D, state, className,
}: AnchorGlyphProps) {
  const color = STATE_COLOR[state];
  const strokeWidth = 1.2 / zoom2D;
  const halfLarge = 5 / zoom2D;

  return (
    <g
      transform={`translate(${position.x} ${position.y})`}
      data-anchor-role={role}
      className={className}
      style={{ cursor: 'move' }}
    >
      {role === 'openEndpoint' && (
        <polygon
          points={`0,${-halfLarge} ${halfLarge},0 0,${halfLarge} ${-halfLarge},0`}
          fill={color} stroke="#fff" strokeWidth={strokeWidth}
        />
      )}
      {role === 'corner' && (
        <rect
          x={-halfLarge} y={-halfLarge}
          width={halfLarge * 2} height={halfLarge * 2}
          fill={color} stroke="#fff" strokeWidth={strokeWidth}
        />
      )}
      {role === 'bezierAnchor' && (
        <>
          <circle
            r={4.5 / zoom2D} fill="none" stroke="#fff"
            strokeWidth={3 / zoom2D}
          />
          <circle
            r={4.5 / zoom2D} fill="none" stroke={color}
            strokeWidth={1.5 / zoom2D}
          />
        </>
      )}
      {role === 'smoothSample' && (
        <circle
          r={3 / zoom2D} fill={color} stroke="#fff"
          strokeWidth={strokeWidth}
        />
      )}
    </g>
  );
}
```

- [ ] **Step 5: Sustituir la gramática local de `EditPatternOverlay`**

Agrega imports:

```tsx
import type { EditableNode } from '../../nodeEditorUtils';
import { classifyEditableAnchors } from '../../anchorRoles';
import AnchorGlyph, { type AnchorVisualState } from '../AnchorGlyph';
```

Cambia `nodes` en props a `EditableNode[]`, elimina `r`/`sw` y, después de resolver `piece`, deriva:

```tsx
const classifiedAnchors = classifyEditableAnchors(piece, nodes);
```

Reemplaza por completo el bloque local de anchor points:

```tsx
{classifiedAnchors.map(({ node, role }) => {
  const commandIndex = node.ref.commandIndex;
  const state: AnchorVisualState = selectedNodes.has(commandIndex)
    ? 'selected'
    : hoveredNode === commandIndex
      ? 'hovered'
      : 'idle';
  return (
    <g key={commandIndex} data-command-index={commandIndex}>
      <AnchorGlyph
        role={role}
        position={node.position}
        zoom2D={zoom2D}
        state={state}
      />
    </g>
  );
})}
```

- [ ] **Step 6: Sustituir las anclas de `NodeEditorOverlay` sin tocar handles**

Importa `outlineBBoxCenter`, el clasificador y el glifo:

```tsx
import { outlineBBoxCenter } from '../../../../utils/geometry/transform';
import { classifyEditableAnchors } from '../../anchorRoles';
import AnchorGlyph, { type AnchorVisualState } from '../AnchorGlyph';
```

Después de encontrar `piece`, agrega:

```tsx
const classifiedAnchors = classifyEditableAnchors(piece, nodeEditorNodes);
const rotation = piece.rotation ?? 0;
const center = outlineBBoxCenter(piece.outline);
const anchorTransform = rotation
  ? `translate(${piece.position.x}, ${piece.position.y}) rotate(${rotation}, ${center.x}, ${center.y})`
  : `translate(${piece.position.x}, ${piece.position.y})`;
```

Cambia el transform del grupo principal a `anchorTransform`. Conserva el brazo y el rect rojo actuales, añadiendo solo `className="node-editor__control-handle"` al rect del handle. Sustituye el `<circle>` de cada ancla con:

```tsx
{classifiedAnchors.map(({ node, role }) => {
  const state: AnchorVisualState = isNodeSelected(node.ref)
    ? 'selected'
    : isNodeHovered(node.ref)
      ? 'hovered'
      : 'idle';
  return (
    <g key={node.ref.commandIndex} data-command-index={node.ref.commandIndex}>
      {node.cp1 && (
        <>
          <line
            x1={node.position.x} y1={node.position.y}
            x2={node.cp1.x} y2={node.cp1.y}
            stroke="rgba(255, 107, 107, 0.5)"
            strokeWidth={0.8 / zoom2D}
          />
          <rect
            className="node-editor__control-handle"
            x={node.cp1.x - 3.5 / zoom2D}
            y={node.cp1.y - 3.5 / zoom2D}
            width={7 / zoom2D} height={7 / zoom2D}
            fill={isNodeSelected({ ...node.ref, pointType: 'cp2' }) ? '#ff6b6b' : '#fff'}
            stroke="#ff6b6b" strokeWidth={1 / zoom2D}
            style={{ cursor: 'move' }} rx={1 / zoom2D}
          />
        </>
      )}
      <AnchorGlyph
        role={role}
        position={node.position}
        zoom2D={zoom2D}
        state={state}
      />
    </g>
  );
})}
```

Elimina el `nodeEditorNodes.map` anterior para no renderizar anclas o handles duplicados. La etiqueta de coordenadas permanece fuera del grupo y sin cambios.

- [ ] **Step 7: Actualizar la regresión antigua de círculos/cuadrados**

En `EditPatternOverlay.test.tsx`, cambia el comentario del contrato y reemplaza el test de marks por una pieza con una recta subdividida:

```tsx
it('renders geometric corners differently from smooth polyline samples', () => {
  const densePiece = {
    ...piece,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
  } as PatternPiece;
  const { container } = render(
    <svg>
      <EditPatternOverlay
        zoom2D={1} pieces={[densePiece]} editingPieceId="p"
        nodes={extractNodes(densePiece)} selectedNodes={new Set()}
        selectedSegments={new Set()} hoveredNode={null}
        hoveredSegment={null} addPointPreview={null} marquee={null}
      />
    </svg>,
  );
  expect(container.querySelectorAll('[data-anchor-role="corner"]')).toHaveLength(4);
  expect(container.querySelectorAll('[data-anchor-role="smoothSample"]')).toHaveLength(1);
  expect(container.querySelector('[data-anchor-role="corner"] rect')).toBeTruthy();
  expect(container.querySelector('[data-anchor-role="smoothSample"] circle')).toBeTruthy();
});
```

- [ ] **Step 8: Ejecutar el paquete visual completo**

Run:

```bash
npm run test -- src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx src/components/PatternEditor/renderers/__tests__/AnchorOverlayParity.test.tsx src/components/PatternEditor/renderers/__tests__/EditPatternOverlay.test.tsx src/components/PatternEditor/__tests__/anchorRoles.test.ts
```

Expected: PASS; ambos overlays emiten la misma secuencia de roles y el test de rotación previo sigue verde.

- [ ] **Step 9: Commit de la gramática visual compartida**

```bash
git add src/components/PatternEditor/renderers/AnchorGlyph.tsx src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx src/components/PatternEditor/renderers/overlays/NodeEditorOverlay.tsx src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx src/components/PatternEditor/renderers/__tests__/AnchorOverlayParity.test.tsx src/components/PatternEditor/renderers/__tests__/EditPatternOverlay.test.tsx
git commit -m "feat(editor): share semantic anchor glyphs"
```

---

### Task 5: Batch explícito dirty en el middleware de undo

**Files:**
- Modify: `src/store/undoMiddleware.ts:40-113,212-340`
- Modify: `src/__tests__/store.test.ts:1-18,493-584`

**Interfaces:**
- Consumes: acciones de control `undo/startBatch`, `undo/endBatch` y acciones `project/*`.
- Produces: `beginUndoBatch(dispatch, label): void`, `endUndoBatch(dispatch): void`; `batchUndo` conserva su firma.

- [ ] **Step 1: Escribir regresiones rojas del contrato dirty**

En `store.test.ts`, amplía imports:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  undoMiddleware, canUndo, canRedo, batchUndo, beginUndoBatch,
  endUndoBatch, getHistory, getUndoLength,
} from '../store/undoMiddleware';

afterEach(() => vi.useRealTimers());
```

Agrega dentro de `describe('Undo batch grouping', ...)`:

```ts
it('an empty explicit batch creates no history entry', () => {
  const store = createStore();
  store.dispatch(loadProject({
    id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
    avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
  }));
  const before = getUndoLength();
  beginUndoBatch(store.dispatch, 'Empty gesture');
  endUndoBatch(store.dispatch);
  expect(getUndoLength()).toBe(before);
});

it('groups one gesture even when identical updates are more than 500ms apart', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  const store = createStore();
  store.dispatch(loadProject({
    id: 'test', name: 'Test', pieces: [makePiece('p')], seams: [], fabrics: [],
    avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
  }));
  const before = getUndoLength();
  beginUndoBatch(store.dispatch, 'Editar puntos del patrón');
  store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'A' }));
  vi.advanceTimersByTime(750);
  store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'B' }));
  endUndoBatch(store.dispatch);
  expect(getUndoLength()).toBe(before + 1);
  expect(getHistory().past.at(-1)?.label).toBe('Editar puntos del patrón');
});

it('finalizes an open dirty batch before the same editor/undo', () => {
  const store = createStore();
  store.dispatch(loadProject({
    id: 'test', name: 'Test', pieces: [makePiece('p')], seams: [], fabrics: [],
    avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
  }));
  beginUndoBatch(store.dispatch, 'Editar puntos del patrón');
  store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'Moved' }));
  store.dispatch({ type: 'editor/undo' });
  expect(store.getState().project.pieces[0].name).toBe('Test');
  expect(canRedo()).toBe(true);
  endUndoBatch(store.dispatch);
});

it('resets temporal coalescing when an explicit batch closes', () => {
  const store = createStore();
  store.dispatch(loadProject({
    id: 'test', name: 'Test', pieces: [makePiece('p')], seams: [], fabrics: [],
    avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
  }));
  beginUndoBatch(store.dispatch, 'Gesture');
  store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'Inside' }));
  endUndoBatch(store.dispatch);
  const afterBatch = getUndoLength();
  store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'After' }));
  expect(getUndoLength()).toBe(afterBatch + 1);
});

it('loadProject clears an in-flight explicit batch without leaking it', () => {
  const store = createStore();
  const project = {
    id: 'test', name: 'Test', pieces: [makePiece('p')], seams: [], fabrics: [],
    avatar: store.getState().project.avatar, createdAt: 0, updatedAt: 0,
  };
  store.dispatch(loadProject(project));
  beginUndoBatch(store.dispatch, 'Abandoned gesture');
  store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'Inside' }));
  store.dispatch(loadProject(project));
  endUndoBatch(store.dispatch);
  expect(canUndo()).toBe(false);

  beginUndoBatch(store.dispatch, 'Fresh gesture');
  store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'Fresh' }));
  endUndoBatch(store.dispatch);
  expect(getUndoLength()).toBe(1);
});
```

- [ ] **Step 2: Ejecutar el archivo para confirmar el rojo**

Run:

```bash
npm run test -- src/__tests__/store.test.ts
```

Expected: FAIL porque los helpers no existen; el batch vacío actual crea una entrada y undo no finaliza un batch abierto.

- [ ] **Step 3: Agregar estado dirty y helpers públicos**

En `UndoState` y `undoState` agrega:

```ts
/** Whether a project action occurred inside the outermost explicit batch. */
batchDirty: boolean;
```

```ts
batchDirty: false,
```

Antes de `batchUndo`, agrega:

```ts
type UndoDispatch = (action: { type: string; payload?: unknown }) => unknown;

export function beginUndoBatch(dispatch: UndoDispatch, label: string): void {
  dispatch({ type: 'undo/startBatch', payload: label });
}

export function endUndoBatch(dispatch: UndoDispatch): void {
  dispatch({ type: 'undo/endBatch' });
}
```

Reescribe `batchUndo` para reutilizarlos:

```ts
export function batchUndo(
  dispatch: UndoDispatch,
  label: string,
  fn: () => void,
): void {
  beginUndoBatch(dispatch, label);
  try {
    fn();
  } finally {
    endUndoBatch(dispatch);
  }
}
```

- [ ] **Step 4: Centralizar cierre y limpieza del batch exterior**

Después de `bumpRevision`, agrega:

```ts
function resetExplicitBatchState(): void {
  undoState.batchDepth = 0;
  undoState.batchSnapshot = null;
  undoState.batchLabel = null;
  undoState.batchDirty = false;
  undoState.batchingAction = null;
  undoState.lastSnapshotTime = 0;
}

function finalizeExplicitBatch(): void {
  const snapshot = undoState.batchSnapshot;
  const label = undoState.batchLabel || 'Batch Operation';
  const dirty = undoState.batchDirty;
  resetExplicitBatchState();
  if (!dirty || !snapshot) return;

  undoState.past.push(snapshot);
  undoState.pastEntries.push({
    label,
    actionType: 'batch',
    timestamp: Date.now(),
  });
  if (undoState.past.length > MAX_HISTORY) {
    undoState.past.shift();
    undoState.pastEntries.shift();
  }
  undoState.future.length = 0;
  undoState.futureEntries.length = 0;
  bumpRevision();
}
```

- [ ] **Step 5: Aplicar el cierre a undo, endBatch, acciones y reset de proyecto**

Al inicio de la rama `editor/undo`, antes de consultar `past.length`, agrega:

```ts
if (undoState.batchDepth > 0) {
  finalizeExplicitBatch();
}
```

Reemplaza las ramas de control por:

```ts
if (actionType === 'undo/startBatch') {
  if (undoState.batchDepth === 0) {
    const currentProject = (store.getState() as RootState).project;
    undoState.batchSnapshot = safeClone(currentProject);
    undoState.batchLabel = (action.payload as string) || 'Batch Operation';
    undoState.batchDirty = false;
  }
  undoState.batchDepth++;
  return;
}

if (actionType === 'undo/endBatch') {
  if (undoState.batchDepth === 0) return;
  undoState.batchDepth--;
  if (undoState.batchDepth === 0) finalizeExplicitBatch();
  return;
}
```

Dentro de la rama `if (undoState.batchDepth > 0)`, marca dirty antes de pasar la acción:

```ts
undoState.batchDirty = true;
undoState.future.length = 0;
undoState.futureEntries.length = 0;
undoState.lastSnapshotTime = now;
undoState.batchingAction = actionType;
bumpRevision();
return next(action);
```

En la rama `project/loadProject`/`global/newProject`, reemplaza el reset manual de tiempo/action por:

```ts
resetExplicitBatchState();
```

Conserva el vaciado existente de `past`, `future`, `pastEntries` y `futureEntries` antes de llamar al helper.

- [ ] **Step 6: Ejecutar las pruebas del middleware**

Run:

```bash
npm run test -- src/__tests__/store.test.ts src/store/__tests__/linkedEditingMiddleware.test.ts src/store/__tests__/resewAiSeams.test.ts
```

Expected: PASS; nested batches conservan una entrada, batch vacío cero y undo abierto restaura el snapshot pregesto.

- [ ] **Step 7: Commit del contrato transaccional**

```bash
git add src/store/undoMiddleware.ts src/__tests__/store.test.ts
git commit -m "fix(undo): make explicit gesture batches atomic"
```

---

### Task 6: Transacción de drag en `useEditPattern` e integración real

**Files:**
- Modify: `src/components/PatternEditor/useEditPattern.ts:11-29,167-288,419-547`
- Create: `src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx`

**Interfaces:**
- Consumes: `beginUndoBatch`, `endUndoBatch`, `classifyEditableAnchors`, `EditPatternOverlay`.
- Produces: un batch idempotente por drag real de nodo o segmento; no cambia la API pública del hook.

- [ ] **Step 1: Crear el harness de integración con middleware real**

Crea `useEditPattern.undo.test.tsx` con imports, fixture y helpers:

```tsx
// @vitest-environment jsdom
import React, { forwardRef, useImperativeHandle } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Provider, useSelector } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { loadProject, updatePiece } from '../../../store/projectSlice';
import { canRedo, getUndoLength, undoMiddleware } from '../../../store/undoMiddleware';
import type { PatternPiece, Point2D } from '../../../types/types';
import { importDXFContent } from '../../../utils/dxf';
import { classifyEditableAnchors } from '../anchorRoles';
import { extractNodes, getAnchor } from '../nodeEditorUtils';
import { pieceLocalToPattern, useEditPattern } from '../useEditPattern';
import EditPatternOverlay from '../renderers/overlays/EditPatternOverlay';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type EditorApi = ReturnType<typeof useEditPattern>;
type TestState = { project: ReturnType<typeof projectReducer> };

const Harness = forwardRef<EditorApi>(function Harness(_, ref) {
  const editor = useEditPattern(1, { x: 0, y: 0 });
  const pieces = useSelector((state: TestState) => state.project.pieces);
  useImperativeHandle(ref, () => editor, [editor]);
  return (
    <svg>
      {editor.isEditing && editor.editingPieceId && (
        <EditPatternOverlay
          zoom2D={1} pieces={pieces} editingPieceId={editor.editingPieceId}
          nodes={editor.nodes} selectedNodes={editor.selectedNodes}
          selectedSegments={editor.selectedSegments} hoveredNode={editor.hoveredNode}
          hoveredSegment={editor.hoveredSegment} addPointPreview={editor.addPointPreview}
          marquee={editor.marquee}
        />
      )}
    </svg>
  );
});

function squarePiece(): PatternPiece {
  return {
    id: 'p', name: 'Square',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 0, y: 0 }, rotation: 0,
    mirrored: false, seamAllowance: 0, active: true,
    createdAt: 0, updatedAt: 0,
  };
}

function setup(piece: PatternPiece) {
  const store = configureStore({
    reducer: { project: projectReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false })
      .concat(undoMiddleware),
  });
  const base = store.getState().project;
  store.dispatch(loadProject({
    ...base, id: 'test', name: 'Test', pieces: [piece], seams: [], fabrics: [],
    createdAt: 0, updatedAt: 0,
  }));
  const ref = React.createRef<EditorApi>();
  const view = render(<Provider store={store}><Harness ref={ref} /></Provider>);
  act(() => ref.current!.enterEdit(piece.id));
  return { store, ref, view };
}

function mouseAt(point: Point2D): React.MouseEvent<SVGSVGElement> {
  return {
    button: 0, shiftKey: false, clientX: point.x, clientY: point.y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function roleList(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-anchor-role]'))
    .map((node) => node.getAttribute('data-anchor-role')!);
}

function maxCoincidentMultiplicity(outline: PatternPiece['outline']): number {
  const counts = new Map<string, number>();
  for (const command of outline) {
    const anchor = getAnchor(command);
    if (!anchor) continue;
    const key = `${anchor.x.toFixed(6)}:${anchor.y.toFixed(6)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}
```

- [ ] **Step 2: Agregar las regresiones rojas de gesto largo, click y undo abierto**

Añade al mismo archivo:

```tsx
describe('useEditPattern undo gesture integration', () => {
  it('turns a drag longer than 500ms into one undo/redo step and resyncs glyphs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { store, ref, view } = setup(squarePiece());
    const outline = () => store.getState().project.pieces[0].outline;
    const original = structuredClone(outline());
    const originalRoles = roleList(view.container);
    const historyBefore = getUndoLength();

    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 110, y: 0 })); });
    act(() => { vi.advanceTimersByTime(750); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 120, y: 0 })); });
    act(() => { ref.current!.handleMouseUp(); });

    const moved = structuredClone(outline());
    expect(moved[1].values).toEqual([120, 0]);
    expect(getUndoLength()).toBe(historyBefore + 1);
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(outline()).toEqual(original);
    expect(ref.current!.nodes[1].position).toEqual({ x: 100, y: 0 });
    expect(ref.current!.selectedNodes.size).toBe(0);
    expect(roleList(view.container)).toEqual(originalRoles);
    act(() => { store.dispatch({ type: 'editor/redo' }); });
    expect(outline()).toEqual(moved);
  });

  it('does not add history for mouse down/up without movement', () => {
    const { ref } = setup(squarePiece());
    const historyBefore = getUndoLength();
    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })); });
    act(() => { ref.current!.handleMouseUp(); });
    expect(getUndoLength()).toBe(historyBefore);
  });

  it('lets Ctrl+Z close and revert an in-flight drag before mouseup', () => {
    const { store, ref } = setup(squarePiece());
    const outline = () => store.getState().project.pieces[0].outline;
    const original = structuredClone(outline());
    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 115, y: 0 })); });
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(outline()).toEqual(original);
    expect(canRedo()).toBe(true);
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 130, y: 0 })); });
    expect(outline()).toEqual(original);
  });

  it('groups a segment drag under the same single-entry contract', () => {
    const { store, ref } = setup(squarePiece());
    const original = structuredClone(store.getState().project.pieces[0].outline);
    const historyBefore = getUndoLength();
    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 50, y: 0 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 60, y: 5 })); });
    act(() => { ref.current!.handleMouseUp(); });
    expect(getUndoLength()).toBe(historyBefore + 1);
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(store.getState().project.pieces[0].outline).toEqual(original);
  });

  it('closes an open gesture when the editor unmounts', () => {
    const { store, ref, view } = setup(squarePiece());
    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 110, y: 0 })); });
    const beforeUnmount = getUndoLength();
    act(() => { view.unmount(); });
    expect(getUndoLength()).toBe(beforeUnmount + 1);
    const afterGesture = getUndoLength();
    store.dispatch(updatePiece({
      ...store.getState().project.pieces[0],
      name: 'Independent action',
    }));
    expect(getUndoLength()).toBe(afterGesture + 1);
  });
});
```

- [ ] **Step 3: Agregar la regresión roja con corner y smooth sample reales**

Añade al mismo archivo:

```tsx
const MARIA_FIXTURE = resolve(
  __dirname,
  '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf',
);

describe('useEditPattern — DXF real de María', () => {
  it.each(['corner', 'smoothSample'] as const)(
    'moves and undoes one %s without adding commands or coincident anchors',
    (role) => {
      const pieces = importDXFContent(readFileSync(MARIA_FIXTURE, 'utf8'), {
        unit: 'auto', autoDetect: true,
      }).pieces;
      const piece = pieces.find((item) => item.outline.length > 100)!;
      const target = classifyEditableAnchors(piece, extractNodes(piece))
        .find((item) => item.role === role)!;
      const { store, ref, view } = setup(piece);
      const outline = () => store.getState().project.pieces[0].outline;
      const original = structuredClone(outline());
      const originalRoles = roleList(view.container);
      const originalMultiplicity = maxCoincidentMultiplicity(original);
      const start = pieceLocalToPattern(target.node.position, piece);

      act(() => { ref.current!.handleMouseDown(mouseAt(start)); });
      act(() => {
        ref.current!.handleMouseMove(mouseAt({ x: start.x + 12, y: start.y + 4 }));
      });
      act(() => { ref.current!.handleMouseUp(); });

      const moved = outline();
      const changedIndices = original
        .map((command, index) =>
          JSON.stringify(command) === JSON.stringify(moved[index]) ? null : index)
        .filter((index): index is number => index !== null);
      expect(moved).toHaveLength(original.length);
      expect(changedIndices).toEqual([target.node.ref.commandIndex]);
      expect(maxCoincidentMultiplicity(moved)).toBeLessThanOrEqual(originalMultiplicity);
      act(() => { store.dispatch({ type: 'editor/undo' }); });
      expect(outline()).toEqual(original);
      expect(roleList(view.container)).toEqual(originalRoles);
    },
  );
});
```

- [ ] **Step 4: Ejecutar el archivo para confirmar el rojo**

Run:

```bash
npm run test -- src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx
```

Expected: FAIL: el hook no abre/cierra batches explícitos y un drag lento depende todavía de la ventana temporal.

- [ ] **Step 5: Cablear el ciclo de vida idempotente del batch**

En `useEditPattern.ts`, importa helpers:

```ts
import { beginUndoBatch, endUndoBatch } from '../../store/undoMiddleware';
```

Después de `dragRef`, agrega:

```ts
const dragBatchOpenRef = useRef(false);

const beginDragBatch = useCallback(() => {
  if (dragBatchOpenRef.current) return;
  beginUndoBatch(dispatch, 'Editar puntos del patrón');
  dragBatchOpenRef.current = true;
}, [dispatch]);

const endDragBatch = useCallback(() => {
  if (!dragBatchOpenRef.current) return;
  dragBatchOpenRef.current = false;
  endUndoBatch(dispatch);
}, [dispatch]);
```

Al comienzo de `enterEdit`, llama `endDragBatch()` y agrégalo a dependencias. Reescribe `exitEdit`:

```ts
const exitEdit = useCallback(() => {
  endDragBatch();
  setState({ ...INITIAL_STATE });
  dragRef.current = null;
  seenOutlineRef.current = null;
}, [endDragBatch]);
```

En la rama de cambio externo del effect de resync, antes de limpiar `dragRef`, agrega `endDragBatch()` e inclúyelo en dependencias. Añade cleanup:

```ts
useEffect(() => () => endDragBatch(), [endDragBatch]);
```

- [ ] **Step 6: Abrir solo en movimiento efectivo y cerrar en mouseup**

En `handleMouseMove`, después de calcular `dx`/`dy` y antes de construir `outline`, inserta:

```ts
if (drag.startPositions.size === 0 || (dx === 0 && dy === 0)) return true;
beginDragBatch();
```

Agrega `beginDragBatch` a dependencias. En `handleMouseUp`, inmediatamente después de `dragRef.current = null`, llama `endDragBatch()` y agrégalo a dependencias. Marquee no abre batch; el cierre idempotente no despacha nada.

- [ ] **Step 7: Ejecutar integración sintética, María y middleware**

Run:

```bash
npm run test -- src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx src/components/PatternEditor/__tests__/useEditPattern.test.tsx src/__tests__/store.test.ts src/components/PatternEditor/renderers/__tests__/EditPatternOverlay.test.tsx
```

Expected: PASS; una entrada para 750 ms, click sin entrada, Ctrl+Z durante drag restaura y ambos roles del fixture conservan longitud/multiplicidad.

- [ ] **Step 8: Commit del gesto reversible**

```bash
git add src/components/PatternEditor/useEditPattern.ts src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx
git commit -m "fix(editor): group pattern drag into one undo step"
```

---

### Task 7: Replay visible de María y gate final

**Files:**
- Create: `tests/e2e/edit-pattern-trust.spec.ts`
- Verify: el conjunto de archivos modificados en Tasks 1-6.

**Interfaces:**
- Consumes: default dock, shortcut `Q`, `data-anchor-role`, `data-command-index`, Redux undo/redo.
- Produces: contrato browser import→edit→drag lento→undo→redo sobre el fixture real.

- [ ] **Step 1: Crear el test Playwright end-to-end**

Crea `edit-pattern-trust.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/garments/maria_patrones_samuel_2M.dxf',
);

async function activeTool2D(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const store = (window as unknown as {
      __OPENCLO_STORE__?: { getState: () => { tools: { activeTool2D: string } } };
    }).__OPENCLO_STORE__;
    return store?.getState().tools.activeTool2D ?? null;
  });
}

async function commandValues(page: Page, pieceId: string, commandIndex: number): Promise<number[]> {
  return page.evaluate(({ id, index }) => {
    const store = (window as unknown as {
      __OPENCLO_STORE__: { getState: () => {
        project: { pieces: Array<{ id: string; outline: Array<{ values: number[] }> }> };
      } };
    }).__OPENCLO_STORE__;
    const piece = store.getState().project.pieces.find((item) => item.id === id)!;
    return [...piece.outline[index].values];
  }, { id: pieceId, index: commandIndex });
}

test('María DXF: editPattern visible → slow drag → undo/redo keeps marker on geometry', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.removeItem('openclo-docks'));
  await page.goto('/');
  const svg = page.locator('svg.pattern-svg');
  await expect(svg).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Editar patrón · Q' })).toBeVisible();

  await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE);
  await expect.poll(async () => page.locator('[data-piece-id]').count(), {
    timeout: 30_000,
  }).toBe(5);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('q');
  await expect.poll(() => activeTool2D(page)).toBe('editPattern');

  const firstPiece = page.locator('[data-piece-id]').first();
  const pieceId = (await firstPiece.getAttribute('data-piece-id'))!;
  const fill = firstPiece.locator('.piece-fill');
  const fillBox = await fill.boundingBox();
  if (!fillBox) throw new Error('DXF piece fill has no bounding box');
  await fill.dispatchEvent('mousedown', {
    button: 0,
    clientX: fillBox.x + fillBox.width / 2,
    clientY: fillBox.y + fillBox.height / 2,
  });
  await svg.dispatchEvent('mouseup', { button: 0 });

  await expect.poll(async () => page.locator('[data-anchor-role]').count())
    .toBeGreaterThan(0);
  const glyph = page.locator('[data-anchor-role="corner"]').first();
  await expect(glyph).toBeVisible();
  const commandIndex = Number(
    await glyph.evaluate((node) => node.parentElement?.getAttribute('data-command-index')),
  );
  expect(Number.isInteger(commandIndex)).toBe(true);
  const originalValues = await commandValues(page, pieceId, commandIndex);
  const originalGlyphBox = await glyph.boundingBox();
  if (!originalGlyphBox) throw new Error('Corner glyph has no bounding box');
  const startX = originalGlyphBox.x + originalGlyphBox.width / 2;
  const startY = originalGlyphBox.y + originalGlyphBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 5, startY + 2, { steps: 2 });
  await page.waitForTimeout(650);
  await page.mouse.move(startX + 14, startY + 5, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => commandValues(page, pieceId, commandIndex))
    .not.toEqual(originalValues);
  const movedValues = await commandValues(page, pieceId, commandIndex);

  await page.keyboard.press('Control+z');
  await expect.poll(() => commandValues(page, pieceId, commandIndex))
    .toEqual(originalValues);
  const restoredGlyphBox = await glyph.boundingBox();
  if (!restoredGlyphBox) throw new Error('Restored corner glyph has no bounding box');
  expect(restoredGlyphBox.x + restoredGlyphBox.width / 2).toBeCloseTo(startX, 1);
  expect(restoredGlyphBox.y + restoredGlyphBox.height / 2).toBeCloseTo(startY, 1);

  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => commandValues(page, pieceId, commandIndex)).toEqual(movedValues);
});
```

- [ ] **Step 2: Ejecutar el replay focal**

Run:

```bash
npm run test:e2e -- tests/e2e/edit-pattern-trust.spec.ts
```

Expected: 1 passed en Chromium; la pausa de 650 ms sigue siendo un gesto y un Ctrl+Z devuelve valores y centro del glifo.

- [ ] **Step 3: Ejecutar typecheck y suite completa**

Run:

```bash
npx tsc -b --noEmit
npm run test
```

Expected: ambos comandos terminan con exit code 0.

- [ ] **Step 4: Ejecutar lint y whitespace gate**

Run:

```bash
npm run lint
git diff --check
```

Expected: exit code 0 y ningún diagnóstico.

- [ ] **Step 5: Auditar los no objetivos en el diff**

Run:

```bash
git diff -- src/types/types.ts src/store/dockSlice.ts src/components/PatternEditor/useEditPattern.ts
```

Expected: `types.ts` solo corrige el comentario de `Q`; `dockSlice` conserva v1; el hook cambia la transacción, no el modelo geométrico ni `HIT_RADIUS_PX = 8`.

- [ ] **Step 6: Commit del replay**

```bash
git add tests/e2e/edit-pattern-trust.spec.ts
git commit -m "test(editor): replay Maria pattern edit undo flow"
```

---

## Acceptance trace

| Criterio aprobado | Evidencia del plan |
|---|---|
| `editPattern` segundo por defecto | Task 1 tests + catálogo |
| Default histórico migra, personalizado no | Task 1 `migrateDefaultDockTools` |
| `Q` real y contextual | Task 2 registry + integración |
| Corner/smooth distintos en DXF de María | Task 3 fixture + Task 4 glifos |
| Misma gramática en ambos overlays | Task 4 parity test |
| Hit radius independiente | Ningún cambio en `HIT_RADIUS_PX`; revisión Task 7 |
| Drag >500 ms es un undo | Tasks 5-6 con reloj falso |
| Ctrl+Z durante drag es seguro | Tasks 5-6 integración real |
| Click sin movimiento no ensucia historial | Tasks 5-6 dirty/no-move |
| No aparece un punto extra | Task 6 longitud, commandIndex y multiplicidad |
| Undo/redo resincroniza geometría y overlay | Task 6 harness + Task 7 browser |
| No cambia modelo persistido | Global Constraints + revisión Task 7 |

## Execution order

Ejecutar estrictamente por número: Task 1 → 2 → 3 → 4 → 5 → 6 → 7. Cada commit debe pasar sus pruebas focales antes de comenzar la tarea siguiente. El gate completo ocurre en Task 7, además de los hooks pre-commit normales.
