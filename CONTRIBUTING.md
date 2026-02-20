# Contributing to OpenClo

Thanks for your interest in OpenClo! This guide will get you up and running.

## Prerequisites

- **Node.js 18+**
- **npm** or **pnpm**
- Git

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
├── components/     # React UI components (editor, viewport, panels)
├── utils/          # Core engines (seam allowance, nesting, grading, DXF, PDF...)
├── store/          # Redux Toolkit slices
├── types/          # TypeScript type definitions
docs/
├── specs/          # Architecture, roadmap, file format specs
```

## Running Tests

```bash
npx vitest run          # 82 unit tests
npx vitest run --watch  # watch mode
```

E2E tests use Puppeteer — see `e2e/` directory.

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

## Engine Development Guidelines

Each engine in `src/utils/` is an independent module:

- **No external dependencies** for algorithm code — pure TypeScript math
- **Must have unit tests** — see existing `*.test.ts` files for patterns
- **Single responsibility** — one engine, one concern (e.g., seam allowance, nesting, grading)
- **Deterministic** — same input → same output, no side effects
- Export pure functions, not classes (unless state is truly needed)

Current engines: seam allowance, nesting (bin packing), grading, formula, DXF parser/exporter, PDF exporter, OBJ exporter.

## Terminology Guide

Use consistent terminology across code, comments, and docs:

| English | Español | Description |
|---------|---------|-------------|
| Pattern piece | Pieza | A single flat shape to be cut from fabric |
| Seam | Costura | Where two pieces are sewn together |
| Notch | Muesca | Alignment mark on a seam edge |
| Grainline | Hilo | Arrow showing fabric grain direction |
| Seam allowance | Margen de costura | Extra fabric around the sewing line |
| Grading | Escalado | Scaling a pattern across sizes |
| Dart | Pinza | V-shaped fold for shaping |
| Bodice | Corpiño | Upper body pattern block |

## Code of Conduct

Be respectful, constructive, and inclusive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
