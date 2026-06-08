# Seamly2D — decisión de status: congelado / diferido (opción C)

**Fecha:** 2026-05-29
**Decide:** Samuel
**Continúa el thread:** `docs/plans/2026-04-23-seamly-deprecation-epic.md` (epic #582) + `docs/plans/2026-05-18-seamly-deprecation-epic-clarification.md` (clarificación de alcance)
**No es:** un nuke de Seamly. Es un congelamiento de inversión + pivote de la superficie de testing.

## TL;DR

Seamly2D **se queda en el código tal cual está hoy, sin más inversión**, etiquetado como deuda diferida. La superficie de testing del MVP se mueve al path DXF (el archivo real de María). El nuke total de Seamly **no** se ejecuta ahora porque todavía **no existe paridad UX de reemplazo**: el flujo agentic de carga de patrón hoy rutea por `seamlyTools.ts`, y el reemplazo natural (`loadDXFFile` / M3 agentic) aún no está construido. Borrar Seamly hoy rompería la demo M2 que acabamos de validar en browser sin dejar nada en su lugar.

Disparador para re-evaluar el nuke: **cuando cierre M3 (carga agentic de DXF browser-side).** En ese punto Seamly pasa a ser legacy genuino y se decide nuke-vs-keep con paridad real sobre la mesa.

## Qué pasó (el hallazgo empírico de hoy)

Durante el dry-run browser de M2, el slice agentic funcionó **end-to-end** (prompt → tool plan → `presentToUser` con opciones → segundo prompt → ejecución → confirmación). Pero el patrón cargado (`male_shirt`, 17 piezas / 30 costuras) renderizó como un desastre: piezas mal orientadas, costuras con ~13% mismatch, layout 2D caótico, y el solver se guindó bajo la carga de 17 piezas en CPU fallback.

Samuel probó mentalmente el resto del catálogo y la conclusión fue: **ninguno de los fixtures Seamly produce un patrón usable para testing a través del pipeline actual.** Si los fixtures no sirven para probar, la razón original de tener Seamly integrado (tener un patrón con el cual hacer pruebas) desaparece.

## El matiz honesto (no contradice el análisis previo)

La clarificación del 2026-05-18 estableció que los patrones Seamly son **data de origen de nivel industrial** (`male_shirt`: 188 pasos, 53 variables con fórmulas; `gent_jacket_with_tummy`: ~400 pasos) y que el bug del demo (#531 "pieces fall as loose panels") vive **downstream** del import: coordenadas (#527), edges genéricos (#518), placement por categoría unknown (#556), y la deuda del adapter que **no extrae** darts/notches/grainlines/seam-types de producción.

El hallazgo de hoy **confirma** ese diagnóstico desde el otro extremo en lugar de contradecirlo:

> Buena data de origen + pipeline downstream incompleto = output renderizado inservible.

La decisión de hoy **no** dice "los patrones Seamly son malos". Dice: **el costo de terminar el pipeline downstream para que los fixtures Seamly rendericen bien es alto, y el ROI es bajo** porque el usuario final (María) no va a cargar fixtures Seamly — ella sube su propio DXF. Arreglar el converter/adapter/placement para fixtures que nadie verá es trabajo invisible para el MVP.

## La pieza que cambia la prioridad

**El usuario carga su propio DXF.** El probe M3 (commit `6251ef9f`) ya confirmó que el parser DXF existente maneja un archivo profesional real (CLO/AAMA) limpio: 5 piezas, cientos de vértices c/u, formato AAMA. No hace falta el catálogo Seamly para el camino real al MVP testeable por el usuario 1.

El camino al MVP no pasa por arreglar Seamly. Pasa por:
1. Slice agentic funciona ✅ (validado browser-side hoy)
2. DXF de María parsea ✅ (probe M3)
3. **Falta:** tool `loadDXFFile` que el agente invoque cuando ella diga "carga mi patrón" → spec en `docs/superpowers/specs/2026-05-29-m3-dxf-agentic-load-design.md`

## Footprint (blast radius para futuro-yo)

No subestimar lo que cuelga de Seamly antes de pensar en nuke:

| Capa | Tamaño |
|---|---|
| Archivos `src/` que referencian Seamly | ~66 |
| `src/utils/seamly2d/` | 20 archivos (adapter, parser, formulaEvaluator, templateEngine, sizeTables, measurementDerivation, …) |
| `tools/seamly2d-converter/` | 46 archivos |
| Fixtures convertidas (`.json`) | 42 |
| UI surfaces dependientes | `SkillMarketplace`, `ImportSeamlyModal`, `TemplateLibrary`, `GradingTab` |
| Sistemas que cuelgan | construction blueprints, grading, parametric engine, ~6 herramientas del copilot, skill library |

Esto es ~3–4k LOC + UI de catálogo + skills paramétricas que dependen del schema Seamly. Un nuke es 2–3 sesiones de trabajo, varios PRs, y rompe tests de tool-count y de integración M2.

## Qué significa "congelado / diferido" en la práctica

**SÍ:**
- Cero inversión nueva en el converter Seamly, el adapter, o la calidad de los fixtures.
- Seamly machinery se queda **dormante pero funcional** — la demo M2 sigue corriendo contra `male_shirt` para no perder la única ruta agentic de carga de patrón hasta que `loadDXFFile` exista.
- Etiquetar en código/issues como deuda diferida, no como bug activo a arreglar.

**NO:**
- No se borra `src/utils/seamly2d/` ni `tools/seamly2d-converter/`.
- No se borra `ImportSeamlyModal` / `TemplateLibrary` / `GradingTab`.
- No se tocan los tests de tool-count que asumen el catálogo.

## Disciplina aplicada (orphan-deletion protocol)

Antes de borrar código "huérfano": investigar **por qué** es huérfano + verificar que el reemplazo tiene **paridad UX real** (no solo paridad de acción Redux). Hoy:
- Seamly **no es huérfano** — es la única ruta agentic de carga de patrón viva.
- El reemplazo (`loadDXFFile`) **no existe todavía** → cero paridad UX hoy.

Por eso C (congelar) y no A (nuke). El nuke se gana el derecho a existir cuando M3 cierre.

## Disparador de re-evaluación

Cuando el slice M3 (carga agentic de DXF browser-side) esté validado end-to-end por María:
1. Seamly deja de ser la única ruta de carga → pasa a legacy genuino.
2. Se decide explícitamente: nuke total (A), cirugía mínima del catálogo (B), o mantener como "import secundario para inspiración" si resulta que María quiere una librería de patrones de referencia.
3. La decisión se toma **con María en la sala**, no antes — el requerimiento real de "¿quiere una librería de inspiración?" se descubre con ella.

## Issues / etiquetas sugeridas

- Etiquetar issues del converter Seamly como `deferred` / `frozen:post-m3`.
- Este doc es la fuente de verdad del status hasta que M3 cierre.
