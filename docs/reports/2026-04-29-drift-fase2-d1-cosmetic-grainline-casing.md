# Fase 2 — D1-cosmetic: GrainLine casing

**Fecha:** 2026-04-29
**Eje:** D1-cosmetic.
**Categoría:** **no-drift, misclassified** — cierre por ratificación. Cero código tocado.
**Pre-requisito:** ninguno.

---

## 1. Inventario decía

> Grain / Grainline | `GrainLine` tipo, `grainLine` prop (~40), `grainline` InternalLineType (~15) | Cosmético — 3 casings.

Implicación: alinear las 3 variantes a una sola casing.

## 2. Realidad encontrada (read-only, no commits)

**Las 3 variantes son 3 roles lingüísticos distintos**, cada uno siguiendo convención TypeScript estándar + precedente sólido del codebase:

| Variante | Rol | Convención | Sitios | Estatus |
|---|---|---|---|---|
| **`GrainLine`** | Type/interface name | PascalCase (TS estándar) | ~13 (`interface GrainLine` en types.ts:171 + type imports) | ✓ correcto |
| **`grainLine`** | Property/variable name | camelCase (TS estándar) | ~150 (`grainLine?: GrainLine` en PatternPiece + bindings) | ✓ correcto |
| **`grainline`** | String literal value | lowercase compound (precedente codebase) | ~40 (`InternalLineType` enum + tool ID + switch cases) | ✓ correcto |

### Precedente del codebase para discriminated-union literals

```ts
type InternalLineType = 'dart' | 'grainline' | 'notch' | 'fold' | 'pleat' | 'topstitch' | 'reference';
type TopstitchMode    = 'seamline' | 'segment' | 'free' | 'edit';
```

Todos los valores son **lowercase compound nouns sin separador**. `'grainline'` es exactamente consistente con `'topstitch'`, `'reference'`, `'seamline'`. Alinear `'grainline'` → `'grainLine'` (camelCase) **rompería la consistencia con todos los siblings** del enum.

### Pre-existing canonical: convención implícita

`eslint.config.js` no fuerza naming. Las convenciones son TS standard observado:
- Types → PascalCase.
- Properties → camelCase.
- Discriminated union literals → lowercase compound (codebase precedent ≥7 siblings).

## 3. Inconsistencia REAL encontrada (separada de D1-cosmetic)

Durante el read-only surface también: **`hasGrainLine` vs `hasGrainline`** — 6 sitios con dos casings del mismo concepto observable ("piece has grain line marked"). No es lo mismo que las 3 casings de D1-cosmetic (esos son 3 roles legítimos); esto es 1 rol con 2 casings divergentes.

**Capturado como issue separada: [#637](https://github.com/sssamuelll/openclo/issues/637).** No es scope de D1-cosmetic (que el inventario describió diferente). Tracking propio para resolución futura.

## 4. Cierre por ratificación

D1-cosmetic se cierra como **no-drift, misclassified**. Cuarto ejemplo del audit del patrón "inventory classification is starting point, not conclusion" (anclado en CLAUDE.md como methodology audit-wide en commit `fd95ef7` de este branch).

**Cero código tocado.** El inventario se anota con la clasificación corregida; la convención del codebase se preserva.

---

## Apéndice A — D5 reclassification (input para futuro)

D5 inventario decía "(a) mecánico S, layering violations puntuales — mover imports de copilot/hooks/ desde components/ProgressMessage". Read-only previo a la inversión D5↔D1-cosmetic reveló:

### Tres errores de clasificación del inventario en D5

1. **`components/CopilotPanel/ProgressMessage/ProgressMessage.tsx:2` "violación"** — es un **type-only import**:
   ```ts
   import type { ToolCallProgress } from '../../../copilot/hooks/useAgenticLoop';
   ```
   Zero runtime cost. Vive **dentro de** `components/CopilotPanel/`, mismo árbol que `CopilotPanel.tsx` que el inventario aceptó como "esperable, acopla fuerte". Inventario clasificó inconsistentemente.

2. **`store/confirmationMiddleware.ts → store/copilotUISlice.ts` "acoplamiento bidireccional store↔copilot"** — falsa premisa: ambos archivos viven en `src/store/`, no es cross-layer. El slice se llama `copilotUISlice` (Redux slice para estado UI del copilot), no es el directorio `src/copilot/`. **No hay layer violation.**

3. **`core/` documentado en CLAUDE.md "no existe"** — verificado: `find src/core` retorna nada. Pero esto es **documentation drift** (CLAUDE.md miente sobre la realidad del codebase), no code drift. Fix sería actualizar CLAUDE.md (o crear la capa) — pero no es lo que D5 describió.

### Reclasificación a (b)

Sin formal eslint rule + sin documentación arquitectónica + con `core/` documentado pero ausente, el codebase **no tiene capa formal**. La pregunta real de D5 es:

- **Opción A**: ratificar que no hay capas formales; components puede importar copilot/ libremente.
- **Opción B**: definir convención formal "components no importa copilot/", reescribe ~7 archivos. L+ con sub-decisiones (¿context provider? ¿hooks bridge?).
- **Opción C**: restricción parcial (ej. components puede importar `copilot/types` y `copilot/hooks` pero no `copilot/action/skills`). Decisión de scope.

Esta es decisión arquitectónica, no mecánica. **D5 reclasificado de (a) mecánico S a (b) decisión arquitectónica.** Vuelve a la cola; se evalúa cuando arranque el bloque (b).

---

## Apéndice B — D5 input sweep (preservar trabajo)

Sweep cross-layer `components/ → copilot/` durante el read-only de D5 (antes de la inversión). Preservado para input de Fase 2 de D5 cuando se evalúe como (b), evitando re-investigación.

### Archivos `components/` que importan de `copilot/`

| Archivo | Imports de copilot/ | Naturaleza |
|---|---|---|
| `components/CopilotPanel/CopilotPanel.tsx` | 17+ símbolos | Inventario aceptó como "esperable, UI del copilot" |
| `components/CopilotPanel/ProgressMessage/ProgressMessage.tsx` | 1 type | Inventario flageó (type-only, dentro del subárbol de CopilotPanel) |
| `components/shell/UnifiedBarChat.tsx` | ~13 (hooks/action/providers/reasoning) | NO en inventario |
| `components/CommandBar/CommandBar.tsx` | 1 (`useAgenticLoop`) | NO en inventario |
| `components/SkillMarketplace/SkillCard.tsx` | 1 type | NO en inventario |
| `components/SkillMarketplace/SkillCardInstalled.tsx` | 2 (type + value) | NO en inventario |
| `components/SkillMarketplace/SkillMarketplace.tsx` | 4 (registry, marketplace, formats) | NO en inventario |
| `components/SkillMarketplace/ImportSeamlyModal.tsx` | 2 (registry + skill conversion) | NO en inventario |
| `components/TemplateLibrary/TemplateLibrary.tsx` | 1 (`garmentAnalyzer`) | NO en inventario |

**Total: 9 archivos cross-layer en components/.** Inventario contó 1-2 (4-7x lower-bound expansion).

### Patrón observado

Components que son "UI del copilot" (CopilotPanel, ProgressMessage dentro de CopilotPanel/) y components que orquestan features del copilot (UnifiedBarChat, CommandBar, SkillMarketplace, TemplateLibrary) importan libremente de copilot/. Ningún componente "puramente presentacional" del editor 2D/3D toca copilot/ directamente — esa parte sí respeta una capa implícita.

### Pre-existing canonical infrastructure

- `eslint.config.js`: 0 reglas de imports (no `import/no-restricted-paths`, no `boundaries` plugin, no `no-restricted-imports`).
- 0 archivos `*Architecture.md`, `*Layers.md` que describan capas formales.
- 0 comentarios `// layer:`, `// MUST:` sobre imports.
- CLAUDE.md menciona `core/` como capa pero el directorio no existe.

### Implicaciones para Fase 2 de D5 (futuro)

Sin formal infrastructure, las opciones se mantienen como están en sección 4 del Apéndice A. Decisión arquitectónica genuina, no mecánica. Tamaño dependiente de la opción elegida (A: 0 código, doc-only; B: L+ con sub-decisiones; C: M, scope-dependent).

---

## 5. Resumen ejecutivo

- **D1-cosmetic** cerrado como no-drift, misclassified. 0 código tocado.
- **Issue separada** [#637](https://github.com/sssamuelll/openclo/issues/637) para `hasGrainLine` vs `hasGrainline` (6 sitios, real pero distinto del scope de D1).
- **D5** reclasificado a (b), apéndices A+B en este doc preservan los hallazgos para cuando se retome.
- **Bloque mecánico (a) cierra** con 7 ejes mergeados (B11, B12, C7, B4, B5, C8, D1) + D5 movido a (b).
- **Audit metodológicamente más maduro:** regla "inventory misclassification is itself drift to capture" anclada en CLAUDE.md.

---

**FIN FASE 2 D1-cosmetic.** Cierre por ratificación. Ningún Fase 3 unify — el código está correcto como está.
