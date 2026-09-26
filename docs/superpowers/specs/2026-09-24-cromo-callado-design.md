# Cromo callado — la dirección visual de Vina

> **Estado:** decidido el 2026-09-24, pendiente de plan de implementación.
> Sale de `docs/reports/2026-09-24-brief-elegancia-2026.md` (investigación, auditoría, tres
> direcciones juzgadas, crítico de completitud). Este documento es la norma; aquel es la evidencia.
> Las capturas citadas están en `docs/reports/ui-audit-2026-09-24/` (ignorada por git) y se rehacen
> en F0 con build de producción. Cada cita archivo:línea se verificó sobre `main` `b6c20565`.

## 0. La frase que ordena el documento

> **Samuel, 2026-09-24:** *"Vina es un programa de moda, tiene que ser una vaina súper elegante; yo
> apuntaba al minimalismo. Ahorita parece hecha por un backend. Reducir la carga cognitiva: no
> mostrar sino 3 o máximo 4 componentes por cada acción que se ejecuta."*

La lente que traduce ese pedido a una herramienta de trabajo, y que evita el choque con la ley de
densidad del contrato de interfaz: **minimalismo en Vina = menos cromo, más patrón.** Se recorta
lo que rodea al patrón y se calla lo que narra. No se agrega espacio en blanco, no se achica el
papel, no se agrandan los rótulos del patrón, no cambia la sans del cromo, no cambian los iconos,
no sale ninguna herramienta del catálogo.

Lo que hoy "parece de backend" está medido en el brief § 1 y cabe en una línea: **el cromo usa la
paleta, la mono y las sombras por defecto de un framework, y narra en prosa lo que el papel ya
muestra.** El patrón —crema, rejilla, tinta de 1 px, ocho costuras a luminosidad constante, la cota
como único bloque saturado— ya es un instrumento de moda. Se arregla el marco, no el instrumento.

## 1. Objetivo y no objetivos

**Objetivo.** Que en cada estado de uso haya en pantalla, además del patrón y del ambiente fijo,
como máximo cuatro componentes que aparecen o cambian; que todo el cromo esté hecho de un solo
material silencioso, en la familia tonal del papel, con un solo acento; y que un trinquete
automático lo defienda igual que `scripts/ui-contract-lint.mjs` defiende los tokens.

**No objetivos de esta ronda.** Rehacer la gramática de las herramientas (24 hooks; es el track del
informe 2026-09-04 § 4). El dueño del emplazamiento del borde 2D (spec 2026-09-05, propuesta).
Controles propios en lugar de `<select>` nativos y una sola "Tela" persistente (F7, ronda
siguiente). Cambiar la fuente del cromo, los iconos o la densidad del documento.

## 2. Decisiones tomadas (2026-09-24)

| # | Decisión | Quién | Resultado |
|---|---|---|---|
| D1 | Tono del cromo | la investigación, sin objeción de Samuel | **Grafito cálido**, tono OKLCH 80 (el papel es tono 94), croma 0,004-0,008, misma luminosidad que hoy. |
| D2 | Barra de IA | Samuel | **Se convoca.** No existe en reposo. Puertas: botón «IA» en la barra superior, `Ctrl+/` (ya registrado, `src/shortcuts/defaults.ts:115`) y `Ctrl+K` (paleta, `:119`). Se va con Esc. Difiere de la recomendación del brief (§ 5.2) y manda. |
| D3 | Fuente | Samuel | **Inter para todo.** Schibsted Grotesk sale de `index.html`; una sola mono (JetBrains Mono) solo para datos alineados. Enmienda la ratificación del 09-04 § 8, que decía "Schibsted + mono" sin que el código lo hiciera. |
| D4 | Acento | Samuel | **Tono 248, el del papel.** Un solo azul en toda la pantalla; el cromo adopta el paso fuerte que las cotas ya tienen verificado. |
| D5 | Qué cuenta en los 4 | Samuel | **La cabina del objeto cuenta como 1** (chips de cota + caja de transformación + barra flotante, juntos). Ambiente y documento no cuentan (§ 5.3). |
| D6 | Ranuras de panel | Samuel | **Una sola por debajo de 1440 px**, del lado contrario al dock, a ras; en Split, siempre a la derecha junto al 3D; a 1600+ se conservan dos. Enmienda la spec 2026-08-14 § 2.1-2.2. |
| D7 | 3D en esta ronda | recomendación, sin objeción | Sí, acotado a F3: un solo indicador de estado, mapas de ajuste tras el primer frame, escenario propio, visor vacío con frase. |
| D8 | Blur | recomendación, sin objeción | Fuera. Redefine el material overlay del contrato § 2. |
| D9 | Fila de capas | firma de María #1109 | Persistente y **callada** (F2). Plegarla a un botón solo con su firma en sesión con fecha. |
| D10 | Zona AUTO del dock | recomendación, pendiente de veto de Samuel | Fuera del dock; Escalado gana puerta explícita en LogoMenu › Patrón (`LogoMenu.tsx:271`). Se va el tercer acento (violeta), el rótulo a 8,5 px y el tooltip en inglés. Si Samuel la quiere, se queda hasta F5 y solo cambia de tono a `--ai`. |
| D11 | Propiedades | recomendación, sin objeción | Solo a petición (doble clic, verbo «propiedades» de la barra flotante). La apertura automática de `PatternEditor.tsx:326` se quita **después** de dar puerta propia al tipo de esquina del margen. |

## 3. Qué se ve, y cuándo

### 3.1 Ambiente (fijo, no cuenta)

Lo que está siempre y no cambia con la acción: barra superior (logo-menú, deshacer/rehacer, píldora
2D/Split/3D, botón «IA»), dock 2D (12 herramientas en tres grupos con separador: seleccionar/editar ·
dibujar · coser, más «+»), dock 3D (4), reglas y rejilla (son documento), píldora «Texturizado» en
3D. El dock no cambia de x al abrir un panel.

### 3.2 Reposo

| Estado | Lo que hay además del ambiente y del documento |
|---|---|
| 2D vacío (captura 01) | Estado vacío de tres líneas en Inter: «Importar DXF», «o arrastra el archivo aquí», «o descríbeselo a la IA» (botón que convoca la barra). Nada más: ni fila, ni tira, ni pista, ni barra. |
| 2D con patrón (captura 02) | Fila de capas callada (D9). Pista de reposo «Arrastra la pieza · Q edita sus puntos» **hasta que Q se haya usado una vez en el proyecto** (puerta por estado, no por tiempo: responde a la confusión grabada de María [12:48], #1103). Puntos del contorno en tinta `--ink-on-light-2`, no en acento (#1103 se respeta: siguen siempre visibles). La tira **no monta** sin nada que decir. La barra de IA no está. |
| 3D (captura 14) | Escenario `--scene-3d`, prenda o avatar. Si no hay nada colocado: una línea con botón, «Coloca las piezas sobre el avatar · Vestir avatar». Mapas de ajuste ocultos hasta el primer frame de simulación. |
| Split (captura 13) | 2D y 3D como arriba, un solo dock por lado, sin barra sobre el divisor. La ranura de panel, si hay una abierta, a la derecha. |

### 3.3 Por acción (techo: 4)

"Componente" = lo que aparece o cambia respecto al estado anterior. La cabina del objeto cuenta 1
(D5). Pista = 1 cuando cambia de texto.

| Acción | Componentes | Cuenta |
|---|---|---|
| Seleccionar y mover pieza | cabina (caja + **un** chip de cota activo, los demás con Tab + barra flotante de 4: rotar 90°, voltear, duplicar, propiedades; el candado va al menú contextual) · pista «Arrastra · clic en la cota escribe · Tab siguiente» | 2 |
| Escribir una cota | cabina (chip en edición, campo blanco con riel de foco + su línea de cota) · pista «Enter aplica · Tab siguiente · Esc suelta» | 2 |
| Pluma (H) | objeto (trazo + goma + **un** anillo de enganche `--snap-2d` bajo el cursor + píldora de medida con «Tab · escribe») · pista por fase: «Clic empieza · las esquinas enganchan» → «Clic añade · arrastra curva · Enter termina» → «· clic en el primero cierra» | 2 |
| Rectángulo (S) | cabina (caja en curso con sus dos cotas escribibles) · pista «Arrastra o clic · escribe sus cotas». La tira no monta («Un clic crea 100 × 100 mm» era eco de la pista) | 2 |
| Editar punto (Q) | cabina (glifos solo en la pieza seleccionada; nodo elegido en `--accent-fuerte` con su chip; «del punto» se funde en el chip) · leyenda de glifos «■ esquina · ● curva · ◆ abierto» una vez por proyecto, después «Arrastra · ⇧ endereza» | 2 |
| Coser (N) | objeto (borde bajo el cursor en acento; lado A sostenido con trazo más grueso; par en su `--seam-pair-n`) · pista «Clic en un lado» → «Ahora el otro · Esc suelta». «Tipo de costura» sale de la tira: es propiedad de la costura después de existir | 2 |
| Piquete (⇧N) | objeto (fantasma + espejo) · tira con sus opciones (única puerta de los defaults, gana «Ancho») · pista «Clic en un borde pone el piquete · escribe la distancia» · modal (F2) → chip + toast con Deshacer (F2b) | 4 → 4 |
| Margen (O) | tira con el campo del margen · objeto (previsualización) · pista | 3 |
| Medir (M) | tira con «Borrar mediciones» · objeto (medidas) · pista (rama nueva) | 3 |
| Simular | indicador único arriba a la izquierda («Simulando · WebGPU · 45 fps» / «En pausa» / avisos «⚠ 2» desplegables) · mapas de ajuste + engranaje al primer frame | 2 |
| Ajustar avatar | panel Avatar en la única ranura (en 2D el comando pasa a Split y lo abre; siete medidas como siete campos con `tabular-nums`, Modelo/Maniquí como chips, pose, «Más…» plegado) | 1 |
| Importar DXF | velo de arrastre (durante el gesto) · **un** toast «5 piezas cargadas» con Deshacer (hoy dos) · patrón encuadrado; con 0 piezas no montan fila, tira ni pista | 2 |
| Convocar la IA | barra de una línea (icono · campo «Pide algo o pregunta» · kbd) · panel de comandos si se escribe «/» o se llegó por `Ctrl+K` | 1-2 |
| Menú contextual (clic derecho) | menú (28 acciones en 7 grupos; a la barra flotante van 4) · cabina | 2 |
| Cambiar de vista / Split | píldora (ambiente) · ranura a la derecha si hay panel | 0-1 |

### 3.4 El trinquete de superficies

`tests/e2e/superficies-por-accion.spec.ts`, medido en navegador y no por CSS declarado (la
visibilidad, por geometría; la oclusión —quién pinta encima de quién— queda en los specs de
emplazamiento, que sí preguntan con `elementFromPoint`):

- **Superficie** = elemento con `data-superficie="<nombre>"`. Se marcan: cada superficie de material
  chrome u overlay, el texto de pista, y **una sola** `data-superficie="cabina"` que agrupa chips,
  caja de transformación y barra flotante. Ambiente (§ 3.1) y documento llevan
  `data-superficie="ambiente"` / `"documento"` y no cuentan. "Visible" se decide por geometría (caja
  dentro del viewport, sin `display:none`/`visibility:hidden`, opacidad acumulada > 0,05); la
  oclusión la miden los specs de emplazamiento, no este trinquete.
- Para cada una de las **diecisiete acciones** (las quince de § 3.3 más los dos reposos de § 3.2: 2D con patrón y Split) el spec
  ejecuta la secuencia de María con el DXF real, cuenta las superficies que aparecen o cambian
  respecto al paso anterior, y falla si la cuenta supera el techo efectivo — el mayor de la meta (**4**) y la línea base guardada en
  `tests/e2e/superficies-baseline.json` (mismo trinquete que `ui-contract-baseline.json`: solo baja;
  `SUPERFICIES_UPDATE=1 … --retries=0 --workers=1` fija el techo nuevo; nunca se edita a mano. Por debajo de la meta el diseño puede mover superficies; por encima, solo se baja (enmienda 2026-09-26: leído literal, el «supera 4 o supera la línea base» congelaba el diseño de hoy)).
- Se corre en F0 contra producción para escribir la línea base (hoy: entre 7 y 14 por acción) y al
  cierre de cada fase.

## 4. La piel

Todo vive en `src/styles/tokens.css`. Cada retiro de token va con **todos** sus consumidores
migrados en el mismo PR (R2 = 0 siempre). Los ratios se recalculan en F1 con script y se escriben en
el comentario del token, como hoy en `tokens.css:17-30`.

### 4.1 Neutros — tono 80, croma constante

| Token | Valor | Nota |
|---|---|---|
| `--bg-deeper` | `oklch(0.13 0.004 80)` ≈ `#080706` | |
| `--bg-base` | `oklch(0.16 0.004 80)` ≈ `#0e0d0b` | |
| `--bg-surface` | `oklch(0.19 0.005 80)` ≈ `#151411` | |
| `--bg-elevated` | `oklch(0.25 0.006 80)` ≈ `#23211e` | |
| `--border` | `oklch(0.32 0.006 80)` ≈ `#34332f` | 1,46:1 sobre surface: se ve |
| `--border-subtle` | `oklch(0.22 0.005 80)` ≈ `#1c1a18` | |
| `--scrim` | `rgb(8 7 6 / 55%)` | |
| `--scene-3d` | `oklch(0.26 0.004 80)` ≈ `#252422` | nuevo; fondo del escenario 3D, más claro que el cromo |

Hoy la rampa es tono 283-285 y el croma **sube** al apagar el texto (0,013 → 0,053): el gris más
apagado es lo más violeta de la pantalla. Aquí el croma es constante.

### 4.2 Texto — cuatro pasos

| Token | Valor | Ratio sobre surface | Uso |
|---|---|---|---|
| `--text-primary` | `oklch(0.93 0.006 80)` | 14,9:1 | |
| `--text-secondary` | `oklch(0.77 0.008 80)` | 8,9:1 | rótulos de sección, meta |
| `--text-tertiary` | `oklch(0.64 0.008 80)` | 5,5:1 | **nuevo**: atajos, placeholder, pistas |
| `--text-disabled` | `oklch(0.48 0.006 80)` | 2,8:1 | **nuevo**: SOLO estado deshabilitado, nunca una instrucción |

`--text-muted` (80 consumidores) queda como alias de `--text-tertiary`. `--text-ghost` (3,63:1) y
`--text-dim` (2,23:1) se retiran: hoy visten justo los atajos en 17 reglas, y un atajo a 2,2:1 es un
atajo que no existe (ley de puertas). Ningún texto por debajo de 4,5:1 sobre su fondo real; lo
verifica un e2e nuevo en F1.

### 4.3 Acento — uno, tono 248

| Token | Valor | Rol |
|---|---|---|
| `--accent` | `oklch(0.60 0.16 248)` ≈ `#0584da` | bordes, tintes, tiradores, **línea de selección sobre el papel** (3,43:1 sobre crema; hoy `--accent-2d` a L 0,66 da 2,70:1, por debajo del 3:1 gráfico) |
| `--accent-fuerte` | `:= var(--accent-2d-fuerte)` = `oklch(0.54 0.15 248)` | relleno con texto blanco (5,04:1). Ya verificado en `tokens.css:69`; `--cota-bg-2d` no se mueve |
| `--accent-fuerte-hover` | `oklch(0.56 0.15 248)` ≈ `#0278c7` | el relleno con texto al pasar el mouse: un paso más claro (+0,02 de L), el último en que el blanco sigue en AA (4,65:1). A `--accent` el blanco cae a 3,95:1; a ese paso solo suben los rellenos sin texto (Enviar, el dock activo), donde a un glifo le basta 3:1 |
| `--accent-ink` | `oklch(0.76 0.11 248)` | el acento escrito sobre el cromo (≈ 8,6:1) |
| `--accent-subtle` / `--accent-border` | `oklch(0.60 0.16 248 / 14%)` / `/ 30%` | |
| `--accent-2d` | alias de `--accent` | un solo azul en cromo y papel |
| `--ai` | `oklch(0.72 0.13 295)` ≈ `#ab93ed` | **nuevo**, único segundo tono: «esto lo hizo la IA». Nunca «activo». Sustituye `--dock-auto` y `--ai-2d` |
| `--success` / `--warning` / `--destructive` | `oklch(0.68 0.14 150)` / `oklch(0.75 0.14 75)` / `oklch(0.62 0.18 25)` (4,65:1) | semánticos apagados a la croma de la familia; `--destructive-hover` un paso más claro |
| `--destructive-fuerte` | `oklch(0.52 0.18 25)` ≈ `#ba2b2e` | relleno destructivo que lleva texto blanco (6,05:1); hermano de `--accent-fuerte` |
| `--destructive-fuerte-hover` | `oklch(0.54 0.18 25)` ≈ `#c13234` | Eliminar al pasar el mouse (5,57:1); el mismo paso que `--accent-fuerte-hover` |

Se retira `--accent-hover` (segundo nombre de `--accent-ink`). Migran a tokens los 17
`rgba(99,102,241,x)` literales (floating.css ×6, SubMenu.css ×4, unified-bar.css ×2, layout.css,
App.css, UnifiedBar.tsx, AppShell.tsx, ConnectionCard.tsx) y los 13 `#4a9eff` de los overlays 2D y
el cromo 3D.

### 4.4 Materiales — dos roles, un material, distinguidos por la sombra

| | `chrome` (acoplado) | `overlay` (flota y se va) |
|---|---|---|
| fondo | `var(--bg-surface)`, opaco | `rgba(21, 20, 17, 0.96)` (misma familia) |
| borde | `1px solid var(--border)` | `1px solid rgba(255, 255, 255, 0.07)` (hairline; hoy índigo al 15 %) |
| radio | 8 px | 8 px (`--radius-md`); píldora 999 solo para la barra de IA |
| sombra | **ninguna** (hoy 0 8px 32px al 40 %: la mancha a la derecha del dock, captura 02) | `0 1px 2px rgba(0,0,0,0.28), 0 8px 20px rgba(0,0,0,0.22)` |
| blur | — | **ninguno** (D8) |

La línea de pelo tiene nombre propio, `--hairline: 1px solid rgba(255, 255, 255, 0.07)`, y
`--surface-overlay-border` la referencia.

Variantes: `--surface-overlay-shadow-recessed: 0 1px 2px rgba(0,0,0,0.2)`; `-sheet` y `-recessed`
de fondo pasan a alias del material base (una sola opacidad, no tres). Radios concéntricos: el dock
de 52 px conserva 10 exterior con padding 4 y botones 6 (interior = exterior − padding); el resto
8/6. Se retiran `--radius-xl` (0 consumidores) y `--blur` (único consumidor:
`RenderSettingsPanel.css:19-20` → material overlay); `--radius-lg` (10 px) se conserva solo para el
dock (10 = 6 del botón + 4 de padding). El panel de contexto deja el overlay y toma
`chrome` a ras: sin margen, sin radio, sin sombra, borde lateral hairline (recupera 24 px por panel).
Hover: cambia solo la tinta (o `--bg-elevated` en botones de icono; en un relleno con texto, el
paso `-fuerte-hover` de § 4.3); ningún hover agrega sombra, escala ni brillo. Transiciones 150/200 ms solo para cambios de estado.

### 4.5 Tipografía

- **Una sans:** Inter, 400/500/600. `index.html` carga Inter 400/500/600 y JetBrains Mono 400/500;
  Schibsted Grotesk sale (D3). `--font-ui-2d` pasa a alias de `--font-sans`; Inter 700 sale del cromo.
- **Una mono, determinista:** `--font-mono: 'JetBrains Mono', ui-monospace, monospace`
  (`--font-mono-2d` igual; se borran los literales `'SF Mono','Fira Code'` de `unified-bar.css:234` y
  `ToolTooltip.css:57`, que hoy caen a la mono del navegador).
- **Regla de una línea para el contrato:** *mono = un dato cuya alineación carácter a carácter
  significa algo* (regla, cotas, píldora de medida, `kbd`). Sale de la prosa: «En reposo · 5 piezas»
  (`layout.css:27`), «2D» / «AUTO» / título del picker (`Dock.css:39/:119/:193`), valor de la tira
  (`ToolStrip2D.css:80`), el estado vacío entero (`EmptyState2D.css:38/:65/:77/:110`), el badge de
  `FitMapToggle.tsx`.
- **Dígitos:** regla global en `reset.css`: `.num, input[type=number], kbd, .readout
  { font-variant-numeric: tabular-nums }`.
- **Escala fija de cinco pasos** (sustituye los `clamp()` de `tokens.css:119-124`, que a 1366 rinden
  10,51 / 11,20 / 16,29 px): `--text-1` 11/16 (atajos, meta, pista) · `--text-2` 12/16 (etiquetas,
  menús, chips, rótulos de sección) · `--text-3` 13/18 (valores, campos, cuerpo de panel, campo de la
  IA) · `--text-4` 15/20 (título de panel, nombre de herramienta en la tira, peso 500) · `--text-5`
  18/24 (título del estado vacío). `@media (min-width: 1600px)` cada paso +1 px. Los tokens actuales
  (`--text-xs/sm/ui/input/heading/title`) quedan como alias en F1 y se retiran en F6.
- **Cero versalitas:** los 11 `text-transform: uppercase` y sus 10 `letter-spacing` distintos se
  borran («PIEZA / ANOTACIONES / REGLAS DE COLOCACIÓN», «AUTO», «1: SHELL», «SIMULANDO», «ACCIONES /
  PANELES») → sentence case 12 px / 500 en `--text-secondary`. Jerarquía por tamaño y tono, no por
  peso ni mayúsculas.

### 4.6 El papel no se toca

`--canvas-2d`, rejilla, `--ink-*`, `--seam-pair-1..8`, `--piece-*-2d`, `--notch-2d`, `--snap-2d`,
`--cota-*` quedan como están. Dos cambios sobre el papel y solo dos: los puntos del contorno en
reposo pasan de `--accent-2d` a `--ink-on-light-2` (siguen siempre visibles, #1103), y
`layout.css:39` (`#f5f3f0`) pasa a `var(--canvas-2d)`: un solo papel.

## 5. Las superficies, una por una

**Barra superior** (`TopBar.tsx`). Igual, más un botón «IA» a la derecha (puerta visible de D2). El
estado «● En reposo · 5 piezas» es solo DEV y María no lo ve; no se toca.

**Dock 2D** (`Dock.css`, `LeftDock.tsx`, `dockSlice.ts:93-96`). Tres grupos con separador. Rótulo
«2D» en Inter 11/500. Herramienta activa: relleno `--accent` con icono `--on-accent` (mecánica sin
cambio). Zona AUTO fuera (D10). Sin sombra (es chrome acoplado); radio 10 con botones 6.

**Tira de herramienta** (`ToolStrip2D.tsx`). Monta **solo cuando tiene algo que decir**: `falta`,
`desenlace`, `lineaDeSujeto`, `opciones.length > 0` o un bloque propio (Margen `:114-137`, Medir
`:150-163`). El envoltorio `aria-live` sigue montado. Las siete líneas «Editando: …» de `sujeto.ts`
(185, 213, 270, 291, 329-330, 352, 411) y «Un clic crea 100 × 100 mm» (`:219-220`) se van; «Pieza
nueva» (`:352`) es el único sujeto que monta la tira. Nombre de herramienta a `--text-4` / 500, no
`--text-heading` / 600. «Tipo de costura» (`seam.tsx:29-39`) sale; `notch.tsx` gana «Ancho» (1-20,
como `PieceProperties.tsx:283`) y fija un rango por opción antes de que F5 borre el bloque del panel.

**Fila de capas** (`FilaDeCapas.tsx/.css`). Persistente (D9). Callada: chips en `--text-tertiary`,
sin relleno `--accent-subtle`; el estado se lee en la marca (cuadrado relleno = visible, hueco =
oculta), que es la señal no cromática que exige la ley de estado. No monta con 0 piezas. Al pie del
lienzo a 12 px: `--band-bar` desaparece porque la barra ya no vive ahí.

**Pista** (`HintText.tsx`). ≤3 cláusulas por fase, en `--ink-hint` como hoy. Ramas nuevas para
`notch`, `measure` y `scissors` (hoy no tienen; `hand` `:203` e `internalShape` `:107` sí). Pista
de reposo con puerta por estado (Q usado una vez en el proyecto) y leyenda de glifos de Q una vez por
proyecto, ambas vía el patrón de `usePrecisionHint`.

**Barra de IA** (`UnifiedBar.tsx`, `barPosition.ts`, `unified-bar.css`). **Convocada** (D2). No
existe en reposo. Puertas: botón «IA» en la barra superior, botón del estado vacío, `Ctrl+/` (chat),
`Ctrl+K` (comandos), todos ya registrados o visibles. Al abrir: píldora de una línea, 560×48
(`BAR_HEIGHT` 58 → 48), material overlay, en la última posición guardada (`barPosition.ts` se
conserva: sigue arrastrable mientras está abierta, decisión del 2026-06-04). Contenido: icono ·
campo «Pide algo o pregunta» a `--text-3` en `--text-tertiary` · `kbd` en `--text-tertiary` sobre
`--bg-elevated`. **Un solo modo**: escribir es chat; «/» al inicio o `Ctrl+K` cambia el placeholder a
comandos y abre el panel encima; sin los tres botones circulares (`UnifiedBar.tsx:239-253`); botón
de enviar solo cuando hay texto. Esc con el campo vacío la cierra; con una conversación en curso, la
oculta y la conversación sigue en el store (se recupera al convocarla). El «Modo ajustes»
(`UnifiedBar.tsx:296-309`: `InputSchemeSection` + `AgentSettings`, popover de 560×384 que recorta
«Guardar preferencias» a 768 px) sale de la barra: pasa a **Preferencias** en el LogoMenu como panel
de contexto con persistencia inmediata. Enmienda D4 de `CLAUDE.md`. `--band-bar` (`tokens.css:152`)
y sus tres consumidores (`floating.css:12`, `FilaDeCapas.css:15`, `SnapshotBar.css:7`) se retiran:
lo que se acoplaba abajo vuelve al borde, y la barra, transitoria, flota encima como la paleta.
`App.css:14-28` (legacy) se elimina (R4 baja a 1).

**Paneles** (`floating.css:21-33`, `usePanelHost.ts`, `panelSide.ts`, `AppShell.tsx:320-353`).
Material chrome a ras (§ 4.4). Una ranura por debajo de 1440 px del lado contrario al dock; en Split
a la derecha; a 1600+ dos (D6). El dock no cambia de x. Puerta de Avatar solo en 3D/Split. Cabecera
`--text-4` / 500; secciones sentence case 12/500 con chevron. `PieceProperties.tsx`: nivel 1 =
Nombre, Margen (mm), Tela, Espejada; nivel 2 = «Producción…» plegado (Código de tela, Entretela,
Anotaciones, Reglas de colocación, Capa/Subcapa, Simulación). Se borran los cuatro chips de
preajuste de margen (`:83-97`: escriben un número que ya tiene campo) y «Ajustes de piquete»
(`:255-295`: duplica la tira con otro vocabulario y otros rangos). `<select>` nativos con
`appearance: none` + chevron Lucide sobre `--bg-elevated` (no se escribe un componente nuevo en esta
ronda); checkbox como marca cuadrada. Un ancho de campo por rol. Propiedades a petición (D11).
Capas: `Eye/EyeOff/Lock/Unlock` de Lucide en lugar de emojis (`LayerPanel.tsx:316/:327/:375`),
nombres «Forro / Exterior / Avíos» (`projectSlice.ts:1777`), z-index por rol. Avatar: medidas →
pose → «Más…»; un campo por medida con `tabular-nums` (hoy 21 controles para 7 números); los 17
`style={{}}` a `AvatarPanel.css`.

**3D** (`SimulationStatusOverlay.tsx`, `RightDock.tsx:119-125`, `FitMapToggle.tsx`,
`SnapshotBar.tsx`, `Viewport3D.tsx`, `renderSettingsSlice.ts:180`). Un solo indicador de estado en
material chrome a ras, `--font-sans`, semánticos, sin emoji; el pill «SIMULANDO · fps» del dock se
va (test y comentario enmendados). Mapas de ajuste y engranaje solo desde el primer frame; sus 36
colores y 5 z-index inline a CSS. `Viewport3D.css:13-25` sin uppercase. SnapshotBar «+» con rótulo
«Guardar versión». Escenario `--scene-3d` vía el default del slice con puente `getComputedStyle`,
tras localizar de dónde sale el negro de las capturas 14/15 pese al default `#e0e0e0`. Botón CC
muerto (`Viewport3D.tsx:1013-1045`) eliminado.

**Estado vacío** (`EmptyState2D.tsx/.css`). Tres líneas en Inter; atajo desde `shortcutDisplay`
(hoy «(P)» contradice el registro, que da H a la Pluma).

**Menú contextual y barra flotante** (`actionCuration.ts`, `FloatingActionBar.tsx`).
`BAR_MAX_VISIBLE` 5 → 4; el candado al menú. Barra flotante a tokens y a un rol de la escala
(`:72/:77/:78/:103`).

## 6. Enmiendas al contrato y a specs anteriores

| Documento y regla | Cambio | Razón escrita |
|---|---|---|
| `SKILL.md` § 2: overlay «translúcido con desenfoque»; `tokens.css:175-177` | overlay = casi opaco (0,96), hairline al 7 %, sombra corta en dos capas, **sin blur** | Con 92 % de opacidad el blur desenfocaba el 8 % restante y creaba los contextos de apilamiento que recortaron ConnectionModal. Verificar `emplazamiento-modales.spec.ts` en navegador antes de mezclar F1. |
| `SKILL.md` § 2: dos materiales distinguibles | Comparten fondo, hairline y radio; se distinguen por la sombra | Los dos roles siguen existiendo como tokens y se usan enteros. Se escribe para que no parezca fusión por descuido. |
| `SKILL.md` § 2, excepción: la tira «está mientras hay herramienta 2D activa» | «está mientras tenga algo que decir» | Actualizar `tests/e2e/emplazamiento-tira.spec.ts:20-22` y `ToolStrip2D.test.tsx:110`. |
| `SKILL.md` «Lo que NO se hace»: cambiar tipografía; informe 09-04 § 8 «Schibsted + mono» | Enmendar § 8: la piel es «Inter + JetBrains Mono para datos» | D3. El cromo ya era Inter; se quita una familia, no se cambia la sans. |
| `SKILL.md` § 5 (nuevo): regla de mono | «mono = un dato cuya alineación carácter a carácter significa algo» | § 4.5. |
| Spec 2026-08-14 § 2.1 (paneles como tarjeta con margen) y § 2.2 (dos ranuras) | Panel a ras; una ranura <1440, en Split a la derecha, dos a 1600+ | D6. Dos líneas de enmienda con fecha. |
| Spec 2026-08-14 § 2.1: docks y barra flotan | Se respeta; la barra flota solo mientras está convocada | D2. Deuda anotada: la silueta de tarjeta con hueco de 12-14 px del dock, la tira y la fila queda para el dueño del emplazamiento (spec 2026-09-05). |
| `CLAUDE.md` D4: «AgentSettings re-homed in UnifiedBar settings mode» | → panel «Preferencias» desde LogoMenu | ConnectionModal ya es `createPortal`; el apilamiento no cambia. |
| `RightDock.tsx:122` + `RightDock.test.tsx` (pill «SIMULANDO») | Se elimina en favor del indicador único | No hay spec; el test y el comentario dicen por qué. |
| Firma de María #1109 (fila persistente) | Persistente y callada; plegado solo con firma | § 8. |
| Firma de María #1103 (puntos siempre visibles) y `HintText.tsx:141-148` | Cambio de tinta, no de regla; pista por estado | § 8. |
| `SKILL.md` § 6 ley de puertas | AUTO fuera → Escalado en LogoMenu › Patrón; «Ajustes de piquete» fuera → «Ancho» y rangos en la tira primero | D10, § 5. |
| `SKILL.md` § 1 / trinquete R2 | Tokens nuevos (`--text-tertiary`, `--text-disabled`, `--ai`, `--scene-3d`, `--text-1..5`, `--hairline`, `--destructive-fuerte`, `--accent-fuerte-hover`, `--destructive-fuerte-hover`) y retirados (`--text-ghost`, `--text-dim`, `--dock-auto`, `--ai-2d`, `--accent-hover`, `--radius-xl`, `--blur`, `--band-bar`, `--font-ui-2d` como familia) | Cada retiro con todos sus consumidores en el mismo PR. |
| `SKILL.md` § Verificación (nuevo) | El trinquete de superficies (§ 3.4) junto al de tokens | Sin él, el techo de 4 es prosa. |

## 7. Fases

Cada fase es uno o dos PR. Gate: `npx tsc -b --noEmit && npm run test && npm run lint && npm run
lint:ui`; las que tocan apilamiento pasan además por navegador (`emplazamiento-*.spec.ts`). Al
cierre: `node scripts/ui-contract-lint.mjs` (hoy R3=639, R4=2, R5=35, R6=8, R8=24), `--update` si un
contador bajó, y el trinquete de superficies. Ninguna se mezcla con `--no-verify`.

| Fase | Tamaño | Depende de | Alcance | Se mide | Neto de superficies |
|---|---|---|---|---|---|
| **F0** Capturas de producción y trinquete | XS/S | D5 | Rehacer las capturas con `npm run build && npm run preview` (las de hoy llevan `TopBar.tsx:81` y `SolverMetrics.tsx:36`, solo DEV; la 04 es idéntica a la 03 y falta el menú contextual). Marcar `data-superficie`. Escribir `superficies-por-accion.spec.ts` y la línea base para las 16 acciones. Sin cambios visibles. | línea base numérica | igual |
| **F1** Piel | M | D1, D3, D4, D8 | § 4 entero en `tokens.css` + los literales que copian el material (§ 4.3, sombras de `floating.css:162`, `Dock.css:190`, `AppShell.tsx:313`; `ToolTooltip.css` y `SubMenu.css` al material por token; `unified-bar.css:25/:43/:234`; `layout.css:39`); `index.html`; `reset.css` (`tabular-nums`); `PuntosDelContorno` en tinta; comentarios de ratio; tests `HintText.legibilidad`, `acento-unico-en-el-cromo`, `Dock.jerarquiaDeEstado`, `zIndexScale`; enmienda de `SKILL.md` § 2 y § 5. | R3 −30 o más; `emplazamiento-modales` verde en navegador; e2e nuevo: ningún texto <4,5:1 | igual (cambia de qué están hechas, no cuántas) |
| **F2** Silencio en reposo 2D | M | D9, D10 | Tira monta solo con algo que decir; `sujeto.ts` sin «Editando:»; `seam.tsx` sin tipo; `notch.tsx` con «Ancho» y rangos; fila callada + gate 0 piezas; `Dock.css` en sans, tres grupos, AUTO fuera con puerta a Escalado en LogoMenu › Patrón; `HintText` corto por fase + ramas `notch/measure/scissors` + reposo y leyenda de Q por estado; `actionCuration.ts:129` a 4; `FloatingActionBar` a tokens; un anillo de enganche en Pluma; `EmptyState2D` a tres líneas. Tests: `emplazamiento-tira`, `ToolStrip2D.test:110`, `Dock.jerarquiaDeEstado`, `las-siete-puertas-que-se-abren`, `dock2dTools.puertas`. **Sesión con María antes de mezclar** (§ 8). | reposo con patrón 8 → 3 (fila, pista y la barra de IA, que sale en F4) y 3 → 2 cuando Q ya se usó; seleccionar pieza ≤2 | reposo 8 → 3; Rectángulo −1 (tira); Margen y Medir igual; barra flotante 5 → 4 |
| **F2b** Piquete sin modal | S | validación con María | Chip «a 12 mm de la esquina» + `showUndoToast`; `NotchPrecisionModal.tsx` y `notchPrecisionCopy.ts` fuera; `1099-*.spec.ts` y `1125-*.test.tsx` reescritos al chip. | piquete ≤4; R8 (z-index literal) no sube | 1 modal → chip + toast (declarado: es el único injerto que suma en el instante del gesto; ninguno comparte esquina con la tira) |
| **F3** Un estado en 3D | S | D7 | § 5 «3D» entero. | un solo indicador (e2e); simular ≤2; R3 −36, R8 −5 | simular 2 → 1 en producción (4 → 1 en las capturas DEV); reposo 3D +1 (frase) −1 (mapas) = 0 |
| **F4** Barra de IA convocada | M | D2 | § 5 «Barra de IA» entero: puertas (botón «IA» en `TopBar.tsx`, botón del estado vacío, `Ctrl+/`, `Ctrl+K`), un modo, 48 px, Esc, conversación persistente en el store; Preferencias desde LogoMenu (hoja CSS propia, sin `style={{}}`; enmienda D4); `--band-bar` fuera con sus tres consumidores; `App.css:14-28` fuera. Tests: `unifiedBarPosition.test.ts`, `command-palette.spec.ts`, ConnectionModal en navegador; posición guardada re-clampeada; e2e nuevo: reposo sin barra, `Ctrl+/` la monta, Esc la desmonta. | R4 = 1; reposo con patrón 3 → 2 | reposo −1 (la barra); convocar la IA 1-2 |
| **F5** Paneles acoplados y de dos niveles | M · **es emplazamiento, no piel** | D6, D11 | § 5 «Paneles» entero; toca `usePanelHost.ts`, `panelSide.ts`, `AppShell.tsx`; puerta al tipo de esquina del margen antes de quitar `PatternEditor.tsx:326`; enmienda spec 2026-08-14 § 2.1-2.2. Tests: `ContextPanel.canaleta`, `panelSide`, `usePanelHost`, `emplazamiento-paneles`; e2e: dock sin cambio de x; lienzo a 1366 con un panel ≥1000 px. **Silueta del panel a ras y Propiedades a petición: enseñar a María.** | ajustar avatar ≤1; Split con una ranura a la derecha | seleccionar pieza (esquina del margen): −1 panel, +1 puerta en el menú del vértice; avatar 21 controles → 7 campos |
| **F6** Migración tipográfica por archivo | L, en 3-4 PR XS/S | F1-F5 mezcladas | 141 `font-size` literales en CSS y ~113 inline en TSX → `--text-1..5`; 11 uppercase y 17 letter-spacing fuera; retirar alias viejos, `--radius-lg/xl`, `--accent-hover`, `--dock-auto`, `--ai-2d`, `--blur`. | font-size literales a 0 por archivo; R2 = 0 siempre | igual |
| **F7** (ronda siguiente) Controles propios y una Tela | L | decisión de producto nueva (Tela persistente vs preview) | `ListaDesplegable` con overlay, teclado y `createPortal`; chips segmentados; Anotaciones con sugerencias; Tela como fila con búsqueda. | — | sin medir |

Orden: F0 → F1 → F2 → F3 y F4 (independientes entre sí) → F2b y F5 (tras María) → F6. F1 se puede
empezar el mismo día que F0; F2 no se mezcla sin la sesión con María.

## 8. Validación con María

Tres cosas firmadas por ella se tocan solo en lo visual y aun así se le enseñan **antes de mezclar
F2**, en una sesión con fecha: la fila de capas callada (#1109), los puntos del contorno en tinta
(#1103) y la tira que deja de montarse sin sujeto. En la misma sesión: la pista de reposo por estado.
Lo que **no** se escribe sin su firma: plegar la fila a un botón, el piquete sin modal (F2b), la
silueta del panel a ras y Propiedades a petición (F5). Si «callada» le basta, la fila no se pliega.

## 9. Riesgos

- **Quitar el blur cambia contextos de apilamiento en 20 sitios.** Algo que hoy se recorta dentro de
  un overlay puede empezar a escapar, y al revés. La suite unitaria es ciega (contrato § Verificación);
  la prueba es el navegador antes de mezclar F1.
- **La línea de selección a L 0,60 da 3,43:1 sobre el crema.** Si en pantalla se ve floja, la
  salida es bajar L (no subir la croma) y recalcular los tres pasos.
- **`--scene-3d` cambia la lectura de los mapas de ajuste y del texturizado.** Verificar con una
  simulación real, no con el visor vacío de las capturas. Y localizar primero el origen del negro
  actual.
- **La barra convocada quita la promesa de la IA de la vista.** Mitigación: botón «IA» siempre
  visible en la barra superior y línea en el estado vacío. Si en la sesión con María la IA deja de
  usarse, se revisa D2.
- **`Ctrl+K` en Chrome/Edge en Windows** es la búsqueda de la barra de direcciones; es interceptable
  con `preventDefault` (ya lo hace la paleta hoy). Verificar en la máquina de María en F4.
- **Muchos tests fijan valores actuales** (`acento-unico-en-el-cromo`, `Dock.jerarquiaDeEstado`,
  `HintText.legibilidad`, `zIndexScale`, `dock2dTools.puertas`, snapshots de tira y fila). Cada fase
  lleva su actualización; ninguna se salta.
- **El trinquete no puede subir.** Cada token retirado va con todos sus consumidores en el mismo PR.
- **F6 es la fase más larga y la de menor rendimiento visual por PR.** Va al final, cuando el
  resultado ya se ve, para que no se confunda con «no cambió nada».

## 10. Fuera de alcance y relaciones

- La gramática de herramientas (sujeto, «no pasó nada», resorte a la flecha): informe 2026-09-04 § 4
  y specs de la tanda 6. Este spec no la toca; F2 solo cambia lo que las herramientas **muestran**.
- El dueño del emplazamiento del borde 2D (spec 2026-09-05, propuesta): la silueta de tarjetas con
  hueco de 12-14 px queda como deuda suya. La regla de ranura de F5 se escribe en `panelSide.ts`
  y es compatible con aquel spec.
- F7 y cualquier control propio: ronda siguiente.

## 11. Referencias que sostienen las decisiones

Las que se abrieron y se citan textualmente en el brief § 2: Figma, *Our approach to designing UI3*
(2024-10-01) y *Behind our redesign: UI3* (2024-06-26); Linear, *refresh* (2026-03-12); Raycast,
guías de diseño; Shapr3D, blog de diseño; Apple WWDC25 sesión 356; NN/g, Kaplan (2025-11-28);
Cowan (2001); Calm Technology; 925 Studios, *AI slop design tells* (2026-09-23); Alan West, dev.to
(2026-03-25). Los catálogos de tendencias de marketing («espaciados generosos», títulos ≥2,4 rem) se
leyeron y se rechazan: hablan de landing pages.
