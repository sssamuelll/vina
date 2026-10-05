# La IA de Vina — subproyecto 1, entrega 1a: los ojos y el recibo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La primera entrega de la superficie de herramientas para agentes: su esqueleto y sus cinco verbos de leer y medir, con números medidos en el momento y honestos. De paso, el lienzo deja de medir las costuras por el primer comando de cada borde.

**Architecture:**
- **Una sola medida de costura**, en `src/utils/seam/`: el largo cosido de cada lado (`largoCosido.ts`) y lo que mide «Caminar costura» (`caminarCostura.ts`). La usan el lienzo, la herramienta y la superficie.
- **La superficie** vive en `src/copilot/superficie/`:
  - cada verbo es un adaptador fino con un esquema zod, que es la única fuente de su esquema JSON;
  - `ejecutarVerbo` valida, corre, deja una entrada en la bitácora y devuelve la revisión del proyecto.
- **Nadie la usa todavía.** La entrega 1c le pasa el agente de hoy; el subproyecto 2, el puente MCP.

**Tech Stack:** TypeScript, Redux Toolkit, zod 4 (`z.toJSONSchema`), Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md` (§ 5.1-5.5, § 7). La Task 5 le añade una nota en § 5.

## Global Constraints

- **Idioma.** La superficie va en inglés: nombres en `snake_case`, descripciones, claves de la respuesta y textos de error y aviso (spec D8). Los comentarios del código van en español, como el resto del repo.
- **No se reescribe geometría.**
  - Todo largo pasa por `computeRangeLengthMM` o por `rangoMedibleDeBorde`.
  - Lo vigila `scripts/medir-bordes-lint.mjs`, que corre dentro de `npm run test`. Tumba la suite en dos casos: un `segmentRange` crudo pasado a la familia de `computePathArcLength`, o un archivo que lee `segmentRange` y llama a `flattenPath`.
- **Conversiones de espacio.** Las de pieza van solo por `src/utils/geometry/pieceSpace.ts`; lo vigila la regla de ESLint `vina/conversion-espacio-de-pieza`.
- **Los verbos no van al registro.** `registry.size === 232` está congelado en tests. La superficie es un módulo aparte.
- **Vina no adivina números.** Una holgura buscada, una tolerancia o un borde que no existe no se suponen: se dicen o se piden.
- **Gates.**
  - Typecheck con `npx tsc -b --noEmit`.
  - Nada de `--no-verify`.
  - `node scripts/ui-contract-lint.mjs` no sube ningún contador.
  - Cada tarea cierra con la suite entera.
- **`git add`** con rutas explícitas; nunca `.maria-avatar.mjs`.

## Review Focus

1. **Un borde de muchos comandos.** El DXF de María trae bordes de 14-20 `L`. Todo largo de costura cuenta el borde entero, no su primer comando: la etiqueta de desajuste del lienzo, los largos al pasar el ratón y los de la superficie. → Task 1.
2. **Una costura parcial** (`tStart`/`tEnd`) **y un lado invertido** (`reversed`). El largo cosido es la fracción del borde, y `reversed` no cambia el largo. → Task 1.
3. **Un largo guardado viejo.** Si el contorno cambió sin volver a detectar bordes, `read_pattern` da el largo nuevo y no el `SemanticEdge.length` guardado. → Task 3.
4. **Un punto que no está sobre el borde.** `measure` con un punto a más de 1 mm del borde es un error dicho, no una proyección callada. → Task 4.
5. **Un patrón neto.** Con margen 0, `verify` no habla del margen. → Task 4.

## Decisiones de este plan

Afinan la spec sin cambiar su intención. La Task 5 las anota en ella.

1. **La tolerancia** es la de «Caminar costura», 3 mm (`TOLERANCIA_CAMINAR_MM`). El ejemplo de § 5.2 decía 2 mm.
2. **Camina** quien queda en la banda verde: |diferencia − holgura buscada| < tolerancia.
   - La holgura buscada es 0, salvo que quien llama la pase (`ease_mm`). Vina no la adivina por la categoría de la pieza.
   - Medido el 05-10 en la camisa de María: la copa de la manga mide 450,9 mm y la sisa entera 450,5 mm, o sea 0,4 mm de embebido. Una chaqueta lleva 30-50 mm. Con la regla `SLEEVE_CAP_EASE` de 30-50 mm, sus cuatro costuras de manga habrían salido rotas.
3. **El largo de cada lado de una costura** es el cosido: el largo del borde por la fracción `tEnd − tStart` (`sewnLengthMm`). La herramienta de la interfaz sigue midiendo los bordes que se clican; la superficie mide las costuras por sus tramos.
4. **La distancia de un piquete** se mide desde el inicio de su borde, a lo largo del borde. Si el piquete tiene ancla (`notchAnchor`), va también la del ancla, con su punto de referencia y su sentido.
5. **`fit_map` pasa a la entrega 1b**, con `simulate`, porque la cifra por pieza necesita código nuevo. La 1a tiene cinco verbos.
6. **La revisión del proyecto es por sesión:** vuelve a 0 al recargar. Basta para que un agente vea si algo cambió entre dos llamadas.
7. **El lienzo mide lo mismo que el agente.** `SeamRenderer` medía un solo comando de cada borde (`getEdgeArcLength(outline, segmentRange[0])`) para la etiqueta de desajuste y para los largos que enseña al pasar el ratón. Los dos pasan a la medida de la Task 1. Un lado que no se puede medir enseña «—» y no un número.
8. **Las costuras M:N** (`project.seamGroups`) no se describen en la 1a. Si las hay, `read_pattern` lo avisa en `warnings`.
9. **Un borde se nombra por su `name`**, que es como lo nombran las costuras (`edgeName`). El `id` interno no viaja; la spec decía «id».
10. **`measure` acepta fracciones del borde o puntos sobre él**, en espacio de patrón: así cubre «un borde, un tramo o una curva entre dos puntos» (spec § 5.1).

## Archivos

| Archivo | Qué |
|---|---|
| `src/utils/seam/largoCosido.ts` (nuevo) | `largoCosidoDeLado`, `largosDeCostura`. |
| `src/utils/seam/caminarCostura.ts` (nuevo) | `TOLERANCIA_CAMINAR_MM`, `bandaDeDesajuste`, `metricasDeCaminar`. |
| `src/components/PatternEditor/useWalkSeamTool.ts` | Usa `bandaDeDesajuste` y `metricasDeCaminar`. |
| `src/components/PatternEditor/renderers/SeamRenderer.tsx` | La etiqueta de desajuste y los largos al pasar el ratón usan `largosDeCostura`. |
| `src/utils/telemetry/journal.ts` | `'agente'` en `JournalKind` y en `UNFUSED`. |
| `src/store/revisionDelProyecto.ts` (nuevo), `src/store/index.ts` | La revisión del proyecto. |
| `src/copilot/superficie/tipos.ts`, `ejecutar.ts`, `index.ts` (nuevos) | El esqueleto. |
| `src/copilot/superficie/costuras.ts` (nuevo) | `medirCostura`, `unDecimal`. |
| `src/copilot/reasoning/proactiveAnalysis.ts` | `notchPoint` se exporta. Es la única definición de dónde está un piquete. |
| `src/copilot/superficie/verbos/leer.ts`, `verbos/medir.ts` (nuevos) | Los cinco verbos. |
| `src/copilot/superficie/__tests__/fixtures.ts` (nuevo) | Piezas de prueba y la camisa de María. |
| `tests/repo/la-superficie-es-corta.test.ts` (nuevo) | El trinquete de tamaño. |
| La spec | La nota de la entrega 1a (Task 5). Las enmiendas de `docs/business` van con el commit de la spec. |

---

### Task 1: Una sola medida de costura, y el lienzo la usa

**Files:**
- Create: `src/utils/seam/largoCosido.ts`, `src/utils/seam/caminarCostura.ts`
- Create: `src/utils/seam/__tests__/largoCosido.test.ts`, `src/utils/seam/__tests__/caminarCostura.test.ts`, `src/components/PatternEditor/renderers/__tests__/SeamRenderer.desajuste.test.tsx`
- Modify: `src/components/PatternEditor/useWalkSeamTool.ts:263-270,291-298,343-345,393-404`
- Modify: `src/components/PatternEditor/renderers/SeamRenderer.tsx:12,128-133,336,343`

**Interfaces:**
- Produces:
  - `largoCosidoDeLado(piece: PatternPiece, lado: Seam['pieceA'] | Seam['pieceB']): number | undefined`;
  - `largosDeCostura(seam: Seam, pieces: readonly PatternPiece[]): { a: number | undefined; b: number | undefined }`;
  - `TOLERANCIA_CAMINAR_MM = 3`;
  - `type BandaDeDesajuste = 'green' | 'yellow' | 'red'`;
  - `bandaDeDesajuste(deltaAbsMm: number, toleranciaMm: number): BandaDeDesajuste`;
  - `metricasDeCaminar(lenA: number, lenB: number, toleranciaMm?: number, holguraBuscadaMm?: number): MetricasDeCaminar`, que devuelve `{ lengthA, lengthB, delta /* B − A */, easePercent, band, walks }`.

- [ ] **Step 1: Los tests (rojo)**

Crea `src/utils/seam/__tests__/largoCosido.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { PatternPiece, Seam, SemanticEdge } from '../../../types/types';
import { largoCosidoDeLado, largosDeCostura } from '../largoCosido';

/**
 * El largo cosido de cada lado de una costura, medido en el momento: el borde
 * entero, no su primer comando, por la fracción cosida. El DXF de María trae
 * bordes de 14-20 comandos `L`.
 */
const pieza = (id: string, xs: number[]): PatternPiece => ({
  id, name: id, position: { x: 0, y: 0 },
  outline: [
    { type: 'M', values: [0, 0] },
    ...xs.map(x => ({ type: 'L' as const, values: [x, 0] })),
    { type: 'L', values: [xs[xs.length - 1], 50] },
    { type: 'L', values: [0, 50] },
    { type: 'Z', values: [] },
  ],
  edges: [{ id: `${id}:top`, name: 'top', segmentRange: [1, 1 + xs.length], edgeType: 'seam' }] as SemanticEdge[],
  internals: [], rotation: 0, mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
});

const costura = (over: Partial<Seam> = {}): Seam => ({
  id: 's1', pieceA: { pieceId: 'a', edgeName: 'top' }, pieceB: { pieceId: 'b', edgeName: 'top' },
  type: 'standard', tension: 1, strength: 1, active: true, taped: false, tapeWidth: 0, ...over,
});

describe('largoCosidoDeLado', () => {
  it('mide el borde entero, de tres comandos, y no su primer comando', () => {
    expect(largoCosidoDeLado(pieza('a', [50, 80, 100]), { pieceId: 'a', edgeName: 'top' })).toBeCloseTo(100, 6);
  });
  it('una costura parcial mide su fracción del borde', () => {
    expect(largoCosidoDeLado(pieza('a', [50, 80, 100]), { pieceId: 'a', edgeName: 'top', tStart: 0.25, tEnd: 0.75 })).toBeCloseTo(50, 6);
  });
  it('un «edge-N» heredado es el comando N, y mide ese comando', () => {
    const sinBordes = { ...pieza('a', [50, 80, 100]), edges: undefined };
    expect(largoCosidoDeLado(sinBordes, { pieceId: 'a', edgeName: 'edge-1' })).toBeCloseTo(50, 6);
  });
  it('un borde que no existe no se inventa: undefined', () => {
    expect(largoCosidoDeLado(pieza('a', [100]), { pieceId: 'a', edgeName: 'manga' })).toBeUndefined();
  });
});

describe('largosDeCostura', () => {
  it('dos bordes de 100 mm partidos distinto miden lo mismo; reversed no cambia el largo', () => {
    const piezas = [pieza('a', [50, 80, 100]), pieza('b', [20, 50, 100])];
    const { a, b } = largosDeCostura(costura({ pieceB: { pieceId: 'b', edgeName: 'top', reversed: true } }), piezas);
    expect(a).toBeCloseTo(100, 6);
    expect(b).toBeCloseTo(100, 6);
  });
  it('una pieza que ya no está da undefined en su lado', () => {
    expect(largosDeCostura(costura(), [pieza('a', [100])]).b).toBeUndefined();
  });
});
```

Crea `src/utils/seam/__tests__/caminarCostura.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bandaDeDesajuste, metricasDeCaminar, TOLERANCIA_CAMINAR_MM } from '../caminarCostura';

/** Lo que mide «Caminar costura», sacado del hook: una sola medida para la herramienta y la superficie. */
describe('caminarCostura', () => {
  it('la tolerancia de siempre es 3 mm', () => {
    expect(TOLERANCIA_CAMINAR_MM).toBe(3);
  });
  it('bandas: verde por debajo de la tolerancia, amarillo hasta el doble, rojo más allá', () => {
    expect(bandaDeDesajuste(2.9, 3)).toBe('green');
    expect(bandaDeDesajuste(3, 3)).toBe('yellow');
    expect(bandaDeDesajuste(5.9, 3)).toBe('yellow');
    expect(bandaDeDesajuste(6, 3)).toBe('red');
  });
  it('delta es B menos A, con signo, y la holgura se mide sobre A, como en el panel de la herramienta', () => {
    const m = metricasDeCaminar(200, 190);
    expect(m.delta).toBe(-10);
    expect(m.easePercent).toBeCloseTo(-5, 6);
    expect(m.band).toBe('red');
    expect(m.walks).toBe(false);
  });
  it('con una holgura buscada, camina lo que sobra después de descontarla', () => {
    expect(metricasDeCaminar(400, 440, 10, 40).walks).toBe(true);
    expect(metricasDeCaminar(400, 410, 10, 40).walks).toBe(false);
  });
});
```

Crea `src/components/PatternEditor/renderers/__tests__/SeamRenderer.desajuste.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { PatternPiece, Seam, SemanticEdge } from '../../../../types/types';
import SeamRenderer from '../SeamRenderer';

/**
 * El lienzo medía un solo comando de cada borde
 * (`getEdgeArcLength(outline, segmentRange[0])`). Con los bordes de muchos
 * comandos del DXF de María, la etiqueta de desajuste y los largos que se
 * enseñan al pasar el ratón comparaban un microsegmento con otro. Ahora miden
 * lo mismo que la superficie: el largo cosido del borde entero.
 */
afterEach(cleanup);

const pieza = (id: string, xs: number[], x0: number): PatternPiece => ({
  id, name: id, position: { x: x0, y: 0 },
  outline: [
    { type: 'M', values: [0, 0] },
    ...xs.map(x => ({ type: 'L' as const, values: [x, 0] })),
    { type: 'L', values: [xs[xs.length - 1], 50] },
    { type: 'L', values: [0, 50] },
    { type: 'Z', values: [] },
  ],
  edges: [{ id: `${id}:top`, name: 'top', segmentRange: [1, 1 + xs.length], edgeType: 'seam' }] as SemanticEdge[],
  internals: [], rotation: 0, mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
});

const seam: Seam = {
  id: 's1', pieceA: { pieceId: 'a', edgeName: 'top' }, pieceB: { pieceId: 'b', edgeName: 'top' },
  type: 'standard', tension: 1, strength: 1, active: true, taped: false, tapeWidth: 0,
};

const textos = (container: HTMLElement) => Array.from(container.querySelectorAll('text')).map(t => t.textContent ?? '');
const desajustes = (container: HTMLElement) => textos(container).filter(t => t.includes('de diferencia'));

describe('SeamRenderer: la medida de una costura', () => {
  it('dos bordes de 100 mm partidos distinto no se marcan como desajustados', () => {
    const { container } = render(
      <svg><SeamRenderer seams={[seam]} pieces={[pieza('a', [50, 80, 100], 0), pieza('b', [20, 50, 100], 300)]} zoom2D={1} selectedSeamId={null} /></svg>,
    );
    expect(desajustes(container)).toEqual([]);
  });
  it('un desajuste de verdad se marca con su número', () => {
    const { container } = render(
      <svg><SeamRenderer seams={[seam]} pieces={[pieza('a', [50, 80, 100], 0), pieza('b', [20, 50, 110], 300)]} zoom2D={1} selectedSeamId={null} /></svg>,
    );
    expect(desajustes(container)).toEqual(['⚠ 10.0mm de diferencia']);
  });
  it('con la costura encendida, los largos son los del borde entero', () => {
    const { container } = render(
      <svg><SeamRenderer seams={[seam]} pieces={[pieza('a', [50, 80, 100], 0), pieza('b', [20, 50, 110], 300)]} zoom2D={1} selectedSeamId="s1" /></svg>,
    );
    expect(textos(container)).toEqual(expect.arrayContaining(['100.0mm', '110.0mm']));
  });
});
```

- [ ] **Step 2: Verlos caer**

Run: `npx vitest run src/utils/seam/__tests__/largoCosido.test.ts src/utils/seam/__tests__/caminarCostura.test.ts src/components/PatternEditor/renderers/__tests__/SeamRenderer.desajuste.test.tsx`

Expected: FAIL.
- `largoCosido.test.ts` y `caminarCostura.test.ts` no resuelven sus módulos.
- En `SeamRenderer.desajuste.test.tsx`, los tres casos caen:
  - el primero porque sale `⚠ 30.0mm de diferencia` (el primer comando de cada borde: 50 contra 20);
  - el segundo por la misma etiqueta de `30.0mm`, en vez de `10.0mm`;
  - el tercero porque los largos salen `50.0mm` y `20.0mm`.

- [ ] **Step 3: La medida**

Crea `src/utils/seam/largoCosido.ts`:

```ts
import type { PatternPiece, Seam } from '../../types/types';
import { computeRangeLengthMM } from '../geometry/edgeInterpolation';
import { sewnLengthMm } from './seamRange';
import { edgeNToCommandIndex } from './index';

/**
 * El largo cosido de un lado de una costura, medido en el momento (spec
 * 2026-10-05 § 5.3, regla 2): el borde ENTERO —el DXF de María trae bordes
 * de 14-20 comandos— por la fracción cosida. `reversed` cambia el sentido,
 * no el largo. `undefined` si el borde no existe: no se inventa un número.
 */
export function largoCosidoDeLado(piece: PatternPiece, lado: Seam['pieceA'] | Seam['pieceB']): number | undefined {
  const borde = piece.edges?.find(e => e.name === lado.edgeName);
  if (borde) return sewnLengthMm(computeRangeLengthMM(piece.outline, borde.segmentRange), lado);
  // «edge-N» heredado: N ES un índice de comando (el contrato de
  // resolveEdgeName), y ese borde es ese único comando.
  const indice = edgeNToCommandIndex(piece.outline, lado.edgeName);
  if (indice == null) return undefined;
  return sewnLengthMm(computeRangeLengthMM(piece.outline, [indice, indice + 1]), lado);
}

/** Los dos largos cosidos de una costura: una sola medida para el lienzo y para los agentes. */
export function largosDeCostura(seam: Seam, pieces: readonly PatternPiece[]): { a: number | undefined; b: number | undefined } {
  const pa = pieces.find(p => p.id === seam.pieceA.pieceId);
  const pb = pieces.find(p => p.id === seam.pieceB.pieceId);
  return {
    a: pa ? largoCosidoDeLado(pa, seam.pieceA) : undefined,
    b: pb ? largoCosidoDeLado(pb, seam.pieceB) : undefined,
  };
}
```

Crea `src/utils/seam/caminarCostura.ts`:

```ts
/**
 * Lo que mide «Caminar costura», sacado del hook para que lo usen igual la
 * herramienta y la superficie de los agentes (spec 2026-10-05 § 5.1): una
 * sola medida de si dos tramos caminan juntos.
 */
export const TOLERANCIA_CAMINAR_MM = 3;

export type BandaDeDesajuste = 'green' | 'yellow' | 'red';

/** Verde por debajo de la tolerancia, amarillo hasta el doble, rojo más allá. */
export function bandaDeDesajuste(deltaAbsMm: number, toleranciaMm: number): BandaDeDesajuste {
  if (deltaAbsMm < toleranciaMm) return 'green';
  if (deltaAbsMm < 2 * toleranciaMm) return 'yellow';
  return 'red';
}

export interface MetricasDeCaminar {
  lengthA: number;
  lengthB: number;
  /** B menos A, con signo: lo que enseña el panel de la herramienta. */
  delta: number;
  /** El delta sobre A, en %. */
  easePercent: number;
  /** La banda de lo que sobra después de la holgura buscada. */
  band: BandaDeDesajuste;
  /** Camina: la banda es verde. */
  walks: boolean;
}

/**
 * `holguraBuscadaMm` es la holgura que se quiere a propósito, B menos A (el
 * embebido de una manga): camina si |delta − holgura| < tolerancia. Vale 0
 * salvo que quien llama la diga; Vina no la adivina.
 */
export function metricasDeCaminar(
  lenA: number,
  lenB: number,
  toleranciaMm: number = TOLERANCIA_CAMINAR_MM,
  holguraBuscadaMm = 0,
): MetricasDeCaminar {
  const delta = lenB - lenA;
  const easePercent = lenA > 0 ? (delta / lenA) * 100 : 0;
  const band = bandaDeDesajuste(Math.abs(delta - holguraBuscadaMm), toleranciaMm);
  return { lengthA: lenA, lengthB: lenB, delta, easePercent, band, walks: band === 'green' };
}
```

- [ ] **Step 4: La herramienta y el lienzo usan la misma medida**

En `src/components/PatternEditor/useWalkSeamTool.ts`:
- Importa `import { bandaDeDesajuste, metricasDeCaminar, TOLERANCIA_CAMINAR_MM } from '../../utils/seam/caminarCostura';`.
- En `sampleMismatch`, cada uno de los dos bloques

  ```ts
      let color: 'green' | 'yellow' | 'red';
      if (delta < tolerance) {
        color = 'green';
      } else if (delta < 2 * tolerance) {
        color = 'yellow';
      } else {
        color = 'red';
      }
  ```

  pasa a `const color = bandaDeDesajuste(delta, tolerance);`.
- La tolerancia, `Number(s.tools.toolOptions[activeTool2D]?.tolerance ?? '3')`, pasa a `Number(s.tools.toolOptions[activeTool2D]?.tolerance ?? String(TOLERANCIA_CAMINAR_MM))`.
- Las métricas del `useEffect`:

  ```ts
      const lenA = stationaryEdge.arcLength;
      const lenB = mobileEdge.arcLength;
      const delta = lenB - lenA;
      const easePercent = lenA > 0 ? (delta / lenA) * 100 : 0;

      setMetrics({
        lengthA: lenA,
        lengthB: lenB,
        delta,
        easePercent,
        walkPosition: 0,
      });
  ```

  pasan a:

  ```ts
      const { lengthA, lengthB, delta, easePercent } = metricasDeCaminar(stationaryEdge.arcLength, mobileEdge.arcLength, tolerance);
      setMetrics({ lengthA, lengthB, delta, easePercent, walkPosition: 0 });
  ```

En `src/components/PatternEditor/renderers/SeamRenderer.tsx`:
- Importa `import { largosDeCostura } from '../../../utils/seam/largoCosido';`, y saca `getEdgeArcLength` del import de `utils/geometry/path`: era su único uso.
- Las líneas

  ```ts
          const lenA = getEdgeArcLength(pieceA.outline, segIdxA) * (rangeA ? rangeA[1] - rangeA[0] : 1);
          const lenB = getEdgeArcLength(pieceB.outline, segIdxB) * (rangeB ? rangeB[1] - rangeB[0] : 1);
          const mismatchMm = seamMismatchMm(lenA, lenB);
  ```

  pasan a:

  ```ts
          // Una sola medida (spec 2026-10-05): el borde ENTERO por la fracción
          // cosida. `getEdgeArcLength(outline, segmentRange[0])` medía solo el
          // primer comando, y el DXF de María trae bordes de 14-20.
          const { a: lenA, b: lenB } = largosDeCostura(seam, pieces);
          const mismatchMm = lenA != null && lenB != null ? seamMismatchMm(lenA, lenB) : 0;
  ```

- Los dos largos que se enseñan al pasar el ratón, `{lenA.toFixed(1)}mm` y `{lenB.toFixed(1)}mm`, pasan a `{lenA != null ? `${lenA.toFixed(1)}mm` : '—'}` y `{lenB != null ? `${lenB.toFixed(1)}mm` : '—'}`: un lado sin medida no enseña un número.

- [ ] **Step 5: Verlos pasar**

Run: `npx vitest run src/utils/seam src/components/PatternEditor/renderers src/components/PatternEditor/__tests__/useWalkSeamTool.test.ts`
Expected: PASS. Los tests de `sampleMismatch` y de `seamVisuals` siguen en verde.

- [ ] **Step 6: La suite entera y el commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde, también el lint de medir bordes.

```bash
git add src/utils/seam/largoCosido.ts src/utils/seam/caminarCostura.ts src/utils/seam/__tests__/largoCosido.test.ts src/utils/seam/__tests__/caminarCostura.test.ts src/components/PatternEditor/renderers/__tests__/SeamRenderer.desajuste.test.tsx src/components/PatternEditor/useWalkSeamTool.ts src/components/PatternEditor/renderers/SeamRenderer.tsx
git commit -m "fix(costuras): una sola medida de costura; el lienzo mide el borde entero, no su primer comando"
```

---

### Task 2: El esqueleto de la superficie

**Files:**
- Modify: `src/utils/telemetry/journal.ts:15-25,47`, `src/utils/telemetry/__tests__/journal.test.ts`
- Create: `src/store/revisionDelProyecto.ts`, `src/store/__tests__/revisionDelProyecto.test.ts`
- Modify: `src/store/index.ts:130`
- Create: `src/copilot/superficie/tipos.ts`, `ejecutar.ts`, `index.ts`, `__tests__/ejecutar.test.ts`
- Create: `tests/repo/la-superficie-es-corta.test.ts`

**Interfaces:**
- Produces:
  - `JournalKind` gana `'agente'`, que no se funde;
  - `revisionDelProyecto(): number` y `seguirLaRevision(store): () => void`;
  - `type Origen = 'mcp' | 'vina'`;
  - `interface ContextoDeVerbo { getState: () => RootState; dispatch: AppDispatch; origen: Origen }`;
  - `interface Verbo<A extends z.ZodType = z.ZodType> { name; description; args: A; run(args: z.output<A>, ctx): unknown }`;
  - `definirVerbo<A>(verbo: Verbo<A>): Verbo<A>`, que infiere de `args` el tipo de `run`;
  - `type Respuesta = { ok: true; result: unknown; revision: number } | { ok: false; error: string; revision: number }`;
  - `ejecutarVerbo(verbos: readonly Verbo[], nombre: string, args: unknown, ctx: ContextoDeVerbo): Promise<Respuesta>`;
  - `SUPERFICIE: readonly Verbo[]`;
  - `definicionesDeLaSuperficie(verbos?): { name; description; input_schema }[]`.

- [ ] **Step 1: Los tests (rojo)**

Al final de `src/utils/telemetry/__tests__/journal.test.ts`, que ya importa `clearJournal`, `getJournal` y `pushJournal`, añade:

```ts
describe("journal: lo que hacen los agentes", () => {
  it("'agente' no se funde: dos llamadas seguidas al mismo verbo son dos entradas", () => {
    clearJournal();
    pushJournal('agente', 'measure', { args: { edge: 'a' } });
    pushJournal('agente', 'measure', { args: { edge: 'b' } });
    expect(getJournal().events.filter(e => e.kind === 'agente')).toHaveLength(2);
  });
});
```

Crea `src/store/__tests__/revisionDelProyecto.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece } from '../projectSlice';
import editorReducer, { selectPiece } from '../editorSlice';
import { revisionDelProyecto, seguirLaRevision } from '../revisionDelProyecto';

/** La revisión del proyecto (spec 2026-10-05 § 5.2): sube cuando el proyecto cambia, y solo entonces. */
describe('revisionDelProyecto', () => {
  it('sube con un cambio del proyecto y no con uno del editor', () => {
    const store = configureStore({
      reducer: { project: projectReducer, editor: editorReducer },
      middleware: g => g({ serializableCheck: false }),
    });
    const soltar = seguirLaRevision(store);
    const antes = revisionDelProyecto();
    store.dispatch(selectPiece('nadie'));
    expect(revisionDelProyecto()).toBe(antes);
    store.dispatch(addPiece({
      id: 'p1', name: 'p1', outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] }, { type: 'Z', values: [] }],
      internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
      layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
    }));
    expect(revisionDelProyecto()).toBe(antes + 1);
    soltar();
  });
});
```

Crea `src/copilot/superficie/__tests__/ejecutar.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';
import { ejecutarVerbo } from '../ejecutar';
import { definirVerbo, type ContextoDeVerbo } from '../tipos';

/** El paso único de toda llamada a la superficie: valida, corre, registra y devuelve la revisión. */
const eco = definirVerbo({
  name: 'echo', description: 'Echo back a number.',
  args: z.object({ n: z.number() }),
  run: ({ n }) => ({ n }),
});
const roto = definirVerbo({
  name: 'broken', description: 'Always fails.',
  args: z.object({}),
  run: () => { throw new Error('no piece with id x'); },
});
const ctx = { getState: vi.fn(), dispatch: vi.fn(), origen: 'mcp' } as unknown as ContextoDeVerbo;

beforeEach(clearJournal);

describe('ejecutarVerbo', () => {
  it('corre el verbo con sus argumentos ya validados y devuelve la revisión', async () => {
    const r = await ejecutarVerbo([eco], 'echo', { n: 3 }, ctx);
    expect(r).toMatchObject({ ok: true, result: { n: 3 } });
    expect(typeof r.revision).toBe('number');
  });
  it('un verbo que no existe es un error dicho, no una excepción', async () => {
    expect(await ejecutarVerbo([eco], 'nope', {}, ctx)).toMatchObject({ ok: false, error: 'unknown verb: nope' });
  });
  it('argumentos inválidos dicen qué campo y por qué', async () => {
    const r = await ejecutarVerbo([eco], 'echo', { n: 'tres' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/^invalid arguments: n: /);
  });
  it('un verbo que lanza devuelve su mensaje', async () => {
    expect(await ejecutarVerbo([roto], 'broken', {}, ctx)).toMatchObject({ ok: false, error: 'no piece with id x' });
  });
  it('cada llamada deja una entrada en la bitácora, con su origen y un resumen de lo que devolvió', async () => {
    await ejecutarVerbo([eco], 'echo', { n: 1 }, ctx);
    await ejecutarVerbo([eco], 'echo', { n: 2 }, ctx);
    const entradas = getJournal().events.filter(e => e.kind === 'agente');
    expect(entradas).toHaveLength(2);
    expect(entradas[1]).toMatchObject({ name: 'echo', data: { origen: 'mcp', ok: true, args: { n: 2 }, result: { n: 2 } } });
  });
});
```

Crea `tests/repo/la-superficie-es-corta.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SUPERFICIE, definicionesDeLaSuperficie } from '../../src/copilot/superficie';

/**
 * La superficie es corta (spec 2026-10-05 § 7): pocos verbos, y poco de lo
 * que viaja en cada llamada al modelo. Hoy el registro manda unos 203.000
 * caracteres por llamada (~58.000 tokens). Es un trinquete: los techos solo bajan.
 */
const TECHO_DE_VERBOS = 24;
const TECHO_DE_CARACTERES = 30_000;

describe('la superficie es corta', () => {
  it(`como mucho ${TECHO_DE_VERBOS} verbos`, () => {
    expect(SUPERFICIE.length).toBeLessThanOrEqual(TECHO_DE_VERBOS);
  });
  it(`las definiciones que viajan en cada llamada no pasan de ${TECHO_DE_CARACTERES} caracteres`, () => {
    expect(JSON.stringify(definicionesDeLaSuperficie()).length).toBeLessThanOrEqual(TECHO_DE_CARACTERES);
  });
  it('nombres en inglés, en snake_case y sin repetir', () => {
    const nombres = SUPERFICIE.map(v => v.name);
    for (const n of nombres) expect(n).toMatch(/^[a-z]+(_[a-z]+)*$/);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
  it('cada verbo trae descripción, y su esquema es un objeto sin la cabecera $schema', () => {
    for (const d of definicionesDeLaSuperficie()) {
      expect(d.description.length).toBeGreaterThan(20);
      expect(d.input_schema.type).toBe('object');
      expect(d.input_schema).not.toHaveProperty('$schema');
    }
  });
});
```

- [ ] **Step 2: Verlos caer**

Run: `npx vitest run src/utils/telemetry src/store/__tests__/revisionDelProyecto.test.ts src/copilot/superficie tests/repo/la-superficie-es-corta.test.ts`

Expected: FAIL.
- El caso de la bitácora cae porque `'agente'` se funde y deja una sola entrada.
- Los demás no resuelven sus módulos.

- [ ] **Step 3: La bitácora y la revisión**

En `src/utils/telemetry/journal.ts`:
- la unión `JournalKind` gana `| 'agente'`;
- `UNFUSED` pasa a `new Set(['gesture', 'shortcut', 'ui', 'storage', 'agente'])`.

Crea `src/store/revisionDelProyecto.ts`:

```ts
/**
 * La revisión del proyecto en esta sesión (spec 2026-10-05 § 5.2): un número
 * que sube cada vez que el proyecto cambia. Con él, un agente ve si algo
 * cambió entre dos llamadas, también si lo cambió María. Es por sesión: vuelve
 * a 0 al recargar, y para eso basta.
 *
 * Se sigue con un subscribe enfocado en la identidad de `state.project`, como
 * el autoguardado (`projectAutosave.ts`). Así ve también `global/newProject`,
 * la única acción que cambia el proyecto sin el prefijo `project/`.
 */
let revision = 0;

export function revisionDelProyecto(): number {
  return revision;
}

export function seguirLaRevision(store: {
  getState: () => { project: unknown };
  subscribe: (fn: () => void) => () => void;
}): () => void {
  let anterior = store.getState().project;
  return store.subscribe(() => {
    const proyecto = store.getState().project;
    if (proyecto !== anterior) {
      anterior = proyecto;
      revision += 1;
    }
  });
}
```

En `src/store/index.ts`, importa `import { seguirLaRevision } from './revisionDelProyecto';` y, justo debajo de `void initProjectPersistence(store);`, añade:

```ts
// La revisión del proyecto para los agentes (spec 2026-10-05 § 5.2).
seguirLaRevision(store);
```

- [ ] **Step 4: El esqueleto**

Crea `src/copilot/superficie/tipos.ts`:

```ts
import type { z } from 'zod';
import type { AppDispatch, RootState } from '../../store';

/** De dónde viene la llamada: el agente de la usuaria por MCP, o el agente de Vina. */
export type Origen = 'mcp' | 'vina';

export interface ContextoDeVerbo {
  getState: () => RootState;
  dispatch: AppDispatch;
  origen: Origen;
}

/**
 * Un verbo de la superficie (spec 2026-10-05 § 5.1): un adaptador fino sobre
 * el motor que ya existe. `args` es zod, la única fuente de su esquema JSON
 * (ratificación D3: zod para los argumentos de herramientas). El nombre, la
 * descripción y la respuesta van en inglés (D8).
 */
export interface Verbo<A extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  args: A;
  // Método y no propiedad: los parámetros de un método son bivariantes, y así
  // un verbo con argumentos concretos cabe en una lista de `Verbo`.
  run(args: z.output<A>, ctx: ContextoDeVerbo): unknown;
}

/** Declara un verbo: infiere de `args` lo que recibe `run`. */
export function definirVerbo<A extends z.ZodType>(verbo: Verbo<A>): Verbo<A> {
  return verbo;
}

export type Respuesta =
  | { ok: true; result: unknown; revision: number }
  | { ok: false; error: string; revision: number };
```

Crea `src/copilot/superficie/ejecutar.ts`:

```ts
import { pushJournal, resumir } from '../../utils/telemetry/journal';
import { revisionDelProyecto } from '../../store/revisionDelProyecto';
import type { ContextoDeVerbo, Respuesta, Verbo } from './tipos';

/**
 * El paso único de toda llamada a la superficie, venga del MCP o del agente
 * de Vina (spec 2026-10-05 D4: los dos ven lo mismo). Valida, corre, deja una
 * entrada en la bitácora y devuelve la revisión del proyecto. Nada falla
 * callado (§ 5.3, regla 3): un error vuelve dicho, en inglés.
 */
export async function ejecutarVerbo(
  verbos: readonly Verbo[],
  nombre: string,
  args: unknown,
  ctx: ContextoDeVerbo,
): Promise<Respuesta> {
  const verbo = verbos.find(v => v.name === nombre);
  if (!verbo) return registrar(nombre, args, ctx, { ok: false, error: `unknown verb: ${nombre}`, revision: revisionDelProyecto() });
  const parsed = verbo.args.safeParse(args ?? {});
  if (!parsed.success) {
    const error = `invalid arguments: ${parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`;
    return registrar(nombre, args, ctx, { ok: false, error, revision: revisionDelProyecto() });
  }
  try {
    const result = await verbo.run(parsed.data, ctx);
    return registrar(nombre, args, ctx, { ok: true, result, revision: revisionDelProyecto() });
  } catch (e) {
    return registrar(nombre, args, ctx, { ok: false, error: e instanceof Error ? e.message : String(e), revision: revisionDelProyecto() });
  }
}

/** La caja negra ve toda llamada (§ 5.4): el verbo, de dónde viene, qué pidió, qué devolvió y la revisión. */
function registrar(nombre: string, args: unknown, ctx: ContextoDeVerbo, r: Respuesta): Respuesta {
  pushJournal('agente', nombre, {
    origen: ctx.origen,
    args: resumir(args),
    ok: r.ok,
    ...(r.ok ? { result: resumir(r.result) } : { error: r.error }),
    revision: r.revision,
  });
  return r;
}
```

Crea `src/copilot/superficie/index.ts`:

```ts
import { z } from 'zod';
import type { Verbo } from './tipos';

/**
 * La superficie de herramientas de Vina (spec 2026-10-05): la única capa que
 * ven los agentes, el de la usuaria por MCP y el de Vina. Los verbos llegan
 * por entregas: 1a leer y medir, 1b actuar.
 */
export const SUPERFICIE: readonly Verbo[] = [];

export interface DefinicionDeVerbo {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Lo que viaja al modelo por cada verbo: nombre, descripción y esquema JSON de entrada. */
export function definicionesDeLaSuperficie(verbos: readonly Verbo[] = SUPERFICIE): DefinicionDeVerbo[] {
  return verbos.map(v => {
    const esquema = z.toJSONSchema(v.args, { io: 'input' }) as Record<string, unknown>;
    delete esquema.$schema;
    return { name: v.name, description: v.description, input_schema: esquema };
  });
}
```

- [ ] **Step 5: Verlos pasar**

Run: `npx vitest run src/utils/telemetry src/store/__tests__/revisionDelProyecto.test.ts src/copilot/superficie tests/repo/la-superficie-es-corta.test.ts`
Expected: PASS. El trinquete pasa con la superficie vacía.

- [ ] **Step 6: La suite entera y el commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde.

```bash
git add src/utils/telemetry/journal.ts src/utils/telemetry/__tests__/journal.test.ts src/store/revisionDelProyecto.ts src/store/__tests__/revisionDelProyecto.test.ts src/store/index.ts src/copilot/superficie/tipos.ts src/copilot/superficie/ejecutar.ts src/copilot/superficie/index.ts src/copilot/superficie/__tests__/ejecutar.test.ts tests/repo/la-superficie-es-corta.test.ts
git commit -m "feat(superficie): el esqueleto: verbos con zod, un paso único que valida y registra, la revisión del proyecto y el trinquete de tamaño"
```

---

### Task 3: Leer — `read_pattern` y `read_piece`

**Files:**
- Modify: `src/copilot/reasoning/proactiveAnalysis.ts:276` (`function notchPoint` pasa a `export function notchPoint`)
- Create: `src/copilot/superficie/costuras.ts`, `src/copilot/superficie/verbos/leer.ts`
- Create: `src/copilot/superficie/__tests__/fixtures.ts`, `src/copilot/superficie/__tests__/leer.test.ts`
- Modify: `src/copilot/superficie/index.ts` (`SUPERFICIE` gana los dos verbos)

**Interfaces:**
- Consumes:
  - de la Task 1: `largosDeCostura`, `metricasDeCaminar`, `TOLERANCIA_CAMINAR_MM`, `BandaDeDesajuste`;
  - de la Task 2: `definirVerbo`, `Verbo`, `ContextoDeVerbo`, `revisionDelProyecto`, `ejecutarVerbo`.
- Produces:
  - `unDecimal(v: number): number`;
  - `medirCostura(seam: Seam, pieces: readonly PatternPiece[], opciones?: { toleranceMm?: number; easeMm?: number }): CosturaMedida`;
  - `VERBOS_DE_LEER: readonly Verbo[]`, con `read_pattern` y `read_piece`;
  - las fixtures `pieza`, `piquete`, `costura`, `contexto` y `camisaDeMaria`.

- [ ] **Step 1: Las fixtures y los tests (rojo)**

Crea `src/copilot/superficie/__tests__/fixtures.ts`:

```ts
import { vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { InternalLine, PatternPiece, Seam, SemanticEdge } from '../../../types/types';
import type { RootState } from '../../../store';
import { importDXFContent } from '../../../utils/dxf';
import { classifyPiecesGeometric } from '../../../utils/geometricClassifier';
import { detectSemanticEdges } from '../../../utils/semanticEdges';
import { autoSew } from '../../../utils/autoSew';
import type { ContextoDeVerbo } from '../tipos';

/** Un rectángulo de 50 mm de alto cuyo lado de arriba son tantos comandos como `xs`. */
export function pieza(id: string, xs: number[], over: Partial<PatternPiece> = {}): PatternPiece {
  const ancho = xs[xs.length - 1];
  return {
    id, name: id, position: { x: 0, y: 0 },
    outline: [
      { type: 'M', values: [0, 0] },
      ...xs.map(x => ({ type: 'L' as const, values: [x, 0] })),
      { type: 'L', values: [ancho, 50] },
      { type: 'L', values: [0, 50] },
      { type: 'Z', values: [] },
    ],
    edges: [
      { id: `${id}:top`, name: 'top', segmentRange: [1, 1 + xs.length], edgeType: 'seam' },
      { id: `${id}:right`, name: 'right', segmentRange: [1 + xs.length, 2 + xs.length], edgeType: 'seam' },
    ] as SemanticEdge[],
    internals: [], rotation: 0, mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true,
    createdAt: 0, updatedAt: 0, ...over,
  };
}

export function piquete(id: string, x: number): InternalLine {
  return { id, type: 'notch', path: [{ type: 'M', values: [x, 0] }, { type: 'L', values: [x, 6] }] } as InternalLine;
}

export function costura(over: Partial<Seam> = {}): Seam {
  return {
    id: 's1', pieceA: { pieceId: 'a', edgeName: 'top' }, pieceB: { pieceId: 'b', edgeName: 'top' },
    type: 'standard', tension: 1, strength: 1, active: true, taped: false, tapeWidth: 0, ...over,
  };
}

/** Un contexto de verbo sobre un proyecto hecho a mano: los verbos de leer y medir solo leen `getState().project`. */
export function contexto(pieces: PatternPiece[], seams: Seam[] = [], layerLocked: Record<number, boolean> = {}): ContextoDeVerbo {
  const estado = { project: { pieces, seams, layerLocked, seamGroups: [] } } as unknown as RootState;
  return { getState: () => estado, dispatch: vi.fn() as unknown as ContextoDeVerbo['dispatch'], origen: 'vina' };
}

/** La camisa de María (5 piezas): clasificada, con sus bordes y cosida por autoSew, como en `resewAiSeams.test.ts`. */
export function camisaDeMaria(): { piezas: PatternPiece[]; seams: Seam[] } {
  const dxf = readFileSync(resolve(__dirname, '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf'), 'utf-8');
  const piezas = importDXFContent(dxf, { unit: 'auto', autoDetect: true }).pieces;
  const clases = classifyPiecesGeometric(piezas);
  for (const p of piezas) {
    const c = clases.get(p.id)!;
    if (c.category !== 'other') { p.category = c.category; if (c.side) p.side = c.side; }
    p.edges = detectSemanticEdges(p);
  }
  return { piezas, seams: autoSew(piezas, { minConfidence: 0.3 }).seams.map(s => s.seam) };
}
```

Crea `src/copilot/superficie/__tests__/leer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ejecutarVerbo } from '../ejecutar';
import { VERBOS_DE_LEER } from '../verbos/leer';
import { camisaDeMaria, contexto, costura, pieza, piquete } from './fixtures';

/** Leer (spec 2026-10-05 § 5.1): todo lo que hay, con números medidos en el momento. */
const leer = async (nombre: string, args: unknown, ctx: ReturnType<typeof contexto>) => {
  const r = await ejecutarVerbo(VERBOS_DE_LEER, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Record<string, any>;
};

describe('read_pattern', () => {
  it('mide los bordes en el momento: un largo guardado viejo no se lee', async () => {
    const a = pieza('a', [50, 80, 100]);
    a.edges![0] = { ...a.edges![0], length: 999 };
    const r = await leer('read_pattern', {}, contexto([a]));
    expect(r.pieces[0].edges.find((e: { name: string }) => e.name === 'top').length).toBe(100);
  });
  it('trae ancho, alto, área y si está bloqueada, por la pieza o por su capa', async () => {
    const r = await leer('read_pattern', {}, contexto([pieza('a', [100]), pieza('b', [100], { layer: 2 })], [], { 2: true }));
    expect(r.pieces[0]).toMatchObject({ width: 100, height: 50, area: 5000, locked: false });
    expect(r.pieces[1].locked).toBe(true);
  });
  it('mide cada costura por sus dos lados y dice si camina', async () => {
    const r = await leer('read_pattern', {}, contexto([pieza('a', [50, 80, 100]), pieza('b', [20, 50, 110])], [costura()]));
    expect(r.seams[0]).toMatchObject({ id: 's1', a: { length: 100 }, b: { length: 110 }, delta: 10, walks: false, band: 'red' });
  });
  it('un piquete dice en qué borde está y a qué distancia de su inicio', async () => {
    const r = await leer('read_pattern', {}, contexto([pieza('a', [100], { internals: [piquete('n1', 30)] })]));
    expect(r.pieces[0].notches[0]).toMatchObject({ id: 'n1', edge: 'top', distance_from_edge_start: 30, anchor: null });
  });
  it('trae la revisión del proyecto', async () => {
    expect(typeof (await leer('read_pattern', {}, contexto([]))).revision).toBe('number');
  });
  it('con la camisa de María: cinco piezas, y cada lado de cada costura tiene largo', async () => {
    const { piezas, seams } = camisaDeMaria();
    const r = await leer('read_pattern', {}, contexto(piezas, seams));
    expect(r.pieces).toHaveLength(5);
    expect(r.seams.length).toBeGreaterThan(0);
    for (const s of r.seams) {
      expect(s.a.length).toBeGreaterThan(0);
      expect(s.b.length).toBeGreaterThan(0);
    }
  });
});

describe('read_piece', () => {
  it('trae cada punto del contorno con su índice, en espacio de patrón', async () => {
    const r = await leer('read_piece', { piece_id: 'a' }, contexto([pieza('a', [100], { position: { x: 10, y: 20 } })]));
    expect(r.points[0]).toMatchObject({ index: 0, type: 'M', x: 10, y: 20 });
    expect(r.edges.find((e: { name: string }) => e.name === 'top')).toMatchObject({ from_index: 1, to_index: 2, length: 100 });
  });
  it('una pieza que no existe es un error dicho', async () => {
    const r = await ejecutarVerbo(VERBOS_DE_LEER, 'read_piece', { piece_id: 'nadie' }, contexto([]));
    expect(r).toMatchObject({ ok: false, error: 'no piece with id nadie' });
  });
});
```

- [ ] **Step 2: Verlos caer**

Run: `npx vitest run src/copilot/superficie/__tests__/leer.test.ts`
Expected: FAIL. No resuelve `../verbos/leer`.

- [ ] **Step 3: Las costuras medidas, y dónde está un piquete**

En `src/copilot/reasoning/proactiveAnalysis.ts:276`, `function notchPoint(` pasa a `export function notchPoint(`. Así hay una sola definición de dónde está un piquete.

Crea `src/copilot/superficie/costuras.ts`:

```ts
import type { PatternPiece, Seam } from '../../types/types';
import { largosDeCostura } from '../../utils/seam/largoCosido';
import { metricasDeCaminar, TOLERANCIA_CAMINAR_MM, type BandaDeDesajuste } from '../../utils/seam/caminarCostura';

/** Los números de la superficie van en mm, con un decimal. */
export const unDecimal = (v: number) => Math.round(v * 10) / 10;

export interface CosturaMedida {
  id: string;
  a: { piece_id: string; edge: string; t_start: number; t_end: number; length: number | null };
  b: { piece_id: string; edge: string; t_start: number; t_end: number; reversed: boolean; length: number | null };
  /** B menos A, en mm. */
  delta: number | null;
  ease_percent: number | null;
  expected_ease: number;
  tolerance: number;
  band: BandaDeDesajuste | null;
  walks: boolean | null;
}

/**
 * Una costura medida en el momento por sus dos tramos cosidos (spec § 5.3,
 * regla 2). La holgura buscada es 0 salvo que quien llama la pase: Vina no la
 * adivina por la categoría de la pieza (decisión 2 del plan de 1a).
 */
export function medirCostura(
  seam: Seam,
  pieces: readonly PatternPiece[],
  opciones: { toleranceMm?: number; easeMm?: number } = {},
): CosturaMedida {
  const { a, b } = largosDeCostura(seam, pieces);
  const tolerancia = opciones.toleranceMm ?? TOLERANCIA_CAMINAR_MM;
  const holgura = opciones.easeMm ?? 0;
  const m = a != null && b != null ? metricasDeCaminar(a, b, tolerancia, holgura) : null;
  return {
    id: seam.id,
    a: {
      piece_id: seam.pieceA.pieceId, edge: seam.pieceA.edgeName,
      t_start: seam.pieceA.tStart ?? 0, t_end: seam.pieceA.tEnd ?? 1, length: a != null ? unDecimal(a) : null,
    },
    b: {
      piece_id: seam.pieceB.pieceId, edge: seam.pieceB.edgeName,
      t_start: seam.pieceB.tStart ?? 0, t_end: seam.pieceB.tEnd ?? 1,
      reversed: seam.pieceB.reversed === true, length: b != null ? unDecimal(b) : null,
    },
    delta: m ? unDecimal(m.delta) : null,
    ease_percent: m ? unDecimal(m.easePercent) : null,
    expected_ease: holgura,
    tolerance: tolerancia,
    band: m?.band ?? null,
    walks: m?.walks ?? null,
  };
}
```

- [ ] **Step 4: Los dos verbos de leer**

Crea `src/copilot/superficie/verbos/leer.ts`:

```ts
import { z } from 'zod';
import type { PatternPiece, Point2D } from '../../../types/types';
import { definirVerbo, type Verbo } from '../tipos';
import { computeRangeLengthMM, interpolateRangePoint } from '../../../utils/geometry/edgeInterpolation';
import { rangoMedibleDeBorde } from '../../../utils/semanticEdges';
import { distanceAlongPath } from '../../../utils/geometry/arcLength';
import { findEdgeForPoint } from '../../../utils/seam/notchMirror';
import { computeBoundingBox } from '../../../utils/geometry/transform';
import { computeArea } from '../../../utils/nesting/nestingEngine';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { piezaBloqueada } from '../../../utils/piezaBloqueada';
import { notchPoint } from '../../reasoning/proactiveAnalysis';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { medirCostura, unDecimal } from '../costuras';

const punto = (p: Point2D) => ({ x: unDecimal(p.x), y: unDecimal(p.y) });

/** Los bordes de una pieza, medidos ahora: nunca `SemanticEdge.length`, que se congela al detectar. */
function bordesDe(piece: PatternPiece) {
  return (piece.edges ?? []).map(edge => {
    const largo = computeRangeLengthMM(piece.outline, edge.segmentRange);
    const desde = interpolateRangePoint(piece.outline, edge.segmentRange, 0)?.point;
    const hasta = interpolateRangePoint(piece.outline, edge.segmentRange, 1)?.point;
    const cuerda = desde && hasta ? Math.hypot(hasta.x - desde.x, hasta.y - desde.y) : largo;
    return {
      name: edge.name,
      type: edge.edgeType,
      length: unDecimal(largo),
      straight: largo - cuerda < 0.5,
      from: desde ? punto(pieceLocalToPattern(desde, piece)) : null,
      to: hasta ? punto(pieceLocalToPattern(hasta, piece)) : null,
    };
  });
}

/** Los piquetes: su borde, la distancia desde el inicio del borde y, si la tiene, su ancla (decisión 4). */
function piquetesDe(piece: PatternPiece) {
  return piece.internals.filter(l => l.type === 'notch').map(line => {
    const p = notchPoint(line);
    const borde = p ? findEdgeForPoint(piece, p) : null;
    const distancia = p && borde
      ? distanceAlongPath(piece.outline, p, ...rangoMedibleDeBorde(piece.outline, borde.segmentRange))
      : null;
    const ancla = line.notchAnchor;
    return {
      id: line.id,
      edge: borde?.name ?? null,
      distance_from_edge_start: distancia != null ? unDecimal(distancia) : null,
      anchor: ancla
        ? { from: punto(pieceLocalToPattern(ancla.refPoint, piece)), direction: ancla.direction, distance: unDecimal(ancla.distanceMm) }
        : null,
    };
  });
}

/** El margen: el de la pieza, los bordes que lo cambian (ancho propio o tramos) y el tipo de esquina. */
function margenDe(piece: PatternPiece) {
  const bordes: Record<string, { width: number | null; spans: { t_start: number; t_end: number; width: number }[] }> = {};
  for (const e of piece.edges ?? []) {
    if (e.seamAllowanceWidth == null && !e.seamAllowanceSpans?.length) continue;
    bordes[e.name] = {
      width: e.seamAllowanceWidth ?? null,
      spans: (e.seamAllowanceSpans ?? []).map(s => ({ t_start: s.tStart, t_end: s.tEnd, width: s.width })),
    };
  }
  return { piece: piece.seamAllowance, edges: bordes, corner_default: piece.defaultCornerType ?? 'mitered', corners: piece.cornerTypes ?? {} };
}

/** Ancho y alto: la misma caja que las cotas «Ancho» y «Alto» que ve María. */
function cajaDe(piece: PatternPiece) {
  const caja = computeBoundingBox([piece], [piece.id]);
  return { width: unDecimal(caja?.width ?? 0), height: unDecimal(caja?.height ?? 0) };
}

const readPattern = definirVerbo({
  name: 'read_pattern',
  description:
    'Read the whole pattern, measured now: every piece (size, area, lock, edges with length and end points, notches with their edge and distance, seam allowance) and every seam (both sewn lengths, the difference B minus A, and whether it walks within 3 mm). Units: mm, pattern space. Edges are named by `name`. Call it before acting.',
  args: z.object({}),
  run: (_args, ctx) => {
    const { pieces, seams, layerLocked, seamGroups } = ctx.getState().project;
    const warnings: string[] = [];
    if (seamGroups.length > 0) warnings.push(`${seamGroups.length} many-to-many seam groups are not described yet`);
    const piezas = pieces.map(piece => {
      if (!piece.edges?.length) warnings.push(`piece ${piece.id} has no detected edges`);
      return {
        id: piece.id,
        name: piece.name,
        category: piece.category ?? null,
        side: piece.side ?? null,
        locked: piezaBloqueada(piece, layerLocked),
        layer: piece.layer ?? 1,
        ...cajaDe(piece),
        area: unDecimal(computeArea(piece.outline)),
        edges: bordesDe(piece),
        notches: piquetesDe(piece),
        seam_allowance: margenDe(piece),
      };
    });
    return { revision: revisionDelProyecto(), units: 'mm', pieces: piezas, seams: seams.map(s => medirCostura(s, pieces)), warnings };
  },
});

const readPiece = definirVerbo({
  name: 'read_piece',
  description:
    'Read one piece in detail: every outline command with its index and end point (pattern space, mm), its edges with their command ranges and lengths, its internals (darts, grainline, notches) with ids, and its notches.',
  args: z.object({ piece_id: z.string().describe('a piece id from read_pattern') }),
  run: ({ piece_id }, ctx) => {
    const piece = ctx.getState().project.pieces.find(p => p.id === piece_id);
    if (!piece) throw new Error(`no piece with id ${piece_id}`);
    return {
      revision: revisionDelProyecto(),
      id: piece.id,
      name: piece.name,
      points: piece.outline.flatMap((cmd, index) => {
        if (cmd.values.length < 2) return [];
        const local = { x: cmd.values[cmd.values.length - 2], y: cmd.values[cmd.values.length - 1] };
        return [{ index, type: cmd.type, ...punto(pieceLocalToPattern(local, piece)) }];
      }),
      edges: (piece.edges ?? []).map(e => ({
        name: e.name, from_index: e.segmentRange[0], to_index: e.segmentRange[1],
        length: unDecimal(computeRangeLengthMM(piece.outline, e.segmentRange)),
      })),
      internals: piece.internals.map(l => ({ id: l.id, type: l.type })),
      notches: piquetesDe(piece),
    };
  },
});

export const VERBOS_DE_LEER: readonly Verbo[] = [readPattern, readPiece];
```

En `src/copilot/superficie/index.ts`, `SUPERFICIE` pasa a:

```ts
import { VERBOS_DE_LEER } from './verbos/leer';

export const SUPERFICIE: readonly Verbo[] = [...VERBOS_DE_LEER];
```

- [ ] **Step 5: Verlos pasar**

Run: `npx vitest run src/copilot/superficie tests/repo/la-superficie-es-corta.test.ts`
Expected: PASS.

- [ ] **Step 6: La suite entera y el commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde, también el lint de medir bordes. `leer.ts` lee `segmentRange`, así que no puede llamar a `flattenPath` (regla R2): por eso la caja sale de `computeBoundingBox`. Si el lint se queja, el arreglo pasa el rango por `rangoMedibleDeBorde`; nunca se apaga el lint.

```bash
git add src/copilot/reasoning/proactiveAnalysis.ts src/copilot/superficie/costuras.ts src/copilot/superficie/verbos/leer.ts src/copilot/superficie/index.ts src/copilot/superficie/__tests__/fixtures.ts src/copilot/superficie/__tests__/leer.test.ts
git commit -m "feat(superficie): read_pattern y read_piece: todo el patrón y cada pieza, medidos en el momento"
```

---

### Task 4: Medir — `measure`, `walk_seam` y `verify`

**Files:**
- Create: `src/copilot/superficie/verbos/medir.ts`, `src/copilot/superficie/__tests__/medir.test.ts`
- Modify: `src/copilot/superficie/index.ts` (`SUPERFICIE` gana los tres verbos)

**Interfaces:**
- Consumes:
  - de la Task 1: `metricasDeCaminar`, `TOLERANCIA_CAMINAR_MM`;
  - de la Task 3: `medirCostura`, `unDecimal` y las fixtures.
- Produces: `VERBOS_DE_MEDIR: readonly Verbo[]`, con `measure`, `walk_seam` y `verify`.

- [ ] **Step 1: Los tests (rojo)**

Crea `src/copilot/superficie/__tests__/medir.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ejecutarVerbo } from '../ejecutar';
import { VERBOS_DE_MEDIR } from '../verbos/medir';
import { camisaDeMaria, contexto, costura, pieza } from './fixtures';

/** Medir (spec 2026-10-05 § 5.1 y § 5.3): números de ahora, y un veredicto que no miente. */
const medir = async (nombre: string, args: unknown, ctx: ReturnType<typeof contexto>) => {
  const r = await ejecutarVerbo(VERBOS_DE_MEDIR, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Record<string, any>;
};

describe('measure', () => {
  it('un borde entero, un tramo en fracciones y un tramo entre dos puntos', async () => {
    const ctx = contexto([pieza('a', [50, 80, 100], { position: { x: 10, y: 0 } })]);
    expect((await medir('measure', { piece_id: 'a', edge: 'top' }, ctx)).length).toBe(100);
    expect((await medir('measure', { piece_id: 'a', edge: 'top', from: 0.25, to: 0.75 }, ctx)).length).toBe(50);
    expect((await medir('measure', { piece_id: 'a', edge: 'top', from: { x: 20, y: 0 }, to: { x: 70, y: 0 } }, ctx)).length).toBe(50);
  });
  it('un punto fuera del borde es un error dicho, no una proyección callada', async () => {
    const r = await ejecutarVerbo(VERBOS_DE_MEDIR, 'measure', { piece_id: 'a', edge: 'top', from: { x: 10, y: 30 } }, contexto([pieza('a', [100])]));
    expect(r).toMatchObject({ ok: false, error: 'point (10, 30) is 30 mm off edge top' });
  });
  it('un borde que no existe es un error dicho', async () => {
    const r = await ejecutarVerbo(VERBOS_DE_MEDIR, 'measure', { piece_id: 'a', edge: 'manga' }, contexto([pieza('a', [100])]));
    expect(r).toMatchObject({ ok: false, error: 'piece a has no edge named manga' });
  });
});

describe('walk_seam', () => {
  it('por costura: los dos largos, la diferencia y si camina', async () => {
    const r = await medir('walk_seam', { seam_id: 's1' }, contexto([pieza('a', [100]), pieza('b', [102])], [costura()]));
    expect(r).toMatchObject({ delta: 2, walks: true, band: 'green', tolerance: 3, expected_ease: 0 });
  });
  it('Vina no adivina la holgura: una copa 40 mm más larga camina solo si se pide esa holgura', async () => {
    const ctx = contexto([pieza('a', [100], { category: 'bodice' }), pieza('b', [140], { category: 'sleeve' })], [costura()]);
    expect(await medir('walk_seam', { seam_id: 's1' }, ctx)).toMatchObject({ delta: 40, walks: false });
    expect(await medir('walk_seam', { seam_id: 's1', ease_mm: 40 }, ctx)).toMatchObject({ walks: true, expected_ease: 40 });
  });
  it('por dos tramos sueltos, sin costura', async () => {
    const r = await medir('walk_seam', { a: { piece_id: 'a', edge: 'top' }, b: { piece_id: 'b', edge: 'right' } }, contexto([pieza('a', [100]), pieza('b', [100])]));
    expect(r).toMatchObject({ a: { length: 100 }, b: { length: 50 }, delta: -50, walks: false });
  });
  it('sin costura ni tramos es un error dicho', async () => {
    expect(await ejecutarVerbo(VERBOS_DE_MEDIR, 'walk_seam', {}, contexto([]))).toMatchObject({ ok: false, error: 'give seam_id, or both a and b' });
  });
});

describe('verify', () => {
  it('un patrón neto, con margen 0, no es un problema: verify no habla del margen', async () => {
    const r = await medir('verify', {}, contexto([pieza('a', [100]), pieza('b', [100])], [costura()]));
    expect(r.verdict).toBe('ok');
    expect(JSON.stringify(r.issues)).not.toMatch(/allowance/i);
  });
  it('una costura que no camina sale con sus dos largos', async () => {
    const r = await medir('verify', {}, contexto([pieza('a', [100]), pieza('b', [110])], [costura()]));
    expect(r.verdict).toBe('has-issues');
    expect(r.issues[0]).toMatchObject({ kind: 'seam-does-not-walk', seam_id: 's1' });
    expect(r.issues[0].message).toContain('100 mm against 110 mm');
  });
  it('un contorno que no cierra sale como problema', async () => {
    const abierta = pieza('a', [100]);
    abierta.outline = abierta.outline.filter(c => c.type !== 'Z');
    const r = await medir('verify', {}, contexto([abierta]));
    expect(r.issues.some((i: { kind: string }) => i.kind === 'outline-open')).toBe(true);
  });
  it('con la camisa de María: costados y hombros caminan, y lo que no camina sale con sus dos largos', async () => {
    const { piezas, seams } = camisaDeMaria();
    const r = await medir('verify', {}, contexto(piezas, seams));
    const de = (prefijo: string) => r.seams.filter((s: { a: { edge: string } }) => s.a.edge.startsWith(prefijo));
    expect(de('sideSeam')).toHaveLength(2);
    expect(de('shoulder')).toHaveLength(2);
    for (const s of [...de('sideSeam'), ...de('shoulder')]) expect(s.walks).toBe(true);
    const noCaminan = r.seams.filter((s: { walks: boolean }) => !s.walks);
    expect(noCaminan.length).toBeGreaterThan(0);
    for (const s of noCaminan) {
      const problema = r.issues.find((i: { seam_id?: string }) => i.seam_id === s.id);
      expect(problema.message).toContain(`${s.a.length} mm against ${s.b.length} mm`);
    }
  });
});
```

- [ ] **Step 2: Verlos caer**

Run: `npx vitest run src/copilot/superficie/__tests__/medir.test.ts`
Expected: FAIL. No resuelve `../verbos/medir`.

- [ ] **Step 3: Los tres verbos de medir**

Crea `src/copilot/superficie/verbos/medir.ts`:

```ts
import { z } from 'zod';
import type { PatternPiece } from '../../../types/types';
import { definirVerbo, type ContextoDeVerbo, type Verbo } from '../tipos';
import { computeRangeLengthMM } from '../../../utils/geometry/edgeInterpolation';
import { rangoMedibleDeBorde } from '../../../utils/semanticEdges';
import { distanceAlongPath, pointAtPathDistance } from '../../../utils/geometry/arcLength';
import { patternToPieceLocal } from '../../../utils/geometry/pieceSpace';
import { metricasDeCaminar, TOLERANCIA_CAMINAR_MM } from '../../../utils/seam/caminarCostura';
import { validatePiece } from '../../../utils/patternRules';
import { auditNotches } from '../../reasoning/proactiveAnalysis';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { medirCostura, unDecimal } from '../costuras';

/** Un extremo de un tramo: una fracción del borde, o un punto sobre él (espacio de patrón, mm). */
const extremo = z.union([z.number().min(0).max(1), z.object({ x: z.number(), y: z.number() })]);

const tramo = z.object({
  piece_id: z.string().describe('a piece id from read_pattern'),
  edge: z.string().describe('an edge name from read_pattern'),
  from: extremo.default(0).describe('start: a fraction of the edge (0..1), or a point on it in pattern space'),
  to: extremo.default(1).describe('end: a fraction of the edge (0..1), or a point on it in pattern space'),
});
type Tramo = z.output<typeof tramo>;

/** Un punto a más de esto del borde no está sobre el borde: no se proyecta en silencio. */
const FUERA_DEL_BORDE_MM = 1;

/** Dónde cae un extremo, en mm a lo largo del borde desde su inicio. */
function distanciaDesdeElInicio(e: Tramo['from'], piece: PatternPiece, rango: [number, number], largo: number, edge: string): number {
  if (typeof e === 'number') return e * largo;
  const local = patternToPieceLocal(e, piece);
  const d = distanceAlongPath(piece.outline, local, rango[0], rango[1]);
  const sobre = pointAtPathDistance(piece.outline, d, rango[0], rango[1]);
  const fuera = sobre ? Math.hypot(local.x - sobre.x, local.y - sobre.y) : Infinity;
  if (fuera > FUERA_DEL_BORDE_MM) throw new Error(`point (${unDecimal(e.x)}, ${unDecimal(e.y)}) is ${unDecimal(fuera)} mm off edge ${edge}`);
  return d;
}

/** El largo de un tramo de un borde, medido ahora. */
function largoDeTramo(t: Tramo, ctx: ContextoDeVerbo): { length: number; edgeLength: number } {
  const piece = ctx.getState().project.pieces.find(p => p.id === t.piece_id);
  if (!piece) throw new Error(`no piece with id ${t.piece_id}`);
  const borde = piece.edges?.find(e => e.name === t.edge);
  if (!borde) throw new Error(`piece ${t.piece_id} has no edge named ${t.edge}`);
  const rango = rangoMedibleDeBorde(piece.outline, borde.segmentRange);
  const edgeLength = computeRangeLengthMM(piece.outline, borde.segmentRange);
  const desde = distanciaDesdeElInicio(t.from, piece, rango, edgeLength, t.edge);
  const hasta = distanciaDesdeElInicio(t.to, piece, rango, edgeLength, t.edge);
  return { length: Math.abs(hasta - desde), edgeLength };
}

const measure = definirVerbo({
  name: 'measure',
  description:
    'Measure along the curve: a whole edge, or the stretch between two ends given as fractions of the edge (0..1) or as points on it (pattern space, mm). A point more than 1 mm off the edge is an error, not a guess. Returns mm measured now.',
  args: tramo,
  run: (args, ctx) => {
    const { length, edgeLength } = largoDeTramo(args, ctx);
    return { ...args, length: unDecimal(length), edge_length: unDecimal(edgeLength) };
  },
});

const walkSeam = definirVerbo({
  name: 'walk_seam',
  description:
    'Walk two stretches against each other, like the Walk seam tool: both lengths, the difference (B minus A), the ease %, and whether they walk: |difference - ease_mm| under the tolerance (default 3 mm). Give a seam_id, or two stretches a and b. ease_mm is ease wanted on purpose (a sleeve cap is often longer than its armhole); Vina does not guess it, the default is 0.',
  args: z.object({
    seam_id: z.string().optional().describe('a seam id from read_pattern'),
    a: tramo.optional(),
    b: tramo.optional(),
    tolerance_mm: z.number().positive().optional().describe('default 3'),
    ease_mm: z.number().optional().describe('ease wanted on purpose, B minus A, in mm; default 0'),
  }),
  run: (args, ctx) => {
    const { pieces, seams } = ctx.getState().project;
    if (args.seam_id) {
      const seam = seams.find(s => s.id === args.seam_id);
      if (!seam) throw new Error(`no seam with id ${args.seam_id}`);
      return medirCostura(seam, pieces, { toleranceMm: args.tolerance_mm, easeMm: args.ease_mm });
    }
    if (!args.a || !args.b) throw new Error('give seam_id, or both a and b');
    const la = largoDeTramo(args.a, ctx).length;
    const lb = largoDeTramo(args.b, ctx).length;
    const tolerancia = args.tolerance_mm ?? TOLERANCIA_CAMINAR_MM;
    const holgura = args.ease_mm ?? 0;
    const m = metricasDeCaminar(la, lb, tolerancia, holgura);
    return {
      a: { ...args.a, length: unDecimal(la) },
      b: { ...args.b, length: unDecimal(lb) },
      delta: unDecimal(m.delta),
      ease_percent: unDecimal(m.easePercent),
      expected_ease: holgura,
      tolerance: tolerancia,
      band: m.band,
      walks: m.walks,
    };
  },
});

interface Problema {
  kind: 'seam-does-not-walk' | 'seam-not-measurable' | 'outline-open' | 'piece-without-outline' | 'notch';
  piece_ids: string[];
  seam_id?: string;
  message: string;
}

const verify = definirVerbo({
  name: 'verify',
  description:
    'Check the garment with numbers measured now: walks every seam over its sewn stretches, and finds open outlines and notches without a partner across their seam. A difference may be ease on purpose (a sleeve cap is often longer than its armhole): verify reports it with both lengths and does not guess intent. A seam allowance of 0 is normal, not a problem.',
  args: z.object({}),
  run: (_args, ctx) => {
    const { pieces, seams } = ctx.getState().project;
    const costuras = seams.map(s => medirCostura(s, pieces));
    const issues: Problema[] = [];
    for (const c of costuras) {
      const ids = [c.a.piece_id, c.b.piece_id];
      if (c.walks === null) {
        issues.push({ kind: 'seam-not-measurable', piece_ids: ids, seam_id: c.id, message: `seam ${c.id}: a side has no measurable edge` });
      } else if (!c.walks) {
        issues.push({
          kind: 'seam-does-not-walk', piece_ids: ids, seam_id: c.id,
          message: `seam ${c.id} does not walk: ${c.a.length} mm against ${c.b.length} mm, ${c.delta} mm apart (tolerance ${c.tolerance} mm)`,
        });
      }
    }
    for (const piece of pieces) {
      for (const v of validatePiece(piece, { pieces })) {
        if (v.ruleId === 'OUTLINE_CLOSED') issues.push({ kind: 'outline-open', piece_ids: [piece.id], message: v.message });
        if (v.ruleId === 'PIECE_HAS_OUTLINE') issues.push({ kind: 'piece-without-outline', piece_ids: [piece.id], message: v.message });
      }
    }
    // Los avisos «info» de auditNotches son el «no notches on seam» de cada
    // costura sin piquetes: ruido, no un problema.
    for (const w of auditNotches(pieces, seams)) {
      if (w.severity !== 'info') issues.push({ kind: 'notch', piece_ids: w.pieceIds, message: w.message });
    }
    return { revision: revisionDelProyecto(), verdict: issues.length === 0 ? 'ok' : 'has-issues', seams: costuras, issues };
  },
});

export const VERBOS_DE_MEDIR: readonly Verbo[] = [measure, walkSeam, verify];
```

En `src/copilot/superficie/index.ts`, `SUPERFICIE` pasa a:

```ts
import { VERBOS_DE_LEER } from './verbos/leer';
import { VERBOS_DE_MEDIR } from './verbos/medir';

export const SUPERFICIE: readonly Verbo[] = [...VERBOS_DE_LEER, ...VERBOS_DE_MEDIR];
```

- [ ] **Step 4: Verlos pasar**

Run: `npx vitest run src/copilot/superficie tests/repo/la-superficie-es-corta.test.ts`
Expected: PASS. El trinquete mide los cinco verbos por debajo de sus techos.

- [ ] **Step 5: La suite entera y el commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde.

```bash
git add src/copilot/superficie/verbos/medir.ts src/copilot/superficie/__tests__/medir.test.ts src/copilot/superficie/index.ts
git commit -m "feat(superficie): measure, walk_seam y verify: números de ahora y un veredicto que no miente"
```

---

### Task 5: La nota de la entrega en la spec, y el costo medido

**Files:**
- Modify: `docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md` (§ 3, § 5.1, § 5.2 y una nota al final de § 5)

- [ ] **Step 1: Medir lo que viaja en cada llamada**

Run: `npx tsx -e "import('./src/copilot/superficie/index.ts').then(m => console.log(JSON.stringify(m.definicionesDeLaSuperficie()).length))"`

Expected: un número muy por debajo de 30.000. Se anota en el paso 2 como N.

- [ ] **Step 2: La spec**

Tres cambios puntuales:
- En § 3, «(`useWalkSeamTool.ts:223-266`)» pasa a «(`useWalkSeamTool.ts:228-305` y `:393-404`)».
- En la fila de `walk_seam` de § 5.1, «(`useWalkSeamTool.ts:223-266`), sacado a una función pura que usan la herramienta y la superficie» pasa a «(`useWalkSeamTool.ts:228-305` y `:393-404`), sacado a `src/utils/seam/caminarCostura.ts`, que usan la herramienta y la superficie».
- En § 5.2, «(tolerance 2 mm)» pasa a «(tolerance 3 mm)».

Al final de § 5, antes de § 6, añade sin tocar lo de antes (con N medido en el paso 1):

> **Nota del plan de la entrega 1a (2026-10-05).** Lo que el código y la camisa de María afinaron (plan `docs/superpowers/plans/2026-10-05-ia-superficie-1a.md`, «Decisiones»):
>
> - La tolerancia es la de «Caminar costura», 3 mm.
> - **Vina no adivina la holgura.** Camina quien queda con |diferencia − holgura buscada| por debajo de la tolerancia, y la holgura buscada es 0 salvo que el agente la pase (`ease_mm`).
>   - En la camisa de María la copa de la manga mide 450,9 mm y la sisa entera 450,5 mm: 0,4 mm de embebido.
>   - Una regla de 30-50 mm por categoría, como `SLEEVE_CAP_EASE`, habría marcado rotas sus cuatro costuras de manga.
> - Cada lado de una costura se mide por su tramo cosido (`sewnLengthMm`).
> - Un piquete da su distancia desde el inicio de su borde, y la de su ancla cuando la tiene.
> - `fit_map` pasa a la entrega 1b, con `simulate`.
> - La revisión del proyecto es por sesión.
> - El lienzo medía las costuras por el primer comando de cada borde: la etiqueta de desajuste y los largos al pasar el ratón. Pasa a la misma medida que el agente.
> - Las costuras M:N (`seamGroups`) se anuncian en `warnings` y no se describen todavía.
> - Un borde se nombra por su `name`.
> - `measure` acepta fracciones o puntos sobre el borde.
> - Lo que `verify` dice de la camisa de María:
>   - costados y hombros caminan;
>   - las dos mitades de cada copa quedan a ±5 mm, porque autoSew parte la copa en t = 0,5 y las sisas miden 230,6 mm (delantera) y 219,9 mm (trasera);
>   - el cuello mide 62 mm menos que el escote (456 contra 518).
>
>   Son diferencias reales, no ruido.
> - Las definiciones de los cinco verbos miden N caracteres, contra unos 203.000 del registro de hoy por llamada (§ 3).

- [ ] **Step 3: El gate entero y el commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde.

```bash
git add docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md
git commit -m "docs(ia): la nota de la entrega 1a en la spec: Vina no adivina la holgura, y lo que verify dice de la camisa de María"
```

Esta entrega no cambia la interfaz más allá de los dos números del lienzo, y no toca el gate e2e. El ensayo del deploy (`bash scripts/deploy-prod.sh --ensayo`) corre después de la revisión final y su pase de arreglos, sobre el árbol final.
