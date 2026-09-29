import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RootState } from '../../src/store';
import type { PatternPiece } from '../../src/types/types';
import { guardarEvidencia, indiceDe, lineaDeTiempo, type EventoBitacora } from './helpers/bitacora';
import { exportBundle } from './helpers/diagnostico';

/**
 * Recorrido solicitado, en su orden numerado (los tiempos NO son crecientes).
 * Una página, un proyecto, sin fixtures de piezas, dispatch ni recargas.
 * Puente explícito 10→11: seleccionar todo, borrar, comprobar g, Deshacer.
 * Split 1920×1080 como la grabación; no se inicia simulación (fuera de los
 * trece pasos). El store se LEE; cada cambio lo hace el ratón o el teclado.
 *
 * Los fallos se recogen sin abortar los tramos independientes posteriores.
 * Exportamos al final para que abrir el menú no cambie el foco entre gestos.
 * El segundo entre tramos evita fusionar acciones de dos pasos en el journal.
 * BITACORA_DUMP=.recon/replay-maria npx playwright test
 *   tests/e2e/replay-maria-07-09.spec.ts --workers=1 --retries=0
 */
type Punto = { x: number; y: number };
type Evento = EventoBitacora & { tLast?: number };
type Resultado = {
  paso: number;
  nombre: string;
  desde: number;
  hasta: number;
  estado: 'PASA' | 'FALLA' | 'NO MONTABLE';
  observaciones: Record<string, unknown>;
  fallo?: string;
  evidencia?: string[];
  anomalias?: Evento[];
  faltaTelemetria?: string[];
};
class NoMontable extends Error {}
const st = (page: Page) => page.evaluate(() =>
  (window as unknown as { __VINA_STORE__: { getState: () => RootState } }).__VINA_STORE__.getState());
const reloj = (page: Page) => page.evaluate(() => Date.now());
const caja = (p: PatternPiece) => {
  const xs = p.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0));
  const ys = p.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1));
  return { x: p.position.x + Math.min(...xs), y: p.position.y + Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
function interiorDeTramoLineal(p: PatternPiece): Punto {
  let desde: Punto | null = null;
  for (const comando of p.outline) {
    if (comando.type === 'M') {
      desde = { x: comando.values[0], y: comando.values[1] };
      continue;
    }
    if (comando.type === 'L' && desde) {
      const hasta = { x: comando.values[0], y: comando.values[1] };
      // Lejos tanto de las anclas como del manejador central del segmento.
      const t = 0.37;
      return {
        x: p.position.x + desde.x + (hasta.x - desde.x) * t,
        y: p.position.y + desde.y + (hasta.y - desde.y) * t,
      };
    }
    if ('values' in comando && comando.values.length >= 2) {
      desde = {
        x: comando.values[comando.values.length - 2],
        y: comando.values[comando.values.length - 1],
      };
    }
  }
  throw new NoMontable('La pieza no tiene un tramo lineal editable');
}
async function pieza(page: Page, id: string | undefined) {
  const p = (await st(page)).project.pieces.find(p => p.id === id);
  if (!p) throw new NoMontable(`No existe la pieza previa ${id ?? '(no creada)'}`);
  return p;
}
async function pantalla(page: Page, p: Punto) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new NoMontable('No hay lienzo 2D');
  const { editor } = await st(page);
  const s = { x: box.x + editor.pan2D.x + p.x * editor.zoom2D,
    y: box.y + editor.pan2D.y + p.y * editor.zoom2D };
  expect(s.x, 'el gesto debe quedar dentro del lienzo 2D').toBeGreaterThan(box.x);
  expect(s.x).toBeLessThan(box.x + box.width);
  expect(s.y).toBeGreaterThan(box.y);
  expect(s.y).toBeLessThan(box.y + box.height);
  return s;
}
async function encuadrar(page: Page, puntos: Punto[]) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new NoMontable('No hay lienzo 2D');
  const { editor } = await st(page);
  const xs = puntos.map(p => box.x + editor.pan2D.x + p.x * editor.zoom2D);
  const ys = puntos.map(p => box.y + editor.pan2D.y + p.y * editor.zoom2D);
  const margen = 70;
  if (
    Math.min(...xs) >= box.x + margen && Math.max(...xs) <= box.x + box.width - margen
    && Math.min(...ys) >= box.y + margen && Math.max(...ys) <= box.y + box.height - margen
  ) return;

  expect(Math.max(...xs) - Math.min(...xs), 'los puntos deben caber juntos en el lienzo 2D')
    .toBeLessThan(box.width - margen * 2);
  expect(Math.max(...ys) - Math.min(...ys), 'los puntos deben caber juntos en el lienzo 2D')
    .toBeLessThan(box.height - margen * 2);

  let faltaX = box.x + box.width / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
  let faltaY = box.y + box.height / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
  const objetivo = { x: editor.pan2D.x + faltaX, y: editor.pan2D.y + faltaY };
  const maxX = box.width - margen * 2;
  const maxY = box.height - margen * 2;
  while (Math.abs(faltaX) > 0.5 || Math.abs(faltaY) > 0.5) {
    const dx = Math.max(-maxX, Math.min(maxX, faltaX));
    const dy = Math.max(-maxY, Math.min(maxY, faltaY));
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx - dx / 2, cy - dy / 2);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 8 });
    await page.mouse.up({ button: 'middle' });
    faltaX -= dx;
    faltaY -= dy;
  }
  await expect.poll(async () => {
    const actual = (await st(page)).editor.pan2D;
    return Math.hypot(actual.x - objetivo.x, actual.y - objetivo.y);
  }).toBeLessThan(2);
  for (const punto of puntos) await pantalla(page, punto);
}
async function clic(page: Page, p: Punto, button: 'left' | 'right' = 'left', offset: Punto = { x: 0, y: 0 }) {
  await encuadrar(page, [p]);
  const s = await pantalla(page, p);
  await page.mouse.move(s.x + offset.x, s.y + offset.y);
  await page.mouse.click(s.x + offset.x, s.y + offset.y, { button });
  await page.waitForTimeout(160);
}
async function activar(page: Page, tecla: string, id: string) {
  await page.keyboard.press(tecla);
  await expect.poll(async () => {
    const s = await st(page);
    return [s.editor.activeTool, s.tools.activeTool2D];
  }).toEqual([id, id]);
  await page.waitForTimeout(150);
}

test.use({ viewport: { width: 1920, height: 1080 }, trace: 'on' });
test('María 07-09: las trece promesas de corrido, con caja negra', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(6000);
  const dir = process.env.BITACORA_DUMP ?? testInfo.outputPath('replay-maria');
  mkdirSync(dir, { recursive: true });
  const resultados: Resultado[] = [];
  const navegador: Array<{ t: number; tipo: string; mensaje: string }> = [];
  page.on('pageerror', e => navegador.push({ t: Date.now(), tipo: 'pageerror', mensaje: e.message }));
  page.on('console', e => {
    if (e.type() === 'error') navegador.push({ t: Date.now(), tipo: 'console.error', mensaje: e.text() });
  });
  let primera: string | undefined;
  let segunda: string | undefined;
  let grande: string | undefined;
  let piezasAntesDeVaciar: PatternPiece[] = [];
  let modoLargosDeFabrica: RootState['editor']['lineLengthMode'] = 'none';
  const requisitos = new Map<number, Array<[string, string]>>();
  const requiere = (paso: number, ...pares: Array<[string, string]>) => requisitos.set(paso, pares);

  async function tramo(paso: number, nombre: string, fn: (r: Resultado) => Promise<void>) {
    // JOURNAL_COALESCE_MS=1000; sin esta pausa, el payload de una acción del
    // paso siguiente puede sobrescribir el anterior conservando su tiempo.
    await page.waitForTimeout(1100);
    const r: Resultado = { paso, nombre, desde: await reloj(page), hasta: 0, estado: 'PASA', observaciones: {} };
    resultados.push(r);
    await test.step(`${String(paso).padStart(2, '0')} ${nombre}`, async () => {
      try { await fn(r); }
      catch (error) {
        r.estado = error instanceof NoMontable ? 'NO MONTABLE' : 'FALLA';
        r.fallo = error instanceof Error ? error.message : String(error);
      } finally {
        r.hasta = await reloj(page);
        // La evidencia no puede matar lo que viene a documentar. El
        // `setDefaultTimeout(6000)` de arriba también gobierna al screenshot, y
        // una captura de 1920×1080 con `trace:'on'` en una máquina cargada no
        // cabe en 6 s. Como esto vive en un `finally`, al lanzar abortaba el
        // recorrido entero: la corrida del 2026-09-09 dejó el paso 1 en verde y
        // los doce siguientes sin ejecutar, con un informe de un solo resultado
        // que parecía un fallo del producto. Plazo propio, y si aun así falla se
        // anota en el paso y se sigue — un PNG que falta no invalida el veredicto.
        try {
          writeFileSync(join(dir, `${String(paso).padStart(2, '0')}-estado.json`), JSON.stringify(await st(page), null, 2));
          await page.screenshot({ path: join(dir, `${String(paso).padStart(2, '0')}.png`), timeout: 30_000 });
        } catch (error) {
          r.observaciones.evidenciaIncompleta = error instanceof Error ? error.message : String(error);
        }
        console.log(`MARIA ${paso}: ${r.estado} — ${nombre}${r.fallo ? `\n${r.fallo}` : ''}`);
      }
    });
  }

  try {
    await page.goto('/app/');
    await expect(page.locator('svg.pattern-svg')).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as unknown as { __VINA_STORE__?: unknown }).__VINA_STORE__));
    await expect(page.getByRole('button', { name: 'Split', exact: true })).toBeVisible();
    expect((await st(page)).project.pieces).toHaveLength(0);
    modoLargosDeFabrica = (await st(page)).editor.lineLengthMode;

    await tramo(1, '[00:34] Un clic crea 100×100', async r => {
      await activar(page, 's', 'rectangle');
      await expect(page.getByText('Un clic crea 100 × 100 mm · arrastra para dibujar')).toBeVisible();
      await clic(page, { x: 180, y: 170 });
      await expect.poll(async () => (await st(page)).project.pieces.length).toBe(1);
      primera = (await st(page)).project.pieces[0].id;
      r.observaciones.caja = caja(await pieza(page, primera));
      expect(r.observaciones.caja).toMatchObject({ w: 100, h: 100 });
      requiere(1, ['shortcut', 'tool.rectangle'], ['gesture', 'down'], ['action', 'project/addPiece']);
    });

    await tramo(2, '[01:04] La cota cambia ESA pieza a 300×150', async r => {
      const antes = await pieza(page, primera);
      await page.getByRole('button', { name: /^Ancho de la pieza:/ }).click();
      await page.keyboard.type('300');
      await page.keyboard.press('Tab');
      await page.keyboard.type('150');
      await page.keyboard.press('Enter');
      const despues = await pieza(page, primera);
      r.observaciones.caja = caja(despues);
      r.observaciones.largosTrasEditar = await page.locator(`[data-piece-id="${primera}"] .line-length-labels text`).allTextContents();
      expect((await st(page)).project.pieces.map(p => p.id)).toEqual([primera]);
      expect(despues.position).toEqual(antes.position);
      expect(caja(despues)).toMatchObject({ w: 300, h: 150 });
      await expect(page.getByRole('button', { name: /^Ancho de la pieza:/ })).toHaveText('300 mm');
      await expect(page.getByRole('button', { name: /^Alto de la pieza:/ })).toHaveText('150 mm');
      requiere(2, ['gesture', 'cota:commit'], ['action', 'project/updatePiece']);
    });

    await tramo(3, '[01:35] El siguiente clic vuelve a 100×100', async r => {
      const antes = await pieza(page, primera);
      await clic(page, { x: 600, y: 170 });
      await expect.poll(async () => (await st(page)).project.pieces.length).toBe(2);
      segunda = (await st(page)).project.pieces[1].id;
      r.observaciones.caja = caja(await pieza(page, segunda));
      expect(r.observaciones.caja).toMatchObject({ w: 100, h: 100 });
      expect(await pieza(page, primera)).toEqual(antes);
      requiere(3, ['gesture', 'down'], ['action', 'project/addPiece']);
    });

    await tramo(4, '[01:49] Arrastre grande, clic 100×100 y barra intacta', async r => {
      const opciones = (await st(page)).tools.toolOptions.rectangle;
      const inicio = { x: 180, y: 420 };
      const fin = { x: 500, y: 640 };
      await encuadrar(page, [inicio, fin, { x: 600, y: 440 }]);
      const a = await pantalla(page, inicio);
      const b = await pantalla(page, fin);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 12 });
      await page.mouse.up();
      await expect.poll(async () => (await st(page)).project.pieces.length).toBe(3);
      grande = (await st(page)).project.pieces[2].id;
      r.observaciones.arrastre = caja(await pieza(page, grande));
      expect(r.observaciones.arrastre).toMatchObject({ w: 320, h: 220 });
      // Separa las dos altas dentro del tramo para que sus payloads no se fusionen.
      await page.waitForTimeout(1100);
      await clic(page, { x: 600, y: 440 });
      await expect.poll(async () => (await st(page)).project.pieces.length).toBe(4);
      r.observaciones.clic = caja((await st(page)).project.pieces[3]);
      expect(r.observaciones.clic).toMatchObject({ w: 100, h: 100 });
      expect((await st(page)).tools.toolOptions.rectangle).toEqual(opciones);
      await page.keyboard.press('Escape');
      await expect(page.getByText('Un clic crea 100 × 100 mm · arrastra para dibujar')).toBeVisible();
      requiere(4, ['gesture', 'down'], ['action', 'project/addPiece']);
    });

    await tramo(5, '[06:30] Editar, convertir por clic derecho y moldear', async r => {
      const p = await pieza(page, primera);
      const b = caja(p);
      const tramoLineal = interiorDeTramoLineal(p);
      await activar(page, 'q', 'editPattern');
      await clic(page, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
      await clic(page, tramoLineal, 'right');
      await page.getByText('Convertir en curva', { exact: true }).click();
      const convertida = await pieza(page, primera);
      const curva = convertida.outline.find(comando => comando.type === 'C');
      if (!curva) throw new NoMontable('La conversión no dejó un segmento C');
      await clic(page, {
        x: convertida.position.x + curva.values[curva.values.length - 2],
        y: convertida.position.y + curva.values[curva.values.length - 1],
      });
      await expect(page.locator('.node-editor__control-handle')).toHaveCount(2);
      const antes = await pieza(page, primera);
      expect(antes.outline.some(c => c.type === 'C')).toBe(true);
      const handle = await page.locator('.node-editor__control-handle').first().boundingBox();
      if (!handle) throw new NoMontable('El manejador no tiene una caja visible');
      const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
      const trazadoAntes = await page.locator(`[data-piece-id="${primera}"] .piece-fill`).getAttribute('d');
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 45, { steps: 12 });
      await page.mouse.up();
      await expect.poll(async () => (await pieza(page, primera)).outline).not.toEqual(antes.outline);
      const despues = await pieza(page, primera);
      r.observaciones = { antes: antes.outline, despues: despues.outline, posicion: despues.position };
      expect(despues.position).toEqual(antes.position);
      // Moldear tiene que cambiar un control C, conservando los extremos.
      expect(despues.outline.map(c => c.type === 'C' ? c.values.slice(-2) : c.values))
        .toEqual(antes.outline.map(c => c.type === 'C' ? c.values.slice(-2) : c.values));
      expect(await page.locator(`[data-piece-id="${primera}"] .piece-fill`).getAttribute('d')).not.toBe(trazadoAntes);
      requiere(5, ['ui', 'contextmenu'], ['action', 'project/updatePiece'], ['gesture', 'down']);
    });

    await tramo(6, '[06:21] Seleccionar no deja anclas doradas', async r => {
      const p = await pieza(page, primera);
      const b = caja(p);
      // Producir un ancla dorada de verdad, tras haber moldeado la curva.
      await activar(page, 'q', 'editPattern');
      await clic(page, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
      await clic(page, { x: b.x, y: b.y + b.h });
      const dorado = page.locator('svg.pattern-svg [fill="#FFD700" i], svg.pattern-svg [stroke="#FFD700" i]');
      await expect(dorado).not.toHaveCount(0);
      r.observaciones.doradasAntes = await dorado.count();
      await activar(page, 'z', 'select');
      await expect(dorado).toHaveCount(0);
      r.observaciones.doradasDespues = await dorado.count();
      requiere(6, ['shortcut', 'tool.select'], ['action', 'editor/setActiveTool']);
    });

    await tramo(7, '[12:11] Rectángulo conserva la cruz sobre nodos', async r => {
      // Este paso exigía antes que la secuencia hubiera DEJADO el editor de
      // nodos encendido dentro de Seleccionar, y se declaraba NO MONTABLE si no
      // lo encontraba. Estaba pidiendo la avería: la tanda 1 no maquilló el
      // cursor, quitó el estado latente — cambiar de herramienta llama a
      // `exitNodeEdit` (useEditorInteractions.ts:363) y el overlay se desmonta
      // fuera de select/editCurve (ToolOverlay.tsx:337). Con el arreglo puesto
      // la precondición es inalcanzable, así que el paso se declaraba no
      // montable para siempre y no afirmaba nada.
      //
      // Ahora afirma las dos mitades, y juntas son más fuertes que la original:
      // que tras el paso 6 no queda editor vivo, y que la cruz de Rectángulo no
      // depende de que lo haya.
      r.observaciones.editoresVivosTrasSeleccionar = await page.locator('.node-editor').count();
      expect(r.observaciones.editoresVivosTrasSeleccionar,
        'cambiar de herramienta no puede dejar un editor de nodos vivo detrás').toBe(0);
      const b = caja(await pieza(page, primera));
      await activar(page, 's', 'rectangle');
      await encuadrar(page, [
        { x: b.x - 45, y: b.y + b.h },
        { x: b.x + 45, y: b.y + b.h },
      ]);
      const cursores: Array<{ svg: string; bajoElRaton: string }> = [];
      for (const dx of [45, 20, 5, 0, -5, 0, 5, 20, 45]) {
        const s = await pantalla(page, { x: b.x + dx, y: b.y + b.h });
        await page.mouse.move(s.x, s.y, { steps: 3 });
        await page.waitForTimeout(70);
        cursores.push(await page.evaluate(({ x, y }) => ({
          svg: getComputedStyle(document.querySelector('svg.pattern-svg')!).cursor,
          bajoElRaton: getComputedStyle(document.elementFromPoint(x, y)!).cursor,
        }), s));
      }
      r.observaciones.cursores = cursores;
      expect(cursores.every(c => c.svg === 'crosshair' && c.bajoElRaton === 'crosshair')).toBe(true);
      requiere(7, ['shortcut', 'tool.rectangle'], ['action', 'editor/setActiveTool']);
    });

    await tramo(8, '[08:45] Medir engancha dos esquinas y da el lado exacto', async r => {
      const b = caja(await pieza(page, segunda));
      await activar(page, 'm', 'measure');
      // Lado inferior: el superior de esta pieza queda tapado por la tira de
      // Medir. Un clic allí accionaría la tira, no sería un gesto de medición.
      await clic(page, { x: b.x, y: b.y + b.h }, 'left', { x: 4, y: 0 });
      await clic(page, { x: b.x + b.w, y: b.y + b.h }, 'left', { x: -4, y: 0 });
      await expect(page.locator('.measure-lines text').filter({ hasText: /^100([.,]0)?\s*mm$/ })).toHaveCount(1);
      r.observaciones.textos = await page.locator('.measure-lines text').allTextContents();
      r.observaciones.lineas = await page.locator('.measure-lines line').evaluateAll(els =>
        els.map(el => Object.fromEntries(['x1', 'y1', 'x2', 'y2'].map(a => [a, el.getAttribute(a)]))));
      requiere(8, ['shortcut', 'tool.measure'], ['gesture', 'down'], ['gesture', 'up']);
    });

    await tramo(9, '[08:20] Medición persistente y borrado desde la tira', async r => {
      const medida = page.locator('.measure-lines text').filter({ hasText: /^100([.,]0)?\s*mm$/ });
      if (await medida.count() !== 1) throw new NoMontable('El paso 8 no dejó la medición de 100 mm');
      await activar(page, 'z', 'select');
      await expect(medida).toHaveCount(1);
      r.observaciones.persisteAlSeleccionar = true;
      await activar(page, 'm', 'measure');
      const borrar = page.getByRole('button', { name: /borrar medici/i });
      await expect(borrar).toBeVisible();
      await borrar.click();
      await expect(page.locator('.measure-lines text')).toHaveCount(0);
      r.observaciones.borradasDesdeLaTira = true;
      requiere(9, ['shortcut', 'tool.select'], ['shortcut', 'tool.measure']);
    });

    await tramo(10, '[12:32] Proyecto vacío: interna apagada y g bloqueada', async r => {
      piezasAntesDeVaciar = (await st(page)).project.pieces;
      await activar(page, 'z', 'select');
      await page.keyboard.press('Escape');
      await page.keyboard.press('ControlOrMeta+a');
      await expect.poll(async () => (await st(page)).editor.selectedPieceIds.length).toBe(piezasAntesDeVaciar.length);
      await page.keyboard.press('Delete');
      await expect.poll(async () => (await st(page)).project.pieces.length).toBe(0);
      const interna = page.getByRole('button', { name: /^Línea interna/ });
      await expect(interna).toBeDisabled();
      await page.keyboard.press('g');
      await page.waitForTimeout(200);
      r.observaciones.herramientas = [(await st(page)).editor.activeTool, (await st(page)).tools.activeTool2D];
      expect(r.observaciones.herramientas).toEqual(['select', 'select']);
      await expect(interna).toBeDisabled();
      requiere(10, ['action', 'project/removePieces'], ['shortcut', 'tool.internalShape']);
    });

    await tramo(11, '[06:55] Los largos de cada lado vienen puestos', async r => {
      // Puente visible: volver a las MISMAS piezas con una sola operación Deshacer.
      if ((await st(page)).project.pieces.length === 0) {
        await page.keyboard.press('Control+z');
        await expect.poll(async () => (await st(page)).project.pieces.map(p => p.id))
          .toEqual(piezasAntesDeVaciar.map(p => p.id));
        expect((await st(page)).project.pieces).toEqual(piezasAntesDeVaciar);
        r.observaciones.puente = 'Un Deshacer restaura íntegramente las cuatro piezas borradas en 10';
      } else {
        r.observaciones.puente = 'El paso 10 no vació el proyecto; se comprueban los largos sobre el estado que quedó';
      }
      // ENMENDADO por la firma de María del 13-09: «Largos» es un interruptor
      // apagado de fábrica, sin vínculo con crear ni con seleccionar. Encendido
      // enseña los rótulos de cada pieza del proyecto.
      expect(modoLargosDeFabrica, 'Largos nace apagado').toBe('none');
      expect((await st(page)).editor.lineLengthMode).toBe('none');
      await pieza(page, segunda);

      await activar(page, 'z', 'select');
      const b = caja(await pieza(page, segunda));
      await clic(page, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
      await expect.poll(async () => (await st(page)).editor.selectedPieceIds).toEqual([segunda]);

      const largos = page.locator('.cota--lectura');
      await expect(largos, 'seleccionar una pieza no enciende sus largos').toHaveCount(0);
      const interruptorLargos = page.getByRole('button', { name: 'Largos', exact: true });
      await expect(interruptorLargos).toHaveAttribute('aria-pressed', 'false');
      await interruptorLargos.click();
      await expect(largos, 'encendido enseña el largo de los lados').not.toHaveCount(0);
      r.observaciones.largos = await largos.allTextContents();
      const numerosTodos = (r.observaciones.largos as string[])
        .map(t => Number.parseFloat(t.replace(/\s*mm/i, '').replace(',', '.')));
      const estadoConTodas = await st(page);
      const otraCuadrada = estadoConTodas.project.pieces.find(p =>
        p.id !== primera && p.id !== segunda && p.id !== grande);
      expect(caja(await pieza(page, segunda)), 'la segunda pieza conserva su geometría exacta')
        .toMatchObject({ w: 100, h: 100 });
      expect(otraCuadrada && caja(otraCuadrada), 'la cuarta pieza conserva su geometría exacta')
        .toMatchObject({ w: 100, h: 100 });
      expect(numerosTodos.some(n => Math.abs(n - 100) < 1),
        'Todas muestra visualmente los lados de 100 mm').toBe(true);
      expect(numerosTodos.some(n => Math.abs(n - 300) < 1) && numerosTodos.some(n => Math.abs(n - 150) < 1),
        'Todas muestra visualmente los lados vivos 300 y 150 de la pieza editada').toBe(true);
      expect(numerosTodos.some(n => Math.abs(n - 320) < 1) && numerosTodos.some(n => Math.abs(n - 220) < 1),
        'Todas incluye también la pieza grande de 320×220').toBe(true);
      await expect(interruptorLargos).toHaveAttribute('aria-pressed', 'true');

      // Y sobre la pieza EDITADA en el paso 2, el largo tiene que ser el del
      // contorno vivo (300×150), no el dato guardado que decía 100. Es el bug
      // que este mismo recorrido cazó el 08-09; se comprueba que sigue muerto.
      // Por el CENTRO: a esta pieza le convertimos el borde de arriba en curva
      // en el paso 5, así que su esquina superior izquierda ya no está dentro
      // del contorno y un clic ahí cae en el papel.
      const bp = caja(await pieza(page, primera));
      await clic(page, { x: bp.x + bp.w / 2, y: bp.y + bp.h / 2 });
      await expect.poll(async () => (await st(page)).editor.selectedPieceIds).toEqual([primera]);
      const rotulosEditada = await page.locator('.cota--lectura').allTextContents();
      r.observaciones.largosPiezaEditada = rotulosEditada;
      // El oráculo negativo del dato guardado, por pieza y no por pantalla
      // (revisión 13-09, M15): con el interruptor encendido hay otras piezas de
      // 100×100 a la vista, así que se filtran los rótulos por la caja de la
      // pieza editada y ninguno de ESOS puede seguir diciendo 100.
      const cajaEditada = await page.locator(`[data-piece-id="${primera}"].pattern-piece`).boundingBox();
      expect(cajaEditada, 'la pieza editada tiene caja en pantalla').not.toBeNull();
      const rotulosDentro: string[] = [];
      for (const rotulo of await page.locator('.cota--lectura').all()) {
        const c = await rotulo.boundingBox();
        if (!c || !cajaEditada) continue;
        const cx = c.x + c.width / 2;
        const cy = c.y + c.height / 2;
        if (cx >= cajaEditada.x - 40 && cx <= cajaEditada.x + cajaEditada.width + 40
          && cy >= cajaEditada.y - 40 && cy <= cajaEditada.y + cajaEditada.height + 40) {
          rotulosDentro.push(await rotulo.innerText());
        }
      }
      r.observaciones.largosDentroDeLaEditada = rotulosDentro;
      const numerosDentro = rotulosDentro.map(t => Number.parseFloat(t.replace(/\s*mm/i, '').replace(',', '.')));
      expect(numerosDentro.length, 'la pieza editada tiene rótulos propios').toBeGreaterThan(0);
      expect(numerosDentro.every(n => Math.abs(n - 100) > 1),
        'ningún rótulo de la pieza editada puede seguir diciendo el largo viejo de 100').toBe(true);
      await expect(page.getByRole('button', { name: /^Ancho de la pieza:/ }),
        'el chip editable toma el ancho vivo, no el dato viejo').toHaveText('300 mm');
      // El paso 5 subió un asa 45 mm: los extremos siguen delimitando 300×150,
      // pero el bbox vivo (y por tanto su chip Alto) crece de 150 a 195.
      await expect(page.getByRole('button', { name: /^Alto de la pieza:/ }),
        'el chip editable toma el alto vivo tras moldear, no el dato viejo').toHaveText('195 mm');
      expect(caja(await pieza(page, primera)), 'el bbox real incorpora los 45 mm del asa')
        .toMatchObject({ w: 300, h: 195 });
    });

    await tramo(12, '[23:32] Una interna de tres tramos: solo uno y una cota', async r => {
      const p = await pieza(page, grande);
      const b = caja(p);
      const puntos = [{ x: 30, y: 50 }, { x: 130, y: 50 }, { x: 130, y: 140 }, { x: 260, y: 140 }]
        .map(a => ({ x: b.x + a.x, y: b.y + a.y }));
      await activar(page, 'g', 'internalShape');
      for (const punto of puntos) await clic(page, punto);
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await pieza(page, grande)).internals.length).toBe(p.internals.length + 1);
      const interna = (await pieza(page, grande)).internals.at(-1)!;
      expect(interna.path.map(c => c.type)).toEqual(['M', 'L', 'L', 'L']);
      await activar(page, 'z', 'select');
      // Seleccionar el tramo intermedio de 90 mm, diferente a los otros dos.
      await clic(page, { x: puntos[1].x, y: (puntos[1].y + puntos[2].y) / 2 });
      const seleccion = (await st(page)).editor.selectedInternalLine;
      r.observaciones = { ...r.observaciones, path: interna.path, seleccion };
      expect(seleccion).toMatchObject({ pieceId: grande, lineId: interna.id, segmentIndex: 2 });
      await expect(page.locator('[data-internal-line-segment]')).toHaveCount(1);
      await expect(page.locator('[data-internal-line-segment]')).toHaveAttribute('data-internal-line-segment', '2');
      await expect(page.locator('.cota:not(.cota--hueca)')).toHaveCount(1);
      await expect(page.locator('.cota:not(.cota--hueca)')).toHaveText(/90\s*mm/);
      requiere(12, ['gesture', 'internalShape:press'], ['gesture', 'key'], ['action', 'project/addInternalLine']);
    });

    await tramo(13, '[14:07] Pluma, tres puntos, Enter: el trazo cierra solo', async r => {
      // ENMENDADO el 2026-09-09 (contrato § 4). Antes este paso exigía el
      // AVISO. El aviso funcionaba —verificado a mano en el navegador el
      // 09-09— pero avisar de algo que se resuelve solo es peor que
      // resolverlo, y el contrato de interfaz § 4 ya lo decía: "actuar y
      // ofrecer deshacer antes que preguntar". Con tres nodos hay polígono, así
      // que Enter cierra; el aviso queda para los dos nodos, donde sigue siendo
      // cierto (lo cubre tanda5-un-cuadro-y-un-aviso.spec.ts).
      const ids = (await st(page)).project.pieces.map(p => p.id);
      await activar(page, 'h', 'pen');
      for (const punto of [{ x: 200, y: 780 }, { x: 380, y: 780 }, { x: 420, y: 880 }]) await clic(page, punto);
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await st(page)).project.pieces.length).toBe(ids.length + 1);
      const nuevas = (await st(page)).project.pieces.filter(p => !ids.includes(p.id));
      expect(nuevas).toHaveLength(1);
      expect(nuevas[0].outline.map(c => c.type), 'con tres nodos, Enter cierra el trazo').toContain('Z');
      await expect(
        page.locator('.toast__message').filter({ hasText: 'no se puede simular' }),
        'y si cerró, no queda nada que advertir',
      ).toHaveCount(0);
      r.observaciones = { pieza: nuevas[0], avisos: await page.locator('.toast__message').allTextContents() };
      requiere(13, ['gesture', 'key'], ['action', 'project/addPiece']);
    });
  } finally {
    const bundle = await exportBundle(page);
    writeFileSync(join(dir, 'diagnostico-completo.json'), JSON.stringify(bundle, null, 2));
    writeFileSync(join(dir, 'errores-navegador.json'), JSON.stringify(navegador, null, 2));
    const journal = bundle.journal as { events?: Evento[]; dropped?: number } | undefined;
    const eventos = journal?.events ?? [];
    guardarEvidencia('sesion-completa', eventos, 0);
    guardarEvidencia('00-arranque', eventos.filter(e => e.t < (resultados[0]?.desde ?? Infinity)), 0);
    for (const r of resultados) {
      const ev = eventos.filter(e => (e.tLast ?? e.t) >= r.desde && e.t <= r.hasta);
      writeFileSync(join(dir, `${String(r.paso).padStart(2, '0')}-journal-bruto.json`), JSON.stringify(ev, null, 2));
      r.evidencia = guardarEvidencia(`${String(r.paso).padStart(2, '0')}-bitacora`, ev, 0);
      r.anomalias = ev.filter(e => e.kind === 'error' || e.name === 'no-paso-nada');
      r.faltaTelemetria = (requisitos.get(r.paso) ?? []).filter(([kind, name]) => indiceDe(ev, kind, name) < 0)
        .map(([kind, name]) => `${kind} ${name}`);
    }
    const anomalias = eventos.filter(e => e.kind === 'error' || e.name === 'no-paso-nada');
    const resumen = { resultados, dropped: journal?.dropped, totalEventos: eventos.length,
      anomalias, navegador, limites: [
        'Orden numerado del encargo; no orden cronológico de la grabación.',
        'Split 1920×1080, sin activar simulación ni reproducir todos los movimientos intermedios del video.',
        'Vaciar mediante selección y borrado reales; Deshacer para recuperar las mismas piezas.',
        'Pausas de 1100 ms para separar acciones que la bitácora fusiona.',
        'Medir tiene estado local: se comprueba el resultado DOM además de los gestos, sin exigir acción Redux.',
      ] };
    writeFileSync(join(dir, 'resultado.json'), JSON.stringify(resumen, null, 2));
    await testInfo.attach('resultado-maria', { body: JSON.stringify(resumen, null, 2), contentType: 'application/json' });
    const problemas = resultados.filter(r => r.estado !== 'PASA' || r.anomalias?.length || r.faltaTelemetria?.length);
    for (const r of problemas) console.log(`EVIDENCIA MARIA ${r.paso}\n${r.evidencia?.join('\n')}`);
    if (anomalias.length) console.log(`ANOMALIAS GLOBALES\n${lineaDeTiempo(anomalias, 0).join('\n')}`);
    expect.soft(resultados, 'Deben ejecutarse los trece tramos').toHaveLength(13);
    expect.soft(journal?.dropped, 'La caja negra no puede haber perdido eventos').toBe(0);
    expect.soft(anomalias, 'Errores/noPasoNada de toda la sesión, incluso con asserts funcionales verdes').toEqual([]);
    expect.soft(navegador, 'Errores del navegador, aunque no aparezcan como kind error').toEqual([]);
    expect.soft(problemas.map(r => ({ paso: r.paso, estado: r.estado, fallo: r.fallo, faltaTelemetria: r.faltaTelemetria })),
      'Las promesas se juzgan junto con la evidencia').toEqual([]);
  }
});
