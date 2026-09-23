# Shift: la hoja y el borde — dos guías, una tecla más

**Fecha:** 2026-09-23 · **Estado:** diseño aprobado en conversación, pendiente de revisión escrita
**Construye sobre:** la rama `feat/shift-45-hoja` (Shift endereza respecto a la hoja, firma B del 23-09)
**Contratos que toca:** `2026-09-08-contexto-y-control-numerico-design.md` § 3.4 (precedencia y Shift), firma D2 del 12-09 (ángulo relativo al borde), contrato de interfaz (`.claude/skills/contrato-de-interfaz/`)

---

## 1. De dónde sale

María firmó el 23-09 que Shift endereza respecto a la **hoja** (opción B del artefacto «Shift y la perpendicular», `https://claude.ai/artifact/Qyea31bCA895AcJTftLXxE`). Lo firmó como estándar forzado, y dejó escrito lo que querría de verdad:

> *"Idealmente cuando uno hace SHIFT podrían salir guías para las dos opciones contemplando que el usuario pueda elegir la que quiera […] idealmente, se pudieran trazar los ángulos respecto a la hoja y respecto al punto de la linea desde donde se dibuja."*

(Textual, con su ortografía. Nota entera en el informe del 10-09, § 9.)

Las dos guías tienen su razón en su oficio: la hoja es el hilo de la tela (*"todas siempre parten de unas perpendiculares que son las que envuelven el cuerpo"*); el borde es la perpendicular a un costado o a un hombro, que es lo que buscaba el 10-09 [07:35] y [13:10] cuando dijo *"quiero una perpendicular"*.

**Éxito:** con la mano en el ratón y sin escribir un número, ella puede sacar tanto la perpendicular a un costado inclinado como la horizontal o la vertical de la hoja, y ve las dos antes de elegir.

**Restricción que sigue vigente:** su firma del 13-09 — *"no quiero opciones"*. Nada de desplegables, interruptores ni ajustes.

## 2. Decisiones tomadas en el diseño (Samuel, 23-09)

| # | Pregunta | Decisión | Descartado |
|---|---|---|---|
| 1 | ¿Cómo elige entre las dos guías? | **Por tecla**: Shift = hoja, Shift+tecla = borde | Por cercanía del ratón (las guías se pelean en bordes poco inclinados); interruptor en la tira (es una opción) |
| 2 | ¿Qué tecla? | **Alt** (⌥ en Mac) | Ctrl (reservado por § 3.4 para suspender el enganche); doble toque de Shift (poco descubrible) |
| 3 | ¿Qué se ve con Shift? | **Las dos guías**, la activa firme y la otra tenue | Solo la activa (la otra no se descubre); ninguna (no es lo que pidió) |
| 4 | En `Q`, ¿respecto a qué borde? | **El lado que llega al punto** | Los dos lados por cercanía (reintroduce la decisión 1); Alt inerte en `Q` (rompe «Shift vale igual en todas partes») |
| 5 | ¿Cómo se construye? | **Extender lo existente** reusando la referencia de la píldora | Esperar al resolutor único de enganche (bloquea); calcular solo en el overlay (dos verdades) |

## 3. Comportamiento

### 3.1 Las teclas

| Teclas | Endereza respecto a | Pasos |
|---|---|---|
| ratón solo | — | — |
| **Shift** | la **hoja** (espacio del patrón) — como hoy | 45° |
| **Shift+Alt** | el **borde**: exactamente la referencia de la píldora (firma D2) | 45° |
| Alt solo | nada: Alt no hace nada sin Shift | — |

La referencia del borde es el `AngleReference` que cada herramienta ya calcula para leer el ángulo:

- La línea sale de un borde → **el borde** (0° = seguirlo, +90° = perpendicular hacia dentro de la pieza).
- Ya hay un tramo anterior → **ese tramo** (90° = esquina a escuadra).
- Primer tramo libre, sin borde → **el eje**, que es la hoja. Alt no cambia nada, y se dibuja una sola guía (§ 4).

Pulsar o soltar Alt con la mano quieta cambia de guía en ese instante, igual que Shift.

### 3.2 Lo que lee la píldora

Con **Shift+Alt** la píldora lee en el mismo marco en que se endereza: siempre un múltiplo de 45° («90,0° al borde», «−90,0° al tramo»). Con **Shift** solo sigue como hoy: puede leer un número no redondo desde un borde inclinado (`71,6° al borde` para una horizontal) — consecuencia ya escrita en la enmienda del 23-09 al § 3.4.

### 3.3 Precedencia (sin cambios)

**número escrito → ángulo escrito → Shift / Shift+Alt → enganche → ratón.**
Cerrar va por delante de las dos guías, como ya hace la de la hoja: el ratón **o la guía activa** sobre el primer nodo cierra el trazo. La goma, la píldora y Tab leen ese mismo destino. Tab con Shift+Alt congela la dirección enderezada; la pareja Largo/Ángulo sale con el ángulo redondo en su referencia. El segundo press de un Shift+Alt+doble clic no es un nodo, igual que con Shift solo. Arrastrando manejadores en la Pluma no hay guías: el manejador se enseña tal cual se guarda.

### 3.4 En Editar patrón (`Q`)

Solo `Q`, igual que Shift solo: los arrastres de Seleccionar, Editar curva y los extremos de trazos e internas no tienen Shift todavía, por las razones de la enmienda del 23-09 al § 3.4 (reagrupan anclas frame a frame, o no giran el delta, #1068).

- **Arrastrar un punto** con Shift+Alt endereza el desplazamiento respecto al **lado que llega** a ese punto: el comando `i` para el nodo `i`; para el nodo del `M` inicial, el lado de cierre. A 0° el lado se alarga o acorta sin cambiar de inclinación; a 90° el punto sale en perpendicular a él.
- **Arrastrar un lado** con Shift+Alt lo endereza respecto a **sí mismo**: a 0° se desliza sobre su propia recta, a 90° se desplaza en paralelo.
- Con varios puntos seleccionados manda el lado del punto **agarrado**.
- **El marco se congela al empezar el arrastre.** El lado cambia de inclinación mientras se arrastra su punto; un marco vivo giraría la guía bajo la mano.
- El ángulo del lado se toma en **espacio de patrón** (tras `pieceLocalToPattern`), así que una pieza girada sale bien; el desplazamiento enderezado se gira después al marco local, como hoy.
- Un lado curvo aporta la **tangente** en su extremo de llegada (la misma que usa `angleReference`).
- Shift (o Shift+Alt) + press sigue siendo selección aditiva: Shift+Alt+arrastrar mueve todo lo seleccionado, y manda el marco del punto agarrado. Sobre algo **ya seleccionado**, la deselección se decide al soltar, solo si la mano no cruzó el umbral de arrastre. Ya está así con Shift; aquí se hereda tal cual.
- El arrastre se calcula desde el contorno del **inicio del gesto** (`drag.startOutline`, ya existe), y de ahí sale también el ángulo del lado de llegada.

### 3.5 Alt en Windows

María trabaja en Windows. Dos cosas:

1. **Antes de implementar**, preguntarle si tiene más de un idioma de teclado instalado. **Alt izquierdo + Shift** es el atajo del sistema para cambiar de idioma y el navegador no lo puede interceptar: le cambiaría la distribución en mitad del trazo. Si lo tiene, la tecla pasa a **Ctrl** y la reserva «Ctrl suspende el enganche» del § 3.4 se mueve o se reescribe en esa enmienda. Esta spec no se implementa con Alt sin esa respuesta.
2. En Windows, pulsar y soltar Alt puede llevar el foco al menú del navegador (el comportamiento de menú del sistema). **Hay que comprobarlo en su máquina**, con Shift ya pulsado, antes de dar nada por hecho. Si pasa, mientras haya un trazo o un arrastre con Shift en curso la herramienta consume Alt (`preventDefault` en `keydown` y `keyup`) y se vuelve a comprobar que eso lo evita. Fuera de un gesto, Alt pasa intacto.

## 4. Lo que se ve

### 4.1 Las guías

- Solo existen **mientras se mantiene Shift** y hay un punto del que partir. Al soltar Shift desaparecen.
- Cada guía es un **rayo** desde el punto de partida, en su dirección enderezada, que cruza el lienzo visible. Largo: una distancia en píxeles pasada a milímetros con el zoom (`screenToPatternLength`), sin depender del tamaño del viewport.
- **Activa:** discontinua, `--accent-2d` — el tono de la goma, porque es por donde va la línea.
- **Tenue:** discontinua, `--ink-on-light-3` — la tinta de construcción que *"recede behind"* (comentario del token). Es la dirección adonde iría la línea si se pulsara o soltara Alt **ahora**.
- De cada marco se dibuja **una sola dirección** (la más cercana al rumbo del ratón), nunca el abanico de ocho.
- **Marcos coincidentes** (primer tramo libre; o un borde cuya dirección es múltiplo de 45° en la hoja): una sola guía, la activa.
- Grosor y discontinuo compensados con el zoom, como el resto del lienzo (#1097).
- En `Q` salen de la **posición inicial** del punto agarrado, no del punto que se mueve.

### 4.2 El texto (ley de puertas)

La píldora no cambia de forma. La **pista del pie** lleva la cuenta, con una restricción medida: la pista es un `<text>` SVG centrado, sin salto de línea, y en su laptop (1366×643, vista Split: el lienzo 2D mide 681 px) la de la Pluma ya se corta 167 px por cada lado y la de la Línea interna 64 px. Lo que se añada a esas dos cae en la parte que no se ve. Por eso Alt se anuncia **cuando se pulsa Shift**: esa pista sustituye a la de la herramienta y es corta.

| Estado | Pista |
|---|---|
| en reposo, `Q` | la de hoy, que ya acaba en «· Shift+arrastrar: 0°/45°/90°» (643 px de 681). No cabe añadirle «con Alt» |
| en reposo, Pluma y Línea interna | sin cambios: no cabe nada más (el desborde es un fallo previo, con issue aparte) |
| Shift mantenido, las tres | **sustituye** a la pista: «Shift: ajusta a la hoja · añade Alt para ajustar al borde» (≈290 px) |
| Shift+Alt mantenidos | **sustituye**: «Shift+Alt: ajusta al borde · suelta Alt para la hoja» (≈260 px) |

Los nombres de las teclas salen de `shortcutDisplay` (⇧ y ⌥ en macOS, «Shift» y «Alt» fuera), como la pista de hoy (`${displayShortcut('⇧')}arrastrar: 0°/45°/90°`, que con la notación de Windows mide 643 px de 681). Los anchos entre paréntesis son estimados (≈4,95 px por carácter); se miden en el e2e antes de dar la tabla por buena.

La pista del Hilo (`Shift+arrastrar: 0°/45°/90°`) no cambia: el Hilo no tiene borde de partida.

### 4.3 Lo que no se añade

Ningún botón, interruptor, ajuste ni entrada de menú.

## 5. Piezas de código

### 5.1 `restriccionShift.ts` — geometría pura

- `restringirA45(desde, cursor, baseDeg = 0): Point2D` — generaliza `restringirAHoja45`, que desaparece: sus usos (Pluma, Línea interna, Hilo) pasan a `restringirA45(…)` con la base por defecto. `enderezarDesplazamiento(delta)`, el de `Q`, gana el mismo `baseDeg`. Con `baseDeg = 0` conserva los vectores escritos: la `y` de una horizontal idéntica a la del origen. Con otra base gira las ocho direcciones.
- `guiasShift(desde, cursor, referencia: AngleReference, alt: boolean): { punto: Point2D; activa: Guia; tenue: Guia | null }` con `Guia = { desde: Point2D; angleDeg: number }` en la convención de `polarPoint`. **Única fuente** del punto y de lo que se dibuja: la usan el hook para colocar y el overlay para pintar (la lección de maria-196).
- `tenue` es `null` cuando `referencia.baseDeg` es múltiplo de 45° (tolerancia 1e-9): los dos marcos dan las mismas direcciones.

### 5.2 `useShiftSostenido.ts` → `useModificadores.ts`

- Sigue **Shift y Alt**: `keydown`/`keyup` en `window` en captura, y `blur` los suelta los dos.
- Recibe `hayGesto: () => boolean`. Consume Alt solo cuando `hayGesto()` y Shift está pulsado (§ 3.5.2).
- Callback único `alCambiar({ shift, alt })`.

### 5.3 Hooks

- **`usePenTool`**: `alt` junto a `shift` en `PenState`; el marco del borde es el `angleReference` que ya calcula. `enderezar` pasa a usar `guiasShift`. Expone `guias`.
- **`usePolyPenTool`**: igual, con `referenceForNodes`. Expone `guias`.
- **`useEditPattern`**: al armar el arrastre (nodo o lado; también el primer press de `Q` que entra en la pieza y agarra el punto, `enterEditActuando`, que arma el mismo `dragRef`) guarda en el `drag` el `AngleReference` del lado de llegada — o del propio lado — en espacio de patrón. `aplicarArrastre` usa `guiasShift` con ese marco congelado. Expone `guias` mientras el arrastre dura.

### 5.4 `renderers/overlays/GuiasShift.tsx`

Componente pequeño: `{ guias, zoom }` → uno o dos `<line>`. Tokens del § 4.1; sin colores literales (R3 del trinquete de UI, `node scripts/ui-contract-lint.mjs`: no puede subir de 642). Lo montan `PenToolOverlay`, `PolyPenToolOverlay` y `EditPatternOverlay`. `pointerEvents="none"`.

### 5.5 Cableado

- `HintText.tsx` recibe `shift` y `alt` y aplica la tabla del § 4.2.
- `PatternEditor.tsx` solo cablea `guias` y los modificadores hacia overlays y pista; no calcula nada.

## 6. Pruebas

### 6.1 Unitarias de geometría — `restriccionShift.test.ts`

- `baseDeg = 0`: todo lo de hoy sigue pasando (horizontal y vertical exactas).
- Base del costado de la escena firmada (dirección 1:3, `71,565…°`): la perpendicular lee **90,0° al borde** exactos.
- `guiasShift`: Alt invierte activa y tenue; con base múltiplo de 45°, `tenue === null`.

### 6.2 Unitarias de hooks — `shift-hoja-y-borde.test.tsx` (renombra `shift-endereza-a-la-hoja.test.tsx`)

- **Pluma y Línea interna**: Shift+Alt desde un borde inclinado → píldora `90,0° al borde` y nodo sobre la perpendicular; el segundo tramo con Shift+Alt a escuadra con el primero (`±90,0° al tramo`).
- Pulsar o soltar Alt con la mano quieta cambia de guía; Alt sin Shift no hace nada.
- Primer tramo libre: Alt no cambia el punto y `guias.tenue === null`.
- **`Q`**: Shift+Alt sobre el punto final de un lado inclinado lo alarga sin cambiar su inclinación; el marco no gira durante el arrastre; pieza girada correcta; arrastrar un lado a 90° lo desplaza en paralelo.
- **`useModificadores`**: Alt consumido con gesto y Shift, intacto sin gesto; `blur` suelta ambos.
- Todo lo que ya prueba la rama `feat/shift-45-hoja` sigue pasando sin tocarlo.

### 6.3 E2e — `shift-endereza-a-la-hoja.spec.ts` (ampliado, ya en el gate del deploy)

- Delantero de la escena firmada, Línea interna: Shift+Alt da la perpendicular exacta y **hay dos rayos** en el DOM, el activo con `--accent-2d`.
- La pista del pie cambia con Shift y con Shift+Alt, y **cabe**: a 1366×643 en Split, `getComputedTextLength()` de la pista menor que el ancho del lienzo 2D.
- `Q`: Shift+Alt alarga el costado inclinado conservando su inclinación.

### 6.4 Evidencia para María

Capturas reales de las dos guías sobre la misma escena de su documento, para enseñárselas al desplegar.

## 7. Fuera de alcance

- La guía sobre un borde **curvo** funciona por construcción (la referencia ya es la tangente) pero no tiene pruebas propias en esta tanda.
- **«Ctrl suspende el enganche»** (§ 3.4) sigue sin implementar — salvo que la respuesta del § 3.5.1 obligue a reescribirlo.
- Shift (y Shift+Alt) en los arrastres de Seleccionar, Editar curva y los extremos de trazos e internas: antes hay que llevarles el cálculo desde el contorno del inicio del gesto (`applyAnchorMoves`) y, a las internas, el delta girado (#1068).
- El **resolutor único de enganche** (spec 2026-09-06): esto no lo adelanta ni lo bloquea; `guiasShift` es una pieza que ese resolutor puede absorber tal cual.
- Guías de alineación con otros puntos del patrón (smart guides): no es lo que pidió.
