# Interfaz en papel — P4: los paneles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los paneles se piden y se abren a la derecha, a ras y en oscuro, sin mover las herramientas. Propiedades de una pieza enseña primero lo de siempre y pliega lo de producción, el Avatar son siete campos y Capas habla con iconos y con nombres de taller.

**Architecture:**
- **La ranura.** `usePanelHost` guarda una lista de paneles abiertos, no un panel por lado.
  - Por debajo de 1600 px cabe uno, y el que se pide reemplaza al que estaba.
  - A partir de 1600 caben dos, uno junto al otro. El tercero reemplaza al último que se abrió, y el primero, pegado al borde, no se mueve.
  - `AppShell` los pinta todos detrás del área del 3D, así que la hoja se estrecha por la derecha. `panelSide.ts` se borra, porque ya no hay lado izquierdo.
- **El material.** `.context-panel` deja el `overlay` oscuro y toma el `chrome` entero, en su variante a ras: sin margen, sin radio y sin sombra, de la barra superior a la línea al pie.
- **El contenido.** Propiedades de pieza en dos niveles (`PieceProperties` y `ProduccionDeLaPieza`), el Avatar con un `CampoDeMedida` por medida y Capas con iconos de Lucide y nombres en español.

**Tech Stack:** React 18 + Redux Toolkit, Vitest + Testing Library (jsdom), Playwright, lucide-react 0.575. En este worktree, el Vite de los e2e escucha en el 5181 (`VINA_E2E_PORT`).

**Spec:** `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (v3):
- § 6.1: «Paneles», entero;
- § 2: D11 («A petición, a la derecha, a ras y en oscuro. Propiedades en dos niveles. Las herramientas no se mueven»);
- § 1: no objetivos («El contenido de los paneles, salvo Propiedades, Avatar y Capas. Su material no cambia»);
- § 11: la fila P4, «Los márgenes no se mueven en 2D»;
- captura 08 (`docs/superpowers/specs/2026-10-02-interfaz-en-papel/08-panel-a-peticion.png`): Propiedades a la derecha, a ras; Nombre, Margen (mm), Tela y Espejada; «Producción ›» plegada; «Eliminar pieza».

## Global Constraints

- **Idioma.** Español de Venezuela con tuteo, en sentence case, sin «¡» ni «por favor». Los términos salen del glosario `docs/specs/2026-07-16-ui-copy-es-glosario.md`. Los `aria-label` también van en español. No hay microcopy nuevo que no venga de la spec («Producción», «Forro», «Exterior», «Avíos») o del código que ya existe; «Capa N» es el respaldo de «Layer N».
- **Contrato de interfaz** (`.claude/skills/contrato-de-interfaz/SKILL.md`):
  - tokens de `src/styles/tokens.css`, sin `var(--x, fallback)` y sin colores literales;
  - un material entero: el panel es `chrome` (`--surface-chrome-bg`, `--surface-chrome-border`, `--surface-chrome-radius-flush`, `--surface-chrome-shadow-flush`);
  - todo `:hover` lleva su `:focus-visible`;
  - ningún `z-index` literal;
  - Esc por la escalera (`usePeldanoDeEscape`), nunca un oyente propio en `window`.
- **Superficies.** El panel ya declara `data-superficie="panel"`; nada nuevo flota.
- **La caja negra** ve abrir y cerrar cada panel, también cuando uno reemplaza a otro (`pushJournal('ui', 'panel', …)`).
- **Gates:**
  - typecheck con `npx tsc -b --noEmit`;
  - nada de `--no-verify`;
  - `node scripts/ui-contract-lint.mjs` no sube ningún contador, y si baja se fija el techo con `--update`;
  - cada tarea cierra con la suite entera (`npm run test`).
- **Trinquetes.** Sus líneas base solo se escriben con `*_UPDATE=1 … --retries=0 --workers=1`. A mano, nunca.
- **Ids y archivos.** Los ids se crean con `newId()`, y `git add` va con rutas explícitas.
- **Trabajo en paralelo con el puente MCP** (sesión «Avatares feature», checkout principal, rama `feat/puente-mcp`, Vite en el 5174):
  - aquí no se tocan `src/copilot/`, `src/components/shell/TopBar.tsx`, `src/components/shell/PuertaDelAgente.tsx`, `src/components/shell/unifiedBarCommandDefs.ts`, `src/styles/layout.css` ni `src/utils/telemetry/journal.ts`, que el puente cambia;
  - de `src/store/` solo se tocan las dos líneas de los nombres de capa (`projectSlice.ts:1769-1772`, Task 4), y se le avisa antes a esa sesión;
  - los e2e de aquí van en el 5181;
  - antes de correr la suite entera, un e2e o el gate, se le avisa a esa sesión por mensaje, y no se corre nada encima de su ensayo;
  - la máquina anda corta de memoria (5 GB libres de 32 el 09-10; un ensayo murió así): antes de un e2e, mirar la memoria libre y no lanzarlo con menos de 6 GB.
- **E2e en curso.** Mientras corre un e2e no se edita nada de la app: el Vite recarga.

## Review Focus

1. **«Producción» plegada y el teclado.** Con el teclado no se entra en campos que no se ven: el cuerpo plegado es `inert`. → Task 2 (unitario).
2. **Una medida tecleada con coma, fuera de rango o borrada.** El cuerpo no salta letra por letra, no se pone a 0 y no sale del rango. → Task 3 (`CampoDeMedida`).
3. **Esc en un campo del Avatar.** Con algo tecleado lo deshace y el panel sigue abierto; sin nada tecleado, la tecla sigue su camino. → Task 3 (unitario).
4. **Reemplazar el Avatar con el modo pose encendido.** Otro panel ocupa su ranura y los mandos del 3D se apagan: sin el panel no quedaba puerta para apagarlos. → Task 3 (unitario).
5. **La ventana que cruza 1600 px con dos paneles.** Se queda el último que se abrió, y al ensancharla no vuelve el otro. → Task 1 (unitario y e2e).

## Decisiones de este plan

1. **Rama y aislamiento.** La rama es `feat/interfaz-en-papel-p4`, desde `main` (`30280339`), en el worktree `.claude/worktrees/p3c`. Su `npm ci` sigue valiendo, porque `package.json` no cambió. Va sin upstream hasta el push, para que nunca empuje a `main`.
2. **Dos ranuras: qué pasa con el tercero.** La spec dice «dos, una junto a la otra, a partir de 1600» y no dice qué pasa al pedir un tercero.
   - El tercero reemplaza al último que se abrió. El primero, pegado al borde de la ventana, no se mueve: un panel de calco o Capas, abierto para trabajar con él, sigue donde estaba.
   - Al estrechar la ventana por debajo de 1600 se queda el último que se abrió, que es el que se acaba de pedir. Al ensancharla no vuelve el otro: nada abre un panel sin que se pida.
   - Si es un error, el costo es que con dos paneles abiertos el tercero tapa al que se acababa de abrir en vez de al más viejo.
3. **`panelSide.ts` se borra.** La spec dice que «deja de mandar Escalado y Propiedades a la izquierda»; sin lado izquierdo, el módulo no decide nada.
4. **El panel ya no entra deslizándose.** `slide-down` lo bajaba 8 px desde la barra superior. Un panel del marco aparece como la línea al pie, y sin `transform` no hay 150 ms en que sea bloque contenedor de lo que lleva dentro. `slide-down` se queda: lo usa el menú Vina.
5. **En Split y en 3D la ranura empuja el dock del 3D**, como ya lo hacían Capas y el Avatar. El margen del 3D y el panel entre el escenario y el margen llegan con P5 (fila P5 de § 11).
6. **La lista de costuras del proyecto no sale con una pieza elegida.** Es del proyecto, no de la pieza, y la captura 08 no la tiene. Sigue con nada elegido, con una costura, un borde o un vértice. Si es un error, el costo es un Esc más para llegar a la lista.
7. **La edición vinculada se queda en el primer nivel.** No está en ninguna de las dos listas de § 6.1, y lo que se cambia en una pieza vinculada cambia a su pareja: no se esconde.
8. **Propiedades entera pasa a sentence case.** La captura 08 escribe «Producción» así y el contrato § 5 lo pide; «COSTURAS (3)» al lado de «Producción» se leería como dos voces. `.panel-title` y `.panel-subtitle` solo los usa Propiedades.
9. **Dentro de «Producción» no hay pliegues anidados.** Capa y subcapa van tras una línea, y «Simulación» y «Material», con su subtítulo. Ya los pliega «Producción»: un segundo plegado sería un clic más para lo mismo.
10. **Del Avatar solo cambian las medidas.** § 6.1 habla de ellas y nada más. Cargar un modelo, Modelo y Maniquí, los perfiles, la forma del cuerpo y la pose se quedan como están. El orden «medidas → pose → «Más…»» de cromo callado (F5, sustituida) no se aplica. Las medidas siguen en cm y «Pecho» sigue siendo «Pecho»: el catálogo dice «busto» para las mujeres, y eso se le pregunta a Samuel.
11. **Un campo de medida se fija con Enter o al salir, no con cada tecla.** Escribiendo 170, el cuerpo pasaba por 1 y por 17 cm. Fuera del rango se queda en el borde, y vacío o sin número vuelve al de antes: borrar ya no escribe 0 (`Number('') === 0`). Acepta coma o punto y enseña coma.
12. **Al desmontarse, el Avatar apaga el modo pose.** Pasa ya hoy, pero P4 lo vuelve más frecuente: con una ranura, abrir Propiedades reemplaza al Avatar, y los mandos del 3D se quedaban encendidos sin puerta para apagarlos.
13. **Los nombres de las capas cambian en su fuente, `DEFAULT_LAYER_NAMES`** (`projectSlice.ts:1769`). Su único consumidor es `LayerPanel`, y los nombres nunca se guardan (`stateToProject` no lleva `layerNames`), así que no hace falta migración.
    - El número de delante se va: la spec dice «Forro / Exterior / Avíos» en lugar de «1: Shell». De la capa 3 en adelante, «Capa N».
    - **Avíos, como dice la spec,** aunque en la app «avío» también nombra los botones y cierres (la herramienta «Poner avío», la lista de materiales), y la capa 2 recibe cuellos, puños y bolsillos por su categoría. El costo es una palabra; se le dice a Samuel.
14. **En Capas, también los glifos ▶ ▼ ☰ pasan a Lucide** (`ChevronRight`, `ChevronDown`, `GripVertical`). Son dibujos hechos con letras, de la misma familia que los emojis que la spec quita. Los emojis de los menús de clic derecho se quedan: `barIcons.ts` los deja así a propósito, y no son el panel.

---

### Task 1: La ranura, a la derecha y a ras

**Files:**
- Modify: `src/hooks/usePanelHost.ts` (entero)
- Modify: `src/components/shell/AppShell.tsx:127`, `:332-336`, `:361-365`
- Modify: `src/styles/floating.css:17-30`
- Modify: `src/styles/tokens.css:221-223` (el comentario de los materiales)
- Modify: `.claude/skills/contrato-de-interfaz/SKILL.md` (§ 2, «Hasta su fase…»; § 3, «Que tampoco se muevan…»)
- Delete: `src/components/shell/panelSide.ts`, `src/components/shell/__tests__/panelSide.test.ts`
- Test: `tests/e2e/emplazamiento-paneles.spec.ts` (entero), `src/hooks/__tests__/usePanelHost.test.ts` (entero), `src/components/shell/__tests__/AppShell.canaletas.test.tsx`, `src/components/shell/__tests__/ContextPanel.canaleta.test.tsx`, `src/components/PropertiesPanel/__tests__/PropertiesPanel.rehome.test.tsx` (su caso de `getPanelSide`)

**Interfaces:**
- Consumes: `usePeldanoDeEscape(nombre, prioridad, activo, alEscape)` de `src/shortcuts/escaleraDeLoLlamado.ts`; `pushJournal(kind, name, data)` de `src/utils/telemetry/journal.ts`.
- Produces:
  - `ANCHO_PARA_DOS_RANURAS = 1600`;
  - `ranurasPara(anchoDeVentana: number): number`, que da 1 o 2;
  - `conElPanel(paneles: readonly string[], nombre: string, ranuras: number): string[]`;
  - `usePanelHost(): { paneles: string[]; openPanel(name): void; togglePanel(name): void; closePanel(name): void }`. `paneles[0]` va pegado al borde derecho de la ventana y `paneles[1]`, a su izquierda.

- [ ] **Step 1: El e2e de la ranura, en rojo**

Sustituye `tests/e2e/emplazamiento-paneles.spec.ts` entero:

```ts
import { test, expect, Page } from '@playwright/test';

/**
 * Los paneles del marco (spec 2026-10-02 «la interfaz en papel» § 6.1, P4):
 * a la derecha, a ras, entre la barra superior y la línea al pie. Por debajo
 * de 1600 px hay una ranura y el panel que se pide reemplaza al que estaba;
 * a partir de 1600, dos, uno junto al otro. En 2D, abrir uno no mueve el
 * margen de herramientas ni reencuadra la hoja: se estrecha por la derecha.
 *
 * Por qué es un e2e: jsdom no calcula layout —`getBoundingClientRect()` da 0
 * y no existe `elementFromPoint`—, así que ningún test unitario ve si un
 * panel encoge el lienzo, si dos caben ni si algo queda encerrado. Compañero
 * de `emplazamiento-modales.spec.ts`.
 */

const PALETA = '.unified-bar__panel';
const ENTRADA = '.unified-bar__input';
const PANEL = '.context-panel';

interface VentanaConStore {
  __VINA_STORE__: {
    dispatch: (a: { type: string; payload?: unknown }) => void;
    getState: () => { editor: { viewMode: string } };
  };
}

interface Caja { left: number; top: number; width: number; height: number }

async function abrirApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
  await page.waitForTimeout(500);
}

/** La app abre en Split (`editorSlice.ts:10`). */
async function enDosD(page: Page) {
  await page.evaluate(() => {
    (window as unknown as VentanaConStore).__VINA_STORE__.dispatch({ type: 'editor/setViewMode', payload: '2d' });
  });
  await page.waitForTimeout(400);
}

/** Siembra una pieza: sin ella, Capas sale vacío y Propiedades no tiene qué mostrar. */
async function sembrarPieza(page: Page) {
  await page.evaluate(() => {
    (window as unknown as VentanaConStore).__VINA_STORE__.dispatch({
      type: 'project/addPiece',
      payload: {
        id: 'panel-rect',
        name: 'Delantero de prueba',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [300, 0] },
          { type: 'L', values: [300, 400] },
          { type: 'L', values: [0, 400] },
          { type: 'Z', values: [] },
        ],
        position: { x: 120, y: 120 },
        internals: [], edges: [], rotation: 0, mirrored: false, seamAllowance: 0,
        layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
      },
    });
  });
  await page.waitForTimeout(400);
}

/**
 * Abre un panel por su nombre visible, vía la paleta de comandos (⌘K): es la
 * única puerta que alcanza todos los paneles. El nombre tiene que ser el del
 * comando entero: «Avatar» a secas cae en «Vestir avatar», que va antes.
 */
async function abrirPanel(page: Page, nombre: string) {
  await page.keyboard.press('Control+k');
  await page.waitForSelector(PALETA, { timeout: 5000 });
  await page.fill(ENTRADA, nombre);
  await page.waitForTimeout(250);
  await page.locator(`${PALETA} button`).filter({ hasText: nombre }).first().click();
  await page.waitForTimeout(400);
}

/** Ancho del SVG del lienzo 2D, que es lo que la usuaria ve del patrón. */
async function anchoDelLienzo(page: Page): Promise<number> {
  return page.evaluate(() => {
    // `svg.pattern-svg` y no `.canvas-area__2d svg`: el margen de
    // herramientas vive DENTRO del área 2D, y ese selector cazaría sus iconos.
    const svg = document.querySelector('svg.pattern-svg');
    return svg ? svg.getBoundingClientRect().width : -1;
  });
}

/** Ancho sumado del documento — las dos mitades, 2D y 3D. */
async function anchoDelDocumento(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect().width : 0;
    };
    return w('.canvas-area__2d') + w('.canvas-area__3d');
  });
}

/** La caja del panel cuyo título es `titulo`. */
async function cajaDelPanel(page: Page, titulo: string): Promise<Caja> {
  const panel = page.locator(PANEL, { has: page.locator('.context-panel__header span', { hasText: titulo }) });
  const r = await panel.boundingBox();
  if (!r) throw new Error(`no hay panel «${titulo}»`);
  const d = (v: number) => Math.round(v * 10) / 10;
  return { left: d(r.x), top: d(r.y), width: d(r.width), height: d(r.height) };
}

/** El margen de herramientas del patrón y la pieza sembrada, en px de la ventana. */
async function margenYPieza(page: Page): Promise<{ margen: Caja; pieza: Caja }> {
  return page.evaluate(() => {
    const c = (r: DOMRect) => ({
      left: Math.round(r.left * 10) / 10, top: Math.round(r.top * 10) / 10,
      width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10,
    });
    return {
      margen: c(document.querySelector('nav.margen')!.getBoundingClientRect()),
      pieza: c(document.querySelector('[data-piece-id="panel-rect"]')!.getBoundingClientRect()),
    };
  });
}

// 90 s y no los 30 del config, como el resto del gate del deploy. Medido el
// 2026-10-02 en tres corridas enteras del gate: el primer test que arranca en
// el worker que acaba de terminar un trinquete pesado (contraste,
// superficies) tarda de 33 a 51 s más de lo suyo. Con 30 s salió «flaky» dos
// de dos veces, en un test distinto cada vez.
test.describe.configure({ timeout: process.env.CI ? 240_000 : 90_000 });

test.describe('los paneles: a la derecha, a ras y con reemplazo', () => {
  test.beforeEach(async ({ page }) => {
    await abrirApp(page);
    await sembrarPieza(page);
  });

  test('un panel abre pegado al borde derecho, de la barra superior a la línea al pie, sin margen, radio ni sombra', async ({ page }) => {
    await abrirPanel(page, 'Propiedades');
    await expect(page.locator(PANEL)).toHaveCount(1);

    const m = await page.evaluate(() => {
      const p = document.querySelector('.context-panel') as HTMLElement;
      const r = p.getBoundingClientRect();
      const s = getComputedStyle(p);
      return {
        derecha: r.right,
        ventana: document.documentElement.clientWidth,
        ancho: r.width,
        arriba: r.top,
        finDeLaBarra: document.querySelector('.top-bar')!.getBoundingClientRect().bottom,
        abajo: r.bottom,
        inicioDelPie: document.querySelector('.linea-al-pie')!.getBoundingClientRect().top,
        margen: [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft].join(' '),
        radio: s.borderTopLeftRadius,
        sombra: s.boxShadow,
      };
    });

    expect(Math.abs(m.derecha - m.ventana)).toBeLessThan(1);
    expect(m.ancho).toBe(300);
    expect(Math.abs(m.arriba - m.finDeLaBarra)).toBeLessThan(1);
    expect(Math.abs(m.abajo - m.inicioDelPie)).toBeLessThan(1);
    expect(m.margen).toBe('0px 0px 0px 0px');
    expect(m.radio).toBe('0px');
    expect(m.sombra).toBe('none');
  });

  test('en 2D, abrir un panel no mueve el margen de herramientas ni reencuadra la hoja', async ({ page }) => {
    await enDosD(page);
    const antes = await margenYPieza(page);
    await abrirPanel(page, 'Propiedades');
    await expect(page.locator(PANEL)).toHaveCount(1);
    const despues = await margenYPieza(page);

    expect(despues.margen, 'el margen de herramientas se movió').toEqual(antes.margen);
    expect(despues.pieza, 'la hoja se reencuadró').toEqual(antes.pieza);

    // La hoja termina donde empieza el panel: se estrecha por la derecha.
    const bordes = await page.evaluate(() => ({
      hoja: document.querySelector('svg.pattern-svg')!.getBoundingClientRect().right,
      panel: document.querySelector('.context-panel')!.getBoundingClientRect().left,
    }));
    expect(Math.abs(bordes.hoja - bordes.panel)).toBeLessThan(1);
  });

  test('abrir un panel le quita a la hoja justo su ancho: 300 px', async ({ page }) => {
    const docAntes = await anchoDelDocumento(page);
    const lienzoAntes = await anchoDelLienzo(page);
    await abrirPanel(page, 'Capas');
    await expect(page.locator(PANEL)).toHaveCount(1);
    // Sobre la suma de las dos mitades: en Split cada una cede su parte.
    expect(Math.abs(docAntes - (await anchoDelDocumento(page)) - 300)).toBeLessThan(1.5);
    expect(await anchoDelLienzo(page)).toBeLessThan(lienzoAntes);
  });

  test('por debajo de 1600 px hay una ranura: el panel que se pide reemplaza al que estaba', async ({ page }) => {
    await abrirPanel(page, 'Capas');
    await abrirPanel(page, 'Propiedades');
    await expect(page.locator(PANEL)).toHaveCount(1);
    await expect(page.locator('.context-panel__header span')).toHaveText('Propiedades');
  });

  test('a partir de 1600 px caben dos, uno junto al otro; el tercero reemplaza al último que se abrió', async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    await abrirPanel(page, 'Capas');
    await abrirPanel(page, 'Propiedades');
    await expect(page.locator(PANEL)).toHaveCount(2);

    const capas = await cajaDelPanel(page, 'Capas');
    const propiedades = await cajaDelPanel(page, 'Propiedades');
    expect(Math.abs(capas.left + capas.width - 1680), 'Capas, el primero, va pegado al borde').toBeLessThan(1);
    expect(Math.abs(propiedades.left + propiedades.width - capas.left), 'Propiedades, a su izquierda').toBeLessThan(1);

    await abrirPanel(page, 'Escalado');
    await expect(page.locator(PANEL)).toHaveCount(2);
    const titulos = await page.locator('.context-panel__header span').allTextContents();
    expect(titulos.sort()).toEqual(['Capas', 'Escalado']);
    expect(await cajaDelPanel(page, 'Capas'), 'Capas se movió').toEqual(capas);
  });

  test('al estrechar la ventana por debajo de 1600 se queda el último que se abrió', async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    await abrirPanel(page, 'Capas');
    await abrirPanel(page, 'Propiedades');
    await expect(page.locator(PANEL)).toHaveCount(2);
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(page.locator(PANEL)).toHaveCount(1);
    await expect(page.locator('.context-panel__header span')).toHaveText('Propiedades');
  });

  test('con dos paneles, clicar dentro de uno o en el lienzo no cierra ninguno', async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    await abrirPanel(page, 'Capas');
    await abrirPanel(page, 'Propiedades');
    await expect(page.locator(PANEL)).toHaveCount(2);
    await page.locator('.context-panel__header').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator(PANEL)).toHaveCount(2);
    await page.locator('svg.pattern-svg').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);
    await expect(page.locator(PANEL)).toHaveCount(2);
  });

  test('con dos paneles, el modo dividido no se desborda ni deja hueco, y ninguno va a la izquierda', async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    await abrirPanel(page, 'Capas');
    await abrirPanel(page, 'Propiedades');
    await page.evaluate(() => {
      (window as unknown as VentanaConStore).__VINA_STORE__.dispatch({ type: 'editor/setViewMode', payload: 'split' });
    });
    await page.waitForTimeout(500);

    const medida = await page.evaluate(() => {
      const area = document.querySelector('.canvas-area') as HTMLElement;
      const hijos = [...area.children].filter((c) => {
        const s = getComputedStyle(c);
        return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed';
      });
      const suma = hijos.reduce((acc, c) => {
        const r = c.getBoundingClientRect();
        const s = getComputedStyle(c);
        return acc + r.width + parseFloat(s.marginLeft) + parseFloat(s.marginRight);
      }, 0);
      const clases = hijos.map((c) => (typeof c.className === 'string' ? c.className.split(' ')[0] : ''));
      return { suma, area: area.getBoundingClientRect().width, clases };
    });

    expect(medida.clases).toEqual(['canvas-area__2d', 'canvas-area__divider', 'canvas-area__3d', 'context-panel', 'context-panel']);
    expect(medida.suma).toBeLessThanOrEqual(medida.area + 1);
    expect(medida.suma).toBeGreaterThan(medida.area - 2);
  });

  // H-1: `handleDividerMouseDown` mide la región repartible desde el borde
  // izquierdo del área 2D hasta el derecho del 3D. Con un panel abierto,
  // medir contra `.canvas-area` entero hacía saltar el divisor >100 px por 1 px
  // de arrastre.
  test('arrastrar el divisor con un panel abierto lo deja donde soltó el cursor', async ({ page }) => {
    await abrirPanel(page, 'Capas');

    const divider = page.locator('.canvas-area__divider');
    await expect(divider).toBeVisible();
    const cajaInicial = await divider.boundingBox();
    if (!cajaInicial) throw new Error('no hay divisor');
    const y = cajaInicial.y + cajaInicial.height / 2;

    // Bien lejos de su reposo (splitRatio 0.5) pero dentro del clamp [0.15, 0.85].
    const objetivoX = cajaInicial.x - 150;

    await page.mouse.move(cajaInicial.x + cajaInicial.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(objetivoX, y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const cajaFinal = await divider.boundingBox();
    if (!cajaFinal) throw new Error('no hay divisor tras soltar');
    const xFinal = cajaFinal.x + cajaFinal.width / 2;
    expect(Math.abs(xFinal - objetivoX)).toBeLessThan(6);
  });

  test('el panel no encierra a sus descendientes por accidente', async ({ page }) => {
    await abrirPanel(page, 'Capas');

    const sonda = await page.evaluate(() => {
      const p = document.querySelector('.context-panel') as HTMLElement;
      const s = getComputedStyle(p);
      // Un `position: fixed` dentro de un ancestro con `backdrop-filter`,
      // `transform` o `filter` se resuelve contra ESE ancestro, no contra el
      // viewport — el mecanismo que ya nos costó dos veces.
      const sonda = document.createElement('div');
      sonda.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px';
      p.appendChild(sonda);
      const r = sonda.getBoundingClientRect();
      sonda.remove();
      return {
        position: s.position,
        zIndex: s.zIndex,
        backdropFilter: s.backdropFilter,
        flexBasis: s.flexBasis,
        sondaEnOrigen: Math.abs(r.top) < 1 && Math.abs(r.left) < 1,
      };
    });

    expect(sonda.position).toBe('static');
    expect(sonda.zIndex).toBe('auto');
    expect(sonda.flexBasis).toBe('300px');
    expect(sonda.backdropFilter).toBe('none');
    expect(sonda.sondaEnOrigen).toBe(true);
  });

  // H-3: que nada renderizado dentro de un panel dependa de resolverse contra
  // el viewport. Si este aserto revienta, el arreglo es
  // createPortal(..., document.body), como ToolTooltip.tsx y ConnectionModal.tsx.
  test('ningún descendiente de un panel abierto usa position: fixed', async ({ page }) => {
    const PANELES = ['Avatar y medidas', 'Lista de materiales', 'Escalado', 'Inspector', 'Marcada', 'Capas', 'Propiedades'];

    for (const nombre of PANELES) {
      await abrirPanel(page, nombre);
      await expect(page.locator(PANEL), `«${nombre}» no abrió su panel`).toHaveCount(1);
      await page.waitForTimeout(300); // deja asentar el contenido lazy (Suspense)

      const culpable = await page.evaluate(() => {
        const panel = document.querySelector('.context-panel');
        if (!panel) return null;
        for (const el of panel.querySelectorAll('*')) {
          if (getComputedStyle(el).position === 'fixed') {
            const clase = typeof el.className === 'string' ? el.className : '';
            return `<${el.tagName.toLowerCase()}${clase ? ` class="${clase}"` : ''}>`;
          }
        }
        return null;
      });

      expect(culpable, `panel "${nombre}" tiene un descendiente position:fixed: ${culpable}`).toBeNull();

      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  });

  test('el menú contextual de Capas no queda atrapado dentro del panel', async ({ page }) => {
    await abrirPanel(page, 'Capas');
    const fila = page.locator('.layer-group-header').first();
    await expect(fila).toBeVisible();

    const caja = await fila.boundingBox();
    expect(caja).not.toBeNull();
    const puntoX = caja!.x + 20;
    const puntoY = caja!.y + 10;
    await fila.click({ button: 'right', position: { x: 20, y: 10 } });
    await page.waitForTimeout(300);

    const menu = page.locator('.layer-context-menu');
    await expect(menu).toBeVisible();

    const r = (await menu.boundingBox())!;
    expect(Math.abs(r.x - puntoX)).toBeLessThan(30);
    expect(Math.abs(r.y - puntoY)).toBeLessThan(30);

    const recortado = await page.evaluate(() => {
      const m = document.querySelector('.layer-context-menu') as HTMLElement;
      const p = document.querySelector('.context-panel') as HTMLElement;
      if (!m || !p || !p.contains(m)) return false;
      const rm = m.getBoundingClientRect();
      const rp = p.getBoundingClientRect();
      return rm.bottom > rp.bottom + 1 || rm.right > rp.right + 1;
    });
    expect(recortado).toBe(false);
  });

  test('ajustar a la vista con Propiedades abierto: el patrón cabe entre el margen y el panel', async ({ page }) => {
    // Pieza ancha y baja (5000×200): con la del beforeEach, el encuadre ve
    // una bbox de ~9,6:1, así que manda el ancho.
    await enDosD(page);
    await abrirPanel(page, 'Propiedades');
    await page.evaluate(() => {
      const w = window as unknown as VentanaConStore;
      w.__VINA_STORE__.dispatch({
        type: 'project/addPiece',
        payload: {
          id: 'ancha-baja',
          name: 'Ancha y baja',
          outline: [
            { type: 'M', values: [0, 0] },
            { type: 'L', values: [5000, 0] },
            { type: 'L', values: [5000, 200] },
            { type: 'L', values: [0, 200] },
            { type: 'Z', values: [] },
          ],
          position: { x: 0, y: 0 },
          internals: [], edges: [], rotation: 0, mirrored: false, seamAllowance: 0,
          layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
        },
      });
      w.__VINA_STORE__.dispatch({ type: 'editor/requestFitView' });
    });
    await page.waitForTimeout(500);

    const m = await page.evaluate(() => {
      const g = document.querySelector('[data-piece-id="ancha-baja"]')!.getBoundingClientRect();
      return {
        patronIzq: g.left,
        patronDer: g.right,
        margenDer: document.querySelector('nav.margen')!.getBoundingClientRect().right,
        panelIzq: document.querySelector('.context-panel')!.getBoundingClientRect().left,
      };
    });
    expect(m.patronIzq).toBeGreaterThan(m.margenDer);
    expect(m.patronDer).toBeLessThan(m.panelIzq);
  });
});
```

- [ ] **Step 2: Correrlo contra el código de hoy y verlo caer**

Avisa a la otra sesión, mira que haya 6 GB libres y levanta el e2e en el 5181:

Run: `VINA_E2E_PORT=5181 npx playwright test tests/e2e/emplazamiento-paneles.spec.ts --workers=1 --retries=0`
Expected: 8 FAIL y 5 PASS. Caen:
- «un panel abre pegado al borde derecho…»: Propiedades abre a la izquierda, con 12 px de margen y sombra;
- «en 2D, abrir un panel no mueve el margen…»: el margen se corre 324 px;
- «…justo su ancho: 300 px»: cede 324;
- «por debajo de 1600 px…»: conviven dos;
- «a partir de 1600 px…»: Capas queda a 12 px del borde;
- «al estrechar la ventana…»: siguen dos;
- «…ninguno va a la izquierda»: hay un panel antes del área 2D;
- «ajustar a la vista…»: el panel está a la izquierda del patrón.

Pasan los cuatro que se conservan y «con dos paneles, clicar dentro…», que es una guarda.

- [ ] **Step 3: Los tests del hook, en rojo**

Sustituye `src/hooks/__tests__/usePanelHost.test.ts` entero:

```ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePanelHost, conElPanel, ranurasPara, ANCHO_PARA_DOS_RANURAS } from '../usePanelHost';
import { bajarLaEscalera } from '../../shortcuts/escaleraDeLoLlamado';
import { clearJournal, getJournal } from '../../utils/telemetry/journal';

const anchoOriginal = Object.getOwnPropertyDescriptor(window, 'innerWidth');

/** Cambia el ancho de la ventana y avisa, como lo haría el navegador. */
function anchoDeVentana(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, writable: true, configurable: true });
  window.dispatchEvent(new Event('resize'));
}

beforeEach(() => anchoDeVentana(1366));
afterEach(() => {
  if (anchoOriginal) Object.defineProperty(window, 'innerWidth', anchoOriginal);
});

describe('conElPanel', () => {
  it('con una ranura, el panel que se pide reemplaza al que estaba', () => {
    expect(conElPanel(['Layers'], 'Properties', 1)).toEqual(['Properties']);
  });

  it('con dos ranuras, el segundo se suma a la izquierda del primero', () => {
    expect(conElPanel(['Layers'], 'Properties', 2)).toEqual(['Layers', 'Properties']);
  });

  it('con las dos llenas, el tercero reemplaza al último que se abrió y el primero no se mueve', () => {
    expect(conElPanel(['Layers', 'Properties'], 'Grading', 2)).toEqual(['Layers', 'Grading']);
  });

  it('pedir uno que ya está abierto no cambia nada', () => {
    expect(conElPanel(['Layers', 'Properties'], 'Layers', 2)).toEqual(['Layers', 'Properties']);
  });
});

describe('ranurasPara', () => {
  it('una por debajo de 1600 px y dos a partir de 1600', () => {
    expect(ranurasPara(ANCHO_PARA_DOS_RANURAS - 1)).toBe(1);
    expect(ranurasPara(ANCHO_PARA_DOS_RANURAS)).toBe(2);
  });
});

describe('usePanelHost', () => {
  it('arranca sin paneles', () => {
    const { result } = renderHook(() => usePanelHost());
    expect(result.current.paneles).toEqual([]);
  });

  it('por debajo de 1600 px, Propiedades reemplaza a Capas: no hay lado izquierdo', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Layers'));
    act(() => result.current.openPanel('Properties'));
    expect(result.current.paneles).toEqual(['Properties']);
  });

  it('a partir de 1600 px caben dos, uno junto al otro', () => {
    anchoDeVentana(1680);
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Layers'));
    act(() => result.current.openPanel('Properties'));
    expect(result.current.paneles).toEqual(['Layers', 'Properties']);
  });

  it('al estrechar la ventana por debajo de 1600 se queda el último que se abrió, y al ensancharla no vuelve el otro', () => {
    anchoDeVentana(1680);
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Layers'));
    act(() => result.current.togglePanel('Grading'));
    act(() => anchoDeVentana(1366));
    expect(result.current.paneles).toEqual(['Grading']);
    act(() => anchoDeVentana(1680));
    expect(result.current.paneles).toEqual(['Grading']);
  });

  it('openPanel nunca cierra: pedir dos veces el mismo lo deja abierto', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties'));
    act(() => result.current.openPanel('Properties'));
    expect(result.current.paneles).toEqual(['Properties']);
  });

  it('togglePanel cierra el que ya estaba abierto', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Avatar'));
    act(() => result.current.togglePanel('Avatar'));
    expect(result.current.paneles).toEqual([]);
  });

  it('closePanel cierra solo ese, y el otro pasa al borde', () => {
    anchoDeVentana(1680);
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Layers'));
    act(() => result.current.togglePanel('Properties'));
    act(() => result.current.closePanel('Layers'));
    expect(result.current.paneles).toEqual(['Properties']);
  });

  it('Escape cierra todos a la vez: un solo peldaño, el de los paneles', () => {
    anchoDeVentana(1680);
    const { result } = renderHook(() => usePanelHost());
    act(() => { result.current.openPanel('Properties'); result.current.openPanel('Layers'); });
    expect(result.current.paneles).toEqual(['Properties', 'Layers']);
    act(() => { expect(bajarLaEscalera()).toBe('paneles'); });
    expect(result.current.paneles).toEqual([]);
  });

  it('la caja negra ve abrir, reemplazar y cerrar', () => {
    clearJournal();
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Layers'));
    act(() => result.current.openPanel('Properties'));
    act(() => result.current.closePanel('Properties'));
    const eventos = getJournal().events
      .filter((e) => e.kind === 'ui' && e.name === 'panel')
      .map((e) => [e.data?.panel, e.data?.abierto]);
    expect(eventos).toEqual([
      ['Layers', true],
      ['Properties', true],
      ['Layers', false],
      ['Properties', false],
    ]);
  });
});
```

- [ ] **Step 4: Correrlos y verlos caer**

Run: `npx vitest run src/hooks/__tests__/usePanelHost.test.ts`
Expected: FAIL. `conElPanel`, `ranurasPara` y `ANCHO_PARA_DOS_RANURAS` no existen, y `paneles` es `undefined`.

- [ ] **Step 5: El hook**

Sustituye `src/hooks/usePanelHost.ts` entero:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePeldanoDeEscape } from '../shortcuts/escaleraDeLoLlamado';
import { pushJournal } from '../utils/telemetry/journal';

/** Desde este ancho de ventana caben dos paneles, uno junto al otro (spec 2026-10-02 § 6.1). */
export const ANCHO_PARA_DOS_RANURAS = 1600;

export function ranurasPara(anchoDeVentana: number): number {
  return anchoDeVentana >= ANCHO_PARA_DOS_RANURAS ? 2 : 1;
}

/**
 * Los paneles después de pedir `nombre`. Si ya está, nada cambia. Si cabe, se
 * suma a la izquierda de los que hay. Si no, reemplaza al último que se abrió:
 * el primero, pegado al borde de la ventana, no se mueve.
 */
export function conElPanel(paneles: readonly string[], nombre: string, ranuras: number): string[] {
  if (paneles.includes(nombre)) return [...paneles];
  return [...paneles.slice(0, ranuras - 1), nombre];
}

export interface PanelHost {
  /** Los paneles abiertos: el primero, pegado al borde derecho de la ventana; el segundo, a su izquierda. */
  paneles: string[];
  /** GARANTIZA abierto: la barrita de la pieza y el menú del clic derecho. */
  openPanel: (name: string) => void;
  /** Abre si está cerrado y cierra si está abierto: los docks, el menú Vina y los comandos. */
  togglePanel: (name: string) => void;
  closePanel: (name: string) => void;
}

/**
 * Los paneles del marco (spec 2026-10-02 § 6.1): se piden y se abren a la
 * derecha. Por debajo de 1600 px hay una ranura, y el panel que se pide
 * reemplaza al que estaba; a partir de 1600, dos. Nada los abre solo:
 * Propiedades dejó de abrirse al elegir una esquina del margen en P3c, así
 * que el panel de calco ya no se cierra mientras María dibuja (el caso por el
 * que hasta P4 había una ranura a cada lado).
 */
export function usePanelHost(): PanelHost {
  const [paneles, setPaneles] = useState<string[]>([]);
  const [ranuras, setRanuras] = useState(() => ranurasPara(window.innerWidth));

  // Al estrechar la ventana por debajo de 1600 se queda el último que se abrió.
  useEffect(() => {
    const alCambiarDeAncho = () => {
      const n = ranurasPara(window.innerWidth);
      setRanuras(n);
      setPaneles((p) => (p.length > n ? p.slice(-n) : p));
    };
    window.addEventListener('resize', alCambiarDeAncho);
    return () => window.removeEventListener('resize', alCambiarDeAncho);
  }, []);

  const openPanel = useCallback((name: string) => {
    setPaneles((p) => conElPanel(p, name, ranuras));
  }, [ranuras]);

  const togglePanel = useCallback((name: string) => {
    setPaneles((p) => (p.includes(name) ? p.filter((n) => n !== name) : conElPanel(p, name, ranuras)));
  }, [ranuras]);

  const closePanel = useCallback((name: string) => {
    setPaneles((p) => p.filter((n) => n !== name));
  }, []);

  // La caja negra ve cada panel que se abre y cada uno que se cierra, también
  // el que se va porque otro ocupó su ranura: los dos llegan juntos.
  const antes = useRef<string[]>([]);
  useEffect(() => {
    for (const n of paneles) if (!antes.current.includes(n)) pushJournal('ui', 'panel', { panel: n, abierto: true });
    for (const n of antes.current) if (!paneles.includes(n)) pushJournal('ui', 'panel', { panel: n, abierto: false });
    antes.current = paneles;
  }, [paneles]);

  // Esc cierra los paneles antes que la selección, todos a la vez: un peldaño
  // de la escalera de lo que se llama (spec 2026-10-02 § 6.2).
  usePeldanoDeEscape('paneles', 'panel', paneles.length > 0, () => setPaneles([]));

  return { paneles, openPanel, togglePanel, closePanel };
}
```

- [ ] **Step 6: Correrlos y verlos pasar**

Run: `npx vitest run src/hooks/__tests__/usePanelHost.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 7: AppShell pinta los paneles a la derecha: el test en rojo**

En `src/components/shell/__tests__/AppShell.canaletas.test.tsx`:
- el docblock de arriba pasa a decir que AppShell guarda una lista de paneles (`usePanelHost`), todos a la derecha;
- el caso «usa usePanelHost» pasa a esperar la desestructuración nueva;
- el describe «canvas-area tiene los cinco hijos…» se sustituye entero.

```ts
  it('usa usePanelHost', () => {
    expect(src).toMatch(/const \{ paneles, openPanel, togglePanel, closePanel \} = usePanelHost\(\)/);
  });
```

```ts
describe('los paneles van a la derecha (spec 2026-10-02 § 6.1)', () => {
  const src = leer();
  // Marcador exacto `className="canvas-area__3d"`: `handleDividerMouseDown`
  // también contiene el substring, en una llamada que vive antes del JSX.

  it('no queda ranura a la izquierda', () => {
    expect(src).not.toMatch(/leftPanel/);
  });

  it('los paneles se pintan después de canvas-area__3d, el primero de la lista al final', () => {
    const idx3d = src.indexOf('className="canvas-area__3d"');
    const idxPaneles = src.indexOf('[...paneles].reverse().map(');
    expect(idx3d).toBeGreaterThan(-1);
    expect(idxPaneles).toBeGreaterThan(idx3d);
  });
});
```

Run: `npx vitest run src/components/shell/__tests__/AppShell.canaletas.test.tsx`
Expected: FAIL en los tres casos nuevos.

- [ ] **Step 8: AppShell**

En `src/components/shell/AppShell.tsx`, la línea 127:

```tsx
  const { paneles, openPanel, togglePanel, closePanel } = usePanelHost();
```

Borra el bloque `{leftPanel && (…)}` de las líneas 332-336, y sustituye el `{rightPanel && (…)}` de las líneas 361-365 por:

```tsx
        {/* Los paneles (spec 2026-10-02 § 6.1): a la derecha y a ras, detrás
            del 3D, así que la hoja se estrecha por la derecha y las
            herramientas no se mueven. El primero de la lista va pegado al
            borde de la ventana: se pintan al revés. */}
        {[...paneles].reverse().map((nombre) => (
          <ContextPanel key={nombre} title={PANEL_LABELS[nombre] ?? nombre} onClose={() => closePanel(nombre)}>
            {renderPanelContent(nombre, () => closePanel(nombre))}
          </ContextPanel>
        ))}
```

Run: `npx vitest run src/components/shell/__tests__/AppShell.canaletas.test.tsx src/hooks/__tests__/usePanelHost.test.ts`
Expected: PASS.

- [ ] **Step 9: El material del marco, a ras: el test en rojo**

En `src/components/shell/__tests__/ContextPanel.canaleta.test.tsx`, sustituye el caso «conserva el material overlay…» por estos dos:

```ts
  it('es marco a ras: el material chrome entero, sin margen, sin radio y sin sombra (spec 2026-10-02 § 6.1)', () => {
    expect(regla).toMatch(/background:\s*var\(--surface-chrome-bg\)/);
    expect(regla).toMatch(/border-left:\s*var\(--surface-chrome-border\)/);
    expect(regla).toMatch(/border-radius:\s*var\(--surface-chrome-radius-flush\)/);
    expect(regla).toMatch(/box-shadow:\s*var\(--surface-chrome-shadow-flush\)/);
    expect(regla).not.toMatch(/margin|max-height|--surface-overlay/);
  });

  it('no entra deslizándose: sin transform, no es bloque contenedor de lo que lleva dentro', () => {
    expect(regla).not.toMatch(/animation/);
  });
```

Run: `npx vitest run src/components/shell/__tests__/ContextPanel.canaleta.test.tsx`
Expected: FAIL en los dos.

- [ ] **Step 10: La regla de `.context-panel`**

En `src/styles/floating.css`, sustituye el comentario `/* Context panel */` y la regla `.context-panel` (líneas 17-30):

```css
/* Un panel del marco (spec 2026-10-02 § 6.1): a la derecha, de la barra
   superior a la línea al pie, con el material chrome entero en su variante
   a ras. Sin margen, sin radio y sin sombra; la línea de su izquierda lo
   separa de la hoja. */
.context-panel {
  flex: 0 0 300px;
  background: var(--surface-chrome-bg);
  border-left: var(--surface-chrome-border);
  border-radius: var(--surface-chrome-radius-flush);
  box-shadow: var(--surface-chrome-shadow-flush);
  overflow-y: auto;
}
```

Run: `npx vitest run src/components/shell/__tests__/ContextPanel.canaleta.test.tsx src/styles/__tests__/zIndexScale.test.ts`
Expected: PASS.

- [ ] **Step 11: Fuera `panelSide.ts`**

```bash
git rm src/components/shell/panelSide.ts src/components/shell/__tests__/panelSide.test.ts
```

En `src/components/PropertiesPanel/__tests__/PropertiesPanel.rehome.test.tsx` salen el import de `getPanelSide` y el caso «Properties is a left-side (2D-domain) panel». Dónde se abre Propiedades lo fija ahora `usePanelHost.test.ts`.

Run: `npx tsc -b --noEmit && npx vitest run src/components/PropertiesPanel src/hooks src/components/shell`
Expected: sin errores de tipos; PASS.

- [ ] **Step 12: El e2e en verde**

Run: `VINA_E2E_PORT=5181 npx playwright test tests/e2e/emplazamiento-paneles.spec.ts --workers=1 --retries=0`
Expected: PASS, 13 tests.

- [ ] **Step 13: Los comentarios y el contrato**

En `src/styles/tokens.css:221-223` el comentario dice que los paneles leen el overlay «hasta P4». Pasa a decir que desde P4 los paneles son `chrome` a ras, y que los valores de `overlay` de `:root` los leen el cromo del 3D (hasta P5) y lo que todavía no lleva el ámbito de papel.

En el contrato (`.claude/skills/contrato-de-interfaz/SKILL.md`):
- § 2, la viñeta «Hasta su fase siguen con el overlay oscuro de `:root`»: los paneles salen de la lista, con «desde P4 los paneles son `chrome` a ras, entre la barra superior y la línea al pie»;
- § 3, «Que tampoco se muevan al abrir un panel llega con la ranura a la derecha: en 2D con P4, en Split con P5» pasa a «Al abrir un panel tampoco se mueven en 2D desde P4: va a la derecha, a ras, y la hoja se estrecha por ese lado (`emplazamiento-paneles.spec.ts`). En Split llega con P5.».

- [ ] **Step 14: La suite entera y el commit**

Avisa a la otra sesión antes de la suite.

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo en verde; `lint:ui` sin contadores al alza.

```bash
git add src/hooks/usePanelHost.ts src/hooks/__tests__/usePanelHost.test.ts src/components/shell/AppShell.tsx src/components/shell/__tests__/AppShell.canaletas.test.tsx src/components/shell/__tests__/ContextPanel.canaleta.test.tsx src/components/PropertiesPanel/__tests__/PropertiesPanel.rehome.test.tsx src/styles/floating.css src/styles/tokens.css .claude/skills/contrato-de-interfaz/SKILL.md tests/e2e/emplazamiento-paneles.spec.ts
git commit -m "feat(paneles): una ranura a la derecha y a ras, con reemplazo; dos a partir de 1600 px"
```

(`git rm` ya dejó en el índice el borrado de `panelSide.ts` y su test.)

---

### Task 2: Propiedades de una pieza, en dos niveles

**Files:**
- Create: `src/components/PropertiesPanel/ProduccionDeLaPieza.tsx`
- Modify: `src/components/PropertiesPanel/PieceProperties.tsx` (entero: queda el primer nivel)
- Modify: `src/components/PropertiesPanel/PropertiesPanel.tsx:18-27`, `:58-74`, `:122-156`
- Modify: `src/components/PropertiesPanel/PropertySection.tsx` (entero)
- Modify: `src/components/PropertiesPanel/SeamPropertiesPanel.tsx:116` (el título)
- Modify: `src/components/PropertiesPanel/PropertiesPanel.css:1-5`, `:40-52`, `:95`, `:125`, `:132-138`
- Modify: `src/tools/definitions/notch.tsx:84-85` y `src/tools/__tests__/piquete-al-pie.test.tsx` (comentarios y nombres que citaban el panel)
- Create (test): `src/components/PropertiesPanel/__tests__/PropertiesPanel.dosNiveles.test.tsx`
- Delete (test): `src/components/PropertiesPanel/__tests__/PieceProperties.reorg.test.tsx`
- Modify (test): `src/components/PropertiesPanel/__tests__/PropertiesPanel.rehome.test.tsx`, `src/components/PropertiesPanel/__tests__/unTerminoPorConcepto.test.tsx`

**Interfaces:**
- Consumes: nada de la Task 1.
- Produces:
  - `PieceProperties({ piece }: { piece: PatternPiece })`: el primer nivel, sin cabecera;
  - `ProduccionDeLaPieza({ piece }: { piece: PatternPiece })`: el segundo nivel, con `MaterialTab` al final;
  - `PropertySection`, con la misma API que antes, más `type="button"`, `aria-expanded`, `aria-controls` e `inert` en el cuerpo plegado.

- [ ] **Step 1: Los tests de los dos niveles, en rojo**

Crea `src/components/PropertiesPanel/__tests__/PropertiesPanel.dosNiveles.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * Propiedades de una pieza en dos niveles (spec 2026-10-02 § 6.1, P4). El
 * primero, a la vista y sin cabecera: nombre, margen, tela y espejada. El
 * segundo, plegado en «Producción»: código de tela, entretela, anotaciones,
 * reglas de colocación, capa y subcapa, simulación y material. Fuera los
 * preajustes de margen y «Ajustes de piquete». Captura 08 de la spec.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, addSeam } from '../../../store/projectSlice';
import editorReducer, { selectPiece, selectSeam, clearSelection } from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';
import PropertiesPanel from '../PropertiesPanel';
import type { AppDispatch } from '../../../store';
import type { PatternPiece, Seam } from '../../../types/types';

afterEach(cleanup);

function pieza(id: string, name: string, extra: Partial<PatternPiece> = {}): PatternPiece {
  const now = Date.now();
  return {
    id, name,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true,
    seamAllowance: 10, internals: [], createdAt: now, updatedAt: now, ...extra,
  } as PatternPiece;
}

const COSTURA = {
  id: 's1', type: 'standard', tension: 100, strength: 1, taped: false, tapeWidth: 10, active: true,
  pieceA: { pieceId: 'p1', edgeName: 'edge-1' }, pieceB: { pieceId: 'p2', edgeName: 'edge-3' },
} as Seam;

function panel(extraDeLaPrimera: Partial<PatternPiece> = {}) {
  const store = configureStore({
    reducer: { project: projectReducer, editor: editorReducer, simulation: simulationReducer, tools: toolReducer },
  });
  const d = store.dispatch as AppDispatch;
  d(addPiece(pieza('p1', 'Delantero', extraDeLaPrimera)));
  d(addPiece(pieza('p2', 'Espalda')));
  d(selectPiece('p1'));
  render(<Provider store={store}><PropertiesPanel /></Provider>);
  return { store, d };
}

const produccion = () => screen.getByRole('button', { name: 'Producción' });
const seccionDeProduccion = () => produccion().closest('.panel-section')!;

describe('Propiedades de una pieza, en dos niveles', () => {
  it('el primer nivel son nombre, margen, tela y espejada, en ese orden y sin cabecera', () => {
    panel();
    const fuera = Array.from(document.querySelectorAll('.properties-panel label'))
      .filter((l) => !seccionDeProduccion().contains(l))
      .map((l) => l.textContent);
    expect(fuera).toEqual(['Nombre', 'Margen (mm)', 'Tela', 'Espejada']);
    expect(document.querySelectorAll('.panel-section-header')).toHaveLength(1);
  });

  it('lo demás vive dentro de «Producción»: código de tela, entretela, anotaciones, reglas, capa, simulación y material', () => {
    panel();
    const s = seccionDeProduccion();
    for (const etiqueta of ['Código de tela', 'Entretela', 'Capa', 'Subcapa']) {
      expect(s.contains(screen.getByLabelText(etiqueta)), etiqueta).toBe(true);
    }
    for (const texto of ['Anotaciones', 'Reglas de colocación', 'Simulación', 'Solidificar', 'Presión (Pa)', 'Material', 'Preajuste de tela']) {
      expect(s.textContent, texto).toContain(texto);
    }
  });

  it('«Producción» arranca plegada y fuera del Tab, y se despliega con su botón', () => {
    panel();
    const cuerpo = document.getElementById(produccion().getAttribute('aria-controls')!)!;
    expect(produccion().getAttribute('aria-expanded')).toBe('false');
    expect(cuerpo.classList.contains('collapsed')).toBe(true);
    expect(cuerpo.hasAttribute('inert')).toBe(true);
    fireEvent.click(produccion());
    expect(produccion().getAttribute('aria-expanded')).toBe('true');
    expect(cuerpo.classList.contains('collapsed')).toBe(false);
    expect(cuerpo.hasAttribute('inert')).toBe(false);
  });

  it('desplegada, sigue desplegada al elegir otra pieza', () => {
    const { d } = panel();
    fireEvent.click(produccion());
    act(() => { d(selectPiece('p2')); });
    expect(screen.getByDisplayValue('Espalda')).toBeTruthy();
    expect(produccion().getAttribute('aria-expanded')).toBe('true');
  });

  it('se borran los preajustes de margen y «Ajustes de piquete»: escribían lo que ya tiene campo o línea al pie', () => {
    panel();
    expect(screen.queryByText('Preajustes de margen')).toBeNull();
    expect(screen.queryByText('Ajustes de piquete')).toBeNull();
    expect(document.getElementById('prop-notch-shape')).toBeNull();
  });

  it('«Eliminar pieza» va después de «Producción», y con una pieza elegida no sale la lista de costuras del proyecto', () => {
    const { d } = panel();
    act(() => { d(addSeam(COSTURA)); });
    const eliminar = screen.getByRole('button', { name: 'Eliminar pieza' });
    expect(produccion().compareDocumentPosition(eliminar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/^Costuras \(/)).toBeNull();
    act(() => { d(clearSelection()); });
    expect(screen.getByText('Costuras (1)')).toBeTruthy();
  });

  it('la edición vinculada se queda a la vista, en el primer nivel', () => {
    panel({ linkedPieceId: 'p2', linkMode: 'symmetry' });
    const vinculada = screen.getByText('Edición vinculada');
    expect(seccionDeProduccion().contains(vinculada)).toBe(false);
  });

  it('las cabeceras van en sentence case: «Costura: A ↔ B», y el CSS no las pasa a mayúsculas', () => {
    const { d } = panel();
    act(() => { d(addSeam(COSTURA)); d(selectSeam('s1')); });
    expect(screen.getByText('Costura: Delantero ↔ Espalda')).toBeTruthy();
    const css = readFileSync(join(process.cwd(), 'src/components/PropertiesPanel/PropertiesPanel.css'), 'utf8');
    for (const sel of ['panel-title', 'panel-subtitle']) {
      const regla = css.match(new RegExp(`\\.${sel}\\s*\\{[^}]*\\}`))?.[0] ?? '';
      expect(regla, sel).not.toMatch(/text-transform:\s*uppercase/);
    }
  });
});
```

- [ ] **Step 2: Correrlos y verlos caer**

Run: `npx vitest run src/components/PropertiesPanel/__tests__/PropertiesPanel.dosNiveles.test.tsx`
Expected: FAIL en los ocho. No hay botón «Producción», siguen «Preajustes de margen» y «Ajustes de piquete», y el título dice «COSTURA: …».

- [ ] **Step 3: `PropertySection`, con su estado dicho y fuera del Tab al plegarse**

Sustituye `src/components/PropertiesPanel/PropertySection.tsx` entero:

```tsx
import { ChevronDown } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef } from 'react';

interface PropertySectionProps {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}

export default function PropertySection({ id, title, collapsed, onToggle, children }: PropertySectionProps) {
  const cuerpoId = useId();
  const cuerpo = useRef<HTMLDivElement>(null);
  // El plegado es de CSS (la fila de la rejilla a 0fr): lo de dentro sigue
  // montado, y sin `inert` el Tab entraba en campos que no se ven. React 18
  // no conoce el atributo, así que va por el DOM.
  useEffect(() => {
    cuerpo.current?.toggleAttribute('inert', collapsed);
  }, [collapsed]);

  return (
    <section className="panel-section">
      <button
        type="button"
        className="panel-section-header"
        aria-expanded={!collapsed}
        aria-controls={cuerpoId}
        onClick={() => onToggle(id)}
      >
        <span className="panel-title">{title}</span>
        <ChevronDown size={12} aria-hidden="true" className={collapsed ? 'collapsed' : 'expanded'} />
      </button>
      <div ref={cuerpo} id={cuerpoId} className={`panel-section-body ${collapsed ? 'collapsed' : ''}`}>
        <div className="panel-section-content">
          {children}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: El segundo nivel, `ProduccionDeLaPieza`**

Crea `src/components/PropertiesPanel/ProduccionDeLaPieza.tsx`. Los controles son los de `PieceProperties.tsx` de antes (líneas 114-164, 198-255 y 298-348), copiados sin cambios. Lo único nuevo son los subtítulos «Simulación» y «Material», la línea antes de capa y subcapa, y `MaterialTab` al final:

```tsx
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { updatePiece, setLayer, setSublayer, addAnnotation, removeAnnotation, setFabricCode, addPlacementRule, removePlacementRule } from '../../store/projectSlice';
import { STANDARD_FABRIC_CODES } from '../../utils/fabricCodes';
import type { InterfacingType, PatternPiece, PlacementRule, PlacementRuleType } from '../../types/types';
import { computeStiffnessMultiplier } from '../../utils/cloth/interfacing';
import { ANNOTATION_TEMPLATES, annotationId, sanitizeAnnotationText } from '../../utils/annotationTemplates';
import MaterialTab from './MaterialTab';

/**
 * El segundo nivel de Propiedades de una pieza, plegado en «Producción» (spec
 * 2026-10-02 § 6.1): código de tela, entretela, anotaciones, reglas de
 * colocación, capa y subcapa, simulación y material, en ese orden. Los
 * controles son los que había en `PieceProperties` y en la sección Material;
 * solo cambian de sitio. Capa y Simulación dejan de ser secciones plegables:
 * ya las pliega «Producción».
 */
export default function ProduccionDeLaPieza({ piece }: { piece: PatternPiece }) {
  const dispatch = useDispatch();
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customText, setCustomText] = useState('');

  const handleAddTemplate = () => {
    const tpl = ANNOTATION_TEMPLATES.find(t => t.text === selectedTemplate);
    if (!tpl) return;
    dispatch(addAnnotation({
      pieceId: piece.id,
      annotation: { id: annotationId(), text: tpl.text, position: 'center', category: tpl.category, fontSize: 8 },
    }));
    setSelectedTemplate('');
  };

  const handleAddCustom = () => {
    if (!customText.trim()) return;
    dispatch(addAnnotation({
      pieceId: piece.id,
      annotation: { id: annotationId(), text: sanitizeAnnotationText(customText), position: 'center', category: 'general', fontSize: 8 },
    }));
    setCustomText('');
  };

  return (
    <>
      <div className="panel-field">
        <label htmlFor="prop-piece-fabric-code">Código de tela</label>
        {(() => {
          const current = piece.fabricCode || 'SELF';
          const isCustom = !STANDARD_FABRIC_CODES.includes(current as typeof STANDARD_FABRIC_CODES[number]);
          return isCustom ? (
            <input
              id="prop-piece-fabric-code"
              className="panel-input"
              value={current}
              onChange={e => dispatch(setFabricCode({ pieceId: piece.id, fabricCode: e.target.value }))}
              onBlur={e => { if (!e.target.value.trim()) dispatch(setFabricCode({ pieceId: piece.id, fabricCode: 'SELF' })); }}
            />
          ) : (
            <select
              id="prop-piece-fabric-code"
              className="panel-input"
              value={current}
              onChange={e => {
                if (e.target.value === '__custom__') {
                  dispatch(setFabricCode({ pieceId: piece.id, fabricCode: 'CUSTOM' }));
                } else {
                  dispatch(setFabricCode({ pieceId: piece.id, fabricCode: e.target.value }));
                }
              }}
            >
              {STANDARD_FABRIC_CODES.map(code => (
                <option key={code} value={code}>{code}</option>
              ))}
              <option value="__custom__">Personalizado...</option>
            </select>
          );
        })()}
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-interfacing">Entretela</label>
        <select
          id="prop-piece-interfacing"
          className="panel-input"
          value={piece.interfacingType || 'none'}
          onChange={e => dispatch(updatePiece({ ...piece, interfacingType: e.target.value as InterfacingType, updatedAt: Date.now() }))}
        >
          <option value="none">Ninguna</option>
          <option value="fusible-light">Termoadhesiva ligera (2x)</option>
          <option value="fusible-medium">Termoadhesiva media (4x)</option>
          <option value="fusible-heavy">Termoadhesiva pesada (8x)</option>
          <option value="sew-in-light">De coser ligera (1.5x)</option>
          <option value="sew-in-heavy">De coser pesada (3x)</option>
          <option value="canvas">Crin (10x)</option>
        </select>
      </div>

      <div className="panel-subtitle panel-subtitle--spaced">Anotaciones</div>
      {(piece.annotations || []).map(ann => (
        <div key={ann.id} className="panel-field panel-field--between">
          <span className="panel-item-text">{ann.text}</span>
          <button className="panel-btn-sm" aria-label={`Eliminar anotación ${ann.text}`}
            onClick={() => dispatch(removeAnnotation({ pieceId: piece.id, annotationId: ann.id }))}>✕</button>
        </div>
      ))}
      <div className="panel-field panel-field--row">
        <select className="panel-input panel-input--grow" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
          <option value="">Plantilla...</option>
          {ANNOTATION_TEMPLATES.map((t, i) => <option key={i} value={t.text}>{t.text}</option>)}
        </select>
        <button className="panel-btn-sm" onClick={handleAddTemplate} disabled={!selectedTemplate}>+</button>
      </div>
      <div className="panel-field panel-field--row">
        <input className="panel-input panel-input--grow" placeholder="Texto personalizado..." value={customText} onChange={e => setCustomText(e.target.value)} />
        <button className="panel-btn-sm" onClick={handleAddCustom} disabled={!customText.trim()}>+</button>
      </div>

      <div className="panel-subtitle panel-subtitle--spaced">Reglas de colocación</div>
      {(piece.placementRules || []).map((rule, idx) => (
        <div key={idx} className="panel-field panel-field--between">
          <span className="panel-item-text">
            {rule.type === 'atFold' ? 'Al doblez' :
             rule.type === 'atEdge' ? `Al borde ${rule.edge === 'right' ? 'derecho' : 'izquierdo'}` :
             rule.type === 'priority' ? `Prioridad ${rule.value || 1}` :
             rule.type === 'grainTilt' ? `Inclinación ≤${rule.value || 5}°` :
             rule.type === 'pairWith' ? 'Emparejar' :
             rule.type === 'minDistance' ? `Mín ${rule.value || 10}mm` : rule.type}
          </span>
          <button className="panel-btn-sm" aria-label="Eliminar regla de colocación"
            onClick={() => dispatch(removePlacementRule({ pieceId: piece.id, ruleIndex: idx }))}>✕</button>
        </div>
      ))}
      <div className="panel-field panel-field--row">
        <select className="panel-input panel-input--grow" value="" onChange={e => {
          if (!e.target.value) return;
          const type = e.target.value as PlacementRuleType;
          const rule: PlacementRule = { type };
          if (type === 'priority') rule.value = 1;
          if (type === 'grainTilt') rule.value = 5;
          if (type === 'minDistance') rule.value = 10;
          if (type === 'atEdge') rule.edge = 'left';
          dispatch(addPlacementRule({ pieceId: piece.id, rule }));
          e.target.value = '';
        }}>
          <option value="">Agregar regla...</option>
          <option value="atFold">Al doblez</option>
          <option value="atEdge">Al borde</option>
          <option value="priority">Prioridad</option>
          <option value="grainTilt">Inclinación de hilo</option>
          <option value="pairWith">Emparejar con</option>
          <option value="minDistance">Distancia mínima</option>
        </select>
      </div>

      <div className="panel-subblock">
        <div className="panel-field">
          <label htmlFor="prop-piece-layer">Capa</label>
          <input
            id="prop-piece-layer"
            type="number"
            className="panel-input narrow"
            value={piece.layer ?? 1}
            min={0}
            max={9}
            onChange={e => dispatch(setLayer({ pieceId: piece.id, layer: Number(e.target.value) }))}
          />
        </div>
        <div className="panel-field">
          <label htmlFor="prop-piece-sublayer">Subcapa</label>
          <input
            id="prop-piece-sublayer"
            type="number"
            className="panel-input narrow"
            value={piece.sublayer ?? 0}
            min={0}
            max={9}
            onChange={e => dispatch(setSublayer({ pieceId: piece.id, sublayer: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="panel-subtitle panel-subtitle--spaced">Simulación</div>
      <div className="panel-field">
        <label>Solidificar</label>
        <input
          type="range" className="panel-slider"
          min={0} max={100} value={Math.round((piece.solidifyFactor ?? 0) * 100)}
          onChange={e => dispatch(updatePiece({ ...piece, solidifyFactor: Number(e.target.value) / 100, updatedAt: Date.now() }))}
        />
        <span className="panel-value">{((piece.solidifyFactor ?? 0) * 100).toFixed(0)}%</span>
      </div>
      <div className="panel-field">
        <label>Presión (Pa)</label>
        <input
          type="range" className="panel-slider"
          min={0} max={500} step={10}
          value={piece.pressurePa || 0}
          onChange={e => dispatch(updatePiece({ ...piece, pressurePa: Number(e.target.value), updatedAt: Date.now() }))}
        />
        <span className="panel-value">{piece.pressurePa || 0}</span>
      </div>
      {(piece.interfacingType && piece.interfacingType !== 'none' || (piece.solidifyFactor ?? 0) > 0) && (
        <div className="panel-hint">
          Rigidez efectiva: {computeStiffnessMultiplier(piece.interfacingType, piece.solidifyFactor).toFixed(1)}x
        </div>
      )}

      <div className="panel-subtitle panel-subtitle--spaced">Material</div>
      <MaterialTab />
    </>
  );
}
```

- [ ] **Step 5: El primer nivel, `PieceProperties`**

Sustituye `src/components/PropertiesPanel/PieceProperties.tsx` entero. «Nombre», «Margen (mm)», «Tela», «Espejada» y la edición vinculada son las líneas 61-83, 100-113 y 165-197 de antes, sin cambios:

```tsx
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece, unlinkPieces } from '../../store/projectSlice';
import { selectPiece } from '../../store/editorSlice';
import type { PatternPiece } from '../../types/types';

/**
 * El primer nivel de Propiedades de una pieza (spec 2026-10-02 § 6.1):
 * nombre, margen, tela y espejada, sin cabecera. Lo demás vive plegado en
 * «Producción» (`ProduccionDeLaPieza`). La edición vinculada se queda a la
 * vista: lo que se cambie aquí también cambia a su pareja.
 *
 * Sin los cuatro preajustes de margen (escribían un número que ya tiene
 * campo) ni «Ajustes de piquete»: las opciones del próximo piquete están en
 * la línea al pie, y las de uno ya puesto, en su etiqueta.
 */
export default function PieceProperties({ piece }: { piece: PatternPiece }) {
  const dispatch = useDispatch();
  const fabrics = useSelector((s: RootState) => s.project.fabrics);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  return (
    <div className="panel-nivel">
      <div className="panel-field">
        <label htmlFor="prop-piece-name">Nombre</label>
        <input
          id="prop-piece-name"
          type="text"
          className="panel-input panel-input--grow"
          title={piece.name}
          value={piece.name}
          onChange={e => dispatch(updatePiece({ ...piece, name: e.target.value, updatedAt: Date.now() }))}
        />
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-sa">Margen (mm)</label>
        <input
          id="prop-piece-sa"
          type="number"
          className="panel-input narrow"
          value={piece.seamAllowance}
          min={0}
          max={50}
          onChange={e => dispatch(updatePiece({ ...piece, seamAllowance: Number(e.target.value), updatedAt: Date.now() }))}
        />
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-fabric">Tela</label>
        <select
          id="prop-piece-fabric"
          className="panel-input"
          value={piece.fabricId || ''}
          onChange={e => dispatch(updatePiece({ ...piece, fabricId: e.target.value || undefined, updatedAt: Date.now() }))}
        >
          <option value="">Ninguna</option>
          {fabrics.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>
      <div className="panel-field">
        <label htmlFor="prop-piece-mirror">Espejada</label>
        <input
          id="prop-piece-mirror"
          type="checkbox"
          checked={piece.mirrored}
          onChange={() => dispatch(updatePiece({ ...piece, mirrored: !piece.mirrored, updatedAt: Date.now() }))}
        />
      </div>
      {piece.linkedPieceId && (
        <div className="panel-subblock">
          <div className="panel-subtitle">Edición vinculada</div>
          <div className="panel-link-row">
            <span className={piece.linkMode === 'symmetry' ? 'panel-link-mode--symmetry' : 'panel-link-mode--instance'}>
              {piece.linkMode === 'symmetry' ? 'Simetría' : 'Instancia'}
            </span>
            {' vinculada a '}
            <button
              className="panel-link"
              onClick={() => dispatch(selectPiece(piece.linkedPieceId!))}
            >
              {pieces.find(p => p.id === piece.linkedPieceId)?.name || piece.linkedPieceId}
            </button>
          </div>
          <button
            className="panel-delete"
            onClick={() => dispatch(unlinkPieces({ pieceId: piece.id }))}
          >
            Quitar edición vinculada
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: `PropertiesPanel` compone los dos niveles**

En `src/components/PropertiesPanel/PropertiesPanel.tsx`:
- el import de `MaterialTab` (línea 21) sale, porque ahora lo pinta `ProduccionDeLaPieza`, y entra `import ProduccionDeLaPieza from './ProduccionDeLaPieza';`;
- el estado inicial de los plegados (líneas 58-64):

```tsx
  // «Producción» arranca plegada (spec 2026-10-02 § 6.1). El estado vive aquí,
  // así que sobrevive a cambiar de pieza y se olvida al cerrar el panel.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    seams: false,
    produccion: true,
  });
```

- el título de la lista (línea 74): `` title={`Costuras (${seams.length})`} ``;
- las líneas 123-125 se sustituyen por:

```tsx
          {selectedPiece && (
            <>
              <PieceProperties piece={selectedPiece} />
              <PropertySection id="produccion" title="Producción" collapsed={!!collapsedSections.produccion} onToggle={toggleSection}>
                <ProduccionDeLaPieza piece={selectedPiece} />
              </PropertySection>
            </>
          )}
```

- `{selectedSeam && (<SeamPropertiesPanel … />)}` se queda como está;
- las líneas 139-156 (la sección MATERIAL, la lista y «Eliminar pieza») se sustituyen por:

```tsx
          {/* La lista es del proyecto, no de la pieza: con una pieza elegida
              no sale (captura 08 de la spec). */}
          {!selectedPiece && seamsList}

          {/* Acción destructiva al FINAL del panel, nunca en mitad del
              formulario (Fase 3 — hallazgo de prevención de errores). */}
          {selectedPiece && (
            <button
              className="panel-delete"
              onClick={() => { dispatch(removePiece(selectedPiece.id)); dispatch(clearSelection()); }}
            >
              Eliminar pieza
            </button>
          )}
```

En `SeamPropertiesPanel.tsx:116` el título pasa a `` `Costura: ${pieceAName} ↔ ${pieceBName}` ``.

- [ ] **Step 7: El CSS: sentence case, el foco y el primer nivel**

En `src/components/PropertiesPanel/PropertiesPanel.css`:
- el comentario de cabecera (líneas 1-5) dice ahora que el marco del panel (fondo y borde) es de `.context-panel`, en `styles/floating.css`, y que aquí solo se pinta el contenido;
- `.panel-title` (líneas 46-52) pierde `letter-spacing: 0.08em;` y `text-transform: uppercase;`;
- `.panel-subtitle` (líneas 132-138) pierde `text-transform: uppercase;` y `letter-spacing: 0.05em;`;
- se borra `.panel-field--wrap` (línea 95): su único consumidor eran los preajustes;
- el comentario de la línea 125 pasa a `/* Sub-blocks (edición vinculada, capa y subcapa, tramos del margen) */`;
- debajo de `.panel-section-header:hover .panel-title` entra:

```css
.panel-section-header:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.panel-section-header:focus-visible .panel-title {
  color: var(--text-primary);
}

/* El primer nivel de una pieza (spec 2026-10-02 § 6.1): sin cabecera, y la
   misma línea que separa una sección de la siguiente. */
.panel-nivel {
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--sp-2);
}
```

- [ ] **Step 8: Los tests que fijaban lo que se borra**

- `git rm src/components/PropertiesPanel/__tests__/PieceProperties.reorg.test.tsx`. Sus tres casos los cubren los nuevos: Simulación vive en «Producción», plegada con ella, y «Eliminar pieza» va al final.
- `PropertiesPanel.rehome.test.tsx`:
  - borra los casos «SA preset buttons write piece.seamAllowance (Francesa → 15mm)» y «Notch Settings writes tools.toolOptions.notch…»;
  - en «shows the PIECE section for the selected piece», `expect(screen.getByText('PIEZA'))` pasa a `expect(screen.getByLabelText('Nombre'))`;
  - en el docblock, el punto (b) deja de citar «SA presets» y el (c) se borra.
- `unTerminoPorConcepto.test.tsx`: borra los casos «las formas del piquete» y «los preajustes de margen…» y el import de `FORMAS_DE_PIQUETE`. Que la línea al pie y la etiqueta usen `FORMAS_DE_PIQUETE` lo fijan `piquete-al-pie.test.tsx` y los tests de `etiquetas/piquete.ts`.
- `src/tools/definitions/notch.tsx:84-85` pasa a «Los rangos que tenía el panel de Propiedades (spec § 5.2), que P4 borró: un rango por opción, y así ningún valor guardado queda fuera.».
- `src/tools/__tests__/piquete-al-pie.test.tsx`: en el docblock y en los dos nombres, «el rango del panel» pasa a «el rango que tenía Propiedades».

- [ ] **Step 9: Correr y ver pasar**

Run: `npx tsc -b --noEmit && npx vitest run src/components/PropertiesPanel src/tools/__tests__/piquete-al-pie.test.tsx`
Expected: sin errores de tipos; PASS, con los ocho casos nuevos en verde.

- [ ] **Step 10: La suite entera y el commit**

Avisa a la otra sesión antes de la suite.

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo en verde. Si `lint:ui` baja R5 (la cabecera ya tiene su `:focus-visible`), fija el techo con `node scripts/ui-contract-lint.mjs --update` y el baseline entra en el commit.

```bash
git add src/components/PropertiesPanel/ProduccionDeLaPieza.tsx src/components/PropertiesPanel/PieceProperties.tsx src/components/PropertiesPanel/PropertiesPanel.tsx src/components/PropertiesPanel/PropertySection.tsx src/components/PropertiesPanel/SeamPropertiesPanel.tsx src/components/PropertiesPanel/PropertiesPanel.css src/components/PropertiesPanel/__tests__/PropertiesPanel.dosNiveles.test.tsx src/components/PropertiesPanel/__tests__/PropertiesPanel.rehome.test.tsx src/components/PropertiesPanel/__tests__/unTerminoPorConcepto.test.tsx src/tools/definitions/notch.tsx src/tools/__tests__/piquete-al-pie.test.tsx
git commit -m "feat(propiedades): la pieza en dos niveles; lo de producción, plegado"
```

(`git rm` ya dejó el borrado de `PieceProperties.reorg.test.tsx` en el índice; si el baseline del contrato bajó, va también `scripts/ui-contract-baseline.json`.)

---

### Task 3: El Avatar, siete medidas en siete campos

**Files:**
- Create: `src/components/Viewport3D/CampoDeMedida.tsx`
- Modify: `src/components/Viewport3D/AvatarPanel.tsx:18-38`, `:50-54`, `:103-111`, `:183-185`, `:200-201`, `:312-335`
- Modify: `src/components/Viewport3D/AvatarPanel.css:1`, `:7-69` (el contenedor y lo muerto), y las reglas nuevas de las medidas
- Modify: `src/components/shell/AppShell.tsx:95` (`<AvatarPanel />`)
- Create (test): `src/components/Viewport3D/__tests__/CampoDeMedida.test.tsx`, `src/components/Viewport3D/__tests__/AvatarPanel.sieteCampos.test.tsx`

**Interfaces:**
- Consumes: nada de las tareas anteriores. `updateMeasurements` y `togglePoseEditor` vienen del store, y `projectSlice` / `avatarSlice` no se tocan.
- Produces: `CampoDeMedida({ id, label, valor, min, max, alFijar }: { id: string; label: string; valor: number | undefined; min: number; max: number; alFijar(valor: number): void })`; `AvatarPanel()` sin props.

- [ ] **Step 1: Los tests del campo, en rojo**

Crea `src/components/Viewport3D/__tests__/CampoDeMedida.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CampoDeMedida from '../CampoDeMedida';

afterEach(cleanup);

function campo(valor: number | undefined = 161.4) {
  const alFijar = vi.fn();
  render(<CampoDeMedida id="m" label="Estatura" valor={valor} min={140} max={210} alFijar={alFijar} />);
  return { alFijar, input: screen.getByLabelText('Estatura') as HTMLInputElement };
}

describe('CampoDeMedida: una medida del cuerpo, un campo', () => {
  it('enseña el valor guardado tal cual, con coma', () => {
    expect(campo(161.4).input.value).toBe('161,4');
  });

  it('sin valor guardado sale vacío: no se inventa uno', () => {
    expect(campo(undefined).input.value).toBe('');
  });

  it('escribir no toca el cuerpo: se fija con Enter, una vez', () => {
    const { alFijar, input } = campo();
    for (const v of ['1', '17', '170']) fireEvent.change(input, { target: { value: v } });
    expect(alFijar).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(alFijar).toHaveBeenCalledTimes(1);
    expect(alFijar).toHaveBeenCalledWith(170);
  });

  it('al salir del campo también se fija, y vale coma o punto', () => {
    const { alFijar, input } = campo();
    fireEvent.change(input, { target: { value: '165,5' } });
    fireEvent.blur(input);
    expect(alFijar).toHaveBeenLastCalledWith(165.5);
    fireEvent.change(input, { target: { value: '166.5' } });
    fireEvent.blur(input);
    expect(alFijar).toHaveBeenLastCalledWith(166.5);
  });

  it('fuera del rango se queda en el borde', () => {
    const { alFijar, input } = campo();
    fireEvent.change(input, { target: { value: '300' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(alFijar).toHaveBeenLastCalledWith(210);
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(alFijar).toHaveBeenLastCalledWith(140);
  });

  it('vacío o sin número vuelve al de antes y no escribe: borrar no es poner 0', () => {
    const { alFijar, input } = campo();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'alto' } });
    fireEvent.blur(input);
    expect(alFijar).not.toHaveBeenCalled();
    expect(input.value).toBe('161,4');
  });

  it('el mismo valor no escribe: no deja un paso de deshacer vacío', () => {
    const { alFijar, input } = campo(170);
    fireEvent.change(input, { target: { value: '170' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(alFijar).not.toHaveBeenCalled();
  });

  it('Esc con algo tecleado lo deshace y se queda en el campo; sin nada tecleado, la tecla sigue su camino', () => {
    const { alFijar, input } = campo();
    const alPasar = vi.fn();
    document.addEventListener('keydown', alPasar);
    try {
      fireEvent.change(input, { target: { value: '170' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(input.value).toBe('161,4');
      expect(alPasar).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(alPasar).toHaveBeenCalledTimes(1);
      fireEvent.blur(input);
      expect(alFijar).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', alPasar);
    }
  });

  it('la unidad describe el campo', () => {
    const { input } = campo();
    const describe = input.getAttribute('aria-describedby');
    expect(describe).toBeTruthy();
    expect(document.getElementById(describe!)!.textContent).toBe('cm');
  });
});
```

Run: `npx vitest run src/components/Viewport3D/__tests__/CampoDeMedida.test.tsx`
Expected: FAIL: `../CampoDeMedida` no existe.

- [ ] **Step 2: `CampoDeMedida`**

Crea `src/components/Viewport3D/CampoDeMedida.tsx`:

```tsx
import { useState } from 'react';

interface CampoDeMedidaProps {
  id: string;
  label: string;
  /** El valor guardado, en cm. Sin valor, el campo sale vacío: Vina no adivina números. */
  valor: number | undefined;
  min: number;
  max: number;
  alFijar(valor: number): void;
}

/** Con coma, como se escribe en Venezuela; lo que llegue con punto también vale. */
const mostrar = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','));

/**
 * Una medida del cuerpo, un campo (spec 2026-10-02 § 6.1: «siete medidas como
 * siete campos; hoy son 21 controles»). Lo tecleado se fija con Enter o al
 * salir del campo, no con cada tecla: escribiendo 170, el cuerpo pasaba por 1
 * y por 17 cm. Fuera del rango se queda en el borde; vacío o sin número,
 * vuelve al de antes sin escribir nada. Esc deshace lo tecleado.
 */
export default function CampoDeMedida({ id, label, valor, min, max, alFijar }: CampoDeMedidaProps) {
  const [borrador, setBorrador] = useState<string | null>(null);

  const fijar = () => {
    if (borrador === null) return;
    const texto = borrador.trim();
    setBorrador(null);
    const n = Number(texto.replace(',', '.'));
    if (texto === '' || !Number.isFinite(n)) return;
    const v = Math.min(max, Math.max(min, n));
    if (v !== valor) alFijar(v);
  };

  return (
    <div className="ap-medida">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="ap-medida__campo"
        type="text"
        inputMode="decimal"
        aria-describedby={`${id}-unidad`}
        value={borrador ?? mostrar(valor)}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={fijar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') fijar();
          // Con algo tecleado, Esc lo deshace y se queda aquí; sin nada,
          // sigue su camino por la escalera de lo que se llama.
          if (e.key === 'Escape' && borrador !== null) {
            e.stopPropagation();
            setBorrador(null);
          }
        }}
      />
      <span id={`${id}-unidad`} className="ap-medida__unidad">cm</span>
    </div>
  );
}
```

Run: `npx vitest run src/components/Viewport3D/__tests__/CampoDeMedida.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 3: Los tests del panel, en rojo**

Crea `src/components/Viewport3D/__tests__/AvatarPanel.sieteCampos.test.tsx`:

```tsx
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer from '../../../store/projectSlice';
import avatarReducer from '../../../store/avatarSlice';
import AvatarPanel from '../AvatarPanel';

afterEach(cleanup);

const SIETE = ['Estatura', 'Pecho', 'Cintura', 'Cadera', 'Ancho de hombros', 'Largo de brazo', 'Entrepierna'];

function panel() {
  const store = configureStore({ reducer: { project: projectReducer, avatar: avatarReducer } });
  const utils = render(<Provider store={store}><AvatarPanel /></Provider>);
  return { store, ...utils };
}

describe('el Avatar: siete medidas, siete campos (spec 2026-10-02 § 6.1)', () => {
  it('cada medida es un campo, sin deslizador ni lectura repetida', () => {
    const { container } = panel();
    for (const nombre of SIETE) {
      expect((screen.getByLabelText(nombre) as HTMLInputElement).type, nombre).toBe('text');
    }
    const medidas = container.querySelector('.ap-medidas')!;
    expect(medidas.querySelectorAll('input')).toHaveLength(7);
    expect(medidas.querySelectorAll('input[type="range"]')).toHaveLength(0);
  });

  it('Enter escribe la medida en el proyecto', () => {
    const { store } = panel();
    const estatura = screen.getByLabelText('Estatura');
    fireEvent.change(estatura, { target: { value: '170' } });
    fireEvent.keyDown(estatura, { key: 'Enter' });
    expect(store.getState().project.avatar.measurements.height).toBe(170);
  });

  it('al cerrarse el panel se apaga el modo pose: sin él no queda puerta para apagarlo', () => {
    const { store, unmount } = panel();
    expect(store.getState().avatar.poseEditorOpen).toBe(true);
    unmount();
    expect(store.getState().avatar.poseEditorOpen).toBe(false);
  });
});
```

Run: `npx vitest run src/components/Viewport3D/__tests__/AvatarPanel.sieteCampos.test.tsx`
Expected: FAIL en los tres: «Estatura» es un `<span>`, no la etiqueta de un campo, y el modo pose sigue encendido al desmontar. Si TypeScript se queja de que falta `open`, el rojo es ese: también es correcto, porque la prop se va.

- [ ] **Step 4: El panel**

En `src/components/Viewport3D/AvatarPanel.tsx`:
- entra `import CampoDeMedida from './CampoDeMedida';`;
- `SliderDef` y `SLIDERS` (líneas 23-38) pasan a `MedidaDef` y `MEDIDAS`, con los mismos siete objetos;
- `AvatarPanelProps` (líneas 50-52) se borra y la firma pasa a `export default function AvatarPanel() {`. `open` era del panel lateral de febrero dentro del visor, y desde que el panel vive en `ContextPanel` siempre vale `true`;
- el efecto de las líneas 103-111 se sustituye por estos dos:

```tsx
  // Con la sección «Pose» abierta, los mandos de las articulaciones se ven.
  useEffect(() => {
    if (poseOpen && !poseEditorOpen) dispatch(togglePoseEditor());
  }, [poseOpen, poseEditorOpen, dispatch]);

  // Al cerrarse el panel, o al reemplazarlo otro en su ranura, el modo pose se
  // apaga: sin el panel no quedaba puerta para apagarlo, y los mandos y
  // «● MODO POSE» se quedaban en el 3D.
  const poseAlDesmontar = useRef(poseEditorOpen);
  poseAlDesmontar.current = poseEditorOpen;
  useEffect(() => () => {
    if (poseAlDesmontar.current) dispatch(togglePoseEditor());
  }, [dispatch]);
```

- la línea 201 pasa a `<div className="avatar-panel-wrapper">`;
- el bloque de las medidas (líneas 312-335) se sustituye por:

```tsx
                {/* Las siete medidas, un campo cada una (spec 2026-10-02 § 6.1). */}
                <div className="ap-medidas">
                  {MEDIDAS.map(({ key, label, min, max }) => (
                    <CampoDeMedida
                      key={key}
                      id={`ap-medida-${key}`}
                      label={label}
                      min={min}
                      max={max}
                      valor={measurements[key] as number | undefined}
                      alFijar={(v) => handleMeasurement(key, v)}
                    />
                  ))}
                </div>
```

En `src/components/shell/AppShell.tsx:95`: `<Suspense fallback={fallback}><AvatarPanel /></Suspense>`.

- [ ] **Step 5: El CSS del Avatar**

En `src/components/Viewport3D/AvatarPanel.css`:
- el comentario de la línea 1 pasa a `/* AvatarPanel — el contenido del panel «Avatar» (ContextPanel). */`;
- `.avatar-panel-wrapper.open`, `.avatar-panel-wrapper.closed`, `.avatar-panel-header`, `.avatar-panel-header h3`, `.avatar-panel-close` y sus tres estados se borran. El último consumidor de la cabecera se fue en `cf32f979`, y de `open` en este paso;
- las reglas `.ap-slider-*` se quedan: las usan la forma del cuerpo, `EnvironmentSection` y `ExportSection`;
- después de las reglas de `.ap-slider-control input[type="number"]` entra:

```css
/* Las siete medidas (spec 2026-10-02 § 6.1): un campo por medida, el rótulo a
   la izquierda y la unidad detrás. Las cifras, en columna. */
.ap-medidas {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.ap-medida {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.ap-medida label {
  flex: 1;
}

.ap-medida__campo {
  width: 64px;
  padding: 2px var(--sp-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--field-bg);
  color: var(--text-primary);
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.ap-medida__campo:hover {
  border-color: var(--text-tertiary);
}

.ap-medida__campo:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.ap-medida__unidad {
  width: 20px;
  color: var(--text-tertiary);
}
```

- [ ] **Step 6: Correr y ver pasar**

Run: `npx tsc -b --noEmit && npx vitest run src/components/Viewport3D src/components/shell`
Expected: sin errores de tipos; PASS, con los 12 casos nuevos en verde.

- [ ] **Step 7: La suite entera y el commit**

Avisa a la otra sesión antes de la suite.

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo en verde; si `lint:ui` baja R5 (se fue `.avatar-panel-close:hover`, que ya tenía su `:focus-visible`, así que probablemente no), fija el techo.

```bash
git add src/components/Viewport3D/CampoDeMedida.tsx src/components/Viewport3D/AvatarPanel.tsx src/components/Viewport3D/AvatarPanel.css src/components/Viewport3D/__tests__/CampoDeMedida.test.tsx src/components/Viewport3D/__tests__/AvatarPanel.sieteCampos.test.tsx src/components/shell/AppShell.tsx
git commit -m "feat(avatar): siete medidas, siete campos; Enter fija, y cerrar el panel apaga el modo pose"
```

---

### Task 4: Capas, con iconos y nombres de taller

**Files:**
- Modify: `src/store/projectSlice.ts:1769-1772` (los nombres de capa: avisar antes a la otra sesión)
- Modify: `src/components/LayerPanel/LayerPanel.tsx:1-16`, `:239-249`, `:305`, `:311-332`, `:363-365`, `:370-376`
- Modify: `src/components/LayerPanel/LayerPanel.css:18` (`.layer-group-title`)
- Create (test): `src/components/LayerPanel/__tests__/LayerPanel.iconos.test.tsx`

**Interfaces:**
- Consumes: nada de las tareas anteriores.
- Produces: `getLayerDisplayName(state, layer)` con la misma firma, que ahora da «Forro», «Exterior», «Avíos» o «Capa N» si la capa no tiene nombre puesto.

- [ ] **Step 1: Los tests, en rojo**

Crea `src/components/LayerPanel/__tests__/LayerPanel.iconos.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * Capas (spec 2026-10-02 § 6.1, P4): iconos de Lucide en lugar de emojis, y
 * «Forro / Exterior / Avíos» en lugar de «1: Shell».
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, renameLayer } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import editorReducer from '../../../store/editorSlice';
import LayerPanel from '../LayerPanel';
import type { AppDispatch } from '../../../store';
import type { PatternPiece } from '../../../types/types';

afterEach(cleanup);

function pieza(id: string, layer: number): PatternPiece {
  const now = Date.now();
  return {
    id, name: `Pieza ${id}`, layer,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 10] }, { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true,
    seamAllowance: 10, internals: [], createdAt: now, updatedAt: now,
  } as PatternPiece;
}

function panel() {
  const store = configureStore({ reducer: { project: projectReducer, simulation: simulationReducer, editor: editorReducer } });
  const d = store.dispatch as AppDispatch;
  for (const [id, capa] of [['a', 0], ['b', 1], ['c', 2], ['d', 3]] as const) d(addPiece(pieza(id, capa)));
  render(<Provider store={store}><LayerPanel /></Provider>);
  return { d };
}

const titulos = () => Array.from(document.querySelectorAll('.layer-group-title')).map((t) => t.textContent);

describe('Capas', () => {
  it('las capas se llaman Forro, Exterior y Avíos, sin el número delante; de la 3 en adelante, «Capa N»', () => {
    panel();
    expect(titulos()).toEqual(['Capa 3', 'Avíos', 'Exterior', 'Forro']);
  });

  it('el nombre que ella le puso a una capa gana', () => {
    const { d } = panel();
    act(() => { d(renameLayer({ layer: 1, name: 'Cuerpo' })); });
    expect(titulos()).toContain('Cuerpo');
    expect(titulos()).not.toContain('Exterior');
  });

  it('ver, ocultar y bloquear son iconos de Lucide con su nombre, sin emojis ni glifos', () => {
    panel();
    for (const nombre of ['Ocultar capa', 'Bloquear capa', 'Ocultar pieza', 'Contraer/expandir todo']) {
      const botones = screen.getAllByRole('button', { name: nombre });
      for (const b of botones) expect(b.querySelector('svg'), nombre).not.toBeNull();
    }
    const texto = document.querySelector('.layer-panel')!.textContent ?? '';
    expect(texto).not.toMatch(/\p{Extended_Pictographic}|[▶▼☰]/u);
  });

  it('los títulos van en sentence case: el CSS no los pasa a mayúsculas', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/LayerPanel/LayerPanel.css'), 'utf8');
    const regla = css.match(/\.layer-group-title\s*\{[^}]*\}/)?.[0] ?? '';
    expect(regla).not.toMatch(/text-transform:\s*uppercase/);
  });
});
```

Run: `npx vitest run src/components/LayerPanel/__tests__/LayerPanel.iconos.test.tsx`
Expected: FAIL en los cuatro. Los títulos son «3: Layer 3», «2: Trims», «1: Shell» y «0: Lining»; los botones no tienen nombre accesible ni `svg`; el CSS dice `uppercase`.

- [ ] **Step 2: Los nombres, en su fuente**

Avisa a la otra sesión: «Voy a cambiar `DEFAULT_LAYER_NAMES` y el respaldo `Layer N` de `src/store/projectSlice.ts:1769-1772`, dos líneas, solo nombres que se ven; el puente no las usa». Con su visto, en `projectSlice.ts`:

```ts
// Los nombres de taller (spec 2026-10-02 § 6.1). Solo se ven: `layerNames`
// no viaja en `stateToProject`, así que ningún proyecto guardado los lleva.
const DEFAULT_LAYER_NAMES: Record<number, string> = { 0: 'Forro', 1: 'Exterior', 2: 'Avíos' };

export function getLayerDisplayName(state: { project: { layerNames: Record<number, string> } }, layer: number): string {
  return state.project.layerNames[layer] ?? DEFAULT_LAYER_NAMES[layer] ?? `Capa ${layer}`;
}
```

- [ ] **Step 3: Los iconos y el título**

En `src/components/LayerPanel/LayerPanel.tsx`:
- entra `import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Lock, Unlock } from 'lucide-react';`;
- el botón de contraer todo (líneas 247-249):

```tsx
        <button onClick={handleCollapseAll} title="Contraer/expandir todo" aria-label="Contraer/expandir todo">
          {allLayers.every(l => collapsed[l])
            ? <ChevronRight size={12} aria-hidden="true" />
            : <ChevronDown size={12} aria-hidden="true" />}
        </button>
```

- el título (línea 305): `{displayName}`;
- ver y bloquear la capa (líneas 311-328):

```tsx
              <button
                className={`layer-icon-btn${isHidden ? '' : ' active'}`}
                onClick={e => { e.stopPropagation(); dispatch(toggleLayerVisibility(layerNum)); }}
                title={isHidden ? 'Mostrar capa' : 'Ocultar capa'}
                aria-label={isHidden ? 'Mostrar capa' : 'Ocultar capa'}
              >
                {isHidden ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
              </button>

              <button
                className={`layer-icon-btn${isLocked ? ' active' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  dispatch(setLayerLocked({ layer: layerNum, locked: !isLocked }));
                }}
                title={isLocked ? 'Desbloquear capa' : 'Bloquear capa'}
                aria-label={isLocked ? 'Desbloquear capa' : 'Bloquear capa'}
              >
                {isLocked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
              </button>
```

- la flecha de cada capa (líneas 330-332):

```tsx
              <span className="layer-collapse-chevron">
                {isCollapsed ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
              </span>
```

- el asa para arrastrar (líneas 363-365):

```tsx
                      <span className="layer-piece-drag-handle" title="Arrastra para reordenar">
                        <GripVertical size={12} aria-hidden="true" />
                      </span>
```

- ver la pieza (líneas 370-376):

```tsx
                      <button
                        className={`layer-icon-btn${!isPieceHidden ? ' active' : ''}`}
                        onClick={e => { e.stopPropagation(); dispatch(toggleHide3D(piece.id)); }}
                        title={isPieceHidden ? 'Mostrar pieza' : 'Ocultar pieza'}
                        aria-label={isPieceHidden ? 'Mostrar pieza' : 'Ocultar pieza'}
                      >
                        {isPieceHidden ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                      </button>
```

En `src/components/LayerPanel/LayerPanel.css:18`, `.layer-group-title` pierde `text-transform: uppercase; letter-spacing: 0.5px;`.

- [ ] **Step 4: Correr y ver pasar**

Run: `npx tsc -b --noEmit && npx vitest run src/components/LayerPanel src/store/__tests__/projectSlice.layer.test.ts`
Expected: sin errores de tipos; PASS. Los tests del store guardan nombres puestos por ella («Outer Shell», «Trims» como dato), no leen los de fábrica.

- [ ] **Step 5: La suite entera y el commit**

Avisa a la otra sesión antes de la suite.

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo en verde.

```bash
git add src/store/projectSlice.ts src/components/LayerPanel/LayerPanel.tsx src/components/LayerPanel/LayerPanel.css src/components/LayerPanel/__tests__/LayerPanel.iconos.test.tsx
git commit -m "feat(capas): iconos de Lucide y Forro, Exterior y Avíos en lugar de «1: Shell»"
```

---

### Task 5: Las puertas en la pantalla de María, los trinquetes y las capturas

**Files:**
- Create (test): `tests/e2e/los-paneles-a-peticion.spec.ts`
- Modify: `scripts/deploy-prod.sh` (la lista e2e del gate, detrás de `la-puerta-de-vuelta.spec.ts`)
- Modify: `tests/e2e/*-baseline.json`, solo con `*_UPDATE=1` y si bajan
- Modify: `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` § 6.1 (la nota del plan de P4)

**Interfaces:**
- Consumes: Tasks 1-4 enteras. De los helpers: `abrirAppVacia`, `abrirPanel(page, comando, titulo)`, `cambiarVista(page, '2D' | 'Split' | '3D')` de `tests/e2e/helpers/estados.ts`, y `addPiece`, `activarHerramienta`, `clickAt` de `tests/e2e/helpers/lienzo.ts`.
- Produces: el spec en el gate del deploy.

- [ ] **Step 1: El e2e de las puertas**

Crea `tests/e2e/los-paneles-a-peticion.spec.ts`:

```ts
/**
 * Los paneles a petición en la pantalla de María (spec 2026-10-02 § 6.1, P4),
 * a 1366 × 643 y entrando por sus puertas: la barrita de la pieza para
 * Propiedades, el botón del 3D para el Avatar y los comandos para Capas.
 * jsdom no ve si un campo queda tapado o recortado: esto le pregunta al
 * navegador, con `elementFromPoint`, qué pinta de verdad en cada control.
 */
import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, abrirPanel, cambiarVista } from './helpers/estados';
import { addPiece, activarHerramienta, clickAt } from './helpers/lienzo';

test.use({ viewport: { width: 1366, height: 643 } });
test.describe.configure({ timeout: 90_000 });

/** El control está a la vista: lo que pinta el navegador en su centro es él. */
async function aLaVista(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const arriba = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return arriba === el || el.contains(arriba);
  }, selector);
}

async function propiedadesDesdeLaBarrita(page: Page) {
  await abrirAppVacia(page);
  await addPiece(page, 'p1', { x: 100, y: 100 }, 300, 200);
  await activarHerramienta(page, 'z', 'select');
  await clickAt(page, { x: 250, y: 200 });
  await page.locator('.floating-action-bar').getByRole('button', { name: 'Propiedades…', exact: true }).click();
  await expect(page.locator('.context-panel__header', { hasText: 'Propiedades' })).toBeVisible();
}

test('desde la barrita, Propiedades abre con sus cuatro campos a la vista y «Producción» plegada', async ({ page }) => {
  await propiedadesDesdeLaBarrita(page);
  for (const id of ['prop-piece-name', 'prop-piece-sa', 'prop-piece-fabric', 'prop-piece-mirror']) {
    expect(await aLaVista(page, `#${id}`), id).toBe(true);
  }
  await expect(page.getByRole('button', { name: 'Producción' })).toHaveAttribute('aria-expanded', 'false');
  expect(await aLaVista(page, '#prop-piece-layer'), 'la capa se ve con «Producción» plegada').toBe(false);
});

test('«Producción» se despliega, y lo último del panel se alcanza desplazándolo', async ({ page }) => {
  await propiedadesDesdeLaBarrita(page);
  await page.getByRole('button', { name: 'Producción' }).click();
  await expect(page.getByRole('button', { name: 'Producción' })).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#prop-piece-layer').scrollIntoViewIfNeeded();
  expect(await aLaVista(page, '#prop-piece-layer')).toBe(true);
  await page.locator('.panel-delete').scrollIntoViewIfNeeded();
  expect(await aLaVista(page, '.panel-delete')).toBe(true);
});

test('el Avatar, desde su botón del 3D: siete campos, y Enter escribe la medida', async ({ page }) => {
  await abrirAppVacia(page);
  await cambiarVista(page, 'Split');
  await page.locator('.canvas-area__3d [aria-label="Avatar"]').click();
  await expect(page.locator('.context-panel__header', { hasText: 'Avatar' })).toBeVisible();
  await expect(page.locator('.ap-medidas input')).toHaveCount(7);
  expect(await aLaVista(page, '#ap-medida-height')).toBe(true);
  const estatura = page.getByLabel('Estatura', { exact: true });
  await estatura.fill('170');
  await estatura.press('Enter');
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __VINA_STORE__: { getState: () => { project: { avatar: { measurements: { height: number } } } } } })
      .__VINA_STORE__.getState().project.avatar.measurements.height)).toBe(170);
});

test('Capas: las capas en español, y ver y bloquear son iconos con nombre', async ({ page }) => {
  await abrirAppVacia(page);
  await addPiece(page, 'p1', { x: 100, y: 100 }, 300, 200);
  await abrirPanel(page, 'Capas', 'Capas');
  await expect(page.locator('.layer-group-title').first()).toHaveText('Exterior');
  const ocultar = page.getByRole('button', { name: 'Ocultar capa' }).first();
  await expect(ocultar.locator('svg')).toBeVisible();
  expect(await aLaVista(page, '.layer-group-header .layer-icon-btn')).toBe(true);
});
```

(`addPiece` de `helpers/lienzo` siembra con `layer: 1`, así que la primera capa de la lista es «Exterior».)

- [ ] **Step 2: Correrlo**

Avisa a la otra sesión y mira la memoria libre.

Run: `VINA_E2E_PORT=5181 npx playwright test tests/e2e/los-paneles-a-peticion.spec.ts --workers=1 --retries=0`
Expected: PASS, 4 tests. Si alguno cae, es un hallazgo de la puerta, no del test: reprodúcelo antes de tocar nada ([[verificar-la-puerta-no-solo-el-cuarto]]).

- [ ] **Step 3: Al gate**

En `scripts/deploy-prod.sh`, en la lista e2e, detrás de `tests/e2e/la-puerta-de-vuelta.spec.ts \`:

```bash
  tests/e2e/los-paneles-a-peticion.spec.ts \
```

Run: `bash -n scripts/deploy-prod.sh && grep -c "los-paneles-a-peticion" scripts/deploy-prod.sh`
Expected: sin errores de sintaxis; `1`. Revisa también que la línea nueva termine en `\` sin `\r` ([[un-gate-cortado-no-falla-pasa-con-menos]]).

- [ ] **Step 4: Los tres trinquetes**

Run: `VINA_E2E_PORT=5181 npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts tests/e2e/superficies-por-accion.spec.ts tests/e2e/contraste-del-cromo.spec.ts --workers=1 --retries=0`
Expected: PASS. «panel Propiedades» y «panel Capas» siguen en 0 de contraste; superficies no sube. Si algún estado baja, fíjalo con su `*_UPDATE=1 … --retries=0 --workers=1` y commitea el JSON; si sube, es un hallazgo y se arregla.

- [ ] **Step 5: La nota en la spec**

En `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md`, al final de § 6.1, una nota como las de P2c y P3c:

```markdown
**Nota del plan de P4 (2026-10-09).** Lo que § 6.1 no decía y el plan decidió:
- Con dos ranuras, el tercer panel reemplaza al último que se abrió; el primero, pegado al borde, no se mueve. Al estrechar la ventana por debajo de 1600 px se queda el último que se abrió, y al ensancharla no vuelve el otro.
- Con una pieza elegida, Propiedades no enseña la lista de costuras del proyecto (captura 08). La edición vinculada se queda en el primer nivel, y Propiedades entera va en sentence case.
- Dentro de «Producción» no hay pliegues anidados: capa y subcapa van tras una línea, y «Simulación» y «Material», con su subtítulo.
- Un campo de medida del Avatar se fija con Enter o al salir; fuera del rango se queda en el borde, y vacío vuelve al de antes. Al cerrarse el panel se apaga el modo pose.
- Las capas sin nombre puesto se llaman «Forro», «Exterior», «Avíos» y, de la 3 en adelante, «Capa N». También los glifos ▶ ▼ ☰ de Capas pasan a Lucide.
- En Split y en 3D la ranura todavía empuja el dock del 3D: el margen del 3D llega con P5.
```

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/los-paneles-a-peticion.spec.ts scripts/deploy-prod.sh docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md
git commit -m "test(e2e): los paneles a petición, por sus puertas y a 1366 × 643, al gate del deploy"
```

(Si un trinquete bajó, su `tests/e2e/*-baseline.json` va en este commit.)

- [ ] **Step 7: Las capturas**

Con el Vite del 5181 caliente, un script en el scratchpad de la sesión saca, por CDP (`Page.captureScreenshot`; `page.screenshot` se colgó en esta app), a 1366 × 643:
1. Propiedades abierta en 2D desde la barrita, con el DXF de María: los cuatro campos y «Producción» plegada. Es la captura 08, ahora de verdad;
2. «Producción» desplegada;
3. el Avatar en Split, con los siete campos;
4. Capas, con los iconos;
5. a 1680 × 900, dos paneles uno junto al otro.

Se miran antes de darlas por buenas: un panel recortado o un subtítulo apilado que se lea mal es un hallazgo. Van en el mensaje a Samuel; cuándo las ve María lo decide él.

---

## Después de las tareas

1. **Revisión final** con dos lentes Opus en paralelo, como en P3c: una ataca las premisas del plan contra la spec y el código; la otra muta el código y mira qué tests caen. A las dos se les prohíbe por escrito desplegar, empujar y correr el gate.
2. **Pase de arreglos**: cada hallazgo crítico o importante, con su test en rojo antes. Los menores quedan anotados para Samuel.
3. **Ensayo del deploy** (`bash scripts/deploy-prod.sh --ensayo`, con `VINA_E2E_PORT=5181`), coordinado con la otra sesión y con la máquina libre. No envía nada.
4. **El mensaje a Samuel**: las decisiones de este plan con su costo, los menores, las capturas, y las dos preguntas que son suyas:
   - «Pecho» o «Busto» en el Avatar;
   - «Avíos» para la capa 2, que también nombra los botones y cierres.

   Y un hallazgo del reconocimiento que P4 no arregla, porque la fila P4 no lo pide: Capas, Inspector y Marcada solo se abren desde los comandos. El menú Vina tiene Escalado, Lista de materiales, Avatar e IA y ratón, pero no esos tres, y el contrato § 6 dice que lo que solo se alcanza por la paleta no está terminado.

   Push, PR, merge y deploy esperan su orden.
