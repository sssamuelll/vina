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

/** El alto del cuerpo de «Producción», que su botón nombra con `aria-controls`. */
async function altoDeProduccion(page: Page): Promise<number> {
  return page.evaluate(() => {
    const boton = [...document.querySelectorAll('.panel-section-header')]
      .find((b) => b.textContent?.includes('Producción'));
    const cuerpo = boton && document.getElementById(boton.getAttribute('aria-controls') ?? '');
    // NaN y no -1: «-1 < 1» pasaría sin haber encontrado el cuerpo.
    return cuerpo ? cuerpo.getBoundingClientRect().height : Number.NaN;
  });
}

async function propiedadesDesdeLaBarrita(page: Page) {
  await abrirAppVacia(page);
  await addPiece(page, 'p1', { x: 100, y: 100 }, 300, 200);
  await activarHerramienta(page, 'z', 'select');
  await clickAt(page, { x: 250, y: 200 });
  await page.locator('.floating-action-bar').getByRole('button', { name: 'Propiedades…', exact: true }).click();
  await expect(page.locator('.context-panel__header', { hasText: 'Propiedades' })).toBeVisible();
  // El contenido es `lazy()`: la cabecera llega antes que los campos, y
  // `aLaVista` no espera como un `expect` de Playwright.
  await expect(page.locator('#prop-piece-name')).toBeVisible();
}

test('desde la barrita, Propiedades abre con sus cuatro campos a la vista y «Producción» plegada', async ({ page }) => {
  await propiedadesDesdeLaBarrita(page);
  for (const id of ['prop-piece-name', 'prop-piece-sa', 'prop-piece-fabric', 'prop-piece-mirror']) {
    expect(await aLaVista(page, `#${id}`), id).toBe(true);
  }
  await expect(page.getByRole('button', { name: 'Producción' })).toHaveAttribute('aria-expanded', 'false');
  // Plegada, su cuerpo mide 0 de alto. `elementFromPoint` no sirve para esto:
  // el cuerpo plegado es `inert`, y lo inerte no existe para el puntero aunque
  // se viera (revisión final de P4, lentes A y B).
  expect(await altoDeProduccion(page), '«Producción» plegada no mide 0 de alto').toBeLessThan(1);
});

test('«Producción» se despliega, y lo último del panel se alcanza con la rueda', async ({ page }) => {
  await propiedadesDesdeLaBarrita(page);
  await page.getByRole('button', { name: 'Producción' }).click();
  await expect(page.getByRole('button', { name: 'Producción' })).toHaveAttribute('aria-expanded', 'true');
  expect(await altoDeProduccion(page)).toBeGreaterThan(100);
  // Con la rueda sobre el panel, como ella: `scrollIntoViewIfNeeded` también
  // movería la `.canvas-area`, que recorta.
  const panel = (await page.locator('.context-panel').boundingBox())!;
  await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2);
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(300);
  expect(await aLaVista(page, '.panel-delete'), '«Eliminar pieza» no se alcanza con la rueda').toBe(true);
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
