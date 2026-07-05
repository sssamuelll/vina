# Acta del Consejo — Costura Real ("que se sienta hecha de fábrica")

**Fecha:** 2026-07-05 · **Convocado por:** Samuel (founder) · **Voces:** Voronov (ontología), Halberg (runtime), Richter (estructura), Cassian (ship), Lyra (asignación) · **Workflow:** `wf_ee692df0-2fd` (transcripts en journal)

## Mandato verbatim del founder

> "Lo que queríamos es que la simulación simulara de panas un cosido real, o sea que se sienta que es costura hecha de fábrica... tal y como se ve actualmente no parece que hayan costuras... el arreglo [dibujar seam lines] no es real y lo que hizo fue que ahora parezca más anormal... la simulación quedó más pesada y la idea es que siempre se vea flawless... la de CLO3D se siente real, se siente como si fuera la jodida camisa en la vida real."

## El diagnóstico central (unánime 5/5)

**El gap ya NO es cierre C⁰ — es continuidad de superficie C¹.** La sonda seam-gap da 0.2-1.2cm en todas las costuras ("todo cierra") y el founder sigue sin ver costuras porque el ojo no lee centímetros de gap: lee **curvatura vía shading**. Los resortes par-a-par fijan posición y dejan el plano tangente libre — cada unión es una **bisagra** (verificado: `extractBendConstraints` solo emite quads intra-pieza, `gpuBuffers.ts:240`; las normales jamás cruzan la isla de triángulos). Una bisagra entre paneles se ve como paneles, no como camisa. **La métrica medía centímetros mientras el founder juzga píxeles de curvatura — por eso "todo cierra" y "no parece cosido" son ambos ciertos a la vez.**

El modelo de constraints NO es la categoría equivocada (es la ontología de CLO3D mismo, que tampoco suelda piezas); le faltan exactamente **dos términos**: flexión cross-seam (física) y continuidad de normales (render).

## La cadena del feel (factores del gap, ordenados)

| # | Factor | Contribución | Veredicto |
|---|---|---|---|
| 1 | **Ranura almendra** (piel por hueco, tope trasero de sisa) | 20-40%, carácter BINARIO | Asesino #1 por veto binario (piel visible = "prenda rota", viola hito 24-jul). Es la firma local de la bisagra — la cuerda XPBD recta es el camino de mínima energía sobre el trapecio. Fix: el bend cross-seam cambia la CLASE de solución (el cap envuelve en vez de cruzar en cuerda). Predicción falsable: los ~7 pares caen a 0.7-1.2cm, o el residuo es pose/#887-F2 — jamás refutación del modelo. |
| 2 | **Bisagra libre cross-seam** (cero flexión entre piezas) | 30-35% | AUSENCIA estructural, no debilidad — ningún tuning crea el término que no existe. Fix: quads dihedral cross-pieza al pipeline bend existente. |
| 3 | **Normales discontinuas + slit 2mm** | ~15% | Se mata en RENDER: normal-weld sobre el pair map existente (~0ms). Bajo normales soldadas, el slit de 2mm DEJA de ser bug: se convierte en el surco de costura natural — el ancla visual del seam. Por eso floor→0 se poda. |
| 4 | **Líneas dibujadas durante la sim** | ~10%, daño ACTIVO | `depthTest:false + renderOrder 999` = rayos-X flotando contradiciendo al shading. El "más anormal" del founder es estructuralmente correcto. OFF por default. |
| 5 | **Material/render** (mate vs especular plástico, trama, AO) | ~30% para Richter, transversal | Asignado al hito 24-jul, PERO reclasificado: mismo eje del feel, no polish. Si el A/B del 17 falla por shading con física correcta, se adelanta. |
| 6 | **Ridge/firma física de costura** | ≤5% a distancia de demo | v2 SIN mecanismo nuevo: es la perilla de stiffness de los mismos quads. Nota Richter: la firma real es CRESTA elevada, no ranura hundida. |

## v1 ratificado (esta semana, pre-17-jul)

1. **Seam lines OFF por default durante la sim** — XS (0.5h). El toggle queda como modo inspección; la infra del PR #934 (SimSeamLines resucitado + SEAM_ENGINE_VERSION + Re-coser) intacta.
2. **Bend cross-seam GPU-only** — S (4-6h, flag primera hora). Quads dihedral cross-pieza (hinge = línea de costura lado A, alas = vértices interiores opuestos) concatenados a los ids ANTES del coloring (`gpuSolverClient.ts:479`); rest angle 0; stiffness = bendCompliance del fabric; ~600 quads; kernel P1 (Velvet) sin tocar. **CONDICIÓN Halberg (barrera automática): coloring CONJUNTO + assert en init `delta bendColors ≤ 4` vs baseline — o no se shipea** (blowup de colores = hasta +300 encodes/frame). Gate: sonda seam-gap (almendra 3-12cm → banda 0.7-1.2cm) + Cusick smoke + M4 + Epic-746 completa + capability A7 con fila nombrada.
3. **Normal-weld render-level** — S (día). Promediar normales de vértices apareados sobre el pair map existente (`seamPairs.ts`); dos rutas candidatas (kernel gather 1×/frame post-normalize vs post-pass CPU tras `computeVertexNormals`) — MEDIR primero cuál etapa alimenta el render del tier default. Cero física, cero gates. Ganó v1 3-2 (argumento decisivo de Richter: sin normales continuas, el bend cross-seam no se VE).
4. **Ladder A/B determinista de perf + re-anclaje del DoD #897** — S (medio día). Runs bit-idénticos gateando grupos de dispatch uno a uno; bracket CPU-bound vs GPU-bound. **DoD re-anclado (4-1, con salvaguarda de Cassian): la ESCENA cambia a prenda COSIDA @10s asentada, el umbral ≥30 NO baja; 27-29 cosida = presupuesto aceptado declarado hasta post-17.** Regla: ningún recorte de perf se commitea sin su fila del ladder. Escalera si falta: (1) self-collision cadencia-2 post-settle, (2) doble staging readback, (3) substeps ÚLTIMO — bloqueado por migración alpha-space (`physicalFabric.ts:665-666`: la banda angular asume sdt=1/900).
5. **Ship viernes 10-jul + kill-switch propio sábado 11-jul**: re-captura + **A/B mismo ángulo contra la referencia CLO3D con criterios nombrados de antemano** (cero piel a través de tela, curvatura continua hombro→manga, cero artefactos overlay). Fallback único pre-autorizado si sigue piel: floor→0 quirúrgico SOLO pares almendra (2h, con medición de pull-through previa). Si tras la tríada la unión sigue leyendo bisagra: se CONGELA la física de costura y el residuo se compra con render o se acepta para el 17. **Welding NO se abre bajo ninguna condición.** Buffer 11-17 íntegro para vestir a María end-to-end.

## Podas (con condición de retorno)

- **Welding topológico** — veto 5/5 pre-17. Su techo está DEBAJO del target (modela la costura como inexistencia — sin ridge expresable) y viola la restricción invisible que gobierna el producto: *la malla de sim debe seguir siendo proyección de la identidad de piezas del patrón* (grading/moat, Re-coser, freeze/fabric per-pieza, flujo DXF). Retorno: v2 post-24-jul, solo re-init en frontera de fase, solo tras nombrar la frontera formal pieza↔manifold.
- **floor→0 post-sew** — podado (A3 load-bearing contra pull-through; con normales soldadas el slit ES la costura visible). Retorno: solo el fallback quirúrgico del ítem 5.
- **Seam ridge como mecanismo separado** — podado permanente (es la perilla de stiffness de los mismos quads, cuando el gate de píxeles lo pida).
- **Render de las seam lines** (normal-offset, node material TSL) — podado ("pulir el render de algo que no se muestra es la definición de desperdicio").
- **Más tuning de compliance/floor buscando feel** — CERRADO sin retorno: el techo de esa palanca ya se tocó.
- **Contrafactuales destructivos sobre la almendra** (g=0, colisión-OFF) — cerrados por medición.
- **Port WASM/CPU del bend** — diferido post-17 vía A7 (precedente self-seams GPU, Epic-746). Consecuencia aceptada y documentada: el fallback por device-loss drapea con bisagras.
- **Substeps 15→12** — BLOQUEADO hasta migración alpha-space (recalibra la física en silencio; Cusick revienta sin que nadie lo vea).
- **Optimización perf pre-medición** — podada.

## Riesgos de gates

- **Cusick:** riesgo cero aritmético (disco mono-pieza sin costuras); se re-corre como smoke. Salvedad Richter nombrada: los quads heredan bendCompliance del fabric, pero una unión real es MÁS rígida — divergencia nombrada, no implícita.
- **Blowup de colores bend:** barrera automática (assert delta ≤4).
- **Paridad WASM:** intacta (el oráculo no ve quads GPU-only); ratificación A7 per-feature.
- **Epic-746:** quads van al pipeline bend, no al seam packing (contrato #11 intacto); suite completa pre-merge.
- **Watch item (Halberg):** rest 0 en el cap = "continúa plano", no el ángulo real del patrón — si el kernel pelea con la colisión se ve como shimmer + inflación de pares SC; medible en el harness A/B determinista.
- **El riesgo real del 17-jul no es técnico:** (a) scope creep hacia welding disfrazado de "ya que estamos"; (b) criterio de aceptación sin ancla — se define HOY el test perceptual o se repite el patrón "sondas verdes, founder insatisfecho".

## La pregunta incómoda (Lyra, tal cual)

> "¿Quién emite el veredicto de 'se siente real' el 17-jul: un A/B screenshot contra la referencia CLO3D con criterios nombrados de antemano, o tu ojo del día? Porque 'flawless' sin ancla es el único gate del tablero que no puede cerrarse nunca — y ya llevas dos escaladas verbatim pagándolo en cuotas ('no parece cosido', 'más anormal'). Nombra el píxel que aprueba, o acepta que el gate es infinito."

## Verificaciones del secretario (file:line)

- CONFIRMADA — bisagra estructural: `gpuBuffers.ts:240` (`if (tris.length !== 2) continue`) — ninguna arista de frontera de costura genera quad jamás; punto de concatenación del fix en `gpuSolverClient.ts:479`, counts de colores en `:625-633`.
- CONFIRMADA — líneas rayos-X: `SimSeamLines.tsx:96` (`depthTest:false`) + `:100` (`renderOrder=999`).
- CONFIRMADA — pair map + anclaje CPU para normal-weld: `seamPairs.ts` (con test) + `GarmentSimulation.tsx:351` (`computeVertexNormals`).
- CONFIRMADA — veto substeps: `physicalFabric.ts:665-666` (banda angular asume sdt=1/900; Cusick como oráculo).
