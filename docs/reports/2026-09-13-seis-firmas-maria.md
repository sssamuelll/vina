# Seis firmas de María — contrato integrado

Fecha: 2026-09-13. Fuentes: [reunión, §8](2026-09-10-reunion-maria.md), issues #1153 y #1155–#1161. Implementación local en `fix/seis-firmas-maria`; este informe no cambia el estado de los issues. El [plan y registro de delegación](../superpowers/plans/2026-09-13-seis-firmas-maria.md) documenta las fronteras de trabajo.

## Decisiones vigentes

| Firma | Comportamiento | Fuente de verdad |
|---|---|---|
| D1 · Largos | Al crear / Todas / Ninguna. Al crear es el defecto y solo muestra la pieza recién creada mientras mantiene ese contexto. Una selección interna, nodo en edición o arrastre suprime las lecturas generales, incluso en Todas. | `editor.lineLengthMode`; `piezasConLargos`; IDB `settings/line-length-mode` |
| D2 · Ángulo | Primer tramo unido al borde: referencia al borde, +90° hacia dentro. Tramos siguientes: tangente de llegada del anterior. Primer tramo libre: eje absoluto. La etiqueta declara la referencia. | `angleReference.ts`; paths y operaciones polares siguen siendo absolutos |
| D3 · Punto insertado | Una inserción humana sobre una recta conserva el glifo de esquina al moverla. No aparecen puntos adicionales sobre las curvas importadas. | `PathCommand.authoredAnchor`; `anchorRoles` |
| D4 · Construcción | Pluma abierta produce trazo; cierre o Enter con al menos tres nodos produce pieza. Esc o cambio de herramienta conservan los nodos ya colocados de Pluma como trazo. | Implementación previa #1158, conservada y probada |
| D5 · Curva por puntos | V muestra y arrastra anclas; los handles derivados se recalculan. «Convertir a Bézier libre» conserva exactamente las coordenadas y habilita sus handles. Undo restaura la gestión anterior. | `editableCurveNodes`, `resmoothAfterMove`, `manualBezier` |
| D6 · Precisión | Tab y clic derecho congelan el tramo y abren la pareja Largo/Ángulo. La pista «Tab · escribe la medida» desaparece tras descubrirla y persiste. | hooks H/G, `CotaChip`, IDB `settings/precision-hint-used` |

### Gramática numérica y #1161

Largo y Ángulo comparten `grupo` también durante la creación. Tab, Shift+Tab y clic entre esos campos confirman el borrador con motivo de navegación, conservando el otro valor y sin colocar puntos. Un valor inválido retiene borrador y foco. Enter desde cualquiera coloca una sola vez y devuelve el tramo siguiente al ratón; un nuevo Tab congela ese tramo. Confirmar un campo sin editar conserva su precisión interna.

Esc en el input descarta el borrador; el siguiente Esc libera el congelado. En Pluma, fuera de esa edición, Esc termina el trazo confirmado. Después de Enter basta un Esc, porque ya no queda pareja congelada. Línea interna conserva la cancelación de nodos de su contrato del 29-08 §4; #1158 trata los trazos de Pluma y no sustituye esa transición de G.

La reproducción previa a modificar producción demostró: Enter en Largo colocaba 100 mm y reabría el campo; pasar con clic a Ángulo perdía el borrador 100 y colocaba 50; pasar con Tab conservaba 100. Las bitácoras iniciales y finales están en `artifacts/1161`. La reproducción final comprueba `(200,250) → (200,150)` tanto con clic como con Tab y un solo evento de colocación por Enter.

### Referencia e intención

El ángulo relativo es presentación, no un segundo dato geométrico. Se normaliza a `(-180,180]`; la entrada admite equivalencias dentro de ±360°. El congelado guarda su marco; los segmentos ya confirmados lo derivan de su geometría actual. Mover el origen fuera del borde elimina esa referencia. La tangente y el eje se transforman juntos para piezas giradas. Los cierres sintéticos de `buildRing` no cuentan como tramos previos. No hay imán a grados ni milímetros redondos; Shift sigue fuera de #1156.

La premisa de #1157 de que las muestras DXF serían siempre C/Q no corresponde al fixture real: contiene 802 muestras suaves con comandos L. Por eso la intención del punto se guarda en el comando de llegada. El fixture de María conserva **58 corner, 27 lineEnd y 802 smoothSample**. Los proyectos antiguos sin marcas conservan su clasificación.

`authoredAnchor?: true` pertenece al ancla; `manualBezier?: true` pertenece al segmento. El parser JSON/IDB y el codec del worker que vuelve a escribir `outline` preservan ambas propiedades. Las transformaciones y clones 1:1 las conservan. Una división mantiene la intención del ancla en el extremo original y la propiedad manual en ambas mitades. Una inversión mueve la marca de ancla al comando que ahora llega a esa coordenada. Las simplificaciones que eliminan puntos y los refits que sustituyen geometría eliminan las marcas de los comandos sustituidos.

### Revisión de integración

La revisión encontró y corrigió la pérdida de metadatos en el parser, los cierres sintéticos usados como dirección anterior, la referencia de una interna de un solo nodo, la pareja congelada sin `grupo`, la medición incompleta del sufijo angular y la preservación de intención al dividir/invertir curvas. Al invertir durante `unfoldPiece`, el cursor inicial tomaba el primer endpoint/control; se corrige al inicio real reflejado para que geometría e identidad lleguen a la misma coordenada.

El replay histórico detectó además una colisión entre el Bézier recto que crea «Convertir en curva» y la detección geométrica de spline: ambos tienen controles a 1/3 y 2/3. `convertToCurve` ahora declara `manualBezier: true`, conservando los seis valores exactos y las asas del comando existente. La regresión cubre tanto un L como el cierre Z; la curva por puntos mantiene su comportamiento gestionado.

## Verificación

Las pruebas incluyen fixture DXF real, JSON y worker round-trip, hidratación tardía y escrituras serializadas, orientación y rotación, navegación de borradores, V gestionado/manual y undo, y flujos Playwright con bitácora. El gate unitario final ejecutado por el orquestador después de la corrección de Bézier (`npm run test -- --maxWorkers=2`) pasó con **8252 pruebas aprobadas y 13 omitidas**, en 708 archivos aprobados y 3 omitidos. Evidencia local: `artifacts/seis-firmas-unit.log`.

El orquestador repitió independientemente los nueve casos centrales de `seis-firmas-maria.spec.ts` y `1161-reproduccion-tab.spec.ts`: **9/9 aprobados, sin retries**, en un servidor aislado. Incluyen persistencia de Largos, colocación exacta con referencia al borde, clic derecho, conservación de 100 mm al navegar, ancla insertada y edición/conversión/undo de spline.

El conjunto suma **26 casos únicos de navegador aprobados**. Después de corregir `convertToCurve`, el replay histórico pasó **13/13 pasos**, con 178 eventos y cero anomalías o errores de navegador. El orquestador inspeccionó su diff y evidencia en `artifacts/seis-firmas-replay-final`. El replay usa Split 1920×1080, sin activar simulación; no pretende reproducir cada movimiento intermedio de la grabación.

La primera ejecución completa tuvo 8243 pruebas aprobadas y dos fallos: una expectativa que omitía `authoredAnchor` y un límite temporal de `seamAssembly` bajo concurrencia. Se corrigió la expectativa y se verificaron 92 casos afectados y de control antes del gate final. Typecheck en modo build y build de producción pasaron. El lint global no tiene errores y conserva 53 avisos preexistentes; ESLint estricto sobre los TS/TSX tocados pasó sin avisos. El trinquete UI bajó R3 de 644 a 642 sin subir otra regla. El grafo se actualizó mediante AST, sin llamadas LLM.
