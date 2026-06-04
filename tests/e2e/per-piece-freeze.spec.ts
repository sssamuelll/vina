import { test, expect } from '@playwright/test';
import {
  waitForApp, addRectanglePiece, switchView, startSimulation,
  waitForClothMesh, getSimulationState, dispatch,
} from './helpers/sim';

/**
 * E2E tests for per-piece freeze feature (PR #305, issue #302) — ENGINE LEVEL.
 *
 * Freeze UI is product backlog: the current shell has no "Freeze Pieces"
 * checkbox list (that lived in the deleted `.simulation-view` sidebar). The
 * UI-coupled tests ('freeze UI controls visible', 'freeze checkbox toggles')
 * were DELETED in the 2026-06-04 retarget. Freeze is driven directly via store
 * dispatch (`simulation/toggleFreezePiece` → `frozenPieceIds`), which is the
 * real write surface those controls would have used.
 *
 * Note: Playwright headless Chromium uses SwiftShader (no WebGPU), so freeze
 * (GPU-only) falls back to WASM/CPU where freeze isn't applied. Tests verify
 * Redux wiring and no-crash behavior.
 */

test.describe('Per-Piece Freeze (engine-level, issue #302)', () => {
  test.setTimeout(120_000);

  test('frozen piece Redux state updates correctly', async ({ page }) => {
    await waitForApp(page);
    const pieceId = await addRectanglePiece(page);

    const state0 = await page.evaluate(() => {
      const s = (window as unknown as { __OPENCLO_STORE__: { getState: () => { simulation: { frozenPieceIds: string[] } } } }).__OPENCLO_STORE__;
      return s.getState().simulation.frozenPieceIds;
    });
    expect(state0).toEqual([]);

    // Freeze the piece.
    await dispatch(page, { type: 'simulation/toggleFreezePiece', payload: pieceId });
    await page.waitForTimeout(100);
    const state1 = await page.evaluate(() => {
      const s = (window as unknown as { __OPENCLO_STORE__: { getState: () => { simulation: { frozenPieceIds: string[] } } } }).__OPENCLO_STORE__;
      return s.getState().simulation.frozenPieceIds;
    });
    expect(state1).toEqual([pieceId]);

    // Unfreeze.
    await dispatch(page, { type: 'simulation/toggleFreezePiece', payload: pieceId });
    await page.waitForTimeout(100);
    const state2 = await page.evaluate(() => {
      const s = (window as unknown as { __OPENCLO_STORE__: { getState: () => { simulation: { frozenPieceIds: string[] } } } }).__OPENCLO_STORE__;
      return s.getState().simulation.frozenPieceIds;
    });
    expect(state2).toEqual([]);
  });

  test('simulation runs with frozen piece — no errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    const pieceId = await addRectanglePiece(page);
    await switchView(page, '3D');

    // Freeze the piece before starting.
    await dispatch(page, { type: 'simulation/toggleFreezePiece', payload: pieceId });
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);
    await page.waitForTimeout(5000);

    expect(['running', 'paused']).toContain(await getSimulationState(page));

    const freezeErrors = errors.filter(e =>
      e.includes('freezePieces') ||
      e.includes('invMass') ||
      e.includes('pieceVertexRanges') ||
      e.includes('Failed to fetch dynamically imported module')
    );
    expect(freezeErrors).toHaveLength(0);
  });

  test('toggle freeze mid-simulation without restart', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    const pieceId = await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);
    await page.waitForTimeout(2000);

    // Freeze mid-simulation.
    await dispatch(page, { type: 'simulation/toggleFreezePiece', payload: pieceId });
    await page.waitForTimeout(2000);
    expect(['running', 'paused']).toContain(await getSimulationState(page));

    // Unfreeze mid-simulation.
    await dispatch(page, { type: 'simulation/toggleFreezePiece', payload: pieceId });
    await page.waitForTimeout(2000);
    expect(['running', 'paused']).toContain(await getSimulationState(page));

    const freezeErrors = errors.filter(e =>
      e.includes('freezePieces') ||
      e.includes('invMass')
    );
    expect(freezeErrors).toHaveLength(0);
  });
});
