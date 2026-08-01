# Vina Professional Tool System

This tool system is designed to match CLO3D's professional workflow, making it familiar to patronistas and fashion designers.

## Tool Categories (CLO3D Mapping)

### 2D Pattern Window Tools

#### Selection & Transform (`select`)
- **Select/Move** (V) — Select and move pieces/points
- **Transform** (T) — Scale, rotate selected elements

#### Drawing (`draw`)  
- **Pen Tool** (P) — Bezier curves (CLO3D: "Polygon")
- **Line Tool** (L) — Straight internal lines
- **Rectangle Tool** (R) — Quick rectangles
- **Trace Tool** (Y) — Trace along existing edges [Coming Soon]
- **Dart Tool** (D) — Create darts along edges [Coming Soon]
- **Circle/Curve Tool** — Curved internal shapes [Coming Soon]

#### Pattern Editing (`pattern`)
- **Scissors/Split** (C) — Split pattern piece along line [Coming Soon]
- **Mirror/Symmetric** (I) — Create symmetric copy [Coming Soon]

#### Sewing (`sewing`)
- **Seam** (S) — Connect edges (CLO3D: "Segment Sewing")
- **Free Sewing** — Sew without matching segments [Coming Soon]

#### Annotation (`annotation`)
- **Notch** (N) — Notch marks
- **Grainline** (G) — Grain direction
- **Measure** (M) — Distance and angle measurement

#### Navigation (`navigation`)
- **Hand/Pan** (H) — Pan canvas
- **Zoom** (Z) — Zoom tool

### 3D Garment Window Tools

#### Navigation (`3d-navigate`)
- **Camera** — Orbit/pan/zoom (default)

#### Arrangement (`3d-arrange`)
- **Arrangement Points** (A) — Position pattern pieces around avatar [Coming Soon]
- **Pin** — Pin cloth to avatar body [Coming Soon]

#### Editing (`3d-edit`)
- **Edit Mode** — Select/move in 3D

#### Avatar (`3d-avatar`)
- **Pose** — Joint manipulation
- **Avatar** — Avatar management and measurements

#### Simulation (`3d-simulation`)  
- **Simulate** (Space) — Start/stop/reset simulation [Coming Soon]

## Tool Options (CLO3D Style)

Each tool shows context-sensitive options in the options bar:

- **Pen**: smoothing, snap to grid, constrain angles (45°/90°)
- **Seam**: seam type, stitch length
- **Notch**: shape, size, count
- **Rectangle**: width, height, corner style
- **Scissors**: cut type, keep both sides [Coming Soon]
- **Measure**: show angle, cumulative distance
- **Pose**: sensitivity, constraint toggle
- **Simulate**: particle distance, iteration count, fabric preset [Coming Soon]

## Implementation Status

✅ **Implemented**: Core tools with full functionality
🚧 **Coming Soon**: Tools with placeholder UI and "Coming soon" activation messages

The professional tool set is complete for UI purposes - all tools appear in toolbars with proper CLO3D-style grouping and options. Missing functionality will be implemented in future phases.

## Usage

Tools are automatically registered on application startup. The registry system supports:

- Keyboard shortcuts matching CLO3D
- Context-sensitive options
- Professional grouping and separation
- Tool lifecycle hooks (onActivate/onDeactivate)

This creates a familiar environment for users transitioning from CLO3D to Vina.