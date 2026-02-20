# OpenClo — Testing Spec

## Current Coverage (v0.4)

### Unit Tests (Vitest) — 82 tests, 7 suites

| Suite | Tests | What It Covers |
|-------|-------|----------------|
| `utils.test.ts` | 4 | pathToSVG conversion, constants |
| `patternTemplates.test.ts` | 18 | All 8 generators, scaling, internal consistency |
| `exportDXF.test.ts` | 9 | DXF header, layers, bezier approximation, multi-piece |
| `exportPDF.test.ts` | 9 | PDF structure, operators, curves, colors |
| `protocol.test.ts` | 8 | buildCopilotContext, bounds calculation, history |
| `commandExecutor.test.ts` | 11 | All command types + error handling |
| `store.test.ts` | 23 | projectSlice, editorSlice, undoMiddleware |

### E2E Tests (Puppeteer) — 16 suites

Covers: grid rendering, pen tool (straight + curves), select, drag, delete, zoom, keyboard shortcuts (7 keys), templates, undo/redo, measure tool, hint text, chat panel, properties panel, mobile layout.

## Testing Strategy

### Unit Tests — What to Test

**Always unit test:**
- Geometry calculations (outline generation, bounding box, offset curves)
- File format parsers and generators (DXF, PDF, ZPRJ)
- Redux state transitions (slices, undo/redo middleware)
- Command executor (AI command → state change)
- Template generators (measurements → correct PathCommands)
- Utility functions

**Don't unit test:**
- React component rendering (E2E handles this)
- Three.js visual output (snapshot tests are brittle)
- CSS styling

### E2E Tests — What to Test

**Critical user flows:**
- Draw a piece → appears in 2D and 3D
- Edit nodes → piece shape changes
- Create seam → edges connected
- Import DXF → pieces appear
- Export DXF → valid file generated
- Save → Load → same state
- Undo/Redo chain
- Mobile: chat panel loads, no editor visible

### Integration Tests (needed for v0.5+)

**File format round-trips:**
- Export DXF → Import DXF → compare pieces (within tolerance)
- Create project → Export .zprj → Import .zprj → compare state
- Import CLO3D .zprj → pieces have correct names, positions, seam allowances

**Simulation stability:**
- Simple garment (4 pieces) → simulate 500 frames → no NaN positions
- Garment on avatar → no vertices inside avatar after settle
- Seam constraints → sewn vertices stay within 0.1mm

## Test Data

### Fixtures Directory

```
src/__tests__/fixtures/
├── simple-bodice.dxf        — 2-piece bodice (ASTM layers)
├── full-garment.dxf         — 6-piece dress (CLO3D export)
├── clo3d-sample.zprj        — real CLO3D project file
├── gerber-sample.zip        — real AccuMark export
├── edge-cases/
│   ├── empty.dxf            — valid DXF, no entities
│   ├── no-layers.dxf        — entities without layer assignment
│   ├── splines-only.dxf     — SPLINE entities (no polylines)
│   └── mixed-units.dxf      — INSUNITS=1 (inches)
└── expected-output/
    ├── simple-bodice.json   — expected parsed result
    └── full-garment.json    — expected parsed result
```

### Performance Benchmarks

Run with `npm run bench`:

| Benchmark | Target | Measurement |
|-----------|--------|-------------|
| Parse 10-piece DXF | < 50ms | Time to PatternPiece[] |
| Generate DXF (20 pieces) | < 100ms | Time to DXF string |
| Triangulate 1 piece | < 10ms | Time to triangle mesh |
| Full meshing pipeline (10 pieces) | < 100ms | Time to all meshes |
| Simulation frame (1000 vertices) | < 8ms | Time for 1 physics step |

## CI Pipeline

```yaml
# .github/workflows/test.yml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test          # vitest
      - run: npm run test:e2e      # puppeteer
      - run: npm run bench         # performance
```

Currently only deploy workflow exists. Test workflow needed.
