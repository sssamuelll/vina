/**
 * Pausar y reanudar no vuelve a vestir (2026-10-11).
 *
 * Samuel, en su PC con Chrome: «se reinicia». Tres caminos llevaban a eso, y
 * los tres pasaban por la interfaz de verdad: el botón «Simular» pausaba
 * soltando el solver y reanudaba con una cascada nueva; pausar o reanudar
 * volvía a mallar el patrón y, con mallas nuevas, vestía otra vez; y Espacio
 * —que el botón anuncia— restablecía o volvía a arrancar según un modo oculto.
 *
 * La caja negra lo cuenta sin adivinar: cada cascada del solver deja un
 * `cascade:start` en el diagnóstico. Un «Simular» es una sola cascada, por
 * muchas pausas que haya en medio. Corre en el tier WASM (sin WebGPU, como en
 * el gate) con una pieza sola, para que el primer cuadro llegue pronto.
 */
import { test, expect, type Page } from '@playwright/test';
import { addRectanglePiece, waitForApp } from './helpers/sim';
import { exportBundle } from './helpers/diagnostico';

type VentanaConStore = {
  __VINA_STORE__: { getState: () => { simulation: { simulationState: string; frameTimeMs: number } } };
};

const estado = (page: Page) =>
  page.evaluate(() => (window as unknown as VentanaConStore).__VINA_STORE__.getState().simulation.simulationState);
const cuadro = (page: Page) =>
  page.evaluate(() => (window as unknown as VentanaConStore).__VINA_STORE__.getState().simulation.frameTimeMs);
const simular = (page: Page) => page.getByRole('button', { name: 'Simular', exact: true }).click();
const elEstado = (page: Page) => page.locator('button[aria-label^="Estado de la simulación"]');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'false'));
});

test('pausar y reanudar, con el botón o con Espacio, no vuelve a vestir', async ({ page }) => {
  test.setTimeout(180_000);
  await waitForApp(page);
  await addRectanglePiece(page, 'Panel');

  await simular(page);
  await expect.poll(() => cuadro(page), { timeout: 90_000 }).toBeGreaterThan(0);
  // Con la tela en movimiento, el estado deja «Preparando la tela»: lo apaga el primer cuadro.
  await expect(elEstado(page), 'la tela se mueve y el estado sigue en «Preparando la tela»')
    .toHaveAttribute('aria-label', /^Estado de la simulación: Simulando/, { timeout: 30_000 });

  // El botón: pausa y reanuda. La espera cubre el arranque en caliente del
  // mallado (medio segundo), que volvía a mallar y a vestir tras la pausa.
  await simular(page);
  await expect.poll(() => estado(page)).toBe('paused');
  await page.waitForTimeout(1200);
  await simular(page);
  await expect.poll(() => estado(page)).toBe('running');
  await page.waitForTimeout(1200);
  expect(await arranques(page), 'pausar y reanudar con el botón no vuelve a vestir').toBe(1);

  // Espacio, con el foco en ninguna parte, como lo pulsa María.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(' ');
  await expect.poll(() => estado(page), 'Espacio pausa, como el botón').toBe('paused');
  await page.keyboard.press(' ');
  await expect.poll(() => estado(page), 'y reanuda').toBe('running');
  await page.waitForTimeout(1200);
  expect(await arranques(page), 'ni con Espacio: un «Simular» es una sola cascada').toBe(1);
});

/** Las cascadas que cuenta la caja negra (Exportar diagnóstico), y que el tier siga vivo. */
async function arranques(page: Page): Promise<number> {
  const bundle = (await exportBundle(page)) as {
    solver: { activeTier: string; events: Array<{ kind: string }> };
  };
  expect(bundle.solver.activeTier).toBe('wasm');
  return bundle.solver.events.filter((e) => e.kind === 'cascade:start').length;
}
