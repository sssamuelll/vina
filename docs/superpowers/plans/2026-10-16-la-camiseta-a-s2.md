# La camiseta a §2 — plan de implementación (entrega 4, antes de la parte 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La camiseta de María cumple §2 en el banco (quieta en 10 s, menos de 0,1 % de triángulos aplastados, costuras con mediana 0 y máxima 1 mm), atacando en orden lo que midieron la parte 2 y el ensayo de este plan: el cierre de las costuras, la costura que queda abierta, el resorte de costura, los triángulos de borde y, al final, la velocidad.

**Architecture:** Una variable por tarea, medida antes y después con el banco contra la referencia privada: en la CPU a 20 mm (doble precisión, la fuente de verdad) y en la GPU a 5 mm (donde se juzga §2). La Tarea 1 es el único cambio de modelo aprobado de antemano (E7, el cierre con tope), con TDD en la CPU y su paridad en la GPU. Las Tareas 2 a 6 agregan solo el parámetro, el medidor o el experimento que necesitan, miden y escogen con una regla escrita aquí. Si una medida pide cambiar la física fuera de E7, la tarea para y la lleva a Samuel con los números.

**Tech Stack:** TypeScript 5.6, vitest 4, WGSL escrito a mano sobre WebGPU, Playwright con GPU real (`playwright.webgpu.config.ts`), `tsx` para el banco.

**Spec:** `docs/superpowers/specs/2026-10-13-tela-nueva-design.md` (§2, §4.2.4, §4.3.3, §5 y §7). Los números de la parte 2 están en su registro privado, `$VINA_REFERENCIAS/informes/2026-10-14-registro-parte-2.md`, que lee solo el controlador.

## Punto de partida (parte 2)

La camiseta en la GPU a 5 mm (informe `2026-10-14-14-37-35-camiseta-gpu.json`): no queda quieta en 10 s; 2,02 % de triángulos aplastados; costuras con mediana 0,05 mm y máxima 23 mm; 4,86 % de aristas encogidas más de 10 %; 63 ms por cuadro con cg 20 y 101 ms con cg 50; 9.230 desbordes del contacto propio. Las causas que midió:

1. **El cierre.** El largo de reposo baja 37 % por cuadro (`CIERRE_POR_CUADRO = 0,97¹⁵ ≈ 0,633`, `costuras.ts:22`). Con huecos de hasta 270 mm en la colocación, el primer cuadro tira unos 90 mm de cada costura a 1000 N/m, y en la CPU 67 triángulos pasan de 30 mm en ese cuadro.
2. **El resorte.** A 1000 N/m contra m/h² ≈ 7·10⁻³ N/m, 50 iteraciones de gradiente conjugado no convergen: una costura cerrada queda a 2,6 mm entre CPU y GPU tras un cuadro, y hacen falta 400 iteraciones para bajar a 0,64 µm.
3. **Los triángulos de borde.** La K de placa llega a 5·10⁵ veces la mediana en triángulos de borde (segunda prueba de `camiseta.test.ts`), y la precisión simple no los resuelve.
4. **La velocidad.** La rama spike daba 9,8 ms (cg 20) y 17 ms (cg 50) por paso con la camiseta, antes de la entrega 4; con la prenda completa son 63 y 101 ms.

## Ensayo del plan (2026-10-16)

Se aplicó sobre `51215997` y se revirtió sin commitear.

- **La Tarea 1, entera.** `npx vitest run src/utils/cloth/implicito`: 22 archivos y 132 pruebas en verde con el tope de 5 mm por defecto. Con el cierre viejo en `avanzarCierre`, la prueba del tope cae. `tsc -b` y `eslint` limpios. En la GPU, `costura` y `costura-cerrada` dan paridad; con el WGSL sin `max`, `costura` cae con 4,0 mm.
- **La camiseta en la GPU a 5 mm, con el cierre de hoy y con el tope de 5 mm** (informes `2026-10-16-06-21-06-camiseta-gpu.json` y `2026-10-16-06-25-27-camiseta-gpu.json`):

  | | Cierre de hoy | Tope de 5 mm |
  |---|---|---|
  | Quieta en 10 s | no | no |
  | Triángulos aplastados | 2,10 % | 1,51 % |
  | Costuras, mediana / máxima | 0,047 / 27,0 mm | 0,041 / 22,8 mm |
  | Estiramiento p05 / p95 | −10,1 / +7,0 % | −7,1 / +4,4 % |
  | Aristas encogidas más de 10 % | 5,03 % | 4,22 % |
  | Pliegues de más de 90° | 1.817 | 1.380 |
  | Desbordes del contacto propio | 7.136 | 5.677 |
  | ms por cuadro, cg 20 / cg 50 | 65 / 103 | 62 / 105 |

  El tope mejora todas las medidas, pero no lleva la camiseta a §2. Los desbordes bajan solo un 20 %: no salen sobre todo del cierre.
- **La camiseta en la CPU a 20 mm, con todo el código del plan y el tope de 5 mm** (informe `2026-10-16-06-48-52-implicito.json`): no queda quieta; 5,12 % de triángulos aplastados; costuras con mediana 0,1 mm y máxima 21,5 mm; el gradiente conjugado llega al tope en todos los cuadros (100 iteraciones por cuadro, 50 por ronda); la primera costura cierra en el cuadro 6 y la última en el 63. Las costuras más abiertas son dos del cuello (21,5 y 7,7 mm) y una de la sisa (8,3 mm, con lados de 219,9 y 218,8 mm). La pieza más aplastada es la tira del cuello (14,8 %), seguida de las mangas (7,4 y 7,8 %).
- **La tira del cuello cierra en la referencia.** En la prenda real es un cuello de punto doblado (#1251), pero la referencia la cosió de una sola capa y con el mismo jersey que el resto, igual que Vina, para que la comparación aísle el motor. Con esa construcción, en la referencia las costuras cierran y la tira no se aplasta: la costura abierta y la tira aplastada de Vina son del motor.
- **Las costuras del cuello piden estirar la tira.** En el patrón, el escote mide entre 11 y 14 % más que la tira en sus cuatro costuras (510 mm contra 446 en total); las demás costuras difieren en 1 % o menos. Es la candidata a la costura de 23 mm, y la Tarea 3 lo mide.
- **El mallador no refina.** `meshPiece` nunca llama a `refineMesh` (`src/utils/mesh/refine.ts`): `minAngle` y `maxRefinementPasses` no se leen, y con 3, 10 y 30 pases sale la misma malla. Anotado en #1261.
- **Los triángulos de más rigidez de placa no son astillas.** Son de borde, en las mangas, con un solo borde libre. A 5 mm el peor tiene ángulos de 82/67/31° y una K 4·10⁴ veces la mediana; a 20 mm, 7·10⁵ veces, con 11,6° entre sus dos bordes interiores. La placa los mide mal, y la Tarea 5 mide cuánto pesa eso en la camiseta.

## Qué entra y qué no

- **Entra:** E7 en la CPU y en la GPU; escoger con el banco el tope del cierre y `kCostura`; medir qué costura queda abierta y dónde se aplasta la tela; medir, con un experimento del banco que no cambia el motor, cuánto pesan los triángulos de borde; medir dónde se van los milisegundos de un cuadro.
- **No entra:** la parte 3 (cuerpo y colocación de Vina, `prepararTela`, el interruptor `vina-motor-implicito`); el mallador de la app (#1261); cambiar la ley de la placa, la membrana, el pandeo, el contacto o las masas; varias telas en una prenda; optimizar la velocidad (subproyecto 1); el cuello doblado (#1251).

## Enmienda al spec

- **E7 (§4.3.3), aprobada por Samuel el 2026-10-16.** El largo de reposo de una costura baja cada cuadro lo mismo que hoy (×0,97¹⁵), pero nunca más de `cierreMaximo` metros: `L ← max(L·0,97¹⁵, L − cierreMaximo)`. Una costura que arranca a menos de `cierreMaximo/(1 − 0,97¹⁵)` cierra como hoy. El valor lo escoge el banco en la Tarea 2; la Tarea 1 arranca con 5 mm por cuadro (0,3 m/s a 60 cuadros por segundo). El equilibrio no cambia; cambia cómo se llega a él.

## Global Constraints

- Lo de las partes 1 y 2 sigue valiendo: SI dentro del motor; `h = 1/60` s; quieta con `Σ m·|v| / Σ m·g·h < 0,1 %` durante 30 cuadros (§4.2.4); separación tela-cuerpo `grosor/2 + 1 mm`; tela con tela, `grosor + 1 mm`.
- §2 de la camiseta: menos de 0,1 % de triángulos con menos de la mitad del área de su patrón; costuras con mediana por debajo de 0,05 mm (la «0 mm» de §2, como la cuenta `bench/_banco.ts:219`) y máxima de 1 mm; quieta sola en 10 s de tela o menos; 17 ms por cuadro o menos en la GTX 980.
- Paridad: menos de 0,1 mm entre CPU y GPU tras 3 cuadros en cada escena de `PARIDAD` (`tests/e2e/tela-implicita.spec.ts`).
- La física de la tela (membrana, placa, pandeo, contacto, masas) no cambia en este plan. Los experimentos del banco (`banco/experimentos.ts`) solo corren cuando se piden y nunca quedan por defecto. Si una medida pide cambiar la física, la tarea para y la lleva a Samuel.
- La referencia del simulador comercial no entra al repo: ni su nombre, ni sus números, ni los nombres de su avatar, ni sus formas, en código, pruebas, commits, PR o issues. Sus archivos y lo que se mide sobre ellos viven en la carpeta privada `VINA_REFERENCIAS`. Los números de Vina sí entran.
- Ningún número inventado: cada constante nueva cita la medida de la que sale.
- Lo pesado corre con `node scripts/pesado.mjs`: `npm run test` y `npm run bench:tela` lo piden solos; la camiseta en la GPU se lanza envuelta en él. Nunca `--sin-admision` ni `VINA_PESADO_OMITIR`. Una prueba suelta no pide candado.
- Gate por tarea: `npx tsc -b --noEmit`, `npx vitest run src/utils/cloth` y `npm run lint`, más el hook de pre-commit. La suite entera y `npm run lint:ui` van en la Tarea 7.
- Commits en español: describen el cambio y su porqué técnico, sin líneas de atribución ni proceso.

## Review Focus

1. Un `cierreMaximo` que no es un número positivo (`--cierre=0` en el banco, `cierre=abc` en la URL): con 0 las costuras no cerrarían nunca, y con NaN la tela se llenaría de NaN. El sistema se niega con un error que lo nombra. Lo prueba la Tarea 1.
2. Una costura que arranca a menos de unos 13,6 mm (`cierreMaximo/(1 − 0,97¹⁵)` con 5 mm): cierra exactamente como hoy. Lo prueba la Tarea 1.
3. Costuras que cierran en cuadros muy distintos: con el tope, una que arranca a 270 mm tarda unos 60 cuadros y una de 5 mm, unos 9. La flexión cruza todas solo cuando cierran todas (`alTerminarCuadro`, `sistema.ts:250-256`), así que las chicas pasan hasta un segundo sin bisagra. La Tarea 2 mide en qué cuadro cierra la primera y en cuál cierran todas; si la diferencia deja quiebres en las costuras, va a Samuel.
4. La escena `costura` de la paridad arranca a 30 mm, así que el tope actúa desde el primer cuadro: la CPU y la GPU tienen que cerrar igual. Lo prueba la Tarea 1 con esa escena y su mutación.
5. Una costura con lados de largo distinto en el patrón (la tira del cuello, 11-14 % más corta que el escote): para cerrar, la tela tiene que estirarse. La Tarea 3 mide si cierra a 1 mm o si la tira y la costura pelean.

## Coordinación

- Todo va en la rama `feat/camiseta-a-s2`, sacada de main `51215997` en el worktree `.claude/worktrees/tela-prenda`. Se sube y abre su PR en la Tarea 7; mergear espera la orden de Samuel. Es laboratorio: no cambia nada para la usuaria y no necesita deploy.
- La carpeta privada la toca solo el controlador: corre el banco y la camiseta en la GPU, y lee los informes. Ningún subagente la lee, corre Playwright con GPU, sube ramas ni mergea.
- Las pruebas con GPU real corren con `VINA_E2E_PORT=5193`.
- **Puntos de decisión:** la Tarea 3, si la costura que queda abierta pide cambiar el modelo; la Tarea 4, si ningún resorte cumple costuras y quietud; la Tarea 5, si topar la placa cambia la camiseta (cambiar la placa es física); la Tarea 6, porque lo que se optimice va al subproyecto de velocidad.

## Antes de empezar

```bash
cd /d/Desktop/projects/vina/.claude/worktrees/tela-prenda
git switch feat/camiseta-a-s2 && git fetch origin && git merge --no-edit origin/main
[ -d .husky/_ ] || npx husky
export VINA_REFERENCIAS=<carpeta privada>
export LOGS=.superpowers/sdd/2026-10-16-la-camiseta-a-s2 && mkdir -p $LOGS
```

`$LOGS` guarda las salidas del banco y el registro de la ejecución (`progress.md`); `.superpowers/` está en `.gitignore`.

---

### Task 1: El cierre con tope, en la CPU y en la GPU (E7)

**Files:**
- Modify: `src/utils/cloth/implicito/costuras.ts` (constructor de `Costuras` y `avanzarCierre`)
- Modify: `src/utils/cloth/implicito/sistema.ts` (`AjustesImplicito`, `AJUSTES_IMPLICITO` y el constructor de `SistemaTela`)
- Modify: `src/utils/cloth/implicito/gpu/wgsl.ts` (constantes de `wgslDelMotor` y el kernel `cerrarCosturas`)
- Test: `src/utils/cloth/implicito/__tests__/costuras.test.ts`
- Test (GPU, sin cambios): la escena `costura` de `PARIDAD` en `tests/e2e/tela-implicita.spec.ts`

**Interfaces:**
- Produces: `AjustesImplicito.cierreMaximo: number` (m por cuadro; por defecto `0.005`); `new Costuras(puntos, x, k, cierreMaximo = Infinity)` con `Costuras.cierreMaximo`; en el WGSL, `const CIERRE_MAX`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `src/utils/cloth/implicito/__tests__/costuras.test.ts`, cambiar el import de `../sistema`:

```ts
import { AJUSTES_IMPLICITO, SistemaTela } from '../sistema';
```

y agregar estas tres pruebas justo antes de `it('dos piezas de distinta malla se cosen sin aplastar la orilla', () => {`:

```ts
  it('con tope, una costura muy abierta baja a lo sumo el tope por cuadro, y cerca de cerrar manda el cierre de hoy', () => {
    const c = new Costuras([{ a: 0, b0: 1, b1: 1, s: 0 }], [0, 0, 0, 0.03, 0, 0], 1000, 0.005);
    for (const esperado of [0.025, 0.02, 0.015, 0.01]) {
      c.avanzarCierre();
      expect(c.L[0]).toBeCloseTo(esperado, 12);
    }
    // a 10 mm, el cierre de hoy baja 3,7 mm, menos que el tope
    c.avanzarCierre();
    expect(c.L[0]).toBeCloseTo(0.01 * CIERRE_POR_CUADRO, 12);
    for (let k = 0; k < 40 && !c.cerradas(); k++) c.avanzarCierre();
    expect(c.cerradas()).toBe(true);
  });

  it('el sistema le pasa a sus costuras el tope de los ajustes', () => {
    const { prenda, ladoA, ladoB } = dosPiezas();
    const costuras = { puntos: puntosDeCostura(prenda.malla.patron, ladoA, ladoB) };
    expect(new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { costuras }).costuras.cierreMaximo).toBe(AJUSTES_IMPLICITO.cierreMaximo);
    expect(new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { costuras, ajustes: { cierreMaximo: 0.002 } }).costuras.cierreMaximo).toBe(0.002);
  });

  it('un tope que no es positivo se rechaza: con 0 las costuras no cerrarían nunca, y con NaN la tela se llenaría de NaN', () => {
    const { prenda } = dosPiezas();
    for (const cierreMaximo of [0, -0.001, Number.NaN]) {
      expect(() => new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { ajustes: { cierreMaximo } })).toThrow(/cierreMaximo/);
    }
  });
```

La prueba de siempre (`'el largo de reposo se cierra ×0,97 por subpaso de 15 hasta quedar en 0'`) no cambia: construye `Costuras` sin tope.

- [ ] **Step 2: Correrlas y verlas caer**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/costuras.test.ts`
Expected: FAIL, 3 failed y 6 passed. El tope se ignora (L baja a 0,019), `costuras.cierreMaximo` es `undefined` y nada se rechaza.

- [ ] **Step 3: El tope en `Costuras`**

En `src/utils/cloth/implicito/costuras.ts`, el constructor:

```ts
  /** `cierreMaximo`: lo más que baja L en un cuadro (m); sin tope, el cierre de hoy */
  constructor(puntos: readonly PuntoDeCostura[], x: ArrayLike<number>, readonly k: number, readonly cierreMaximo = Infinity) {
```

y `avanzarCierre`:

```ts
  /** Un cuadro de cierre: L ← L·CIERRE_POR_CUADRO, sin bajar más de `cierreMaximo`, y 0 al bajar de LARGO_CERRADO. */
  avanzarCierre(): void {
    this.cuadros++;
    for (let e = 0; e < this.n; e++) {
      const L = Math.max(this.L[e] * CIERRE_POR_CUADRO, this.L[e] - this.cierreMaximo);
      this.L[e] = L < LARGO_CERRADO ? 0 : L;
    }
  }
```

- [ ] **Step 4: El ajuste en `SistemaTela`**

En `src/utils/cloth/implicito/sistema.ts`, en `AjustesImplicito`, después de `kCostura: number;`:

```ts
  /**
   * lo más que se cierra en un cuadro el largo de reposo de una costura (m, E7): con huecos de 270 mm en la
   * colocación, el cierre de ×0,97¹⁵ tiraba unos 100 mm de cada costura en el primer cuadro
   */
  cierreMaximo: number;
```

En `AJUSTES_IMPLICITO`, después de `kCostura: 1000,`:

```ts
  cierreMaximo: 0.005,
```

En el constructor, justo después de `this.aj = { ...AJUSTES_IMPLICITO, ...op.ajustes };`:

```ts
    if (!(this.aj.cierreMaximo > 0)) throw new Error(`SistemaTela: cierreMaximo tiene que ser positivo (llegó ${this.aj.cierreMaximo})`);
```

y la línea de las costuras:

```ts
    this.costuras = new Costuras(op.costuras?.puntos ?? [], malla.x, this.aj.kCostura, this.aj.cierreMaximo);
```

- [ ] **Step 5: Correr las pruebas del motor**

Run: `npx vitest run src/utils/cloth/implicito`
Expected: PASS, 22 archivos y 132 pruebas. Con el tope de 5 mm por defecto, ninguna prueba vieja con costuras cambia de resultado (`bisagrasDeCostura` cierra dentro de sus 60 cuadros).

- [ ] **Step 6: El tope en la GPU**

En `src/utils/cloth/implicito/gpu/wgsl.ts`, debajo de `const CIERRE = ${f(CIERRE_POR_CUADRO)};`:

```ts
const CIERRE_MAX = ${f(aj.cierreMaximo)};
```

y en el kernel `cerrarCosturas`, la línea `var L = tf[O_CL + e] * CIERRE;` pasa a:

```wgsl
    let L0 = tf[O_CL + e];
    var L = max(L0 * CIERRE, L0 - CIERRE_MAX);
```

`flotante` rechaza las constantes no finitas: por eso el tope de la CPU puede ser `Infinity` (pruebas de `Costuras`) y el de los ajustes siempre es finito.

- [ ] **Step 7: La paridad de las costuras en la GPU**

Run: `VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "tras 3 cuadros \(costura" --reporter=list`
Expected: 2 passed (`costura` y `costura-cerrada`).

- [ ] **Step 8: La mutación que tiene que tumbarla**

Cambiar a mano en `cerrarCosturas` la línea `var L = max(L0 * CIERRE, L0 - CIERRE_MAX);` por `var L = L0 * CIERRE;` y correr:

Run: `VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "tras 3 cuadros \(costura\)" --reporter=list`
Expected: 1 failed, con `Received: 0.0040…` (4,0 mm contra 0,1). Volver a poner el `max`.

- [ ] **Step 9: Gates**

Run: `npx tsc -b --noEmit && npx vitest run src/utils/cloth && npm run lint`
Expected: los tres en verde.

- [ ] **Step 10: Commit**

```bash
git add src/utils/cloth/implicito/costuras.ts src/utils/cloth/implicito/sistema.ts src/utils/cloth/implicito/gpu/wgsl.ts src/utils/cloth/implicito/__tests__/costuras.test.ts
git commit -m "feat(tela): el largo de reposo de una costura baja a lo sumo cierreMaximo por cuadro (E7)"
```

---

### Task 2: Escoger el tope con el banco

**Files:**
- Modify: `bench/telaNueva.ts` (opción `--cierre`)
- Modify: `bench/motorImplicito.ts` (iteraciones medias de gradiente conjugado y los cuadros en que cierran las costuras)
- Modify: `bench/_banco.ts` (`Corrida`, `FilaCamiseta`, `ensayoCamiseta`, `imprimirCamiseta`)
- Modify: `src/components/testScenes/TelaImplicitaHarness.tsx` (parámetro `cierre`)
- Modify: `tests/e2e/tela-implicita.spec.ts` (`VINA_TELA_AJUSTES`)
- Modify, al final: `src/utils/cloth/implicito/sistema.ts` (el valor de `cierreMaximo`) y `docs/superpowers/specs/2026-10-13-tela-nueva-design.md` (E7 en §7)

**Interfaces:**
- Consumes: `AjustesImplicito.cierreMaximo` (Tarea 1).
- Produces: en `Corrida` y `FilaCamiseta`, `cgMedio?: number`, `primeraCerrada?: number | null` y `todasCerradas?: number | null` (la Tarea 4 lee `cgMedio`); la opción `--cierre=<mm>` del banco, el parámetro `cierre=<mm>` del harness y `VINA_TELA_AJUSTES` en la camiseta de la GPU (las Tareas 3 a 5 los usan).

- [ ] **Step 1: El banco acepta el tope y cuenta lo que hace falta para escoger**

En `bench/telaNueva.ts`, la línea de uso del comentario de arriba suma la opción:

```ts
 *   VINA_REFERENCIAS=<carpeta privada> npm run bench:tela -- [--motor=implicito|xpbd] [--pandeo=<factor>] [--ensayo=cusick|voladizo|todo|camiseta] [--mallas=5,10,20] [--cg=<n>] [--cierre=<mm por cuadro>] [--flexionDelMargen=<f>]
```

y los ajustes de la camiseta, debajo de la línea de `flexionDelMargen`:

```ts
    ...(args.has('cierre') ? { cierreMaximo: Number(args.get('cierre')) / 1000 } : {}),
```

`bench/motorImplicito.ts` entero:

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
    const s = new SistemaTela(e.malla, tela, { obstaculos: e.obstaculos, hilo: e.hilo, costuras: e.costuras, franja: e.franja, ajustes });
    if (e.v) s.v.set(e.v);
    const vigia = new VigiaDeQuietud();
    const t0 = performance.now();
    let cuadros = 0, quieta: number | null = null, cg = 0;
    let primeraCerrada: number | null = null, todasCerradas: number | null = null;
    while (cuadros < 600 && quieta === null) {
      cg += pasoImplicito(s).cg;
      cuadros++;
      if (primeraCerrada === null && s.costuras.L.some((L) => L === 0)) primeraCerrada = cuadros;
      if (todasCerradas === null && s.costuras.n > 0 && s.costuras.cerradas()) todasCerradas = cuadros;
      if (vigia.registrar(medirQuietud(s).total)) quieta = cuadros / 60;
    }
    return { x: s.x, quieta, msPorCuadro: (performance.now() - t0) / cuadros, cgMedio: cg / cuadros, primeraCerrada, todasCerradas };
  };
}
```

En `bench/_banco.ts`, `Corrida`:

```ts
/** Lo que devuelve un motor después de correr una escena. */
export interface Corrida {
  x: ArrayLike<number>;
  /** segundos de tela hasta quedar quieta (§4.2.4); null si el motor no lo mide o no llegó */
  quieta: number | null;
  msPorCuadro: number;
  /** iteraciones de gradiente conjugado por cuadro, en promedio (solo el motor implícito) */
  cgMedio?: number;
  /** el cuadro en que cerró la primera costura y el cuadro en que cerraron todas; null si no llegó (solo el motor implícito) */
  primeraCerrada?: number | null;
  todasCerradas?: number | null;
}
```

`FilaCamiseta`:

```ts
export interface FilaCamiseta extends MedidasDeCamiseta {
  malla: number;
  quieta: number | null;
  msPorCuadro: number;
  errorDeColocacion: number[];
  cgMedio?: number;
  primeraCerrada?: number | null;
  todasCerradas?: number | null;
}
```

la línea que devuelve la fila en `ensayoCamiseta`:

```ts
    return {
      malla, quieta: r.quieta, msPorCuadro: r.msPorCuadro, errorDeColocacion: c.errorDeColocacion,
      cgMedio: r.cgMedio, primeraCerrada: r.primeraCerrada, todasCerradas: r.todasCerradas, ...medirCamiseta(r.x, c),
    };
```

y la primera línea de `imprimirCamiseta`:

```ts
    console.log(`camiseta ${f.malla} mm (${f.vertices} vértices; colocación a ${Math.max(...f.errorDeColocacion).toFixed(2)} mm): quieta ${uno(f.quieta)} s · ${f.msPorCuadro.toFixed(0)} ms por cuadro · cg ${f.cgMedio?.toFixed(1) ?? '—'} por cuadro · costuras cerradas: la primera en el cuadro ${f.primeraCerrada ?? '—'}, todas en el ${f.todasCerradas ?? '—'}`);
```

- [ ] **Step 2: La GPU acepta el tope**

En `src/components/testScenes/TelaImplicitaHarness.tsx`, en los `ajustes` de `correr`, debajo de la línea de `kc`:

```ts
    // el tope del cierre de las costuras (mm por cuadro), si se pide otro
    ...(q.get('cierre') ? { cierreMaximo: Number(q.get('cierre')) / 1000 } : {}),
```

En `tests/e2e/tela-implicita.spec.ts`, el cuerpo de la prueba de la camiseta hasta el `console.log`:

```ts
    const espera = 880_000;
    // ajustes de la URL para medir otras variantes con el banco (p. ej. VINA_TELA_AJUSTES='cierre=2&kcost=300')
    const extra = process.env.VINA_TELA_AJUSTES ? `&${process.env.VINA_TELA_AJUSTES}` : '';
    const camiseta = await correr(page, `modo=camiseta&escena=camiseta&malla=5&cg=50${extra}`, espera);
    const velocidad20 = await correr(page, `modo=velocidad&escena=camiseta&malla=5&cg=20&cuadros=60${extra}`, espera);
    const velocidad50 = await correr(page, `modo=velocidad&escena=camiseta&malla=5&cg=50&cuadros=60${extra}`, espera);
    const paridad = await correr(page, `modo=paridad&escena=camiseta&malla=5&cg=50&cuadros=3${extra}`, espera);
    console.log(`[camiseta] informe: ${guardarInforme('camiseta-gpu', { extra, camiseta, velocidad20, velocidad50, paridad })}`);
```

Run: `npx tsc -b --noEmit && npm run lint`
Expected: verde.

- [ ] **Step 3: La camiseta en la CPU a 20 mm, con el cierre de hoy y tres topes**

`--cierre=100000` (100 m por cuadro) es el cierre de hoy: el tope nunca actúa.

```bash
for c in 100000 10 5 2; do npm run bench:tela -- --ensayo=camiseta --mallas=20 --cierre=$c > $LOGS/cierre-cpu-$c.log 2>&1; tail -7 $LOGS/cierre-cpu-$c.log; done
```

Expected: cada corrida imprime su bloque «camiseta 20 mm …» y la ruta de su informe. Anotar en el registro de la tarea, por tope: quieta, ms por cuadro, cg por cuadro, los dos cuadros de cierre, aplastados, costuras (mediana y máxima), estiramiento p05/p95, encogidas y la distancia a la asentada. Cada corrida tarda hasta 6 min (600 cuadros a ~540 ms).

- [ ] **Step 4: La camiseta en la GPU a 5 mm, con los mismos cuatro**

```bash
for c in 100000 10 5 2; do VINA_TELA_AJUSTES="cierre=$c" VINA_E2E_PORT=5193 node scripts/pesado.mjs --nombre=camiseta-gpu --espera=15 -- npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "a 5 mm queda quieta" --reporter=list > $LOGS/cierre-gpu-$c.log 2>&1; grep -a 'informe:' $LOGS/cierre-gpu-$c.log; done
```

Expected: cada corrida guarda su informe `…-camiseta-gpu.json` en `$VINA_REFERENCIAS/informes/` antes de las aserciones de §2, que pueden fallar: aquí se mide. Anotar, por tope: `camiseta.segundosHastaQuieta`, `medidas.aplastados`, `medidas.costuras`, `medidas.estiramiento`, `estado.desbordes`, `velocidad20.msPorCuadro`, `velocidad50.msPorCuadro` y `paridad.dif.maxima`.

- [ ] **Step 5: Escoger**

La regla: de los topes con los que la camiseta queda quieta en la GPU en 10 s o menos, el de menos triángulos aplastados en la GPU; si dos quedan a menos de 0,05 puntos, el mayor (cierra antes). Si con ninguno queda quieta, el de menos aplastados, y el registro lo dice. Si con el tope escogido `todasCerradas` llega más de 60 cuadros después de `primeraCerrada` (CPU a 20 mm), anotarlo para Samuel con los dos números: es el tiempo que las costuras chicas pasan sin bisagra (Review Focus 3).

- [ ] **Step 6: Fijar el tope**

En `src/utils/cloth/implicito/sistema.ts`, `cierreMaximo: 0.005,` pasa al valor escogido (en metros) y su comentario cita la medida: «escogido con el banco el AAAA-MM-DD (camiseta en la GPU a 5 mm: …)». En el spec, §7 suma E7 con el texto de la enmienda de este plan, el valor y la línea de la medida.

Run: `npx vitest run src/utils/cloth && VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "tras 3 cuadros \(costura" --reporter=list`
Expected: verde y 2 passed. Con 2 mm, una prueba de costura que espere el cierre en menos de 60 cuadros puede no llegar: en ese caso se le da el número de cuadros que pide el tope (`L0/cierreMaximo` más los ~10 del final) y se dice en el commit.

- [ ] **Step 7: Commit**

```bash
git add bench/telaNueva.ts bench/motorImplicito.ts bench/_banco.ts src/components/testScenes/TelaImplicitaHarness.tsx tests/e2e/tela-implicita.spec.ts src/utils/cloth/implicito/sistema.ts docs/superpowers/specs/2026-10-13-tela-nueva-design.md
git commit -m "feat(tela): el tope del cierre de las costuras, escogido con la camiseta en el banco (E7)"
```

---

### Task 3: Qué costura queda abierta y dónde se aplasta la tela

**Files:**
- Modify: `src/utils/cloth/implicito/banco/medidas.ts` (`aplastados` con un rango de triángulos)
- Modify: `src/utils/cloth/implicito/banco/camiseta.ts` (`MedidasDeCamiseta` y `medirCamiseta`: por costura y por pieza)
- Modify: `bench/_banco.ts` (`imprimirCamiseta`)
- Test: `src/utils/cloth/implicito/__tests__/medidas.test.ts`

**Interfaces:**
- Consumes: el tope fijado en la Tarea 2.
- Produces: `aplastados(x, malla, desde = 0, cuantos = malla.tris.length / 3 - desde)`; en `MedidasDeCamiseta`, `porCostura` y `porPieza`. Los informes de la CPU y de la GPU los traen solos, porque los dos miden con `medirCamiseta`.

- [ ] **Step 1: Escribir la prueba que falla**

En `src/utils/cloth/implicito/__tests__/medidas.test.ts`, el import de `../banco/medidas` suma `aplastados`:

```ts
import { aplastados, distanciaAlCuerpo, estiramiento, pliegues, separacionDeCosturas } from '../banco/medidas';
```

y dentro de `describe('las medidas de la camiseta', …)`, al final:

```ts
  it('cuenta los aplastados de un rango de triángulos', () => {
    // dos triángulos de 0,5 de área en el patrón; en x, el primero queda igual y el segundo, a un cuarto de su área
    const malla = { x: new Float64Array(18), patron: Float64Array.from([0, 0, 1, 0, 0, 1, 2, 0, 3, 0, 2, 1]), tris: Uint32Array.from([0, 1, 2, 3, 4, 5]) };
    const x = [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 2.5, 0, 0, 2, 0.5, 0];
    expect(aplastados(x, malla)).toBe(50);
    expect(aplastados(x, malla, 0, 1)).toBe(0);
    expect(aplastados(x, malla, 1, 1)).toBe(100);
  });
```

- [ ] **Step 2: Verla caer**

Run: `npx vitest run src/utils/cloth/implicito/__tests__/medidas.test.ts`
Expected: FAIL, 1 failed y 4 passed: sin rango, `aplastados(x, malla, 0, 1)` da 50.

- [ ] **Step 3: El rango en `aplastados`**

En `src/utils/cloth/implicito/banco/medidas.ts`:

```ts
/** Porcentaje de triángulos con menos de la mitad del área de su patrón, entre los `cuantos` que empiezan en `desde`. */
export function aplastados(x: ArrayLike<number>, malla: MallaDeTela, desde = 0, cuantos = malla.tris.length / 3 - desde): number {
  const { tris, patron } = malla;
  let bajo = 0;
  for (let t = desde; t < desde + cuantos; t++) {
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
  return (100 * bajo) / cuantos;
}
```

Run: `npx vitest run src/utils/cloth/implicito/__tests__/medidas.test.ts`
Expected: PASS, 5 passed.

- [ ] **Step 4: Por costura y por pieza en `medirCamiseta`**

En `src/utils/cloth/implicito/banco/camiseta.ts`, el import de `../costuras` pasa a traer la función:

```ts
import { puntosDeCostura, type BisagraDeCostura, type PuntoDeCostura } from '../costuras';
```

`MedidasDeCamiseta` entera:

```ts
export interface MedidasDeCamiseta {
  vertices: number;
  aplastados: number;
  estiramiento: ReturnType<typeof estiramiento>;
  costuras: ReturnType<typeof separacionDeCosturas>;
  /** por costura, de la más abierta a la más cerrada: sus dos piezas, cuántos puntos, el largo de cada lado en el patrón (m) y la separación (m) */
  porCostura: Array<{ piezas: [string, string]; puntos: number; largos: [number, number]; mediana: number; maxima: number }>;
  /** por pieza, el porcentaje de sus triángulos con menos de la mitad del área de su patrón */
  porPieza: Array<{ pieza: string; aplastados: number }>;
  pliegues: ReturnType<typeof pliegues>;
  alCuerpo: ReturnType<typeof distanciaAlCuerpo>;
  /** la distancia de cada vértice de Vina a la asentada de la referencia */
  contraLaReferencia: ReturnType<typeof distanciaASuperficie> | null;
  /** lo mismo medido sobre la asentada de la referencia (sin costuras: el OBJ no las trae) */
  referencia: Omit<MedidasDeCamiseta, 'costuras' | 'porCostura' | 'porPieza' | 'contraLaReferencia' | 'referencia'> | null;
}
```

y `medirCamiseta` entera:

```ts
export function medirCamiseta(x: ArrayLike<number>, c: CamisetaContraLaReferencia): MedidasDeCamiseta {
  const { malla } = c.escena, ref = c.referencia, { piezas, prenda, lados } = c.camiseta;
  const nombre = (k: number) => `${piezas[k].name} (${piezas[k].category ?? 'sin clase'})`;
  const piezaDe = (v: number) => prenda.piezas.findIndex((p) => v >= p.v0 && v < p.v0 + p.nv);
  const largo = (lado: readonly number[]) => {
    let L = 0;
    for (let k = 1; k < lado.length; k++) {
      L += Math.hypot(malla.patron[2 * lado[k]] - malla.patron[2 * lado[k - 1]], malla.patron[2 * lado[k] + 1] - malla.patron[2 * lado[k - 1] + 1]);
    }
    return L;
  };
  return {
    vertices: x.length / 3,
    aplastados: aplastados(x, malla),
    estiramiento: estiramiento(x, malla),
    costuras: separacionDeCosturas(x, c.camiseta.costuras.puntos),
    porCostura: lados
      .filter((l) => l.a.length > 0 && l.b.length > 0)
      .map((l) => {
        const puntos = puntosDeCostura(malla.patron, l.a, l.b);
        return {
          piezas: [nombre(piezaDe(l.a[0])), nombre(piezaDe(l.b[0]))] as [string, string],
          puntos: puntos.length,
          largos: [largo(l.a), largo(l.b)] as [number, number],
          ...separacionDeCosturas(x, puntos),
        };
      })
      .sort((p, q) => q.maxima - p.maxima),
    porPieza: prenda.piezas.map((p, k) => ({ pieza: nombre(k), aplastados: aplastados(x, malla, p.t0, p.nt) })),
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

`c.escena.malla` es `c.camiseta.prenda.malla`, y `prenda.piezas[k]` es la pieza `piezas[k]`: `camisetaDeMaria` las arma en ese orden.

- [ ] **Step 5: Que el banco lo imprima**

En `bench/_banco.ts`, en `imprimirCamiseta`, debajo de la línea de `aplastados … costuras mediana … máxima`:

```ts
    console.log(`  costuras más abiertas: ${f.porCostura.slice(0, 3).map((q) => `${q.piezas.join(' ↔ ')}: ${mm(q.maxima)} mm (lados de ${mm(q.largos[0])} y ${mm(q.largos[1])} mm)`).join(' · ')}`);
    console.log(`  aplastados por pieza: ${f.porPieza.map((q) => `${q.pieza} ${q.aplastados.toFixed(2)} %`).join(' · ')}`);
```

Run: `npx tsc -b --noEmit && npx vitest run src/utils/cloth && npm run lint`
Expected: verde.

- [ ] **Step 6: Medir**

```bash
npm run bench:tela -- --ensayo=camiseta --mallas=20 > $LOGS/diagnostico-cpu.log 2>&1; grep -a -E 'camiseta 20|costuras más abiertas|aplastados por pieza' $LOGS/diagnostico-cpu.log
VINA_E2E_PORT=5193 node scripts/pesado.mjs --nombre=camiseta-gpu --espera=15 -- npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "a 5 mm queda quieta" --reporter=list > $LOGS/diagnostico-gpu.log 2>&1; grep -a 'informe:' $LOGS/diagnostico-gpu.log
node -e "const m = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).camiseta.medidas; console.log(JSON.stringify(m.porCostura.slice(0, 5), null, 1), JSON.stringify(m.porPieza))" "<ruta del informe de la GPU>"
```

Expected: en la CPU, las tres costuras más abiertas con el largo de sus lados y los aplastados de cada pieza; en la GPU, las cinco más abiertas y los aplastados por pieza. Las dos tablas van al registro.

- [ ] **Step 7: Decidir**

- La costura más abierta pasa por `superpowers:systematic-debugging` antes de seguir: sus lados, sus puntos, su cierre y, si sus lados miden distinto (las del cuello, 11-14 %), cuánto le pide estirarse a la tira. La referencia cose esa tira igual que Vina, de una sola capa y con el mismo jersey, y ahí cierra: una costura del cuello abierta es del motor. Un error de código se arregla aquí, con su prueba en rojo antes; si lo que falla es el modelo, la tarea para y va a Samuel.
- Los aplastados por pieza dicen dónde mirar; la Tarea 5 comprueba si son las mangas.

- [ ] **Step 8: Commit**

```bash
git add src/utils/cloth/implicito/banco/medidas.ts src/utils/cloth/implicito/banco/camiseta.ts src/utils/cloth/implicito/__tests__/medidas.test.ts bench/_banco.ts
git commit -m "feat(banco): la camiseta mide cada costura y los aplastados de cada pieza"
```

---

### Task 4: El resorte de costura con el banco

**Files:**
- Modify: `bench/telaNueva.ts` (opción `--kCostura`)
- Modify: `src/components/testScenes/TelaImplicitaHarness.tsx` (parámetro `kcost`)
- Modify, al final: `src/utils/cloth/implicito/sistema.ts` (el valor de `kCostura` y su comentario) y el spec (§7)

**Interfaces:**
- Consumes: `cgMedio` de `FilaCamiseta`, `--cierre` y `VINA_TELA_AJUSTES` (Tarea 2).
- Produces: la opción `--kCostura=<N/m>` del banco y el parámetro `kcost=<N/m>` del harness.

- [ ] **Step 1: El banco y la GPU aceptan el resorte**

En `bench/telaNueva.ts`, la línea de uso suma `[--kCostura=<N/m>]` después de `[--cierre=<mm por cuadro>]`, y los ajustes de la camiseta, debajo de la línea de `cierre`:

```ts
    ...(args.has('kCostura') ? { kCostura: Number(args.get('kCostura')) } : {}),
```

En `TelaImplicitaHarness.tsx`, debajo de la línea de `cierre`:

```ts
    // la rigidez de los puntos de costura (N/m), si se pide otra
    ...(q.get('kcost') ? { kCostura: Number(q.get('kcost')) } : {}),
```

Run: `npx tsc -b --noEmit && npm run lint`
Expected: verde.

- [ ] **Step 2: La camiseta en la CPU a 20 mm con tres resortes**

Con el tope ya escogido por defecto:

```bash
for k in 300 1000 3000; do npm run bench:tela -- --ensayo=camiseta --mallas=20 --kCostura=$k > $LOGS/kcost-cpu-$k.log 2>&1; tail -7 $LOGS/kcost-cpu-$k.log; done
```

Expected: tres bloques. Anotar por resorte: cg por cuadro, quieta, costuras (mediana y máxima), aplastados y encogidas. Con 300 N/m, una costura que sostiene 1 N/m de tela con puntos cada 5 mm queda abierta 17 µm (el comentario de `kCostura` da 5 µm con 1000): cualquiera de los tres cabe en la mediana de §2 si el gradiente conjugado converge.

- [ ] **Step 3: La camiseta en la GPU a 5 mm con los mismos tres**

```bash
for k in 300 1000 3000; do VINA_TELA_AJUSTES="kcost=$k" VINA_E2E_PORT=5193 node scripts/pesado.mjs --nombre=camiseta-gpu --espera=15 -- npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "a 5 mm queda quieta" --reporter=list > $LOGS/kcost-gpu-$k.log 2>&1; grep -a 'informe:' $LOGS/kcost-gpu-$k.log; done
```

Expected: tres informes. Anotar lo mismo que en la Tarea 2, Step 4.

- [ ] **Step 4: Escoger, o parar**

La regla: el resorte más alto con el que la camiseta en la GPU cumple las costuras de §2 (mediana menor de 0,05 mm y máxima de 1 mm o menos) y queda quieta en 10 s o menos. Si la Tarea 3 encontró que las costuras del cuello no cierran porque la tira tiene que estirarse, la máxima se mide sin ellas, con `porCostura`, y el registro lo dice. Si ninguno cumple las dos, **parar**: el remedio que queda es un precondicionador que junte cada punto de costura con sus tres vértices, y eso es diseño. Se lleva a Samuel con la tabla de los Steps 2 y 3.

- [ ] **Step 5: Fijar el resorte**

En `sistema.ts`, `kCostura` toma el valor escogido y su comentario cambia «el banco de la camiseta la confirma» por la medida: el resorte, la fecha y lo que dio la camiseta en la GPU. En el spec, §7 suma «E8 (§4.3.3, §5): el resorte de cada punto de costura es de N N/m, escogido con el banco el AAAA-MM-DD», con la línea de la medida.

Run: `npx vitest run src/utils/cloth && VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "tras 3 cuadros" --reporter=list`
Expected: verde y 9 passed.

- [ ] **Step 6: Commit**

```bash
git add bench/telaNueva.ts src/components/testScenes/TelaImplicitaHarness.tsx src/utils/cloth/implicito/sistema.ts docs/superpowers/specs/2026-10-13-tela-nueva-design.md
git commit -m "feat(tela): el resorte de las costuras, escogido con la camiseta en el banco (E8)"
```

---

### Task 5: Los triángulos de borde: medir, probar y decidir

**Files:**
- Create: `bench/calidadDeMalla.ts`
- Create: `src/utils/cloth/implicito/banco/experimentos.ts`
- Test: `src/utils/cloth/implicito/__tests__/experimentos.test.ts`
- Modify: `bench/motorImplicito.ts`, `bench/_banco.ts` y `bench/telaNueva.ts` (opción `--topePlaca`)
- Modify: `src/components/testScenes/TelaImplicitaHarness.tsx` (parámetro `topePlaca`)

**Interfaces:**
- Consumes: `correrImplicito`, `ensayoCamiseta` y el bloque de la camiseta de `bench/telaNueva.ts` como los dejan las Tareas 2 y 4.
- Produces: `toparPlaca(placa: Placa, veces: number): number`; `correrImplicito(tela, ajustes, topePlaca?)`; `ensayoCamiseta(tela, mallas, ajustes, topePlaca?)`; el parámetro `topePlaca=<veces la mediana>` del harness.

- [ ] **Step 1: El medidor de la malla**

`bench/calidadDeMalla.ts`:

```ts
/**
 * La calidad de la malla del motor en la camiseta de María: el ángulo mínimo, los triángulos de menos de 5° y de 1°, la
 * rigidez de placa (máxima / mediana, y cuántos triángulos pasan de 10³ y de 10⁴ veces la mediana) con una tela
 * isótropa, para que la razón dependa solo de la geometría, y los cinco triángulos de más rigidez: su pieza, cuántos
 * bordes libres tienen, sus ángulos y, si tienen un borde libre, el ángulo entre sus dos bordes interiores.
 *   npx tsx bench/calidadDeMalla.ts [--mallas=5,10,20]
 */
import fs from 'node:fs';
import { hiloDe, mallarParaElMotor, patronDe, piezasDeMaria } from '../src/utils/cloth/implicito/banco/camiseta';
import { armarPrenda } from '../src/utils/cloth/implicito/prenda';
import { Placa } from '../src/utils/cloth/implicito/placa';
import { telaSI } from '../src/utils/cloth/implicito/tela';

const args = new Map(process.argv.slice(2).map((a): [string, string] => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? ''];
}));
const ISOTROPA = telaSI({ gramaje: 150, grosor: 0.5, kTrama: 1000, kUrdimbre: 1000, kCizalla: 100, pandeo: 0.4, bTrama: 5, bUrdimbre: 5, bBies: 5, friccionCuerpo: 0.3, friccionTela: 0.3 });
const piezas = piezasDeMaria(fs.readFileSync('tests/fixtures/garments/maria_patrones_samuel_2M.dxf', 'utf8'));

for (const malla of (args.get('mallas') ?? '5,10,20').split(',').map(Number)) {
  const t0 = performance.now();
  const mallas = mallarParaElMotor(piezas, malla);
  const ms = performance.now() - t0;
  const prenda = armarPrenda(piezas.map((p, k) => ({ id: p.id, x: Float64Array.from(mallas[k].vertices), patron: patronDe(mallas[k]), tris: mallas[k].triIds, hilo: hiloDe(p) })));
  const { patron, tris, piezaDeTri } = prenda.malla, nt = tris.length / 3;
  /** los ángulos del triángulo t en sus vértices 0, 1 y 2 (grados) */
  const angulos = (t: number) => {
    const v = [tris[3 * t], tris[3 * t + 1], tris[3 * t + 2]];
    const l = [0, 1, 2].map((i) => Math.hypot(patron[2 * v[(i + 1) % 3]] - patron[2 * v[i]], patron[2 * v[(i + 1) % 3] + 1] - patron[2 * v[i] + 1]));
    return [0, 1, 2].map((i) => {
      const a = l[i], b = l[(i + 2) % 3], c = l[(i + 1) % 3];
      return (Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - c * c) / (2 * a * b)))) * 180) / Math.PI;
    });
  };
  let minimo = 180, bajo5 = 0, bajo1 = 0;
  for (let t = 0; t < nt; t++) {
    const m = Math.min(...angulos(t));
    minimo = Math.min(minimo, m);
    if (m < 5) bajo5++;
    if (m < 1) bajo1++;
  }
  // con una tela isótropa, el marco del hilo no cambia la razón
  const placa = new Placa(patron, tris, ISOTROPA);
  const kDe = Float64Array.from({ length: nt }, (_, t) => Math.max(...[0, 1, 2].map((d) => Math.abs(placa.K[9 * t + 4 * d]))));
  const k = Array.from(kDe).filter((x) => x > 0 && Number.isFinite(x)).sort((a, b) => a - b);
  const mediana = k[k.length >> 1];
  const sobre = (f: number) => k.filter((x) => x > f * mediana).length;
  console.log(`malla ${malla} mm: ${patron.length / 2} vértices, ${nt} triángulos en ${ms.toFixed(0)} ms · ángulo mínimo ${minimo.toFixed(1)}° · <5° ${bajo5} · <1° ${bajo1} · K máx/mediana ${(k[k.length - 1] / mediana).toExponential(1)} · >1e3 ${sobre(1e3)} · >1e4 ${sobre(1e4)}`);
  const clave = (a: number, b: number) => (a < b ? a * patron.length + b : b * patron.length + a);
  const usos = new Map<number, number>();
  for (let t = 0; t < nt; t++) for (let i = 0; i < 3; i++) usos.set(clave(tris[3 * t + i], tris[3 * t + ((i + 1) % 3)]), (usos.get(clave(tris[3 * t + i], tris[3 * t + ((i + 1) % 3)])) ?? 0) + 1);
  const peores = Array.from({ length: nt }, (_, t) => t).filter((t) => Number.isFinite(kDe[t])).sort((a, b) => kDe[b] - kDe[a]).slice(0, 5);
  for (const t of peores) {
    const libres = [0, 1, 2].filter((i) => usos.get(clave(tris[3 * t + i], tris[3 * t + ((i + 1) % 3)])) === 1);
    const a = angulos(t), p = piezas[piezaDeTri![t]];
    const entre = libres.length === 1 ? ` · entre los dos interiores ${a[(libres[0] + 2) % 3].toFixed(1)}°` : '';
    console.log(`  K ${(kDe[t] / mediana).toExponential(1)}× · ${p.name} (${p.category ?? 'sin clase'}) · ${libres.length} bordes libres · ángulos ${a.map((x) => x.toFixed(1)).join('/')}°${entre}`);
  }
}
```

Run: `npx tsx bench/calidadDeMalla.ts`
Expected (ensayo del 2026-10-16):
- `malla 5 mm: 29505 vértices, 57216 triángulos … ángulo mínimo 11.9° · <5° 0 · <1° 0 · K máx/mediana 4.0e+4 · >1e3 9 · >1e4 1`, y los cinco peores en las mangas (`sleeve`), todos con 1 borde libre; el primero con ángulos de 82.4/66.8/30.8°.
- `malla 10 mm: 7734 vértices, 14302 triángulos … ángulo mínimo 5.7° · <5° 0 · <1° 0 · K máx/mediana 4.0e+4 · >1e3 92 · >1e4 9`.
- `malla 20 mm: 2364 vértices, 3850 triángulos … ángulo mínimo 3.1° · <5° 149 · <1° 0 · K máx/mediana 7.0e+5 · >1e3 278 · >1e4 56`, y los dos primeros con 11.6° entre sus dos bordes interiores.

- [ ] **Step 2: Escribir la prueba del experimento**

`src/utils/cloth/implicito/__tests__/experimentos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mallaDeContorno } from '../malla';
import { Placa } from '../placa';
import { telaSI } from '../tela';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';
import { toparPlaca } from '../banco/experimentos';

describe('los experimentos del banco', () => {
  it('toparPlaca baja a su techo los triángulos que pasan de N veces la mediana y deja los demás como estaban', () => {
    const m = mallaDeContorno(rectangulo(0, 0, 100, 60), 10);
    const placa = new Placa(m.patron, m.tris, telaSI(TELA_DE_LABORATORIO));
    const antes = Float64Array.from(placa.K), nt = antes.length / 9;
    const maximo = (K: Float64Array, t: number) => Math.max(Math.abs(K[9 * t]), Math.abs(K[9 * t + 4]), Math.abs(K[9 * t + 8]));
    const k = Array.from({ length: nt }, (_, t) => maximo(antes, t)).filter((v) => v > 0).sort((a, b) => a - b);
    const techo = 1.5 * k[k.length >> 1];
    const altos = Array.from({ length: nt }, (_, t) => t).filter((t) => maximo(antes, t) > techo);
    expect(altos.length).toBeGreaterThan(0);
    expect(toparPlaca(placa, 1.5)).toBe(altos.length);
    for (let t = 0; t < nt; t++) {
      if (maximo(antes, t) > techo) expect(maximo(placa.K, t) / techo).toBeCloseTo(1, 12);
      else for (let q = 0; q < 9; q++) expect(placa.K[9 * t + q]).toBe(antes[9 * t + q]);
    }
  });
});
```

Run: `npx vitest run src/utils/cloth/implicito/__tests__/experimentos.test.ts`
Expected: FAIL con `Cannot find module '../banco/experimentos'`.

- [ ] **Step 3: El experimento**

`src/utils/cloth/implicito/banco/experimentos.ts`:

```ts
/** Experimentos del banco: cambian el motor solo cuando una medida los pide, nunca por defecto. */
import type { Placa } from '../placa';

/**
 * Baja la rigidez de placa de cada triángulo que pasa de `veces` la mediana hasta ese techo, escalando su K entera
 * (sigue siendo semidefinida), y devuelve cuántos triángulos tocó. Mide cuánto pesan en la camiseta los triángulos de
 * borde que la placa mide mal; no es una corrección.
 */
export function toparPlaca(placa: Placa, veces: number): number {
  const nt = placa.K.length / 9;
  const maximo = (t: number) => Math.max(Math.abs(placa.K[9 * t]), Math.abs(placa.K[9 * t + 4]), Math.abs(placa.K[9 * t + 8]));
  const k = Array.from({ length: nt }, (_, t) => maximo(t)).filter((v) => v > 0).sort((a, b) => a - b);
  const techo = veces * k[k.length >> 1];
  let tocados = 0;
  for (let t = 0; t < nt; t++) {
    const m = maximo(t);
    if (m <= techo) continue;
    for (let q = 0; q < 9; q++) placa.K[9 * t + q] *= techo / m;
    tocados++;
  }
  return tocados;
}
```

Run: `npx vitest run src/utils/cloth/implicito/__tests__/experimentos.test.ts`
Expected: PASS, 1 passed.

La GPU sube la misma `K` que arma la CPU (`gpu/empaquetar.ts` la lee de `s.placa`), así que topar la placa del sistema antes de crear el motor vale para las dos.

- [ ] **Step 4: El banco y la GPU aceptan el experimento**

En `bench/motorImplicito.ts`, el import y el comienzo de `correrImplicito`:

```ts
import { toparPlaca } from '../src/utils/cloth/implicito/banco/experimentos';
```

```ts
/** `topePlaca`: el experimento de banco/experimentos.ts; sin él, la placa del motor */
export function correrImplicito(tela: TelaFisica, ajustes: Partial<AjustesImplicito> = {}, topePlaca?: number): Corredor {
  return (e: Escena) => {
    const s = new SistemaTela(e.malla, tela, { obstaculos: e.obstaculos, hilo: e.hilo, costuras: e.costuras, franja: e.franja, ajustes });
    if (topePlaca !== undefined) toparPlaca(s.placa, topePlaca);
```

El resto queda como lo deja la Tarea 2. En `bench/_banco.ts`, `ensayoCamiseta` entera:

```ts
export function ensayoCamiseta(tela: TelaFisica, mallas: number[], ajustes: Partial<AjustesImplicito> = {}, topePlaca?: number): FilaCamiseta[] {
  const dir = carpetaPrivada();
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'camiseta.json'), 'utf8')) as ConfigCamiseta;
  const leer = (r: string) => fs.readFileSync(path.join(dir, r), 'utf8');
  const base = { dxf: fs.readFileSync(DXF_DE_MARIA, 'utf8'), config, colocacion: leer(config.colocacion), cuerpo: leer(config.cuerpo) };
  return mallas.map((malla) => {
    const asentada = config.asentada[String(malla)];
    const c = camisetaContraLaReferencia({ ...base, asentada: asentada ? leer(asentada) : undefined }, malla, tela);
    const r = correrImplicito(tela, ajustes, topePlaca)(c.escena);
    return {
      malla, quieta: r.quieta, msPorCuadro: r.msPorCuadro, errorDeColocacion: c.errorDeColocacion,
      cgMedio: r.cgMedio, primeraCerrada: r.primeraCerrada, todasCerradas: r.todasCerradas, ...medirCamiseta(r.x, c),
    };
  });
}
```

En `bench/telaNueva.ts`, la línea de uso suma `[--topePlaca=<veces la mediana>]` después de `[--kCostura=<N/m>]`, y el bloque de la camiseta queda (con las opciones de las Tareas 2 y 4):

```ts
if (ensayo === 'camiseta') {
  if (motor !== 'implicito') throw new Error('la camiseta corre solo con el motor implícito');
  const filas = ensayoCamiseta(
    telaDeLaReferencia(ref, Number(args.get('pandeo') || PANDEO_CALIBRADO)),
    mallas,
    {
      ...(args.has('cg') ? { maxCG: Number(args.get('cg')) } : {}),
      ...(args.has('flexionDelMargen') ? { flexionDelMargen: Number(args.get('flexionDelMargen')) } : {}),
      ...(args.has('cierre') ? { cierreMaximo: Number(args.get('cierre')) / 1000 } : {}),
      ...(args.has('kCostura') ? { kCostura: Number(args.get('kCostura')) } : {}),
    },
    args.has('topePlaca') ? Number(args.get('topePlaca')) : undefined,
  );
  imprimirCamiseta(filas);
  informe.camiseta = filas;
}
```

En `TelaImplicitaHarness.tsx`, el import:

```ts
import { toparPlaca } from '../../utils/cloth/implicito/banco/experimentos';
```

y `nuevo`, que arma tanto el sistema de la GPU como el de la CPU de la paridad:

```ts
  const nuevo = () => {
    const s = new SistemaTela(e.malla, telaEnCurso, { obstaculos: e.obstaculos, hilo: e.hilo, costuras: e.costuras, franja: e.franja, ajustes });
    // el experimento de banco/experimentos.ts, solo si se pide
    if (q.get('topePlaca')) toparPlaca(s.placa, Number(q.get('topePlaca')));
    if (e.v) s.v.set(e.v);
    return s;
  };
```

Run: `npx tsc -b --noEmit && npx vitest run src/utils/cloth && npm run lint`
Expected: verde.

- [ ] **Step 5: La camiseta con la placa topada a 1000 veces su mediana**

A 5 mm, el tope de 1000 toca los 9 triángulos que pasan de 10³ (Step 1).

```bash
npm run bench:tela -- --ensayo=camiseta --mallas=20 --topePlaca=1000 > $LOGS/placa-cpu.log 2>&1; grep -a -E 'camiseta 20|aplastados|costuras más abiertas' $LOGS/placa-cpu.log
VINA_TELA_AJUSTES="topePlaca=1000" VINA_E2E_PORT=5193 node scripts/pesado.mjs --nombre=camiseta-gpu --espera=15 -- npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "a 5 mm queda quieta" --reporter=list > $LOGS/placa-gpu.log 2>&1; grep -a 'informe:' $LOGS/placa-gpu.log
```

Expected: los dos bloques. Se comparan con las últimas corridas sin el experimento (Tarea 4, con los mismos valores por defecto): quieta, aplastados (total y de las mangas), costuras y, en la GPU, `paridad.dif.maxima` de la camiseta, que en el ensayo dio 41 mm con el tope de 5 mm.

- [ ] **Step 6: Decidir con Samuel**

El experimento no queda por defecto y este plan no cambia la placa. El registro lleva la lista del Step 1 y la comparación del Step 5, con una de dos conclusiones:
- si topar la placa mejora la camiseta (la paridad baja de forma clara, las mangas se aplastan menos o la camiseta queda quieta), la placa mide mal los triángulos de borde con un borde libre, y cambiarla es física: va a Samuel con los números;
- si no la mejora, esos triángulos no son lo que frena §2, y se anota así.

- [ ] **Step 7: Commit**

```bash
git add bench/calidadDeMalla.ts bench/motorImplicito.ts bench/_banco.ts bench/telaNueva.ts src/utils/cloth/implicito/banco/experimentos.ts src/utils/cloth/implicito/__tests__/experimentos.test.ts src/components/testScenes/TelaImplicitaHarness.tsx
git commit -m "feat(banco): la calidad de la malla del motor y el experimento de la placa topada en la camiseta"
```

---

### Task 6: Dónde se van los milisegundos

**Files:**
- Modify: `tests/e2e/tela-implicita.spec.ts` (una prueba de medida en el `describe` de la camiseta)

**Interfaces:**
- Consumes: los modos y parámetros del harness (`modo=velocidad`, `cg`, `propio`, `anticipar`).

- [ ] **Step 1: La prueba de medida**

En `tests/e2e/tela-implicita.spec.ts`, dentro de `test.describe('La camiseta de María en la GPU, contra la referencia @gpu-local', …)`, después de la prueba de §2:

```ts
  test('velocidad por partes a 5 mm: iteraciones × contacto propio × anticipación (medida, sin meta)', async ({ page }) => {
    const filas: Array<{ consulta: string; msPorCuadro: number }> = [];
    for (const cg of [20, 50]) {
      for (const propio of [1, 0]) {
        for (const anticipar of [1, 0]) {
          const consulta = `modo=velocidad&escena=camiseta&malla=5&cg=${cg}&propio=${propio}&anticipar=${anticipar}&cuadros=60`;
          filas.push({ consulta, msPorCuadro: (await correr(page, consulta, 880_000)).msPorCuadro! });
        }
      }
    }
    console.log(`[velocidad] informe: ${guardarInforme('camiseta-velocidad', { filas })}`);
    for (const f of filas) expect(f.msPorCuadro).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Correrla**

Run: `VINA_E2E_PORT=5193 node scripts/pesado.mjs --nombre=camiseta-velocidad --espera=15 -- npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "velocidad por partes" --reporter=list`
Expected: 1 passed y la ruta del informe.

- [ ] **Step 3: Repartir el cuadro**

Con las ocho filas: el contacto propio cuesta `ms(propio=1) − ms(propio=0)`; la anticipación, `ms(anticipar=1) − ms(anticipar=0)`; cada iteración de gradiente conjugado, `(ms(cg=50) − ms(cg=20)) / 30`; y el resto (armar la matriz, cuerpo, costuras, búsqueda en línea) es lo que queda con propio y anticipación apagados, menos 20 iteraciones. La tabla y el reparto van al registro y al mensaje para Samuel; lo que se optimice entra al subproyecto de velocidad, no a este plan.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/tela-implicita.spec.ts
git commit -m "test(tela): la velocidad de la camiseta en la GPU, repartida por iteraciones, contacto propio y anticipación"
```

---

### Task 7: §2 entero, la suite, la revisión y el PR

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-tela-nueva-design.md` (§7, si E7 y E8 no quedaron completas)

- [ ] **Step 1: La camiseta con los valores por defecto**

Run: `VINA_E2E_PORT=5193 node scripts/pesado.mjs --nombre=camiseta-gpu --espera=15 -- npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "a 5 mm queda quieta" --reporter=list`
Expected: la prueba de §2 en verde. Si no, el informe dice qué criterio falla y por cuánto, y eso va al mensaje para Samuel; la prueba no se afloja.

- [ ] **Step 2: La CPU y el disco**

```bash
npm run bench:tela -- --ensayo=camiseta --mallas=20,10 > $LOGS/final-camiseta.log 2>&1; grep -a -E 'camiseta|§2' $LOGS/final-camiseta.log
npm run bench:tela -- --ensayo=cusick > $LOGS/final-cusick.log 2>&1; grep -a '§2' $LOGS/final-cusick.log
```

Expected: la camiseta con sus números y el disco Cusick con «§2: nivel con 5 mm pasa · … pasa», como en la parte 2: ni el tope ni el resorte tocan una escena sin costuras.

- [ ] **Step 3: La paridad entera y la suite**

```bash
VINA_E2E_PORT=5193 npx playwright test --config playwright.webgpu.config.ts tests/e2e/tela-implicita.spec.ts -g "La tela nueva en la GPU" --reporter=list
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
```

Expected: las pruebas de la GPU en verde (9 de paridad, desborde, búsqueda en línea, dos de velocidad y la quietud) y los cuatro gates en verde.

- [ ] **Step 4: La revisión de la rama**

Un revisor Opus lee la rama entera contra este plan y el spec. Los arreglos van con su prueba en rojo antes, y se repite el Step 3.

- [ ] **Step 5: Subir y abrir el PR**

```bash
git push -u origin feat/camiseta-a-s2
gh pr create --base main --title "feat(tela): la camiseta a §2 — cierre con tope, resorte escogido con el banco y medidas de malla y velocidad" --body-file <cuerpo>
```

El cuerpo describe el cambio: E7 y E8 con sus valores y la tabla de antes y después de la camiseta (solo números de Vina), lo que midieron las Tareas 3, 5 y 6 y las decisiones que quedan para Samuel. Mergear espera su orden.
