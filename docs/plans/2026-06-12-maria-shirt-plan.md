# Plan: la camisa de María — del blob extraterrestre al drape de camisa

> Disparador (2026-06-12): el primer uso real del release v0.11.0 con un patrón de verdad (`tests/fixtures/garments/maria_patrones_samuel_2M.dxf` — camisa de 5 piezas de María) produce un blob negro arrugado sobre el torso del avatar. "Se ve simplemente horrible y extraterrestre. Es una camisa. No se renderiza ni de cerca como una camiseta."
> Diagnóstico: workflow de 4 lectores + 2 sondas empíricas (arrange-state probe + regex check), 2026-06-12.

## 0. Veredicto en una frase

**La maquinaria de costura del plan de paridad funciona — lo que no existe es el eslabón cero: el import DXF no clasifica las piezas, y sin categoría TODA la cadena aguas abajo (semántica de edges → autoSew → colocación anatómica → drape) degrada a heurísticas ciegas que producen el blob.**

## 1. La cadena del blob (verificada, con evidencia)

| # | Eslabón | Estado en main | Evidencia |
|---|---|---|---|
| 1 | **Clasificación en import DXF** | `importDXFContent` NUNCA llama a `applyClassification` (cero call sites en el import path); y aunque lo hiciera, `pieceClassifier` es regex-por-nombre — "PATRONES PARA SAMUEL-N" no matchea NINGUNA regex (verificado contra `garmentPlacement.ts:75-103` y `pieceClassifier.ts:17-43`) | Sonda: `category: NONE, side: NONE` en las 5 piezas |
| 2 | **Semántica de edges** | Sin category, `detectSemanticEdges` entra en la rama 'unknown' → nombres posicionales (topEdge/leftEdge/edge-N) SIN matchHints. Las ramas bodice-front/back que emiten armhole/shoulder/neckline/sleeveCap (`semanticEdges.ts:197-219`) nunca se ejecutan | Log del import: `bottomEdge/rightEdge/topEdge/leftEdge` en bodices reales |
| 3 | **autoSew** | `autoDetectSeams` (tool del registry, EXISTE y es accesible al agente) puntúa con naming=null y semanticMatch=0 → solo length+proximity → 0 propuestas confiables en la camisa real. El SEMANTIC_LIFT (0.55, `scorer.ts:170`) que haría confiable sisa↔copa nunca aplica | Import real: SEAMS: 0 |
| 4 | **Colocación 3D** | `placeGarmentPieces` TIENE colocación anatómica (front +Z, back −Z, mangas a hombros, `garmentPlacement.ts:237-336`) pero rutea por `detectBodyRegion` = category/regex de nombre → las 5 'unknown' → heurística par/impar con stagger en X (`:388-424`): mangas y tira colocadas como torso, todo apilado | Sonda arrange 3D: las 5 piezas coplanares al pecho |
| 5 | **Solver** | `selfCollision: false` en el DEFAULT runtime del worker WASM (`wasmSolverWorker.ts:160`) aunque la capability dice `true` (port #608) — sin separación pieza-pieza. El texto del overlay ("self-collision disabled") es STALE respecto a A7 pero casualmente coincide con el runtime. Costuras incompletas (2 de ~8) + gravedad → arruga y cae | Overlay + capturas del blob |

**Hallazgos colaterales** (bugs independientes encontrados por el diagnóstico):
- A. `arrangementOverrides` (drag de piezas en arrange 3D) **posiblemente nunca llega al solver** — el loop de `placedMeshes` usaría el output de `placeGarmentPieces` directo. Si se confirma: la colocación manual es una superficie mentirosa (clase BP). Verificar en M2.
- B. Texto del overlay WASM stale vs A7 (self-collision figura como disabled pese al port #608) — reconciliar capability/runtime-default/texto en M4.
- C. El addendum v3 del DoD (`docs/plans/2026-05-19-step3-garment-placement-fix.md`) ya sospechaba "placement never wired to solver" — este plan lo resuelve o lo refuta.

## 2. La dirección del fix (filosofía del producto)

**Data-first, no algorithm-first**: autoSew, el scorer, la colocación anatómica y la semántica de edges funcionan — necesitan piezas clasificadas. Y per la filosofía ratificada del producto (no manual curation; el agente vive en todo el sistema): **la clasificación debe ser automática en el import**, no pedirle a María que renombre sus bloques. Para piezas sin nombre útil, clasificador **geométrico** (las formas de un patrón son altamente distintivas: copa de manga = campana simétrica con curva fuerte; bodice = escote + dos sisas, delantero con escote más profundo que espalda; tira = aspect ratio extremo).

## 3. Fases (cada una = 1 PR desde `origin/main`, test-first sobre el patrón de María)

| # | PR | Contenido | Done verificable | Est. |
|---|---|---|---|---|
| **M0** | (en la rama de M1) | Repro pineado `it.fails`-style sobre el fixture real: categorías ≠ 'other'/undefined tras import; edges con armhole/sleeveCap/shoulder; `autoSew` ≥6 seams con confianza; métrica de drape (separación Z delantero/espalda post-placement; % vértices sobre la cintura post-sim — la métrica del DoD #506) | Tests rojos commiteados | 2-3h |
| **M1** | `feat(import): clasificación automática de piezas en el import DXF` | Wire de clasificación al import path: (1) name-based (gratis, cubre DXFs bien nombrados); (2) **clasificador geométrico** para el resto — features por pieza (bbox aspect, área relativa, firma de curvas por edge detectado, profundidad de concavidades) → bodice-front/bodice-back/sleeve/strip; (3) re-detección de edges post-clasificación (mismo patrón que loadProject generativo) → semántica + matchHints. Registrar en copilot (`classifyPieces` tool o extender perception) per convención | Las 5 piezas de María: 2 bodices (front/back correctos), 2 sleeves, 1 strip — sin tocar nombres. Edges con armhole/neckline/sleeveCap | 8-12h |
| **M2** | `fix(arrange): colocación anatómica + cable arrange→solver` | Con categorías, `placeGarmentPieces` rutea solo. Verificar hallazgo A (overrides→solver) y arreglar si es real. Screenshot arrange: exploded-view de camisa alrededor del avatar (delantero al pecho, espalda detrás, mangas a los brazos) | Sonda arrange muestra camisa explotada, no blob apilado | 3-5h |
| **M3** | `feat(seam): la camisa se cose sola` | Con semántica, `autoDetectSeams` propone hombros + costadillos + sisas↔copas. Exponer trigger de usuario post-import si no existe (el agente ya lo tiene); revisar umbral de confianza con el patrón real | María's shirt: ≥6 seams automáticos correctos (pares verificados contra la anatomía de una camisa) | 3-5h |
| **M4** | `fix(sim): drape de camisa` | `selfCollision` runtime default en WASM reconciliado con A7 (capability true / default false / texto stale — hallazgo B); tuning de shrink si la convergencia lo pide; verificar colisión de avatar en el flujo import | Replay spec verde: camisa drapea SOBRE el avatar (métrica DoD: <5% vértices bajo cintura; separación delantero/espalda mantenida) + screenshots que parecen una camisa | 4-6h |

**Total: 20-31h.** Con R0-R2 ya hechos, los días liberados del calendario pre-gate absorben M0-M2 antes del gate M5 (jue 18/19) — y una camisa drapeando es el mejor insumo posible para ese gate. M3-M4 pueden caer antes o justo después según ritmo.

## 4. Relación con los planes vivos

- **R2/#883** (seam lines en sim) queda válido y pendiente de merge — de hecho fue la lente que hizo visible el blob. Las seam lines son la telemetría visual de M3/M4.
- **Replay specs (#879)**: cada fase M añade specs sobre el fixture de María — el mandato "todas las pruebas con el patrón real" ya es convención.
- **E1 boundary (#878)**: sin cambios; su condición de entrada (semana de uso real) corre. Este plan ES uso real enseñando dónde duele — exactamente lo que E1 esperaba.
- El clasificador geométrico de M1 es además el primer ladrillo del agente RAG de patronaje (un agente que no distingue una manga de un delantero no puede razonar sobre patrones).

## 5. Guardarraíles

- **Test-first sobre el fixture real** — el patrón de paridad que ya funcionó 7 veces: repro rojo, fase lo pone verde.
- **No tocar los nombres de María** ni pedir curación manual — si el clasificador no puede con una pieza, lo dice (Fase 4 style: aviso explícito, no silencio).
- **Cada hallazgo colateral (A/B/C) se verifica antes de arreglarse** — el guardarraíl de claims del plan de paridad.
- La autorización de merge sigue siendo por-PR (la durable se agotó con el plan de paridad).

## 6. Addendum M0+M1 (2026-06-12, ejecutado)

La verificación previa ("aunque existan las funciones igual tenemos que revisar que funcionan") cambió el alcance de M1 — para bien:

- **Inventario**: existían CUATRO clasificadores (pieceClassifier, detectFromName, autoRenameDuplicatePieces, analyzeGarment LLM huérfano) — todos por nombre o inaplicables al import real. Y un quinto hallazgo: `detectSemanticEdges` SÍ tenía geometría, pero (a) `hasCurve` miraba el TIPO de comando (C/Q) → código muerto para polilíneas CAD; (b) segmentación por flip-de-zona → fragmentación arbitraria; (c) asumía medio-patrón al doblez (el costado izquierdo de una pieza completa salía 'centerFront').
- **Tercer paciente del mismo patógeno**: `autoSew/edgeExtractor.findCorners` medía ángulo por micro-segmento → cero esquinas en polilíneas → el outline entero era UN `edge-0` → autoSew emparejaba outlines completos.
- **Lo construido (M1)**: `outlineAnalysis` (esquinas binarias |giro|>30° + clusters + tramos con sagitta firmada; cmdRange por SEGMENTOS — el rect canónico da exactamente top[1,2]/right[2,3]/bottom[3,4]/left[4,5] per Fase 3); `geometricClassifier` (manga=campana convexa, bodice=escote+sisas cóncavos, front/back=profundidad RELATIVA de escote 0.41 vs 0.14, tira=aspect 11:1) con confianza+razones honestas; `detectSemanticEdges` reescrito sobre tramos (curvatura real, piezas completas); `extractEdges` de autoSew consume la MISMA segmentación (una autoridad); cableado en el import del shell (toast "N clasificadas automáticamente" + aviso honesto de las no clasificadas → override del agente).
- **Híbrido**: capa LLM (`analyzeGarment`) diferida con issue #885 — el override del agente HOY es `classifyPiece` (ya registrado); la geometría resuelve la camisa de María sin tokens.
- **Evidencia para M3** (umbral/scorer): con semántica completa, autoSew propone 12 — hombros ✓ y costados ✓, pero las coincidencias de longitud roban pares (tira 456mm ↔ copa 451mm; mitades de tira 228mm ↔ sisas 231mm) y faltan sisa↔copa y tira↔escote. El `it.fails` M1+M3 del contrato M0 queda rojo apuntando exactamente ahí.

## 7. Addendum M2 (2026-06-12, ejecutado)

La revisión del sistema de arrangement (mandato: "tenemos arrange points en estado avanzado, revisar cómo integrarlos") encontró el sistema MÁS avanzado de lo que el diagnóstico del blob sugería — AnchorPoints bone-attached shipped (60+ puntos siguiendo el esqueleto), tool `arrangeGarment` del agente shipped, flujo de vestido completo en el bootstrap — y un único cable roto, exactamente el hallazgo A:

- **`arrangementOverrides` nunca llegaba al solver** (verificado con quotes): el drag de DraggablePiece alimentaba TODA la vista arrange (SeamRenderer3D, Sew3DTool) pero `placedMeshes` usaba solo `placeGarmentPieces` — Simulate descartaba la colocación manual en silencio. El addendum v3 del DoD #506 llevaba semanas sospechándolo.
- **Fix**: `applyArrangementOverrides` (helper puro en garmentPlacement, posición override / rotación anatómica) aplicado en los DOS sitios de GarmentSimulation (staticGeometry + placedMeshes) con deps correctas. Replay E2E pinea el cable: pieza de María arrastrada a x=1.8 → el cloth mesh simula ahí.
- **M1 ya había matado el apilamiento**: con categorías fluyendo del import, `computePlacement` coloca delantero +Z / espalda −Z / mangas ±X / tira al cuello — verificado con test unit (separación Z) y captura (camisa explotada anatómicamente, mangas drapeando EN los hombros sin coser).
- **Diferido con issue #887**: snap-to-anchor al soltar drag + asignación explícita pieza→punto (las dos opciones que `arrangement.tsx` promete y hoy son console.log).
