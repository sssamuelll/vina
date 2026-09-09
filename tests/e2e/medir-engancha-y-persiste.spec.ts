/**
 * Reunión María 2026-09-07 — el grupo de Medir.
 *
 * Ella lo dijo dos veces, con seis meses de vocabulario de patronista:
 *
 *   [08:45] "no estoy tan segura de si estoy clicando justo en el punto azul
 *            o a 0,2 milímetros del punto azul"
 *   [15:10] sobre Línea interna, con alivio: "al llegar al punto del extremo
 *            sí que noto un tope […] tengo la certeza de que estoy en el
 *            punto 0,0"
 *   [15:59] "si el de medir fuera así… copiar eso para el de medir. Es tan
 *            simple como eso"
 *
 * Y NO es que Medir no enganche: engancha al CONTORNO (`snapToOutline`, 8 px),
 * o sea a la raya. `snapIndex` —lo que usa Línea interna— resuelve primero el
 * vértice. Las dos enganchan, a cosas distintas; por eso una le da certeza y
 * la otra no. Le falta PRIORIDAD DE VÉRTICE, no enganche.
 *
 * Esto ya estaba decidido y sin ejecutar: `2026-09-06-medir-design.md`, D1
 * ("el enganche de Medir es el de todos: `snapIndex`", radio 12) y D3 ("las
 * mediciones PERSISTEN y se borran desde la tira"). Este spec mide esas dos.
 *
 * Es e2e y no vitest porque el estado de Medir vive en el hook, no en el store:
 * lo único observable desde fuera es lo que ella ve pintado.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, addPiece, toScreen } from './helpers/lienzo';

/** Los números que Medir deja pintados sobre el lienzo. */
const medidas = (page: Page) => page.locator('.measure-lines text');

async function activar(page: Page, tecla: string, id: string) {
  await page.keyboard.press(tecla);
  await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe(id);
  await page.waitForTimeout(120);
}

/** Clic a `dx`,`dy` PÍXELES DE PANTALLA de un punto de patrón. */
async function clicCerca(page: Page, p: { x: number; y: number }, dx = 0, dy = 0) {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x + dx, s.y + dy);
  await page.waitForTimeout(80);
  await page.mouse.click(s.x + dx, s.y + dy);
  await page.waitForTimeout(200);
}

test.describe('Medir: engancha al vértice y la medida se queda', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    // Un rectángulo de 200 × 150 con la esquina en (100, 100) de patrón.
    await addPiece(page, 'pieza', { x: 100, y: 100 }, 200, 150);
  });

  test('D1 — clicar cerca de dos esquinas mide el lado exacto, no lo que hay bajo el dedo', async ({ page }) => {
    await activar(page, 'm', 'measure');

    // Los dos clics caen 4 px DENTRO del lado, lejos del vértice pero dentro
    // del radio de enganche. Con enganche al contorno cada uno cae donde está
    // el dedo y el lado sale corto; con prioridad de vértice, los dos caen en
    // la esquina y sale el lado entero.
    await clicCerca(page, { x: 100, y: 100 }, 4, 0);
    await clicCerca(page, { x: 300, y: 100 }, -4, 0);

    await expect(
      medidas(page).filter({ hasText: /200([.,]0)?\s*mm/ }),
      'el lado mide 200 mm: los dos clics tienen que haber caído en las esquinas',
    ).toHaveCount(1);
  });

  test('D1 — el vértice gana aunque el contorno de otra pieza esté más cerca', async ({ page }) => {
    // El detalle que la revisión del recon marcó: si la prioridad se resuelve
    // pieza por pieza, el contorno de una segunda pieza más cercana le gana al
    // vértice de la primera. La prioridad tiene que ser GLOBAL.
    // La vecina va ALTA y arranca arriba a propósito: así lo que compite es su
    // ARISTA izquierda, no su esquina. Con la vecina a la misma altura, su
    // vértice (306,100) quedaría a 4,47 px del clic —más cerca que el vértice
    // que queremos— y el caso mediría vértice contra vértice, que no es esto.
    await addPiece(page, 'vecina', { x: 306, y: 0 }, 100, 400);
    await activar(page, 'm', 'measure');

    // El clic cae en (304,104) con zoom 1. Las distancias, en píxeles:
    //   vértice de la primera (300,100) ....... 5,66   ← tiene que ganar
    //   contorno propio, arista derecha ....... 4,00
    //   contorno de la vecina, arista izq. .... 2,00
    //   vértice de la vecina (306,0) .......... lejísimos
    // El vértice está MÁS LEJOS que los dos contornos y aun así manda. Y como
    // uno de ellos es de otra pieza, la prioridad no puede resolverse pieza a
    // pieza: tiene que ser global.
    await clicCerca(page, { x: 300, y: 100 }, 4, 4);
    await clicCerca(page, { x: 100, y: 100 });

    await expect(
      medidas(page).filter({ hasText: /200([.,]0)?\s*mm/ }),
      'el vértice de la pieza de al lado no puede perder contra el contorno de la vecina',
    ).toHaveCount(1);
  });

  test('D2 — antes de clicar ya dice a qué distancia está del punto', async ({ page }) => {
    await activar(page, 'm', 'measure');

    // Su queja del 30-08, que sigue viva: "que al clicar aquí sepa que estoy a
    // tres milímetros de este punto". Es realimentación de un clic que TODAVÍA
    // NO ha ocurrido, así que va junto al cursor y no en un chip: un chip
    // promete escritura, y aquí no hay nada que escribir (spec D2).
    const s = await toScreen(page, { x: 100, y: 100 });
    await page.mouse.move(s.x + 10, s.y + 6);
    await page.waitForTimeout(250);

    await expect(
      page.locator('.measure-lines text').filter({ hasText: /\d+([.,]\d+)?\s*mm/ }),
      'acercarse a un vértice tiene que decir a cuánto está, sin haber clicado',
    ).not.toHaveCount(0);
  });

  test('D3 — la medida sobrevive al cambio de herramienta', async ({ page }) => {
    await activar(page, 'm', 'measure');
    await clicCerca(page, { x: 100, y: 100 });
    await clicCerca(page, { x: 300, y: 100 });
    await expect(medidas(page)).not.toHaveCount(0);

    // "Igual la quiero recordar durante un rato" — el borrado de hoy no es una
    // decisión, es el reflejo de limpiar estado al desmontar.
    await activar(page, 'z', 'select');
    await expect(
      medidas(page),
      'cambiar de herramienta no puede llevarse la medida que ella acaba de tomar',
    ).not.toHaveCount(0);
  });

  test('D3 — hay una puerta visible para borrarlas, y borra', async ({ page }) => {
    await activar(page, 'm', 'measure');
    await clicCerca(page, { x: 100, y: 100 });
    await clicCerca(page, { x: 300, y: 100 });
    await expect(medidas(page)).not.toHaveCount(0);

    // Ley de puertas del contrato de interfaz: si solo se llega por la paleta
    // de comandos, no está terminada. Y va en la tira, que es la cabina de la
    // herramienta, no en un botón flotante nuevo sobre el patrón.
    const borrar = page.getByRole('button', { name: /borrar medici/i });
    await expect(borrar, 'la tira de Medir tiene que ofrecer borrar las mediciones').toBeVisible();
    await borrar.click();
    await expect(medidas(page), 'y borrarlas de verdad').toHaveCount(0);
  });
});
