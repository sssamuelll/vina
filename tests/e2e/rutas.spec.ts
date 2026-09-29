import { test, expect } from '@playwright/test';

test('/ es la home y lleva al taller', async ({ page }) => {
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Traza el patrón, mira la caída.');
  await page.getByRole('link', { name: 'Abrir Vina' }).first().click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 90_000 });
  expect(errores).toEqual([]);
});

test('un marcador viejo con query cae en la home sin errores', async ({ page }) => {
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto('/?testScene=cusick');
  await expect(page.locator('h1')).toHaveText('Traza el patrón, mira la caída.');
  expect(errores).toEqual([]);
});
