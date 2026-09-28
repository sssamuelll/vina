# La frontera Seleccionar / Editar patrón — fases 1 y 2 (Q edita las internas): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editar patrón (`Q`) edita, además del contorno, las internas de forma propia de la pieza —mover puntos y tramos, Shift, enganche, marco, insertar, borrar y convertir—, con una sola vía de edición para todas las líneas. Y Supr sobre un tramo de interna borra solo ese tramo, también en Seleccionar.

**Architecture:** La fase 1 (PR 1) generaliza sin cambiar nada. Las utilidades de nodos, roles, referencia de Shift y cotas del punto pasan a trabajar sobre cualquier `path`, y Q escribe por una sola puerta pura (`conPaths`, en `lineaEditable.ts`) y arrastra por línea. La fase 2 (PR 2) añade las internas:
- el estado de Q (`estadoDeQ.ts`) guarda cada interna con los mismos campos que el contorno y las enseña todas como una lista (`vistas`);
- un solo hit-test decide qué agarra el press (`agarrar`, en `agarreDeQ.ts`);
- la interna elegida vive en `editor.selectedInternalLine`, la misma que ya usa Seleccionar.

**Tech Stack:** React 19 + TypeScript, Redux Toolkit, Vitest + Testing Library (jsdom), Playwright (e2e, Chromium).

**Spec:** `docs/superpowers/specs/2026-09-24-frontera-seleccionar-editar-design.md`. Este plan cubre las fases 1 y 2 de su § 9. Las fases 3 (trazos), 4 (Z deja de deformar) y 5 (V) tendrán su propio plan cuando estas dos estén en `main`: su código depende de la forma real que deje este núcleo.

## Global Constraints

- **Ramas.** Fase 1: `feat/frontera-1-nucleo`, desde `docs/frontera-seleccionar-editar` (lleva la spec y este plan). Fase 2: `feat/frontera-2-internas`, desde `feat/frontera-1-nucleo`, o desde `main` si la PR 1 ya se mergeó.
- **Typecheck** con `npx tsc -b --noEmit` (modo build), nunca `tsc --noEmit` pelado.
- **La fase 1 no cambia comportamiento.** Los 27 archivos de tests unitarios que tocan Q y los 17 e2e de Q pasan sin tocar sus expectativas (lista en el cierre de la fase 1).
- **Contrato de interfaz** (skill `contrato-de-interfaz`): colores solo por token (`--accent-2d`, `--snap-2d`), sin `var(--x, fallback)`, sin z-index literal. `node scripts/ui-contract-lint.mjs` no puede subir ningún contador. Si baja uno, se fija el techo con `node scripts/ui-contract-lint.mjs --update` y se commitea el baseline; nunca se edita a mano para tapar uno que sube.
- **Copy** en español de Venezuela, sentence case, sin «¡» ni «por favor». Texto nuevo que ve la usuaria en este plan: el aviso `No se puede borrar: la forma necesita al menos 3 puntos`. El aviso del contorno no cambia: `No se puede borrar: la pieza necesita al menos 3 puntos`.
- **Cualquier teclado:** ningún gesto nuevo pide Alt o Ctrl, ni combinados con Shift (spec § 1).
- **IDs** nuevos con `newId()` de `src/utils/ids.ts`.
- **Deshacer:** un gesto, una entrada (`beginUndoBatch`). Toda acción nueva del proyecto lleva etiqueta en `ACTION_LABELS` (`src/store/undoMiddleware.ts`).
- **Caja negra:** toda superficie nueva nace instrumentada (`pushJournal` de `src/utils/telemetry/journal.ts`).
- **e2e en macOS:** vaciar o deshacer con `ControlOrMeta+…`, nunca `Control+…` (#1210). Antes de fiarse de una corrida, confirmar que el servidor de 5174 es Vina (#1164: otro dev server lo ocupaba).
- **Gates por tarea:** `npx tsc -b --noEmit`, `npx vitest run <tests tocados>` y `npx eslint <archivos tocados> --max-warnings=0`. Al cerrar cada fase: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`, más los e2e de Q. Sin `--no-verify`.
- **Comentarios que ya existen.** En los bloques de código, una línea como `// (comentario de hoy: …)` o `(… el JSDoc de hoy …)` marca un comentario que ya está en el archivo y se conserva tal cual, en ese sitio. El marcador no se pega.
- **Importaciones.** Al terminar cada tarea, lo que quedó sin usar se quita de los imports; `eslint --max-warnings=0` lo exige.

## Review Focus

Entradas que la spec implica, que ninguna prueba de tarea cubriría por sí sola y que son las que más probablemente le fallen a María. Cada línea tiene su test en la tarea dueña del código.

1. **Anclas gemelas en una interna del DXF.** CLO duplica el vértice en cada esquina. Agarrar una gemela tiene que mover el grupo entero, y Supr tiene que quitarlo entero, sin dejar un gemelo varado que rompa la línea en una púa. (Tests en la Tarea 8, el arrastre, y en la Tarea 9, el borrado.)
2. **Pieza girada con enganche.** El punto de una interna tiene que enganchar exacto a la esquina **girada** que se ve, y guardarse en el local correcto. (Test en la Tarea 8.)
3. **Interna cerrada** (la Línea interna cerró la forma):
   - arrastrar el punto de cierre mueve juntos la `M` y el último punto;
   - Supr de un tramo la abre en una sola línea;
   - Supr de puntos que la dejarían con menos de tres se niega con aviso.

   (Tests en la Tarea 7, puros, y en la Tarea 9, hook.)
4. **Deshacer desde fuera a mitad de un arrastre de interna.** El arrastre se cancela y los puntos se releen; el siguiente movimiento del ratón no reimpone la posición vieja. (Test en la Tarea 8.)
5. **Pinza editada y luego una operación de pinza** (`applyDartsToInternals`, transferir, ajustar el ancho). La edición de Q no se puede revertir sola por leer la copia vieja de `piece.darts`. (Test en la Tarea 4.)

---

## Mapa de archivos

| Archivo | Qué hace | Tareas |
|---|---|---|
| `src/components/PatternEditor/nodeEditorUtils.ts` | `extractNodesFromPath`; `nearestSegment` con opción `cierre` | 1, 6 |
| `src/components/PatternEditor/anchorRoles.ts` | `classifyAnchorsOfPath` | 1 |
| `src/components/PatternEditor/angleReference.ts` | `arrivingReferenceOnPath` | 1 |
| `src/components/PatternEditor/cotas/nodo.ts` | `cotasDelNodoEnPath`, `puntoUnicoDeLinea` | 1 |
| `src/components/PatternEditor/cotas/cotas.ts` | `CotaUpdate` `'nodo'` con `lineId?` | 1 |
| `src/components/PatternEditor/__tests__/lineaCualquiera.test.ts` (nuevo) | las cuatro utilidades sobre una línea | 1 |
| `src/components/PatternEditor/lineaEditable.ts` (nuevo) | claves de línea, `pathDeLinea`, `conPaths`; luego `internasEditables`, `quitarPuntos`, `quitarTramos` | 2, 4, 7 |
| `src/components/PatternEditor/__tests__/lineaEditable.test.ts` (nuevo) | la puerta de escritura y el borrado | 2, 4, 7 |
| `src/components/PatternEditor/useEditPattern.ts` | el hook de Q | 3, 5, 8, 9 |
| `src/types/types.ts` | `esInternaEditable`, `seBorraEntera` | 4 |
| `src/utils/dartEntity.ts` | `refrescarPinzas` | 4 |
| `src/components/PatternEditor/estadoDeQ.ts` (nuevo) | estado de Q y operaciones puras sobre sus líneas | 5 |
| `src/components/PatternEditor/__tests__/estadoDeQ.test.ts` (nuevo) | las operaciones puras | 5 |
| `src/components/PatternEditor/agarreDeQ.ts` (nuevo) | `agarrar`: quién gana el clic | 6 |
| `src/components/PatternEditor/__tests__/agarreDeQ.test.ts` (nuevo) | las filas de precedencia | 6 |
| `src/store/projectSlice.ts` | `removeTramosDeInterna` | 7 |
| `src/store/undoMiddleware.ts` | su etiqueta | 7 |
| `src/store/borradoDeSeleccion.ts` | `segmentIndex` en el sujeto de interna | 7 |
| `src/hooks/useKeyboardShortcuts.ts`, `src/components/shell/LogoMenu.tsx` | las dos puertas de Supr parten por tramo | 7 |
| `src/store/__tests__/removeTramosDeInterna.test.ts` (nuevo) | reductor y sujeto | 7 |
| `src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx` (nuevo) | gestos y verbos de Q sobre internas | 5, 8, 9 |
| `src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx` | pinta internas y el anillo; colores a tokens | 10 |
| `src/components/PatternEditor/renderers/ToolOverlay.tsx`, `src/components/PatternEditor/PatternEditor.tsx` | cableado | 10, 11 |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx` | no duplica extremos en Q | 10 |
| `src/components/PatternEditor/__tests__/EditPatternTestHarness.tsx` | pasa internas y enganche al overlay | 10 |
| `src/components/PatternEditor/renderers/__tests__/EditPatternOverlay.test.tsx` | las internas y el anillo | 10 |
| `src/components/PatternEditor/cotas/sujeto.ts` | cotas del punto de una interna | 11 |
| `src/components/PatternEditor/ContextMenu.tsx`, `src/components/PatternEditor/actionCuration.ts` | menú sobre un tramo de interna | 11 |
| `src/components/PatternEditor/cotas/__tests__/sujeto.internas.test.ts` (nuevo), `src/components/PatternEditor/__tests__/actionCuration.internas.test.ts` (nuevo) | cotas y menú | 11 |
| `src/components/PatternEditor/useEditorInteractions.ts` | la pieza en edición gana el clic | 12 |
| `src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx` | su caso | 12 |
| `tests/e2e/q-edita-internas.spec.ts` (nuevo), `scripts/deploy-prod.sh` | e2e y gate | 13 |
| spec, informe del 10-09 | registro | 14 |

---

# Parte A — Fase 1: el núcleo común, sin cambiar nada (PR 1)

**Antes de la Tarea 1:**

```bash
git switch docs/frontera-seleccionar-editar
git switch -c feat/frontera-1-nucleo
```

### Task 1: las utilidades de una línea cualquiera

**Files:**
- Modify: `src/components/PatternEditor/nodeEditorUtils.ts` (función `extractNodes`, ~línea 113)
- Modify: `src/components/PatternEditor/anchorRoles.ts` (función `classifyEditableAnchors`, ~línea 64)
- Modify: `src/components/PatternEditor/angleReference.ts` (función `arrivingReference`, ~línea 175)
- Modify: `src/components/PatternEditor/cotas/nodo.ts` (funciones `cotasDelNodo` y `puntoUnicoSeleccionado`)
- Modify: `src/components/PatternEditor/cotas/cotas.ts:47` (variante `'nodo'` de `CotaUpdate`)
- Create: `src/components/PatternEditor/__tests__/lineaCualquiera.test.ts`

**Interfaces:**
- Produces:
  - `extractNodesFromPath(cmds: PathCommand[], ownerId: string): EditableNode[]`
  - `classifyAnchorsOfPath(path: PathCommand[], nodes: EditableNode[]): ClassifiedAnchor[]`
  - `arrivingReferenceOnPath(piece: PatternPiece, path: PathCommand[], commandIndex: number): AngleReference`
  - `cotasDelNodoEnPath(piece: PatternPiece, path: PathCommand[], commandIndex: number, lineId?: string): Cota[]`
  - `puntoUnicoDeLinea(path: PathCommand[], seleccionados: ReadonlySet<number>): number | null`
  - `CotaUpdate` gana `{ kind: 'nodo'; pieceId: string; commandIndex: number; destino: Point2D; lineId?: string }`
  - Las funciones de siempre (`extractNodes`, `classifyEditableAnchors`, `arrivingReference`, `cotasDelNodo`, `puntoUnicoSeleccionado`) delegan en las nuevas con el contorno y devuelven lo mismo que hoy.

- [ ] **Step 1: tests que fallan**

Crea `src/components/PatternEditor/__tests__/lineaCualquiera.test.ts`:

```ts
/**
 * Las utilidades de Editar patrón, sobre una línea cualquiera (spec
 * 2026-09-24 § 3.1). Hasta la fase 1 solo sabían del contorno; una interna es
 * otro `path` en el mismo marco de la pieza, y tiene que leerse igual.
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand, PatternPiece } from '../../../types/types';
import { extractNodes, extractNodesFromPath } from '../nodeEditorUtils';
import { classifyAnchorsOfPath, classifyEditableAnchors } from '../anchorRoles';
import { arrivingReference, arrivingReferenceOnPath } from '../angleReference';
import { cotasDelNodo, cotasDelNodoEnPath, puntoUnicoDeLinea } from '../cotas/nodo';

const cuadrado: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];

// Una interna abierta en L: (20,20) → (120,20) → (120,120).
const ele: PathCommand[] = [
  { type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] },
];

function pieza(): PatternPiece {
  return {
    id: 'p', name: 'P', outline: cuadrado, position: { x: 0, y: 0 }, rotation: 0,
    mirrored: false, active: true, seamAllowance: 0, edges: [],
    internals: [{ id: 'i', type: 'reference', path: ele }],
  } as unknown as PatternPiece;
}

describe('extractNodesFromPath', () => {
  it('lee los nodos de una interna con la pieza como dueña', () => {
    const nodes = extractNodesFromPath(ele, 'p');
    expect(nodes.map(n => n.position)).toEqual([{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 120 }]);
    expect(nodes.every(n => n.ref.pieceId === 'p')).toBe(true);
  });

  it('extractNodes es el mismo cálculo sobre el contorno', () => {
    expect(extractNodes(pieza())).toEqual(extractNodesFromPath(cuadrado, 'p'));
  });
});

describe('classifyAnchorsOfPath', () => {
  it('una línea abierta tiene dos extremos y una esquina', () => {
    const roles = classifyAnchorsOfPath(ele, extractNodesFromPath(ele, 'p')).map(a => a.role);
    expect(roles).toEqual(['openEndpoint', 'corner', 'openEndpoint']);
  });

  it('un ancla que toca una curva es de curva; el extremo sigue siendo extremo', () => {
    const curva: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'C', values: [130, 0, 150, 30, 150, 60] },
    ];
    const roles = classifyAnchorsOfPath(curva, extractNodesFromPath(curva, 'p')).map(a => a.role);
    expect(roles).toEqual(['openEndpoint', 'bezierAnchor', 'openEndpoint']);
  });

  it('classifyEditableAnchors es el mismo cálculo sobre el contorno', () => {
    const p = pieza();
    expect(classifyEditableAnchors(p, extractNodes(p))).toEqual(classifyAnchorsOfPath(cuadrado, extractNodes(p)));
  });
});

describe('arrivingReferenceOnPath', () => {
  const p = pieza();

  it('al punto de en medio le llega el primer tramo, que va a la derecha: 0°', () => {
    const r = arrivingReferenceOnPath(p, ele, 1);
    expect(r.kind).toBe('border');
    expect(r.baseDeg).toBeCloseTo(0, 6);
  });

  it('al último le llega el tramo que baja: −90° (la y crece hacia abajo)', () => {
    expect(arrivingReferenceOnPath(p, ele, 2).baseDeg).toBeCloseTo(-90, 6);
  });

  it('al primero no le llega nada: hace de marco el tramo que sale', () => {
    expect(arrivingReferenceOnPath(p, ele, 0).baseDeg).toBeCloseTo(0, 6);
  });

  it('arrivingReference es el mismo cálculo sobre el contorno', () => {
    for (let i = 0; i < 4; i++) {
      expect(arrivingReference(p, i)).toEqual(arrivingReferenceOnPath(p, cuadrado, i));
    }
  });
});

describe('cotasDelNodoEnPath', () => {
  const p = pieza();

  it('en una interna: sus dos vecinos, con la línea en el id y en la acción', () => {
    const cotas = cotasDelNodoEnPath(p, ele, 1, 'i');
    expect(cotas.map(c => c.valueMm)).toEqual([100, 100]);
    expect(cotas.map(c => c.id)).toEqual(['nodo-i-1-anterior', 'nodo-i-1-siguiente']);
    expect(cotas[0].apply(50)).toEqual({
      kind: 'nodo', pieceId: 'p', commandIndex: 1, destino: { x: 70, y: 20 }, lineId: 'i',
    });
  });

  it('en una punta: un solo vecino', () => {
    expect(cotasDelNodoEnPath(p, ele, 0, 'i')).toHaveLength(1);
  });

  it('cotasDelNodo es el mismo cálculo sobre el contorno', () => {
    const viejas = cotasDelNodo(p, 1).map(c => [c.id, c.valueMm, c.apply(10)]);
    const nuevas = cotasDelNodoEnPath(p, cuadrado, 1).map(c => [c.id, c.valueMm, c.apply(10)]);
    expect(viejas).toEqual(nuevas);
  });
});

describe('puntoUnicoDeLinea', () => {
  const gemelas: PathCommand[] = [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [50, 0] },
    { type: 'L', values: [50, 0] }, { type: 'L', values: [50, 80] },
  ];

  it('un grupo de gemelas es un solo punto', () => {
    expect(puntoUnicoDeLinea(gemelas, new Set([1, 2]))).toBe(1);
  });

  it('dos puntos distintos no son uno', () => {
    expect(puntoUnicoDeLinea(gemelas, new Set([0, 3]))).toBeNull();
  });

  it('nada elegido no es un punto', () => {
    expect(puntoUnicoDeLinea(gemelas, new Set())).toBeNull();
  });
});
```

- [ ] **Step 2: comprobar que fallan**

Run: `npx vitest run src/components/PatternEditor/__tests__/lineaCualquiera.test.ts`
Expected: FAIL — `extractNodesFromPath`, `classifyAnchorsOfPath`, `arrivingReferenceOnPath`, `cotasDelNodoEnPath` y `puntoUnicoDeLinea` no se exportan.

- [ ] **Step 3: `extractNodesFromPath`**

En `nodeEditorUtils.ts`, sustituye la función `extractNodes` entera por estas dos. El cuerpo es el de hoy, con `piece.outline` → `cmds` y `piece.id` → `ownerId`:

```ts
/** Extract editable nodes from a piece's outline */
export function extractNodes(piece: PatternPiece): EditableNode[] {
  return extractNodesFromPath(piece.outline, piece.id);
}

/**
 * Los nodos editables de cualquier línea de una pieza —su contorno o una de sus
 * internas— (spec 2026-09-24 § 3.1). `ownerId` es la pieza dueña y va en cada
 * `NodeRef.pieceId`, igual que con el contorno.
 */
export function extractNodesFromPath(cmds: PathCommand[], ownerId: string): EditableNode[] {
  const nodes: EditableNode[] = [];

  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    const v = cmd.values;
    let node: EditableNode | null = null;

    switch (cmd.type) {
      case 'M':
      case 'L':
        node = {
          ref: { pieceId: ownerId, commandIndex: i, pointType: 'anchor' },
          position: { x: v[0], y: v[1] },
        };
        break;
      case 'C': {
        // Cubic bezier: cp1(v[0],v[1]), cp2(v[2],v[3]), anchor(v[4],v[5])
        node = {
          ref: { pieceId: ownerId, commandIndex: i, pointType: 'anchor' },
          position: { x: v[4], y: v[5] },
          cp1: { x: v[2], y: v[3] }, // incoming handle of this anchor
          cp1Ref: { pieceId: ownerId, commandIndex: i, pointType: 'cp2' },
        };
        break;
      }
      case 'Q': {
        // Quadratic bezier: cp1(v[0],v[1]), anchor(v[2],v[3]). Its only
        // handle writes the 'cp1' slot — the hardcoded 'cp2' mapping made a
        // Q handle drag a silent no-op (maria-203).
        node = {
          ref: { pieceId: ownerId, commandIndex: i, pointType: 'anchor' },
          position: { x: v[2], y: v[3] },
          cp1: { x: v[0], y: v[1] },
          cp1Ref: { pieceId: ownerId, commandIndex: i, pointType: 'cp1' },
        };
        break;
      }
      // Z doesn't add a node
    }

    if (node) {
      // maria-203: the outgoing handle of this anchor lives in the NEXT C
      // command (its v[0],v[1]). Without it only half the bezier is editable.
      const next = cmds[i + 1];
      if (next?.type === 'C') {
        node.cp2 = { x: next.values[0], y: next.values[1] };
        node.cp2Ref = { pieceId: ownerId, commandIndex: i + 1, pointType: 'cp1' };
      }
      nodes.push(node);
    }
  }

  return nodes;
}
```

- [ ] **Step 4: `classifyAnchorsOfPath`**

En `anchorRoles.ts`, deja el JSDoc largo sobre `classifyEditableAnchors` y cambia su cuerpo por la delegación. Debajo va la función nueva, con el cuerpo de hoy cambiando `piece.outline` por `path` en sus cinco apariciones (`closed`, `coincidentAnchorGroups` ×2, `detectCorners`, `isBezierCommand(path[...])`, `path[index]?.authoredAnchor`, `hasStraightIncidentEdges(path, index)`):

```ts
export function classifyEditableAnchors(
  piece: PatternPiece,
  nodes: EditableNode[],
): ClassifiedAnchor[] {
  return classifyAnchorsOfPath(piece.outline, nodes);
}

/**
 * Los roles de las anclas de cualquier línea (spec 2026-09-24 § 3.3): una
 * interna abierta tiene extremos como un contorno abierto, y una cerrada se
 * clasifica como el contorno.
 */
export function classifyAnchorsOfPath(
  path: PathCommand[],
  nodes: EditableNode[],
): ClassifiedAnchor[] {
  const closed = path.some((command) => command.type === 'Z');

  const groupOf = new Map<number, number[]>();
  for (const members of coincidentAnchorGroups(path).values()) {
    for (const index of members) groupOf.set(index, members);
  }

  // An open endpoint's role wins for its whole coincident group (spec §7),
  // not just the literal first/last command: CLO doubles the vertex at an
  // open path's endpoint too, and the twin has no angular break of its own
  // to fall back on (detectCorners reads the reversal as a break), so
  // without this it stacked a corner glyph on the endpoint diamond.
  const endpoints = new Set<number>();
  if (!closed && nodes.length > 0) {
    for (const index of [nodes[0].ref.commandIndex, nodes[nodes.length - 1].ref.commandIndex]) {
      for (const member of groupOf.get(index) ?? [index]) endpoints.add(member);
    }
  }

  // A detected corner colours every member of its group. Claiming one node per
  // corner is what stacked a 6px curve dot on top of every 10px corner square.
  const detected = detectCorners(path);
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

  // authoredAnchor records the user's insertion, independently of the
  // current angle. It only has corner semantics while the two incident edges
  // remain straight. Apply every group signal to the whole coincident group so
  // the renderer never stacks different glyphs at one coordinate.
  const authoredCorners = new Set<number>();
  const bezierAnchors = new Set<number>();
  for (const members of coincidentAnchorGroups(path).values()) {
    const touchesBezier = members.some((index) =>
      isBezierCommand(path[index]) ||
      isBezierCommand(path[index + 1]));
    if (touchesBezier) {
      for (const index of members) bezierAnchors.add(index);
      continue;
    }

    const hasAuthoredStraightAnchor = members.some((index) =>
      path[index]?.authoredAnchor === true &&
      hasStraightIncidentEdges(path, index));
    if (hasAuthoredStraightAnchor) {
      for (const index of members) authoredCorners.add(index);
    }
  }

  return nodes.map((node) => {
    const index = node.ref.commandIndex;
    let role: AnchorRole = 'smoothSample';
    if (endpoints.has(index)) {
      role = 'openEndpoint';
    } else if (corners.has(index)) {
      role = 'corner';
    } else if (bezierAnchors.has(index)) {
      role = 'bezierAnchor';
    } else if (authoredCorners.has(index)) {
      role = 'corner';
    } else if ((groupOf.get(index)?.length ?? 1) >= 2) {
      role = 'lineEnd';
    }
    return { node, role };
  });
}
```

- [ ] **Step 5: `arrivingReferenceOnPath`**

En `angleReference.ts`, deja el JSDoc de `arrivingReference` sobre la función de siempre y sustitúyela por estas dos:

```ts
export function arrivingReference(piece: PatternPiece, commandIndex: number): AngleReference {
  return arrivingReferenceOnPath(piece, piece.outline, commandIndex);
}

/**
 * El tramo que llega a un ancla de CUALQUIER línea de la pieza —su contorno o
 * una interna—, en el marco de la pieza (spec 2026-09-24 § 4.2). Al primer
 * punto de una línea abierta no le llega nada: hace de marco el tramo que sale.
 */
export function arrivingReferenceOnPath(
  piece: PatternPiece, path: PathCommand[], commandIndex: number,
): AngleReference {
  const command = path[commandIndex];
  if (!command || command.values.length < 2) return ABSOLUTE_REFERENCE;
  const anchor = { x: command.values[command.values.length - 2], y: command.values[command.values.length - 1] };
  const built = buildRing(path, 2);
  if (!built.ok) return ABSOLUTE_REFERENCE;
  const real = built.value.segments.filter(s => s.commandIndex < path.length);
  const arriving = real.find(s => samePoint(s.to, anchor) && !samePoint(s.from, anchor));
  if (arriving) return referenceAlong(piece, anchor, tangentAt(arriving, 1));
  const leaving = real.find(s => samePoint(s.from, anchor) && !samePoint(s.to, anchor));
  return leaving ? referenceAlong(piece, anchor, tangentAt(leaving, 0)) : ABSOLUTE_REFERENCE;
}
```

- [ ] **Step 6: cotas del nodo sobre una línea**

En `cotas/cotas.ts:47`, la variante `'nodo'`:

```ts
  | { kind: 'nodo'; pieceId: string; commandIndex: number; destino: Point2D; lineId?: string }
```

En `cotas/nodo.ts`, sustituye `cotasDelNodo` por la delegación y la versión sobre una línea. El JSDoc largo de hoy se queda sobre `cotasDelNodoEnPath`. El cálculo del `centro` sigue saliendo del **contorno** también para una interna, así que el chip sale hacia fuera de la pieza:

```ts
export function cotasDelNodo(piece: PatternPiece, commandIndex: number): Cota[] {
  return cotasDelNodoEnPath(piece, piece.outline, commandIndex);
}

/**
 * Las cotas de un nodo en reposo: su distancia a cada vecino, escribibles.
 * (… el JSDoc de hoy …)
 *
 * Vale para cualquier línea de la pieza (spec 2026-09-24 § 4.5). `lineId` (una
 * interna) viaja en el id de la cota y en su acción, para que `moveNodeTo`
 * escriba en esa línea.
 */
export function cotasDelNodoEnPath(
  piece: PatternPiece, path: PathCommand[], commandIndex: number, lineId?: string,
): Cota[] {
  const propio = getAnchor(path[commandIndex] ?? { type: 'Z', values: [] });
  if (!propio) return [];
  const { anterior, siguiente } = vecinosDelNodo(path, commandIndex);

  const centro = { x: 0, y: 0 };
  for (const cmd of piece.outline) {
    const p = getAnchor(cmd);
    if (p) { centro.x += p.x; centro.y += p.y; }
  }
  const n = piece.outline.filter((c) => getAnchor(c)).length || 1;
  centro.x /= n; centro.y /= n;

  const cota = (v: Vecino, lado: 'anterior' | 'siguiente'): Cota | null => {
    const largo = dist(propio, v.punto);
    if (largo < 1e-6) return null;
    const dir = { x: (propio.x - v.punto.x) / largo, y: (propio.y - v.punto.y) / largo };
    const medio = { x: (propio.x + v.punto.x) / 2, y: (propio.y + v.punto.y) / 2 };
    const normal = { x: -dir.y, y: dir.x };
    const haciaFuera = (medio.x - centro.x) * normal.x + (medio.y - centro.y) * normal.y < 0
      ? { x: -normal.x, y: -normal.y }
      : normal;

    return {
      id: lineId ? `nodo-${lineId}-${commandIndex}-${lado}` : `nodo-${commandIndex}-${lado}`,
      // (… los comentarios de hoy sobre `kind`, `a`/`b`, `outward` y `apply` …)
      kind: 'tramo-largo',
      label: lado === 'anterior' ? 'Al punto anterior' : 'Al punto siguiente',
      valueMm: largo,
      unit: 'mm',
      min: 0.1,
      max: 10000,
      primary: true,
      rotulo: 'del punto',
      a: pieceLocalToPattern(v.punto, piece),
      b: pieceLocalToPattern(propio, piece),
      outward: pieceLocalToPatternDirection(haciaFuera, piece),
      apply: (v2) => ({
        kind: 'nodo' as const,
        pieceId: piece.id,
        commandIndex,
        destino: { x: v.punto.x + dir.x * v2, y: v.punto.y + dir.y * v2 },
        ...(lineId ? { lineId } : {}),
      }),
    };
  };

  const cotas: Cota[] = [];
  if (anterior) { const c = cota(anterior, 'anterior'); if (c) cotas.push(c); }
  if (siguiente) { const c = cota(siguiente, 'siguiente'); if (c) cotas.push(c); }
  return cotas;
}
```

Y al final del archivo, `puntoUnicoSeleccionado` delega en la nueva `puntoUnicoDeLinea` (el JSDoc de hoy se queda sobre `puntoUnicoSeleccionado`):

```ts
export function puntoUnicoSeleccionado(
  piece: PatternPiece | undefined,
  seleccionados: ReadonlySet<number>,
): { pieceId: string; commandIndex: number } | null {
  if (!piece) return null;
  const commandIndex = puntoUnicoDeLinea(piece.outline, seleccionados);
  return commandIndex === null ? null : { pieceId: piece.id, commandIndex };
}

/** El mismo criterio sobre cualquier línea: el índice del punto, o null. */
export function puntoUnicoDeLinea(
  path: PathCommand[],
  seleccionados: ReadonlySet<number>,
): number | null {
  if (seleccionados.size === 0) return null;
  const nodos = [...seleccionados];
  const grupo = anchorGroupOf(path, nodos[0]);
  if (nodos.length !== grupo.length || !nodos.every((n) => grupo.includes(n))) return null;
  return nodos[0];
}
```

- [ ] **Step 7: comprobar que pasan, y que lo de antes sigue igual**

Run: `npx vitest run src/components/PatternEditor/__tests__/lineaCualquiera.test.ts src/components/PatternEditor/cotas src/components/PatternEditor/__tests__/marcoDelLado.test.ts src/components/PatternEditor/renderers/__tests__/AnchorOverlayParity.test.tsx src/components/PatternEditor/renderers/__tests__/EditPatternOverlay.test.tsx`
Expected: PASS, todos.

Run: `npx vitest run src/components/PatternEditor --reporter=dot`
Expected: PASS. Las utilidades viejas delegan y devuelven lo mismo.

- [ ] **Step 8: tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/components/PatternEditor/nodeEditorUtils.ts src/components/PatternEditor/anchorRoles.ts src/components/PatternEditor/angleReference.ts src/components/PatternEditor/cotas/nodo.ts src/components/PatternEditor/cotas/cotas.ts src/components/PatternEditor/__tests__/lineaCualquiera.test.ts --max-warnings=0`
Expected: sin errores ni avisos.

- [ ] **Step 9: commit**

```bash
git add src/components/PatternEditor/nodeEditorUtils.ts src/components/PatternEditor/anchorRoles.ts src/components/PatternEditor/angleReference.ts src/components/PatternEditor/cotas/nodo.ts src/components/PatternEditor/cotas/cotas.ts src/components/PatternEditor/__tests__/lineaCualquiera.test.ts
git commit -m "refactor(2d): nodos, roles, referencia de Shift y cotas del punto sobre cualquier línea (frontera, fase 1)"
```

---

### Task 2: `lineaEditable.ts`, una sola puerta para leer y escribir una línea

**Files:**
- Create: `src/components/PatternEditor/lineaEditable.ts`
- Create: `src/components/PatternEditor/__tests__/lineaEditable.test.ts`

**Interfaces:**
- Consumes: `compensatePositionForPivotChange` (`./pieceTransform`), `reanchorNotches` (`../../utils/notchReanchor`).
- Produces:
  - `type ClaveLinea = 'contorno' | \`interna:${string}\``
  - `CLAVE_CONTORNO: ClaveLinea`
  - `claveDeInterna(lineId: string): ClaveLinea`
  - `lineIdDeClave(clave: ClaveLinea): string | null`
  - `pathDeLinea(piece: PatternPiece, clave: ClaveLinea): PathCommand[] | null`
  - `conPaths(piece: PatternPiece, cambios: ReadonlyMap<ClaveLinea, PathCommand[] | null>): PatternPiece`

- [ ] **Step 1: tests que fallan**

Crea `src/components/PatternEditor/__tests__/lineaEditable.test.ts`:

```ts
/**
 * La puerta de escritura de Editar patrón (spec 2026-09-24 § 8): una pieza con
 * los paths nuevos de sus líneas. Tiene que dar EXACTAMENTE lo que construía a
 * mano `dispatchAndRefresh` para el contorno —pivote y piquetes incluidos— y
 * no tocar ni el pivote ni los piquetes cuando solo cambia una interna.
 */
import { describe, it, expect } from 'vitest';
import type { InternalLine, PathCommand, PatternPiece } from '../../../types/types';
import {
  CLAVE_CONTORNO, claveDeInterna, conPaths, lineIdDeClave, pathDeLinea,
} from '../lineaEditable';
import { compensatePositionForPivotChange } from '../pieceTransform';
import { reanchorNotches } from '../../../utils/notchReanchor';
import { computeNotchAnchor } from '../../../utils/notchAnchor';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';

const cuadrado: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];
const ref: InternalLine = {
  id: 'r', type: 'reference',
  path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }],
};
const piquete: InternalLine = {
  id: 'n', type: 'notch',
  path: generateNotchPath({ x: 100, y: 0 }, { x: 0, y: 1 }, DEFAULT_NOTCH_OPTIONS),
  notchOptions: DEFAULT_NOTCH_OPTIONS,
  notchAnchor: computeNotchAnchor(cuadrado, { x: 100, y: 0 })!,
};

function pieza(): PatternPiece {
  return {
    id: 'p', name: 'P', outline: cuadrado, position: { x: 50, y: 30 }, rotation: 30,
    mirrored: false, active: true, seamAllowance: 0, edges: [], internals: [ref, piquete],
  } as unknown as PatternPiece;
}

describe('claves de línea', () => {
  it('el contorno no tiene id de interna; una interna, el suyo', () => {
    expect(lineIdDeClave(CLAVE_CONTORNO)).toBeNull();
    expect(lineIdDeClave(claveDeInterna('r'))).toBe('r');
  });
});

describe('pathDeLinea', () => {
  it('lee el contorno y las internas; una que no existe, null', () => {
    const p = pieza();
    expect(pathDeLinea(p, CLAVE_CONTORNO)).toBe(p.outline);
    expect(pathDeLinea(p, claveDeInterna('r'))).toBe(ref.path);
    expect(pathDeLinea(p, claveDeInterna('nadie'))).toBeNull();
  });
});

describe('conPaths', () => {
  const nuevoContorno: PathCommand[] = [
    { type: 'M', values: [-40, -40] }, { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
  ];

  it('el contorno: lo mismo que construía dispatchAndRefresh (pivote y piquetes)', () => {
    const p = pieza();
    const r = conPaths(p, new Map([[CLAVE_CONTORNO, nuevoContorno]]));
    expect(r.outline).toBe(nuevoContorno);
    expect(r.position).toEqual(compensatePositionForPivotChange(p, nuevoContorno));
    expect(r.internals).toEqual(reanchorNotches(p.internals, nuevoContorno, p.outline));
  });

  it('una interna: cambia su path y nada más; ni pivote, ni piquetes, ni contorno', () => {
    const p = pieza();
    const nuevo: PathCommand[] = [{ type: 'M', values: [20, 40] }, { type: 'L', values: [120, 40] }];
    const r = conPaths(p, new Map([[claveDeInterna('r'), nuevo]]));
    expect(r.outline).toBe(p.outline);
    expect(r.position).toBe(p.position);
    expect(r.internals[0].path).toBe(nuevo);
    expect(r.internals[1]).toBe(piquete);
  });

  it('null quita la interna', () => {
    const r = conPaths(pieza(), new Map([[claveDeInterna('r'), null]]));
    expect(r.internals.map(l => l.id)).toEqual(['n']);
  });

  it('las dos a la vez: la interna nueva y los piquetes re-anclados al contorno nuevo', () => {
    const p = pieza();
    const nuevo: PathCommand[] = [{ type: 'M', values: [20, 40] }, { type: 'L', values: [120, 40] }];
    const r = conPaths(p, new Map<ReturnType<typeof claveDeInterna>, PathCommand[]>([
      [CLAVE_CONTORNO, nuevoContorno], [claveDeInterna('r'), nuevo],
    ]));
    expect(r.internals[0].path).toBe(nuevo);
    expect(r.internals[1]).toEqual(reanchorNotches([piquete], nuevoContorno, p.outline)[0]);
  });
});
```

- [ ] **Step 2: comprobar que fallan**

Run: `npx vitest run src/components/PatternEditor/__tests__/lineaEditable.test.ts`
Expected: FAIL — `Cannot find module '../lineaEditable'`.

- [ ] **Step 3: el módulo**

Crea `src/components/PatternEditor/lineaEditable.ts`:

```ts
/**
 * Una línea que Editar patrón (`Q`) sabe editar, y la ÚNICA puerta por la que
 * se escribe (spec 2026-09-24 §§ 3.1 y 8).
 *
 * Una pieza tiene varias líneas: su contorno y sus internas. Todas viven en el
 * marco local de la pieza, así que se leen, se arrastran y se escriben igual;
 * lo que cambia es qué más hay que rehacer al escribir, y eso vive aquí y en
 * ningún otro sitio (dos escritores del mismo hecho se desincronizan: es el
 * fallo con nombre propio de este repo).
 */
import type { PathCommand, PatternPiece } from '../../types/types';
import { reanchorNotches } from '../../utils/notchReanchor';
import { compensatePositionForPivotChange } from './pieceTransform';

/** La clave de una línea dentro de su pieza: estable mientras la línea exista. */
export type ClaveLinea = 'contorno' | `interna:${string}`;

export const CLAVE_CONTORNO: ClaveLinea = 'contorno';

export function claveDeInterna(lineId: string): ClaveLinea {
  return `interna:${lineId}`;
}

/** El id de la interna de una clave, o null si es el contorno. */
export function lineIdDeClave(clave: ClaveLinea): string | null {
  return clave === CLAVE_CONTORNO ? null : clave.slice('interna:'.length);
}

/** El path de una línea en la pieza de hoy, o null si ya no existe. */
export function pathDeLinea(piece: PatternPiece, clave: ClaveLinea): PathCommand[] | null {
  const lineId = lineIdDeClave(clave);
  if (lineId === null) return piece.outline;
  return piece.internals.find(l => l.id === lineId)?.path ?? null;
}

/**
 * La pieza con los paths nuevos de sus líneas.
 *
 * - El contorno compensa el pivote de giro (una pieza girada no salta al
 *   cambiar su caja) y re-ancla los piquetes al borde nuevo (#171). Es lo que
 *   construía a mano `dispatchAndRefresh`.
 * - Una interna cambia su path, y `null` la quita. No mueve el pivote: el
 *   giro se hace sobre la caja del contorno, que no cambió.
 */
export function conPaths(
  piece: PatternPiece,
  cambios: ReadonlyMap<ClaveLinea, PathCommand[] | null>,
): PatternPiece {
  const contorno = cambios.get(CLAVE_CONTORNO) ?? null;
  let internals = piece.internals;
  const tocaInternas = [...cambios.keys()].some(k => k !== CLAVE_CONTORNO);
  if (tocaInternas) {
    internals = internals.flatMap(line => {
      const clave = claveDeInterna(line.id);
      if (!cambios.has(clave)) return [line];
      const path = cambios.get(clave);
      return path ? [{ ...line, path }] : [];
    });
  }
  if (!contorno) return { ...piece, internals, updatedAt: Date.now() };
  return {
    ...piece,
    position: compensatePositionForPivotChange(piece, contorno),
    outline: contorno,
    internals: reanchorNotches(internals, contorno, piece.outline),
    updatedAt: Date.now(),
  };
}
```

- [ ] **Step 4: comprobar que pasan**

Run: `npx vitest run src/components/PatternEditor/__tests__/lineaEditable.test.ts`
Expected: PASS.

- [ ] **Step 5: tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/components/PatternEditor/lineaEditable.ts src/components/PatternEditor/__tests__/lineaEditable.test.ts --max-warnings=0`
Expected: sin errores ni avisos.

- [ ] **Step 6: commit**

```bash
git add src/components/PatternEditor/lineaEditable.ts src/components/PatternEditor/__tests__/lineaEditable.test.ts
git commit -m "feat(2d): lineaEditable — una sola puerta para escribir una línea de la pieza (frontera, fase 1)"
```

---

### Task 3: Q escribe por una puerta y arrastra por línea, sin cambiar nada

Es un refactor puro. El oráculo son los tests de hoy: no se escribe un test nuevo que falle, porque no cambia ningún comportamiento. Lo que se prueba es que los 27 archivos que tocan Q siguen en verde sin tocarlos.

**Files:**
- Modify: `src/components/PatternEditor/useEditPattern.ts`

**Interfaces:**
- Consumes: `conPaths`, `CLAVE_CONTORNO`, `ClaveLinea` (Tarea 2).
- Produces (internos del hook, los usan las tareas 5, 8 y 9):
  - `interface ArrastreDeLinea { startPath: PathCommand[]; startPositions: Map<number, Point2D>; groups?: Map<number, number[]> }`
  - `OutlineDrag.porLinea: Map<ClaveLinea, ArrastreDeLinea>`
  - `OutlineDrag.quitarAlSoltar?: { clave: ClaveLinea; indices: readonly number[] }`
  - `escribirLineas(piece, cambios: ReadonlyMap<ClaveLinea, PathCommand[] | null>, token?)`
  - `escribirContorno(piece, outline, token?)`

- [ ] **Step 1: la línea de base, en verde antes de tocar**

Run: `npx vitest run src/components/PatternEditor src/shortcuts src/components/shell src/store/__tests__/dockSlice.test.ts src/utils/geometry/__tests__/arcToNative.test.ts --reporter=dot`
Expected: PASS. Anota el número de tests: tiene que ser el mismo al final.

- [ ] **Step 2: imports**

En `useEditPattern.ts`:
- quita `import { reanchorNotches } from '../../utils/notchReanchor';`;
- de la importación de `./pieceTransform`, quita `compensatePositionForPivotChange` (quedan `patternToPieceLocal`, `patternToPieceLocalDirection` y `pieceLocalToPattern`);
- añade:

```ts
import { conPaths, CLAVE_CONTORNO, type ClaveLinea } from './lineaEditable';
```

- [ ] **Step 3: los tipos del arrastre**

Sustituye el bloque `// ─── Drag ref types ───` entero, desde `/** Lo que comparten el arrastre de puntos y el de tramos. */` hasta `type DragState = NodeDrag | SegmentDrag | MarqueeDrag;`, por:

```ts
// ─── Drag ref types ───

/** Lo que un gesto arrastra de UNA línea. */
interface ArrastreDeLinea {
  /** El path de la línea al empezar el gesto: cada frame se calcula desde aquí. */
  startPath: PathCommand[];
  /** commandIndex → posición original. */
  startPositions: Map<number, Point2D>;
  /** Grupo de anclas coincidentes de cada punto arrastrado, en `startPath`. */
  groups?: Map<number, number[]>;
}

/** Lo que comparten el arrastre de puntos y el de tramos. */
interface OutlineDrag {
  startMouse: Point2D;
  /**
   * Las líneas que mueve el gesto, cada una con su punto de partida. Todas con
   * el mismo vector (spec 2026-09-24 § 4.1). En la fase 1, solo el contorno.
   */
  porLinea: Map<ClaveLinea, ArrastreDeLinea>;
  /** Último ratón del arrastre: pulsar Shift con la mano quieta lo re-aplica. */
  lastMouse?: Point2D;
  /** El último desplazamiento escrito (marco local). */
  lastDelta?: Point2D;
  /** Ya escribió al menos un frame. */
  wrote?: boolean;
  /** Shift+press sobre algo ya seleccionado: se quita al soltar si no hubo arrastre. */
  quitarAlSoltar?: { clave: ClaveLinea; indices: readonly number[] };
  /**
   * El marco de Shift dos veces, congelado al empezar (spec 2026-09-23 § 3.4):
   * desde dónde salen las guías —la posición inicial del punto agarrado, o el
   * punto del lado donde se pulsó— y respecto a qué lado, en espacio de patrón.
   * Un marco vivo giraría la guía bajo la mano mientras el lado se inclina.
   */
  marco: { desde: Point2D; referencia: AngleReference };
}

interface NodeDrag extends OutlineDrag {
  type: 'node';
}

interface SegmentDrag extends OutlineDrag {
  type: 'segment';
}

interface MarqueeDrag {
  type: 'marquee';
  startMouse: Point2D;
  startPositions: Map<number, Point2D>; // unused, kept for type uniformity
}

type DragState = NodeDrag | SegmentDrag | MarqueeDrag;
```

- [ ] **Step 4: la puerta de escritura**

Sustituye el bloque `// ─── Helper: dispatch piece update and refresh nodes ───` entero (la función `dispatchAndRefresh`, hasta su `[dispatch],\n  );`) por las dos funciones de abajo. Los comentarios de hoy (#218, #1122, *ponytail*) se conservan dentro de `escribirLineas`, en el sitio donde estaban.

```ts
  // ─── Helper: la única puerta de escritura (spec 2026-09-24 § 8) ───

  const escribirLineas = useCallback(
    (
      piece: PatternPiece,
      cambios: ReadonlyMap<ClaveLinea, PathCommand[] | null>,
      undoBatchToken?: UndoBatchToken,
    ) => {
      const updated = conPaths(piece, cambios);
      const action = updatePiece(updated);
      dispatch(undoBatchToken ? withUndoBatchToken(action, undoBatchToken) : action);
      const newNodes = extractNodes(updated);
      // (comentario de hoy: el overlay pinta `nodes` con la transformada de
      // `editingPieceId`… el eco del #218)
      if (piece.id === editingPieceIdRef.current) {
        expectedOutlineRef.current = updated.outline;
        // (comentarios de hoy: #1122 y *ponytail*)
        const estructural = updated.outline.length !== piece.outline.length;
        setState(s => (estructural
          ? resyncStateToPiece(s, updated)
          : { ...s, nodes: newNodes }));
      }
    },
    [dispatch],
  );

  /** Solo el contorno: lo que escribían los verbos de siempre. */
  const escribirContorno = useCallback(
    (piece: PatternPiece, outline: PathCommand[], undoBatchToken?: UndoBatchToken) =>
      escribirLineas(piece, new Map([[CLAVE_CONTORNO, outline]]), undoBatchToken),
    [escribirLineas],
  );
```

- [ ] **Step 5: los arranques del arrastre**

En `enterEditActuando`, rama de nodo, el `dragRef.current = {…}` pasa a:

```ts
        dragRef.current = {
          type: 'node',
          startMouse: { x: e.clientX, y: e.clientY },
          porLinea: new Map([[CLAVE_CONTORNO, { startPath: piece.outline, startPositions }]]),
          marco: marcoDelPunto(piece, startPositions.get(nodeHit.commandIndex) ?? localPt, nodeHit.commandIndex),
        };
```

En la rama de segmento:

```ts
        dragRef.current = {
          type: 'segment',
          startMouse: { x: e.clientX, y: e.clientY },
          porLinea: new Map([[CLAVE_CONTORNO, { startPath: piece.outline, startPositions }]]),
          marco: marcoDelTramo(piece, nodes, segmentHit.commandIndex, pieceLocalToPattern(segmentHit.point, piece)),
        };
```

En `handleMouseDown`, rama de nodo:

```ts
        dragRef.current = {
          type: 'node',
          startMouse: { x: e.clientX, y: e.clientY },
          porLinea: new Map([[CLAVE_CONTORNO, { startPath: piece.outline, startPositions }]]),
          marco: marcoDelPunto(piece, startPositions.get(idx) ?? localPt, idx),
          ...(quitarAlSoltar ? { quitarAlSoltar: { clave: CLAVE_CONTORNO, indices: group } } : {}),
        };
```

Y en la rama de segmento:

```ts
        dragRef.current = {
          type: 'segment',
          startMouse: { x: e.clientX, y: e.clientY },
          porLinea: new Map([[CLAVE_CONTORNO, { startPath: piece.outline, startPositions }]]),
          marco: marcoDelTramo(piece, state.nodes, idx, pieceLocalToPattern(segHit.point, piece)),
          ...(quitarAlSoltar ? { quitarAlSoltar: { clave: CLAVE_CONTORNO, indices: [idx] } } : {}),
        };
```

- [ ] **Step 6: el arrastre, por línea**

Sustituye `aplicarArrastre` entera. El JSDoc de hoy se queda encima:

```ts
  const aplicarArrastre = useCallback(
    (piece: PatternPiece, drag: NodeDrag | SegmentDrag, mouse: Point2D, modo: ModoShift) => {
      drag.lastMouse = mouse;
      if (![...drag.porLinea.values()].some(l => l.startPositions.size > 0)) return;
      const pantalla = { x: mouse.x - drag.startMouse.x, y: mouse.y - drag.startMouse.y };
      // Shift+press sobre algo ya seleccionado es un clic —que lo quita al
      // soltar— hasta que la mano cruza el umbral de arrastre: un temblor no
      // puede mover la selección ni anular la deselección.
      if (drag.quitarAlSoltar && !drag.wrote && !isDrag(pantalla.x, pantalla.y)) return;
      const enHoja = {
        x: screenToPatternLength(pantalla.x, zoom),
        y: screenToPatternLength(pantalla.y, zoom),
      };
      // (comentario de hoy: se endereza en espacio de patrón ANTES de pasar el
      // delta al marco de la pieza… nota de María #170)
      let enPatron = enHoja;
      if (modo !== 'suelto') {
        const { desde, referencia } = drag.marco;
        const g = guiasShift(desde, { x: desde.x + enHoja.x, y: desde.y + enHoja.y }, referencia, modo === 'borde');
        enPatron = { x: g.punto.x - desde.x, y: g.punto.y - desde.y };
        publicarGuias(g);
      } else {
        publicarGuias(null);
      }
      const { x: dx, y: dy } = patternToPieceLocalDirection(enPatron, piece);
      // Un desplazamiento igual al último escrito no reescribe nada.
      const ultimo = drag.lastDelta ?? { x: 0, y: 0 };
      if (dx === ultimo.x && dy === ultimo.y) return;
      const undoBatchToken = beginDragBatch();

      // Cada línea desde su path del INICIO del gesto, ancla por ancla y con
      // los grupos de anclas coincidentes de ESE path. Reagrupar frame a frame
      // sobre el path ya movido capturaba cualquier ancla por la que el
      // arrastre pasara exactamente encima, y se la llevaba.
      const cambios = new Map<ClaveLinea, PathCommand[]>();
      for (const [clave, linea] of drag.porLinea) {
        if (linea.startPositions.size === 0) continue;
        linea.groups ??= new Map([...linea.startPositions.keys()].map((cmdIdx): [number, number[]] => {
          const grupo = anchorGroupOf(linea.startPath, cmdIdx);
          return [cmdIdx, grupo.length > 0 ? grupo : [cmdIdx]];
        }));
        const moves = new Map<number, Point2D>();
        for (const [cmdIdx, startPos] of linea.startPositions) {
          const destino = { x: startPos.x + dx, y: startPos.y + dy };
          for (const miembro of linea.groups.get(cmdIdx) ?? [cmdIdx]) moves.set(miembro, destino);
        }
        let path = applyAnchorMoves(linea.startPath, moves);
        // Curva por puntos (#197): en un tramo gestionado los manejadores se
        // rehacen desde las anclas. La marca vive en el path previo al gesto.
        for (const cmdIdx of linea.startPositions.keys()) {
          path = resmoothAfterMove(linea.startPath, path, cmdIdx);
        }
        cambios.set(clave, path);
      }

      escribirLineas(piece, cambios, undoBatchToken);
      drag.lastDelta = { x: dx, y: dy };
      drag.wrote = true;
    },
    [zoom, beginDragBatch, escribirLineas, publicarGuias],
  );
```

- [ ] **Step 7: soltar**

En `handleMouseUp`, sustituye el final (desde `const quitar = drag.quitarAlSoltar;`):

```ts
    // Node/segment drags already wrote during mousemove. What is left is the
    // Shift+click that never became a drag: now it does deselect. En la fase 1
    // la única línea es el contorno.
    const quitar = drag.quitarAlSoltar;
    if (!quitar || drag.wrote) return;
    if (drag.type === 'node') {
      setState(s => {
        const selectedNodes = new Set(s.selectedNodes);
        for (const ci of quitar.indices) selectedNodes.delete(ci);
        return { ...s, selectedNodes };
      });
    } else {
      setState(s => {
        const selectedSegments = new Set(s.selectedSegments);
        for (const ci of quitar.indices) selectedSegments.delete(ci);
        return { ...s, selectedSegments };
      });
    }
```

- [ ] **Step 8: Supr por la misma puerta**

En `handleKeyDown`, el objeto `updated` que hoy se construye a mano pasa a:

```ts
        const updated = conPaths(piece, new Map([[CLAVE_CONTORNO, outline]]));
```

El resto del bloque (`expectedOutlineRef.current = outline;`, `dispatch(updatePiece(updated));`, `setState(s => resyncStateToPiece(s, updated));`) no cambia.

- [ ] **Step 9: los verbos**

Cambia `dispatchAndRefresh(` por `escribirContorno(` en `handleDoubleClick`, `convertSegment`, `moveNodeTo`, `convertSegmentToPoints`, `convertSegmentToBezier` y `addPointOnSegment`, y `dispatchAndRefresh` por `escribirContorno` en sus arrays de dependencias. Actualiza también los tres comentarios que nombran `dispatchAndRefresh` (sobre `editingPieceIdRef`, en el borrado y en `addPointOnSegment`) para que digan `escribirLineas`.

- [ ] **Step 10: la misma línea de base, en verde**

Run: `npx vitest run src/components/PatternEditor src/shortcuts src/components/shell src/store/__tests__/dockSlice.test.ts src/utils/geometry/__tests__/arcToNative.test.ts --reporter=dot`
Expected: PASS, con el mismo número de tests que en el Step 1.

Run: `npx tsc -b --noEmit && npx eslint src/components/PatternEditor/useEditPattern.ts --max-warnings=0`
Expected: sin errores ni avisos.

- [ ] **Step 11: commit**

```bash
git add src/components/PatternEditor/useEditPattern.ts
git commit -m "refactor(2d): Q escribe por conPaths y arrastra por línea, sin cambiar nada (frontera, fase 1)"
```

---

### Cierre de la fase 1 (checkpoint, PR 1)

- [ ] **Gate completo:** `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. Expected: todo en verde; el trinquete, sin cambios.
- [ ] **Los e2e de Q** (con Vite en 5174 comprobado): `npx playwright test tests/e2e/linea-interna-gramatica.spec.ts tests/e2e/lo-que-se-ve-y-cuando.spec.ts tests/e2e/1167-editar-los-largos-de-la-pieza.spec.ts tests/e2e/supr-borra-lo-que-se-ve.spec.ts tests/e2e/un-gesto-una-accion.spec.ts tests/e2e/supr-con-algo-delante.spec.ts tests/e2e/shift-endereza-a-la-hoja.spec.ts tests/e2e/1092-borde-de-cierre.spec.ts tests/e2e/gestos-sin-clic-y-aviso-en-el-lienzo.spec.ts tests/e2e/seis-firmas-maria.spec.ts tests/e2e/replay-maria-07-09.spec.ts tests/e2e/estado-latente-de-edicion.spec.ts tests/e2e/edit-pattern-trust.spec.ts tests/e2e/maria-218-eco-punto-y-mover.spec.ts tests/e2e/curva-por-puntos.spec.ts tests/e2e/maria-194-rastro-al-mover.spec.ts tests/e2e/1112-mover-el-punto-con-numero.spec.ts`. Expected: todos en verde; el recorrido del 07-09, 13 de 13.
- [ ] **PR 1.** La abre la skill `superpowers:finishing-a-development-branch`, con la usuaria delante: push y PR son decisión suya.

---

# Parte B — Fase 2: Q edita las internas (PR 2)

**Antes de la Tarea 4:** desde `main` si la PR 1 ya se mergeó; si no, desde la rama de la fase 1.

```bash
git switch feat/frontera-1-nucleo   # o: git switch main && git pull
git switch -c feat/frontera-2-internas
```

### Task 4: qué internas edita Q, y la copia de las pinzas al día

**Files:**
- Modify: `src/types/types.ts` (junto a `seSeleccionaPorTramo`, ~línea 843)
- Modify: `src/utils/dartEntity.ts` (después de `extractDarts`)
- Modify: `src/components/PatternEditor/lineaEditable.ts`
- Modify: `src/components/PatternEditor/__tests__/lineaEditable.test.ts`

**Interfaces:**
- Produces:
  - `esInternaEditable(line: InternalLine): boolean`
  - `seBorraEntera(type: InternalLineType): boolean`
  - `refrescarPinzas(darts: Dart[], internals: InternalLine[], edges?: SemanticEdge[], quitadas?: ReadonlySet<string>): Dart[]`
  - `internasEditables(piece: PatternPiece): InternalLine[]` (en `lineaEditable.ts`)
  - `conPaths` refresca `piece.darts` cuando toca internas y la pieza la tiene.

- [ ] **Step 1: tests que fallan**

Añade al final de `src/components/PatternEditor/__tests__/lineaEditable.test.ts` (y los imports que faltan arriba: `esInternaEditable`, `seBorraEntera` de `../../../types/types`; `internasEditables` de `../lineaEditable`; `applyDartsToInternals`, `extractDarts` de `../../../utils/dartEntity`):

```ts
describe('qué internas edita Q (spec § 3.2)', () => {
  const linea = (type: InternalLine['type'], extra: Partial<InternalLine> = {}): InternalLine => ({
    id: type, type, path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] }], ...extra,
  });

  it('las de forma propia sí; el piquete y el doblez de un pliegue no', () => {
    for (const t of ['reference', 'fold', 'topstitch', 'seam', 'grainline', 'dart', 'pleat'] as const) {
      expect(esInternaEditable(linea(t)), t).toBe(true);
    }
    expect(esInternaEditable(linea('notch'))).toBe(false);
    expect(esInternaEditable(linea('fold', { foldOptions: { direction: 'mountain', creaseAngleDeg: 180, pleatId: 'pl' } }))).toBe(false);
  });

  it('Supr sobre un tramo se lleva entera solo la línea de hilo y la pinza', () => {
    expect(seBorraEntera('grainline')).toBe(true);
    expect(seBorraEntera('dart')).toBe(true);
    for (const t of ['reference', 'fold', 'topstitch', 'seam', 'pleat'] as const) expect(seBorraEntera(t), t).toBe(false);
  });

  it('internasEditables filtra en orden de pintado', () => {
    const p = { ...pieza(), internals: [linea('reference'), linea('notch'), linea('grainline')] } as PatternPiece;
    expect(internasEditables(p).map(l => l.id)).toEqual(['reference', 'grainline']);
  });
});

describe('conPaths y la copia de las pinzas (spec § 7)', () => {
  const pinza: InternalLine = {
    id: 'd', type: 'dart', dartOptions: { capShape: 'pointed' },
    path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 50] }, { type: 'L', values: [20, 0] }],
  };
  function conPinza(): PatternPiece {
    const base = { ...pieza(), internals: [pinza] } as PatternPiece;
    const darts = extractDarts(base).map(d => ({ ...d, foldDirection: 'toward-center' as const }));
    return { ...base, darts };
  }
  const apexMasHondo: PathCommand[] = [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [10, 60] }, { type: 'L', values: [20, 0] },
  ];

  it('mover la punta en Q relee la pinza y conserva lo que no es dibujo', () => {
    const r = conPaths(conPinza(), new Map([[claveDeInterna('d'), apexMasHondo]]));
    expect(r.darts![0].apex).toEqual({ x: 10, y: 60 });
    expect(r.darts![0].foldDirection).toBe('toward-center');
    expect(r.darts![0].capShape).toBe('pointed');
  });

  it('una operación de pinza después no revierte la edición (Review Focus 5)', () => {
    const r = conPaths(conPinza(), new Map([[claveDeInterna('d'), apexMasHondo]]));
    const internals = applyDartsToInternals(r, r.darts!);
    const puntos = internals[0].path.map(c => c.values.slice(-2));
    expect(puntos).toContainEqual([10, 60]);
  });

  it('quitar la línea de una pinza la quita de la copia; una pinza sin línea se queda', () => {
    const sinLinea = { id: 'suelta', intake: 5, apex: { x: 0, y: 0 }, legs: [[], []] as [[], []], foldDirection: 'left' as const };
    const base = conPinza();
    const r = conPaths({ ...base, darts: [...base.darts!, sinLinea] }, new Map([[claveDeInterna('d'), null]]));
    expect(r.darts!.map(d => d.id)).toEqual(['suelta']);
  });
});
```

- [ ] **Step 2: comprobar que fallan**

Run: `npx vitest run src/components/PatternEditor/__tests__/lineaEditable.test.ts`
Expected: FAIL — `esInternaEditable`, `seBorraEntera`, `internasEditables` no existen; las pinzas no se refrescan.

- [ ] **Step 3: la lista en `types.ts`**

Justo después de `seSeleccionaPorTramo`:

```ts
/**
 * Las internas que Editar patrón edita punto a punto (spec 2026-09-24 § 3.2):
 * las de forma propia. Fuera, las que se calculan desde otra cosa y cuya
 * edición se perdería sola: el piquete, que se re-ancla al borde
 * (`notchAnchor`), y el doblez que genera un pliegue, que `updatePleat`
 * regenera.
 *
 * Una sola lista para lo que se pinta, lo que se agarra y lo que engancha: si
 * divergen, pasa lo de #1103 (887 agarrables contra 40 pintados).
 */
export function esInternaEditable(line: InternalLine): boolean {
  return line.type !== 'notch' && !line.foldOptions?.pleatId;
}

/**
 * Supr sobre un tramo de estas se lleva la línea entera (spec § 4.6): la línea
 * de hilo y la pinza son entidades y no se parten.
 */
export function seBorraEntera(type: InternalLineType): boolean {
  return type === 'grainline' || type === 'dart';
}
```

- [ ] **Step 4: `refrescarPinzas`**

En `src/utils/dartEntity.ts`, después de `extractDarts`:

```ts
/**
 * La copia `piece.darts` al día con sus líneas (spec 2026-09-24 § 7).
 *
 * Una pinza cuya línea cambió se vuelve a leer de ella, conservando lo que no
 * es dibujo: `foldDirection`, `capShape` y `edgeId`. Una que ya no se lee como
 * pinza (se aplanó al moverla) sale de la copia; `applyDartsToInternals`
 * preserva su línea (#1020), así que no se pierde nada. Una cuya línea se
 * quitó (`quitadas`) sale también. Una pinza sin línea —nacida de una
 * operación— se queda como estaba.
 *
 * Sin esto, la siguiente operación de pinza leería la copia vieja y la
 * escribiría de vuelta: la edición de Q desaparecería sin aviso (#1016).
 */
export function refrescarPinzas(
  darts: Dart[],
  internals: InternalLine[],
  edges?: SemanticEdge[],
  quitadas: ReadonlySet<string> = new Set(),
): Dart[] {
  const lineas = new Map(internals.filter(l => l.type === 'dart').map(l => [l.id, l]));
  return darts.flatMap(dart => {
    if (quitadas.has(dart.id)) return [];
    const line = lineas.get(dart.id);
    if (!line) return [dart];
    const leida = extractDartFromInternal(line, edges);
    if (!leida) return [];
    return [{
      ...leida,
      foldDirection: dart.foldDirection,
      capShape: dart.capShape ?? leida.capShape,
      edgeId: dart.edgeId ?? leida.edgeId,
    }];
  });
}
```

- [ ] **Step 5: `lineaEditable.ts`**

Imports nuevos:

```ts
import { esInternaEditable, type InternalLine } from '../../types/types';
import { refrescarPinzas } from '../../utils/dartEntity';
```

Añade debajo de `pathDeLinea`:

```ts
/** Las internas que Q edita en esta pieza, en orden de pintado (la última, encima). */
export function internasEditables(piece: PatternPiece): InternalLine[] {
  return piece.internals.filter(esInternaEditable);
}
```

Y sustituye `conPaths` por la versión que lleva las pinzas al día (el JSDoc gana una línea: *«Si la pieza guarda la copia `darts`, se refresca con `refrescarPinzas` (§ 7).»*):

```ts
export function conPaths(
  piece: PatternPiece,
  cambios: ReadonlyMap<ClaveLinea, PathCommand[] | null>,
): PatternPiece {
  const contorno = cambios.get(CLAVE_CONTORNO) ?? null;
  let internals = piece.internals;
  const quitadas = new Set<string>();
  const tocaInternas = [...cambios.keys()].some(k => k !== CLAVE_CONTORNO);
  if (tocaInternas) {
    internals = internals.flatMap(line => {
      const clave = claveDeInterna(line.id);
      if (!cambios.has(clave)) return [line];
      const path = cambios.get(clave);
      if (!path) {
        quitadas.add(line.id);
        return [];
      }
      return [{ ...line, path }];
    });
  }
  const r: PatternPiece = contorno
    ? {
        ...piece,
        position: compensatePositionForPivotChange(piece, contorno),
        outline: contorno,
        internals: reanchorNotches(internals, contorno, piece.outline),
        updatedAt: Date.now(),
      }
    : { ...piece, internals, updatedAt: Date.now() };
  if (tocaInternas && piece.darts) r.darts = refrescarPinzas(piece.darts, r.internals, piece.edges, quitadas);
  return r;
}
```

- [ ] **Step 6: comprobar que pasan**

Run: `npx vitest run src/components/PatternEditor/__tests__/lineaEditable.test.ts src/utils/__tests__ --reporter=dot`
Expected: PASS.

- [ ] **Step 7: tipos, lint y commit**

Run: `npx tsc -b --noEmit && npx eslint src/types/types.ts src/utils/dartEntity.ts src/components/PatternEditor/lineaEditable.ts src/components/PatternEditor/__tests__/lineaEditable.test.ts --max-warnings=0`

```bash
git add src/types/types.ts src/utils/dartEntity.ts src/components/PatternEditor/lineaEditable.ts src/components/PatternEditor/__tests__/lineaEditable.test.ts
git commit -m "feat(2d): qué internas edita Q, y la copia de las pinzas al día (frontera, fase 2)"
```

---

### Task 5: el estado de Q conoce las internas

**Files:**
- Create: `src/components/PatternEditor/estadoDeQ.ts`
- Create: `src/components/PatternEditor/__tests__/estadoDeQ.test.ts`
- Modify: `src/components/PatternEditor/useEditPattern.ts`
- Create: `src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx`

**Interfaces:**
- Consumes: `internasEditables`, `claveDeInterna`, `lineIdDeClave`, `CLAVE_CONTORNO`, `ClaveLinea`, `pathDeLinea`, `conPaths` (tareas 2 y 4); `extractNodes`, `extractNodesFromPath` (Tarea 1).
- Produces (en `estadoDeQ.ts`):
  - `interface EdicionDeInterna { lineId: string; path: PathCommand[]; nodes: EditableNode[]; selectedNodes: Set<number>; selectedSegments: Set<number>; hoveredNode: number | null; hoveredSegment: number | null; addPointPreview: Point2D | null }`
  - `interface EditPatternState` (la de hoy, más `internas?: EdicionDeInterna[]`); `INITIAL_STATE`; `SIN_INTERNAS`
  - `extraerInternas(piece)`, `estadoDeEntrada(piece)`, `resyncStateToPiece(state, piece)`
  - `interface VistaDeLinea { clave; path; nodes; selectedNodes; selectedSegments; hoveredNode; hoveredSegment; addPointPreview }`
  - `vistas(state, contorno?)`, `conLinea(state, clave, campos)`, `sinPuntos`, `sinTramos`, `sinSeleccion`, `sinHover`, `algoElegido`, `internaElegidaDe`, `hoverDe`, `refrescarLineas(state, piece, claves)`
  - `pathsEditables(piece)`, `mismosPaths(a, b)`
  - `interface ArrastreDeLinea` (se muda aquí desde el hook), `findFromNode(nodes, commandIndex)`, `arrastreDe(state, contorno, tipo)`
  - `marcoSelecciona(state, piece)`
- El hook re-exporta `EditPatternState` y `resyncStateToPiece` para los importadores de hoy, y devuelve `internas`.

- [ ] **Step 1: tests puros que fallan**

Crea `src/components/PatternEditor/__tests__/estadoDeQ.test.ts`:

```ts
/**
 * El estado de Q con sus internas (spec 2026-09-24 §§ 3-4): las operaciones
 * puras que dejan escribir los gestos una sola vez para cualquier línea.
 */
import { describe, it, expect } from 'vitest';
import type { InternalLine, PathCommand, PatternPiece } from '../../../types/types';
import {
  algoElegido, arrastreDe, conLinea, estadoDeEntrada, extraerInternas, hoverDe,
  internaElegidaDe, marcoSelecciona, mismosPaths, pathsEditables, refrescarLineas,
  resyncStateToPiece, sinHover, sinSeleccion, vistas,
} from '../estadoDeQ';
import { CLAVE_CONTORNO, claveDeInterna } from '../lineaEditable';

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
];
const ELE: InternalLine = {
  id: 'L', type: 'reference',
  path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] }],
};
const PIQUETE: InternalLine = { id: 'N', type: 'notch', path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 8] }] };
const PLIEGUE: InternalLine = {
  id: 'F', type: 'fold', foldOptions: { direction: 'valley', creaseAngleDeg: 180, pleatId: 'pl' },
  path: [{ type: 'M', values: [50, 0] }, { type: 'L', values: [50, 150] }],
};
const pieza = (internals: InternalLine[] = [ELE, PIQUETE, PLIEGUE]): PatternPiece => ({
  id: 'p', name: 'P', outline: RECT, position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  active: true, seamAllowance: 0, edges: [], internals,
} as unknown as PatternPiece);

describe('extraerInternas y estadoDeEntrada', () => {
  it('solo las editables, con sus nodos y nada elegido', () => {
    const internas = extraerInternas(pieza());
    expect(internas.map(i => i.lineId)).toEqual(['L']);
    expect(internas[0].nodes.map(n => n.position)).toEqual([{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 120 }]);
    expect(internas[0].selectedNodes.size).toBe(0);
  });

  it('entrar deja el contorno y las internas, en edición', () => {
    const s = estadoDeEntrada(pieza());
    expect(s.isEditing).toBe(true);
    expect(s.editingPieceId).toBe('p');
    expect(s.nodes).toHaveLength(4);
    expect(s.internas!.map(i => i.lineId)).toEqual(['L']);
  });
});

describe('vistas y conLinea', () => {
  it('el contorno primero, las internas después: el orden de pintado', () => {
    const v = vistas(estadoDeEntrada(pieza()), RECT);
    expect(v.map(l => l.clave)).toEqual([CLAVE_CONTORNO, claveDeInterna('L')]);
    expect(v[0].path).toBe(RECT);
  });

  it('conLinea cambia una línea y deja las otras', () => {
    const s = conLinea(estadoDeEntrada(pieza()), claveDeInterna('L'), { selectedNodes: new Set([1]) });
    expect([...s.internas![0].selectedNodes]).toEqual([1]);
    expect(s.selectedNodes.size).toBe(0);
    const t = conLinea(s, CLAVE_CONTORNO, { hoveredSegment: 2 });
    expect(t.hoveredSegment).toBe(2);
    expect([...t.internas![0].selectedNodes]).toEqual([1]);
  });

  it('sinSeleccion y sinHover limpian todas las líneas', () => {
    let s = conLinea(estadoDeEntrada(pieza()), claveDeInterna('L'), { selectedSegments: new Set([1]), hoveredNode: 0 });
    s = conLinea(s, CLAVE_CONTORNO, { selectedNodes: new Set([0]), hoveredSegment: 1 });
    expect(algoElegido(s)).toBe(true);
    const limpio = sinHover(sinSeleccion(s));
    expect(algoElegido(limpio)).toBe(false);
    expect(hoverDe(limpio)).toBeNull();
  });
});

describe('internaElegidaDe (spec § 3.5)', () => {
  const base = estadoDeEntrada(pieza());
  it('un tramo de una sola interna: la interna con su tramo', () => {
    expect(internaElegidaDe(conLinea(base, claveDeInterna('L'), { selectedSegments: new Set([2]) })))
      .toEqual({ lineId: 'L', segmentIndex: 2 });
  });
  it('puntos de una sola interna: la interna sin tramo', () => {
    expect(internaElegidaDe(conLinea(base, claveDeInterna('L'), { selectedNodes: new Set([1]) })))
      .toEqual({ lineId: 'L' });
  });
  it('el contorno, nada, o dos líneas: ninguna', () => {
    expect(internaElegidaDe(base)).toBeNull();
    expect(internaElegidaDe(conLinea(base, CLAVE_CONTORNO, { selectedNodes: new Set([0]) }))).toBeNull();
    const dos = conLinea(conLinea(base, CLAVE_CONTORNO, { selectedNodes: new Set([0]) }), claveDeInterna('L'), { selectedNodes: new Set([1]) });
    expect(internaElegidaDe(dos)).toBeNull();
  });
});

describe('refrescarLineas, resync y la identidad de los paths', () => {
  it('refrescarLineas relee nodos y path de las líneas tocadas y conserva lo elegido', () => {
    const s = conLinea(estadoDeEntrada(pieza()), claveDeInterna('L'), { selectedNodes: new Set([1]) });
    const nuevo: InternalLine = { ...ELE, path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 40] }, { type: 'L', values: [120, 120] }] };
    const p2 = pieza([nuevo, PIQUETE, PLIEGUE]);
    const r = refrescarLineas(s, p2, [claveDeInterna('L')]);
    expect(r.internas![0].path).toBe(nuevo.path);
    expect(r.internas![0].nodes[1].position).toEqual({ x: 120, y: 40 });
    expect([...r.internas![0].selectedNodes]).toEqual([1]);
  });

  it('resync relee las internas y suelta todo', () => {
    const s = conLinea(estadoDeEntrada(pieza()), claveDeInterna('L'), { selectedNodes: new Set([1]) });
    const r = resyncStateToPiece(s, pieza());
    expect(r.internas![0].selectedNodes.size).toBe(0);
  });

  it('pathsEditables: el contorno y las editables, sin piquetes ni pliegues', () => {
    const p = pieza();
    expect(pathsEditables(p)).toEqual([RECT, ELE.path]);
    expect(mismosPaths(pathsEditables(p), pathsEditables(p))).toBe(true);
    expect(mismosPaths(null, pathsEditables(p))).toBe(false);
  });
});

describe('arrastreDe y marcoSelecciona', () => {
  it('los puntos elegidos de cada línea, con su punto de partida', () => {
    let s = conLinea(estadoDeEntrada(pieza()), CLAVE_CONTORNO, { selectedNodes: new Set([1]) });
    s = conLinea(s, claveDeInterna('L'), { selectedNodes: new Set([2]) });
    const a = arrastreDe(s, RECT, 'node');
    expect([...a.keys()]).toEqual([CLAVE_CONTORNO, claveDeInterna('L')]);
    expect(a.get(claveDeInterna('L'))!.startPositions.get(2)).toEqual({ x: 120, y: 120 });
    expect(a.get(claveDeInterna('L'))!.startPath).toBe(ELE.path);
  });

  it('un tramo arrastra sus dos extremos', () => {
    const s = conLinea(estadoDeEntrada(pieza()), claveDeInterna('L'), { selectedSegments: new Set([1]) });
    const a = arrastreDe(s, RECT, 'segment').get(claveDeInterna('L'))!;
    expect([...a.startPositions.entries()]).toEqual([[1, { x: 120, y: 20 }], [0, { x: 20, y: 20 }]]);
  });

  it('el marco coge puntos del contorno y de las internas', () => {
    const s = { ...estadoDeEntrada(pieza()), marquee: { start: { x: -5, y: -5 }, current: { x: 130, y: 30 } } };
    const r = marcoSelecciona(s, pieza());
    expect([...r.selectedNodes]).toEqual([0]);
    expect([...r.internas![0].selectedNodes]).toEqual([0, 1]);
    expect(r.marquee).toBeNull();
  });
});
```

- [ ] **Step 2: comprobar que fallan**

Run: `npx vitest run src/components/PatternEditor/__tests__/estadoDeQ.test.ts`
Expected: FAIL — `Cannot find module '../estadoDeQ'`.

- [ ] **Step 3: el módulo**

Crea `src/components/PatternEditor/estadoDeQ.ts`:

```ts
/**
 * El estado de Editar patrón (`Q`) y las operaciones puras sobre sus líneas
 * (spec 2026-09-24 §§ 3-4).
 *
 * El contorno conserva los campos de siempre —`nodes`, `selectedNodes`,
 * `hoveredSegment`…—, que leen `PatternEditor`, el overlay y los tests de
 * antes. Cada interna editable lleva los mismos campos en `internas`, y
 * `vistas()` las enseña todas como una sola lista: así los gestos se escriben
 * una vez para cualquier línea (decisión 5 de la spec: una sola vía de
 * edición).
 *
 * Vive aparte de `useEditPattern.ts` para que el hook, sus tests y los módulos
 * puros compartan el vocabulario sin ciclos de importación.
 */
import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { extractNodes, extractNodesFromPath, type EditableNode } from './nodeEditorUtils';
import { pieceLocalToPattern } from './pieceTransform';
import {
  CLAVE_CONTORNO, claveDeInterna, internasEditables, lineIdDeClave, type ClaveLinea,
} from './lineaEditable';

// ─── Estado ───

export interface EdicionDeInterna {
  lineId: string;
  /** El path cuando se leyó: su identidad dice si la línea cambió desde fuera. */
  path: PathCommand[];
  nodes: EditableNode[];
  selectedNodes: Set<number>;
  selectedSegments: Set<number>;
  hoveredNode: number | null;
  hoveredSegment: number | null;
  addPointPreview: Point2D | null;
}

export interface EditPatternState {
  isEditing: boolean;
  editingPieceId: string | null;
  hoveredPieceId: string | null;
  nodes: EditableNode[];
  selectedNodes: Set<number>;       // commandIndex set (multi-select)
  selectedSegments: Set<number>;    // commandIndex of segment destination
  hoveredNode: number | null;       // commandIndex
  hoveredSegment: number | null;    // commandIndex
  addPointPreview: Point2D | null;  // preview dot on edge hover
  marquee: { start: Point2D; current: Point2D } | null;
  /**
   * Las internas editables de la pieza en edición —o bajo el ratón—, con los
   * mismos campos que el contorno (spec § 3.2). Opcional para que los estados
   * escritos a mano de los tests de antes sigan valiendo; ausente = ninguna.
   */
  internas?: EdicionDeInterna[];
}

export const SIN_INTERNAS: EdicionDeInterna[] = [];
const SIN_PATH: PathCommand[] = [];

export const INITIAL_STATE: EditPatternState = {
  isEditing: false,
  editingPieceId: null,
  hoveredPieceId: null,
  nodes: [],
  selectedNodes: new Set<number>(),
  selectedSegments: new Set<number>(),
  hoveredNode: null,
  hoveredSegment: null,
  addPointPreview: null,
  marquee: null,
  internas: SIN_INTERNAS,
};

/** Las internas editables de una pieza, sin nada elegido ni bajo el ratón. */
export function extraerInternas(piece: PatternPiece): EdicionDeInterna[] {
  return internasEditables(piece).map(line => ({
    lineId: line.id,
    path: line.path,
    nodes: extractNodesFromPath(line.path, piece.id),
    selectedNodes: new Set<number>(),
    selectedSegments: new Set<number>(),
    hoveredNode: null,
    hoveredSegment: null,
    addPointPreview: null,
  }));
}

/** Al entrar en una pieza: todas sus líneas, nada elegido. */
export function estadoDeEntrada(piece: PatternPiece): EditPatternState {
  return {
    isEditing: true,
    editingPieceId: piece.id,
    hoveredPieceId: null,
    nodes: extractNodes(piece),
    selectedNodes: new Set<number>(),
    selectedSegments: new Set<number>(),
    hoveredNode: null,
    hoveredSegment: null,
    addPointPreview: null,
    marquee: null,
    internas: extraerInternas(piece),
  };
}

/**
 * Rebuild overlay nodes from the piece's current outline after an EXTERNAL
 * change (undo/redo restoring project state), so the anchor dots never detach
 * from the path. Selections and transient hover state are cleared, not
 * remapped: command indices shift when an insert is undone, so a surviving
 * index would silently denote different geometry (and a Delete on it would
 * destroy a legitimate corner). Las internas se releen igual (spec § 4.7).
 */
export function resyncStateToPiece(
  state: EditPatternState,
  piece: PatternPiece,
): EditPatternState {
  return {
    ...state,
    nodes: extractNodes(piece),
    selectedNodes: new Set<number>(),
    selectedSegments: new Set<number>(),
    hoveredPieceId: null,
    hoveredNode: null,
    hoveredSegment: null,
    addPointPreview: null,
    marquee: null,
    internas: extraerInternas(piece),
  };
}

// ─── Las líneas como una sola lista ───

export interface VistaDeLinea {
  clave: ClaveLinea;
  path: PathCommand[];
  nodes: EditableNode[];
  selectedNodes: Set<number>;
  selectedSegments: Set<number>;
  hoveredNode: number | null;
  hoveredSegment: number | null;
  addPointPreview: Point2D | null;
}

/**
 * Todas las líneas del estado, el contorno primero: es el orden de pintado, y
 * la última interna es la de encima. `contorno` es el path de la pieza de hoy;
 * quien solo lee selección u hover puede omitirlo.
 */
export function vistas(state: EditPatternState, contorno: PathCommand[] = SIN_PATH): VistaDeLinea[] {
  return [
    {
      clave: CLAVE_CONTORNO,
      path: contorno,
      nodes: state.nodes,
      selectedNodes: state.selectedNodes,
      selectedSegments: state.selectedSegments,
      hoveredNode: state.hoveredNode,
      hoveredSegment: state.hoveredSegment,
      addPointPreview: state.addPointPreview,
    },
    ...(state.internas ?? SIN_INTERNAS).map(i => ({
      clave: claveDeInterna(i.lineId),
      path: i.path,
      nodes: i.nodes,
      selectedNodes: i.selectedNodes,
      selectedSegments: i.selectedSegments,
      hoveredNode: i.hoveredNode,
      hoveredSegment: i.hoveredSegment,
      addPointPreview: i.addPointPreview,
    })),
  ];
}

export type CamposDeLinea = Partial<Pick<VistaDeLinea,
  'selectedNodes' | 'selectedSegments' | 'hoveredNode' | 'hoveredSegment' | 'addPointPreview'>>;

/** El estado con los campos de UNA línea cambiados; las demás, intactas. */
export function conLinea(state: EditPatternState, clave: ClaveLinea, campos: CamposDeLinea): EditPatternState {
  const lineId = lineIdDeClave(clave);
  if (lineId === null) return { ...state, ...campos };
  return {
    ...state,
    internas: (state.internas ?? SIN_INTERNAS).map(i => (i.lineId === lineId ? { ...i, ...campos } : i)),
  };
}

const conTodas = (state: EditPatternState, campos: () => CamposDeLinea): EditPatternState => ({
  ...state,
  ...campos(),
  internas: state.internas?.map(i => ({ ...i, ...campos() })),
});

/** Ningún punto elegido en ninguna línea. */
export function sinPuntos(state: EditPatternState): EditPatternState {
  return conTodas(state, () => ({ selectedNodes: new Set<number>() }));
}

/** Ningún tramo elegido en ninguna línea. */
export function sinTramos(state: EditPatternState): EditPatternState {
  return conTodas(state, () => ({ selectedSegments: new Set<number>() }));
}

/** Nada elegido en ninguna línea. */
export function sinSeleccion(state: EditPatternState): EditPatternState {
  return sinTramos(sinPuntos(state));
}

/** Nada bajo el ratón en ninguna línea. */
export function sinHover(state: EditPatternState): EditPatternState {
  return conTodas(state, () => ({ hoveredNode: null, hoveredSegment: null, addPointPreview: null }));
}

export function algoElegido(state: EditPatternState): boolean {
  return vistas(state).some(v => v.selectedNodes.size > 0 || v.selectedSegments.size > 0);
}

/**
 * La interna que Q publica en `editor.selectedInternalLine` (spec § 3.5): la
 * única línea con algo elegido, si es una interna. Un tramo solo, con su
 * `segmentIndex`; puntos, la línea sin tramo. Nada, el contorno o varias
 * líneas: ninguna.
 */
export function internaElegidaDe(state: EditPatternState): { lineId: string; segmentIndex?: number } | null {
  const conAlgo = vistas(state).filter(v => v.selectedNodes.size > 0 || v.selectedSegments.size > 0);
  if (conAlgo.length !== 1) return null;
  const [v] = conAlgo;
  const lineId = lineIdDeClave(v.clave);
  if (lineId === null) return null;
  if (v.selectedNodes.size === 0 && v.selectedSegments.size === 1) {
    return { lineId, segmentIndex: [...v.selectedSegments][0] };
  }
  return { lineId };
}

/** Qué hay bajo el ratón, en cualquier línea: lo que decide el cursor. */
export function hoverDe(state: EditPatternState): { tipo: 'punto' | 'tramo'; conPreview: boolean } | null {
  for (const v of vistas(state)) {
    if (v.hoveredNode !== null) return { tipo: 'punto', conPreview: false };
    if (v.hoveredSegment !== null) return { tipo: 'tramo', conPreview: v.addPointPreview !== null };
  }
  return null;
}

/** Relee path y nodos de las líneas que cambió un verbo de Q, sin tocar lo elegido. */
export function refrescarLineas(
  state: EditPatternState,
  piece: PatternPiece,
  claves: Iterable<ClaveLinea>,
): EditPatternState {
  let next = state;
  for (const clave of claves) {
    const lineId = lineIdDeClave(clave);
    if (lineId === null) {
      next = { ...next, nodes: extractNodes(piece) };
      continue;
    }
    const line = piece.internals.find(l => l.id === lineId);
    if (!line) continue;
    next = {
      ...next,
      internas: (next.internas ?? SIN_INTERNAS).map(i => (i.lineId === lineId
        ? { ...i, path: line.path, nodes: extractNodesFromPath(line.path, piece.id) }
        : i)),
    };
  }
  return next;
}

// ─── La identidad de los paths: quién cambió qué ───

/**
 * Los paths que Q edita de una pieza, en orden. Su identidad dice si algo
 * cambió desde fuera (deshacer, el copiloto): si Q no lo escribió, se relee.
 * Un piquete o un doblez de pliegue no está aquí, así que cambiarlos no suelta
 * lo elegido.
 */
export function pathsEditables(piece: PatternPiece): PathCommand[][] {
  return [piece.outline, ...internasEditables(piece).map(l => l.path)];
}

export function mismosPaths(a: readonly PathCommand[][] | null, b: readonly PathCommand[][]): boolean {
  return !!a && a.length === b.length && a.every((p, i) => p === b[i]);
}

// ─── Arrastre ───

/** Lo que un gesto arrastra de UNA línea. */
export interface ArrastreDeLinea {
  /** El path de la línea al empezar el gesto: cada frame se calcula desde aquí. */
  startPath: PathCommand[];
  /** commandIndex → posición original. */
  startPositions: Map<number, Point2D>;
  /** Grupo de anclas coincidentes de cada punto arrastrado, en `startPath`. */
  groups?: Map<number, number[]>;
}

/**
 * Find the "from" node of a segment. The segment ends at `commandIndex`;
 * the "from" node is the previous node whose commandIndex < commandIndex.
 */
export function findFromNode(nodes: EditableNode[], commandIndex: number): EditableNode | null {
  let best: EditableNode | null = null;
  let bestIdx = -1;
  for (const node of nodes) {
    const ci = node.ref.commandIndex;
    if (ci < commandIndex && ci > bestIdx) {
      bestIdx = ci;
      best = node;
    }
  }
  return best;
}

/**
 * Lo que mueve un gesto que empieza con esta selección (spec § 4.1): los
 * puntos elegidos de cada línea, o los dos extremos de cada tramo elegido.
 * Un solo vector para todas.
 */
export function arrastreDe(
  state: EditPatternState,
  contorno: PathCommand[],
  tipo: 'node' | 'segment',
): Map<ClaveLinea, ArrastreDeLinea> {
  const out = new Map<ClaveLinea, ArrastreDeLinea>();
  for (const v of vistas(state, contorno)) {
    const startPositions = new Map<number, Point2D>();
    if (tipo === 'node') {
      for (const ci of v.selectedNodes) {
        const node = v.nodes.find(n => n.ref.commandIndex === ci);
        if (node) startPositions.set(ci, { ...node.position });
      }
    } else {
      for (const segIdx of v.selectedSegments) {
        const toIndex = v.path[segIdx]?.type === 'Z' ? 0 : segIdx;
        const toNode = v.nodes.find(n => n.ref.commandIndex === toIndex);
        if (toNode) startPositions.set(toIndex, { ...toNode.position });
        const fromNode = findFromNode(v.nodes, segIdx);
        if (fromNode && !startPositions.has(fromNode.ref.commandIndex)) {
          startPositions.set(fromNode.ref.commandIndex, { ...fromNode.position });
        }
      }
    }
    if (startPositions.size > 0) out.set(v.clave, { startPath: v.path, startPositions });
  }
  return out;
}

// ─── El marco de selección ───

/**
 * Resuelve el marco (spec § 4.1): coge los puntos de todas las líneas que caen
 * dentro, además de lo que ya había (con Shift). El marco es un rectángulo del
 * patrón; cada nodo se lleva a patrón con el giro de su pieza antes de probar.
 */
export function marcoSelecciona(state: EditPatternState, piece: PatternPiece): EditPatternState {
  if (!state.marquee) return state;
  const { start, current } = state.marquee;
  const minX = Math.min(start.x, current.x);
  const maxX = Math.max(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const maxY = Math.max(start.y, current.y);
  const dentro = (nodes: EditableNode[], ya: Set<number>): Set<number> => {
    const out = new Set(ya);
    for (const node of nodes) {
      const { x, y } = pieceLocalToPattern(node.position, piece);
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) out.add(node.ref.commandIndex);
    }
    return out;
  };
  return {
    ...state,
    marquee: null,
    selectedNodes: dentro(state.nodes, state.selectedNodes),
    internas: state.internas?.map(i => ({ ...i, selectedNodes: dentro(i.nodes, i.selectedNodes) })),
  };
}
```

- [ ] **Step 4: comprobar que pasan**

Run: `npx vitest run src/components/PatternEditor/__tests__/estadoDeQ.test.ts`
Expected: PASS.

- [ ] **Step 5: el test de hook que falla**

Crea `src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx`. Las tareas 8 y 9 le añaden sus `describe`.

```tsx
// @vitest-environment jsdom
/**
 * Editar patrón con internas (spec 2026-09-24, fase 2).
 *
 * María, 10-09 [10:05]: «el patrón lo puedo mover? no puedes editar las
 * internas, ok, así hay que arreglarlo».
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { restoreState, updateInternalLine } from '../../../store/projectSlice';
import editorReducer from '../../../store/editorSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import { undoMiddleware } from '../../../store/undoMiddleware';
import { useEditPattern } from '../useEditPattern';
import type { InternalLine, PathCommand, PatternPiece } from '../../../types/types';

afterEach(cleanup);

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
];
const ELE: InternalLine = {
  id: 'L', type: 'reference',
  path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] }],
};
const PIQUETE: InternalLine = { id: 'N', type: 'notch', path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 8] }] };

function pieza(internals: InternalLine[] = [ELE], extra: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'p', name: 'P', outline: RECT, position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, seamAllowance: 0, edges: [], internals, ...extra,
  } as unknown as PatternPiece;
}

/** zoom 1, pan 0, rect en el origen: pantalla === patrón. */
function montarQ(pieces: PatternPiece[]) {
  const store = configureStore({
    reducer: { project: projectReducer, editor: editorReducer, copilotUI: copilotUIReducer },
    middleware: (gdm) => gdm({ serializableCheck: false }).concat(undoMiddleware),
  });
  store.dispatch(restoreState({ ...store.getState().project, pieces }));
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useEditPattern(1, { x: 0, y: 0 }), { wrapper });
  const internaDe = (id: string) => store.getState().project.pieces[0].internals.find(l => l.id === id)!;
  return { store, hook, internaDe };
}

describe('el estado de Q conoce las internas', () => {
  it('al entrar lee sus internas editables, sin piquetes', () => {
    const { hook } = montarQ([pieza([ELE, PIQUETE])]);
    act(() => hook.result.current.enterEdit('p'));
    expect(hook.result.current.internas.map(i => i.lineId)).toEqual(['L']);
  });

  it('un cambio externo en una interna (deshacer, el copiloto) relee sus puntos', () => {
    const { store, hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    const nuevo: PathCommand[] = [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 50] }, { type: 'L', values: [120, 120] }];
    act(() => { store.dispatch(updateInternalLine({ pieceId: 'p', lineId: 'L', path: nuevo })); });
    expect(hook.result.current.internas[0].nodes[1].position).toEqual({ x: 120, y: 50 });
  });

  it('un cambio en un piquete no suelta lo elegido del contorno', () => {
    const { store, hook } = montarQ([pieza([ELE, PIQUETE])]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown({ button: 0, shiftKey: false, clientX: 200, clientY: 0, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } } as unknown as React.MouseEvent<SVGSVGElement>); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect([...hook.result.current.selectedNodes]).toEqual([1]);
    act(() => { store.dispatch(updateInternalLine({ pieceId: 'p', lineId: 'N', path: [{ type: 'M', values: [101, 0] }, { type: 'L', values: [101, 8] }] })); });
    expect([...hook.result.current.selectedNodes]).toEqual([1]);
  });
});
```

Run: `npx vitest run src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx`
Expected: FAIL — `hook.result.current.internas` es `undefined`.

- [ ] **Step 6: el hook usa `estadoDeQ`**

En `useEditPattern.ts`:

1. Borra las definiciones locales de `EditPatternState`, `INITIAL_STATE`, `resyncStateToPiece`, `findFromNode` y la interfaz `ArrastreDeLinea` de la Tarea 3. Impórtalas y re-exporta lo que ya importaban otros:

```ts
import {
  INITIAL_STATE, SIN_INTERNAS, estadoDeEntrada, extraerInternas, findFromNode,
  mismosPaths, pathsEditables, refrescarLineas, resyncStateToPiece,
  type ArrastreDeLinea, type EditPatternState,
} from './estadoDeQ';
import { pathDeLinea } from './lineaEditable';

export { resyncStateToPiece } from './estadoDeQ';
export type { EditPatternState } from './estadoDeQ';
```

2. Los dos refs de identidad del contorno pasan a identidad de **todos** los paths editables. Sustituye `expectedOutlineRef` y `seenOutlineRef` (declaración y JSDoc) por:

```ts
  /**
   * Los paths editables (contorno e internas, por identidad) que este hook
   * acaba de escribir. El resync trata un cambio de `pieces` como propio solo
   * si los paths del store SON estos: un booleano consumiría mal una
   * restauración externa que caiga en el mismo lote de React.
   */
  const expectedPathsRef = useRef<PathCommand[][] | null>(null);
  /** Los últimos paths editables (por identidad) de la pieza en edición. */
  const seenPathsRef = useRef<PathCommand[][] | null>(null);
```

3. En `escribirLineas` (Tarea 3), el cuerpo del `if (piece.id === editingPieceIdRef.current)` pasa a:

```ts
      if (piece.id === editingPieceIdRef.current) {
        expectedPathsRef.current = pathsEditables(updated);
        // (#1122) Si el verbo insertó o borró comandos —o quitó una línea—,
        // todo índice guardado corrió de sitio: misma limpieza que el deshacer
        // externo. Arrastrar y `moveNodeTo` mutan valores en el sitio, y hay un
        // contrato verde que EXIGE que la selección sobreviva a un arrastre.
        const estructural = [...cambios].some(([clave, path]) => {
          const antes = pathDeLinea(piece, clave);
          return !path || !antes || path.length !== antes.length;
        });
        setState(s => (estructural
          ? resyncStateToPiece(s, updated)
          : refrescarLineas(s, updated, cambios.keys())));
      }
```

y la línea `const newNodes = extractNodes(updated);` desaparece.

4. `enterEdit`: `seenOutlineRef.current = piece.outline; expectedOutlineRef.current = null;` pasa a `seenPathsRef.current = pathsEditables(piece); expectedPathsRef.current = null;`, y el `setState({...})` literal pasa a `setState(estadoDeEntrada(piece));`.

5. `enterEditActuando`: igual con los refs. En sus dos `setState({ isEditing: true, … })` literales añade `internas: extraerInternas(piece),`. (La Tarea 8 reescribe esta función entera.)

6. `exitEdit`: `expectedOutlineRef.current = null; seenOutlineRef.current = null;` pasa a `expectedPathsRef.current = null; seenPathsRef.current = null;`.

7. El efecto de resync sustituye sus cuatro líneas de identidad del contorno por:

```ts
    const paths = pathsEditables(piece);
    if (mismosPaths(seenPathsRef.current, paths)) return;
    seenPathsRef.current = paths;
    if (mismosPaths(expectedPathsRef.current, paths)) {
      expectedPathsRef.current = null;
      return;
    }
```

8. En el Supr de `handleKeyDown`, `expectedOutlineRef.current = outline;` pasa a `expectedPathsRef.current = pathsEditables(updated);` (va después de construir `updated`).

9. En el `return` del hook, justo debajo de `...state,`:

```ts
    /** Las internas editables de la pieza en edición o bajo el ratón (spec § 3.2). */
    internas: state.internas ?? SIN_INTERNAS,
```

- [ ] **Step 7: comprobar que pasan, y que lo de antes sigue igual**

Run: `npx vitest run src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx src/components/PatternEditor/__tests__/estadoDeQ.test.ts`
Expected: PASS.

Run: `npx vitest run src/components/PatternEditor --reporter=dot`
Expected: PASS (el test de `resyncStateToPiece` sigue construyendo su estado sin `internas`: el campo es opcional).

- [ ] **Step 8: tipos, lint y commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/PatternEditor/estadoDeQ.ts src/components/PatternEditor/useEditPattern.ts src/components/PatternEditor/__tests__/estadoDeQ.test.ts src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx --max-warnings=0`

```bash
git add src/components/PatternEditor/estadoDeQ.ts src/components/PatternEditor/useEditPattern.ts src/components/PatternEditor/__tests__/estadoDeQ.test.ts src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx
git commit -m "feat(2d): el estado de Q conoce las internas y las relee desde fuera (frontera, fase 2)"
```

---

### Task 6: `agarrar`, quién gana el clic

**Files:**
- Modify: `src/components/PatternEditor/nodeEditorUtils.ts` (`nearestSegment`, opción `cierre`)
- Create: `src/components/PatternEditor/agarreDeQ.ts`
- Create: `src/components/PatternEditor/__tests__/agarreDeQ.test.ts`

**Interfaces:**
- Consumes: `nearestSegment`, `EditableNode` (`./nodeEditorUtils`); `ANCHOR_MATCH_EPS_MM` (`./anchorRoles`); `ClaveLinea`, `CLAVE_CONTORNO` (Tarea 2).
- Produces:
  - `nearestSegment(point, outline, opciones?: { cierre?: boolean })`. Con `cierre: false` no mira el tramo de cierre; sin opciones, lo de siempre.
  - `interface LineaParaAgarre { clave: ClaveLinea; path: PathCommand[]; nodes: EditableNode[] }`. `VistaDeLinea` la cumple.
  - `type Agarre = { clave: ClaveLinea; tipo: 'punto'; commandIndex: number; distancia: number } | { clave: ClaveLinea; tipo: 'tramo'; commandIndex: number; t: number; point: Point2D; distancia: number }`
  - `agarrar(lineas: readonly LineaParaAgarre[], punto: Point2D, radio: number, elegida: ClaveLinea | null): Agarre | null`

- [ ] **Step 1: tests que fallan**

Crea `src/components/PatternEditor/__tests__/agarreDeQ.test.ts`:

```ts
/**
 * Quién gana el clic en Editar patrón (spec 2026-09-24 § 3.4). Todas las filas
 * son la misma idea del contrato del 08-09: lo que ya es sujeto gana.
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../types/types';
import { agarrar, type LineaParaAgarre } from '../agarreDeQ';
import { extractNodesFromPath } from '../nodeEditorUtils';
import { CLAVE_CONTORNO, claveDeInterna } from '../lineaEditable';

const linea = (clave: LineaParaAgarre['clave'], path: PathCommand[]): LineaParaAgarre =>
  ({ clave, path, nodes: extractNodesFromPath(path, 'p') });

const RECT = linea(CLAVE_CONTORNO, [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
]);
// De esquina a esquina: su primer punto coincide con el (0,0) del contorno.
const DIAG = linea(claveDeInterna('D'), [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 150] }]);
// Otra que arranca en la misma esquina, pintada encima.
const ARRIBA = linea(claveDeInterna('A'), [{ type: 'M', values: [0, 0] }, { type: 'L', values: [0, 80] }]);
const R = 8;

describe('agarrar', () => {
  it('un punto gana a un tramo dentro de 8 px', () => {
    expect(agarrar([RECT], { x: 3, y: 1 }, R, null)).toMatchObject({ tipo: 'punto', clave: CLAVE_CONTORNO, commandIndex: 0 });
  });

  it('en una esquina compartida gana el contorno si la interna no está elegida', () => {
    expect(agarrar([RECT, DIAG], { x: 1, y: 1 }, R, null)).toMatchObject({ tipo: 'punto', clave: CLAVE_CONTORNO });
  });

  it('… y la interna si está elegida', () => {
    expect(agarrar([RECT, DIAG], { x: 1, y: 1 }, R, claveDeInterna('D')))
      .toMatchObject({ tipo: 'punto', clave: claveDeInterna('D'), commandIndex: 0 });
  });

  it('dos internas en el mismo punto: la elegida; sin elegida, la de encima', () => {
    expect(agarrar([DIAG, ARRIBA], { x: 1, y: 1 }, R, claveDeInterna('D'))).toMatchObject({ clave: claveDeInterna('D') });
    expect(agarrar([DIAG, ARRIBA], { x: 1, y: 1 }, R, null)).toMatchObject({ clave: claveDeInterna('A') });
  });

  it('dos tramos: el más cercano', () => {
    // (100,78) está a 3 mm de la diagonal (en y=75 a x=100) y a 72 del borde de arriba.
    expect(agarrar([RECT, DIAG], { x: 100, y: 78 }, R, null)).toMatchObject({ tipo: 'tramo', clave: claveDeInterna('D') });
  });

  it('dos tramos que empatan: el elegido; sin elegido, el de encima', () => {
    const sobreElBorde = linea(claveDeInterna('B'), [{ type: 'M', values: [50, 0] }, { type: 'L', values: [150, 0] }]);
    expect(agarrar([RECT, sobreElBorde], { x: 100, y: 2 }, R, CLAVE_CONTORNO)).toMatchObject({ clave: CLAVE_CONTORNO });
    expect(agarrar([RECT, sobreElBorde], { x: 100, y: 2 }, R, null)).toMatchObject({ clave: claveDeInterna('B') });
  });

  // Una L abierta: (50,50) → (150,50) → (150,120). Su «cierre» de (150,120) a
  // (50,50) no está dibujado.
  const ele = linea(claveDeInterna('E'), [{ type: 'M', values: [50, 50] }, { type: 'L', values: [150, 50] }, { type: 'L', values: [150, 120] }]);

  it('el cierre fantasma de una línea abierta no es un tramo', () => {
    // (100,85) cae justo sobre ese cierre, y lejos de los dos tramos reales.
    expect(agarrar([ele], { x: 100, y: 85 }, R, null)).toBeNull();
  });

  it('… ni tapa a un tramo real que está más lejos que él', () => {
    // (143,112) está a 2,5 del cierre fantasma y a 7 del tramo que baja: gana el real.
    expect(agarrar([ele], { x: 143, y: 112 }, R, null)).toMatchObject({ tipo: 'tramo', commandIndex: 2 });
  });

  it('lejos de todo: nada', () => {
    expect(agarrar([RECT, DIAG], { x: 500, y: 500 }, R, null)).toBeNull();
  });
});
```

- [ ] **Step 2: comprobar que fallan**

Run: `npx vitest run src/components/PatternEditor/__tests__/agarreDeQ.test.ts`
Expected: FAIL — `Cannot find module '../agarreDeQ'`.

- [ ] **Step 3: `nearestSegment` sin cierre, cuando no lo hay**

Hoy `nearestSegment` mira siempre el tramo de cierre. En una línea abierta lo devuelve en el índice de su `M`, y quien llama lo tiene que descartar. Pero si ese fantasma es el más cercano, tapa a un tramo real que también estaba dentro del radio. En `nodeEditorUtils.ts`, la firma gana una opción y el bloque del cierre queda condicionado:

```ts
export function nearestSegment(
  point: Point2D,
  outline: PathCommand[],
  opciones: { cierre?: boolean } = {},
): SegmentHit | null {
```

y el bloque `// Check closing segment: last anchor back to first anchor` entero (desde `const first = anchors[0];` hasta el `if (!bestHit || closingHit.distance < bestHit.distance) { … }`) va dentro de:

```ts
  // Una línea abierta no tiene cierre (spec 2026-09-24 § 3.4): pedirlo con
  // `cierre: false` evita que el fantasma tape un tramo real.
  if (opciones.cierre !== false) {
    // … el bloque de hoy, sin cambios …
  }
```

Sin opciones es lo de siempre, así que ningún llamador de hoy cambia.

- [ ] **Step 4: el módulo**

Crea `src/components/PatternEditor/agarreDeQ.ts`:

```ts
/**
 * Qué agarra un press en Editar patrón (spec 2026-09-24 § 3.4).
 *
 * Todas las reglas son la misma idea del contrato del 08-09 § 2.2: lo que ya
 * es sujeto gana. Por eso el clic se puede predecir sin aprender nada nuevo.
 *
 * - Un punto gana a un tramo dentro del radio.
 * - Entre puntos, el más cercano. Si coinciden (la misma coordenada): la
 *   interna elegida, luego el contorno, luego la interna de encima (decisión 4).
 * - Entre tramos, el más cercano. Si empatan: el elegido, luego el de encima.
 * - Una línea abierta no tiene tramo de cierre: ni se agarra, ni tapa a un
 *   tramo real que esté más lejos que él.
 */
import type { PathCommand, Point2D } from '../../types/types';
import { nearestSegment, type EditableNode } from './nodeEditorUtils';
import { ANCHOR_MATCH_EPS_MM } from './anchorRoles';
import { CLAVE_CONTORNO, type ClaveLinea } from './lineaEditable';

export interface LineaParaAgarre {
  clave: ClaveLinea;
  path: PathCommand[];
  nodes: EditableNode[];
}

export type Agarre =
  | { clave: ClaveLinea; tipo: 'punto'; commandIndex: number; distancia: number }
  | { clave: ClaveLinea; tipo: 'tramo'; commandIndex: number; t: number; point: Point2D; distancia: number };

/** Desempate entre puntos que coinciden: menor gana. `i` es el orden de pintado. */
function rangoDePunto(clave: ClaveLinea, i: number, total: number, elegida: ClaveLinea | null): number {
  if (clave === elegida) return 0;
  if (clave === CLAVE_CONTORNO) return 1;
  return 2 + (total - 1 - i);
}

/** Desempate entre tramos que empatan: el elegido, luego de arriba abajo. */
function rangoDeTramo(clave: ClaveLinea, i: number, total: number, elegida: ClaveLinea | null): number {
  if (clave === elegida) return 0;
  return 1 + (total - 1 - i);
}

/**
 * `lineas` en orden de pintado: el contorno primero, la última interna encima.
 * `punto` y `radio`, en el marco local de la pieza. `elegida`, la interna
 * elegida (`editor.selectedInternalLine`), si la hay.
 */
export function agarrar(
  lineas: readonly LineaParaAgarre[],
  punto: Point2D,
  radio: number,
  elegida: ClaveLinea | null,
): Agarre | null {
  let mejorPunto: { agarre: Agarre; pos: Point2D; rango: number } | null = null;
  lineas.forEach((linea, i) => {
    for (const node of linea.nodes) {
      const d = Math.hypot(punto.x - node.position.x, punto.y - node.position.y);
      if (d >= radio) continue;
      const rango = rangoDePunto(linea.clave, i, lineas.length, elegida);
      const coincide = mejorPunto !== null
        && Math.hypot(node.position.x - mejorPunto.pos.x, node.position.y - mejorPunto.pos.y) <= ANCHOR_MATCH_EPS_MM;
      const gana = mejorPunto === null
        || (coincide ? rango < mejorPunto.rango : d < mejorPunto.agarre.distancia);
      if (gana) {
        mejorPunto = {
          agarre: { clave: linea.clave, tipo: 'punto', commandIndex: node.ref.commandIndex, distancia: d },
          pos: node.position,
          rango,
        };
      }
    }
  });
  if (mejorPunto) return (mejorPunto as { agarre: Agarre }).agarre;

  let mejorTramo: { agarre: Agarre; rango: number } | null = null;
  lineas.forEach((linea, i) => {
    const hit = nearestSegment(punto, linea.path, { cierre: linea.path.some(c => c.type === 'Z') });
    if (!hit || hit.distance >= radio) return;
    const rango = rangoDeTramo(linea.clave, i, lineas.length, elegida);
    const gana = mejorTramo === null
      || hit.distance < mejorTramo.agarre.distancia
      || (hit.distance === mejorTramo.agarre.distancia && rango < mejorTramo.rango);
    if (gana) {
      mejorTramo = {
        agarre: {
          clave: linea.clave, tipo: 'tramo', commandIndex: hit.commandIndex,
          t: hit.t, point: hit.point, distancia: hit.distance,
        },
        rango,
      };
    }
  });
  return mejorTramo ? (mejorTramo as { agarre: Agarre }).agarre : null;
}
```

- [ ] **Step 5: comprobar que pasan, y que `nearestSegment` sigue igual para los de hoy**

Run: `npx vitest run src/components/PatternEditor/__tests__/agarreDeQ.test.ts src/components/PatternEditor/__tests__/useEditPattern.test.tsx src/components/PatternEditor/__tests__/1092-borde-de-cierre.test.ts`
Expected: PASS.

- [ ] **Step 6: tipos, lint y commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/PatternEditor/nodeEditorUtils.ts src/components/PatternEditor/agarreDeQ.ts src/components/PatternEditor/__tests__/agarreDeQ.test.ts --max-warnings=0`

```bash
git add src/components/PatternEditor/nodeEditorUtils.ts src/components/PatternEditor/agarreDeQ.ts src/components/PatternEditor/__tests__/agarreDeQ.test.ts
git commit -m "feat(2d): agarrar — quién gana el clic en Q con contorno e internas (frontera, fase 2)"
```

---

### Task 7: Supr quita solo lo que se ve, también en Z

**Files:**
- Modify: `src/components/PatternEditor/lineaEditable.ts` (`quitarPuntos`, `quitarTramos`)
- Modify: `src/components/PatternEditor/__tests__/lineaEditable.test.ts`
- Modify: `src/store/projectSlice.ts` (reductor `removeTramosDeInterna` junto a `removeInternalLine`, y su export ~línea 1708)
- Modify: `src/store/undoMiddleware.ts` (`ACTION_LABELS`)
- Modify: `src/store/borradoDeSeleccion.ts`
- Modify: `src/hooks/useKeyboardShortcuts.ts` y `src/components/shell/LogoMenu.tsx` (caso `'internalLine'`)
- Create: `src/store/__tests__/removeTramosDeInterna.test.ts`

**Interfaces:**
- Produces:
  - `quitarPuntos(path: PathCommand[], indices: ReadonlySet<number>, esContorno: boolean): PathCommand[] | null | 'insuficiente'`
  - `quitarTramos(path: PathCommand[], tramos: ReadonlySet<number>): PathCommand[][]`. Si ningún índice es un tramo, devuelve `[path]` con la **misma** referencia.
  - acción `removeTramosDeInterna({ pieceId: string; lineId: string; segmentIndices: number[] })`
  - `EstadoParaBorrado.selectedInternalLine: { pieceId: string; lineId: string; segmentIndex?: number } | null`; el `SujetoBorrable` `'internalLine'` gana `segmentIndex?: number`.

- [ ] **Step 1: tests puros que fallan**

Añade a `src/components/PatternEditor/__tests__/lineaEditable.test.ts` (import de `quitarPuntos`, `quitarTramos`):

```ts
const P = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });
const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });
const anclas = (path: PathCommand[]) => path.filter(c => c.type !== 'Z').map(c => c.values.slice(-2));

describe('quitarPuntos (spec § 4.6)', () => {
  const abierta = [M(0, 0), P(100, 0), P(100, 100)];
  const cerrada = [M(0, 0), P(100, 0), P(100, 100), { type: 'Z', values: [] } as PathCommand];

  it('una abierta pierde el punto y sus vecinos se unen', () => {
    expect(anclas(quitarPuntos(abierta, new Set([1]), false) as PathCommand[])).toEqual([[0, 0], [100, 100]]);
  });
  it('quitar la M promueve el siguiente a M', () => {
    const r = quitarPuntos(abierta, new Set([0]), false) as PathCommand[];
    expect(r[0].type).toBe('M');
    expect(anclas(r)).toEqual([[100, 0], [100, 100]]);
  });
  it('una abierta que se queda con un punto deja de existir', () => {
    expect(quitarPuntos([M(0, 0), P(100, 0)], new Set([1]), false)).toBeNull();
  });
  it('una cerrada o el contorno necesitan tres: si no llegan, insuficiente', () => {
    expect(quitarPuntos(cerrada, new Set([1]), false)).toBe('insuficiente');
    expect(quitarPuntos(cerrada, new Set([1]), true)).toBe('insuficiente');
  });
  it('gemelas: quitar el grupo entero no deja un gemelo (Review Focus 1)', () => {
    const gemelas = [M(0, 0), P(100, 0), P(100, 0), P(100, 100)];
    expect(anclas(quitarPuntos(gemelas, new Set([1, 2]), false) as PathCommand[])).toEqual([[0, 0], [100, 100]]);
  });
});

describe('quitarTramos (spec § 4.6)', () => {
  const tres = [M(0, 0), P(100, 0), P(100, 100), P(0, 100)];
  const cuadradoCerrado = [M(0, 0), P(100, 0), P(100, 100), P(0, 100), { type: 'Z', values: [] } as PathCommand];

  it('el tramo del medio parte la línea en dos', () => {
    expect(quitarTramos(tres, new Set([2])).map(anclas)).toEqual([[[0, 0], [100, 0]], [[100, 100], [0, 100]]]);
  });
  it('el primero o el último la acortan', () => {
    expect(quitarTramos(tres, new Set([1])).map(anclas)).toEqual([[[100, 0], [100, 100], [0, 100]]]);
    expect(quitarTramos(tres, new Set([3])).map(anclas)).toEqual([[[0, 0], [100, 0], [100, 100]]]);
  });
  it('el único tramo de una línea de dos puntos: no queda nada', () => {
    expect(quitarTramos([M(0, 0), P(100, 0)], new Set([1]))).toEqual([]);
  });
  it('en una cerrada, el primer tramo quitado la abre en una sola línea (Review Focus 3)', () => {
    const r = quitarTramos(cuadradoCerrado, new Set([2]));
    expect(r.map(anclas)).toEqual([[[100, 100], [0, 100], [0, 0], [100, 0]]]);
    expect(r[0].some(c => c.type === 'Z')).toBe(false);
  });
  it('el cierre es un tramo más: quitarlo abre la forma por ahí', () => {
    expect(quitarTramos(cuadradoCerrado, new Set([4])).map(anclas)).toEqual([[[0, 0], [100, 0], [100, 100], [0, 100]]]);
  });
  it('un índice que no es tramo no cambia nada: la misma referencia', () => {
    const r = quitarTramos(tres, new Set([0]));
    expect(r).toHaveLength(1);
    expect(r[0]).toBe(tres);
  });
  it('conserva las curvas', () => {
    const curva = [M(0, 0), { type: 'C', values: [30, -20, 70, -20, 100, 0] } as PathCommand, P(200, 0)];
    expect(quitarTramos(curva, new Set([2]))[0][1]).toEqual(curva[1]);
  });
});
```

- [ ] **Step 2: comprobar que fallan**

Run: `npx vitest run src/components/PatternEditor/__tests__/lineaEditable.test.ts`
Expected: FAIL — `quitarPuntos` y `quitarTramos` no existen.

- [ ] **Step 3: las dos funciones**

En `lineaEditable.ts`, import:

```ts
import { coincidentAnchorGroups, deletePoint, getAnchor } from './nodeEditorUtils';
```

Y al final:

```ts
/**
 * Quita puntos de una línea (spec 2026-09-24 § 4.6).
 *
 * El contorno y una interna cerrada necesitan tres anclas: si no llegan,
 * `'insuficiente'` y no se toca nada (el todo o nada de siempre). Una línea
 * abierta que se queda con una sola ancla deja de existir: `null`, como ya
 * hacen los trazos (spec de trazos § 5.4). Las gemelas cuentan como una.
 */
export function quitarPuntos(
  path: PathCommand[],
  indices: ReadonlySet<number>,
  esContorno: boolean,
): PathCommand[] | null | 'insuficiente' {
  const cerrada = esContorno || path.some(c => c.type === 'Z');
  const restantes = path.filter((_, i) => !indices.has(i));
  const anclasRestantes = coincidentAnchorGroups(restantes).size;
  if (cerrada) {
    if (anclasRestantes < 3) return 'insuficiente';
    let out = path;
    for (const i of [...indices].sort((a, b) => b - a)) out = deletePoint(out, i);
    return out;
  }
  if (anclasRestantes < 2) return null;
  const out = restantes.map(c => ({ ...c, values: [...c.values] }));
  if (out[0] && out[0].type !== 'M') {
    const a = getAnchor(out[0]);
    if (a) {
      out[0] = {
        ...(out[0].authoredAnchor ? { authoredAnchor: true as const } : {}),
        type: 'M',
        values: [a.x, a.y],
      };
    }
  }
  return out;
}

/**
 * Quita tramos de una línea y devuelve lo que queda, en trozos abiertos de al
 * menos dos anclas (spec § 4.6: *"Supr borra solo BC"*). El tramo `k` es el que
 * llega al comando `k`; en una línea cerrada, el cierre es el tramo del índice
 * de su `Z`. El primer tramo quitado de una cerrada la abre por ahí: el trozo
 * empieza en el ancla a la que llegaba y da la vuelta.
 *
 * Si ningún índice es un tramo, devuelve `[path]` con la MISMA referencia: el
 * reductor lo usa para no ensuciar el proyecto con un paso de deshacer vacío.
 */
export function quitarTramos(path: PathCommand[], tramos: ReadonlySet<number>): PathCommand[][] {
  const copia = (c: PathCommand): PathCommand => ({ ...c, values: [...c.values] });
  const idxAnclas: number[] = [];
  path.forEach((c, i) => { if (c.type !== 'Z' && getAnchor(c)) idxAnclas.push(i); });
  if (idxAnclas.length < 2) return [path];
  const zIndex = path.findIndex(c => c.type === 'Z');
  const primera = getAnchor(path[idxAnclas[0]])!;

  // Los tramos en orden de recorrido: cada uno con el comando que llega.
  const secuencia: { indice: number; llega: PathCommand }[] = idxAnclas.slice(1).map(i => ({ indice: i, llega: path[i] }));
  if (zIndex >= 0) secuencia.push({ indice: zIndex, llega: { type: 'L', values: [primera.x, primera.y] } });
  if (!secuencia.some(t => tramos.has(t.indice))) return [path];

  let inicio = primera;
  let orden = secuencia;
  if (zIndex >= 0) {
    const k = secuencia.findIndex(t => tramos.has(t.indice));
    inicio = getAnchor(secuencia[k].llega)!;
    orden = [...secuencia.slice(k + 1), ...secuencia.slice(0, k)];
  }

  const trozos: PathCommand[][] = [];
  let actual: PathCommand[] = [{ type: 'M', values: [inicio.x, inicio.y] }];
  for (const t of orden) {
    if (tramos.has(t.indice)) {
      if (actual.length >= 2) trozos.push(actual);
      const a = getAnchor(t.llega)!;
      actual = [{ type: 'M', values: [a.x, a.y] }];
    } else {
      actual.push(copia(t.llega));
    }
  }
  if (actual.length >= 2) trozos.push(actual);
  return trozos;
}
```

Run: `npx vitest run src/components/PatternEditor/__tests__/lineaEditable.test.ts`
Expected: PASS.

- [ ] **Step 4: tests del reductor y del sujeto que fallan**

Crea `src/store/__tests__/removeTramosDeInterna.test.ts`:

```ts
/**
 * Supr sobre un tramo de interna quita SOLO ese tramo (spec 2026-09-24 § 4.6;
 * contrato 08-09 § 5), por el mismo reductor desde Q y desde Z.
 */
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { restoreState, removeTramosDeInterna } from '../projectSlice';
import { resolverBorrado } from '../borradoDeSeleccion';
import type { InternalLine, PatternPiece } from '../../types/types';

const ELE: InternalLine = {
  id: 'L', type: 'fold', foldOptions: { direction: 'mountain', creaseAngleDeg: 180 },
  path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }],
};
function montar(internals: InternalLine[] = [ELE]) {
  const store = configureStore({ reducer: { project: projectReducer } });
  const piece = {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, seamAllowance: 0,
    outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 200] }, { type: 'Z', values: [] }],
    internals, edges: [],
  } as unknown as PatternPiece;
  store.dispatch(restoreState({ ...store.getState().project, pieces: [piece], isDirty: false }));
  return store;
}

describe('removeTramosDeInterna', () => {
  it('el tramo del medio parte la interna: el primer trozo conserva id, tipo y opciones', () => {
    const store = montar();
    store.dispatch(removeTramosDeInterna({ pieceId: 'p', lineId: 'L', segmentIndices: [2] }));
    const internas = store.getState().project.pieces[0].internals;
    expect(internas).toHaveLength(2);
    expect(internas[0].id).toBe('L');
    expect(internas[1].id).not.toBe('L');
    expect(internas.every(l => l.type === 'fold' && l.foldOptions?.direction === 'mountain')).toBe(true);
  });

  it('sin trozos, la interna se va', () => {
    const store = montar([{ ...ELE, path: ELE.path.slice(0, 2) }]);
    store.dispatch(removeTramosDeInterna({ pieceId: 'p', lineId: 'L', segmentIndices: [1] }));
    expect(store.getState().project.pieces[0].internals).toHaveLength(0);
  });

  it('un índice que no es tramo no ensucia el proyecto', () => {
    const store = montar();
    store.dispatch(removeTramosDeInterna({ pieceId: 'p', lineId: 'L', segmentIndices: [0] }));
    expect(store.getState().project.isDirty).toBe(false);
  });
});

describe('resolverBorrado lleva el tramo de la interna', () => {
  it('con tramo elegido, el sujeto trae su segmentIndex', () => {
    expect(resolverBorrado({
      activeTool: 'select', selectedPieceIds: ['p'], selectedSeamId: null, selectedPOMId: null,
      selectedInternalLine: { pieceId: 'p', lineId: 'L', segmentIndex: 2 },
      piezasBloqueadas: new Set(),
    })).toEqual({ kind: 'internalLine', pieceId: 'p', lineId: 'L', segmentIndex: 2 });
  });
});
```

Run: `npx vitest run src/store/__tests__/removeTramosDeInterna.test.ts`
Expected: FAIL — `removeTramosDeInterna` no existe; el tipo de `selectedInternalLine` no admite `segmentIndex`.

- [ ] **Step 5: reductor, etiqueta y sujeto**

En `projectSlice.ts`, import `import { quitarTramos } from '../components/PatternEditor/lineaEditable';` (junto al de `quitarTramo`), y debajo de `removeInternalLine`:

```ts
    /**
     * Supr sobre tramos de una interna (spec 2026-09-24 § 4.6): se quitan SOLO
     * esos tramos. El primer trozo conserva el id; los demás nacen con id nuevo
     * y el mismo tipo y opciones. Sin trozos, la interna se va. Un índice que
     * no es tramo no escribe nada (sin `isDirty`, sin paso de deshacer vacío).
     */
    removeTramosDeInterna(state, action: PayloadAction<{ pieceId: string; lineId: string; segmentIndices: number[] }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (!piece) return;
      const idx = piece.internals.findIndex(l => l.id === action.payload.lineId);
      if (idx < 0) return;
      const line = piece.internals[idx];
      const trozos = quitarTramos(line.path, new Set(action.payload.segmentIndices));
      if (trozos.length === 1 && trozos[0] === line.path) return;
      const nuevas = trozos.map((path, i) => (i === 0 ? { ...line, path } : { ...line, id: newId(), path }));
      piece.internals.splice(idx, 1, ...nuevas);
      piece.updatedAt = Date.now();
      state.isDirty = true;
    },
```

Añade `removeTramosDeInterna` a la lista de exports (junto a `addInternalLine, updateInternalLine, removeInternalLine, setInternalLine,`).

En `undoMiddleware.ts`, `ACTION_LABELS`, debajo de `'project/removeTramoDeTrazo'`:

```ts
  'project/removeTramosDeInterna': 'Borrar tramo',
```

En `borradoDeSeleccion.ts`:

```ts
  selectedInternalLine: { pieceId: string; lineId: string; segmentIndex?: number } | null;
```

```ts
  | { kind: 'internalLine'; pieceId: string; lineId: string; segmentIndex?: number }
```

(`resolverBorrado` ya devuelve `{ kind: 'internalLine', ...e.selectedInternalLine }`, así que el tramo viaja solo.)

- [ ] **Step 6: las dos puertas**

En `useKeyboardShortcuts.ts`, imports: `removeTramosDeInterna` de `../store/projectSlice`, y `seBorraEntera` de `../types/types`. El caso `'internalLine'` pasa a:

```ts
        case 'internalLine': {
          // Con un tramo elegido se va SOLO ese tramo (spec 2026-09-24 § 4.6):
          // lo que se ve es lo que se borra. El hilo y la pinza no se parten.
          const line = projectState.pieces.find(p => p.id === sujeto.pieceId)
            ?.internals.find(l => l.id === sujeto.lineId);
          if (sujeto.segmentIndex !== undefined && line && !seBorraEntera(line.type)) {
            pushJournal('gesture', 'interna:delete', {
              pieceId: sujeto.pieceId, lineId: sujeto.lineId, segmentIndex: sujeto.segmentIndex,
            });
            dispatch(removeTramosDeInterna({
              pieceId: sujeto.pieceId, lineId: sujeto.lineId, segmentIndices: [sujeto.segmentIndex],
            }));
          } else {
            dispatch(removeInternalLine({ pieceId: sujeto.pieceId, lineId: sujeto.lineId }));
          }
          dispatch(clearSelection());
          break;
        }
```

En `LogoMenu.tsx` va lo mismo con `project.pieces` y `d(...)`, y con el mismo comentario: *«Dos puertas, un solo registro»*.

- [ ] **Step 7: comprobar que pasan, y que las puertas de antes siguen**

Run: `npx vitest run src/store/__tests__/removeTramosDeInterna.test.ts src/store/__tests__/borrado-de-seleccion.test.ts src/shortcuts/__tests__/1158-trazo-supr-y-bitacora.test.tsx src/store/__tests__/projectSlice.trazos.test.ts`
Expected: PASS. Los casos de `borrado-de-seleccion` que eligen la interna **sin** tramo siguen borrándola entera.

- [ ] **Step 8: tipos, lint y commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/PatternEditor/lineaEditable.ts src/store/projectSlice.ts src/store/undoMiddleware.ts src/store/borradoDeSeleccion.ts src/hooks/useKeyboardShortcuts.ts src/components/shell/LogoMenu.tsx src/store/__tests__/removeTramosDeInterna.test.ts src/components/PatternEditor/__tests__/lineaEditable.test.ts --max-warnings=0`

```bash
git add src/components/PatternEditor/lineaEditable.ts src/components/PatternEditor/__tests__/lineaEditable.test.ts src/store/projectSlice.ts src/store/undoMiddleware.ts src/store/borradoDeSeleccion.ts src/hooks/useKeyboardShortcuts.ts src/components/shell/LogoMenu.tsx src/store/__tests__/removeTramosDeInterna.test.ts
git commit -m "feat(2d): Supr sobre un tramo de interna quita solo ese tramo, en Q y en Z (frontera, fase 2)"
```

---

### Task 8: los gestos de Q sobre las internas

Agarrar, arrastrar, el marco, Shift, el enganche, el hover, Esc y la interna elegida.

**Files:**
- Modify: `src/components/PatternEditor/useEditPattern.ts`
- Modify: `src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx`

**Interfaces:**
- Consumes: `agarrar`, `Agarre` (Tarea 6); `vistas`, `conLinea`, `sinPuntos`, `sinTramos`, `sinSeleccion`, `sinHover`, `algoElegido`, `internaElegidaDe`, `hoverDe`, `arrastreDe`, `marcoSelecciona`, `estadoDeEntrada`, `extraerInternas`, `INITIAL_STATE` (Tarea 5); `arrivingReferenceOnPath` (Tarea 1); `buildSnapIndex`, `resolveSnap`, `SnapIndex` (`./snapIndex`); `EDGE_HIT_PX` (`./gestureConstants`); `selectInternalLine`, `selectPiece` (`../../store/editorSlice`); `pushJournal`.
- Produces (retorno del hook):
  - `enganche: Point2D | null`, el punto de patrón al que engancha el arrastre;
  - `agarreEn(e: React.MouseEvent<SVGSVGElement>): Agarre | null`, lo que agarraría un press en la pieza en edición.

  Y en la caja negra: `edicion:agarre { objeto, linea, que, lineId? }` y `edicion:suelta { movio }`.

- [ ] **Step 1: tests que fallan**

Añade a `useEditPattern.internas.test.tsx` (imports extra: `selectInternalLine` de `../../../store/editorSlice`; `clearJournal`, `getJournal` de `../../../utils/telemetry/journal`; y un helper de evento):

```tsx
const ev = (x: number, y: number, shift = false) => ({
  button: 0, shiftKey: shift, clientX: x, clientY: y,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
} as unknown as React.MouseEvent<SVGSVGElement>);

const tecla = (type: 'keydown' | 'keyup') =>
  act(() => { window.dispatchEvent(new KeyboardEvent(type, { key: 'Shift', shiftKey: type === 'keydown' })); });
const dosVeces = () => { tecla('keydown'); tecla('keyup'); tecla('keydown'); };

const DIAG: InternalLine = { id: 'D', type: 'reference', path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 150] }] };
const anclasDe = (l: InternalLine) => l.path.filter(c => c.type !== 'Z').map(c => c.values.slice(-2));

function arrastrar(hook: ReturnType<typeof montarQ>['hook'], desde: [number, number], hasta: [number, number], shift = false) {
  act(() => { hook.result.current.handleMouseDown(ev(desde[0], desde[1], shift)); });
  act(() => { hook.result.current.handleMouseMove(ev(hasta[0], hasta[1], shift)); });
  act(() => { hook.result.current.handleMouseUp(); });
}

describe('agarrar y arrastrar una interna en Q', () => {
  it('un punto de una interna: se elige, se publica y se mueve solo él', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(120, 20)); });
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L' });
    act(() => { hook.result.current.handleMouseMove(ev(120, 40)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(anclasDe(internaDe('L'))).toEqual([[20, 20], [120, 40], [120, 120]]);
    expect(store.getState().project.pieces[0].outline).toEqual(RECT);
  });

  it('un tramo: se elige con su tramo y se trasladan sus dos extremos', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [70, 20], [70, 30]);
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L', segmentIndex: 1 });
    expect(anclasDe(internaDe('L'))).toEqual([[20, 30], [120, 30], [120, 120]]);
  });

  it('esquina compartida sin la interna elegida: se mueve la esquina, la interna no', () => {
    const { store, hook, internaDe } = montarQ([pieza([DIAG])]);
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [0, 0], [10, 5]);
    expect(store.getState().project.pieces[0].outline[0].values).toEqual([10, 5]);
    expect(anclasDe(internaDe('D'))[0]).toEqual([0, 0]);
  });

  it('… con la interna elegida, el mismo clic mueve su extremo', () => {
    const { store, hook, internaDe } = montarQ([pieza([DIAG])]);
    act(() => { store.dispatch(selectInternalLine({ pieceId: 'p', lineId: 'D' })); });
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [0, 0], [40, 30]);
    expect(anclasDe(internaDe('D'))[0]).toEqual([40, 30]);
    expect(store.getState().project.pieces[0].outline[0].values).toEqual([0, 0]);
  });

  it('el extremo engancha exacto a la esquina al acercarlo, y se ve el anillo', () => {
    const lejos: InternalLine = { ...DIAG, path: [{ type: 'M', values: [40, 30] }, { type: 'L', values: [200, 150] }] };
    const { hook, internaDe } = montarQ([pieza([lejos])]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(40, 30)); });
    act(() => { hook.result.current.handleMouseMove(ev(3, 2)); });
    expect(hook.result.current.enganche).toEqual({ x: 0, y: 0 });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(anclasDe(internaDe('D'))[0]).toEqual([0, 0]);
    expect(hook.result.current.enganche).toBeNull();
  });

  it('con Shift manda Shift: no engancha', () => {
    const lejos: InternalLine = { ...DIAG, path: [{ type: 'M', values: [40, 30] }, { type: 'L', values: [200, 150] }] };
    const { hook, internaDe } = montarQ([pieza([lejos])]);
    act(() => hook.result.current.enterEdit('p'));
    tecla('keydown');
    arrastrar(hook, [40, 30], [3, 2], true);
    tecla('keyup');
    expect(anclasDe(internaDe('D'))[0]).not.toEqual([0, 0]);
    expect(hook.result.current.enganche).toBeNull();
  });

  it('pieza girada con enganche: engancha a la esquina girada y guarda el local correcto (Review Focus 2)', () => {
    // Girada 180° sobre el centro de su caja (100,75): local (x,y) → patrón (200−x, 150−y).
    const lejos: InternalLine = { ...DIAG, path: [{ type: 'M', values: [40, 30] }, { type: 'L', values: [100, 100] }] };
    const { hook, internaDe } = montarQ([pieza([lejos], { rotation: 180 })]);
    act(() => hook.result.current.enterEdit('p'));
    // Su extremo local (40,30) se ve en (160,120); la esquina local (0,0) se ve en (200,150).
    act(() => { hook.result.current.handleMouseDown(ev(160, 120)); });
    act(() => { hook.result.current.handleMouseMove(ev(197, 148)); });
    act(() => { hook.result.current.handleMouseUp(); });
    const [x, y] = anclasDe(internaDe('D'))[0];
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
  });

  it('pieza girada: el punto va adonde va el puntero', () => {
    const { hook, internaDe } = montarQ([pieza([ELE], { rotation: 180 })]);
    act(() => hook.result.current.enterEdit('p'));
    // ELE (120,20) local se ve en (80,130). +10 en pantalla hacia la derecha → local (110,20).
    arrastrar(hook, [80, 130], [90, 130]);
    const [x, y] = anclasDe(internaDe('L'))[1];
    expect(x).toBeCloseTo(110, 9);
    expect(y).toBeCloseTo(20, 9);
  });

  it('gemelas del DXF: agarrar una mueve el grupo entero (Review Focus 1)', () => {
    const gemelas: InternalLine = { ...ELE, path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] },
    ] };
    const { hook, internaDe } = montarQ([pieza([gemelas])]);
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [120, 20], [120, 30]);
    expect(anclasDe(internaDe('L'))).toEqual([[20, 20], [120, 30], [120, 30], [120, 120]]);
  });

  it('Shift+clic junta un punto del contorno y uno de la interna; un arrastre los mueve igual', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(200, 0)); });
    act(() => { hook.result.current.handleMouseUp(); });
    arrastrar(hook, [120, 20], [125, 25], true);
    expect(store.getState().project.pieces[0].outline[1].values).toEqual([205, 5]);
    expect(anclasDe(internaDe('L'))[1]).toEqual([125, 25]);
  });

  it('el marco coge puntos del contorno y de la interna', () => {
    const { hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(-20, -20)); });
    act(() => { hook.result.current.handleMouseMove(ev(130, 30)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect([...hook.result.current.selectedNodes]).toEqual([0]);
    expect([...hook.result.current.internas[0].selectedNodes]).toEqual([0, 1]);
  });

  it('Shift dos veces endereza respecto al tramo de la interna que llega al punto', () => {
    // El tramo que llega a (60,20) viene de (20,100): pendiente 2:1.
    const inclinada: InternalLine = { id: 'I', type: 'reference', path: [{ type: 'M', values: [20, 100] }, { type: 'L', values: [60, 20] }, { type: 'L', values: [140, 20] }] };
    const { hook, internaDe } = montarQ([pieza([inclinada])]);
    act(() => hook.result.current.enterEdit('p'));
    dosVeces();
    arrastrar(hook, [60, 20], [90, 20], true);
    tecla('keyup');
    const [x, y] = anclasDe(internaDe('I'))[1];
    const ang = Math.atan2(-(y - 20), x - 60) * 180 / Math.PI;
    const base = Math.atan2(80, 40) * 180 / Math.PI;
    const rel = (((ang - base) % 45) + 45) % 45;
    expect(Math.min(rel, 45 - rel)).toBeLessThan(1e-6);
    const relHoja = ((ang % 45) + 45) % 45;
    expect(Math.min(relHoja, 45 - relHoja)).toBeGreaterThan(1);
  });

  it('deshacer a mitad del arrastre cancela el gesto y relee los puntos (Review Focus 4)', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(120, 20)); });
    act(() => { hook.result.current.handleMouseMove(ev(120, 40)); });
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(anclasDe(internaDe('L'))[1]).toEqual([120, 20]);
    act(() => { hook.result.current.handleMouseMove(ev(120, 60)); });
    expect(anclasDe(internaDe('L'))[1]).toEqual([120, 20]);
    expect(hook.result.current.internas[0].nodes[1].position).toEqual({ x: 120, y: 20 });
  });

  it('la caja negra registra qué agarró el press y si movió', () => {
    clearJournal();
    const { hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [120, 20], [120, 30]);
    const eventos = getJournal().events.filter(e => e.kind === 'gesture').map(e => [e.name, e.data]);
    expect(eventos).toContainEqual(['edicion:agarre', { objeto: 'pieza', linea: 'interna', que: 'punto', lineId: 'L' }]);
    expect(eventos).toContainEqual(['edicion:suelta', { movio: true }]);
  });

  it('Esc suelta lo elegido, también la interna elegida', () => {
    const { store, hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(70, 20)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(store.getState().editor.selectedInternalLine).not.toBeNull();
    act(() => { hook.result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(store.getState().editor.selectedInternalLine).toBeNull();
    expect(hook.result.current.internas[0].selectedSegments.size).toBe(0);
  });

  it('el hover sobre un tramo de interna lo anuncia, antes y después de entrar', () => {
    const { hook } = montarQ([pieza()]);
    act(() => { hook.result.current.handleMouseMove(ev(70, 21)); });
    expect(hook.result.current.hoveredPieceId).toBe('p');
    expect(hook.result.current.internas[0].hoveredSegment).toBe(1);
    expect(hook.result.current.getCursor()).toBe('pointer');
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseMove(ev(70, 21)); });
    expect(hook.result.current.internas[0].hoveredSegment).toBe(1);
    expect(hook.result.current.getCursor()).toBe('cell');
  });
});
```

- [ ] **Step 2: comprobar que fallan**

Run: `npx vitest run src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx`
Expected: FAIL. Q solo agarra el contorno y no existe `enganche`.

- [ ] **Step 3: imports, selectores y constantes**

En `useEditPattern.ts`, añade o cambia imports:

```ts
import { selectInternalLine, selectPiece } from '../../store/editorSlice';
import type { Point2D, PatternPiece, PathCommand, Trazo } from '../../types/types';
import { ABSOLUTE_REFERENCE, arrivingReferenceOnPath, chordReference, type AngleReference } from './angleReference';
import { EDGE_HIT_PX, isDrag } from './gestureConstants';
import { buildSnapIndex, resolveSnap, type SnapIndex } from './snapIndex';
import { agarrar, type Agarre } from './agarreDeQ';
import { claveDeInterna, lineIdDeClave } from './lineaEditable';
import {
  algoElegido, arrastreDe, conLinea, hoverDe, internaElegidaDe, marcoSelecciona,
  sinHover, sinPuntos, sinSeleccion, sinTramos, vistas,
} from './estadoDeQ';
import { pushJournal } from '../../utils/telemetry/journal';
```

(`arrivingReference` deja de importarse. `hitTestNode` y `nearestSegment` siguen importados solo si `findInsertTarget` los usa; ver Step 12.)

Arriba, junto a `NO_HIDDEN_LAYER_IDS`:

```ts
const SIN_TRAZOS: Trazo[] = [];
```

Dentro del hook, debajo de `hoverablePieces`:

```ts
  // La interna elegida tiene una sola fuente, la de Z (spec 2026-09-24 § 3.5).
  // `?.`/`??`: los arneses de prueba de antes no montan `editor`.
  const selectedInternalLine = useSelector((s: RootState) => s.editor?.selectedInternalLine ?? null);
  const trazos = useSelector((s: RootState) => s.project.trazos ?? SIN_TRAZOS);
  const showTrazos = useSelector((s: RootState) => s.editor?.showTrazos ?? true);
  /** Lo visible en orden de dibujo, para el enganche (la última pieza, encima). */
  const visiblesEnOrden = useMemo(
    () => pieces
      .filter(p => !hiddenLayerIds.includes(p.layer ?? 1))
      .sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0)),
    [pieces, hiddenLayerIds],
  );
  /** El punto al que engancha el arrastre de una interna, en patrón (spec § 4.3). */
  const [enganche, setEnganche] = useState<Point2D | null>(null);
  const publicarEnganche = useCallback((p: Point2D | null) => {
    setEnganche(prev => (prev === p || (prev && p && prev.x === p.x && prev.y === p.y) ? prev : p));
  }, []);
```

- [ ] **Step 4: la interna elegida, en los dos sentidos**

Debajo de `guardLocked`:

```ts
  /** La clave de la interna elegida en ESTA pieza, o null (spec § 3.5). */
  const claveElegida = useCallback((pieceId: string) => (
    selectedInternalLine?.pieceId === pieceId ? claveDeInterna(selectedInternalLine.lineId) : null
  ), [selectedInternalLine]);

  /**
   * Q escribe la interna elegida cuando lo elegido es de una interna, y la
   * vacía —dejando la pieza— cuando deja de serlo. Nunca guarda una interna
   * elegida que Z no conozca: dos fuentes se desincronizan.
   */
  const publicarElegida = useCallback((pieceId: string, next: EditPatternState) => {
    const elegida = internaElegidaDe(next);
    if (elegida) dispatch(selectInternalLine({ pieceId, ...elegida }));
    else if (selectedInternalLine?.pieceId === pieceId) dispatch(selectPiece(pieceId));
  }, [dispatch, selectedInternalLine]);

  /** El índice de enganche de lo visible, sin la interna que se arrastra (spec § 4.3). */
  const indiceSin = useCallback((piece: PatternPiece, lineId: string): SnapIndex => buildSnapIndex(
    visiblesEnOrden.map(p => (p.id === piece.id
      ? { ...p, internals: p.internals.filter(l => l.id !== lineId) }
      : p)),
    showTrazos ? trazos : SIN_TRAZOS,
  ), [visiblesEnOrden, showTrazos, trazos]);
```

- [ ] **Step 5: el arrastre lleva el enganche**

En la interfaz `OutlineDrag`, debajo de `marco`:

```ts
  /**
   * Arrastrando UN punto de una interna: engancha (spec § 4.3). El índice se
   * construye al empezar, sin la propia línea; `desde` es la posición local
   * del punto agarrado al empezar.
   */
  enganche?: { indice: SnapIndex; desde: Point2D };
```

Y en `aplicarArrastre`, sustituye `const { x: dx, y: dy } = patternToPieceLocalDirection(enPatron, piece);` por:

```ts
      let { x: dx, y: dy } = patternToPieceLocalDirection(enPatron, piece);
      // Precedencia del § 3.4: Shift > enganche > ratón. Una interna no mueve el
      // pivote de la pieza, así que su marco es el mismo en todo el gesto.
      if (drag.enganche && modo === 'suelto') {
        const { indice, desde } = drag.enganche;
        const mundo = pieceLocalToPattern({ x: desde.x + dx, y: desde.y + dy }, piece);
        const snap = resolveSnap(indice, mundo, screenToPatternLength(EDGE_HIT_PX, zoom));
        if (snap) {
          const local = patternToPieceLocal(snap.point, piece);
          dx = local.x - desde.x;
          dy = local.y - desde.y;
        }
        publicarEnganche(snap ? snap.point : null);
      } else if (drag.enganche) {
        publicarEnganche(null);
      }
```

Añade `publicarEnganche` a sus dependencias.

- [ ] **Step 6: `armarGesto` y los marcos por línea**

**El orden importa.** Colócalo justo **encima de `enterEditActuando`**, después de `indiceSin`. El array de dependencias de un `useCallback` se evalúa al declararlo, y `enterEditActuando` lista `armarGesto`: declarado más abajo, esa lectura cae en la zona muerta del `const` y el render revienta con `ReferenceError`. `agarreEn` puede ir en el mismo sitio.

```ts
  /**
   * Elige lo agarrado y arma el gesto (spec 2026-09-24 §§ 3.4-4.3). Lo comparten
   * el press dentro de la pieza en edición y el primer press que entra en ella:
   * un solo sitio decide qué queda elegido, qué se mueve, el marco de Shift y
   * si engancha.
   */
  const armarGesto = useCallback(
    (piece: PatternPiece, base: EditPatternState, hit: Agarre, e: React.MouseEvent<SVGSVGElement>): EditPatternState => {
      const linea = vistas(base, piece.outline).find(l => l.clave === hit.clave);
      if (!linea) return base;
      const aditivo = e.shiftKey;
      const lineId = lineIdDeClave(hit.clave);
      let next: EditPatternState;
      let quitarAlSoltar: OutlineDrag['quitarAlSoltar'];
      let marco: OutlineDrag['marco'];
      let grupo: number[] = [];
      if (hit.tipo === 'punto') {
        // Un grupo de anclas coincidentes es un punto: elegir un miembro los
        // elige a todos, así Supr quita la esquina entera.
        const miembros = anchorGroupOf(linea.path, hit.commandIndex);
        grupo = miembros.length > 0 ? miembros : [hit.commandIndex];
        // Shift+press sobre un punto YA elegido: quitarlo se decide al soltar,
        // y solo si no hubo arrastre (firma del 23-09).
        if (aditivo && linea.selectedNodes.has(hit.commandIndex)) quitarAlSoltar = { clave: hit.clave, indices: grupo };
        // Un gesto mueve puntos o tramos, nunca las dos cosas.
        const limpio = sinTramos(aditivo ? base : sinSeleccion(base));
        const nodos = new Set(aditivo ? linea.selectedNodes : []);
        for (const ci of grupo) nodos.add(ci);
        next = conLinea(limpio, hit.clave, { selectedNodes: nodos });
        const pos = linea.nodes.find(n => n.ref.commandIndex === hit.commandIndex)?.position ?? { x: 0, y: 0 };
        marco = marcoDelPunto(piece, linea.path, pos, hit.commandIndex);
      } else {
        if (aditivo && linea.selectedSegments.has(hit.commandIndex)) quitarAlSoltar = { clave: hit.clave, indices: [hit.commandIndex] };
        const limpio = sinPuntos(aditivo ? base : sinSeleccion(base));
        const tramos = new Set(aditivo ? linea.selectedSegments : []);
        tramos.add(hit.commandIndex);
        next = conLinea(limpio, hit.clave, { selectedSegments: tramos });
        marco = marcoDelTramo(piece, linea.path, linea.nodes, hit.commandIndex, pieceLocalToPattern(hit.point, piece));
      }
      const porLinea = arrastreDe(next, piece.outline, hit.tipo === 'punto' ? 'node' : 'segment');
      const soloEse = porLinea.size === 1 && porLinea.get(hit.clave)?.startPositions.size === grupo.length;
      const desde = hit.tipo === 'punto' ? porLinea.get(hit.clave)?.startPositions.get(hit.commandIndex) : undefined;
      dragRef.current = {
        type: hit.tipo === 'punto' ? 'node' : 'segment',
        startMouse: { x: e.clientX, y: e.clientY },
        porLinea,
        marco,
        ...(quitarAlSoltar ? { quitarAlSoltar } : {}),
        ...(lineId && soloEse && desde ? { enganche: { indice: indiceSin(piece, lineId), desde } } : {}),
      };
      pushJournal('gesture', 'edicion:agarre', {
        objeto: 'pieza', linea: lineId ? 'interna' : 'contorno', que: hit.tipo, ...(lineId ? { lineId } : {}),
      });
      return next;
    },
    [indiceSin],
  );

  /** Lo que agarraría un press en la pieza en edición (menú contextual y enrutador). */
  const agarreEn = useCallback((e: React.MouseEvent<SVGSVGElement>): Agarre | null => {
    if (!state.isEditing || !state.editingPieceId) return null;
    const piece = getPiece(state.editingPieceId);
    if (!piece) return null;
    return agarrar(vistas(state, piece.outline), toLocal(e, piece), hitRadius, claveElegida(piece.id));
  }, [state, getPiece, toLocal, hitRadius, claveElegida]);
```

Al final del archivo, sustituye `marcoDelPunto` y `marcoDelTramo`:

```ts
/** El marco de un punto agarrado: el tramo de SU línea que le llega, desde su posición inicial (spec § 4.2). */
function marcoDelPunto(
  piece: PatternPiece, path: PathCommand[], position: Point2D, commandIndex: number,
): OutlineDrag['marco'] {
  return { desde: pieceLocalToPattern(position, piece), referencia: arrivingReferenceOnPath(piece, path, commandIndex) };
}

/** El marco de un tramo agarrado: su propia recta, desde el punto del tramo bajo el press (no el pulso, que cae hasta 8 px fuera). */
function marcoDelTramo(
  piece: PatternPiece, path: PathCommand[], nodes: EditableNode[], commandIndex: number, pulsado: Point2D,
): OutlineDrag['marco'] {
  const toIndex = path[commandIndex]?.type === 'Z' ? 0 : commandIndex;
  const to = nodes.find(n => n.ref.commandIndex === toIndex)?.position;
  const from = findFromNode(nodes, commandIndex)?.position;
  return { desde: pulsado, referencia: to && from ? chordReference(piece, from, to) : ABSOLUTE_REFERENCE };
}
```

- [ ] **Step 7: el primer press que entra, y el press dentro**

Sustituye `enterEditActuando` por:

```ts
  const enterEditActuando = useCallback(
    (pieceId: string, e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (e.button !== 0) return false;
      const piece = pieces.find(p => p.id === pieceId);
      if (!piece) return false;
      if (piezaBloqueada(piece, layerLocked)) {
        // (comentario de hoy sobre maria-204 y el candado de capa)
        if (piece.locked) enterEdit(pieceId);
        else dispatch(showInfoToast('La capa de esta pieza está bloqueada: desbloquéala en Capas para editarla.'));
        return true;
      }
      const base = estadoDeEntrada(piece);
      const hit = agarrar(vistas(base, piece.outline), toLocal(e, piece), hitRadius, claveElegida(pieceId));
      if (!hit) return false;
      endDragBatch();
      seenPathsRef.current = pathsEditables(piece);
      expectedPathsRef.current = null;
      const next = armarGesto(piece, base, hit, e);
      setState(next);
      publicarElegida(pieceId, next);
      return true;
    },
    [pieces, layerLocked, toLocal, hitRadius, endDragBatch, enterEdit, dispatch, claveElegida, armarGesto, publicarElegida],
  );
```

Sustituye `handleMouseDown` por:

```ts
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!state.isEditing || !state.editingPieceId) return false;
      if (e.button !== 0) return false;
      sincronizar(e.shiftKey);
      setModoShift(modoRef.current);

      const piece = getPiece(state.editingPieceId);
      if (!piece) return false;

      const hit = agarrar(vistas(state, piece.outline), toLocal(e, piece), hitRadius, claveElegida(piece.id));
      if (hit) {
        const next = armarGesto(piece, state, hit, e);
        setState(next);
        publicarElegida(piece.id, next);
        return true;
      }

      // Vacío → marco. Sin Shift suelta todo; con Shift conserva los puntos.
      const patPt = toPattern(e);
      setState(s => ({
        ...(e.shiftKey ? sinTramos(s) : sinSeleccion(s)),
        marquee: { start: patPt, current: patPt },
      }));
      dragRef.current = {
        type: 'marquee',
        startMouse: { x: e.clientX, y: e.clientY },
        startPositions: new Map(),
      };
      return true;
    },
    [state, getPiece, toLocal, toPattern, hitRadius, modoRef, sincronizar, claveElegida, armarGesto, publicarElegida],
  );
```

- [ ] **Step 8: el hover**

En `handleMouseMove`, sustituye la rama `if (!state.isEditing) { … }` por:

```ts
      if (!state.isEditing) {
        const target = e.target as Element | null;
        const domPieceId = typeof target?.closest === 'function'
          ? target.closest('[data-piece-id]')?.getAttribute('data-piece-id')
          : null;
        // Cuando el DOM ya resolvió qué pieza está arriba, el hover no
        // puede mirar a través de su relleno y prometer un gesto sobre otra.
        const candidates = domPieceId
          ? hoverablePieces.filter(piece => piece.id === domPieceId)
          : hoverablePieces;

        for (const piece of candidates) {
          const internas = state.hoveredPieceId === piece.id && state.internas
            ? state.internas
            : extraerInternas(piece);
          const base: EditPatternState = { ...INITIAL_STATE, nodes: extractNodes(piece), internas };
          const hit = agarrar(vistas(base, piece.outline), toLocal(e, piece), hitRadius, claveElegida(piece.id));
          if (hit) {
            setState(s => conLinea(
              { ...sinHover({ ...s, internas: s.hoveredPieceId === piece.id && s.internas ? s.internas : internas }), hoveredPieceId: piece.id },
              hit.clave,
              hit.tipo === 'punto' ? { hoveredNode: hit.commandIndex } : { hoveredSegment: hit.commandIndex },
            ));
            return false;
          }
        }

        setState(s => ({ ...sinHover(s), hoveredPieceId: null }));
        return false;
      }
```

Y sustituye el bloque `// Hover detection` del final (hasta el último `return false;`) por:

```ts
      // Hover detection, en todas las líneas.
      const hit = agarrar(vistas(state, piece.outline), toLocal(e, piece), hitRadius, claveElegida(piece.id));
      setState(s => {
        const limpio = sinHover(s);
        if (!hit) return limpio;
        return conLinea(limpio, hit.clave, hit.tipo === 'punto'
          ? { hoveredNode: hit.commandIndex }
          : { hoveredSegment: hit.commandIndex, addPointPreview: hit.point });
      });
      return false;
```

Actualiza las dependencias con `claveElegida`. Y `limpiarHover` pasa a:

```ts
  const limpiarHover = useCallback(() => {
    setState(current => (current.isEditing ? current : { ...sinHover(current), hoveredPieceId: null }));
  }, []);
```

- [ ] **Step 9: soltar**

Sustituye `handleMouseUp` por:

```ts
  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuias(null);
    publicarEnganche(null);
    endDragBatch();

    if (!drag) return;

    if (drag.type === 'marquee') {
      const piece = state.editingPieceId ? pieces.find(p => p.id === state.editingPieceId) : undefined;
      if (!state.marquee || !piece) {
        setState(s => ({ ...s, marquee: null }));
        return;
      }
      const next = marcoSelecciona(state, piece);
      setState(next);
      publicarElegida(piece.id, next);
      return;
    }

    pushJournal('gesture', 'edicion:suelta', { movio: !!drag.wrote });

    // Node/segment drags already wrote during mousemove. What is left is the
    // Shift+click that never became a drag: now it does deselect.
    const quitar = drag.quitarAlSoltar;
    if (!quitar || drag.wrote || !state.editingPieceId) return;
    const v = vistas(state).find(l => l.clave === quitar.clave);
    if (!v) return;
    const conjunto = new Set(drag.type === 'node' ? v.selectedNodes : v.selectedSegments);
    for (const ci of quitar.indices) conjunto.delete(ci);
    const next = conLinea(state, quitar.clave, drag.type === 'node' ? { selectedNodes: conjunto } : { selectedSegments: conjunto });
    setState(next);
    publicarElegida(state.editingPieceId, next);
  }, [state, pieces, endDragBatch, publicarEnganche, publicarElegida]);
```

- [ ] **Step 10: Esc y el cursor**

En `handleKeyDown`, la rama de Escape pasa a:

```ts
      if (e.key === 'Escape') {
        // (comentario de hoy: peldaño 3 de la escalera, E-4; el gesto vivo manda)
        if (!dragRef.current && algoElegido(state)) {
          const next = sinSeleccion(state);
          setState(next);
          publicarElegida(state.editingPieceId, next);
          e.preventDefault();
          e.stopPropagation();
          return true;
        }
        exitEdit();
        return true;
      }
```

(Añade `publicarElegida` a las dependencias de `handleKeyDown`.) Y `getCursor` pasa a:

```ts
  const getCursor = useCallback((): string => {
    const hover = hoverDe(state);
    if (!state.isEditing) {
      // Hover-sin-clic (2026-09-10): el cursor distingue el nodo que se moverá
      // del tramo que se seleccionará, en cualquier línea.
      if (hover?.tipo === 'punto') return 'move';
      return hover?.tipo === 'tramo' ? 'pointer' : 'default';
    }
    if (dragRef.current) return dragRef.current.type === 'marquee' ? 'crosshair' : 'move';
    if (hover?.tipo === 'punto') return 'move';
    if (hover?.tipo === 'tramo') return hover.conPreview ? 'cell' : 'pointer';
    return 'default';
  }, [state]);
```

- [ ] **Step 11: el enganche también se limpia al salir y al releer**

En `enterEdit`, `exitEdit` y en el efecto de resync, junto a cada `setGuias(null);`, añade `publicarEnganche(null);` (y `publicarEnganche` a sus dependencias).

- [ ] **Step 12: `findInsertTarget` sobre `agarrar`**

Sustituye el cuerpo de `findInsertTarget`, que sigue exportada con su JSDoc, por la regla de `agarrar` para una sola línea. Sus tests de siempre la prueban:

```ts
export function findInsertTarget(
  localPt: Point2D,
  nodes: EditableNode[],
  outline: PathCommand[],
  hitRadius: number,
): { commandIndex: number; t: number } | null {
  const hit = agarrar([{ clave: CLAVE_CONTORNO, path: outline, nodes }], localPt, hitRadius, null);
  return hit?.tipo === 'tramo' ? { commandIndex: hit.commandIndex, t: hit.t } : null;
}
```

Quita de los imports `hitTestNode`, `nearestSegment`, `coincidentAnchorGroups` y `deletePoint` si ya no se usan (el borrado se muda en la Tarea 9; hasta entonces `deletePoint` y `coincidentAnchorGroups` siguen).

- [ ] **Step 13: el retorno**

Añade al `return` del hook:

```ts
    /** El punto al que engancha el arrastre de una interna, en patrón (spec § 4.3). */
    enganche,
    /** Qué agarraría un press en la pieza en edición (menú contextual y enrutador). */
    agarreEn,
```

- [ ] **Step 14: comprobar que pasan, y que lo de antes sigue igual**

Run: `npx vitest run src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx`
Expected: PASS.

Run: `npx vitest run src/components/PatternEditor src/shortcuts --reporter=dot`
Expected: PASS. Si un test de antes cae, es porque dependía de una diferencia que la spec cambia a propósito: el press sobre el cierre fantasma de un contorno abierto ya no elige un tramo (agarrar lo excluye). Se corrige la expectativa con esa razón escrita en el test, nunca el código para esquivarlo.

- [ ] **Step 15: tipos, lint y commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/PatternEditor/useEditPattern.ts src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx --max-warnings=0`

```bash
git add src/components/PatternEditor/useEditPattern.ts src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx
git commit -m "feat(2d): Q agarra, arrastra, endereza y engancha puntos y tramos de las internas (frontera, fase 2)"
```

---

### Task 9: los verbos de Q sobre una interna

Borrar puntos y tramos, insertar con doble clic, convertir tramos y mover con número.

**Files:**
- Modify: `src/components/PatternEditor/useEditPattern.ts`
- Modify: `src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx`

**Interfaces:**
- Consumes: `quitarPuntos`, `pathDeLinea` (tareas 2 y 7); `removeTramosDeInterna` (Tarea 7); `puntoUnicoDeLinea` (Tarea 1).
- Produces (retorno del hook):
  - `convertSegment(commandIndex, toCurve, pieceId?, lineId?)`
  - `convertSegmentToPoints(commandIndex, pieceId?, lineId?)`
  - `convertSegmentToBezier(commandIndex, pieceId?, lineId?)`
  - `moveNodeTo(pieceId, commandIndex, destino, lineId?)`
  - `puntoElegido: { pieceId: string; commandIndex: number; lineId?: string } | null`
  - `hayPuntosElegidos: boolean`

- [ ] **Step 1: tests que fallan**

Añade a `useEditPattern.internas.test.tsx`:

```tsx
const supr = (hook: ReturnType<typeof montarQ>['hook']) =>
  act(() => { hook.result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete' })); });
const clic = (hook: ReturnType<typeof montarQ>['hook'], x: number, y: number, shift = false) => {
  act(() => { hook.result.current.handleMouseDown(ev(x, y, shift)); });
  act(() => { hook.result.current.handleMouseUp(); });
};

describe('los verbos de Q sobre una interna', () => {
  it('Supr sobre un punto lo quita y los vecinos se unen', () => {
    const { hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 120, 20);
    supr(hook);
    expect(anclasDe(internaDe('L'))).toEqual([[20, 20], [120, 120]]);
  });

  it('una interna que se queda con un punto se va', () => {
    const corta: InternalLine = { ...ELE, path: ELE.path.slice(0, 2) };
    const { store, hook } = montarQ([pieza([corta])]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 120, 20);
    supr(hook);
    expect(store.getState().project.pieces[0].internals).toHaveLength(0);
  });

  it('una cerrada no baja de tres puntos: avisa y no toca nada (Review Focus 3)', () => {
    const cerrada: InternalLine = { id: 'C', type: 'reference', path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [80, 20] }, { type: 'L', values: [50, 70] }, { type: 'Z', values: [] },
    ] };
    const { store, hook, internaDe } = montarQ([pieza([cerrada])]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 80, 20);
    supr(hook);
    expect(internaDe('C').path).toEqual(cerrada.path);
    const toasts = (store.getState() as unknown as { copilotUI: { toasts: { message: string }[] } }).copilotUI.toasts;
    expect(toasts.at(-1)?.message).toBe('No se puede borrar: la forma necesita al menos 3 puntos');
  });

  it('el punto de cierre de una cerrada mueve juntos la M y el último (Review Focus 3)', () => {
    const cerrada: InternalLine = { id: 'C', type: 'reference', path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [80, 20] }, { type: 'L', values: [50, 70] }, { type: 'L', values: [20, 20] }, { type: 'Z', values: [] },
    ] };
    const { hook, internaDe } = montarQ([pieza([cerrada])]);
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [20, 20], [25, 30]);
    expect(anclasDe(internaDe('C'))[0]).toEqual([25, 30]);
    expect(anclasDe(internaDe('C'))[3]).toEqual([25, 30]);
  });

  it('una mezcla con el contorno es todo o nada', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    // Tres puntos del contorno (dejarían uno) y uno de la interna.
    clic(hook, 200, 0); clic(hook, 200, 150, true); clic(hook, 0, 150, true); clic(hook, 120, 20, true);
    supr(hook);
    expect(store.getState().project.pieces[0].outline).toEqual(RECT);
    expect(internaDe('L').path).toEqual(ELE.path);
  });

  it('gemelas: Supr sobre una quita el grupo, no deja un gemelo (Review Focus 1)', () => {
    const gemelas: InternalLine = { ...ELE, path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] },
    ] };
    const { hook, internaDe } = montarQ([pieza([gemelas])]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 120, 20);
    supr(hook);
    expect(anclasDe(internaDe('L'))).toEqual([[20, 20], [120, 120]]);
  });

  it('Supr sobre un tramo del medio parte la interna en dos', () => {
    const tres: InternalLine = { ...ELE, path: [...ELE.path, { type: 'L', values: [20, 120] }] };
    const { store, hook } = montarQ([pieza([tres])]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 120, 70);
    supr(hook);
    const internas = store.getState().project.pieces[0].internals;
    expect(internas.map(l => l.path.length)).toEqual([2, 2]);
    expect(internas[0].id).toBe('L');
  });

  it('Supr sobre un tramo de pinza se la lleva entera: no se parte', () => {
    const pinza: InternalLine = { id: 'P', type: 'dart', path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [40, 90] }, { type: 'L', values: [60, 20] },
    ] };
    const { store, hook } = montarQ([pieza([pinza])]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 30, 55);
    supr(hook);
    expect(store.getState().project.pieces[0].internals).toHaveLength(0);
  });

  it('doble clic en un tramo de interna inserta un punto marcado; sobre un punto, nada', () => {
    const { hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleDoubleClick(ev(70, 20)); });
    expect(internaDe('L').path).toHaveLength(4);
    expect(internaDe('L').path[1]).toMatchObject({ type: 'L', values: [70, 20], authoredAnchor: true });
    act(() => { hook.result.current.handleDoubleClick(ev(120, 20)); });
    expect(internaDe('L').path).toHaveLength(4);
  });

  it('convertir un tramo de interna: a curva, a curva por puntos, y mover un punto con número', () => {
    const { hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => hook.result.current.convertSegment(1, true, 'p', 'L'));
    expect(internaDe('L').path[1]).toMatchObject({ type: 'C', manualBezier: true });
    act(() => hook.result.current.convertSegment(1, false, 'p', 'L'));
    expect(internaDe('L').path[1].type).toBe('L');
    act(() => hook.result.current.convertSegmentToPoints(1, 'p', 'L'));
    expect(internaDe('L').path.filter(c => c.type === 'C').length).toBeGreaterThan(1);
    act(() => hook.result.current.moveNodeTo('p', 0, { x: 0, y: 0 }, 'L'));
    expect(internaDe('L').path[0].values).toEqual([0, 0]);
  });

  it('el punto elegido de una interna es el sujeto de las cotas', () => {
    const { hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 120, 20);
    expect(hook.result.current.puntoElegido).toEqual({ pieceId: 'p', commandIndex: 1, lineId: 'L' });
    expect(hook.result.current.hayPuntosElegidos).toBe(true);
  });
});
```

- [ ] **Step 2: comprobar que fallan**

Run: `npx vitest run src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx`
Expected: FAIL. Los verbos no conocen `lineId`, Supr solo mira el contorno y no existe `puntoElegido`.

- [ ] **Step 3: Supr por línea**

Imports: `removeTramosDeInterna`, `removeInternalLine` de `../../store/projectSlice`; `seBorraEntera` de `../../types/types`; `quitarPuntos`, `pathDeLinea` de `./lineaEditable`; `puntoUnicoDeLinea` de `./cotas/nodo`. En `handleKeyDown`, sustituye la rama `if (e.key === 'Delete' || e.key === 'Backspace') { … }` entera (el comentario largo del #1115 se queda):

```ts
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const piece = getPiece(state.editingPieceId);
        if (!piece) return false;
        const lineas = vistas(state, piece.outline);

        const conPuntos = lineas.filter(l => l.selectedNodes.size > 0);
        if (conPuntos.length === 0) {
          // Tramos de internas: se quitan SOLO esos tramos (spec § 4.6), por el
          // mismo reductor que usa Z. Un tramo del contorno no se borra —no
          // existe «borrar lado»—, pero se consume igual: soltar la tecla se la
          // daría al global y desaparecería la pieza con el tramo resaltado.
          const conTramos = lineas.filter(l => l.clave !== CLAVE_CONTORNO && l.selectedSegments.size > 0);
          if (conTramos.length === 0) return state.selectedSegments.size > 0;
          const token = beginUndoBatch(dispatch, 'Borrar tramo');
          for (const l of conTramos) {
            const lineId = lineIdDeClave(l.clave)!;
            // El hilo y la pinza son entidades: un tramo suyo se las lleva
            // enteras, no las parte (spec § 4.6).
            const linea = piece.internals.find(x => x.id === lineId);
            if (linea && seBorraEntera(linea.type)) {
              dispatch(withUndoBatchToken(removeInternalLine({ pieceId: piece.id, lineId }), token));
              continue;
            }
            pushJournal('gesture', 'interna:delete', { pieceId: piece.id, lineId, segmentIndices: [...l.selectedSegments] });
            dispatch(withUndoBatchToken(
              removeTramosDeInterna({ pieceId: piece.id, lineId, segmentIndices: [...l.selectedSegments] }),
              token,
            ));
          }
          endUndoBatch(dispatch, token);
          if (selectedInternalLine?.pieceId === piece.id) dispatch(selectPiece(piece.id));
          e.preventDefault();
          return true;
        }

        // Todo o nada: si una línea no puede, no se toca ninguna.
        const cambios = new Map<ClaveLinea, PathCommand[] | null>();
        for (const l of conPuntos) {
          const r = quitarPuntos(l.path, l.selectedNodes, l.clave === CLAVE_CONTORNO);
          if (r === 'insuficiente') {
            dispatch(showInfoToast(l.clave === CLAVE_CONTORNO
              ? 'No se puede borrar: la pieza necesita al menos 3 puntos'
              : 'No se puede borrar: la forma necesita al menos 3 puntos'));
            // CONSUME igual (#1115): al soltarla, el global se llevaba la pieza entera.
            return true;
          }
          cambios.set(l.clave, r);
        }

        const updated = conPaths(piece, cambios);
        expectedPathsRef.current = pathsEditables(updated);
        dispatch(updatePiece(updated));
        // Este camino no pasa por `escribirLineas`: el borrado siempre es
        // estructural, así que se relee todo (#1122).
        setState(s => resyncStateToPiece(s, updated));
        if (selectedInternalLine?.pieceId === piece.id) dispatch(selectPiece(piece.id));
        e.preventDefault();
        return true;
      }
```

Añade `selectedInternalLine` a las dependencias. `deletePoint` y `coincidentAnchorGroups` dejan de importarse en el hook.

- [ ] **Step 4: doble clic en cualquier línea**

Sustituye el cuerpo de `handleDoubleClick`:

```ts
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!state.isEditing || !state.editingPieceId) return false;
      const piece = getPiece(state.editingPieceId);
      if (!piece) return false;
      // Sobre un punto no se inserta (el punto fantasma de #167): `agarrar` da
      // el punto antes que el tramo, y el cierre fantasma no es un tramo.
      const lineas = vistas(state, piece.outline);
      const hit = agarrar(lineas, toLocal(e, piece), hitRadius, claveElegida(piece.id));
      if (!hit || hit.tipo !== 'tramo') return false;
      const linea = lineas.find(l => l.clave === hit.clave);
      if (!linea) return false;
      escribirLineas(piece, new Map([[hit.clave, splitSegmentAt(linea.path, hit.commandIndex, hit.t)]]));
      return true;
    },
    [state, getPiece, toLocal, hitRadius, claveElegida, escribirLineas],
  );
```

- [ ] **Step 5: los verbos con `lineId`**

Sustituye `convertSegment`, `moveNodeTo`, `convertSegmentToPoints` y `convertSegmentToBezier` (sus JSDoc se quedan; añade a cada uno: *«`lineId`: una interna de la pieza (spec 2026-09-24 § 4.4); sin él, el contorno.»*):

```ts
  const convertSegment = useCallback(
    (commandIndex: number, toCurve: boolean, pieceId?: string, lineId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      const clave = lineId ? claveDeInterna(lineId) : CLAVE_CONTORNO;
      const path = pathDeLinea(piece, clave);
      if (!path) return;
      escribirLineas(piece, new Map([[clave, toCurve ? convertToCurve(path, commandIndex) : convertToLine(path, commandIndex)]]));
    },
    [state.editingPieceId, getPiece, escribirLineas, guardLocked],
  );

  const moveNodeTo = useCallback(
    (pieceId: string, commandIndex: number, destino: Point2D, lineId?: string) => {
      const piece = getPiece(pieceId);
      if (!piece || guardLocked(piece)) return;
      const clave = lineId ? claveDeInterna(lineId) : CLAVE_CONTORNO;
      const path = pathDeLinea(piece, clave);
      if (!path) return;
      escribirLineas(piece, new Map([[clave, applyNodeMove(path, commandIndex, 'anchor', destino)]]));
    },
    [getPiece, escribirLineas, guardLocked],
  );

  const convertSegmentToPoints = useCallback(
    (commandIndex: number, pieceId?: string, lineId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      const clave = lineId ? claveDeInterna(lineId) : CLAVE_CONTORNO;
      const path = pathDeLinea(piece, clave);
      if (!path) return;
      escribirLineas(piece, new Map([[clave, convertSegmentToSpline(path, commandIndex)]]));
    },
    [state.editingPieceId, getPiece, escribirLineas, guardLocked],
  );

  const convertSegmentToBezier = useCallback(
    (commandIndex: number, pieceId?: string, lineId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      const clave = lineId ? claveDeInterna(lineId) : CLAVE_CONTORNO;
      const path = pathDeLinea(piece, clave);
      if (!path) return;
      const out = toManualBezier(path, commandIndex);
      if (out) escribirLineas(piece, new Map([[clave, out]]));
    },
    [state.editingPieceId, getPiece, escribirLineas, guardLocked],
  );
```

`addPointOnSegment` (herramienta Punto) no cambia: sigue sobre el contorno (spec § 11).

- [ ] **Step 6: el punto elegido**

Debajo de `agarreEn`:

```ts
  /**
   * El punto único elegido, de cualquier línea (spec § 4.5): el sujeto de las
   * cotas del punto y de «Mover exacto…». Con dos líneas con algo elegido, o
   * con tramos, no hay punto único.
   */
  const puntoElegido = useMemo(() => {
    if (!state.isEditing || !state.editingPieceId) return null;
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return null;
    const conAlgo = vistas(state, piece.outline).filter(v => v.selectedNodes.size > 0 || v.selectedSegments.size > 0);
    if (conAlgo.length !== 1 || conAlgo[0].selectedSegments.size > 0) return null;
    const commandIndex = puntoUnicoDeLinea(conAlgo[0].path, conAlgo[0].selectedNodes);
    if (commandIndex === null) return null;
    const lineId = lineIdDeClave(conAlgo[0].clave);
    return { pieceId: piece.id, commandIndex, ...(lineId ? { lineId } : {}) };
  }, [state, pieces]);
```

Y en el `return`:

```ts
    /** El punto único elegido, de cualquier línea (cotas y menú, spec § 4.5). */
    puntoElegido,
    /** Hay puntos elegidos en alguna línea: los largos callan (#1153). */
    hayPuntosElegidos: vistas(state).some(v => v.selectedNodes.size > 0),
```

- [ ] **Step 7: comprobar que pasan, y que lo de antes sigue igual**

Run: `npx vitest run src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx`
Expected: PASS.

Run: `npx vitest run src/components/PatternEditor src/shortcuts --reporter=dot`
Expected: PASS (`useEditPattern.groupDelete`, `lockedVerbs`, `1122-…`, `1115-…` incluidos).

- [ ] **Step 8: tipos, lint y commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/PatternEditor/useEditPattern.ts src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx --max-warnings=0`

```bash
git add src/components/PatternEditor/useEditPattern.ts src/components/PatternEditor/__tests__/useEditPattern.internas.test.tsx
git commit -m "feat(2d): borrar, insertar, convertir y mover con número en una interna desde Q (frontera, fase 2)"
```

---

### Task 10: pintar las internas en Q

**Files:**
- Modify: `src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx`
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx` (props ~línea 126 y primer `<EditPatternOverlay>` ~línea 320)
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (props de `ToolOverlay`, ~línea 1531)
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx` (bloque `internal-line-endpoints`, ~línea 335)
- Modify: `src/components/PatternEditor/__tests__/EditPatternTestHarness.tsx`
- Modify: `src/components/PatternEditor/renderers/__tests__/EditPatternOverlay.test.tsx`

Antes de tocar nada, invoca la skill `contrato-de-interfaz` (obligatorio por `CLAUDE.md`).

**Interfaces:**
- Consumes: `EdicionDeInterna` (Tarea 5); `classifyAnchorsOfPath` (Tarea 1); `EXTREMOS` (`../PuntosDelContorno`); `EDGE_HIT_PX`.
- Produces: `EditPatternOverlay` gana `internas?: EdicionDeInterna[]` y `enganche?: Point2D | null`; `ToolOverlay` gana `editPatternInternas` y `editPatternEnganche`.

- [ ] **Step 1: tests que fallan**

Añade a `EditPatternOverlay.test.tsx`:

```tsx
import type { EdicionDeInterna } from '../../estadoDeQ';
import { extractNodesFromPath } from '../../nodeEditorUtils';

describe('EditPatternOverlay con internas (spec 2026-09-24 § 3.3)', () => {
  const rect = {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, seamAllowance: 0, edges: [],
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 150] },
      { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
    ],
    internals: [],
  } as unknown as PatternPiece;
  const path = [
    { type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] },
    { type: 'C', values: [120, 130, 110, 140, 100, 140] },
  ] as PatternPiece['outline'];
  const interna = (extra: Partial<EdicionDeInterna> = {}): EdicionDeInterna => ({
    lineId: 'L', path, nodes: extractNodesFromPath(path, 'p'),
    selectedNodes: new Set(), selectedSegments: new Set(), hoveredNode: null, hoveredSegment: null, addPointPreview: null,
    ...extra,
  });
  const pintar = (props: { editando: boolean; internas: EdicionDeInterna[]; enganche?: { x: number; y: number } | null }) => render(
    <svg>
      <EditPatternOverlay
        zoom2D={1} pieces={[rect]} editingPieceId={props.editando ? 'p' : null} hoveredPieceId={props.editando ? null : 'p'}
        nodes={[]} selectedNodes={new Set()} selectedSegments={new Set()} hoveredNode={null}
        hoveredSegment={null} addPointPreview={null} marquee={null}
        internas={props.internas} enganche={props.enganche ?? null}
      />
    </svg>,
  );

  it('editando, pinta todos los puntos de la interna', () => {
    const { container } = pintar({ editando: true, internas: [interna()] });
    expect(container.querySelectorAll('[data-interna="L"] [data-anchor-role]')).toHaveLength(4);
  });

  it('antes de entrar, solo sus extremos: como el contorno (#1103)', () => {
    const { container } = pintar({ editando: false, internas: [interna()] });
    const roles = [...container.querySelectorAll('[data-interna="L"] [data-anchor-role]')].map(n => n.getAttribute('data-anchor-role'));
    expect(roles).not.toContain('bezierAnchor');
    expect(roles).toContain('openEndpoint');
  });

  it('resalta el tramo de interna bajo el ratón', () => {
    const { container } = pintar({ editando: true, internas: [interna({ hoveredSegment: 1 })] });
    expect(container.querySelector('[data-interna="L"] [data-tramo-hover="1"]')).toBeTruthy();
  });

  it('pinta el anillo del enganche con el token de enganche', () => {
    const { container } = pintar({ editando: true, internas: [interna()], enganche: { x: 0, y: 0 } });
    const anillo = container.querySelector('circle.snap-ring');
    expect(anillo?.getAttribute('stroke')).toBe('var(--snap-2d)');
  });
});
```

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/EditPatternOverlay.test.tsx`
Expected: FAIL — `internas` y `enganche` no son props.

- [ ] **Step 2: el overlay**

Sustituye `EditPatternOverlay.tsx` entero:

```tsx
import type { PathCommand, PatternPiece, Point2D } from '../../../../types/types';
import { outlineBBoxCenter } from '../../../../utils/geometry/transform';
import { classifyAnchorsOfPath, classifyEditableAnchors } from '../../anchorRoles';
import type { EditableNode } from '../../nodeEditorUtils';
import type { EdicionDeInterna } from '../../estadoDeQ';
import { EDGE_HIT_PX } from '../../gestureConstants';
import { EXTREMOS } from '../PuntosDelContorno';
import AnchorGlyph, { type AnchorVisualState } from '../AnchorGlyph';

interface EditPatternOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  editingPieceId: string | null;
  hoveredPieceId: string | null;
  nodes: EditableNode[];
  selectedNodes: Set<number>;
  selectedSegments: Set<number>;
  hoveredNode: number | null;
  hoveredSegment: number | null;
  addPointPreview: Point2D | null;
  marquee: { start: Point2D; current: Point2D } | null;
  /** Las internas editables de la pieza (spec 2026-09-24 § 3.3). */
  internas?: EdicionDeInterna[];
  /** El punto al que engancha el arrastre de una interna, en patrón (§ 4.3). */
  enganche?: Point2D | null;
}

/** El resalte de los tramos elegidos o bajo el ratón de un path, cierre incluido. */
function resaltesDeTramos(
  path: PathCommand[], selected: Set<number>, hovered: number | null, zoom2D: number, prefijo: string,
): JSX.Element[] {
  const out: JSX.Element[] = [];
  let prevX = 0, prevY = 0;
  const trazo = (key: string, d: string, i: number, isSelected: boolean, isHovered: boolean) => (
    <path
      key={key}
      data-tramo-hover={isHovered ? i : undefined}
      d={d}
      fill="none"
      stroke="var(--accent-2d)"
      strokeWidth={(isSelected ? 2.5 : 2) / zoom2D}
      opacity={isSelected ? 1 : 0.6}
      pointerEvents="none"
    />
  );
  for (let i = 0; i < path.length; i++) {
    const cmd = path[i];
    const isSelected = selected.has(i);
    const isHovered = hovered === i && !isSelected;
    if (isSelected || isHovered) {
      let d = '';
      if (cmd.type === 'L') d = `M ${prevX} ${prevY} L ${cmd.values[0]} ${cmd.values[1]}`;
      else if (cmd.type === 'C') d = `M ${prevX} ${prevY} C ${cmd.values.join(' ')}`;
      else if (cmd.type === 'Q') d = `M ${prevX} ${prevY} Q ${cmd.values.join(' ')}`;
      if (d) out.push(trazo(`${prefijo}seg-${i}`, d, i, isSelected, isHovered));
    }
    switch (cmd.type) {
      case 'M': case 'L': prevX = cmd.values[0]; prevY = cmd.values[1]; break;
      case 'C': prevX = cmd.values[4]; prevY = cmd.values[5]; break;
      case 'Q': prevX = cmd.values[2]; prevY = cmd.values[3]; break;
    }
  }
  // Closing segment: last anchor → first anchor (Z command)
  const zIndex = path.findIndex(c => c.type === 'Z');
  if (zIndex >= 0 && path[0]?.type === 'M') {
    const isSelected = selected.has(zIndex);
    const isHovered = hovered === zIndex && !isSelected;
    if (isSelected || isHovered) {
      const d = `M ${prevX} ${prevY} L ${path[0].values[0]} ${path[0].values[1]}`;
      out.push(trazo(`${prefijo}seg-closing`, d, zIndex, isSelected, isHovered));
    }
  }
  return out;
}

export default function EditPatternOverlay({
  zoom2D, pieces, editingPieceId, hoveredPieceId, nodes, selectedNodes, selectedSegments,
  hoveredNode, hoveredSegment, addPointPreview, marquee, internas = [], enganche = null,
}: EditPatternOverlayProps) {
  const piece = pieces.find(p => p.id === (editingPieceId ?? hoveredPieceId));
  if (!piece) return null;

  const classifiedAnchors = editingPieceId ? classifyEditableAnchors(piece, nodes) : [];

  // Match the renderer's per-piece transform so anchor dots track a rotated
  // piece (nota de María #170): translate by position, then rotate about the
  // outline bbox center. The marquee stays screen-aligned (outside this group).
  const rot = piece.rotation ?? 0;
  const anchorTransform = (() => {
    const base = `translate(${piece.position.x}, ${piece.position.y})`;
    if (!rot) return base;
    const { x: cx, y: cy } = outlineBBoxCenter(piece.outline);
    return `${base} rotate(${rot}, ${cx}, ${cy})`;
  })();

  const estado = (sel: Set<number>, hov: number | null, i: number): AnchorVisualState =>
    sel.has(i) ? 'selected' : hov === i ? 'hovered' : 'idle';

  return (
    <>
      <g transform={anchorTransform}>
        {resaltesDeTramos(piece.outline, selectedSegments, hoveredSegment, zoom2D, '')}

        {addPointPreview && (
          <circle cx={addPointPreview.x} cy={addPointPreview.y} r={4 / zoom2D} fill="var(--accent-2d)" opacity={0.5} />
        )}

        {classifiedAnchors.map(({ node, role }) => {
          const commandIndex = node.ref.commandIndex;
          return (
            <g key={commandIndex} data-command-index={commandIndex}>
              <AnchorGlyph role={role} position={node.position} zoom2D={zoom2D} state={estado(selectedNodes, hoveredNode, commandIndex)} />
            </g>
          );
        })}

        {/* Las internas, encima del contorno como en el lienzo. Antes de entrar,
            solo sus extremos: el mismo trato que el contorno (spec § 3.3). */}
        {internas.map(i => (
          <g key={i.lineId} data-interna={i.lineId}>
            {resaltesDeTramos(i.path, i.selectedSegments, i.hoveredSegment, zoom2D, `${i.lineId}-`)}
            {i.addPointPreview && (
              <circle cx={i.addPointPreview.x} cy={i.addPointPreview.y} r={4 / zoom2D} fill="var(--accent-2d)" opacity={0.5} />
            )}
            {classifyAnchorsOfPath(i.path, i.nodes)
              .filter(({ role }) => editingPieceId !== null || EXTREMOS.has(role))
              .map(({ node, role }) => {
                const ci = node.ref.commandIndex;
                return (
                  <g key={ci} data-command-index={ci}>
                    <AnchorGlyph role={role} position={node.position} zoom2D={zoom2D} state={estado(i.selectedNodes, i.hoveredNode, ci)} />
                  </g>
                );
              })}
          </g>
        ))}
      </g>

      {/* El anillo: la palabra que la app ya usa para «el próximo clic cae AQUÍ». */}
      {enganche && (
        <circle
          className="snap-ring"
          cx={enganche.x} cy={enganche.y} r={(EDGE_HIT_PX / zoom2D) * 0.5}
          fill="none" stroke="var(--snap-2d)" strokeWidth={2 / zoom2D} pointerEvents="none"
        />
      )}

      {marquee && (
        <rect
          x={Math.min(marquee.start.x, marquee.current.x)}
          y={Math.min(marquee.start.y, marquee.current.y)}
          width={Math.abs(marquee.current.x - marquee.start.x)}
          height={Math.abs(marquee.current.y - marquee.start.y)}
          fill="var(--accent-2d)"
          fillOpacity={0.1}
          stroke="var(--accent-2d)"
          strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D}`}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: el cableado**

En `ToolOverlay.tsx`, junto a `editPatternMarquee` en las props:

```ts
  /** Las internas editables de la pieza en Q (spec 2026-09-24 § 3.3). */
  editPatternInternas: EdicionDeInterna[];
  /** El anillo de enganche del arrastre de una interna (§ 4.3). */
  editPatternEnganche: Point2D | null;
```

(import `type { EdicionDeInterna } from '../estadoDeQ'`). En el primer `<EditPatternOverlay …>` (el de `activeTool === 'editPattern'`) añade `internas={props.editPatternInternas}` y `enganche={props.editPatternEnganche}`. El de las anclas de referencia no cambia.

En `PatternEditor.tsx`, junto a `editPatternMarquee={editPatternTool.marquee}`:

```tsx
            editPatternInternas={editPatternTool.internas}
            editPatternEnganche={editPatternTool.enganche}
```

En `EditPatternTestHarness.tsx`, en el `<EditPatternOverlay>`: `internas={editor.internas} enganche={editor.enganche}`.

- [ ] **Step 4: sin extremos duplicados en Q**

En `PieceRenderer.tsx`, el bloque que pinta `internal-line-endpoints` pasa a condicionarse también a que la pieza no esté en edición de puntos (el overlay de Q ya pinta esos puntos):

```tsx
            {/* Los extremos de la entidad siguen siendo su lectura en Z. En Q y V,
                la pieza en edición ya pinta sus puntos en el overlay: dos glifos en
                la misma coordenada son ruido (spec 2026-09-24 § 3.3). */}
            {isWholeLineSelected && piezaConPuntosDeCurva !== piece.id && (() => {
```

(`piezaConPuntosDeCurva` ya llega a `SinglePiece`; si no está en su desestructuración, añádelo.)

- [ ] **Step 5: comprobar que pasan, y el trinquete**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__ src/components/PatternEditor/__tests__/useEditPattern*.test.tsx --reporter=dot`
Expected: PASS.

Run: `node scripts/ui-contract-lint.mjs`
Expected: R3 baja en 3 (los tres colores escritos a mano de `EditPatternOverlay`) y ninguna sube. Fija el techo: `node scripts/ui-contract-lint.mjs --update`.

- [ ] **Step 6: tipos, lint y commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx src/components/PatternEditor/renderers/ToolOverlay.tsx src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/renderers/PieceRenderer.tsx src/components/PatternEditor/__tests__/EditPatternTestHarness.tsx src/components/PatternEditor/renderers/__tests__/EditPatternOverlay.test.tsx --max-warnings=0`

```bash
git add src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx src/components/PatternEditor/renderers/ToolOverlay.tsx src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/renderers/PieceRenderer.tsx src/components/PatternEditor/__tests__/EditPatternTestHarness.tsx src/components/PatternEditor/renderers/__tests__/EditPatternOverlay.test.tsx scripts/ui-contract-baseline.json
git commit -m "feat(2d): Q pinta los puntos y tramos de las internas y el anillo del enganche (frontera, fase 2)"
```

---

### Task 11: las cotas y el menú sobre una interna

**Files:**
- Modify: `src/components/PatternEditor/cotas/sujeto.ts` (`SujetoInput.nodoSeleccionado` y su rama)
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (`nodoSeleccionado` ~línea 895, `suppressLengths` ~línea 905, `aplicarCota` rama `'nodo'` ~línea 1055, `handleContextMenu` ~líneas 680-730, callbacks de `<ContextMenu>` ~línea 1720)
- Modify: `src/components/PatternEditor/ContextMenu.tsx` (`ContextMenuState` y el `ctx`)
- Modify: `src/components/PatternEditor/actionCuration.ts` (`CurationCtx`, `CurationCallbacks`, `isManagedSplineSegment` y los tres `convert*`)
- Create: `src/components/PatternEditor/cotas/__tests__/sujeto.internas.test.ts`
- Create: `src/components/PatternEditor/__tests__/actionCuration.internas.test.ts`

**Interfaces:**
- Consumes: `cotasDelNodoEnPath` (Tarea 1); `puntoElegido`, `hayPuntosElegidos`, `agarreEn`, los verbos con `lineId` (tareas 8 y 9); `lineIdDeClave`, `CLAVE_CONTORNO`.
- Produces:
  - `SujetoInput.nodoSeleccionado: { pieceId: string; commandIndex: number; lineId?: string } | null`
  - `ContextMenuState.segmentLineId?: string` y `CurationCtx.segmentLineId?: string`
  - `CurationCallbacks.onConvertSegment(commandIndex, toCurve, pieceId?, lineId?)`; igual `onConvertSegmentToPoints` y `onConvertSegmentToBezier` con `lineId?` al final.

- [ ] **Step 1: tests que fallan**

Crea `src/components/PatternEditor/cotas/__tests__/sujeto.internas.test.ts`:

```ts
/** Las cotas del punto elegido de una interna en Q (spec 2026-09-24 § 4.5). */
import { describe, it, expect } from 'vitest';
import type { PatternPiece } from '../../../../types/types';
import { cotasDelSujeto } from '../sujeto';

const pieza = {
  id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, seamAllowance: 0, edges: [],
  outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 150] }, { type: 'Z', values: [] }],
  internals: [{ id: 'L', type: 'reference', path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] }] }],
} as unknown as PatternPiece;

describe('el punto elegido de una interna es sujeto de cotas', () => {
  it('sus dos largos, de su línea', () => {
    const s = cotasDelSujeto({
      activeTool: 'editPattern', pieces: [pieza], selectedPieceIds: ['p'], selectedInternalLine: { pieceId: 'p', lineId: 'L' },
      hotId: null, isDragging: false, contextMenuOpen: false, calibrationActive: false, hiddenLayerIds: [], layerLocked: {},
      nodoSeleccionado: { pieceId: 'p', commandIndex: 1, lineId: 'L' },
    }, { width: 100, height: 100 });
    expect(s.cotas.map(c => c.id)).toEqual(['nodo-L-1-anterior', 'nodo-L-1-siguiente']);
    expect(s.lineaDeSujeto).toBe('Editando: el punto seleccionado');
  });
});
```

Crea `src/components/PatternEditor/__tests__/actionCuration.internas.test.ts`:

```ts
/** El menú sobre un tramo de interna en Q convierte ESE tramo (spec 2026-09-24 § 4.4). */
import { describe, it, expect, vi } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { resolveMenuActions, type CurationCtx } from '../actionCuration';

const pieza = {
  id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, seamAllowance: 0, edges: [],
  outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 150] }, { type: 'Z', values: [] }],
  internals: [{ id: 'L', type: 'reference', path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }] }],
} as unknown as PatternPiece;

function ctx(cb: CurationCtx['cb']): CurationCtx {
  return {
    dispatch: vi.fn(), targetKind: 'point.segment', stage: 'drafted', altitude: 'point',
    pieceId: 'p', piece: pieza, selectedPieceIds: ['p'], seamId: null, seam: null,
    internalLineId: null, internalLineType: null, internalLine: null,
    segmentIndex: 1, segmentIsCurve: false, segmentLineId: 'L',
    clipboard: null, groups: [], pieces: [pieza], cb, onClose: vi.fn(),
  } as unknown as CurationCtx;
}

describe('convertir un tramo de interna desde el menú', () => {
  it('los verbos llevan la línea', () => {
    const cb = { onConvertSegment: vi.fn(), onConvertSegmentToPoints: vi.fn() };
    const c = ctx(cb);
    const defs = resolveMenuActions(c);
    defs.find(d => d.id === 'convertSegment')!.run(c);
    defs.find(d => d.id === 'convertSegmentToPoints')!.run(c);
    expect(cb.onConvertSegment).toHaveBeenCalledWith(1, true, 'p', 'L');
    expect(cb.onConvertSegmentToPoints).toHaveBeenCalledWith(1, 'p', 'L');
  });
});
```

Run: `npx vitest run src/components/PatternEditor/cotas/__tests__/sujeto.internas.test.ts src/components/PatternEditor/__tests__/actionCuration.internas.test.ts`
Expected: FAIL. `nodoSeleccionado` no admite `lineId` y `segmentLineId` no existe.

- [ ] **Step 2: `sujeto.ts`**

En `SujetoInput`:

```ts
  nodoSeleccionado?: { pieceId: string; commandIndex: number; lineId?: string } | null;
```

Y en la rama del nodo en edición, `const cotas = cotasDelNodo(piezaDelNodo, input.nodoSeleccionado.commandIndex);` pasa a:

```ts
      // El punto puede ser de una interna (spec 2026-09-24 § 4.5): sus largos
      // son los de SU línea.
      const { commandIndex, lineId } = input.nodoSeleccionado;
      const path = lineId
        ? piezaDelNodo.internals.find(l => l.id === lineId)?.path
        : piezaDelNodo.outline;
      const cotas = path ? cotasDelNodoEnPath(piezaDelNodo, path, commandIndex, lineId) : [];
```

(import `cotasDelNodoEnPath` de `./nodo`; `cotasDelNodo` deja de importarse aquí si no se usa en otro sitio).

- [ ] **Step 3: `actionCuration.ts` y `ContextMenu.tsx`**

En `CurationCallbacks`:

```ts
  onConvertSegment?: (commandIndex: number, toCurve: boolean, pieceId?: string, lineId?: string) => void;
  onConvertSegmentToPoints?: (commandIndex: number, pieceId?: string, lineId?: string) => void;
  onConvertSegmentToBezier?: (commandIndex: number, pieceId?: string, lineId?: string) => void;
```

En `CurationCtx`, debajo de `segmentIsCurve`:

```ts
  /** La interna del tramo, en Q (spec 2026-09-24 § 4.4); sin ella, el contorno. */
  segmentLineId?: string;
```

`isManagedSplineSegment` lee el path de esa línea:

```ts
const pathDelTramo = (ctx: CurationCtx) => (ctx.segmentLineId
  ? ctx.piece?.internals.find(l => l.id === ctx.segmentLineId)?.path
  : ctx.piece?.outline);
const isManagedSplineSegment = (ctx: CurationCtx) => {
  const path = pathDelTramo(ctx);
  if (!path || ctx.segmentIndex === undefined || !notLocked(ctx)) return false;
  const run = splineRunAt(path, ctx.segmentIndex);
  return !!run && isSplineManaged(path, run);
};
```

Y los tres `run` pasan `ctx.segmentLineId` al final:

```ts
    run: (ctx) => ctx.cb.onConvertSegment?.(ctx.segmentIndex!, !ctx.segmentIsCurve, ctx.pieceId ?? undefined, ctx.segmentLineId) },
```

```ts
    run: (ctx) => ctx.cb.onConvertSegmentToPoints?.(ctx.segmentIndex!, ctx.pieceId ?? undefined, ctx.segmentLineId) },
```

```ts
    run: (ctx) => ctx.cb.onConvertSegmentToBezier?.(ctx.segmentIndex!, ctx.pieceId ?? undefined, ctx.segmentLineId) },
```

En `ContextMenu.tsx`, `ContextMenuState` gana `segmentLineId?: string;` (debajo de `segmentIsCurve`) y el `ctx` lo pasa: `segmentIndex: menu.segmentIndex, segmentIsCurve: menu.segmentIsCurve, segmentLineId: menu.segmentLineId,`.

- [ ] **Step 4: `PatternEditor.tsx`**

1. `nodoSeleccionado` pasa a leer el hook:

```ts
  // El punto en edición, solo cuando hay UNO, de cualquier línea (spec
  // 2026-09-24 § 4.5). «Un punto» es un grupo de anclas coincidentes:
  // `puntoElegido` ya lo resuelve así (el DXF de María trae dos índices por
  // esquina; comentario de hoy sobre #1112).
  const nodoSeleccionado = activeTool === 'editPattern' ? editPatternTool.puntoElegido : null;
```

2. En `suppressLengths`, `(activeTool === 'editPattern' && editPatternTool.selectedNodes.size > 0)` pasa a `(activeTool === 'editPattern' && editPatternTool.hayPuntosElegidos)`.

3. En `aplicarCota`, la rama `'nodo'`:

```ts
      editPatternRef.current.moveNodeTo(update.pieceId, update.commandIndex, update.destino, update.lineId);
```

4. En `handleContextMenu`, antes de `setCtxMenu({…})`, sustituye el cálculo de `elegido` / `derechoSobreElPuntoElegido` por uno que vale para cualquier línea, y añade el tramo de interna:

```ts
    // En Q, lo que agarraría ese mismo press decide sobre qué habla el menú
    // (spec 2026-09-24 § 4.4): un tramo de interna, o el punto ya elegido.
    const agarreQ = activeTool === 'editPattern'
      ? editPatternTool.agarreEn(e as React.MouseEvent<SVGSVGElement>)
      : null;
    let segmentLineId: string | undefined;
    if (agarreQ?.tipo === 'tramo' && agarreQ.clave !== CLAVE_CONTORNO && hitPiece?.id === editPatternTool.editingPieceId) {
      segmentLineId = lineIdDeClave(agarreQ.clave) ?? undefined;
      const cmd = hitPiece.internals.find(l => l.id === segmentLineId)?.path[agarreQ.commandIndex];
      segmentIndex = agarreQ.commandIndex;
      segmentIsCurve = cmd?.type === 'C' || cmd?.type === 'Q';
    }
    const elegido = editPatternTool.puntoElegido;
    const derechoSobreElPuntoElegido = !!elegido && agarreQ?.tipo === 'punto'
      && (lineIdDeClave(agarreQ.clave) ?? undefined) === elegido.lineId
      && anchorGroupOf(
        (elegido.lineId ? hitPiece?.internals.find(l => l.id === elegido.lineId)?.path : hitPiece?.outline) ?? [],
        elegido.commandIndex,
      ).includes(agarreQ.commandIndex);
```

y pasa `segmentLineId` en el `setCtxMenu({ … segmentIndex, segmentIsCurve, segmentLineId, … })`. Añade `editPatternTool.agarreEn` y `editPatternTool.puntoElegido` a las dependencias; `editPatternTool.selectedNodes` y `editPatternTool.nodes` salen si ya no se leen. Imports: `CLAVE_CONTORNO`, `lineIdDeClave` de `./lineaEditable`; `anchorGroupOf` de `./nodeEditorUtils`.

5. Los callbacks del `<ContextMenu>`: con `lineId` no se salta a V, porque V todavía no edita internas (fase 5, spec § 6):

```tsx
        onConvertSegment={(idx, toCurve, pieceId, lineId) => {
          editPatternTool.convertSegment(idx, toCurve, pieceId, lineId);
          if (!lineId) showConvertedPoints(pieceId);
        }}
        onConvertSegmentToPoints={(idx, pieceId, lineId) => {
          editPatternTool.convertSegmentToPoints(idx, pieceId, lineId);
          if (!lineId) showConvertedPoints(pieceId);
        }}
        onConvertSegmentToBezier={(idx, pieceId, lineId) => {
          editPatternTool.convertSegmentToBezier(idx, pieceId, lineId);
          if (!lineId) showConvertedPoints(pieceId);
        }}
```

- [ ] **Step 5: comprobar que pasan, y lo de antes**

Run: `npx vitest run src/components/PatternEditor/cotas src/components/PatternEditor/__tests__/actionCuration.internas.test.ts src/components/PatternEditor/__tests__/ContextMenu.curation.test.tsx src/components/PatternEditor/__tests__/1167-puerta-de-lado.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 6: tipos, lint y commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/PatternEditor/cotas/sujeto.ts src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/ContextMenu.tsx src/components/PatternEditor/actionCuration.ts src/components/PatternEditor/cotas/__tests__/sujeto.internas.test.ts src/components/PatternEditor/__tests__/actionCuration.internas.test.ts --max-warnings=0`

```bash
git add src/components/PatternEditor/cotas/sujeto.ts src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/ContextMenu.tsx src/components/PatternEditor/actionCuration.ts src/components/PatternEditor/cotas/__tests__/sujeto.internas.test.ts src/components/PatternEditor/__tests__/actionCuration.internas.test.ts
git commit -m "feat(2d): cotas del punto y menú de tramo sobre una interna en Q (frontera, fase 2)"
```

---

### Task 12: la pieza en edición gana el clic

Con A en edición y B encima, un press sobre algo de A que queda bajo el relleno de B se queda en A (spec § 3.4, la fila «lo de la pieza en edición»). Hoy el DOM decide que es B y cambia de pieza.

**Files:**
- Modify: `src/components/PatternEditor/useEditorInteractions.ts` (interfaz `editPattern` ~línea 200 y el cambio de pieza ~línea 875)
- Modify: `src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx`

**Interfaces:**
- Consumes: `editPattern.agarreEn` (Tarea 8). En la interfaz del enrutador va opcional, para no romper los dobles de prueba de hoy.

- [ ] **Step 1: el test que falla**

En `useEditorInteractions.grammar.test.tsx`, dentro de `describe('cambiar de pieza sin salir de "Editar patrón" (nota de María #170)', …)`:

```tsx
  it('con algo de la pieza en edición bajo el cursor, otra pieza encima no le quita el sujeto (spec 2026-09-24 § 3.4)', () => {
    const editPattern = {
      ...editingP1(),
      agarreEn: vi.fn(() => ({ clave: 'interna:L', tipo: 'punto', commandIndex: 0, distancia: 0 })),
    };
    const { hook } = setup('editPattern', [pieceP1(), pieceP2()], makeTools({ editPattern }));
    act(() => { hook.result.current.handleMouseDown(downOn('p2', 50, 50)); });
    expect(editPattern.enterEdit).not.toHaveBeenCalled();
    expect(editPattern.handleMouseDown).toHaveBeenCalled();
  });
```

Run: `npx vitest run src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx`
Expected: FAIL — `enterEdit` se llama con `'p2'`.

- [ ] **Step 2: el enrutador**

En la interfaz `editPattern`:

```ts
    /** Qué agarraría el press en la pieza en edición (spec 2026-09-24 § 3.4). */
    agarreEn?: (e: React.MouseEvent<SVGSVGElement>) => unknown;
```

Y la condición del cambio de pieza:

```ts
      // … (comentario de hoy) … Salvo que el press agarre algo de la pieza en
      // edición: entonces gana ella aunque otra pieza la tape (spec
      // 2026-09-24 § 3.4, «en Q, la que se está editando»).
      if (e.button === 0 && clicked && clicked !== editPattern.editingPieceId && !editPattern.agarreEn?.(e)) {
```

- [ ] **Step 3: comprobar, tipos, lint y commit**

Run: `npx vitest run src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx && npx tsc -b --noEmit && npx eslint src/components/PatternEditor/useEditorInteractions.ts src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx --max-warnings=0`
Expected: PASS y sin avisos.

```bash
git add src/components/PatternEditor/useEditorInteractions.ts src/components/PatternEditor/__tests__/useEditorInteractions.grammar.test.tsx
git commit -m "fix(2d): en Q, la pieza en edición gana el clic aunque otra la tape (frontera, fase 2)"
```

---

### Task 13: el e2e, en un navegador de verdad

**Files:**
- Create: `tests/e2e/q-edita-internas.spec.ts`
- Modify: `scripts/deploy-prod.sh` (lista de e2e del gate, ~línea 176)

- [ ] **Step 1: el spec**

Crea `tests/e2e/q-edita-internas.spec.ts`:

```ts
/**
 * Editar patrón edita las internas (spec 2026-09-24, fase 2).
 *
 * María, 10-09 [10:05]: «el patrón lo puedo mover? no puedes editar las
 * internas, ok, así hay que arreglarlo». Y justo después [10:11]-[10:29]:
 * «decir que ahora quiero hacer curva o hacer una recta y editar puntos de
 * curva». Esto lo recorre en un navegador: jsdom no ve qué recibe el clic ni
 * qué se pinta encima de qué.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { activarHerramienta, addPiece, clickAt, dispatch, st, toScreen, type Cmd } from './helpers/lienzo';

type Linea = { id: string; type: string; path: Cmd[] };
const internas = async (page: Page, pieceId = 'A') =>
  ((await st(page)).project.pieces.find(p => p.id === pieceId)!.internals as Linea[]);
const anclas = (path: Cmd[]) => path.filter(c => c.type !== 'Z').map(c => c.values.slice(-2));

async function arrastrar(page: Page, desde: { x: number; y: number }, hasta: { x: number; y: number }) {
  const a = await toScreen(page, desde);
  const b = await toScreen(page, hasta);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

test.describe('Q edita las internas', () => {
  test.setTimeout(120_000);

  test('su secuencia del 10-09: dibuja, edita en Q, convierte y cada gesto se deshace de una vez', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 100, y: 100 }, 300, 200);

    // La Línea interna, como ella: dos clics y un arrastre (Bézier), Enter.
    await activarHerramienta(page, 'g', 'internalShape');
    await clickAt(page, { x: 150, y: 150 });
    await clickAt(page, { x: 250, y: 150 });
    await arrastrar(page, { x: 350, y: 250 }, { x: 380, y: 265 });
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await internas(page)).length).toBe(1);
    const recienDibujada = (await internas(page))[0].path;

    await activarHerramienta(page, 'q', 'editPattern');
    // 1. El punto del medio, 30 mm arriba.
    await arrastrar(page, { x: 250, y: 150 }, { x: 250, y: 120 });
    expect(anclas((await internas(page))[0].path)[1]).toEqual([150, 20]);
    await expect(page.locator('.internal-line-endpoints')).toHaveCount(0);

    // 2. Clic derecho en el primer tramo → Convertir en curva por puntos.
    await clickAt(page, { x: 200, y: 135 }, 'right');
    await page.getByRole('button', { name: /curva por puntos/i }).click();
    await page.waitForTimeout(250);
    const convertida = (await internas(page))[0].path;
    expect(convertida.filter(c => c.type === 'C').length).toBeGreaterThan(1);
    expect((await st(page)).editor.activeTool, 'con una interna no se salta a V').toBe('editPattern');

    // 3. Uno de sus puntos, 10 mm abajo.
    const [px, py] = anclas(convertida)[1];
    await arrastrar(page, { x: 100 + px, y: 100 + py }, { x: 100 + px, y: 110 + py });
    expect(anclas((await internas(page))[0].path)[1]).toEqual([px, py + 10]);

    // Cada gesto, un deshacer.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await internas(page))[0].path).toEqual(convertida);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => anclas((await internas(page))[0].path)[1]).toEqual([150, 20]);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await internas(page))[0].path).toEqual(recienDibujada);
  });

  test('esquina a esquina: la esquina se mueve sola; elegida la interna, su extremo; y engancha exacto', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 100, y: 100 }, 200, 150);
    await dispatch(page, 'project/addInternalLine', { pieceId: 'A', line: { id: 'D', type: 'reference',
      path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 150] }] } });
    await activarHerramienta(page, 'q', 'editPattern');

    await arrastrar(page, { x: 100, y: 100 }, { x: 120, y: 110 });
    expect((await st(page)).project.pieces[0].outline[0].values).toEqual([20, 10]);
    expect(anclas((await internas(page))[0].path)[0]).toEqual([0, 0]);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await st(page)).project.pieces[0].outline[0].values).toEqual([0, 0]);

    // Elegir la interna (un clic en su tramo) y ahora el mismo sitio es suyo.
    await clickAt(page, { x: 200, y: 175 });
    await arrastrar(page, { x: 100, y: 100 }, { x: 140, y: 130 });
    expect(anclas((await internas(page))[0].path)[0]).toEqual([40, 30]);
    expect((await st(page)).project.pieces[0].outline[0].values).toEqual([0, 0]);

    // Y de vuelta, cerca de la esquina: engancha exacto.
    await arrastrar(page, { x: 140, y: 130 }, { x: 102, y: 101 });
    expect(anclas((await internas(page))[0].path)[0]).toEqual([0, 0]);
  });

  test('pieza girada: el punto de la interna va adonde va el puntero', async ({ page }) => {
    await waitForApp(page);
    await dispatch(page, 'project/addPiece', {
      id: 'A', name: 'A', rotation: 180, position: { x: 100, y: 100 },
      outline: [
        { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 150] },
        { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
      ],
      internals: [{ id: 'L', type: 'reference', path: [{ type: 'M', values: [50, 50] }, { type: 'L', values: [150, 50] }] }],
      mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
    });
    await page.waitForTimeout(300);
    await activarHerramienta(page, 'q', 'editPattern');
    // Girada 180° sobre (100,75): local (50,50) se ve en (100 + 150, 100 + 100) = (250,200).
    // 20 mm a la derecha en pantalla son 20 a la izquierda en local: (30,50), lejos de
    // todo borde, así que no engancha (a 10 mm del borde lo haría, y probaría otra cosa).
    await arrastrar(page, { x: 250, y: 200 }, { x: 270, y: 200 });
    const [x, y] = anclas((await internas(page))[0].path)[0];
    expect(x).toBeCloseTo(30, 6);
    expect(y).toBeCloseTo(50, 6);
  });

  test('Supr: en Q quita un punto; en Z, sobre un tramo del medio, parte la interna', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 100, y: 100 }, 300, 200);
    await dispatch(page, 'project/addInternalLine', { pieceId: 'A', line: { id: 'L', type: 'reference', path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] }, { type: 'L', values: [20, 120] },
    ] } });
    await activarHerramienta(page, 'q', 'editPattern');
    await clickAt(page, { x: 220, y: 220 });
    await page.keyboard.press('Delete');
    expect(anclas((await internas(page))[0].path)).toEqual([[20, 20], [120, 20], [20, 120]]);

    await page.keyboard.press('ControlOrMeta+z');
    await activarHerramienta(page, 'z', 'select');
    await clickAt(page, { x: 220, y: 170 });
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await internas(page)).length).toBe(2);
    expect((await st(page)).project.pieces).toHaveLength(1);
  });
});
```

- [ ] **Step 2: correrlo**

Con el servidor de Vina en 5174 comprobado:

Run: `npx playwright test tests/e2e/q-edita-internas.spec.ts --workers=1`
Expected: 4 passed. Si uno falla, se diagnostica en navegador con la caja negra (`leerBitacora`) antes de tocar la expectativa, con la skill `superpowers:systematic-debugging`.

- [ ] **Step 3: al gate de deploy**

En `scripts/deploy-prod.sh`, en la lista de e2e, debajo de `tests/e2e/shift-endereza-a-la-hoja.spec.ts \`:

```sh
  tests/e2e/q-edita-internas.spec.ts \
```

- [ ] **Step 4: commit**

```bash
git add tests/e2e/q-edita-internas.spec.ts scripts/deploy-prod.sh
git commit -m "test(e2e): Q edita las internas — su secuencia del 10-09, esquina a esquina, girada y Supr (frontera, fase 2)"
```

---

### Task 14: registro y cierre de la fase 2 (PR 2)

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-frontera-seleccionar-editar-design.md` (§ 14)
- Modify: `docs/reports/2026-09-10-reunion-maria.md` (al final)

- [ ] **Step 1: el registro de la spec**

En § 14 de la spec, añade:

```markdown
- **Fases 1 y 2 hechas** (PR 1: núcleo sin cambios; PR 2: Q edita las internas). Q agarra, arrastra, endereza con Shift, engancha, inserta, borra y convierte puntos y tramos de las internas de forma propia; Supr sobre un tramo de interna quita solo ese tramo, también en Z. Quedan la fase 3 (trazos en Q), la 4 (Z deja de deformar) y la 5 (V), cada una con su plan.
```

- [ ] **Step 2: el informe del 10-09**

Al final de `docs/reports/2026-09-10-reunion-maria.md`:

```markdown
---

## 10. La queja 16, en marcha — 2026-09-24

*"el patrón lo puedo mover? no puedes editar las internas, ok, así hay que arreglarlo"* [10:05].

Decidido por Samuel el 24-09 como la frontera entera del contrato del 08-09 § 4 (spec `docs/superpowers/specs/2026-09-24-frontera-seleccionar-editar-design.md`). Hechas las fases 1 y 2: en `Q` ya se editan las internas de forma propia —mover puntos y tramos, Shift, enganche, insertar, borrar y pasar un tramo a curva por puntos, lo que pidió en [10:16]—, y Supr sobre un tramo quita solo ese tramo. Falta que `Z` deje de editar (fase 4): hasta entonces, su pregunta del 30-08 y del 07-09 —*"¿cuál es la diferencia?"*— sigue con respuesta a medias.
```

- [ ] **Step 3: gate completo**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo en verde; el trinquete, con el techo nuevo de la Tarea 10.

Run (servidor de Vina en 5174 comprobado): los 17 e2e de Q del cierre de la fase 1, más `tests/e2e/q-edita-internas.spec.ts`.
Expected: todos en verde; el recorrido del 07-09, 13 de 13.

- [ ] **Step 4: commit y PR 2**

```bash
git add docs/superpowers/specs/2026-09-24-frontera-seleccionar-editar-design.md docs/reports/2026-09-10-reunion-maria.md
git commit -m "docs: la frontera, fases 1 y 2 hechas — registro en la spec y en el informe del 10-09"
```

La PR 2 la abre la skill `superpowers:finishing-a-development-branch`, con la usuaria delante.

---

## Lo que queda para los planes siguientes

| Fase | Qué | Por qué espera |
|---|---|---|
| 3 | Q edita trazos (spec § 3.1, trazo como objeto) | necesita un `Linea` de trazo con marco de patrón; la forma exacta sale del núcleo ya en `main` |
| 4 | Z deja de deformar, doble clic a Q, Esc a Z, pista nueva (spec § 5) | va después de 2 y 3, para que nada se quede sin poder editarse |
| 5 | V sobre internas y trazos (spec § 6), opcional | el último; se puede quitar sin que cambie el resto |

Y un hueco anterior a esta obra, anotado y fuera de ella: `removeInternalLine` y `removeTramosDeInterna` no pasan por `linkedEditingMiddleware`. En una pieza vinculada, borrar o partir una interna no se copia a su pareja; mover sus puntos sí, porque va por `updatePiece`.
