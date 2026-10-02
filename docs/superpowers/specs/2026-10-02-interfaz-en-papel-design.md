# La interfaz en papel — una sola hoja, una sola piel

> **Estado:** diseño aprobado por Samuel el 2026-10-02, sección por sección, sobre maquetas de la app
> real. Pendiente de su revisión de este documento y del plan de implementación.
>
> **Sustituye** las fases F2 a F6 de `2026-09-24-cromo-callado-design.md` y su piel (§ 4.1-4.4 y
> § 4.6). **Conserva** lo que F0 y F1 dejaron construido (§ 2.2).
>
> **Evidencia visual:** carpeta `2026-10-02-interfaz-en-papel/`, junto a este archivo. Son capturas de
> producción (`50331c21`) con el patrón de María a 1366 × 768, retocadas dentro del navegador. No son
> ilustraciones: son la app con CSS inyectado. Cómo se regeneran: § 13.

## 0. La frase que ordena el documento

> **Samuel, 2026-10-02:** *«busco una interface limpia y minimalista que expanda sus opciones de
> acuerdo a la intención del usuario en el momento en que esté ejecutando una acción, y quiero que sea
> extremadamente limpia e inteligente … la interface más zen que el mundo del CAD haya conocido.»*
>
> Y sobre las reglas numeradas del lienzo: *«es puro adorno y este programa no se puede permitir
> ocupar espacios en adornos.»*

La lente que traduce el pedido: **Vina es una hoja de papel con el patrón encima; todo lo demás es
tinta en sus márgenes.** Lo que no perdura aparece donde se actúa, cuando se actúa, y se va.

«Inteligente» significa aquí que la interfaz **lee el gesto** (qué herramienta, sobre qué objeto, en
qué fase) y responde con lo que ese gesto necesita. No significa que adivine: ya está firmado que
«Vina no adivina números».

## 1. Objetivo y no objetivos

**Objetivo.** Que en reposo la ventana muestre solo lo que perdura (barra superior, margen de
herramientas, una frase de ayuda y la marca de escala), que toda opción nazca junto a lo que
modifica, que toda la ventana esté hecha de un solo material claro, y que tres trinquetes lo
defiendan.

**No objetivos.**

- La gramática de las herramientas: qué hace cada clic, cada tecla, cada arrastre. Este documento
  solo cambia **dónde aparece** lo que las herramientas muestran y piden.
- El catálogo cerrado de componentes («contrato de interfaz v2», spec de avatares § 7). Va en su
  propio spec, después de la fase P1: sus piezas se hacen con la piel que aquí se define.
- Las opciones de las herramientas del 3D (`arrangement`, `simulate`, `pin`, `pose`, `meshGrab`,
  `steamBrush`): se quedan donde están.
- El i18n (rama `worktree-i18n`, PR #1225) y la home (`home/`). Se tocan solo en § 12, como riesgo.

## 2. Decisiones del 2026-10-02

Todas las tomó Samuel mirando maquetas. Donde dice «recomendación», la propuse yo y él la aceptó.

| # | Decisión | Resultado |
|---|---|---|
| D1 | Dirección | **Nada oscuro flota sobre el papel.** Escogida entre tres: terminar cromo callado tal cual, esta, y «solo el papel» (todo se convoca). La tercera se descartó porque el problema medido de María es no encontrar lo que ya existe. |
| D2 | Piel | **Todo claro, una sola piel:** papel y tinta, también la barra superior. Lo único con color es lo activo y lo que es del patrón. Reemplaza el grafito cálido de cromo callado (su D1). Recomendación. |
| D3 | Papel | **`#faf4e3`**, más amarillo que el de hoy (`#f1efe8`), y **siempre cuadriculado**. El relleno blanco de las piezas se conserva: condición expresa de Samuel. |
| D4 | Reglas | **Fuera** las reglas numeradas de arriba y de la izquierda, y con ellas la cruz del origen. **Queda una marca de escala** que dice cuánto mide un cuadro. |
| D5 | Herramientas | Las mismas, en el mismo orden y a un clic, como **tinta en el margen de la hoja**: las del patrón a la izquierda, las del 3D a la derecha. Sin tarjeta, sin sombra, sin rótulo. |
| D6 | Zona AUTO | **Fuera.** Escalado gana puerta en Vina › Patrón. Confirma el D10 de cromo callado, que estaba pendiente de veto. |
| D7 | Qué se ve | Los interruptores suben a la **barra superior**: los del patrón a la izquierda del selector de vista, los de la prenda a la derecha. |
| D8 | Opciones de herramienta | La tarjeta de la esquina **muere**. Las opciones salen en dos sitios: **sobre el objeto** recién creado (piquete, margen, coser, punto) o en **una línea al pie de la hoja** (las que piden datos antes de actuar). Recomendación. |
| D9 | Pieza seleccionada | Sus medidas escribibles y una barrita clara de **cuatro** acciones. El candado pasa al menú del clic derecho. |
| D10 | IA | **Se convoca.** No existe en reposo. Ratifica el D2 de cromo callado. |
| D11 | Paneles | **A petición, a la derecha y a ras.** Propiedades en dos niveles. Las herramientas no se mueven. |
| D12 | 3D | El escenario toma **el color del papel** y pierde el piso gris; queda una sombra suave. Los mapas de ajuste aparecen después de simular. «Capturar visor» pasa a Vina › Exportar. |
| D13 | Pantalla vacía | **Tres caminos:** importar, arrastrar el archivo o pedírselo a la IA. |
| D14 | María | Lo que mueve cosas que ella firmó (capas, piquete sin modal) se le enseña **antes de publicarlo**. Lo dije yo y Samuel no lo objetó; queda como decisión hasta que diga otra cosa. |

### 2.1 Por qué se descartó «solo el papel»

En esa dirección solo se veía la herramienta activa y las demás se convocaban con clic derecho. Es la
más limpia de las tres y la que más esconde. El archivo de tarjetas de María dice que su problema
recurrente es de descubrimiento: la función existe y ella no la encuentra. Esconder más lo agrava.
Por eso este documento distingue entre **callar** (bajar el volumen de lo que perdura) y **esconder**
(quitarle la puerta), y solo hace lo primero.

### 2.2 Qué queda de cromo callado y qué se reemplaza

| De cromo callado | Destino |
|---|---|
| F0: `data-superficie`, `superficies-por-accion.spec.ts`, capturas con build de producción | **Se conserva.** El trinquete recibe línea base nueva (§ 9). |
| F1: un solo archivo de tokens, `colorMath.ts`, `contraste-del-cromo.spec.ts`, Inter + JetBrains Mono, escala de cinco pasos, sin blur, un solo acento tono 248 | **Se conserva.** Cambian los valores de la rampa, no la arquitectura. |
| D1, grafito cálido | **Reemplazado** por D2 de este documento. |
| § 4.6, «el papel no se toca» | **Reemplazado** por D3: cambian el color del papel y la cuadrícula. El relleno de las piezas, las tintas del patrón, los ocho pares de costura y las cotas no cambian. |
| D9, fila de capas persistente en el lienzo | **Se mueve** a la barra superior. Sigue siendo persistente y a un clic (D7). |
| «La tira monta cuando tiene algo que decir» | **Reemplazado:** la tira desaparece (D8). |
| `--scene-3d` oscuro (F3) | **Reemplazado** por D12. |
| D2 IA convocada, D3 fuente, D4 acento, D5 la cabina cuenta 1, D8 sin blur, D10 AUTO fuera, D11 Propiedades a petición | **Se ratifican.** |
| F2 a F6 | **Sustituidas** por las fases P1 a P6 (§ 11). |

## 3. Las siete leyes

1. **Una sola hoja.** Toda la ventana es papel y tinta. Hay un solo material.
2. **En reposo, solo lo que perdura.** Barra superior, márgenes de herramientas, frase de ayuda y
   marca de escala. Nada más está montado.
3. **Las opciones nacen donde se actúa.** Sobre el objeto, o en la línea al pie si hacen falta antes
   de actuar. No existe una esquina de opciones.
4. **Callado, no escondido.** Toda función que se despacha tiene puerta visible a un clic. Se revela
   por estado, nunca por hover. Lo que perdura no cambia de sitio.
5. **Nada es adorno.** Lo que ya resuelve una herramienta no ocupa pantalla. Antes de conservar una
   superficie se pregunta qué deja de poder hacer la usuaria sin ella.
6. **Una sola voz.** Una frase de ayuda, de tres cláusulas como máximo, dice qué se puede hacer.
   Ninguna otra superficie narra.
7. **Se mide.** Tres trinquetes en navegador (§ 9).

## 4. La ventana

### 4.1 Anatomía

```
2D                                             Split
┌───────────────────────────────────────────┐  ┌───────────────────────────────────────────┐
│ Vina ↶↷ capas ×6      [2D|Split|3D]    IA │  │ Vina ↶↷ capas ×6  [2D|Split|3D]  prenda IA │
├──┬────────────────────────────────────────┤  ├──┬──────────────────┬──────────────────┬──┤
│h │                                        │  │h │                  │                  │h │
│e │              la hoja                   │  │e │     la hoja      │   el escenario   │e │
│r │                                        │  │r │                  │                  │r │
│r │                                        │  │r │                  │                  │r │
│  │ ⌴ 50 mm        frase de ayuda          │  │  │ ⌴  frase         │                  │  │
└──┴────────────────────────────────────────┘  └──┴──────────────────┴──────────────────┴──┘
```

Capturas: `01-reposo-2d.png`, `05-split.png`, `06-3d.png`. Hoy: `00-hoy-2d.png`, `00-hoy-split.png`.

### 4.2 Barra superior

De izquierda a derecha: menú «Vina», deshacer, rehacer, **grupo del patrón**, selector 2D / Split /
3D (centrado), **grupo de la prenda**, botón «IA».

- **Grupo del patrón:** los seis interruptores que hoy viven en `FilaDeCapas.tsx` (Margen, Hilo,
  Piquetes, Costuras, Largos, Construcción). Está cuando la vista es 2D o Split y hay piezas.
- **Grupo de la prenda:** «Avatar» (interruptor) y «Texturizado» (menú con los modos de superficie
  de `SurfaceModePill.tsx`). Tras el primer frame de simulación se suma «Mapa», un menú con los
  cuatro mapas de `FitMapToggle.tsx` y sus ajustes. Está cuando la vista es Split o 3D.
- Los dos grupos están **siempre del mismo lado**, así nada salta al cambiar de vista.
- El estado de un interruptor se lee en la marca (cuadro relleno o hueco) y en el tono del texto. No
  depende solo del color (ley de estado del contrato).
- **Cuando no caben:** el grupo que no entra en su mitad se pliega en un solo botón («Capas» o
  «Ver») con sus interruptores dentro. Se decide midiendo, no por ancho de ventana. A 1366 px y en
  español, el grupo del patrón mide 422 px y su mitad 502: cabe.
- «IA» queda marcado mientras la barra de IA está abierta.
- «Capturar visor 3D» sale de la pantalla y pasa a Vina › Exportar, junto a «Exportar 3D / Vuelta
  360°». Es una acción, no algo que se ve.

### 4.3 Márgenes de herramientas

Una franja de 44 px del color del papel, pegada al borde de la ventana y separada de la hoja por una
línea de pelo. La del patrón a la izquierda; la del 3D a la derecha.

- **Contenido del patrón:** las herramientas del dock de la usuaria (doce de fábrica), en tres
  grupos separados por aire: seleccionar y editar (Seleccionar, Editar patrón, Punto), dibujar
  (Pluma, Línea interna, Rectángulo, Tijeras, Medir), coser (Coser, Editar costuras, Margen de
  costura, Piquete). Al final, «+», que abre el selector de siempre (`DockToolPicker.tsx`).
- **Contenido del 3D:** Colocar, Coser, Simular, Avatar.
- **Reposo:** icono en tinta, sin fondo. **Activa:** cuadro relleno de `--accent` con el icono en
  blanco. **Hover:** fondo `--bg-elevated`. **Foco:** el riel de siempre.
- **La herramienta activa siempre tiene marca.** Si la activa no está en el margen (se llegó por
  atajo o por «+»), aparece al final mientras esté activa.
- El nombre y el atajo salen en el tooltip, como hoy. No hay rótulo «2D» ni «3D».
- Personalizar el dock (agregar, quitar, reordenar) sigue igual. Se va solo la zona AUTO:
  `DockAutoZone.tsx`, `dockSuggestions.ts`, `pinAuto`, `unpinAuto` y `toggleDockSignaling`.
- **Los márgenes no se mueven nunca.** Hoy el dock salta de x = 14 a x = 338 cuando se abre
  Propiedades.

### 4.4 La hoja

- **Papel:** `--canvas-2d: #faf4e3`.
- **Cuadrícula:** un solo paso a la vista, siempre. El cuadro vale un número redondo de la serie
  1-2-5 (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000 mm) y es el menor que mida 18 px o más en pantalla.
  Queda entre 18 y 45 px. Hoy `gridTiers.ts` dibuja tres pasos fijos (10 cm, 1 cm y 5 mm) y el de
  1 cm se va apagando por debajo de zoom 0,7 hasta desaparecer a 0,4: con el patrón entero en
  pantalla (zoom 0,48) solo quedan líneas tenues cada 10 cm. En pulgadas la serie es 1/8, 1/4, 1/2,
  1, 2, 6, 12.
- **Sin reglas.** `RulerLayer.tsx` es solo visual (`pointerEvents="none"`, línea 39) y muestra
  coordenadas de una hoja cuyo origen es arbitrario: en el patrón de María van de −1100 a 1600. El
  2026-09-07 [20:36], con las reglas en pantalla, ella puso un punto y dijo: «¿cómo sé que lo creo a
  50 milímetros? Tiene que tener una regla ahí». La medida le sirve en el objeto.
- **Sin cruz del origen** (`GridLayer.tsx:53-54`): sin coordenadas, no marca nada.
- **Marca de escala:** abajo a la izquierda, a 12 px del margen. Un corchete que mide exactamente un
  cuadro, apoyado sobre una línea de la cuadrícula, y su valor en la unidad activa («50 mm»). Mono
  11 px en `--ink-hint`. Si la cuadrícula se oculta, la marca también. Es documento, no cromo.
- **Unidades:** el ajuste sigue. Lo leen las cotas, Medir y los trazos, no solo la regla. En el
  menú, «Regla: mm / cm / pulgadas» (`LogoMenu.tsx:229-231`) pasa a llamarse «Unidades».
- **Frase de ayuda y línea al pie:** § 5.3 y § 5.4.

### 4.5 El escenario 3D

- **Fondo:** el color del papel, exacto. `scene.background` pasa por el mapeo de tonos y un
  `#faf4e3` se ve `#e1e0da`; por eso el lienzo se vuelve transparente (`backgroundMode:
  'transparent'`, que `EnvironmentSetup.tsx:35-36` ya soporta) y el color lo pone el CSS de detrás.
- **Suelo:** se va el piso gris con su cuadrícula. Queda un plano que solo recibe sombra, con la
  opacidad de `shadowOpacity`.
- **Entre las dos vistas** de Split, una línea de pelo donde hoy hay una franja oscura de 4 px
  (`layout.css:41-68`). Sigue siendo arrastrable.
- **Estado de la simulación:** un solo indicador, texto en tinta arriba a la izquierda del
  escenario. Lo demás del 3D de cromo callado § 5 se mantiene: sin emoji, sin el pill «SIMULANDO»
  del dock, sin el botón CC muerto.

### 4.6 Reposo, por vista

| Vista | Lo que hay |
|---|---|
| 2D con patrón | Barra superior con el grupo del patrón, margen izquierdo, hoja, marca de escala, frase de ayuda. |
| Split con patrón | Lo anterior, más el grupo de la prenda, el escenario y el margen derecho. |
| 3D | Barra superior con el grupo de la prenda, escenario, margen derecho. |
| Vacía (así arranca: Split, sin piezas) | Sin grupo del patrón. En la hoja: «Trae tu patrón», el botón «Importar DXF», «o arrastra el archivo aquí» y «o descríbeselo a la IA», que convoca la barra. Sin frase de ayuda ni marca de escala. `07-pantalla-vacia.png`. |

«Dibujar desde cero» sale de la pantalla vacía: la Pluma ya está en el margen. Su rótulo decía
«(P)» y el atajo de la Pluma es H.

## 5. Al actuar

### 5.1 Qué aparece con cada acción

«Componente» es lo que aparece o cambia respecto al estado anterior. La cabina del objeto (cotas,
caja de transformación, barrita) cuenta 1. Techo: 4. Las cuentas de la tabla son la expectativa; las
fija el trinquete (§ 9).

| Acción | Lo que aparece | Cuenta |
|---|---|---|
| Seleccionar una pieza | cabina · frase | 2 |
| Escribir una cota | cabina (chip en edición) · frase | 2 |
| Pluma | trazo con su medida viva · frase por fase | 2 |
| Rectángulo | caja con sus dos cotas · frase | 2 |
| Editar punto (Q) | glifos y chip del punto · frase | 2 |
| Punto | chip de distancia a la esquina · frase | 2 |
| Coser | borde resaltado y par · frase · tras coser, etiqueta de tipo | 2-3 |
| Piquete | fantasma · frase · tras el clic, dos etiquetas · aviso con Deshacer | 3-4 |
| Margen | lectura al pasar, chip al clicar · línea al pie con «Margen del próximo clic» | 2 |
| Medir | medida · línea al pie con sus dos opciones y «Borrar mediciones» | 2 |
| Línea interna, Tijeras y las de «+» con opciones | su vista previa · línea al pie | 2 |
| Convocar la IA | barra de una línea · lista de comandos si se escribe «/» | 1-2 |
| Abrir un panel | el panel | 1 |
| Simular | indicador · grupo «Mapa» arriba | 2 |
| Importar DXF | velo de arrastre · un aviso con Deshacer | 2 |
| Menú del clic derecho | menú · cabina | 2 |

### 5.2 Opciones sobre el objeto

**El principio:** antes de actuar no hay opciones. Se actúa, y lo que se acaba de crear trae sus
etiquetas. Lo que se cambie ahí queda de costumbre para las siguientes veces.

Hay dos clases de etiqueta, las dos sobre el papel:

- **Cota:** un número que se escribe donde mide. Ya existe (`cotas/CotaChip.tsx`): relleno
  `--accent-fuerte`, texto blanco, mono.
- **Etiqueta de opción:** blanca, línea de pelo, texto en tinta, con una flecha. Al clicarla abre
  un menú con sus opciones. Es nueva.

| Herramienta | Hoy | Sobre el objeto |
|---|---|---|
| Piquete | Tres opciones en la tarjeta (forma, profundidad, cantidad), a unos 830 px del piquete, y un modal para la distancia exacta (`NotchPrecisionModal.tsx`). | Tras el clic: cota «152 mm de la esquina», escribible, y etiqueta «Recta · 8 mm». La etiqueta abre forma, profundidad, ancho y cantidad. El modal desaparece. `03-piquete-sobre-el-objeto.png`. |
| Punto | Una opción en la tarjeta (`mode`). | Tras el clic: cota de distancia a la esquina. Es lo que María pidió el 07-09. |
| Coser | «Tipo de costura» en la tarjeta, antes de que la costura exista. | Con la costura seleccionada: etiqueta con su tipo. |
| Margen de costura | El margen ya se lee al pasar y se escribe al clicar. | Igual. «Margen del próximo clic» queda en la línea al pie: es un dato de antes. |

Las etiquetas se van cuando empieza el gesto siguiente y vuelven al seleccionar el objeto. «Ancho»
del piquete, que hoy solo se puede poner en el panel Propiedades, gana aquí su puerta antes de que
P4 borre ese bloque del panel.

### 5.3 La línea al pie

Para las herramientas que piden datos **antes** de actuar. Es una franja del color del papel, de
36 px, pegada al borde inferior de la hoja y separada por una línea de pelo. Lleva la frase de ayuda
y, a su derecha, las opciones de la herramienta. `04-linea-al-pie.png`.

- **Solo está con esas herramientas.** Con las demás, la frase de ayuda va sola, sin franja.
- **Quién la usa hoy**, de las doce del margen: Línea interna (tipo de nodo, tipo de línea), Tijeras
  (coser al cortar, tipo de costura), Medir (ángulo, acumulado, «Borrar mediciones») y Margen
  («Margen del próximo clic»). De las demás, las que declaran opciones en `src/tools/definitions/`:
  pinza, elipse, triángulo, extender o recortar, desplazar contorno, espejo, abrir la pieza, poner
  avío, los pespuntes, calcar, comparar largos y medir el borde, entre otras.
- **Si no cabe en una línea** (en Split la hoja mide 639 px), la frase pasa arriba y las opciones
  abajo: dos líneas, 60 px.
- No empuja la hoja: se dibuja encima de sus últimos 36 px.
- La marca de escala sube lo necesario para no quedar debajo.

Las opciones de Rectángulo (ancho y alto) ya no se pintan en la tarjeta desde el 30-08: son sus
cotas. Ese es el camino de todas: una herramienta deja la línea al pie cuando sus opciones ganan
sitio sobre el objeto.

### 5.4 La frase de ayuda

- Una línea, tres cláusulas como máximo, en `--ink-hint`.
- **Es la única voz.** Recibe lo que hoy dice la tarjeta: lo que a la herramienta le falta
  (`falta`) y el gesto que murió sin dejar nada (`desenlace`, 4 s). Prioridad: desenlace, falta,
  frase de la fase.
- Es una región viva (`aria-live="polite"`) montada siempre, para que los lectores de pantalla
  anuncien sus cambios. Hoy la región viva está dentro de la tarjeta (`ToolStrip2D.tsx:111`) y la
  frase es un `<text>` de SVG sin anuncio.
- Calla por estado, no por tiempo: la frase de reposo se va cuando Q se ha usado una vez en el
  proyecto (cromo callado § 3.2, respuesta a #1103).
- Ganan frase Piquete, Medir y Tijeras, que hoy no tienen.
- Las siete líneas «Editando: …» de `sujeto.ts` se van. Repetían lo que la pieza seleccionada ya
  muestra.
- El texto de cada frase se fija al implementar, con el glosario y la skill `solace-wren`. Los de
  las maquetas son de trabajo.

### 5.5 La cabina de la pieza

Caja de transformación, sus cotas escribibles y una barrita con cuatro acciones: rotar 90°,
duplicar, voltear y propiedades. `02-pieza-seleccionada.png`.

- La barrita es blanca, con línea de pelo y sombra corta. Hoy es `#1a1a1a` escrito a mano
  (`FloatingActionBar.tsx:78`).
- El candado pasa al menú del clic derecho (`BAR_MAX_VISIBLE` de 5 a 4).
- La píldora de medida de la Pluma (`--readout-bg-2d`, hoy oscura translúcida) toma el aspecto de
  una cota. Sobre el papel, todo número es azul con texto blanco.

## 6. Lo que se llama

### 6.1 Paneles

- **Solo a petición:** el cuarto botón de la barrita de la pieza, el menú Vina, los comandos, o un
  botón del margen del 3D (Avatar).
- **A la derecha y a ras:** 300 px, del color del papel, con una línea de pelo a la izquierda. Sin
  margen, sin radio, sin sombra. `08-panel-a-peticion.png`.
- **Una ranura** por debajo de 1600 px; dos, una junto a la otra, a partir de 1600. Simplifica el D6
  de cromo callado, que dejaba sin definir de 1440 a 1599. `panelSide.ts` deja de mandar Escalado y
  Propiedades a la izquierda.
- Con margen de herramientas a la derecha (Split y 3D), el panel se abre **entre el escenario y el
  margen**. El margen no se mueve.
- La hoja se estrecha por la derecha y el patrón no se mueve de sitio.
- Se cierra con Esc o con su ✕.
- **Propiedades, en dos niveles.** Primero: nombre, margen, tela y espejada. Plegado en
  «Producción»: código de tela, entretela, anotaciones, reglas de colocación, capa y subcapa,
  simulación y material. Se borran los cuatro preajustes de margen (escriben un número que ya tiene
  campo) y «Ajustes de piquete» (duplica las opciones del piquete con otros rangos).
- Propiedades deja de abrirse sola al tocar la esquina del margen (`PatternEditor.tsx:328`,
  `onSelectVertex`). Antes, el tipo de esquina gana su puerta como etiqueta de opción sobre ese
  vértice (§ 5.2).
- Avatar: siete medidas como siete campos; hoy son 21 controles. Capas: iconos de Lucide en lugar de
  emojis, y «Forro / Exterior / Avíos» en lugar de «1: Shell».
- Preferencias (lo que hoy es el «modo ajustes» de la barra de IA) pasa a ser un panel, con puerta
  en el menú Vina.

### 6.2 La IA

- No existe en reposo. Puertas: el botón «IA», el de la pantalla vacía, `Ctrl+/` (conversación) y
  `Ctrl+K` (comandos).
- Al abrir: una cápsula de una línea, 560 × 48, blanca con línea de pelo y sombra corta. Icono,
  campo «Pide algo o pregunta», y la tecla Esc. `09-ia-convocada.png`.
- **Un solo modo.** Escribir es conversación; «/» al principio, o llegar por `Ctrl+K`, son comandos
  y abre la lista encima. Sin los tres botones de modo. El botón de enviar solo aparece con texto.
- Aparece en la última posición guardada; sigue siendo arrastrable.
- Esc con el campo vacío la cierra. Con una conversación en curso la oculta, y la conversación sigue
  en el store.
- `--band-bar` se retira con sus consumidores: ya nada reserva una franja para ella.

### 6.3 Menús, avisos, tooltips y modales

Todo lo que aparece encima usa el mismo material: fondo blanco, línea de pelo, radio 8, sombra corta
en dos capas, texto en tinta. Un modal añade el velo. Nada tiene blur.

## 7. La piel

Vive en `src/styles/tokens.css`. Los ratios de esta sección están calculados con
`src/styles/colorMath.ts` contra el papel (`#faf4e3`) y contra blanco, no estimados.

### 7.1 Superficies

| Rol | Token | Valor |
|---|---|---|
| Papel: hoja, barra superior, márgenes, paneles | `--canvas-2d` | `#faf4e3` · oklch(0.967 0.023 91) |
| Fondo de la app y del cromo acoplado | `--bg-base`, `--bg-surface`, `--bg-deeper`, `--surface-chrome-bg` | `var(--canvas-2d)` |
| Campos y todo lo que flota | `--field-bg` (nuevo), `--surface-overlay-bg` | `#ffffff` |
| Papel hundido: hover, pista del selector de vista, teclas | `--bg-elevated` | oklch(0.92 0.022 91) · `#eae4d4` |
| Línea de pelo: separadores y borde de lo que flota | `--hairline`, `--border-subtle` | `rgba(40, 36, 30, 0.14)` |
| Borde de un campo | `--border` | oklch(0.62 0.012 80) · `#8a857e` · 3,33:1 sobre papel |
| Sombra de lo que flota | `--surface-overlay-shadow` | `0 1px 2px rgba(40,36,30,0.10), 0 8px 24px rgba(40,36,30,0.12)` |
| Velo de un modal | `--scrim` | `rgb(41 38 33 / 32%)` |

El borde de un campo lleva 3:1 porque un campo blanco sobre papel se distingue por su borde: el
relleno solo da 1,10:1. En las maquetas los campos llevan línea de pelo; al implementar llevan
`--border`.

### 7.2 Texto

| Token | Valor | Sobre papel | Sobre blanco | Uso |
|---|---|---|---|---|
| `--text-primary` | oklch(0.27 0.010 80) · `#292621` | 13,72 | 15,07 | |
| `--text-secondary` | oklch(0.45 0.012 80) · `#59554e` | 6,74 | 7,41 | rótulos, meta |
| `--text-tertiary` | oklch(0.52 0.012 80) · `#6d6861` | 5,03 | 5,52 | atajos, placeholder |
| `--text-disabled` | oklch(0.66 0.010 80) · `#95928b` | 2,83 | 3,11 | solo lo deshabilitado |

`--text-muted` sigue siendo alias de `--text-tertiary`. `--ink-hint` (`#6b6459`) da 5,32 sobre el
papel nuevo y no cambia.

**Se cierra una trampa.** Hasta hoy los `--text-*` eran tinta clara para cromo oscuro y sobre el
papel quedaban invisibles (1,05:1); por eso existe la familia `--ink-*`. Con la piel clara las dos
familias son oscuras. Se conservan los dos nombres por su papel: `--text-*` es el texto de la
interfaz; `--ink-*`, lo que se dibuja del patrón.

### 7.3 Acento y semánticos

| Token | Valor | Sobre papel | Sobre blanco |
|---|---|---|---|
| `--accent` (sin cambio) | oklch(0.60 0.16 248) · `#0584da` | 3,59 | 3,95 |
| `--accent-fuerte` (sin cambio) | oklch(0.54 0.15 248) · `#0072c0` | 4,59 | 5,04 |
| `--accent-ink` | oklch(0.50 0.15 248) · `#0066b3` | 5,38 | 5,91 |
| `--ai` | oklch(0.50 0.16 295) · `#6c4ab3` | 5,85 | 6,43 |
| `--success` | oklch(0.50 0.13 150) · `#137738` | 5,13 | 5,64 |
| `--warning` | oklch(0.52 0.12 70) · `#945a00` | 5,14 | 5,64 |
| `--destructive` | oklch(0.52 0.18 25) · `#ba2b2e` | 5,50 | 6,05 |

`--accent` es para rellenos sin texto, bordes y la línea de selección (3:1 gráfico). El acento
**escrito** es `--accent-ink`. Un relleno con texto blanco usa `--accent-fuerte`. `--destructive`
toma el valor que hoy tiene `--destructive-fuerte`, que pasa a ser su alias.

### 7.4 Papel y cuadrícula

- `--canvas-2d: #faf4e3`. El papel de hoy es `#f1efe8` (oklch 0.952 0.010 94): el nuevo es un poco
  más claro y tiene más del doble de croma.
- `--grid-2d: #cfc8b6`, 1 px (1,52:1 sobre el papel). `--grid-2d-major` se retira con su consumidor.
- **Lo que hay que vigilar:** como el papel nuevo es más claro, el blanco de las piezas se separa de
  él 1,10:1; hoy 1,15:1. La pieza tiene además su contorno de tinta (12,53:1). Si en la laptop de
  María las piezas se pierden, la reserva es `#f5efde`: el mismo amarillo a la claridad de hoy, que
  devuelve el 1,15.

### 7.5 Lo que no cambia

`--piece-fill-2d` (blanco), `--ink-on-light*`, `--seam-pair-1..8`, `--cota-*`, `--snap-2d`,
`--notch-2d`, `--piece-*-2d`, `--fold-*`, la tipografía y su escala, los radios, la escala de capas
`--z-*`, las transiciones y el riel de foco.

### 7.6 Lo que se retira

`--scene-3d`, `--grid-2d-major`, `--band-bar`, `--surface-overlay-blur`, las variantes `-recessed`
y `-sheet` del material overlay. Cada token se va con todos sus consumidores en el mismo PR (R2 = 0
siempre).

## 8. Lo que se borra

| Qué | Archivos | Su puerta pasa a |
|---|---|---|
| La tarjeta de herramienta | `ToolStrip2D.tsx` (167 líneas), `ToolStrip2D.css` (102) | Nombre: el margen y su tooltip. Mensajes: la frase de ayuda. Opciones: el objeto o la línea al pie. |
| Las reglas | `RulerLayer.tsx` (103), `rulerTicks.ts` (130) y sus tests | La marca de escala y las cotas. |
| La cruz del origen | `GridLayer.tsx:53-54` | Nada. |
| La zona AUTO | `DockAutoZone.tsx` (79), `dockSuggestions.ts` (33), `pinAuto`, `unpinAuto`, `toggleDockSignaling` en `dockSlice.ts` | Escalado: Vina › Patrón. |
| La fila de capas como tarjeta | `FilaDeCapas.css` (67); el componente se queda y cambia de sitio | Barra superior. |
| El modal del piquete | `NotchPrecisionModal.tsx` (118). `notchPrecisionCopy.ts` se queda: de ahí sale el texto del aviso | Cota y etiqueta sobre el piquete. |
| Las líneas «Editando: …» | siete sitios en `cotas/sujeto.ts` | Nada: lo dice la selección. |
| La barra del 3D y la píldora «Texturizado» como superficies flotantes | el contenedor de `FitMapToggle.tsx` y `SurfaceModePill.tsx`; su lógica se queda | Barra superior, grupo de la prenda. |
| El piso gris del 3D | el plano y la rejilla de `Viewport3D.tsx` | Plano de solo sombra. |
| El modo ajustes de la barra de IA y sus tres botones de modo | en `UnifiedBar.tsx` | Panel Preferencias; un solo modo. |
| En Propiedades | preajustes de margen y «Ajustes de piquete» en `PieceProperties.tsx` | El campo de margen; las etiquetas del piquete. |
| «Dibujar desde cero» de la pantalla vacía | `EmptyState2D.tsx` | La Pluma del margen. |

## 9. Trinquetes y medidas

Tres en navegador, con línea base en JSON que solo baja, como los de F0 y F1.

1. **Reposo** (nuevo, `tests/e2e/reposo-solo-lo-que-perdura.spec.ts`). En los cuatro reposos de
   § 4.6, el conjunto de `data-superficie` visibles tiene que estar contenido en `ambiente`,
   `documento` y `pista`. Hoy, en 2D con patrón, hay además `tira`, `fila` y `barra`.
2. **Superficies por acción** (existente). Línea base nueva al cierre de cada fase. La lista de
   acciones pasa a ser la de § 5.1.
3. **Contraste** (existente, `contraste-del-cromo.spec.ts`). Ningún texto por debajo de 4,5:1 sobre
   su fondo real. Se vuelve a medir entero en P1.

Y uno de emplazamiento: **los márgenes no se mueven.** La x del margen de herramientas es la misma
con panel y sin panel, en 2D y en Split.

En la suite unitaria cambian `contrasteDeTokens.ts` (pares con piso para la rampa clara),
`acento-legible.test.ts`, `HintText.legibilidad.test.tsx`, `tipografia-del-cromo.test.ts`,
`zIndexScale.test.ts` y `tests/repo/superficies-declaradas.test.ts`. El vocabulario de
`data-superficie` gana `pie` (la línea al pie cuando lleva opciones) y pierde `tira`, `fila` y
`mapas`. Los márgenes y la barra superior son `ambiente`; la marca de escala, `documento`; las
etiquetas de opción, parte de `cabina`.

`node scripts/ui-contract-lint.mjs` hoy: R3 = 565 colores literales fuera de tokens. Con la piel
clara, los que sean oscuros quedan a la vista. P1 migra los que se ven en reposo y en los flujos de
§ 5.1; el resto, P6. El contador solo baja.

## 10. Enmiendas

| Documento | Cambio |
|---|---|
| Skill `contrato-de-interfaz` § 2 (materiales) | Un material: papel y tinta; lo que flota es blanco con línea de pelo y sombra corta. Los roles `chrome` y `overlay` siguen como tokens. Se reescribe la advertencia de «`--text-*` es tinta de cromo oscuro» (§ 7.2). |
| Skill § 3 (emplazamiento) | Se añade la ley 2: en reposo, solo lo que perdura. Y «los márgenes no se mueven». |
| Skill § 2, excepción de la tira | Se borra: la tira no existe. |
| Skill § Verificación | Se añade el trinquete de reposo. |
| Skill «Lo que NO se hace» | Sigue vigente: ni más aire, ni otra fuente, ni otros iconos. |
| `2026-09-24-cromo-callado-design.md` | Encabezado: F2 a F6 y § 4.1-4.4, § 4.6 sustituidos por este documento. |
| `2026-08-14-fase-3-4-emplazamiento-paneles-design.md` § 2.1-2.2 | Paneles a ras y a la derecha; una ranura por debajo de 1600 px. |
| `2026-09-05-dueno-del-emplazamiento-2d-design.md` | Queda sin objeto en su mayor parte: de las catorce superficies que repartía, se van del borde del lienzo la tira, la fila, el modal de piquete y la barra de IA. Se anota al pie. |
| Firma de María #1109 (fila de capas en el lienzo) | Persistente y a un clic, en la barra superior. Se le enseña antes de publicar. |
| Firma de María #1103 (puntos del contorno visibles) | Sin cambio. |
| #1099 (modal del piquete junto a la pieza) | El modal desaparece. Se le enseña antes de publicar. |
| `CLAUDE.md`, fila D4 | «AgentSettings re-homed in UnifiedBar» pasa a «panel Preferencias desde LogoMenu», al cerrar P4. |

## 11. Fases

Cada fase tiene su plan, su PR y su despliegue local. Gate de todas: `npx tsc -b --noEmit && npm run
test && npm run lint && npm run lint:ui`, más la lista e2e de `scripts/deploy-prod.sh` antes de
mezclar. Sin `--no-verify`.

| Fase | Tamaño | Qué entra | Cómo se mide | María |
|---|---|---|---|---|
| **P0** Base | XS | Este spec y sus capturas. El trinquete de reposo, con la línea base de hoy. Sin cambios visibles. | Línea base escrita. | — |
| **P1** Piel y papel | L | § 7 entera: la rampa clara, el material único, la barra superior clara. El papel `#faf4e3` y la cuadrícula de un paso. Fuera las reglas y la cruz; entra la marca de escala. Migración de los colores literales oscuros que se vean. Enmienda del contrato § 2. | Contraste re-medido, ningún texto bajo 4,5:1. R3 baja. `emplazamiento-*` en verde en navegador. | No hace falta: nada cambia de sitio. Se le avisa. |
| **P2** El marco del patrón | M | Margen de herramientas del patrón. Capas a la barra superior. AUTO fuera y Escalado al menú. La tarjeta se convierte en la línea al pie y la frase de ayuda pasa a ser la única voz. Pantalla vacía. IA convocada, de un solo modo. | Reposo 2D: solo `ambiente`, `documento` y `pista`. Los márgenes no se mueven. | **Antes de publicar.** |
| **P3** Opciones sobre el objeto | M | Etiqueta de opción. Piquete sin modal. Punto con cota. Tipo de costura sobre la costura. Barrita clara de cuatro. Medida de la Pluma como cota. | Piquete: 4 superficies o menos. | **Antes de publicar** (piquete). |
| **P4** Paneles | M | Una ranura, a la derecha y a ras. Propiedades en dos niveles y a petición, con la puerta del tipo de esquina primero. Avatar de siete campos. Capas con iconos. Preferencias como panel. | Los márgenes no se mueven. Abrir un panel: 1. | Enseñar Propiedades. |
| **P5** 3D y Split | M | Escenario del color del papel y plano de solo sombra. Margen del 3D. Grupo de la prenda arriba. Mapas tras simular. Un solo indicador. Línea de pelo entre vistas. «Capturar visor» al menú. | Reposo en Split y en 3D: solo lo que perdura. | — |
| **P6** Limpieza | L, en 3-4 PR | Tamaños de letra literales a la escala. Los colores literales que queden. Retiro de alias y de los tokens de § 7.6. | R3 y los literales de `font-size` bajan por archivo. | — |

Orden: P0, P1, P2. Después P3, P4 y P5 en cualquier orden. P6 al final.

P1 sola deja la app con la piel nueva y la estructura de hoy: tarjetas blancas donde ahora son
oscuras. Es un estado coherente y se puede publicar.

## 12. Riesgos

- **La piel clara destapa 565 colores escritos a mano.** Un fondo oscuro literal sobre papel se ve
  enseguida. P1 no cierra sin recorrer en navegador los flujos de § 5.1.
- **La rama de i18n** (`worktree-i18n`, PR #1225) toca los mismos componentes y está pensada para
  un solo merge al final. Cada fase de aquí la aleja de `main`. Hay que traer `main` a esa rama
  después de cada fase, y decidir con Samuel cuál de los dos programas va primero.
- **María firmó la fila de capas en el lienzo y el modal del piquete.** Si al verlo prefiere lo de
  hoy, D7 y la parte de piquete de D8 se revisan. No se publica P2 ni P3 sin enseñárselo.
- **El blanco de las piezas sobre el papel nuevo** baja de 1,15 a 1,10. Reserva: `#f5efde` (§ 7.4).
- **Las exportaciones del 3D.** Con el lienzo transparente, una captura o una vuelta 360° saldría
  sin fondo. La exportación tiene que pintar el color del papel, salvo que `exportTransparent` esté
  activo.
- **La barra superior en otros idiomas o en ventanas estrechas.** En inglés y en alemán los seis
  interruptores no caben a 1366 px. La regla de plegado de § 4.2 tiene que estar antes de que
  llegue el i18n.
- **La cuadrícula siempre a la vista** puede cansar. Su línea es un token, y «Mostrar u ocultar
  cuadrícula» sigue existiendo.
- **Muchos tests fijan los valores de hoy.** Cada fase lleva su actualización; ninguna se salta.
- **La home usa otro papel** (`--papel: #F4EFE6` en `home/tokens.css`). Igualarlo al de la app es
  una línea y una decisión de Samuel; no entra en este documento.
- **Demasiadas herramientas en el margen.** Caben unas dieciséis a 768 px de alto. Si la usuaria
  agrega más, las que no entran quedan en «+».

## 13. Evidencia y cómo regenerarla

Las once capturas de `2026-10-02-interfaz-en-papel/`:

| Archivo | Qué muestra |
|---|---|
| `00-hoy-2d.png`, `00-hoy-split.png` | La app de hoy, para comparar. |
| `01-reposo-2d.png` | Reposo con patrón. |
| `02-pieza-seleccionada.png` | La cabina de la pieza. |
| `03-piquete-sobre-el-objeto.png` | Las dos etiquetas del piquete. |
| `04-linea-al-pie.png` | La línea al pie, con la Elipse. |
| `05-split.png`, `06-3d.png` | Las vistas con escenario. |
| `07-pantalla-vacia.png` | Sin patrón. |
| `08-panel-a-peticion.png` | Propiedades, a la derecha y a ras. |
| `09-ia-convocada.png` | La barra de IA. |

Se hicieron con Playwright contra producción: headless con la tarjeta gráfica real
(`channel: 'chromium'`, `--enable-gpu`, `--use-angle=d3d11`), el DXF
`tests/fixtures/garments/maria_patrones_samuel_2M.dxf`, y CSS inyectado. Los scripts
(`vina-prod.mjs`, `maqueta-definitiva.mjs`) están en
`docs/reports/ui-audit-2026-10-02-hoy/maquetas/`, carpeta ignorada por git.

**Lo que las maquetas no enseñan y el plan no puede dar por visto:** el avatar sin su sombra (en
la app real la conserva); los campos con línea de pelo en vez de `--border`; el grupo «Mapa»; el
indicador de simulación; los menús, avisos y modales con el material claro; las etiquetas de Punto,
Coser y la esquina del margen; un panel abierto en Split o en 3D; la línea al pie en dos líneas; el
plegado de la barra superior; y cualquier ventana que no sea de 1366 × 768.
