# Contributing to OpenClo

Thanks for your interest in OpenClo! This guide will get you up and running.

## Prerequisites

- **Node.js 18+**
- **npm** or **pnpm**
- Git
- **Rust + wasm-pack** (only if modifying the XPBD solver)

## Setup

```bash
git clone https://github.com/sssamuelll/openclo.git
cd openclo
npm install
npm run dev
```

Open `http://localhost:5180`

## Project Structure

```
src/
├── components/        # React UI components
│   ├── shell/             # AppShell + UnifiedBar (chat/commands/settings) + TopBar + FloatingToolbar + FloatingControls3D + ContextPanel
│   ├── DisplayBar2D/      # 2D context toolbar (toggles, render modes)
│   ├── PatternEditor/     # 2D SVG canvas + tool hooks
│   ├── Viewport3D/        # R3F 3D viewport, collision bodies, snapshots
│   ├── Toolbar2D/         # 2D tool buttons
│   ├── Toolbar3D/         # 3D tool buttons
│   └── BottomPanel/       # Lazy sub-tabs (BOMTab, GradingTab, InspectorTab, NestingTab) loaded into ContextPanel
├── copilot/           # AI copilot system
│   ├── reasoning/bridge/  # AgenticLoop, meta-tools, domain bootstrap
│   ├── action/skills/     # Skill system (SkillBuilder, marketplace, registry)
│   ├── memory/            # Durable design memory
│   └── providers/         # LLM providers (Anthropic, OpenAI, Ollama)
├── tools/             # Tool definitions (45 tools)
│   └── definitions/       # Individual tool schemas + handlers
├── store/             # Redux Toolkit slices
│   ├── collisionBodySlice.ts  # Multi-body collision state
│   ├── simulationSlice.ts     # Simulation + snapshots
│   ├── cameraSlice.ts         # 3D camera presets
│   └── linkedEditingMiddleware.ts  # Symmetric propagation
├── utils/             # Core engines
│   ├── cloth/             # XPBD solver, triangle collision, fabric library
│   ├── dxf/               # DXF parser, converter, AAMA export
│   ├── geometry/          # Geometry extraction + utilities
│   ├── grading/           # Multi-size scaling
│   ├── nesting/           # Bin packing layout
│   └── seam/              # Seam allowance engine
├── types/             # TypeScript type definitions
└── workers/           # Web Workers (WASM + CPU solvers)

crates/
└── xpbd-wasm/         # Rust WASM cloth solver

docs/
├── specs/             # Architecture, roadmap, simulation, testing specs
├── api/               # API documentation (DXF, grading, nesting, etc.)
├── research/          # Cloth simulation research, fabric calibration
└── business/          # Strategy and pitch documents
```

## Running Tests

```bash
npx vitest run          # Unit tests (186 test files)
npx vitest run --watch  # Watch mode
npm run test:e2e        # E2E tests (Playwright)
npx tsc --noEmit        # Type check
```

## Code Style

- **TypeScript strict** — no `any`, no unused variables
- **JSDoc on all exports** — document public functions and types
- **Domain terminology** — use correct garment/pattern terms (see below)
- Functional components, hooks over classes
- Keep files focused — one component or engine per file

## PR Process

1. **Fork** the repo
2. **Branch** from `main` (`feat/your-feature` or `fix/your-fix`)
3. **Write tests** for new functionality
4. **Run** `npx vitest run` — all tests must pass
5. **Open PR** with a clear description of what and why

### Automated PR checks

- `.github/workflows/pr-checks.yml` runs on every PR open / synchronize / reopen and **fails** if the PR's head SHA matches a recently merged PR. This is the cheapest check that would have caught the #590 = #591 duplicate merge (same head ref + SHA, merged nine hours apart). If you intentionally re-apply a previously merged commit (e.g. after a revert), close the existing PR and open a new one with a fresh commit on top.
- The same workflow emits a non-blocking warning if the head **branch name** matches a recently merged PR's branch but the SHA differs — verify it is a deliberate follow-up, not an accidental re-push of a stale branch.

## Engine Development Guidelines

Each engine in `src/utils/` is an independent module:

- **No external dependencies** for algorithm code — pure TypeScript math
- **Must have unit tests** — see existing `*.test.ts` files for patterns
- **Single responsibility** — one engine, one concern (e.g., seam allowance, nesting, grading)
- **Deterministic** — same input, same output, no side effects
- Export pure functions, not classes (unless state is truly needed)

Current engines: seam allowance, nesting (bin packing), grading, formula, DXF parser/converter/exporter, PDF exporter, OBJ exporter, cloth simulation (XPBD), triangle collision, edit classifier, geometry utilities.

## Adding a Tool

1. Create a definition file in `src/tools/definitions/yourTool.tsx`
2. Define the tool schema with name, shortcut, icon, and options
3. Implement the execute handler
4. Register in the tool registry
5. Add tests

## Adding a Fabric Preset

1. Edit `src/utils/cloth/physicalFabric.ts`
2. Add to `PHYSICAL_FABRIC_LIBRARY` array with realistic textile properties

## Terminology Guide

Use consistent terminology across code, comments, and docs:

| English | Espanol | Description |
|---------|---------|-------------|
| Pattern piece | Pieza | A single flat shape to be cut from fabric |
| Seam | Costura | Where two pieces are sewn together |
| Notch | Muesca | Alignment mark on a seam edge |
| Grainline | Hilo | Arrow showing fabric grain direction |
| Seam allowance | Margen de costura | Extra fabric around the sewing line |
| Grading | Escalado | Scaling a pattern across sizes |
| Dart | Pinza | V-shaped fold for shaping |
| Bodice | Corpino | Upper body pattern block |
| Topstitch | Pespunte | Decorative/structural visible stitch line |

## Code of Conduct

Be respectful, constructive, and inclusive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
