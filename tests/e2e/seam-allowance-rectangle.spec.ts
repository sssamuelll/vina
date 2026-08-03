import { test, expect, Page } from '@playwright/test';

/**
 * maria-190 — "los márgenes de costura no se crean bien en un rectángulo y
 * debería ser lo más fácil".
 *
 * Drives her exact flow through the real UI: draw a rectangle with the rectangle
 * tool, give it a seam allowance, look at the cut line. Asserts the rendered SVG
 * cut-line path.
 *
 * Sin capturas: escribir en una ruta absoluta de un escritorio Windows desde un
 * test commiteado crea un directorio literal `C:` en la raíz del repo cuando
 * corre en CI de Linux. Las capturas para María se generan aparte.
 */

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function getActiveTool2D(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const store = (window as unknown as { __VINA_STORE__?: { getState: () => { tools: { activeTool2D: string } } } }).__VINA_STORE__;
    return store ? store.getState().tools.activeTool2D : null;
  });
}

async function activateTool(page: Page, shortcut: string, toolId: string) {
  await page.keyboard.press(shortcut);
  await expect.poll(() => getActiveTool2D(page), { timeout: 2000 }).toBe(toolId);
  await page.locator('[data-testid="empty-state-2d"]').waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(100);
}

/** Apply a seam allowance to every piece, exactly as the properties panel does. */
async function setSeamAllowance(page: Page, mm: number) {
  await page.evaluate((width) => {
    const store = (window as unknown as {
      __VINA_STORE__: {
        getState: () => { project: { pieces: Array<Record<string, unknown>> } };
        dispatch: (a: unknown) => void;
      };
    }).__VINA_STORE__;
    for (const piece of store.getState().project.pieces) {
      store.dispatch({ type: 'project/updatePiece', payload: { ...piece, seamAllowance: width, updatedAt: Date.now() } });
    }
  }, mm);
  await page.waitForTimeout(400);
}

test.describe('maria-190 — seam allowance on a drafted rectangle', () => {
  // Booting the full shell (3D viewport + WASM) on a cold vite blows the 30s
  // default before the first mouse event lands. Same budget the sim specs use.
  test.setTimeout(120_000);

  test('the cut line is a clean four-corner offset', async ({ page }) => {
    await waitForApp(page);

    // ── Draw a rectangle with the rectangle tool ──────────────────────────
    await activateTool(page, 's', 'rectangle');
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('no pattern svg');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx - 170, cy - 95);
    await page.mouse.down();
    await page.mouse.move(cx + 170, cy + 95, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const pieceCount = await page.evaluate(() => {
      const store = (window as unknown as { __VINA_STORE__: { getState: () => { project: { pieces: unknown[] } } } }).__VINA_STORE__;
      return store.getState().project.pieces.length;
    });
    expect(pieceCount).toBe(1);

    // ── Give it a margin ─────────────────────────────────────────────────
    await setSeamAllowance(page, 15);

    // ── The cut line must be a simple 4-corner contour ───────────────────
    // Before the fix this path came back with 6+ points tracing a self-crossing
    // zigzag, with a rounded blob at one corner. Read it straight off the DOM.
    const outline = await page.evaluate(() => {
      const store = (window as unknown as {
        __VINA_STORE__: { getState: () => { project: { pieces: Array<{ outline: Array<{ type: string; values: number[] }> }> } } };
      }).__VINA_STORE__;
      const pts = store.getState().project.pieces[0].outline
        .filter(c => c.type === 'M' || c.type === 'L')
        .map(c => ({ x: c.values[0], y: c.values[1] }));
      return {
        minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)),
        minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y)),
      };
    });

    const cutLine = await page.locator('svg.pattern-svg [data-testid="piece-cut-line"]').first().getAttribute('d');
    expect(cutLine).toBeTruthy();

    // Exactly four vertices — not a count of "some points in roughly the right box".
    const verts = [...(cutLine as string).matchAll(/[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g)]
      .map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
    expect(verts).toHaveLength(4);
    // No arc/curve commands — a mitered rectangle corner is a sharp point.
    expect(cutLine).not.toMatch(/[ACQSTacqst]/);

    // And they sit exactly one SA width outside each side of the piece.
    const SA = 15;
    const has = (x: number, y: number) => verts.some(v => Math.abs(v.x - x) < 0.5 && Math.abs(v.y - y) < 0.5);
    expect(has(outline.minX - SA, outline.minY - SA)).toBe(true);
    expect(has(outline.maxX + SA, outline.minY - SA)).toBe(true);
    expect(has(outline.maxX + SA, outline.maxY + SA)).toBe(true);
    expect(has(outline.minX - SA, outline.maxY + SA)).toBe(true);
  });

  test('a five-sided piece also offsets cleanly (non-right angles)', async ({ page }) => {
    await waitForApp(page);

    await activateTool(page, 'h', 'pen');
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('no pattern svg');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const r = 130;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 5; i++) {
      const t = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    for (const [x, y] of pts) await page.mouse.click(x, y);
    await page.mouse.click(pts[0][0], pts[0][1]); // close
    await page.waitForTimeout(600);

    const SA = 15;
    await setSeamAllowance(page, SA);

    const corners = await page.evaluate(() => {
      const store = (window as unknown as {
        __VINA_STORE__: { getState: () => { project: { pieces: Array<{ outline: Array<{ type: string; values: number[] }> }> } } };
      }).__VINA_STORE__;
      return store.getState().project.pieces[0].outline
        .filter(c => c.type === 'M' || c.type === 'L')
        .map(c => ({ x: c.values[0], y: c.values[1] }));
    });
    expect(corners).toHaveLength(5);

    const cutLine = await page.locator('svg.pattern-svg [data-testid="piece-cut-line"]').first().getAttribute('d');
    const verts = [...(cutLine as string).matchAll(/[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g)]
      .map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
    expect(verts).toHaveLength(5);
    expect(cutLine).not.toMatch(/[ACQSTacqst]/);

    // Un vértice miterado se aleja SA / sin(θ/2) de su esquina, donde θ es el
    // ángulo interior. En 90° eso es SA·√2; en los 108° del pentágono, ~1.24·SA.
    // La fórmula sale de la trigonometría de la esquina, no del código que
    // estamos probando — si el motor cambia de convención, esto lo cata.
    for (let i = 0; i < 5; i++) {
      const v = corners[i];
      const a = corners[(i + 4) % 5];
      const b = corners[(i + 1) % 5];
      const u1 = Math.atan2(a.y - v.y, a.x - v.x);
      const u2 = Math.atan2(b.y - v.y, b.x - v.x);
      let theta = Math.abs(u1 - u2);
      if (theta > Math.PI) theta = 2 * Math.PI - theta;
      const expected = SA / Math.sin(theta / 2);

      const nearest = Math.min(...verts.map(p => Math.hypot(p.x - v.x, p.y - v.y)));
      expect(nearest, `esquina ${i}: θ=${((theta * 180) / Math.PI).toFixed(1)}°`).toBeCloseTo(expected, 0);
    }
  });
});
