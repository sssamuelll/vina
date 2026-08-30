# Feedback de María en audio, 2026-08-30 — lo rescatado, lo reproducido y los issues

**Fuente:** dos grabaciones hechas por María con la Game Bar de Windows en su laptop (`192.168.2.129:8080`). Las dos grabaron **la ventana de la terminal** (la que tenía el foco al arrancar la grabación), no Vina — comprobado con 14 + 39 fotogramas de muestra. **Solo sirve el audio**, y el audio está completo: 2:15 (la queja de la barra) y 38:08 (recorrido por todas las herramientas del dock 2D, contra el build desplegado el 2026-08-29, antes del PR #1091).
**Transcripción íntegra con tiempos:** `2026-08-30-feedback-maria-video-transcripcion.md` (faster-whisper `small`, local, vía `speechtotext`).
**Para la próxima grabación:** arrancar Win+Alt+R con Chrome/Vina en primer plano, o activar "grabar pantalla completa" en la Game Bar. La terminal grabó porque era la app activa en la cuenta atrás.

---

## 0. Qué cambia respecto a las tarjetas

Las tarjetas de Trello son una frase cada una. Aquí hay 38 minutos con el orden real de sus gestos, sus dudas en voz alta y lo que la app le contesta. Tres cosas que el audio deja claras y las tarjetas no:

1. **Todo lo que pide es "control": saber cuánto, desde dónde, hasta dónde.** Lo dice para mover puntos, para cortar, para medir, para el piquete, para el hilo, para la pluma: *"cómo sé cuánto lo muevo"*, *"yo quería cortar de aquí a quince"*, *"estoy clicando a tres milímetros de este punto"*, *"a dos centímetros, lo voy a inventar"*. Es la misma carencia contada desde siete herramientas, y es exactamente lo que las cotas vivas (spec 2026-08-30) empiezan a dar. El PR A la cubre para Ancho/Alto; el resto es el camino.
2. **El menú flotante por comando lo pide en cada herramienta** (*"otra vez me falta como un menú flotante"* ×7). El PR A pone la tira en la esquina y las cotas sobre el objeto; la tira ya enseña el atajo, que también pidió (*"un atajo muy guay que apareciera… la letra, así me la acabo aprendiendo"*).
3. **Hay fallos duros que no estaban en ninguna tarjeta**: un borde que se comporta distinto a los demás (mover y convertir en curva), tijeras que se traba tras el primer corte, Supr con una costura que borra la pieza, el piquete que no acepta la distancia escrita, el menú contextual recortado, el zoom que se queda corto. Esos son los que se reprodujeron primero (§ 2).

---

## 1. Línea de tiempo (grabación 2, 38:08)

| Minuto | Herramienta | Qué hace / qué dice (cita) | Qué es |
|---|---|---|---|
| 00:02 | Seleccionar | *"los rectángulos se mueven muy bien, se suprimen muy bien"* | ✔ mover (rondas anteriores) |
| 00:14 | Formas | *"no estoy pudiendo crear círculos ni triángulos… círculo es indispensable… integradas en este comando de formas geométricas"* | Trello #224 |
| 00:26 | Dock | *"me confunde mucho el icono este de línea interna porque parece que pueda crear triángulos cuadrados y círculos… lo dibujaría como una línea intermitente"* | icono |
| 01:14 | Editar patrón | *"este punto azul… no me aporta nada"*; *"cómo sé cuánto lo muevo"*; *"se ha quedado fijo el de arriba y se mueve el de abajo… es un poco random"* | **fallo** + control numérico |
| 02:22 | Editar patrón | *"estoy dando al botón derecho y se me ha quedado trabado ese punto, se han convertido en puntos otra vez"*; *"como en CLO me saldría un submenú que diría cuánto lo quieres mover en esa dirección"* | control numérico |
| 03:03 | Editar patrón | *"siempre es esta línea, porque este es el punto cero"* — el borde que arranca en el primer punto se mueve solo por un extremo | **fallo** (§ 2.1) |
| 04:19 | Editar patrón | *"necesito más opciones, categorías… cómo muevo las cosas, una línea, un punto"* | modos claros |
| 04:37 | Convertir en curva | *"cuando clico con el derecho no acabo de tener muy claro que esté clicando sobre esa línea"*; *"esto está cortado y no sé muy bien lo que pone"* | resalte del borde bajo el cursor; **menú recortado** (§ 2.3) |
| 05:14 | Curva | *"crea una curva de bezier, pero… debería estar modelada por micropuntos y esos micropuntos deberían ser visibles"*; *"curva por puntos es lo que más utilizo"*; *"híbrido raro"*; *"algunos son redondos y otros cuadrados"* | Trello #211; entregas 3 y 5 |
| 07:16 | Curva | *"de una línea ahora he creado… cuatro líneas, aparte ha creado la separación y nuevas líneas dentro de la línea que al programa le ha dado la gana, ni siquiera me pregunta"* | **fallo** (§ 2.2) |
| 07:36 | Curva | *"estoy clicando en la V y no pasa nada… esta línea se comporta siempre rara y distinta a las demás… es la que también se movía distinto"* | **fallo** (§ 2.2, mismo borde que § 2.1) |
| 08:50 | Pluma | *"ya me ha creado tipo bezier si yo no he hecho nada… habrá arrastrado sin querer"* | umbral de arrastre (§ 2.10) |
| 09:34 | Pluma | *"me falta como un menú flotante… en el que yo le pueda decir los grados, el largo… quiero hacer de 50, qué difícil… 0° de 50"* | Tab/"Siguiente punto" **no lo descubre** → PR B (chip del tramo) |
| 10:46 | Pluma | *"poder crear líneas externas con la pluma me parece un plus"* | ✔ |
| 11:23 | Pluma | *"si ahora quiero crear una línea nueva que empiece desde aquí no se está iluminando"* | enganche al empezar |
| 11:38 | Puntos | *"siempre en los extremos los puntos deberían aparecer… los de curva solo cuando uno clica el menú curva… no está viendo todos los puntos que modelan la curva"* | Trello #211 |
| 12:48 | Seleccionar vs Editar | *"estos puntos los puedo mover con seleccionar o con editar… cuál es la diferencia… no está bien definido para qué es cada comando"* | spec 08-11 (verbo) — pista |
| 13:03 | Tijeras | *"me gusta mucho que hay un menú… estaría más guay flotante… está aquí tapado"* | PR A |
| 13:30 | Tijeras | *"lo de la costura no me convence… las costuras vienen en un proceso distinto del proceso de creación"* | opción `autoSew` fuera de tijeras |
| 14:06 | Tijeras | *"no sé qué distancia tengo de aquí a aquí… yo quería cortar de aquí a quince"* | cotas para el corte |
| 14:51 | Tijeras | *"eliminar no es muy intuitivo, parece que vaya a eliminar la pieza cuando no la elimina… que te diga si conserva la original"* | copy del diálogo |
| 15:33 | Tijeras | *"sigo en el menú cortar y no me detecta nada. Tengo que salir y volver a entrar… no me corta, no hay nada"* | **fallo** (§ 2.4) |
| 16:47 | Medir | *"aparece el punto de donde empiezo… pero cómo sé que estoy en la punta del extremo o a una milésima… esto es patronaje"*; *"que al clicar aquí sepa que estoy a tres milímetros de este punto"* | enganche + distancia al punto |
| 17:56 | Medir | *"otra vez esto sigue cortado, no veo qué hay aquí debajo"*; *"si clico una línea, medir la línea entera"* | **menú recortado** (§ 2.3); medir por clic |
| 18:19 | Zoom | *"no puedo hacer más zoom, estoy al tope del zoom"* | **límite** (§ 2.7) |
| 18:36 | Medir | *"si quiero ir a otra pieza, genial. Ahora desaparecen. Un botón en la pantalla 2D que pudiera decirme borrar mediciones"* | mediciones persistentes |
| 19:18 | Render | *"al hacer zoom se quedan estas rayitas así como pixeladas… poco profesional"* | **trazo a zoom alto** (§ 2.7) |
| 19:28 | 2D/3D | *"echo de menos el maniquí para poner el zoom correcto… los patrones van a ser para una persona como esta"* | referencia de escala |
| 20:08 | 3D | *"para mover en 3D era con las flechas, un poco incómodo… también con el ratón"*; *"se cruzan los números, ruido visual"* | 3D: mover con ratón; etiquetas |
| 20:36 | Medir | *"me faltan opciones… medir ángulos, todo tipo de mediciones geométricas"* | medir ángulos |
| 21:05 | Coser | *"el icono está raro, parece el icono de crear curvas"* | icono |
| 21:26 | Coser | *"si vuelvo a clicar no sé muy bien qué está cosido con qué… por colores… que se activen las dos líneas del mismo color"* | #1028 / Trello #219 |
| 22:17 | Coser | *"largo de puntada no sirve de nada… eso lo dejaría para otro menú… coser debería servir solo del lado técnico"* | opción fuera del comando |
| 23:04 | Coser | *"coger un punto y arrastrar que ahora mismo no puedo… decirle hasta 10 milímetros… editar lo que ya está cosido porque no se puede"* | #1025 / #1029 (entregado, no lo encuentra) |
| 23:47 | Coser | *"si clico y le doy a suprimir, suprime la pieza"* | **fallo** (§ 2.5) |
| 24:09 | Margen | *"tiene un atajo muy guay que apareciera… la letra… que siempre esté ahí"* | ✔ tira (PR A) |
| 24:36 | Margen | *"lo que ponga Ancho no me convence… es margen de costura"*; *"Heredar… un poco antiguo… un botón de cero"* | copy |
| 25:20 | Margen | *"le da a la pieza y me pone 9,5… ya no sé lo que estoy haciendo"*; *"que si me pongo encima me dijera cuánto es el margen aquí"*; *"visualizar todos los márgenes"* | **§ 2.8**; hover; ver/ocultar |
| 26:08 | Margen | *"por pieza no funciona, funciona por línea… aparece directamente 9.5… es una memoria de lo anterior"* | **§ 2.8** |
| 26:44 | Margen | *"esto crea como un objeto de la costura con este nombre tan… ni siquiera puedo editar el nombre… demasiado sofisticado técnico para un usuario"* | panel de borde |
| 27:31 | Margen | *"he clicado a la línea pero se me ha iluminado toda la pieza… solo cambia esa línea… falta control"* | **§ 2.8** |
| 27:58 | Margen | *"lo del tema de los tacones de costura… para más adelante"* | después |
| 28:09 | Piquete | *"yo pensaría que va a quedar un triángulo… lo pondría como una línea y otra perpendicular, o una muesca"* | icono |
| 28:31 | Piquete | *"como no hay puntos de referencia… a dos centímetros, lo voy a inventar… cómo le digo al programa que lo quiero"* | cotas (entrega 12/26) |
| 29:20 | Piquete | *"aquí sí aparece un menú de colocación. Esto no lo ha hecho ningún otro comando. Está muy bien… demasiadas letras… conforme lo muevo que se vaya moviendo"* | ✔ NotchPrecisionModal; previsualización viva |
| 30:02 | Piquete | *"esto mide 1502 milímetros, lo coloco a 500… no me ha creado nada"* | **fallo** (§ 2.6) |
| 30:39 | Margen | *"ver la pieza con y sin costuras… mi línea de manipulación está como intermitente… ver los puntos extremos"* | toggle existe (menú Vina) → descubrimiento |
| 31:40 | Piquete | *"me pregunta qué distancia… voy a tirar 200… no me ha creado nada porque le he dado a enter… colocar exacto, no me lo crea, qué ladilla… o los está creando y no los veo"* | **fallo** (§ 2.6); ver/ocultar piquetes |
| 32:47 | Hilo | *"no hay mucha información… parece que es un atajo pero no se ve… clicar sin soltar… no estoy segura que sea recto… que yo pudiera escribir los grados a cero"* | pista + ángulo escrito |
| 34:06 | Punto | *"tipo de punto… por qué este redondo y este cuadrado… no me deja modificarlo solo crear… algunos se quedan cuadrados, otros en curva, no entiendo por qué… había creado dos y no me he dado cuenta"* | Trello #211 |
| 35:53 | Editar costuras | *"por qué editar costuras no está en el mismo que coser"*; *"ahí ha creado un tacón sin decirle nada… debería ser yo la que le diga"*; *"si le doy a editar costuras no pasa absolutamente nada"* | #1028; **fallo** (§ 2.9) |
| 37:26 | Capas | *"que estén ahí pero ocultar: la costura, el hilo, los piquetes… no interfieran con que yo muevo puntos"* | ver/ocultar por capa desde el lienzo |
| 37:48 | Cierre | *"creo que ya tenía clicado todos los comandos posibles, así que este es el trabajo de hoy"* | — |

Grabación 1 (2:15): la barra de opciones — *"cuando he ido a editarlo arriba se crea ya el rectángulo pero tampoco cambia"*, *"estas medidas supongo que estarán en milímetros pero no lo pone en ningún sitio"*, *"con el derecho no hace nada"*, *"el menú de los comandos acaba chocando con el menú este de arriba"*. Cerrado por el PR #1091 (cotas vivas, PR A); los chips dicen "mm".

---

## 2. Lo reproducido hoy (rama `feat/cotas-vivas`, Playwright a 1366×643)

Diez reproducciones automatizadas el mismo día, una por hallazgo, cada una con su script en el scratchpad de la sesión, capturas y números del store. Siete reproducidas con causa en código; tres parciales con la causa localizada.

| Hallazgo | Resultado | Lo medido | Causa |
|---|---|---|---|
| Borde que se mueve por un extremo (01:14) | **sí** | de 4 bordes, solo el de cierre (3→M) mueve un vértice; el M queda clavado; trapecio | `nodeEditorUtils.ts:346-357` etiqueta el cierre con el índice de `Z`; `extractNodes` nunca emite nodo para `Z` |
| "Convertir en curva" no hace nada en un borde (07:36) | **parcial** | los 3 primeros bordes `L`→`C`; el de cierre queda byte a byte igual; "por puntos" mete 4 `C` sin preguntar | `convertToCurve` (`:515-522`) recibe el índice de `Z` y devuelve el contorno intacto |
| Menú contextual cortado (05:09, 17:56) | **sí** | 20 filas / 755 px en 643 px: 130 px inaccesibles, "Eliminar pieza" fuera de pantalla, sin scrollbar ni señal | `floating.css:176-177` + curación de 20 acciones |
| Tijeras se traba tras el primer corte (15:33) | **sí** | 2º corte: ni diálogo ni resalte; el rodeo z+clic+x funciona | `editorSlice.ts:260-270` vacía la selección en `removePiece`; `useScissorsTool.ts:150-174` no reselecciona |
| Supr con costura borra la pieza (23:47) | **sí** | Delete y Backspace: `pieces` 2→1, se va la pieza seleccionada tres gestos antes | `toolActivation.ts:18-21` no toca la selección; `edit.delete` borra lo seleccionado en Redux |
| Piquete "Colocar exacto" no crea (30:02, 31:55) | **parcial** | `distanceMm` 50→500 y 100→200 exactos, path pintado; el modal `fixed` cae sobre el 3D y el piquete aterriza en la franja de 14 px junto al dock / encima del vértice | `NotchPrecisionModal.css:6-8`; sin encuadre tras aplicar |
| Zoom al tope (18:19) / trazo pixelado (19:18) | **parcial** | `zoom2D` se clava en 10 (24 ticks); trazo `1,4/zoom` = siempre 1,4 px | `editorSlice.ts:165`; `PieceRenderer.tsx:169+` |
| Margen pieza vs línea (25:20, 26:08) | **parcial** | 9,5 = `DEFAULT_SEAM_ALLOWANCE`; clic en borde solo selecciona; el campo del borde enseña el heredado, no el tecleado | `useSeamAllowanceTool.ts:149-157`; `EdgePropertiesSection.tsx:161,169` |
| Editar costuras crea un tacón (36:29) | **sí** | "Inglete" activo en el panel con `cornerTypes` `undefined`; clic en borde/esquina con Editar costuras no cambia nada | `VertexPropertiesSection.tsx:31`, `cornerTypes.ts:977` fallback `'mitered'` |
| Pluma bezier accidental (09:05) | **sí** | 0 px → recta; **1 px → bezier** | `usePenTool.ts:160-187` sin `DRAG_THRESHOLD_PX` |

Lección de método (memoria `reproducir-antes-de-arreglar-maria`): su literal no era el bug en tres de diez — "el punto cero" era el borde de cierre, no el que arranca en M; "no me lo crea" era una capa fija encima; "por pieza no funciona" era que nadie le decía qué campo aplica a qué. Reproducir primero cambió el issue en los tres.

---

## 3. Los issues

Índice de la ronda: **#1113**. Veintiún issues, cada uno con la cita literal y el minuto.

**Fallos (reproducidos):** #1092 borde de cierre · #1093 tijeras se traba · #1094 Supr borra la pieza · #1095 menú contextual recortado · #1096 pluma bezier a 1 px · #1097 zoom al tope y trazo · #1098 tacón por defecto y Editar costuras mudo · #1099 piquete: modal fijo y encuadre · #1100 margen: descubrimiento.

**Diseño y UX:** #1101 iconos · #1102 pluma sin enganche al empezar · #1103 puntos visibles y semántica · #1104 medir · #1105 tijeras: copy, costura, cotas del corte · #1106 margen: copy y control · #1107 hilo · #1108 3D con ratón y etiquetas · #1109 capas desde el lienzo · #1110 coser por colores · #1111 círculo y triángulo · #1112 mover con número.

Orden propuesto en el índice: #1094 (pérdida de datos) → #1092 → #1093 → #1096 → #1095 + #1097 → #1099 + #1098 + #1100 → el resto con las tandas B/C de cotas vivas como columna.

---

## 4. Lo que ya estaba cubierto (no se abre issue nuevo)

| Lo que dice | Dónde vive |
|---|---|
| Menú flotante por comando, atajo visible, "el menú tapado" | PR #1091 (tira + cotas) |
| Unidad no escrita ("supongo que serán milímetros") | PR #1091 (los chips dicen mm) |
| Largo/ángulo escritos en pluma y línea interna | entrega 26 ("Siguiente punto", Tab) — **no lo descubre**: el PR B lo vuelve chip visible |
| Distancia del piquete escrita | entrega 12 (NotchPrecisionModal) — sí lo descubre y le gusta; falla al aplicar (§ 2.6) |
| Coser por tramos arrastrando | #1025/#1029 (entrega 17) — **no lo descubre** |
| Qué está cosido con qué; crear vs editar | #1028 / Trello #219 |
| Puntos de curva visibles y editables; redondo vs cuadrado | Trello #211; entregas 3 y 5 |
| Círculo y triángulo | Trello #224 → issue nuevo (no tenía) |
| Ver con/sin margen, hilo, piquetes | toggles del menú Vina (`showSeamAllowance`, `showGrainlines`) — descubrimiento |
