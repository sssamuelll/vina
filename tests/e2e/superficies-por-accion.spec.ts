import { test, expect, type Page } from '@playwright/test';
import { addPiece, clickAt, activarHerramienta, dispatch } from './helpers/lienzo';
import { startSimulation } from './helpers/sim';
import { medirAccion, enReposo } from './helpers/superficies';
import { leerBaseline, fijarBaseline, techoDe } from './helpers/trinquete';
import {
  abrirAppVacia, cargarDxfDeMaria, reposo, centroDePieza, seleccionarPieza,
  abrirPaleta, abrirPanel, cambiarVista,
} from './helpers/estados';

/**
 * Trinquete de superficies por acción (spec 2026-09-24 «cromo callado» § 3.4).
 *
 * Cuenta, para cada acción de María, las superficies que APARECEN o CAMBIAN
 * (la cabina del objeto cuenta 1; el ambiente no cuenta), y falla si la cuenta
 * supera el techo efectivo: el mayor de la línea base guardada en
 * `superficies-baseline.json` y la meta (4). Por debajo de la meta el diseño
 * puede mover superficies; por encima, solo se baja. Hoy (F0) solo mide y fija
 * la línea base; F2 y F4 la bajan.
 *
 * Serial a propósito: `medidas` se acumula en el proceso para escribir la línea
 * base al final con SUPERFICIES_UPDATE=1.
 */
const BASELINE = 'tests/e2e/superficies-baseline.json';

const baseline = leerBaseline(BASELINE);
const medidas: Record<string, number> = {};

function registrar(accion: string, nombres: string[]): void {
  medidas[accion] = nombres.length;
  const techo = techoDe(baseline, accion);
  console.log(`superficies · ${accion}: ${nombres.length} [${nombres.join(', ')}] · línea base ${baseline.estados[accion] ?? '—'} · techo ${techo ?? '—'} · meta ${baseline.meta}`);
  if (techo !== undefined) {
    expect(nombres.length, `${accion}: aparecieron o cambiaron ${nombres.join(', ')}`).toBeLessThanOrEqual(techo);
  }
}

// 90 s y no los 30 del config: cada test carga el DXF real en frío y algunos
// (cota, Q, 3D) pasaron de 30 s en la primera corrida de esta máquina. En CI
// (3-6× más lento, `playwright.config.ts:13`) 240 s, como `arrangement-flow`:
// en serial, un solo timeout tumba los 18 y repite el grupo entero.
test.describe.configure({ mode: 'serial', timeout: process.env.CI ? 240_000 : 90_000 });
test.afterAll(() => {
  if (process.env.SUPERFICIES_UPDATE) fijarBaseline(BASELINE, medidas);
});

test.describe('con el patrón de María (1366×768)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await abrirAppVacia(page);
  });

  test('importar DXF', async ({ page }) => {
    registrar('importar DXF', await medirAccion(page, [() => cargarDxfDeMaria(page)]));
  });

  test('reposo con patrón', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('reposo con patrón', await enReposo(page));
  });

  test('seleccionar y mover pieza', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('seleccionar y mover pieza', await medirAccion(page, [
      async () => { await seleccionarPieza(page); },
      async () => {
        const c = await centroDePieza(page);
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        await page.mouse.move(c.x + 40, c.y + 20, { steps: 8 });
        await page.mouse.up();
      },
    ]));
  });

  test('escribir una cota', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    await seleccionarPieza(page);
    registrar('escribir una cota', await medirAccion(page, [
      async () => {
        // Con el ratón en el centro del chip y no con `locator.click()`: el
        // chip se recoloca varios frames seguidos y la espera de estabilidad
        // de Playwright tardó de 6 a 20 s en esta máquina antes de pinchar.
        const chip = page.locator('.cota').first();
        await expect(chip).toBeVisible({ timeout: 8_000 });
        const caja = await chip.boundingBox();
        if (!caja) throw new Error('el chip de cota no tiene caja en pantalla');
        await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
        await expect(page.locator('.cota--editando, .cota--grupo-editando').first()).toBeVisible({ timeout: 5_000 });
      },
      async () => { await page.keyboard.type('200'); await page.keyboard.press('Enter'); },
    ]));
  });

  test('editar un punto (Q)', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('editar un punto (Q)', await medirAccion(page, [
      async () => {
        await page.keyboard.press('q');
        const c = await centroDePieza(page);
        await page.mouse.click(c.x, c.y);
      },
      async () => {
        // El glifo lleva `pointer-events="none"` (el hit-test lo hace el editor
        // por tolerancia), así que `locator.click()` se niega: «el relleno
        // intercepta». Se pincha con el ratón en el centro de su caja, como
        // hace `edit-pattern-trust.spec.ts`.
        const glifo = page.locator('[data-command-index]:not([data-interna] *) [data-anchor-role="corner"]').first();
        await expect(glifo).toBeVisible({ timeout: 8_000 });
        const caja = await glifo.boundingBox();
        if (!caja) throw new Error('el glifo de esquina no tiene caja en pantalla');
        await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
      },
    ]));
  });

  test('simular en 3D', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    await cambiarVista(page, '3D');
    registrar('simular en 3D', await medirAccion(page, [
      async () => { await startSimulation(page); await page.waitForTimeout(2500); },
    ]));
  });

  test('ajustar avatar', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('ajustar avatar', await medirAccion(page, [
      () => abrirPanel(page, 'Avatar y medidas', 'Avatar'),
    ]));
  });

  test('cambiar de vista', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('cambiar de vista', await medirAccion(page, [
      () => cambiarVista(page, 'Split'),
      () => cambiarVista(page, '2D'),
    ]));
  });

  test('Split en reposo', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await cambiarVista(page, 'Split');
    await reposo(page);
    registrar('Split en reposo', await enReposo(page));
  });

  test('convocar la IA', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('convocar la IA', await medirAccion(page, [
      async () => { await page.keyboard.press('Control+/'); },
      () => abrirPaleta(page),
    ]));
  });

  test('menú contextual', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('menú contextual', await medirAccion(page, [
      async () => {
        const c = await centroDePieza(page);
        await page.mouse.click(c.x, c.y, { button: 'right' });
        await expect(page.locator('.context-menu')).toBeVisible({ timeout: 5_000 });
      },
    ]));
  });
});

test.describe('con un rectángulo sembrado (lados rectos conocidos)', () => {
  // 300×400 mm con la esquina en (120,120): lado izquierdo x=120, derecho x=420,
  // arriba y=120, abajo y=520 — en coordenadas de patrón, que `clickAt` traduce.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await abrirAppVacia(page);
    await addPiece(page, 'rect-superficies', { x: 120, y: 120 }, 300, 400);
    await reposo(page);
  });

  test('dibujar con Pluma (H)', async ({ page }) => {
    registrar('dibujar con Pluma (H)', await medirAccion(page, [
      () => activarHerramienta(page, 'h', 'pen'),
      () => clickAt(page, { x: 600, y: 200 }),
      () => clickAt(page, { x: 700, y: 200 }),
      () => clickAt(page, { x: 700, y: 300 }),
    ]));
    await page.keyboard.press('Escape');
  });

  test('Rectángulo (S)', async ({ page }) => {
    registrar('Rectángulo (S)', await medirAccion(page, [
      () => activarHerramienta(page, 's', 'rectangle'),
      async () => {
        const svg = await page.locator('svg.pattern-svg').boundingBox();
        if (!svg) throw new Error('no svg');
        await page.mouse.move(svg.x + 700, svg.y + 200);
        await page.mouse.down();
        await page.mouse.move(svg.x + 860, svg.y + 320, { steps: 8 });
        await page.mouse.up();
      },
    ]));
  });

  test('coser dos lados (N)', async ({ page }) => {
    registrar('coser dos lados (N)', await medirAccion(page, [
      () => activarHerramienta(page, 'n', 'seam'),
      () => clickAt(page, { x: 120, y: 300 }),
      () => clickAt(page, { x: 420, y: 300 }),
    ]));
  });

  test('poner piquete (⇧N)', async ({ page }) => {
    registrar('poner piquete (⇧N)', await medirAccion(page, [
      async () => {
        await dispatch(page, 'editor/setActiveTool', 'notch');
        await dispatch(page, 'tools/setActiveTool2D', 'notch');
        await page.waitForTimeout(300);
      },
      () => clickAt(page, { x: 120, y: 320 }),
    ]));
  });

  // La puerta de vuelta (P3c): elegir lo ya puesto trae su cabina —la cota y
  // la etiqueta cuentan 1— y su frase. Abrir la etiqueta es un menú.
  async function unPiqueteElegido(page: Page, elegir: boolean) {
    await activarHerramienta(page, 'Shift+N', 'notch');
    await clickAt(page, { x: 180, y: 120 });
    await page.locator('input.cota--editando[aria-label="Distancia"]').press('Escape');
    await activarHerramienta(page, 'z', 'select');
    if (elegir) {
      await clickAt(page, { x: 180, y: 124 });
      await expect(page.getByRole('button', { name: /^Piquete: / })).toBeVisible();
    }
  }

  // Cada medida comprueba después que el gesto hizo lo que dice: el trinquete
  // solo pone techo, y un clic que no eligiera nada pasaría con menos.
  test('elegir un piquete (Z)', async ({ page }) => {
    await unPiqueteElegido(page, false);
    registrar('elegir un piquete (Z)', await medirAccion(page, [
      () => clickAt(page, { x: 180, y: 124 }),
    ]));
    await expect(page.getByRole('button', { name: /^Piquete: / })).toBeVisible();
  });

  test('abrir la etiqueta del piquete', async ({ page }) => {
    await unPiqueteElegido(page, true);
    registrar('abrir la etiqueta del piquete', await medirAccion(page, [
      () => page.getByRole('button', { name: /^Piquete: / }).click(),
    ]));
    await expect(page.getByRole('group', { name: 'Opciones del piquete' })).toBeVisible();
  });

  test('elegir una esquina del margen (Z)', async ({ page }) => {
    await dispatch(page, 'project/batchSetSeamAllowance', { pieceIds: ['rect-superficies'], width: 10 });
    await activarHerramienta(page, 'z', 'select');
    // La punta del margen de la esquina de (120, 120) cae en (110, 110).
    registrar('elegir una esquina del margen (Z)', await medirAccion(page, [
      () => clickAt(page, { x: 113, y: 113 }),
    ]));
    await expect(page.getByRole('button', { name: /^Tipo de esquina/ })).toBeVisible();
  });

  // «coser dos lados (N)» no cose: sus dos clics caen en la misma pieza, y
  // Coser pide otra para la segunda mitad. Este cose de verdad y mide la
  // etiqueta de la costura recién hecha (revisión final de P3c).
  test('coser dos piezas (N)', async ({ page }) => {
    await addPiece(page, 'otra-superficies', { x: 500, y: 120 }, 300, 400);
    await reposo(page);
    registrar('coser dos piezas (N)', await medirAccion(page, [
      () => activarHerramienta(page, 'n', 'seam'),
      () => clickAt(page, { x: 420, y: 300 }),
      () => clickAt(page, { x: 500, y: 300 }),
    ]));
    await expect(page.getByRole('button', { name: /^Tipo de costura/ })).toBeVisible();
  });

  // Punto no tiene tecla. Tras el clic trae su cota (spec 2026-10-02 § 5.1: 3).
  test('poner punto', async ({ page }) => {
    registrar('poner punto', await medirAccion(page, [
      async () => {
        await dispatch(page, 'editor/setActiveTool', 'point');
        await dispatch(page, 'tools/setActiveTool2D', 'point');
        await page.waitForTimeout(300);
      },
      () => clickAt(page, { x: 120, y: 320 }),
    ]));
  });

  test('margen de costura (O)', async ({ page }) => {
    registrar('margen de costura (O)', await medirAccion(page, [
      () => activarHerramienta(page, 'o', 'seamAllowance'),
      () => clickAt(page, { x: 120, y: 340 }),
    ]));
  });

  test('medir (M)', async ({ page }) => {
    registrar('medir (M)', await medirAccion(page, [
      () => activarHerramienta(page, 'm', 'measure'),
      () => clickAt(page, { x: 120, y: 120 }),
      () => clickAt(page, { x: 420, y: 120 }),
    ]));
  });
});
