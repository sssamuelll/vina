# Status Bar Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real-time simulation metrics (solver tier, particle count, frame time, SDF status) to the StatusBar component.

**Architecture:** Read simulation state from Redux `simulationSlice`, render conditional status items on the right side of the existing StatusBar. Use color-coded dots to indicate frame time health.

**Tech Stack:** React, Redux (useSelector), CSS

---

## Task 1: Add CSS Styles for Status Indicators

**Files:**
- Modify: `src/components/StatusBar/StatusBar.css:39` (append)

**Step 1: Add status dot and indicator styles**

Append to `StatusBar.css`:

```css
/* ─── Simulation Status Indicators ─── */

.status-item-with-dot {
  display: flex;
  align-items: center;
  padding: 0 8px;
  white-space: nowrap;
  line-height: var(--statusbar-height);
}

.status-item-with-dot:hover {
  background: rgba(255, 255, 255, 0.12);
  cursor: default;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 5px;
  flex-shrink: 0;
}

.status-dot.healthy {
  background: #3794ff;
}

.status-dot.warning {
  background: #cca700;
}

.status-dot.critical {
  background: #f14c4c;
}

.status-dot.inactive {
  background: #6b6b6b;
}
```

**Step 2: Verify CSS syntax**

Run: `npm run build 2>&1 | head -20`
Expected: No CSS errors

**Step 3: Commit**

```bash
git add src/components/StatusBar/StatusBar.css
git commit -m "style(StatusBar): add simulation status indicator styles"
```

---

## Task 2: Add Simulation Metrics to StatusBar Component

**Files:**
- Modify: `src/components/StatusBar/StatusBar.tsx`

**Step 1: Add simulation state selector**

After line 7, add:

```tsx
const simulation = useSelector((s: RootState) => s.simulation);
```

**Step 2: Add helper functions and constants**

After the `toolLabels` object (line 19), add:

```tsx
// Solver tier display labels
const solverLabels: Record<string, string> = {
  webgpu: 'GPU',
  wasm: 'Wasm',
  'cpu-worker': 'CPU',
  'neural-drape': 'Neural',
};

// Format particle count: 1234 → "1.2k"
const formatCount = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

// Determine frame time health class
const getFrameHealth = (ms: number): string => {
  if (ms > 100) return 'critical';
  if (ms > 33) return 'warning';
  return 'healthy';
};

// Simulation status
const isSimulating = simulation.simulationState === 'running';
const solverLabel = solverLabels[simulation.solverTier] || null;
```

**Step 3: Add simulation status items to JSX**

In the `status-bar-right` div, insert these items BEFORE the SA item (before line 35):

```tsx
{/* Simulation metrics */}
{solverLabel && (
  <>
    <span className="status-item-with-dot" title={`Solver: ${simulation.solverTier}`}>
      <span className={`status-dot ${isSimulating ? 'healthy' : 'inactive'}`} />
      {solverLabel}
    </span>
    <span className="status-separator" />
  </>
)}
{simulation.particleCount > 0 && (
  <>
    <span className="status-item" title={`${simulation.particleCount} particles`}>
      {formatCount(simulation.particleCount)}
    </span>
    <span className="status-separator" />
  </>
)}
{isSimulating && simulation.frameTimeMs > 0 && (
  <>
    <span className="status-item-with-dot" title="Frame time (target: <16.7ms for 60fps)">
      <span className={`status-dot ${getFrameHealth(simulation.frameTimeMs)}`} />
      {simulation.frameTimeMs.toFixed(1)}ms
    </span>
    <span className="status-separator" />
  </>
)}
{simulation.bodyCollision && (
  <>
    <span className="status-item" title="Body collision (SDF) enabled">
      SDF ✓
    </span>
    <span className="status-separator" />
  </>
)}
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 5: Visual verification**

Run: `npm run dev`
- Open browser to localhost
- Start a simulation (add pieces, press Space)
- Verify status bar shows: solver tier, particle count, frame time
- Enable body collision, verify "SDF ✓" appears

**Step 6: Commit**

```bash
git add src/components/StatusBar/StatusBar.tsx
git commit -m "feat(StatusBar): add simulation metrics display (#160)"
```

---

## Task 3: Final Verification and Close Issue

**Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Final commit and push**

```bash
git push origin main
```

**Step 4: Close issue**

```bash
gh issue close 160 --comment "Implemented in commits. Status bar now shows solver tier, particle count, frame time with health indicator, and SDF status."
```

---

## Success Criteria Checklist

- [ ] Solver tier shows with colored dot when active (GPU/Wasm/CPU/Neural)
- [ ] Particle count displays in compact format (1.2k)
- [ ] Frame time shows with color-coded health (green/yellow/red)
- [ ] SDF status shows when body collision enabled
- [ ] All existing status items still work
- [ ] No TypeScript or build errors
- [ ] All tests pass
