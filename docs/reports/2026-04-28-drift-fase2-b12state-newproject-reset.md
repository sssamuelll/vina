# Fase 2 — B12-state: NEW_PROJECT reset coverage

**Estado:** ratificación de canónico pre-existente. **Ningún cambio de código necesario.**

**Eje:** B12-state — `NEW_PROJECT` reset coverage (`drift-inventory-fase1.md` axis B12-state, classification `(a)` mecánico, originalmente size S).

---

## 1. Hallazgo

El canónico para B12-state **ya existe en el codebase** desde antes del audit:

- `src/store/newProjectRegistry.ts` — registro central de qué slices resetean en `NEW_PROJECT` y cuáles sobreviven, con razón documentada por cada survivor.
- `src/store/__tests__/newProjectReset.test.ts` — 27 tests que enforcean 5 invariantes de completeness/correctness.

```typescript
// newProjectRegistry.ts
export const SLICES_THAT_RESET: readonly string[] = [/* 19 slices */];
export const SLICES_THAT_SURVIVE: readonly { slice: string; reason: string }[] = [
  { slice: 'layoutSlice', reason: 'UI layout preferences are user-level (panel positions, sizes)' },
  { slice: 'pluginSlice', reason: 'Installed/enabled plugins are global, not per-project' },
  { slice: 'renderSettingsSlice', reason: 'Render/lighting/export preferences are user-level defaults...' },
];
```

Invariantes enforced por el test (`newProjectReset.test.ts`):

1. Todo `*Slice.ts` está en el registro (no hay slices unregistered).
2. El registro no tiene entradas stale (sin file correspondiente).
3. Sin slice en ambas listas (RESET y SURVIVE son disjoint).
4. Cada survivor tiene reason documentada (no-empty).
5. RESET slices importan `NEW_PROJECT`; SURVIVE slices NO importan `NEW_PROJECT`.

---

## 2. Sanity check ejecutado (light, no exhaustive)

**Test pasa contra HEAD.** `npx vitest run src/store/__tests__/newProjectReset.test.ts` → 27/27 pass.

**Razones de los 3 survivors leídas y verificadas plausibles:**

| Slice | Reason | Plausibilidad |
|---|---|---|
| `layoutSlice` | UI panel positions, sizes are user-level | ✅ Workspace preferences naturalmente persisten across projects. Plus tiene `loadLayoutFromStorage()` que ratifica el patrón. |
| `pluginSlice` | Installed/enabled plugins are global | ✅ Plugins son app-level installations. |
| `renderSettingsSlice` | HDRI/tone mapping/exposure as user defaults; custom lights are user setups | ✅ El reason aborda explícitamente la ambigüedad de custom lights (que era el caso menos obvio). |

**Invariante 5 enforced.** El test verifica que ningún survivor tiene handler oculto y que ningún reset slice falta el import.

**Sanity check NO incluyó** (deliberadamente, per el plan de Sam):

- Lectura exhaustiva de cada reducer de cada survivor para verificar que no preservan state per-project accidentalmente. Si existiera ese bug, sería su propio eje (B10-state territory: source-of-truth con state escondido), no B12-state.
- Auditoría de cada reset para verificar que es completo. Mismo razonamiento.

---

## 3. Discrepancias con el inventario original

El `drift-inventory-fase1.md` (escrito al inicio del audit) capturó B12-state como:

> **(C) Sin handler para `NEW_PROJECT`:** `pluginSlice` (no tiene `extraReducers` para `NEW_PROJECT`), `renderSettingsSlice` (no tiene `extraReducers`), `markerSlice` (asumiblemente no reseado).
>
> **Diferencia funcional:** `pluginSlice` y `renderSettingsSlice` no se resetean al crear nuevo proyecto. Los plugins instalados y la configuración de render persisten entre proyectos. Puede ser intencional (son settings de aplicación, no de proyecto), pero no está documentado.

**Dos discrepancias:**

1. `markerSlice` "asumiblemente no reseado" → realidad: **SÍ resetea** (en `SLICES_THAT_RESET`).
2. `pluginSlice` y `renderSettingsSlice` "puede ser intencional, pero no está documentado" → realidad: **están documentados con reason explícita** en `newProjectRegistry.ts`, y la documentación está enforced por test.

El inventario fue escrito como snapshot del codebase en su momento pero **no verificó si infraestructura formal ya resolvía la ambigüedad** que estaba describiendo.

---

## 4. Resultado

**B12-state cerrado por ratificación. Cero código a tocar.**

- El canónico (registry + test) está implementado y enforced.
- Las 3 razones están documentadas y son plausibles.
- El test enforce completeness, no permitiendo que ningún slice futuro escape la decisión.
- La drift que el inventario describió ya estaba resuelta.

---

## 5. Meta-lección — agregar al CLAUDE.md

(Capturada en este commit como adición a la sección "Drift-axis investigation methodology".)

> **Antes de proponer canónico, buscá infraestructura pre-existente que ya formalice el axis.** Patterns a buscar:
>
> - Archivos `*Registry.ts`, `*Manifest.ts`, `*Catalog.ts` (registros centrales).
> - Tests con nombre `*Coverage.test.ts`, `*Invariant.test.ts`, `*Reset.test.ts` (enforcement).
> - Schemas, manifests, lint rules custom.
> - Comentarios `// canonical:`, `// invariant:`, `// MUST:` en código.
>
> El inventario describe lo que parecía drift en su momento, **no necesariamente el estado actual**. Triggers de "este eje ya está resuelto":
>
> - Archivo de registro central que enumera el dominio del axis.
> - Test que enforcea la política con assertions de completeness.
> - Documentación inline (reasons, comments) que ratifica decisiones de diseño.
>
> Cuando encontrás esto: stop investigation, surface to Sam, propose ratification doc instead of canonical proposal.

Esto añade un step inicial cheap (~5-10 min de greps) a la metodología de cada Fase 2.

---

## 6. No issues nuevas, no follow-ups

- El gap de inventory accuracy NO es follow-up issue — es lección aplicable a futuras Fase 2.
- Las 3 reasons documentadas son plausibles; no hay flag de B10-state escondido en ellas.
- Los tests cubren completeness; no hay gaps observables sin auditoría exhaustiva (que está fuera de scope).

---

**FIN. Eje cerrado por ratificación.**
