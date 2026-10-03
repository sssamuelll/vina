# La interfaz en papel — P1b (lo que flota, en claro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los menús, los avisos, los tooltips, los modales y la barrita de la pieza pasen a ser papel (blanco, línea de pelo, sombra corta, tinta oscura) sin tocar el marco, y que dos redes lo defiendan: el trinquete de contraste midiendo cada superficie que cambia y un test que pide, archivo por archivo, que lo que flota esté hecho de papel.

**Architecture:** Un bloque `[data-material="papel"]` en `tokens.css` redefine, para lo que está dentro, la rampa de texto, los bordes, los semánticos y el material de lo que flota. Cada superficie que flota lleva ese atributo en su raíz; las que pintaban con colores escritos a mano o con fondos del marco pasan a tokens. `:root` no cambia: conserva el overlay oscuro para lo que todavía no ha pasado a papel (la barra de IA, la tira, la fila, el dock, los paneles, el cromo del 3D).

**Tech Stack:** React 18 + TypeScript, CSS con custom properties, Vitest (jsdom + lectura de fuentes), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` — § 6.3 (lo que flota), § 7.1 (dos materiales), § 7.2 (el ámbito de papel), § 9 (contraste «se vuelve a medir entero en P1b»; colores escritos a mano), § 10 (enmienda del contrato § 2), § 11 (fila P1b y «ningún color escrito a mano en lo que cada fase toque»), § 12 (riesgos), § 13 (lo que las maquetas no enseñaron: un menú, un aviso o un modal en claro).

**Rama:** `feat/interfaz-en-papel-p1b`, creada desde `main` en `4e9efe1c` (P0 + P1a desplegados). Este plan es su primer commit.

**Ensayado.** El 2026-10-03 el plan entero se aplicó sobre `main` (`4e9efe1c`), tal cual está escrito, con un script que exige que cada texto a sustituir aparezca una sola vez, y se revirtió sin commitear. Cada rojo y cada verde de las Tasks 1 a 7 se vio en su paso: los conteos de los «Expected» son los medidos. Con todo aplicado (40 archivos, +507 −126): `npx tsc -b --noEmit` limpio; la suite unitaria, 781 archivos y 9357 tests en verde; `eslint --max-warnings=0` limpio sobre lo tocado; el trinquete de UI con R3 en 535 y R8 en 23; `lint:contraste` con sus 56 pares en verde. En navegador, con las Tasks 1 a 6: contraste (12), `emplazamiento-modales`, `1099-modal-piquete-junto-a-la-pieza`, `1095-menu-avisa-que-hay-mas`, `las-siete-puertas`, `maria-200-mover-sin-residuo` y `cotas-no-tapan-el-transform-box`, 41 de 41; con la 7, `las-siete-puertas` 16 de 16. El ensayo cazó cuatro cosas que el plan ya incorpora: tres textos que hoy, en oscuro, están bajo AA (Task 1, paso 3); el menú de «+», que no se ve (Task 7); el test hermano que buscaba ese menú en su contenedor (Task 7, paso 1); y que el escenario 3D ya es gris claro, no oscuro (Review Focus 5). No se ensayó la lista e2e entera del deploy: eso es la Task 8. Las capturas del ensayo, a 1366 × 643 en Split, están en `docs/reports/ui-audit-2026-10-02-hoy/p1b-en-la-app.html` (carpeta fuera de git).

## Global Constraints

- Lo que flota (§ 6.3, § 7.1): fondo `#ffffff`, borde `1px solid rgba(40, 36, 30, 0.14)`, radio 8 (`--surface-overlay-radius`), sombra `0 1px 2px rgba(40, 36, 30, 0.10), 0 8px 24px rgba(40, 36, 30, 0.12)`, texto en tinta. Velo de un modal: `rgb(41 38 33 / 32%)`. Nada con blur.
- El ámbito de papel (§ 7.2), valores exactos: `--text-primary` `oklch(0.27 0.010 80)`, `--text-secondary` `oklch(0.45 0.012 80)`, `--text-tertiary` `oklch(0.50 0.012 80)`, `--text-disabled` `oklch(0.66 0.010 80)`, `--bg-elevated` `oklch(0.92 0.022 91)`, `--field-bg` `#ffffff` (en el marco vale `--bg-elevated`), `--border` `oklch(0.62 0.012 80)`, `--border-subtle` y el color de `--hairline` `rgba(40, 36, 30, 0.14)`, `--accent-ink` `oklch(0.50 0.15 248)`, `--ai` `oklch(0.50 0.16 295)`, `--success` `oklch(0.50 0.13 150)`, `--warning` `oklch(0.52 0.12 70)`, `--destructive` `oklch(0.52 0.18 25)`, `--destructive-hover` `oklch(0.46 0.18 25)`.
- No cambian en ningún ámbito: `--accent`, `--accent-fuerte`, `--accent-fuerte-hover`, `--on-accent`, `--accent-subtle`, `--accent-border`.
- El marco no cambia (§ 7.1, fila P1b de § 11: «la barra y los paneles, como están»). Tampoco, hasta su fase, la barra de IA y su paleta, la tira, la fila y el dock (P2) ni el cromo del 3D (P5, § 12).
- Ningún color escrito a mano en lo que P1b toca (§ 11). R3 solo baja. Los colores que son dato se quedan y se dicen (los ocho de capa).
- Ningún `var(--x, respaldo)`; tokens solo en `src/styles/tokens.css` (R4 = 1). `scripts/ui-contract-baseline.json` solo con `node scripts/ui-contract-lint.mjs --update`, y se commitea en la tarea que bajó el contador.
- Todo texto que la usuaria lee, y todo `aria-label`, en español.
- Typecheck: `npx tsc -b --noEmit` (nunca `tsc --noEmit` a secas). Gate completo: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. Sin `--no-verify`.
- `git add` con rutas explícitas; nunca `git add -A` ni `git add .`. `.maria-avatar.mjs` no se commitea. Los mensajes de commit terminan con la línea de atribución que pida la sesión.
- E2E: el servidor de `http://localhost:5174` tiene que ser el de ESTE árbol de trabajo. Antes de la primera corrida: si algo escucha en 5174 y no es un `vite` lanzado desde este directorio, se para; se lanza `npx vite --port 5174 --strictPort` desde aquí y se espera a que `curl -s http://localhost:5174/app/ | grep -o "<title>[^<]*</title>"` devuelva `<title>Vina — Patronaje y simulación 3D</title>`. Siempre `--workers=2` o menos.
- Línea base de un trinquete: solo con su variable `*_UPDATE=1` y `--retries=0 --workers=1`. Nunca a mano.
- No se hace push, ni PR, ni deploy sin que Samuel lo diga. El deploy es local: `bash scripts/deploy-prod.sh`; `--ensayo` corre todo menos el envío, y cualquier otro argumento se ignora y despliega.
- Si se ejecuta con subagentes: no commitean, no despliegan y no corren `scripts/deploy-prod.sh`; el controlador corre los gates y commitea.

## Review Focus

Lo que el spec da por hecho y ningún caso feliz prueba. Cada línea tiene su test en la tarea que se indica.

1. **Un portal colgado de `<body>`** (el tooltip, el submenú del clic derecho, el menú de capas, el modal de conexión) hereda la tinta clara que `<body>` ya calculó. Sin la marca en su raíz y sin la línea `color:` del ámbito, sale un menú blanco con letra clara. → Task 2 (el ámbito declara `color`), Task 5 (todo portal nace papel), Task 1 (estados «tooltip», «submenú del clic derecho», «modal de conexión»).
2. **Un alias de `:root`** (`--text-muted`, 81 consumidores) baja ya resuelto con el valor del marco: 3,35:1 sobre blanco. → Task 2 (todo alias se re-declara), Task 1 (estado «aviso»: la equis de cerrar usa `--text-muted`).
3. **El valor de un campo no es un nodo de texto:** el trinquete de contraste no lo mide. Un campo con `--bg-base` dentro de un modal blanco queda negro con tinta negra y pasa en verde. → Tasks 3 a 6 (`lo-que-flota-es-papel.test.ts`, regla «ningún fondo del marco»).
4. **La fila resaltada de un menú blanco:** el tinte del acento compuesto sobre blanco, con el atajo terciario encima (5,02:1). → Task 1 (estado «submenú del logo»: la fila de arriba queda resaltada mientras su submenú está abierto).
5. **Lo que flota sobre el escenario 3D:** el menú del modo de superficie cuelga de una píldora que sigue oscura (P5) y cae sobre el gris claro del escenario (`#e0e0e0` de `renderSettings`), sin papel debajo y sin portal: recibe la tinta por herencia de su raíz, dentro de cromo oscuro. → Task 1 (estado «menú de superficie (3D)»).

## Decisiones de este plan

Lo que la spec no decide y este plan sí. Cada una con lo que cuesta si está mal.

1. **El blanco vive en el ámbito, no en `:root`.** El bloque `[data-material="papel"]` lleva `--surface-overlay-bg: #ffffff` y el resto del material; `:root` conserva el overlay oscuro de hoy. Así una superficie que olvide el atributo se queda oscura y legible, no blanca con tinta clara, y cada superficie pasa a papel en su tarea sin romper las demás. Si estuviera mal: cuando todo haya pasado a papel (P5), mover cuatro valores a `:root`.
2. **La hoja y el escenario no llevan el ámbito en P1b.** Encima de la hoja viven todavía el dock, la tira y la fila, que son oscuros; encima del escenario, el cromo del 3D. Con el ámbito, su `--text-*` se volvería tinta oscura sobre fondo oscuro. La hoja lo gana en P2 y el escenario en P5. Hoy ningún texto del papel usa `--text-*` (usa `--ink-*`), así que no se pierde nada. Se anota en la spec, § 7.2.
3. **Lo que pasa a papel en P1b es la lista de la fila P1b de § 11, entera:** el menú del logo y sus submenús, el clic derecho del 2D y del 3D y sus submenús, el menú del dock, el menú y el selector de color de Capas, el menú del modo de superficie (3D), los avisos, la tarjeta de «suelta tu archivo», los tooltips, los cuatro modales (confirmación, piquete, calibración, conexión) y la barrita de la pieza. **No pasan:** la barra de IA y su paleta («la barra y los paneles, como están»; P2 la rehace), la tira, la fila y el dock (P2 los quita o los muda), los paneles (marco) y el resto del cromo del 3D (P5). El modal de conexión sí pasa aunque se abra desde la barra: es un modal y cuelga de `<body>`.
4. **Dentro del papel, lo que separa es línea de pelo.** Los separadores de los menús y las rayas bajo una cabecera pasan de `--border` a `--border-subtle` o `--hairline`: dentro del ámbito, `--border` es el borde de un campo (`#8a857e`, 3,66:1) y de separador pesa como un campo. Si estuviera mal: volver a `--border`, cinco líneas.
5. **El aviso con Deshacer dice «Undo».** `showUndoToast` (`copilotUISlice.ts:411`) escribe el rótulo en inglés, y María lo ve al cambiar un margen de costura. P1b repinta ese aviso y la captura lo enseña: se corrige aquí, con su test (contrato § 5). Es lo único de este plan que no es material.
6. **Los ocho colores de `LayerColorPicker.tsx` son dato:** los que la usuaria escoge para una capa. Se quedan, y R3 los sigue contando.
7. **El trinquete de contraste mide lo nuevo con una pieza sembrada, no con el DXF** (ninguna superficie que flota depende del patrón, y en un grupo serial del gate cada carga del DXF son de 10 a 20 s), y **un estado sin línea base deja de pasar en silencio**: hasta hoy `techoDe()` devolvía `undefined` y la aserción se saltaba (revisión final de P0 + P1a, menor aplazado).
8. **El menú de «+» del dock no se ve desde el 2026-09-09, y se arregla aquí (Task 7). Esto sí es fuera de la spec.** Lo encontró el ensayo: la captura del menú salía vacía. El scroll que #1149 le puso al dock lo recorta a cualquier alto de ventana, y siete herramientas solo tienen esa puerta. Se arregla aquí y no en P2 porque P1b repinta ese mismo menú y porque la puerta está rota hoy, en la pantalla de María. El portal sirve también para el margen de P2, que se desplaza igual. Si Samuel lo quiere aparte, la Task 7 sale entera y nada más depende de ella.

**Lo que el ensayo vio y este plan no arregla.** El submenú Vista del menú del logo queda, a 1366 × 643, con su pie debajo de la barra de IA. La barra superior es un hijo flex con `z-index: 100`, eso la vuelve contexto de apilamiento, y su menú (200) compite como 100 contra la barra de IA, que también es 100 y va después. Tapa la columna de atajos de dos filas; los rótulos se leen. Es de emplazamiento, no de material, y P2 cambia la barra de IA. Y quedan dos textos bajo AA en los ajustes de la barra de IA («Ratón (CLO3D)» y su descripción, `--accent` como tinta, 4,02:1), que P2 muda a Preferencias.

---

## Mapa de archivos

| Archivo | Qué pasa | Tarea |
|---|---|---|
| `tests/e2e/contraste-del-cromo.spec.ts` | diez estados nuevos; un estado sin línea base falla | 1 |
| `tests/e2e/contraste-baseline.json` | los diez estados (tres ya bajo AA en oscuro); bajan el clic derecho a 0 y el modal de conexión a 2 | 1, 3, 5 |
| `src/styles/tokens.css` | el ámbito de papel, `--field-bg`, comentarios | 2 |
| `src/styles/colorMath.ts` | `cssDelAmbito()` | 2 |
| `src/styles/contrasteDeTokens.ts`, `scripts/contraste-tokens.ts` | los pares del ámbito | 2 |
| `src/styles/__tests__/ambito-de-papel.test.ts` | nuevo | 2 |
| `src/styles/__tests__/colorMath.test.ts` | `cssDelAmbito` | 2 |
| `.claude/skills/contrato-de-interfaz/SKILL.md`, la spec § 7.2 | enmienda § 2; nota de cuándo lleva cada cosa el ámbito | 2 |
| `tests/repo/lo-que-flota-es-papel.test.ts` | nuevo; crece en cada tarea | 3, 4, 5, 6 |
| `src/components/shell/LogoMenu.tsx`, `src/components/PatternEditor/ContextMenu.tsx`, `src/components/Viewport3D/ContextMenu3D.tsx`, `src/components/shared/SubMenu.tsx`, `src/components/shell/DockToolPicker.tsx`, `src/components/LayerPanel/LayerPanel.tsx`, `src/components/LayerPanel/LayerColorPicker.tsx`, `src/components/Viewport3D/SurfaceModePill.tsx` | la marca en la raíz | 3 |
| `src/styles/floating.css`, `src/components/shared/SubMenu.css`, `src/components/shell/Dock.css` | separadores de pelo | 3 |
| `src/components/shell/ToastContainer.tsx`, `ToastContainer.css`, `src/components/shell/ToolTooltip.tsx`, `src/components/shell/AppShell.tsx` | avisos y tooltips | 4 |
| `src/store/copilotUISlice.ts`, `src/store/__tests__/copilotUISlice.test.ts` | «Deshacer» | 4 |
| `src/components/shell/ConfirmDialog.tsx`, `src/components/PatternEditor/NotchPrecisionModal.tsx`, `NotchPrecisionModal.css`, `src/components/PatternEditor/CalibrationModal.tsx`, `CalibrationModal.css`, `src/copilot/connections/ConnectionModal.tsx`, `src/copilot/connections/DynamicProviderForm.tsx` | los modales | 5 |
| `src/components/PatternEditor/FloatingActionBar.tsx`, `src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx` | la barrita | 6 |
| `src/components/shell/DockToolPicker.tsx`, `LeftDock.tsx`, `Dock.css`, `__tests__/DockToolPicker.test.tsx`, `__tests__/shortcutSurfaces.loteA.test.tsx`, `tests/e2e/las-siete-puertas.spec.ts` | el menú de «+», en `<body>` | 7 |
| `scripts/ui-contract-baseline.json` | R3 baja: 565 → 560 → 539 → 535; R8: 24 → 23 | 4, 5, 6, 7 |

**Los colores escritos a mano de lo que flota, clasificados** (`node scripts/ui-contract-lint.mjs --list R3` sobre esos archivos, 2026-10-03):

| Sitio | Literal | Qué es | Pasa a |
|---|---|---|---|
| `ToastContainer.css:68` | `rgba(255, 255, 255, 0.08)` | fondo del botón de acción | `var(--bg-elevated)` |
| `ToastContainer.css:69` | `rgba(255, 255, 255, 0.14)` | su borde | `var(--hairline)` |
| `ToastContainer.css:81` | `rgba(255, 255, 255, 0.16)` | su fondo al pasar | `var(--accent-subtle)` |
| `ToastContainer.css:82` | `rgba(255, 255, 255, 0.28)` | su borde al pasar | `var(--accent-border)` |
| `ToastContainer.css:116` | `rgba(255, 255, 255, 0.08)` | fondo de la equis al pasar | `var(--bg-elevated)` |
| `NotchPrecisionModal.css:15` | `rgba(0, 0, 0, 0.45)` | sombra | `var(--surface-overlay-shadow)` |
| `CalibrationModal.css:4` | `rgba(0, 0, 0, 0.5)` | velo | `var(--scrim)` |
| `CalibrationModal.css:12, 13` | `#2a2a2a`, `#444` | fondo y borde | `var(--surface-overlay-bg)`, `var(--surface-overlay-border)` |
| `CalibrationModal.css:17, 24, 43, 52, 69` | `#e0e0e0`, `#fff` | texto | `var(--text-primary)`, rótulos `var(--text-secondary)` |
| `CalibrationModal.css:29` | `#aaa` | texto secundario | `var(--text-secondary)` |
| `CalibrationModal.css:49, 50` | `#1e1e1e`, `#555` | campo | `var(--field-bg)`, `1px solid var(--border)` |
| `CalibrationModal.css:67, 68` | `#555`, `#333` | botón secundario | `1px solid var(--border)`, `transparent` |
| `CalibrationModal.css:75, 76, 77` | `#0078d4`, `#fff` | botón primario | `var(--accent-fuerte)`, `var(--on-accent)` |
| `CalibrationModal.css:81, 82` | `#0078d480` | primario deshabilitado | `opacity: 0.5`, como el del piquete |
| `ConnectionModal.tsx:39` | `rgba(0, 0, 0, 0.6)` | velo | `var(--scrim)` |
| `ConnectionModal.tsx:54` | `rgba(0, 0, 0, 0.5)` | sombra | `var(--surface-overlay-shadow)` |
| `FloatingActionBar.tsx:78, 79, 81` | `#1a1a1a`, `#333`, `rgba(0, 0, 0, 0.4)` | fondo, borde, sombra | el material de lo que flota |
| `FloatingActionBar.tsx:104` | `#e0e0e0` | icono | `var(--text-primary)` |
| `LayerColorPicker.tsx:4, 5` | ocho colores | los que la usuaria escoge para una capa | **dato: se quedan** |

Treinta pasan a token; R3 queda en 535.

---

### Task 1: El trinquete de contraste mide lo que flota

**Files:**
- Modify: `tests/e2e/contraste-del-cromo.spec.ts` (se reescribe entero)
- Modify: `tests/e2e/contraste-baseline.json` (lo escribe la corrida de actualización)

**Interfaces:**
- Consumes: `medirContraste(page)` de `tests/e2e/helpers/contraste.ts`; `leerBaseline`, `fijarBaseline`, `techoDe` de `tests/e2e/helpers/trinquete.ts`; `abrirAppVacia`, `cargarDxfDeMaria`, `reposo`, `seleccionarPieza`, `abrirPaleta`, `abrirPanel`, `cambiarVista` de `tests/e2e/helpers/estados.ts`; `addPiece(page, id, pos, w, h)`, `dispatch(page, type, payload)`, `clickAt(page, p, button)`, `activarHerramienta(page, tecla, id)` de `tests/e2e/helpers/lienzo.ts`.
- Produces: diez estados nuevos en `contraste-baseline.json`, con estos nombres exactos: `aviso`, `diálogo de confirmación`, `tooltip`, `menú del dock`, `menú del clic derecho`, `submenú del clic derecho`, `submenú del logo`, `modal del piquete`, `modal de conexión`, `menú de superficie (3D)`. Las Tasks 3 a 6 los corren después de cada cambio.

Se miden ANTES de cambiar nada: la línea base sale del oscuro de hoy y a partir de ahí cada superficie que pasa a papel tiene que seguir en su techo.

- [ ] **Step 1: Reescribir el spec con los estados nuevos**

`tests/e2e/contraste-del-cromo.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { medirContraste } from './helpers/contraste';
import { leerBaseline, fijarBaseline, techoDe } from './helpers/trinquete';
import {
  abrirAppVacia, cargarDxfDeMaria, reposo, seleccionarPieza, abrirPaleta, abrirPanel, cambiarVista,
} from './helpers/estados';
import { addPiece, dispatch, clickAt, activarHerramienta } from './helpers/lienzo';

/**
 * Trinquete de contraste del cromo (spec 2026-09-24 «cromo callado» § 4.2 y
 * § 7 F1). Por estado, cuenta los textos que no llegan a AA sobre su fondo
 * real y falla si la cuenta supera el techo guardado. La meta es 0; lo que
 * hoy falla y no toca F1 (paneles de contenido) baja en F5 y F6.
 *
 * Desde P1b de «la interfaz en papel» (spec 2026-10-02 § 9) mide también lo
 * que flota, que pasa a papel: el aviso, el diálogo, el tooltip, los menús
 * con sus submenús (dos cuelgan de <body>) y los modales.
 */
const BASELINE = 'tests/e2e/contraste-baseline.json';
const baseline = leerBaseline(BASELINE);
const medidas: Record<string, number> = {};

async function registrar(estado: string, page: Parameters<typeof medirContraste>[0]): Promise<void> {
  const fallos = await medirContraste(page);
  medidas[estado] = fallos.length;
  const techo = techoDe(baseline, estado);
  console.log(`contraste · ${estado}: ${fallos.length} texto(s) bajo AA · línea base ${baseline.estados[estado] ?? '—'} · techo ${techo ?? '—'} · meta ${baseline.meta}`);
  for (const f of fallos) console.log(`    ${f.ratio}:1 (mín ${f.minimo}) «${f.texto}» ${f.selector} — ${f.color} sobre ${f.fondo}`);
  // Un estado que no está en la línea base no medía nada: `techoDe` daba
  // undefined y la aserción se saltaba (revisión final de P0 + P1a). Ahora
  // falla, salvo en la corrida que la escribe.
  if (!process.env.CONTRASTE_UPDATE) {
    expect.soft(techo, `«${estado}» no está en ${BASELINE}: fíjalo con CONTRASTE_UPDATE=1`).toBeDefined();
  }
  if (techo !== undefined) {
    // Blando: en los tests que miden varias superficies seguidas, una que
    // falla no esconde a las que vienen detrás.
    expect.soft(fallos.length, fallos.map((f) => `${f.ratio}:1 «${f.texto}» ${f.selector}`).join('\n')).toBeLessThanOrEqual(techo);
  }
}

// Serial: `medidas` se acumula en el proceso para escribir la línea base al
// final con CONTRASTE_UPDATE=1. 90 s y no los 30 del config: cada test carga
// el DXF real en frío; en CI (3-6× más lento) 240 s, como el trinquete de
// superficies — en serial, un solo timeout tumba el grupo entero.
test.describe.configure({ mode: 'serial', timeout: process.env.CI ? 240_000 : 90_000 });
test.afterAll(() => {
  if (process.env.CONTRASTE_UPDATE) fijarBaseline(BASELINE, medidas);
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirAppVacia(page);
});

test('estado vacío', async ({ page }) => {
  await registrar('estado vacío', page);
});

test('reposo con patrón', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await registrar('reposo con patrón', page);
});

test('pieza seleccionada', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await seleccionarPieza(page);
  await registrar('pieza seleccionada', page);
});

test('menú del logo', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await page.locator('.logo-menu__trigger').click();
  await expect(page.locator('.logo-menu')).toBeVisible();
  await registrar('menú del logo', page);
});

test('paleta abierta', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await abrirPaleta(page);
  await registrar('paleta abierta', page);
});

test('panel Propiedades', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await seleccionarPieza(page);
  await abrirPanel(page, 'Propiedades', 'Propiedades');
  await registrar('panel Propiedades', page);
});

test('panel Capas', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await abrirPanel(page, 'Capas', 'Capas');
  await registrar('panel Capas', page);
});

test('3D en reposo', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await cambiarVista(page, '3D');
  await registrar('3D en reposo', page);
});

test('el navegador entiende la piel: oklch con alfa y color-mix (Review Focus 2)', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await page.keyboard.press('z');
  const fondoActivo = await page.locator('.dock__tool--active').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fondoActivo, 'el relleno del dock activo no se parseó').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  const sutil = await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.background = 'var(--accent-subtle)';
    document.body.appendChild(d);
    const c = getComputedStyle(d).backgroundColor;
    d.remove();
    return c;
  });
  expect(sutil, '--accent-subtle (oklch con alfa) no compone').not.toMatch(/^$|rgba\(0, 0, 0, 0\)/);
  const mezcla = await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.background = 'color-mix(in oklab, var(--accent) 10%, transparent)';
    document.body.appendChild(d);
    const c = getComputedStyle(d).backgroundColor;
    d.remove();
    return c;
  });
  expect(mezcla, 'color-mix() (marquesina y previsualización de formas) no se parseó').not.toMatch(/^$|rgba\(0, 0, 0, 0\)/);
});

// ── Lo que flota (spec 2026-10-02 § 9: en P1b se vuelve a medir entero) ──
// Con una pieza sembrada y no con el DXF: ninguna de estas superficies
// depende del patrón, y en un grupo serial del gate cada carga del DXF son
// de 10 a 20 s. Las esperas cortas dejan terminar las animaciones de
// entrada: a media opacidad el medidor no cuenta el texto.

test('lo que flota sobre la hoja: aviso, diálogo, tooltip y menús', async ({ page }) => {
  await addPiece(page, 'flota', { x: 120, y: 120 }, 300, 240);
  await reposo(page);

  await dispatch(page, 'copilotUI/showToast', {
    type: 'undo', message: 'Margen de costura 8 mm → 10 mm', actionLabel: 'Deshacer',
    actionPayload: { type: 'editor/noop' }, duration: 0,
  });
  await expect(page.locator('.toast')).toBeVisible();
  await page.waitForTimeout(300);
  await registrar('aviso', page);
  await reposo(page);

  await dispatch(page, 'copilotUI/showConfirmation', {
    title: 'Eliminar la pieza', description: 'La pieza se borra con sus costuras.',
    consequences: ['Se pierden 2 costuras'], destructive: true, confirmLabel: 'Eliminar la pieza',
  });
  await expect(page.locator('.confirm-dialog')).toBeVisible();
  await page.waitForTimeout(300);
  await registrar('diálogo de confirmación', page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.confirm-dialog')).toHaveCount(0);

  await page.locator('.dock--left .dock__tool').first().hover();
  await expect(page.locator('.tool-tooltip')).toBeVisible({ timeout: 3_000 });
  await page.waitForTimeout(200);
  await registrar('tooltip', page);
  await page.mouse.move(700, 600);

  await page.getByRole('button', { name: 'Personalizar herramientas del dock' }).click();
  await expect(page.locator('.dock-picker')).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('menú del dock', page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.dock-picker')).toHaveCount(0);

  await clickAt(page, { x: 270, y: 240 }, 'right');
  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('menú del clic derecho', page);
  await menu.getByRole('button', { name: /Orden/ }).first().hover();
  await expect(page.locator('.submenu-panel')).toBeVisible({ timeout: 2_000 });
  await page.waitForTimeout(200);
  await registrar('submenú del clic derecho', page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await page.locator('.logo-menu__trigger').click();
  await page.locator('.logo-menu > .logo-menu__item').first().hover();
  await expect(page.locator('.logo-menu__submenu')).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('submenú del logo', page);
  await page.keyboard.press('Escape');
});

test('los modales: el del piquete y el de conexión', async ({ page }) => {
  await addPiece(page, 'piquete', { x: 120, y: 120 }, 300, 400);
  await reposo(page);
  await activarHerramienta(page, 'Shift+N', 'notch');
  // El piquete tiene que caer sobre el contorno y no en el relleno: se
  // prueban varios puntos del lado izquierdo, como en emplazamiento-modales.
  const modal = page.locator('.notch-precision-modal');
  for (const y of [320, 260, 380, 220, 420]) {
    await clickAt(page, { x: 120, y });
    await page.waitForTimeout(250);
    if (await modal.isVisible()) break;
  }
  await expect(modal, 'ningún clic sobre el borde abrió el modal del piquete').toBeVisible();
  await registrar('modal del piquete', page);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  await page.getByRole('button', { name: 'Modo ajustes' }).click();
  await page.getByRole('button', { name: /Agregar (conexión|tu primera conexión)/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Agregar conexión' })).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('modal de conexión', page);
});

test('lo que flota en el 3D: el menú del modo de superficie', async ({ page }) => {
  await cambiarVista(page, '3D');
  await page.locator('.surface-pill__trigger').click();
  await expect(page.locator('.surface-pill__flyout')).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('menú de superficie (3D)', page);
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1`

Expected: `1 failed`, `9 passed`, `2 did not run` (el grupo es serial: el primero que falla se lleva a los de detrás). El que falla es «lo que flota sobre la hoja», con siete errores blandos del tipo `«aviso» no está en tests/e2e/contraste-baseline.json: fíjalo con CONTRASTE_UPDATE=1`. Las siete superficies abrieron: si un `expect(...).toBeVisible()` falla antes, el spec está mal, no la línea base.

- [ ] **Step 3: Fijar la línea base con la app de hoy**

Run: `CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1`

Expected: `12 passed` (unos 9 min). `tests/e2e/contraste-baseline.json` gana los diez estados. Siete en `0`. Tres no, y son textos que hoy, en oscuro, ya están bajo AA (medido el 2026-10-03):

```
menú del clic derecho: 2     «🗑» y «Eliminar pieza»: --destructive sobre el overlay oscuro, 4,26:1
submenú del clic derecho: 3  los dos de arriba, y la flecha «▸» del submenú sobre su fila resaltada, 4,31:1
modal de conexión: 3         el enlace «vercel.com/account/ai/keys» (--accent, 4,07:1), y dos textos de la
                             barra de IA en modo ajustes, detrás del velo: «Ratón (CLO3D)» y su descripción
                             (--accent como tinta, 4,02:1)
```

El tokens.css promete 4,65:1 para `--destructive`, pero contra `--bg-surface`: el overlay está al 96 % y deja pasar el papel, y eso lo baja a 4,26. En blanco dan 6,05 (lo destructivo), 5,02 (la flecha sobre su fila) y 5,91 (el enlace, con `--accent-ink`): las Tasks 3 y 5 los bajan. Los dos de la barra de IA son de P2, que muda los ajustes a Preferencias. Si sale otro número, `main` cambió desde que se escribió el plan: parar y decirlo.

- [ ] **Step 4: Correrlo sin actualizar**

Run: `npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1`
Expected: `12 passed`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/contraste-del-cromo.spec.ts tests/e2e/contraste-baseline.json
git commit -m "test(ui): el trinquete de contraste mide lo que flota, y un estado sin línea base falla"
```

---

### Task 2: El ámbito de papel

**Files:**
- Create: `src/styles/__tests__/ambito-de-papel.test.ts`
- Modify: `src/styles/__tests__/colorMath.test.ts` (import y un `describe` al final)
- Modify: `src/styles/colorMath.ts` (`cssDelAmbito`)
- Modify: `src/styles/contrasteDeTokens.ts` (se reescribe entero), `scripts/contraste-tokens.ts` (se reescribe entero)
- Modify: `src/styles/tokens.css` (`--field-bg`, el bloque del ámbito, cuatro comentarios)
- Modify: `.claude/skills/contrato-de-interfaz/SKILL.md` (§ 2 y la pregunta 2), `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (§ 7.2)

**Interfaces:**
- Consumes: `resolveToken(css, name)`, `tokenColor(css, name)`, `contrastRatio(a, b)` de `src/styles/colorMath.ts`.
- Produces: el selector `[data-material="papel"]` en `tokens.css`; el token `--field-bg`; `cssDelAmbito(css: string, ambito: string): string` en `colorMath.ts`; `Par.ambito?: 'papel'` en `contrasteDeTokens.ts`. Las Tasks 3 a 6 ponen `data-material="papel"` en las raíces y usan `--field-bg` en los campos.

Nada cambia a la vista en esta tarea: el bloque existe, pero ninguna superficie lleva todavía el atributo.

- [ ] **Step 1: Escribir los tests que fallan**

`src/styles/__tests__/ambito-de-papel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El ámbito de papel (spec 2026-10-02 «la interfaz en papel» § 7.2): un bloque
 * `[data-material="papel"]` en tokens.css que redefine, para lo que está
 * dentro, los nombres que usa el marco. Lo lleva la raíz de lo que flota.
 * Los ratios los fija contrasteDeTokens.ts; aquí, que el bloque exista, que
 * diga lo que la spec dice y que no deje escapar un valor del marco.
 */
const TOKENS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function bloque(selector: string): string | null {
  const i = TOKENS.indexOf(`${selector} {`);
  return i === -1 ? null : TOKENS.slice(i, TOKENS.indexOf('}', i));
}
const declaraciones = (cuerpo: string) =>
  new Map([...cuerpo.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));

const ambito = bloque('[data-material="papel"]');
const papel = declaraciones(ambito ?? '');
const raiz = declaraciones(bloque(':root') ?? '');

describe('el ámbito de papel (spec 2026-10-02 § 7.2)', () => {
  it('existe: un bloque [data-material="papel"] en tokens.css', () => {
    expect(ambito, 'falta el bloque [data-material="papel"] en tokens.css').not.toBeNull();
  });

  it.each([
    '--text-primary', '--text-secondary', '--text-tertiary', '--text-disabled',
    '--bg-elevated', '--field-bg', '--border', '--border-subtle', '--hairline',
    '--accent-ink', '--ai', '--success', '--warning', '--destructive', '--destructive-hover',
    '--surface-overlay-shadow', '--scrim',
  ])('redefine %s', (token) => {
    expect(papel.has(token), `${token} no está en el ámbito de papel`).toBe(true);
  });

  it('lo que flota es blanco (§ 7.1)', () => {
    expect(papel.get('--surface-overlay-bg')).toBe('#ffffff');
  });

  it('declara color: sin eso, un portal colgado de <body> hereda la tinta clara del marco', () => {
    expect(ambito ?? '').toMatch(/^\s*color:\s*var\(--text-primary\);/m);
  });

  it('--field-bg existe también en el marco, y ahí es el elevado de siempre', () => {
    expect(raiz.get('--field-bg')).toBe('var(--bg-elevated)');
  });

  it('todo alias de :root que lee un nombre del ámbito se vuelve a declarar en el ámbito', () => {
    // CSS resuelve var() donde se DECLARA: `--text-muted: var(--text-tertiary)`
    // en :root baja ya resuelto al terciario del marco, que sobre blanco da
    // 3,35:1. Y colorMath.cssDelAmbito, que lo leería con el del ámbito, daría
    // un verde falso: esta regla es la que hace coincidir las dos lecturas.
    const faltan = [...raiz]
      .filter(([nombre, valor]) => !papel.has(nombre)
        && [...valor.matchAll(/var\((--[\w-]+)\)/g)].some((m) => papel.has(m[1])))
      .map(([nombre]) => nombre);
    expect(faltan).toEqual([]);
  });

  it('el acento no cambia en ningún ámbito', () => {
    for (const t of ['--accent', '--accent-fuerte', '--accent-fuerte-hover', '--on-accent', '--accent-subtle', '--accent-border']) {
      expect(papel.has(t), `${t} no se redefine: es el mismo en el marco y en el papel`).toBe(false);
    }
  });
});
```

En `src/styles/__tests__/colorMath.test.ts`, sustituir

```ts
import {
  oklchToRgb, parseCssColor, toHex, contrastRatio, compositeOver, resolveToken, tokenColor,
} from '../colorMath';
```

por

```ts
import {
  oklchToRgb, parseCssColor, toHex, contrastRatio, compositeOver, resolveToken, tokenColor, cssDelAmbito,
} from '../colorMath';
```

En `src/styles/__tests__/colorMath.test.ts`, sustituir

```ts
  it('avisa del token que no existe y del ciclo', () => {
    expect(() => resolveToken(CSS, '--nada')).toThrow(/no existe/);
    expect(() => resolveToken(CSS, '--ciclo')).toThrow(/ciclo/);
  });
});
```

por

```ts
  it('avisa del token que no existe y del ciclo', () => {
    expect(() => resolveToken(CSS, '--nada')).toThrow(/no existe/);
    expect(() => resolveToken(CSS, '--ciclo')).toThrow(/ciclo/);
  });
});

describe('colorMath — el CSS visto desde dentro de un ámbito', () => {
  const CSS = [
    ':root {', '  --fondo: #000000;', '  --solo-raiz: #123456;', '}',
    '[data-material="papel"] {', '  --fondo: #ffffff;', '}',
  ].join('\n');
  it('lo que el ámbito declara gana a :root', () => {
    expect(resolveToken(cssDelAmbito(CSS, 'papel'), '--fondo')).toBe('#ffffff');
  });
  it('lo que el ámbito no declara sale de :root', () => {
    expect(resolveToken(cssDelAmbito(CSS, 'papel'), '--solo-raiz')).toBe('#123456');
  });
  it('un ámbito que no existe rompe en voz alta, no cae a :root en silencio', () => {
    expect(() => cssDelAmbito(CSS, 'otro')).toThrow(/no hay ámbito "otro"/);
  });
});
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `npx vitest run src/styles/__tests__/ambito-de-papel.test.ts src/styles/__tests__/colorMath.test.ts`

Expected: FAIL, `24 failed | 13 passed (37)`. En `ambito-de-papel`, 21 de 23: el bloque no existe, los 17 nombres no están, el blanco y `color:` tampoco, y `--field-bg` no existe en `:root`; pasan el de los alias y el del acento (con el ámbito vacío no hay nada que pedir). En `colorMath`, los tres nuevos con `TypeError: (0 , __vite_ssr_import_1__.cssDelAmbito) is not a function`; los once de antes, en verde.

- [ ] **Step 3: Escribir `cssDelAmbito`**

En `src/styles/colorMath.ts`, sustituir

```ts
export function tokenColor(css: string, name: string): RGBA {
  return parseCssColor(resolveToken(css, name));
}
```

por

```ts
export function tokenColor(css: string, name: string): RGBA {
  return parseCssColor(resolveToken(css, name));
}

/**
 * El CSS visto desde dentro de `data-material="<ámbito>"` (spec 2026-10-02
 * § 7.2): lo que el ámbito declara va delante, y `resolveToken`, que toma la
 * primera declaración, encuentra la del ámbito o, si no la hay, la de :root.
 *
 * Una diferencia con el navegador, a sabiendas: aquí un alias de :root
 * (`--text-muted: var(--text-tertiary)`) se sigue con los valores del ámbito, y
 * el navegador lo resuelve en :root, con los del marco. Las dos lecturas
 * coinciden porque ambito-de-papel.test.ts exige que el ámbito vuelva a
 * declarar cada alias que lea uno de sus nombres.
 */
export function cssDelAmbito(css: string, ambito: string): string {
  const bloque = css.match(new RegExp(`\\[data-material="${ambito}"\\]\\s*\\{([^}]*)\\}`));
  if (!bloque) throw new Error(`no hay ámbito "${ambito}" en el CSS`);
  return `${bloque[1]}\n${css}`;
}
```

Run: `npx vitest run src/styles/__tests__/colorMath.test.ts`
Expected: PASS, 14 de 14.

- [ ] **Step 4: Los pares del ámbito, que fallan**

`src/styles/contrasteDeTokens.ts`:

```ts
import { contrastRatio, cssDelAmbito, tokenColor } from './colorMath';

/**
 * Los pares de la piel que tienen que cumplir un piso (spec 2026-09-24
 * «cromo callado» § 4). Texto normal: AA 4,5:1. Objeto gráfico (una línea,
 * un borde, un relleno sin texto): 3:1. Deshabilitado: 2,5:1 — WCAG lo exime,
 * pero por debajo de eso ni se ve que hay un control.
 *
 * Un par con `ambito` se lee desde dentro de `data-material="<ámbito>"`
 * (spec 2026-10-02 § 7.2).
 */
export interface Par { tinta: string; fondo: string; minimo: number; por: string; ambito?: 'papel' }
export interface Resultado extends Par { ratio: number; ok: boolean }

/** Los pares del ámbito de papel: sobre la hoja (que lo gana en P2), sobre el
 *  blanco de lo que flota y, el texto, sobre el papel hundido del hover y las
 *  teclas. Son los números de la tabla de § 7.2. */
const papel = (tinta: string, fondos: string[], minimo: number, por: string): Par[] =>
  fondos.map((fondo) => ({ tinta, fondo, minimo, por: `papel · ${por}`, ambito: 'papel' as const }));
const HOJA_Y_BLANCO = ['--canvas-2d', '--surface-overlay-bg'];
const Y_HUNDIDO = [...HOJA_Y_BLANCO, '--bg-elevated'];

export const PARES: Par[] = [
  { tinta: '--text-primary', fondo: '--bg-surface', minimo: 4.5, por: 'texto principal' },
  { tinta: '--text-primary', fondo: '--bg-elevated', minimo: 4.5, por: 'texto principal sobre un botón' },
  { tinta: '--text-secondary', fondo: '--bg-surface', minimo: 4.5, por: 'rótulos' },
  { tinta: '--text-secondary', fondo: '--bg-elevated', minimo: 4.5, por: 'rótulos sobre un botón' },
  { tinta: '--text-tertiary', fondo: '--bg-surface', minimo: 4.5, por: 'atajos, meta, placeholder' },
  { tinta: '--text-tertiary', fondo: '--bg-elevated', minimo: 4.5, por: 'kbd sobre elevated' },
  { tinta: '--text-disabled', fondo: '--bg-surface', minimo: 2.5, por: 'solo deshabilitado' },
  { tinta: '--accent-ink', fondo: '--bg-surface', minimo: 4.5, por: 'el acento escrito' },
  { tinta: '--accent-ink', fondo: '--bg-elevated', minimo: 4.5, por: 'el acento escrito sobre un botón' },
  { tinta: '--on-accent', fondo: '--accent-fuerte', minimo: 4.5, por: 'texto blanco sobre relleno de acento' },
  { tinta: '--on-accent', fondo: '--destructive-fuerte', minimo: 4.5, por: 'texto blanco sobre Eliminar' },
  { tinta: '--on-accent', fondo: '--accent-fuerte-hover', minimo: 4.5, por: 'texto blanco sobre el relleno al pasar el mouse' },
  { tinta: '--on-accent', fondo: '--destructive-fuerte-hover', minimo: 4.5, por: 'texto blanco sobre Eliminar al pasar el mouse' },
  { tinta: '--accent', fondo: '--bg-surface', minimo: 3, por: 'borde/relleno del dock activo' },
  { tinta: '--accent', fondo: '--canvas-2d', minimo: 3, por: 'línea de selección sobre el crema' },
  { tinta: '--accent', fondo: '--piece-fill-2d', minimo: 3, por: 'línea de selección sobre la pieza' },
  { tinta: '--accent-fuerte', fondo: '--canvas-2d', minimo: 3, por: 'chip de cota sobre el crema' },
  { tinta: '--ai', fondo: '--bg-surface', minimo: 4.5, por: '«lo hizo la IA»' },
  { tinta: '--success', fondo: '--bg-surface', minimo: 4.5, por: 'semántico' },
  { tinta: '--warning', fondo: '--bg-surface', minimo: 4.5, por: 'semántico' },
  { tinta: '--destructive', fondo: '--bg-surface', minimo: 4.5, por: 'texto destructivo' },
  { tinta: '--border', fondo: '--bg-surface', minimo: 1.3, por: 'un borde igual a su superficie es invisible' },
  { tinta: '--ink-hint', fondo: '--canvas-2d', minimo: 4.5, por: 'pista sobre el papel' },
  { tinta: '--ink-hint', fondo: '--piece-fill-2d', minimo: 4.5, por: 'pista sobre la pieza' },
  { tinta: '--ink-on-light', fondo: '--canvas-2d', minimo: 4.5, por: 'línea de corte y rótulos' },
  { tinta: '--ink-on-light-2', fondo: '--canvas-2d', minimo: 3, por: 'puntos del contorno en reposo' },
  { tinta: '--grid-2d', fondo: '--canvas-2d', minimo: 1.4, por: 'la cuadrícula se ve siempre sobre el papel' },
  { tinta: '--piece-fill-2d', fondo: '--canvas-2d', minimo: 1.09, por: 'la pieza blanca se separa del papel' },
  { tinta: '--cota-ink-2d', fondo: '--cota-bg-2d', minimo: 4.5, por: 'el número de la cota' },
  { tinta: '--cota-line-2d', fondo: '--canvas-2d', minimo: 3, por: 'la línea de cota' },
  { tinta: '--cota-edit-ink-2d', fondo: '--cota-edit-bg-2d', minimo: 4.5, por: 'la cota en edición' },
  ...papel('--text-primary', Y_HUNDIDO, 4.5, 'texto principal'),
  ...papel('--text-secondary', Y_HUNDIDO, 4.5, 'rótulos'),
  ...papel('--text-tertiary', Y_HUNDIDO, 4.5, 'atajos, placeholder, lo inactivo'),
  ...papel('--text-disabled', HOJA_Y_BLANCO, 2.5, 'solo deshabilitado'),
  ...papel('--border', HOJA_Y_BLANCO, 3, 'el borde de un campo'),
  ...papel('--accent-ink', HOJA_Y_BLANCO, 4.5, 'el acento escrito'),
  ...papel('--ai', HOJA_Y_BLANCO, 4.5, '«lo hizo la IA»'),
  ...papel('--success', HOJA_Y_BLANCO, 4.5, 'semántico'),
  ...papel('--warning', HOJA_Y_BLANCO, 4.5, 'semántico'),
  ...papel('--destructive', HOJA_Y_BLANCO, 4.5, 'texto destructivo'),
  ...papel('--destructive-hover', HOJA_Y_BLANCO, 4.5, 'texto destructivo al pasar el mouse'),
];

export function verificarContraste(css: string): Resultado[] {
  return PARES.map((p) => {
    const fuente = p.ambito ? cssDelAmbito(css, p.ambito) : css;
    const ratio = contrastRatio(tokenColor(fuente, p.tinta).rgb, tokenColor(fuente, p.fondo).rgb);
    return { ...p, ratio, ok: ratio >= p.minimo };
  });
}
```

`scripts/contraste-tokens.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verificarContraste } from '../src/styles/contrasteDeTokens';
import { cssDelAmbito, resolveToken, tokenColor, toHex } from '../src/styles/colorMath';

const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const resultados = verificarContraste(css);
console.log('\n  tinta                            fondo                    hex tinta  ratio   piso  ');
for (const r of resultados) {
  const hex = toHex(tokenColor(r.ambito ? cssDelAmbito(css, r.ambito) : css, r.tinta).rgb);
  const tinta = (r.ambito ? `[${r.ambito}] ` : '') + r.tinta;
  console.log(`  ${tinta.padEnd(32)} ${r.fondo.padEnd(24)} ${hex}    ${r.ratio.toFixed(2).padStart(5)}   ${String(r.minimo).padStart(4)}  ${r.ok ? '' : '✗ ' + r.por}`);
}
const fallos = resultados.filter((r) => !r.ok);
console.log(fallos.length ? `\n  ✗ ${fallos.length} par(es) por debajo del piso.\n` : '\n  ✓ todos los pares cumplen.\n');
// Recordatorio para quien cambie un token: el hex del comentario sale de aquí.
console.log(`  --accent resuelve a ${resolveToken(css, '--accent')} = ${toHex(tokenColor(css, '--accent').rgb)}`);
process.exit(fallos.length ? 1 : 0);
```

Run: `npx vitest run src/styles/__tests__/contrasteDeTokens.test.ts`
Expected: FAIL — `Error: no hay ámbito "papel" en el CSS` al recoger los casos. Es lo que tiene que pasar: un par del ámbito no cae en silencio a los valores del marco.

- [ ] **Step 5: El bloque, en `tokens.css`**

En `src/styles/tokens.css`, sustituir

```css
  /* La línea de pelo: única separación de lo que flota (spec § 4.4). Los
   * separadores de menú NO la copian: usan --border como fondo de 1 px. */
  --hairline: 1px solid rgba(255, 255, 255, 0.07);
```

por

```css
  /* El fondo de un campo (spec 2026-10-02 § 7.2): en el marco, el elevado de
   * siempre; dentro del ámbito de papel, blanco. */
  --field-bg: var(--bg-elevated);
  /* La línea de pelo del marco. Dentro del ámbito de papel es del color de
   * --border-subtle, y es también lo que separa dentro de lo que flota: ahí
   * --border es el borde de un campo, a 3:1, y de separador pesa como uno. */
  --hairline: 1px solid rgba(255, 255, 255, 0.07);
```

En `src/styles/tokens.css`, sustituir

```css
  /* Tinta de texto instructivo dibujado SOBRE el papel (pistas al pie del
   * lienzo). NO usar --text-* aquí: esos son la tinta del cromo OSCURO y sobre
   * el crema quedan invisibles (1.05:1 medido el 2026-08-14). Éste da 5,32:1
   * sobre --canvas-2d y 5,85:1 sobre --piece-fill-2d. Lo verifica
   * HintText.legibilidad.test.tsx. */
```

por

```css
  /* Tinta de texto instructivo dibujado SOBRE el papel (pistas al pie del
   * lienzo). NO usar --text-* aquí todavía: la hoja no lleva el ámbito de
   * papel hasta P2, y fuera de él --text-* es la tinta del marco, que sobre el
   * papel queda invisible (1.05:1 medido el 2026-08-14). Éste da 5,32:1
   * sobre --canvas-2d y 5,85:1 sobre --piece-fill-2d. Lo verifica
   * HintText.legibilidad.test.tsx. */
```

En `src/styles/tokens.css`, sustituir

```css
  /* ── Materiales de superficie ─────────────────────────────────────────
   * Ley de materiales del contrato (enmendada el 26-09, spec § 4.4 y § 6).
   * Dos ROLES, un solo material, distinguidos por la sombra:
   *   chrome  → acoplado a una canaleta; opaco; SIN sombra (una sombra de
   *             32 px bajo un dock acoplado era la mancha oscura a su derecha
   *             sobre el crema).
   *   overlay → flota de verdad y se va; casi opaco, línea de pelo, sombra
   *             corta en dos capas, SIN blur: con un fondo al 92 % el blur solo
   *             desenfocaba el 8 % restante y creaba los contextos de
   *             apilamiento que recortaron ConnectionModal (contrato § 2).
   * Más la familia de tinta: `ink-*`, lo que se dibuja SOBRE el papel. */
```

por

```css
  /* ── Materiales de superficie ─────────────────────────────────────────
   * Ley de materiales del contrato, enmendada el 2026-10-02 (spec «la
   * interfaz en papel» § 7.1): vuelven a ser DOS materiales.
   *   chrome  → el marco. Acoplado a un borde; opaco; SIN sombra (una sombra
   *             de 32 px bajo un dock acoplado era la mancha oscura a su
   *             derecha sobre el papel).
   *   overlay → lo que flota y se va: línea de pelo, sombra corta en dos
   *             capas, SIN blur (con un fondo al 92 % el blur solo desenfocaba
   *             el 8 % restante y creaba los contextos de apilamiento que
   *             recortaron ConnectionModal, contrato § 2). Sobre la hoja es
   *             PAPEL: blanco, y lo pone el ámbito de papel de más abajo.
   * Los valores de overlay de :root son el oscuro de cromo callado. Desde P1b
   * los leen solo la barra de IA, la tira y la fila (hasta P2), los paneles
   * (hasta P4, que los pasa a chrome a ras) y el cromo del 3D (hasta P5).
   * Más la familia de tinta: `ink-*`, lo que se dibuja SOBRE el papel. */
```

En `src/styles/tokens.css`, sustituir

```css
  /* Diagnóstico de desarrollo (SolverMetrics): solo con import.meta.env.DEV. */
  --z-debug: 1300;
}
```

por

```css
  /* Diagnóstico de desarrollo (SolverMetrics): solo con import.meta.env.DEV. */
  --z-debug: 1300;
}

/* ── El ámbito de papel (spec 2026-10-02 «la interfaz en papel» § 7.2) ─────
 * Lo lleva, con data-material="papel", la raíz de cada cosa que flota sobre la
 * hoja: menús, avisos, tooltips, modales y la barrita de la pieza. Redefine,
 * para lo que está dentro, los nombres que usa el marco: un componente
 * escribe --text-primary y recibe tinta clara en el marco y tinta oscura
 * sobre el papel. No sabe dónde está.
 *
 * Ratios, en este orden: sobre la hoja · sobre el blanco de lo que flota ·
 * sobre el papel hundido. Los fija contrasteDeTokens.ts.
 *
 * Dos cosas que no se ven y muerden:
 *  1. CSS resuelve var() donde se DECLARA. Un alias de :root
 *     (--text-muted: var(--text-tertiary)) baja ya resuelto con el valor del
 *     marco: 3,35:1 sobre blanco. Todo alias que lea un nombre de aquí se
 *     vuelve a declarar aquí, al final del bloque. Lo vigila
 *     ambito-de-papel.test.ts.
 *  2. color se hereda ya calculado: sin la línea color de abajo, un portal
 *     colgado de body heredaría la tinta clara del marco.
 *
 * La hoja y sus márgenes lo ganan en P2, el escenario 3D en P5: hasta entonces
 * llevan encima el dock, la tira, la fila y el cromo del 3D, que siguen
 * oscuros, y con el ámbito su tinta se volvería oscura sobre fondo oscuro. */
[data-material="papel"] {
  color: var(--text-primary);

  --text-primary: oklch(0.27 0.010 80);     /* #292621 · 13,72 · 15,07 · 11,87 */
  --text-secondary: oklch(0.45 0.012 80);   /* #59554e · 6,74 · 7,41 · 5,84 · rótulos */
  --text-tertiary: oklch(0.50 0.012 80);    /* #67635c · 5,44 · 5,97 · 4,71 · atajos, placeholder */
  --text-disabled: oklch(0.66 0.010 80);    /* #95928b · 2,83 · 3,11 · solo deshabilitado */
  --bg-elevated: oklch(0.92 0.022 91);      /* #eae4d4 · papel hundido: hover, teclas */
  --field-bg: #ffffff;
  --border: oklch(0.62 0.012 80);           /* #8a857e · el borde de un campo: 3,33 · 3,66 */
  --border-subtle: rgba(40, 36, 30, 0.14);  /* la línea de pelo y los separadores */
  --hairline: 1px solid var(--border-subtle);
  --accent-ink: oklch(0.50 0.15 248);       /* #0066b3 · 5,38 · 5,91 */
  --ai: oklch(0.50 0.16 295);               /* #6c4ab3 · 5,85 · 6,43 */
  --success: oklch(0.50 0.13 150);          /* #137738 · 5,13 · 5,64 */
  --warning: oklch(0.52 0.12 70);           /* #945a00 · 5,14 · 5,64 */
  --destructive: oklch(0.52 0.18 25);       /* #ba2b2e · 5,50 · 6,05 */
  --destructive-hover: oklch(0.46 0.18 25); /* #a50d1c · 7,15 · 7,85 */

  /* Lo que flota es papel que se despega de la hoja (§ 7.1). */
  --surface-overlay-bg: #ffffff;
  --surface-overlay-shadow: 0 1px 2px rgba(40, 36, 30, 0.10), 0 8px 24px rgba(40, 36, 30, 0.12);
  --scrim: rgb(41 38 33 / 32%);

  /* Los alias de :root que leen un nombre de arriba (punto 1). */
  --text-muted: var(--text-tertiary);
  --bg-secondary: var(--bg-elevated);
  --color-error: var(--destructive);
  --color-warning: var(--warning);
  --color-success: var(--success);
  --surface-chrome-border: 1px solid var(--border);
  --surface-overlay-border: var(--hairline);
  --surface-overlay-bg-recessed: var(--surface-overlay-bg);
  --surface-overlay-shadow-sheet: var(--surface-overlay-shadow);
}
```

- [ ] **Step 6: Correr los tests del ámbito y la tabla**

Run: `npx vitest run src/styles && npm run lint:contraste && node scripts/ui-contract-lint.mjs`

Expected: PASS, 6 archivos y 236 tests: `ambito-de-papel` 23 de 23, `colorMath` 14, `contrasteDeTokens` 56 pares (31 de antes y 25 del ámbito). `lint:contraste` imprime las 25 filas `[papel]`, la más justa `[papel] --text-tertiary` sobre `--bg-elevated` en 4.71, y termina en «✓ todos los pares cumplen.». El trinquete de UI, «ningún contador subió» (R2 en 0: `--field-bg` tiene definición; R4 en 1).

- [ ] **Step 7: La enmienda del contrato, y la nota en la spec**

En `.claude/skills/contrato-de-interfaz/SKILL.md`, sustituir

```markdown
2. **¿Es una superficie que flota sobre el lienzo?** → usa un material entero
   (§2). No inventes el tuyo.
```

por

```markdown
2. **¿Es una superficie que flota sobre el lienzo?** → usa un material entero
   (§2), y su raíz lleva `data-material="papel"`. No inventes el tuyo.
```

En `.claude/skills/contrato-de-interfaz/SKILL.md`, sustituir

```markdown
| Material | Cuándo | Tokens |
|---|---|---|
| **`chrome`** | acoplado a una canaleta; opaco; **sin sombra** | `--surface-chrome-bg`, `-border`, `-radius`, `-shadow` (= none) |
| **`overlay`** | flota de verdad sobre el documento y se va; casi opaco (0,96), línea de pelo, sombra corta en dos capas; **sin blur** | `--surface-overlay-bg`, `-border` (= `--hairline`), `-radius`, `-shadow`, `-blur` (= none) |

> **Enmienda 2026-09-26 (cromo callado, spec 2026-09-24 § 4.4):** los dos
> roles siguen existiendo y se usan enteros, pero están hechos del MISMO
> material y solo los distingue la sombra. El blur se retiró: con un fondo al
> 92 % solo desenfocaba el 8 % que se transparentaba, y a cambio creaba los
> contextos de apilamiento que recortaron `ConnectionModal` (párrafo de abajo).
> `--surface-overlay-blur` sigue existiendo como token y vale `none`, para que
> nadie lo reponga a mano. Se dice aquí para que no parezca fusión por descuido.

Más una familia de **tinta**, que no es superficie: `--ink-*` es lo que se
dibuja **sobre el papel** del lienzo 2D.

> **La trampa que ya nos costó una vez:** los `--text-*` son la tinta del cromo
> **oscuro**. Aplicados sobre el crema del lienzo dan 1.05:1 de contraste — o
> sea, invisibles. Si tu texto va dentro del `<svg>` del lienzo, usa `--ink-*`.
```

por

```markdown
| Material | Qué es | Tokens |
|---|---|---|
| **`chrome`**, el marco | la barra superior y los paneles: atracado a un borde, opaco, **sin sombra** | `--surface-chrome-bg`, `-border`, `-radius`, `-shadow` (= none) |
| **`overlay`**, lo que flota | menús, avisos, tooltips, modales y la barrita de la pieza: flota sobre la hoja y se va. **Es papel:** blanco, línea de pelo, sombra corta en dos capas, **sin blur** | `--surface-overlay-bg`, `-border` (= `--hairline`), `-radius`, `-shadow`, `-blur` (= none) |

> **Enmienda 2026-10-02 (spec «la interfaz en papel» § 7.1, § 7.2 y § 10):**
> vuelven a ser dos materiales distintos, el marco oscuro y lo que flota en
> claro. Deroga la del 26-09 («un solo material, solo los distingue la
> sombra»). El blur sigue fuera: con un fondo al 92 % solo desenfocaba el 8 %
> que se transparentaba, y creaba los contextos de apilamiento que recortaron
> `ConnectionModal` (párrafo de abajo). `--surface-overlay-blur` vale `none`.

**El ámbito de papel.** Lo que flota se vuelve papel con un atributo en su
raíz: `data-material="papel"`. El bloque de `tokens.css` con ese selector
redefine, para lo que está dentro, los mismos nombres que usa el marco: un
componente escribe `--text-primary`, `--border` o `--surface-overlay-bg` y
recibe tinta clara y fondo oscuro en el marco, tinta oscura y fondo blanco
sobre el papel. No sabe dónde está. Cinco reglas:

- **Todo portal nace papel.** Un portal cuelga de `<body>` y hereda la tinta
  clara ya calculada ahí: su raíz lleva el atributo. Lo vigila
  `tests/repo/lo-que-flota-es-papel.test.ts`, que además pide la marca,
  archivo por archivo, en cada cosa que flota.
- **Dentro del papel no hay `--bg-surface`, `--bg-base` ni `--bg-deeper`** (ni
  sus alias `--bg-primary` y `--panel-bg`): el ámbito no los redefine, y un
  campo pintado así queda negro con tinta negra encima. El trinquete de
  contraste no lo ve, porque el valor de un campo no es un nodo de texto. Un
  campo usa `--field-bg`; un botón secundario, `transparent` con
  `1px solid var(--border)`; el hover y las teclas, `--bg-elevated` (papel
  hundido).
- **Lo que separa es línea de pelo** (`--border-subtle`, o `--hairline` si es
  un borde). Dentro del papel, `--border` es el borde de un campo, a 3:1.
- **Un alias de `:root` se resuelve en `:root`.** Si un token nuevo lee un
  nombre que el ámbito redefine (`--text-muted: var(--text-tertiary)`), el
  ámbito lo vuelve a declarar; si no, baja con el valor del marco. Lo vigila
  `src/styles/__tests__/ambito-de-papel.test.ts`.
- **Hasta su fase siguen con el overlay oscuro de `:root`:** la barra de IA, la
  tira y la fila (P2), los paneles (P4, que los pasa a `chrome` a ras) y el
  cromo del 3D (P5). La hoja gana el ámbito en P2 y el escenario en P5.

Más una familia de **tinta**, que no es superficie: `--ink-*` es lo que se
dibuja **sobre el papel** del lienzo 2D.

> **La trampa que ya nos costó una vez, a medio cerrar:** los `--text-*`
> cambian con el material. Dentro de `data-material="papel"` son tinta
> oscura; fuera, la del marco. La hoja del lienzo todavía no lleva el ámbito
> (lo gana en P2): ahí un `--text-*` da 1,05:1, invisible. Lo que se dibuja
> del patrón, dentro del `<svg>`, va con `--ink-*`.
```

En `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md`, sustituir

```markdown
usa `--text-primary` y recibe tinta clara en el marco y tinta oscura sobre el papel. Sigue habiendo
un solo archivo de tokens (R4 = 1).
```

por

```markdown
usa `--text-primary` y recibe tinta clara en el marco y tinta oscura sobre el papel. Sigue habiendo
un solo archivo de tokens (R4 = 1).

**Cuándo lo lleva cada cosa** (nota del plan de P1b, 2026-10-03). En P1b, solo la raíz de lo que
flota. La hoja y sus márgenes lo ganan en P2, y el escenario en P5: hasta entonces llevan encima el
dock, la tira, la fila y el cromo del 3D, que siguen oscuros, y con el ámbito su tinta se volvería
oscura sobre fondo oscuro. Los valores de lo que flota (§ 7.1) viven en el bloque del ámbito;
`:root` conserva el overlay oscuro para lo que todavía no ha pasado a papel. Así, una superficie
que olvide el atributo se queda oscura y legible, no blanca con tinta clara.
```

- [ ] **Step 8: Commit**

```bash
git add src/styles/__tests__/ambito-de-papel.test.ts src/styles/__tests__/colorMath.test.ts src/styles/colorMath.ts src/styles/contrasteDeTokens.ts scripts/contraste-tokens.ts src/styles/tokens.css .claude/skills/contrato-de-interfaz/SKILL.md docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md
git commit -m "feat(ui): el ámbito de papel — lo que flota puede ser papel; el contrato lo dice"
```

---

### Task 3: Los menús, en papel

**Files:**
- Create: `tests/repo/lo-que-flota-es-papel.test.ts`
- Modify: `src/components/shell/LogoMenu.tsx:442-443`, `src/components/PatternEditor/ContextMenu.tsx:188`, `src/components/Viewport3D/ContextMenu3D.tsx:267-268`, `src/components/shared/SubMenu.tsx:77`, `src/components/shell/DockToolPicker.tsx:21`, `src/components/LayerPanel/LayerPanel.tsx:397-398`, `src/components/LayerPanel/LayerColorPicker.tsx:37`, `src/components/Viewport3D/SurfaceModePill.tsx:78`
- Modify: `src/styles/floating.css:47, 79-82, 94-97, 210-212, 254-256`, `src/components/shared/SubMenu.css:39`, `src/components/shell/Dock.css` (`.dock-picker__reset`)
- Modify: `tests/e2e/contraste-baseline.json` (lo escribe la corrida con `CONTRASTE_UPDATE=1`)

**Interfaces:**
- Consumes: el selector `[data-material="papel"]` de la Task 2.
- Produces: `tests/repo/lo-que-flota-es-papel.test.ts`, con `RAICES: Array<[string, number]>` y `PINTA: Array<[string, string[] | '*']>`, que las Tasks 4 a 6 alargan; y un último `describe` cuyas tres líneas finales son el ancla donde la Task 4 añade el suyo.

- [ ] **Step 1: Escribir el test que falla**

`tests/repo/lo-que-flota-es-papel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lo que flota es papel (spec 2026-10-02 «la interfaz en papel» § 6.3, § 7.1,
 * § 7.2 y la fila P1b de § 11): los menús, los avisos, los tooltips, los
 * modales y la barrita de la pieza. Archivo por archivo, como
 * superficies-declaradas.test.ts:
 *
 *  1. su raíz lleva data-material="papel", que vuelve blanco el fondo y
 *     oscura la tinta de todo lo que hay dentro;
 *  2. no pinta con un fondo que solo existe en el marco: el ámbito no
 *     redefine --bg-surface, --bg-base ni --bg-deeper, y un campo pintado así
 *     dentro de un modal blanco queda negro con tinta negra encima. El
 *     trinquete de contraste no lo ve: el valor de un campo no es un nodo de
 *     texto;
 *  3. no escribe colores a mano: con dos modos (P7) un color fijo queda mal en
 *     uno de los dos (§ 11);
 *  4. no escribe con --accent: sobre blanco da 3,95:1; la tinta del acento es
 *     --accent-ink.
 *
 * Fuera a propósito: la barra de IA, la tira, la fila y el dock (pasan en P2),
 * el cromo del 3D (P5) y los paneles, que son marco.
 */
const lee = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const veces = (texto: string, aguja: string) => texto.split(aguja).length - 1;
const MARCA = 'data-material="papel"';

/** [componente, cuántas raíces de lo que flota marca] */
const RAICES: Array<[string, number]> = [
  // Menús
  ['src/components/shell/LogoMenu.tsx', 1],
  ['src/components/PatternEditor/ContextMenu.tsx', 1],
  ['src/components/Viewport3D/ContextMenu3D.tsx', 1],
  ['src/components/shared/SubMenu.tsx', 1],
  ['src/components/shell/DockToolPicker.tsx', 1],
  ['src/components/LayerPanel/LayerPanel.tsx', 1],
  ['src/components/LayerPanel/LayerColorPicker.tsx', 1],
  ['src/components/Viewport3D/SurfaceModePill.tsx', 1],
];

/**
 * Dónde se pinta lo que flota. `'*'`: el archivo entero. Si no, las reglas
 * cuyo selector empieza por uno de esos prefijos, porque la misma hoja pinta
 * también cromo del marco (el dock, la píldora del 3D). Los ocho colores de
 * LayerColorPicker.tsx no están: son los que la usuaria escoge para una capa,
 * un dato y no la piel.
 */
const PINTA: Array<[string, string[] | '*']> = [
  // Menús
  ['src/styles/floating.css', ['.logo-menu', '.context-menu']],
  ['src/components/shared/SubMenu.css', '*'],
  ['src/components/shell/Dock.css', ['.dock-picker']],
  ['src/components/LayerPanel/LayerPanel.css', ['.layer-context-menu', '.layer-color-popover', '.layer-color-swatch']],
  ['src/components/Viewport3D/SurfaceModePill.css', ['.surface-pill__flyout', '.surface-pill__option']],
];

const FONDO_DEL_MARCO = /var\(--(bg-surface|bg-base|bg-deeper|bg-primary|panel-bg|surface-chrome-bg)\)/;
const COLOR_A_MANO = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/;
const ACENTO_COMO_TINTA = /(?<![-\w])color:\s*['"]?var\(--accent\)/;

/** Las reglas de lo que flota en una hoja; en un componente o con '*', sus líneas. */
function loQuePinta(ruta: string, prefijos: string[] | '*'): string[] {
  const texto = sinComentarios(lee(ruta));
  if (prefijos === '*' || !ruta.endsWith('.css')) return texto.split('\n');
  return [...texto.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => m[1].split(',').some((s) => prefijos.some((p) => s.trim().startsWith(p))))
    .map((m) => `${m[1].trim()} { ${m[2].replace(/\s+/g, ' ').trim()} }`);
}

describe('lo que flota es papel', () => {
  it.each(RAICES)('%s marca %i raíz con data-material="papel"', (ruta, n) => {
    expect(veces(lee(ruta), MARCA)).toBe(n);
  });

  it.each(PINTA)('%s no pinta lo que flota con un fondo del marco', (ruta, prefijos) => {
    expect(loQuePinta(ruta, prefijos).filter((r) => FONDO_DEL_MARCO.test(r))).toEqual([]);
  });

  it.each(PINTA)('%s no escribe colores a mano en lo que flota', (ruta, prefijos) => {
    expect(loQuePinta(ruta, prefijos).filter((r) => COLOR_A_MANO.test(r))).toEqual([]);
  });

  it.each(PINTA)('%s no escribe con --accent', (ruta, prefijos) => {
    expect(loQuePinta(ruta, prefijos).filter((r) => ACENTO_COMO_TINTA.test(r))).toEqual([]);
  });
});

describe('dentro de lo que flota, lo que separa es línea de pelo', () => {
  // En el ámbito de papel, --border es el borde de un campo (#8a857e, 3,66:1
  // sobre blanco): de separador, en un menú blanco, pesa como un campo.
  const regla = (ruta: string, selector: string) =>
    [...sinComentarios(lee(ruta)).matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .find((m) => m[1].split(',').map((s) => s.trim()).includes(selector))?.[2].replace(/\s+/g, ' ') ?? '';
  it.each([
    ['src/styles/floating.css', '.logo-menu__separator', 'background: var(--border-subtle)'],
    ['src/styles/floating.css', '.context-menu__separator', 'background: var(--border-subtle)'],
    ['src/styles/floating.css', '.context-menu__header', 'border-bottom: var(--hairline)'],
    ['src/components/shared/SubMenu.css', '.submenu-separator', 'background: var(--border-subtle)'],
    ['src/components/shell/Dock.css', '.dock-picker__reset', 'border-top: var(--hairline)'],
  ])('%s: %s lleva %s', (ruta, selector, declaracion) => {
    expect(regla(ruta, selector)).toContain(declaracion);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run tests/repo/lo-que-flota-es-papel.test.ts`

Expected: FAIL, 13 de 28: las ocho raíces (`expected 0 to be 1`) y las cinco líneas que separan. Las quince de `PINTA` pasan: los menús ya estaban hechos de tokens, y desde aquí quedan vigilados.

- [ ] **Step 3: La marca en cada raíz**

En `src/components/shell/LogoMenu.tsx`, sustituir

```tsx
          className="logo-menu"
          data-superficie="menu"
```

por

```tsx
          className="logo-menu"
          data-superficie="menu"
          data-material="papel"
```

En `src/components/PatternEditor/ContextMenu.tsx`, sustituir

```tsx
    <div ref={ref} className="context-menu" data-superficie="menu" style={{ left: pos.x, top: pos.y }}>
```

por

```tsx
    <div ref={ref} className="context-menu" data-superficie="menu" data-material="papel" style={{ left: pos.x, top: pos.y }}>
```

En `src/components/Viewport3D/ContextMenu3D.tsx`, sustituir

```tsx
      className="context-menu context-menu--scroll"
      data-superficie="menu"
```

por

```tsx
      className="context-menu context-menu--scroll"
      data-superficie="menu"
      data-material="papel"
```

En `src/components/shared/SubMenu.tsx`, sustituir

```tsx
          className="submenu-panel"
```

por

```tsx
          className="submenu-panel"
          data-material="papel"
```

En `src/components/shell/DockToolPicker.tsx`, sustituir

```tsx
data-superficie="menu">
```

por

```tsx
data-superficie="menu" data-material="papel">
```

En `src/components/LayerPanel/LayerPanel.tsx`, sustituir

```tsx
          className="layer-context-menu"
          data-superficie="menu"
```

por

```tsx
          className="layer-context-menu"
          data-superficie="menu"
          data-material="papel"
```

En `src/components/LayerPanel/LayerColorPicker.tsx`, sustituir

```tsx
        <div className="layer-color-popover">
```

por

```tsx
        <div className="layer-color-popover" data-material="papel">
```

En `src/components/Viewport3D/SurfaceModePill.tsx`, sustituir

```tsx
aria-label="Modo de superficie" data-superficie="menu">
```

por

```tsx
aria-label="Modo de superficie" data-superficie="menu" data-material="papel">
```

- [ ] **Step 4: Lo que separa, de pelo, y los comentarios que mentían**

En `src/styles/floating.css`, sustituir

```css
/* ─── Logo Menu (Figma-style, same glassmorphic as floating capsule) ─── */
```

por

```css
/* ─── Logo Menu (Figma-style) ─── */
```

En `src/styles/floating.css`, sustituir

```css
  /* Same glassmorphic as the floating capsule bar */
  /* Material `overlay`. El radio era 14px a mano — un quinto radio suelto
   * que no correspondía a ningún rol. */
```

por

```css
  /* Material `overlay`, en papel: la raíz lleva data-material="papel" (spec
   * 2026-10-02 § 6.3). El radio era 14px a mano — un quinto radio suelto que
   * no correspondía a ningún rol. */
```

En `src/styles/floating.css`, sustituir

```css
.logo-menu__separator {
  height: 1px;
  background: var(--border);
```

por

```css
.logo-menu__separator {
  height: 1px;
  background: var(--border-subtle);
```

En `src/styles/floating.css`, sustituir

```css
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  margin-bottom: 2px;
```

por

```css
  color: var(--text-muted);
  border-bottom: var(--hairline);
  margin-bottom: 2px;
```

En `src/styles/floating.css`, sustituir

```css
.context-menu__separator {
  height: 1px;
  background: var(--border);
```

por

```css
.context-menu__separator {
  height: 1px;
  background: var(--border-subtle);
```

En `src/components/shared/SubMenu.css`, sustituir

```css
.submenu-separator { height: 1px; background: var(--border); margin: 4px 10px; }
```

por

```css
.submenu-separator { height: 1px; background: var(--border-subtle); margin: 4px 10px; }
```

En `src/components/shell/Dock.css`, sustituir

```css
  border-top: 1px solid var(--border);
```

por

```css
  border-top: var(--hairline);
```

- [ ] **Step 5: Correr el test y los de los menús**

Run: `npx vitest run tests/repo/lo-que-flota-es-papel.test.ts src/components/shell src/components/shared src/components/LayerPanel src/components/Viewport3D src/components/PatternEditor/__tests__ src/styles`

Expected: PASS. `lo-que-flota-es-papel`, 28 de 28.

- [ ] **Step 6: El contraste de los menús, en el navegador, y su techo nuevo**

Con `CONTRASTE_UPDATE=1` la misma corrida comprueba que ningún estado pase de su techo y baja los que bajaron:

Run: `CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts tests/e2e/1095-menu-avisa-que-hay-mas.spec.ts tests/e2e/las-siete-puertas.spec.ts --retries=0 --workers=2`

Expected: todo `passed`. En la salida del de contraste, `menú del logo`, `submenú del logo`, `menú del dock` y `menú de superficie (3D)` siguen en `0 texto(s) bajo AA`, y `menú del clic derecho` y `submenú del clic derecho` bajan de 2 y 3 a `0`. `git diff tests/e2e/contraste-baseline.json` enseña esas dos líneas y nada más. Un número mayor que su techo es un menú que quedó blanco con algo escrito en la tinta del marco: la línea de debajo nombra el selector.

- [ ] **Step 7: Commit**

```bash
git add tests/repo/lo-que-flota-es-papel.test.ts src/components/shell/LogoMenu.tsx src/components/PatternEditor/ContextMenu.tsx src/components/Viewport3D/ContextMenu3D.tsx src/components/shared/SubMenu.tsx src/components/shell/DockToolPicker.tsx src/components/LayerPanel/LayerPanel.tsx src/components/LayerPanel/LayerColorPicker.tsx src/components/Viewport3D/SurfaceModePill.tsx src/styles/floating.css src/components/shared/SubMenu.css src/components/shell/Dock.css tests/e2e/contraste-baseline.json
git commit -m "feat(ui): los menús, en papel — y lo que separa dentro de ellos, de pelo"
```

---

### Task 4: Avisos y tooltips, en papel

**Files:**
- Modify: `tests/repo/lo-que-flota-es-papel.test.ts` (tres raíces, dos hojas, un `describe`)
- Modify: `src/components/shell/ToastContainer.tsx:41`, `src/components/shell/ToastContainer.css:62-83, 104, 114-117`
- Modify: `src/components/shell/ToolTooltip.tsx:64`
- Modify: `src/components/shell/AppShell.tsx:292, 308-309`
- Modify: `src/store/copilotUISlice.ts:411`, `src/store/__tests__/copilotUISlice.test.ts`
- Modify: `scripts/ui-contract-baseline.json` (R3 565 → 560)

**Interfaces:**
- Consumes: `RAICES`, `PINTA` y el último `describe` de `tests/repo/lo-que-flota-es-papel.test.ts` (Task 3); `showUndoToast(message, undoPayload)` de `src/store/copilotUISlice.ts`.
- Produces: un `describe` nuevo al final de `lo-que-flota-es-papel.test.ts`; sus cuatro líneas finales son el ancla de la Task 5.

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/repo/lo-que-flota-es-papel.test.ts`, sustituir

```ts
  ['src/components/Viewport3D/SurfaceModePill.tsx', 1],
];
```

por

```ts
  ['src/components/Viewport3D/SurfaceModePill.tsx', 1],
  // Avisos y tooltips
  ['src/components/shell/ToastContainer.tsx', 1],
  ['src/components/shell/ToolTooltip.tsx', 1],
  ['src/components/shell/AppShell.tsx', 1],
];
```

En `tests/repo/lo-que-flota-es-papel.test.ts`, sustituir

```ts
  ['src/components/Viewport3D/SurfaceModePill.css', ['.surface-pill__flyout', '.surface-pill__option']],
];
```

por

```ts
  ['src/components/Viewport3D/SurfaceModePill.css', ['.surface-pill__flyout', '.surface-pill__option']],
  // Avisos y tooltips
  ['src/components/shell/ToastContainer.css', '*'],
  ['src/components/shell/ToolTooltip.css', '*'],
];
```

En `tests/repo/lo-que-flota-es-papel.test.ts`, sustituir

```ts
  ])('%s: %s lleva %s', (ruta, selector, declaracion) => {
    expect(regla(ruta, selector)).toContain(declaracion);
  });
});
```

por

```ts
  ])('%s: %s lleva %s', (ruta, selector, declaracion) => {
    expect(regla(ruta, selector)).toContain(declaracion);
  });
});

describe('la tarjeta de «suelta tu archivo» es un aviso, y es papel', () => {
  // El velo de arrastre (AppShell) es un tinte de acento sobre la hoja; la
  // tarjeta que dice qué pasa al soltar flota encima: material entero.
  const appShell = sinComentarios(lee('src/components/shell/AppShell.tsx'));
  it.each([
    "background: 'var(--surface-overlay-bg)'",
    "border: 'var(--surface-overlay-border)'",
    "boxShadow: 'var(--surface-overlay-shadow)'",
  ])('lleva %s', (declaracion) => {
    expect(appShell).toContain(declaracion);
  });
});
```

En `src/store/__tests__/copilotUISlice.test.ts`, sustituir

```ts
  showToast,
  dismissToast,
```

por

```ts
  showToast,
  showUndoToast,
  dismissToast,
```

En `src/store/__tests__/copilotUISlice.test.ts`, sustituir

```ts
    it('should dismiss a toast', () => {
```

por

```ts
    it('el aviso con Deshacer lo dice en español (contrato § 5)', () => {
      const state = reducer(initialState, showUndoToast('Margen de costura 8mm → 10mm', { type: 'x' }));
      expect(state.toasts[0].actionLabel).toBe('Deshacer');
    });

    it('should dismiss a toast', () => {
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `npx vitest run tests/repo/lo-que-flota-es-papel.test.ts src/store/__tests__/copilotUISlice.test.ts`

Expected: FAIL, `7 failed | 59 passed (66)`. En `lo-que-flota-es-papel`, seis: las tres raíces nuevas (`expected +0 to be 1`), `ToastContainer.css` con sus cinco `rgba(255, 255, 255, …)`, y dos de la tarjeta, el fondo y el borde (la sombra ya era la del material). En `copilotUISlice`, uno: `expected 'Undo' to be 'Deshacer'`.

- [ ] **Step 3: El aviso**

En `src/components/shell/ToastContainer.tsx`, sustituir

```tsx
    <div className="toast-container" aria-live="polite" aria-label="Notificaciones">
```

por

```tsx
    <div className="toast-container" data-material="papel" aria-live="polite" aria-label="Notificaciones">
```

En `src/components/shell/ToastContainer.css`, sustituir

```css
/* ─── Action button (e.g. restore-toast "Empezar de cero") ─── */

.toast__action {
  flex-shrink: 0;
  align-self: center;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
```

por

```css
/* ─── Action button (e.g. restore-toast "Empezar de cero") ───
 * Papel hundido con línea de pelo, y al pasar el tinte del acento, como una
 * fila de menú. Eran blancos translúcidos: sobre el aviso blanco no se veían. */

.toast__action {
  flex-shrink: 0;
  align-self: center;
  padding: 3px 10px;
  background: var(--bg-elevated);
  border: var(--hairline);
```

En `src/components/shell/ToastContainer.css`, sustituir

```css
.toast__action:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.28);
}
```

por

```css
.toast__action:hover {
  background: var(--accent-subtle);
  border-color: var(--accent-border);
}
```

En `src/components/shell/ToastContainer.css`, sustituir

```css
   * pulsa lleva --text-muted, que da 4,87:1 y ya es el par reposo/hover con
```

por

```css
   * pulsa lleva --text-muted: 5,97:1 sobre el aviso blanco (4,87 sobre el
   * oscuro de antes), y es el par reposo/hover con
```

En `src/components/shell/ToastContainer.css`, sustituir

```css
.toast__dismiss:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}
```

por

```css
.toast__dismiss:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}
```

En `src/store/copilotUISlice.ts`, sustituir

```ts
    actionLabel: 'Undo',
```

por

```ts
    actionLabel: 'Deshacer',
```

- [ ] **Step 4: La tarjeta de soltar el archivo, y el tooltip**

En `src/components/shell/AppShell.tsx`, sustituir

```tsx
            data-superficie="velo"
```

por

```tsx
            data-superficie="velo"
            data-material="papel"
```

En `src/components/shell/AppShell.tsx`, sustituir

```tsx
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
```

por

```tsx
                background: 'var(--surface-overlay-bg)',
                border: 'var(--surface-overlay-border)',
                color: 'var(--text-primary)',
```

En `src/components/shell/ToolTooltip.tsx`, sustituir

```tsx
          data-superficie="tooltip"
```

por

```tsx
          data-superficie="tooltip"
          data-material="papel"
```

- [ ] **Step 5: Correr los tests y fijar el techo nuevo de R3**

Run: `npx vitest run tests/repo src/store/__tests__/copilotUISlice.test.ts src/components/shell && node scripts/ui-contract-lint.mjs`

Expected: PASS; el trinquete de UI dice `R3 … 560 565 bajó −5`. Entonces:

Run: `node scripts/ui-contract-lint.mjs --update`
Expected: `Techo actualizado (1 regla(s) bajaron).`

- [ ] **Step 6: El contraste del aviso y del tooltip, en el navegador**

Run: `npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1`

Expected: `12 passed`. `aviso` y `tooltip`, `0 texto(s) bajo AA`. Si `aviso` da 1 con `«✕» … .toast__dismiss`, el alias `--text-muted` no se re-declaró en el ámbito: es el punto 2 del Review Focus.

- [ ] **Step 7: Commit**

```bash
git add tests/repo/lo-que-flota-es-papel.test.ts src/components/shell/ToastContainer.tsx src/components/shell/ToastContainer.css src/components/shell/ToolTooltip.tsx src/components/shell/AppShell.tsx src/store/copilotUISlice.ts src/store/__tests__/copilotUISlice.test.ts scripts/ui-contract-baseline.json
git commit -m "feat(ui): avisos y tooltips, en papel; el aviso dice «Deshacer»"
```

---

### Task 5: Los modales, en papel — y todo portal nace papel

**Files:**
- Modify: `tests/repo/lo-que-flota-es-papel.test.ts` (import, cuatro raíces, cinco hojas, el `describe` de los portales)
- Modify: `src/components/shell/ConfirmDialog.tsx:76`
- Modify: `src/components/PatternEditor/NotchPrecisionModal.tsx:67`; `src/components/PatternEditor/NotchPrecisionModal.css` (se reescribe entero)
- Modify: `src/components/PatternEditor/CalibrationModal.tsx:30`; `src/components/PatternEditor/CalibrationModal.css` (se reescribe entero)
- Modify: `src/copilot/connections/ConnectionModal.tsx:39, 46-49, 54, 58, 72, 80, 180-181, 216`
- Modify: `src/copilot/connections/DynamicProviderForm.tsx:47, 141`
- Modify: `scripts/ui-contract-baseline.json` (R3 560 → 539); `tests/e2e/contraste-baseline.json` (lo escribe la corrida con `CONTRASTE_UPDATE=1`)

**Interfaces:**
- Consumes: `RAICES`, `PINTA`, `sinComentarios`, `lee`, `veces`, `MARCA` y el `describe` de la tarjeta (Task 4) de `tests/repo/lo-que-flota-es-papel.test.ts`; `--field-bg` (Task 2).
- Produces: la regla «todo portal nace papel», que vigila también los portales que se escriban después.

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/repo/lo-que-flota-es-papel.test.ts`, sustituir

```ts
import { join } from 'node:path';
```

por

```ts
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
```

En `tests/repo/lo-que-flota-es-papel.test.ts`, sustituir

```ts
  ['src/components/shell/AppShell.tsx', 1],
];
```

por

```ts
  ['src/components/shell/AppShell.tsx', 1],
  // Modales
  ['src/components/shell/ConfirmDialog.tsx', 1],
  ['src/components/PatternEditor/NotchPrecisionModal.tsx', 1],
  ['src/components/PatternEditor/CalibrationModal.tsx', 1],
  ['src/copilot/connections/ConnectionModal.tsx', 1],
];
```

En `tests/repo/lo-que-flota-es-papel.test.ts`, sustituir

```ts
  ['src/components/shell/ToolTooltip.css', '*'],
];
```

por

```ts
  ['src/components/shell/ToolTooltip.css', '*'],
  // Modales
  ['src/components/shell/ConfirmDialog.css', '*'],
  ['src/components/PatternEditor/NotchPrecisionModal.css', '*'],
  ['src/components/PatternEditor/CalibrationModal.css', '*'],
  ['src/copilot/connections/ConnectionModal.tsx', '*'],
  ['src/copilot/connections/DynamicProviderForm.tsx', '*'],
];
```

En `tests/repo/lo-que-flota-es-papel.test.ts`, sustituir

```ts
  ])('lleva %s', (declaracion) => {
    expect(appShell).toContain(declaracion);
  });
});
```

por

```ts
  ])('lleva %s', (declaracion) => {
    expect(appShell).toContain(declaracion);
  });
});

describe('todo portal es algo que flota, y nace papel', () => {
  // Un portal cuelga de <body>, fuera del árbol del marco, y hereda la tinta
  // clara que <body> ya calculó: sin la marca, un menú blanco con letra
  // clara. Vale también para el portal que se escriba mañana.
  const componentes = execFileSync('git', ['ls-files', 'src/**/*.tsx'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !/__tests__|\.test\./.test(f));
  it('cada archivo marca al menos tantas raíces de papel como portales abre', () => {
    const sinMarca = componentes.filter((ruta) => {
      const texto = sinComentarios(lee(ruta));
      return veces(texto, 'createPortal(') > veces(texto, MARCA);
    });
    expect(sinMarca).toEqual([]);
  });
});
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `npx vitest run tests/repo/lo-que-flota-es-papel.test.ts`

Expected: FAIL, `12 failed | 48 passed (60)`. Las cuatro raíces nuevas; `NotchPrecisionModal.css` (fondo del marco: `--bg-base` y `--bg-surface`; color a mano: la sombra); `CalibrationModal.css` (18 colores a mano); `ConnectionModal.tsx` (fondo del marco: el `select` con `--bg-primary`; colores a mano: el velo y la sombra); `DynamicProviderForm.tsx` (fondo del marco: `--bg-primary`; tinta: el enlace con `--accent`); y la de los portales, con `['src/copilot/connections/ConnectionModal.tsx']`. `ConfirmDialog.css` pasa.

- [ ] **Step 3: El diálogo de confirmación**

En `src/components/shell/ConfirmDialog.tsx`, sustituir

```tsx
    <div className="confirm-scrim" onMouseDown={cerrar}>
```

por

```tsx
    <div className="confirm-scrim" data-material="papel" onMouseDown={cerrar}>
```

- [ ] **Step 4: El modal del piquete**

En `src/components/PatternEditor/NotchPrecisionModal.tsx`, sustituir

```tsx
    <div className="notch-precision-modal" role="dialog" aria-label="Colocación de piquete" data-superficie="modal">
```

por

```tsx
    <div className="notch-precision-modal" role="dialog" aria-label="Colocación de piquete" data-superficie="modal" data-material="papel">
```

`src/components/PatternEditor/NotchPrecisionModal.css` se reescribe entero:

`src/components/PatternEditor/NotchPrecisionModal.css`:

```css
/* Floating precision panel — deliberately no scrim/backdrop (review
   findings #4/#6): the canvas marker and live preview ghost must stay
   visible and the canvas interactive while the numbers are edited.
   Material de lo que flota y tinta del ámbito de papel (spec 2026-10-02
   § 6.3). Se va en P3, cuando la distancia se escriba sobre el borde. */
.notch-precision-modal {
  /* Dentro de .pattern-editor (position: relative): antes era fixed y flotaba
     sobre el visor 3D o el panel derecho, no sobre el lienzo 2D. */
  position: absolute;
  top: 28px;
  right: 12px;
  z-index: var(--z-menu);
  background: var(--surface-overlay-bg);
  border: var(--surface-overlay-border);
  border-radius: var(--surface-overlay-radius);
  box-shadow: var(--surface-overlay-shadow);
  padding: 20px;
  width: min(320px, calc(100% - 24px));
  color: var(--text-primary);
  font-size: var(--text-ui);
}

.notch-precision-modal h3 {
  margin: 0 0 12px 0;
  font-size: var(--text-heading);
  color: var(--text-primary);
}

.notch-precision-modal p {
  margin: 0 0 14px 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.notch-precision-input-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  gap: 12px;
}

.notch-precision-input-row label {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.notch-precision-input-row input[type='number'] {
  flex: 1;
  padding: 4px 8px;
  background: var(--field-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--text-input);
  min-width: 0;
  max-width: 90px;
}

.notch-precision-input-row input[type='number'].invalid {
  border-color: var(--destructive);
}

.notch-precision-hint {
  color: var(--text-tertiary);
  font-size: var(--text-xs);
  text-align: right;
  margin: 0 0 14px 0;
}

.notch-precision-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.notch-precision-actions button {
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-size: var(--text-ui);
}

.notch-precision-actions button.primary {
  background: var(--accent-fuerte);
  border-color: var(--accent-fuerte);
  color: var(--on-accent);
}

.notch-precision-actions button.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 5: El modal de calibración**

En `src/components/PatternEditor/CalibrationModal.tsx`, sustituir

```tsx
    <div className="calibration-overlay" onClick={onCancel}>
```

por

```tsx
    <div className="calibration-overlay" data-material="papel" onClick={onCancel}>
```

`src/components/PatternEditor/CalibrationModal.css` se reescribe entero:

`src/components/PatternEditor/CalibrationModal.css`:

```css
/* Calibración de una imagen de referencia: un modal, con el material de lo
 * que flota y la tinta del ámbito de papel (spec 2026-10-02 § 6.3). Hasta P1b
 * traía su gris, su borde y su azul escritos a mano: dieciocho colores que no
 * salían del sistema. */
.calibration-overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.calibration-modal {
  background: var(--surface-overlay-bg);
  border: var(--surface-overlay-border);
  border-radius: var(--surface-overlay-radius);
  box-shadow: var(--surface-overlay-shadow);
  padding: 20px;
  width: 340px;
  color: var(--text-primary);
  font-size: 13px;
}

.calibration-modal h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
  color: var(--text-primary);
}

.calibration-modal p {
  margin: 0 0 14px 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.calibration-input-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
}

.calibration-input-row label {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.calibration-input-row input[type='number'] {
  flex: 1;
  padding: 4px 8px;
  background: var(--field-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  min-width: 0;
}

.calibration-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.calibration-actions button {
  padding: 6px 16px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
}

.calibration-actions button.primary {
  background: var(--accent-fuerte);
  border-color: var(--accent-fuerte);
  color: var(--on-accent);
}

.calibration-actions button.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 6: El modal de conexión y su formulario**

En `src/copilot/connections/ConnectionModal.tsx`, sustituir

```tsx
  background: 'rgba(0, 0, 0, 0.6)',
```

por

```tsx
  background: 'var(--scrim)',
```

En `src/copilot/connections/ConnectionModal.tsx`, sustituir

```tsx
const dialogStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
```

por

```tsx
// Lo que flota es papel (spec 2026-10-02 § 6.3): el material entero, por token.
const dialogStyle: React.CSSProperties = {
  background: 'var(--surface-overlay-bg)',
  border: 'var(--surface-overlay-border)',
  borderRadius: 'var(--surface-overlay-radius)',
```

En `src/copilot/connections/ConnectionModal.tsx`, sustituir

```tsx
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
```

por

```tsx
  boxShadow: 'var(--surface-overlay-shadow)',
```

En `src/copilot/connections/ConnectionModal.tsx`, sustituir

```tsx
  borderBottom: '1px solid var(--border)',
```

por

```tsx
  borderBottom: 'var(--hairline)',
```

En `src/copilot/connections/ConnectionModal.tsx`, sustituir

```tsx
  borderTop: '1px solid var(--border)',
```

por

```tsx
  borderTop: 'var(--hairline)',
```

En `src/copilot/connections/ConnectionModal.tsx`, sustituir

```tsx
  color: 'white',
```

por

```tsx
  color: 'var(--on-accent)',
```

En `src/copilot/connections/ConnectionModal.tsx`, sustituir

```tsx
      style={overlayStyle}
      data-superficie="modal"
```

por

```tsx
      style={overlayStyle}
      data-superficie="modal"
      data-material="papel"
```

En `src/copilot/connections/ConnectionModal.tsx`, sustituir

```tsx
                  background: 'var(--bg-primary)',
```

por

```tsx
                  background: 'var(--field-bg)',
```

En `src/copilot/connections/DynamicProviderForm.tsx`, sustituir

```tsx
  background: 'var(--bg-primary)',
```

por

```tsx
  background: 'var(--field-bg)',
```

En `src/copilot/connections/DynamicProviderForm.tsx`, sustituir

```tsx
                style={{ color: 'var(--accent)' }}
```

por

```tsx
                style={{ color: 'var(--accent-ink)' }}
```

- [ ] **Step 7: Correr los tests y fijar el techo nuevo de R3**

Run: `npx vitest run tests/repo src/components/shell src/components/PatternEditor src/copilot/connections && node scripts/ui-contract-lint.mjs`

Expected: PASS; `R3 … 539 560 bajó −21`. Entonces:

Run: `node scripts/ui-contract-lint.mjs --update`
Expected: `Techo actualizado (1 regla(s) bajaron).`

- [ ] **Step 8: Los modales en el navegador, y su techo nuevo**

Run: `CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts tests/e2e/emplazamiento-modales.spec.ts tests/e2e/1099-modal-piquete-junto-a-la-pieza.spec.ts --retries=0 --workers=2`

Expected: todo `passed`. En el de contraste, `diálogo de confirmación` y `modal del piquete` en `0 texto(s) bajo AA`, y `modal de conexión` baja de 3 a `2`: se fue el enlace; quedan «Ratón (CLO3D)» y su descripción, que son de la barra de IA en modo ajustes, detrás del velo (P2). `git diff tests/e2e/contraste-baseline.json` enseña esa línea y nada más. `emplazamiento-modales` sigue viendo los dos modales sin encierro (`encerradoPor: []`): `data-material` no crea contexto de apilamiento.

- [ ] **Step 9: Commit**

```bash
git add tests/repo/lo-que-flota-es-papel.test.ts src/components/shell/ConfirmDialog.tsx src/components/PatternEditor/NotchPrecisionModal.tsx src/components/PatternEditor/NotchPrecisionModal.css src/components/PatternEditor/CalibrationModal.tsx src/components/PatternEditor/CalibrationModal.css src/copilot/connections/ConnectionModal.tsx src/copilot/connections/DynamicProviderForm.tsx scripts/ui-contract-baseline.json tests/e2e/contraste-baseline.json
git commit -m "feat(ui): los cuatro modales, en papel — y todo portal nace papel"
```

---

### Task 6: La barrita de la pieza, en papel

**Files:**
- Modify: `tests/repo/lo-que-flota-es-papel.test.ts` (una raíz, una hoja)
- Modify: `src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx:84-92`
- Modify: `src/components/PatternEditor/FloatingActionBar.tsx:66-82, 104`
- Modify: `scripts/ui-contract-baseline.json` (R3 539 → 535)

**Interfaces:**
- Consumes: `RAICES` y `PINTA` de `tests/repo/lo-que-flota-es-papel.test.ts`.
- Produces: la barrita blanca (spec § 5.5). P3 la deja en cuatro acciones; aquí solo cambia el material.

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/repo/lo-que-flota-es-papel.test.ts`, sustituir

```ts
  ['src/copilot/connections/ConnectionModal.tsx', 1],
];
```

por

```ts
  ['src/copilot/connections/ConnectionModal.tsx', 1],
  // La barrita de la pieza
  ['src/components/PatternEditor/FloatingActionBar.tsx', 1],
];
```

En `tests/repo/lo-que-flota-es-papel.test.ts`, sustituir

```ts
  ['src/copilot/connections/DynamicProviderForm.tsx', '*'],
];
```

por

```ts
  ['src/copilot/connections/DynamicProviderForm.tsx', '*'],
  // La barrita de la pieza
  ['src/components/PatternEditor/FloatingActionBar.tsx', '*'],
];
```

En `src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx`, sustituir

```tsx
describe('FloatingActionBar — superficie neutral-dark (nunca azul de selección)', () => {
  it('fondo #1a1a1a, z-index 90; NO el azul de selección #4A9EFF', () => {
    const { container } = renderBar();
    const bar = container.querySelector('.floating-action-bar') as HTMLElement;
    expect(bar.style.backgroundColor).toBe('rgb(26, 26, 26)');       // #1a1a1a
    expect(bar.style.backgroundColor).not.toBe('rgb(74, 158, 255)'); // #4A9EFF
    expect(bar.style.zIndex).toBe('90');
  });
});
```

por

```tsx
describe('FloatingActionBar — es papel que flota (spec 2026-10-02 § 5.5 y § 7.1)', () => {
  it('blanca, con línea de pelo y sombra corta: el material de lo que flota, por token; z-index 90', () => {
    const { container } = renderBar();
    const bar = container.querySelector('.floating-action-bar') as HTMLElement;
    expect(bar.getAttribute('data-material')).toBe('papel');
    const estilo = bar.getAttribute('style') ?? '';
    expect(estilo).toContain('background-color: var(--surface-overlay-bg)');
    expect(estilo).toContain('border: var(--surface-overlay-border)');
    expect(estilo).toContain('border-radius: var(--surface-overlay-radius)');
    expect(estilo).toContain('box-shadow: var(--surface-overlay-shadow)');
    expect(bar.style.zIndex).toBe('90');
  });

  it('los iconos van en la tinta del ámbito, no en un gris escrito a mano', () => {
    renderBar();
    for (const b of screen.getAllByRole('button')) {
      expect(b.getAttribute('style') ?? '').toContain('color: var(--text-primary)');
    }
  });
});
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `npx vitest run tests/repo/lo-que-flota-es-papel.test.ts src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx`

Expected: FAIL, `4 failed | 73 passed (77)`. En `lo-que-flota-es-papel`, dos: la raíz y los cuatro colores a mano (`#1a1a1a`, `#333`, `rgba(0, 0, 0, 0.4)`, `#e0e0e0`). En `FloatingActionBar`, los dos nuevos (`expected null to be 'papel'`, y el estilo de los botones sin `color: var(--text-primary)`); los otros once, en verde.

- [ ] **Step 3: La barrita**

En `src/components/PatternEditor/FloatingActionBar.tsx`, sustituir

```tsx
      className="floating-action-bar"
      data-superficie="cabina"
      style={{
        position: 'absolute',
        left,
        top,
        transform,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
      }}
```

por

```tsx
      className="floating-action-bar"
      data-superficie="cabina"
      data-material="papel"
      style={{
        position: 'absolute',
        left,
        top,
        transform,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        // Lo que flota es papel (spec 2026-10-02 § 5.5): blanca, con línea de
        // pelo y sombra corta. Era un negro escrito a mano.
        backgroundColor: 'var(--surface-overlay-bg)',
        border: 'var(--surface-overlay-border)',
        borderRadius: 'var(--surface-overlay-radius)',
        boxShadow: 'var(--surface-overlay-shadow)',
      }}
```

En `src/components/PatternEditor/FloatingActionBar.tsx`, sustituir

```tsx
                color: '#e0e0e0',
```

por

```tsx
                color: 'var(--text-primary)',
```

- [ ] **Step 4: Correr los tests y fijar el techo nuevo de R3**

Run: `npx vitest run tests/repo src/components/PatternEditor && node scripts/ui-contract-lint.mjs`

Expected: PASS; `R3 … 535 539 bajó −4`. Entonces:

Run: `node scripts/ui-contract-lint.mjs --update`
Expected: `Techo actualizado (1 regla(s) bajaron).`

- [ ] **Step 5: La barrita en el navegador**

Run: `npx playwright test tests/e2e/contraste-del-cromo.spec.ts tests/e2e/maria-200-mover-sin-residuo.spec.ts tests/e2e/cotas-no-tapan-el-transform-box.spec.ts --retries=0 --workers=2`

Expected: todo `passed`; `pieza seleccionada` sigue en `0 texto(s) bajo AA` (la barrita no tiene texto: sus iconos no los mide el trinquete, y por eso el test unitario pide `--text-primary`).

- [ ] **Step 6: Commit**

```bash
git add tests/repo/lo-que-flota-es-papel.test.ts src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx src/components/PatternEditor/FloatingActionBar.tsx scripts/ui-contract-baseline.json
git commit -m "feat(lienzo): la barrita de la pieza, en papel"
```

---

### Task 7: El menú de «+» se ve (fuera de la spec)

**Files:**
- Modify: `src/components/shell/__tests__/DockToolPicker.test.tsx` (la preparación y un test), `src/components/shell/__tests__/shortcutSurfaces.loteA.test.tsx:38-48`
- Modify: `tests/e2e/las-siete-puertas.spec.ts` (un test)
- Modify: `src/components/shell/DockToolPicker.tsx` (se reescribe entero)
- Modify: `src/components/shell/LeftDock.tsx:29-37, 84, 89-90`
- Modify: `src/components/shell/Dock.css` (`.dock-picker`)
- Modify: `scripts/ui-contract-baseline.json` (R8 24 → 23)

**Interfaces:**
- Consumes: `DockToolPicker` y la marca `data-material="papel"` de su raíz (Task 3); la regla «todo portal nace papel» (Task 5).
- Produces: `DockToolPicker` con dos props nuevas, `ancla: { left: number; bottom: number }` (px de ventana) y `raizRef?: Ref<HTMLDivElement>`, montado en `<body>`.

**Por qué está aquí.** El ensayo de este plan, el 2026-10-03, sacó la captura del menú de «+» y el menú no salía. Medido con `elementFromPoint` a 643, 768 y 1000 px de alto: los tres puntos de su caja dan el lienzo. Desde #1149 (2026-09-09) el `.dock` tiene `overflow-y: auto`, para que las herramientas quepan a 1366 × 643 (#1095). Un `overflow-y` distinto de `visible` vuelve `auto` también el `overflow-x`, y el scroll recorta todo lo que se sale de la caja del dock. El menú se abre a su derecha: existe, con su tamaño, y no se ve. El e2e de las siete puertas lo alcanzaba porque `click()` de Playwright desplaza el dock a lo ancho hasta encontrarlo. Una persona no puede hacer eso. Esas siete herramientas solo tienen esa puerta. El arreglo es un portal, el mismo patrón que `ToolTooltip` y `SubMenu`, y no toca el scroll del dock. P2 lo necesita igual: el margen de herramientas también se desplaza.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/components/shell/__tests__/DockToolPicker.test.tsx`, sustituir

```tsx
  render(<DockToolPicker catalog={DOCK_2D_CATALOG} selectedIds={selectedIds} onAdd={onAdd} onRemove={onRemove} onReset={onReset} />);
  return { onAdd, onRemove, onReset };
}

describe('DockToolPicker', () => {
```

por

```tsx
  const { container } = render(
    <DockToolPicker
      catalog={DOCK_2D_CATALOG} selectedIds={selectedIds} onAdd={onAdd} onRemove={onRemove} onReset={onReset}
      ancla={{ left: 72, bottom: 24 }}
    />,
  );
  return { onAdd, onRemove, onReset, container };
}

describe('DockToolPicker', () => {
  it('se monta en <body>, donde dice su ancla: dentro del dock, el scroll lo recortaba', () => {
    const { container } = setup(['select']);
    expect(container.querySelector('.dock-picker'), 'sigue colgando del dock').toBeNull();
    const menu = document.body.querySelector('.dock-picker') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.style.left).toBe('72px');
    expect(menu.style.bottom).toBe('24px');
  });

```

En `tests/e2e/las-siete-puertas.spec.ts`, sustituir

```ts
    expect(
      cabe || medida!.scrollea,
      `el personalizador se sale (${medida!.top}→${medida!.bottom} de ${medida!.vh}) y no scrollea`,
    ).toBe(true);
  });
});
```

por

```ts
    expect(
      cabe || medida!.scrollea,
      `el personalizador se sale (${medida!.top}→${medida!.bottom} de ${medida!.vh}) y no scrollea`,
    ).toBe(true);
  });

  test('el personalizador se ve: lo que hay en su caja es él, no el lienzo', async ({ page }) => {
    // #1149 le puso scroll al dock, y un scroll recorta todo lo que se sale de
    // su caja: el personalizador existía, con su tamaño, a la derecha del dock
    // y fuera de la vista. Los clics de este archivo lo alcanzaban porque
    // Playwright desplaza el dock a lo ancho hasta encontrarlo; una persona no.
    await abrirApp(page);
    await abrirPersonalizador(page);
    const tapados = await page.evaluate(() => {
      const r = document.querySelector('.dock-picker')!.getBoundingClientRect();
      return [[r.left + 20, r.top + 20], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 20, r.bottom - 20]]
        .filter(([x, y]) => !document.elementFromPoint(x, y)?.closest('.dock-picker')).length;
    });
    expect(tapados, 'el personalizador está recortado o tapado: de tres puntos de su caja, estos no son él').toBe(0);
  });
});
```

Y el hermano que también monta el menú (lo cazó el ensayo: buscaba el atajo dentro de su `container`, y con el portal el menú ya no está ahí). Buscar en `<body>` vale antes y después del portal.

En `src/components/shell/__tests__/shortcutSurfaces.loteA.test.tsx`, sustituir

```tsx
    const { container } = render(
      <DockToolPicker
        catalog={[LINE_TOOL]}
        selectedIds={['line']}
        onAdd={() => {}}
        onRemove={() => {}}
        onReset={() => {}}
      />,
    );

    expect(container.querySelector('.dock-picker__kbd')?.textContent).toBe('Shift+L');
```

por

```tsx
    render(
      <DockToolPicker
        catalog={[LINE_TOOL]}
        selectedIds={['line']}
        onAdd={() => {}}
        onRemove={() => {}}
        onReset={() => {}}
        ancla={{ left: 0, bottom: 0 }}
      />,
    );

    // El personalizador cuelga de <body>, no del contenedor del render.
    expect(document.body.querySelector('.dock-picker__kbd')?.textContent).toBe('Shift+L');
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `npx vitest run src/components/shell/__tests__/DockToolPicker.test.tsx`
Expected: FAIL, `1 failed | 5 passed (6)`: `sigue colgando del dock: expected <div class="dock-picker" …> to be null`. (`npx tsc -b --noEmit` también se queja, porque `ancla` todavía no existe en las props; se arregla en el paso 3.)

Run: `npx playwright test tests/e2e/las-siete-puertas.spec.ts --grep "se ve" --retries=0 --workers=1`
Expected: `1 failed`, con `Expected: 0` y `Received: 3`: los tres puntos de su caja dan el lienzo.

- [ ] **Step 3: El menú, en `<body>`**

`src/components/shell/DockToolPicker.tsx` se reescribe entero:

`src/components/shell/DockToolPicker.tsx`:

```tsx
import type { Ref } from 'react';
import { createPortal } from 'react-dom';
import type { DockToolDef } from './dock2dTools';
import { displayShortcut } from './shortcutDisplay';

interface DockToolPickerProps {
  catalog: DockToolDef[];
  /** Ids currently in the dock. */
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
  /** Dónde se abre, en px de ventana: a la derecha del «+», con su pie alineado al del botón. */
  ancla: { left: number; bottom: number };
  /** Un clic dentro no es «fuera»: el menú cuelga de <body>, no del dock. */
  raizRef?: Ref<HTMLDivElement>;
}

/**
 * The dock's customize popover — a pure checklist of the catalog. Checked = in
 * the dock. Clicking toggles membership (add when off, remove when on). The only
 * remaining selected tool is disabled (the dock can never be empty). Owns no
 * open/close lifecycle — the container (LeftDock) handles outside-click / Esc.
 *
 * Se monta en <body>. El dock tiene scroll (#1149, para que las herramientas
 * quepan a 1366×643), y un scroll recorta todo lo que se sale de su caja:
 * dentro del dock este menú existía, a su derecha, y no se veía (medido el
 * 2026-10-03 a 643, 768 y 1000 px de alto). Mismo patrón que ToolTooltip y
 * SubMenu.
 */
export default function DockToolPicker({ catalog, selectedIds, onAdd, onRemove, onReset, ancla, raizRef }: DockToolPickerProps) {
  return createPortal(
    <div
      ref={raizRef}
      className="dock-picker"
      role="group"
      aria-label="Personalizar herramientas del dock"
      data-superficie="menu"
      data-material="papel"
      style={{ left: ancla.left, bottom: ancla.bottom }}
    >
      <div className="dock-picker__title">Herramientas del dock</div>
      <ul className="dock-picker__list">
        {catalog.map((tool) => {
          const Icon = tool.icon;
          const selected = selectedIds.includes(tool.id);
          const isLast = selected && selectedIds.length === 1;
          return (
            <li key={tool.id}>
              <button
                type="button"
                className={`dock-picker__item ${selected ? 'dock-picker__item--on' : ''}`}
                onClick={() => (selected ? onRemove(tool.id) : onAdd(tool.id))}
                disabled={isLast}
                aria-pressed={selected}
                aria-label={`${selected ? 'Quitar' : 'Añadir'} ${tool.label} ${selected ? 'del' : 'al'} dock`}
              >
                <Icon size={15} />
                <span className="dock-picker__label">{tool.label}</span>
                {tool.shortcut && <kbd className="dock-picker__kbd">{displayShortcut(tool.shortcut)}</kbd>}
                <span className="dock-picker__check">{selected ? '✓' : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="dock-picker__reset" onClick={onReset}>Restablecer valores</button>
    </div>,
    document.body,
  );
}
```

En `src/components/shell/LeftDock.tsx`, sustituir

```tsx
  const [pickerOpen, setPickerOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
```

por

```tsx
  const [pickerOpen, setPickerOpen] = useState(false);
  // El personalizador cuelga de <body> (ver DockToolPicker): se abre donde
  // está el «+» al pulsarlo, y un clic dentro de él no cuenta como «fuera».
  const [ancla, setAncla] = useState({ left: 0, bottom: 0 });
  const editorRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (editorRef.current?.contains(t) || pickerRef.current?.contains(t)) return;
      setPickerOpen(false);
    };
```

En `src/components/shell/LeftDock.tsx`, sustituir

```tsx
            onClick={() => setPickerOpen((o) => !o)}
```

por

```tsx
            onClick={(e) => {
              // ponytail: el ancla se mide al abrir; si el dock se desplaza o
              // crece con el menú abierto, el menú no lo sigue.
              const r = e.currentTarget.getBoundingClientRect();
              setAncla({ left: r.right + 8, bottom: window.innerHeight - r.bottom });
              setPickerOpen((o) => !o);
            }}
```

En `src/components/shell/LeftDock.tsx`, sustituir

```tsx
            <DockToolPicker
              catalog={DOCK_2D_CATALOG}
```

por

```tsx
            <DockToolPicker
              ancla={ancla}
              raizRef={pickerRef}
              catalog={DOCK_2D_CATALOG}
```

En `src/components/shell/Dock.css`, sustituir

```css
.dock-picker {
  position: absolute;
  left: calc(100% + 8px);
  bottom: 0;
  z-index: 20;
```

por

```css
.dock-picker {
  /* Cuelga de <body> (DockToolPicker.tsx): `left` y `bottom` los pone el
     componente, a la derecha del «+» y con su pie alineado al del botón. */
  position: fixed;
  z-index: var(--z-menu);
```

- [ ] **Step 4: Correr los tests y fijar el techo nuevo de R8**

Run: `npx tsc -b --noEmit && npx vitest run src/components/shell tests/repo && node scripts/ui-contract-lint.mjs`

Expected: typecheck limpio; PASS, 42 archivos y 379 tests, con `DockToolPicker` 6 de 6 y la regla de los portales en verde (`DockToolPicker.tsx` abre un portal y marca una raíz); el trinquete de UI dice `R8 … 23 24 bajó −1`. Entonces:

Run: `node scripts/ui-contract-lint.mjs --update`
Expected: `Techo actualizado (1 regla(s) bajaron).`

- [ ] **Step 5: Las puertas, en el navegador**

Run: `npx playwright test tests/e2e/las-siete-puertas.spec.ts --retries=0 --workers=2`

Expected: todo `passed`: el nuevo, con los tres puntos dentro del menú, y los siete de las puertas, que añaden su herramienta haciendo clic en el menú. Si alguno de los siete falla porque el menú se cierra antes del clic, el `mousedown` dentro del menú se está contando como «fuera»: falta `pickerRef` en `LeftDock`.

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/__tests__/DockToolPicker.test.tsx src/components/shell/__tests__/shortcutSurfaces.loteA.test.tsx tests/e2e/las-siete-puertas.spec.ts src/components/shell/DockToolPicker.tsx src/components/shell/LeftDock.tsx src/components/shell/Dock.css scripts/ui-contract-baseline.json
git commit -m "fix(dock): el menú de «+» se ve — el scroll del dock lo recortaba desde #1149"
```

---

### Task 8: Los gates enteros, y mirarlo en la pantalla de María

**Files:**
- Modify (solo si un contador bajó): `tests/e2e/superficies-baseline.json`, `tests/e2e/reposo-baseline.json`, `tests/e2e/contraste-baseline.json`
- Create (fuera de git): capturas y `p1b-en-la-app.html` en `docs/reports/ui-audit-2026-10-02-hoy/`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la rama lista y las capturas para que Samuel decida.

- [ ] **Step 1: El gate completo**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui && npm run lint:contraste`
Expected: todo en verde: 781 archivos de test y 9357 tests (118 más que antes de P1b); `lint:ui` con «ningún contador subió», R3 en 535 y R8 en 23.

- [ ] **Step 2: El deploy entero, sin enviar**

Run: `bash scripts/deploy-prod.sh --ensayo`

Expected: árbol limpio, typecheck, lint, contrato, unitarios, smoke del WASM, la lista e2e (32 specs y 205 casos: los 201 de antes, los tres nuevos de contraste y el de las siete puertas), la home y el build, todo en verde, y sale sin enviar. Un `flaky` se mira; un `failed` se arregla, no se le sube el tiempo.

- [ ] **Step 3: Bajar los techos que hayan bajado**

En la salida del paso anterior, las líneas `superficies · …`, `reposo · …` y `contraste · …` dicen lo medido y su línea base. P1b cambia el material y no cuántas superficies aparecen: lo esperado es que nada se mueva. Si alguna medida quedó por debajo de su línea base:

```bash
SUPERFICIES_UPDATE=1 npx playwright test tests/e2e/superficies-por-accion.spec.ts --retries=0 --workers=1
REPOSO_UPDATE=1 npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts --retries=0 --workers=1
CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1
git add tests/e2e/superficies-baseline.json tests/e2e/reposo-baseline.json tests/e2e/contraste-baseline.json
git commit -m "test(ui): techos de los trinquetes tras P1b"
```

Si nada bajó, este paso no deja commit.

- [ ] **Step 4: Las capturas, a 1366 × 643 y en Split**

```bash
node --input-type=module - <<'EOF'
import { chromium } from 'playwright';
const DIR = 'docs/reports/ui-audit-2026-10-02-hoy/capturas';
const DXF = 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf';
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });

async function abrir({ conDxf = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 643 } });
  await page.addInitScript(() => { localStorage.removeItem('vina-docks'); localStorage.removeItem('vina-bar-position'); });
  await page.goto('http://localhost:5174/app/');
  await page.locator('svg.pattern-svg').waitFor({ timeout: 60000 });
  if (conDxf) {
    await page.locator('input[accept=".dxf"]').setInputFiles(DXF);
    await page.waitForFunction(() => window.__VINA_STORE__.getState().project.pieces.length === 5, undefined, { timeout: 60000 });
  } else {
    await page.evaluate(() => window.__VINA_STORE__.dispatch({ type: 'project/addPiece', payload: {
      id: 'rect', name: 'Rectángulo', position: { x: 120, y: 120 }, rotation: 0, mirrored: false, seamAllowance: 0,
      layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1, internals: [],
      outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [300, 0] }, { type: 'L', values: [300, 400] }, { type: 'L', values: [0, 400] }, { type: 'Z', values: [] }],
    } }));
  }
  await page.locator('.pill-group').getByRole('button', { name: 'Split', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll('.toast__dismiss').forEach((b) => b.click()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  return page;
}
const foto = (page, nombre) => page.screenshot({ path: `${DIR}/${nombre}.png` });
const enPantalla = (page, p) => page.evaluate(({ x, y }) => {
  const r = document.querySelector('svg.pattern-svg').getBoundingClientRect();
  const { pan2D, zoom2D } = window.__VINA_STORE__.getState().editor;
  return { x: r.x + pan2D.x + x * zoom2D, y: r.y + pan2D.y + y * zoom2D };
}, p);
/** El relleno de la pieza más grande, probado con elementFromPoint (como helpers/estados.ts). */
const centroDePieza = (page) => page.evaluate(() => {
  const cajas = [...document.querySelectorAll('[data-piece-id] .piece-fill')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
  const { el, r } = cajas[0];
  for (const [fx, fy] of [[0, 0], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [-0.25, -0.25]]) {
    const x = r.x + r.width / 2 + fx * r.width;
    const y = r.y + r.height / 2 + fy * r.height;
    if (document.elementFromPoint(x, y) === el) return { x, y };
  }
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});

let page = await abrir();
await page.locator('.logo-menu__trigger').click();
await page.locator('.logo-menu > .logo-menu__item', { hasText: 'Vista' }).hover();
await page.waitForTimeout(400);
await foto(page, 'p1b-menu-del-logo');

await page.keyboard.press('Escape');
let c = await centroDePieza(page);
await page.mouse.click(c.x, c.y, { button: 'right' });
await page.locator('.context-menu').getByRole('button', { name: /Orden/ }).first().hover();
await page.waitForTimeout(500);
await foto(page, 'p1b-clic-derecho');

await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.evaluate(() => window.__VINA_STORE__.dispatch({ type: 'copilotUI/showToast', payload: {
  type: 'undo', message: 'Margen de costura 8mm → 10mm', actionLabel: 'Deshacer', actionPayload: { type: 'editor/noop' }, duration: 0,
} }));
await page.waitForTimeout(400);
await foto(page, 'p1b-aviso');

await page.evaluate(() => document.querySelectorAll('.toast__dismiss').forEach((b) => b.click()));
await page.evaluate(() => window.__VINA_STORE__.dispatch({ type: 'copilotUI/showConfirmation', payload: {
  title: 'Eliminar la pieza', description: 'La pieza se borra con sus costuras.', consequences: ['Se pierden 2 costuras'],
  destructive: true, confirmLabel: 'Eliminar la pieza',
} }));
await page.waitForTimeout(400);
await foto(page, 'p1b-dialogo');

await page.keyboard.press('Escape');
await page.keyboard.press('z');
c = await centroDePieza(page);
await page.mouse.click(c.x, c.y);
await page.locator('.floating-action-bar').waitFor();
await page.locator('.floating-action-bar__btn').first().hover();
await page.waitForTimeout(800);
await foto(page, 'p1b-barrita');

await page.keyboard.press('Escape');
await page.mouse.move(683, 400);
await page.getByRole('button', { name: 'Personalizar herramientas del dock' }).click();
await page.waitForTimeout(400);
await foto(page, 'p1b-menu-del-dock');

await page.keyboard.press('Escape');
await page.locator('.surface-pill__trigger').click();
await page.waitForTimeout(400);
await foto(page, 'p1b-menu-del-3d');
await page.close();

page = await abrir({ conDxf: false });
await page.keyboard.press('Shift+N');
for (const y of [320, 260, 380]) {
  const s = await enPantalla(page, { x: 120, y });
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(400);
  if (await page.locator('.notch-precision-modal').isVisible()) break;
}
await foto(page, 'p1b-piquete');

await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Modo ajustes' }).click();
await page.getByRole('button', { name: /Agregar (conexión|tu primera conexión)/ }).first().click();
await page.waitForTimeout(500);
await foto(page, 'p1b-conexion');
await page.close();
await browser.close();
EOF
```

Expected: nueve archivos `p1b-*.png` en `docs/reports/ui-audit-2026-10-02-hoy/capturas/` (carpeta ignorada por git).

- [ ] **Step 5: La página para verlas**

`docs/reports/ui-audit-2026-10-02-hoy/p1b-en-la-app.html`:

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>P1b en la app</title>
<style>
  :root { --papel: #faf4e3; --tinta: #292621; --tenue: #59554e; }
  body { margin: 0; background: var(--papel); color: var(--tinta); font: 15px/1.5 Inter, system-ui, sans-serif; }
  main { max-width: 1400px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { color: var(--tenue); margin: 0 0 24px; }
  figure { margin: 0 0 40px; }
  img { width: 100%; height: auto; border: 1px solid rgba(40, 36, 30, 0.14); }
  figcaption { color: var(--tenue); margin-top: 8px; }
</style>
</head>
<body>
<main>
  <h1>Lo que flota, en claro (P1b)</h1>
  <p class="sub">La app, en la pantalla de María: 1366 × 643, en Split. El marco y la barra de IA siguen como estaban.</p>
  <figure><img src="capturas/p1b-menu-del-logo.png" alt=""><figcaption>Vina › Vista: el menú y su submenú, blancos, colgando de la barra oscura.</figcaption></figure>
  <figure><img src="capturas/p1b-clic-derecho.png" alt=""><figcaption>El clic derecho sobre una pieza, con el submenú de Orden.</figcaption></figure>
  <figure><img src="capturas/p1b-aviso.png" alt=""><figcaption>Un aviso con «Deshacer», abajo a la derecha.</figcaption></figure>
  <figure><img src="capturas/p1b-dialogo.png" alt=""><figcaption>El diálogo antes de borrar algo.</figcaption></figure>
  <figure><img src="capturas/p1b-barrita.png" alt=""><figcaption>La barrita de la pieza, blanca, con el nombre de una acción al pasar.</figcaption></figure>
  <figure><img src="capturas/p1b-menu-del-dock.png" alt=""><figcaption>«+» del dock: qué herramientas están en el margen.</figcaption></figure>
  <figure><img src="capturas/p1b-menu-del-3d.png" alt=""><figcaption>El menú del modo de superficie del 3D; su píldora y la barra de mapas siguen oscuras hasta P5.</figcaption></figure>
  <figure><img src="capturas/p1b-piquete.png" alt=""><figcaption>El modal del piquete (se va en P3).</figcaption></figure>
  <figure><img src="capturas/p1b-conexion.png" alt=""><figcaption>Agregar una conexión de IA.</figcaption></figure>
</main>
</body>
</html>
```

Abrir la página y comprobar, una por una:

1. Todo lo que flota es blanco, con una línea fina y una sombra corta; ningún menú, aviso, tooltip, modal ni la barrita sigue en negro.
2. La letra se lee en todas: oscura sobre blanco; los atajos, un gris medio; nada gris claro sobre blanco.
3. Los separadores de los menús son una línea apenas visible, no una raya gris.
4. La barra superior, los paneles, la barra de IA, la tira, la fila, el dock y el 3D están como antes.
5. Los campos de los modales (piquete, conexión) son blancos con su borde, y lo que se escribe se lee.

Si algo no se cumple, se arregla antes de seguir.

- [ ] **Step 6: Enseñárselo a Samuel, y nada más**

`git status --short` solo enseña `.maria-avatar.mjs` sin seguimiento. `git log --oneline main..HEAD` enseña el commit del plan y los de las Tasks 1 a 7 (y el de techos, si lo hubo). Se le enseña a Samuel `p1b-en-la-app.html` y se espera: nunca había visto un menú, un aviso ni un modal en claro (spec § 13). No se hace push ni PR hasta que lo diga.

---

## Notas de la ejecución (2026-10-03)

Ejecutado en línea, tarea por tarea. Cada rojo, cada verde y cada número de los «Expected» salió como está escrito. Ensayo del deploy sobre `6fd59607`: 9357 unitarios, 205 e2e sin flaky (36,3 min), la home y el build; reposo y superficies quedaron en su línea base.

**Lo que el código hace y el plan no decía.** La revisión final (un subagente Opus, de solo lectura) encontró que el menú de «+», al pasar a `<body>`, quedó fuera del orden del teclado: Tab desde «+» ya no entraba en la lista, y Escape no devolvía el foco. Arreglado en `d0375de2`. Al abrir, el foco va al primer ítem habilitado. Escape lo devuelve al «+» si estaba dentro. El «+» declara `aria-controls`. El test está en `Dock.test.tsx`.

**Lo que la revisión dejó y no se arregló aquí** (menores, para la fase que toque):

- **Menú de «+».** Su posición se mide al abrir. No sigue al «+» cuando el dock crece (unos 21 px por cada herramienta añadida; «Restablecer valores» lo mueve mucho) ni cuando cambia el tamaño de la ventana. P2 rehace el dock como margen: ahí el ancla se recalcula.
- **Huecos de `lo-que-flota-es-papel.test.ts`.**
  - `'src/**/*.tsx'` no ve `src/App.tsx`, `main.tsx` ni `bootstrap.tsx`; con `'src/*.tsx'` salen todos.
  - No caza colores con nombre (`'white'`), ni `hsl()` ni `oklch()` escritos a mano.
  - `PINTA` no incluye los `.tsx` de las raíces que flotan.
  - Ninguna unitaria prueba que un clic dentro del menú en portal no lo cierra.
- **Lo deshabilitado por opacidad cae a ~2,1:1 sobre blanco**, bajo el piso de 2,5 del repo. Son «Deshacer» y «Rehacer» del menú Vina (opacidad 0,35) y el botón primario deshabilitado de los modales (0,5). En papel convendría `--text-disabled` en vez de opacidad.
- **Tres muestras del selector de color de Capas** casi no tienen borde contra el blanco: amarillo 1,53:1, verde 1,74, turquesa 1,86. Una línea de pelo en reposo lo resuelve sin tocar el dato.
- **Los dos menús de Capas** llevan `border-radius: 6px` y no `--surface-overlay-radius`.
- **Sin ver en navegador en esta rama:** el clic derecho del 3D, el menú de Capas, el modal de calibración y la tarjeta de «suelta tu archivo». Todos van por token.
- **Preexistente, para P5: el trinquete de contraste no ve el WebGL.** `fondoDe` compone los ancestros del DOM y llega al fondo oscuro de `<body>`; el canvas del 3D no es ancestro de nada. La píldora del modo de superficie, abierta, pinta `--accent-subtle` sobre el gris del escenario con la tinta clara del marco: unos 1,25:1 de verdad, y el trinquete dice 0.
- **Comentarios viejos.**
  - «Same glass language» en `floating.css` y `SubMenu.css`.
  - `(e.g., "Undo")` en `copilotUISlice.ts`.
  - «(DockToolPicker pattern)» en `SurfaceModePill.tsx`.
  - El contrato no nombra `--surface-chrome-bg` entre los fondos prohibidos dentro del papel; el test sí lo prohíbe.
