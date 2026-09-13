/**
 * Cierre de las seis firmas de María (2026-09-13).
 *
 * Cada caso cruza la acción visible con el dato que queda en el proyecto. Las
 * pruebas largas que originaron cada firma siguen en sus archivos propios;
 * esta suite solo fija los cruces que se pueden perder al integrar las seis.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { waitForApp } from './helpers/sim';
import { activarHerramienta, addPiece, clickAt, dispatch, st, toScreen } from './helpers/lienzo';

type Cmd = {
  type: string;
  values: number[];
  authoredAnchor?: true;
  manualBezier?: true;
};

type Estado = Awaited<ReturnType<typeof st>> & {
  editor: Awaited<ReturnType<typeof st>>['editor'] & {
    lineLengthMode: 'creation' | 'all' | 'none';
    selectedInternalLine: { pieceId: string; lineId: string; segmentIndex?: number } | null;
  };
  project: Awaited<ReturnType<typeof st>>['project'] & {
    pieces: Array<Awaited<ReturnType<typeof st>>['project']['pieces'][number] & { outline: Cmd[] }>;
  };
};

const estado = (page: Page) => st(page) as Promise<Estado>;
const lecturasDeLado = (page: Page) => page.locator('.cota--lectura:not([data-lectura-hover])');
const campo = (page: Page, nombre: 'Largo' | 'Ángulo') => page.getByRole('textbox', { name: nombre });

async function arrastrar(page: Page, desde: { x: number; y: number }, hasta: { x: number; y: number }) {
  const a = await toScreen(page, desde);
  const b = await toScreen(page, hasta);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

function extremo(cmd: Cmd) {
  return { x: cmd.values.at(-2)!, y: cmd.values.at(-1)! };
}

function bezierAt(origen: { x: number; y: number }, cmd: Cmd, t: number) {
  const u = 1 - t;
  const [x1, y1, x2, y2, x3, y3] = cmd.values;
  const coord = (a: number, b: number, c: number, d: number) =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  return { x: coord(origen.x, x1, x2, x3), y: coord(origen.y, y1, y2, y3) };
}

async function prepararPerpendicularAlBorde(page: Page) {
  await waitForApp(page);
  await addPiece(page, 'base', { x: 200, y: 200 }, 200, 150);
  await activarHerramienta(page, 'h', 'pen');
  await clickAt(page, { x: 400, y: 275 });
  const haciaDentro = await toScreen(page, { x: 340, y: 275 });
  await page.mouse.move(haciaDentro.x, haciaDentro.y);
  await expect(page.locator('.pen-distance-label text').first()).toContainText(/90[.,]0° al borde/);
  return haciaDentro;
}

test.describe('seis firmas de María', () => {
  test.setTimeout(120_000);

  test('D1: Largos recorre los tres modos, persiste y una interna suprime el contorno', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'fria', { x: 80, y: 100 }, 200, 150);

    const largos = page.getByRole('combobox', { name: 'Largos' });
    await expect(largos).toHaveValue('creation');
    await expect(lecturasDeLado(page), 'una pieza cargada no está caliente').toHaveCount(0);

    // Solo la pieza recién creada por la herramienta aparece en "Al crear".
    await activarHerramienta(page, 's', 'rectangle');
    await arrastrar(page, { x: 380, y: 100 }, { x: 580, y: 250 });
    await expect.poll(async () => (await estado(page)).project.pieces.length).toBe(2);
    await expect(page.getByRole('button', { name: /^Ancho de la pieza:/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Alto de la pieza:/ })).toBeVisible();
    await expect(lecturasDeLado(page), 'Al crear no completó los otros dos lados de la pieza caliente').toHaveCount(2);

    // Salir de la herramienta enfría esa pieza: Al crear vuelve a quedar vacío.
    await activarHerramienta(page, 'z', 'select');
    await expect(lecturasDeLado(page)).toHaveCount(0);

    await largos.selectOption('all');
    // La pieza seleccionada ya tiene Ancho/Alto como chips: esas dos lecturas
    // no se duplican. Seis lecturas + dos chips siguen cubriendo ocho lados.
    await expect(lecturasDeLado(page)).toHaveCount(6);
    await largos.selectOption('none');
    await expect(lecturasDeLado(page)).toHaveCount(0);
    await largos.selectOption('all');
    await expect(lecturasDeLado(page)).toHaveCount(6);

    await dispatch(page, 'project/addInternalLine', {
      pieceId: 'fria',
      line: {
        id: 'interna', type: 'reference',
        path: [{ type: 'M', values: [50, 75] }, { type: 'L', values: [150, 75] }],
      },
    });
    await clickAt(page, { x: 180, y: 175 });
    await expect.poll(async () => (await estado(page)).editor.selectedInternalLine).toMatchObject({
      pieceId: 'fria', lineId: 'interna',
    });
    await expect(lecturasDeLado(page), 'la selección interna dejó cotas del contorno en Todas').toHaveCount(0);

    await expect.poll(() => page.evaluate(async () => {
      const req = indexedDB.open('vina');
      const db = await new Promise<IDBDatabase | null>(resolve => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (!db?.objectStoreNames.contains('settings')) return null;
      const value = await new Promise<unknown>(resolve => {
        const get = db.transaction('settings').objectStore('settings').get('line-length-mode');
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => resolve(null);
      });
      db.close();
      return value;
    }), { timeout: 5000 }).toBe('all');

    await page.reload();
    await page.waitForSelector('svg.pattern-svg', { timeout: 15_000 });
    await expect.poll(async () => (await estado(page)).editor.lineLengthMode).toBe('all');
    await expect(page.getByRole('combobox', { name: 'Largos' })).toHaveValue('all');
  });

  test('D2: el primer ángulo conserva los 90° al borde y coloca la coordenada exacta', async ({ page }) => {
    await prepararPerpendicularAlBorde(page);
    await page.keyboard.press('Tab');
    await expect(campo(page, 'Largo')).toBeVisible();
    await expect(campo(page, 'Ángulo')).toBeVisible();
    await expect(page.getByText('° al borde', { exact: true })).toBeVisible();

    await campo(page, 'Largo').fill('60');
    expect(Number((await campo(page, 'Ángulo').inputValue()).replace(',', '.'))).toBeCloseTo(90, 6);
    await page.keyboard.press('Enter');
    await expect(campo(page, 'Largo')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await expect.poll(async () => (await estado(page)).project.trazos.length).toBe(1);
    const path = (await estado(page)).project.trazos[0].path as Cmd[];
    expect(extremo(path[0])).toEqual({ x: 400, y: 275 });
    expect(extremo(path[1]).x).toBeCloseTo(340, 5);
    expect(extremo(path[1]).y).toBeCloseTo(275, 5);
  });

  test('D6: clic derecho congela la misma perpendicular sin abrir menú', async ({ page }) => {
    const haciaDentro = await prepararPerpendicularAlBorde(page);
    await page.mouse.click(haciaDentro.x, haciaDentro.y, { button: 'right' });

    await expect(page.locator('.context-menu')).toHaveCount(0);
    await expect(campo(page, 'Largo')).toBeFocused();
    await expect(campo(page, 'Ángulo')).toBeVisible();
    expect(Number((await campo(page, 'Ángulo').inputValue()).replace(',', '.'))).toBeCloseTo(90, 6);
    await expect(page.getByText('° al borde', { exact: true })).toBeVisible();
    expect((await estado(page)).project.pieces).toHaveLength(1);
    expect((await estado(page)).project.trazos).toHaveLength(0);
  });

  test('D3: Punto crea una esquina visible y la marca sobrevive al moverla', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'punto', { x: 100, y: 100 }, 200, 150);
    const pieza = page.locator('[data-piece-id="punto"].pattern-piece');
    await expect(pieza.locator('.puntos-del-contorno [data-anchor-role="corner"]')).toHaveCount(4);

    await page.getByRole('button', { name: 'Punto', exact: true }).click();
    await expect.poll(async () => (await estado(page)).editor.activeTool).toBe('point');
    await clickAt(page, { x: 200, y: 100 });
    await expect.poll(async () => (await estado(page)).project.pieces[0].outline.length).toBe(6);

    let outline = (await estado(page)).project.pieces[0].outline;
    const indice = outline.findIndex(command => command.authoredAnchor === true);
    expect(indice, 'el punto de usuario no guardó su intención').toBeGreaterThan(0);
    await expect(pieza.locator('.puntos-del-contorno [data-anchor-role="corner"]')).toHaveCount(5);

    await activarHerramienta(page, 'q', 'editPattern');
    await clickAt(page, { x: 200, y: 175 });
    await expect(page.locator(`[data-command-index="${indice}"] [data-anchor-role="corner"]`)).toHaveCount(1);
    await arrastrar(page, { x: 200, y: 100 }, { x: 200, y: 112 });

    outline = (await estado(page)).project.pieces[0].outline;
    expect(outline[indice].authoredAnchor).toBe(true);
    await expect(page.locator(`[data-command-index="${indice}"] [data-anchor-role="corner"]`)).toHaveCount(1);
  });

  test('D5: curva por puntos oculta asas; Bézier libre conserva geometría y Undo las oculta otra vez', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'curva', { x: 200, y: 160 }, 320, 180);

    await clickAt(page, { x: 360, y: 160 }, 'right');
    await page.getByText('Convertir en curva por puntos', { exact: true }).click();
    await expect.poll(async () => (await estado(page)).project.pieces[0].outline.filter(c => c.type === 'C').length).toBe(4);
    await activarHerramienta(page, 'v', 'editCurve');
    await expect(page.locator('.node-editor')).toHaveCount(1);
    await expect(page.locator('.node-editor__control-handle'), 'V mostró asas de una curva por puntos').toHaveCount(0);

    await arrastrar(page, { x: 360, y: 160 }, { x: 360, y: 120 });
    const movido = (await estado(page)).project.pieces[0].outline;
    const curvas = movido.filter(command => command.type === 'C');
    const anclaMovida = curvas.find(command => extremo(command).y === Math.min(...curvas.map(c => extremo(c).y)));
    expect(anclaMovida, 'V no movió el punto de la curva').toBeDefined();
    const idx = movido.indexOf(anclaMovida!);
    const siguiente = movido[idx + 1];
    const ancla = extremo(anclaMovida!);
    const entrada = { x: ancla.x - anclaMovida!.values[2], y: ancla.y - anclaMovida!.values[3] };
    const salida = { x: siguiente.values[0] - ancla.x, y: siguiente.values[1] - ancla.y };
    const cruz = entrada.x * salida.y - entrada.y * salida.x;
    expect(Math.abs(cruz) / (Math.hypot(entrada.x, entrada.y) * Math.hypot(salida.x, salida.y))).toBeLessThan(1e-6);

    const anterior = extremo(movido[idx - 1]);
    const puntoDeTramo = bezierAt(anterior, anclaMovida!, 0.5);
    const posicion = (await estado(page)).project.pieces[0].position;
    await clickAt(page, { x: puntoDeTramo.x + posicion.x, y: puntoDeTramo.y + posicion.y }, 'right');
    const valoresAntes = movido.map(command => [...command.values]);
    await page.getByText('Convertir a Bézier libre', { exact: true }).click();

    await expect.poll(async () => (await estado(page)).project.pieces[0].outline.filter(c => c.manualBezier).length).toBe(4);
    expect((await estado(page)).project.pieces[0].outline.map(command => command.values)).toEqual(valoresAntes);
    await expect(page.locator('.node-editor__control-handle')).not.toHaveCount(0);
    mkdirSync('artifacts/seis-firmas-browser', { recursive: true });
    await page.screenshot({ path: 'artifacts/seis-firmas-browser/d5-bezier-libre.png' });

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await estado(page)).project.pieces[0].outline.some(c => c.manualBezier)).toBe(false);
    expect((await estado(page)).project.pieces[0].outline.map(command => command.values)).toEqual(valoresAntes);
    await expect(page.locator('.node-editor__control-handle')).toHaveCount(0);
  });
});
