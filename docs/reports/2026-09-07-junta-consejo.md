# Junta sobre la reunión del 2026-09-07 — acta y resultado

**Convocados:** Dr. Adrian V. Serrano (análisis clínico de spec), Dr. Aurelius K. Voronov (crítica ontológica), Petra Haft (gramática de interacción), Cassian Stride (triaje de entrega).
**Motor:** los cuatro corridos en `codex exec`, modelo `gpt-6-astra`, `model_reasoning_effort=ultra`, `--sandbox read-only` dentro del repo — pudieron leer el código, no escribirlo. (`gpt-5.6-astra` no existe para la cuenta ChatGPT; el modelo bueno es `gpt-6-astra`.)
**Orden:** ronda 1 en paralelo (Serrano · Voronov · Haft) sobre el informe; ronda 2 (Stride) sobre el informe **ya corregido** más los tres dictámenes.
**Informes íntegros:** [`2026-09-07-junta/`](2026-09-07-junta/) — `serrano.md`, `voronov.md`, `haft.md`, `stride.md`.
**Documento juzgado:** [`2026-09-07-reunion-maria.md`](2026-09-07-reunion-maria.md).

---

## 0. Lo que la junta le quitó al informe

Tres afirmaciones mías cayeron. **Las verifiqué yo en el código antes de aceptarlas**, porque un hallazgo de un delegado es de fiar y su corrección es una hipótesis.

| Yo escribí | La junta | Verificado |
|---|---|---|
| *"Medir no engancha"* (§ 2.F, § 3.6) | Medir **sí** engancha | ✔ `useMeasureTool.ts:69` — `snapToOutline()`, umbral 8 px, al punto más cercano **del contorno**. `snapIndex.ts:105-120` (Línea interna) resuelve `firstNode → vértice → extremo → contorno`. Las dos enganchan **a cosas distintas**: una a la raya, la otra al punto. Le falta *prioridad de vértice*, no enganche. Lo levantaron Voronov y Serrano por separado. |
| *"Las dos cotas conviven: decisión nueva, sin issue"* (§ 2.C, § 4.3, § 5) | Ya estaba decidido y **sin ejecutar** — y manda lo contrario | ✔ `2026-08-30-cotas-vivas-design.md:277` ordena reemplazar `--readout-*-2d` por `--cota-*` en `PolyPenToolOverlay`/`PenToolOverlay`, *"un solo lenguaje para «número sobre el papel»"*. El readout viejo sigue en `PolyPenToolOverlay.tsx:143-144`; `--readout-*-2d` solo se define en `tokens.css:93-94` y solo se consume ahí. **La spec manda la azul; María eligió la negra.** |
| *"El rectángulo deja de repetir la medida: se quita y ya"* (§ 4.1) | Es una enmienda de spec, no un borrado | ✔ `2026-08-30-cotas-vivas-design.md:241`, E2E 2: *"segundo clic → otra de 300×150 (el default se escribió por ser **creación caliente**)"*. El comportamiento que María rechazó **es un criterio de aceptación escrito**. |

La primera es la que más habría costado: arreglar "el enganche" de Medir sin la distinción vértice/contorno interviene el mecanismo equivocado y deja intacta la incertidumbre que le importa a ella.

---

## 1. Voronov — el reencuadre

Su tesis, en una línea: **Vina promete un solo lienzo, y lo que se pone a prueba no son cinco herramientas sino si lo que María aprende sobre un punto sigue siendo cierto en su siguiente acción.**

Cuatro cosas que dijo y que cambian cómo hay que leer las quejas:

1. **`Seleccionar` vs `Editar` no es un problema de nombres.** Seleccionar establece *sobre qué* actúas; Editar, *qué transformación*. Son dimensiones **componibles** que se están presentando como herramientas alternativas. El modo visible no constituye contrato suficiente sobre la acción: el sistema le transfiere a ella la tarea de reconciliar sus propias reglas. Y sobrevivió dos rondas porque *"cada herramienta puede tener trabajo asignado mientras la relación entre herramientas queda sin dueño"*.
2. **"Propagación" describe el síntoma; como diagnóstico es un error de categoría.** Adquirir un extremo no es una capacidad de Línea interna: establece **a qué entidad se refiere la acción**, y esa referencia la necesitan tanto dibujar como medir. Compartir código no demostraría que comparten significado. Lo que María exige no es copiar: es **conservar el referente al cambiar de operación**.
3. **El "contexto de pieza" choca con un límite de información, no de ingeniería.** *"Ningún sistema puede distinguir con certeza intenciones que producen el mismo estado observable."* Una pieza seleccionada admite medir, transformar, editar un borde o construir una interna; su identidad reconoce el objeto, no concluye la intención. El clic derecho que María pide aporta **una señal explícita** — moverlo alrededor de la pieza cambia dónde se muestra, no de dónde sale la información para elegir qué mostrar.
4. **La coexistencia de dos cotas tiene un mecanismo reproducible:** se da cuando una capacidad nueva se considera entregada por existir localmente, aunque la anterior conserve autoridad sobre el mismo significado. *"La incorporación queda materializada; la sustitución permanece declarativa."* El lienzo acumula lenguajes porque nadie necesita haber decidido el conjunto para que el conjunto exista.

---

## 2. Serrano — 11 hallazgos: 2 BLOCKER, 3 HIGH, 6 MEDIUM

**Los dos BLOCKER** (ambos de especificación, no de seguridad):

- **H1 · El contexto de pieza no tiene sujeto ni reglas de transición.** No está definido qué gobierna el contexto cuando difieren herramienta activa, pieza seleccionada y segmento señalado; ni qué pasa con una edición pendiente al cambiar de contexto; ni cómo se recupera un control retirado. *Implementarlo exige inventar las reglas que deciden qué geometría recibe una modificación.*
- **H2 · El control numérico no tiene contrato geométrico.** Mover un punto 10 mm, alargar una línea hasta 500 mm y poner un punto a 50 mm de otro son **tres operaciones distintas**. Falta: referencia del ángulo, qué punto queda fijo, qué significa cada distancia y qué gana entre valor escrito, dirección previa, Shift y enganche. *Un campo puede aceptar el número pedido y producir otra geometría.*

**Los tres HIGH:** la frontera seleccionar/modificar quedó fuera de mis "pendientes" (§6) · el cierre de piezas abiertas y su preferencia recordada no tienen contrato, y "cerrar el dibujo" y "cerrar el contorno" se están mezclando · **declaro correcta la cota sin decir qué mide** — un número puede ser correcto para la caja y equivocado para la tarea.

**Dos MEDIUM que me corrigen a mí directamente:**

- *"Las siete causas mezclan mecanismos, síntomas y categorías solapadas."* C alimenta el síntoma de D; G produce parte de D y parte de A; E podría explicar parte de A. Tiene razón: **conté siete y no demostré que sean siete independientes.** Mi propia tabla clasifica [18:18] como "causa C/D" y eso ya delataba el solapamiento.
- *"«Solo propagación» excede lo demostrado."* María elogia Línea interna y **acto seguido, ahí mismo**, le pide control angular, longitud y edición posterior [16:07-19:19]. El precedente acredita componentes, no una solución transferible entera.

**Verificación de #1104:** Serrano leyó el issue. La correspondencia que afirmé **está verificada** — el cuerpo pide enganche con aviso, distancia al punto cercano, longitud de borde con un clic, mediciones conservadas y medición angular. Pero mi *"sin arrancar"* queda **no verificado**: abierto y sin asignados no demuestra que nadie lo haya tocado.

---

## 3. Haft — la gramática, y el nudo que deshizo

El encargo tenía una contradicción aparente: **María pide clic derecho** (hábito de CLO3D, lo citó cuatro veces) y **Samuel vetó el menú contextual** en la reunión. Haft la deshace sin darle la razón a ninguno de los dos:

> **El clic derecho enfoca la cota que ya acompaña a la operación.** No abre lista, ni diálogo, ni una segunda superficie flotante.

Gesto principal: **orientar → Tab → escribir distancia → Enter.** Acceso de María: **orientar → derecho → escribir distancia → Enter.** El precio, dicho en voz alta: *"conservando el derecho, María aprende 0 botones nuevos para pedir precisión y 1 ubicación nueva para escribir"*.

Y no es maquinaria nueva: **Pluma e Internas ya congelan el tramo con Tab** y el editor ya enfoca su cota (`usePenTool.ts:284`, `usePolyPenTool.ts:278` — cotas vivas § 5.4 / #1129, ya implementado). Es una extensión.

Lo demás que entregó:

- **Máquina de estados de 12 contextos** con entrada, qué muestra y salida por Esc, más la regla de que **un Esc consume un solo nivel** y que **el hover nunca cambia de contexto** (demora: *nunca*).
- **Tabla de competencias** para cuando dos contextos aplican a la vez (campo numérico > selección; el sujeto se fija en la pulsación; punto gana a segmento dentro de 8 px; hover solo anticipa…).
- **El ángulo es opcional de verdad:** si ya hay dirección del ratón, se conserva con su precisión interna y solo se enfoca distancia; escribir `500` y Enter basta. Prioridad: **valor explícito → ángulo explícito → Shift → enganche → ratón libre**. Y *"un imán cercano a 499,8 mm no corrige una entrada de 500 mm"*.
- **Granularidad de internas:** la unidad seleccionable es **el tramo entre dos nodos**; el gesto que creó varios no forma grupo. Tres líneas y cuatro puntos aunque se dibujaran de una vez. Sin decidir aquí la serialización — hoy la selección solo guarda `pieceId + lineId` (`editorSlice.ts:118`) y por eso es demasiado gruesa.
- **Auditoría de colisiones** contra los atajos reales (`shortcuts/defaults.ts`, `wheelIntents.ts`, el doble clic de Q, el derecho actual) — incluyendo que **Supr debe priorizar texto → trazo activo → subelemento → pieza**, que es justamente el #1115 abierto.
- **Chequeo de convención** con fuente citada en Illustrator, Figma, CLO3D (la guía oficial, p. 41: el derecho durante el movimiento abre Precision Move), Rhino y Seamly2D.
- **El Corte:** no rediseña la paleta, no decide la migración de `InternalLine`, no unifica los hit-tests del CAD entero, y **no da por resueltos** el parpadeo, el overscroll ni la conversión a curva.

Su criterio de aceptación con María, tres acciones observables: *mover un punto 10 mm sin calcular lados; orientar una interna y darle 500 mm sin escribir ángulo; seleccionar BC sin que aparezcan las cotas de AB y CD.*

**Verifiqué sus 14 rutas de código: las 14 existen.** Comprobé dos líneas al azar y son exactas (`DRAG_THRESHOLD_PX = 4`; el tramo congelado de #1129).

---

## 4. Stride — el contrapeso

> **Núcleo enviable:** *"María crea rectángulos de tamaños elegidos y mide entre vértices inequívocos con lecturas legibles, sin parpadeo ni desplazamientos involuntarios de la interfaz, y con las operaciones defectuosas contenidas."*

**Fecha propuesta: viernes 11 de septiembre, 18:00. Presupuesto: 20 horas** con pruebas y margen.

Su corte a los BLOCKER de Serrano: son válidos **para implementar lo que describen**, y no son dependencia de quitar el parpadeo. *"Exigir la implementación completa de Haft antes de quitar el parpadeo es la dependencia que hay que cortar."* Así que H1 y H2 se aplazan enteros — **no entran controles numéricos nuevos esta semana** — mientras que H4 y H5 se cierran con dos frases cada uno.

**Triaje de los once fallos:**

| Marca | Fallos |
|---|---|
| **HARD BLOCKER** | **#3 convertir en curva** (mientras siga accesible: intentar 2 h y, si no queda comprobado, **deshabilitar la operación en todas sus entradas** — un aviso no contiene una modificación accidental) · **#11 pluma que finaliza abierta** como pieza aparentemente válida |
| **SOFT** | #1 cursor · #2 rectángulo · #4 caja envolvente en Editar · #5 cotas que desaparecen · #9 barra que se desplaza · #10 botón activo sin patrón |
| **POST-SHIP** | #6 medir por clic (necesita diseño; queda en #1104) · #7 punto amarillo (incluir si es local, 15-30 min) · #8 menú de división (**asciende a HARD si además modifica geometría sin confirmar**) |

Y una advertencia honesta que conviene no perder: **cursor y barra todavía no tienen causa demostrada.** *"Llamarlos arreglos de minutos antes de reproducirlos sería venderte una estimación falsa."* Sobre la barra añade un dato: ya existe una barra inferior fija y arrastrable por diseño, así que "overscroll" sigue siendo hipótesis.

**Su plan de 9 pasos** (martes 8 → viernes 11) arranca por lo correcto: **1 h reproduciendo los once casos** antes de tocar nada. Los gates completos (`tsc -b`, `test`, `lint`, `lint:ui`) van en el paso 8, sin omitir ninguno.

---

## 5. Dónde los cuatro coinciden

Tres puntos donde no hubo disenso, y por eso pesan:

1. **Lo de Medir es prioridad de vértice, no una plataforma nueva.** Voronov y Serrano lo levantan por separado; Stride lo dimensiona en 2 h; Haft lo deja fuera de su unificación explícitamente. Verificado en código.
2. **El contexto de pieza no está listo para implementarse.** Serrano lo llama BLOCKER de spec, Voronov demuestra que topa con un límite de información, Haft entrega la máquina de estados que faltaba, Stride lo aplaza entero. Nadie dice "hazlo ya".
3. **Nada de esto bloquea arreglar el parpadeo.** Es el único punto donde Stride pelea, y los otros tres se lo conceden: Haft dice literalmente que su gramática **no** resuelve parpadeo, overscroll ni conversión a curva.

Y una tensión que queda viva, sin resolver por diseño: **Serrano dice que mis siete causas no son siete**, y Haft construyó su propuesta sobre la agrupación de tres de ellas. Ninguno de los dos está equivocado — Haft agrupa por *gesto* y Serrano exige agrupar por *mecanismo demostrado*. Se resuelve reproduciendo, que es el paso 1 de Stride.

---

## 6. Lo que hay que decidir tú, no ellos

1. **La cota: ¿enmiendas la spec o revisas la elección con María?** La spec del 30-08 manda la azul; ella eligió la negra. Con letra pequeña: la eligió *"más allá de los colores"* [07:37], por posición y compacidad, y de esa misma negra dijo *"la letra casi ni se lee"* [07:31]. Copiarla tal cual arrastra un defecto que ella ya nombró.
2. **El rectángulo: ¿qué hace un clic aislado a partir de ahora?** La reunión decidió qué **deja** de hacer, no qué hace. Y hay un E2E escrito que exige lo contrario.
3. **La fecha.** Stride propone el viernes 11 con 20 h. Es una propuesta, no un compromiso: si la reproducción del martes revela que el parpadeo o la conversión a curva son profundos, el corte cambia.
4. **Si aceptas el aplazamiento de H1/H2.** Significa que María no recibe control numérico nuevo esta semana — justo lo que pidió seis veces en cuatro herramientas. Stride lo aplaza porque sin contrato geométrico *"un campo puede aceptar el número pedido y producir otra geometría"*. Es defendible, y es tuya la decisión.
