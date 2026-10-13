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
  __VINA_STORE__: { getState: () => { renderSettings: { backgroundMode: string; avatarRenderStyle: string }; simulation: { simulationState: string; viewMode3D: string } } };
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
  // Y está anclada bajo su disparador, alineada a su borde derecho: no pegada a una esquina de la ventana.
  const ancla = await page.evaluate(() => {
    const h = document.querySelector('.menu-de-mapas__hoja')!.getBoundingClientRect();
    const d = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Mapa')!.getBoundingClientRect();
    return { separacion: h.top - d.bottom, desfaseDerecho: Math.abs(h.right - d.right) };
  });
  expect(ancla.separacion, 'la hoja no está justo debajo de «Mapa»').toBeGreaterThanOrEqual(0);
  expect(ancla.separacion, 'la hoja no está justo debajo de «Mapa»').toBeLessThan(12);
  expect(ancla.desfaseDerecho, 'la hoja no se alinea con el borde derecho de «Mapa»').toBeLessThan(2);
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

test('«Capturar visor 3D» saca el visor sobre el papel: la captura sale con el color de la hoja, no transparente ni oscura', async ({ page }) => {
  // Revisión final de P5 (B-2): nada ejercía el camino menú → puente → visor → papel. Si se perdía el
  // registro del visor, el ítem era una puerta muerta y callada; si se perdía la composición, o el lienzo
  // dejaba de ser transparente, la captura salía sin fondo o negra, y ningún test lo veía.
  await abrirConElPatron(page, 'Split');
  // La descarga es un <a download> con una URL de datos: se intercepta el clic y se lee la imagen en la página.
  await page.evaluate(() => {
    const w = window as unknown as { __descarga?: { download: string; href: string } };
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { w.__descarga = { download: this.download, href: this.href }; };
  });
  await abrirSubmenuDeVina(page, 'Archivo');
  const item = page.locator('.logo-menu__submenu .logo-menu__item', { hasText: 'Capturar visor 3D' });
  await expect(item).toBeVisible({ timeout: 10_000 });
  await item.click();

  await expect.poll(
    () => page.evaluate(() => (window as unknown as { __descarga?: { download: string } }).__descarga?.download ?? null),
    { message: 'el ítem no sacó ninguna captura', timeout: 10_000 },
  ).toMatch(/^vina-visor-3d-\d+\.png$/);
  const imagen = await page.evaluate(async () => {
    const { href } = (window as unknown as { __descarga: { href: string } }).__descarga;
    const img = new Image();
    img.src = href;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return { ancho: img.naturalWidth, alto: img.naturalHeight, esquina: [...ctx.getImageData(1, 1, 1, 1).data] };
  });
  expect(imagen.ancho, 'la captura salió vacía').toBeGreaterThan(100);
  expect(imagen.alto).toBeGreaterThan(100);
  expect(imagen.esquina, 'la esquina de la captura no es el papel de la hoja (250, 244, 227)').toEqual([250, 244, 227, 255]);
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

test('el pie reparte el ancho como dice la spec: el patrón ocupa lo que necesita y la voz del 3D es lo primero que se recorta', async ({ page }) => {
  // Spec § 5.3: «la herramienta del patrón ocupa lo que necesita; la sección del 3D, lo que
  // sobra, y es la primera que se recorta». Con el reparto del plan (el patrón se quedaba con
  // lo que sobraba del 3D) la frase de Línea interna y la de Margen de costura se cortaban en
  // Split a 1366: la pista «entera en una línea» de P2b (`linea-al-pie`, F2, `las-siete-puertas`).
  await abrirConElPatron(page, 'Split');
  const medir = () => page.evaluate(() => {
    const frase = document.querySelector<HTMLElement>('.seccion-del-patron__texto');
    const voz = document.querySelector<HTMLElement>('.seccion-del-3d__texto');
    const tres = document.querySelector<HTMLElement>('.linea-al-pie__3d')!.getBoundingClientRect();
    return {
      frase: frase ? { recortada: frase.scrollWidth > frase.clientWidth + 1, ancho: frase.clientWidth } : null,
      voz: voz ? { recortada: voz.scrollWidth > voz.clientWidth + 1 } : null,
      tresAncho: tres.width, tresDerecha: tres.right, ventana: window.innerWidth,
    };
  });

  // Con una frase corta sobra sitio: la voz del 3D se lee entera.
  const corta = await medir();
  expect(corta.frase!.recortada, 'Seleccionar: la frase del patrón se cortó').toBe(false);
  expect(corta.voz!.recortada, 'Seleccionar: sobra sitio y la voz del 3D se cortó').toBe(false);

  // Con la más larga (Línea interna, 1166 px con sus opciones) la voz cede y la frase queda entera.
  await page.locator('nav.margen .dock__tool[aria-label^="Línea interna"]').first().click();
  await page.waitForTimeout(500);
  const larga = await medir();
  expect(larga.frase!.recortada, 'Línea interna: la frase del patrón se cortó mientras la voz del 3D tenía sitio').toBe(false);
  expect(larga.voz!.recortada, 'Línea interna: la voz del 3D debía ceder primero').toBe(true);
  expect(Math.round(larga.tresDerecha), 'la sección del 3D no llega al borde').toBe(MARIA.width);

  // Margen de costura: la otra frase larga, que quedaba a 2 px de caber.
  await page.locator('nav.margen .dock__tool[aria-label^="Margen de costura"]').first().click();
  await page.waitForTimeout(500);
  expect((await medir()).frase!.recortada, 'Margen de costura: la frase del patrón se cortó').toBe(false);

  // Con el estado de la simulación a la vista (al pie del margen del 3D desde el 2026-10-11),
  // la frase del patrón sigue entera: el estado ya no le quita ancho al pie.
  await page.locator('nav.margen .dock__tool[aria-label^="Línea interna"]').first().click();
  await dispatch(page, 'tools/setActiveTool3D', 'steamBrush');
  await expect(page.locator(`${MARGEN} button[aria-label^="Estado de la simulación"]`)).toBeVisible();
  await page.waitForTimeout(400);
  const conEstado = await medir();
  expect(conEstado.frase!.recortada, 'con el estado a la vista, la frase del patrón se cortó').toBe(false);
  await dispatch(page, 'tools/setActiveTool3D', 'camera');
});

test('la voz del 3D cede recortándose: su nombre nunca se sale de su voz ni de la ventana', async ({ page }) => {
  // Revisión final de P5 (A4): la caja de la voz medía 0 px, pero el nombre de la herramienta no se
  // encogía y se desbordaba: a 1366 en Split, con Piquete y la Plancha a vapor, «Plancha a vapor» se
  // pintaba encima de «En reposo», el estado que entonces vivía a su derecha. Desde el 2026-10-11 el
  // estado va al pie del margen del 3D, pero el nombre sigue sin poder salirse de su voz: se mide en
  // reposo (con una herramienta sin soporte, que es cuando el estado se ve) y con la simulación en marcha.
  await abrirConElPatron(page, 'Split');
  const estado = page.locator(`${MARGEN} button[aria-label^="Estado de la simulación"]`);
  const comprobar = async (donde: string) => {
    const m = await page.evaluate(() => {
      const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, right: b.right }; };
      return { quien: r('.seccion-del-3d__quien'), voz: r('.seccion-del-3d__voz'), tres: r('.linea-al-pie__3d'), ventana: window.innerWidth };
    });
    expect(m.quien, `${donde}: no hay nombre`).not.toBeNull();
    expect(m.quien!.right, `${donde}: el nombre se desborda de su voz`).toBeLessThanOrEqual(m.voz!.right + 1);
    expect(m.quien!.right, `${donde}: el nombre se sale de la sección del 3D`).toBeLessThanOrEqual(m.tres!.right + 1);
    expect(m.quien!.right, `${donde}: el nombre se sale de la ventana`).toBeLessThanOrEqual(m.ventana);
  };
  for (const herramientaDelMargen of ['Piquete', 'Línea interna']) {
    await page.locator(`nav.margen:not(.margen--derecho) .dock__tool[aria-label^="${herramientaDelMargen}"]`).first().click();
    for (const tool3D of ['steamBrush', 'meshGrab']) {
      await dispatch(page, 'tools/setActiveTool3D', tool3D);
      await expect(estado).toBeVisible();
      await page.waitForTimeout(250);
      await comprobar(`${herramientaDelMargen} + ${tool3D} en reposo`);
    }
    await dispatch(page, 'simulation/startSimulation');
    for (const tool3D of ['pin', 'arrangement', 'steamBrush', 'meshGrab']) {
      await dispatch(page, 'tools/setActiveTool3D', tool3D);
      await expect(estado).toBeVisible();
      await page.waitForTimeout(250);
      await comprobar(`${herramientaDelMargen} + ${tool3D} simulando`);
    }
    await dispatch(page, 'simulation/resetSimulation');
    await dispatch(page, 'tools/setActiveTool3D', 'camera');
  }
});

test('tras elegir con el ratón en «Mapa» o en «Texturizado», Espacio sigue siendo el atajo de la simulación', async ({ page }) => {
  // Revisión final de P5 (B-1): el menú devolvía el foco a su disparador tras CUALQUIER clic. El grupo de la
  // prenda es una botonera, así que Espacio pasaba a ser «del botón»: reabría el menú y el atajo no llegaba.
  // `sim.toggle` (Espacio) es el botón «Simular»: corre o pausa (desde el 2026-10-11; antes, ya arrancada,
  // la devolvía a reposo y Samuel lo vivió como «se reinicia»). Que llegó se lee en el estado: corriendo →
  // en pausa → corriendo.
  await abrirConElPatron(page, 'Split');
  const sim = () => page.evaluate(() => {
    const s = (window as unknown as VentanaConStore).__VINA_STORE__.getState().simulation;
    return { estado: s.simulationState, modo: s.viewMode3D };
  });
  await dispatch(page, 'simulation/startSimulation');
  await expect.poll(sim).toEqual({ estado: 'running', modo: 'arrange' });

  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await page.locator('button[title="Mapa de tensión (Alt+6)"]').click();
  await expect(page.locator('.menu-de-mapas__hoja')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.closest('[data-botonera]') != null), 'el menú dejó el foco en un botón de la barra').toBe(false);
  await page.keyboard.press('Space');
  await expect.poll(sim, { message: 'Espacio no llegó al atajo de la simulación tras elegir un mapa con el ratón' }).toEqual({ estado: 'paused', modo: 'arrange' });

  await page.getByRole('button', { name: /^Modo de superficie:/ }).click();
  await page.getByRole('button', { name: 'Plano', exact: true }).click();
  await expect(page.locator('.surface-pill__flyout')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.closest('[data-botonera]') != null), 'el menú dejó el foco en un botón de la barra').toBe(false);
  await page.keyboard.press('Space');
  await expect.poll(sim, { message: 'Espacio no llegó al atajo de la simulación tras elegir un modo de superficie con el ratón' }).toEqual({ estado: 'running', modo: 'arrange' });
});

test('a 1000 px la frase del patrón conserva 200 px y el estado de la simulación se ve entero al pie del margen', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 643 });
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await cambiarVista(page, 'Split');
  await reposo(page);
  // La voz más larga (Fijar) y el estado a la vista: lo más apretado que puede pasar.
  await dispatch(page, 'tools/setActiveTool3D', 'pin');
  await dispatch(page, 'simulation/startSimulation');
  const estado = page.locator(`${MARGEN} button[aria-label^="Estado de la simulación"]`);
  await expect(estado, 'no hay estado de la simulación').toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);
  const m = await page.evaluate((selMargen) => {
    const margen = document.querySelector(selMargen)!.getBoundingClientRect();
    const boton = document.querySelector<HTMLElement>(`${selMargen} button[aria-label^="Estado de la simulación"]`)!;
    const b = boton.getBoundingClientRect();
    const encima = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const frase = document.querySelector<HTMLElement>('.seccion-del-patron__frase')!;
    const texto = document.querySelector<HTMLElement>('.seccion-del-3d__texto')!;
    return {
      dentroDelMargen: b.left >= margen.left - 0.5 && b.right <= margen.right + 0.5 && b.bottom <= margen.bottom + 0.5,
      aLaVista: encima !== null && boton.contains(encima),
      ventana: window.innerWidth, botonRight: b.right,
      frasePatron: frase.getBoundingClientRect().width,
      vozAncho: texto.getBoundingClientRect().width,
    };
  }, MARGEN);
  expect(m.dentroDelMargen, 'el estado se sale de la columna del 3D').toBe(true);
  expect(m.aLaVista, 'algo tapa el estado de la simulación').toBe(true);
  expect(m.botonRight, 'el estado se sale de la ventana').toBeLessThanOrEqual(m.ventana);
  expect(m.frasePatron, 'la frase del patrón bajó de 200 px').toBeGreaterThanOrEqual(200);
  expect(m.vozAncho, 'la voz del 3D desapareció en vez de cortarse').toBeGreaterThan(0);
  await dispatch(page, 'simulation/resetSimulation');
});

test('la línea al pie es papel, con los colores del margen de herramientas, en las tres vistas', async ({ page }) => {
  // Enmienda 2026-10-11. Samuel, con P5 desplegada: «me equivoqué con la línea al pie … creo que va
  // mejor en los colores de la barra de herramientas: Herramientas del patrón». Se mide lo que pinta el
  // navegador: el fondo y la tinta del pie contra los del margen, y su borde de arriba, una línea de pelo.
  await abrirConElPatron(page, '2D');
  for (const vista of ['2D', 'Split', '3D'] as const) {
    await cambiarVista(page, vista);
    await page.waitForTimeout(300);
    const c = await page.evaluate(() => {
      const pie = document.querySelector<HTMLElement>('.linea-al-pie')!;
      const margen = document.querySelector<HTMLElement>('nav.margen')!;
      // La línea de pelo del margen: la del patrón está a su derecha; con la vista 3D sola solo
      // queda el del 3D, que la lleva a su izquierda.
      const delPatron = document.querySelector('nav.margen:not(.margen--derecho)');
      const del3D = document.querySelector('nav.margen.margen--derecho');
      const p = getComputedStyle(pie);
      return {
        material: pie.getAttribute('data-material'),
        fondo: p.backgroundColor, fondoDelMargen: getComputedStyle(margen).backgroundColor,
        tinta: p.color, tintaDelMargen: getComputedStyle(margen).color,
        borde: `${p.borderTopWidth} ${p.borderTopStyle} ${p.borderTopColor}`,
        bordeDelMargen: delPatron ? getComputedStyle(delPatron).borderRightColor : getComputedStyle(del3D!).borderLeftColor,
        barra: getComputedStyle(document.querySelector('.top-bar')!).backgroundColor,
      };
    });
    expect(c.material, `${vista}: el pie no lleva el ámbito de papel`).toBe('papel');
    expect(c.fondo, `${vista}: el pie no es el papel`).toBe(PAPEL);
    expect(c.fondo, `${vista}: el pie no es del color del margen`).toBe(c.fondoDelMargen);
    expect(c.fondo, `${vista}: el pie sigue siendo del material de la barra superior`).not.toBe(c.barra);
    expect(c.tinta, `${vista}: la tinta del pie no es la del margen`).toBe(c.tintaDelMargen);
    expect(c.borde, `${vista}: arriba no hay una línea de pelo`).toBe(`1px solid ${c.bordeDelMargen}`);
  }
});

test('el estado de la simulación vive al pie del margen del 3D: un icono que despliega el detalle a su izquierda', async ({ page }) => {
  // Enmienda 2026-10-11. Samuel pidió los mensajes del simulador «en otro lado o que sea muy muy pequeño
  // tipo un par de iconos o algo así y expandible», y de las dos maquetas eligió la del margen.
  await abrirConElPatron(page, 'Split');
  await dispatch(page, 'simulation/startSimulation');
  const estado = page.locator(`${MARGEN} button[aria-label^="Estado de la simulación"]`);
  await expect(estado, 'no hay estado de la simulación en el margen').toBeVisible({ timeout: 10_000 });
  const detalle = page.getByRole('group', { name: 'Detalle de la simulación' });

  const caja = await page.evaluate((selMargen) => {
    const margen = document.querySelector(selMargen)!;
    const botones = [...margen.querySelectorAll('button')];
    const b = botones[botones.length - 1].getBoundingClientRect();
    const m = margen.getBoundingClientRect();
    const pie = document.querySelector('.linea-al-pie')!;
    return {
      ultimo: botones[botones.length - 1].getAttribute('aria-label') ?? '',
      alPie: m.bottom - b.bottom, ancho: b.width,
      enElPie: pie.querySelector('[aria-label^="Estado de la simulación"]') !== null || /Preparando la tela|Simulando|En pausa/.test(pie.textContent ?? ''),
    };
  }, MARGEN);
  expect(caja.ultimo, 'el estado no es lo último del margen').toMatch(/^Estado de la simulación/);
  expect(caja.alPie, 'el estado no está al pie de la columna').toBeLessThanOrEqual(12);
  expect(caja.ancho, 'el estado no es un icono del margen').toBeLessThanOrEqual(44);
  expect(caja.enElPie, 'la línea al pie sigue diciendo el estado').toBe(false);

  // Un aviso no cae encima del icono: con el visor a la vista los avisos se apartan a la izquierda
  // del margen. A 16 px del borde se tragaban sus clics de 3 a 5 s, justo cuando sale el aviso de
  // una costura que no cose (revisión del 2026-10-11).
  await dispatch(page, 'copilotUI/showToast', { type: 'error', message: 'Una costura no se pudo coser', duration: 0 });
  await expect(page.locator('.toast')).toBeVisible();
  const conAviso = await page.evaluate((selMargen) => {
    const margen = document.querySelector(selMargen)!;
    const botones = [...margen.querySelectorAll('button')];
    const icono = botones[botones.length - 1];
    const b = icono.getBoundingClientRect();
    const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      aLaVista: e !== null && icono.contains(e),
      avisoDerecha: document.querySelector('.toast')!.getBoundingClientRect().right,
      margenIzquierda: margen.getBoundingClientRect().left,
    };
  }, MARGEN);
  expect(conAviso.aLaVista, 'el aviso tapa el estado de la simulación').toBe(true);
  expect(conAviso.avisoDerecha, 'el aviso cae sobre el margen del 3D').toBeLessThanOrEqual(conAviso.margenIzquierda);
  await page.locator('.toast__dismiss').first().click();
  await expect(page.locator('.toast')).toHaveCount(0);

  await estado.click();
  await expect(detalle).toBeVisible();
  const d = await page.evaluate((selMargen) => {
    const hoja = document.querySelector('[aria-label="Detalle de la simulación"]')!;
    const h = hoja.getBoundingClientRect();
    const margen = document.querySelector(selMargen)!;
    const m = margen.getBoundingClientRect();
    const botones = [...margen.querySelectorAll('button')];
    const b = botones[botones.length - 1].getBoundingClientRect();
    // Las herramientas del margen siguen a la vista y a mano con el detalle abierto.
    const tapadas = botones.slice(0, 4).filter((x) => {
      const r = x.getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(e !== null && x.contains(e));
    }).map((x) => x.getAttribute('aria-label'));
    return {
      derecha: h.right, margenIzquierda: m.left, abajo: h.bottom, botonAbajo: b.bottom,
      cabecera: hoja.firstElementChild?.textContent ?? '', material: hoja.getAttribute('data-material'), tapadas,
    };
  }, MARGEN);
  expect(d.derecha, 'el detalle tapa el margen').toBeLessThanOrEqual(d.margenIzquierda);
  expect(Math.abs(d.abajo - d.botonAbajo), 'el detalle no se apoya en el icono').toBeLessThanOrEqual(2);
  // Hasta el primer cuadro de la corrida, el estado dice «Preparando la tela».
  expect(d.cabecera, 'el detalle no empieza diciendo el estado').toMatch(/^(Preparando la tela|Simulando|En pausa)/);
  expect(d.material).toBe('papel');
  expect(d.tapadas, 'el detalle tapa herramientas del margen').toEqual([]);

  await page.keyboard.press('Escape');
  await expect(detalle, 'Esc no cierra el detalle').toHaveCount(0);
  await dispatch(page, 'simulation/resetSimulation');
  await expect(estado, 'en reposo el estado sigue en el margen').toHaveCount(0);
});
