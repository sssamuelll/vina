/**
 * Contrato E2E final de la gramática numérica de #1161.
 *
 * Cada caso termina el gesto para poder leer sus coordenadas desde Redux y
 * guarda la bitácora junto con una observación E2E del foco y los campos.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { activarHerramienta, addPiece, clickAt, st, toScreen, type Cmd } from './helpers/lienzo';
import { guardarEvidencia, leerBitacora, type EventoBitacora } from './helpers/bitacora';

const INICIO = { x: 200, y: 250 };
const RUMBO_INICIAL = { x: 250, y: 250 };

const campo = (page: Page, nombre: 'Largo' | 'Ángulo') =>
  page.getByRole('textbox', { name: nombre });
const chip = (page: Page, nombre: 'Largo' | 'Ángulo') =>
  page.getByRole('button', { name: new RegExp(`^${nombre}:`) });

async function escribir(page: Page, valor: string) {
  await page.keyboard.press('Control+a');
  await page.keyboard.type(valor);
}

async function prepararTramo(page: Page) {
  await waitForApp(page);
  // Fixture sencillo compartido; queda lejos del gesto y prueba que el trazo
  // de construcción convive con una pieza real sin depender de ella.
  await addPiece(page, 'fixture-1161', { x: 700, y: 450 }, 100, 80);
  await activarHerramienta(page, 'h', 'pen');
  await clickAt(page, INICIO);
  const rumbo = await toScreen(page, RUMBO_INICIAL);
  await page.mouse.move(rumbo.x, rumbo.y);
  await page.waitForTimeout(100);
  await page.keyboard.press('Tab');
  await campo(page, 'Largo').waitFor({ state: 'visible', timeout: 5000 });
}

async function estadoCampos(page: Page) {
  return page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input.cota--editando'));
    const activo = document.activeElement;
    return {
      foco: activo instanceof HTMLElement ? activo.getAttribute('aria-label') : null,
      campos: Object.fromEntries(inputs.map(input => [input.getAttribute('aria-label'), input.value])),
    };
  });
}

function puntos(path: Cmd[]) {
  return path.filter(command => command.type !== 'Z').map(command => ({
    x: command.values[command.values.length - 2],
    y: command.values[command.values.length - 1],
  }));
}

function distancia(path: Cmd[]) {
  const [a, b] = puntos(path);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

async function terminarConUnEscape(page: Page) {
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await st(page)).project.trazos.length, { timeout: 5000 }).toBe(1);
  return (await st(page)).project.trazos[0].path;
}

async function evidenciar(
  page: Page,
  nombre: string,
  observacion: Record<string, unknown>,
) {
  const eventos = await leerBitacora(page);
  const observado: EventoBitacora = {
    t: (eventos.at(-1)?.t ?? 0) + 1,
    kind: 'ui',
    name: 'e2e:observacion',
    data: observacion,
  };
  const lineas = guardarEvidencia(nombre, [...eventos, observado], 'pen');
  console.log(lineas.join('\n'));
  return eventos;
}

test.describe('#1161 — gramática final de Largo y Ángulo', () => {
  test.setTimeout(120_000);

  test('1 · Enter en Largo coloca el nodo, suelta la cota y vuelve al ratón', async ({ page }) => {
    await prepararTramo(page);
    await escribir(page, '100');
    await page.keyboard.press('Enter');
    await campo(page, 'Largo').waitFor({ state: 'detached', timeout: 5000 });
    await chip(page, 'Largo').waitFor({ state: 'detached', timeout: 5000 });

    const despuesDeEnter = await estadoCampos(page);
    const path = await terminarConUnEscape(page);
    const coordenadas = puntos(path);
    const eventos = await evidenciar(page, '1161-final-1-enter-en-largo', {
      despuesDeEnter,
      coordenadasStore: coordenadas,
    });

    expect(despuesDeEnter, 'Enter dejó un campo numérico reteniendo el foco')
      .toEqual({ foco: null, campos: {} });
    expect(eventos.find(evento => evento.name === 'pen:nextPoint' && evento.data?.op === 'place')?.data)
      .toMatchObject({ length: 100, angle: 0, nodes: 2 });
    expect(coordenadas).toEqual([INICIO, { x: 300, y: 250 }]);
  });

  test('2a · Largo 100 y clic en Ángulo conserva 100', async ({ page }) => {
    await prepararTramo(page);
    await escribir(page, '100');
    await campo(page, 'Ángulo').click();
    const despuesDelClick = await estadoCampos(page);
    await escribir(page, '90');
    await page.keyboard.press('Enter');
    await campo(page, 'Largo').waitFor({ state: 'detached', timeout: 5000 });

    const despuesDeEnter = await estadoCampos(page);
    const path = await terminarConUnEscape(page);
    const coordenadas = puntos(path);
    const largoFinal = distancia(path);
    await evidenciar(page, '1161-final-2a-click-angulo', {
      despuesDelClick,
      despuesDeEnter,
      coordenadasStore: coordenadas,
      largoFinal,
    });

    expect(largoFinal, 'clicar Ángulo descartó el largo escrito').toBeCloseTo(100, 3);
  });

  test('2b · Largo 100 y Tab a Ángulo conserva 100', async ({ page }) => {
    await prepararTramo(page);
    await escribir(page, '100');
    await page.keyboard.press('Tab');
    await campo(page, 'Ángulo').waitFor({ state: 'visible', timeout: 5000 });
    const despuesDeTab = await estadoCampos(page);
    await escribir(page, '90');
    await page.keyboard.press('Enter');
    await campo(page, 'Largo').waitFor({ state: 'detached', timeout: 5000 });

    const path = await terminarConUnEscape(page);
    const coordenadas = puntos(path);
    const largoFinal = distancia(path);
    await evidenciar(page, '1161-final-2b-tab-angulo', {
      despuesDeTab,
      coordenadasStore: coordenadas,
      largoFinal,
    });

    expect(largoFinal).toBeCloseTo(100, 3);
    expect(coordenadas[1]).toEqual({ x: 200, y: 150 });
  });

  test('3 · Tab, Largo 100, Enter y un Esc conserva el trazo', async ({ page }) => {
    await prepararTramo(page);
    await escribir(page, '100');
    await page.keyboard.press('Enter');
    await campo(page, 'Largo').waitFor({ state: 'detached', timeout: 5000 });

    const despuesDeEnter = await estadoCampos(page);
    const path = await terminarConUnEscape(page);
    const estadoFinal = await st(page);
    const coordenadas = puntos(path);
    const eventos = await evidenciar(page, '1161-final-3-escape-conserva', {
      despuesDeEnter,
      coordenadasStore: coordenadas,
      piezasStore: estadoFinal.project.pieces.map(piece => piece.id),
      trazosStore: estadoFinal.project.trazos.map(trazo => trazo.id),
    });

    expect(estadoFinal.project.trazos).toHaveLength(1);
    expect(distancia(path)).toBeCloseTo(100, 3);
    expect(eventos.find(evento => evento.name === 'pen:complete')?.data)
      .toMatchObject({ kind: 'trazo', nodes: 2, via: 'esc' });
  });
});
