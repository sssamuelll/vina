# Acta del Consejo — Pivote workflow-first (2026-07-03, noche)

**Convocado por:** Samuel, tras 22 capturas del flujo CLO3D con la camisa de María y el temor explícito de overfitting ("mientras hacemos que el patrón de María se vea bien, no arreglamos lo fundamental").

**Pregunta:** ¿reasignar el grueso del esfuerzo del motor al flujo de trabajo (arrangement points interactivos + sew UX), redefiniendo el hito del 24-jul como "María vestida VÍA el flujo"?

**Brief:** temor verbatim + evidencia visual (fotos CLO3D) + estado del motor post-merge `48ed1e4c` + evaluación previa del agente + tensión ontológica agente-vs-instrumento.

## VEREDICTO: RATIFICADO CON CAMBIOS — unánime (5/5)

Los cinco lentes ratifican la dirección y corrigen la ejecución. El ruling sintetizado:

### 1. El pivote real es el CONTRATO DE COLOCACIÓN, no las pantallas (Richter + Voronov, convergencia independiente)
La colocación es una ENTRADA del solver y hoy no tiene representación: existe como heurística horneada (`SLEEVE_CAP_MARGIN`, wrap per-región), como override legacy world-space (el tool `setArrangement3D` del agente — NO grading-safe) y como rama frame-delta sin escritores. **Tres dialectos. La cardinalidad de respuestas a "¿dónde va esta pieza?" debe ser exactamente uno.** El artefacto primero: mapa de colocación first-class (puntos con ID/nombre anatómico, asignaciones pieza→punto, deltas frame-relative) con TRES escritores del mismo esquema — el humano (click), el agente (tool call `placePiece(pieceId, anchorId, delta)`) y las heurísticas actuales degradadas a PROPONENTE que escribe en el artefacto visible. Así se resuelve la tensión agent-first: instrumento-manual-primero no traiciona al agente — es su precondición ("un agente solo puede operar lo que tiene superficie operable"; no puede clickear una constante horneada, sí puede escribir `{punto: torso.ring2.front}`). Ley de Voronov extendida: **calidad(drape) <= min(fit(patrón,avatar), corrección(colocación))**.

### 2. Dos minas en la base que el brief daba por sana (Halberg — hallazgos de código)
- **El drag "que ya existe" está silenciosamente ROTO en main:** post-envelope-wrap, el solver siembra vía `wrapPlacedMesh(frame, wrapParams, flip)` y `placement.position` (donde aterriza el override del drag) NUNCA se compone en los vértices wrapped. El drag del usuario es un no-op con costo de recompute. Fix previo obligatorio: recomponer override→frame (posDelta en la base del frame = exactamente el formato Phase-2).
- **Re-bind con sim corriendo = teardown+re-init completo (segundos), no hot-path.** El corte del 24-jul se restringe a arrangement PRE-SIM (colocar → afinar → Simulate una vez). Reposicionar post-sim como CLO3D = superficie de solver nueva en 3 tiers, post-hito.
- Menores: la rama Phase-2 llama `detectBodyRegion` fresco (bug latente documentado en el propio archivo — cerrar la región ANTES de construir encima); la región debe volverse ASIGNABLE por el click (hoy es derivada — el punto elegido debe DETERMINAR región y frame, no decorarlos); hilos gruesos tipo CLO3D: WebGPURenderer rechaza LineMaterial/fat-lines → ribbons instanciados o hairlines 1px como v1.

### 3. Los anchors deben nacer de la superficie HORNEADA (Richter + Cassian, D1 del plan)
`AnchorPoints.tsx` hoy = billboards decorativos con offsets analíticos y fudge `SO=1.3` — **la tercera definición del cuerpo**, la misma clase de bug que `renderCollisionBake` acaba de matar (+10-15mm). Si el usuario construye su mapa sobre puntos analíticos, el mapa deriva en re-pose/morph/avatar nuevo y el instrumento miente. Los anchor points se proyectan sobre el render mesh vivo (el bake de ayer da exactamente esa superficie) y ganan IDs. Día 1 del plan, antes del primer click.

### 4. El hito del 24-jul se AUMENTA, no se redefine (Cassian) + escalonado con piso bancado (Lyra)
La barra de píxeles del acta anterior (piel cero, tela apoyada, chiffon≠canvas, sombras) SE MANTIENE y se le suma "colocada vía el flujo". Piso bancado: el screenshot del camino actual (auto-flow) ya casi está cobrado; el flujo es el techo. **Collar coverage QUEDA en el corte** (Cassian: es EL píxel más visible de la foto CLO3D; Lyra: se reclasifica — es defecto de colocación, el modo arrangement es su fix estructural).

### 5. Triage del 24-jul (Cassian)
| Ítem | Triage |
|---|---|
| Modo arrangement (click pieza→punto → escribe `ArrangementBinding`) | HARD |
| Re-composición override→frame (el fix del drag no-op) + re-seed verificado | HARD |
| Collar coverage | HARD |
| Anchors sobre superficie horneada + IDs (D1) | HARD (prerequisito) |
| Hilos 3D (1→N líneas muestreadas) | SOFT |
| Gizmo de afinado (drag existente) | SOFT (rotación fina POST) |
| Cartas 2D planas junto al avatar | POST (nuestra vista wrapped comunica MÁS) |
| Sección-de-curva + "cuánto coso" | POST/M2 — pero su SCHEMA (seam = intervalos de curva) se especifica en 1-pager ANTES de construir sew UX v2 (Richter: prerequisito de datos, no descubrimiento de semana 2) |
| Margen 8→2-3mm + pliegues zonales | WAIVED del 24-jul con nombre; margen queda financiado en el mes, gated en flip A4 (Lyra: la cosecha no se regala) |

Plan al viernes 24 (días hábiles): D1-2 anchors reales + picking · D3-5 modo arrangement escribiendo bindings · D6-7 re-seed e2e · D8 hilos · D9-11 collar · D12-13 pasada María-vía-flujo + buffer · freeze mié 23 · screenshot jue 24. Slip máx: 31-jul.

### 6. Asignación 30 días (Lyra): **55% flujo / 25% motor / 20% moat**
- 55% flujo: modo arrangement + sew UX mínimo + contrato de colocación.
- 25% motor: margen fino el día del flip A4 + precompile/mantenimiento. CERO features nuevas.
- 20% moat: fit maps v1 sobre el ease-vector v0 + vena mínima de grading. **Fit-maps no baja a 0** (Voronov: es la única línea que ataca el dolor que el flujo NO resuelve — patrón grande != colocación mala; si el pivote la canibaliza, la próxima acta será "por qué la camisa bien colocada sigue flotando").

### 7. Kill-switch re-armado (Lyra)
El del motor se cumplió en 1 día (parches 30→0) — se archiva con honor. El nuevo: **el 17-jul Samuel coloca y cose la camisa de María end-to-end VÍA EL FLUJO y el drape resultante >= al del auto-flow actual.** Si no: hilos y cartas se recortan a POST, el modo arrangement se reduce a "drag arreglado + escribir binding", y el 24-jul revierte al screenshot del camino actual.

### 8. La advertencia que nadie más iba a dar (Lyra)
**El time-to-first-wow es un asset de distribución.** Hoy: "suelta el DXF → María vestida, cero clicks". CLO3D le vende a patronistas entrenados que ESPERAN colocar a mano; nuestra cuña (freelancers, estudiantes, web, precio) vive de la gratificación inmediata. Las heurísticas overfitteadas NO son deuda a matar: son el default de cero clicks del demo — y las manos futuras del agente. El flujo es la capa de corrección profesional encima. **Se degradan a proponente, no se borran.**

Y el cierre de Lyra, para el récord: cada sí al flujo es un no de 30 días al grading declarado moat. Es la segunda vez este mes. "No hay tercera sin un patronista de carne y hueso pidiéndola."

---

## Dictámenes completos



======================================================================

# Dictamen — Lyra Sage (asignación, kill-switch, costo de oportunidad)

## Veredicto: RATIFICAR-CON-CAMBIOS

El pivote es correcto en dirección y está mal enunciado en magnitud. "Reasignar el grueso del motor al flujo" — sí. "Hito 24-jul = María vestida VÍA el flujo" — no sin red: eso cambia un hito casi cobrado (píxeles, camino actual) por uno nuevo con riesgo de UX fresco, misma fecha. Se ratifica el pivote con hito escalonado y kill-switch re-armado.

## Hallazgos propios (repo + imágenes)

1. **"La mitad del instrumento ya existe" es generoso.** Leí `src/components/Viewport3D/AnchorPoints.tsx`: es display puro — círculos billboard en `useFrame`, cero picking, cero modelo de datos, jamás escribe al solver. Lo que existe es la mitad *barata* (puntos sobre huesos). La mitad cara (click→re-bind→preview→re-seed) está sin construir.
2. **Pero la capa de persistencia del pivote YA está pagada.** `src/utils/cloth/arrangement/arrangementBinding.ts` tiene el branch frame-delta grading-safe shipped y unit-tested, etiquetado literalmente "Phase-2 territory — no deltas are written in Phase 1". El costo de storage del flujo es cero; solo falta la interacción que lo escriba. Eso es asimetría real: inversión chica sobre infraestructura pagada.
3. **Las imágenes confirman dónde vive la calidad marginal.** En CLO3D (leí las 3: cartas 2D junto al avatar, hilos con extents de sección, puntos azules + pieza envuelta pre-sim) el paso de colocación va ANTES de simular; la calidad final es río-abajo de una condición inicial correcta, con física de la misma clase que la nuestra. La hora marginal ya no rinde en kernels; rinde en la condición inicial.
4. **El propio cierre del kill-switch respalda el pivote.** Los parches murieron por `renderCollisionBake` (cuerpo de colisión equivocado), no por más física. Los defectos visibles restantes del motor son problemas de *entrada* — exactamente la clase que el flujo ataca.

## Asignación — próximos 30 días

> **55% flujo / 25% motor (cosecha gated + mantenimiento, cero features nuevas) / 20% moat (fit maps v1 + vena grading). 0% al resto.**

| Bloque | Contenido | Nota económica |
|---|---|---|
| 55% flujo | (a) modo arrangement interactivo que ESCRIBE `ArrangementBinding` (storage pagado), (b) sew UX mínimo: sección de curva + hilos legibles, (c) cartas 2D estado inicial | Curva escalón: cada pieza convierte heurística en instrumento |
| 25% motor | Margen 8→2-3mm el día del flip A4 (1 constante, cosecha del trabajo ya hecho) + precompile/mantenimiento | NO retrasar el margen: ver abajo |
| 20% moat | Fit maps v1 sobre el ease-vector v0 ya shipped (chest +8.0 medido) + vena grading mínima | El 25%+15% anterior se comprime, no se mata |

**Fit maps no baja a 0 porque es la única línea que le habla al dolor que el flujo NO resuelve** (patrón grande ≠ colocación mala). **Grading a vena mínima**: 30 días de pausa casi total es aceptable una vez; dos veces es abandonar el moat declarado.

## Kill-switch: se RE-ARMA, no se archiva

El del motor se cumplió en 1 día — se archiva con honor y su presupuesto no gastado financia el flujo. El nuevo, mismo diseño, criterio medible:

> **A 2 semanas (17-jul): Samuel coloca y cose la camisa de María end-to-end vía el flujo, y el drape resultante ≥ al del auto-flow actual.** Si no: hilos 3D y cartas 2D se recortan a POST, el modo arrangement se reduce a "drag existente + escribir binding", y el hito 24-jul revierte al screenshot del camino actual.

## Costo de oportunidad de retrasar margen-fino/collar

- **Margen fino: NO se retrasa.** Es la condición 2 del screenshot ("tela apoyada, no flotando") y su costo post-flip-A4 es una constante con gate. Retrasarlo por el pivote sería regalar la cosecha del trabajo más caro del mes pasado. Cabe en el 25%.
- **Collar: se RECLASIFICA, no se retrasa.** El 44% clampeado es un defecto de *colocación* (cap 150° de `DEFAULT_WRAP`), no de física. El modo arrangement ES su fix estructural. Pagarlo dos veces — heurística de collar ahora + flujo después — es el único error caro disponible esta semana. Costo real de la reclasificación: si el flujo se desliza, el 24-jul sale con collar imperfecto → por eso el hito escalonado: **screenshot del camino actual como piso bancado, flujo como techo.**

## Lo que el resto del consejo pasa por alto

**La economía de la primera sesión de un usuario frío.** Todos van a discutir si el auto-placement es overfitting (Richter), instrumento vs oráculo (Voronov), el corte mínimo (Cassian). Nadie va a mirar el funnel: hoy el time-to-first-wow es "suelta el DXF → María vestida, cero clicks". CLO3D le vende a patronistas entrenados que *esperan* colocar y coser a mano; tu cuña declarada (freelancers, estudiantes, web-link, precio) vive de la gratificación inmediata. **Degradar las heurísticas a "fallback" con desprecio es degradar la puerta de entrada.** La resolución correcta: las heurísticas overfitteadas a María no son deuda a matar — son el *default de cero clicks* del demo, y el flujo es la capa de corrección profesional encima (y las manos futuras del agente). El overfitting se desarma solo, como dice el brief — pero el asset de distribución no se tira con él.

---

Cada sí al flujo es un no de 30 días al grading que declaraste moat. Ya lo firmaste una vez este mes — esta es la segunda. No hay tercera sin un patronista de carne y hueso pidiéndola.

======================================================================

# Dictamen Richter — sobre el pivote workflow-first

## Veredicto: RATIFICAR-CON-CAMBIOS

El pivote es estructuralmente correcto y está a punto de ejecutarse de forma estructuralmente equivocada. La tesis de fondo es verdadera y yo mismo la firmaría como ley: **la colocación es una ENTRADA del solver, y las entradas deben ser direccionables, no adivinadas.** Es el corolario de la ley de Voronov: calidad(drape) ≤ fit(patrón, avatar) ≤ **colocación(pieza, cuerpo)**. `SLEEVE_CAP_MARGIN=0.10` calibrado ayer contra María no es un parámetro; es una constante que memoriza la respuesta de UN examen. En eso, la evaluación del agente es correcta.

Correcta, pero de nivel síntoma. Copiar las pantallas de CLO3D no es el pivote estructural. El pivote estructural es definir **el contrato de colocación** — y nadie en el brief lo ha nombrado.

## Hallazgos propios

**1. "La mitad del instrumento ya existe" es falso a nivel semántico.** Leí `AnchorPoints.tsx` completo. No hay instrumento apagado: hay píxeles. Los 60+ puntos son un array anónimo indexado por posición, offsets analíticos hardcodeados sobre huesos con un multiplicador de fudge `SO = 1.3`, sin ID, sin nombre anatómico, sin entidad en el sistema de tipos, sin persistencia. Los arrangement points de CLO3D (leí las fotos) son otra cosa: una **parametrización cilíndrica direccionable del cuerpo** — anillos de 8 puntos = coordenadas discretas de un sistema (región × ángulo × altura × offset) al que la pieza se BINDEA. Lo nuestro es decoración billboard. Lo que "ya existe" es el 10% trivial; el 90% es la entidad que no existe.

**2. La trampa está escrita en el propio código, en la rama exacta que el pivote activa.** `arrangementBinding.ts:71`: la rama frame-delta — "Phase-2 territory", jamás ejercitada fuera del unit test — llama `detectBodyRegion(p)` fresco, y el comentario de la línea 66 advierte textualmente que Phase 2 debe fijar la región a la que asignó `placeGarmentPieces` o el delta diverge por estado de toggles. El pivote propone activar esa rama tal cual está.

**3. Peor: la columna vertebral del instrumento seguiría siendo la adivinanza.** Todo el pipeline — frames, flips, wrapParams — deriva de `computeEffectiveRegions`, es decir, de la HEURÍSTICA de detección de región. Si el usuario clickea un punto de cadera para una pieza que la heurística clasificó "sleeve", el wrap la curva igual sobre el cilindro del brazo. Tal como está scoped, el pivote atornilla interacción ENCIMA del stack heurístico en vez de invertir la dependencia: **el punto elegido debe DETERMINAR región y frame, no decorarlos.** Sin esa inversión, no desarmas el overfitting — le pones UI.

**4. Los "hilos" no son una feature de render; son la proyección de un schema que no tienes.** La foto de costura muestra intervalos paramétricos sobre curvas (extents, dirección, endpoints rojos). Eso exige que el seam sea una correspondencia de INTERVALOS de curva. Si el modelo actual es par-de-edges sin extents, el sew UX v2 está bloqueado por un cambio de schema — que el plan ya tiene nombrado (GarmentCode P6, hoy diferido a M2) y el pivote debe adelantar como prerequisito de datos, no descubrir en la semana 2.

## Mi lente

**¿Reactivo o estructural?** El diagnóstico es estructural; el scope es reactivo — 22 fotos convertidas en backlog. La versión madura: un contrato formal de colocación (entidad direccionable, persistible, grading-safe) del cual el modo interactivo es UN cliente, el agente es OTRO cliente, y las heurísticas de hoy se degradan a *política por defecto* del mismo contrato. Si construyes las pantallas sin el contrato, fabricas la tercera autoridad de colocación (heurísticas + overrides legacy + clicks) — otro comité. Hace dos días diagnostiqué el comité de superficies; esto sería el comité de colocaciones. La cardinalidad de respuestas a "¿dónde va esta pieza?" debe ser exactamente uno.

**La deuda de copiar 1:1 en un producto agent-first:** el flujo de CLO3D es manual porque su único actuador es un humano con mouse; sus modos y gizmos son ergonomía de throughput de mouse. Cópialo 1:1 y esa ergonomía se vuelve la columna del producto, con el agente reducido a macro-player de UI ajena. La resolución de la tensión ontológica de Voronov es trivial una vez formulas el contrato: **la operación existe primero como tool del copilot** (`placePiece(pieceId, anchorId, offsetDelta)` vía `registerTool`, infraestructura que ya tienes) **y la UI la consume.** Instrumento manual primero, sí — pero "primero" a nivel de contrato, no de pantalla. El auto-flow de hoy sobrevive como la política que el agente elige cuando el usuario no dicta.

## Lo que el resto del consejo pasa por alto

**El pivote está a punto de reproducir, en la capa de colocación, el bug exacto que el motor acaba de matar.** El hallazgo de la semana fue `renderCollisionBake`: los parches eran DOS definiciones del cuerpo divergiendo +10-15mm. Los anchor points actuales son la tercera definición: offsets analíticos sobre huesos (bbox dependiente de pose, morphs ignorados — la misma clase de error, línea por línea). Si el usuario construye su mapa de colocación sobre puntos analíticos, ese mapa **deriva silenciosamente** en re-pose, morph o cambio de avatar — y el instrumento que vendiste como "el usuario da el mapa" le miente al usuario con precisión de milímetros. Los arrangement points deben derivarse de la MISMA superficie canónica que el bake acaba de establecer (puntos horneados del render mesh vivo), o el comité de cuerpos renace donde nadie lo está mirando. Nadie más va a decirte esto porque todos están mirando las fotos.

Ratifica la reasignación. Exige el contrato antes que las pantallas, tools antes que gizmos, el schema de seams como prerequisito, y los anchors sobre la superficie horneada. Los píxeles del 24-jul salen igual — pero de un sistema, no de una imitación.

Ustedes vieron el flujo de CLO3D. Yo vi el sistema de coordenadas que lo sostiene por debajo.

This is the part you never saw.

======================================================================

# Dictamen ontológico — Dr. A. K. Voronov

## 1. Veredicto: RATIFICAR CON UN CAMBIO ESTRUCTURAL

El pivote es correcto y es la continuación exacta de mi dictamen del 02-jul — pero solo si se entiende qué se está construyendo. No es "workflow". Es **la formalización de una entrada que hoy no tiene representación**. Si se construye como UI, se ratifica un error de categoría con mejores píxeles.

## 2. Hallazgos propios (repo + imágenes)

1. **`AnchorPoints.tsx`**: 60+ puntos bone-attached, paramétricos vía `deriveDimensions` — grading-safe *por construcción* (se re-derivan con las medidas). Pero son **anónimos**: un array indexado por posición, sin IDs, sin params de wrap. Son píxeles, no referentes. La distancia entre "visual" e "instrumento" no es interacción — es *identidad*.
2. **`arrangementBinding.ts`, confesión de Fase 1** (línea 65): *"no ArrangementBinding deltas are written in Phase 1; only the unit test exercises it"*. El formato de intención grading-safe **ya existe con cero escritores**. El pivote no crea el artefacto; le da su primer escritor.
3. **`simulationTools.ts` (`setArrangement3D`, líneas 541-565)**: la mano del agente YA existe — y habla solo el dialecto legacy world-space `[x,y,z]` que el propio `arrangementBinding.ts` documenta como *"NOT grading-safe"*. Hoy hay **tres dialectos de colocación**: heurística-implícita (sin representación), world-pos legacy (agente), frame-delta (nadie).
4. **Imágenes**: los puntos azules de CLO3D (`...47 (2).jpeg`) son anillos sobre torso y brazos — topológicamente lo mismo que `computeBoneAnchors` ya genera. Y los hilos de costura (`...46 (2).jpeg`) muestran algo que el brief subestima: los extremos rojos marcan **secciones-de-curva** — la costura de CLO3D es un *intervalo sobre una curva*, no una relación curva↔curva. Ese es un upgrade ontológico del modelo de seams, no de su render.

## 3. La tensión agente-vs-instrumento: está mal planteada

La pregunta "¿auto-placement es overfitting a matar o germen del diferenciador agent-first?" presupone que las heurísticas de hoy son *una versión* del gesto del agente. No lo son. Son **decisiones sin dirección postal**: computan pose directamente dentro del solver, sin pasar por ningún artefacto que las represente. No se pueden inspeccionar, corregir, ni delegar — solo recalibrar sus constantes contra la siguiente María.

La ley de orquestación que gobierna cualquier sistema que prometa "el agente hace lo que el usuario hace a mano": **un agente solo puede operar lo que tiene superficie operable**. El agente no puede clickear un `SLEEVE_CAP_MARGIN=10cm` horneado. Sí puede escribir `{punto: "torso.ring2.front", pieza: front-panel}` — si ese punto tiene nombre.

Resolución: **el instrumento primero no es traicionar agent-first; es su precondición.** El orden correcto no es UI-primero ni agente-primero: es *artefacto-de-intención primero*. Un mapa de colocación como estado first-class — puntos con identidad, asignaciones pieza→punto, deltas frame-relative — con **tres escritores del mismo esquema**: el humano (click), el agente (tool call), y las heurísticas actuales *degradadas a proponente* que escribe en el mismo artefacto visible y editable. Así el auto-flow y el flujo manual dejan de ser dos caminos: son dos manos sobre el mismo instrumento. Eso es lo que CLO3D no puede copiar — su arrangement mode solo acepta dedos humanos.

¿Qué se pierde copiando el flujo 1:1? Nada ontológicamente — **si** el artefacto es machine-writable desde el día uno. Si copias la UI sin el artefacto, copiaste el gesto y perdiste la gramática.

## 4. Categoría del producto: sí, cambia — y a favor

Colocación adivinada = **oráculo**: el sistema apuesta, el usuario juzga el resultado, y cada fallo indicta al sistema entero ("el motor está roto"). Colocación declarada = **instrumento**: el usuario enuncia intención, el sistema la resuelve, y cada fallo es *direccionable* ("el punto está mal → muevo el punto"). Los fallos de un oráculo son misteriosos; los de un instrumento son accionables. Un profesional no le confía su trabajo a un oráculo por bueno que sea — le confía a un instrumento que responde a sus manos. El pivote no baja la ambición: cambia a quién pertenecen los errores.

## 5. La ley sobrevive, extendida

**calidad(drape) ≤ min( fit(patrón, avatar), corrección(colocación) ).** El pivote eleva la segunda cota — formaliza la mitad espacial de la flecha 2D→3D que declaré "sin especificar". No toca la primera. Una camisa demasiado grande, perfectamente colocada, sigue colgando — y las fotos de CLO3D se ven impecables porque *ambas* cotas están satisfechas: patrón que corresponde Y colocación declarada. Copiar solo la mitad de colocación importa la mitad de la semántica. El 25% de fit-maps no puede ser la fuente del presupuesto de este pivote; si lo canibaliza, la próxima acta será sobre "por qué la camisa bien colocada sigue flotando".

## 6. Lo que el consejo pasa por alto

**El split de dialectos ya existe y el pivote lo va a hornear.** Si el modo interactivo shippea escribiendo frame-deltas (grading-safe) mientras `setArrangement3D` del copiloto sigue escribiendo world-space legacy, el resultado es un almacén de intención donde **la intención del humano sobrevive al grading y la del agente no** — el "diferenciador agent-first" convertido en ciudadano de segunda dentro del artefacto que debía empoderarlo, silenciosamente, hasta la primera talla graduada. Ratificar el esquema único de intención — con las tools del agente como escritores de primera clase — es la primera tarea del pivote, antes del primer píxel de UI.

La colocación era la variable libre que nadie había declarado. Declararla no es copiar a CLO3D — es terminar de especificar tu propio sistema.

======================================================================

# Dictamen Cassian — corte shippeable del pivote workflow (24-jul)

## 1. Veredicto: RATIFICAR-CON-CAMBIOS

El pivote es correcto pero está mal nombrado: no es un pivote, es un **cierre de cableado**. Leí el repo: la tubería ya existe de punta a punta y nadie conectó el último metro. Dos cambios al texto de la propuesta: (a) el hito del 24-jul no se *redefine*, se *aumenta* — la barra de píxeles del acta (piel cero, grosor, pliegues, sombras) se mantiene y se le suma "colocada vía el flujo"; si redefinimos a "vía el flujo" a secas, perdemos la vara medible que ya teníamos. (b) "Motor a mantenimiento" es demasiado grueso: el collar coverage (44% clampeado) ES un ítem de píxeles — el collar es lo más visible de la foto final de CLO3D — y se queda en el corte. Margen 2-3mm y pliegues zonales se difieren con waiver explícito, no por goteo.

## 2. Hallazgos propios (leí código e imágenes)

- **`resolveArrangement` es la fuente única de verdad para la vista arrange Y el solver** (comentario explícito en `src/utils/cloth/arrangement/arrangementBinding.ts:44-51`). Consecuencia enorme para el costo: escribir un override = el preview y la sim se actualizan gratis. No hay "re-bind en caliente" que construir como sistema — es escribir al store.
- **El branch `ArrangementBinding` (frame-delta, grading-safe) ya está escrito y testeado** — `arrangementBinding.ts:64-91` — con un comentario que dice literalmente "this branch is Phase-2 territory... only the unit test exercises it". El pivote es escribirle su primer productor.
- **`Sew3DTool` + `SeamRenderer3D` ya existen**: costura edge-a-edge con máquina de estados, y una línea por seam en arrange. La imagen `...46 (2).jpeg` de CLO3D muestra N hilos muestreados a lo largo de la sección — nuestro delta es 1 línea → N líneas muestreando ambos edges. Un día, no un subsistema.
- **`AnchorPoints.tsx` son meshes reales** (CircleGeometry, no sprites de shader): el raycast de picking es gratis. PERO — ver §4.
- **Sew sección-de-curva ya estaba clasificado**: es P6/M2 en el plan vivo (§6). El pivote no lo adelanta; María cose whole-edge hoy y el gate drape 4/4 lo prueba. La imagen de CLO3D confirma que el valor de sección es *precisión*, no *posibilidad* — la camisa de María no lo necesita para verse bien.

## 3. El corte shippeable + triage

**Núcleo shippeable en una frase:** modo arrangement clickeable (click pieza → click anchor → escribe `ArrangementBinding` → re-seed), hilos N-líneas en seams existentes, drag existente como gizmo, collar coverage. Nada más.

| Ítem | Triage | Razón |
|---|---|---|
| Modo arrangement (click pieza→punto → binding) | **HARD** | Sin esto no hay pivote. Consumidor del branch ya escrito. |
| Re-bind (override → solver) | **HARD** | Ya cableado vía `arrangementOverrides`; falta ampliar el tipo del store de `V3` a `ArrangementOverride` y verificar `skeletonReady` en el camino real. |
| Hilos 3D (1→N líneas) | **SOFT** | Legibilidad. 1 día. Cabe; si algo se cae del plan, se shipea con la línea única. |
| Gizmo de afinado | **SOFT** | `DraggablePiece` ya es el 80%. Rotación fina = POST. |
| Cartas 2D flat junto al avatar | **POST** | Cosmético. Nuestra vista arrange ya muestra las piezas envueltas pre-sim — comunica MÁS que las cartas planas. |
| Sección-de-curva + "cuánto coso" | **POST** | Cambio de schema de `Seam`. Ya vive en P6/M2. No se adelanta. |
| Collar coverage (motor) | **HARD** | Píxel visible del hito. 2-3 días con camino claro. |
| Margen 2-3mm + pliegues zonales | **WAIVED al 24-jul** | Diferidos con nombre, gated en flip A4 post-hito. |

**Plan al viernes 24** (1 founder + agentes; días hábiles): D1-2 anchors precisos + picking · D3-5 modo arrangement escribiendo bindings, preview gratis · D6-7 re-seed verificado e2e · D8 hilos N-líneas · D9-11 collar coverage · D12-13 pasada e2e María vía flujo + buffer · mié 23 freeze · **jue 24-jul screenshot**. Slip máximo declarado se mantiene: 31-jul.

## 4. Lo que el consejo está pasando por alto

**Los anchor points de hoy son decorativos, y sus posiciones son heurísticas también.** `AnchorPoints.tsx` computa los anillos con `SO = 1.3` (multiplicador de superficie a ojo) y radios de brazo/pierna hardcodeados (`armR = 0.04 * 1.3`). Si mañana los hacemos clickeables tal cual, el usuario clickea un punto bonito que coloca la pieza 30% fuera de la superficie y el "instrumento" se ve roto en su primer uso — peor primera impresión que la heurística que reemplaza. El pivote no elimina la calibración: la **muda** de código de placement a definiciones de anchors. La diferencia es que esa calibración es one-time, garment-agnostic y corregible por el usuario — el tipo correcto de deuda. Presupuesto: 1 día (D1) para amarrar los anchors a la superficie real (el `renderCollisionBake` de ayer nos dio exactamente el mesh vivo para proyectarlos) ANTES de cablear el click. Nadie más del consejo va a mirar ese archivo línea por línea.

## Permission slip

> Autorizado a shipear el 24-jul: María vestida vía arrangement points clickeables + hilos + collar, con margen 8mm waived, sección-de-curva en M2 donde estaba, y cartas 2D fuera — heurísticas actuales degradadas a fallback, no borradas. Si rechazas algo de esta lista, dilo por nombre; el default no puede ser "más pulido".

Lo que no shipeas no te enseña nada. El viernes es un feature.

======================================================================

# Dictamen Halberg — Factibilidad runtime del flujo interactivo

## 1. Veredicto

**RATIFICAR CON CAMBIOS.** El flujo es ejecutable en el runtime actual **solo si el corte del 24-jul se restringe a arrangement pre-sim** (colocar → afinar → Simulate una vez). El re-bind con sim corriendo NO es un hot-path hoy: es teardown+re-init completo del solver. Y hay una fractura silenciosa en la base que el brief da por sana (ver §4).

## 2. Hallazgos propios (leí el repo y 2 imágenes del flujo CLO3D)

**a) Wrap-preview al click: barato, ya existe, cero re-init.** `wrapPlacedMesh` es transformación pura O(V) (trig por vértice) sobre la malla YA mesheada — no hay re-mesh ni toque al solver. El memo `staticGeometry` de `GarmentSimulation.tsx` (líneas ~282-352) ya hace exactamente esto y re-corre con `arrangementOverrides` en deps. Costo real: re-wrap de todas las piezas + `computeVertexNormals` + realloc de `BufferGeometry` por cambio. A cadencia de click: milisegundos, viable. A cadencia de drag continuo: hay que reusar buffers (hoy aloca `Float32Array` + geometría nuevas cada vez) o mantener la cadencia actual de mouse-up.

**b) Re-bind en caliente = re-init completo, no update.** El effect de init en `useSimulationLifecycle.ts` tiene `placedMeshes` en deps (línea 769, comentario "load-bearing"). Cualquier cambio de override con `simulationState==='running'` → cleanup → re-init: request de device, compile WGSL (precompile aún pendiente per brief), `bakeCollisionFromRender` + BVH (ruta con timeout de 5s), `simReadyRef=false`, y el settle-tether re-captura a 150 frames. Segundos de congelamiento por tweak. CLO3D permite reposicionar post-sim; copiarlo 1:1 exige `setPiecePositions` en caliente en 3 tiers — superficie de solver nueva que el brief NO presupuesta. Para el 24-jul: sim arranca una vez, punto.

**c) Concurrencia con el init-gating 2a.** El gate `simReadyRef` protege frames-sin-cuerpo, correcto. Pero la cancelación del init es un boolean de closure — el bake de colisión no es abortable, solo se ignora su resultado. Tweaks rápidos en modo running = inits solapados haciendo trabajo GPU/CPU muerto. Esto es exactamente la clase de cascada #315 que los refs de las líneas 320-337 existen para evitar; un modo interactivo que muta las deps del init la reabre. Además `bakeCollisionFromRender` lee la escena de render: hay que verificar que sea idempotente con gizmos/overlays de arrange en escena.

**d) Hilos 3D: viables, con UNA trampa de renderer.** `SeamRenderer3D.tsx` hoy dibuja 1 línea punteada por seam (midpoint-a-midpoint) — CLO3D dibuja abanicos de K hilos por seam (foto `...46 (2).jpeg`: hilos verdes/azules por sección). K×N segmentos en un `LineSegments` mergeado = un draw call, costo despreciable vs los 3ms de headroom. La trampa: WebGPURenderer **rechaza** `LineMaterial`/fat-lines (extiende `ShaderMaterial`) — está documentado en el header de `DraggablePiece.tsx` (PivotControls fue reemplazado por exactamente esto). Hilos gruesos legibles como CLO3D = ribbons de quads instanciados o NodeMaterial, no drei `Line2`. `LineBasicMaterial` da hairlines de 1px; puede bastar, pero presupuesta el ribbon como plan B.

**e) AnchorPoints: la mitad "que ya existe" es la mitad barata.** Los 60+ puntos son billboards sin raycast, sin ids, sin semántica. Hacerlos clickeables es trivial. Lo caro es el mapeo click→(región, frame, wrapParams): hoy la región es **derivada** de la geometría de la pieza (`detectBodyRegion`/`computeEffectiveRegions`), no asignable por el usuario. Plumbing de región-asignada toca `resolveArrangement`, `resolveArrangementWithFrames`, `autoSewThunk`, ambos memos de GarmentSimulation y la sonda M4 — el área exacta donde ya ocurrieron DOS split-brains documentados (Important-1/2 en `arrangementBinding.ts`). Es trabajo TS-side, sin kernels — factible, pero ese plumbing es el centro de costo real, no la UI de puntos.

## 3. Lo específico de mi lente: modos de fallo

- La rama `ArrangementBinding` (frame-delta, grading-safe) es **código muerto en producción**: "only the unit test exercises it" (comentario línea 66), y carga un bug latente documentado — `detectBodyRegion` fresco en línea 71 puede divergir del toggle L/R de `placeGarmentPieces`. El pivote activa exactamente esa rama. Ciérrenle la región ANTES de construir encima.
- El drag hoy escribe el override LEGACY `[x,y,z]` world-space, translate-only, no grading-safe. El gizmo de rotación no existe en el path de datos.
- Vista arrange muestra cartas PLANAS (`PieceMesh`); el solver siembra WRAPPED. Lo que el usuario arrastra no es lo que simula — split-brain visible al usuario.

## 4. Lo que el resto del consejo pasa por alto

**El drag "que ya existe" está silenciosamente ROTO en main.** El brief afirma (línea 39) "DraggablePiece + arrangementOverrides van al solver". Post-envelope-wrap eso es falso: el loop del solver llama `wrapPlacedMesh(pm.vertices, frame, wrapParams, flip)` — `placement.position` (donde aterriza el override del drag) **no se compone nunca** en los vértices wrapped. El frame se deriva de región+dims, sin overrides. El drag del usuario dispara el re-memo (dep presente) y produce **la misma pose** — no-op silencioso con costo de recompute. El comentario M2 ("drags MUST reach the solver") es de la era pre-wrap y ya no describe el runtime. Cualquier plan de arrangement points construido sobre el mecanismo de overrides hereda un no-op. Primero se recompone override→frame (posDelta en base del frame, que ES el formato Phase-2), después se construye el modo interactivo.

**Veredicto de factibilidad de ejecución:** el flujo pre-sim corre en el runtime de hoy con presupuesto sobrado; el re-bind live durante sim no corre y no correrá para el 24-jul sin superficie de solver nueva. Recorten el hito a lo primero.

El runtime no negocia con las fotos de CLO3D. Ejecuten sobre lo que corre, no sobre lo que el brief recuerda.
