# CLO3D Keyboard Shortcuts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remap all OpenClo keyboard shortcuts to match CLO3D industry standard for professional pattern maker compatibility.

**Architecture:** Update `shortcut` field in tool definitions, add Shift+Key handlers in `useKeyboardShortcuts.ts` for displaced tools, update StatusBar labels and shortcut help.

**Tech Stack:** React, TypeScript, tool registry pattern

---

## Task 1: Update Primary Tool Shortcuts (A, Z, V, H, S, E, B)

**Files:**
- Modify: `src/tools/definitions/transform.tsx:28` — change `t` → `a`
- Modify: `src/tools/definitions/select.tsx:26` — change `v` → `z`
- Modify: `src/tools/definitions/editCurve.tsx` — change `a` → `v`
- Modify: `src/tools/definitions/pen.tsx:26` — change `p` → `h`
- Modify: `src/tools/definitions/rectangle.tsx` — change `r` → `s`
- Modify: `src/tools/definitions/circle.tsx` — add `e`
- Modify: `src/tools/definitions/seam.tsx` — change `s` → `b`

**Step 1: Update transform.tsx**

Change line 28 from:
```tsx
shortcut: 't',
```
to:
```tsx
shortcut: 'a',
```

**Step 2: Update select.tsx**

Change line 26 from:
```tsx
shortcut: 'v',
```
to:
```tsx
shortcut: 'z',
```

**Step 3: Update editCurve.tsx**

Change shortcut from `'a'` to `'v'`

**Step 4: Update pen.tsx**

Change line 26 from:
```tsx
shortcut: 'p',
```
to:
```tsx
shortcut: 'h',
```

**Step 5: Update rectangle.tsx**

Change shortcut from `'r'` to `'s'`

**Step 6: Update circle.tsx**

Add shortcut field:
```tsx
shortcut: 'e',
```

**Step 7: Update seam.tsx**

Change shortcut from `'s'` to `'b'`

**Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 9: Commit**

```bash
git add src/tools/definitions/transform.tsx src/tools/definitions/select.tsx src/tools/definitions/editCurve.tsx src/tools/definitions/pen.tsx src/tools/definitions/rectangle.tsx src/tools/definitions/circle.tsx src/tools/definitions/seam.tsx
git commit -m "refactor(shortcuts): update primary tool shortcuts to CLO3D standard (A,Z,V,H,S,E,B)"
```

---

## Task 2: Update Secondary Tool Shortcuts (G, I, M, C, D)

**Files:**
- Modify: `src/tools/definitions/internalShape.tsx` — add `g`
- Modify: `src/tools/definitions/trace.tsx` — add `i`
- Modify: `src/tools/definitions/freeSewing.tsx` — add `m`
- Modify: `src/tools/definitions/editConstrain.tsx` — add `c`
- Modify: `src/tools/definitions/dart.tsx` — change `d` → `d` (keep, but remove conflict)

**Step 1: Update internalShape.tsx**

Add shortcut field:
```tsx
shortcut: 'g',
```

**Step 2: Update trace.tsx**

Add shortcut field:
```tsx
shortcut: 'i',
```

**Step 3: Update freeSewing.tsx**

Add shortcut field:
```tsx
shortcut: 'm',
```

**Step 4: Update editConstrain.tsx**

Add shortcut field:
```tsx
shortcut: 'c',
```

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 6: Commit**

```bash
git add src/tools/definitions/internalShape.tsx src/tools/definitions/trace.tsx src/tools/definitions/freeSewing.tsx src/tools/definitions/editConstrain.tsx
git commit -m "refactor(shortcuts): add CLO3D shortcuts for secondary tools (G,I,M,C)"
```

---

## Task 3: Remove Conflicting Shortcuts

**Files:**
- Modify: `src/tools/definitions/grainline.tsx` — remove `g` shortcut
- Modify: `src/tools/definitions/measure.tsx` — remove `m` shortcut
- Modify: `src/tools/definitions/notch.tsx` — remove `n` shortcut
- Modify: `src/tools/definitions/line.tsx` — remove `l` shortcut
- Modify: `src/tools/definitions/hand.tsx` — remove `h` shortcut
- Modify: `src/tools/definitions/zoom.tsx` — remove `z` shortcut
- Modify: `src/tools/definitions/duplicate.tsx` — remove `d` shortcut (will use Ctrl+D)
- Modify: `src/tools/definitions/mirror.tsx` — remove `i` shortcut
- Modify: `src/tools/definitions/copyPattern.tsx` — remove `c` shortcut (will use Ctrl+C)

**Step 1: Update grainline.tsx**

Remove or comment out shortcut line:
```tsx
// shortcut removed - use Shift+G
```

**Step 2: Update measure.tsx**

Remove shortcut (will be Shift+M)

**Step 3: Update notch.tsx**

Remove shortcut (will be Shift+N)

**Step 4: Update line.tsx**

Remove shortcut (will be Shift+L)

**Step 5: Update hand.tsx**

Remove shortcut (pan via middle mouse)

**Step 6: Update zoom.tsx**

Remove shortcut (zoom via scroll wheel)

**Step 7: Update duplicate.tsx**

Remove shortcut (will be Ctrl+D)

**Step 8: Update mirror.tsx**

Remove shortcut (I is now Trace)

**Step 9: Update copyPattern.tsx**

Remove shortcut (C is now Edit Curvature)

**Step 10: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 11: Commit**

```bash
git add src/tools/definitions/grainline.tsx src/tools/definitions/measure.tsx src/tools/definitions/notch.tsx src/tools/definitions/line.tsx src/tools/definitions/hand.tsx src/tools/definitions/zoom.tsx src/tools/definitions/duplicate.tsx src/tools/definitions/mirror.tsx src/tools/definitions/copyPattern.tsx
git commit -m "refactor(shortcuts): remove conflicting shortcuts from displaced tools"
```

---

## Task 4: Add Shift+Key Handlers for Displaced Tools

**Files:**
- Modify: `src/hooks/useKeyboardShortcuts.ts`

**Step 1: Add Shift+M for Measure**

After the existing Shift+S handler (~line 183), add:

```tsx
// Shift+M — Measure tool (displaced from M)
if (shift && key === 'm' && !ctrl) {
  dispatch(setActiveTool('measure' as any));
  dispatch(setActiveTool2D('measure'));
  return;
}
```

**Step 2: Add Shift+N for Notch**

```tsx
// Shift+N — Notch tool (displaced from N)
if (shift && key === 'n' && !ctrl) {
  dispatch(setActiveTool('notch' as any));
  dispatch(setActiveTool2D('notch'));
  return;
}
```

**Step 3: Add Shift+G for Grainline**

After existing Shift+G handler, modify to use grainline tool:

```tsx
// Shift+G — Grainline tool (displaced from G)
if (shift && key === 'g' && !ctrl) {
  dispatch(setActiveTool('grainline' as any));
  dispatch(setActiveTool2D('grainline'));
  return;
}
```

**Step 4: Add Shift+L for Line**

```tsx
// Shift+L — Line tool (displaced from L)
if (shift && key === 'l' && !ctrl) {
  dispatch(setActiveTool('line' as any));
  dispatch(setActiveTool2D('line'));
  return;
}
```

**Step 5: Add F for Focus Zoom**

```tsx
// F — Focus zoom (fit selection in view)
if (key === 'f' && !ctrl && !shift) {
  // Dispatch fit-to-view action (handled by editor)
  const event = new CustomEvent('focusZoom');
  window.dispatchEvent(event);
  return;
}
```

**Step 6: Update CLO3D tool shortcuts in the no-modifier section**

Replace the existing tool shortcut handlers (after line 194) with CLO3D mappings:

```tsx
// ─── CLO3D Tool shortcuts (no modifiers) ────────────────────────────
if (ctrl || shift || e.altKey) return;

// A — Transform Pattern
if (key === 'a') {
  dispatch(setActiveTool('transform' as any));
  dispatch(setActiveTool2D('transform'));
  return;
}

// Z — Edit Pattern (Select)
if (key === 'z') {
  dispatch(setActiveTool('select' as any));
  dispatch(setActiveTool2D('select'));
  return;
}

// V — Edit Curve Point
if (key === 'v') {
  dispatch(setActiveTool('editCurve' as any));
  dispatch(setActiveTool2D('editCurve'));
  return;
}

// C — Edit Curvature
if (key === 'c') {
  dispatch(setActiveTool('editConstrain' as any));
  dispatch(setActiveTool2D('editConstrain'));
  return;
}

// H — Polygon (Pen)
if (key === 'h') {
  dispatch(setActiveTool('pen' as any));
  dispatch(setActiveTool2D('pen'));
  return;
}

// S — Rectangle
if (key === 's') {
  dispatch(setActiveTool('rectangle' as any));
  dispatch(setActiveTool2D('rectangle'));
  return;
}

// E — Ellipse (Circle)
if (key === 'e') {
  dispatch(setActiveTool('circle' as any));
  dispatch(setActiveTool2D('circle'));
  return;
}

// G — Internal Polygon/Line
if (key === 'g') {
  dispatch(setActiveTool('internalShape' as any));
  dispatch(setActiveTool2D('internalShape'));
  return;
}

// I — Trace
if (key === 'i') {
  dispatch(setActiveTool('trace' as any));
  dispatch(setActiveTool2D('trace'));
  return;
}

// B — Edit Sewing (Seam)
if (key === 'b') {
  dispatch(setActiveTool('seam' as any));
  dispatch(setActiveTool2D('seam'));
  return;
}

// M — Free Sewing
if (key === 'm') {
  dispatch(setActiveTool('freeSewing' as any));
  dispatch(setActiveTool2D('freeSewing'));
  return;
}

// D — Dart
if (key === 'd') {
  dispatch(setActiveTool('dart' as any));
  dispatch(setActiveTool2D('dart'));
  return;
}
```

**Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 8: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts
git commit -m "feat(shortcuts): add CLO3D keyboard handlers and Shift+Key for displaced tools"
```

---

## Task 5: Update Shortcut Help Map

**Files:**
- Modify: `src/hooks/useKeyboardShortcuts.ts` — update `_shortcutMap` array

**Step 1: Replace the _shortcutMap array**

Find the `_shortcutMap = [...]` assignment (~line 242) and replace with:

```tsx
_shortcutMap = [
  // Simulation
  { key: 'Space', label: 'Toggle Simulation', category: 'Simulation', action: () => {} },
  { key: 'Space', shift: true, label: 'Simulate Hi-Res', category: 'Simulation', action: () => {} },

  // 2D Pattern Tools (CLO3D)
  { key: 'A', label: 'Transform Pattern', category: '2D Tools', action: () => {} },
  { key: 'Z', label: 'Edit Pattern (Select)', category: '2D Tools', action: () => {} },
  { key: 'V', label: 'Edit Curve Point', category: '2D Tools', action: () => {} },
  { key: 'C', label: 'Edit Curvature', category: '2D Tools', action: () => {} },
  { key: 'X', label: 'Add Point / Split', category: '2D Tools', action: () => {} },
  { key: 'H', label: 'Polygon (Pen)', category: '2D Tools', action: () => {} },
  { key: 'S', label: 'Rectangle', category: '2D Tools', action: () => {} },
  { key: 'E', label: 'Ellipse', category: '2D Tools', action: () => {} },
  { key: 'G', label: 'Internal Shape', category: '2D Tools', action: () => {} },
  { key: 'I', label: 'Trace', category: '2D Tools', action: () => {} },
  { key: 'D', label: 'Dart', category: '2D Tools', action: () => {} },

  // Sewing Tools
  { key: 'B', label: 'Edit Sewing', category: 'Sewing', action: () => {} },
  { key: 'M', label: 'Free Sewing', category: 'Sewing', action: () => {} },
  { key: 'B', ctrl: true, label: 'Reverse Sewing', category: 'Sewing', action: () => {} },

  // 3D Tools
  { key: 'Q', label: 'Select/Move (3D)', category: '3D Tools', action: () => {} },
  { key: 'W', label: 'Pin', category: '3D Tools', action: () => {} },
  { key: 'F', label: 'Focus Zoom', category: '3D Tools', action: () => {} },

  // Displaced Tools (Shift+Key)
  { key: 'M', shift: true, label: 'Measure', category: '2D Tools', action: () => {} },
  { key: 'N', shift: true, label: 'Notch', category: '2D Tools', action: () => {} },
  { key: 'G', shift: true, label: 'Grainline', category: '2D Tools', action: () => {} },
  { key: 'L', shift: true, label: 'Line', category: '2D Tools', action: () => {} },

  // Selection & Edit
  { key: 'Escape', label: 'Deselect / Cancel', category: 'Selection', action: () => {} },
  { key: 'A', ctrl: true, label: 'Select All', category: 'Selection', action: () => {} },
  { key: 'Delete', label: 'Delete Selected', category: 'Edit', action: () => {} },
  { key: 'Z', ctrl: true, label: 'Undo', category: 'Edit', action: () => {} },
  { key: 'Z', ctrl: true, shift: true, label: 'Redo', category: 'Edit', action: () => {} },
  { key: 'S', ctrl: true, label: 'Save', category: 'File', action: () => {} },

  // View
  { key: 'S', shift: true, label: 'Toggle Seam Allowance', category: 'View', action: () => {} },
  { key: 'F10', label: 'Snapshot 3D', category: 'View', action: () => {} },
  { key: 'F', ctrl: true, label: 'Reset 3D Arrangement', category: 'View', action: () => {} },
];
```

**Step 2: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts
git commit -m "docs(shortcuts): update shortcut help map with CLO3D mappings"
```

---

## Task 6: Update StatusBar Tool Labels

**Files:**
- Modify: `src/components/StatusBar/StatusBar.tsx`

**Step 1: Update toolLabels object**

Replace the `toolLabels` object (~line 10) with:

```tsx
const toolLabels: Record<string, string> = {
  // CLO3D 2D Tools
  select: 'Edit Pattern (Z)',
  transform: 'Transform (A)',
  editCurve: 'Edit Curve (V)',
  editConstrain: 'Edit Curvature (C)',
  pen: 'Polygon (H)',
  rectangle: 'Rectangle (S)',
  circle: 'Ellipse (E)',
  scissors: 'Split (X)',
  internalShape: 'Internal Shape (G)',
  trace: 'Trace (I)',
  dart: 'Dart (D)',
  // Sewing
  seam: 'Edit Sewing (B)',
  freeSewing: 'Free Sewing (M)',
  // Displaced (Shift+Key)
  measure: 'Measure (Shift+M)',
  notch: 'Notch (Shift+N)',
  grainline: 'Grainline (Shift+G)',
  line: 'Line (Shift+L)',
  // 3D
  camera: 'Camera (Q)',
  pin: 'Pin (W)',
  // Legacy names for backwards compat
  hand: 'Hand',
  zoom: 'Zoom',
};
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/StatusBar/StatusBar.tsx
git commit -m "feat(StatusBar): update tool labels with CLO3D shortcut hints"
```

---

## Task 7: Final Verification and Testing

**Step 1: Run full test suite**

Run: `npm run test -- --run`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Manual testing checklist**

Run: `npm run dev`

Test each shortcut:
- [ ] A → Transform tool activates
- [ ] Z → Select tool activates
- [ ] V → Edit Curve tool activates
- [ ] C → Edit Curvature tool activates
- [ ] H → Pen (Polygon) tool activates
- [ ] S → Rectangle tool activates
- [ ] E → Circle (Ellipse) tool activates
- [ ] G → Internal Shape tool activates
- [ ] I → Trace tool activates
- [ ] B → Seam (Edit Sewing) tool activates
- [ ] M → Free Sewing tool activates
- [ ] D → Dart tool activates
- [ ] X → Scissors tool activates
- [ ] Q → 3D Camera tool activates
- [ ] W → Pin tool activates
- [ ] Shift+M → Measure tool activates
- [ ] Shift+N → Notch tool activates
- [ ] Shift+G → Grainline tool activates
- [ ] Shift+L → Line tool activates
- [ ] ? → Shortcut help shows CLO3D mappings
- [ ] StatusBar shows correct shortcuts

**Step 4: Push and close issue**

```bash
git push origin main
gh issue close 139 --comment "Implemented CLO3D keyboard shortcut standard. All primary shortcuts (A/Z/V/C/X/H/S/E/G/I/B/M/D/Q/W) now match CLO3D. Displaced tools accessible via Shift+Key (Shift+M/N/G/L)."
```

---

## Success Criteria Checklist

- [ ] All CLO3D primary shortcuts work (A, Z, V, C, X, H, S, E, G, I, B, M, D, Q, W)
- [ ] All displaced tools work via Shift+Key (Shift+M, Shift+N, Shift+G, Shift+L)
- [ ] No shortcut conflicts (each key maps to exactly one action)
- [ ] ShortcutHelp (?) shows accurate CLO3D mappings
- [ ] StatusBar shows correct shortcut hints
- [ ] All tests pass
- [ ] Build succeeds
