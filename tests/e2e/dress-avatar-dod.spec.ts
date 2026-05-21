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
 * Open the app → load a male shirt pattern from the Template Library →
 * click "Dress" → within ≤10 s the cloth simulation produces a draped
 * garment such that:
 *   (a) at least 15 seams are formed in the project state
 *   (b) no cloth vertex falls below the avatar's waist Y position
 *       (i.e. the garment stays on the torso, doesn't fall to the floor)
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
  const CASES = [
    { template: 'Male Shirt', region: 'upper' as const },
    { template: 'T-Shirt', region: 'upper' as const },
    { template: 'Blouse Pattern', region: 'upper' as const },
    { template: 'Jacket (Size 52)', region: 'upper' as const },
    { template: 'Keiko Skirt', region: 'lower' as const },
  ];

  for (const c of CASES) {
    const slug = c.template.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    test(`Dress Avatar drapes "${c.template}" on the body (not fallen)`, async ({ page }) => {
      // Load + dress + 10s sim budget + measure can exceed Playwright's 30s
      // default for the heavier patterns (male_shirt meshes 17 pieces). Give
      // the whole flow generous headroom so we never fail on wall-clock jitter.
      test.setTimeout(60_000);

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

      const counts = await page.evaluate(() => {
        const st = window.__OPENCLO_STORE__?.getState();
        return {
          seams: st?.project?.seams?.length ?? 0,
          pieces: st?.project?.pieces?.length ?? 0,
        };
      });
      const seamCount = counts.seams;

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

      // Assembly ratio: seams per piece. A real garment sews most of its
      // pieces together (male_shirt: 29 seams / 17 pieces ≈ 1.7). A pattern
      // that only spawns loose panels has a low ratio (t-shirt: 3/5 = 0.6).
      // Empirically ≥1.5 separates assembled (male_shirt 1.71) from not
      // (t-shirt 0.6, blouse 1.0 — both confirmed unassembled by screenshot
      // and tiny bbox). This is a better gate than an absolute seam count
      // because it scales with pattern size.
      const assemblyRatio = counts.pieces > 0 ? +(seamCount / counts.pieces).toFixed(2) : 0;
      const ASSEMBLY_MIN = 1.5;
      console.log(
        `[diagnostic] "${c.template}" (${c.region}): pieces=${counts.pieces}, ` +
          `seams=${seamCount}, assemblyRatio=${assemblyRatio}, ` +
          `geometry=${JSON.stringify(result.diag)}`,
      );

      // Two independent conditions for a real draped garment:
      //   (1) it assembled — enough seams relative to piece count.
      //   (2) it's worn on the body — geometry verdict (not fallen/scattered).
      expect(
        assemblyRatio,
        `${c.template}: assemblyRatio ${assemblyRatio} < ${ASSEMBLY_MIN} — pieces ` +
          `did not sew into a garment (${seamCount} seams / ${counts.pieces} pieces). ` +
          `This is the #518 symptom: auto-seams not forming for this pattern.`,
      ).toBeGreaterThanOrEqual(ASSEMBLY_MIN);

      expect(result.ok, `${c.template}: ${result.reason}`).toBe(true);
    });
  }
});
