# openclo — UX Vision

> Canonical UX direction. One page. Future UI decisions are checked against this document.

**Status:** Active (effective 2026-05-27)
**Supersedes (in vision, not yet in code):** `docs/specs/UX-DESIGN.md v0.7` — that document describes the prior persistent-panel layout; it remains the operational reference for surviving components but does not represent the target. As the redesign progresses, `UX-DESIGN.md` should be either revised to reflect this vision or marked deprecated.

---

## The principle

> **AI-first. Commands canonical. Menús sólo para discovery.**

The agent is the primary surface. ⌘K and the chat input are equivalent canonical entry points. Tools appear on demand, do their work, and disappear. Menus exist to teach users what exists — not to do work.

---

## Concrete rules

These are not preferences. They are constraints. A PR that violates one of these must explicitly justify the violation in its description.

1. **`UnifiedBarChat` is THE primary surface.** Text input + agent response. Always visible. Always reachable. Anything that pulls the user out of this loop is a UX regression.
2. **⌘K and the chat input are equivalent.** Both produce intents. Both invoke the agent. There is no "power-user shortcut" track separate from the "novice chat" track — they are the same track.
3. **Tools appear on demand.** When the agent invokes a tool — or when the user types a command that requires UI input — the relevant tool surface (overlay, in-context handles, small modal) appears. When the action completes or is cancelled, the tool surface disappears.
4. **No persistent toolbars.** No 2D toolbar pinned to a side. No 3D gizmo bar pinned to a corner. No always-visible piece list. The viewport is the canvas; everything else is ephemeral.
5. **No persistent sidebars.** Properties, layers, projects — none of these are visible by default. They appear when requested (by agent or user) and close when done.
6. **The viewport is the primary canvas.** It owns the screen. Agent + tools are servants to what happens on canvas.
7. **Menus exist for discovery only.** The LogoMenu (or any future menu chrome) lists what is *possible*, with each entry being a learn-this-exists affordance — not a do-this-now shortcut. The shortcut is ⌘K + describe the intent.
8. **One project in memory at a time.** No multi-project chrome. No tabs. No project switcher in the always-visible UI. If the user needs to switch, they ask the agent.
9. **The agent narrates, doesn't lecture.** Status updates are single updatable lines (not scrolling logs). The agent explains when asked, not preemptively.
10. **Reverse the CLO3D pattern.** Where CLO3D and Lectra present hundreds of always-visible tools to a professional who knows what they need, openclo presents one input and lets the user describe what they need.

---

## What this forbids

Decisions explicitly out of bounds under this vision:

- Adding a persistent toolbar "because the agent doesn't cover this yet". If the agent doesn't cover it, the agent gets the coverage. Toolbars are not a fallback.
- Treating ⌘K as an opt-in power feature. ⌘K is canonical; the chat input is its conversational equivalent.
- Replicating professional CAD menu hierarchies (File / Edit / View / Pattern / Tools / Window / Help expanded by default). Discovery-only chrome may exist but must be opt-in to expand, not opt-out to collapse.
- Property inspectors that follow the user's selection persistently. Selection-driven property surfaces appear only when the user (or agent) invokes them.
- Wizards for first-time onboarding that block the user from typing into the agent. If the agent is the surface, it is the onboarding.

---

## What this defers

- **Visual aesthetics** — typography, color palette, spacing, motion. Defer to dedicated visual critique (Iris Tane) once interaction model is locked.
- **Microcopy** — exact wording of agent messages, placeholder hints, chip labels. Calibrate empirically with User 1 sessions; refine with Solace Wren afterward.
- **Responsive / mobile layout** — desktop-first until at least one validated session with User 1 on desktop.
- **Internationalization** — Spanish hardcoded until the agentic loop is locked.
- **Theming / dark mode** — out of scope until base UX is validated.

---

## Why this document exists

The post-rediseño period (2026-Q2) shipped multiple LogoMenu and shell iterations without a written principle to check against. The result: `assignFabric` vs `setFabric` tool duplication, ~9,200 LOC of orphan UI, LogoMenu evolving toward File/Edit/View/Pattern menu density in contradiction with the agentic-CLO3D-reversion vision Samuel articulated.

This document is the principle. From 2026-05-27 forward, every UI PR is checked against the rules above. A PR that adds chrome must justify why the agent doesn't own that surface instead.

---

## References

- `docs/superpowers/specs/2026-05-27-mvp-v1-vision-validating-slice-design.md` — MVP v1 spec that this vision serves
- `docs/specs/UX-DESIGN.md v0.7` — prior persistent-panel layout (operational reference, not target)
- `docs/plans/2026-03-02-copilot-bridge-architecture-design.md` — copilot bridge + AgenticLoop architecture (the technical foundation enabling this vision)
- `CLAUDE.md` — project non-negotiables and audit ratifications
