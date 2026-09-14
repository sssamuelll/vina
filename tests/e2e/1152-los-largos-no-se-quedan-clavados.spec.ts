/**
 * #1152 — las lecturas de largo se quedaban clavadas al arrastrar la pieza.
 *
 * María, reunión del 2026-09-10 [10:56]: *"al mover, que se vayan así las
 * medidas, claro… cuando no se vean por defecto siempre pues no pasará eso,
 * pero está raro"*. Fotograma `t_10-50.jpg`: la pieza ya está en otro sitio y
 * los cuatro largos (`529,3` / `237,4` / `100,0` / `500,0`) siguen donde estaba.
 *
 * El mecanismo: el arrastre mueve el grupo por DOM y solo despacha `movePiece`
 * al soltar, así que `CotasLayer` pinta desde el `piece.position` viejo de
 * Redux. El candado de #194 ya tapaba los overlays durante el arrastre, pero la
 * lista de las lecturas nació después (contrato 09-09 D1) y nadie la metió
 * debajo.
 *
 * NOTA HONESTA sobre este archivo: el arreglo entró antes que la prueba. El
 * término `isDraggingPiece` llegó a `suppressLengths` con la PR #1166 por otra
 * puerta (el sujeto fino de #1153) y cerró este issue de paso, sin que nadie lo
 * notara. Esto no es TDD: es la red que el issue pedía, escrita después. Para
 * que no sea una verificación floja se comprobó que MUERDE — quitando
 * `isDraggingPiece` (y `transformTool.isDragging`) de `suppressLengths` los dos
 * casos de abajo se ponen rojos.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, addPiece, toScreen } from './helpers/lienzo';

const lecturas = (page: Page) => page.locator('.cota--lectura');
const posDe = async (page: Page) =>
  (await st(page)).project.pieces.find(p => p.id === 'p1')!.position;

async function encenderLargos(page: Page) {
  const largos = page.getByRole('button', { name: 'Largos', exact: true });
  await expect(largos).toBeVisible();
  await expect(largos, 'nace apagado (firma de María del 13-09)').toHaveAttribute('aria-pressed', 'false');
  await largos.click();
  await expect(largos).toHaveAttribute('aria-pressed', 'true');
}

test.describe('#1152 — los largos no se quedan donde ya no está la pieza', () => {
  test.setTimeout(120_000);

  test('durante el arrastre no hay ninguna lectura, y al soltar vuelven en el sitio nuevo', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);
    await page.keyboard.press('z');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('select');

    await encenderLargos(page);
    await expect(lecturas(page), 'con el interruptor encendido la pieza enseña sus largos').toHaveCount(4);
    const cajaAntes = await lecturas(page).first().boundingBox();
    expect(cajaAntes).not.toBeNull();

    const posAntes = await posDe(page);
    const centro = await toScreen(page, { x: 200, y: 150 });
    await page.mouse.move(centro.x, centro.y);
    await page.mouse.down();
    // En dos tramos para que el estado intermedio exista de verdad y no se lo
    // salte el navegador; sin pasarse, para que la pieza no se salga de vista.
    await page.mouse.move(centro.x + 40, centro.y + 25, { steps: 8 });
    await page.mouse.move(centro.x + 90, centro.y + 50, { steps: 8 });

    // Sin soltar: esto es exactamente el fotograma que ella enseñó.
    await expect(
      lecturas(page),
      'mientras la pieza va en el aire ningún largo puede seguir anclado al sitio viejo',
    ).toHaveCount(0);

    await page.mouse.up();
    await page.waitForTimeout(300);

    // Vuelven DOS, no cuatro, y está bien: al soltar la pieza queda
    // seleccionada, y sobre los dos lados que llevan chip editable (el Ancho y
    // el Alto del transform box) la lectura la sustituye el chip
    // (`CotasLayer.tsx`: "solo el chip que está presente sobre ESTE lado
    // sustituye su lectura"). Lo que importa es que vuelva a haberlas.
    await expect(lecturas(page), 'al soltar las lecturas vuelven').not.toHaveCount(0);

    const posDespues = await posDe(page);
    const { zoom2D } = (await st(page)).editor;
    const recorrido = Math.hypot(posDespues.x - posAntes.x, posDespues.y - posAntes.y) * zoom2D;
    expect(recorrido, 'este caso solo vale si la pieza se movió de verdad').toBeGreaterThan(50);

    // Y vuelven CON la pieza: si el arreglo fuera solo esconderlas,
    // reaparecerían en el mismo píxel y el caso pasaría en verde con el bug
    // dentro. El listón sale de lo que la pieza se movió en Redux, no de un
    // número escogido a ojo — así el enganche a la cuadrícula no lo falsea.
    const cajaDespues = await lecturas(page).first().boundingBox();
    expect(cajaDespues).not.toBeNull();
    expect(
      Math.hypot(cajaDespues!.x - cajaAntes!.x, cajaDespues!.y - cajaAntes!.y),
      'la lectura tiene que haberse movido con su lado, no reaparecer donde estaba',
    ).toBeGreaterThan(recorrido * 0.7);
  });

  test('redimensionar con el transform box también las calla', async ({ page }) => {
    // El hermano. `suppressLengths` tapa tres arrastres —la pieza, el transform
    // box y un extremo— y si el candado se pusiera solo en el primero este caso
    // lo diría. Aquí importa el gesto exacto: `transformTool.isDragging` solo se
    // enciende agarrando un TIRADOR (`hitTestHandle`), no el cuerpo de la
    // pieza. Y mientras se redimensiona los largos están cambiando, así que una
    // lectura vieja en pantalla es justo la queja de María.
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);
    await page.keyboard.press('z');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('select');
    await encenderLargos(page);

    const centro = await toScreen(page, { x: 200, y: 150 });
    await page.mouse.click(centro.x, centro.y);
    await expect.poll(async () => (await st(page)).editor.selectedPieceIds.length, { timeout: 5000 }).toBe(1);

    await page.keyboard.press('a');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('transform');
    await expect(lecturas(page), 'con Transformar y el interruptor encendido siguen a la vista').not.toHaveCount(0);

    // La esquina inferior derecha del bbox: ahí vive un tirador.
    const esquina = await toScreen(page, { x: 400, y: 300 });
    await page.mouse.move(esquina.x, esquina.y);
    await page.mouse.down();
    await page.mouse.move(esquina.x + 30, esquina.y + 20, { steps: 6 });
    await page.mouse.move(esquina.x + 80, esquina.y + 60, { steps: 6 });
    await expect(lecturas(page), 'redimensionando, ningún largo puede seguir diciendo el de antes').toHaveCount(0);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(lecturas(page), 'al soltar vuelven').not.toHaveCount(0);
  });
});
