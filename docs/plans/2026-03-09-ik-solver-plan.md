# IK Solver Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable avatar posing via IK end-effector dragging in the 3D viewport using CCD solver with anatomical joint constraints.

**Architecture:** CCD-first using THREE.CCDIKSolver. TransformControls gizmos on end-effectors (hands/feet). Post-solve swing-twist constraint clamping. Joint rotations written back to Redux for FK slider sync and pose library compatibility.

**Tech Stack:** Three.js (CCDIKSolver, TransformControls), @react-three/drei, React, Redux

---

### Task 1: Fix CCD Solver Initialization in AvatarModel

The current `initializeIK()` in AvatarModel.tsx is broken — it sets `target === effector`, making CCD a no-op. We need to create invisible target helper objects and wire them properly.

**Files:**
- Modify: `src/components/Viewport3D/AvatarModel.tsx:371-411` (initializeIK function)
- Modify: `src/store/avatarSlice.ts:131-149` (add end-effector bone mapping)

**Step 1: Add end-effector bone mapping to avatarSlice.ts**

After line 149 (after `IK_CHAINS` definition), add:

```typescript
/** Maps each IK chain to the bone whose world position becomes the initial target */
export const IK_END_EFFECTOR_BONES: Record<string, string> = {
  leftArm: 'LeftHand',
  rightArm: 'RightHand',
  leftLeg: 'LeftFoot',
  rightLeg: 'RightFoot',
};
```

**Step 2: Rewrite initializeIK in AvatarModel.tsx**

Add a new ref for target helpers near line 174:

```typescript
const ikTargetHelpers = useRef<Map<string, THREE.Object3D>>(new Map());
```

Replace the entire `initializeIK` function (lines 372-411) with:

```typescript
const initializeIK = (activeScene: THREE.Object3D) => {
  if (!activeScene || boneMap.current.size === 0) return;

  // Clean up old target helpers
  ikTargetHelpers.current.forEach(helper => helper.parent?.remove(helper));
  ikTargetHelpers.current.clear();
  ikSolver.current = null;

  try {
    let mesh: THREE.SkinnedMesh | null = null;
    activeScene.traverse((child) => {
      if (!mesh && (child as THREE.SkinnedMesh).isSkinnedMesh) {
        mesh = child as THREE.SkinnedMesh;
      }
    });
    if (!mesh || !(mesh as THREE.SkinnedMesh).skeleton) return;

    const skeleton = (mesh as THREE.SkinnedMesh).skeleton!;
    const iks: Array<{
      target: number;
      effector: number;
      links: Array<{ index: number; rotationMin?: THREE.Vector3; rotationMax?: THREE.Vector3 }>;
    }> = [];

    for (const chain of ikChains) {
      const endEffectorBoneName = IK_END_EFFECTOR_BONES[chain.name];
      if (!endEffectorBoneName) continue;

      const endEffectorBone = boneMap.current.get(endEffectorBoneName);
      if (!endEffectorBone) continue;

      // Create invisible target helper
      const target = new THREE.Object3D();
      target.name = `ik-target-${chain.name}`;
      // Position at end-effector's current world position
      const worldPos = new THREE.Vector3();
      endEffectorBone.getWorldPosition(worldPos);
      target.position.copy(worldPos);
      activeScene.add(target);
      ikTargetHelpers.current.set(chain.name, target);

      // We need the target in the skeleton's bones array for CCDIKSolver
      // Add it as a child of the scene root and track its index
      skeleton.bones.push(target as unknown as THREE.Bone);
      const targetIndex = skeleton.bones.length - 1;

      const effectorBone = boneMap.current.get(chain.bones[chain.bones.length - 1]);
      if (!effectorBone) continue;
      const effectorIndex = skeleton.bones.indexOf(effectorBone);

      // Build links from chain bones (excluding last which is effector)
      const links = chain.bones.slice(0, -1).map(boneName => {
        const bone = boneMap.current.get(boneName);
        if (!bone) return null;
        const idx = skeleton.bones.indexOf(bone);

        // Convert JOINT_CONSTRAINTS to radians for CCD link limits
        const constraints = JOINT_CONSTRAINTS[boneName];
        if (constraints) {
          return {
            index: idx,
            rotationMin: new THREE.Vector3(
              constraints.minX * DEG2RAD,
              constraints.minY * DEG2RAD,
              constraints.minZ * DEG2RAD
            ),
            rotationMax: new THREE.Vector3(
              constraints.maxX * DEG2RAD,
              constraints.maxY * DEG2RAD,
              constraints.maxZ * DEG2RAD
            ),
          };
        }
        return { index: idx };
      }).filter((l): l is NonNullable<typeof l> => l !== null);

      if (links.length > 0) {
        iks.push({
          target: targetIndex,
          effector: effectorIndex,
          links,
        });
      }
    }

    if (iks.length > 0) {
      ikSolver.current = new CCDIKSolver(mesh, iks);
    }
  } catch (error) {
    console.warn('[AvatarModel] IK initialization failed:', error);
  }
};
```

**Step 3: Add import for IK_END_EFFECTOR_BONES**

Update the import from avatarSlice at line 11:

```typescript
import { setJointRotation, clampJointRotation, IK_END_EFFECTOR_BONES, JOINT_CONSTRAINTS } from '../../store/avatarSlice';
```

Also add JOINT_CONSTRAINTS to the existing import if not already there.

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (no new type errors)

**Step 5: Commit**

```bash
git add src/components/Viewport3D/AvatarModel.tsx src/store/avatarSlice.ts
git commit -m "fix(ik): rewrite CCD solver initialization with proper target helpers"
```

---

### Task 2: Fix IK Solve Loop in AvatarModel

The current IK update code in `applyPose` dispatches joint rotations for every bone every frame, which can cause render loops. Fix it to only update targets and solve when IK is active, with proper debouncing.

**Files:**
- Modify: `src/components/Viewport3D/AvatarModel.tsx:460-496` (IK section of applyPose)

**Step 1: Replace IK section of applyPose**

Replace the IK block inside `applyPose.current` (the block starting with `if (ikEnabled && ikSolver.current && ikTargets.length > 0)`) with:

```typescript
// Apply IK if enabled and solver is available
if (ikEnabled && ikSolver.current && ikTargetHelpers.current.size > 0) {
  try {
    // Update target helper positions from Redux ikTargets
    for (const target of ikTargets) {
      const helper = ikTargetHelpers.current.get(target.name);
      if (helper) {
        helper.position.set(target.position.x, target.position.y, target.position.z);
      }
    }

    // Run CCD solver
    ikSolver.current.update();

    // Post-solve: apply swing-twist constraints and sync back to Redux
    const updates: Array<{ joint: string; rotation: { x: number; y: number; z: number } }> = [];

    for (const chain of ikChains) {
      for (const boneName of chain.bones) {
        const bone = boneMap.current.get(boneName);
        const bindPose = bindPoses.current.get(boneName);
        if (!bone || !bindPose) continue;

        // Extract rotation relative to bind pose
        const relativeRot = bindPose.clone().invert().multiply(bone.quaternion.clone());

        // Apply swing-twist constraint
        const constrainedQ = clampSwingTwist(relativeRot, ANATOMICAL_CONSTRAINTS[boneName] || {
          twistAxis: new THREE.Vector3(0, 1, 0),
          swingAngle1: 90, swingAngle2: 90,
          twistMin: -90, twistMax: 90,
        });

        // Apply constrained rotation back to bone
        bone.quaternion.copy(bindPose).multiply(constrainedQ);

        // Convert to Euler for Redux
        const euler = new THREE.Euler().setFromQuaternion(constrainedQ, 'ZYX');
        const rotation = {
          x: euler.x * (180 / Math.PI),
          y: euler.y * (180 / Math.PI),
          z: euler.z * (180 / Math.PI),
        };

        // Only dispatch if significantly different (>1°)
        const current = joints[boneName];
        if (!current ||
            Math.abs(rotation.x - current.x) > 1 ||
            Math.abs(rotation.y - current.y) > 1 ||
            Math.abs(rotation.z - current.z) > 1) {
          updates.push({ joint: boneName, rotation });
        }
      }
    }

    // Batch dispatch (one per bone that changed)
    for (const update of updates) {
      dispatch(setJointRotation(update));
    }
  } catch (error) {
    console.warn('[AvatarModel] IK solving failed:', error);
  }
}
```

**Step 2: Add imports for swing-twist**

Add at the top of AvatarModel.tsx:

```typescript
import { clampSwingTwist, ANATOMICAL_CONSTRAINTS } from '../../utils/avatar/swingTwistConstraint';
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/Viewport3D/AvatarModel.tsx
git commit -m "fix(ik): proper CCD solve loop with swing-twist post-constraints"
```

---

### Task 3: Create IKEndEffectorGizmos Component

New component rendering TransformControls at each IK chain's end-effector position. Only visible when IK is enabled and pose editor is open.

**Files:**
- Create: `src/components/Viewport3D/IKEndEffectorGizmos.tsx`

**Step 1: Create the component**

```typescript
import { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { setIKTarget } from '../../store/avatarSlice';
import { IK_CHAINS, IK_END_EFFECTOR_BONES } from '../../store/avatarSlice';

interface EndEffectorGizmoProps {
  chainName: string;
  endEffectorBoneName: string;
  setOrbitEnabled: (enabled: boolean) => void;
}

function EndEffectorGizmo({ chainName, endEffectorBoneName, setOrbitEnabled }: EndEffectorGizmoProps) {
  const dispatch = useDispatch();
  const helperRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const transformRef = useRef<React.ComponentRef<typeof TransformControls>>(null);
  const { scene } = useThree();
  const boneRef = useRef<THREE.Bone | null>(null);
  const initialized = useRef(false);

  // Find the end-effector bone
  useEffect(() => {
    let skeleton: THREE.Skeleton | null = null;
    scene.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh && !skeleton) {
        skeleton = (obj as THREE.SkinnedMesh).skeleton;
      }
    });
    if (skeleton) {
      const bone = (skeleton as THREE.Skeleton).bones.find(b => b.name === endEffectorBoneName);
      boneRef.current = bone ?? null;
    }
  }, [scene, endEffectorBoneName]);

  // Initialize helper position at bone's world position
  useFrame(() => {
    if (!boneRef.current) return;
    if (!initialized.current) {
      const worldPos = new THREE.Vector3();
      boneRef.current.getWorldPosition(worldPos);
      helperRef.current.position.copy(worldPos);
      initialized.current = true;
    }
  });

  // Handle drag events
  const handleObjectChange = useCallback(() => {
    const pos = helperRef.current.position;
    dispatch(setIKTarget({
      name: chainName,
      position: { x: pos.x, y: pos.y, z: pos.z },
    }));
  }, [dispatch, chainName]);

  // Toggle orbit controls during drag
  useEffect(() => {
    const controls = transformRef.current;
    if (!controls) return;

    const onDraggingChanged = (event: { value: boolean }) => {
      setOrbitEnabled(!event.value);
    };

    // TransformControls emits 'dragging-changed' event
    controls.addEventListener('dragging-changed', onDraggingChanged);
    return () => {
      controls.removeEventListener('dragging-changed', onDraggingChanged);
    };
  }, [setOrbitEnabled]);

  return (
    <>
      <primitive object={helperRef.current} />
      <TransformControls
        ref={transformRef}
        object={helperRef.current}
        mode="translate"
        size={0.5}
        onObjectChange={handleObjectChange}
      />
    </>
  );
}

export default function IKEndEffectorGizmos({
  setOrbitEnabled,
}: {
  setOrbitEnabled: (enabled: boolean) => void;
}) {
  const poseEditorOpen = useSelector((s: RootState) => s.avatar.poseEditorOpen);
  const ikEnabled = useSelector((s: RootState) => s.avatar.pose.ikEnabled);

  if (!poseEditorOpen || !ikEnabled) return null;

  return (
    <>
      {IK_CHAINS.map(chain => {
        const endEffectorBone = IK_END_EFFECTOR_BONES[chain.name];
        if (!endEffectorBone) return null;
        return (
          <EndEffectorGizmo
            key={chain.name}
            chainName={chain.name}
            endEffectorBoneName={endEffectorBone}
            setOrbitEnabled={setOrbitEnabled}
          />
        );
      })}
    </>
  );
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/Viewport3D/IKEndEffectorGizmos.tsx
git commit -m "feat(ik): add IKEndEffectorGizmos with TransformControls per chain"
```

---

### Task 4: Mount IKEndEffectorGizmos in Viewport3D

Wire the new component into the 3D scene.

**Files:**
- Modify: `src/components/Viewport3D/Viewport3D.tsx:14` (add import)
- Modify: `src/components/Viewport3D/Viewport3D.tsx:331` (mount after JointGizmos)

**Step 1: Add import**

After line 14 (`import JointGizmos from './JointGizmos';`), add:

```typescript
import IKEndEffectorGizmos from './IKEndEffectorGizmos';
```

**Step 2: Mount component in Canvas**

After line 331 (`<JointGizmos poseDrag={poseDrag} setOrbitEnabled={setOrbitEnabled} />`), add:

```typescript
<IKEndEffectorGizmos setOrbitEnabled={setOrbitEnabled} />
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(ik): mount IKEndEffectorGizmos in Viewport3D scene"
```

---

### Task 5: Update JointGizmos for IK Mode

When IK is enabled, FK joint gizmos should be visual-only (no drag interaction) and show a different color to indicate IK mode.

**Files:**
- Modify: `src/components/Viewport3D/JointGizmos.tsx`

**Step 1: Add IK state selector**

Inside `JointSphere` component, after the `isSelected` line (around line 30), add:

```typescript
const ikEnabled = useSelector((s: RootState) => s.avatar.pose.ikEnabled);
```

**Step 2: Disable pointer interaction when IK active**

Change the `onPointerDown` handler (line 78-81) to be conditional:

```typescript
onPointerDown={(e) => {
  if (ikEnabled) return; // IK mode — gizmos are visual only
  e.stopPropagation();
  poseDrag.onGizmoPointerDown(boneName, e);
  document.body.style.cursor = 'grabbing';
}}
```

**Step 3: Add IK mode color**

Add a new color constant near line 14:

```typescript
const COLOR_IK_MODE = new THREE.Color('#ff8844');
```

Update the color selection (line 56):

```typescript
const color = ikEnabled ? COLOR_IK_MODE : isSelected ? COLOR_SELECTED : hovered ? COLOR_HOVER : COLOR_IDLE;
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/Viewport3D/JointGizmos.tsx
git commit -m "feat(ik): make FK gizmos visual-only in IK mode with orange color"
```

---

### Task 6: Add IK Toggle Keyboard Shortcut

Add a keyboard shortcut to toggle IK mode (I key) in the 3D viewport, consistent with the existing pose editor workflow.

**Files:**
- Modify: `src/components/Viewport3D/Viewport3D.tsx:219-266` (keyboard handler)

**Step 1: Add import**

Add `toggleIK` to imports from avatarSlice. Find where other avatarSlice imports exist or add:

```typescript
import { toggleIK } from '../../store/avatarSlice';
```

**Step 2: Add I key handler**

Inside the `useEffect` keyboard handler (around line 263, before the closing `};`), add:

```typescript
// I — Toggle IK mode (when pose editor is open)
if ((e.key === 'I' || e.key === 'i') && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
  if (poseEditorOpen) {
    e.preventDefault();
    dispatch(toggleIK());
  }
}
```

**Step 3: Update the useEffect dependency array**

The dependency array at line 266 needs `poseEditorOpen` added (it's already declared at line 138).

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(ik): add I key shortcut to toggle IK mode in pose editor"
```

---

### Task 7: Add IK Toggle to Pose Editor UI

The user needs a visible button to toggle IK mode. Add it to the pose editor panel (AvatarPanel or wherever the pose presets/FK controls live).

**Files:**
- Modify: `src/components/Viewport3D/AvatarPanel.tsx` (add IK toggle button)

**Step 1: Read AvatarPanel.tsx to understand the layout**

Read the file first to find the appropriate place to add the IK toggle.

**Step 2: Add IK toggle button**

Add a toggle button in the pose editor section. Use the existing `ikEnabled` state from Redux. Dispatch `toggleIK` on click.

```typescript
// Import
import { toggleIK } from '../../store/avatarSlice';

// In the component, read ikEnabled
const ikEnabled = useSelector((s: RootState) => s.avatar.pose.ikEnabled);

// Add toggle button in the pose controls area
<button
  className={`ik-toggle-btn ${ikEnabled ? 'active' : ''}`}
  onClick={() => dispatch(toggleIK())}
  title={ikEnabled ? 'Switch to FK (Direct Joint Rotation)' : 'Switch to IK (Drag End-Effectors)'}
>
  {ikEnabled ? 'IK Mode' : 'FK Mode'}
</button>
```

**Step 3: Add minimal CSS for the toggle**

Add styles to the existing CSS file for AvatarPanel (or Viewport3D.css):

```css
.ik-toggle-btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(30, 30, 30, 0.8);
  color: #ccc;
  cursor: pointer;
  font-size: 11px;
  font-family: Inter, sans-serif;
}
.ik-toggle-btn.active {
  background: rgba(74, 158, 255, 0.2);
  color: #4a9eff;
  border-color: rgba(74, 158, 255, 0.4);
}
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/Viewport3D/AvatarPanel.tsx src/components/Viewport3D/Viewport3D.css
git commit -m "feat(ik): add FK/IK mode toggle button in pose editor panel"
```

---

### Task 8: Unit Tests for IK Integration

Test that the IK solver properly uses joint constraints and that the end-effector mapping is correct.

**Files:**
- Create: `src/store/__tests__/ikSolver.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { IK_CHAINS, IK_END_EFFECTOR_BONES, JOINT_CONSTRAINTS, clampJointRotation } from '../avatarSlice';

describe('IK Solver Configuration', () => {
  it('every IK chain has a matching end-effector bone', () => {
    for (const chain of IK_CHAINS) {
      expect(IK_END_EFFECTOR_BONES[chain.name]).toBeDefined();
      expect(typeof IK_END_EFFECTOR_BONES[chain.name]).toBe('string');
    }
  });

  it('every IK chain bone has joint constraints', () => {
    for (const chain of IK_CHAINS) {
      for (const boneName of chain.bones) {
        expect(JOINT_CONSTRAINTS[boneName]).toBeDefined();
      }
    }
  });

  it('clampJointRotation respects min/max bounds', () => {
    // LeftForeArm: minX=0, maxX=145 — should clamp negative X to 0
    const result = clampJointRotation('LeftForeArm', { x: -30, y: 0, z: 0 });
    expect(result.x).toBeGreaterThanOrEqual(0);
  });

  it('clampJointRotation passes valid rotations through', () => {
    const rotation = { x: 45, y: 0, z: 0 };
    const result = clampJointRotation('LeftArm', rotation);
    // 45° is within LeftArm constraints (minX=-40, maxX=160)
    expect(Math.abs(result.x - 45)).toBeLessThan(5);
  });

  it('IK_CHAINS has 4 chains (arms + legs)', () => {
    expect(IK_CHAINS).toHaveLength(4);
    const names = IK_CHAINS.map(c => c.name);
    expect(names).toContain('leftArm');
    expect(names).toContain('rightArm');
    expect(names).toContain('leftLeg');
    expect(names).toContain('rightLeg');
  });

  it('end-effector bones are hands and feet', () => {
    expect(IK_END_EFFECTOR_BONES.leftArm).toBe('LeftHand');
    expect(IK_END_EFFECTOR_BONES.rightArm).toBe('RightHand');
    expect(IK_END_EFFECTOR_BONES.leftLeg).toBe('LeftFoot');
    expect(IK_END_EFFECTOR_BONES.rightLeg).toBe('RightFoot');
  });
});
```

**Step 2: Run tests**

Run: `npm run test -- src/store/__tests__/ikSolver.test.ts`
Expected: All 5 tests PASS

**Step 3: Commit**

```bash
git add src/store/__tests__/ikSolver.test.ts
git commit -m "test(ik): add unit tests for IK chain configuration and constraints"
```

---

### Task 9: E2E Test for IK Toggle

Basic E2E test verifying IK can be toggled and gizmos appear.

**Files:**
- Create: `tests/e2e/ik-solver.spec.ts`

**Step 1: Write E2E test**

```typescript
import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

test.describe('IK Solver', () => {
  test.setTimeout(120_000);

  test('IK toggle button exists in pose editor', async ({ page }) => {
    await waitForApp(page);
    // Open pose editor: click Avatar & Body in activity bar, then toggle pose editor
    await page.click('.activity-bar-item[title="Avatar & Body"]');
    await page.waitForTimeout(300);

    // The pose editor toggle should be in the 3D viewport area
    // Press P to toggle pose editor (if that's the shortcut) or find the toggle
    await page.keyboard.press('p');
    await page.waitForTimeout(500);

    // Look for the IK toggle button
    const ikToggle = page.locator('.ik-toggle-btn');
    await expect(ikToggle).toBeVisible({ timeout: 5000 });
    await expect(ikToggle).toHaveText('FK Mode');
  });

  test('IK toggle switches mode', async ({ page }) => {
    await waitForApp(page);
    await page.keyboard.press('p');
    await page.waitForTimeout(500);

    const ikToggle = page.locator('.ik-toggle-btn');
    await expect(ikToggle).toBeVisible({ timeout: 5000 });

    // Click to enable IK
    await ikToggle.click();
    await page.waitForTimeout(300);
    await expect(ikToggle).toHaveText('IK Mode');
    await expect(ikToggle).toHaveClass(/active/);

    // Click to disable IK
    await ikToggle.click();
    await page.waitForTimeout(300);
    await expect(ikToggle).toHaveText('FK Mode');
  });
});
```

**Step 2: Run E2E tests**

Run: `npm run test:e2e -- tests/e2e/ik-solver.spec.ts`
Expected: Tests PASS (may need adjustments based on actual pose editor toggle mechanism)

**Step 3: Commit**

```bash
git add tests/e2e/ik-solver.spec.ts
git commit -m "test(ik): add E2E tests for IK toggle in pose editor"
```
