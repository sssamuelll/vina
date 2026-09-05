# La gramática de la tanda 6 — decisiones cerradas

> 2026-09-05 · Propuesta de Petra Haft, corregida por Vex Rune (13 cortes),
> Plumb Lindgren (8 veredictos de tamaño) y Adrian Serrano (5 blockers, 6
> altos). Las correcciones están **incorporadas**, no anexadas: donde la
> propuesta y el censo no coincidían, manda el censo.

## 0. Qué es esto y qué no

La tanda 6 lleva parada desde el 30 de agosto con el rótulo «necesita diseño de
interacción». Este documento es ese diseño: cierra las decisiones para que la
implementación no tenga que inventar nada. **No es un plan de trabajo** — el
reparto en tramos está en § 7, con los tamaños medidos, y varios de ellos no
caben en el mismo PR.

Lo que la tanda 6 agrupa son tres issues (#1112 mover con número, #1104 medir,
#1102 la pluma no engancha), y el informe adversarial del 04-09 (§ 7.1) le
encima un cuarto encargo: ser **el spec de la gramática** que disuelve las tres
unificaciones grandes. Esa ambigüedad de alcance era la decisión de verdad, y
está cerrada abajo (§ 2, decisión 14).

## 1. Lo que ya no hace falta decidir

Cuatro preguntas que la propuesta trataba como abiertas están cerradas, tres de
ellas por trabajo hecho entre el 4 y el 5 de septiembre. Se dejan escritas
porque volverían solas.

| Se creía abierto | Está cerrado porque |
|---|---|
| **La gramática del número** | Se implementó el 05-09. Las trece opciones rotuladas «(mm)» son campo escrito, con su trinquete (`donde-se-teclea-un-numero.test.tsx`) y con el acotado del rango que ese cambio abría. La propuesta decía «lo usa una sola herramienta»: era cierto por la mañana. |
| **Suprimir el transform box con el nodo como sujeto** | Cero código. `shouldShowTransformBox` (`useEditorInteractions.ts:288-304`) solo devuelve `true` con `transform` o `select`; `editPattern` no es ninguno, y `CON_COTAS_DE_PIEZA` (`sujeto.ts:50`) tampoco lo incluye. El caso que la propuesta citaba como prueba —los chips comiéndose dos asas— es la herramienta **Seleccionar** y se cerró el 04-09 con `cajasDeAsas`. |
| **Un selector de modo para Medir** | El modo YA se deriva de la herramienta activa (`useMeasureTool.ts:170-173`). Un `select` en la tira sería **un segundo escritor del mismo hecho**, que es textualmente el fallo que el repo tiene escrito con su nombre en `toolActivation.ts:10-12` («dos listas se desincronizan, como pasó con walkSeam»). Y su premio declarado —abrirle puerta a `measureCurve` y `compareCurves`— ya se cobró el 05-09: las dos tienen botón en el catálogo. |
| **`selectedElasticId`** | Es una edición de dos líneas, no una decisión. Cero escritores en `src/`; `ElasticRenderer.tsx:261` lo lee y por eso el elástico seleccionado nunca se resalta. Ver § 3. |

## 2. Las diecinueve, en treinta segundos

| # | Pregunta | Decisión | Razón |
|---|---|---|---|
| 1 | Sujeto de las cotas del nodo | **el nodo + sus dos tramos vecinos** | El nodo solo no tiene número escribible. Lo que María nombró dos veces son los tramos. |
| 2 | Qué números al mover | **repartido** | Durante el arrastre, un readout `largo · ángulo` junto al cursor; en reposo, dos chips de distancia a los vecinos. Nunca los cuatro juntos. |
| 3 | Cuándo aparecen | **también durante el arrastre** | Esconder el número justo mientras lo mueve es lo contrario de lo que pidió. |
| 4 | «Clic derecho → cuánto» [02:34] | **entrada «Mover exacto…» en el menú** | Una puerta más, cero superficie nueva. Campos dentro del menú rompen el reparto (menú = verbos). |
| 5 | Con 2+ nodos | **una sola cota de desplazamiento del grupo** | Es lo único que los nodos comparten, y `startPositions` ya mueve el Set con un delta. |
| 6 | ¿Se suprime el transform box? | **no aplica** | Ver § 1: no ocurre. |
| 7 | Enganche de Medir | **adopta `resolveSnap`, extraído a módulo** | El mejor resolutor del repo ya existe y gana un lector. |
| 8 | «Borrar mediciones» + persistencia | **botón en la tira, y persisten** | La tira es la cabina de la herramienta; un botón flotante nuevo es F1 otra vez. |
| 9 | Readout «a 3 mm de este punto» | **junto al cursor, no chip** | Es realimentación del clic pendiente, no una propiedad. Un chip prometería escritura. |
| 10 | Gesto del ángulo | **tres clics enganchados** | Convención universal. Su puerta ya existe: `measureCurve`/`compareCurves` tienen botón desde el 05-09. |
| 11 | ¿Medición editable? | **solo lectura** | Escribir «150» entre dos esquinas de dos piezas no tiene respuesta única. |
| 12 | Nodos donde engancha la pluma | **todos** | Mismo gesto, mismo significado. El umbral de cierre **se queda en 12 px** (ver § 4). |
| 13 | ¿Vértices pintados con pluma? | **sí, solo con pluma** | Lo pidió literal [11:38]. Siempre son 200 puntos permanentes sobre el DXF: eso es #1108. |
| 14 | Qué es la tanda 6 | **partida** | 6a: sujeto activo + Escape + chips del nodo. 6b: pista y línea de sujeto para las 27. El resolutor único sale de la tanda (§ 4). |
| 15 | ¿Entra #1129? | **sí, y va primero** | Los chips de «mover exacto» SON el tramo congelado; construirlos aparte es construirlos dos veces. |
| 16 | Unidad de los chips | **mm siempre** | Ratificado en el spec de cotas § 4.4. No se reabre. |
| 17 | Regla del sujeto activo | selector derivado; 5 campos sobreviven, 1 se borra, 0 nacen | § 3 |
| 18 | Resolutor único de enganche | **sale de la tanda 6** — es L y tiene su propio spec | § 4 |
| 19 | Gramática del número | **hecha** | § 1 y § 5 |

## 3. El sujeto activo

Una sola respuesta a «qué estoy editando ahora mismo», como **selector
derivado**, no como campo nuevo:

```
sujetoActivo(state, nodosLocales) →
  | { clase: 'nodo',         pieceId, commandIndices }
  | { clase: 'lineaInterna', pieceId, lineId }
  | { clase: 'borde',        pieceId, edgeId }
  | { clase: 'costura',      id }
  | { clase: 'pom',          id }
  | { clase: 'medida',       id }
  | { clase: 'pieza',        ids }
  | { clase: 'nada' }
```

La escalera es de **especificidad**, no de recencia, y se resuelve una vez en
ese orden: una sub-selección siempre gana a su contenedor.

### 3.1 Los campos

| Campo | Veredicto | Razón |
|---|---|---|
| `selectedPieceIds` | sobrevive | 308 lecturas, multi-selección real, ningún síntoma |
| `selectedInternalLine` | sobrevive | ya es una sub-selección con reglas escritas |
| `selectedSeamId` | sobrevive | entidad de proyecto, sobrevive al cambio de herramienta |
| `selectedPOMId` | sobrevive | igual; que Supr no lo mire lo arregla la escalera, no un borrado |
| `saSelection` | sobrevive | ya alimenta las cotas de margen |
| **`selectedElasticId`** | **se borra** | cero escritores; el resalte pasa a leer el local de `useElasticTool.ts:124`, que sí se escribe |
| `selectedReferenceImageId` | **fuera del sujeto activo** | su sujeto es la capa de fotos, no el patrón. Mezclarlo dejaría que Supr borre una foto cuando María cree que borra una pieza |

**Nacen cero campos.** La selección de nodos se queda en el `Set<number>` local
de `useEditPattern.ts:58` y se le pasa al selector. Subirla a Redux crearía el
séptimo campo con el bug colgante que el informe ya documenta.

### 3.2 Dos correcciones que la propuesta no vio

**(a) `medida` y `nodo` no tienen de dónde leerse.** Las dos clases viven en
estado local de sus hooks (`useMeasureTool`, `useEditPattern`), no en Redux. El
selector no puede leerlas desde un `createSelector` puro. La firma de arriba ya
lo refleja para los nodos (`nodosLocales` es un argumento), y **hace falta el
mismo argumento para las medidas**. Si no, dos de las ocho clases son
inalcanzables y la escalera miente.

**(b) `borde → nada, en silencio` es un no-op nuevo.** La propuesta decidía que
Supr con un borde de margen elegido no hiciera nada, callando. Pero `saSelection`
sobrevive al soltar la herramienta Margen, así que María elige un borde, cambia a
Seleccionar, pulsa Supr esperando borrar su pieza, y **no pasa nada**. Es
exactamente el defecto #1117 recién cerrado, reintroducido por la puerta de al
lado. **Corrección: con `borde`, Supr cae al siguiente peldaño** (`pieza`), y el
borde se deselecciona. Si algún día borrar un borde significa algo, se decide
entonces.

### 3.3 Los tres consumidores

1. **La tira lo imprime** — ocho cadenas derivadas, una por clase, no 22
   escritas herramienta por herramienta.
2. **Supr lo borra** — `resolverBorrado` (`src/store/borradoDeSeleccion.ts`) ya
   existe y ya tiene dos llamadores. Gana `nodo` (delega en el borrado de
   `useEditPattern`, con su guarda de ≥ 3 anclas intacta) y `medida`.
3. **Escape lo desmonta** — y aquí está el blocker de § 6.

## 4. El resolutor único sale de la tanda 6

La propuesta lo llamaba «una mudanza» y le ponía precio «ninguno». El censo dice
otra cosa, y esta es la corrección más importante del documento:

- No son once hit-tests sino **diecinueve** dentro de `PatternEditor/`, y
  **veinticuatro** contando los de `utils/` que solo llama el lienzo 2D.
- No son dos radios sino **siete** en veinte sitios: 5, 6, 8 (×9), 10 (×4), 12
  (×2), 15 (×2), 20.
- Y **no es mudar uno: es fusionar cuatro** con semánticas distintas.

Reducir los siete radios a dos **encogería el enganche de la pluma**, que hoy
tiene 12 px por una ratificación escrita. Un resolutor que «unifica» bajando un
umbral no unifica: cambia el comportamiento de la herramienta que más lo usa.

**Decisión: es su propio spec, y no entra en la tanda 6.** Lo que sí entra es lo
que ya estaba decidido y es barato: `usePenTool` adopta `resolveSnap`
(#1102) **conservando su umbral de cierre de 12 px**. Un lector más para el
mejor resolutor del repo, sin tocar los otros veintitrés.

Un adelanto ya cobrado el 05-09: `useMergeTool` tenía su propia copia de la caja
con el bug de rotación de #1064 dentro. Se borró entera y se cambió por
`hitTestPieceBBox`. **Veintitrés.**

## 5. La gramática del número

> El número vive donde vive su sujeto. Objeto en pantalla → chip sobre él.
> Próximo objeto a crear → tira. Gesto vivo → readout junto al cursor.

Las tres ya existen; lo que faltaba era que la tercera columna se pudiera
**teclear**, y eso se hizo el 05-09. Lo que queda:

- **Tijeras no tiene ninguna opción numérica.** No hay deslizador que convertir:
  hay una opción que no existe. Dar número a Tijeras es feature con gesto nuevo
  (#1105), no ajuste.
- **Hilo y Editar patrón**: igual (#1107, #1112).
- Los rótulos de Círculo y Rectángulo no llevan «(mm)»: es una decisión de una
  palabra y va con el resto del copy.
- **No abrir un segundo trinquete.** `donde-se-teclea-un-numero.test.tsx` ya
  vigila la regla; si algún día hay opciones en grados, se amplía su regex.

## 6. Escape — el peldaño que no existe

La propuesta proponía una escalera de tres peldaños («¿hay gesto vivo? → ¿hay
sujeto? → vuelve a la flecha») con precio «ninguno». **Es el blocker más caro y
queda abierto**, con la pregunta nombrada:

- El peldaño 1 no tiene predicado universal: solo **seis** ganchos exponen
  `isArmed()`/`isTracing()`, mientras **catorce** registran su `handleKeyDown`
  en la burbuja de `window`.
- `editPattern.handleKeyDown` hace `exitEdit()` con Escape
  (`useEditPattern.ts:628-631`), un estado que la escalera ni nombra.
- El spec de cotas vivas ya gasta un Escape: «un segundo `Escape` es el de
  siempre (deselecciona)». Con un chip en edición harían falta **cuatro**.

**Lo que hay que decidir antes de escribir una línea:** si la escalera se
implementa como un único enrutador en captura (y entonces los catorce
`handleKeyDown` se re-cablean, que es el trabajo real y no es «ninguno»), o si
se queda como está y solo se documenta el orden vigente. Es una M con dos
decisiones, y **no cabe con nada más**.

## 7. El corte, con los tamaños medidos

| Tramo | Qué | Tamaño | ¿Cabe en un PR? |
|---|---|---|---|
| **6-0** | #1102: la pluma adopta `resolveSnap`, conservando sus 12 px de cierre | S | sí, y va ya |
| **6-1** | Borrar `selectedElasticId` y colgar el resalte del local | XS | sí, va de paso |
| **6-2** | #1129, el tramo en curso congelado (muere `NextPointPanel.tsx`) | S | sí, **y va antes que 6-3** |
| **6-3** | #1112: chips del nodo + «Mover exacto» | M | sí, solo |
| **6-4** | `sujetoActivo` — el selector | M | el selector sí; sus consumidores 2 y 3, no |
| **6-5** | Escape | M + 2 decisiones abiertas | no, y no con nada más |
| **6-6** | #1104 Medir (borrar mediciones, ángulos, persistencia) | M-L | spec propio |
| **fuera** | El resolutor único de enganche | L | spec propio (§ 4) |

La propuesta original metía 6-2, 6-3, 6-4 y 6-5 en un solo «6a». Son cuatro
tramos M/L; llamarlos mudanza no baja el número.

## 8. Lo que NO se hace, y por qué

- **Un `select` de modos para Medir** — segundo escritor del mismo hecho (§ 1).
- **Subir la selección de nodos a Redux** — séptimo campo con bug colgante.
- **Reducir los siete radios a dos** — encoge la pluma contra su ratificación.
- **Un botón flotante para «Borrar mediciones»** — es F1 otra vez; va en la tira.
- **Un chip para el readout «a 3 mm de este punto»** — un chip promete escritura,
  y ahí no hay nada que escribir.
- **Hacer editable una medición ya hecha** — «150» entre dos esquinas de dos
  piezas no tiene respuesta única.

## 9. Los cinco blockers, y en qué quedaron

| # | Blocker | Estado |
|---|---|---|
| 1 | La escalera de Escape se contradice y desconoce a sus 14 dueños | **abierto** — § 6, con la pregunta nombrada |
| 2 | La decisión 10 se apoya en un hecho que caducó | **resuelto** — la decisión cae (§ 1) |
| 3 | Dos clases de `sujetoActivo` no tienen de dónde leerse | **resuelto** — § 3.2 (a) |
| 4 | `borde → nada` convierte Supr en no-op tras usar Margen | **resuelto** — § 3.2 (b) |
| 5 | La escalera omite dos sujetos que la propia propuesta hace visibles | **resuelto** — están en la lista de § 3 |

## 10. Lo que este documento no cierra

- **La gramática de la curva.** Los chips de distancia del nodo no dicen qué
  pasa cuando el tramo vecino es una curva: ¿distancia en línea recta o largo de
  arco? Con `rangoMedibleDeBorde` y el arreglo del 05-09 las dos son calculables;
  cuál se le enseña a María es una decisión de producto.
- **Qué significa que una medición «persista».** ¿Sobrevive al cambio de
  herramienta, al de proyecto, al recargar? Hoy `useEditorInteractions.ts:387`
  las mata al cambiar de herramienta.
- **Tab.** La propuesta le daba dos significados incompatibles en la misma
  tabla (saltar entre chips y alternar modo de apertura).

---

**Insumos.** Propuesta: Petra Haft. Correcciones: Vex Rune (13 cortes),
Plumb Lindgren (8 veredictos), Adrian Serrano (5 blockers, 6 altos, 4 medios).
Censo del código: 2026-09-05. Informe base:
`docs/reports/2026-09-04-revision-adversarial-ui.md` § 4, § 7.1 y § 12.
