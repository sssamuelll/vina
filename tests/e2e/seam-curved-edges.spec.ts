import { test, expect, type Page } from '@playwright/test';

/** Las costuras se pintan solo en el menú de costuras (nota de María #210):
 *  editar el patrón ya no arrastra el sombreado de lo cosido. Estos specs
 *  miden el RENDER de la costura, así que se colocan en su superficie. */
async function enterSewingSurface(page: Page) {
  await page.evaluate(() => {
    const store = (window as unknown as { __VINA_STORE__: { dispatch: (a: unknown) => void } }).__VINA_STORE__;
    store.dispatch({ type: 'editor/setActiveTool', payload: 'seam' });
    store.dispatch({ type: 'tools/setActiveTool2D', payload: 'seam' });
  });
}

test.describe('Seam curved edge highlights', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
    await page.waitForTimeout(1000);
  });

  test('renders seam highlights as SVG paths that preserve Q/C curves and piece offsets', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as unknown as { __VINA_STORE__?: { dispatch: (action: unknown) => void } }).__VINA_STORE__;
      if (!store) throw new Error('Vina store not found on window');

      const curvedPieceA = {
        id: 'piece-q-a',
        name: 'Front Bodice A',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'Q', values: [50, -30, 100, 0] },
          { type: 'L', values: [100, 120] },
          { type: 'L', values: [0, 120] },
          { type: 'Z', values: [] },
        ],
        internals: [],
        edges: [
          { id: 'neck-a', name: 'neckline', segmentRange: [1, 1], edgeType: 'seam', length: 110 },
          { id: 'side-a', name: 'sideSeam', segmentRange: [2, 2], edgeType: 'seam', length: 120 },
        ],
        position: { x: 200, y: 100 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        layer: 1,
        sublayer: 0,
        active: true,
        fabricCode: 'SELF',
        createdAt: 0,
        updatedAt: 0,
      };

      const curvedPieceB = {
        id: 'piece-q-b',
        name: 'Front Bodice B',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'Q', values: [60, -35, 110, 0] },
          { type: 'L', values: [110, 120] },
          { type: 'L', values: [0, 120] },
          { type: 'Z', values: [] },
        ],
        internals: [],
        edges: [
          { id: 'neck-b', name: 'neckline', segmentRange: [1, 1], edgeType: 'seam', length: 120 },
          { id: 'side-b', name: 'sideSeam', segmentRange: [2, 2], edgeType: 'seam', length: 120 },
        ],
        position: { x: 420, y: 130 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        layer: 1,
        sublayer: 0,
        active: true,
        fabricCode: 'SELF',
        createdAt: 0,
        updatedAt: 0,
      };

      store.dispatch({
        type: 'project/loadProject',
        payload: {
          id: 'e2e-seam-curves',
          name: 'E2E Seam Curves',
          createdAt: 0,
          updatedAt: 0,
          pieces: [],
          seams: [],
          fabrics: [],
          groups: [],
          seamGroups: [],
          poms: [],
          pleats: [],
          arrangementOverrides: {},
          avatar: { id: 'a', name: 'Avatar', modelUrl: '', measurements: {} },
          avatarMode: 'model',
          avatarModelUrl: null,
        },
      });

      store.dispatch({ type: 'project/addPiece', payload: curvedPieceA });
      store.dispatch({ type: 'project/addPiece', payload: curvedPieceB });
      store.dispatch({
        type: 'project/addSeam',
        payload: {
          id: 'seam-q-semantic',
          pieceA: { pieceId: 'piece-q-a', edgeName: 'neckline' },
          pieceB: { pieceId: 'piece-q-b', edgeName: 'neckline' },
          type: 'standard',
          tension: 100,
          strength: 1,
          active: true,
          taped: false,
          tapeWidth: 10,
        },
      });
      store.dispatch({
        type: 'project/addSeam',
        payload: {
          id: 'seam-q-edge-fallback',
          // edge-N nombra un índice de COMANDO del contorno desde la
          // unificación renderer↔solver (1ce78b20, 07-08), y el 0 es la `M`,
          // que no aporta tramo: `edgeNToCommandIndex` devuelve null y la
          // polilínea sale vacía. El borde curvo que este caso quiere
          // ejercer —el mismo que la costura semántica resuelve por
          // 'neckline'— es el comando 1, la `Q`. Con edge-0 esta costura caía
          // al trazo del punto medio y pintaba UNA línea en vez de dos.
          pieceA: { pieceId: 'piece-q-a', edgeName: 'edge-1' },
          pieceB: { pieceId: 'piece-q-b', edgeName: 'edge-1' },
          type: 'standard',
          tension: 100,
          strength: 1,
          active: true,
          taped: false,
          tapeWidth: 10,
        },
      });
    });

    await enterSewingSurface(page);
    await page.waitForTimeout(500);

    const seamGroups = page.locator('g.seam-connection');
    await expect(seamGroups).toHaveCount(2);

    const highlightPaths = page.locator('g.seam-connection path[fill="none"]:not(.seam-direction-tick)');
    await expect(highlightPaths).toHaveCount(4);

    const pathDs = await highlightPaths.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('d') || '')
    );

    // Quadratic curves are preserved in seam highlight paths
    expect(pathDs.some((d) => d.includes('Q250,70,300,100'))).toBe(true);
    expect(pathDs.some((d) => d.includes('Q480,95,530,130'))).toBe(true);

    // The semantic seam and edge-N fallback both resolve the same curved edge on piece A
    const pieceAQuadratics = pathDs.filter((d) => d === 'M200,100 Q250,70,300,100');
    expect(pieceAQuadratics).toHaveLength(2);

    // No fallback straight <line> edge highlights should be needed for these
    // valid curve cases. The dotted connection line lives inside the
    // .seam-detail group (hover/selection-gated since Iris cut 3) — direct
    // <line> children of the seam group would mean a fallback edge highlight.
    const fallbackLines = page.locator('g.seam-connection > line');
    await expect(fallbackLines).toHaveCount(0);
    const seamLines = page.locator('g.seam-connection .seam-detail > line');
    // Fase 5 (direction): two connection lines per seam — start→start and
    // end→end. Aligned halves render parallel lines; a reversed half makes
    // them cross (the X). 2 seams × 2 = 4.
    await expect(seamLines).toHaveCount(4);
  });

  test('renders cubic seam highlights as SVG path C commands', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as unknown as { __VINA_STORE__?: { dispatch: (action: unknown) => void } }).__VINA_STORE__;
      if (!store) throw new Error('Vina store not found on window');

      const cubicPiece = {
        id: 'piece-c',
        name: 'Princess Panel',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'C', values: [35, -40, 85, -40, 120, 0] },
          { type: 'L', values: [120, 140] },
          { type: 'L', values: [0, 140] },
          { type: 'Z', values: [] },
        ],
        internals: [],
        edges: [
          { id: 'princess', name: 'princessSeam', segmentRange: [1, 1], edgeType: 'seam', length: 130 },
        ],
        position: { x: 660, y: 150 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        layer: 1,
        sublayer: 0,
        active: true,
        fabricCode: 'SELF',
        createdAt: 0,
        updatedAt: 0,
      };

      const cubicPieceB = {
        id: 'piece-c-b',
        name: 'Princess Panel Mate',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'C', values: [25, -20, 95, -20, 120, 0] },
          { type: 'L', values: [120, 140] },
          { type: 'L', values: [0, 140] },
          { type: 'Z', values: [] },
        ],
        internals: [],
        edges: [
          { id: 'princess-b', name: 'princessSeam', segmentRange: [1, 1], edgeType: 'seam', length: 125 },
        ],
        position: { x: 900, y: 150 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        layer: 1,
        sublayer: 0,
        active: true,
        fabricCode: 'SELF',
        createdAt: 0,
        updatedAt: 0,
      };

      store.dispatch({
        type: 'project/loadProject',
        payload: {
          id: 'e2e-seam-cubic',
          name: 'E2E Seam Cubic',
          createdAt: 0,
          updatedAt: 0,
          pieces: [cubicPiece, cubicPieceB],
          seams: [
            {
              id: 'seam-c-semantic',
              pieceA: { pieceId: 'piece-c', edgeName: 'princessSeam' },
              pieceB: { pieceId: 'piece-c-b', edgeName: 'princessSeam' },
              type: 'standard',
              tension: 100,
              strength: 1,
              active: true,
              taped: false,
              tapeWidth: 10,
            },
          ],
          fabrics: [],
          groups: [],
          seamGroups: [],
          poms: [],
          pleats: [],
          arrangementOverrides: {},
          avatar: { id: 'a', name: 'Avatar', modelUrl: '', measurements: {} },
          avatarMode: 'model',
          avatarModelUrl: null,
        },
      });
    });

    await enterSewingSurface(page);
    await page.waitForTimeout(500);

    const highlightPaths = page.locator('g.seam-connection path[fill="none"]:not(.seam-direction-tick)');
    await expect(highlightPaths).toHaveCount(2);

    const pathDs = await highlightPaths.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('d') || '')
    );

    expect(pathDs.some((d) => d.includes('C695,110,745,110,780,150'))).toBe(true);
    expect(pathDs.some((d) => d.includes('C925,130,995,130,1020,150'))).toBe(true);
  });

  test('renders linear seam highlights as path L commands after the renderer switch', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as unknown as { __VINA_STORE__?: { dispatch: (action: unknown) => void } }).__VINA_STORE__;
      if (!store) throw new Error('Vina store not found on window');

      const left = {
        id: 'piece-line-a',
        name: 'Left Panel',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [100, 0] },
          { type: 'L', values: [100, 120] },
          { type: 'L', values: [0, 120] },
          { type: 'Z', values: [] },
        ],
        internals: [],
        edges: [{ id: 'side-a', name: 'sideSeam', segmentRange: [2, 2], edgeType: 'seam', length: 120 }],
        position: { x: 150, y: 220 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        layer: 1,
        sublayer: 0,
        active: true,
        fabricCode: 'SELF',
        createdAt: 0,
        updatedAt: 0,
      };

      const right = {
        id: 'piece-line-b',
        name: 'Right Panel',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [100, 0] },
          { type: 'L', values: [100, 120] },
          { type: 'L', values: [0, 120] },
          { type: 'Z', values: [] },
        ],
        internals: [],
        edges: [{ id: 'side-b', name: 'sideSeam', segmentRange: [2, 2], edgeType: 'seam', length: 120 }],
        position: { x: 340, y: 220 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        layer: 1,
        sublayer: 0,
        active: true,
        fabricCode: 'SELF',
        createdAt: 0,
        updatedAt: 0,
      };

      store.dispatch({
        type: 'project/loadProject',
        payload: {
          id: 'e2e-seam-lines',
          name: 'E2E Seam Lines',
          createdAt: 0,
          updatedAt: 0,
          pieces: [left, right],
          seams: [
            {
              id: 'seam-line',
              pieceA: { pieceId: 'piece-line-a', edgeName: 'sideSeam' },
              pieceB: { pieceId: 'piece-line-b', edgeName: 'sideSeam' },
              type: 'standard',
              tension: 100,
              strength: 1,
              active: true,
              taped: false,
              tapeWidth: 10,
            },
          ],
          fabrics: [],
          groups: [],
          seamGroups: [],
          poms: [],
          pleats: [],
          arrangementOverrides: {},
          avatar: { id: 'a', name: 'Avatar', modelUrl: '', measurements: {} },
          avatarMode: 'model',
          avatarModelUrl: null,
        },
      });
    });

    await enterSewingSurface(page);
    await page.waitForTimeout(500);

    const highlightPaths = page.locator('g.seam-connection path[fill="none"]:not(.seam-direction-tick)');
    await expect(highlightPaths).toHaveCount(2);

    const pathDs = await highlightPaths.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('d') || '')
    );

    expect(pathDs).toContain('M250,220 L250,340');
    expect(pathDs).toContain('M440,220 L440,340');
  });
});
