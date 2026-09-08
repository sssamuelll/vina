Samuel, propongo entregar a María el **viernes 11 de septiembre de 2026, a las 18:00 de Madrid**, con un presupuesto de **20 horas, incluidas pruebas y margen**. Leí los cinco documentos: los dos BLOCKER de Serrano son vacíos de especificación; ninguno documenta una vulnerabilidad o pérdida de datos. Sí hay riesgos de integridad geométrica que debemos contener. Los tiempos siguientes son límites de trabajo propuestos: revisé código, pero no reproduje los fallos.

**Núcleo enviable:** María crea rectángulos de tamaños elegidos y mide entre vértices inequívocos con lecturas legibles, sin parpadeo ni desplazamientos involuntarios de la interfaz, y con las operaciones defectuosas contenidas.

**Qué hay que decidir antes de tocar código**

Los dos BLOCKER de [Serrano](</C:/Users/simon/AppData/Local/Temp/claude/D--Desktop-projects-vina/eea85265-2ef8-4a19-841d-7458c8b19ba8/scratchpad/junta/out-serrano.md>) son válidos **para implementar las funciones que describen**. No son dependencias del arreglo del cursor.

| Hallazgo | Decisión para esta entrega |
|---|---|
| **H1 — BLOCKER: contexto sin sujeto ni transiciones** | Hay que definir quién recibe la operación y qué ocurre al abandonar una edición pendiente **antes de implementar el contexto nuevo**. Lo aplazo completo. Dos frases pueden fijar una operación concreta; no sustituyen el contrato de todo el editor. |
| **H2 — BLOCKER: entrada numérica sin significado geométrico** | Antes de añadir cada operación hay que fijar origen, extremo inmóvil, magnitud y precedencia de restricciones. Mover un punto, alargar una interna e insertar sobre un borde necesitan contratos distintos. **No entran nuevos controles numéricos este viernes.** |
| **H3 — HIGH: Seleccionar/Editar** | Hay que identificar y contener el cruce que permite arrastrar al convertir en curva. La matriz completa de gestos puede esperar; una conversión que actúa sobre otro objeto, no. |
| **H4 — HIGH: finalizar una Pluma abierta** | Cabe en dos frases: finalizar un contorno abierto conserva el dibujo pendiente y solicita una decisión explícita. Solo confirmar el cierre añade el segmento; continuar conserva el trazo sin convertirlo en pieza terminada. |
| **H5 — HIGH: qué mide cada cota** | Cabe en dos frases: ancho y alto describen la caja y pertenecen al ajuste de tamaño. La medida entre dos puntos describe su distancia recta; una longitud de borde debe corresponder al recorrido de ese borde. |

**La cota requiere una enmienda de una página.** La [spec del 30-08, §9](/D:/Desktop/projects/vina/docs/superpowers/specs/2026-08-30-cotas-vivas-design.md:277) manda sustituir el readout por la familia azul; María eligió después la presentación negra. Propongo enmendarla para adoptar compacidad, asociación con la línea y agrupación de magnitudes, conservando edición, foco y legibilidad. Su queja de que la letra casi no se lee también forma parte de la aceptación. Cambiar únicamente el color no cumple.

**El rectángulo también requiere corregir su contrato.** Dos frases bastan: un clic aislado no crea una pieza de tamaño automático. Cada rectángulo se confirma mediante su propio arrastre y después admite edición numérica. Hay que actualizar la spec y el [E2E que actualmente exige repetir las medidas](/D:/Desktop/projects/vina/docs/superpowers/specs/2026-08-30-cotas-vivas-design.md:241).

**Medir necesita una prioridad, no una plataforma nueva.** Dentro del radio de captura, el vértice debe ganar al contorno. El resalte debe señalar exactamente el punto que usará el clic. El [enganche actual](/D:/Desktop/projects/vina/src/components/PatternEditor/useMeasureTool.ts:69) y el [resolutor existente](/D:/Desktop/projects/vina/src/components/PatternEditor/snapIndex.ts:105) permiten investigar una adaptación local.

**Los once fallos, uno por uno**

La numeración corresponde al [§3 del informe](/D:/Desktop/projects/vina/docs/reports/2026-09-07-reunion-maria.md:135). La severidad determina el riesgo; el costo y la frecuencia determinan qué conviene arreglar primero.

| # | Fallo | Triaje | Tamaño y tratamiento |
|---|---|---|---|
| 1 | Cursor parpadeando | **SOFT** | **Diagnóstico, posiblemente local.** Reservar 45 min para aislarlo; entra por molestia continua. No está demostrado que sea telemetría. |
| 2 | Rectángulo repite medidas | **SOFT** | **Local, candidato de minutos.** La rama que crea sin arrastre está identificada. Corregir también contrato y pruebas. |
| 3 | Convertir en curva arrastra y falla | **HARD BLOCKER mientras siga accesible** | **Diagnóstico de estado y geometría.** Intentar corregir durante 2 h; si no queda comprobado, deshabilitar la operación en todas sus entradas. Un aviso no contiene una modificación accidental. |
| 4 | Editar muestra caja en lugar de lados | **SOFT con contención obligatoria** | **Dos reglas, cambio acotado.** Retirar esa caja de Editar y reservarla para tamaño. Las cotas automáticas de todos los lados quedan después. |
| 5 | Cotas desaparecen tras Medir | **SOFT** | **Diagnóstico de transición.** Reproducir la ida y vuelta y recuperar las cotas del sujeto correspondiente. No convertir esta corrección en persistencia de mediciones. |
| 6 | Clic sobre línea no mide | **POST-SHIP** | **Necesita diseño pequeño:** distinguir clic sobre vértice, sobre borde y segundo punto de una medición pendiente. Sale de este corte; queda pendiente en #1104. |
| 7 | Punto amarillo queda iluminado | **POST-SHIP; incluir si es local** | **Candidato de 15–30 min.** Si es solo resalte residual, limpiarlo. Si representa un objetivo de edición todavía activo, investigar con el fallo 3. |
| 8 | Menú de división aparece inexplicablemente | **POST-SHIP si solo aparece el menú** | **Reproducción primero.** No exige rehacer los menús. Si además modifica geometría sin confirmación, asciende a HARD. |
| 9 | Barra inferior se desplaza | **SOFT** | **Diagnóstico, posiblemente local.** Identificar la barra y el gesto antes de aplicar CSS: hay una barra inferior ya fija y arrastrable por diseño. “Overscroll” sigue siendo una hipótesis. |
| 10 | Línea interna activa sin patrón | **SOFT** | **Local, candidato de minutos.** La creación ya rechaza la ausencia de anfitriona. Desactivar el acceso cuando no exista una pieza utilizable; no exigir selección previa. |
| 11 | Pluma finaliza abierta sin avisar | **HARD para la finalización silenciosa como pieza válida** | **Contrato corto y guarda de finalización.** Verificar qué se guarda y qué recibe simulación. Cierre explícito o continuar; recordar la respuesta queda después. No hay corrupción demostrada. |

Rectángulo y botón tienen cambios locales identificables. **Cursor y barra todavía no tienen causa demostrada.** Llamarlos arreglos de minutos antes de reproducirlos sería venderte una estimación falsa; tampoco hay evidencia de que necesiten rediseño.

**La pila de recortes**

| Marca | Qué sale | Dónde queda |
|---|---|---|
| **DEFER** | Contexto completo, mudanza de acciones del menú y matriz de gestos de Haft | Siguiente entrega de interacción; H1 permanece abierto. |
| **DEFER** | Mover 10 mm, colocar a 50 mm, nuevas entradas durante arrastre y precisión extendida a todas las herramientas | Contratos separados bajo H2. |
| **DEFER** | Selección y edición por segmentos de internas, multiselección y borrado de tramos | Trabajo de interacción posterior. No exige decidir ahora una migración de almacenamiento. |
| **DEFER** | Medir con un clic, mediciones conservadas y ángulos entre elementos | Pendientes explícitos de #1104; esta entrega no lo cierra. |
| **DEFER** | Preferencia recordada de cierre, cotas automáticas por lado y pulido general del dock | Nota de alcance de esta entrega. |
| **DELETE** | Repetición automática rechazada del rectángulo | Eliminar comportamiento y expectativa antigua de las pruebas. |
| **DELETE** | Unificación de todos los hit-tests o migración de `InternalLine` como requisito de este viernes | Eliminar esas dependencias del plan. |
| **DELEGATE** | Comprobar si el resalte da certeza y la cota se lee cómodamente | María, en una sesión propuesta de 25 min; Samuel conserva la responsabilidad técnica. |

De [Haft](</C:/Users/simon/AppData/Local/Temp/claude/D--Desktop-projects-vina/eea85265-2ef8-4a19-841d-7458c8b19ba8/scratchpad/junta/out-haft.md>) conservaría los contratos como material para la siguiente entrega. Exigir su implementación completa antes de quitar el parpadeo es la dependencia que hay que cortar.

**Plan secuencial: 20 horas**

1. **Martes 8 — 1 h:** reproducir los once casos sobre la versión candidata y registrar cuáles persisten. Identificar específicamente cursor, barra y conversión.
2. **Martes — 1 h:** escribir la enmienda de cotas, corregir el contrato del rectángulo y dejar las reglas de finalización y magnitudes. Registrar incluidos, recortes y pendientes en una nota de entrega.
3. **Martes — 3 h:** trabajar cursor, rectángulo, botón, resalte residual y barra. Lo que no se aísle pasa al margen reservado, con evidencia.
4. **Miércoles 9 — 4 h:** corregir o contener conversión a curva y finalización abierta. Verificar sujeto afectado, cancelación, Deshacer y resultado guardado.
5. **Miércoles — 2 h:** prioridad de vértice y señal coincidente en Medir. Comprobar esquinas cercanas, distintos zooms y pieza girada.
6. **Jueves 10 — 3 h:** aplicar la enmienda visual sobre las superficies afectadas, contener las cotas de caja y corregir la desaparición al cambiar de herramienta.
7. **Jueves — 2 h:** margen para fallos reproducidos. Si se consume, recortar propagación visual adicional antes que comprobaciones de geometría o el arreglo del cursor.
8. **Viernes 11 — 3 h:** revisión y gates: `npx tsc -b --noEmit`, `npm run test`, `npm run lint` y `npm run lint:ui`; E2E afectados y recorrido real de creación, medición y cancelación. Actualizar graphify. Ningún gate se omite.
9. **Viernes — 1 h:** sesión propuesta de 25 min con María, registrar el resultado y preparar la entrega. Despliegue con tu aprobación explícita. Si una ruta HARD sigue accesible y sin contener, esa versión no sale.

**Permiso para entregar:** puedes enviar este corte el viernes con las verificaciones aprobadas, aceptando que el nuevo contexto, la precisión numérica extendida y la selección por segmentos siguen pendientes.

Lo que entregas te enseña. El borrador, no.