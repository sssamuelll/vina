# La interfaz en papel — P0 (base) y P1a (el papel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar medida y dentro del gate del deploy la regla «en reposo, solo lo que perdura», y cambiar la hoja del lienzo 2D: papel `#faf4e3`, cuadrícula de un solo paso que nunca se pierde, sin reglas ni cruz del origen, con una marca de escala.

**Architecture:** P0 añade un trinquete e2e que cuenta, en cuatro reposos, las superficies visibles que no son `ambiente`, `documento` ni la frase de ayuda, con línea base en JSON que solo baja; y mete ese trinquete y los dos que ya existían en la lista e2e de `scripts/deploy-prod.sh`. P1a sustituye los tres pasos fijos de cuadrícula por una función pura, `cuadroDeLaCuadricula()`, que devuelve el único cuadro visible; `GridLayer` lo pinta y `MarcaDeEscala` lo rotula. Las reglas numeradas y el interruptor de cuadrícula que no ocultaba nada se borran.

**Tech Stack:** React 18 + TypeScript, SVG, Redux Toolkit, Vitest (jsdom + Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` — § 4.4 (la hoja), § 4.6 (pantalla vacía), § 7.3 (papel y cuadrícula), § 8 (lo que se borra), § 9 (trinquetes), § 11 (filas P0 y P1a). Evidencia: `docs/superpowers/specs/2026-10-02-interfaz-en-papel/` (capturas 01 y 13).

**Rama:** `feat/interfaz-en-papel-p0-p1a`, creada desde `docs/interfaz-en-papel` (que es `main` más el spec y este plan). Un solo PR para las dos fases: P0 no cambia nada a la vista, y cada despliegue cuesta un gate entero.

**Ensayado.** El 2026-10-02 el plan entero se aplicó sobre `docs/interfaz-en-papel` (`dea7897d`), tal cual está escrito, y se revirtió sin commitear nada. Cada sustitución encontró su texto una sola vez. Con todo aplicado: `npx tsc -b --noEmit` limpio; la suite unitaria, 779 archivos y 9240 tests en verde; `eslint --max-warnings=0` limpio sobre lo tocado; el trinquete de UI sin contadores subidos; y en navegador, la marca de escala (4), la tira (2), el reposo (1) y `shift-endereza-a-la-hoja` (8), todos en verde. No se ensayaron la lista e2e entera del deploy ni los dos trinquetes viejos con el papel nuevo: eso es la Task 8.

## Global Constraints

- Papel: `--canvas-2d: #faf4e3`. Cuadrícula: `--grid-2d: #cfc8b6`, 1 px, siempre a la vista. `--grid-2d-major` se retira en el mismo commit en que se queda sin lectores (R2 = 0 en cada commit).
- El cuadro vale `editor.gridSize` por un multiplicador de la serie 1-2-5: el menor que mida 18 px o más en pantalla, con un mínimo de 1 mm. En pulgadas la serie es 1/8, 1/4, 1/2, 1, 2, 6, 12.
- Marca de escala: un corchete que mide exactamente un cuadro, apoyado sobre una línea de la cuadrícula, y su valor en la unidad activa. Mono 11 px en `--ink-hint`. `data-superficie="documento"`. No está en la pantalla vacía.
- Ningún color literal nuevo (R3 no sube), ningún `var(--x, respaldo)`, tokens solo en `src/styles/tokens.css`. `scripts/ui-contract-baseline.json` nunca se edita a mano.
- Todo texto que la usuaria lee, y todo `aria-label`, en español.
- Typecheck: `npx tsc -b --noEmit` (nunca `tsc --noEmit` a secas). Gate completo: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. Sin `--no-verify`.
- `git add` con rutas explícitas; nunca `git add -A` ni `git add .`. `.maria-avatar.mjs` no se commitea. Los mensajes de commit terminan con la línea de atribución que pida la sesión.
- E2E: el servidor de `http://localhost:5174` tiene que ser el de ESTE árbol de trabajo. Antes de la primera corrida: si algo escucha en 5174, se para; se lanza `npx vite --port 5174 --strictPort` desde este directorio y se espera a que `curl -s http://localhost:5174/app/ | grep -o "<title>[^<]*</title>"` devuelva `<title>Vina — Patronaje y simulación 3D</title>`. Siempre `--workers=2` o menos.
- Línea base de un trinquete: solo con su variable `*_UPDATE=1` y `--retries=0 --workers=1`. Nunca a mano.
- No se hace push, ni PR, ni deploy sin que Samuel lo diga. El deploy es local: `bash scripts/deploy-prod.sh`. Para validar sin tocar producción existe `--ensayo`, y solo ese: cualquier otro argumento se ignora y el script despliega. (Corregido el 2026-10-02; aquí decía que no había modo de solo gates.)
- Si se ejecuta con subagentes: no commitean, no despliegan y no corren `scripts/deploy-prod.sh`; el controlador corre los gates y commitea.

## Review Focus

Lo que el spec da por hecho y ningún caso feliz prueba. Cada línea tiene su test en la tarea que se indica.

1. **Split a 1366 × 643 con la frase de ayuda más larga** (la Pluma con un punto puesto mide más que media pantalla): la marca de escala no se pisa con la frase ni la tapa el dock. → Task 5, e2e.
2. **Unidades en pulgadas:** el cuadro es una fracción de pulgada y la marca lo dice («1/2 in»), no «12,7 mm». → Task 3 y Task 5, unitarios.
3. **Una cuadrícula rara:** el agente puede despachar `setGridSize(3)` o `setGridSize(0)`. Con 3, el cuadro sigue siendo un múltiplo; con 0, negativo o `NaN`, queda el papel solo y nada se rompe. → Task 3 y Task 4, unitarios.
4. **Zoom en los topes** (`ZOOM_MIN` 0,1 y `ZOOM_MAX` 40): el cuadro nunca baja de 18 px y siempre tiene rótulo. → Task 3, unitario.
5. **La hoja con solo un trazo o una foto y Seleccionar activa:** no vuelve «Trae tu patrón» encima del trabajo, y la marca sigue ahí. → Task 5, e2e.

---

## Mapa de archivos

| Archivo | Qué pasa | Tarea |
|---|---|---|
| `tests/e2e/helpers/reposo.ts` | nuevo: `loQueSobra()` | 1 |
| `tests/repo/reposo-lo-que-sobra.test.ts` | nuevo | 1 |
| `tests/e2e/reposo-solo-lo-que-perdura.spec.ts` | nuevo: el trinquete | 1 |
| `tests/e2e/reposo-baseline.json` | nuevo: lo escribe la corrida de actualización | 1 |
| `tests/repo/el-gate-corre-los-trinquetes.test.ts` | nuevo | 2 |
| `scripts/deploy-prod.sh` | la lista e2e gana cuatro specs | 2, 5 |
| `.claude/skills/contrato-de-interfaz/SKILL.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-09-24-cromo-callado-design.md` | documentación | 2, 5 |
| `src/components/PatternEditor/renderers/cuadricula.ts` | nuevo: el cuadro visible y su rótulo | 3 |
| `src/components/PatternEditor/renderers/GridLayer.tsx` | un solo paso, sin cruz del origen | 4 |
| `src/components/PatternEditor/renderers/gridTiers.ts` y su test | se borran | 4 |
| `src/components/PatternEditor/renderers/MarcaDeEscala.tsx` | nuevo | 5 |
| `src/components/PatternEditor/renderers/RulerLayer.tsx`, `rulerTicks.ts` y sus dos tests | se borran | 5 |
| `src/components/PatternEditor/renderers/HintText.tsx` | exporta a qué altura va la pista | 5 |
| `src/components/PatternEditor/PatternEditor.tsx`, `EmptyState2D.tsx` | montaje; qué es «vacía» | 4, 5 |
| `tests/e2e/marca-de-escala.spec.ts` | nuevo | 5 |
| `src/styles/tokens.css`, `src/styles/contrasteDeTokens.ts` | papel, cuadrícula y sus pisos | 5, 6 |
| `src/components/shell/LogoMenu.tsx`, `unifiedBarCommandDefs.ts`, `src/store/editorSlice.ts`, `src/types/types.ts` | fuera el interruptor muerto; «Unidades» | 7 |

---

## Fase P0 — La base

### Task 1: El trinquete de reposo

**Files:**
- Create: `tests/e2e/helpers/reposo.ts`
- Create: `tests/repo/reposo-lo-que-sobra.test.ts`
- Create: `tests/e2e/reposo-solo-lo-que-perdura.spec.ts`
- Create: `tests/e2e/reposo-baseline.json`

**Interfaces:**
- Consumes: `enReposo(page): Promise<string[]>` de `tests/e2e/helpers/superficies.ts` (nombres de `data-superficie` visibles, ya sin `ambiente`, `documento` ni `dev`); `leerBaseline`, `fijarBaseline`, `techoDe` de `tests/e2e/helpers/trinquete.ts`; `abrirAppVacia`, `cargarDxfDeMaria`, `reposo`, `cambiarVista` de `tests/e2e/helpers/estados.ts`.
- Produces: `loQueSobra(visibles: string[], vacia: boolean): string[]`.

- [ ] **Step 1: Escribir el test unitario que falla**

`tests/repo/reposo-lo-que-sobra.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loQueSobra } from '../e2e/helpers/reposo';

describe('lo que sobra en reposo (spec 2026-10-02 § 9)', () => {
  it('la frase de ayuda no sobra', () => {
    expect(loQueSobra(['pista'], false)).toEqual([]);
  });

  it('la tira, la fila y la barra de IA sobran, y salen ordenadas', () => {
    expect(loQueSobra(['tira', 'pista', 'fila', 'barra'], false)).toEqual(['barra', 'fila', 'tira']);
  });

  it('el estado vacío solo se permite en la pantalla vacía', () => {
    expect(loQueSobra(['estado-vacio', 'pista'], true)).toEqual([]);
    expect(loQueSobra(['estado-vacio', 'pista'], false)).toEqual(['estado-vacio']);
  });

  it('control: sin nada visible no sobra nada', () => {
    expect(loQueSobra([], false)).toEqual([]);
    expect(loQueSobra([], true)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run tests/repo/reposo-lo-que-sobra.test.ts`
Expected: FAIL — no se puede resolver `../e2e/helpers/reposo`.

- [ ] **Step 3: Escribir el helper**

`tests/e2e/helpers/reposo.ts`:

```ts
/**
 * Ley 2 de «la interfaz en papel» (spec 2026-10-02 § 3 y § 9): en reposo solo
 * está lo que perdura. `enReposo()` ya descarta `ambiente`, `documento` y
 * `dev`; de lo que queda, lo único que puede estar es la frase de ayuda
 * (`pista`) y, en la pantalla vacía, el estado vacío. Todo lo demás sobra.
 */
const PERDURA = new Set(['pista']);
const PERDURA_EN_LA_VACIA = new Set(['pista', 'estado-vacio']);

export function loQueSobra(visibles: string[], vacia: boolean): string[] {
  const permitidas = vacia ? PERDURA_EN_LA_VACIA : PERDURA;
  return visibles.filter((n) => !permitidas.has(n)).sort();
}
```

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `npx vitest run tests/repo/reposo-lo-que-sobra.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Escribir la línea base vacía y el spec**

`tests/e2e/reposo-baseline.json`:

```json
{
  "_doc": "Techos del trinquete de reposo (spec 2026-10-02 «la interfaz en papel» § 9): cuántas superficies visibles en reposo NO son ambiente, documento ni la frase de ayuda (ni, en la pantalla vacía, el estado vacío). La meta es 0 y el contador solo baja. Para fijar: REPOSO_UPDATE=1 npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts --retries=0 --workers=1. Nunca se edita a mano.",
  "meta": 0,
  "estados": {}
}
```

`tests/e2e/reposo-solo-lo-que-perdura.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { enReposo } from './helpers/superficies';
import { loQueSobra } from './helpers/reposo';
import { leerBaseline, fijarBaseline, techoDe } from './helpers/trinquete';
import { abrirAppVacia, cargarDxfDeMaria, reposo, cambiarVista } from './helpers/estados';

/**
 * Trinquete de reposo (spec 2026-10-02 «la interfaz en papel» § 3 ley 2 y § 9).
 *
 * En cada uno de los cuatro reposos cuenta las superficies visibles que NO
 * perduran: ni ambiente, ni documento, ni la frase de ayuda (ni, en la pantalla
 * vacía, el estado vacío). Falla si la cuenta supera la línea base guardada en
 * `reposo-baseline.json`. La meta es 0: cada fase del rediseño la baja.
 *
 * Un solo test para los cuatro: cada carga de la app con el DXF cuesta de 30 a
 * 50 s en esta máquina y este trinquete corre en el gate del deploy. Con
 * `expect.soft`, un reposo que falla no esconde a los otros tres.
 */
const BASELINE = 'tests/e2e/reposo-baseline.json';
const baseline = leerBaseline(BASELINE);
const medidas: Record<string, number> = {};

async function registrar(estado: string, page: Page, vacia = false): Promise<void> {
  const sobran = loQueSobra(await enReposo(page), vacia);
  medidas[estado] = sobran.length;
  const techo = techoDe(baseline, estado);
  console.log(`reposo · ${estado}: sobran ${sobran.length} [${sobran.join(', ')}] · línea base ${baseline.estados[estado] ?? '—'} · meta ${baseline.meta}`);
  if (techo !== undefined) {
    expect.soft(sobran.length, `${estado}: en reposo sobran ${sobran.join(', ')}`).toBeLessThanOrEqual(techo);
  }
}

test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });
test.afterAll(() => {
  if (process.env.REPOSO_UPDATE) fijarBaseline(BASELINE, medidas);
});

test('en reposo solo está lo que perdura', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirAppVacia(page);

  await test.step('vacía', async () => {
    await cambiarVista(page, 'Split');
    await reposo(page);
    await registrar('vacía', page, true);
  });
  await test.step('2D con patrón', async () => {
    await cambiarVista(page, '2D');
    await cargarDxfDeMaria(page);
    await reposo(page);
    await registrar('2D con patrón', page);
  });
  await test.step('Split con patrón', async () => {
    await cambiarVista(page, 'Split');
    await reposo(page);
    await registrar('Split con patrón', page);
  });
  await test.step('3D con patrón', async () => {
    await cambiarVista(page, '3D');
    await reposo(page);
    await registrar('3D con patrón', page);
  });
});
```

- [ ] **Step 6: Fijar la línea base con la app de hoy**

Run: `REPOSO_UPDATE=1 npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts --retries=0 --workers=1`

Expected: `1 passed` (unos 30 s) y estas cuatro líneas, que son lo que la app de `main` daba el 2026-10-02:

```
reposo · vacía: sobran 4 [barra, fila, mapas, tira] · línea base — · meta 0
reposo · 2D con patrón: sobran 3 [barra, fila, tira] · línea base — · meta 0
reposo · Split con patrón: sobran 4 [barra, fila, mapas, tira] · línea base — · meta 0
reposo · 3D con patrón: sobran 2 [barra, mapas] · línea base — · meta 0
```

`tests/e2e/reposo-baseline.json` queda con `"vacía": 4, "2D con patrón": 3, "Split con patrón": 4, "3D con patrón": 2`. Si algún número sale distinto, `main` cambió desde que se escribió el plan: parar y decirlo antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/helpers/reposo.ts tests/repo/reposo-lo-que-sobra.test.ts tests/e2e/reposo-solo-lo-que-perdura.spec.ts tests/e2e/reposo-baseline.json
git commit -m "test(ui): trinquete de reposo — en reposo, solo lo que perdura"
```

- [ ] **Step 8: Comprobar que el trinquete muerde**

Un trinquete que no falla cuando debe es una opinión. Con el commit ya hecho, se le baja un techo a mano, se ve fallar y se restaura:

```bash
node -e "const f='tests/e2e/reposo-baseline.json';const fs=require('fs');const b=JSON.parse(fs.readFileSync(f,'utf8'));b.estados['3D con patrón']=1;fs.writeFileSync(f,JSON.stringify(b,null,2)+'\n')"
npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts --retries=0 --workers=1
git checkout -- tests/e2e/reposo-baseline.json
```

Expected: `1 failed`, con `Error: 3D con patrón: en reposo sobran barra, mapas`, `Expected: <= 1`, `Received: 2`. Después del `git checkout`, `git status --short` no enseña el JSON.

---

### Task 2: Los tres trinquetes, al gate del deploy

**Files:**
- Create: `tests/repo/el-gate-corre-los-trinquetes.test.ts`
- Modify: `scripts/deploy-prod.sh:170-203` (comentario y lista e2e)
- Modify: `.claude/skills/contrato-de-interfaz/SKILL.md:216-236`
- Modify: `CLAUDE.md:17` (viñeta «Contrato de interfaz»)
- Modify: `docs/superpowers/specs/2026-09-24-cromo-callado-design.md:3-7`

**Interfaces:**
- Consumes: `tests/e2e/reposo-solo-lo-que-perdura.spec.ts` (Task 1).
- Produces: `tests/repo/el-gate-corre-los-trinquetes.test.ts` exige que todo spec de la lista del gate exista en disco; la Task 5 añade un spec a esa lista junto con su archivo.

**Costo, medido el 2026-10-02 con la máquina libre:** `superficies-por-accion` y `contraste-del-cromo` son 27 casos en 14,3 min con dos workers; `reposo` es 1 caso en 30 s. El gate e2e del deploy pasa de unos 21 min a unos 36.

- [ ] **Step 1: Escribir el test que falla**

`tests/repo/el-gate-corre-los-trinquetes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Los tres trinquetes de la interfaz corren en el gate del deploy (spec
 * 2026-10-02 «la interfaz en papel» § 9).
 *
 * Hasta ese día corrían «antes de cada PR», o sea cuando alguien se acordaba, y
 * la ley «se mide» era prosa: nada impedía desplegar con un contador subido.
 * Este test lee la lista del propio script, que es la que manda, y de paso
 * guarda que cada spec que nombra exista: una lista con un archivo que ya no
 * está corre menos de lo que dice.
 */
const RAIZ = process.cwd();
const GUION = readFileSync(join(RAIZ, 'scripts/deploy-prod.sh'), 'utf8');

/** Los specs del comando `npx playwright test --workers=2 \` del gate, en orden. */
function specsDelGate(): string[] {
  const lineas = GUION.split('\n');
  const inicio = lineas.findIndex((l) => l.startsWith('npx playwright test --workers=2 \\'));
  if (inicio === -1) return [];
  const specs: string[] = [];
  for (const linea of lineas.slice(inicio + 1)) {
    const m = linea.match(/^\s+(tests\/e2e\/\S+\.spec\.ts) \\$/);
    if (!m) break;
    specs.push(m[1]);
  }
  return specs;
}

describe('el gate del deploy corre los trinquetes de la interfaz', () => {
  it('el censo no está ciego: la lista se lee y es larga', () => {
    expect(specsDelGate().length).toBeGreaterThanOrEqual(28);
  });

  it('están los tres trinquetes', () => {
    expect(specsDelGate()).toEqual(expect.arrayContaining([
      'tests/e2e/reposo-solo-lo-que-perdura.spec.ts',
      'tests/e2e/superficies-por-accion.spec.ts',
      'tests/e2e/contraste-del-cromo.spec.ts',
    ]));
  });

  it('cada spec de la lista existe en disco', () => {
    expect(specsDelGate().filter((s) => !existsSync(join(RAIZ, s)))).toEqual([]);
  });

  it('ninguno está repetido', () => {
    const specs = specsDelGate();
    expect(new Set(specs).size).toBe(specs.length);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run tests/repo/el-gate-corre-los-trinquetes.test.ts`
Expected: FAIL solo en «están los tres trinquetes» (faltan los tres); los otros tres casos pasan.

- [ ] **Step 3: Añadir los specs y su razón al script**

En `scripts/deploy-prod.sh`, justo encima de la línea `npx playwright test --workers=2 \`, después del párrafo que termina en `bloquearia despliegues por un bug ajeno a lo que se este tocando.`, añadir este bloque (sin tildes, como el resto del script):

```bash
#
# Y los tres trinquetes de la interfaz (spec 2026-10-02 «la interfaz en papel»
# § 9): reposo, superficies por accion y contraste. Corrian «antes de cada PR»,
# o sea cuando alguien se acordaba, y la ley «se mide» era prosa: nada impedia
# desplegar con un contador subido. MEDIDO el 2026-10-02 con la maquina libre:
# superficies y contraste son 27 casos en 14,3 min con dos workers; reposo es
# 1 caso en 30 s. El gate pasa de unos 21 a unos 36 min. Si duele, lo primero
# que sale es `superficies-por-accion` (18 casos): reposo y contraste cazan lo
# que rompe un cambio de piel.
```

Y en la lista, después de `  tests/e2e/avatar-por-defecto.spec.ts \`, añadir tres líneas con la misma sangría de dos espacios:

```bash
  tests/e2e/reposo-solo-lo-que-perdura.spec.ts \
  tests/e2e/superficies-por-accion.spec.ts \
  tests/e2e/contraste-del-cromo.spec.ts \
```

La línea siguiente sigue siendo `  > /tmp/vina-deploy-e2e.log 2>&1 || {`.

- [ ] **Step 4: Correr los dos guardianes del script**

Run: `npx vitest run tests/repo/el-gate-corre-los-trinquetes.test.ts tests/repo/los-scripts-de-shell-no-llevan-cr.test.ts && bash -n scripts/deploy-prod.sh`
Expected: PASS, 7 tests, y `bash -n` sin salida. El segundo archivo importa: un retorno de carro antes de la barra corta el comando y el gate pasa con menos specs sin fallar.

- [ ] **Step 5: Poner la documentación al día**

En `.claude/skills/contrato-de-interfaz/SKILL.md`, sustituir desde `Y dos trinquetes más, en navegador,` hasta el bloque de los dos `*_UPDATE=1` (líneas 216-236) por:

````markdown
Y tres trinquetes más, en navegador, con su línea base en JSON que **solo baja**
(spec 2026-09-24 § 3.4 y § 7; spec 2026-10-02 § 9). El techo efectivo de un
estado es el mayor de la meta y la línea base: por debajo de la meta el diseño
puede mover superficies; por encima, solo se baja. Con reintentos, un fallo a
mitad de un grupo serial escribe medidas parciales: por eso `--retries=0`.

```bash
npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts   # en reposo, solo lo que perdura (meta: 0 de sobra)
npx playwright test tests/e2e/superficies-por-accion.spec.ts       # ≤ 4 componentes que aparecen o cambian por acción
npx playwright test tests/e2e/contraste-del-cromo.spec.ts          # ningún texto del cromo bajo AA sobre su fondo real
```

Una superficie nueva **declara** qué es con `data-superficie` (vocabulario en
`tests/repo/superficies-declaradas.test.ts`); sin marca, el trinquete no la ve.
Los tres corren en local, antes de cada PR y, desde el 2026-10-02, en el gate
del deploy (`scripts/deploy-prod.sh`); en CI el trabajo de e2e sigue en
`continue-on-error` (#506), así que ahí no bloquean el merge por sí solos.
Para bajar un techo:

```bash
REPOSO_UPDATE=1 npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts --retries=0 --workers=1
SUPERFICIES_UPDATE=1 npx playwright test tests/e2e/superficies-por-accion.spec.ts --retries=0 --workers=1
CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1
```
````

En `CLAUDE.md`, dentro de la viñeta «Contrato de interfaz», sustituir

```
Desde el 2026-09-26 hay dos trinquetes más en navegador —superficies por acción (≤ 4) y contraste del cromo—, con línea base en `tests/e2e/*-baseline.json` que solo baja;
```

por

```
Hay tres trinquetes más en navegador —superficies por acción (≤ 4) y contraste del cromo desde el 2026-09-26, y reposo (solo lo que perdura) desde el 2026-10-02—, con línea base en `tests/e2e/*-baseline.json` que solo baja y que corren en el gate de `scripts/deploy-prod.sh`;
```

En `docs/superpowers/specs/2026-09-24-cromo-callado-design.md`, después de la línea 7 (`en F0 con build de producción. Cada cita archivo:línea se verificó sobre `main` `b6c20565`.`), añadir:

```markdown
>
> **Enmendado el 2026-10-02:** las fases F2 a F6, § 4.4, § 4.6 y § 8 quedan sustituidas por
> `2026-10-02-interfaz-en-papel-design.md`. F0 y F1 siguen vigentes, con sus valores.
```

- [ ] **Step 6: Commit**

```bash
git add tests/repo/el-gate-corre-los-trinquetes.test.ts scripts/deploy-prod.sh .claude/skills/contrato-de-interfaz/SKILL.md CLAUDE.md docs/superpowers/specs/2026-09-24-cromo-callado-design.md
git commit -m "chore(deploy): los tres trinquetes de la interfaz entran al gate"
```

---

## Fase P1a — El papel

### Task 3: El cuadro de la cuadrícula

**Files:**
- Create: `src/components/PatternEditor/renderers/cuadricula.ts`
- Test: `src/components/PatternEditor/renderers/__tests__/cuadricula.test.ts`

**Interfaces:**
- Consumes: `UnitSystem` (`'mm' | 'cm' | 'inches'`) de `src/types/types.ts`; `ZOOM_MIN` (0,1) y `ZOOM_MAX` (40) de `src/input/zoom2d.ts`, solo en el test.
- Produces:
  - `CUADRO_MIN_PX: number` (18)
  - `interface Cuadro { mm: number; px: number; rotulo: string }`
  - `cuadroDeLaCuadricula(gridSizeMm: number, zoom2D: number, units: UnitSystem): Cuadro | null`
  - `primeraLineaDesde(panPx: number, cuadroPx: number, desdePx: number): number`

- [ ] **Step 1: Escribir el test que falla**

`src/components/PatternEditor/renderers/__tests__/cuadricula.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cuadroDeLaCuadricula, primeraLineaDesde, CUADRO_MIN_PX } from '../cuadricula';
import { ZOOM_MAX, ZOOM_MIN } from '../../../../input/zoom2d';

describe('cuadroDeLaCuadricula — un solo paso, siempre a la vista', () => {
  it('con el patrón de María encuadrado (zoom 0,48) el cuadro es de 50 mm', () => {
    const c = cuadroDeLaCuadricula(10, 0.48, 'mm')!;
    expect(c.mm).toBe(50);
    expect(c.px).toBeCloseTo(24);
    expect(c.rotulo).toBe('50 mm');
  });

  it('en Split (zoom 0,244) sube a 100 mm', () => {
    expect(cuadroDeLaCuadricula(10, 0.244, 'mm')).toMatchObject({ mm: 100, rotulo: '100 mm' });
  });

  it.each([
    [1, 20, '20 mm'],
    [2, 10, '10 mm'],
    [4, 5, '5 mm'],
    [10, 2, '2 mm'],
    [20, 1, '1 mm'],
  ])('a zoom %s el cuadro es de %s mm', (zoom, mm, rotulo) => {
    expect(cuadroDeLaCuadricula(10, zoom, 'mm')).toMatchObject({ mm, rotulo });
  });

  it('nunca baja de 1 mm: al tope de zoom el cuadro crece en pantalla', () => {
    const c = cuadroDeLaCuadricula(10, ZOOM_MAX, 'mm')!;
    expect(c.mm).toBe(1);
    expect(c.px).toBeCloseTo(ZOOM_MAX);
  });

  it('en centímetros dice centímetros, con coma decimal', () => {
    expect(cuadroDeLaCuadricula(10, 0.48, 'cm')!.rotulo).toBe('5 cm');
    expect(cuadroDeLaCuadricula(10, 4, 'cm')!.rotulo).toBe('0,5 cm');
    expect(cuadroDeLaCuadricula(10, 20, 'cm')!.rotulo).toBe('0,1 cm');
  });

  it('con otra cuadrícula (3 mm) el cuadro es un múltiplo 1-2-5 de ella', () => {
    expect(cuadroDeLaCuadricula(3, 1, 'mm')).toMatchObject({ mm: 30, rotulo: '30 mm' });
    expect(cuadroDeLaCuadricula(3, 10, 'mm')).toMatchObject({ mm: 3, rotulo: '3 mm' });
    expect(cuadroDeLaCuadricula(3, 20, 'mm')).toMatchObject({ mm: 1.5, rotulo: '1,5 mm' });
  });

  it('en pulgadas el cuadro es una fracción de pulgada, y lo dice', () => {
    expect(cuadroDeLaCuadricula(10, 1, 'inches')).toMatchObject({ mm: 25.4, rotulo: '1 in' });
    expect(cuadroDeLaCuadricula(10, 4, 'inches')!.rotulo).toBe('1/4 in');
    expect(cuadroDeLaCuadricula(10, 8, 'inches')!.rotulo).toBe('1/8 in');
    expect(cuadroDeLaCuadricula(10, 0.48, 'inches')!.rotulo).toBe('2 in');
    expect(cuadroDeLaCuadricula(10, 0.244, 'inches')!.rotulo).toBe('6 in');
  });

  it('en milímetros el cuadro mide entre 18 y 45 px en todo el rango de zoom', () => {
    for (let zoom = ZOOM_MIN; zoom <= 20; zoom *= 1.01) {
      const c = cuadroDeLaCuadricula(10, zoom, 'mm')!;
      expect(c.px, `zoom ${zoom}`).toBeGreaterThanOrEqual(CUADRO_MIN_PX);
      expect(c.px, `zoom ${zoom}`).toBeLessThanOrEqual(45);
      expect(c.rotulo, `zoom ${zoom}`).toMatch(/^\d+ mm$/);
    }
  });

  it('en pulgadas, entre 18 y 54 px mientras quede escalera', () => {
    for (let zoom = ZOOM_MIN; zoom <= 5.6; zoom *= 1.01) {
      const c = cuadroDeLaCuadricula(10, zoom, 'inches')!;
      expect(c.px, `zoom ${zoom}`).toBeGreaterThanOrEqual(CUADRO_MIN_PX);
      expect(c.px, `zoom ${zoom}`).toBeLessThanOrEqual(54);
    }
  });

  it('una cuadrícula o un zoom imposibles no dan cuadro, y no revientan', () => {
    expect(cuadroDeLaCuadricula(0, 1, 'mm')).toBeNull();
    expect(cuadroDeLaCuadricula(-5, 1, 'mm')).toBeNull();
    expect(cuadroDeLaCuadricula(Number.NaN, 1, 'mm')).toBeNull();
    expect(cuadroDeLaCuadricula(10, 0, 'mm')).toBeNull();
    expect(cuadroDeLaCuadricula(10, Number.POSITIVE_INFINITY, 'mm')).toBeNull();
    expect(cuadroDeLaCuadricula(0, 1, 'inches')).toBeNull();
  });
});

describe('primeraLineaDesde — la primera línea de la cuadrícula a la derecha de un punto', () => {
  it('casos medidos', () => {
    expect(primeraLineaDesde(100, 24, 74)).toBe(76);
    expect(primeraLineaDesde(-37, 24, 74)).toBe(83);
    expect(primeraLineaDesde(74, 24, 74)).toBe(74);
    expect(primeraLineaDesde(300.5, 20, 74)).toBeCloseTo(80.5);
  });

  it('siempre cae sobre una línea, en el punto o a su derecha, a menos de un cuadro', () => {
    for (const pan of [-1234.5, -37, 0, 61.25, 900]) {
      for (const cuadro of [18, 24, 44.9]) {
        const x = primeraLineaDesde(pan, cuadro, 74);
        expect(x).toBeGreaterThanOrEqual(74);
        expect(x - 74).toBeLessThan(cuadro);
        const pasos = (x - pan) / cuadro;
        expect(Math.abs(pasos - Math.round(pasos))).toBeLessThan(1e-9);
      }
    }
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/cuadricula.test.ts`
Expected: FAIL — no se puede resolver `../cuadricula`.

- [ ] **Step 3: Escribir el módulo**

`src/components/PatternEditor/renderers/cuadricula.ts`:

```ts
import type { UnitSystem } from '../../../types/types';

/**
 * La cuadrícula del lienzo 2D: UN solo paso a la vista, siempre (spec
 * 2026-10-02 «la interfaz en papel» § 4.4). Sustituye a los tres pasos fijos
 * que hubo hasta ese día (10 cm, 1 cm y 5 mm), que con el patrón entero en
 * pantalla (zoom 0,48) dejaban las líneas de 1 cm al 27 % y a 4,8 px: una
 * trama que casi no se veía.
 *
 * El cuadro vale `gridSizeMm` por un multiplicador de la escalera 1-2-5: el
 * menor que mida `CUADRO_MIN_PX` o más en pantalla, y nunca menos de 1 mm. La
 * escalera va en el MULTIPLICADOR y no en milímetros absolutos: así, de la
 * cuadrícula para arriba, un cuadro es siempre un número entero de pasos. En
 * pulgadas la escalera es la de la cinta de costura: 1/8, 1/4, 1/2, 1, 2, 6, 12.
 */
export const CUADRO_MIN_PX = 18;
const CUADRO_MIN_MM = 1;

export interface Cuadro {
  /** Lado del cuadro, en mm de patrón. */
  mm: number;
  /** Lado del cuadro, en px de pantalla. */
  px: number;
  /** Lo que dice la marca de escala: «50 mm», «0,5 cm», «1/2 in». */
  rotulo: string;
}

const PELDANOS_125 = [1, 2, 5];
/** De ×0,001 a ×5·10⁸: sobra para cualquier zoom, y acota la búsqueda. */
const DECADA_MIN = -3;
const DECADA_MAX = 8;

const PULGADA_MM = 25.4;
const PULGADAS: ReadonlyArray<{ pulgadas: number; rotulo: string }> = [
  { pulgadas: 1 / 8, rotulo: '1/8' },
  { pulgadas: 1 / 4, rotulo: '1/4' },
  { pulgadas: 1 / 2, rotulo: '1/2' },
  { pulgadas: 1, rotulo: '1' },
  { pulgadas: 2, rotulo: '2' },
  { pulgadas: 6, rotulo: '6' },
  { pulgadas: 12, rotulo: '12' },
  { pulgadas: 24, rotulo: '24' },
  { pulgadas: 48, rotulo: '48' },
  { pulgadas: 96, rotulo: '96' },
];

/** `1.5` → «1,5»; `50` → «50». Dos decimales como mucho, coma decimal. */
function numero(v: number): string {
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

/** Los cuadros posibles, de menor a mayor: la cuadrícula por 0,001, 0,002, 0,005, 0,01… */
function candidatosMm(gridSizeMm: number): number[] {
  const salida: number[] = [];
  for (let decada = DECADA_MIN; decada <= DECADA_MAX; decada++) {
    for (const peldano of PELDANOS_125) {
      // Dividir en vez de multiplicar por 10^-n: 10 × 5 / 10 da 5 exacto.
      salida.push(decada < 0 ? (gridSizeMm * peldano) / 10 ** -decada : gridSizeMm * peldano * 10 ** decada);
    }
  }
  return salida;
}

/** El cuadro que se ve a este zoom, o `null` si la cuadrícula o el zoom no valen. */
export function cuadroDeLaCuadricula(gridSizeMm: number, zoom2D: number, units: UnitSystem): Cuadro | null {
  if (!Number.isFinite(gridSizeMm) || !Number.isFinite(zoom2D) || gridSizeMm <= 0 || zoom2D <= 0) return null;

  if (units === 'inches') {
    const paso = PULGADAS.find((p) => p.pulgadas * PULGADA_MM * zoom2D >= CUADRO_MIN_PX) ?? PULGADAS[PULGADAS.length - 1];
    const mm = paso.pulgadas * PULGADA_MM;
    return { mm, px: mm * zoom2D, rotulo: `${paso.rotulo} in` };
  }

  const candidatos = candidatosMm(gridSizeMm);
  const mm = candidatos.find((c) => c >= CUADRO_MIN_MM && c * zoom2D >= CUADRO_MIN_PX) ?? candidatos[candidatos.length - 1];
  return { mm, px: mm * zoom2D, rotulo: units === 'cm' ? `${numero(mm / 10)} cm` : `${numero(mm)} mm` };
}

/**
 * La primera línea vertical de la cuadrícula en `desdePx` o a su derecha. Las
 * líneas caen en `panPx + k · cuadroPx`, con k entero.
 */
export function primeraLineaDesde(panPx: number, cuadroPx: number, desdePx: number): number {
  return panPx + Math.ceil((desdePx - panPx) / cuadroPx) * cuadroPx;
}
```

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/cuadricula.test.ts`
Expected: PASS, 16 tests (10 `it` del primer bloque, de los que uno es un `it.each` de cinco filas, más 2 del segundo).

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/renderers/cuadricula.ts src/components/PatternEditor/renderers/__tests__/cuadricula.test.ts
git commit -m "feat(lienzo): el cuadro de la cuadrícula, un solo paso en serie 1-2-5"
```

---

### Task 4: La cuadrícula de un solo paso, sin cruz del origen

**Files:**
- Modify: `src/components/PatternEditor/renderers/GridLayer.tsx` (entero)
- Modify: `src/components/PatternEditor/PatternEditor.tsx:1442`
- Delete: `src/components/PatternEditor/renderers/gridTiers.ts`
- Delete: `src/components/PatternEditor/renderers/__tests__/gridTiers.test.ts`
- Test: `src/components/PatternEditor/renderers/__tests__/GridLayer.test.tsx`

**Interfaces:**
- Consumes: `cuadroDeLaCuadricula(gridSizeMm, zoom2D, units): Cuadro | null` (Task 3).
- Produces: `GridLayer` gana la prop obligatoria `units: UnitSystem`. El patrón SVG de la cuadrícula tiene `id="grid-cuadro"` y `width`/`height` iguales al lado del cuadro en px: la Task 5 lo lee en su e2e.

- [ ] **Step 1: Escribir el test que falla**

`src/components/PatternEditor/renderers/__tests__/GridLayer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ComponentProps } from 'react';
import GridLayer from '../GridLayer';

afterEach(cleanup);

const pinta = (props: Partial<ComponentProps<typeof GridLayer>> = {}) =>
  render(
    <svg><GridLayer zoom2D={0.48} pan2D={{ x: 100, y: 60 }} gridSize={10} units="mm" {...props} /></svg>,
  ).container;

describe('GridLayer — un solo paso de cuadrícula (spec 2026-10-02 § 4.4)', () => {
  it('pinta un único patrón, del tamaño del cuadro', () => {
    const patrones = pinta().querySelectorAll('pattern');
    expect(patrones).toHaveLength(1);
    expect(patrones[0].getAttribute('id')).toBe('grid-cuadro');
    expect(Number(patrones[0].getAttribute('width'))).toBeCloseTo(24);
    expect(Number(patrones[0].getAttribute('height'))).toBeCloseTo(24);
  });

  it('la línea sale del token de la cuadrícula, a 1 px y sin apagarse', () => {
    const linea = pinta().querySelector('pattern path')!;
    expect(linea.getAttribute('style') ?? '').toContain('var(--grid-2d)');
    expect(linea.getAttribute('stroke-width')).toBe('1');
    expect(linea.hasAttribute('opacity')).toBe(false);
  });

  it('el papel va debajo y la cuadrícula encima', () => {
    const rects = pinta().querySelectorAll('svg > rect');
    expect(rects).toHaveLength(2);
    expect(rects[0].getAttribute('style') ?? '').toContain('var(--canvas-2d)');
    expect(rects[1].getAttribute('fill')).toBe('url(#grid-cuadro)');
  });

  it('no hay cruz del origen', () => {
    const c = pinta();
    expect(c.querySelector('circle')).toBeNull();
    expect(c.querySelectorAll('line')).toHaveLength(0);
  });

  it('la cuadrícula sigue al paneo', () => {
    const patron = pinta({ pan2D: { x: 100, y: 60 } }).querySelector('pattern')!;
    expect(Number(patron.getAttribute('x'))).toBeCloseTo(100 % 24);
    expect(Number(patron.getAttribute('y'))).toBeCloseTo(60 % 24);
  });

  it('en pulgadas el cuadro es de una pulgada a zoom 1', () => {
    const patron = pinta({ zoom2D: 1, units: 'inches' }).querySelector('pattern')!;
    expect(Number(patron.getAttribute('width'))).toBeCloseTo(25.4);
  });

  it('con una cuadrícula imposible queda el papel solo, sin romperse', () => {
    const c = pinta({ gridSize: 0 });
    expect(c.querySelectorAll('pattern')).toHaveLength(0);
    expect(c.querySelectorAll('svg > rect')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/GridLayer.test.tsx`
Expected: FAIL. Con el `GridLayer` de hoy a zoom 0,48 salen dos patrones (`grid-major` y `grid-minor`), hay un `<circle>` y dos `<line>` de la cruz del origen, y la línea lleva `opacity`.

- [ ] **Step 3: Reescribir `GridLayer.tsx`**

Contenido completo de `src/components/PatternEditor/renderers/GridLayer.tsx`:

```tsx
import { Point2D, UnitSystem } from '../../../types/types';
import { cuadroDeLaCuadricula } from './cuadricula';

interface GridLayerProps {
  zoom2D: number;
  pan2D: Point2D;
  gridSize: number;
  units: UnitSystem;
}

/**
 * El papel y su cuadrícula (spec 2026-10-02 «la interfaz en papel» § 4.4).
 *
 * Se pinta FUERA del grupo escalado (espacio de pantalla): las líneas quedan a
 * 1 px nítido a cualquier zoom sin dividir el grosor entre el zoom. Hay un solo
 * paso a la vista, el que da `cuadroDeLaCuadricula()`, y nunca se apaga. Los
 * colores son tokens aplicados por `style`: los atributos de presentación de
 * SVG no leen var().
 */
export default function GridLayer({ zoom2D, pan2D, gridSize, units }: GridLayerProps) {
  const cuadro = cuadroDeLaCuadricula(gridSize, zoom2D, units);

  return (
    <>
      {cuadro && (
        <defs>
          <pattern
            id="grid-cuadro"
            width={cuadro.px}
            height={cuadro.px}
            patternUnits="userSpaceOnUse"
            x={pan2D.x % cuadro.px}
            y={pan2D.y % cuadro.px}
          >
            <path
              d={`M ${cuadro.px} 0 L 0 0 0 ${cuadro.px}`}
              fill="none"
              style={{ stroke: 'var(--grid-2d)' }}
              strokeWidth={1}
            />
          </pattern>
        </defs>
      )}

      {/* El papel */}
      <rect width="100%" height="100%" style={{ fill: 'var(--canvas-2d)' }} />
      {cuadro && <rect width="100%" height="100%" fill="url(#grid-cuadro)" />}
    </>
  );
}
```

- [ ] **Step 4: Pasarle las unidades desde `PatternEditor.tsx`**

En `src/components/PatternEditor/PatternEditor.tsx`, línea 1442, sustituir

```tsx
        <GridLayer zoom2D={zoom2D} pan2D={pan2D} gridSize={gridSize} />
```

por

```tsx
        <GridLayer zoom2D={zoom2D} pan2D={pan2D} gridSize={gridSize} units={units} />
```

(`units` ya está desestructurado de `editor` en la línea 123.)

- [ ] **Step 5: Borrar los tres pasos**

```bash
git rm src/components/PatternEditor/renderers/gridTiers.ts src/components/PatternEditor/renderers/__tests__/gridTiers.test.ts
```

- [ ] **Step 6: Correr el test y el typecheck**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/GridLayer.test.tsx && npx tsc -b --noEmit`
Expected: PASS, 7 tests, y el typecheck sin salida. Si el typecheck nombra `gridTiers`, queda un importador: `grep -rn "gridTiers" src tests` tiene que dar cero.

- [ ] **Step 7: Commit**

```bash
git add src/components/PatternEditor/renderers/GridLayer.tsx src/components/PatternEditor/renderers/__tests__/GridLayer.test.tsx src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat(lienzo): cuadrícula de un solo paso, sin cruz del origen"
```

(`--grid-2d-major` sigue en `tokens.css`: todavía lo lee `RulerLayer.tsx`. Se retira en la Task 5.)

---

### Task 5: La marca de escala, y fuera las reglas

**Files:**
- Create: `src/components/PatternEditor/renderers/MarcaDeEscala.tsx`
- Create: `src/components/PatternEditor/renderers/__tests__/MarcaDeEscala.test.tsx`
- Create: `tests/e2e/marca-de-escala.spec.ts`
- Modify: `src/components/PatternEditor/renderers/HintText.tsx:64-86`
- Modify: `src/components/PatternEditor/PatternEditor.tsx:68-69, 1266, 1424, 1707-1714, 1760`
- Modify: `src/components/PatternEditor/EmptyState2D.tsx:6-14`
- Modify: `tests/repo/superficies-declaradas.test.ts:25`
- Modify: `src/styles/tokens.css:97, 153` (fuera `--grid-2d-major`; un comentario)
- Modify: `scripts/deploy-prod.sh` (la lista e2e gana un spec)
- Modify: `.claude/skills/contrato-de-interfaz/SKILL.md:91, 132, 179`, `src/components/PatternEditor/ToolStrip2D.css:6`, `tests/e2e/emplazamiento-tira.spec.ts:36` (comentarios que nombraban la regla)
- Delete: `src/components/PatternEditor/renderers/RulerLayer.tsx`, `src/components/PatternEditor/renderers/rulerTicks.ts`, `src/components/PatternEditor/renderers/__tests__/rulerTicks.test.ts`, `src/components/PatternEditor/renderers/__tests__/ruler-rotulos-no-se-pisan.test.ts`

**Interfaces:**
- Consumes: `cuadroDeLaCuadricula`, `primeraLineaDesde` (Task 3); el patrón `#grid-cuadro` (Task 4); `DOCK_WIDTH_PX` (62, exportado en `PatternEditor.tsx:101`); `shouldShowEmptyState` de `EmptyState2D.tsx`; `tests/repo/el-gate-corre-los-trinquetes.test.ts` (Task 2).
- Produces: `PISTA_Y_PORCENTAJE: number` (98), exportado de `HintText.tsx`; el componente `MarcaDeEscala`, que pinta `<g class="marca-de-escala" data-superficie="documento">`.

**Dónde va la marca en esta fase.** Abajo a la izquierda de la hoja, a la derecha del dock, que todavía flota: su primer px libre es `DOCK_WIDTH_PX + 12`. Y 18 px por encima de la línea base de la frase de ayuda, que va al 98 % del alto: la frase de la Pluma mide más que media pantalla y en Split pasaría por encima. En P2 el dock pasa a ser margen y la frase baja a la línea al pie; la marca se recoloca entonces.

- [ ] **Step 1: Escribir el e2e que falla**

`tests/e2e/marca-de-escala.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, cargarDxfDeMaria, reposo, cambiarVista } from './helpers/estados';
import { activarHerramienta, dispatch, st } from './helpers/lienzo';

/**
 * La marca de escala (spec 2026-10-02 «la interfaz en papel» § 4.4) sustituye a
 * las reglas numeradas. Tres cosas que jsdom no puede ver:
 *
 *  1. que mide lo que dice: un cuadro exacto de la cuadrícula que se pinta;
 *  2. que nada la tapa ni se pisa con la frase de ayuda, en la pantalla de
 *     María y en Split, con la frase más larga que hay;
 *  3. que no desaparece —ni vuelve «Trae tu patrón»— cuando en la hoja solo
 *     hay un trazo.
 */
interface VentanaConStore {
  __VINA_STORE__: { getState: () => { editor: { zoom2D: number } } };
}

const leer = (page: Page) => page.evaluate(() => {
  const marca = document.querySelector('.marca-de-escala');
  const patron = document.querySelector('svg.pattern-svg #grid-cuadro');
  if (!marca || !patron) return null;
  return {
    rotulo: marca.querySelector('text')?.textContent ?? '',
    anchoDelCorchete: marca.querySelector('path')!.getBoundingClientRect().width,
    cuadro: Number(patron.getAttribute('width')),
    zoom: (window as unknown as VentanaConStore).__VINA_STORE__.getState().editor.zoom2D,
  };
});

test.describe('la marca de escala (laptop de María, 1366×643)', () => {
  test.use({ viewport: { width: 1366, height: 643 } });
  test.describe.configure({ timeout: process.env.CI ? 240_000 : 90_000 });

  test('mide un cuadro exacto, lo dice, y cambia con el zoom', async ({ page }) => {
    await abrirAppVacia(page);
    await cargarDxfDeMaria(page);
    await reposo(page);

    const antes = await leer(page);
    expect(antes, 'no hay marca de escala o no hay cuadrícula').not.toBeNull();
    // 1,5 px de holgura: el corchete lleva un trazo de 1 px, mitad a cada lado.
    expect(Math.abs(antes!.anchoDelCorchete - antes!.cuadro), 'el corchete no mide un cuadro').toBeLessThan(1.5);
    expect(antes!.cuadro).toBeGreaterThanOrEqual(18);
    expect(antes!.rotulo).toMatch(/^\d+ mm$/);
    expect(Number(antes!.rotulo.replace(' mm', '')) * antes!.zoom, 'el rótulo no dice lo que mide el cuadro')
      .toBeCloseTo(antes!.cuadro, 0);

    await dispatch(page, 'editor/setZoom2D', antes!.zoom * 4);
    await page.waitForTimeout(300);
    const despues = await leer(page);
    expect(despues!.rotulo, 'al acercar, el cuadro tiene que valer menos').not.toBe(antes!.rotulo);
    expect(despues!.cuadro).toBeGreaterThanOrEqual(18);
    expect(despues!.cuadro).toBeLessThanOrEqual(45);
    expect(Math.abs(despues!.anchoDelCorchete - despues!.cuadro)).toBeLessThan(1.5);
  });

  for (const vista of ['2D', 'Split'] as const) {
    test(`en ${vista} nada la tapa y no se pisa con la frase de ayuda`, async ({ page }) => {
      await abrirAppVacia(page);
      await cargarDxfDeMaria(page);
      await cambiarVista(page, vista);
      await reposo(page);
      // La Pluma con un punto puesto enseña la frase más larga de la app.
      await activarHerramienta(page, 'h', 'pen');
      const svg = await page.locator('svg.pattern-svg').boundingBox();
      if (!svg) throw new Error('no svg');
      await page.mouse.click(svg.x + svg.width / 2, svg.y + 90);
      await page.waitForTimeout(300);

      const r = await page.evaluate(() => {
        const marca = document.querySelector('.marca-de-escala')?.getBoundingClientRect();
        if (!marca) return null;
        const pistas = Array.from(document.querySelectorAll('[data-superficie="pista"]')).map((p) => p.getBoundingClientRect());
        const sePisan = pistas.some((p) => p.left < marca.right && p.right > marca.left && p.top < marca.bottom && p.bottom > marca.top);
        const puntos = [
          [marca.left + 1, marca.top + 1],
          [(marca.left + marca.right) / 2, (marca.top + marca.bottom) / 2],
          [marca.right - 1, marca.bottom - 1],
        ];
        // La marca no recibe el ratón: `elementFromPoint` devuelve lo que hay
        // debajo o lo que la tapa. Si no es del lienzo, es cromo encima.
        const tapan = puntos
          .map(([x, y]) => document.elementFromPoint(x, y))
          .filter((el) => !el?.closest('svg.pattern-svg'))
          .map((el) => (el instanceof HTMLElement ? el.className : 'nada'));
        const area = document.querySelector('.canvas-area__2d')!.getBoundingClientRect();
        return {
          pistas: pistas.length,
          sePisan,
          tapan,
          dentro: marca.left >= area.left && marca.right <= area.right && marca.bottom <= area.bottom,
        };
      });
      expect(r, 'no hay marca de escala').not.toBeNull();
      expect(r!.pistas, 'la Pluma con un punto puesto tiene que enseñar su frase').toBeGreaterThan(0);
      expect(r!.tapan, 'algo del cromo tapa la marca de escala').toEqual([]);
      expect(r!.sePisan, 'la marca de escala y la frase de ayuda se pisan').toBe(false);
      expect(r!.dentro, 'la marca se sale del área del lienzo').toBe(true);
      await page.keyboard.press('Escape');
    });
  }

  test('con solo un trazo en la hoja, Seleccionar no devuelve la pantalla vacía', async ({ page }) => {
    await abrirAppVacia(page);
    await activarHerramienta(page, 'h', 'pen');
    const svg = await page.locator('svg.pattern-svg').boundingBox();
    if (!svg) throw new Error('no svg');
    await page.mouse.click(svg.x + 500, svg.y + 250);
    await page.mouse.click(svg.x + 700, svg.y + 250);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await st(page)).project.trazos.length, { timeout: 5_000 }).toBe(1);

    await activarHerramienta(page, 'z', 'select');
    await expect(page.locator('[data-testid="empty-state-2d"]'), '«Trae tu patrón» tapa el trazo').toHaveCount(0);
    await expect(page.locator('.marca-de-escala'), 'sin piezas pero con un trazo, la marca tiene que estar').toHaveCount(1);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx playwright test tests/e2e/marca-de-escala.spec.ts --workers=2 --retries=0`
Expected: `4 failed`. Los tres primeros, con «no hay marca de escala»; el cuarto, con «Trae tu patrón tapa el trazo» (`Expected: 0`, `Received: 1`).

- [ ] **Step 3: Escribir el test unitario que falla**

`src/components/PatternEditor/renderers/__tests__/MarcaDeEscala.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ComponentProps } from 'react';
import MarcaDeEscala from '../MarcaDeEscala';
import { PISTA_Y_PORCENTAJE } from '../HintText';

afterEach(cleanup);

type Props = ComponentProps<typeof MarcaDeEscala>;
const base: Props = {
  zoom2D: 0.48, pan2D: { x: 100, y: 60 }, gridSize: 10, units: 'mm', height: 607, izquierda: 74,
};
const pinta = (props: Partial<Props> = {}) =>
  render(<svg><MarcaDeEscala {...base} {...props} /></svg>).container;

/** Los cuatro puntos del corchete, leídos de su `d`. */
function corchete(c: HTMLElement): Array<{ x: number; y: number }> {
  const n = c.querySelector('.marca-de-escala path')!.getAttribute('d')!.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return [0, 2, 4, 6].map((i) => ({ x: n[i], y: n[i + 1] }));
}

describe('MarcaDeEscala (spec 2026-10-02 § 4.4)', () => {
  it('dice cuánto mide un cuadro', () => {
    expect(pinta().querySelector('.marca-de-escala text')!.textContent).toBe('50 mm');
  });

  it('el corchete mide exactamente un cuadro', () => {
    const p = corchete(pinta());
    expect(p[2].x - p[1].x).toBeCloseTo(24);
    expect(p[0].x).toBe(p[1].x);
    expect(p[3].x).toBe(p[2].x);
  });

  it('se apoya en una línea de la cuadrícula, a la derecha del cromo', () => {
    const x = corchete(pinta())[1].x;
    expect(x).toBeGreaterThanOrEqual(74);
    expect(x - 74).toBeLessThan(24);
    const pasos = (x - 100) / 24;
    expect(Math.abs(pasos - Math.round(pasos))).toBeLessThan(1e-9);
  });

  it('va por encima de la frase de ayuda, y dentro del lienzo', () => {
    const y = corchete(pinta())[1].y;
    const lineaDeLaPista = (607 * PISTA_Y_PORCENTAJE) / 100;
    // 11 px es el cuerpo de la frase: la marca tiene que quedar por encima.
    expect(y).toBeLessThan(lineaDeLaPista - 11);
    expect(y).toBeGreaterThan(0);
  });

  it('es documento y no recibe el ratón', () => {
    const g = pinta().querySelector('.marca-de-escala')!;
    expect(g.getAttribute('data-superficie')).toBe('documento');
    expect(g.getAttribute('pointer-events')).toBe('none');
  });

  it('la tinta y la fuente salen de tokens', () => {
    const c = pinta();
    expect(c.querySelector('.marca-de-escala path')!.getAttribute('style') ?? '').toContain('var(--ink-hint)');
    const texto = c.querySelector('.marca-de-escala text')!.getAttribute('style') ?? '';
    expect(texto).toContain('var(--ink-hint)');
    expect(texto).toContain('var(--font-mono-2d)');
  });

  it('se anuncia en español', () => {
    expect(pinta().querySelector('.marca-de-escala')!.getAttribute('aria-label')).toBe('Escala: un cuadro mide 50 mm');
  });

  it('en pulgadas habla en pulgadas', () => {
    expect(pinta({ zoom2D: 1, units: 'inches' }).querySelector('.marca-de-escala text')!.textContent).toBe('1 in');
  });

  it('antes de medir el lienzo (alto 0) no se pinta', () => {
    expect(pinta({ height: 0 }).querySelector('.marca-de-escala')).toBeNull();
  });

  it('con una cuadrícula imposible no se pinta', () => {
    expect(pinta({ gridSize: 0 }).querySelector('.marca-de-escala')).toBeNull();
  });
});
```

- [ ] **Step 4: Correrlo y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/MarcaDeEscala.test.tsx`
Expected: FAIL — no se puede resolver `../MarcaDeEscala`.

- [ ] **Step 5: Exportar la altura de la pista desde `HintText.tsx`**

En `src/components/PatternEditor/renderers/HintText.tsx`, encima del comentario `/** Pista al pie del lienzo: …` (línea 64), añadir:

```tsx
/** A qué altura del lienzo va la pista, en %. La marca de escala se coloca por
 *  encima de esta línea (MarcaDeEscala.tsx): si esto cambia, ella lo sigue. */
export const PISTA_Y_PORCENTAJE = 98;

```

Y dentro de `Pie`, sustituir

```tsx
      x="50%" y="98%"
```

por

```tsx
      x="50%" y={`${PISTA_Y_PORCENTAJE}%`}
```

El atributo sigue saliendo `y="98%"`: `tests/e2e/shift-endereza-a-la-hoja.spec.ts` localiza la pista con ese selector.

- [ ] **Step 6: Escribir `MarcaDeEscala.tsx`**

`src/components/PatternEditor/renderers/MarcaDeEscala.tsx`:

```tsx
import { Point2D, UnitSystem } from '../../../types/types';
import { cuadroDeLaCuadricula, primeraLineaDesde } from './cuadricula';
import { PISTA_Y_PORCENTAJE } from './HintText';

interface MarcaDeEscalaProps {
  zoom2D: number;
  pan2D: Point2D;
  gridSize: number;
  units: UnitSystem;
  /** Alto del lienzo en px, medido del elemento SVG. */
  height: number;
  /** Primer px, desde la izquierda, que el cromo deja libre. */
  izquierda: number;
}

/** La marca va esta distancia por encima de la línea base de la frase de ayuda. */
const SOBRE_LA_PISTA_PX = 18;
const ALTO_DEL_CORCHETE_PX = 5;

/**
 * La marca de escala: dice cuánto mide un cuadro de la cuadrícula (spec
 * 2026-10-02 «la interfaz en papel» § 4.4). Sustituye a las reglas numeradas,
 * que enseñaban coordenadas de una hoja cuyo origen es arbitrario.
 *
 * Un corchete que mide exactamente un cuadro, apoyado sobre una línea de la
 * cuadrícula, y su valor en la unidad activa. Espacio de pantalla, como
 * GridLayer. Es documento, no cromo: no recibe el ratón.
 */
export default function MarcaDeEscala({ zoom2D, pan2D, gridSize, units, height, izquierda }: MarcaDeEscalaProps) {
  const cuadro = cuadroDeLaCuadricula(gridSize, zoom2D, units);
  if (!cuadro || height <= 0) return null;

  const x = primeraLineaDesde(pan2D.x, cuadro.px, izquierda);
  const y = (height * PISTA_Y_PORCENTAJE) / 100 - SOBRE_LA_PISTA_PX;

  return (
    <g
      className="marca-de-escala"
      pointerEvents="none"
      data-superficie="documento"
      role="img"
      aria-label={`Escala: un cuadro mide ${cuadro.rotulo}`}
    >
      <path
        d={`M ${x} ${y - ALTO_DEL_CORCHETE_PX} L ${x} ${y} L ${x + cuadro.px} ${y} L ${x + cuadro.px} ${y - ALTO_DEL_CORCHETE_PX}`}
        fill="none"
        style={{ stroke: 'var(--ink-hint)' }}
        strokeWidth={1}
      />
      <text
        x={x + cuadro.px + 7}
        y={y}
        style={{ fill: 'var(--ink-hint)', fontFamily: 'var(--font-mono-2d)' }}
        fontSize={11}
      >
        {cuadro.rotulo}
      </text>
    </g>
  );
}
```

- [ ] **Step 7: Correr el test unitario y verlo pasar**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/MarcaDeEscala.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 8: Qué es «vacía», en `EmptyState2D.tsx`**

En `src/components/PatternEditor/EmptyState2D.tsx`, sustituir el comentario y la función de las líneas 6-14 por:

```tsx
/**
 * Whether the 2D canvas should show the onboarding empty-state. Shown only on
 * the idle Select tool with nothing on the sheet. `enLaHoja` counts pieces,
 * construction strokes and reference images: a stroke or a photo to trace is
 * already work, and «Trae tu patrón» must not cover it (spec 2026-10-02 § 4.6).
 * Picking any drawing tool (pen / rect / polyPen / …) clears the canvas for
 * that tool instead of keeping the overlay.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function shouldShowEmptyState(enLaHoja: number, activeTool: Tool2D): boolean {
  return enLaHoja === 0 && activeTool === 'select';
}
```

Los tests de `src/components/PatternEditor/__tests__/EmptyState2D.test.tsx` no cambian: siguen pasando un número.

- [ ] **Step 9: Montar la marca y quitar las reglas en `PatternEditor.tsx`**

Cuatro ediciones en `src/components/PatternEditor/PatternEditor.tsx`.

Imports (líneas 68-69). Sustituir

```tsx
import GridLayer from './renderers/GridLayer';
import RulerLayer from './renderers/RulerLayer';
```

por

```tsx
import GridLayer from './renderers/GridLayer';
import MarcaDeEscala from './renderers/MarcaDeEscala';
```

El comentario de la línea 1266. Sustituir

```tsx
  // Track SVG viewport size for the ruler layer (screen-space ticks/labels).
```

por

```tsx
  // Track SVG viewport size: the fit-to-view and the scale mark need it.
```

Justo encima de `return (` (línea 1425), después de la declaración de `segundoMarco`, añadir:

```tsx

  // Vacía es «no hay nada en la hoja», no «no hay piezas»: un trazo o una foto
  // para calcar ya son trabajo (spec 2026-10-02 § 4.6). De esto cuelgan el
  // estado vacío y la marca de escala.
  const pantallaVacia = shouldShowEmptyState(pieces.length + trazos.length + referenceImages.length, activeTool);
```

El bloque de `RulerLayer` (líneas 1707-1714). Sustituir

```tsx
        <RulerLayer
          zoom2D={zoom2D}
          pan2D={pan2D}
          gridSize={gridSize}
          units={units}
          width={svgSize.width}
          height={svgSize.height}
        />
```

por

```tsx
        {!pantallaVacia && (
          <MarcaDeEscala
            zoom2D={zoom2D}
            pan2D={pan2D}
            gridSize={gridSize}
            units={units}
            height={svgSize.height}
            izquierda={DOCK_WIDTH_PX + 12}
          />
        )}
```

Y el montaje del estado vacío (línea 1760). Sustituir

```tsx
      {shouldShowEmptyState(pieces.length, activeTool) && (
```

por

```tsx
      {pantallaVacia && (
```

- [ ] **Step 10: Borrar las reglas y su token**

```bash
git rm src/components/PatternEditor/renderers/RulerLayer.tsx src/components/PatternEditor/renderers/rulerTicks.ts src/components/PatternEditor/renderers/__tests__/rulerTicks.test.ts src/components/PatternEditor/renderers/__tests__/ruler-rotulos-no-se-pisan.test.ts
```

En `src/styles/tokens.css`, borrar la línea 97 entera:

```css
  --grid-2d-major: #d8d3c2;
```

Y en el comentario de la tipografía (línea 153), sustituir `(regla, cotas, píldora` por `(marca de escala, cotas, píldora`.

- [ ] **Step 11: Declarar la superficie y meter el e2e en el gate**

En `tests/repo/superficies-declaradas.test.ts`, línea 25, sustituir

```ts
  ['src/components/PatternEditor/renderers/RulerLayer.tsx', 'documento', 1],
```

por

```ts
  ['src/components/PatternEditor/renderers/MarcaDeEscala.tsx', 'documento', 1],
```

En `scripts/deploy-prod.sh`, en la lista e2e, después de `  tests/e2e/contraste-del-cromo.spec.ts \`, añadir:

```bash
  tests/e2e/marca-de-escala.spec.ts \
```

- [ ] **Step 12: Los comentarios que nombraban la regla**

En `.claude/skills/contrato-de-interfaz/SKILL.md`:

- línea 91: sustituir `bajo la regla (28 px) y nunca sobre ella` por `a 28 px del borde de arriba`;
- línea 132: sustituir `NO se abre encima de la regla ni del patrón` por `NO se abre encima del patrón`;
- línea 179: sustituir `(regla, cotas, píldora de medida, `kbd`)` por `(marca de escala, cotas, píldora de medida, `kbd`)`.

En `src/components/PatternEditor/ToolStrip2D.css`, línea 6, sustituir

```css
  top: 28px; /* 20 px de regla + 8 de aire: nunca sobre la regla */
```

por

```css
  top: 28px; /* el hueco de la regla, retirada el 2026-10-02, + 8 de aire; la tira muere en P2 */
```

En `tests/e2e/emplazamiento-tira.spec.ts`, línea 36, sustituir

```ts
    // bajo la regla (20 px), nunca sobre ella
```

por

```ts
    // a 20 px o más del borde de arriba: el hueco de la regla, retirada el 2026-10-02
```

- [ ] **Step 13: Typecheck, unitarios tocados y lint del contrato**

Run: `npx tsc -b --noEmit && npx vitest run src/components/PatternEditor tests/repo && node scripts/ui-contract-lint.mjs`
Expected: typecheck sin salida; todos los tests en verde; el trinquete con «ningún contador subió» y R2 en 0. `grep -rn "RulerLayer\|rulerTicks\|grid-2d-major" src tests` tiene que dar cero.

Dos cosas del trinquete de UI: lee `git ls-files`, así que los borrados tienen que ir por `git rm` (con un `rm` a secas revienta con `ENOENT`), y a los archivos nuevos no los ve hasta que están en el índice. El hook de pre-commit lo vuelve a correr ya con ellos dentro.

- [ ] **Step 14: Correr el e2e y verlo pasar**

Run: `npx playwright test tests/e2e/marca-de-escala.spec.ts tests/e2e/shift-endereza-a-la-hoja.spec.ts tests/e2e/emplazamiento-tira.spec.ts --workers=2 --retries=0`
Expected: todos `passed`. Los cuatro de la marca, más los dos specs que podían romperse: el que localiza la pista por `y="98%"` y el que mide dónde queda la tira.

- [ ] **Step 15: Commit**

```bash
git add src/components/PatternEditor/renderers/MarcaDeEscala.tsx src/components/PatternEditor/renderers/__tests__/MarcaDeEscala.test.tsx src/components/PatternEditor/renderers/HintText.tsx src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/EmptyState2D.tsx src/components/PatternEditor/ToolStrip2D.css src/styles/tokens.css tests/e2e/marca-de-escala.spec.ts tests/e2e/emplazamiento-tira.spec.ts tests/repo/superficies-declaradas.test.ts scripts/deploy-prod.sh .claude/skills/contrato-de-interfaz/SKILL.md
git commit -m "feat(lienzo): marca de escala en lugar de las reglas numeradas"
```

---

### Task 6: El papel y la cuadrícula, en sus valores

**Files:**
- Modify: `src/styles/contrasteDeTokens.ts:36-41` (dos pares nuevos)
- Modify: `src/styles/tokens.css:6, 38, 92-96, 113, 139, 245` (numeración de después de la Task 5, que borró una línea; manda el texto, no el número)
- Modify: `src/components/PatternEditor/EmptyState2D.css:63-66` (los números del comentario)

**Interfaces:**
- Consumes: `PARES` y `verificarContraste` de `src/styles/contrasteDeTokens.ts`; los lee `src/styles/__tests__/contrasteDeTokens.test.ts`, que no cambia.
- Produces: `--canvas-2d: #faf4e3`, `--grid-2d: #cfc8b6`.

Números medidos con `src/styles/colorMath.ts` sobre el papel nuevo: `--accent` 3,59; `--accent-fuerte` y `--cota-line-2d` 4,59; `--ink-hint` 5,32; `--ink-on-light` 12,53; `--ink-on-light-2` 4,26; `--ink-on-light-3` 2,25; `--ai` 2,35; la cuadrícula 1,52; la pieza blanca 1,10. Hoy la cuadrícula da 1,16 y la pieza 1,15.

- [ ] **Step 1: Escribir los pisos que fallan**

En `src/styles/contrasteDeTokens.ts`, dentro de `PARES`, después de la línea de `--ink-on-light-2` sobre `--canvas-2d`, añadir:

```ts
  { tinta: '--grid-2d', fondo: '--canvas-2d', minimo: 1.4, por: 'la cuadrícula se ve siempre sobre el papel' },
  { tinta: '--piece-fill-2d', fondo: '--canvas-2d', minimo: 1.09, por: 'la pieza blanca se separa del papel' },
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/styles/__tests__/contrasteDeTokens.test.ts`
Expected: FAIL en un solo caso: `--grid-2d sobre --canvas-2d da 1.16:1`. El de la pieza pasa (1,15): es un guardián para que el papel no se aclare más.

- [ ] **Step 3: Cambiar los dos valores y poner los comentarios al día**

En `src/styles/tokens.css`, sustituir el bloque

```css
  /* ── 2D pattern canvas — el papel NO se toca (spec § 4.6) ───────────
     Namespaced so the dark app chrome is untouched; consumed only by the 2D
     pattern editor renderers. The accent is reserved for selection + seams. */
  --canvas-2d: #f1efe8;
  --grid-2d: #e3dfd2;
```

por

```css
  /* ── La hoja del lienzo 2D (spec 2026-10-02 «la interfaz en papel» § 7.3) ──
     Papel más amarillo que el de cromo callado (era #f1efe8) y una cuadrícula
     de un solo paso que se ve siempre: 1,52:1 sobre el papel (las dos de antes
     daban 1,16 y 1,30). El blanco de la pieza se separa del papel 1,10:1; si
     las piezas se pierden, la reserva es #f5efde, que devuelve el 1,15. Los
     dos pisos los fija contrasteDeTokens.ts. */
  --canvas-2d: #faf4e3;
  --grid-2d: #cfc8b6;
```

Y estos cinco comentarios del mismo archivo, que citan números del papel viejo:

| Línea | Sustituir | Por |
|---|---|---|
| 6 | `(--canvas-2d es tono 94)` | `(--canvas-2d era tono 94; desde el 02-10, 91)` |
| 38 | `(3,43:1 sobre el crema; 4,67 sobre surface)` | `(3,59:1 sobre el papel; 4,67 sobre surface)` |
| 113 | `objeto gráfico); a L 0,60 da 3,43:1 y 3,95:1 sobre el blanco de la pieza.` | `objeto gráfico); a L 0,60 da 3,59:1 sobre el papel y 3,95:1 sobre la pieza.` |
| 139 | `Éste da 5,08:1` | `Éste da 5,32:1` |
| 245 | `4,38:1 sobre el crema).` | `4,59:1 sobre el papel).` |

En `src/components/PatternEditor/EmptyState2D.css`, líneas 63-66, sustituir

```css
/* Texto instructivo SOBRE el papel: --ink-hint (5,08:1 sobre --canvas-2d), el
 * mismo rol que las pistas del lienzo. --ink-on-light-2 y -3 son tintas de
 * LÍNEA (mínimo gráfico 3:1) y como texto dan 4,07:1 y 2,15:1 sobre el crema;
 * --ai (7,1:1 sobre el cromo oscuro) da 2,25:1 aquí. Lo mide
```

por

```css
/* Texto instructivo SOBRE el papel: --ink-hint (5,32:1 sobre --canvas-2d), el
 * mismo rol que las pistas del lienzo. --ink-on-light-2 y -3 son tintas de
 * LÍNEA (mínimo gráfico 3:1) y como texto dan 4,26:1 y 2,25:1 sobre el papel;
 * --ai (7,1:1 sobre el cromo oscuro) da 2,35:1 aquí. Lo mide
```

- [ ] **Step 4: Correr los pisos y los tests que leen el papel**

Run: `npx vitest run src/styles src/components/PatternEditor/renderers/__tests__/HintText.legibilidad.test.tsx src/components/PatternEditor/cotas/__tests__/cotas-contraste.test.ts && npm run lint:contraste && node scripts/ui-contract-lint.mjs`
Expected: PASS. `lint:contraste` imprime la tabla de pares con `--grid-2d` sobre `--canvas-2d` en 1.52 y `--piece-fill-2d` sobre `--canvas-2d` en 1.10, y termina en «✓ todos los pares cumplen.». El trinquete de UI, sin contadores subidos.

- [ ] **Step 5: Commit**

```bash
git add src/styles/tokens.css src/styles/contrasteDeTokens.ts src/components/PatternEditor/EmptyState2D.css
git commit -m "feat(lienzo): papel #faf4e3 y cuadrícula a la vista"
```

---

### Task 7: Fuera el interruptor que no ocultaba nada; «Unidades»

**Files:**
- Create: `src/components/shell/__tests__/vista-unidades-sin-cuadricula.test.tsx`
- Modify: `src/components/shell/LogoMenu.tsx:5, 205, 229-231`
- Modify: `src/components/shell/unifiedBarCommandDefs.ts:9, 12, 73-75`
- Modify: `src/store/editorSlice.ts:33, 255-257, 318`
- Modify: `src/types/types.ts:921`
- Modify: `src/__tests__/store.test.ts:14, 342`
- Modify: `src/copilot/__tests__/toolExecutor.test.ts:65`, `src/copilot/actions/__tests__/actionExecutor.test.ts:102`, `src/copilot/perception/__tests__/copilotContext.test.ts:100`, `src/copilot/perception/__tests__/contextBuilder.test.ts:116`

**Interfaces:**
- Consumes: `COMMANDS` de `unifiedBarCommandDefs.ts`; el componente `LogoMenu` con sus props `onOpenPanel` y `onImportDXF`.
- Produces: `EditorState` ya no tiene `snapToGrid`; `editorSlice` ya no exporta `toggleSnapToGrid`. `gridSize`, `setGridSize`, `units` y `setUnits` se quedan.

Por qué: «Vista › Cuadrícula» y el comando «Mostrar u ocultar cuadrícula» despachan `toggleSnapToGrid()`, y `snapToGrid` no tiene ningún lector. No ocultan nada. La cuadrícula está siempre.

- [ ] **Step 1: Escribir el test que falla**

`src/components/shell/__tests__/vista-unidades-sin-cuadricula.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * El menú Vista después de «la interfaz en papel» (spec 2026-10-02 § 4.4 y § 8).
 *
 * «Cuadrícula» despachaba `toggleSnapToGrid()`, y `snapToGrid` no tenía ningún
 * lector: un interruptor que no ocultaba nada. Y las unidades se llamaban
 * «Regla: cm», cuando la regla ya no existe y las leen las cotas, Medir y los
 * trazos.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { COMMANDS } from '../unifiedBarCommandDefs';
import constructionReducer from '../../../store/constructionSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import dockReducer from '../../../store/dockSlice';
import editorReducer from '../../../store/editorSlice';
import projectReducer from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolsReducer from '../../../store/toolSlice';
import LogoMenu from '../LogoMenu';

vi.mock('../../../utils/export/uiExport', () => ({ runUiExport: vi.fn() }));
vi.mock('../../../utils/export/diagnosticExporter', () => ({ downloadDiagnosticBundle: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function abrirVista() {
  const store = configureStore({
    reducer: {
      editor: editorReducer, project: projectReducer, tools: toolsReducer,
      simulation: simulationReducer, dock: dockReducer,
      construction: constructionReducer, copilotUI: copilotUIReducer,
    },
  });
  render(<Provider store={store}><LogoMenu onOpenPanel={() => {}} onImportDXF={() => {}} /></Provider>);
  fireEvent.click(screen.getByRole('button', { name: /vina/i }));
  fireEvent.mouseEnter(screen.getByText('Vista'));
  const rotulos = Array.from(document.querySelectorAll('.logo-menu__label')).map((el) => el.textContent?.trim() ?? '');
  return { store, rotulos };
}

describe('el menú Vista', () => {
  it('el barrido ve el cajón abierto (control)', () => {
    expect(abrirVista().rotulos).toContain('Margen de costura');
  });

  it('no ofrece un interruptor de cuadrícula', () => {
    expect(abrirVista().rotulos).not.toContain('Cuadrícula');
  });

  it('las unidades se llaman «Unidades», no «Regla»', () => {
    const { rotulos } = abrirVista();
    expect(rotulos).toEqual(expect.arrayContaining(['Unidades: cm', 'Unidades: pulgadas', 'Unidades: mm']));
    expect(rotulos.filter((r) => r.startsWith('Regla'))).toEqual([]);
  });

  it('y siguen cambiando la unidad', () => {
    const { store } = abrirVista();
    fireEvent.click(screen.getByText('Unidades: cm'));
    expect(store.getState().editor.units).toBe('cm');
  });
});

describe('la paleta de comandos', () => {
  it('no ofrece mostrar u ocultar la cuadrícula', () => {
    expect(COMMANDS.find((c) => c.id === 'toggle-grid')).toBeUndefined();
    expect(COMMANDS.filter((c) => /cuadrícula/i.test(c.name))).toEqual([]);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/components/shell/__tests__/vista-unidades-sin-cuadricula.test.tsx`
Expected: FAIL en cuatro de los cinco casos: «no ofrece un interruptor de cuadrícula», «las unidades se llaman…», «y siguen cambiando la unidad» (no encuentra el texto «Unidades: cm») y «no ofrece mostrar u ocultar la cuadrícula». El control pasa.

- [ ] **Step 3: El menú**

En `src/components/shell/LogoMenu.tsx`:

Línea 5: sustituir

```tsx
  setViewMode, undo, redo, toggleSnapToGrid, toggleSeamAllowance,
```

por

```tsx
  setViewMode, undo, redo, toggleSeamAllowance,
```

Línea 205: borrar la línea entera

```tsx
  { label: 'Cuadrícula', action: (d) => d(toggleSnapToGrid()), checked: (s) => s.editor.snapToGrid },
```

Líneas 229-231: sustituir

```tsx
  { label: 'Regla: cm', action: (d) => d(setUnits('cm')), checked: (s) => s.editor.units === 'cm' },
  { label: 'Regla: pulgadas', action: (d) => d(setUnits('inches')), checked: (s) => s.editor.units === 'inches' },
  { label: 'Regla: mm', action: (d) => d(setUnits('mm')), checked: (s) => s.editor.units === 'mm' },
```

por

```tsx
  { label: 'Unidades: cm', action: (d) => d(setUnits('cm')), checked: (s) => s.editor.units === 'cm' },
  { label: 'Unidades: pulgadas', action: (d) => d(setUnits('inches')), checked: (s) => s.editor.units === 'inches' },
  { label: 'Unidades: mm', action: (d) => d(setUnits('mm')), checked: (s) => s.editor.units === 'mm' },
```

- [ ] **Step 4: La paleta**

En `src/components/shell/unifiedBarCommandDefs.ts`:

Línea 9: sustituir

```ts
import { setViewMode, toggleSnapToGrid, toggleSeamAllowance, toggleGrainlines, togglePieceNames, undo, redo } from '../../store/editorSlice';
```

por

```ts
import { setViewMode, toggleSeamAllowance, toggleGrainlines, togglePieceNames, undo, redo } from '../../store/editorSlice';
```

Línea 12: sustituir

```ts
  FileText, Scissors, Ruler, Shirt, Download, Grid3x3, Eye,
```

por

```ts
  FileText, Scissors, Ruler, Shirt, Download, Eye,
```

Líneas 74-75: borrar el comentario y el comando, las dos líneas enteras

```ts
  // Sin atajo: `G` es la herramienta Línea interna, no la cuadrícula (#1170).
  { id: 'toggle-grid', category: 'Vista', name: 'Mostrar u ocultar cuadrícula', description: 'La cuadrícula del lienzo', icon: Grid3x3, action: (d) => d(toggleSnapToGrid()) },
```

- [ ] **Step 5: La bandera**

En `src/types/types.ts`, línea 921, borrar la línea entera:

```ts
  snapToGrid: boolean;
```

En `src/store/editorSlice.ts`:

- línea 33, borrar la línea entera `  snapToGrid: true,`;
- líneas 255-257, borrar el reductor entero:

```ts
    toggleSnapToGrid(state) {
      state.snapToGrid = !state.snapToGrid;
    },
```

- línea 318, sustituir

```ts
  toggleSeamAllowance, setDefaultSAWidth, setNotchMirrorInvert, toggleGrainlines, toggleNotches, toggleSnapToGrid, setGridSize, toggleAnchorPoints,
```

por

```ts
  toggleSeamAllowance, setDefaultSAWidth, setNotchMirrorInvert, toggleGrainlines, toggleNotches, setGridSize, toggleAnchorPoints,
```

- [ ] **Step 6: Los tests que nombraban la bandera**

En `src/__tests__/store.test.ts`: en la línea 14, sustituir `toggleNotches, toggleSnapToGrid,` por `toggleNotches,`; en la línea 342, borrar la línea entera `    store.dispatch(toggleSnapToGrid());`.

En estos cuatro archivos, borrar la línea entera `snapToGrid: true,` (con su sangría):

- `src/copilot/__tests__/toolExecutor.test.ts:65`
- `src/copilot/actions/__tests__/actionExecutor.test.ts:102`
- `src/copilot/perception/__tests__/copilotContext.test.ts:100`
- `src/copilot/perception/__tests__/contextBuilder.test.ts:116`

- [ ] **Step 7: Correr el test nuevo, el censo y el typecheck**

Run: `npx vitest run src/components/shell/__tests__/vista-unidades-sin-cuadricula.test.tsx src/components/shell src/__tests__/store.test.ts src/copilot && npx tsc -b --noEmit`
Expected: PASS y typecheck sin salida. `grep -rln "snapToGrid\|toggle-grid\|Grid3x3" src | grep -v vista-unidades-sin-cuadricula` no devuelve nada: el único archivo de `src` que los nombra es el test nuevo, que afirma que ya no están. (En `tests/e2e/maria-218-eco-punto-y-mover.spec.ts:153` queda un comentario que cuenta una historia vieja; no se toca.)

- [ ] **Step 8: Commit**

```bash
git add src/components/shell/__tests__/vista-unidades-sin-cuadricula.test.tsx src/components/shell/LogoMenu.tsx src/components/shell/unifiedBarCommandDefs.ts src/store/editorSlice.ts src/types/types.ts src/__tests__/store.test.ts src/copilot/__tests__/toolExecutor.test.ts src/copilot/actions/__tests__/actionExecutor.test.ts src/copilot/perception/__tests__/copilotContext.test.ts src/copilot/perception/__tests__/contextBuilder.test.ts
git commit -m "refactor(menu): fuera el interruptor de cuadrícula que no ocultaba nada; «Unidades»"
```

---

### Task 8: Los gates enteros, y mirarlo en la pantalla de María

**Files:**
- Modify (solo si un contador bajó): `tests/e2e/superficies-baseline.json`, `tests/e2e/contraste-baseline.json`, `scripts/ui-contract-baseline.json`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la rama lista para que Samuel decida qué hacer con ella.

- [ ] **Step 1: El gate completo**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo en verde; `lint:ui` con «ningún contador subió». Si `lint:ui` dice que algún contador BAJÓ: `node scripts/ui-contract-lint.mjs --update` y se commitea `scripts/ui-contract-baseline.json`.

- [ ] **Step 2: La lista e2e del deploy, sin desplegar**

`bash scripts/deploy-prod.sh --ensayo` corre todos los gates del deploy —typecheck, lint, contrato, unitarios, smoke del WASM, la lista e2e, el e2e de la home y el build— y sale antes de enviar. (Corregido el 2026-10-02: el plan decía que ese modo no existía. La revisión final lo encontró en las líneas 10 y 26-27 del script.) Para correr solo la lista e2e, se saca del script:

```bash
npx playwright test --workers=2 $(grep -oE "tests/e2e/[a-zA-Z0-9-]+\.spec\.ts" scripts/deploy-prod.sh | sort -u)
```

Expected: 32 specs, todos `passed`, en unos 38 min (la lista vieja, 21 min medidos el 14-09; los trinquetes, 15 medidos el 02-10; la marca, cuatro casos más). Un `flaky` se mira: pasó al reintento, pero es lo que hay que leer antes de desplegar. Un `failed` se arregla: no se sube un timeout para taparlo.

- [ ] **Step 3: Bajar los techos que hayan bajado**

En la salida del paso anterior, las líneas `superficies · …`, `contraste · …` y `reposo · …` dicen lo medido y la línea base. Si alguna medida quedó por debajo de su línea base:

```bash
SUPERFICIES_UPDATE=1 npx playwright test tests/e2e/superficies-por-accion.spec.ts --retries=0 --workers=1
CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1
git add tests/e2e/superficies-baseline.json tests/e2e/contraste-baseline.json
git commit -m "test(ui): techos de los trinquetes tras P1a"
```

La marca de escala es `documento` y no cuenta en superficies ni en reposo: lo esperado es que nada se mueva. Si nada bajó, este paso no deja commit.

- [ ] **Step 4: Mirarlo a 1366 × 643, en 2D y en Split**

```bash
node --input-type=module - <<'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
for (const [nombre, vista] of [['p1a-2d', '2D'], ['p1a-split', 'Split']]) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 643 } });
  await page.goto('http://localhost:5174/app/');
  await page.locator('svg.pattern-svg').waitFor({ timeout: 60000 });
  await page.locator('input[accept=".dxf"]').setInputFiles('tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
  await page.waitForFunction(() => window.__VINA_STORE__.getState().project.pieces.length === 5, undefined, { timeout: 60000 });
  await page.locator('.pill-group').getByRole('button', { name: vista, exact: true }).click();
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelectorAll('.toast__dismiss').forEach((b) => b.click()));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `docs/reports/ui-audit-2026-10-02-hoy/capturas/${nombre}.png` });
  await page.close();
}
await browser.close();
EOF
```

La carpeta `docs/reports/ui-audit-2026-10-02-hoy/` está ignorada por git: las capturas no se commitean. Abrir las dos imágenes y comprobar, una por una:

1. El papel es amarillo cálido, no el gris crema de antes, y las piezas blancas se distinguen de él.
2. La cuadrícula se ve entera, con cuadros de entre 18 y 45 px; no hay una trama fina debajo ni líneas más marcadas cada diez.
3. No hay reglas numeradas arriba ni a la izquierda, ni cruz del origen.
4. La marca de escala está abajo a la izquierda, a la derecha del dock, por encima de la frase de ayuda, y dice un valor redondo («100 mm» con el patrón recién importado, que se encuadra al ancho de Split).
5. Al comparar con `docs/superpowers/specs/2026-10-02-interfaz-en-papel/00-hoy-2d.png`, lo único que cambió es la hoja: el dock, la tarjeta de herramienta, la fila de capas y la barra de IA están donde estaban.

Si algo de esto no se cumple, se arregla antes de seguir; no se da la tarea por hecha con los tests en verde.

- [ ] **Step 5: Dejar la rama lista**

`git status --short` solo enseña `.maria-avatar.mjs` sin seguimiento. `git log --oneline docs/interfaz-en-papel..HEAD` enseña los commits de las Tasks 1 a 7 (y el de techos, si lo hubo). No se hace push ni se abre PR: eso lo decide Samuel.

---

## Notas de la ejecución (2026-10-02)

Lo que el código hace distinto de lo que este plan dice, y por qué:

- **Tarea 4, test del desplazamiento.** El pan (100, 60) pasaba contra el código viejo por coincidencia (100 mod 48 = 100 mod 24). Se cambió a (130, 85), con los literales 10 y 13.
- **Tarea 5, sitio de la marca de escala.** El plan la pone abajo a la izquierda, por encima de la frase de ayuda. La revisión final midió que, con un panel abierto a la izquierda, en 1366 px cae debajo de la barra de IA; por encima de la banda de la barra choca con la fila de capas en Split. Quedó arriba a la izquierda, en los 20 px que ocupaba la regla (`c8fdfa06`): sin la prop `height` y sin `PISTA_Y_PORCENTAJE`. Vuelve abajo, a donde dice la spec § 4.4, cuando P2 despeje el pie.
- **Tarea 8, paso 2.** Existe `bash scripts/deploy-prod.sh --ensayo` (ver arriba).
