/**
 * Exportar el bundle de diagnóstico por la puerta real: menú Vina ▸ Archivo
 * ▸ Exportar diagnóstico. Movido desde `diagnostico-3d.spec.ts` (caja negra,
 * Tarea 4) para que otros specs (p. ej. `caja-negra-bitacora.spec.ts`) no
 * dupliquen el mecanismo.
 *
 * Los eventos del menú van por `dispatchEvent` y no por `hover`/`click`
 * reales: medido que un `hover` normal no abre el menú (memoria del
 * proyecto). React implementa `onMouseEnter` sobre `mouseover`/`mouseout`
 * (`mouseenter` nativo no burbujea y React no lo escucha), así que hace
 * falta despachar `mouseover`.
 *
 * Tipo de retorno laxo a propósito: cada spec conoce la forma que le
 * importa del bundle (solver, journal, slices…) y castea localmente.
 */
import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Abre el submenú `submenu` del menú Vina, con eventos sintéticos (ver arriba).
 *
 * Antes aparca el ratón real en la esquina de la barra, donde no se despliega
 * nada: si el último gesto del spec lo dejó donde aparece otra fila, Chrome le
 * da a esa fila su `mouseover` de verdad unos cientos de ms después de abrirse
 * el menú, y su submenú le gana al pedido. 1102 cayó así en el gate de P2a; lo
 * fija `emplazamiento-imagenes-de-referencia.spec.ts`.
 */
export async function abrirSubmenuDeVina(page: Page, submenu: string): Promise<void> {
  await page.mouse.move(1, 1);
  await page.getByRole('button', { name: /vina/i }).first().dispatchEvent('click');
  // React implementa onMouseEnter sobre mouseover/mouseout (mouseenter nativo
  // no burbujea y React no lo escucha): hay que despachar mouseover.
  await page.getByText(submenu, { exact: true }).first().dispatchEvent('mouseover');
}

export async function exportBundle(page: Page): Promise<Record<string, unknown>> {
  await abrirSubmenuDeVina(page, 'Archivo');
  await expect(page.getByText('Exportar diagnóstico', { exact: true })).toBeVisible({ timeout: 10_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByText('Exportar diagnóstico', { exact: true }).dispatchEvent('click'),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  return JSON.parse(readFileSync(path!, 'utf8')) as Record<string, unknown>;
}
