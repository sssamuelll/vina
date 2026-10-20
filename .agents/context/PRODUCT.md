# PRODUCT.md — Vina.ai

> DRAFT sintetizado 2026-07-16 desde docs/reports, memoria de proyecto y dirección de Samuel.
> Revisar y ajustar; no fue dictado en entrevista.

## Product Purpose

Browser-based garment CAD for professional patternmakers: import industrial DXF patterns,
edit them with real pattern-engineering tools (seams, darts, notches, grading), sew and
drape them on a 3D avatar with real-time XPBD cloth simulation, assisted by an AI copilot.
The DXF-in workflow is the beachhead; the long-term moat is grading. The engine must feel
trustworthy ("Unreal feel" north star) but the product is a working tool, not a demo.

## Users

Professional patternmakers (patronistas) and fashion engineers. Reference user: María,
a working patternmaker on a mid-size monitor, long sessions, deadline-driven. Expert in
pattern construction, NOT in 3D software or dev tools. Comes from Optitex / Gerber /
Lectra / CLO3D. Spanish-speaking first; the tool must be usable without reading docs.

## Register

product

## Brand & Tone

Minimalist, elegant, modern. A precision instrument (think quality CAD/instrumentation),
not a SaaS dashboard and not a gamer tool. Calm surfaces, restrained color, the work
(the pattern, the garment) is the protagonist — chrome recedes. Professional confidence
without hype. UI copy: plain, honest, task-first; user-facing messages through the catalog, in the person's language (en, es, de).

## Anti-references

- CLO3D / Marvelous Designer ribbon-density chrome (hundreds of visible buttons).
- Generic SaaS admin dashboards (card grids, hero metrics, gradient accents).
- Gamer/RGB aesthetics, neon glows, glassmorphism.
- AI-tool clichés (sparkle emoji buttons, purple-gradient "magic" branding).

## Strategic principles

- Complexity budget: professional depth via progressive disclosure (⌘K palette, docks,
  context panels), never via more permanent chrome.
- The 2D canvas is light "paper", the app chrome is dark Midnight Blue; the accent
  (indigo) is reserved for selection/seams and primary actions.
- Every surface must serve the patternmaker workflow: import → classify → edit → sew →
  drape → grade → export. Features that don't serve it don't get UI surface.
