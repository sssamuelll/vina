# P1 — Bend dihedral cross-tier + one-sided stretch (diseño)

**Fecha:** 2026-07-02 · **Branch:** feat/envelope-wrap · **Plan padre:** `docs/plans/2026-07-02-drape-profesional-borrow-plan.md` (track pliegues, B3-B5)
**Estado de las fuentes:** receta verificada adversarialmente (workflow 2026-07-02, checks numéricos a mano incluidos).

## 1. Problema

El bend es un resorte de DISTANCIA entre vértices opuestos en los 3 tiers (`tslSolver.ts:874-889` vía `makeDistanceConstraintFn`, `lib.rs:593-635 solve_bend`, `xpbdSolver.ts:1311-1336 solveBending`). Mide estiramiento, no curvatura → confunde bend con stretch, y al plegarse (dist < rest) EMPUJA APARTE = des-pliega. Además el stretch es two-sided (resiste compresión) → la membrana no puede juntarse. Consecuencia física: **los pliegues son imposibles** — el "domo 80s" en mangas. Diagnóstico completo: memoria `cloth-realism-north-star-unreal` § DRAPE NO-NATURAL.

## 2. La solución (A+B, unidad atómica)

**B = bend dihedral:** constraint angular XPBD sobre el quad `[a,b,c,d]` (arista compartida a-b, alas c,d — el layout que TODOS los tiers ya almacenan). C = φ − φ*, con φ el ángulo dihedral entre las normales de los dos triángulos.

**A = one-sided stretch:** el constraint de distancia del stretch corrige SOLO cuando C = len − rest > 0 (tensión). Compresión libre → la membrana puede juntarse → el pandeo fuera de plano lo gobierna el dihedral = nucleación de pliegues.

**Por qué unidad atómica (no PRs parciales):** el flip de convención del extractor (§4) rompe los 3 tiers hasta que los 3 kernels aterricen. Extractor + coloring + kernels + recalibración = UN PR (ruling Plumb flag 5).

## 3. Fuentes (licencia limpia, verificadas)

| Fuente | Rol |
|---|---|
| PositionBasedDynamics `solve_DihedralConstraint` (MIT, PositionBasedDynamics.cpp L41-97) | Matemática canónica (gradientes Bridson/Müller-2007). Verificada token-a-token. Trae el fast-acos polinomial comentado en el propio source. |
| Velvet `SolveBending_Kernel` (MIT, VtClothSolverGPU.cu) | Referencia de la misma matemática ya expresada como kernel GPU plano sobre constraints de 4 índices + XPBD `alpha/dt²`. NO copiar su acumulación atomicAdd-float (no-determinista); su autor documenta que dihedral bajo Jacobi promediado falla → nuestra respuesta es el pase graph-colored (Gauss-Seidel por color). |
| Tissu `BendingConstraint.cpp` (Apache-2.0) | Formulación del ángulo por **atan2(sinθ, cosθ)** con sinθ = ((n1×n2)·e)/(|e||n1||n2|) — gradiente estable cerca de plano (φ≈0), donde acos(dot) tiene derivada infinita. El drape vive cerca de plano: usamos atan2. |
| Scrawk `DihedralConstraint3d.cs` (MIT dual) | Transcripción casi mecánica C#→TS para el tier CPU (es PBD: se le agrega el término compliance). |
| Bergou isométrico-Q (mismo repo PBD, MIT) | **RECHAZADO**, para el récord: flat-rest-only (no puede codificar creaseAngleDeg/pleats/darts), 10-16 floats/constraint vs 1, cotTheta explota en slivers de CDT/DXF. |

## 4. La matemática (transcripción exacta, mapa de índices nuestro)

Mapa: PBD `(p2,p3)` = nuestra arista `(a,b)`; PBD `(p0,p1)` = nuestras alas `(c,d)`.

```
e = p_b − p_a;  elen = |e|;              skip si elen < 1e-6
n1 = (p_a−p_c) × (p_b−p_c);  n1 /= |n1|²   // squared-norm division: baka 1/(2·área)
n2 = (p_b−p_d) × (p_a−p_d);  n2 /= |n2|²   //   en los gradientes (modos de Bridson)
                                            skip si |n1|² < 1e-12 o |n2|² < 1e-12  ← GUARD NUESTRO (upstream NO lo tiene)
d_c = elen · n1
d_d = elen · n2
d_a = ((p_c−p_b)·e)/elen · n1 + ((p_d−p_b)·e)/elen · n2
d_b = ((p_a−p_c)·e)/elen · n1 + ((p_a−p_d)·e)/elen · n2    // convención de signos del upstream, verificar en port
n1̂ = normalize(n1); n2̂ = normalize(n2)
cosθ = clamp(n1̂·n2̂, −1, 1)
sinθ = ((n1̂×n2̂)·e) / elen                 // signo del ángulo incluido
φ = atan2(sinθ, cosθ)                      // Tissu; NO acos
denom = Σᵢ wᵢ·|dᵢ|² + α/sdt²               // XPBD: α = compliance angular; sin acumulación λ
                                            skip si denom ≤ 0
λ = (φ − φ*) / denom
Δpᵢ = −wᵢ · λ · dᵢ
```

Sin acumulación de λ cross-iteración: matchea el patrón single-iteration-per-substep de los 3 tiers existentes (verificado en solveStretching / solve_bend / makeDistanceConstraintFn).

**Guards load-bearing, no higiene** (A3 + el hecho de que one-sided stretch hace slivers MÁS probables): elen eps, |n|² eps, clamp del cos, denom>0. El NaN-backstop existente de WASM se retiene.

## 5. Convención y extractor — EL FLIP

`computeDihedralAngle` actual (`gpuBuffers.ts:278-312`): normales construidas como e×ac y e×ad → **antiparalelas cuando plano** → flat = π, y el fallback degenerado devuelve `Math.PI` (:308). La formulación del solver (§4) da **flat = φ=0** (normales paralelas, verificado numéricamente a mano). Si el extractor no se reescribe, cada panel arranca con π de error de rest-angle → la prenda se arruga instantáneo.

**Cambio:** reescribir `computeDihedralAngle` para computar φ con LA MISMA fórmula del solver (§4, misma construcción de normales y mismo atan2) — una sola función TS compartida es la verdad del rest-angle Y del runtime. Fallback degenerado → `0` (no π). El extractor ya emite `restAngles` en radianes que hoy el GPU descarta (`tslBuffers.ts:204-247` los tira y reconstruye distancias c-d) y que WASM re-convierte a distancias (`bendRestDistances.ts`, el helper BUG-1): **el dihedral invierte BUG-1** — `bendRestDistances.ts` se BORRA (+ su test), `set_bend` de WASM reinterpreta el array rest como ángulos, y el mismatch dormido del path legacy (`gpuSolver.ts:251` sube restAngles que `constraints.wgsl` trata como distancias) se elimina con el path.

**Folds/pleats exactos:** `φ* = π·(1 − creaseAngleDeg/180)` (creaseAngleDeg: 180=plano → φ*=0; 0=doblado → φ*=π). `foldAssembly`/`applyFoldConstraints` deja de escalar rest-distances (el hack direction-blind de `xpbdSolver.ts:1294`) y escribe φ* directo — mountain/valley exacto vía el signo de sinθ. Tests de fold/pleat se actualizan en el MISMO PR.

## 6. Coloring — stride-4 sobre los 4 ids

`colorConstraints` (`gpuBuffers.ts:467-578`) hardcodea stride-2 en 10 sitios (adyacencia :479-481, grados :494-497, removal :519, coloring :536-537, reorder :557/:567-568). El bucket-queue smallest-degree-last es stride-agnóstico.

**Cambio:** parámetro `stride: number = 2`; todos los accesos `ids[i*stride + k]` con loop k<stride. Default 2 → los otros 3 productores (`gpuSolverClient:496,529`, `gpuSolver:916`, `tslBuffers:235` stretch) quedan intactos.

**PROHIBIDO** reusar los `bendColors` actuales: colorean solo pares (c,d) — dos hinges del mismo color pueden compartir los vértices de arista a,b, y el kernel dihedral escribe los 4 → **reabre la race P4-1**. Colorear sobre los 4 ids. Blowup esperado: ~12 colores en malla regular (vs ~6-8 hoy), ~20+ en slivers — absorbible: los substeps baten en un solo `renderer.compute(array)` y el frame no es dispatch-bound (medido, `gpuBuffers.ts:449-452`).

## 7. Kernels por tier

- **TSL (GPU):** un compute node por color group, mismo shape que `StretchColorGroup`. Buffers por grupo: idsSBA (uint, itemSize 4) + restAngleSBA + complianceSBA + positions + invMass = **5 storage buffers ≤ 8** ✓. Nodos TSL necesarios (`cross/normalize/dot/clamp/atan2`) exportados por three/tsl (verificado en el build instalado). Estimado honesto: **~100-160 líneas** (inflación node-style ×3 medida contra tslFacePoke, no "40").
- **WASM (Rust):** `solve_bend` se convierte en la proyección dihedral, Gauss-Seidel secuencial (sin coloring). ~60-80 líneas, f32, guards A3. `set_bend`: el array rest se reinterpreta como ángulos. Rebuild + **copiar AMBOS artefactos** a `public/wasm/`.
- **CPU (TS):** `solveBending` misma matemática (~60-80 líneas), transcribiendo de Scrawk + compliance XPBD.
- **Lockstep pleno, sin flag A7:** es reemplazo same-semantics del bend en los 3 tiers en el mismo PR (ruling Cassian: un flag dejaría dos representaciones de bend vivas y el fallback por device-loss drapearía distinto). La suite de paridad CPU↔WASM lo pinnea.

## 8. Recalibración de compliance — riesgo #1, con doble barrera

α angular tiene unidades distintas (C en radianes, ∇C ~ 1/m): con malla ~7mm e invMass 1/(3·área), equal-felt-softness necesita α_angular ≈ α_distancia × 2·(1.155/e)² ≈ **×5.4e4**. Banda viva: [1.2e-6, 2e-4] → **≈[6e-2, 10]**, y es **mesh-dependent (~1/e²)**. Shippear con números viejos = bend muerto (el fallo #gummy exacto).

- **Barrera 1 (oráculo):** gate Cusick-lite (B2, 2 anclas chiffon/canvas) — re-sweep de K_bend contra las anclas. (El sweep de 3 parámetros × 5 anclas es Fase 4, NO este PR — deslinde Serrano F4.)
- **Barrera 2 (automática):** `BEND_K` pinneado como campo **configBridge-compartido** (los 3 tiers consumen el mismo número) + **unit test que rechaza** valores de la banda de distancia vieja cuando el bend es angular (un α_bend < 1e-3 con dihedral activo = error de validación). El bend muerto se vuelve unshippeable por assert, no por memoria.
- `toXPBDParams`: re-derivar el mapping bend con forma per-hinge **k_θ ∝ B·elen/Ā** (discrete-shells; B = bending rigidity del fabric, mN·cm ya en la librería) y mover TODOS los clamps a **espacio-alpha** (los actuales hardcodean sdt=1/900 y se rompen en silencio si cambian los substeps).

## 9. One-sided stretch (P1-A)

Parámetro `oneSided` en `makeDistanceConstraintFn` pasado **SOLO en el call-site de stretch** (`tslSolver.ts:843`) — el call-site del bend desaparece con este PR de todos modos. CPU: `if (C <= 0) continue` en solveStretching (~:1244). WASM: mismo gate en `solve_stretch`. **Seams y elásticos intactos** (kernels propios). Interacción con strain-limit cap: ninguna — ya es one-sided en tensión (len > rest×1.02). Semántica combinada: tensión compliant → cap duro +2% → compresión libre → buckling gobernado por el dihedral. Tests que pinneen el gate (compresión NO corregida) por tier. Path legacy `gpuSolver.ts`/`constraints.wgsl`: NO se toca (muerto; el cliente vivo usa createTslSolver).

Nota de secuencia: A puede adelantarse por el track piel (regla de des-serialización del plan) — el experimento de 1 línea ya probó estabilidad. En el camino base aterriza con B para que el gate visual evalúe el sistema completo.

## 10. Gates de salida (runner: Samuel @gpu-local)

1. **Perf:** delta del bend pass ≤ presupuesto P1 (**≤1.2ms** del ledger; estimado 2-4× el pase actual). Escape hatches en orden: cadencia bend cada 2 substeps → fast-acos polinomial (si se adopta, **en los 3 tiers** por lockstep; bonus P8: quita libm-nondeterminism de WGSL).
2. **Física:** María con pliegues visibles en mangas (vs domo), belowHip 0, nan 0, sleeve count ≥ piso anti-colapso.
3. **Calibración:** Cusick-lite DC ordenado chiffon ≪ canvas, ambos en banda ±8 DC.
4. **Determinismo:** gate P4-0 bit-exact verde (el coloring nuevo es la superficie de riesgo).
5. **Paridad:** suite CPU↔WASM verde; tests fold/pleat actualizados verdes; `npx tsc -b && npm run test && npm run lint`.

## 11. Riesgos residuales

(1) Colapso de triángulos bajo compresión libre (techo conocido de one-sided) — mitigación diferida: buckling-ratio floor SOLO si el wavelength sale mesh-noisy medido (NO-hacer del plan, con condición de retorno). (2) Color-count blowup en slivers — medir; smallest-degree-last lo acota a degeneracy+1. (3) atan2 WGSL precision es implementation-defined — misma clase que el residual P8 aceptado; fast-acos/atan2 polinomial es el fix si muerde. (4) El sleeve-count histórico es sensible a cambios de bend (STEP 1 lo bajó 6500→3900 hasta que el strain-limit lo estabilizó) — vigilarlo en el gate.

## 12. Fuera de scope de este PR

Backport strain-limit WASM/CPU (PR aparte, semana del 13 — Richter), variante WASM del Cusick en CI (post-merge), schema P7 completo (Fase 4), buckling-ratio floor, face-poke (track piel).
