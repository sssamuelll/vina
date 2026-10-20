/**
 * La puerta de vuelta (spec 2026-10-02 § 5.2, P3c): lo que ya está puesto se
 * vuelve a abrir sobre el objeto. Un piquete, una esquina del margen y una
 * costura elegidos enseñan su etiqueta de opción, que abre los mismos
 * controles de la línea al pie. «P3 no cierra sin ella, con su e2e.»
 *
 * Es un e2e porque la pastilla es HTML anclado con pan y zoom sobre el svg,
 * su menú cuelga de <body>, el foco y Esc pasan por la escalera de lo que se
 * llama, y el clic en la punta del margen solo cae en el vacío de verdad en un
 * navegador.
 *
 * La pieza p1 es un rectángulo de 300 × 200 con la esquina en (100, 100): el
 * borde de arriba va de (100, 100) a (400, 100), en coordenadas de patrón.
 */
import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, cambiarVista } from './helpers/estados';
import { addPiece, activarHerramienta, clickAt, dispatch, toScreen } from './helpers/lienzo';

interface Linea {
  id: string;
  type: string;
  notchAnchor?: { distanceMm: number };
  notchOptions?: { shape?: string; length?: number; width?: number; count?: number };
}
interface Estado {
  project: {
    pieces: Array<{ id: string; internals: Linea[]; cornerTypes?: Record<number, string> }>;
    seams: Array<{ id: string; type: string }>;
  };
  editor: { selectedPieceIds: string[] };
}
type Ventana = { __VINA_STORE__: { getState: () => Estado } };

const estado = (page: Page) => page.evaluate(() => (window as unknown as Ventana).__VINA_STORE__.getState());
const piquetes = async (page: Page) =>
  (await estado(page)).project.pieces[0].internals.filter((l) => l.type === 'notch');
// Exacto con un texto: «Tipo de esquina: Inglete» también encontraría «… Inglete doble».
const etiqueta = (page: Page, nombre: string | RegExp) =>
  page.getByRole('button', typeof nombre === 'string' ? { name: nombre, exact: true } : { name: nombre });
const menu = (page: Page, nombre: string) => page.getByRole('group', { name: nombre });
const campoDistancia = (page: Page) => page.locator('input.cota--editando[aria-label="Distancia"]');

async function unaPieza(page: Page, alto = 768) {
  await page.setViewportSize({ width: 1366, height: alto });
  await abrirAppVacia(page);
  await addPiece(page, 'p1', { x: 100, y: 100 }, 300, 200);
}

/** Un piquete a 60 de la esquina de (100, 100), puesto con Piquete y elegido con Seleccionar. */
async function unPiqueteElegido(page: Page) {
  await activarHerramienta(page, 'Shift+N', 'notch');
  await clickAt(page, { x: 160, y: 100 });
  await campoDistancia(page).press('Escape');
  await expect(campoDistancia(page)).toHaveCount(0);
  await activarHerramienta(page, 'z', 'select');
  // La punta del piquete entra 8 mm en la pieza: el clic cae sobre su trazo.
  await clickAt(page, { x: 160, y: 104 });
  await expect(etiqueta(page, /^Piquete: /)).toBeVisible();
}

test.describe('la puerta de vuelta (P3c)', () => {
  test.setTimeout(90_000);

  test('el piquete se elige con Seleccionar: su distancia en reposo y su etiqueta; Ctrl+Z la sigue', async ({ page }) => {
    await unaPieza(page);
    await unPiqueteElegido(page);

    await expect(etiqueta(page, 'Piquete: Recta · 8 × 3 mm')).toBeVisible();
    // La distancia descansa: una cota que se abre sola se lleva las teclas (P3b, firma D3).
    await expect(page.getByRole('button', { name: /^Distancia: / })).toBeVisible();
    await expect(page.locator('input.cota--editando')).toHaveCount(0);

    await etiqueta(page, 'Piquete: Recta · 8 × 3 mm').click();
    const m = menu(page, 'Opciones del piquete');
    await expect(m).toBeVisible();
    await m.getByRole('button', { name: 'En T' }).click();
    await expect.poll(async () => (await piquetes(page))[0].notchOptions?.shape).toBe('t-notch');
    await expect(etiqueta(page, 'Piquete: En T · 8 × 3 mm')).toBeVisible();

    // Más de 500 ms entre dos escrituras de la misma línea: si no, se funden
    // en un solo paso de deshacer y el Ctrl+Z de abajo no probaría nada.
    await page.waitForTimeout(700);
    await m.locator('.opcion-del-pie', { has: page.locator('#opcion-etiqueta-length') })
      .getByRole('button', { name: 'Sumar' }).click();
    await expect.poll(async () => (await piquetes(page))[0].notchOptions?.length).toBe(9);

    // Un Ctrl+Z devuelve la profundidad, y la pastilla lo enseña.
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await piquetes(page))[0].notchOptions?.length).toBe(8);
    await expect(etiqueta(page, 'Piquete: En T · 8 × 3 mm')).toBeVisible();

    // Esc cierra el menú antes que la selección; el siguiente suelta el piquete.
    await page.keyboard.press('Escape');
    await expect(m).toHaveCount(0);
    await expect(etiqueta(page, /^Piquete: /)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(etiqueta(page, /^Piquete: /)).toHaveCount(0);
  });

  test('un piquete en un lado vertical: la pastilla crece hacia dentro y no lo tapa', async ({ page }) => {
    // Revisión final de P3c (lente A): centrada, la pastilla tapaba el piquete y su borde.
    await unaPieza(page);
    await activarHerramienta(page, 'Shift+N', 'notch');
    // El lado izquierdo, x = 100. Si un clic cae en el relleno y no en el borde, se prueba otra altura.
    let yPuesto = 0;
    for (const y of [160, 200, 240, 140]) {
      await clickAt(page, { x: 100, y });
      if (await campoDistancia(page).isVisible()) { yPuesto = y; break; }
    }
    expect(yPuesto, 'ningún clic sobre el lado izquierdo puso el piquete').toBeGreaterThan(0);
    await campoDistancia(page).press('Escape');
    await activarHerramienta(page, 'z', 'select');
    await clickAt(page, { x: 104, y: yPuesto });
    await expect(etiqueta(page, /^Piquete: /)).toBeVisible();

    for (const punto of [{ x: 100, y: yPuesto }, { x: 104, y: yPuesto }]) {
      const s = await toScreen(page, punto);
      const tapado = await page.evaluate(([x, y]) =>
        Boolean(document.elementFromPoint(x, y)?.closest('.etiqueta-de-opcion')), [s.x, s.y]);
      expect(tapado, `la pastilla tapa (${punto.x}, ${punto.y})`).toBe(false);
    }
  });

  test('la distancia del piquete elegido se escribe y lo mueve por su ancla', async ({ page }) => {
    await unaPieza(page);
    await unPiqueteElegido(page);

    await page.getByRole('button', { name: /^Distancia: / }).click();
    await expect(campoDistancia(page)).toBeFocused();
    await campoDistancia(page).fill('150');
    await campoDistancia(page).press('Enter');
    await expect.poll(async () => (await piquetes(page))[0].notchAnchor?.distanceMm).toBeCloseTo(150, 1);
    await expect(etiqueta(page, /^Piquete: /)).toBeVisible();
  });

  test('la esquina del margen se elige con Seleccionar en su punta y cambia de tipo; dentro de la pieza, el clic es de la pieza', async ({ page }) => {
    await unaPieza(page);
    await dispatch(page, 'project/batchSetSeamAllowance', { pieceIds: ['p1'], width: 10 });
    await activarHerramienta(page, 'z', 'select');

    // La punta del margen de la esquina de (100, 100) cae en (90, 90).
    await clickAt(page, { x: 93, y: 93 });
    await expect(etiqueta(page, 'Tipo de esquina: Inglete')).toBeVisible();
    await etiqueta(page, 'Tipo de esquina: Inglete').click();
    await menu(page, 'Opciones de la esquina').getByRole('button', { name: 'Cuadrada' }).click();
    await expect.poll(async () => (await estado(page)).project.pieces[0].cornerTypes?.[0]).toBe('squared');
    await expect(etiqueta(page, 'Tipo de esquina: Cuadrada')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(etiqueta(page, /^Tipo de esquina/)).toHaveCount(0);

    await clickAt(page, { x: 104, y: 104 });
    await expect.poll(async () => (await estado(page)).editor.selectedPieceIds).toEqual(['p1']);
    await expect(etiqueta(page, /^Tipo de esquina/)).toHaveCount(0);
  });

  test('una esquina pegada al borde de la hoja: la pastilla se queda dentro de la hoja', async ({ page }) => {
    // Las capturas de P3c la enseñaron cortada («…lete»): fuera del vértice,
    // hacia arriba y a la izquierda, se salía de la hoja.
    await unaPieza(page);
    await dispatch(page, 'project/batchSetSeamAllowance', { pieceIds: ['p1'], width: 10 });
    await dispatch(page, 'editor/setZoom2D', 1);
    // La esquina de (100, 100) queda a 20 px del borde de arriba a la izquierda de la hoja.
    await dispatch(page, 'editor/setPan2D', { x: -80, y: -80 });
    await page.waitForTimeout(300);
    await activarHerramienta(page, 'z', 'select');
    await clickAt(page, { x: 93, y: 93 });

    const pastilla = etiqueta(page, /^Tipo de esquina/);
    await expect(pastilla).toBeVisible();
    const caja = (await pastilla.boundingBox())!;
    const hoja = (await page.locator('.pattern-editor').boundingBox())!;
    expect(caja.x, 'se sale por la izquierda').toBeGreaterThanOrEqual(hoja.x);
    expect(caja.y, 'se sale por arriba').toBeGreaterThanOrEqual(hoja.y);
    expect(caja.x + caja.width, 'se sale por la derecha').toBeLessThanOrEqual(hoja.x + hoja.width);
    expect(caja.y + caja.height, 'se sale por abajo').toBeLessThanOrEqual(hoja.y + hoja.height);
  });

  test('Margen: el clic en la esquina trae su etiqueta y no abre Propiedades', async ({ page }) => {
    await unaPieza(page);
    await dispatch(page, 'project/batchSetSeamAllowance', { pieceIds: ['p1'], width: 10 });
    await activarHerramienta(page, 'o', 'seamAllowance');

    await clickAt(page, { x: 100, y: 100 });
    await expect(etiqueta(page, 'Tipo de esquina: Inglete')).toBeVisible();
    await expect(page.locator('.context-panel'), 'la esquina volvió a abrir Propiedades').toHaveCount(0);
  });

  test('la costura recién cosida trae su etiqueta; Editar costuras la vuelve a traer; Seleccionar no pinta costuras (#210)', async ({ page }) => {
    await unaPieza(page);
    await addPiece(page, 'p2', { x: 500, y: 100 }, 300, 200);
    await activarHerramienta(page, 'n', 'seam');
    // El lado derecho de p1 con el izquierdo de p2: Coser pide otra pieza para la segunda mitad.
    await clickAt(page, { x: 400, y: 200 });
    await clickAt(page, { x: 500, y: 200 });
    await expect.poll(async () => (await estado(page)).project.seams.length).toBe(1);
    await expect(etiqueta(page, 'Tipo de costura: Normal')).toBeVisible();

    await etiqueta(page, 'Tipo de costura: Normal').click();
    await menu(page, 'Opciones de la costura').getByRole('button', { name: 'Francesa' }).click();
    await expect.poll(async () => (await estado(page)).project.seams[0].type).toBe('french');

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(etiqueta(page, /^Tipo de costura/)).toHaveCount(0);

    await activarHerramienta(page, 'b', 'seamEdit');
    await clickAt(page, { x: 400, y: 200 });
    await expect(etiqueta(page, 'Tipo de costura: Francesa')).toBeVisible();

    await page.keyboard.press('Escape');
    await activarHerramienta(page, 'z', 'select');
    await expect(page.locator('.seam-connection')).toHaveCount(0);
  });

  test('el teclado: Enter abre la etiqueta con el foco dentro, y Esc lo devuelve', async ({ page }) => {
    await unaPieza(page);
    await unPiqueteElegido(page);

    const pastilla = etiqueta(page, /^Piquete: /);
    await pastilla.focus();
    await page.keyboard.press('Enter');
    const m = menu(page, 'Opciones del piquete');
    await expect(m).toBeVisible();
    await expect.poll(() => m.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(m).toHaveCount(0);
    await expect(pastilla).toBeFocused();
  });

  test('en Split, a 1366 × 643, la etiqueta cae dentro de la hoja', async ({ page }) => {
    await unaPieza(page, 643);
    await cambiarVista(page, 'Split');
    await page.waitForTimeout(400);
    await unPiqueteElegido(page);

    const caja = await etiqueta(page, /^Piquete: /).boundingBox();
    expect(caja, 'la etiqueta no tiene caja').not.toBeNull();
    const encima = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return Boolean(el?.closest('.etiqueta-de-opcion'));
    }, [caja!.x + caja!.width / 2, caja!.y + caja!.height / 2]);
    expect(encima, 'algo tapa la etiqueta en Split').toBe(true);
  });
});
