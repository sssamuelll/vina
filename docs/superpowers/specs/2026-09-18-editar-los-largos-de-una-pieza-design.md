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

Un lado del contorno pasa a la escalera del sujeto (`cotas/sujeto.ts`), debajo
del punto y por encima de la pieza: más específico que la pieza que lo contiene,
menos que un punto. Enseña **una sola caja** con Largo · Ángulo — la misma
pareja, el mismo componente y la misma gramática de Tab que ya tienen la
interna, el trazo y el tramo en curso de la Pluma (§ 14 de cotas vivas).

Se llega a él de dos maneras, y son las dos que ella nombró:

| Puerta | Gesto | Dónde |
|---|---|---|
| **Tab** | pieza seleccionada, Tab desde el lienzo | `Z`, `A`, y las tres de crear figura |
| **Ratón** | clic o arrastre sobre el lado | `Q` (ya existía; lo que faltaba era la caja) |

**Qué lado abre Tab: el lado recto más cercano al puntero.** Y si el puntero
nunca entró al lienzo, el primero del contorno.

Por qué el puntero y no «el primero» ni «el último tocado»:

- Es determinista, que es lo que § 2.2 del 08-09 exige («menor distancia;
  determinista, sin azar»). El mismo criterio que ya usa `nearestSegment`.
- No hace falta inventar un recorrido con Tab. Para llegar al lado 3 se mueve el
  ratón y se pulsa Tab: **un Tab por lado**, siempre uno.
- Dentro de la caja, Tab conserva el significado que ya tiene: Largo → Ángulo.
  Si además recorriera lados, la misma tecla haría dos cosas distintas según
  dónde estuviera el foco.

**Tab deja de abrir el Ancho.** Hoy Tab con una pieza seleccionada enfoca el
primer chip del DOM, que es «Ancho» de la caja envolvente. Ancho y Alto siguen
en pantalla y se siguen clicando; lo que cambia es que dejan de ser lo primero
del camino de teclado. Es lo que ella pidió con todas sus letras —«el editable
de **largos**»— y es coherente con su aviso: el rectángulo es transitorio, y
Ancho × Alto es precisamente la caja del rectángulo.

### 3.2 Los lados curvos no tienen caja

`segmentPolar` solo produce largo y ángulo de tramos **rectos**, y así se queda
(§ 3.1 del 08-09: el largo de una curva es de solo lectura). Consecuencias
dichas en voz alta:

- Tab busca el lado recto más cercano; **salta los curvos**. Si la pieza no
  tiene ningún lado recto, Tab se comporta como hoy (enfoca el primer chip).
- El largo de un lado curvo se sigue leyendo con el interruptor «Largos», que
  mide el recorrido y no la cuerda (`lineLengthLabelsData`). Ver no exige
  editar, ni al revés: es la separación que ella pidió.

### 3.3 Editar no enciende ni apaga el interruptor

«Esas casillas para editar largos son una cosa, y que se visualicen los largos
de las líneas es otra cosa distinta.» El sujeto no consulta `lineLengthMode`.

Al revés sí hay una regla, y es la que ya existe: con un sujeto **más fino**
dentro de la pieza, las lecturas de todos los lados se callan para no
sobresaturar (§ 5.1 del 08-09, «tramo BC seleccionado → **una** cota»). Un lado
seleccionado entra en esa lista, junto al punto y a la interna.

---

## 4. Un hueco que este trabajo destapa: el lado de cierre

`segmentPolar` recorre los comandos y solo emite tramo cuando el comando es una
`L`. El lado de **cierre** de un contorno cerrado no es una `L`: es la `Z`, que
vuelve al ancla de la `M`. O sea que en un rectángulo `M L L L Z` —el caso más
común que existe— el cuarto lado no tendría caja.

Es el mismo hueco que ya costó una vez: #1120, el lado izquierdo de un
rectángulo sin etiqueta de largo, porque su consumidor no traducía la convención
del productor. Se arregla en `segmentPolar`, que es donde está la causa, y no en
el consumidor nuevo.

**Convención:** el tramo de cierre lleva como `toCommandIndex` el índice de la
`M` que abre su subtrazo — porque el par final de esa `M` **es** el nodo que se
mueve, que es lo que ese campo significa. La convención de `nearestSegment` (el
índice de la `Z`) se traduce al leer, no al escribir.

Efecto colateral, dicho: una línea interna cerrada gana la caja de su lado de
cierre. Es la misma corrección, no una función nueva.

---

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
  el tramo en curso, y llega a la escalera del sujeto como argumento.

---

## 6. La red

jsdom no ve layout ni apilamiento; lo de aquí se prueba en navegador. Tres
pruebas de aceptación, dichas como las diría ella:

1. **darle 250 mm a un lado sin calcular nada** — `Z`, clic en la pieza, el ratón
   sobre el lado de abajo, Tab, escribir `250`, Enter → ese lado mide 250 mm, el
   extremo de partida no se movió y los demás lados siguen donde estaban.
2. **el lado que agarré es el que se edita** — `Q`, arrastrar un lado y soltar →
   su caja está ahí, con su largo y su ángulo, y es la única.
3. **el cuarto lado del rectángulo también** — un rectángulo, el ratón sobre el
   lado de cierre, Tab → la caja sale con el largo de ESE lado.

Cada una admite Esc antes de confirmar y un solo deshacer después.

---

## 7. Registro

- **2026-09-18** — escrito para #1167. Tres de las cuatro decisiones abiertas del
  issue ya estaban en la spec del 08-09 (§ 2); la única nueva es qué lado abre
  Tab (§ 3.1). El hueco del lado de cierre (§ 4) lo destapó la implementación, no
  el issue.
