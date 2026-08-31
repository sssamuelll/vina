# Changelog

All notable changes to Vina are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- **Live dimensions on a selected internal line (Trello #226, María — 2026-08-31)** — selecting an already-drawn internal line (reference, fold, topstitch, grainline) shows editable chips for every straight segment's Largo and Ángulo (0° right, 90° up on screen, the same convention as "Siguiente punto"), plus, for each endpoint that sits on the piece's own outline, two more chips for its distance along the border to the two neighboring corners (`cw`/`ccw`) — so a sleeve seam pinned to the armhole can be nudged by typing a millimeter, not by dragging blind. Writing Largo/Ángulo moves only the segment's end node; writing a border distance slides that endpoint along the contour and, on a curve's endpoint, carries its control point by the same delta so the tangent survives the edit. The grainline gets the same Largo/Ángulo chips for free — it is a 2-point internal line like any other — closing #1107's "¿cómo sé que este es cero?" along with two independent fixes from that note: the drag-to-arm threshold now compares screen pixels like every other tool instead of pattern millimeters (a 20px drag at 10× zoom used to read as 2mm and never arm; a 2px tremor at 0.1× zoom used to read as 20mm and arm by accident), and Shift now snaps the drag to 0°/45°/90° in pattern space, so 0° stays "the horizontal María sees on screen" even on a rotated piece; the hint bar names both. Selecting an internal line suppresses the piece's transform box and floating action bar the same way a second selected piece does — one shared boolean, no new wiring. Spec: `docs/superpowers/specs/2026-08-30-cotas-vivas-design.md` § 4, § 5.4 (the in-progress-trace freeze into live chips is deliberately deferred to a follow-up, `NextPointPanel.tsx` untouched this round). E2E: `tests/e2e/226-cotas-linea-interna.spec.ts`.
- **Live dimensions on the piece, the docked options bar is gone (María #223, #225 — 2026-08-30)** — the piece a patternmaker just created with Rectángulo, or any single piece she selects, shows its width and height as dimension chips over the canvas, and the chips are the form: click a chip to type (Enter applies, Tab jumps to the next chip ready to type, Escape and clicking away discard), drag a chip to scrub (1 px = 1/zoom mm, Shift ×10, Alt ×0.1, one undo entry for the whole drag via a token undo batch, at most one dispatch per frame), Tab from the canvas focuses the first chip. The numeric path and the transform-box handles share one engine (`pieceResize.ts`, extracted from `useTransformTool`): "Ancho = 300" and dragging the `se` handle are the same operation, so rotated pieces, internals and notch re-anchoring come along. Hot creation writes the next rectangle's default (Blender's Adjust Last Operation) and cools irreversibly when the selection or the tool changes; a merely selected piece never touches the default; locked pieces show their chips disabled. The docked `ToolOptionsBar2D` — measured to be covered by the centered dock on a 1366×643 laptop viewport, and to edit the *next* rectangle rather than the one on screen (the old e2e certified our promise, not hers) — is removed; a `ToolStrip2D` overlay in the canvas corner keeps the door: tool name, effective shortcut, what is being edited ("Editando: la pieza nueva" / "la pieza seleccionada" / "Un clic crea 300 × 150 mm"), and the other tools' option controls (moved, not rewritten; `#opcion-*` ids kept). "Siguiente punto" moves from `fixed` to inside the canvas and the strip yields the corner while it is open. New tokens (`--cota-*`, `--surface-overlay-border-flush`, `--focus-rail`) and a declared exception in the interface contract (a persistent overlay strip). Spec with the judge panel and the adversarial-review record: `docs/superpowers/specs/2026-08-30-cotas-vivas-design.md`; plan: `docs/superpowers/plans/2026-08-30-cotas-vivas-pr-a.md`. E2E through María's door: `tests/e2e/cotas-de-pieza.spec.ts`, `tests/e2e/emplazamiento-tira.spec.ts`, `tests/e2e/maria-191-rectangulo-con-medidas.spec.ts` (rewritten against her expectation). Internal-line dimensions (#226) are PR B.
- **Diagnostic black box, the journal (2026-08-29)** — the bundle now carries a single always-on timeline of everything that happens inside Vina (`journal`, last 1000 events, in memory, no flag): every Redux action with a summarized payload (including the toasts the user read and the actions the confirmation gate blocked), every 2D press/release/double-click/pointer-cancel at the router door with button, world point, hit target and `drag`, every key with who consumed it, the mute decisions of the internal-line / pen / rectangle / edge gestures (snap kind, host piece, dead zone, ignored right-button release, `tooSmall`, edge miss, the "Siguiente punto" panel), every keyboard shortcut that matched (and whether anyone handled it), the context menu opened or suppressed by a live gesture and the row executed, 3D pointer down/up, `console.warn`/`console.error` (original called first, `Error` formatted as `name: message`, never throws), long tasks, tab visibility/focus/resize, the storage layer's degraded-state signals (`idb-unavailable`, `ls-quota-exhausted` — the `setStorageTelemetryHook` stub is finally wired), autosave ok/fail with duration, and mirrors of solver-cascade rows and tracked errors so the order between gestures, actions and failures is readable in one place. High-frequency bursts fold **by key** within 1 s (a 10 s trackpad pan is one entry with `n≈600`; alternating zoom/pan can no longer flush the ring). The last 150 events are written to a LS slot on `pagehide`/tab-hide and prepended on the next load, so what happened before a crash *or a reload* survives. The bundle also gains `environment` (UA, DPR, viewport, cores, heap, WebGPU, served build, `vina-*` flags), all 20 remaining Redux `slices` (explicit list with a ratchet test) and the storage parse-failure snapshot; `inspector` is exported whole; each slice and the journal go through a per-field guard that names the unserializable culprit instead of muting the export button. Spec with the adversarial-review record: `docs/superpowers/specs/2026-08-29-caja-negra-bitacora-design.md`. E2E through María's door: `tests/e2e/caja-negra-bitacora.spec.ts`.
- **Written measures (María #191, #195, rest of #193 — 2026-08-29)** — **Rectangle:** Ancho and Alto in the options bar are real number fields (1–3000 mm); a plain click creates the rectangle with those measures, top-left corner at the click (CLO's "left-click creates it"); a drag still draws freehand and writes the drawn size back to the bar. **Pen and internal line:** `Tab` opens "Siguiente punto" — a floating panel (no scrim, canvas stays live, no global key listener) with length (mm) and angle (°, 0° right, 90° up on screen); Enter places the node and keeps the panel open with the same values for the next one, Escape closes it, Enter outside the panel still finishes the trace; Backspace removes the last pen node, a double-click finishes the pen's open path. The hints at the foot of the canvas name every door.
- **"Línea interna", one tool (María #205, #206, #209, half of #193 — 2026-08-29)** — `Línea`, `Forma interna` and `Pluma poligonal` collapse into a single dock tool (`G`, slot 5): one continuous stroke of straight, curve-by-points (Catmull-Rom, the same model as the outline) and bezier (drag) nodes, mixed freely; **snapping** to piece corners, other internal-line endpoints and the outline with one radius (`EDGE_HIT_PX`), announced by a ring before the click so "conectadas" means connected (the stored point is the target's, not 5 mm off); **the host piece is fixed by the first press** (the snap target's piece, else the topmost piece whose outline contains the press) instead of "the last piece"; **Enter or double-click finish an open line**, a click on the first node closes, Backspace removes the last node, Escape discards; the trace shows live length **and angle**. Options bar: "Tipo de punto" (Recta / Curva por puntos) and "Tipo de línea" (Referencia / Doblez / Pespunte). Spec with the adversarial-review record: `docs/superpowers/specs/2026-08-29-linea-interna-y-medidas-design.md`. Numeric entry (rectangle by size, next point by length/angle) is PR B.
- **Diagnostic black box, 3D half (#1086, 2026-08-28)** — the bundle now carries the solver cascade log (which tier ran, which were skipped and why — `flag-off` / `unavailable` / `downgraded` —, each failure with phase, message and stack, stamped with the cascade run it belongs to), WebGPU device loss that survives the reload its own toast asks for, runtime errors from every tier with their typed `code`, NaN and self-collision diagnostics crossing out of the WASM worker (coalesced so a sustained NaN storm can't flush the ring), the config each tier *actually* received (after `configBridge`, the mode preset and the fabric params — plus wind/elastics applied after init), a per-piece mesh manifest built in the same loop that concatenates the rendered geometry, and a base64 Float32 snapshot of the cloth — also when exported from a crashed viewport's fallback, because the geometry is retained past unmount. `solver.config` (a byte-for-byte copy of `simulation`) is gone. **Fixes a pre-existing race:** a stale cascade run whose init rejected after Stop→Play used to dispose the *live* solver client of the new run. Plan and adversarial review record: `docs/plans/2026-08-28-caja-negra-telemetria-3d.md`. First e2e in the repo that intercepts a download (`tests/e2e/diagnostico-3d.spec.ts`).
- **Local diagnostic black box (#1084, 2026-08-28)** — `Archivo ▸ Exportar diagnóstico`, and a button inside each of the four error-boundary fallbacks, download a JSON bundle with the Redux state (project / avatar / simulation), the causal undo timeline (append-only, persisted in IDB), the last 50 errors (a boundary crash survives the reload via a justified LS slot), the last 200 copilot tool executions (always-on in-memory ring, no prompts or reasoning), and the *actually active* solver tier kept separate from the last selected one. The verbose agent recorder is gated again behind the debug flag — it had been writing 100 full traces with prompts to localStorage unconditionally. A tool returning `{success:false}` is no longer reported as `tool:complete`. **Scope:** 2D pattern bugs reproduce from the bundle; 3D drape does not yet (solver buffers, velocities and the tier-cascade decisions are out) — see `docs/plans/2026-08-27-caja-negra-telemetria-local.md` and the 3D follow-up plan `docs/plans/2026-08-28-caja-negra-telemetria-3d.md`.
- **Tool options bar (#1059)** — a fixed bar above the 2D canvas shows the active tool, its shortcut and its options; the Point tool exposes its three modes (point / curve by points / bezier) that existed but had no door.
- **The drag says how much (#1050, #1052, #1053)** — in notch, point, sew and seam-allowance a drag selects a partial edge span or sets an along-the-curve distance in mm with a live readout; Escape cancels mid-gesture.
- **Interface contract (#1054, #1055, #1057, #1058)** — UI drift audit, an eight-rule ratchet (`scripts/ui-contract-lint.mjs`, runs in pre-commit), the 8 native dialogs replaced by the confirmation surface, 13 global z-indexes moved to the named scale, panels stop floating and coexist two at a time.
- **Point tool in the dock (#991)**, **Forma interna tool (#953)**, **straight ↔ curve conversion from the right-click (#977, #978)**, **"Empatada" seam corner across pieces (#961)**, **grainline arrow on canvas and DXF, pointing one way (#959, #967)**.
- **Real sewing on the avatar (#934, merged 2026-07-10)** — the sewing process (arrange → sew F1–F4a → seam fill → release) closes a garment on the avatar: sleeve tubes close and armholes seal to ~0.3cm at ~29fps on the reference shirt. This is the milestone that took "pieces fall as loose panels" (#531) to "a shirt forms and drapes."
- **Collision-aware 3D piece placement (#923, arrangement points Phase 1, 2026-06-21)** — imported pieces are placed around the avatar without intersecting the body (sleeves stop passing through the arm), with grading-safe binding anchored by landmark + frame-delta.

### Changed
- **`ToolOption.control: 'input'`** — a declared number option can ask the bar for a typed field instead of the slider (the default stays the slider, so nothing else changes). The rectangle's dead 5 mm minimum size is gone: `isDrag` (4 px) decides click vs. drag, and only button 0 arms.
- **Keyboard ownership in the 2D editor (2026-08-29)** — a live gesture owns its keys in the *capture* phase (`useEditorInteractions` CF-1): with an internal-line trace alive, Escape / Enter / Backspace / Delete go to the trace and nowhere else; keys born inside an editable field belong to the field. Measured before: `ShortcutProvider` (document, bubble) ran before the tool router (window, bubble), so Backspace with the host piece selected deleted the piece, and the pen's Escape also cleared the selection.
- **`⇧L` and `Y` are free** (were `Línea` and `Pluma poligonal`); the persisted dock migrates `line → internalShape` in place. Default internal-line type is now `reference` (was `fold` for `Línea`), so the right-click menu offers "Desplazar línea interna" / "Optimizar curvas" instead of "Desplegar"; the bar's "Tipo de línea" still creates folds. The pen and rectangle lose the options that were painted but never read (`smoothing`, `snapGrid`, `constrainAngles`, `cornerStyle`).
- **Sewing targets edges, not DXF commands (#1041, #1044, #1046)** — the unit of the sew gesture is the whole edge (an armhole made of 200 short segments is one target); edges reindex when a command is inserted or removed; the highlight shows the edge that will be sewn, not a fragment.
- **Manual deploy script to vina.sdar.dev (#992)** — GitHub Actions stay disabled on purpose; releases are cut locally after the full gate.
- **El proyecto pasa a llamarse Vina (antes OpenClo)** — formato `.vina` (los `.openclo` se siguen abriendo), claves de datos migradas automáticamente, dominio vina.sdar.dev.
- **The application UI is now Spanish (#942–#947, 2026-07-16)** — a frontend pass put the whole shell, panels, menus, command palette, and error messages into Spanish for the professional-patternmaker audience; grouped the Ctrl+K command palette by category; added a real door to 3D export / turntable from the File menu and palette; and removed ~5,900 lines of dead UI code. Error messages now say what happened, why, and what to do. Contributor docs remain in English.
- **WebGPU promoted to the default solver tier (#897)** — the cascade runs GPU → WASM → CPU → Neural with WebGPU **on by default** (opt-out via `localStorage 'openclo-use-webgpu' = 'false'`), after the TSL tier reached ≥30fps prod-verified on the María fixture with seams, body and self collision all closing on GPU. Three.js bumped to `^0.184`; the upstream `atomicAdd` bug (#554) is worked around in `src/utils/cloth/gpu/atomicStorage.ts` (storage `setAtomic(true)` → `array<atomic<T>>`), so it no longer blocks the tier. **WASM is now the fallback, not the default** — kept as the CPU-side solver for browsers without WebGPU and as the deterministic CI parity oracle.

### Fixed
- **The closing edge behaves like the other three (María audio 2026-08-30 — #1092; tanda 2)** — she named the same line twice, twenty minutes apart, from two different tools ("siempre es esta línea, porque este es el punto cero" while dragging in Editar patrón; "esta línea se comporta siempre rara y distinta a las demás" when Convertir en curva did nothing), and her diagnosis was right: it was one line, and it was where the path starts. A closed outline stores three of a rectangle's four sides as commands and the fourth — the one back to the start — as the `Z` that closes it. Dragging that edge found only one of its two endpoints (the other lives in the `M`), so the rectangle became a trapezoid; "Convertir en curva" looked for an `L` to convert, found the `Z`, and returned the outline untouched with no error. **The repo's convention was already right** — the closing edge is named by the `Z` command's index, and `nearestSegment`, `outlineRing.buildRing`, `EditPatternOverlay`, `getEdgeEndpoints` and `splitSegmentAt` (whose `case 'Z'` inserts an `L` before the `Z`) all read it that way. What was missing were the verbs: `convertToCurve` now accepts the `Z` and **inserts** a `C` before it, from the last anchor to the `M`'s anchor with controls at 1/3 and 2/3 — and because that curve ends exactly on the `M`'s point, `coincidentAnchorGroups` groups them, so moving the node moves both (the same duplicated-vertex case CLO produces); `convertSegmentToSpline` inserts its chain before the `Z`; and the segment drag resolves the destination anchor to index 0 when the command is `Z`. Reproduced in the browser first, with the other three edges as a control (they moved 2 vertices, the closing one moved 1). **Why no test caught it:** an assert in `splineSegment.test.ts` blessed the no-op as correct ("// la Z") — replaced by the real contract; five rectangle fixtures spell the shape as five `L`s with no `Z`, where the bug cannot exist; the one test that named the closing edge only checked the click's *distance*, never the `commandIndex`; and the three e2e that convert or drag an edge all click the top side, while the closing edge is the left one (#1120 collects all of that). Siblings left open: #1119 (the closing edge belongs to no semantic edge, so sewing and seam allowance treat it as a lone command — decided together with #1047).
- **The subject is what she has in front of her (María audio 2026-08-30 — #1094, #1093, #1096; tanda 1)** — three notes from one recording were the same defect seen from three tools: the app acted on something other than what the patternmaker was looking at. All three were reproduced first through the journal (the black box) at her 1366×643 viewport, and the journal already told the story on its own (`gesture key Delete {tool:"seam"}` followed by `project/removePieces ["B"]`; the two presses of a second cut with no action behind them; `gesture up {drag:false}` next to an `M C L` outline). **Supr in Coser deleted a piece:** `edit.delete` removed whatever was selected in Redux — a piece selected three gestures earlier that survived the tool change — and the seam cascaded away. Now, in any sewing tool (`SEWING_TOOL_IDS`, one shared set in `toolActivation.ts`: `seam`, `seamEdit`, `walkSeam`), Supr/Backspace delete the selected seam if there is one and never a piece; in Seleccionar nothing changes; arming a sewing gesture drops the stale selection (piece and seam). **Tijeras jammed after the first cut:** it required a selected piece and `removePiece` clears the selection, so the second cut had no subject and died silently. The press now decides the subject (spec 2026-08-11 § 4.1): the piece whose outline is under the cursor, selected ones first, topmost `zOrder` next, only what is visible and editable (hidden layers, locked pieces and locked layers are skipped); both halves stay selected after a cut; Tijeras resets when the tool changes, starts over if its target vanished, and the deferred confirmation refuses to split a piece deleted while the dialog was open. `keepBoth` and `cutType` — two options nobody read — leave the catalog, and the metadata says `requiresSelection: 'none'`. **The pen curved on 1 px of tremor:** it set handles on any movement between down and up; it now uses the same `DRAG_THRESHOLD_PX` (4 px, `>=`) as every other tool, and Supr mid-press closes the press. Contracts: `1096-pluma-umbral`, `1093-tijeras-el-press-manda`, `1093-tijeras-se-resetea-al-cambiar-de-herramienta`, `1094-supr-en-coser`, `1094-coser-arma-el-gesto-y-suelta-la-seleccion`; e2e through her door with the journal as evidence (`tests/e2e/1094-supr-en-coser.spec.ts`, `1093-tijeras-dos-cortes.spec.ts`, `1096-pluma-umbral.spec.ts`, `BITACORA_DUMP=<dir>` writes each timeline to disk). Siblings the adversarial review surfaced and this batch does not touch: #1115 (global Supr beats the local subjects of internal line / node editor / measure / topstitch), #1116 (scissors on rotated pieces), #1117 (slash&spread and extend/trim mute without selection), and the grainline's own zoom-dependent threshold (noted on #1107).
- **Escape did not close the right-click menu (2026-08-29, found by the journal e2e)** — a *real* Escape keypress first hits the global shortcut `selection.deselect` on `document`, whose dispatch re-renders `PatternEditor` synchronously; because the menu's `onClose` was an inline arrow, `ContextMenu`'s effect removed and re-added its `keydown` listener in the middle of that same dispatch, and the DOM skips listeners removed or added mid-dispatch — so the menu never saw the key. Synthetic `keydown`s (jsdom, `dispatchEvent`) don't take that path, which is why every unit test passed. `onClose` now goes through a ref in `ContextMenu`, `ContextMenu3D` and `ContextPanel` (same mechanism); the trusted-key path is pinned by `tests/e2e/caja-negra-bitacora.spec.ts`.
- **Internal-line tool defects that fell out of the unification (2026-08-29)** — right-click no longer drops a node (the press had no button guard); Escape mid-press discards only that press (the old `reset()` kept `dragStartRef`, so the pending release created a node from the dead press); a double-click on the first node closes without leaving a one-node ghost trace (close used to commit on the press while nodes commit on the release; now the close commits on the release and a distance dead zone follows every commit); the trace survives `pointercancel`/`blur` by discarding the press, not the nodes. **DXF export:** internal lines with more than two anchors or curves (`fold`, `topstitch`…) are exported whole instead of their first segment, and the fold-direction label sits at the middle of the full arc.
- **María's notes, 2D editor batch (July–August 2026)** — reliable point editing on rotated pieces (#956, #958, #965, #968); notches re-anchor when the outline is edited and follow the point, not just the line (#960, #969); seam allowance with correct geometry on any piece, CLO imports included, and sharp corners that miter instead of spiking (#973–#976, #989, #1036, #1048); sewing follows the real curve instead of its chord (#1038); no more echo trails or ghost anchors while dragging (#1023, #1037, #1060); locked pieces are visibly locked and move without being modified (#979, #985); resize anchors the opposite side (#986); the pen shows the closing segment before you close (#987); right-click no longer goes mute with the pointer (#1040); the selected line lets go when you change piece (#1039); the transform box follows the piece's orientation (#1062); hit-testing, notches, grainline, POM measurements and trims draw rotated with the piece (#1063, #1065, #1070, #1072, #1073); sew-walking, seam allowance, trims and internal lines hook where the edge is actually drawn (#1074, #1075, #1078, #1079, #1080); the pattern↔local conversion ratchet closed its blind spots (#1071, #1077).
- **Dart operations write back to the `InternalLine`, so the 2D canvas reflects them (#1018)**; the four dart rules never fired, and generic internal lines are no longer classified as darts (#1020).
- **Fit maps on the WebGPU default tier (#1013, #1014)** — GPU-native, discoverable from the UI, the silent soft-skip closed.
- **DXF file name sanitized before it enters the agent prompt (#971)**.
- **WebGPU device loss now auto-falls-back to the WASM/CPU solver (#901)** — when the renderer's WebGPU device is lost mid-simulation the solver cascade re-runs automatically and the simulation continues on WASM/CPU; previously the frame loop kept calling `renderer.compute()` on the dead device and the only "recovery" (a manual stop/restart) re-entered the dead GPU tier anyway. Loss is now detected on the renderer's device — the one the TSL kernels actually run on — instead of the lifecycle's own decoy `requestDevice()`, so the fallback actually fires: `useSimulationLifecycle` exposes `handleGpuDeviceLost`, the cascade re-enters on a reactive generation counter, a renderer-device latch stops the frame loop the instant loss is observed, and a module-level registry keyed by the renderer device carries the downgrade across the Stop→Start remount (which resets per-mount refs but not the `<Canvas>`/renderer). **Caveat:** a lost WebGPU device cannot be revived in place — the solver keeps running (re-draping from the placed pose; there is no warm-start from the lost GPU buffers), but restoring the live 3D view still requires a page reload; in-place renderer recovery is a separate follow-up.

## [0.11.0] — 2026-06-11

CLO3D seam/sewing parity release — the full parity plan (`docs/plans/2026-06-11-clo3d-seam-sewing-parity-plan.md`, Fases 0-6) shipped as PRs #871-#876. Garments now actually sew in the default solver tier: two curved pieces close in ≤2s on WASM, every seam pair has a stable identity color, sewing direction is real (crossed-X warning + Ctrl+B), and unresolvable seams warn instead of silently falling.

> Interim note: work between 0.10.0 (2026-03-29) and this release — drift audit closures (A2-A7, B-, C-, D-, E-series RFCs), Epic-746 boundary contracts, MVP v1 Opt C, housekeeping #500-#870 — is not backfilled here; see git history. This entry covers the parity plan release.

### Added
- **Seam closure on WASM (default tier)** — per-substep seam target decay in the Rust solver (`set_seam_shrink_params`), mirroring the CPU reference; seams close in ≤2s sim-time. CI now smoke-tests seam closure against the committed WASM binary (#872).
- **Sewing direction + Reverse Sewing (Ctrl+B)** — `Seam.pieceB.reversed` flows through every tier's vertex matching (`parameterizeEdge` mirrors t). 2D connection lines draw start→start + end→end (a reversed half shows the crossed-X error signal, CLO3D-style) with perpendicular directional notches at each start. Ctrl+B, panel button, context menu and the new `reverseSeam` copilot tool all toggle it (#875).
- **Seam observability** — when a seam resolves to 0 XPBD constraints the user gets an error toast, an inspector entry, and the simulation overlay shows the live seam constraint count. Capability flag `seams` per solver tier: the cascade skips WebGPU/Neural (with a visible notice) when a project has seams (#874).
- **Stable seam pair colors** — pair identity color hashed from the seam id (deleting a neighbor no longer recolors survivors); selection shows as weight + glow, never recolor; both sewing overlays now share one pick-color language (first=green, second=blue) (#876).
- **Seam length mismatch in absolute mm** — red warning above 1mm (CLO3D parity), replacing the 5% relative threshold that hid a 19mm error on a 400mm seam (#876).

### Fixed
- **The demo-killer chain** — the default tier simulated with ZERO seams: the WASM init callsite dropped `seamInitData` (BP-1, #871); the WASM worker then crashed on seam-carrying inits (unconverted `SeamInitData` shape → TypeError) and silently fell back to CPU (#875); and `segmentRange` was produced in command space but consumed in flattened space, so curved edges (armholes, necklines) sewed, picked and highlighted the wrong vertices (BP-3) — fixed via the single canonical boundary `commandRangeToFlattened` (#873).
- **Per-edge seam allowance widths lost on load** — generative load re-detected edges without copying `seamAllowanceWidth`; widths now survive re-keyed by edge name (#876).
- **`reverseSeam` was a physical no-op** — it swapped pieceA↔pieceB, which produces identical constraint pairs; it now reverses actual traversal direction (#875).

### Changed
- **Shrinkage slider removed** — it was `100 − tension` rendered twice; gathering/easing intent stays on the Tension slider. The copilot keeps `setSeamShrinkage` as a semantic alias (#876).
- **`setSeamRange` (copilot) refuses partial ranges** — the solver does not renormalize filtered t-values yet; sub-range seams would sew wrong vertices. Full-edge `[0,1]` still accepted; partial-edge sewing ships as an atomic pair with renormalization (#486) (#875).

### Known Issues (deferred by plan § 5, tracked post-ship)
- Partial-edge sewing (tStart/tEnd) — only as an atomic pair with solver renormalization (#486).
- SeamGroup M:N proportional subdivision — needs the t-range substrate (épica #878).
- WebGPU/Neural tiers do not close seams — honestly capability-gated; WebGPU itself blocked by Three.js 0.183 `atomicAdd` upstream (#708, #731). _(Superseded 2026-06-12 by #897: WebGPU closes seams and is now the **default** tier — the atomicAdd bug is worked around in `atomicStorage.ts`, Three.js on `^0.184`. Neural still cannot sew. See [Unreleased].)_
- Seam lines not yet drawn over the simulated garment — `SeamRenderer3D` renders in arrange mode only (#880).
- Editing seams during simulation requires a restart (live edit deferred).
- Corner types on curved outlines (partial fix in #859), typographic polish, Clipper2 SA-offset memoization in `PieceRenderer` — deferred polish batch.
- Boundary-as-domain-entity refactor (épica #878) and the CLO3D benchmark as falsifiable E2E spec (épica #879) are the structural post-ship tracks (`docs/plans/2026-06-11-post-ship-plan.md`).

### Stats
- 5,574 automated tests passing across 380 files (+1,138 since 0.10.0).
- 232 copilot tools registered (+1: `reverseSeam`).
- 6 PRs, ~2,600 lines changed, shipped 8 days ahead of the 2026-06-19 target.

## [0.10.0] — 2026-03-29

### Added
- **Tech Pack & BOM Generation** — Auto-populated Bill of Materials extracting fabrics, interfacing, thread, seam tape, elastics, and trims from the garment project. Multi-page tech pack PDF export with 3D views, measurements, BOM table, construction notes, and colorway swatches. Per-colorway cost comparison. 8 copilot tools (#225, PR #482).
- **Trim & Hardware Library** — 22-preset library covering buttons, zippers, snaps, rivets, buckles, rings, hook & eye, and drawstring stops. Discriminated union placement model (edge, count, point modes). Redux CRUD with full cascade on piece/edge operations. BOM extraction. 10 copilot tools (#226, PR #484, #496).
- **3D Sewing Tool** — Click two edges in the 3D viewport to create seams (CLO3D-style). Pure edge picker using local-space proximity, compatibility checks (same-piece rejection, already-seamed detection, length mismatch warning), arrange-mode only. Three.js Line highlights (#457, PR #487).
- **Nesting & Fabric Consumption** — Fabric roll nesting with configurable width (90/112/150cm), gap control, and production metrics. Dynamic roll length calculation. Canvas preview in the bottom panel. Utilization and waste percentage display (#235, PR #488).
- **Auto-Trace** — Custom Canny edge detection (zero dependencies, ~280 lines). Grayscale, Gaussian blur, Sobel gradients, non-max suppression, hysteresis threshold, Moore-Neighbor contour tracing, Douglas-Peucker simplification. Web Worker for non-blocking UI. Contours sorted by area for easy selection (#430, PR #490).
- **Single-Axis Grading** — Size grading with EU/US/UK size systems. Redux state tracking active sizes, quantities, and staleness. Dedicated Grading layer (layer 10, hidden by default). Staleness middleware detects base piece changes. batchUndo for single-step undo of grade operations (#258, PR #491, #492).
- **Artwork Import & Placement** — Place SVG/PNG/JPG artwork on garment pieces. Canvas-based compositor overlays artwork onto fabric texture (zero shader changes). SVG bitmap dimension handling. Artwork validates width/height > 0 and clamps opacity. 3 copilot tools (#237, PR #494).
- **RAG Knowledge Base** — 65-chunk static knowledge index covering drafting methods (Aldrich, Müller, Gilewska), ease standards, grading rules, fabric properties, and Seamly2D patterns. Client-side cosine similarity search with keyword fallback. AgenticLoop retrieves top-5 relevant chunks and injects as "Reference Materials" in the LLM system prompt (#497, #498, PR #503, #504).
- **2D Trim Placement Tool** — Click-to-place trims on pattern pieces. Trim Library Panel with search and type grouping. SVG trim markers on 2D canvas with type-specific icons. Edge-points interpolation for edge-placed trims (#483, PR #496).

### Changed
- **Confirmation Dialogs Removed** — Delete confirmations (removePiece, removeSeam, removePoint) no longer show by default since all actions are undoable via Ctrl+Z. Users can opt back in via override system. Dialog text changed from "cannot be undone" to "You can undo this with Ctrl+Z" (PR #485).

### Stats
- 4,436 automated tests passing across 289 files.
- 231 copilot tools registered.
- 65 RAG knowledge chunks indexed.
- 22 trim presets, 32 fabric presets.

## [0.9.0] — 2026-03-27

### Added
- **Seam System Overhaul** — Pieces now actually sew together in simulation. Fixed silent edge name resolution, WASM solver data passing, and shrink speed. Color-coded seam pairs, curved edge rendering, type-specific line styles (French=dashed, overlock=dash-dot), green selection glow, shrinkage/gathering slider (#451, #452, #453, #454, #455, #456, #458, #459, #460, #461, #462).
- **Pressure Simulation** — Internal inflation forces for puffer jackets, balloon sleeves, padded quilting. Per-triangle outward normal force with consistent winding detection (#382, #469).
- **XPBD Fold Constraints** — 3D simulation of pleats and creases. Fold lines create angular constraints in the solver, causing fabric to fold during simulation (#429, #471).
- **Undo Batch Grouping** — `batchUndo()` wraps N dispatches as a single undo entry. Eliminates the recurring N-dispatch partial-undo problem across all features (#437, #465).
- **Colorway UI** — Tab bar for switching colorways, per-fabricCode color override editor, 2D piece tinting via resolveColorway() (#446, #467).
- **Pre-Marking Placement Rules** — Production constraint system for nesting: atFold, atEdge, priority, grainTilt, pairWith, minDistance. Integrated into nesting engine (#262, #472).
- **Annotation Library** — 14 built-in production annotation templates (CUT 2, INTERFACE, GRAIN, etc.) with category-colored rendering and DXF export (#266, #434).
- **Fabric Codes on Pieces** — Production classification (SELF, LINING, INTERLINING, etc.) with color-coded 2D indicators and DXF export (#259, #425).
- **Garment Information** — Metadata dialog for brand, season, style number, designer, date, notes. Persisted and copilot-accessible (#378, #445).
- **Texture Tiling** — UV offset support, repeat presets (1x1/2x2/4x4/8x8), range sliders, lock aspect toggle, reducer clamping (#376, #427).
- **3D Mesh Selection** — Box select tool for 3D vertex selection with screen-space overlay, vertex projection via camera MVP, SelectedVertexRenderer (#371, #447).
- **Elastic Tool** — Full elastic data model, UI, simulation integration, and copilot tools for waistbands, cuffs, gathered edges (#322, #424).
- **Slash and Spread** — Cut and spread/rotate for fullness with 8-phase geometric pipeline (#363, #426).
- **Pleats & Folds** — Knife, box, accordion, inverted box pleat types with fold direction (mountain/valley) and crease angle (#260, #431).
- **Image Trace** — Reference image layer for pattern tracing with calibration and opacity controls (#244, #435).
- **Seam Corner Types** — 7 professional SA corner types (mitered, envelope, square, etc.) (#255, #449).
- **DXF Wizard** — Auto-detect DXF format (AAMA, ASTM, legacy) on import (#264, #450).
- **AAMA Export Metadata** — FABRIC_CODE, ANNOTATION, FOLD_DIR layers in AAMA DXF export (#439, #444).
- **Global Error Tracker** — Ring buffer capturing unhandled errors + rejections, exposed via `window.__OPENCLO_ERRORS__()` (#441, #474).

### Fixed
- **Seam Root Cause** — Silent edge name resolution failure fixed: `buildSeamConstraints()` now parses `"edge-N"` fallback pattern. WASM worker was missing piece edge data (one-line fix). Shrink factor 0.995→0.97 (#451, #452, #453).
- **Undo Deep-Clone** — Replaced `JSON.parse(JSON.stringify())` with `structuredClone()` + fallback. Abort on clone failure prevents array desync (#400, #414).
- **Double Undo Bug** — Removed duplicate Cmd+Z handler in `useCopilotKeyboardShortcuts` that caused two undo dispatches per keypress (#414).
- **Safe localStorage** — 24 files migrated to `safeStorage` wrapper with detection, in-memory fallback, per-key error logging. 9 bare calls wrapped (#401, #418).
- **Edge Reference Cascade** — `cascadeEdgeRename`/`cascadeEdgeRemove` reducers update seams, elastics, pleats atomically when edges change. Validator extended for elastic/pleat cross-references (#436, #468).
- **Shared Defaults** — `utils/defaults.ts` centralizes feature constants (seam allowance, tension, strength, elastic ratios, UV transform). UI hooks and copilot tools import from same source (#438, #470).
- **Collision Mesh Validation** — Vertex/face count checks on mesh import, constraint ID validation (#407, #443).
- **Name Sanitization** — Centralized `sanitizeName()` prevents export injection via control characters (#403, #420).

### Stats
- ~165,000 LOC across 580+ TypeScript source files.
- 4,200+ automated tests passing.
- 213 copilot tools registered.
- 35+ E2E test cases.

## [0.8.0] — 2026-03-24

### Added
- **Layer System (v1)** — Professional layer management matching CLO3D parity. Includes layer ordering, sublayers, superimpose (over/under), and layer cloning. Piece arrangement now respects layer index for complex garment construction (#372, #379).
- **Security Audit Compliance** — 100% resolution of March 2024 security audit. Replaced Base64 obfuscation with **AES-GCM encryption** in `SecureStorage`. Eliminated API key persistence to `localStorage` (#394, #399, #416).
- **Runtime Data Validation** — Strict `projectValidator` integrated at all data contract boundaries (load/import). Features automated repair for out-of-range simulation parameters and orphaned piece identity mapping (#397, #413).
- **Plugin Sandbox** — Full Web Worker isolation for community plugins with a capability-gated bridge, preventing unauthorized access to workspace state (#393, #410).
- **Professional Dart Enhancements** — Support for segmented darts, shaped dart caps (roof/cup), and intelligent intake distribution for high-end tailoring (#366).
- **WebGPU/TSL Surface Modes** — Shaded, Shaded-Wire, Textured-Wire, Flat, and X-Ray modes now fully functional on the WebGPU/NodeMaterial rendering path (#392).
- **Diagnostic Inspector UI** — High-visibility error badges and red dashed outlines for pieces failing validation. New `ruleUnresolvedPoints` diagnostic rule for broken geometry detection (#396).
- **POM Measurement System** — Persistent, named measurements (circumferences, heights, surface tapes) that update in real-time with the 3D simulation (#367).
- **Cut and Sew Logic** — Automated sewing creation on scissor-cut edges, significantly speeding up pattern manipulation (#364).
- **Rendering Enhancements** — Custom resolution exports, HDRI environment lighting, and high-fidelity PBR material properties (per-piece opacity + emission) (#377, #374).

### Fixed
- **3D Scene Scale** — Resolved "miniature effect" by recalibrating FOV (50°) and natural scene distance (3.0). Ground plane and environment now match human scale (#328, #329).
- **Undo System Stability** — Migrated to `structuredClone` for safe deep-cloning of simulation state, preventing reference leakage between history states (#400, #414).
- **Camera Orbit Pivot** — Locked 3D orbit pivot to the avatar center to prevent camera "wandering" during inspection (#346, #347).
- **Circular Chunk Dependencies** — Resolved Three.js/WebGPU TDZ (Temporal Dead Zone) errors by consolidating core and addon chunks (#309, #313).
- **TypeScript Build Compliance** — Fixed all strict type errors in the simulation and inspector modules for CI/CD green-light.

### Stats
- ~142,000 LOC across 512 TypeScript source files.
- 1585 automated tests passing (100%).
- 52 professional-grade CAD tools.

## [0.7.0] — 2026-03-06

### Added
- **Linked Editing** — Real-time propagation between symmetric pieces via Redux middleware. Supports `instance` (identical) and `symmetry` (mirrored) link modes with automatic partner sync.
- **Segment Sewing Tool** — Multi-seam type tool supporting standard, french, flat-felled, and overlock seams. Shortcut: `N`.
- **Topstitch Tools** — 4 specialized modes: Edit, Free, Seamline, and Segment topstitching with dedicated overlay UI.
- **3D Navigation Presets** — Camera slice with 8 view presets (front, back, left, right, top, bottom, three-quarter left/right) and focus-on-piece zoom.
- **Display Bar 2D** — Contextual floating toolbar with toggles for seam allowance, piece names, line lengths, grainlines, sewing lines, and render modes (textured, translucent, wireframe).
- **Split/Merge Tools** — Scissors tool (`X`) for splitting pattern pieces and Merge tool (`J`) for joining adjacent pieces.
- **Simulation Snapshots** — A/B/C comparison UI with max 3 manual slots and auto-save support.
- **Geometry Reference Stability** — Deterministic `pieceId:name` edge IDs, edge-name seam references replacing index-based system, auto-sew with stable references.
- **Agentic Copilot Loop** — Unified `AgenticLoop` architecture replacing old Planner/Executor/Reasoner pattern. Supports meta-tools (read-only) and action tools (mutations) with LLM-driven iteration.
- **Skill Authoring (SkillBuilder)** — `SkillBuilder` class with `fromConstruction()`, `withMetadata()`, `getPreview()`, `validate()`, `build()` API for community skill creation.
- **Skill Marketplace Module** — Configurable registry URL, `fetchAvailableSkills()`, community skill validation pipeline.
- **DXF Import Completion** — Full parser supporting LINE, LWPOLYLINE, POLYLINE, SPLINE, ARC, CIRCLE entities with layer-based role mapping and notch geometry.
- **Edit Classifier** — Utility classifying 2D edits as 'dimension' or 'topology' for warm-start simulation decisions.
- **2D Editor Performance** — Geometry extraction refactored to `src/utils/geometry/`, optimized for high-frequency interactions.
- **Domain Bootstrap** — Copilot domain bootstrap system for context-aware reasoning.
- **Meta-Tools System** — Read-only tools for copilot introspection without state mutation.
- **32+ Fabric Presets** — Expanded physical fabric library from 10 to 32+ calibrated materials.

### Changed
- **Copilot Architecture** — Migrated from Planner/Executor/Reasoner to unified AgenticLoop.
- **Seam References** — Migrated from index-based to edge-name references across the entire stack (store, worker, auto-sew).
- **Project Version** — Bumped to v0.7.0.

### Stats
- ~127,000 LOC across 461 TypeScript source files
- 186 test files
- 45 tool definitions

## [0.6.0] — 2026-02-27

### Added
- **Architectural Shift** — Migrated core solver to **Rust-based WASM** for sub-millisecond physics updates
- **Cognitive Engine Foundation** — Transition from "chatbot" to "Situated AI Agent" with design memory
- **Copilot Brilliance Suite** — Persistent Design Memory, 3D Visual Perception, and Intent Prediction
- **Silent Ingestion Layer** — Automated hydration of Seamly2D/DXF files into the Semantic Graph model
- **Skill Marketplace SDK** — Namespacing and guardrails for community plugins

## [0.5.0] — 2026-02-21

### Added
- **XPBD Cloth Simulation** — Matthias Muller solver ported to TypeScript (MIT)
- 10 calibrated fabric materials (Cotton Poplin, Denim, Silk Charmeuse, Wool Crepe, Jersey Knit, Organza, Linen, Neoprene, Chiffon, Canvas)
- Web Worker for 60fps off-thread simulation
- ClothMesh R3F component in Viewport3D (lazy-loaded)
- Redux simulationSlice with play/pause/reset and per-piece fabric selection
- **AI Agent Phase 1 — Foundation**: 42 tools with JSON Schema, Anthropic + OpenAI providers with streaming, PATRONAJE_SOUL.md personality, context builder, tool executor, project memory
- **AI Agent Phase 2 — Intelligence**: Compound tools (generateFromDescription, transformPiece with 9 transformations), proactive analysis (5 checks), teaching mode (11 bilingual entries), ES/EN language detection, multi-turn agent loop (5 rounds), smart defaults
- **AI Agent Phase 3 — Skills**: Skill loader + registry, 5 core skills (bodice Aldrich/Muller/Gilewska, sleeve, skirt, collar, grading), 35 formulas, 17 drafting methods, 52 construction steps, 41 grade rules, 55 bilingual triggers
- **AI Agent Phase 4 — Polish**: Error recovery with retry + fallback, cost manager with budget + model routing, Ollama local LLM provider, mobile fullscreen + voice input + quick action chips + haptics, AgentSettings UI, keyboard shortcuts
- **AI Agent Phase 5 — Community**: Plugin system (loader, registry, manager, permissions, sandboxing, namespacing), community skills (import/export/validation), marketplace preparation, language packs (ES/EN + extensible), formula plugins, PluginManager UI in ActivityBar
- 997 unit tests (52 suites) + 5 E2E suites (133 tests total)
- Documentation: AGENT_SPEC.md, AGENT_USAGE.md, OPENCLAW_PATTERNS.md

### Fixed
- unloadPlugin cleanup not removing all registered items
- resetLoadedPlugins error handling on invalid state
- Empty triggers validation in skill loader
- setBudget(0) incorrectly treated as falsy
- Disconnected simulation button in PropertiesPanel

### Stats
- ~30,634 LOC across 153 TypeScript files
- 22,860+ lines added in this sprint
- Commits: 2228e62 to 2c86de2

## [0.4.0] — 2026-02-20

### Added
- Seam allowance engine — real polygon offset with 6 corner types
- DXF import parser + AAMA/ASTM D6673 export with SPLINE entities
- 7 professional notch types (slit, T, V, castle, diamond, circle, square)
- 44 body measurements with male sizing defaults
- Nesting engine — bottom-left skyline bin packing for auto-layout
- Grading engine for multi-size pattern scaling
- Formula engine for parametric calculations
- OBJ export for 3D meshes
- Default avatar with A-pose (45 deg arms like CLO3D) at 1.80m height
- Complete project specs — architecture, core engine, simulation, file formats, AI copilot, UX, testing, security, roadmap

### Fixed
- A-pose skeleton rotation (quaternion multiply on local Z axis)
- SkeletonUtils.clone for proper skeleton cloning
- Store test updated to match current default measurements

## [0.3.0] — 2026-02-19

### Added
- DXF (R12) export with layers (cut, seam, notch, grainline, label)
- PDF export — printable cut layouts
- Parametric pattern templates (bodice, sleeve, skirt, pants, collar)
- AI copilot — agent-agnostic protocol, chat panel, command executor
- Save/load projects (.json)
- Undo/redo system (full history)
- Measurement tool — click-to-measure distance
- Node editor — double-click to edit anchor points + Bezier handles
- Local server architecture (Node.js backend)

### Changed
- Professional UI overhaul — CAD-grade design system
- VS Code-style layout — flex panels, copilot in toolbar
- Smooth viewport resize transitions
- Draggable split divider between 2D/3D

## [0.2.0] — 2026-02-19

### Added
- Seam tool — connect edges between pattern pieces
- Notch marks + grainline tool
- GLTF/GLB avatar loader (ReadyPlayerMe, MakeHuman)
- CI/CD auto-deploy to openclo.sdar.dev
- 82 unit tests across 7 suites
- 16 E2E test suites (Puppeteer)
- Mobile experience: fullscreen chat-only on <768px

### Changed
- TypeScript strict — clean build, no unused vars
- Professional motion design for UI transitions
- CSS dedup — shared utilities, ~40 duplicate declarations removed

## [0.1.0] — 2026-02-19

### Added
- Initial workspace — Vite + React + TypeScript + Three.js
- Pen tool with Bezier curves (click for corners, drag for smooth)
- Split-view 2D pattern editor + 3D viewport
- 2D to 3D sync — pattern pieces render as meshes around mannequin
- Parametric dress form mannequin
- Zoom/pan navigation
- Properties panel
- Keyboard shortcuts
- README + MIT license
