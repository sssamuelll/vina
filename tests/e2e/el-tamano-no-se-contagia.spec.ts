/**
 * Reunión María 2026-09-07, fallo 2 — el tamaño de una pieza no se contagia
 * a la siguiente.
 *
 * Ella dibuja un rectángulo, hace clic para poner otro, y sale del tamaño del
 * anterior:
 *
 *   [01:35] "ha ido repitiendo el primer rectángulo que yo he creado"
 *   [01:41] Samuel: "es inteligente, me gusta" — María: "ya, pero a mí no"
 *   [01:49] "en verdad no es una acción repetitiva, cada rectángulo va a ser
 *            de un tamaño distinto"
 *
 * Y antes de eso ya había cazado la contradicción con el propio rótulo:
 *   [01:22] "pero ponía que de 100"  — el rótulo prometía 100 y creó otra cosa.
 *
 * Había DOS escrituras implícitas del default: el arrastre (useRectangleTool)
 * y editar la cota de una pieza recién nacida (`escribirDefault`, el "Adjust
 * Last Operation" de Blender). Las dos se retiran. Lo que NO se retira es la
 * barra de la herramienta: si ella escribe una medida ahí, el clic la respeta.
 * Se va la ruta implícita, se queda la deliberada.
 *
 * `cotas-de-pieza.spec.ts` cubre la otra escritura (la cota caliente); este
 * spec cubre el arrastre y los dos hermanos que comparten el mecanismo,
 * círculo y triángulo, que María no llegó a tocar en esta sesión.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';

type Cmd = { type: string; values: number[] };
type Piece = { id: string; outline: Cmd[]; position: { x: number; y: number } };
type StoreWindow = {
  __VINA_STORE__: {
    getState: () => {
      editor: { activeTool: string; zoom2D: number; pan2D: { x: number; y: number } };
      project: { pieces: Piece[] };
      tools: { toolOptions: Record<string, Record<string, unknown>> };
    };
  };
};

const st = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());

const bbox = (p: Piece) => {
  const xs = p.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0)).map(x => x + p.position.x);
  const ys = p.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1)).map(y => y + p.position.y);
  return { w: Math.round(Math.max(...xs) - Math.min(...xs)), h: Math.round(Math.max(...ys) - Math.min(...ys)) };
};

async function toScreen(page: Page, p: { x: number; y: number }) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  const { editor } = await st(page);
  return { x: box.x + editor.pan2D.x + p.x * editor.zoom2D, y: box.y + editor.pan2D.y + p.y * editor.zoom2D };
}

async function activar(page: Page, tecla: string, id: string) {
  await page.keyboard.press(tecla);
  await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe(id);
}

/** Arrastra de `a` a `b` en coordenadas de patrón. */
async function arrastrar(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  const sa = await toScreen(page, a);
  const sb = await toScreen(page, b);
  await page.mouse.move(sa.x, sa.y);
  await page.mouse.down();
  await page.mouse.move(sb.x, sb.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function clicEn(page: Page, p: { x: number; y: number }) {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(250);
}

test.describe('el tamaño de una pieza no se contagia a la siguiente', () => {
  test.setTimeout(90_000);
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('rectángulo: arrastrar uno grande no cambia lo que crea el siguiente clic', async ({ page }) => {
    await activar(page, 's', 'rectangle');

    const barraAntes = (await st(page)).tools.toolOptions.rectangle;

    // Dibuja uno de 300 × 200 arrastrando, como hizo ella.
    await arrastrar(page, { x: 100, y: 100 }, { x: 400, y: 300 });
    await expect.poll(async () => (await st(page)).project.pieces.length).toBe(1);
    expect(bbox((await st(page)).project.pieces[0]), 'el arrastre dibuja lo arrastrado').toMatchObject({ w: 300, h: 200 });

    // Y ahora un clic suelto, lejos del primero.
    await clicEn(page, { x: 100, y: 500 });
    await expect.poll(async () => (await st(page)).project.pieces.length).toBe(2);

    expect(
      bbox((await st(page)).project.pieces[1]),
      'el clic crea el tamaño de fábrica, no el del rectángulo anterior',
    ).toMatchObject({ w: 100, h: 100 });

    expect(
      (await st(page)).tools.toolOptions.rectangle,
      'dibujar no puede reescribir la barra por su cuenta',
    ).toEqual(barraAntes);
  });

  test('la barra sigue mandando cuando la escribe ella', async ({ page }) => {
    await activar(page, 's', 'rectangle');

    // Es la ruta deliberada y NO se retira: si ella pide 250 × 180, el clic
    // tiene que dárselo. Sin esto, quitar el contagio se llevaría por delante
    // la única forma de crear un tamaño exacto sin arrastrar.
    await page.evaluate(() => {
      const w = window as unknown as StoreWindow & { __VINA_STORE__: { dispatch: (a: unknown) => void } };
      w.__VINA_STORE__.dispatch({ type: 'tools/setToolOption', payload: { toolId: 'rectangle', optionId: 'width', value: 250 } });
      w.__VINA_STORE__.dispatch({ type: 'tools/setToolOption', payload: { toolId: 'rectangle', optionId: 'height', value: 180 } });
    });

    await clicEn(page, { x: 100, y: 100 });
    await expect.poll(async () => (await st(page)).project.pieces.length).toBe(1);
    expect(bbox((await st(page)).project.pieces[0])).toMatchObject({ w: 250, h: 180 });
  });

  test('los hermanos: círculo y triángulo tampoco contagian', async ({ page }) => {
    // María no los tocó en esta sesión, pero comparten el mecanismo
    // (`escribirDefault` y el guardado del arrastre). Arreglar solo el
    // rectángulo dejaría los otros dos rotos igual.
    await activar(page, 'e', 'circle');
    const circuloAntes = (await st(page)).tools.toolOptions.circle;
    await arrastrar(page, { x: 100, y: 100 }, { x: 400, y: 400 });
    await expect.poll(async () => (await st(page)).project.pieces.length).toBe(1);
    expect(
      (await st(page)).tools.toolOptions.circle,
      'dibujar un círculo no reescribe su radio de la barra',
    ).toEqual(circuloAntes);

    // El triángulo se activa por dispatch y no por tecla a propósito: NO TIENE
    // ATAJO en `src/shortcuts/defaults.ts` (rectángulo tiene `s`, elipse `e`,
    // el triángulo nada). Es un hueco real de la ley de puertas, ajeno a este
    // arreglo — se anota, no se tapa aquí. Van los dos despachos porque
    // `activate2DTool` los exige juntos: uno solo deja la herramienta a medias.
    await page.evaluate(() => {
      const w = window as unknown as { __VINA_STORE__: { dispatch: (a: unknown) => void } };
      w.__VINA_STORE__.dispatch({ type: 'editor/setActiveTool', payload: 'triangle' });
      w.__VINA_STORE__.dispatch({ type: 'tools/setActiveTool2D', payload: 'triangle' });
    });
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('triangle');
    const trianguloAntes = (await st(page)).tools.toolOptions.triangle;
    // Dentro de la misma zona que el círculo: más a la derecha (x 600..900) se
    // sale del lienzo visible y el arrastre no crea nada. Que se solape con el
    // círculo da igual — lo que mide este caso es la barra, no la geometría.
    await arrastrar(page, { x: 150, y: 150 }, { x: 350, y: 350 });
    await expect.poll(async () => (await st(page)).project.pieces.length).toBe(2);
    expect(
      (await st(page)).tools.toolOptions.triangle,
      'dibujar un triángulo no reescribe su base/altura de la barra',
    ).toEqual(trianguloAntes);
  });
});
