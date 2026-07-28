# El grupo coincidente — un punto declarado se comporta como un solo punto

**Fecha:** 2026-07-27
**Estado:** Aprobada por Samuel para planificación e implementación
**Fuente:** nota de María #167 (Trello, 2026-06-07), re-auditada contra `main` en `0ee59cfe`
**Alcance:** clasificación de anclas y operaciones de edición de nodos del PatternEditor 2D
**No modifica:** `PatternPiece`, `PathCommand`, el esquema zod, IndexedDB, el importador DXF, `detectCorners` ni el umbral angular

> **Enmienda 2026-07-27:** el alcance se amplió por decisión explícita de Samuel («todos los pendientes en este mismo PR») para incluir también el resync de `useEditCurve` y el port del undo por gesto (Task 8 del plan). §3 y §12 abajo todavía describen ese resync como no-objetivo diferido a otro PR; quedó cerrado en esta misma rama, no en una posterior.

---

## 1. Resumen ejecutivo

La nota #167 de María contenía una pregunta y un bug que el equipo trató como cosas separadas. Son la misma cosa.

Ella preguntó si el programa distingue de verdad los tipos de punto. Y reportó que al mover una esquina «sale un punto extra que hace que la línea cambie pero el punto que uno quería mover sigue en el mismo sitio», aclarando que «eso no pasa con los puntos de la curva, estos se mueven de una si los clicas».

La causa de las dos observaciones es la misma: **el export de CLO escribe el vértice dos veces en cada punto de trazado**. En el patrón real de María hay 40 grupos de comandos coincidentes; ninguno cae sobre una muestra de curva. Por eso el problema aparece en las esquinas y no en las curvas — la descripción de María discrimina el mecanismo con precisión clínica.

Ese vértice duplicado es simultáneamente:

- **el dato** que responde su pregunta, porque marca exactamente dónde CLO terminó una línea y empezó la siguiente; y
- **el bug**, porque `hitTestNode` devuelve un nodo y `applyNodeMove` escribe en un comando, así que arrastrar una esquina mueve un gemelo y deja el otro.

Esta spec no agrega un modelo geométrico ni un campo persistido. Establece un invariante:

> Un grupo de comandos que comparten coordenada de ancla se comporta como **un solo punto** en selección, arrastre y borrado, y su multiplicidad se usa como señal derivada del tipo de punto.

## 2. Contexto medido

Medición propia sobre `tests/fixtures/garments/maria_patrones_samuel_2M.dxf`, por la misma ruta de carga que usan los tests (`importDXFContent` con `{ unit: 'auto', autoDetect: true }`). Para reproducirla: agrupar los nodos de `extractNodes` por coordenada de ancla exacta y cruzar cada grupo contra `detectCorners`. Los conteos quedan fijados como contrato ejecutable en la Task 6 del plan.

| Pieza | Comandos | Nodos | Esquinas | Grupos ≥2 | Grupos con esquina | Grupos suaves |
|---|---|---|---|---|---|---|
| SAMUEL-1 | 202 | 201 | 4 | 6 | 4 | 2 |
| SAMUEL-2 | 18 | 17 | 4 | 8 | 4 | 4 |
| SAMUEL-3 | 194 | 193 | 8 | 10 | 8 | 2 |
| SAMUEL-4 | 202 | 201 | 4 | 6 | 4 | 2 |
| SAMUEL-5 | 276 | 275 | 8 | 10 | 8 | 2 |
| **Total** | **892** | **887** | **28** | **40** | **28** | **12** |

Los 40 grupos suman 85 miembros: 35 grupos de dos y 5 de tres.

Roles hoy y después de la corrección, contados por nodo:

| Rol | Hoy | Después |
|---|---|---|
| `corner` | 28 | 58 |
| `lineEnd` | — | 27 |
| `smoothSample` | 859 | 802 |
| **Total** | **887** | **887** |

Las 28 esquinas tienen hoy **un** nodo con rol `corner` y el resto degradado a `smoothSample`, lo que dibuja un círculo de 6 px encima de un cuadrado de 10 px en las 28. En cinco grupos hay tres nodos, o sea dos círculos huérfanos.

### 2.1 El detector angular no es el problema

Sobre este archivo la clasificación por ángulo acierta 28 de 28, y con margen amplio: 814 vértices desvían entre 0° y 4,60°, los 28 restantes entre 60,20° y 108°, y entre ambos hay un valle de 55° sin un solo punto. Umbrales de 10°, 20°, 30°, 45° y 60° producen idénticamente el mismo conjunto.

Esto tiene dos consecuencias para el alcance. La primera es que `CORNER_ANGLE_THRESHOLD_DEG = 30` no está calibrado contra nada: flota en medio de una banda muerta. La segunda es que **ningún método alternativo reduce un error medido**, porque el error medido es cero. Ventana de arco, curvatura por círculo circunscrito, Douglas-Peucker, Visvalingam-Whyatt, IPAN99 y scale-space quedan fuera de alcance por esa razón, no por pereza.

Lo que sí es cierto es que el ángulo por vértice mide geometría multiplicada por el paso de muestreo: un círculo de radio 100 mm da 11 esquinas de 11 vértices, 7 de 12 y 0 de 13. Hoy no muerde porque el margen es de 13×. Es una fragilidad conocida y anotada, no un defecto activo.

### 2.2 Tres síntomas, una causa

1. **El glifo apilado.** Las 28 esquinas pintan un círculo sobre un cuadrado. Es lo que María llama «no se diferencian en nada».
2. **El desgarre al arrastrar.** `applyNodeMove` (`nodeEditorUtils.ts:112`) escribe en `cmds[commandIndex]` y nada más. Al mover un gemelo, el contorno pasa de `prev → coord` a `prev → nuevaCoord → coord → next`: una púa. El gemelo que queda sigue dibujado en el sitio original, que es literalmente «el punto que uno quería mover sigue en el mismo sitio».
3. **El borrado mudo.** El handler de `Delete` (`useEditPattern.ts:575-612`) llama `deletePoint` una vez por índice seleccionado. Borrar una esquina elimina un comando y deja el gemelo, y como un vértice duplicado es geométricamente inerte, **el contorno no cambia de forma**. Para María, Delete sobre una esquina no hace nada; para el historial, sí pasó algo. Este síntoma no estaba reportado y se descubrió trazando el diseño.

### 2.3 El bug está congelado en dos tests verdes

- `src/components/PatternEditor/__tests__/useEditPattern.undo.test.tsx:271` afirma `expect(changedIndices).toEqual([target!.node.ref.commandIndex])` sobre el arrastre de una esquina del DXF real: exige que cambie **exactamente un** comando, que es el desgarre.
- La línea 272 usa `toBeLessThanOrEqual(originalMultiplicity)`, así que la multiplicidad puede **bajar** sin que el test se queje. Bajar es justo lo que hace el desgarre.
- `src/components/PatternEditor/__tests__/anchorRoles.test.ts:77` se llama «assigns one corner role when consecutive commands share a coordinate» y afirma `toHaveLength(1)` sobre los coincidentes. Ese test pide el defecto por su nombre.

Los tres se invierten a propósito y el commit lo dice.

## 3. Objetivos y no objetivos

### Objetivos

1. Un grupo coincidente se mueve, se selecciona y se borra como una unidad.
2. Una esquina detectada colorea a **todos** los miembros de su grupo, no a uno.
3. La multiplicidad se expone como rol derivado `lineEnd`, que responde afirmativamente la pregunta de la nota #167.
4. Reducir el peso visual de `smoothSample` para que los puntos estructurales dejen de ahogarse entre 802 muestras.
5. Convertir en fallo ruidoso la trampa de que alguien deduplique en el importador y `lineEnd` se vaya a cero en silencio.

### No objetivos

- Ningún campo persistido. Se mantiene el no-objetivo de `docs/superpowers/specs/2026-07-18-edit-pattern-trust-closure-design.md:66`.
- No se toca `detectCorners`, `CORNER_ANGLE_THRESHOLD_DEG` ni `outlineAnalysis`, así que el anclaje de piquetes queda intacto por construcción.
- No se importan las capas 2/3 del DXF.
- No se unifican los dos detectores de esquina que conviven en el repo.
- No se deduplican los vértices coincidentes en el importador. Esta spec depende de que existan.
- No se fusionan `useEditPattern` y `useEditCurve`, ni se unifica su hit-testing.
- ~~No se corrige el resync de `useEditCurve` (el undo que deja puntos flotando). Es un bug de otra familia y va en su propio PR.~~ **Superado por la enmienda del 2026-07-27**: Samuel amplió el alcance para cerrar todos los pendientes en este mismo PR. El resync y el undo por gesto de `useEditCurve` se cerraron en la Task 8 del plan — sigue siendo conceptualmente un bug de otra familia, pero ya no está diferido.

## 4. Experiencia de usuario

### 4.1 Gramática visual

| Rol | Significado para María | Glifo |
|---|---|---|
| `openEndpoint` | extremo de un contorno abierto | diamante 10 px (sin cambio) |
| `corner` | esquina: dos líneas que se quiebran | cuadrado 10 px relleno (sin cambio) |
| `bezierAnchor` | ancla con manejadores que agarrar | anillo 9 px (sin cambio) |
| `lineEnd` | **nuevo** — fin de una línea y principio de la siguiente, sin quiebre | cuadrado 8 px hueco |
| `smoothSample` | muestra de la curva | círculo 4 px, **sin borde blanco** |

El cuadrado hueco pone a `lineEnd` en la misma familia visual que la esquina, con menos peso: comunica «esto es estructural, pero no quiebra». Es la única decisión estética de esta spec.

El adelgazamiento de `smoothSample` de 6 px con borde a 4 px sin borde no es cosmético. Hoy 859 de 887 nodos pintan un círculo con contorno blanco, y esa masa es la razón material de que María no distinga nada.

Prioridad de rol: `openEndpoint > corner > bezierAnchor > lineEnd > smoothSample`.

`bezierAnchor` va deliberadamente por encima de `lineEnd`: si un punto tiene manejadores, eso pesa más para la interacción que su origen declarativo. En el archivo de María no se cruzan porque no hay comandos `C/Q`.

### 4.2 Comportamiento

Arrastrar una esquina la mueve entera al primer intento. Borrarla la borra. Ni el glifo apilado ni la púa existen. Los estados de selección y hover no cambian de semántica: siguen siendo ortogonales al rol.

## 5. Arquitectura

### 5.1 Agrupamiento coincidente

Un helper puro nuevo en `src/components/PatternEditor/nodeEditorUtils.ts`, junto a las demás primitivas de nodos:

```ts
/** Índices de comando agrupados por coordenada de ancla exacta. */
export function coincidentAnchorGroups(outline: PathCommand[]): Map<string, number[]>;

/** Índices que comparten ancla con `commandIndex`, incluido él mismo. */
export function anchorGroupOf(outline: PathCommand[], commandIndex: number): number[];
```

La clave cuantiza a nanómetro (`Math.round(v * 1e6)`), la misma tolerancia de `1e-9` que `ringOf` ya usa en `notchAnchor.ts:37`. Una pasada, O(n).

**La igualdad es exacta a propósito, no por tolerancia.** Agrupar por épsilon rompe la transitividad —A cerca de B, B cerca de C, A lejos de C— y vuelve el resultado dependiente del orden de iteración, que es exactamente lo contrario de un atributo determinista. CLO escribe el mismo número dos veces, así que la igualdad exacta alcanza.

Techo conocido, que va como comentario `// ponytail:` en el helper: dos vértices a 0,001 mm no forman grupo. En ese caso el punto se clasifica como muestra y arrastrarlo deja el vecino a 0,001 mm, desviación invisible y sin consecuencia geométrica.

### 5.2 El movimiento agrupado

`applyNodeMove` acepta el grupo cuando `pointType === 'anchor'`: resuelve `anchorGroupOf` y aplica la lógica por comando que ya tiene a cada miembro. Para `cp1` y `cp2` no aplica, porque los manejadores de curva no son anclas coincidentes.

Esta es la corrección de raíz. `applyNodeMove` tiene exactamente dos llamadores en producción — `useEditCurve.ts:137` y `useEditPattern.ts:463` — así que arreglarlo adentro cubre las dos superficies de edición sin tocar ninguno de los dos hooks.

Y tiene una propiedad que ahorra trabajo: si mover un miembro mueve a todos, **deja de importar cuál gemelo escogió el hit-test**. Los dos hooks tienen lógica de hit-test distinta (`useEditCurve` no usa `hitTestNode`, tiene la suya en línea) y esa divergencia se vuelve irrelevante en vez de tener que unificarse.

### 5.3 Selección y borrado

La selección expande a los miembros del grupo cuando se escribe `selectedNodes` en `useEditPattern`. Con eso, el handler de `Delete` (`:575-612`) borra el grupo completo por el bucle descendente que ya tiene, y el arrastre multi-nodo trata cada grupo una vez.

`useEditCurve` no necesita cambio de selección: no tiene handler de `Delete` y su arrastre de nodo único pasa por `applyNodeMove`, que ya resuelve el grupo. Es el mismo motivo por el que no hay que unificar el hit-testing.

Dos detalles que el plan debe resolver leyendo el código, no inventando:

- El bucle de arrastre de `useEditPattern.ts:463` debe aplicar el movimiento **una vez por grupo**, no una vez por miembro, para que el delta no se acumule.
- El guard de mínimo tres puntos de `deletePoint` debe evaluarse contra el tamaño del grupo, no contra un comando suelto.

### 5.4 Clasificación

`classifyEditableAnchors` (`anchorRoles.ts:57`) se reescribe sobre los grupos:

1. `openEndpoint` — contorno abierto, primer y último nodo. Topológico, sin cambio.
2. `corner` — el grupo cuya coordenada empata con una esquina de `detectCorners` dentro de `ANCHOR_MATCH_EPS_MM`. Se marcan **todos** sus miembros.
3. `bezierAnchor` — comando entrante o saliente `C/Q`. Sin cambio.
4. `lineEnd` — grupo de tamaño ≥ 2 que no cayó en ninguna de las anteriores.
5. `smoothSample` — el resto.

`matchCornerCommandIndices` (`anchorRoles.ts:26-55`) desaparece entera. Su bucle de mejor candidato con `available.delete` en la línea 51 es exactamente el reparto uno-a-uno que causa el glifo apilado; con los grupos ya calculados, el emparejamiento por distancia sobra.

La firma pública y el contrato de orden no cambian: sigue devolviendo un `ClassifiedAnchor` por nodo, en orden, preservando `commandIndex`.

### 5.5 Renderer

`AnchorGlyph.tsx` gana la rama `lineEnd` (un `rect` de 8 px con `fill="none"`, trazo del color de estado sobre trazo blanco, igual que el resto de la familia) y `smoothSample` baja de `r={3/zoom2D}` con borde a `r={2/zoom2D}` sin borde.

El hit-testing no participa. `HIT_RADIUS_PX = 8` no se toca, así que el círculo más chico no se vuelve más difícil de agarrar — la propiedad que el criterio 7 de la spec anterior ya exigía.

## 6. Flujo de datos

```text
piece.outline
  → coincidentAnchorGroups(outline)          [Map coord → índices]
  → classifyEditableAnchors(piece, nodes)     [rol por nodo, 1:N sobre el grupo]
  → AnchorGlyph en ambos overlays

mousedown sobre una esquina
  → hit-test (cualquiera de los dos hooks, cualquiera de los gemelos)
  → applyNodeMove(outline, idx, 'anchor', pos)
  → anchorGroupOf resuelve los 2-3 miembros
  → los 2-3 comandos se escriben con la misma coordenada
  → el grupo sobrevive el movimiento: sigue siendo un grupo

Delete sobre una esquina
  → selección expandida al grupo
  → deletePoint por índice descendente sobre los miembros
  → la esquina desaparece de verdad
```

Nótese que el grupo es estable bajo edición **por construcción**: como todos los miembros reciben la misma coordenada nueva, siguen coincidiendo. La señal no se autodestruye al primer arrastre.

## 7. Casos límite

- **Pieza sin gemelos** (dibujada dentro de OpenClo, o export de otra herramienta): cero grupos, cero `lineEnd`, y las esquinas se clasifican solo por ángulo igual que hoy. Sin regresión.
- **Grupo de tres**: cinco existen en el archivo de María. Se mueven y se borran los tres.
- **Grupo que empata con dos esquinas detectadas**: imposible por construcción, porque `detectCorners` deduplica coincidentes en `ringOf` antes de medir.
- **Esquina sin grupo**: un quiebre angular que CLO no declaró. Gana `corner` por ángulo; es el camino de las piezas dibujadas a mano.
- **Grupo suave adyacente a `C/Q`**: gana `bezierAnchor` por prioridad declarada.
- **Contorno abierto cuyo extremo es parte de un grupo**: gana `openEndpoint`, que sigue siendo el rol de mayor prioridad.
- **Borrado que dejaría menos de tres puntos**: el guard corta y no se borra el grupo, igual que hoy corta para un nodo suelto.
- **Pieza rotada**: los grupos se calculan en coordenadas locales, antes del transform del overlay. Sin interacción con la rotación.

## 8. Estrategia de pruebas

### 8.1 Tests que se invierten

1. `useEditPattern.undo.test.tsx:271` — `changedIndices` pasa de un índice al conjunto ordenado del grupo.
2. `useEditPattern.undo.test.tsx:272` — `toBeLessThanOrEqual` pasa a igualdad estricta: la multiplicidad máxima no puede bajar.
3. `anchorRoles.test.ts:77` — el caso de dos comandos coincidentes pasa a exigir `toHaveLength(2)` y se renombra.

### 8.2 Tests nuevos, puros

4. `coincidentAnchorGroups` sobre un cuadrado sin duplicados devuelve cero grupos.
5. Un grupo de tres se devuelve completo y en orden de `commandIndex`.
6. Dos vértices a 0,001 mm **no** forman grupo (fija la decisión de igualdad exacta).
7. `applyNodeMove` sobre un miembro escribe la misma coordenada en todos, y sobre `cp1`/`cp2` escribe solo en uno.

### 8.3 Tests nuevos sobre el DXF real

8. Conteo de grupos: 40 en total, 28 con esquina, 12 suaves.
9. Conteo de roles: `corner` 58, `lineEnd` 27, `smoothSample` 802, suma 887.
10. **Cero glifos apilados**: no existen dos nodos en la misma coordenada con roles distintos, en las cinco piezas.
11. Arrastre de una esquina: la longitud del contorno no cambia, la multiplicidad máxima no cambia, y cambian todos los índices del grupo.
12. `Delete` sobre una esquina reduce la longitud del contorno en el tamaño del grupo.

El test 8 es la mitigación de la trampa: el día que alguien deduplique en el importador, se pone rojo y obliga a decidir explícitamente si se leen las capas 2/3, en vez de que `lineEnd` desaparezca en silencio.

### 8.4 Paridad y regresión

13. `AnchorOverlayParity` sigue exigiendo un glifo por nodo y ahora también que los dos overlays produzcan los mismos roles incluyendo `lineEnd`.
14. `AnchorGlyph` renderiza cinco formas distinguibles y `lineEnd` no lleva relleno.
15. Una pieza sintética sin gemelos conserva exactamente la clasificación de hoy.

## 9. Criterios de aceptación

1. Arrastrar una esquina del DXF de María la mueve entera al primer intento, sin dejar gemelo.
2. La longitud del contorno y la multiplicidad máxima no cambian al arrastrar.
3. `Delete` sobre una esquina la elimina de verdad.
4. Ningún par de nodos coincidentes lleva roles distintos.
5. `lineEnd` existe, vale 27 nodos en el archivo de María y cero en una pieza sin duplicados.
6. `smoothSample` se dibuja a 4 px sin borde y sigue siendo seleccionable desde 8 px.
7. `detectCorners`, `CORNER_ANGLE_THRESHOLD_DEG` y el anclaje de piquetes quedan byte-idénticos.
8. Cero campos persistidos nuevos; `PatternPiece`, `PathCommand` y el esquema zod sin cambios.
9. Los tres tests invertidos están renombrados y el commit explica por qué.
10. Gates verdes: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 10. Secuencia de implementación

1. `coincidentAnchorGroups` y `anchorGroupOf` con sus tests puros.
2. `applyNodeMove` agrupado; invertir los dos tests de `useEditPattern.undo.test.tsx`.
3. Selección expandida al grupo y borrado agrupado.
4. Reescritura de `classifyEditableAnchors` sobre grupos; invertir el test de `anchorRoles.test.ts`; borrar `matchCornerCommandIndices`.
5. `lineEnd` en `AnchorGlyph` y adelgazamiento de `smoothSample`.
6. Tests sobre el DXF real, incluida la guarda anti-deduplicación.
7. Gate completo.

Los pasos 1-3 arreglan daño real al patrón y podrían salir solos si hiciera falta partir el trabajo. Los pasos 4-6 son la respuesta a la pregunta de María.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Alguien deduplica en el importador y `lineEnd` se va a cero en silencio | Test 8 fija los conteos sobre el fixture real y se pone rojo ese día |
| El bucle de arrastre aplica el delta una vez por miembro y lo duplica | Se resuelve leyendo `useEditPattern.ts:463` en el plan; test 11 lo cubre |
| El guard de tres puntos no considera el grupo y deja media esquina | Caso límite declarado; test 12 |
| Las piezas sin gemelos pierden clasificación | Test 15 fija que el camino angular queda igual |
| Cambiar el clasificador mueve el anclaje de piquetes | No se toca `detectCorners`; solo cambia cómo se proyecta su salida sobre los nodos |
| El umbral de 30° sigue dependiendo del muestreo | Fragilidad conocida y anotada, sin error medido hoy; fuera de alcance con razón escrita en §2.1 |

## 12. Trabajo adyacente, fuera de esta spec

- ~~**Resync de `useEditCurve`.**~~ **Cerrado en esta misma rama (Task 8 del plan, enmienda 2026-07-27).** Tras un Ctrl+Z el contorno volvía pero los nodos del hook conservaban posiciones e índices viejos, así que los glifos quedaban flotando y el siguiente arrastre escribía en el comando equivocado. `useEditPattern` ya tenía la solución (`resyncStateToPiece` más el efecto de identidad de outline en `useEditPattern.ts:278-297`); `useEditCurve` no importaba siquiera `useEffect`. Era la queja 3 de la nota #167. Samuel decidió cerrar todos los pendientes en el mismo PR en vez de diferirlo, así que ya no sigue viva.
- **Clasificación de anclas `C/Q` por tangentes de puntos de control.** `CURVE_RESOLUTION = 12` es fijo por comando (`src/utils/seam/index.ts:4`), así que partir una curva con `splitSegmentAt` duplica las muestras y reclasifica puntos sin que nadie mueva nada. Es la única dependencia de resolución reproducible en la ruta viva del producto. Unas ocho líneas, cuando alguien lo reporte.
- **Importar las capas 2/3 del DXF.** `converter.ts:441-452` descarta los puntos de trazado y de curva que CLO declara, con el comentario de que son ruido. Es el camino de subida el día que se necesite el tipo de punto en piezas sin gemelos, o que el grading necesite un productor de reglas.

## 13. Referencias

- `docs/superpowers/specs/2026-07-18-edit-pattern-trust-closure-design.md` (no-objetivo de persistencia, línea 66)
- `src/components/PatternEditor/anchorRoles.ts`
- `src/components/PatternEditor/nodeEditorUtils.ts`
- `src/components/PatternEditor/renderers/AnchorGlyph.tsx`
- `src/utils/notchAnchor.ts`
- Tarjeta Trello #167, `https://trello.com/c/ntvnk0pn`
- Contrato ejecutable de los conteos medidos: Task 6 del plan (`src/components/PatternEditor/__tests__/anchorRoles.maria.test.ts`)
