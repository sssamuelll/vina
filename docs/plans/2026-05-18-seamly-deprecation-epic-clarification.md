# Epic #582 — Scope clarification / addendum

**Fecha:** 2026-05-18
**Referencia:** `docs/plans/2026-04-23-seamly-deprecation-epic.md` (epic original)
**Motivo:** una lectura externa del epic interpretó el claim "demasiado básico" como un veredicto sobre la tecnología Seamly y el adapter, lo cual es una sobre-extensión. Este addendum aclara el alcance real para evitar que decisiones downstream (notablemente el programa de cosido / epic #506) se condicionen al cierre de este epic cuando no deben.

## Texto para publicar como comentario en el issue #582 (GitHub)

> **Scope clarification (2026-05-18)**
>
> Re-leyendo el epic con una segunda mirada, vale dejar explícito el alcance real para evitar interpretaciones extendidas que ya he visto in the wild:
>
> **Lo que este epic SÍ propone:**
> - Dejar de tratar el **catálogo público y gratuito de la comunidad Seamly** como fuente primaria de patrones para el producto.
> - Migrar la fuente primaria a ingestión por archivo (`.val`/`.vit` u otros formatos), drafting methods internos y skill library.
> - Hacerlo por fases con feature flag, sin romper compatibilidad.
>
> **Lo que este epic NO propone:**
> - **No** es una crítica al `seamlyAdapter.ts`. El audit del 2026-04-23 (`docs/audits/2026-04-23-codex-refactor-audit.md`, PR #576) lo calificó 8.3/10, 16/16 tests Seamly + e2e en verde, sin regresiones.
> - **No** dice que los patrones Seamly importados que ya viven en el repo son insuficientes. `male_shirt.json` (188 pasos, 17 piezas, 9 medidas, 53 variables con fórmulas condicionales), `gent_jacket_with_tummy.json` (~400 pasos), la serie `jacket1–6`, `trousers.json` y `basic_block_women-2016.json` son patrones de nivel industrial. Cualquier persona con experiencia en producción los reconoce como serios.
> - **No** es deprecar Seamly del código (explícito en non-goals del epic).
> - **No** bloquea el epic de cosido (#506). El bug "Dress Avatar pieces fall as loose panels" (#531) ocurre cargando `male_shirt`, que es un patrón Aldrich-equivalente — el problema está downstream del import (coordenadas, edges, placement), no en la fuente. Ver §"Relación con #506" abajo.
>
> **Dónde sí hay deuda real del adapter:** el adapter mapea geometría correctamente pero **no extrae propiedades constructivas de producción** (darts con `dartIntake`/legs, notches con tipo y geometría, grainlines, seam types tipo French/flat-felled, distinción internal vs construction lines). Esto degrada la calidad del cosido y la fidelidad del patrón, pero **no impide** que un garment se vista. Esa deuda está cubierta por un issue separado (ver `docs/plans/2026-05-18-seamly-adapter-production-properties.md`) que es follow-up post-#506, no pre-requisito.
>
> Reformulación corta: este epic es **estratégico/comercial** (de dónde sacar patrones a escala para el producto), no técnico. Las child issues del epic siguen válidas tal como están.

## Relación con #506 (sewing pipeline)

El informe externo que generó esta clarificación planteó un "riesgo de segundo orden": que ejecutar #506 sobre Seamly fuera vestir avatares con patrones que ningún profesional usaría en producción. Ese riesgo **no existe** en la dimensión técnica:

1. Los patrones ya importados al repo (`male_shirt`, `gent_jacket_with_tummy`, etc.) son industriales.
2. El bug del demo (#531) sucede al cargar `male_shirt` — un patrón Aldrich-equivalente. Si el patrón fuera el problema, el bug se vería como "garment se viste mal pero se viste"; lo que pasa es "garment no se viste, panels caen" → eso es bug downstream (#527 coordenadas + #518 edges genéricos + #556 placement → círculo por categoría unknown), no bug de fuente.
3. La deuda real del adapter (sin darts/notches/grainlines/seam-types) degrada la **calidad** del cosido cuando funcione, no impide que funcione. Cubierta en issue separado.

**Conclusión:** #582 y #506 son ortogonales. Pueden ejecutarse en paralelo o en cualquier orden. Ninguno bloquea al otro.

## Child issues del epic — sin cambios

Las 6 child issues propuestas en el epic original (inventory, feature flag, file-based ingestion, contract tests, telemetry, deprecation docs) siguen válidas y bien dimensionadas. Esta clarificación no modifica ese plan.

## Etiquetas sugeridas para el issue en GitHub

- `epic` (ya existe)
- `scope-clarification` (nueva o equivalente)
- `non-blocking-for:#506`

## Próximos pasos del epic

Sin cambios respecto al plan original. La prioridad relativa de este epic vs #506 debe decidirse por valor comercial (estrategia de fuente de patrones) no por dependencia técnica.
