# Editar los largos de una pieza que ya existe

> **Estado: decidido sin María, marcado provisional.** Las decisiones de § 3
> salen de sus palabras del 13-09 y del contrato del 08-09, pero ella no las ha
> visto funcionando. Dos decisiones de la revisión asistida del 09-09 se cayeron
> al día siguiente en cuanto ella las probó; esto se escribe para que, si se
> caen, se sepa cuál era la premisa y no haya que reconstruirla.

**Origen:** firma D2 de María del 2026-09-13
(`docs/reports/2026-09-13-seis-firmas-maria.md`), issue #1167. La primera mitad
de esa firma —*que se visualicen los largos*— se cerró en la PR #1166 como
interruptor. Esta es la segunda: **editarlos**.

---

## 1. Lo que pidió, literal

> «el editable de largos me gustaría que apareciera solo cuando uno clica Tab,
> como al crear una línea con pluma en el dibujo libre, y que también al salir
> de crear y volver a clicar la pieza una pudiera editar clicando TAB; pero creo
> que debería ser lo mismo cuando uno clica la línea y la mueve: sin clicar TAB,
> solo arrastrando una línea, el programa entiende que quieres cambiar largos,
> entonces también aparezca el menú. Esas casillas para editar largos son una
> cosa, y que se visualicen los largos de las líneas es otra cosa distinta.»

> «Además piensa que en patronaje pocas piezas son un rectángulo; en verdad las
> piezas van a ser mucho más complejas que un rectángulo. El rectángulo es una
> fase transitoria de la pieza en el desarrollo de la misma.»

---

## 2. Lo que ya estaba escrito — y contesta tres de las cuatro preguntas del issue

El issue abrió cuatro decisiones. La spec del 08-09
(`2026-09-08-contexto-y-control-numerico-design.md`) ya cerró tres, y este
documento **no las reabre**:

| Pregunta del issue | Dónde ya está contestada |
|---|---|
| Al escribir un largo, ¿qué extremo se mueve? | § 3.1: «Cambiar el largo de un tramo → queda FIJO el extremo de partida, se mueve el de llegada». Y § 5: «B fijo, C se mueve sobre BC» |
| ¿Arrastrar un lado es de `Z` o de `Q`? | § 4 (D3): `Z` selecciona e inspecciona, `Q` modifica puntos y tramos. **Y ya está implementado**: en `Q` un clic sobre un lado lo selecciona y arrastrarlo traslada sus dos extremos (`useEditPattern.ts`, `SegmentDrag`). No hay gesto nuevo que inventar |
| Lados curvos: ¿cuerda o arco? | § 3.1: el largo de una curva es su recorrido, y **es de solo lectura** mientras no se decida cómo deformarla |
| Pieza seleccionada + Tab: ¿qué lado? | **Sin contestar.** Es § 3.1 de aquí |

Y la unidad ya está fijada por § 5 (D4): **el lado es el tramo entre dos nodos
consecutivos**, no el borde semántico. Es la misma unidad que ya selecciona el
ratón en `Q`.

---

## 3. Lo que este documento decide

### 3.1 El lado es un sujeto, y tiene dos puertas

Un lado del contorno pasa a ser sujeto de cotas: más específico que la pieza que
lo contiene, menos que un punto. Enseña **una sola caja** con Largo · Ángulo — la
misma pareja, el mismo componente y la misma gramática de Tab que ya tienen la
interna, el trazo y el tramo en curso de la Pluma (§ 14 de cotas vivas).

No entra en la escalera de `cotasDelSujeto` como un peldaño más: la **afina**
desde fuera, con `refinarAlLado`. La diferencia no es de estilo y se explica más
abajo — como peldaño se colaba delante de todos.

Se llega a él de dos maneras, y son las dos que ella nombró:

| Puerta | Gesto | Dónde |
|---|---|---|
| **Tab** | pieza seleccionada, Tab desde el lienzo | **solo `Z`** |
| **Ratón** | clic o arrastre sobre el lado | **solo `Q`** (ya existía; lo que faltaba era la caja) |

**Y en ninguna otra herramienta**, ni al abrirse ni una vez abierto. El sujeto es
el par `(herramienta, objeto)` —§ 2.1 del 08-09— y § 2.2 lo remata: «Herramienta
de creación vs. pieza ya seleccionada → gana **la herramienta**».

Esa fila no estaba en la primera versión de este documento y su ausencia costó
caro: `enfocar` no consultaba `activeTool` **en ninguna línea**, así que la
puerta abría en las ~19 herramientas cuya rama del router no devuelve antes del
Tab. Medido en navegador: con la Pluma activa, la tira decía «Pluma · Editando:
el lado seleccionado» y la caja seguía plantada sobre el lienzo. Y en Medir
—donde § 4 dice, en negrita suya, «ningún gesto modifica geometría»— Tab abría
un campo que escribe geometría.

**Una sola lista de compuertas**, y vive en `admiteLado` (`cotas/sujeto.ts`). La
consultan los dos caminos que la necesitan: el que **dibuja** (`refinarAlLado`) y
el que decide si **Tab abre** (`usePuertaDeLado`). Tenerla dos veces fue el error
de fondo de la primera versión, y las dos copias ya se contradecían en el commit
que las escribió.

**El lado no es un peldaño de la escalera: es un refinamiento.** En `Z` solo
entra donde la pieza ya ganó, así que no puede eclipsar a un punto, a una
interna, a un trazo ni a un margen. En `Q` es hermano del punto: entra cuando no
hay nada más fino elegido. Escrito como peldaño —delante de todos, que es como
nació— un lado enganchado se comía el sujeto de Margen y apagaba el interruptor
«Largos» de María en toda herramienta, sin que ella tocara nada.

**Qué lado abre Tab: el lado recto más cercano a la última posición del ratón
sobre el lienzo.** Y si el ratón nunca entró, el primero del contorno.

«La última posición sobre el lienzo» y no «el puntero»: el ref solo se escribe al
mover el ratón DENTRO del `<svg>`, y no se limpia al salir. En el camino que ella
va a hacer de verdad —clic en la pieza, Tab— eso es el punto del clic, que está
dentro de la pieza y elige el lado que tenga más cerca. Es lo que hay que
prometer, porque es lo que hace.

Por qué el ratón y no «el primero» ni «el último tocado»:

- Es determinista, que es lo que § 2.2 del 08-09 exige («menor distancia;
  determinista, sin azar»). El mismo criterio que ya usa `nearestSegment`.
- No hace falta inventar un recorrido con Tab. Para llegar al lado 3 se mueve el
  ratón y se pulsa Tab: **un Tab por lado**, siempre uno.
- Dentro de la caja, Tab conserva el significado que ya tiene: Largo → Ángulo.
  Si además recorriera lados, la misma tecla haría dos cosas distintas según
  dónde estuviera el foco.

**Tab deja de abrir el Ancho en `Z`.** Hoy Tab con una pieza seleccionada enfoca
el primer chip del DOM, que es «Ancho» de la caja envolvente. Es lo que ella pidió
con todas sus letras —«el editable de **largos**»— y es coherente con su aviso: el
rectángulo es transitorio, y Ancho × Alto es precisamente la caja del rectángulo.

Y la distinción que hizo ELLA —«al **salir** de crear y volver a clicar la
pieza»— sale gratis de la compuerta de herramienta, sin caso especial: mientras
Rectángulo, Círculo o Triángulo estén activas **se está creando**, y ahí Tab sigue
abriendo el Ancho, que es la promesa de #223/#225 y el mando correcto para lo
recién dibujado.

**El precio, dicho, porque no lo cubre ningún precedente.** La primera versión de
este documento defendió la puerta diciendo que los chips de Ancho y Alto ya
escriben geometría desde `Z`. Es cierto y no sirve: `resizePieceTo` **transforma
el objeto entero**, que es justo lo que § 4 le concede a `Z` («arrastrar el cuerpo
recoloca la pieza entera»); mover un nodo del contorno es literalmente lo que § 4
le asigna a `Q`. Así que esto **ensancha `Z`**, de «transformar el objeto» a
«editar la geometría que lo define».

Se hace porque lo pidió ella, en esas palabras, y queda dicho aquí para que sea
una excepción firmada y no la próxima regla tácita. Lo que la hace tolerable es
que no toca la gramática del RATÓN: ningún arrastre desde `Z` deforma nada, y la
diferencia observable entre seleccionar y editar —su queja reincidente— sigue en
pie. Si al verlo dice que `Z` volvió a ser «multifunción», la puerta se muda a `Q`
y esta sección se reescribe.

### 3.2 Los lados curvos no tienen caja

`segmentPolar` solo produce largo y ángulo de tramos **rectos**, y así se queda
(§ 3.1 del 08-09: el largo de una curva es de solo lectura). Consecuencias
dichas en voz alta:

- Tab busca el lado recto más cercano; **salta los curvos**. Si la pieza no
  tiene ningún lado recto, Tab se comporta como hoy (enfoca el primer chip).
- El largo de un lado curvo se sigue leyendo con el interruptor «Largos», que
  mide el recorrido y no la cuerda (`lineLengthLabelsData`). Ver no exige
  editar, ni al revés: es la separación que ella pidió.

### 3.3 En pantalla se llama «tramo», aunque en el código se llame «lado»

El contrato de interfaz § 5 pide **un término por concepto**, y la app ya llama
«tramo» a esta misma unidad: la tira dice «Editando: el tramo seleccionado» para
una interna y para un trazo desde antes de esto. § 5 del contrato del 08-09 usa
la misma palabra para el contorno. Así que la tira dice **tramo**, y no estrena
una segunda palabra para lo mismo.

En el código se llama `lado` a propósito: es la palabra de María y la del issue,
y quien lea `ladoDelHit` dentro de seis meses la va a buscar por ahí.

### 3.4 Editar no enciende ni apaga el interruptor

«Esas casillas para editar largos son una cosa, y que se visualicen los largos
de las líneas es otra cosa distinta.» El sujeto no consulta `lineLengthMode`.

Al revés sí hay una regla, y es la que ya existe: con un sujeto **más fino**
dentro de la pieza, las lecturas de todos los lados se callan para no
sobresaturar (§ 5.1 del 08-09, «tramo BC seleccionado → **una** cota»). Un lado
seleccionado entra en esa lista, junto al punto y a la interna.

---

### 3.5 Qué suelta el lado

*La pregunta que el documento evitaba: ¿el lado es una «edición pendiente» a
efectos de § 2.3 del 08-09, o una selección?*

**Es una sub-selección**, como el punto elegido en `Q` o el tramo de una interna.
No es una edición pendiente: no hay valor a medio escribir hasta que se abre el
campo, y de ese campo ya se ocupa `CotaChip` (Enter aplica, Escape y el blur
descartan). Así que § 2.3 gobierna el **campo**, y el lado se rige por § 2.4: «se
recupera volviendo a seleccionar el sujeto; no hay estado escondido».

De ahí, lo que lo suelta:

| Pasa esto | El lado |
|---|---|
| Escape con la caja a la vista | se suelta, y consume **un** Esc |
| Escape con la caja tapada (menú contextual abierto) | **no** se suelta ni consume: el Esc es del menú |
| Cambia la herramienta | se suelta (`admiteLado` deja de admitirlo) |
| Se deselecciona la pieza, o se selecciona otra | se suelta |
| Se borra la pieza, se oculta o se bloquea su capa | se suelta |
| Se elige una interna, un trazo, un punto o un margen | se suelta: lo más fino manda |
| **Cambia la estructura del contorno** (un punto insertado, un deshacer) | se suelta |
| **Ese lado se vuelve curvo** (curva por puntos) | se suelta |
| Se mueve un nodo — escribir su propio largo, sin ir más lejos | **se queda** |

Las dos filas en negrita son la lección que este repo ya tenía escrita y que esta
puerta no heredó: un `commandIndex` es un nombre **prestado**, y `resyncStateToPiece`
lo dice sin rodeos — «a surviving index would silently denote different geometry».
Validar la PIEZA no basta; hay que validar el LADO. Sin esas dos filas, Tab abría
el lado 3, un punto insertado corría los índices, y Enter escribía sobre otro lado
sin que nada en pantalla cambiara de aspecto.

Y una consecuencia que conviene decir en voz alta: **con el lado a la vista, Ancho
y Alto no están en pantalla.** Se recuperan con Escape. La primera versión de este
documento decía que «siguen en pantalla y se siguen clicando», y era falso.

## 4. Cuatro huecos que este trabajo destapó

Ninguno lo pedía el issue. Los cuatro salieron de mirar el productor compartido
—`segmentPolar` y su escritor— que este cambio estrenaba como tercer consumidor.

### 4.1 El lado de cierre no existía

`segmentPolar` solo emitía tramo cuando el comando era una `L`. El lado de
**cierre** de un contorno cerrado no es una `L`: es la `Z`, que vuelve al ancla de
la `M`. O sea que en un rectángulo `M L L L Z` —el contorno más común que existe—
el cuarto lado no tenía ni largo ni ángulo.

Es el mismo hueco que ya costó una vez: #1120, el lado izquierdo de un rectángulo
sin etiqueta de largo, porque su consumidor no traducía la convención del
productor. Se arregla en `segmentPolar`, que es donde está la causa.

**Convención:** el tramo de cierre lleva como `toCommandIndex` el índice de la `M`
que abre su subtrazo —el par final de esa `M` **es** el nodo que se mueve— y como
`drawCommandIndex` el de la `Z`. Los dos hacen falta y no son el mismo número; ver
4.3. La convención de `nearestSegment` (el índice de la `Z`) se traduce al leer,
con `ladoDelHit`.

### 4.2 Los tramos de largo cero del DXF de María

El DXF que ella exporta de CLO trae el vértice **repetido en cada esquina**. Cada
duplicado es un tramo de 0 mm, y `segmentPolar` los emitía como lados de pleno
derecho: una caja que dice «0,0 mm» —por debajo de su propio mínimo de 0,1— con un
ángulo de 0° que `atan2(0,0)` se inventa, y que al escribirle 250 arrastraría la
esquina 250 mm a la derecha por un rumbo que nadie trazó. Y `applyNodeMove` mueve
el grupo de anclas coincidentes, así que se llevaría la esquina entera.

La lección estaba escrita en los dos archivos vecinos —`nodo.ts` («una cota de
“0,0 mm” que no se puede mover es peor que ninguna») y `angleReference.ts` («never
let `atan2(0,0)` invent a reference»)— y la delató la asimetría del propio código:
la guarda estaba puesta en la rama de la `Z`, la única que un test obligó a mirar,
y no en la de la `L`, que ningún test tocaba. Ahora es una sola guarda para las
dos, en `tramo()`.

Ninguna de las suites nuevas lo veía, y no por casualidad: `addPiece` y los
rectángulos sintéticos traen anclas ÚNICAS. Es el mismo hueco de fixture que
`1112-mover-el-punto-con-numero.spec.ts` ya dejó escrito. Ahora hay un contorno con
esquinas duplicadas en `sujeto.lado.test.ts`.

### 4.3 El ángulo del lado de cierre mentía la mitad de las veces

La referencia angular se busca preguntando «qué hay ANTES de este comando».
Preguntándolo por el comando que se MUEVE, el lado de cierre pregunta por la `M`
—índice 0— y no hay nada antes: caía a la referencia absoluta. Resultado en un
rectángulo: dos lados decían «al tramo» y dos «al eje». Y no es cosmético, porque
`absoluteAngle` usa esa referencia: **el mismo número escrito daba geometría
distinta según el lado**. Por eso `PolarSegment` lleva ahora los dos índices.

### 4.4 Y un cuarto, de propina: el manejador que se quedaba varado

`copiaConNodoFinal` movía el ancla y dejaba quieto el control de salida del
comando siguiente. Para una interna con una curva detrás de un tramo recto, eso
tuerce la tangente en silencio — y el lado de cierre lo volvía alcanzable de una
forma nueva, porque el primer comando de una interna cerrada suele ser una `C`.

La ley ya estaba escrita dos veces: `copiaConExtremo` («si lo que sale de M es una
curva, su control de salida viaja con el mismo delta para no torcer la tangente») y
`applyNodeMove`, que lo hace para el contorno. Ahora `copiaConNodoFinal` también.
La primera versión de este documento despachaba todo esto en una línea —«es la
misma corrección, no una función nueva»— y no lo era.

### 4.5 El censo, que vale más que los cuatro arreglos

Los tres primeros huecos tienen la misma forma y no es casualidad: **el arreglo
llega hasta donde llega la mirada, y la mirada la dirige el test que ya existe.**
La guarda de largo cero estaba puesta en la rama de la `Z` —la única que un test
me obligó a mirar— y no en la de la `L`, que ningún test tocaba.

El mismo día, el trinquete `scripts/medir-bordes-lint.mjs` (#1143) nació con esta
cabecera sobre otro archivo y otro autor: «el defecto se arregló **cuatro veces**
entre 2026-09-06 y 2026-09-18, y las tres primeras solo tocaron los sitios que
alguien miraba ese día».

Así que aquí va el censo de cada mecanismo, entero, no solo las ramas con test:

| Mecanismo | Sitios | Estado |
|---|---|---|
| **Emitir tramo por comando** | `segmentPolar` (`L`, `Z`) | las dos ramas, una sola guarda en `tramo()` |
| | `M`, `C`, `Q` | sin tramo a propósito: § 3.2, el largo de una curva es de solo lectura |
| | `H`, `V`, `A`, `S`, `T` | sin tramo; y `COMANDOS_SOPORTADOS` ya rechaza esos contornos enteros (§ 4.4) |
| | `trazos/trazoPath.ts` `rectasDe` | **mismo patrón, no tocado.** Es de CRUCES entre trazos, no de cotas, y su spec ya excluye las curvas. Un trazo cerrado no cruzaría por su lado de cierre; queda dicho, sin arreglar |
| **Mover un ancla y arrastrar su control** | `copiaConNodoFinal` | arreglado aquí |
| | `copiaConExtremo` | ya lo hacía |
| | `applyNodeMove` / `moveOneCommand` | ya lo hacía |
| **Traducir la `Z` a su `M`** | `nearestSegment` | la produce (índice de la `Z`), y solo la de la PRIMERA |
| | `semanticEdges.ts` `indiceSegunLosBordes` | retrocede hasta la `M` del subtrazo. **Correcta, y ya existía** |
| | `lado.ts` `ladoDelHit` | ya no la reimplementa: llama a la de arriba |
| | `useEditPattern.ts:424` | la clava a `0` — **consistente** con lo que el productor emite hoy, así que arreglarlo solo no arregla nada |
| | — | la causa real está arriba: `nearestSegment` trata dos subcaminos como uno. **Reproducido y abierto en #1205** |

**El censo ya pagó**: la traducción `Z`→`M` tenía CUATRO copias y yo iba a dejar
una quinta. `indiceSegunLosBordes` estaba escrita desde el 2026-09-06 con lo que
costó su ausencia —«clicar el lado IZQUIERDO con Elástico o con Pliegue no hacía
absolutamente nada»— y no tenía test propio. Ahora `ladoDelHit` la llama en vez de
repetirla, y el caso de dos anillos que nadie fijaba está en `lado.test.ts`.

Lo que este censo NO cubre, dicho: un archivo que traduzca bien en un sitio y mida
crudo en otro con el rango desestructurado en variables. Es el mismo hueco que
`medir-bordes-lint.mjs` declara aceptar, y por la misma razón: la forma que se
copia y se pega es la primera.

## 5. Lo que NO se hace

- **No se toca la gramática del ratón de `Z`.** Ningún arrastre nuevo, ninguna
  pieza que se deforme al arrastrarla. D3 sigue en pie.
- **No se inventa la cota de desplazamiento** del arrastre de un lado (decisión
  5 de la gramática de la tanda 6, todavía sin implementar). Durante el arrastre
  las cotas se callan, como ya se callan hoy; al soltar, el lado queda
  seleccionado y su caja está ahí. Eso es lo que ella pidió ver: «entonces
  también aparezca el menú».
- **No se recorre el contorno con Tab.** § 3.1.
- **No se resuelve el largo de una curva.** § 3.2.
- **No se migra la selección de tramo a Redux.** Vive en el hook, como el punto y
  el tramo en curso, y llega al sujeto como argumento.
- **No se arreglan los contornos de varios subtrazos.** `nearestSegment` rotula
  el cierre con la PRIMERA `Z` y solo mide una cuerda de cierre, así que un
  contorno de dos anillos ya era inalcanzable para el ratón antes de esto.
  `ladoDelHit` traduce bien igualmente; lo que no se hace es arreglar la fuente.
- **No se unifica la traducción `Z`→`M`.** `useEditPattern` la hace en línea con
  un `0` fijo. Sobre un contorno de un subtrazo las dos coinciden; separarlas en
  una función compartida es la tanda que arregle lo de arriba, no esta.

---

## 6. La red

jsdom no ve layout, ni apilamiento, ni propagación real de teclas; lo de aquí se
prueba en navegador. Las tres pruebas de aceptación, dichas como las diría ella:

1. **darle 250 mm a un lado sin calcular nada** — `Z`, clic en la pieza, el ratón
   sobre el lado de abajo, Tab, escribir `250`, Enter → ese lado mide 250 mm, el
   extremo de partida no se movió y los demás lados siguen donde estaban.
2. **el lado que agarré es el que se edita** — `Q`, arrastrar un lado y soltar →
   su caja está ahí, con su largo y su ángulo, y es la única.
3. **el cuarto lado del rectángulo también** — un rectángulo, el ratón sobre el
   lado de cierre, Tab → la caja sale con el largo de ESE lado.

Cada una admite Esc antes de confirmar y un solo deshacer después.

Y las que la revisión adversarial obligó a añadir, todas en
`tests/e2e/1167-editar-los-largos-de-la-pieza.spec.ts`:

- **el camino de verdad**: clicar la pieza y pulsar Tab **sin mover el ratón**.
  Los otros casos lo colocan sobre el lado justo antes; este es el que ella hará.
- **en Medir, Tab ni abre ni se traga la tecla.**
- **el lado no sobrevive al cambio de herramienta.**
- **con el menú contextual abierto, Escape cierra el menú** y no el lado.
- **con la pieza bloqueada, Tab no se traga la tecla** — medido con
  `defaultPrevented`, no contando cajas: «se tragó la tecla y no abrió» y «siguió
  su camino y no abrió» dan el mismo cero, y un oráculo que no distingue los dos
  pasa en verde con el fallo dentro.
- **al salir de crear y volver a clicar la pieza**, Tab ya abre el lado.

## 7. Registro

- **2026-09-18** — escrito para #1167. Tres de las cuatro decisiones abiertas del
  issue ya estaban en la spec del 08-09 (§ 2); la única nueva es qué lado abre
  Tab (§ 3.1). Los cuatro huecos de `segmentPolar` (§ 4) los destapó la
  implementación, no el issue.
- **2026-09-18, revisión adversarial** (Voronov + Serrano) sobre la primera
  versión, ya implementada. Seis hallazgos entraron en el documento y cambiaron
  el diseño, no solo el código:
  1. La puerta no consultaba la herramienta en ninguna línea (§ 3.1). Era un
     BLOCKER: Medir escribía geometría.
  2. El lado nació como peldaño de la escalera y eclipsaba a Margen, a la interna
     y al trazo; pasa a ser un **refinamiento** (§ 3.1).
  3. Las compuertas estaban escritas dos veces y ya se contradecían; ahora hay una
     sola, `admiteLado` (§ 3.1).
  4. El Escape corría en captura con `stopPropagation` y se comía el del menú
     contextual — la regresión que `useEditorInteractions` documenta haber pagado
     en #1115 (§ 3.5).
  5. Un `commandIndex` sobrevivía a los cambios de contorno y denotaba otro lado
     en silencio (§ 3.5).
  6. La defensa de «esto ya se hacía desde `Z`» era falsa: `resizePieceTo`
     transforma el objeto entero, y mover un nodo no. La excepción pasa a estar
     firmada por María, no justificada por un precedente (§ 3.1).
