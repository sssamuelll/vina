# Drift audit shipping rate (2026-04-27 → 2026-05-01)

**Snapshot, no análisis.** Captura el throughput observado del audit hasta el cierre del segundo (c) RFC.

**Última actualización:** post-merge A6 (PR #682). **Tercer RFC bloque (c) CERRADO.** 23 ejes acumulados. Próxima actualización: cuando se cierre el cuarto (c) RFC o E-async-states sub-track milestone.

---

## Ejes

**Cerrados:** 23 ejes acumulados (incluye sub-cierres B10-state Par 1+2).

| ID | Cierre | Tipo |
|---|---|---|
| B11-state | unify XL (39 archivos, IDs canonical) | mecánico |
| B12-state | ratification-only (canonical pre-existía) | mecánico |
| C5 | unify (helper canonical extraído + 23 sitios consolidados) | mecánico |
| C6 (decision) | decisión cerrada (cm/mm split + reformulado scope) | (b) decisión |
| C7 | ratification-only (custom pan = intentional feature) | mecánico |
| B4-state | ratification (selectors export pattern documentado) | mecánico |
| B5-state | ratification (factory vs const = vestigial, consistency-alignment) | mecánico |
| C8 | ratification (mesh import bypass, inputs documentados) | mecánico |
| D1-cosmetic | ratification (3 casings = 3 roles distintos) | mecánico |
| B6-state | ratification (persistencia policy, 8 sub-decisiones) | (b) decisión |
| B3-state | ratification (cascade middleware patterns) | (b) decisión |
| B10-state | hybrid (Par 2 ratify misclass + Par 1 ratify+migrate hybrid scope) | (b) decisión |
| B2-state | ratification (entity collections shape policy, convention forward-only) | (b) decisión |
| D7 | ratification (Diagnostic types, lifecycles ortogonales) | (b) decisión |
| D5 | ratification (feature ownership reading + remove core/ doc-drift) | (b) decisión |
| D1-real | ratification (Dart entity + InternalLine{type:'dart'} dual representation) | (b) decisión |
| D6 | **Pattern 2.5 cleanup** (Fabric 3-tier API surface + remove dead bridge) | (b) decisión |
| D3 | ratification (zod usage policy: boundary + persistence + tool args, NOT UI) | (b) decisión |
| **D4** | **Pattern 2.5 lite** (CopilotPanel composition: recordMessage helper + dual representation docs) | **(b) decisión** |
| **A3** | **Pattern 2.5 extend** (cross-boundary error handling: panic_hook + UI surface + NaN telemetry + Result convention) | **(b) decisión** |
| **C1** | **Pattern 2.5 extend** (Three.js useDisposable hook + 7 sites migrated + 2 leak gaps fixed; sub-rule established 2/2 data points consistent) | **(c) RFC** |
| **A7** | **Pattern 2.5 extend** (WASM vs CPU equivalence: 3 ports queued + 2 ratify-CPU-only-with-UI + 2 architectural; capability surface skeleton + decoupled F3 — primer use bloque (c); sub-rule promoted to robust pattern 3/3 data points) | **(c) RFC** |
| **A6** | **Pattern 2.5 extend bounded variant** (Cloth solver client interface: 4-member lifecycle subset `ClothSolverClient` + capability extension a 4 tiers + `frameDriven` flag + Neural reframe; **interface scope reduced post-compile-gate trigger** TS2416 — init + callbacks remain by-convention per-tier; doc amendment IN F3 § 4.5; 7 follow-up issues #683-689; sub-rule promoted to robust pattern 4/4 data points anchor stable bounded variant) | **(c) RFC** |

**Categorías:** 7 mecánicos + 13 (b) decisión + **3 (c) RFCs**.

**Bloque (a) mecánicos cerrado completamente.** 7/7 mecánicos closed.
**Bloque (b) entero CERRADO completamente.** 13/13 (b) closed (incluye state, dominio, arquitectónico).
**Bloque (c) progress: 3/6 RFCs cerrados (C1 + A7 + A6).** 3 restantes: A2, A4, C4.

---

## BUGs

**Cerrados:** 14-15 (BUG-1, 2, 3, 5, 7, 9, 11 prioritarios + BUG-4, 6, 8, 10, 12, 13, 15 secundarios + BUG-14 ratificado misclassified).

**PRs:** ~7-8 fix implementation + 2 notas fix-options (BUG-7, BUG-10).

---

## Documentación

- 22 Fase 2 docs (ratifications + decision docs + 2 RFCs).
- 2 notas fix-options (BUG-7, BUG-10).
- 1 inventory addendum (2026-04-29).
- 1 audit shipping rate (este doc, ya updated post-A7).
- **~15500-16500 líneas de doc en 5+ días** (delta A7 post-C1: +1499 RFC doc + 70 CLAUDE.md A7 section + 32 Pattern 2.5 robust pattern promotion + 7 inventory annotation + 56 shipping rate update).

---

## Methodology rules anchored en CLAUDE.md

- Regla 1 v2 — Read contents, don't list directories.
- Regla 1 v3 — Verify divergence, don't assume uniformity by grep + look outside obvious directory.
- Regla 1 v3 sub-section — Sub-sweeps son contextuales, no autoritativos.
- **Inventory drift overestimation pattern** (meta-anchor, anchored 2026-04-30 after 10 ratify-by-convention closures).
- **Pattern 2.5 hybrid variants** (sub-rule, anchored 2026-05-01 after D4): cleanup (D6) + lite (D4) + **extend (A3 + C1 + A7 — sub-rule promoted to robust pattern 3/3 data points consistent shape, post-A7)**.
- Audit philosophy — when to fix the real problem vs align for consistency.
- Verifying external infrastructure without implicit truncation.
- Inventory misclassification is itself drift to capture.
- Persistence policy (B6-state ratified, full section).
- Cascade middleware patterns (B3-state ratified, full section + sub-sections).
- Action meta flags (B3-state ratified, sub-section).
- Fabric assignment patterns (B10-state Par 1 ratified).
- Entity collections shape policy (B2-state ratified).
- Diagnostic types (D7 ratified).
- Layer policy (D5 ratified).
- Dart representation (D1-real ratified).
- Fabric type 3-tier API surface (D6 ratified).
- zod usage policy (D3 ratified).
- CopilotPanel composition (D4 ratified).
- **Cross-boundary error handling (A3 ratified).**
- **Three.js disposable lifecycle (C1 ratified).**
- **WASM vs CPU solver capabilities (A7 ratified).**
- **Cloth solver client interface (A6 ratified).**
- **Compile-gate convergence verification (sub-rule, anchored 2026-05-01 post-A6).**

**25 secciones / regla anchored** (delta: +2 desde snapshot previo — A6 Cloth solver client interface section + Compile-gate convergence verification methodology sub-rule; plus Pattern 2.5 extend variant **promoted to robust pattern 4/4 anchor stable bounded variant** with fourth data point A6 confirmed).

---

## Issues open as follow-up

**~39 follow-up issues abiertos** post-cierre acumulado.

Lint-rule cluster: #659 (@cascade), #662 (fabric target slice), #664 (selectXById usage), #674 (useDisposable enforcement). Plus #671 (D4 product UX UI re-hydration question).

**A7 follow-up issues (6 nuevos):**
- #676 self-collision port (severity:medium, ~12-18h con buffer).
- #677 pressure port (severity:medium, ~4-6h).
- #678 piece stiffness port (severity:medium, ~2-3h).
- #679 LRA UI surface (severity:low, ~1-2h).
- #680 fold UI surface (severity:low, ~1-2h).
- #681 capability surface full impl (severity:medium, depends on C4).

**Total Fase 3 work distributed via A7 follow-ups: ~21-32h pending across 6 issues.**

**A6 follow-up issues (7 nuevos):**
- #683 setWind canonical signature + capability gate (severity:medium, ~2-3h).
- #684 setPins canonical batch shape + freeze-vs-positional caveat (severity:medium, ~2-3h).
- #685 setFabric resolution moved to consumer (severity:medium, ~1-2h).
- #686 gravity bundled into setConfig (severity:low, ~1-2h).
- #687 error shape uniform across 4 tiers — extend A3 (severity:medium, ~2-3h).
- #688 #UUU-init consumer polymorphic init dispatch (factory pattern) (severity:medium, ~2-3h).
- #689 #UUU-callbacks consumer polymorphic callback emission (severity:medium, ~2-3h).

**Total Fase 3 work distributed via A6 follow-ups: ~12-18h pending across 7 issues.**

Total commits en main since 2026-04-27: ~205.

---

## Calibración: estimate vs actual

| Eje | Estimate Fase 2 | Actual Fase 2 | Factor | Causa |
|---|---|---|---|---|
| B11-state | 6-10h | ~8h | ~1.0x | Migración XL extensiva, sin sorpresas |
| B12-state | 2-4h | <1h | ~0.3x | Canonical pre-existente |
| C5 | 13-17h | ~5h | ~0.3-0.4x | Pre-existing canonical + iterative refinement |
| C6 decision | 4-6h | ~3h | ~0.6x | Reformulado scope, decisión clean |
| C7 | 2-4h | <1h | ~0.3x | Misclassification detectada rápido |
| B4-state | 2-4h | ~1.5h | ~0.5x | Ratification cosmética |
| B5-state | 2-4h | ~2h | ~0.7x | Reclasificada (a) → (b), consistency-alignment |
| C8 | 2-4h | ~2h | ~0.6x | Ratification con C6-impl pendiente |
| D1-cosmetic | 2-4h | ~1.5h | ~0.5x | Ratification por reclassification (3 roles) |
| B6-state | 12-16h | ~8h | ~0.6x | 8 sub-decisiones, sin código |
| B3-state | 6-10h | ~5h | ~0.6x | Sweep cerró limpio + precedente fresco BUG-7 |
| B10-state Par 2 | 2h | ~1.5h | ~0.75x | Misclassification ratification |
| B10-state Par 1 | 5-7h | ~3h | ~0.5x | Investigación adicional Q1-Q3 cerró β pre-redacción |
| B2-state | 5-9h | ~3.5h | ~0.5x | Sweep clean + framing ratify simplificó |
| D7 | 3-4h | ~2.5h | ~0.75x | Scope chico + 0 sorpresas |
| D5 | 3-4h | ~3h | ~0.75x | Sweep refresh + tabla 24 archivos |
| D1-real | 3-4h | ~2.5h | ~0.6-0.8x | Git blame eliminó ambiguity early |
| D6 | 4-5h | ~3h | ~0.6-0.75x | Meta-anchor pre-anclado redujo framing |
| D3 | 3-4h | ~2.5h | ~0.6-0.8x | Meta-anchor predictivo confirmed |
| **D4** | **4-5h** | **~3h** | **~0.6-0.75x** | **Refinamientos de Sam pre-Sec 3 redujo scope** |
| **A3** | **5-7h** | **~4h** | **~0.6-0.7x** | **Cross-language sweep + claims verification cerró space pre-redacción** |
| **C1** | **6-8h** | **~6h** (5h F2 + 1h F3) | **~0.75x** | **BUG-9 input doc pre-redactado + Pattern 2.5 extend framing pre-anclado + sweep refresh expandió 5→7 sites** |
| **A7** | **6-9h** | **~11h** (8h F2 + 3h F3 closure) | **~1.0x** | **Most complex RFC del bloque (c) — per-feature multiplication × 7 features + Sec 3a/3b split overhead + LRA mid-flight override consolidation. Decoupled F3 primer use bloque (c).** |
| **A6** | **7-10h** | **~9h** (~6h F2 + ~3h F3) | **~0.85x** | **Breadth-heavy uniform shape (4 tiers × per-method matrix) + Q1-Q5 open questions resolved pre-Sec 4. Compile-gate trigger Commit 3 forced architectural scope reduction → Commit 3.5 amendment IN F3 per Sam non-negotiable directive. Pattern 2.5 extend bounded variant.** |

**Promedio actualizado:** factor ~0.6x del estimate inicial (A6 + A7 outliers en 0.85-1.0x; pace overall 0.5-1.0x según complejidad). **Causa dominante reaffirmada:** ratification path (consistency-alignment, canonical pre-existente, misclassification reclassified, Pattern 2.5 hybrid variants) en lugar de unify XL.

### Patrón shape común para los (b) y primeros 3 (c)

14/23 ejes (61%) son **ratify-by-convention** (incluye Pattern 2 ratify clean + Pattern 2.5 cleanup/lite/extend/extend-bounded hybrid variants). 9/23 ejes (39%) cerraron como real-fix (B11-state IDs canonical, C5 helper unify, B6-state Fase 3 pendiente, BUG migrations, B3-state cascade convention, B10-state Par 1 hybrid copilot migration, A3 partial extend, C1 helper extraction + leak fixes, A7 capability skeleton + UI surface + per-feature ports queued).

**Pattern 2.5 hybrid robust con 4 variants — sub-rule promoted to robust pattern 4/4 anchor stable bounded post-A6:**
- Pattern 2.5 cleanup (D6) — remove dead code/artifacts.
- Pattern 2.5 lite (D4) — surgical helper para inline drift.
- Pattern 2.5 extend (A3 + C1 + A7) — add coverage to gaps without refactoring pattern.
- **Pattern 2.5 extend bounded variant (A6)** — when compile gate reveals convergence-by-convention is less complete than inventory captured, scope-reduction-on-trigger is a viable closure path. **Sub-rule promoted to robust pattern 4/4 data points anchor stable bounded variant.**

### 3.6 Decoupling pattern segundo use bloque (c)

A7 fue **primer use** del decoupling pattern (RFC closure ratifies policy + per-feature implementations queued as follow-up issues; precedent B6-state Fase 3 deferral). **A6 segundo use** — interface anchor + capability extension landed in closure; 7 setter/error/consumer migrations decoupled to follow-up issues #683-689. Future RFCs (A2, A4, C4) may inherit este shape si:
- Per-feature/per-decision multiplication justifica scope distribution.
- Ratification policy decidable independent of implementations.
- Risk distribution beneficia atomicity per feature.

Track adoption: si 3+ RFCs futuros adopt 3.6 decoupling, anchor as canonical sub-rule en CLAUDE.md (similar al promotion path Pattern 2.5 extend variant).

---

## Pendientes

- **0 ejes (a) restantes.** Bloque (a) cerrado completamente.
- **0 ejes (b) restantes.** Bloque (b) cerrado completamente.
- **3 ejes (c) RFC pendientes:** A2, A4, C4. (C1 + A7 + A6 cerrados.)
- **1 sub-track compuesto pendiente:** E-async-states (B8-state + D2 + D8 fusionados).

---

## Implicaciones para forward planning post-A7

**Pace observado para (c) RFCs (3 data points):**
- **C1:** ~6h vs 6-8h estimate (0.75x), uniform shape (single-pattern useMemo + dispose).
- **A7:** ~11h vs 6-9h estimate (1.0x), per-feature multiplication × 7 features.
- **A6:** ~9h vs 7-10h estimate (0.85x), breadth-heavy uniform shape (4 tiers × per-method) + compile-gate trigger forced scope reduction mid-F3.

**Calibración rule (Pattern 2.5 extend):** uniform shape ejes tienden 0.6-0.8x; breadth-heavy 4-tier matrix tiende 0.85x; per-feature multiplication ejes tienden 1.0x. Future RFCs predictivo según shape.

**Doc size ceiling actualizado:** 1861L (A6 RFC, post-§ 4.5 amendment). Cualquier RFC futuro >1861L requiere explicit sweep-time justification, no post-hoc — per Sam directive post-A6.

**Pace estimate revisado para 3 (c) RFCs restantes:** 0.6-1.0x del nominal según shape:
- A2 (cross-boundary serialization): single-type analysis probable → ~0.6-0.8x.
- A4 (geometry/mesh ops cross-language): similar a A3 → ~0.6-0.8x.
- C4 (4-tier coexistence): most complex, per-tier × per-feature → ~1.0x+.

**Total runway revisado** para cerrar 3 (c) RFCs restantes + E-async-states sub-track:
- 3 RFCs × ~7-10h promedio (post-A6 calibration) = 21-30h ≈ 3-5 días pace single-eje.
- E-async-states ~15-25h additional.
- **Combined: ~4-7 días adicionales** post-A6.

**Sam tactical advice para (c) ordering (post-A6 update):**
- ~~**C1** — cerrado.~~
- ~~**A7** — cerrado.~~
- ~~**A6** — cerrado.~~
- **A4 next** (cross-language similar a A3 + A6 precedents). Sam tactical heads-up post-A6: anticipá compile-gate trigger si A4 propone interface/protocol extraction sin pre-verify structural divergence.
- **A2** después (config types unify; A6 § 3.5 setter migrations dependen de A2 canonical config shape). Si Sam wants to start A2 antes de A4, also viable — A6 § 3.5 follow-ups (#683-#686) can land independently.
- **C4** último (most architectural; herda A6 capability surface + `frameDriven` flag + A7 § 3.3 capability surface).

**E-async-states sub-track** puede arrancar en paralelo cuando la cadencia lo permita.

### Lint-rule cluster (deuda técnica explícita)

4 follow-up issues son custom eslint rules:
- #659 — @cascade header on store middlewares (B3-state).
- #662 — fabric write target slice (B10-state Par 1).
- #664 — selectXById usage (B2-state).
- #674 — useDisposable enforcement (C1).
- _(A7 lint rule deferred al issue capability surface full impl #681 — bundles with C4 framing.)_
- _(A6 lint rule for setPins position semantics divergence deferred al follow-up issue #684 — bundles with broader pin canonical batch shape migration.)_

Possible bundle en single plugin con 4-5 rules (decision al implementador).

### Patrón meta-metodológico anclado

**Inventory drift overestimation pattern** (meta-anchor, post 10 closures) + **Pattern 2.5 hybrid variants** (sub-rule, 4 ejemplos cleanup/lite/extend/extend-bounded; **sub-rule promoted to robust pattern post-A6 con 4/4 data points anchor stable: A3+C1+A7+A6-bounded**) + **Sub-sweeps son contextuales** (regla 1 v3 sub-section, post D5) + **Compile-gate convergence verification** (sub-regla derivative de "verify divergence", post-A6).

Audit pattern detection mature: discriminación entre Pattern 1 / Pattern 2 / Pattern 2.5 cleanup/lite/extend/extend-bounded habilita framing rápido + calibración del scope correcto en sweeps futuros. **Scope-reduction-on-trigger** (post-A6) extends discriminación: cuando compile gate trigger un structural divergence durante interface extraction, scope-reduction es path viable (vs full revert/reopen).

### Methodology learning anchored post-C1: audit es restart-safe

**Observación post-context-restart (2026-05-01):** el cierre de C1 fue ejecutado por un fresh agent (Claude Opus 4.7) que arrancó sin context histórico de las 20 ratificaciones previas. El priming + docs en main fueron sufficient artifact para pickup work clean:

- **Priming inputs** (lectura ~15-20 min al arranque): CLAUDE.md methodology section, classification doc, addendum, shipping rate snapshot, RFC input doc (BUG-9).
- **Main-as-truth artifacts** (lectura on-demand): inventory annotations en commit history (`git log --grep "annotate inventory"`), Fase 2 docs en `docs/reports/`, code en `src/` reflejando ratificaciones previas.
- **Output quality:** comparable al agente previo (atomic commits, refactor vs fix distinction explicit, deuda técnica flagged sin scope creep, structural verification + honest deferral cuando CLI no puede correr browser DevTools).

**Implicación para audit longevity:** el audit es **restart-safe** — futuros context restarts (compaction, model upgrade, fresh session) NO pierden continuity siempre que:
1. El priming artifact (CLAUDE.md + classification + addendum + shipping rate) esté actualizado.
2. Inventory annotations en main capturen cierres de ejes sequentially.
3. Fase 2 docs preserven full reasoning (no solo decisión final).

Esta property emerge naturalmente del workflow audit (atomic commits, doc-first redacción, ratify-via-CLAUDE.md). NO es accidente; es propiedad del methodology mismo. Aplicable a cualquier audit de scope similar (multi-sesión, multi-agent, multi-mes).

---

## Bloque (a) + (b) + 3 (c) RFCs milestone summary (2026-05-01)

**5+ días, 23 ejes cerrados, ~17500-18500 líneas de doc, 25 methodology rules anchored.**

- 7 mecánicos + 13 (b) decisión + **3 (c) RFCs** cerrados (C1 + A7 + A6).
- 14-15 BUGs implementados + 1 ratificado misclassified.
- Meta-anchor pattern detection + Pattern 2.5 hybrid variants framework establecido + **sub-rule extend promoted to robust pattern (4/4 data points anchor stable bounded variant: A3 + C1 + A7 + A6-bounded)**.
- ~39 follow-up issues open (4-5 lint-rule cluster + 6 A7 per-feature ports + 7 A6 setter/error/consumer migrations + UI surfaces + product UX questions + tracking items).
- **Audit restart-safe property anchored** post-C1 (confirmed across A7 + A6 closures).
- **3.6 Decoupling pattern segundo use** en bloque (c) (A7 + A6); track adoption en future RFCs (A2/A4/C4).
- **Compile-gate convergence verification** sub-rule anchored post-A6 — generalize-able to A2/A4/C4 still pending.

Bloque (a) + (b) cerrados completamente. Bloque (c) progress: 3/6 RFCs. Próximo eje: A4 (cross-language geometry/mesh ops, similar precedent A3+A6) o A2 (cross-boundary serialization, depends from A6 § 3.5 setter migrations).

---

**FIN DEL SNAPSHOT.** Próxima actualización: cuando se cierre el cuarto (c) RFC o E-async-states milestone.
