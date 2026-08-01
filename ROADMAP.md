# Roadmap

Vina is at **v0.11.0**. The core loop — import a pattern, sew it in 3D, drape it on an avatar — works end to end. This roadmap describes direction, not dates: priorities shift, and the [issue tracker](https://github.com/sssamuelll/vina/issues) is the source of truth. Larger efforts carry the `roadmap` label.

## Where we are

The beachhead is the professional patternmaker who already has a pattern and wants to see it in 3D. Today that path works:

- Import a **DXF/AAMA** pattern (the format CLO3D, Gerber, and Optitex export).
- Detect pieces, seams, notches, and grainlines.
- Sew pieces in the 3D viewport and watch them drape with a **WebGPU** cloth solver.
- Grade across a size run, nest for fabric consumption, and export a BOM or tech pack.
- Work alongside a **knowledge-grounded AI copilot** that can drive the same tools.

## Now

The work in flight — deepening the beachhead so the pattern that comes in gets treated well:

- **Real grading of imported patterns.** Today an imported DXF grades by proportional scaling, honestly labeled. Next is per-point grading — reading grade data the file carries, or letting the user author grade rules — so a size run reflects how each point actually moves.
- **Simulation you can trust.** Drape realism and stability under long-horizon simulation: the cloth should settle the way real fabric does, deterministically.
- **A capability registry.** A single source for the app's commands and panels so every new feature appears coherently in the menu, the command palette, and the agent's toolset — human and agent affordances stay in sync as the surface grows.

## Next

- **Robust import.** Handle the messy variety of real-world DXFs — different vendors, layer conventions, and grade-data encodings.
- **Coherent measurements.** One source of truth between the avatar, the size tables, and grading.
- **Production output.** Polish nesting, BOM, and tech-pack export toward genuinely factory-ready sheets.

## Later

The vision beyond the beachhead:

- **Editing and drafting, not just import.** From importing a pattern, to editing it parametrically, to drafting one from measurements — with the copilot as a real patternmaking partner, not a chatbot.
- **Collaboration.** Shared projects and review.
- **A shared library.** Open pattern and fabric assets the community can build on.

## Language

The application is Spanish-first, for professional patternmakers. Contributor documentation is English so the project is open worldwide, with a Spanish translation planned.
