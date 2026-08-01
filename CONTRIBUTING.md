# Contributing to Vina

Thanks for your interest in Vina. This guide gets you from clone to first PR.

## Prerequisites

- **Node.js 18+**
- **npm**
- Git
- **Rust + wasm-pack** — only if you modify the XPBD solver in `crates/xpbd-wasm`

## Setup

```bash
git clone https://github.com/sssamuelll/vina.git
cd vina
npm install
npm run dev
```

Open `http://localhost:5173`.

## Project structure

```
src/
├── components/        # React UI
│   ├── shell/             # AppShell + UnifiedBar (chat / commands / settings) + docks + ContextPanel
│   ├── PatternEditor/     # 2D SVG canvas + tool hooks
│   ├── Viewport3D/        # R3F 3D viewport, collision bodies, simulation
│   ├── PropertiesPanel/   # Selected-entity inspector
│   └── BottomPanel/       # Lazy sub-tabs: BOMTab, GradingTab, NestingTab, InspectorTab
├── copilot/           # AI copilot
│   ├── reasoning/bridge/  # AgenticLoop, meta-tools, domain bootstrap
│   ├── action/tools/      # Tool definitions the agent (and UI) call
│   ├── action/skills/     # Skill system (SkillBuilder, registry)
│   ├── knowledge/         # RAG knowledge base
│   ├── memory/            # Durable design memory
│   └── providers/         # LLM providers (Anthropic, OpenAI, Ollama)
├── store/             # Redux Toolkit slices + middleware
├── stores/            # Zustand state
├── utils/             # Core engines
│   ├── cloth/             # XPBD solver, triangle collision, fabric library
│   ├── cloth/gpu/         # WebGPU (TSL) solver
│   ├── dxf/               # DXF parser, converter, AAMA export
│   ├── grading/           # Multi-size scaling
│   ├── nesting/           # Bin-packing layout
│   └── seam/              # Seam allowance engine
├── types/             # Shared TypeScript types
└── workers/           # Web Workers (WASM + CPU solvers)

crates/
└── xpbd-wasm/         # Rust WASM cloth solver

docs/
├── specs/             # Architecture, simulation, testing specs
├── api/               # Engine API docs (DXF, grading, nesting, ...)
├── research/          # Cloth-simulation research, fabric calibration
├── reports/           # Closed-audit RFCs (read before touching a ratified area)
└── business/          # Strategy documents
```

## The commit gate

Run this before every commit. All three must pass:

```bash
npx tsc -b --noEmit && npm run test && npm run lint
```

Two things that trip people up:

- **Typecheck must be build mode: `npx tsc -b --noEmit`, not bare `tsc --noEmit`.** The root `tsconfig` has `"files": []`, so bare `tsc --noEmit` reports clean *vacuously* — it checks nothing. The pre-commit hook uses `-b`; match it.
- A **Husky pre-commit hook** runs the fast half automatically (`tsc -b` + ESLint on staged files, `--max-warnings=0`). It does **not** run the full test suite — that's on you before you push. Don't bypass the hook with `--no-verify`.

Other useful commands:

```bash
npm run test:watch    # Vitest in watch mode
npm run test:e2e      # Playwright end-to-end tests
npm run lint          # ESLint
```

The suite is ~6,000 unit tests across ~440 files, plus Playwright E2E.

## Code style

- **TypeScript strict** — no `any`, no unused variables.
- **JSDoc on exports** — document public functions and types.
- **Domain terminology** — use correct garment terms (see the glossary below).
- Functional components, hooks over classes.
- Keep files focused: one component or one engine per file.
- Use `newId()` from `src/utils/ids.ts` for entity IDs.

## Engine guidelines

Each engine in `src/utils/` is an independent module:

- **Pure TypeScript math** — no external dependencies in algorithm code.
- **Unit-tested** — see the neighboring `*.test.ts` for the pattern.
- **Single responsibility** — one engine, one concern (seam allowance, nesting, grading, ...).
- **Deterministic** — same input, same output, no side effects.
- Export pure functions, not classes, unless state is genuinely required.

## Adding things

- **A copilot tool** → add a definition under `src/copilot/action/tools/definitions/` (schema + execute handler returning a `ToolResult`) and register it; copy the shape of an existing tool.
- **A fabric preset** → append to `PHYSICAL_FABRIC_LIBRARY` in `src/utils/cloth/physicalFabric.ts` with realistic textile properties.
- **Cloth physics** → the Rust solver in `crates/xpbd-wasm/src/lib.rs` and the JS fallback in `src/utils/cloth/xpbdSolver.ts`. Rebuilding WASM copies **both** `xpbd_wasm.js` and `xpbd_wasm_bg.wasm` into `public/wasm/` — a JS-only copy silently falls back to CPU.

Areas with a closed audit (`docs/reports/`) have ratified conventions — read the relevant RFC before adding code there.

## PR process

1. **Fork** the repo.
2. **Branch** from `main` (`feat/your-feature` or `fix/your-fix`).
3. **Write tests** for new behavior — we practice test-first where we can.
4. **Run the gate** (`npx tsc -b --noEmit && npm run test && npm run lint`).
5. **Open a PR** with a clear description of what changed and why.

### Automated PR checks

`.github/workflows/pr-checks.yml` runs on every PR and **fails** if the PR's head SHA matches a recently merged PR — the cheapest guard against an accidental duplicate merge. If you intentionally re-apply a previously merged commit (e.g. after a revert), open a fresh PR with a new commit on top. The same workflow warns (non-blocking) when a branch name matches a recently merged PR but the SHA differs, so you can catch a stale re-push.

## Terminology

Use consistent garment terms across code, comments, and docs. The product UI is Spanish; these are the anchors:

| English | Español | Meaning |
|---------|---------|---------|
| Pattern piece | Pieza | A single flat shape cut from fabric |
| Seam | Costura | Where two pieces are sewn together |
| Seam allowance | Margen de costura | Extra fabric around the sewing line |
| Notch | Piquete | Alignment mark on a seam edge |
| Grainline | Hilo | Arrow showing fabric grain direction |
| Dart | Pinza | V-shaped fold for shaping |
| Grading | Escalado | Scaling a pattern across sizes |
| Nesting | Marcada | Arranging pieces to minimize fabric use |
| Topstitch | Pespunte | Decorative or structural visible stitch |
| Interfacing | Entretela | Stiffening layer fused to fabric |

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful, constructive, and inclusive.
