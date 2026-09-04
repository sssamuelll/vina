# El dueño del emplazamiento del borde 2D

> Estado: **propuesta**, sin implementar. Sale del § 7.1 del informe
> `docs/reports/2026-09-04-revision-adversarial-ui.md`, que lo pidió como uno de
> los dos specs cortos previos a la tanda 6.
>
> Fecha: 2026-09-05 · Autor: Claude (sesión de la cola del informe)

## 1. El problema, medido

Hoy **no existe ningún módulo que reparta el borde del lienzo 2D**. Catorce
superficies se colocan solas, en cuatro marcos de referencia distintos:

| Marco | Quién vive ahí |
|---|---|
| `.pattern-editor` | tira, fila de capas, modal de piquete, panel Siguiente punto, capa de cotas, vacío |
| `.canvas-area__2d` | dock |
| La ventana | barra de IA, toasts, métricas del solver, menú contextual |
| El patrón (pan/zoom) | barra flotante de acciones, chips de cota |

El único fragmento compartido es `--band-bar` (`tokens.css:152`), y **no es una
medida: es una copia congelada** de la posición *por defecto* de la barra de IA
—24 de aire + 58 de `BAR_HEIGHT` + 12— calculada en `barPosition.ts:52-54`. En
cuanto la usuaria arrastra la barra (`savePosition`, LS `vina-bar-position`), el
token deja de decir la verdad. Los tres CSS que lo consumen ya lo admiten por
escrito: *«Si la usuaria arrastra la barra, ese es su layout»*.

El resto no comparte nada:

- `top: 28px` escrito a mano **tres veces** (tira, modal de piquete, panel
  Siguiente punto), y ese 28 recalcula el `GUTTER = 20` de la regla
  (`RulerLayer.tsx:14`) sumándole 8 de aire.
- `right: 12px` **cuatro veces**.
- El dock declara su franja dos veces: `DOCK_WIDTH_PX = 68` en TS y `left: 14px`
  en su CSS.
- `.toast-container` decide `bottom: 56px` a solas, contra la ventana, «para
  librar la píldora del solver».

Es la tabla del § 2.1 del informe («por qué F1, F2 y F4 son el mismo defecto»)
convertida en inventario. Cada superficie nueva vuelve a elegir marco y vuelve a
escribir su número: por eso F1 no fue un descuido, fue lo que el sistema
produce.

### 1.1 La esquina de arriba a la derecha

Tres superficies declaran **los mismos cuatro números** (`top: 28px`,
`right: 12px`, `width: min(300px, calc(100% - 24px))`, `z-index: var(--z-menu)`)
y el conflicto se resuelve a mano, caso por caso:

- `PatternEditor.tsx:1287-1288` **desmonta** la tira mientras el panel Siguiente
  punto esté abierto.
- El modal de piquete deja la tira debajo, viva; de ahí salió **#1125**, que se
  cerró poniéndole `inert`.

Dos superficies más en esa esquina y el patrón deja de escalar: son N×(N−1)
decisiones escritas a mano.

## 2. Lo que este spec propone

**Un módulo declarativo, no un componente que envuelve.** El informe pedía «un
componente»; se propone lo contrario y con razón: los dos precedentes del repo
que funcionan —la escala de capas (`--z-*` + `zIndexScale.test.ts`) y el propio
`--band-bar`— son **declarativos**. Un componente que coloque a las catorce
obliga a que todas pierdan su `position: absolute` y reciban coordenadas: toca
todos los renders, y el diff no cabe en una tanda.

### 2.1 Las franjas

`src/styles/tokens.css` gana una familia `--franja-*`, con el mismo estatuto que
`--z-*`: un **rol**, no un número suelto.

```css
/* Franjas reservadas del borde del lienzo 2D. Cada una es el sitio que una
   clase de superficie tiene derecho a ocupar; nadie escribe estos números a
   mano en su propio CSS. */
--franja-regla:    20px;  /* GUTTER de RulerLayer */
--franja-superior: 28px;  /* regla + aire: donde empieza la esquina útil */
--franja-lateral:  12px;  /* aire al borde derecho e izquierdo */
--franja-dock:     68px;  /* DOCK_WIDTH_PX, medido en navegador */
--band-bar:        94px;  /* ya existe: la banda de la barra de IA */
```

Y la regla escrita: **ninguna superficie del lienzo 2D declara un offset de
borde literal.** Sale de una franja o no sale.

### 2.2 El trinquete

`scripts/ui-contract-lint.mjs` gana una regla novena, hermana de R8
(`z-index` literal): **R9 — offset de borde literal en un CSS del lienzo 2D**.
Detecta `top|bottom|left|right: <n>px` en los CSS de `components/PatternEditor/`
y de las superficies flotantes, y solo admite `var(--franja-*)`,
`var(--band-bar)`, `0`, `50%` y `auto`.

Nace con el techo de hoy y solo baja, igual que las otras ocho. Es lo que
convierte esto en algo que se cumple en vez de otro contrato escrito y rodeado
— que es el diagnóstico exacto de la auditoría del 14-08.

### 2.3 La esquina como turno, no como copia

Las tres superficies de la esquina superior derecha se declaran en **una lista
ordenada por prioridad**, y solo se pinta la primera viva:

```
modal de piquete  >  panel Siguiente punto  >  tira de herramienta
```

Sustituye a los dos apaños de hoy (`desmontar` en `PatternEditor.tsx:1287` y el
`inert` de #1125) por una regla. Añadir una cuarta superficie pasa a ser una
línea en la lista, no una decisión sobre las tres que ya estaban.

## 3. El techo de densidad de Petra

Petra Haft lo fijó en su informe (§ F.2, en
`docs/reports/ui-audit-2026-09-04/revisores/petra-gramatica-2d.md`, **fuera de
git a propósito** por `.gitignore:29`):

> 12 elementos de overlay clicables simultáneos por pantalla. 3 por objeto no
> seleccionado; 16 por objeto seleccionado. 24 px de separación entre centros,
> que es 2 × `EDGE_HIT_PX`. 15 % del área del lienzo. 20 % del bbox del sujeto.

**Hoy no se cumple por conteo:** una pieza seleccionada pinta 16 elementos
—9 tiradores (`transform.ts:4`) + 2 cotas + 5 botones de la barra flotante—
contra un techo de 12.

Y hay un ajuste que hacer antes de usarlo como regla: el ejemplo trabajado de
Petra asume 1366×768 en 2D solo (~660 000 px² de lienzo útil). El viewport real
de María en vista dividida es ~681×607 = **413 000 px², un 37 % menos**. El 15 %
de área y los 24 px de separación muerden bastante más fuerte de lo que su
ejemplo sugiere. **El techo se mide contra el lienzo menos las franjas
reservadas**, no contra el lienzo entero.

Este spec NO propone recortar los 16 a 12: eso es diseño de la tanda 6 (el
sujeto activo quita lectores por su cuenta). Propone **medirlo**, con un e2e que
falle cuando suba.

## 4. Lo que el e2e tiene que medir

La técnica ya existe y no hay que inventarla: `tests/e2e/emplazamiento-lienzo-2d.spec.ts`
trae `alcanzables(page, sel)` (`:58-74`), que hace `elementFromPoint` en el
centro del rect de cada nodo y devuelve `{nombre, alcanzable, culpable}`, y la
constante `MARIA = { width: 1366, height: 643 }`. Falta generalizarlo:

1. **Ningún par de superficies flotantes se solapa** — hoy se comprueban tres
   pares concretos; tiene que ser el producto cartesiano.
2. **Todo elemento clicable del overlay es alcanzable** — la prueba que cazó los
   chips de cota comiéndose el asa este y la de giro (2026-09-05).
3. **El conteo de elementos clicables no pasa de 12** con una pieza
   seleccionada, o el número que se ratifique.
4. **La separación entre centros no baja de 24 px.**

Los tres primeros son trinquete duro. El cuarto empieza como informe hasta que
se decida el número contra el viewport real.

## 5. Lo que este spec deja fuera, y por qué

- **Volver `--band-bar` una medida viva.** Sería lo correcto —la barra se puede
  arrastrar— y necesita un `ResizeObserver` sobre la barra real. Se ratifica el
  número congelado, con la excepción escrita donde ya está, porque el caso
  arrastrado no lo ha reportado nadie y medir en vivo introduce un observador en
  el camino de render por un caso hipotético.
- **Mover la pista de capa.** `HintText` es un `<text>` a `y="98%"` dentro del
  svg (`HintText.tsx:36-47`): **no tiene z-index ni puede tenerlo**, así que
  cualquier capa HTML hermana le gana por construcción. Ese es el mecanismo de
  F2 y sobrevive a su arreglo. Medido el 2026-09-05, después del arreglo:

  | Viewport | Solape barra ↔ pista |
  |---|---|
  | **1366×643** (el de María) | **0 px²** |
  | 1366×768 | 420 px² |
  | 1280×720 | 231 px² |

  Corrige el dato de partida: el reconocimiento citaba 1203 px² a 1366×643, que
  era la medida **pre-arreglo** (`medidas2.json`). Hoy en el viewport de María
  está limpio. Lo que queda son astillas de 2 px de alto en el borde inferior
  del texto, en dos viewports que María no usa. Se documenta, no se parchea:
  moverla de capa es rehacer dónde vive la pista, y eso es la tanda 6.
- **Las superficies ancladas al patrón** (barra flotante, chips de cota).
  Cuentan para el techo de densidad pero no ocupan franja de borde. El dueño
  reparte franjas; la densidad es el otro eje y se mide aparte.

## 6. Tamaño

| Parte | Tamaño |
|---|---|
| Familia `--franja-*` + sustituir los literales | S |
| Regla R9 en el trinquete | S |
| La esquina como lista de prioridad | M — toca render |
| El e2e generalizado (1, 2, 3) | M |
| El techo de densidad (4) | S como informe, M como trinquete |

No es una tanda entera y no hay que hacerlo todo junto. El orden que rinde: la
familia de franjas y R9 primero (cierran la puerta), el e2e generalizado
después (mide), y la esquina de última (es la que toca render).
