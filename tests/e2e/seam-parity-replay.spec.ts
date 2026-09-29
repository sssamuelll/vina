/**
 * Seam parity replay specs — lote 1 (post-ship plan R1, épica #879).
 *
 * El benchmark CLO3D (docs/research/2026-06-11-clo3d-sewing-ux-reference.md)
 * como spec FALSABLE: un replay por comportamiento del manual, ejercitando lo
 * que el plan de paridad shippeó (#871-#876). Estos specs son además la red
 * de regresión de la épica E1 (boundary entity, #878) — cada rebanada del
 * refactor debe dejarlos verdes.
 *
 * Convenciones del harness (sewing-tools.spec.ts / helpers/sim.ts):
 * estado vía `window.__VINA_STORE__` dispatch (geometría determinista),
 * interacción real solo donde el comportamiento ES la interacción (clicks de
 * cosido, Ctrl+B).
 */
import { test, expect, Page } from '@playwright/test';
import { switchView, startSimulation } from './helpers/sim';

// ─── Harness ─────────────────────────────────────────────────────────────────

async function waitFor2D(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __VINA_STORE__?: unknown }).__VINA_STORE__),
    { timeout: 15000 },
  );
  await page.waitForTimeout(500);
}

async function dispatch(page: Page, action: { type: string; payload?: unknown }) {
  await page.evaluate((act) => {
    const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as
      | { dispatch: (a: unknown) => void }
      | undefined;
    store?.dispatch(act);
  }, action);
}

/** maria-210: el SeamRenderer solo pinta dentro de la superficie de costura
 *  (herramienta de coser activa o seam seleccionado). Los tests que asertan
 *  el render de costuras deben entrar primero. */
async function enterSewingSurface(page: Page) {
  await dispatch(page, { type: 'editor/setActiveTool', payload: 'seam' });
  await dispatch(page, { type: 'tools/setActiveTool2D', payload: 'seam' });
}

async function getState<T = unknown>(page: Page, path: string): Promise<T> {
  return page.evaluate((sel) => {
    const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as
      | { getState: () => unknown }
      | undefined;
    if (!store) return null;
    const state = store.getState();
    return sel
      .split('.')
      .reduce((o: unknown, k) => (o as Record<string, unknown> | null)?.[k], state) as T;
  }, path) as Promise<T>;
}

/**
 * El SimulationStatusOverlay arranca COLAPSADO (Fase1-H2, plan 2026-07-16):
 * el header deja el tier y el badge ⚠, y el detalle de telemetría — entre él
 * el recuento de restricciones de costura — vive tras un click. Los asserts de
 * observabilidad de seams miran ese detalle, así que hay que abrirlo.
 */
async function expandSimOverlay(page: Page) {
  const toggle = page.getByRole('button', { name: 'Estado de la simulación' });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

/** Pattern-space (mm) → screen coords. Defaults: zoom=1, pan=(0,0). */
async function patternToScreen(page: Page, px: number, py: number) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('pattern svg not visible');
  const zoom = (await getState<number>(page, 'editor.zoom2D')) ?? 1;
  const pan = (await getState<{ x: number; y: number }>(page, 'editor.pan2D')) ?? { x: 0, y: 0 };
  return { x: box.x + pan.x + px * zoom, y: box.y + pan.y + py * zoom };
}

/** Press a tool shortcut until the canonical store field reflects it. */
async function activateToolKey(page: Page, key: string, expected: string) {
  await expect
    .poll(
      async () => {
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
        await page.keyboard.press(key);
        await page.waitForTimeout(120);
        return getState<string>(page, 'editor.activeTool');
      },
      { timeout: 8000, intervals: [150, 150, 150, 150] },
    )
    .toBe(expected);
}

/**
 * Rect piece (W=100) con cierre L explícito y edges semánticos en espacio de
 * COMANDOS (el contrato del producer). top [1,2] / right [2,3] /
 * bottom [3,4] / left [4,5].
 */
function rectPiece(id: string, name: string, x: number, y: number, height = 100) {
  const now = Date.now();
  return {
    id,
    name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, height] },
      { type: 'L', values: [0, height] },
      { type: 'L', values: [0, 0] },
      { type: 'Z', values: [] },
    ],
    edges: [
      { id: `${id}:top`, name: 'top', segmentRange: [1, 2], edgeType: 'other' },
      { id: `${id}:right`, name: 'right', segmentRange: [2, 3], edgeType: 'other' },
      { id: `${id}:bottom`, name: 'bottom', segmentRange: [3, 4], edgeType: 'other' },
      { id: `${id}:left`, name: 'left', segmentRange: [4, 5], edgeType: 'other' },
    ],
    internals: [],
    position: { x, y },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeSeam(
  id: string,
  aId: string,
  aEdge: string,
  bId: string,
  bEdge: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    pieceA: { pieceId: aId, edgeName: aEdge },
    pieceB: { pieceId: bId, edgeName: bEdge },
    type: 'standard',
    tension: 100,
    strength: 1,
    active: true,
    taped: false,
    tapeWidth: 10,
    ...overrides,
  };
}

/** CCW-based segment intersection (the crossed-X predicate). */
function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}
function segmentsIntersect(
  a: number[], b: number[],
) {
  const [x1, y1, x2, y2] = a;
  const [x3, y3, x4, y4] = b;
  return (
    ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
    ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4)
  );
}

/** Read the two .seam-detail connection lines as [x1,y1,x2,y2] tuples. */
async function readConnectionLines(page: Page): Promise<number[][]> {
  return page.evaluate(() => {
    const lines = Array.from(
      document.querySelectorAll('g.seam-connection .seam-detail > line'),
    );
    return lines.map((l) => [
      parseFloat(l.getAttribute('x1') ?? '0'),
      parseFloat(l.getAttribute('y1') ?? '0'),
      parseFloat(l.getAttribute('x2') ?? '0'),
      parseFloat(l.getAttribute('y2') ?? '0'),
    ]);
  });
}

// ─── Replays ─────────────────────────────────────────────────────────────────

test.describe('Seam parity replay — lote 1', () => {
  // CLO3D: "2-click sewing" (Seam/Free Sewing tool) — click una mitad,
  // click la otra → par creado.
  test('2 clicks crean un seam entre dos piezas (Seam tool)', async ({ page }) => {
    await waitFor2D(page);
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pa', 'Front', 40, 40) });
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pb', 'Back', 220, 40) });
    await page.waitForTimeout(300);

    await activateToolKey(page, 'n', 'seam');

    // Click 1: borde derecho de A (midpoint). Click 2: borde izquierdo de B.
    const c1 = await patternToScreen(page, 140, 90);
    await page.mouse.click(c1.x, c1.y);
    await page.waitForTimeout(250);
    const c2 = await patternToScreen(page, 220, 90);
    await page.mouse.click(c2.x, c2.y);

    await expect
      .poll(async () => ((await getState<unknown[]>(page, 'project.seams')) ?? []).length, {
        timeout: 5000,
      })
      .toBe(1);

    const seam = (await getState<Array<Record<string, { pieceId: string; edgeName: string }>>>(
      page,
      'project.seams',
    ))![0];
    expect(seam.pieceA.pieceId).toBe('pa');
    expect(seam.pieceB.pieceId).toBe('pb');
    await expect(page.locator('g.seam-connection')).toHaveCount(1);
  });

  // El núcleo del plan: el seam VIVE en el tier por defecto (WASM). Este
  // replay habría cazado el bug del worker (Fase 5): el init con seams
  // crasheaba y caía a CPU en silencio — el tier reportado habría sido
  // 'cpu-worker'.
  test('la sim con seams arranca en WASM con constraints activos', async ({ page }) => {
    test.setTimeout(90_000);
    await waitFor2D(page);
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pa', 'Front', 40, 40) });
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pb', 'Back', 220, 40) });
    await dispatch(page, {
      type: 'project/addSeam',
      payload: makeSeam('s-sim', 'pa', 'right', 'pb', 'left'),
    });

    await switchView(page, '3D');
    await startSimulation(page);

    // El cascade elige tier asíncronamente (fetch + compile del WASM).
    await expect
      .poll(async () => getState<string>(page, 'simulation.solverTier'), { timeout: 45_000 })
      .not.toBe('none');

    const tier = await getState<string>(page, 'simulation.solverTier');
    expect(tier).toBe('wasm');

    // Observabilidad Fase 4: el summary main-thread reporta constraints > 0
    // y ningún seam a cero.
    const summary = await getState<{
      totalConstraints: number;
      zeroConstraintSeams: unknown[];
    }>(page, 'simulation.seamResolution');
    expect(summary).not.toBeNull();
    expect(summary!.totalConstraints).toBeGreaterThan(0);
    expect(summary!.zeroConstraintSeams).toHaveLength(0);

    // Y el overlay lo enseña al usuario.
    await expandSimOverlay(page);
    // Copia del overlay (SimulationStatusOverlay): "🧵 N restricciones de
    // costura". Decía "constraints" y el i18n del 14-08 lo tradujo; el spec se
    // quedó con el inglés y llevaba cinco semanas rojo sin que nadie lo viera,
    // porque no está en ningún gate.
    await expect(page.locator('text=/restricciones de costura/')).toBeVisible({ timeout: 10_000 });
  });

  // Fase 4: un seam irresoluble NO falla en silencio — toast de error +
  // warning en el overlay; la sim arranca igual (degradación, no aborto).
  test('seam irresoluble → toast "no va a coser" + warning en overlay', async ({ page }) => {
    test.setTimeout(90_000);
    await waitFor2D(page);
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pa', 'Front', 40, 40) });
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pb', 'Back', 220, 40) });
    await dispatch(page, {
      type: 'project/addSeam',
      payload: makeSeam('s-bad', 'pa', 'noSuchEdge', 'pb', 'left'),
    });

    await switchView(page, '3D');
    await startSimulation(page);

    // El toast lo escribe useSimulationLifecycle y está en español desde el
    // i18n: "1 costura no se pudo resolver y no va a coser — revisa el
    // emparejado de bordes". Se ancla al verbo, no a la frase entera, para que
    // un retoque de redacción no vuelva a dejar esto rojo en silencio.
    await expect(page.locator('.toast--error .toast__message')).toContainText('no va a coser', {
      timeout: 30_000,
    });

    const summary = await getState<{ zeroConstraintSeams: Array<{ seamId: string }> }>(
      page,
      'simulation.seamResolution',
    );
    expect(summary!.zeroConstraintSeams.map((z) => z.seamId)).toEqual(['s-bad']);
    await expandSimOverlay(page);
    // "⚠️ N costura(s) sin restricciones — no va a coser". El mismo i18n del
    // 14-08 que tradujo el toast tradujo también este aviso; el spec se quedó
    // con las dos cadenas en inglés y solo se veía la primera, porque el
    // assert que fallaba cortaba el test antes de llegar aquí.
    await expect(page.locator('text=/sin restricciones/')).toBeVisible({
      timeout: 10_000,
    });
  });

  // CLO3D: "When Directional Notches are crossed, the Sewing Lines are
  // crossed as well" — la X es la señal de error pre-sim.
  test('mitades en direcciones opuestas dibujan la X cruzada', async ({ page }) => {
    await waitFor2D(page);
    // A right [2,3] corre (100,0)→(100,120) hacia abajo; B left [4,5] corre
    // (0,120)→(0,0) hacia arriba → start↔start y end↔end se cruzan.
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pa', 'Front', 40, 60, 120) });
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pb', 'Back', 240, 60, 120) });
    await dispatch(page, {
      type: 'project/addSeam',
      payload: makeSeam('s-x', 'pa', 'right', 'pb', 'left'),
    });
    await enterSewingSurface(page);
    await page.waitForTimeout(400);

    const lines = await readConnectionLines(page);
    expect(lines).toHaveLength(2);
    expect(segmentsIntersect(lines[0], lines[1])).toBe(true);
  });

  // CLO3D: "se corrige con Reverse Sewing (Ctrl+B)" — el atajo completo de
  // punta a punta: ShortcutProvider → handler → reducer → renderer.
  test('Ctrl+B invierte la dirección y deshace la X; otro Ctrl+B la restaura', async ({ page }) => {
    await waitFor2D(page);
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pa', 'Front', 40, 60, 120) });
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pb', 'Back', 240, 60, 120) });
    await dispatch(page, {
      type: 'project/addSeam',
      payload: makeSeam('s-rev', 'pa', 'right', 'pb', 'left'),
    });
    await dispatch(page, { type: 'editor/selectSeam', payload: 's-rev' });
    await page.waitForTimeout(300);

    const before = await readConnectionLines(page);
    expect(segmentsIntersect(before[0], before[1])).toBe(true);

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press('Control+b');

    await expect
      .poll(async () => {
        const seams = await getState<Array<{ pieceB: { reversed?: boolean } }>>(
          page,
          'project.seams',
        );
        return seams?.[0]?.pieceB?.reversed === true;
      }, { timeout: 5000 })
      .toBe(true);

    const after = await readConnectionLines(page);
    expect(segmentsIntersect(after[0], after[1])).toBe(false);

    // Ctrl+B de nuevo = identidad (criterio done de Fase 5).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press('Control+b');
    await expect
      .poll(async () => {
        const seams = await getState<Array<{ pieceB: { reversed?: boolean } }>>(
          page,
          'project.seams',
        );
        return seams?.[0]?.pieceB?.reversed === true;
      }, { timeout: 5000 })
      .toBe(false);
    const restored = await readConnectionLines(page);
    expect(segmentsIntersect(restored[0], restored[1])).toBe(true);
  });

  // CLO3D: "cada par tiene color chip estable" — Fase 6: la identidad nunca
  // desaparece al interactuar ni cuando se borra un vecino.
  test('el color del par sobrevive a la selección y al borrado de un vecino', async ({ page }) => {
    await waitFor2D(page);
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pa', 'Front', 40, 40) });
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pb', 'Back', 220, 40) });
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pc', 'Sleeve', 400, 40) });
    await dispatch(page, { type: 'project/addSeam', payload: makeSeam('s-1', 'pa', 'right', 'pb', 'left') });
    await dispatch(page, { type: 'project/addSeam', payload: makeSeam('s-2', 'pb', 'right', 'pc', 'left') });
    await enterSewingSurface(page);
    await page.waitForTimeout(400);

    const readStroke = () =>
      page.evaluate(() => {
        const g = document.querySelectorAll('g.seam-connection')[0];
        const p = g?.querySelector(
          'path[fill="none"]:not(.seam-direction-tick):not(.seam-selection-glow)',
        ) as SVGPathElement | null;
        return { stroke: p?.style.stroke ?? '', width: p?.getAttribute('stroke-width') ?? '' };
      });

    const base = await readStroke();
    expect(base.stroke).not.toBe('');

    // Selección: peso, no recolor.
    await dispatch(page, { type: 'editor/selectSeam', payload: 's-1' });
    await page.waitForTimeout(300);
    const selected = await readStroke();
    expect(selected.stroke).toBe(base.stroke);
    expect(parseFloat(selected.width)).toBeGreaterThan(parseFloat(base.width));

    // Borrar el vecino no recolorea al superviviente (hash de id, no índice).
    await dispatch(page, { type: 'project/removeSeam', payload: 's-2' });
    await page.waitForTimeout(300);
    const survivor = await readStroke();
    expect(survivor.stroke).toBe(base.stroke);
  });

  // CLO3D: "diferencia de longitud... si supera 1 mm se muestra en rojo" —
  // Fase 6: mm absolutos (19mm en 400mm = 4.75%, invisible para el viejo 5%).
  test('mismatch de longitud en mm absolutos, rojo sobre 1mm', async ({ page }) => {
    await waitFor2D(page);
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pa', 'Front', 40, 40, 400) });
    await dispatch(page, { type: 'project/addPiece', payload: rectPiece('pb', 'Back', 220, 40, 419) });
    await dispatch(page, {
      type: 'project/addSeam',
      payload: makeSeam('s-mm', 'pa', 'right', 'pb', 'left'),
    });
    await enterSewingSurface(page);
    await page.waitForTimeout(400);

    // Label del SeamRenderer: "⚠ 19.0mm de diferencia".
    await expect(page.locator('svg.pattern-svg text', { hasText: '19.0mm de diferencia' })).toBeVisible();
  });

  // Fase 6: los anchos per-edge del SA tool sobreviven el load generativo
  // (re-key por nombre) — antes desaparecían en cada load→save→reload.
  test('per-edge SA width sobrevive el load generativo (re-key por nombre)', async ({ page }) => {
    await waitFor2D(page);

    const basePayload = (pieces: unknown[]) => ({
      id: 'proj-sa',
      name: 'SA widths',
      createdAt: 0,
      updatedAt: 0,
      fabrics: [],
      avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} },
      pieces,
      seams: [],
    });

    // 1ª carga: pieza categorizada SIN edges → el load los auto-detecta.
    const piece = {
      ...rectPiece('bf', 'Bodice Front', 40, 40),
      category: 'bodice',
      edges: undefined,
    };
    await dispatch(page, { type: 'project/loadProject', payload: basePayload([piece]) });
    await page.waitForTimeout(300);

    const detected = await getState<Array<{ name: string }>>(page, 'project.pieces.0.edges');
    expect(detected!.length).toBeGreaterThan(0);
    const targetName = detected![0].name;

    // 2ª carga (el round-trip save→reload): mismos edges con un width puesto.
    const withWidth = {
      ...rectPiece('bf', 'Bodice Front', 40, 40),
      category: 'bodice',
      edges: detected!.map((e, i) => (i === 0 ? { ...e, seamAllowanceWidth: 40 } : e)),
    };
    await dispatch(page, { type: 'project/loadProject', payload: basePayload([withWidth]) });
    await page.waitForTimeout(300);

    const reloaded = await getState<Array<{ name: string; seamAllowanceWidth?: number }>>(
      page,
      'project.pieces.0.edges',
    );
    const target = reloaded!.find((e) => e.name === targetName);
    expect(target?.seamAllowanceWidth).toBe(40);
  });
});

// ─── Replay sobre el patrón REAL (María) ─────────────────────────────────────
//
// Mandato del usuario (2026-06-11): las pruebas con rectángulos sintéticos no
// valen como prueba de realidad — la verificación de integración corre sobre
// el patrón de María (tests/fixtures/garments/maria_patrones_samuel_2M.dxf:
// delantero, espalda, 2 mangas con copas curvas, tira; outlines de 194-276
// comandos). Import por el camino REAL (input file del shell), costadillos
// cosidos como en producción, sim en el tier por defecto.

test.describe('Seam parity replay — patrón real de María', () => {
  test('import DXF real → coser costadillos → sim WASM con constraints reales', async ({ page }) => {
    test.setTimeout(180_000);
    await waitFor2D(page);

    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const fixture = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../fixtures/garments/maria_patrones_samuel_2M.dxf',
    );
    await page.locator('input[accept=".dxf"]').setInputFiles(fixture);

    // 5 piezas reales con edges semánticos auto-detectados.
    await expect
      .poll(async () => ((await getState<unknown[]>(page, 'project.pieces')) ?? []).length, {
        timeout: 30_000,
      })
      .toBe(5);

    const pieces = (await getState<
      Array<{ id: string; outline: unknown[]; category?: string; side?: string; edges?: Array<{ name: string }> }>
    >(page, 'project.pieces'))!;
    // Outlines curvos de verdad — el patrón sintético nunca pasa de ~6 comandos.
    expect(pieces.filter((p) => p.outline.length > 100).length).toBeGreaterThanOrEqual(3);

    // M1 (camisa de María): el import clasifica automáticamente por
    // geometría — los bloques CAD sin nombre útil reciben category/side y
    // los edges salen con anatomía real (armhole/neckline/sideSeam).
    const cats = pieces.map((p) => p.category);
    expect(cats.filter((c) => c === 'bodice')).toHaveLength(2);
    expect(cats.filter((c) => c === 'sleeve')).toHaveLength(2);
    expect(new Set(pieces.filter((p) => p.category === 'bodice').map((p) => p.side)))
      .toEqual(new Set(['front', 'back']));

    // El import DXF NO auto-cose (by design, fixtures README) — cosemos los
    // costadillos delantero↔espalda con los nombres SEMÁNTICOS nuevos.
    const front = pieces.find((p) => p.category === 'bodice' && p.side === 'front')!;
    const back = pieces.find((p) => p.category === 'bodice' && p.side === 'back')!;
    expect(front.edges!.some((e) => e.name.startsWith('armhole'))).toBe(true);
    for (const [i, [aEdge, bEdge]] of [
      ['sideSeam', 'sideSeam'],
      ['sideSeam-2', 'sideSeam-2'],
    ].entries()) {
      await dispatch(page, {
        type: 'project/addSeam',
        payload: makeSeam(`maria-side-${i}`, front.id, aEdge as string, back.id, bEdge as string),
      });
    }
    await enterSewingSurface(page);
    await expect(page.locator('g.seam-connection')).toHaveCount(2);

    // Sim en el tier por defecto: los dos costadillos de 340mm resuelven a
    // ≈24 pares cada uno (SEAM_MAX_EDGE_LENGTH=15) y ninguno a 0. (El viejo
    // ≈146 venía de edges zonales que abarcaban costado+sisa+hombro de más
    // — los sideSeam semánticos de M1 son el costado exacto.)
    await switchView(page, '3D');
    await startSimulation(page);
    await expect
      .poll(async () => getState<string>(page, 'simulation.solverTier'), { timeout: 60_000 })
      .not.toBe('none');
    expect(await getState<string>(page, 'simulation.solverTier')).toBe('wasm');

    const summary = await getState<{
      totalConstraints: number;
      zeroConstraintSeams: unknown[];
    }>(page, 'simulation.seamResolution');
    expect(summary!.totalConstraints).toBeGreaterThan(40);
    expect(summary!.zeroConstraintSeams).toHaveLength(0);
    await expandSimOverlay(page);
    // Copia del overlay (SimulationStatusOverlay): "🧵 N restricciones de
    // costura". Decía "constraints" y el i18n del 14-08 lo tradujo; el spec se
    // quedó con el inglés y llevaba cinco semanas rojo sin que nadie lo viera,
    // porque no está en ningún gate.
    await expect(page.locator('text=/restricciones de costura/')).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Replay M2: el drag de arrange LLEGA al solver ───────────────────────────
//
// Hallazgo A del diagnóstico del blob (sospechado ya por el addendum v3 del
// DoD #506): arrangementOverrides alimentaba TODA la vista arrange
// (DraggablePiece, SeamRenderer3D, Sew3DTool) pero el solver la ignoraba —
// Simulate descartaba en silencio la colocación manual. Este replay pinea
// el cable: piezas de María, una arrastrada lejos, la sim arranca ahí.

test.describe('Seam parity replay — arrange→solver (M2)', () => {
  test('la pieza arrastrada en arrange simula DONDE el usuario la dejó', async ({ page }) => {
    test.setTimeout(180_000);
    await waitFor2D(page);

    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const fixture = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../fixtures/garments/maria_patrones_samuel_2M.dxf',
    );
    await page.locator('input[accept=".dxf"]').setInputFiles(fixture);
    await expect
      .poll(async () => ((await getState<unknown[]>(page, 'project.pieces')) ?? []).length, {
        timeout: 30_000,
      })
      .toBe(5);

    // Drag simulado: la tira (collar) a un punto inconfundible, lejos del
    // rango anatómico (|x| < ~0.6m).
    const pieces = (await getState<Array<{ id: string; category?: string }>>(page, 'project.pieces'))!;
    const strip = pieces.find((p) => p.category === 'collar')!;
    await dispatch(page, {
      type: 'project/setArrangement3D',
      payload: { pieceId: strip.id, position: [1.8, 1.2, 0] },
    });

    await switchView(page, '3D');
    await startSimulation(page);
    await expect
      .poll(async () => getState<string>(page, 'simulation.solverTier'), { timeout: 60_000 })
      .not.toBe('none');

    // El cloth mesh fusionado debe contener vértices cerca de x=1.8 — solo
    // posible si el override llegó a placedMeshes (antes del fix: max |x|
    // anatómico ≈ 0.6m y el assert falla).
    const maxX = await page.evaluate(() => {
      const mesh = (window as unknown as { __VINA_CLOTH_MESH__?: { geometry: { getAttribute: (n: string) => { array: Float32Array } } } }).__VINA_CLOTH_MESH__;
      if (!mesh) return null;
      const arr = mesh.geometry.getAttribute('position').array;
      let mx = -Infinity;
      for (let i = 0; i < arr.length; i += 3) if (arr[i] > mx) mx = arr[i];
      return mx;
    });
    expect(maxX).not.toBeNull();
    expect(maxX!).toBeGreaterThan(1.2);
  });
});

// ─── Replay M3: la camisa de María se cose sola y simula ────────────────────
//
// El viaje completo del demo-killer: import real (clasificación automática
// M1) → ⌘K "Auto-Sew Pieces" (M3: el comando ejecuta de verdad — antes
// abría un panel placeholder muerto) → la camisa cosida simula en WASM con
// la anatomía completa.

test.describe('Seam parity replay — auto-sew end-to-end (M3)', () => {
  test('import → ⌘K Auto-Sew → la camisa completa simula', async ({ page }) => {
    test.setTimeout(180_000);
    await waitFor2D(page);

    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const fixture = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../fixtures/garments/maria_patrones_samuel_2M.dxf',
    );
    await page.locator('input[accept=".dxf"]').setInputFiles(fixture);
    await expect
      .poll(async () => ((await getState<unknown[]>(page, 'project.pieces')) ?? []).length, {
        timeout: 30_000,
      })
      .toBe(5);

    // ⌘K abre el modo commands del UnifiedBar; click en Auto-Sew Pieces.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(400);
    await page.getByText('Coser piezas automáticamente', { exact: false }).first().click();

    // La camisa completa: hombros×2 + costados×2 + sisas↔copas×2 + tira↔escotes.
    await expect
      .poll(async () => ((await getState<unknown[]>(page, 'project.seams')) ?? []).length, {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(6);

    const seams = (await getState<Array<{ createdBy?: string }>>(page, 'project.seams'))!;
    expect(seams.every((s) => s.createdBy === 'ai')).toBe(true);

    await switchView(page, '3D');
    await startSimulation(page);
    await expect
      .poll(async () => getState<string>(page, 'simulation.solverTier'), { timeout: 60_000 })
      .not.toBe('none');
    expect(await getState<string>(page, 'simulation.solverTier')).toBe('wasm');

    const summary = await getState<{
      totalConstraints: number;
      zeroConstraintSeams: unknown[];
    }>(page, 'simulation.seamResolution');
    // ≥8 costuras reales sobre bordes curvos — muy por encima de los 2
    // costadillos del replay anterior (≈48).
    expect(summary!.totalConstraints).toBeGreaterThan(100);
    expect(summary!.zeroConstraintSeams).toHaveLength(0);
  });
});

// ─── Replay M4: la camisa drapea SOBRE el avatar (DoD del plan) ──────────────
//
// El cierre del demo-killer: tras coser (M3) y con la costura
// geométricamente correcta (M4-A/B/C), la camisa debe QUEDARSE PUESTA.
// Métrica anti-colapso (la maraña/blob caía al suelo): <5% de vértices
// bajo la cadera (y=0.8; el hem de una camisa real queda EN la cadera
// ~0.88, así que "bajo cintura" del DoD original contaría la falda
// natural de la prenda), nada cerca del suelo, colisión de avatar
// CARGADA (la extracción tiene timeout con degradación silenciosa que
// ningún otro test pinea — aquí se vuelve fallo explícito) y cero NaN.
// Calibrado en M4-D: belowHip 0.0%, minY 0.88 con fricción de avatar 0.4
// + margin 8mm + substeps 15.

test.describe('Seam parity replay — drape sobre el avatar (M4)', () => {
  test('la camisa cosida se queda puesta: colisión cargada, hem en la cadera, sin colapso', async ({ page }) => {
    test.setTimeout(240_000);
    await waitFor2D(page);

    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const fixture = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../fixtures/garments/maria_patrones_samuel_2M.dxf',
    );
    await page.locator('input[accept=".dxf"]').setInputFiles(fixture);
    await expect
      .poll(async () => ((await getState<unknown[]>(page, 'project.pieces')) ?? []).length, {
        timeout: 30_000,
      })
      .toBe(5);

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(400);
    await page.getByText('Coser piezas automáticamente', { exact: false }).first().click();
    await expect
      .poll(async () => ((await getState<unknown[]>(page, 'project.seams')) ?? []).length, {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(6);

    await switchView(page, '3D');
    await startSimulation(page);
    await expect
      .poll(async () => getState<string>(page, 'simulation.solverTier'), { timeout: 60_000 })
      .toBe('wasm');

    // La colisión del avatar DEBE estar cargada — la extracción degrada en
    // silencio si su timeout vence (useSimulationLifecycle), y sin avatar
    // esta métrica de drape no significa nada.
    await expect
      .poll(async () => getState<boolean>(page, 'simulation.bodyCollision'), { timeout: 30_000 })
      .toBe(true);

    // #895: las CINCO piezas malladas. El bug de producción (lazo abierto
    // de 1 ulp → CDT 0 triángulos → timeout del fallback) descartaba el
    // delantero EN SILENCIO: la sim arrancaba con 4 piezas / ~18.6k
    // partículas y 7 de 8 costuras a cero constraints — y este replay
    // pasaba porque solo asertaba >100 constraints. El total real a 5mm
    // es ~29.3k; el umbral detecta cualquier pieza grande ausente.
    expect(await getState<number>(page, 'simulation.particleCount')).toBeGreaterThan(25_000);
    const resolution = await getState<{ zeroConstraintSeams: unknown[] }>(page, 'simulation.seamResolution');
    expect(resolution!.zeroConstraintSeams).toHaveLength(0);

    // Drape real: ~25s de sim de pared (las costuras cierran y la prenda
    // se asienta — calibrado en local a ~20s con margen CI).
    await page.waitForTimeout(25_000);

    const drape = await page.evaluate(() => {
      const mesh = (window as unknown as { __VINA_CLOTH_MESH__?: {
        geometry: { attributes: { position: { count: number; getY: (i: number) => number } } };
      } }).__VINA_CLOTH_MESH__;
      if (!mesh) return null;
      const pos = mesh.geometry.attributes.position;
      const n = pos.count;
      let belowHip = 0;
      let nan = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        const y = pos.getY(i);
        if (Number.isNaN(y)) { nan++; continue; }
        if (y < 0.8) belowHip++;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return { n, nan, belowHipPct: (belowHip / n) * 100, minY, maxY };
    });

    expect(drape).not.toBeNull();
    expect(drape!.nan).toBe(0);
    // Anti-colapso: la maraña/blob ponía la prenda entera en el suelo.
    expect(drape!.belowHipPct).toBeLessThan(5);
    // El hem queda en la cadera (~0.88) — nada cuelga hacia el suelo.
    expect(drape!.minY).toBeGreaterThan(0.5);
    // Los hombros siguen arriba: la prenda no se escurrió entera.
    expect(drape!.maxY).toBeGreaterThan(1.3);
  });
});
