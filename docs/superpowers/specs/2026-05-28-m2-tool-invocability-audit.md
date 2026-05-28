# M2 — Tool Invocability Audit

> Audit-first arranque of M2 (per MVP v1 slice spec § 5 "M2 — Slice executes end-to-end in dev").
> Question: given the slice's 6-step chain (`planner → loadTemplate → placePieces → autoSew → runSimulation` + narration + confirmation), what is callable today from the agentic loop, with what shape, and where are the real gaps?
> **Read-only audit.** No code changes. Findings drive the M2 implementation plan, written separately.

**Date:** 2026-05-28
**Author:** Samuel + audit pass after PR #827 merge-readiness commit
**Source of truth for the chain:** `docs/superpowers/specs/2026-05-27-mvp-v1-vision-validating-slice-design.md` § 2

---

## 0. TL;DR

The slice spec's 6-step chain is a **conceptual** description, not a 1-to-1 map of registered tools. The actual surface collapses to **2 invokable tools** that already bundle most of the chain:

- `loadSeamlyPattern({patternId, autoSew, simulate})` — load + (optional) autoSew + (optional) startSim in a single call
- `runGarmentPipeline({minConfidence, skipSimulation, skipAutoSew})` — autoSew + startSim, assumes pieces loaded

Three tools the spec names (`loadTemplate`, `placePieces`, `runSimulation`, `autoSew` as standalone, `planner.planFor` as module) **do not exist by those names**. Equivalents or substitutes exist in 4 of 5 cases.

What is **really missing** for the slice is not tools. It is three coordination surfaces:

1. **System-prompt bias** to make the LLM-as-planner call the right tools in the right order from "vestir el avatar con una camisa".
2. **In-tool narration events** so the user sees *"Cosiendo 12/16"* during execution, not silence-then-result.
3. **Confirmation gate** between plan and execute (the chat loop today runs straight through).

These three are the M2 implementation work. Everything else is plumbed.

---

## 1. Chain-to-registry map

| Spec step | Spec tool name | Reality | Status |
|---|---|---|---|
| 1. Receive intent | `bridge.send(intent)` | `UnifiedBarChat.handleSend` → `useAgenticLoop.run` → `AgenticLoop.runInner` | ✅ live |
| 2. Plan | `planner.planFor(intent) → ToolCall[]` | **No module.** Planning is done by the LLM inside `AgenticLoop.runInner` via standard tool-calling. The "planner" is implicit in the system prompt + tool descriptions. | ⚠️ category gap — see §3.1 |
| 3. Load template | `tools.loadTemplate({id})` | `loadSeamlyPattern({patternId, clearFirst?, autoSew?, simulate?})` in `seamlyTools.ts`. `templateTools.ts` is intentionally empty (deprecated header). | ✅ exists under different name |
| 4. Place pieces | `tools.placePieces({auto: true})` | **No tool.** Placement is internal logic invoked during simulation startup in `Viewport3D` / `GarmentSimulation` via `garmentPlacement.ts`. Not LLM-callable as a discrete step. | ⚠️ silent — see §3.2 |
| 5. Auto-sew | `tools.autoSew({threshold: 0.4})` | **No `autoSew` tool by that name.** `autoSewTools.ts` exports only `autoDetectSeams` (detection without apply). The actual auto-sew-and-apply runs inside `loadSeamlyPattern` (when `autoSew: true`) or `runGarmentPipeline` (when `skipAutoSew: false`). | ✅ exists as bundled side-effect |
| 6. Simulate | `tools.runSimulation({duration: ~10s})` | **No `runSimulation` tool.** `simulationTools.ts` has `startSimulation` (parameterless), `pauseSimulation`, `setFitMapMode`, etc. Duration is not a parameter — sim runs until paused. | ⚠️ shape mismatch — see §3.3 |

### Bonus tools available

- `listSeamlyPatterns` — enumerates available patterns with piece counts (needed for the "Tengo Male Shirt (17 piezas)" confirmation in step 2 of the spec UX flow)
- `setInterfacing`, `setSolidify` — fabric property tuning (not in slice, available for post-result iteration)
- `saveSimulationState` / `restoreSimulationState` — snapshot management (not in slice)

### Tools that look applicable but aren't (false friends)

- `runGarmentPipeline` — bundles autoSew + startSim but **requires pieces already loaded**. Returns error: *"No pieces loaded. Use loadSeamlyPattern or a blueprint first."* So in practice the chain reduces to `loadSeamlyPattern({patternId, autoSew: true, simulate: true})` as a single call, or two-call `loadSeamlyPattern → runGarmentPipeline`.

---

## 2. What the agentic loop already provides

`src/copilot/reasoning/bridge/AgenticLoop.ts:108-212` — the LLM drives the loop:

- System prompt is built from `buildDomainBootstrap()` + retrieved knowledge chunks + meta-tool descriptions + action-tool descriptions
- LLM emits tool calls → registry executes → results pushed back as `role: 'tool'` messages → loop continues until LLM emits text with no tool calls
- Events fired: `tool:start` / `tool:complete` / `tool:error` / `text:delta` / `complete` / `error`
- `useAgenticLoop` hook surfaces these to React state for UnifiedBarChat to render

**Implication:** there is no separate planner that needs to be built. The LLM IS the planner. What the spec calls `planner.planFor` is whatever sequence of tool calls the LLM emits given the system prompt + the user's intent.

This collapses the M2 architectural risk #1 from the spec (*"Planner may not handle multi-step intents — may require extending AgenticLoop"*) to a **prompt-engineering risk**, not a code-architecture risk.

---

## 3. Real gaps (the M2 work)

### 3.1 Planner-as-prompt — domain bias for "vestir el avatar"

The LLM, given today's tool list (50+ tools across 40+ modules), needs to be biased toward the right call sequence from a Spanish intent. Two sub-gaps:

- **No intent → tool-call examples in the system prompt.** `buildDomainBootstrap()` exists (`src/copilot/reasoning/bridge/domainBootstrap.ts`) — need to read it to see if it already covers "vestir avatar"-class intents. Bias should be: *"User intent: vestir/poner/colocar prenda → first call `listSeamlyPatterns` to enumerate options → propose one → on confirmation call `loadSeamlyPattern` with `autoSew: true, simulate: true`."*
- **Tool description tuning.** `loadSeamlyPattern`'s description is *"Load a Seamly2D pattern into the editor. Resolves all construction geometry and builds pattern pieces."* — accurate but doesn't bias toward this as the answer to a dressing intent. The description for `runGarmentPipeline` mentions *"the 'one click' experience"* which is exactly what María's intent matches.

**Risk:** the LLM may diverge into 5+ unnecessary `getGarmentState` / `searchPieces` / etc. meta-tool calls before getting to the right action. The 30-min slice budget can't absorb that.

### 3.2 Placement is invisible

`garmentPlacement.ts` runs during simulation startup (`Viewport3D` / `GarmentSimulation`). The agent has no event hook to narrate *"Colocando alrededor del avatar..."*. Today the user sees:

1. LLM says "loading"
2. Long silence
3. Pieces appear placed + sewn + simulating

The spec's UX flow (`State 2 — Executing`) requires a single updatable progress line showing the current step. Today's `tool:start` / `tool:complete` events fire only at tool-call boundaries — they don't surface sub-step progress.

**Two options for M2:**

- **(a) Emit synthetic progress events from the LLM.** The LLM narrates between tool calls: *"Cargando piezas..."* (text), then `loadSeamlyPattern`, then *"Listo. Las piezas están sobre el avatar."* (text). Cheap, but the LLM doesn't actually know when placement happens vs autosew vs sim — it just narrates plausibly.
- **(b) Surface real progress from `loadSeamlyPattern` execution.** Modify the tool to emit intermediate events (`loadSeamlyPattern:phase=placement`, etc.) and have `AgenticLoop` forward them through `onEvent`. More honest, more work, requires extending the `AgenticEvent` union with a `tool:progress` variant.

Recommendation in M2 plan: start with (a), upgrade to (b) only if María explicitly notices the silence in a dry-run.

### 3.3 No confirmation gate

Spec step 2 ("Plan") requires the agent to say *"Tengo Male Shirt (17 piezas). ¿La uso?"* and **wait for confirmation** before step 3. Today's loop does not pause — `AgenticLoop.runInner` is a `while(true)` that only exits when the LLM emits text with no tool calls.

**Mechanism options:**

- **(a) Convention-only.** Tell the LLM in the system prompt: *"For multi-step actions, propose the plan in text first, list the tools you'll call, and STOP. Wait for the user to confirm before calling tools."* Then the loop naturally returns control because the LLM emits text without tool calls. The next user message ("sí") triggers a new `run()` call where the LLM proceeds. **Zero code change.** Risk: LLM may not honor the convention reliably under different providers.
- **(b) A `proposePlan` meta-tool.** A read-only tool the LLM calls with the planned tool sequence as JSON. The loop intercepts this call, surfaces it to the UI, and pauses awaiting user confirmation. More reliable. Requires extending meta-tool plumbing.

Recommendation: start with (a) for the slice. Promote to (b) only if (a) fails in dry-run.

### 3.4 `runGarmentPipeline` vs `loadSeamlyPattern({simulate: true})` — which to use

Two tools cover the same end-state. The LLM will pick one. Implications:

- `loadSeamlyPattern({patternId, autoSew: true, simulate: true})` — **single call**, but tightly couples load+sew+sim. If sim fails after load+sew succeeds, the tool returns error and the user sees a single failure event. Bad granularity for narration.
- `loadSeamlyPattern({patternId}) → runGarmentPipeline({})` — **two calls**, finer granularity. Each emits its own `tool:start`/`tool:complete`. Better for narration. But `runGarmentPipeline` redundantly re-runs detection over already-sewn pieces if `loadSeamlyPattern` already autoSewed.

Decision needed in M2 plan. My recommendation: **two-call shape** with `loadSeamlyPattern({patternId, autoSew: false, simulate: false})` followed by `runGarmentPipeline({})`. Clean separation, predictable narration boundaries.

### 3.5 Honest failure surface

Spec § 2 "Failure modes" requires:

- *"Mesh CDT timeout (60-120s)"* → *"Esto está tardando — el patrón es complejo. Sigo intentando."*
- *"Autosew leaves orphan piece"* → *"Cosí 15 de 16 costuras. La pieza X quedó suelta."*
- *"Solver tier degrades GPU→WASM→CPU"* → *"Cambié a motor más estable."*

None of these surface today. The tools return success/error binary; no progress, no degradation events. Worth flagging as **deferred to mid-M2**: the slice can ship with simple binary failure first, calibrated narration second.

---

## 4. Pre-existing infrastructure that is already a strength

- `AgenticLoop` parseArgs + error recording + duration tracking → solid foundation
- `ToolRegistry.validate()` validates JSON Schema params before execute → catches LLM malformed-call class
- `ToolRegistry.toAnthropicTools()` / `toOpenAITools()` → both provider shapes covered
- `useAgenticLoop` already exposes `toolCalls` array with `running` / `done` / `error` status → the UnifiedBarChat already renders this (visible in `UnifiedBarChat.tsx:207-223`)
- `loadSeamlyPattern` already supports `clearFirst` (default true) → no orphan state across runs
- `runGarmentPipeline` already returns structured `seamDetails` (per-seam confidence + applied) → narration can quote real numbers

**Implication:** M2 is much closer to runnable than the spec implied. The 9-step chain ("the 5 architectural risks") collapses to **3 prompt/narration changes** and a **2-call orchestration decision**.

---

## 5. M2 implementation order (proposed)

Not a plan — a sketch. Real plan goes through `superpowers:writing-plans` after Samuel reviews this audit.

1. **Read `domainBootstrap.ts`** — see what bias already exists.
2. **Write the dressing-intent system-prompt fragment** — *"User says vestir/poner/colocar prenda → enumerate patterns → propose → on confirm, load + pipeline."* Inject into `buildSystemPrompt`.
3. **Test the convention-only confirmation gate** — dry-run with `loadSeamlyPattern({patternId: 'male_shirt'})` then `runGarmentPipeline({})` to see if the LLM (a) proposes, (b) waits, (c) executes after "sí".
4. **Add narration text between tool calls** — system prompt says: *"Before each action tool call, emit a brief Spanish progress line."*
5. **Verify the 6-step UX flow renders correctly in UnifiedBarChat** — toolCalls array + assistant text messages should produce the spec's State 1 → State 2 → State 3 visual.
6. **Run on Samuel's machine 3× clean browser** (MVP v1 PR2 + PR4 gate).
7. If 3× clean, M2 closed. Schedule María session (M3).

Stretch: real per-phase progress events from `loadSeamlyPattern` execution (gap 3.2 option b). Defer until María dry-run says silence is a problem.

---

## 6. What this audit explicitly does NOT do

- Does not propose code changes
- Does not write the system prompt fragment (that's the M2 implementation, gated by Samuel's review of this audit)
- Does not modify any tool definition
- Does not validate that the LLM will actually honor the convention-only confirmation gate — that's an empirical test in step 3 of the order above
- Does not touch `placement` internals — silent placement is accepted for M2 v1; honest narration is upgradable

---

## 7. Risks flagged for the M2 plan

1. **Tool flood.** 50+ tools across 40+ modules in the registry. Even with good prompt bias, the LLM may waste calls on unrelated tools. Mitigation: in M2 system prompt, narrow the tool surface for dressing-class intents (only meta-tools + the 4-6 dressing-relevant tools).
2. **Convention drift.** Convention-only confirmation gate works fine in Claude Sonnet; may not work in OpenAI / Ollama / DeepSeek. Mitigation: test all 4 providers in M2 step 3 dry-run. If any diverges, promote gap 3.3 from convention (a) to meta-tool (b).
3. **`loadSeamlyPattern` returning success without pieces visible.** The DoD epic #506 is intentionally red until `#527/#518/#556/#531` close. If those bugs are still live during M2 dry-run, the chain will execute "successfully" without a dressed avatar. The slice spec § 0 explicitly notes this — María session is gated on M3 PR2 (3 consecutive successful runs). If we can't get 3 in a row, that's data, not a blocker for M2 build.
4. **Knowledge retrieval latency.** `AgenticLoop.runInner` does `await this.retrieveKnowledge(userRequest)` before every send (line 122). If `KnowledgeStore.search` is slow, every confirmation round-trip pays the cost. Measure during M2 step 3.

---

## 7.5 Dry-run verification — Claude Sonnet (2026-05-28)

After landing the dressing-intent prompt fragment (commit `e432f7bc`), the convention-only confirmation gate was tested via `scripts/m2-prompt-dry-run.mjs`. Feeds the actual `buildDomainBootstrap()` output + the 3 dressing-relevant tool descriptions to `claude --print --system-prompt-file ...` across 4 conversation states. Results:

| Turn | Input state | Expected | Observed |
|---|---|---|---|
| 1 | User: *"Quiero vestir el avatar con una camisa."* | Call `listSeamlyPatterns({})` + brief Spanish narration | ✅ `listSeamlyPatterns({})` + *"Buscando camisas en el catálogo…"* |
| 1.5 | `listSeamlyPatterns` returned 3 patterns, no user message yet | **STOP**, propose, no tool call | ✅ `(none — waiting for user confirmation)` + *"Tengo dos opciones: Male Shirt (17 piezas) o Tshirt (5 piezas). ¿Cuál uso?"* — also surfaced the alternative without being asked |
| 2 | User: *"Sí, úsala."* (Male Shirt implied) | `loadSeamlyPattern` with `clearFirst: true, autoSew: false, simulate: false` | ✅ exact args, + *"Cargando piezas…"* |
| 3 | `loadSeamlyPattern` succeeded, no user message | `runGarmentPipeline({})` | ✅ + *"Cosiendo y simulando…"* |

All four match the spec. Audit gaps §3.1 (prompt bias), §3.2 (narration convention, option a), §3.3 (confirmation gate as convention, option a), and §3.4 (two-call shape) are verified on Sonnet.

**Not yet verified on**: OpenAI / Ollama / DeepSeek. Per audit risk #2, if the convention drifts on any of those, promote gap 3.3 from convention to a `proposePlan` meta-tool. Re-run with `node scripts/m2-prompt-dry-run.mjs` after any prompt edit.

**Limits of this verification**:
- Text-based simulation, not real provider function-calling JSON. The prompt comprehension is what's tested; the structured-call shape is provider-specific and only observable in the browser dry-run.
- Single-shot turns, not a continuous loop session. Each turn is fed the prior context as an opaque conversation log.
- No failure-path coverage (tool error, malformed result, abort mid-flow).

## 8. References

- Slice spec: `docs/superpowers/specs/2026-05-27-mvp-v1-vision-validating-slice-design.md`
- Loop: `src/copilot/reasoning/bridge/AgenticLoop.ts`
- Hook: `src/copilot/hooks/useAgenticLoop.ts`
- Chat surface: `src/components/shell/UnifiedBarChat.tsx`
- Registry: `src/copilot/action/tools/registry.ts`
- Key tools: `seamlyTools.ts`, `garmentPipelineTool.ts`, `simulationTools.ts`, `autoSewTools.ts`
- DoD test (intentionally red until #506 closes): `tests/e2e/dress-avatar-dod.spec.ts`
- D4 ratification (post-supersedence): `docs/reports/2026-05-01-drift-fase2-d4-copilotpanel-composition.md`
