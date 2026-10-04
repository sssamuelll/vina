# La interfaz en papel — la hoja y su marco

> **Estado:** diseño aprobado por Samuel el 2026-10-02, sección por sección, sobre maquetas de la app
> real. Tercera versión. Después de aprobarlo añadió el modo oscuro (D15), pidió la línea al pie más
> visible (D16) y decidió que el marco va en oscuro (D2). Incluye lo que encontraron dos revisiones
> (§ 14). Pendiente: el plan de implementación de cada fase.
>
> **Sustituye** las fases F2 a F6 de `2026-09-24-cromo-callado-design.md`. **Conserva** lo que F0 y
> F1 dejaron construido, incluida la rampa oscura, que pasa a ser el marco (§ 2.2).
>
> **Evidencia visual:** carpeta `2026-10-02-interfaz-en-papel/`, junto a este archivo. Son capturas de
> producción (`50331c21`) con el patrón de María, retocadas dentro del navegador. No son
> ilustraciones: son la app con CSS inyectado. Cómo se regeneran: § 13.

## 0. Las frases que ordenan el documento

> **Samuel, 2026-10-02:** *«busco una interface limpia y minimalista que expanda sus opciones de
> acuerdo a la intención del usuario en el momento en que esté ejecutando una acción, y quiero que sea
> extremadamente limpia e inteligente … la interface más zen que el mundo del CAD haya conocido.»*
>
> Sobre las reglas numeradas del lienzo: *«es puro adorno y este programa no se puede permitir
> ocupar espacios en adornos.»*
>
> Sobre la línea al pie: *«la hacemos más visible, es importante esto porque es interacción,
> necesitamos que el programa sea altamente interactivo.»*
>
> Sobre el marco: *«quiero que los paneles se mantengan en oscuro … la barra de herramientas
> superior y los paneles que salen al costado derecho (que se diferencien del lienzo).»* Y de la
> línea al pie: *«prefiero que el tono sea oscuro.»*

La lente que traduce el pedido: **Vina es una hoja de papel con el patrón encima, dentro de un marco
oscuro. Las herramientas son tinta en los márgenes de la hoja.** Lo que no perdura aparece donde se
actúa, cuando se actúa, y se va.

«Inteligente» significa aquí que la interfaz **lee el gesto** (qué herramienta, sobre qué objeto, en
qué fase) y responde con lo que ese gesto necesita. No significa que adivine: ya está firmado que
«Vina no adivina números».

## 1. Objetivo y no objetivos

**Objetivo.** Que en reposo la ventana muestre solo lo que perdura (barra superior, márgenes de
herramientas, línea al pie y marca de escala), que toda opción esté a la vista y a un clic en el
momento en que hace falta, que la ventana tenga dos materiales y solo dos (el marco oscuro y el
papel), y que tres trinquetes lo defiendan.

**No objetivos.**

- La gramática de las herramientas, con tres excepciones que se declaran en § 5.2: Piquete (el modal
  desaparece), Punto (el punto recién creado se puede acotar) y la barrita de la pieza (cuatro
  acciones). Todo lo demás solo cambia **dónde aparece** lo que las herramientas muestran y piden.
- El catálogo cerrado de componentes («contrato de interfaz v2», spec de avatares § 7). Va en su
  propio spec, después de P1b: sus piezas se hacen con los materiales que aquí se definen.
- Las opciones de las herramientas del 3D (`arrangement`, `simulate`, `pin`, `pose`, `meshGrab`,
  `steamBrush`): se quedan donde están.
- El contenido de los paneles, salvo Propiedades, Avatar y Capas (§ 6.1). Su material no cambia.
- El i18n (rama `worktree-i18n`, PR #1225) y la home (`home/`). Se tocan solo en § 12, como riesgo.

## 2. Decisiones del 2026-10-02

Todas las tomó Samuel mirando maquetas. Donde dice «recomendación», la propuse yo y él la aceptó.

| # | Decisión | Resultado |
|---|---|---|
| D1 | Dirección | **Nada oscuro flota sobre el papel.** Escogida entre tres: terminar cromo callado tal cual, esta, y «solo el papel» (todo se convoca). La tercera se descartó porque el problema medido de María es no encontrar lo que ya existe. |
| D2 | Materiales | **Papel con marco oscuro.** La hoja, sus márgenes de herramientas y lo que flota son papel y tinta. El marco (barra superior, línea al pie y paneles) conserva el oscuro que la app ya tiene. Primero se aceptó «todo claro», por recomendación mía; Samuel lo corrigió el mismo día, dos veces. |
| D3 | Papel | **`#faf4e3`**, más amarillo que el de hoy (`#f1efe8`), y **siempre cuadriculado**. El relleno blanco de las piezas se conserva: condición expresa de Samuel. |
| D4 | Reglas | **Fuera** las reglas numeradas de arriba y de la izquierda, y con ellas la cruz del origen. **Queda una marca de escala** que dice cuánto mide un cuadro. |
| D5 | Herramientas | Las mismas, en el mismo orden y a un clic, como **tinta en el margen de la hoja**: las del patrón a la izquierda, las del 3D a la derecha. Sin tarjeta, sin sombra, sin rótulo. |
| D6 | Zona AUTO | **Fuera.** Sus cuatro sugerencias conservan puerta (§ 8). Confirma el D10 de cromo callado. |
| D7 | Qué se ve | Los interruptores suben a la **barra superior**: los del patrón a la izquierda del selector de vista, los de la prenda a la derecha. |
| D8 | Opciones de herramienta | La tarjeta de la esquina **muere**. Las opciones que se escogen **antes** de actuar van en la línea al pie, a la vista y a un clic. Lo que se ajusta **después** va sobre el objeto: la distancia de un piquete o de un punto, el tipo de una costura. Recomendación; revisada el mismo día con las palabras de María (§ 14) y confirmada por Samuel. |
| D9 | Pieza seleccionada | Una medida escribible a la vez (las demás, con Tab) y una barrita clara de **cuatro** acciones. El candado pasa al menú del clic derecho. |
| D10 | IA | **Se convoca.** No existe en reposo. Ratifica el D2 de cromo callado. |
| D11 | Paneles | **A petición, a la derecha, a ras y en oscuro.** Propiedades en dos niveles. Las herramientas no se mueven. |
| D12 | 3D | El escenario toma **el color del papel** y pierde el piso gris; queda una sombra suave. «Capturar visor» pasa al menú Vina › Archivo. |
| D13 | Pantalla vacía | **Tres caminos:** importar, arrastrar el archivo o pedírselo a la IA. |
| D14 | María | **Samuel decide cuándo se le enseña algo y cuándo no.** No es una compuerta de ninguna fase. Lo que ella dijo y firmó sigue siendo evidencia (§ 14). |
| D15 | Modo oscuro | **Hay un segundo modo, «Oscuro».** Cambia la hoja, que pasa a gris neutro `#333`; el marco es el mismo en los dos. Piezas blancas. El claro es el de fábrica. Se construye al final (P7). El primer oscuro que vio (`#1a1916`) le pareció demasiado oscuro y pidió «algo más tech» (§ 7.6). |
| D16 | Línea al pie | **Siempre presente, oscura y de lado a lado:** una franja con el nombre de la herramienta y su tecla, las opciones como botones a un clic, y la frase de ayuda. |

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
| F1: un solo archivo de tokens, `colorMath.ts`, `contraste-del-cromo.spec.ts`, Inter + JetBrains Mono, escala de cinco pasos, sin blur, un solo acento tono 248 | **Se conserva, con sus valores.** La rampa grafito es el marco. |
| D1, grafito cálido | **Se conserva para el marco.** Deja de ser el material de lo que flota sobre el papel. |
| § 4.4, «dos roles, un solo material» | **Reemplazado:** vuelven a ser dos materiales distintos, `chrome` oscuro y atracado, `overlay` claro y flotante (§ 7.1, § 10). |
| § 4.6, «el papel no se toca» | **Reemplazado** por D3: cambian el color del papel y la cuadrícula. El relleno de las piezas, las tintas del patrón, los ocho pares de costura y las cotas no cambian. |
| D9, fila de capas persistente en el lienzo | **Se mueve** a la barra superior. Sigue siendo persistente y a un clic (D7). |
| «La tira monta cuando tiene algo que decir» | **Reemplazado:** la tira desaparece; su lugar lo toma la línea al pie (D8, D16). |
| `--scene-3d` oscuro (F3) | **Reemplazado** por D12. |
| «Mapas de ajuste solo desde el primer frame» (F3) | **Retirado:** el grupo «Mapa» está siempre, apagado hasta que se simula (§ 4.2). #1010 dejó escrito que oculto era indescubrible. |
| § 8, «no se escribe sin la firma de María» | **Reemplazado** por D14. |
| D2 IA convocada, D3 fuente, D4 acento, D5 la cabina cuenta 1, D8 sin blur, D10 AUTO fuera, D11 Propiedades a petición | **Se ratifican.** |
| F2 a F6 | **Sustituidas** por las fases P1 a P7 (§ 11). |

## 3. Las siete leyes

1. **Una hoja y su marco.** La ventana tiene dos materiales. El marco (barra superior, línea al pie,
   paneles) es oscuro y está atracado a los bordes: no flota. Todo lo demás es papel y tinta: la
   hoja, sus márgenes y lo que flota sobre ella.
2. **En reposo, solo lo que perdura.** Barra superior, márgenes de herramientas, línea al pie y
   marca de escala. Nada más está montado.
3. **Las opciones nacen donde se actúa.** Lo que se escoge antes de actuar, en la línea al pie. Lo
   que se ajusta después, sobre el objeto. No existe una esquina de opciones.
4. **Callado, no escondido.** Toda función que se despacha tiene puerta visible a un clic. Se revela
   por estado, nunca por hover. Lo que perdura no cambia de sitio.
5. **Nada es adorno.** Lo que ya resuelve una herramienta no ocupa pantalla. Antes de conservar una
   superficie se pregunta qué deja de poder hacer la usuaria sin ella.
6. **Una sola voz.** La línea al pie dice en qué herramienta se está y qué se puede hacer. Ninguna
   otra superficie narra. **Excepción escrita:** la tecla que actúa sobre un objeto se anuncia junto
   a ese objeto («Tab · escribe la medida» junto al trazo, Tab y Enter junto a la cota). María las
   firmó ahí el 13-09 porque abajo no las leía.
7. **Se mide.** Tres trinquetes en navegador (§ 9).

## 4. La ventana

### 4.1 Anatomía

```
2D                                             Split
┌───────────────────────────────────────────┐  ┌───────────────────────────────────────────┐
│ Vina ↶↷ capas ×6    [2D|Split|3D]      IA │  │ Vina ↶↷ capas ×6 [2D|Split|3D]  prenda  IA │
├──┬────────────────────────────────────────┤  ├──┬──────────────────┬──────────────────┬──┤
│h │                                        │  │h │                  │                  │h │
│e │              la hoja                   │  │e │     la hoja      │   el escenario   │e │
│r │                                        │  │r │                  │                  │r │
│r │ ⌴ 50 mm                                │  │r │ ⌴ 100 mm         │                  │r │
├──┴────────────────────────────────────────┤  ├──┴──────────────────┴──────────────────┴──┤
│ Seleccionar Z · opciones · frase          │  │ Seleccionar Z · opciones · frase │ vista 3D │
└───────────────────────────────────────────┘  └───────────────────────────────────────────┘
```

Las dos franjas horizontales son el marco. Un panel, cuando se abre, es su tercera pieza: a la
derecha, entre las dos (§ 6.1).

### 4.2 Barra superior

Oscura: conserva el material que tiene hoy (`--bg-deeper`). De izquierda a derecha: menú «Vina»,
deshacer, rehacer, **grupo del patrón**, selector 2D / Split / 3D, **grupo de la prenda**, botón
«IA».

- **El selector está centrado en la ventana y no se mueve nunca.** Hoy su x depende de lo que tenga
  a cada lado (`TopBar.tsx:65, 79`: dos espaciadores `flex: 1`); deja de depender.
- **Grupo del patrón:** los seis interruptores que hoy viven en `FilaDeCapas.tsx` (Margen, Hilo,
  Piquetes, Costuras, Largos, Construcción). Ocupa el hueco entre «rehacer» y el selector. Está
  cuando la vista es 2D o Split y hay piezas o trazos.
- **Grupo de la prenda:** «Avatar» (interruptor), «Texturizado» (menú con los modos de superficie de
  `SurfaceModePill.tsx`) y «Mapa» (menú con los cuatro mapas de `FitMapToggle.tsx` y sus ajustes).
  «Mapa» está siempre y se enciende cuando hay una simulación que mirar. Ocupa el hueco entre el
  selector y «IA». Está cuando la vista es Split o 3D. El estado de «Avatar» hoy es local del visor
  (`Viewport3D.tsx:458`): sube al store.
- El estado de un interruptor se lee en la marca (cuadro relleno o hueco) y en el tono del texto. No
  depende solo del color (ley de estado del contrato).
- **Cuánto cabe** (medido sobre la maqueta, a 1366 px). Con el selector centrado, el hueco del grupo
  del patrón mide 415 px. Los seis interruptores suman 362 px de texto y marca: con 12 px de
  separación ocupan 422 y no caben por 7; con 8 px ocupan 402 y sobran 13. Van a 8 px.
- **Cuando no cabe** (otro idioma, ventana más estrecha), el grupo se pliega en un solo botón con sus
  interruptores dentro. Se decide midiendo. **En español a 1366 px no se pliega:** lo fija un e2e.
- «IA» queda marcado mientras la barra de IA está abierta, y enseña que el agente trabaja (§ 6.2).
- «Capturar visor 3D» sale de la pantalla y pasa a Vina › Archivo, junto a «Exportar 3D / Vuelta
  360°» (`LogoMenu.tsx:101`). Es una acción, no algo que se ve. Solo está activo con el 3D a la
  vista.

### 4.3 Márgenes de herramientas

Una franja de 44 px del color de la hoja, pegada al borde de la ventana y separada de la hoja por
una línea de pelo. La del patrón a la izquierda; la del 3D a la derecha.

- **Contenido del patrón:** las herramientas del dock de la usuaria (doce de fábrica), en tres
  grupos separados por aire: seleccionar y editar (Seleccionar, Editar patrón, Punto), dibujar
  (Pluma, Línea interna, Rectángulo, Tijeras, Medir), coser (Coser, Editar costuras, Margen de
  costura, Piquete). Al final, «+».
- **«+» agrega y quita herramientas del margen.** No activa ninguna (`DockToolPicker.tsx`). Una
  herramienta que no está en el margen se activa por su atajo, por el menú o por los comandos.
- **Contenido del 3D:** Colocar, Coser, Simular, Avatar.
- **Reposo:** icono en tinta, sin fondo. **Activa:** cuadro relleno de `--accent` con el icono en
  blanco. **Hover:** fondo `--bg-elevated`. **Foco:** el riel de siempre.
- **La herramienta activa siempre tiene marca.** Si la activa no está en el margen, aparece al final
  mientras esté activa. Y su nombre está siempre en la línea al pie (§ 5.3).
- **Cuando no caben.** A 1366 × 643, que es la pantalla de María, las doce más «+» llenan el alto
  (captura 13). Si hay más (hasta 22, `dockSlice.ts:43`), el margen se desplaza con la barra de
  desplazamiento a la vista, como hace hoy el dock por #1095 (`Dock.css:20-34`), y la herramienta
  activa se lleva a la vista. Nunca se quedan sin puerta.
- El nombre y el atajo de las demás salen en su tooltip, como hoy. No hay rótulo «2D» ni «3D».
- Personalizar el dock (agregar, quitar, reordenar) sigue igual. Se va la zona AUTO (§ 8).
- **Los márgenes no se mueven nunca.** Hoy el dock salta de x = 14 a x = 338 cuando se abre
  Propiedades.

### 4.4 La hoja

- **Papel:** `--canvas-2d: #faf4e3`.
- **Cuadrícula:** un solo paso a la vista, siempre. El cuadro vale `editor.gridSize` por un
  multiplicador de la serie 1-2-5 (…, 0,1, 0,2, 0,5, 1, 2, 5, 10, …): el menor que mida 18 px o más
  en pantalla, con un mínimo de 1 mm. Con la cuadrícula de fábrica (10 mm) da 1, 2, 5, 10, 20, 50,
  100… mm, y el cuadro queda entre 18 y 45 px. En pulgadas la serie es 1/8, 1/4, 1/2, 1, 2, 6, 12 y
  el cuadro queda entre 18 y 54 px. La serie va en el multiplicador y no en milímetros absolutos por
  la razón que ya está escrita en `rulerTicks.ts`: así un cuadro es siempre un número entero de
  pasos de la cuadrícula.
- **Hoy** `gridTiers.ts` dibuja tres pasos fijos: 10 cm a plena opacidad, 1 cm que se apaga por
  debajo de zoom 0,7 y desaparece a 0,4, y 5 mm desde zoom 2. Con el patrón entero en pantalla (zoom
  0,48) las líneas de 1 cm van al 27 % y a 4,8 px de paso: una trama que casi no se ve.
- **La cuadrícula no se oculta.** El comando «Mostrar u ocultar cuadrícula»
  (`unifiedBarCommandDefs.ts:75`) y «Vista › Cuadrícula» (`LogoMenu.tsx:205`) despachan
  `toggleSnapToGrid()`, y `snapToGrid` no tiene lector: hoy no ocultan nada. Se retiran los dos
  junto con la bandera.
- **Sin reglas.** `RulerLayer.tsx` es solo visual (`pointerEvents="none"`, línea 39) y muestra
  coordenadas de una hoja cuyo origen es arbitrario: en el patrón de María van de −1100 a 1600.
- **Sin cruz del origen** (`GridLayer.tsx:53-58`): sin coordenadas, no marca nada.
- **Marca de escala:** abajo a la izquierda de la hoja. Un corchete que mide exactamente un cuadro,
  apoyado sobre una línea de la cuadrícula, y su valor en la unidad activa («50 mm»). Mono 11 px en
  `--ink-hint`. Es documento, no cromo. Está siempre que la pantalla vacía no esté, también sin
  piezas: al dibujar desde cero o al calcar una foto.
- **Unidades:** el ajuste sigue. Lo leen las cotas, Medir y los trazos, no solo la regla. En el menú
  Vista, «Regla: cm / pulgadas / mm» (`LogoMenu.tsx:229-231`) pasa a llamarse «Unidades».

### 4.5 El escenario 3D

- **Fondo de fábrica: el color de la hoja, exacto.** `scene.background` pasa por el mapeo de tonos y
  un `#faf4e3` se ve `#e1e0da`. Por eso el fondo de fábrica deja de ser un color sólido y pasa a ser
  el modo transparente que ya existe (`EnvironmentSetup.tsx:35`), con el color de la hoja puesto por
  CSS detrás del lienzo; en el panel de render ese modo se llama «Papel». Las demás opciones (color
  sólido, HDRI) siguen.
- **Suelo de fábrica: solo sombra.** Se va el piso gris con su cuadrícula (`Viewport3D.tsx:961-969`);
  queda un plano que solo recibe sombra, con la opacidad de `shadowOpacity`. «Suelo visible» sigue
  siendo un ajuste.
- **Entre las dos vistas** de Split, una línea de pelo donde hoy hay una franja de 4 px
  (`layout.css:41-68`). Sigue siendo arrastrable.
- **La voz del 3D** es la sección derecha de la línea al pie (§ 5.3). Sin herramienta del 3D activa
  dice cómo se mueve la vista, que es lo que hoy dice `.sim-status` (`Viewport3D.tsx:1056`), sin el
  emoji ni las mayúsculas. Con una activa, su nombre, su tecla y su frase.
- **El estado de la simulación** (`SimulationStatusOverlay.tsx`) pasa a esa misma sección: una línea
  con el estado y su aviso ⚠ cuando lo hay; el detalle se abre al clicarla, como hoy. Se conserva lo
  que C4 § 3.1.A ratifica: el aviso nunca se calla. El pill «SIMULANDO» del dock
  (`RightDock.tsx:123`) se va: decía lo mismo.
- **La escala y la tabla de los mapas de ajuste** (`FitMapToggle.tsx:151-234`, hoy texto blanco
  sobre casi negro escrito a mano) toman el material de lo que flota (§ 6.3).

### 4.6 Reposo, por vista

| Vista | Lo que hay |
|---|---|
| 2D con patrón | Barra superior con el grupo del patrón, margen izquierdo, hoja, marca de escala, línea al pie. |
| Split con patrón | Lo anterior, más el grupo de la prenda, el escenario y el margen derecho. |
| 3D | Barra superior con el grupo de la prenda, escenario, margen derecho, línea al pie. |
| Vacía | Sin grupo del patrón ni marca de escala. En la hoja: «Trae tu patrón», el botón «Importar DXF», «o arrastra el archivo aquí» y «o descríbeselo a la IA», que convoca la barra. |

**La pantalla vacía** es la de hoy (`EmptyState2D.tsx:12-14`): cero piezas con Seleccionar activa.
En cuanto hay una pieza, un trazo o una imagen de referencia, o se toma una herramienta de dibujo,
deja de serlo y la marca de escala aparece.

«Dibujar desde cero» sale de la pantalla vacía: la Pluma ya está en el margen. Su rótulo decía
«(P)» y el atajo de la Pluma es H.

## 5. Al actuar

### 5.1 Qué aparece con cada acción

«Componente» es lo que aparece o cambia respecto al estado anterior. La cabina del objeto (cotas,
caja de transformación, barrita, etiquetas) cuenta 1; la frase, 1 cuando cambia; las opciones de la
línea al pie, 1 cuando aparecen. Techo: 4. Las cuentas son la expectativa; las fija el trinquete.

| Acción | Lo que aparece | Cuenta |
|---|---|---|
| Seleccionar una pieza | cabina · frase | 2 |
| Escribir una cota | cabina (chip en edición) · frase | 2 |
| Pluma | trazo con su medida viva · frase por fase | 2 |
| Rectángulo | caja con sus dos cotas · frase | 2 |
| Editar punto (Q) | glifos y chip del punto · frase | 2 |
| Punto | opciones al pie · frase · tras el clic, cota de distancia | 3 |
| Coser | borde resaltado y par · frase | 2 |
| Piquete | opciones al pie · frase · tras el clic, cota de distancia · aviso con Deshacer | 4 |
| Margen | lectura al pasar, chip al clicar · opciones al pie · frase | 3 |
| Medir | medida · opciones al pie · frase | 3 |
| Convocar la IA | barra de una línea · lista de comandos si se escribe «/» | 1-2 |
| Abrir un panel | el panel | 1 |
| Simular | estado en la línea al pie | 1 |
| Importar DXF | velo de arrastre · un aviso con Deshacer | 2 |
| Menú del clic derecho | menú · cabina | 2 |

### 5.2 Sobre el objeto: lo que se ajusta después

Lo que se acaba de crear, o lo que se selecciona, trae sus etiquetas.

- **Cota:** un número que se escribe donde mide. Ya existe (`cotas/CotaChip.tsx`).
- **Etiqueta de opción:** blanca, línea de pelo, texto en tinta, con una flecha. Al clicarla abre un
  menú con las opciones de ese objeto. Es nueva.

| Objeto | Hoy | Sobre el objeto |
|---|---|---|
| Piquete recién puesto | Un modal pide la distancia exacta (`NotchPrecisionModal.tsx`). Mientras se escribe, un fantasma se mueve y el modal enseña el largo del borde. | Una cota con la distancia a la esquina (capturas 04). **Conserva lo que el modal daba:** el piquete se mueve con cada tecla, al lado dice cuánto mide el borde, y un círculo marca desde qué esquina se cuenta. Enter fija; Esc deja el piquete donde se hizo clic. El modal desaparece. |
| Piquete ya existente | Solo en el panel Propiedades. | Al seleccionarlo: su cota de distancia y una etiqueta con forma, cantidad, profundidad y ancho. |
| Punto recién puesto | Nada: no se sabe a qué distancia quedó. | Una cota con la distancia a la esquina, escribible, que vive hasta el siguiente clic o Esc. Es terminar de poner el punto, no editar uno que ya existía: el contrato que María pidió («este tool nunca selecciona ni mueve puntos», `usePointTool.ts:8-10`) sigue valiendo para todo punto anterior. |
| Costura | «Tipo de costura» se escoge en la tarjeta, antes de coser. | Al seleccionar la costura: una etiqueta con su tipo. |
| Esquina del margen | Abre el panel Propiedades por su cuenta (`PatternEditor.tsx:328`). | Una etiqueta con el tipo de esquina sobre el vértice. |

**La puerta de vuelta.** Un piquete, una costura y una esquina del margen se seleccionan con un clic
de Seleccionar, y al seleccionarlos traen sus etiquetas. Sin esa puerta la etiqueta solo existiría
el segundo después de crear el objeto. P3 no cierra sin ella, con su e2e.

**Lo que no se recuerda.** Un número escrito sobre un objeto vale para ese objeto y nada más: no
queda de costumbre para el siguiente. Ya pasó con el rectángulo que repetía el tamaño del anterior, y
se quitó. Lo que sí se conserva entre un objeto y el siguiente son las opciones de la línea al pie,
porque ahí están a la vista.

**Rangos, uno por opción:** profundidad del piquete de 1 a 30 mm y ancho de 1 a 20 mm. Son los del
panel de hoy (`PieceProperties.tsx:278-283`), más amplios que el 3 a 20 de la herramienta
(`notch.tsx:51-52`); así ningún valor guardado queda fuera.

### 5.3 La línea al pie

Una franja al pie de la ventana, de lado a lado, del material y del alto de la barra superior
(`--bg-deeper`, `--top-bar-h`: 36 px a 1366). **Está siempre**, con cualquier herramienta y en
cualquier vista. Capturas 01, 03, 05 y 13.

De izquierda a derecha:

1. **Quién:** el icono de la herramienta activa del patrón, su nombre y su tecla. Es lo que la
   tarjeta decía y María celebró el 30-08: «qué guay, que aquí aparece Seleccionar Z».
2. **Las opciones** de esa herramienta.
3. **La frase** (§ 5.4).
4. En Split y en 3D, **la sección del 3D** (§ 4.5).

El orden (nombre, opciones, frase) es el de la barra de opciones de Illustrator, Photoshop y
Affinity.

**Las opciones son botones, no listas.** Todas las alternativas se ven y se cambian con un clic:
las siete formas del piquete como siete botones con su dibujo, la cantidad como «1 2 3», un número
con sus botones de menos y más. Una lista desplegable solo cuando hay más de ocho alternativas.
Cambiar una opción se refleja al instante en lo que se está por poner.

**Quién las usa.** Toda herramienta que declara `options` en `src/tools/definitions/`. De las doce
del margen: Punto (tipo de punto), Línea interna (tipo de nodo, tipo de línea), Tijeras (coser al
cortar, tipo de costura), Medir (ángulo, acumulado, «Borrar mediciones»), Coser (tipo de costura,
hasta P3), Margen («Margen del próximo clic») y Piquete (forma, cantidad, profundidad, ancho).
Rectángulo no: sus opciones son sus cotas desde el 30-08. El ancho del piquete hoy solo está en
Propiedades; gana aquí su sitio.

**Cómo se reparte el ancho.** La herramienta del patrón ocupa lo que necesita; la sección del 3D,
lo que sobra, y es la primera que se recorta. Dentro de la sección del patrón se recorta primero la
frase, que conserva al menos 200 px; las opciones que aun así no quepan pasan a un botón «Más» al
final. A 1366 px y en Split, las cuatro opciones del piquete caben enteras con su frase (captura
13).

**No empuja ni se mueve.** Es una fila fija de la ventana: la hoja termina encima de ella, y la
marca de escala y los márgenes están en el mismo sitio con cualquier herramienta.

### 5.4 La frase

- Una línea en `--text-secondary`, después de las opciones.
- **Recibe lo que hoy dice la tarjeta:** lo que a la herramienta le falta (`falta`) y el gesto que
  murió sin dejar nada (`desenlace`, 4 s). Prioridad: desenlace, falta, frase de la fase. Un
  desenlace entra resaltado, para que se note.
- Es una región viva (`aria-live="polite"`) montada siempre. Hoy la región viva está dentro de la
  tarjeta (`ToolStrip2D.tsx`) y la frase es un `<text>` de SVG sin anuncio.
- **No se calla por haber usado algo una vez.** El 07-09 María usó Editar patrón dos veces y después
  seguía preguntando en qué se diferencia de Seleccionar.
- **Cabe en una línea.** Lo que no quepa se quita, con una condición: ninguna tecla pierde su único
  anuncio. Si sale de la frase, se anuncia junto al objeto (ley 6).
- Ganan frase Punto, Piquete, Medir y Tijeras, que hoy no tienen.
- Las siete líneas «Editando: …» de `sujeto.ts` se van. Repetían lo que la selección ya muestra.
- El texto de cada frase se fija al implementar, con el glosario y la skill `solace-wren`. Los de
  las maquetas son de trabajo.

### 5.5 La cabina de la pieza

Caja de transformación, una cota activa y una barrita con cuatro acciones: rotar 90°, duplicar,
voltear y propiedades. Captura 02.

- **Una sola cota a la vez;** las demás, con Tab. Las medidas de la caja no son las de la pieza, y
  María lo dijo el 07-09: «que no se quede ahí pegado todo el rato».
- La barrita es blanca, con línea de pelo y sombra corta. Hoy es `#1a1a1a` escrito a mano
  (`FloatingActionBar.tsx:78`).
- **El candado** sale de la barrita y pasa al menú del clic derecho (`actionCuration.ts:364`: hoy es
  el quinto). Con la pieza bloqueada, «Desbloquear» es la primera acción de la barrita: nunca queda
  detrás de un menú.
- **La píldora de medida de la Pluma se queda negra.** María la prefirió tres veces sobre la azul:
  «es más minimalista». `--readout-bg-2d` no cambia. Es parte del trazo, como las cotas, y es la
  única superficie oscura sobre el papel.

## 6. Lo que se llama

### 6.1 Paneles

- **Solo a petición:** el cuarto botón de la barrita de la pieza, el menú Vina, los comandos, o un
  botón del margen del 3D (Avatar).
- **A la derecha, a ras y en oscuro:** 300 px, entre la barra superior y la línea al pie, con el
  material del marco (el `chrome` de hoy, en su variante a ras). Sin margen, sin radio, sin sombra.
  Captura 08.
- **Una ranura** por debajo de 1600 px; dos, una junto a la otra, a partir de 1600. Simplifica el D6
  de cromo callado, que dejaba sin definir de 1440 a 1599. `panelSide.ts` deja de mandar Escalado y
  Propiedades a la izquierda.
- **Si la ranura está ocupada,** el panel que se pide reemplaza al que estaba. Como Propiedades ya
  no se abre sola, el panel de calco no se cierra mientras ella dibuja, que es el caso que
  `panelSide.ts` documenta.
- Con margen de herramientas a la derecha (Split y 3D), el panel se abre **entre el escenario y el
  margen**. El margen no se mueve.
- **La hoja se estrecha por la derecha y no reencuadra.** Lo que cae bajo el panel queda tapado,
  como hoy (captura 08).
- Se cierra con Esc o con su ✕.
- **Propiedades de una pieza, en dos niveles.** Primero: nombre, margen, tela y espejada. Plegado en
  «Producción»: código de tela, entretela, anotaciones, reglas de colocación, capa y subcapa,
  simulación y material. Se borran los cuatro preajustes de margen (`PieceProperties.tsx:84`:
  escriben un número que ya tiene campo) y «Ajustes de piquete» (`:258`: duplica las opciones del
  piquete).
- Con una costura, un borde, un vértice o un piquete seleccionados, Propiedades enseña la sección de
  ese objeto, como hoy. Los dos niveles son solo de la pieza.
- Avatar: siete medidas como siete campos; hoy son 21 controles. Capas: iconos de Lucide en lugar de
  emojis, y «Forro / Exterior / Avíos» en lugar de «1: Shell».
- **Preferencias** (lo que hoy es el «modo ajustes» de la barra de IA, `UnifiedBar.tsx:298-311`:
  conexiones, idioma, presupuesto, esquema de entrada) pasa a ser un panel, con puerta en Vina ›
  Preferencias. Entra en la misma fase en que la barra pierde ese modo.

### 6.2 La IA

- No existe en reposo. Puertas: el botón «IA», el de la pantalla vacía, `Ctrl+/` (conversación) y
  `Ctrl+K` (comandos). `Ctrl+/` está registrado (`defaults.ts:115`) y hoy no tiene manejador: lo
  gana.
- Al abrir: una cápsula de una línea, 560 × 48, blanca con línea de pelo y sombra corta, sobre la
  línea al pie. Icono, campo «Pide algo o pregunta», y la tecla Esc. Captura 09.
- **Un solo modo.** Escribir es conversación; «/» al principio, o llegar por `Ctrl+K`, son comandos
  y abre la lista encima. Sin los tres botones de modo. El botón de enviar solo aparece con texto.
- Aparece en la última posición guardada; sigue siendo arrastrable.
- **Tres estados.**

  | Estado | La barra | El botón «IA» |
  |---|---|---|
  | Cerrada | no está | en reposo |
  | Abierta | visible | marcado |
  | Trabajando con la barra oculta | no está | marcado, con una señal de actividad |

- **La conversación y la ejecución del agente suben a un store.** Hoy son estado de un componente
  que se desmonta al cerrar (`UnifiedBarChat.tsx:102`): cerrar la barra perdería la conversación y
  cortaría al agente.
- **Esc.** Con el campo vacío y el agente en reposo, cierra. Con una conversación, oculta; la
  conversación sigue. Con el agente trabajando, oculta y el agente sigue: «IA» lo enseña, y al
  volver a abrir está el botón de detener. Esc entra en la escalera de
  `2026-09-06-escalera-de-escape-design.md` por delante del panel y de la deselección.
- `--band-bar` se retira con sus consumidores: ya nada reserva una franja para ella.

### 6.3 Lo que flota: menús, avisos, tooltips y modales

Todo lo que aparece encima de la hoja usa el mismo material: fondo blanco, línea de pelo, radio 8,
sombra corta en dos capas, texto en tinta. Un modal añade el velo. Nada tiene blur. También un menú
que se abre desde la barra superior o desde la línea al pie: cuelga del marco, pero flota sobre la
hoja. En el modo oscuro lo que flota es oscuro (§ 7.6).

## 7. Los materiales

Viven en `src/styles/tokens.css`. Los ratios de esta sección están calculados con
`src/styles/colorMath.ts`, no estimados.

### 7.1 Dos materiales

| Material | Qué es | Valores |
|---|---|---|
| **El marco** (`chrome`) | La barra superior, la línea al pie y los paneles. Atracado, opaco, sin sombra. | **Los de hoy, sin cambio:** `--bg-deeper` `#080706` (barra y línea al pie), `--bg-surface` `#151411` (paneles), `--bg-elevated` `#23211e`, `--border` `#34332f`, y los `--text-*` claros. |
| **El papel** | La hoja, los márgenes de herramientas y el escenario 3D. | `--canvas-2d: #faf4e3`, con la rampa de § 7.2. |
| **Lo que flota** (`overlay`) | Menús, avisos, tooltips, modales, la barra de IA, la barrita de la pieza, las etiquetas de opción. Es papel que se despega de la hoja. | `--surface-overlay-bg: #ffffff`; borde `1px solid rgba(40, 36, 30, 0.14)`; sombra `0 1px 2px rgba(40,36,30,0.10), 0 8px 24px rgba(40,36,30,0.12)`; con la rampa de § 7.2. Velo de un modal: `--scrim: rgb(41 38 33 / 32%)`. |

El marco contra la hoja da 18,32:1 (la barra) y 16,77:1 (un panel): es el contraste más fuerte de
la pantalla, y es lo que Samuel pidió, «que se diferencien del lienzo».

Texto sobre el marco, medido: primario 16,33 sobre la barra y 14,95 sobre un panel; secundario 9,74
y 8,91; terciario 6,01 y 5,50, y 4,79 sobre el hundido.

### 7.2 El ámbito de papel

**Mecanismo.** Un bloque `[data-material="papel"]` en `tokens.css` redefine, para lo que está
dentro, los mismos nombres que usa el marco. Lo llevan el área del lienzo (hoja, márgenes y
escenario) y la raíz de cada superficie que flota. Un componente no sabe sobre qué material está:
usa `--text-primary` y recibe tinta clara en el marco y tinta oscura sobre el papel. Sigue habiendo
un solo archivo de tokens (R4 = 1).

**Cuándo lo lleva cada cosa** (nota del plan de P1b, 2026-10-03). En P1b, solo la raíz de lo que
flota. La hoja y sus márgenes lo ganan en P2, y el escenario en P5: hasta entonces llevan encima el
dock, la tira, la fila y el cromo del 3D, que siguen oscuros, y con el ámbito su tinta se volvería
oscura sobre fondo oscuro. Los valores de lo que flota (§ 7.1) viven en el bloque del ámbito;
`:root` conserva el overlay oscuro para lo que todavía no ha pasado a papel. Así, una superficie
que olvide el atributo se queda oscura y legible, no blanca con tinta clara. Nota del plan de P2
(2026-10-03): el margen de herramientas lleva el ámbito en su raíz desde que deja de flotar, y la
hoja lo gana cuando se vaya la tira, que es la última superficie oscura que vive encima de ella.

| Token | En el ámbito de papel | Sobre papel | Sobre blanco | Sobre papel hundido | Uso |
|---|---|---|---|---|---|
| `--text-primary` | oklch(0.27 0.010 80) · `#292621` | 13,72 | 15,07 | 11,87 | |
| `--text-secondary` | oklch(0.45 0.012 80) · `#59554e` | 6,74 | 7,41 | 5,84 | rótulos |
| `--text-tertiary` | oklch(0.50 0.012 80) · `#67635c` | 5,44 | 5,97 | 4,71 | atajos, placeholder, lo inactivo |
| `--text-disabled` | oklch(0.66 0.010 80) · `#95928b` | 2,83 | 3,11 | — | solo lo deshabilitado |
| `--bg-elevated` (papel hundido: hover, teclas) | oklch(0.92 0.022 91) · `#eae4d4` | 1,16 | — | — | |
| `--field-bg` (nuevo; en el marco vale `--bg-elevated`) | `#ffffff` | — | — | — | campos |
| `--border` (borde de un campo) | oklch(0.62 0.012 80) · `#8a857e` | 3,33 | 3,66 | — | |
| `--border-subtle`, y el color de `--hairline` | `rgba(40, 36, 30, 0.14)` | — | — | — | línea de pelo |
| `--accent-ink` (el acento escrito) | oklch(0.50 0.15 248) · `#0066b3` | 5,38 | 5,91 | — | |
| `--ai` | oklch(0.50 0.16 295) · `#6c4ab3` | 5,85 | 6,43 | — | |
| `--success` | oklch(0.50 0.13 150) · `#137738` | 5,13 | 5,64 | — | |
| `--warning` | oklch(0.52 0.12 70) · `#945a00` | 5,14 | 5,64 | — | |
| `--destructive` | oklch(0.52 0.18 25) · `#ba2b2e` | 5,50 | 6,05 | — | |
| `--destructive-hover` | oklch(0.46 0.18 25) · `#a50d1c` | 7,15 | 7,85 | — | |

`--hairline` es un borde entero (`1px solid …`), no un color: así está hoy y así sigue. El borde de
un campo lleva 3:1 porque un campo blanco sobre papel se distingue por su borde: el relleno solo da
1,10:1.

**No cambian, en ningún ámbito:** `--accent` (`#0584da`: 3,59 sobre papel, 3,95 sobre blanco; es
para rellenos sin texto, bordes y la línea de selección), `--accent-fuerte` (`#0072c0`: 4,59 y
5,04; el relleno que lleva texto blanco) y `--accent-fuerte-hover`.

**Se cierra una trampa.** Hasta hoy `--text-*` sobre el papel daba 1,05:1, invisible, y por eso
existe la familia `--ink-*`. Dentro del ámbito de papel, `--text-*` ya es tinta oscura: lo que viva
en el área del lienzo puede usarlo. Se conservan los dos nombres por su papel: `--text-*` es el
texto de la interfaz; `--ink-*`, lo que se dibuja del patrón. `--ink-hint` (`#6b6459`) da 5,32 sobre
el papel nuevo y no cambia.

### 7.3 Papel y cuadrícula

- `--canvas-2d: #faf4e3` (oklch 0.967 0.023 91). El papel de hoy es `#f1efe8` (oklch 0.952 0.010
  94): el nuevo es un poco más claro y tiene más del doble de croma.
- `--grid-2d: #cfc8b6`, 1 px (1,52:1 sobre el papel). `--grid-2d-major` se retira con su consumidor.
- **Lo que hay que vigilar:** como el papel nuevo es más claro, el blanco de las piezas se separa de
  él 1,10:1; hoy 1,15:1. La pieza tiene además su contorno de tinta (12,53:1). Si las piezas se
  pierden, la reserva es `#f5efde`: el mismo amarillo a la claridad de hoy, que devuelve el 1,15.

### 7.4 Lo que no cambia

El marco entero (§ 7.1). `--piece-fill-2d` (blanco), `--ink-on-light*`, `--seam-pair-1..8`,
`--cota-*`, `--readout-*`, `--snap-2d`, `--notch-2d`, `--piece-*-2d`, `--fold-*`, la tipografía y su
escala, los radios, la escala de capas `--z-*`, las transiciones y el riel de foco.

### 7.5 Lo que se retira, y cuándo

Cada token se va con todos sus consumidores en el mismo PR (R2 = 0 siempre).

| Token | Fase |
|---|---|
| `--grid-2d-major` | P1a, con `gridTiers.ts` |
| `--band-bar` | P2, con la barra de IA convocada |
| `--scene-3d` | P5 |
| `--surface-overlay-blur`, las variantes `-recessed` y `-sheet` | P6. `-recessed` la usa la cota (`cotas.css:27`): no se toca antes |

### 7.6 El modo oscuro

La misma interfaz, con otra columna de valores en el mismo archivo de tokens. Nada cambia de sitio
ni de forma. Capturas 10, 11 y 12.

**Reglas.**

- **El claro es el de fábrica.** El oscuro se escoge; no sigue al sistema operativo.
- **El marco es el mismo en los dos modos.** Cambia la hoja, y con ella sus márgenes, el escenario
  y lo que flota.
- **El marco es más oscuro que la hoja:** `#080706` y `#151411` contra `#333` (1,59:1 y 1,46:1). Lo
  pidió Samuel: «que se diferencien del lienzo».
- **Las piezas son blancas en los dos modos.** Es el volumen que Samuel pidió conservar, y hace que
  todo lo que se dibuja dentro de una pieza (hilo, costuras, piquetes, anotaciones) valga igual en
  los dos.
- **Mecanismo:** un bloque `:root[data-tema="oscuro"]` en `tokens.css`, que da otros valores a la
  hoja, al ámbito de papel y a lo que flota. Ningún componente sabe en qué modo está.
- **Puerta:** Vina › Vista › «Tema: claro / oscuro», y el panel Preferencias.
- **Dónde se guarda:** en `localStorage`, no en el proyecto: es de la usuaria. Va en LS y no en IDB
  porque hay que leerlo antes del primer pintado; lleva la justificación en línea que pide
  `CLAUDE.md`.
- **Nombre:** «Oscuro». En la app no aparece ningún otro.

**De dónde salen los valores.** Samuel pidió que fuera «más tech» y que, sin decirlo, resultara
familiar a quien puede ser el primer cliente. Los neutros y el azul son los que adidas publica en su
sistema de diseño para herramientas internas, YARN (`github.com/adidas/adidas-yarn-design-system`,
licencia MIT, `src/less/variables/colors.less`, último cambio 2020-03-27). Se toman solo colores:
ni logotipo, ni rayas, ni sus tipografías. Que YARN siga siendo lo que usan hoy por dentro no está
verificado.

| Rol | Token | Valor | Contraste |
|---|---|---|---|
| La hoja, los márgenes y el escenario | `--canvas-2d` | `#333333` (YARN «nickel») | — |
| Cuadrícula | `--grid-2d` | `#4a4a4a` (paso propio) | 1,43 sobre la hoja |
| Lo que flota | `--surface-overlay-bg`, borde, sombra | los que la app tiene hoy: `rgba(21, 20, 17, 0.96)`, `rgba(255, 255, 255, 0.07)`, la sombra oscura | — |
| Velo | `--scrim` | el de hoy, `rgb(8 7 6 / 55%)` | — |
| Papel hundido | `--bg-elevated` | `#424242` (paso propio) | 1,26 sobre la hoja |
| Campos | `--field-bg` | `#262626` (paso propio) | — |
| Borde de un campo | `--border` | `#858585` (paso propio) | 3,42 sobre la hoja · 4,10 sobre el campo |
| Texto | `--text-primary` | `#ffffff` | 12,63 hoja · 18,42 lo que flota |
| | `--text-secondary` | `#e1e1e1` (YARN «silver») | 9,66 · 14,09 |
| | `--text-tertiary`, `--ink-hint` | `#bfbfbf` (YARN «gray») | 6,87 · 10,02 · 5,47 sobre el hundido |
| | `--text-disabled` | `#767676` (YARN «darkgray») | 2,78 sobre la hoja |
| Lo activo, bordes, selección | `--accent` | `#0d83ff` (YARN «blue-100») | 3,43 sobre la hoja; blanco encima 3,68 |
| Relleno con texto blanco (las cotas) | `--accent-fuerte` | sin cambio, `#0072c0` | blanco encima 5,04 |
| El acento escrito | `--accent-ink` | `#66b0ff` (YARN «blue-60») | 5,55 · 8,09 |
| IA | `--ai` | el del marco, `#ab93ed` | 4,89 sobre la hoja |
| Éxito, aviso, peligro (como texto) | `--success`, `--warning`, `--destructive` | `#65cc3d`, `#f2b400`, `#ff7666` (YARN) | 6,17 · 6,80 · 4,83 sobre la hoja |

`#0d83ff` marca lo activo, que no lleva texto: a un glifo le basta 3:1. Con texto blanco encima da
3,68, bajo el mínimo; por eso las cotas conservan `--accent-fuerte`. El azul de Vina en claro es
`#0584da`: están a un paso.

**Lo que hay que resolver en P7, y no antes.**

- **Dos tintas donde hoy hay una.** `--ink-on-light*` se usa tanto dentro de la pieza (siempre
  blanca) como sobre la hoja (que en oscuro es `#333`; ahí `#2b2d33` da 1,09:1 y no se ve). Hay que
  repartir sus 58 usos en 18 archivos: lo que se dibuja dentro de la pieza se queda, y lo que se
  dibuja sobre la hoja (trazos, la goma de la Pluma, las medidas de Medir, las guías) pasa a una
  tinta que cambia con el modo.
- **Los ocho pares de costura** están a L 0,55 y sobre `#333` dan entre 2,45 y 2,77:1. En oscuro
  suben a L 0,60: entre 3,02 y 3,36 sobre la hoja, y 3,76 o más sobre la pieza.
- **El escenario 3D** sigue a `--canvas-2d` por CSS; no pide nada más.

## 8. Lo que se borra

| Qué | Archivos | Su puerta pasa a |
|---|---|---|
| La tarjeta de herramienta | `ToolStrip2D.tsx` (167 líneas), `ToolStrip2D.css` (102) | La línea al pie: nombre, tecla, mensajes y opciones. |
| Las reglas | `RulerLayer.tsx` (103), `rulerTicks.ts` (130) y sus tests | La marca de escala y las cotas. |
| La cruz del origen | `GridLayer.tsx:53-58` | Nada. |
| El interruptor de cuadrícula que no oculta | «Vista › Cuadrícula» (`LogoMenu.tsx:205`), el comando `toggle-grid` (`unifiedBarCommandDefs.ts:75`), `snapToGrid` y `toggleSnapToGrid` en `editorSlice.ts` | Nada: la cuadrícula está siempre. |
| La zona AUTO | `DockAutoZone.tsx` (79), `dockSuggestions.ts` (33), `pinAuto`, `unpinAuto`, `toggleDockSignaling` y `pinnedExtra` en `dockSlice.ts`, «Vista › Sugerencias del dock» (`LogoMenu.tsx:227`) | Sus cuatro sugerencias: Escalar y Lista de materiales, a Vina › Patrón; Exportar DXF ya está en Vina › Archivo; Mapa de ajuste, al grupo de la prenda. |
| La fila de capas como tarjeta | `FilaDeCapas.css` (67); el componente se queda y cambia de sitio | Barra superior. |
| El modal del piquete | `NotchPrecisionModal.tsx` (118). `notchPrecisionCopy.ts` se queda: de ahí sale el texto del aviso | La cota sobre el piquete. |
| Las líneas «Editando: …» | siete sitios en `cotas/sujeto.ts` | Nada: lo dice la selección. |
| La barra del 3D y la píldora «Texturizado» como superficies flotantes | el contenedor de `FitMapToggle.tsx` y `SurfaceModePill.tsx`; sus menús se quedan | Barra superior, grupo de la prenda. |
| El estado del 3D como superficies sueltas | `.sim-status` (`Viewport3D.tsx:1056`), el contenedor de `SimulationStatusOverlay.tsx`, el pill de `RightDock.tsx:123` | La sección del 3D de la línea al pie. |
| El piso gris del 3D, como valor de fábrica | el plano y la rejilla de `Viewport3D.tsx:961-969` | Plano de solo sombra. |
| El modo ajustes de la barra de IA y sus tres botones de modo | en `UnifiedBar.tsx` | Panel Preferencias; un solo modo. |
| En Propiedades | preajustes de margen y «Ajustes de piquete» en `PieceProperties.tsx` | El campo de margen; la línea al pie y la etiqueta del piquete. |
| «Dibujar desde cero» de la pantalla vacía | `EmptyState2D.tsx` | La Pluma del margen. |

**El dock guardado de la usuaria no se pierde.** `vina-docks` v1 tiene `pinnedExtra` y `signaling`
en un esquema `.strict()` (`dockSlice.ts:137-145`), y si el sobre no valida, la usuaria recibe el
dock de fábrica en silencio. Al quitar la zona AUTO el sobre pasa a v2 con una migración que lee v1,
descarta esos dos campos y conserva `tools2d`. Lleva un test con un sobre v1 de verdad.

## 9. Trinquetes y medidas

Tres en navegador, con línea base en JSON que solo baja, como los de F0 y F1.

1. **Reposo** (nuevo, `tests/e2e/reposo-solo-lo-que-perdura.spec.ts`). En los cuatro reposos de
   § 4.6, el conjunto de `data-superficie` visibles tiene que estar contenido en lo permitido:
   `ambiente`, `documento` y `pista`; en la pantalla vacía, además `estado-vacio`. Hoy, en 2D con
   patrón, hay además `tira`, `fila` y `barra`.
2. **Superficies por acción** (existente). Línea base nueva al cierre de cada fase. La lista de
   acciones pasa a ser la de § 5.1.
3. **Contraste** (existente, `contraste-del-cromo.spec.ts`). Ningún texto por debajo de 4,5:1 sobre
   su fondo real. Se vuelve a medir entero en P1b. Desde P7 corre en los dos modos, con una línea
   base por modo.

Y dos de emplazamiento: **los márgenes no se mueven** (la x del margen es la misma con panel y sin
panel; en 2D desde P4, en Split desde P5) y **el selector de vista no se mueve** (la misma x en las
tres vistas, desde P2).

**Quién puede ser `ambiente`.** Lista cerrada: la barra superior, los dos márgenes y la línea al
pie. La fija `tests/repo/superficies-declaradas.test.ts`, archivo por archivo. El vocabulario gana
`pie` (las opciones de la línea al pie, que cuentan cuando aparecen) y pierde `tira`, `fila`,
`mapas` e `indicador-simulacion`. La frase es `pista`; la marca de escala, `documento`; las
etiquetas de opción, parte de `cabina`.

**Dónde bloquean.** `scripts/deploy-prod.sh` hoy no corre ninguno de los tres: su lista e2e
(`:175-203`) no los nombra. P0 los añade. Sin eso, la ley 7 es prosa.

En la suite unitaria cambian `contrasteDeTokens.ts` (pares con piso para la rampa de papel, incluido
terciario sobre hundido), `acento-legible.test.ts`, `HintText.legibilidad.test.tsx`,
`tipografia-del-cromo.test.ts`, `zIndexScale.test.ts` y `tests/repo/superficies-declaradas.test.ts`.

**Los colores escritos a mano.** `node scripts/ui-contract-lint.mjs` hoy: R3 = 565. Cuando lo que
flota pasa a claro, un texto claro escrito a mano dentro de un menú, un aviso o un modal se vuelve
invisible. Por eso P1b no los busca recorriendo la app: recorre `--list R3` en los archivos de las
superficies que flotan y clasifica cada color. Los paneles y la barra no cambian de material: sus
literales siguen valiendo y bajan en P6. El contador solo baja.

## 10. Enmiendas

| Documento | Cambio |
|---|---|
| Skill `contrato-de-interfaz` § 2 (materiales) | Vuelven a ser dos materiales distintos: `chrome` (el marco: oscuro, atracado, sin sombra) y `overlay` (lo que flota sobre la hoja: blanco, línea de pelo, sombra corta). Deroga la enmienda del 26-09, «un solo material». Se añade el ámbito de papel y se reescribe la advertencia de «`--text-*` es tinta de cromo oscuro» (§ 7.2). |
| Skill § 3 (emplazamiento) | Se añade la ley 2: en reposo, solo lo que perdura. Y «los márgenes y el selector de vista no se mueven». |
| Skill § 2, excepción de la tira | Se reemplaza por la línea al pie, que es marco, no una excepción. |
| Skill § Verificación | Se añade el trinquete de reposo. |
| Skill «Lo que NO se hace» | Sigue vigente: ni más aire, ni otra fuente, ni otros iconos. |
| `2026-09-24-cromo-callado-design.md` | Encabezado: F2 a F6, § 4.4, § 4.6 y § 8 sustituidos por este documento. |
| `2026-08-14-fase-3-4-emplazamiento-paneles-design.md` § 2.1-2.2 | Paneles a ras y a la derecha; una ranura por debajo de 1600 px, con reemplazo. |
| `2026-09-05-dueno-del-emplazamiento-2d-design.md` | Queda sin objeto en su mayor parte: de las catorce superficies que repartía, se van del borde del lienzo la tira, la fila, el modal de piquete y la barra de IA. Se anota al pie. |
| `2026-09-06-escalera-de-escape-design.md` | Gana dos peldaños: la barra de IA y el panel. |
| Firma de María #1109 (fila de capas en el lienzo) | Persistente y a un clic, en la barra superior. En español a 1366 px no se pliega. |
| Firma de María #1103 (puntos del contorno visibles) | Sin cambio. |
| #1099 (modal del piquete junto a la pieza) | El modal desaparece; la cota conserva la vista previa y el largo del borde. |
| #1010 (los mapas de ajuste, a la vista) | «Mapa» está siempre en el grupo de la prenda, apagado hasta que se simula. |
| #1095 (el dock que no cabe) | El margen conserva la barra de desplazamiento a la vista. |
| C4 § 3.1.A (el aviso de la simulación no se calla) | El indicador cambia de sitio, a la línea al pie; el aviso se conserva. |
| `CLAUDE.md`, fila D4 | «AgentSettings re-homed in UnifiedBar» pasa a «panel Preferencias desde LogoMenu», al cerrar P2. |

## 11. Fases

Cada fase tiene su plan, su PR y su despliegue local. Gate de todas: `npx tsc -b --noEmit && npm run
test && npm run lint && npm run lint:ui`, más la lista e2e de `scripts/deploy-prod.sh` antes de
mezclar. Sin `--no-verify`.

**El orden es el de la tabla y no se altera.** Cada fila depende de la anterior, y al cerrar cada
una la app publicada tiene todas sus puertas.

| Fase | Tamaño | Qué entra | Cómo queda la app al publicarla |
|---|---|---|---|
| **P0** Base | XS | El trinquete de reposo, con la línea base de hoy. Los tres trinquetes, a la lista e2e del deploy. | Igual que hoy. |
| **P1a** El papel | S | `--canvas-2d` y `--grid-2d`. La cuadrícula de un paso. Fuera las reglas, la cruz del origen y el interruptor de cuadrícula que no oculta. La marca de escala, a la derecha del dock mientras el dock flote. «Unidades» en el menú. | El cromo de hoy sobre el papel nuevo. |
| **P1b** Lo que flota, en claro | M | El ámbito de papel (§ 7.2). El material blanco de lo que flota (§ 7.1): menús, avisos, tooltips, modales, la barrita de la pieza. Sus colores escritos a mano, clasificados. Enmienda del contrato § 2. | La estructura de hoy; lo que flota, en claro; la barra y los paneles, como están. |
| **P2** El marco del patrón | L | Margen de herramientas del patrón, con su desborde. Barra superior: selector centrado, grupo del patrón. AUTO fuera, con sus cuatro puertas y la migración del sobre. **La línea al pie, con todas las opciones de todas las herramientas**; la tarjeta se borra. Pantalla vacía. IA convocada: un modo, tres estados, conversación en el store, `Ctrl+/`. Preferencias como panel. | Nada flota en reposo. Todas las opciones tienen sitio en la línea al pie. |
| **P3** Sobre el objeto | M | Etiqueta de opción. Piquete sin modal, con su cota viva. Punto con cota. Tipo de costura sobre la costura (y sale de la línea al pie). Tipo de esquina sobre el vértice. La puerta de vuelta por Seleccionar. Barrita de cuatro, con la regla del candado. Una cota a la vez. | El tipo de esquina ya tiene puerta fuera de Propiedades. |
| **P4** Paneles | M | Una ranura, a la derecha y a ras, con reemplazo. Propiedades de pieza en dos niveles y a petición. Avatar de siete campos. Capas con iconos. | Los márgenes no se mueven en 2D. |
| **P5** 3D y Split | M | Fondo «Papel» y suelo de solo sombra, de fábrica. Margen del 3D. Grupo de la prenda, con su estado en el store. La sección del 3D de la línea al pie, con el estado de la simulación. Línea de pelo entre vistas. Material de la escala y la tabla de los mapas. «Capturar visor» al menú. | Los márgenes no se mueven tampoco en Split. Reposo en Split y en 3D: solo lo que perdura. |
| **P6** Limpieza | L, en 3-4 PR | Tamaños de letra literales a la escala. Los colores literales que queden. Retiro de alias y de los tokens de § 7.5. | Igual a la vista. |
| **P7** Modo oscuro | M | § 7.6: el bloque de valores, la puerta en el menú y en Preferencias, el reparto de `--ink-on-light*` entre pieza y hoja, los pares de costura a L 0,60. | Dos modos. |

**Una regla que el modo oscuro adelanta a P1b:** ningún color escrito a mano en lo que cada fase
toque. Con dos modos, un color fijo queda mal en uno de los dos. P7 no arranca con R3 por encima de
cero en el área del lienzo ni en lo que flota.

## 12. Riesgos

- **La pantalla de María es 1366 × 643 y trabaja en Split.** Es su Chrome en una laptop de 768
  (`2026-08-30-cotas-vivas-design.md:30`). A ese tamaño el margen de herramientas se llena con las
  doce y la hoja mide 571 px de alto. Cada fase se mira a ese tamaño y en Split antes de cerrarla.
  La captura 13 es la primera.
- **La línea al pie es el canal que ella no leía.** El 10-09 tenía «Tab escribe largo y ángulo»
  escrito abajo y puso el largo a pulso. Por eso deja de ser una frase gris sobre el papel: es una
  franja oscura, con el nombre de la herramienta y con botones. Si aun así no la ve, la salida es
  llevar las opciones junto al cursor, no volver a la tarjeta.
- **El marco es el contraste más fuerte de la pantalla** (18,32:1 contra la hoja). Si pesa, se
  aclara `--bg-deeper`; cuesta volver a medir la rampa del marco, porque el terciario sobre el
  hundido ya está al límite (4,79:1).
- **Dos ámbitos en la misma pantalla.** Un componente que escriba un color a mano se ve bien en uno
  y mal en el otro. El trinquete de contraste lo caza en los estados que mide; fuera de ellos, la
  defensa es la clasificación de R3 (§ 9).
- **Lo que flota en el 3D y está escrito a mano** (`FitMapToggle.tsx`) sigue oscuro hasta P5.
- **La rama de i18n** (`worktree-i18n`, PR #1225) toca los mismos componentes y está pensada para
  un solo merge al final. Cada fase de aquí la aleja de `main`. Hay que traer `main` a esa rama
  después de cada fase, y decidir con Samuel cuál de los dos programas va primero.
- **El blanco de las piezas sobre el papel nuevo** baja de 1,15 a 1,10. Reserva: `#f5efde` (§ 7.3).
- **Las exportaciones del 3D.** Con el fondo «Papel» el lienzo es transparente: una captura o una
  vuelta 360° saldría sin fondo. La exportación tiene que pintar el color de la hoja, salvo que
  `exportTransparent` esté activo.
- **Subir estado al store** (la conversación de la IA, «Avatar») es trabajo de arquitectura dentro
  de fases que parecen de emplazamiento. P2 y P5 lo llevan contado.
- **Las reglas.** La frase de María que apoya quitarlas (07-09 [20:36], «tiene que tener una regla
  ahí») admite la lectura literal: que quiere una regla. Si las echa de menos, vuelven: son dos
  archivos.
- **Muchos tests fijan los valores de hoy.** Cada fase lleva su actualización; ninguna se salta.
- **La home usa otro papel** (`--papel: #F4EFE6` en `home/tokens.css`). Igualarlo al de la app es
  una línea y una decisión de Samuel; no entra en este documento.
- **El modo oscuro dobla la revisión.** Cada pantalla y cada contraste se miran dos veces.
- **Piezas blancas sobre la hoja oscura** dan 12,63:1: destacan mucho, y encandilan más que un
  oscuro en el que también la pieza se apague. Si molesta, la salida es bajar el blanco de la pieza
  en oscuro (un token), no oscurecerla.
- **Los colores del modo oscuro vienen de un sistema de diseño ajeno y de 2020.** Son grises neutros
  y un azul: sirven igual si el cliente es otro. No se toma nada que identifique a la marca.

## 13. Evidencia y cómo regenerarla

Las capturas de `2026-10-02-interfaz-en-papel/` (`index.html` las enseña en orden):

| Archivo | Qué muestra |
|---|---|
| `00-hoy-2d.png`, `00-hoy-split.png` | La app de hoy, para comparar. |
| `01-reposo-2d.png` | Reposo con patrón. |
| `02-pieza-seleccionada.png` | La cabina de la pieza: una cota y cuatro acciones. |
| `03-piquete-opciones-al-pie.png`, `03-de-cerca.png` | El piquete antes del clic: sus opciones en la línea al pie. |
| `04-piquete-cota-en-el-borde.png`, `04-de-cerca.png` | El piquete después del clic: la distancia sobre el borde. |
| `05-split.png`, `06-3d.png` | Las vistas con escenario. |
| `07-pantalla-vacia.png` | Sin patrón. |
| `08-panel-a-peticion.png` | Propiedades: a la derecha, a ras, en oscuro, sin reencuadrar. |
| `09-ia-convocada.png` | La barra de IA. |
| `10-oscuro-reposo-2d.png`, `11-oscuro-pieza-seleccionada.png`, `12-oscuro-split.png` | El modo oscuro (§ 7.6). |
| `13-pantalla-de-maria-split.png` | 1366 × 643, en Split, con el piquete. |

Se hicieron con Playwright contra producción: headless con la tarjeta gráfica real
(`channel: 'chromium'`, `--enable-gpu`, `--use-angle=d3d11`), el DXF
`tests/fixtures/garments/maria_patrones_samuel_2M.dxf`, y CSS inyectado. Los scripts
(`vina-prod.mjs`, `maqueta-marco.mjs`) están en `docs/reports/ui-audit-2026-10-02-hoy/maquetas/`,
carpeta ignorada por git.

**Lo que las maquetas no enseñan y el plan no puede dar por visto:** el avatar sin su sombra (en la
app real la conserva); la línea al pie a 40 px, donde va a 36; el selector de vista sin centrar; el
grupo «Mapa»; el estado de la simulación en la línea al pie; un menú, un aviso o un modal con el
material claro; las etiquetas de opción de la costura y de la esquina; un panel abierto en Split o
en 3D; el botón «Más» de la línea al pie; el plegado de la barra superior; el margen cuando no
caben las herramientas; y el panel Preferencias.

## 14. Las revisiones

El 2026-10-02, con la primera versión commiteada, dos subagentes la leyeron por separado. Después,
Samuel corrigió los materiales.

- **Con los ojos de María:** `docs/reports/2026-10-02-interfaz-en-papel-con-los-ojos-de-maria.md`.
  Doce choques con lo que ella dijo o firmó. Los que cambiaron este documento:
  - El nombre y la tecla de la herramienta desaparecían en un tooltip. Ahora están siempre en la
    línea al pie (§ 5.3).
  - La píldora de medida de la Pluma se volvía azul; ella prefirió la negra tres veces (§ 5.5).
  - Las opciones del piquete salían después del clic; ella escogió la forma antes, y un valor
    recordado que no veía la confundió (§ 5.2, § 5.3).
  - El «tipo de punto», que es lo que más usa, se quedaba sin sitio (§ 5.3).
  - Las pistas de Tab junto al objeto chocaban con «una sola voz» (ley 6).
  - Las medidas de la caja al seleccionar: una a la vez (§ 5.5).
  - La frase que se callaba tras usar Q una vez (§ 5.4).
  - La cota del piquete perdía la vista previa y el largo del borde que el modal daba (§ 5.2).
- **Análisis del spec:** `docs/reports/2026-10-02-interfaz-en-papel-analisis-del-spec.md`. Dos
  bloqueos, cinco altos y ocho medios. Los que cambiaron este documento:
  - Entre P2 y P3 las opciones de Piquete, Coser y Punto no tenían superficie, y entre P2 y P4 los
    ajustes de la IA no tenían puerta. Ahora la línea al pie lleva todas desde P2 y Preferencias
    entra en P2 (§ 11).
  - «P3, P4 y P5 en cualquier orden» contradecía tres dependencias. El orden es fijo (§ 11).
  - La conversación de la IA no vive en un store (§ 6.2).
  - «+» no activa herramientas, y el margen no tenía regla de desborde (§ 4.3).
  - De la zona AUTO solo Escalado tenía puerta, y quitarla rompía el dock guardado (§ 8).
  - El selector de vista no podía estar centrado y dejar sitio a seis interruptores con 12 px de
    separación (§ 4.2).
  - Un par de la rampa de papel quedaba bajo el piso de contraste (§ 7.2).
  - Los trinquetes no podían medir la pantalla vacía ni estaban en el gate (§ 9).
  - El interruptor de cuadrícula no oculta nada (§ 4.4, § 8).
  - El estado de la simulación está ratificado en C4 y no se podía quitar sin más (§ 4.5).
- **Samuel, sobre los materiales.** La primera versión era «todo claro». Vio el modo oscuro y pidió
  que la barra superior y los paneles se mantuvieran en oscuro; vio la línea al pie en blanco y
  pidió que fuera oscura también. De ahí sale el marco (D2, § 7.1). Con eso la app conserva la
  rampa oscura que ya tiene, y el trabajo de materiales se reduce a lo que flota.
