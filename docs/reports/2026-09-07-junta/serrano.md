## A) Resumen diagnóstico

El informe es una protoespecificación: mezcla observaciones, hipótesis causales y compromisos de producto.
El objetivo está claro: que María pueda crear, medir y editar patrones con precisión; los criterios de aceptación no están definidos.
§4.1 determina una eliminación; §4.3 establece una preferencia visual; §4.2 todavía no determina un comportamiento implementable y verificable.
Encuentro **11 hallazgos: 2 BLOCKER, 3 HIGH y 6 MEDIUM**.
§6 no es exhaustivo, y las siete “causas” no constituyen siete causas independientes demostradas.

Fuentes: [informe](D:/Desktop/projects/vina/docs/reports/2026-09-07-reunion-maria.md) y [transcripción](D:/Desktop/projects/vina/docs/reports/2026-09-07-reunion-maria-transcripcion.md). Las referencias siguientes indican sección y tiempo. La lectura puntual de código corresponde al checkout actual; su equivalencia con el build de la reunión **no está verificada**.

## B) Hallazgos

1. **[BLOCKER] [STATE, AMB, UX] El contexto de pieza carece de sujeto operativo y reglas de transición**

   **Evidencia:** Informe §4.2 y §6.1; transcripción [03:05–03:33], [05:55–06:13].

   **Problema:** Se acepta mostrar controles según “lo que quieres lograr”, pero no se define cómo se determina esa intención. **No especificado:** qué gobierna el contexto cuando difieren herramienta activa, pieza seleccionada y segmento señalado; qué ocurre con una edición pendiente al cambiar de contexto; cómo se recuperan controles retirados. §6.1 reconoce parte del vacío, sin resolverlo.

   **Impacto:** Implementar esta decisión exige inventar reglas que determinan qué geometría recibe una modificación y cuándo esta queda confirmada. La aceptación verbal no permite verificar esas reglas.

   **Qué debe decidirse/definirse:** ¿Qué entidad y operación gobiernan cada contexto, y qué ocurre al abandonarlo durante una edición sin confirmar?

2. **[BLOCKER] [AMB, GAP] El control numérico no tiene contrato geométrico**

   **Evidencia:** Informe §2.B y §6.2; transcripción [05:17–05:32], [16:43–17:30], [19:25–19:50].

   **Problema:** Mover un punto 10 mm, extender una línea hasta 500 mm y colocar un punto a 50 mm de otro son operaciones distintas. §6.2 deja pendiente dónde aparece el control, pero también falta determinar qué transformación ejecuta. **No especificado:** referencia del ángulo, punto que permanece fijo, significado de cada distancia y prioridad entre valor escrito, dirección previa, Shift y enganche.

   **Impacto:** Un campo puede aceptar el número solicitado y producir una geometría distinta de la pretendida. No existe un resultado único contra el cual probar la edición numérica.

   **Qué debe decidirse/definirse:** ¿Qué transformación representa cada valor, qué geometría permanece fija y qué entrada prevalece cuando existen restricciones incompatibles?

3. **[HIGH] [STATE, UX, GAP] La frontera entre seleccionar y modificar sigue fuera de las decisiones pendientes**

   **Evidencia:** Informe §2.E, §3.3 y §6; transcripción [11:09–12:04], [23:02–23:24].

   **Problema:** El informe identifica la confusión entre Seleccionar y Editar, pero §6 no exige decidir qué acciones permite cada herramienta. Tampoco determina cómo esa frontera se relaciona con el nuevo contexto. El fallo de convertir en curva incluye un arrastre inesperado, aunque su causa técnica no está demostrada.

   **Impacto:** María puede activar una modificación cuando cree estar seleccionando. El contexto podría conservar esa ambigüedad bajo otra presentación.

   **Qué debe decidirse/definirse:** ¿Qué gestos modifican geometría en cada herramienta y qué estado debe existir para que una conversión o un arrastre actúe sobre el objeto previsto?

4. **[HIGH] [STATE, GAP, OPS] El cierre de piezas abiertas y su automatización quedaron sin contrato**

   **Evidencia:** Informe §3.11; transcripción [14:07–15:02], incluyendo aviso, cierre y recordar el comportamiento en ajustes.

   **Problema:** La reunión trata una política de finalización y una preferencia persistente que §6 omite. Además, “deja cerrar una pieza abierta” mezcla terminar el dibujo con cerrar geométricamente el contorno. **No especificado:** cuándo un trazo pasa a ser pieza, qué operaciones admiten contornos abiertos, qué hace cada respuesta y qué comportamiento se recuerda.

   **Impacto:** Una implementación puede introducir un segmento de cierre no pretendido o tratar como finalizada una geometría que otras operaciones no admiten. Recordar la respuesta extendería ese comportamiento a creaciones posteriores.

   **Qué debe decidirse/definirse:** ¿Qué estado adquiere un trazo abierto al finalizar, qué acciones quedan permitidas y cuál es el alcance y la reversibilidad de la preferencia recordada?

5. **[HIGH] [AMB, CONTRA] Se declara correcta la cota sin establecer qué está midiendo**

   **Evidencia:** §2.A afirma que la cota “muestra el número correcto”; §3.4 describe cotas de caja envolvente cuando María busca lados; [24:11–24:24] registra referentes incomprensibles.

   **Problema:** Un número puede ser correcto para la caja envolvente y equivocado para la tarea. El informe mezcla corrección del cálculo, elección de magnitud y asociación visual. **No especificado:** el objeto y la magnitud que representa cada cota afectada. #1104 sí concreta longitud de arco para medir un borde, pero eso no resuelve todas las cotas del informe.

   **Impacto:** Cambiar posición, tamaño o color puede conservar una medida semánticamente incorrecta y hacerla parecer más fiable.

   **Qué debe decidirse/definirse:** ¿Qué entidad y magnitud representa cada cota, y cómo se distingue de las otras medidas posibles de esa geometría?

6. **[MEDIUM] [ASSUMP, SCOPE] La selección de internas se convierte indebidamente en una decisión de almacenamiento**

   **Evidencia:** §6.4 contrapone un trazo con N segmentos y N líneas independientes, atribuyendo lo segundo a María; transcripción [23:32–24:05].

   **Problema:** María cuestiona la agrupación por sesión de creación y contempla seleccionar todas o solo la línea señalada. Eso establece un problema de interacción; no demuestra que espere N entidades almacenadas independientes. **No especificado:** la unidad de selección y su relación con la unidad de edición y la entidad persistida.

   **Impacto:** Se puede justificar una modificación del modelo de datos a partir de una expectativa de selección que todavía admite interpretaciones distintas.

   **Qué debe decidirse/definirse:** ¿Qué constituye una unidad seleccionable y editable para María, y qué requisito de la reunión exige cambiar la entidad almacenada?

7. **[MEDIUM] [GAP, UX] El rectángulo tiene una conducta prohibida, pero no una conducta posterior definida**

   **Evidencia:** Informe §4.1; transcripción [01:49–02:20].

   **Problema:** Está acordado retirar la repetición de la última medida. **No especificado:** qué hace después un clic aislado ni qué secuencia inicia y confirma el siguiente rectángulo. La queja de [02:00] también alcanza crear automáticamente una medida cualquiera.

   **Impacto:** Se puede cumplir literalmente “no repetir” y mantener la creación inesperada que motivó el rechazo.

   **Qué debe decidirse/definirse:** ¿Qué debe ocurrir con un clic aislado y qué acción confirma las dimensiones de cada nuevo rectángulo?

8. **[MEDIUM] [ASSUMP, GAP, UX] La preferencia por la cota negra se eleva a un alcance funcional no acordado**

   **Evidencia:** Informe §4.3: “Implica retirar una de las dos”; transcripción [07:25–07:47], [21:22–21:32], [22:01–22:31].

   **Problema:** La preferencia por compacidad, posición y agrupación está respaldada. El alcance exacto de retirar la otra presentación es una inferencia del informe. **No especificado:** qué superficies abarca ni qué información y capacidad de edición debe conservar. La transcripción también registra que la letra “casi ni se lee” [07:31].

   **Impacto:** Una unificación visual puede perder funciones o reproducir problemas de legibilidad del referente elegido.

   **Qué debe decidirse/definirse:** ¿Qué propiedades concretas se aceptaron de la cota negra y qué comportamiento debe conservarse al retirar la otra presentación?

9. **[MEDIUM] [ASSUMP, AMB] Las siete causas mezclan mecanismos, síntomas y categorías solapadas**

   **Evidencia:** Informe §0, §2.A–G; la propia línea de tiempo clasifica [18:18] como “causa C/D”.

   **Problema:** El agrupamiento temático no demuestra independencia causal:

   - **A** reúne imposibilidad de seleccionar, imposibilidad de editar, posición y referente de la medida. Son fallos distintos agrupados por superficie.
   - **A/B** comparten falta de control numérico; distinguir antes y después de crear es relevante, pero no demuestra dos causas técnicas.
   - **C/D** comparten tamaño y densidad. C contribuye al síntoma de saturación descrito en D.
   - **G** produce, según el propio relato, parte de la saturación de D y de las cotas irrelevantes de A.
   - **E** podría explicar parte de la inaccesibilidad descrita en A; esa dependencia no está comprobada.
   - **F** describe una diferencia de experiencia cuya explicación requiere distinguir mecanismos; véase el hallazgo 10.

   Tampoco está demostrado que todo derive de una sola causa.

   **Impacto:** Contar siete causas puede duplicar trabajo; tratarlas como un único problema puede ocultar fallos independientes.

   **Qué debe decidirse/definirse:** ¿Cuáles son mecanismos comprobados, cuáles son síntomas y qué evidencia sostiene cada dependencia?

10. **[MEDIUM] [ASSUMP, GAP] “Medir no engancha” no distingue precisión del enganche y confirmación perceptible**

    **Evidencia:** Informe §2.F; transcripción [08:45–09:17], [15:10–15:40]. El código actual contiene [snapToOutline](D:/Desktop/projects/vina/src/components/PatternEditor/useMeasureTool.ts:69), utilizado al pulsar y mover el ratón.

    **Problema:** El código ajusta al punto más próximo del contorno. Eso no garantiza enganchar exactamente al vértice pretendido. La transcripción prueba incertidumbre de María y una experiencia mejor en Línea interna; no identifica por sí sola si falla la precisión, la prioridad del vértice o la señal visual. La ausencia general de enganche no está demostrada.

    **Impacto:** Se puede intervenir el mecanismo equivocado y conservar la incertidumbre que importa a la usuaria.

    **Qué debe decidirse/definirse:** ¿Qué objetivo geométrico debe capturarse y qué evidencia permite confirmar que el punto elegido coincide exactamente con él?

11. **[MEDIUM] [ASSUMP, SCOPE] La conclusión “solo propagación” excede lo demostrado por el precedente**

    **Evidencia:** Informe §0: “una herramienta ya resolvió el problema”; transcripción [16:07–17:30], [18:49–19:19].

    **Problema:** Después de elogiar Línea interna, María describe allí mismo carencias de control angular, longitud y edición posterior. El precedente acredita componentes útiles de la experiencia, no una solución completa transferible. Mostrar la orientación de una línea tampoco demuestra medir ángulos entre dos bordes o tres puntos, como pide #1104.

    **Impacto:** El trabajo puede declararse completo tras trasladar una presentación, mientras permanecen sin resolver operaciones centrales. La afirmación también introduce una estimación implícita de sencillez sin evidencia.

    **Qué debe decidirse/definirse:** ¿Qué capacidades concretas ya están resueltas y cuáles siguen siendo requisitos pendientes en cada herramienta?

**Verificación de #1104:** La correspondencia indicada en §5 para **F y §3.6 sí está verificada**. El [issue #1104](https://github.com/sssamuelll/vina/issues/1104) pide enganche con aviso, distancia al punto cercano, longitud de borde con un clic, mediciones conservadas hasta borrarlas y medición angular. Su cuerpo respalda el título. No cubre por ello toda la edición numérica ni el contexto de pieza. Está **abierto**; “sin arrancar” queda **no verificado**: el estado abierto, sin asignados ni comentarios, no demuestra ausencia de trabajo.

## C) Preguntas que el documento evita

- **H1:** ¿Qué sucede con una edición pendiente cuando cambia el contexto y quién determina el objeto sobre el cual actúa?
- **H2:** ¿Qué transformación geométrica exacta debe producir cada entrada numérica y qué restricciones prevalecen?
- **H3:** ¿Qué diferencia observable impide confundir selección con modificación?
- **H4:** ¿Cuándo puede un contorno abierto considerarse una pieza terminada y qué se autoriza al recordar una respuesta?
- **H5:** ¿Qué está midiendo cada cota y cómo se verifica que corresponde a la tarea de María?

## D) Riesgos por categoría

| Categoría | Riesgo | Hallazgos |
|---|---|---|
| Técnica | Modificar el objeto equivocado o ejecutar una transformación distinta de la solicitada. | H1, H2, H3 |
| Técnica | Finalizar geometría incompatible con operaciones posteriores o presentar magnitudes equivocadas para la tarea. | H4, H5 |
| Producto | Conservar creación inesperada, ambigüedad de selección o pérdida de funciones tras cambiar la presentación. | H3, H6, H7, H8 |
| Producto | Mostrar una experiencia aparentemente precisa que no permite confirmar el punto ni completar la operación requerida. | H5, H10, H11 |
| Ejecución/Operaciones | Duplicar trabajo, modificar innecesariamente el modelo de datos o subestimar el alcance. | H6, H9, H11 |
| Ejecución/Operaciones | Repetir automáticamente una política de cierre cuyo alcance y reversibilidad no están definidos. | H4 |

## E) Items que requieren aclaración inmediata

1. **H1 — BLOCKER:** Sujeto, autoridad y transiciones del contexto, incluido el destino de una edición pendiente.
2. **H2 — BLOCKER:** Semántica geométrica de las entradas numéricas, invariantes y precedencia de restricciones.