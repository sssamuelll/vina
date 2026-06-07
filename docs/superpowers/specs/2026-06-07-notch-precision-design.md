# Notch Precision — anclaje paramétrico + modal de creación

**Fecha:** 2026-06-07 · **Estado:** APROBADO — las 4 decisiones resueltas por Samuel (2026-06-07): D-1(a) anchor top-level en `InternalLine`, D-2(1) path manda / anchor como dato de precisión, D-3(a) esquinas detectadas por ángulo, D-4(a) click-then-refine
**Origen:** requirement post-hallazgo #5 (sesión María). Mapa de impacto completo por Amina Halcyon (2026-06-07).
**Cerrado aparte:** color propio del notch (`--notch-2d`, PR #853).

## Requirement (palabras de Samuel)

> Los piquetes son rayas perpendiculares al borde externo; sirven para confección y ahora montaje 3D. Cuando María envía patrones a fábrica, los piquetes deben coincidir con su par en cualquier otro lugar — hay que poder crearlos con bastante precisión: un modal que permita introducir la distancia respecto a un punto extremo del patrón. Típico del software de patronaje: al crear te pregunta la profundidad; CLO3D tiene 3 parámetros de notch por defecto en Settings ▸ 2D. Aún no tenemos Settings propiamente.

## Estado actual (verificado en código)

- `NotchOptions` ya modela los 3 parámetros de CLO3D: `length` (profundidad, 8mm), `width` (3mm), `angle` (0°) — pero hardcodeados vía `DEFAULT_NOTCH_OPTIONS`, sin superficie de usuario.
- El notch tool es click libre: `closestPointOnOutline` proyecta el cursor, cero entrada numérica.
- El notch se guarda como **geometría congelada** (`path: PathCommand[]`): no hay referencia al outline, ni vértice de origen, ni distancia. "Coincidir con su par" no tiene dato que lo sustente.
- `useNotchTool` ya acepta `notchOptions` como parámetro pero el call site (PatternEditor.tsx:183) no pasa nada — cable colgando que bloquea tanto el modal como los defaults configurables.
- El import DXF (#5, `interpretNotchMark`) **ya computa** proyección + segmento + normal y los descarta — back-fill del anchor casi gratis.
- El copilot tool `addNotch` ya recibe `edgePosition` (fracción 0-1 del borde) y también lo descarta.
- Precedente de modal: `CalibrationModal.tsx` (input numérico, Enter/Escape, autoFocus).

---

## DECISIONES ABIERTAS (resolver antes de codear)

### D-1 · ¿Dónde vive el anchor?

El campo nuevo `anchor` puede vivir en `InternalLine` (top-level) o dentro de `NotchOptions`.

| Opción | A favor | En contra |
|---|---|---|
| **(a) `InternalLine.anchor?`** | Es dato estructural (dónde está), no de estilo (cómo se ve). Se valida con schema zod real en `internalLineSchema`. | Campo que solo aplica a notches en un tipo compartido por 8 variantes. |
| (b) dentro de `NotchOptions` | Encapsulado en el tipo notch. | `projectSchema` tiene `notchOptions: z.unknown()` — el anchor pasaría **sin validación** y un typo se silencia hasta el restore. |

**Recomendación: (a)**, con `notchAnchor?: NotchAnchor` opcional (los drill holes y notches legacy no tienen anchor — debe ser opcional sí o sí) y schema zod real + Non-Negotiable de persistencia (shape comment, versionado).

### D-2 · ¿Quién manda cuando `path` y `anchor` divergen? (la decisión irreversible)

Dos motores transforman `path` sin saber del anchor: **grading** (escala uniforme alrededor del centroide) y **mirror/linked editing** (refleja, y en un sitio reconstruye la interna descartando todo menos el path).

| Opción | Semántica | Costo |
|---|---|---|
| **(1) MVP — anchor como dato de precisión** | El `path` sigue siendo la verdad de render/export (nada de lo existente cambia). El anchor registra *cómo se creó* y alimenta el modal de edición. En transforms: grading multiplica `distanceMm` por el scaleFactor (escala uniforme ⇒ distancia de arco escala igual — barato y correcto); mirror **elimina** el anchor (la referencia de borde flipea, re-mapearlo es trabajo real). | S — cero re-proyección, cero riesgo en superficies vivas |
| (2) Completa — anchor manda | Cada edit del outline re-proyecta todos los notches anclados; mirror re-mapea referencias. "Coincidir con su par" se vuelve verificable siempre. | L — toca cada superficie de edición del outline; motor de re-proyección nuevo; riesgo en grading/linked-editing en producción |

**Recomendación: (1) ahora, (2) como evolución.** La opción 1 cumple lo que María pidió (crear con precisión, enviar a fábrica) sin abrir el frente de re-proyección. El campo queda diseñado para que (2) sea un upgrade, no un rediseño.

### D-3 · ¿Qué es "punto extremo" como referencia?

El outline importado es polilínea densa (200-276 comandos) — "vértice" no equivale a "esquina". Opciones para la referencia desde la cual se mide la distancia:

| Opción | UX | Implementación |
|---|---|---|
| **(a) Esquinas detectadas por ángulo** | María ve marcadores en las esquinas reales del patrón (donde cambia la dirección > umbral, p.ej. 30°); elige una y teclea distancia. Es como piensa una patronista ("a 12cm de la sisa"). | Detector de esquinas por desviación angular sobre la polilínea aplanada + elección de dirección (cw/ccw). |
| (b) Cualquier vértice clickeado | Click en un punto del outline como referencia. | Trivial, pero en polilínea densa el click es tan impreciso como el problema original. |
| (c) Inicio del outline | Distancia de arco desde el comando M. | Trivial pero opaco — María no sabe dónde "empieza" el path. |

**Recomendación: (a)**, con (b) como fallback si el detector falla en un patrón raro. El anchor almacena el punto de referencia **resuelto** (coordenadas + distancia), no el índice del detector — así el dato sobrevive aunque el detector cambie.

```ts
interface NotchAnchor {
  refPoint: { x: number; y: number };  // esquina/punto de referencia, coords locales de pieza
  direction: 'cw' | 'ccw';             // sentido de medición sobre el outline
  distanceMm: number;                  // distancia de arco desde refPoint
}
```

### D-4 · Flujo del modal

| Opción | Flujo |
|---|---|
| **(a) Click-then-refine** | Tool notch activo → click cerca del borde → el notch se crea YA donde clickeaste (comportamiento actual intacto) y se abre el modal pre-llenado con la esquina más cercana + distancia medida + profundidad/width/angle de los defaults. Ajustas números → el notch se re-posiciona exacto. Enter confirma, Escape deja el del click. |
| (b) Modal-first | Tool notch activo → modal pide referencia y distancia antes de crear. Más pasos para el caso común (click rápido sin precisión). |

**Recomendación: (a)** — no castiga el flujo rápido y da precisión cuando se necesita. Es además el patrón CLO3D ("al crear te pregunta"). El modal absorbe la pregunta de profundidad del requirement.

---

## Decisiones ya tomadas (no re-abrir)

- **Defaults configurables** → `toolOptions.notch` en `toolSlice` siguiendo la convención `toolOptions.seam` (fallback `?? DEFAULT_NOTCH_OPTIONS`), consumido al fin por el parámetro colgante de `useNotchTool`. Cuando exista Settings 2D, se re-homa ahí. (G6 del brief.)
- **Naming canónico**: `length`/`width`/`angle` de `NotchOptions` ganan. El tool def `notch.tsx` usa `notchSize` — se sincroniza a `length`. CLO3D le dice "profundidad" solo en el label del modal.
- **Back-fill en import**: `interpretNotchMark` guarda el anchor que ya computa (refPoint = proyección, distancia = arco al punto). Los 8 notches de María nacen anclados.
- **Copilot**: `addNotch` (que ya recibe `edgePosition`) puebla el anchor. El agente gana el mismo poder de precisión que el modal.
- **Export AAMA**: lossy por diseño (DXF no tiene anchors paramétricos) — el path exportado ES la posición exacta, que es lo que fábrica necesita. Sin cambios al exporter.
- **Pares entre piezas** ("coincidir con el piquete en cualquier otro lugar"): **fuera de scope** de esta fase. No existe superficie de enforcement (linked editing copia por índice, no por identidad). La precisión numérica del modal es lo que hace los pares *posibles* manualmente; el enforcement automático es feature futura.
- **Doc sync**: el doc-block de `InternalLine` y la fila D1-real de CLAUDE.md dicen "notch storage-only" — se actualizan a "parcialmente paramétrico" en el mismo PR que introduce el campo.

## Plan de fases (post-decisiones)

1. **F1 — modelo + persistencia** (S): `NotchAnchor` en types, `internalLineSchema` con schema real, lockstep intacto, tests de restore-fidelity.
2. **F2 — productores** (S): back-fill en `interpretNotchMark`, `useNotchTool` computa anchor al click, copilot `addNotch` lo puebla, `toolOptions.notch` cableado (cierra el gap PatternEditor.tsx:183).
3. **F3 — modal** (M): detector de esquinas + `NotchPrecisionModal` (calcado de CalibrationModal) + flujo click-then-refine + helper `pointAtArcLength`.
4. **F4 — transforms** (S): grading escala `distanceMm`; mirror elimina anchor; tests sobre `linkedEditing`/`gradingEngine`.
5. **F5 — doc sync** (XS): doc-block + CLAUDE.md D1-real.

Riesgo principal: F3 (UX del detector de esquinas). F1+F2 son independientes del modal y entregan valor solos (anchor poblado = dato listo para el modal y para la fase 2 futura).
