# Drift audit shipping rate (2026-04-27 → 2026-05-01)

**Snapshot, no análisis.** Captura el throughput observado del audit hasta el cierre del primer (c) RFC.

**Última actualización:** post-merge C1 (PR #673). **Primer RFC bloque (c) CERRADO.** 21 ejes acumulados. Próxima actualización: cuando se cierre el segundo (c) RFC o E-async-states sub-track milestone.

---

## Ejes

**Cerrados:** 21 ejes acumulados (incluye sub-cierres B10-state Par 1+2).

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

**Categorías:** 7 mecánicos + 13 (b) decisión + **1 (c) RFC**.

**Bloque (a) mecánicos cerrado completamente.** 7/7 mecánicos closed.
**Bloque (b) entero CERRADO completamente.** 13/13 (b) closed (incluye state, dominio, arquitectónico).
**Bloque (c) primer RFC cerrado.** 1/6 (c) closed.

---

## BUGs

**Cerrados:** 14-15 (BUG-1, 2, 3, 5, 7, 9, 11 prioritarios + BUG-4, 6, 8, 10, 12, 13, 15 secundarios + BUG-14 ratificado misclassified).

**PRs:** ~7-8 fix implementation + 2 notas fix-options (BUG-7, BUG-10).

---

## Documentación

- 21 Fase 2 docs (ratifications + decision docs + 1 RFC).
- 2 notas fix-options (BUG-7, BUG-10).
- 1 inventory addendum (2026-04-29).
- 1 audit shipping rate (este doc, ya updated post-C1).
- **~14000-15000 líneas de doc en 5+ días** (delta C1: +1063 RFC doc + ~75 CLAUDE.md C1 section + 19 Pattern 2.5 sub-rule established + ~3 inventory annotation).

---

## Methodology rules anchored en CLAUDE.md

- Regla 1 v2 — Read contents, don't list directories.
- Regla 1 v3 — Verify divergence, don't assume uniformity by grep + look outside obvious directory.
- Regla 1 v3 sub-section — Sub-sweeps son contextuales, no autoritativos.
- **Inventory drift overestimation pattern** (meta-anchor, anchored 2026-04-30 after 10 ratify-by-convention closures).
- **Pattern 2.5 hybrid variants** (sub-rule, anchored 2026-05-01 after D4): cleanup (D6) + lite (D4) + **extend (A3 ratified, C1 confirmed — sub-rule established 2/2 data points)**.
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

**22 secciones / regla anchored** (delta: +1 desde snapshot previo — C1 Three.js disposable lifecycle; plus Pattern 2.5 extend variant promoted to **established** sub-rule status with second data point).

---

## Issues open as follow-up

**~26 follow-up issues abiertos** post-cierre acumulado.

Lint-rule cluster: #659 (@cascade), #662 (fabric target slice), #664 (selectXById usage), **#674 (useDisposable enforcement)**. Plus #671 (D4 product UX UI re-hydration question).

Total commits en main since 2026-04-27: ~175.

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

**Promedio actualizado:** factor ~0.55x del estimate inicial. **Causa dominante reaffirmada:** ratification path (consistency-alignment, canonical pre-existente, misclassification reclassified, Pattern 2.5 hybrid variants) en lugar de unify XL.

### Patrón shape común para los (b) y primer (c)

13/21 ejes (62%) son **ratify-by-convention** (incluye Pattern 2 ratify clean + Pattern 2.5 cleanup/lite/extend hybrid variants). 8/21 ejes (38%) cerraron como real-fix (B11-state IDs canonical, C5 helper unify, B6-state Fase 3 pendiente, BUG migrations, B3-state cascade convention, B10-state Par 1 hybrid copilot migration, A3 partial extend, **C1 helper extraction + leak fixes**).

**Pattern 2.5 hybrid robust con 3 variants — sub-rule established post-C1:**
- Pattern 2.5 cleanup (D6) — remove dead code/artifacts.
- Pattern 2.5 lite (D4) — surgical helper para inline drift.
- Pattern 2.5 extend (A3 + **C1**) — add coverage to gaps without refactoring pattern. **Sub-rule established 2/2 data points consistent shape.**

---

## Pendientes

- **0 ejes (a) restantes.** Bloque (a) cerrado completamente.
- **0 ejes (b) restantes.** Bloque (b) cerrado completamente.
- **5 ejes (c) RFC pendientes:** A2, A4, A6, A7, C4. (C1 cerrado.)
- **1 sub-track compuesto pendiente:** E-async-states (B8-state + D2 + D8 fusionados).

---

## Implicaciones para forward planning post-C1

**Pace observado para (c) RFCs:** primer RFC cerrado en ~6h vs 6-8h estimate (factor 0.75x). **Pace estimate revisado para (c) RFCs restantes: 0.6-0.8x del nominal** si shape continúa siendo Pattern 2.5 extend (probable post-A7 dado precedent fresco). Si emerge un Pattern 1 real refactor entre los restantes (e.g., A7 closure requires WASM solver rewrite para paridad CPU), factor sube a ~0.9-1.0x.

**Total runway revisado** para cerrar 5 (c) RFCs restantes + E-async-states sub-track:
- 5 RFCs × ~6h promedio (post-C1 calibration) = 30h ≈ 4-5 días pace single-eje.
- E-async-states ~15-25h additional.
- **Combined: ~5-8 días adicionales** post-C1.

**Sam tactical advice para (c) ordering (post-C1 update):**
- ~~**C1** — cerrado.~~
- **A7** (WASM vs CPU equivalence) — **next**. Scope ampliado por BUG-5 absorbed; A3 pone el error handling foundation. C1 Pattern 2.5 extend confirma sub-rule, posible aplica a A7 si feature gaps son additions sin restructuring del solver.
- **A2 + A6** (bridge layer) — same domain, posible sub-track dedicated.
- **A4** (Geometry/mesh ops Rust↔TS) — cross-language similar a A3.
- **C4** (TSL/WebGPU/WASM/CPU coexistence) — most architectural; defer al final.

### Lint-rule cluster (deuda técnica explícita)

4 follow-up issues son custom eslint rules:
- #659 — @cascade header on store middlewares (B3-state).
- #662 — fabric write target slice (B10-state Par 1).
- #664 — selectXById usage (B2-state).
- **#674 — useDisposable enforcement (C1).**

Possible bundle en single plugin con 4 rules (decision al implementador).

### Patrón meta-metodológico anclado

**Inventory drift overestimation pattern** (meta-anchor, post 10 closures) + **Pattern 2.5 hybrid variants** (sub-rule, 3 ejemplos cleanup/lite/extend; **sub-rule established post-C1 con 2/2 data points consistent A3+C1 para extend variant**) + **Sub-sweeps son contextuales** (regla 1 v3 sub-section, post D5).

Audit pattern detection mature: discriminación entre Pattern 1 / Pattern 2 / Pattern 2.5 cleanup/lite/extend habilita framing rápido + calibración del scope correcto en sweeps futuros.

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

## Bloque (a) + (b) + primer (c) milestone summary (2026-05-01)

**5+ días, 21 ejes cerrados, ~14000-15000 líneas de doc, 22 methodology rules anchored.**

- 7 mecánicos + 13 (b) decisión + **1 (c) RFC** cerrados.
- 14-15 BUGs implementados + 1 ratificado misclassified.
- Meta-anchor pattern detection + Pattern 2.5 hybrid variants framework establecido + **sub-rule extend established (2/2 data points)**.
- ~26 follow-up issues open (4 lint-rule cluster + product UX questions + tracking items).
- **Audit restart-safe property anchored** post-C1 (fresh agent successful pickup via priming + main-as-truth).

Bloque (a) + (b) cerrados completamente. Bloque (c) iniciado con primer RFC. Próximo eje: A7 (WASM vs CPU equivalence).

---

**FIN DEL SNAPSHOT.** Próxima actualización: cuando se cierre el segundo (c) RFC o E-async-states milestone.
