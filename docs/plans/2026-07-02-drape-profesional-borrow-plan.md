# Plan definitivo — Drape profesional (scouting de mercado + ingeniería propia)

**Fecha:** 2026-07-02 · **Branch:** feat/envelope-wrap · **Estado:** aprobado por panel del roster (Halberg/Serrano/Richter/Cassian/Plumb, 2 workflows, 25 agentes, verificación adversarial)

## 0. Qué es esto

Samuel pidió: evaluar los repos de GitHub de tres investigaciones (Gemini/ChatGPT/Claude) para no reinventar la rueda, y un plan accionable para el drape profesional. Los dos dolores: **(1) la ropa traspasa la piel del avatar, (2) el drape no se ve profesional** (sin pliegues reales).

**Hallazgo central de la investigación (20 agentes, licencias y código verificados adversarialmente):** el mercado NO reduce el esfuerzo — reduce el **riesgo de diseño**. Cero código aterriza literal (todo es reescritura ×3 tiers); lo que sí aterriza son formulaciones pre-validadas, trampas conocidas de antemano, y 27+ callejones podados con evidencia. En particular: **ningún repo del planeta resuelve nuestro face-poke** (body-vertex-vs-cloth-face) — xrtailor solo consulta cloth→obstacle, NvidiaWarp sobrevive por densidad de malla, ARCSim es offline. Nuestra colisión pseudonormal shipeada ya está por delante de todo el cluster WebGPU.

Dossier completo de la investigación: scratchpad de sesión (`dossier-cloth-borrow-2026-07-02.md`); veredictos propagados a la memoria `cloth-sim-borrow-map`.

## 1. La tabla de borrows (fuentes verificadas, licencia limpia)

| Fuente | Licencia | Qué se toma | Alimenta |
|---|---|---|---|
| **vitalight/Velvet** | MIT ✓adv | `SolveBending_Kernel` — kernel GPU dihedral XPBD completo (gradientes Müller-2007), traducir línea-a-línea. NO portar su acumulación atomicAdd-float (reabre P4). Su propio autor documenta que dihedral bajo Jacobi promediado falla → valida nuestro graph-coloring. | P1 |
| **Tissu** (evanrock520-ciencias) | Apache-2.0 ✓adv | Formulación **atan2(sinθ,cosθ)** del ángulo (estable cerca de plano, donde acos explota). Su StitchConstraint valida nuestro seam zero-rest como formulación estándar. | P1 |
| **PositionBasedDynamics** (Bender) | MIT ✓adv | Matemática canónica `solve_DihedralConstraint` (verificada token-a-token + checks numéricos a mano) + **fast-acos polinomial** (escape hatch perf + bonus P8). Upstream sin guards en /|n|² — agregarlos (A3). | P1 |
| **Scrawk/Position-Based-Dynamics** | MIT (dual) | `DihedralConstraint3d.cs` → transcripción casi mecánica a TS (tier CPU). Es PBD: agregar término compliance. | P1 |
| **openxrlab/xrtailor** | Apache-2.0 | **Arquitectura Generate/Solve** (detectar 1×/frame → lista compacta → re-resolver dentro del substep loop) + knob collision-passes. El precedente de distribución baricéntrica es `predictive_contact/Solver.cu SolveVF_Kernel` (⚠ bug upstream: `uint w = invMasses[...]` trunca). **NO** "resuelve nuestro caso" — refutado adversarialmente; es patrón, no solución. | P2 |
| **st-tech/ppf-contact-solver** | Apache-2.0 | Coeficientes point-triangle **clampeados** (`contact/distance.hpp`) — mata el hard-reject de pokes cerca de aristas SIN edge-tests. | P2 |
| **bandinopla/three-simplecloth** | MIT | Patrón tether TSL stack-exact: `mix(pos, anchor, weight)` + **re-snap por teleport-distance** = la semántica del refresh en re-pose. | P3 |
| **maria-korosteleva/GarmentCode** | MIT ✓adv | Schema patrón/costura (panels+edges+stitches por índice) + el truco de **normalización de edge-loops con rewrite de refs** (core.py, portable) — sin eso los refs de seams se pudren al re-importar DXF. | P6 |
| **virtualtextiles/fabrics-drape-data** | MIT | ~5 ideas de campos (es un stub SIN datos): curva fuerza-elongación N/m, provenance de medición, cusick DC. | P7 |
| **realcrane/Bayesian-Cloth-Digitalization** | ARR (solo método) | Metodología Cusick (ISO 9073-9): disco 30cm sobre pedestal 18cm, drape coefficient + fold count → nuestro gate virtual. No copiar código ni data. | P7 |

**Correcciones al borrow-map previo (verificadas):** nakjun = IGNORE definitivo (colisión comentada en HEAD, "normal"=centroide, sin licencia — la nota "posiblemente resuelve face-poke" queda refutada a nivel de archivo); jspdown = sin bend alguno (valor práctico post-P4-1: nulo); HinaCloth determinism = design-doc sin código (P8 ruling intacto); ThomasConrad/gpu-cloth-sim2 = cero código de simulación; DiffCloth = **MIT** (no read-only); Electric-Bluefish/garment-sim = ahora PÚBLICO, sigue ARR (su adopción de GarmentCode JSON confirma nuestra decisión de schema); ContourCraft = seed del tier Neural futuro (su `icontour.py` MIT = posible untangle CPU post-settle, experimento post-P1).

## 2. Estructura: dos tracks paralelos (ruling Richter, unánime en panel)

El borrador original serializaba el dolor #1 del usuario (traspaso) detrás del ítem de mayor riesgo (recalibración P1). Refutado: **P1-A (one-sided stretch) NO depende mecánicamente del dihedral** — `makeDistanceConstraintFn` genera closures por call-site; un parámetro `oneSided` aplicado SOLO al call-site de stretch deja el bend intacto (verificado; además el experimento de 1 línea ya probó estabilidad). La dependencia "el tent pelea al stretch two-sided" es **hipótesis de magnitud, se mide con la métrica 0.1**, no se serializa como hecho.

```
TRACK PIEL (dolor #1: traspaso)          TRACK PLIEGUES (dolor #2: drape)
─────────────────────────────           ─────────────────────────────
A1. Métrica de penetración (computar     B1. Tether off-switch [XS]
    + publicar) [S→M]                    B2. Gate Cusick-lite 2 anclas [M]
A2. Instrumentar face-poke WIP [S]       B3. Spec P1 corto [S]
A3. Piso de seams ESCALAR v1 [M]         B4. Extractor flat=0 + coloring
A4. Face-poke Generate/Solve                 stride-4 + 3 kernels dihedral
    (rediseñado, ver §4) [L]                 + recalibración = UNIDAD ATÓMICA [L]
                                         B5. One-sided stretch [S]
```

Los dos tracks comparten el gate María @gpu-local (runner: **Samuel** — único runner de todos los gates GPU; los estimados incluyen esa latencia).

## 3. Hito con fecha (ruling Cassian)

**Viernes 10 de julio — María con pliegues reales y sin pull-through de sisa, face-poke aún OFF.**

Dentro: dihedral 3 tiers (flat=0, stride-4, guards), recalibración contra Cusick-lite (chiffon+canvas), one-sided stretch, piso escalar de seams, `bendRestDistances.ts` borrado, tether off-switch, penetration count publicado. Criterio: pliegues visibles en mangas (vs domo), ≥30fps, belowHip 0, DC ordenado chiffon≫canvas, P4-0 verde.

Calendario (hoy jueves 2): **J2** spec P1 + tether flag → **V3** Cusick-lite 2 anclas; ∥ métrica penetración → **L6** extractor+coloring; ∥ instrumentación face-poke → **M7** kernel TSL; ∥ piso de seams → **X8** Rust+CPU+rebuild ambos artefactos → **J9** recalibración+one-sided (día de riesgo; si la banda no cae, hito corre a lunes 13, no más) → **V10 hito**.

Semana del 13: face-poke Gen/Solve con lo que diga la instrumentación → **veredicto de flip viernes 17** → **merge PR #924 a main esa semana** (no se retiene por Fase 4). Post-merge: fases siguientes como PRs separados tras flags — se acabó el mega-branch como unidad de rollback (Serrano F13).

## 4. TRACK PIEL — detalle

Los 3 mecanismos del traspaso (diagnóstico 2026-06-26, verificado por scouts): (1) inside/outside cóncavo — **PARCHEADO** (pseudonormales `918123c5`); (2) seams jalan a través del cuerpo — **ABIERTO** (shrink a 0 literal en los 3 tiers, verificado); (3) face-poke — **WIP OFF** (corr≈0 = bug real + 5ms).

### A1. Métrica de penetración (el oráculo del track) — [S→M, ~60-100 líneas]
Plumb: NADA computa el contador hoy (el e2e lee `__OPENCLO_PENETRATION_COUNT__`, publisher ausente — assert dormido). Definición concreta: en el readback cadence existente (cada 15 frames, `GarmentSimulation.tsx:604-613`), CPU signed-distance por closest-feature pseudonormal sobre los verts de tela; **penetrationCount = verts con dist firmada < −2mm**; publicar el global + poblar `simulation.collisionDistance` (activa la regla `fit:body-penetration` del inspector). La métrica de **cobertura/oclusión se difiere como ítem propio** con definición de 1 página previa (Serrano F2 / Plumb flag 3) — POST-hito, requerida antes del exit de A4.

### A2. Instrumentación del kernel WIP — [S, 0.5-1d, cero riesgo, paralelizable YA]
Debug buffer corr-length + contact count → histograma; validar contenido CSR empacado; kernel GPU vs oráculo CPU (`facePokeCorrection.ts`) en escena sintética 1-cara+1-vértice → aísla codegen TSL (sospechoso: `toVar/.addAssign` en Loops anidados) vs input-packing.

### A3. Piso de seams ESCALAR v1 — [M; la "S secretamente L" si se complica]
Física: ~5 líneas ×3 solvers (`seamAssembly.ts:746-754`, `lib.rs:656-665`, `tslSolver.ts:510-519`). Plomería real: 3 data paths + 2 ABIs de worker + rebuild WASM + contratos Epic-746 re-pinneados (~150-250 líneas, ~10 archivos). **v1 = piso escalar por seam: `floor = max(2mm, (thickness_A + thickness_B)/2)`** (thickness ya existe per-fabric en mm). Declarado honesto: el piso es la **HIPÓTESIS** de fix del mecanismo 2 (Serrano F6: un piso sub-mm podría no cambiar la geometría del pull) — se mide con A1 en sisa/hombro; si el pull-through persiste, la escalación nombrada es proyección body-aware del punto medio (spec propio, NO se improvisa). Per-constraint body-aware queda fuera de v1 (Plumb flag 2).
**Gate A3** (Serrano F7 — toda fase física tiene gate): penetrationCount en sisa ↓ vs baseline, P4-0 verde, Cusick sin cambio, María visual. Runner: Samuel.

### A4. Face-poke Generate/Solve — REDISEÑADO por el BLOCKER de Halberg — [L, rewrite ~300-400 líneas, ~20% reuso]
El borrador decía "retirar el snapshot B1, resolver de posiciones vivas" — **eso reintroduce la race B1 exacta que P4 mató** (kernel que escribe `posBuf` mientras hilos hermanos leen esas posiciones como esquinas = UB WGSL; el gate P4-0 fallaría). Diseño corregido, todo con piezas de la casa:

- **Pass A (Generate), 1×/frame o cadencia 2:** BVH walk existente → **lista densa per-vertex** (estilo xrtailor; libera un slot de buffer vs atomic counter) con **K slots por vértice + evicción keep-deepest** (Halberg #5: sin regla de evicción, el poke sobrevive exactamente en pezones/abs, la geometría contact-rich).
- **Pass B (Solve), dentro de substepNodes** (entre el par de colisión de cuerpo y postSolve — punto de inserción verificado trivial): **lee las esquinas desde `preCollisionPos`** — ya se snapshotea CADA substep antes de la colisión (`tslSolver.ts:916-917`) → race-free, determinista, cero pases nuevos. **Forma GATHER únicamente** (cada esquina computa su share baricéntrico en su propio hilo — el kernel actual ya lo hace): sin scatter, sin atomics float. **Sin write a `prevPos`** (Halberg #2: dentro del loop inyectaría velocidad espuria −corr/sdt ≈ 4.5 m/s por 5mm de push; cabalgar el path de exclusión de velocidad del push de colisión, como `body.applyPushNode`).
- **Fold-in que queda:** coeficientes clampeados de ppf (fix de correctitud del hard-reject). **Demovidos a escalación medida** (Richter): penalty cuadrático (bifurca el modelo de respuesta — proyección vs penalty) y edge-test Möller-Trumbore (argumento de linealidad: la protrusión máxima se alcanza en un VÉRTICE del cuerpo).
- **Presupuesto con ledger** (Serrano F1 — la aritmética del borrador no cerraba: worst case 1.75-5ms vs 2.6ms): asignación **P1 ≤1.2ms / P2 ≤1.4ms**. Reglas de decisión, no vibes (F5): si P1 medido >1.2ms → cadencia de bend 2 substeps y/o fast-acos ANTES de arrancar A4; si A4 >1.4ms con cadencia-2 + collision-passes ya engranados → el fallback SDF va a decisión explícita de Samuel (reabre decisión cerrada del spec 2026-06-30 ~L327 — se dice, no se cuela).
- **Gate A4 (flip de `GPU_CAPABILITIES.facePoke`):** penetrationCount frontal @10s **≥80% de reducción vs baseline OFF**, ≥30fps María, P4-0 verde, visual Samuel. Veredicto: viernes 17-jul.

## 5. TRACK PLIEGUES — detalle

### B1. Tether off-switch — [XS, hoy]
Semántica: **suprimir la captura** (tetherReady nunca se arma → el kernel no entra a substepNodes); no libera targets ya capturados. Superficie: localStorage `'openclo-tether-disabled'` (precedente `'openclo-use-webgpu'`). Lo necesita B2 (el tether congelaría el drape del disco a 2.5s, dentro del settle de 5s).

### B2. Gate Cusick-lite — [M, honesto 2-4d: harness dual no existe]
Disco 30cm (~2.5k verts) sobre cilindro 18cm, 5s settle, tether OFF. **DC = (As − π·9²)/(π·15² − π·9²)** por shoelace del boundary proyectado + fold count (máximos locales de radius(θ) suavizado). **v1 = 2 anclas** (chiffon DC~30 / canvas DC~90 — bracketean la banda y detectan bend-muerto, que es lo único que el hito necesita; las 3 del medio vuelven en Fase 4). **Diseño anti-flake corregido** (Halberg #9: post-P4 los runs same-machine son bit-idénticos — "mediana de 3" era código muerto): **perturbación determinista de rompimiento de simetría horneada en la semilla del disco** para clavar la cuenca + medir ambas cuencas una vez para derivar la tolerancia (arranque: ±8 DC, ±2 folds — se ajusta con dato). Si el spread inter-cuenca aparece, **se publica como métrica** (es el hallazgo de metastabilidad residual), no se mediana al silencio. Sanity-check del shoelace con chiffon (puede sub-leer As con folds metidos). Variante WASM en CI: POST-merge — y con honestidad de baseline (Halberg #4): GPU y WASM tienen físicas estructuralmente divergentes hasta el backport del strain-limit → **dos gates, dos baselines**, no "paridad".

### B3+B4. La unidad atómica P1 — [L; NO hay PR parcial (Plumb flag 5)]
El flip de convención (flat=π→flat=0) en el extractor rompe los 3 tiers hasta que los kernels aterricen: **B4 = extractor + coloring + 3 kernels + recalibración en un solo PR.**
- **Extractor:** reescribir `computeDihedralAngle` a la fórmula del solver (flat=0; fallback degenerado 0, no π); φ* = π·(1−creaseAngleDeg/180) — creaseAngleDeg pasa de hack de distancia a ángulo exacto (tests fold/pleat se actualizan aquí). Borrar `bendRestDistances.ts` (BUG-1 invertido) y el mismatch dormido `gpuSolver.ts:251`.
- **Coloring:** generalizar `colorConstraints` a stride-N (10 sitios stride-2 hardcodeados en ~110 líneas, medido) y colorear sobre los **4 ids** — reusar los bendColors (c,d) reabre P4-1 (HARD, veredicto físico). Blowup esperado: ~12 colores regular / ~20+ en slivers — absorbible (los substeps ya baten en un solo submit).
- **Kernels:** TSL ~100-160 líneas (inflación node-style ×3, medida contra tslFacePoke — no "40"), Rust ~60-80 (Gauss-Seidel secuencial, sin coloring), CPU ~60-80. atan2 de Tissu; guards |n|²<1e-12 + elen eps + clamp **load-bearing** (one-sided hace slivers más probables — no es higiene). Lockstep pleno en el mismo PR (Cassian: ~1 día el Rust, págalo — un flag A7 dejaría dos representaciones de bend vivas y el fallback por device-loss drapearía distinto). WASM rebuild + copiar AMBOS artefactos.
- **Recalibración (el riesgo #1 del arco, ahora con doble barrera — Serrano F3):** banda angular ≈[6e-2, 10] (×5e4, aritmética verificada), mesh-dependent (~1/e²). Barrera 1: gate Cusick-lite (oráculo). Barrera 2 (automática): **BEND_K pinneado como campo configBridge-compartido + unit test que rechaza valores de la banda de distancia vieja [1.2e-6, 2e-4] cuando el bend es angular** — el bend muerto se vuelve unshippeable por assert, no por memoria. Los clamps de `toXPBDParams` pasan a **espacio-alpha** (los actuales hardcodean sdt=1/900). Deslinde con Fase 4 (Serrano F4): B4 sweep = **K_bend contra 2 anclas**; Fase 4 = 3 parámetros × 5 anclas.
- **Escape hatches de presupuesto:** cadencia bend cada 2 substeps; fast-acos polinomial (si se adopta, en los 3 tiers por lockstep — bonus P8).

### B5. One-sided stretch — [S, 1-2 líneas/tier + tests]
Parámetro `oneSided` SOLO en el call-site de stretch (bend intacto — así no depende del dihedral). Semántica combinada post-B4: tensión compliant → cap +2% → compresión libre → buckling resistido solo por dihedral = nucleación de pliegues. **Regla de des-serialización** (Serrano F8): si P1 se desliza y la instrumentación A2/A4 muestra que el tent residual contra stretch two-sided es inaceptable, B5 entra ANTES por el track piel (estabilidad ya probada por el experimento de 1 línea).

## 6. Post-hito (con fecha nombrada, no "algún día")

| Qué | Cuándo | Nota |
|---|---|---|
| Backport strain-limit WASM/CPU (deuda A7 STEP-4) | Semana del 13, PR aparte | Fuera del PR más riesgoso (Richter); obligatorio ANTES de tocar main con física nueva — hace honesto el oráculo de paridad. |
| Variante WASM del gate Cusick en CI | Con el merge | Dos baselines declaradas hasta el backport. |
| Merge PR #924 → main | Semana del 13, tras veredicto face-poke | Luego: PRs por fase tras flags. |
| Schema P7 (tensileModulus, `cusick.dc` — NO voltear `drapeCoefficient` in-place, semántica invertida vs ISO alimenta el sheen —, provenance 'estimated') | Fase 4 | Los targets DC del hito viven en el fixture del test. |
| Sweep 3 parámetros × 5 anclas (con harness batch previo — un solo runner humano) | Fase 4, post-merge | Valores medidos de vendors caen sin cambio de código. |
| Tether re-pose refresh | Post-hito | Trigger = evento de rebuild de colisión (debounce 200ms existente) → reset de `tetherCaptureRequested`/`tetherReady` → re-captura a +150 frames; snap teleport-distance (three-simplecloth) con umbral knob (~10cm). GPU-only A7. [S] |
| Métrica de cobertura/oclusión | Definición 1-página primero; requerida para el exit de A4 | Ítem propio (Serrano F2). |
| P6: schema GarmentCode + normalización edge-loops + warning delta-longitud de seams + seams inspeccionables (clo3d-mcp como referencia de tool-surface) | Track producto M2, no bloquea drape | El warning de delta-longitud es el borrow #1 de UX de costuras (frente #4). |
| Experimento icontour (ContourCraft MIT) como untangle CPU post-settle | Post-P1 | Recovery ocasional, jamás per-frame. |

## 6bis. Enmienda 2026-07-02 (post-consejo, decisión de Samuel)

**Hito redefinido en PÍXELES (consejo, Cassian): screenshot de María el V 24-jul** — cero piel a través de la tela, tela apoyada a ~grosor (2-3mm), pliegues con chiffon≠canvas distinguibles, sombras de contacto. Slip máximo declarado: 31-jul.

**MANGAS DENTRO DEL SCOPE (decisión Samuel 2026-07-02) — SCOPING CERRADO:** la memoria histórica estaba desactualizada: el wrap circunferencial de manga SÍ existe y se aplica (330°). La caja es un **bug de parametrización de radio**: `wrapPanel.ts:29` computa el arco en el radio del CUERPO (armR=0.05) pero coloca la tela en R+gap=0.08 → sobre-curvatura 1.6× → 18% de vértices APILADOS en las líneas de clamp ±165° + 82% pre-estirado +60% → la energía explota en el "pillow". **El collar tiene el mismo bug PEOR (59% clampeado = el pico del cuello).** Fix isométrico (φ=w/(R+gap) + radio derivado del panel) probado: geometría limpia (pares 8.1→6.5cm, spans simétricos, cero piling) y gate oficial 3/3 (sleeve 6492→6491) — **PERO bajo un flujo e2e sin polls el tubo limpio DESLIZA antes de 2.5s y el tether congela la pose mala (sleeve=2, 3/3 reproducible); la caja actual es load-bearing POR ACCIDENTE** (cuña brazo↔torso). Discriminador = **CARRERA DE INIT** (bake de colisión / publish de armAxis vs frames de sim) + tether lock-in. Trabajo (banda 1.5-3 días): (1) wrap isométrico ~50 líneas [XS, bloqueado por 2a]; (2a) **la sim NO arranca hasta collision-ready + armAxis publicado** ~30-60 líneas [M — mata la carrera para TODAS las piezas]; (2b) tether re-captura en re-seed; (3) collar coverage; (4) probe e2e de retención sin polls; (5) contingencia anchor axial/wrap cónico. No toca el binding grading-safe #887. **Secuencia: A4 primero (10-jul intacto) + 2a como quick-win + bloque mangas entre el 10 y el 24.**

**HALLAZGO LATERAL MAYOR (P4/#902):** cada flujo de arranque produce drapes **bit-idénticos entre runs** — la "bistabilidad" histórica de #902 parece mayormente **carrera de init** (timing wall-async de colisión/armAxis), NO float GPU. El fix 2a la ataca de raíz.

**BLOQUE MANGAS CERRADO 2026-07-03 (adelantado):** (2a)+(2b) shipped `91bce450` — gate simReady + relojes de settle por-seed. (1)+(4) shipped: wrap isométrico re-aplicado con gates verdes — pero el tubo limpio a medio brazo deslizó igual (retención 1935<3000): la costura sleeveCap↔sisa con gap de ~31cm ARRASTRA el tubo fuera del brazo. La contingencia (5) resultó ser el fix real y es mínima: **anclar el borde del cap a profundidad-de-sisa del hombro** (`surfaceFrame` + `pieceLengthM`, `SLEEVE_CAP_MARGIN=0.10`) en vez de centrar en armLength/2. OJO: margen 2cm FALLA (16 verts @10s) — el anillo nace dentro del deltoides/axila y la colisión eyecta el tubo contra las costillas; a 10cm el anillo libra el deltoides y la costura corta tira del tubo HACIA el hombro = la manga cuelga de la sisa como una prenda real. Resultado: **retención 6378@2.5s → 6379@10s (sostenida, cero pérdida)** vs caja vieja 6661→6638 (cuña accidental) — gate 4/4, fps 32.8, suite 5828, screenshot `docs/reports/assets/2026-07-03-sleeve-fix.png`. (3) collar coverage sigue pendiente (44% clampeado con el cap 150° de DEFAULT_WRAP — tratamiento propio). Cuffs conservan mid-arm (sin pieza de prueba; anclaje distal cuando exista una).

**Ejecutado del consejo (commits 3164e432/a8eb2b39/22379f07):** fusión strainLimit→stretch (precondición A4 ✓, 31.5ms), ease-vector v0 (María: chest +8.0 measured / waist +22.0 / hips +8.0), sombras WebGPU (guard stale r183; IBL 0.3; fps 31.6). Asignación ratificada: 60% motor acotado / 25% fit / 15% grading, kill-switch 2 semanas. Podas del consejo: fold-count fuera del pass/fail Cusick (telemetría + probe de convergencia), tether re-pose refresh → condición de retiro (A4 ON + margen partido + fricción sostiene ⇒ borrar tether), icontour post-settle borrado, malla fina UNIFORME prohibida (zonal per-pieza + wrinkles de render = el camino), margen 8mm → partir en grosor-físico per-fabric + offset de render (Richter: error de categoría, no un número que se baja). A4 se construye como CONTACTO UNIFICADO (una superficie, un grosor, una respuesta — no el quinto miembro del "comité de superficies"). Acta: docs/reports/2026-07-02-consejo-drape-profesional.md.

## 7. Techo estructural (Richter — se nombra, no se retrofitea hoy)

El solver acumula pases por feature y ya golpeó DOS veces la pared de 8 buffers con 0 slack. Tres consolidaciones nombradas como follow-ups estructurales, y una regla vigente desde ya: **(a)** empaquetar pos+invMass en vec4 intercalado libera un slot en CADA pase (disuelve la pared una vez, no se negocia feature a feature); **(b)** fusionar strainLimit→stretch (mismos ids, mismos colores, mitad de dispatches); **(c)** el Generate/Solve de A4 es la **semilla del subsistema de contacto unificado** — REGLA: no se escribe un quinto pipeline de contacto; la próxima feature de contacto extiende Gen/Solve o justifica por qué no.

## 8. NO-hacer (podado con evidencia, con condición de retorno donde aplica)

- **Yarn-level** (7 repos): altitud equivocada para malla triangular XPBD.
- **Solvers optimization-based** (FastMassSpring/PD/ADMM): global solves no caben en 8-buffers/2.6ms; factorizaciones mueren con seams. Familia podada de benchmarks futuros.
- **ARCSim impact-zones/CCD**: offline; xrtailor lo relega a su quality-mode no-realtime — prueba de que el poke visible no lo necesita.
- **Más trabajo de determinismo (P8)**: no quedan races; nadie del mercado logra bit-stability cross-run (HinaCloth = vaporware verificado). El residual se ataca con calidad de drape (esto mismo).
- **Buckling-ratio floor**: rechazado (no supera one-sided para nucleación). Retorna SOLO si el wavelength de pliegues sale mesh-noisy medido, como decisión propia.
- **Edge-test Möller-Trumbore + penalty cuadrático**: escalaciones medidas, no v1.
- **SDF**: solo fallback de A4 con decisión explícita de Samuel (reabre decisión cerrada).
- **Neural ahora**: stub se queda; seed documentado (ContourCraft; re-entrenar checkpoints para limpieza comercial).
- **Copiar de**: ccincotti (sin licencia), nakjun (roto + sin licencia), NvidiaWarp (NVSCL), ISP (ARR+SMPL), Electric-Bluefish (ARR; su pygarment vendoreado tiene headers MIT stripped — copiar solo de upstream), ZIPs de Wang (sin licencia), DrapeNet (GPL).

## 9. Estimado honesto

Con las medidas de Plumb y la latencia del runner único: hito 10-jul alcanzable; **Fase 1 real ~2 semanas** si la recalibración muerde; arco completo **4-6 semanas como cota inferior optimista** (Richter). El valor del scouting fue diseño des-riesgado: atan2 sobre acos, flat=0, el bug uint de xrtailor, la advertencia del autor de Velvet, K-eviction, y 27 callejones que ya no vamos a caminar.
