# Reunión María + Samuel, 2026-09-07 — 25 minutos sobre cinco herramientas, y por qué son un solo problema

**Fuente:** `VinaTesting/grabacion_2026-09-07_20-15-28.mp4` — 24:58, 1920×1080 @15fps, audio mono. Contra `vina.sdar.dev`, vista **Split** (2D + avatar drapeando) todo el rato.
**Transcripción íntegra con tiempos:** [`2026-09-07-reunion-maria-transcripcion.md`](2026-09-07-reunion-maria-transcripcion.md) — faster-whisper `large-v3`, español, 507 segmentos, cobertura continua 00:02→24:54.
**Índice visual:** 150 fotogramas (uno cada 10 s, 1280 px) en `VinaTesting/reunion-2026-09-07/frames/`, nombrados `t_MM-SS.jpg`. Cualquier marca de tiempo del transcript se redondea a la decena inferior para ver la pantalla: `[00:22:01]` → `frames/t_22-00.jpg`. Hay 77 estados visualmente distintos (24 con umbral grueso); `frames_index.json` los lista.

> **Diferencia con la ronda del 30-08:** aquella grabó la ventana de la terminal y solo servía el audio. Esta grabó Vina. Por primera vez se puede leer *lo que la app le contestaba* en el momento exacto de cada queja.

---

## 0. La frase que ordena todo el documento

Samuel, cerrando, en [24:43]:

> *"como el 70 o el 80% de toda esta revisión se trató de un par de cositas."*

Es cierto y conviene tomarlo en serio antes de abrir issues. María toca cinco herramientas —Rectángulo, Editar patrón, Medir, Pluma, Línea interna— y en las cinco se queja de cosas distintas. Pero las quejas **no son cinco listas**: son **siete causas** contadas desde cinco sitios. El § 2 las agrupa. Si se abren issues por herramienta, se abre cinco veces el mismo trabajo.

Y hay un dato que hace de piedra angular: **la cota que ella quiere ya existe en Vina, dentro de Línea interna.** [15:45]

> *"en verdad puedo medir así, ya sé que mi línea mide 299,5. Y incluso el ángulo. O sea, todo lo que necesitaba de medir lo tengo aquí. […] Si el de medir fuera así… copiar eso para el de medir. **Es tan simple como eso.**"*

No es una petición de feature. Es una petición de **propagación**: una herramienta ya resolvió el problema y las otras cuatro no se enteraron.

---

## 1. Línea de tiempo

| Min | Herramienta | Qué dice (cita) | Qué es |
|---|---|---|---|
| 00:22 | — | *"¿ves que el cursor parpadea un poco? […] parece como las luces de una discoteca"* · *"antes no lo hacía"* | **fallo nuevo** (§ 3.1) |
| 00:34 | Rectángulo | *"¿por qué de un clic me ha creado directamente de esas medidas?"* → *"ha ido repitiendo el primer rectángulo que yo he creado"* | **fallo** (§ 3.2) |
| 01:49 | Rectángulo | *"en verdad no es una acción repetitiva […] cada rectángulo va a ser de un tamaño distinto"* → Samuel: *"se quita"* | **decidido** (§ 4.1) |
| 02:31 | Cotas | *"esas barras y el cuadro para la medida ocupa espacio […] que no se quede ahí pegado todo el rato"* | causa D |
| 02:44 | — | Samuel propone el **contexto de pieza**: *"dependiendo de lo que tú estés haciendo se activen controles alrededor de la pieza"* → María: *"sería bonito"*, *"muy bien"* | **decidido** (§ 4.2) |
| 03:55 | Editar patrón | *"me ha costado un poco […] hay que mejorar la forma en la que se selecciona el punto"* | causa E |
| 04:09 | Editar patrón | *"quería subir en línea recta, no perder mi ángulo […] le estoy dando al shift para ver si lo bloqueaba […] o incluso que me dejara ángulos"* | causa B |
| 04:43 | Cotas | *"el que ponga 'del punto' no hace falta, porque menos es más"* · *"sería más intuitivo si el número estuviera como justo en la raya"* | causa A |
| 05:17 | Editar patrón | *"si lo quiero mover 10 milímetros tengo que calcularlo yo así a mano"* · *"en CLO […] le clicas con el derecho, te sale un menú […] en qué ángulo lo quieres mover, qué distancia"* | causa B |
| 05:55 | — | Samuel: *"nosotros vamos un paso más adelante. En vez de desplegar un menú, vamos a desplegar las opciones del contexto dentro de la edición de la pieza. […] **eso lo vamos a hacer**"* | **decidido** (§ 4.2) |
| 06:21 | Seleccionar | *"se queda iluminado ese punto amarillo"* | **fallo** (§ 3.7) |
| 06:34 | Editar patrón | *"ya no tengo un rectángulo, pero me siguen apareciendo solo dos medidas de dos líneas"* | **fallo** (§ 3.4) |
| 06:55 | Editar patrón | *"me sería muy interesante que encima de cada línea me dijera cuánto mide cada línea"* | causa A |
| 07:11 | Medir | *"no estoy segura de que haya medido lo que he querido medir"* · *"si yo clico, no aparece la medición de la línea"* | **fallo** (§ 3.6) |
| 07:25 | Cotas | *"los otros están bastante bonitos […] con ese fondo oscuro"* · *"me gusta bastante este […] porque aparece encima de la línea"* | causa C |
| 08:20 | Medir | *"ahora no me aparece la medición […] ¿será que se fue después de darle a lo de medir?"* | **fallo** (§ 3.5) |
| 08:45 | Medir | *"no estoy tan segura de si estoy clicando justo en el punto azul o a 0,2 milímetros del punto azul […] me gustaría que el punto se iluminara"* | causa F |
| 09:40 | Editar patrón | *"ya teníamos lo de la división esa, ahora sí salió, ¿qué pasó?"* → Samuel: *"tenemos que revisar eso"* | **fallo** (§ 3.8) |
| 10:12 | Editar patrón | *"está sacando unas medidas que no son las medidas de la pieza, sino como el rectángulo"* · *"lo principal para ti sería medir los lados de la pieza"* | **fallo** (§ 3.4) |
| 10:45 | Modos | *"el editar debe ser solamente en caso de que tú quieras editar […] diferenciar una herramienta de la otra"* | causa E |
| 11:01 | Convertir en curva | *"se ha arrastrado esto"* · *"ese asunto de convertir en curva falla mucho"* · *"eso se volvió loco"* · *"se ha quedado un link raro"* | **fallo** (§ 3.3) |
| 12:11 | — | *"la discoteca ahora está en el cursor de la flecha también, parpadea todo el rato"* | **fallo** (§ 3.1) |
| 12:32 | Línea interna | *"si no hay patrón, ¿para qué activar esa opción?"* | **fallo** (§ 3.10) |
| 12:52 | — | Samuel: *"queremos economizar espacio […] buscamos una interfaz zen, directa, sencilla, simple, fácil de usar, rápida"* | causa D |
| 13:16 | Pluma | *"me falta lo mismo que con shift, pudiera bloquear"* · *"no puede ser tan impreciso"* · *"si le quiero decir que la quiero de 595…"* | causa B |
| 14:07 | Pluma | *"deja crear piezas abiertas"* · *"no hay que dejar eso ahí así"* · *"ahí mismo te dice: no puedo rendir esta pieza así, ¿me la cierras o qué?"* | **fallo** (§ 3.11) |
| 14:52 | Pluma | *"debe haber la opción de que tú le digas que siempre haga ese comportamiento […] y eso puede editarse luego en ajustes"* | causa D |
| 15:10 | Línea interna | *"al llegar al punto del extremo sí que noto un tope […] tengo la certeza de que estoy en el punto 0,0"* | **el precedente bueno** (causa F) |
| 15:45 | Línea interna | *"todo lo que necesitaba de medir lo tengo aquí"* · *"copiar eso para el de medir. Es tan simple como eso"* | **la frase clave** |
| 16:43 | Línea interna | *"el ángulo tiene que ser una opción no obligatoria, porque hay gente que no dibuja con ángulos"* | causa B (matiz) |
| 16:51 | Línea interna | *"si marcas ya una distancia antes de clicar al derecho, tiene que sobreentender que quieres seguir esa distancia"* · *"si le digo que quiero menos 90 y no menos 166, que me haga los menos 90"* | causa B |
| 18:00 | Internas | *"veo como que hay muchísimas cosas, o sea que solapa […] debería haberse quitado la información de las externas"* | causa D |
| 18:18 | Cotas | *"los cuadros son muy grandes, muy sólidos, ocupan mucho"* | causa C/D |
| 18:49 | Línea interna | *"entonces yo puedo editarlo […] ya no puedo"* → Samuel: *"tienes que poder"* | causa A |
| 19:05 | Línea interna | *"no puedes seleccionarla, deberías poder seleccionarla […] **es un error de la interfaz**"* | causa A |
| 19:25 | Punto | quiere una interna *"a 50 milímetros de este punto, en ángulo recto"* · *"en otros programas de CAD crearía un punto de aquí a 50 milímetros"* | causa B |
| 20:10 | Dock | *"aquí aparece una barra abajo, tenemos un error de interfaz"* · [20:44] *"esto se ha bajado, eso no debería bajarse, esa barra debe estar fija"* → Samuel: *"overscroll no"* | **fallo** (§ 3.9) |
| 21:01 | Punto | *"me está haciendo un imán y se para, esto está guay […] lo malo es que no sé si el punto lo he hecho a 50"* | causa B |
| 21:21 | Cotas | *"me gusta más este cuadro negrito porque es más minimalista […] los ángulos y la distancia están juntos, ocupa menos"* | causa C |
| 21:35 | Dock | *"los botones de la izquierda se pueden hacer más pequeños también"* | causa D |
| 21:46 | Cotas | *"me aparece la información y eso está muy bien, el problema es que yo no puedo editarla"* · *"la tienes que buscar tú con el ratón, y eso es jodido"* | causa A |
| 22:01 | Cotas | *"de repente cambia el diseño y aparece en azul cuando antes aparecía en negro. **Sigo pensando que prefiero la negra**"* → Samuel: *"hay dos diseños y están solapados […] yo hubiese ido más por este"* | **decidido** (§ 4.3) |
| 22:37 | Cotas | *"lo que predomina, lo que realmente vale, es la información de las medidas […] eso vale más para otro tipo de diseños, como de objetos"* | causa C |
| 22:52 | Modos | *"el de seleccionar […] selecciona la interna y también me deja editarla, es como que este botón está multifunción"* · [23:19] *"no sé cuál es la diferencia entre el de editar y el de seleccionar, es muy raro"* | causa E |
| 23:32 | Internas | *"no me gusta que se creen grupos […] en verdad hay dos líneas, aquí debería haber un punto"* · *"o se clican todas o se clica solo la que estoy clicando"* | causa G |
| 24:11 | Cotas | *"estas tres medidas no tengo muy claro de qué son […] ninguna corresponde con este punto, que me gustaría saber cuánto mide"* | causa A |

---

## 2. Las siete causas

### A. La cota se lee pero no se toca, y no está donde se mira

Nueve quejas en cinco momentos distintos. La cota **muestra** el número correcto y luego no deja hacer nada con él: no se selecciona la línea interna que la produjo [19:05], no se edita el valor [18:49, 21:46], el número está al lado de la raya y no sobre ella [05:08, 10:01], lleva una palabra que sobra (*"del punto"*) [04:43], y cuando hay tres a la vez ninguna es la que le interesa [24:11].

Su formulación es exacta: *"es un error de la interfaz"* [19:05]. No dice "me falta", dice "está roto" — y esas dos cosas se ven igual desde fuera.

### B. No hay control numérico *antes* de soltar el ratón

Seis quejas, en cuatro herramientas: Editar patrón [04:09, 05:17], Pluma [13:16, 13:47], Línea interna [16:51, 17:14], Punto [19:25, 20:29, 21:01]. Siempre la misma forma: *"quiero llegar a 500 y tengo que salir con el ratón buscando los 500"*.

Dos matices suyos que **restringen el diseño** y conviene no perder:

1. *"el ángulo tiene que ser una opción no obligatoria, porque hay gente que no dibuja con ángulos"* [16:43].
2. *"si marcas ya una distancia antes de clicar al derecho, tiene que sobreentender que quieres seguir esa distancia"* [16:51] — la dirección ya trazada con el ratón es un dato de entrada, no algo que haya que reescribir.

### C. Dos gramáticas de cota conviviendo

Hay **dos diseños de etiqueta a la vez** y ella los ve alternarse: la píldora azul (grande, un cuadro por magnitud, al lado de la línea) y la negra (compacta, ángulo y distancia juntos, encima de la línea). Lo nota como un fallo de coherencia — *"de repente cambia el diseño"* [22:01] — y elige: **la negra**, tres veces [07:37, 21:21, 22:01].

Su razón no es estética: *"esto ocupa más, he creado dos cuadros para una misma información que en el otro estaba más acopladito […] siento que tengo más control del patrón"* [22:23]. Y el diagnóstico de por qué la azul le molesta: *"lo que predomina, lo que realmente vale, es la información de las medidas […] eso vale más para otro tipo de diseños, como de objetos"* [22:37]. En patronaje la pieza manda; la cota es servidumbre.

Samuel dice en voz alta que él prefería la otra [22:15] y cede al criterio de la usuaria. Queda decidido (§ 4.3).

> **Corregido tras la junta (verificado en código y specs).** Esto **no era una decisión nueva**: ya estaba escrita y sin ejecutar. La spec de cotas vivas del 30-08, § 9, ordena que `--readout-bg-2d`/`--readout-ink-2d` *"se **reemplazan** por `--cota-*` en `PolyPenToolOverlay`/`PenToolOverlay`: un solo lenguaje para «número sobre el papel»"* (`docs/superpowers/specs/2026-08-30-cotas-vivas-design.md:277`). El readout viejo sigue vivo en `PolyPenToolOverlay.tsx:143-144`, y `--readout-*-2d` solo se define en `tokens.css:93-94` y solo se consume ahí.
>
> Las dos cotas no conviven por indecisión: conviven porque **la sustitución se declaró y no se hizo**. Y el sentido del conflicto es el contrario del que parece: la spec manda que gane la **azul** (`--cota-*` = `--accent-2d`); María acaba de elegir la **negra** (el readout que la spec condena). Esto no se cierra ejecutando la spec ni obedeciendo a María — hay que enmendar una de las dos, por escrito.
>
> **Y su elección tiene letra pequeña:** eligió la negra *"más allá de los colores, porque aparece encima de la línea"* [07:37], y de esa misma negra dijo *"la letra casi ni se lee"* [07:31]. Lo que ganó es **posición y compacidad**, no la paleta. Copiarla tal cual arrastra un defecto de legibilidad que ella ya nombró (el readout es `fontSize 10/z`).

### D. Todo se muestra siempre; no hay contexto

Cotas pegadas cuando ya fijó la medida [02:31], información de bordes externos encima de la de internos mientras dibuja internos [18:00], cuadros grandes [18:18], botones del dock grandes [21:35]. Samuel lo nombra: *"interfaz zen"* [12:52], y propone la solución (§ 4.2).

### E. `Seleccionar` y `Editar patrón` no tienen frontera

*"es como que este botón está multifunción, no acabo de tener claro cuántas cosas puedo hacer con ese botón"* [22:52] · *"no sé cuál es la diferencia entre el de editar y el de seleccionar"* [23:19] · *"el editar debe ser solamente en caso de que tú quieras editar"* [10:45].

**Es reincidente.** La misma queja está en la ronda del 30-08 (min 12:48 de aquella grabación: *"estos puntos los puedo mover con seleccionar o con editar… cuál es la diferencia… no está bien definido para qué es cada comando"*). Dos rondas seguidas es señal de que no se arregla con copy.

### F. El enganche a puntos es desigual entre herramientas

Medir no le da certeza y ella no sabe si clicó el punto o 0,2 mm al lado [08:45]. Línea interna **sí**, con tope físico y lectura `0,0`, y lo dice con alivio [15:10]. Misma usuaria, mismo gesto, dos respuestas distintas de la app.

> **Corregido tras la junta (verificado en código).** Decir "Medir no engancha" era falso. Medir **sí** engancha: `snapToOutline()` en `src/components/PatternEditor/useMeasureTool.ts:69`, umbral de 8 px de pantalla — pero al **punto más cercano del contorno**, es decir a la *raya*. `snapIndex.ts:105-120`, que es lo que usa Línea interna, resuelve en otro orden: primero `firstNode`, luego **vértice**, luego extremo, y solo después contorno.
>
> Es decir: las dos enganchan, a cosas distintas. Medir te deja *sobre el borde*; Línea interna te deja *en el punto*. Por eso ella tiene certeza en una y no en la otra, y por eso su frase es literal — no le falta enganche, le falta **prioridad de vértice** y la señal que lo confirme. Arreglar "el enganche" sin esta distinción interviene el mecanismo equivocado.

### G. Las internas se agrupan por bloque de creación

*"yo creé estas líneas de una vez y estas de otra, pero en verdad hay dos líneas […] o se clican todas o se clica solo la que estoy clicando, que sería de este extremo a este, y no las que se crearon en el mismo bloque"* [23:32-23:59]. Consecuencia directa: *"me sobresatura toda la información"* [24:05] — al seleccionar el bloque salen todas las cotas de todos sus segmentos.

---

## 3. Fallos duros (reproducir antes de diseñar nada)

1. **Cursor parpadeando** [00:22, 12:11] — *"parece las luces de una discoteca"*, *"antes no lo hacía"*. Afecta a la cruz y también a la flecha. Regresión nueva; Samuel sospecha de telemetría, sin comprobar.
2. **Rectángulo repite la última medida con un clic** [00:34-02:00] — *"ha ido repitiendo el primer rectángulo que yo he creado"*. Samuel: *"se quita"*.
3. **Convertir en curva no convierte y arrastra la pieza** [11:01-12:04] — *"se ha arrastrado esto"*, *"convertir en línea y sin embargo no veo la curva"*, *"se ha quedado un link raro"*. Tres intentos, ninguno funcionó. El más grave de la sesión.
4. **`Editar patrón` acota la caja envolvente, no los lados** [06:34, 10:12] — en una pieza no rectangular *"está sacando unas medidas que no son las medidas de la pieza sino como el rectángulo"*, y solo dos.
5. **Las cotas desaparecen tras usar Medir** [08:20] — *"¿será que se fue después de darle a lo de medir?"*.
   > **Reproducido el 2026-09-08, y no es lo que parece.** En la misma frase ella dice *"no me aparece **la medición**"* y *"no aparecen **las medidas** que teníamos"*: son dos cosas distintas. La reproducción mide las dos por separado y responde cuál se fue:
   >
   > | Paso | Cotas de la pieza | Mediciones pintadas |
   > |---|---|---|
   > | rectángulo nuevo por clic | **visibles** | — |
   > | dos clics con Medir | — | **1** |
   > | volver a Rectángulo | — | **0** ← se fue esto |
   > | crear otro rectángulo | **visibles** | 0 |
   >
   > Las cotas nunca desaparecieron. Lo que desapareció fue **la medición**, al cambiar de herramienta. **No es un fallo aparte: es D3** de la spec de Medir (*"las mediciones PERSISTEN"*), que ya iba en la tanda 3. Perseguir "las cotas" habría sido arreglar algo que no estaba roto.
6. **Medir por clic sobre una línea no mide** [07:19] — *"si yo clico, no aparece la medición de la línea"*. (Es lo que pide **#1104**: *medir una línea con un clic*.)
7. **Punto amarillo se queda iluminado** al volver a Seleccionar [06:21].
8. **Menú de "división" aparece sin causa aparente** [09:40] — *"¿qué pasó? ¿cuál fue la diferencia?" — "ni idea"*. Samuel: *"tenemos que revisar eso"*.
   > **Resuelto por el fotograma `t_09-40.jpg` (2026-09-08).** "La división esa" es la **barrita de la pieza** — girar, duplicar, espejar, ajustes, candado — que aparece sobre la selección. No apareció de la nada: apareció bajo condiciones que ella no puede predecir. **No es un fallo suelto: es la causa D**, y se cierra con el contrato del contexto de pieza, no con un parche aquí.
9. **La barra inferior se desplaza** [20:10, 20:44] — *"esa barra debe estar fija"*. Samuel lo llama overscroll.
   > **Resuelto comparando `t_20-10.jpg` con `t_20-50.jpg` (2026-09-08).** No es la barra de abajo: es el **dock izquierdo de herramientas**. En `t_20-10` su contenido está desplazado y el rótulo "2D" de la cabecera se ha ido de vista, asomando un "+" abajo que en el otro fotograma no está.
   >
   > Y el scroll **es deliberado**: `Dock.css:31-33` pone `max-height: calc(100% - 28px); overflow-y: auto` por #1095, porque a 1366×643 con el catálogo entero *"siete botones quedaban fuera sin scroll y sin ninguna señal"*, y el comentario dice que la barra de scroll **es** la señal y por eso no se esconde.
   >
   > Así que no está roto: es una decisión chocando con su expectativa de que la columna de herramientas es mueble fijo. El arreglo no es `position: fixed` —con 19 herramientas en 643 px algo tiene que ceder— sino que **la cabecera no se vaya con el scroll** (`position: sticky` en `.dock__label`), que conserva la señal de #1095 y le quita la sensación de que la barra "se bajó".
10. **`Línea interna` está activa sin patrón** [12:32] — *"si no hay patrón, ¿para qué activar esa opción?"*.
11. **Pluma deja cerrar una pieza abierta sin avisar** [14:07] — pide un aviso *"¿me la cierras o qué?"* con opción de recordar la respuesta en ajustes.

---

## 4. Lo decidido en la reunión (no son propuestas: se dijeron en voz alta y se aceptaron)

### 4.1 El rectángulo deja de repetir la última medida
María: *"en verdad no es una acción repetitiva, cada rectángulo va a ser de un tamaño distinto"*. Samuel: *"ok, bueno, entonces se quita, y ya está"* [01:57].

> **Ojo, encontrado por la junta (verificado).** Esto no es borrar una línea: el comportamiento está **escrito como criterio de aceptación**. El E2E 2 de la spec de cotas vivas (`docs/superpowers/specs/2026-08-30-cotas-vivas-design.md:241`) exige textualmente *"segundo clic → otra de 300×150 (el default se escribió por ser **creación caliente**)"*. Quitarlo pone rojo un test que hoy pasa por diseño. Hay que enmendar la spec y reescribir el caso, y decidir además lo que la reunión no dijo: **qué hace un clic aislado a partir de ahora**.

### 4.2 Contexto de pieza en lugar de menú contextual
Samuel, respondiendo a que en CLO el clic derecho abre un menú [05:41]:

> *"La diferencia entre nosotros y CLO es que nosotros vamos un paso más adelante. En vez de desplegar un menú, vamos a desplegar las opciones del contexto dentro de la edición de la pieza […] pero relacionado con eso exactamente que quieres lograr. **Eso lo vamos a hacer.**"* [05:55]

Y antes, la formulación larga: *"hay que manejar un contexto de pieza […] ahorita estamos editando el tamaño, entonces activamos las opciones de manejo dinámico del tamaño. Ya lo han fijado, ok, ya no lo necesita, ¿para qué vamos a seguir mostrando eso? Ahora vamos a mostrar otra cosa"* [03:05-03:23]. María: *"muy bien"*.

**Ojo:** esto es una decisión de arquitectura de interacción tomada de palabra, sin spec. Es el punto que la junta debe atacar primero.

### 4.3 La cota negra gana
Tres veces elegida por la usuaria, con razón dada (§ 2.C). Samuel prefería la azul y cede. Implica **retirar una de las dos**, no dejar las dos conviviendo.

**Pero esta decisión choca de frente con una ya escrita** (ver el recuadro de § 2.C): la spec del 30-08 § 9 manda lo contrario y nunca se ejecutó. Antes de tocar un píxel hay que enmendar la spec o revisar la elección con María sabiendo que lo que le gustó fue la posición y el tamaño, no el color.

---

## 5. Cruce con lo que ya está abierto

| Causa / fallo | Issue existente | Estado |
|---|---|---|
| F + Medir (§ 3.6) | **#1104** — *medir con enganche a puntos, distancia al punto más cercano, medir una línea con un clic, mediciones que se quedan y ángulos* | El título cubre literalmente lo que vuelve a pedir. Abierto, sin arrancar. |
| E (`Seleccionar` vs `Editar`) | Sin issue propio. Aparece en el índice **#1113** (ronda 30-08, min 12:48) | Reincidente, sin dueño |
| A (cota no editable/seleccionable) | Vecino de la línea de cotas vivas (PR #1128, línea interna) | La cota se pinta; el sujeto no se puede coger |
| D (contexto) | Sin issue. Es § 4.2 | Decisión nueva, sin spec |
| C (dos diseños) | **Ya decidido y no ejecutado**: spec cotas vivas 30-08 § 9 (`2026-08-30-cotas-vivas-design.md:277`) | Sustitución declarada, pendiente — y la spec manda lo CONTRARIO que María |
| G (agrupación de internas) | Sin issue | Nuevo |
| § 3.1 cursor | Sin issue | Nuevo, regresión |
| § 3.3 convertir en curva | Sin issue en la lista abierta | Nuevo, grave |

---

## 6. Lo que la reunión NO decidió

1. **Qué es exactamente el "contexto de pieza"** — qué contextos existen, cómo se entra y se sale de cada uno, qué pasa cuando dos podrían aplicar a la vez, y dónde vive (encima de la pieza, en la tira, en el borde).
2. **Dónde va el control numérico** — María pide clic derecho (hábito de CLO, lo citó cuatro veces); Samuel dice explícitamente que no será un menú. No se acordó el gesto sustituto.
3. **Si el enganche se propaga o se unifica** — *"copiar eso para el de medir"* puede ser copiar código a Medir o extraer el enganche a una capa que todas usen. La segunda es la que evita la tercera ronda de esta misma queja.
4. **Qué es una línea interna**: ¿un trazo con N segmentos (hoy) o N líneas independientes (lo que ella espera)? De esto depende § 2.G y también qué se selecciona y qué cotas salen.


---

## 7. Cierre — qué se hizo, 2026-09-08

Seis tandas, todas con tests escritos primero y verificados rojos por su razón, hashes sellados, e implementación delegada a `gpt-6-astra` (effort `ultra`, sandbox de solo escritura en el workspace) bajo contrato TDD.

| Punto | Estado | Commit |
|---|---|---|
| Fallos 1, 3, 7 — el estado de edición sobrevivía a su herramienta | hecho | `09db0d5c` |
| Fallo 2 — el tamaño se contagiaba (+ círculo y triángulo) | hecho | `408602d3` |
| Fallos 5, 6 + causa F — Medir | hecho | `7244641e` |
| Fallos 4, 9, 10 — puertas y defaults | hecho | `dbb78694` |
| Causa C + fallo 11 — un cuadro, y el aviso | hecho | `b6dc3bfa` |
| Causas A y G — el sujeto es el tramo | hecho | `21429ce2` |
| Fallo 8 | no era un fallo propio: es la causa D |  |
| Causa G — la creación seguía formando grupo (visto por el recorrido, § 7.2) | hecho | esta tanda |
| Etiquetas de largo con el dato viejo (visto por el recorrido, § 7.2) | hecho | `d0838c31` |
| Causas B, D, E | **decididas y sin implementar** — ver el contrato del 08-09 |  |

### 7.1 Lo que cambió del diagnóstico al implementarlo

Cinco de los dieciocho puntos no eran lo que el informe decía al escribirse. Vale la pena que quede junto:

1. **"Medir no engancha" era falso.** Engancha al contorno; le faltaba prioridad de vértice. Arreglar "el enganche" habría intervenido el mecanismo equivocado.
2. **Las dos cotas no convivían por indecisión.** La sustitución estaba escrita en la spec del 30-08 y sin ejecutar — y mandaba lo contrario que María.
3. **El fallo 5 no era de las cotas.** Reproducido: nunca desaparecieron. Se iba la medición.
4. **El fallo 9 no era la barra de abajo** sino el dock, y su scroll es una decisión deliberada de #1095.
5. **El fallo 4 ya existía**: es el chip "Largos", que ella tuvo delante 25 minutos con la casilla vacía.

Y dos correcciones a decisiones propias: la enmienda § 14 de la cota se pasó al tocar los tokens (ella dijo *"más allá de los colores"*), y el oráculo del caso de la pieza girada medía contra una caja que dejó de ser la geometría.

### 7.2 Lo que encontró recorrer la sesión entera, 2026-09-09

Las seis tandas se verificaron con casos aislados. María no encuentra las cosas aisladas: las encuentra encadenadas. Por eso el recorrido de los trece momentos en su orden, en una sola página y con la caja negra volcando la línea de tiempo (`tests/e2e/replay-maria-07-09.spec.ts`).

Encontró **dos cosas que las seis tandas dieron por buenas**, y las dos eran una:

**1. El largo guardado le ganaba al contorno** (`d0838c31`). El paso 2 pasaba su assert —la pieza medía 300×150— mientras la telemetría enseñaba las cuatro etiquetas diciendo `100.0 mm`. `edge.length ?? computePathArcLength(...)`: un derivado guardado que la ruta de redimensionar por cota no refresca, con un `??` que lo prefería. Estaba latente desde siempre y lo despertó la tanda 4 al encender "Largos" de fábrica.

**2. Dibujar una interna creaba un grupo de selección** (esta tanda). `PatternEditor.tsx:396` autoseleccionaba la entidad entera al cerrar el trazo. Consecuencias en cascada, todas visibles en la captura del paso 12:

- la cabecera anunciaba **«Editando: la línea seleccionada · 6 cotas»** sobre una interna de tres tramos — literalmente [24:05] *"y me sobresatura toda la información"*, la causa G intacta;
- esas seis cotas tapaban el dibujo, así que el clic siguiente caía en una cota en vez de en el tramo y la abría a escribir;
- el foco se quedaba dentro del campo y **la aplicación perdía todos los atajos de teclado** hasta clicar fuera. Un gesto de dibujo dejaba a Vina muda.

La causa de fondo es que la regla vivía en un solo sitio de los dos que tienen que coincidir: el clic la aplicaba (`useEditorInteractions.ts`), el cierre del trazo no. Ahora es `seSeleccionaPorTramo()` en `types.ts`, junto a la selección que gobierna.

**Por qué la tanda 6 no lo vio:** su test monta la interna con un `dispatch(project/addInternalLine)` directo. Verificó el cuarto y no la puerta. El caso nuevo la dibuja con la herramienta.

**Y estaba escrito.** El contrato del 08-09 § 5 ya decía *"el gesto que creó varios tramos no forma un grupo de selección"*. Tercer caso en este repo de una decisión escrita que nadie ejecutó, después de la sustitución de la cota (§ 9 del 30-08) y el enganche de Medir (D1 del 06-09).

**El paso 7 pedía la avería.** Exigía que la secuencia hubiera dejado el editor de nodos encendido dentro de Seleccionar, y se declaraba «NO MONTABLE» al no encontrarlo. Pero la tanda 1 no maquilló el cursor: quitó el estado latente, así que la precondición es inalcanzable a propósito. Reescrito para afirmar las dos mitades —que no queda editor vivo, y que la cruz de Rectángulo no depende de que lo haya—, que juntas son más fuertes que la original.

Estado final del recorrido: **13 de 13**, 163 eventos, 0 perdidos, 0 anomalías, 0 errores de navegador.

### 7.3 Rojos preexistentes en `main`, ajenos a esta tanda

Verificados con `git stash` antes de acusar a ningún cambio:

- `edit-pattern-trust.spec.ts` — el arrastre lento de un nodo no mueve el comando.
- `linea-interna-gramatica.spec.ts` — "línea interna y al borde del contorno": espera 3 internas y hay 2.
