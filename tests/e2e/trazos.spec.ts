/**
 * Trazos — líneas de construcción (spec 2026-09-12 § 9). En el orden en que
 * María lo haría el 10-09: rayas sueltas con la Pluma, sin avisos, y la pieza
 * calcada encima enganchando a ellas.
 *
 * Cada recorrido afirma las DOS caras: lo que el store guarda y lo que ella
 * ve (el `<g data-trazo-id>` pintado, el chip de la cota, la tira) o lo que la
 * caja negra registró (`pen:complete`, `pen:press` con su `snap`).
 *
 * Geometría: el lienzo arranca en `zoom2D = 1` y `pan2D = 0,0`, así que un
 * milímetro de patrón es un píxel de pantalla y los 3 mm de los clics de
 * enganche caen holgados dentro de `EDGE_HIT_PX = 12`.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, toScreen, activarHerramienta, addPiece } from './helpers/lienzo';
import { leerBitacora } from './helpers/bitacora';

type Cmd = { type: string; values: number[] };
type Estado = Awaited<ReturnType<typeof st>> & {
  project: { trazos: Array<{ id: string; path: Cmd[] }> };
  editor: { selectedTrazo: { trazoId: string; segmentIndex: number } | null; showTrazos: boolean };
};
const estado = (page: Page) => st(page) as Promise<Estado>;

const cuantosTrazos = (page: Page) => estado(page).then(e => e.project.trazos.length);
const cuantasPiezas = (page: Page) => estado(page).then(e => e.project.pieces.length);

async function clic(page: Page, p: { x: number; y: number }) {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(120);
}

/** Punto absoluto de un comando de contorno (la pieza nace con `position` 0,0). */
const abs = (p: { outline: Cmd[]; position: { x: number; y: number } }, i: number) => {
  const v = p.outline[i].values;
  return { x: v[v.length - 2] + p.position.x, y: v[v.length - 1] + p.position.y };
};

const aviso = (page: Page) => page.locator('text=abierta: no se puede simular');

/**
 * La bitácora se lee por la puerta de María (Vina ▸ Archivo ▸ Exportar
 * diagnóstico), y ese menú abre el submenú que tenga el cursor encima: si el
 * último clic dejó el ratón bajo el desplegable, se abre «Vista» y «Archivo»
 * no llega nunca. Aparcar el ratón lejos antes de leer.
 */
async function bitacora(page: Page) {
  await page.mouse.move(1270, 700);
  return leerBitacora(page);
}

test.describe('trazos — líneas de construcción', () => {
  test.setTimeout(120_000);

  test('dos clics y Enter → un trazo, ninguna pieza, ningún aviso', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 });
    await page.keyboard.press('Enter');
    await expect.poll(() => cuantosTrazos(page), { timeout: 5000 }).toBe(1);

    const e = await estado(page);
    expect(e.project.pieces, 'dos nodos no tienen área: no puede salir una pieza').toHaveLength(0);
    // La Pluma dejó de poder crear piezas abiertas (§ 3.1): el aviso no aparece.
    await expect(aviso(page)).toHaveCount(0);
    expect(e.editor.selectedTrazo, 'un trazo terminado no queda seleccionado (#1154)').toBeNull();
    await expect(page.locator('[data-trazo-id]'), 'el trazo no se pintó').toHaveCount(1);

    const fin = (await bitacora(page)).find(ev => ev.name === 'pen:complete');
    expect(fin?.data).toMatchObject({ kind: 'trazo', nodes: 2, via: 'enter' });
  });

  test('tres clics y Enter → pieza cerrada, ningún trazo', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 }); await clic(page, { x: 300, y: 250 });
    await page.keyboard.press('Enter');
    await expect.poll(() => cuantasPiezas(page), { timeout: 5000 }).toBe(1);

    const e = await estado(page);
    expect(e.project.pieces[0].outline.at(-1)?.type, 'la pieza no cerró en Z').toBe('Z');
    expect(e.project.trazos, 'cerrada es pieza: no queda además un trazo').toHaveLength(0);
    await expect(page.locator('[data-trazo-id]')).toHaveCount(0);
  });

  test('tres clics y Esc → trazo de tres nodos; la bitácora dice via esc', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 }); await clic(page, { x: 300, y: 250 });
    await page.keyboard.press('Escape');
    await expect.poll(() => cuantosTrazos(page), { timeout: 5000 }).toBe(1);

    const e = await estado(page);
    // Esc TERMINA el trazo, no lo tira (§ 3.2): nunca se pierde lo dibujado.
    expect(e.project.trazos[0].path).toHaveLength(3);
    expect(e.project.pieces).toHaveLength(0);
    await expect(page.locator('[data-trazo-id]')).toHaveCount(1);

    const fin = (await bitacora(page)).find(ev => ev.name === 'pen:complete');
    expect(fin?.data).toMatchObject({ kind: 'trazo', nodes: 3, via: 'esc' });
  });

  test('Tab, 100, Enter, Esc → queda el trazo con su tramo de 100 (#1161 fallo 3)', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 });
    await page.keyboard.press('Tab');
    await expect(page.locator('input.cota--editando[aria-label="Largo"]')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Control+a'); await page.keyboard.type('100');
    await page.keyboard.press('Enter');
    // Colocar re-ancla el par al nodo nuevo y REABRE el chip de Largo para
    // encadenar (cotas vivas § 5.4): de ahí los tres peldaños de Escape.
    await expect(page.locator('input.cota--editando[aria-label="Largo"]')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape'); // 1.º: cierra la edición del chip
    await expect(page.locator('.cotas button.cota[aria-label^="Largo:"]')).toHaveCount(1);
    await page.keyboard.press('Escape'); // 2.º: suelta el tramo congelado
    await expect(page.locator('.cotas button.cota[aria-label^="Largo:"]')).toHaveCount(0);
    await page.keyboard.press('Escape'); // 3.º: termina el trazo
    await expect.poll(() => cuantosTrazos(page), { timeout: 5000 }).toBe(1);

    const e = await estado(page);
    const [a, b] = e.project.trazos[0].path.map(c => c.values);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1]), 'el tramo escrito no mide lo que ella escribió').toBeCloseTo(100, 3);
    await expect(page.locator('[data-trazo-id]')).toHaveCount(1);
  });

  test('la Pluma engancha a la punta de un trazo y al cruce de dos', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 200 }); await clic(page, { x: 300, y: 200 }); await page.keyboard.press('Enter');
    await clic(page, { x: 200, y: 100 }); await clic(page, { x: 200, y: 300 }); await page.keyboard.press('Enter');
    await expect.poll(() => cuantosTrazos(page), { timeout: 5000 }).toBe(2);

    // Nueva pieza: primer clic a 3 mm de la punta (100,200), segundo a 3 mm
    // del cruce (200,200). Con zoom 1 son 3,6 px, dentro de los 12 del radio.
    await clic(page, { x: 103, y: 202 }); await clic(page, { x: 203, y: 198 }); await clic(page, { x: 100, y: 300 });
    await page.keyboard.press('Enter');
    await expect.poll(() => cuantasPiezas(page), { timeout: 5000 }).toBe(1);

    const p = (await estado(page)).project.pieces[0];
    expect(abs(p, 0), 'el primer nodo no cayó en la punta del trazo').toEqual({ x: 100, y: 200 });
    expect(abs(p, 1), 'el segundo nodo no cayó en el cruce de los dos trazos').toEqual({ x: 200, y: 200 });

    const presses = (await bitacora(page)).filter(ev => ev.name === 'pen:press').map(ev => ev.data?.snap);
    expect(presses).toContain('trazoEnd');
    expect(presses).toContain('trazoCross');
  });

  test('«Construcción» apagada: ni se pinta, ni engancha, ni se selecciona', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 200 }); await clic(page, { x: 300, y: 200 }); await page.keyboard.press('Enter');
    await expect.poll(() => cuantosTrazos(page), { timeout: 5000 }).toBe(1);

    await page.getByRole('button', { name: 'Construcción' }).click();
    await expect.poll(async () => (await estado(page)).editor.showTrazos, { timeout: 5000 }).toBe(false);
    await expect(page.locator('[data-trazo-id]'), 'apagada y sigue pintada').toHaveCount(0);

    // Lo oculto no engancha: el nodo cae donde ella clicó, no en la punta.
    await clic(page, { x: 103, y: 202 }); await clic(page, { x: 200, y: 100 }); await clic(page, { x: 100, y: 100 });
    await page.keyboard.press('Enter');
    await expect.poll(() => cuantasPiezas(page), { timeout: 5000 }).toBe(1);

    const p = (await estado(page)).project.pieces[0];
    const n0 = abs(p, 0);
    // Precisión 0: el clic va en píxeles enteros, así que hay hasta medio
    // milímetro de redondeo. Los 3 mm que separan de la punta (100,200) caben
    // de sobra: esto distingue «cayó donde clicó» de «enganchó».
    expect(n0.x, 'el trazo apagado siguió enganchando').toBeCloseTo(103, 0);
    expect(n0.y, 'el trazo apagado siguió enganchando').toBeCloseTo(202, 0);

    const presses = (await bitacora(page)).filter(ev => ev.name === 'pen:press').map(ev => ev.data?.snap);
    expect(presses, 'la caja negra registró un enganche a un trazo apagado').not.toContain('trazoEnd');

    // Y tampoco se selecciona: el clic sobre la raya oculta no coge nada.
    await activarHerramienta(page, 'z', 'select');
    await clic(page, { x: 200, y: 200 });
    expect((await estado(page)).editor.selectedTrazo).toBeNull();
  });

  test('recargar conserva los trazos', async ({ page }) => {
    // BUG REAL, medido aquí el 2026-09-12 y sin arreglar a propósito (la
    // tarea 9 escribe el e2e, no toca producción). El autoguardado SÍ escribe
    // el trazo en IDB —la espera de abajo lo comprueba en disco—; lo que lo
    // pierde es la hidratación: `projectAutosave.ts:52` decide si vale la pena
    // restaurar con `pieces.length > 0 || seams.length > 0`, y un proyecto de
    // solo trazos no cuenta como contenido, así que el `restoreProject` ni se
    // despacha. Es exactamente el caso de María: raya de construcción primero,
    // pieza calcada después. Un tercer término (`trazos.length > 0`) lo cierra.
    // Al arreglarlo, este `test.fail` pasa a rojo: quítalo entonces.
    test.fail(true, 'projectAutosave.ts:52 — hasContent no cuenta los trazos');
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 }); await page.keyboard.press('Enter');
    await expect.poll(() => cuantosTrazos(page), { timeout: 5000 }).toBe(1);

    // El autoguardado escribe en IDB tras 1500 ms de silencio: esperamos a que
    // el trazo esté EN DISCO, no un tiempo a ojo.
    await expect.poll(
      () => page.evaluate(async () => {
        // `vina` / store `projects` / clave `autosave` (utils/storage.ts).
        const nombres = await indexedDB.databases?.() ?? [];
        if (!nombres.some(d => d.name === 'vina')) return 0;
        const req = indexedDB.open('vina');
        const db = await new Promise<IDBDatabase | null>(res => {
          req.onsuccess = () => res(req.result);
          req.onerror = () => res(null);
        });
        if (!db || !db.objectStoreNames.contains('projects')) return 0;
        const val = await new Promise<unknown>(res => {
          const g = db.transaction('projects').objectStore('projects').get('autosave');
          g.onsuccess = () => res(g.result);
          g.onerror = () => res(null);
        });
        db.close();
        return (val as { trazos?: unknown[] } | null | undefined)?.trazos?.length ?? 0;
      }),
      { timeout: 15_000, message: 'el autoguardado nunca escribió el trazo' },
    ).toBe(1);

    await page.reload();
    await waitForApp(page);
    await expect.poll(() => cuantosTrazos(page), { timeout: 10_000 }).toBe(1);
    await expect(page.locator('[data-trazo-id]')).toHaveCount(1);
  });

  test('cambiar de herramienta a mitad de trazo lo deja', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 });
    await activarHerramienta(page, 'z', 'select');
    await expect.poll(() => cuantosTrazos(page), { timeout: 5000 }).toBe(1);
    await expect(page.locator('[data-trazo-id]')).toHaveCount(1);

    const fin = (await bitacora(page)).find(ev => ev.name === 'pen:complete');
    expect(fin?.data).toMatchObject({ kind: 'trazo', nodes: 2, via: 'toolChange' });
  });

  test('Seleccionar: clic en un tramo → chip de largo; Supr parte el trazo; Ctrl+Z lo devuelve', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 100 }); await clic(page, { x: 300, y: 100 });
    await clic(page, { x: 300, y: 300 }); await clic(page, { x: 100, y: 300 });
    await page.keyboard.press('Escape');
    await expect.poll(() => cuantosTrazos(page), { timeout: 5000 }).toBe(1);

    await activarHerramienta(page, 'z', 'select');
    await clic(page, { x: 300, y: 200 }); // tramo del medio
    await expect.poll(async () => (await estado(page)).editor.selectedTrazo, { timeout: 5000 })
      .toMatchObject({ segmentIndex: 2 });
    await expect(page.locator('.cotas button.cota[aria-label^="Largo:"]')).toHaveCount(1);
    await expect(page.locator('.tool-strip')).toContainText('Editando: el tramo seleccionado');

    // Supr se lleva ESE tramo; como era del medio, el trazo queda partido en dos.
    await page.keyboard.press('Delete');
    await expect.poll(() => cuantosTrazos(page), { timeout: 5000 }).toBe(2);
    await expect(page.locator('[data-trazo-id]')).toHaveCount(2);

    await page.keyboard.press('Control+z');
    await expect.poll(() => cuantosTrazos(page), { timeout: 5000 }).toBe(1);
    expect((await estado(page)).project.trazos[0].path, 'volvió partido').toHaveLength(4);
    await expect(page.locator('[data-trazo-id]')).toHaveCount(1);

    const borrado = (await bitacora(page)).find(ev => ev.name === 'trazo:delete');
    expect(borrado?.data).toMatchObject({ segmentIndex: 2, parte: true });
  });

  test('el vértice de una pieza gana a la punta de un trazo en el mismo sitio (spec § 5.2)', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p', { x: 100, y: 100 }); // esquina en (100,100)
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 102, y: 101 }); await clic(page, { x: 100, y: 0 });
    await page.keyboard.press('Enter');
    await expect.poll(() => cuantosTrazos(page), { timeout: 5000 }).toBe(1);
    // La punta del trazo nació EXACTAMENTE sobre el vértice de la pieza.
    expect((await estado(page)).project.trazos[0].path[0].values).toEqual([100, 100]);

    await activarHerramienta(page, 'z', 'select');
    await clic(page, { x: 150, y: 150 }); // selecciona la pieza
    await expect.poll(async () => (await estado(page)).editor.selectedPieceIds, { timeout: 5000 }).toHaveLength(1);

    // Sobre el vértice: entra a editar el nodo de la pieza, no coge el trazo.
    await clic(page, { x: 101, y: 101 });
    expect((await estado(page)).editor.selectedTrazo, 'la punta del trazo le ganó al vértice de la pieza').toBeNull();
  });
});
