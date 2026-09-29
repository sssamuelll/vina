import { test, expect } from '@playwright/test';
import { medirContraste } from './helpers/contraste';
import { leerBaseline, fijarBaseline, techoDe } from './helpers/trinquete';
import {
  abrirAppVacia, cargarDxfDeMaria, reposo, seleccionarPieza, abrirPaleta, abrirPanel, cambiarVista,
} from './helpers/estados';

/**
 * Trinquete de contraste del cromo (spec 2026-09-24 «cromo callado» § 4.2 y
 * § 7 F1). Por estado, cuenta los textos que no llegan a AA sobre su fondo
 * real y falla si la cuenta supera el techo guardado. La meta es 0; lo que
 * hoy falla y no toca F1 (paneles de contenido) baja en F5 y F6.
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
  if (techo !== undefined) {
    expect(fallos.length, fallos.map((f) => `${f.ratio}:1 «${f.texto}» ${f.selector}`).join('\n')).toBeLessThanOrEqual(techo);
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
