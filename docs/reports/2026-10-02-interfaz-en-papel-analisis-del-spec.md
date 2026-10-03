# Análisis del spec «La interfaz en papel»

> Revisión de `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (commit `075a3f31`),
> hecha el 2026-10-02 por un subagente de análisis de specs: ambigüedades, contradicciones, estados
> sin definir, puertas que se quitan sin reponer y afirmaciones sobre el código que no se sostienen.
> 2 bloqueos, 5 altos, 8 medios. Verificó las citas `archivo:línea` del spec una por una.
>
> **Qué comprobé yo de lo que afirma:** que «+» añade o quita del dock y no activa
> (`DockToolPicker.tsx`); que `snapToGrid` no tiene lector; que los mensajes de la IA son `useState`
> (`UnifiedBarChat.tsx:102`) y que `Ctrl+/` está registrado sin manejador; las cuatro sugerencias de
> la zona AUTO y el sobre `.strict()` de `dockSlice.ts`; y que el menú Vina no tiene «Exportar». El
> resto de sus citas hay que abrirlas antes de usarlas.

## Bloqueos

**1. P2 retira la tarjeta y el modo ajustes; sus reemplazos llegan en P3 y P4, con un despliegue en
medio.** `ToolStrip2D.tsx:69-71, 138-149` es el único sitio que pinta las opciones de una
herramienta; `UnifiedBar.tsx:298-311`, el único montaje de `AgentSettings` e `InputSchemeSection`.
Entre P2 y P3 las opciones de Piquete, Coser y Punto no tienen superficie; entre P2 y P4 no hay
puerta a las conexiones de la IA. Además P1 coloca la marca de escala «a 12 px del margen», y el
margen nace en P2: a 1366 × 643 esa esquina la ocupa el dock flotante.

**2. «P3, P4 y P5 en cualquier orden» contradice tres dependencias del propio spec.** «Ancho» del
piquete solo existe en `PieceProperties.tsx:281-285` y P4 lo borra; la puerta del tipo de esquina
que P4 exige «primero» es una etiqueta de opción, que nace en P3; y «los márgenes no se mueven» en
Split necesita el margen derecho, que es de P5 (`AppShell.tsx:344, 349-353`: hoy el dock 3D se
desplaza con el panel).

## Altos

**3. «La conversación sigue en el store»: hoy vive en un componente que se desmonta.** Mensajes y
bucle del agente están en `UnifiedBarChat.tsx:102, 150, 323`. `Ctrl+/` (`defaults.ts:115`) no tiene
manejador. Esc ya lo consumen el panel (`ContextPanel.tsx:17-23`) y la deselección global. Sin
definir: qué es «en curso», qué le pasa a una ejecución en vuelo, qué muestra «IA» con la barra
oculta y el agente trabajando, y el orden de Esc.

**4. La opción `mode` de Punto no tiene destino.** `point.tsx:31-41` (Punto, Curva por puntos,
Curva bezier); `usePointTool.ts:233-240`: el modo decide qué despacha el clic. Y la cota escribible
convierte al punto recién creado en sujeto editable dentro de una herramienta cuyo contrato es no
mover puntos (`usePointTool.ts:8-10`).

**5. «+» es una lista de pertenencia, no un lanzador; el margen no tiene regla de desborde.**
`DockToolPicker.tsx`: el clic añade o quita. `Dock.css:20-34`: hoy el dock se desplaza con barra
visible (#1095). `dockSlice.ts:43`: la usuaria puede tener hasta 22. A 643 px de alto, las doce más
«+» llegan a y ≈ 606: no cabe la decimotercera ni «la activa que aparece al final».

**6. Zona AUTO: solo Escalado recibe puerta.** Son cuatro sugerencias (`dockSuggestions.ts:11-22`:
Escalar, Exportar DXF, Mapa de ajuste, BOM). El panel «Lista de materiales» queda solo en la paleta.
`LogoMenu.tsx:227`, «Sugerencias del dock», es un consumidor de `toggleDockSignaling` que el spec no
lista. Y `pinnedExtra` es obligatorio en un esquema `.strict()` (`dockSlice.ts:135-145`): si el
sobre `vina-docks` no valida, `loadDocks` devuelve `null` y la usuaria recibe el dock de fábrica en
silencio.

**7. Barra superior: «centrado» y «su mitad 502» no pueden ser ciertos a la vez.** En las capturas
el selector no está centrado (centro en x ≈ 765; la ventana, 683). Con los dos espaciadores `flex: 1`
de hoy (`TopBar.tsx:65, 79`, `layout.css:20`) su x depende de lo que tiene a cada lado. Centrado en
la ventana quedan unos 426 px para un grupo de 422. O los seis interruptores se pliegan en la laptop
de María, contra #1109, o el selector salta al cambiar de vista.

## Medios

**8. La piel incumple su propio piso.** `#6d6861` (`--text-tertiary`) sobre `#eae4d4`
(`--bg-elevated`) da 4,35:1, y ese par ya tiene piso 4,5 (`contrasteDeTokens.ts:18`); los ítems
inactivos del selector de vista lo usan (`base.css:31`). `--hairline` aparece como un color y hoy es
`1px solid …` (`tokens.css:20, 231`). `--destructive-hover` no figura. `--readout-bg-2d` tiene tres
consumidores. § 7.6 retira `-recessed`, que usa la cota (`cotas.css:27`), y el retiro está en P1 y
en P6 a la vez.

**9. Los trinquetes no pueden medir lo que el spec les pide, y no están en el gate.** La pantalla
vacía es `estado-vacio` (`EmptyState2D.tsx:25`): el reposo «Vacía» falla por definición. «Mapa»
dentro de la barra superior pierde su marca. No hay regla de quién puede ser `ambiente`.
`deploy-prod.sh:175-203` no corre superficies ni contraste. Fuera de los ocho estados que mide el
contraste, un texto claro literal sobre fondo de token (`InspectorTab.css:30, 39, 87, 119, 174`) se
vuelve invisible, no «a la vista».

**10. «Vacía» se define por piezas.** Con solo trazos, solo una foto para calcar, o la Pluma sobre
la hoja en blanco, no hay marca de escala ni grupo del patrón (`EmptyState2D.tsx:12-14`,
`HintText.tsx:160-167`).

**11. Cuadrícula: «siempre» contra «si se oculta», sobre un comando que no oculta nada.**
`unifiedBarCommandDefs.ts:75` y `LogoMenu.tsx:205` despachan `toggleSnapToGrid()`, y `snapToGrid` no
tiene lector. En pulgadas el intervalo 18-45 px no se cumple. No dice qué pasa con `gridSize`.

**12. Paneles: una ranura bajo 1600 deshace dos casos documentados.** `usePanelHost.ts:15-17`: las
dos ranuras resuelven Capas más Propiedades. `panelSide.ts:9-16`: el panel de calco tiene que
quedarse abierto. Sin regla de reemplazo. La captura 08 reencuadra, y el texto dice que el patrón no
se mueve. Propiedades en dos niveles solo describe la pieza (`PropertiesPanel.tsx:115-157` tiene
secciones para borde, vértice, piquete y costura).

**13. § 1 excluye la gramática, y § 5.2 y § 5.5 la cambian.** Piquete sin modal cambia Enter, Esc y
el clic siguiente (`NotchPrecisionModal.tsx:10-11, 44-45`). «Queda de costumbre» contra la regla
vigente (`sujeto.ts:152-155`). Tres rangos de profundidad (3-20, 1-20, 1-30). Bajar
`BAR_MAX_VISIBLE` a 4 no saca el candado: en una pieza bloqueada, rotar y voltear caen por su
`gate` y la barra queda en duplicar, propiedades y desbloquear (`actionCuration.ts:455-463`).

**14. El pie de la hoja.** Cinco opciones (`trimPlace.tsx:45-90`) no caben en 639 px ni en dos
líneas. La marca y la frase cambian de sitio al cambiar de herramienta. «Q usado en el proyecto» no
tiene dónde guardarse (`usePrecisionHint.ts` guarda por dispositivo). Recortar a tres cláusulas deja
teclas sin su único anuncio (`HintText.tsx:112, 120`). En 3D la voz que existe (`.sim-status`,
`Viewport3D.tsx:1055-1059`) no tiene destino.

**15. 3D.** Fondo y suelo son ajustes de la usuaria con mandos (`BackgroundSection.tsx`,
`GroundSection.tsx`). La escala y la tabla de los mapas llevan texto blanco sobre casi negro
(`FitMapToggle.tsx:153-190`). «Mapa tras simular» revierte #1010, que dejó la barra visible en
reposo porque oculta era «indescubrible» (`FitMapToggle.tsx:255-257`). Ocultar avatar y capturar son
estado local del visor (`Viewport3D.tsx:458, 527`).

## Citas del spec que no coinciden

1. `GridLayer.tsx:53-54`: la cruz ocupa 53-58.
2. «Vina › Exportar» no existe: «Exportar 3D / Vuelta 360°» está en Archivo (`LogoMenu.tsx:101`).
3. «Mostrar u ocultar cuadrícula sigue existiendo»: existe el rótulo; no oculta.
4. «Se llegó por «+»»: «+» no activa.
5. «Pinza» y «calcar» como usuarias de la línea al pie: `dart` y `trace` están fuera del catálogo
   del dock.
6. «A zoom 0,48 solo quedan líneas tenues cada 10 cm»: el paso de 1 cm sigue dibujado al 27 %.
7. «Caben unas dieciséis a 768 px»: la referencia del repo es 643.
