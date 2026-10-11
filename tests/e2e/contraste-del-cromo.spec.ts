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

  await page.locator('nav.margen .dock__tool').first().hover();
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

test('la cota del piquete y el modal de conexión', async ({ page }) => {
  await addPiece(page, 'piquete', { x: 120, y: 120 }, 300, 400);
  await reposo(page);
  await activarHerramienta(page, 'Shift+N', 'notch');
  // El piquete tiene que caer sobre el contorno y no en el relleno: se
  // prueban varios puntos del lado izquierdo. Desde P3b el clic abre su cota
  // sobre el borde (el modal se fue).
  const cota = page.locator('input.cota--editando[aria-label="Distancia"]');
  for (const y of [320, 260, 380, 220, 420]) {
    await clickAt(page, { x: 120, y });
    await page.waitForTimeout(250);
    if (await cota.isVisible()) break;
  }
  await expect(cota, 'ningún clic sobre el borde abrió la cota del piquete').toBeVisible();
  await registrar('cota del piquete', page);
  await page.keyboard.press('Escape');
  await expect(cota).toHaveCount(0);

  // Preferencias (P2c) monta AgentSettings → ConnectionsList → ConnectionModal.
  await abrirPanel(page, 'IA y ratón', 'IA y ratón');
  await page.getByRole('button', { name: /Agregar (conexión|tu primera conexión)/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Agregar conexión' })).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('modal de conexión', page);
});

test('la etiqueta del piquete, abierta', async ({ page }) => {
  // La puerta de vuelta (P3c): la pastilla es papel sobre la hoja y su menú,
  // papel colgado de <body>, con los controles de la línea al pie.
  await addPiece(page, 'etiqueta', { x: 120, y: 120 }, 300, 400);
  await reposo(page);
  await activarHerramienta(page, 'Shift+N', 'notch');
  await clickAt(page, { x: 180, y: 120 });
  await page.locator('input.cota--editando[aria-label="Distancia"]').press('Escape');
  await activarHerramienta(page, 'z', 'select');
  await clickAt(page, { x: 180, y: 124 });
  await page.getByRole('button', { name: /^Piquete: / }).click();
  await expect(page.getByRole('group', { name: 'Opciones del piquete' })).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('etiqueta del piquete abierta', page);
});

test('lo que flota en el 3D: el menú del modo de superficie', async ({ page }) => {
  await cambiarVista(page, '3D');
  await page.locator('.surface-pill__trigger').click();
  await expect(page.locator('.surface-pill__flyout')).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('menú de superficie (3D)', page);
});

test('la barra superior plegada: el menú de «Mostrar»', async ({ page }) => {
  // A 1366 los seis interruptores caben; a 1280 se pliegan (spec 2026-10-02
  // § 4.2) y el menú que los lleva es papel, colgado de <body>.
  await page.setViewportSize({ width: 1280, height: 720 });
  await cargarDxfDeMaria(page);
  await reposo(page);
  await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Qué se ve del patrón' })).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('menú «Mostrar» (barra plegada)', page);
});

test('la línea al pie: las opciones del piquete y el menú «Más»', async ({ page }) => {
  // Desde P2b las opciones de la herramienta viven en el marco, al pie, y lo
  // que no cabe flota en un menú de papel.
  await addPiece(page, 'piquete-pie', { x: 120, y: 120 }, 300, 400);
  await reposo(page);
  await activarHerramienta(page, 'Shift+N', 'notch');
  await expect(page.locator('.seccion-del-patron [data-superficie="pie"]')).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('línea al pie con el piquete', page);

  await page.setViewportSize({ width: 1100, height: 700 });
  await dispatch(page, 'editor/selectPiece', 'piquete-pie');
  await activarHerramienta(page, 'r', 'offsetOutline');
  await page.locator('.seccion-del-patron__mas').click();
  await expect(page.getByRole('group', { name: /^Más opciones de/ })).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('menú «Más» de la línea al pie', page);
});

test('la IA convocada y su panel', async ({ page }) => {
  // Desde P2c la barra de IA no está en reposo: se mide convocada, con una
  // conversación en papel, y su panel de ajustes en el marco.
  await addPiece(page, 'ia-pieza', { x: 120, y: 120 }, 300, 400);
  await reposo(page);
  await page.keyboard.press('Control+/');
  await page.getByPlaceholder('Pide algo o pregunta').fill('hola');
  await page.keyboard.press('Enter');
  await expect(page.locator('.unified-bar__panel')).toContainText('hola');
  await page.waitForTimeout(200);
  await registrar('barra de IA con una conversación', page);
  await page.keyboard.press('Escape');
  await abrirPanel(page, 'IA y ratón', 'IA y ratón');
  await page.waitForTimeout(200);
  await registrar('panel IA y ratón', page);
});
