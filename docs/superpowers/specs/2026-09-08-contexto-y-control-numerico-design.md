# Contexto de pieza y control numérico — el contrato que faltaba

> **Enmienda 2026-09-13:** [implementación integrada de las seis firmas](../../reports/2026-09-13-seis-firmas-maria.md). Se ejecuta la salida al ratón de §3.3; la pareja acepta navegación por clic y Tab sin perder medidas. El ángulo relativo usa un único helper. Los estados históricos de implementación del cuerpo se conservan como antecedente.

**Origen:** reunión María + Samuel del 2026-09-07 ([informe](../../reports/2026-09-07-reunion-maria.md)), causas A, B, D, E y G. Y la junta del 2026-09-08 ([acta](../../reports/2026-09-07-junta-consejo.md)), donde Serrano marcó dos BLOCKER de especificación y Haft entregó la gramática.

**Qué cierra este documento:** los dos huecos que impedían implementar lo que Samuel prometió de palabra en la reunión. No es un rediseño: es escribir el contrato que ya se debía.

> **Estado: decidido, sin implementar.** Este repo tiene ya dos casos de una decisión escrita que nadie ejecutó (la sustitución de la cota, § 9 de la spec del 30-08; el enganche de Medir, D1 de la del 06-09) y en los dos la deuda se pagó en confusión de la usuaria meses después. Si esto no se implementa, que sea una decisión dicha, no un olvido.

---

## 0. Lo que ella pidió, en sus palabras

| Causa | Lo que dijo | Cuántas veces |
|---|---|---|
| **D** contexto | *"esas barras y el cuadro para la medida ocupa espacio […] que no se quede ahí pegado todo el rato"* [02:31] | 4 momentos |
| **B** control numérico | *"si lo quiero mover 10 milímetros tengo que calcularlo yo así a mano"* [05:17] | 6 quejas, 4 herramientas |
| **E** frontera | *"no sé cuál es la diferencia entre el de editar y el de seleccionar"* [23:19] | 3, y **reincidente** desde el 30-08 |
| **G** granularidad | *"o se clican todas o se clica solo la que estoy clicando"* [23:54] | 1, extensa |
| **A** la cota se toca | *"no puedes seleccionarla, deberías poder seleccionarla […] es un error de la interfaz"* [19:05] | 5 momentos |

Y la promesa de Samuel, [05:55]:

> *"La diferencia entre nosotros y CLO es que nosotros vamos un paso más adelante. En vez de desplegar un menú, vamos a desplegar las opciones del contexto dentro de la edición de la pieza. […] **Eso lo vamos a hacer.**"*

---

## 1. El límite que gobierna todo esto

Voronov, en la junta, y conviene tenerlo escrito porque explica por qué el contrato es como es:

> **Ningún sistema puede distinguir con certeza intenciones que producen el mismo estado observable.**

Una pieza seleccionada admite medirla, moverla, transformarla, editarle un borde o construirle una interna. Su identidad reconoce el **objeto**; no concluye la **acción**. Por eso el contexto **no puede derivarse de la pieza**.

De ahí la primera decisión, que es la que hace posibles todas las demás:

**La herramienta activa ES la declaración de intención.** El sujeto dice sobre qué; la herramienta dice qué. El contexto es el par, nunca uno solo.

Y por eso el clic derecho de María no sobra: es **una señal explícita** de que quiere precisión ahora. Samuel vetó el menú, no la señal (§ 3.2).

---

## 2. D1 — El sujeto y el contexto

*Cierra el BLOCKER H1 de Serrano: "el contexto de pieza carece de sujeto operativo y reglas de transición".*

### 2.1 Qué es un contexto

Un contexto es `(herramienta, sujeto, fase)`. La tira lo enuncia en una línea y ofrece sus mandos; nada más aparece flotando sobre el patrón salvo las cotas del sujeto, que son parte del objeto.

| Contexto | Se entra | Qué enseña | Se sale (Esc) |
|---|---|---|---|
| **Sin sujeto** | inicio; selección vacía | herramienta y qué necesita | en `Z`, nada; en otra, vuelve a `Z` |
| **Pieza** | clic en el cuerpo con `Z` | identidad y acciones de pieza | clic en vacío o Esc |
| **Varias piezas** | Shift+clic o marco | cuántas y qué operaciones comparten | Esc vacía |
| **Edición de pieza** | `Q`, o doble clic desde `Z` | puntos y bordes de ESA pieza | Esc vuelve a `Z` conservando la pieza |
| **Punto** | clic en un punto con `Q` | cotas de sus vecinos inmediatos | Esc suelta el punto, sigue en `Q` |
| **Tramo** | clic en un tramo con `Q`; interna también con `Z` | la cota del tramo y sus operaciones | Esc suelta el tramo |
| **Tamaño** | `A`, o crear un rectángulo | manejadores y dimensiones | confirmar termina; Esc cancela lo pendiente |
| **Creación** | `H`, `G`, Punto | solo referencias y la medida de lo que se crea | Esc cancela el paso; otro Esc, el trazo |
| **Medición** | `M` y una referencia | referencias resaltadas y resultado | Esc cancela la pendiente; sin pendiente vuelve a `Z` |
| **Gesto vivo** | arrastre ≥ 4 px | **solo la magnitud que está cambiando** | soltar confirma; Esc revierte |
| **Entrada numérica** | Tab, clic derecho durante el gesto, o clic en una cota | campo enfocado, geometría congelada | Enter aplica; Esc descarta |
| **Entidad** | seleccionar piquete, hilo, pinza, costura | sus mandos propios | Esc suelta |

### 2.2 Quién gana cuando dos podrían aplicar

Esta tabla es el corazón del contrato: sin ella, "mostrar lo del contexto" es una frase.

| Competencia | Gana | Por qué |
|---|---|---|
| Campo numérico en edición vs. cualquier selección | **el campo** | conserva sujeto y foco: escribir no puede perder el objeto |
| Arrastre vs. lo que aparezca debajo | **el sujeto fijado en la pulsación** | el objeto se decide al apretar, no al mover |
| Herramienta de creación vs. pieza ya seleccionada | **la herramienta** | y desaparecen las cotas externas mientras dibuja [18:00] |
| Punto vs. tramo, dentro de 8 px | **el punto** | es el blanco más pequeño y el más frecuente |
| Dos tramos elegibles | menor distancia; empate: el seleccionado, luego orden de dibujo | determinista, sin azar |
| Piezas superpuestas | la de encima; en `Q`, la que se está editando | no se roba el modo |
| **Hover vs. selección** | **la selección, siempre** | el hover anticipa, **nunca** cambia de contexto. Demora para cambiar por hover: **nunca** |
| Objeto borrado, oculto o bloqueado durante una edición | se cancela lo pendiente y sus mandos desaparecen | ver § 2.3 |

### 2.3 Qué pasa con una edición pendiente al cambiar de contexto

*La pregunta exacta que Serrano señaló como no especificada.*

**Se cancela y se revierte. Nunca se confirma en silencio.**

| Situación | Qué ocurre |
|---|---|
| Cambia la herramienta con un campo abierto | se descarta el valor; la geometría vuelve a lo de antes del gesto |
| Clic fuera del campo | cancela, **y ese clic se consume**: no inicia otro gesto |
| Se suelta el botón después de haber congelado con Tab o derecho | **no confirma** |
| Mover el ratón mientras se escribe | **no altera la geometría** |
| Pérdida de ventana, `pointercancel` | cancela lo pendiente |
| El objeto desaparece mientras se edita | cancela; no se aplica a un sujeto que ya no existe |

**Un Esc consume un solo nivel**, y la salida directa siempre está a la vista en la tira: activar `Z` cancela lo pendiente y vuelve al principio sin recorrer la escalera.

### 2.4 Cómo se recupera un mando retirado

Volviendo a seleccionar el sujeto. No hay estado escondido: si el mando no está, es porque su sujeto no está.

---

## 3. D2 — El control numérico

*Cierra el BLOCKER H2 de Serrano: "el control numérico no tiene contrato geométrico". Mover un punto 10 mm, alargar una línea hasta 500 mm y poner un punto a 50 mm de otro **son tres operaciones distintas**, y un campo que acepta el número pedido puede producir otra geometría.*

### 3.1 El contrato geométrico, operación por operación

| Operación | Origen y dirección | Qué queda FIJO | Campo inicial | Enter hace |
|---|---|---|---|---|
| Mover un punto en `Q` | posición previa al arrastre → dirección trazada | los vecinos | **desplazamiento** | mueve exactamente esa distancia |
| Mover varios en `Q` | vector común desde sus posiciones iniciales | el resto de la pieza | **desplazamiento** | aplica el mismo vector a todos, una vez a cada nodo |
| Próximo tramo recto en `H`/`G` | último nodo → cursor | los nodos ya puestos | **longitud** | coloca el siguiente extremo |
| Insertar Punto sobre un borde | extremo de referencia → recorrido **sobre ese borde** | el borde | **distancia sobre el borde** | inserta el punto |
| Cambiar el largo de un tramo | extremo fijo → extremo móvil | **el extremo fijo** | **longitud** | mueve el extremo móvil |
| Ajustar un asa de curva | ancla → dirección del asa | el ancla | **longitud del asa** | ajusta el asa; **no** se presenta como largo de curva |

**Dos precisiones que evitan mentiras:**

- En una curva, los 50 mm de un Punto se recorren **sobre la curva**, no en línea recta.
- El largo de una curva es su **recorrido**, no la cuerda entre extremos. Mientras no se decida cómo deformarla al escribirlo, esa cota es **de solo lectura**. Enseñar una cuerda llamándola largo de curva sería el defecto de la caja envolvente otra vez.

### 3.2 El gesto, y el precio del hábito de CLO

**Principal:** orientar con el ratón → `Tab` → escribir la distancia → `Enter`.
**El acceso de María:** orientar → **clic derecho** → escribir → `Enter`.

> El clic derecho **enfoca la cota que ya acompaña al gesto**. No abre una lista, ni un diálogo, ni una segunda superficie flotante.

Así se cumplen las dos cosas a la vez: ella conserva el momento y el botón que sus manos ya saben de CLO3D (lo citó cuatro veces), y Samuel cumple su *"en vez de desplegar un menú"*. **El precio, dicho en voz alta:** aprende **cero botones nuevos** y **una ubicación nueva** para escribir — la cota, en vez del diálogo.

Y no es maquinaria nueva: Pluma e Internas **ya** congelan el tramo con `Tab` y enfocan su cota (`usePenTool.ts`, `usePolyPenTool.ts`, cotas vivas § 5.4 / #1129). Esto lo extiende a mover puntos y a Punto.

**Lo que cambia de hoy:** el derecho durante `H`/`G` hoy se suprime; pasa a enfocar la magnitud activa. En Rectángulo, Coser, Piquete y Margen **conserva su cancelación actual** — no se le asigna precisión a herramientas fuera de este contrato.

### 3.3 El ángulo es opcional de verdad

*Su restricción, literal: "el ángulo tiene que ser una opción no obligatoria, porque hay gente que no dibuja con ángulos" [16:43].*

| Situación | Default | Salida |
|---|---|---|
| Ya hay dirección del ratón | se conserva **con su precisión interna**; solo se enfoca la distancia | `Tab` desde distancia revela y enfoca el ángulo |
| Escribe solo `500` | Enter coloca a 500 mm en esa dirección | Esc cancela |
| Quiere cambiar a `−90°` | escribe `500`, `Tab`, `−90`, Enter | `Shift+Tab` vuelve a distancia |
| Recorrido < 4 px: no hay dirección fiable | se acepta la distancia, **no se inventa un rumbo** | orientar ≥ 4 px, o escribir el ángulo a propósito |
| Punto restringido a un borde | manda el borde; **no aparece ángulo** | cambiar el extremo de referencia |

Su otra restricción, [16:51]: *"si marcas ya una distancia antes de clicar al derecho, tiene que sobreentender que quieres seguir esa distancia"* — por eso la dirección trazada es **dato de entrada**, no algo que haya que reescribir.

Y después de confirmar un tramo, **el siguiente vuelve a seguir al ratón**: no hereda longitud ni ángulo bloqueados sin que ella los vuelva a pedir.

### 3.4 Precedencia, cuando varias restricciones piden cosas distintas

**valor numérico explícito → ángulo explícito → `Shift` mantenido → enganche → ratón libre.**

- `Shift` restringe a múltiplos de **45°**, solo mientras se mantiene.
- `Ctrl` suspende el enganche, sin desactivar una restricción angular explícita.
- **Un imán a 499,8 mm no corrige una entrada de 500 mm.** El número escrito manda sobre la geometría cercana.
- Se aceptan coma y punto decimal. Longitud nueva mínima **0,1 mm**; desplazamiento cero es operación sin cambio. Un valor inválido **se queda editable** y nunca se recorta en silencio.

---

## 4. D3 — La frontera entre Seleccionar y Editar

*Causa E. Reincidente: la misma queja está en la ronda del 30-08 (min 12:48). Dos rondas seguidas significa que no se arregla con copy.*

| Herramienta | Qué permite |
|---|---|
| **Seleccionar `Z`** | seleccionar e inspeccionar; arrastrar el cuerpo **recoloca la pieza entera** |
| **Editar patrón `Q`** | modificar puntos y tramos, del contorno y de las internas |
| **Editar curva `V`** | modificar asas |
| **Transformar `A`** | escalar y rotar por sus manejadores |
| **Creación** | crear su objeto; las piezas existentes son anfitrionas o referencia |
| **Medir `M`** | obtener medidas; **ningún gesto modifica geometría** |

**El precio, dicho:** deformar algo desde `Z` pasa a costar pulsar `Q` o hacer doble clic. Ese paso compra lo que ella pidió — una diferencia **observable** entre seleccionar y editar. Hoy los extremos de internas se arrastran desde `Z` y ciertos clics entran en edición (`useEditorInteractions.ts:848`), y por eso *"este botón está multifunción"*.

---

## 5. D4 — La granularidad del tramo

*Causa G.*

**La unidad seleccionable es el tramo entre dos nodos consecutivos.** Vale igual para los trazos (líneas de construcción, spec 2026-09-12 § 5.2). El gesto que creó varios tramos **no forma un grupo de selección**.

> **Enmienda 2026-09-14 (#1154).** De la frase de arriba se dedujo una vez, en
> la tanda del 09-09, que al cerrar el trazo había que dejar seleccionado el
> ÚLTIMO tramo. No se sigue, y nadie lo firmó. Cerrar un trazo **no selecciona
> nada**: la cota de ese tramo se plantaba bajo el cursor, justo donde iba el
> clic siguiente — María, 10-09 [09:32], *"el zoom este me está molestando
> mucho, porque se pone esto aquí"*. Esta sección dice qué unidad se selecciona
> CUANDO se selecciona; no dice que dibujar seleccione. Los trazos ya lo tenían
> bien (spec 2026-09-12 § 4).

```
A ───────── B ───────── C ───────── D
      AB          BC          CD

clic en BC        → BC
clic en B con Q   → B
Shift+clic en CD  → BC + CD
```

Tres líneas seleccionables y cuatro puntos, aunque se dibujaran de una vez.

**Esto NO exige migrar el almacenamiento.** El `path` sigue siendo uno; lo que cambia es que la selección deja de ser `{pieceId, lineId}` (`editorSlice.ts:118`, demasiado gruesa) y gana el tramo. Serrano avisó de esto y tiene razón: *"se puede justificar una modificación del modelo de datos a partir de una expectativa de selección"*. No se hace.

| Intención | Default |
|---|---|
| seleccionar un tramo | clic selecciona **solo el tocado** |
| seleccionar varios | Shift+clic añade o quita |
| seleccionar todas las internas de la pieza | acción **explícita** en su contexto |
| mover BC | `Q` + arrastre traslada B y C |
| cambiar el largo de BC | B fijo, C se mueve sobre BC; un mando invierte cuál queda fijo |
| borrar BC | Supr borra **solo BC**; deshacer lo recupera |
| cruzar dos líneas | el cruce **no** crea unión: unir es una acción explícita |

Un nodo compartido sigue compartido: mover B cambia AB y BC, y la previsualización **resalta las dos como afectadas sin seleccionarlas**.

### 5.1 Qué cotas salen

*El otro lado de su queja: "me sobresatura toda la información" [24:05].*

| Contexto | Cotas visibles |
|---|---|
| tramo BC seleccionado | **una** cota, sobre BC, con largo y ángulo dentro (§ 14 de cotas vivas) |
| punto B seleccionado | largos de AB y BC; **ninguna de CD** |
| B arrastrándose | desplazamiento desde B; las vecinas desaparecen mientras dura |
| varios tramos | cantidad y total en la tira; la cota del último tocado |
| todas las internas | cantidad y total en la tira; **ninguna explosión de etiquetas** |
| dibujando con `G` | solo el próximo tramo y su enganche |

---

## 6. D5 — La cota se toca

*Causa A. Su frase es "es un error de la interfaz" [19:05], no "me falta".*

1. **Una interna se selecciona clicando cualquiera de sus tramos.** Hoy no se puede y eso es el fallo.
2. **La cota del sujeto es editable**, incluidas las de una interna ya dibujada. Ver y no poder tocar es lo que ella llamó *"lo tienes que buscar tú con el ratón, y eso es jodido"* [21:49].
3. **El número va sobre la raya**, no al lado [05:08], y sin la palabra "del punto" [04:43]: *"menos es más"*.
4. **Cada cota nombra su sujeto.** Tres cotas sin dueño reconocible [24:11] es el defecto que § 5.1 evita.

---

## 7. Lo que NO se hace

Con su razón, para que no se relea como olvido:

- **No se rediseña la paleta** ni el sistema de atajos.
- **No se migra `InternalLine`** (§ 5).
- **No se unifican todos los hit-tests del CAD.** Este contrato fija estas interacciones; `snapIndex` ya distingue su reutilización de una unificación general.
- **No se fragmentan pinzas, piquetes, hilo ni costuras**: tienen semántica propia.
- **No hay solucionador de largo de curva**, ni restricciones persistentes, ni puntos paramétricos.
- **Esto no arregla** el parpadeo, el scroll del dock ni la conversión a curva: son otros, y ya están cerrados en sus tandas.

---

## 8. La red

jsdom **no ve layout ni apilamiento**: lo de aquí se prueba en navegador. Tres pruebas de aceptación, dichas como las diría ella:

1. **mover un punto 10 mm sin calcular lados** — `Q`, clic en el punto, arrastrar 4 px, derecho, escribir `10`, Enter → el punto se movió 10 mm en la dirección trazada y los vecinos no se movieron.
2. **orientar una interna y darle 500 mm sin escribir ángulo** — `G`, primer nodo, orientar, derecho, `500`, Enter → el tramo mide 500 mm y conserva la dirección del ratón.
3. **seleccionar BC sin que salgan las cotas de AB y CD** — una interna de tres tramos, clic en el del medio → una sola cota, y es la suya.

Cada una admite **Esc antes de confirmar** y **un solo deshacer** después.

---

## 9. Enmiendas a lo que ya estaba escrito

| Documento | Qué cambia |
|---|---|
| `2026-06-09-selection-model-multiselect-design.md` § 32 | la selección de una interna deja de ser la entidad entera y pasa a ser el tramo (§ 5) |
| `2026-08-30-cotas-vivas-design.md` § 64 | las cotas de una interna dejan de ser todas sus tramos a la vez (§ 5.1) |
| Gramática de la tanda 6 | el clic derecho gana destino en `H`/`G` y en mover puntos (§ 3.2) |

---

## 10. Registro

- **Enmendado el 2026-09-12** (#1158) — § 5: la granularidad del tramo vale también para los **trazos** (líneas de construcción). Un trazo se selecciona por tramo siempre, con el mismo chip de largo · ángulo y el mismo Supr que una interna. Spec `2026-09-12-trazos-lineas-de-construccion-design.md` § 5.2-5.4.
- **2026-09-08** — escrito tras la junta. Cierra los BLOCKER H1 y H2 de Serrano con las decisiones de § 2.3 (transiciones y edición pendiente) y § 3.1 (contrato geométrico por operación). La gramática de § 2 a § 5 viene de la propuesta de Petra Haft, con dos cosas añadidas aquí: la ley de Voronov en § 1, que explica por qué la herramienta y no la pieza declara la intención, y el precio del hábito de CLO dicho en voz alta en § 3.2.
