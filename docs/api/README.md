# OpenClo API Reference

Core utility engines for parametric pattern design, grading, nesting, and exchange.

| Engine | Description | Docs |
|--------|-------------|------|
| **Seam Allowance** | Equidistant offset algorithm for generating seam allowance (margen de costura) around pattern pieces | [seam-allowance.md](./seam-allowance.md) |
| **DXF** | Import/export DXF files with AAMA/ASTM D6673 layer mapping for industry interoperability | [dxf.md](./dxf.md) |
| **Grading** | Size grading engine — rule-based and proportional scaling from XS to XXL | [grading.md](./grading.md) |
| **Formula** | Safe math expression evaluator for parametric pattern construction | [formula.md](./formula.md) |
| **Nesting** | Skyline bin-packing algorithm for optimal fabric layout (marker making) | [nesting.md](./nesting.md) |
| **OBJ Export** | Triangulated 3D mesh export via ear-clipping for pattern visualization | [export-obj.md](./export-obj.md) |

## Architecture

All engines live under `src/utils/` and are pure functions with no side effects (except browser download helpers). They share common types from `src/types/types.ts` (`Point2D`, `PathCommand`, `PatternPiece`).

```
src/utils/
├── seam/          # Seam allowance generation
├── dxf/           # DXF import/export (AAMA/ASTM)
├── grading/       # Size grading
├── formula/       # Formula evaluation
├── nesting/       # Fabric nesting/marker making
└── export/        # OBJ mesh export
```
