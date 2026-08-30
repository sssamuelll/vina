# Cotas vivas — PR A: cotas de pieza, tira y desmontaje de la barra

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que María cree un rectángulo con un clic y corrija **esa** pieza escribiendo o arrastrando sus cotas de Ancho/Alto sobre el lienzo (#223/#225), con la barra acoplada desmontada y una tira de herramienta en la esquina del lienzo.

**Architecture:** Un motor puro (`pieceResize.ts`) extraído del flujo del transform box y compartido por el handle y la cota; un descriptor puro (`cotas.ts`) que convierte una pieza en dos `Cota`; una capa HTML de chips (`CotasLayer` + `CotaChip`) anclada como `FloatingActionBar` y una capa SVG de líneas de cota dentro del grupo pan-zoom; la tira (`ToolStrip2D`) que hereda los controles de `ToolOptionsBar2D`. El commit de una cota es un `updatePiece`; el scrub va dentro de un batch de deshacer con token.

**Tech Stack:** React 18, Redux Toolkit, Vitest + RTL (jsdom), Playwright, plain CSS con tokens.

**Spec:** `docs/superpowers/specs/2026-08-30-cotas-vivas-design.md` (§ 3 pieza, § 4.3, § 4.4, § 5, § 6, § 7, § 8, § 9, § 10). Mapa técnico: `docs/superpowers/specs/_trazado-cotas-vivas.md`.

## Global Constraints

- Rama `feat/cotas-vivas`. Commits pequeños; nunca `--no-verify`.
- Gates antes de cada commit de código: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. Los trinquetes R1 (`var(--x, fallback)`), R3 (color literal en `.tsx`/`.css`), R5 (`:hover` sin `:focus-visible`), R8 (`z-index` literal) **no pueden subir**.
- Tokens nuevos **solo** en `src/styles/tokens.css` (spec § 9). Nada de colores literales en componentes.
- Texto visible en español de Venezuela, sentence case, sin "¡" ni "por favor". `aria-label` en español.
- IDs con `newId()`; ninguna dependencia nueva.
- Teclas: un `<input>` nativo es dueño de sus teclas (CF-1 `isEditableTarget`); el router no se toca salvo el caso `Tab` del Task 6.
- Nada de `type="number"` en los chips (spec § 5.3): `type="text" inputMode="decimal"`.
- E2E con servidor caliente en el puerto 5174 (`npx vite --port 5174`) y `--workers=4` (memoria `e2e-vina-servidor-caliente-y-pocos-workers`); verifica el `<title>` antes de medir.
- Todo emplazamiento (`position`, `overflow`, capas, foco) se prueba en navegador, no en jsdom.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/components/PatternEditor/pieceResize.ts` (nuevo) | `TransformUpdate`, `transformInternals`, `scalePiecesAroundAnchor`, `resizePieceTo` — geometría pura del redimensionado |
| `src/components/PatternEditor/useTransformTool.ts` (mod. `:207-269`) | usa `scalePiecesAroundAnchor`; importa `TransformUpdate` desde `pieceResize` (re-export) |
| `src/components/PatternEditor/cotas/parseMedida.ts` (nuevo) | `parseMedida`, `formatMedida` |
| `src/components/PatternEditor/cotas/cotas.ts` (nuevo) | tipo `Cota` y `cotasDePieza(piece)` |
| `src/components/PatternEditor/cotas/CotaChip.tsx` (nuevo) | un chip: reposo (`button`) / edición (`input`) / scrub |
| `src/components/PatternEditor/cotas/CotasLayer.tsx` (nuevo) | capa HTML: posiciona chips con pan/zoom, expone `focusFirst()` |
| `src/components/PatternEditor/cotas/CotaLines.tsx` (nuevo) | capa SVG: líneas de cota con ticks (dentro del grupo pan-zoom) |
| `src/components/PatternEditor/cotas/cotas.css` (nuevo) | estilos de chips con tokens; `:hover` + `:focus-visible` |
| `src/components/PatternEditor/ToolStrip2D.tsx` + `.css` (nuevo) | la tira: nombre + atajo + línea de sujeto + controles |
| `src/components/PatternEditor/ToolOptionControls.tsx` (nuevo, movido) | `Control` y `NumberInput` que hoy viven en `ToolOptionsBar2D.tsx:78-206` |
| `src/components/PatternEditor/useRectangleTool.ts` (mod.) | expone `lastCreatedId` (creación caliente) |
| `src/components/PatternEditor/PatternEditor.tsx` (mod.) | monta capas y tira; `handleCotaCommit` / scrub; `handlePieceComplete` devuelve el id; línea de sujeto |
| `src/components/PatternEditor/useEditorInteractions.ts` (mod. `routeKey`) | `Tab` desde el lienzo enfoca el primer chip |
| `src/components/PatternEditor/renderers/HintText.tsx` (mod.) | pista del rectángulo y de pieza con cotas |
| `src/components/PatternEditor/NextPointPanel.css` (mod.) | de `fixed` a `absolute` dentro de `.pattern-editor` (se conserva hasta el PR B); la tira se oculta mientras está abierto |
| `src/components/shell/AppShell.tsx` (mod. `:293`), `src/styles/layout.css` (mod. `:36-54`) | desmontar la canaleta |
| `src/components/shell/ToolOptionsBar2D.tsx` + `.css` + test (borrar) | muere |
| `src/styles/tokens.css` (mod.) | tokens de § 9 |
| `.claude/skills/contrato-de-interfaz/SKILL.md` (mod.) | enmienda § 10.4/10.5 |
| `tests/e2e/cotas-de-pieza.spec.ts`, `tests/e2e/emplazamiento-tira.spec.ts` (nuevos); `tests/e2e/maria-191-rectangulo-con-medidas.spec.ts` (reescrito); `tests/e2e/barra-opciones-herramienta.spec.ts` (borrar) | la red en navegador |

---

### Task 1: Extraer el redimensionado a `pieceResize.ts` y darle `resizePieceTo`

**Files:**
- Create: `src/components/PatternEditor/pieceResize.ts`
- Modify: `src/components/PatternEditor/useTransformTool.ts:40-70` (tipos/helpers) y `:207-269` (bloque de escala)
- Test: `src/components/PatternEditor/__tests__/pieceResize.test.ts`

**Interfaces:**
- Consumes: `computeBoundingBox`, `scaleOutline`, `scaleAnchorForHandle`, `rotatePoint`, `bboxPivot`, `outlineBBoxCenter`, `BBox` de `src/utils/geometry/transform.ts`; `patternToPieceLocal`, `pieceLocalToPattern` de `./pieceTransform`; `reanchorTransformedNotches` de `src/utils/notchReanchor`.
- Produces: `export interface TransformUpdate { id: string; outline: PatternPiece['outline']; position: Point2D; internals: PatternPiece['internals']; rotation: number }`; `export function scalePiecesAroundAnchor(snapshot: PatternPiece[], bbox: BBox, scaleX: number, scaleY: number, anchorUnrotated: Point2D): TransformUpdate[]`; `export function resizePieceTo(piece: PatternPiece, widthMm: number, heightMm: number): TransformUpdate | null`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/components/PatternEditor/__tests__/pieceResize.test.ts
import { describe, it, expect } from 'vitest';
import { resizePieceTo, scalePiecesAroundAnchor } from '../pieceResize';
import { computeBoundingBox, scaleAnchorForHandle } from '../../../utils/geometry/transform';
import { pieceLocalToPattern } from '../pieceTransform';
import { resolveNotchAnchor } from '../../../utils/notchAnchor';
import type { PatternPiece, PathCommand } from '../../../types/types';

const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] },
  { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];
const pieza = (over: Partial<PatternPiece> = {}): PatternPiece => ({
  id: 'p1', name: 'P1', outline: rect(100, 100), internals: [], position: { x: 50, y: 50 },
  rotation: 0, mirrored: false, seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0,
  ...over,
} as PatternPiece);
const bboxDe = (p: PatternPiece) => {
  const b = computeBoundingBox([p], [p.id])!;
  return { w: b.width, h: b.height };
};

describe('resizePieceTo', () => {
  it('sin giro: escribe el ancho y el alto y deja la esquina superior izquierda plantada', () => {
    const p = pieza();
    const u = resizePieceTo(p, 300, 150)!;
    expect(u.id).toBe('p1');
    const after = { ...p, ...u };
    expect(bboxDe(after)).toEqual({ w: 300, h: 150 });
    // nw en coordenadas de patrón: (50,50) antes y después
    expect(u.position).toEqual({ x: 50, y: 50 });
    expect(u.outline[0].values).toEqual([0, 0]);
  });

  it('con giro de 30°: conserva la rotación, la esquina superior izquierda no se mueve en patrón, y las internas y el piquete acompañan', () => {
    const p = pieza({
      rotation: 30,
      internals: [
        { id: 'l1', type: 'reference', path: [{ type: 'M', values: [10, 10] }, { type: 'L', values: [90, 90] }] },
        { id: 'n1', type: 'notch', path: [{ type: 'M', values: [50, 0] }, { type: 'L', values: [50, 6] }],
          notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 50, metric: 2 } },
      ],
    });
    const nwAntes = pieceLocalToPattern({ x: 0, y: 0 }, p);
    const u = resizePieceTo(p, 200, 100)!;
    const after = { ...p, ...u };
    expect(u.rotation).toBe(30);
    expect(bboxDe(after)).toEqual({ w: 200, h: 100 });
    const nwDespues = pieceLocalToPattern({ x: 0, y: 0 }, after);
    expect(nwDespues.x).toBeCloseTo(nwAntes.x, 6);
    expect(nwDespues.y).toBeCloseTo(nwAntes.y, 6);
    // la interna se escaló con el contorno (x2, y1): (10,10)→(20,10), (90,90)→(180,90)
    expect(u.internals[0].path[1].values[0]).toBeCloseTo(180, 6);
    expect(u.internals[0].path[1].values[1]).toBeCloseTo(90, 6);
    // el piquete sigue anclado sobre el contorno nuevo
    const notch = u.internals[1];
    const resolved = resolveNotchAnchor(u.outline, notch.notchAnchor!)!;
    expect(resolved.point.y).toBeCloseTo(0, 6);
  });

  it('es el mismo camino que el handle: scalePiecesAroundAnchor con el ancla del handle "se" da el mismo resultado', () => {
    const p = pieza({ rotation: 30 });
    const bbox = computeBoundingBox([p], [p.id])!;
    const porHandle = scalePiecesAroundAnchor([p], bbox, 2, 0.5, scaleAnchorForHandle('se', bbox))[0];
    const porCota = resizePieceTo(p, 200, 50)!;
    expect(porCota).toEqual(porHandle);
  });

  it('devuelve null con medidas no positivas o pieza sin área', () => {
    expect(resizePieceTo(pieza(), 0, 100)).toBeNull();
    expect(resizePieceTo(pieza({ outline: [] }), 100, 100)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver el fallo correcto**

Run: `npx vitest run src/components/PatternEditor/__tests__/pieceResize.test.ts`
Expected: FAIL — `Cannot find module '../pieceResize'`.

- [ ] **Step 3: Crear `pieceResize.ts` moviendo el bloque de `useTransformTool`**

```ts
// src/components/PatternEditor/pieceResize.ts
import type { PatternPiece, PathCommand, Point2D } from '../../types/types';
import {
  computeBoundingBox, scaleOutline, scaleAnchorForHandle, rotatePoint, bboxPivot,
  outlineBBoxCenter, type BBox,
} from '../../utils/geometry/transform';
import { patternToPieceLocal, pieceLocalToPattern } from './pieceTransform';
import { reanchorTransformedNotches } from '../../utils/notchReanchor';

export interface TransformUpdate {
  id: string;
  outline: PatternPiece['outline'];
  position: Point2D;
  internals: PatternPiece['internals'];
  /** Grados. El giro es declarativo desde #1033. */
  rotation: number;
}

/** Las internas viajan con el contorno; los piquetes se re-anclan (María #171). */
export function transformInternals(
  snap: PatternPiece,
  newOutline: PatternPiece['outline'],
  mapPath: (path: PathCommand[]) => PathCommand[],
  mapPoint: (pt: Point2D) => Point2D,
): PatternPiece['internals'] {
  const mapped = snap.internals.map(line => ({ ...line, path: mapPath(line.path) }));
  return reanchorTransformedNotches(mapped, snap.outline, newOutline, mapPoint);
}

/**
 * Escala un grupo de piezas alrededor de un ancla dada en el marco SIN girar
 * de la caja. Es el bloque que vivía en `useTransformTool.handleMouseUp`
 * (#1066, maria-198): el handle y la cota escrita pasan por aquí, así que
 * "Ancho = 300" y arrastrar el manejador son la misma operación.
 */
export function scalePiecesAroundAnchor(
  snapshot: PatternPiece[],
  bbox: BBox,
  scaleX: number,
  scaleY: number,
  anchorUnrotated: Point2D,
): TransformUpdate[] {
  const radCaja = ((bbox.rotation ?? 0) * Math.PI) / 180;
  const anchorPatron = radCaja ? rotatePoint(anchorUnrotated, bboxPivot(bbox), radCaja) : anchorUnrotated;
  const updates: TransformUpdate[] = [];
  for (const snap of snapshot) {
    const localCenter = patternToPieceLocal(anchorPatron, snap);
    const rad = ((snap.rotation ?? 0) * Math.PI) / 180;
    const newOutline = scaleOutline(snap.outline, localCenter, scaleX, scaleY);
    const plantado = pieceLocalToPattern(localCenter, snap);
    const nuevoCentro = outlineBBoxCenter(newOutline);
    const alNuevoPivote = rotatePoint(localCenter, nuevoCentro, rad);
    updates.push({
      id: snap.id,
      outline: newOutline,
      position: { x: plantado.x - alNuevoPivote.x, y: plantado.y - alNuevoPivote.y },
      rotation: snap.rotation ?? 0,
      internals: transformInternals(
        snap, newOutline,
        path => scaleOutline(path, localCenter, scaleX, scaleY),
        pt => ({ x: localCenter.x + (pt.x - localCenter.x) * scaleX, y: localCenter.y + (pt.y - localCenter.y) * scaleY }),
      ),
    });
  }
  return updates;
}

/** "Como si arrastraras el manejador inferior derecho": la esquina superior izquierda queda plantada. */
export function resizePieceTo(piece: PatternPiece, widthMm: number, heightMm: number): TransformUpdate | null {
  if (!(widthMm > 0) || !(heightMm > 0)) return null;
  const bbox = computeBoundingBox([piece], [piece.id]);
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;
  const anchor = scaleAnchorForHandle('se', bbox);
  return scalePiecesAroundAnchor([piece], bbox, widthMm / bbox.width, heightMm / bbox.height, anchor)[0];
}
```

En `useTransformTool.ts`: borrar `TransformUpdate` y `transformInternals` locales, `export type { TransformUpdate } from './pieceResize'` (para no romper importadores), `import { scalePiecesAroundAnchor } from './pieceResize'`, y reemplazar el bloque `:207-269` (desde `const anchor = scaleAnchorForHandle(...)` hasta el cierre del `for`) por:

```ts
      const anchor = scaleAnchorForHandle(d.handleId, snappedBbox);
      updates.push(...scalePiecesAroundAnchor(d.piecesSnapshot, snappedBbox, scaleX, scaleY, anchor));
```

Quitar los imports que queden sin uso (`rotatePoint`, `bboxPivot`, `outlineBBoxCenter`, `patternToPieceLocal`, `pieceLocalToPattern`, `reanchorTransformedNotches`) solo si el resto del archivo no los usa (`rotatePoint`/`bboxPivot`/`outlineBBoxCenter` sí se usan en el giro: se quedan).

- [ ] **Step 4: Correr los tests nuevos y los del transform**

Run: `npx vitest run src/components/PatternEditor/__tests__/pieceResize.test.ts src/components/PatternEditor/__tests__/useTransformTool` (y `npx vitest run -t "transform"` si el glob no encuentra nada)
Expected: PASS. Si el test de igualdad falla por un `toEqual` con `-0`, usar `toBeCloseTo` campo a campo — pero el camino debe ser el mismo.

- [ ] **Step 5: Gate + commit**

```bash
npx tsc -b --noEmit && npx eslint src/components/PatternEditor/pieceResize.ts src/components/PatternEditor/useTransformTool.ts --max-warnings=0
git add src/components/PatternEditor/pieceResize.ts src/components/PatternEditor/useTransformTool.ts src/components/PatternEditor/__tests__/pieceResize.test.ts
git commit -m "refactor(2d): el escalado alrededor de un ancla sale del transform box a pieceResize.ts; resizePieceTo deja plantada la esquina superior izquierda"
```

---

### Task 2: `parseMedida` / `formatMedida`

**Files:**
- Create: `src/components/PatternEditor/cotas/parseMedida.ts`
- Test: `src/components/PatternEditor/cotas/__tests__/parseMedida.test.ts`

**Interfaces:**
- Produces: `parseMedida(texto: string): number | null` (acepta coma y punto, espacios; rechaza vacío, letras, notación `e`); `formatMedida(valor: number, unit: 'mm' | 'deg'): string` → `"300 mm"`, `"213,5 mm"`, `"37°"` (1 decimal como máximo, coma decimal, sin ceros de relleno).

- [ ] **Step 1: Tests**

```ts
// src/components/PatternEditor/cotas/__tests__/parseMedida.test.ts
import { describe, it, expect } from 'vitest';
import { parseMedida, formatMedida } from '../parseMedida';

describe('parseMedida', () => {
  it.each([
    ['300', 300], ['300,5', 300.5], ['300.5', 300.5], [' 12 ', 12], ['-45', -45], ['0', 0],
  ])('acepta %s', (texto, esperado) => expect(parseMedida(texto)).toBe(esperado));
  it.each([['', null], ['abc', null], ['1e3', null], ['3,0,0', null], ['30 mm', null]])('rechaza %s', (t, e) =>
    expect(parseMedida(t)).toBe(e));
});

describe('formatMedida', () => {
  it('mm con coma decimal y sin ceros de relleno', () => {
    expect(formatMedida(300, 'mm')).toBe('300 mm');
    expect(formatMedida(213.5, 'mm')).toBe('213,5 mm');
    expect(formatMedida(213.54, 'mm')).toBe('213,5 mm');
  });
  it('grados', () => expect(formatMedida(37, 'deg')).toBe('37°'));
});
```

- [ ] **Step 2: Ver fallar** — `npx vitest run src/components/PatternEditor/cotas/__tests__/parseMedida.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
// src/components/PatternEditor/cotas/parseMedida.ts
const NUMERO = /^-?\d+(?:[.,]\d+)?$/;

/** "300", "300,5", "300.5" → número; vacío, letras, `1e3`, "30 mm" → null. */
export function parseMedida(texto: string): number | null {
  const t = texto.trim();
  if (!NUMERO.test(t)) return null;
  return Number(t.replace(',', '.'));
}

/** Un decimal como máximo, coma decimal, sin ceros de relleno: "213,5 mm", "300 mm", "37°". */
export function formatMedida(valor: number, unit: 'mm' | 'deg'): string {
  const redondeado = Math.round(valor * 10) / 10;
  const texto = String(redondeado).replace('.', ',');
  return unit === 'deg' ? `${texto}°` : `${texto} mm`;
}
```

- [ ] **Step 4: Verde** — mismo comando → PASS.
- [ ] **Step 5: Commit** — `git add src/components/PatternEditor/cotas && git commit -m "feat(2d): parseMedida/formatMedida — coma o punto, sin unidades, un decimal"`

---

### Task 3: `cotasDePieza` — la pieza como dos cotas

**Files:**
- Create: `src/components/PatternEditor/cotas/cotas.ts`
- Test: `src/components/PatternEditor/cotas/__tests__/cotas.test.ts`

**Interfaces:**
- Consumes: `resizePieceTo`, `TransformUpdate` (Task 1); `computeBoundingBox`, `bboxPivot`, `rotatePoint` de `transform.ts`.
- Produces:

```ts
export interface Cota {
  id: string;                       // 'ancho' | 'alto' (PR B añade tramo/borde)
  kind: 'ancho' | 'alto';
  label: string;                    // aria-label: "Ancho de la pieza"
  valueMm: number;
  unit: 'mm' | 'deg';
  min: number; max: number;
  primary: boolean;                 // relleno (true) / hueco (false)
  /** Segmento de la línea de cota en coordenadas de PATRÓN, sin desplazar; `outward` es unitario, hacia fuera de la pieza. */
  a: Point2D; b: Point2D; outward: Point2D;
  apply(valueMm: number): TransformUpdate | null;
}
export function cotasDePieza(piece: PatternPiece): Cota[];
```

- [ ] **Step 1: Tests**

```ts
// src/components/PatternEditor/cotas/__tests__/cotas.test.ts
import { describe, it, expect } from 'vitest';
import { cotasDePieza } from '../cotas';
import type { PatternPiece, PathCommand } from '../../../../types/types';

const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] },
  { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];
const pieza = (over: Partial<PatternPiece> = {}): PatternPiece => ({
  id: 'p1', name: 'P1', outline: rect(200, 300), internals: [], position: { x: 10, y: 20 },
  rotation: 0, mirrored: false, seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, ...over,
} as PatternPiece);

describe('cotasDePieza', () => {
  it('sin giro: Ancho sobre el lado superior hacia arriba, Alto sobre el lado derecho hacia la derecha', () => {
    const [ancho, alto] = cotasDePieza(pieza());
    expect(ancho).toMatchObject({ id: 'ancho', kind: 'ancho', valueMm: 200, unit: 'mm', primary: true, min: 1, max: 3000 });
    expect(ancho.a).toEqual({ x: 10, y: 20 });
    expect(ancho.b).toEqual({ x: 210, y: 20 });
    expect(ancho.outward).toEqual({ x: 0, y: -1 });
    expect(alto).toMatchObject({ id: 'alto', valueMm: 300 });
    expect(alto.a).toEqual({ x: 210, y: 20 });
    expect(alto.b).toEqual({ x: 210, y: 320 });
    expect(alto.outward).toEqual({ x: 1, y: 0 });
    expect(ancho.label).toBe('Ancho de la pieza');
  });

  it('con giro de 90°: los segmentos y el "hacia fuera" giran con la caja', () => {
    const [ancho] = cotasDePieza(pieza({ rotation: 90 }));
    const dx = ancho.b.x - ancho.a.x, dy = ancho.b.y - ancho.a.y;
    expect(Math.hypot(dx, dy)).toBeCloseTo(200, 6);
    expect(Math.abs(dx)).toBeLessThan(1e-6);           // el lado "superior" ahora es vertical
    expect(Math.abs(ancho.outward.y)).toBeLessThan(1e-6);
    expect(Math.abs(ancho.outward.x)).toBeCloseTo(1, 6);
  });

  it('apply escribe esa dimensión y conserva la otra', () => {
    const [ancho, alto] = cotasDePieza(pieza());
    const u = ancho.apply(400)!;
    expect(u.outline[1].values).toEqual([400, 0]);
    expect(u.outline[2].values).toEqual([400, 300]);
    const v = alto.apply(50)!;
    expect(v.outline[2].values).toEqual([200, 50]);
  });

  it('pieza sin área → sin cotas', () => {
    expect(cotasDePieza(pieza({ outline: [] }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Ver fallar** → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
// src/components/PatternEditor/cotas/cotas.ts
import type { PatternPiece, Point2D } from '../../../types/types';
import { computeBoundingBox, bboxPivot, rotatePoint } from '../../../utils/geometry/transform';
import { resizePieceTo, type TransformUpdate } from '../pieceResize';

export interface Cota {
  id: string;
  kind: 'ancho' | 'alto';
  label: string;
  valueMm: number;
  unit: 'mm' | 'deg';
  min: number;
  max: number;
  primary: boolean;
  a: Point2D;
  b: Point2D;
  outward: Point2D;
  apply(valueMm: number): TransformUpdate | null;
}

const ANCHO_MIN = 1;
const ANCHO_MAX = 3000; // el mismo rango de rectangle.tsx

/** Gira un vector (no un punto) `rad` radianes en el sentido del render (Y hacia abajo). */
function giraVector(v: Point2D, rad: number): Point2D {
  if (!rad) return v;
  const r = rotatePoint(v, { x: 0, y: 0 }, rad);
  return { x: Math.abs(r.x) < 1e-12 ? 0 : r.x, y: Math.abs(r.y) < 1e-12 ? 0 : r.y };
}

/**
 * Las dos cotas de una pieza: Ancho sobre el lado superior de su caja, Alto
 * sobre el lado derecho, en el marco girado de la caja (`computeBoundingBox`
 * devuelve la caja SIN girar más `rotation`/`pivot`; `computeHandlePositions`
 * hace la misma conversión). Escribirlas es `resizePieceTo`: la esquina
 * superior izquierda queda plantada.
 */
export function cotasDePieza(piece: PatternPiece): Cota[] {
  const bbox = computeBoundingBox([piece], [piece.id]);
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return [];
  const rad = ((bbox.rotation ?? 0) * Math.PI) / 180;
  const pivot = bboxPivot(bbox);
  const R = (p: Point2D) => (rad ? rotatePoint(p, pivot, rad) : p);
  const nw = R({ x: bbox.x, y: bbox.y });
  const ne = R({ x: bbox.x + bbox.width, y: bbox.y });
  const se = R({ x: bbox.x + bbox.width, y: bbox.y + bbox.height });
  return [
    {
      id: 'ancho', kind: 'ancho', label: 'Ancho de la pieza', valueMm: bbox.width, unit: 'mm',
      min: ANCHO_MIN, max: ANCHO_MAX, primary: true,
      a: nw, b: ne, outward: giraVector({ x: 0, y: -1 }, rad),
      apply: (w) => resizePieceTo(piece, w, bbox.height),
    },
    {
      id: 'alto', kind: 'alto', label: 'Alto de la pieza', valueMm: bbox.height, unit: 'mm',
      min: ANCHO_MIN, max: ANCHO_MAX, primary: true,
      a: ne, b: se, outward: giraVector({ x: 1, y: 0 }, rad),
      apply: (h) => resizePieceTo(piece, bbox.width, h),
    },
  ];
}
```

Si `rotatePoint` gira en el sentido contrario al `rotate()` del SVG (comprobarlo con el test de 90°: `outward.x` debe ser `+1`, o sea, el lado superior girado 90° en pantalla queda a la derecha), invertir el signo de `rad` en `giraVector` y en `R` **solo si** `computeHandlePositions` también lo hace — mirar `transform.ts:138-166` y copiar su convención.

- [ ] **Step 4: Verde** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(2d): cotasDePieza — Ancho y Alto como cotas editables en el marco girado de la caja"` (añadir los archivos nuevos con `git add` antes).

---

### Task 4: Tokens y CSS de las cotas y la tira

**Files:**
- Modify: `src/styles/tokens.css` (junto a `--surface-overlay-*`, `:164-182`)
- Create: `src/components/PatternEditor/cotas/cotas.css`, `src/components/PatternEditor/ToolStrip2D.css`
- Modify: `.claude/skills/contrato-de-interfaz/SKILL.md` § 2 (tabla de materiales: variante `-flush` del overlay y la excepción de la tira)

- [ ] **Step 1: Tokens** — añadir tras `--surface-overlay-shadow-recessed`:

```css
  /* Bordes → tono (spec cotas vivas § 9): la tira y los chips se separan por
   * sombra, no por línea. Variante declarada del material overlay. */
  --surface-overlay-border-flush: 1px solid transparent;
  --surface-overlay-shadow-sheet: 0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 32px rgba(0, 0, 0, 0.35);
  /* Cotas sobre el papel: número que se escribe donde mide. */
  --cota-bg-2d: var(--accent-2d);
  --cota-ink-2d: #ffffff;
  --cota-line-2d: var(--accent-2d);
  --cota-edit-bg-2d: #ffffff;
  --cota-edit-ink-2d: var(--ink-on-light);
  --focus-rail: 3px solid var(--accent);
```

- [ ] **Step 2: `cotas.css`**

```css
/* Chips de cota (spec 2026-08-30 § 5). Capa HTML sobre el <svg>: la capa no
   recibe punteros, solo los chips. Todo sale de tokens (R3); cada :hover trae
   su :focus-visible (R5); sin z-index literal (R8): el orden del DOM manda. */
.cotas { position: absolute; inset: 0; pointer-events: none; }

.cota {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  height: 22px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--cota-bg-2d);
  color: var(--cota-ink-2d);
  font-family: var(--font-mono-2d);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 22px;
  white-space: nowrap;
  cursor: ew-resize;
  box-shadow: var(--surface-overlay-shadow-recessed);
  transition: transform 120ms ease-out, opacity 120ms ease-out;
}
.cota--hueca {
  background: var(--cota-edit-bg-2d);
  color: var(--cota-line-2d);
  border: 1px solid var(--cota-line-2d);
}
.cota:hover, .cota:focus-visible { transform: translate(-50%, calc(-50% - 1px)); }
.cota:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cota[aria-disabled='true'] { opacity: 0.45; cursor: default; }
.cota[aria-disabled='true']:hover, .cota[aria-disabled='true']:focus-visible { transform: translate(-50%, -50%); }

.cota--editando {
  width: 72px;
  cursor: text;
  background: var(--cota-edit-bg-2d);
  color: var(--cota-edit-ink-2d);
  border-left: var(--focus-rail);
  text-align: right;
}
.cota--editando:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cota--invalida { border-left-color: var(--destructive); }
```

- [ ] **Step 3: `ToolStrip2D.css`**

```css
/* La tira de herramienta: overlay persistente en la esquina del lienzo 2D
   (excepción declarada al contrato § 2, spec cotas vivas § 10.4). Material
   overlay entero en su variante sin borde. */
.tool-strip {
  position: absolute;
  top: 28px;                       /* 20 px de regla + 8 de aire */
  right: 12px;
  width: min(300px, calc(100% - 24px));
  z-index: var(--z-menu);
  padding: 14px 16px;
  background: var(--surface-overlay-bg);
  border: var(--surface-overlay-border-flush);
  border-radius: var(--surface-overlay-radius);
  box-shadow: var(--surface-overlay-shadow-sheet);
  color: var(--text-primary);
  font-size: var(--text-ui);
}
.tool-strip__head { display: flex; align-items: baseline; gap: 8px; }
.tool-strip__tool { font-weight: 600; font-size: var(--text-heading); }
.tool-strip__shortcut { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--text-muted); margin-left: auto; }
.tool-strip__subject { margin-top: 2px; font-size: var(--text-sm); color: var(--text-secondary); }
.tool-strip__options { display: grid; gap: 6px; margin-top: 10px; }
.tool-strip__item { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tool-strip__label { color: var(--text-secondary); font-size: var(--text-sm); }
.tool-strip__input, .tool-strip__select {
  height: 26px; min-width: 90px; padding: 0 8px;
  background: var(--bg-base); border: 0; border-radius: var(--radius-sm);
  color: var(--text-primary); font-size: var(--text-sm);
  font-variant-numeric: tabular-nums; text-align: right;
}
.tool-strip__input:focus-visible, .tool-strip__select:focus-visible, .tool-strip__toggle:focus-visible, .tool-strip__slider:focus-visible, .tool-strip__color:focus-visible {
  outline: 0; box-shadow: inset var(--focus-rail-inset);
}
.tool-strip__toggle {
  display: flex; align-items: center; gap: 6px; padding: 4px 8px;
  background: transparent; border: 0; border-radius: var(--radius-sm);
  color: var(--text-secondary); font-size: var(--text-sm); cursor: pointer;
}
.tool-strip__toggle--activo { color: var(--text-primary); background: var(--accent-subtle); }
.tool-strip__marca { width: 8px; height: 8px; border-radius: 2px; border: 1px solid currentColor; }
.tool-strip__toggle--activo .tool-strip__marca { background: currentColor; }
.tool-strip__toggle:hover { color: var(--text-primary); }
```

Añadir a `tokens.css` junto a `--focus-rail`: `--focus-rail-inset: 3px 0 0 0 var(--accent);` (riel como sombra interior, sin cambiar el layout del campo). Los cuatro selectores de `:focus-visible` van **en una sola línea** (el trinquete R5 empareja hover/focus línea a línea — nota en `ToolOptionsBar2D.css:123-131`).

- [ ] **Step 4: Enmienda al contrato** — en `.claude/skills/contrato-de-interfaz/SKILL.md`, tras "Variantes declaradas (no inventes más)…", añadir:

```
> Y `--surface-overlay-border-flush` (bordes → tono: la sombra separa, el
> borde queda para los campos). La usan la tira de herramienta del lienzo 2D
> y los chips de cota (spec 2026-08-30). **Excepción dicha:** la tira es un
> `overlay` que NO se va — está mientras hay herramienta 2D activa. Lo pidió
> Samuel el 2026-08-30; queda escrito para que no se vuelva regla tácita.
```

- [ ] **Step 5: Gate de UI** — `node scripts/ui-contract-lint.mjs` → ningún contador sube (R4 "archivos que definen tokens" sigue en 2: los tokens van en `tokens.css`). Commit: `git commit -am "feat(ui): tokens de cotas vivas y de la tira; variante flush del overlay; enmienda al contrato"` (con `git add` de los css nuevos).

---

### Task 5: `CotaChip` — reposo, edición y scrub

**Files:**
- Create: `src/components/PatternEditor/cotas/CotaChip.tsx`
- Test: `src/components/PatternEditor/cotas/__tests__/CotaChip.test.tsx`

**Interfaces:**
- Consumes: `Cota` (Task 3), `parseMedida`/`formatMedida` (Task 2), `DRAG_THRESHOLD_PX` de `../gestureConstants`.
- Produces:

```ts
export interface CotaChipProps {
  cota: Cota;
  left: number;                // px de pantalla, ya calculados por la capa
  top: number;
  zoom2D: number;
  disabled?: boolean;
  onCommit: (cota: Cota, valueMm: number) => void;
  onScrubStart: (cota: Cota) => void;
  onScrub: (cota: Cota, valueMm: number) => void;
  onScrubEnd: (cota: Cota, valueMm: number) => void;
}
export default function CotaChip(props: CotaChipProps): JSX.Element;
```

- [ ] **Step 1: Tests**

```tsx
// src/components/PatternEditor/cotas/__tests__/CotaChip.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CotaChip from '../CotaChip';
import type { Cota } from '../cotas';

afterEach(cleanup);

const cota = (over: Partial<Cota> = {}): Cota => ({
  id: 'ancho', kind: 'ancho', label: 'Ancho de la pieza', valueMm: 100, unit: 'mm', min: 1, max: 3000,
  primary: true, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, outward: { x: 0, y: -1 },
  apply: () => null, ...over,
});

function monta(over: Partial<React.ComponentProps<typeof CotaChip>> = {}) {
  const props = {
    cota: cota(), left: 50, top: 20, zoom2D: 1,
    onCommit: vi.fn(), onScrubStart: vi.fn(), onScrub: vi.fn(), onScrubEnd: vi.fn(),
    ...over,
  };
  render(<CotaChip {...props} />);
  return props;
}

describe('CotaChip — reposo', () => {
  it('es un botón con el valor formateado y el aria-label en español', () => {
    monta();
    const b = screen.getByRole('button', { name: 'Ancho de la pieza: 100 mm' });
    expect(b.textContent).toBe('100 mm');
    expect(b.style.left).toBe('50px');
    expect(b.style.top).toBe('20px');
  });
  it('un clic entra en edición con el valor seleccionado', () => {
    monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('100');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(document.activeElement).toBe(input);
  });
  it('deshabilitado: no entra en edición ni scrubea', () => {
    const p = monta({ disabled: true });
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(p.onScrubStart).not.toHaveBeenCalled();
  });
});

describe('CotaChip — edición', () => {
  it('Enter confirma UNA vez con el valor parseado y vuelve al botón con el foco', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '300,5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onCommit).toHaveBeenCalledTimes(1);
    expect(p.onCommit).toHaveBeenCalledWith(p.cota, 300.5);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });
  it('Escape descarta sin confirmar y devuelve el foco al botón', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(p.onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button').textContent).toBe('100 mm');
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });
  it('Tab confirma y NO detiene el Tab nativo (el foco sigue al siguiente)', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '150' } });
    const ev = fireEvent.keyDown(input, { key: 'Tab' });
    expect(p.onCommit).toHaveBeenCalledWith(p.cota, 150);
    expect(ev).toBe(true); // no se hizo preventDefault
  });
  it('blur con valor válido y distinto confirma; con el mismo valor o inválido no', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    let input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.blur(input);
    expect(p.onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button'));
    input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(p.onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button'));
    input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '120' } });
    fireEvent.blur(input);
    expect(p.onCommit).toHaveBeenCalledWith(p.cota, 120);
  });
  it('Enter con texto inválido no confirma y marca el campo', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '0' } }); // < min
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onCommit).not.toHaveBeenCalled();
    expect(input.className).toContain('cota--invalida');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
  it('flechas: ↑ +1, Shift+↑ +10, ↓ −1, y no confirman', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('101');
    fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });
    expect(input.value).toBe('111');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('110');
    expect(p.onCommit).not.toHaveBeenCalled();
  });
  it('las teclas dentro del campo no burbujean a window', () => {
    const espia = vi.fn();
    window.addEventListener('keydown', espia);
    monta();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Backspace' });
    expect(espia).not.toHaveBeenCalled();
    window.removeEventListener('keydown', espia);
  });
});

describe('CotaChip — scrub', () => {
  function pointer(el: Element, type: string, x: number, extra: Record<string, unknown> = {}) {
    fireEvent(el, new MouseEvent(type, { clientX: x, clientY: 0, bubbles: true, button: 0, ...extra }));
  }
  it('3 px no es scrub: el pointerup abre la edición', () => {
    const p = monta();
    const b = screen.getByRole('button');
    b.setPointerCapture = vi.fn(); b.releasePointerCapture = vi.fn();
    pointer(b, 'pointerdown', 100);
    pointer(b, 'pointermove', 103);
    pointer(b, 'pointerup', 103);
    fireEvent.click(b);
    expect(p.onScrubStart).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
  it('≥ 4 px es scrub: start una vez, move con Δx/zoom mm, end con el valor final; el clic posterior no abre la edición', () => {
    const p = monta({ zoom2D: 2 });
    const b = screen.getByRole('button');
    b.setPointerCapture = vi.fn(); b.releasePointerCapture = vi.fn();
    pointer(b, 'pointerdown', 100);
    pointer(b, 'pointermove', 110);     // Δ 10 px / zoom 2 = +5 mm
    pointer(b, 'pointermove', 140);     // Δ 40 px / 2 = +20 mm
    pointer(b, 'pointerup', 140);
    fireEvent.click(b);
    expect(p.onScrubStart).toHaveBeenCalledTimes(1);
    expect(p.onScrub).toHaveBeenNthCalledWith(1, p.cota, 105);
    expect(p.onScrub).toHaveBeenNthCalledWith(2, p.cota, 120);
    expect(p.onScrubEnd).toHaveBeenCalledWith(p.cota, 120);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('con Shift el paso es Δ/10 y el valor se acota a [min, max]', () => {
    const p = monta({ zoom2D: 1 });
    const b = screen.getByRole('button');
    b.setPointerCapture = vi.fn(); b.releasePointerCapture = vi.fn();
    pointer(b, 'pointerdown', 0);
    pointer(b, 'pointermove', 50, { shiftKey: true }); // 50 px → +5 mm
    expect(p.onScrub).toHaveBeenLastCalledWith(p.cota, 105);
    pointer(b, 'pointermove', -5000);                    // ↓ mucho → min
    expect(p.onScrub).toHaveBeenLastCalledWith(p.cota, 1);
    pointer(b, 'pointerup', -5000);
  });
});
```

- [ ] **Step 2: Ver fallar** — `npx vitest run src/components/PatternEditor/cotas/__tests__/CotaChip.test.tsx` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```tsx
// src/components/PatternEditor/cotas/CotaChip.tsx
import { useEffect, useRef, useState } from 'react';
import type { Cota } from './cotas';
import { parseMedida, formatMedida } from './parseMedida';
import { DRAG_THRESHOLD_PX } from '../gestureConstants';
import './cotas.css';

export interface CotaChipProps {
  cota: Cota;
  left: number;
  top: number;
  zoom2D: number;
  disabled?: boolean;
  onCommit: (cota: Cota, valueMm: number) => void;
  onScrubStart: (cota: Cota) => void;
  onScrub: (cota: Cota, valueMm: number) => void;
  onScrubEnd: (cota: Cota, valueMm: number) => void;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const acota = (v: number, c: Cota) => Math.min(c.max, Math.max(c.min, v));
/** El valor como lo escribiría ella: coma decimal, sin unidad. */
const aTexto = (v: number) => String(round1(v)).replace('.', ',');

/**
 * Un chip de cota: en reposo es un botón (clic → edición; arrastre ≥ 4 px →
 * scrub); en edición es un input de texto (Enter confirma, Escape descarta,
 * Tab confirma y sigue). Spec 2026-08-30 § 5.3. Las teclas del input no
 * salen de aquí: CF-1 ya ignora targets editables, esto es el cinturón.
 */
export default function CotaChip({
  cota, left, top, zoom2D, disabled = false, onCommit, onScrubStart, onScrub, onScrubEnd,
}: CotaChipProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrub = useRef<{ x0: number; v0: number; moved: boolean; last: number } | null>(null);
  const skipClick = useRef(false);
  const devolverFoco = useRef(false);

  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
    else if (devolverFoco.current) { devolverFoco.current = false; buttonRef.current?.focus(); }
  }, [editing]);

  const abrir = () => {
    if (disabled) return;
    setDraft(aTexto(cota.valueMm));
    setInvalid(false);
    setEditing(true);
  };
  const cerrar = (conFoco: boolean) => { devolverFoco.current = conFoco; setEditing(false); };
  const parsea = () => {
    const v = parseMedida(draft);
    return v !== null && v >= cota.min && v <= cota.max ? round1(v) : null;
  };
  const confirmar = (): boolean => {
    const v = parsea();
    if (v === null) { setInvalid(true); return false; }
    if (v !== round1(cota.valueMm)) onCommit(cota, v);
    return true;
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className={`cota cota--editando${invalid ? ' cota--invalida' : ''}`}
        style={{ left, top }}
        aria-label={cota.label}
        aria-invalid={invalid || undefined}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); if (confirmar()) cerrar(true); }
          else if (e.key === 'Escape') { e.preventDefault(); cerrar(true); }
          else if (e.key === 'Tab') { if (confirmar()) cerrar(false); else e.preventDefault(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = parseMedida(draft) ?? cota.valueMm;
            const paso = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
            setDraft(aTexto(acota(base + paso, cota)));
            setInvalid(false);
          }
        }}
        onBlur={() => { if (!editing) return; const v = parsea(); if (v !== null && v !== round1(cota.valueMm)) onCommit(cota, v); cerrar(false); }}
      />
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`cota${cota.primary ? '' : ' cota--hueca'}`}
      style={{ left, top }}
      aria-label={`${cota.label}: ${formatMedida(cota.valueMm, cota.unit)}`}
      aria-disabled={disabled || undefined}
      onClick={() => { if (skipClick.current) { skipClick.current = false; return; } abrir(); }}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        scrub.current = { x0: e.clientX, v0: cota.valueMm, moved: false, last: cota.valueMm };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s = scrub.current;
        if (!s) return;
        const dx = e.clientX - s.x0;
        if (!s.moved) {
          if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
          s.moved = true;
          onScrubStart(cota);
        }
        const delta = (dx / zoom2D) * (e.shiftKey ? 0.1 : 1);
        const v = acota(round1(s.v0 + delta), cota);
        s.last = v;
        onScrub(cota, v);
      }}
      onPointerUp={(e) => {
        const s = scrub.current;
        scrub.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        if (s?.moved) { skipClick.current = true; onScrubEnd(cota, s.last); }
      }}
      onPointerCancel={() => { const s = scrub.current; scrub.current = null; if (s?.moved) onScrubEnd(cota, s.v0); }}
      onContextMenu={undefined}
    >
      {formatMedida(cota.valueMm, cota.unit)}
    </button>
  );
}
```

Nota: en el `onBlur` el guard `if (!editing)` evita el doble commit cuando Enter ya cerró (React desmonta el input y jsdom no dispara blur; Chrome tampoco al desmontar). Si al correr en navegador aparece un doble `onCommit` con Enter, añadir `const cerradoRef = useRef(false)` que `cerrar` pone en `true` y `onBlur` respeta.

- [ ] **Step 4: Verde** → PASS los 3 `describe`.
- [ ] **Step 5: Commit** — `git add src/components/PatternEditor/cotas && git commit -m "feat(2d): CotaChip — un chip que es lectura en reposo y control al tocarlo: clic escribe, arrastre ajusta, Enter aplica"`

---

### Task 6: `CotasLayer` (HTML) y `CotaLines` (SVG)

**Files:**
- Create: `src/components/PatternEditor/cotas/CotasLayer.tsx`, `src/components/PatternEditor/cotas/CotaLines.tsx`
- Test: `src/components/PatternEditor/cotas/__tests__/CotasLayer.test.tsx`

**Interfaces:**
- Consumes: `CotaChip` (Task 5), `Cota` (Task 3).
- Produces:

```ts
export interface CotasLayerHandle { focusFirst(): boolean }   // true si enfocó algo
export interface CotasLayerProps {
  cotas: Cota[]; pan2D: Point2D; zoom2D: number; disabled?: boolean;
  onCommit: CotaChipProps['onCommit']; onScrubStart: CotaChipProps['onScrubStart'];
  onScrub: CotaChipProps['onScrub']; onScrubEnd: CotaChipProps['onScrubEnd'];
}
export const CotasLayer: React.ForwardRefExoticComponent<CotasLayerProps & React.RefAttributes<CotasLayerHandle>>;
export const COTA_OFFSET_PX = 18;
export function chipScreenPosition(cota: Cota, pan2D: Point2D, zoom2D: number): { left: number; top: number };
export default function CotaLines({ cotas, zoom2D }: { cotas: Cota[]; zoom2D: number }): JSX.Element;
```

- [ ] **Step 1: Tests**

```tsx
// src/components/PatternEditor/cotas/__tests__/CotasLayer.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { CotasLayer, chipScreenPosition, type CotasLayerHandle } from '../CotasLayer';
import CotaLines from '../CotaLines';
import type { Cota } from '../cotas';

afterEach(cleanup);
const cota = (over: Partial<Cota>): Cota => ({
  id: 'ancho', kind: 'ancho', label: 'Ancho de la pieza', valueMm: 200, unit: 'mm', min: 1, max: 3000, primary: true,
  a: { x: 10, y: 20 }, b: { x: 210, y: 20 }, outward: { x: 0, y: -1 }, apply: () => null, ...over,
});
const noop = { onCommit: vi.fn(), onScrubStart: vi.fn(), onScrub: vi.fn(), onScrubEnd: vi.fn() };

describe('chipScreenPosition', () => {
  it('punto medio del segmento en pantalla, desplazado 18 px hacia fuera', () => {
    expect(chipScreenPosition(cota({}), { x: 100, y: 50 }, 2)).toEqual({ left: 100 + 110 * 2, top: 50 + 20 * 2 - 18 });
  });
});

describe('CotasLayer', () => {
  it('la capa no recibe punteros y pinta un chip por cota, en orden', () => {
    const { container } = render(<CotasLayer cotas={[cota({}), cota({ id: 'alto', kind: 'alto', label: 'Alto de la pieza', valueMm: 300 })]} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    const capa = container.querySelector('.cotas') as HTMLElement;
    expect(capa.style.pointerEvents).toBe('none');
    const botones = screen.getAllByRole('button');
    expect(botones.map(b => b.textContent)).toEqual(['200 mm', '300 mm']);
  });
  it('focusFirst enfoca el primer chip y devuelve true; sin cotas devuelve false', () => {
    const ref = createRef<CotasLayerHandle>();
    const r = render(<CotasLayer ref={ref} cotas={[cota({})]} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    expect(ref.current!.focusFirst()).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button'));
    r.rerender(<CotasLayer ref={ref} cotas={[]} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    expect(ref.current!.focusFirst()).toBe(false);
  });
});

describe('CotaLines', () => {
  it('una línea por cota, desplazada 18/zoom hacia fuera, con ticks, sin punteros y con el token de tinta', () => {
    const { container } = render(<svg><CotaLines cotas={[cota({})]} zoom2D={2} /></svg>);
    const g = container.querySelector('g.cota-linea') as SVGGElement;
    expect(g.getAttribute('pointer-events')).toBe('none');
    const linea = g.querySelector('line.cota-linea__hilo')!;
    expect(linea.getAttribute('x1')).toBe('10'); expect(linea.getAttribute('y1')).toBe('11'); // 20 − 18/2
    expect(linea.getAttribute('x2')).toBe('210');
    expect(linea.getAttribute('stroke')).toBe('var(--cota-line-2d)');
    expect(linea.getAttribute('stroke-width')).toBe('0.5');       // 1/zoom
    expect(g.querySelectorAll('line.cota-linea__tick')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Ver fallar** → FAIL.

- [ ] **Step 3: Implementar**

```tsx
// src/components/PatternEditor/cotas/CotasLayer.tsx
import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { Point2D } from '../../../types/types';
import type { Cota } from './cotas';
import CotaChip, { type CotaChipProps } from './CotaChip';

/** Aire entre la geometría y la línea/chip de cota, en px de pantalla. */
export const COTA_OFFSET_PX = 18;

export interface CotasLayerHandle { focusFirst(): boolean }
export interface CotasLayerProps {
  cotas: Cota[];
  pan2D: Point2D;
  zoom2D: number;
  disabled?: boolean;
  onCommit: CotaChipProps['onCommit'];
  onScrubStart: CotaChipProps['onScrubStart'];
  onScrub: CotaChipProps['onScrub'];
  onScrubEnd: CotaChipProps['onScrubEnd'];
}

/** Punto medio del segmento a→b en pantalla (la fórmula de FloatingActionBar), desplazado hacia fuera. */
export function chipScreenPosition(cota: Cota, pan2D: Point2D, zoom2D: number): { left: number; top: number } {
  const mx = (cota.a.x + cota.b.x) / 2;
  const my = (cota.a.y + cota.b.y) / 2;
  return {
    left: pan2D.x + mx * zoom2D + cota.outward.x * COTA_OFFSET_PX,
    top: pan2D.y + my * zoom2D + cota.outward.y * COTA_OFFSET_PX,
  };
}

/**
 * Capa HTML de chips, hermana del <svg> dentro de `.pattern-editor`. La capa
 * no recibe punteros (la rueda y el clic siguen llegando al lienzo); solo los
 * chips. Sin z-index: el orden del DOM la pone encima del svg. Spec § 5.1.
 */
export const CotasLayer = forwardRef<CotasLayerHandle, CotasLayerProps>(function CotasLayer(
  { cotas, pan2D, zoom2D, disabled, onCommit, onScrubStart, onScrub, onScrubEnd }, ref,
) {
  const root = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    focusFirst() {
      const primero = root.current?.querySelector<HTMLElement>('button.cota:not([aria-disabled="true"])');
      if (!primero) return false;
      primero.focus();
      return true;
    },
  }), []);
  return (
    <div ref={root} className="cotas" style={{ pointerEvents: 'none' }} data-testid="cotas">
      {cotas.map((cota) => {
        const { left, top } = chipScreenPosition(cota, pan2D, zoom2D);
        return (
          <CotaChip
            key={cota.id}
            cota={cota}
            left={left}
            top={top}
            zoom2D={zoom2D}
            disabled={disabled}
            onCommit={onCommit}
            onScrubStart={onScrubStart}
            onScrub={onScrub}
            onScrubEnd={onScrubEnd}
          />
        );
      })}
    </div>
  );
});
```

```tsx
// src/components/PatternEditor/cotas/CotaLines.tsx
import type { Cota } from './cotas';
import { COTA_OFFSET_PX } from './CotasLayer';

const TICK_PX = 5;

/** Líneas de cota con ticks, dentro del grupo pan-zoom: grosor y aire constantes en pantalla (1/zoom). */
export default function CotaLines({ cotas, zoom2D }: { cotas: Cota[]; zoom2D: number }) {
  const z = zoom2D || 1;
  const off = COTA_OFFSET_PX / z;
  const tick = TICK_PX / z;
  return (
    <g className="cota-lineas" pointerEvents="none">
      {cotas.map((c) => {
        const ax = c.a.x + c.outward.x * off, ay = c.a.y + c.outward.y * off;
        const bx = c.b.x + c.outward.x * off, by = c.b.y + c.outward.y * off;
        // el tick es perpendicular a la línea de cota = paralelo a `outward`
        const tx = c.outward.x * tick, ty = c.outward.y * tick;
        return (
          <g key={c.id} className="cota-linea" pointerEvents="none">
            <line className="cota-linea__hilo" x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--cota-line-2d)" strokeWidth={1 / z} />
            <line className="cota-linea__tick" x1={ax - tx} y1={ay - ty} x2={ax + tx} y2={ay + ty} stroke="var(--cota-line-2d)" strokeWidth={1 / z} />
            <line className="cota-linea__tick" x1={bx - tx} y1={by - ty} x2={bx + tx} y2={by + ty} stroke="var(--cota-line-2d)" strokeWidth={1 / z} />
          </g>
        );
      })}
    </g>
  );
}
```

(`stroke="var(--cota-line-2d)"` es un token, no un literal: R3 no lo cuenta.)

- [ ] **Step 4: Verde** → PASS.
- [ ] **Step 5: Commit** — `git add src/components/PatternEditor/cotas && git commit -m "feat(2d): CotasLayer (chips HTML anclados con pan/zoom) y CotaLines (líneas de cota en el grupo pan-zoom)"`

---

### Task 7: Montaje en `PatternEditor`: sujeto, commit, scrub con batch, creación caliente y `Tab`

**Files:**
- Modify: `src/components/PatternEditor/useRectangleTool.ts` (expone `lastCreatedId`; `onComplete` devuelve el id)
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (`handlePieceComplete` devuelve id; monta `CotaLines` tras `PieceRenderer` y `CotasLayer` tras `FloatingActionBar`; handlers)
- Modify: `src/components/PatternEditor/useEditorInteractions.ts:431-461` (`routeKey`: `Tab` → `tools.cotas?.focusFirst()`)
- Test: `src/components/PatternEditor/__tests__/useRectangleTool.test.tsx` (añadir caso), `src/components/PatternEditor/__tests__/cotasDeSujeto.test.ts` (nuevo, función pura `cotasDelSujeto`)

**Interfaces:**
- `useRectangleTool(zoom2D, pan2D, onComplete: (piece) => string)` devuelve además `hotId: string | null` y `enfriar(): void`. **Enfriamiento irreversible** (revisión § 13.2 #1): `PatternEditor` llama `enfriar()` en un efecto cuando `selectedPieceIds[0] !== hotId`, cuando `activeTool !== 'rectangle'`, o cuando la pieza ya no existe.
- Nueva función pura en `src/components/PatternEditor/cotas/sujeto.ts`:

```ts
export interface SujetoInput {
  activeTool: Tool2D; pieces: PatternPiece[]; selectedPieceIds: string[];
  selectedInternalLine: { pieceId: string; lineId: string } | null;
  lastCreatedId: string | null; isDragging: boolean; contextMenuOpen: boolean; calibrationActive: boolean;
}
export interface Sujeto { piece: PatternPiece | null; caliente: boolean; cotas: Cota[]; disabled: boolean; lineaDeSujeto: string | null }
export function cotasDelSujeto(input: SujetoInput, defaultRect: { width: number; height: number }): Sujeto;
```
- `ToolHooks` (en `useEditorInteractions.ts`) gana `cotas?: React.RefObject<CotasLayerHandle>` y `KeyConsumer` gana `'cotas'`.

- [ ] **Step 1: Tests de `cotasDelSujeto`**

```ts
// src/components/PatternEditor/__tests__/cotasDeSujeto.test.ts
import { describe, it, expect } from 'vitest';
import { cotasDelSujeto } from '../cotas/sujeto';
import type { PatternPiece, PathCommand } from '../../../types/types';

const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] }, { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];
const pieza = (id: string, over: Partial<PatternPiece> = {}): PatternPiece => ({
  id, name: id, outline: rect(100, 100), internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, ...over,
} as PatternPiece);
const base = { pieces: [pieza('a'), pieza('b', { locked: true })], selectedInternalLine: null, lastCreatedId: null, isDragging: false, contextMenuOpen: false, calibrationActive: false };
const def = { width: 300, height: 150 };

describe('cotasDelSujeto', () => {
  it('rectángulo sin selección: sin cotas y la línea dice el tamaño del próximo clic', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'rectangle', selectedPieceIds: [] }, def);
    expect(s.cotas).toEqual([]);
    expect(s.lineaDeSujeto).toBe('Un clic crea 300 × 150 mm · arrastra para dibujar');
  });
  it('rectángulo con la pieza recién creada seleccionada: caliente, dos cotas, "la pieza nueva"', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'rectangle', selectedPieceIds: ['a'], lastCreatedId: 'a' }, def);
    expect(s.caliente).toBe(true);
    expect(s.cotas.map(c => c.id)).toEqual(['ancho', 'alto']);
    expect(s.lineaDeSujeto).toBe('Editando: la pieza nueva');
  });
  it('select con una pieza: no caliente, "la pieza seleccionada"', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', selectedPieceIds: ['a'], lastCreatedId: 'a' }, def);
    expect(s.caliente).toBe(false);
    expect(s.cotas).toHaveLength(2);
    expect(s.lineaDeSujeto).toBe('Editando: la pieza seleccionada');
  });
  it('pieza bloqueada: cotas deshabilitadas', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', selectedPieceIds: ['b'] }, def);
    expect(s.disabled).toBe(true);
    expect(s.cotas).toHaveLength(2);
  });
  it.each([
    ['dos piezas', { selectedPieceIds: ['a', 'b'] }],
    ['una interna seleccionada', { selectedPieceIds: ['a'], selectedInternalLine: { pieceId: 'a', lineId: 'l' } }],
    ['arrastrando', { selectedPieceIds: ['a'], isDragging: true }],
    ['menú abierto', { selectedPieceIds: ['a'], contextMenuOpen: true }],
    ['otra herramienta', { selectedPieceIds: ['a'], activeTool: 'pen' as const }],
  ])('sin cotas: %s', (_n, over) => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', ...over } as never, def);
    expect(s.cotas).toEqual([]);
  });
});
```

- [ ] **Step 2: Ver fallar** → FAIL.

- [ ] **Step 3: `sujeto.ts`**

```ts
// src/components/PatternEditor/cotas/sujeto.ts
import type { PatternPiece, Tool2D } from '../../../types/types';
import { cotasDePieza, type Cota } from './cotas';
import { formatMedida } from './parseMedida';

export interface SujetoInput {
  activeTool: Tool2D;
  pieces: PatternPiece[];
  selectedPieceIds: string[];
  selectedInternalLine: { pieceId: string; lineId: string } | null;
  lastCreatedId: string | null;
  isDragging: boolean;
  contextMenuOpen: boolean;
  calibrationActive: boolean;
}
export interface Sujeto {
  piece: PatternPiece | null;
  caliente: boolean;
  cotas: Cota[];
  disabled: boolean;
  lineaDeSujeto: string | null;
}

const CON_COTAS_DE_PIEZA: ReadonlySet<Tool2D> = new Set<Tool2D>(['select', 'transform', 'rectangle']);

/** Regla del sujeto (spec § 3.1): un sujeto, el más reciente; caliente solo si rectángulo acaba de crearlo. */
export function cotasDelSujeto(input: SujetoInput, defaultRect: { width: number; height: number }): Sujeto {
  const nada = (linea: string | null): Sujeto => ({ piece: null, caliente: false, cotas: [], disabled: false, lineaDeSujeto: linea });
  const lineaRect = input.activeTool === 'rectangle'
    ? `Un clic crea ${formatMedida(defaultRect.width, 'mm').replace(' mm', '')} × ${formatMedida(defaultRect.height, 'mm')} · arrastra para dibujar`
    : null;
  if (!CON_COTAS_DE_PIEZA.has(input.activeTool)) return nada(null);
  if (input.selectedInternalLine || input.selectedPieceIds.length !== 1) return nada(lineaRect);
  if (input.isDragging || input.contextMenuOpen || input.calibrationActive) return nada(lineaRect);
  const piece = input.pieces.find(p => p.id === input.selectedPieceIds[0]) ?? null;
  if (!piece) return nada(lineaRect);
  const caliente = input.activeTool === 'rectangle' && input.lastCreatedId === piece.id;
  return {
    piece,
    caliente,
    cotas: cotasDePieza(piece),
    disabled: Boolean(piece.locked),
    lineaDeSujeto: caliente ? 'Editando: la pieza nueva' : 'Editando: la pieza seleccionada',
  };
}
```

- [ ] **Step 4: `useRectangleTool`** — `onComplete: (piece: NewPieceData) => string`; añadir `const [hotId, setHotId] = useState<string | null>(null)`; en `create`: `const id = onComplete({...}); setHotId(id);`; `const enfriar = useCallback(() => setHotId(null), [])`; devolver `hotId` y `enfriar`. Tests en `useRectangleTool.test.tsx`: tras un clic `hotId` es el id que devolvió `onComplete` (`vi.fn(() => 'id-1')`); `enfriar()` lo deja en `null` y un segundo clic lo vuelve a poner.

- [ ] **Step 5: `PatternEditor.tsx`**

`handlePieceComplete` devuelve `fullPiece.id` (tipo `(piece) => string`; `usePenTool` puede seguir ignorando el retorno — comprobar que su tipo acepte `() => string`; si exige `void`, cambiarlo a `string | void`).

Añadir, cerca de `handleTransform` (`:601`):

```ts
  const defaultRect = useSelector((s: RootState) => ({
    width: Number(s.tools.toolOptions?.rectangle?.width ?? 100),
    height: Number(s.tools.toolOptions?.rectangle?.height ?? 100),
  }), shallowEqual);
  const sujeto = useMemo(() => cotasDelSujeto({
    activeTool, pieces, selectedPieceIds, selectedInternalLine: editor.selectedInternalLine,
    lastCreatedId: rectTool.lastCreatedId, isDragging: isDraggingPiece || transformTool.isDragging,
    contextMenuOpen: ctxMenu.visible, calibrationActive: calibrationMode !== null,
  }, defaultRect), [activeTool, pieces, selectedPieceIds, editor.selectedInternalLine, rectTool.lastCreatedId, isDraggingPiece, transformTool.isDragging, ctxMenu.visible, calibrationMode, defaultRect]);

  const aplicarCota = useCallback((cota: Cota, valueMm: number, token?: UndoBatchToken) => {
    const update = cota.apply(valueMm);
    if (!update) return;
    const piece = pieces.find(p => p.id === update.id);   // liveness: si el sujeto murió, nada
    if (!piece) return;
    const accion = updatePiece({ ...piece, outline: update.outline, position: update.position, rotation: update.rotation, internals: update.internals, updatedAt: Date.now() });
    dispatch(token ? withUndoBatchToken(accion, token) : accion);
  }, [pieces, dispatch]);
  const escribirDefault = useCallback((cota: Cota, valueMm: number) => {
    if (!sujeto.caliente) return;
    dispatch(setToolOption({ toolId: 'rectangle', optionId: cota.kind === 'ancho' ? 'width' : 'height', value: Math.round(valueMm * 10) / 10 }));
  }, [sujeto.caliente, dispatch]);
  const handleCotaCommit = useCallback((cota: Cota, valueMm: number) => {
    aplicarCota(cota, valueMm);
    escribirDefault(cota, valueMm);
    pushJournal('gesture', 'cota:commit', { id: cota.id, value: valueMm, caliente: sujeto.caliente });
  }, [aplicarCota, escribirDefault, sujeto.caliente]);
  const scrubToken = useRef<UndoBatchToken | null>(null);
  const handleCotaScrubStart = useCallback((cota: Cota) => {
    scrubToken.current = beginUndoBatch(dispatch, `Ajustar ${cota.label.toLowerCase()}`);
  }, [dispatch]);
  const handleCotaScrub = useCallback((cota: Cota, valueMm: number) => {
    aplicarCota(cota, valueMm, scrubToken.current ?? undefined);
  }, [aplicarCota]);
  const handleCotaScrubEnd = useCallback((cota: Cota, valueMm: number) => {
    aplicarCota(cota, valueMm, scrubToken.current ?? undefined);
    if (scrubToken.current) { endUndoBatch(dispatch, scrubToken.current); scrubToken.current = null; }
    escribirDefault(cota, valueMm);
    pushJournal('gesture', 'cota:scrub', { id: cota.id, value: valueMm, caliente: sujeto.caliente });
  }, [aplicarCota, escribirDefault, dispatch, sujeto.caliente]);
  const cotasRef = useRef<CotasLayerHandle>(null);
  // Enfriamiento irreversible (spec § 3.1): en cuanto la selección deja de ser
  // la pieza nueva, cambia la herramienta o la pieza desaparece, se enfría y
  // no vuelve a calentarse sola.
  useEffect(() => {
    const hot = rectTool.hotId;
    if (!hot) return;
    const viva = pieces.some(p => p.id === hot);
    if (activeTool !== 'rectangle' || selectedPieceIds[0] !== hot || selectedPieceIds.length !== 1 || !viva) rectTool.enfriar();
  }, [activeTool, selectedPieceIds, pieces, rectTool]);
  // Un batch de scrub nunca queda abierto: si el sujeto cambia o el editor se
  // desmonta con un token vivo, se cierra aquí (terminales, spec § 5.3).
  useEffect(() => () => {
    if (scrubToken.current) { endUndoBatch(dispatch, scrubToken.current); scrubToken.current = null; }
  }, [sujeto.piece?.id, dispatch]);
```

El scrub va **coalescido a un frame** y **derivado del snapshot**: `handleCotaScrubStart` guarda `scrubCota.current = cota` (la cota de partida, con su `apply` sobre la pieza de partida); `handleCotaScrub` guarda el último valor en `scrubValor.current` y, si no hay rAF pendiente, programa uno que despacha `aplicarCota(scrubCota.current, scrubValor.current, token)` **si el token sigue activo** (`isUndoBatchTokenActive`); si un undo ajeno lo invalidó, termina el scrub sin despachar. `handleCotaScrubEnd` cancela el rAF pendiente, despacha el valor final una vez y cierra el batch.

(`isDraggingPiece` ya se destructura de `useEditorInteractions` en `PatternEditor.tsx:641`; el `useMemo` del sujeto va DESPUÉS de esa línea. `UndoBatchToken`, `beginUndoBatch`, `endUndoBatch`, `withUndoBatchToken` vienen de `../../store/undoMiddleware`.)

Montaje: dentro de `<g data-pan-zoom-group>` justo después de `<PieceRenderer …/>`: `<CotaLines cotas={sujeto.cotas} zoom2D={zoom2D} />`. Después de `<FloatingActionBar …/>`: 

```tsx
      <CotasLayer
        ref={cotasRef}
        cotas={sujeto.cotas}
        pan2D={pan2D}
        zoom2D={zoom2D}
        disabled={sujeto.disabled}
        onCommit={handleCotaCommit}
        onScrubStart={handleCotaScrubStart}
        onScrub={handleCotaScrub}
        onScrubEnd={handleCotaScrubEnd}
      />
```

Pasar `cotas: cotasRef` en el objeto `tools` que recibe `useEditorInteractions` (si `tools` se construye antes de `cotasRef`, declarar el ref arriba).

- [ ] **Step 6: `Tab` en CF-1** — en `routeKey`, antes de `if (e.key !== 'Escape') return null;`:

```ts
      // Tab desde el lienzo: a la primera cota (spec cotas vivas § 5.3). Solo
      // desde el <svg> o el body — desde el dock o desde un chip en reposo, Tab
      // es el nativo (si no, un Tab desde un chip volvería al primero en bucle).
      const t = e.target as HTMLElement | null;
      const desdeElLienzo = t === document.body || (t?.tagName ?? '').toLowerCase() === 'svg';
      if (e.key === 'Tab' && !e.shiftKey && desdeElLienzo && tools.cotas?.current?.focusFirst()) {
        e.preventDefault();
        e.stopPropagation();
        return 'cotas';
      }
```

y `type KeyConsumer = 'internalShape' | 'pen' | 'rectangle' | 'cotas' | null`. Con trazo vivo de línea interna o pluma la rama de arriba ya consumió Tab (abre "Siguiente punto"): no cambia en PR A.

- [ ] **Step 7: Correr todo** — `npx vitest run src/components/PatternEditor` → PASS (los tests de `useRectangleTool` y `usePointTool` que mockean `onComplete` como `void` se ajustan a devolver un string).
- [ ] **Step 8: Gate + commit** — `npx tsc -b --noEmit && npm run lint`; `git commit -am "feat(2d): cotas de pieza montadas — la pieza nueva o seleccionada muestra Ancho/Alto editables; scrub en un solo deshacer; Tab enfoca la primera cota"`

---

### Task 8: La tira `ToolStrip2D` con los controles de la barra

**Files:**
- Create: `src/components/PatternEditor/ToolOptionControls.tsx` (mover `NumberInput` + `Control` desde `src/components/shell/ToolOptionsBar2D.tsx:78-206`, con clases `tool-strip__*`)
- Create: `src/components/PatternEditor/ToolStrip2D.tsx`
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (montar `<ToolStrip2D lineaDeSujeto={sujeto.lineaDeSujeto} />` como último hijo de `.pattern-editor`)
- Test: `src/components/PatternEditor/__tests__/ToolStrip2D.test.tsx` (los 9 casos de `ToolOptionsBar2D.test.tsx:100-200` adaptados + 2 nuevos)

**Interfaces:**
- `ToolOptionControls`: `export function Control({ opcion, valor, alCambiar }: { opcion: ToolOption; valor: unknown; alCambiar: (v: unknown) => void }): JSX.Element | null` (mismo contrato que hoy).
- `ToolStrip2D({ lineaDeSujeto }: { lineaDeSujeto: string | null })`; lee `s.editor.activeTool` (la autoridad de `PatternEditor`), `toolRegistry.getTool(activeTool)`, `s.tools.toolOptions[activeTool]`, `useShortcutRegistry().getBinding(\`tool.${activeTool}\`)`.
- `const OCULTAS_EN_LA_TIRA: Record<string, ReadonlySet<string>> = { rectangle: new Set(['width', 'height']) }`.

- [ ] **Step 1: Tests** — copiar `ToolOptionsBar2D.test.tsx` a `ToolStrip2D.test.tsx`, reemplazar el componente y las clases (`tool-options-bar__*` → `tool-strip__*`), quitar el caso "el canal sigue presente" (ya no hay canal) y añadir:

```tsx
  it('con rectángulo no pinta Ancho ni Alto (son cotas) y muestra la línea de sujeto', () => {
    const store = storeCon({ activeTool: 'rectangle' });
    render(<Provider store={store}><ToolStrip2D lineaDeSujeto="Un clic crea 300 × 150 mm · arrastra para dibujar" /></Provider>);
    expect(screen.queryByLabelText('Ancho')).toBeNull();
    expect(screen.queryByLabelText('Alto')).toBeNull();
    expect(screen.getByText('Un clic crea 300 × 150 mm · arrastra para dibujar')).toBeTruthy();
    expect(screen.getByText('Rectángulo')).toBeTruthy();
  });
  it('con piquete pinta sus opciones y despacha setToolOption', () => {
    const store = storeCon({ activeTool: 'notch' });
    render(<Provider store={store}><ToolStrip2D lineaDeSujeto={null} /></Provider>);
    fireEvent.change(screen.getByLabelText('Forma'), { target: { value: 'v' } });
    expect(store.getState().tools.toolOptions.notch?.shape).toBe('v');
  });
```

(`storeCon` es el helper de store real de `ToolOptionsBar2D.test.tsx` — copiarlo tal cual, cambiando `activeTool2D` por `editor.activeTool` si el helper lo fija; ambos se fijan con `activate2DTool`.)

- [ ] **Step 2: Ver fallar** → FAIL (módulo no existe).
- [ ] **Step 3: Implementar** — `ToolOptionControls.tsx` = el código de `ToolOptionsBar2D.tsx:72-206` con las clases renombradas e `id={\`opcion-${opcion.id}\`}` conservado (los e2e de piquete/tijeras lo usan). `ToolStrip2D.tsx`:

```tsx
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setToolOption } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import { useShortcutRegistry } from '../../shortcuts';
import { displayShortcutBinding } from '../shell/shortcutDisplay';
import { Control } from './ToolOptionControls';
import './ToolStrip2D.css';

const SIN_VALORES: Record<string, unknown> = {};
const OCULTAS_EN_LA_TIRA: Record<string, ReadonlySet<string>> = { rectangle: new Set(['width', 'height']) };

/** La tira: lo que no tiene sitio en el lienzo — herramienta, atajo, sujeto y defaults (spec § 6). */
export default function ToolStrip2D({ lineaDeSujeto }: { lineaDeSujeto: string | null }) {
  const dispatch = useDispatch();
  const registro = useShortcutRegistry();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const valores = useSelector((s: RootState) => s.tools.toolOptions[activeTool] ?? SIN_VALORES);
  const definicion = toolRegistry.getTool(activeTool);
  const ocultas = OCULTAS_EN_LA_TIRA[activeTool];
  const opciones = (definicion?.options ?? []).filter(o => !ocultas?.has(o.id));
  const combo = registro?.getBinding(`tool.${activeTool}`) ?? null;
  const atajo = combo ? displayShortcutBinding(combo) : null;
  const alCambiar = useCallback((optionId: string, value: unknown) => {
    dispatch(setToolOption({ toolId: activeTool, optionId, value }));
  }, [dispatch, activeTool]);
  return (
    <div className="tool-strip" role="group" aria-label="Herramienta activa">
      <div className="tool-strip__head">
        <span className="tool-strip__tool">{definicion?.name ?? activeTool}</span>
        {atajo && <kbd className="tool-strip__shortcut">{atajo}</kbd>}
      </div>
      {lineaDeSujeto && <div className="tool-strip__subject">{lineaDeSujeto}</div>}
      {opciones.length > 0 && (
        <div className="tool-strip__options">
          {opciones.map(o => (
            <Control key={o.id} opcion={o} valor={valores[o.id] ?? o.value} alCambiar={v => alCambiar(o.id, v)} />
          ))}
        </div>
      )}
    </div>
  );
}
```

`displayShortcutBinding` vive en `src/components/shell/shortcutDisplay.ts` (import legítimo por D5: misma función, distinta carpeta). Si `s.editor.activeTool` no es un `Tool2D` cuando la vista es 3D, la tira solo se monta dentro de `PatternEditor`, que ya es 2D.

- [ ] **Step 4: Montar** en `PatternEditor.tsx` como último hijo de `.pattern-editor`: `<ToolStrip2D lineaDeSujeto={sujeto.lineaDeSujeto} />`.
- [ ] **Step 5: Verde** — `npx vitest run src/components/PatternEditor/__tests__/ToolStrip2D.test.tsx` → PASS.
- [ ] **Step 6: Commit** — `git add -A src/components/PatternEditor && git commit -m "feat(2d): la tira de herramienta — nombre, atajo, sujeto y defaults en la esquina del lienzo; los controles se mudan de la barra"`

---

### Task 9: Desmontar la barra y reescribir sus tests

**Files:**
- Modify: `src/components/shell/AppShell.tsx:289-298` (quitar `<ToolOptionsBar2D />` y su import)
- Modify: `src/styles/layout.css:36-54` (quitar `display: flex; flex-direction: column` y la regla `.canvas-area__2d > .pattern-editor`)
- Delete: `src/components/shell/ToolOptionsBar2D.tsx`, `.css`, `src/components/shell/__tests__/ToolOptionsBar2D.test.tsx`, `tests/e2e/barra-opciones-herramienta.spec.ts`
- Modify: `src/components/shell/__tests__/AppShell.canaletas.test.tsx` (si referencia la barra), `src/components/PatternEditor/renderers/HintText.tsx:68-70`, `src/components/PatternEditor/renderers/__tests__/HintText.*.test.tsx` (la frase nueva)
- Grep: `grep -rn "ToolOptionsBar2D\|tool-options-bar" src tests docs/superpowers/plans/2026-08-16*` → cero referencias vivas en `src`/`tests` al terminar.

- [ ] **Step 1: HintText** — rectángulo: `'Arrastra para dibujar · un clic crea con el último tamaño · escribe en sus cotas para cambiarlo · Esc cancela'`. Nueva pista con cotas visibles y herramienta `select` (prop nueva `cotasVisibles: boolean`): `'Clic en una cota para escribirla · arrástrala para ajustar · Tab pasa a la siguiente · Esc suelta'`. Actualizar el test de HintText que fije la frase del rectángulo.
- [ ] **Step 2: Desmontar** — quitar la canaleta de `AppShell`, revertir `layout.css` a:

```css
.canvas-area__2d {
  position: relative;
  overflow: hidden;
  background: #f5f3f0; /* Warm paper — 2D canvas needs a light bg for pattern visibility */
}
```

(el literal `#f5f3f0` ya estaba: R3 no sube). Borrar los archivos de la barra.
- [ ] **Step 3: Verde** — `npm run test` completo → PASS; `node scripts/ui-contract-lint.mjs` → si algún contador **bajó**, `node scripts/ui-contract-lint.mjs --update` y commitear el baseline.
- [ ] **Step 4: Commit** — `git commit -am "refactor(shell): muere la barra de opciones acoplada (#223/#225): el lienzo 2D vuelve a ocupar toda el área y el dock ya no tapa nada"`

---

### Task 10: E2E — la promesa de María, medida en navegador

**Files:**
- Create: `tests/e2e/cotas-de-pieza.spec.ts`, `tests/e2e/emplazamiento-tira.spec.ts`
- Rewrite: `tests/e2e/maria-191-rectangulo-con-medidas.spec.ts`

Servidor: `npx vite --port 5174 --strictPort` en otra terminal; `curl -s localhost:5174 | grep -o "<title>[^<]*"` debe decir Vina. Correr con `npx playwright test tests/e2e/cotas-de-pieza.spec.ts --workers=2`.

- [ ] **Step 1: `cotas-de-pieza.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';

type Cmd = { type: string; values: number[] };
type StoreWindow = { __VINA_STORE__: { getState: () => {
  editor: { activeTool: string; zoom2D: number; pan2D: { x: number; y: number }; selectedPieceIds: string[] };
  project: { pieces: Array<{ id: string; outline: Cmd[]; position: { x: number; y: number }; locked?: boolean }> };
  tools: { toolOptions: Record<string, Record<string, unknown>> };
}; dispatch: (a: unknown) => void } };
const st = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());
const bbox = (p: { outline: Cmd[]; position: { x: number; y: number } }) => {
  const xs = p.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0)).map(x => x + p.position.x);
  const ys = p.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1)).map(y => y + p.position.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), x: Math.min(...xs), y: Math.min(...ys) };
};
async function toScreen(page: Page, p: { x: number; y: number }) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  const { editor } = await st(page);
  return { x: box!.x + editor.pan2D.x + p.x * editor.zoom2D, y: box!.y + editor.pan2D.y + p.y * editor.zoom2D };
}
const cota = (page: Page, nombre: 'Ancho' | 'Alto') => page.getByRole('button', { name: new RegExp(`^${nombre} de la pieza:`) });

test.describe('cotas de pieza (María #223/#225)', () => {
  test.setTimeout(90_000);
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('clic crea, las cotas editan ESA pieza, y el siguiente clic hereda el tamaño', async ({ page }) => {
    await page.keyboard.press('s');
    const s = await toScreen(page, { x: 250, y: 250 });
    await page.mouse.click(s.x, s.y);
    let pieces = (await st(page)).project.pieces;
    expect(pieces).toHaveLength(1);
    expect(bbox(pieces[0])).toMatchObject({ w: 100, h: 100 });
    await expect(cota(page, 'Ancho')).toHaveText('100 mm');

    await cota(page, 'Ancho').click();
    await page.keyboard.type('300');
    await page.keyboard.press('Tab');
    await page.keyboard.type('150');
    await page.keyboard.press('Enter');
    pieces = (await st(page)).project.pieces;
    expect(pieces).toHaveLength(1);
    expect(bbox(pieces[0])).toMatchObject({ x: 250, y: 250, w: 300, h: 150 });
    await expect(cota(page, 'Ancho')).toHaveText('300 mm');
    await expect(page.getByText('Editando: la pieza nueva')).toBeVisible();

    const t = await toScreen(page, { x: 700, y: 250 });
    await page.mouse.click(t.x, t.y);
    pieces = (await st(page)).project.pieces;
    expect(pieces).toHaveLength(2);
    expect(bbox(pieces[1])).toMatchObject({ w: 300, h: 150 });
  });

  test('una pieza seleccionada con Z edita su cota sin tocar el default del rectángulo', async ({ page }) => {
    await page.keyboard.press('s');
    const s = await toScreen(page, { x: 250, y: 250 });
    await page.mouse.click(s.x, s.y);
    await page.keyboard.press('z');
    await page.mouse.click(s.x + 20, s.y + 20);
    await expect(page.getByText('Editando: la pieza seleccionada')).toBeVisible();
    await cota(page, 'Ancho').click();
    await page.keyboard.type('200');
    await page.keyboard.press('Enter');
    const state = await st(page);
    expect(bbox(state.project.pieces[0]).w).toBe(200);
    expect(state.tools.toolOptions.rectangle?.width ?? 100).toBe(100);
  });

  test('arrastrar la cota (scrub) ajusta en vivo y es UNA entrada de deshacer', async ({ page }) => {
    await page.keyboard.press('s');
    const s = await toScreen(page, { x: 250, y: 250 });
    await page.mouse.click(s.x, s.y);
    const chip = await cota(page, 'Ancho').boundingBox();
    const { editor } = await st(page);
    await page.mouse.move(chip!.x + chip!.width / 2, chip!.y + chip!.height / 2);
    await page.mouse.down();
    await page.mouse.move(chip!.x + chip!.width / 2 + 50 * editor.zoom2D, chip!.y + chip!.height / 2, { steps: 10 });
    await page.mouse.up();
    expect(bbox((await st(page)).project.pieces[0]).w).toBe(150);
    await page.keyboard.press('Control+z');
    expect(bbox((await st(page)).project.pieces[0]).w).toBe(100);
  });

  test('teclas reales: Tab desde el lienzo enfoca Ancho; Retroceso dentro no borra la pieza; s no cambia de herramienta', async ({ page }) => {
    await page.keyboard.press('s');
    const s = await toScreen(page, { x: 250, y: 250 });
    await page.mouse.click(s.x, s.y);
    await page.keyboard.press('Tab');
    await expect(cota(page, 'Ancho')).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('s');
    expect((await st(page)).project.pieces).toHaveLength(1);
    expect((await st(page)).editor.activeTool).toBe('rectangle');
    await page.keyboard.press('Escape');
    await expect(cota(page, 'Ancho')).toHaveText('100 mm');
  });

  test('pieza bloqueada: cotas apagadas', async ({ page }) => {
    await page.keyboard.press('s');
    const s = await toScreen(page, { x: 250, y: 250 });
    await page.mouse.click(s.x, s.y);
    const id = (await st(page)).project.pieces[0].id;
    await page.evaluate((pid) => {
      const store = (window as unknown as StoreWindow).__VINA_STORE__;
      const piece = store.getState().project.pieces.find(p => p.id === pid)!;
      store.dispatch({ type: 'project/updatePiece', payload: { ...piece, locked: true, updatedAt: Date.now() } });
    }, id);
    await expect(cota(page, 'Ancho')).toHaveAttribute('aria-disabled', 'true');
    await cota(page, 'Ancho').click();
    expect(await page.getByRole('textbox').count()).toBe(0);
  });
});
```

(No hay acción de bloqueo por pieza en `projectSlice.ts` — solo `setLayerLocked`; el candado de pieza es el campo `locked` y se escribe con `updatePiece`, igual que hace el menú contextual.)

- [ ] **Step 2: `emplazamiento-tira.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test.describe('emplazamiento de la tira y las cotas (laptop de María, 1366×643)', () => {
  test.use({ viewport: { width: 1366, height: 643 } });
  test('el dock nunca pinta encima de la tira; el lienzo ocupa toda el área 2D', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg');
    await page.getByRole('button', { name: 'Rectángulo' }).first().click();
    const r = await page.evaluate(() => {
      const tira = document.querySelector('.tool-strip')!.getBoundingClientRect();
      const area = document.querySelector('.canvas-area__2d')!.getBoundingClientRect();
      const svg = document.querySelector('svg.pattern-svg')!.getBoundingClientRect();
      const arriba = document.elementFromPoint(tira.left + 8, tira.top + 8)?.closest('.tool-strip, .dock');
      return { encima: arriba?.className ?? null, svgTop: svg.top, areaTop: area.top, svgH: svg.height, areaH: area.height, tiraRight: tira.right, areaRight: area.right };
    });
    expect(r.encima).toContain('tool-strip');
    expect(Math.abs(r.svgTop - r.areaTop)).toBeLessThan(1);
    expect(Math.abs(r.svgH - r.areaH)).toBeLessThan(1);
    expect(r.tiraRight).toBeLessThanOrEqual(r.areaRight);
  });
  test('las cotas se ocultan mientras se arrastra la pieza y vuelven al soltar', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg');
    await page.keyboard.press('s');
    const box = (await page.locator('svg.pattern-svg').boundingBox())!;
    await page.mouse.click(box.x + 300, box.y + 300);
    await page.keyboard.press('z');
    await page.mouse.click(box.x + 320, box.y + 320);
    await expect(page.getByRole('button', { name: /^Ancho de la pieza:/ })).toBeVisible();
    await page.mouse.move(box.x + 320, box.y + 320);
    await page.mouse.down();
    await page.mouse.move(box.x + 380, box.y + 380, { steps: 6 });
    await expect(page.getByRole('button', { name: /^Ancho de la pieza:/ })).toHaveCount(0);
    await page.mouse.up();
    await expect(page.getByRole('button', { name: /^Ancho de la pieza:/ })).toBeVisible();
  });
});
```

- [ ] **Step 3: Reescribir `maria-191`** — el mismo archivo, con el docstring nuevo ("Antes: la barra editaba el default del siguiente y el e2e lo certificaba — memoria `test-mide-nuestra-promesa-no-la-de-maria`") y dos casos: (1) clic crea con el último tamaño y las cotas editan esa pieza (copiar el primer test de `cotas-de-pieza.spec.ts`); (2) el arrastre de 4 px dibuja a pulso y escribe el tamaño dibujado en el default (`toolOptions.rectangle.width === 80`) y la línea de la tira dice `Un clic crea 80 × 60 mm · arrastra para dibujar` tras deseleccionar con Escape.
- [ ] **Step 4: Correr** — `npx playwright test tests/e2e/cotas-de-pieza.spec.ts tests/e2e/emplazamiento-tira.spec.ts tests/e2e/maria-191-rectangulo-con-medidas.spec.ts --workers=2` → PASS. Luego la tanda entera de e2e con `--workers=4` para ver qué otro spec dependía de la barra (`sewing-tools.spec.ts`, `linea-interna-gramatica.spec.ts` usan `#opcion-*`: siguen funcionando porque los ids se conservaron en `ToolOptionControls`).
- [ ] **Step 5: Commit** — `git add tests/e2e && git commit -m "test(e2e): cotas de pieza por la puerta de María — clic crea, la cota edita esa pieza, scrub en un deshacer, Tab y teclas reales, 1366×643"`

---

### Task 11: Registro, changelog y NOTA

**Files:**
- Modify: `CHANGELOG.md` (entrada "Cotas vivas, PR A")
- Modify: `docs/superpowers/specs/2026-08-30-cotas-vivas-design.md` § 13.2 (lo que la revisión de codex encontró y cómo se cerró)
- Create: `D:\Desktop\Personal\para maria\27-cotas-de-pieza\` (capturas antes/después + `NOTA-cotas-de-pieza.txt` con su cita de #223/#225; índice en `LEEME.txt`) — memoria `entregas-para-maria-convencion`
- Memory: nota de proyecto con la decisión (sujeto, chips, tira) y la tanda 2 pendiente (#226)

- [ ] **Step 1:** capturas "antes" desde `main` (worktree + puerto propio, memoria `capturas-antes-con-worktree-pre-merge`) y "después" desde la rama, a 1366×643.
- [ ] **Step 2:** CHANGELOG + § 13.2 + NOTA (la NOTA la redacta `solace-wren`).
- [ ] **Step 3:** gates completos, `git push -u origin feat/cotas-vivas`, PR con `Closes` en inglés no aplica (memoria `cierra-en-espanol-no-cierra-el-issue`: cerrar a mano las tarjetas de Trello #223/#225 tras mergear).

---

## Self-review (hecho al escribir)

- **Cobertura de la spec (PR A):** § 3 pieza ✔ (Tasks 3, 7); § 3.1 sujeto ✔ (Task 7); § 3.2 bloqueo ✔ (Tasks 7, 10); § 4.3 ✔ (Task 1); § 4.4 ✔ (Task 2); § 5.1–5.3 ✔ (Tasks 5, 6, 7); § 6 ✔ (Task 8); § 7 ✔ (Task 9); § 8 ✔ (tests en cada task + Task 10); § 9 ✔ (Task 4); § 10.4/10.5 ✔ (Task 4). Fuera de PR A por diseño: § 3.3, § 3.4, § 3.5, § 4.1, § 4.2, § 5.4 (línea interna y trazo en curso → PR B).
- **Tipos consistentes:** `Cota.apply` devuelve `TransformUpdate | null` en Tasks 3, 5, 7; `CotasLayerHandle.focusFirst(): boolean` en Tasks 6 y 7; `onComplete` de `useRectangleTool` devuelve `string` en Task 7; `KeyConsumer` gana `'cotas'` en Task 7.
- **Sin placeholders:** cada paso trae código o comando.
