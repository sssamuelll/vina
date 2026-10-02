# «La interfaz en papel» con los ojos de María

> Revisión del spec `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (commit
> `075a3f31`), hecha el 2026-10-02 por un subagente con una sola lente: lo que María ha dicho y
> firmado. Leyó el spec, sus capturas, las reuniones del 30-08, el 07-09 y el 10-09 con sus
> transcripciones, las firmas del 13-09, las specs del 08-09 y del 09-09, cromo callado y los issues
> #1099, #1103 y #1109.
>
> **Qué está verificado.** Abrí y comprobé las citas que mueven decisiones: las del 30-08 ([00:10],
> [05:09], [24:09-24:24], [26:19], [29:01-29:10], [29:48-29:54]), las del 07-09 ([02:31-02:47],
> [10:17-10:21], [21:22-21:26], [22:01-22:05]), el viewport 1366 × 643 y la fila 19 del informe del
> 10-09. El resto de citas `archivo:línea` de código son del subagente y hay que abrirlas antes de
> usarlas.

## La premisa que cambia la evidencia

María trabaja a **1366 × 643**, que es el viewport real de su Chrome
(`2026-08-30-cotas-vivas-design.md:30`), y en **Split** «todo el rato» en las reuniones grabadas
(`2026-09-10-reunion-maria.md:3`). Casi toda la evidencia del spec es de 1366 × 768 y en 2D a ancho
completo.

## 1. Dónde el spec contradice lo que ella dijo o firmó

**1. Desaparece la tarjeta, y con ella el nombre y la letra de la herramienta activa.**
Spec § 4.3 («el nombre y el atajo salen en el tooltip»), § 8 y P2. Choca con la propia ley 4: «se
revela por estado, nunca por hover».
- 30-08 [00:10]: «que guay, que aquí aparece seleccionar Z».
- 30-08 [24:09-24:24]: «un menú flotante poniendo cuál es el atajo, la letra, como se la acabo
  aprendiendo y que siempre esté ahí, muy guay».
- 30-08 [05:09]: «no sé en qué comando estoy».
Daño: saber en qué herramienta está pasa a exigir hover sobre un icono. Ya leyó mal tres iconos, y
su pregunta reincidente es Seleccionar contra Editar (07-09 [23:19]). En reposo con Z, después del
primer Q, no queda en pantalla ni nombre ni frase: solo un icono azul.

**2. La ley «una sola voz» prohíbe las dos pistas de Tab que ella firmó junto al objeto.**
Spec ley 6 y § 5.4. No las nombra ni las exceptúa.
- Firma del 13-09 (`2026-09-13-seis-firmas-maria.md:22`): «como TAB va a ser clave… debería salir
  escrito como cuando se está trazando la línea… Sería TAB para continuar y ENTER para trazar».
- Están en `CotaChip.tsx:314`, `PenToolOverlay.tsx:226` y `PolyPenToolOverlay.tsx:176`.
Daño: leída literal, la ley las manda al pie, donde no las vio: el 10-09 [11:14] dijo «el largo lo
tengo que poner a pulso» con «Tab escribe largo y ángulo» escrito abajo.

**3. Opciones solo después del gesto, más «queda de costumbre»: un valor recordado que no ve hasta
que ya actuó.** Spec § 5.2.
- 30-08 [26:19]: «supongo que es una memoria de lo anterior, porque no sé por qué aparece
  directamente 9.5».
- 07-09 [01:35-01:57]: el rectángulo que repetía el tamaño del anterior; se decidió quitarlo.
- 30-08 [29:01-29:15]: eligió forma y cantidad del piquete **antes** de colocarlo: «sale un submenú,
  forma del piquete interesante, voy hacia adentro».
Daño: el primer piquete sale con una forma, una profundidad o una cantidad que no ve hasta después,
y corregirla cuesta un gesto más. Si la costumbre alcanza a la cota, vuelve el rectángulo que
repetía medidas.

**4. Al seleccionar una pieza salen siempre Ancho y Alto de la caja envolvente, con sus barras.**
Spec D9, § 5.5 y la captura 02.
- 07-09 [10:17-10:21]: «está sacando unas medidas que no son las medidas de la pieza, sino como el
  rectángulo».
- 07-09 [02:31-02:47]: «esas barras y el cuadro para la medida ocupa espacio… solamente cuando
  quieras arreglar las dimensiones… que no se quede ahí pegado todo el rato… que dependiendo de lo
  que tú estés haciendo se activen controles alrededor de la pieza».
- Firma del 13-09: «pocas piezas son un rectángulo».
Daño: en el gesto más frecuente aparecen dos chips azules con barras que, para una pieza real, no
son sus medidas.

**5. La píldora negra que eligió tres veces se vuelve azul.** Spec § 5.5: «sobre el papel, todo
número es azul con texto blanco».
- 07-09 [21:22-21:26]: «me gusta más como aparece este cuadro negrito porque es más minimalista».
- 07-09 [22:01-22:05]: «aparece en azul cuando antes aparecía en negro. Sigo pensando que prefiero
  la negra».
Daño: sobre un papel donde todo lo demás es tinta, el azul sólido es lo que más pesa. La medida le
gana al patrón, que es justo su queja.

## 2. Dónde le quita de la vista algo que usa, o le suma un gesto

**6. La línea al pie hereda mensajes y opciones, y es el canal con evidencia de que no lo lee.**
Spec § 5.3 y § 5.4.
- Las opciones las encontró arriba. 30-08 [13:03-13:13]: «me gusta mucho que hay un menú, por
  tanto… voy a poder controlar algo».
- La pista de abajo no la lee: informe del 10-09, fila 19.
- El `desenlace` es el antídoto de su queja más repetida («no me ha creado nada», «ni siquiera me
  lo crea»).
Daño: en Split a 1366 × 643 la pista de la Pluma ya se corta por los dos lados
(`2026-09-23-shift-hoja-y-borde-design.md:110`), y con opciones pasa a dos líneas. El tope de tres
cláusulas saca «Esc deja el trazo» (`HintText.tsx:120`), lo único que le explica cómo dejar abierta
la Pluma, que pidió el 10-09 [13:45].

**7. El «Tipo de punto» de la herramienta Punto se queda sin sitio.** Spec § 5.2. La opción `mode`
(Punto, Curva por puntos, Curva bezier; `point.tsx:33-40`) decide qué hace el clic: no puede ir
«tras el clic».
- 30-08 [05:51]: «curva por puntos… es lo que más utilizo como patronista».

**8. La cota que reemplaza al modal del piquete no le da lo que el modal sí le daba.** Spec § 5.2
y § 8.
- 30-08 [29:20-29:54]: «si yo le digo a 239 que se ponga 239 para que yo pueda visualizar».
- 30-08 [30:13]: «esto mide 1.502 milímetros, entonces podría colocarlo a 500».
Daño: hoy el modal mueve un fantasma con cada tecla (`NotchPrecisionModal.tsx:23-24, 84`) y enseña
el largo del borde (`:90`). `CotaChip` solo aplica con Enter o Tab. Sin vista previa ni largo,
escribe a ciegas, y una distancia mayor que el borde da la vuelta a la pieza. Falta decir desde qué
esquina se mide.

**9. La explicación de Seleccionar contra Editar se calla después del primer Q.** Spec § 5.4.
- El 07-09 usó Editar patrón en [03:50] y [06:30], y en [23:19] seguía preguntando: «no sé cuál es
  la diferencia entre el de editar y el de seleccionar».
Daño: haber usado Q no es haber entendido.

## 3. Algo nuevo que no va a encontrar

**10. Las etiquetas de opción no tienen puerta de vuelta.** Spec § 5.2 dice que «vuelven al
seleccionar el objeto», y no dice con qué herramienta se selecciona un piquete, una costura o un
vértice del margen.
- 30-08 [23:41-23:47]: «también editar lo que ya está cosido porque no se puede».
- 30-08 [37:12]: «si le doy a editar costuras no pasa absolutamente nada».

## 4. Qué preguntarle o enseñarle antes de construir

**11. Las capturas no son su pantalla.** A 643 px de alto caben unas trece herramientas; las que
sobren se esconden en «+», sin la señal que exigió #1095. Las capturas de acción (02, 03, 04, 08 y
09) son 2D a ancho completo. La 08 cambia de zoom al abrir el panel (la marca pasa de 50 a 100 mm),
lo contrario de lo que dice § 6.1.

**12. El spec rebaja la exigencia de su firma justo donde el anterior la protegía.** D14 y § 11
dicen «antes de publicar»; cromo callado § 8 decía «no se escribe sin su firma: plegar la fila a un
botón, el piquete sin modal, la silueta del panel a ras y Propiedades a petición». Y § 4.2 pliega
la fila de capas en un botón según el ancho. El informe del 10-09: «dos de siete decisiones del
09-09 se cayeron con la usuaria delante».

Sesión que propone, con las capturas regeneradas en Split a 1366 × 643:

| Captura | Tarea |
|---|---|
| 05 contra 00-hoy-split | «¿En qué herramienta estás?» y «apaga los piquetes». |
| 03 | «Pon tres piquetes en V hacia adentro a 500 de la esquina». |
| 04, en dos líneas | «¿Qué opciones tiene esta herramienta?» |
| Punto | «Haz una curva por puntos». |
| Pluma | La píldora negra al lado de la azul, para que elija. |
| 01 y 05 | Preguntarle si cuenta cuadros: uno vale 50 mm en la 01 y 100 mm en la 05. |

Y sobre las reglas: la cita que el spec usa para quitarlas (07-09 [20:36], «tiene que tener una
regla ahí») literalmente pide una regla. Que la quería en el punto es una lectura nuestra.

## Lo que el spec acierta de lo que ella pidió

Márgenes que no se mueven (07-09 [20:49]); menos cosas en reposo (10-09 [03:14]); herramientas más
ligeras (07-09 [21:35]); Punto con distancia escribible (07-09 [19:50], 10-09 [04:19]); «Tipo de
costura» fuera del gesto de coser (30-08 [22:47]).
