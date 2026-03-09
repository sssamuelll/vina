# UI Layout Cleanup — Design Document

**Date:** 2026-03-09
**Issue:** Technical debt in panel layout — duplicated controls, too many panels competing for screen space
**Goal:** Eliminate all duplicated UI controls, reduce visual noise, maximize viewport area

---

## Problem

The current layout has **7 sections** in the Properties Panel (right) and **11 sidebar views** (left), with significant duplication:

| Feature | Properties Panel (right) | Sidebar (left) | Duplication |
|---|---|---|---|
| Project save/open/new | PROJECT section | — | Partial (Explorer has piece list) |
| File import/export | EXPORT section (DXF/PDF) | FileExplorerView (571 lines, all formats) | Yes |
| Simulation controls | SimulationProperties (38 lines, stub) | SimulationView (234 lines, full) | Yes — stub vs real |
| Avatar/body | AvatarProperties (135 lines) | MeasurementsView (181 lines) + AvatarView (120 lines) | Triple duplicate |
| Grading | — | GradingView in views/ (299 lines) AND Sidebar/ (181 lines) | Code duplicate |
| Display settings | DISPLAY section (SA, snap) | SettingsView (195 lines, has same + more) | Yes |

Additionally, the copilot opens by default (`copilotOpen: true`), consuming ~340px on first load.

## Design

### Principle

**Right panel = contextual** (what you're editing now).
**Left sidebar = global** (project-level navigation and tools).
**Zero duplicates.**

### Properties Panel (Right) — 3 Sections Only

| Section | Content | Visible When |
|---|---|---|
| **PIECE** | Name, seam allowance, SA presets, mirror, linked editing, notches, delete | Piece selected |
| **MATERIAL** | Fabric grid, tint, UV transform, texture slots | Piece selected |
| **SEAMS** | Seam list with type and delete | Seams exist |

**Empty state:** "Select a piece to edit" (replaces current 7-section wall).

**Removed from right panel:**
- PROJECT → Moves to sidebar Explorer view
- AVATAR → Moves to sidebar Avatar view
- DISPLAY → Moves to sidebar Settings view
- EXPORT → Moves to sidebar Explorer view (FileExplorerView already has it)
- SIMULATION → Moves to sidebar Simulation view (was already a 38-line stub)

**Collapsed icon strip:** Only shows Piece (Box), Seams (Minus) — matching the 3 sections.

### Activity Bar — 6+3 Icons

**Top (6 workflow items):**

| # | Icon | ID | Label | Content |
|---|---|---|---|---|
| 1 | FileText | `explorer` | Project | Merge: project name/save/open/new + PatternExplorerView piece list + FileExplorerView import/export |
| 2 | User | `avatar` | Avatar & Body | Merge: AvatarProperties (model upload, dress form toggle) + MeasurementsView (all body measurements) |
| 3 | Play | `simulation` | Simulation | Keep existing SimulationView (quality, particle distance, fabric, stats) |
| 4 | SlidersHorizontal | `parametric` | Parametric | Keep existing ParametricView (template variables, sliders) |
| 5 | Layers | `grading` | Grading | Keep ONE GradingView (delete the 181-line Sidebar duplicate, use the 299-line views/ version) |
| 6 | History | `history` | History | Keep existing HistoryView |

**Bottom (3 system items):**

| # | Icon | ID | Label | Content |
|---|---|---|---|---|
| 1 | Plug | `plugins` | Plugins | Keep existing, absorb Skills Marketplace content |
| 2 | Settings | `settings` | Settings | Keep existing SettingsView + absorb DISPLAY section (SA width, snap to grid) |
| 3 | MessageSquare | `copilot` | Copilot | New — opens copilot panel via Activity Bar instead of floating tab |

**Removed from Activity Bar:**
- `nesting` — Placeholder feature, not implemented enough to justify an icon. Can be accessed via command palette when ready.
- `files` — Merged into `explorer` (Project)
- `measurements` — Merged into `avatar` (Avatar & Body)
- `skills` — Merged into `plugins`

### Copilot — Minimized by Default

**Changes to `layoutSlice.ts`:**
- Default `copilotOpen: false` (was `true`)
- Default `resetLayout()` also sets `copilotOpen: false`
- Add copilot icon to Activity Bar bottom — clicking it toggles `copilotOpen`
- Existing keyboard shortcuts (Ctrl+Alt+K) still work

**Collapsed state:** Small tab on right edge with MessageSquare icon + "Chat" label (existing behavior, just now the default).

### SidebarView Type Cleanup

```typescript
// Before: 11 views
type SidebarView = 'explorer' | 'measurements' | 'grading' | 'nesting' | 'files'
                 | 'plugins' | 'skills' | 'settings' | 'simulation' | 'parametric' | 'history';

// After: 8 views
type SidebarView = 'explorer' | 'avatar' | 'grading' | 'simulation'
                 | 'parametric' | 'history' | 'plugins' | 'settings';
```

### Merged View Details

**Explorer (Project) View** — merges 3 sources:
1. Project header: name input, Save/Open/New buttons (from PropertiesPanel PROJECT section)
2. Piece list with visibility/lock toggles (from PatternExplorerView)
3. Import/Export section: DXF, PDF, SVG, GLB, OBJ buttons (from FileExplorerView)

**Avatar & Body View** — merges 3 sources:
1. Avatar mode toggle: Dress Form vs 3D Model (from AvatarProperties)
2. Model upload: GLB/GLTF file picker, URL input (from AvatarProperties)
3. Body measurements: all measurement inputs organized by category (from MeasurementsView)

### Files to Modify

| File | Action |
|---|---|
| `src/store/layoutSlice.ts` | Change `copilotOpen` default to `false` |
| `src/components/ActivityBar/ActivityBar.tsx` | Reduce to 6+3 items, add copilot toggle |
| `src/components/PropertiesPanel/PropertiesPanel.tsx` | Remove PROJECT, AVATAR, DISPLAY, EXPORT, SIMULATION sections |
| `src/components/PropertiesPanel/PropertiesPanel.css` | Remove unused styles |
| `src/components/Sidebar/Sidebar.tsx` | Update view routing, remove dead views |
| `src/components/views/ProjectView.tsx` | Create — merged Explorer + Files + Project |
| `src/components/views/AvatarBodyView.tsx` | Create — merged Avatar + Measurements |
| `src/components/Sidebar/GradingView.tsx` | Delete (use views/GradingView.tsx instead) |
| `src/components/Sidebar/AvatarView.tsx` | Delete (merged into AvatarBodyView) |
| `src/components/PropertiesPanel/AvatarProperties.tsx` | Delete (merged into AvatarBodyView) |
| `src/components/PropertiesPanel/SimulationProperties.tsx` | Delete (sidebar SimulationView is the real one) |

### Files NOT Modified

- `src/components/Sidebar/SimulationView.tsx` — Already the complete version, stays as-is
- `src/components/Sidebar/ParametricView.tsx` — Stays as-is
- `src/components/views/HistoryView.tsx` — Stays as-is
- `src/components/views/SettingsView.tsx` — Minor addition (absorb SA width + snap toggle)
- `src/components/PropertiesPanel/PieceProperties.tsx` — Stays as-is
- `src/components/PropertiesPanel/MaterialTab.tsx` — Stays as-is

### Testing

**E2E tests to update:**
- `materials.spec.ts` — May reference MATERIAL section positioning
- Any test referencing Properties Panel sections that are being removed

**New E2E test:**
- Verify copilot starts minimized
- Verify Activity Bar has correct icon count
- Verify Properties Panel only shows PIECE/MATERIAL/SEAMS when piece selected
- Verify Project view has save/open/new + piece list + export

### Visual Before/After

**Before (current):**
```
[ActivityBar 48px][Sidebar 0-300px][Copilot 340px][  Viewport  ][Properties 280px]
 11 icons          11 views         always open     shrunk        7 sections
```

**After:**
```
[ActivityBar 48px][Sidebar 0-300px][        Viewport (maximized)        ][Properties 280px]
 9 icons           8 views          copilot minimized, opens on demand    3 sections
```

**Net viewport gain:** ~340px horizontal (copilot closed) + cleaner right panel.
