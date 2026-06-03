# Dock Tooltips (why-here, directional) — Side Docks Redesign, Slice 5

**Date:** 2026-06-03
**Branch:** `feat/canvas-2d-redesign`
**Surface:** #4 of the redesign — the side docks (this slice: rich, directional, why-here tooltips on dock items)
**Source:** `openclo_redesign/side docks/.../DESIGN-NOTES.md` §5 ("Tooltips")
**Status:** Design approved, ready for implementation plan

---

## 1. Context (one line)

The dock items (2D tools, 3D affordances, kept 📌, auto ✦) currently rely on the native browser `title=` attribute: unstyled, non-directional (the browser decides placement), no color coding, no reliable second line. The handoff's §5 wants a richer hover affordance — line 1 `name · shortcut`, line 2 (only for badged items) "why it's here" — that flies out **toward the canvas** so it never covers the dock or leaves the viewport. A suitable component already exists (`ToolTooltip`) but is orphaned. This slice resurrects it into a shared home and wires it across the docks.

## 2. Goal

Give every dock item a custom hover tooltip:

- **Line 1:** the item's name, plus its keyboard shortcut as a `<kbd>` badge when one exists.
- **Line 2 (only for badged items):** a short "why it's here" line, color-coded — blue for a user-pinned (📌) item, violet for a stage-suggested (✦) item.
- **Direction:** the tooltip appears on the canvas-facing side of the dock — left dock → tooltip to the **right**; right dock → tooltip to the **left** — so it never overlaps the dock or spills off-screen.

Out of scope: panel-routing-by-side (its own slice), tooltips on non-dock controls, and any real usage-frequency ranking (the auto suggestions remain the static stage map of slices 3a/3c — the copy reflects this honestly).

## 3. The shared tooltip component

`ToolTooltip` already implements everything needed: a 500 ms hover delay, portal rendering (escapes the dock's `overflow`), `position: 'left' | 'right'`, and a `name` + `shortcut` (`<kbd>`, via `formatShortcut`) header plus an optional `description` line. Today it lives at `src/components/Toolbar3D/ToolTooltip.tsx` and is imported **only** by the orphaned (unmounted) `Toolbar3D.tsx`.

**Relocate it to a shared home:** move `ToolTooltip.tsx` and its `ToolTooltip.css` from `src/components/Toolbar3D/` to `src/components/shell/` (the docks' home). Update the single import in the orphaned `Toolbar3D.tsx` to the new path so the project still type-checks (do not delete Toolbar3D — that is a separate orphan-cleanup decision). No behavior change to the relocated component beyond the one extension below.

**One extension — `descriptionTone`:** add an optional prop

```ts
descriptionTone?: 'pin' | 'auto';
```

When set, the `.tool-tooltip-desc` element gets an extra modifier class (`tool-tooltip-desc--pin` / `tool-tooltip-desc--auto`) so the line-2 text can be tinted to match the badges exactly: `--pin` → `var(--accent)` (the blue the `.dock__badge--pin` 📌 uses, `Dock.css:101`), `--auto` → `var(--dock-auto)` (the violet `#a78bfa` the `.dock__badge--auto` ✦ and `.dock__tool--auto` use, `Dock.css:102/75`). When unset, the description renders in its existing default gray (`#999`; used nowhere in this slice — fixed tools have no description — but kept for the component's generality). The current `description` prop stays a plain `string`. (The tooltip's own dark surface — `#1a1a1a` bg — is unchanged; it matches the dark dock chrome, and both `--accent` and `--dock-auto` are already shown legibly on that chrome by the badges.)

The component's existing props (`name`, `shortcut?`, `description?`, `hasSubTools?`, `position?`, `children`) are otherwise unchanged. `hasSubTools` is not used by the docks (no hold-to-expand variants here).

## 4. Wiring per surface

The wrapper pattern is the same everywhere: wrap the existing button element as the `children` of a `ToolTooltip`, pass `name`/`shortcut`/`description`/`descriptionTone`/`position`, and **remove the now-redundant native `title=`** from the wrapped button. **Keep each button's `aria-label`** unchanged — the accessible name must not change (existing tests query buttons by accessible name; see §7).

### 4.1 `Dock.tsx` (the 2D dock — always left)

Each of the 7 tools from `dock2dTools.ts` (`{ id, icon, label, shortcut }`) is wrapped:

- `name={tool.label}`, `shortcut={tool.shortcut}`, `position="right"` (canvas is to the right of the left dock).
- No `description` (fixed tools carry no why-here line, per §5).

`Dock` is presentational and already receives its tool list; it renders inside `DockShell side="left"`. It does not need a new prop — its position is always `"right"`.

### 4.2 `RightDock.tsx` (the 3D dock — always right)

The 4 hardcoded affordances (Arrange / Sew / Simulate / Avatar) are each wrapped with `position="left"` (canvas is to the left of the right dock):

- **Arrange:** `name="Arrange"`, no shortcut.
- **Sew:** `name="Sew"`, no shortcut. (The existing dynamic `title` — "Sewing… · click to exit" vs "Sew · click two 3D edges" — is descriptive prose, not a name+shortcut; it is dropped in favor of the structured tooltip. The active/teardown state remains conveyed by `aria-pressed` + the `dock__tool--active` class.)
- **Simulate:** `name="Simulate"`, `shortcut="Space"`. (`formatShortcut` renders `Space` → `␣`.)
- **Avatar:** `name="Avatar"`, no shortcut.

No `description` on any (they are fixed affordances).

### 4.3 `DockAutoZone.tsx` (kept 📌 + auto ✦)

`DockAutoZone` already maps `kept` and `suggested` items through `renderItem(s, variant, withBadge)`. Wrap each rendered item's `dock__tool-wrap` content with a `ToolTooltip`:

- `name={s.label}`, no `shortcut` (auto items are actions — grade / export / fitmap / bom — with no keyboard shortcut today).
- **Kept (`variant === 'kept'`):** `description="you pinned this"`, `descriptionTone="pin"`.
- **Auto (`variant === 'suggested'`):** `description="suggested for this stage · click ✦ to keep"`, `descriptionTone="auto"`.
- `position` comes from a new **`side: 'left' | 'right'`** prop on `DockAutoZone` (left dock → `position="right"`; right dock → `position="left"`). `LeftDock` passes `side="left"`, `RightDock` passes `side="right"`. This mirrors how `signaling` was threaded in slice 3c.

When `signaling === 'off'`, kept items render as plain buttons with **no badge** (slice 3c). The tooltip still applies (name + the "you pinned this" line is still true), so `off` does not suppress tooltips — only the badge sub-button. The wrapper is independent of `withBadge`.

The badge sub-button itself (the small 📌 / ✦) is **not** separately tooltipped; its `aria-label` ("Unpin <name>" / "Keep <name>") already names it for assistive tech, and a tooltip-within-a-tooltip-wrapper adds noise.

## 5. Components touched

- **Move:** `src/components/Toolbar3D/ToolTooltip.tsx` → `src/components/shell/ToolTooltip.tsx`; `src/components/Toolbar3D/ToolTooltip.css` → `src/components/shell/ToolTooltip.css` (the `.tsx` imports `./ToolTooltip.css`, so they move together).
- **Modify (relocated):** add `descriptionTone?: 'pin' | 'auto'` to `ToolTooltipProps`; apply the modifier class on `.tool-tooltip-desc`; add the two color rules to `ToolTooltip.css`.
- **Modify:** `src/components/Toolbar3D/Toolbar3D.tsx` — repoint its `ToolTooltip` import to `../shell/ToolTooltip` (compile-only fix; component stays orphaned/unmounted).
- **Modify:** `src/components/shell/Dock.tsx` — wrap each tool button in `ToolTooltip` (`position="right"`), drop native `title`, keep `aria-label`.
- **Modify:** `src/components/shell/RightDock.tsx` — wrap the 4 affordances in `ToolTooltip` (`position="left"`), drop native `title`, keep `aria-label`; pass `side="right"` to `DockAutoZone`.
- **Modify:** `src/components/shell/LeftDock.tsx` — pass `side="left"` to `DockAutoZone`.
- **Modify:** `src/components/shell/DockAutoZone.tsx` — add required `side: 'left' | 'right'` prop; wrap each item in `ToolTooltip` with the per-variant `description` + `descriptionTone` + derived `position`; drop the items' native `title`, keep `aria-label`.

No Redux/state change. No new tokens (reuse `--accent` blue and `--dock-auto` violet — the existing badge colors).

## 6. Acceptance criteria

1. `ToolTooltip` lives at `src/components/shell/ToolTooltip.tsx` (+ css); `Toolbar3D.tsx` imports it from the new path; `npx tsc -b --noEmit` is clean.
2. `ToolTooltip` accepts `descriptionTone?: 'pin' | 'auto'`; when `'pin'` the description carries `tool-tooltip-desc--pin`, when `'auto'` it carries `tool-tooltip-desc--auto`, when unset neither; the base render (name/shortcut/description) is otherwise unchanged.
3. Hovering a 2D dock tool shows a tooltip with the tool's name and its shortcut as a `<kbd>`, positioned to the **right** of the dock; no second line.
4. Hovering a 3D affordance shows a tooltip to the **left** of the dock; Simulate shows a `Space` shortcut, the other three show name only.
5. Hovering a **kept** (📌) item shows `name` + a second line "you pinned this" in the blue (pin) tone; hovering an **auto** (✦) item shows `name` + "suggested for this stage · click ✦ to keep" in the violet (auto) tone. Left-dock auto-zone tooltips appear to the right; right-dock to the left.
6. Each wrapped button keeps its original `aria-label`; no wrapped button relies on the native `title` anymore. Existing dock tests (which query by accessible name / role) still pass.
7. Tooltips honor the 500 ms delay and portal out of the dock (not clipped). With `signaling === 'off'`, kept items still tooltip (no badge, but the name + "you pinned this" line still render).
8. Gates green: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 7. Testing

- **`ToolTooltip`** (RTL, new `src/components/shell/__tests__/ToolTooltip.test.tsx`): renders `children`; on mouse-enter, after the 500 ms delay (advance fake timers), the portal tooltip appears with the `name` text and, when `shortcut` is given, a `<kbd>` with the formatted shortcut; `descriptionTone='pin'` puts `tool-tooltip-desc--pin` on the description element, `'auto'` puts `--auto`, and omitting it yields neither modifier; `position='right'` applies the `tooltip-right` class, `'left'` the `tooltip-left` class. Use `vi.useFakeTimers()` for the delay; assert via `document.querySelector` (portal renders to `document.body`, no jest-dom matchers — use `.toBeTruthy()` / `.textContent` / `.classList.contains`).
- **`DockAutoZone`** (extends `src/components/shell/__tests__/DockAutoZone.test.tsx`): with a kept item and `side="left"`, hovering (advance timers) shows the "you pinned this" description with the `--pin` class; with a suggested item, shows "suggested for this stage · click ✦ to keep" with the `--auto` class; the `signaling` and badge behavior from slice 3c still pass (the new `side` prop defaults are supplied in the existing `setup` helper — pass `side="left"`). Assert the directional class follows `side`. Confirm clicking the main icon still calls `onRun` and the badge still calls `onPin`/`onUnpin` (tooltips do not intercept the click — the wrapper hides on `onPointerDown`).
- **`Dock`** (extends `src/components/shell/__tests__/Dock.test.tsx`): the existing accessible-name queries (`getByRole('button', { name: /select · z/i })`) still resolve — verify the accessible name is unchanged after the `title`→tooltip swap (the name derives from `aria-label`, which is preserved). Optionally assert a tool's tooltip text appears on hover with fake timers.
- **`RightDock`** (extends `src/components/shell/__tests__/RightDock.test.tsx`): the Sew/Simulate/Arrange/Avatar buttons still resolve by their `aria-label`s (reachability tests intact); optionally assert Simulate's tooltip shows the `Space` shortcut on hover.
- **Live (Playwright, untracked `scripts/verify-dock-tooltips.mjs`):** open app (split view) → hover a 2D tool, assert a `.tool-tooltip.tooltip-right` appears with the name + a `<kbd>`; hover a 3D affordance, assert a `.tool-tooltip.tooltip-left`; add a piece (stage `drafted`) → hover the Grade ✦, assert the tooltip shows "suggested for this stage" with the `tool-tooltip-desc--auto` class; keep it (✦→📌), hover, assert "you pinned this" with `--pin`.
- Full gate before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 8. Edge cases

- **`signaling='off'` + kept item:** no badge, but the tooltip still shows (name + "you pinned this"). Correct — the item is still a deliberately-kept tool; muting the *signal* doesn't mute its *identity*.
- **No-shortcut items** (3D Arrange/Sew/Avatar, all auto items): `shortcut` is omitted → the header renders the name with no `<kbd>` (the component already guards `{shortcut && ...}`).
- **Tooltip vs click:** `ToolTooltip` hides on `onPointerDown`, so a click that activates a tool also dismisses the tooltip — no stuck tooltip after selection. Badge clicks (`stopPropagation`) still keep/unpin; the wrapper's pointerdown handler runs on the capture of the wrapper, not the badge's stopPropagation path, so both work.
- **Viewport edges:** the tooltip is portaled to `document.body` and positioned at the button's mid-height on the canvas-facing side; for the topmost/bottommost dock item it can sit near the viewport edge but does not affect dock layout (portal, not in-flow). Refining vertical clamping is out of scope (the existing `ToolTooltip` did not clamp and shipped fine in Toolbar3D).
- **Relocated CSS:** `ToolTooltip.css` moves with the component; no other file imports it (only `ToolTooltip.tsx` does, via `./ToolTooltip.css`), so the move is self-contained.
- **Wrapper in the dock's flex column:** `ToolTooltip` renders a `<div class="tool-tooltip-wrapper">` (`position: relative`, default `display: block`) around its children, so each wrapped dock item becomes a flex child of the dock column via this wrapper instead of the bare button/`dock__tool-wrap`. Verify the column's gap and centering are unaffected; if the block wrapper shifts alignment, reconcile in `Dock.css` (e.g. give `.tool-tooltip-wrapper` inside a dock `display: flex`/the item's own box model) rather than changing the shared component. The live Playwright check (and a screenshot) confirms the dock still reads as a tidy vertical column after wrapping.

## 9. Out of scope

- **Panel-routing-by-side** (handoff §6) — opening the contextual panel on the dock's side. Today the panel is a single `contextPanel: string | null` rendered top-right; routing it by side needs a `{ name, side }` state + `ContextPanel` CSS work. Its own slice.
- **Usage-frequency ranking** of auto suggestions (handoff §9) — still deferred (slice 4+); this is why the auto tooltip says "suggested for this stage", not "rose by usage".
- **Tooltips on non-dock controls** (UnifiedBar, LogoMenu, floating overlays).
- **Hold-to-expand sub-tools** (`hasSubTools`) — the docks have no tool variants; the prop is left unused.
- **Deleting the orphaned `Toolbar3D`** — only its import is repointed here; its removal is a separate orphan-cleanup task.
