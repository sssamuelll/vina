/**
 * Editar patrón edita las internas (spec 2026-09-24, fase 2).
 *
 * María, 10-09 [10:05]: «el patrón lo puedo mover? no puedes editar las
 * internas, ok, así hay que arreglarlo». Y justo después [10:11]-[10:29]:
 * «decir que ahora quiero hacer curva o hacer una recta y editar puntos de
 * curva». Esto lo recorre en un navegador: jsdom no ve qué recibe el clic ni
 * qué se pinta encima de qué.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { activarHerramienta, addPiece, clickAt, dispatch, st, toScreen, type Cmd } from './helpers/lienzo';

type Linea = { id: string; type: string; path: Cmd[] };
const internas = async (page: Page, pieceId = 'A') =>
  ((await st(page)).project.pieces.find(p => p.id === pieceId)!.internals as Linea[]);
const anclas = (path: Cmd[]) => path.filter(c => c.type !== 'Z').map(c => c.values.slice(-2));

async function arrastrar(page: Page, desde: { x: number; y: number }, hasta: { x: number; y: number }) {
  const a = await toScreen(page, desde);
  const b = await toScreen(page, hasta);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

test.describe('Q edita las internas', () => {
  test.setTimeout(120_000);

  test('su secuencia del 10-09: dibuja, edita en Q, convierte y cada gesto se deshace de una vez', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 100, y: 100 }, 300, 200);

    // La Línea interna, como ella: dos clics y un arrastre (Bézier), Enter.
    await activarHerramienta(page, 'g', 'internalShape');
    await clickAt(page, { x: 150, y: 150 });
    await clickAt(page, { x: 250, y: 150 });
    await arrastrar(page, { x: 350, y: 250 }, { x: 380, y: 265 });
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await internas(page)).length).toBe(1);
    const recienDibujada = (await internas(page))[0].path;

    await activarHerramienta(page, 'q', 'editPattern');
    // 1. El punto del medio, 30 mm arriba.
    await arrastrar(page, { x: 250, y: 150 }, { x: 250, y: 120 });
    expect(anclas((await internas(page))[0].path)[1]).toEqual([150, 20]);
    await expect(page.locator('.internal-line-endpoints')).toHaveCount(0);

    // 2. Clic derecho en el primer tramo → Convertir en curva por puntos.
    await clickAt(page, { x: 200, y: 135 }, 'right');
    await page.getByRole('button', { name: /curva por puntos/i }).click();
    await page.waitForTimeout(250);
    const convertida = (await internas(page))[0].path;
    expect(convertida.filter(c => c.type === 'C').length).toBeGreaterThan(1);
    expect((await st(page)).editor.activeTool, 'con una interna no se salta a V').toBe('editPattern');

    // 3. Uno de sus puntos, 10 mm abajo.
    const [px, py] = anclas(convertida)[1];
    await arrastrar(page, { x: 100 + px, y: 100 + py }, { x: 100 + px, y: 110 + py });
    expect(anclas((await internas(page))[0].path)[1]).toEqual([px, py + 10]);

    // Cada gesto, un deshacer.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await internas(page))[0].path).toEqual(convertida);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => anclas((await internas(page))[0].path)[1]).toEqual([150, 20]);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await internas(page))[0].path).toEqual(recienDibujada);
  });

  test('esquina a esquina: la esquina se mueve sola; elegida la interna, su extremo; y engancha exacto', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 100, y: 100 }, 200, 150);
    await dispatch(page, 'project/addInternalLine', { pieceId: 'A', line: { id: 'D', type: 'reference',
      path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 150] }] } });
    await activarHerramienta(page, 'q', 'editPattern');

    await arrastrar(page, { x: 100, y: 100 }, { x: 120, y: 110 });
    expect((await st(page)).project.pieces[0].outline[0].values).toEqual([20, 10]);
    expect(anclas((await internas(page))[0].path)[0]).toEqual([0, 0]);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await st(page)).project.pieces[0].outline[0].values).toEqual([0, 0]);

    // Elegir la interna (un clic en su tramo) y ahora el mismo sitio es suyo.
    await clickAt(page, { x: 200, y: 175 });
    await arrastrar(page, { x: 100, y: 100 }, { x: 140, y: 130 });
    expect(anclas((await internas(page))[0].path)[0]).toEqual([40, 30]);
    expect((await st(page)).project.pieces[0].outline[0].values).toEqual([0, 0]);

    // Y de vuelta, cerca de la esquina: engancha exacto.
    await arrastrar(page, { x: 140, y: 130 }, { x: 102, y: 101 });
    expect(anclas((await internas(page))[0].path)[0]).toEqual([0, 0]);
  });

  test('pieza girada: el punto de la interna va adonde va el puntero', async ({ page }) => {
    await waitForApp(page);
    await dispatch(page, 'project/addPiece', {
      id: 'A', name: 'A', rotation: 180, position: { x: 100, y: 100 },
      outline: [
        { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 150] },
        { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
      ],
      internals: [{ id: 'L', type: 'reference', path: [{ type: 'M', values: [50, 50] }, { type: 'L', values: [150, 50] }] }],
      mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
    });
    await page.waitForTimeout(300);
    await activarHerramienta(page, 'q', 'editPattern');
    // Girada 180° sobre (100,75): local (50,50) se ve en (100 + 150, 100 + 100) = (250,200).
    // 20 mm a la derecha en pantalla son 20 a la izquierda en local: (30,50), lejos de
    // todo borde, así que no engancha (a 10 mm del borde lo haría, y probaría otra cosa).
    await arrastrar(page, { x: 250, y: 200 }, { x: 270, y: 200 });
    const [x, y] = anclas((await internas(page))[0].path)[0];
    expect(x).toBeCloseTo(30, 6);
    expect(y).toBeCloseTo(50, 6);
  });

  test('Supr: en Q quita un punto; en Z, sobre un tramo del medio, parte la interna', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 100, y: 100 }, 300, 200);
    await dispatch(page, 'project/addInternalLine', { pieceId: 'A', line: { id: 'L', type: 'reference', path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] }, { type: 'L', values: [20, 120] },
    ] } });
    await activarHerramienta(page, 'q', 'editPattern');
    await clickAt(page, { x: 220, y: 220 });
    await page.keyboard.press('Delete');
    await expect.poll(async () => anclas((await internas(page))[0].path)).toEqual([[20, 20], [120, 20], [20, 120]]);

    await page.keyboard.press('ControlOrMeta+z');
    await activarHerramienta(page, 'z', 'select');
    await clickAt(page, { x: 220, y: 170 });
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await internas(page)).length).toBe(2);
    // `removeTramosDeInterna` (projectSlice.ts): el primer trozo conserva el id
    // ('L'); el segundo nace con id nuevo. `quitarTramos` arma los trozos en el
    // orden de recorrido desde el punto de partida: [20,20]→[120,20] (antes del
    // tramo quitado) y [120,120]→[20,120] (después).
    await expect.poll(async () => (await internas(page))[0].id).toBe('L');
    await expect.poll(async () => anclas((await internas(page))[0].path)).toEqual([[20, 20], [120, 20]]);
    await expect.poll(async () => anclas((await internas(page))[1].path)).toEqual([[120, 120], [20, 120]]);
    expect((await st(page)).project.pieces).toHaveLength(1);
  });
});
