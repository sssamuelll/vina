import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, cargarDxfDeMaria, cambiarVista, reposo, centroDePieza } from './helpers/estados';
import { addPiece, activarHerramienta, clickAt, dispatch } from './helpers/lienzo';

/**
 * La línea al pie (spec 2026-10-02 «la interfaz en papel» § 5.3 y § 5.4),
 * medida en la pantalla de María (1366 × 643, en Split): una franja del
 * marco, de lado a lado y siempre, con el nombre y la tecla de la herramienta,
 * sus opciones como botones y la frase entera en una línea. Sustituye a la red
 * de la tarjeta de la esquina (`emplazamiento-tira.spec.ts`, hasta P2b).
 *
 * jsdom no calcula layout: las cajas, `elementFromPoint` y si un texto se
 * recorta solo existen aquí. Sin capturas: en esta app `page.screenshot` se
 * cuelga después de «fonts loaded» (2026-10-04).
 */
test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });

const MARIA = { width: 1366, height: 643 };

/** Las doce de fábrica, con el nombre que enseña el margen. */
const DEL_MARGEN = [
  'Seleccionar', 'Editar patrón', 'Punto', 'Pluma', 'Línea interna', 'Rectángulo',
  'Tijeras', 'Medir', 'Coser', 'Editar costuras', 'Margen de costura', 'Piquete',
];

interface VentanaConStore {
  __VINA_STORE__: {
    getState: () => {
      tools: { toolOptions: Record<string, Record<string, unknown> | undefined> };
      project: { pieces: Array<{ id: string; internals: Array<{ type: string; notchOptions?: Record<string, unknown> }> }> };
    };
  };
}

const opcionesDelPiquete = (page: Page) =>
  page.evaluate(() => (window as unknown as VentanaConStore).__VINA_STORE__.getState().tools.toolOptions.notch ?? {});

const cuantasPiezas = (page: Page) =>
  page.evaluate(() => (window as unknown as VentanaConStore).__VINA_STORE__.getState().project.pieces.length);

const seleccion = (page: Page) =>
  page.evaluate(() => (window as unknown as { __VINA_STORE__: { getState: () => { editor: { selectedPieceIds: string[] } } } }).__VINA_STORE__.getState().editor.selectedPieceIds);

const piquetesDe = (page: Page, id: string) =>
  page.evaluate((pieza) => (window as unknown as VentanaConStore).__VINA_STORE__.getState().project.pieces
    .find((p) => p.id === pieza)?.internals
    .filter((l) => l.type === 'notch')
    .map((l) => l.notchOptions ?? null) ?? [], id);

async function medirPie(page: Page) {
  return page.evaluate(() => {
    const linea = document.querySelector('.linea-al-pie')!;
    const pie = linea.getBoundingClientRect();
    const texto = document.querySelector<HTMLElement>('.seccion-del-patron__texto');
    return {
      pie: { left: pie.left, right: pie.right, top: pie.top, bottom: pie.bottom, height: pie.height },
      barraAlto: document.querySelector('.top-bar')!.getBoundingClientRect().height,
      areaBottom: document.querySelector('.canvas-area')!.getBoundingClientRect().bottom,
      ventana: { w: window.innerWidth, h: window.innerHeight },
      fondo: getComputedStyle(linea).backgroundColor,
      fondoBarra: getComputedStyle(document.querySelector('.top-bar')!).backgroundColor,
      seccion: document.querySelector('.seccion-del-patron') !== null,
      nombre: document.querySelector('.seccion-del-patron__nombre')?.textContent ?? null,
      frase: texto ? { texto: texto.textContent ?? '', recortada: texto.scrollWidth > texto.clientWidth + 1 } : null,
      margenLeft: document.querySelector('nav.margen')?.getBoundingClientRect().left ?? null,
      hojaPapel: document.querySelector('.pattern-editor')?.getAttribute('data-material') ?? null,
    };
  });
}

test('al pie, de lado a lado, con el material y el alto de la barra superior, en las tres vistas; la hoja termina encima y es papel', async ({ page }) => {
  await page.setViewportSize(MARIA);
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  for (const vista of ['2D', 'Split', '3D'] as const) {
    await cambiarVista(page, vista);
    await page.waitForTimeout(300);
    const r = await medirPie(page);
    expect(r.pie.left, `${vista}: no empieza en el borde`).toBe(0);
    expect(r.pie.right, `${vista}: no llega al otro borde`).toBe(r.ventana.w);
    expect(Math.round(r.pie.bottom), `${vista}: no está al pie`).toBe(r.ventana.h);
    expect(Math.round(r.pie.height), `${vista}: no tiene el alto de la barra superior`).toBe(Math.round(r.barraAlto));
    expect(r.fondo, `${vista}: no es del material de la barra superior`).toBe(r.fondoBarra);
    expect(r.areaBottom, `${vista}: la hoja se mete debajo`).toBeLessThanOrEqual(r.pie.top + 0.5);
    // En 3D no hay hoja que explicar: la sección del patrón se va, la franja no.
    expect(r.seccion, `${vista}: la sección del patrón`).toBe(vista !== '3D');
  }
  expect((await medirPie(page)).hojaPapel, 'la hoja no lleva el ámbito de papel').toBe('papel');
});

test('cada herramienta del margen dice su nombre y su frase entera en una línea, y el margen no se mueve', async ({ page }) => {
  await page.setViewportSize(MARIA);
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await cambiarVista(page, 'Split');
  await reposo(page);
  const antes = await medirPie(page);
  const malas: string[] = [];
  for (const nombre of DEL_MARGEN) {
    await page.locator(`nav.margen .dock__tool[aria-label^="${nombre}"]`).first().click();
    await expect(page.locator('.seccion-del-patron__nombre')).toHaveText(nombre);
    await page.waitForTimeout(150);
    const r = await medirPie(page);
    if (!r.frase) malas.push(`${nombre}: sin frase`);
    else if (r.frase.recortada) malas.push(`${nombre}: «${r.frase.texto}» no cabe`);
    if (r.margenLeft !== antes.margenLeft) malas.push(`${nombre}: el margen se movió`);
  }
  expect(malas).toEqual([]);
});

test('mientras dibuja, la frase de la Pluma y la de la Línea interna también caben', async ({ page }) => {
  await page.setViewportSize(MARIA);
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await cambiarVista(page, 'Split');
  await reposo(page);

  await activarHerramienta(page, 'h', 'pen');
  const svg = await page.locator('svg.pattern-svg').boundingBox();
  if (!svg) throw new Error('no svg');
  await page.mouse.click(svg.x + svg.width - 60, svg.y + 60);
  await expect.poll(async () => (await medirPie(page)).frase?.texto ?? '').toMatch(/Tab/);
  expect((await medirPie(page)).frase!.recortada, 'la frase de la Pluma con un punto no cabe').toBe(false);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await activarHerramienta(page, 'g', 'internalShape');
  const c = await centroDePieza(page);
  await page.mouse.click(c.x, c.y);
  await expect.poll(async () => (await medirPie(page)).frase?.texto ?? '').toMatch(/Tab/);
  expect((await medirPie(page)).frase!.recortada, 'la frase de la Línea interna con un punto no cabe').toBe(false);
  await page.keyboard.press('Escape');
});

test('las opciones del piquete son botones a un clic, y lo que se escoge es lo que se pone', async ({ page }) => {
  await page.setViewportSize(MARIA);
  await abrirAppVacia(page);
  await addPiece(page, 'piquete-pie', { x: 120, y: 120 }, 300, 400);
  await cambiarVista(page, 'Split');
  await reposo(page);
  await page.locator('nav.margen .dock__tool[aria-label^="Piquete"]').first().click();
  await expect(page.locator('.seccion-del-patron__nombre')).toHaveText('Piquete');
  // A 1366 en Split las cuatro caben enteras con su frase (spec § 5.3): sin «Más».
  await expect(page.locator('.seccion-del-patron__mas')).toHaveCount(0);

  const pie = page.locator('.seccion-del-patron');
  await pie.getByRole('button', { name: 'En T' }).click();
  await pie.getByRole('group', { name: 'Cantidad' }).getByRole('button', { name: '2' }).click();
  await pie.getByLabel('Profundidad (mm)').locator('xpath=..').getByRole('button', { name: 'Sumar' }).click();
  await expect(pie.getByLabel('Ancho (mm)'), 'el ancho no tiene sitio').toBeVisible();
  await expect.poll(() => opcionesDelPiquete(page)).toMatchObject({ shape: 't-notch', count: 2, length: 9 });
  expect((await medirPie(page)).frase!.recortada, 'la frase no cabe junto a las cuatro opciones').toBe(false);

  // Se pone uno: el clic tiene que caer sobre el contorno, así que se prueban
  // varios puntos del lado izquierdo. La sonda es la cota del piquete (P3b),
  // que se abre con el clic; Esc deja el piquete donde se hizo clic.
  const cota = page.locator('input.cota--editando[aria-label="Distancia"]');
  for (const y of [320, 260, 380, 220, 420]) {
    await clickAt(page, { x: 120, y });
    await page.waitForTimeout(250);
    if (await cota.isVisible()) break;
  }
  await expect(cota, 'ningún clic sobre el borde puso el piquete').toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await piquetesDe(page, 'piquete-pie')).at(-1))
    .toMatchObject({ shape: 't-notch', count: 2, length: 9 });
});

test('en una ventana estrecha, lo que no cabe pasa a «Más»: la frase conserva sus 200 px y todo sigue a un clic, también con el teclado', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await abrirAppVacia(page);
  await addPiece(page, 'desplazar-pie', { x: 120, y: 120 }, 300, 400);
  await dispatch(page, 'editor/selectPiece', 'desplazar-pie');
  await activarHerramienta(page, 'r', 'offsetOutline');

  const mas = page.locator('.seccion-del-patron__mas');
  await expect(mas, 'a 1100 px las cuatro opciones de Desplazar contorno no caben y no hay «Más»').toBeVisible();
  const r = await page.evaluate(() => {
    const frase = document.querySelector('.seccion-del-patron__frase')!.getBoundingClientRect();
    const boton = document.querySelector('.seccion-del-patron__mas')!.getBoundingClientRect();
    return { frase: frase.width, fraseLeft: frase.left, masRight: boton.right };
  });
  expect(r.frase, 'la frase se quedó con menos de 200 px').toBeGreaterThanOrEqual(199);
  expect(r.masRight, '«Más» se mete en la frase').toBeLessThanOrEqual(r.fraseLeft);

  const piezas = await cuantasPiezas(page);
  await mas.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('group', { name: /^Más opciones de/ });
  await expect(menu).toBeVisible();
  // Enter sobre un botón del pie es del botón: no llega a Desplazar contorno,
  // que con una pieza seleccionada crearía «… Offset» (revisión final de P2b).
  expect(await cuantasPiezas(page), 'Enter sobre «Más» desplazó la pieza').toBe(piezas);
  await expect(menu).toHaveAttribute('data-material', 'papel');
  expect(await menu.evaluate((m) => m.contains(document.activeElement)), 'abierto con el teclado, el foco se quedó fuera').toBe(true);
  const caja = await menu.boundingBox();
  const lineaTop = await page.locator('.linea-al-pie').evaluate((e) => e.getBoundingClientRect().top);
  expect(caja!.y + caja!.height, 'el menú no se abre hacia arriba').toBeLessThanOrEqual(lineaTop);
  // Lo plegado se toca: nada lo tapa.
  const tapados = await menu.evaluate((m) => [...m.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), input, select')]
    .filter((b) => {
      const c = b.getBoundingClientRect();
      const encima = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      return !encima || !b.contains(encima);
    })
    .map((b) => b.textContent?.trim() || b.id));
  expect(tapados).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(mas).toBeFocused();

  // Espacio sobre una alternativa la pulsa: no arranca la simulación.
  const direccion = page.locator('#opcion-direction');
  await page.keyboard.press('Shift+Tab');
  await expect(direccion.getByRole('button', { name: 'Las dos' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(direccion.getByRole('button', { name: 'Las dos' })).toHaveAttribute('aria-pressed', 'true');
  expect(await cuantasPiezas(page)).toBe(piezas);

  // Escape cerró «Más» y nada más: la pieza sigue seleccionada (spec
  // 2026-10-02 § 6.2, la escalera de lo que se llama). Con el ratón, ningún
  // botón del pie se queda con el foco, ni el que dejó el teclado: el Enter
  // siguiente es de la herramienta y aplica.
  expect(await seleccion(page), 'el Escape de «Más» soltó la pieza').toEqual(['desplazar-pie']);
  await direccion.getByRole('button', { name: 'Hacia afuera' }).click();
  expect(await page.evaluate(() => document.activeElement?.closest('.linea-al-pie') == null), 'el clic dejó el foco en la línea al pie').toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(() => cuantasPiezas(page), { message: 'Enter no aplicó el desplazamiento' }).toBe(piezas + 1);
});

test('a 1000 px, el menú «Más» se corre a la izquierda para no salirse de la ventana', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await abrirAppVacia(page);
  await addPiece(page, 'desplazar-pie', { x: 120, y: 120 }, 300, 400);
  await dispatch(page, 'editor/selectPiece', 'desplazar-pie');
  await activarHerramienta(page, 'r', 'offsetOutline');

  await page.locator('.seccion-del-patron__mas').click();
  const menu = page.getByRole('group', { name: /^Más opciones de/ });
  await expect(menu).toBeVisible();
  const caja = (await menu.boundingBox())!;
  expect(caja.x + caja.width, 'el menú se sale por la derecha').toBeLessThanOrEqual(1000 - 16 + 0.5);
  expect(caja.x, 'el menú se sale por la izquierda').toBeGreaterThanOrEqual(16 - 0.5);
});

test('las cotas se ocultan mientras se arrastra la pieza y vuelven al soltar', async ({ page }) => {
  await page.setViewportSize(MARIA);
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
  await page.keyboard.press('s');
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  await page.mouse.click(box.x + 300, box.y + 300);
  await page.keyboard.press('z');
  await page.mouse.click(box.x + 320, box.y + 320);
  const ancho = page.getByRole('button', { name: /^Ancho de la pieza:/ });
  await expect(ancho).toBeVisible();
  await page.mouse.move(box.x + 320, box.y + 320);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 380, { steps: 6 });
  await expect(ancho).toHaveCount(0);
  await page.mouse.up();
  await expect(ancho).toBeVisible();
});
