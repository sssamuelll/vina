# La tela nueva en el laboratorio — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El motor de tela nuevo (Euler implícito con Newton y gradiente conjugado, con la tela en el patrón) funcionando en la CPU y en la GPU sobre los ensayos del banco, medido contra la referencia privada y contra el motor de hoy, sin tocar todavía la prenda ni la vista 3D.

**Architecture:** Módulos nuevos en `src/utils/cloth/implicito/`. La versión de referencia en CPU, en doble precisión, es la fuente de verdad. En `gpu/` está el mismo cuadro escrito en WGSL sobre un `GPUDevice` que recibe de afuera. El banco tiene dos partes: la pública son pruebas de vitest con física exacta; la privada son scripts de `bench/` que leen la carpeta `VINA_REFERENCIAS`. La GPU se prueba con una escena DEV (`?testScene=tela-implicita`) y un spec @gpu-local.

**Tech Stack:** TypeScript 5.6, vitest 4, WGSL (WebGPU con `@webgpu/types`), Playwright (config `playwright.webgpu.config.ts`), tsx, y el mallador CDT de Vina (`meshPieceOutline`).

**Spec:** `docs/superpowers/specs/2026-10-13-tela-nueva-design.md`. Este plan cubre las entregas 1, 2 y 3 de §4.6. Las entregas 4 y 5 (la prenda completa y el motor por defecto) van en otro plan, porque tocan la simulación de la prenda.

## Qué entra y qué no

- **Entra:** §4.1 menos la biblioteca (§4.1.7), §4.2 completo, §4.4 menos la camiseta de §4.4.2 y el aviso al otro agente, que ya se dio.
- **Va en el plan siguiente:** §4.1.7 (la biblioteca), §4.3 (cuerpo, contacto propio, costuras, margen y colocación), §4.5 (integración en `prepararTela` e interruptor `vina-motor-implicito`), la publicación de la quietud en la caja negra (`solverRuntimeTracker`, §4.2.4), las posiciones compartidas con la vista 3D (§4.2.2) y la camiseta en el banco. Los campos `friccionTela` y `friccionCuerpo` de §4.1.1 entran con el contacto con el cuerpo (§4.3.1), que es su único consumidor.
- **Va en las telas medidas (subproyecto 3):** `endurece`, la tracción por tramos de §4.1.1. Ninguna tela de estas entregas la usa, y el formato de una curva medida se decide junto con la medición.
- **Obstáculos de este plan:** solo los analíticos de los ensayos (el pedestal Cusick y un plano), con contacto normal. La fricción llega con el cuerpo.

## Global Constraints

- Unidades: SI dentro del motor. La tela se escribe en g/m², mm, N/m y µN·m (§4.1.1); `telaSI` convierte una sola vez.
- Reposo: el patrón plano girado al marco del hilo, con `v` a lo largo de la urdimbre. Sin línea de grano, el hilo va vertical en el patrón (§4.1.2). La colocación en 3D nunca es el reposo.
- Paso: `h = 1/60` s; Newton desde el estado actual; gradiente conjugado con bloques 3×3 de la diagonal; 20-50 iteraciones por ronda; una ronda más si se anticipan contactos; búsqueda en línea de hasta 8 mitades (§4.2.1).
- Sin amarres, sin congelado por reloj y sin topes de velocidad (§4.2.1).
- Separación entre la tela y un obstáculo: `grosor/2 + 1 mm` (§4.3.1).
- Quieta: `Σ m·|v| / Σ m·g·h < 0,1 %` durante 30 cuadros seguidos (§4.2.4).
- GPU: WGSL escrito a mano; matriz por bloques armada por recolección, sin atómicas, en franjas de 32 filas; todo el cuadro en un pase de cómputo (§4.2.2).
- GPU igual a CPU: menos de 0,1 mm de diferencia máxima tras 3 pasos en escenas chicas (§2).
- La referencia del simulador comercial no entra al repo. Vive en la carpeta privada `VINA_REFERENCIAS` y solo se lee al correr el banco. Su nombre, sus números y sus formas no van en código, commits, PR ni issues.
- Lo pesado corre siempre con `node scripts/pesado.mjs`, también el banco y los e2e de GPU. Nunca con `--sin-admision` ni `VINA_PESADO_OMITIR`.
- Gates antes de cada commit: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. El hook de pre-commit no se salta.
- Commits en español: describen el cambio y su porqué técnico, sin líneas de atribución.

## Review Focus

1. Malla con un triángulo sin área o con un vértice suelto (un patrón con puntos repetidos, una astilla del mallador): se espera un error que nombre el triángulo o el vértice, no NaN en la simulación. Lo prueba la Tarea 3.
2. Tela sin pandeo (`pandeo: Infinity`) o con compresión gratis (`pandeo: 0`): la ley, las fuerzas y el paquete de la GPU quedan finitos. Lo prueban las Tareas 4 y 10.
3. Un triángulo que la simulación aplasta hasta una línea o un punto: fuerzas y hessiana finitas, sin NaN. Lo prueba la Tarea 4.
4. Vértices empotrados: no se mueven ni un bit y no cuentan en la quietud. Lo prueba la Tarea 7.
5. Una escena del tamaño de la camiseta (unos 29 mil vértices) cabe en los límites por defecto de WebGPU: 128 MiB por búfer y 8 búferes de almacenamiento por etapa. Lo prueba la Tarea 11.

## Coordinación

- Hay otra sesión trabajando en Vina. Ninguna de las dos toca la rama de la otra ni empuja a main, y no se edita un archivo de una rama abierta hasta que esa rama entre a main.
- Este plan solo crea archivos nuevos y toca tres que nadie más tiene abiertos: `src/App.tsx` (una ruta DEV), `package.json` (dos scripts) y `bench/README.md` (una sección).
- `feat/camara-60fps` está en pausa por decisión de Samuel: optimiza el motor que este reemplaza.
- El candado de la máquina es `scripts/pesado.mjs`. El chat entre sesiones es para decidir, no para avisar «voy a correr».

## Antes de empezar

Trabaja en un worktree propio, con la rama creada desde `docs/tela-nueva`, que trae el spec y este plan:

```bash
cd /d/Desktop/projects/vina
git worktree add .claude/worktrees/tela-laboratorio -b feat/tela-nueva-laboratorio docs/tela-nueva
cd .claude/worktrees/tela-laboratorio
powershell -NoProfile -Command "New-Item -ItemType Junction -Path 'node_modules' -Target 'D:\Desktop\projects\vina\node_modules'"
npx tsc -b --noEmit && npm run test
```

La suite debe pasar entera antes de la Tarea 1. Todas las rutas del plan son relativas a la raíz de ese worktree.

## Mapa de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `src/utils/cloth/implicito/tela.ts` | la tela en sus unidades y en SI, y la separación de contacto | 1 (y 9) |
| `src/utils/cloth/implicito/malla.ts` | malla de un contorno con el mallador de Vina; patrón al marco del hilo | 1 |
| `src/utils/cloth/implicito/obstaculos.ts` | pedestal y plano: distancia con signo, normal y el más cercano | 1 |
| `src/utils/cloth/implicito/banco/escenas.ts` | disco Cusick, voladizo, lámina y la tela de laboratorio | 1 |
| `src/utils/cloth/implicito/banco/medidas.ts` | aplastados, caída Cusick, punta y ángulo de Peirce | 1 |
| `src/utils/cloth/implicito/banco/elastica.ts` | la elástica exacta del voladizo | 1 |
| `bench/_banco.ts`, `bench/telaNueva.ts` | el banco privado y el motor de hoy como punto de partida | 2 |
| `src/utils/cloth/implicito/reposo.ts` | Dm⁻¹, área y masas por triángulo | 3 |
| `src/utils/cloth/implicito/membrana.ts` | ley con pandeo; energía, gradiente, H·p y bloques de la membrana | 4 |
| `src/utils/cloth/implicito/placa.ts` | ángulo entre caras y flexión de placa por triángulo | 5 |
| `src/utils/cloth/implicito/sistema.ts` | el sistema de un cuadro: estado, G, residuo, H·p, bloques y contactos | 6 |
| `src/utils/cloth/implicito/paso.ts` | el paso: Newton, gradiente conjugado, anticipación y búsqueda en línea | 7 |
| `src/utils/cloth/implicito/quietud.ts` | el medidor de quietud y su vigía | 7 |
| `bench/motorImplicito.ts`, `bench/calibrarPandeo.ts` | el motor nuevo en el banco y la calibración del pandeo | 9 |
| `src/utils/cloth/implicito/gpu/empaquetar.ts` | arreglos planos para la GPU: aportes, bloques y franjas de 32 | 10 |
| `src/utils/cloth/implicito/gpu/wgsl.ts` | la memoria de la GPU y el WGSL del motor | 11 |
| `src/utils/cloth/implicito/gpu/motorGpu.ts` | búferes, tuberías y el cuadro en un pase | 12 |
| `src/components/testScenes/TelaImplicitaHarness.tsx` | escena DEV de la GPU: paridad, velocidad y quietud | 12 |
| `tests/e2e/tela-implicita.spec.ts` | el banco de la GPU, @gpu-local | 12 |

Las pruebas de física exacta viven en `src/utils/cloth/implicito/__tests__/` y en `src/utils/cloth/implicito/gpu/__tests__/`.

---
## Entrega 1 — El banco

### Tarea 1: Las piezas del banco (tela, malla, obstáculos, escenas, medidas y elástica)

Nada de esto depende del motor: el banco corre las mismas escenas con el motor de hoy (Tarea 2) y con el nuevo (Tarea 9).

**Files:**
- Create: `src/utils/cloth/implicito/tela.ts`
- Create: `src/utils/cloth/implicito/malla.ts`
- Create: `src/utils/cloth/implicito/obstaculos.ts`
- Create: `src/utils/cloth/implicito/banco/escenas.ts`
- Create: `src/utils/cloth/implicito/banco/medidas.ts`
- Create: `src/utils/cloth/implicito/banco/elastica.ts`
- Test: `src/utils/cloth/implicito/__tests__/banco.test.ts`
- Test: `src/utils/cloth/implicito/__tests__/obstaculos.test.ts`

**Interfaces:**
- Consumes: `meshPieceOutline(outline: Point2D[], internals: { path: PathCommand[] }[], config: Required<MeshConfig>): ClothMeshData` (`src/utils/mesh/cdtMesher.ts`); `extractOrderedBoundaryLoop`, `computeDrapeCoefficient`, `countFolds` (`src/utils/cloth/cusickMetric.ts`).
- Produces:
  - `tela.ts`: `interface TelaFisica { gramaje; grosor; kTrama; kUrdimbre; kCizalla; pandeo; bTrama; bUrdimbre; bBies }` (todos `number`), `interface TelaSI { densidad; grosor; kTrama; kUrdimbre; kCizalla; pandeo; bTrama; bUrdimbre; bBies }`, `telaSI(t: TelaFisica): TelaSI`, `separacion(t: TelaSI): number`.
  - `malla.ts`: `interface MallaDeTela { x: Float64Array; patron: Float64Array; tris: Uint32Array; fijos?: Uint8Array }`, `mallaDeContorno(contornoMm: Array<[number, number]>, aristaMm: number, altura?: number, lineasMm?: Array<Array<[number, number]>>): MallaDeTela`, `aMarcoDelHilo(patron: Float64Array, hilo?: readonly [number, number]): Float64Array`.
  - `obstaculos.ts`: `type Obstaculo = { tipo: 'pedestal'; radio: number; tapa: number } | { tipo: 'plano'; altura: number }`, `interface Distancia { d; nx; ny; nz }`, `distancia(o, x, y, z): Distancia`, `masCercano(obs, x, y, z): (Distancia & { k: number }) | null`.
  - `banco/escenas.ts`: `TELA_DE_LABORATORIO: TelaFisica`, `CUSICK`, `interface Escena { malla: MallaDeTela; obstaculos: Obstaculo[]; hilo?: readonly [number, number] }`, `circulo(radioMm, lados)`, `rectangulo(x0, y0, x1, y1)`, `escenaCusick(aristaMm, radioMm?): Escena`, `escenaVoladizo(voladoMm, hilo: 'urdimbre' | 'trama', aristaMm): Escena`, `laminaPlana(aristaMm): MallaDeTela`.
  - `banco/medidas.ts`: `aplastados(x: ArrayLike<number>, malla: MallaDeTela): number` (%), `caidaCusick(x, malla): { coeficiente: number; ondas: number }`, `puntaDelVoladizo(x, malla, voladoM): { x: number; y: number }`, `peirce(punta, voladoM, alturaDelBorde?): { angulo: number; longitudDeFlexion: number }`.
  - `banco/elastica.ts`: `elasticaExacta(B: number, w: number, L: number, pasos?: number): { x: number; y: number }`.

- [ ] **Step 1: Escribe las pruebas que fallan**

`src/utils/cloth/implicito/__tests__/obstaculos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { distancia, masCercano, type Obstaculo } from '../obstaculos';

const PEDESTAL: Obstaculo = { tipo: 'pedestal', radio: 0.09, tapa: 0.5 };

describe('obstáculos de los ensayos', () => {
  it('el plano: la distancia es la altura sobre él y la normal va hacia arriba', () => {
    const c = distancia({ tipo: 'plano', altura: 0.1 }, 3, 0.25, -2);
    expect(c.d).toBeCloseTo(0.15, 12);
    expect([c.nx, c.ny, c.nz]).toEqual([0, 1, 0]);
  });

  it('el pedestal: tapa, costado, canto y adentro', () => {
    const casos: Array<[[number, number, number], number, [number, number, number]]> = [
      [[0.03, 0.52, 0.04], 0.02, [0, 1, 0]], // sobre la tapa
      [[0.12, 0.4, 0], 0.03, [1, 0, 0]], // al costado
      [[0, 0.53, 0.13], 0.05, [0, 0.6, 0.8]], // junto al canto
      [[0.08, 0.495, 0], -0.005, [0, 1, 0]], // adentro, más cerca de la tapa
      [[0.088, 0.45, 0], -0.002, [1, 0, 0]], // adentro, más cerca del costado
    ];
    for (const [[x, y, z], d, n] of casos) {
      const c = distancia(PEDESTAL, x, y, z);
      expect(c.d).toBeCloseTo(d, 12);
      expect(c.nx).toBeCloseTo(n[0], 12);
      expect(c.ny).toBeCloseTo(n[1], 12);
      expect(c.nz).toBeCloseTo(n[2], 12);
    }
  });

  it('la normal es el gradiente de la distancia (diferencias finitas)', () => {
    const puntos: Array<[number, number, number]> = [
      [0.03, 0.52, 0.04], [0.12, 0.4, -0.05], [0.07, 0.56, 0.1], [0.05, 0.49, 0.02], [0, 0.3, 0.0895],
    ];
    const h = 1e-7;
    const d = (x: number, y: number, z: number) => distancia(PEDESTAL, x, y, z).d;
    for (const [x, y, z] of puntos) {
      const c = distancia(PEDESTAL, x, y, z);
      expect((d(x + h, y, z) - d(x - h, y, z)) / (2 * h)).toBeCloseTo(c.nx, 5);
      expect((d(x, y + h, z) - d(x, y - h, z)) / (2 * h)).toBeCloseTo(c.ny, 5);
      expect((d(x, y, z + h) - d(x, y, z - h)) / (2 * h)).toBeCloseTo(c.nz, 5);
    }
  });

  it('gana el más cercano, con su índice; sin obstáculos no hay ninguno', () => {
    const obs: Obstaculo[] = [{ tipo: 'plano', altura: 0.45 }, PEDESTAL];
    expect(masCercano(obs, 0.2, 0.46, 0)?.k).toBe(0);
    expect(masCercano(obs, 0.1, 0.6, 0)?.k).toBe(1);
    expect(masCercano([], 0, 0, 0)).toBeNull();
  });
});
```

`src/utils/cloth/implicito/__tests__/banco.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aMarcoDelHilo } from '../malla';
import { separacion, telaSI } from '../tela';
import { CUSICK, escenaCusick, escenaVoladizo, laminaPlana } from '../banco/escenas';
import { aplastados, caidaCusick, peirce, puntaDelVoladizo } from '../banco/medidas';
import { elasticaExacta } from '../banco/elastica';

describe('el banco: escenas y medidas', () => {
  it('la tela pasa a SI: g/m² a kg/m², mm a m y µN·m a N·m', () => {
    const t = telaSI({ gramaje: 200, grosor: 0.5, kTrama: 300, kUrdimbre: 600, kCizalla: 50, pandeo: 1, bTrama: 2, bUrdimbre: 5, bBies: 3 });
    expect(t.densidad).toBeCloseTo(0.2, 12);
    expect(t.grosor).toBeCloseTo(0.0005, 12);
    expect(t.bUrdimbre).toBeCloseTo(5e-6, 15);
    expect(separacion(t)).toBeCloseTo(0.00125, 12);
  });

  it('el marco del hilo deja la urdimbre en v', () => {
    const uv = aMarcoDelHilo(Float64Array.from([0.01, 0.02]), [1, 0]);
    expect(uv[0]).toBeCloseTo(-0.02, 12);
    expect(uv[1]).toBeCloseTo(0.01, 12);
    const vertical = aMarcoDelHilo(Float64Array.from([0.01, 0.02]));
    expect(Array.from(vertical)).toEqual([0.01, 0.02]);
  });

  it('el voladizo empotra justo los vértices con x ≤ 0 y tiene vértices sobre el borde', () => {
    const e = escenaVoladizo(15, 'urdimbre', 2.5);
    const { x, fijos } = e.malla;
    let enBorde = 0;
    for (let i = 0; i < x.length / 3; i++) {
      expect(fijos?.[i]).toBe(x[3 * i] <= 1e-6 ? 1 : 0);
      if (Math.abs(x[3 * i]) < 1e-6 && Math.abs(x[3 * i + 2]) < 0.0124) enBorde++;
    }
    expect(enBorde).toBeGreaterThan(5);
    expect(e.hilo).toEqual([1, 0]);
    expect(escenaVoladizo(15, 'trama', 5).hilo).toEqual([0, 1]);
  });

  it('un disco plano que no cayó: coeficiente 100, sin ondas ni aplastados', () => {
    const e = escenaCusick(10);
    const { coeficiente, ondas } = caidaCusick(e.malla.x, e.malla);
    expect(coeficiente).toBeGreaterThan(99);
    expect(coeficiente).toBeLessThanOrEqual(100.0001);
    expect(ondas).toBe(0);
    expect(aplastados(e.malla.x, e.malla)).toBe(0);
    expect(e.malla.x[1]).toBe(CUSICK.alturaInicial);
    expect(e.obstaculos).toEqual([{ tipo: 'pedestal', radio: CUSICK.radioPedestal, tapa: CUSICK.tapa }]);
  });

  it('aplastados cuenta los triángulos con menos de la mitad de su área', () => {
    const m = laminaPlana(20);
    const x = Float64Array.from(m.x);
    for (let i = 0; i < x.length / 3; i++) x[3 * i] = m.x[3 * i] * 0.4;
    expect(aplastados(x, m)).toBe(100);
    for (let i = 0; i < x.length / 3; i++) x[3 * i] = m.x[3 * i] * 0.6;
    expect(aplastados(x, m)).toBe(0);
  });

  it('la elástica exacta es la viga lineal cuando la caída es chica (δ = wL⁴/8B)', () => {
    const B = 1e-3, w = 1, L = 0.05;
    const lineal = (w * L ** 4) / (8 * B);
    expect(Math.abs(-elasticaExacta(B, w, L).y - lineal) / lineal).toBeLessThan(0.01);
  });

  it('Peirce: ángulo de la cuerda y longitud de flexión', () => {
    const th = Math.PI / 6, L = 0.1;
    const r = peirce({ x: L * Math.cos(th), y: -L * Math.sin(th) }, L);
    expect(r.angulo).toBeCloseTo(30, 9);
    expect(r.longitudDeFlexion).toBeCloseTo(L * Math.cbrt(Math.cos(th / 2) / (8 * Math.tan(th))), 12);
  });

  it('la punta del voladizo es el promedio de su borde libre', () => {
    const e = escenaVoladizo(15, 'trama', 5);
    const p = puntaDelVoladizo(e.malla.x, e.malla, 0.015);
    expect(p.x).toBeCloseTo(0.015, 6);
    expect(p.y).toBeCloseTo(0, 12);
  });
});
```

- [ ] **Step 2: Corre las pruebas y mira que fallan**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/banco.test.ts src/utils/cloth/implicito/__tests__/obstaculos.test.ts`
Expected: FAIL, porque no existen los módulos (`Failed to resolve import "../obstaculos"`).

- [ ] **Step 3: Escribe los módulos**

`src/utils/cloth/implicito/tela.ts`:

```ts
/**
 * La tela del motor implícito (spec docs/superpowers/specs/2026-10-13-tela-nueva-design.md §4.1.1), en
 * las unidades en que se mide una tela. El motor trabaja en SI: `telaSI` convierte una sola vez.
 *
 * Convención: la urdimbre corre a lo largo del hilo (la línea de grano); «bTrama» es la rigidez cuando
 * la curvatura va a lo ancho, es decir, cuando el pliegue corre a lo largo del hilo.
 */
export interface TelaFisica {
  /** g/m² */
  gramaje: number;
  /** mm */
  grosor: number;
  /** N/m: tracción a lo ancho */
  kTrama: number;
  /** N/m: tracción a lo largo del hilo */
  kUrdimbre: number;
  /** N/m */
  kCizalla: number;
  /** factor de la carga de pandeo P = pandeo·π²·B/L² (§4.1.4); Infinity = resiste igual que al estirar */
  pandeo: number;
  /** µN·m */
  bTrama: number;
  /** µN·m */
  bUrdimbre: number;
  /** µN·m */
  bBies: number;
}

/** La misma tela en SI: kg/m², m, N/m y N·m. */
export interface TelaSI {
  densidad: number;
  grosor: number;
  kTrama: number;
  kUrdimbre: number;
  kCizalla: number;
  pandeo: number;
  bTrama: number;
  bUrdimbre: number;
  bBies: number;
}

export function telaSI(t: TelaFisica): TelaSI {
  return {
    densidad: t.gramaje / 1000,
    grosor: t.grosor / 1000,
    kTrama: t.kTrama,
    kUrdimbre: t.kUrdimbre,
    kCizalla: t.kCizalla,
    pandeo: t.pandeo,
    bTrama: t.bTrama * 1e-6,
    bUrdimbre: t.bUrdimbre * 1e-6,
    bBies: t.bBies * 1e-6,
  };
}

/** Distancia que la tela guarda a un obstáculo (§4.3.1): la mitad de su grosor más 1 mm. */
export function separacion(t: TelaSI): number {
  return t.grosor / 2 + 0.001;
}
```

`src/utils/cloth/implicito/malla.ts`:

```ts
/**
 * La malla de una pieza para el motor implícito (spec 2026-10-13 §4.1.2): posiciones 3D iniciales y su
 * patrón plano, en metros. La colocación en 3D solo da las posiciones iniciales; el reposo sale siempre
 * del patrón.
 */
import { meshPieceOutline } from '../../mesh/cdtMesher';

export interface MallaDeTela {
  /** posiciones iniciales [x0, y0, z0, x1, …] */
  x: Float64Array;
  /** el dibujo 2D de la pieza [px0, py0, px1, …] */
  patron: Float64Array;
  tris: Uint32Array;
  /** 1 = vértice empotrado: no se mueve */
  fijos?: Uint8Array;
}

/**
 * Malla un contorno dibujado en mm con el mallador de Vina y lo acuesta en el plano y = altura (m): el
 * punto (px, py) del dibujo queda en (px, altura, py). `lineasMm` son líneas internas que la malla
 * respeta, como el borde de un empotramiento.
 */
export function mallaDeContorno(
  contornoMm: Array<[number, number]>,
  aristaMm: number,
  altura = 0,
  lineasMm: Array<Array<[number, number]>> = [],
): MallaDeTela {
  const internas = lineasMm.map((l) => ({
    path: l.map(([x, y], k) => ({ type: k === 0 ? ('M' as const) : ('L' as const), values: [x, y] })),
  }));
  const m = meshPieceOutline(
    contornoMm.map(([x, y]) => ({ x, y })),
    internas,
    { yHeight: altura, scale: 0.001, maxEdgeLength: aristaMm, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12 },
  );
  if (m.triIds.length === 0) throw new Error('mallaDeContorno: el mallador no devolvió triángulos');
  // el mallador centra la pieza en su caja: se devuelve a donde la dibuja el contorno
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of contornoMm) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const cx = ((minX + maxX) / 2) * 0.001, cz = ((minY + maxY) / 2) * 0.001;
  const n = m.vertices.length / 3;
  const x = new Float64Array(3 * n), patron = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    x[3 * i] = m.vertices[3 * i] + cx;
    x[3 * i + 1] = altura;
    x[3 * i + 2] = m.vertices[3 * i + 2] + cz;
    patron[2 * i] = x[3 * i];
    patron[2 * i + 1] = x[3 * i + 2];
  }
  return { x, patron, tris: Uint32Array.from(m.triIds) };
}

/**
 * Gira el patrón al marco del hilo (§4.1.2): `v` a lo largo de la urdimbre y `u` perpendicular. `hilo`
 * es la dirección de la urdimbre en el dibujo; por defecto, vertical.
 */
export function aMarcoDelHilo(patron: Float64Array, hilo: readonly [number, number] = [0, 1]): Float64Array {
  const l = Math.hypot(hilo[0], hilo[1]);
  const hx = hilo[0] / l, hy = hilo[1] / l;
  const uv = new Float64Array(patron.length);
  for (let i = 0; i < patron.length / 2; i++) {
    const px = patron[2 * i], py = patron[2 * i + 1];
    uv[2 * i] = px * hy - py * hx;
    uv[2 * i + 1] = px * hx + py * hy;
  }
  return uv;
}
```

`src/utils/cloth/implicito/obstaculos.ts`:

```ts
/**
 * Obstáculos rígidos de forma analítica: los de los ensayos del banco (spec 2026-10-13 §4.4). El cuerpo,
 * una malla con su BVH, llega con la prenda completa (§4.3.1).
 */
export type Obstaculo =
  /** cilindro macizo de radio `radio` con la tapa en y = `tapa` (m): el pedestal del ensayo Cusick */
  | { tipo: 'pedestal'; radio: number; tapa: number }
  /** suelo en y = `altura` */
  | { tipo: 'plano'; altura: number };

/** Distancia con signo a la superficie (m, negativa dentro) y normal hacia afuera. */
export interface Distancia {
  d: number;
  nx: number;
  ny: number;
  nz: number;
}

export function distancia(o: Obstaculo, x: number, y: number, z: number): Distancia {
  if (o.tipo === 'plano') return { d: y - o.altura, nx: 0, ny: 1, nz: 0 };
  const R = o.radio, T = o.tapa;
  const r = Math.hypot(x, z);
  const rx = r > 1e-12 ? x / r : 1, rz = r > 1e-12 ? z / r : 0;
  if (r <= R && y >= T) return { d: y - T, nx: 0, ny: 1, nz: 0 };
  if (r > R && y <= T) return { d: r - R, nx: rx, ny: 0, nz: rz };
  if (r > R && y > T) {
    const a = r - R, b = y - T, d = Math.hypot(a, b);
    return { d, nx: (a / d) * rx, ny: b / d, nz: (a / d) * rz };
  }
  return T - y < R - r ? { d: -(T - y), nx: 0, ny: 1, nz: 0 } : { d: -(R - r), nx: rx, ny: 0, nz: rz };
}

/** El obstáculo más cercano al punto, con su índice; null si no hay obstáculos. */
export function masCercano(obs: readonly Obstaculo[], x: number, y: number, z: number): (Distancia & { k: number }) | null {
  let mejor: (Distancia & { k: number }) | null = null;
  for (let k = 0; k < obs.length; k++) {
    const c = distancia(obs[k], x, y, z);
    if (mejor === null || c.d < mejor.d) mejor = { ...c, k };
  }
  return mejor;
}
```

`src/utils/cloth/implicito/banco/escenas.ts`:

```ts
/**
 * Las escenas del banco de la tela nueva (spec 2026-10-13 §4.4): el disco Cusick, la tira en voladizo y
 * la lámina del cilindro. No dependen del motor: el banco las corre con el de hoy y con el nuevo.
 */
import { mallaDeContorno, type MallaDeTela } from '../malla';
import type { Obstaculo } from '../obstaculos';
import type { TelaFisica } from '../tela';

/**
 * Tela de laboratorio con números redondos, para las pruebas y las escenas públicas. No es una tela
 * medida: las medidas viven en la referencia privada del banco.
 */
export const TELA_DE_LABORATORIO: TelaFisica = {
  gramaje: 200, grosor: 0.5, kTrama: 300, kUrdimbre: 600, kCizalla: 50, pandeo: 1, bTrama: 2, bUrdimbre: 5, bBies: 3,
};

/** Ensayo Cusick (ISO 9073-9): disco de 30 cm sobre pedestal de 18 cm, 5 mm por encima de la tapa. */
export const CUSICK = { radioDisco: 0.15, radioPedestal: 0.09, tapa: 0.5, alturaInicial: 0.505 } as const;

/** Una escena: la malla, lo que toca y la dirección del hilo en el dibujo (por defecto, vertical). */
export interface Escena {
  malla: MallaDeTela;
  obstaculos: Obstaculo[];
  hilo?: readonly [number, number];
}

export function circulo(radioMm: number, lados: number): Array<[number, number]> {
  return Array.from({ length: lados }, (_, i): [number, number] => {
    const a = (2 * Math.PI * i) / lados;
    return [radioMm * Math.cos(a), radioMm * Math.sin(a)];
  });
}

export function rectangulo(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** El disco Cusick con malla de `aristaMm`; con otro radio sirve de escena grande para medir velocidad. */
export function escenaCusick(aristaMm: number, radioMm = 150): Escena {
  return {
    malla: mallaDeContorno(circulo(radioMm, Math.max(96, Math.round(radioMm / 3))), aristaMm, CUSICK.alturaInicial),
    obstaculos: [{ tipo: 'pedestal', radio: CUSICK.radioPedestal, tapa: CUSICK.tapa }],
  };
}

/**
 * Tira de 25 mm de ancho a lo largo de x, empotrada en x ≤ 0 (5 mm de empotramiento) y con `voladoMm` en
 * el aire. Con 'urdimbre' el hilo corre a lo largo de la tira; con 'trama', a lo ancho.
 */
export function escenaVoladizo(voladoMm: number, hilo: 'urdimbre' | 'trama', aristaMm: number): Escena {
  const malla = mallaDeContorno(
    [[-5, -12.5], [0, -12.5], [voladoMm, -12.5], [voladoMm, 12.5], [0, 12.5], [-5, 12.5]],
    aristaMm,
    0,
    [[[0, -12.5], [0, 12.5]]],
  );
  const n = malla.x.length / 3;
  malla.fijos = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (malla.x[3 * i] <= 1e-6) malla.fijos[i] = 1;
  return { malla, obstaculos: [], hilo: hilo === 'urdimbre' ? [1, 0] : [0, 1] };
}

/** Lámina de 120 × 120 mm, para curvarla sobre un cilindro. */
export function laminaPlana(aristaMm: number): MallaDeTela {
  return mallaDeContorno(rectangulo(-60, -60, 60, 60), aristaMm);
}
```

`src/utils/cloth/implicito/banco/medidas.ts`:

```ts
/**
 * Lo que mide el banco sobre unas posiciones, sin importar qué motor las produjo (spec 2026-10-13 §2 y
 * §4.4).
 */
import { computeDrapeCoefficient, countFolds, extractOrderedBoundaryLoop } from '../../cusickMetric';
import type { MallaDeTela } from '../malla';
import { CUSICK } from './escenas';

/** Porcentaje de triángulos con menos de la mitad del área de su patrón. */
export function aplastados(x: ArrayLike<number>, malla: MallaDeTela): number {
  const { tris, patron } = malla, nt = tris.length / 3;
  let bajo = 0;
  for (let t = 0; t < nt; t++) {
    const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
    const A0 = 0.5 * Math.abs(
      (patron[2 * b] - patron[2 * a]) * (patron[2 * c + 1] - patron[2 * a + 1]) -
        (patron[2 * c] - patron[2 * a]) * (patron[2 * b + 1] - patron[2 * a + 1]),
    );
    const ab = [0, 1, 2].map((d) => x[3 * b + d] - x[3 * a + d]);
    const ac = [0, 1, 2].map((d) => x[3 * c + d] - x[3 * a + d]);
    const A = 0.5 * Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
    if (A < 0.5 * A0) bajo++;
  }
  return (100 * bajo) / nt;
}

/** Coeficiente de caída (ISO 9073-9, %) y ondas del disco Cusick. */
export function caidaCusick(x: ArrayLike<number>, malla: MallaDeTela): { coeficiente: number; ondas: number } {
  const p = Float32Array.from(x);
  const lazo = extractOrderedBoundaryLoop(malla.tris);
  return {
    coeficiente: computeDrapeCoefficient(p, lazo, { supportRadius: CUSICK.radioPedestal, specimenRadius: CUSICK.radioDisco }),
    ondas: countFolds(p, lazo),
  };
}

/** La punta de la tira: el promedio de los vértices de su borde libre (en el patrón, x = voladizo). */
export function puntaDelVoladizo(x: ArrayLike<number>, malla: MallaDeTela, voladoM: number): { x: number; y: number } {
  let sx = 0, sy = 0, k = 0;
  for (let i = 0; i < malla.patron.length / 2; i++) {
    if (malla.patron[2 * i] < voladoM - 1e-6) continue;
    sx += x[3 * i];
    sy += x[3 * i + 1];
    k++;
  }
  return { x: sx / k, y: sy / k };
}

/**
 * Ensayo de Peirce: el ángulo (grados) de la cuerda que va del borde del empotramiento a la punta, y la
 * longitud de flexión c = L·(cos(θ/2) / (8·tan θ))^(1/3), en m.
 */
export function peirce(punta: { x: number; y: number }, voladoM: number, alturaDelBorde = 0): { angulo: number; longitudDeFlexion: number } {
  const th = Math.atan2(alturaDelBorde - punta.y, punta.x);
  return { angulo: (th * 180) / Math.PI, longitudDeFlexion: voladoM * Math.cbrt(Math.cos(th / 2) / (8 * Math.tan(th))) };
}
```

`src/utils/cloth/implicito/banco/elastica.ts`:

```ts
/**
 * La elástica exacta de una tira empotrada que cuelga por su peso: B·θ'' = −w·(L − s)·cos θ, con θ(0) = 0
 * y θ'(L) = 0, resuelta por disparo sobre θ'(0) con un Runge-Kutta de punto medio. B en N·m por metro de
 * ancho, w = peso por área (N/m²) y L en m. Devuelve la punta: x a lo largo, y hacia arriba (negativa).
 */
export function elasticaExacta(B: number, w: number, L: number, pasos = 4000): { x: number; y: number } {
  const integrar = (k0: number) => {
    const ds = L / pasos;
    const f = (s: number, t: number) => (-w * (L - s) * Math.cos(t)) / B;
    let th = 0, k = k0, x = 0, y = 0;
    for (let i = 0; i < pasos; i++) {
      const s = i * ds;
      const k1 = f(s, th), thm = th + 0.5 * ds * k, km = k + 0.5 * ds * k1;
      const k2 = f(s + 0.5 * ds, thm);
      x += ds * Math.cos(thm);
      y -= ds * Math.sin(thm);
      th += ds * km;
      k += ds * k2;
    }
    return { k, x, y };
  };
  let lo = 0, hi = 1;
  while (integrar(hi).k < 0) hi *= 2;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    if (integrar(mid).k < 0) lo = mid;
    else hi = mid;
  }
  const r = integrar((lo + hi) / 2);
  return { x: r.x, y: r.y };
}
```

- [ ] **Step 4: Corre las pruebas y mira que pasan**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/banco.test.ts src/utils/cloth/implicito/__tests__/obstaculos.test.ts`
Expected: PASS, 12 pruebas.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito
git commit -m "feat(tela): banco del motor implícito — escenas, medidas, obstáculos y elástica exacta" -m "Disco Cusick, tira en voladizo y lámina sobre el patrón de Vina, con coeficiente de caída, ondas, triángulos aplastados, punta y ángulo de Peirce, y la elástica exacta del voladizo. No dependen del motor: sirven igual para el de hoy y para el nuevo."
```

### Tarea 2: El banco privado y el motor de hoy como punto de partida

El banco compara contra una referencia que no está en el repo: `VINA_REFERENCIAS` apunta a una carpeta privada del PC de Samuel con `referencias.json`. Esta tarea mide el motor de hoy (XPBD) con las escenas de la Tarea 1. Ese es el punto de partida de cada entrega (§4.4.4).

**Files:**
- Create: `bench/_banco.ts`
- Create: `bench/telaNueva.ts`
- Modify: `package.json` (sección `scripts`, después de `"bench:lra"`)
- Modify: `bench/README.md` (sección nueva al final)

**Interfaces:**
- Consumes: todo lo de la Tarea 1; `XPBDClothSolver` (`src/utils/cloth/xpbdSolver.ts`: constructor `(meshData: ClothMeshData, config?: Partial<ClothSimConfig>)`, `setCollisionMesh`, `pinParticle(i)`, `step()`, `getSnapshot().positions`); `buildCusickPedestal({ topY, radius })`; `getPhysicalFabric`, `toXPBDParams`.
- Produces (`bench/_banco.ts`): `interface Referencias { cusick; cusickRango; voladizo; tela }`, `carpetaPrivada(): string`, `leerReferencias(): Referencias`, `interface Corrida { x: ArrayLike<number>; quieta: number | null; msPorCuadro: number }`, `type Corredor = (e: Escena) => Corrida`, `correrXpbd: Corredor`, `interface FilaCusick`, `ensayoCusick(correr, mallas, ref): FilaCusick[]`, `interface FilaVoladizo`, `ensayoVoladizo(correr, mallas, ref): FilaVoladizo[]`, `criterioCusick(filas, ref): { nivel: boolean; rango: boolean; rangoPropio: number; rangoReferencia: number }`, `imprimirCusick`, `imprimirVoladizo`, `guardarInforme(nombre, datos): string`. `bench/telaNueva.ts` tiene el registro `MOTORES: Record<string, (ref: Referencias, args: Map<string, string>) => Corredor>`, que la Tarea 9 amplía.

`referencias.json` tiene esta forma (los números solo están en la carpeta privada):

```json
{
  "cusick": { "5": { "coeficiente": 0, "ondas": 0 }, "10": { "coeficiente": 0, "ondas": 0 } },
  "cusickRango": { "5": { "coeficiente": 0, "ondas": 0 }, "10": { "coeficiente": 0, "ondas": 0 }, "20": { "coeficiente": 0, "ondas": 0 } },
  "voladizo": { "urdimbre-15": { "angulo": 0 }, "trama-15": { "angulo": 0 } },
  "tela": { "gramaje": 0, "grosor": 0, "kTrama": 0, "kUrdimbre": 0, "kCizalla": 0, "bTrama": 0, "bUrdimbre": 0, "bBies": 0 }
}
```

- [ ] **Step 1: Escribe `bench/_banco.ts`**

```ts
/**
 * Piezas del banco de la tela nueva (spec docs/superpowers/specs/2026-10-13-tela-nueva-design.md §4.4.2 y
 * §4.4.4): leer la referencia privada, correr los ensayos con cualquier motor, comparar y guardar el
 * informe. La referencia vive en la carpeta `VINA_REFERENCIAS`, fuera del repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildCusickPedestal } from '../src/utils/cloth/cusickScene';
import { getPhysicalFabric, toXPBDParams } from '../src/utils/cloth/physicalFabric';
import { XPBDClothSolver } from '../src/utils/cloth/xpbdSolver';
import { escenaCusick, escenaVoladizo, type Escena } from '../src/utils/cloth/implicito/banco/escenas';
import { aplastados, caidaCusick, peirce, puntaDelVoladizo } from '../src/utils/cloth/implicito/banco/medidas';
import { aMarcoDelHilo } from '../src/utils/cloth/implicito/malla';
import type { TelaFisica } from '../src/utils/cloth/implicito/tela';

/** `VINA_REFERENCIAS/referencias.json`. */
export interface Referencias {
  /** coeficiente y ondas del disco por malla (mm), con la separación de contacto más parecida a la del motor */
  cusick: Record<string, { coeficiente: number; ondas: number }>;
  /** una serie del mismo ajuste con mallas de 5, 10 y 20 mm, para el rango de §2 */
  cusickRango: Record<string, { coeficiente: number; ondas: number }>;
  /** ángulo de Peirce en grados por «hilo-volado»: "urdimbre-15", "trama-40"… */
  voladizo: Record<string, { angulo: number }>;
  /** la tela de la referencia; el pandeo lo pone el banco */
  tela: Omit<TelaFisica, 'pandeo'>;
}

export function carpetaPrivada(): string {
  const carpeta = process.env.VINA_REFERENCIAS;
  if (!carpeta) throw new Error('Falta VINA_REFERENCIAS: la carpeta privada con referencias.json (no está en el repo).');
  return carpeta;
}

export function leerReferencias(): Referencias {
  return JSON.parse(fs.readFileSync(path.join(carpetaPrivada(), 'referencias.json'), 'utf8')) as Referencias;
}

/** Lo que devuelve un motor después de correr una escena. */
export interface Corrida {
  x: ArrayLike<number>;
  /** segundos de tela hasta quedar quieta (§4.2.4); null si el motor no lo mide o no llegó */
  quieta: number | null;
  msPorCuadro: number;
}

export type Corredor = (e: Escena) => Corrida;

/**
 * El motor de hoy: XPBD de CPU con el jersey de la biblioteca y el mapeo de producción (el mismo de
 * cusickGate.cpu.test.ts), durante 8 s de tela.
 */
export function correrXpbd(e: Escena): Corrida {
  const pf = getPhysicalFabric('cotton-jersey');
  if (!pf) throw new Error('falta cotton-jersey en la biblioteca');
  const xpbd = toXPBDParams(pf);
  const m = e.malla;
  // el motor de hoy no lee la línea de grano: se le da el patrón ya girado al marco del hilo (1 UV = 10 cm)
  const uv = aMarcoDelHilo(m.patron, e.hilo);
  const solver = new XPBDClothSolver(
    { vertices: Float32Array.from(m.x), triIds: Int32Array.from(m.tris), uvs: Float32Array.from(uv, (q) => q * 10) },
    {
      numSubsteps: 15,
      adaptiveSubsteps: false,
      dt: 1 / 60,
      gravity: [0, -9.81, 0],
      stretchComplianceWarp: 0,
      stretchComplianceWeft: 0,
      stretchComplianceShear: 0.001,
      bendComplianceWarp: xpbd.bendComplianceWarp,
      bendComplianceWeft: xpbd.bendComplianceWeft,
      internalDamping: pf.internalDamping,
      fabricDensity: xpbd.density,
    },
  );
  for (const o of e.obstaculos) if (o.tipo === 'pedestal') solver.setCollisionMesh(buildCusickPedestal({ topY: o.tapa, radius: o.radio }));
  m.fijos?.forEach((f, i) => {
    if (f) solver.pinParticle(i);
  });
  const cuadros = 480, t0 = performance.now();
  for (let c = 0; c < cuadros; c++) solver.step();
  return { x: solver.getSnapshot().positions, quieta: null, msPorCuadro: (performance.now() - t0) / cuadros };
}

export interface FilaCusick {
  malla: number;
  coeficiente: number;
  ondas: number;
  aplastados: number;
  quieta: number | null;
  msPorCuadro: number;
  referencia: number | null;
}

export function ensayoCusick(correr: Corredor, mallas: number[], ref: Referencias): FilaCusick[] {
  return mallas.map((malla) => {
    const e = escenaCusick(malla);
    const r = correr(e);
    return {
      malla,
      ...caidaCusick(r.x, e.malla),
      aplastados: aplastados(r.x, e.malla),
      quieta: r.quieta,
      msPorCuadro: r.msPorCuadro,
      referencia: ref.cusick[String(malla)]?.coeficiente ?? null,
    };
  });
}

export interface FilaVoladizo {
  hilo: 'urdimbre' | 'trama';
  volado: number;
  malla: number;
  angulo: number;
  longitudDeFlexion: number;
  quieta: number | null;
  referencia: number | null;
}

export function ensayoVoladizo(correr: Corredor, mallas: number[], ref: Referencias): FilaVoladizo[] {
  const filas: FilaVoladizo[] = [];
  for (const hilo of ['urdimbre', 'trama'] as const) {
    for (const volado of [15, 25, 40]) {
      for (const malla of mallas) {
        const e = escenaVoladizo(volado, hilo, malla);
        const r = correr(e);
        const { angulo, longitudDeFlexion } = peirce(puntaDelVoladizo(r.x, e.malla, volado / 1000), volado / 1000);
        filas.push({ hilo, volado, malla, angulo, longitudDeFlexion, quieta: r.quieta, referencia: ref.voladizo[`${hilo}-${volado}`]?.angulo ?? null });
      }
    }
  }
  return filas;
}

/** §2: a 5 puntos o menos de la referencia con malla de 5 mm, y un rango entre 5, 10 y 20 mm no mayor que el de la referencia. */
export function criterioCusick(filas: FilaCusick[], ref: Referencias): { nivel: boolean; rango: boolean; rangoPropio: number; rangoReferencia: number } {
  const propio = (m: number) => filas.find((f) => f.malla === m)?.coeficiente ?? NaN;
  const rango = (v: number[]) => Math.max(...v) - Math.min(...v);
  const rangoPropio = rango([5, 10, 20].map(propio));
  const rangoReferencia = rango(['5', '10', '20'].map((k) => ref.cusickRango[k]?.coeficiente ?? NaN));
  return {
    nivel: Math.abs(propio(5) - (ref.cusick['5']?.coeficiente ?? NaN)) <= 5,
    rango: rangoPropio <= rangoReferencia,
    rangoPropio,
    rangoReferencia,
  };
}

const uno = (v: number | null) => (v === null ? '—' : v.toFixed(1));

export function imprimirCusick(filas: FilaCusick[]): void {
  for (const f of filas) {
    console.log(`cusick ${f.malla} mm: coeficiente ${uno(f.coeficiente)} (referencia ${uno(f.referencia)}) · ondas ${f.ondas} · aplastados ${f.aplastados.toFixed(2)} % · quieta ${uno(f.quieta)} s · ${f.msPorCuadro.toFixed(0)} ms por cuadro`);
  }
}

export function imprimirVoladizo(filas: FilaVoladizo[]): void {
  for (const f of filas) {
    console.log(`voladizo ${f.hilo} ${f.volado} mm, malla ${f.malla} mm: ángulo ${uno(f.angulo)}° (referencia ${uno(f.referencia)}°) · longitud de flexión ${(f.longitudDeFlexion * 1000).toFixed(1)} mm · quieta ${uno(f.quieta)} s`);
  }
}

/** Guarda el informe en `$VINA_REFERENCIAS/informes/` y devuelve la ruta. */
export function guardarInforme(nombre: string, datos: unknown): string {
  const dir = path.join(carpetaPrivada(), 'informes');
  fs.mkdirSync(dir, { recursive: true });
  const ruta = path.join(dir, `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${nombre}.json`);
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 1));
  return ruta;
}
```

- [ ] **Step 2: Escribe `bench/telaNueva.ts`**

```ts
/**
 * El banco de la tela nueva contra la referencia privada (spec 2026-10-13 §4.4.2) y contra el motor de
 * hoy (§4.4.4).
 *
 *   VINA_REFERENCIAS=<carpeta privada> npm run bench:tela -- [--motor=xpbd] [--ensayo=cusick|voladizo|todo] [--mallas=5,10,20]
 *
 * `npm run bench:tela` ya corre con el candado de scripts/pesado.mjs. El informe queda en
 * `$VINA_REFERENCIAS/informes/`.
 */
import {
  correrXpbd,
  criterioCusick,
  ensayoCusick,
  ensayoVoladizo,
  guardarInforme,
  imprimirCusick,
  imprimirVoladizo,
  leerReferencias,
  type Corredor,
  type Referencias,
} from './_banco';

const MOTORES: Record<string, (ref: Referencias, args: Map<string, string>) => Corredor> = {
  xpbd: () => correrXpbd,
};

const args = new Map(
  process.argv.slice(2).map((a): [string, string] => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? ''];
  }),
);
const motor = args.get('motor') ?? 'xpbd';
const ensayo = args.get('ensayo') ?? 'todo';
const mallas = (args.get('mallas') ?? '5,10,20').split(',').map(Number);
const fabrica = MOTORES[motor];
if (!fabrica) throw new Error(`motor desconocido: ${motor} (hay ${Object.keys(MOTORES).join(', ')})`);
const ref = leerReferencias();
const correr = fabrica(ref, args);
const informe: Record<string, unknown> = { motor, mallas, args: Object.fromEntries(args) };
if (ensayo !== 'voladizo') {
  const filas = ensayoCusick(correr, mallas, ref);
  imprimirCusick(filas);
  const criterio = criterioCusick(filas, ref);
  console.log(`§2: nivel con 5 mm ${criterio.nivel ? 'pasa' : 'no pasa'} · rango ${criterio.rangoPropio.toFixed(1)} frente a ${criterio.rangoReferencia.toFixed(1)}: ${criterio.rango ? 'pasa' : 'no pasa'}`);
  informe.cusick = filas;
  informe.criterio = criterio;
}
if (ensayo !== 'cusick') {
  const filas = ensayoVoladizo(correr, mallas, ref);
  imprimirVoladizo(filas);
  informe.voladizo = filas;
}
console.log(`informe: ${guardarInforme(motor, informe)}`);
```

- [ ] **Step 3: Agrega el script y la sección del README**

En `package.json`, después de la línea `"bench:lra": "tsx bench/buildLRAConstraints.bench.ts",`:

```json
    "bench:tela": "node scripts/pesado.mjs --nombre=banco-tela --espera=15 -- tsx bench/telaNueva.ts",
```

Al final de `bench/README.md` (el archivo está en inglés):

````md
## `bench:tela` — the new cloth engine against a private reference

`npm run bench:tela` runs the lab tests of the new cloth engine (spec
`docs/superpowers/specs/2026-10-13-tela-nueva-design.md` §4.4: the Cusick disc
and the cantilever strip at 5, 10 and 20 mm) and compares them with a
reference that is **not** in this repo. `VINA_REFERENCIAS` must point to a
private folder holding `referencias.json`; the report is written to its
`informes/` subfolder, and the script refuses to run without it.

```bash
VINA_REFERENCIAS=<private folder> npm run bench:tela -- --motor=xpbd
```

`--motor=xpbd` measures today's engine, the baseline every delivery is
measured against (§4.4.4). Other flags: `--ensayo=cusick|voladizo|todo` and
`--mallas=5,10,20`. The script already runs under the `scripts/pesado.mjs`
lock. The exact-physics half of the bench (§4.4.1) needs no private data: it
is the vitest suite in `src/utils/cloth/implicito/__tests__/`.
````

- [ ] **Step 4: Comprueba los tipos y corre el banco con el motor de hoy**

Run: `npx tsc -b --noEmit`
Expected: sin errores (`bench/` entra en `tsc -b` por `bench/tsconfig.json`).

Run (en el PC de Samuel, con la carpeta privada): `VINA_REFERENCIAS=<carpeta privada> npm run bench:tela -- --motor=xpbd`
Expected: tres líneas `cusick 5/10/20 mm: …` con su referencia, una línea `§2: …` (se espera que el motor de hoy no pase), 18 líneas `voladizo …` y `informe: <ruta>`. Anota el coeficiente, las ondas y los aplastados de cada malla: son el punto de partida contra el que se miden las entregas 2 y 3. Los números quedan en el informe privado y no van al commit.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add bench/_banco.ts bench/telaNueva.ts bench/README.md package.json
git commit -m "feat(banco): banco de la tela nueva con referencia privada y el motor de hoy" -m "bench/telaNueva.ts corre el disco Cusick y el voladizo con cualquier motor y los compara con una referencia que vive fuera del repo, en la carpeta VINA_REFERENCIAS. El XPBD de hoy queda medido como punto de partida de cada entrega."
```

---
## Entrega 2 — La tela y el cálculo en CPU

### Tarea 3: El reposo en el patrón

**Files:**
- Create: `src/utils/cloth/implicito/reposo.ts`
- Test: `src/utils/cloth/implicito/__tests__/reposo.test.ts`

**Interfaces:**
- Consumes: `aMarcoDelHilo`, `laminaPlana` (Tarea 1).
- Produces: `interface Reposo { coef: Float64Array; masa: Float64Array }`; `prepararReposo(uv: Float64Array, tris: Uint32Array, densidad: number): Reposo`. Por triángulo, `coef` guarda `a0 a1 a2 b0 b1 b2 A0`: `f_u = Σ a_k·x_k` y `f_v = Σ b_k·x_k` son las columnas de `F = Ds·Dm⁻¹`, y `A0` es el área en el patrón (m²). La masa va en kg por vértice.

- [ ] **Step 1: Escribe la prueba que falla**

`src/utils/cloth/implicito/__tests__/reposo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aMarcoDelHilo } from '../malla';
import { prepararReposo } from '../reposo';
import { laminaPlana } from '../banco/escenas';

/** f_u y f_v del triángulo t en las posiciones x. */
function columnas(coef: Float64Array, tris: Uint32Array, x: Float64Array, t: number): number[] {
  const f = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 3; k++) {
    for (let d = 0; d < 3; d++) {
      f[d] += coef[7 * t + k] * x[3 * tris[3 * t + k] + d];
      f[3 + d] += coef[7 * t + 3 + k] * x[3 * tris[3 * t + k] + d];
    }
  }
  return f;
}

describe('el reposo en el patrón', () => {
  for (const hilo of [[0, 1], [1, 0], [Math.SQRT1_2, Math.SQRT1_2]] as const) {
    it(`en reposo f_u y f_v son unitarias y perpendiculares (hilo ${hilo[0].toFixed(2)}, ${hilo[1].toFixed(2)})`, () => {
      const m = laminaPlana(10);
      const { coef } = prepararReposo(aMarcoDelHilo(m.patron, hilo), m.tris, 0.2);
      for (let t = 0; t < m.tris.length / 3; t++) {
        const f = columnas(coef, m.tris, m.x, t);
        expect(Math.hypot(f[0], f[1], f[2])).toBeCloseTo(1, 9);
        expect(Math.hypot(f[3], f[4], f[5])).toBeCloseTo(1, 9);
        expect(f[0] * f[3] + f[1] * f[4] + f[2] * f[5]).toBeCloseTo(0, 9);
      }
    });
  }

  it('con el hilo vertical, f_u sigue el eje x del dibujo y f_v su eje y (z en 3D)', () => {
    const m = laminaPlana(10);
    const { coef } = prepararReposo(aMarcoDelHilo(m.patron), m.tris, 0.2);
    const f = columnas(coef, m.tris, m.x, 0);
    expect(f[0]).toBeCloseTo(1, 9);
    expect(f[5]).toBeCloseTo(1, 9);
  });

  it('la masa total es la densidad por el área de la pieza', () => {
    const m = laminaPlana(10);
    const { masa } = prepararReposo(aMarcoDelHilo(m.patron), m.tris, 0.2);
    expect(masa.reduce((s, q) => s + q, 0)).toBeCloseTo(0.2 * 0.12 * 0.12, 8);
  });

  it('un triángulo sin área en el patrón falla diciendo cuál', () => {
    expect(() => prepararReposo(Float64Array.from([0, 0, 1, 0, 2, 0]), Uint32Array.from([0, 1, 2]), 0.2)).toThrow(/triángulo 0/);
  });

  it('un triángulo dado vuelta falla', () => {
    expect(() => prepararReposo(Float64Array.from([0, 0, 1, 0, 0, 1, 1, 1]), Uint32Array.from([0, 1, 2, 1, 2, 3]), 0.2)).toThrow(/al revés/);
  });

  it('un vértice suelto falla diciendo cuál', () => {
    expect(() => prepararReposo(Float64Array.from([0, 0, 1, 0, 0, 1, 5, 5]), Uint32Array.from([0, 1, 2]), 0.2)).toThrow(/vértice 3/);
  });
});
```

- [ ] **Step 2: Corre la prueba y mira que falla**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/reposo.test.ts`
Expected: FAIL (`Failed to resolve import "../reposo"`).

- [ ] **Step 3: Escribe `src/utils/cloth/implicito/reposo.ts`**

```ts
/**
 * El reposo de la tela (spec 2026-10-13 §4.1.2 y §4.1.6): cada triángulo recuerda su forma en el patrón
 * plano, ya girado al marco del hilo, y cada vértice recibe gramaje·A0/3 de cada triángulo vecino.
 */

export interface Reposo {
  /**
   * Por triángulo a0 a1 a2 b0 b1 b2 A0: las columnas de F = Ds·Dm⁻¹ son f_u = Σ a_k·x_k (a lo ancho) y
   * f_v = Σ b_k·x_k (a lo largo del hilo); A0 es el área en el patrón (m²).
   */
  coef: Float64Array;
  /** kg por vértice */
  masa: Float64Array;
}

/** `uv`: el patrón en el marco del hilo (m), de `aMarcoDelHilo`; `densidad` en kg/m². */
export function prepararReposo(uv: Float64Array, tris: Uint32Array, densidad: number): Reposo {
  const n = uv.length / 2, nt = tris.length / 3;
  const coef = new Float64Array(7 * nt), masa = new Float64Array(n);
  let signo = 0;
  for (let t = 0; t < nt; t++) {
    const i0 = tris[3 * t], i1 = tris[3 * t + 1], i2 = tris[3 * t + 2];
    const d00 = uv[2 * i1] - uv[2 * i0], d01 = uv[2 * i2] - uv[2 * i0];
    const d10 = uv[2 * i1 + 1] - uv[2 * i0 + 1], d11 = uv[2 * i2 + 1] - uv[2 * i0 + 1];
    const det = d00 * d11 - d01 * d10;
    if (!(Math.abs(det) > 1e-14)) throw new Error(`prepararReposo: el triángulo ${t} no tiene área en el patrón`);
    if (signo === 0) signo = Math.sign(det);
    else if (Math.sign(det) !== signo) throw new Error(`prepararReposo: el triángulo ${t} va al revés que los demás`);
    // Dm⁻¹ = [[d11, −d01], [−d10, d00]] / det
    const a1 = d11 / det, a2 = -d10 / det, b1 = -d01 / det, b2 = d00 / det;
    const A0 = Math.abs(det) / 2;
    coef.set([-(a1 + a2), a1, a2, -(b1 + b2), b1, b2, A0], 7 * t);
    masa[i0] += (densidad * A0) / 3;
    masa[i1] += (densidad * A0) / 3;
    masa[i2] += (densidad * A0) / 3;
  }
  const suelto = masa.findIndex((m) => m === 0);
  if (suelto >= 0) throw new Error(`prepararReposo: el vértice ${suelto} no está en ningún triángulo`);
  return { coef, masa };
}
```

- [ ] **Step 4: Corre la prueba y mira que pasa**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/reposo.test.ts`
Expected: PASS, 8 pruebas.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/reposo.ts src/utils/cloth/implicito/__tests__/reposo.test.ts
git commit -m "feat(tela): el reposo de la tela es el patrón en el marco del hilo" -m "Por triángulo, Dm⁻¹ y el área en el patrón ya girado a la línea de grano; la masa sale del gramaje por el área. Una malla con un triángulo sin área, uno dado vuelta o un vértice suelto falla nombrándolo."
```

---

### Tarea 4: La membrana con pandeo

**Files:**
- Create: `src/utils/cloth/implicito/membrana.ts`
- Create: `src/utils/cloth/implicito/__tests__/ayudas.ts`
- Test: `src/utils/cloth/implicito/__tests__/membrana.test.ts`

**Interfaces:**
- Consumes: `TelaSI` (Tarea 1); `prepararReposo` (Tarea 3).
- Produces:
  - `membrana.ts`: `ley(eps: number, k: number, pcr: number): [number, number, number]` (ψ, ψ', ψ''); `ESTADO_MEMBRANA = 14`; `class Membrana`, con `constructor(tris: Uint32Array, coef: Float64Array, tela: TelaSI)`, los campos `nt`, `pcrU: Float64Array`, `pcrV: Float64Array`, `estado: Float64Array` (14 por triángulo: f_u(3), f_v(3), |f_u|, |f_v|, ψ'_u/|f_u|, ψ'_v/|f_v|, ψ''_u, ψ''_v, max(ψ'_u/|f_u|, 0), max(ψ'_v/|f_v|, 0)) y los métodos `energiaDe(t, x): number`, `energia(x): number`, `linealizar(x): void`, `gradiente(out): void` (suma), `hessianaPor(p, out): void` (suma), `sumarBloque(t, li, lj, M, o = 0): void` (suma, fila mayor) y `sumarBloquesDiagonales(out): void` (suma, 9 por vértice).
  - `__tests__/ayudas.ts`: `azar(semilla): () => number` en [−0,5, 0,5); `errorDelGradiente(E, g, x): number`; `errorDeHessiana(gradiente, Hp, x, p): number`.

- [ ] **Step 1: Escribe las ayudas y la prueba que falla**

`src/utils/cloth/implicito/__tests__/ayudas.ts`:

```ts
/** Ayudas de las pruebas del motor implícito. */

/** Generador determinista (Park-Miller) en [−0,5, 0,5). */
export function azar(semilla: number): () => number {
  let s = semilla;
  return () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
}

/** Peor error relativo entre el gradiente g y las diferencias finitas centradas de E en x. */
export function errorDelGradiente(E: (x: Float64Array) => number, g: Float64Array, x: Float64Array): number {
  const escala = g.reduce((s, q) => Math.max(s, Math.abs(q)), 0);
  let peor = 0;
  for (let q = 0; q < x.length; q++) {
    const h = 1e-7, x0 = x[q];
    x[q] = x0 + h;
    const Ep = E(x);
    x[q] = x0 - h;
    const Em = E(x);
    x[q] = x0;
    const num = (Ep - Em) / (2 * h);
    peor = Math.max(peor, Math.abs(num - g[q]) / (1e-3 * escala + Math.abs(num)));
  }
  return peor;
}

/**
 * Error relativo (norma 2) entre H·p y la derivada del gradiente a lo largo de p, por diferencias
 * finitas centradas. `gradiente(x, out)` escribe el gradiente en x.
 */
export function errorDeHessiana(
  gradiente: (x: Float64Array, out: Float64Array) => void,
  Hp: Float64Array,
  x: Float64Array,
  p: Float64Array,
): number {
  const h = 1e-6, gp = new Float64Array(x.length), gm = new Float64Array(x.length);
  gradiente(Float64Array.from(x, (q, k) => q + h * p[k]), gp);
  gradiente(Float64Array.from(x, (q, k) => q - h * p[k]), gm);
  let num = 0, den = 0;
  for (let q = 0; q < x.length; q++) {
    const fd = (gp[q] - gm[q]) / (2 * h);
    num += (fd - Hp[q]) ** 2;
    den += fd ** 2;
  }
  return Math.sqrt(num / den);
}
```

`src/utils/cloth/implicito/__tests__/membrana.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aMarcoDelHilo } from '../malla';
import { prepararReposo } from '../reposo';
import { ley, Membrana } from '../membrana';
import { telaSI } from '../tela';
import { laminaPlana, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, errorDeHessiana, errorDelGradiente } from './ayudas';

function membranaDeLamina(pandeo: number) {
  const m = laminaPlana(20);
  const tela = telaSI({ ...TELA_DE_LABORATORIO, pandeo });
  const { coef } = prepararReposo(aMarcoDelHilo(m.patron), m.tris, tela.densidad);
  return { m, mem: new Membrana(m.tris, coef, tela) };
}

describe('la membrana', () => {
  it('la ley: lineal al estirar, igual al encoger hasta la carga de pandeo y plana después', () => {
    const k = 600, pcr = 3, ecr = pcr / k;
    const antes = ley(-ecr, k, pcr), despues = ley(-ecr - 1e-12, k, pcr);
    expect(despues[0]).toBeCloseTo(antes[0], 9);
    expect(despues[1]).toBeCloseTo(antes[1], 6);
    const estira = ley(0.01, k, pcr);
    expect(estira[0]).toBeCloseTo(0.03, 12);
    expect(estira[1]).toBeCloseTo(6, 12);
    expect(estira[2]).toBe(k);
    expect(ley(-0.1, k, pcr)[1]).toBe(-pcr);
    expect(ley(-0.1, k, pcr)[2]).toBe(0);
  });

  it('sin pandeo o con compresión gratis la ley queda finita', () => {
    const libre = ley(-0.1, 600, 0);
    expect(libre[0]).toBe(0);
    expect(Math.abs(libre[1])).toBe(0);
    expect(libre[2]).toBe(0);
    const rigida = ley(-0.1, 600, Infinity);
    expect(rigida[0]).toBeCloseTo(3, 12);
    expect(rigida[1]).toBeCloseTo(-60, 12);
    expect(rigida[2]).toBe(600);
  });

  for (const pandeo of [Infinity, 1, 0]) {
    it(`fuerza = −∂E/∂x por diferencias finitas (pandeo ${pandeo})`, () => {
      const { m, mem } = membranaDeLamina(pandeo);
      const r = azar(7), x = Float64Array.from(m.x, (q) => q + 0.004 * r());
      mem.linealizar(x);
      const g = new Float64Array(x.length);
      mem.gradiente(g);
      expect(errorDelGradiente((y) => mem.energia(y), g, x)).toBeLessThan(1e-4);
    });
  }

  it('en tracción pura la hessiana de Gauss-Newton es la exacta', () => {
    const { m, mem } = membranaDeLamina(1);
    // 5 % a lo ancho (x) y 2 % a lo largo (z): sin cizalla y en tracción
    const x = Float64Array.from(m.x, (q, k) => (k % 3 === 0 ? 1.05 * q : k % 3 === 2 ? 1.02 * q : q));
    const r = azar(11), p = Float64Array.from(x, () => r());
    mem.linealizar(x);
    const Hp = new Float64Array(x.length);
    mem.hessianaPor(p, Hp);
    const gradiente = (y: Float64Array, out: Float64Array) => {
      out.fill(0);
      mem.linealizar(y);
      mem.gradiente(out);
    };
    expect(errorDeHessiana(gradiente, Hp, x, p)).toBeLessThan(1e-5);
  });

  it('la hessiana de Gauss-Newton nunca es negativa (pᵀHp ≥ 0)', () => {
    const { m, mem } = membranaDeLamina(1);
    const r = azar(5), x = Float64Array.from(m.x, (q) => q + 0.004 * r());
    mem.linealizar(x);
    const Hp = new Float64Array(x.length);
    for (let caso = 0; caso < 20; caso++) {
      const p = Float64Array.from(x, () => r());
      Hp.fill(0);
      mem.hessianaPor(p, Hp);
      expect(p.reduce((s, q, k) => s + q * Hp[k], 0)).toBeGreaterThanOrEqual(0);
    }
  });

  it('los bloques diagonales son los de H·p', () => {
    const { m, mem } = membranaDeLamina(1);
    const r = azar(3), x = Float64Array.from(m.x, (q) => q + 0.003 * r());
    mem.linealizar(x);
    const n = x.length / 3, B = new Float64Array(9 * n), e = new Float64Array(3 * n), col = new Float64Array(3 * n);
    mem.sumarBloquesDiagonales(B);
    for (const i of [0, Math.floor(n / 2), n - 1]) {
      for (let d = 0; d < 3; d++) {
        e.fill(0);
        e[3 * i + d] = 1;
        col.fill(0);
        mem.hessianaPor(e, col);
        for (let a = 0; a < 3; a++) expect(B[9 * i + 3 * a + d]).toBeCloseTo(col[3 * i + a], 6);
      }
    }
  });

  it('un triángulo aplastado hasta un punto no da NaN', () => {
    const { m, mem } = membranaDeLamina(1);
    const x = Float64Array.from(m.x);
    const [a, b, c] = [m.tris[0], m.tris[1], m.tris[2]];
    for (const v of [b, c]) for (let d = 0; d < 3; d++) x[3 * v + d] = x[3 * a + d];
    mem.linealizar(x);
    const g = new Float64Array(x.length), Hp = new Float64Array(x.length);
    mem.gradiente(g);
    mem.hessianaPor(Float64Array.from(x, () => 1), Hp);
    expect(g.every(Number.isFinite)).toBe(true);
    expect(Hp.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(mem.energia(x))).toBe(true);
  });
});
```

- [ ] **Step 2: Corre la prueba y mira que falla**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/membrana.test.ts`
Expected: FAIL (`Failed to resolve import "../membrana"`).

- [ ] **Step 3: Escribe `src/utils/cloth/implicito/membrana.ts`**

```ts
/**
 * La membrana de la tela (spec 2026-10-13 §4.1.3 y §4.1.4). Por triángulo
 *   E = A0·[ψ_u(|f_u| − 1) + ψ_v(|f_v| − 1) + ½·kCizalla·(f_u·f_v)²]
 * con tracción lineal por hilo y pandeo de Choi y Ko al encoger, y su hessiana de Gauss-Newton:
 * ψ''·n·nᵀ + max(ψ'/s, 0)·(I − n·nᵀ) por hilo y kCizalla·∇γ·∇γᵀ para la cizalla.
 */
import type { TelaSI } from './tela';

/**
 * ψ(ε), ψ'(ε) y ψ''(ε) por unidad de área: rigidez k hasta la carga de pandeo `pcr` (N/m) al encoger;
 * desde ahí la fuerza queda en −pcr y la tela se dobla en vez de encoger.
 */
export function ley(eps: number, k: number, pcr: number): [number, number, number] {
  const ecr = pcr / k;
  if (eps >= -ecr) return [0.5 * k * eps * eps, k * eps, k];
  return [0.5 * k * ecr * ecr + pcr * (-eps - ecr), -pcr, 0];
}

/**
 * Estado de cada triángulo tras `linealizar`: f_u(3) f_v(3) |f_u| |f_v| ψ'_u/|f_u| ψ'_v/|f_v| ψ''_u ψ''_v
 * max(ψ'_u/|f_u|, 0) max(ψ'_v/|f_v|, 0). La GPU usa la misma disposición.
 */
export const ESTADO_MEMBRANA = 14;

export class Membrana {
  readonly nt: number;
  /** carga de pandeo por triángulo (N/m) a lo ancho y a lo largo: P = pandeo·π²·B/L², con L = √(2·A0) */
  readonly pcrU: Float64Array;
  readonly pcrV: Float64Array;
  readonly estado: Float64Array;
  private readonly f = new Float64Array(6);

  constructor(readonly tris: Uint32Array, readonly coef: Float64Array, readonly tela: TelaSI) {
    this.nt = tris.length / 3;
    this.pcrU = new Float64Array(this.nt);
    this.pcrV = new Float64Array(this.nt);
    for (let t = 0; t < this.nt; t++) {
      const L2 = 2 * coef[7 * t + 6];
      this.pcrU[t] = (tela.pandeo * Math.PI * Math.PI * tela.bTrama) / L2;
      this.pcrV[t] = (tela.pandeo * Math.PI * Math.PI * tela.bUrdimbre) / L2;
    }
    this.estado = new Float64Array(ESTADO_MEMBRANA * this.nt);
  }

  /** f_u y f_v del triángulo t en las posiciones x, en `f`. */
  private columnas(t: number, x: Float64Array, f: Float64Array): void {
    const o = 7 * t, c = this.coef;
    f.fill(0);
    for (let k = 0; k < 3; k++) {
      const q = 3 * this.tris[3 * t + k], a = c[o + k], b = c[o + 3 + k];
      f[0] += a * x[q]; f[1] += a * x[q + 1]; f[2] += a * x[q + 2];
      f[3] += b * x[q]; f[4] += b * x[q + 1]; f[5] += b * x[q + 2];
    }
  }

  /** Energía del triángulo t en las posiciones x. */
  energiaDe(t: number, x: Float64Array): number {
    const f = this.f;
    this.columnas(t, x, f);
    const su = Math.hypot(f[0], f[1], f[2]), sv = Math.hypot(f[3], f[4], f[5]);
    const g = f[0] * f[3] + f[1] * f[4] + f[2] * f[5];
    const { kTrama, kUrdimbre, kCizalla } = this.tela;
    return this.coef[7 * t + 6] * (ley(su - 1, kTrama, this.pcrU[t])[0] + ley(sv - 1, kUrdimbre, this.pcrV[t])[0] + 0.5 * kCizalla * g * g);
  }

  energia(x: Float64Array): number {
    let E = 0;
    for (let t = 0; t < this.nt; t++) E += this.energiaDe(t, x);
    return E;
  }

  /** Guarda el estado de cada triángulo en las posiciones x, para el gradiente, H·p y los bloques. */
  linealizar(x: Float64Array): void {
    const f = this.f, e = this.estado, { kTrama, kUrdimbre } = this.tela;
    for (let t = 0; t < this.nt; t++) {
      this.columnas(t, x, f);
      const su = Math.hypot(f[0], f[1], f[2]), sv = Math.hypot(f[3], f[4], f[5]);
      const [, du, hu] = ley(su - 1, kTrama, this.pcrU[t]);
      const [, dv, hv] = ley(sv - 1, kUrdimbre, this.pcrV[t]);
      // un triángulo aplastado en una dirección no tiene dirección: sin fuerza ni rigidez transversal
      const gu = su > 1e-12 ? du / su : 0, gv = sv > 1e-12 ? dv / sv : 0;
      const s = ESTADO_MEMBRANA * t;
      for (let k = 0; k < 6; k++) e[s + k] = f[k];
      e[s + 6] = su; e[s + 7] = sv; e[s + 8] = gu; e[s + 9] = gv; e[s + 10] = hu; e[s + 11] = hv;
      e[s + 12] = Math.max(gu, 0); e[s + 13] = Math.max(gv, 0);
    }
  }

  /** out += ∇E, del último `linealizar`. */
  gradiente(out: Float64Array): void {
    const e = this.estado, c = this.coef, kC = this.tela.kCizalla;
    for (let t = 0; t < this.nt; t++) {
      const s = ESTADO_MEMBRANA * t, o = 7 * t, A0 = c[o + 6];
      const ux = e[s], uy = e[s + 1], uz = e[s + 2], vx = e[s + 3], vy = e[s + 4], vz = e[s + 5];
      const gu = e[s + 8], gv = e[s + 9], ks = kC * (ux * vx + uy * vy + uz * vz);
      for (let k = 0; k < 3; k++) {
        const q = 3 * this.tris[3 * t + k], a = c[o + k], b = c[o + 3 + k];
        out[q] += A0 * (gu * a * ux + gv * b * vx + ks * (a * vx + b * ux));
        out[q + 1] += A0 * (gu * a * uy + gv * b * vy + ks * (a * vy + b * uy));
        out[q + 2] += A0 * (gu * a * uz + gv * b * vz + ks * (a * vz + b * uz));
      }
    }
  }

  /** out += H·p con la hessiana de Gauss-Newton, del último `linealizar`. */
  hessianaPor(p: Float64Array, out: Float64Array): void {
    const e = this.estado, c = this.coef, kC = this.tela.kCizalla;
    for (let t = 0; t < this.nt; t++) {
      const s = ESTADO_MEMBRANA * t, o = 7 * t, A0 = c[o + 6];
      let du0 = 0, du1 = 0, du2 = 0, dv0 = 0, dv1 = 0, dv2 = 0;
      for (let k = 0; k < 3; k++) {
        const q = 3 * this.tris[3 * t + k], a = c[o + k], b = c[o + 3 + k];
        du0 += a * p[q]; du1 += a * p[q + 1]; du2 += a * p[q + 2];
        dv0 += b * p[q]; dv1 += b * p[q + 1]; dv2 += b * p[q + 2];
      }
      const ux = e[s], uy = e[s + 1], uz = e[s + 2], vx = e[s + 3], vy = e[s + 4], vz = e[s + 5];
      const su = e[s + 6], sv = e[s + 7];
      // por hilo: ψ''·(n·d)·n + max(ψ'/s, 0)·(d − (n·d)·n), con n = f/|f|
      let hu0 = 0, hu1 = 0, hu2 = 0, hv0 = 0, hv1 = 0, hv2 = 0;
      if (su > 1e-12) {
        const nx = ux / su, ny = uy / su, nz = uz / su, pn = nx * du0 + ny * du1 + nz * du2, h = e[s + 10], tr = e[s + 12];
        hu0 = h * pn * nx + tr * (du0 - pn * nx);
        hu1 = h * pn * ny + tr * (du1 - pn * ny);
        hu2 = h * pn * nz + tr * (du2 - pn * nz);
      }
      if (sv > 1e-12) {
        const nx = vx / sv, ny = vy / sv, nz = vz / sv, pn = nx * dv0 + ny * dv1 + nz * dv2, h = e[s + 11], tr = e[s + 13];
        hv0 = h * pn * nx + tr * (dv0 - pn * nx);
        hv1 = h * pn * ny + tr * (dv1 - pn * ny);
        hv2 = h * pn * nz + tr * (dv2 - pn * nz);
      }
      // cizalla: kCizalla·∇γ·(∇γ·p), con ∇γ·p = d_u·f_v + f_u·d_v
      const dg = kC * (du0 * vx + du1 * vy + du2 * vz + ux * dv0 + uy * dv1 + uz * dv2);
      for (let k = 0; k < 3; k++) {
        const q = 3 * this.tris[3 * t + k], a = c[o + k], b = c[o + 3 + k];
        out[q] += A0 * (a * hu0 + b * hv0 + dg * (a * vx + b * ux));
        out[q + 1] += A0 * (a * hu1 + b * hv1 + dg * (a * vy + b * uy));
        out[q + 2] += A0 * (a * hu2 + b * hv2 + dg * (a * vz + b * uz));
      }
    }
  }

  /** M[o..o+8] += el bloque (li, lj) de la hessiana del triángulo t (fila mayor). */
  sumarBloque(t: number, li: number, lj: number, M: Float64Array, o = 0): void {
    const e = this.estado, s = ESTADO_MEMBRANA * t, c = this.coef, oc = 7 * t, A0 = c[oc + 6];
    const ai = c[oc + li], bi = c[oc + 3 + li], aj = c[oc + lj], bj = c[oc + 3 + lj];
    const su = e[s + 6], sv = e[s + 7], kC = this.tela.kCizalla;
    const nu = [0, 1, 2].map((d) => (su > 1e-12 ? e[s + d] / su : 0));
    const nv = [0, 1, 2].map((d) => (sv > 1e-12 ? e[s + 3 + d] / sv : 0));
    const di = [0, 1, 2].map((d) => ai * e[s + 3 + d] + bi * e[s + d]);
    const dj = [0, 1, 2].map((d) => aj * e[s + 3 + d] + bj * e[s + d]);
    for (let r = 0; r < 3; r++) {
      for (let q = 0; q < 3; q++) {
        const id = r === q ? 1 : 0;
        const Hu = (e[s + 10] - e[s + 12]) * nu[r] * nu[q] + e[s + 12] * id;
        const Hv = (e[s + 11] - e[s + 13]) * nv[r] * nv[q] + e[s + 13] * id;
        M[o + 3 * r + q] += A0 * (ai * aj * Hu + bi * bj * Hv + kC * di[r] * dj[q]);
      }
    }
  }

  /** out[9i..9i+8] += el bloque diagonal de cada vértice. */
  sumarBloquesDiagonales(out: Float64Array): void {
    for (let t = 0; t < this.nt; t++) for (let j = 0; j < 3; j++) this.sumarBloque(t, j, j, out, 9 * this.tris[3 * t + j]);
  }
}
```

- [ ] **Step 4: Corre la prueba y mira que pasa**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/membrana.test.ts`
Expected: PASS, 9 pruebas.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/membrana.ts src/utils/cloth/implicito/__tests__/membrana.test.ts src/utils/cloth/implicito/__tests__/ayudas.ts
git commit -m "feat(tela): membrana con tracción por hilo, cizalla y pandeo de Choi y Ko" -m "Energía por triángulo en el marco del hilo, con su gradiente, el producto por la hessiana de Gauss-Newton y los bloques 3×3. Al encoger, cada hilo resiste igual que al estirar hasta su carga de pandeo P = pandeo·π²·B/L², y desde ahí la fuerza queda constante."
```

---
### Tarea 5: La flexión de placa

**Files:**
- Create: `src/utils/cloth/implicito/placa.ts`
- Test: `src/utils/cloth/implicito/__tests__/placa.test.ts`

**Interfaces:**
- Consumes: `TelaSI` (Tarea 1); `aMarcoDelHilo`, `laminaPlana`, `TELA_DE_LABORATORIO` (Tarea 1); `azar`, `errorDelGradiente`, `errorDeHessiana` (Tarea 4); `dihedralAngle(pos: Float32Array, a, b, c, d): number | null` (`src/utils/cloth/dihedral.ts`, solo en la prueba).
- Produces: `anguloYGradiente(x: Float64Array, a, b, c, d, grad: Float64Array): number | null`; `class Placa`, con `constructor(uv: Float64Array, tris: Uint32Array, tela: TelaSI)`, los campos `bisagras: Uint32Array` (a b c d por bisagra), `bisDeTri: Int32Array` (3 por triángulo, −1 = borde libre), `K: Float64Array` (9 por triángulo), `nh: number` y `estado: Float64Array` (13 por bisagra: θ y ∇θ), y los métodos `linealizar(x)`, `energia(x): number`, `energiaDe(t, th: Float64Array): number`, `gradiente(out)` (suma), `hessianaPor(p, out)` (suma), `plantilla(t): number[]`, `sumarBloque(t, i, j, M, o = 0)` (suma, fila mayor) y `sumarBloquesDiagonales(out)` (suma).

- [ ] **Step 1: Escribe la prueba que falla**

`src/utils/cloth/implicito/__tests__/placa.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dihedralAngle } from '../../dihedral';
import { aMarcoDelHilo, type MallaDeTela } from '../malla';
import { anguloYGradiente, Placa } from '../placa';
import { telaSI } from '../tela';
import { laminaPlana, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, errorDeHessiana, errorDelGradiente } from './ayudas';

const R = 0.05;
const tela = telaSI(TELA_DE_LABORATORIO);

/** Enrolla la lámina sobre un cilindro de radio R, sin estirarla; la curvatura va en la dirección `dir` del dibujo. */
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

describe('la placa', () => {
  it('el gradiente del ángulo coincide con diferencias finitas', () => {
    const r = azar(7), g = new Float64Array(12), g2 = new Float64Array(12);
    let peor = 0;
    for (let caso = 0; caso < 50; caso++) {
      const x = Float64Array.from({ length: 12 }, () => r());
      const th = anguloYGradiente(x, 0, 1, 2, 3, g);
      if (th === null || Math.abs(Math.abs(th) - Math.PI) < 0.2) continue;
      for (let k = 0; k < 12; k++) {
        const h = 1e-6, xp = Float64Array.from(x), xm = Float64Array.from(x);
        xp[k] += h;
        xm[k] -= h;
        const num = ((anguloYGradiente(xp, 0, 1, 2, 3, g2) ?? 0) - (anguloYGradiente(xm, 0, 1, 2, 3, g2) ?? 0)) / (2 * h);
        peor = Math.max(peor, Math.abs(num - g[k]) / (1 + Math.abs(num)));
      }
    }
    expect(peor).toBeLessThan(1e-5);
  });

  it('el ángulo es el de dihedral.ts, con la misma convención de signo', () => {
    const r = azar(9), g = new Float64Array(12);
    let comparados = 0;
    for (let caso = 0; caso < 20; caso++) {
      const x = Float64Array.from({ length: 12 }, () => r());
      const a = anguloYGradiente(x, 0, 1, 2, 3, g), b = dihedralAngle(Float32Array.from(x), 0, 1, 2, 3);
      if (a === null || b === null || Math.abs(a) > Math.PI - 0.1) continue;
      expect(a).toBeCloseTo(b, 4);
      comparados++;
    }
    expect(comparados).toBeGreaterThan(10);
  });

  const casos = [
    ['a lo ancho', [1, 0], tela.bTrama],
    ['a lo largo', [0, 1], tela.bUrdimbre],
    ['al bies', [Math.SQRT1_2, Math.SQRT1_2], tela.bBies],
  ] as const;
  for (const [nombre, dir, B] of casos) {
    for (const arista of [2.5, 5, 10]) {
      it(`lámina sobre un cilindro, curvatura ${nombre}, malla de ${arista} mm: entre 0,85 y 1,05 de la energía exacta`, () => {
        const m = laminaPlana(arista);
        const placa = new Placa(aMarcoDelHilo(m.patron), m.tris, tela);
        const razon = placa.energia(curvar(m, dir)) / (0.5 * B * (1 / R) ** 2 * 0.12 * 0.12);
        expect(razon).toBeGreaterThan(0.85);
        expect(razon).toBeLessThan(1.05);
      });
    }
  }

  it('con la urdimbre a lo largo del eje x del dibujo, curvar a lo largo de x pide bUrdimbre', () => {
    const m = laminaPlana(5);
    const placa = new Placa(aMarcoDelHilo(m.patron, [1, 0]), m.tris, tela);
    const razon = placa.energia(curvar(m, [1, 0])) / (0.5 * tela.bUrdimbre * (1 / R) ** 2 * 0.12 * 0.12);
    expect(razon).toBeGreaterThan(0.85);
    expect(razon).toBeLessThan(1.05);
  });

  it('fuerza de flexión = −∂E/∂x por diferencias finitas', () => {
    const m = laminaPlana(20);
    const placa = new Placa(aMarcoDelHilo(m.patron), m.tris, tela);
    const r = azar(13), x = Float64Array.from(m.x, (q, k) => (k % 3 === 1 ? q + 0.004 * r() : q));
    placa.linealizar(x);
    const g = new Float64Array(x.length);
    placa.gradiente(g);
    expect(errorDelGradiente((y) => placa.energia(y), g, x)).toBeLessThan(1e-4);
  });

  it('en la lámina plana la hessiana de Gauss-Newton es la exacta', () => {
    const m = laminaPlana(20);
    const placa = new Placa(aMarcoDelHilo(m.patron), m.tris, tela);
    const x = Float64Array.from(m.x);
    const r = azar(17), p = Float64Array.from(x, () => r());
    placa.linealizar(x);
    const Hp = new Float64Array(x.length);
    placa.hessianaPor(p, Hp);
    const gradiente = (y: Float64Array, out: Float64Array) => {
      out.fill(0);
      placa.linealizar(y);
      placa.gradiente(out);
    };
    expect(errorDeHessiana(gradiente, Hp, x, p)).toBeLessThan(1e-4);
  });

  it('la hessiana no es negativa y sus bloques diagonales son los de H·p', () => {
    const m = laminaPlana(20);
    const placa = new Placa(aMarcoDelHilo(m.patron), m.tris, tela);
    const r = azar(19), x = Float64Array.from(m.x, (q, k) => (k % 3 === 1 ? q + 0.004 * r() : q));
    placa.linealizar(x);
    const n = x.length / 3, Hp = new Float64Array(3 * n);
    for (let caso = 0; caso < 10; caso++) {
      const p = Float64Array.from(x, () => r());
      Hp.fill(0);
      placa.hessianaPor(p, Hp);
      expect(p.reduce((s, q, k) => s + q * Hp[k], 0)).toBeGreaterThanOrEqual(0);
    }
    const B = new Float64Array(9 * n), e = new Float64Array(3 * n), col = new Float64Array(3 * n);
    placa.sumarBloquesDiagonales(B);
    for (const i of [0, Math.floor(n / 2), n - 1]) {
      for (let d = 0; d < 3; d++) {
        e.fill(0);
        e[3 * i + d] = 1;
        col.fill(0);
        placa.hessianaPor(e, col);
        for (let a = 0; a < 3; a++) expect(B[9 * i + 3 * a + d]).toBeCloseTo(col[3 * i + a], 9);
      }
    }
  });
});
```

- [ ] **Step 2: Corre la prueba y mira que falla**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/placa.test.ts`
Expected: FAIL (`Failed to resolve import "../placa"`).

- [ ] **Step 3: Escribe `src/utils/cloth/implicito/placa.ts`**

```ts
/**
 * La flexión de la tela (spec 2026-10-13 §4.1.5): placa ortótropa por triángulo. La curvatura
 * s = (κuu, κuv, κvv) de cada triángulo sale de los ángulos entre caras de sus bordes interiores,
 * θ_k ≈ g_k·s con g_k = t_kᵀ·(J_N − J_T), y la energía es E = ½·θᵀKθ con K = A0·(G·D⁻¹·Gᵀ)⁻¹: la mínima
 * compatible con esos ángulos (un borde libre no lleva momento). K se calcula una vez, en el patrón; la
 * hessiana de Gauss-Newton es Σ K_kl·∇θ_k·∇θ_lᵀ.
 */
import type { TelaSI } from './tela';

/**
 * Ángulo entre caras con signo (plano = 0) de la bisagra a-b con alas c y d, y su gradiente respecto de
 * a, b, c y d en `grad` (12 números). Misma convención que dihedral.ts, en doble precisión y con mínimos
 * pensados para mallas de 1 mm (los de dihedral.ts son de precisión simple). null si es degenerada.
 */
export function anguloYGradiente(x: Float64Array, a: number, b: number, c: number, d: number, grad: Float64Array): number | null {
  const ax = x[3 * a], ay = x[3 * a + 1], az = x[3 * a + 2];
  const bx = x[3 * b], by = x[3 * b + 1], bz = x[3 * b + 2];
  const cx = x[3 * c], cy = x[3 * c + 1], cz = x[3 * c + 2];
  const dx = x[3 * d], dy = x[3 * d + 1], dz = x[3 * d + 2];
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const e2 = ex * ex + ey * ey + ez * ez;
  if (e2 < 1e-16) return null;
  const el = Math.sqrt(e2);
  // n1 = (a − c) × (b − c) y n2 = (b − d) × (a − d), como en dihedral.ts
  const acx = ax - cx, acy = ay - cy, acz = az - cz, bcx = bx - cx, bcy = by - cy, bcz = bz - cz;
  const n1x = acy * bcz - acz * bcy, n1y = acz * bcx - acx * bcz, n1z = acx * bcy - acy * bcx;
  const bdx = bx - dx, bdy = by - dy, bdz = bz - dz, adx = ax - dx, ady = ay - dy, adz = az - dz;
  const n2x = bdy * adz - bdz * ady, n2y = bdz * adx - bdx * adz, n2z = bdx * ady - bdy * adx;
  const n1s = n1x * n1x + n1y * n1y + n1z * n1z, n2s = n2x * n2x + n2y * n2y + n2z * n2z;
  if (n1s < 1e-24 || n2s < 1e-24) return null;
  const i1 = 1 / Math.sqrt(n1s), i2 = 1 / Math.sqrt(n2s);
  const u1x = n1x * i1, u1y = n1y * i1, u1z = n1z * i1, u2x = n2x * i2, u2y = n2y * i2, u2z = n2z * i2;
  const cosT = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y + u1z * u2z));
  const sinT = ((u1y * u2z - u1z * u2y) * ex + (u1z * u2x - u1x * u2z) * ey + (u1x * u2y - u1y * u2x) * ez) / el;
  // gradientes de Bridson: las alas van con ±|e|·n/|n|²; el eje, con las proyecciones de las alas sobre e
  const g1x = n1x / n1s, g1y = n1y / n1s, g1z = n1z / n1s, g2x = n2x / n2s, g2y = n2y / n2s, g2z = n2z / n2s;
  const cb = ((cx - bx) * ex + (cy - by) * ey + (cz - bz) * ez) / el;
  const db = ((dx - bx) * ex + (dy - by) * ey + (dz - bz) * ez) / el;
  const ac = ((ax - cx) * ex + (ay - cy) * ey + (az - cz) * ez) / el;
  const ad = ((ax - dx) * ex + (ay - dy) * ey + (az - dz) * ez) / el;
  grad[0] = -(g1x * cb + g2x * db); grad[1] = -(g1y * cb + g2y * db); grad[2] = -(g1z * cb + g2z * db);
  grad[3] = -(g1x * ac + g2x * ad); grad[4] = -(g1y * ac + g2y * ad); grad[5] = -(g1z * ac + g2z * ad);
  grad[6] = -g1x * el; grad[7] = -g1y * el; grad[8] = -g1z * el;
  grad[9] = -g2x * el; grad[10] = -g2y * el; grad[11] = -g2z * el;
  return Math.atan2(sinT, cosT);
}

/** Inversa de una matriz simétrica de 1×1 a 3×3; null si es singular. */
function invertir(M: number[][]): number[][] | null {
  let R: number[][];
  if (M.length === 1) R = [[1 / M[0][0]]];
  else if (M.length === 2) {
    const d = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    R = [[M[1][1] / d, -M[0][1] / d], [-M[1][0] / d, M[0][0] / d]];
  } else {
    const [[a, b, c], [d, e, f], [g, h, k]] = M;
    const A = e * k - f * h, B = -(d * k - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    R = [
      [A / det, -(b * k - c * h) / det, (b * f - c * e) / det],
      [B / det, (a * k - c * g) / det, -(a * f - c * d) / det],
      [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
    ];
  }
  return R.every((fila) => fila.every(Number.isFinite)) ? R : null;
}

export class Placa {
  /** a b c d por bisagra; a→b va en el sentido del triángulo que tiene el ala c, así todas usan la misma convención */
  readonly bisagras: Uint32Array;
  /** por triángulo y borde k (de tris[3t+k] a tris[3t+(k+1)%3]): su bisagra, o −1 si es borde libre */
  readonly bisDeTri: Int32Array;
  /** por triángulo, K de 3×3 (fila mayor) indexado por borde; ceros en los bordes libres */
  readonly K: Float64Array;
  readonly nh: number;
  /** por bisagra: θ y ∇θ respecto de a, b, c y d (13 números), del último `linealizar` */
  readonly estado: Float64Array;
  private readonly g = new Float64Array(12);
  private readonly th = new Float64Array(3);
  private readonly gi = new Float64Array(9);
  private readonly gj = new Float64Array(9);

  constructor(uv: Float64Array, readonly tris: Uint32Array, tela: TelaSI) {
    const nt = tris.length / 3, n = uv.length / 2;
    const clave = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
    const deArista = new Map<number, Array<[number, number]>>();
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) {
        const key = clave(tris[3 * t + k], tris[3 * t + ((k + 1) % 3)]);
        const lista = deArista.get(key);
        if (lista) lista.push([t, k]);
        else deArista.set(key, [[t, k]]);
      }
    }
    const tercero = (t: number, a: number, b: number) => {
      for (let k = 0; k < 3; k++) {
        const v = tris[3 * t + k];
        if (v !== a && v !== b) return v;
      }
      return -1;
    };
    const bis: number[] = [];
    const bisDeArista = new Map<number, number>();
    for (const [key, lista] of deArista) {
      if (lista.length !== 2) continue;
      const [t0, k0] = lista[0];
      const a = tris[3 * t0 + k0], b = tris[3 * t0 + ((k0 + 1) % 3)];
      bisDeArista.set(key, bis.length / 4);
      bis.push(a, b, tercero(t0, a, b), tercero(lista[1][0], a, b));
    }
    this.bisagras = Uint32Array.from(bis);
    this.nh = bis.length / 4;
    this.estado = new Float64Array(13 * this.nh);
    this.bisDeTri = new Int32Array(3 * nt).fill(-1);
    this.K = new Float64Array(9 * nt);

    // pendiente exacta de cada triángulo plano sobre h = ½·pᵀ·S·p: ∇L_T = J_T·s (J_T de 2×3), con el origen
    // común de toda la pieza para que la diferencia entre vecinos no pierda el término lineal
    const J = new Float64Array(6 * nt), A0 = new Float64Array(nt);
    for (let t = 0; t < nt; t++) {
      const p0 = tris[3 * t];
      const q: number[][] = [], fil: number[][] = [];
      for (let j = 1; j <= 2; j++) {
        const pj = tris[3 * t + j];
        const qu = uv[2 * pj] - uv[2 * p0], qv = uv[2 * pj + 1] - uv[2 * p0 + 1];
        const ru = uv[2 * pj] + uv[2 * p0], rv = uv[2 * pj + 1] + uv[2 * p0 + 1];
        q.push([qu, qv]);
        fil.push([0.5 * qu * ru, 0.5 * (qu * rv + qv * ru), 0.5 * qv * rv]);
      }
      // ∇L·q_j = fil_j·s  ⇒  ∇L = (Qᵀ)⁻¹·fil·s
      const det = q[0][0] * q[1][1] - q[0][1] * q[1][0];
      A0[t] = Math.abs(det) / 2;
      const i00 = q[1][1] / det, i01 = -q[0][1] / det, i10 = -q[1][0] / det, i11 = q[0][0] / det;
      for (let c = 0; c < 3; c++) {
        J[6 * t + c] = i00 * fil[0][c] + i01 * fil[1][c];
        J[6 * t + 3 + c] = i10 * fil[0][c] + i11 * fil[1][c];
      }
    }
    const centro = (t: number): [number, number] => {
      let cu = 0, cv = 0;
      for (let k = 0; k < 3; k++) {
        const p = tris[3 * t + k];
        cu += uv[2 * p] / 3;
        cv += uv[2 * p + 1] / 3;
      }
      return [cu, cv];
    };
    const { bTrama: bu, bUrdimbre: bv, bBies: bb } = tela;
    const D66 = Math.max(1e-3 * Math.min(bu, bv), bb - (bu + bv) / 4);
    const Dinv = [1 / bu, 1 / (4 * D66), 1 / bv];
    for (let t = 0; t < nt; t++) {
      const [cu, cv] = centro(t);
      const filas: number[][] = [], cuales: number[] = [];
      for (let k = 0; k < 3; k++) {
        const pa = tris[3 * t + k], pb = tris[3 * t + ((k + 1) % 3)];
        const key = clave(pa, pb), e = bisDeArista.get(key), lista = deArista.get(key);
        if (e === undefined || !lista) continue;
        const vecino = lista[0][0] === t ? lista[1][0] : lista[0][0];
        const [nu, nv] = centro(vecino);
        // normal del borde en el patrón, hacia el vecino
        let tu = -(uv[2 * pb + 1] - uv[2 * pa + 1]), tv = uv[2 * pb] - uv[2 * pa];
        const tl = Math.hypot(tu, tv);
        tu /= tl;
        tv /= tl;
        if (tu * (nu - cu) + tv * (nv - cv) < 0) {
          tu = -tu;
          tv = -tv;
        }
        filas.push([0, 1, 2].map((c) => tu * (J[6 * vecino + c] - J[6 * t + c]) + tv * (J[6 * vecino + 3 + c] - J[6 * t + 3 + c])));
        cuales.push(k);
        this.bisDeTri[3 * t + k] = e;
      }
      if (filas.length === 0) continue;
      const M = filas.map((gi) => filas.map((gj) => gi[0] * gj[0] * Dinv[0] + gi[1] * gj[1] * Dinv[1] + gi[2] * gj[2] * Dinv[2]));
      const Mi = invertir(M);
      // si sus bordes no miden curvaturas independientes, el triángulo queda sin flexión propia
      if (!Mi) continue;
      for (let r = 0; r < filas.length; r++) {
        for (let c = 0; c < filas.length; c++) this.K[9 * t + 3 * cuales[r] + cuales[c]] = A0[t] * Mi[r][c];
      }
    }
  }

  /** θ y ∇θ de cada bisagra en las posiciones x. */
  linealizar(x: Float64Array): void {
    const g = this.g, e = this.estado;
    for (let h = 0; h < this.nh; h++) {
      const q = 4 * h, s = 13 * h;
      const th = anguloYGradiente(x, this.bisagras[q], this.bisagras[q + 1], this.bisagras[q + 2], this.bisagras[q + 3], g);
      e[s] = th ?? 0;
      for (let k = 0; k < 12; k++) e[s + 1 + k] = th === null ? 0 : g[k];
    }
  }

  /** ½·θᵀKθ del triángulo t con `th`, el ángulo de cada bisagra. */
  energiaDe(t: number, th: Float64Array): number {
    const v = this.th;
    for (let k = 0; k < 3; k++) {
      const h = this.bisDeTri[3 * t + k];
      v[k] = h < 0 ? 0 : th[h];
    }
    let E = 0;
    for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) E += 0.5 * this.K[9 * t + 3 * k + l] * v[k] * v[l];
    return E;
  }

  /** Energía de flexión en las posiciones x. */
  energia(x: Float64Array): number {
    const th = new Float64Array(this.nh);
    for (let h = 0; h < this.nh; h++) {
      const q = 4 * h;
      th[h] = anguloYGradiente(x, this.bisagras[q], this.bisagras[q + 1], this.bisagras[q + 2], this.bisagras[q + 3], this.g) ?? 0;
    }
    let E = 0;
    for (let t = 0; t < this.tris.length / 3; t++) E += this.energiaDe(t, th);
    return E;
  }

  /** out += ∇E, del último `linealizar`. */
  gradiente(out: Float64Array): void {
    const e = this.estado, v = this.th;
    for (let t = 0; t < this.tris.length / 3; t++) {
      for (let k = 0; k < 3; k++) {
        const h = this.bisDeTri[3 * t + k];
        v[k] = h < 0 ? 0 : e[13 * h];
      }
      for (let k = 0; k < 3; k++) {
        const h = this.bisDeTri[3 * t + k];
        if (h < 0) continue;
        const w = this.K[9 * t + 3 * k] * v[0] + this.K[9 * t + 3 * k + 1] * v[1] + this.K[9 * t + 3 * k + 2] * v[2];
        if (w === 0) continue;
        for (let r = 0; r < 4; r++) {
          const q = 3 * this.bisagras[4 * h + r], s = 13 * h + 1 + 3 * r;
          out[q] += w * e[s];
          out[q + 1] += w * e[s + 1];
          out[q + 2] += w * e[s + 2];
        }
      }
    }
  }

  /** out += H·p con la hessiana de Gauss-Newton, del último `linealizar`. */
  hessianaPor(p: Float64Array, out: Float64Array): void {
    const e = this.estado, jp = this.th;
    for (let t = 0; t < this.tris.length / 3; t++) {
      for (let k = 0; k < 3; k++) {
        jp[k] = 0;
        const h = this.bisDeTri[3 * t + k];
        if (h < 0) continue;
        for (let r = 0; r < 4; r++) {
          const q = 3 * this.bisagras[4 * h + r], s = 13 * h + 1 + 3 * r;
          jp[k] += e[s] * p[q] + e[s + 1] * p[q + 1] + e[s + 2] * p[q + 2];
        }
      }
      for (let k = 0; k < 3; k++) {
        const h = this.bisDeTri[3 * t + k];
        if (h < 0) continue;
        const w = this.K[9 * t + 3 * k] * jp[0] + this.K[9 * t + 3 * k + 1] * jp[1] + this.K[9 * t + 3 * k + 2] * jp[2];
        if (w === 0) continue;
        for (let r = 0; r < 4; r++) {
          const q = 3 * this.bisagras[4 * h + r], s = 13 * h + 1 + 3 * r;
          out[q] += w * e[s];
          out[q + 1] += w * e[s + 1];
          out[q + 2] += w * e[s + 2];
        }
      }
    }
  }

  /** Los vértices de las bisagras del triángulo t, sin repetir: los que toca su flexión. */
  plantilla(t: number): number[] {
    const s = new Set<number>();
    for (let k = 0; k < 3; k++) {
      const h = this.bisDeTri[3 * t + k];
      if (h >= 0) for (let r = 0; r < 4; r++) s.add(this.bisagras[4 * h + r]);
    }
    return [...s];
  }

  /** M[o..o+8] += Σ K_kl·g_k(i)·g_l(j)ᵀ del triángulo t (fila mayor), del último `linealizar`. */
  sumarBloque(t: number, i: number, j: number, M: Float64Array, o = 0): void {
    const gi = this.gi, gj = this.gj, e = this.estado;
    gi.fill(0);
    gj.fill(0);
    for (let k = 0; k < 3; k++) {
      const h = this.bisDeTri[3 * t + k];
      if (h < 0) continue;
      for (let r = 0; r < 4; r++) {
        const v = this.bisagras[4 * h + r], s = 13 * h + 1 + 3 * r;
        if (v === i) for (let d = 0; d < 3; d++) gi[3 * k + d] = e[s + d];
        if (v === j) for (let d = 0; d < 3; d++) gj[3 * k + d] = e[s + d];
      }
    }
    for (let k = 0; k < 3; k++) {
      for (let l = 0; l < 3; l++) {
        const c = this.K[9 * t + 3 * k + l];
        if (c === 0) continue;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[o + 3 * a + b] += c * gi[3 * k + a] * gj[3 * l + b];
      }
    }
  }

  /** out[9v..9v+8] += el bloque diagonal de flexión de cada vértice. */
  sumarBloquesDiagonales(out: Float64Array): void {
    for (let t = 0; t < this.tris.length / 3; t++) for (const v of this.plantilla(t)) this.sumarBloque(t, v, v, out, 9 * v);
  }
}
```

- [ ] **Step 4: Corre la prueba y mira que pasa**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/placa.test.ts`
Expected: PASS, 15 pruebas. Si el cilindro da fuera de [0,85, 1,05], revisa primero el origen común de `J` y la normal del borde hacia el vecino: la prueba corta midió 0,97, 0,94 y 0,88 con 2,5, 5 y 10 mm.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/placa.ts src/utils/cloth/implicito/__tests__/placa.test.ts
git commit -m "feat(tela): flexión de placa por triángulo con trama, urdimbre y bies" -m "La curvatura de cada triángulo sale de los ángulos entre caras de sus bordes interiores con la pendiente exacta en el patrón, y la energía es la mínima compatible con esos ángulos para una placa ortótropa. Sobre un cilindro da entre 0,85 y 1,05 de la energía exacta con mallas de 2,5 a 10 mm, a lo ancho, a lo largo y al bies."
```

---
### Tarea 6: El sistema de un cuadro

**Files:**
- Create: `src/utils/cloth/implicito/sistema.ts`
- Test: `src/utils/cloth/implicito/__tests__/sistema.test.ts`

**Interfaces:**
- Consumes: `MallaDeTela`, `aMarcoDelHilo`, `TelaFisica`, `telaSI`, `separacion`, `Obstaculo`, `masCercano` (Tarea 1); `prepararReposo` (Tarea 3); `Membrana` (Tarea 4); `Placa` (Tarea 5).
- Produces: `interface AjustesImplicito { h; gravedad; aire; kContacto; maxCG; tolCG; anticipar: boolean; busqueda: boolean }`; `AJUSTES_IMPLICITO`; `interface OpcionesSistema { ajustes?: Partial<AjustesImplicito>; obstaculos?: Obstaculo[]; hilo?: readonly [number, number] }`; `interface ContactoActivo { i; k; nx; ny; nz; p0 }`; `class SistemaTela`, con `constructor(malla: MallaDeTela, tela: TelaFisica, op?: OpcionesSistema)`, los campos `n`, `tela: TelaSI`, `aj`, `obstaculos`, `sep`, `tris`, `coef`, `masa`, `fijo: Uint8Array`, `membrana`, `placa`, `x`, `xt` y `v` (`Float64Array`), y los métodos `prediccion(i, d): number`, `energiaVertice(i, x): number`, `energiaElastica(x?): number`, `energiaIncremental(x?): number`, `linealizar(): void`, `gradienteElastico(out): void` (escribe), `hessianaPor(p, out): void` (escribe), `bloquesDiagonales(out): void` (escribe), `contactosActuales(): ContactoActivo[]` y `residuo(contactos, out): void` (escribe −∇G).

- [ ] **Step 1: Escribe la prueba que falla**

`src/utils/cloth/implicito/__tests__/sistema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../sistema';
import { laminaPlana, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, errorDelGradiente } from './ayudas';

describe('el sistema de un cuadro', () => {
  it('residuo = −∂G/∂x con inercia, aire y elástica (diferencias finitas)', () => {
    const s = new SistemaTela(laminaPlana(20), TELA_DE_LABORATORIO);
    const r = azar(21);
    for (let q = 0; q < s.x.length; q++) {
      s.x[q] += 0.003 * r();
      s.xt[q] = s.x[q] + 0.001 * r();
      s.v[q] = 0.2 * r();
    }
    s.linealizar();
    const res = new Float64Array(s.x.length);
    s.residuo([], res);
    expect(errorDelGradiente((x) => s.energiaIncremental(x), res.map((q) => -q), s.x)).toBeLessThan(1e-4);
  });

  it('al empezar el paso, el contacto entra con su normal', () => {
    const s = new SistemaTela(laminaPlana(20), TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    const r = azar(23);
    // ±0,25 mm: todos los vértices quedan a menos de la separación del suelo (1,25 mm)
    for (let q = 0; q < s.x.length; q++) s.x[q] += 0.0005 * r();
    s.xt.set(s.x);
    s.linealizar();
    const contactos = s.contactosActuales();
    expect(contactos.length).toBe(s.n);
    const res = new Float64Array(s.x.length);
    s.residuo(contactos, res);
    expect(errorDelGradiente((x) => s.energiaIncremental(x), res.map((q) => -q), s.x)).toBeLessThan(1e-4);
  });

  it('los empotrados no reciben fuerza ni contacto', () => {
    const m = laminaPlana(20);
    m.fijos = new Uint8Array(m.x.length / 3);
    m.fijos[0] = 1;
    const s = new SistemaTela(m, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    s.linealizar();
    const res = new Float64Array(s.x.length);
    s.residuo(s.contactosActuales(), res);
    expect([res[0], res[1], res[2]]).toEqual([0, 0, 0]);
    expect(s.contactosActuales().some((c) => c.i === 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Corre la prueba y mira que falla**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/sistema.test.ts`
Expected: FAIL (`Failed to resolve import "../sistema"`).

- [ ] **Step 3: Escribe `src/utils/cloth/implicito/sistema.ts`**

```ts
/**
 * El sistema de un cuadro del motor implícito (spec 2026-10-13 §4.2.1): la tela en el patrón (membrana y
 * placa), las masas, los obstáculos y el estado. El cuadro minimiza
 *   G(x) = ½·|x − y|²_M / h² + ½·aire·|x − x_t|²_M / h + E(x) + contacto,  con y = x_t + h·v_t + h²·g.
 */
import { aMarcoDelHilo, type MallaDeTela } from './malla';
import { Membrana } from './membrana';
import { masCercano, type Obstaculo } from './obstaculos';
import { Placa } from './placa';
import { prepararReposo } from './reposo';
import { separacion, telaSI, type TelaFisica, type TelaSI } from './tela';

export interface AjustesImplicito {
  /** s por cuadro */
  h: number;
  /** m/s², en y */
  gravedad: number;
  /** amortiguamiento del aire, proporcional a la masa (1/s) */
  aire: number;
  /** rigidez del contacto con los obstáculos (N/m) */
  kContacto: number;
  /** iteraciones de gradiente conjugado por ronda */
  maxCG: number;
  /** tolerancia relativa: se para cuando rᵀz ≤ tolCG²·r0ᵀz0 */
  tolCG: number;
  /** agrega los contactos que el paso va a crear y resuelve otra vez (§4.2.1, paso 4) */
  anticipar: boolean;
  /** búsqueda en línea sobre G (§4.2.1, paso 5) */
  busqueda: boolean;
}

export const AJUSTES_IMPLICITO: AjustesImplicito = {
  h: 1 / 60,
  gravedad: -9.81,
  aire: 1,
  kContacto: 2000,
  maxCG: 50,
  tolCG: 1e-4,
  anticipar: true,
  busqueda: true,
};

export interface OpcionesSistema {
  ajustes?: Partial<AjustesImplicito>;
  obstaculos?: Obstaculo[];
  /** dirección de la urdimbre en el dibujo; por defecto, vertical (§4.1.2) */
  hilo?: readonly [number, number];
}

/** Un vértice en contacto: obstáculo k, su normal y la penetración p0 = separación − distancia al empezar el paso. */
export interface ContactoActivo {
  i: number;
  k: number;
  nx: number;
  ny: number;
  nz: number;
  p0: number;
}

export class SistemaTela {
  readonly n: number;
  readonly tela: TelaSI;
  readonly aj: AjustesImplicito;
  readonly obstaculos: Obstaculo[];
  /** distancia que la tela guarda a los obstáculos (m) */
  readonly sep: number;
  readonly tris: Uint32Array;
  readonly coef: Float64Array;
  readonly masa: Float64Array;
  readonly fijo: Uint8Array;
  readonly membrana: Membrana;
  readonly placa: Placa;
  /** posiciones */
  readonly x: Float64Array;
  /** posiciones al empezar el paso */
  readonly xt: Float64Array;
  /** velocidades */
  readonly v: Float64Array;

  constructor(malla: MallaDeTela, tela: TelaFisica, op: OpcionesSistema = {}) {
    this.n = malla.x.length / 3;
    this.tela = telaSI(tela);
    this.aj = { ...AJUSTES_IMPLICITO, ...op.ajustes };
    this.obstaculos = op.obstaculos ?? [];
    this.sep = separacion(this.tela);
    this.tris = malla.tris;
    const uv = aMarcoDelHilo(malla.patron, op.hilo);
    const reposo = prepararReposo(uv, malla.tris, this.tela.densidad);
    this.coef = reposo.coef;
    this.masa = reposo.masa;
    this.fijo = malla.fijos ? Uint8Array.from(malla.fijos) : new Uint8Array(this.n);
    this.membrana = new Membrana(malla.tris, this.coef, this.tela);
    this.placa = new Placa(uv, malla.tris, this.tela);
    this.x = Float64Array.from(malla.x);
    this.xt = Float64Array.from(malla.x);
    this.v = new Float64Array(3 * this.n);
  }

  /** La coordenada d de y = x_t + h·v + h²·g del vértice i; un empotrado no se mueve. */
  prediccion(i: number, d: number): number {
    const q = 3 * i + d;
    if (this.fijo[i]) return this.xt[q];
    const { h, gravedad } = this.aj;
    return this.xt[q] + h * this.v[q] + (d === 1 ? h * h * gravedad : 0);
  }

  /** Inercia, aire y contacto del vértice i en las posiciones x. */
  energiaVertice(i: number, x: Float64Array): number {
    const { h, aire, kContacto } = this.aj, m = this.masa[i];
    let E = 0;
    for (let d = 0; d < 3; d++) {
      const q = x[3 * i + d];
      E += (m / (2 * h * h)) * (q - this.prediccion(i, d)) ** 2 + ((aire * m) / (2 * h)) * (q - this.xt[3 * i + d]) ** 2;
    }
    const c = masCercano(this.obstaculos, x[3 * i], x[3 * i + 1], x[3 * i + 2]);
    const p = c === null ? 0 : this.sep - c.d;
    return p > 0 ? E + 0.5 * kContacto * p * p : E;
  }

  energiaElastica(x: Float64Array = this.x): number {
    return this.membrana.energia(x) + this.placa.energia(x);
  }

  /** G(x) del cuadro en curso. */
  energiaIncremental(x: Float64Array = this.x): number {
    let E = this.energiaElastica(x);
    for (let i = 0; i < this.n; i++) E += this.energiaVertice(i, x);
    return E;
  }

  /** Linealiza la membrana y la placa en las posiciones actuales. */
  linealizar(): void {
    this.membrana.linealizar(this.x);
    this.placa.linealizar(this.x);
  }

  /** out = ∇E elástica, del último `linealizar`. */
  gradienteElastico(out: Float64Array): void {
    out.fill(0);
    this.membrana.gradiente(out);
    this.placa.gradiente(out);
  }

  /** out = H·p elástica de Gauss-Newton, del último `linealizar`. */
  hessianaPor(p: Float64Array, out: Float64Array): void {
    out.fill(0);
    this.membrana.hessianaPor(p, out);
    this.placa.hessianaPor(p, out);
  }

  /** out = los bloques 3×3 de la diagonal de la hessiana elástica (9 por vértice, fila mayor). */
  bloquesDiagonales(out: Float64Array): void {
    out.fill(0);
    this.membrana.sumarBloquesDiagonales(out);
    this.placa.sumarBloquesDiagonales(out);
  }

  /** Los vértices libres que están a menos de la separación de un obstáculo, en las posiciones actuales. */
  contactosActuales(): ContactoActivo[] {
    const lista: ContactoActivo[] = [];
    for (let i = 0; i < this.n; i++) {
      if (this.fijo[i]) continue;
      const c = masCercano(this.obstaculos, this.x[3 * i], this.x[3 * i + 1], this.x[3 * i + 2]);
      if (c !== null && this.sep - c.d > 0) lista.push({ i, k: c.k, nx: c.nx, ny: c.ny, nz: c.nz, p0: this.sep - c.d });
    }
    return lista;
  }

  /**
   * out = −∇G en las posiciones actuales, con el contacto linealizado ½·kContacto·(p0 − n·Δx)² de cada
   * vértice de `contactos` (exacto al empezar el paso, con x = x_t). Los empotrados quedan en cero. Pide
   * `linealizar` antes.
   */
  residuo(contactos: readonly ContactoActivo[], out: Float64Array): void {
    this.gradienteElastico(out);
    const { h, aire, kContacto } = this.aj;
    for (let i = 0; i < this.n; i++) {
      const m = this.masa[i];
      for (let d = 0; d < 3; d++) {
        const q = 3 * i + d;
        out[q] = -(out[q] + (m / (h * h)) * (this.x[q] - this.prediccion(i, d)) + ((aire * m) / h) * (this.x[q] - this.xt[q]));
      }
    }
    for (const c of contactos) {
      out[3 * c.i] += kContacto * c.p0 * c.nx;
      out[3 * c.i + 1] += kContacto * c.p0 * c.ny;
      out[3 * c.i + 2] += kContacto * c.p0 * c.nz;
    }
    for (let i = 0; i < this.n; i++) if (this.fijo[i]) out[3 * i] = out[3 * i + 1] = out[3 * i + 2] = 0;
  }
}
```

- [ ] **Step 4: Corre la prueba y mira que pasa**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/sistema.test.ts`
Expected: PASS, 3 pruebas.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/sistema.ts src/utils/cloth/implicito/__tests__/sistema.test.ts
git commit -m "feat(tela): el sistema de un cuadro del motor implícito" -m "Junta membrana, placa, masas, obstáculos y estado: la energía incremental G de Euler implícito, el residuo −∇G con el contacto linealizado, el producto por la hessiana de Gauss-Newton y los bloques de su diagonal. Los empotrados no reciben fuerza."
```

---

### Tarea 7: El paso implícito y el medidor de quietud

**Files:**
- Create: `src/utils/cloth/implicito/paso.ts`
- Create: `src/utils/cloth/implicito/quietud.ts`
- Test: `src/utils/cloth/implicito/__tests__/paso.test.ts`
- Test: `src/utils/cloth/implicito/__tests__/quietud.test.ts`

**Interfaces:**
- Consumes: `SistemaTela`, `ContactoActivo` (Tarea 6); `distancia`, `masCercano` (Tarea 1).
- Produces: `interface InfoPaso { cg: number; anticipados: number; alfa: number; G0: number; G1: number }`; `pasoImplicito(s: SistemaTela): InfoPaso`; `interface Quietud { total: number; maximo: number; vertice: number }`; `medirQuietud(s: SistemaTela): Quietud`; `class VigiaDeQuietud` con `constructor(umbral = 1e-3, cuadros = 30)` y `registrar(total: number): boolean`.

El orden del cuadro es el que copia la GPU (Tarea 11), paso por paso:

1. `x_t ← x`; se linealiza; los contactos de partida son los vértices libres a menos de la separación.
2. Ronda 1: residuo y precondicionador (bloques elásticos + `m/h² + aire·m/h` + `kContacto·n·nᵀ`), y gradiente conjugado desde Δ = 0.
3. Anticipación: si `x + Δ` mete un vértice libre sin contacto a menos de la separación, entra con la normal del punto de llegada y `p0` medido en `x`, contra el mismo obstáculo. Si entró alguno, ronda 2 desde Δ = 0.
4. Búsqueda en línea: α = 1, ½, …, 1/128 hasta que `G(x_t + α·Δ) ≤ G(x_t)`; si ninguna sirve, α = 0.
5. `x = x_t + α·Δ`, `v = α·Δ/h`.

- [ ] **Step 1: Escribe las pruebas que fallan**

`src/utils/cloth/implicito/__tests__/paso.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { distancia } from '../obstaculos';
import { CUSICK, escenaCusick, escenaVoladizo, laminaPlana, TELA_DE_LABORATORIO } from '../banco/escenas';
import { aplastados } from '../banco/medidas';
import { azar } from './ayudas';

describe('el paso implícito', () => {
  it('un paso nunca sube G, tampoco al chocar con el suelo', () => {
    const s = new SistemaTela(laminaPlana(10), TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: -0.004 }] });
    const r = azar(31);
    for (let q = 0; q < s.x.length; q++) s.x[q] += 0.002 * r();
    let anticipados = 0;
    for (let k = 0; k < 20; k++) {
      const info = pasoImplicito(s);
      expect(info.G1).toBeLessThanOrEqual(info.G0);
      anticipados += info.anticipados;
    }
    expect(anticipados).toBeGreaterThan(0);
  });

  it('el disco cae sobre el pedestal sin atravesarlo y sin aplastarse', () => {
    const e = escenaCusick(10);
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos });
    for (let k = 0; k < 60; k++) pasoImplicito(s);
    let dentro = 0, centro = 0, masCerca = Infinity;
    for (let i = 0; i < s.n; i++) {
      if (distancia(e.obstaculos[0], s.x[3 * i], s.x[3 * i + 1], s.x[3 * i + 2]).d < 0) dentro++;
      const r2 = e.malla.patron[2 * i] ** 2 + e.malla.patron[2 * i + 1] ** 2;
      if (r2 < masCerca) {
        masCerca = r2;
        centro = i;
      }
    }
    expect(dentro).toBe(0);
    expect(aplastados(s.x, e.malla)).toBeLessThan(0.1);
    // el centro quedó apoyado en la tapa, a la separación de contacto
    expect(s.x[3 * centro + 1] - CUSICK.tapa).toBeCloseTo(s.sep, 3);
  });

  it('los empotrados no se mueven ni un bit y la punta baja', () => {
    const e = escenaVoladizo(15, 'urdimbre', 5);
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { hilo: e.hilo });
    for (let k = 0; k < 30; k++) pasoImplicito(s);
    for (let i = 0; i < s.n; i++) {
      if (!s.fijo[i]) continue;
      for (let d = 0; d < 3; d++) expect(s.x[3 * i + d]).toBe(e.malla.x[3 * i + d]);
    }
    let minY = 0;
    for (let i = 0; i < s.n; i++) minY = Math.min(minY, s.x[3 * i + 1]);
    expect(minY).toBeLessThan(-1e-4);
  });
});
```

`src/utils/cloth/implicito/__tests__/quietud.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { medirQuietud, VigiaDeQuietud } from '../quietud';
import { escenaVoladizo, laminaPlana, TELA_DE_LABORATORIO } from '../banco/escenas';

describe('el medidor de quietud', () => {
  it('marca cero en un equilibrio construido: una lámina apoyada en el suelo', () => {
    const s = new SistemaTela(laminaPlana(20), TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    // cada vértice a la altura en la que el contacto aguanta justo su peso
    for (let i = 0; i < s.n; i++) s.x[3 * i + 1] = s.sep - (s.masa[i] * -s.aj.gravedad) / s.aj.kContacto;
    pasoImplicito(s);
    expect(medirQuietud(s).total).toBeLessThan(1e-4);
  });

  it('marca un cuadro de caída libre cuando la tela empieza a caer', () => {
    const s = new SistemaTela(laminaPlana(20), TELA_DE_LABORATORIO);
    pasoImplicito(s);
    // un cuadro de Euler implícito con aire desde el reposo: v = g·h / (1 + aire·h)
    expect(medirQuietud(s).total).toBeCloseTo(1 / (1 + s.aj.aire * s.aj.h), 3);
  });

  it('los empotrados no cuentan', () => {
    const e = escenaVoladizo(15, 'urdimbre', 5);
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { hilo: e.hilo });
    for (let i = 0; i < s.n; i++) if (s.fijo[i]) s.v[3 * i + 1] = 1;
    expect(medirQuietud(s).total).toBe(0);
  });

  it('el vigía pide 30 cuadros seguidos bajo el umbral', () => {
    const v = new VigiaDeQuietud();
    for (let k = 0; k < 29; k++) expect(v.registrar(5e-4)).toBe(false);
    expect(v.registrar(5e-4)).toBe(true);
    expect(v.registrar(2e-3)).toBe(false);
  });
});
```

- [ ] **Step 2: Corre las pruebas y mira que fallan**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/paso.test.ts src/utils/cloth/implicito/__tests__/quietud.test.ts`
Expected: FAIL (`Failed to resolve import "../paso"`).

- [ ] **Step 3: Escribe `paso.ts` y `quietud.ts`**

`src/utils/cloth/implicito/paso.ts`:

```ts
/**
 * Un cuadro del motor implícito (spec 2026-10-13 §4.2.1): Euler implícito resuelto con un paso de Newton
 * de Gauss-Newton desde el estado actual y gradiente conjugado precondicionado por bloques 3×3, con
 * anticipación de contactos (una ronda más) y búsqueda en línea sobre G. La GPU (gpu/wgsl.ts) hace lo
 * mismo, en el mismo orden.
 */
import { distancia, masCercano } from './obstaculos';
import type { ContactoActivo, SistemaTela } from './sistema';

export interface InfoPaso {
  /** iteraciones de gradiente conjugado de las dos rondas */
  cg: number;
  /** contactos agregados por anticipación; si hubo, se resolvió dos veces */
  anticipados: number;
  /** fracción del paso que aceptó la búsqueda en línea (0 = no se movió) */
  alfa: number;
  /** G al empezar y al terminar el cuadro */
  G0: number;
  G1: number;
}

export function pasoImplicito(s: SistemaTela): InfoPaso {
  const { n, aj } = s;
  const { h, aire, kContacto, maxCG, tolCG } = aj;
  s.xt.set(s.x);
  s.linealizar();
  const contactos = s.contactosActuales();
  const enContacto = new Uint8Array(n);
  for (const c of contactos) enContacto[c.i] = 1;

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
    for (const c of contactos) {
      const pn = kContacto * (c.nx * p[3 * c.i] + c.ny * p[3 * c.i + 1] + c.nz * p[3 * c.i + 2]);
      out[3 * c.i] += pn * c.nx;
      out[3 * c.i + 1] += pn * c.ny;
      out[3 * c.i + 2] += pn * c.nz;
    }
    for (let i = 0; i < n; i++) if (s.fijo[i]) out[3 * i] = out[3 * i + 1] = out[3 * i + 2] = 0;
  };

  const r = new Float64Array(3 * n), dx = new Float64Array(3 * n), Pinv = new Float64Array(9 * n);
  const tmp = { z: new Float64Array(3 * n), p: new Float64Array(3 * n), Ap: new Float64Array(3 * n) };
  let cg = 0, anticipados = 0;
  for (let ronda = 0; ronda < 2; ronda++) {
    s.residuo(contactos, r);
    precondicionador(base, contactos, kContacto, Pinv);
    cg += gradienteConjugado(A, r, Pinv, dx, maxCG, tolCG, tmp);
    if (ronda === 1 || !aj.anticipar) break;
    // anticipación: los vértices que este paso metería en un obstáculo entran al sistema (§4.2.1, paso 4)
    for (let i = 0; i < n; i++) {
      if (s.fijo[i] || enContacto[i]) continue;
      const c = masCercano(s.obstaculos, s.x[3 * i] + dx[3 * i], s.x[3 * i + 1] + dx[3 * i + 1], s.x[3 * i + 2] + dx[3 * i + 2]);
      if (c === null || s.sep - c.d <= 0) continue;
      const d0 = distancia(s.obstaculos[c.k], s.x[3 * i], s.x[3 * i + 1], s.x[3 * i + 2]).d;
      contactos.push({ i, k: c.k, nx: c.nx, ny: c.ny, nz: c.nz, p0: s.sep - d0 });
      enContacto[i] = 1;
      anticipados++;
    }
    if (anticipados === 0) break;
  }

  // búsqueda en línea: el paso no puede subir G (§4.2.1, paso 5)
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
  }
  return { cg, anticipados, alfa, G0, G1 };
}

/** Inversas de los bloques de la diagonal, con el contacto de cada vértice: kContacto·n·nᵀ. */
function precondicionador(base: Float64Array, contactos: readonly ContactoActivo[], kc: number, Pinv: Float64Array): void {
  Pinv.set(base);
  for (const c of contactos) {
    const nn = [c.nx, c.ny, c.nz], o = 9 * c.i;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) Pinv[o + 3 * a + b] += kc * nn[a] * nn[b];
  }
  for (let o = 0; o < Pinv.length; o += 9) invertir3(Pinv, o);
}

/** Invierte en su lugar la matriz 3×3 (fila mayor) que empieza en o; deja ceros si es singular. */
function invertir3(M: Float64Array, o: number): void {
  const a = M[o], b = M[o + 1], c = M[o + 2], d = M[o + 3], e = M[o + 4], f = M[o + 5], g = M[o + 6], h = M[o + 7], k = M[o + 8];
  const A = e * k - f * h, B = -(d * k - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-300)) {
    M.fill(0, o, o + 9);
    return;
  }
  M[o] = A / det; M[o + 1] = -(b * k - c * h) / det; M[o + 2] = (b * f - c * e) / det;
  M[o + 3] = B / det; M[o + 4] = (a * k - c * g) / det; M[o + 5] = -(a * f - c * d) / det;
  M[o + 6] = C / det; M[o + 7] = -(a * h - b * g) / det; M[o + 8] = (a * e - b * d) / det;
}

/** Gradiente conjugado precondicionado desde dx = 0; para cuando rᵀz ≤ tol²·r0ᵀz0. Deja en r el residuo final. */
function gradienteConjugado(
  A: (p: Float64Array, out: Float64Array) => void,
  r: Float64Array,
  Pinv: Float64Array,
  dx: Float64Array,
  max: number,
  tol: number,
  { z, p, Ap }: { z: Float64Array; p: Float64Array; Ap: Float64Array },
): number {
  dx.fill(0);
  precondicionar(Pinv, r, z);
  p.set(z);
  let rz = punto(r, z);
  const rz0 = rz;
  let k = 0;
  while (k < max) {
    A(p, Ap);
    const pAp = punto(p, Ap);
    if (!(pAp > 0)) break;
    const alfa = rz / pAp;
    for (let q = 0; q < r.length; q++) {
      dx[q] += alfa * p[q];
      r[q] -= alfa * Ap[q];
    }
    k++;
    precondicionar(Pinv, r, z);
    const rzN = punto(r, z);
    if (rzN <= tol * tol * rz0) break;
    const beta = rzN / rz;
    rz = rzN;
    for (let q = 0; q < r.length; q++) p[q] = z[q] + beta * p[q];
  }
  return k;
}

function precondicionar(Pinv: Float64Array, r: Float64Array, z: Float64Array): void {
  for (let i = 0; i < r.length / 3; i++) {
    const o = 9 * i, x = r[3 * i], y = r[3 * i + 1], w = r[3 * i + 2];
    z[3 * i] = Pinv[o] * x + Pinv[o + 1] * y + Pinv[o + 2] * w;
    z[3 * i + 1] = Pinv[o + 3] * x + Pinv[o + 4] * y + Pinv[o + 5] * w;
    z[3 * i + 2] = Pinv[o + 6] * x + Pinv[o + 7] * y + Pinv[o + 8] * w;
  }
}

function punto(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let q = 0; q < a.length; q++) s += a[q] * b[q];
  return s;
}
```

`src/utils/cloth/implicito/quietud.ts`:

```ts
/**
 * El medidor de quietud (spec 2026-10-13 §4.2.4): cuánto se movió la tela en el último cuadro, frente a
 * un cuadro de caída libre. Se mide por velocidad y no por fuerza: en la GPU, la fuerza de una tela en
 * reposo no baja del ruido de la precisión simple. La GPU lo calcula igual (gpu/wgsl.ts, `aplicar`).
 */
import type { SistemaTela } from './sistema';

export interface Quietud {
  /** Σ m·|v| de los vértices libres / Σ m·g·h */
  total: number;
  /** el mayor |v| / (g·h) de un vértice libre */
  maximo: number;
  /** el vértice de ese máximo (−1 si no hay libres) */
  vertice: number;
}

export function medirQuietud(s: SistemaTela): Quietud {
  const gh = Math.abs(s.aj.gravedad) * s.aj.h;
  let mv = 0, peso = 0, maximo = 0, vertice = -1;
  for (let i = 0; i < s.n; i++) {
    if (s.fijo[i]) continue;
    const v = Math.hypot(s.v[3 * i], s.v[3 * i + 1], s.v[3 * i + 2]);
    mv += s.masa[i] * v;
    peso += s.masa[i] * gh;
    if (vertice < 0 || v / gh > maximo) {
      maximo = v / gh;
      vertice = i;
    }
  }
  return { total: peso > 0 ? mv / peso : 0, maximo, vertice };
}

/** Cuenta cuadros quietos seguidos: la tela está quieta cuando lleva `cuadros` bajo el `umbral`. */
export class VigiaDeQuietud {
  private seguidos = 0;

  constructor(readonly umbral = 1e-3, readonly cuadros = 30) {}

  registrar(total: number): boolean {
    this.seguidos = total < this.umbral ? this.seguidos + 1 : 0;
    return this.seguidos >= this.cuadros;
  }
}
```

- [ ] **Step 4: Corre las pruebas y mira que pasan**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/paso.test.ts src/utils/cloth/implicito/__tests__/quietud.test.ts`
Expected: PASS, 7 pruebas.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/paso.ts src/utils/cloth/implicito/quietud.ts src/utils/cloth/implicito/__tests__/paso.test.ts src/utils/cloth/implicito/__tests__/quietud.test.ts
git commit -m "feat(tela): el paso implícito y el medidor de quietud" -m "Cada cuadro resuelve Euler implícito con un paso de Newton desde el estado actual y gradiente conjugado con bloques 3×3; si el paso mete vértices en un obstáculo, esos contactos entran al sistema y se resuelve otra vez, y una búsqueda en línea impide que suba G. Sin amarres ni topes de velocidad. La quietud se mide por velocidad frente a un cuadro de caída libre."
```

---
### Tarea 8: La tira converge a la elástica exacta

Prueba de aceptación del motor en CPU: no agrega código de producción. Si falla, el error está en las Tareas 5 a 7; se depura con superpowers:systematic-debugging antes de seguir. La prueba corta midió una razón de 0,52 con esta misma escena.

**Files:**
- Test: `src/utils/cloth/implicito/__tests__/voladizo.test.ts`

**Interfaces:**
- Consumes: `SistemaTela` (Tarea 6), `pasoImplicito` (Tarea 7), `escenaVoladizo`, `puntaDelVoladizo` y `elasticaExacta` (Tarea 1).

- [ ] **Step 1: Escribe la prueba**

`src/utils/cloth/implicito/__tests__/voladizo.test.ts`:

```ts
/**
 * Física exacta (spec 2026-10-13 §4.4.1): la tira en voladizo empotrada converge a la elástica exacta al
 * afinar la malla. Es la prueba más lenta del motor: unos segundos por malla.
 */
import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { escenaVoladizo } from '../banco/escenas';
import { puntaDelVoladizo } from '../banco/medidas';
import { elasticaExacta } from '../banco/elastica';
import type { TelaFisica } from '../tela';

// la misma flexión en las tres direcciones: la tira es una viga y la elástica es exacta
const TELA: TelaFisica = { gramaje: 200, grosor: 0.5, kTrama: 600, kUrdimbre: 600, kCizalla: 50, pandeo: Infinity, bTrama: 5, bUrdimbre: 5, bBies: 5 };

function yDeLaPunta(aristaMm: number): number {
  const e = escenaVoladizo(15, 'urdimbre', aristaMm);
  const s = new SistemaTela(e.malla, TELA, { hilo: e.hilo, ajustes: { aire: 2, maxCG: 200, tolCG: 1e-5 } });
  for (let k = 0; k < 120; k++) pasoImplicito(s);
  return puntaDelVoladizo(s.x, e.malla, 0.015).y;
}

describe('la tira en voladizo', () => {
  it('converge a la elástica exacta: de 2,5 a 1,25 mm el error queda en 0,6 o menos', () => {
    const exacta = elasticaExacta(5e-6, 0.2 * 9.81, 0.015).y;
    const e25 = Math.abs(yDeLaPunta(2.5) - exacta), e125 = Math.abs(yDeLaPunta(1.25) - exacta);
    console.log(`voladizo: exacta ${(exacta * 1000).toFixed(2)} mm · error con 2,5 mm ${(e25 * 1000).toFixed(2)} mm · con 1,25 mm ${(e125 * 1000).toFixed(2)} mm`);
    expect(e125).toBeLessThanOrEqual(0.6 * e25);
  }, 180_000);
});
```

- [ ] **Step 2: Córrela con el candado**

Run: `node scripts/pesado.mjs --nombre=prueba-voladizo --espera=10 -- npx vitest run src/utils/cloth/implicito/__tests__/voladizo.test.ts`
Expected: PASS, con una línea `voladizo: exacta −2.xx mm · error …` en la salida.

- [ ] **Step 3: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/__tests__/voladizo.test.ts
git commit -m "test(tela): la tira en voladizo converge a la elástica exacta" -m "Con flexión igual en las tres direcciones, la punta de una tira empotrada de 15 mm se acerca a la elástica al afinar la malla: el error con 1,25 mm queda en 0,6 o menos del error con 2,5 mm (convergencia de primer orden)."
```

---

### Tarea 9: El motor nuevo en el banco y el pandeo calibrado

La calibración barre el factor de pandeo contra la referencia privada del disco Cusick en 5, 10 y 20 mm, y elige el que cumple el criterio de §2 más cerca de la referencia con 5 mm.

**Files:**
- Modify: `src/utils/cloth/implicito/tela.ts` (agregar `PANDEO_CALIBRADO` al final)
- Create: `bench/motorImplicito.ts`
- Create: `bench/calibrarPandeo.ts`
- Modify: `bench/telaNueva.ts` (registrar el motor nuevo y hacerlo el de por defecto)
- Modify: `package.json` (script `bench:tela:calibrar`)
- Modify: `bench/README.md` (dos líneas en la sección `bench:tela`)

**Interfaces:**
- Consumes: `SistemaTela`, `AjustesImplicito` (Tarea 6); `pasoImplicito`, `medirQuietud`, `VigiaDeQuietud` (Tarea 7); `Corredor`, `Referencias`, `ensayoCusick`, `criterioCusick`, `imprimirCusick`, `guardarInforme`, `leerReferencias` (Tarea 2).
- Produces: `PANDEO_CALIBRADO: number` (`tela.ts`); `correrImplicito(tela: TelaFisica, ajustes?: Partial<AjustesImplicito>): Corredor` (`bench/motorImplicito.ts`).

- [ ] **Step 1: Agrega el factor de pandeo de partida**

Al final de `src/utils/cloth/implicito/tela.ts`:

```ts
/**
 * Factor de pandeo de la ley de Choi y Ko (§4.1.4) para las telas que no traen uno medido. Se calibra con
 * `npm run bench:tela:calibrar` contra la referencia privada del disco Cusick en 5, 10 y 20 mm. Valor de
 * partida: 1, el de la prueba corta (§1.2).
 */
export const PANDEO_CALIBRADO = 1;
```

- [ ] **Step 2: Escribe el motor nuevo para el banco**

`bench/motorImplicito.ts`:

```ts
/** El motor nuevo en la CPU para el banco: corre cada escena hasta que la tela queda quieta (§4.2.4) o 10 s de tela. */
import { SistemaTela, type AjustesImplicito } from '../src/utils/cloth/implicito/sistema';
import { pasoImplicito } from '../src/utils/cloth/implicito/paso';
import { medirQuietud, VigiaDeQuietud } from '../src/utils/cloth/implicito/quietud';
import type { TelaFisica } from '../src/utils/cloth/implicito/tela';
import type { Escena } from '../src/utils/cloth/implicito/banco/escenas';
import type { Corredor } from './_banco';

export function correrImplicito(tela: TelaFisica, ajustes: Partial<AjustesImplicito> = {}): Corredor {
  return (e: Escena) => {
    const s = new SistemaTela(e.malla, tela, { obstaculos: e.obstaculos, hilo: e.hilo, ajustes });
    const vigia = new VigiaDeQuietud();
    const t0 = performance.now();
    let cuadros = 0, quieta: number | null = null;
    while (cuadros < 600 && quieta === null) {
      pasoImplicito(s);
      cuadros++;
      if (vigia.registrar(medirQuietud(s).total)) quieta = cuadros / 60;
    }
    return { x: s.x, quieta, msPorCuadro: (performance.now() - t0) / cuadros };
  };
}
```

`bench/calibrarPandeo.ts`:

```ts
/**
 * Calibra el factor de pandeo (spec 2026-10-13 §4.1.4) contra la referencia privada del disco Cusick en
 * 5, 10 y 20 mm.
 *
 *   VINA_REFERENCIAS=<carpeta privada> npm run bench:tela:calibrar
 *
 * Entre los factores que cumplen el criterio de §2, elige el que deja la malla de 5 mm más cerca de la
 * referencia. Si ninguno lo cumple, lo dice: la ley de pandeo necesitaría otra forma (§5).
 */
import { criterioCusick, ensayoCusick, guardarInforme, imprimirCusick, leerReferencias } from './_banco';
import { correrImplicito } from './motorImplicito';

const FACTORES = [0.1, 0.2, 0.3, 0.5, 0.7, 1];
const ref = leerReferencias();
const ensayos = FACTORES.map((pandeo) => {
  console.log(`— pandeo ${pandeo}`);
  const filas = ensayoCusick(correrImplicito({ ...ref.tela, pandeo }), [5, 10, 20], ref);
  imprimirCusick(filas);
  return { pandeo, filas, criterio: criterioCusick(filas, ref) };
});
const cinco = (e: (typeof ensayos)[number]) => e.filas.find((f) => f.malla === 5)?.coeficiente ?? NaN;
const distancia = (e: (typeof ensayos)[number]) => Math.abs(cinco(e) - (ref.cusick['5']?.coeficiente ?? NaN));
const validos = ensayos
  .filter((e) => e.criterio.nivel && e.criterio.rango)
  .sort((a, b) => distancia(a) - distancia(b) || a.criterio.rangoPropio - b.criterio.rangoPropio);
console.log(validos.length > 0 ? `pandeo elegido: ${validos[0].pandeo}` : 'ningún factor cumple el criterio de §2: la ley de pandeo necesita otra forma (§5)');
console.log(`informe: ${guardarInforme('calibrar-pandeo', ensayos)}`);
```

- [ ] **Step 3: Registra el motor nuevo en el banco**

En `bench/telaNueva.ts`, agrega dos importaciones al final del bloque de importaciones:

```ts
import { PANDEO_CALIBRADO } from '../src/utils/cloth/implicito/tela';
import { correrImplicito } from './motorImplicito';
```

Cambia el registro de motores:

```ts
const MOTORES: Record<string, (ref: Referencias, args: Map<string, string>) => Corredor> = {
  implicito: (ref, args) => correrImplicito({ ...ref.tela, pandeo: Number(args.get('pandeo') || PANDEO_CALIBRADO) }),
  xpbd: () => correrXpbd,
};
```

Cambia el motor por defecto:

```ts
const motor = args.get('motor') ?? 'implicito';
```

Y en el comentario de cabecera, `[--motor=xpbd]` pasa a `[--motor=implicito|xpbd] [--pandeo=<factor>]`.

En `package.json`, después de la línea `"bench:tela"`:

```json
    "bench:tela:calibrar": "node scripts/pesado.mjs --nombre=calibrar-pandeo --espera=15 -- tsx bench/calibrarPandeo.ts",
```

En `bench/README.md`, dentro de la sección `bench:tela`, agrega al bloque de ejemplos:

```bash
VINA_REFERENCIAS=<private folder> npm run bench:tela -- --motor=implicito
VINA_REFERENCIAS=<private folder> npm run bench:tela:calibrar
```

Y después del bloque, el párrafo:

```md
`bench:tela:calibrar` sweeps the buckling factor of the new engine (spec
§4.1.4) on the Cusick disc at 5, 10 and 20 mm and prints the factor that meets
the §2 criterion closest to the reference; the chosen value lives in
`PANDEO_CALIBRADO` (`src/utils/cloth/implicito/tela.ts`).
```

- [ ] **Step 4: Comprueba los tipos**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

- [ ] **Step 5: Calibra**

Run (en el PC de Samuel): `VINA_REFERENCIAS=<carpeta privada> npm run bench:tela:calibrar`
Expected: seis bloques `— pandeo …` con tres líneas `cusick …` cada uno; al final, `pandeo elegido: <factor>` e `informe: <ruta>`. Tarda unos minutos.

**Punto de decisión.** Si imprime «ningún factor cumple el criterio de §2», para aquí. Lleva a Samuel la tabla del informe: la ley de pandeo necesita otra forma (§5, por ejemplo con rigidez poscrítica), y eso es una decisión de diseño que no se toma en este plan.

- [ ] **Step 6: Escribe el factor elegido**

En `src/utils/cloth/implicito/tela.ts`, cambia `export const PANDEO_CALIBRADO = 1;` por el número exacto que imprimió el paso anterior, y la última frase del comentario por `Calibrado el <fecha de hoy, AAAA-MM-DD> con la referencia privada del banco.`

- [ ] **Step 7: Corre el banco completo con el motor nuevo**

Run: `VINA_REFERENCIAS=<carpeta privada> npm run bench:tela -- --motor=implicito`
Expected: `§2: nivel con 5 mm pasa · rango … pasa`; aplastados por debajo de 0,1 % en las tres mallas; 18 líneas de voladizo con su referencia. Compara cada malla con el punto de partida de la Tarea 2 y anota la diferencia para el informe de cierre (Tarea 13). Los números quedan en el informe privado.

- [ ] **Step 8: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/tela.ts bench/motorImplicito.ts bench/calibrarPandeo.ts bench/telaNueva.ts bench/README.md package.json
git commit -m "feat(tela): el motor nuevo en el banco y el pandeo calibrado" -m "bench/motorImplicito.ts corre las escenas del banco con el motor implícito hasta que la tela queda quieta, y bench/calibrarPandeo.ts barre el factor de pandeo contra la referencia del disco Cusick en 5, 10 y 20 mm. PANDEO_CALIBRADO guarda el factor que cumple el criterio de caída en las tres mallas."
```

---
## Entrega 3 — El motor en GPU

### Tarea 10: El paquete para la GPU

**Files:**
- Create: `src/utils/cloth/implicito/gpu/empaquetar.ts`
- Test: `src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`

**Interfaces:**
- Consumes: `SistemaTela` (Tarea 6), con `membrana.pcrU/pcrV`, `placa.bisagras/bisDeTri/K/nh/plantilla(t)`, `coef`, `masa`, `fijo`, `aj.gravedad`; `ESTADO_MEMBRANA` (Tarea 4, solo en la prueba).
- Produces: `NINGUNA = 0xffffffff`; `interface PaqueteGpu { n; nt; nh; nb; nq; pesoTotal; f32: { x; masa; coef; K; pcr }; u32: { tris; bisagras; bisDeTri; fijo; aporOff; aporIdx; blqOff; blqCod; blqFila; blqCol; franjaBase; franjaAncho; colSell; posDe; diag } }`; `empaquetar(s: SistemaTela): PaqueteGpu`. Ranuras de aporte al gradiente: membrana `3t + j`, placa `3nt + 12t + 4k + r`. Códigos de bloque: membrana `t << 4 | li << 2 | lj` y placa `0x80000000 | t`.

- [ ] **Step 1: Escribe la prueba que falla**

`src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../../sistema';
import { ESTADO_MEMBRANA } from '../../membrana';
import { escenaCusick, TELA_DE_LABORATORIO } from '../../banco/escenas';
import { azar } from '../../__tests__/ayudas';
import { empaquetar, NINGUNA, type PaqueteGpu } from '../empaquetar';

/** Lo que `gradElem` escribe en cada ranura de aporte (un vec3 por ranura), desde el estado linealizado. */
function ranuras(s: SistemaTela): Float64Array {
  const nt = s.tris.length / 3, out = new Float64Array(3 * 15 * nt);
  const em = s.membrana.estado, c = s.coef, kC = s.tela.kCizalla, { bisDeTri, K, estado: ep } = s.placa;
  for (let t = 0; t < nt; t++) {
    const e = ESTADO_MEMBRANA * t, o = 7 * t, A0 = c[o + 6];
    const gu = em[e + 8], gv = em[e + 9];
    const ks = kC * (em[e] * em[e + 3] + em[e + 1] * em[e + 4] + em[e + 2] * em[e + 5]);
    for (let j = 0; j < 3; j++) {
      for (let d = 0; d < 3; d++) {
        const fu = em[e + d], fv = em[e + 3 + d];
        out[3 * (3 * t + j) + d] = A0 * (gu * c[o + j] * fu + gv * c[o + 3 + j] * fv + ks * (c[o + j] * fv + c[o + 3 + j] * fu));
      }
    }
    const th = [0, 1, 2].map((k) => (bisDeTri[3 * t + k] < 0 ? 0 : ep[13 * bisDeTri[3 * t + k]]));
    for (let k = 0; k < 3; k++) {
      const h = bisDeTri[3 * t + k];
      if (h < 0) continue;
      const w = K[9 * t + 3 * k] * th[0] + K[9 * t + 3 * k + 1] * th[1] + K[9 * t + 3 * k + 2] * th[2];
      for (let r = 0; r < 4; r++) for (let d = 0; d < 3; d++) out[3 * (3 * nt + 12 * t + 4 * k + r) + d] = w * ep[13 * h + 1 + 3 * r + d];
    }
  }
  return out;
}

/** Los bloques en franjas armados desde los códigos, como `ensamblar` en la GPU (9 por posición, fila mayor). */
function franjas(s: SistemaTela, p: PaqueteGpu): Float64Array {
  const vals = new Float64Array(9 * p.nq), M = new Float64Array(9);
  for (let b = 0; b < p.nb; b++) {
    M.fill(0);
    const i = p.u32.blqFila[b], j = p.u32.blqCol[b];
    for (let k = p.u32.blqOff[b]; k < p.u32.blqOff[b + 1]; k++) {
      const cod = p.u32.blqCod[k];
      if (cod >= 0x80000000) s.placa.sumarBloque(cod - 0x80000000, i, j, M);
      else s.membrana.sumarBloque(cod >>> 4, (cod >>> 2) & 3, cod & 3, M);
    }
    vals.set(M, 9 * p.u32.posDe[b]);
  }
  return vals;
}

describe('el paquete de la tela para la GPU', () => {
  const e = escenaCusick(20);
  const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos });
  const r = azar(41);
  for (let q = 0; q < s.x.length; q++) s.x[q] += 0.003 * r();
  s.linealizar();
  const p = empaquetar(s);

  it('los aportes de cada vértice suman el gradiente elástico', () => {
    const slot = ranuras(s), g = new Float64Array(3 * s.n), esperado = new Float64Array(3 * s.n);
    for (let i = 0; i < s.n; i++) {
      for (let k = p.u32.aporOff[i]; k < p.u32.aporOff[i + 1]; k++) for (let d = 0; d < 3; d++) g[3 * i + d] += slot[3 * p.u32.aporIdx[k] + d];
    }
    s.gradienteElastico(esperado);
    for (let q = 0; q < g.length; q++) expect(g[q]).toBeCloseTo(esperado[q], 9);
  });

  it('la matriz en franjas de 32, armada desde los códigos, da H·p', () => {
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

  it('diag apunta al bloque (i, i) de cada fila', () => {
    for (let i = 0; i < s.n; i++) expect(p.u32.colSell[p.u32.diag[i]]).toBe(i);
  });

  it('sin pandeo (Infinity) y con compresión gratis (0) las cargas quedan finitas', () => {
    for (const pandeo of [Infinity, 0]) {
      const s2 = new SistemaTela(e.malla, { ...TELA_DE_LABORATORIO, pandeo }, { obstaculos: e.obstaculos });
      expect(empaquetar(s2).f32.pcr.every(Number.isFinite)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Corre la prueba y mira que falla**

Run: `npx vitest run src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`
Expected: FAIL (`Failed to resolve import "../empaquetar"`).

- [ ] **Step 3: Escribe `src/utils/cloth/implicito/gpu/empaquetar.ts`**

```ts
/**
 * El paquete de la tela para la GPU (spec 2026-10-13 §4.2.2): todo lo que lee el WGSL, en arreglos planos.
 * La matriz se arma por bloques 3×3 «por recolección»: cada bloque sabe de qué elementos se suma, así que
 * la GPU no necesita atómicas. Los bloques van en franjas de 32 filas, para que hilos vecinos lean memoria
 * vecina.
 */
import type { SistemaTela } from '../sistema';

/** Índice que no apunta a nada: borde libre o relleno de una franja. */
export const NINGUNA = 0xffffffff;

export interface PaqueteGpu {
  n: number;
  nt: number;
  nh: number;
  /** bloques de la matriz */
  nb: number;
  /** posiciones de las franjas, con relleno */
  nq: number;
  /** Σ m·|g| de los vértices libres (N), para la quietud */
  pesoTotal: number;
  f32: {
    x: Float32Array;
    masa: Float32Array;
    /** 7 por triángulo, como `SistemaTela.coef` */
    coef: Float32Array;
    /** 9 por triángulo, como `Placa.K` */
    K: Float32Array;
    /** pcrU y pcrV por triángulo, finitos */
    pcr: Float32Array;
  };
  u32: {
    tris: Uint32Array;
    bisagras: Uint32Array;
    /** 3 por triángulo; NINGUNA = borde libre */
    bisDeTri: Uint32Array;
    fijo: Uint32Array;
    /** CSR de las ranuras que suma cada vértice: membrana 3t + j, placa 3nt + 12t + 4k + r */
    aporOff: Uint32Array;
    aporIdx: Uint32Array;
    /** de qué elementos se arma cada bloque: membrana (t << 4 | li << 2 | lj) o placa (0x80000000 | t) */
    blqOff: Uint32Array;
    blqCod: Uint32Array;
    blqFila: Uint32Array;
    blqCol: Uint32Array;
    /** franjas de 32 filas: el bloque k de la fila 32·f + c va en franjaBase[f] + 32·k + c */
    franjaBase: Uint32Array;
    franjaAncho: Uint32Array;
    /** la columna del bloque en cada posición; NINGUNA = relleno */
    colSell: Uint32Array;
    /** la posición de cada bloque */
    posDe: Uint32Array;
    /** la posición del bloque diagonal de cada fila */
    diag: Uint32Array;
  };
}

export function empaquetar(s: SistemaTela): PaqueteGpu {
  const n = s.n, nt = s.tris.length / 3, { bisagras, bisDeTri, K, nh } = s.placa;

  // las ranuras de aporte al gradiente que suma cada vértice
  const aportes: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < nt; t++) for (let j = 0; j < 3; j++) aportes[s.tris[3 * t + j]].push(3 * t + j);
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const h = bisDeTri[3 * t + k];
      if (h < 0) continue;
      for (let r = 0; r < 4; r++) aportes[bisagras[4 * h + r]].push(3 * nt + 12 * t + 4 * k + r);
    }
  }
  const aporOff = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) aporOff[i + 1] = aporOff[i] + aportes[i].length;
  const aporIdx = Uint32Array.from(aportes.flat());

  // los bloques (i, j) y de qué elementos se arma cada uno
  const filas: Array<Map<number, number[]>> = Array.from({ length: n }, () => new Map());
  const aporte = (i: number, j: number, cod: number) => {
    const lista = filas[i].get(j);
    if (lista) lista.push(cod);
    else filas[i].set(j, [cod]);
  };
  for (let t = 0; t < nt; t++) {
    for (let li = 0; li < 3; li++) for (let lj = 0; lj < 3; lj++) aporte(s.tris[3 * t + li], s.tris[3 * t + lj], (t << 4) | (li << 2) | lj);
    const plantilla = s.placa.plantilla(t);
    for (const i of plantilla) for (const j of plantilla) aporte(i, j, (0x80000000 | t) >>> 0);
  }
  const filaOff = new Uint32Array(n + 1);
  const blqFila: number[] = [], blqCol: number[] = [], blqOff: number[] = [0], blqCod: number[] = [];
  for (let i = 0; i < n; i++) {
    for (const j of [...filas[i].keys()].sort((a, b) => a - b)) {
      blqFila.push(i);
      blqCol.push(j);
      for (const cod of filas[i].get(j) ?? []) blqCod.push(cod);
      blqOff.push(blqCod.length);
    }
    filaOff[i + 1] = blqCol.length;
  }

  // franjas de 32 filas
  const nFr = Math.ceil(n / 32), franjaBase = new Uint32Array(nFr + 1), franjaAncho = new Uint32Array(nFr);
  for (let f = 0; f < nFr; f++) {
    let ancho = 0;
    for (let c = 0; c < 32; c++) {
      const i = 32 * f + c;
      if (i < n) ancho = Math.max(ancho, filaOff[i + 1] - filaOff[i]);
    }
    franjaAncho[f] = ancho;
    franjaBase[f + 1] = franjaBase[f] + 32 * ancho;
  }
  const nq = franjaBase[nFr];
  const colSell = new Uint32Array(nq).fill(NINGUNA), posDe = new Uint32Array(blqCol.length), diag = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const f = i >> 5, c = i & 31;
    for (let k = 0; k < filaOff[i + 1] - filaOff[i]; k++) {
      const b = filaOff[i] + k, q = franjaBase[f] + 32 * k + c;
      colSell[q] = blqCol[b];
      posDe[b] = q;
      if (blqCol[b] === i) diag[i] = q;
    }
  }

  const pcr = new Float32Array(2 * nt);
  for (let t = 0; t < nt; t++) {
    // sin pandeo la carga es infinita; en precisión simple alcanza con una que nunca se llega a tocar
    pcr[2 * t] = Math.min(s.membrana.pcrU[t], 3e38);
    pcr[2 * t + 1] = Math.min(s.membrana.pcrV[t], 3e38);
  }
  let pesoTotal = 0;
  for (let i = 0; i < n; i++) if (!s.fijo[i]) pesoTotal += s.masa[i] * Math.abs(s.aj.gravedad);

  return {
    n,
    nt,
    nh,
    nb: blqCol.length,
    nq,
    pesoTotal,
    f32: { x: Float32Array.from(s.x), masa: Float32Array.from(s.masa), coef: Float32Array.from(s.coef), K: Float32Array.from(K), pcr },
    u32: {
      tris: Uint32Array.from(s.tris),
      bisagras: Uint32Array.from(bisagras),
      bisDeTri: Uint32Array.from(bisDeTri, (h) => (h < 0 ? NINGUNA : h)),
      fijo: Uint32Array.from(s.fijo),
      aporOff,
      aporIdx,
      blqOff: Uint32Array.from(blqOff),
      blqCod: Uint32Array.from(blqCod),
      blqFila: Uint32Array.from(blqFila),
      blqCol: Uint32Array.from(blqCol),
      franjaBase,
      franjaAncho,
      colSell,
      posDe,
      diag,
    },
  };
}
```

- [ ] **Step 4: Corre la prueba y mira que pasa**

Run: `npx vitest run src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts`
Expected: PASS, 4 pruebas.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/gpu/empaquetar.ts src/utils/cloth/implicito/gpu/__tests__/empaquetar.test.ts
git commit -m "feat(tela): el paquete de la tela para la GPU" -m "Arreglos planos para el WGSL: las ranuras de aporte al gradiente de cada vértice y los bloques 3×3 de la matriz con la lista de elementos que los arman (sin atómicas), guardados en franjas de 32 filas. Las cargas de pandeo infinitas pasan a finitas en precisión simple."
```

---

### Tarea 11: El WGSL del motor

El cuadro de `paso.ts` escrito para la GPU. Cada ronda de gradiente conjugado son cinco despachos por iteración (`spmv`, `sumarAlfa`, `actualizar`, `sumarBeta`, `nuevaP`). Los productos escalares se reducen por grupo de trabajo y los suma un solo hilo, así que los escalares nunca salen de la GPU. La segunda ronda y los intentos de la búsqueda en línea se despachan siempre: cuando no hacen falta, salen enseguida, gracias a una bandera que se lee de forma uniforme en el grupo. Las posiciones viven en su propio búfer (ligadura 0), que la entrega 4 compartirá con la vista 3D.

**Files:**
- Create: `src/utils/cloth/implicito/gpu/wgsl.ts`
- Test: `src/utils/cloth/implicito/gpu/__tests__/wgsl.test.ts`

**Interfaces:**
- Consumes: `PaqueteGpu`, `empaquetar` (Tarea 10); `SistemaTela` (Tarea 6); `Obstaculo` (Tarea 1).
- Produces: `WG = 128`; `ESC` (índices de los escalares: `RZ, RZ0, ALFA, BETA, HECHO, ACTIVO, NUEVOS, ALFA_LS, PROBANDO, CUADRO, QUIETUD, QMAX, ITER, DG, ALFA_FINAL`); `ENTRADAS` (las 21 entradas de cómputo, en orden de despacho); `interface Distribucion { vf; tf; iu; red; gv; gt; gh; gb }`; `distribuir(p: PaqueteGpu, cuadrosDeHistoria: number): Distribucion`; `tamanosDeBufer(d, p): Record<'pos' | 'vf' | 'tf' | 'iu' | 'red' | 'vals' | 'pv', number>` (bytes, en el orden de las ligaduras 0 a 6); `wgslObstaculos(obs: readonly Obstaculo[]): string`; `wgslDelMotor(s: SistemaTela, p: PaqueteGpu, d: Distribucion): string`.

- [ ] **Step 1: Escribe la prueba que falla**

`src/utils/cloth/implicito/gpu/__tests__/wgsl.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../../sistema';
import { escenaCusick, TELA_DE_LABORATORIO } from '../../banco/escenas';
import { empaquetar } from '../empaquetar';
import { distribuir, ENTRADAS, tamanosDeBufer, wgslDelMotor, wgslObstaculos } from '../wgsl';

describe('el WGSL del motor', () => {
  const e = escenaCusick(20);
  const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos });
  const p = empaquetar(s);
  const fuente = wgslDelMotor(s, p, distribuir(p, 60));

  it('declara cada entrada que despacha el motor', () => {
    for (const nombre of ENTRADAS) expect(fuente).toMatch(new RegExp(`fn ${nombre}\\(`));
  });

  it('no escribe constantes infinitas ni NaN', () => {
    expect(fuente).not.toMatch(/Infinity|NaN/);
  });

  it('sin obstáculos, nadie queda en contacto', () => {
    const sin = wgslObstaculos([]);
    expect(sin).toMatch(/fn masCercano/);
    expect(sin).not.toMatch(/obstaculo0/);
  });

  it('la escena del tamaño de la camiseta cabe en los límites por defecto de WebGPU', () => {
    const g = escenaCusick(5, 480);
    const sg = new SistemaTela(g.malla, TELA_DE_LABORATORIO, { obstaculos: g.obstaculos });
    const pg = empaquetar(sg);
    const tam = tamanosDeBufer(distribuir(pg, 3600), pg);
    expect(sg.n).toBeGreaterThan(25_000);
    // 128 MiB por búfer (maxStorageBufferBindingSize) y 8 búferes por etapa (maxStorageBuffersPerShaderStage)
    for (const bytes of Object.values(tam)) expect(bytes).toBeLessThanOrEqual(128 * 1024 * 1024);
    expect(Object.keys(tam).length).toBeLessThanOrEqual(8);
  }, 180_000);
});
```

- [ ] **Step 2: Corre la prueba y mira que falla**

Run: `npx vitest run src/utils/cloth/implicito/gpu/__tests__/wgsl.test.ts`
Expected: FAIL (`Failed to resolve import "../wgsl"`).

- [ ] **Step 3: Escribe `src/utils/cloth/implicito/gpu/wgsl.ts`**

```ts
/**
 * La memoria de la GPU y el WGSL del motor implícito (spec 2026-10-13 §4.2.2). El WGSL se genera para cada
 * escena: tamaños, desplazamientos, ajustes y obstáculos van como constantes. La física es la de paso.ts,
 * en el mismo orden; el cuadro entero cabe en un pase de cómputo y las sumas se reducen en la GPU.
 */
import type { Obstaculo } from '../obstaculos';
import type { SistemaTela } from '../sistema';
import type { PaqueteGpu } from './empaquetar';

/** Hilos por grupo de trabajo. */
export const WG = 128;

/** Los escalares del cuadro, en la zona SC de `red`. */
export const ESC = {
  RZ: 0, RZ0: 1, ALFA: 2, BETA: 3, HECHO: 4, ACTIVO: 5, NUEVOS: 6, ALFA_LS: 7, PROBANDO: 8,
  CUADRO: 9, QUIETUD: 10, QMAX: 11, ITER: 12, DG: 13, ALFA_FINAL: 14,
} as const;
const N_ESC = 16;

/** Las entradas de cómputo, en el orden en que las despacha un cuadro. */
export const ENTRADAS = [
  'inicio', 'prepTri', 'prepHinge', 'gradElem', 'ensamblar', 'residuo', 'sumarInicio', 'spmv', 'sumarAlfa',
  'actualizar', 'sumarBeta', 'nuevaP', 'anticipar', 'armarRonda2', 'prepBusqueda', 'posPrueba', 'anguloPrueba',
  'difTri', 'decidir', 'aplicar', 'cerrarCuadro',
] as const;

export interface Distribucion {
  /** por vértice, en f32: inicio de cada arreglo */
  vf: { XT: number; V: number; R: number; Z: number; AP: number; DX: number; XP: number; MASA: number; EV0: number; PINV: number; CONT: number; total: number };
  /** por elemento, en f32 */
  tf: { COEF: number; KP: number; PCR: number; TRI: number; E0: number; HD: number; THP: number; CONTRIB: number; total: number };
  /** dónde empieza cada arreglo de índices de `PaqueteGpu['u32']` */
  iu: Record<keyof PaqueteGpu['u32'], number> & { total: number };
  /** tres zonas de sumas parciales, los escalares y la historia de la quietud */
  red: { PA: number; PB: number; PC: number; SC: number; HISTO: number; HIST: number; total: number };
  /** grupos de trabajo por vértice, triángulo, bisagra y bloque */
  gv: number;
  gt: number;
  gh: number;
  gb: number;
}

export function distribuir(p: PaqueteGpu, cuadrosDeHistoria: number): Distribucion {
  const { n, nt, nh } = p;
  const vf = { XT: 0, V: 3 * n, R: 6 * n, Z: 9 * n, AP: 12 * n, DX: 15 * n, XP: 18 * n, MASA: 21 * n, EV0: 22 * n, PINV: 23 * n, CONT: 32 * n, total: 37 * n };
  const tf = {
    COEF: 0, KP: 7 * nt, PCR: 16 * nt, TRI: 18 * nt, E0: 32 * nt, HD: 33 * nt,
    THP: 33 * nt + 16 * nh, CONTRIB: 33 * nt + 17 * nh, total: 78 * nt + 17 * nh,
  };
  const iu = { total: 0 } as Distribucion['iu'];
  for (const k of Object.keys(p.u32) as Array<keyof PaqueteGpu['u32']>) {
    iu[k] = iu.total;
    iu.total += p.u32[k].length;
  }
  const gv = Math.ceil(n / WG), gt = Math.ceil(nt / WG), gh = Math.ceil(nh / WG), gb = Math.ceil(p.nb / WG);
  const zona = Math.max(gv, gt, gh, 1);
  const red = { PA: 0, PB: zona, PC: 2 * zona, SC: 3 * zona, HISTO: 3 * zona + N_ESC, HIST: cuadrosDeHistoria, total: 3 * zona + N_ESC + cuadrosDeHistoria };
  return { vf, tf, iu, red, gv, gt, gh, gb };
}

/** Bytes de cada búfer, en el orden de las ligaduras del WGSL. */
export function tamanosDeBufer(d: Distribucion, p: PaqueteGpu): Record<'pos' | 'vf' | 'tf' | 'iu' | 'red' | 'vals' | 'pv', number> {
  return { pos: 12 * p.n, vf: 4 * d.vf.total, tf: 4 * d.tf.total, iu: 4 * d.iu.total, red: 4 * d.red.total, vals: 48 * Math.max(p.nq, 1), pv: 16 * p.n };
}

function flotante(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`wgsl: constante no finita (${v})`);
  return v.toExponential(8);
}

const entero = (v: number): string => `${v >>> 0}u`;

/** La misma distancia que obstaculos.ts: `masCercano(p)` y `obstaculoK(p, k)` devuelven (d, normal). */
export function wgslObstaculos(obs: readonly Obstaculo[]): string {
  const f = flotante;
  const cuerpos = obs.map((o, k) =>
    o.tipo === 'plano'
      ? `fn obstaculo${k}(p: vec3<f32>) -> vec4<f32> { return vec4<f32>(p.y - ${f(o.altura)}, 0.0, 1.0, 0.0); }`
      : `fn obstaculo${k}(p: vec3<f32>) -> vec4<f32> {
  let radio = ${f(o.radio)};
  let tapa = ${f(o.tapa)};
  let r = length(p.xz);
  var rad = vec2<f32>(1.0, 0.0);
  if (r > 1e-12) { rad = p.xz / r; }
  if (r <= radio && p.y >= tapa) { return vec4<f32>(p.y - tapa, 0.0, 1.0, 0.0); }
  if (r > radio && p.y <= tapa) { return vec4<f32>(r - radio, rad.x, 0.0, rad.y); }
  if (r > radio && p.y > tapa) {
    let a = r - radio;
    let b = p.y - tapa;
    let d = sqrt(a * a + b * b);
    return vec4<f32>(d, a / d * rad.x, b / d, a / d * rad.y);
  }
  if (tapa - p.y < radio - r) { return vec4<f32>(-(tapa - p.y), 0.0, 1.0, 0.0); }
  return vec4<f32>(-(radio - r), rad.x, 0.0, rad.y);
}`,
  );
  return `${cuerpos.join('\n')}
struct Cercano { c: vec4<f32>, k: u32 }
fn obstaculoK(p: vec3<f32>, k: u32) -> vec4<f32> {
${obs.map((_, k) => `  if (k == ${k}u) { return obstaculo${k}(p); }`).join('\n')}
  return vec4<f32>(1e30, 0.0, 1.0, 0.0);
}
fn masCercano(p: vec3<f32>) -> Cercano {
  var m = Cercano(vec4<f32>(1e30, 0.0, 1.0, 0.0), NINGUNA);
${obs.map((_, k) => `  { let c = obstaculo${k}(p); if (c.x < m.c.x) { m = Cercano(c, ${k}u); } }`).join('\n')}
  return m;
}`;
}

/** El WGSL del motor para la escena del sistema `s`, ya empaquetada y distribuida. */
export function wgslDelMotor(s: SistemaTela, p: PaqueteGpu, d: Distribucion): string {
  const f = flotante, u = entero, { aj, tela } = s, { vf, tf, iu, red } = d;
  return /* wgsl */ `// El motor implícito de la tela (spec 2026-10-13 §4.2.2), generado por gpu/wgsl.ts para esta escena.
@group(0) @binding(0) var<storage, read_write> pos: array<f32>;
@group(0) @binding(1) var<storage, read_write> vf: array<f32>;
@group(0) @binding(2) var<storage, read_write> tf: array<f32>;
@group(0) @binding(3) var<storage, read> iu: array<u32>;
@group(0) @binding(4) var<storage, read_write> red: array<f32>;
@group(0) @binding(5) var<storage, read_write> vals: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> pv: array<vec4<f32>>;

const N = ${u(p.n)};
const NT = ${u(p.nt)};
const NH = ${u(p.nh)};
const NB = ${u(p.nb)};
const NQ = ${u(Math.max(p.nq, 1))};
const GV = ${u(d.gv)};
const GT = ${u(d.gt)};
const NINGUNA = 0xffffffffu;
const O_XT = ${u(vf.XT)}; const O_V = ${u(vf.V)}; const O_R = ${u(vf.R)}; const O_Z = ${u(vf.Z)}; const O_AP = ${u(vf.AP)};
const O_DX = ${u(vf.DX)}; const O_XP = ${u(vf.XP)}; const O_MASA = ${u(vf.MASA)}; const O_EV0 = ${u(vf.EV0)};
const O_PINV = ${u(vf.PINV)}; const O_CONT = ${u(vf.CONT)};
const O_COEF = ${u(tf.COEF)}; const O_KP = ${u(tf.KP)}; const O_PCR = ${u(tf.PCR)}; const O_TRI = ${u(tf.TRI)};
const O_E0 = ${u(tf.E0)}; const O_HD = ${u(tf.HD)}; const O_THP = ${u(tf.THP)}; const O_CONTRIB = ${u(tf.CONTRIB)};
const I_TRIS = ${u(iu.tris)}; const I_BIS = ${u(iu.bisagras)}; const I_HOT = ${u(iu.bisDeTri)}; const I_FIJO = ${u(iu.fijo)};
const I_AOFF = ${u(iu.aporOff)}; const I_AIDX = ${u(iu.aporIdx)}; const I_BOFF = ${u(iu.blqOff)}; const I_BCOD = ${u(iu.blqCod)};
const I_BFILA = ${u(iu.blqFila)}; const I_BCOL = ${u(iu.blqCol)}; const I_FBASE = ${u(iu.franjaBase)};
const I_FANCHO = ${u(iu.franjaAncho)}; const I_COLE = ${u(iu.colSell)}; const I_POSDE = ${u(iu.posDe)}; const I_DIAG = ${u(iu.diag)};
const R_PA = ${u(red.PA)}; const R_PB = ${u(red.PB)}; const R_PC = ${u(red.PC)}; const R_SC = ${u(red.SC)};
const R_HISTO = ${u(red.HISTO)}; const HIST = ${u(red.HIST)};
${Object.entries(ESC).map(([k, v]) => `const E_${k} = ${u(v)};`).join('\n')}
const H = ${f(aj.h)};
const AIRE = ${f(aj.aire)};
const KC = ${f(aj.kContacto)};
const GRAV = ${f(aj.gravedad)};
const SEP = ${f(s.sep)};
const TOL2 = ${f(aj.tolCG * aj.tolCG)};
const MGH = ${f(Math.max(p.pesoTotal * aj.h, 1e-30))};
const KU = ${f(tela.kTrama)};
const KV = ${f(tela.kUrdimbre)};
const KS = ${f(tela.kCizalla)};
const BUSQUEDA = ${aj.busqueda};
const I3 = mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);

${wgslObstaculos(s.obstaculos)}

fn ld(o: u32, i: u32) -> vec3<f32> { let b = o + 3u * i; return vec3<f32>(vf[b], vf[b + 1u], vf[b + 2u]); }
fn st(o: u32, i: u32, a: vec3<f32>) { let b = o + 3u * i; vf[b] = a.x; vf[b + 1u] = a.y; vf[b + 2u] = a.z; }
fn ldx(i: u32) -> vec3<f32> { return vec3<f32>(pos[3u * i], pos[3u * i + 1u], pos[3u * i + 2u]); }
fn stx(i: u32, a: vec3<f32>) { pos[3u * i] = a.x; pos[3u * i + 1u] = a.y; pos[3u * i + 2u] = a.z; }
fn ldc(s: u32) -> vec3<f32> { let b = O_CONTRIB + 3u * s; return vec3<f32>(tf[b], tf[b + 1u], tf[b + 2u]); }
fn stc(s: u32, a: vec3<f32>) { let b = O_CONTRIB + 3u * s; tf[b] = a.x; tf[b + 1u] = a.y; tf[b + 2u] = a.z; }
fn hg(e: u32, r: u32) -> vec3<f32> { let b = O_HD + 16u * e + 1u + 3u * r; return vec3<f32>(tf[b], tf[b + 1u], tf[b + 2u]); }
fn outer(a: vec3<f32>, b: vec3<f32>) -> mat3x3<f32> { return mat3x3<f32>(a * b.x, a * b.y, a * b.z); }
fn ld9(q: u32) -> mat3x3<f32> { return transpose(mat3x3<f32>(vals[q].xyz, vals[NQ + q].xyz, vals[2u * NQ + q].xyz)); }

// la ley de membrana.ts: ψ, ψ' y ψ'' con pandeo
fn ley(eps: f32, k: f32, pcr: f32) -> vec3<f32> {
  let ecr = pcr / k;
  if (eps >= -ecr) { return vec3<f32>(0.5 * k * eps * eps, k * eps, k); }
  return vec3<f32>(0.5 * k * ecr * ecr + pcr * (-eps - ecr), -pcr, 0.0);
}

fn inversa3(m: mat3x3<f32>) -> mat3x3<f32> {
  let a = m[0]; let b = m[1]; let c = m[2];
  let r0 = cross(b, c); let r1 = cross(c, a); let r2 = cross(a, b);
  let det = dot(a, r0);
  if (abs(det) < 1e-30) { return mat3x3<f32>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0)); }
  return transpose(mat3x3<f32>(r0, r1, r2)) * (1.0 / det);
}

fn prediccion(i: u32) -> vec3<f32> {
  if (iu[I_FIJO + i] != 0u) { return ld(O_XT, i); }
  return ld(O_XT, i) + H * ld(O_V, i) + vec3<f32>(0.0, H * H * GRAV, 0.0);
}

// inercia, aire y contacto del vértice i en x (sistema.ts, energiaVertice)
fn energiaVertice(i: u32, x: vec3<f32>) -> f32 {
  let m = vf[O_MASA + i];
  let dy = x - prediccion(i);
  let dt = x - ld(O_XT, i);
  var e = m / (2.0 * H * H) * dot(dy, dy) + AIRE * m / (2.0 * H) * dot(dt, dt);
  let p = SEP - masCercano(x).c.x;
  if (p > 0.0) { e += 0.5 * KC * p * p; }
  return e;
}

// el ángulo entre caras y su gradiente (placa.ts, anguloYGradiente)
struct Bisagra { th: f32, ga: vec3<f32>, gb: vec3<f32>, gc: vec3<f32>, gd: vec3<f32> }
fn bisagra(a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> Bisagra {
  let z = vec3<f32>(0.0);
  let ed = b - a;
  let e2 = dot(ed, ed);
  if (e2 < 1e-16) { return Bisagra(0.0, z, z, z, z); }
  let el = sqrt(e2);
  let n1 = cross(a - c, b - c);
  let n2 = cross(b - d, a - d);
  let n1s = dot(n1, n1);
  let n2s = dot(n2, n2);
  if (n1s < 1e-24 || n2s < 1e-24) { return Bisagra(0.0, z, z, z, z); }
  let u1 = n1 / sqrt(n1s);
  let u2 = n2 / sqrt(n2s);
  let th = atan2(dot(cross(u1, u2), ed) / el, clamp(dot(u1, u2), -1.0, 1.0));
  let g1 = n1 / n1s;
  let g2 = n2 / n2s;
  let cb = dot(c - b, ed) / el; let db = dot(d - b, ed) / el; let ac = dot(a - c, ed) / el; let ad = dot(a - d, ed) / el;
  return Bisagra(th, -(g1 * cb + g2 * db), -(g1 * ac + g2 * ad), -g1 * el, -g2 * el);
}

fn soloAngulo(a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> f32 {
  let ed = b - a;
  let e2 = dot(ed, ed);
  if (e2 < 1e-16) { return 0.0; }
  let n1 = cross(a - c, b - c);
  let n2 = cross(b - d, a - d);
  let n1s = dot(n1, n1);
  let n2s = dot(n2, n2);
  if (n1s < 1e-24 || n2s < 1e-24) { return 0.0; }
  let u1 = n1 / sqrt(n1s);
  let u2 = n2 / sqrt(n2s);
  return atan2(dot(cross(u1, u2), ed) / sqrt(e2), clamp(dot(u1, u2), -1.0, 1.0));
}

// el bloque (li, lj) de la membrana del triángulo t (membrana.ts, sumarBloque)
fn bloqueMembrana(t: u32, li: u32, lj: u32) -> mat3x3<f32> {
  let o = O_COEF + 7u * t;
  let ai = tf[o + li]; let bi = tf[o + 3u + li]; let aj = tf[o + lj]; let bj = tf[o + 3u + lj];
  let b = O_TRI + 14u * t;
  let fu = vec3<f32>(tf[b], tf[b + 1u], tf[b + 2u]);
  let fv = vec3<f32>(tf[b + 3u], tf[b + 4u], tf[b + 5u]);
  var nu = vec3<f32>(0.0);
  if (tf[b + 6u] > 1e-12) { nu = fu / tf[b + 6u]; }
  var nv = vec3<f32>(0.0);
  if (tf[b + 7u] > 1e-12) { nv = fv / tf[b + 7u]; }
  let Hu = (tf[b + 10u] - tf[b + 12u]) * outer(nu, nu) + tf[b + 12u] * I3;
  let Hv = (tf[b + 11u] - tf[b + 13u]) * outer(nv, nv) + tf[b + 13u] * I3;
  return tf[o + 6u] * (ai * aj * Hu + bi * bj * Hv + KS * outer(ai * fv + bi * fu, aj * fv + bj * fu));
}

// el bloque (i, j) de la placa del triángulo t (placa.ts, sumarBloque)
fn bloquePlaca(t: u32, i: u32, j: u32) -> mat3x3<f32> {
  var gi = array<vec3<f32>, 3>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  var gj = array<vec3<f32>, 3>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  for (var k = 0u; k < 3u; k++) {
    let h = iu[I_HOT + 3u * t + k];
    if (h == NINGUNA) { continue; }
    for (var r = 0u; r < 4u; r++) {
      let v = iu[I_BIS + 4u * h + r];
      if (v == i) { gi[k] = hg(h, r); }
      if (v == j) { gj[k] = hg(h, r); }
    }
  }
  var M = mat3x3<f32>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  for (var k = 0u; k < 3u; k++) {
    for (var l = 0u; l < 3u; l++) { M += tf[O_KP + 9u * t + 3u * k + l] * outer(gi[k], gj[l]); }
  }
  return M;
}

var<workgroup> sh: array<f32, ${WG}>;
var<workgroup> wBandera: u32;

// una bandera de red[] leída de forma uniforme en el grupo: permite salir antes de una reducción
fn bandera(lid: u32, k: u32) -> bool {
  if (lid == 0u) { wBandera = select(0u, 1u, red[R_SC + k] > 0.5); }
  return workgroupUniformLoad(&wBandera) == 1u;
}

fn reducirSuma(lid: u32, v: f32) -> f32 {
  sh[lid] = v;
  workgroupBarrier();
  for (var paso = ${WG / 2}u; paso > 0u; paso = paso / 2u) {
    if (lid < paso) { sh[lid] = sh[lid] + sh[lid + paso]; }
    workgroupBarrier();
  }
  let t = sh[0];
  workgroupBarrier();
  return t;
}

fn reducirMax(lid: u32, v: f32) -> f32 {
  sh[lid] = v;
  workgroupBarrier();
  for (var paso = ${WG / 2}u; paso > 0u; paso = paso / 2u) {
    if (lid < paso) { sh[lid] = max(sh[lid], sh[lid + paso]); }
    workgroupBarrier();
  }
  let t = sh[0];
  workgroupBarrier();
  return t;
}

// 1. x_t, los contactos de partida y la energía de cada vértice al empezar
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
  let o = O_CONT + 5u * i;
  let c = masCercano(x);
  let p0 = SEP - c.c.x;
  if (p0 > 0.0 && iu[I_FIJO + i] == 0u) {
    vf[o] = 1.0; vf[o + 1u] = c.c.y; vf[o + 2u] = c.c.z; vf[o + 3u] = c.c.w; vf[o + 4u] = p0;
  } else {
    vf[o] = 0.0;
  }
  vf[O_EV0 + i] = energiaVertice(i, x);
}

// 2. la membrana linealizada de cada triángulo (la disposición de membrana.ts)
@compute @workgroup_size(${WG}) fn prepTri(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = g.x;
  if (t >= NT) { return; }
  let o = O_COEF + 7u * t;
  // con diferencias desde el primer vértice: Σ a_k = 0 y así no se restan números grandes
  let p0 = ldx(iu[I_TRIS + 3u * t]);
  let d1 = ldx(iu[I_TRIS + 3u * t + 1u]) - p0;
  let d2 = ldx(iu[I_TRIS + 3u * t + 2u]) - p0;
  let fu = tf[o + 1u] * d1 + tf[o + 2u] * d2;
  let fv = tf[o + 4u] * d1 + tf[o + 5u] * d2;
  let su = length(fu);
  let sv = length(fv);
  let lu = ley(su - 1.0, KU, tf[O_PCR + 2u * t]);
  let lv = ley(sv - 1.0, KV, tf[O_PCR + 2u * t + 1u]);
  var gu = 0.0;
  if (su > 1e-12) { gu = lu.y / su; }
  var gv = 0.0;
  if (sv > 1e-12) { gv = lv.y / sv; }
  let b = O_TRI + 14u * t;
  tf[b] = fu.x; tf[b + 1u] = fu.y; tf[b + 2u] = fu.z;
  tf[b + 3u] = fv.x; tf[b + 4u] = fv.y; tf[b + 5u] = fv.z;
  tf[b + 6u] = su; tf[b + 7u] = sv; tf[b + 8u] = gu; tf[b + 9u] = gv;
  tf[b + 10u] = lu.z; tf[b + 11u] = lv.z; tf[b + 12u] = max(gu, 0.0); tf[b + 13u] = max(gv, 0.0);
  let gam = dot(fu, fv);
  tf[O_E0 + t] = tf[o + 6u] * (lu.x + lv.x + 0.5 * KS * gam * gam);
}

// 3. el ángulo y su gradiente en cada bisagra
@compute @workgroup_size(${WG}) fn prepHinge(@builtin(global_invocation_id) g: vec3<u32>) {
  let e = g.x;
  if (e >= NH) { return; }
  let b = I_BIS + 4u * e;
  let r = bisagra(ldx(iu[b]), ldx(iu[b + 1u]), ldx(iu[b + 2u]), ldx(iu[b + 3u]));
  let o = O_HD + 16u * e;
  tf[o] = r.th;
  tf[o + 1u] = r.ga.x; tf[o + 2u] = r.ga.y; tf[o + 3u] = r.ga.z;
  tf[o + 4u] = r.gb.x; tf[o + 5u] = r.gb.y; tf[o + 6u] = r.gb.z;
  tf[o + 7u] = r.gc.x; tf[o + 8u] = r.gc.y; tf[o + 9u] = r.gc.z;
  tf[o + 10u] = r.gd.x; tf[o + 11u] = r.gd.y; tf[o + 12u] = r.gd.z;
}

// 4. los aportes de cada triángulo al gradiente y su energía al empezar (membrana + placa)
@compute @workgroup_size(${WG}) fn gradElem(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = g.x;
  if (t >= NT) { return; }
  let o = O_COEF + 7u * t;
  let A0 = tf[o + 6u];
  let b = O_TRI + 14u * t;
  let fu = vec3<f32>(tf[b], tf[b + 1u], tf[b + 2u]);
  let fv = vec3<f32>(tf[b + 3u], tf[b + 4u], tf[b + 5u]);
  let gu = tf[b + 8u];
  let gv = tf[b + 9u];
  let ks = KS * dot(fu, fv);
  for (var j = 0u; j < 3u; j++) {
    let aj = tf[o + j];
    let bj = tf[o + 3u + j];
    stc(3u * t + j, A0 * (gu * aj * fu + gv * bj * fv + ks * (aj * fv + bj * fu)));
  }
  var th = vec3<f32>(0.0);
  for (var k = 0u; k < 3u; k++) {
    let h = iu[I_HOT + 3u * t + k];
    if (h != NINGUNA) { th[k] = tf[O_HD + 16u * h]; }
  }
  var eplaca = 0.0;
  for (var k = 0u; k < 3u; k++) {
    let o9 = O_KP + 9u * t + 3u * k;
    let w = tf[o9] * th.x + tf[o9 + 1u] * th.y + tf[o9 + 2u] * th.z;
    eplaca += 0.5 * th[k] * w;
    let h = iu[I_HOT + 3u * t + k];
    if (h == NINGUNA) { continue; }
    for (var r = 0u; r < 4u; r++) { stc(3u * NT + 12u * t + 4u * k + r, w * hg(h, r)); }
  }
  tf[O_E0 + t] += eplaca;
}

// 5. cada bloque de la matriz, sumando los elementos que lo tocan; se guarda en franjas de 32 filas
@compute @workgroup_size(${WG}) fn ensamblar(@builtin(global_invocation_id) g: vec3<u32>) {
  let b = g.x;
  if (b >= NB) { return; }
  let i = iu[I_BFILA + b];
  let j = iu[I_BCOL + b];
  var M = mat3x3<f32>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  for (var s = iu[I_BOFF + b]; s < iu[I_BOFF + b + 1u]; s++) {
    let cod = iu[I_BCOD + s];
    if (cod >= 0x80000000u) { M += bloquePlaca(cod - 0x80000000u, i, j); }
    else { M += bloqueMembrana(cod >> 4u, (cod >> 2u) & 3u, cod & 3u); }
  }
  let q = iu[I_POSDE + b];
  let Mt = transpose(M);
  vals[q] = vec4<f32>(Mt[0], 0.0);
  vals[NQ + q] = vec4<f32>(Mt[1], 0.0);
  vals[2u * NQ + q] = vec4<f32>(Mt[2], 0.0);
}

// 6. el residuo, el precondicionador de bloques y el arranque del gradiente conjugado (Δ = 0)
@compute @workgroup_size(${WG}) fn residuo(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  let i = g.x;
  var rz = 0.0;
  if (i < N) {
    var grad = vec3<f32>(0.0);
    for (var s = iu[I_AOFF + i]; s < iu[I_AOFF + i + 1u]; s++) { grad += ldc(iu[I_AIDX + s]); }
    let m = vf[O_MASA + i];
    // en x = x_t: −(m/h²)·(x − y) = (m/h)·v + m·g, y el aire todavía no empuja
    var r = -grad + (m / H) * ld(O_V, i) + vec3<f32>(0.0, m * GRAV, 0.0);
    var B = ld9(iu[I_DIAG + i]) + (m / (H * H) + AIRE * m / H) * I3;
    let o = O_CONT + 5u * i;
    if (vf[o] > 0.5) {
      let nn = vec3<f32>(vf[o + 1u], vf[o + 2u], vf[o + 3u]);
      r += KC * vf[o + 4u] * nn;
      B += KC * outer(nn, nn);
    }
    if (iu[I_FIJO + i] != 0u) { r = vec3<f32>(0.0); }
    let Bi = inversa3(B);
    for (var a = 0u; a < 3u; a++) {
      for (var c = 0u; c < 3u; c++) { vf[O_PINV + 9u * i + 3u * a + c] = Bi[c][a]; }
    }
    let z = Bi * r;
    st(O_R, i, r);
    st(O_Z, i, z);
    pv[i] = vec4<f32>(z, 0.0);
    st(O_DX, i, vec3<f32>(0.0));
    rz = dot(r, z);
  }
  let total = reducirSuma(l.x, rz);
  if (l.x == 0u) { red[R_PA + w.x] = total; }
}

@compute @workgroup_size(1) fn sumarInicio() {
  if (red[R_SC + E_ACTIVO] < 0.5) { return; }
  var s = 0.0;
  for (var k = 0u; k < GV; k++) { s += red[R_PA + k]; }
  red[R_SC + E_RZ] = s;
  red[R_SC + E_RZ0] = s;
  red[R_SC + E_HECHO] = 0.0;
}

// 7. gradiente conjugado: A·p con la matriz en franjas, la diagonal de la inercia y el contacto
@compute @workgroup_size(${WG}) fn spmv(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  let i = g.x;
  var pap = 0.0;
  if (i < N) {
    let f = i >> 5u;
    let carril = i & 31u;
    let base = iu[I_FBASE + f];
    let ancho = iu[I_FANCHO + f];
    var ap = vec3<f32>(0.0);
    for (var k = 0u; k < ancho; k++) {
      let q = base + 32u * k + carril;
      let j = iu[I_COLE + q];
      if (j == NINGUNA) { continue; }
      let pj = pv[j];
      ap += vec3<f32>(dot(vals[q], pj), dot(vals[NQ + q], pj), dot(vals[2u * NQ + q], pj));
    }
    let m = vf[O_MASA + i];
    let p = pv[i].xyz;
    ap += (m / (H * H) + AIRE * m / H) * p;
    let o = O_CONT + 5u * i;
    if (vf[o] > 0.5) {
      let nn = vec3<f32>(vf[o + 1u], vf[o + 2u], vf[o + 3u]);
      ap += KC * dot(nn, p) * nn;
    }
    if (iu[I_FIJO + i] != 0u) { ap = vec3<f32>(0.0); }
    st(O_AP, i, ap);
    pap = dot(p, ap);
  }
  let total = reducirSuma(l.x, pap);
  if (l.x == 0u) { red[R_PA + w.x] = total; }
}

@compute @workgroup_size(1) fn sumarAlfa() {
  if (red[R_SC + E_ACTIVO] < 0.5) { return; }
  var pap = 0.0;
  for (var k = 0u; k < GV; k++) { pap += red[R_PA + k]; }
  if (red[R_SC + E_HECHO] > 0.5 || !(pap > 0.0)) {
    red[R_SC + E_ALFA] = 0.0;
    red[R_SC + E_HECHO] = 1.0;
    return;
  }
  red[R_SC + E_ALFA] = red[R_SC + E_RZ] / pap;
  red[R_SC + E_ITER] = red[R_SC + E_ITER] + 1.0;
}

@compute @workgroup_size(${WG}) fn actualizar(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  let i = g.x;
  var rz = 0.0;
  if (i < N) {
    let alfa = red[R_SC + E_ALFA];
    st(O_DX, i, ld(O_DX, i) + alfa * pv[i].xyz);
    let r = ld(O_R, i) - alfa * ld(O_AP, i);
    st(O_R, i, r);
    let o = O_PINV + 9u * i;
    let z = vec3<f32>(
      vf[o] * r.x + vf[o + 1u] * r.y + vf[o + 2u] * r.z,
      vf[o + 3u] * r.x + vf[o + 4u] * r.y + vf[o + 5u] * r.z,
      vf[o + 6u] * r.x + vf[o + 7u] * r.y + vf[o + 8u] * r.z);
    st(O_Z, i, z);
    rz = dot(r, z);
  }
  let total = reducirSuma(l.x, rz);
  if (l.x == 0u) { red[R_PA + w.x] = total; }
}

@compute @workgroup_size(1) fn sumarBeta() {
  if (red[R_SC + E_ACTIVO] < 0.5 || red[R_SC + E_HECHO] > 0.5) { return; }
  var rzn = 0.0;
  for (var k = 0u; k < GV; k++) { rzn += red[R_PA + k]; }
  if (rzn <= TOL2 * red[R_SC + E_RZ0]) {
    red[R_SC + E_HECHO] = 1.0;
    return;
  }
  red[R_SC + E_BETA] = rzn / red[R_SC + E_RZ];
  red[R_SC + E_RZ] = rzn;
}

@compute @workgroup_size(${WG}) fn nuevaP(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  let i = g.x;
  if (i >= N) { return; }
  pv[i] = vec4<f32>(ld(O_Z, i) + red[R_SC + E_BETA] * pv[i].xyz, 0.0);
}

// 8. anticipación: los vértices que el paso metería en un obstáculo entran al sistema
@compute @workgroup_size(${WG}) fn anticipar(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  let i = g.x;
  var nuevo = 0.0;
  if (i < N) {
    let o = O_CONT + 5u * i;
    if (iu[I_FIJO + i] == 0u && vf[o] < 0.5) {
      let x = ldx(i);
      let c = masCercano(x + ld(O_DX, i));
      if (SEP - c.c.x > 0.0) {
        vf[o] = 1.0; vf[o + 1u] = c.c.y; vf[o + 2u] = c.c.z; vf[o + 3u] = c.c.w;
        vf[o + 4u] = SEP - obstaculoK(x, c.k).x;
        nuevo = 1.0;
      }
    }
  }
  let total = reducirSuma(l.x, nuevo);
  if (l.x == 0u) { red[R_PA + w.x] = total; }
}

@compute @workgroup_size(1) fn armarRonda2() {
  var s = 0.0;
  for (var k = 0u; k < GV; k++) { s += red[R_PA + k]; }
  red[R_SC + E_NUEVOS] = s;
  red[R_SC + E_ACTIVO] = select(0.0, 1.0, s > 0.5);
}

// 9. búsqueda en línea: α = 1, ½, … mientras G suba; se compara la suma de las diferencias por elemento
@compute @workgroup_size(1) fn prepBusqueda() {
  red[R_SC + E_ALFA_LS] = 1.0;
  red[R_SC + E_PROBANDO] = 1.0;
}

@compute @workgroup_size(${WG}) fn posPrueba(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_PROBANDO)) { return; }
  let i = g.x;
  var de = 0.0;
  if (i < N) {
    let xp = ld(O_XT, i) + red[R_SC + E_ALFA_LS] * ld(O_DX, i);
    st(O_XP, i, xp);
    de = energiaVertice(i, xp) - vf[O_EV0 + i];
  }
  let total = reducirSuma(l.x, de);
  if (l.x == 0u) { red[R_PB + w.x] = total; }
}

@compute @workgroup_size(${WG}) fn anguloPrueba(@builtin(global_invocation_id) g: vec3<u32>) {
  let e = g.x;
  if (e >= NH || red[R_SC + E_PROBANDO] < 0.5) { return; }
  let b = I_BIS + 4u * e;
  tf[O_THP + e] = soloAngulo(ld(O_XP, iu[b]), ld(O_XP, iu[b + 1u]), ld(O_XP, iu[b + 2u]), ld(O_XP, iu[b + 3u]));
}

@compute @workgroup_size(${WG}) fn difTri(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_PROBANDO)) { return; }
  let t = g.x;
  var de = 0.0;
  if (t < NT) {
    let o = O_COEF + 7u * t;
    let p0 = ld(O_XP, iu[I_TRIS + 3u * t]);
    let d1 = ld(O_XP, iu[I_TRIS + 3u * t + 1u]) - p0;
    let d2 = ld(O_XP, iu[I_TRIS + 3u * t + 2u]) - p0;
    let fu = tf[o + 1u] * d1 + tf[o + 2u] * d2;
    let fv = tf[o + 4u] * d1 + tf[o + 5u] * d2;
    let gam = dot(fu, fv);
    var e = tf[o + 6u] * (ley(length(fu) - 1.0, KU, tf[O_PCR + 2u * t]).x + ley(length(fv) - 1.0, KV, tf[O_PCR + 2u * t + 1u]).x + 0.5 * KS * gam * gam);
    var th = vec3<f32>(0.0);
    for (var k = 0u; k < 3u; k++) {
      let h = iu[I_HOT + 3u * t + k];
      if (h != NINGUNA) { th[k] = tf[O_THP + h]; }
    }
    for (var k = 0u; k < 3u; k++) {
      for (var q = 0u; q < 3u; q++) { e += 0.5 * tf[O_KP + 9u * t + 3u * k + q] * th[k] * th[q]; }
    }
    de = e - tf[O_E0 + t];
  }
  let total = reducirSuma(l.x, de);
  if (l.x == 0u) { red[R_PC + w.x] = total; }
}

@compute @workgroup_size(1) fn decidir() {
  if (red[R_SC + E_PROBANDO] < 0.5) { return; }
  var dg = 0.0;
  for (var k = 0u; k < GV; k++) { dg += red[R_PB + k]; }
  for (var k = 0u; k < GT; k++) { dg += red[R_PC + k]; }
  red[R_SC + E_DG] = dg;
  if (dg <= 0.0) { red[R_SC + E_PROBANDO] = 0.0; } else { red[R_SC + E_ALFA_LS] = 0.5 * red[R_SC + E_ALFA_LS]; }
}

// 10. el paso aceptado, la velocidad y la quietud (quietud.ts)
@compute @workgroup_size(${WG}) fn aplicar(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  let i = g.x;
  var mv = 0.0;
  var vmax = 0.0;
  if (i < N) {
    var alfa = 1.0;
    if (BUSQUEDA) { alfa = select(0.0, red[R_SC + E_ALFA_LS], red[R_SC + E_PROBANDO] < 0.5); }
    let dx = alfa * ld(O_DX, i);
    stx(i, ld(O_XT, i) + dx);
    st(O_V, i, dx / H);
    if (iu[I_FIJO + i] == 0u) {
      let rapidez = length(dx) / H;
      mv = vf[O_MASA + i] * rapidez;
      vmax = rapidez;
    }
  }
  let a = reducirSuma(l.x, mv);
  if (l.x == 0u) { red[R_PA + w.x] = a; }
  let b = reducirMax(l.x, vmax);
  if (l.x == 0u) { red[R_PB + w.x] = b; }
}

@compute @workgroup_size(1) fn cerrarCuadro() {
  var s = 0.0;
  var mx = 0.0;
  for (var k = 0u; k < GV; k++) {
    s += red[R_PA + k];
    mx = max(mx, red[R_PB + k]);
  }
  let q = s / MGH;
  red[R_SC + E_QUIETUD] = q;
  red[R_SC + E_QMAX] = mx / (abs(GRAV) * H);
  var alfa = 1.0;
  if (BUSQUEDA) { alfa = select(0.0, red[R_SC + E_ALFA_LS], red[R_SC + E_PROBANDO] < 0.5); }
  red[R_SC + E_ALFA_FINAL] = alfa;
  let c = u32(red[R_SC + E_CUADRO]);
  if (c < HIST) { red[R_HISTO + c] = q; }
  red[R_SC + E_CUADRO] = red[R_SC + E_CUADRO] + 1.0;
}
`;
}
```

- [ ] **Step 4: Corre la prueba y mira que pasa**

Run: `node scripts/pesado.mjs --nombre=prueba-wgsl --espera=10 -- npx vitest run src/utils/cloth/implicito/gpu/__tests__/wgsl.test.ts`
Expected: PASS, 4 pruebas. La de la escena grande arma unos 29 mil vértices y tarda unos segundos; por eso corre con el candado. El WGSL todavía no se compila: eso lo hace el navegador en la Tarea 12.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/gpu/wgsl.ts src/utils/cloth/implicito/gpu/__tests__/wgsl.test.ts
git commit -m "feat(tela): el WGSL del motor implícito" -m "El cuadro de paso.ts escrito para la GPU: la membrana y la placa linealizadas, la matriz armada por bloques en franjas de 32 filas, el gradiente conjugado con las sumas reducidas en la GPU, la anticipación de contactos, la búsqueda en línea y la quietud. Las posiciones viven en su propio búfer."
```

---
### Tarea 12: El motor en la GPU, su escena DEV y su prueba @gpu-local

Antes de tocar `src/components/` invoca la skill `contrato-de-interfaz`. La escena DEV no tiene interfaz: muestra un `<pre>` sin estilos, así que el contrato queda intacto. `npm run lint:ui` lo confirma.

**Files:**
- Create: `src/utils/cloth/implicito/gpu/motorGpu.ts`
- Create: `src/components/testScenes/TelaImplicitaHarness.tsx`
- Modify: `src/App.tsx:11-12` (carga diferida) y `src/App.tsx:33-41` (ruta DEV después de la de `cusick`)
- Test: `tests/e2e/tela-implicita.spec.ts`

**Interfaces:**
- Consumes: `empaquetar`, `PaqueteGpu` (Tarea 10); `distribuir`, `ENTRADAS`, `ESC`, `wgslDelMotor`, `Distribucion` (Tarea 11); `SistemaTela` (Tarea 6); `pasoImplicito`, `VigiaDeQuietud` (Tarea 7); `escenaCusick`, `TELA_DE_LABORATORIO` (Tarea 1).
- Produces: `interface EstadoGpu { cuadro; cg; anticipados; alfa; quietud; quietudMaxima }`; `class MotorGpu` con `static crear(device: GPUDevice, s: SistemaTela, cuadrosDeHistoria = 3600): Promise<MotorGpu>`, `grabarCuadro(pase: GPUComputePassEncoder): void`, `avanzar(cuadros: number): Promise<void>`, `leerPosiciones(): Promise<Float32Array>`, `leerEstado(): Promise<EstadoGpu>`, `leerQuietud(desde: number, cuantos: number): Promise<Float32Array>` y `destruir(): void`. La escena DEV publica `window.__TELA_IMPLICITA__`.

- [ ] **Step 1: Escribe la prueba @gpu-local que falla**

`tests/e2e/tela-implicita.spec.ts`:

```ts
/**
 * La tela nueva en la GPU (spec docs/superpowers/specs/2026-10-13-tela-nueva-design.md §4.4.3) — @gpu-local:
 * corre con playwright.webgpu.config.ts (GPU real, con ventana); CI no tiene GPU.
 *
 * La compuerta es que la GPU dé lo mismo que la CPU: menos de 0,1 mm tras 3 cuadros (§2). La velocidad y la
 * quietud se miden y quedan en el reporte; la meta de velocidad es de la camiseta, en la entrega 4.
 */
import { test, expect, type Page } from '@playwright/test';

interface ResultadoTela {
  modo: string;
  escena: string;
  vertices: number;
  gpu: string;
  dif?: { maxima: number; media: number };
  msPorCuadro?: number;
  segundosHastaQuieta?: number | null;
  estado?: { cuadro: number; cg: number; anticipados: number; alfa: number; quietud: number; quietudMaxima: number };
  error?: string;
}

async function correr(page: Page, consulta: string): Promise<ResultadoTela> {
  await page.goto(`/app/?testScene=tela-implicita&${consulta}`);
  await page.waitForFunction(
    () => (window as unknown as { __TELA_IMPLICITA__?: unknown }).__TELA_IMPLICITA__ !== undefined,
    undefined,
    { timeout: 280_000 },
  );
  const r = await page.evaluate(() => (window as unknown as { __TELA_IMPLICITA__: ResultadoTela }).__TELA_IMPLICITA__);
  console.log(`[tela-implicita] ${JSON.stringify(r)}`);
  expect(r.error, r.error).toBeUndefined();
  return r;
}

test.describe('La tela nueva en la GPU @gpu-local', () => {
  test.setTimeout(300_000);

  test('da lo mismo que la CPU tras 3 cuadros (disco de 10 mm)', async ({ page }) => {
    const r = await correr(page, 'modo=paridad&escena=chica&cg=50&cuadros=3');
    expect(r.dif?.maxima).toBeLessThan(1e-4);
  });

  for (const cg of [20, 50]) {
    test(`velocidad con unos 29 mil vértices y ${cg} iteraciones`, async ({ page }) => {
      const r = await correr(page, `modo=velocidad&escena=grande&cg=${cg}&cuadros=60`);
      expect(r.msPorCuadro).toBeGreaterThan(0);
    });
  }

  test('segundos de tela hasta quedar quieta (disco de 10 mm)', async ({ page }) => {
    const r = await correr(page, 'modo=quietud&escena=chica&cg=50');
    expect(r.estado?.quietud).not.toBeNaN();
  });
});
```

- [ ] **Step 2: Comprueba que Playwright la encuentra**

Run: `npx playwright test --config playwright.webgpu.config.ts --list tests/e2e/tela-implicita.spec.ts`
Expected: 4 pruebas listadas. No la corras todavía: sin la escena, cada prueba se queda esperando `__TELA_IMPLICITA__` hasta agotar sus 280 s, con el candado de la GPU tomado.

- [ ] **Step 3: Escribe `src/utils/cloth/implicito/gpu/motorGpu.ts`**

```ts
/**
 * El motor implícito en la GPU (spec 2026-10-13 §4.2.2): el mismo cuadro que paso.ts, en WGSL, sobre un
 * GPUDevice que recibe de afuera. El cuadro entero va en un pase de cómputo y los escalares no salen de la
 * GPU; solo se leen cuando alguien los pide.
 */
import type { SistemaTela } from '../sistema';
import { empaquetar, type PaqueteGpu } from './empaquetar';
import { distribuir, ENTRADAS, ESC, wgslDelMotor, type Distribucion } from './wgsl';

type Entrada = (typeof ENTRADAS)[number];
type Bufer = 'pos' | 'vf' | 'tf' | 'iu' | 'red' | 'vals' | 'pv';
/** En el orden de las ligaduras del WGSL. */
const BUFERES: Bufer[] = ['pos', 'vf', 'tf', 'iu', 'red', 'vals', 'pv'];

/** Lo que dejó el último cuadro: iteraciones, contactos anticipados, paso aceptado y quietud (§4.2.4). */
export interface EstadoGpu {
  cuadro: number;
  cg: number;
  anticipados: number;
  alfa: number;
  quietud: number;
  quietudMaxima: number;
}

export class MotorGpu {
  private constructor(
    private readonly device: GPUDevice,
    readonly s: SistemaTela,
    private readonly d: Distribucion,
    private readonly b: Record<Bufer, GPUBuffer>,
    private readonly grupo: GPUBindGroup,
    private readonly k: Record<Entrada, GPUComputePipeline>,
  ) {}

  static async crear(device: GPUDevice, s: SistemaTela, cuadrosDeHistoria = 3600): Promise<MotorGpu> {
    const p = empaquetar(s);
    const d = distribuir(p, cuadrosDeHistoria);
    const modulo = device.createShaderModule({ code: wgslDelMotor(s, p, d) });
    const errores = (await modulo.getCompilationInfo()).messages.filter((m) => m.type === 'error');
    if (errores.length > 0) throw new Error(`WGSL del motor: ${errores.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join(' | ')}`);

    const vf = new Float32Array(d.vf.total);
    vf.set(p.f32.x, d.vf.XT);
    vf.set(p.f32.masa, d.vf.MASA);
    const tf = new Float32Array(d.tf.total);
    tf.set(p.f32.coef, d.tf.COEF);
    tf.set(p.f32.K, d.tf.KP);
    tf.set(p.f32.pcr, d.tf.PCR);
    const iu = new Uint32Array(d.iu.total);
    for (const clave of Object.keys(p.u32) as Array<keyof PaqueteGpu['u32']>) iu.set(p.u32[clave], d.iu[clave]);
    const datos: Record<Bufer, Float32Array | Uint32Array> = {
      pos: p.f32.x,
      vf,
      tf,
      iu,
      red: new Float32Array(d.red.total),
      vals: new Float32Array(12 * Math.max(p.nq, 1)),
      pv: new Float32Array(4 * p.n),
    };
    const b = {} as Record<Bufer, GPUBuffer>;
    for (const nombre of BUFERES) {
      b[nombre] = device.createBuffer({
        size: Math.max(16, datos[nombre].byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      device.queue.writeBuffer(b[nombre], 0, datos[nombre]);
    }
    const disposicion = device.createBindGroupLayout({
      entries: BUFERES.map((nombre, binding) => ({
        binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: (nombre === 'iu' ? 'read-only-storage' : 'storage') as GPUBufferBindingType },
      })),
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [disposicion] });
    const grupo = device.createBindGroup({ layout: disposicion, entries: BUFERES.map((nombre, binding) => ({ binding, resource: { buffer: b[nombre] } })) });
    const tuberias = await Promise.all(ENTRADAS.map((entryPoint) => device.createComputePipelineAsync({ layout, compute: { module: modulo, entryPoint } })));
    const k = Object.fromEntries(ENTRADAS.map((e, i) => [e, tuberias[i]])) as Record<Entrada, GPUComputePipeline>;
    return new MotorGpu(device, s, d, b, grupo, k);
  }

  /** Graba un cuadro completo en el pase, en el orden de paso.ts. */
  grabarCuadro(pase: GPUComputePassEncoder): void {
    const { aj } = this.s, { gv, gt, gh, gb } = this.d;
    const d = (e: Entrada, grupos: number) => {
      pase.setPipeline(this.k[e]);
      pase.dispatchWorkgroups(grupos);
    };
    const ronda = () => {
      d('residuo', gv);
      d('sumarInicio', 1);
      for (let k = 0; k < aj.maxCG; k++) {
        d('spmv', gv);
        d('sumarAlfa', 1);
        d('actualizar', gv);
        d('sumarBeta', 1);
        d('nuevaP', gv);
      }
    };
    pase.setBindGroup(0, this.grupo);
    d('inicio', gv);
    d('prepTri', gt);
    d('prepHinge', gh);
    d('gradElem', gt);
    d('ensamblar', gb);
    ronda();
    // ponytail: la segunda ronda y los intentos de la búsqueda se despachan siempre y salen enseguida si no
    // hacen falta (cuestan los despachos vacíos); pasar a despacho indirecto cuando se optimice la velocidad
    if (aj.anticipar && this.s.obstaculos.length > 0) {
      d('anticipar', gv);
      d('armarRonda2', 1);
      ronda();
    }
    if (aj.busqueda) {
      d('prepBusqueda', 1);
      for (let intento = 0; intento < 8; intento++) {
        d('posPrueba', gv);
        d('anguloPrueba', gh);
        d('difTri', gt);
        d('decidir', 1);
      }
    }
    d('aplicar', gv);
    d('cerrarCuadro', 1);
  }

  /** Avanza `cuadros` cuadros, un envío por cuadro, y espera a la GPU. */
  async avanzar(cuadros: number): Promise<void> {
    for (let c = 0; c < cuadros; c++) {
      const enc = this.device.createCommandEncoder();
      const pase = enc.beginComputePass();
      this.grabarCuadro(pase);
      pase.end();
      this.device.queue.submit([enc.finish()]);
    }
    await this.device.queue.onSubmittedWorkDone();
  }

  private async leer(nombre: Bufer, desde: number, bytes: number): Promise<ArrayBuffer> {
    const lectura = this.device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.b[nombre], desde, lectura, 0, bytes);
    this.device.queue.submit([enc.finish()]);
    await lectura.mapAsync(GPUMapMode.READ);
    const copia = lectura.getMappedRange().slice(0);
    lectura.unmap();
    lectura.destroy();
    return copia;
  }

  async leerPosiciones(): Promise<Float32Array> {
    return new Float32Array(await this.leer('pos', 0, 12 * this.s.n));
  }

  async leerEstado(): Promise<EstadoGpu> {
    const e = new Float32Array(await this.leer('red', 4 * this.d.red.SC, 4 * 16));
    return { cuadro: e[ESC.CUADRO], cg: e[ESC.ITER], anticipados: e[ESC.NUEVOS], alfa: e[ESC.ALFA_FINAL], quietud: e[ESC.QUIETUD], quietudMaxima: e[ESC.QMAX] };
  }

  /** La quietud de los cuadros [desde, desde + cuantos). */
  async leerQuietud(desde: number, cuantos: number): Promise<Float32Array> {
    return new Float32Array(await this.leer('red', 4 * (this.d.red.HISTO + desde), 4 * cuantos));
  }

  destruir(): void {
    for (const nombre of BUFERES) this.b[nombre].destroy();
  }
}
```

- [ ] **Step 4: Escribe la escena DEV y móntala en `App.tsx`**

`src/components/testScenes/TelaImplicitaHarness.tsx`:

```tsx
/**
 * La tela nueva en la GPU (spec docs/superpowers/specs/2026-10-13-tela-nueva-design.md §4.4.3): paridad
 * con la CPU, velocidad y segundos hasta quedar quieta.
 *
 * DEV-only: App.tsx la monta con `?testScene=tela-implicita` y reemplaza la app entera. La consume
 * tests/e2e/tela-implicita.spec.ts (@gpu-local). Parámetros: `modo` = paridad | velocidad | quietud;
 * `escena` = chica (disco Cusick de 10 mm) | grande (disco de 48 cm con malla de 5 mm, del tamaño de la
 * camiseta); `cg` = iteraciones por ronda; `cuadros`; `anticipar=0` y `busqueda=0` apagan esos pasos para
 * aislar una diferencia. Publica el resultado en `window.__TELA_IMPLICITA__`.
 */
import { useEffect, useState } from 'react';
import { escenaCusick, TELA_DE_LABORATORIO } from '../../utils/cloth/implicito/banco/escenas';
import { SistemaTela } from '../../utils/cloth/implicito/sistema';
import { pasoImplicito } from '../../utils/cloth/implicito/paso';
import { VigiaDeQuietud } from '../../utils/cloth/implicito/quietud';
import { MotorGpu, type EstadoGpu } from '../../utils/cloth/implicito/gpu/motorGpu';

interface Resultado {
  modo: string;
  escena: string;
  vertices: number;
  gpu: string;
  dif?: { maxima: number; media: number };
  msPorCuadro?: number;
  segundosHastaQuieta?: number | null;
  estado?: EstadoGpu;
  error?: string;
}

async function correr(q: URLSearchParams): Promise<Resultado> {
  const modo = q.get('modo') ?? 'paridad';
  const escena = q.get('escena') ?? 'chica';
  const e = escena === 'grande' ? escenaCusick(5, 480) : escenaCusick(10);
  const ajustes = {
    maxCG: Number(q.get('cg') ?? 50),
    // en la paridad, todas las iteraciones en las dos: la tolerancia no decide nada
    tolCG: modo === 'paridad' ? 0 : 1e-4,
    anticipar: q.get('anticipar') !== '0',
    busqueda: q.get('busqueda') !== '0',
  };
  const nuevo = () => new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos, ajustes });
  const s = nuevo();
  const adaptador = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adaptador) throw new Error('este navegador no tiene WebGPU');
  const device = await adaptador.requestDevice();
  const { vendor, architecture, description } = adaptador.info;
  const base = { modo, escena, vertices: s.n, gpu: `${vendor} ${architecture} ${description}`.trim() };
  const motor = await MotorGpu.crear(device, s);
  try {
    if (modo === 'paridad') {
      const cuadros = Number(q.get('cuadros') ?? 3);
      const cpu = nuevo();
      await motor.avanzar(cuadros);
      for (let c = 0; c < cuadros; c++) pasoImplicito(cpu);
      const xg = await motor.leerPosiciones();
      let maxima = 0, suma = 0;
      for (let i = 0; i < cpu.n; i++) {
        const dist = Math.hypot(xg[3 * i] - cpu.x[3 * i], xg[3 * i + 1] - cpu.x[3 * i + 1], xg[3 * i + 2] - cpu.x[3 * i + 2]);
        maxima = Math.max(maxima, dist);
        suma += dist;
      }
      return { ...base, dif: { maxima, media: suma / cpu.n }, estado: await motor.leerEstado() };
    }
    if (modo === 'velocidad') {
      await motor.avanzar(2); // calentamiento: el primer envío compila las tuberías
      const cuadros = Number(q.get('cuadros') ?? 60);
      const t0 = performance.now();
      await motor.avanzar(cuadros);
      return { ...base, msPorCuadro: (performance.now() - t0) / cuadros, estado: await motor.leerEstado() };
    }
    // quietud: hasta 10 s de tela, leyendo la historia de a un segundo
    const vigia = new VigiaDeQuietud();
    for (let segundo = 0; segundo < 10; segundo++) {
      await motor.avanzar(60);
      const historia = await motor.leerQuietud(60 * segundo, 60);
      for (let c = 0; c < 60; c++) {
        if (vigia.registrar(historia[c])) return { ...base, segundosHastaQuieta: (60 * segundo + c + 1) / 60, estado: await motor.leerEstado() };
      }
    }
    return { ...base, segundosHastaQuieta: null, estado: await motor.leerEstado() };
  } finally {
    motor.destruir();
    device.destroy();
  }
}

function publicar(r: Resultado): void {
  (window as unknown as { __TELA_IMPLICITA__?: Resultado }).__TELA_IMPLICITA__ = r;
  console.log(`[tela-implicita] ${JSON.stringify(r)}`);
}

export default function TelaImplicitaHarness() {
  const [texto, setTexto] = useState('preparando la escena…');
  useEffect(() => {
    correr(new URLSearchParams(window.location.search))
      .catch((e: unknown): Resultado => ({ modo: '', escena: '', vertices: 0, gpu: '', error: e instanceof Error ? (e.stack ?? e.message) : String(e) }))
      .then((r) => {
        publicar(r);
        setTexto(JSON.stringify(r, null, 1));
      });
  }, []);
  return <pre>{texto}</pre>;
}
```

En `src/App.tsx`, después de la línea `const CusickHarness = lazy(() => import('./components/testScenes/CusickHarness'));`:

```tsx
// DEV-only: la tela nueva en la GPU (spec 2026-10-13 §4.4.3) — lazy, como la de arriba.
const TelaImplicitaHarness = lazy(() => import('./components/testScenes/TelaImplicitaHarness'));
```

Y después del bloque `if (import.meta.env.DEV && … === 'cusick') { … }`:

```tsx
  // DEV-only: ?testScene=tela-implicita reemplaza la app entera por el banco de la tela nueva en la GPU
  // (tests/e2e/tela-implicita.spec.ts, @gpu-local).
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('testScene') === 'tela-implicita') {
    return (
      <Suspense fallback={null}>
        <TelaImplicitaHarness />
      </Suspense>
    );
  }
```

- [ ] **Step 5: Córrela y mira que pasa**

Run: `VINA_E2E_PORT=5191 node scripts/pesado.mjs --nombre=tela-gpu --espera=15 -- npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts`
Expected: PASS, 4 pruebas, cada una con su línea `[tela-implicita] {…}`. El puerto 5191 es propio: con `reuseExistingServer`, un puerto compartido podría servir el código de otra sesión. La de paridad debe dar `dif.maxima` por debajo de 1e-4 m. Anota `msPorCuadro` con 20 y 50 iteraciones y `segundosHastaQuieta` para el cierre.

Si la paridad falla, aísla antes de tocar nada (superpowers:systematic-debugging). Corre la escena a mano con `cuadros=1&anticipar=0&busqueda=0`, después prende la anticipación y después la búsqueda. Así queda claro qué parte del cuadro difiere. Si el WGSL no compila, el mensaje de `MotorGpu.crear` trae línea y columna del código generado.

- [ ] **Step 6: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/utils/cloth/implicito/gpu/motorGpu.ts src/components/testScenes/TelaImplicitaHarness.tsx src/App.tsx tests/e2e/tela-implicita.spec.ts
git commit -m "feat(tela): el motor implícito en la GPU y su banco @gpu-local" -m "MotorGpu arma los búferes y las tuberías y graba un cuadro entero en un pase de cómputo, sobre un GPUDevice dado. La escena DEV ?testScene=tela-implicita compara la GPU con la CPU en el disco Cusick de 10 mm y mide la velocidad con unos 29 mil vértices y los segundos hasta quedar quieta; tests/e2e/tela-implicita.spec.ts exige menos de 0,1 mm de diferencia tras 3 cuadros."
```

---

### Tarea 13: Cierre de las entregas 1 a 3

**Files:** ninguno nuevo.

- [ ] **Step 1: Corre todo una vez más desde la rama final**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
node scripts/pesado.mjs --nombre=prueba-voladizo --espera=10 -- npx vitest run src/utils/cloth/implicito/__tests__/voladizo.test.ts
VINA_E2E_PORT=5191 node scripts/pesado.mjs --nombre=tela-gpu --espera=15 -- npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts
VINA_REFERENCIAS=<carpeta privada> npm run bench:tela -- --motor=implicito
VINA_REFERENCIAS=<carpeta privada> npm run bench:tela -- --motor=xpbd
```

Expected: todo en verde y los dos informes en `$VINA_REFERENCIAS/informes/`.

- [ ] **Step 2: Arma la tabla de §2 con lo medido**

| Qué (§2) | Dónde se mide | Resultado |
|---|---|---|
| Caída en el disco Cusick (nivel con 5 mm y rango 5/10/20) | `bench:tela --motor=implicito` | pasa o no pasa, con los números del informe privado |
| Triángulos aplastados (menos de 0,1 %) | `bench:tela` (disco); la camiseta es de la entrega 4 | % por malla |
| Física exacta | `npm run test` y `voladizo.test.ts` | verde |
| GPU igual a CPU (menos de 0,1 mm) | `tela-implicita.spec.ts` | `dif.maxima` |
| Velocidad | `tela-implicita.spec.ts`, escena grande | ms por cuadro con 20 y 50 iteraciones (la meta de 17 ms se mide con la camiseta en la entrega 4) |
| Asentado | `tela-implicita.spec.ts` y el banco | segundos hasta quieta del disco |

Agrega la comparación con el motor de hoy (Tarea 2): coeficiente, ondas y aplastados por malla.

- [ ] **Step 3: Informa a Samuel**

Mándale la tabla en lenguaje llano, sin jerga. Los números de la referencia van solo en el informe privado, nunca en el repo.

- [ ] **Step 4: Push y PR, solo cuando Samuel lo pida**

Escribe el cuerpo en un archivo temporal fuera del repo (por ejemplo, `cuerpo-pr.md` en el scratchpad), partiendo de esta base y llenando la tabla con lo medido en los Steps 1 y 2:

```md
## Qué cambia

- `src/utils/cloth/implicito/`: el motor de tela nuevo, en su versión de referencia en CPU. La tela vive en el patrón, en el marco del hilo: membrana con tracción por hilo, cizalla y pandeo de Choi y Ko, y flexión de placa por triángulo a lo ancho, a lo largo y al bies. Cada cuadro resuelve Euler implícito con Newton y gradiente conjugado, con anticipación de contactos y búsqueda en línea.
- `src/utils/cloth/implicito/gpu/`: el mismo cuadro en WGSL, en un pase de cómputo por cuadro, con la matriz armada por bloques en franjas de 32 filas.
- El banco: pruebas de física exacta en vitest; `npm run bench:tela`, contra una referencia privada (`VINA_REFERENCIAS`) y contra el motor de hoy; y `tests/e2e/tela-implicita.spec.ts` (@gpu-local) para la paridad entre GPU y CPU, la velocidad y la quietud.

La simulación de la prenda no cambia todavía: eso es la entrega 4 del spec.

## Resultados

| Qué | Resultado |
|---|---|
| Física exacta | … |
| GPU igual a CPU tras 3 cuadros | … mm |
| Velocidad, 29 mil vértices, 20 y 50 iteraciones | … ms y … ms por cuadro |
| Disco Cusick frente al motor de hoy | … |

## Cómo probarlo

`npm run test`; `npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts` con GPU; `npm run bench:tela` con la carpeta privada.
```

```bash
git push -u origin feat/tela-nueva-laboratorio
gh pr create --title "La tela nueva en el laboratorio: motor implícito en CPU y GPU con su banco" --body-file <ruta de cuerpo-pr.md>
```

El cuerpo no nombra el simulador de referencia ni trae sus números o sus formas, y no lleva líneas de atribución.
