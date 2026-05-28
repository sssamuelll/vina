# MVP v1 — Vision-Validating Slice Design

> One agentic intent end-to-end. "Vestir el avatar con una camisa" executed via UnifiedBarChat with narration, on-demand tools, and a recorded session with User 1 (María, patronista at Adidas).
> Scope: a single intent slice that validates the agentic-CLO3D-reversion vision before broader UX investment.

**Status:** Approved (Samuel, 2026-05-27)
**Target session date:** Week of 2026-06-15 (realistic range 2026-06-15 to 2026-06-22)
**Authors:** Samuel + brainstorming session orchestrated by Halcyon, with inputs from Halcyon (strategic), Lyra Sage (asymmetry), Aurelius Voronov (ontological reframe), and two Explore audits (backend reality + UX layer post-redesign)
**User 1:** María — patronista at Adidas, professional reference points Lectra/Gerber/Optitex/CLO3D
**Related epic:** #506 (Sewing Pipeline) — to be frozen on current passing templates as a precondition

---

## 0. Why this spec exists

After ~8 weeks of openclo development producing 447 commits, 28 ratified audit ejes, 4436 unit tests passing, and 4 templates passing the DoD harness (Male Shirt, T-Shirt, Pajama Top, Jacket), Samuel reported being "varias semanas perdido" in the project. A multi-agent brainstorming session surfaced a structural tension:

| Voice | Reading |
|---|---|
| Halcyon (strategic) | 8 hard blockers, 74 of 125 issues are distractions for María, 3-5 more PRs to ship |
| Lyra Sage (asymmetry) | The #506 chain is fractal (bar lowered 3x in 4 days), not converging; one session with María > 8 weeks of guessing |
| Explore (backend reality) | Happy path is 85-90% functional end-to-end today |
| Verification (capability map) | Samuel's "MVP = three things" is actually three separate sub-projects of widely different size |
| Aurelius Voronov (ontological reframe) | The debate is unresolvable in current configuration because openclo has no *afuera del sistema* — no testigo. The María-función operates as an idealized evaluator that never appears. |
| UX layer audit | Hypothesis "UX broken, backend intact" CONFIRMED. CopilotPanel is orphan; UnifiedBarChat is the live surface. ~9,200 LOC of orphan UI. Tool duplication (`assignFabric` vs `setFabric`). LogoMenu iterating without spec. |

Samuel's own vision (declared in the same session) clarified the corrective:

> *"Una reversión de CLO3D, pero agéntico, web, ligero, y con una interface más fresca. En vez de cientos de posibilidades que lo agobien, search bar / AI agent al que le diga qué quiere hacer, y este le da las herramientas específicas de la acción que desea para que pueda editar a su gusto en la interface."*

This spec resolves the tension by designing the smallest unit that validates the vision: **a single agentic intent, end-to-end, witnessed by María**.

---

## 1. The Intent (keystone)

### Intent literal

> **"Quiero vestir el avatar con una camisa."**

Acceptable paraphrases the agent must tolerate: *"vísteme el avatar con una camisa"*, *"ponle una camisa al avatar"*, *"necesito ver una camisa puesta en este avatar"*.

### Why this intent

| Reason | Evidence |
|---|---|
| Most-tested backend path | Male Shirt: 17 pieces, 16 seams, passes DoD; recent fixes #818 (autosew bridging), #820 (Cyrillic), #824 (timeout) |
| Iconic CLO3D operation | "Vestir avatar" recognizable to any patronista without explanation |
| Exercises full chain | load → place → autosew → simulate → see drape |
| Agentic-friendly | Verbally clear, planner can decompose, narratable progress |
| Coherent with backend freeze | Zero new happy-path code; only the agentic entry wire is new |

### User-facing flow

1. María opens openclo. Avatar visible. UnifiedBarChat with placeholder hint.
2. She types: *"Quiero vestir el avatar con una camisa."*
3. Agent: *"Tengo Male Shirt en el catálogo (17 piezas, costura industrial). ¿La uso?"*
4. María: *"Sí."*
5. Agent narrates steps inline while executing: *"Cargando piezas… Colocando alrededor del avatar… Cosiendo costuras… Simulando…"*
6. Avatar appears dressed. Agent: *"Listo. ¿Quieres ajustar algo? [tela] [postura] [tallas] [exportar]"*
7. If she wants to adjust, the relevant tool appears on demand. If not, session ends.

### What María explicitly should NOT need to do

- Navigate the TemplateLibrary manually
- Find a "Dress" button
- Know what "autosew" or "placement" mean
- Open more than 1-2 panels
- Use any internal architectural term

### Variations explicitly deferred to future slices

- *"Cambiar tela a lino"* — iterative agentic post-dress
- *"Importar este DXF de Adidas"* — tests capability C (DXF import already works in code, needs agentic wire)
- *"Generar tech pack"* — tests export pipeline narrated by agent

Each becomes its own slice spec → brainstorm → plan → execute cycle.

---

## 2. The Agentic Chain (architecture)

### The 6-step chain

| # | Step | Tool (registry) | Narration | Gate |
|---|---|---|---|---|
| 1 | Receive intent | `bridge.send(intent)` | — | — |
| 2 | Plan | `planner.planFor(intent) → ToolCall[]` | *"Tengo Male Shirt (17 piezas). ¿La uso?"* | **Confirmation** |
| 3 | Load template | `tools.loadTemplate({id: "male_shirt"})` | *"Cargando 17 piezas…"* | — |
| 4 | Place pieces | `tools.placePieces({auto: true})` | *"Colocando alrededor del avatar…"* | — |
| 5 | Auto-sew | `tools.autoSew({threshold: 0.4})` | *"Cosiendo 16 costuras…"* | — |
| 6 | Simulate | `tools.runSimulation({duration: ~10s})` | *"Simulando drape…"* → *"Listo. ¿Quieres ajustar algo?"* | **Hand-off to iteration** |

### Components — reuse vs new

| Component | State (post-audit) | Notes |
|---|---|---|
| `UnifiedBarChat` | EXISTS (live surface) | Entry point — replaces orphan CopilotPanel |
| `CopilotPanel` | **ORPHAN — do not extend** | To be deleted in housekeeping P1 |
| `CommandBar`, `ActivityBar`, `views/` | Likely orphan (not fully verified in audit) | Verify before any extension |
| `bridge` + `AgenticLoop` | EXISTS, live | Documented in `docs/plans/2026-03-02-copilot-bridge-architecture-design.md` |
| `planner.planFor` | EXISTS PARTIAL | Multi-step intent capacity to verify during implementation |
| `tools.loadTemplate` / `placePieces` / `autoSew` / `runSimulation` | EXIST | Need verification that copilot can invoke programmatically (not just via UI click) |
| `tools.assignFabric` + `tools.setFabric` | **BOTH EXIST — duplicated, no alias** | Disambiguate in housekeeping P2 |
| `recordMessage` (narration helper) | EXISTS per audit eje D4 | — |
| Intent → plan mapping ("vestir camisa" → 5 tool calls) | **NEW** | Most sensitive part of the slice |
| Narration tone (professional, non-patronizing) | **NEW** | Calibrated with María in session |
| Confirmation gates (pre-load + post-result only) | **NEW** | — |
| On-demand tool exposure (post-result) | **NEW** | See Section 3 |

### Prerequisites — housekeeping before slice build

| # | Pre-req | Why | Effort |
|---|---|---|---|
| **P1** | Decide formally: UnifiedBarChat IS the surface. Delete (not archive) CopilotPanel + downstream orphan UI (~9,200 LOC) | Without this, the slice is built on ambiguity. The María-función inhabits exactly that ambiguity. | 1-2 days |
| **P2** | Disambiguate `assignFabric` vs `setFabric` — one stays, the other is deleted or aliased | Post-result "cambia tela" intent depends on it. LLM will pick wrong. | 0.5 day |
| **P3** | Fix Pause/Simulate inversion bug | María will hit this in step 6 | 0.5 day |
| **P4** | Write `docs/specs/UX-VISION.md` (1 page). Principle: *"AI-first / commands canonical / menús sólo para discovery"* | Without this, each slice decision contradicts a prior LogoMenu/shell decision | 0.5 day |
| **P5** | Decide SetupWizard destiny (mount or delete) | If María sees it on first click, must be resolved | 0.5 day (decision) |

**Total housekeeping: 3-4 days.**

### Data flow

```
[María types in UnifiedBarChat]
        ↓
[bridge.send]
        ↓
[AgenticLoop.run]
   ├─ planner.planFor("vestir avatar con camisa")
   │     → [{tool: "loadTemplate", args: {id: "male_shirt"}}, ...5 total]
   │
   ├─ Pre-execute gate: agent shows plan, asks confirmation
   │     → María: "Sí"
   │
   └─ for each step:
        ├─ recordMessage(narration[step])
        ├─ tools[name].execute(args) → ToolResult { ok, data, error, rollback }
        ├─ on ok: continue
        └─ on error: recordMessage(honest report), offer recovery
                     (retry / skip / cancel / switch template)
        ↓
[Final state: avatar dressed, simulation steady]
        ↓
[Agent: "Listo. ¿Quieres ajustar algo? [tela] [postura] [tallas] [exportar]"]
        ↓
        ├── "cambia tela a lino" → tools.changeFabric.execute({fabric: "linen"})
        ├── "exportar" → tools.exportGarment.execute({...})
        └── (closes / no response) → session ends
```

### Failure modes — agent reports honestly, NOT silent degradation

| Failure | Expected agent report |
|---|---|
| Template won't load | *"No pude cargar Male Shirt. ¿Probamos T-Shirt?"* |
| Mesh CDT timeout (60-120s) | *"Esto está tardando — el patrón es complejo. Sigo intentando."* (no silent wait) |
| Autosew leaves orphan piece | *"Cosí 15 de 16 costuras. La pieza X quedó suelta. ¿La dejo así o reintento con tolerancia más alta?"* |
| Solver tier degrades (GPU → WASM → CPU) | *"Cambié a motor más estable."* (optional for slice; transparency without alarm) |
| Simulation doesn't converge | *"La tela quedó inestable. Probablemente las costuras quedaron tensas. ¿Reintento con configuración suave?"* |

This is opinionated — contrary to the project's current pattern of silent fallbacks. The vision requires the agent be honest.

### Architectural risks flagged

1. **Planner may not handle multi-step intents.** If `planner.planFor` is optimized for single-tool calls, the chain coordination may require extending AgenticLoop.
2. **Tool coordination gaps.** Backend works via UI click. Programmatic invocation may reveal coupling that doesn't show in human use.
3. **Narration tone.** Professional patronista may find conversational AI narration patronizing. Calibrate empirically with María.
4. **Orphan-cascade.** If 9,200 LOC orphan is not deleted, every future development session (human or LLM) will trip on the latent fork. Precedent: `useKeyboardShortcuts`.
5. **Test infrastructure thrash.** The pattern of 4 PRs in 5 days for timeout-bumps masks real flakiness. The slice must have deterministic tests differentiated from "expected flaky" tests.

---

## 3. UX of the Slice (on-screen)

**Principle:** screen shows minimum. Agent is traffic director. Tools appear on-demand and disappear when not used. Zero menus expanded by default.

### Base layout (empty state, pre-intent)

```
┌──────────────────────────────────────────────────────┐
│  openclo                          [user]   [...]     │
├──────────────────────────────────────────────────────┤
│                                                      │
│                  [3D viewport]                       │
│                avatar standing here                  │
│                                                      │
├──────────────────────────────────────────────────────┤
│  ⌨️  ¿Qué quieres hacer?                              │
│     Prueba: "vestir el avatar con una camisa"        │
└──────────────────────────────────────────────────────┘
```

**Absent:** persistent toolbar, sidebar, properties panel, expanded file menu, pieces list, layers panel. If something must appear, the agent invokes it.

### State 1 — Intent received + confirmation

```
├──────────────────────────────────────────────────────┤
│                  [3D viewport]                       │
│                avatar standing                       │
├──────────────────────────────────────────────────────┤
│  María:  vestir el avatar con una camisa             │
│                                                      │
│  Agent:  Tengo "Male Shirt" en el catálogo           │
│          (17 piezas, costura industrial).            │
│          ¿La uso?                                    │
│          [Sí, úsala]  [no, muéstrame opciones]       │
└──────────────────────────────────────────────────────┘
```

### State 2 — Executing (single updatable progress line)

```
├──────────────────────────────────────────────────────┤
│         [3D viewport — pieces appearing,             │
│          placing, sewing, simulating]                │
├──────────────────────────────────────────────────────┤
│  ⚙️  Cosiendo 16 costuras...    (12/16)              │
│      ▓▓▓▓▓▓▓▓▓░░░░░░                                  │
└──────────────────────────────────────────────────────┘
```

**Single updatable line.** No process log scroll in chat — that would be noise. Agentic history lives in LLM memory, not on screen.

### State 3 — Result + iteration invitation

```
├──────────────────────────────────────────────────────┤
│         [3D viewport — avatar dressed,               │
│          fabric draping naturally]                   │
├──────────────────────────────────────────────────────┤
│  Agent:  Lista. ¿Quieres ajustar algo?               │
│                                                      │
│          [tela]  [postura]  [tallas]  [exportar]     │
│                                                      │
│  ⌨️  o escribe lo que quieras...                      │
└──────────────────────────────────────────────────────┘
```

**Dual affordance:** she can type ("cambia tela a lino") OR click a chip ("tela"). Both produce the same intent.

### State 4 — On-demand tool (fabric change example)

```
├──────────────────────────────────────────────────────┤
│         [3D viewport — avatar dressed]               │
│                                                      │
│    ┌───────────────────────────────┐                 │
│    │  Tela                          │                 │
│    │  ○ Algodón  ● Lino  ○ Seda    │                 │
│    │  ○ Lana     ○ Polyester        │                 │
│    │                                │                 │
│    │  [aplicar]  [cancelar]         │                 │
│    └───────────────────────────────┘                 │
├──────────────────────────────────────────────────────┤
│  Agent:  Aquí tienes opciones. La tela actual es     │
│          algodón. Cambia y veré cómo cae.            │
└──────────────────────────────────────────────────────┘
```

**Tool appears only when needed, disappears when closed.** Never persists "just in case".

### Tool affordance pattern

| User action | Agent behavior | Tool appears as |
|---|---|---|
| "cambia tela" | Confirms intent, invokes tool | Floating overlay in viewport |
| "rota esta pieza" | Identifies piece by context/click, invokes tool | 3D in-context handles on the piece |
| "exporta" | Asks format if ambiguous | Small modal with options |
| "ajusta tallas" | Invokes measurement panel | Temporary side panel (closes on confirm) |

**Unifying rule:** a tool never persists beyond its use. Interface returns to minimum state when action ends.

### Explicitly OUT of slice scope

| Out | Reason |
|---|---|
| Persistent 2D/3D toolbar | Anti-vision. If a tool is needed, agent invokes it. |
| Sidebar (layers / pieces / projects) | Reappears only if María explicitly asks |
| LogoMenu File/Edit/View/Pattern expanded | Documented contradiction with vision (audit finding #4) |
| SetupWizard | Skipped for slice — she enters directly to avatar |
| Theming / dark mode / preferences | Deferred |
| Multi-user / save-as / multiple projects | Deferred. One project in memory. |
| Onboarding tutorial / hints | Deferred. Input placeholder is the only hint. |
| Exhaustive keyboard-nav accessibility | Minimum: enter to submit, esc to close tool. Rest deferred. |
| Internationalization | Spanish hardcoded for slice |
| Transition animations | Deferred. States can be hard cuts. |

### NOT designed in this section (delegated to implementation / iteration)

- Typography, colors, exact palette — Iris Tane critique if needed
- Exact microcopy of each agent message — Solace Wren refinement if needed
- Hover / focus / loading micro-states
- Responsive layout (desktop assumed for v1, mobile deferred)
- Exact placement coords / spacing / sizing

### UX risks flagged

1. **Agent narration may feel patronizing.** "Cosiendo 16 costuras…" may sound like explaining the obvious to a pro. Test: does she find progress useful or redundant?
2. **Empty→executing transition may be disconcerting.** Without onboarding, she sees avatar + bar. If she can't think what to type, she's stuck. Mitigation: concrete placeholder example. If insufficient, add 2-3 initial suggestion chips.
3. **On-demand tools may feel magical but also opaque.** If she doesn't know what tools exist, she doesn't know what to ask. Mitigation: post-dress chips teach vocabulary. Pre-dress, she only knows the placeholder example.
4. **Viewport may feel empty in base state.** For a patronista used to dense Lectra/Gerber interfaces, void may read as "not finished". Test: does emptiness communicate intentionality or missing feature?

---

## 4. Success Criteria + Session Protocol

The most critical section. This is where the testigo enters.

### Success criteria (multi-dimensional)

| # | Dimension | Concrete question | How measured |
|---|---|---|---|
| **1** | Functional | Did the chain execute end-to-end without crash? | Observable: avatar ends dressed, no visible error |
| **2** | Cognitive | Did María understand what happened? | Post-session: she describes the flow in her own words, without Samuel explaining. *"Escribí X, y el sistema hizo Y"* → passed. *"No sé cómo lo hizo"* → failed. |
| **3** | Affective | Was her reaction engaged? | Honest read: did she lean toward the screen or away? More questions or wanted to end? |
| **4** | Vision-relevance | Did she see something NOT available in Lectra/CLO3D that mattered to her? | She mentions the agentic flow as differential — without Samuel prompting. E.g.: *"qué cool que le hablo y entiende"*. |

### Validation rule

**Vision validated = at least 3 of 4 dimensions positive, INCLUDING #4.**

If only #1 (functional) passes without #4 (vision-relevance), vision is NOT validated — it means there is a technical demo, not an agentic product. Reopen scope conversation.

### Pre-session checklist

| # | Item | Status | Why |
|---|---|---|---|
| **PR1** | Housekeeping P1-P5 complete | ✅ / ❌ | Without it, slice built on ambiguity |
| **PR2** | Intent executes end-to-end in <90s on Samuel's machine, 3 consecutive runs, no manual intervention | ✅ / ❌ | If not repeatable for him, won't be for her |
| **PR3** | Agent narration calibrated — messages sound like "competent assistant", not "tutorial" | ✅ / ❌ | Tone is the difference between validation and demo-feria |
| **PR4** | Environment works on a different machine (María's laptop, or at least a fresh browser without Samuel's profile) | ✅ / ❌ | Verifies no local cache/state dependency |
| **PR5** | A person NOT involved with openclo tried the flow and completed. If unavailable, Samuel himself does it from scratch in a clean browser with "first-time mind". | ✅ / ❌ | Pre-test of the María-función |
| **PR6** | Consent from María for screen + audio recording | ✅ / ❌ | Without capture, event is lost |
| **PR7** | Decided fallback if slice crashes live: abort session or continue with old UI? | Documented decision | Don't improvise under pressure |
| **PR8** | External third-party reviewer secured to evaluate recording against pre-registered criteria (see PR9). Must be someone outside openclo development and outside Samuel-María household. Acceptable: an LLM with explicit prompt + criteria, a fashion-CAD-literate acquaintance, a developer friend reviewing UX with the criteria framework. | ✅ / ❌ | Aurelius critique mechanism #1 + #4 — breaks auto-referencia by externalizing dim evaluation |
| **PR9** | Success criteria (dims 1-4) and decision gate matrix are pre-registered in a separate timestamped file BEFORE the session. Samuel signs (commits) the file. File is NOT modified post-session. | ✅ / ❌ | Aurelius critique mechanism #2 — dim #4 cannot be retroactively inclined |

**Rule:** if any item is ❌, do NOT conduct the session. Don't burn the testigo on broken state.

### Session protocol — rules Samuel obeys

| # | Rule | Why |
|---|---|---|
| **R1** | Max time: 30 minutes. Visible timer. | Long sessions are research, not validation. The question is "does the vision land?" — visible in 5-15 min. |
| **R2** | **Samuel does not explain what to do.** Hand her the laptop: *"esto es openclo. Quiero ver cómo lo usarías. No te voy a guiar."* Period. | *"Sin tu mediación explicativa."* The María-función lives in his mediation. Silence it. |
| **R3** | Samuel does not answer technical questions during session. If she asks *"¿qué hace este botón?"*, he says *"prueba a ver"*. If she asks *"¿es normal que tarde tanto?"*, *"¿qué piensas tú?"*. | His answers reintroduce the idealized evaluator. Her interpretation must be hers, unpatched. |
| **R4** | Samuel does not fix bugs live. If something breaks, he notes it silently and lets her react. | Live-fixed bugs are erased data. |
| **R5** | Samuel writes verbatim during session. No interpretation — capture her exact words, pauses, where she looks on screen. | Interpretation comes later. In the moment, he is scribe. |
| **R6** | If she gets stuck >90 seconds without action, he waits. Does not rescue. Friction is signal. | The rescue impulse is the symptom. If she doesn't find the path, that IS the data. |
| **R7** | Does not request explicit feedback at end ("¿qué te pareció?"). Thanks her and lets her speak spontaneously. | Requested feedback is performance. Spontaneous reaction is signal. |

### Failure-handling — impulses to resist

| Impulse | What to do instead |
|---|---|
| *"Déjame mostrarte cómo funciona realmente"* | Stay silent. Question is whether it works without showing. |
| *"Es que el rediseño todavía está en proceso"* | Don't justify. If justification is needed, that is data about the vision. |
| *"¿No quieres probar otra cosa?"* | If she's done, she's done. Don't prolong. |
| *"Es que esto debería ser así…"* | Don't correct her mental model. Her model is what's being measured. |
| *"¿Te gustó?"* | Open question or nothing. |

### Capture

| Channel | How |
|---|---|
| Screen + audio | OBS / Loom / OS native. Ensure agent narration audible if it has sound (likely just text). |
| Samuel's notebook | Verbatim notes during. No transcription, only events: *"15:32 — types 'vestir avatar' — 4s pause — adds 'con una camisa'"*. |
| Screenshots with timestamps | After, not during. Mark key moments in recording. |
| Her laptop / her browser if possible | Better than Samuel's machine. If only his, note potential effect. |

### Post-session synthesis

| # | Step | Owner | Output |
|---|---|---|---|
| **S1** | External reviewer (PR8) watches the recording WITHOUT Samuel's interpretation, evaluates dims 1-4 against pre-registered criteria (PR9) | External | Independent ✅/❌ per dimension |
| **S2** | Samuel watches recording once without pausing. Just observes. | Samuel | His general sensation (calibrates dim #3 from his side) |
| **S3** | Samuel watches with pauses, annotates every friction moment (≥3s pause, ≥1 frown, ≥1 "hmm") | Samuel | List of real frictions with timestamps |
| **S4** | Compare external evaluation vs Samuel's. Where they diverge, external prevails for dim #4 (vision-relevance); Samuel can dispute with explicit written reasons that go on record. | Joint | Final dim table |
| **S5** | If vision validated → document what worked and didn't, plan next intent | Samuel | Spec of next slice |
| **S6** | If vision partial/not validated → identify failed dimension and why → trigger decision gate | Samuel | Next-step decision |

### Decision gate

| Result | Next step |
|---|---|
| 4/4 dims positive, including vision-relevance | Vision validated with high confidence for this user-1 + this intent. Design next intent slice (cambiar tela / importar DXF / etc.). Accelerate UX consistency housekeeping. |
| 3/4 positive, including vision-relevance | Vision validated with caveat. Identify failed dim and attack specifically before next slice. |
| 3/4 positive WITHOUT vision-relevance | Good demo but agentic vision didn't land for María. **Three sub-cases to distinguish:** (a) slice chosen was wrong but vision sound → try a different intent slice; (b) vision needs reconceptualization → reopen scope brainstorm; (c) **María is not the right user-1 for this vision** — openclo target audience may not be Lectra-trained patronistas; reconsider user-1 selection WITHOUT revising vision. The c-case is the cell that protects against the "vision blindada" critique while preserving Samuel's autonomy as project author. |
| ≤ 2/4 | Vision not validated for this configuration. Distinguish: (i) execution problem (slice broken in ways that obscured the vision) → fix and retry; (ii) user-1 mismatch → reconsider audience; (iii) structural critique still valid → reopen ontological conversation. |

### Risks flagged

1. **Risk of self-deception.** Samuel evaluates the 4 dims after. María-función can infiltrate his interpretation. Mitigation: share recording with someone external (not family, not co-developer if any) for a second read. If no one available, pass recording + notes to an LLM with prompt "audit my interpretation looking for wishful thinking".
2. **Risk of protecting María from hard feedback.** If she hated it, he'll want to soften. Mitigation: decide NOW, before session, what specific signal means "vision rejected". E.g.: if in 30 min she never mentions the agentic aspect as differential, that IS rejection of dim #4 regardless of how polite she was.
3. **Risk of over-design of protocol.** These rules can become a cage and kill the session organically. Mitigation: rules are for Samuel's behavior (mediation), not for hers. She conducts as she wants; he obeys R1-R7.

---

## 5. Plan + Timeline

### Milestones — binary checkpoints

| # | Milestone | Binary criterion | Triggers next |
|---|---|---|---|
| **M1** | Housekeeping complete (P1-P5) | Orphan UI deleted, fabric tools disambiguated, Pause/Simulate fix, `UX-VISION.md` written, SetupWizard decided | M2 can start |
| **M2** | Slice executes end-to-end in dev | Intent produces dressed avatar without error, no manual intervention — **on Samuel's machine, 1 time** | M3 can start |
| **M3** | Slice repeatable + clean-machine ready | 3 consecutive successful runs + works on fresh browser/different machine (PR2 + PR4) | María session can be scheduled |
| **M4** | María session conducted | Recording + verbatim notes + 30 min complete | Synthesis can start |
| **M5** | Synthesis + decision gate triggered | 4 dimensions evaluated honestly; next step decided per Section 4 matrix | Closes MVP v1 ↦ next slice or reframe |

### Timeline estimate

Today is **2026-05-27 (Wednesday)**.

| Period | Work | Milestone target |
|---|---|---|
| Thu 2026-05-28 → Mon 2026-06-01 (3-4 business days) | Housekeeping P1-P5 | **M1** Mon 2026-06-01 |
| Tue 2026-06-02 → Fri 2026-06-12 (~2 weeks) | Slice build: intent mapping, narration, on-demand tools, failure handling, tests | **M2** ~Fri 2026-06-12 |
| Sat-Sun 2026-06-13/14 (buffer) | Repeatability runs, dry-run with external person | **M3** Mon 2026-06-15 |
| Mon-Wed 2026-06-15 → 2026-06-17 | Schedule + conduct María session | **M4** ~Wed 2026-06-17 |
| Thu-Fri 2026-06-18/19 | Synthesis + decision gate | **M5** Fri 2026-06-19 |

**Target María session: week of 2026-06-15.**
**Total wall-clock from today: ~3.5 weeks.**

Honest estimate, not optimistic. If housekeeping reveals more rot than expected, M1 slides and everything else with it.

### Parallelizable within each milestone

**Within M1 (housekeeping):**
- P2 (fabric tools), P3 (Pause/Simulate), P4 (UX-VISION.md), P5 (SetupWizard) — independent, day 1 each
- P1 (delete 9,200 LOC orphan UI) — sequential, riskiest, occupies days 2-4

**Within M2 (slice build):**
- Intent → plan mapping
- Narration tone (Solace Wren can be invoked)
- On-demand tool exposure pattern (floating overlay)
- Failure handling for the 5 modes in Section 2
- Deterministic tests for the chain

Can parallelize on separate branches. Serial adds 1-3 days to M2.

**Within M3 (repeatability):**
- Dry-run on Samuel's machine (3x)
- Dry-run in clean browser (1x)
- Dry-run with external person (ideal — if not, Samuel with "fresh mind")

Sequential by nature.

### Risk buffers

| Risk | Probability | Recommended buffer |
|---|---|---|
| Deleting 9,200 LOC orphan breaks something that wasn't orphan | Medium | +2 days in M1 |
| Planner doesn't natively handle multi-step intents, requires extending AgenticLoop | Medium-high | +3-5 days in M2 |
| Narration tone needs several iterations to avoid sounding patronizing | High | Continuous iteration, no fixed buffer |
| María's calendar doesn't match week of 2026-06-15 | Variable | Negotiate date at M3 close, not before |
| Test infrastructure thrash (audit finding #5) recurs during M2 if tests aren't deterministic | Medium | +1-2 days to differentiate "must be deterministic" tests from rest |

**Total recommended buffer: +5-7 days.** Realistic honest target: **María session between 2026-06-15 and 2026-06-22.**

### Anti-patterns to avoid

| Anti-pattern | Symptom | Corrective action |
|---|---|---|
| **Scope creep mid-slice** ("since I'm here, I'll also add…") | Slice PRs touch features outside the intent "vestir camisa" | Stop. Return to spec. Other features are future slices. |
| **Gold-plating narration** | 3 days iterating microcopy | Time-box: 1 day initial calibration, rest post-session based on real data |
| **Postponing the session "one more week to polish"** | M3 green but session keeps rescheduling | **Maximum anti-Aurelius.** Session IS the milestone, not the polish. If M3 green, conduct. |
| **Resolving bugs discovered in housekeeping by adding them to the slice** | M1 becomes M1.5 with new things | Create separate issues. Slice does not absorb unrelated debt. |
| **Skipping PR5 (external-person test)** ("I know it works") | Boarding the plane without co-pilot | The María-función is exactly this. Without pre-testigo, not ready. |
| **Parallel audits during slice** | New ratification, new RFC | **Zero new audits until M5.** Discipline track entered decreed pause. |

### Risks flagged

1. **Timeline assumes focus.** If in parallel Samuel attends any other backlog item (74 non-MVP issues, new audits, follow-ups), all estimates double or triple. Lyra's 0% rule ("zero on RAG, UV editor, audit follow-ups, perf, 4-tier completeness") is a tacit timeline prerequisite.
2. **Housekeeping may uncover more rot.** Audit verified some areas but recommended general sweep (`git ls-tree HEAD | grep -L "from '\\.\\." | grep tsx`). If done and 5,000 more orphan LOC appear, M1 slides significantly.
3. **María may not be available week of 2026-06-15.** Professional patronista has own calendar. Schedule EARLY — ideally this week — even if session is in 3 weeks.
4. **Emotional commitment to maintain R1-R7 discipline for 30 min.** Hardest part of entire plan. Practice with someone (or even with an LLM playing María) to practice "no mediar".

---

## 6. Open Questions / Decisions Deferred

| Question | When to resolve |
|---|---|
| Which exact LLM model + prompt for the planner? | Implementation phase (writing-plans) |
| Exact microcopy for each agent message | Continuous iteration M2 → M5 |
| Visual aesthetics (typography, color palette, spacing) | Post-session if vision validated (Iris Tane critique) |
| Naming for tools / chip labels / placeholder hint | Solace Wren can refine in M2 |
| Whether to consolidate `assignFabric` vs `setFabric` into one or just alias | Housekeeping P2 (Samuel decides) |
| Whether to delete or mount SetupWizard | Housekeeping P5 (Samuel decides) |
| Compensation / acknowledgment for María's time | Out of scope for spec, but Samuel should plan |

---

## 7. References

### In this repo
- `CLAUDE.md` — non-negotiables, audit ratifications table (28 ejes)
- `docs/plans/2026-03-02-copilot-bridge-architecture-design.md` — copilot bridge + AgenticLoop architecture
- `docs/superpowers/specs/2026-03-18-click-n-go-design.md` — expert mode patterns
- `docs/reports/2026-05-01-drift-fase2-d4-copilotpanel-composition.md` — D4 audit: `recordMessage`, dual messages/memoryRef
- `tests/e2e/dress-avatar-dod.spec.ts` — Definition of Done test (Male Shirt, T-Shirt, Pajama Top, Jacket pass)
- `src/utils/cloth/garmentPlacement.ts` — CLO3D-style piece placement
- `src/utils/autoSew/` — Hungarian arc-length matching for auto-sew
- `src/copilot/tools/` — tool registry

### Background context
- User 1 profile: María, patronista at Adidas (Samuel's girlfriend), professional reference Lectra/Gerber/Optitex/CLO3D
- openclo vision: agentic CLO3D reversion, web, lightweight, fresh UI, agent-driven UX
- Active redesign: broke things that half-worked; UnifiedBarChat replaces CopilotPanel; ~9,200 LOC orphan UI to delete

### Will be created by housekeeping
- `docs/specs/UX-VISION.md` (1 page, principle "AI-first / commands canonical / menús sólo para discovery")

---

## 8. After this spec

1. Spec self-review (placeholder scan, internal consistency, scope check, ambiguity check) — done inline
2. Samuel reviewed spec; invoked Aurelius Voronov as meta-architect critic; absorbed structural refinements (PR8 external reviewer, PR9 pre-registered criteria, decision matrix opened to "wrong user-1" cell) — done
3. **Skip `superpowers:writing-plans` for M1.** M1 is concrete enough (5 well-defined housekeeping items) to execute directly; re-plan M2 once M1 closes
4. **Execute M1 housekeeping** (P1-P5), one item per work session if needed
5. Before M2 begins, **pre-register success criteria and decision gate matrix in a separate timestamped file** (PR9), Samuel commits
6. Execute M2 slice build
7. Verify M3 (repeatability + clean machine + external dry-run)
8. **Secure external reviewer** (PR8) — identify and brief them before scheduling María session
9. Schedule + conduct María session (M4)
10. External reviewer evaluates recording first; Samuel synthesizes (S1-S6)
11. Decision gate triggers next step per Section 4 matrix
