## Summary

Build a headless CLI mode and scripting API for batch processing garments — automated rendering, export, grading, and simulation without the graphical UI. Enables production pipelines, CI/CD integration, and custom automation.

**Competitive context:** CLO3D offers C++ SDK and Python scripting for automation. Browzwear has similar automation APIs. Enterprise customers need batch processing for seasonal line-ups.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §15 — API & Automation](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Headless CLI
- Run OpenClo without browser UI (Node.js headless mode)
- Commands: `openclo render`, `openclo export`, `openclo simulate`, `openclo grade`
- Load project file → execute operation → output result
- Suitable for server-side rendering farms

### JavaScript Scripting API
- Programmatic access to all garment operations
- `import { Project, Piece, Simulation } from '@openclo/core'`
- Script examples: batch colorway rendering, automated grading, mass export
- REPL mode for interactive scripting

### Batch Processing
- Process multiple garments from directory or manifest file
- Parallel processing with configurable concurrency
- Progress reporting and error logging
- Output: rendered images, exported files, BOM data per garment

---

## Implementation Strategy

1. Extract core engine from React UI into standalone `@openclo/core` package
2. Headless rendering via `node-canvas` + `gl` (headless WebGL)
3. CLI framework: `commander.js` or `yargs` for argument parsing
4. API design: Promise-based async operations
5. Worker pool for parallel batch processing

## Acceptance Criteria

- [ ] `openclo render project.oclo --output front.png` renders without UI
- [ ] `openclo export project.oclo --format gltf` exports 3D file
- [ ] JavaScript API provides programmatic garment manipulation
- [ ] Batch mode processes multiple projects from manifest
- [ ] Headless mode works in Node.js server environment
