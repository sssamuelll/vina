import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function openAvatarPanel(page: Page) {
  // Switch to 3D view
  await page.click('button:has-text("3D")');
  await page.waitForTimeout(2000);

  // Click the Avatar affordance in the RightDock to open the AvatarPanel
  // (Toolbar3D, which owned the old data-tool-id button, was deleted 2026-06-04).
  const avatarBtn = page.locator('button[aria-label="Avatar"]');
  await avatarBtn.click({ force: true });
  await page.waitForTimeout(500);

  // AvatarPanel should now show "Avatar & Pose" heading
  await expect(page.locator('.context-panel__header >> text=Avatar')).toBeVisible({ timeout: 5000 });

  // Expand Pose section if collapsed
  const poseHeader = page.locator('.avatar-panel button:has-text("Pose")');
  if (await poseHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
    await poseHeader.click({ force: true });
    await page.waitForTimeout(300);
  }
}

test.describe('IK Solver', () => {
  test.setTimeout(120_000);

  test('IK toggle button appears in avatar panel pose section', async ({ page }) => {
    await waitForApp(page);
    await openAvatarPanel(page);

    // IK toggle button should exist in the Pose section
    const ikToggle = page.locator('.ik-toggle-btn');
    await expect(ikToggle).toBeVisible({ timeout: 3000 });
  });

  test('IK toggle button switches between FK and IK mode text', async ({ page }) => {
    await waitForApp(page);
    await openAvatarPanel(page);

    const ikToggle = page.locator('.ik-toggle-btn');
    await expect(ikToggle).toBeVisible({ timeout: 3000 });

    // Starts as FK Mode
    await expect(ikToggle).toHaveText('FK Mode');

    // Click to enable IK (force: canvas overlaps in 3D view)
    await ikToggle.click({ force: true });
    await page.waitForTimeout(300);
    await expect(ikToggle).toHaveText('IK Mode');
    await expect(ikToggle).toHaveClass(/active/);

    // Click to disable IK
    await ikToggle.click({ force: true });
    await page.waitForTimeout(300);
    await expect(ikToggle).toHaveText('FK Mode');
  });

  test('IK mode produces no console errors (skeleton sync)', async ({ page }) => {
    // Collect console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await openAvatarPanel(page);

    const ikToggle = page.locator('.ik-toggle-btn');
    await ikToggle.click({ force: true });
    await page.waitForTimeout(300);
    await expect(ikToggle).toHaveText('IK Mode');

    // Wait several frames for IK solver to run
    await page.waitForTimeout(2000);

    // No TypeError from skeleton.boneInverses mismatch
    const skeletonErrors = errors.filter(e =>
      e.includes('Cannot read properties of undefined') ||
      e.includes('boneInverses')
    );
    expect(skeletonErrors).toHaveLength(0);
  });

  test('IK solver runs without Maximum update depth error', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });

    await waitForApp(page);
    await openAvatarPanel(page);

    const ikToggle = page.locator('.ik-toggle-btn');
    await ikToggle.click({ force: true });
    await page.waitForTimeout(2000);

    // Should not have "Maximum update depth exceeded" warnings
    const depthErrors = warnings.filter(e => e.includes('Maximum update depth'));
    expect(depthErrors).toHaveLength(0);
  });

  test('Drag hand gizmo — arm follows IK target with joint limits', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await openAvatarPanel(page);

    const ikToggle = page.locator('.ik-toggle-btn');
    await ikToggle.click({ force: true });
    await page.waitForTimeout(300);
    await expect(ikToggle).toHaveText('IK Mode');

    // Wait for IK solver to initialize and settle
    await page.waitForTimeout(2000);

    // Record initial arm bone quaternions from the Three.js scene
    const initialQuats = await page.evaluate(() => {
      const container = document.querySelector('.viewport3d') as HTMLElement | null;
      if (!container) return null;
      const scene = (container as unknown as Record<string, unknown>).__scene as {
        traverse: (cb: (obj: { isSkinnedMesh?: boolean; skeleton?: { bones: { name: string; quaternion: { x: number; y: number; z: number; w: number } }[] } }) => void) => void;
      } | undefined;
      if (!scene) return null;

      let skeleton: { bones: { name: string; quaternion: { x: number; y: number; z: number; w: number } }[] } | null = null;
      scene.traverse((obj) => {
        if (obj.isSkinnedMesh && !skeleton && obj.skeleton) {
          skeleton = obj.skeleton;
        }
      });
      if (!skeleton) return null;

      const armBones = ['LeftShoulder', 'LeftArm', 'LeftForeArm'];
      const quats: Record<string, { x: number; y: number; z: number; w: number }> = {};
      for (const bone of skeleton.bones) {
        if (armBones.includes(bone.name)) {
          quats[bone.name] = {
            x: bone.quaternion.x,
            y: bone.quaternion.y,
            z: bone.quaternion.z,
            w: bone.quaternion.w,
          };
        }
      }
      return quats;
    });

    expect(initialQuats).not.toBeNull();
    expect(Object.keys(initialQuats!)).toContain('LeftArm');

    // Get the current left hand bone world position from matrixWorld
    const handWorldPos = await page.evaluate(() => {
      const container = document.querySelector('.viewport3d') as HTMLElement | null;
      if (!container) return null;
      const scene = (container as unknown as Record<string, unknown>).__scene as {
        traverse: (cb: (obj: {
          isSkinnedMesh?: boolean;
          skeleton?: {
            bones: {
              name: string;
              updateWorldMatrix: (ancestors: boolean, descendants: boolean) => void;
              matrixWorld: { elements: number[] };
            }[];
          };
        }) => void) => void;
      } | undefined;
      if (!scene) return null;

      let skeleton: NonNullable<Parameters<Parameters<typeof scene.traverse>[0]>[0]['skeleton']> | null = null;
      scene.traverse((obj) => {
        if (obj.isSkinnedMesh && !skeleton && obj.skeleton) {
          skeleton = obj.skeleton;
        }
      });
      if (!skeleton) return null;

      const hand = skeleton.bones.find(b => b.name === 'LeftHand');
      if (!hand) return null;
      hand.updateWorldMatrix(true, false);
      const e = hand.matrixWorld.elements;
      return { x: e[12], y: e[13], z: e[14] };
    });

    expect(handWorldPos).not.toBeNull();

    // Dispatch setIKTarget via exposed Redux store to simulate dragging the gizmo.
    // Move the left hand target 0.3m forward (Z+) and 0.2m up (Y+) from current position.
    await page.evaluate((pos) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__VINA_STORE__;
      if (!store) return;
      store.dispatch({
        type: 'avatar/setIKTarget',
        payload: {
          name: 'leftArm',
          position: {
            x: pos!.x,
            y: pos!.y + 0.2,
            z: pos!.z + 0.3,
          },
        },
      });
    }, handWorldPos);

    // Poll until the solver actually moved an arm bone (condition-based wait).
    // A fixed timeout here raced the R3F frame loop: the IK solve runs inside
    // useFrame, and under SwiftShader on a contended CI runner a single frame
    // can stall for seconds — 1500ms elapsed with ZERO solve frames, so the
    // quats read back unchanged (the shard-3 flake: 5 occurrences across 4
    // PRs, reproduced locally with CDP 100x CPU throttle). Waiting for the
    // observable condition (quat delta > 0.001 vs the initial snapshot)
    // absorbs arbitrary frame starvation AND late async CCDIKSolver init,
    // while a genuine solver regression still fails loudly at the 30s budget.
    await page.waitForFunction(
      (initial) => {
        const container = document.querySelector('.viewport3d') as HTMLElement | null;
        if (!container) return false;
        const scene = (container as unknown as Record<string, unknown>).__scene as {
          traverse: (cb: (obj: { isSkinnedMesh?: boolean; skeleton?: { bones: { name: string; quaternion: { x: number; y: number; z: number; w: number } }[] } }) => void) => void;
        } | undefined;
        if (!scene) return false;

        let skeleton: { bones: { name: string; quaternion: { x: number; y: number; z: number; w: number } }[] } | null = null;
        scene.traverse((obj) => {
          if (obj.isSkinnedMesh && !skeleton && obj.skeleton) {
            skeleton = obj.skeleton;
          }
        });
        if (!skeleton) return false;

        for (const bone of (skeleton as { bones: { name: string; quaternion: { x: number; y: number; z: number; w: number } }[] }).bones) {
          const before = initial![bone.name];
          if (!before) continue;
          const q = bone.quaternion;
          const dist = Math.sqrt(
            (q.x - before.x) ** 2 + (q.y - before.y) ** 2 + (q.z - before.z) ** 2 + (q.w - before.w) ** 2
          );
          if (dist > 0.001) return true;
        }
        return false;
      },
      initialQuats,
      { timeout: 30_000, polling: 250 },
    ).catch(() => {
      throw new Error(
        'IK solver never moved LeftShoulder/LeftArm/LeftForeArm within 30s of setIKTarget — arm did not follow the IK target'
      );
    });

    // Verify no solver errors occurred
    const solverErrors = errors.filter(e =>
      e.includes('Cannot read properties of undefined') ||
      e.includes('boneInverses') ||
      e.includes('IK solving failed')
    );
    expect(solverErrors).toHaveLength(0);
  });
});
