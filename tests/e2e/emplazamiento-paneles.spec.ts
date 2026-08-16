import { test, expect, Page } from '@playwright/test';

/**
 * Ola 2 de la Fase 3+4: los paneles contextuales dejan de flotar sobre el
 * lienzo y pasan a ser hijos flex reales de `canvas-area`, con dos ranuras
 * independientes (izquierda/derecha) en vez de una mutuamente excluyente.
 *
 * Por qué esto es un e2e y no un test de vitest: la Ola 1 llevó dentro una
 * regresión de apilamiento con 6889 tests en verde. `jsdom` no calcula layout
 * —`getBoundingClientRect()` da 0 siempre y no existe `elementFromPoint`—, así
 * que ningún test unitario puede ver si un panel encoge el lienzo, si dos
 * paneles caben, ni si algo queda encerrado. La restricción global del plan lo
 * dice sin rodeos: todo cambio de `z-index`, `isolation`, `position`,
 * `overflow` o `backdrop-filter` se fija con un e2e que mida el RESULTADO, no
 * el valor declarado. Las Tasks 8 y 9 cambiaron `position` y el modelo de
 * flujo; esto es su red.
 *
 * Compañero de `emplazamiento-modales.spec.ts`, que cubre la Ola 1.
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

async function abrirApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
  await page.waitForTimeout(500);
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
 * Abre un panel por su nombre visible, vía la paleta de comandos (⌘K). Es la
 * única puerta que alcanza los siete paneles; los docks solo llegan a algunos.
 * La paleta pasa `togglePanel`, así que abrir dos de lados distintos ejercita
 * justo lo que la ola promete.
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
    // `svg.pattern-svg` y no `.canvas-area__2d svg`: el dock de herramientas
    // vive DENTRO del panel 2D, así que ese selector matchea 17 iconos.
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

test.describe('Ola 2 — los paneles ocupan canaleta, no flotan', () => {
  test.beforeEach(async ({ page }) => {
    await abrirApp(page);
    await sembrarPieza(page);
  });

  test('abrir un panel ENCOGE el documento — no lo tapa', async ({ page }) => {
    const docAntes = await anchoDelDocumento(page);
    const lienzoAntes = await anchoDelLienzo(page);
    expect(docAntes).toBeGreaterThan(0);
    expect(lienzoAntes).toBeGreaterThan(0);

    await abrirPanel(page, 'Capas');
    await expect(page.locator(PANEL)).toHaveCount(1);

    const docDespues = await anchoDelDocumento(page);
    const lienzoDespues = await anchoDelLienzo(page);

    // El panel mide 300px fijos más su margen a cada lado. Si siguiera
    // flotando, el documento no perdería ni un píxel — que es exactamente el
    // bug que esta ola cierra. Se mide sobre la SUMA de las dos mitades: en
    // modo dividido cada mitad cede solo su parte proporcional, así que mirar
    // una sola mitad mide el reparto, no el desalojo.
    const cedido = docAntes - docDespues;
    expect(cedido).toBeGreaterThan(300);
    expect(cedido).toBeLessThan(360);

    // Y el lienzo 2D, que es lo que la usuaria mira, encoge de verdad.
    expect(lienzoDespues).toBeLessThan(lienzoAntes);
  });

  test('Capas y Propiedades conviven — el caso medido en la auditoría', async ({ page }) => {
    await abrirPanel(page, 'Capas');        // derecha
    await abrirPanel(page, 'Propiedades');  // izquierda

    await expect(page.locator(PANEL)).toHaveCount(2);

    const titulos = await page.locator('.context-panel__header span').allTextContents();
    expect(titulos).toContain('Capas');
    expect(titulos).toContain('Propiedades');

    // Y en el orden correcto: el izquierdo antes del lienzo 2D, el derecho después del 3D.
    const orden = await page.evaluate(() => {
      const area = document.querySelector('.canvas-area')!;
      return [...area.children]
        .map((c) => (typeof c.className === 'string' ? c.className.split(' ')[0] : ''))
        .filter(Boolean);
    });
    const iPanelIzq = orden.indexOf('context-panel');
    const i2d = orden.indexOf('canvas-area__2d');
    const i3d = orden.indexOf('canvas-area__3d');
    const iPanelDer = orden.lastIndexOf('context-panel');
    expect(iPanelIzq).toBeLessThan(i2d);
    expect(i3d).toBeLessThan(iPanelDer);
  });

  test('clicar dentro de un panel no cierra el otro', async ({ page }) => {
    await abrirPanel(page, 'Capas');
    await abrirPanel(page, 'Propiedades');
    await expect(page.locator(PANEL)).toHaveCount(2);

    // El cierre por clic afuera se eliminó justamente porque con dos paneles
    // montados hacía que cada uno cerrara al otro.
    await page.locator('.context-panel__header').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator(PANEL)).toHaveCount(2);

    // Y clicar el lienzo —el gesto de trabajar— tampoco los cierra.
    await page.locator('svg.pattern-svg').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);
    await expect(page.locator(PANEL)).toHaveCount(2);
  });

  test('con los dos paneles abiertos, el modo dividido no se desborda ni deja hueco', async ({ page }) => {
    await abrirPanel(page, 'Capas');
    await abrirPanel(page, 'Propiedades');
    await page.evaluate(() => {
      (window as unknown as VentanaConStore).__VINA_STORE__.dispatch({
        type: 'editor/setViewMode', payload: 'split',
      });
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
      return { suma, area: area.getBoundingClientRect().width, hijos: hijos.length };
    });

    // Cinco hijos en flujo: panel izq, 2D, divisor, 3D, panel der.
    expect(medida.hijos).toBe(5);
    // Sin desbordarse (sumar más que el contenedor) ni dejar hueco (sumar mucho menos).
    expect(medida.suma).toBeLessThanOrEqual(medida.area + 1);
    expect(medida.suma).toBeGreaterThan(medida.area - 2);
  });

  test('el panel no encierra a sus descendientes por accidente', async ({ page }) => {
    await abrirPanel(page, 'Capas');

    const sonda = await page.evaluate(() => {
      const p = document.querySelector('.context-panel') as HTMLElement;
      const s = getComputedStyle(p);
      // Un `position: fixed` dentro de un ancestro con `backdrop-filter`,
      // `transform` o `filter` se resuelve contra ESE ancestro, no contra el
      // viewport — el mecanismo que ya nos costó dos veces en la Ola 1.
      const sonda = document.createElement('div');
      sonda.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px';
      p.appendChild(sonda);
      const r = sonda.getBoundingClientRect();
      sonda.remove();
      return {
        position: s.position,
        zIndex: s.zIndex,
        backdropFilter: s.backdropFilter,
        overflowY: s.overflowY,
        flexBasis: s.flexBasis,
        // Si el panel es bloque contenedor, la sonda NO cae en (0,0).
        sondaEnOrigen: Math.abs(r.top) < 1 && Math.abs(r.left) < 1,
      };
    });

    // Lo que la Task 8 prometió: dejó de estar posicionado, así que su
    // z-index dejó de significar nada y se eliminó.
    expect(sonda.position).toBe('static');
    expect(sonda.zIndex).toBe('auto');
    expect(sonda.flexBasis).toBe('300px');

    // Y lo que hay que saber a ciencia cierta, no suponer: el panel conserva
    // el material `overlay` por mandato de la spec, y ese material lleva
    // `backdrop-filter`. Si lo lleva, ES bloque contenedor, y cualquier
    // superficie `position: fixed` que se renderice DESDE DENTRO de un panel
    // necesita portal a `document.body`. Este aserto documenta cuál de las dos
    // realidades es la vigente en vez de dejarlo a la suerte.
    if (sonda.backdropFilter !== 'none') {
      expect(sonda.sondaEnOrigen).toBe(false);
    } else {
      expect(sonda.sondaEnOrigen).toBe(true);
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
    // El menú se posiciona con las coordenadas de viewport del clic. Si el
    // panel es su bloque contenedor, aterriza desplazado por el origen del
    // panel en vez de bajo el cursor.
    expect(Math.abs(r.x - puntoX)).toBeLessThan(30);
    expect(Math.abs(r.y - puntoY)).toBeLessThan(30);

    // Y no puede quedar recortado por el `overflow-y: auto` del panel.
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

  test('ajustar a la vista respeta la faja del dock 2D — el patrón no queda tapado', async ({ page }) => {
    // Pieza deliberadamente ancha y baja (5000×200). computeFitView calcula
    // una bbox ÚNICA sobre TODAS las piezas del proyecto, y el beforeEach de
    // este describe ya sembró "panel-rect" (300×400 en x:120-420, y:120-520)
    // antes de que esta pieza se agregue — la bbox real que ve el fit es la
    // combinada: x:0-5000, y:0-520, aspecto ~9.6:1. Sigue siendo muchísimo
    // más extremo que el de cualquier viewport de test razonable, así que el
    // ancho manda igual y el caso discrimina el arreglo sin depender del
    // tamaño exacto de la ventana. Task 10 — jsdom no puede ver dónde cae el
    // patrón; este e2e es lo único que de verdad prueba que el dock deja de
    // tapar el borde.
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

    const bordeIzquierdoDelPatron = await page.evaluate(() => {
      const g = document.querySelector('[data-piece-id="ancha-baja"]');
      return g ? g.getBoundingClientRect().left : -1;
    });
    const bordeDerechoDelDock = await page.evaluate(() => {
      const dock = document.querySelector('.dock--left');
      return dock ? dock.getBoundingClientRect().right : -1;
    });

    expect(bordeIzquierdoDelPatron).toBeGreaterThan(0);
    expect(bordeDerechoDelDock).toBeGreaterThan(0);
    expect(bordeIzquierdoDelPatron).toBeGreaterThan(bordeDerechoDelDock);
  });
});
