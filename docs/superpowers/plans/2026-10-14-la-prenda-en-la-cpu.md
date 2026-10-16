# La prenda en la CPU — plan de implementación (entrega 4, parte 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El motor implícito simula en la CPU una prenda entera: varias piezas con su hilo, costuras que cierran a 0 sobre puntos del otro lado, flexión que cruza la costura, el margen de costura, el cuerpo rígido con su BVH, fricción con el cuerpo y contacto de la tela consigo misma; con las uniones de costura de #1250 (C1 y C2) arregladas antes.

**Architecture:** Módulos nuevos en `src/utils/cloth/implicito/` (`prenda`, `costuras`, `margen`, `cuerpo`, `contactos`, `contactoPropio`) que entran al mismo `SistemaTela` y al mismo `pasoImplicito`. La CPU en doble precisión sigue siendo la fuente de verdad: la parte 2 lleva cada pieza a la GPU con la misma física y compara la camiseta contra la referencia; la parte 3 la conecta a la app. Las correcciones C1 y C2 de #1250 tocan el emparejado de costuras que usan los tres tiers de hoy, y van en su propia rama y su propio PR.

**Tech Stack:** TypeScript 5.6, vitest 4, el mallador CDT de Vina (`meshPieceOutline`), `three-mesh-bvh` a través de `buildLinearBVH` (`src/utils/cloth/gpu/bvh.ts`).

**Spec:** `docs/superpowers/specs/2026-10-13-tela-nueva-design.md` (§4.3, §4.5 y la parte de §4.6.4 que es física) y, para C1 y C2, `docs/superpowers/specs/2026-10-12-uniones-de-costura-design.md` (§4.1, §4.2 y §7; rama `fix/uniones-de-costura`). Lee los dos antes de empezar.

## Qué entra y qué no

- **Entra:** #1250 C1 y C2 (sin su banco de huecos ni sus fotos, que siguen siendo de #1250); §4.1.2 por pieza; §4.3.1 (cuerpo con BVH y fricción); §4.3.2 (contacto propio, con la enmienda E3); §4.3.3 (costuras, flexión a través de la costura y margen, con las enmiendas E1 y E2); la forma del contacto que §4.2.1 dejó para esta entrega (E4); los campos `friccionTela` y `friccionCuerpo` de §4.1.1.
- **Parte 2 (otro plan, escrito sobre este código ya hecho):** todo lo anterior en la GPU con paridad, y la camiseta de María en el banco contra la referencia privada (§4.4.2).
- **Parte 3 (otro plan):** la biblioteca (§4.1.7), la colocación (§4.3.4), los datos en `prepararTela`, el interruptor `vina-motor-implicito`, la vista 3D y la caja negra (§4.5).
- **No entra:** arista-arista en el contacto propio (E3), la curva `endurece` (subproyecto 3), varias telas en una prenda (§4.1.1: «al principio la prenda usa una»).

## Enmiendas al spec (las aprueba Samuel con este plan)

- **E1 (§4.3.3). Cada vértice se cose a un punto del otro lado, no a un vértice.** Los dos lados de una costura se mallan por separado y casi nunca tienen la misma cantidad de vértices (sisa de María: 230,6 mm contra 227,8 de la copa). `matchVertices` empareja vértice con vértice en las dos direcciones, y donde un lado tiene más, varios vértices caen sobre el mismo compañero (su propio comentario lo llama «gathering»). Con un resorte que cierra a 0, eso lleva dos vértices de la misma orilla al mismo punto y aplasta la arista entre ellos. Con el punto virtual cada vértice va al lugar del otro lado que le toca por largo de arco en el patrón; si el muestreo coincide, el punto cae en un vértice y es el par de siempre. La referencia comercial cose así (puntos de costura virtuales, hallazgos privados §5). La Tarea 4 lo mide con las dos formas.
- **E2 (§4.3.3). La flexión cruza la costura con una bisagra por arista cosida.** Cada arista del lado A entre dos vértices cosidos seguidos entra a su triángulo como un borde más, con ala en el triángulo de B que le toca, y rigidez de placa en la dirección que cruza la costura: `kh = b⊥·ℓ²/(A_T + A_N)`, con `b⊥` el promedio de los dos lados. Es el valor exacto de una franja curvada a lo ancho (Tarea 5). Queda apagada hasta que la costura cierra: con las piezas a 3 cm, el ángulo de esa bisagra no significa nada.
- **E3 (§4.3.2). Contacto propio solo vértice-triángulo**, más vértice del cuerpo contra triángulo de tela. Arista-arista queda para cuando el banco lo pida: el preset Normal de la referencia la trae apagada (hallazgos privados §10).
- **E4 (§4.2.1, la decisión que el spec dejó para esta entrega). El contacto es un plano.** Cada vértice en contacto se apoya en el plano tangente al obstáculo en su punto más cercano, fijado al empezar el paso, o al anticiparlo en el punto adonde iba. La solución usa el plano de dos lados; la búsqueda en línea usa la misma energía de un solo lado, sin consultar el cuerpo. La fricción es la de Coulomb suavizada, linealizada con la normal y la velocidad del cuadro anterior. Es la causa medida del límite de #1257: la búsqueda en línea comparaba un contacto lineal con la distancia verdadera, y una sola diferencia recortaba el paso de toda la tela a 1/16. La Tarea 8 lo mide; si no pasa, se para ahí.

## Global Constraints

- Unidades: SI dentro del motor. La tela se escribe en g/m², mm, N/m y µN·m (§4.1.1); `telaSI` convierte una sola vez.
- Reposo: el patrón plano de cada pieza girado al marco de SU hilo, con `v` a lo largo de la urdimbre. Sin línea de grano, el hilo va vertical en el patrón (§4.1.2). La colocación en 3D nunca es el reposo.
- Paso: `h = 1/60` s; Newton desde el estado actual; gradiente conjugado con bloques 3×3 de la diagonal; 20-50 iteraciones por ronda; una ronda más si se anticipan contactos; búsqueda en línea de hasta 8 mitades (§4.2.1).
- Sin amarres, sin congelado por reloj y sin topes de velocidad (§4.2.1).
- Separación tela-cuerpo: `grosor/2 + 1 mm` (§4.3.1). Tela con tela: dos medios grosores más 1 mm.
- Costuras: el largo de reposo arranca en la separación de la colocación y se cierra a 0 como hoy, ×0,97 por subpaso de 15 (§4.3.3).
- Margen: franja de ancho real, el margen del patrón o 10 mm, medida en el patrón (§4.3.3).
- Quieta: `Σ m·|v| / Σ m·g·h < 0,1 %` durante 30 cuadros seguidos (§4.2.4).
- Una tela por prenda (§4.1.1).
- Ningún número inventado: cada constante nueva cita de dónde sale (una medida, una fórmula derivada en el comentario o el valor de hoy marcado con `ponytail:` para calibrar).
- La referencia del simulador comercial no entra al repo: ni su nombre, ni sus números, ni sus formas, en código, commits, PR o issues.
- Lo pesado corre con `node scripts/pesado.mjs` (la suite entera ya lo pide sola). Nunca `--sin-admision` ni `VINA_PESADO_OMITIR`.
- Gates antes de cada commit: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. El hook de pre-commit no se salta. Una prueba suelta (`npx vitest run <archivo>`) no pide candado.
- Commits en español: describen el cambio y su porqué técnico, sin líneas de atribución.

## Review Focus

1. Una costura cuyos dos lados tienen distinta cantidad de vértices: al cerrarla, ningún triángulo junto a la orilla queda con menos de la mitad del área de su patrón. Lo prueba la Tarea 4, con las dos formas de coser.
2. La esquina donde se juntan dos bordes cosidos (C1): su vértice está en las dos costuras y la prenda cierra sin rodeo. Lo prueban las Tareas 1 y 4.
3. Una pieza espejada o con su hilo girado junto a otras: el reposo no la rechaza por triángulos «al revés» y cada pieza estira según su propio hilo. Lo prueba la Tarea 3.
4. Tela que llega rápido al cuerpo (5 cm de caída sobre una esfera): no lo atraviesa, no rebota y queda quieta; y sobre un plano inclinado se sostiene o se desliza según la fricción. Lo prueba la Tarea 8.
5. Un vértice cosido junto a la tela de la otra pieza: el contacto propio no lo empuja contra su propia costura. Lo prueba la Tarea 9.

## Coordinación

- C1 y C2 (Tareas 1 y 2) van en la rama `fix/uniones-de-costura` (worktree `.claude/worktrees/uniones`), que ya trae el spec de #1250. Tocan código que usan los tres tiers de hoy: su PR pasa el gate e2e del deploy antes de mergear, y mergear espera la orden de Samuel.
- Las Tareas 3 a 9 van en `feat/tela-prenda-completa` (worktree `.claude/worktrees/tela-prenda`), apilada sobre `feat/tela-nueva-laboratorio` (#1257). Después de la Tarea 2, el controlador mergea `fix/uniones-de-costura` en esta rama; cuando #1257 entre a main, mergea main. Esta rama se sube con la parte 2: hasta entonces la paridad GPU-CPU con contactos (`tests/e2e/tela-implicita.spec.ts`, @gpu-local) no aplica, porque la GPU todavía mide el contacto por distancia.
- Archivos de fuera de `implicito/`: `seamAssembly.ts`, `seamPairs.ts`, `elasticAssembly.ts`, `cdtMesher.ts`, `worldRefine.ts`, `autoSew/index.ts`, `repartoDeCopa.ts` (C1, C2 y los lados de la Tarea 4) y `bench/` (Tarea 8). Ninguno está en otra rama abierta; `feat/camara-60fps` está en pausa y no los toca.
- Ningún subagente corre el gate e2e, sube ramas, mergea ni despliega: lo hace el controlador. Un subagente tampoco toca la carpeta privada de referencias.
- El candado de la máquina es `scripts/pesado.mjs`. El chat entre sesiones es para decidir, no para avisar «voy a correr».

## Antes de empezar

Para las Tareas 1 y 2:

```bash
cd /d/Desktop/projects/vina/.claude/worktrees/uniones
git fetch origin && git merge --no-edit origin/main
[ -e node_modules ] || powershell -NoProfile -Command "New-Item -ItemType Junction -Path 'node_modules' -Target 'D:\Desktop\projects\vina\node_modules'"
npx husky
npx tsc -b --noEmit && npm run test
```

Para las Tareas 3 a 9, el worktree `.claude/worktrees/tela-prenda` ya existe con su junction y sus hooks:

```bash
cd /d/Desktop/projects/vina/.claude/worktrees/tela-prenda
npx tsc -b --noEmit && npm run test
```

La suite debe pasar entera antes de la primera tarea de cada rama. Todas las rutas del plan son relativas a la raíz del worktree.

## Mapa de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `src/utils/mesh/cdtMesher.ts` | exporta la tolerancia de duplicados | 1 |
| `src/utils/cloth/seamAssembly.ts` | el rango del borde se extiende sobre las copias de sus puntas | 1 |
| `src/utils/cloth/seamPairs.ts`, `src/utils/cloth/elasticAssembly.ts` | llamadores de C1; `seamPairs` da también los lados en orden de cosido | 1, 4 |
| `src/utils/cloth/__tests__/camisaDeMaria.ts` | ayuda de las pruebas: la camisa de María clasificada y cosida | 1 |
| `src/utils/autoSew/worldRefine.ts` | las puntas de un sub-rango, por largo de arco | 2 |
| `src/utils/autoSew/repartoDeCopa.ts`, `src/utils/autoSew/index.ts` | medias costuras de cuello; motor 3 | 2 |
| `src/utils/cloth/implicito/prenda.ts` | varias piezas con su hilo en una malla; costuras y bordes de la prenda | 3, 4, 6 |
| `src/utils/cloth/implicito/malla.ts`, `reposo.ts` | la pieza de cada triángulo; el signo y la masa por pieza | 3, 6 |
| `src/utils/cloth/implicito/costuras.ts` | puntos de costura, su resorte y las bisagras que cruzan la costura | 4, 5 |
| `src/utils/cloth/implicito/placa.ts` | bisagras de costura y factor de flexión por triángulo | 5, 6 |
| `src/utils/cloth/implicito/margen.ts` | la franja del margen | 6 |
| `src/utils/cloth/implicito/cuerpo.ts` | el cuerpo rígido: el BVH recorrido en la CPU | 7 |
| `src/utils/cloth/implicito/obstaculos.ts` | el obstáculo `cuerpo` | 7 |
| `src/utils/cloth/implicito/banco/escenas.ts` | esfera, plano inclinado y pirámide como mallas de cuerpo | 7, 8, 9 |
| `src/utils/cloth/implicito/contactos.ts` | planos de contacto y fricción | 8 |
| `src/utils/cloth/implicito/sistema.ts`, `paso.ts` | costuras, margen, planos, fricción y contacto propio en el cuadro | 4-9 |
| `src/utils/cloth/implicito/tela.ts` | `friccionCuerpo` y `friccionTela` | 8 |
| `bench/_banco.ts` y sus llamadores | la tela de la referencia con la fricción del jersey | 8 |
| `src/utils/cloth/implicito/contactoPropio.ts` | rejilla de triángulos y pares del contacto propio | 9 |

Las pruebas nuevas del motor van en `src/utils/cloth/implicito/__tests__/`.

---
## Las uniones de costura (#1250 C1 y C2), en `fix/uniones-de-costura`

### Tarea 1: La esquina, en sus dos costuras (#1250 C1)

En el DXF cada borde termina en un punto y el siguiente empieza en una copia exacta. `removeDuplicatePoints` deja una sola copia con el origen de la primera, y `parameterizeEdgeFromBoundary` solo toma vértices con origen dentro de `[fs, fe]`: la esquina entra solo en el borde que termina en ella. El arreglo es el de #1250 §4.1: el rango se extiende sobre las copias exactas de sus puntas, con la tolerancia del mallador.

**Files:**
- Modify: `src/utils/mesh/cdtMesher.ts:197` (la tolerancia, exportada)
- Modify: `src/utils/cloth/seamAssembly.ts:387-450` (`parameterizeEdgeFromBoundary` recibe los puntos) y `:737-748` (su llamada)
- Modify: `src/utils/cloth/seamPairs.ts` (la llamada en `resolveSeamVertexPairs`)
- Modify: `src/utils/cloth/elasticAssembly.ts:62-66` (la llamada)
- Create: `src/utils/cloth/__tests__/camisaDeMaria.ts`
- Test: `src/utils/cloth/__tests__/esquinaEnDosCosturas.test.ts`

**Interfaces:**
- Consumes: `flattenPath(commands: PathCommand[], resolution?: number): Point2D[]` y `commandRangeToFlattened(commands, range, resolution?)` de `src/utils/seam/index.ts`; `seamInitDataToPairs(seamData: SeamInitData[], pieces: PieceWithOutline[]): SeamPair[]`.
- Produces:
  - `cdtMesher.ts`: `export const TOLERANCIA_DE_DUPLICADOS = 0.1` (mm).
  - `seamAssembly.ts`: `export function extenderSobreCopias(flat: ReadonlyArray<Point2D>, range: [number, number]): [number, number]` y la firma nueva `parameterizeEdgeFromBoundary(boundaryOrig: ArrayLike<number>, positions: Float32Array, vertexOffset: number, flat: ReadonlyArray<Point2D>, range: [number, number], reverse?: boolean): ParameterizedVertex[]`.
  - `__tests__/camisaDeMaria.ts`: `importarMariaClasificada(): PatternPiece[]`, `costurasDeMaria(piezas: PatternPiece[]): Seam[]`, `aInitData(costuras: Seam[]): SeamInitData[]`, `mallarParaCoser(piezas: PatternPiece[], aristaMm: number): PieceWithOutline[]`, `MEDIDAS_DE_MARIA: BodyMeasurements`.

- [ ] **Step 1: Escribe la ayuda de la camisa de María**

`src/utils/cloth/__tests__/camisaDeMaria.ts` (es el mismo recorrido de `src/utils/autoSew/__tests__/seamCoverage.maria.test.ts`, para no repetirlo en cada prueba):

```ts
/**
 * La camisa de María para las pruebas (tests/fixtures/garments/maria_patrones_samuel_2M.dxf): importada y
 * clasificada como al importar en la app, cosida con autoSew más refineSeamsInWorld, y mallada como la
 * malla el simulador. El mismo recorrido de seamCoverage.maria.test.ts.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { importDXFContent } from '../../dxf';
import { classifyPiecesGeometric } from '../../geometricClassifier';
import { detectSemanticEdges } from '../../semanticEdges';
import { autoSew } from '../../autoSew';
import { refineSeamsInWorld } from '../../autoSew/worldRefine';
import { resolveArrangementWithFrames } from '../arrangement/arrangementBinding';
import { meshPiece } from '../../mesh';
import type { SeamInitData } from '../seamAssembly';
import type { PieceWithOutline } from '../seamPairs';
import type { BodyMeasurements, PatternPiece, Seam } from '../../../types/types';

const DXF = resolve(__dirname, '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');

export const MEDIDAS_DE_MARIA = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;

export function importarMariaClasificada(): PatternPiece[] {
  const piezas = importDXFContent(readFileSync(DXF, 'utf-8'), { unit: 'auto', autoDetect: true }).pieces;
  const clases = classifyPiecesGeometric(piezas);
  for (const p of piezas) {
    const c = clases.get(p.id)!;
    if (c.category !== 'other') {
      p.category = c.category;
      if (c.side) p.side = c.side;
    }
    p.edges = detectSemanticEdges(p);
  }
  return piezas;
}

export function costurasDeMaria(piezas: PatternPiece[]): Seam[] {
  return refineSeamsInWorld(
    autoSew(piezas, { minConfidence: 0.3 }).seams.map((s) => s.seam),
    piezas,
    resolveArrangementWithFrames(piezas, MEDIDAS_DE_MARIA, undefined),
  );
}

/** Espejo de seamsToInitData (costurasDeLaSimulacion.ts). */
export function aInitData(costuras: Seam[]): SeamInitData[] {
  return costuras.filter((s) => s.active !== false).map((s) => ({
    id: s.id,
    pieceAId: s.pieceA.pieceId, pieceAEdgeName: s.pieceA.edgeName,
    pieceBId: s.pieceB.pieceId, pieceBEdgeName: s.pieceB.edgeName,
    type: s.type,
    pieceARange: s.pieceA.tStart != null && s.pieceA.tEnd != null ? ([s.pieceA.tStart, s.pieceA.tEnd] as [number, number]) : undefined,
    pieceBRange: s.pieceB.tStart != null && s.pieceB.tEnd != null ? ([s.pieceB.tStart, s.pieceB.tEnd] as [number, number]) : undefined,
    pieceBReversed: s.pieceB.reversed === true ? true : undefined,
    tension: s.tension ?? 100, strength: s.strength ?? 1.0, active: true, taped: s.taped ?? false,
  }));
}

/** Las piezas malladas con las opciones de SimulationInitClient.meshPiece, listas para seamInitDataToPairs. */
export function mallarParaCoser(piezas: PatternPiece[], aristaMm: number): Array<PieceWithOutline & { triIds: Int32Array; uvs?: Float32Array }> {
  return piezas.map((p) => {
    const m = meshPiece(p, { yHeight: 0, scale: 0.001, maxEdgeLength: aristaMm, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12 });
    return {
      pieceId: p.id, vertices: m.vertices, triIds: m.triIds, uvs: m.uvs,
      outline: p.outline, edges: p.edges, boundaryOrig: m.boundaryOrig, meshMaxEdgeLength: aristaMm,
    };
  });
}
```

- [ ] **Step 2: Escribe las pruebas que fallan**

`src/utils/cloth/__tests__/esquinaEnDosCosturas.test.ts`:

```ts
/**
 * La esquina, en sus dos costuras (#1250 C1): en el DXF cada borde termina en un punto y el siguiente empieza
 * en una copia exacta; el mallador deja una sola copia con el origen de la primera, y la esquina entraba solo
 * en la costura del borde que termina en ella.
 */
import { describe, expect, it } from 'vitest';
import { extenderSobreCopias, parameterizeEdgeFromBoundary } from '../seamAssembly';
import { seamInitDataToPairs } from '../seamPairs';
import { commandRangeToFlattened, flattenPath } from '../../seam/index';
import { aInitData, costurasDeMaria, importarMariaClasificada, mallarParaCoser } from './camisaDeMaria';

// Un cuadrado de 100 mm cuyo borde derecho empieza en una copia exacta del punto donde termina el de abajo:
// aplanado [(0, 0), (100, 0), (100, 0)*, (100, 100), (0, 100)].
const PLANO = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
// el mallador deja la esquina con el origen de la primera copia (1); 2,5 es un punto subdividido del borde
const ORIGEN = Float64Array.from([0, 1, 2.5, 3, 4]);
const POS = Float32Array.from([0, 0, 0, 0.1, 0, 0, 0.1, 0, 0.05, 0.1, 0, 0.1, 0, 0, 0.1]);

describe('la esquina, en sus dos costuras (#1250 C1)', () => {
  it('el rango se extiende sobre las copias exactas de sus puntas, y solo sobre ellas', () => {
    expect(extenderSobreCopias(PLANO, [2, 3])).toEqual([1, 3]);
    expect(extenderSobreCopias(PLANO, [0, 1])).toEqual([0, 2]);
    expect(extenderSobreCopias(PLANO, [3, 4])).toEqual([3, 4]);
    // un rango que ya da toda la vuelta no crece
    expect(extenderSobreCopias(PLANO, [0, 4])).toEqual([0, 4]);
  });

  it('el borde que empieza en la copia recibe el vértice de la esquina, con t = 0', () => {
    const borde = parameterizeEdgeFromBoundary(ORIGEN, POS, 0, PLANO, [2, 3]);
    expect(borde.map((v) => v.index)).toEqual([1, 2, 3]);
    expect(borde[0].t).toBe(0);
  });

  it('el borde que termina en la esquina la conserva', () => {
    const borde = parameterizeEdgeFromBoundary(ORIGEN, POS, 0, PLANO, [0, 1]);
    expect(borde.map((v) => v.index)).toEqual([0, 1]);
  });

  it('María: toda esquina entre dos bordes cosidos está en las dos costuras', { timeout: 120_000 }, () => {
    const piezas = importarMariaClasificada();
    const costuras = costurasDeMaria(piezas);
    const malladas = mallarParaCoser(piezas, 10);
    // los vértices cosidos de cada borde (pieza|borde), juntando las medias costuras del mismo borde
    const cosidos = new Map<string, Set<number>>();
    for (const c of costuras) {
      const [par] = seamInitDataToPairs(aInitData([c]), malladas);
      if (!par) continue;
      for (const [lado, k] of [['pieceA', 0], ['pieceB', 1]] as const) {
        const clave = `${c[lado].pieceId}|${c[lado].edgeName}`;
        const set = cosidos.get(clave) ?? new Set<number>();
        for (const v of par.vertexPairs) set.add(v[k]);
        cosidos.set(clave, set);
      }
    }
    let esquinas = 0;
    for (const p of piezas) {
      const m = malladas.find((x) => x.pieceId === p.id)!;
      const plano = flattenPath(p.outline, 12);
      const N = plano.length;
      const bordes = (p.edges ?? []).map((e) => ({ nombre: e.name, rango: commandRangeToFlattened(p.outline, e.segmentRange, 12) }));
      for (const a of bordes) {
        for (const b of bordes) {
          if (a === b || (a.rango[1] + 1) % N !== b.rango[0] % N) continue;
          const pa = plano[a.rango[1] % N], pb = plano[b.rango[0] % N];
          if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > 0.1) continue;
          const sa = cosidos.get(`${p.id}|${a.nombre}`), sb = cosidos.get(`${p.id}|${b.nombre}`);
          if (!sa || !sb) continue;
          const orig = m.boundaryOrig!;
          let v = -1;
          for (let k = 0; k < orig.length; k++) if (orig[k] === a.rango[1] % N) v = k;
          expect(v, `${p.name}: la esquina ${a.nombre}→${b.nombre} tiene vértice`).toBeGreaterThanOrEqual(0);
          expect(sa.has(v), `${p.name}: ${a.nombre} cose su esquina final`).toBe(true);
          expect(sb.has(v), `${p.name}: ${b.nombre} cose la esquina donde empieza`).toBe(true);
          esquinas++;
        }
      }
    }
    expect(esquinas).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 3: Corre las pruebas y mira que fallen**

Run: `npx vitest run src/utils/cloth/__tests__/esquinaEnDosCosturas.test.ts`
Expected: FAIL, `extenderSobreCopias` no existe; y, ya con él, la de María cae en «cose la esquina donde empieza».

- [ ] **Step 4: Exporta la tolerancia del mallador**

En `src/utils/mesh/cdtMesher.ts`, justo encima de `function removeDuplicatePoints`:

```ts
/**
 * Distancia (mm) bajo la cual dos puntos seguidos del contorno son el mismo: el mallador deja uno. La usa
 * también el emparejado de costuras (seamAssembly.ts, extenderSobreCopias) para reconocer las copias.
 */
export const TOLERANCIA_DE_DUPLICADOS = 0.1;
```

y cambia la firma a `function removeDuplicatePoints(points: Point2D[], tolerance: number = TOLERANCIA_DE_DUPLICADOS): Point2D[] {`.

- [ ] **Step 5: El rango sobre las copias, en `parameterizeEdgeFromBoundary`**

En `src/utils/cloth/seamAssembly.ts`, agrega el import `import { TOLERANCIA_DE_DUPLICADOS } from '../mesh/cdtMesher';` y, justo encima del JSDoc de `parameterizeEdgeFromBoundary`:

```ts
/**
 * El rango [fs, fe] de un borde en el contorno aplanado, extendido sobre las copias exactas de sus puntas
 * (#1250 C1). En el DXF cada borde termina en un punto y el siguiente empieza en una copia; el mallador deja
 * una sola, con el origen de la primera, y sin esto la esquina entra solo en el borde que termina en ella.
 * `fe < fs` da la vuelta por el cierre. Un rango nunca crece hasta cubrir el contorno entero.
 */
export function extenderSobreCopias(flat: ReadonlyArray<Point2D>, range: [number, number]): [number, number] {
  const N = flat.length;
  if (N < 2) return range;
  const punto = (k: number) => flat[((k % N) + N) % N];
  const cerca = (i: number, j: number) => {
    const p = punto(i), q = punto(j);
    return Math.hypot(p.x - q.x, p.y - q.y) <= TOLERANCIA_DE_DUPLICADOS;
  };
  let s = range[0];
  let e = range[1] < range[0] ? range[1] + N : range[1];
  while (s - 1 > e - N && cerca(s - 1, s)) s--;
  while (e + 1 < s + N && cerca(e + 1, e)) e++;
  return [((s % N) + N) % N, e % N];
}
```

Cambia la firma y el principio de `parameterizeEdgeFromBoundary` (el resto del cuerpo queda igual):

```ts
export function parameterizeEdgeFromBoundary(
  boundaryOrig: ArrayLike<number>,
  positions: Float32Array,
  vertexOffset: number,
  flat: ReadonlyArray<Point2D>,
  range: [number, number],
  reverse: boolean = false,
): ParameterizedVertex[] {
  const [fs, fe] = extenderSobreCopias(flat, range);
  const N = flat.length;
```

y en su JSDoc reemplaza la línea de `@param flatCount` por `@param flat - the piece's flattened outline: the same points the range indexes (#1250 C1)`.

- [ ] **Step 6: Los tres llamadores pasan los puntos**

- `src/utils/cloth/seamAssembly.ts` (en `buildSeamConstraints`): `flattenPath(outlineA, SEAM_CURVE_RESOLUTION).length` pasa a `flattenPath(outlineA, SEAM_CURVE_RESOLUTION)`, y lo mismo con `outlineB`.
- `src/utils/cloth/seamPairs.ts` (en `resolveSeamVertexPairs`): `flattenPath(toPathCommands(pieceA.outline)).length` pasa a `flattenPath(toPathCommands(pieceA.outline))`, y lo mismo con `pieceB`.
- `src/utils/cloth/elasticAssembly.ts`: `flattenPath(outline, SEAM_CURVE_RESOLUTION).length` pasa a `flattenPath(outline, SEAM_CURVE_RESOLUTION)`.

- [ ] **Step 7: Corre las pruebas y mira que pasen**

Run: `npx vitest run src/utils/cloth/__tests__/esquinaEnDosCosturas.test.ts`
Expected: PASS (4 pruebas).

- [ ] **Step 8: La suite entera y los conteos de pares**

Run: `npx tsc -b --noEmit && npm run test`

Las pruebas que fijan una cantidad exacta de pares de costura pueden fallar (#1250 §6, «Conteos de pares»). Para cada una: comprueba que la diferencia es exactamente un par por cada punta de costura que empezaba en una copia (imprime los pares antes y después de una de esas costuras) y actualiza el número, con un comentario que cite #1250 C1. Si una diferencia no se explica así, para y repórtala con la salida: no ajustes el número.

- [ ] **Step 9: Commit**

```bash
git add src/utils/mesh/cdtMesher.ts src/utils/cloth/seamAssembly.ts src/utils/cloth/seamPairs.ts src/utils/cloth/elasticAssembly.ts src/utils/cloth/__tests__/camisaDeMaria.ts src/utils/cloth/__tests__/esquinaEnDosCosturas.test.ts
# más las pruebas cuyos conteos actualizaste en el Step 8, por su ruta
git commit -m "fix(costuras): la esquina entra en las dos costuras que se juntan en ella (#1250 C1)"
```

### Tarea 2: La dirección de las medias costuras de cuello (#1250 C2)

`edgeWorld` ubica las puntas de un sub-rango t por índice de punto aplanado. La orilla de cuello de la tira es una recta de dos puntos, así que en `back.neckline[0,5; 1] ~ collarNeckEdge[0,578; 1]` las dos puntas caen en el mismo punto (recto 226 mm = cruzado 226 mm) y la media costura queda sin invertir. El arreglo es el de #1250 §4.2: las puntas por largo de arco, interpolando dentro del segmento, la misma t con la que `parameterizeEdgeFromBoundary` reparte los vértices.

**Files:**
- Modify: `src/utils/autoSew/worldRefine.ts:61-100` (`edgeWorld`, exportada)
- Modify: `src/utils/autoSew/repartoDeCopa.ts` (`esMediaDeCollar`)
- Modify: `src/utils/autoSew/index.ts:24-58` (motor 3 e `isStaleAiSeam`)
- Test: `src/utils/autoSew/__tests__/collarDireccion.maria.test.ts`

**Interfaces:**
- Consumes: `importarMariaClasificada`, `costurasDeMaria`, `MEDIDAS_DE_MARIA` (Tarea 1); `resolveArrangementWithFrames`; `mirrorPctRange(r: [number, number]): [number, number]` (`src/utils/seam/seamRange.ts`).
- Produces: `export function edgeWorld(piece: PatternPiece, pwf: PlacementWithFrame, edgeName: string, tRange?: [number, number]): EdgeWorld | null` y `export interface EdgeWorld { first; last; mid }` en `worldRefine.ts`; `export function esMediaDeCollar(s: Seam): boolean` en `repartoDeCopa.ts`; `SEAM_ENGINE_VERSION = 3`.

- [ ] **Step 1: Escribe las pruebas que fallan**

`src/utils/autoSew/__tests__/collarDireccion.maria.test.ts`:

```ts
/**
 * La dirección de las medias costuras de cuello (#1250 C2). Medidas por largo de arco, como mide el solver,
 * las cuatro salen con margen (spec de #1250: 305 contra 351 mm las delanteras, sin invertir; 307 contra 264
 * las traseras, invertidas). Por índice de punto, en back.neckline[0,5; 1] ~ collarNeckEdge[0,578; 1] las dos
 * puntas de la tira caían en el mismo punto (recto 226 = cruzado 226 mm) y quedaba sin invertir.
 */
import { describe, expect, it } from 'vitest';
import { edgeWorld } from '../worldRefine';
import { esMediaDeCollar, esMitadDeCopa } from '../repartoDeCopa';
import { isStaleAiSeam, SEAM_ENGINE_VERSION } from '../index';
import { resolveArrangementWithFrames } from '../../cloth/arrangement/arrangementBinding';
import { mirrorPctRange } from '../../seam/seamRange';
import { costurasDeMaria, importarMariaClasificada, MEDIDAS_DE_MARIA } from '../../cloth/__tests__/camisaDeMaria';
import type { Seam } from '../../../types/types';

type V3 = [number, number, number];
const dist = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

describe('la dirección de las medias costuras de cuello (#1250 C2)', () => {
  it('María: las cuatro medias de la tira se invierten según su geometría, con margen', { timeout: 60_000 }, () => {
    const piezas = importarMariaClasificada();
    const pwf = resolveArrangementWithFrames(piezas, MEDIDAS_DE_MARIA, undefined);
    const medias = costurasDeMaria(piezas).filter(esMediaDeCollar);
    expect(medias.length).toBe(4);
    for (const s of medias) {
      const ia = piezas.findIndex((p) => p.id === s.pieceA.pieceId), ib = piezas.findIndex((p) => p.id === s.pieceB.pieceId);
      // rangos FÍSICOS: el de B se guarda en dirección de cosido y se des-espeja si va al revés
      const rA: [number, number] = [s.pieceA.tStart ?? 0, s.pieceA.tEnd ?? 1];
      const rB0: [number, number] = [s.pieceB.tStart ?? 0, s.pieceB.tEnd ?? 1];
      const rB = s.pieceB.reversed === true ? mirrorPctRange(rB0) : rB0;
      const a = edgeWorld(piezas[ia], pwf[ia], s.pieceA.edgeName, rA)!;
      const b = edgeWorld(piezas[ib], pwf[ib], s.pieceB.edgeName, rB)!;
      const recto = dist(a.first, b.first) + dist(a.last, b.last);
      const cruzado = dist(a.first, b.last) + dist(a.last, b.first);
      expect(s.pieceB.reversed === true, `${s.pieceA.edgeName}↔${s.pieceB.edgeName}`).toBe(cruzado < recto);
      expect(Math.abs(recto - cruzado), `${s.pieceA.edgeName}↔${s.pieceB.edgeName}: margen`).toBeGreaterThan(0.03);
    }
  });

  it('isStaleAiSeam: el motor 2 dejó viejas las medias de cuello, no las de copa', () => {
    expect(SEAM_ENGINE_VERSION).toBe(3);
    const media = (a: string, b: string, motor: number): Seam => ({
      id: 'auto-seam-x', type: 'standard', sewEngine: motor,
      pieceA: { pieceId: 'p', edgeName: a, tStart: 0.578, tEnd: 1 },
      pieceB: { pieceId: 'q', edgeName: b },
    } as unknown as Seam);
    const cuello = media('collarNeckEdge', 'neckline', 2), copa = media('sleeveCap', 'armhole', 2);
    expect(esMediaDeCollar(cuello)).toBe(true);
    expect(esMitadDeCopa(copa)).toBe(true);
    expect(isStaleAiSeam(cuello)).toBe(true);
    expect(isStaleAiSeam(copa)).toBe(false);
    expect(isStaleAiSeam(media('collarNeckEdge', 'neckline', 3))).toBe(false);
  });
});
```

- [ ] **Step 2: Corre las pruebas y mira que fallen**

Run: `npx vitest run src/utils/autoSew/__tests__/collarDireccion.maria.test.ts`
Expected: FAIL: `edgeWorld` y `esMediaDeCollar` no se exportan; ya exportados, la de María cae en el margen de `back.neckline` (0 m) y la de `isStaleAiSeam` en `SEAM_ENGINE_VERSION` (2).

- [ ] **Step 3: Las puntas por largo de arco**

En `src/utils/autoSew/worldRefine.ts`:
- El import de tipos pasa a `import type { PatternPiece, Point2D, Seam } from '../../types/types';`.
- `interface EdgeWorld` pasa a `export interface EdgeWorld` y `function edgeWorld(` pasa a `export function edgeWorld(`.
- Encima de `edgeWorld`, agrega:

```ts
/** El punto del tramo aplanado [fs, fe] (fe < fs da la vuelta por el cierre) a la fracción t de su largo de arco. */
function puntoPorLargo(flat: Point2D[], fs: number, fe: number, t: number): Point2D | null {
  const N = flat.length;
  const fin = fe < fs ? fe + N : fe;
  const pts: Point2D[] = [];
  for (let k = fs; k <= fin; k++) pts.push(flat[k % N]);
  if (pts.length === 0 || pts.some((p) => !p)) return null;
  if (pts.length === 1) return pts[0];
  const largos = [0];
  for (let k = 1; k < pts.length; k++) largos.push(largos[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  const total = largos[largos.length - 1];
  if (!(total > 0)) return pts[0];
  const objetivo = Math.max(0, Math.min(1, t)) * total;
  let k = 1;
  while (k < pts.length - 1 && largos[k] < objetivo) k++;
  const tramo = largos[k] - largos[k - 1];
  const u = tramo > 0 ? (objetivo - largos[k - 1]) / tramo : 0;
  return { x: pts[k - 1].x + u * (pts[k].x - pts[k - 1].x), y: pts[k - 1].y + u * (pts[k].y - pts[k - 1].y) };
}
```

- En `edgeWorld`, reemplaza desde el comentario «Sub-rango t (medias costuras de sisa)» hasta `if (!pFirst || !pLast) return null;` inclusive por:

```ts
  // Las puntas de un sub-rango t (medias costuras de sisa y de cuello) van por largo de arco, interpolando
  // dentro del segmento: la misma t con la que parameterizeEdgeFromBoundary reparte los vértices (#1250 C2).
  // Por índice de punto, en la orilla recta de la tira (dos puntos) las dos puntas caían en el mismo lugar y
  // la dirección de la media costura quedaba a la suerte del empate.
  const pFirst = puntoPorLargo(flat, fs0, fe0, tRange ? tRange[0] : 0);
  const pLast = puntoPorLargo(flat, fs0, fe0, tRange ? tRange[1] : 1);
  if (!pFirst || !pLast) return null;
```

- [ ] **Step 4: Las medias costuras de cuello y el motor 3**

En `src/utils/autoSew/repartoDeCopa.ts`, debajo de `esMitadDeCopa`:

```ts
/** El lado de la tira en una costura tira↔escote, o null si no lo es. */
function ladoDeLaTira(s: Seam): Lado | null {
  const a = raiz(s.pieceA.edgeName), b = raiz(s.pieceB.edgeName);
  if (a === 'collarneckedge' && b === 'neckline') return 'pieceA';
  if (b === 'collarneckedge' && a === 'neckline') return 'pieceB';
  return null;
}

/** Una media costura de cuello: tira↔escote con la tira cosida solo en parte (#1250 C2). */
export function esMediaDeCollar(s: Seam): boolean {
  const lado = ladoDeLaTira(s);
  if (!lado) return false;
  const [desde, hasta] = rangoFisico(s, lado);
  return desde > EPS || hasta < 1 - EPS;
}
```

En `src/utils/autoSew/index.ts`:
- El import pasa a `import { esMediaDeCollar, esMitadDeCopa, repartirCopas } from './repartoDeCopa';`.
- En el JSDoc de `SEAM_ENGINE_VERSION`, después de «… no en t = 0,5 (2026-10-06).», agrega «3 = las puntas de un sub-rango se ubican por largo de arco, y la dirección de las medias costuras de cuello deja de salir al azar (#1250 C2, 2026-10-14).», y el valor pasa a `export const SEAM_ENGINE_VERSION = 3;`.
- En el JSDoc de `isStaleAiSeam`, después del párrafo del motor 2, agrega «El motor 3 cambió la dirección de las medias costuras de cuello: del motor 2 solo están viejas esas.», y el cuerpo pasa a:

```ts
export function isStaleAiSeam(s: Seam): boolean {
  if (!s.id.startsWith('auto-seam-')) return false;
  const motor = s.sewEngine ?? 0;
  return motor < 1 || (motor < 2 && esMitadDeCopa(s)) || (motor < 3 && esMediaDeCollar(s));
}
```

- [ ] **Step 5: Corre las pruebas y mira que pasen**

Run: `npx vitest run src/utils/autoSew/__tests__/collarDireccion.maria.test.ts`
Expected: PASS (2 pruebas).

- [ ] **Step 6: La suite entera**

Run: `npx tsc -b --noEmit && npm run test`

Las pruebas que fijen `sewEngine: 2` en costuras recién cosidas pasan a 3 (busca `sewEngine` y `SEAM_ENGINE_VERSION` en `__tests__`). Las sondas de María que miden la sisa (`sisaSplit.maria.test.ts`, `seamCoverage.maria.test.ts`, `collarSplit.maria.test.ts`) deben seguir pasando sin tocarlas: si una cae, para y repórtala con la salida, porque la corrección de las puntas toca también las medias de copa.

- [ ] **Step 7: Commit**

```bash
git add src/utils/autoSew/worldRefine.ts src/utils/autoSew/repartoDeCopa.ts src/utils/autoSew/index.ts src/utils/autoSew/__tests__/collarDireccion.maria.test.ts
# más las pruebas de sewEngine que actualizaste en el Step 6, por su ruta
git commit -m "fix(costuras): las puntas de una media costura se ubican por largo de arco y la tira cose al derecho (#1250 C2)"
```

**El controlador, al cerrar las Tareas 1 y 2:** corre los gates, el ensayo del deploy (`VINA_E2E_PORT=<libre> bash scripts/deploy-prod.sh --ensayo` en un worktree con HEAD desprendido en la rama, bajo el candado), sube `fix/uniones-de-costura` y abre su PR contra main con la tabla de pares de costura antes y después (la de #1250 §1: cuántos pares pasan de 5 mm y el máximo, medida con `seam-gap.spec.ts`). Mergear espera la orden de Samuel. Después mergea `fix/uniones-de-costura` en `feat/tela-prenda-completa`.

---
## La prenda en la CPU, en `feat/tela-prenda-completa`

### Tarea 3: Varias piezas, cada una con su hilo

Una prenda es una sola malla con todas sus piezas. Ningún triángulo cruza piezas, así que el patrón de cada pieza puede vivir en el marco de su propio hilo: la membrana y la placa solo miran un triángulo y sus vecinos de la misma pieza. Lo único global que hoy lo impide es que el reposo exige que todos los triángulos vayan en el mismo sentido; con piezas espejadas o malladas por separado eso se revisa por pieza.

**Files:**
- Create: `src/utils/cloth/implicito/prenda.ts`
- Modify: `src/utils/cloth/implicito/malla.ts` (`MallaDeTela.piezaDeTri`)
- Modify: `src/utils/cloth/implicito/reposo.ts` (el sentido, por pieza)
- Modify: `src/utils/cloth/implicito/sistema.ts:96` (pasa `piezaDeTri` al reposo)
- Test: `src/utils/cloth/implicito/__tests__/prenda.test.ts`

**Interfaces:**
- Consumes: `aMarcoDelHilo(patron: Float64Array, hilo?: readonly [number, number]): Float64Array`, `mallaDeContorno`, `rectangulo`, `TELA_DE_LABORATORIO`, `SistemaTela`.
- Produces:
  - `malla.ts`: `MallaDeTela` gana `piezaDeTri?: Uint16Array`.
  - `reposo.ts`: `prepararReposo(uv: Float64Array, tris: Uint32Array, densidad: number, piezaDeTri?: ArrayLike<number>): Reposo`.
  - `prenda.ts`: `interface PiezaDeTela { id: string; x: ArrayLike<number>; patron: ArrayLike<number>; tris: ArrayLike<number>; hilo?: readonly [number, number]; fijos?: ArrayLike<number>; margenMm?: number }`, `interface RangoDePieza { id: string; v0: number; nv: number; t0: number; nt: number; margenMm?: number }`, `interface Prenda { malla: MallaDeTela; piezas: RangoDePieza[] }`, `armarPrenda(piezas: readonly PiezaDeTela[]): Prenda`. En `Prenda.malla.patron` el dibujo de cada pieza ya está en el marco de su hilo: un `SistemaTela` de la prenda se arma sin `hilo`.

- [ ] **Step 1: Escribe las pruebas que fallan**

`src/utils/cloth/implicito/__tests__/prenda.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { armarPrenda, type PiezaDeTela } from '../prenda';
import { mallaDeContorno } from '../malla';
import { SistemaTela } from '../sistema';
import { telaSI } from '../tela';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';

/** Un cuadrado de 100 mm mallado a 10 mm, corrido dx metros en x. */
function cuadrado(id: string, dx: number, hilo?: readonly [number, number]): PiezaDeTela {
  const m = mallaDeContorno(rectangulo(0, 0, 100, 100), 10);
  return { id, x: Float64Array.from(m.x, (q, k) => (k % 3 === 0 ? q + dx : q)), patron: m.patron, tris: m.tris, hilo };
}

describe('la prenda: varias piezas, cada una con su hilo', () => {
  it('junta las piezas corriendo sus índices', () => {
    const a = cuadrado('a', 0), b = cuadrado('b', 0.2);
    const p = armarPrenda([a, b]);
    const na = a.x.length / 3, ta = a.tris.length / 3;
    expect(p.piezas.map((q) => [q.id, q.v0, q.nv, q.t0, q.nt])).toEqual([
      ['a', 0, na, 0, ta],
      ['b', na, b.x.length / 3, ta, b.tris.length / 3],
    ]);
    expect(p.malla.tris[3 * ta]).toBe(b.tris[0] + na);
    expect(p.malla.piezaDeTri![0]).toBe(0);
    expect(p.malla.piezaDeTri![ta]).toBe(1);
    expect(p.malla.x[3 * na]).toBeCloseTo(b.x[0], 12);
  });

  it('cada pieza estira según su hilo: el mismo 1 % en x pide kTrama a una y kUrdimbre a la otra', () => {
    const t = telaSI(TELA_DE_LABORATORIO), A = 0.1 * 0.1, eps = 0.01;
    const energia = (hilo?: readonly [number, number]) => {
      const s = new SistemaTela(armarPrenda([cuadrado('p', 0, hilo)]).malla, TELA_DE_LABORATORIO);
      return s.membrana.energia(Float64Array.from(s.x, (q, k) => (k % 3 === 0 ? q * (1 + eps) : q)));
    };
    // hilo vertical: x va a lo ancho; hilo horizontal: x va a lo largo de la urdimbre
    expect(energia() / (A * 0.5 * t.kTrama * eps * eps)).toBeCloseTo(1, 3);
    expect(energia([1, 0]) / (A * 0.5 * t.kUrdimbre * eps * eps)).toBeCloseTo(1, 3);
  });

  it('una pieza espejada entra junto a las otras: el sentido del reposo se revisa por pieza', () => {
    const a = cuadrado('a', 0), b = cuadrado('b', 0.2);
    const espejada: PiezaDeTela = { ...b, patron: Float64Array.from(b.patron, (q, k) => (k % 2 === 0 ? -q : q)) };
    const prenda = armarPrenda([a, espejada]);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO);
    // en la posición del dibujo ninguna pieza está deformada: el espejo no estira
    expect(s.membrana.energia(s.x)).toBeLessThan(1e-12);
    // la misma malla sin decir de qué pieza es cada triángulo sigue rechazando el sentido mezclado
    expect(() => new SistemaTela({ ...prenda.malla, piezaDeTri: undefined }, TELA_DE_LABORATORIO)).toThrow(/al revés/);
  });
});
```

- [ ] **Step 2: Corre las pruebas y mira que fallen**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/prenda.test.ts`
Expected: FAIL, no existe `../prenda`.

- [ ] **Step 3: La pieza de cada triángulo y el sentido por pieza**

En `src/utils/cloth/implicito/malla.ts`, dentro de `MallaDeTela`, después de `fijos?`:

```ts
  /** la pieza de cada triángulo, en una prenda de varias piezas (prenda.ts): el reposo revisa el sentido por pieza */
  piezaDeTri?: Uint16Array;
```

En `src/utils/cloth/implicito/reposo.ts`, la firma pasa a `export function prepararReposo(uv: Float64Array, tris: Uint32Array, densidad: number, piezaDeTri?: ArrayLike<number>): Reposo {`, la línea `let signo = 0;` pasa a `const signos = new Map<number, number>();`, y las dos líneas del signo dentro del bucle pasan a:

```ts
    const pieza = piezaDeTri ? piezaDeTri[t] : 0, signo = signos.get(pieza);
    if (signo === undefined) signos.set(pieza, Math.sign(det));
    else if (Math.sign(det) !== signo) throw new Error(`prepararReposo: el triángulo ${t} va al revés que los demás de su pieza`);
```

En `src/utils/cloth/implicito/sistema.ts`, la línea `const reposo = prepararReposo(uv, malla.tris, this.tela.densidad);` pasa a `const reposo = prepararReposo(uv, malla.tris, this.tela.densidad, malla.piezaDeTri);`.

- [ ] **Step 4: La prenda**

`src/utils/cloth/implicito/prenda.ts`:

```ts
/**
 * La prenda para el motor implícito (spec 2026-10-13 §4.1.2 y §4.5): todas las piezas en una sola malla, cada
 * una con su dibujo girado al marco de su propio hilo. Ningún triángulo cruza piezas, así que la membrana y la
 * placa ven cada pieza en su marco; las costuras (costuras.ts) las unen.
 */
import { aMarcoDelHilo, type MallaDeTela } from './malla';

export interface PiezaDeTela {
  id: string;
  /** posiciones iniciales (m), [x0, y0, z0, x1, …] */
  x: ArrayLike<number>;
  /** el dibujo de la pieza (m), [px0, py0, …], en los ejes del dibujo */
  patron: ArrayLike<number>;
  tris: ArrayLike<number>;
  /** la urdimbre en los ejes del dibujo; sin línea de grano, vertical (§4.1.2) */
  hilo?: readonly [number, number];
  /** 1 = vértice empotrado */
  fijos?: ArrayLike<number>;
  /** ancho del margen de costura de la pieza (mm); sin él, el de margen.ts */
  margenMm?: number;
}

/** Dónde empieza cada pieza en los vértices y en los triángulos de la prenda. */
export interface RangoDePieza {
  id: string;
  v0: number;
  nv: number;
  t0: number;
  nt: number;
  margenMm?: number;
}

export interface Prenda {
  /** la malla de la prenda, con el dibujo de cada pieza ya en el marco de su hilo */
  malla: MallaDeTela;
  piezas: RangoDePieza[];
}

export function armarPrenda(piezas: readonly PiezaDeTela[]): Prenda {
  let nv = 0, nt = 0;
  for (const p of piezas) {
    nv += p.x.length / 3;
    nt += p.tris.length / 3;
  }
  if (piezas.length > 0xffff) throw new Error('armarPrenda: más piezas de las que caben en un Uint16');
  const x = new Float64Array(3 * nv), patron = new Float64Array(2 * nv), tris = new Uint32Array(3 * nt);
  const piezaDeTri = new Uint16Array(nt), fijos = new Uint8Array(nv);
  let hayFijos = false, v0 = 0, t0 = 0;
  const rangos: RangoDePieza[] = [];
  piezas.forEach((p, k) => {
    const n = p.x.length / 3, m = p.tris.length / 3;
    x.set(p.x, 3 * v0);
    patron.set(aMarcoDelHilo(Float64Array.from(p.patron), p.hilo), 2 * v0);
    for (let q = 0; q < 3 * m; q++) tris[3 * t0 + q] = p.tris[q] + v0;
    piezaDeTri.fill(k, t0, t0 + m);
    if (p.fijos) {
      for (let i = 0; i < n; i++) {
        if (p.fijos[i]) {
          fijos[v0 + i] = 1;
          hayFijos = true;
        }
      }
    }
    rangos.push({ id: p.id, v0, nv: n, t0, nt: m, margenMm: p.margenMm });
    v0 += n;
    t0 += m;
  });
  return { malla: { x, patron, tris, piezaDeTri, ...(hayFijos ? { fijos } : {}) }, piezas: rangos };
}
```

- [ ] **Step 5: Corre las pruebas y mira que pasen**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/prenda.test.ts src/utils/cloth/implicito/__tests__/reposo.test.ts`
Expected: PASS. Si `reposo.test.ts` buscaba el texto viejo del error («va al revés que los demás»), sigue encontrándolo: el texto nuevo lo contiene.

- [ ] **Step 6: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/prenda.ts src/utils/cloth/implicito/malla.ts src/utils/cloth/implicito/reposo.ts src/utils/cloth/implicito/sistema.ts src/utils/cloth/implicito/__tests__/prenda.test.ts
git commit -m "feat(tela): la prenda de varias piezas, cada una en el marco de su hilo"
```

### Tarea 4: Las costuras, cosidas a un punto del otro lado (E1)

Cada vértice de un lado se cose al punto del otro lado que le toca por largo de arco en el patrón, con un resorte cuyo largo de reposo se cierra a 0. `seamInitDataToPairs` ya tiene los dos lados en orden de cosido (el B invertido si va al revés, y con el filtro de rango aplicado): solo hay que devolverlos.

**Files:**
- Modify: `src/utils/cloth/seamPairs.ts` (`SeamPair.lados`)
- Create: `src/utils/cloth/implicito/costuras.ts`
- Modify: `src/utils/cloth/implicito/prenda.ts` (`costurasDePrenda`)
- Modify: `src/utils/cloth/implicito/sistema.ts` (las costuras en el sistema y `alTerminarCuadro`)
- Modify: `src/utils/cloth/implicito/paso.ts` (llama `alTerminarCuadro`)
- Modify: `src/utils/cloth/implicito/gpu/empaquetar.ts` (se niega a empaquetar costuras: llegan a la GPU en la parte 2)
- Test: `src/utils/cloth/__tests__/ladosDeCostura.test.ts`
- Test: `src/utils/cloth/implicito/__tests__/costuras.test.ts`

**Interfaces:**
- Consumes: `SeamPair`, `LocalVertexIndex` (`seamPairs.ts`); `Prenda`, `armarPrenda` (Tarea 3); `importarMariaClasificada`, `costurasDeMaria`, `aInitData`, `mallarParaCoser` (Tarea 1); `aplastados(x, malla)` (`banco/medidas.ts`); `errorDelGradiente`, `errorDeHessiana`, `azar` (`__tests__/ayudas.ts`).
- Produces:
  - `seamPairs.ts`: `SeamPair.lados?: { a: LocalVertexIndex[]; b: LocalVertexIndex[] }`.
  - `costuras.ts`: `interface PuntoDeCostura { a: number; b0: number; b1: number; s: number }`, `CIERRE_POR_CUADRO`, `LARGO_CERRADO`, `largosEnElPatron(patron: ArrayLike<number>, lado: readonly number[]): number[]`, `puntosDeCostura(patron: ArrayLike<number>, ladoA: readonly number[], ladoB: readonly number[]): PuntoDeCostura[]`, `class Costuras` con `n`, `a`, `b0`, `b1`, `s`, `L0`, `L`, `estado`, `cuadros`, `separacion(e, x, d: number[])`, `pesos(e)`, `vertices(e)`, `avanzarCierre()`, `cerradas()`, `energiaDe(e, x)`, `energia(x)`, `linealizar(x)`, `gradiente(out)`, `hessianaPor(p, out)`, `sumarBloque(e, li, lj, M, o?)`, `sumarBloquesDiagonales(out)`.
  - `prenda.ts`: `interface LadosDeCostura { a: number[]; b: number[] }` (índices GLOBALES) y `costurasDePrenda(prenda: Prenda, pares: readonly SeamPair[]): { puntos: PuntoDeCostura[]; lados: LadosDeCostura[] }`.
  - `sistema.ts`: `AjustesImplicito.kCostura` (N/m, 1000 por defecto), `OpcionesSistema.costuras?: { puntos: readonly PuntoDeCostura[] }`, `SistemaTela.costuras: Costuras`, `SistemaTela.alTerminarCuadro(): void`.

- [ ] **Step 1: Escribe las pruebas que fallan**

`src/utils/cloth/__tests__/ladosDeCostura.test.ts`:

```ts
/** Los lados de cada costura, en orden de cosido: los que cose el motor implícito (implicito/costuras.ts). */
import { describe, expect, it } from 'vitest';
import { seamInitDataToPairs } from '../seamPairs';
import { aInitData, costurasDeMaria, importarMariaClasificada, mallarParaCoser } from './camisaDeMaria';

describe('los lados de una costura', () => {
  it('María: cada par trae sus dos lados, con los mismos vértices que sus pares y seguidos por el borde', { timeout: 120_000 }, () => {
    const piezas = importarMariaClasificada();
    const malladas = mallarParaCoser(piezas, 10);
    const pares = seamInitDataToPairs(aInitData(costurasDeMaria(piezas)), malladas);
    expect(pares.length).toBeGreaterThan(10);
    for (const par of pares) {
      expect(par.lados).toBeDefined();
      const { a, b } = par.lados!;
      expect(new Set(a)).toEqual(new Set(par.vertexPairs.map((p) => p[0])));
      expect(new Set(b)).toEqual(new Set(par.vertexPairs.map((p) => p[1])));
      // dos vértices seguidos de un lado son vecinos en el borde: a menos de una arista y media (uvs en mm/100)
      for (const [lado, pieza] of [[a, par.pieceAId], [b, par.pieceBId]] as const) {
        const uv = malladas.find((m) => m.pieceId === pieza)!.uvs!;
        for (let k = 1; k < lado.length; k++) {
          const p = lado[k - 1], q = lado[k];
          expect(Math.hypot(uv[2 * q] - uv[2 * p], uv[2 * q + 1] - uv[2 * p + 1]) * 100).toBeLessThan(15);
        }
      }
    }
  });
});
```

`src/utils/cloth/implicito/__tests__/costuras.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CIERRE_POR_CUADRO, Costuras, LARGO_CERRADO, puntosDeCostura, type PuntoDeCostura } from '../costuras';
import { armarPrenda } from '../prenda';
import { mallaDeContorno, type MallaDeTela } from '../malla';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { aplastados } from '../banco/medidas';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, errorDeHessiana, errorDelGradiente } from './ayudas';

/** Los vértices del borde x = x0 del dibujo, de abajo hacia arriba, corridos v0. */
function borde(m: MallaDeTela, x0: number, v0 = 0): number[] {
  const n = m.x.length / 3, vs: number[] = [];
  for (let i = 0; i < n; i++) if (Math.abs(m.patron[2 * i] - x0) < 1e-9) vs.push(i);
  return vs.sort((i, j) => m.patron[2 * i + 1] - m.patron[2 * j + 1]).map((i) => i + v0);
}

/** A (100 × 60 mm, malla de 5 mm) y B (lo mismo con malla de 7 mm, 30 mm a la derecha): la orilla x = 100 de A se cose a la x = 0 de B. */
function dosPiezas() {
  const A = mallaDeContorno(rectangulo(0, 0, 100, 60), 5), B = mallaDeContorno(rectangulo(0, 0, 100, 60), 7);
  const prenda = armarPrenda([
    { id: 'A', x: A.x, patron: A.patron, tris: A.tris },
    { id: 'B', x: Float64Array.from(B.x, (q, k) => (k % 3 === 0 ? q + 0.13 : q)), patron: B.patron, tris: B.tris },
  ]);
  return { prenda, ladoA: borde(A, 0.1), ladoB: borde(B, 0, A.x.length / 3) };
}

/** La separación más grande entre un vértice cosido y su punto, en m. */
function peorSeparacion(s: SistemaTela): number {
  let peor = 0;
  const d = [0, 0, 0];
  for (let e = 0; e < s.costuras.n; e++) {
    s.costuras.separacion(e, s.x, d);
    peor = Math.max(peor, Math.hypot(d[0], d[1], d[2]));
  }
  return peor;
}

describe('las costuras', () => {
  it('cada vértice de A va al punto de B que le toca por largo de arco, y cada vértice de B que no cae en uno de A, a A', () => {
    // A: tres vértices en x = 0 (y = 0; 0,5; 1); B: cuatro en x = 1 (y = 0; ⅓; ⅔; 1)
    const patron = [0, 0, 0, 0.5, 0, 1, 1, 0, 1, 1 / 3, 1, 2 / 3, 1, 1];
    const p = puntosDeCostura(patron, [0, 1, 2], [3, 4, 5, 6]);
    const esperado: PuntoDeCostura[] = [
      { a: 0, b0: 3, b1: 4, s: 0 },
      { a: 1, b0: 4, b1: 5, s: 0.5 },
      { a: 2, b0: 5, b1: 6, s: 1 },
      { a: 4, b0: 0, b1: 1, s: 2 / 3 },
      { a: 5, b0: 1, b1: 2, s: 1 / 3 },
    ];
    expect(p.length).toBe(esperado.length);
    p.forEach((q, k) => {
      expect([q.a, q.b0, q.b1]).toEqual([esperado[k].a, esperado[k].b0, esperado[k].b1]);
      expect(q.s).toBeCloseTo(esperado[k].s, 12);
    });
  });

  it('un vértice nunca se cose a un segmento suyo', () => {
    // los dos lados comparten la punta 0: ese punto no es costura
    const patron = [0, 0, 1, 0, 0, 1];
    expect(puntosDeCostura(patron, [0, 1], [0, 2]).some((q) => q.a === q.b0 || q.a === q.b1)).toBe(false);
  });

  it('fuerza = −∂E/∂x y H·p por diferencias finitas, con el largo abierto y cerrado', () => {
    const r = azar(41), x = Float64Array.from({ length: 18 }, () => 0.05 * r());
    const c = new Costuras([{ a: 0, b0: 1, b1: 2, s: 0.3 }, { a: 3, b0: 4, b1: 5, s: 0.8 }], x, 1000);
    c.L[0] = 0.4 * c.L0[0]; // abierta: |d| > L
    c.L[1] = 0; // cerrada
    c.linealizar(x);
    const g = new Float64Array(18);
    c.gradiente(g);
    expect(errorDelGradiente((y) => c.energia(y), g, x)).toBeLessThan(1e-4);
    const p = Float64Array.from({ length: 18 }, () => r()), Hp = new Float64Array(18);
    c.hessianaPor(p, Hp);
    const gradiente = (y: Float64Array, out: Float64Array) => {
      out.fill(0);
      c.linealizar(y);
      c.gradiente(out);
    };
    expect(errorDeHessiana(gradiente, Hp, x, p)).toBeLessThan(1e-4);
  });

  it('el largo de reposo se cierra ×0,97 por subpaso de 15 hasta quedar en 0', () => {
    const c = new Costuras([{ a: 0, b0: 1, b1: 1, s: 0 }], [0, 0, 0, 0.03, 0, 0], 1000);
    expect(c.L0[0]).toBeCloseTo(0.03, 12);
    c.avanzarCierre();
    expect(c.L[0]).toBeCloseTo(0.03 * CIERRE_POR_CUADRO, 12);
    for (let k = 0; k < 40 && !c.cerradas(); k++) c.avanzarCierre();
    expect(c.cerradas()).toBe(true);
    expect(0.03 * CIERRE_POR_CUADRO ** (c.cuadros - 1)).toBeGreaterThanOrEqual(LARGO_CERRADO);
  });

  it('dos piezas de distinta malla se cosen sin aplastar la orilla', () => {
    const { prenda, ladoA, ladoB } = dosPiezas();
    expect(ladoA.length).not.toBe(ladoB.length);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, {
      costuras: { puntos: puntosDeCostura(prenda.malla.patron, ladoA, ladoB) },
      ajustes: { gravedad: 0 },
    });
    for (let c = 0; c < 60; c++) pasoImplicito(s);
    expect(peorSeparacion(s)).toBeLessThan(1e-4);
    expect(aplastados(s.x, prenda.malla)).toBe(0);
  });

  it('cosidas vértice con vértice, las mismas piezas aplastan la orilla (por qué E1)', () => {
    const { prenda, ladoA, ladoB } = dosPiezas();
    // cada vértice de cada lado a su vecino más cercano del otro lado por largo de arco, como matchVertices
    const tDe = (lado: number[]) => lado.map((_, k) => k / (lado.length - 1));
    const tA = tDe(ladoA), tB = tDe(ladoB);
    const cercano = (t: number, ts: number[]) => ts.reduce((m, q, k) => (Math.abs(q - t) < Math.abs(ts[m] - t) ? k : m), 0);
    const puntos: PuntoDeCostura[] = [
      ...ladoA.map((a, k) => ({ a, b0: ladoB[cercano(tA[k], tB)], b1: ladoB[cercano(tA[k], tB)], s: 0 })),
      ...ladoB.map((b, k) => ({ a: b, b0: ladoA[cercano(tB[k], tA)], b1: ladoA[cercano(tB[k], tA)], s: 0 })),
    ];
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { costuras: { puntos }, ajustes: { gravedad: 0 } });
    for (let c = 0; c < 60; c++) pasoImplicito(s);
    expect(aplastados(s.x, prenda.malla)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Corre las pruebas y mira que fallen**

Run: `npx vitest run src/utils/cloth/__tests__/ladosDeCostura.test.ts src/utils/cloth/implicito/__tests__/costuras.test.ts`
Expected: FAIL: `par.lados` es `undefined`, y no existe `../costuras`.

- [ ] **Step 3: Los lados, en `seamInitDataToPairs`**

En `src/utils/cloth/seamPairs.ts`:
- Dentro de `SeamPair`, después de `tensionFactor`:

```ts
  /**
   * Los dos lados de la costura en orden de cosido (el B ya invertido si va al revés) y con el filtro de
   * rango aplicado. El motor implícito cose cada vértice de un lado a un punto del otro
   * (implicito/costuras.ts); el XPBD usa `vertexPairs`.
   */
  lados?: { a: LocalVertexIndex[]; b: LocalVertexIndex[] };
```

- Dentro de `ResolvedSeamVertexPairs`, después de `failure`: `lados?: { a: LocalVertexIndex[]; b: LocalVertexIndex[] };`.
- El `return` final de `resolveSeamVertexPairs` pasa a:

```ts
  return {
    vertexPairs,
    failure: null,
    lados: { a: edgeA.map((v) => v.index as LocalVertexIndex), b: edgeB.map((v) => v.index as LocalVertexIndex) },
  };
```

- En `seamInitDataToPairs`, dentro del `pairs.push({ … })`, después de `tensionFactor`: `lados: resolved.lados,`.

- [ ] **Step 4: Las costuras**

`src/utils/cloth/implicito/costuras.ts`:

```ts
/**
 * Las costuras del motor implícito (spec 2026-10-13 §4.3.3, con la enmienda E1 del plan de la entrega 4):
 * cada vértice de un lado se cose a un PUNTO del otro, sobre el segmento que le toca por largo de arco en el
 * patrón (si el muestreo coincide, el punto cae en un vértice y es el par de siempre). Cada punto es un resorte
 * dentro del sistema:
 *   E = ½·k·max(|d| − L, 0)²,   d = x_a − (1 − s)·x_b0 − s·x_b1,
 * con un largo de reposo L que arranca en la separación de la colocación y se cierra a 0 como hoy. La costura
 * tira y no empuja. Con L = 0 la energía es cuadrática y la hessiana, k·I, exacta; con L > 0 también es la
 * exacta: k·(L/|d|)·n·nᵀ + k·(1 − L/|d|)·I.
 */

/** Un vértice cosido al punto (1 − s)·x_b0 + s·x_b1 del otro lado. */
export interface PuntoDeCostura {
  a: number;
  b0: number;
  b1: number;
  s: number;
}

/** Cuánto se cierra el largo de reposo por cuadro: el cierre de hoy, ×0,97 por subpaso de 15. */
export const CIERRE_POR_CUADRO = 0.97 ** 15;
/** Largo (m) bajo el cual la costura queda cerrada: desde ahí, L = 0. */
export const LARGO_CERRADO = 1e-4;

/** El largo de arco de cada vértice del lado, medido en el patrón y normalizado a [0, 1]. */
export function largosEnElPatron(patron: ArrayLike<number>, lado: readonly number[]): number[] {
  const t = [0];
  for (let k = 1; k < lado.length; k++) {
    const p = lado[k - 1], q = lado[k];
    t.push(t[k - 1] + Math.hypot(patron[2 * q] - patron[2 * p], patron[2 * q + 1] - patron[2 * p + 1]));
  }
  const total = t[t.length - 1];
  return t.map((v) => (total > 0 ? v / total : 0));
}

/** El segmento del lado que contiene la fracción t, y dónde cae t en él. */
function sobre(t: number, lado: readonly number[], tl: readonly number[]): Omit<PuntoDeCostura, 'a'> {
  if (lado.length === 1) return { b0: lado[0], b1: lado[0], s: 0 };
  let j = 0;
  while (j < lado.length - 2 && tl[j + 1] < t) j++;
  const tramo = tl[j + 1] - tl[j];
  return { b0: lado[j], b1: lado[j + 1], s: tramo > 0 ? Math.min(1, Math.max(0, (t - tl[j]) / tramo)) : 0 };
}

/**
 * Los puntos de una costura: cada vértice de A sobre B, y cada vértice de B que no coincide con uno de A,
 * sobre A. Los lados van en orden de cosido (el B ya invertido si va al revés) y con índices globales.
 */
export function puntosDeCostura(patron: ArrayLike<number>, ladoA: readonly number[], ladoB: readonly number[]): PuntoDeCostura[] {
  if (ladoA.length === 0 || ladoB.length === 0) return [];
  const tA = largosEnElPatron(patron, ladoA), tB = largosEnElPatron(patron, ladoB);
  const puntos: PuntoDeCostura[] = [];
  const agregar = (p: PuntoDeCostura) => {
    // un vértice cosido a un segmento suyo (lados que comparten una punta) no es costura
    if (p.a !== p.b0 && p.a !== p.b1) puntos.push(p);
  };
  ladoA.forEach((a, i) => agregar({ a, ...sobre(tA[i], ladoB, tB) }));
  ladoB.forEach((b, i) => {
    if (!tA.some((t) => Math.abs(t - tB[i]) < 1e-9)) agregar({ a: b, ...sobre(tB[i], ladoA, tA) });
  });
  return puntos;
}

export class Costuras {
  readonly n: number;
  readonly a: Uint32Array;
  readonly b0: Uint32Array;
  readonly b1: Uint32Array;
  readonly s: Float64Array;
  /** largo de reposo al coser (la separación en la colocación) y el de ahora (m) */
  readonly L0: Float64Array;
  readonly L: Float64Array;
  /** por punto, del último `linealizar`: d (3), el factor del gradiente sobre d, el de I y el de d·dᵀ en la hessiana */
  readonly estado: Float64Array;
  /** cuadros de cierre */
  cuadros = 0;

  constructor(puntos: readonly PuntoDeCostura[], x: ArrayLike<number>, readonly k: number) {
    this.n = puntos.length;
    this.a = Uint32Array.from(puntos, (p) => p.a);
    this.b0 = Uint32Array.from(puntos, (p) => p.b0);
    this.b1 = Uint32Array.from(puntos, (p) => p.b1);
    this.s = Float64Array.from(puntos, (p) => p.s);
    this.L0 = new Float64Array(this.n);
    const d = [0, 0, 0];
    for (let e = 0; e < this.n; e++) {
      this.separacion(e, x, d);
      this.L0[e] = Math.hypot(d[0], d[1], d[2]);
    }
    this.L = Float64Array.from(this.L0);
    this.estado = new Float64Array(6 * this.n);
  }

  /** d = x_a − (1 − s)·x_b0 − s·x_b1 del punto e, en `d`. */
  separacion(e: number, x: ArrayLike<number>, d: number[]): void {
    const a = 3 * this.a[e], b0 = 3 * this.b0[e], b1 = 3 * this.b1[e], s = this.s[e];
    for (let k = 0; k < 3; k++) d[k] = x[a + k] - (1 - s) * x[b0 + k] - s * x[b1 + k];
  }

  /** El peso de a, b0 y b1 en d. */
  pesos(e: number): [number, number, number] {
    return [1, -(1 - this.s[e]), -this.s[e]];
  }

  vertices(e: number): [number, number, number] {
    return [this.a[e], this.b0[e], this.b1[e]];
  }

  /** Un cuadro de cierre: L ← L·CIERRE_POR_CUADRO, y 0 al bajar de LARGO_CERRADO. */
  avanzarCierre(): void {
    this.cuadros++;
    for (let e = 0; e < this.n; e++) {
      const L = this.L[e] * CIERRE_POR_CUADRO;
      this.L[e] = L < LARGO_CERRADO ? 0 : L;
    }
  }

  cerradas(): boolean {
    return this.L.every((L) => L === 0);
  }

  energiaDe(e: number, x: ArrayLike<number>): number {
    const d = [0, 0, 0];
    this.separacion(e, x, d);
    const r = Math.hypot(d[0], d[1], d[2]) - this.L[e];
    return r > 0 ? 0.5 * this.k * r * r : 0;
  }

  energia(x: ArrayLike<number>): number {
    let E = 0;
    for (let e = 0; e < this.n; e++) E += this.energiaDe(e, x);
    return E;
  }

  /** Guarda d y los factores de ∇E = g·d y H = c1·I + c2·d·dᵀ de cada punto, en las posiciones x. */
  linealizar(x: ArrayLike<number>): void {
    const d = [0, 0, 0], st = this.estado, k = this.k;
    for (let e = 0; e < this.n; e++) {
      this.separacion(e, x, d);
      const r = Math.hypot(d[0], d[1], d[2]), L = this.L[e], o = 6 * e;
      st[o] = d[0];
      st[o + 1] = d[1];
      st[o + 2] = d[2];
      if (L === 0) {
        st[o + 3] = k;
        st[o + 4] = k;
        st[o + 5] = 0;
      } else if (r > L) {
        const q = L / r;
        st[o + 3] = k * (1 - q);
        st[o + 4] = k * (1 - q);
        st[o + 5] = (k * q) / (r * r);
      } else {
        st[o + 3] = 0;
        st[o + 4] = 0;
        st[o + 5] = 0;
      }
    }
  }

  /** out += ∇E, del último `linealizar`. */
  gradiente(out: Float64Array): void {
    const st = this.estado;
    for (let e = 0; e < this.n; e++) {
      const o = 6 * e, g = st[o + 3];
      if (g === 0) continue;
      const w = this.pesos(e), v = this.vertices(e);
      for (let m = 0; m < 3; m++) for (let k = 0; k < 3; k++) out[3 * v[m] + k] += w[m] * g * st[o + k];
    }
  }

  /** out += H·p, del último `linealizar`. */
  hessianaPor(p: Float64Array, out: Float64Array): void {
    const st = this.estado;
    for (let e = 0; e < this.n; e++) {
      const o = 6 * e, c1 = st[o + 4], c2 = st[o + 5];
      if (c1 === 0 && c2 === 0) continue;
      const w = this.pesos(e), v = this.vertices(e), q = [0, 0, 0];
      for (let m = 0; m < 3; m++) for (let k = 0; k < 3; k++) q[k] += w[m] * p[3 * v[m] + k];
      const dq = st[o] * q[0] + st[o + 1] * q[1] + st[o + 2] * q[2];
      for (let m = 0; m < 3; m++) for (let k = 0; k < 3; k++) out[3 * v[m] + k] += w[m] * (c1 * q[k] + c2 * dq * st[o + k]);
    }
  }

  /** M[o..o+8] += el bloque (li, lj) del punto e (fila mayor), con li y lj en 0..2 = a, b0, b1. */
  sumarBloque(e: number, li: number, lj: number, M: Float64Array, o = 0): void {
    const st = this.estado, s0 = 6 * e, w = this.pesos(e), c = w[li] * w[lj], c1 = st[s0 + 4], c2 = st[s0 + 5];
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) M[o + 3 * r + q] += c * ((r === q ? c1 : 0) + c2 * st[s0 + r] * st[s0 + q]);
  }

  /** out[9v..9v+8] += el bloque diagonal de cada vértice cosido. */
  sumarBloquesDiagonales(out: Float64Array): void {
    for (let e = 0; e < this.n; e++) {
      const v = this.vertices(e);
      for (let m = 0; m < 3; m++) this.sumarBloque(e, m, m, out, 9 * v[m]);
    }
  }
}
```

- [ ] **Step 5: Las costuras de la prenda**

En `src/utils/cloth/implicito/prenda.ts`, agrega los imports `import type { SeamPair } from '../seamPairs';` y `import { puntosDeCostura, type PuntoDeCostura } from './costuras';`, y al final:

```ts
/** Los dos lados de una costura en la prenda, con índices GLOBALES y en orden de cosido. */
export interface LadosDeCostura {
  a: number[];
  b: number[];
}

/**
 * Los puntos de costura de la prenda y los lados de cada costura, con índices globales. Cada par trae sus
 * lados desde `seamInitDataToPairs`.
 */
export function costurasDePrenda(prenda: Prenda, pares: readonly SeamPair[]): { puntos: PuntoDeCostura[]; lados: LadosDeCostura[] } {
  const v0 = new Map(prenda.piezas.map((p) => [p.id, p.v0]));
  const puntos: PuntoDeCostura[] = [], lados: LadosDeCostura[] = [];
  for (const par of pares) {
    const oa = v0.get(par.pieceAId), ob = v0.get(par.pieceBId);
    if (oa === undefined || ob === undefined) throw new Error(`costurasDePrenda: falta una pieza de la costura ${par.pieceAId}↔${par.pieceBId}`);
    if (!par.lados) throw new Error('costurasDePrenda: el par no trae sus lados (los arma seamInitDataToPairs)');
    const lado = { a: par.lados.a.map((v) => v + oa), b: par.lados.b.map((v) => v + ob) };
    lados.push(lado);
    puntos.push(...puntosDeCostura(prenda.malla.patron, lado.a, lado.b));
  }
  return { puntos, lados };
}
```

- [ ] **Step 6: Las costuras en el sistema**

En `src/utils/cloth/implicito/sistema.ts`:
- Import: `import { Costuras, type PuntoDeCostura } from './costuras';`.
- En `AjustesImplicito`, después de `kContacto`:

```ts
  /**
   * rigidez de cada punto de costura (N/m). Con 1000, una costura que sostiene 1 N/m de tela con puntos cada
   * 5 mm queda abierta 5 µm; el banco de la camiseta la confirma (spec §5: «el resorte de costura se elige
   * con el banco»).
   */
  kCostura: number;
```

- En `AJUSTES_IMPLICITO`, después de `kContacto: 2000,`: `kCostura: 1000,`.
- En `OpcionesSistema`, después de `hilo?`: `/** los puntos de costura de la prenda (costuras.ts) */` y `costuras?: { puntos: readonly PuntoDeCostura[] };`.
- En la clase, después de `readonly placa: Placa;`: `readonly costuras: Costuras;`; y en el constructor, después de `this.x = Float64Array.from(malla.x);`: `this.costuras = new Costuras(op.costuras?.puntos ?? [], malla.x, this.aj.kCostura);`.
- `energiaElastica` pasa a `return this.membrana.energia(x) + this.placa.energia(x) + this.costuras.energia(x);`.
- En `linealizar`, `gradienteElastico`, `hessianaPor` y `bloquesDiagonales`, agrega al final la línea de las costuras: `this.costuras.linealizar(this.x);`, `this.costuras.gradiente(out);`, `this.costuras.hessianaPor(p, out);` y `this.costuras.sumarBloquesDiagonales(out);`.
- Después de `bloquesDiagonales`, el método nuevo:

```ts
  /** Lo que pasa entre un cuadro y el siguiente: las costuras se cierran un cuadro más. */
  alTerminarCuadro(): void {
    this.costuras.avanzarCierre();
  }
```

En `src/utils/cloth/implicito/paso.ts`, justo antes de `return { cg, anticipados, alfa, G0, G1 };`: `s.alTerminarCuadro();`.

En `src/utils/cloth/implicito/gpu/empaquetar.ts`, primera línea de `empaquetar`: `if (s.costuras.n > 0) throw new Error('empaquetar: las costuras llegan a la GPU en la parte 2 de la entrega 4');`.

- [ ] **Step 7: Corre las pruebas y mira que pasen**

Run: `npx vitest run src/utils/cloth/__tests__/ladosDeCostura.test.ts src/utils/cloth/implicito/`
Expected: PASS. Si «cosidas vértice con vértice… aplastan la orilla» no aplasta, para y repórtalo con el número de vértices de cada lado y `aplastados`: es la medida de E1.

- [ ] **Step 8: Mide el resorte de la costura**

Corre la escena de «dos piezas de distinta malla» con `kCostura` en 300, 1000, 3000 y 10000 (una prueba temporal o un `it.each` que imprima) y anota, para cada uno, `peorSeparacion` a los 60 cuadros y la suma de `cg` de los 60 pasos. Pon la tabla en el mensaje del commit. Si 1000 deja una separación mayor que 0,1 mm o algún valor no converge, para y repórtalo: la elección es del banco (§5).

- [ ] **Step 9: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/seamPairs.ts src/utils/cloth/__tests__/ladosDeCostura.test.ts src/utils/cloth/implicito/costuras.ts src/utils/cloth/implicito/prenda.ts src/utils/cloth/implicito/sistema.ts src/utils/cloth/implicito/paso.ts src/utils/cloth/implicito/gpu/empaquetar.ts src/utils/cloth/implicito/__tests__/costuras.test.ts
git commit -m "feat(tela): las costuras cosen cada vértice a un punto del otro lado y se cierran a 0"
```

### Tarea 5: La flexión cruza la costura (E2)

Sin esto la costura es una bisagra libre: la placa de cada pieza termina en el borde. Cada arista del lado A entre dos vértices cosidos seguidos entra a su triángulo como un borde más, con ala en el triángulo de B que le toca. Su energía es `½·kh·θ²` con `kh = b⊥·ℓ²/(A_T + A_N)`: en una franja curvada a lo ancho, el ángulo entre caras es `θ = κ·(h_T + h_N)/2` y la energía de la franja, `½·b·κ²·(A_T + A_N)`. Como borde de su triángulo, la bisagra entra a toda la maquinaria de la placa (gradiente, H·p, bloques y, en la parte 2, la GPU) sin código nuevo. Queda apagada hasta que la costura cierra.

**Files:**
- Modify: `src/utils/cloth/implicito/costuras.ts` (`bisagrasDeCostura`)
- Modify: `src/utils/cloth/implicito/placa.ts:67-182` (opciones, bisagras de costura y `activarCosturas`)
- Modify: `src/utils/cloth/implicito/prenda.ts` (`bisagrasDePrenda`)
- Modify: `src/utils/cloth/implicito/sistema.ts` (las bisagras en la placa; se activan al cerrar)
- Test: `src/utils/cloth/implicito/__tests__/bisagrasDeCostura.test.ts`

**Interfaces:**
- Consumes: `largosEnElPatron`, `LadosDeCostura`, `Prenda`, `costurasDePrenda` (Tarea 4); `TelaSI`, `telaSI`; `Placa`.
- Produces:
  - `costuras.ts`: `interface BisagraDeCostura { t: number; k: number; d: number; kh: number }` y `bisagrasDeCostura(uv: ArrayLike<number>, tris: ArrayLike<number>, ladoA: readonly number[], ladoB: readonly number[], tela: TelaSI): BisagraDeCostura[]`.
  - `placa.ts`: `interface OpcionesPlaca { costura?: readonly BisagraDeCostura[] }`, `constructor(uv: Float64Array, tris: Uint32Array, tela: TelaSI, op?: OpcionesPlaca)`, `readonly costura: Array<{ o: number; kh: number }>`, `activarCosturas(): void`.
  - `prenda.ts`: `bisagrasDePrenda(prenda: Prenda, lados: readonly LadosDeCostura[], tela: TelaFisica): BisagraDeCostura[]`.
  - `sistema.ts`: `OpcionesSistema.costuras?: { puntos: readonly PuntoDeCostura[]; bisagras?: readonly BisagraDeCostura[] }`.

- [ ] **Step 1: Escribe las pruebas que fallan**

`src/utils/cloth/implicito/__tests__/bisagrasDeCostura.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bisagrasDeCostura, puntosDeCostura } from '../costuras';
import { armarPrenda } from '../prenda';
import { mallaDeContorno, type MallaDeTela } from '../malla';
import { Placa } from '../placa';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { telaSI } from '../tela';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';

const R = 0.05;
const tela = telaSI(TELA_DE_LABORATORIO);

/** El mismo enrollado de placa.test.ts: la lámina sobre un cilindro de radio R, curvada en la dirección `dir` del dibujo. */
function curvar(m: MallaDeTela, dir: readonly [number, number]): Float64Array {
  const x = new Float64Array(m.x.length);
  for (let i = 0; i < m.patron.length / 2; i++) {
    const u = m.patron[2 * i], v = m.patron[2 * i + 1];
    const s = u * dir[0] + v * dir[1], w = -u * dir[1] + v * dir[0];
    const X = R * Math.sin(s / R), Y = R * (1 - Math.cos(s / R));
    x[3 * i] = X * dir[0] - w * dir[1];
    x[3 * i + 1] = Y;
    x[3 * i + 2] = X * dir[1] + w * dir[0];
  }
  return x;
}

function borde(m: MallaDeTela, x0: number, v0 = 0): number[] {
  const n = m.x.length / 3, vs: number[] = [];
  for (let i = 0; i < n; i++) if (Math.abs(m.patron[2 * i] - x0) < 1e-9) vs.push(i);
  return vs.sort((i, j) => m.patron[2 * i + 1] - m.patron[2 * j + 1]).map((i) => i + v0);
}

/** La lámina de 120 × 120 mm de placa.test.ts, cortada al medio (x = 0) en dos piezas cosidas, ya juntas. */
function laminaCosida(arista: number) {
  const izq = mallaDeContorno(rectangulo(-60, -60, 0, 60), arista), der = mallaDeContorno(rectangulo(0, -60, 60, 60), arista);
  const prenda = armarPrenda([{ id: 'i', ...izq }, { id: 'd', ...der }]);
  return { prenda, ladoA: borde(izq, 0), ladoB: borde(der, 0, izq.x.length / 3) };
}

describe('la flexión que cruza la costura', () => {
  it('una bisagra por cada arista cosida de A, con su ala en B y rigidez positiva', () => {
    const { prenda, ladoA, ladoB } = laminaCosida(5);
    const bis = bisagrasDeCostura(prenda.malla.patron, prenda.malla.tris, ladoA, ladoB, tela);
    expect(bis.length).toBe(ladoA.length - 1);
    const enB = new Set<number>();
    for (let i = ladoA.length; i < prenda.malla.x.length / 3; i++) enB.add(i);
    for (const b of bis) {
      expect(enB.has(b.d)).toBe(true);
      expect(b.kh).toBeGreaterThan(0);
    }
  });

  const casos = [
    ['a través de la costura', [1, 0], tela.bTrama],
    ['a lo largo de la costura', [0, 1], tela.bUrdimbre],
  ] as const;
  for (const [nombre, dir, B] of casos) {
    it(`lámina cosida curvada ${nombre}, malla de 5 mm: entre 0,85 y 1,05 de la energía exacta`, () => {
      const { prenda, ladoA, ladoB } = laminaCosida(5);
      const placa = new Placa(prenda.malla.patron, prenda.malla.tris, tela, {
        costura: bisagrasDeCostura(prenda.malla.patron, prenda.malla.tris, ladoA, ladoB, tela),
      });
      const x = curvar(prenda.malla, dir), exacta = 0.5 * B * (1 / R) ** 2 * 0.12 * 0.12;
      const sinCoser = placa.energia(x) / exacta;
      placa.activarCosturas();
      const cosida = placa.energia(x) / exacta;
      expect(cosida).toBeGreaterThan(0.85);
      expect(cosida).toBeLessThan(1.05);
      // a través de la costura, sin la bisagra falta la energía de la franja de la orilla
      if (dir[0] === 1) expect(cosida).toBeGreaterThan(sinCoser);
    });
  }

  it('en la prenda, las bisagras se encienden cuando la costura cierra', () => {
    const izq = mallaDeContorno(rectangulo(0, 0, 100, 60), 10), der = mallaDeContorno(rectangulo(0, 0, 100, 60), 10);
    const prenda = armarPrenda([
      { id: 'i', ...izq },
      { id: 'd', ...der, x: Float64Array.from(der.x, (q, k) => (k % 3 === 0 ? q + 0.13 : q)) },
    ]);
    const ladoA = borde(izq, 0.1), ladoB = borde(der, 0, izq.x.length / 3);
    const bisagras = bisagrasDeCostura(prenda.malla.patron, prenda.malla.tris, ladoA, ladoB, tela);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, {
      costuras: { puntos: puntosDeCostura(prenda.malla.patron, ladoA, ladoB), bisagras },
      ajustes: { gravedad: 0 },
    });
    expect(s.placa.costura.every((c) => s.placa.K[c.o] === 0)).toBe(true);
    for (let c = 0; c < 60 && !s.costuras.cerradas(); c++) pasoImplicito(s);
    expect(s.costuras.cerradas()).toBe(true);
    expect(s.placa.costura.length).toBe(bisagras.length);
    expect(s.placa.costura.every((c) => s.placa.K[c.o] === c.kh)).toBe(true);
  });
});
```

- [ ] **Step 2: Corre las pruebas y mira que fallen**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/bisagrasDeCostura.test.ts`
Expected: FAIL, no existe `bisagrasDeCostura`.

- [ ] **Step 3: Las bisagras de una costura**

En `src/utils/cloth/implicito/costuras.ts`, agrega `import type { TelaSI } from './tela';` y al final:

```ts
/** Una bisagra que cruza la costura (E2): el borde k del triángulo t, del lado A, con su ala d en la otra pieza. */
export interface BisagraDeCostura {
  t: number;
  k: number;
  d: number;
  /** rigidez (N·m): E = ½·kh·θ² */
  kh: number;
}

/**
 * La rigidez a la flexión de la placa (§4.1.5) cuando la curvatura cruza el segmento p→q del patrón, en el
 * marco del hilo de su pieza: para la dirección δ ⟂ al segmento, b = δu⁴·bTrama + 4·D66·δu²·δv² + δv⁴·bUrdimbre.
 */
function rigidezQueCruza(uv: ArrayLike<number>, p: number, q: number, tela: TelaSI): number {
  const tu = uv[2 * q] - uv[2 * p], tv = uv[2 * q + 1] - uv[2 * p + 1], l = Math.hypot(tu, tv);
  const du = -tv / l, dv = tu / l;
  const D66 = Math.max(1e-3 * Math.min(tela.bTrama, tela.bUrdimbre), tela.bBies - (tela.bTrama + tela.bUrdimbre) / 4);
  return du ** 4 * tela.bTrama + 4 * D66 * du * du * dv * dv + dv ** 4 * tela.bUrdimbre;
}

/**
 * Las bisagras de una costura: por cada borde de A entre dos vértices cosidos seguidos, el triángulo de A que
 * lo tiene y, como ala, el vértice opuesto del triángulo de B en el segmento que cae a la mitad del borde. La
 * rigidez es la de una franja curvada a lo ancho, kh = b⊥·ℓ²/(A_T + A_N), con b⊥ el promedio de los dos lados.
 * Un borde que no es libre en su pieza (no debería pasar) no lleva bisagra.
 */
export function bisagrasDeCostura(
  uv: ArrayLike<number>,
  tris: ArrayLike<number>,
  ladoA: readonly number[],
  ladoB: readonly number[],
  tela: TelaSI,
): BisagraDeCostura[] {
  if (ladoA.length < 2 || ladoB.length < 2) return [];
  const nt = tris.length / 3, n = uv.length / 2;
  const clave = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  const deBorde = new Map<number, Array<[number, number]>>();
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const key = clave(tris[3 * t + k], tris[3 * t + ((k + 1) % 3)]);
      const lista = deBorde.get(key);
      if (lista) lista.push([t, k]);
      else deBorde.set(key, [[t, k]]);
    }
  }
  const libre = (a: number, b: number) => {
    const lista = deBorde.get(clave(a, b));
    return lista && lista.length === 1 ? lista[0] : null;
  };
  const tercero = (t: number, a: number, b: number) => {
    for (let k = 0; k < 3; k++) {
      const v = tris[3 * t + k];
      if (v !== a && v !== b) return v;
    }
    return -1;
  };
  const area = (t: number) => {
    const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
    return 0.5 * Math.abs((uv[2 * b] - uv[2 * a]) * (uv[2 * c + 1] - uv[2 * a + 1]) - (uv[2 * c] - uv[2 * a]) * (uv[2 * b + 1] - uv[2 * a + 1]));
  };
  const tA = largosEnElPatron(uv, ladoA), tB = largosEnElPatron(uv, ladoB);
  const bisagras: BisagraDeCostura[] = [];
  for (let i = 0; i + 1 < ladoA.length; i++) {
    const a0 = ladoA[i], a1 = ladoA[i + 1], deA = libre(a0, a1);
    if (!deA) continue;
    const medio = (tA[i] + tA[i + 1]) / 2;
    let j = 0;
    while (j < ladoB.length - 2 && tB[j + 1] < medio) j++;
    const b0 = ladoB[j], b1 = ladoB[j + 1], deB = libre(b0, b1);
    if (!deB) continue;
    const d = tercero(deB[0], b0, b1);
    if (d < 0 || d === a0 || d === a1) continue;
    const bPerp = 0.5 * (rigidezQueCruza(uv, a0, a1, tela) + rigidezQueCruza(uv, b0, b1, tela));
    const l = Math.hypot(uv[2 * a1] - uv[2 * a0], uv[2 * a1 + 1] - uv[2 * a0 + 1]);
    bisagras.push({ t: deA[0], k: deA[1], d, kh: (bPerp * l * l) / (area(deA[0]) + area(deB[0])) });
  }
  return bisagras;
}
```

- [ ] **Step 4: Las bisagras de costura en la placa**

En `src/utils/cloth/implicito/placa.ts`:
- Import: `import type { BisagraDeCostura } from './costuras';`.
- Antes de `export class Placa`:

```ts
export interface OpcionesPlaca {
  /** bisagras que cruzan las costuras (E2): entran como un borde más de su triángulo, apagadas hasta coser */
  costura?: readonly BisagraDeCostura[];
}
```

- En la clase, después de `readonly nh: number;`:

```ts
  /** por bisagra de costura: dónde va su rigidez en K (el término diagonal de su borde) y cuánto vale al coser */
  readonly costura: Array<{ o: number; kh: number }>;
```

- La firma del constructor pasa a `constructor(uv: Float64Array, readonly tris: Uint32Array, tela: TelaSI, op: OpcionesPlaca = {}) {`.
- Justo antes de `this.bisagras = Uint32Array.from(bis);`:

```ts
    // las bisagras de costura van después de las de adentro, con a→b en el sentido del triángulo que tiene el ala c
    const deCostura: Array<{ t: number; k: number; h: number; kh: number }> = [];
    for (const c of op.costura ?? []) {
      const a = tris[3 * c.t + c.k], b = tris[3 * c.t + ((c.k + 1) % 3)];
      deCostura.push({ t: c.t, k: c.k, h: bis.length / 4, kh: c.kh });
      bis.push(a, b, tercero(c.t, a, b), c.d);
    }
```

- Al final del constructor, después del bucle que llena `this.K`:

```ts
    this.costura = [];
    for (const c of deCostura) {
      if (this.bisDeTri[3 * c.t + c.k] >= 0) continue; // el borde no era libre: queda su bisagra de adentro
      this.bisDeTri[3 * c.t + c.k] = c.h;
      this.costura.push({ o: 9 * c.t + 4 * c.k, kh: c.kh });
    }
```

- Después del constructor:

```ts
  /** Enciende las bisagras de costura: desde aquí, la flexión cruza la costura. */
  activarCosturas(): void {
    for (const c of this.costura) this.K[c.o] = c.kh;
  }
```

- [ ] **Step 5: Las bisagras de la prenda y en el sistema**

En `src/utils/cloth/implicito/prenda.ts`: el import de costuras pasa a `import { bisagrasDeCostura, puntosDeCostura, type BisagraDeCostura, type PuntoDeCostura } from './costuras';`, agrega `import { telaSI, type TelaFisica } from './tela';`, y al final:

```ts
/** Las bisagras que cruzan las costuras de la prenda (E2), sobre el dibujo de cada pieza en el marco de su hilo. */
export function bisagrasDePrenda(prenda: Prenda, lados: readonly LadosDeCostura[], tela: TelaFisica): BisagraDeCostura[] {
  const si = telaSI(tela);
  return lados.flatMap((l) => bisagrasDeCostura(prenda.malla.patron, prenda.malla.tris, l.a, l.b, si));
}
```

En `src/utils/cloth/implicito/sistema.ts`:
- El import pasa a `import { Costuras, type BisagraDeCostura, type PuntoDeCostura } from './costuras';`.
- `OpcionesSistema.costuras` pasa a `costuras?: { puntos: readonly PuntoDeCostura[]; bisagras?: readonly BisagraDeCostura[] };`.
- `this.placa = new Placa(uv, malla.tris, this.tela);` pasa a `this.placa = new Placa(uv, malla.tris, this.tela, { costura: op.costuras?.bisagras });`.
- En la clase, después de `readonly costuras: Costuras;`: `/** la flexión cruza las costuras desde que cierran */` y `private cosida = false;`.
- `alTerminarCuadro` pasa a:

```ts
  /** Lo que pasa entre un cuadro y el siguiente: las costuras se cierran un cuadro más, y al cerrar, la flexión las cruza. */
  alTerminarCuadro(): void {
    this.costuras.avanzarCierre();
    if (!this.cosida && this.costuras.n > 0 && this.costuras.cerradas()) {
      this.placa.activarCosturas();
      this.cosida = true;
    }
  }
```

- [ ] **Step 6: Corre las pruebas y mira que pasen**

Run: `npx vitest run src/utils/cloth/implicito/`
Expected: PASS. Si una razón de energía cae fuera de [0,85; 1,05], para y repórtala con las dos razones (sin coser y cosida) y las de 10 mm: el factor de `kh` sale de la derivación del encabezado de la tarea, no se ajusta a mano.

- [ ] **Step 7: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/costuras.ts src/utils/cloth/implicito/placa.ts src/utils/cloth/implicito/prenda.ts src/utils/cloth/implicito/sistema.ts src/utils/cloth/implicito/__tests__/bisagrasDeCostura.test.ts
git commit -m "feat(tela): la flexión cruza la costura con una bisagra por arista cosida, encendida al cerrar"
```

### Tarea 6: El margen de costura

Una franja de ancho real a lo largo de cada borde cosido, medida en el patrón: el margen de la pieza, o 10 mm. Sus triángulos llevan la masa de sus dos capas y más flexión. Reemplaza, en el motor nuevo, a la banda de dos anillos de malla de hoy (`prepararTela.ts`, F3), que cambiaba de ancho con la malla.

**Files:**
- Create: `src/utils/cloth/implicito/margen.ts`
- Modify: `src/utils/cloth/implicito/reposo.ts` (factor de masa por triángulo)
- Modify: `src/utils/cloth/implicito/placa.ts` (factor de flexión por triángulo)
- Modify: `src/utils/cloth/implicito/prenda.ts` (`franjaDePrenda`)
- Modify: `src/utils/cloth/implicito/sistema.ts` (la franja entra a la masa y a la placa)
- Test: `src/utils/cloth/implicito/__tests__/margen.test.ts`

**Interfaces:**
- Consumes: `LadosDeCostura`, `Prenda.piezas[].margenMm` (Tareas 3 y 4); `prepararReposo`; `Placa`, `OpcionesPlaca`.
- Produces:
  - `margen.ts`: `MARGEN_POR_DEFECTO_MM = 10`, `CAPAS_DEL_MARGEN = 2`, `FLEXION_DEL_MARGEN = 3`, `franjaDelMargen(patron: ArrayLike<number>, tris: ArrayLike<number>, piezaDeTri: ArrayLike<number>, bordes: ReadonlyArray<readonly [number, number]>, anchoDePieza: ArrayLike<number>): Uint8Array`.
  - `reposo.ts`: `prepararReposo(uv, tris, densidad, piezaDeTri?, factorDeMasa?: ArrayLike<number>)`.
  - `placa.ts`: `OpcionesPlaca.factor?: ArrayLike<number>`.
  - `prenda.ts`: `franjaDePrenda(prenda: Prenda, lados: readonly LadosDeCostura[]): Uint8Array`.
  - `sistema.ts`: `AjustesImplicito.capasDelMargen` (2) y `AjustesImplicito.flexionDelMargen` (3); `OpcionesSistema.franja?: Uint8Array`.

- [ ] **Step 1: Escribe las pruebas que fallan**

`src/utils/cloth/implicito/__tests__/margen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { franjaDelMargen, MARGEN_POR_DEFECTO_MM } from '../margen';
import { armarPrenda, franjaDePrenda } from '../prenda';
import { aMarcoDelHilo, mallaDeContorno, type MallaDeTela } from '../malla';
import { prepararReposo } from '../reposo';
import { Placa } from '../placa';
import { telaSI } from '../tela';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';

function borde(m: MallaDeTela, x0: number, v0 = 0): number[] {
  const n = m.x.length / 3, vs: number[] = [];
  for (let i = 0; i < n; i++) if (Math.abs(m.patron[2 * i] - x0) < 1e-9) vs.push(i);
  return vs.sort((i, j) => m.patron[2 * i + 1] - m.patron[2 * j + 1]).map((i) => i + v0);
}

const segmentos = (lado: number[]) => lado.slice(1).map((v, k) => [lado[k], v] as [number, number]);

function centroX(m: { patron: ArrayLike<number>; tris: ArrayLike<number> }, t: number): number {
  return (m.patron[2 * m.tris[3 * t]] + m.patron[2 * m.tris[3 * t + 1]] + m.patron[2 * m.tris[3 * t + 2]]) / 3;
}

/** Un cuadrado de 100 mm a 5 mm con su borde x = 100 mm cosido y un margen de 10 mm. */
function cuadradoConFranja() {
  const m = mallaDeContorno(rectangulo(0, 0, 100, 100), 5);
  const franja = franjaDelMargen(m.patron, m.tris, new Uint16Array(m.tris.length / 3), segmentos(borde(m, 0.1)), [0.01]);
  return { m, franja };
}

describe('el margen de costura', () => {
  it('la franja son los triángulos con el centro a menos del margen del borde cosido', () => {
    const { m, franja } = cuadradoConFranja();
    let enFranja = 0;
    for (let t = 0; t < m.tris.length / 3; t++) {
      const d = 0.1 - centroX(m, t);
      if (d < 0.0099) expect(franja[t], `triángulo ${t} a ${d} m`).toBe(1);
      if (d > 0.0101) expect(franja[t], `triángulo ${t} a ${d} m`).toBe(0);
      enFranja += franja[t];
    }
    expect(enFranja).toBeGreaterThan(20);
  });

  it('la franja lleva la masa de sus capas', () => {
    const { m, franja } = cuadradoConFranja();
    const uv = aMarcoDelHilo(m.patron);
    const sin = prepararReposo(uv, m.tris, 0.2), con = prepararReposo(uv, m.tris, 0.2, undefined, Float64Array.from(franja, (f) => (f ? 2 : 1)));
    let areaDeLaFranja = 0;
    for (let t = 0; t < m.tris.length / 3; t++) if (franja[t]) areaDeLaFranja += sin.coef[7 * t + 6];
    const total = (r: { masa: Float64Array }) => r.masa.reduce((s, q) => s + q, 0);
    expect(total(con) - total(sin)).toBeCloseTo(0.2 * areaDeLaFranja, 12);
  });

  it('la flexión de la franja se multiplica, triángulo por triángulo', () => {
    const { m, franja } = cuadradoConFranja();
    const uv = aMarcoDelHilo(m.patron), tela = telaSI(TELA_DE_LABORATORIO);
    const uno = new Placa(uv, m.tris, tela), tres = new Placa(uv, m.tris, tela, { factor: Float64Array.from(franja, (f) => (f ? 3 : 1)) });
    for (let t = 0; t < m.tris.length / 3; t++) {
      for (let j = 0; j < 9; j++) expect(tres.K[9 * t + j]).toBeCloseTo((franja[t] ? 3 : 1) * uno.K[9 * t + j], 15);
    }
  });

  it('en la prenda, cada pieza con su margen, o el de por defecto', () => {
    const A = mallaDeContorno(rectangulo(0, 0, 100, 60), 5), B = mallaDeContorno(rectangulo(0, 0, 100, 60), 5);
    const prenda = armarPrenda([
      { id: 'A', ...A, margenMm: 15 },
      { id: 'B', ...B, x: Float64Array.from(B.x, (q, k) => (k % 3 === 0 ? q + 0.1 : q)) },
    ]);
    const nA = A.x.length / 3, tA = A.tris.length / 3;
    const franja = franjaDePrenda(prenda, [{ a: borde(A, 0.1), b: borde(B, 0, nA) }]);
    let lejosEnA = 0;
    for (let t = 0; t < prenda.malla.tris.length / 3; t++) {
      if (!franja[t]) continue;
      // en el dibujo de cada pieza, la distancia a su borde cosido: x = 100 mm en A, x = 0 en B
      const d = t < tA ? 0.1 - centroX(prenda.malla, t) : centroX(prenda.malla, t);
      expect(d).toBeLessThan(t < tA ? 0.015 : MARGEN_POR_DEFECTO_MM / 1000);
      if (t < tA && d > 0.0105) lejosEnA++;
    }
    expect(lejosEnA).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Corre las pruebas y mira que fallen**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/margen.test.ts`
Expected: FAIL, no existe `../margen`.

- [ ] **Step 3: La franja**

`src/utils/cloth/implicito/margen.ts`:

```ts
/**
 * El margen de costura (spec 2026-10-13 §4.3.3): una franja a lo largo de cada borde cosido, del ancho del
 * margen de la pieza (o 10 mm), con la masa de sus capas y más flexión. Se mide en el patrón, en metros: la
 * misma franja con cualquier malla, en vez de los dos anillos de malla de la banda de hoy (prepararTela.ts, F3).
 */

/** Ancho del margen (mm) de una pieza que no trae el suyo (§4.3.3). */
export const MARGEN_POR_DEFECTO_MM = 10;

/** Capas de la franja: la tela y su margen doblado debajo (§4.3.3, «más masa, por capas»). */
export const CAPAS_DEL_MARGEN = 2;

/**
 * ponytail: la flexión de la franja es la de hoy, ×3 (la banda F3 de prepararTela.ts), sin medir. Se calibra
 * con prendas reales (subproyecto 2 del programa); el banco de la camiseta la corre también con 1.
 */
export const FLEXION_DEL_MARGEN = 3;

function distanciaASegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const ux = bx - ax, uy = by - ay, l2 = ux * ux + uy * uy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ux + (py - ay) * uy) / l2)) : 0;
  return Math.hypot(px - ax - t * ux, py - ay - t * uy);
}

/**
 * Los triángulos de la franja: los que tienen el centro, en el patrón, a menos del ancho de su pieza (m) de un
 * borde cosido de esa misma pieza. `bordes` son segmentos entre dos vértices cosidos seguidos.
 */
export function franjaDelMargen(
  patron: ArrayLike<number>,
  tris: ArrayLike<number>,
  piezaDeTri: ArrayLike<number>,
  bordes: ReadonlyArray<readonly [number, number]>,
  anchoDePieza: ArrayLike<number>,
): Uint8Array {
  const nt = tris.length / 3;
  const piezaDe = new Map<number, number>();
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) piezaDe.set(tris[3 * t + k], piezaDeTri[t]);
  const porPieza = new Map<number, Array<readonly [number, number]>>();
  for (const [p, q] of bordes) {
    const k = piezaDe.get(p);
    if (k === undefined || piezaDe.get(q) !== k) continue;
    const lista = porPieza.get(k) ?? [];
    lista.push([p, q]);
    porPieza.set(k, lista);
  }
  const franja = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    const lista = porPieza.get(piezaDeTri[t]);
    if (!lista) continue;
    const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
    const cx = (patron[2 * a] + patron[2 * b] + patron[2 * c]) / 3, cy = (patron[2 * a + 1] + patron[2 * b + 1] + patron[2 * c + 1]) / 3;
    const ancho = anchoDePieza[piezaDeTri[t]];
    for (const [p, q] of lista) {
      if (distanciaASegmento(cx, cy, patron[2 * p], patron[2 * p + 1], patron[2 * q], patron[2 * q + 1]) < ancho) {
        franja[t] = 1;
        break;
      }
    }
  }
  return franja;
}
```

- [ ] **Step 4: La masa y la flexión por triángulo**

En `src/utils/cloth/implicito/reposo.ts`: la firma pasa a `export function prepararReposo(uv: Float64Array, tris: Uint32Array, densidad: number, piezaDeTri?: ArrayLike<number>, factorDeMasa?: ArrayLike<number>): Reposo {`, y las tres líneas `masa[iX] += (densidad * A0) / 3;` pasan a usar `const m = (densidad * A0 * (factorDeMasa ? factorDeMasa[t] : 1)) / 3;` (declarada justo antes) y `masa[i0] += m; masa[i1] += m; masa[i2] += m;`. Agrega al JSDoc de `prepararReposo`: «`factorDeMasa`: capas de cada triángulo (el margen, margen.ts); 1 por defecto.»

En `src/utils/cloth/implicito/placa.ts`:
- En `OpcionesPlaca`, después de `costura?`: `/** factor de la flexión de cada triángulo (el margen, margen.ts); 1 por defecto */` y `factor?: ArrayLike<number>;`.
- En el bucle que llena `this.K`, la línea `for (let c = 0; c < filas.length; c++) this.K[9 * t + 3 * cuales[r] + cuales[c]] = A0[t] * Mi[r][c];` pasa a usar el factor: declara `const f = op.factor ? op.factor[t] : 1;` justo antes del `for (let r…` y la asignación queda `= f * A0[t] * Mi[r][c];`.
- En el bucle de `deCostura` (Tarea 5), `kh: c.kh` pasa a `kh: c.kh * (op.factor ? op.factor[c.t] : 1)`.

- [ ] **Step 5: La franja de la prenda y en el sistema**

En `src/utils/cloth/implicito/prenda.ts`, agrega `import { franjaDelMargen, MARGEN_POR_DEFECTO_MM } from './margen';` y al final:

```ts
/**
 * La franja del margen de la prenda (margen.ts): los segmentos de cada lado cosido, con el margen de cada
 * pieza, o el de por defecto si la pieza no trae uno mayor que 0.
 */
export function franjaDePrenda(prenda: Prenda, lados: readonly LadosDeCostura[]): Uint8Array {
  const bordes: Array<[number, number]> = [];
  for (const l of lados) for (const lado of [l.a, l.b]) for (let k = 1; k < lado.length; k++) bordes.push([lado[k - 1], lado[k]]);
  const ancho = prenda.piezas.map((p) => (p.margenMm !== undefined && p.margenMm > 0 ? p.margenMm : MARGEN_POR_DEFECTO_MM) / 1000);
  const piezaDeTri = prenda.malla.piezaDeTri ?? new Uint16Array(prenda.malla.tris.length / 3);
  return franjaDelMargen(prenda.malla.patron, prenda.malla.tris, piezaDeTri, bordes, ancho);
}
```

En `src/utils/cloth/implicito/sistema.ts`:
- Import: `import { CAPAS_DEL_MARGEN, FLEXION_DEL_MARGEN } from './margen';`.
- En `AjustesImplicito`, después de `kCostura`: `/** capas de la franja del margen: multiplica su masa (margen.ts) */`, `capasDelMargen: number;`, `/** multiplica la flexión de la franja del margen (margen.ts) */`, `flexionDelMargen: number;`.
- En `AJUSTES_IMPLICITO`, después de `kCostura: 1000,`: `capasDelMargen: CAPAS_DEL_MARGEN,` y `flexionDelMargen: FLEXION_DEL_MARGEN,`.
- En `OpcionesSistema`, después de `costuras?`: `/** 1 = el triángulo está en la franja del margen (prenda.ts, franjaDePrenda) */` y `franja?: Uint8Array;`.
- En el constructor, las líneas del reposo y de la placa pasan a:

```ts
    const franja = op.franja;
    const capas = franja ? Float64Array.from(franja, (f) => (f ? this.aj.capasDelMargen : 1)) : undefined;
    const flexion = franja ? Float64Array.from(franja, (f) => (f ? this.aj.flexionDelMargen : 1)) : undefined;
    const reposo = prepararReposo(uv, malla.tris, this.tela.densidad, malla.piezaDeTri, capas);
```

y `this.placa = new Placa(uv, malla.tris, this.tela, { costura: op.costuras?.bisagras, factor: flexion });`.

- [ ] **Step 6: Corre las pruebas y mira que pasen**

Run: `npx vitest run src/utils/cloth/implicito/`
Expected: PASS.

- [ ] **Step 7: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/margen.ts src/utils/cloth/implicito/reposo.ts src/utils/cloth/implicito/placa.ts src/utils/cloth/implicito/prenda.ts src/utils/cloth/implicito/sistema.ts src/utils/cloth/implicito/__tests__/margen.test.ts
git commit -m "feat(tela): el margen de costura, una franja de ancho real con la masa de sus capas y más flexión"
```

### Tarea 7: El cuerpo, con su BVH, en la CPU

El cuerpo es la malla del avatar con el `LinearBVH` que ya arma #1248 (el mismo que sube la GPU). Hoy no hay recorrido del BVH en la CPU: solo el constructor. Esta tarea lo recorre con los punteros de escape (`skip`), da el punto más cercano con la característica donde cae (cara, arista o vértice) y decide el lado con la pseudonormal de esa característica, como `tslCollision.ts`. La normal del plano de contacto va del punto más cercano hacia el vértice, así es continua al pasar de una cara a otra.

**Files:**
- Create: `src/utils/cloth/implicito/cuerpo.ts`
- Modify: `src/utils/cloth/implicito/obstaculos.ts` (el obstáculo `cuerpo` y el radio de búsqueda)
- Modify: `src/utils/cloth/implicito/gpu/wgsl.ts:74-96` (se niega a escribir un cuerpo: llega en la parte 2)
- Modify: `src/utils/cloth/implicito/banco/escenas.ts` (esfera, plano y pirámide como mallas de cuerpo)
- Test: `src/utils/cloth/implicito/__tests__/cuerpo.test.ts`

**Interfaces:**
- Consumes: `buildLinearBVH(mesh: CollisionMeshData): LinearBVH` (`src/utils/cloth/gpu/bvh.ts`); `CollisionMeshData` (`src/utils/cloth/collisionMesh.ts`).
- Produces:
  - `cuerpo.ts`: `interface PuntoEnTriangulo { x; y; z; wa; wb; wc; rasgo }` (rasgo: 0 cara; 1, 2, 3 aristas AB, BC, CA; 4, 5, 6 vértices A, B, C), `puntoMasCercano(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out: PuntoEnTriangulo): PuntoEnTriangulo`, `interface Cercano { d; nx; ny; nz; cx; cy; cz }`, `class CuerpoRigido { constructor(bvh: LinearBVH); readonly vertices: Float64Array; readonly normales: Float64Array; cercano(px, py, pz, radio?): Cercano | null }`.
  - `obstaculos.ts`: `Obstaculo` gana `{ tipo: 'cuerpo'; cuerpo: CuerpoRigido }`; `RADIO_DE_BUSQUEDA = 0.05`; `distancia(o, x, y, z, radio?)` y `masCercano(obs, x, y, z, radio?)`.
  - `banco/escenas.ts`: `esferaDeColision(radio: number, subdivisiones: number): CollisionMeshData`, `planoDeColision(normal: readonly [number, number, number], lado: number): CollisionMeshData`, `piramideDeColision(base: number, altura: number): CollisionMeshData`.

- [ ] **Step 1: Escribe las pruebas que fallan**

`src/utils/cloth/implicito/__tests__/cuerpo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { CuerpoRigido, puntoMasCercano, type PuntoEnTriangulo } from '../cuerpo';
import { distancia } from '../obstaculos';
import { esferaDeColision } from '../banco/escenas';
import { azar } from './ayudas';

const R = 0.1;
const malla = esferaDeColision(R, 4);
const cuerpo = new CuerpoRigido(buildLinearBVH(malla));

/** Un punto al azar a una distancia entre −2 y +5 cm de la esfera. */
function puntos(semilla: number, cuantos: number): Array<[number, number, number]> {
  const r = azar(semilla);
  return Array.from({ length: cuantos }, () => {
    const d = [r(), r(), r()], l = Math.hypot(d[0], d[1], d[2]), rho = R - 0.02 + 0.07 * (r() + 0.5);
    return [(rho * d[0]) / l, (rho * d[1]) / l, (rho * d[2]) / l];
  });
}

describe('el cuerpo rígido', () => {
  it('sobre la esfera: la distancia con signo, la normal hacia afuera y el punto', () => {
    for (const [x, y, z] of puntos(51, 200)) {
      const c = cuerpo.cercano(x, y, z)!;
      const rho = Math.hypot(x, y, z);
      // las caras de la esfera de 5120 triángulos quedan a menos de 0,1 mm de la esfera exacta
      expect(Math.abs(c.d - (rho - R))).toBeLessThan(5e-4);
      expect((c.nx * x + c.ny * y + c.nz * z) / rho).toBeGreaterThan(0.99);
      expect(Math.hypot(x - c.cx, y - c.cy, z - c.cz)).toBeCloseTo(Math.abs(c.d), 12);
    }
  });

  it('da lo mismo que mirar todos los triángulos', () => {
    const p: PuntoEnTriangulo = { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 };
    const v = malla.vertices;
    for (const [x, y, z] of puntos(53, 60)) {
      let mejor = Infinity;
      for (let t = 0; t < malla.triCount; t++) {
        const o = 9 * t;
        puntoMasCercano(x, y, z, v[o], v[o + 1], v[o + 2], v[o + 3], v[o + 4], v[o + 5], v[o + 6], v[o + 7], v[o + 8], p);
        mejor = Math.min(mejor, Math.hypot(x - p.x, y - p.y, z - p.z));
      }
      expect(Math.abs(cuerpo.cercano(x, y, z)!.d)).toBeCloseTo(mejor, 12);
    }
  });

  it('el punto más cercano: cara, aristas y vértices, con sus pesos', () => {
    const p: PuntoEnTriangulo = { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 };
    const tri = [0, 0, 0, 1, 0, 0, 0, 1, 0] as const;
    const casos: Array<[[number, number, number], number, [number, number, number]]> = [
      [[0.25, 0.25, 1], 0, [0.25, 0.25, 0]],
      [[0.5, -1, 0], 1, [0.5, 0, 0]],
      [[1, 1, 0], 2, [0.5, 0.5, 0]],
      [[-1, 0.5, 0], 3, [0, 0.5, 0]],
      [[-1, -1, 0], 4, [0, 0, 0]],
      [[2, -1, 0], 5, [1, 0, 0]],
      [[-1, 2, 0], 6, [0, 1, 0]],
    ];
    for (const [q, rasgo, esperado] of casos) {
      puntoMasCercano(q[0], q[1], q[2], ...tri, p);
      expect(p.rasgo).toBe(rasgo);
      expect([p.x, p.y, p.z].map((v) => Math.round(v * 1e9) / 1e9)).toEqual(esperado);
      expect(p.wa * tri[0] + p.wb * tri[3] + p.wc * tri[6]).toBeCloseTo(p.x, 12);
      expect(p.wa + p.wb + p.wc).toBeCloseTo(1, 12);
    }
  });

  it('más lejos que el radio, no hay cuerpo', () => {
    expect(cuerpo.cercano(0, 0.4, 0, 0.05)).toBeNull();
    expect(cuerpo.cercano(0, 0.12, 0, 0.05)).not.toBeNull();
  });

  it('los vértices del cuerpo sin repetir, con su normal', () => {
    expect(cuerpo.vertices.length / 3).toBe(2562);
    for (let i = 0; i < cuerpo.vertices.length / 3; i++) {
      const x = cuerpo.vertices[3 * i], y = cuerpo.vertices[3 * i + 1], z = cuerpo.vertices[3 * i + 2];
      const n = cuerpo.normales;
      expect((n[3 * i] * x + n[3 * i + 1] * y + n[3 * i + 2] * z) / Math.hypot(x, y, z)).toBeGreaterThan(0.999);
    }
  });

  it('el obstáculo cuerpo mide lo mismo que el cuerpo', () => {
    const c = distancia({ tipo: 'cuerpo', cuerpo }, 0, 0.13, 0);
    expect(c.d).toBeCloseTo(cuerpo.cercano(0, 0.13, 0)!.d, 15);
    expect(distancia({ tipo: 'cuerpo', cuerpo }, 0, 0.4, 0, 0.05).d).toBe(Infinity);
  });
});
```

- [ ] **Step 2: Corre las pruebas y mira que fallen**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/cuerpo.test.ts`
Expected: FAIL, no existe `../cuerpo`.

- [ ] **Step 3: Las mallas de cuerpo de las escenas**

En `src/utils/cloth/implicito/banco/escenas.ts`, agrega `import type { CollisionMeshData } from '../../collisionMesh';` y al final:

```ts
type V3 = [number, number, number];
const resta = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unitario = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Una malla de cuerpo: triángulos sueltos y la normal unitaria de cada cara, vuelta hacia `afuera(centro de la cara)`. */
function mallaDeCuerpo(v: V3[], caras: number[][], afuera: (centro: V3) => V3): CollisionMeshData {
  const vertices = new Float32Array(9 * caras.length), normals = new Float32Array(3 * caras.length);
  caras.forEach((cara, k) => {
    let [a, b, c] = cara.map((i) => v[i]);
    let n = cruz(resta(b, a), resta(c, a));
    const centro: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (punto(n, afuera(centro)) < 0) {
      [b, c] = [c, b];
      n = [-n[0], -n[1], -n[2]];
    }
    [a, b, c].forEach((p, j) => p.forEach((q, d) => (vertices[9 * k + 3 * j + d] = q)));
    const u = unitario(n);
    for (let d = 0; d < 3; d++) normals[3 * k + d] = u[d];
  });
  return { vertices, normals, triCount: caras.length };
}

/** Esfera de `radio` (m) centrada en el origen: un icosaedro subdividido `subdivisiones` veces. */
export function esferaDeColision(radio: number, subdivisiones: number): CollisionMeshData {
  const t = (1 + Math.sqrt(5)) / 2;
  const v: V3[] = ([
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ] as V3[]).map(unitario);
  let caras = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < subdivisiones; s++) {
    const medios = new Map<number, number>();
    const medio = (a: number, b: number) => {
      const clave = a < b ? a * 1e6 + b : b * 1e6 + a;
      let i = medios.get(clave);
      if (i === undefined) {
        i = v.length;
        v.push(unitario([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]));
        medios.set(clave, i);
      }
      return i;
    };
    caras = caras.flatMap(([a, b, c]) => {
      const ab = medio(a, b), bc = medio(b, c), ca = medio(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  return mallaDeCuerpo(v.map((p) => [p[0] * radio, p[1] * radio, p[2] * radio] as V3), caras, (c) => c);
}

/** Un cuadrado de `lado` (m) centrado en el origen, perpendicular a `normal` y con la cara hacia ella. */
export function planoDeColision(normal: readonly [number, number, number], lado: number): CollisionMeshData {
  const n = unitario([normal[0], normal[1], normal[2]]);
  const ref: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = unitario(resta(ref, [n[0] * punto(ref, n), n[1] * punto(ref, n), n[2] * punto(ref, n)]));
  const e2 = cruz(n, e1), h = lado / 2;
  const v = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([a, b]): V3 => [a * e1[0] + b * e2[0], a * e1[1] + b * e2[1], a * e1[2] + b * e2[2]]);
  return mallaDeCuerpo(v, [[0, 1, 2], [0, 2, 3]], () => n);
}

/** Pirámide de base cuadrada de `base` (m) sobre y = 0, con la punta en (0, altura, 0). */
export function piramideDeColision(base: number, altura: number): CollisionMeshData {
  const h = base / 2;
  const v: V3[] = [[-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h], [0, altura, 0]];
  const centro: V3 = [0, altura / 4, 0];
  return mallaDeCuerpo(v, [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [0, 1, 2], [0, 2, 3]], (c) => resta(c, centro));
}
```

- [ ] **Step 4: El cuerpo rígido**

`src/utils/cloth/implicito/cuerpo.ts`:

```ts
/**
 * El cuerpo rígido del motor implícito (spec 2026-10-13 §4.3.1): la malla del avatar con su BVH (el
 * `LinearBVH` de #1248, el mismo que sube la GPU), recorrido con sus punteros de escape. Da el punto más cercano,
 * la distancia con signo (el lado lo decide la pseudonormal de la cara, la arista o el vértice donde cae el
 * punto, como tslCollision.ts) y la normal del plano de contacto: del punto más cercano hacia el vértice, que es
 * continua al pasar de una cara a otra.
 */
import type { LinearBVH } from '../gpu/bvh';

/** El punto de un triángulo más cercano a otro, sus pesos y la característica: 0 cara; 1, 2, 3 aristas AB, BC, CA; 4, 5, 6 vértices A, B, C. */
export interface PuntoEnTriangulo {
  x: number;
  y: number;
  z: number;
  wa: number;
  wb: number;
  wc: number;
  rasgo: number;
}

/** El punto del triángulo abc más cercano a p (Ericson, «Real-Time Collision Detection», §5.1.5), en `out`. */
export function puntoMasCercano(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  out: PuntoEnTriangulo,
): PuntoEnTriangulo {
  const poner = (wa: number, wb: number, wc: number, rasgo: number) => {
    out.wa = wa;
    out.wb = wb;
    out.wc = wc;
    out.rasgo = rasgo;
    out.x = wa * ax + wb * bx + wc * cx;
    out.y = wa * ay + wb * by + wc * cy;
    out.z = wa * az + wb * bz + wc * cz;
    return out;
  };
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return poner(1, 0, 0, 4);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return poner(0, 1, 0, 5);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return poner(1 - v, v, 0, 1);
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return poner(0, 0, 1, 6);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return poner(1 - w, 0, w, 3);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return poner(0, 1 - w, w, 2);
  }
  const den = va + vb + vc;
  if (!(Math.abs(den) > 0)) return poner(1, 0, 0, 4);
  const v = vb / den, w = vc / den;
  return poner(1 - v - w, v, w, 0);
}

/** El punto del cuerpo más cercano: distancia con signo (negativa dentro), normal del plano de contacto (afuera) y el punto. */
export interface Cercano {
  d: number;
  nx: number;
  ny: number;
  nz: number;
  cx: number;
  cy: number;
  cz: number;
}

export class CuerpoRigido {
  /** los vértices del cuerpo sin repetir y la pseudonormal de cada uno: para el contacto propio (contactoPropio.ts) */
  readonly vertices: Float64Array;
  readonly normales: Float64Array;
  private readonly p: PuntoEnTriangulo = { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 };

  constructor(readonly bvh: LinearBVH) {
    const vistos = new Set<string>(), v: number[] = [], n: number[] = [];
    const { triVerts: tv, vertexPseudonormals: pn } = bvh;
    for (let t = 0; t < bvh.triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const o = 9 * t + 3 * k, clave = `${tv[o]},${tv[o + 1]},${tv[o + 2]}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        v.push(tv[o], tv[o + 1], tv[o + 2]);
        n.push(pn[o], pn[o + 1], pn[o + 2]);
      }
    }
    this.vertices = Float64Array.from(v);
    this.normales = Float64Array.from(n);
  }

  /** El punto del cuerpo más cercano a (px, py, pz) a menos de `radio` (m); null si no hay ninguno. */
  cercano(px: number, py: number, pz: number, radio = Infinity): Cercano | null {
    const { nodes, skip, nodeCount, triVerts: tv } = this.bvh, p = this.p;
    let mejor2 = radio * radio, mejor = -1, rasgo = 0, qx = 0, qy = 0, qz = 0;
    let i = 0;
    while (i < nodeCount) {
      const o = 8 * i;
      const dx = Math.max(nodes[o] - px, 0, px - nodes[o + 3]);
      const dy = Math.max(nodes[o + 1] - py, 0, py - nodes[o + 4]);
      const dz = Math.max(nodes[o + 2] - pz, 0, pz - nodes[o + 5]);
      if (dx * dx + dy * dy + dz * dz >= mejor2) {
        i = skip[i];
        continue;
      }
      const cuenta = nodes[o + 7];
      if (cuenta === 0) {
        i++;
        continue;
      }
      for (let t = nodes[o + 6], fin = t + cuenta; t < fin; t++) {
        const b = 9 * t;
        puntoMasCercano(px, py, pz, tv[b], tv[b + 1], tv[b + 2], tv[b + 3], tv[b + 4], tv[b + 5], tv[b + 6], tv[b + 7], tv[b + 8], p);
        const d2 = (px - p.x) ** 2 + (py - p.y) ** 2 + (pz - p.z) ** 2;
        if (d2 < mejor2) {
          mejor2 = d2;
          mejor = t;
          rasgo = p.rasgo;
          qx = p.x;
          qy = p.y;
          qz = p.z;
        }
      }
      i = skip[i];
    }
    if (mejor < 0) return null;
    // la pseudonormal de la característica donde cayó el punto decide el lado
    const { triNormals, edgePseudonormals, vertexPseudonormals } = this.bvh;
    const fuente = rasgo === 0 ? triNormals : rasgo <= 3 ? edgePseudonormals : vertexPseudonormals;
    const o = rasgo === 0 ? 3 * mejor : rasgo <= 3 ? 9 * mejor + 3 * (rasgo - 1) : 9 * mejor + 3 * (rasgo - 4);
    const ex = px - qx, ey = py - qy, ez = pz - qz, dist = Math.sqrt(mejor2);
    const signo = ex * fuente[o] + ey * fuente[o + 1] + ez * fuente[o + 2] < 0 ? -1 : 1;
    let nx = fuente[o], ny = fuente[o + 1], nz = fuente[o + 2];
    if (dist > 1e-9) {
      nx = (signo * ex) / dist;
      ny = (signo * ey) / dist;
      nz = (signo * ez) / dist;
    }
    return { d: signo * dist, nx, ny, nz, cx: qx, cy: qy, cz: qz };
  }
}
```

- [ ] **Step 5: El obstáculo cuerpo**

En `src/utils/cloth/implicito/obstaculos.ts`:
- El encabezado pasa a decir: «Obstáculos rígidos: los de forma analítica de los ensayos del banco (spec 2026-10-13 §4.4) y el cuerpo, una malla con su BVH (§4.3.1, cuerpo.ts).»
- Import: `import type { CuerpoRigido } from './cuerpo';`.
- `Obstaculo` gana un tercer caso: `/** malla rígida con su BVH: el cuerpo (§4.3.1) */` y `| { tipo: 'cuerpo'; cuerpo: CuerpoRigido };`.
- Debajo de `Distancia`:

```ts
/**
 * Hasta dónde se busca el cuerpo (m): un vértice más adentro no se recupera. Es el tope de empuje del XPBD de
 * hoy (tslCollision.ts, MAX_PUSH_DIST).
 */
export const RADIO_DE_BUSQUEDA = 0.05;
```

- `distancia` pasa a recibir `radio = Infinity` como quinto parámetro y, después del caso `plano`:

```ts
  if (o.tipo === 'cuerpo') {
    const c = o.cuerpo.cercano(x, y, z, radio);
    return c ? { d: c.d, nx: c.nx, ny: c.ny, nz: c.nz } : { d: Infinity, nx: 0, ny: 1, nz: 0 };
  }
```

- `masCercano` pasa a `export function masCercano(obs: readonly Obstaculo[], x: number, y: number, z: number, radio = Infinity): (Distancia & { k: number }) | null {` y su llamada interna a `distancia(obs[k], x, y, z, radio)`. Los obstáculos analíticos ignoran el radio.

En `src/utils/cloth/implicito/gpu/wgsl.ts`, en `wgslObstaculos`, el `obs.map((o, k) => o.tipo === 'plano' ? … : …)` pasa a un cuerpo de bloque que primero rechaza el cuerpo y después devuelve lo mismo de hoy:

```ts
  const cuerpos = obs.map((o, k) => {
    if (o.tipo === 'cuerpo') throw new Error('wgsl: el cuerpo llega a la GPU en la parte 2 de la entrega 4');
    return o.tipo === 'plano'
      ? /* el texto de hoy del plano */
      : /* el texto de hoy del pedestal */;
  });
```

(los dos textos WGSL se copian sin cambios del código actual).

- [ ] **Step 6: Corre las pruebas y mira que pasen**

Run: `npx vitest run src/utils/cloth/implicito/`
Expected: PASS.

- [ ] **Step 7: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/cuerpo.ts src/utils/cloth/implicito/obstaculos.ts src/utils/cloth/implicito/gpu/wgsl.ts src/utils/cloth/implicito/banco/escenas.ts src/utils/cloth/implicito/__tests__/cuerpo.test.ts
git commit -m "feat(tela): el cuerpo rígido con su BVH, recorrido en la CPU con distancia con signo"
```

### Tarea 8: El contacto es un plano, con fricción (E4)

La forma del contacto que el spec dejó para esta entrega. Cada vértice en contacto se apoya en el plano tangente al obstáculo en su punto más cercano, fijado al empezar el paso, o en el punto adonde iba si lo anticipa el paso. La solución usa el plano de dos lados (el vértice no despega en el paso que lo apoya); la búsqueda en línea usa la misma energía de un solo lado y no consulta el obstáculo. La fricción es un resorte tangencial `k_t = μ·λ / (max(|v_t|, ε_v)·h)` con la normal `λ = kc·p0` y la velocidad tangencial del cuadro anterior: si la fuerza tangencial no pasa de `μ·λ`, la tela se queda (se arrastra a menos de ε_v); si pasa, el resorte del cuadro siguiente se ablanda hasta que la fuerza de fricción queda en `μ·λ`. Las telas ganan `friccionCuerpo` y `friccionTela` (§4.1.1).

**Files:**
- Create: `src/utils/cloth/implicito/contactos.ts`
- Modify: `src/utils/cloth/implicito/tela.ts` (los dos coeficientes de fricción)
- Modify: `src/utils/cloth/implicito/banco/escenas.ts` (`TELA_DE_LABORATORIO` con fricción)
- Modify: `src/utils/cloth/implicito/__tests__/voladizo.test.ts:14` (su tela, con fricción 0)
- Modify: `src/utils/cloth/implicito/sistema.ts` (planos, fricción y energía de contacto)
- Modify: `src/utils/cloth/implicito/paso.ts` (el cuadro con planos)
- Modify: `src/utils/cloth/implicito/__tests__/sistema.test.ts` (la API nueva del contacto)
- Modify: `bench/_banco.ts`, `bench/telaNueva.ts:26`, `bench/calibrarPandeo.ts:20` (la tela de la referencia con fricción)
- Test: `src/utils/cloth/implicito/__tests__/contactos.test.ts`

**Interfaces:**
- Consumes: `CuerpoRigido`, `RADIO_DE_BUSQUEDA`, `masCercano` (Tarea 7); `esferaDeColision`, `planoDeColision`; `medirQuietud`, `VigiaDeQuietud`; `getPhysicalFabric` (`src/utils/cloth/physicalFabric.ts`).
- Produces:
  - `contactos.ts`: `interface PlanoDeContacto { i; nx; ny; nz; p0; kt }`, `EPS_FRICCION = 1e-3`, `rigidezDeFriccion(mu: number, lambda: number, vt: number, h: number): number`, `energiaDePlano(c: PlanoDeContacto, kc: number, ux: number, uy: number, uz: number): number`.
  - `tela.ts`: `TelaFisica.friccionCuerpo`, `TelaFisica.friccionTela`, y lo mismo en `TelaSI`.
  - `sistema.ts`: `SistemaTela.contactos: PlanoDeContacto[]`, `armarContactos(): void`, `anticiparContactos(dx: Float64Array): number`, `energiaContactos(x: Float64Array): number`, `residuo(out: Float64Array): void` (sin la lista: usa `this.contactos`), `sumarContactosPor(p: Float64Array, out: Float64Array): void`, `sumarBloquesDeContacto(B: Float64Array): void`. Se quitan `ContactoActivo` y `contactosActuales()`.
  - `bench/_banco.ts`: `telaDeLaReferencia(ref: Referencias, pandeo: number): TelaFisica`.

- [ ] **Step 1: Escribe las pruebas que fallan**

`src/utils/cloth/implicito/__tests__/contactos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { energiaDePlano, EPS_FRICCION, rigidezDeFriccion } from '../contactos';
import { CuerpoRigido } from '../cuerpo';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { medirQuietud, VigiaDeQuietud } from '../quietud';
import { separacion, telaSI } from '../tela';
import { aplastados } from '../banco/medidas';
import { esferaDeColision, laminaPlana, planoDeColision, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, errorDelGradiente } from './ayudas';

describe('el contacto es un plano, con fricción', () => {
  it('la energía del plano: nada afuera, cuadrática adentro, y la fricción en el plano', () => {
    const c = { i: 0, nx: 0, ny: 1, nz: 0, p0: 0.001, kt: 50 };
    expect(energiaDePlano(c, 2000, 0, 0.002, 0)).toBe(0);
    expect(energiaDePlano(c, 2000, 0, 0.0005, 0)).toBeCloseTo(0.5 * 2000 * 0.0005 ** 2, 15);
    expect(energiaDePlano(c, 2000, 0.003, 0.002, 0)).toBeCloseTo(0.5 * 50 * 0.003 ** 2, 15);
  });

  it('el resorte de la fricción: μ·λ sobre la velocidad del cuadro anterior, con piso ε_v', () => {
    expect(rigidezDeFriccion(0.4, 2, 0.5, 1 / 60)).toBeCloseTo((0.4 * 2) / (0.5 / 60), 9);
    expect(rigidezDeFriccion(0.4, 2, 0, 1 / 60)).toBeCloseTo((0.4 * 2) / (EPS_FRICCION / 60), 6);
    expect(rigidezDeFriccion(0, 2, 0.5, 1 / 60)).toBe(0);
    expect(rigidezDeFriccion(0.4, 0, 0.5, 1 / 60)).toBe(0);
  });

  it('residuo = −∂G/∂x con planos y fricción, cerca de x_t (diferencias finitas)', () => {
    const s = new SistemaTela(laminaPlana(20), TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    const r = azar(61);
    // todos los vértices entre 0,5 y 1 mm del suelo: dentro de la separación (1,25 mm), con velocidad
    for (let i = 0; i < s.n; i++) {
      s.x[3 * i + 1] = 0.00075 + 0.0005 * r();
      for (let d = 0; d < 3; d++) s.v[3 * i + d] = 0.05 * r();
    }
    s.xt.set(s.x);
    s.armarContactos();
    expect(s.contactos.length).toBe(s.n);
    expect(s.contactos.every((c) => c.kt > 0)).toBe(true);
    // un poco fuera de x_t, sin salir de ningún plano
    for (let q = 0; q < s.x.length; q++) s.x[q] += 1e-5 * r();
    s.linealizar();
    const res = new Float64Array(s.x.length);
    s.residuo(res);
    expect(errorDelGradiente((x) => s.energiaIncremental(x), res.map((q) => -q), s.x)).toBeLessThan(1e-4);
  });

  it('la tela cae 5 cm sobre una esfera: no la atraviesa, no rebota y queda quieta', () => {
    const R = 0.1;
    const cuerpo = new CuerpoRigido(buildLinearBVH(esferaDeColision(R, 4)));
    const m = laminaPlana(10);
    m.x = Float64Array.from(m.x, (q, k) => (k % 3 === 1 ? q + R + 0.05 : q));
    const s = new SistemaTela(m, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'cuerpo', cuerpo }] });
    let centro = 0;
    for (let i = 0; i < s.n; i++) if (Math.hypot(m.patron[2 * i], m.patron[2 * i + 1]) < Math.hypot(m.patron[2 * centro], m.patron[2 * centro + 1])) centro = i;
    const vigia = new VigiaDeQuietud();
    let masCerca = Infinity, subida = 0, toco = false, quieta = -1;
    for (let c = 0; c < 600 && quieta < 0; c++) {
      const info = pasoImplicito(s);
      expect(info.G1).toBeLessThanOrEqual(info.G0);
      for (let i = 0; i < s.n; i++) masCerca = Math.min(masCerca, Math.hypot(s.x[3 * i], s.x[3 * i + 1], s.x[3 * i + 2]) - R);
      if (Math.hypot(s.x[3 * centro], s.x[3 * centro + 1], s.x[3 * centro + 2]) - R < 2 * s.sep) toco = true;
      if (toco) subida = Math.max(subida, s.v[3 * centro + 1]);
      if (vigia.registrar(medirQuietud(s).total)) quieta = c;
    }
    // nunca más de 1 mm dentro de la separación, sin rebote, quieta en menos de 10 s y sin aplastar
    expect(masCerca).toBeGreaterThan(s.sep - 0.001);
    expect(subida).toBeLessThan(0.05);
    expect(quieta).toBeGreaterThan(0);
    expect(aplastados(s.x, m)).toBeLessThan(0.1);
  });

  for (const [grados, cuadros, desliza] of [[15, 60, false], [35, 30, true]] as const) {
    it(`sobre un plano a ${grados}° con μ = ${TELA_DE_LABORATORIO.friccionCuerpo}, la tela ${desliza ? 'se desliza' : 'se sostiene'}`, () => {
      const th = (grados * Math.PI) / 180;
      const n = [0, Math.cos(th), Math.sin(th)] as const, abajo = [0, -Math.sin(th), Math.cos(th)];
      const cuerpo = new CuerpoRigido(buildLinearBVH(planoDeColision(n, 4)));
      const m = laminaPlana(10), sep = separacion(telaSI(TELA_DE_LABORATORIO));
      // el parche apoyado en el plano, a la separación: (u, w) del dibujo → u·x̂ + w·abajo + sep·n
      m.x = Float64Array.from({ length: m.x.length }, (_, k) => {
        const i = Math.floor(k / 3), d = k % 3, u = m.patron[2 * i], w = m.patron[2 * i + 1];
        return (d === 0 ? u : 0) + w * abajo[d] + sep * n[d];
      });
      const s = new SistemaTela(m, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'cuerpo', cuerpo }] });
      const avance = () => {
        let a = 0;
        for (let i = 0; i < s.n; i++) a += s.x[3 * i + 1] * abajo[1] + s.x[3 * i + 2] * abajo[2];
        return a / s.n;
      };
      const a0 = avance();
      for (let c = 0; c < cuadros; c++) pasoImplicito(s);
      if (desliza) expect(avance() - a0).toBeGreaterThan(0.02);
      else expect(avance() - a0).toBeLessThan(0.002);
    });
  }
});
```

- [ ] **Step 2: Corre las pruebas y mira que fallen**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/contactos.test.ts`
Expected: FAIL, no existe `../contactos` (y `TELA_DE_LABORATORIO.friccionCuerpo` es `undefined`).

- [ ] **Step 3: La fricción de las telas**

En `src/utils/cloth/implicito/tela.ts`: en `TelaFisica`, después de `bBies`, `/** coeficiente de Coulomb de la tela contra el cuerpo (§4.3.1) */ friccionCuerpo: number;` y `/** coeficiente de Coulomb de la tela contra sí misma (§4.3.2) */ friccionTela: number;`; los mismos dos campos en `TelaSI` (sin unidades: es un coeficiente); y en `telaSI`, `friccionCuerpo: t.friccionCuerpo, friccionTela: t.friccionTela,`.

En `src/utils/cloth/implicito/banco/escenas.ts`, `TELA_DE_LABORATORIO` gana `friccionCuerpo: 0.4, friccionTela: 0.45,` y su comentario, una línea: «La fricción es la del jersey de algodón de la biblioteca (physicalFabric.ts, `cotton-jersey`).»

En `src/utils/cloth/implicito/__tests__/voladizo.test.ts:14`, la tela `TELA` gana `friccionCuerpo: 0, friccionTela: 0` (el voladizo no toca nada).

En `bench/_banco.ts`: `Referencias.tela` pasa a `Omit<TelaFisica, 'pandeo' | 'friccionCuerpo' | 'friccionTela'>`, y debajo de `leerReferencias`:

```ts
/** La tela de la referencia con su pandeo y la fricción del jersey de la biblioteca: la referencia no la publica. */
export function telaDeLaReferencia(ref: Referencias, pandeo: number): TelaFisica {
  const jersey = getPhysicalFabric('cotton-jersey');
  if (!jersey) throw new Error('falta cotton-jersey en la biblioteca');
  return { ...ref.tela, pandeo, friccionCuerpo: jersey.frictionBody, friccionTela: jersey.friction };
}
```

`bench/telaNueva.ts:26` pasa a `implicito: (ref, args) => correrImplicito(telaDeLaReferencia(ref, Number(args.get('pandeo') || PANDEO_CALIBRADO))),` y `bench/calibrarPandeo.ts:20` a `const filas = ensayoCusick(correrImplicito(telaDeLaReferencia(ref, pandeo)), [5, 10, 20], ref);`, con `telaDeLaReferencia` en el import de `./_banco` de cada uno.

- [ ] **Step 4: Los planos de contacto**

`src/utils/cloth/implicito/contactos.ts`:

```ts
/**
 * El contacto con los obstáculos (spec 2026-10-13 §4.2.1 y §4.3.1, con la decisión E4 del plan de la entrega
 * 4): cada vértice en contacto se apoya en el plano tangente al obstáculo en su punto más cercano, fijado al
 * empezar el paso o al anticiparlo. La solución usa el plano de dos lados; la búsqueda en línea, la misma energía
 * de un solo lado, sin consultar el obstáculo. La fricción es la de Coulomb suavizada, linealizada con la normal
 * y la velocidad del cuadro anterior: un resorte tangencial k_t = μ·λ / (max(|v_t|, ε_v)·h), que sostiene la
 * tela mientras la fuerza tangencial no pase de μ·λ y la deja deslizar con fuerza μ·λ si pasa.
 */

/** Un vértice apoyado en un plano: su normal (afuera) y su penetración al empezar el paso. */
export interface PlanoDeContacto {
  i: number;
  nx: number;
  ny: number;
  nz: number;
  /** sep − n·(x_t − c): mayor que 0 dentro de la separación */
  p0: number;
  /** rigidez tangencial de la fricción (N/m); 0 en un contacto anticipado */
  kt: number;
}

/**
 * La velocidad (m/s) bajo la cual la fricción sostiene: la de IPC (Li et al., «Incremental Potential Contact»,
 * SIGGRAPH 2020).
 */
export const EPS_FRICCION = 1e-3;

/** k_t de un contacto con normal λ (N) que el cuadro anterior movía a vt (m/s) por el plano. */
export function rigidezDeFriccion(mu: number, lambda: number, vt: number, h: number): number {
  return mu > 0 && lambda > 0 ? (mu * lambda) / (Math.max(vt, EPS_FRICCION) * h) : 0;
}

/** ½·kc·max(p0 − n·u, 0)² + ½·kt·|u − (n·u)·n|², con u = x − x_t: el plano en la búsqueda en línea. */
export function energiaDePlano(c: PlanoDeContacto, kc: number, ux: number, uy: number, uz: number): number {
  const un = c.nx * ux + c.ny * uy + c.nz * uz, p = c.p0 - un;
  const tx = ux - un * c.nx, ty = uy - un * c.ny, tz = uz - un * c.nz;
  return (p > 0 ? 0.5 * kc * p * p : 0) + 0.5 * c.kt * (tx * tx + ty * ty + tz * tz);
}
```

- [ ] **Step 5: El contacto del sistema, por planos**

En `src/utils/cloth/implicito/sistema.ts`:
- Imports: `import { energiaDePlano, rigidezDeFriccion, type PlanoDeContacto } from './contactos';` y el de obstáculos pasa a `import { masCercano, RADIO_DE_BUSQUEDA, type Obstaculo } from './obstaculos';`.
- Borra la interfaz `ContactoActivo` y el método `contactosActuales()`.
- En la clase, después de `readonly vPedida`:

```ts
  /** los planos de contacto del cuadro en curso (E4): los de x_t y los anticipados */
  contactos: PlanoDeContacto[] = [];
  private readonly enContacto: Uint8Array;
```

y en el constructor, al final: `this.enContacto = new Uint8Array(this.n);`.

- `energiaVertice` pasa a ser solo inercia y aire:

```ts
  /** Inercia y aire del vértice i en las posiciones x. */
  energiaVertice(i: number, x: Float64Array): number {
    const { h, aire } = this.aj, m = this.masa[i];
    let E = 0;
    for (let d = 0; d < 3; d++) {
      const q = x[3 * i + d];
      E += (m / (2 * h * h)) * (q - this.prediccion(i, d)) ** 2 + ((aire * m) / (2 * h)) * (q - this.xt[3 * i + d]) ** 2;
    }
    return E;
  }

  /** Los planos del cuadro en x, de un solo lado, con su fricción (contactos.ts). */
  energiaContactos(x: Float64Array): number {
    const kc = this.aj.kContacto;
    let E = 0;
    for (const c of this.contactos) {
      const q = 3 * c.i;
      E += energiaDePlano(c, kc, x[q] - this.xt[q], x[q + 1] - this.xt[q + 1], x[q + 2] - this.xt[q + 2]);
    }
    return E;
  }
```

- `energiaIncremental` pasa a `let E = this.energiaElastica(x) + this.energiaContactos(x);` y el bucle de `energiaVertice` igual.
- Después de `bloquesDiagonales`, los métodos nuevos:

```ts
  /**
   * Los planos de los vértices libres a menos de la separación de un obstáculo en x_t (§4.2.1, E4), con la
   * fricción de la normal λ = kc·p0 y la velocidad tangencial del cuadro anterior.
   */
  armarContactos(): void {
    this.contactos = [];
    this.enContacto.fill(0);
    const { kContacto, h } = this.aj, mu = this.tela.friccionCuerpo;
    for (let i = 0; i < this.n; i++) {
      if (this.fijo[i]) continue;
      const q = 3 * i;
      const c = masCercano(this.obstaculos, this.x[q], this.x[q + 1], this.x[q + 2], RADIO_DE_BUSQUEDA);
      if (c === null || this.sep - c.d <= 0) continue;
      const p0 = this.sep - c.d;
      const vn = c.nx * this.v[q] + c.ny * this.v[q + 1] + c.nz * this.v[q + 2];
      const vt = Math.hypot(this.v[q] - vn * c.nx, this.v[q + 1] - vn * c.ny, this.v[q + 2] - vn * c.nz);
      this.contactos.push({ i, nx: c.nx, ny: c.ny, nz: c.nz, p0, kt: rigidezDeFriccion(mu, kContacto * p0, vt, h) });
      this.enContacto[i] = 1;
    }
  }

  /**
   * Los vértices que el paso dx metería en un obstáculo entran con el plano tangente en el punto adonde iban,
   * sin fricción todavía (§4.2.1, paso 4). Devuelve cuántos.
   */
  anticiparContactos(dx: Float64Array): number {
    let nuevos = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.fijo[i] || this.enContacto[i]) continue;
      const q = 3 * i;
      const c = masCercano(this.obstaculos, this.x[q] + dx[q], this.x[q + 1] + dx[q + 1], this.x[q + 2] + dx[q + 2], RADIO_DE_BUSQUEDA);
      if (c === null || this.sep - c.d <= 0) continue;
      // la penetración en x_t respecto del plano tangente en el punto adonde iba: sep − d + n·dx
      const p0 = this.sep - c.d + (c.nx * dx[q] + c.ny * dx[q + 1] + c.nz * dx[q + 2]);
      this.contactos.push({ i, nx: c.nx, ny: c.ny, nz: c.nz, p0, kt: 0 });
      this.enContacto[i] = 1;
      nuevos++;
    }
    return nuevos;
  }

  /** out += H·p de los planos del cuadro: kc·n·nᵀ + kt·(I − n·nᵀ). */
  sumarContactosPor(p: Float64Array, out: Float64Array): void {
    const kc = this.aj.kContacto;
    for (const c of this.contactos) {
      const q = 3 * c.i, pn = c.nx * p[q] + c.ny * p[q + 1] + c.nz * p[q + 2];
      out[q] += kc * pn * c.nx + c.kt * (p[q] - pn * c.nx);
      out[q + 1] += kc * pn * c.ny + c.kt * (p[q + 1] - pn * c.ny);
      out[q + 2] += kc * pn * c.nz + c.kt * (p[q + 2] - pn * c.nz);
    }
  }

  /** B[9i..9i+8] += el bloque de cada plano del cuadro. */
  sumarBloquesDeContacto(B: Float64Array): void {
    const kc = this.aj.kContacto;
    for (const c of this.contactos) {
      const n = [c.nx, c.ny, c.nz], o = 9 * c.i;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) B[o + 3 * a + b] += (kc - c.kt) * n[a] * n[b] + (a === b ? c.kt : 0);
    }
  }
```

- `residuo` pasa a:

```ts
  /**
   * out = −∇G en las posiciones actuales, con cada plano del cuadro de dos lados, ½·kc·(p0 − n·u)², y su
   * fricción, ½·kt·|u − (n·u)·n|², con u = x − x_t: en la solución el plano no suelta (E4); en la búsqueda en
   * línea, sí. Los empotrados quedan en cero. Pide `linealizar` y `armarContactos` antes.
   */
  residuo(out: Float64Array): void {
    this.gradienteElastico(out);
    const { h, aire, kContacto: kc } = this.aj;
    for (let i = 0; i < this.n; i++) {
      const m = this.masa[i];
      for (let d = 0; d < 3; d++) {
        const q = 3 * i + d;
        out[q] = -(out[q] + (m / (h * h)) * (this.x[q] - this.prediccion(i, d)) + ((aire * m) / h) * (this.x[q] - this.xt[q]));
      }
    }
    for (const c of this.contactos) {
      const q = 3 * c.i;
      const ux = this.x[q] - this.xt[q], uy = this.x[q + 1] - this.xt[q + 1], uz = this.x[q + 2] - this.xt[q + 2];
      const un = c.nx * ux + c.ny * uy + c.nz * uz, f = kc * (c.p0 - un);
      out[q] += f * c.nx - c.kt * (ux - un * c.nx);
      out[q + 1] += f * c.ny - c.kt * (uy - un * c.ny);
      out[q + 2] += f * c.nz - c.kt * (uz - un * c.nz);
    }
    for (let i = 0; i < this.n; i++) if (this.fijo[i]) out[3 * i] = out[3 * i + 1] = out[3 * i + 2] = 0;
  }
```

- [ ] **Step 6: El cuadro con planos**

`src/utils/cloth/implicito/paso.ts`: el encabezado pasa a decir «… con los planos de contacto del cuadro (E4 del plan de la entrega 4), su anticipación (una ronda más) y búsqueda en línea sobre G con la misma energía de contacto, de un solo lado. La GPU (gpu/wgsl.ts) mide todavía el contacto por distancia: la parte 2 de la entrega 4 la lleva a los planos.»; se quitan los imports de `obstaculos` y de `ContactoActivo` (queda `import type { SistemaTela } from './sistema';`), se borra la función `precondicionador`, y `pasoImplicito` queda:

```ts
export function pasoImplicito(s: SistemaTela): InfoPaso {
  const { n, aj } = s;
  const { h, aire, maxCG, tolCG } = aj;
  s.xt.set(s.x);
  s.linealizar();
  s.armarContactos();

  // bloques de la diagonal sin el contacto: elástica + (m/h² + aire·m/h)·I
  const base = new Float64Array(9 * n), diag = new Float64Array(n);
  s.bloquesDiagonales(base);
  for (let i = 0; i < n; i++) {
    diag[i] = s.masa[i] / (h * h) + (aire * s.masa[i]) / h;
    base[9 * i] += diag[i];
    base[9 * i + 4] += diag[i];
    base[9 * i + 8] += diag[i];
  }
  const A = (p: Float64Array, out: Float64Array) => {
    s.hessianaPor(p, out);
    for (let i = 0; i < n; i++) for (let d = 0; d < 3; d++) out[3 * i + d] += diag[i] * p[3 * i + d];
    s.sumarContactosPor(p, out);
    for (let i = 0; i < n; i++) if (s.fijo[i]) out[3 * i] = out[3 * i + 1] = out[3 * i + 2] = 0;
  };

  const r = new Float64Array(3 * n), dx = new Float64Array(3 * n), Pinv = new Float64Array(9 * n);
  const tmp = { z: new Float64Array(3 * n), p: new Float64Array(3 * n), Ap: new Float64Array(3 * n) };
  let cg = 0, anticipados = 0;
  for (let ronda = 0; ronda < 2; ronda++) {
    s.residuo(r);
    // el precondicionador: las inversas de los bloques de la diagonal, con los planos
    Pinv.set(base);
    s.sumarBloquesDeContacto(Pinv);
    for (let o = 0; o < Pinv.length; o += 9) invertir3(Pinv, o);
    cg += gradienteConjugado(A, r, Pinv, dx, maxCG, tolCG, tmp);
    if (ronda === 1 || !aj.anticipar) break;
    anticipados = s.anticiparContactos(dx);
    if (anticipados === 0) break;
  }

  // búsqueda en línea: el paso no puede subir G (§4.2.1, paso 5), con los mismos planos de un solo lado
  const G0 = s.energiaIncremental(s.xt);
  const prueba = new Float64Array(3 * n);
  let alfa = 1, G1 = G0;
  for (let intento = 0; intento < (aj.busqueda ? 8 : 1); intento++, alfa *= 0.5) {
    for (let q = 0; q < 3 * n; q++) prueba[q] = s.xt[q] + alfa * dx[q];
    G1 = s.energiaIncremental(prueba);
    if (!aj.busqueda || G1 <= G0) break;
  }
  if (aj.busqueda && !(G1 <= G0)) {
    alfa = 0;
    G1 = G0;
  }
  for (let q = 0; q < 3 * n; q++) {
    s.x[q] = s.xt[q] + alfa * dx[q];
    s.v[q] = (s.x[q] - s.xt[q]) / h;
    s.vPedida[q] = dx[q] / h;
  }
  s.alTerminarCuadro();
  return { cg, anticipados, alfa, G0, G1 };
}
```

(`invertir3`, `gradienteConjugado`, `precondicionar` y `punto` quedan como están.)

- [ ] **Step 7: Las pruebas del sistema, con la API nueva**

En `src/utils/cloth/implicito/__tests__/sistema.test.ts`:
- En «residuo = −∂G/∂x con inercia, aire y elástica», `s.residuo([], res);` pasa a `s.residuo(res);`.
- «al empezar el paso, el contacto entra con su normal» pasa a:

```ts
  it('al empezar el paso, el contacto entra con su plano', () => {
    const s = new SistemaTela(laminaPlana(20), TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    const r = azar(23);
    // ±0,25 mm: todos los vértices quedan a menos de la separación del suelo (1,25 mm)
    for (let q = 0; q < s.x.length; q++) s.x[q] += 0.0005 * r();
    s.xt.set(s.x);
    s.linealizar();
    s.armarContactos();
    expect(s.contactos.length).toBe(s.n);
    const res = new Float64Array(s.x.length);
    s.residuo(res);
    expect(errorDelGradiente((x) => s.energiaIncremental(x), res.map((q) => -q), s.x)).toBeLessThan(1e-4);
  });
```

- En «los empotrados no reciben fuerza ni contacto», el cuerpo pasa a:

```ts
    const s = new SistemaTela(m, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    s.linealizar();
    s.armarContactos();
    const res = new Float64Array(s.x.length);
    s.residuo(res);
    expect([res[0], res[1], res[2]]).toEqual([0, 0, 0]);
    expect(s.contactos.some((c) => c.i === 0)).toBe(false);
```

- [ ] **Step 8: Corre las pruebas y mira que pasen**

Run: `npx vitest run src/utils/cloth/implicito/`
Expected: PASS, también `paso.test.ts` (el disco sobre el pedestal, el voladizo y el disco de 20 mm que no se traba) sin cambiarle nada. Si una de las pruebas físicas de `contactos.test.ts` no pasa, **para aquí y repórtalo** con lo medido (la penetración más honda, la subida del centro, los cuadros hasta quieta, el avance en el plano): es el punto de decisión de E4, y la alternativa (varias iteraciones de Newton por cuadro) la decide Samuel.

- [ ] **Step 9: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/contactos.ts src/utils/cloth/implicito/tela.ts src/utils/cloth/implicito/banco/escenas.ts src/utils/cloth/implicito/sistema.ts src/utils/cloth/implicito/paso.ts src/utils/cloth/implicito/__tests__/contactos.test.ts src/utils/cloth/implicito/__tests__/sistema.test.ts src/utils/cloth/implicito/__tests__/voladizo.test.ts bench/_banco.ts bench/telaNueva.ts bench/calibrarPandeo.ts
git commit -m "feat(tela): el contacto es un plano con la misma energía en la solución y en la búsqueda en línea, con fricción"
```

**El controlador, al cerrar la Tarea 8:** corre el banco privado contra la referencia (`VINA_REFERENCIAS=<carpeta privada> npm run bench:tela -- --motor=implicito`) y lo compara con el informe de #1257 (disco Cusick 24,2 / 26,8 / 27,9 con 0 % aplastados; quieto en 3,6 a 8,2 s; voladizo 5,3° de cambio entre mallas). Con la fricción el disco puede caer distinto sobre el pedestal; lo que no puede es aplastarse, trabarse ni dejar de quedarse quieto. Si algo de eso empeora, para ahí y lo lleva a Samuel con los dos informes.

### Tarea 9: La tela contra sí misma (E3)

Pares de un vértice de tela y un triángulo de tela más cerca que la separación entre capas (el grosor más 1 mm), y pares de un vértice del cuerpo y un triángulo de tela, para las puntas del cuerpo que una malla gruesa no ve. Cada par es un plano fijado al empezar el paso, con la normal y los pesos de su punto más cercano, como el contacto con el cuerpo, y con la misma anticipación: al empezar se juntan los candidatos a menos de la separación más lo que el cuadro puede mover (`2·v_max·h + g·h²`, con tope de 2 cm), y entra al cuadro el que ya está dentro o el que el primer paso cruzaría. Medido sobre el plano fijo, así que también se ve el que el paso haría pasar de un lado al otro. Sin eso, a más de `separación/h` (9 cm/s) una capa atraviesa a la otra en un cuadro. No cuentan los triángulos del propio vértice ni los de sus compañeros de costura.

**Files:**
- Create: `src/utils/cloth/implicito/contactoPropio.ts`
- Modify: `src/utils/cloth/implicito/sistema.ts` (los pares, su anticipación y su energía)
- Modify: `src/utils/cloth/implicito/paso.ts` (arma los pares al empezar)
- Test: `src/utils/cloth/implicito/__tests__/contactoPropio.test.ts`

**Interfaces:**
- Consumes: `puntoMasCercano`, `PuntoEnTriangulo`, `CuerpoRigido.vertices`, `CuerpoRigido.normales` (Tarea 7); `rigidezDeFriccion` (Tarea 8); `Costuras.vertices(e)` (Tarea 4); `piramideDeColision` (Tarea 7).
- Produces:
  - `contactoPropio.ts`: `interface ParPropio { v: number[]; w: number[]; nx; ny; nz; p0: number; kt: number; activo: boolean }`, `separacionPropia(grosor: number): number`, `class RejillaDeTriangulos { constructor(celda: number); armar(x, tris, holgura): void; cercanos(px, py, pz): readonly number[] }`, `energiaDelPar(par: ParPropio, kc: number, x: ArrayLike<number>, xt: ArrayLike<number>): number`, `ALCANCE_MAXIMO = 0.02`.
  - `sistema.ts`: `AjustesImplicito.contactoPropio: boolean` (true), `SistemaTela.sepPropia`, `SistemaTela.paresPropios: ParPropio[]`, `armarParesPropios(): void`; `anticiparContactos(dx)` activa también los pares.

- [ ] **Step 1: Escribe las pruebas que fallan**

`src/utils/cloth/implicito/__tests__/contactoPropio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { RejillaDeTriangulos, separacionPropia } from '../contactoPropio';
import { CuerpoRigido, puntoMasCercano, type PuntoEnTriangulo } from '../cuerpo';
import { armarPrenda } from '../prenda';
import { mallaDeContorno, type MallaDeTela } from '../malla';
import { puntosDeCostura } from '../costuras';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { separacion, telaSI } from '../tela';
import { laminaPlana, piramideDeColision, rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, errorDelGradiente } from './ayudas';

const sepTela = separacionPropia(telaSI(TELA_DE_LABORATORIO).grosor);
const nuevoPunto = (): PuntoEnTriangulo => ({ x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 });

function borde(m: MallaDeTela, x0: number, v0 = 0): number[] {
  const n = m.x.length / 3, vs: number[] = [];
  for (let i = 0; i < n; i++) if (Math.abs(m.patron[2 * i] - x0) < 1e-9) vs.push(i);
  return vs.sort((i, j) => m.patron[2 * i + 1] - m.patron[2 * j + 1]).map((i) => i + v0);
}

describe('la tela contra sí misma', () => {
  it('la rejilla devuelve todo triángulo a menos de la holgura de un punto', () => {
    const r = azar(71), m = laminaPlana(10);
    const x = Float64Array.from(m.x, (q, k) => (k % 3 === 1 ? 0.01 * r() : q)); // arrugada ±5 mm
    const rejilla = new RejillaDeTriangulos(0.004);
    rejilla.armar(x, m.tris, sepTela);
    const p = nuevoPunto();
    let cerca = 0;
    for (let caso = 0; caso < 200; caso++) {
      const px = 0.12 * r(), py = 0.01 * r(), pz = 0.12 * r();
      const candidatos = new Set(rejilla.cercanos(px, py, pz));
      for (let t = 0; t < m.tris.length / 3; t++) {
        const a = 3 * m.tris[3 * t], b = 3 * m.tris[3 * t + 1], c = 3 * m.tris[3 * t + 2];
        puntoMasCercano(px, py, pz, x[a], x[a + 1], x[a + 2], x[b], x[b + 1], x[b + 2], x[c], x[c + 1], x[c + 2], p);
        if (Math.hypot(px - p.x, py - p.y, pz - p.z) < sepTela) {
          expect(candidatos.has(t)).toBe(true);
          cerca++;
        }
      }
    }
    expect(cerca).toBeGreaterThan(10);
  });

  it('residuo = −∂G/∂x con los pares de dos láminas a 1 mm (diferencias finitas)', () => {
    const abajo = mallaDeContorno(rectangulo(-50, -50, 50, 50), 20), arriba = mallaDeContorno(rectangulo(-40, -40, 40, 40), 20);
    const prenda = armarPrenda([
      { id: 'abajo', ...abajo },
      { id: 'arriba', ...arriba, x: Float64Array.from(arriba.x, (q, k) => (k % 3 === 1 ? q + 0.001 : q)) },
    ]);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { ajustes: { gravedad: 0 } });
    const r = azar(73);
    for (let q = 0; q < s.v.length; q++) s.v[q] = 0.05 * r();
    s.xt.set(s.x);
    s.armarParesPropios();
    expect(s.paresPropios.filter((p) => p.activo).length).toBeGreaterThan(0);
    for (let q = 0; q < s.x.length; q++) s.x[q] += 1e-6 * r();
    s.linealizar();
    const res = new Float64Array(s.x.length);
    s.residuo(res);
    expect(errorDelGradiente((x) => s.energiaIncremental(x), res.map((q) => -q), s.x)).toBeLessThan(1e-4);
  });

  it('una lámina cae sobre otra apoyada en el suelo y queda encima, a la separación entre capas', () => {
    const abajo = mallaDeContorno(rectangulo(-60, -60, 60, 60), 10), arriba = mallaDeContorno(rectangulo(-45, -45, 45, 45), 10);
    const s0 = separacion(telaSI(TELA_DE_LABORATORIO));
    const prenda = armarPrenda([
      { id: 'abajo', ...abajo, x: Float64Array.from(abajo.x, (q, k) => (k % 3 === 1 ? s0 : q)) },
      { id: 'arriba', ...arriba, x: Float64Array.from(arriba.x, (q, k) => (k % 3 === 1 ? s0 + 0.004 : q)) },
    ]);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    const nAbajo = abajo.x.length / 3;
    let masBajo = Infinity;
    for (let c = 0; c < 60; c++) {
      const info = pasoImplicito(s);
      expect(info.G1).toBeLessThanOrEqual(info.G0);
      for (let i = nAbajo; i < s.n; i++) masBajo = Math.min(masBajo, s.x[3 * i + 1]);
    }
    expect(masBajo).toBeGreaterThan(s0 + sepTela - 0.0005);
  });

  it('con contacto propio, la costura cierra igual: los compañeros de costura no se empujan', () => {
    const A = mallaDeContorno(rectangulo(0, 0, 100, 60), 5), B = mallaDeContorno(rectangulo(0, 0, 100, 60), 7);
    const prenda = armarPrenda([
      { id: 'A', ...A },
      { id: 'B', ...B, x: Float64Array.from(B.x, (q, k) => (k % 3 === 0 ? q + 0.13 : q)) },
    ]);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, {
      costuras: { puntos: puntosDeCostura(prenda.malla.patron, borde(A, 0.1), borde(B, 0, A.x.length / 3)) },
      ajustes: { gravedad: 0, contactoPropio: true },
    });
    for (let c = 0; c < 60; c++) pasoImplicito(s);
    let peor = 0;
    const d = [0, 0, 0];
    for (let e = 0; e < s.costuras.n; e++) {
      s.costuras.separacion(e, s.x, d);
      peor = Math.max(peor, Math.hypot(d[0], d[1], d[2]));
    }
    expect(peor).toBeLessThan(1e-4);
  });

  it('la punta de una pirámide no atraviesa una tela de malla gruesa: el vértice del cuerpo contra el triángulo', () => {
    const cuerpo = new CuerpoRigido(buildLinearBVH(piramideDeColision(0.3, 0.1)));
    const sobreLaPunta = (contactoPropio: boolean) => {
      const m = mallaDeContorno(rectangulo(-60, -60, 60, 60), 20);
      // 5 mm sobre la punta, corrida para que la punta caiga en medio de un triángulo
      m.x = Float64Array.from(m.x, (q, k) => (k % 3 === 0 ? q + 0.007 : k % 3 === 1 ? q + 0.105 : q + 0.003));
      const s = new SistemaTela(m, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'cuerpo', cuerpo }], ajustes: { contactoPropio } });
      for (let c = 0; c < 60; c++) pasoImplicito(s);
      // el punto de la tela más cercano a la punta, medido hacia arriba desde ella
      const p = nuevoPunto(), x = s.x;
      let mejor = Infinity, dy = 0;
      for (let t = 0; t < m.tris.length / 3; t++) {
        const a = 3 * m.tris[3 * t], b = 3 * m.tris[3 * t + 1], c = 3 * m.tris[3 * t + 2];
        puntoMasCercano(0, 0.1, 0, x[a], x[a + 1], x[a + 2], x[b], x[b + 1], x[b + 2], x[c], x[c + 1], x[c + 2], p);
        const d = Math.hypot(p.x, p.y - 0.1, p.z);
        if (d < mejor) {
          mejor = d;
          dy = p.y - 0.1;
        }
      }
      return dy;
    };
    expect(sobreLaPunta(true)).toBeGreaterThan(sepTela - 0.0005);
    expect(sobreLaPunta(false)).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Corre las pruebas y mira que fallen**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/contactoPropio.test.ts`
Expected: FAIL, no existe `../contactoPropio`.

- [ ] **Step 3: Los pares y la rejilla**

`src/utils/cloth/implicito/contactoPropio.ts`:

```ts
/**
 * La tela contra sí misma (spec 2026-10-13 §4.3.2, con la enmienda E3 del plan de la entrega 4): pares de un
 * vértice de tela y un triángulo de tela más cerca que la separación entre capas, hallados con una rejilla, y
 * pares de un vértice del cuerpo y un triángulo de tela, para las puntas del cuerpo que la malla de la tela no
 * ve. Cada par es un plano fijado al empezar el paso, como el contacto con el cuerpo (contactos.ts): la misma
 * energía en la solución y en la búsqueda en línea, con fricción, y la misma anticipación sobre el plano fijo.
 */

/**
 * Un par: la separación s = n·Σ w·x entre sus vértices de tela (vértice − triángulo; o triángulo − vértice del
 * cuerpo, con n la normal del cuerpo en su vértice) no baja de la separación entre capas.
 */
export interface ParPropio {
  /** los vértices de tela del par */
  v: number[];
  /** el peso de cada uno en la separación */
  w: number[];
  nx: number;
  ny: number;
  nz: number;
  /** separación entre capas − s(x_t): mayor que 0 dentro */
  p0: number;
  /** rigidez tangencial de la fricción (N/m); 0 si el par no estaba dentro al empezar */
  kt: number;
  /** entra al cuadro: estaba dentro al empezar, o el primer paso lo iba a cruzar */
  activo: boolean;
}

/** La separación entre dos capas de tela (§4.3.2): dos medios grosores más 1 mm. */
export function separacionPropia(grosor: number): number {
  return grosor + 0.001;
}

/** Hasta dónde (m) se buscan candidatos más allá de la separación: lo que un cuadro de 2 m/s alcanza a mover. */
export const ALCANCE_MAXIMO = 0.02;

/** Una rejilla de triángulos: cada uno en todas las celdas que toca su caja agrandada por la holgura. */
export class RejillaDeTriangulos {
  private readonly celdas = new Map<number, number[]>();

  constructor(readonly celda: number) {}

  private clave(ix: number, iy: number, iz: number): number {
    return ((ix + 4096) * 8192 + (iy + 4096)) * 8192 + (iz + 4096);
  }

  armar(x: ArrayLike<number>, tris: ArrayLike<number>, holgura: number): void {
    this.celdas.clear();
    const c = this.celda;
    for (let t = 0; t < tris.length / 3; t++) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < 3; k++) {
        const q = 3 * tris[3 * t + k];
        x0 = Math.min(x0, x[q]);
        x1 = Math.max(x1, x[q]);
        y0 = Math.min(y0, x[q + 1]);
        y1 = Math.max(y1, x[q + 1]);
        z0 = Math.min(z0, x[q + 2]);
        z1 = Math.max(z1, x[q + 2]);
      }
      for (let ix = Math.floor((x0 - holgura) / c); ix <= Math.floor((x1 + holgura) / c); ix++) {
        for (let iy = Math.floor((y0 - holgura) / c); iy <= Math.floor((y1 + holgura) / c); iy++) {
          for (let iz = Math.floor((z0 - holgura) / c); iz <= Math.floor((z1 + holgura) / c); iz++) {
            const k = this.clave(ix, iy, iz), lista = this.celdas.get(k);
            if (lista) lista.push(t);
            else this.celdas.set(k, [t]);
          }
        }
      }
    }
  }

  /** Los triángulos de la celda del punto: están todos los que quedan a menos de la holgura. */
  cercanos(px: number, py: number, pz: number): readonly number[] {
    const c = this.celda;
    return this.celdas.get(this.clave(Math.floor(px / c), Math.floor(py / c), Math.floor(pz / c))) ?? [];
  }
}

/** ½·kc·max(p0 − n·U, 0)² + ½·kt·|U − (n·U)·n|², con U = Σ w·(x − x_t): el par en la búsqueda en línea. */
export function energiaDelPar(par: ParPropio, kc: number, x: ArrayLike<number>, xt: ArrayLike<number>): number {
  let ux = 0, uy = 0, uz = 0;
  for (let k = 0; k < par.v.length; k++) {
    const q = 3 * par.v[k];
    ux += par.w[k] * (x[q] - xt[q]);
    uy += par.w[k] * (x[q + 1] - xt[q + 1]);
    uz += par.w[k] * (x[q + 2] - xt[q + 2]);
  }
  const un = par.nx * ux + par.ny * uy + par.nz * uz, p = par.p0 - un;
  const tx = ux - un * par.nx, ty = uy - un * par.ny, tz = uz - un * par.nz;
  return (p > 0 ? 0.5 * kc * p * p : 0) + 0.5 * par.kt * (tx * tx + ty * ty + tz * tz);
}
```

- [ ] **Step 4: Los pares en el sistema**

En `src/utils/cloth/implicito/sistema.ts`:
- Imports: `import { ALCANCE_MAXIMO, energiaDelPar, RejillaDeTriangulos, separacionPropia, type ParPropio } from './contactoPropio';` y `import { puntoMasCercano, type PuntoEnTriangulo } from './cuerpo';`.
- En `AjustesImplicito`, después de `flexionDelMargen`: `/** la tela contra sí misma y las puntas del cuerpo contra la tela (§4.3.2) */` y `contactoPropio: boolean;`; en `AJUSTES_IMPLICITO`: `contactoPropio: true,`.
- En la clase, después de `contactos`:

```ts
  /** separación entre dos capas de la tela (m) */
  readonly sepPropia: number;
  /** los pares del contacto propio del cuadro en curso: candidatos y activos (contactoPropio.ts) */
  paresPropios: ParPropio[] = [];
  private readonly rejilla: RejillaDeTriangulos;
  /** por vértice: él y sus compañeros de costura, cuyos triángulos no cuentan para su contacto propio */
  private readonly excluidos: number[][];
  private readonly punto: PuntoEnTriangulo = { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 };
```

- Al final del constructor:

```ts
    this.sepPropia = separacionPropia(this.tela.grosor);
    // la celda de la rejilla: la arista media del patrón, y nunca menos de dos separaciones
    let largo = 0;
    for (let t = 0; t < malla.tris.length / 3; t++) {
      for (let k = 0; k < 3; k++) {
        const a = malla.tris[3 * t + k], b = malla.tris[3 * t + ((k + 1) % 3)];
        largo += Math.hypot(uv[2 * b] - uv[2 * a], uv[2 * b + 1] - uv[2 * a + 1]);
      }
    }
    this.rejilla = new RejillaDeTriangulos(Math.max(2 * this.sepPropia, largo / Math.max(1, malla.tris.length)));
    this.excluidos = Array.from({ length: this.n }, (_, i) => [i]);
    for (let e = 0; e < this.costuras.n; e++) {
      const [a, b0, b1] = this.costuras.vertices(e);
      for (const b of [b0, b1]) {
        if (!this.excluidos[a].includes(b)) this.excluidos[a].push(b);
        if (!this.excluidos[b].includes(a)) this.excluidos[b].push(a);
      }
    }
```

- Después de `armarContactos`, el método nuevo:

```ts
  /**
   * Los pares del contacto propio en x_t (§4.3.2, E3): cada vértice libre contra los triángulos de tela a menos
   * de la separación entre capas más el alcance del cuadro (salvo los suyos y los de sus compañeros de costura),
   * y cada vértice del cuerpo contra los triángulos de tela que tiene encima. Entra activo el que ya está dentro
   * de la separación, con la fricción de la tela contra sí misma.
   */
  armarParesPropios(): void {
    this.paresPropios = [];
    if (!this.aj.contactoPropio) return;
    const { x, v, tris, punto: q } = this, sep = this.sepPropia, { kContacto: kc, h, gravedad } = this.aj, mu = this.tela.friccionTela;
    let vmax = 0;
    for (let i = 0; i < this.n; i++) vmax = Math.max(vmax, Math.hypot(v[3 * i], v[3 * i + 1], v[3 * i + 2]));
    const radio = sep + Math.min(ALCANCE_MAXIMO, 2 * vmax * h + Math.abs(gravedad) * h * h);
    this.rejilla.armar(x, tris, radio);
    const agregar = (vs: number[], ws: number[], nx: number, ny: number, nz: number, s0: number) => {
      const p0 = sep - s0;
      let kt = 0;
      if (p0 > 0) {
        let vx = 0, vy = 0, vz = 0;
        for (let k = 0; k < vs.length; k++) {
          vx += ws[k] * v[3 * vs[k]];
          vy += ws[k] * v[3 * vs[k] + 1];
          vz += ws[k] * v[3 * vs[k] + 2];
        }
        const vn = vx * nx + vy * ny + vz * nz;
        kt = rigidezDeFriccion(mu, kc * p0, Math.hypot(vx - vn * nx, vy - vn * ny, vz - vn * nz), h);
      }
      this.paresPropios.push({ v: vs, w: ws, nx, ny, nz, p0, kt, activo: p0 > 0 });
    };
    for (let i = 0; i < this.n; i++) {
      if (this.fijo[i]) continue;
      const px = x[3 * i], py = x[3 * i + 1], pz = x[3 * i + 2], fuera = this.excluidos[i];
      for (const t of this.rejilla.cercanos(px, py, pz)) {
        const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
        if (fuera.includes(a) || fuera.includes(b) || fuera.includes(c)) continue;
        puntoMasCercano(px, py, pz, x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * b], x[3 * b + 1], x[3 * b + 2], x[3 * c], x[3 * c + 1], x[3 * c + 2], q);
        const ex = px - q.x, ey = py - q.y, ez = pz - q.z, d = Math.hypot(ex, ey, ez);
        if (d >= radio || d < 1e-9) continue;
        agregar([i, a, b, c], [1, -q.wa, -q.wb, -q.wc], ex / d, ey / d, ez / d, d);
      }
    }
    for (const o of this.obstaculos) {
      if (o.tipo !== 'cuerpo') continue;
      const yv = o.cuerpo.vertices, yn = o.cuerpo.normales;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < this.n; i++) {
        x0 = Math.min(x0, x[3 * i]);
        x1 = Math.max(x1, x[3 * i]);
        y0 = Math.min(y0, x[3 * i + 1]);
        y1 = Math.max(y1, x[3 * i + 1]);
        z0 = Math.min(z0, x[3 * i + 2]);
        z1 = Math.max(z1, x[3 * i + 2]);
      }
      for (let b = 0; b < yv.length / 3; b++) {
        const yx = yv[3 * b], yy = yv[3 * b + 1], yz = yv[3 * b + 2];
        if (yx < x0 - radio || yx > x1 + radio || yy < y0 - radio || yy > y1 + radio || yz < z0 - radio || yz > z1 + radio) continue;
        for (const t of this.rejilla.cercanos(yx, yy, yz)) {
          const t0 = tris[3 * t], t1 = tris[3 * t + 1], t2 = tris[3 * t + 2];
          if (this.fijo[t0] && this.fijo[t1] && this.fijo[t2]) continue;
          puntoMasCercano(yx, yy, yz, x[3 * t0], x[3 * t0 + 1], x[3 * t0 + 2], x[3 * t1], x[3 * t1 + 1], x[3 * t1 + 2], x[3 * t2], x[3 * t2 + 1], x[3 * t2 + 2], q);
          if (Math.hypot(yx - q.x, yy - q.y, yz - q.z) >= radio) continue;
          // la tela queda del lado de afuera del cuerpo: s = n·(punto de la tela − y) ≥ separación entre capas
          const nx = yn[3 * b], ny = yn[3 * b + 1], nz = yn[3 * b + 2];
          agregar([t0, t1, t2], [q.wa, q.wb, q.wc], nx, ny, nz, nx * (q.x - yx) + ny * (q.y - yy) + nz * (q.z - yz));
        }
      }
    }
  }
```

- `anticiparContactos` activa también los pares: antes de `return nuevos;`:

```ts
    // los pares que el paso cruzaría, medidos sobre su plano fijo: también el que pasaría de un lado al otro
    for (const par of this.paresPropios) {
      if (par.activo) continue;
      let un = 0;
      for (let k = 0; k < par.v.length; k++) {
        const q = 3 * par.v[k];
        un += par.w[k] * (par.nx * dx[q] + par.ny * dx[q + 1] + par.nz * dx[q + 2]);
      }
      if (par.p0 - un > 0) {
        par.activo = true;
        nuevos++;
      }
    }
```

y su JSDoc agrega «, y activa los pares del contacto propio que el paso iba a cruzar».

- `energiaContactos`, antes de `return E;`: `for (const par of this.paresPropios) if (par.activo) E += energiaDelPar(par, kc, x, this.xt);`.
- `residuo`, después del bucle de los planos y antes del de los empotrados:

```ts
    for (const par of this.paresPropios) {
      if (!par.activo) continue;
      let ux = 0, uy = 0, uz = 0;
      for (let k = 0; k < par.v.length; k++) {
        const q = 3 * par.v[k];
        ux += par.w[k] * (this.x[q] - this.xt[q]);
        uy += par.w[k] * (this.x[q + 1] - this.xt[q + 1]);
        uz += par.w[k] * (this.x[q + 2] - this.xt[q + 2]);
      }
      const un = par.nx * ux + par.ny * uy + par.nz * uz, f = kc * (par.p0 - un);
      const fx = f * par.nx - par.kt * (ux - un * par.nx), fy = f * par.ny - par.kt * (uy - un * par.ny), fz = f * par.nz - par.kt * (uz - un * par.nz);
      for (let k = 0; k < par.v.length; k++) {
        const q = 3 * par.v[k];
        out[q] += par.w[k] * fx;
        out[q + 1] += par.w[k] * fy;
        out[q + 2] += par.w[k] * fz;
      }
    }
```

- `sumarContactosPor`, al final:

```ts
    for (const par of this.paresPropios) {
      if (!par.activo) continue;
      let qx = 0, qy = 0, qz = 0;
      for (let k = 0; k < par.v.length; k++) {
        const o = 3 * par.v[k];
        qx += par.w[k] * p[o];
        qy += par.w[k] * p[o + 1];
        qz += par.w[k] * p[o + 2];
      }
      const qn = par.nx * qx + par.ny * qy + par.nz * qz;
      const ax = kc * qn * par.nx + par.kt * (qx - qn * par.nx), ay = kc * qn * par.ny + par.kt * (qy - qn * par.ny), az = kc * qn * par.nz + par.kt * (qz - qn * par.nz);
      for (let k = 0; k < par.v.length; k++) {
        const o = 3 * par.v[k];
        out[o] += par.w[k] * ax;
        out[o + 1] += par.w[k] * ay;
        out[o + 2] += par.w[k] * az;
      }
    }
```

- `sumarBloquesDeContacto`, al final:

```ts
    for (const par of this.paresPropios) {
      if (!par.activo) continue;
      const n = [par.nx, par.ny, par.nz];
      for (let k = 0; k < par.v.length; k++) {
        const o = 9 * par.v[k], w2 = par.w[k] * par.w[k];
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) B[o + 3 * a + b] += w2 * ((kc - par.kt) * n[a] * n[b] + (a === b ? par.kt : 0));
      }
    }
```

En `src/utils/cloth/implicito/paso.ts`, después de `s.armarContactos();`: `s.armarParesPropios();`.

- [ ] **Step 5: Corre las pruebas y mira que pasen**

Run: `npx vitest run src/utils/cloth/implicito/`
Expected: PASS. Si la lámina de arriba atraviesa la de abajo o la punta atraviesa la tela con el contacto propio encendido, para y repórtalo con lo medido.

- [ ] **Step 6: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/contactoPropio.ts src/utils/cloth/implicito/sistema.ts src/utils/cloth/implicito/paso.ts src/utils/cloth/implicito/__tests__/contactoPropio.test.ts
git commit -m "feat(tela): la tela contra sí misma y las puntas del cuerpo contra la tela, como planos con anticipación"
```

### Tarea 10: Cierre de la parte 1 (el controlador)

**Files:** ninguno nuevo.

- [ ] **Step 1:** `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui` en `feat/tela-prenda-completa`, con `fix/uniones-de-costura` ya mergeada en ella.
- [ ] **Step 2:** El banco privado, como al cerrar la Tarea 8, con el contacto propio encendido: `VINA_REFERENCIAS=<carpeta privada> npm run bench:tela -- --motor=implicito`. Anota la tabla.
- [ ] **Step 3:** El informe para Samuel: qué quedó hecho, las medidas de cada punto de decisión (el resorte de costura de la Tarea 4, las razones de energía de la Tarea 5, la esfera y el plano inclinado de la Tarea 8, el banco) y lo que pasa a la parte 2. La rama no se sube sola: va con la parte 2, que lleva todo esto a la GPU y compara la camiseta contra la referencia.
