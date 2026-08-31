/**
 * #1092 — María, audio 2026-08-30, dos herramientas y la misma línea:
 *
 *   [01:55] "no me arrastra toda la línea, aparte se ha quedado fijo el de
 *   arriba y se mueve el de abajo… [04:06] siempre es esta línea, porque
 *   este es el punto cero."                              (Editar patrón)
 *
 *   [07:36] "estoy clicando en la V y no pasa nada… [08:09] esta línea se
 *   comporta siempre rara y distinta a las demás."       (Convertir en curva)
 *
 * El borde de cierre (última ancla → M, el que dibuja el comando `Z`) se
 * etiquetaba con el índice del `Z`, que no es el de ninguna ancla: el
 * arrastre encontraba un solo extremo y la conversión no veía una `L`.
 *
 * Los tres primeros bordes son el control: si ellos también fallaran, el
 * fallo sería otro.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, dispatch, toScreen, activarHerramienta } from './helpers/lienzo';
import { leerBitacora, guardarEvidencia } from './helpers/bitacora';

test.use({ viewport: { width: 1366, height: 643 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'false'));
});

/** El rectángulo REAL, el que crea `useRectangleTool`: cierra con `Z`. */
const RECT = [
  { type: 'M', values: [300, 300] },
  { type: 'L', values: [400, 300] },
  { type: 'L', values: [400, 400] },
  { type: 'L', values: [300, 400] },
  { type: 'Z', values: [] },
];

/** Punto medio de cada borde, en patrón. El cuarto es el de cierre. */
const MEDIOS = [
  { nombre: 'arriba', p: { x: 350, y: 300 } },
  { nombre: 'derecha', p: { x: 400, y: 350 } },
  { nombre: 'abajo', p: { x: 350, y: 400 } },
  { nombre: 'cierre', p: { x: 300, y: 350 } },
];

async function ponerRect(page: Parameters<typeof waitForApp>[0]) {
  await dispatch(page, 'project/addPiece', {
    id: 'R', name: 'R', outline: RECT, internals: [],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  });
  await page.waitForTimeout(300);
  await dispatch(page, 'editor/selectPiece', 'R');
}

const anclas = (outline: Array<{ type: string; values: number[] }>) =>
  outline.filter(c => c.type !== 'Z').map(c => {
    const v = c.values;
    return { x: v[v.length - 2], y: v[v.length - 1] };
  });

test('#1092 — arrastrar el borde de cierre mueve sus DOS extremos, como los otros tres', async ({ page }) => {
  test.setTimeout(120_000);
  await waitForApp(page);

  const movidos: Record<string, number> = {};
  for (const { nombre, p } of MEDIOS) {
    await ponerRect(page);
    await activarHerramienta(page, 'q', 'editPattern');
    // El primer clic sobre la pieza ENTRA al modo edición (useEditorInteractions
    // :655); el arrastre del borde es el gesto siguiente.
    const centro = await toScreen(page, { x: 350, y: 350 });
    await page.mouse.click(centro.x, centro.y);
    await page.waitForTimeout(200);
    const antes = anclas((await st(page)).project.pieces[0].outline);

    const a = await toScreen(page, p);
    const b = await toScreen(page, { x: p.x + 30, y: p.y + 30 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const despues = anclas((await st(page)).project.pieces[0].outline);
    movidos[nombre] = despues.filter((q, i) => Math.hypot(q.x - antes[i].x, q.y - antes[i].y) > 1).length;
    await dispatch(page, 'project/removePiece', 'R');
    await page.waitForTimeout(150);
  }

  console.log(guardarEvidencia('1092-arrastre', await leerBitacora(page), 'editPattern').join('\n'));
  console.log('vértices movidos por borde: ' + JSON.stringify(movidos));

  expect(movidos.arriba, 'control: el borde de arriba mueve sus dos extremos').toBe(2);
  expect(movidos.derecha).toBe(2);
  expect(movidos.abajo).toBe(2);
  expect(movidos.cierre, 'el borde de cierre movió un solo extremo: el rectángulo se vuelve trapecio').toBe(2);
});

test('#1092 — "Convertir en curva" también sobre el borde de cierre', async ({ page }) => {
  test.setTimeout(120_000);
  await waitForApp(page);

  const tipos: Record<string, string[]> = {};
  for (const { nombre, p } of MEDIOS) {
    await ponerRect(page);
    await activarHerramienta(page, 'q', 'editPattern');
    const centro = await toScreen(page, { x: 350, y: 350 });
    await page.mouse.click(centro.x, centro.y);
    await page.waitForTimeout(200);
    const s = await toScreen(page, p);
    await page.mouse.move(s.x, s.y);
    await page.mouse.click(s.x, s.y, { button: 'right' });
    const fila = page.locator('.context-menu').getByText('Convertir en curva', { exact: true });
    await expect(fila, `${nombre}: el menú no ofrece "Convertir en curva"`).toBeVisible({ timeout: 5000 });
    await fila.click();
    await page.waitForTimeout(250);
    tipos[nombre] = (await st(page)).project.pieces[0].outline.map(c => c.type);
    await dispatch(page, 'project/removePiece', 'R');
    await page.waitForTimeout(150);
  }

  console.log(guardarEvidencia('1092-curva', await leerBitacora(page), 'editPattern').join('\n'));
  console.log('contornos: ' + JSON.stringify(tipos));

  expect(tipos.arriba.filter(t => t === 'C'), 'control: arriba se curva').toHaveLength(1);
  expect(tipos.derecha.filter(t => t === 'C')).toHaveLength(1);
  expect(tipos.abajo.filter(t => t === 'C')).toHaveLength(1);
  expect(tipos.cierre.filter(t => t === 'C'), 'el borde de cierre se quedó recto').toHaveLength(1);
  // Y el contorno sigue cerrado: la curva se dibuja ANTES del Z.
  expect(tipos.cierre[tipos.cierre.length - 1]).toBe('Z');
});
