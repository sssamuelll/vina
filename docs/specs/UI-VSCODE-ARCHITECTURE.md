# OpenClo UI Architecture — VS Code Reference

## Layout Structure

```
┌──────────────────────────────────────────────────────────────────┐
│                    Title Bar (44px)                               │
│  Logo │ File Edit View │ ◄► Undo/Redo │ [Command Palette ⌘K] │  │
├────┬─────────────────────────────────────────────────────┬───────┤
│    │                                                     │       │
│ A  │              Editor Area                            │  S    │
│ c  │     ┌──────────────┬──────────────┐                │  e    │
│ t  │     │   2D Editor  │  3D Viewport │                │  c    │
│ i  │     │              │              │                │  o    │
│ v  │     │              │              │                │  n    │
│ i  │     │              │              │                │  d    │
│ t  │     └──────────────┴──────────────┘                │  a    │
│ y  │                                                     │  r    │
│    │                                                     │  y    │
│ B  ├─────────────────────────────────────────────────────┤       │
│ a  │              Panel (bottom, collapsible)            │  S    │
│ r  │  Copilot │ Problems │ Output │ Nesting Preview     │  i    │
│    │                                                     │  d    │
│ 48 │                                                     │  e    │
│ px │                                                     │  b    │
│    │                                                     │  a    │
│    │                                                     │  r    │
├────┴─────────────────────────────────────────────────────┴───────┤
│                    Status Bar (22px)                              │
│  Ready │ Pieces: 3 │ Tool: Pen │ mm │ 100% │ Ln 0 Col 0        │
└──────────────────────────────────────────────────────────────────┘
```

## 1. Activity Bar (left, 48px)

Vertical icon strip — each icon opens a different **sidebar view**.
Only one sidebar view active at a time (click again to collapse).

| Icon | View | Description |
|------|------|-------------|
| 📐 | **Pattern Explorer** | Piece list, layers, piece properties |
| 🔍 | **Search / Command** | Quick search pieces, tools, commands |
| 📏 | **Measurements** | Body measurements (44 fields), avatar config |
| 📐 | **Grading** | Size selector, grade rules, multi-size preview |
| 🧵 | **Nesting** | Fabric settings, auto-layout, utilization |
| 📁 | **File Browser** | Import/export DXF, PDF, OBJ, save/load |
| 🤖 | **AI Copilot** | Chat panel (current CopilotPanel) |
| ⚙️ | **Settings** | Preferences, units, grid, snap |

## 2. Command Palette (⌘K / Ctrl+Shift+P)

Fuzzy search over ALL commands. Categories:

- **Tools**: Select, Pen, Line, Rectangle, Seam, Notch, Grainline, Measure, Hand
- **View**: Toggle 2D/3D/Split, Toggle Sidebar, Toggle Panel, Zoom In/Out/Fit
- **File**: New Project, Open, Save, Import DXF, Export DXF AAMA, Export PDF, Export OBJ
- **Edit**: Undo, Redo, Delete Piece, Duplicate Piece
- **Pattern**: Add Template, Run Nesting, Grade to Size
- **Copilot**: Open Chat, Clear History

Format: `> Category: Command Name (shortcut)`

## 3. Primary Sidebar (left, 280px, collapsible)

Content changes based on Activity Bar selection.
Each view has its own **toolbar strip** at the top (view-specific actions).

### Pattern Explorer View
```
┌─ PATTERN EXPLORER ──── [+] [↓] [⚙] ─┐
│                                        │
│ ▾ Pieces                               │
│   ├─ Front Bodice          👁 🔒      │
│   ├─ Back Bodice           👁 🔒      │
│   ├─ Sleeve (x2)           👁 🔒      │
│   └─ Collar                👁 🔒      │
│                                        │
│ ▾ Properties                           │
│   Name: Front Bodice                   │
│   SA: 10mm                             │
│   Notch: T-notch                       │
│   Grainline: 90°                       │
│   Mirror: ✕                            │
│                                        │
│ ▾ Seams                                │
│   Front→Back (shoulder)                │
│   Front→Sleeve (armhole)               │
└────────────────────────────────────────┘
```

### Measurements View
```
┌─ MEASUREMENTS ──── [📋] [↻] ─────────┐
│                                        │
│ Avatar: Default Male                   │
│ Height: [180] cm                       │
│                                        │
│ ▸ Head & Neck (4)                      │
│ ▾ Torso (12)                           │
│   Chest:        [96] cm               │
│   Waist:        [82] cm               │
│   Hip:          [94] cm               │
│   ...                                  │
│ ▸ Arms (8)                             │
│ ▸ Legs (10)                            │
│ ▸ Misc (10)                            │
└────────────────────────────────────────┘
```

### Grading View
```
┌─ GRADING ──── [▶ Apply] [↺] ─────────┐
│                                        │
│ Base Size: [M] ▾                       │
│ Target: [XS] [S] [M] [L] [XL] [XXL]  │
│                                        │
│ Method: ● Rule-based ○ Proportional   │
│                                        │
│ ▾ Grade Rules                          │
│   Chest Δ: [-8] [-4] [0] [+4] [+8]   │
│   Waist Δ: [-6] [-3] [0] [+3] [+6]   │
│   Hip Δ:   [-6] [-3] [0] [+3] [+6]   │
│                                        │
│ Preview: All sizes overlaid in editor  │
└────────────────────────────────────────┘
```

### Nesting View
```
┌─ NESTING ──── [▶ Run] [⚙] ───────────┐
│                                        │
│ Fabric                                 │
│   Width:  [1500] mm                    │
│   Length: [3000] mm                    │
│   Margin: [10] mm                      │
│                                        │
│ Settings                               │
│   Gap:      [5] mm                     │
│   Rotation: [90°] ▾                    │
│   Mirror:   [✕]                        │
│   Sort:     [Area ↓] ▾                │
│                                        │
│ ─── Result ───                         │
│   Sheets: 1                            │
│   Utilization: 78.3%                   │
│   Unplaced: 0                          │
└────────────────────────────────────────┘
```

## 4. Secondary Sidebar (right, optional)

Reserved for future: Properties detail, 3D material editor, etc.
Initially: not implemented.

## 5. Bottom Panel (collapsible, 200px default)

Tabbed panel at bottom, like VS Code's terminal/problems panel.

| Tab | Content |
|-----|---------|
| **Copilot** | AI chat (moved from right column) |
| **Problems** | Validation warnings (open seams, missing grainline) |
| **Output** | Export log, import log |
| **Nesting Preview** | Visual fabric layout preview |

## 6. Status Bar (bottom, 22px)

```
Ready │ Pieces: 3 │ Tool: Pen (P) │ SA: 10mm │ mm │ Zoom: 100% │ Grid: On
```

## 7. Context Menus

Right-click on pieces, canvas, sidebar items → contextual actions.

## Design Tokens (VS Code-aligned)

```css
:root {
  /* Activity Bar */
  --activitybar-bg: #1e1e1e;
  --activitybar-fg: #858585;
  --activitybar-fg-active: #ffffff;
  --activitybar-indicator: #4a9eff;
  --activitybar-width: 48px;

  /* Sidebar */
  --sidebar-bg: #252526;
  --sidebar-header-bg: #252526;
  --sidebar-header-fg: #bbbbbb;
  --sidebar-fg: #cccccc;
  --sidebar-width: 280px;

  /* Editor */
  --editor-bg: #1e1e1e;
  --editor-fg: #d4d4d4;

  /* Panel (bottom) */
  --panel-bg: #1e1e1e;
  --panel-header-bg: #252526;
  --panel-tab-active-border: #4a9eff;
  --panel-height: 200px;

  /* Status Bar */
  --statusbar-bg: #007acc;
  --statusbar-fg: #ffffff;
  --statusbar-height: 22px;

  /* Title Bar */
  --titlebar-bg: #323233;
  --titlebar-fg: #cccccc;
  --titlebar-height: 44px;

  /* Command Palette */
  --palette-bg: #252526;
  --palette-fg: #cccccc;
  --palette-input-bg: #3c3c3c;
  --palette-highlight: #4a9eff;
  --palette-shadow: 0 8px 30px rgba(0,0,0,0.5);

  /* General */
  --focus-border: #4a9eff;
  --separator: #3a3a3a;
  --icon-size: 20px;
  --font-family: 'Inter', -apple-system, sans-serif;
  --font-size: 13px;
  --font-size-small: 11px;
}
```

## Implementation Plan

### Phase 1: Shell (structural)
1. ActivityBar component (48px left strip with icons)
2. PrimarySidebar component (280px, content switches by active view)
3. CommandPalette component (⌘K overlay)
4. StatusBar component (22px bottom)
5. BottomPanel component (tabbed, collapsible)
6. Refactor Workspace to compose these

### Phase 2: View Content
7. PatternExplorerView (piece list + properties)
8. MeasurementsView (44 fields grouped)
9. GradingView (size selector + rules)
10. NestingView (fabric settings + run)
11. FileExplorerView (import/export)
12. Move CopilotPanel to BottomPanel tab

### Phase 3: Polish
13. Context menus (right-click)
14. Keyboard shortcuts for all commands
15. Transitions and animations
16. Responsive: collapse sidebar on narrow screens
