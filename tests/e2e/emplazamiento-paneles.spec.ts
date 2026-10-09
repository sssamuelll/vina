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

  test('con dos paneles, la ✕ de uno cierra ese y no el otro', async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    await abrirPanel(page, 'Capas');
    await abrirPanel(page, 'Propiedades');
    await expect(page.locator(PANEL)).toHaveCount(2);
    await page.locator(PANEL, { has: page.locator('.context-panel__header span', { hasText: 'Propiedades' }) })
      .getByRole('button', { name: 'Cerrar panel' }).click();
    await expect(page.locator(PANEL)).toHaveCount(1);
    await expect(page.locator('.context-panel__header span')).toHaveText('Capas');
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
