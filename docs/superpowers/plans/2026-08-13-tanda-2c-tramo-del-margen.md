# Tanda 2c — El tramo del margen de costura

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que arrastrar sobre un borde con la herramienta de margen marque **el tramo** que lleva ese margen, y que el clic siga cogiendo el borde entero — cerrando la parte viva del #220 y el resto del #221.

**Architecture:** El gesto ya existe (`useEdgeGesture`, tanda 1) y la geometría del offset ya trabaja **por segmento aplanado**, no por borde. Lo que falta es dónde aterriza el valor: el margen se guarda hoy como **un número por borde entero**, así que un tramo parcial no tiene representación. Esta tanda añade ese campo — opt-in, ausente = comportamiento de hoy — y lo enchufa a los tres sitios que ya lo consumirían.

**Tech Stack:** TypeScript, React, zod para el schema, tests con vitest.

**Spec:** `docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md` § 3.3, § 3.4, § 3.5, § 5
**Issues:** #1029 (M-221), **#1027 (M-220)**. Al cerrar esta tanda cierran los dos.

---

## Lo que se midió antes de escribir esto

El spec dice, en su § 2: *"**No hay modelo de datos nuevo.** Ambos destinos existen y están testeados."* Para la familia TRAMO nombra `SeamHalfRange { tStart?, tEnd? }` de `seamRange.ts:19-22`.

**Para el margen eso es falso, y se comprobó a mano.** `SeamHalfRange` vive dentro de `Seam.pieceA` / `Seam.pieceB` (`types.ts:392`, `:403`): describe qué tramo se **cose**, no qué tramo lleva **margen**. El margen se guarda en dos sitios y ninguno admite un tramo:

| Dónde | Qué es | Granularidad |
|---|---|---|
| `PatternPiece.seamAllowance` (`types.ts:39-40`) | ancho por defecto de la pieza | **pieza entera** |
| `SemanticEdge.seamAllowanceWidth?` (`types.ts:377-383`) | override por borde | **borde entero** |

Un grep de `allowanceRange|seamAllowanceRange|tStart.*allowance` en `src/` no devuelve nada. **El tramo del margen no tiene hoy dónde aterrizar.** Es el único hueco real de la tanda 2 y por eso es la Task 2 de este plan, antes que el gesto.

**La media noticia, corregida por el review adversarial del 2026-08-13.** El borrador de este plan decía que la geometría "ya está preparada" y que el escalón salía gratis. **Las dos mitades de esa frase eran falsas** y conviene dejar dicho por qué, porque la parte verdadera sigue en pie.

Lo verdadero: `generateSeamAllowanceWithCorners` (`cornerTypes.ts:992`) aplana el contorno y llama a `perEdgeWidths` (`:637`), que devuelve **un ancho por segmento aplanado** (`:643`), no uno por borde, y el offset se aplica segmento a segmento (`:744`). Esa parte del andamio sí sirve.

Lo falso, y lo que cuesta:

1. **Un borde recto es UN solo segmento aplanado.** Una `L` no se subdivide. Clasificar su punto medio contra los tramos no puede representar un `[0,25 – 0,75]`: el segmento entero se lleva un único ancho, o el de dentro o el de fuera. **Hay que insertar vértices exactamente en los límites del tramo** antes de calcular los offsets. Sin eso, el test *"un tramo ensancha SOLO su trozo"* no puede pasar sobre un borde recto — que es justo el caso que María describe («una línea de punto a punto»).

2. **En la discontinuidad no hay escalón.** El generador no usa `miterAt` para sus esquinas: usa `cornerBundleAt` (`:792-800`) → `cornerMitered` (`:273`), y su fallback de paralelas devuelve **un solo punto**, `[{...prevOffsetEdge.end}]` (`:284-287`). Con un punto, el contorno sale del ancho viejo y llega al nuevo **en diagonal a lo largo del segmento siguiente** — una rampa, no un escalón. Un margen que se ensancha progresivamente durante un centímetro no es lo que se pidió ni lo que se corta. **Hace falta una unión explícita de dos puntos en el salto.**

Ninguna de las dos es cara, pero las dos son trabajo con su test, y el plan que las daba por regaladas habría llegado a la Task 3 creyendo que ya estaba hecha.

### Las tres quejas del #220, separadas

La nota de María es una sola frase pero contiene tres cosas distintas, y solo una es esta tanda:

1. **Todo o nada en una recta** — *"o coge toda una línea de punto a punto sin dejar seleccionar solo una parte"*. **Es esta tanda.**
2. **"Una parte random" en una curva** — su hipótesis: *"parece que es entre punto de curva y punto extremo"*. **Puede estar ya arreglado**: `421b6e86` (PR #1048) quitó los vértices fantasma, y la unidad que devuelve el hit-test es el borde semántico (`edgeHitTest.ts:128`, `edgeId: edge.id`), derivado de tramos geométricos reales (`semanticEdges.ts:69-71`, `analysis.trams`), no de comandos. **No se da por arreglado sin medirlo: es la Task 1.**
3. **Clics muertos en curva** — arreglado y medido en `421b6e86`: 862 de 882 clics sobre el contorno cogían un vértice que nadie dibujó. Fuera de alcance aquí.

> **Sospecha concreta sobre la queja 2, y dónde se comprueba.** `edgeRangeForCommand` (`semanticEdges.ts:237-245`) cae a `[cmdIndex, cmdIndex + 1]` — **un solo comando** — cuando la pieza no tiene bordes semánticos, y `detectSemanticEdges` devuelve `[]` con menos de dos tramos (`:71`). Sobre sus contornos de ~216 comandos `L`, eso es 1/216 del perímetro: *"una parte random entre punto de curva y punto extremo"*, literalmente. La medición vive en la **Task 0 de la tanda 2b**, porque bloquea a las dos por igual. Este plan la da por hecha.

## Global Constraints

- **Ausente = como hoy.** El campo nuevo es opcional y su ausencia reproduce el comportamiento actual **bit a bit**. Es la misma convención no-retroactiva que la tanda 2a usó para `NotchAnchor.metric`, y por la misma razón: el trabajo guardado de María no se toca.
- **El campo va al schema para VALIDARSE, no para sobrevivir.** El borrador decía que sin declararlo zod lo borraría, por analogía con `notchAnchorSchema` en la 2a. **Es falso aquí y lo comprobó el review:** `semanticEdgeSchema` **ya termina en `.loose()`** (`projectSchema.ts:145`), así que un `seamAllowanceSpans` sin declarar sobrevive al round-trip. La lección de la 2a no se transfiere: aquel era un `z.object` pelado. Lo que sí compra declararlo es **validación** — hoy un `tStart` de 7, un `tEnd` menor que su `tStart` o un ancho negativo entrarían tal cual.
- **Las piezas nacen NETAS.** `seamAllowance: 0` (`defaults.ts:35`, con el comentario `// born net`) y el generador corta en seco con `if (saWidth <= 0) return []` (`cornerTypes.ts:1001`). Marcar un tramo sobre una pieza que nunca recibió un margen base **no pinta absolutamente nada** si el ancho efectivo no tiene en cuenta los tramos. Es la Task 3b.
- **La precedencia del mousedown es la del spec § 3.3**, y el invariante que la sostiene: *"El objetivo del mousedown es dueño del gesto hasta el mouseup. La posición posterior del cursor nunca lo re-apunta."*
- **La cláusula de compatibilidad (spec § 5).** Clic en vértice, clic en borde, clic en cuerpo y arrastre por el cuerpo siguen haciendo exactamente lo de hoy.
- **Ninguna herramienta declara su propio umbral.** `DRAG_THRESHOLD_PX` ya se importa en `useSeamAllowanceTool.ts:7`; los `vThresh`/`eThresh` locales (`:60-61`) apuntan a `EDGE_HIT_PX`.
- **TDD obligatorio.** Ningún código de producción sin un test visto fallar por la razón correcta.
- **Typecheck:** `npx tsc -b --noEmit` (modo build), nunca `tsc --noEmit` a secas.
- **`git add` explícito en cada tarea.**
- **Sin `--no-verify`.**

### Lo que esta tanda NO hace

- **No toca el piquete ni el punto** — es la 2b.
- **No arregla los clics muertos en curva** — ya lo hizo `421b6e86`.
- **No unifica los umbrales de enganche restantes** (spec § 7.1). Issue aparte.
- **No permite un tramo que cruce la esquina.** Spec § 3.4: se clampea al borde del press. Un tramo multi-borde es The Cut #1.
- **No añade manijas de extremo del tramo en el lienzo.** The Cut #3: los campos numéricos del panel ya lo hacen.

---

## Estructura de archivos

> **Prerrequisito, en otra tanda:** la **Task 0 de la 2b** mide si sus piezas tienen bordes semánticos. Si salió roja, no empieces esto: el gesto no tendría sobre qué clampear y la Task 1 de aquí mediría un árbol que ya se sabe torcido.

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/utils/__tests__/unidadMargenMaria.test.ts` | **nuevo.** Medir qué unidad devuelve hoy el hit-test sobre SU patrón | 1 |
| `src/types/types.ts:377-383` | `SemanticEdge` gana `seamAllowanceSpans?` | 2 |
| `src/utils/projectSchema.ts:132-143` | El campo nuevo en `semanticEdgeSchema`. **Sin esto se borra al guardar.** | 2 |
| `src/utils/seam/cornerTypes.ts:637` | `perEdgeWidths` resuelve tramos, no solo bordes | 3 |
| `src/components/PatternEditor/useSeamAllowanceTool.ts:52-83` | La rama de tramo sobre borde | 4 |
| `src/store/projectSlice.ts:1134-1167` | La acción que escribe un tramo | 4 |
| `src/components/PropertiesPanel/EdgePropertiesSection.tsx` | Ver y editar los tramos de un borde | 5 |
| `src/components/PropertiesPanel/SeamPropertiesPanel.tsx:54-78` | El rango cosido pasa de % a mm | 6 |

---

## Task 1: Medir la unidad, sobre su patrón, antes de tocar nada

**Por qué esta tarea va primera.** El propio issue #1027 lo pide con esas palabras: *"Medir qué unidad devuelve hoy el hit-test del margen (comando vs borde semántico vs pieza)"* y *"Decidir la unidad correcta con ella, no por nosotros"*.

Y hay una razón concreta para no saltárselo: `detectSemanticEdges` devuelve `[]` si el análisis encuentra menos de dos tramos (`semanticEdges.ts:71`). Sobre una pieza sin bordes semánticos, `resolveSeamAllowanceClick` **nunca** llega a la rama de borde (`edgeHitTest.ts:125`, `piece.edges?.length ? … : null`) y todo cae a "pieza entera". Si eso le pasa a María, la queja 1 no se arregla con un gesto nuevo: se arregla antes, y este plan estaría construyendo encima de una puerta cerrada.

El patrón real está en el repo: `tests/fixtures/garments/maria_patrones_samuel_2M.dxf`. La tanda 2a ya montó el andamio de importarlo en un test (`src/utils/__tests__/baselinePiquetesMaria.test.ts`) — **cópiale la forma de cargar el DXF** en vez de inventar otra.

**Files:**
- Create: `src/utils/__tests__/unidadMargenMaria.test.ts`
- Create: `docs/reports/2026-08-13-unidad-de-seleccion-del-margen.md`

- [ ] **Step 1: Escribir el test que mide**

```ts
import { describe, it, expect } from 'vitest';
import { resolveSeamAllowanceClick } from '../seam/edgeHitTest';
import { detectSemanticEdges } from '../semanticEdges';

describe('la unidad de selección del margen, sobre el patrón real de María', () => {
  it('sus piezas TIENEN bordes semánticos', () => {
    // Si esto falla, la rama de borde de resolveSeamAllowanceClick es
    // inalcanzable para ella y el plan cambia de forma.
    for (const piece of piezasDeMaria()) {
      expect(detectSemanticEdges(piece).length, `pieza ${piece.name}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('un clic sobre el contorno devuelve un BORDE, no un vértice ni la pieza', () => {
    // Barrido: N puntos repartidos por el contorno de cada pieza, al zoom con
    // el que se ve el patrón entero. Se cuenta cuántos dan 'edge'.
    // El número va al informe: es el dato que 421b6e86 dejó en 98% de fallo
    // ANTES de su arreglo, y aquí se comprueba que hoy no vuelve.
  });

  it('el borde que devuelve cubre un TRAMO, no un comando suelto', () => {
    // Para cada edge devuelto, su segmentRange abarca más de un comando en
    // las piezas con curvas aplanadas (216 vértices/pieza, cero curvas — ver
    // docs/reports/2026-08-12-verificacion-piquetes-patron-real.md).
    // Si abarcara UN comando, la queja 2 de María sigue viva y hay que
    // arreglarla ANTES del gesto.
  });
});
```

- [ ] **Step 2: Correr el test y leer lo que dice**

Run: `npx vitest run src/utils/__tests__/unidadMargenMaria.test.ts`

**No es un test que deba pasar a la primera: es una medición.** Si sale rojo, el rojo es el hallazgo. Anota los tres números (bordes por pieza, % de clics que dan `edge`, comandos por borde) antes de tocar nada.

- [ ] **Step 3: Escribir el informe con lo medido**

`docs/reports/2026-08-13-unidad-de-seleccion-del-margen.md`: los tres números, con la tabla por pieza, y el veredicto sobre las quejas 1 y 2 del #220. Si la queja 2 sigue viva, **para aquí y arréglala antes** — este plan sigue siendo válido después.

- [ ] **Step 4: Commit**

```bash
git add src/utils/__tests__/unidadMargenMaria.test.ts docs/reports/2026-08-13-unidad-de-seleccion-del-margen.md
git commit -m "test(seam-allowance): medir la unidad de selección sobre el patrón real (#1027)"
```

---

## Task 2: Dónde aterriza un tramo de margen

**Files:**
- Modify: `src/types/types.ts:377-383` (dentro de `SemanticEdge`)
- Modify: `src/utils/projectSchema.ts:132-143` (`semanticEdgeSchema`)
- Test: `src/utils/__tests__/seamAllowanceSpans.test.ts` (crear)

**La forma, y por qué esta y no otra.** Un solo rango por borde (`seamAllowanceRange?: [number, number]`) sería más corto, pero deja fuera el caso obvio en cuanto ella lo use dos veces sobre el mismo borde — y un borde semántico de su patrón puede ser toda una sisa. La lista subsume el caso de uno y no cuesta apenas más:

```ts
  /**
   * Tramos con un ancho de margen propio, DENTRO de este borde.
   *
   * `tStart`/`tEnd` son fracción de ARCO del borde (0–1), la misma
   * parametrización que `SeamHalfRange` usa para el rango cosido. Los tramos
   * NO se solapan; el escritor los normaliza (ver `normalizeSpans`).
   *
   * Lo que NO cubre un tramo hereda, en este orden: `seamAllowanceWidth` de
   * este borde → `seamAllowance` de la pieza. Ausente = exactamente el
   * comportamiento de siempre.
   */
  seamAllowanceSpans?: Array<{ tStart: number; tEnd: number; width: number }>;
```

**El schema no es opcional.** `semanticEdgeSchema` (`projectSchema.ts:132`) es un `z.object` anidado, y el `.loose()` del padre **no** se propaga a los hijos — la tanda 2a lo descubrió con `notchAnchorSchema`, donde el campo `metric` se borraba en cada guardado sin que nada avisara. Si esta tarea se hace a medias, los tramos desaparecen al recargar el proyecto y el bug parece del gesto.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('un tramo sobrevive al round-trip de guardar y cargar', () => {
  // Este es EL test de la tarea: parsear un proyecto con seamAllowanceSpans
  // y comprobar que siguen ahí. Sin el schema, zod los tira en silencio.
});

it('un borde sin tramos se comporta exactamente como hoy', () => {});

it('el schema rechaza un tramo con tStart fuera de [0,1]', () => {});

it('el schema rechaza un ancho negativo', () => {});

it('los tramos solapados se normalizan, no se guardan pisados', () => {});
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/utils/__tests__/seamAllowanceSpans.test.ts`
Expected: FAIL — el campo no existe y zod lo tira.

- [ ] **Step 3: Implementar**

1. El campo en `SemanticEdge` (bloque de arriba).
2. En `semanticEdgeSchema`, junto a `seamAllowanceWidth` (`:143`):

```ts
    seamAllowanceSpans: z
      .array(
        z.object({
          tStart: finiteNumber.refine((n) => n >= 0 && n <= 1, { message: 'must be in [0,1]' }),
          tEnd: finiteNumber.refine((n) => n >= 0 && n <= 1, { message: 'must be in [0,1]' }),
          width: finiteNumber.refine((n) => n >= 0, { message: 'must be >= 0' }),
        }),
      )
      .optional(),
```

3. `normalizeSpans(spans)`: ordenar por `tStart`, descartar los degenerados (`tEnd - tStart < 0.01`, el mismo `MIN_SEGMENT_T` que ya usa `edgeGesture.ts:4`) y resolver solapes dejando ganar al último escrito.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/utils/__tests__/seamAllowanceSpans.test.ts && npx vitest run src/utils/__tests__/projectSchema* --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/types.ts src/utils/projectSchema.ts src/utils/__tests__/seamAllowanceSpans.test.ts
git commit -m "feat(seam-allowance): un borde puede llevar el margen por tramos (#1027, #1029)"
```

---

## Task 3: La geometría respeta el tramo

**Files:**
- Modify: `src/utils/seam/cornerTypes.ts:637-660` (`perEdgeWidths`) y `:729` (la llamada desde `buildOffsetEdges`)
- Test: `src/utils/seam/__tests__/seamAllowanceGeometry.test.ts` (existe — ampliar)

**El cambio, medido.** `perEdgeWidths` recibe hoy solo los índices de comando (`vertexCmds: number[]`, `:638`) y resuelve el ancho por comando (`:651`, `commandWidth.set(c, …)`). Un tramo necesita **posición dentro del borde**, y esa información está en el llamador: `buildOffsetEdges` tiene `sourced` (los puntos aplanados con su comando, `:710-715`) justo antes de llamar (`:729`).

Así que la firma gana los puntos:

```ts
export function perEdgeWidths(
  vertexCmds: number[],
  semanticEdges: SemanticEdge[] | undefined,
  fallbackWidth: number,
  /** Los puntos aplanados, en el mismo orden que `vertexCmds`. Necesarios para
   *  resolver un tramo: sin ellos no se sabe la posición de arco DENTRO del
   *  borde, solo a qué comando pertenece. Ausentes → solo anchos por borde
   *  entero, que es el comportamiento anterior a los tramos. */
  vertices?: Point2D[],
): number[];
```

**La esquina de la discontinuidad no se diseña.** Donde el ancho salta, los dos segmentos de offset quedan paralelos y `miterAt` (`:749-754`) cae a `prev.end` porque `lineIntersection` devuelve `null`. Eso dibuja un escalón perpendicular, que es lo que un margen escalonado hace en la tela. Se prueba, no se construye.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('sin tramos, el contorno de corte es byte a byte el de antes', () => {
  // El rectángulo 300x150 con SA 10 sigue devolviendo exactamente
  // (90,90) (410,90) (410,260) (90,260) — el mismo oráculo que ya está en
  // este archivo desde el arreglo del zigzag.
});

it('un tramo con ancho propio ensancha SOLO su trozo del borde', () => {});

it('la discontinuidad es un escalón perpendicular, no un pico ni un hueco', () => {
  // Los dos puntos del salto comparten x (o y) y difieren en la normal.
});

it('un tramo de ancho 0 deja ese trozo sin margen, pegado al contorno', () => {});

it('un tramo que cubre el borde entero da lo mismo que seamAllowanceWidth', () => {
  // Contrato de coherencia: dos formas de decir lo mismo dan la misma geometría.
});
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/utils/seam/__tests__/seamAllowanceGeometry.test.ts`
Expected: FAIL en los cuatro últimos; **el primero tiene que pasar ya** — si falla, el cambio rompió la compatibilidad y hay que parar.

- [ ] **Step 3: Implementar**

En `perEdgeWidths`, después del mapa de anchos por comando: para cada borde con `seamAllowanceSpans`, recorrer sus segmentos aplanados acumulando arco, normalizar a [0,1] sobre el largo del borde, y pisar `widths[i]` cuando el punto medio del segmento cae dentro de un tramo. En `buildOffsetEdges:729`, pasar `vertices`.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/utils/seam/ --reporter=dot`
Expected: PASS, incluidas las suites de esquinas y de export que ya consumen esta ruta.

- [ ] **Step 5: Commit**

```bash
git add src/utils/seam/cornerTypes.ts src/utils/seam/__tests__/seamAllowanceGeometry.test.ts
git commit -m "feat(seam-allowance): el offset respeta un ancho que cambia a mitad de borde (#1027)"
```

---

## Task 4: El arrastre marca el tramo

**Files:**
- Modify: `src/components/PatternEditor/useSeamAllowanceTool.ts:52-83` (la precedencia) y `:60-61` (los umbrales locales)
- Modify: `src/store/projectSlice.ts:1134-1167` (la acción que escribe)
- Test: `src/components/PatternEditor/__tests__/useSeamAllowanceTool.tramo.test.tsx` (crear)

**La precedencia, formalizada (spec § 3.3).** Hoy el mousedown delega en `resolveSeamAllowanceClick` (`:62`) y ramifica en tres (`:64-82`). La rama de borde es hoy un **clic puro** con un comentario que lo dice (`:65-66`, *"Pure click — never start a drag on a vertex/edge"*). Esa es la línea que cambia:

```
1. VÉRTICE   ≤ 10 px  → selecciona vértice       · drag DESHABILITADO   (igual que hoy)
2. BORDE     ≤ 12 px  → arma EDGE-SPAN drag      · < 4px = selecciona borde  ← NUEVO
3. CUERPO    dentro   → arma BODY drag           · < 4px = aplica a la pieza (igual que hoy)
4. VACÍO              → nada
```

**El invariante que mata la ambigüedad** (spec § 3.3): *"El objetivo del mousedown es dueño del gesto hasta el mouseup. La posición posterior del cursor nunca lo re-apunta."* Un body-drag que después pasa por un borde sigue siendo body-drag. Los dos orígenes están a 12 px por construcción: no pueden contender.

- [ ] **Step 1: Escribir el test que falla**

```tsx
it('clic en borde sigue seleccionando el borde entero, como hoy', () => {});

it('arrastre sobre un borde escribe un tramo, no el borde entero', () => {});

it('el vértice sigue ganando al borde, y NO arma arrastre', () => {});

it('un body-drag que pasa por encima de un borde sigue siendo body-drag', () => {
  // El invariante. Es el choque del #220 y la razón de la precedencia.
});

it('soltar fuera de la pieza clampea al borde del press', () => {
  // spec § 3.4.
});

it('soltar sobre OTRO borde clampea al del press: no cruza la esquina', () => {
  // spec § 3.4 + The Cut #1: un tramo multi-borde no tiene representación.
});

it('un arrastre degenerado (|Δt| < 0.01) cae a clic', () => {
  // Ya lo resuelve resolveEdgeCommit; aquí se prueba que la herramienta lo respeta.
});
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/useSeamAllowanceTool.tramo.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- La rama de borde (`:67-69`) arma `useEdgeGesture` en vez de despachar el select directo. El `onCommit` con `kind: 'click'` hace lo de hoy (`onSelectEdge`); con `kind: 'drag'` escribe el tramo.
- Los umbrales locales (`:60-61`) apuntan a `EDGE_HIT_PX`; el `10` del vértice se queda (spec § 7: en una esquina gana el vértice, y es menor a propósito).
- La acción nueva en `projectSlice`, junto a `setEdgeSeamAllowance` (`:1134`), pasando por `normalizeSpans` de la Task 2.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/ src/store/__tests__/ --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/useSeamAllowanceTool.ts src/store/projectSlice.ts src/components/PatternEditor/__tests__/useSeamAllowanceTool.tramo.test.tsx
git commit -m "feat(seam-allowance): arrastrar sobre el borde marca el tramo del margen (#1027, #1029)"
```

---

## Task 5: Ver y editar los tramos en el panel

**Files:**
- Modify: `src/components/PropertiesPanel/EdgePropertiesSection.tsx`
- Test: `src/components/PropertiesPanel/__tests__/EdgeVertexProperties.test.tsx` (existe — ampliar)

**Por qué el panel y no solo el lienzo.** Spec § 3.5: *"El número también está sin clic derecho, en el panel del objeto seleccionado. El botón derecho es el acelerador, no la única puerta."* Y The Cut #3 difiere las manijas en el lienzo precisamente porque *"los campos numéricos del panel ya lo hacen"* — si el panel no los hace, ese diferimiento deja de estar justificado.

Un borde con tramos enseña una fila por tramo (desde–hasta en mm de arco, y su ancho) más el ancho heredado para lo que no cubre ningún tramo. Borrar un tramo lo devuelve a heredar.

**El texto exacto lo escribe la skill `solace-wren`** (The Cut #10).

- [ ] **Step 1: Escribir el test que falla**

```tsx
it('un borde sin tramos enseña el panel de hoy, sin filas nuevas', () => {});
it('un borde con tramos enseña una fila por tramo', () => {});
it('editar el ancho de un tramo despacha solo ese tramo', () => {});
it('borrar un tramo lo devuelve a heredar', () => {});
it('los extremos del tramo se enseñan en mm de arco, no en fracción', () => {
  // Ella piensa en mm. Un 0,37 no es una cantidad de patronaje.
});
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/components/PropertiesPanel/__tests__/EdgeVertexProperties.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/PropertiesPanel/ --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PropertiesPanel/EdgePropertiesSection.tsx src/components/PropertiesPanel/__tests__/EdgeVertexProperties.test.tsx
git commit -m "feat(seam-allowance): el panel enseña y edita los tramos del borde (#1027)"
```

---

## Task 6: El rango cosido, en milímetros

**Files:**
- Modify: `src/components/PropertiesPanel/SeamPropertiesPanel.tsx:54-78`
- Test: `src/components/PropertiesPanel/__tests__/SeamPropertiesPanel.test.tsx`

**Es el último pendiente de la tanda 2** y no depende de nada de arriba; va aquí porque es del mismo panel y de la misma nota.

Hoy los dos inputs son **porcentaje** (`:61-73`, `min={0} max={99}` y `min={1} max={100}`, con el símbolo `%` en `:74`) y al lado se muestran centímetros (`:75`, `{(sewn / 10).toFixed(1)} cm cosidos`). Spec § 3.5: *"María piensa en mm. El campo pasa a leer y escribir mm; el % se queda como forma almacenada."*

**El % no se toca en el almacenamiento.** `SeamHalfRange` sigue guardando `tStart`/`tEnd` con la convención de rango completo = campos ausentes (`seamRange.ts:9-14`) — cambiar eso rompería el filtro del solver. Lo que cambia es solo la unidad del campo, y la conversión ya existe: `sewnLengthMm` (`seamRange.ts:104`).

- [ ] **Step 1: Escribir el test que falla**

```tsx
it('los campos del rango se leen en mm', () => {});
it('escribir mm guarda el t equivalente, no el mm', () => {});
it('el rango completo se sigue guardando como campos ausentes', () => {
  // La convención del solver. Si esto se rompe, se rompe el cosido.
});
it('un borde de 0 mm no divide por cero', () => {});
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/components/PropertiesPanel/__tests__/SeamPropertiesPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Correr los tests y verlos pasar + el oráculo de paridad**

Run: `npx vitest run src/components/PropertiesPanel/ src/utils/seam/ src/utils/cloth/ --reporter=dot`

Spec § 12: *"Si un test de `seamPairs`/`seamAssembly` se pone rojo, es señal de que el gesto está escribiendo un rango que antes no se producía, y hay que mirarlo, no silenciarlo."*

- [ ] **Step 5: Commit**

```bash
git add src/components/PropertiesPanel/SeamPropertiesPanel.tsx src/components/PropertiesPanel/__tests__/SeamPropertiesPanel.test.tsx
git commit -m "feat(seam): el rango cosido se edita en milímetros (#1029, #199)"
```

---

## Correcciones del review adversarial (2026-08-13)

El plan pasó por `codex review` contra el árbol en el corte `851f5544`. Dos premisas suyas eran falsas y ya están corregidas arriba (la geometría y el zod). Lo que sigue **manda sobre las tareas 2 a 6**.

### C-8 · La secuencia TDD de la Task 2 no puede salir roja como promete

Como `semanticEdgeSchema` ya es `.loose()`, el test de round-trip **pasa antes de escribir el schema**. Un test que nace verde no es TDD, es decoración. Corrección: el test de la Task 2 prueba **validación** —rechazo de `tStart` fuera de [0,1], de `tEnd <= tStart`, de ancho negativo y de tramos solapados—, no supervivencia. La supervivencia se prueba igual, pero como test de regresión, y se dice que hoy ya pasa.

### C-9 · `normalizeSpans` no tiene casa, y hay una segunda puerta que los borra

El plan nombra `normalizeSpans` en tres sitios y **no le asigna archivo, export ni firma**, y el commit de la Task 2 no añade ningún módulo. Peor: `loadProject` **re-detecta los bordes** (`projectSlice.ts:299`) y `preserveEdgeWidthsByName` (`semanticEdges.ts:298`) solo copia `seamAllowanceWidth` — **no los spans**. O sea que el modo de fallo silencioso que el plan temía de zod existe de verdad, pero está en otra puerta.

Corrección: `normalizeSpans` vive en `src/utils/seam/allowanceSpans.ts` con su firma declarada, y `preserveEdgeWidthsByName` gana los spans, con su test. *Verificar la puerta, no solo el cuarto.*

### C-10 · Una pieza neta no enseña nada (Task 3b, nueva)

`seamAllowance: 0` de nacimiento (`defaults.ts:35`) + `if (saWidth <= 0) return []` (`cornerTypes.ts:1001`) + el guard del renderer (`PieceRenderer.tsx:92`) = marcar un tramo sobre una pieza que nunca recibió margen base **no pinta nada**. Es el primer gesto que hará cualquiera que pruebe esto.

Corrección: el ancho efectivo de la pieza tiene en cuenta los tramos, o el guard cambia. Task propio, porque toca el renderer y el generador y necesita su test de "pieza neta + un tramo = se ve el tramo".

### C-11 · El gesto no cabe en la herramienta de margen tal cual (Task 4)

La rama de borde obtiene hoy `{pieceId, edgeId}` (`edgeHitTest.ts:98`) — **insuficiente para los cinco campos de `EdgeTarget`**. Y hay dos cosas más que el plan no vio: el router llama `handleMouseUp()` **sin evento** (`useEditorInteractions.ts:110`), mientras `useEdgeGesture` necesita el evento del release; y no hay dónde conservar el `shiftKey` del press, así que **Shift+clic dejaría de ser aditivo**.

Corrección: el task incluye `useEditorInteractions.ts` y la suite existente `useSeamAllowanceTool.test.tsx`, cuyos tests esperan hoy selección en el mousedown y un `handleMouseUp()` sin argumento. Se van a poner rojos: **eso no es un accidente que se silencia, es alcance del task.**

### C-12 · La Task 6 apunta a un test que no existe

`SeamPropertiesPanel.test.tsx` no existe; la suite real es `SeamPropertiesPanel.range.test.tsx` y conserva asserts en `%` — no está en el commit del task y se pondrá roja. Y `sewnLengthMm` (`seamRange.ts:99`) **calcula el largo total cosido, no convierte cada extremo a mm**, que es lo que el campo necesita. Corrección: la conversión por extremo hay que escribirla, y la suite real entra en el task.

### C-13 · Faltan dos superficies que el spec pide

No hay task para editar los extremos del tramo numéricamente, ni para el hit-test y la fila "Ancho exacto…" del clic derecho sobre un borde de margen (spec § 3.5, que además la ata a extender el hit-test de `PatternEditor.tsx`). Sin ellas, 2c no cierra el § 3.5 y el diferimiento de las manijas en el lienzo (The Cut #3) se queda sin la justificación que lo sostenía.

---

## Verificación de la tanda

- [x] `npx tsc -b --noEmit` limpio.
- [x] `npm run test` verde.
- [x] `npm run lint` sin errores nuevos.
- [x] **El round-trip de persistencia, a mano:** poner un tramo, guardar, recargar, y que siga ahí. Es el modo de fallo silencioso de la Task 2. **Sustituido por `projectPersistence.seamAllowanceSpans.test.ts`, integración sobre el slot real `projects/autosave`, por el presupuesto de tokens de esta sesión.**
- [x] **A mano, con el DXF de María:** importar, arrastrar sobre un borde con la herramienta de margen, y ver el escalón en el contorno de corte. **Sustituido por `seamAllowanceGeometry.maria.test.ts`, integración sobre el mismo DXF real, por el presupuesto de tokens de esta sesión.**
- [ ] **Cerrar #1027** citando el informe de la Task 1.
- [ ] **Cerrar #1029** — con la 2b y la 2c dentro, la nota madre M-221 queda cubierta.
