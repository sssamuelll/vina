/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, Page } from '@playwright/test';

/**
 * Fit Map UI — E2E Tests
 *
 * Verifies the «Mapa» menu (MenuDeMapas, the top bar) and the legend
 * (LeyendaDeMapas, over the viewer) render correctly, the four maps work,
 * keyboard shortcuts toggle modes, the settings sheet opens, and the UI
 * survives simulation lifecycle events.
 *
 * Prerequisites:
 * - Desde P5 (spec 2026-10-02 § 4.2) los cuatro mapas ya no son una barra
 *   oscura sobre el visor: son un menú de papel, «Mapa ▾», que cuelga de la
 *   barra superior. El disparador siempre se abre; en idle sus cuatro
 *   elementos salen deshabilitados con la pista "simula para ver..." (#1010
 *   punto 4). Los selectores por título con atajo (`Mapa de tensión (Alt+6)`)
 *   solo casan con el menú ABIERTO y con la simulación VIVA.
 * - A pattern piece must be drawn and simulation started before
 *   any fit-map UI becomes visible
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function dispatch(page: Page, action: { type: string; payload?: unknown }) {
  await page.evaluate((act) => {
    const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as
      | { dispatch: (a: unknown) => void }
      | undefined;
    store?.dispatch(act);
  }, action);
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

/** Seed one rectangle piece via the store (deterministic, no canvas drawing). */
async function addPiece(page: Page) {
  await dispatch(page, {
    type: 'project/addPiece',
    payload: {
      id: 'fitmap-piece-1',
      name: 'Panel',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [200, 0] },
        { type: 'L', values: [200, 300] },
        { type: 'L', values: [0, 300] },
        // `Z`, como emite `useRectangleTool`: el cuarto lado no tiene
        // comando propio. El `L` de vuelta al origen hacía que el cierre no
        // existiera como tal — por ahí pasó #1092 en verde (#1120).
        { type: 'Z', values: [] },
      ],
      internals: [],
      position: { x: 60, y: 40 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      layer: 1,
      sublayer: 0,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  await page.waitForTimeout(300);
  const pieces = await getState<unknown[]>(page, 'project.pieces');
  expect(pieces.length).toBeGreaterThanOrEqual(1);
}

/** El menú «Mapa» de la barra superior: lo abre si está cerrado. */
async function abrirMenuDeMapas(page: Page) {
  if ((await page.locator('.menu-de-mapas__hoja').count()) === 0) {
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  }
  await expect(page.locator('.menu-de-mapas__hoja')).toBeVisible({ timeout: 5000 });
}

/** Elige (o, si ya está puesto, apaga) un mapa por su título. El menú se cierra al elegir. */
async function elegirMapa(page: Page, titulo: string) {
  await abrirMenuDeMapas(page);
  await page.locator(`button[title="${titulo}"]`).click();
  await expect(page.locator('.menu-de-mapas__hoja')).toHaveCount(0, { timeout: 3000 });
}

async function startSimulation(page: Page) {
  // Switch to the 3D view so Viewport3D (which hosts the simulation) is mounted.
  // Por condición, no por timeout: si se despacha startSimulation contra un
  // árbol 3D sin montar, el store queda en 'running' pero el useFrame de la
  // simulación no corre nunca y los datos no llegan jamás (#1010).
  await page.click('button:has-text("3D")');
  await page.waitForSelector('canvas', { state: 'visible', timeout: 60_000 });

  // Drive the simulation lifecycle through the store: arrange snapshot is not
  // required for the fit-map UI, only simulationState !== 'idle'.
  await dispatch(page, { type: 'simulation/setViewMode3D', payload: 'simulate' });
  await dispatch(page, { type: 'simulation/startSimulation' });

  // Poll the canonical truth: the maps come alive once state leaves 'idle'.
  await expect.poll(
    async () => getState<string>(page, 'simulation.simulationState'),
    { timeout: 30_000 },
  ).toBe('running');

  // The «Mapa» menu now offers the four maps, enabled.
  await abrirMenuDeMapas(page);
  await expect(page.locator('button[title="Mapa de tensión (Alt+6)"]')).toBeEnabled({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-de-mapas__hoja')).toHaveCount(0, { timeout: 3000 });
}

/**
 * Full setup: load app, seed a piece, start simulation.
 * After this, the «Mapa» menu offers the four maps in the top bar.
 */
async function setupSimulation(page: Page) {
  await waitForApp(page);
  await addPiece(page);
  await startSimulation(page);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Fit Map UI', () => {
  test.beforeEach(async ({ page }) => {
    // Generous timeout for CI — simulation involves Wasm/Worker init.
    test.setTimeout(180_000);
    // Tier determinista: sin esto la cascada puede caer hasta neural-drape,
    // que no expone edge data y por diseño no produce fit maps (A7).
    await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'false'));
    await setupSimulation(page);
  });

  // ── Test 1: the «Mapa» menu renders and toggles stress map ─────────────

  test('«Mapa» menu renders and toggles stress map', async ({ page }) => {
    // The menu should offer the maps once simulation is running
    await abrirMenuDeMapas(page);
    await expect(page.locator('button[title="Mapa de tensión (Alt+6)"]')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');

    // Click to activate stress map (el menú se cierra al elegir)
    await elegirMapa(page, 'Mapa de tensión (Alt+6)');
    await page.waitForTimeout(500);

    // Legend should show "kPa" label(s) in the vertical scale bar.
    // (Stress mode renders several kPa labels: range ends + live max/avg.)
    await expect(page.locator('text=/kPa/').first()).toBeVisible({ timeout: 3000 });

    // Toggle off by choosing it again
    await elegirMapa(page, 'Mapa de tensión (Alt+6)');
    await page.waitForTimeout(500);

    // Legend should disappear — kPa text should no longer be visible
    // Use a defensive approach: check that the scale text is gone
    const kpaTexts = page.locator('text=/kPa/');
    await expect(kpaTexts).toHaveCount(0, { timeout: 3000 }).catch(async () => {
      // If there are still kPa elements, they should at least not be visible
      const count = await kpaTexts.count();
      for (let i = 0; i < count; i++) {
        await expect(kpaTexts.nth(i)).not.toBeVisible();
      }
    });
  });

  // ── Test 2: All 4 map modes activate without crash ─────────────────────

  test('all 4 map modes activate without crash', async ({ page }) => {
    const modes: { title: string; mode: string }[] = [
      { title: 'Mapa de tensión (Alt+6)', mode: 'stress' },
      { title: 'Mapa de estiramiento (Alt+7)', mode: 'strain' },
      { title: 'Mapa de ajuste (Alt+8)', mode: 'fit' },
      { title: 'Puntos de presión (Alt+9)', mode: 'pressure' },
    ];

    for (const { title, mode } of modes) {
      await elegirMapa(page, title);
      await page.waitForTimeout(500);
      expect(await getState<string>(page, 'simulation.fitMapMode')).toBe(mode);

      // Canvas should still be visible (no crash / blank screen)
      await expect(page.locator('canvas')).toBeVisible();
    }

    // Deactivate by choosing the last mode again (pressure)
    await elegirMapa(page, 'Puntos de presión (Alt+9)');
    await page.waitForTimeout(300);

    // Verify canvas is still alive and the simulation is still running
    // (assert the canonical store truth: the state now lives in the foot line).
    await expect(page.locator('canvas')).toBeVisible();
    expect(await getState<string>(page, 'simulation.simulationState')).toBe('running');
    expect(await getState<string>(page, 'simulation.fitMapMode')).toBe('none');
    // The «Mapa» menu is still there and still offers the maps (live while non-idle).
    await abrirMenuDeMapas(page);
    await expect(page.locator('button[title="Mapa de tensión (Alt+6)"]')).toBeVisible();
  });

  // ── Test 3: Legend shows live stats (not NaN) ──────────────────────────

  test('legend shows live stats via window global', async ({ page }) => {
    // Activate strain map so stats are generated
    await elegirMapa(page, 'Mapa de estiramiento (Alt+7)');

    // #1009: contrato, no soft-skip. Las stats llegan con la cadencia del
    // readback del solver (~4 Hz) después de la init — se espera POR CONDICIÓN.
    // El `waitForTimeout(3000)` ciego que había aquí vencía antes de la primera
    // publicación y el test se saltaba en silencio justo lo que venía a probar.
    // Skip EXPLÍCITO y anotado (no verde silencioso): el tier neural no tiene
    // ruta de edge data — sin ella no hay fit map que medir. Es un hueco de
    // capacidad conocido, no una degradación del entorno de test.
    const tier = await getState<string>(page, 'simulation.solverTier');
    test.skip(tier === 'neural-drape', `tier ${tier}: sin edge data, no soporta fit maps (A7)`);

    await expect.poll(
      () => page.evaluate(() => {
        const w = window as any;
        if (w.__VINA_FIT_MAP_STATS__) return 'PUBLICADAS';
        const d = w.__VINA_FITMAP_DIAG__;
        if (!d) return 'SIN SIMULACIÓN (useFrame no corrió)';
        const tier = w.__VINA_STORE__?.getState().simulation.solverTier;
        return `PENDIENTE tier=${tier} path=${d.path} frames=${d.frames} mode=${d.fitMapMode} edgeData=${d.edgeDataPresent} blockRan=${d.fitMapBlockRan}`;
      }),
      { timeout: 60_000, message: 'la simulación nunca publicó __VINA_FIT_MAP_STATS__' },
    ).toBe('PUBLICADAS');

    const stats = await page.evaluate(() => {
      const w = window as any;
      const s = w.__VINA_FIT_MAP_STATS__;
      return {
        min: s.min as number, max: s.max as number, mean: s.mean as number,
        tier: w.__VINA_STORE__?.getState().simulation.solverTier as string,
        path: w.__VINA_FITMAP_DIAG__?.path as string,
      };
    });
    console.log('Fit map stats:', stats);

    expect(Number.isFinite(stats.min), `min no finito: ${stats.min}`).toBe(true);
    expect(Number.isFinite(stats.max), `max no finito: ${stats.max}`).toBe(true);
    expect(Number.isFinite(stats.mean), `mean no finito: ${stats.mean}`).toBe(true);
    // Red de regresión del bug de edges degenerados (#1010): un restLen ~1e-7
    // daba strains de 10^6 %. Se asserta la MEDIA, no el máximo: el máximo lo
    // domina la cola de edges sub-milimétricos de la malla (990 % sobre el DXF
    // de María) y sería un umbral al borde; la media es estable (100-130 %) y
    // se dispara igual si vuelven a colarse edges degenerados.
    expect(stats.mean, `strain medio absurdo: ${stats.mean}`).toBeLessThan(500);

    await expect(page.locator('canvas')).toBeVisible();
  });

  // ── Test 4: the settings sheet opens and has inputs ────────────────────

  test('settings sheet opens and has inputs', async ({ page }) => {
    // First activate stress map so there is context for the config
    await elegirMapa(page, 'Mapa de tensión (Alt+6)');
    await page.waitForTimeout(300);

    // Open the menu and choose «Ajustes del mapa…»: the same paper sheet swaps to the ranges
    await abrirMenuDeMapas(page);
    const configBtn = page.getByRole('button', { name: 'Ajustes del mapa…' });
    await expect(configBtn).toBeVisible({ timeout: 3000 });
    await configBtn.click();
    await page.waitForTimeout(300);

    // The settings sheet should appear with the heading
    await expect(page.locator('.menu-de-mapas__titulo')).toHaveText('Ajustes del mapa', { timeout: 3000 });

    // Should show "Stress Range" label
    await expect(page.locator('text=/Rango de tensión/')).toBeVisible();

    // Should show "Strain Range" label
    await expect(page.locator('text=/Rango de estiramiento/')).toBeVisible();

    // Should have numeric inputs — check by aria-label
    await expect(page.locator('input[aria-label="Tensión mín"]')).toBeVisible();
    await expect(page.locator('input[aria-label="Tensión máx"]')).toBeVisible();
    await expect(page.locator('input[aria-label="Estiramiento mín"]')).toBeVisible();
    await expect(page.locator('input[aria-label="Estiramiento máx"]')).toBeVisible();

    // Should have "Reset to Defaults" button
    await expect(page.locator('button:has-text("Restablecer valores")')).toBeVisible();

    // Close the sheet with Esc (a rung of the escalera de lo que se llama)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // The sheet is gone: no heading, no inputs (the scale legend may still show kPa)
    await expect(page.locator('.menu-de-mapas__hoja')).toHaveCount(0, { timeout: 2000 });
    await expect(page.locator('input[aria-label="Tensión mín"]')).toHaveCount(0);
  });

  // ── Test 5: Keyboard shortcut Alt+6 toggles stress map ────────────────

  test('keyboard shortcut Alt+6 toggles stress map', async ({ page }) => {
    // #1009: antes, si el atajo no disparaba esto avisaba por console.warn y
    // probaba el BOTÓN — que ya cubren los tests 1 y 2. O sea: el atajo nunca
    // se probaba y el test pasaba igual. Ahora se assertea siempre.
    //
    // El atajo vive en contexto '3d' (shortcuts/defaults.ts:105) y el listener
    // global ignora eventos cuyo target sea un input: si la caja de chat tiene
    // el foco, la tecla se descarta. Blur → activeElement es <body> → el
    // contexto pasa a ['global','2d','3d'] y el atajo entra. Mismo patrón de
    // re-press en poll que sewing-tools.spec.ts.
    const pressUntilMode = async (key: string, expected: string) => {
      await expect.poll(
        async () => {
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
          await page.keyboard.press(key);
          await page.waitForTimeout(150);
          return getState<string>(page, 'simulation.fitMapMode');
        },
        { timeout: 15_000, intervals: [250], message: `${key} nunca llegó al registro de atajos` },
      ).toBe(expected);
    };

    await pressUntilMode('Alt+6', 'stress');
    // La escala de tensión se rotula en kPa: prueba que el modo llegó al render.
    await expect(page.locator('text=/kPa/').first()).toBeVisible({ timeout: 5000 });

    // Alt+0 apaga todos los mapas (idempotente, no togglea).
    await pressUntilMode('Alt+0', 'none');
    await expect(page.locator('text=/kPa/')).toHaveCount(0, { timeout: 5000 });
  });

  // ── Test 6: Fit map survives simulation reset ──────────────────────────

  test('fit map survives simulation reset and restart', async ({ page }) => {
    // Activate fit map mode
    await elegirMapa(page, 'Mapa de ajuste (Alt+8)');
    await page.waitForTimeout(500);

    expect(await getState<string>(page, 'simulation.fitMapMode')).toBe('fit');

    // Reset the simulation through the store (no StatusBar / sidebar in the
    // current shell). This returns simulationState to 'idle'.
    await dispatch(page, { type: 'simulation/resetSimulation' });
    await page.waitForTimeout(800);

    // After reset, the app should still be alive (no crash). The «Mapa» menu
    // stays openable but with the four maps disabled while idle (#1010), and
    // the canvas persists.
    await expect(page.locator('canvas')).toBeVisible();
    expect(await getState<string>(page, 'simulation.simulationState')).toBe('idle');

    // Restart simulation through the store.
    await dispatch(page, { type: 'simulation/setViewMode3D', payload: 'simulate' });
    await dispatch(page, { type: 'simulation/startSimulation' });
    await expect.poll(
      async () => getState<string>(page, 'simulation.simulationState'),
      { timeout: 10000 },
    ).toBe('running');
    await page.waitForTimeout(1000);

    // "Sobrevive" de verdad: el modo elegido sigue puesto tras el ciclo, y el
    // menú vuelve a estar vivo. Antes esto solo miraba que el canvas existiera.
    expect(await getState<string>(page, 'simulation.fitMapMode')).toBe('fit');
    await abrirMenuDeMapas(page);
    await expect(page.locator('button[title="Mapa de ajuste (Alt+8)"]')).toBeEnabled({ timeout: 5000 });
    await expect(page.locator('canvas')).toBeVisible();
  });
});
