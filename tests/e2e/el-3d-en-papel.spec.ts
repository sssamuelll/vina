import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, cargarDxfDeMaria, cambiarVista, reposo } from './helpers/estados';
import { dispatch } from './helpers/lienzo';
import { abrirSubmenuDeVina } from './helpers/diagnostico';

/**
 * El 3D y el Split en papel (spec 2026-10-02 «la interfaz en papel» § 4.2, § 4.3,
 * § 4.5, § 5.3 y § 6.1, P5), medidos en la pantalla de María (1366 × 643) con su
 * patrón real: el escenario es el papel de la hoja, con una línea de pelo entre
 * las dos vistas; las herramientas del 3D son un margen pegado al borde que no se
 * mueve cuando se abre un panel; lo que se ve de la prenda vive en la barra
 * superior; y la voz de la vista y el estado de la simulación, en la línea al pie.
 *
 * jsdom no calcula layout ni pinta: las cajas, el fondo que de verdad se ve y lo
 * que se recorta solo existen aquí. Sin capturas: en esta app `page.screenshot`
 * se cuelga después de «fonts loaded» (2026-10-04).
 */
test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });

const MARIA = { width: 1366, height: 643 };
/** El papel de la hoja (`--canvas-2d`), tal como lo calcula el navegador. */
const PAPEL = 'rgb(250, 244, 227)';

interface VentanaConStore {
  __VINA_STORE__: { getState: () => { renderSettings: { backgroundMode: string; avatarRenderStyle: string }; simulation: { simulationState: string } } };
}
const render = (page: Page) =>
  page.evaluate(() => (window as unknown as VentanaConStore).__VINA_STORE__.getState().renderSettings);

async function abrirConElPatron(page: Page, vista: '2D' | 'Split' | '3D' = 'Split') {
  await page.setViewportSize(MARIA);
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await cambiarVista(page, vista);
  await reposo(page);
}

const caja = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
  }, selector);

const MARGEN = 'nav[aria-label="Herramientas del 3D"]';

test('el escenario es el papel de la hoja, y entre las dos vistas hay una línea de pelo', async ({ page }) => {
  await abrirConElPatron(page, 'Split');

  // El lienzo es transparente de fábrica (`scene.background` pasa por el mapeo de
  // tonos y un #faf4e3 sale #e1e0da): el papel lo pone el CSS que tiene detrás.
  expect((await render(page)).backgroundMode, 'el lienzo no es transparente de fábrica').toBe('transparent');
  const f = await page.evaluate(() => {
    const divisor = document.querySelector('.canvas-area__divider')!;
    return {
      escenario: getComputedStyle(document.querySelector('.canvas-area__3d')!).backgroundColor,
      hoja: getComputedStyle(document.querySelector('.canvas-area__2d')!).backgroundColor,
      divisor: getComputedStyle(divisor).backgroundColor,
      linea: getComputedStyle(divisor, '::after').width,
      cursor: getComputedStyle(divisor).cursor,
      ancho: divisor.getBoundingClientRect().width,
    };
  });
  expect(f.escenario, 'el escenario no es el papel').toBe(PAPEL);
  expect(f.hoja, 'la hoja no es el papel').toBe(PAPEL);
  // La franja de 4 px pinta el papel, no lo negro de detrás; lo que se ve es la
  // línea de 1 px del centro. Y sigue siendo arrastrable.
  expect(f.divisor, 'el divisor es una franja oscura').toBe(PAPEL);
  expect(f.linea, 'lo que se ve no es una línea de 1 px').toBe('1px');
  expect(f.ancho, 'el área de agarre ya no son 4 px').toBe(4);
  expect(f.cursor).toBe('col-resize');

  const antes = await page.evaluate(() => (window as unknown as { __VINA_STORE__: { getState: () => { layout: { splitRatio: number } } } }).__VINA_STORE__.getState().layout.splitRatio);
  const d = (await caja(page, '.canvas-area__divider'))!;
  await page.mouse.move(d.left + 2, 300);
  await page.mouse.down();
  await page.mouse.move(d.left + 2 - 120, 300, { steps: 6 });
  await page.mouse.up();
  const despues = await page.evaluate(() => (window as unknown as { __VINA_STORE__: { getState: () => { layout: { splitRatio: number } } } }).__VINA_STORE__.getState().layout.splitRatio);
  expect(despues, 'arrastrar el divisor no reparte las vistas').toBeLessThan(antes);

  // En 3D solo no hay divisor, y el escenario sigue siendo el papel.
  await cambiarVista(page, '3D');
  expect(await page.locator('.canvas-area__divider').count()).toBe(0);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.canvas-area__3d')!).backgroundColor)).toBe(PAPEL);
});

test('el margen del 3D: pegado al borde, con sus cuatro herramientas, y no se mueve cuando se abre un panel', async ({ page }) => {
  await abrirConElPatron(page, 'Split');

  for (const vista of ['Split', '3D'] as const) {
    await cambiarVista(page, vista);
    await reposo(page);
    const antes = (await caja(page, MARGEN))!;
    expect(antes, `${vista}: no hay margen del 3D`).not.toBeNull();
    expect(Math.round(antes.right), `${vista}: su borde derecho no es el de la ventana`).toBe(MARIA.width);
    expect(antes.width, `${vista}: mide menos de 44 px`).toBeGreaterThanOrEqual(44);
    for (const nombre of ['Colocar', 'Coser', 'Simular', 'Avatar']) {
      await expect(page.locator(`${MARGEN} [aria-label="${nombre}"]`), `${vista}: falta «${nombre}»`).toBeVisible();
    }
    // Ya no es un dock flotante dentro del escenario: es una columna de la ventana.
    expect(await page.locator('.canvas-area__3d nav[aria-label="Herramientas del 3D"]').count(), `${vista}: sigue dentro del escenario`).toBe(0);
    const escenarioAntes = (await caja(page, '.canvas-area__3d'))!;

    await page.locator(`${MARGEN} [aria-label="Avatar"]`).click();
    await expect(page.locator('.context-panel')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(400);
    const despues = (await caja(page, MARGEN))!;
    const panel = (await caja(page, '.context-panel'))!;
    const escenarioDespues = (await caja(page, '.canvas-area__3d'))!;
    expect(despues.left, `${vista}: el margen se movió al abrir el panel`).toBe(antes.left);
    expect(despues.width, `${vista}: el margen cambió de ancho`).toBe(antes.width);
    expect(panel.right, `${vista}: el panel tapa al margen o queda detrás de él`).toBeLessThanOrEqual(despues.left + 1);
    expect(panel.left, `${vista}: el panel no queda entre el escenario y el margen`).toBeGreaterThanOrEqual(escenarioDespues.right - 1);
    // El panel le quita el ancho al escenario, no al margen.
    expect(escenarioDespues.width, `${vista}: el escenario no se estrechó`).toBeLessThan(escenarioAntes.width);

    await page.keyboard.press('Escape');
    await expect(page.locator('.context-panel')).toHaveCount(0, { timeout: 10_000 });
  }
});

test('lo que se ve de la prenda sube a la barra superior: está en Split y en 3D, no en 2D, y el avatar se oculta y vuelve', async ({ page }) => {
  await abrirConElPatron(page, 'Split');
  const grupo = () => page.getByRole('group', { name: 'Qué se ve de la prenda' });

  for (const vista of ['Split', '3D'] as const) {
    await cambiarVista(page, vista);
    await expect(grupo(), `${vista}: falta el grupo de la prenda`).toBeVisible();
    await expect(grupo().getByRole('button', { name: 'Mostrar avatar' })).toBeVisible();
    await expect(grupo().getByRole('button', { name: /^Modo de superficie:/ })).toBeVisible();
    await expect(grupo().getByRole('button', { name: 'Mapa', exact: true })).toBeVisible();
    // Vive en la barra superior, no sobre el visor.
    const dentroDeLaBarra = await page.evaluate(() => document.querySelector('.top-bar')!.contains(document.querySelector('[aria-label="Qué se ve de la prenda"]')));
    expect(dentroDeLaBarra, `${vista}: el grupo no está en la barra superior`).toBe(true);
  }
  await cambiarVista(page, '2D');
  await expect(grupo(), '2D: no hay prenda que mirar').toHaveCount(0);

  // El interruptor del avatar: oculta y devuelve, con una sola fuente en el store.
  await cambiarVista(page, 'Split');
  const avatar = page.getByRole('button', { name: 'Mostrar avatar' });
  await expect(avatar).toHaveAttribute('aria-pressed', 'true');
  await avatar.click();
  expect((await render(page)).avatarRenderStyle).toBe('hidden');
  await expect(avatar).toHaveAttribute('aria-pressed', 'false');
  await avatar.click();
  expect((await render(page)).avatarRenderStyle).not.toBe('hidden');
  await expect(avatar).toHaveAttribute('aria-pressed', 'true');
});

test('«Mapa»: apagado antes de simular, con los cuatro mapas de siempre al simular, y Esc lo cierra', async ({ page }) => {
  await abrirConElPatron(page, 'Split');
  const hoja = page.locator('.menu-de-mapas__hoja');
  const disparador = page.getByRole('button', { name: 'Mapa', exact: true });

  // En reposo se ve apagado, pero se abre: así se descubre que existen.
  await expect(page.locator('.menu-de-mapas__disparador--apagado')).toHaveCount(1);
  await disparador.click();
  await expect(hoja).toBeVisible();
  await expect(page.locator('.menu-de-mapas__elemento:disabled'), 'en reposo los cuatro mapas están apagados').toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(hoja, 'Esc no cierra el menú').toHaveCount(0);

  // Con la simulación en marcha, los cuatro con los `title` de siempre (los e2e de los mapas los buscan por ahí).
  await dispatch(page, 'simulation/startSimulation');
  await disparador.click();
  await expect(hoja).toBeVisible();
  for (const titulo of ['Mapa de tensión (Alt+6)', 'Mapa de estiramiento (Alt+7)', 'Mapa de ajuste (Alt+8)', 'Puntos de presión (Alt+9)']) {
    await expect(page.locator(`button[title="${titulo}"]`), `falta «${titulo}»`).toBeEnabled();
  }
  // La hoja es papel y cuelga de <body>: ninguna superficie del marco la tapa.
  const alcanzable = await page.evaluate(() => {
    const h = document.querySelector('.menu-de-mapas__hoja')!;
    const r = h.getBoundingClientRect();
    return { papel: h.getAttribute('data-material'), padre: h.parentElement === document.body, encima: document.elementFromPoint(r.left + r.width / 2, r.top + 12)?.closest('.menu-de-mapas__hoja') !== null };
  });
  expect(alcanzable).toEqual({ papel: 'papel', padre: true, encima: true });
  await page.keyboard.press('Escape');
  await expect(hoja).toHaveCount(0);
  await dispatch(page, 'simulation/resetSimulation');
});

test('«Capturar visor 3D» sale al menú Archivo: apagado con la vista 2D, y ya no hay botón sobre el visor', async ({ page }) => {
  await abrirConElPatron(page, 'Split');
  // Ya no hay barra oscura de mapas ni botón de captura sobre el visor.
  expect(await page.locator('.canvas-area__3d button[aria-label="Capturar visor 3D"]').count()).toBe(0);
  const item = page.locator('.logo-menu__submenu .logo-menu__item', { hasText: 'Capturar visor 3D' });

  await abrirSubmenuDeVina(page, 'Archivo');
  await expect(item, 'el menú Archivo no trae «Capturar visor 3D»').toBeVisible({ timeout: 10_000 });
  await expect(item).not.toHaveClass(/logo-menu__item--disabled/);
  await page.keyboard.press('Escape');

  await cambiarVista(page, '2D');
  await abrirSubmenuDeVina(page, 'Archivo');
  await expect(item).toBeVisible({ timeout: 10_000 });
  await expect(item, 'con la vista 2D no hay visor que capturar').toHaveClass(/logo-menu__item--disabled/);
});

test('el pie lleva la sección del 3D con la voz de la vista: en Split y en 3D, no en 2D', async ({ page }) => {
  await abrirConElPatron(page, 'Split');
  const seccion = () => page.locator('.linea-al-pie').getByRole('group', { name: 'Vista 3D' });
  const voz = 'Clic derecho orbita · clic central o Alt + arrastrar panea';

  await expect(seccion(), 'Split: falta la sección del 3D').toBeVisible();
  await expect(seccion()).toContainText(voz);
  expect(await page.locator('.seccion-del-patron').count(), 'Split: la sección del patrón sigue').toBe(1);
  const split = await page.evaluate(() => {
    const patron = document.querySelector('.linea-al-pie__patron')!.getBoundingClientRect();
    const tres = document.querySelector('.linea-al-pie__3d')!.getBoundingClientRect();
    const texto = document.querySelector<HTMLElement>('.seccion-del-3d__texto')!;
    return { patronRight: patron.right, tresLeft: tres.left, tresRight: tres.right, recortada: texto.scrollWidth > texto.clientWidth + 1, patronAncho: patron.width };
  });
  expect(split.tresLeft, 'las dos secciones se solapan').toBeGreaterThanOrEqual(split.patronRight - 1);
  expect(Math.round(split.tresRight), 'la del 3D no llega al borde').toBe(MARIA.width);
  expect(split.recortada, 'la voz de la vista no cabe a 1366 px').toBe(false);
  expect(split.patronAncho, 'el patrón bajó de 320 px').toBeGreaterThanOrEqual(320);

  // Con una herramienta activa, su nombre y su frase.
  await dispatch(page, 'tools/setActiveTool3D', 'pin');
  await expect(seccion().locator('.seccion-del-3d__nombre')).toHaveText('Fijar');
  await expect(seccion()).toContainText('Clic en la tela para fijar un punto');
  await dispatch(page, 'tools/setActiveTool3D', 'camera');

  await cambiarVista(page, '3D');
  await expect(seccion(), '3D: falta la sección del 3D').toBeVisible();
  expect(await page.locator('.seccion-del-patron').count(), '3D: la sección del patrón se pinta').toBe(0);
  const solo = await page.evaluate(() => {
    const tres = document.querySelector('.linea-al-pie__3d')!.getBoundingClientRect();
    return { left: tres.left, right: tres.right, borde: getComputedStyle(document.querySelector('.linea-al-pie__3d')!).borderLeftWidth, patron: getComputedStyle(document.querySelector('.linea-al-pie__patron')!).display };
  });
  expect(Math.round(solo.left), '3D solo: la sección no ocupa todo el pie').toBe(0);
  expect(Math.round(solo.right)).toBe(MARIA.width);
  expect(solo.borde, '3D solo: queda la línea de pelo que la separaba del patrón').toBe('0px');
  expect(solo.patron, '3D solo: la ranura del patrón no se esconde').toBe('none');

  await cambiarVista(page, '2D');
  await expect(seccion(), '2D: no hay sección del 3D').toHaveCount(0);
  expect(await page.locator('.seccion-del-patron').count(), '2D: falta la sección del patrón').toBe(1);
});

test('a 1000 px el estado de la simulación sigue entero y la frase del patrón conserva 200 px', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 643 });
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await cambiarVista(page, 'Split');
  await reposo(page);
  // La voz más larga (Fijar) y el estado a la vista: lo más ancho que puede pasar.
  await dispatch(page, 'tools/setActiveTool3D', 'pin');
  await dispatch(page, 'simulation/startSimulation');
  const estado = page.getByRole('button', { name: 'Estado de la simulación' });
  await expect(estado, 'no hay estado de la simulación').toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const boton = document.querySelector<HTMLElement>('.seccion-del-3d__boton')!;
    const b = boton.getBoundingClientRect();
    const frase = document.querySelector<HTMLElement>('.seccion-del-patron__frase')!;
    const texto = document.querySelector<HTMLElement>('.seccion-del-3d__texto')!;
    return {
      botonRight: b.right, botonRecortado: boton.scrollWidth > boton.clientWidth + 1, ventana: window.innerWidth,
      frasePatron: frase.getBoundingClientRect().width,
      vozAncho: texto.getBoundingClientRect().width,
    };
  });
  expect(m.botonRecortado, 'el estado de la simulación se recorta').toBe(false);
  expect(m.botonRight, 'el estado se sale de la ventana').toBeLessThanOrEqual(m.ventana);
  expect(m.frasePatron, 'la frase del patrón bajó de 200 px').toBeGreaterThanOrEqual(200);
  expect(m.vozAncho, 'la voz del 3D desapareció en vez de cortarse').toBeGreaterThan(0);
  // Si algo tiene que ceder, es la voz del 3D (con puntos suspensivos): el estado no se encoge.
  // Que quepa entera o no depende de lo ancho que sea el motor; lo que no puede pasar es lo de arriba.
  await dispatch(page, 'simulation/resetSimulation');
});
