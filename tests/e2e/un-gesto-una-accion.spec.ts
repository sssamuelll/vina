/**
 * Un gesto, una acción — contrato
 * `docs/superpowers/specs/2026-09-10-un-gesto-una-accion-design.md`.
 *
 * Samuel, 2026-09-10, probando el hover sin clic que acabábamos de entregar:
 * "para mi es realmente necesario que mantengamos el foco en los canvas [...]
 * que evitemos la mayor cantidad de clicks posibles, para que no entre como un
 * parche".
 *
 * Hoy las dos herramientas de nodos del 2D piden un clic de cortesía antes de
 * responder: el primero solo pone `isEditing` en `true` (Editar patrón:
 * `useEditorInteractions.ts:763-782`; Editar curva: `:784-797`), y hace falta
 * un SEGUNDO clic para mover algo. La doctrina § 0 dice que ningún gesto existe
 * solo para despertar la superficie.
 *
 * El oráculo de casi todos estos casos es GEOMETRÍA, no una clase de CSS: un
 * solo gesto tiene que mover el punto. Un assert sobre el color del glifo
 * pasaría en verde con el nodo seleccionado y quieto.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, addPiece, toScreen, activarHerramienta } from './helpers/lienzo';

/** Esquinas en espacio de patrón de `addPiece(page, id, {x:100,y:100}, 200, 150)`. */
const ESQUINA_SUP_IZQ = { x: 100, y: 100 };
const MEDIO_LADO_SUP = { x: 200, y: 100 };
/** Bien adentro del relleno: a 75 mm del lado más cercano, lejos de todo nodo. */
const RELLENO_VACIO = { x: 200, y: 175 };

/** Anclas del contorno de la pieza, en espacio de patrón (posición + local). */
async function anclas(page: Page) {
  const pieza = (await st(page)).project.pieces[0];
  return pieza.outline
    .filter(c => c.type !== 'Z')
    .map(c => ({
      x: c.values[c.values.length - 2] + pieza.position.x,
      y: c.values[c.values.length - 1] + pieza.position.y,
    }));
}

/** Un solo gesto: presionar, mover, soltar. Sin clic previo en ninguna parte. */
async function arrastrar(page: Page, desde: { x: number; y: number }, hasta: { x: number; y: number }) {
  const a = await toScreen(page, desde);
  const b = await toScreen(page, hasta);
  await page.mouse.move(a.x, a.y);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test.describe('§ 1 — Editar patrón: el primer gesto ya actúa', () => {
  test.setTimeout(120_000);

  test('arrastrar un nodo de una pieza nunca entrada lo mueve en ESE gesto', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    await activarHerramienta(page, 'q', 'editPattern');

    const antes = await anclas(page);
    expect(antes, 'el rectángulo tiene cuatro anclas').toHaveLength(4);

    // Ni un clic previo: el gesto empieza encima del nodo.
    await arrastrar(page, ESQUINA_SUP_IZQ, { x: 140, y: 130 });

    const despues = await anclas(page);
    const movidas = despues.filter((p, i) =>
      Math.abs(p.x - antes[i].x) > 1 || Math.abs(p.y - antes[i].y) > 1);
    expect(
      movidas.length,
      'un gesto tiene que mover el nodo — hoy el primer clic solo "entra" y la geometría no cambia',
    ).toBe(1);
    expect(despues[0].x).toBeCloseTo(140, 0);
    expect(despues[0].y).toBeCloseTo(130, 0);
  });

  test('arrastrar un tramo de una pieza nunca entrada lo mueve en ESE gesto', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    await activarHerramienta(page, 'q', 'editPattern');

    const antes = await anclas(page);
    await arrastrar(page, MEDIO_LADO_SUP, { x: 200, y: 140 });

    const despues = await anclas(page);
    const movidas = despues.filter((p, i) =>
      Math.abs(p.x - antes[i].x) > 1 || Math.abs(p.y - antes[i].y) > 1);
    expect(
      movidas.length,
      'el tramo superior son sus DOS extremos: un gesto los mueve a los dos',
    ).toBe(2);
    expect(despues[0].y, 'el extremo izquierdo del tramo bajó').toBeCloseTo(140, 0);
    expect(despues[1].y, 'y el derecho también').toBeCloseTo(140, 0);
  });

  test('un gesto en el relleno vacío entra pero NO actúa: la geometría no se toca', async ({ page }) => {
    // § 1 de la spec: se fusiona solo cuando hay sujeto bajo el cursor. Sin
    // nodo ni tramo, la acción que tocaría es un marquee, y un barrido de
    // selección que arranca en el clic de entrada es indistinguible de un clic
    // perdido. Queda fuera a propósito.
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    await activarHerramienta(page, 'q', 'editPattern');

    const antes = await anclas(page);
    await arrastrar(page, RELLENO_VACIO, { x: 240, y: 200 });

    expect(
      await anclas(page),
      'arrastrar desde el relleno no puede deformar la pieza',
    ).toEqual(antes);

    // Pero entrar sí entró: las anclas del editor están montadas.
    await expect(
      page.locator('[data-anchor-role]'),
      'el gesto sin sujeto sigue sirviendo para entrar',
    ).not.toHaveCount(0);
  });
});

test.describe('§ 4.2 — Editar curva: hover sin clic, y el primer gesto ya actúa', () => {
  test.setTimeout(120_000);

  test('con la herramienta activa, pasar el mouse sobre la pieza enseña sus anclas sin clic', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    await activarHerramienta(page, 'v', 'editCurve');

    await expect(
      page.locator('.node-editor'),
      'sin sobrevolar nada todavía, no hay editor montado',
    ).toHaveCount(0);

    const s = await toScreen(page, ESQUINA_SUP_IZQ);
    await page.mouse.move(s.x, s.y);
    await page.waitForTimeout(250);

    await expect(
      page.locator('.node-editor'),
      'el hover previo al clic tiene que enseñar lo agarrable — hoy Editar curva no tiene hover ninguno',
    ).toHaveCount(1);
  });

  test('el puntero avisa sobre el ancla sin clic previo', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    await activarHerramienta(page, 'v', 'editCurve');

    const svg = page.locator('svg.pattern-svg');
    const lejos = await toScreen(page, { x: 600, y: 500 });
    await page.mouse.move(lejos.x, lejos.y);
    await page.waitForTimeout(150);
    expect(await svg.evaluate(el => getComputedStyle(el).cursor)).toBe('default');

    const s = await toScreen(page, ESQUINA_SUP_IZQ);
    await page.mouse.move(s.x, s.y);
    await page.waitForTimeout(250);
    expect(
      await svg.evaluate(el => getComputedStyle(el).cursor),
      'sobre un ancla agarrable, sin haber clicado, el puntero lo dice',
    ).toBe('move');
  });

  test('arrastrar un ancla de una pieza nunca entrada la mueve en ESE gesto', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    await activarHerramienta(page, 'v', 'editCurve');

    const antes = await anclas(page);
    await arrastrar(page, ESQUINA_SUP_IZQ, { x: 145, y: 125 });

    const despues = await anclas(page);
    const movidas = despues.filter((p, i) =>
      Math.abs(p.x - antes[i].x) > 1 || Math.abs(p.y - antes[i].y) > 1);
    expect(
      movidas.length,
      'un gesto tiene que mover el ancla, sin clic de cortesía',
    ).toBe(1);
    expect(despues[0].x).toBeCloseTo(145, 0);
    expect(despues[0].y).toBeCloseTo(125, 0);
  });
});
