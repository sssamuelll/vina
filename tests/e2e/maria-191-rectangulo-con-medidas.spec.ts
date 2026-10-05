/**
 * maria-191 — "estaría bien que saliera un menú para configurar el alto y
 * ancho … en Clo cuando clicas con el izquierdo lo crea".
 *
 * Historia de este archivo: la primera versión (2026-08-29) certificaba en
 * verde que la barra alimentaba el SIGUIENTE rectángulo — la promesa que
 * escribimos nosotros. María volvió a quejarse al día siguiente (#223: "se ve
 * pero no sirve; una vez que clicas el rectángulo ya se forma y luego no se
 * puede editar") porque ella esperaba editar EL QUE TIENE DELANTE. Memoria:
 * `test-mide-nuestra-promesa-no-la-de-maria`.
 *
 * Ahora: un clic crea con el tamaño que diga la barra —de fábrica 100 × 100—
 * y las cotas sobre la pieza editan esa pieza (cotas-de-pieza.spec.ts las mide
 * a fondo). El arrastre dibuja a pulso y NO toca la barra: tras la reunión del
 * 2026-09-07 el tamaño de una pieza ya no se contagia a la siguiente, porque
 * "cada rectángulo va a ser de un tamaño distinto" [01:49]. La tira sigue
 * diciendo en su línea de sujeto qué crea el próximo clic.
 *
 * Spec: docs/superpowers/specs/2026-08-30-cotas-vivas-design.md § 3, § 6
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';

type Cmd = { type: string; values: number[] };
type StoreWindow = {
  __VINA_STORE__: {
    getState: () => {
      editor: { activeTool: string; zoom2D: number; pan2D: { x: number; y: number } };
      project: { pieces: Array<{ outline: Cmd[]; position: { x: number; y: number } }> };
      tools: { toolOptions: Record<string, Record<string, unknown>> };
    };
  };
};

const st = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());

async function toScreen(page: Page, p: { x: number; y: number }) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  const { editor } = await st(page);
  return { x: box.x + editor.pan2D.x + p.x * editor.zoom2D, y: box.y + editor.pan2D.y + p.y * editor.zoom2D };
}

const bbox = (outline: Cmd[], pos: { x: number; y: number }) => {
  const xs = outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0)).map(x => x + pos.x);
  const ys = outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1)).map(y => y + pos.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

test.describe('maria-191 — rectángulo con medidas', () => {
  test.setTimeout(90_000);

  test('un clic crea con el tamaño de la barra y la cota edita ESA pieza; el arrastre dibuja a pulso y no toca la barra', async ({ page }) => {
    await waitForApp(page);
    await page.keyboard.press('s');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('rectangle');

    // La línea al pie dice qué crea el próximo clic (no hay barra que editar).
    await expect(page.locator('.seccion-del-patron__texto')).toContainText('un clic crea uno de 100 × 100 mm');

    const s = await toScreen(page, { x: 250, y: 250 });
    await page.mouse.move(s.x, s.y);
    await page.mouse.click(s.x, s.y);
    await expect.poll(async () => (await st(page)).project.pieces.length).toBe(1);
    let pieces = (await st(page)).project.pieces;
    expect(bbox(pieces[0].outline, pieces[0].position)).toEqual({ x: 250, y: 250, w: 100, h: 100 });

    // La cota edita la pieza que tiene delante, no el siguiente rectángulo.
    await page.getByRole('button', { name: /^Ancho de la pieza:/ }).click();
    await page.keyboard.type('300');
    await page.keyboard.press('Enter');
    pieces = (await st(page)).project.pieces;
    expect(pieces).toHaveLength(1);
    expect(bbox(pieces[0].outline, pieces[0].position)).toEqual({ x: 250, y: 250, w: 300, h: 100 });

    // El arrastre sigue dibujando a pulso, pero YA NO escribe lo dibujado como
    // default (reunión María 07-09, [01:49]). El rótulo tampoco cambia: era
    // justo la contradicción que ella cazó en [01:22] — "pero ponía que de
    // 100" y le creaba otra cosa.
    // Estaba en y=500..560 de patrón, o sea y=536..596 de pantalla, y a
    // 1280×720 el `mouseup` caía DENTRO de `.fila-de-capas` (x 165..626,
    // y 584..626): el gesto terminaba sobre una superficie flotante en vez de
    // sobre el lienzo y la segunda pieza no llegaba a nacer. Roto desde que
    // existe esa fila (#1109/#1131), medido con `elementFromPoint`. Subirlo
    // 100 mm lo deja en y=436..496 de pantalla, con ~90 px de aire por debajo,
    // y sigue sin tocar la primera pieza (x 250..550, y 250..350).
    const a = await toScreen(page, { x: 100, y: 400 });
    const b = await toScreen(page, { x: 180, y: 460 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await st(page)).project.pieces.length).toBe(2);
    pieces = (await st(page)).project.pieces;
    expect(bbox(pieces[1].outline, pieces[1].position)).toEqual({ x: 100, y: 400, w: 80, h: 60 });
    await expect.poll(async () => (await st(page)).tools.toolOptions.rectangle?.width ?? 100).toBe(100);
    await expect.poll(async () => (await st(page)).tools.toolOptions.rectangle?.height ?? 100).toBe(100);

    // Deseleccionar: la línea al pie dice el tamaño del próximo clic, que sigue
    // siendo el de fábrica porque dibujar no lo cambió.
    await page.keyboard.press('Escape');
    await expect(page.locator('.seccion-del-patron__texto')).toContainText('un clic crea uno de 100 × 100 mm');
  });
});
