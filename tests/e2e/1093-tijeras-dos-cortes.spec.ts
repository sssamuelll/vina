/**
 * #1093 — María, audio 2026-08-30 [15:33]: "ya sigo en el menú cortar y no me
 * detecta nada. Tengo que salir y volver a entrar."
 *
 * Su gesto: cortar un rectángulo en dos y, sin salir de Tijeras, cortar una
 * de las mitades. El segundo corte no hacía nada: `removePiece` vacía la
 * selección y Tijeras exigía pieza seleccionada. El press manda el objeto
 * (spec 2026-08-11 § 4.1): el borde bajo el cursor es el sujeto del corte.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, dispatch, addPiece, clickAt, activarHerramienta, confirmarDialogo } from './helpers/lienzo';
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

test('#1093 — dos cortes seguidos sin salir de Tijeras', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForApp(page);
  await addPiece(page, 'A', { x: 100, y: 100 }); // 200 × 150
  await dispatch(page, 'editor/selectPiece', 'A'); // como queda al crearla por clic

  await activarHerramienta(page, 'x', 'scissors');
  // Primer corte: vertical por la mitad (arriba → abajo).
  await clickAt(page, { x: 200, y: 100 });
  await clickAt(page, { x: 200, y: 250 });
  await confirmarDialogo(page);
  await expect.poll(async () => (await st(page)).project.pieces.length).toBe(2);

  // Segundo corte, sobre la mitad izquierda, sin cambiar de herramienta.
  await clickAt(page, { x: 150, y: 100 });
  await clickAt(page, { x: 150, y: 250 });

  const eventos = await leerBitacora(page);
  console.log(guardarEvidencia('1093', eventos, 'scissors').join('\n'));

  // La bitácora tiene que mostrar los dos presses del segundo corte con
  // Tijeras activa: el gesto llegó; lo que faltaba era el sujeto.
  const downs = eventos.filter((e) => e.kind === 'gesture' && e.name === 'down' && e.data?.tool === 'scissors');
  expect(downs.length).toBeGreaterThanOrEqual(4);
  expect(indiceDe(eventos, 'action', 'project/removePiece')).toBeGreaterThanOrEqual(0);

  await confirmarDialogo(page);
  await expect.poll(async () => (await st(page)).project.pieces.length).toBe(3);
});
