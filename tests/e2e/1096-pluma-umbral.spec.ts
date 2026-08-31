/**
 * #1096 — María, audio 2026-08-30 [09:05]: "ya me ha creado tipo bezier si yo
 * no he hecho nada… porque habré arrastrado sin querer."
 *
 * Un píxel de temblor entre down y up es un clic para todas las herramientas
 * (`DRAG_THRESHOLD_PX` = 4, spec 2026-08-11 § 3.5) — y el router lo anota
 * así en la bitácora (`gesture up { drag: false }`) — pero la pluma curvaba
 * igual. El mismo umbral, la misma respuesta.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, clickAt, toScreen, activarHerramienta } from './helpers/lienzo';
import { leerBitacora, guardarEvidencia, indiceDe } from './helpers/bitacora';

test.use({ viewport: { width: 1366, height: 643 } });

// Sin WebGPU en el runner (como caja-negra-bitacora.spec.ts). Y sin cambiar a
// la vista 2D: desmontar el visor 3D con SwiftShader dejaba a Chromium sin poder
// crear el SIGUIENTE contexto ("Failed to find browser context", 30 s en
// "setting up context"; medido 5 de 5 corridas el 2026-08-30). En vista
// dividida el lienzo mide ~640 px: las coordenadas caben ahí.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'false'));
});

async function trazar(page: Parameters<typeof waitForApp>[0], temblorPx: number) {
  await activarHerramienta(page, 'h', 'pen');
  const a = await toScreen(page, { x: 150, y: 150 });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  if (temblorPx > 0) await page.mouse.move(a.x + temblorPx, a.y, { steps: 2 });
  await page.mouse.up();
  await clickAt(page, { x: 300, y: 150 });
  await clickAt(page, { x: 300, y: 300 });
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await st(page)).project.pieces.length).toBe(1);
  return (await st(page)).project.pieces[0].outline.map((c) => c.type);
}

// El control va primero a propósito: el test de 1 px exporta el diagnóstico
// (una descarga), y crear el siguiente contexto de navegador justo después
// de una descarga se colgó 2 de 3 veces en Chromium (medido 2026-08-30).
test('#1096 — control: un arrastre de verdad (12 px) sí curva', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForApp(page);
  const tipos = await trazar(page, 12);
  expect(tipos).toContain('C');
});

test('#1096 — 1 px de temblor entre down y up sigue siendo un clic: tramo recto', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForApp(page);
  const tipos = await trazar(page, 1);

  const eventos = await leerBitacora(page);
  console.log(guardarEvidencia('1096-1px', eventos, 'pen').join('\n'));

  // El router ya dice que no fue arrastre; la pluma tiene que decir lo mismo.
  const iPress = indiceDe(eventos, 'gesture', 'pen:press', (d) => d.nodes === 1);
  expect(iPress).toBeGreaterThanOrEqual(0);
  const up = eventos.slice(iPress).find((e) => e.kind === 'gesture' && e.name === 'up' && e.data?.tool === 'pen');
  expect(up?.data?.drag, 'el router contó el gesto como arrastre').toBe(false);
  expect(tipos, `contorno ${tipos.join(' ')}`).not.toContain('C');
});
