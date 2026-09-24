# Shift: la hoja y el borde — dos guías, un toque más

**Fecha:** 2026-09-23, revisada el 2026-09-24 · **Estado:** decisión 2 reabierta el 24-09 por la regla de teclados (§ 3.5) y cerrada esa noche por Claude, por delegación de Samuel; pendiente de su revisión a posteriori
**Construye sobre:** `main` con #1209 (Shift endereza respecto a la hoja, firma B del 23-09)
**Contratos que toca:** `2026-09-08-contexto-y-control-numerico-design.md` § 3.4 (precedencia y Shift), firma D2 del 12-09 (ángulo relativo al borde), contrato de interfaz (`.claude/skills/contrato-de-interfaz/`)

---

## 1. De dónde sale

María firmó el 23-09 que Shift endereza respecto a la **hoja** (opción B del artefacto «Shift y la perpendicular», `https://claude.ai/artifact/Qyea31bCA895AcJTftLXxE`). Lo firmó como estándar forzado, y dejó escrito lo que querría de verdad:

> *"Idealmente cuando uno hace SHIFT podrían salir guías para las dos opciones contemplando que el usuario pueda elegir la que quiera […] idealmente, se pudieran trazar los ángulos respecto a la hoja y respecto al punto de la linea desde donde se dibuja."*

(Textual, con su ortografía. Nota entera en el informe del 10-09, § 9.)

Las dos guías tienen su razón en su oficio: la hoja es el hilo de la tela (*"todas siempre parten de unas perpendiculares que son las que envuelven el cuerpo"*); el borde es la perpendicular a un costado o a un hombro, que es lo que buscaba el 10-09 [07:35] y [13:10] cuando dijo *"quiero una perpendicular"*.

**Éxito:** con la mano en el ratón y sin escribir un número, ella puede sacar tanto la perpendicular a un costado inclinado como la horizontal o la vertical de la hoja, y ve las dos antes de elegir.

**Restricciones que siguen vigentes:** su firma del 13-09 — *"no quiero opciones"*: nada de desplegables, interruptores ni ajustes. Y la regla de Samuel del 24-09: Vina funciona igual con cualquier teclado (§ 3.5).

## 2. Decisiones tomadas en el diseño

| # | Pregunta | Decisión | Descartado |
|---|---|---|---|
| 1 | ¿Cómo elige entre las dos guías? | **Por tecla**: Shift = hoja, Shift dos veces = borde | Por cercanía del ratón (las guías se pelean en bordes poco inclinados, y Shift dejaría de dar siempre la hoja firmada); interruptor en la tira (es una opción) |
| 2 | ¿Qué tecla? | **Shift dos veces**: un toque y, enseguida, pulsar y mantener | Alt y Ctrl, con Shift o solos; una letra; Espacio y Tab (§ 3.5) |
| 3 | ¿Qué se ve con Shift? | **Las dos guías**, la activa firme y la otra tenue | Solo la activa (la otra no se descubre); ninguna (no es lo que pidió) |
| 4 | En `Q`, ¿respecto a qué borde? | **El lado que llega al punto** | Los dos lados por cercanía (reintroduce la decisión 1); el borde inerte en `Q` (rompe «Shift vale igual en todas partes») |
| 5 | ¿Cómo se construye? | **Extender lo existente** reusando la referencia de la píldora | Esperar al resolutor único de enganche (bloquea); calcular solo en el overlay (dos verdades) |

Las decisiones 1, 3, 4 y 5 son de Samuel (23-09). La 2 se tomó ese día como **Alt** y se reabrió el 24-09, cuando Samuel fijó que *"estamos haciendo una aplicacion que debe ser para varios tipos de teclado disponible"*: con esa regla ni Alt ni Ctrl sirven (§ 3.5). La cerró Claude esa noche, por delegación suya, con la única alternativa que ya estaba en la lista y no depende del teclado. La razón por la que se había descartado —*poco descubrible*— la cubren la guía tenue (decisión 3) y la pista del pie (§ 4.2).

## 3. Comportamiento

### 3.1 Las teclas

| Teclas | Endereza respecto a | Pasos |
|---|---|---|
| ratón solo | — | — |
| **Shift** mantenido | la **hoja** (espacio del patrón) — como hoy | 45° |
| **Shift dos veces** (un toque y, enseguida, mantener) | el **borde**: exactamente la referencia de la píldora (firma D2) | 45° |

Qué cuenta como «dos veces», con precisión:

- Un **toque** es pulsar y soltar Shift en menos de **300 ms** sin pulsar el ratón entre medias. Un Shift+clic no es un toque, ni lo es mantener Shift mientras se traza.
- **Dos veces** es un toque seguido de otra pulsación de Shift antes de **400 ms** desde que se soltó. El borde manda desde esa pulsación y mientras se mantenga; al soltar se acaba, igual que Shift.
- Para volver a la hoja: soltar y pulsar Shift una vez.
- La autorrepetición del teclado (Shift mantenido manda `keydown` repetidos en Windows) no es otra pulsación.
- Da igual cuál de las dos Shift: la izquierda y la derecha cuentan igual.

La referencia del borde es el `AngleReference` que cada herramienta ya calcula para leer el ángulo:

- La línea sale de un borde → **el borde** (0° = seguirlo, +90° = perpendicular hacia dentro de la pieza).
- Ya hay un tramo anterior → **ese tramo** (90° = esquina a escuadra).
- Primer tramo libre, sin borde → **el eje**, que es la hoja. El doble toque no cambia nada, y se dibuja una sola guía (§ 4).

Cambiar de guía con la mano quieta cambia la goma en ese instante, igual que Shift hoy.

### 3.2 Lo que lee la píldora

Con el **borde** activo la píldora lee en el mismo marco en que se endereza: siempre un múltiplo de 45° («90,0° al borde», «−90,0° al tramo»). Con **Shift** una vez sigue como hoy: puede leer un número no redondo desde un borde inclinado (`71,6° al borde` para una horizontal) — consecuencia ya escrita en la enmienda del 23-09 al § 3.4.

### 3.3 Precedencia (sin cambios)

**número escrito → ángulo escrito → Shift (hoja o borde) → enganche → ratón.**
Cerrar va por delante de las dos guías, como ya hace la de la hoja: el ratón **o la guía activa** sobre el primer nodo cierra el trazo. La goma, la píldora y Tab leen ese mismo destino. Tab con el borde activo congela la dirección enderezada; la pareja Largo/Ángulo sale con el ángulo redondo en su referencia. El segundo press de un doble clic con el borde activo no es un nodo, igual que con Shift una vez. Arrastrando manejadores en la Pluma no hay guías: el manejador se enseña tal cual se guarda.

### 3.4 En Editar patrón (`Q`)

Solo `Q`, igual que Shift una vez: los arrastres de Seleccionar, Editar curva y los extremos de trazos e internas no tienen Shift todavía, por las razones de la enmienda del 23-09 al § 3.4 (reagrupan anclas frame a frame, o no giran el delta, #1068).

- **Arrastrar un punto** con el borde activo endereza el desplazamiento respecto al **lado que llega** a ese punto: el comando `i` para el nodo `i`; para el nodo del `M` inicial, el lado de cierre. A 0° el lado se alarga o acorta sin cambiar de inclinación; a 90° el punto sale en perpendicular a él.
- **Arrastrar un lado** con el borde activo lo endereza respecto a **sí mismo**: a 0° se desliza sobre su propia recta, a 90° se desplaza en paralelo.
- Con varios puntos seleccionados manda el lado del punto **agarrado**.
- **El marco se congela al empezar el arrastre.** El lado cambia de inclinación mientras se arrastra su punto; un marco vivo giraría la guía bajo la mano.
- El ángulo del lado se toma en **espacio de patrón** (tras `pieceLocalToPattern`), así que una pieza girada sale bien; el desplazamiento enderezado se gira después al marco local, como hoy.
- Un lado curvo aporta la **tangente** en su extremo de llegada (la misma que usa `angleReference`).
- Shift + press (una vez o dos) sigue siendo selección aditiva: con el borde activo, arrastrar mueve todo lo seleccionado, y manda el marco del punto agarrado. Sobre algo **ya seleccionado**, la deselección se decide al soltar, solo si la mano no cruzó el umbral de arrastre. Ya está así con Shift; aquí se hereda tal cual.
- El arrastre se calcula desde el contorno del **inicio del gesto** (`drag.startOutline`, ya existe), y de ahí sale también el ángulo del lado de llegada.
- El doble toque vale antes de agarrar (toque, y Shift mantenido al pulsar el ratón) y también en mitad del arrastre, con el botón pulsado.

### 3.5 Teclados: por qué Shift dos veces y no otra tecla

Vina tiene que funcionar con cualquier teclado (Samuel, 24-09). Esta sección decía «preguntarle a María qué teclados tiene». Con esa regla la pregunta sobra: la respuesta de una usuaria no vale para las demás.

- **Alt+Shift y Ctrl+Shift, fuera.** Son atajos de Windows: Alt izquierdo + Shift cambia de idioma cuando hay más de uno, y Ctrl + Shift cambia de teclado dentro de un idioma cuando ese idioma tiene más de uno. El navegador no puede interceptarlos: a quien los tenga activos le cambiarían la distribución en mitad del trazo. Un arreglo que dependa de cómo tiene configurado Windows cada usuaria no es un arreglo.
- **Alt o Ctrl solos, sin Shift, tampoco.** Al pasar de una guía a la otra la mano los junta con Shift un instante, y ese instante basta para el atajo. Además, en Mac Ctrl+clic es el clic derecho, y Ctrl ya está reservado (§ 3.4 del contrato del 08-09) para suspender el enganche.
- **Una letra** (la B de borde, por ejemplo), tampoco: si Shift se suelta un instante antes que la letra, la letra sola cambia de herramienta en mitad del trazo. **Espacio** y **Tab** ya tienen dueño: Espacio y Shift+Espacio lanzan la simulación, y Tab es el siguiente punto.
- **Shift solo** está en todos los teclados y no es atajo de sistema en ninguno. Es, además, la tecla que ya se está usando para esto.

**Riesgo anotado, sin medir:** Windows ofrece activar las teclas especiales (Sticky Keys) cuando Shift se pulsa **cinco veces seguidas**. El doble toque usa dos. Solo alternar de guía varias veces muy seguidas podría llegar a cinco; si pasa, sale un aviso del sistema que se cierra y no toca el patrón. Microsoft no publica el intervalo exacto: se comprueba en Windows (en la máquina de María, al enseñárselo) y, si molesta, se habla con ella antes de tocar nada.

## 4. Lo que se ve

### 4.1 Las guías

- Solo existen **mientras se mantiene Shift** y hay un punto del que partir. Al soltar Shift desaparecen.
- Cada guía es un **rayo** desde el punto de partida, en su dirección enderezada, que cruza el lienzo visible. Largo: una distancia en píxeles pasada a milímetros con el zoom, sin depender del tamaño del viewport.
- **Activa:** discontinua, `--accent-2d` — el tono de la goma, porque es por donde va la línea.
- **Tenue:** discontinua, `--ink-on-light-3` — la tinta de construcción que *"recede behind"* (comentario del token). Es la dirección adonde iría la línea si se cambiara de guía **ahora**.
- De cada marco se dibuja **una sola dirección** (la más cercana al rumbo del ratón), nunca el abanico de ocho.
- **Marcos coincidentes** (primer tramo libre; o un borde cuya dirección es múltiplo de 45° en la hoja): una sola guía, la activa.
- Grosor y discontinuo compensados con el zoom, como el resto del lienzo (#1097).
- En `Q` salen de la **posición inicial** del punto agarrado, no del punto que se mueve.

### 4.2 El texto (ley de puertas)

La píldora no cambia de forma. La **pista del pie** lleva la cuenta, con una restricción medida: la pista es un `<text>` SVG centrado, sin salto de línea, y en su laptop (1366×643, vista Split: el lienzo 2D mide 681 px) la de la Pluma ya se corta 167 px por cada lado y la de la Línea interna 64 px. Lo que se añada a esas dos cae en la parte que no se ve. Por eso el doble toque se anuncia **cuando se pulsa Shift**: esa pista sustituye a la de la herramienta y es corta.

| Estado | Pista |
|---|---|
| en reposo, las tres | sin cambios (la de `Q` ya acaba en «· Shift+arrastrar: 0°/45°/90°», 643 px de 681) |
| Shift mantenido, con segundo marco | **sustituye**: «Shift: a la hoja · Shift dos veces: al borde» |
| borde activo | **sustituye**: «Shift dos veces: al borde · una vez: a la hoja» |
| Shift mantenido, sin segundo marco | sin cambios: no hay nada que elegir |

En `Q` antes de agarrar, «con segundo marco» se da por cierto: el lado que llega aún no se conoce, y la pista anuncia la opción. En mitad de un arrastre manda el marco congelado del punto agarrado.

Los nombres de las teclas salen de `shortcutDisplay`: «⇧» en macOS y «Shift» fuera. Hace falta un helper nuevo allí para la tecla **sola** (`displayShortcut('⇧')` da «Shift+», pensado para combinar). Los anchos se miden en el e2e con la notación de Windows, que es la larga.

La pista del Hilo (`Shift+arrastrar: 0°/45°/90°`) no cambia: el Hilo no tiene borde de partida.

### 4.3 Lo que no se añade

Ningún botón, interruptor, ajuste ni entrada de menú.

## 5. Piezas de código

### 5.1 `restriccionShift.ts` — geometría pura

- `restringirA45(desde, cursor, baseDeg = 0): Point2D` — generaliza `restringirAHoja45`, que desaparece: sus usos (Pluma, Línea interna, Hilo) pasan a `restringirA45(…)` con la base por defecto. `enderezarDesplazamiento(delta)`, el de `Q`, gana el mismo `baseDeg`. Con `baseDeg = 0` conserva los vectores escritos: la `y` de una horizontal idéntica a la del origen. Con otra base gira las ocho direcciones.
- `guiasShift(desde, cursor, referencia: AngleReference, borde: boolean): { punto: Point2D; activa: Guia; tenue: Guia | null }` con `Guia = { desde: Point2D; angleDeg: number }` en la convención de `polarPoint`. **Única fuente** del punto y de lo que se dibuja: la usan el hook para colocar y el overlay para pintar (la lección de maria-196).
- `tenue` es `null` cuando `referencia.baseDeg` es múltiplo de 45° (tolerancia 1e-9): los dos marcos dan las mismas direcciones.

### 5.2 `useShiftSostenido.ts` — el modo

- Sigue Shift como hoy: el estado sale del modificador (`e.shiftKey`), con los filtros de campo editable y modal, en `window` y en captura, sin consumir la tecla, y `blur` olvida sin avisar.
- Pasa de un booleano a un **modo**: `'suelto' | 'hoja' | 'borde'`. Devuelve `modoRef` y avisa con `alCambiar(modo)` cuando cambia.
- Para el doble toque guarda cuándo se pulsó Shift (sin contar la autorrepetición), si hubo ratón mientras estuvo pulsado (`pointerdown` en `window`, en captura) y cuándo se soltó el último toque.
- Los handlers de ratón siguen sincronizando con `e.shiftKey` a través del hook: si el ratón dice que Shift no está, `suelto`; si dice que sí y el hook creía que no (Shift pulsado con la ventana sin foco), `hoja`.
- `SHIFT_TOQUE_MS = 300` y `SHIFT_DOBLE_MS = 400` viven en `gestureConstants.ts`, junto a los umbrales de arrastre.

### 5.3 Hooks

- **`usePenTool`**: el modo junto a `shift` en `PenState`; el marco del borde es el `angleReference` que ya calcula. `enderezar` pasa a usar `guiasShift`. Expone `guias`.
- **`usePolyPenTool`**: igual, con `referenceForNodes`. Expone `guias`.
- **`useEditPattern`**: al armar el arrastre (nodo o lado; también el primer press de `Q` que entra en la pieza y agarra el punto, `enterEditActuando`, que arma el mismo `dragRef`) guarda en el `drag` el `AngleReference` del lado de llegada —o del propio lado— en espacio de patrón. `aplicarArrastre` usa `guiasShift` con ese marco congelado. Expone `guias` mientras el arrastre dura.

### 5.4 `renderers/overlays/GuiasShift.tsx`

Componente pequeño: `{ guias, zoom }` → uno o dos `<line>`. Tokens del § 4.1; sin colores literales (R3 del trinquete de UI, `node scripts/ui-contract-lint.mjs`, no puede subir). Lo montan los overlays de la Pluma, la Línea interna y Editar patrón. `pointerEvents="none"`.

### 5.5 Cableado

- `HintText.tsx` recibe el modo y si hay segundo marco, y aplica la tabla del § 4.2.
- `PatternEditor.tsx` solo cablea `guias` y el modo hacia overlays y pista; no calcula nada.

## 6. Pruebas

### 6.1 Unitarias de geometría — `restriccionShift.test.ts`

- `baseDeg = 0`: todo lo de hoy sigue pasando (horizontal y vertical exactas).
- Base del costado de la escena firmada (dirección 1:3, `71,565…°`): la perpendicular lee **90,0° al borde** exactos.
- `guiasShift`: `borde` invierte activa y tenue; con base múltiplo de 45°, `tenue === null`.

### 6.2 Unitarias de hooks

- **`useShiftSostenido`**, con el reloj falso: toque + pulsación antes de 400 ms → `borde`; pulsación larga, soltar y pulsar → `hoja`; Shift+clic, soltar y pulsar → `hoja`; toque y pulsación pasados los 400 ms → `hoja`; la autorrepetición no reinicia el reloj; `blur` olvida; campo editable y modal delante no cuentan.
- **Pluma y Línea interna**: con el borde activo desde un borde inclinado → píldora `90,0° al borde` y nodo sobre la perpendicular; el segundo tramo, a escuadra con el primero (`±90,0° al tramo`).
- Cambiar de guía con la mano quieta mueve la goma; soltar Shift la devuelve al ratón.
- Primer tramo libre: el doble toque no cambia el punto y `guias.tenue === null`.
- **`Q`**: con el borde activo sobre el punto final de un lado inclinado, lo alarga sin cambiar su inclinación; el marco no gira durante el arrastre; pieza girada correcta; arrastrar un lado a 90° lo desplaza en paralelo; el doble toque en mitad del arrastre cambia de marco.
- Todo lo que ya prueba `shift-endereza-a-la-hoja.test.tsx` sigue pasando sin tocarlo.

### 6.3 E2e — `shift-endereza-a-la-hoja.spec.ts` (ampliado, ya en el gate del deploy)

- Delantero de la escena firmada, Línea interna: Shift dos veces da la perpendicular exacta y **hay dos rayos** en el DOM, el activo con `--accent-2d`.
- La pista del pie cambia con Shift y con el doble toque, y **cabe**: a 1366×643 en Split, `getComputedTextLength()` de la pista menor que el ancho del lienzo 2D.
- `Q`: con el borde activo alarga el costado inclinado conservando su inclinación.

### 6.4 Evidencia para María

Capturas reales de las dos guías sobre la misma escena de su documento, para enseñárselas al desplegar.

## 7. Fuera de alcance

- La guía sobre un borde **curvo** funciona por construcción (la referencia ya es la tangente) pero no tiene pruebas propias en esta tanda.
- **«Ctrl suspende el enganche»** (§ 3.4) sigue sin implementar. Cuando se haga, ojo: con Shift pulsado a la vez es el atajo de Windows del § 3.5.
- Shift (hoja o borde) en los arrastres de Seleccionar, Editar curva y los extremos de trazos e internas: antes hay que llevarles el cálculo desde el contorno del inicio del gesto (`applyAnchorMoves`) y, a las internas, el delta girado (#1068).
- El **resolutor único de enganche** (spec 2026-09-06): esto no lo adelanta ni lo bloquea; `guiasShift` es una pieza que ese resolutor puede absorber tal cual.
- Guías de alineación con otros puntos del patrón (smart guides): no es lo que pidió.
