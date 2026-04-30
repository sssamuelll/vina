# Drift audit shipping rate (2026-04-27 → 2026-04-30)

**Snapshot, no análisis.** Captura el throughput observado del audit hasta el cierre de B3-state para calibrar estimates de ejes restantes.

---

## Ejes

**Cerrados:** 11 ejes (10 cierres + 1 ratification-only contado aparte).

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

**Categorías:** 7 mecánicos + 4 (b) decisión.

---

## BUGs

**Cerrados:** 14 (BUG-1, 2, 3, 5, 7, 9, 11 prioritarios + BUG-4, 6, 8, 10, 12, 13, 15 secundarios + BUG-14 ratificado misclassified). Total 15 si BUG-14 entra; 14 si se cuenta como ratification.

**PRs:** ~7-8 fix implementation + 2 notas fix-options (BUG-7, BUG-10).

---

## Documentación

- 11 Fase 2 docs (ratifications + decision docs).
- 2 notas fix-options (BUG-7, BUG-10).
- 1 inventory addendum (2026-04-29).
- 1 audit shipping rate (este doc).
- ~5500-6500 líneas de doc en 4 días.

---

## Methodology rules anchored en CLAUDE.md

- Regla 1 v2 — Read contents, don't list directories.
- Regla 1 v3 — Verify divergence, don't assume uniformity by grep + look outside obvious directory.
- Audit philosophy — when to fix the real problem vs align for consistency.
- Verifying external infrastructure without implicit truncation.
- Inventory misclassification is itself drift to capture.
- Persistence policy (B6-state ratified, full section).
- Cascade middleware patterns (B3-state ratified, full section + sub-sections).
- Action meta flags (B3-state ratified, sub-section).

---

## Issues open as follow-up

**~22 follow-up issues abiertos** post-cierre de los ejes y bugs:

| Rango | Cantidad | Categoría |
|---|---|---|
| #619-#637 | ~12 | follow-ups varios (cdtMesher flake, openclo-use-webgpu defaults, material disposal, set_stretch legacy, etc.) |
| #639-#645 | 5 | C5/C6 follow-ups + AgentConfig + ESLint CI + AgenticLoop errors |
| #654-#657 | 3 | B6-state Fase 3 migrations + skill rename + telemetry hook + CLAUDE.md path stale |
| #659 | 1 | Custom eslint rule @cascade header (B3-state) |

**Total commits en main since 2026-04-27:** 97.

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

**Promedio:** factor ~0.5-0.7x del estimate inicial. **Causa dominante:** ratification path (consistency-alignment o canonical pre-existente) en lugar de unify XL — los ejes (a) cerraron por debajo del estimate cuando el sweep reveló que el drift era cosmético o ya resuelto.

---

## Pendientes

- **9 ejes (b) restantes:** A3, B2-state, B10-state, D1-real, D3, D4, D5, D6, D7.
- **6 ejes (c) RFC:** A2, A4, A6, A7, C1, C4.
- **1 sub-track compuesto:** E-async-states (B8-state + D2 + D8).

---

## Implicaciones para forward planning

- **Pace ~2-3 ejes/día sostenible** si el scope queda en (b) ratification con consistency-alignment.
- **(c) RFCs probablemente bajan el rate a 0.5-1 RFC/día** por la naturaleza arquitectural del trabajo.
- **Total runway estimado** para cerrar todos los (b) restantes + (c) RFCs + E-async-states sub-track con pace actual: **5-8 días adicionales**.
- **Riesgos:** E-async-states es el más impredecible (sub-track multi-sesión); A7 RFC absorbió scope de BUG-5 y puede expandirse más cuando arranque.

---

**FIN DEL SNAPSHOT.** Próxima actualización: cuando se cierre el bloque (b) o se arranque el primer (c) RFC, lo que ocurra primero.
