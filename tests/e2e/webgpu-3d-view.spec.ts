import { test, expect } from '@playwright/test';

// 3D scene loading (avatar + IK init) can take 30s+ in headless Chromium
test.describe('WebGPU 3D View Rendering', () => {
  test.setTimeout(90_000);

  test('3D canvas renders without Invalid CommandBuffer errors', async ({ page }) => {
    // Attach console listener BEFORE navigation to capture all messages
    const invalidBufferErrors: string[] = [];
    const bufferSizeWarnings: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Invalid CommandBuffer')) {
        invalidBufferErrors.push(text);
      }
      if (text.includes('bound with size') && text.includes('is too small')) {
        bufferSizeWarnings.push(text);
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('webclo-use-webgpu', 'true');
    });
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });

    // Switch to 3D view and wait for avatar to load + IK init
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(5000);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // If WebGPU is active, these errors indicate the SkinnedMesh uniform
    // buffer was undersized — the entire render pass gets discarded
    expect(invalidBufferErrors).toHaveLength(0);
    expect(bufferSizeWarnings).toHaveLength(0);
  });

  test('skeleton boneMatrices size matches bones array after IK setup', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('webclo-use-webgpu', 'true');
    });
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(5000);

    // Traverse the scene and verify skeleton consistency
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'No canvas' };

      // Access R3F store via internal property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r3f = (canvas as any).__r3f;
      const scene = r3f?.store?.getState()?.scene;
      if (!scene) return { error: 'No R3F scene — may not be exposed in this build' };

      const skeletons: Array<{
        meshName: string;
        bonesLength: number;
        boneMatricesLength: number;
        match: boolean;
      }> = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scene.traverse((obj: any) => {
        if (obj.isSkinnedMesh && obj.skeleton) {
          const sk = obj.skeleton;
          skeletons.push({
            meshName: obj.name || obj.uuid.slice(0, 8),
            bonesLength: sk.bones.length,
            boneMatricesLength: sk.boneMatrices ? sk.boneMatrices.length / 16 : 0,
            match: sk.bones.length === (sk.boneMatrices ? sk.boneMatrices.length / 16 : -1),
          });
        }
      });

      return { skeletons };
    });

    if ('error' in result) {
      // R3F internal access may not be available in all builds — skip gracefully
      test.skip(true, result.error as string);
      return;
    }

    // Every skeleton's boneMatrices must be large enough for all bones
    for (const sk of result.skeletons) {
      expect(sk.boneMatricesLength).toBeGreaterThanOrEqual(sk.bonesLength);
    }
  });

  test('3D view renders with no errors in WebGL fallback mode', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter out benign Three.js warnings that appear during async renderer init
        if (text.includes('.render() called before the backend is initialized')) return;
        errors.push(text);
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('webclo-use-webgpu', 'false');
    });
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(5000);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Should have zero console errors (NodeMaterial compat was fixed in PR #287)
    expect(errors).toHaveLength(0);
  });
});
