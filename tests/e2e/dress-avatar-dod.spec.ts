/**
 * E2E: Dress Avatar — Definition of Done for epic #506 (Sewing Pipeline)
 *
 * This test is INTENTIONALLY RED today. It encodes the binary success criterion
 * for closing the sewing pipeline epic and is expected to fail until the
 * downstream bugs (#527 piece-local coords, #518 generic auto-seams,
 * #556 placement→circle on unknown category, #531 dress falls as panels)
 * are resolved.
 *
 * Once #506 is closed, this test should flip to green and stay green. At
 * that point a follow-up commit will:
 *   1. Add a baseline screenshot assertion (Playwright's toHaveScreenshot
 *      with the existing 1% maxDiffPixelRatio).
 *   2. Flip the CI job's `continue-on-error: false` in .github/workflows/ci.yml.
 *   3. Add `e2e` to `ci-success.needs` to promote it to a required gate.
 *
 * ## DoD encoded here
 *
 * Open the app → load a pattern from the Template Library → click "Dress" →
 * within ≤10 s the cloth simulation produces a draped garment such that:
 *   (a) the pattern has ≥3 pieces (smaller templates can't form a real
 *       garment and trivialize the connectivity check below)
 *   (b) the seam graph forms a single connected component — every piece
 *       participates in a seam chain that reaches every other piece
 *       (catches orphan sleeves / split halves / unsewn panels honestly)
 *   (c) the cloth geometry is worn on the body — bounded `nearFloorPct`,
 *       bounded `offBodyPct`, and `maxY` reaches near the shoulder for
 *       upper garments / waist for lower garments
 *
 * Note: previous revisions of this test used `assemblyRatio = seams/pieces`
 * with a threshold of 1.5. That heuristic gave false greens on minimal
 * templates (Blouse: 2 pieces + 3 seams between them = ratio 1.5 → passed,
 * but visually a doubled panel). Graph connectivity is the v8 recommendation
 * (`docs/plans/2026-05-19-step3-garment-placement-fix.md` § Hallazgo 2 +
 * "Threshold del DoD") that scales honestly across pattern sizes.
 *
 * ## Why these assertions and not a screenshot diff (yet)
 *
 * Screenshot diffs require a known-good baseline. We don't have one until
 * #506 closes. Until then, functional assertions on Redux state and on
 * `window.__OPENCLO_CLOTH_MESH__` vertex positions are the only way to
 * encode "it actually worked" without a baseline. They're also more
 * robust to cosmetic UI changes that don't affect correctness.
 *
 * ## Observables relied on
 *
 *   window.__OPENCLO_STORE__            — Redux store, exposed unconditionally
 *                                          in src/store/index.ts:87. Used by
 *                                          Viewport3D and bundle-split.spec.ts.
 *   window.__OPENCLO_CLOTH_MESH__       — Three.js cloth mesh, exposed by
 *                                          GarmentSimulation.tsx:525.
 *
 * If either is missing the test fails with a clear message (not silently
 * passing on a misconfigured app). Note: do NOT use __REDUX_STORE__ — that
 * name only appears in stale references in cloth-simulation.spec.ts and is
 * not actually exposed by the app.
 */
import { test, expect, type Page } from '@playwright/test';

const SIMULATION_BUDGET_MS = 10_000;

declare global {
  interface Window {
    __OPENCLO_STORE__?: {
      getState(): {
        project?: {
          pieces?: unknown[];
          seams?: unknown[];
          avatar?: { measurements?: { height?: number } };
        };
        simulation?: {
          simulationState?: 'idle' | 'running' | 'paused';
        };
      };
    };
    __OPENCLO_CLOTH_MESH__?: {
      geometry?: {
        getAttribute(name: string): { array: ArrayLike<number>; itemSize?: number } | null;
      };
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Open the Template Library overlay via the command palette.
 *
 * Earlier attempts at fuzzy DOM scanning (looking for any button matching
 * /templates|library|patterns/i) failed because they matched `.template-card`
 * elements rendered elsewhere in the page, which were intercepted by the 3D
 * canvas's pointer overlay. The command palette is more robust: it's a
 * single deterministic flow with stable command names.
 *
 * Flow:
 *  1. Press ⌘K / Ctrl+K — UnifiedBar.tsx:121 listens for this globally and
 *     sets mode='commands', opens the panel, focuses the input (50ms timeout).
 *  2. Type "Load Template" — fuzzy-matched against command.name in
 *     UnifiedBarCommands.tsx:28 (`{ id: 'load-template', name: 'Load Template' }`).
 *  3. Click the resulting button — its action calls onOpenTemplates() →
 *     setShowTemplates(true) in AppShell, which renders the overlay.
 */
async function openTemplateLibrary(page: Page) {
  // The beforeEach already waited for FloatingControls3D to mount, which
  // implies UnifiedBar (sibling in the shell) also mounted, so the ⌘K
  // listener should be registered. Even so, give the palette opening real
  // breathing room: cold-start can have GPU/WASM init contending with the
  // main thread for several hundred ms.
  await page.keyboard.press('ControlOrMeta+k');
  // 300ms covers: React commit for setMode/setPanelOpen (~10-30ms) + the
  // input focus setTimeout (50ms) + headroom for cold-start scheduling jitter.
  await page.waitForTimeout(300);

  await page.keyboard.type('Load Template', { delay: 20 });

  // The palette renders each command as a <button> whose visible text is the
  // command name. "Load Template" is distinct from any template-card label
  // (cards show pattern names like "Male Shirt"), so this won't collide.
  // Long timeout (8s) covers cold-start variance; on a warm run this resolves
  // in <100ms.
  const cmdBtn = page.locator('button', { hasText: 'Load Template' }).first();
  await expect(
    cmdBtn,
    'command palette did not open or "Load Template" command not found. ' +
      'Check that UnifiedBar.tsx:121 still binds ⌘K and that ' +
      'UnifiedBarCommands.tsx still has a command with name "Load Template". ' +
      'If you see this only on the first run of a fresh dev server, the cold-' +
      'start hydration race may have widened — consider bumping the timeout.',
  ).toBeVisible({ timeout: 8_000 });
  await cmdBtn.click();

  await expect(page.locator('.template-overlay.open')).toBeVisible({ timeout: 5_000 });
}

/**
 * Click the template card whose visible name exactly matches `name` (the
 * English `.template-name` shown on the card, e.g. "Male Shirt", "Trousers").
 * Names come from the catalog (src/utils/seamly2d/catalog.ts).
 */
async function pickTemplate(page: Page, name: string) {
  const overlay = page.locator('.template-overlay.open');
  // Escape regex metacharacters — catalog names contain "(", ")" etc.
  // (e.g. "Jacket (Size 52)") which would otherwise be parsed as regex groups.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const card = overlay.locator('.template-card', {
    has: page.locator('.template-name', { hasText: new RegExp(`^${escaped}$`, 'i') }),
  });
  await expect(
    card.first(),
    `template card "${name}" not found in the library. Check the catalog name still matches.`,
  ).toBeVisible({ timeout: 5_000 });
  await card.first().click();
}

async function clickDressButton(page: Page) {
  // FloatingControls3D renders the pill as a `<button>` with text "Dress"
  // inside the top-right floating control group.
  const dress = page.locator('.floating-3d__pill', { hasText: /^\s*dress\s*$/i });
  await expect(dress.first()).toBeVisible({ timeout: 5_000 });
  await dress.first().click();
}

/**
 * Wait for the cloth mesh observable to appear, with a long enough budget
 * to cover real meshing + first render. If it never appears, that itself is
 * a DoD failure — likely meshing pipeline broke before producing a mesh
 * (CDT failure, no buildable pieces, etc.) — and we want the error to say
 * so explicitly instead of "mesh not exposed" which is ambiguous.
 */
async function waitForClothMeshOrFail(page: Page, budgetMs: number) {
  const appeared = await page
    .waitForFunction(
      () => Boolean(window.__OPENCLO_CLOTH_MESH__?.geometry),
      { timeout: budgetMs, polling: 250 },
    )
    .then(() => true)
    .catch(() => false);

  if (!appeared) {
    // Pull diagnostic state so the failure message is actionable.
    const diag = await page.evaluate(() => {
      const s = window.__OPENCLO_STORE__?.getState();
      return {
        simulationState: s?.simulation?.simulationState ?? 'unknown',
        pieces: s?.project?.pieces?.length ?? 0,
        seams: s?.project?.seams?.length ?? 0,
      };
    });
    throw new Error(
      `cloth mesh observable (window.__OPENCLO_CLOTH_MESH__) never appeared ` +
        `within ${budgetMs}ms after Dress was clicked. State at timeout: ` +
        `simulationState=${diag.simulationState}, pieces=${diag.pieces}, ` +
        `seams=${diag.seams}. Likely root cause: the meshing pipeline failed ` +
        `silently — pieces didn't produce valid CDT meshes, so ` +
        `GarmentSimulation.tsx:525 never set the observable. This is itself ` +
        `a #506 DoD failure (no garment to drape), and the most upstream of ` +
        `the failure modes the bug cluster #527/#518/#556 can produce.`,
    );
  }
}

// ─── Test ────────────────────────────────────────────────────────────────────

test.describe('#506 DoD — Dress Avatar produces a draped garment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Two-stage hydration wait. The store is set at module load time (early);
    // the UnifiedBar keydown listener (⌘K → command palette) is only
    // registered after React commits FloatingControls3D. The original v1.2
    // race went: ⌘K pressed before listener registered → no palette → test
    // fails on its first run but passes on retry. Waiting for both observables
    // makes the test order-independent.

    await page
      .waitForFunction(() => Boolean(window.__OPENCLO_STORE__), { timeout: 10_000 })
      .catch(() => {
        throw new Error(
          'window.__OPENCLO_STORE__ never appeared within 10s. Check that ' +
            'src/store/index.ts still exposes the store, and that the dev ' +
            'server is actually serving the app (not a 404/empty page).',
        );
      });

    // The "Dress" floating pill is part of FloatingControls3D in the shell.
    // If it's visible, the shell mounted, which means UnifiedBar mounted,
    // which means the ⌘K listener is registered.
    await expect(
      page.locator('.floating-3d__pill').first(),
      'shell did not finish hydrating within 10s (no .floating-3d__pill visible). ' +
        'The ⌘K listener is registered in a UnifiedBar useEffect that runs after ' +
        'first React commit, so pressing ⌘K before this point is racy.',
    ).toBeVisible({ timeout: 10_000 });
  });

  // Representative patterns from the catalog (src/utils/seamly2d/catalog.ts).
  // `region: 'upper'` = worn on the torso (the dress form supports draping
  // shoulder→hip). `region: 'lower'` = hangs from the waist down.
  //
  // NOTE on the avatar: Mannequin.tsx is a legless tailor's dress form whose
  // profile bottoms out at height*0.42 (~0.76m for a 1.8m avatar). Tops and
  // skirts have a torso/waist to drape on; full trousers have no legs to
  // wrap, so they're expected to behave poorly for reasons unrelated to the
  // pattern — we deliberately don't include trousers here so a legless-avatar
  // artifact isn't mistaken for a #531 pattern bug.
  // Lower-region coverage is currently gapped on purpose: Keiko Skirt (the
  // previous lower case) is the only skirt in the catalog and is < 3 pieces,
  // so it failed the MIN_PIECES gate honestly rather than because of an
  // autoSew bug. Trousers are excluded per the header comment (legless avatar
  // / #531). Add a lower case back when the catalog grows a multi-piece skirt
  // or a full dress.
  //
  // Blouse Pattern was also dropped from the upper set for the same MIN_PIECES
  // reason (2 pieces — see comment block ~line 419 for why that was always a
  // false green under the old assemblyRatio gate). Pajama Top (Wrap) replaces
  // it as the multi-piece women's top exercising the same flow.
  const CASES = [
    { template: 'Male Shirt', region: 'upper' as const },
    { template: 'T-Shirt', region: 'upper' as const },
    { template: 'Pajama Top (Wrap)', region: 'upper' as const },
    { template: 'Jacket (Size 52)', region: 'upper' as const },
  ];

  for (const c of CASES) {
    const slug = c.template.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    test(`Dress Avatar drapes "${c.template}" on the body (not fallen)`, async ({ page }) => {
      // Load + dress + 10s sim budget + measure. Linux CI runners are
      // measurably slower than local dev — CDT meshing 17 pieces (Male Shirt)
      // alone has needed 60-180s historically (see commits 5e091904 and
      // 11ba2ce6 bumping the seamly meshing timeout). At 60s the full DoD
      // flow timed out reliably on Male Shirt and was right at the edge for
      // Pajama Top (9 pieces) — one jitter spike away from a flake. 120s
      // gives 2x headroom over the slowest passing case (Pajama Top 60s) and
      // a real shot at completion for Male Shirt's 17-piece meshing pass.
      test.setTimeout(120_000);

      await openTemplateLibrary(page);
      await pickTemplate(page, c.template);

      await expect(page.locator('.template-overlay.open')).toBeHidden({ timeout: 10_000 });
      const piecesCount = await page.evaluate(
        () => window.__OPENCLO_STORE__?.getState().project?.pieces?.length ?? 0,
      );
      expect(piecesCount, `"${c.template}" should load pieces into project state`).toBeGreaterThan(0);

      await clickDressButton(page);

      await page.waitForFunction(
        () => window.__OPENCLO_STORE__?.getState().simulation?.simulationState === 'running',
        { timeout: 5_000 },
      );

      await waitForClothMeshOrFail(page, SIMULATION_BUDGET_MS);

      // Save a screenshot per pattern so drape quality can be eyeballed even
      // when the test passes (Playwright only auto-captures on failure).
      await page.screenshot({ path: `test-results/dress-dod-${slug}.png` });

      // Pull piece IDs + seam piece-pair refs so we can build the seam graph
      // and verify connectivity (v8 doc recommendation, replacing the
      // assemblyRatio heuristic that gave false greens on 2-piece patterns
      // like Blouse — 3 seams between 2 pieces hits ratio=1.5 but isn't a
      // garment, just a doubled-up panel).
      //
      // Also pull piece names (instrumentation for #506 follow-up): once
      // connectivity fails, we need to know WHICH pieces are stranded in
      // the orphan sub-component so we can diagnose the autoSew matching
      // gap (missing naming heuristic vs. length-tolerance miss vs. etc).
      // Cheap to compute (one map() over pieces); leave it on so future
      // #506 work has the signal without having to re-instrument.
      const graph = await page.evaluate(() => {
        const st = window.__OPENCLO_STORE__?.getState();
        const pieces = (st?.project?.pieces ?? []) as Array<{ id: string; name?: string }>;
        const seams = (st?.project?.seams ?? []) as Array<{
          pieceA?: { pieceId?: string };
          pieceB?: { pieceId?: string };
        }>;
        const pieceIds = pieces.map(p => p.id);
        const pieceNames = new Map(pieces.map(p => [p.id, p.name ?? '<unnamed>']));
        const seamPairs = seams
          .map(s => [s.pieceA?.pieceId, s.pieceB?.pieceId])
          .filter((p): p is [string, string] => Boolean(p[0] && p[1]));
        return { pieceIds, pieceNames: Array.from(pieceNames.entries()), seamPairs, seamCount: seams.length };
      });
      const pieceNamesById = new Map(graph.pieceNames);

      // Build undirected adjacency map and BFS-count connected components.
      // Self-seams (pieceA === pieceB) collapse to a self-edge which adds the
      // piece to its own neighbour set; that doesn't affect component
      // discovery and keeps the piece visible in the graph.
      const adj = new Map<string, Set<string>>();
      graph.pieceIds.forEach(id => adj.set(id, new Set()));
      graph.seamPairs.forEach(([a, b]) => {
        adj.get(a)?.add(b);
        adj.get(b)?.add(a);
      });
      const visited = new Set<string>();
      const componentPieces: string[][] = []; // instrumentation: each entry = piece names in that component
      for (const start of graph.pieceIds) {
        if (visited.has(start)) continue;
        const componentMembers: string[] = [];
        const queue = [start];
        while (queue.length > 0) {
          const node = queue.shift()!;
          if (visited.has(node)) continue;
          visited.add(node);
          componentMembers.push(pieceNamesById.get(node) ?? node);
          adj.get(node)?.forEach(n => {
            if (!visited.has(n)) queue.push(n);
          });
        }
        componentPieces.push(componentMembers);
      }
      const componentCount = componentPieces.length;
      const orphanCount = graph.pieceIds.filter(id => (adj.get(id)?.size ?? 0) === 0).length;
      const pieceCount = graph.pieceIds.length;
      const seamCount = graph.seamCount;

      // Full geometry distribution + region-aware verdict in one pass.
      const result = await page.evaluate((region: 'upper' | 'lower') => {
        const mesh = window.__OPENCLO_CLOTH_MESH__;
        const state = window.__OPENCLO_STORE__?.getState();
        const m = state?.project?.avatar?.measurements;
        const heightCm = m?.height ?? 170;
        const chestCm = (m as { chest?: number } | undefined)?.chest ?? 96;
        const heightM = heightCm * 0.01;
        const shoulderHeight = heightM * 0.82;
        const waistY = heightM * 0.58;
        const torsoRadius = (chestCm * 0.01) / (2 * Math.PI);
        const offBodyThreshold = torsoRadius * 3 + 0.15;

        const pos = mesh?.geometry?.getAttribute('position');
        if (!pos) return { ok: false, reason: 'no position attribute', diag: null };
        const arr = pos.array;
        const stride = pos.itemSize ?? 3;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        let total = 0, offBody = 0, nearFloor = 0;
        for (let i = 0; i + 2 < arr.length; i += stride) {
          const x = arr[i], y = arr[i + 1], z = arr[i + 2];
          total++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
          if (Math.hypot(x, z) > offBodyThreshold) offBody++;
          if (y < 0.10) nearFloor++;
        }
        const nearFloorPct = 100 * nearFloor / Math.max(total, 1);
        const offBodyPct = 100 * offBody / Math.max(total, 1);

        // Universal failure signals (apply to any garment):
        //   - too much on the floor → pieces fell off
        //   - too much off the body axis → pieces scattered
        const NOT_ON_FLOOR = nearFloorPct < 8;
        const HUGS_BODY = offBodyPct < 25;
        // Region-specific "held up" signal:
        //   - upper garments must reach near the shoulders
        //   - lower garments must reach up near the waist (not piled at floor)
        const reachTarget = region === 'upper' ? shoulderHeight * 0.80 : waistY * 0.75;
        const REACHES_UP = maxY >= reachTarget;

        const ok = NOT_ON_FLOOR && HUGS_BODY && REACHES_UP;
        const fails: string[] = [];
        if (!NOT_ON_FLOOR) fails.push(`${nearFloorPct.toFixed(1)}% collapsed to floor — fell off`);
        if (!HUGS_BODY) fails.push(`${offBodyPct.toFixed(1)}% off-body (>${offBodyThreshold.toFixed(2)}m from axis) — scattered`);
        if (!REACHES_UP) fails.push(`top only reaches Y=${maxY.toFixed(2)} (need ≥${reachTarget.toFixed(2)}) — piled below, not hanging`);

        return {
          ok,
          reason: ok
            ? `worn on body (nearFloor=${nearFloorPct.toFixed(1)}%, offBody=${offBodyPct.toFixed(1)}%, maxY=${maxY.toFixed(2)})`
            : `not properly worn — ${fails.join('; ')}`,
          diag: {
            total,
            torsoRadius: +torsoRadius.toFixed(3),
            offBodyThreshold: +offBodyThreshold.toFixed(3),
            waistY: +waistY.toFixed(3),
            shoulderHeight: +shoulderHeight.toFixed(3),
            bbox: {
              x: [+minX.toFixed(3), +maxX.toFixed(3)],
              y: [+minY.toFixed(3), +maxY.toFixed(3)],
              z: [+minZ.toFixed(3), +maxZ.toFixed(3)],
            },
            offBodyPct: +offBodyPct.toFixed(1),
            nearFloorPct: +nearFloorPct.toFixed(1),
            maxY: +maxY.toFixed(3),
          },
        };
      }, c.region);

      // Graph-connectivity assembly gate (v8 recommendation):
      //   (1) pieces ≥ MIN_PIECES — a real garment can't be made from 1-2
      //       panels. The Blouse template (2 pieces, 3 seams between them)
      //       hit assemblyRatio=1.5 but is visually a doubled panel, not a
      //       blouse. Skipping templates with too few pieces eliminates
      //       that false green at the source.
      //   (2) connected components == 1 — every piece participates in a
      //       seam chain that reaches every other piece. Catches T-Shirt
      //       (4 seams between 5 pieces → orphan sleeves) and Jacket
      //       (3 seams between 5 pieces → ≥2 components) honestly,
      //       independent of total seam count.
      const MIN_PIECES = 3;
      console.log(
        `[diagnostic] "${c.template}" (${c.region}): pieces=${pieceCount}, ` +
          `seams=${seamCount}, components=${componentCount}, orphans=${orphanCount}, ` +
          `geometry=${JSON.stringify(result.diag)}`,
      );
      // Instrumentation (#506 follow-up): dump component membership so we
      // can see which pieces are stranded when connectivity fails. Sorted
      // largest-first so the "main" component appears at index 0.
      const sortedComponents = [...componentPieces].sort((a, b) => b.length - a.length);
      console.log(
        `[diagnostic] "${c.template}" componentNames=${JSON.stringify(sortedComponents)}`,
      );

      expect(
        pieceCount,
        `${c.template}: only ${pieceCount} pieces in template — minimum ${MIN_PIECES} ` +
          `needed to form a real garment. With <3 pieces the seam graph is trivially ` +
          `connected regardless of construction quality, so connectivity gating is ` +
          `uninformative. Mark the template as incomplete or extend the catalog.`,
      ).toBeGreaterThanOrEqual(MIN_PIECES);

      expect(
        componentCount,
        `${c.template}: ${componentCount} connected components in the seam graph — ` +
          `need 1 (all pieces sewn into one assembled garment). ${orphanCount} orphan ` +
          `pieces (no seams). ${seamCount} seams / ${pieceCount} pieces. This is the ` +
          `#518 symptom: auto-seams did not stitch the pattern into a single component.`,
      ).toBe(1);

      expect(result.ok, `${c.template}: ${result.reason}`).toBe(true);
    });
  }
});
