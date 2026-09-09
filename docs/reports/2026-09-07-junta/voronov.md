Vina presenta un solo espacio de trabajo, pero distintas partes del sistema deciden por separado qué significa actuar sobre él. La sesión expone los desacuerdos entre esas decisiones.

1. **Seleccionar y Editar revelan una frontera de autoridad sin resolver.**

   Seleccionar establece sobre qué objeto estás actuando. Editar determina una transformación de ese objeto. Son dimensiones que pueden componerse. Presentarlas como herramientas alternativas exige una diferencia estable: qué habilita cada una, sobre qué entidades y bajo qué condiciones.

   María encuentra que Seleccionar también permite editar. El código consultado confirma que desde `select` se pueden arrastrar extremos de internas y entrar en edición de nodos. La capacidad de modificar depende de condiciones adicionales al modo anunciado. [Código de interacción](/D:/Desktop/projects/vina/src/components/PatternEditor/useEditorInteractions.ts:847).

   El problema estructural es que **el modo visible no constituye un contrato suficiente sobre la acción**. María necesita descubrir qué combinación de herramienta, objeto y estado previo gobierna cada gesto. El sistema le transfiere la tarea de reconciliar sus propias reglas.

   Las dos rondas requieren una precisión: prueban persistencia, no dos correcciones fallidas. El informe registra esta queja **sin issue propio**. Eso señala también una frontera de responsabilidad: cada herramienta puede tener trabajo asignado mientras la relación entre herramientas queda sin dueño. La pregunta aparece en [30-08, 12:48](/D:/Desktop/projects/vina/docs/reports/2026-08-30-feedback-maria-video-transcripcion.md:125) y vuelve en [07-09, 23:19](/D:/Desktop/projects/vina/docs/reports/2026-09-07-reunion-maria-transcripcion.md:548).

   Bajo una operación que atraviese selección y modificación, María no podrá deducir del modo qué va a ocurrir. Tendrá que probarlo sobre la geometría. Esa incertidumbre procede del contrato de interacción.

2. **«Propagación» describe la distribución del síntoma; como diagnóstico completo, contiene un error de categoría.**

   El informe trata el enganche como una capacidad que pertenece a Línea interna y debe viajar hacia otras herramientas. Pero adquirir un extremo establece **a qué entidad geométrica se refiere la acción**. Esa referencia participa tanto en dibujar como en medir.

   El código permite precisar el desacuerdo: Medir sí tiene enganche, mediante proyección al contorno. Línea interna utiliza una resolución que prioriza vértices y extremos antes del contorno. «Estar sobre el borde» y «haber adquirido este vértice» son afirmaciones distintas. [Medir](/D:/Desktop/projects/vina/src/components/PatternEditor/useMeasureTool.ts:65), [resolución de referencias](/D:/Desktop/projects/vina/src/components/PatternEditor/snapIndex.ts:111).

   El error de categoría consiste en atribuir a una herramienta particular la autoridad sobre una referencia que otras operaciones necesitan reconocer. Compartir código, por sí solo, tampoco demostraría que comparten significado.

   La frase de María expresa una exigencia de continuidad: si el sistema puede reconocer inequívocamente un extremo al dibujar, espera poder referirse a ese mismo extremo al medir. Su solución verbal es «copiar»; su demanda es **conservar el referente al cambiar de operación**.

   El punto de presión aparece al encadenar ambas herramientas: una construcción puede partir del vértice mientras la medición adquiere una posición próxima sobre el borde. Cada algoritmo puede funcionar conforme a sus reglas y, aun así, la secuencia dejar de verificar lo que María construyó. La corrección local no garantiza la composición.

3. **El «contexto de pieza» está gobernado por una restricción de información: la pieza no determina la intención.**

   Una misma pieza seleccionada admite medir, transformar, modificar un borde o construir una interna. Su identidad permite reconocer el objeto; no permite concluir cuál de esas acciones quieres realizar.

   La promesa de mostrar controles relacionados con «eso exactamente que quieres lograr» exige distinguir el sujeto, la operación, su fase y las referencias ya fijadas. También exige resolver qué ocurre cuando varias operaciones reclaman los mismos controles o gestos. El informe reconoce que esas transiciones y concurrencias quedaron sin decidir. [Compromiso y cuestiones pendientes](/D:/Desktop/projects/vina/docs/reports/2026-09-07-reunion-maria.md:146).

   **La ley universal es esta: ningún sistema puede distinguir con certeza intenciones que producen el mismo estado observable.** Si dos intenciones requieren controles diferentes y el sistema recibe la misma evidencia para ambas, carece de información para elegir correctamente en todos los casos.

   El clic derecho que María describe aporta una señal explícita de solicitud de opciones durante una operación. Mostrar esas opciones alrededor de la pieza cambia su ubicación; la información necesaria para decidir cuáles corresponden sigue siendo necesaria.

   Hay reglas parciales previas: la spec del 30-08 ya establece prioridad entre trazo vivo, creación reciente y selección. Esa prioridad resuelve ciertas concurrencias; no equivale a conocer la intención completa. [Regla del sujeto](/D:/Desktop/projects/vina/docs/superpowers/specs/2026-08-30-cotas-vivas-design.md:70).

   El punto de presión será una transición ambigua: María termina una medida y pretende usarla para construir, mientras el sistema interpreta que terminó de trabajar con ella. Si oculta el control, excluye una intención válida; si conserva todos los controles posibles, pierde la contextualidad prometida. La interfaz solo puede ser tan precisa como la distinción entre estados que la sostiene.

4. **Las dos gramáticas de cota producen una semántica gobernada por la procedencia de cada componente.**

   María observa que una información cambia de lenguaje al pasar entre estados. Esa variación la obliga a determinar si cambió el objeto medido, la posibilidad de editarlo o solamente la superficie que lo presenta. El sistema introduce una distinción y deja que ella averigüe qué significa. [22:01–22:31](/D:/Desktop/projects/vina/docs/reports/2026-09-07-reunion-maria-transcripcion.md:518).

   Hay un dato que precisa el diagnóstico: **sí existía una decisión de unificación**. La spec del 30-08 ordena reemplazar la lectura anterior y declara «un solo lenguaje para “número sobre el papel”». Sin embargo, el código consultado conserva el readout de Línea interna junto con la capa de cotas. [Decisión explícita](/D:/Desktop/projects/vina/docs/superpowers/specs/2026-08-30-cotas-vivas-design.md:277), [readout conservado](/D:/Desktop/projects/vina/src/components/PatternEditor/renderers/overlays/PolyPenToolOverlay.tsx:141).

   Por tanto, la coexistencia observada evidencia una sustitución incompleta. La intención arquitectónica y la composición efectiva del producto divergen.

   Esa clase de coexistencia se reproduce cuando una capacidad nueva puede considerarse entregada por existir localmente, aunque la capacidad anterior conserve autoridad sobre el mismo significado. La incorporación queda materializada; la sustitución permanece declarativa.

   Bajo cada ampliación que repita esa relación, aparece otra variante capaz de justificarse por separado. El lienzo acumula lenguajes porque nadie necesita haber decidido el conjunto para que el conjunto exista.

María está comprobando una propiedad más profunda que cinco herramientas: **si lo que aprende sobre un punto, una línea o una medida sigue siendo cierto en su siguiente acción**. La unidad arquitectónica que esta sesión pone a prueba es esa continuidad. Vina la promete al ofrecer un único lienzo; cada herramienta participa en cumplirla.