# La prenda en la GPU — plan de implementación (entrega 4, parte 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El motor implícito simula en la GPU la prenda completa de la parte 1 (costuras, bisagras de costura, margen, el cuerpo con su BVH, planos de contacto con fricción y la tela contra sí misma) con la misma física que la CPU, y la camiseta de María corre en el banco contra la referencia privada: primero en la CPU, después en la GPU.

**Architecture:** La CPU en doble precisión sigue siendo la fuente de verdad. Primero se arma la camiseta para el motor y se corre en la CPU contra la referencia, sobre su avatar y desde su colocación inicial (E5), para ver la física antes de portarla. Después, cada pieza de la física pasa a WGSL en el mismo orden de `paso.ts`, con su prueba de paridad en una escena chica (menos de 0,1 mm tras 3 cuadros, @gpu-local). Al final, la camiseta corre en la GPU y se mide su velocidad. El contacto propio se queda solo con el vértice que cae sobre la cara de un triángulo (E6), así los pares caben en la GPU.

**Tech Stack:** TypeScript 5.6, vitest 4, WGSL escrito a mano sobre WebGPU (`@webgpu/types`), Playwright con GPU real (`playwright.webgpu.config.ts`), `three-mesh-bvh` a través de `buildLinearBVH` (`src/utils/cloth/gpu/bvh.ts`).

**Spec:** `docs/superpowers/specs/2026-10-13-tela-nueva-design.md` (§2, §4.2.2, §4.3, §4.4.2 y §4.4.3) y el plan de la parte 1 (`docs/superpowers/plans/2026-10-14-la-prenda-en-la-cpu.md`, con sus enmiendas E1-E4). Lee los dos antes de empezar. Las decisiones de la parte 1 (R1-R13) están en su registro: `.superpowers/sdd/2026-10-14-la-prenda-en-la-cpu/progress.md`.

## Qué entra y qué no

- **Entra:** la camiseta de María armada para el motor; su banco contra la referencia en la CPU (§4.4.2) con la enmienda E5; E6 en el contacto propio de la CPU; en la GPU, los planos de contacto con fricción (E4), las costuras con su cierre y sus bisagras (E1, E2), el margen, el cuerpo con su BVH, el contacto propio con su rejilla (§4.3.2 con E3 y E6) y las puntas del cuerpo contra la tela; la camiseta en la GPU con su velocidad y su quietud (§4.4.3).
- **Parte 3 (otro plan):** la biblioteca (§4.1.7), la colocación del torso (§4.3.4), los datos en `prepararTela`, el interruptor `vina-motor-implicito`, la vista 3D y la caja negra (§4.5). Allí se comparan también la colocación y el cuerpo de Vina.
- **No entra:** arista-arista (E3), la curva `endurece`, varias telas en una prenda, más de un cuerpo en la GPU, el despacho indirecto y cualquier otra optimización de velocidad (subproyecto 1). Si la camiseta no llega a 17 ms por cuadro, el informe lo dice con sus medidas; no se cambia la física para ganar tiempo.

## Enmiendas al spec (las aprueba Samuel con este plan)

- **E5 (§4.4.2). La camiseta se compara sobre el avatar de la referencia y desde su colocación inicial.** La referencia se midió sobre su propio avatar, no sobre el cuerpo por defecto de Vina. Para aislar el motor, Vina simula sobre ese mismo avatar y arranca desde la misma colocación: las posiciones del primer cuadro de la referencia pasan a la malla de Vina por las coordenadas del patrón (cada pieza del OBJ trae su patrón en las coordenadas de textura). Los archivos viven en la carpeta privada; el repo solo tiene el lector de OBJ y el traslado, sin nombres ni números de la referencia. *Costo si es un error:* esta comparación no mide la colocación ni el cuerpo de Vina; los mide la parte 3, sobre el cuerpo de Vina.
- **E6 (§4.3.2, sobre E3). Un par vértice-triángulo de la tela entra solo si el vértice cae sobre la cara del triángulo** (su punto más cercano queda dentro de la cara), igual que los pares de las puntas del cuerpo (R13). Dentro del radio de anticipación (hasta 2 cm), los vecinos de la misma capa son candidatos cuyo plano queda de canto: su normal está en el plano de la tela y nunca sostienen nada. A 2 cm son unos 70 por vértice. En la GPU no caben: la camiseta pediría más de 4 millones de pares, más de lo que entra en un búfer de 128 MiB. En la CPU, hacen lento cada cuadro. *Costo si es un error:* un vértice que llega a la cresta convexa de otra capa por el canto, y no por la cara, no se frena; es el contacto arista-arista que E3 dejó fuera.

## Global Constraints

- Todo lo de la parte 1 sigue valiendo: SI dentro del motor; reposo en el patrón con el hilo de cada pieza; `h = 1/60` s; sin amarres, sin congelado por reloj ni topes de velocidad; separación tela-cuerpo `grosor/2 + 1 mm`; tela con tela, `grosor + 1 mm`; costuras que cierran ×0,97 por subpaso de 15; margen de ancho real; quieta con `Σ m·|v| / Σ m·g·h < 0,1 %` durante 30 cuadros (§4.2.4).
- GPU: WGSL escrito directo sobre el `GPUDevice` que llega de afuera (§4.2.2). La matriz se arma sin atómicas; el contacto propio usa atómicas solo para contar y repartir (rejilla y listas).
- Límites por defecto de WebGPU, porque el device del renderer no pide más: 8 búferes de almacenamiento por etapa y 128 MiB por búfer.
- Los índices que la GPU guarda en búferes `f32` (pares, listas, rejilla) son enteros exactos: no pasan de 2²⁴. `empaquetar` lo verifica.
- Un solo cuerpo en la GPU; con dos, `empaquetar` se niega con un error explícito.
- Paridad: menos de 0,1 mm de diferencia máxima entre CPU y GPU tras 3 cuadros, en escenas chicas (§2).
- La camiseta (§2): menos de 0,1 % de triángulos con menos de la mitad del área de su patrón; costuras con separación mediana 0 mm y máxima 1 mm; quieta sola en 10 s de tela o menos; 17 ms por cuadro o menos en la GTX 980.
- La referencia del simulador comercial no entra al repo: ni su nombre, ni sus números, ni los nombres de su avatar, ni sus formas, en código, pruebas, commits, PR o issues. Sus archivos y lo que se mide sobre ellos viven en `VINA_REFERENCIAS` (`D:\Desktop\work\vina-referencias`).
- Ningún número inventado: cada constante nueva cita de dónde sale.
- Lo pesado corre con `node scripts/pesado.mjs` (`npm run test` y `npm run bench:tela` ya lo piden solos). Nunca `--sin-admision` ni `VINA_PESADO_OMITIR`. Una prueba suelta y una sola spec de Playwright no piden candado.
- Gate por tarea: `npx tsc -b --noEmit`, `npx vitest run src/utils/cloth` y `npm run lint`, más el hook de pre-commit (como R8 de la parte 1). La suite entera (`npm run test`) y `npm run lint:ui` corren en la Tarea 10, antes de subir la rama.
- Commits en español: describen el cambio y su porqué técnico, sin líneas de atribución ni proceso.

## Review Focus

1. Una capa que el paso llevaría a través de otra en un solo cuadro: el contacto propio la anticipa y la deja encima, en la CPU y en la GPU. Lo prueban la Tarea 2 (CPU) y la escena `capas` de la Tarea 7 (GPU).
2. Una pieza cuyo dibujo trae líneas internas que salen del contorno (la línea de grano de la tira de María): la prenda se arma sin vértices sueltos y sus costuras siguen en su lugar. Lo prueba la Tarea 1.
3. Más pares de contacto de los que caben en la GPU: el motor los cuenta en su estado, no escribe fuera del búfer y la tela no se llena de NaN. Lo prueba la Tarea 7 con una capacidad de 8 pares.
4. Un cuerpo leído de un OBJ con caras de cuatro lados, o con todas las caras al revés: la distancia sale positiva afuera. Lo prueba la Tarea 3.
5. Una costura que cierra en el primer cuadro: la flexión empieza a cruzarla en el mismo cuadro en la CPU y en la GPU. Lo prueba la escena `costura-cerrada` de la Tarea 5.

## Coordinación

- Todo va en `feat/tela-prenda-completa` (worktree `.claude/worktrees/tela-prenda`). La rama ya trae main con #1257 y #1259. Se sube en la Tarea 10, con la parte 1 y la parte 2 juntas, y su PR va contra main. Mergear espera la orden de Samuel y el gate e2e del deploy.
- Las Tareas 1 a 3 son de CPU. Las Tareas 4 a 8 llevan la física a la GPU, una pieza por tarea, cada una con su escena de paridad. La Tarea 9 corre la camiseta en la GPU.
- **El punto de decisión de la Tarea 3:** si la camiseta en la CPU no cumple §2, el controlador mide la causa (`superpowers:systematic-debugging`). Un error de código se arregla dentro de la tarea. Si lo que falla es el modelo (una ley o un número del spec), para y se lo lleva a Samuel con las medidas. Las Tareas 4 a 8 no dependen de ese resultado y pueden seguir mientras tanto.
- La carpeta privada la toca solo el controlador: escribe `camiseta.json` (Tarea 3) y lee los informes. Ningún subagente la lee ni la escribe, ni corre Playwright con GPU, ni sube ramas, ni mergea, ni despliega.
- Las pruebas con GPU real corren con `VINA_E2E_PORT=5193`, un puerto propio del worktree, para no caer en el servidor de otra sesión.
- Ningún archivo de este plan está en otra rama abierta. `feat/camara-60fps` está en pausa y no los toca.

## Antes de empezar

```bash
cd /d/Desktop/projects/vina/.claude/worktrees/tela-prenda
git fetch origin && git merge --no-edit origin/main
npx tsc -b --noEmit && npm run test
```

La suite debe pasar entera. La paridad de `tests/e2e/tela-implicita.spec.ts` está roja desde la parte 1, porque la GPU mide todavía el contacto por distancia. La Tarea 4 la vuelve a verde. Todas las rutas del plan son relativas a la raíz del worktree.

## Mapa de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `src/utils/cloth/implicito/prenda.ts` | `armarPrenda` quita los vértices que ningún triángulo usa; `costurasDePrenda` los salta | 1 |
| `src/utils/cloth/implicito/banco/camiseta.ts` | la camiseta de María armada para el motor; la versión contra la referencia (E5) | 1, 3 |
| `src/utils/cloth/__tests__/camisaDeMaria.ts` | la ayuda de las pruebas, ahora sobre `banco/camiseta.ts` | 1 |
| `src/utils/cloth/implicito/contactoPropio.ts` | la rejilla de puntos | 2 |
| `src/utils/cloth/implicito/sistema.ts` | pares sobre la cara (E6), rejilla de puntos, fricción de las puntas | 2 |
| `src/utils/cloth/implicito/banco/obj.ts` | leer un OBJ; el cuerpo y la malla de un OBJ | 3 |
| `src/utils/cloth/implicito/banco/colocacion.ts` | la colocación de un OBJ llevada a la malla de Vina por el patrón (E5) | 3 |
| `src/utils/cloth/implicito/banco/medidas.ts` | estiramiento, costuras, pliegues y distancias | 3 |
| `bench/_banco.ts`, `bench/telaNueva.ts`, `bench/motorImplicito.ts` | el ensayo `camiseta` en la CPU | 3 |
| `src/utils/cloth/implicito/banco/escenas.ts` | las escenas de paridad: apoyada, costura, esfera, inclinada, capas, punta | 4-8 |
| `src/utils/cloth/implicito/gpu/empaquetar.ts` | lo que la GPU lee: contactos, costuras, cuerpo, contacto propio | 4-8 |
| `src/utils/cloth/implicito/gpu/wgsl.ts` | la memoria y el WGSL del cuadro | 4-8 |
| `src/utils/cloth/implicito/gpu/wgslCuerpo.ts` | el punto más cercano y el BVH del cuerpo, en WGSL | 6 |
| `src/utils/cloth/implicito/gpu/wgslPropio.ts` | la rejilla, los pares y sus listas, en WGSL | 7, 8 |
| `src/utils/cloth/implicito/gpu/motorGpu.ts` | los búferes y el orden de los despachos | 4-8 |
| `src/components/testScenes/TelaImplicitaHarness.tsx` | las escenas nuevas y la camiseta | 4-9 |
| `tests/e2e/tela-implicita.spec.ts` | la paridad por escena; la camiseta (@gpu-local) | 4-9 |

Las pruebas nuevas del motor van en `src/utils/cloth/implicito/__tests__/` y `src/utils/cloth/implicito/gpu/__tests__/`. Antes de la Tarea 1, el controlador borra `bench/_sonda-camiseta.ts`, la sonda sin seguimiento que escribió al preparar este plan.

---
## La camiseta en la CPU

### Tarea 1: La camiseta de María se arma para el motor

El mallador mete en la malla los puntos de toda línea interna, también los que caen fuera del contorno. La línea de grano de la tira de María mide 180 mm sobre una tira de 41: a 5 mm deja 28 vértices sueltos, que ningún triángulo usa, y las mangas dejan uno cada una. `prepararReposo` se niega con razón («el vértice X no está en ningún triángulo»). `armarPrenda` los quita y deja en cada pieza el índice nuevo de cada vértice, para que las costuras lo salten. El arreglo de fondo está en el mallador (`convertToPSLG` no recorta las líneas internas al contorno), pero cambia la malla de los tres tiers de hoy: queda para un issue aparte, que propone el informe de la Tarea 10. La camiseta se arma en `banco/camiseta.ts`, sobre los mismos pasos que la ayuda de las pruebas, que pasa a usarlo.

**Files:**
- Modify: `src/utils/cloth/implicito/prenda.ts` (`RangoDePieza`, `armarPrenda`, `costurasDePrenda`)
- Create: `src/utils/cloth/implicito/banco/camiseta.ts`
- Modify: `src/utils/cloth/__tests__/camisaDeMaria.ts`
- Test: `src/utils/cloth/implicito/__tests__/prenda.test.ts`, `src/utils/cloth/implicito/__tests__/camiseta.test.ts`

**Interfaces:**
- Consumes: `seamInitDataToPairs(seamData, pieces): SeamPair[]` (`src/utils/cloth/seamPairs.ts`, con `lados`); `seamsToInitData(seams)` (`src/components/Viewport3D/costurasDeLaSimulacion.ts`); `meshPiece(piece, opciones)` (`src/utils/mesh`); `grainlineEndpoints(path): [Point2D, Point2D] | null` (`src/utils/grainLine.ts`).
- Produces:
  - `prenda.ts`: `RangoDePieza.local: Int32Array` (el índice en la pieza armada de cada vértice de la pieza tal como llegó, −1 si se quitó).
  - `banco/camiseta.ts`: `MEDIDAS_DE_MARIA: BodyMeasurements`, `piezasDeMaria(dxf: string): PatternPiece[]`, `costurasDeMaria(piezas: PatternPiece[]): Seam[]`, `type PiezaMallada = PieceWithOutline & { triIds: Int32Array; uvs?: Float32Array }`, `mallarPiezas(piezas: PatternPiece[], aristaMm: number): PiezaMallada[]`, `patronDe(m: PiezaMallada): Float64Array`, `hiloDe(p: PatternPiece): readonly [number, number] | undefined`, `type Colocacion = (piezas: readonly PatternPiece[], mallas: readonly PiezaMallada[]) => Float64Array[]`, `interface Camiseta { piezas; mallas; prenda: Prenda; costuras: { puntos: PuntoDeCostura[]; bisagras: BisagraDeCostura[] }; lados: LadosDeCostura[]; franja: Uint8Array }`, `camisetaDeMaria(dxf: string, aristaMm: number, tela: TelaFisica, colocar: Colocacion): Camiseta`.

- [ ] **Step 1: Escribe las pruebas de la prenda con vértices sueltos**

Al final del `describe` de `src/utils/cloth/implicito/__tests__/prenda.test.ts` (imports nuevos: `costurasDePrenda` de `../prenda`, `type SeamPair` de `../../seamPairs`, `borde` de `./ayudas`):

```ts
  it('quita los vértices que ningún triángulo usa, y las costuras los saltan sin correrse', () => {
    const A = mallaDeContorno(rectangulo(0, 0, 50, 30), 10), B = mallaDeContorno(rectangulo(0, 0, 50, 30), 10);
    const nA = A.x.length / 3;
    // un punto suelto al final de A, como los que deja una línea interna que sale del contorno
    const conSuelto: PiezaDeTela = { id: 'A', x: Float64Array.from([...A.x, 0.2, 0, 0.2]), patron: Float64Array.from([...A.patron, 0.2, 0.2]), tris: A.tris };
    const prenda = armarPrenda([conSuelto, { id: 'B', ...B, x: Float64Array.from(B.x, (q, k) => (k % 3 === 0 ? q + 0.08 : q)) }]);
    expect(prenda.piezas.map((p) => [p.v0, p.nv])).toEqual([[0, nA], [nA, B.x.length / 3]]);
    expect(prenda.piezas[0].local[nA]).toBe(-1);
    expect(() => new SistemaTela(prenda.malla, TELA_DE_LABORATORIO)).not.toThrow();
    const par: SeamPair = { pieceAId: 'A', pieceBId: 'B', vertexPairs: [], compliance: 0, tensionFactor: 1, lados: { a: borde(A, 0.05), b: borde(B, 0) } };
    expect(costurasDePrenda(prenda, [par]).lados[0]).toEqual({ a: borde(A, 0.05), b: borde(B, 0, nA) });
  });

  it('una costura que pide un vértice quitado se rechaza diciendo cuál', () => {
    const A = mallaDeContorno(rectangulo(0, 0, 50, 30), 10), nA = A.x.length / 3;
    const prenda = armarPrenda([
      { id: 'A', x: Float64Array.from([...A.x, 0.2, 0, 0.2]), patron: Float64Array.from([...A.patron, 0.2, 0.2]), tris: A.tris },
      { id: 'B', ...A },
    ]);
    const par: SeamPair = { pieceAId: 'A', pieceBId: 'B', vertexPairs: [], compliance: 0, tensionFactor: 1, lados: { a: [nA], b: [0] } };
    expect(() => costurasDePrenda(prenda, [par])).toThrow(new RegExp(`vértice ${nA} de A`));
  });
```

- [ ] **Step 2: Corre las pruebas y mira que fallen**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/prenda.test.ts`
Expected: FAIL. La primera falla en el `toEqual` de los rangos (A trae `nA + 1` vértices) y la segunda en `local` indefinido.

- [ ] **Step 3: Quita los vértices sueltos en `armarPrenda`**

En `src/utils/cloth/implicito/prenda.ts`, `RangoDePieza` gana su campo:

```ts
export interface RangoDePieza {
  id: string;
  v0: number;
  nv: number;
  t0: number;
  nt: number;
  margenMm?: number;
  /**
   * El índice en la pieza armada de cada vértice de la pieza tal como llegó; −1 si ningún triángulo lo usaba y se
   * quitó. El mallador deja así los puntos de una línea interna que sale del contorno (la línea de grano de la tira
   * de María); el reposo no admite vértices sin triángulo.
   */
  local: Int32Array;
}
```

`armarPrenda` queda:

```ts
export function armarPrenda(piezas: readonly PiezaDeTela[]): Prenda {
  if (piezas.length > 0xffff) throw new Error('armarPrenda: más piezas de las que caben en un Uint16');
  // los vértices que usa algún triángulo de su pieza, numerados de nuevo en su orden
  const locales = piezas.map((p) => {
    const local = new Int32Array(p.x.length / 3).fill(-1);
    for (let q = 0; q < p.tris.length; q++) local[p.tris[q]] = 0;
    let k = 0;
    for (let i = 0; i < local.length; i++) if (local[i] === 0) local[i] = k++;
    return { local, nv: k };
  });
  let nv = 0, nt = 0;
  piezas.forEach((p, k) => {
    nv += locales[k].nv;
    nt += p.tris.length / 3;
  });
  const x = new Float64Array(3 * nv), patron = new Float64Array(2 * nv), tris = new Uint32Array(3 * nt);
  const piezaDeTri = new Uint16Array(nt), fijos = new Uint8Array(nv);
  let hayFijos = false, v0 = 0, t0 = 0;
  const rangos: RangoDePieza[] = [];
  piezas.forEach((p, k) => {
    const { local, nv: n } = locales[k], m = p.tris.length / 3;
    const uv = aMarcoDelHilo(Float64Array.from(p.patron), p.hilo);
    for (let i = 0; i < local.length; i++) {
      const j = local[i];
      if (j < 0) continue;
      for (let d = 0; d < 3; d++) x[3 * (v0 + j) + d] = p.x[3 * i + d];
      patron[2 * (v0 + j)] = uv[2 * i];
      patron[2 * (v0 + j) + 1] = uv[2 * i + 1];
      if (p.fijos?.[i]) {
        fijos[v0 + j] = 1;
        hayFijos = true;
      }
    }
    for (let q = 0; q < 3 * m; q++) tris[3 * t0 + q] = local[p.tris[q]] + v0;
    piezaDeTri.fill(k, t0, t0 + m);
    rangos.push({ id: p.id, v0, nv: n, t0, nt: m, margenMm: p.margenMm, local });
    v0 += n;
    t0 += m;
  });
  return { malla: { x, patron, tris, piezaDeTri, ...(hayFijos ? { fijos } : {}) }, piezas: rangos };
}
```

`costurasDePrenda` lleva cada vértice de los lados por `local`:

```ts
export function costurasDePrenda(prenda: Prenda, pares: readonly SeamPair[]): { puntos: PuntoDeCostura[]; lados: LadosDeCostura[] } {
  const rango = new Map(prenda.piezas.map((p) => [p.id, p]));
  const global = (r: RangoDePieza, v: number) => {
    const j = r.local[v];
    if (j === undefined || j < 0) throw new Error(`costurasDePrenda: el vértice ${v} de ${r.id} está en una costura pero en ningún triángulo`);
    return r.v0 + j;
  };
  const puntos: PuntoDeCostura[] = [], lados: LadosDeCostura[] = [];
  for (const par of pares) {
    const ra = rango.get(par.pieceAId), rb = rango.get(par.pieceBId);
    if (!ra || !rb) throw new Error(`costurasDePrenda: falta una pieza de la costura ${par.pieceAId}↔${par.pieceBId}`);
    if (!par.lados) throw new Error('costurasDePrenda: el par no trae sus lados (los arma seamInitDataToPairs)');
    const lado = { a: par.lados.a.map((v) => global(ra, v)), b: par.lados.b.map((v) => global(rb, v)) };
    lados.push(lado);
    puntos.push(...puntosDeCostura(prenda.malla.patron, lado.a, lado.b));
  }
  return { puntos, lados };
}
```

El encabezado de `costurasDePrenda` agrega: «Los índices de los lados son los de cada pieza tal como llegó; un vértice que `armarPrenda` quitó no puede estar en una costura.»

- [ ] **Step 4: Corre las pruebas de la prenda**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/prenda.test.ts`
Expected: PASS (las 5).

- [ ] **Step 5: Escribe la prueba de la camiseta**

`src/utils/cloth/implicito/__tests__/camiseta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { camisetaDeMaria, hiloDe, piezasDeMaria, type Colocacion } from '../banco/camiseta';
import { TELA_DE_LABORATORIO } from '../banco/escenas';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';

const DXF = readFileSync(resolve(__dirname, '../../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf'), 'utf-8');

/** Cada pieza acostada en y = 1 m, una al lado de la otra: para armarla, la colocación no importa. */
const enFila: Colocacion = (_piezas, mallas) => mallas.map((m, k) => Float64Array.from(m.vertices, (q, j) => (j % 3 === 0 ? q + 0.7 * k : j % 3 === 1 ? 1 : q)));

describe('la camiseta de María para el motor implícito', () => {
  it('a 20 mm se arma: cinco piezas sin vértices sueltos, sus costuras, sus bisagras, su margen y un paso que no sube G', () => {
    const c = camisetaDeMaria(DXF, 20, TELA_DE_LABORATORIO, enFila);
    expect(c.prenda.piezas).toHaveLength(5);
    // la tira y las dos mangas traían vértices sueltos (Tarea 1 del plan de la parte 2)
    expect(c.prenda.piezas.filter((p) => p.local.some((j) => j < 0)).length).toBeGreaterThanOrEqual(1);
    expect(c.lados.length).toBeGreaterThanOrEqual(15);
    expect(c.costuras.puntos.length).toBeGreaterThan(400);
    expect(c.costuras.bisagras.length).toBeGreaterThan(100);
    expect(c.franja.some((f) => f === 1)).toBe(true);
    const s = new SistemaTela(c.prenda.malla, TELA_DE_LABORATORIO, { costuras: c.costuras, franja: c.franja, ajustes: { gravedad: 0 } });
    const info = pasoImplicito(s);
    expect(info.G1).toBeLessThanOrEqual(info.G0);
  }, 120_000);

  it('cada pieza toma la urdimbre de su línea de grano', () => {
    for (const p of piezasDeMaria(DXF)) {
      const h = hiloDe(p);
      expect(h).toBeDefined();
      // en el DXF de María todas las líneas de grano van verticales
      expect(Math.abs(h![0]) / Math.hypot(h![0], h![1])).toBeLessThan(1e-3);
    }
  });
});
```

- [ ] **Step 6: Corre la prueba y mira que falle**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/camiseta.test.ts`
Expected: FAIL: no existe `../banco/camiseta`.

- [ ] **Step 7: Escribe `banco/camiseta.ts`**

```ts
/**
 * La camiseta de María para el banco (spec 2026-10-13 §4.4.2): el DXF importado y clasificado como al importarlo en la
 * app, cosido con autoSew más refineSeamsInWorld, mallado como lo malla el simulador y armado como prenda del motor
 * implícito, con sus puntos de costura (E1), sus bisagras de costura (E2) y la franja del margen. Cada pieza toma la
 * urdimbre de su línea de grano. La colocación la da quien llama: la de la referencia privada (colocacion.ts, E5 del
 * plan de la parte 2) o cualquier otra.
 */
import { importDXFContent } from '../../../dxf';
import { classifyPiecesGeometric } from '../../../geometricClassifier';
import { detectSemanticEdges } from '../../../semanticEdges';
import { autoSew } from '../../../autoSew';
import { refineSeamsInWorld } from '../../../autoSew/worldRefine';
import { grainlineEndpoints } from '../../../grainLine';
import { meshPiece } from '../../../mesh';
import { resolveArrangementWithFrames } from '../../arrangement/arrangementBinding';
import { seamInitDataToPairs, type PieceWithOutline } from '../../seamPairs';
import { seamsToInitData } from '../../../../components/Viewport3D/costurasDeLaSimulacion';
import type { BodyMeasurements, PatternPiece, Seam } from '../../../../types/types';
import type { BisagraDeCostura, PuntoDeCostura } from '../costuras';
import { armarPrenda, bisagrasDePrenda, costurasDePrenda, franjaDePrenda, type LadosDeCostura, type Prenda } from '../prenda';
import type { TelaFisica } from '../tela';

/** Las medidas con que la app refina las costuras de María en el mundo (las de seamCoverage.maria.test.ts). */
export const MEDIDAS_DE_MARIA = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;

/** Las piezas del DXF, clasificadas y con sus bordes semánticos, como al importarlas en la app. */
export function piezasDeMaria(dxf: string): PatternPiece[] {
  const piezas = importDXFContent(dxf, { unit: 'auto', autoDetect: true }).pieces;
  const clases = classifyPiecesGeometric(piezas);
  for (const p of piezas) {
    const c = clases.get(p.id);
    if (c && c.category !== 'other') {
      p.category = c.category;
      if (c.side) p.side = c.side;
    }
    p.edges = detectSemanticEdges(p);
  }
  return piezas;
}

/** Las costuras de autoSew, refinadas en el mundo como en la app. */
export function costurasDeMaria(piezas: PatternPiece[]): Seam[] {
  return refineSeamsInWorld(
    autoSew(piezas, { minConfidence: 0.3 }).seams.map((s) => s.seam),
    piezas,
    resolveArrangementWithFrames(piezas, MEDIDAS_DE_MARIA, undefined),
  );
}

export type PiezaMallada = PieceWithOutline & { triIds: Int32Array; uvs?: Float32Array };

/** Las piezas malladas con las opciones de SimulationInitClient.meshPiece, listas para seamInitDataToPairs. */
export function mallarPiezas(piezas: PatternPiece[], aristaMm: number): PiezaMallada[] {
  return piezas.map((p) => {
    const m = meshPiece(p, { yHeight: 0, scale: 0.001, maxEdgeLength: aristaMm, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12 });
    return {
      pieceId: p.id, vertices: m.vertices, triIds: m.triIds, uvs: m.uvs,
      outline: p.outline, edges: p.edges, boundaryOrig: m.boundaryOrig, meshMaxEdgeLength: aristaMm,
    };
  });
}

/** El dibujo de una pieza mallada (m): el mallador la acuesta en y = 0 con (x, z) = (x, y) del dibujo, centrada. */
export function patronDe(m: PiezaMallada): Float64Array {
  const n = m.vertices.length / 3, uv = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    uv[2 * i] = m.vertices[3 * i];
    uv[2 * i + 1] = m.vertices[3 * i + 2];
  }
  return uv;
}

/** La urdimbre de la pieza: la dirección de su línea de grano en el dibujo; sin línea, el motor la pone vertical (§4.1.2). */
export function hiloDe(p: PatternPiece): readonly [number, number] | undefined {
  const linea = p.internals?.find((l) => l.type === 'grainline');
  const puntas = linea ? grainlineEndpoints(linea.path) : null;
  if (!puntas) return undefined;
  const dx = puntas[1].x - puntas[0].x, dy = puntas[1].y - puntas[0].y;
  return Math.hypot(dx, dy) > 0 ? [dx, dy] : undefined;
}

/** Las posiciones iniciales (m) de cada pieza, 3 por vértice de su malla. */
export type Colocacion = (piezas: readonly PatternPiece[], mallas: readonly PiezaMallada[]) => Float64Array[];

export interface Camiseta {
  piezas: PatternPiece[];
  mallas: PiezaMallada[];
  prenda: Prenda;
  costuras: { puntos: PuntoDeCostura[]; bisagras: BisagraDeCostura[] };
  lados: LadosDeCostura[];
  franja: Uint8Array;
}

export function camisetaDeMaria(dxf: string, aristaMm: number, tela: TelaFisica, colocar: Colocacion): Camiseta {
  const piezas = piezasDeMaria(dxf);
  const mallas = mallarPiezas(piezas, aristaMm);
  const pares = seamInitDataToPairs(seamsToInitData(costurasDeMaria(piezas)), mallas);
  const x = colocar(piezas, mallas);
  const prenda = armarPrenda(piezas.map((p, k) => ({
    id: p.id, x: x[k], patron: patronDe(mallas[k]), tris: mallas[k].triIds, hilo: hiloDe(p), margenMm: p.seamAllowance,
  })));
  const { puntos, lados } = costurasDePrenda(prenda, pares);
  return { piezas, mallas, prenda, costuras: { puntos, bisagras: bisagrasDePrenda(prenda, lados, tela) }, lados, franja: franjaDePrenda(prenda, lados) };
}
```

Si `p.seamAllowance` no es número en `PatternPiece`, el campo es `margenMm: typeof p.seamAllowance === 'number' ? p.seamAllowance : undefined`.

- [ ] **Step 8: La ayuda de las pruebas, sobre `banco/camiseta.ts`**

`src/utils/cloth/__tests__/camisaDeMaria.ts` deja de repetir los pasos; conserva sus nombres para las pruebas que la usan (`esquinaEnDosCosturas`, `ladosDeCostura`, `collarDireccion.maria`):

```ts
/**
 * La camisa de María para las pruebas (tests/fixtures/garments/maria_patrones_samuel_2M.dxf): importada, clasificada,
 * cosida y mallada como en el simulador, con los pasos de implicito/banco/camiseta.ts.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { costurasDeMaria, mallarPiezas, MEDIDAS_DE_MARIA, piezasDeMaria } from '../implicito/banco/camiseta';
import { seamsToInitData } from '../../../components/Viewport3D/costurasDeLaSimulacion';
import type { PatternPiece, Seam } from '../../../types/types';

const DXF = resolve(__dirname, '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');

export { costurasDeMaria, MEDIDAS_DE_MARIA };

export function importarMariaClasificada(): PatternPiece[] {
  return piezasDeMaria(readFileSync(DXF, 'utf-8'));
}

/** El mismo mapeo que manda la app (costurasDeLaSimulacion.ts, seamsToInitData). */
export const aInitData = (costuras: Seam[]) => seamsToInitData(costuras);

/** Las piezas malladas con las opciones de SimulationInitClient.meshPiece, listas para seamInitDataToPairs. */
export const mallarParaCoser = mallarPiezas;
```

Antes de dejar el archivo, compara con el de hoy: si exporta algo más, lo conserva.

- [ ] **Step 9: Corre las pruebas y el gate**

Run: `npx vitest run src/utils/cloth src/utils/autoSew && npx tsc -b --noEmit && npm run lint`
Expected: PASS. Las de María de `esquinaEnDosCosturas`, `ladosDeCostura` y `collarDireccion.maria` dan lo mismo que antes, porque la ayuda corre los mismos pasos.

- [ ] **Step 10: Commit**

```bash
git add src/utils/cloth/implicito/prenda.ts src/utils/cloth/implicito/banco/camiseta.ts src/utils/cloth/__tests__/camisaDeMaria.ts src/utils/cloth/implicito/__tests__/prenda.test.ts src/utils/cloth/implicito/__tests__/camiseta.test.ts
git commit -m "feat(tela): la camiseta de María se arma para el motor implícito

armarPrenda quita los vértices que ningún triángulo usa: el mallador deja
sueltos los puntos de una línea interna que sale del contorno, como la línea
de grano de la tira, y el reposo no los admite. Cada pieza guarda el índice
nuevo de sus vértices y las costuras lo siguen. banco/camiseta.ts arma la
camiseta con los pasos de la app, la urdimbre de cada línea de grano, sus
puntos y bisagras de costura y la franja del margen; la ayuda de las pruebas
pasa a usarlo."
```

---

### Tarea 2: El contacto propio, sobre la cara (E6)

Con E6, un vértice de tela forma par con un triángulo de tela solo si su punto más cercano cae dentro de la cara (rasgo 0). La búsqueda se invierte: la rejilla guarda puntos (los vértices de la tela y los del cuerpo, cada uno en su celda) y cada triángulo mira las celdas que toca su caja agrandada por el radio. Es el mismo conjunto de pares que encuentra la rejilla de triángulos, y es lo que hará la GPU, donde cada triángulo es un hilo. La celda mide al menos el radio, así la caja de un triángulo toca a lo sumo cinco celdas por eje. De paso se arregla la fricción de las puntas del cuerpo: usaban la de la tela contra sí misma, y es tela contra cuerpo (§4.3.1).

**Files:**
- Modify: `src/utils/cloth/implicito/contactoPropio.ts` (`RejillaDePuntos` en lugar de `RejillaDeTriangulos`; encabezado)
- Modify: `src/utils/cloth/implicito/sistema.ts` (`armarParesPropios`; `excluidos` y `aristaMedia` públicos; los puntos de los cuerpos)
- Test: `src/utils/cloth/implicito/__tests__/contactoPropio.test.ts`

**Interfaces:**
- Consumes: `puntoMasCercano(...)` y `PuntoEnTriangulo.rasgo` (`cuerpo.ts`); `CuerpoRigido.vertices` y `.normales`.
- Produces:
  - `contactoPropio.ts`: `class RejillaDePuntos { armar(puntos: ArrayLike<number>, celda: number): void; enCaja(x0, y0, z0, x1, y1, z1, cada: (p: number) => void): void }`.
  - `sistema.ts`: `readonly excluidos: number[][]` (por vértice: él y sus compañeros de costura) y `readonly aristaMedia: number` (m, la arista media del patrón). Los dos los lee `empaquetar` en la Tarea 7.

- [ ] **Step 1: Escribe las pruebas**

En `src/utils/cloth/implicito/__tests__/contactoPropio.test.ts`, la primera prueba (la de `RejillaDeTriangulos`) se reemplaza por la de la rejilla de puntos, y se agregan tres más al final del `describe`. Imports: `RejillaDePuntos` en lugar de `RejillaDeTriangulos`; `CuerpoRigido` y `piramideDeColision` ya están.

```ts
  it('la rejilla de puntos da todo punto que cae dentro de la caja', () => {
    const r = azar(71), P = Float64Array.from({ length: 3 * 500 }, () => 0.2 * r());
    const rejilla = new RejillaDePuntos();
    rejilla.armar(P, 0.013);
    for (let caso = 0; caso < 100; caso++) {
      const c = [0.2 * r(), 0.2 * r(), 0.2 * r()], m = 0.02 * (r() + 0.5);
      const vistos = new Set<number>();
      rejilla.enCaja(c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m, (p) => vistos.add(p));
      for (let p = 0; p < 500; p++) {
        if ([0, 1, 2].every((d) => Math.abs(P[3 * p + d] - c[d]) <= m)) expect(vistos.has(p)).toBe(true);
      }
    }
  });
```

```ts
  it('una lámina sola no tiene pares, aunque un vértice corra (E6: la tela de al lado no es otra capa)', () => {
    const s = new SistemaTela(mallaDeContorno(rectangulo(-60, -60, 60, 60), 10), TELA_DE_LABORATORIO);
    s.v[0] = 1.2; // a 1,2 m/s el radio de búsqueda llega a su tope de 2 cm
    s.xt.set(s.x);
    s.armarParesPropios();
    expect(s.paresPropios).toHaveLength(0);
  });

  it('una capa que viene rápido no atraviesa la de abajo en un cuadro (la anticipación)', () => {
    // la de arriba a 6 mm y bajando a 0,6 m/s: sola, el paso la llevaría 10 mm más abajo
    const abajo = mallaDeContorno(rectangulo(-60, -60, 60, 60), 10), arriba = mallaDeContorno(rectangulo(-40, -40, 40, 40), 10, 0.006);
    const nAbajo = abajo.x.length / 3;
    const prenda = armarPrenda([{ id: 'abajo', ...abajo, fijos: new Uint8Array(nAbajo).fill(1) }, { id: 'arriba', ...arriba }]);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { ajustes: { gravedad: 0 } });
    for (let i = nAbajo; i < s.n; i++) s.v[3 * i + 1] = -0.6;
    pasoImplicito(s);
    let masBajo = Infinity;
    for (let i = nAbajo; i < s.n; i++) masBajo = Math.min(masBajo, s.x[3 * i + 1]);
    expect(masBajo).toBeGreaterThan(sepTela - 0.0005);
  });

  it('las puntas del cuerpo frenan con la fricción de la tela contra el cuerpo', () => {
    const cuerpo = new CuerpoRigido(buildLinearBVH(piramideDeColision(0.3, 0.1)));
    const m = mallaDeContorno(rectangulo(-60, -60, 60, 60), 20);
    // la punta ya pasó la tela 1 mm, en medio de un triángulo (los mismos corrimientos de la prueba de la pirámide)
    m.x = Float64Array.from(m.x, (q, k) => (k % 3 === 0 ? q + 0.007 : k % 3 === 1 ? q + 0.099 : q + 0.003));
    const s = new SistemaTela(m, { ...TELA_DE_LABORATORIO, friccionTela: 0 }, { obstaculos: [{ tipo: 'cuerpo', cuerpo }] });
    s.xt.set(s.x);
    s.armarParesPropios();
    const puntas = s.paresPropios.filter((p) => p.v.length === 3);
    expect(puntas.length).toBeGreaterThan(0);
    expect(puntas.every((p) => p.kt > 0)).toBe(true);
  });
```

- [ ] **Step 2: Corre las pruebas y mira cuáles fallen**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/contactoPropio.test.ts`
Expected: FAIL. La de la rejilla falla porque no existe `RejillaDePuntos`. La de la lámina sola falla porque hoy aparecen decenas de pares de canto. La de las puntas falla porque su `kt` es 0 (usa `friccionTela`). La de la capa rápida es la red de la Review Focus 1: puede pasar ya; cuenta que pasa también después.

- [ ] **Step 3: La rejilla de puntos**

En `src/utils/cloth/implicito/contactoPropio.ts`, `RejillaDeTriangulos` se reemplaza por:

```ts
/** Una rejilla de puntos: cada punto en la celda que lo contiene. Quien busca pasa una caja y recibe los de sus celdas. */
export class RejillaDePuntos {
  private readonly celdas = new Map<number, number[]>();
  private c = 1;

  private clave(ix: number, iy: number, iz: number): number {
    return ((ix + 4096) * 8192 + (iy + 4096)) * 8192 + (iz + 4096);
  }

  /** `puntos`: [x0, y0, z0, x1, …] (m); `celda`: el lado de cada celda (m). */
  armar(puntos: ArrayLike<number>, celda: number): void {
    this.celdas.clear();
    this.c = celda;
    for (let p = 0; p < puntos.length / 3; p++) {
      const k = this.clave(Math.floor(puntos[3 * p] / celda), Math.floor(puntos[3 * p + 1] / celda), Math.floor(puntos[3 * p + 2] / celda));
      const lista = this.celdas.get(k);
      if (lista) lista.push(p);
      else this.celdas.set(k, [p]);
    }
  }

  /** Llama a `cada` con los puntos de las celdas que toca la caja: entre ellos están todos los de adentro. */
  enCaja(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, cada: (p: number) => void): void {
    const c = this.c;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) {
      for (let iy = Math.floor(y0 / c); iy <= Math.floor(y1 / c); iy++) {
        for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
          const lista = this.celdas.get(this.clave(ix, iy, iz));
          if (lista) for (const p of lista) cada(p);
        }
      }
    }
  }
}
```

El encabezado del archivo dice ahora: «… pares de un vértice de tela y un triángulo de tela cuando el vértice cae sobre la cara del triángulo (E6 del plan de la parte 2) más cerca que la separación entre capas, hallados con una rejilla de puntos que cada triángulo recorre en su caja, …».

- [ ] **Step 4: Los pares, desde cada triángulo**

En `src/utils/cloth/implicito/sistema.ts`:

1. Los campos: `private readonly rejilla: RejillaDeTriangulos` pasa a `private readonly rejilla = new RejillaDePuntos();`; `private readonly excluidos` pasa a `readonly excluidos: number[][]` con el comentario «por vértice: él y sus compañeros de costura, cuyos triángulos no cuentan para su contacto propio (lo lee también empaquetar)»; se agregan
   ```ts
   /** la arista media del patrón (m): el lado mínimo de la celda de la rejilla del contacto propio */
   readonly aristaMedia: number;
   /** los cuerpos rígidos de los obstáculos, en orden: sus vértices van en la rejilla detrás de los de la tela */
   private readonly cuerpos: CuerpoRigido[];
   /** las posiciones que guarda la rejilla: la tela (se copia cada cuadro) y los vértices de cada cuerpo */
   private readonly puntos: Float64Array;
   /** por cuerpo, 1 = ese vértice del cuerpo sostenía la tela el cuadro anterior */
   private sostiene: Uint8Array[];
   ```
   y se borra `private readonly sostiene = new Map<object, Uint8Array>();`. El import de `cuerpo` agrega `type CuerpoRigido`.
2. En el constructor, en lugar de armar `this.rejilla = new RejillaDeTriangulos(...)`:
   ```ts
   this.aristaMedia = largo / Math.max(1, malla.tris.length);
   this.cuerpos = this.obstaculos.flatMap((o) => (o.tipo === 'cuerpo' ? [o.cuerpo] : []));
   this.puntos = new Float64Array(3 * this.n + this.cuerpos.reduce((s, c) => s + c.vertices.length, 0));
   let o = 3 * this.n;
   for (const c of this.cuerpos) {
     this.puntos.set(c.vertices, o);
     o += c.vertices.length;
   }
   this.sostiene = this.cuerpos.map((c) => new Uint8Array(c.vertices.length / 3));
   ```
   (el bucle que suma `largo` se queda donde está).
3. `armarParesPropios` queda:

```ts
  armarParesPropios(): void {
    this.paresPropios = [];
    if (!this.aj.contactoPropio) return;
    const { x, v, tris, fijo, n, punto: q } = this, sep = this.sepPropia, { kContacto: kc, h, gravedad } = this.aj;
    let vmax = 0;
    for (let i = 0; i < n; i++) vmax = Math.max(vmax, Math.hypot(v[3 * i], v[3 * i + 1], v[3 * i + 2]));
    const radio = sep + Math.min(ALCANCE_MAXIMO, 2 * vmax * h + Math.abs(gravedad) * h * h);
    this.puntos.set(x);
    // la celda mide al menos el radio: la caja de un triángulo toca a lo sumo cinco celdas por eje
    this.rejilla.armar(this.puntos, Math.max(2 * sep, this.aristaMedia, radio));
    const agregar = (vs: number[], ws: number[], nx: number, ny: number, nz: number, s0: number, separacionDelPar: number, mu: number) => {
      const p0 = separacionDelPar - s0;
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
    const ahora = this.cuerpos.map((c) => new Uint8Array(c.vertices.length / 3));
    for (let t = 0; t < tris.length / 3; t++) {
      const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
      const ax = x[3 * a], ay = x[3 * a + 1], az = x[3 * a + 2], bx = x[3 * b], by = x[3 * b + 1], bz = x[3 * b + 2];
      const cx = x[3 * c], cy = x[3 * c + 1], cz = x[3 * c + 2];
      const libres = !(fijo[a] && fijo[b] && fijo[c]);
      this.rejilla.enCaja(
        Math.min(ax, bx, cx) - radio, Math.min(ay, by, cy) - radio, Math.min(az, bz, cz) - radio,
        Math.max(ax, bx, cx) + radio, Math.max(ay, by, cy) + radio, Math.max(az, bz, cz) + radio,
        (p) => {
          if (p < n) {
            if (fijo[p]) return;
            const fuera = this.excluidos[p];
            if (fuera.includes(a) || fuera.includes(b) || fuera.includes(c)) return;
            const px = x[3 * p], py = x[3 * p + 1], pz = x[3 * p + 2];
            puntoMasCercano(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, q);
            // E6: solo el vértice que cae sobre la cara; el de al lado, en la misma capa, mira la tela de canto
            if (q.rasgo !== 0) return;
            const ex = px - q.x, ey = py - q.y, ez = pz - q.z, d = Math.hypot(ex, ey, ez);
            if (d >= radio || d < 1e-9) return;
            agregar([p, a, b, c], [1, -q.wa, -q.wb, -q.wc], ex / d, ey / d, ez / d, d, sep, this.tela.friccionTela);
            return;
          }
          if (!libres) return;
          let k = 0, j = p - n;
          while (j >= this.cuerpos[k].vertices.length / 3) j -= this.cuerpos[k++].vertices.length / 3;
          const cuerpo = this.cuerpos[k], yx = cuerpo.vertices[3 * j], yy = cuerpo.vertices[3 * j + 1], yz = cuerpo.vertices[3 * j + 2];
          puntoMasCercano(yx, yy, yz, ax, ay, az, bx, by, bz, cx, cy, cz, q);
          // (aquí va, sin cambios, el comentario de la parte 1 sobre las puntas: rasgo 0, la separación del cuerpo, R13)
          if (q.rasgo !== 0 || Math.hypot(yx - q.x, yy - q.y, yz - q.z) >= radio) return;
          const nx = cuerpo.normales[3 * j], ny = cuerpo.normales[3 * j + 1], nz = cuerpo.normales[3 * j + 2];
          const s0 = nx * (q.x - yx) + ny * (q.y - yy) + nz * (q.z - yz);
          if (!(s0 < 0 || (this.sostiene[k][j] && s0 < this.sep))) return;
          ahora[k][j] = 1;
          // tela contra cuerpo: la fricción del cuerpo (§4.3.1)
          agregar([a, b, c], [q.wa, q.wb, q.wc], nx, ny, nz, s0, this.sep, this.tela.friccionCuerpo);
        },
      );
    }
    this.sostiene = ahora;
  }
```

El comentario de doc de `armarParesPropios` dice ahora: «Los pares del contacto propio en x_t (§4.3.2, E3 y E6): cada triángulo de tela mira, en la rejilla de puntos, los que caen en su caja agrandada por el radio de búsqueda. Un vértice libre de tela entra si cae sobre la cara a menos del radio (salvo los vértices del triángulo y sus compañeros de costura); un vértice del cuerpo, si atravesó la tela por la cara o la sostenía el cuadro anterior. Entra activo el que ya está dentro de la separación, con su fricción.» Se borran el import de `RejillaDeTriangulos` y la caja de la tela que filtraba los vértices del cuerpo: la rejilla ya no los visita si ningún triángulo queda cerca.

- [ ] **Step 5: Corre las pruebas del contacto propio y del motor**

Run: `npx vitest run src/utils/cloth/implicito`
Expected: PASS. Las de la parte 1 (dos láminas, la costura que cierra con contacto propio, la punta de la pirámide) pasan igual: las capas caen sobre la cara de la otra.

- [ ] **Step 6: Mide que la física no cambió en el banco**

Run: `VINA_REFERENCIAS=/d/Desktop/work/vina-referencias npm run bench:tela -- --ensayo=cusick`
Expected: Cusick a 5, 10 y 20 mm a menos de 0,3 puntos del informe del 14-10 (`…09-34-46-implicito.json`), 0 % aplastados y §2 en verde. Anota en el registro los ms por cuadro de antes (180 a 5 mm) y de ahora.

- [ ] **Step 7: Gate y commit**

Run: `npx tsc -b --noEmit && npx vitest run src/utils/cloth && npm run lint`

```bash
git add src/utils/cloth/implicito/contactoPropio.ts src/utils/cloth/implicito/sistema.ts src/utils/cloth/implicito/__tests__/contactoPropio.test.ts
git commit -m "feat(tela): el contacto propio solo entre un vértice y la cara que tiene encima

Un par vértice-triángulo de la tela entra cuando el vértice cae sobre la
cara del triángulo, como las puntas del cuerpo. Dentro del radio de
anticipación, los vecinos de la misma capa eran candidatos de canto: su
normal queda en el plano de la tela y nunca sostienen nada, y a 2 cm eran
unos 70 por vértice. La rejilla guarda ahora los puntos (tela y cuerpo) y
cada triángulo recorre las celdas de su caja, como lo hará la GPU. Las
puntas del cuerpo frenan con la fricción de la tela contra el cuerpo."
```

---

### Tarea 3: La camiseta contra la referencia, en la CPU (E5)

El banco lee la colocación inicial de la referencia y su avatar, de la carpeta privada, y lleva la colocación a la malla de Vina por el patrón. Corre la camiseta en la CPU hasta que queda quieta (o 10 s de tela), y mide lo mismo sobre la camiseta de Vina y sobre la asentada de la referencia, con las mismas funciones. Los nombres de los grupos del OBJ, el orden de sus piezas y las rutas viven en `$VINA_REFERENCIAS/camiseta.json`; el repo no los conoce.

**Files:**
- Create: `src/utils/cloth/implicito/banco/obj.ts`
- Create: `src/utils/cloth/implicito/banco/colocacion.ts`
- Modify: `src/utils/cloth/implicito/banco/medidas.ts`
- Modify: `src/utils/cloth/implicito/banco/escenas.ts` (`Escena` gana `costuras`, `franja` y `v`)
- Modify: `src/utils/cloth/implicito/banco/camiseta.ts` (`ConfigCamiseta`, `camisetaContraLaReferencia`, `medirCamiseta`)
- Modify: `bench/motorImplicito.ts`, `bench/_banco.ts`, `bench/telaNueva.ts`
- Test: `src/utils/cloth/implicito/__tests__/obj.test.ts`, `__tests__/colocacion.test.ts`, `__tests__/medidas.test.ts`

**Interfaces:**
- Consumes: `CuerpoRigido`, `buildLinearBVH`, `CollisionMeshData` (`vertices` 9 por triángulo, `normals` 3 por triángulo, `triCount`); `camisetaDeMaria`, `patronDe` (Tarea 1); `aplastados` (`medidas.ts`); `correrImplicito` (`bench/motorImplicito.ts`).
- Produces:
  - `obj.ts`: `interface Obj { v: Float64Array; vt: Float64Array; tris: Uint32Array; trisT: Uint32Array; grupos: Array<{ nombre: string; t0: number; nt: number }> }`, `leerObj(texto: string): Obj`, `cuerpoDeObj(obj: Obj, grupos: readonly string[] | null, escala: number): CollisionMeshData`, `mallaDeObj(obj: Obj, escala: number, mmPorVt: number): MallaDeTela`.
  - `colocacion.ts`: `colocarDesdeObj(piezas: ReadonlyArray<{ patron: Float64Array; tris: ArrayLike<number> }>, obj: Obj, grupoDePieza: readonly number[]): { x: Float64Array[]; mmPorVt: number; error: number[] }`.
  - `medidas.ts`: `percentil(v, p)`, `estiramiento(x, malla)`, `separacionDeCosturas(x, puntos)`, `pliegues(x, malla)`, `distanciaAlCuerpo(x, cuerpo)`, `distanciaASuperficie(x, superficie)`.
  - `escenas.ts`: `Escena` gana `costuras?: OpcionesSistema['costuras']`, `franja?: Uint8Array` y `v?: Float64Array` (velocidades iniciales).
  - `camiseta.ts`: `interface ConfigCamiseta`, `interface ArchivosDeLaCamiseta`, `camisetaContraLaReferencia(archivos, aristaMm, tela)`, `medirCamiseta(x, c, cuerpo, referencia)`, `type MedidasDeCamiseta`.
  - `bench/_banco.ts`: `ensayoCamiseta(tela, mallas, ajustes): FilaCamiseta[]`, `imprimirCamiseta(filas)`.

- [ ] **Step 1: Las pruebas del OBJ**

`src/utils/cloth/implicito/__tests__/obj.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { CuerpoRigido } from '../cuerpo';
import { cuerpoDeObj, leerObj } from '../banco/obj';

/** Un cubo de 2 m centrado en el origen, con caras de cuatro lados; `alReves` invierte el sentido de todas. */
function cubo(alReves: boolean): string {
  const v = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  // caras en sentido antihorario visto desde afuera
  const caras = [[1, 4, 3, 2], [5, 6, 7, 8], [1, 2, 6, 5], [2, 3, 7, 6], [3, 4, 8, 7], [4, 1, 5, 8]];
  return [
    ...v.map((p) => `v ${p.join(' ')}`),
    'usemtl piel',
    ...caras.map((c) => `f ${(alReves ? [...c].reverse() : c).map((i) => `${i}/${i}`).join(' ')}`),
  ].join('\n');
}

describe('leer un OBJ', () => {
  it('parte las caras de cuatro lados en dos triángulos y guarda los grupos', () => {
    const obj = leerObj(`${cubo(false)}\nusemtl otro\nf 1 2 3`);
    expect(obj.v.length).toBe(24);
    expect(obj.tris.length / 3).toBe(13);
    expect(obj.grupos).toEqual([{ nombre: 'piel', t0: 0, nt: 12 }, { nombre: 'otro', t0: 12, nt: 1 }]);
  });

  it('el cuerpo de un OBJ da distancia positiva afuera, aunque sus caras vengan al revés', () => {
    for (const alReves of [false, true]) {
      const cuerpo = new CuerpoRigido(buildLinearBVH(cuerpoDeObj(leerObj(cubo(alReves)), ['piel'], 0.1)));
      expect(cuerpo.cercano(0, 0.15, 0)!.d).toBeCloseTo(0.05, 6);
      expect(cuerpo.cercano(0, 0.05, 0)!.d).toBeCloseTo(-0.05, 6);
    }
  });
});
```

- [ ] **Step 2: Corre y mira que falle**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/obj.test.ts`
Expected: FAIL: no existe `../banco/obj`.

- [ ] **Step 3: Escribe `banco/obj.ts`**

```ts
/**
 * Leer un OBJ para el banco (spec 2026-10-13 §4.4.2): la referencia privada guarda así su colocación inicial, su prenda
 * asentada y su avatar. Las caras de más de tres lados se parten en abanico; los grupos son los de `usemtl`, `g` u `o`.
 */
import type { CollisionMeshData } from '../../collisionMesh';
import type { MallaDeTela } from '../malla';

export interface Obj {
  /** posiciones, 3 por vértice, en las unidades del archivo */
  v: Float64Array;
  /** coordenadas de textura, 2 por entrada */
  vt: Float64Array;
  /** 3 índices de `v` por triángulo */
  tris: Uint32Array;
  /** 3 índices de `vt` por triángulo; los de `v` si la cara no trae textura */
  trisT: Uint32Array;
  /** los triángulos de cada grupo, en el orden del archivo */
  grupos: Array<{ nombre: string; t0: number; nt: number }>;
}

export function leerObj(texto: string): Obj {
  const v: number[] = [], vt: number[] = [], tris: number[] = [], trisT: number[] = [];
  const grupos: Obj['grupos'] = [];
  const empezar = (nombre: string) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nt === 0) ultimo.nombre = nombre;
    else grupos.push({ nombre, t0: tris.length / 3, nt: 0 });
  };
  for (const linea of texto.split('\n')) {
    const p = linea.trim().split(/\s+/);
    if (p[0] === 'v') v.push(+p[1], +p[2], +p[3]);
    else if (p[0] === 'vt') vt.push(+p[1], +p[2]);
    else if (p[0] === 'usemtl' || p[0] === 'g' || p[0] === 'o') empezar(p.slice(1).join(' '));
    else if (p[0] === 'f') {
      if (grupos.length === 0) empezar('');
      const esquinas = p.slice(1).map((s) => s.split('/').map((q) => parseInt(q, 10) - 1));
      for (let k = 1; k + 1 < esquinas.length; k++) {
        for (const e of [esquinas[0], esquinas[k], esquinas[k + 1]]) {
          tris.push(e[0]);
          trisT.push(Number.isNaN(e[1]) || e[1] === undefined ? e[0] : e[1]);
        }
        grupos[grupos.length - 1].nt++;
      }
    }
  }
  return { v: Float64Array.from(v), vt: Float64Array.from(vt), tris: Uint32Array.from(tris), trisT: Uint32Array.from(trisT), grupos };
}

/** Los triángulos de los grupos pedidos (todos con `null`). */
function triangulosDe(obj: Obj, grupos: readonly string[] | null): number[] {
  const ts: number[] = [];
  for (const g of obj.grupos) if (grupos === null || grupos.includes(g.nombre)) for (let t = g.t0; t < g.t0 + g.nt; t++) ts.push(t);
  return ts;
}

/**
 * Los grupos pedidos como cuerpo rígido, escalados (`escala` m por unidad del archivo). La normal de cada cara sale
 * del sentido de sus vértices; si el volumen con signo de todo el cuerpo da negativo, las caras venían al revés y se
 * dan vuelta todas.
 */
export function cuerpoDeObj(obj: Obj, grupos: readonly string[] | null, escala: number): CollisionMeshData {
  const ts = triangulosDe(obj, grupos);
  const vertices = new Float32Array(9 * ts.length), normals = new Float32Array(3 * ts.length);
  let volumen = 0;
  ts.forEach((t, k) => {
    const p = [0, 1, 2].map((j) => [0, 1, 2].map((d) => obj.v[3 * obj.tris[3 * t + j] + d] * escala));
    volumen += p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1]) - p[0][1] * (p[1][0] * p[2][2] - p[1][2] * p[2][0]) + p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0]);
    p.forEach((q, j) => q.forEach((c, d) => (vertices[9 * k + 3 * j + d] = c)));
  });
  const alReves = volumen < 0;
  for (let k = 0; k < ts.length; k++) {
    if (alReves) {
      for (let d = 0; d < 3; d++) [vertices[9 * k + 3 + d], vertices[9 * k + 6 + d]] = [vertices[9 * k + 6 + d], vertices[9 * k + 3 + d]];
    }
    const o = 9 * k;
    const ux = vertices[o + 3] - vertices[o], uy = vertices[o + 4] - vertices[o + 1], uz = vertices[o + 5] - vertices[o + 2];
    const wx = vertices[o + 6] - vertices[o], wy = vertices[o + 7] - vertices[o + 1], wz = vertices[o + 8] - vertices[o + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
    normals[3 * k] = nx / l;
    normals[3 * k + 1] = ny / l;
    normals[3 * k + 2] = nz / l;
  }
  return { vertices, normals, triCount: ts.length };
}

/**
 * Una prenda de un OBJ como malla de tela, para medirla igual que la de Vina: las posiciones escaladas (`escala` m por
 * unidad) y el patrón de sus coordenadas de textura (`mmPorVt` mm por unidad de textura). Cada esquina con su propia
 * coordenada de textura queda como un vértice aparte.
 */
export function mallaDeObj(obj: Obj, escala: number, mmPorVt: number): MallaDeTela {
  const nt = obj.tris.length / 3, n = obj.v.length / 3;
  const x = Float64Array.from(obj.v, (q) => q * escala), patron = new Float64Array(2 * n);
  for (let k = 0; k < 3 * nt; k++) {
    const i = obj.tris[k], j = obj.trisT[k];
    patron[2 * i] = (obj.vt[2 * j] * mmPorVt) / 1000;
    patron[2 * i + 1] = (obj.vt[2 * j + 1] * mmPorVt) / 1000;
  }
  return { x, patron, tris: Uint32Array.from(obj.tris) };
}
```

`mallaDeObj` supone una coordenada de textura por vértice: el banco lo verifica en el Step 10 sobre los OBJ de la referencia (cuántos vértices traen dos coordenadas distintas). Si alguno las trae, `mallaDeObj` parte esos vértices y el informe lo anota.

- [ ] **Step 4: Corre las pruebas del OBJ**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/obj.test.ts`
Expected: PASS.

- [ ] **Step 5: La prueba del traslado de la colocación**

`src/utils/cloth/implicito/__tests__/colocacion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { colocarDesdeObj } from '../banco/colocacion';
import { mallaDeContorno } from '../malla';
import type { Obj } from '../banco/obj';

/** Una L de 120 × 80 mm: no tiene simetría, así que un espejo equivocado no pasa. */
const ELE: Array<[number, number]> = [[0, 0], [120, 0], [120, 30], [40, 30], [40, 80], [0, 80]];

/** El patrón (m) envuelto en un cilindro de 20 cm de radio alrededor del eje y, sin estirarlo. */
const envolver = (px: number, py: number): [number, number, number] => [0.2 * Math.sin(px / 0.2), -py, 0.2 * Math.cos(px / 0.2)];

/** La otra malla (7 mm): sus coordenadas de textura son el patrón centrado en su caja, a `porMm` por mm y con el eje v al revés. */
function otraMalla(porMm: number): Obj {
  const m = mallaDeContorno(ELE, 7);
  const n = m.x.length / 3;
  const v = new Float64Array(3 * n), vt = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = envolver(m.patron[2 * i], m.patron[2 * i + 1]);
    v.set([1000 * x, 1000 * y, 1000 * z], 3 * i);
    vt[2 * i] = (1000 * m.patron[2 * i] - 60) * porMm;
    vt[2 * i + 1] = -(1000 * m.patron[2 * i + 1] - 40) * porMm;
  }
  return { v, vt, tris: m.tris, trisT: m.tris, grupos: [{ nombre: 'L', t0: 0, nt: m.tris.length / 3 }] };
}

describe('la colocación de otra malla, llevada a la de Vina por el patrón (E5)', () => {
  it('cada vértice de Vina cae donde la otra malla tenía ese punto del patrón', () => {
    const vina = mallaDeContorno(ELE, 10);
    const r = colocarDesdeObj([{ patron: vina.patron, tris: vina.tris }], otraMalla(1 / 123.4), [0]);
    expect(r.mmPorVt).toBeCloseTo(123.4, 0);
    expect(r.error[0]).toBeLessThan(0.5);
    let peor = 0;
    for (let i = 0; i < vina.x.length / 3; i++) {
      const [x, y, z] = envolver(vina.patron[2 * i], vina.patron[2 * i + 1]);
      peor = Math.max(peor, Math.hypot(r.x[0][3 * i] - x, r.x[0][3 * i + 1] - y, r.x[0][3 * i + 2] - z));
    }
    // la cuerda de un triángulo de 7 mm sobre un radio de 20 cm se aparta 0,03 mm del cilindro
    expect(peor).toBeLessThan(2e-4);
  });

  it('se niega si las piezas no tienen el mismo tamaño', () => {
    const vina = mallaDeContorno(ELE.map(([x, y]) => [1.1 * x, y] as [number, number]), 10);
    expect(() => colocarDesdeObj([{ patron: vina.patron, tris: vina.tris }], otraMalla(1 / 123.4), [0])).toThrow(/tamaño/);
  });
});
```

- [ ] **Step 6: Corre y mira que falle**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/colocacion.test.ts`
Expected: FAIL: no existe `../banco/colocacion`.

- [ ] **Step 7: Escribe `banco/colocacion.ts`**

```ts
/**
 * La colocación de otra malla de la misma prenda, llevada a la malla de Vina por las coordenadas del patrón (E5 del plan
 * de la parte 2). Cada pieza del OBJ trae su patrón en las coordenadas de textura: centrado en su caja, a otra escala y
 * quizá espejado. Se ajustan la escala (por el ancho y el alto de las cajas) y el espejo (de los cuatro, el que deja la
 * malla de Vina más adentro de la otra); cada vértice de Vina toma la posición de su punto del patrón, por los pesos del
 * triángulo que lo contiene.
 */
import { puntoMasCercano, type PuntoEnTriangulo } from '../cuerpo';
import type { Obj } from './obj';

interface Caja {
  cx: number;
  cy: number;
  ancho: number;
  alto: number;
}

function caja(xs: number[], ys: number[]): Caja {
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, ancho: x1 - x0, alto: y1 - y0 };
}

/** Los triángulos de un grupo del OBJ en su plano de textura, con una rejilla para hallar el que contiene un punto. */
class PatronDelObj {
  private readonly celdas = new Map<string, number[]>();
  private readonly lado: number;
  private readonly p: PuntoEnTriangulo = { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 };

  constructor(private readonly obj: Obj, private readonly ts: number[]) {
    let suma = 0;
    for (const t of ts) suma += Math.hypot(this.u(t, 1) - this.u(t, 0), this.w(t, 1) - this.w(t, 0));
    this.lado = 2 * (suma / Math.max(1, ts.length));
    for (const t of ts) {
      const us = [0, 1, 2].map((j) => this.u(t, j)), ws = [0, 1, 2].map((j) => this.w(t, j));
      for (let i = Math.floor(Math.min(...us) / this.lado); i <= Math.floor(Math.max(...us) / this.lado); i++) {
        for (let j = Math.floor(Math.min(...ws) / this.lado); j <= Math.floor(Math.max(...ws) / this.lado); j++) {
          const k = `${i},${j}`, lista = this.celdas.get(k);
          if (lista) lista.push(t);
          else this.celdas.set(k, [t]);
        }
      }
    }
  }

  u(t: number, j: number): number {
    return this.obj.vt[2 * this.obj.trisT[3 * t + j]];
  }

  w(t: number, j: number): number {
    return this.obj.vt[2 * this.obj.trisT[3 * t + j] + 1];
  }

  /** El triángulo más cercano a (u, w) en el plano de textura (distancia 0 si lo contiene) y sus pesos. */
  buscar(u: number, w: number): { t: number; d: number; pesos: [number, number, number] } {
    let mejor = { t: -1, d: Infinity, pesos: [1, 0, 0] as [number, number, number] };
    const i0 = Math.floor(u / this.lado), j0 = Math.floor(w / this.lado);
    for (let r = 1; r <= 64 && mejor.t < 0; r *= 2) {
      for (let i = i0 - r; i <= i0 + r; i++) {
        for (let j = j0 - r; j <= j0 + r; j++) {
          for (const t of this.celdas.get(`${i},${j}`) ?? []) {
            const p = puntoMasCercano(u, w, 0, this.u(t, 0), this.w(t, 0), 0, this.u(t, 1), this.w(t, 1), 0, this.u(t, 2), this.w(t, 2), 0, this.p);
            const d = Math.hypot(u - p.x, w - p.y);
            if (d < mejor.d) mejor = { t, d, pesos: [p.wa, p.wb, p.wc] };
          }
        }
      }
    }
    return mejor;
  }
}

export interface ColocacionDesdeObj {
  /** las posiciones de cada pieza de Vina (m), 3 por vértice */
  x: Float64Array[];
  /** mm de patrón por unidad de textura del OBJ */
  mmPorVt: number;
  /** por pieza, la mayor distancia (mm de patrón) de un vértice de Vina a la otra malla */
  error: number[];
}

/**
 * `piezas`: el patrón (m) y los triángulos de cada pieza de Vina; `grupoDePieza[k]`: el grupo del OBJ que es la pieza k.
 * Las posiciones del OBJ van en mm.
 */
export function colocarDesdeObj(piezas: ReadonlyArray<{ patron: Float64Array; tris: ArrayLike<number> }>, obj: Obj, grupoDePieza: readonly number[]): ColocacionDesdeObj {
  const x: Float64Array[] = [], error: number[] = [], escalas: number[] = [];
  piezas.forEach((pieza, k) => {
    const g = obj.grupos[grupoDePieza[k]];
    if (!g) throw new Error(`colocarDesdeObj: la pieza ${k} no tiene grupo en el OBJ`);
    const ts = Array.from({ length: g.nt }, (_, i) => g.t0 + i);
    const ref = new PatronDelObj(obj, ts);
    // la caja de los vértices que usa algún triángulo: la de su contorno
    const usados = [...new Set(Array.from(pieza.tris))];
    const cv = caja(usados.map((i) => 1000 * pieza.patron[2 * i]), usados.map((i) => 1000 * pieza.patron[2 * i + 1]));
    const cr = caja(ts.flatMap((t) => [0, 1, 2].map((j) => ref.u(t, j))), ts.flatMap((t) => [0, 1, 2].map((j) => ref.w(t, j))));
    const su = cr.ancho / cv.ancho, sw = cr.alto / cv.alto, s = (su + sw) / 2;
    if (Math.abs(su - sw) > 0.01 * s) throw new Error(`colocarDesdeObj: la pieza ${k} no tiene el mismo tamaño que su grupo (escalas ${su} y ${sw})`);
    const llevar = (i: number, fu: number, fw: number) => ref.buscar(cr.cx + fu * s * (1000 * pieza.patron[2 * i] - cv.cx), cr.cy + fw * s * (1000 * pieza.patron[2 * i + 1] - cv.cy));
    // el espejo: el que deja los vértices de Vina más adentro de la otra malla
    let mejor = { fu: 1, fw: 1, d: Infinity };
    for (const [fu, fw] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      let d = 0;
      for (let q = 0; q < usados.length; q += Math.max(1, Math.floor(usados.length / 400))) d += llevar(usados[q], fu, fw).d;
      if (d < mejor.d) mejor = { fu, fw, d };
    }
    const n = pieza.patron.length / 2, xs = new Float64Array(3 * n);
    let peor = 0;
    for (let i = 0; i < n; i++) {
      const r = llevar(i, mejor.fu, mejor.fw);
      if (usados.includes(i)) peor = Math.max(peor, r.d / s);
      for (let d = 0; d < 3; d++) {
        let q = 0;
        for (let j = 0; j < 3; j++) q += r.pesos[j] * obj.v[3 * obj.tris[3 * r.t + j] + d];
        xs[3 * i + d] = q / 1000;
      }
    }
    x.push(xs);
    error.push(peor);
    escalas.push(s);
  });
  return { x, mmPorVt: 1 / (escalas.reduce((a, b) => a + b, 0) / escalas.length), error };
}
```

`usados.includes(i)` dentro del bucle es cuadrático: con las piezas de la camiseta (hasta 11 mil vértices) se nota. Usa un `Uint8Array` de usados para esa pregunta.

- [ ] **Step 8: Corre las pruebas del traslado**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/colocacion.test.ts`
Expected: PASS.

- [ ] **Step 9: Las medidas nuevas, con su prueba**

En `src/utils/cloth/implicito/banco/medidas.ts` (imports: `type CuerpoRigido` de `../cuerpo`, `type PuntoDeCostura` de `../costuras`):

```ts
/** El percentil p (0..1) de unos valores; NaN si no hay. */
export function percentil(v: ArrayLike<number>, p: number): number {
  const s = Float64Array.from(v).sort();
  return s.length > 0 ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN;
}

/** El estiramiento de cada arista frente a su largo en el patrón (fracción): percentiles y el % que encogió más de 10 %. */
export function estiramiento(x: ArrayLike<number>, malla: MallaDeTela): { p05: number; p50: number; p95: number; encogidas: number } {
  const { tris, patron } = malla, n = patron.length / 2, vistas = new Set<number>(), e: number[] = [];
  for (let t = 0; t < tris.length / 3; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tris[3 * t + k], b = tris[3 * t + ((k + 1) % 3)], clave = a < b ? a * n + b : b * n + a;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      const L0 = Math.hypot(patron[2 * b] - patron[2 * a], patron[2 * b + 1] - patron[2 * a + 1]);
      if (L0 > 0) e.push(Math.hypot(x[3 * b] - x[3 * a], x[3 * b + 1] - x[3 * a + 1], x[3 * b + 2] - x[3 * a + 2]) / L0 - 1);
    }
  }
  return { p05: percentil(e, 0.05), p50: percentil(e, 0.5), p95: percentil(e, 0.95), encogidas: (100 * e.filter((q) => q < -0.1).length) / e.length };
}

/** La separación de cada punto de costura (m): |x_a − (1 − s)·x_b0 − s·x_b1|, mediana y máxima. */
export function separacionDeCosturas(x: ArrayLike<number>, puntos: readonly PuntoDeCostura[]): { mediana: number; maxima: number } {
  const s = puntos.map((p) => Math.hypot(...[0, 1, 2].map((d) => x[3 * p.a + d] - (1 - p.s) * x[3 * p.b0 + d] - p.s * x[3 * p.b1 + d])));
  return { mediana: percentil(s, 0.5), maxima: s.reduce((m, q) => Math.max(m, q), 0) };
}

/** El ángulo entre las caras de cada arista interior (grados): mediana, p95 y cuántas pasan de 90° y de 150°. */
export function pliegues(x: ArrayLike<number>, malla: MallaDeTela): { p50: number; p95: number; sobre90: number; sobre150: number } {
  const { tris } = malla, nt = tris.length / 3, n = x.length / 3;
  const normal = new Float64Array(3 * nt);
  for (let t = 0; t < nt; t++) {
    const a = 3 * tris[3 * t], b = 3 * tris[3 * t + 1], c = 3 * tris[3 * t + 2];
    const ux = x[b] - x[a], uy = x[b + 1] - x[a + 1], uz = x[b + 2] - x[a + 2], wx = x[c] - x[a], wy = x[c + 1] - x[a + 1], wz = x[c + 2] - x[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
    normal.set([nx / l, ny / l, nz / l], 3 * t);
  }
  const primera = new Map<number, number>(), angulos: number[] = [];
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tris[3 * t + k], b = tris[3 * t + ((k + 1) % 3)], clave = a < b ? a * n + b : b * n + a;
      const otra = primera.get(clave);
      if (otra === undefined) {
        primera.set(clave, t);
        continue;
      }
      const c = normal[3 * t] * normal[3 * otra] + normal[3 * t + 1] * normal[3 * otra + 1] + normal[3 * t + 2] * normal[3 * otra + 2];
      angulos.push((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
    }
  }
  return { p50: percentil(angulos, 0.5), p95: percentil(angulos, 0.95), sobre90: angulos.filter((q) => q > 90).length, sobre150: angulos.filter((q) => q > 150).length };
}

/** La distancia con signo de cada vértice al cuerpo (m), hasta 20 cm: mediana, p05 y p95. */
export function distanciaAlCuerpo(x: ArrayLike<number>, cuerpo: CuerpoRigido): { p05: number; p50: number; p95: number } {
  const d: number[] = [];
  for (let i = 0; i < x.length / 3; i++) {
    const c = cuerpo.cercano(x[3 * i], x[3 * i + 1], x[3 * i + 2], 0.2);
    if (c) d.push(c.d);
  }
  return { p05: percentil(d, 0.05), p50: percentil(d, 0.5), p95: percentil(d, 0.95) };
}

/** La distancia de cada vértice a otra superficie (m), hasta 20 cm: mediana, p90, p99 y máxima. */
export function distanciaASuperficie(x: ArrayLike<number>, superficie: CuerpoRigido): { p50: number; p90: number; p99: number; maxima: number } {
  const d: number[] = [];
  for (let i = 0; i < x.length / 3; i++) {
    const c = superficie.cercano(x[3 * i], x[3 * i + 1], x[3 * i + 2], 0.2);
    d.push(c ? Math.abs(c.d) : 0.2);
  }
  return { p50: percentil(d, 0.5), p90: percentil(d, 0.9), p99: percentil(d, 0.99), maxima: d.reduce((m, q) => Math.max(m, q), 0) };
}
```

`src/utils/cloth/implicito/__tests__/medidas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { CuerpoRigido } from '../cuerpo';
import { mallaDeContorno } from '../malla';
import { distanciaAlCuerpo, estiramiento, pliegues, separacionDeCosturas } from '../banco/medidas';
import { esferaDeColision, rectangulo } from '../banco/escenas';

describe('las medidas de la camiseta', () => {
  const m = mallaDeContorno(rectangulo(-50, -50, 50, 50), 10);

  it('una lámina agrandada 5 % estira 5 % todas sus aristas', () => {
    const e = estiramiento(Float64Array.from(m.x, (q) => 1.05 * q), m);
    for (const p of [e.p05, e.p50, e.p95]) expect(p).toBeCloseTo(0.05, 9);
    expect(e.encogidas).toBe(0);
  });

  it('el pliegue de dos caras que comparten una arista: plano 0°, doblado 135°', () => {
    const tris = Uint32Array.from([0, 1, 2, 1, 0, 3]), patron = new Float64Array(8);
    const plano = pliegues(Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.5, -1, 0]), { x: new Float64Array(12), patron, tris });
    expect(plano.p50).toBeCloseTo(0, 6);
    const doblado = pliegues(Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.5, 1, 1]), { x: new Float64Array(12), patron, tris });
    expect(doblado.p50).toBeCloseTo(135, 6);
    expect([doblado.sobre90, doblado.sobre150]).toEqual([1, 0]);
  });

  it('la separación de un punto de costura es la del punto del otro lado, no la del vértice', () => {
    const x = Float64Array.from([0, 0, 0, 0.001, 0, 0, 0.003, 0, 0]);
    expect(separacionDeCosturas(x, [{ a: 0, b0: 1, b1: 2, s: 0.5 }]).mediana).toBeCloseTo(0.002, 12);
  });

  it('la distancia al cuerpo de una lámina a 1 cm de una esfera', () => {
    const cuerpo = new CuerpoRigido(buildLinearBVH(esferaDeColision(0.05, 4)));
    const x = Float64Array.from({ length: 30 }, (_, k) => (k % 3 === 1 ? 0.06 : 0.001 * (k % 7)));
    expect(distanciaAlCuerpo(x, cuerpo).p50 * 1000).toBeCloseTo(10, 0);
  });
});
```

Run: `npx vitest run src/utils/cloth/implicito/__tests__/medidas.test.ts`
Expected: PASS.

- [ ] **Step 10: La camiseta contra la referencia, en `banco/camiseta.ts`**

`Escena` gana sus campos (`escenas.ts`, import `type OpcionesSistema` de `../sistema`):

```ts
export interface Escena {
  malla: MallaDeTela;
  obstaculos: Obstaculo[];
  hilo?: readonly [number, number];
  /** los puntos y bisagras de costura de una prenda (sistema.ts, OpcionesSistema) */
  costuras?: OpcionesSistema['costuras'];
  /** la franja del margen (prenda.ts, franjaDePrenda) */
  franja?: Uint8Array;
  /** velocidades iniciales (m/s), 3 por vértice */
  v?: Float64Array;
}
```

Al final de `banco/camiseta.ts` (imports nuevos: `buildLinearBVH` de `../../gpu/bvh`, `CuerpoRigido` de `../cuerpo`, `type MallaDeTela` de `../malla`, `type Escena` de `./escenas`, `colocarDesdeObj` de `./colocacion`, `cuerpoDeObj, leerObj, mallaDeObj` de `./obj`, y las medidas de `./medidas`):

```ts
/** `$VINA_REFERENCIAS/camiseta.json`: dónde están los archivos de la referencia y cómo se leen. Privado. */
export interface ConfigCamiseta {
  /** el OBJ con la colocación inicial; cada grupo es una pieza */
  colocacion: string;
  /** el nombre de la pieza de Vina de cada grupo de la colocación, en orden */
  piezasEnOrden: string[];
  /** el OBJ del avatar y los grupos que son su piel */
  cuerpo: string;
  gruposDelCuerpo: string[];
  /** la camiseta asentada de la referencia, por malla (mm) */
  asentada: Record<string, string>;
}

/** Los textos de los archivos, leídos del disco (banco en Node) o pedidos al servidor (la prueba con GPU). */
export interface ArchivosDeLaCamiseta {
  dxf: string;
  config: ConfigCamiseta;
  colocacion: string;
  cuerpo: string;
  /** la asentada de la referencia con esta malla, si hay */
  asentada?: string;
}

export interface CamisetaContraLaReferencia {
  escena: Escena;
  camiseta: Camiseta;
  cuerpo: CuerpoRigido;
  /** la asentada de la referencia, medible como una malla de tela, y su superficie para medir distancias */
  referencia: { malla: MallaDeTela; superficie: CuerpoRigido } | null;
  /** por pieza, la mayor distancia (mm de patrón) de un vértice de Vina a la malla de la colocación */
  errorDeColocacion: number[];
}

/** La camiseta sobre el avatar de la referencia y desde su colocación inicial (E5). Las posiciones de los OBJ van en mm. */
export function camisetaContraLaReferencia(a: ArchivosDeLaCamiseta, aristaMm: number, tela: TelaFisica): CamisetaContraLaReferencia {
  const colocacion = leerObj(a.colocacion);
  let mmPorVt = 1, errorDeColocacion: number[] = [];
  const camiseta = camisetaDeMaria(a.dxf, aristaMm, tela, (piezas, mallas) => {
    const grupos = piezas.map((p) => {
      const g = a.config.piezasEnOrden.indexOf(p.name);
      if (g < 0) throw new Error(`camiseta.json no dice qué grupo de la colocación es ${p.name}`);
      return g;
    });
    const r = colocarDesdeObj(mallas.map((m) => ({ patron: patronDe(m), tris: m.triIds })), colocacion, grupos);
    mmPorVt = r.mmPorVt;
    errorDeColocacion = r.error;
    return r.x;
  });
  const cuerpo = new CuerpoRigido(buildLinearBVH(cuerpoDeObj(leerObj(a.cuerpo), a.config.gruposDelCuerpo, 0.001)));
  let referencia: CamisetaContraLaReferencia['referencia'] = null;
  if (a.asentada) {
    const obj = leerObj(a.asentada);
    referencia = { malla: mallaDeObj(obj, 0.001, mmPorVt), superficie: new CuerpoRigido(buildLinearBVH(cuerpoDeObj(obj, null, 0.001))) };
  }
  const escena: Escena = { malla: camiseta.prenda.malla, obstaculos: [{ tipo: 'cuerpo', cuerpo }], costuras: camiseta.costuras, franja: camiseta.franja };
  return { escena, camiseta, cuerpo, referencia, errorDeColocacion };
}

export interface MedidasDeCamiseta {
  vertices: number;
  aplastados: number;
  estiramiento: ReturnType<typeof estiramiento>;
  costuras: ReturnType<typeof separacionDeCosturas>;
  pliegues: ReturnType<typeof pliegues>;
  alCuerpo: ReturnType<typeof distanciaAlCuerpo>;
  /** la distancia de cada vértice de Vina a la asentada de la referencia */
  contraLaReferencia: ReturnType<typeof distanciaASuperficie> | null;
  /** lo mismo medido sobre la asentada de la referencia (sin costuras: el OBJ no las trae) */
  referencia: Omit<MedidasDeCamiseta, 'costuras' | 'contraLaReferencia' | 'referencia'> | null;
}

export function medirCamiseta(x: ArrayLike<number>, c: CamisetaContraLaReferencia): MedidasDeCamiseta {
  const { malla } = c.escena;
  const ref = c.referencia;
  return {
    vertices: x.length / 3,
    aplastados: aplastados(x, malla),
    estiramiento: estiramiento(x, malla),
    costuras: separacionDeCosturas(x, c.camiseta.costuras.puntos),
    pliegues: pliegues(x, malla),
    alCuerpo: distanciaAlCuerpo(x, c.cuerpo),
    contraLaReferencia: ref ? distanciaASuperficie(x, ref.superficie) : null,
    referencia: ref
      ? {
          vertices: ref.malla.x.length / 3,
          aplastados: aplastados(ref.malla.x, ref.malla),
          estiramiento: estiramiento(ref.malla.x, ref.malla),
          pliegues: pliegues(ref.malla.x, ref.malla),
          alCuerpo: distanciaAlCuerpo(ref.malla.x, c.cuerpo),
        }
      : null,
  };
}
```

- [ ] **Step 11: El ensayo `camiseta` en el banco**

`bench/motorImplicito.ts`: el `SistemaTela` toma también `costuras: e.costuras, franja: e.franja`, y si `e.v` existe, `s.v.set(e.v)` antes del primer paso.

`bench/_banco.ts` (imports: `camisetaContraLaReferencia, medirCamiseta, type ConfigCamiseta, type MedidasDeCamiseta` de `../src/utils/cloth/implicito/banco/camiseta`; `type AjustesImplicito` de `../src/utils/cloth/implicito/sistema`; `correrImplicito` de `./motorImplicito`):

```ts
const DXF_DE_MARIA = 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf';

export interface FilaCamiseta extends MedidasDeCamiseta {
  malla: number;
  quieta: number | null;
  msPorCuadro: number;
  errorDeColocacion: number[];
}

/** La camiseta sobre el avatar de la referencia, desde su colocación (E5), en la CPU hasta quieta o 10 s de tela. */
export function ensayoCamiseta(tela: TelaFisica, mallas: number[], ajustes: Partial<AjustesImplicito> = {}): FilaCamiseta[] {
  const dir = carpetaPrivada();
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'camiseta.json'), 'utf8')) as ConfigCamiseta;
  const leer = (r: string) => fs.readFileSync(path.join(dir, r), 'utf8');
  const base = { dxf: fs.readFileSync(DXF_DE_MARIA, 'utf8'), config, colocacion: leer(config.colocacion), cuerpo: leer(config.cuerpo) };
  return mallas.map((malla) => {
    const asentada = config.asentada[String(malla)];
    const c = camisetaContraLaReferencia({ ...base, asentada: asentada ? leer(asentada) : undefined }, malla, tela);
    const r = correrImplicito(tela, ajustes)(c.escena);
    return { malla, quieta: r.quieta, msPorCuadro: r.msPorCuadro, errorDeColocacion: c.errorDeColocacion, ...medirCamiseta(r.x, c) };
  });
}

const mm = (v: number) => (1000 * v).toFixed(1);

export function imprimirCamiseta(filas: FilaCamiseta[]): void {
  for (const f of filas) {
    const ref = f.referencia;
    console.log(`camiseta ${f.malla} mm (${f.vertices} vértices; colocación a ${Math.max(...f.errorDeColocacion).toFixed(2)} mm): quieta ${uno(f.quieta)} s · ${f.msPorCuadro.toFixed(0)} ms por cuadro`);
    console.log(`  aplastados ${f.aplastados.toFixed(2)} %${ref ? ` (referencia ${ref.aplastados.toFixed(2)} %)` : ''} · costuras mediana ${mm(f.costuras.mediana)} mm, máxima ${mm(f.costuras.maxima)} mm`);
    console.log(`  estiramiento p05/p50/p95 ${[f.estiramiento.p05, f.estiramiento.p50, f.estiramiento.p95].map((q) => (100 * q).toFixed(1)).join('/')} %${ref ? ` (referencia ${[ref.estiramiento.p05, ref.estiramiento.p50, ref.estiramiento.p95].map((q) => (100 * q).toFixed(1)).join('/')})` : ''}`);
    console.log(`  pliegues p50/p95 ${f.pliegues.p50.toFixed(1)}°/${f.pliegues.p95.toFixed(1)}°, >90° ${f.pliegues.sobre90}${ref ? ` (referencia ${ref.pliegues.p50.toFixed(1)}°/${ref.pliegues.p95.toFixed(1)}°, ${ref.pliegues.sobre90})` : ''}`);
    console.log(`  al cuerpo p50/p95 ${mm(f.alCuerpo.p50)}/${mm(f.alCuerpo.p95)} mm${ref ? ` (referencia ${mm(ref.alCuerpo.p50)}/${mm(ref.alCuerpo.p95)})` : ''}`);
    if (f.contraLaReferencia) console.log(`  contra la asentada de la referencia: p50 ${mm(f.contraLaReferencia.p50)} · p90 ${mm(f.contraLaReferencia.p90)} · p99 ${mm(f.contraLaReferencia.p99)} · máx ${mm(f.contraLaReferencia.maxima)} mm`);
    const pasa = f.aplastados < 0.1 && f.costuras.mediana < 5e-5 && f.costuras.maxima <= 1e-3 && f.quieta !== null && f.quieta <= 10;
    console.log(`  §2 de la camiseta (sin la velocidad, que es de la GPU): ${pasa ? 'pasa' : 'no pasa'}`);
  }
}
```

La mediana «0 mm» de §2 se cuenta como menos de 0,05 mm: la referencia trae un decimal.

`bench/telaNueva.ts`: el ensayo `camiseta` no entra en `todo`; se pide con `--ensayo=camiseta`:

```ts
if (ensayo === 'camiseta') {
  if (motor !== 'implicito') throw new Error('la camiseta corre solo con el motor implícito');
  const filas = ensayoCamiseta(telaDeLaReferencia(ref, Number(args.get('pandeo') || PANDEO_CALIBRADO)), mallas, {
    ...(args.has('cg') ? { maxCG: Number(args.get('cg')) } : {}),
    ...(args.has('flexionDelMargen') ? { flexionDelMargen: Number(args.get('flexionDelMargen')) } : {}),
  });
  imprimirCamiseta(filas);
  informe.camiseta = filas;
}
```

y las condiciones de Cusick y voladizo pasan a `if (ensayo === 'todo' || ensayo === 'cusick')` y `if (ensayo === 'todo' || ensayo === 'voladizo')`. El comentario de uso suma `camiseta` a la lista de ensayos y `--cg=<n>` y `--flexionDelMargen=<f>` a los argumentos.

- [ ] **Step 12: La configuración privada (solo el controlador)**

Escribe `$VINA_REFERENCIAS/camiseta.json`, fuera del repo, con `colocacion` (el OBJ del primer cuadro), `cuerpo` (el avatar), `asentada` (las asentadas de 5, 10 y 20 mm) y:
- `piezasEnOrden`: el nombre de la pieza de Vina de cada grupo de la colocación. Se deduce comparando la caja de las coordenadas de textura de cada grupo con la de cada pieza (`colocarDesdeObj` las escala igual). Las dos mangas tienen la misma caja: la de cada lado se decide por la posición 3D del grupo y por la de su sisa en la pieza de Vina.
- `gruposDelCuerpo`: los grupos de piel del avatar (cuerpo, brazos, piernas y cara). Pelo, ojos, pestañas, dientes y zapatos quedan fuera.

Corre una vez `node -e` sobre las tres asentadas: cuántos vértices traen dos coordenadas de textura distintas (ver el Step 3). Anota el resultado en el registro.

- [ ] **Step 13: Corre la camiseta a 20 y 10 mm**

Run: `VINA_REFERENCIAS=/d/Desktop/work/vina-referencias npm run bench:tela -- --ensayo=camiseta --mallas=20,10`
Expected: la colocación a menos de 0,5 mm en cada pieza; el informe en `$VINA_REFERENCIAS/informes/`. Y luego con la flexión del margen sin multiplicar: `… --ensayo=camiseta --mallas=10 --flexionDelMargen=1`.

- [ ] **Step 14: El punto de decisión**

Con los dos informes, compara contra §2 (aplastados, costuras, quieta) y contra la referencia (estiramiento, pliegues, distancia al cuerpo, distancia a su asentada). Anota todo en el registro. Si algo de §2 no pasa, sigue la regla de la sección Coordinación: un error de código se arregla aquí, con su prueba; un problema del modelo va a Samuel con las medidas. La corrida de 5 mm en la CPU (unos 15 min) queda para la Tarea 9, como contraste de la GPU.

- [ ] **Step 15: Gate y commit**

Run: `npx tsc -b --noEmit && npx vitest run src/utils/cloth && npm run lint`

```bash
git add src/utils/cloth/implicito/banco/obj.ts src/utils/cloth/implicito/banco/colocacion.ts src/utils/cloth/implicito/banco/medidas.ts src/utils/cloth/implicito/banco/escenas.ts src/utils/cloth/implicito/banco/camiseta.ts src/utils/cloth/implicito/__tests__/obj.test.ts src/utils/cloth/implicito/__tests__/colocacion.test.ts src/utils/cloth/implicito/__tests__/medidas.test.ts bench/motorImplicito.ts bench/_banco.ts bench/telaNueva.ts
git commit -m "feat(tela): la camiseta de María en el banco, sobre el avatar y desde la colocación de la referencia

El banco lee un OBJ (caras de cualquier cantidad de lados, grupos, el cuerpo
con sus caras vueltas hacia afuera por el volumen con signo) y lleva una
colocación ajena a la malla de Vina por las coordenadas del patrón: escala por
las cajas, espejo por el que deja la malla más adentro y pesos del triángulo
que contiene cada vértice. Mide estiramiento, costuras, pliegues y distancias
al cuerpo y a otra superficie, con las mismas funciones para la camiseta de
Vina y para la asentada de la referencia. Los archivos y sus nombres viven en
la carpeta privada."
```

---
## La física en la GPU

Cada tarea de esta sección sigue el mismo ciclo. Primero, las pruebas de vitest del paquete: la parte de CPU del camino a la GPU, emulada en TS. Después, el WGSL. Al final, la paridad en Playwright con GPU real:

```bash
VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts
```

Esa spec corre la escena en la CPU y en la GPU y compara las posiciones tras 3 cuadros con `tolCG = 0`, así las dos hacen todas las iteraciones. Una escena nueva entra a la lista de paridad de la spec antes de escribir su WGSL: así se ve roja primero. Si `MotorGpu.crear` falla al compilar, el mensaje trae línea y columna del WGSL; el harness lo publica en `error`.

### Tarea 4: Los planos de contacto con fricción, en la GPU (E4)

La GPU mide todavía el contacto por distancia, también en la búsqueda en línea. Pasa a los planos de la CPU: cada vértice guarda el plano fijado en x_t (o al anticiparlo) con su rigidez de fricción; la solución usa el plano de dos lados, y la búsqueda en línea la misma energía de un solo lado, sin consultar el obstáculo. La anticipación usa la penetración respecto del plano tangente en el punto adonde iba el vértice, con la fricción de la normal λ = m·p/h² (R11). De paso, la GPU arranca con las velocidades del sistema (hoy arranca quieta), y la memoria se reparte con una función en lugar de sumas a mano. Hasta la Tarea 7 el harness corre sin contacto propio, en la CPU y en la GPU.

**Files:**
- Modify: `src/utils/cloth/implicito/gpu/wgsl.ts` (`zonas`, `distribuir`, las constantes, `wgslObstaculos`, `energiaVertice`, `inicio`, `residuo`, `spmv`, `anticipar`, `posPrueba`)
- Modify: `src/utils/cloth/implicito/gpu/motorGpu.ts` (sube `s.v`)
- Modify: `src/utils/cloth/implicito/banco/escenas.ts` (`escenaApoyada`)
- Modify: `src/components/testScenes/TelaImplicitaHarness.tsx` (el mapa de escenas)
- Test: `src/utils/cloth/implicito/gpu/__tests__/wgsl.test.ts`, `tests/e2e/tela-implicita.spec.ts`

**Interfaces:**
- Consumes: `EPS_FRICCION` (`contactos.ts`); `TelaSI.friccionCuerpo`; `Escena.v` (Tarea 3).
- Produces: `Distribucion.vf.CONT` con 6 números por vértice (activo, n, p0, kt); `escenaApoyada(): Escena`; en el harness, `ESCENAS: Record<string, () => Escena | Promise<Escena>>`, que cada tarea siguiente amplía.

- [ ] **Step 1: La escena apoyada y la paridad por escena**

En `src/utils/cloth/implicito/banco/escenas.ts` (import nuevo: `separacion, telaSI` de `../tela`):

```ts
/** Una lámina de 100 mm apoyada en el suelo, 0,2 mm dentro de su separación y corriendo a 5 cm/s: plano con fricción desde el primer cuadro. */
export function escenaApoyada(): Escena {
  const malla = mallaDeContorno(rectangulo(-50, -50, 50, 50), 10, separacion(telaSI(TELA_DE_LABORATORIO)) - 0.0002);
  return { malla, obstaculos: [{ tipo: 'plano', altura: 0 }], v: Float64Array.from(malla.x, (_, k) => (k % 3 === 0 ? 0.05 : 0)) };
}
```

En `src/components/testScenes/TelaImplicitaHarness.tsx`, la escena sale de un mapa y el sistema toma todo lo de la escena:

```ts
/** Las escenas del harness; cada tarea del plan de la parte 2 suma la suya. */
const ESCENAS: Record<string, () => Escena | Promise<Escena>> = {
  chica: () => escenaCusick(10),
  grande: () => escenaCusick(5, 480),
  apoyada: () => escenaApoyada(),
};
```

y en `correr`:

```ts
  const armar = ESCENAS[escena];
  if (!armar) throw new Error(`escena desconocida: ${escena} (hay ${Object.keys(ESCENAS).join(', ')})`);
  const e = await armar();
  const ajustes = {
    maxCG: Number(q.get('cg') ?? 50),
    // en la paridad, todas las iteraciones en las dos: la tolerancia no decide nada
    tolCG: modo === 'paridad' ? 0 : 1e-4,
    anticipar: q.get('anticipar') !== '0',
    busqueda: q.get('busqueda') !== '0',
    // el contacto propio llega a la GPU en la Tarea 7 del plan de la parte 2
    contactoPropio: false,
  };
  const nuevo = () => {
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos, hilo: e.hilo, costuras: e.costuras, franja: e.franja, ajustes });
    if (e.v) s.v.set(e.v);
    return s;
  };
```

El comentario de cabecera nombra las escenas del mapa en lugar de «chica | grande».

En `tests/e2e/tela-implicita.spec.ts`, la prueba de paridad pasa a una por escena:

```ts
  for (const escena of ['chica', 'apoyada']) {
    test(`da lo mismo que la CPU tras 3 cuadros (${escena})`, async ({ page }) => {
      const r = await correr(page, `modo=paridad&escena=${escena}&cg=50&cuadros=3`);
      expect(r.dif?.maxima).toBeLessThan(1e-4);
    });
  }
```

- [ ] **Step 2: Mira la paridad roja**

Run: `VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "da lo mismo"`
Expected: FAIL en las dos. `chica` difiere en los vértices que tocan el pedestal (la GPU mide por distancia); `apoyada`, en todos, porque la GPU arranca quieta y sin fricción. Anota las diferencias máximas.

- [ ] **Step 3: La prueba de que la búsqueda en línea no consulta el obstáculo**

En `src/utils/cloth/implicito/gpu/__tests__/wgsl.test.ts`:

```ts
  it('la búsqueda en línea usa los planos fijos: posPrueba no consulta el obstáculo (E4)', () => {
    const cuerpo = fuente.slice(fuente.indexOf('fn posPrueba('), fuente.indexOf('fn anguloPrueba('));
    expect(cuerpo).not.toMatch(/masCercano/);
    expect(cuerpo).toMatch(/energiaPlano/);
  });
```

Run: `npx vitest run src/utils/cloth/implicito/gpu/__tests__/wgsl.test.ts`
Expected: FAIL (hoy `posPrueba` llama a `energiaVertice`, que consulta `masCercano`).

- [ ] **Step 4: La memoria, repartida por zonas**

En `src/utils/cloth/implicito/gpu/wgsl.ts`, antes de `distribuir`:

```ts
/** Desplazamientos seguidos para los tamaños dados, en el orden de las claves, y el total. */
function zonas<K extends string>(tamanos: Record<K, number>): Record<K, number> & { total: number } {
  const o = { total: 0 } as Record<K, number> & { total: number };
  for (const k of Object.keys(tamanos) as K[]) {
    o[k] = o.total;
    o.total += tamanos[k];
  }
  return o;
}

type ZonaVf = 'XT' | 'V' | 'R' | 'Z' | 'AP' | 'DX' | 'XP' | 'MASA' | 'EV0' | 'PINV' | 'CONT';
type ZonaTf = 'COEF' | 'KP' | 'PCR' | 'TRI' | 'E0' | 'HD' | 'THP' | 'CONTRIB';
/** las sumas parciales de cada reducción, los escalares y la historia de la quietud */
type ZonaRed = 'PA' | 'PB' | 'PC' | 'SC' | 'HISTO';
```

`Distribucion.vf`, `.tf` y `.red` pasan a `Record<ZonaVf, number> & { total: number }`, `Record<ZonaTf, number> & { total: number }` y `Record<ZonaRed, number> & { total: number; HIST: number }`, y en `distribuir`:

```ts
  const vf = zonas<ZonaVf>({ XT: 3 * n, V: 3 * n, R: 3 * n, Z: 3 * n, AP: 3 * n, DX: 3 * n, XP: 3 * n, MASA: n, EV0: n, PINV: 9 * n, CONT: 6 * n });
  const tf = zonas<ZonaTf>({ COEF: 7 * nt, KP: 9 * nt, PCR: 2 * nt, TRI: 14 * nt, E0: nt, HD: 16 * nh, THP: nh, CONTRIB: 45 * nt });
  // … iu, gv, gt, gh, gb como hoy …
  const zona = Math.max(gv, gt, gh, 1);
  const red = { ...zonas<ZonaRed>({ PA: zona, PB: zona, PC: zona, SC: N_ESC, HISTO: cuadrosDeHistoria }), HIST: cuadrosDeHistoria };
```

Las tareas siguientes suman zonas de reducción antes de `SC` (`PD`, `PE`) y agrandan `zona` con sus grupos.

En `wgslDelMotor`, las dos líneas de `const O_XT = …` y las dos de `const O_COEF = …` se reemplazan por:

```ts
${Object.entries(vf).filter(([k]) => k !== 'total').map(([k, v]) => `const O_${k} = ${u(v)};`).join(' ')}
${Object.entries(tf).filter(([k]) => k !== 'total').map(([k, v]) => `const O_${k} = ${u(v)};`).join(' ')}
```

y se agregan las constantes de la fricción (import nuevo: `EPS_FRICCION` de `../contactos`):

```ts
const MU_C = ${f(tela.friccionCuerpo)};
const EPS_F = ${f(EPS_FRICCION)};
```

- [ ] **Step 5: Los planos en el WGSL**

En `wgslObstaculos` se borra `obstaculoK` (nadie la llama ya); `masCercano` queda igual.

Junto a `prediccion`, `energiaVertice` pasa a ser solo inercia y aire, y se agregan la fricción y la energía del plano:

```wgsl
// inercia y aire del vértice i en x (sistema.ts, energiaVertice)
fn energiaVertice(i: u32, x: vec3<f32>) -> f32 {
  let m = vf[O_MASA + i];
  let dy = x - prediccion(i);
  let dt = x - ld(O_XT, i);
  return m / (2.0 * H * H) * dot(dy, dy) + AIRE * m / (2.0 * H) * dot(dt, dt);
}

// la fricción de Coulomb suavizada (contactos.ts, rigidezDeFriccion)
fn rigidez(mu: f32, lambda: f32, vt: f32) -> f32 {
  if (mu > 0.0 && lambda > 0.0) { return mu * lambda / (max(vt, EPS_F) * H); }
  return 0.0;
}

fn tangencial(v: vec3<f32>, n: vec3<f32>) -> f32 { return length(v - dot(v, n) * n); }

// el plano del vértice (en CONT, desde o) con u = x − x_t, de un solo lado (contactos.ts, energiaDePlano)
fn energiaPlano(o: u32, u: vec3<f32>) -> f32 {
  let n = vec3<f32>(vf[o + 1u], vf[o + 2u], vf[o + 3u]);
  let un = dot(n, u);
  let p = vf[o + 4u] - un;
  let t = u - un * n;
  var e = 0.5 * vf[o + 5u] * dot(t, t);
  if (p > 0.0) { e += 0.5 * KC * p * p; }
  return e;
}
```

`inicio` queda:

```wgsl
// 1. x_t, el plano de cada vértice en x_t con su fricción (sistema.ts, armarContactos) y la inercia al empezar
@compute @workgroup_size(${WG}) fn inicio(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i == 0u) {
    red[R_SC + E_ACTIVO] = 1.0;
    red[R_SC + E_ITER] = 0.0;
    red[R_SC + E_NUEVOS] = 0.0;
  }
  if (i >= N) { return; }
  let x = ldx(i);
  st(O_XT, i, x);
  let o = O_CONT + 6u * i;
  let c = masCercano(x);
  let p0 = SEP - c.c.x;
  if (p0 > 0.0 && iu[I_FIJO + i] == 0u) {
    let n = c.c.yzw;
    vf[o] = 1.0; vf[o + 1u] = n.x; vf[o + 2u] = n.y; vf[o + 3u] = n.z; vf[o + 4u] = p0;
    vf[o + 5u] = rigidez(MU_C, KC * p0, tangencial(ld(O_V, i), n));
  } else {
    vf[o] = 0.0;
  }
  vf[O_EV0 + i] = energiaVertice(i, x);
}
```

En `residuo`, el bloque del contacto pasa a:

```wgsl
    let o = O_CONT + 6u * i;
    if (vf[o] > 0.5) {
      let nn = vec3<f32>(vf[o + 1u], vf[o + 2u], vf[o + 3u]);
      let kt = vf[o + 5u];
      // en x = x_t el plano empuja con kc·p0 y la fricción todavía no (sistema.ts, residuo)
      r += KC * vf[o + 4u] * nn;
      B += (KC - kt) * outer(nn, nn) + kt * I3;
    }
```

En `spmv`:

```wgsl
    let o = O_CONT + 6u * i;
    if (vf[o] > 0.5) {
      let nn = vec3<f32>(vf[o + 1u], vf[o + 2u], vf[o + 3u]);
      let pn = dot(nn, p);
      ap += KC * pn * nn + vf[o + 5u] * (p - pn * nn);
    }
```

`anticipar` queda:

```wgsl
// 8. anticipación (sistema.ts, anticiparContactos): el vértice que el paso metería en un obstáculo entra con el plano
// tangente en el punto adonde iba, y con la fricción de la normal que frena en un cuadro esa penetración (R11)
@compute @workgroup_size(${WG}) fn anticipar(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  let i = g.x;
  var nuevo = 0.0;
  if (i < N) {
    let o = O_CONT + 6u * i;
    if (iu[I_FIJO + i] == 0u && vf[o] < 0.5) {
      let dx = ld(O_DX, i);
      let c = masCercano(ldx(i) + dx);
      let pen = SEP - c.c.x;
      if (pen > 0.0) {
        let n = c.c.yzw;
        vf[o] = 1.0; vf[o + 1u] = n.x; vf[o + 2u] = n.y; vf[o + 3u] = n.z;
        // la penetración en x_t respecto del plano tangente en el punto adonde iba: sep − d + n·dx
        vf[o + 4u] = pen + dot(n, dx);
        vf[o + 5u] = rigidez(MU_C, vf[O_MASA + i] * pen / (H * H), tangencial(ld(O_V, i), n));
        nuevo = 1.0;
      }
    }
  }
  let total = reducirSuma(l.x, nuevo);
  if (l.x == 0u) { red[R_PA + w.x] = total; }
}
```

`posPrueba` queda:

```wgsl
@compute @workgroup_size(${WG}) fn posPrueba(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_PROBANDO)) { return; }
  let i = g.x;
  var de = 0.0;
  if (i < N) {
    let u = red[R_SC + E_ALFA_LS] * ld(O_DX, i);
    let xp = ld(O_XT, i) + u;
    st(O_XP, i, xp);
    de = energiaVertice(i, xp) - vf[O_EV0 + i];
    // el plano fijado al empezar, de un solo lado, sin consultar el obstáculo (E4)
    let o = O_CONT + 6u * i;
    if (vf[o] > 0.5) { de += energiaPlano(o, u) - energiaPlano(o, vec3<f32>(0.0)); }
  }
  let total = reducirSuma(l.x, de);
  if (l.x == 0u) { red[R_PB + w.x] = total; }
}
```

El encabezado de `paso.ts` deja de decir que la GPU mide el contacto por distancia: «… de un solo lado. La GPU (gpu/wgsl.ts) hace el mismo cuadro.»

- [ ] **Step 6: La GPU arranca con las velocidades del sistema**

En `src/utils/cloth/implicito/gpu/motorGpu.ts`, en `crear`, después de `vf.set(p.f32.masa, d.vf.MASA);`:

```ts
    vf.set(Float32Array.from(s.v), d.vf.V);
```

- [ ] **Step 7: Corre las pruebas**

Run: `npx vitest run src/utils/cloth/implicito/gpu && npx tsc -b --noEmit`
Expected: PASS.

Run: `VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts`
Expected: PASS: `chica` y `apoyada` a menos de 0,1 mm; la velocidad y la quietud dan números. Anota en el registro las diferencias máximas y los ms por cuadro de la escena grande con 20 y 50 iteraciones.

- [ ] **Step 8: Gate y commit**

Run: `npx vitest run src/utils/cloth && npm run lint`

```bash
git add src/utils/cloth/implicito/gpu/wgsl.ts src/utils/cloth/implicito/gpu/motorGpu.ts src/utils/cloth/implicito/paso.ts src/utils/cloth/implicito/banco/escenas.ts src/components/testScenes/TelaImplicitaHarness.tsx src/utils/cloth/implicito/gpu/__tests__/wgsl.test.ts tests/e2e/tela-implicita.spec.ts
git commit -m "feat(tela): la GPU apoya la tela en planos con fricción, como la CPU

Cada vértice guarda el plano tangente fijado en x_t o al anticiparlo, con su
rigidez de fricción; la solución usa el plano de dos lados y la búsqueda en
línea la misma energía de un solo lado, sin consultar el obstáculo. La
anticipación mide la penetración contra el plano del punto adonde iba el
vértice y frena con la normal m·p/h². La GPU arranca con las velocidades del
sistema y reparte su memoria por zonas. El harness corre cada escena del
banco y la paridad se prueba por escena."
```

---

### Tarea 5: Las costuras en la GPU (E1, E2 y el margen)

Cada punto de costura es un elemento más: aporta al gradiente con tres ranuras (a, b0, b1), a la matriz con sus bloques (códigos `0x40000000 | e << 4 | li << 2 | lj`, entre los de la membrana y los de la placa) y a la búsqueda en línea con su energía. Su largo de reposo vive en la GPU y se cierra al final de cada cuadro. Cuando todos llegan a 0, una bandera enciende las bisagras de costura: escribe su rigidez en K, como `Placa.activarCosturas`. El margen no pide código: su masa y su flexión ya vienen en `masa` y en `K`. Las bisagras de costura tampoco, porque son bordes de su triángulo.

**Files:**
- Modify: `src/utils/cloth/implicito/gpu/empaquetar.ts` (los puntos, sus ranuras y bloques, las bisagras por encender; fuera el `throw`)
- Modify: `src/utils/cloth/implicito/gpu/wgsl.ts` (zonas, constantes, `prepCostura`, `bloqueCostura`, `ensamblar`, `difCostura`, `decidir`, `cerrarCosturas`, `revisarCosido`, `coser`)
- Modify: `src/utils/cloth/implicito/gpu/motorGpu.ts` (despachos)
- Modify: `src/utils/cloth/implicito/banco/escenas.ts` (`bordeDelDibujo`, `escenaCostura`), `src/utils/cloth/implicito/__tests__/ayudas.ts` (`borde` sale de escenas)
- Modify: el harness (`costura`, `costura-cerrada`)
- Test: `src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`, `tests/e2e/tela-implicita.spec.ts`

**Interfaces:**
- Consumes: `Costuras` (`a`, `b0`, `b1`, `s`, `L`, `estado`, `pesos(e)`, `vertices(e)`, `sumarBloque`), `Placa.costura: Array<{ o: number; kh: number }>`, `CIERRE_POR_CUADRO`, `LARGO_CERRADO`.
- Produces: `PaqueteGpu.nc`, `.nch`, `f32.cs`, `f32.cl`, `f32.ckh`, `u32.costura` (a, b0, b1 por punto), `u32.costuraK` (dónde va en K cada bisagra de costura); `ESC.COSIDA`; `escenaCostura(abiertaMm: number): Escena`; `bordeDelDibujo(m, x0, v0?)`.

- [ ] **Step 1: Las escenas de costura y su paridad**

En `src/utils/cloth/implicito/banco/escenas.ts` (imports nuevos: `armarPrenda, bisagrasDePrenda, franjaDePrenda` de `../prenda`, `puntosDeCostura` de `../costuras`):

```ts
/** Los vértices del borde x = x0 del dibujo, de abajo hacia arriba, corridos v0. */
export function bordeDelDibujo(m: MallaDeTela, x0: number, v0 = 0): number[] {
  const n = m.x.length / 3, vs: number[] = [];
  for (let i = 0; i < n; i++) if (Math.abs(m.patron[2 * i] - x0) < 1e-9) vs.push(i);
  return vs.sort((i, j) => m.patron[2 * i + 1] - m.patron[2 * j + 1]).map((i) => i + v0);
}

/**
 * Dos piezas de 100 × 60 mm, A con malla de 5 mm y B de 7 (los lados de la costura no coinciden), B a `abiertaMm` de A,
 * cosidas por los bordes de enfrente, con su franja de margen y sus bisagras de costura. Con 0 mm la costura cierra en
 * el primer cuadro y la flexión la cruza desde el segundo.
 */
export function escenaCostura(abiertaMm: number): Escena {
  const A = mallaDeContorno(rectangulo(0, 0, 100, 60), 5), B = mallaDeContorno(rectangulo(0, 0, 100, 60), 7);
  const prenda = armarPrenda([
    { id: 'A', ...A },
    { id: 'B', ...B, x: Float64Array.from(B.x, (q, k) => (k % 3 === 0 ? q + 0.1 + abiertaMm / 1000 : q)) },
  ]);
  const lados = [{ a: bordeDelDibujo(A, 0.1), b: bordeDelDibujo(B, 0, A.x.length / 3) }];
  return {
    malla: prenda.malla,
    obstaculos: [],
    costuras: { puntos: puntosDeCostura(prenda.malla.patron, lados[0].a, lados[0].b), bisagras: bisagrasDePrenda(prenda, lados, TELA_DE_LABORATORIO) },
    franja: franjaDePrenda(prenda, lados),
  };
}
```

En `src/utils/cloth/implicito/__tests__/ayudas.ts`, la función `borde` se reemplaza por `export { bordeDelDibujo as borde } from '../banco/escenas';` (mismo comportamiento; vive donde la usan también las escenas).

En el harness, `ESCENAS` suma `costura: () => escenaCostura(30)` y `'costura-cerrada': () => escenaCostura(0)`. En la spec, la lista de paridad suma `'costura', 'costura-cerrada'`.

- [ ] **Step 2: Las pruebas del paquete con costuras**

En `src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`, las ayudas `ranuras` y `franjas` aprenden las costuras:

```ts
/** Lo que gradElem y prepCostura escriben en cada ranura de aporte (un vec3 por ranura), desde el estado linealizado. */
function ranuras(s: SistemaTela): Float64Array {
  const nt = s.tris.length / 3, c = s.costuras, out = new Float64Array(3 * (15 * nt + 3 * c.n));
  // … (el cuerpo de hoy, membrana y placa, sin cambios) …
  for (let e = 0; e < c.n; e++) {
    const w = c.pesos(e), o = 6 * e, g = c.estado[o + 3];
    for (let m = 0; m < 3; m++) for (let d = 0; d < 3; d++) out[3 * (15 * nt + 3 * e + m) + d] = w[m] * g * c.estado[o + d];
  }
  return out;
}
```

En `franjas`, la rama de los códigos:

```ts
      if (cod >= 0x80000000) s.placa.sumarBloque(cod - 0x80000000, i, j, M);
      else if (cod >= 0x40000000) {
        const k = cod - 0x40000000;
        s.costuras.sumarBloque(k >>> 4, (k >>> 2) & 3, k & 3, M);
      } else s.membrana.sumarBloque(cod >>> 4, (cod >>> 2) & 3, cod & 3, M);
```

Y un `describe` nuevo, con las mismas dos pruebas sobre la escena de costura (import `escenaCostura`):

```ts
describe('el paquete de una prenda cosida', () => {
  const e = escenaCostura(30);
  const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { costuras: e.costuras, franja: e.franja, ajustes: { contactoPropio: false } });
  const r = azar(43);
  for (let q = 0; q < s.x.length; q++) s.x[q] += 0.003 * r();
  s.linealizar();
  const p = empaquetar(s);

  it('los aportes de cada vértice suman el gradiente elástico, con las costuras', () => {
    const slot = ranuras(s), g = new Float64Array(3 * s.n), esperado = new Float64Array(3 * s.n);
    for (let i = 0; i < s.n; i++) {
      for (let k = p.u32.aporOff[i]; k < p.u32.aporOff[i + 1]; k++) for (let d = 0; d < 3; d++) g[3 * i + d] += slot[3 * p.u32.aporIdx[k] + d];
    }
    s.gradienteElastico(esperado);
    for (let q = 0; q < g.length; q++) expect(g[q]).toBeCloseTo(esperado[q], 9);
  });

  it('la matriz en franjas, armada desde los códigos, da H·p con las costuras', () => {
    const vals = franjas(s, p), v = Float64Array.from({ length: 3 * s.n }, () => r());
    const Ap = new Float64Array(3 * s.n), esperado = new Float64Array(3 * s.n);
    for (let i = 0; i < s.n; i++) {
      const f = i >> 5, carril = i & 31;
      for (let k = 0; k < p.u32.franjaAncho[f]; k++) {
        const q = p.u32.franjaBase[f] + 32 * k + carril, j = p.u32.colSell[q];
        if (j === NINGUNA) continue;
        for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) Ap[3 * i + a] += vals[9 * q + 3 * a + c] * v[3 * j + c];
      }
    }
    s.hessianaPor(v, esperado);
    for (let q = 0; q < Ap.length; q++) expect(Ap[q]).toBeCloseTo(esperado[q], 6);
  });

  it('lleva el largo de cada punto y dónde encender cada bisagra de costura', () => {
    expect(p.nc).toBe(s.costuras.n);
    expect(Array.from(p.f32.cl)).toEqual(Array.from(Float32Array.from(s.costuras.L)));
    expect(Array.from(p.u32.costuraK)).toEqual(s.placa.costura.map((c) => c.o));
  });
});
```

Run: `npx vitest run src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`
Expected: FAIL: `empaquetar` se niega («las costuras llegan a la GPU en la parte 2»).

- [ ] **Step 3: El paquete con costuras**

En `src/utils/cloth/implicito/gpu/empaquetar.ts`, se borra el `throw` de la primera línea. `PaqueteGpu` gana:

```ts
  /** puntos de costura */
  nc: number;
  /** bisagras de costura que se encienden al cerrar */
  nch: number;
```

en `f32`: `cs: Float32Array` (s de cada punto), `cl: Float32Array` (su largo de reposo de ahora), `ckh: Float32Array` (la rigidez de cada bisagra de costura); y en `u32`: `costura: Uint32Array` (a, b0, b1 por punto) y `costuraK: Uint32Array` (el índice en K de cada bisagra de costura).

En `empaquetar`, con `const c = s.costuras, nc = c.n;`:

```ts
  if (nt >= 1 << 26 || nc >= 1 << 26) throw new Error('empaquetar: más triángulos o puntos de costura de los que caben en un código de bloque');
  // después de las ranuras de la placa: 3 por punto de costura (a, b0, b1)
  for (let e = 0; e < nc; e++) {
    const v = c.vertices(e);
    for (let m = 0; m < 3; m++) aportes[v[m]].push(15 * nt + 3 * e + m);
  }
```

y, en el bucle que reparte los códigos de los bloques, después del de los triángulos:

```ts
  for (let e = 0; e < nc; e++) {
    const v = c.vertices(e);
    for (let li = 0; li < 3; li++) for (let lj = 0; lj < 3; lj++) aporte(v[li], v[lj], (0x40000000 | (e << 4) | (li << 2) | lj) >>> 0);
  }
```

En el `return`: `nc`, `nch: s.placa.costura.length`; en `f32`: `cs: Float32Array.from(c.s)`, `cl: Float32Array.from(c.L)`, `ckh: Float32Array.from(s.placa.costura, (k) => k.kh)`; en `u32`: `costura: Uint32Array.from({ length: 3 * nc }, (_, k) => c.vertices(Math.floor(k / 3))[k % 3])` y `costuraK: Uint32Array.from(s.placa.costura, (k) => k.o)`. El comentario del encabezado de `PaqueteGpu.u32.blqCod` suma «… o costura (0x40000000 | e << 4 | li << 2 | lj)», y el de `aporIdx`, «… costura 15nt + 3e + m».

Run: `npx vitest run src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`
Expected: PASS.

- [ ] **Step 4: Las costuras en el WGSL**

En `wgsl.ts`: `ZonaTf` suma `'CS' | 'CL' | 'CST' | 'CE0' | 'CKH'`; en `distribuir`, `CONTRIB: 45 * nt + 9 * p.nc` y, al final de las zonas de `tf`, `CS: p.nc, CL: p.nc, CST: 5 * p.nc, CE0: p.nc, CKH: p.nch`. `Distribucion` gana `gc` y `gch` (grupos por punto y por bisagra de costura), `ZonaRed` suma `'PD'` y `red` la pone entre `PC` y `SC` (`PD: zona`), y `zona = Math.max(gv, gt, gh, gc, 1)`. `ESC` suma `COSIDA: 15`. `ENTRADAS` suma, en su orden de despacho, `'prepCostura'` (después de `'gradElem'`), `'difCostura'` (después de `'difTri'`) y `'cerrarCosturas', 'revisarCosido', 'coser'` (al final).

Constantes nuevas en `wgslDelMotor` (import: `CIERRE_POR_CUADRO, LARGO_CERRADO` de `../costuras`):

```ts
const NC = ${u(p.nc)};
const NCH = ${u(p.nch)};
const GC = ${u(d.gc)};
const R_PD = ${u(red.PD)};
const I_CV = ${u(iu.costura)}; const I_CK = ${u(iu.costuraK)};
const KCOST = ${f(aj.kCostura)};
const CIERRE = ${f(CIERRE_POR_CUADRO)};
const LCERRADO = ${f(LARGO_CERRADO)};
// la primera ranura de aporte de las costuras, después de las de la membrana y la placa
const SLOT_C = 15u * NT;
```

Las funciones y entradas nuevas:

```wgsl
fn pesoCostura(e: u32, m: u32) -> f32 {
  let s = tf[O_CS + e];
  if (m == 0u) { return 1.0; }
  if (m == 1u) { return -(1.0 - s); }
  return -s;
}

fn sepCostura(e: u32, a: vec3<f32>, b0: vec3<f32>, b1: vec3<f32>) -> vec3<f32> {
  let s = tf[O_CS + e];
  return a - (1.0 - s) * b0 - s * b1;
}

// el bloque (li, lj) del punto de costura e (costuras.ts, sumarBloque): c1 = g en todas las ramas de linealizar
fn bloqueCostura(e: u32, li: u32, lj: u32) -> mat3x3<f32> {
  let o = O_CST + 5u * e;
  let d = vec3<f32>(tf[o], tf[o + 1u], tf[o + 2u]);
  return pesoCostura(e, li) * pesoCostura(e, lj) * (tf[o + 3u] * I3 + tf[o + 4u] * outer(d, d));
}

// 4b. cada punto de costura linealizado en x_t (costuras.ts, linealizar), su energía y sus aportes al gradiente
@compute @workgroup_size(${WG}) fn prepCostura(@builtin(global_invocation_id) g: vec3<u32>) {
  let e = g.x;
  if (e >= NC) { return; }
  let b = I_CV + 3u * e;
  let d = sepCostura(e, ldx(iu[b]), ldx(iu[b + 1u]), ldx(iu[b + 2u]));
  let r = length(d);
  let L = tf[O_CL + e];
  var gg = 0.0;
  var c2 = 0.0;
  if (L == 0.0) {
    gg = KCOST;
  } else if (r > L) {
    let q = L / r;
    gg = KCOST * (1.0 - q);
    c2 = KCOST * q / (r * r);
  }
  let o = O_CST + 5u * e;
  tf[o] = d.x; tf[o + 1u] = d.y; tf[o + 2u] = d.z; tf[o + 3u] = gg; tf[o + 4u] = c2;
  var e0 = 0.0;
  if (r > L) { e0 = 0.5 * KCOST * (r - L) * (r - L); }
  tf[O_CE0 + e] = e0;
  for (var m = 0u; m < 3u; m++) { stc(SLOT_C + 3u * e + m, pesoCostura(e, m) * gg * d); }
}

@compute @workgroup_size(${WG}) fn difCostura(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_PROBANDO)) { return; }
  let e = g.x;
  var de = 0.0;
  if (e < NC) {
    let b = I_CV + 3u * e;
    let r = length(sepCostura(e, ld(O_XP, iu[b]), ld(O_XP, iu[b + 1u]), ld(O_XP, iu[b + 2u])));
    let L = tf[O_CL + e];
    var en = 0.0;
    if (r > L) { en = 0.5 * KCOST * (r - L) * (r - L); }
    de = en - tf[O_CE0 + e];
  }
  let total = reducirSuma(l.x, de);
  if (l.x == 0u) { red[R_PD + w.x] = total; }
}

// 11. las costuras se cierran un cuadro más; cuando todas llegan a 0, la flexión las cruza (sistema.ts, alTerminarCuadro)
@compute @workgroup_size(${WG}) fn cerrarCosturas(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  let e = g.x;
  var abierta = 0.0;
  if (e < NC) {
    var L = tf[O_CL + e] * CIERRE;
    if (L < LCERRADO) { L = 0.0; }
    tf[O_CL + e] = L;
    abierta = L;
  }
  let m = reducirMax(l.x, abierta);
  if (l.x == 0u) { red[R_PD + w.x] = m; }
}

@compute @workgroup_size(1) fn revisarCosido() {
  if (NC == 0u) { return; }
  var m = 0.0;
  for (var k = 0u; k < GC; k++) { m = max(m, red[R_PD + k]); }
  if (m == 0.0) { red[R_SC + E_COSIDA] = 1.0; }
}

// escribir la rigidez de una bisagra de costura en K una y otra vez da lo mismo (placa.ts, activarCosturas)
@compute @workgroup_size(${WG}) fn coser(@builtin(global_invocation_id) g: vec3<u32>) {
  let c = g.x;
  if (c >= NCH || red[R_SC + E_COSIDA] < 0.5) { return; }
  tf[O_KP + iu[I_CK + c]] = tf[O_CKH + c];
}
```

En `ensamblar`, la rama de los códigos:

```wgsl
    if (cod >= 0x80000000u) { M += bloquePlaca(cod - 0x80000000u, i, j); }
    else if (cod >= 0x40000000u) { let k = cod - 0x40000000u; M += bloqueCostura(k >> 4u, (k >> 2u) & 3u, k & 3u); }
    else { M += bloqueMembrana(cod >> 4u, (cod >> 2u) & 3u, cod & 3u); }
```

En `decidir`, después de la suma de `R_PC`: `for (var k = 0u; k < GC; k++) { dg += red[R_PD + k]; }`.

En `motorGpu.ts`: `crear` sube `cs`, `cl` y `ckh` (`tf.set(p.f32.cs, d.tf.CS)` y las otras dos). El `d` de `grabarCuadro` no despacha cero grupos (`if (grupos > 0)`); `prepCostura` va después de `gradElem` (`gc` grupos), `difCostura` después de `difTri` dentro de cada intento, y al final del cuadro, después de `cerrarCuadro`: `cerrarCosturas` (`gc`), `revisarCosido` (1) y `coser` (`gch`).

- [ ] **Step 5: Corre las pruebas**

Run: `npx vitest run src/utils/cloth/implicito/gpu && npx tsc -b --noEmit`
Expected: PASS.

Run: `VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts`
Expected: PASS, con `costura` y `costura-cerrada` a menos de 0,1 mm. Si la cerrada difiere y la abierta no, la bandera se encendió en otro cuadro que en la CPU: en el registro, anota en qué cuadro la ve la GPU (`leerEstado`).

- [ ] **Step 6: Gate y commit**

Run: `npx vitest run src/utils/cloth && npm run lint`

```bash
git add src/utils/cloth/implicito/gpu/empaquetar.ts src/utils/cloth/implicito/gpu/wgsl.ts src/utils/cloth/implicito/gpu/motorGpu.ts src/utils/cloth/implicito/banco/escenas.ts src/utils/cloth/implicito/__tests__/ayudas.ts src/components/testScenes/TelaImplicitaHarness.tsx src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts tests/e2e/tela-implicita.spec.ts
git commit -m "feat(tela): las costuras en la GPU, con su cierre y la flexión que las cruza al cerrar

Cada punto de costura aporta al gradiente con tres ranuras, a la matriz con
sus bloques entre los de la membrana y los de la placa, y a la búsqueda en
línea con su energía. Su largo de reposo se cierra en la GPU al final de cada
cuadro y, cuando todos llegan a 0, una bandera escribe en K la rigidez de las
bisagras de costura. El margen ya viajaba en la masa y en K. La escena de
costura corre en la CPU y en la GPU, abierta y cerrada desde el primer cuadro."
```

---

### Tarea 6: El cuerpo en la GPU, con su BVH

El cuerpo viaja con su `LinearBVH`: nodos, punteros de escape, triángulos, normales de cara y pseudonormales de arista y de vértice, en las zonas de `tf` y de `iu`. El WGSL recorre el árbol igual que `CuerpoRigido.cercano`: sin pila, saltando por `skip`, con el punto más cercano de Ericson. El lado lo decide la pseudonormal de la característica donde cae el punto, y la normal del plano va del punto más cercano hacia el vértice. El punto más cercano en WGSL lo usa también el contacto propio (Tarea 7). Un solo cuerpo: con dos, `empaquetar` se niega.

**Files:**
- Create: `src/utils/cloth/implicito/gpu/wgslCuerpo.ts`
- Modify: `src/utils/cloth/implicito/gpu/empaquetar.ts`, `wgsl.ts` (`wgslObstaculos` con el cuerpo; zonas; constantes), `motorGpu.ts` (sube el cuerpo)
- Modify: `src/utils/cloth/implicito/banco/escenas.ts` (`escenaEsfera`, `escenaInclinada`), el harness
- Test: `src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`, `wgsl.test.ts`, `tests/e2e/tela-implicita.spec.ts`

**Interfaces:**
- Consumes: `LinearBVH` (`nodes` 8 por nodo: caja, `triStart`/hijo, `triCount`; `skip`; `triVerts` 9 por triángulo; `triNormals` 3; `edgePseudonormals` 9; `vertexPseudonormals` 9); `RADIO_DE_BUSQUEDA` (`obstaculos.ts`).
- Produces: `wgslPuntoMasCercano(): string` (WGSL: `struct EnTri { q: vec3<f32>, w: vec3<f32>, rasgo: u32 }` y `fn puntoMasCercano(p, a, b, c) -> EnTri`, con el mismo rasgo que `cuerpo.ts`: 0 cara, 1-3 aristas AB, BC y CA, 4-6 vértices A, B y C); `wgslCuerpoCercano(): string` (WGSL: `fn cuerpoCercano(p: vec3<f32>, radio: f32) -> vec4<f32>`, que devuelve (d, n) o (1e30, 0, 1, 0) si no hay nada a menos del radio); `PaqueteGpu.ncu`, `f32.cuNodos`, `cuTri`, `cuNt`, `cuPa`, `cuPv`, `u32.cuSalto`; `escenaEsfera(): Escena`, `escenaInclinada(): Escena`.

- [ ] **Step 1: Las escenas con cuerpo y su paridad**

En `escenas.ts` (imports: `buildLinearBVH` de `../../gpu/bvh`, `CuerpoRigido` de `../cuerpo`):

```ts
/** Una lámina de 120 mm, 5 mm sobre una esfera de 5 cm (malla de cuerpo): el contacto llega por anticipación en el segundo cuadro. */
export function escenaEsfera(): Escena {
  const cuerpo = new CuerpoRigido(buildLinearBVH(esferaDeColision(0.05, 3)));
  return { malla: mallaDeContorno(rectangulo(-60, -60, 60, 60), 10, 0.055), obstaculos: [{ tipo: 'cuerpo', cuerpo }] };
}

/** Una lámina de 100 mm apoyada en un plano inclinado 15° (malla de cuerpo), 0,1 mm dentro de su separación. */
export function escenaInclinada(): Escena {
  const a = (15 * Math.PI) / 180, n: [number, number, number] = [-Math.sin(a), Math.cos(a), 0];
  const cuerpo = new CuerpoRigido(buildLinearBVH(planoDeColision(n, 0.4)));
  const malla = mallaDeContorno(rectangulo(-50, -50, 50, 50), 10);
  const h = separacion(telaSI(TELA_DE_LABORATORIO)) - 0.0001;
  // el dibujo sobre el plano: x a lo largo de la pendiente, z horizontal
  malla.x = Float64Array.from(malla.x, (_, k) => {
    const i = Math.floor(k / 3), px = malla.patron[2 * i], pz = malla.patron[2 * i + 1];
    return [px * Math.cos(a) + h * n[0], px * Math.sin(a) + h * n[1], pz][k % 3];
  });
  return { malla, obstaculos: [{ tipo: 'cuerpo', cuerpo }] };
}
```

El harness suma `esfera` e `inclinada`; la spec, las dos a la lista de paridad.

- [ ] **Step 2: Las pruebas del paquete con cuerpo**

En `empaquetar.test.ts`:

```ts
describe('el paquete con un cuerpo', () => {
  it('lleva el BVH del cuerpo tal cual', () => {
    const e = escenaEsfera();
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos, ajustes: { contactoPropio: false } });
    const p = empaquetar(s), o = e.obstaculos[0];
    if (o.tipo !== 'cuerpo') throw new Error('la escena trae un cuerpo');
    const bvh = o.cuerpo.bvh;
    expect(p.ncu).toBe(bvh.nodeCount);
    expect(Array.from(p.u32.cuSalto)).toEqual(Array.from(bvh.skip));
    expect(Array.from(p.f32.cuTri)).toEqual(Array.from(bvh.triVerts));
    expect(Array.from(p.f32.cuPv)).toEqual(Array.from(bvh.vertexPseudonormals));
  });

  it('con dos cuerpos se niega', () => {
    const e = escenaEsfera();
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: [...e.obstaculos, ...e.obstaculos], ajustes: { contactoPropio: false } });
    expect(() => empaquetar(s)).toThrow(/un solo cuerpo/);
  });
});
```

En `wgsl.test.ts`:

```ts
  it('con un cuerpo, el obstáculo es el BVH recorrido hasta el radio de búsqueda', () => {
    const e = escenaEsfera();
    const sc = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos, ajustes: { contactoPropio: false } });
    const pc = empaquetar(sc), fc = wgslDelMotor(sc, pc, distribuir(pc, 60));
    expect(fc).toMatch(/fn cuerpoCercano\(/);
    expect(fc).toMatch(/return cuerpoCercano\(p, RADIO_B\)/);
    expect(fc).not.toMatch(/Infinity|NaN/);
  });
```

Run: `npx vitest run src/utils/cloth/implicito/gpu`
Expected: FAIL: `ncu` no existe y `wgslObstaculos` se niega con el cuerpo.

- [ ] **Step 3: `gpu/wgslCuerpo.ts`**

```ts
/**
 * El cuerpo en la GPU (spec 2026-10-13 §4.3.1): el punto más cercano de un triángulo (Ericson, «Real-Time Collision
 * Detection», §5.1.5, como cuerpo.ts) y el recorrido del BVH del cuerpo sin pila, por sus punteros de escape, como
 * CuerpoRigido.cercano. Lee las zonas CUN (nodos), CUT (triángulos), CUNT (normales de cara), CUPA y CUPV
 * (pseudonormales de arista y de vértice) de tf, y CUS (escapes) de iu.
 */

/** `puntoMasCercano(p, a, b, c)`: el punto, sus pesos y el rasgo (0 cara; 1, 2, 3 aristas AB, BC, CA; 4, 5, 6 vértices A, B, C). */
export function wgslPuntoMasCercano(): string {
  return /* wgsl */ `struct EnTri { q: vec3<f32>, w: vec3<f32>, rasgo: u32 }
fn enTri(w: vec3<f32>, rasgo: u32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>) -> EnTri { return EnTri(w.x * a + w.y * b + w.z * c, w, rasgo); }
fn puntoMasCercano(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>) -> EnTri {
  let ab = b - a;
  let ac = c - a;
  let ap = p - a;
  let d1 = dot(ab, ap);
  let d2 = dot(ac, ap);
  if (d1 <= 0.0 && d2 <= 0.0) { return enTri(vec3<f32>(1.0, 0.0, 0.0), 4u, a, b, c); }
  let bp = p - b;
  let d3 = dot(ab, bp);
  let d4 = dot(ac, bp);
  if (d3 >= 0.0 && d4 <= d3) { return enTri(vec3<f32>(0.0, 1.0, 0.0), 5u, a, b, c); }
  let vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) { let v = d1 / (d1 - d3); return enTri(vec3<f32>(1.0 - v, v, 0.0), 1u, a, b, c); }
  let cp = p - c;
  let d5 = dot(ab, cp);
  let d6 = dot(ac, cp);
  if (d6 >= 0.0 && d5 <= d6) { return enTri(vec3<f32>(0.0, 0.0, 1.0), 6u, a, b, c); }
  let vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) { let w = d2 / (d2 - d6); return enTri(vec3<f32>(1.0 - w, 0.0, w), 3u, a, b, c); }
  let va = d3 * d6 - d5 * d4;
  if (va <= 0.0 && d4 - d3 >= 0.0 && d5 - d6 >= 0.0) { let w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return enTri(vec3<f32>(0.0, 1.0 - w, w), 2u, a, b, c); }
  let den = va + vb + vc;
  if (!(abs(den) > 0.0)) { return enTri(vec3<f32>(1.0, 0.0, 0.0), 4u, a, b, c); }
  let v = vb / den;
  let w = vc / den;
  return enTri(vec3<f32>(1.0 - v - w, v, w), 0u, a, b, c);
}`;
}

/** `cuerpoCercano(p, radio)`: (d con signo, normal del plano) del punto del cuerpo más cercano, o (1e30, 0, 1, 0). */
export function wgslCuerpoCercano(): string {
  return /* wgsl */ `fn v3tf(o: u32) -> vec3<f32> { return vec3<f32>(tf[o], tf[o + 1u], tf[o + 2u]); }
fn cuerpoCercano(p: vec3<f32>, radio: f32) -> vec4<f32> {
  var mejor2 = radio * radio;
  var mejor = NINGUNA;
  var rasgo = 0u;
  var q = vec3<f32>(0.0);
  var i = 0u;
  loop {
    if (i >= NCU) { break; }
    let o = O_CUN + 8u * i;
    let dd = max(max(v3tf(o) - p, vec3<f32>(0.0)), p - v3tf(o + 3u));
    if (dot(dd, dd) >= mejor2) {
      i = iu[I_CUS + i];
      continue;
    }
    let cuenta = u32(tf[o + 7u]);
    if (cuenta == 0u) {
      i = i + 1u;
      continue;
    }
    let t0 = u32(tf[o + 6u]);
    for (var t = t0; t < t0 + cuenta; t++) {
      let b = O_CUT + 9u * t;
      let r = puntoMasCercano(p, v3tf(b), v3tf(b + 3u), v3tf(b + 6u));
      let e = p - r.q;
      let d2 = dot(e, e);
      if (d2 < mejor2) {
        mejor2 = d2;
        mejor = t;
        rasgo = r.rasgo;
        q = r.q;
      }
    }
    i = iu[I_CUS + i];
  }
  if (mejor == NINGUNA) { return vec4<f32>(1e30, 0.0, 1.0, 0.0); }
  // la pseudonormal de la característica donde cayó el punto decide el lado (cuerpo.ts)
  var fuente = v3tf(O_CUNT + 3u * mejor);
  if (rasgo >= 1u && rasgo <= 3u) { fuente = v3tf(O_CUPA + 9u * mejor + 3u * (rasgo - 1u)); }
  if (rasgo >= 4u) { fuente = v3tf(O_CUPV + 9u * mejor + 3u * (rasgo - 4u)); }
  let e = p - q;
  let dist = sqrt(mejor2);
  var signo = 1.0;
  if (dot(e, fuente) < 0.0) { signo = -1.0; }
  var n = fuente;
  if (dist > 1e-9) { n = signo * e / dist; }
  return vec4<f32>(signo * dist, n);
}`;
}
```

- [ ] **Step 4: El paquete y el WGSL con el cuerpo**

En `empaquetar.ts`, `PaqueteGpu` gana `ncu: number` (nodos del BVH del cuerpo; 0 sin cuerpo), en `f32`: `cuNodos`, `cuTri`, `cuNt`, `cuPa`, `cuPv`; y en `u32`: `cuSalto`. En `empaquetar`:

```ts
  const cuerpos = s.obstaculos.flatMap((o) => (o.tipo === 'cuerpo' ? [o.cuerpo] : []));
  if (cuerpos.length > 1) throw new Error('empaquetar: la GPU lleva un solo cuerpo');
  const bvh = cuerpos[0]?.bvh;
```

y en el `return`:

```ts
    ncu: bvh?.nodeCount ?? 0,
    // en f32:
    cuNodos: bvh?.nodes ?? new Float32Array(0),
    cuTri: bvh?.triVerts ?? new Float32Array(0),
    cuNt: bvh?.triNormals ?? new Float32Array(0),
    cuPa: bvh?.edgePseudonormals ?? new Float32Array(0),
    cuPv: bvh?.vertexPseudonormals ?? new Float32Array(0),
    // en u32:
    cuSalto: bvh?.skip ?? new Uint32Array(0),
```

En `wgsl.ts`: `ZonaTf` suma `'CUN' | 'CUT' | 'CUNT' | 'CUPA' | 'CUPV'`, con tamaños `p.f32.cuNodos.length`, `p.f32.cuTri.length` y así; `motorGpu.crear` las sube con `tf.set`. Constantes nuevas (import: `RADIO_DE_BUSQUEDA` de `../obstaculos`; `wgslCuerpoCercano, wgslPuntoMasCercano` de `./wgslCuerpo`):

```ts
const NCU = ${u(p.ncu)};
const I_CUS = ${u(iu.cuSalto)};
const RADIO_B = ${f(RADIO_DE_BUSQUEDA)};
```

En `wgslObstaculos`, el cuerpo deja de negarse:

```ts
  const cuerpos = obs.map((o, k) => {
    if (o.tipo === 'cuerpo') return `fn obstaculo${k}(p: vec3<f32>) -> vec4<f32> { return cuerpoCercano(p, RADIO_B); }`;
    return o.tipo === 'plano' ? … : …; // los dos textos de hoy, sin cambios
  });
```

y `wgslDelMotor` pone `${wgslPuntoMasCercano()}` y `${wgslCuerpoCercano()}` antes de `${wgslObstaculos(s.obstaculos)}`. La prueba de hoy de `wgslObstaculos([])` sigue igual.

- [ ] **Step 5: Corre las pruebas**

Run: `npx vitest run src/utils/cloth/implicito/gpu && npx tsc -b --noEmit`
Expected: PASS.

Run: `VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts`
Expected: PASS, con `esfera` e `inclinada` a menos de 0,1 mm.

- [ ] **Step 6: Gate y commit**

Run: `npx vitest run src/utils/cloth && npm run lint`

```bash
git add src/utils/cloth/implicito/gpu/wgslCuerpo.ts src/utils/cloth/implicito/gpu/empaquetar.ts src/utils/cloth/implicito/gpu/wgsl.ts src/utils/cloth/implicito/gpu/motorGpu.ts src/utils/cloth/implicito/banco/escenas.ts src/components/testScenes/TelaImplicitaHarness.tsx src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts src/utils/cloth/implicito/gpu/__tests__/wgsl.test.ts tests/e2e/tela-implicita.spec.ts
git commit -m "feat(tela): el cuerpo en la GPU, con su BVH recorrido sin pila

El BVH del cuerpo viaja con sus escapes, triángulos, normales y
pseudonormales. El WGSL lo recorre como CuerpoRigido.cercano: punto más
cercano de Ericson, el lado por la pseudonormal de la cara, la arista o el
vértice donde cae, y la normal del plano desde ese punto hacia el vértice. La
tela sobre una esfera y sobre un plano inclinado da lo mismo en la CPU y en
la GPU."
```

---

### Tarea 7: La tela contra sí misma en la GPU (E3, E6)

El mismo armado de pares que la CPU, desde cada triángulo. Por cuadro:

1. `velMax` y `armarRadio` sacan el radio de búsqueda y la celda, igual que la CPU.
2. Se arma la rejilla de puntos por hash espacial. `hashContar` cuenta con atómicas, una suma exclusiva da dónde empieza cada celda y `hashLlenar` reparte.
3. `paresDeTriangulo` recorre, por triángulo, las celdas de su caja y guarda cada par en una lista con una atómica.
4. Una segunda cuenta, otra suma y otro reparto arman, para cada vértice, la lista de sus entradas en los pares (§4.3.2).
5. El residuo, el producto matriz-vector y el bloque diagonal recorren esa lista. La anticipación y la búsqueda en línea recorren los pares.

Los índices viajan como enteros exactos en `f32`, por debajo de 2²⁴. Las atómicas viven en un octavo búfer, `at`. Si un cuadro trae más pares que su capacidad, los que sobran no se guardan, se cuentan en el estado y no se escribe fuera del búfer.

**Files:**
- Create: `src/utils/cloth/implicito/gpu/wgslPropio.ts`
- Modify: `src/utils/cloth/implicito/gpu/empaquetar.ts` (excluidos, capacidad, celdas), `wgsl.ts` (el búfer `at`, las zonas, constantes, el recorrido en `residuo` y `spmv`, `armarRonda2`, `decidir`), `motorGpu.ts` (el búfer, los despachos, el estado)
- Modify: `escenas.ts` (`escenaCapas`), el harness (contacto propio encendido; `maxPares`)
- Test: `empaquetar.test.ts`, `wgsl.test.ts`, `tests/e2e/tela-implicita.spec.ts`

**Interfaces:**
- Consumes: `SistemaTela.excluidos`, `.aristaMedia`, `.sepPropia`, `.tela.friccionTela`; `ALCANCE_MAXIMO`; `puntoMasCercano` en WGSL (Tarea 6).
- Produces: `empaquetar(s, op?: { maxPares?: number })`; `PaqueteGpu.propio: boolean`, `.maxPares`, `.nceldas` (potencia de 2), `.np` (puntos de la rejilla: la tela; la Tarea 8 suma el cuerpo), `.sepPropia`, `.aristaMedia`, `u32.exOff`, `u32.exIdx`; `Distribucion.at` (zonas del búfer atómico: `CNTC`, `CURC`, `CNTV`, `CURV`, `NPAR`, `DESB`); `MotorGpu.crear(device, s, cuadrosDeHistoria?, maxPares?)`; `EstadoGpu.pares` y `.desbordes`; `wgslPropio(): string`; `escenaCapas(): Escena`.

- [ ] **Step 1: La escena de capas y su paridad**

En `escenas.ts`:

```ts
/** Una lámina de 90 mm, 2,5 mm sobre otra de 120 mm apoyada en el suelo y bajando a 0,1 m/s: pares activos y anticipados en los primeros cuadros. */
export function escenaCapas(): Escena {
  const s0 = separacion(telaSI(TELA_DE_LABORATORIO));
  const abajo = mallaDeContorno(rectangulo(-60, -60, 60, 60), 10, s0), arriba = mallaDeContorno(rectangulo(-45, -45, 45, 45), 10, s0 + 0.0025);
  const prenda = armarPrenda([{ id: 'abajo', ...abajo }, { id: 'arriba', ...arriba }]);
  const nAbajo = abajo.x.length / 3;
  return {
    malla: prenda.malla,
    obstaculos: [{ tipo: 'plano', altura: 0 }],
    v: Float64Array.from(prenda.malla.x, (_, k) => (k % 3 === 1 && k >= 3 * nAbajo ? -0.1 : 0)),
  };
}
```

En el harness: `ESCENAS` suma `capas`; en los ajustes, `contactoPropio: q.get('propio') !== '0'` (encendido salvo que se pida apagarlo), y `MotorGpu.crear(device, s, 3600, Number(q.get('maxPares')) || undefined)`. En la spec, la lista de paridad suma `'capas'`, la prueba de paridad agrega `if (escena === 'capas') expect(r.estado?.pares).toBeGreaterThan(0);`, y entra la prueba del desborde:

```ts
  test('con lugar para 8 pares, la GPU cuenta los que no caben y la tela no se llena de NaN', async ({ page }) => {
    const r = await correr(page, 'modo=paridad&escena=capas&cg=50&cuadros=3&maxPares=8');
    expect(r.estado?.desbordes).toBeGreaterThan(0);
    expect(Number.isFinite(r.dif?.maxima)).toBe(true);
  });
```

`ResultadoTela.estado` suma `pares: number; desbordes: number`.

- [ ] **Step 2: Las pruebas del paquete con contacto propio**

En `empaquetar.test.ts`:

```ts
describe('el paquete con contacto propio', () => {
  const e = escenaCostura(30);
  const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { costuras: e.costuras, franja: e.franja });
  const p = empaquetar(s);

  it('lleva los compañeros de costura de cada vértice, como la CPU', () => {
    for (let i = 0; i < s.n; i++) expect(Array.from(p.u32.exIdx.subarray(p.u32.exOff[i], p.u32.exOff[i + 1]))).toEqual(s.excluidos[i]);
  });

  it('la rejilla tiene al menos dos celdas por punto y la capacidad de pares es la pedida', () => {
    expect(p.nceldas & (p.nceldas - 1)).toBe(0);
    expect(p.nceldas).toBeGreaterThanOrEqual(2 * p.np);
    expect(empaquetar(s, { maxPares: 8 }).maxPares).toBe(8);
  });
});
```

Y en `wgsl.test.ts`, la prueba de los límites usa el sistema con contacto propio (el valor por defecto) y su `tamanosDeBufer` incluye `at`: siguen siendo 8 búferes o menos, de 128 MiB o menos.

Run: `npx vitest run src/utils/cloth/implicito/gpu`
Expected: FAIL (`exOff` no existe).

- [ ] **Step 3: El paquete**

En `empaquetar.ts`, la firma pasa a `empaquetar(s: SistemaTela, op: { maxPares?: number } = {}): PaqueteGpu`. `PaqueteGpu` gana:

```ts
  /** la tela contra sí misma (sistema.ts, armarParesPropios) */
  propio: boolean;
  /** pares que caben por cuadro */
  maxPares: number;
  /** puntos de la rejilla: la tela (la Tarea 8 suma los vértices del cuerpo) */
  np: number;
  /** entradas de la tabla de hash de la rejilla: una potencia de 2, al menos dos por punto */
  nceldas: number;
  sepPropia: number;
  aristaMedia: number;
```

y en `u32`: `exOff` (n + 1) y `exIdx` (los `excluidos` de cada vértice, él incluido). En `empaquetar`:

```ts
  const maxPares = op.maxPares ?? Math.max(64, 16 * n);
  const np = n;
  let nceldas = 1;
  while (nceldas < 2 * np) nceldas *= 2;
  // los índices de pares, listas y rejilla viajan como enteros exactos en f32
  if (4 * maxPares >= 1 << 24 || np >= 1 << 24 || nceldas >= 1 << 24) throw new Error('empaquetar: más pares o puntos de los que la GPU guarda como enteros exactos');
  const exOff = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) exOff[i + 1] = exOff[i] + s.excluidos[i].length;
```

con `propio: s.aj.contactoPropio, maxPares, np, nceldas, sepPropia: s.sepPropia, aristaMedia: s.aristaMedia` y `exOff, exIdx: Uint32Array.from(s.excluidos.flat())` en el `return`. 16 pares por vértice alcanzan con E6: un vértice forma par con una cara por cada capa que tiene a menos del radio.

Run: `npx vitest run src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`
Expected: PASS.

- [ ] **Step 4: `gpu/wgslPropio.ts`**

```ts
/**
 * La tela contra sí misma en la GPU (spec 2026-10-13 §4.3.2, con E3 y E6): el mismo armado de pares que sistema.ts,
 * armarParesPropios. Una rejilla de puntos por hash espacial (contar, sumar, repartir; las atómicas solo cuentan) y
 * cada triángulo recorre las celdas de su caja agrandada por el radio. Los pares van a una lista, y cada vértice tiene,
 * rearmada en cada cuadro, la lista de sus entradas en los pares: la recorren el residuo, el producto matriz-vector y
 * el bloque diagonal (§4.3.2). Un par ocupa 14 números en tf: los cuatro vértices (−1 si no hay), sus pesos, la normal,
 * p0, kt y si está activo.
 */

/** Suma exclusiva de `largo` cuentas del búfer `at` (desde `cuenta`) a tf (desde `salida`, como f32 exactos), con el total al final. */
export function wgslScan(nombre: string, cuenta: string, largo: string, salida: string): string {
  return /* wgsl */ `@compute @workgroup_size(WG) fn ${nombre}Bloques(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  var v = 0u;
  if (g.x < ${largo}) { v = atomicLoad(&at[${cuenta} + g.x]); }
  shu[l.x] = v;
  workgroupBarrier();
  for (var paso = 1u; paso < WG; paso = paso * 2u) {
    var s = 0u;
    if (l.x >= paso) { s = shu[l.x - paso]; }
    workgroupBarrier();
    shu[l.x] = shu[l.x] + s;
    workgroupBarrier();
  }
  if (g.x < ${largo}) { tf[${salida} + g.x] = f32(shu[l.x] - v); }
  if (l.x == WG - 1u) { tf[O_SCB + w.x] = f32(shu[l.x]); }
}
@compute @workgroup_size(1) fn ${nombre}Totales() {
  var s = 0.0;
  for (var k = 0u; k < (${largo} + WG - 1u) / WG; k++) {
    let t = tf[O_SCB + k];
    tf[O_SCB + k] = s;
    s = s + t;
  }
  tf[${salida} + ${largo}] = s;
}
@compute @workgroup_size(WG) fn ${nombre}Sumar(@builtin(global_invocation_id) g: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (g.x >= ${largo}) { return; }
  tf[${salida} + g.x] = tf[${salida} + g.x] + tf[O_SCB + w.x];
}`;
}

/** Las funciones y entradas del contacto propio; se escriben siempre, porque el motor crea una tubería por entrada. */
export function wgslPropio(): string {
  return /* wgsl */ `var<workgroup> shu: array<u32, WG>;

fn celdaDe(p: vec3<f32>, c: f32) -> vec3<i32> { return vec3<i32>(floor(p / c)); }
fn hashCelda(k: vec3<i32>) -> u32 {
  let u = bitcast<vec3<u32>>(k);
  return ((u.x * 73856093u) ^ (u.y * 19349663u) ^ (u.z * 83492791u)) & (NCELDAS - 1u);
}
fn puntoDe(p: u32) -> vec3<f32> {
  if (p < N) { return ldx(p); }
  return v3tf(O_CUV + 3u * (p - N));
}
fn nPares() -> u32 { return min(atomicLoad(&at[A_NPAR]), MAXP); }

// 4c. el radio de búsqueda y la celda del cuadro (sistema.ts, armarParesPropios)
@compute @workgroup_size(WG) fn velMax(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  var v = 0.0;
  if (g.x < N) { v = length(ld(O_V, g.x)); }
  let m = reducirMax(l.x, v);
  if (l.x == 0u) { red[R_PB + w.x] = m; }
}

@compute @workgroup_size(1) fn armarRadio() {
  var vmax = 0.0;
  for (var k = 0u; k < GV; k++) { vmax = max(vmax, red[R_PB + k]); }
  let r = SEPP + min(ALCANCE, 2.0 * vmax * H + abs(GRAV) * H * H);
  red[R_SC + E_RADIO] = r;
  // la celda mide al menos el radio: la caja de un triángulo toca a lo sumo cinco celdas por eje
  red[R_SC + E_CELDA] = max(max(2.0 * SEPP, ARISTA), r);
  atomicStore(&at[A_NPAR], 0u);
}

// 4d. la rejilla de puntos
@compute @workgroup_size(WG) fn limpiarCeldas(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= NCELDAS) { return; }
  atomicStore(&at[A_CNTC + g.x], 0u);
  atomicStore(&at[A_CURC + g.x], 0u);
}

@compute @workgroup_size(WG) fn hashContar(@builtin(global_invocation_id) g: vec3<u32>) {
  let p = g.x;
  if (p >= NP) { return; }
  let h = hashCelda(celdaDe(puntoDe(p), red[R_SC + E_CELDA]));
  tf[O_HP + p] = f32(h);
  atomicAdd(&at[A_CNTC + h], 1u);
}

${wgslScan('scanC', 'A_CNTC', 'NCELDAS', 'O_OFFC')}

@compute @workgroup_size(WG) fn hashLlenar(@builtin(global_invocation_id) g: vec3<u32>) {
  let p = g.x;
  if (p >= NP) { return; }
  let h = u32(tf[O_HP + p]);
  tf[O_ORD + u32(tf[O_OFFC + h]) + atomicAdd(&at[A_CURC + h], 1u)] = f32(p);
}

// 4e. los pares
fn excluido(i: u32, v: u32) -> bool {
  for (var k = iu[I_EXO + i]; k < iu[I_EXO + i + 1u]; k++) { if (iu[I_EXI + k] == v) { return true; } }
  return false;
}

fn guardarPar(v: vec4<f32>, w: vec4<f32>, n: vec3<f32>, p0: f32, kt: f32) {
  let k = atomicAdd(&at[A_NPAR], 1u);
  if (k >= MAXP) {
    atomicAdd(&at[A_DESB], 1u);
    return;
  }
  let o = O_PAR + 14u * k;
  tf[o] = v.x; tf[o + 1u] = v.y; tf[o + 2u] = v.z; tf[o + 3u] = v.w;
  tf[o + 4u] = w.x; tf[o + 5u] = w.y; tf[o + 6u] = w.z; tf[o + 7u] = w.w;
  tf[o + 8u] = n.x; tf[o + 9u] = n.y; tf[o + 10u] = n.z;
  tf[o + 11u] = p0;
  tf[o + 12u] = kt;
  tf[o + 13u] = select(0.0, 1.0, p0 > 0.0);
}

// un vértice libre de tela contra la cara (ia, ib, ic): solo si cae sobre ella (E6), a menos del radio
fn parDeVertice(i: u32, ia: u32, ib: u32, ic: u32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, xi: vec3<f32>, r: f32) {
  if (iu[I_FIJO + i] != 0u || excluido(i, ia) || excluido(i, ib) || excluido(i, ic)) { return; }
  let e = puntoMasCercano(xi, a, b, c);
  if (e.rasgo != 0u) { return; }
  let dv = xi - e.q;
  let d = length(dv);
  if (d >= r || d < 1e-9) { return; }
  let n = dv / d;
  let p0 = SEPP - d;
  var kt = 0.0;
  if (p0 > 0.0) {
    let vr = ld(O_V, i) - e.w.x * ld(O_V, ia) - e.w.y * ld(O_V, ib) - e.w.z * ld(O_V, ic);
    kt = rigidez(MU_T, KC * p0, tangencial(vr, n));
  }
  guardarPar(vec4<f32>(f32(i), f32(ia), f32(ib), f32(ic)), vec4<f32>(1.0, -e.w.x, -e.w.y, -e.w.z), n, p0, kt);
}

// (aquí van parDePunta y limpiarPuntas, de la Tarea 8)

@compute @workgroup_size(WG) fn paresDeTriangulo(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = g.x;
  if (t >= NT) { return; }
  let ia = iu[I_TRIS + 3u * t];
  let ib = iu[I_TRIS + 3u * t + 1u];
  let ic = iu[I_TRIS + 3u * t + 2u];
  let a = ldx(ia);
  let b = ldx(ib);
  let c = ldx(ic);
  let r = red[R_SC + E_RADIO];
  let cel = red[R_SC + E_CELDA];
  let k0 = celdaDe(min(min(a, b), c) - vec3<f32>(r), cel);
  let k1 = celdaDe(max(max(a, b), c) + vec3<f32>(r), cel);
  // ponytail: un triángulo estirado más allá de ocho celdas por eje no busca pares y se cuenta como desborde
  if (any(k1 - k0 >= vec3<i32>(8))) {
    atomicAdd(&at[A_DESB], 1u);
    return;
  }
  let libres = iu[I_FIJO + ia] == 0u || iu[I_FIJO + ib] == 0u || iu[I_FIJO + ic] == 0u;
  for (var kx = k0.x; kx <= k1.x; kx++) {
    for (var ky = k0.y; ky <= k1.y; ky++) {
      for (var kz = k0.z; kz <= k1.z; kz++) {
        let k = vec3<i32>(kx, ky, kz);
        let h = hashCelda(k);
        let fin = u32(tf[O_OFFC + h + 1u]);
        for (var s = u32(tf[O_OFFC + h]); s < fin; s++) {
          let p = u32(tf[O_ORD + s]);
          let q = puntoDe(p);
          // la misma entrada del hash guarda puntos de otras celdas: cada punto se mira desde la suya
          if (any(celdaDe(q, cel) != k)) { continue; }
          if (p < N) { parDeVertice(p, ia, ib, ic, a, b, c, q, r); }
        }
      }
    }
  }
}

// 4f. la lista de entradas de cada vértice en los pares
@compute @workgroup_size(WG) fn limpiarVertices(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= N) { return; }
  atomicStore(&at[A_CNTV + g.x], 0u);
  atomicStore(&at[A_CURV + g.x], 0u);
}

@compute @workgroup_size(WG) fn contarEntradas(@builtin(global_invocation_id) g: vec3<u32>) {
  let k = g.x;
  if (k >= nPares()) { return; }
  for (var j = 0u; j < 4u; j++) {
    let v = tf[O_PAR + 14u * k + j];
    if (v >= 0.0) { atomicAdd(&at[A_CNTV + u32(v)], 1u); }
  }
}

${wgslScan('scanV', 'A_CNTV', 'N', 'O_OFFV')}

@compute @workgroup_size(WG) fn llenarEntradas(@builtin(global_invocation_id) g: vec3<u32>) {
  let k = g.x;
  if (k >= nPares()) { return; }
  for (var j = 0u; j < 4u; j++) {
    let v = tf[O_PAR + 14u * k + j];
    if (v < 0.0) { continue; }
    let vi = u32(v);
    tf[O_ENT + u32(tf[O_OFFV + vi]) + atomicAdd(&at[A_CURV + vi], 1u)] = f32(4u * k + j);
  }
}

// 8b. los pares que el paso cruzaría, medidos sobre su plano fijo (sistema.ts, anticiparContactos)
@compute @workgroup_size(WG) fn anticiparPares(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  let k = g.x;
  var nuevo = 0.0;
  if (k < nPares()) {
    let o = O_PAR + 14u * k;
    if (tf[o + 13u] < 0.5) {
      let nn = v3tf(o + 8u);
      var un = 0.0;
      for (var j = 0u; j < 4u; j++) {
        let v = tf[o + j];
        if (v >= 0.0) { un += tf[o + 4u + j] * dot(nn, ld(O_DX, u32(v))); }
      }
      if (tf[o + 11u] - un > 0.0) {
        tf[o + 13u] = 1.0;
        nuevo = 1.0;
      }
    }
  }
  let total = reducirSuma(l.x, nuevo);
  if (l.x == 0u) { red[R_PE + w.x] = total; }
}

// 9b. la energía de los pares activos en la búsqueda en línea (contactoPropio.ts, energiaDelPar)
@compute @workgroup_size(WG) fn difPares(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_PROBANDO)) { return; }
  let k = g.x;
  var de = 0.0;
  if (k < nPares()) {
    let o = O_PAR + 14u * k;
    if (tf[o + 13u] > 0.5) {
      var U = vec3<f32>(0.0);
      for (var j = 0u; j < 4u; j++) {
        let v = tf[o + j];
        if (v >= 0.0) { U += tf[o + 4u + j] * (ld(O_XP, u32(v)) - ld(O_XT, u32(v))); }
      }
      let nn = v3tf(o + 8u);
      let p0 = tf[o + 11u];
      let un = dot(nn, U);
      let p = p0 - un;
      let tt = U - un * nn;
      var e = 0.5 * tf[o + 12u] * dot(tt, tt);
      if (p > 0.0) { e += 0.5 * KC * p * p; }
      var e0 = 0.0;
      if (p0 > 0.0) { e0 = 0.5 * KC * p0 * p0; }
      de = e - e0;
    }
  }
  let total = reducirSuma(l.x, de);
  if (l.x == 0u) { red[R_PE + w.x] = total; }
}`;
}
```

`v3tf` es de `wgslCuerpo.ts` (Tarea 6). La zona `CUV` existe desde ya en `tf`, con tamaño 0 hasta la Tarea 8.

- [ ] **Step 5: El búfer `at` y el recorrido de las listas**

En `wgsl.ts`:

1. `ZonaTf` suma `'CUV' | 'HP' | 'OFFC' | 'ORD' | 'PAR' | 'OFFV' | 'ENT' | 'SCB'`, con tamaños `CUV: 0` (la Tarea 8 lo llena), `HP: p.np`, `OFFC: p.nceldas + 1`, `ORD: p.np`, `PAR: 14 * p.maxPares`, `OFFV: n + 1`, `ENT: 4 * p.maxPares`, `SCB: Math.max(Math.ceil(p.nceldas / WG), Math.ceil(n / WG)) + 1`. `Distribucion` gana `at = zonas({ CNTC: p.nceldas, CURC: p.nceldas, CNTV: n, CURV: n, NPAR: 1, DESB: 1 })`, la zona `PE` en `ZonaRed` y en `red` (entre `PD` y `SC`), y los grupos `gp = Math.ceil(p.maxPares / WG)`, `gcel = Math.ceil(p.nceldas / WG)`, `gpnt = Math.ceil(p.np / WG)`, con `zona = Math.max(gv, gt, gh, gc, gp, 1)`. `N_ESC` pasa a 32 y `ESC` suma `RADIO: 16, CELDA: 17`. `tamanosDeBufer` suma `at: 4 * d.at.total`.
2. La ligadura nueva, después de `pv`: `@group(0) @binding(7) var<storage, read_write> at: array<atomic<u32>>;`. Constantes (import: `ALCANCE_MAXIMO` de `../contactoPropio`; `wgslPropio` de `./wgslPropio`):

```ts
const WG = ${u(WG)};
const PROPIO = ${p.propio};
const NP = ${u(p.np)};
const NCELDAS = ${u(p.nceldas)};
const MAXP = ${u(p.maxPares)};
const GP = ${u(d.gp)};
const R_PE = ${u(red.PE)};
const I_EXO = ${u(iu.exOff)}; const I_EXI = ${u(iu.exIdx)};
${Object.entries(d.at).filter(([k]) => k !== 'total').map(([k, v]) => `const A_${k} = ${u(v)};`).join(' ')}
const SEPP = ${f(p.sepPropia)};
const ALCANCE = ${f(ALCANCE_MAXIMO)};
const ARISTA = ${f(p.aristaMedia)};
const MU_T = ${f(tela.friccionTela)};
```

y `${wgslPropio()}` después de `${wgslCuerpoCercano()}`.

3. En `residuo`, antes de `if (iu[I_FIJO + i] != 0u) { r = vec3<f32>(0.0); }`:

```wgsl
    if (PROPIO) {
      for (var s = u32(tf[O_OFFV + i]); s < u32(tf[O_OFFV + i + 1u]); s++) {
        let ent = u32(tf[O_ENT + s]);
        let o = O_PAR + 14u * (ent >> 2u);
        if (tf[o + 13u] < 0.5) { continue; }
        let wk = tf[o + 4u + (ent & 3u)];
        let nn = v3tf(o + 8u);
        let kt = tf[o + 12u];
        // en x = x_t el par empuja con kc·p0 y su fricción todavía no (sistema.ts, residuo)
        r += wk * KC * tf[o + 11u] * nn;
        B += wk * wk * ((KC - kt) * outer(nn, nn) + kt * I3);
      }
    }
```

4. En `spmv`, antes de `if (iu[I_FIJO + i] != 0u) { ap = vec3<f32>(0.0); }`:

```wgsl
    if (PROPIO) {
      for (var s = u32(tf[O_OFFV + i]); s < u32(tf[O_OFFV + i + 1u]); s++) {
        let ent = u32(tf[O_ENT + s]);
        let o = O_PAR + 14u * (ent >> 2u);
        if (tf[o + 13u] < 0.5) { continue; }
        var qv = vec3<f32>(0.0);
        for (var j = 0u; j < 4u; j++) {
          let v = tf[o + j];
          if (v >= 0.0) { qv += tf[o + 4u + j] * pv[u32(v)].xyz; }
        }
        let nn = v3tf(o + 8u);
        let qn = dot(nn, qv);
        ap += tf[o + 4u + (ent & 3u)] * (KC * qn * nn + tf[o + 12u] * (qv - qn * nn));
      }
    }
```

5. En `armarRonda2`, después de sumar `R_PA`: `if (PROPIO) { for (var k = 0u; k < GP; k++) { s += red[R_PE + k]; } }`. En `decidir`, después de la suma de `R_PD`: `if (PROPIO) { for (var k = 0u; k < GP; k++) { dg += red[R_PE + k]; } }`.
6. `ENTRADAS` suma, en su orden: después de `'ensamblar'`, `'velMax', 'armarRadio', 'limpiarCeldas', 'hashContar', 'scanCBloques', 'scanCTotales', 'scanCSumar', 'hashLlenar', 'paresDeTriangulo', 'limpiarVertices', 'contarEntradas', 'scanVBloques', 'scanVTotales', 'scanVSumar', 'llenarEntradas'`; después de `'anticipar'`, `'anticiparPares'`; después de `'difCostura'`, `'difPares'`.

En `motorGpu.ts`:
- `Bufer` y `BUFERES` suman `'at'`, al final y con tipo `'storage'`. `crear(device, s, cuadrosDeHistoria = 3600, maxPares?: number)` llama a `empaquetar(s, { maxPares })` y crea `at` con `new Uint32Array(d.at.total)`.
- En `grabarCuadro`, después de `ensamblar`, si `p.propio`: `velMax` (gv), `armarRadio` (1), `limpiarCeldas` (gcel), `hashContar` (gpnt), `scanCBloques` (gcel), `scanCTotales` (1), `scanCSumar` (gcel), `hashLlenar` (gpnt), `paresDeTriangulo` (gt), `limpiarVertices` (gv), `contarEntradas` (gp), `scanVBloques` (gv), `scanVTotales` (1), `scanVSumar` (gv), `llenarEntradas` (gp).
- La segunda ronda se arma si `aj.anticipar && (this.s.obstaculos.length > 0 || p.propio)`, igual que la CPU, que anticipa también los pares. Después de `anticipar` despacha `anticiparPares` (gp), si `p.propio`. En cada intento de la búsqueda, `difPares` (gp) va después de `difCostura`.
- `EstadoGpu` suma `pares: number` y `desbordes: number`. `leerEstado` los lee de `at` (`new Uint32Array(await this.leer('at', 4 * this.d.at.NPAR, 8))`). `desbordes` cuenta desde que se creó el motor: el que pasó alguna vez sigue a la vista.

- [ ] **Step 6: Corre las pruebas**

Run: `npx vitest run src/utils/cloth/implicito/gpu && npx tsc -b --noEmit`
Expected: PASS.

Run: `VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts`
Expected: PASS. Todas las escenas de paridad a menos de 0,1 mm, ahora con contacto propio en las dos; `capas` con pares; el desborde contado; la velocidad de la escena grande anotada en el registro, con contacto propio, frente a la de la Tarea 4.

- [ ] **Step 7: Gate y commit**

Run: `npx vitest run src/utils/cloth && npm run lint`

```bash
git add src/utils/cloth/implicito/gpu/wgslPropio.ts src/utils/cloth/implicito/gpu/empaquetar.ts src/utils/cloth/implicito/gpu/wgsl.ts src/utils/cloth/implicito/gpu/motorGpu.ts src/utils/cloth/implicito/banco/escenas.ts src/components/testScenes/TelaImplicitaHarness.tsx src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts src/utils/cloth/implicito/gpu/__tests__/wgsl.test.ts tests/e2e/tela-implicita.spec.ts
git commit -m "feat(tela): la tela contra sí misma en la GPU

Una rejilla de puntos por hash espacial (las atómicas solo cuentan y
reparten) y cada triángulo recorre las celdas de su caja agrandada por el
radio: el vértice que cae sobre su cara forma par, como en la CPU. Cada
vértice tiene, rearmada en cada cuadro, la lista de sus entradas en los
pares, que recorren el residuo, el producto matriz-vector y el bloque
diagonal; la anticipación y la búsqueda en línea recorren los pares. Los
pares que no caben se cuentan en el estado sin escribir fuera del búfer."
```

---

### Tarea 8: Las puntas del cuerpo contra la tela, en la GPU

Los vértices del cuerpo entran a la rejilla detrás de los de la tela, con su pseudonormal. Un triángulo de tela forma par con un vértice del cuerpo si este cae sobre su cara, a menos del radio, y además atravesó la tela por la cara (s < 0) o la sostenía el cuadro anterior (s < sep), como en la CPU (R13). La memoria de quién sostenía va en dos arreglos que se alternan por la paridad del cuadro.

**Files:**
- Modify: `empaquetar.ts` (los vértices del cuerpo y sus normales; `np`), `wgsl.ts` (zonas, constantes), `wgslPropio.ts` (`parDePunta`, `limpiarPuntas`, la rama de `paresDeTriangulo`), `motorGpu.ts`
- Modify: `escenas.ts` (`escenaPunta`), el harness
- Test: `empaquetar.test.ts`, `tests/e2e/tela-implicita.spec.ts`

**Interfaces:**
- Consumes: `CuerpoRigido.vertices` y `.normales` (sin repetir).
- Produces: `PaqueteGpu.nvb`, `f32.cuVertices`, `f32.cuNormales`; `np = n + nvb`; `escenaPunta(): Escena`.

- [ ] **Step 1: La escena de la punta y su paridad**

En `escenas.ts`:

```ts
/** Una lámina de malla gruesa (20 mm), 2 mm sobre la punta de una pirámide y corrida para que la punta caiga en medio de un triángulo. */
export function escenaPunta(): Escena {
  const cuerpo = new CuerpoRigido(buildLinearBVH(piramideDeColision(0.3, 0.1)));
  const malla = mallaDeContorno(rectangulo(-60, -60, 60, 60), 20);
  malla.x = Float64Array.from(malla.x, (q, k) => (k % 3 === 0 ? q + 0.007 : k % 3 === 1 ? q + 0.102 : q + 0.003));
  return { malla, obstaculos: [{ tipo: 'cuerpo', cuerpo }] };
}
```

El harness suma `punta`. La spec suma `'punta'` a la lista de paridad y la prueba de paridad agrega `if (escena === 'punta') expect(r.estado?.pares).toBeGreaterThan(0);`.

En `empaquetar.test.ts`:

```ts
  it('con un cuerpo, la rejilla lleva también sus vértices', () => {
    const e = escenaPunta();
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos });
    const p = empaquetar(s), o = e.obstaculos[0];
    if (o.tipo !== 'cuerpo') throw new Error('la escena trae un cuerpo');
    expect(p.nvb).toBe(o.cuerpo.vertices.length / 3);
    expect(p.np).toBe(s.n + p.nvb);
    expect(Array.from(p.f32.cuNormales)).toEqual(Array.from(Float32Array.from(o.cuerpo.normales)));
  });
```

Run: `npx vitest run src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`
Expected: FAIL (`nvb` no existe).

- [ ] **Step 2: El paquete**

`PaqueteGpu` gana `nvb: number` y, en `f32`, `cuVertices` y `cuNormales` (de `CuerpoRigido.vertices` y `.normales`, en `Float32Array`). `np = n + nvb` (antes de calcular `nceldas`). En `distribuir`: `CUV: 3 * p.nvb`, más `CUVN: 3 * p.nvb` y `SOST: 2 * p.nvb` en `ZonaTf`, y el grupo `gvb = Math.ceil(p.nvb / WG)`. `motorGpu.crear` sube las dos con `tf.set`.

Run: `npx vitest run src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`
Expected: PASS.

- [ ] **Step 3: Las puntas en el WGSL**

En `wgslPropio.ts`, `wgslPropio()` pone, en lugar del comentario de la Tarea 7 (siempre: con `NVB = 0` no hacen nada, y el motor crea una tubería por cada entrada):

```wgsl
// 1 = ese vértice del cuerpo sostenía la tela: el arreglo de este cuadro y el del anterior se alternan por paridad
fn sostiene(b: u32, este: bool) -> u32 {
  let par = u32(red[R_SC + E_CUADRO]) & 1u;
  let cual = select(1u - par, par, este);
  return O_SOST + cual * NVB + b;
}

@compute @workgroup_size(WG) fn limpiarPuntas(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= NVB) { return; }
  tf[sostiene(g.x, true)] = 0.0;
}

// un vértice del cuerpo contra la cara (ia, ib, ic): la atravesó por la cara o la sostenía el cuadro anterior (R13)
fn parDePunta(b: u32, ia: u32, ib: u32, ic: u32, a: vec3<f32>, bb: vec3<f32>, c: vec3<f32>, y: vec3<f32>, r: f32, libres: bool) {
  if (!libres) { return; }
  let e = puntoMasCercano(y, a, bb, c);
  if (e.rasgo != 0u || length(y - e.q) >= r) { return; }
  let nn = v3tf(O_CUVN + 3u * b);
  let s0 = dot(nn, e.q - y);
  if (!(s0 < 0.0 || (tf[sostiene(b, false)] > 0.5 && s0 < SEP))) { return; }
  tf[sostiene(b, true)] = 1.0;
  let p0 = SEP - s0;
  let vr = e.w.x * ld(O_V, ia) + e.w.y * ld(O_V, ib) + e.w.z * ld(O_V, ic);
  // tela contra cuerpo: la fricción del cuerpo (§4.3.1)
  let kt = rigidez(MU_C, KC * p0, tangencial(vr, nn));
  guardarPar(vec4<f32>(f32(ia), f32(ib), f32(ic), -1.0), vec4<f32>(e.w, 0.0), nn, p0, kt);
}
```

y en `paresDeTriangulo` (que ya trae `libres`) la llamada pasa a:

```wgsl
          if (p < N) { parDeVertice(p, ia, ib, ic, a, b, c, q, r); }
          else { parDePunta(p - N, ia, ib, ic, a, b, c, q, r, libres); }
```

En `wgsl.ts`: `const NVB = ${u(p.nvb)};` y `ENTRADAS` suma `'limpiarPuntas'` antes de `'paresDeTriangulo'`. En `motorGpu.ts`, `limpiarPuntas` (gvb) se despacha antes de `paresDeTriangulo` si `p.nvb > 0`. Como `E_CUADRO` cambia en `cerrarCuadro`, dentro de un cuadro la paridad es una sola.

- [ ] **Step 4: Corre las pruebas**

Run: `npx vitest run src/utils/cloth/implicito/gpu && npx tsc -b --noEmit`
Expected: PASS.

Run: `VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts`
Expected: PASS: `punta` a menos de 0,1 mm y con pares; las demás escenas siguen igual.

- [ ] **Step 5: Gate y commit**

Run: `npx vitest run src/utils/cloth && npm run lint`

```bash
git add src/utils/cloth/implicito/gpu/wgslPropio.ts src/utils/cloth/implicito/gpu/empaquetar.ts src/utils/cloth/implicito/gpu/wgsl.ts src/utils/cloth/implicito/gpu/motorGpu.ts src/utils/cloth/implicito/banco/escenas.ts src/components/testScenes/TelaImplicitaHarness.tsx src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts tests/e2e/tela-implicita.spec.ts
git commit -m "feat(tela): las puntas del cuerpo contra la tela, en la GPU

Los vértices del cuerpo entran a la rejilla detrás de los de la tela. Un
triángulo forma par con el que cae sobre su cara, si lo atravesó o lo
sostenía el cuadro anterior, con la separación y la fricción del cuerpo, como
en la CPU. La memoria de quién sostenía se alterna por la paridad del cuadro."
```

---
## La camiseta en la GPU

### Tarea 9: La camiseta en la GPU, contra la referencia

El harness arma la camiseta con los mismos pasos que el banco (`camisetaContraLaReferencia`), con los archivos que le sirve la prueba desde la carpeta privada. La corre en la GPU hasta que queda quieta o pasan 10 s de tela, y la mide con `medirCamiseta`. Mide aparte la velocidad con 20 y 50 iteraciones y la paridad de 3 cuadros contra la CPU. El informe va a `$VINA_REFERENCIAS/informes/`; la prueba verifica §2 sobre él. Sin `VINA_REFERENCIAS`, la prueba se salta: CI no tiene la carpeta privada ni GPU.

**Files:**
- Modify: `src/components/testScenes/TelaImplicitaHarness.tsx` (la escena `camiseta` y el modo `camiseta`)
- Modify: `tests/e2e/tela-implicita.spec.ts` (la camiseta, @gpu-local)

**Interfaces:**
- Consumes: `camisetaContraLaReferencia`, `medirCamiseta`, `ConfigCamiseta`, `MedidasDeCamiseta` (Tarea 3); `telaDeLaReferencia`, `leerReferencias`, `guardarInforme` (`bench/_banco.ts`); `PANDEO_CALIBRADO`.
- Produces: en el harness, `escena=camiseta&malla=<mm>` y `modo=camiseta` (quietud, velocidad media y medidas); `Resultado.medidas?: MedidasDeCamiseta`.

- [ ] **Step 1: La prueba de la camiseta**

En `tests/e2e/tela-implicita.spec.ts` (imports: `fs` de `node:fs`, `path` de `node:path`, `guardarInforme, leerReferencias, telaDeLaReferencia` de `../../bench/_banco`, `PANDEO_CALIBRADO` de `../../src/utils/cloth/implicito/tela`, `type MedidasDeCamiseta` de `../../src/utils/cloth/implicito/banco/camiseta`; `ResultadoTela` suma `medidas?: MedidasDeCamiseta`):

```ts
const REFERENCIAS = process.env.VINA_REFERENCIAS;

test.describe('La camiseta de María en la GPU, contra la referencia @gpu-local', () => {
  test.skip(!REFERENCIAS, 'necesita VINA_REFERENCIAS, la carpeta privada de la referencia');
  test.setTimeout(3_600_000);

  test.beforeEach(async ({ page }) => {
    const dir = REFERENCIAS!;
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'camiseta.json'), 'utf8')) as { colocacion: string; cuerpo: string; asentada: Record<string, string> };
    const archivos: Record<string, () => string | Buffer> = {
      'camiseta.json': () => JSON.stringify(config),
      'tela.json': () => JSON.stringify(telaDeLaReferencia(leerReferencias(), PANDEO_CALIBRADO)),
      'maria.dxf': () => fs.readFileSync('tests/fixtures/garments/maria_patrones_samuel_2M.dxf'),
      'colocacion.obj': () => fs.readFileSync(path.join(dir, config.colocacion)),
      'cuerpo.obj': () => fs.readFileSync(path.join(dir, config.cuerpo)),
    };
    for (const [malla, ruta] of Object.entries(config.asentada)) archivos[`asentada-${malla}.obj`] = () => fs.readFileSync(path.join(dir, ruta));
    await page.route('**/__banco__/**', (route) => {
      const leer = archivos[new URL(route.request().url()).pathname.split('/').pop() ?? ''];
      return leer ? route.fulfill({ status: 200, body: leer() }) : route.fulfill({ status: 404, body: '' });
    });
  });

  test('a 5 mm queda quieta sola, con las costuras cerradas, nada aplastado y a 17 ms por cuadro (§2)', async ({ page }) => {
    const espera = 880_000;
    const camiseta = await correr(page, 'modo=camiseta&escena=camiseta&malla=5&cg=50', espera);
    const velocidad20 = await correr(page, 'modo=velocidad&escena=camiseta&malla=5&cg=20&cuadros=60', espera);
    const velocidad50 = await correr(page, 'modo=velocidad&escena=camiseta&malla=5&cg=50&cuadros=60', espera);
    const paridad = await correr(page, 'modo=paridad&escena=camiseta&malla=5&cg=50&cuadros=3', espera);
    console.log(`[camiseta] informe: ${guardarInforme('camiseta-gpu', { camiseta, velocidad20, velocidad50, paridad })}`);
    const m = camiseta.medidas!;
    expect(camiseta.estado?.desbordes).toBe(0);
    expect(m.aplastados).toBeLessThan(0.1);
    expect(m.costuras.mediana).toBeLessThan(5e-5);
    expect(m.costuras.maxima).toBeLessThanOrEqual(1e-3);
    expect(camiseta.segundosHastaQuieta).not.toBeNull();
    expect(camiseta.segundosHastaQuieta!).toBeLessThanOrEqual(10);
    expect(velocidad50.msPorCuadro!).toBeLessThanOrEqual(17);
  });
});
```

La prueba guarda el informe antes de verificar: si algo no pasa, las medidas quedan igual en la carpeta privada. Armar la camiseta y medirla en el navegador toma más que las escenas chicas: `correr` recibe el tiempo de espera como tercer argumento (280 s por defecto) y las cuatro llamadas de la camiseta pasan 880 s.

- [ ] **Step 2: Mírala fallar**

Run: `VINA_REFERENCIAS=/d/Desktop/work/vina-referencias VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g camiseta`
Expected: FAIL: el harness no conoce la escena `camiseta`.

- [ ] **Step 3: La camiseta en el harness**

En `TelaImplicitaHarness.tsx` (imports: `camisetaContraLaReferencia, medirCamiseta, type CamisetaContraLaReferencia, type ConfigCamiseta, type MedidasDeCamiseta` de `../../utils/cloth/implicito/banco/camiseta`; `type TelaFisica` de `../../utils/cloth/implicito/tela`):

```ts
/** Lo que sirve tela-implicita.spec.ts desde la carpeta privada; sin ella, la escena no se arma. */
async function delBanco(nombre: string, opcional = false): Promise<string | undefined> {
  const r = await fetch(`/__banco__/${nombre}`);
  if (r.ok) return r.text();
  if (opcional) return undefined;
  throw new Error(`falta ${nombre}: lo sirve tela-implicita.spec.ts desde VINA_REFERENCIAS`);
}

/** La camiseta de la última escena `camiseta`, para medirla al terminar. */
let camisetaEnCurso: CamisetaContraLaReferencia | null = null;
/** La tela de la referencia, si la escena es la camiseta; si no, la de laboratorio. */
let telaEnCurso: TelaFisica = TELA_DE_LABORATORIO;

async function escenaCamiseta(malla: number): Promise<Escena> {
  const [config, tela, dxf, colocacion, cuerpo, asentada] = await Promise.all([
    delBanco('camiseta.json'), delBanco('tela.json'), delBanco('maria.dxf'), delBanco('colocacion.obj'), delBanco('cuerpo.obj'), delBanco(`asentada-${malla}.obj`, true),
  ]);
  telaEnCurso = JSON.parse(tela!) as TelaFisica;
  camisetaEnCurso = camisetaContraLaReferencia(
    { dxf: dxf!, config: JSON.parse(config!) as ConfigCamiseta, colocacion: colocacion!, cuerpo: cuerpo!, asentada },
    malla,
    telaEnCurso,
  );
  return camisetaEnCurso.escena;
}
```

`ESCENAS` suma `camiseta: () => escenaCamiseta(Number(new URLSearchParams(window.location.search).get('malla') ?? 5))`. En `nuevo()`, la tela pasa de `TELA_DE_LABORATORIO` a `telaEnCurso`. `Resultado` suma `medidas?: MedidasDeCamiseta`. Y el modo nuevo, antes del de quietud:

```ts
    if (modo === 'camiseta') {
      if (!camisetaEnCurso) throw new Error('el modo camiseta va con escena=camiseta');
      // hasta quieta o 10 s de tela, de a un segundo; el primer cuadro cuenta para la quietud y no para el tiempo,
      // porque su envío espera a que se compilen las tuberías
      const vigia = new VigiaDeQuietud();
      let quieta: number | null = null, ms = 0, hechos = 1;
      await motor.avanzar(1);
      if (vigia.registrar((await motor.leerQuietud(0, 1))[0])) quieta = 1 / 60;
      while (hechos < 600 && quieta === null) {
        const t0 = performance.now();
        await motor.avanzar(60);
        ms += performance.now() - t0;
        const historia = await motor.leerQuietud(hechos, 60);
        for (let c = 0; c < 60 && quieta === null; c++) if (vigia.registrar(historia[c])) quieta = (hechos + c + 1) / 60;
        hechos += 60;
      }
      const cuadros = hechos - 1;
      const x = await motor.leerPosiciones();
      return { ...base, segundosHastaQuieta: quieta, msPorCuadro: ms / cuadros, medidas: medirCamiseta(x, camisetaEnCurso), estado: await motor.leerEstado() };
    }
```

El encabezado del harness suma `camiseta` (con `malla`) a las escenas y `camiseta` a los modos.

- [ ] **Step 4: Corre la camiseta**

Run: `VINA_REFERENCIAS=/d/Desktop/work/vina-referencias VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g camiseta`
Expected: el informe en `$VINA_REFERENCIAS/informes/…-camiseta-gpu.json`. La prueba pasa si la camiseta cumple §2. Si algo de §2 no pasa, el resultado se anota igual y se sigue la regla de la Coordinación:
- Lo que la CPU (Tarea 3) sí cumple y la GPU no es un error de la GPU: la paridad de 3 cuadros de la camiseta dice dónde mirar, porque los vértices más lejanos ubican la pieza de física.
- Lo que tampoco cumple la CPU ya estaba en la decisión de la Tarea 3.
- Si solo falla la velocidad, es un resultado y no un error: el informe lo dice con sus ms por cuadro con 20 y 50 iteraciones. Nada de la física cambia por eso (§3, subproyecto 1).

- [ ] **Step 5: La CPU a 5 mm, como contraste**

Run: `VINA_REFERENCIAS=/d/Desktop/work/vina-referencias npm run bench:tela -- --ensayo=camiseta --mallas=5`
Expected: unos 15-20 min con el candado. Compara en el registro sus medidas con las de la GPU: aplastados, costuras, quietud, distancia al cuerpo y a la asentada de la referencia. No tienen que dar lo mismo cuadro a cuadro tras cientos de cuadros, pero la forma asentada sí debe parecerse: distancia mediana entre las dos de pocos mm.

- [ ] **Step 6: Gate y commit**

Run: `npx tsc -b --noEmit && npx vitest run src/utils/cloth && npm run lint`

```bash
git add src/components/testScenes/TelaImplicitaHarness.tsx tests/e2e/tela-implicita.spec.ts
git commit -m "test(tela): la camiseta de María en la GPU, contra la referencia privada

El harness arma la camiseta con los pasos del banco, con los archivos que le
sirve la prueba desde la carpeta privada, la corre en la GPU hasta quieta o
10 s de tela y la mide igual que la CPU. La prueba guarda el informe con la
quietud, la velocidad con 20 y 50 iteraciones y la paridad de 3 cuadros, y
verifica §2. Sin la carpeta privada se salta."
```

---

## Cierre

### Tarea 10: Cierre de la parte 2 (el controlador)

- [ ] **Step 1: Los gates enteros**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: PASS. Si `lint:ui` dice que bajó un contador (el R3 venía bajando a 496), fija el techo con `node scripts/ui-contract-lint.mjs --update` y commitea `scripts/ui-contract-baseline.json` solo: `chore(ui): el techo de colores literales baja a 496`.

Run: `VINA_REFERENCIAS=/d/Desktop/work/vina-referencias VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts`
Expected: PASS entera, la camiseta incluida, o con su resultado anotado según la Tarea 9.

- [ ] **Step 2: El ensayo del deploy**

Run (en segundo plano, con el candado): `bash scripts/deploy-prod.sh --ensayo`
Expected: EXIT=0 (unitarias, home y e2e). La rama no toca la app fuera del harness de desarrollo y del banco, pero mergear exige este gate.

- [ ] **Step 3: La revisión de la rama entera**

La rama trae la parte 1 y la parte 2, y la revisión independiente de la parte 1 sigue pendiente. Arma el paquete de toda la rama contra main (`scripts/review-package` de la skill, desde la base del merge con main) y despacha un revisor con el modelo más capaz, con el spec y los dos planes. Si el modo automático niega el despacho, no lo reintentes: avísale a Samuel en el informe que la revisión quedó pendiente y cómo habilitarla.

- [ ] **Step 4: Las enmiendas en el spec**

Al final de `docs/superpowers/specs/2026-10-13-tela-nueva-design.md`, una sección «## 7. Enmiendas de la entrega 4». Una línea por enmienda (E1-E6), con lo decidido y el plan que la trae. Así el spec vuelve a ser la autoridad completa:

- E1: cada vértice se cose a un punto del otro lado.
- E2: la flexión cruza la costura con una bisagra por arista cosida, encendida al cerrar.
- E3: contacto propio solo vértice-triángulo.
- E4: el contacto es un plano fijado al empezar el paso, con fricción.
- E5: la camiseta se compara sobre el avatar y desde la colocación inicial de la referencia.
- E6: un par de la tela entra solo sobre la cara.

Commit: `docs(spec): las enmiendas de la entrega 4 de la tela nueva`.

- [ ] **Step 5: Subir y abrir el PR**

```bash
git push -u origin feat/tela-prenda-completa
gh pr create --base main --title "feat(tela): la prenda completa con el motor implícito, en la CPU y en la GPU" --body-file "$SCRATCH/pr-prenda-completa.md"
```

`$SCRATCH` es el scratchpad de la sesión: el cuerpo se escribe ahí con Write, no en el repo. Describe el cambio de las dos partes, sin nombres ni números de la referencia y sin atribución:
- qué hace el motor ahora (piezas con su hilo, costuras a un punto, flexión que cruza la costura, margen, cuerpo con BVH, planos con fricción, contacto propio sobre la cara; todo en la GPU con paridad);
- las enmiendas E1-E6;
- cómo se prueba: vitest, la paridad por escena @gpu-local y el banco privado;
- lo que queda para la parte 3.

Mergear espera la orden de Samuel.

- [ ] **Step 6: La memoria y el informe**

Actualiza `entrega-4-tela-nueva-estado-2026-10-14.md` (o una nueva con fecha si cambió el día): el PR, los resultados de la camiseta en la CPU y en la GPU, y lo que sigue (parte 3; el issue propuesto del mallador).

El informe para Samuel trae:
- qué quedó hecho y las medidas de la camiseta contra §2 y contra la referencia, en la CPU y en la GPU;
- la velocidad con 20 y 50 iteraciones;
- las decisiones que tomé por él (cada una con su costo si es un error);
- lo que espera su orden: el merge, el issue del mallador (las líneas internas que salen del contorno siembran vértices sueltos en los tres tiers de hoy) y la revisión si quedó pendiente.

Borra el espacio de trabajo de la skill cuando la revisión final quede limpia.
