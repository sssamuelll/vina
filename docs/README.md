# Documentation

Navigation map for the `docs/` tree. Start with the root [README](../README.md) and [CONTRIBUTING](../CONTRIBUTING.md); this index covers everything deeper.

> **On freshness:** the code is the ultimate source of truth. The RFCs in [`reports/`](./reports/) are the *ratified* decisions for closed areas — read the relevant one before adding code there. The `specs/` describe design intent and can lag the implementation. `plans/`, `issues/`, and `audits/` are a historical record of how we got here, not current instructions.

## Start here

- [PROJECT-CHARTER.md](./PROJECT-CHARTER.md) — vision, scope, objectives, stakeholders
- [specs/ARCHITECTURE.md](./specs/ARCHITECTURE.md) — stack, data model, module map, key decisions

## Specs — design intent

- [specs/CORE-ENGINE.md](./specs/CORE-ENGINE.md) — pattern representation, meshing, virtual assembly
- [specs/SIMULATION.md](./specs/SIMULATION.md) — cloth physics, collision, Web Worker architecture
- [specs/FILE-FORMATS.md](./specs/FILE-FORMATS.md) — DXF/AAMA, CLO3D, Gerber import/export
- [specs/AI-COPILOT.md](./specs/AI-COPILOT.md) — agent protocol, tool schema, fashion terminology
- [specs/UX-DESIGN.md](./specs/UX-DESIGN.md) — layout, interactions, design tokens
- [specs/TESTING.md](./specs/TESTING.md) — unit / E2E / integration strategy, fixtures, CI

## Engine API

- [api/](./api/) — per-engine API docs: [DXF](./api/dxf.md), [grading](./api/grading.md), [nesting](./api/nesting.md), [seam allowance](./api/seam-allowance.md), [formula](./api/formula.md), [OBJ export](./api/export-obj.md)

## Research

- [research/](./research/) — cloth-simulation research and fabric-calibration notes behind the physics

## Historical record

Not current instructions — the trail of decisions and plans behind the current code:

- [reports/](./reports/) — **ratified RFCs** from closed audits. Authoritative for the areas they cover; read before touching those.
- [plans/](./plans/) — design and implementation plans (dated).
- [issues/](./issues/) — expanded issue write-ups.
- [audits/](./audits/) — point-in-time audits.
- [superpowers/](./superpowers/) — specs and plans authored through the superpowers workflow.

## Strategy

- [business/](./business/) — positioning, open-source strategy, and pitch material.
