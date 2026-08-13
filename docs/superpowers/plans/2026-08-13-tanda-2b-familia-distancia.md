# Tanda 2b — La familia DISTANCIA: piquete y punto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que arrastrar sobre un borde con la herramienta de piquete o la de punto diga **"a X mm de aquí"**, medido por arco desde una referencia que ella ve antes de moverse, y que el clic de hoy siga haciendo exactamente lo de hoy.

**Architecture:** No hay gesto nuevo ni modelo de datos nuevo. La tanda 1 dejó la máquina (`useEdgeGesture`) y la tanda 2a dejó la regla de medir (`outlineRing`). Esta tanda las conecta: las dos herramientas de la familia DISTANCIA dejan sus máquinas caseras y consumen la común, y el valor que produce el release se convierte a `NotchAnchor.distanceMm` (piquete) o a un `splitSegmentAt` (punto).

**Tech Stack:** TypeScript, React, tests con vitest.

**Spec:** `docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md` § 3.2, § 3.4, § 5, § 7
**Plan anterior:** `docs/superpowers/plans/2026-08-12-tanda-2a-cimientos-de-medicion.md` (el anillo que esto consume)
**Issues:** #1029 (M-221). Cierra la familia DISTANCIA; **no** cierra #1029 (falta 2c).

---

## El estado del que se parte, medido

| Pieza | Dónde | Estado hoy |
|---|---|---|
| Máquina del gesto | `useEdgeGesture.ts:36` | viva, con captura de puntero y umbral histórico (`moved`, `:22`) |
| La ley | `edgeGesture.ts:38` `resolveEdgeCommit` | viva, con las dos caídas a clic |
| Umbral / enganche | `gestureConstants.ts:12` (4 px), `:30` (12 px) | vivos |
| El anillo y la medida | `outlineRing.ts:370,611,652,699,721` | vivo, con métrica v1/v2 (tanda 2a) |
| **Quién consume el gesto** | `useFreeSewingTool.ts:89` | **solo coser.** Ni piquete ni punto |

Y las dos herramientas que esta tanda toca, tal como están:

- **Piquete** (`useNotchTool.ts`): commitea en el **mousedown** (`:177-178`) y abre el modal en el mismo evento (`:183-194`). No importa nada del gesto.
- **Punto** (`usePointTool.ts`): tiene un press-track-release propio y **mínimo** — un booleano `armed` (`:63`, armado en `:141`, despachado en `:147-163`) **sin umbral de píxeles**, y **re-resuelve el objetivo en el release** (`:151`). Es la filosofía contraria a la ley: aquí el release re-apunta el OBJETO. Tiene su `HIT_RADIUS_PX = 12` local (`:50`).

## Global Constraints

- **La cláusula de compatibilidad manda (spec § 5).** Todo lo que hoy se hace con un clic sigue idéntico. El único cambio de sensación permitido es el del piquete, de commit-en-press a commit-en-release, y está aprobado en el spec (`§ 5`, +60 ms).
- **El arco, nunca la cuerda.** La distancia es longitud de arco sobre la curva (spec § 3.2). Medir en cuerda es el bug #1026.
- **Ninguna herramienta declara su propio umbral.** `DRAG_THRESHOLD_PX` y `EDGE_HIT_PX` de `gestureConstants.ts`. El `HIT_RADIUS_PX = 12` local de `usePointTool.ts:50` se borra y apunta a la constante.
- **Cero redondeo automático.** 47,3 no se vuelve 47 (spec § 7, y The Cut #6). El readout lleva **un decimal**.
- **El press manda el objeto y no se re-apunta.** Aplica también a `punto`, que hoy hace lo contrario.
- **Los piquetes guardados no se mueven.** El ancla nueva se escribe con métrica 2 (default de `computeNotchAnchor`, tanda 2a); las existentes se re-derivan con la suya. Ya está probado en `baselinePiquetesMaria.test.ts` y ese test tiene que seguir verde.
- **TDD obligatorio.** Ningún código de producción sin un test visto fallar por la razón correcta.
- **Typecheck:** `npx tsc -b --noEmit` (modo build), nunca `tsc --noEmit` a secas.
- **`git add` explícito en cada tarea.** Casi todas crean archivos.
- **Sin `--no-verify`.**

### Lo que esta tanda NO hace

- **No toca el margen de costura** — es la 2c.
- **No toca el rango cosido en mm** del panel de costuras — es la 2c.
- **No arrastra un piquete o punto YA creado** para moverlo. Está en The Cut #2 del spec: choca con el drag de nodos de `editPattern` y necesita su propia pasada de prioridad.
- **No unifica los umbrales de enganche restantes** (spec § 7.1: `sewingUtils.ts:33-34` y los locales de medir/recortar/tijeras). Issue aparte.
- **No añade una barra de opciones de herramienta.** No existe en la app (#1049) y The Cut #4 la descarta a propósito.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/utils/__tests__/bordesSemanticosMaria.test.ts` | **nuevo.** Medir si sus piezas tienen bordes semánticos — de eso depende que el gesto tenga sobre qué clampear | **0** |
| `src/components/PatternEditor/edgeGesture.ts` | `EdgeCommit.drag` gana `releaseT` — sin él la DIRECCIÓN del arrastre no se puede recuperar | 1 |
| `src/utils/geometry/arcToNative.ts` | **nuevo.** Fracción de arco de un comando → parámetro nativo de De Casteljau | 2 |
| `src/utils/geometry/distanceRef.ts` | **nuevo.** La escalera de prioridad que resuelve la referencia del press | 3 |
| `src/components/PatternEditor/useNotchTool.ts` | Consume el gesto; commit al mouseup; el modal solo en la ruta de clic | 4 |
| `src/components/PatternEditor/usePointTool.ts` | Consume el gesto; el press manda el objeto; umbral global | 5 |
| `src/components/PatternEditor/renderers/overlays/DistanceOverlay.tsx` | **nuevo.** Los cinco feedbacks del arrastre | 6 |
| `src/components/PatternEditor/actionCuration.ts` | Fila "Distancia exacta…" en `il.notch` | 7 |

---

## Task 0: ¿Sobre qué borde clampea el gesto en SU patrón?

**Por qué esta tarea va primera, y por qué bloquea también a la 2c.** Todo el gesto de borde descansa en `EdgeTarget.edgeRange`, y quien lo calcula es `edgeRangeForCommand` (`src/utils/semanticEdges.ts:237-245`). Su última línea es el problema:

```ts
  return semantic ? semantic.segmentRange : [cmdIndex, cmdIndex + 1];
```

**Sin bordes semánticos, un "borde" es UN COMANDO.** Y `detectSemanticEdges` devuelve `[]` cuando el análisis encuentra menos de dos tramos (`semanticEdges.ts:71`).

Sobre el DXF de María eso no es un detalle: sus contornos traen **~216 comandos `L` por pieza** y cero comandos de curva — medido y documentado en `docs/reports/2026-08-12-verificacion-piquetes-patron-real.md`. Un borde de un comando sería **1/216 del contorno**. El arrastre se clamparía a un sliver invisible y el número no se movería.

Y hay una segunda razón para medirlo aquí: eso es **exactamente** la queja 2 de su #220 — *"se selecciona una parte random de la curva, que parece que es entre punto de curva y punto extremo"*. Un comando suelto de una polilínea densa **es** una parte random entre dos puntos que ella no dibujó.

**Medido el 2026-08-13, antes de escribir la tarea.** Importando su DXF y corriendo `detectSemanticEdges` sobre las 5 piezas:

| Pieza | comandos | bordes | comandos por borde | comandos fuera de todo borde |
|---|---|---|---|---|
| SAMUEL-1 | 202 | 4 | 1, 67, 1, 127 | 6 (3,0 %) |
| SAMUEL-2 | 18 | 5 | 1, 3, 3, 3, 1 | 7 (38,9 %) |
| SAMUEL-3 | 194 | 9 | 1, 1, 58, 1, 61, 1, 58, 1, 1 | 11 (5,7 %) |
| SAMUEL-4 | 202 | 4 | 1, 67, 1, 127 | 6 (3,0 %) |
| SAMUEL-5 | 276 | 9 | 1, 1, 77, 1, 105, 1, 77, 1, 1 | 11 (5,7 %) |

> **La última columna se midió dos veces.** La primera cuenta salió inflada —8 y 17 en vez de 6 y 11— por un oráculo que confundía dos cosas: un comando descubierto (el fallback, que sí es el bug) y un comando dentro de un borde semántico legítimo de un solo comando (un hombro recto, que no lo es). Lo cazó el review adversarial y está corregido en `bordesSemanticosMaria.test.ts`. Los `1` de la columna anterior son exactamente esos bordes legítimos, y por eso las dos columnas se leen juntas o no se leen.

**El veredicto, en tres partes:**

1. **La premisa se sostiene.** Sus piezas SÍ tienen bordes semánticos y las curvas grandes se agrupan bien: 67, 77, 105 y 127 comandos en un solo borde. Ahí el arrastre tiene sobre qué clampear y el gesto funciona.
2. **Un borde de 1 comando no es un bug por sí solo.** Un hombro recto ES un comando. Los `1` de la tabla son los tramos rectos cortos.
3. **Pero un 4–9 % de los comandos no cae en ningún borde** (y la mitad en la pieza chica), y ahí `edgeRangeForCommand` sí devuelve el comando suelto. Ese porcentaje es el sospechoso de la queja 2 del #220, y es el número que este test congela.

**Ojo con el matiz que hace falta para no escribir un test mentiroso:** `piece.edges` viene **`undefined`** del importador de DXF — quien los rellena es el store, en la carga del proyecto (`projectSlice.ts:289-293`) y en `addPiece` (`:396-399`). Un test que importe el DXF y mire `piece.edges` directamente ve `undefined` y concluye lo contrario de lo que pasa en la app. Hay que llamar a `detectSemanticEdges` explícitamente, igual que hace el store.

**Files:**
- Create: `src/utils/__tests__/bordesSemanticosMaria.test.ts`

**Interfaces:**
- Consumes: `detectSemanticEdges` / `edgeRangeForCommand` de `src/utils/semanticEdges.ts:69,237`. El andamio para cargar su DXF ya existe en `src/utils/__tests__/baselinePiquetesMaria.test.ts` — **cópialo, no inventes otro.**

- [ ] **Step 1: Escribir el test que mide**

```ts
import { describe, it, expect } from 'vitest';
import { detectSemanticEdges, edgeRangeForCommand } from '../semanticEdges';

describe('los bordes semánticos del patrón real de María', () => {
  it('cada pieza tiene al menos dos bordes semánticos', () => {
    // Si esto falla, edgeRangeForCommand cae a [i, i+1] y el gesto de borde
    // clampea a un comando suelto — 1/216 del contorno en sus piezas.
    for (const piece of piezasDeMaria()) {
      expect(detectSemanticEdges(piece).length, `pieza ${piece.name}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('las curvas grandes caen en UN borde, no troceadas', () => {
    // Lo medido: 67, 77, 105 y 127 comandos en un solo borde. Si esto se
    // rompiera, una sisa pasaría a ser decenas de bordes de un comando y el
    // arrastre se clamparía a un sliver.
    for (const piece of piezasDeMaria()) {
      const rangos = detectSemanticEdges(piece).map(e => e.segmentRange[1] - e.segmentRange[0]);
      // La pieza chica (18 comandos) no tiene curvas densas: su máximo es 3.
      const minimoEsperado = piece.outline.length > 50 ? 50 : 3;
      expect(Math.max(...rangos), `pieza ${piece.name}`).toBeGreaterThanOrEqual(minimoEsperado);
    }
  });

  it('los comandos huérfanos son la excepción, y cuántos son queda escrito', () => {
    // La puerta, no el cuarto: que existan bordes no prueba que el gesto los
    // alcance desde cualquier punto. Un comando fuera de todo borde hace que
    // `edgeRangeForCommand` devuelva [i, i+1] — el sliver de la queja 2 del
    // #220. Medido el 2026-08-13: 4,0 % / 8,8 % / 6,2 % en las piezas grandes.
    // El umbral es 15 %: no es "está bien", es "no ha empeorado sin avisar".
    for (const piece of piezasDeMaria()) {
      if (piece.outline.length <= 50) continue; // la pieza chica es 50 % y es su forma
      const conEdges = { ...piece, edges: detectSemanticEdges(piece) };
      let huerfanos = 0;
      for (let i = 0; i < conEdges.outline.length; i++) {
        const [a, b] = edgeRangeForCommand(conEdges, i);
        if (b - a <= 1) huerfanos++;
      }
      const pct = (huerfanos / conEdges.outline.length) * 100;
      expect(pct, `pieza ${piece.name}: ${huerfanos} huérfanos`).toBeLessThan(15);
    }
  });
});
```

- [ ] **Step 2: Correr el test y verlo pasar**

Run: `npx vitest run src/utils/__tests__/bordesSemanticosMaria.test.ts`
Expected: PASS, 3/3, con los números de la tabla de arriba.

Este test es **verde de nacimiento a propósito**: la medición ya se hizo y salió a favor. Lo que congela no es un arreglo, es una premisa — si un cambio futuro en `detectSemanticEdges` trocea sus curvas, las tres tandas del arrastre se caen a la vez y este test es quien lo dice.

- [ ] **Step 3: Anotar el hueco que queda, sin arreglarlo aquí**

Un 4–9 % de sus comandos no cae en ningún borde semántico, y clicar ahí sí da el sliver de un comando. **No se arregla en esta tanda** — es la queja 2 del #220 y tiene su propio issue (#1027). Lo que sí se hace aquí es dejarlo escrito con su número, para que la 2c lo herede medido en vez de sospechado.

Si más adelante se arregla, la dirección que encaja con el resto es que el fallback de `edgeRangeForCommand` (`semanticEdges.ts:244`) se apoye en `detectCornerCommands` — las esquinas de verdad — en vez de en el comando suelto: es la misma definición de esquina que usan la Task 3 de esta tanda y el hit-test del margen, y arreglaría las tres herramientas de una vez.

- [ ] **Step 4: Commit**

```bash
git add src/utils/__tests__/bordesSemanticosMaria.test.ts
git commit -m "test(2d): medir los bordes semánticos del patrón real antes de arrastrar sobre ellos (#1029, #1027)"
```

---

## Task 1: El commit de arrastre dice DÓNDE se soltó

**Por qué existe esta tarea.** `resolveEdgeCommit` devuelve `range: [t0, t1]` **ordenado** (`edgeGesture.ts:50-51`, `Math.min`/`Math.max`) y además colapsa los extremos (`:52-53`). Para un tramo eso está bien: un tramo no tiene sentido de recorrido. Para una distancia sí lo tiene — el signo dice `direction: 'cw' | 'ccw'` (spec § 3.2) — y hoy es **irrecuperable**: cuando `press.t` cae dentro del 1% de un extremo, el colapso lo convierte en 0 ó 1 y ya no se puede saber cuál de los dos bordes del rango era el press.

Se arregla con un campo, no con una rama.

**Files:**
- Modify: `src/components/PatternEditor/edgeGesture.ts:22-24` (el tipo) y `:55` (el return)
- Test: `src/components/PatternEditor/__tests__/edgeGesture.test.ts`

**Interfaces:**
- Produces: `EdgeCommit` con la variante drag ampliada. Las tareas 4 y 5 leen `releaseT`.

```ts
export type EdgeCommit =
  | { kind: 'click'; target: EdgeTarget }
  | {
      kind: 'drag';
      target: EdgeTarget;
      range: [number, number];
      /** El t del release SIN ordenar ni colapsar. `range` pierde el sentido del
       *  recorrido y la familia DISTANCIA lo necesita para el signo: con el
       *  press pegado a un extremo, el colapso de `range` lo vuelve
       *  irrecuperable. */
      releaseT: number;
    };
```

- [ ] **Step 1: Escribir el test que falla**

En `src/components/PatternEditor/__tests__/edgeGesture.test.ts`:

```ts
it('el commit de arrastre conserva el t del release, sin ordenar', () => {
  const press: EdgeTarget = {
    pieceId: 'p', edgeIndex: 0, edgeRange: [0, 1], t: 0.8, point: { x: 0, y: 0 },
  };
  const c = resolveEdgeCommit(press, 0.2, true);
  expect(c.kind).toBe('drag');
  // range viene ordenado (es lo correcto para un TRAMO)…
  expect((c as Extract<EdgeCommit, { kind: 'drag' }>).range).toEqual([0.2, 0.8]);
  // …pero el release se conserva tal cual, que es lo que da el sentido.
  expect((c as Extract<EdgeCommit, { kind: 'drag' }>).releaseT).toBe(0.2);
});

it('conserva el release aunque el press se colapse a un extremo', () => {
  // press.t = 0.005 colapsa a 0 dentro de `range`: sin releaseT el sentido
  // del recorrido se pierde.
  const press: EdgeTarget = {
    pieceId: 'p', edgeIndex: 0, edgeRange: [0, 1], t: 0.005, point: { x: 0, y: 0 },
  };
  const c = resolveEdgeCommit(press, 0.6, true) as Extract<EdgeCommit, { kind: 'drag' }>;
  expect(c.range).toEqual([0, 0.6]);
  expect(c.releaseT).toBe(0.6);
  expect(c.target.t).toBe(0.005);
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/edgeGesture.test.ts -t 'release'`
Expected: FAIL — `releaseT` es `undefined` (y TS no compila el acceso).

- [ ] **Step 3: Implementar**

En `edgeGesture.ts`, añadir el campo al tipo (bloque de arriba) y en el `return` de `resolveEdgeCommit` (`:55`):

```ts
  return { kind: 'drag', target: press, range: [t0, t1], releaseT };
```

`releaseT` es el parámetro ya presente en la firma; en esa rama TypeScript ya lo estrechó a `number` (la guarda `releaseT === null` sale antes, `:47`).

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/edgeGesture.test.ts`
Expected: PASS, incluidos los tests de tanda 1 sin tocar.

- [ ] **Step 5: Verificar que coser no cambió**

Run: `npx vitest run src/components/PatternEditor/__tests__/ --reporter=dot`
Expected: PASS. `useFreeSewingTool` ignora el campo nuevo; si algún test suyo se pone rojo, el campo se añadió mal (p. ej. cambiando el orden de `range`).

- [ ] **Step 6: Commit**

```bash
git add src/components/PatternEditor/edgeGesture.ts src/components/PatternEditor/__tests__/edgeGesture.test.ts
git commit -m "feat(2d): el commit de arrastre conserva el sentido del recorrido (#1029)"
```

---

## Task 2: De fracción de arco a parámetro de Bézier

**Por qué existe esta tarea.** El plan de la 2a lo dejó dicho y sin resolver a propósito (`2026-08-12-tanda-2a-cimientos-de-medicion.md:136`): en `outlineRing` **`tLocal` es siempre fracción de ARCO del comando**, y convertirlo al parámetro nativo "es responsabilidad de quien llame a De Casteljau". La herramienta de punto es exactamente ese llamador: `usePointTool.ts:158` despacha `addPointOnSegment(commandIndex, t)`, que termina en `splitSegmentAt(piece.outline, commandIndex, t)` (`useEditPattern.ts:744`) — un corte de De Casteljau, o sea **parámetro nativo**.

Pasarle la fracción de arco sin convertir pone el punto en el sitio equivocado sobre cualquier curva. En una recta los dos números coinciden, así que el error es invisible justo donde ella no lo nota y visible donde sí: en la sisa.

**Files:**
- Create: `src/utils/geometry/arcToNative.ts`
- Create: `src/utils/geometry/__tests__/arcToNative.test.ts`

**Interfaces:**
- Consumes: `gaussLegendreCubicBezierLength` / `gaussLegendreQuadBezierLength` de `arcLength.ts:45,58` (públicas desde la tanda 2a).
- Produces:

```ts
/**
 * Fracción de ARCO dentro de un comando → parámetro nativo de De Casteljau.
 *
 * Sobre `L` (y sobre `M`/`Z`) los dos números son el mismo y se devuelve tal
 * cual. Sobre `C`/`Q` se invierte la longitud de arco por bisección, con la
 * misma cuadratura que usa el anillo, así que el redondeo coincide con
 * `outlineRing` en vez de contradecirlo.
 *
 * `tArc` fuera de [0,1] se clampea. Un comando degenerado (longitud 0)
 * devuelve `tArc` sin tocar: no hay nada que invertir.
 */
export function arcToNativeT(
  /** El comando al que pertenece `tArc`. */
  command: PathCommand,
  /** El punto donde arranca el comando (el cursor del comando anterior). */
  start: Point2D,
  tArc: number,
): number;
```

- [ ] **Step 1: Escribir el test que falla**

En `src/utils/geometry/__tests__/arcToNative.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../types/types';
import { arcToNativeT } from '../arcToNative';
import { gaussLegendreCubicBezierLength } from '../arcLength';

const O = { x: 0, y: 0 };
// La sisa suave del plan de la 2a: C 20,60 60,110 110,130. Arco = 175,559 mm.
const SISA: PathCommand = { type: 'C', values: [20, 60, 60, 110, 110, 130] };

describe('arcToNativeT', () => {
  it('sobre una recta el arco y el parámetro son el mismo número', () => {
    const L: PathCommand = { type: 'L', values: [100, 0] };
    for (const t of [0, 0.25, 0.5, 0.731, 1]) {
      expect(arcToNativeT(L, O, t)).toBe(t);
    }
  });

  it('sobre una curva NO son el mismo número', () => {
    // Si esto empatara, la conversión no estaría haciendo nada.
    expect(arcToNativeT(SISA, O, 0.5)).not.toBeCloseTo(0.5, 3);
  });

  it('la mitad del arco parte la curva en dos mitades de igual longitud', () => {
    const t = arcToNativeT(SISA, O, 0.5);
    const [c1x, c1y, c2x, c2y, ex, ey] = SISA.values;
    const total = gaussLegendreCubicBezierLength(
      O, { x: c1x, y: c1y }, { x: c2x, y: c2y }, { x: ex, y: ey },
    );
    // Longitud del arco hasta `t`, por sub-Bézier de De Casteljau.
    const upto = arcLengthUpTo(O, SISA, t);
    expect(upto).toBeCloseTo(total / 2, 3);
  });

  it('los extremos son exactos y no se van por bisección', () => {
    expect(arcToNativeT(SISA, O, 0)).toBe(0);
    expect(arcToNativeT(SISA, O, 1)).toBe(1);
  });

  it('clampea fuera de rango en vez de extrapolar', () => {
    expect(arcToNativeT(SISA, O, -0.3)).toBe(0);
    expect(arcToNativeT(SISA, O, 1.7)).toBe(1);
  });

  it('un comando degenerado devuelve tArc sin inventar nada', () => {
    const nulo: PathCommand = { type: 'C', values: [0, 0, 0, 0, 0, 0] };
    expect(arcToNativeT(nulo, O, 0.42)).toBe(0.42);
  });
});
```

El helper `arcLengthUpTo` va en el propio archivo de test (es andamio de verificación, no API):

```ts
/** Longitud de arco de una cúbica desde 0 hasta `t`, por sub-Bézier. */
function arcLengthUpTo(start: { x: number; y: number }, cmd: PathCommand, t: number): number {
  const [c1x, c1y, c2x, c2y, ex, ey] = cmd.values;
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const p0 = start, p1 = { x: c1x, y: c1y }, p2 = { x: c2x, y: c2y }, p3 = { x: ex, y: ey };
  const a = lerp(p0, p1), b = lerp(p1, p2), c = lerp(p2, p3);
  const d = lerp(a, b), e = lerp(b, c);
  const f = lerp(d, e);
  return gaussLegendreCubicBezierLength(p0, a, d, f);
}
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run src/utils/geometry/__tests__/arcToNative.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar**

`src/utils/geometry/arcToNative.ts`. La bisección es la misma técnica que ya usa `outlineRing` para invertir el arco; **50 iteraciones fijas** (no un `while` con epsilon: el bucle acotado no puede colgar el lienzo, y 2^-50 está muy por debajo del micrón).

```ts
import type { PathCommand, Point2D } from '../../types/types';
import { gaussLegendreCubicBezierLength, gaussLegendreQuadBezierLength } from './arcLength';

const BISECTION_STEPS = 50;

/** Sub-cúbica [0, t] por De Casteljau. */
function cubicUpTo(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number) {
  const lerp = (a: Point2D, b: Point2D): Point2D =>
    ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a = lerp(p0, p1), b = lerp(p1, p2), c = lerp(p2, p3);
  const d = lerp(a, b), e = lerp(b, c);
  return { p1: a, p2: d, p3: lerp(d, e) };
}

/** Sub-cuadrática [0, t] por De Casteljau. */
function quadUpTo(p0: Point2D, p1: Point2D, p2: Point2D, t: number) {
  const lerp = (a: Point2D, b: Point2D): Point2D =>
    ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a = lerp(p0, p1), b = lerp(p1, p2);
  return { p1: a, p2: lerp(a, b) };
}

export function arcToNativeT(command: PathCommand, start: Point2D, tArc: number): number {
  if (tArc <= 0) return command.type === 'C' || command.type === 'Q' ? 0 : Math.max(0, tArc);
  if (tArc >= 1) return command.type === 'C' || command.type === 'Q' ? 1 : Math.min(1, tArc);

  if (command.type === 'C') {
    const [c1x, c1y, c2x, c2y, ex, ey] = command.values;
    const p0 = start, p1 = { x: c1x, y: c1y }, p2 = { x: c2x, y: c2y }, p3 = { x: ex, y: ey };
    const total = gaussLegendreCubicBezierLength(p0, p1, p2, p3);
    if (total <= 0) return tArc;
    const objetivo = total * tArc;
    let lo = 0, hi = 1;
    for (let i = 0; i < BISECTION_STEPS; i++) {
      const mid = (lo + hi) / 2;
      const sub = cubicUpTo(p0, p1, p2, p3, mid);
      const len = gaussLegendreCubicBezierLength(p0, sub.p1, sub.p2, sub.p3);
      if (len < objetivo) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  if (command.type === 'Q') {
    const [cx, cy, ex, ey] = command.values;
    const p0 = start, p1 = { x: cx, y: cy }, p2 = { x: ex, y: ey };
    const total = gaussLegendreQuadBezierLength(p0, p1, p2);
    if (total <= 0) return tArc;
    const objetivo = total * tArc;
    let lo = 0, hi = 1;
    for (let i = 0; i < BISECTION_STEPS; i++) {
      const mid = (lo + hi) / 2;
      const sub = quadUpTo(p0, p1, p2, mid);
      const len = gaussLegendreQuadBezierLength(p0, sub.p1, sub.p2);
      if (len < objetivo) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // L, M, Z y cualquier otro comando recto: arco y parámetro coinciden.
  return tArc;
}
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/utils/geometry/__tests__/arcToNative.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/utils/geometry/arcToNative.ts src/utils/geometry/__tests__/arcToNative.test.ts
git commit -m "feat(geom): convertir fracción de arco a parámetro de Bézier (#1029)"
```

---

## Task 3: La referencia, por prioridad y visible

**Por qué existe esta tarea.** El spec § 3.2 fija la escalera: **1)** punto nombrable a ≤ 12 px del press (esquina del contorno, punto existente, piquete existente, extremo de un tramo cosido); **2)** si no hay ninguno, **el extremo más cercano del borde apretado, medido por arco**.

Y da la razón, que no es de gusto: *"Una distancia medida desde un punto anónimo de una curva no es una cantidad de patronaje: no se re-deriva, no se re-edita, y el ancla se rompe en cuanto el contorno se mueve."*

Hoy `computeNotchAnchor` (`notchAnchor.ts`) ya escoge la esquina más cercana, pero lo hace **después** y sin enseñarlo. Lo que cambia es que la escoge el press y ella la ve antes de mover un píxel.

**Files:**
- Create: `src/utils/geometry/distanceRef.ts`
- Create: `src/utils/geometry/__tests__/distanceRef.test.ts`

**Interfaces:**
- Consumes: `buildRing` / `projectToRing` / `pointAt` de `outlineRing.ts`; `detectCornerCommands` de **`src/utils/outlineAnalysis.ts:288`** (donde está DEFINIDA; `edgeHitTest.ts:84` es solo su llamador). Es la misma definición de "esquina de verdad" que se calibró contra el DXF de María en `421b6e86`, y reusarla es lo que evita que el piquete y el margen discrepen sobre qué es una esquina.
- Produces:

```ts
export type RefKind = 'corner' | 'point' | 'notch' | 'seamEnd' | 'edgeEnd';

export interface DistanceRef {
  /** En coordenadas LOCALES de la pieza, como `NotchAnchor.refPoint`. */
  point: Point2D;
  /** Distancia de ese punto sobre el anillo, en mm. */
  distanceMm: number;
  kind: RefKind;
}

/**
 * La referencia desde la que se mide, resuelta en el PRESS.
 *
 * Escalera del spec § 3.2: gana el punto NOMBRABLE más cercano dentro de
 * `hitMm`; si no hay ninguno, el extremo del borde apretado más cercano por
 * ARCO (no por línea recta: sobre una sisa la cuerda miente).
 *
 * `hitMm` llega en mm de patrón — quien llama convierte los 12 px de
 * `EDGE_HIT_PX` con el zoom vigente.
 */
export function resolveDistanceRef(
  ring: OutlineRing,
  piece: PatternPiece,
  /** El punto del press, en coordenadas LOCALES de la pieza. */
  pressLocal: Point2D,
  /** El borde apretado, en distancias de anillo: [inicio, fin] en mm. */
  edgeSpanMm: [number, number],
  hitMm: number,
): DistanceRef;
```

- [ ] **Step 1: Escribir el test que falla**

En `src/utils/geometry/__tests__/distanceRef.test.ts`. La figura es la misma del resto de la tanda 2a (cuadrado 100×200 con una curva en el costado derecho), para que los números sean comparables entre suites:

```ts
import { describe, it, expect } from 'vitest';
import type { PathCommand, PatternPiece } from '../../../types/types';
import { buildRing } from '../outlineRing';
import { resolveDistanceRef } from '../distanceRef';

const OUTLINE: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'C', values: [130, 60, 120, 140, 100, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
];

const ok = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error('se esperaba ok:true');
  return r.value;
};

const pieza = (over: Partial<PatternPiece> = {}): PatternPiece => ({
  id: 'p', name: 'p', outline: OUTLINE, position: { x: 0, y: 0 }, rotation: 0,
  seamAllowance: 0, internals: [], ...over,
} as PatternPiece);

describe('resolveDistanceRef', () => {
  const ring = ok(buildRing(OUTLINE, 2));

  it('una esquina a tiro gana, y se declara como esquina', () => {
    // Press a 5 mm de la esquina (100,0), sobre el borde de arriba.
    const ref = resolveDistanceRef(ring, pieza(), { x: 95, y: 0 }, [0, 100], 12);
    expect(ref.kind).toBe('corner');
    expect(ref.point.x).toBeCloseTo(100, 6);
    expect(ref.point.y).toBeCloseTo(0, 6);
  });

  it('sin nada nombrable cerca, cae al extremo del borde apretado', () => {
    // Mitad del borde de arriba: las dos esquinas están a 50 mm, fuera de los 12.
    const ref = resolveDistanceRef(ring, pieza(), { x: 50, y: 0 }, [0, 100], 12);
    expect(ref.kind).toBe('edgeEnd');
    // El extremo MÁS CERCANO por arco: empate a 50, gana el de menor distancia.
    expect(ref.distanceMm).toBeCloseTo(0, 6);
  });

  it('la caída al extremo se mide por ARCO, no en línea recta', () => {
    // Sobre el costado curvo, cerca de su final. En línea recta el punto (0,0)
    // puede quedar más cerca que el extremo del propio borde; por arco no.
    const [ini, fin] = [100, ok(buildRing(OUTLINE, 2)).totalMm - 300];
    const ref = resolveDistanceRef(ring, pieza(), { x: 104, y: 190 }, [ini, fin], 12);
    expect(ref.kind).toBe('edgeEnd');
    expect(ref.distanceMm).toBeCloseTo(fin, 6);
  });

  it('un piquete existente gana a la esquina si está más cerca', () => {
    const conPiquete = pieza({
      internals: [{
        id: 'n1', type: 'notch',
        path: [{ type: 'M', values: [60, 0] }, { type: 'L', values: [60, 6] }],
        notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 60, metric: 2 },
      }],
    } as Partial<PatternPiece>);
    const ref = resolveDistanceRef(ring, conPiquete, { x: 62, y: 0 }, [0, 100], 12);
    expect(ref.kind).toBe('notch');
    expect(ref.distanceMm).toBeCloseTo(60, 3);
  });

  it('nunca devuelve un punto anónimo de la curva', () => {
    // Press en medio del costado curvo, lejos de todo: tiene que caer al
    // extremo del borde, JAMÁS al propio punto del press.
    const [ini, fin] = [100, 100 + 150];
    const ref = resolveDistanceRef(ring, pieza(), { x: 122, y: 100 }, [ini, fin], 12);
    expect(ref.kind).toBe('edgeEnd');
    expect([ini, fin]).toContainEqual(expect.closeTo(ref.distanceMm, 6));
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run src/utils/geometry/__tests__/distanceRef.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar**

`src/utils/geometry/distanceRef.ts`. La forma: juntar los candidatos nombrables, quedarse con el más cercano al press **dentro de `hitMm`**, y si la lista sale vacía elegir el extremo de `edgeSpanMm` más cercano por arco.

```ts
import type { PatternPiece, Point2D } from '../../types/types';
import { detectCornerCommands } from '../outlineAnalysis';
import { pointAt, projectToRing, type OutlineRing } from './outlineRing';

export type RefKind = 'corner' | 'point' | 'notch' | 'seamEnd' | 'edgeEnd';

export interface DistanceRef {
  point: Point2D;
  distanceMm: number;
  kind: RefKind;
}

interface Candidato { point: Point2D; kind: RefKind }

/** Los puntos que tienen NOMBRE en el contorno de la pieza. */
function candidatos(piece: PatternPiece): Candidato[] {
  const out: Candidato[] = [];

  // Esquinas de verdad — misma definición que el margen de costura, para que
  // las dos herramientas no discrepen sobre qué es una esquina (421b6e86).
  const corners = detectCornerCommands(piece.outline);
  for (const idx of corners) {
    const cmd = piece.outline[idx];
    if (!cmd || (cmd.type !== 'M' && cmd.type !== 'L')) continue;
    out.push({ point: { x: cmd.values[0], y: cmd.values[1] }, kind: 'corner' });
  }

  // Piquetes ya colocados: su punto es el arranque de su path.
  for (const il of piece.internals ?? []) {
    if (il.type !== 'notch') continue;
    const m = il.path?.[0];
    if (!m || m.values.length < 2) continue;
    out.push({ point: { x: m.values[0], y: m.values[1] }, kind: 'notch' });
  }

  return out;
}

export function resolveDistanceRef(
  ring: OutlineRing,
  piece: PatternPiece,
  pressLocal: Point2D,
  edgeSpanMm: [number, number],
  hitMm: number,
): DistanceRef {
  let mejor: { c: Candidato; d: number } | null = null;
  for (const c of candidatos(piece)) {
    const d = Math.hypot(c.point.x - pressLocal.x, c.point.y - pressLocal.y);
    if (d <= hitMm && (!mejor || d < mejor.d)) mejor = { c, d };
  }
  if (mejor) {
    const proj = projectToRing(ring, mejor.c.point);
    return { point: proj.point, distanceMm: proj.distanceMm, kind: mejor.c.kind };
  }

  // Sin nada nombrable: el extremo del borde apretado más cercano POR ARCO.
  //
  // Por arco y no en línea recta a propósito: sobre una sisa el punto (0,0)
  // puede quedar más cerca en pantalla que el extremo del propio borde, y
  // elegirlo daría un ancla que salta de borde. La comparación es sobre
  // distancias de anillo, que es la misma magnitud que se va a guardar.
  const pressD = projectToRing(ring, pressLocal).distanceMm;
  const [ini, fin] = edgeSpanMm;
  const elegido = Math.abs(pressD - ini) <= Math.abs(pressD - fin) ? ini : fin;
  return {
    point: pointAt(ring, elegido).point,
    distanceMm: elegido,
    kind: 'edgeEnd',
  };
}
```

> **Nota para quien implemente:** lo que fija el contrato son los tests del paso 1, no estas líneas. Si al escribirlo el módulo sale más simple de otra forma, **hazlo simple** — pero no cambies la escalera de prioridad ni la comparación por arco: las dos están razonadas en el spec § 3.2.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/utils/geometry/__tests__/distanceRef.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Verificar que no se rompió el enganche del margen**

`detectCornerCommands` se comparte ahora con esta ruta. No se modifica, pero conviene probarlo:

Run: `npx vitest run src/utils/seam/__tests__/ --reporter=dot`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/geometry/distanceRef.ts src/utils/geometry/__tests__/distanceRef.test.ts
git commit -m "feat(2d): la referencia de una distancia se resuelve en el press (#1029)"
```

---

## Task 4: El piquete arrastra

**Files:**
- Modify: `src/components/PatternEditor/useNotchTool.ts:168-198` (el mousedown que commitea) y la firma `:123-136`
- Test: `src/components/PatternEditor/__tests__/useNotchTool.distancia.test.tsx` (crear)

**Interfaces:**
- Consumes: `useEdgeGesture` (Task 1), `resolveDistanceRef` (Task 3), `buildRing`/`advance` de `outlineRing`.
- Produces: el hook conserva su retorno actual (`hoveredPoint`, `handleMouseDown`, `handleMouseMove`, `refining`, `confirmRefine`, `previewRefine`, `cancelRefine`) y **añade** `handleMouseUp` y `dragPreview`. Quien lo monta (`PatternEditor.tsx`) tiene que cablear el `mouseUp`, igual que se hizo con `seam` en la tanda 1.

**Lo que cambia, en una frase:** el piquete deja de nacer en el `mousedown` y nace en el `mouseup`; si hubo arrastre, nace a la distancia arrastrada y **sin modal**.

**El modal.** Spec § 3.2: *"El modal de precisión del piquete deja de abrirse tras un arrastre. Se abre solo en la ruta de clic, donde la posición fue una adivinanza."* Tras arrastrar ella ya dijo la distancia con la mano; abrirle un cuadro a preguntárselo otra vez es desconfiar del gesto.

- [ ] **Step 1: Escribir el test que falla**

```tsx
it('un clic sigue creando el piquete donde se clica, y abre el modal', () => {
  // Contrato de compatibilidad (spec § 5): la ruta de clic no cambia salvo
  // que ahora commitea en el mouseup.
});

it('el piquete no nace en el mousedown', () => {
  // press sin release: onAddNotch NO se ha llamado.
});

it('un arrastre crea el piquete a la distancia arrastrada, medida por arco', () => {
  // press en la esquina (100,0), release 40 mm más allá SOBRE LA CURVA:
  // el anchor resultante tiene distanceMm ≈ 40 y refPoint = la esquina,
  // y el punto NO está a 40 mm en línea recta de la esquina.
});

it('tras un arrastre NO se abre el modal', () => {
  // refining sigue en null.
});

it('el sentido del arrastre fija la dirección del ancla', () => {
  // arrastrar hacia el otro lado da la direction contraria.
});

it('soltar más allá del borde clampea al extremo, no cruza la esquina', () => {
  // spec § 3.4.
});
```

> Los cuerpos van completos al escribirlos: montar el hook con `renderHook`, disparar `handleMouseDown` / `handleMouseMove` / `handleMouseUp` con `clientX`/`clientY` sintéticos y un `getBoundingClientRect` fijo, y afirmar sobre el `InternalLine` que recibe el espía `onAddNotch`. El patrón exacto ya existe en `src/components/PatternEditor/__tests__/useEdgeGesture.test.tsx` — **léelo antes de escribir estos** y cópiale el andamio en vez de inventar otro.

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/useNotchTool.distancia.test.tsx`
Expected: FAIL — hoy `onAddNotch` se llama en el mousedown y no hay `handleMouseUp`.

- [ ] **Step 3: Implementar**

Reescribir `handleMouseDown` para que solo arme, y añadir `handleMouseUp` que resuelva el commit:

- `resolveTarget`: el `closestPointOnOutline` de hoy (`:175`) más la resolución de referencia de la Task 3.
- `resolveReleaseT`: proyectar el cursor sobre el **mismo borde** del press.
- `onCommit`: `kind: 'click'` → exactamente lo de hoy (crear + abrir modal). `kind: 'drag'` → crear con un `notchAnchor` construido a mano: `refPoint` = la referencia, `direction` del signo de `releaseT − press.t`, `distanceMm` = arco entre las dos por el anillo, `metric: 2`. **Sin modal.**

El `path` del piquete se genera con `generateNotchPath(punto, normal, opts)` como hoy; el punto y la normal salen de `pointAt(ring, refDist ± distanceMm)`.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/ --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Cablear el mouseUp en el editor**

`PatternEditor.tsx` / `useEditorInteractions.ts`: añadir `notch` al ruteo del `mouseUp`, igual que la tanda 1 hizo con `seam`. **Sin esto el gesto no cierra** — es el conflicto #17 del spec, marcado ahí como bloqueante de implementación.

- [ ] **Step 6: Correr la suite entera**

Run: `npm run test`
Expected: PASS. En especial `baselinePiquetesMaria.test.ts`: los piquetes guardados no se mueven.

- [ ] **Step 7: Commit**

```bash
git add src/components/PatternEditor/useNotchTool.ts src/components/PatternEditor/__tests__/useNotchTool.distancia.test.tsx src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/useEditorInteractions.ts
git commit -m "feat(2d): el piquete se coloca a la distancia que se arrastra (#1029)"
```

---

## Task 5: El punto arrastra, y el press manda

**Files:**
- Modify: `src/components/PatternEditor/usePointTool.ts` — `:50` (el `HIT_RADIUS_PX` local), `:136-144` (mousedown), `:147-163` (mouseup)
- Test: `src/components/PatternEditor/__tests__/usePointTool.distancia.test.tsx` (crear)

**El cambio de filosofía, dicho claro.** Hoy `usePointTool` **re-resuelve el objetivo en el release** (`:151`, con el comentario *"El release manda: lo que esté bajo el cursor al soltar es el objetivo"*). La ley del spec dice lo contrario: **el press manda el OBJETO, el release manda el VALOR** (§ 2, y § 3.3 lo reconcilia explícitamente para `point`: *"el press manda el borde, el release manda dónde a lo largo de él"*).

**El caso sub-umbral es idéntico al de hoy**, porque press y release están a < 4 px y caen en el mismo comando. El comentario de `:146` se sustituye por uno que diga la ley nueva; dejarlo mintiendo sería peor que el código.

- [ ] **Step 1: Escribir el test que falla**

```tsx
it('un clic sigue metiendo el punto donde se suelta, como hoy', () => {});

it('el press fija el comando: mover a otro borde y soltar NO cambia de borde', () => {
  // Hoy esto falla: :151 re-resuelve el hover y despacha sobre el otro comando.
});

it('un arrastre mete el punto a la distancia arrastrada, por arco', () => {});

it('el t que se despacha es el NATIVO, no la fracción de arco', () => {
  // Sobre la curva del fixture, arrastrar hasta la mitad del arco despacha
  // un t != 0.5 — el de arcToNativeT. Sin esta conversión el punto cae mal.
});

it('sub-umbral se comporta exactamente como hoy', () => {});
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/usePointTool.distancia.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- Borrar `HIT_RADIUS_PX` de `:50` e importar `EDGE_HIT_PX` de `gestureConstants`.
- Sustituir el `armed` booleano por `useEdgeGesture`.
- En el commit: `click` → `verbs.addPointOnSegment(commandIndex, t)` con el `t` **nativo** del punto del press; `drag` → resolver la distancia por el anillo, obtener `RingPoint { commandIndex, tLocal }` con `pointAt`, y despachar `addPointOnSegment(commandIndex, arcToNativeT(cmd, start, tLocal))`.
- Los modos `curvePoints` y `bezier` **no ganan arrastre**: siguen despachando en el commit de clic. Son verbos sobre el comando entero, no cantidades.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/ --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/usePointTool.ts src/components/PatternEditor/__tests__/usePointTool.distancia.test.tsx
git commit -m "feat(2d): el punto se coloca a la distancia que se arrastra (#1029)"
```

---

## Task 6: Los cinco feedbacks del arrastre

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/DistanceOverlay.tsx`
- Create: `src/components/PatternEditor/renderers/__tests__/DistanceOverlay.test.tsx`
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx` (montarlo)

**Los cinco, del spec § 3.2** — y son simultáneos, no alternativas:

| Señal | Qué es |
|---|---|
| Anillo de referencia | en `refPoint`, aparece en el press |
| Arco recorrido | borde resaltado grueso de referencia a cursor, **siguiendo la curva** |
| Número | mm con **un decimal**, a 12 px del cursor |
| Fantasma del objeto | glifo del piquete/punto en la posición proyectada |
| — | **cero redondeo automático** |

**El movimiento perpendicular al borde no cuenta** (§ 3.2): solo la proyección a lo largo del borde mueve el número.

El overlay hermano `EdgePairOverlay.tsx` ya hace lo equivalente para la familia TRAMO (pinta `liveRange` sobre la curva) — **léelo antes y cópiale la forma**, incluido cómo obtiene el sub-path de un rango.

- [ ] **Step 1: Escribir el test que falla**

```tsx
it('pinta el anillo en la referencia desde el press, antes de mover', () => {});
it('el arco resaltado sigue la curva, no la cuerda', () => {
  // El path pintado tiene comandos de curva cuando el tramo cae sobre una C.
});
it('el número lleva un decimal y no se redondea a entero', () => {
  // 47,3 se pinta "47,3", nunca "47".
});
it('mover perpendicular al borde no cambia el número', () => {});
it('sin gesto vivo no pinta nada', () => {});
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/DistanceOverlay.test.tsx`
Expected: FAIL — el componente no existe.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/ --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/renderers/overlays/DistanceOverlay.tsx src/components/PatternEditor/renderers/__tests__/DistanceOverlay.test.tsx src/components/PatternEditor/renderers/ToolOverlay.tsx
git commit -m "feat(2d): el arrastre de distancia se ve mientras se hace (#1029)"
```

---

## Task 7: "Distancia exacta…" en el clic derecho

**Files:**
- Modify: `src/components/PatternEditor/actionCuration.ts` — `ActionId` (`:42-49`), `ACTIONS` (`:146-281`), la fila `il.notch` (`:313`)
- Test: `src/components/PatternEditor/__tests__/actionCuration.test.ts`

**El menú no se reparte** (spec § 3.5): el dueño sigue siendo `PatternEditor.tsx:380` y las herramientas ganan **filas**, no propiedad. El mandato del módulo lo dice igual de claro (`actionCuration.ts:4-7`): *"Curar = editar filas de CURATION; nunca tocar componentes."*

La acción reabre el `NotchPrecisionModal` que **ya existe** sobre un piquete ya creado — no hay UI nueva, solo una puerta más al mismo sitio.

**El texto exacto de la fila lo escribe la skill `solace-wren`** (The Cut #10 del spec). "Distancia exacta…" es el marcador de trabajo, no la copia final.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('el menú de un piquete ofrece abrir su distancia exacta', () => {
  const menu = resolveMenuActions({ kind: 'il.notch', /* … */ });
  expect(menu).toContain('notchExactDistance');
});

it('la acción no aparece sobre otros tipos de línea interna', () => {});
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/actionCuration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

1. Añadir `'notchExactDistance'` a la unión `ActionId`.
2. Añadir su `ActionDef` a `ACTIONS`.
3. Añadir el id al `menu` de la fila `il.notch` (`:313`).
4. Cablear el handler para que ponga el `refining` del `useNotchTool` sobre el piquete elegido.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/actionCuration.test.ts`
Expected: PASS.

- [ ] **Step 5: Los gates completos**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: los tres verdes.

- [ ] **Step 6: Commit**

```bash
git add src/components/PatternEditor/actionCuration.ts src/components/PatternEditor/__tests__/actionCuration.test.ts
git commit -m "feat(2d): el clic derecho de un piquete abre su distancia exacta (#1029)"
```

---

## Correcciones del review adversarial (2026-08-13)

El plan pasó por `codex review` contra el árbol en el corte `851f5544`. Veredicto: *"no ejecutaría los planes tal como están"*. Las tareas 0, 1 y 2 sobrevivieron (la bisección se verificó correcta punto por punto); **las tareas 3 a 7 quedan corregidas por esta sección, que manda sobre lo escrito arriba.**

Lo que confirmó que está bien, y ahorra volver a comprobarlo: `buildRing`, `projectToRing`, `pointAt`, `distanceAt`, `advance`, las dos cuadraturas de Bézier, `detectCornerCommands` en `outlineAnalysis.ts:288`, `splitSegmentAt` con `t` nativo, y que `perEdgeWidths` admite un cuarto parámetro opcional sin romper llamadores.

### C-1 · La referencia no puede resolver lo que promete (Task 3)

`RefKind` declara `'point'` y `'seamEnd'`, pero `candidatos()` solo construye esquinas y piquetes. Peor: la firma recibe una `PatternPiece`, así que **no puede ver las costuras del proyecto** — viven en `project.seams`, no en la pieza. Y `detectCornerCommands` solo marca comandos `M`/`L`, así que **una esquina cuyo comando fuente sea `C`/`Q` se descarta**.

Corrección: la firma toma también las costuras de la pieza (o el plan renuncia a `'seamEnd'` y lo dice), y los candidatos incluyen los nodos del contorno que no son esquina pero sí son puntos que ella insertó. Mientras no estén, `RefKind` no debe declarar variantes que nadie produce.

### C-2 · La dirección se fija en los primeros 4 px, no al soltar (Task 4)

El spec § 3.2 es literal: *"la fijan los primeros 4 px de recorrido proyectados sobre el borde"*. El plan la derivaba del signo de `releaseT − press.t`, que es el signo **final**. Si ella arranca hacia un lado y vuelve antes de soltar, el ancla queda guardada con la dirección contraria a la que hizo.

`useEdgeGesture` hoy solo conserva `moved: boolean` (`:22`): **no guarda el primer `t` que cruzó el umbral**. Hace falta un campo más en `ArmedRef`, y es un cambio en el hook compartido — o sea, con su test de no-regresión de coser.

### C-3 · El piquete no tiene con qué construir un `EdgeTarget` (Task 4)

`closestPointOnOutline` (`useNotchTool.ts:42`) devuelve `{point, normal, dist}` — **ni comando, ni borde semántico, ni `t`** — y sobre `C`/`Q` proyecta contra la cuerda entre extremos, que es el error de medida que toda esta tanda existe para eliminar. Además `pointAt` devuelve un `RingPoint` **sin normal**, así que el `pointAt(ring, …).normal` que el plan escribía no compila.

Corrección: sustituir ese hit-test por uno que dé comando + `t`, y derivar la normal por diferencia finita sobre el anillo — que es lo que ya hace `resolveNotchAnchorV2` en `notchAnchor.ts` desde la 2a. **Reusarlo, no reimplementarlo.**

### C-4 · La herramienta de Punto no encaja en el gesto tal cual (Task 5)

Tres cosas a la vez: `PointToolTarget` no tiene `edgeIndex` ni `edgeRange`; su `t` es **parámetro nativo del comando**, no fracción de arco del borde, que es lo que `EdgeTarget` significa; y el test del plan exige que el clic inserte donde se suelta mientras el texto ordena usar el `t` del press. Las dos cosas no pueden ser verdad: bajo umbral están a < 4 px, pero eso **no** es cero.

Corrección: decidir explícitamente que bajo umbral manda el press (es la ley del § 2) y ajustar el test, o declarar la excepción y justificarla. Y los modos `curvePoints`/`bezier` necesitan una rama propia, o al cruzar el umbral se quedan en no-op.

### C-5 · El overlay no tiene por dónde recibir los datos (Task 6)

La Task 6 no toca `PatternEditor.tsx` ni los hooks, así que el `dragPreview` local no llega a `ToolOverlay`. Y el overlay "hermano" que el plan manda copiar (`SegmentSewingOverlay.tsx:33`) **aplana el arco y emite solo `M`/`L`**, mientras el test nuevo exige comandos de curva. Corrección: añadir los archivos del cableado al task, y para el arco curvo extraer el sub-path con los comandos originales en vez de copiar el aplanado.

### C-6 · "Distancia exacta…" no tiene circuito (Task 7)

`setRefining` es privado del hook (`useNotchTool.ts:138`) y no hay callback de curación que lo abra; el commit del task solo incluye `actionCuration.ts`. Faltan como mínimo `useNotchTool.ts` y `PatternEditor.tsx`. Y la cita `PatternEditor.tsx:380` del spec está corrida: esa línea está vacía y el dueño del contextmenu empieza en `:378`.

### C-7 · Falta media máquina de estados (transversal)

Ningún task registra Piquete ni Punto en el guard de contextmenu (hoy solo conoce `seam`) ni en el Escape (hoy solo Punto y Coser, `useEditorInteractions.ts:398`), ni añade `pointercancel`, ni implementa `Shift` para milímetros enteros, ni `Alt` para el par simétrico de piquetes, ni toca los hints (`HintText.tsx:45` no tiene frase de Punto ni de Piquete). Todo eso lo exige el spec (§ 4.1, § 8) y sin ello el gesto funciona pero incumple la gramática. **Es un task nuevo, el 8.**

---

## Verificación de la tanda

- [ ] `npx tsc -b --noEmit` limpio.
- [ ] `npm run test` verde, **con `baselinePiquetesMaria.test.ts` incluido** — es el contrato de que no se movió ningún piquete guardado.
- [ ] `npm run lint` sin errores nuevos.
- [ ] **A mano, con el DXF de María** (`tests/fixtures/garments/maria_patrones_samuel_2M.dxf`): importar, coger la herramienta de piquete, arrastrar sobre una sisa y comprobar que el número que sale es el arco y no la cuerda. Es el caso que el #1026 falló.
- [ ] **#1029 sigue abierto.** Cierra al terminar la 2c.
