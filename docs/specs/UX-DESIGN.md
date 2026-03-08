# OpenClo — UX/UI Design Spec (v0.7)

## Design Philosophy

**Charter risk:** "Curva de aprendizaje — interfaz demasiado tecnica para disenadores de moda tradicionales."

**Mitigation:** UX en terminologia de modisteria, no de ingenieria 3D. The user is a patronista, not a CAD engineer.

## Core Principle: Modisteria, Not Engineering

| Engineering Term | OpenClo Term |
|------------------|--------------|
| NURBS curve | Curva (just "curve") |
| Tessellation | (hidden from user) |
| Polygon mesh | (hidden from user) |
| Constraint solver | (hidden from user) |
| Translate/Rotate | Mover / Girar |
| Boolean operation | (not exposed) |
| Node graph | (not exposed in v1) |

The user sees: pattern pieces, seams, darts, fabrics, measurements. Everything else is implementation detail.

## Layout

### Desktop (>= 768px)

```
+---------------------------------------------------+
| Toolbar (tools + actions + view mode)              |
+----------+------------------+---------------+------+
|          |                  |               |      |
|  Chat    |   2D Editor      |  3D Viewport  |  P   |
|  Panel   |   (SVG canvas)   |  (Three.js)   |  r   |
|          |                  |               |  o   |
|  (280px) |   (flex)         |  (flex)       |  p   |
|          |                  |               |  s   |
|          |  [Display Bar]   |  [SnapshotBar]|      |
+----------+------------------+---------------+------+
| Status bar (coordinates, zoom, piece count)        |
+---------------------------------------------------+
```

- **Draggable dividers** between all panels
- **View modes:** 2D only | Split | 3D only (toggle or keyboard shortcut)
- **Chat panel:** collapsible to icon strip
- **Properties panel:** collapsible to 40px icon sidebar
- **Display Bar 2D:** Floating toolbar with toggles for seam allowance, piece names, line lengths, grainlines, sewing lines, and render modes (textured, translucent, wireframe)
- **Snapshot Bar:** A/B/C comparison UI in 3D viewport

### Mobile (<768px)

**Chat only.** No attempt to fit a CAD editor on a phone.

```
+------------------+
| OpenClo          |
+------------------+
|                  |
|  Chat messages   |
|                  |
|  [suggestions]   |
|                  |
+------------------+
| Type a message...+
+------------------+
```

## Tool Palette (45 Tools)

### Core Drawing Tools

| Icon | Tool | Shortcut | Description |
|------|------|----------|-------------|
| Select | Select | V | Click to select pieces, drag to move |
| Pen | Pen | P | Draw outlines (click = corners, drag = curves) |
| Line | Line | L | Straight lines (darts, internal lines) |
| Rectangle | Rectangle | R | Quick rectangular pieces |
| Circle | Circle | C | Circular shapes |
| Hand | Hand | H | Pan the canvas |
| Zoom | Zoom | Z | Zoom in/out |

### Sewing & Assembly Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Seam | S | Connect edges between pieces |
| Segment Sewing | N | Multi-seam type (standard, french, flat-felled, overlock) |
| Free Sewing | - | Free-form sewing path |
| Notch | - | Add notch marks to edges (7 types) |

### Pattern Modification Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Scissors (Split) | X | Split pattern pieces |
| Merge | J | Merge adjacent pieces |
| Mirror | - | Mirror pattern pieces |
| Dart | - | Add/modify darts |
| Edit Curve | - | Modify bezier curves |
| Edit Constrain | - | Apply geometric constraints |
| Grainline | G | Set fabric grain direction |
| Elastic | - | Apply elastic constraints |

### Decoration & Annotation Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Topstitch Edit | - | Edit existing topstitch lines |
| Topstitch Free | - | Free-form topstitch |
| Topstitch Seamline | - | Topstitch along seam lines |
| Topstitch Segment | - | Topstitch along segments |
| Text Annotation | - | Add text labels |
| Internal Shape | - | Internal construction lines |

### Measurement & Utility Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Measure | M | Click two points to measure distance (mm/cm/inches) |
| Grading | - | Multi-size pattern scaling |
| Seam Allowance | - | Apply seam allowance offset |
| Flatten | - | Flatten 3D to 2D |

### 3D Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Simulate | Space | Toggle cloth simulation |
| Camera | - | 8 view presets (front/back/left/right/top/bottom/3-quarter) |
| Pin | - | Pin fabric in 3D |
| Pose | - | Avatar pose control |
| Avatar | - | Avatar configuration |
| Transform | - | 3D transform controls |
| Edit 3D | - | Direct 3D editing |

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
4. If lengths differ > 5%: warning toast
5. Seam created with stable edge-name reference

### Segment Sewing
1. Select Segment Sewing tool (N)
2. Select seam type: standard, french, flat-felled, or overlock
3. Click segments to connect
4. Seam properties automatically configured per type

### Linked Editing
1. Select two pattern pieces
2. Link them as "instance" (identical) or "symmetry" (mirrored)
3. Edit one piece — changes automatically propagate to the partner

### Topstitching
1. Select one of 4 topstitch modes (edit, free, seamline, segment)
2. Draw or select the stitch path
3. Topstitch overlay renders in real-time on the pattern

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
| Segment sewing tool | "Selecciona segmentos para coser" |
| Measure tool | "Clic en dos puntos para medir distancia" |
| Topstitch tool | "Selecciona un borde o dibuja una linea de pespunte" |

### Toasts
- Success: piece created, seam connected, file exported
- Warning: edge length mismatch, missing seam allowance
- Error: invalid operation, file parse error

### Empty State
First launch with no project:
- "Empieza dibujando una pieza con la herramienta Pluma (P)"
- "O genera un patron base con el Copilot"
- Quick-start templates: "Cuerpo base", "Falda", "Manga"

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| P | Pen tool |
| L | Line tool |
| R | Rectangle tool |
| S | Seam tool |
| N | Segment sewing tool |
| G | Grainline tool |
| M | Measure tool |
| H | Hand (pan) tool |
| X | Scissors (split) tool |
| J | Merge tool |
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
