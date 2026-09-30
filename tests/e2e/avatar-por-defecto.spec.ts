import { test, expect } from '@playwright/test';
import { abrirPanel } from './helpers/estados';

interface VentanaConStore {
  __VINA_STORE__?: { getState: () => { simulation: { armAxis: { ready: boolean } }; project: { avatarModelUrl: string } } };
}

/** Spec 2026-09-29 § 5 y § 9: un proyecto nuevo pide mujer-eu38.glb y nunca default-avatar.glb. */
test('un proyecto nuevo abre con Mujer EU 38, comprimida con meshopt, y el panel dice qué cuerpo es', async ({ page }) => {
  const pedidos: string[] = [];
  page.on('request', (r) => pedidos.push(new URL(r.url()).pathname));
  const errores: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

  await page.goto('/app/');
  // El esqueleto se leyó: AvatarModel despacha armAxis.ready al encontrar los huesos,
  // y eso solo pasa si la GLB comprimida se decodificó.
  await page.waitForFunction(
    () => (window as unknown as VentanaConStore).__VINA_STORE__?.getState().simulation.armAxis.ready === true,
    null, { timeout: 45_000 },
  );
  expect(await page.evaluate(() => (window as unknown as VentanaConStore).__VINA_STORE__!.getState().project.avatarModelUrl))
    .toBe('/avatares/mujer-eu38.glb');
  expect(pedidos).toContain('/avatares/mujer-eu38.glb');
  expect(pedidos.filter((p) => p.includes('default-avatar'))).toEqual([]);
  expect(errores.filter((e) => /meshopt|GLTFLoader|AvatarModel/i.test(e))).toEqual([]);

  await abrirPanel(page, 'Avatar y medidas', 'Avatar');
  await expect(page.getByText('Mujer EU 38 · US 8', { exact: true })).toBeVisible();
  await expect(page.getByText('El cuerpo es la talla Mujer EU 38 · US 8; tus cambios se usan en el patrón.')).toBeVisible();
});
