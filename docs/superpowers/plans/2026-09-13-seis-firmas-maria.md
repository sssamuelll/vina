# Seis firmas de María — plan de integración

> Ejecución por subagentes con archivos acotados; el orquestador interpreta el contrato, revisa cada diff y verifica la integración. El usuario autorizó esta modalidad el 2026-09-13.

**Objetivo:** completar las firmas D1–D6 de la reunión del 10-09, conservando la construcción ya integrada en #1158.
**Arquitectura:** geometría absoluta canónica; conversión angular compartida en su frontera de lectura/escritura; preferencias en Redux con IDB canónico; intención local al comando que representa el punto. Sin coordinador nuevo.
**Stack:** React, Redux Toolkit, TypeScript, Vitest, Playwright.
**Fuentes:** `docs/reports/2026-09-10-reunion-maria.md` §8; issues #1155–#1161; specs 29-08, 30-08, 08-09, 09-09 y trazos 12-09. #1153 comparte la decisión de visibilidad.

## Mapa verificado

| Superficie | Escritores | Lectores / persistencia | Pruebas |
|---|---|---|---|
| Largos | editorSlice, FilaDeCapas, LogoMenu | PatternEditor → CotasLayer; inicialmente booleano sin persistencia | FilaDeCapas, LogoMenu, lineLengthLabelsData; lo-que-se-ve-y-cuando e2e |
| Tramo numérico | CotaChip → PatternEditor → usePenTool/usePolyPenTool | nextPoint → cotasDelTramoEnCurso; overlays; path al confirmar | CotaChip, tramoEnCurso, usePenTool/usePolyPenTool; maria-195 y trazos e2e |
| Ángulo | polarPoint; escritura de cotas | polarOf, segmentPolar, cotasDeTramos, overlays | segmentPolar, cotasDeLineaInterna, cotasDeTrazo |
| Punto insertado | usePointTool → useEditPattern.addPointOnSegment → splitSegmentAt | anchorRoles → PuntosDelContorno y hit-test; PathCommand → projectSchema/IDB/JSON | anchorRoles.maria: 58 corner + 27 lineEnd + 802 smoothSample |
| Curva por puntos | convertSegmentToSpline, applyNodeMove, resmoothAfterMove | isSplineManaged, useEditCurve, NodeEditorOverlay | splineSegment, useEditCurve, AnchorOverlayParity |
| Construcción | usePenTool → addTrazo/updateTrazo | trazos, snapIndex, sujeto, projectSchema, autosave; no solver | trazos.spec.ts y pruebas #1158 |

## Restricciones

- IDB por storageGet/storageSet; comentario `shape` obligatorio. Sin escritura paralela a LS.
- IDs por newId; los metadatos de punto viajan en su comando, nunca por índices persistidos.
- `npx tsc -b --noEmit`; gates finales `npm run test`, `npm run lint`, contrato de interfaz y e2e relevantes.
- No commits, publicación ni cambios de issues durante la implementación. Rama local `fix/seis-firmas-maria`.
- Root conserva PatternEditor.tsx, tipos compartidos, contratos y la integración angular.

## Resoluciones del orquestador

### D1: modos de largos

`LineLengthMode = 'creation' | 'all' | 'none'`, defecto `creation`. Control visible con los tres nombres firmados: Al crear / Todas / Ninguna. La preferencia sobrevive recarga y cambio de proyecto. La hidratación tardía no pisa una elección del usuario; las escrituras se serializan.

La lista se deriva una sola vez de piezas visibles, modo y contexto. Ninguna da vacío. Un gesto de arrastre o sujeto dentro (interna, V, punto Q) suprime las lecturas generales; luego Todas muestra las visibles; Al crear muestra solo la pieza nueva mientras sigue siendo el sujeto. La creación de Pluma también tiene esa identidad transitoria; no activa defaults numéricos de otras herramientas.

### D2: referencia angular

`polarOf` y `polarPoint` siguen absolutos. Un helper `angleReference.ts` define `AngleReference { kind: 'absolute' | 'border' | 'segment'; baseDeg: number }`, normalización y conversiones inversas. El par congelado almacena geometría absoluta más su referencia fijada al congelar. El chip transforma únicamente su ángulo de presentación; longitud y extremo fijo conservan su precisión.

El tramo anterior define el eje por su tangente de llegada (cuerda como fallback degenerado), en el sentido de avance. Primer tramo: borde que contiene su origen, con tangente orientada para que +90 apunte al interior de un contorno cerrado; un borde abierto conserva su sentido. En esquina se usa el desempate determinista del anillo existente, nunca el cursor que se mueve. Sin borde, eje absoluto. Rango relativo normalizado (-180,180]; los valores escritos equivalentes se normalizan, sin redondear la geometría.

En geometría ya confirmada, la referencia se deriva del path actual y su origen coincidente con el borde; no se guarda un segundo ángulo ni una relación paramétrica que el resto de editores no mantendría. Mover el origen fuera del borde elimina esa referencia y deja visible el fallback absoluto. Internas y trazos usan la misma función. Rotación, subpaths y comandos degenerados tienen pruebas.

Píldora y chip dicen `al borde`, `al tramo` o `al eje` junto al valor. La referencia no introduce imán a valores redondos. Shift queda fuera de esta tanda conforme a #1156.

### D3: intención del punto y contradicción del DXF

La premisa del issue «dos L solo pueden ser un punto insertado» es falsa: el fixture real tiene 802 muestras L. La forma geométrica no conserva intención al mover el punto. Se enmienda el mecanismo, manteniendo el resultado firmado y el conteo del DXF.

`PathCommand.authoredAnchor?: true` marca únicamente inserciones humanas sobre segmentos rectos. La marca vive en el comando de llegada, no en un índice externo. La clasificación da el glifo de esquina al punto marcado entre segmentos rectos; las muestras importadas siguen iguales. Insertar/deshacer/borrar y guardar/recargar deben conservar o retirar la marca junto con el comando. Transformaciones y duplicaciones conservan propiedades del comando. Convertir a curva aplica la semántica de curva, como acepta #1157.

### D5: editar puntos y salida explícita a Bézier

Una única proyección de nodos editables elimina los handles de comandos pertenecientes a runs gestionados. Tanto el dibujo como el hit-test reciben esa proyección. Mover anclas llama a resmoothAfterMove con el contorno anterior; un handle libre conserva el comportamiento actual.

La salida explícita `Convertir a Bézier libre` opera sobre el run gestionado completo y conserva sus coordenadas. `PathCommand.manualBezier?: true` expresa esa elección en sus comandos C; isSplineManaged excluye esos comandos aunque coincidan numéricamente. Undo restaura la gestión. Los proyectos anteriores conservan la detección geométrica existente. Ninguna perturbación de coordenadas se usa como bandera.

El escritor existente `convertToCurve` también declara Bézier libre: sus controles a 1/3 y 2/3 coinciden con una cadena Catmull-Rom de dos anclas. El replay histórico reveló que omitir la marca ocultaba sus asas. Root resolvió esta frontera y añadió la marca sin cambiar coordenadas; dos regresiones económicas cubren L y Z.

### D6 y #1161: un solo contrato de edición

1. Tab o clic derecho durante H/G congela y enfoca Largo.
2. Tab/Shift+Tab o clic entre campos del mismo par confirma el borrador del campo con motivo de navegación; no coloca el nodo. Valor inválido conserva campo y borrador.
3. Enter desde cualquiera coloca una vez el extremo con el par vigente. El siguiente tramo vuelve al ratón, sin heredar un bloqueo ni reabrir automáticamente Largo.
4. Esc dentro del input descarta solo el borrador; otro Esc libera el par congelado. En Pluma, fuera del congelado Esc termina la construcción confirmada. Tras Enter, un Esc ya termina porque no queda par congelado. G conserva su cancelación de nodos de la spec 29-08 §4.
5. Cambiar herramienta descarta el próximo punto pendiente y conserva los nodos ya colocados de Pluma según #1158. No confirma un número pendiente. La conservación de construcción de H no redefine `reset()` de G.
6. Pista junto a la píldora: `Tab · escribe la medida`, hasta usar Tab o derecho. Preferencia de descubrimiento persistida por el patrón IDB existente. Sin menú nuevo.

## Orden y fronteras

- [x] Localizar firmas/issues y mapas independientes.
- [x] Revisión clínica: Enter, Esc, orientación, DXF y salida spline resueltos arriba.
- [x] Reproducir #1161 con navegador y bitácora antes de modificar producción. Archivo `tests/e2e/1161-reproduccion-tab.spec.ts`; evidencia local `artifacts/1161`.
- [x] Largos: worker acotado a editorSlice, persistencia dedicada, FilaDeCapas, LogoMenu, helper puro de visibilidad y sus unitarios. Root añade tipos, conexión de store y PatternEditor.
- [x] Intención de anclas: worker acotado a nodeEditorUtils, anchorRoles, transformaciones mecánicas verificadas y sus pruebas; root mantiene tipos/projectSchema. Probar fixture real y round-trip.
- [x] Curvas: worker acotado a splineSegment, useEditCurve, NodeEditorOverlay/proyección de nodos, acción explícita y sus pruebas. Secuencial con cualquier archivo compartido por inserción.
- [x] Gramática: worker acotado a CotaChip y pruebas del componente tras reproducir; root modifica hooks, contextmenu y foco.
- [x] Ángulo: root integra helper compartido, hooks, cotas, overlays y conexiones. Pruebas de frontera matemática y e2e con borde vertical.
- [x] E2E: seis firmas, persistencia/recarga, Tab/clic/Enter/Escape, punto visible y spline sin handles. Actualizar expectativas antiguas que contradicen las firmas, conservando sus aserciones geométricas.
- [x] Enmendar specs 29-08, 30-08, 08-09, 09-09 y 12-09 donde corresponda; registrar diagnóstico de #1157 y reproducción de #1161.
- [x] Revisión adversarial económica del diff final; root inspecciona, corrige y verifica.
- [x] Gates completos y `graphify update .`; registrar resultados y limitaciones reales.

## Registro de delegación

| Tarea | Modelo/agente | Alcance | Archivos permitidos | Resultado | Verificado |
|---|---|---|---|---|---|
| Localizar firmas/mapa largos | Luna / locate_contracts | Docs y D1 | lectura | seis firmas, 7 issues; mapa | root verificó fuentes/callsites |
| Localizar issues | Luna / locate_issues | GitHub | lectura | estados y síntesis | root leyó cuerpos completos; mapa numérico incompleto reasignado |
| Puntos y splines | Luna high / map_anchor_spline | D3/D5 | lectura | DXF medido; API gestionada | root inspeccionó tipos, roles y splineSegment |
| Análisis contractual | Sol high / audit_contract | contratos | lectura | 4 BLOCKER + 1 HIGH | resueltos por root arriba |
| Mapa/repro numérico | Sol high / numeric_reproduction | D6/#1161 | spec 1161 y artifacts/1161 | baseline 3 verdes/1 rojo; final 4/4 verdes | root leyó timeline y coordenadas |
| Modos y persistencia D1 | Sol high / implement_lengths | estado y controles | editorSlice, lineLengthPreference, FilaDeCapas, LogoMenu, piezasConLargos y sus tests | 36/36 iniciales | diff inspeccionado; root conectó store y canvas |
| Intención D3 | Sol high / implement_anchor_intent | inserciones y transporte | nodeEditorUtils, anchorRoles, transform/grading/slashAndSpread/mergeOutline/modifyDimension/linkedEditing/patternOps/cornerTypes, reactiveSolver, arrayBufferCodec y tests | DXF y round-trip verdes | root revisó diff; amplió preservación al codec canónico |
| Edición spline D5 | Sol high / implement_lengths | proyección y conversión | splineSegment, editableCurveNodes, useEditCurve, actionCuration y tests | 68/68 iniciales | root inspeccionó diff, conectó callback y verificó undo real |
| Campo numérico D6 | Sol high / numeric_reproduction | navegación y precisión | CotaChip y tests; spec 1161 | 32/32 unitarios, 4/4 navegador | root agregó el grupo faltante y verificó evidencia |
| Lecturas y pista D2/D6 | Sol high / implement_lengths | overlays e IDB de descubrimiento | PenToolOverlay, PolyPenToolOverlay, ToolOverlay, usePrecisionHint y tests | 21/21 | root inspeccionó y conectó ambas herramientas |
| Revisión adversarial | Sol high / implement_lengths | diff global fuera de su núcleo | lectura | 6 observaciones | root aceptó 3/4/6, alineó rango 5; 2 rechazado con spec; 1 tratado como aislamiento de secuencias, sin afirmar reproducción |
| Preservación en división/inversión | Sol high / implement_lengths; integración root | correcciones 3/4 de revisión | nodeEditorUtils, patternOps y tests | worker creó regresiones; root retomó producción; 79/79 | root corrigió identidad ancla/segmento y cursor invertido; revisión independiente final sin nuevos hallazgos |
| E2E D1–D5 | Sol high / implement_anchor_intent | fixtures y regresiones visibles | seis-firmas, maria-195, trazos, tanda4, lo-que-se-ve-y-cuando, replay-maria | 21 casos únicos aprobados | root inspeccionó diff, corrigió supuestos de harness y revisó captura D5 |
| Suites D1 migradas | Sol high / numeric_reproduction | clasificación independiente | lectura y artifacts/seis-firmas-d1-browser | 12 casos aprobados; replay detectó coordenadas fuera del canvas y clic sobre asa | root separó corrección del harness de producción |
| Replay histórico | Sol high / numeric_reproduction | encuadre y aserciones D1 | solo tests/e2e/replay-maria-07-09.spec.ts | 13/13 pasos; Playwright 1/1, sin retries | root revisó diff y resultado.json, 0 anomalías, 0 errores de navegador, 178 eventos |
| Verificación independiente final | root | nueve casos centrales en servidor aislado 5175 | sin cambios de producción; config local artifacts/seis-firmas.playwright.config.ts | 9/9, sin retries, 2.5 min | ejecutada y examinada directamente por root |
| Regresión conversión Bézier recta | Sol high / implement_lengths; producción root | colisión geométrica D5 detectada por replay | worker solo editableCurveNodes.test.ts; root convertToCurve y comentario splineSegment | RED por marca ausente; 86/86 tras integrar | root fijó contrato, retomó el ajuste de 1 ULP del fixture y ejecutó conversión/cierres; replay confirmó asas reales |

## Verificación de integración completada

- #1161 navegador: 4/4, evidencia antes/después separada; clic y Tab conservan 100 mm.
- Pasada final independiente del orquestador: `npx playwright test tests/e2e/seis-firmas-maria.spec.ts tests/e2e/1161-reproduccion-tab.spec.ts --config artifacts/seis-firmas.playwright.config.ts --workers=1 --retries=0`, **9/9**. Servidor 5175 aislado del replay histórico en 5174.
- Navegador: **26 casos únicos aprobados**: seis-firmas 5, #1161 4, maria-195 3, trazos numérico 1, lo-que-se-ve-y-cuando 8, tanda4 4 y replay 1. El replay final, posterior a corregir `convertToCurve`, completó **13/13 pasos**, 178 eventos y cero anomalías/errores de navegador; evidencia en `artifacts/seis-firmas-replay-final`. Root revisó su diff, coordenadas y JSON de resultados.
- Hooks H/G + undo V: 63/63. Familia completa de cotas: 226/226.
- Primer gate completo: 8243 aprobadas, 13 omitidas, dos fallos. Se corrigió una expectativa antigua de inserción Z; el test temporal de seamAssembly pasó aislado. Las tres suites afectadas/control pasaron 92/92 con dos workers.
- Gate completo final, ejecutado por root después de la corrección de Bézier: `npm run test -- --maxWorkers=2`, **8252 aprobadas, 13 omitidas; 708 archivos aprobados y 3 omitidos**, 240.39 s. Evidencia: `artifacts/seis-firmas-unit.log`.
- `npx tsc -b --noEmit` y `npm run build`: aprobados. Lint completo sin errores; se corrigió el único aviso nuevo de dependencias de PatternEditor. ESLint con `--max-warnings=0` sobre todos los TS/TSX modificados y nuevos: aprobado.
- UI: R3 baja de 644 a 642; baseline actualizado sin subir ningún contador.
- `graphify update .`: AST actualizado tras la última corrección, 17870 nodos y 35680 relaciones; sin llamadas LLM. Dos limitaciones de parser en pruebas preexistentes ajenas a este cambio.
- `git diff --check`: aprobado. Cambios locales en `fix/seis-firmas-maria`, sin commit, publicación ni modificación de issues.
- [Contrato integrado y enmiendas](../../reports/2026-09-13-seis-firmas-maria.md).
