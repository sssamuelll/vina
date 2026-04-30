# Drift audit shipping rate (2026-04-27 → 2026-04-30)

**Snapshot, no análisis.** Captura el throughput observado del audit hasta el cierre del bloque (b) chico (D7 + D5 + bloque state previo).

**Última actualización:** post-merge D5 (PR #666). Ejes cerrados acumulados: 15. Próxima actualización: cuando se cierre otro hito grande (e.g., D6 o primer (c) RFC iniciado).

---

## Ejes

**Cerrados:** 15 ejes.

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
| **D7** | **ratification (Diagnostic types, lifecycles ortogonales)** | **(b) decisión** |
| **D5** | **ratification (feature ownership reading + remove core/ doc-drift)** | **(b) decisión** |

**Categorías:** 7 mecánicos + 8 (b) decisión.

**Bloque (b) state cerrado completamente:** B2, B3, B4, B5, B6, B10, B11, B12.
**Bloque (b) chico cerrado:** D5 + D7 (data points calibration consecutivos).

---

## BUGs

**Cerrados:** 14-15 (BUG-1, 2, 3, 5, 7, 9, 11 prioritarios + BUG-4, 6, 8, 10, 12, 13, 15 secundarios + BUG-14 ratificado misclassified).

**PRs:** ~7-8 fix implementation + 2 notas fix-options (BUG-7, BUG-10).

---

## Documentación

- 15 Fase 2 docs (ratifications + decision docs).
- 2 notas fix-options (BUG-7, BUG-10).
- 1 inventory addendum (2026-04-29).
- 1 audit shipping rate (este doc, ya updated).
- **~8000-9000 líneas de doc en 4 días** (delta: +444 D7 + 472 D5 ≈ +900 líneas vs snapshot previo).

---

## Methodology rules anchored en CLAUDE.md

- Regla 1 v2 — Read contents, don't list directories.
- Regla 1 v3 — Verify divergence, don't assume uniformity by grep + look outside obvious directory.
- **Regla 1 v3 sub-section — Sub-sweeps son contextuales, no autoritativos** (anchored 2026-04-30 post D5 cierre).
- Audit philosophy — when to fix the real problem vs align for consistency.
- Verifying external infrastructure without implicit truncation.
- Inventory misclassification is itself drift to capture.
- Persistence policy (B6-state ratified, full section).
- Cascade middleware patterns (B3-state ratified, full section + sub-sections).
- Action meta flags (B3-state ratified, sub-section).
- Fabric assignment patterns (B10-state Par 1 ratified).
- Entity collections shape policy (B2-state ratified).
- **Diagnostic types (D7 ratified).**
- **Layer policy (D5 ratified).**

**13 secciones / regla anchored** (delta: +3 desde snapshot previo — Diagnostic types, Layer policy, Sub-sweeps son contextuales).

---

## Issues open as follow-up

**~23 follow-up issues abiertos** post-cierre acumulado. 2 closed (#627, #642).

| Rango | Cantidad | Categoría |
|---|---|---|
| #619-#637 | ~12 | follow-ups varios (cdtMesher flake, openclo-use-webgpu defaults, material disposal, set_stretch legacy, etc.) |
| #639-#645 | 5 (1 closed: #642) | C5/C6 follow-ups + AgentConfig + ESLint CI + AgenticLoop errors |
| #654-#657 | 4 | B6-state Fase 3 migrations + skill rename + telemetry hook + CLAUDE.md path stale |
| #659 | 1 | Custom eslint rule @cascade header (B3-state) |
| #662 | 1 | Custom eslint rule fabric write target slice (B10-state Par 1) |
| #664 | 1 | Custom eslint rule selectXById usage (B2-state) |

**No new follow-up issues from D7 + D5** — ambos cerraron sin tracking issue (per nota tactical: trivial debts on-demand vs tracking overhead).

**Lint-rule cluster emergente:** 3 issues (#659 + #662 + #664) son custom eslint rules para enforce convention de B-state ratifications. Posible agrupación en un único custom plugin si el implementador prefiere — decisión queda a quien los implemente.

**Total commits en main since 2026-04-27:** ~130 (delta: +10 desde snapshot previo).

---

## Calibración: estimate vs actual

| Eje | Estimate Fase 2 | Actual Fase 2 | Factor | Causa |
|---|---|---|---|---|
| B11-state | 6-10h | ~8h | ~1.0x | Migración XL extensiva, sin sorpresas |
| B12-state | 2-4h | <1h | ~0.3x | Canonical pre-existente (regla 1) |
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
| **D7** | **3-4h** | **~2.5h** | **~0.75x** | **Scope chico + 0 sorpresas** |
| **D5** | **3-4h** | **~3h** | **~0.75x** | **Sweep refresh + tabla 24 archivos** |

**Promedio actualizado:** factor ~0.55x del estimate inicial. **Causa dominante reaffirmada:** ratification path (consistency-alignment o canonical pre-existente o misclassification reclassified) en lugar de unify XL.

### Patrón shape común para los (b) políticos transversales

Los siguientes ejes cerraron como **ratify status quo + criterion forward-only** (o variante misclassification):

- D1-cosmetic — 3 casings = 3 roles distintos.
- B5-state — factory pattern vestigial.
- C7 — custom pan intentional feature.
- B6-state partial — persistence policy con LS exceptions ratified.
- B10-state Par 2 — snapshot intencional, no duplicate.
- B2-state — convention transversal forward-only.
- **D7** — types ortogonales lifecycles distintos.
- **D5** — feature ownership reading vs formal layered.

**9/15 ejes cerrados son ratification por convention/misclassification (60%).** Pattern persistente. El **inventario inicial sobrestima drift real continuamente** — los casos clasificados como "drift" emergen como patterns coherentes pendientes de doc.

---

## Pendientes

- **5 ejes (b) restantes:** A3 (cross-boundary errors), D1-real, D3, D4, D6. **Bloques (b) state + (b) chico cerrados completamente.**
- **6 ejes (c) RFC:** A2, A4, A6, A7, C1, C4.
- **1 sub-track compuesto:** E-async-states (B8-state + D2 + D8).

---

## Implicaciones para forward planning

- **Pace 4-5 ejes/día sostenible para ratify-by-convention** (verified empíricamente — D7 + D5 + B10 + B2 cerrados en single tarde).
- **(c) RFCs probablemente bajan el rate a 0.5-1 RFC/día** por la naturaleza arquitectural del trabajo.
- **Total runway estimado** para cerrar todos los (b) restantes + (c) RFCs + E-async-states sub-track con pace actual: **3-6 días adicionales** (delta: -1-2 días desde snapshot previo).
- **Riesgos:** E-async-states sigue siendo el más impredecible (sub-track multi-sesión); A7 RFC absorbió scope de BUG-5 y puede expandirse más cuando arranque.

### Lint-rule cluster (deuda técnica explícita)

3 follow-up issues (#659, #662, #664) son custom eslint rules. Si pasan demasiado tiempo sin implementarse, las convenciones ratificadas dependen solo de review humano. Mitigación: severity:medium en los 3 (no severity:low) para priority en cola post-audit. Posible: bundle en single plugin con 3 rules — decisión queda al implementador.

### Patrón meta-metodológico anclado

**Sub-sweeps son contextuales, no autoritativos** (regla 1 v3 sub-section, anchored post-D5). Origen: D5 sweep refresh descubrió +167% más archivos que el sub-sweep contextual de D1-cosmetic Apéndice B. Esta regla previene undercount issues en futuros ejes que reciclen sub-sweeps de Apéndices previos.

---

**FIN DEL SNAPSHOT.** Próxima actualización: cuando se cierre otro hito grande (D6 o primer (c) RFC iniciado).
