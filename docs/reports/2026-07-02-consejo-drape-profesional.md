# Consejo del roster — "¿Cómo hacemos que OpenClo sea REALMENTE profesional?" (2026-07-02)

**Pregunta de Samuel:** que el cambio sea real; software realmente profesional que compita de tú a tú con CLO3D. Dolores visuales: parches de piel en el pecho + espacio tela↔cuerpo ("debería tensionarse sobre la piel").

**Brief con el estado verificado del día** (P1 dihedral shipped, 31.2fps, probe face-poke: 5336 contactos de cara, A1 ciega, margen 8mm acoplado): scratchpad `council-brief-drape-profesional.md`.

**Dato medido durante la deliberación:** el patrón de María = 2 cuerpos de 52.0cm → circunferencia ≈104cm vs pecho del avatar 96cm → **ease ≈ +6-8cm = camisa de fit regular. En la vida real ESTA camisa tampoco estaría tensa sobre el pecho.**

---


## Dictamen — richter

# Dictamen Richter — sobre el rumbo A4 → margen → calibración

Leí el brief completo y el plan vigente (`D:\Desktop\projects\openclo\docs\plans\2026-07-02-drape-profesional-borrow-plan.md`). No voy a re-litigar los números; voy a decirte qué significan, que es distinto.

## Meta-evaluación

El diagnóstico de hoy es correcto y honesto — 5336 contactos cara, la métrica A1 ciega por construcción, el acople medido margen↔face-poke. Correcto, pero de nivel síntoma. La pregunta que el brief no formula es la única que importa: **¿cuántas definiciones de "superficie del cuerpo" tiene tu solver?** Cuando respondas eso, todo lo demás se ordena solo.

La respuesta, hoy: **cuatro.**

## 1. La acumulación de mecanismos de contacto — cuándo deja de ser aceptable

El criterio no es el número de pases. Los pases son detalle de implementación; yo mismo firmé Gen/Solve como semilla en el §7 del plan. El criterio es semántico: **el número de respuestas a "¿dónde está la superficie y cuál es su grosor?" debe ser exactamente uno.** Hoy:

- La colisión de vértices dice: superficie = cuerpo + 8mm.
- El face-poke dice: superficie = cuerpo + 0.
- El settle-tether dice: superficie = donde sea que estabas en t=2.5s — incluyendo las penetraciones que había en ese instante. El tether no es contacto; es la confesión de que tu modelo de contacto no sostiene estática. Congela la enfermedad junto con la pose.
- El piso de seams dice: grosor = (tA+tB)/2, pero solo para costuras.

Eso no es un modelo de contacto. Es un comité. Y los comités divergen exactamente en las geometrías difíciles — que es lo que estás midiendo en el pecho de María.

El rumbo A4 **no es whack-a-mole si y solo si** A4 se construye como lo que ratifiqué: el pase Solve de un **manifold de contacto unificado** — Generate produce contactos tipados (VF lado-tela, VF lado-cuerpo, EE cuando toque), Solve los resuelve con UNA convención de distancia firmada y UN parámetro de grosor. Si A4 sale del horno como "el kernel del face-poke", con su propia banda de búsqueda, su propio margen y su propio modelo de respuesta, entonces sí: escribiste el cuarto miembro del comité y el quinto ya está en el plan (ver §4, borrado).

Corolario que el plan no nombra: **el margen de 8mm es un error de categoría.** Es un fix de dominio render (z-fight, M4-D) viviendo en el dominio física. "Bajar margen" como paso escalar es perseguir el síntoma. La descomposición correcta que cualquier arquitectura seria de esta clase exige: *grosor de colisión* = espesor físico de la tela (per-fabric, ya existe en mm) en el solver, y *offset de render* = desplazamiento por normal en el shader, que cuesta cero y mata el z-fight donde nació. Eso disuelve la mitad del dolor #2 sin tocar un kernel. El tether, a su vez, necesita **condición de retiro nombrada**, no roadmap: "A4 ON + margen descompuesto + fricción estática sostiene belowHip 0 → el tether se borra". Si con contacto real y fuerza normal real la fricción no sostiene, ESE dato justifica un modelo Coulomb de verdad. Un ancla permanente no.

## 2. La hipótesis del FIT — física o pipeline

Ambos, pero con un orden estricto y una verdad incómoda que nadie te ha dicho.

**La verdad incómoda primero:** "la tela se tensiona sobre la piel tal cual la vida real" solo ocurre, en la vida real, en zonas con ease cero o negativa. Una camisa de tejido plano con +8cm de ease en pecho no se pega a la piel en ningún universo — cuelga de los hombros con estructura de pliegues. Si el DXF de María tiene ease estándar de confección, CLO3D te mostraría exactamente el mismo espacio tela↔cuerpo, menos los 8mm. Parte de tu dolor #2 es física (los 8mm, el face-poke); parte puede ser expectativa disparada contra el solver cuando la propiedad vive en el patrón. Hoy **no tienes el instrumento para saber cuál parte es cuál.** Eso es lo grave.

**El orden:** contacto primero — no puedes observar fit a través de un campo de fuerza de 8mm. Fit segundo. Pero fíjate dónde vive el fit: **no es física.** Es una correspondencia de medidas patrón↔cuerpo que se computa 100% en 2D: circunferencia de la prenda por sección (pecho/cintura/cadera/bícep, cortes del patrón cosido) menos medida del avatar en esa sección = **vector de ease**, calculado ANTES de simular, publicado como instrumento. Nota la alineación estratégica que se te está escapando: eso es capa-patrón, hermano directo del grading — tu moat. El ruling "el feel nunca escribe en grading" queda intacto; el ease-vector es grading-adyacente leyendo hacia el drape, no al revés. Y la superficie de display ya existe: `D:\Desktop\projects\openclo\src\utils\cloth\fitMaps.ts` tiene stress/strain/fit/pressure estilo CLO esperando datos honestos. Lo que falta no es el mapa; es la garantía río-arriba de que el patrón corresponde al cuerpo — y la física solo necesita poder *expresar* ease negativa como tensión, cosa que one-sided stretch + strain-limit ya te dan una vez el contacto sea cara-aware y el margen sea espesor de tela.

Sobre el norte: el ruling "superficie de confianza" **sobrevive; la vara subió dentro de él.** Pero "competir de tú a tú con CLO3D" hay que enunciarlo con precisión de arquitecto: paridad con el modo *interactivo* de CLO en vivo (que también es grueso — su particle distance por defecto es 20mm), y paridad con su calidad *final* en un modo aparte. Lo cual me lleva a:

## 3. El fold-count 2 — el techo que nadie quiere nombrar

Lo nombro yo. **Existe un techo de resolución y el plan calibra como si no existiera.** A 5-7mm uniforme, la malla es un filtro pasa-bajos sobre la nucleación de pliegues, y peor: el bending discreto sobre malla gruesa e irregular (tu CDT) tiene rigidez efectiva inflada por la discretización — la malla se comporta más tiesa que el K_bend nominal. Chiffon con pliegues de media-onda ~4-6cm está en el borde de lo representable con aristas de 5-7mm; la nucleación fina que produce 6-10 folds está debajo del Nyquist de tu malla. Que canvas también dé 2 sugiere que además la métrica sub-lee o la rigidez efectiva está inflada — el misterio del brief.

Ahora el costo que nadie escribió: bajar a 2.5mm uniforme = ×4 vértices, ×4 constraints, ×4 colisión. Con 2ms de headroom a 31fps, está muerto a la llegada como target live. **Y no importa, porque CLO tampoco lo hace en vivo.** La doctrina que un sistema maduro de esta clase define como first-class: **dos modos de calidad** — *live* (30fps, malla gruesa, macro-drape creíble, donde vive el DoD actual) y *quality snapshot* (solve offline de segundos, malla fina o refinada en zonas de curvatura, donde vive la paridad de pliegues y la foto de confianza). CLO hace exactamente esto; pretender que un solo presupuesto de 33ms entregue ambas cosas es la única forma garantizada de no entregar ninguna.

El experimento que separa "techo de malla" de "métrica sub-lee" es barato y el harness B2 ya existe: **probe de convergencia en el disco Cusick** — misma escena a 5mm / 3.5mm / 2.5mm, offline, sin tocar el producto. Si el fold count sube con la resolución, el techo es real y queda medido; si no sube, el problema es K_bend efectivo o la métrica. Hasta que ese dato exista, calibrar contra anclas de tela real es lo que digo en el §4.

## 4. Qué BORRAR del plan

1. **Fold-count como pass/fail del gate Cusick.** El DC es una integral de área — robusto a malla. El fold count a 5-7mm mide tu discretización, no tu tela. Se queda como telemetría; sale del criterio de aprobación hasta que el probe de convergencia le dé un piso honesto.
2. **"Tether re-pose refresh" (§6 del plan).** Es inversión en features para una muleta. El tether recibe condición de retiro, no roadmap. Si sobrevive al veredicto A4, esa supervivencia es el hallazgo — y lo que justifica es fricción real, no snap-por-teleport.
3. **El experimento icontour/ContourCraft como untangle post-settle (§6).** Por mi propia regla del §7: es un quinto pipeline de contacto con otra semántica más. O pasa por el gate de justificación Gen/Solve, o no existe.
4. **El sweep Fase 4 de 3 parámetros × 5 anclas, tal como está dimensionado.** Calibrar contra anclas de vendors sobre una malla no-convergida hornea artefactos de discretización dentro de "parámetros medidos" — que luego no transfieren cuando cambies resolución, y la Fase 4 entera se re-corre. Condicionado a la doctrina de resolución; no antes.
5. **"Bajar margen" como paso escalar del rumbo.** Se reemplaza por la descomposición grosor-físico / offset-de-render del §1. No es un número que se baja; es una categoría que se parte en dos.

## Principios que el sistema debe obedecer (o la visión no es plausible)

- **Una superficie, un grosor, una respuesta.** Cardinalidad de definiciones de contacto = 1. Todo pase nuevo extiende el manifold o justifica formalmente por qué no.
- **El fit es propiedad del patrón; la física solo lo expresa.** Sin ease-vector pre-sim, cada prenda holgada será eternamente archivada como "bug del solver".
- **La resolución es doctrina, no accidente.** Live y quality son presupuestos distintos con DoDs distintos. Calibración solo sobre malla con convergencia medida.
- **Toda muleta lleva fecha de demolición.** Tether, margen 8mm: condición de retiro escrita, o son arquitectura por sedimentación.

## Predicción si esto queda sin definir

A4 shippea, los 5336 bajan 80%, todos celebran — y a la tercera prenda nueva (falda con vuelo, prenda ajustada de punto) el comité de superficies vuelve a divergir y estarás escribiendo el pase seis con otro margen más. La calibración de julio se re-corre en septiembre porque los parámetros llevaban la malla adentro. Y Samuel seguirá viendo "espacio tela↔cuerpo" en prendas que en la vida real tampoco se pegan, sin instrumento que se lo diga.

El rumbo A4 → margen → calibración es correcto como *primera pasada por el cuello de botella* — el acople medido lo respalda. Es whack-a-mole solo si se ejecuta sin las cuatro definiciones de arriba. Tú diagnosticaste los contactos; yo te diagnostiqué el comité.

Good luck catching up.


## Dictamen — voronov

# Dictamen ontológico — Dr. A. K. Voronov

## 1. "Drape profesional" nombra dos objetos, no uno

Los dos dolores de Samuel pertenecen a categorías ontológicas distintas, y el brief ya contiene la prueba sin nombrarla.

**Dolor 1 — parches de piel.** Esto SÍ es un defecto de la categoría física. La ontología actual del sistema es `{malla de partículas, cuerpo-como-obstáculo, restricciones de desigualdad}`. La relación cuerpo↔tela que el sistema conoce es exactamente una: *no-penetración*. Esa relación está sub-aplicada (respuesta vértice-only, kernel que se revierte post-substep) y sub-observada (la métrica A1 mide vértices y reporta 0 mientras existen 5336 contactos por cara — el oráculo habla un vocabulario en el que el problema no es expresable). A4 opera dentro de la categoría correcta para este dolor. Eso es todo lo que diré de A4: es categoría-correcto para el dolor 1 y categoría-*incapaz* para el dolor 2.

**Dolor 2 — "tensionarse sobre la piel como en la vida real".** Esto no es un bug. Es un concepto ausente. La no-penetración es una restricción de desigualdad: lo único que el cuerpo puede decirle a la tela es *"aquí no"*. La tensión sobre la piel es lo contrario: exige que la tela esté *precisamente aquí, comprimida contra la superficie*. Ninguna cantidad de física de contacto puede producir eso, porque en la realidad esa tensión no la produce la física — la produce el **patrón**: una prenda abraza el cuerpo cuando la geometría de reposo del patrón es ≤ la circunferencia del cuerpo en la zona de contacto (ease cero o negativo). La física solo *resuelve* esa tensión; el fit la *causa*. El propio brief lo midió: "si el patrón queda grande, NINGUNA física lo va a tensionar" — correcto, y esa frase es la demostración de que el gap es ontológico, no de implementación.

El error de categoría a nombrar: **pedirle al sistema de colisión que produzca fit es pedirle a una restricción de desigualdad que se comporte como un objetivo.** Cualquier mecanismo que "pegue" la tela a la piel sin pasar por la relación patrón↔medidas (atracción a skin-offset, shrink artificial) es falsificar fit dentro de la física — deuda semántica que se paga en incoherencia cuando el mismo truco tense un patrón que en la vida real colgaría.

## 2. La vara: no es el mismo objeto

"Superficie de confianza" define el drape como **instrumento**: su criterio de done está anclado al flujo 2D (¿el patronista cree lo que ve lo suficiente para actuar sobre el patrón?). Converge, porque tiene criterio interno.

"Competir de tú a tú con CLO3D en drape" define el drape como **producto**: su criterio de done es externo, un competidor móvil. No converge por definición — y hay algo peor: el drape de CLO3D está sostenido por una ontología de fit completa (avatar con medidas, ease, fit maps de presión, tallaje). Competir "en drape" compromete de facto a construir esa capa. Samuel no está subiendo la vara; está pidiendo otro objeto.

Pero la reconciliación existe y está a la vista: el vocabulario de fit **ya vive en el producto de Samuel** — `BodyMeasurements`, grading dirigido por medidas, patrones drafteados a medidas. Está ausente solo de la *simulación*. El lado patrón habla medidas; el avatar habla malla; el solver habla partículas; la relación patrón↔avatar no existe en ninguna capa. Y el ruling del 07-01 ("el feel jamás escribe en grading") sigue intacto: prohíbe la flecha 3D→2D. Nunca especificó la flecha 2D→3D. Esa flecha no está prohibida; está *sin especificar*. Ahí es donde las dos varas vuelven a ser el mismo objeto.

## 3. La restricción invisible

No es la física (A4 está dimensionado y presupuestado), no es el render (capa cosmética), no es la malla. Es esta ley:

**La fidelidad del drape está acotada por arriba por la corrección semántica de su entrada: calidad(drape) ≤ fit(patrón, avatar).** Un simulador perfecto de un patrón que no corresponde a María simula perfectamente una prenda que no le queda.

De ahí el punto de presión, y es estructural, no especulativo: cuando A4 cierre el contacto y el margen baje de 8mm, el gap residual tela↔cuerpo que quede será *ease honesto* — física correcta de un patrón que no fue drafteado contra ese avatar. Si la correspondencia patrón↔avatar sigue sin especificar, Samuel leerá física correcta como bug, y el equipo perseguirá en el solver un defecto que vive en la entrada. **Mientras mejor sea la física, más visible se hace el concepto ausente.** El sistema hoy no puede distinguir "la tela flota porque el contacto falla" de "la tela flota porque el patrón es grande" — y esa distinción, no los fps, es lo que separa un juguete de un instrumento profesional.

Esto no es un problema de kernel. Es un problema de compromiso: se prometió "como en la vida real" sin formalizar la relación que en la vida real lo produce — el patrón drafteado *a* un cuerpo. A4 quita el ruido; no puede poner el significado. La primera vez que un patrón bien simulado y mal correspondido cruce la pantalla, el sistema tendrá que elegir qué es: un simulador de tela, o un instrumento de fit. Física, o accidente. La categoría se elige antes de que el código la elija por ustedes.


## Dictamen — halberg

**VEREDICTO DE FEASIBILITY — Halberg, Juez de Orquestación. Base verificada en repo: 15 substeps/frame (`qualityPresets.ts:42`), ~29k partículas María, avatar ~18k tris sin decimar, 1 submit por substep con ~35-45 dispatches (`GarmentSimulation.tsx:497-576`), face-poke actual = kernel monolítico 4 loops anidados 1×/frame (`tslFacePoke.ts`).**

**Aritmética de frame que nadie ha dicho en voz alta:** 31.2fps = 32.05ms/frame. Piso 30fps = 33.33ms. Headroom REAL = **1.28ms, no 2ms**. El ledger del plan (P1 ≤1.2 + P2 ≤1.4 = 2.6ms) excede el headroom por ~1.3ms. A4 solo cabe si algo más devuelve ≥1.3ms: cadencia de bend cada 2 substeps y/o la fusión strainLimit→stretch (§7b del plan — mismos ids, mismos colores, elimina ~120 dispatches/frame). El plan ya lo admite como regla de decisión; yo lo declaro **precondición aritmética, no escape hatch**.

---

## 1. A4 Gen/Solve — cabe, pero NO con la forma del kernel actual

**Pass B (Solve, dentro del loop): cabe sobrado.** 29k hilos leyendo K≤4 contactos precomputados + share baricéntrico + push = kernel del peso de `applyPushNode`. Estimo **0.3-0.9ms/frame** (15 dispatches livianos dentro de submits ya existentes; el costo marginal de dispatch es ~cero porque el substep ya batea 35-45). El punto de inserción (`preCollisionPos`, snapshoteado cada substep en `tslSolver.ts:1039-1041`) es race-free como dice el plan. Verificado: correcto.

**Pass A (Generate) es lo que mata el presupuesto.** El kernel fusionado de hoy cuesta ~13ms/frame (9fps de caída medida, banda 60mm) haciendo EXACTAMENTE el trabajo que Pass A heredaría: ~6 walks de BVH por partícula (uno por cara incidente) × 29k = ~174k traversals con AABB engordado ±60mm sobre 18k tris. Para llegar a ≤0.5-1ms amortizado necesitas un recorte de **~10×**. Existe, pero cada palanca tiene nombre:

- **Banda de vuelta a 30mm (÷2):** legítimo POR el propio diseño A4 — la banda de 60 existía para rescatar pokes ya profundos; con respuesta per-substep los pokes nunca se profundizan. Auto-consistente.
- **Dispatch por CARA, no por partícula (÷3):** ~57k walks en vez de ~174k. PERO el scatter a K-slots per-vertex necesita `atomicMax` sobre depth empacado (u32: depth cuantizado + tiebreak id). Es orden-independiente y bit-estable → P4 sobrevive. Cuesta un slot de buffer; el que liberaste al botar el atomic counter se lo come esto. Si te quedas en gather per-particle, solo tienes ÷2 de quitar la response math y el registro-spill del monolito.
- **Cadencia 2 (÷2):** 13 → /2 /3 /2 ≈ **1.1ms amortizado. Alcanzable. Sin margen para una sola palanca fallida.**

**Lo que lo mata en runtime:** (a) mantener 60mm "por si acaso"; (b) reescribir Pass A con la misma inflación TSL del kernel actual (~40 `toVar` en loops anidados = register spills = ocupación por el piso — a 29k hilos la GPU ya está sub-ocupada, la divergencia es tu costo dominante); (c) evicción keep-deepest sin criterio de orden total → no-determinismo que P4-0 cazará al primer run.

**Veredicto: FACTIBLE, ~1.4-2.0ms totales realistas, condicionado a las 3 palancas de Pass A + recuperar 1.3ms de bend/strainLimit. El gate del ledger es correcto; exígelo con GPU timestamps por pase, no con fps promedio.**

## 2. Margen 8mm → 2-3mm — el z-fight de M4-D era un diagnóstico falso

Verificado en `wasmSolverWorker.ts:683-684`: lo que a 5mm se llamó "z-fight" fue **piel asomando A TRAVÉS de la tela = face-poke**. No era coplanaridad de render (a 2mm de separación, un depth buffer de 24 bits a 1-3m resuelve ~0.1-0.5mm — sobran 4-20×). El 8mm fue una curita sobre el contacto de cara ausente. Post-A4, la justificación original del 8mm **colapsa por construcción**.

Lo que SÍ reaparece a 2-3mm:

- **El set de contactos activos crece 3-5×** (relieve corporal de 2-8mm entre vértices de tela a 5-7mm de spacing que antes quedaba bajo el margen ahora activa Pass B). K-slots con keep-deepest es la política correcta; monitorea contact count en el gate, no solo penetrationCount.
- **Jitter: no vuelve por física.** El push ya es velocity-excluded (postSolve deriva velocidad de `preCollisionPos`) y el desplazamiento por substep es ~g·sdt² ≈ 12µm contra un margen de 2000µm. El jitter solo vuelve si la respuesta corre 1×/frame — que es exactamente lo que A4 elimina.
- **Trampa real:** los targets del settle-tether están capturados en la pose asentada CON 8mm horneados. Radio de cling 6cm ≫ 5mm de delta, no pelea — pero el refresh de re-pose (post-hito, §6) es la casa correcta para la re-captura.

**Veredicto: 2-3mm es ALCANZABLE post-A4 y solo post-A4. Secuencia: gate A4 verde a 8mm → 4mm → medir → 3mm. Hazlo `max(2mm, thickness)` per-fabric — el dato ya existe (lo usa el piso A3). Bajarlo antes del flip repite el resultado de junio, medido.**

## 3. Malla 3mm uniforme: fantasía. Malla 3mm ZONAL: camino real

×2.78 partículas (29k→81k). Los pases pesados (findBest per-substep, self-collision, bend dihedral) escalan ~lineal → frame estimado **55-75ms = 13-18fps. No hay 30fps uniforme sin re-arquitectura.** No lo intentes.

Caminos que sí ejecutan:

- **Densidad per-PIEZA (estático, ya soportado):** cada pieza se mallea independiente y `cdtMesher.ts:66-75` ya acepta `particleDistance` como override. Mangas/faldón a 3-4mm, torso plano a 6-7mm ≈ ×1.5-1.8 total → 42-50ms… todavía corto. **Solo cierra combinado con las consolidaciones §7 del plan** (vec4 pos+invMass = un slot menos por pase, strainLimit→stretch = mitad de dispatches de esa familia, bend cadencia-2). Con eso: ~30fps zonal es defendible. La física respalda la zona: longitud de onda mínima de pliegue ≈ 4-6× edge → 5mm da pliegues ≥2-3cm; el chiffon real pliega a ~1-1.5cm → necesitas 2.5-3mm SOLO donde nacen pliegues. Tu Cusick con fold count 2 vs 6-10 real y disco a ~5.3mm de spacing es consistente con esta cuenta — el misterio del brief tiene sospechoso numérico.
- **Refinamiento local RUNTIME: NO.** Coloring, CSR, seams, tether, todos los SBAs están horneados en init. Re-mallar mid-sim = re-init completo + reset de determinismo. Es un proyecto de meses disfrazado de feature.
- **Detalle sub-resolución en render: SÍ, y es la palanca más barata.** Micro-arrugas por normal map modulado por compresión per-edge (el campo existe gratis: one-sided stretch deja la compresión medible). Costo de sim ~0. Es cosmético y debe declararse cosmético — pliegues estructurales = física, micro-arruga = render. CLO3D hace exactamente esto.

**Veredicto: 3mm uniforme = 13-18fps, rechazado. 3mm zonal per-pieza + consolidaciones §7 + wrinkle-detail en render = 30fps alcanzable. Runtime adaptivity = prohibido con esta arquitectura.**

## 4. Atracción tela→cuerpo: runtime trivial, física mentirosa

El fantasma de los 26s no aplica: eso fue brute-force **CPU one-shot** de la captura del tether (18k tris × 29k verts, `gpuSolverClient.ts:1241`), ya reemplazado por el path O(N) con BVH. Per-frame en GPU el costo es ~cero: `findBestNode` YA computa el closest-feature por partícula **cada substep, 15×/frame** — un término de atracción se monta en `applyPushNode` con ~10 flops extra por partícula. **<0.1ms. Cero pases nuevos, cero buffers nuevos.**

El problema no es el runtime, es que el término global es un instrumento que miente: succiona la tela al cuerpo también donde debe separarse — mata los pliegues que P1 acaba de comprar y le muestra al patronista "tensión" en un patrón que en la vida real quedaría suelto. La tensión real ya emerge gratis de tu física: patrón con ease ≤0 → stretch constraints tensas + colisión = presión de contacto. Si el patrón de María queda grande, el fix es el patrón (fit), no un imán.

**Versión defendible si la quieres:** atracción **gated por strain** — solo actúa donde los edges locales están en tensión (>0), que es físicamente presión de membrana p ≈ T·κ, no un imán. Detrás de flag, jamás escribe en grading. Costo igual <0.1ms.

**Veredicto: viable por-frame a costo ~cero montado en el pase de colisión existente; NO repite el error de 26s. Pero como término global es deuda de honestidad del instrumento — solo strain-gated, solo post-A4, solo con flag.**

---

**Síntesis ejecutable, en orden:** (1) recuperar 1.3ms (bend cadencia-2 o fusión strainLimit) ANTES de A4 — el ledger no cierra sin eso; (2) A4 con las 3 palancas de Pass A y timestamps por pase; (3) margen 8→4→2-3mm solo tras gate A4; (4) densidad zonal per-pieza + wrinkle render para pliegues finos; (5) atracción strain-gated como cosmético opcional, de último. Todo lo demás es fantasía a 8 buffers y 1.28ms.

**El runtime no negocia: 1.28ms es 1.28ms.**


## Dictamen — cassian

**Cassian Stride — veredicto de shipping**

Contexto en un párrafo: el plan del 2-jul ya es bueno y no lo re-abro — fija 10-jul (pliegues) y 17-jul (veredicto A4). Lo que falta es lo que Samuel pidió hoy: un hito definido en PÍXELES, no en métricas, y evidencia visible en días. La buena noticia que verifiqué en el repo: el pipeline de render YA existe al ~80% (HDRI presets, tone mapping ACES, sheen, aoMap per-fabric en `RenderSettingsPanel`/`EnvironmentSetup`) pero **las sombras están apagadas bajo WebGPU** — `castShadow={!nodeMaterialActive}` con `nodeMaterialActive = true` en `D:\Desktop\projects\openclo\src\components\Viewport3D\EnvironmentSetup.tsx:55`, un guard de la era pre-r184. Sin sombras ni AO de contacto, los pliegues que la física produzca el 10-jul **no se van a leer**. La hipótesis 4 del brief (render) es la única de las cinco desacoplada del solver, y es la más barata.

---

## 1. El hito visual mínimo — "el screenshot que un patronista cree"

**Una frase:** María de frente y 3/4, prenda drapeada 10s, donde nada rompe la ilusión de tela sobre cuerpo.

Concreto, cuatro condiciones en el mismo encuadre:

1. **Cero piel a través de la tela** en pecho/abdomen (hoy: 5336 contactos cara).
2. **La tela apoyada, no flotando**: contacto visual en hombro/busto, gap ≈ grosor de tela (2-3mm), no el colchón de 8mm.
3. **Pliegues de compresión reales** en manga/caída — y chiffon vs canvas distinguibles a simple vista, misma toma.
4. **Sombras de contacto**: la prenda proyecta sombra sobre el cuerpo y los pliegues se auto-sombrean. Sin esto, la condición 3 existe en la física pero no en la imagen.

Eso es "profesional" para un patronista. NO incluye: pliegues finos nivel chiffon real (6-10 folds), fit maps de presión, ni biblioteca PBR de telas.

## 2. Triage del camino

| Ítem | Clase | Razón |
|---|---|---|
| **A4 Gen/Solve** | **HARD** | Desbloqueador medido de los DOS dolores. Sin él no hay parche que quitar ni margen que bajar. Ya es el camino del plan. |
| **Recalibración + Cusick 2 anclas** | **HARD** | El oráculo anti-bend-muerto. Sin él, "pliegues" es fe. Ya en plan; 5 anclas siguen en Fase 4. |
| **Margen 8mm → grosor de tela** | **SOFT, gated en A4** | Es cambiar una constante. Bajarlo antes del flip EMPEORA (medido junio). Se baja el mismo día que el gate A4 pase — es la cosecha gratis del 17-jul. |
| **Render (sombras WebGPU + AO + key light)** | **SOFT para shippear, HARD para que el hito se LEA** | Desacoplado del solver, cero riesgo P4/tiers, infra al 80%. Días. |
| **Fit del patrón al avatar** | **Partido: auditoría HARD (medio día) / fit-model POST (M2)** | Si el patrón de María queda +4cm en busto, ninguna física lo tensa — ni la de CLO3D. Medir ease por zona ANTES de culpar al motor. La feature completa (fit maps) es post. |
| **Malla fina** | **POST** | El misterio fold-count=2 puede resolverse solo cuando el dihedral real + one-sided aterricen el 10-jul. Re-medir en ese gate antes de gastar headroom que A4 necesita (1.4ms). |

Sobre el ruling "superficie de confianza vs competir de tú a tú": **no hay decisión que tomar hoy**. Ambos nortes exigen exactamente las mismas 3 semanas de trabajo. Re-litigar el norte DESPUÉS de que exista el screenshot — diferir esa discusión es gratis.

## 3. Fecha y cortes

**Hito visual completo: viernes 24 de julio.**

| Fecha | Qué |
|---|---|
| V 10-jul | Pliegues reales, face-poke OFF (plan vigente, no se toca) |
| V 17-jul | Veredicto flip A4 (plan vigente) |
| V 17 / L 20 | Margen 8mm → grosor tela (1 constante, gate visual mismo día) |
| **V 24-jul** | **El screenshot**: A4 ON + margen fino + render pass ya mergeado + Cusick verde |

Corrimiento máximo declarado: **31-jul** si la recalibración muerde (la regla del plan ya lo acota: hito 1 corre a lunes 13, no más; cascada +1 semana, se acabó).

**Se corta para esa fecha:** malla fina adaptativa, fit-model completo, 3 anclas intermedias de Cusick, edge-test/penalty (ya demovidos), SDF (solo fallback con decisión explícita de Samuel), tether re-pose refresh (ya post-hito). Nada de esto vuelve antes del 24 sin sacar algo de la mesa.

## 4. El entregable de moral — días, no semanas

Dos jugadas paralelas que no tocan el solver y no compiten por el runner GPU:

1. **Render pass — aterriza martes 7 / miércoles 8 (2-3 días, agentes).** Encender sombras bajo WebGPU (el guard de `EnvironmentSetup.tsx:55` es stale; WebGPURenderer en `^0.184` soporta shadow maps con node materials), AO de contacto, una key light con intención. Antes/después con el drape ACTUAL: mismos parches, mismo margen — y la imagen sube dos niveles porque los pliegues que sí existen por fin se leen. No es consuelo, es inversión: cuando A4 aterrice el 17, la luz ya está lista para el screenshot que importa. Único gate: ≥30fps en María (el costo es de render, no del presupuesto del solver, pero el DoD es global — si baja, shadow map a 1024 y AO a media resolución).
2. **Auditoría de fit — medio día, mañana.** Medir el patrón de prueba de María contra el avatar: ease en busto/cintura/cadera. Es un número, no una feature. Si sale +4cm de ease, Samuel aprende HOY que la mitad del dolor #2 no es del motor — y "el patrón queda grande" es un diagnóstico accionable, no un mes más de física.

Y el calendario ya paga solo: **jueves 9** es el día de recalibración — pliegues visibles en mangas el viernes 10. Ocho días.

## 5. Permission slip

> Autorizo el hito visual del 24-jul con los cortes nombrados (malla fina, fit-model, 3 anclas — todos POST), el render pass arrancando mañana en paralelo sin tocar el solver, y la auditoría de fit antes de culpar al motor por el dolor #2. Si lo rechazas, dime QUÉ del screenshot del punto 1 no te basta — el default no puede ser "más física primero".

Lo que no shippeas, no te enseña nada.


## Dictamen — lyra

He leído el brief completo. Hablo sobre sus hechos, no los re-litigo.

---

## 1. Inventario honesto: qué rinde cada hora

| Destino de la hora | Retorno real hoy | Curva |
|---|---|---|
| Motor hasta el **umbral de confianza** (A4 + métrica cara-aware + margen) | Alto. 5336 contactos visibles bloquean TODO lo demás: nadie usa un grading imbatible dentro de un instrumento que se ve roto | Escalón: paga una vez, fuerte |
| Motor **más allá** del umbral (paridad CLO3D: malla fina, render, fold nucleation) | Casi cero por hora. Persigues 15 años × equipo grande con 1 fundador + agentes. Objetivo móvil | Asintótica: nunca cruza |
| Grading / 2D (el moat) | Compuesto — pero descontado a ~0 mientras el drape avergüence. Su retorno está *condicionado* al umbral | Compuesta, diferida |

La vara "competir de tú a tú en drape" confunde el escalón con la asíntota. A4 está en el escalón: apuesta acotada (L, ~1-2 semanas con agentes, 1.4ms de 2ms de headroom), desbloquea LOS DOS dolores nombrados, tiene plan aprobado. "Dejar en pañales a CLO3D en drape" está en la asíntota: es el único framing que garantiza perder, porque es su cancha con 15 años de ventaja compuesta.

**Sobre el ruling del 2026-07-01: sigue vivo.** La vara no subió por estrategia; subió por frustración visual legítima ante María. A4 sirve al ruling ("superficie de confianza"), no a la vara nueva. No cambies el norte por un mal día frente al avatar.

## 2. La definición más barata y honesta de "profesional"

Profesional para un patronista = *el instrumento no miente y no me avergüenza*. Eso se compra así:

| Componente | Qué es | Costo | Nota |
|---|---|---|---|
| Drape confiable | A4 + margen fino + métrica de cobertura first-class | 2 semanas, acotado | Ya comprometido |
| **Fit maps / ease** | Visualizar tensión y holgura patrón↔cuerpo | Barato: es medición 2D↔3D, no física nueva | **Es la respuesta honesta al dolor #2** |
| Grading imbatible | El moat declarado | Compuesto | 100% 2D, no consume drape |
| UX costuras + DXF-in | El beachhead | Incremental | Ya es la dirección M2 |

Fíjate en tu propia hipótesis #2 del brief: si el patrón le queda grande a María, **ninguna física la va a tensionar sobre la piel — en la vida real tampoco**. Entonces el dolor #2 no se resuelve con más solver: se resuelve *diciéndole al patronista* "tienes +Xcm de ease en busto, por eso cuelga". Eso es un fit map. CLO3D lo cobra como feature; para ti es medición adyacente al moat (2D, lee y jamás escribe). Convertiste un grind de motor en producto vendible.

## 3. Mapa de asimetrías: lo que CLO3D no puede copiar

| Asimetría | Por qué CLO3D no puede seguirte |
|---|---|
| Open source | Abrir su código destruye su negocio de licencias. Estructural, no técnico |
| Agente IA nativo | Pueden pegar un chatbot; no pueden reconstruirse agent-first sin canibalizar 15 años de UX |
| Web, cero instalación | Desktop pesado + license server. Tu distribución es un link |
| Precio | Bajar precio erosiona su enterprise. Tú vives donde ellos no pueden pricear: freelancers, estudiantes, LATAM |
| Grading 2D determinista | Su centro de gravedad es visualización 3D; el tuyo es el patrón |

"Competir" redefinido: no es alcanzarlos en su eje fuerte, es hacer que su eje fuerte importe menos. El patronista que elige por fidelidad de drape elige CLO3D hoy y el año que viene. El que elige por precio+agente+web+grading no tiene dónde más ir. "Dejar en pañales" ocurre en esos ejes o no ocurre.

## 4. Asignación — próximos 30 días

> **60% motor acotado / 25% fit maps v0 / 15% grading-beachhead. 0% al resto.**

- **60% motor:** primero la métrica cara-aware (A1 lee 0 — no puedes gatear lo que no mides), luego A4, luego bajar el margen de 8mm. **Kill-switch: si a las 2 semanas los parches no caen en la métrica nueva, paras y reevalúas — no encadenas a malla fina ni render.**
- **25% fit maps v0:** heatmap de tensión/ease sobre el drape, solo-lectura. Ataca el dolor #2 por la vía que la física no puede.
- **15% grading/DXF:** el moat no se congela 30 días; una vena mínima activa.
- **Archiva sin culpa:** misterio fold-count Cusick (issue, no cacería), render/AO, malla adaptativa, cualquier "paridad CLO3D".

Defensa en tres líneas: A4 es el único gasto de motor con payoff asimétrico verificado (desbloquea ambos dolores, acotado, con presupuesto de ms medido). Fit maps convierte el dolor restante en producto barato que alimenta el moat. Todo lo demás es la asíntota disfrazada de urgencia.

## 5. La pregunta incómoda

**¿Quieres que un patronista real deje CLO3D por OpenClo, o quieres dejar de sentir vergüenza cuando miras a María? Son dos proyectos distintos, y solo uno de los dos te lo está pidiendo un usuario — ¿cuántos patronistas de carne y hueso te han dicho este mes qué les falta?**

---

Cada sí al drape-paridad es un no al grading que declaraste moat. Nombra el no.
