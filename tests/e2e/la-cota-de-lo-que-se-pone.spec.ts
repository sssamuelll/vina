/**
 * La cota de lo que se pone (spec 2026-10-02 § 5.2, P3b): el piquete y el
 * punto, al ponerse, enseñan su cota abierta sobre el borde y se terminan de
 * poner ahí mismo; el modal del piquete ya no existe. Es un e2e porque el
 * chip es una capa HTML anclada con pan y zoom, el foco que lo abre llega en
 * el render siguiente, y el blur del siguiente clic solo es de verdad en un
 * navegador.
 *
 * La pieza es un rectángulo de 300 × 200 con la esquina en (100, 100): el
 * borde de arriba va de (100, 100) a (400, 100) en coordenadas de patrón.
 */
import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, cambiarVista } from './helpers/estados';
import { addPiece, activarHerramienta, clickAt, dispatch, st, toScreen } from './helpers/lienzo';

interface Linea {
  id: string;
  type: string;
  path: Array<{ type: string; values: number[] }>;
  notchAnchor?: { distanceMm: number };
  notchOptions?: { length: number };
}
type Ventana = { __VINA_STORE__: { getState: () => { project: { pieces: Array<{ outline: Array<{ type: string; values: number[] }>; internals: Linea[] }> } } } };

const campo = (page: Page, nombre: 'Distancia' | 'Profundidad') =>
  page.locator(`input.cota--editando[aria-label="${nombre}"]`);
const piquetes = (page: Page) => page.evaluate(() =>
  (window as unknown as Ventana).__VINA_STORE__.getState().project.pieces[0].internals.filter(l => l.type === 'notch'));
const contorno = (page: Page) => page.evaluate(() =>
  (window as unknown as Ventana).__VINA_STORE__.getState().project.pieces[0].outline);
const numero = async (page: Page, nombre: 'Distancia' | 'Profundidad') =>
  Number((await campo(page, nombre).inputValue()).replace(',', '.'));

async function unaPieza(page: Page) {
  await abrirAppVacia(page);
  await addPiece(page, 'p1', { x: 100, y: 100 }, 300, 200);
}

test.describe('la cota de lo que se pone (P3b)', () => {
  test.setTimeout(90_000);

  test('el clic pone el piquete con su cota abierta; Enter lo lleva a la distancia escrita', async ({ page }) => {
    await unaPieza(page);
    await activarHerramienta(page, 'Shift+N', 'notch');
    await clickAt(page, { x: 160, y: 100 });

    await expect(campo(page, 'Distancia')).toBeFocused();
    expect(await numero(page, 'Distancia')).toBeCloseTo(60, 0);
    await expect(page.locator('[role="dialog"]'), 'el modal del piquete volvió').toHaveCount(0);

    await campo(page, 'Distancia').fill('150');
    await campo(page, 'Distancia').press('Enter');
    await expect(campo(page, 'Distancia')).toHaveCount(0);
    await expect.poll(async () => (await piquetes(page))[0].notchAnchor?.distanceMm).toBeCloseTo(150, 1);
  });

  test('Esc lo deja donde se hizo clic; el siguiente clic, con la cota abierta, pone otro sin escribir el número a medias', async ({ page }) => {
    await unaPieza(page);
    await activarHerramienta(page, 'Shift+N', 'notch');

    await clickAt(page, { x: 160, y: 100 });
    await campo(page, 'Distancia').fill('150');
    await campo(page, 'Distancia').press('Escape');
    await expect(campo(page, 'Distancia')).toHaveCount(0);
    expect((await piquetes(page))[0].notchAnchor?.distanceMm).toBeCloseTo(60, 0);

    // Con la cota abierta y un número a medio escribir, el clic siguiente la cierra sin escribirlo.
    await clickAt(page, { x: 200, y: 100 });
    await campo(page, 'Distancia').fill('250');
    await clickAt(page, { x: 300, y: 100 });
    await expect.poll(async () => (await piquetes(page)).length).toBe(3);
    const [, segundo] = await piquetes(page);
    expect(segundo.notchAnchor?.distanceMm, 'se escribió el número que nadie confirmó').toBeCloseTo(100, 0);
    // El tercero abrió la suya: a 100 de la esquina de (400, 100), la más cercana.
    await expect(campo(page, 'Distancia')).toBeFocused();
    expect(await numero(page, 'Distancia')).toBeCloseTo(100, 0);
  });

  test('«Ajustar distancia…» abre la misma cota, con la profundidad a un Tab', async ({ page }) => {
    await unaPieza(page);
    await activarHerramienta(page, 'Shift+N', 'notch');
    await clickAt(page, { x: 160, y: 100 });
    await campo(page, 'Distancia').press('Escape');

    await activarHerramienta(page, 'z', 'select');
    await clickAt(page, { x: 160, y: 104 }, 'right');
    await page.getByText('Ajustar distancia…', { exact: true }).click();

    await expect(campo(page, 'Distancia')).toBeFocused();
    await campo(page, 'Distancia').fill('90');
    await campo(page, 'Distancia').press('Tab');
    await expect(campo(page, 'Profundidad')).toBeFocused();
    await campo(page, 'Profundidad').fill('12');
    await campo(page, 'Profundidad').press('Enter');

    await expect.poll(async () => (await piquetes(page))[0].notchAnchor?.distanceMm).toBeCloseTo(90, 1);
    expect((await piquetes(page))[0].notchOptions?.length).toBe(12);
  });

  test('las puntas de un piquete seleccionado no se arrastran', async ({ page }) => {
    await unaPieza(page);
    await activarHerramienta(page, 'Shift+N', 'notch');
    await clickAt(page, { x: 160, y: 100 });
    await campo(page, 'Distancia').press('Escape');
    const [piquete] = await piquetes(page);

    await activarHerramienta(page, 'z', 'select');
    await dispatch(page, 'editor/selectInternalLine', { pieceId: 'p1', lineId: piquete.id });
    const desde = await toScreen(page, { x: 160, y: 107 });
    const hasta = await toScreen(page, { x: 200, y: 140 });
    await page.mouse.move(desde.x, desde.y);
    await page.mouse.down();
    await page.mouse.move(hasta.x, hasta.y, { steps: 6 });
    await page.mouse.up();

    expect((await piquetes(page))[0].path).toEqual(piquete.path);
  });

  test('el punto trae su cota; Enter lo mueve, y un Ctrl+Z lo quita entero', async ({ page }) => {
    await unaPieza(page);
    await dispatch(page, 'editor/setActiveTool', 'point');
    await dispatch(page, 'tools/setActiveTool2D', 'point');
    await page.waitForTimeout(300);
    await clickAt(page, { x: 160, y: 100 });

    await expect.poll(async () => (await contorno(page)).length).toBe(6);
    await expect(campo(page, 'Distancia')).toBeFocused();
    expect(await numero(page, 'Distancia')).toBeCloseTo(60, 0);

    // Más de 500 ms entre el clic y el número: dos escrituras iguales más
    // seguidas se funden solas, y entonces el deshacer único no probaría el lote.
    await page.waitForTimeout(700);
    await campo(page, 'Distancia').fill('120');
    await campo(page, 'Distancia').press('Enter');
    await expect(campo(page, 'Distancia')).toHaveCount(0);
    const xs = (await contorno(page)).filter(c => c.values.length >= 2).map(c => Math.round(c.values[c.values.length - 2]));
    expect(xs, 'el punto no se movió a 120').toContain(120);
    expect(xs, 'quedó el punto del clic además del movido').not.toContain(60);
    expect(await contorno(page)).toHaveLength(6);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await contorno(page)).length).toBe(5);
  });

  test('en Split, la cota cae dentro de la hoja y nada la tapa', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 643 });
    await unaPieza(page);
    await cambiarVista(page, 'Split');
    await activarHerramienta(page, 'Shift+N', 'notch');
    await clickAt(page, { x: 160, y: 100 });
    await expect(campo(page, 'Distancia')).toBeFocused();

    const caja = await campo(page, 'Distancia').boundingBox();
    if (!caja) throw new Error('el campo no tiene caja');
    const encima = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el?.getAttribute('aria-label') ?? el?.className ?? null;
    }, [caja.x + caja.width / 2, caja.y + caja.height / 2] as const);
    expect(encima, 'algo tapa la cota del piquete').toBe('Distancia');
    const hoja = await page.locator('svg.pattern-svg').boundingBox();
    expect(caja.x + caja.width).toBeLessThanOrEqual(hoja!.x + hoja!.width);
    expect((await st(page)).editor.activeTool).toBe('notch');
  });
});
