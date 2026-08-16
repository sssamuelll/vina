import { test, expect, Page } from '@playwright/test';

/**
 * #1049: la barra de opciones de herramienta pasa a ser una canaleta acoplada
 * dentro de `.canvas-area__2d`, que cambia a columna flex.
 *
 * Por qué es un e2e y no vitest: jsdom no calcula layout —
 * `getBoundingClientRect()` devuelve 0 siempre—, así que ningún unitario puede
 * ver si el lienzo encoge, si salta al cambiar de herramienta, ni si desborda
 * por debajo de la barra. La restricción global lo exige para todo cambio de
 * `position` u `overflow`: medir el RESULTADO, no el valor declarado.
 *
 * Nota sobre los selectores: el nombre accesible de un botón del dock es
 * `${etiqueta} · ${atajo}` cuando la herramienta tiene atajo (`Dock.tsx:48`).
 * Playwright empareja `name` por subcadena, así que basta la etiqueta.
 */

async function abrirApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
  await page.waitForTimeout(500);
}

/**
 * La misma herramienta puede salir DOS veces en el dock: fija arriba y otra
 * vez en la zona de auto-sugerencia (`.dock__tool--auto`, `DockAutoZone.tsx`).
 * Las dos despachan la misma activación, así que para medir layout da igual
 * cuál se pulse — pero sin `.first()` Playwright falla por modo estricto.
 */
function botonDeHerramienta(page: Page, etiqueta: string) {
  return page.getByRole('button', { name: etiqueta }).first();
}

test.describe('barra de opciones de herramienta', () => {
  test.beforeEach(async ({ page }) => {
    await abrirApp(page);
  });

  test('el alto del lienzo no cambia al alternar herramientas', async ({ page }) => {
    // Punto declara opciones; Seleccionar no. El canal es permanente, así que
    // el lienzo tiene que medir lo mismo con las dos. Si el canal apareciera y
    // desapareciera, el patrón saltaría en cada cambio de herramienta — y con
    // 7 de las 14 del dock sin opciones, eso pasa todo el tiempo.
    await botonDeHerramienta(page, 'Punto').click();
    await page.waitForTimeout(200);
    const conOpciones = await page.locator('svg.pattern-svg').boundingBox();

    await botonDeHerramienta(page, 'Seleccionar').click();
    await page.waitForTimeout(200);
    const sinOpciones = await page.locator('svg.pattern-svg').boundingBox();

    expect(sinOpciones!.height).toBeCloseTo(conOpciones!.height, 0);
    expect(sinOpciones!.y).toBeCloseTo(conOpciones!.y, 0);
  });

  test('el lienzo no desborda por debajo de la barra', async ({ page }) => {
    // `.pattern-editor` es `height: 100%`. En columna flex un alto en
    // porcentaje se resuelve contra el contenedor IGNORANDO que un hermano ya
    // se llevó espacio, así que mal puesto desborda. Esta es la red de eso.
    const area = await page.locator('.canvas-area__2d').boundingBox();
    const barra = await page.locator('.tool-options-bar').boundingBox();
    const lienzo = await page.locator('.pattern-editor').boundingBox();

    expect(barra!.height).toBeGreaterThan(0);
    expect(lienzo!.y).toBeGreaterThanOrEqual(barra!.y + barra!.height - 1);
    expect(lienzo!.y + lienzo!.height).toBeLessThanOrEqual(area!.y + area!.height + 1);
  });

  test('la barra es cromo en flujo, no una capa', async ({ page }) => {
    const estilo = await page.locator('.tool-options-bar').evaluate((el) => {
      const c = getComputedStyle(el);
      return { position: c.position, zIndex: c.zIndex };
    });
    expect(estilo.position).toBe('static');
    expect(estilo.zIndex).toBe('auto');
  });

  test('los tres modos de Punto se alcanzan y cambian el estado', async ({ page }) => {
    // Es la promesa literal de la NOTA de la entrega 12 a María: "la
    // herramienta tiene tres modos, en el panel de opciones de arriba".
    // Hasta esta rama ese panel no existía y las capturas de esa entrega se
    // hicieron despachando al store desde Playwright — una puerta que ella no
    // tiene. Este caso es el que justifica el issue entero.
    await botonDeHerramienta(page, 'Punto').click();

    const select = page.getByLabel('Tipo de punto');
    await expect(select).toBeVisible();
    await expect(select.locator('option')).toHaveText([
      'Punto',
      'Curva por puntos',
      'Curva bezier',
    ]);

    await select.selectOption('curvePoints');

    const modo = await page.evaluate(
      () =>
        (
          window as unknown as {
            __VINA_STORE__: {
              getState: () => { tools: { toolOptions: Record<string, Record<string, unknown>> } };
            };
          }
        ).__VINA_STORE__.getState().tools.toolOptions.point.mode,
    );
    expect(modo).toBe('curvePoints');
  });

  test('en ventana angosta la barra desborda dentro de sí misma, no empuja', async ({ page }) => {
    // Tijeras declara 4 opciones: es la primera que no cabe. Angostar la
    // ventana es más duro y más determinista que abrir un panel, y mide la
    // misma propiedad — que `overflow-x: auto` contenga el desborde en vez de
    // ensanchar la columna.
    await botonDeHerramienta(page, 'Tijeras').click();
    await page.setViewportSize({ width: 760, height: 720 });
    await page.waitForTimeout(400);

    const area = (await page.locator('.canvas-area__2d').boundingBox())!;
    const barra = page.locator('.tool-options-bar');
    const caja = (await barra.boundingBox())!;

    // Desborda de verdad: hay más contenido del que cabe.
    const desborda = await barra.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(desborda).toBe(true);

    // Y aun así no es más ancha que su contenedor.
    expect(caja.width).toBeLessThanOrEqual(area.width + 1);
  });

  test('el anillo de foco no lo recorta el overflow de la barra', async ({ page }) => {
    // `overflow-y: hidden` recorta contra la caja de la barra, y el
    // :focus-visible se extiende 4px (borde 2px + separación 2px). Si el
    // relleno vertical encogiera por debajo de eso, el foco se vería cortado
    // arriba y abajo — y quien navega con Tab se queda sin señal. Esto lo
    // dejé sin medir en la Task 1 y un revisor lo levantó; aquí se mide.
    await botonDeHerramienta(page, 'Tijeras').click();
    await page.waitForTimeout(200);

    const barra = (await page.locator('.tool-options-bar').boundingBox())!;
    const control = (await page.locator('.tool-options-bar__toggle').first().boundingBox())!;

    expect(control.y - barra.y).toBeGreaterThanOrEqual(4);
    expect(barra.y + barra.height - (control.y + control.height)).toBeGreaterThanOrEqual(4);
  });
});
