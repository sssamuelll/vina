# OpenClo — UX/UI Design Spec

## Design Philosophy

**Charter risk:** "Curva de aprendizaje — interfaz demasiado técnica para diseñadores de moda tradicionales."

**Mitigation:** UX en terminología de modistería, no de ingeniería 3D. The user is a patronista, not a CAD engineer.

## Core Principle: Modistería, Not Engineering

| ❌ Engineering Term | ✅ OpenClo Term |
|---------------------|-----------------|
| NURBS curve | Curva (just "curve") |
| Tessellation | — (hidden from user) |
| Polygon mesh | — (hidden from user) |
| Constraint solver | — (hidden from user) |
| Translate/Rotate | Mover / Girar |
| Boolean operation | — (not exposed) |
| Node graph | — (not exposed in v1) |

The user sees: pattern pieces, seams, darts, fabrics, measurements. Everything else is implementation detail.

## Layout

### Desktop (≥768px)

```
┌─────────────────────────────────────────────────┐
│ Toolbar (tools + actions + view mode)            │
├──────────┬──────────────────┬───────────────┬────┤
│          │                  │               │    │
│  Chat    │   2D Editor      │  3D Viewport  │ P  │
│  Panel   │   (SVG canvas)   │  (Three.js)   │ r  │
│          │                  │               │ o  │
│  (280px) │   (flex)         │  (flex)       │ p  │
│          │                  │               │ s  │
│          │                  │               │    │
├──────────┴──────────────────┴───────────────┴────┤
│ Status bar (coordinates, zoom, piece count)       │
└──────────────────────────────────────────────────┘
```

- **Draggable dividers** between all panels
- **View modes:** 2D only | Split | 3D only (toggle or keyboard shortcut)
- **Chat panel:** collapsible to icon strip
- **Properties panel:** collapsible to 40px icon sidebar

### Mobile (<768px)

**Chat only.** No attempt to fit a CAD editor on a phone.

```
┌──────────────────┐
│ OpenClo    ⚙️    │
├──────────────────┤
│                  │
│  Chat messages   │
│                  │
│  [suggestions]   │
│                  │
├──────────────────┤
│ Type a message…  │
└──────────────────┘
```

Use cases: quick measurement checks, ask copilot questions, review project status.

## Tool Palette

| Icon | Tool | Shortcut | Description |
|------|------|----------|-------------|
| ↖ | Select | V | Click to select pieces, drag to move |
| ✒ | Pen | P | Draw outlines — click for corners, drag for curves |
| / | Line | L | Straight lines (darts, internal lines) |
| ▭ | Rectangle | R | Quick rectangular pieces |
| ⟡ | Seam | S | Connect edges between pieces |
| ⊥ | Notch | N | Add notch marks to edges |
| ↕ | Grainline | G | Set fabric grain direction |
| 📏 | Measure | M | Click two points to measure distance |
| ✋ | Hand | H | Pan the canvas |

## Interaction Patterns

### Drawing a Piece
1. Select Pen tool (P)
2. Click to place corner points
3. Drag while clicking to create smooth curves
4. Press Z or click start point to close shape
5. Piece appears in 2D editor AND 3D viewport simultaneously

### Connecting Seams
1. Select Seam tool (S)
2. Click edge on Piece A (highlights in green)
3. Click edge on Piece B (highlights in blue)
4. If lengths differ > 5%: warning toast ("Sisa 2cm más larga que manga — ¿ease o error?")
5. Seam created, visible as dashed line in 2D, constraint in 3D

### Editing Nodes
1. Double-click a piece outline
2. Anchor points appear as squares
3. Bezier handles appear as circles connected by lines
4. Drag anchor to move point
5. Drag handle to adjust curve
6. Click empty space to deselect

### Adding a Dart
1. Select piece
2. Select Line tool (or ask copilot: "añade pinza en busto")
3. Click dart start on edge, click dart apex, click dart end on edge
4. Dart appears as two fold lines
5. 3D mesh updates with fold

## Color System

```css
--bg-primary: #1a1a2e        /* workspace background */
--bg-secondary: #16213e      /* panel backgrounds */
--bg-tertiary: #0f3460       /* active/selected backgrounds */
--accent: #e94560            /* primary accent (tools, selections) */
--accent-secondary: #533483  /* secondary accent */
--text-primary: #eee         /* primary text */
--text-secondary: #aaa       /* secondary text */
--grid: rgba(255,255,255,0.05) /* grid lines */
--piece-outline: #fff        /* piece cut lines */
--piece-selected: #e94560    /* selected piece outline */
--seam-line: #4ecca3         /* seam connections */
--notch: #ff6b6b             /* notch marks */
--grainline: #ffd93d         /* grainline arrows */
```

## Feedback & Guidance

### Hint Text
Context-sensitive text at bottom of 2D editor:

| State | Hint |
|-------|------|
| Pen tool, no points | "Haz clic para empezar a dibujar" |
| Pen tool, drawing | "Clic = esquina, Arrastra = curva, Z = cerrar" |
| Select tool, piece hovered | "Clic para seleccionar, Doble clic para editar nodos" |
| Seam tool, no selection | "Selecciona el primer borde" |
| Seam tool, one edge selected | "Selecciona el segundo borde para crear costura" |
| Measure tool | "Clic en dos puntos para medir distancia" |

### Toasts
- Success: piece created, seam connected, file exported
- Warning: edge length mismatch, missing seam allowance
- Error: invalid operation, file parse error

### Empty State
First launch with no project:
- "Empieza dibujando una pieza con la herramienta Pluma (P)"
- "O genera un patrón base con el Copilot →"
- Quick-start templates: "Cuerpo base", "Falda", "Manga"

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| P | Pen tool |
| L | Line tool |
| R | Rectangle tool |
| S | Seam tool |
| N | Notch tool |
| G | Grainline tool |
| M | Measure tool |
| H | Hand (pan) tool |
| Delete/Backspace | Delete selected |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+S | Save project |
| Ctrl+E | Export DXF |
| 1 | 2D view |
| 2 | Split view |
| 3 | 3D view |
| Space | Toggle simulation |
| + / - | Zoom in/out |
| Ctrl+0 | Fit all in view |

## Accessibility

- All tools accessible via keyboard
- High contrast mode (toggle)
- Screen reader labels for tools and panels
- No color-only indicators (always include shape/text)
- Minimum touch target: 44px (mobile)
