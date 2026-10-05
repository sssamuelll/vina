/**
 * #1172 y #1173 — la misma familia que #1115, una capa más afuera.
 *
 * #1115 arregló el duelo DENTRO del lienzo: un sujeto local de herramienta
 * contra el atajo global. Quedaron dos sujetos que no son del lienzo y que
 * perdían el mismo duelo por la misma razón — `edit.delete` es de contexto
 * `global` (defaults.ts:22), así que se dispara pase lo que pase delante:
 *
 *   #1173  Un modal abierto. `ShortcutProvider` solo se retira ante
 *          INPUT/TEXTAREA/SELECT (ShortcutProvider.tsx:57-64), y un diálogo
 *          no es ninguno. Medido: la pieza desaparece Y el diálogo se queda
 *          abierto preguntando por algo que ya no existe.
 *
 *   #1172  Medir y Recorrer costura. Las dos son de SOLO LECTURA —cero
 *          dispatches al store entre las dos— y las dos miraban solo Escape.
 *
 * Sobre #1172, lo que NO se hizo y por qué: Supr no borra las mediciones. Esa
 * puerta ya estaba decidida por escrito en la v1 («la única puerta de borrado
 * es la acción explícita de la tira, también al usar Supr o Retroceso»), y
 * además las mediciones viven en estado LOCAL, no en el store: borrarlas con
 * una tecla sería destruir seis mediciones sin deshacer. Lo que la v1 no
 * previó es que al soltar la tecla se la queda el global y se lleva la PIEZA.
 * Consumir sin hacer nada completa esa decisión, no la cambia.
 *
 * Los controles (M2, M5, M7) son la mitad que se olvida: sin nada delante, o
 * sin mediciones en pantalla, Supr TIENE que seguir borrando la pieza. Sin
 * ellos «consumir siempre» también pasaría, y apagaría el borrado normal en
 * silencio por el hecho de estar en una herramienta.
 */
import { test, expect, Page } from '@playwright/test';
import { addPiece, activarHerramienta, clickAt, dispatch, st } from './helpers/lienzo';

async function abrirApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.locator('.toast__dismiss').evaluateAll((bs) => bs.forEach((b) => (b as HTMLElement).click())).catch(() => {});
}

const nPiezas = async (p: Page) => (await st(p)).project.pieces.length;

/** Vive `disabled` mientras no haya mediciones (la línea al pie, `SeccionDelPatron.tsx`). Sale gratis
 *  y es el único oráculo que distingue «no midió» de «midió y se borró». */
const botonBorrarMediciones = (p: Page) => p.getByRole('button', { name: 'Borrar mediciones' });

/** Supr con el ratón fuera de todo campo, como lo pulsa María. */
async function pulsar(page: Page, tecla: string) {
  await page.mouse.move(700, 620);
  await page.keyboard.press(tecla);
  await page.waitForTimeout(500);
}

/** El diálogo del shell se abre por el store: no hace falta manejar Fusionar. */
async function abrirDialogo(page: Page) {
  await dispatch(page, 'copilotUI/showConfirmation', {
    title: '¿Unir las dos piezas?',
    description: 'Se combinan en una sola.',
    consequences: ['La costura entre ellas se pierde'],
    destructive: true,
  });
  await expect(page.locator('.confirm-dialog'), 'no se abrió el diálogo').toBeVisible({ timeout: 3000 });
}

async function conPiezaSeleccionada(page: Page) {
  await abrirApp(page);
  await addPiece(page, 'p1', { x: 100, y: 100 });
  await dispatch(page, 'editor/selectPiece', 'p1');
  await page.waitForTimeout(200);
}

test.describe('#1173 — un diálogo abierto no deja que Supr borre lo de atrás', () => {
  test.setTimeout(90_000);

  test('M1 · con el diálogo abierto, Supr no se lleva la pieza de detrás', async ({ page }) => {
    await conPiezaSeleccionada(page);
    await abrirDialogo(page);

    const antes = await nPiezas(page);
    await pulsar(page, 'Delete');

    expect(await nPiezas(page), 'la pieza desapareció mientras María leía la pregunta').toBe(antes);
    await expect(page.locator('.confirm-dialog'), 'el diálogo se cerró solo').toBeVisible();
  });

  test('M2 · CONTROL: sin diálogo delante, Supr sigue borrando la pieza', async ({ page }) => {
    await conPiezaSeleccionada(page);
    await pulsar(page, 'Delete');
    expect(await nPiezas(page), 'el arreglo apagó el borrado normal').toBe(0);
  });

  test('M3 · el diálogo sigue cerrándose con Escape', async ({ page }) => {
    // La lección de #1115: retirar una tecla puede llevarse otra por delante.
    //
    // Honestidad sobre su alcance: este caso NO se pone rojo mutando la guarda
    // de arriba, porque `ConfirmDialog` escucha su propio Escape en `window` y
    // no depende del atajo global. Vigila la otra forma de romperlo —la que ya
    // ocurrió una vez— que es que alguien añada `stopPropagation` y mate la
    // propagación entera. Se queda por eso, sabiendo que no muerde hoy.
    await conPiezaSeleccionada(page);
    await abrirDialogo(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await expect(page.locator('.confirm-dialog'), 'Escape dejó de cerrar el diálogo').toHaveCount(0);
  });

  test('M4 · con el diálogo abierto tampoco cambia de herramienta a sus espaldas', async ({ page }) => {
    // Un modal tapa más que un campo de texto, no menos: si escribir en un
    // input ya retira los atajos, leer una pregunta también.
    await conPiezaSeleccionada(page);
    await abrirDialogo(page);
    const antes = (await st(page)).editor.activeTool;
    await page.keyboard.press('q');
    await page.waitForTimeout(300);
    expect((await st(page)).editor.activeTool, 'un atajo se coló detrás del diálogo').toBe(antes);
  });

  test('M10 · el nodo agarrado detrás del diálogo tampoco se va', async ({ page }) => {
    // El agujero que la guarda de `ShortcutProvider` NO tapaba, y por el que
    // #1173 estuvo medio arreglado: el router de #1115 escucha en `window` en
    // CAPTURA, o sea ANTES que el atajo global en `document` en burbuja. Con
    // el diálogo delante seguía borrando el nodo de la pieza de detrás.
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'q', 'editPattern');
    await clickAt(page, { x: 200, y: 175 });   // entrar a la pieza
    await clickAt(page, { x: 100, y: 100 });   // agarrar la esquina
    await page.waitForTimeout(300);

    const antes = (await st(page)).project.pieces.find(p => p.id === 'p1')!.outline.length;
    await abrirDialogo(page);
    await pulsar(page, 'Delete');

    const despues = (await st(page)).project.pieces.find(p => p.id === 'p1')!.outline.length;
    expect(despues, 'se borró un nodo detrás del diálogo').toBe(antes);
    await expect(page.locator('.confirm-dialog'), 'el diálogo se cerró solo').toBeVisible();
  });

  test('M11 · con el diálogo abierto, Espacio confirma en vez de arrancar la simulación', async ({ page }) => {
    // Esto NO es una regresión que se arregla: es un fallo que había en main y
    // que el arreglo de #1173 tapó de gratis. Lo encontró la revisión, no yo.
    // `sim.toggle` está en Espacio con contexto `global` y hacía
    // `preventDefault`, o sea que mataba la activación del botón enfocado: con
    // un diálogo destructivo delante, Espacio arrancaba la simulación 3D y
    // dejaba la pregunta en pantalla. Sin este caso nada lo protege.
    await conPiezaSeleccionada(page);
    await abrirDialogo(page);
    const modoAntes = await page.evaluate(() => (window as unknown as {
      __VINA_STORE__: { getState: () => { simulation: { viewMode3D: string } } };
    }).__VINA_STORE__.getState().simulation.viewMode3D);

    await page.keyboard.press(' ');
    await page.waitForTimeout(500);

    await expect(page.locator('.confirm-dialog'), 'Espacio no activó el botón enfocado').toHaveCount(0);
    const modoDespues = await page.evaluate(() => (window as unknown as {
      __VINA_STORE__: { getState: () => { simulation: { viewMode3D: string } } };
    }).__VINA_STORE__.getState().simulation.viewMode3D);
    expect(modoDespues, 'Espacio arrancó la simulación detrás del diálogo').toBe(modoAntes);
  });
});

test.describe('#1172 — Medir y Recorrer costura no escriben: tampoco borran', () => {
  test.setTimeout(90_000);

  test('M5 · en Medir, Supr no borra la pieza ni con la mesa limpia', async ({ page }) => {
    // Sin mediciones tampoco. Recorrer costura ya se comporta así desde que
    // entró en SEWING_TOOL_IDS: la regla es de la HERRAMIENTA, no de si hay
    // algo medido encima. Una regla que depende del contenido de la pantalla
    // se explica peor y se rompe en el borde.
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'm', 'measure');
    const antes = await nPiezas(page);
    await pulsar(page, 'Delete');
    expect(await nPiezas(page), 'midiendo en vacío, Supr se llevó la pieza').toBe(antes);
  });

  test('M6 · con mediciones en pantalla, Supr no se lleva la pieza', async ({ page }) => {
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'm', 'measure');
    // A la izquierda de la tarjeta de herramienta, que en Split a 1280 empieza
    // en x 326: desde que el margen corre la hoja 44 px, el (300, 100) de antes
    // caía dentro de ella (P2a). P2b la borra.
    await clickAt(page, { x: 100, y: 100 });
    await clickAt(page, { x: 250, y: 100 });
    await page.waitForTimeout(300);
    await expect(botonBorrarMediciones(page), 'el caso no se ejerce: los clics no midieron nada')
      .toBeEnabled();

    const antes = await nPiezas(page);
    await pulsar(page, 'Delete');
    expect(await nPiezas(page), 'midiendo, Supr se llevó la pieza').toBe(antes);
    // La otra mitad, que estaba escrita en prosa tres veces y sin un solo
    // assert: Supr tampoco se lleva las mediciones. Si alguien le engancha
    // `clear()` a la tecla, contar piezas no lo vería.
    await expect(botonBorrarMediciones(page), 'Supr se llevó las mediciones').toBeEnabled();
  });

  test('M7 · Retroceso hace lo mismo que Supr midiendo', async ({ page }) => {
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'm', 'measure');
    // A la izquierda de la tarjeta de herramienta, que en Split a 1280 empieza
    // en x 326: desde que el margen corre la hoja 44 px, el (300, 100) de antes
    // caía dentro de ella (P2a). P2b la borra.
    await clickAt(page, { x: 100, y: 100 });
    await clickAt(page, { x: 250, y: 100 });
    await page.waitForTimeout(300);

    await expect(botonBorrarMediciones(page), 'el caso no se ejerce: los clics no midieron nada')
      .toBeEnabled();

    const antes = await nPiezas(page);
    await pulsar(page, 'Backspace');
    expect(await nPiezas(page), 'Retroceso no quedó igualado con Supr').toBe(antes);
    await expect(botonBorrarMediciones(page), 'Retroceso se llevó las mediciones').toBeEnabled();
  });

  test('M9 · CONTROL: al salir de Medir, Supr vuelve a borrar', async ({ page }) => {
    // La mitad que se olvida. Sin esto, «no borrar nunca» también pasaría y
    // apagaría el borrado de toda la app en silencio. Prueba que la regla va
    // pegada a la herramienta y se suelta al cambiar de herramienta.
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'm', 'measure');
    await pulsar(page, 'Delete');
    expect(await nPiezas(page), 'el caso no se ejerce: ya se había borrado').toBe(1);

    await activarHerramienta(page, 'z', 'select');
    await dispatch(page, 'editor/selectPiece', 'p1');
    await page.waitForTimeout(200);
    await pulsar(page, 'Delete');
    expect(await nPiezas(page), 'la regla de Medir se quedó pegada al salir').toBe(0);
  });

  test('M8 · el hermano: recorriendo una costura, Supr tampoco se la lleva', async ({ page }) => {
    // Recorrer costura no aparecía en el issue: salió de censar por la REGLA
    // (¿qué herramientas no escriben sobre la pieza?) y no por el grep de la
    // tecla, que es la corrección que dejó #1115.
    //
    // Y el censo devolvió algo mejor que un bug: **ya estaba cubierta**, por
    // estar en SEWING_TOOL_IDS desde antes. O sea que este caso pasaba ANTES
    // del arreglo y no prueba nada de él — es un candado, no una medición.
    // Vale igual, y de hecho es la mejor evidencia de que la decisión de
    // #1172 va donde va: la regla ya existía a nivel de herramienta, a Medir
    // solo le faltaba entrar en la lista.
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'Shift+M', 'walkSeam');
    await clickAt(page, { x: 200, y: 100 });
    await page.waitForTimeout(300);
    expect((await st(page)).editor.selectedPieceIds, 'el caso no se ejerce: no hay pieza que perder')
      .toEqual(['p1']);

    const antes = await nPiezas(page);
    await pulsar(page, 'Delete');
    expect(await nPiezas(page), 'recorriendo, Supr se llevó la pieza').toBe(antes);
  });
  test('M12 · el menú Edición ▸ Eliminar tampoco borra midiendo, y LO DICE', async ({ page }) => {
    // Es la mitad que se olvidó en la primera versión y que la revisión midió:
    // la regla vive en `resolverBorrado`, que lo leen DOS puertas. El atajo
    // tiene la excusa de «la tecla no era tuya»; un renglón de menú con rótulo
    // que la usuaria abrió y pulsó a propósito no la tiene.
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'm', 'measure');

    const menu = page.locator('.logo-menu__trigger, .top-bar .logo-menu, [aria-label="Menú de la aplicación"]').first();
    await menu.click();
    await page.locator('.logo-menu').waitFor({ timeout: 8000 });
    await page.getByText('Edición', { exact: true }).first().hover();
    await page.waitForTimeout(400);
    await page.locator('.logo-menu__submenu').getByText(/^Eliminar$/).first().click();
    await page.waitForTimeout(600);

    expect(await nPiezas(page), 'el menú borró la pieza estando en Medir').toBe(1);
    await expect(
      page.locator('.toast', { hasText: /no se borran piezas/i }),
      'la puerta se quedó muda: se pulsó y no pasó nada ni se dijo nada',
    ).toBeVisible();
  });
});
