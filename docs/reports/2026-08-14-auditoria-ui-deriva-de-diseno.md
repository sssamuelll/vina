# Auditoría adversarial de la interfaz de Vina: la deriva de diseño

**Fecha:** 2026-08-14
**Estado del árbol auditado:** `19223520` en `main`
**Método:** censo mecánico del código + recorrido en vivo del navegador contra el
patrón real de María (`tests/fixtures/garments/maria_patrones_samuel_2M.dxf`),
midiendo **estilos computados**, no CSS leído.

---

## 0. La tesis, y el veredicto

Samuel planteó el diagnóstico así:

> "Cada ráfaga de arreglos que yo le pido a Claude Code toma sus propios
> principios de diseño y terminan creando nuevos elementos en la interfaz sin
> que haya un contrato que hagan que sigan un conjunto de reglas, por lo tanto
> termina montando interfaz sobre interfaz."

**Veredicto: confirmado, y se puede medir.** Pero la causa no es la que suena.

No es falta de gusto ni falta de tokens. Vina **sí tiene** un sistema de tokens
(67 en `src/styles/tokens.css`, con 575 usos de `var(--…)` en CSS). Tiene una
paleta de comandos genuinamente bien diseñada. Tiene un estado vacío que enseña.
Tiene un menú de aplicación completo. El microcopy en español está bien escrito
casi en todas partes.

El problema es más preciso, y por eso tiene arreglo. Y es peor de lo que suena,
porque no es que falte el contrato:

> **El contrato ya existe, en pedazos, y nada lo hace cumplir.**

Esto es lo que apareció al auditar, y cambia por completo cuál es el trabajo:

| Contrato que YA existe | Estado |
|---|---|
| `src/styles/tokens.css` — 75 tokens, buena nomenclatura | se rodea con 9 nombres fantasma |
| `docs/specs/2026-07-16-ui-copy-es-glosario.md` — idioma, 21 términos del oficio, 19 de UI, 5 reglas duras | se viola dentro de un mismo componente |
| `shortcutDisplay.ts` — helper canónico de atajos (lo manda la regla 2 del glosario) | tres superficies lo ignoran; conviven cinco formatos |
| `ContextPanel` — host de panel con Escape y clic-afuera | tres paneles lo bypassean o lo duplican por dentro |
| `.icon-btn` — botón de icono canónico y tokenizado | solo 3 sitios lo usan; hay 7 reimplementaciones |
| 59 iconos dibujados a mano en `src/tools/definitions/` (18×18, `strokeWidth 1.5`, el set más coherente del repo) | ninguna superficie los renderiza |
| `PanelErrorBoundary` — ratificado en el RFC E-async-states | código muerto; los 7 paneles lazy quedan sin red |
| Campo `nameEs` con 54 traducciones, obligatorio en el tipo | lo consume el copiloto, no la UI |

Ocho contratos escritos. Ocho rodeados. **Escribir un noveno no arregla nada.**
Lo que falta no es la regla: es el mecanismo que la hace cumplir.

Dicho de otro modo, la capa de tokens contesta "qué valores existen", nada
contesta "cuál valor va dónde", y **nada verifica ninguna de las dos cosas.**

La prueba está en `src/components/shell/AppShell.tsx:234-262`. Es un bloque de 28
líneas con estilos en línea, escrito en alguna ráfaga, que hace esto:

```js
background: 'rgba(99, 102, 241, 0.12)',      // --accent-subtle existe y es 0.13
border: '2px dashed var(--accent, #6366f1)',
background: 'var(--bg-elevated, #1e1e1e)',   // --bg-elevated es #1a1a2e, NO #1e1e1e
color: 'var(--text-primary, #fff)',          // --text-primary es #e2e8f0, NO #fff
borderRadius: 8,                             // --radius-md es 8px
fontSize: 15,                                // 15px no está en la escala
zIndex: 50,                                  // 50 no está en el juego de capas
boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',  // idéntica byte a byte a la del dock
```

Ocho decisiones. Cinco duplican un token que ya existía. Dos *fallbacks*
devuelven un color **de otra familia** que el token al que respaldan. Uno inventa
una capa nueva. Quien lo escribió no hizo nada malo: **no había regla que
consultar.**

Y hay algo peor que la falta de regla, que es lo que hizo la deriva invisible
durante meses. Está en §4.1: **el `var(--x, fallback)` convierte un token
inexistente en código que se lee como tokenizado y renderiza perfecto.** Hay 9
nombres de token en Vina que no existen en ningún archivo, referenciados 63
veces, y ninguno rompió nunca nada.

---

## 1. La medida de la deriva

Todo lo de esta sección está medido, no estimado.

### 1.1 Siete materiales para una sola idea

Hay siete tratamientos distintos para "una cosa oscura que flota sobre el
lienzo". Seis medidos con estilos computados en vivo, más el toast (el único
claro), observado:

| # | Superficie | Fondo | Radio | Borde | Sombra | Blur | z |
|---|---|---|---|---|---|---|---|
| 1 | `dock` (izq. y der.) | `#10101c` opaco | 12px | 1px `#2a2a42` | `0 8px 32px /.4` | — | 5 |
| 2 | controles del visor 3D | `#2a2a2a` opaco | 4px | ninguno | `0 2px 8px /.3` | — | 10 |
| 3 | `context-panel` | `rgba(8,8,15,.95)` | 12px | 1px `#2a2a42` | **ninguna** | `blur(12px)` | 25 |
| 4 | `floating-action-bar` | `#1a1a1a` opaco | 6px | 1px `#333` | `0 2px 8px /.4` | — | 90 |
| 5 | `unified-bar` (barra de IA) | `rgba(8,8,15,.78)` | **29px** | 1px índigo `.15` | `0 4px 18px /.22` | `blur(16px)` | 100 |
| 6 | `context-menu` | `rgba(8,8,15,.92)` | **14px** | 1px índigo `.15` | `0 8px 32px /.4` | `blur(16px)` | 1000 |
| 7 | toast | claro | — | — | — | — | — |

Cuatro negros distintos. Cinco radios (4, 6, 12, 14, 29). Dos familias de borde
(gris azulado contra índigo al 15%). Tres sombras más una sin sombra. Tres con
blur y cuatro sin. Y las capas van 5, 10, 25, 90, 100, 1000 sin escala que las
gobierne.

Fíjate en el detalle que más delata: `context-panel` (`.95`, 12px) y
`context-menu` (`.92`, 14px) y `unified-bar` (`.78`, 29px) son *casi* el mismo
material. Tres intentos de la misma idea, ninguno igual a otro.

Y el `context-panel` — el único que se para encima de un lienzo lleno de dibujo —
es justo el que **no tiene sombra**, o sea el que menos se separa del fondo.

Esos siete son solo los que estaban en pantalla. El censo estático del código
—hecho aparte, sobre los 32 archivos CSS— encuentra **32 superficies flotantes**,
y para la misma idea: **20 fondos distintos, 11 radios** (0, 3, 4, 6, 8, 10, 12,
14, 16, 20, 29) **y 15 recetas de sombra**, con **cero tokens de sombra** y el
token de desenfoque usado 2 de 19 veces.

El detalle que cierra el caso: hay **45 pasos de opacidad inventados a mano** —
21 alfas distintas de blanco, 15 de negro y 9 del índigo del acento (0.08, 0.1,
0.12, 0.13, 0.14, 0.15, 0.2, 0.27, 0.3) — sobre un sistema que define
exactamente dos. No hay escala de elevación ni de velo, así que cada ráfaga
inventó la suya.

### 1.2 Diecisiete botones en una sola pantalla

Con el proyecto cargado y **ningún panel abierto**, conviven 17 firmas visuales
distintas de `<button>`. En el CSS hay 25 clases que contienen `btn`/`button`,
con tres convenciones de nombre mezcladas: kebab plano (`panel-btn-sm`), BEM
(`unified-bar__mode-btn`) y prefijos por componente (`ap-btn`, `cb-icon-btn`,
`ref-img-btn`).

De ahí salen cuatro acentos distintos conviviendo:

| Color | Dónde |
|---|---|
| `#6366f1` índigo (`--accent`) | herramienta activa del dock, bordes de vidrio |
| `#a78bfa` violeta (`--dock-auto`) | zona AUTO del dock |
| `#4a90d9` azul | control activo del visor 3D |
| `rgba(74,158,255,…)` otro azul | botón de imagen de referencia |

El mismo componente `dock__tool` se pinta en **dos tonos de acento distintos**
según su significado, sin que nada documente esa distinción.

### 1.3 El resto del censo

| Dimensión | Medida |
|---|---|
| Tokens definidos | 67 |
| Usos de `var(--…)` en CSS | 575 |
| Colores hex distintos **hardcodeados** en CSS | 81 |
| `rgb`/`rgba` distintos hardcodeados en CSS | 70 |
| Colores hex distintos hardcodeados dentro de `.tsx` | 132 |
| `style={{…}}` en línea | 292, repartidos en 51 archivos |
| Valores distintos de `z-index` | 15 (1, 5, 10, 15, 20, 25, 30, 100, 200, 210, 300, 1000, 1010, 9999, 10000) |
| Formas distintas de `border-radius` | 21 |
| Valores distintos de `font-size` | 21 |

Los tamaños de fuente cuentan la historia solos: `11px` aparece 49 veces crudo,
`10px` 26 veces, `12px` 24 veces — mientras `var(--text-xs)` aparece 20 veces.
Y luego están `8.5px`, `10.5px`, `11.5px` y `0.88em`: eso no es una escala, es
alguien empujando un caso puntual dos décimas para que le cuadre.

### 1.4 El teclado quedó fuera: 76 contra 6

Contando selectores en los 32 archivos CSS:

| Pseudo-estado | Selectores |
|---|---|
| `:hover` | **76** |
| `:disabled` | 18 |
| `:focus-visible` | **6** |
| `:active` | **1** |

El ratio ratón:teclado es de 12 a 1. De esos seis `:focus-visible`, uno es una
regla global suelta y los otros cinco cubren cuatro componentes: `.dock__tool`,
`.dock__add` y dos botones del estado vacío. Todo lo demás —paneles, la barra de
IA, los controles del visor, los menús— no tiene anillo de foco propio.

Encima hay **nueve `outline: none`**, varios sobre campos de texto
(`LayerPanel.css:28`, `PropertiesPanel.css:163`, `unified-bar.css:97`,
`BOMTab.css:155`, `GradingTab.css:127`, `NestingTab.css:67`,
`AvatarPanel.css:230`), sin reemplazo documentado. Quitarle el contorno a un
campo de texto sin poner otra señal es una barrera de teclado, no un detalle
estético.

Y `:active` aparece **una sola vez** en todo el proyecto: hacer clic en un botón
de Vina casi nunca devuelve confirmación física.

Esto también es deriva, y de la más clara: cada ráfaga estilizó el hover porque
es lo que se ve al probar con el mouse, y nadie probó con Tab.

### 1.5 El fósil que el propio código guarda

`src/store/dockSlice.ts` conserva **cuatro generaciones** del juego de
herramientas por defecto del dock: `LEGACY_DEFAULT_DOCK_2D_IDS`, `…_V2`, `…_V3` y
el vigente `DEFAULT_DOCK_2D_IDS`. Los comentarios citan `#1028`, `maria-203` y
`#219`.

Es el registro literal de la tesis: el contenido de la barra de herramientas se
renegoció cuatro veces, un ticket a la vez, sin que nadie fuera dueño del
conjunto.

---

## 2. Los defectos que María sufre hoy

Estos no son estéticos. Son de uso, y los tres salen del mismo hueco de contrato.

### 2.1 La instrucción de la herramienta Coser es ilegible — contraste 1.11:1

Al activar **Coser**, la única cosa que le explica a María el gesto nuevo dice:

> "Clic: cose el lado entero · arrastre: cose solo un tramo"

Medido en vivo:

- tinta real del texto: `rgba(255, 215, 0, 0.5)` — oro al 50%, escrito a mano
- fondo efectivo: `rgb(245,243,240)` = `#f5f3f0` (el papel crema del lienzo)
- **razón de contraste: 1.05:1.** WCAG AA exige 4.5:1.
- tamaño: 11px, a 14px del borde inferior de la ventana, medio tapado por la barra de IA.

> **Corrección al primer diagnóstico.** En la auditoría leí este defecto como
> "`--text-primary` (`#e2e8f0`) aplicado a un `<text>` de SVG sobre el crema", y
> di 1.11:1. Era incorrecto: mi medición leyó la propiedad `color`, que en un
> `<text>` de SVG **no pinta** cuando hay un `fill` explícito. El `fill` real era
> `rgba(255, 215, 0, 0.5)`, repetido a mano siete veces en el mismo archivo, y el
> contraste verdadero es **1.05:1** — todavía peor. El hallazgo se sostiene; el
> mecanismo que le atribuí no. Y el mecanismo verdadero es más elocuente: oro
> sobre oscuro es una elección razonable, así que alguien escribió esa tinta
> pensando en un lienzo oscuro y nadie volvió a mirarla cuando el lienzo se
> volvió papel.

O sea: **la funcionalidad de arrastre que acabamos de construir en #1029 se
explica con un texto prácticamente invisible.** Y la causa es exactamente la
falta de contrato: el texto es un `<text>` de SVG dibujado *dentro* del lienzo, y
alguien le aplicó `--text-primary`, que es el blanco pensado para el cromo
**oscuro**. El token existe y es correcto; lo que falta es la regla que diga en
qué superficie es legal usarlo.

Esto conecta con la nota que ya teníamos guardada: las tarjetas de María suelen
ser de descubrimiento, no de funcionalidad. Aquí la función existe y está bien
hecha; lo que no existe es la manera de enterarse.

### 2.2 El resaltado de "herramienta activa" pierde contra el de "el mouse está encima"

Medido en `src/components/shell/Dock.css`:

```css
.dock__tool:hover        { background: var(--bg-elevated);   color: var(--text-primary); }
/* #1a1a2e opaco + icono blanco */

.dock__tool--active      { background: var(--accent-subtle); color: var(--accent); }
/* índigo al 13% + icono índigo */
```

Verificado a ojo con Pluma activa y el cursor sobre Tijeras: **la herramienta
meramente apuntada se ve más seleccionada que la que de verdad está activa.**
Además, el estado activo se distingue casi solo por **tono** (índigo contra gris)
en un icono de 16px, que es la señal más débil disponible y la que falla para
quien no distingue bien los colores.

> Nota de honestidad: en una medición intermedia leí el estado activo como
> `transparent` y llegué a escribir que el indicador estaba muerto. Al
> re-medirlo, sí aplica (`rgba(99,102,241,.13)`). Aquello fue un artefacto de
> re-render. El hallazgo real es el de arriba, que es más chico pero verdadero.

### 2.3 La herramienta Piquete no tiene puerta

Del catálogo en `src/components/shell/dock2dTools.ts`:

| Herramienta | ¿En el dock por defecto? | Atajo |
|---|---|---|
| `notch` — **Piquete** | no | **ninguno** |
| `seamAllowance` — **Margen de costura** | no | `O` |
| `grainline` — **Hilo** | no | ninguno |
| `internalShape` — **Forma interna** | no | `G` |

**Piquete no tiene botón.** La única forma de llegar es abrir el personalizador
del dock (el `+`) y agregarla a mano. Margen de costura tampoco tiene botón:
depende de que María sepa que existe la tecla `O`.

Son justo las dos herramientas sobre las que trabajamos #1027 y #1029.

> **Corrección, y el hallazgo mejora.** Escribí que Piquete "no tiene ni botón ni
> atajo". La mitad es falsa: `tool.notch` **sí** tiene atajo registrado —
> `Shift+N`, en `src/shortcuts/defaults.ts:71`, junto con `Shift+G` para Hilo—.
> Lo que pasa es que el catálogo del dock (`dock2dTools.ts`) no declaraba ese
> atajo, y el catálogo es lo único que la interfaz muestra. O sea: **hay dos
> fuentes de verdad para el mismo atajo, están en desacuerdo, y la que ve la
> usuaria es la que está vacía.** Eso es mejor evidencia de la tesis que el
> hallazgo original, porque no es una omisión: es que dos sistemas que se
> escribieron en ráfagas distintas nunca se cruzaron.

### 2.4 Siete diálogos nativos bloqueantes en acciones destructivas

Verificado a mano, no relayado:

| Sitio | Qué pregunta |
|---|---|
| `LogoMenu.tsx:43` | `confirm('¿Crear un proyecto nuevo? Los cambios sin guardar se pierden.')` |
| `LogoMenu.tsx:133` | `alert('Vina v0.11.0\n…')` |
| `AvatarPanel.tsx:159` | `confirm('¿Eliminar este perfil?')` |
| `AvatarPanel.tsx:382` | `confirm('¿Eliminar "…"?')` |
| `ConnectionsList.tsx:127` | `confirm('¿Eliminar la conexión "…"?')` |
| `memoryTools.ts:38-39` | `window.confirm(message)` |

Conviven con el sistema de Toast que el RFC E-async-states ya ratificó como
superficie canónica. Y tienen un modo de falla feo: el navegador **puede
desactivar** los diálogos nativos (basta que el usuario marque "no volver a
mostrar"), y entonces `confirm()` devuelve `false` sin preguntar. Cuando eso
pasa, "Eliminar este perfil" deja de borrar y no avisa: se convierte en un botón
muerto silencioso.

### 2.5 Un botón deshabilitado que no se ve deshabilitado

El botón "Nest" deshabilitado se pinta y se comporta como habilitado —incluso se
ilumina al pasar el mouse—. Es el peor caso de un control: promete que se puede
pulsar y no hace nada. Y encaja con el dato de §1.4: `:disabled` tiene 18
selectores contra 76 de `:hover`.

---

## 3. Los tres sistemas de navegación paralelos

Vina tiene hoy **tres modelos de navegación que se solapan y ninguno manda**:

1. **El menú del logo** — Archivo, Edición, Vista, Patrón, Simulación,
   Preferencias, Ayuda. Un menú de aplicación de escritorio completo.
2. **La paleta de comandos** (`Ctrl+K`) — Acciones, Paneles, Exportar. Es la
   superficie mejor diseñada de la app: agrupada, cada ítem con nombre y
   descripción, iconos coherentes.
3. **Los docks y los controles del visor** — herramientas 2D a la izquierda,
   acciones 3D a la derecha, controles de visor arriba a la derecha.

De los siete paneles registrados en `unifiedBarCommandDefs.ts`, **tres no tienen
más puerta que la paleta**: `Inspector`, `Marcada` (nesting) y `Capas`. Capas es
un concepto central de cualquier CAD y no tiene entrada visible.

Y los siete comparten **una sola ranura mutuamente excluyente**
(`setContextPanel` en `AppShell.tsx:216, 268, 271, 282, 294`): abrir Capas cierra
Propiedades. Una patronista necesita las dos a la vez.

Detalle que remata el punto: ese mismo handler **alterna en cuatro de los cinco
sitios donde se pasa** (`prev === name ? null : name`) y en `AppShell.tsx:271`
no alterna (`setContextPanel(name)`). La misma acción se comporta distinto según
de dónde la invoques.

---

## 4. Las dos causas raíz

Son dos, y explican mitades distintas: una explica por qué derivaron los
**valores**, la otra por qué derivaron los **materiales**.

### 4.1 El `var()` con fallback silencia la deriva

Este es el hallazgo central de la auditoría, y no se ve mirando la pantalla.

Los tokens de Vina se definen en **dos** archivos: `src/styles/tokens.css` (67) y
`src/App.css` (8). Setenta y cinco en total. Hasta ahí, sano.

Pero hay **nueve nombres de token que no están definidos en ningún archivo**, y
aun así se referencian 63 veces:

| Nombre fantasma | usos | El token real que ya existía |
|---|---|---|
| `--border-color` | 25 | `--border` |
| `--text-color` | 16 | `--text-primary` |
| `--button-bg` | 7 | — |
| `--accent-color` | 5 | `--accent` |
| `--bg-hover` | 3 | `--bg-elevated` |
| `--button-hover-bg` | 3 | — |
| `--panel-section-bg` | 2 | — |
| `--panel-border` | 1 | `--border` |
| `--text-accent` | 1 | `--accent` |

Fíjate en la columna de la derecha: seis de los nueve son **otro nombre para un
token que ya existía**. Distintas ráfagas inventaron vocabularios paralelos para
lo mismo (`--text-color` contra `--text-primary`, `--accent-color` contra
`--accent`, `--panel-border` contra `--border`).

Lo decisivo es por qué nadie se dio cuenta: **los 63 usos vienen con fallback.**

```css
background: var(--panel-bg, #1e1e1e);
```

Eso se lee como "usa el token". No usa ningún token: el token no existe, así que
resuelve a `#1e1e1e` y **se ve perfecto**. Un token faltante *sin* fallback
rompería en pantalla y se arreglaría el mismo día. Un token faltante *con*
fallback renderiza bien y miente para siempre sobre estar tokenizado.

En todo el CSS hay 136 `var()` con fallback contra 439 pelados. Esa cuarta parte
es donde vive la deriva silenciosa.

La regla que sale de aquí es de una línea y es la más barata de todo el plan:
**prohibido el fallback en `var()`.** Si el token existe, el fallback sobra. Si
no existe, quieres que rompa fuerte y temprano.

Nota de contexto que hace más urgente la regla: el sistema de tokens está en
realidad **sano**. De los 75 definidos, solo tres no se usan nunca
(`--radius-lg`, `--text-title`, `--weight-normal`). Incluso hay una paleta 2D
completa y bien nombrada (`--canvas-2d`, `--grid-2d`, `--piece-fill-2d`,
`--notch-2d`, `--topstitch-2d`, `--fold-mountain-2d`…) que sí se usa, desde
TS/TSX. No falta diseño de tokens: falta la disciplina que impida rodearlos.

### 4.2 El cromo flota encima del documento en vez de vivir al lado

La segunda causa sí se ve, y explica los siete materiales:

> **Vina es cromo oscuro sobre un documento claro, y el cromo flota ENCIMA del
> documento en vez de vivir AL LADO.**

Figma, Illustrator y CLO3D también son cromo oscuro sobre documento claro. La
diferencia es que ellos ponen el cromo en **canaletas reservadas** y jamás encima
del área de trabajo. Vina lo pone encima.

Y ahí está el mecanismo de la deriva: **cada vez que alguien agregó una
superficie nueva, tuvo que volver a resolver por su cuenta "¿cómo separo esta
cosa oscura del papel crema de abajo?"** Uno lo resolvió con más opacidad, otro
con blur, otro con un radio más grande, otro con un borde índigo, otro con una
sombra más dura. Siete personas resolviendo el mismo problema siete veces son
siete materiales.

Las consecuencias visibles de que el cromo flote encima:

- **No se reserva canaleta alguna para el dock.** Medido con el patrón de María
  cargado: el dock ocupa `x=14..68` y el trazo más a la izquierda del patrón cae
  en `x=64`. Se solapan por 4px. Hoy son 4px; con otro patrón u otro zoom es un
  número cualquiera, porque el cálculo del encuadre **no conoce el cromo**.
  Contenido y cromo comparten los mismos píxeles por diseño ausente, no por
  decisión.
- El panel Propiedades se abre **encima de la regla** y del patrón.
- La barra de IA flota **cruzando el divisor 2D/3D**, tapando ambos lados.
- Al pasar de Split a 2D el ancho útil se duplica y el patrón **no se reajusta**:
  se queda en el tercio izquierdo con dos tercios de lienzo vacío al lado.

---

## 5. El contrato que falta

La propuesta no es "rediseñar Vina". Es **escribir las tres reglas que no
existen**, para que la próxima ráfaga tenga qué consultar. Hoy hay una capa de
tres:

| Capa | ¿Existe? | Qué contesta |
|---|---|---|
| **Tokens** | sí, decente | qué valores existen |
| **Materiales** | **no** | qué combinación de valores constituye una superficie legal |
| **Emplazamiento** | **no** | dónde puede vivir una superficie y qué le es lícito tapar |

Más tres leyes transversales: **estado**, **atajos** e **idioma**. Y por encima
de todas, la que hace cumplir a las demás:

### 5.0 Ley de tokens — que romper sea ruidoso

1. **Prohibido `var(--x, fallback)`.** Sin excepciones. Si el token existe, el
   fallback sobra; si no existe, tiene que romper en pantalla el mismo día. Esta
   sola regla habría hecho imposibles los 9 fantasmas.
2. **Un solo archivo de definición.** Hoy son dos (`tokens.css` y `App.css`).
3. **Un nombre por concepto.** Se jubilan `--text-color`, `--accent-color`,
   `--panel-border`, `--bg-hover`, `--text-accent` a favor de los reales que ya
   existían. Los tres que no tienen equivalente (`--button-bg`,
   `--button-hover-bg`, `--panel-section-bg`) se definen de verdad o se eliminan.
4. **Color literal solo dentro del archivo de tokens.** Ningún hex ni `rgba()`
   en un componente. Hoy hay 81 hex y 70 `rgba` en CSS, y 132 hex en `.tsx`.

### 5.1 Ley de materiales — de siete a tres

Exactamente tres materiales, y ninguno más sin cambiar este documento:

- **`chrome`** — para todo lo que va acoplado a una canaleta. Opaco
  (`#10101c`), radio 12px, borde `#2a2a42`, sin blur. Sombra solo si sobresale.
- **`overlay`** — para lo que de verdad flota sobre el documento: menús
  contextuales, paleta de comandos, tooltips, toasts. **Una** opacidad, **un**
  radio, **un** borde, **una** sombra, blur constante.
- **`ink`** — para lo que se dibuja *sobre el papel* (etiquetas de medida, la
  pista de la herramienta, cotas). Fondo claro y tinta oscura, porque sobre crema
  la tinta oscura es lo único legible.

`ink` es el que arregla el bug de 1.11:1 **por construcción**: la regla dice que
el texto dibujado sobre el documento usa `--ink-*` y nunca `--text-*`. Con esa
regla escrita, ese bug no se podía cometer.

### 5.2 Ley de emplazamiento

- El documento (lienzo 2D, visor 3D) tiene un **área segura**. El cromo se acopla
  en canaletas, y el ajuste a la vista **resta** esas canaletas.
- Solo tres cosas pueden taparlo: menús transitorios, toasts y la paleta de
  comandos. Todo lo demás se acopla.
- Una escala de capas con nombre, en tokens. Se acabaron el 9999 y el 10000.

Esto elimina de un golpe el solape cromo/contenido, el panel sobre la regla, la
barra de IA cruzando el divisor y el no-reajuste al cambiar de modo.

### 5.3 Ley de estado

- **`seleccionado` > `hover` > `reposo`**, siempre, en peso visual. Hoy está al
  revés.
- El estado seleccionado **no puede depender solo del tono**. Fondo lleno más una
  marca de borde, para que se lea sin distinguir colores.
- Un acento. `--accent` índigo manda; `--dock-auto` violeta se justifica por
  escrito o se va.
- **Todo lo que tenga `:hover` tiene `:focus-visible`.** Es la regla más barata
  de verificar de todo el contrato y cierra el hueco de 76 contra 6. Un
  `outline: none` solo es legal si la misma regla pone otra señal en su lugar.
- Todo control que se pulsa tiene realimentación de pulsado. Hoy `:active`
  existe una vez en todo el proyecto.

### 5.4 Ley de atajos — una sola notación

Hoy conviven cuatro:

| Notación | Dónde |
|---|---|
| `Seleccionar · Z`, `Línea · ⇧L` | `aria-label` del dock |
| chip de tecla en caja | tooltip del dock |
| columna de teclas peladas | personalizador del dock |
| `(Shift+A)`, `(F10)` | controles del visor 3D |

Se elige una y se aplica en las cuatro.

### 5.5 Ley de idioma

Español de Venezuela, sentence case, un término por concepto. Lo que hay hoy en
inglés dentro de un producto en español son bugs, no matices:

- `DockToolPicker.tsx:46` — "Reset to defaults"
- `DockToolPicker.tsx` — el título "Dock tools"
- "Hold to see"
- "Solver Metrics" (la píldora de abajo a la derecha)
- Los indicadores `none` y `5p` de la barra superior: jerga de depuración sin
  etiqueta, en producción.

### 5.6 Ley de puertas

**Una función que se despacha tiene una puerta visible en el shell.** Si solo se
llega por la paleta de comandos, no está terminada. Piquete no tiene puerta.

---

## 6. El plan

Ordenado por (impacto sobre María × visibilidad) ÷ riesgo.

### Fase 0 — el guardián. Antes de tocar nada.

**Esta fase es el plan.** Todo lo demás es consecuencia.

El hallazgo de §0 dice que ya hay ocho contratos escritos y los ocho se rodean.
Entonces el trabajo no es escribir reglas nuevas: es que romperlas cueste.
Concretamente, dos piezas:

**a) Un linter de contrato**, barato y de reglas cerradas. Cada una es un grep
con una cifra:

| Regla | Cómo se verifica | Techo hoy |
|---|---|---|
| Sin `var()` con fallback | grep `var(--x, …)` | 136 → 0 |
| Sin token fantasma | referenciados − definidos | 9 → 0 |
| Sin color literal fuera de tokens | hex/`rgba` en componentes | 81 + 70 + 132 → 0 |
| Un solo archivo de definición | `:root` en CSS | 2 → 1 |
| Todo `:hover` con `:focus-visible` | conteo pareado | 76 vs 6 → paridad |
| Sin `outline:none` sin sustituto | grep | 9 → 0 |
| Sin `confirm`/`alert`/`prompt` | grep | 7 → 0 |
| Sin `z-index` literal | grep fuera de la escala | 41 → 0 |

**b) Un censo que corre contra la app viva** (`scripts/ui-surface-audit.mjs`, ya
escrito en esta auditoría): abre cada superficie, mide estilos computados y
cuenta materiales, firmas de botón, fallos de contraste, botones sin foco
visible, botones sin nombre accesible y solapamientos. Los números de hoy quedan
como techo y **cualquier cambio que suba un contador falla el gate**.

Sin esto, cada arreglo de las fases siguientes se vuelve a erosionar en tres
ráfagas, exactamente como pasó con los ocho contratos que ya existían. Un
contrato sin guardián es una sugerencia, y ya sabemos qué pasa con las
sugerencias en este repo.

### Fase 1 — lo que María sufre hoy

Diffs chicos, alivio inmediato, riesgo casi nulo:

1. La pista de la herramienta legible (1.11:1 → AA), y reubicada donde se lee.
   Es la funcionalidad de #1029 explicándose sola; hoy no se lee.
2. `seleccionado` por encima de `hover` en el dock, y sin depender solo del tono.
3. Puerta para Piquete y Margen de costura.
4. Los 7 `confirm`/`alert` a Toast/diálogo propio. Empezando por los tres
   destructivos, que hoy pueden volverse no-ops silenciosos.
5. El botón "Nest" deshabilitado que se ve habilitado.
6. Las fugas de inglés y de jerga que ya viola el glosario: "Reset to defaults",
   "Dock tools", "Hold to see", "Solver Metrics", y los indicadores `none` y `5p`
   de la barra superior.

### Fase 2 — ley de materiales

Colapsar siete materiales a tres. Es mecánico, de altísimo rendimiento visual y
casi no toca lógica.

### Fase 3 — ley de emplazamiento

Canaletas y área segura. El ajuste a la vista descuenta el cromo. Los paneles
dejan de taparle el patrón.

### Fase 4 — modelo de paneles

Una región que aguante **más de un panel a la vez**, cada panel con su puerta, y
se jubila la ranura mutuamente excluyente. Se unifica el toggle de los cinco
sitios.

### Fase 5 — idioma y atajos

Una notación de atajo. Español en todas partes. Tabla de terminología para que
"tramo", "borde" y "segmento" dejen de ser tres nombres de lo mismo.

---

## 7. Lo que deliberadamente NO se propone

La skill `redesign-existing-projects` está escrita para landing pages. Su
consejo, aplicado literalmente aquí, empeoraría el producto. Se descartan a
propósito, y por qué:

| Consejo de la skill | Por qué no aplica |
|---|---|
| "Cambiar la tipografía primero" (su prioridad #1) | Schibsted Grotesk más una monoespaciada son correctas para un CAD. Cambiarlas no compra nada y arriesga regresiones en toda la UI densa. |
| "Duplicar el espacio en blanco" | Vina es denso **a propósito**. María trabaja horas viendo el patrón; menos densidad es menos patrón en pantalla. |
| Fotos de fondo, parallax, stacks con scroll | Lenguaje de marketing. En una herramienta compiten con el documento. |
| Salir de lucide por "ser la elección por defecto de la IA" | En una herramienta, que el icono se **reconozca** vale más que diferenciarse. |
| Glassmorphism "de verdad", grano y ruido | El problema no es que el vidrio esté poco logrado: es que hay tres vidrios distintos. Se arregla quitando, no puliendo. |

Lo que **sí** se toma de la skill: la disciplina de auditoría, la cacería de
estados faltantes (foco, vacío, error), el rechazo a los `z-index` arbitrarios,
la exigencia de estados de hover/active/focus, y la insistencia en microcopy que
diga qué pasó y qué hacer.

---

## 8. Lo bueno, que hay que no romper

Una auditoría que solo encuentra defectos está mal hecha. Esto ya está bien y
debe sobrevivir a cualquier fase:

- **La paleta de comandos.** Agrupación clara, cada ítem con nombre y
  descripción, iconos coherentes, `Ctrl+K`. Es el modelo a seguir para el resto.
- **El estado vacío del lienzo 2D.** "Trae tu patrón" con importar, soltar,
  dibujar desde cero y describirle a la IA. Enseña en vez de estar vacío.
- **El microcopy en español.** Salvo las fugas listadas, está bien escrito y
  suena a persona.
- **La recuperación del proyecto** con toast y salida a "Empezar de cero".
- **El menú de aplicación completo.** La estructura Archivo/Edición/Vista/Patrón/
  Simulación/Preferencias/Ayuda es la correcta; lo que falta es que mande.
- **Los nombres accesibles de los botones de icono.** Medido en vivo: de 24
  botones visibles, 18 son solo-icono, y **los 24 tienen nombre accesible**. Cero
  botones anónimos. Eso normalmente sale mal y aquí salió bien; que no se pierda
  al tocar los componentes.
- **El glosario de copy y el helper de atajos.** Están bien escritos. No hay que
  rehacerlos: hay que obligarlos.
- **Los 59 iconos dibujados a mano de `src/tools/definitions/`.** 18×18,
  `strokeWidth 1.5`, el conjunto más coherente del repositorio. Están hechos y
  nadie los muestra. Es trabajo terminado esperando que lo enchufen.

---

## 9. Método, y qué tan confiable es cada cifra

**Cómo se midió.** Tres fuentes, a propósito distintas:

1. **Censo mecánico** con `git ls-files` + grep sobre los 32 CSS y los 186 `.tsx`.
   Determinista y reproducible.
2. **Medición en vivo en el navegador**, contra el patrón real de María cargado
   por el mismo camino que usa la app (`input[accept=".dxf"]`), leyendo
   **estilos computados**, no CSS fuente. Esto es lo que atrapa la cascada: el
   contraste 1.11:1 de §2.1 no se ve leyendo el CSS, porque el token es correcto
   y el defecto está en sobre qué fondo cae.
3. **Siete lentes de censo sobre el código, cada una con un verificador
   adversarial encima** cuya única instrucción era refutar: abrir el
   archivo:línea citado y tumbar el hallazgo si no se sostenía. 14 agentes, 699
   llamadas a herramientas. Resultado: **67 hallazgos confirmados, 18 refutados**.

El inventario completo, con la evidencia archivo:línea de cada hallazgo y el
texto de cada refutación, está en
[`2026-08-14-auditoria-ui-hallazgos-verificados.md`](./2026-08-14-auditoria-ui-hallazgos-verificados.md).

**Qué tan confiable es.** Distinto por cifra, y conviene decirlo:

- Lo de este documento que dice "medido" lo verifiqué yo, de primera mano, y está
  citado con el archivo:línea o con el valor computado.
- El inventario de 67 hallazgos es una **lista de pistas verificadas, no
  evangelio**. Comprobé una muestra de sus titulares y **uno de los BLOQUEANTES
  resultó falso**: decía que `RenderSettingsPanel` se pinta con el CSS privado de
  `AvatarPanel` y que por eso sale sin estilo. No es cierto —
  `RenderSettingsPanel.css` define él mismo las cinco clases `render-panel*` y
  `AvatarPanel.css` no define ninguna. Y "el Inspector completo habla inglés"
  tampoco se sostiene: sus etiquetas dicen "Datos crudos", "Pieza", "Borde",
  "Internos".
- O sea: **hasta una pasada adversarial con 18 refutaciones dejó pasar un
  bloqueante falso.** Antes de abrir un issue con cualquier hallazgo del
  inventario, se abre el archivo. Es la misma lección que ya teníamos anotada de
  otras delegaciones, y se volvió a cumplir.

**Tres correcciones que me hice durante la auditoría**, por si sirven de calibre
de lo demás:

1. Leí el estado activo del dock como `transparent` y escribí que el indicador
   estaba muerto. Al re-medir, sí aplica. Era un artefacto de re-render.
2. Dije que el dock tapaba una pieza del patrón. Medido: se solapan 4px. El
   defecto real es que no se reserva canaleta, no que tape.
3. Marqué 9 tokens como fantasma comparando solo contra `tokens.css`. Resulta que
   hay un **segundo** archivo de definición (`App.css`), y dos de esos nueve sí
   existían. El recuento correcto está en §4.1.
