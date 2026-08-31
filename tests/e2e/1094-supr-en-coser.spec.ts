/**
 * #1094 — María, audio 2026-08-30 [23:47]: "Incluso si clico y le doy a
 * suprimir, suprime la pieza, suprime, bueno parece, no claro, muy raro."
 *
 * Su gesto: coser A con B, mirar B con Seleccionar, volver a Coser, clicar el
 * borde cosido de A y pulsar Supr. La app borraba B — la selección de tres
 * gestos atrás — y la costura se iba en cascada. El sujeto de Supr en Coser
 * es la costura, nunca una pieza (spec cotas vivas § 3.1: el sujeto es lo
 * más reciente, y se nombra).
 *
 * La evidencia sale de la bitácora exportada por su misma puerta
 * (`BITACORA_DUMP=<carpeta>` la deja en disco).
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, addPiece, clickAt, activarHerramienta } from './helpers/lienzo';
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

for (const tecla of ['Delete', 'Backspace'] as const) {
  test(`#1094 — en Coser, ${tecla} no borra la pieza seleccionada tres gestos atrás`, async ({ page }) => {
    test.setTimeout(90_000);
    await waitForApp(page);
    await addPiece(page, 'A', { x: 60, y: 100 });
    await addPiece(page, 'B', { x: 300, y: 100 });

    // Coser: borde derecho de A con borde izquierdo de B.
    await activarHerramienta(page, 'n', 'seam');
    await clickAt(page, { x: 260, y: 175 });
    await clickAt(page, { x: 300, y: 175 });
    await expect.poll(async () => (await st(page)).project.seams.length).toBe(1);

    // Mirar B con Seleccionar.
    await activarHerramienta(page, 'z', 'select');
    await clickAt(page, { x: 400, y: 175 });
    await expect.poll(async () => (await st(page)).editor.selectedPieceIds).toEqual(['B']);

    // Volver a Coser, clicar el borde cosido de A y pulsar la tecla.
    await activarHerramienta(page, 'n', 'seam');
    await clickAt(page, { x: 260, y: 175 });
    await page.keyboard.press(tecla);
    await page.waitForTimeout(300);

    const s = await st(page);
    const eventos = await leerBitacora(page);
    console.log(guardarEvidencia(`1094-${tecla}`, eventos, 'seam').join('\n'));

    const iTecla = indiceDe(eventos, 'gesture', 'key', (d) => d.key === tecla && d.tool === 'seam');
    expect(iTecla, `la bitácora no registró ${tecla} en Coser`).toBeGreaterThanOrEqual(0);
    const borrado = eventos.findIndex((e, i) => i > iTecla && e.kind === 'action' && /^project\/removePieces?$/.test(e.name));
    expect(borrado, `${tecla} en Coser despachó ${eventos[borrado]?.name}`).toBe(-1);
    expect(s.project.pieces.map((p) => p.id).sort()).toEqual(['A', 'B']);
    expect(s.project.seams).toHaveLength(1);
  });
}
