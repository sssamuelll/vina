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
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.locator('.toast__dismiss').evaluateAll((bs) => bs.forEach((b) => (b as HTMLElement).click())).catch(() => {});
}

const nPiezas = async (p: Page) => (await st(p)).project.pieces.length;

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
    await clickAt(page, { x: 100, y: 100 });
    await clickAt(page, { x: 300, y: 100 });
    await page.waitForTimeout(300);

    const antes = await nPiezas(page);
    await pulsar(page, 'Delete');
    expect(await nPiezas(page), 'midiendo, Supr se llevó la pieza').toBe(antes);
  });

  test('M7 · Retroceso hace lo mismo que Supr midiendo', async ({ page }) => {
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'm', 'measure');
    await clickAt(page, { x: 100, y: 100 });
    await clickAt(page, { x: 300, y: 100 });
    await page.waitForTimeout(300);

    const antes = await nPiezas(page);
    await pulsar(page, 'Backspace');
    expect(await nPiezas(page), 'Retroceso no quedó igualado con Supr').toBe(antes);
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
});
