# OpenClo — Testing Spec (v0.7)

## Current Coverage

### Unit Tests (Vitest) — 186 test files

The test suite has grown significantly from the initial 82 tests across 7 suites to 186 test files covering all major subsystems:

| Area | Test Files | What It Covers |
|------|-----------|----------------|
| `src/utils/` | 40+ | DXF parser/converter/export, cloth simulation, geometry, grading, nesting, seam allowance, formula engine, edit classifier |
| `src/store/` | 15+ | Redux slices (project, editor, simulation, collision body, camera), linked editing middleware, undo middleware |
| `src/copilot/` | 30+ | AgenticLoop, skill system, SkillBuilder, marketplace, memory, providers, tool execution |
| `src/components/` | 20+ | PatternEditor hooks, tool interactions, overlay rendering |
| `src/tools/` | 20+ | Tool definition schemas, handler execution |
| `src/hooks/` | 10+ | Custom React hooks |
| `src/workers/` | 5+ | Worker message protocols, solver integration |

### E2E Tests (Playwright)

Covers: grid rendering, pen tool (straight + curves), select, drag, delete, zoom, keyboard shortcuts, templates, undo/redo, measure tool, hint text, chat panel, properties panel, mobile layout, simulation controls.

## Testing Strategy

### Unit Tests — What to Test

**Always unit test:**
- Geometry calculations (outline generation, bounding box, offset curves)
- File format parsers and generators (DXF, PDF)
- Redux state transitions (slices, middleware, undo/redo)
- Copilot tool execution (tool handlers, result validation)
- Agentic loop behavior (meta-tools, action tools, iteration)
- Skill system (SkillBuilder, marketplace, validation)
- Template generators (measurements to correct PathCommands)
- Linked editing propagation (instance and symmetry modes)
- Edit classifier (dimension vs. topology classification)
- Utility functions

**Don't unit test:**
- React component rendering (E2E handles this)
- Three.js visual output (snapshot tests are brittle)
- CSS styling

### E2E Tests — What to Test

**Critical user flows:**
- Draw a piece, appears in 2D and 3D
- Edit nodes, piece shape changes
- Create seam, edges connected
- Import DXF, pieces appear
- Export DXF, valid file generated
- Save, Load, same state
- Undo/Redo chain
- Segment sewing workflow
- Topstitch application
- Linked editing propagation
- Simulation snapshot comparison
- Mobile: chat panel loads, no editor visible

### Integration Tests

**File format round-trips:**
- Export DXF, Import DXF, compare pieces (within tolerance)
- Create project, Export, Import, compare state

**Simulation stability:**
- Simple garment (4 pieces), simulate 500 frames, no NaN positions
- Garment on avatar, no vertices inside avatar after settle
- Seam constraints, sewn vertices stay within 0.1mm
- Multi-body collision, cloth drapes correctly on imported meshes

## Test Data

### Fixtures Directory

```
src/__tests__/fixtures/
├── simple-bodice.dxf        — 2-piece bodice (ASTM layers)
├── full-garment.dxf         — 6-piece dress (CLO3D export)
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
      - run: npm run test:e2e      # playwright
      - run: npm run bench         # performance
```

## Running Tests

```bash
npm run test          # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)
npx tsc --noEmit      # Type check
```
