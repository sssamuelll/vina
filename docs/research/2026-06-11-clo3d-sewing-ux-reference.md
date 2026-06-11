# CLO3D Sewing & Seam Allowance — UX Reference

> **Date:** 2026-06-11
> **Status:** Reference (parity benchmark)
> **Origin:** Roster workflow `wf_346c5bbc-eb7` — 3 web research agents over the official CLO3D manual (support.clo3d.com) + secondary sources.
> **Purpose:** This is the falsable spec for "funciona como CLO3D" (per Richter §5: parity must be a specification, not a vibe). Each behavior described here is a candidate for a replay-script E2E test.

## Digest

### [clo3d-seam-allowance]
Seam Allowance en CLO3D es una herramienta del 2D Toolbar (Main Menu ▶ 2D Pattern ▶ Create ▶ Seam Allowance) que crea margen de costura POR SEGMENTO de línea, no por pieza: se clica cada segmento del contorno (o Internal Line) y se genera un área gris claro offset hacia fuera; también se puede aplicar a toda la pieza de una vez con marquee (drag-select) sobre el patrón. Default: 1 cm de ancho, que se RESETEA al default con cada nuevo segmento (no hay default global configurable; feature request abierto). La misma herramienta selecciona (segmento resaltado en amarillo), edita y borra (tecla Delete o right-click ▶ Delete). El SA NO es editable directamente: es paramétrico/derivado del contorno — para cambiar su forma se edita el Pattern outline y el SA sigue automáticamente. Property Editor por segmento seleccionado: Width (por línea o por punto desde v6.2), Smooth Intersection (v6.2, conecta SAs de anchos distintos), y Seam Type con Start (3 opciones, activo si solo un extremo tiene SA), End (3 opciones) e Intersection (6 opciones tipo icono, activo cuando ambos segmentos adyacentes tienen SA; se selecciona el segment point/esquina); darts creados con right-click "Add Dart" añaden 2 opciones extra de Dart Cap. La geometría de esquina se calcula automáticamente por ángulos (no ajustable manualmente — limitación confirmada por staff). Visualización: área gris claro en ventana 2D (sin línea punteada documentada; la sewing line sigue siendo el contorno), toggle Show/Hide en Display ▶ 2D Pattern ▶ Show Seam Allowance y en la barra vertical de la ventana 2D (v5.0+), visible también en Print Layout Mode; con la herramienta activa los SAs se fuerzan visibles. El SA NO aparece en la ventana 3D ni afecta a la simulación física (anotación 2D pura; concepto cutting line vs sewing line para DXF-AAMA).

### [clo3d-sewing-tools]
CLO3D modela costura como pares de "Sewing Lines" creadas en 2 mitades. Segment Sewing: 2 clicks (un segmento completo delimitado por puntos por click; hover resalta y muestra la diferencia de longitud, en rojo si >1mm; arrastrar antes del 2º click orienta el notch direccional). Free Sewing: 4 clicks (click-arrastre-click define inicio, dirección y fin arbitrarios de cada mitad; punto azul de snap indica longitud igual a la 1ª mitad; right-click durante el arrastre abre ventana para longitud numérica exacta). M:N (Segment/Free): se accede manteniendo pulsada la herramienta padre; se seleccionan los segmentos M + Enter (quedan en color neón), luego los N + Enter; N se subdivide proporcionalmente a M; Delete deshace el último paso, Esc cancela todo, segmento inválido se pinta en rojo; Unlink M:N Sewing (popup de Edit Sewing) desagrupa. Costura torcida se evita manteniendo los notches direccionales paralelos (si se cruzan, una pieza se cose invertida al simular); el lado del notch depende del orden inicio→fin; se corrige con Reverse Sewing (Ctrl+B). Edit Sewing (2D y 3D): click selecciona (línea en negrita; popup con chips de color si hay varias costuras solapadas), arrastrar el centro mueve la costura, arrastrar un extremo ajusta longitud (right-click manteniendo pulsado = distancia numérica), popup right-click ofrece Reverse/Delete (borra el par; remedio para notches torcidos)/Merge/Add Point on Start-End/Deactivate/Hide/Select All with Same Property (Fold Angle/Strength). Las 4 herramientas existen idénticas en toolbar 2D y 3D: al activarlas en 3D todos los segmentos cosibles se ponen en negrita y las costuras se reflejan en ambas ventanas (en 3D, Free Sewing termina cada mitad con doble click; snap a punto azul desde v5.1). Propiedades de costura (Property Editor con seamline seleccionada vía Edit Sewing): Fold Angle 0–360° (180=plano, →0 pliega hacia delante, →360 hacia atrás) y Fold Strength (mayor=más se acerca al ángulo; 0 aplana costuras infladas, p.ej. forros); ambas bloqueadas si Sewing type=Turned.

### [clo3d-sewing-viz]
CLO3D dibuja las sewing lines como líneas de color superpuestas al borde del patrón en ambas ventanas (2D y 3D simultáneamente); cada relación de cosido se crea como un PAR de mitades (Segment/Free Sewing) y se identifica en el Object Browser mediante un "color chip" delante del nombre, de modo que el color es el mecanismo de emparejamiento visual; borrar una mitad borra su par. La dirección se indica con un "Directional Notch": una marca perpendicular situada JUNTO AL PUNTO DE INICIO de cada mitad ("el punto cerca del notch es el start point; el lejano, el end point"); su orientación depende del orden de clics y se invierte con Reverse Sewing (Ctrl+B, right-click con Edit Sewing en 2D o 3D). El feedback de cosido mal definido es geométrico y pre-simulación: si los notches quedan cruzados (no paralelos), las líneas de cosido que conectan piezas en la ventana 3D se dibujan cruzadas en X, y al simular una pieza se voltea/retuerce; además, al crear la segunda mitad un valor de diferencia de longitud sigue al cursor y se pinta en ROJO si supera 1 mm, un punto-guía azul marca la longitud igual con snap del cursor, y "Check Sewing Length" resalta pares con longitudes discrepantes. Durante la creación, el segmento bajo el cursor se resalta en azul claro y hay preview de la sewing line al hover. Toggles: Show 2D Sewing (Display menu / toolbar 2D, Shift+B), "Show Sewing Lines" en el Vertical View Toggle Menu del 3D, y Show/Hide Sewing por línea vía right-click; las líneas desactivadas se vuelven blancas. En el garment simulado, el seam se renderiza vía propiedad 3D Seamline (Intensity + Thickness por sewing line en el Property Editor; intensity 0 lo oculta) con toggle Show 3D Seamlines, más Seamline Puckering para realismo. Los notches de patrón se crean con la Notch tool (se propagan al seam allowance, placement configurable en Property Editor).

## Full reference

### [clo3d-seam-allowance]
# Seam Allowance en CLO3D — UX exacta (manual oficial support.clo3d.com)

## 1. Dónde vive en la UI

- **Main Menu ▶ 2D Pattern ▶ Create ▶ Seam Allowance**
- **2D Toolbar ▶ icono Seam Allowance** (icono de 25×25 px en la toolbar de la ventana 2D)
- No hay atajo de teclado por defecto documentado.
- Es **una sola herramienta modal** que cubre crear, seleccionar, editar y borrar SA. No hay diálogo de creación: todo es click directo + Property Editor.

## 2. Flujo de creación (POR LÍNEA, con atajo de marquee para toda la pieza)

1. Activar la herramienta (menú o toolbar).
2. **Clicar sobre el segmento del Pattern outline** (o sobre una **Internal Line** — soportado) donde quieres SA.
3. → "Seam allowance is added and colored in grey" / "appears in light-grey": se genera el área de margen offset hacia fuera del contorno, rellena en gris claro.
4. Repetir por cada segmento. **El modelo de datos es por-segmento**, no por-pieza.
5. **Atajo para pieza completa** (confirmado por CLO staff): con la herramienta activa, hacer **marquee (drag-select) sobre todo el patrón o sobre una zona** → se crea SA en todos los segmentos abarcados de una vez.

**Default:** width = **1 cm (10 mm)**. Crítico para replicar: el valor de width **se resetea al default con cada nuevo segmento seleccionado** — no "recuerda" el último valor usado, y **no existe ajuste de default global** (es un feature request abierto sin timeline, confirmado por CLO Designers).

## 3. Selección

- Misma herramienta: **clicar el outline/Internal Line que ya tiene SA** → "the seam allowance is selected and its segment is highlighted in **yellow**", y sus propiedades aparecen en el Property Editor.
- También se puede seleccionar el **Segment Point** (vértice/esquina) entre dos segmentos con SA para editar la intersección.

## 4. Property Editor (por SA seleccionado)

| Opción | Comportamiento |
|---|---|
| **Width** | Ancho numérico del SA. Desde **v6.2** se puede introducir "in line or point" (por segmento entero o por punto, permitiendo anchos distintos en cada extremo del segmento). |
| **Smooth Intersection** (v6.2) | Clicando la intersección entre SAs de **anchos distintos**, conecta suavemente los dos márgenes. |
| **Seam Type ▶ Start** | Se activa solo cuando hay SA en **un único extremo** del segmento seleccionado. **3 opciones** (botones-icono, sin nombre textual en el manual). |
| **Seam Type ▶ End** | Igual que Start, para el otro extremo. **3 opciones**. |
| **Seam Type ▶ Intersection** | Se activa cuando hay SA en **ambos lados** del punto (segmentos adyacentes ambos con SA). **6 opciones** de tipo de esquina (botones-icono). |
| **Dart Cap** | **2 opciones extra** que solo aparecen al seleccionar el segment point dentro de un **dart creado con right-click ▶ Add Dart** (además de las 6 de Intersection). |

**Limitación de esquinas** (staff-confirmed): la geometría de la esquina se computa automáticamente a partir de los ángulos de los dos segmentos; **no se puede ajustar manualmente el ángulo/overhang** de la intersección para igualar sewing lines entre piezas — "in CLO it is a limitation".

## 5. Edición y comportamiento ante Pattern editing

- **"Direct editing is not allowed for seam allowances. To edit them, please edit Pattern outlines."** (nota literal del manual). El SA es **paramétrico/derivado**: no tiene handles propios; si editas puntos/curvas del contorno con Edit Pattern, **el SA se regenera y sigue al contorno automáticamente**. Esto es el contrato clave a replicar: SA = offset vivo del outline, nunca geometría independiente.
- Cambios de width/seam type: solo vía Property Editor con el segmento seleccionado.

## 6. Borrado

- Seleccionar el segmento con SA (highlight amarillo) → **tecla Delete**; o
- **Right-click sobre el outline/Internal Line con SA** → pop-up menu → **Delete**.

## 7. Visualización en la ventana 2D

- Área de SA en **gris claro** (fill + contorno gris) offset hacia fuera; la línea de costura (sewing line) sigue siendo el Pattern outline normal. El manual NO documenta línea punteada para el SA (las punteadas en CLO 2D son internal lines tipo fold/baseline).
- Selección: highlight **amarillo** del segmento.
- **Show/Hide** (v5.0+): **Main Menu ▶ Display ▶ 2D Pattern ▶ Show Seam Allowance** o la **barra vertical de toggles de la ventana 2D (2D Pattern Display ▶ Show Seam Allowance)**. En v4.2-: right-click en espacio vacío del 2D con Transform Pattern ▶ Show Seam Allowance. También visible/ocultable en **Print Layout Mode**.
- Regla de forzado: **"All seam allowances remain shown when the Seam Allowance tool is activated"** — el toggle se ignora con la herramienta activa.

## 8. Relación con 3D y producción

- El SA **no se renderiza en la ventana 3D y no añade física a la simulación** (anotación 2D pura). Workaround comunitario para telas transparentes: cortar una tira de patrón con opacidad distinta.
- En export/import **DXF-AAMA** existe el concepto cutting line (borde exterior del SA) vs sewing line (outline), con opción "Swap Cutting Line and Sewing Line" al importar para descartar SA.

## 9. Guion de entrenamiento (replay literal)

1. 2D Toolbar → click icono Seam Allowance.
2. Click en un segmento del contorno → aparece SA gris de 10 mm.
3. (O) drag-marquee sobre toda la pieza → SA en todos los segmentos.
4. Click en un segmento con SA → amarillo → Property Editor → Width = 15 mm (Enter). Repetir por segmento (el campo vuelve a 10 mm en cada nueva selección).
5. Click en un segment point de esquina → Intersection activo → elegir 1 de 6 iconos; si solo un lado tiene SA, en su lugar se ofrecen Start/End con 3 iconos.
6. En dart de right-click: seleccionar el punto interno del dart → 6 Intersection + 2 Dart Cap.
7. Editar el contorno con Edit Pattern → el SA se actualiza solo; nunca intentar arrastrar el borde del SA.
8. Delete key o right-click ▶ Delete para quitar; Display ▶ 2D Pattern ▶ Show Seam Allowance para ocultar globalmente.

### [clo3d-sewing-tools]
# UX de cosido en CLO3D — manual oficial (support.clo3d.com)

## Modelo mental transversal
- Una costura es siempre un **par de Sewing Lines** (dos mitades). Toda herramienta crea primero la mitad A y luego la mitad B.
- Cada mitad lleva un **Directional Notch** (muesca direccional) que indica el sentido del cosido. Regla de oro: los notches de ambas mitades deben quedar **paralelos**; si quedan cruzados, las líneas en 3D se cruzan y al simular una de las piezas se cose invertida/girada ([2D Segment Sewing](https://support.clo3d.com/hc/en-us/articles/115000498767)).
- Las 5 herramientas viven en `Main Menu ▶ Sewing ▶ …` y en las toolbars 2D **y** 3D; las costuras creadas en una ventana aparecen en ambas.

## 1. Segment Sewing ([general](https://support.clo3d.com/hc/en-us/articles/115012381248), [2D](https://support.clo3d.com/hc/en-us/articles/115000498767), [3D](https://support.clo3d.com/hc/en-us/articles/360001771047))
Cose **segmentos completos** (tramos de contorno delimitados por puntos del patrón).
1. Activa la herramienta (toolbar 2D/3D). En 3D, todos los segmentos cosibles se ponen **en negrita**.
2. **Click 1** sobre un segmento → primera mitad establecida.
3. **Hover** sobre el segmento destino: se resalta y junto al cursor flota la **diferencia de longitud** entre ambas mitades; si supera **1 mm se muestra en rojo** como alerta.
4. **Arrastra el ratón a lo largo del segmento destino** para girar el notch hasta dejarlo paralelo al de la primera mitad (la posición del cursor sobre el segmento decide la orientación).
5. **Click 2** → par completado.
- En 3D (v5.1+) aparece un **punto azul** que marca dónde acabaría una longitud igual a la 1ª mitad, con snap del cursor.
- Para resetear notches de un par: **Esc** o **Ctrl+Z** y rehacer.
- **Sub-segmentos**: Segment Sewing solo toma tramos entre puntos; desde v4.1 también **snapea a notches del patrón** ("Divide Sewing Lines Based on Notches") sin añadir puntos. Para un tramo arbitrario, usa Free Sewing.

## 2. Free Sewing ([general](https://support.clo3d.com/hc/en-us/articles/115012226527), [2D](https://support.clo3d.com/hc/en-us/articles/115000531308), [3D](https://support.clo3d.com/hc/en-us/articles/360001754628))
Inicio y fin **arbitrarios** sobre contornos o líneas internas. Son **4 clicks** por par:
1. Hover sobre el contorno: un **punto azul** sigue al cursor (preview del anclaje).
2. **Click** = punto inicial de la mitad A; **arrastra** para fijar dirección (esto define el notch); **click** = punto final de la mitad A.
3. **Click** sobre el otro contorno = inicio de la mitad B. Al arrastrar aparece un **punto azul guía a la distancia exacta de la longitud de A**, y el cursor **snapea** a él.
4. Comprueba que los notches quedan paralelos y **click** final.
- **Longitud numérica**: durante el arrastre, **right-click** abre la ventana *Create Sewing Line*; teclea el valor y OK → el punto final se crea automáticamente.
- **El lado del notch depende del orden inicio→fin** con que dibujas cada mitad: para cambiar el de la mitad A hay que cancelar (**Esc/Ctrl+Z**) y rehacer; la mitad B se cancela con **Delete/Backspace** antes de cerrar.
- En la ventana **3D** cada mitad se termina con **doble click** en lugar de click simple.

## 3. M:N Segment Sewing ([general](https://support.clo3d.com/hc/en-us/articles/115012380868), [2D](https://support.clo3d.com/hc/en-us/articles/115000497727), [3D](https://support.clo3d.com/hc/en-us/articles/360001771067))
Cose **M segmentos contra N segmentos** en grupo (sisa multi-pieza, cuello, etc.). Acceso: **mantener pulsado** Segment Sewing → menú hijo → M:N.
1. Al activarla, un **rótulo junto al cursor** indica "crea las líneas M".
2. **Click en cada segmento del lado M** (clicks simples consecutivos). **Enter** para cerrar el lado M → las líneas M quedan resaltadas en **color neón**.
3. El rótulo cambia a lado N. Click en los segmentos N **en el mismo orden y sentido**, vigilando los notches. **Enter** → el neón desaparece, grupo creado.
- Si las longitudes totales difieren, **N se subdivide proporcionalmente a M** (reparto automático del embebido).
- **Delete** deshace el último click; **Esc** cancela toda la operación; un segmento ilegal se pinta **en rojo** y no se acepta.

## 4. M:N Free Sewing ([general](https://support.clo3d.com/hc/en-us/articles/115012380848), [2D](https://support.clo3d.com/hc/en-us/articles/115002674488), [3D](https://support.clo3d.com/hc/en-us/articles/360001754668))
Igual que M:N Segment pero cada tramo se define con la mecánica Free (inicio-arrastre-fin libres; en 3D, doble click cierra cada tramo). Acceso: mantener pulsado Free Sewing. Flujo: tramos M → **Enter** (neón) → tramos N → **Enter**. Mismos Delete/Esc/rojo-inválido.
- **Desagrupar**: con Edit Sewing, right-click → **Unlink M:N Sewing** → las líneas pasan a editarse individualmente.

## 5. Edit Sewing ([2D](https://support.clo3d.com/hc/en-us/articles/115012380148), [3D "Edit 3D Sewing"](https://support.clo3d.com/hc/en-us/articles/360007764034))
- **Seleccionar**: click sobre la costura → se pone **en negrita**. Si hay varias costuras solapadas en el mismo contorno, surge un **popup con todas las opciones identificadas por chips de color** (ordenadas, la más reciente al final).
- **Mover**: arrastra el **centro** de la línea a lo largo del contorno. En patrones simétricos, la pareja simétrica se mueve a la vez.
- **Ajustar longitud**: arrastra un **extremo**; solo se ajusta esa mitad (repite en la otra; un punto azul guía la longitud de la primera). Para valor exacto: arrastrando sin soltar, **right-click** → ventana *Moving Distance*.
- **Popup right-click**: **Reverse Sewing (Ctrl+B)** invierte el notch ([popup](https://support.clo3d.com/hc/en-us/articles/115000496727)); **Delete Sewing** borra la costura **y su pareja** — remedio recomendado cuando los notches están torcidos ([popup](https://support.clo3d.com/hc/en-us/articles/115000528508), también tecla Delete); **Merge** fusiona patrones por la costura; **Add Point to Pattern on Start/End** añade puntos al contorno en los extremos (el extremo cercano al notch = start, el lejano = end); **Deactivate Sewing** (la línea se vuelve blanca y deja de coser al simular; reactivar con Activate Sewing); **Hide/Show Sewing (All)**; **Select All with Same Property → Fold Angle / Fold Strength**; **Unlink M:N Sewing**.
- En 3D existe la misma herramienta en la toolbar 3D con idénticas operaciones (mover, ajustar extremos, delete, merge, reverse, de/activate, hide).

## 6. Propiedades: Fold Angle / Fold Strength ([Fold Seam Line](https://support.clo3d.com/hc/en-us/articles/115000414567))
Con **Edit Sewing**, selecciona la seamline → **Property Editor ▶ Fold**:
- **Fold Angle** 0–360°; **180° = plano**; hacia 0° pliega hacia el **frente** del patrón, hacia 360° hacia la **espalda** (efecto de planchado).
- **Fold Strength**: intensidad; cuanto mayor, más se acerca al ángulo fijado. Caso típico: chaqueta+forro inflan la zona cosida con los valores por defecto → poner Strength a **0** para aplanar.
- Si el Sewing type es **Turned**, ambos campos quedan bloqueados (v4.0+).

## Checklist anti-costura-torcida
1. Antes del click final, verifica notches **paralelos** (nunca en espejo/cruz).
2. Dibuja ambas mitades en el **mismo sentido de recorrido** (el lado del notch depende del orden inicio→fin).
3. Vigila la **diferencia de longitud en rojo** (>1 mm) en Segment Sewing.
4. Tras simular mal: Edit Sewing → **Ctrl+B** (reverse) o **Delete** del par y recoser.

### [clo3d-sewing-viz]
# Cómo visualiza CLO3D el cosido (sewing) — UX paso a paso

## 1. Representación base de las sewing lines (2D y 3D)

- Las sewing lines se dibujan como **líneas de color superpuestas al contorno del patrón** (o a internal lines) en la ventana 2D, y **simultáneamente como líneas que conectan las piezas en la ventana 3D** — crear cosido desde el toolbar 2D o 3D genera la línea en ambas ventanas a la vez ([3D Sewing](https://support.clo3d.com/hc/en-us/articles/360007863993-3D-Sewing), [Sewing](https://support.clo3d.com/hc/en-us/articles/360000078487-Sewing)).
- El manual no oficial (PDF) lo resume: "**Dotted lines and notches indicate the sewing direction**" — la conexión 3D entre piezas se ve como líneas tendidas entre patrones ([Clo3D Manual PDF](https://www.slideshare.net/slideshow/clo3d-manualpdf/266025255)).
- Cada sewing line aparece en el **Object Browser con un "color chip" delante de su nombre**; ese chip sirve para identificar y seleccionar la línea — el color es el vehículo de identificación visual ([Segment Sewing](https://support.clo3d.com/hc/en-us/articles/115012381248-Segment-Sewing)). La doc oficial no enumera una paleta explícita "par = mismo color", pero el chip por línea + que el par se gestiona como unidad apunta a color compartido por relación (caveat: no confirmado textualmente).
- **Estado desactivado**: al desactivar una sewing line (right-click ▶ Activate/Deactivate), **se vuelve blanca** ([Popup Activate/Deactivate Sewing Lines](https://support.clo3d.com/hc/en-us/articles/115000528308--Popup-Activate-Deactivate-Sewing-Lines)).

## 2. Emparejamiento visual de los dos lados de la costura

- **Segment Sewing**: clic en un segmento → primera mitad; clic en otro segmento → segunda mitad → "**a pair of Sewing Lines**". El par es una unidad: **borrar una mitad borra también su par** ([Segment Sewing](https://support.clo3d.com/hc/en-us/articles/115012381248-Segment-Sewing), [Edit Sewing](https://support.clo3d.com/hc/en-us/articles/115012380148-Edit-Sewing)).
- **Free Sewing**: clic (o clic-arrastre-doble-clic) sobre outline/internal line para fijar start y end de la primera mitad; luego se repite sobre la otra pieza para la segunda mitad ([Free Sewing](https://support.clo3d.com/hc/en-us/articles/115012226527-Free-Sewing), [3D Tool Free Sewing](https://support.clo3d.com/hc/en-us/articles/360001754628--3D-Tool-Free-Sewing)).
- **M:N Segment Sewing** (Shift + multi-selección por lado): N longitudes se reparten proporcionalmente sobre M ([M:N Segment Sewing](https://support.clo3d.com/hc/en-us/articles/115012380868-M-N-Segment-Sewing), [2D Tool M:N](https://support.clo3d.com/hc/en-us/articles/115000497727--2D-Tool-M-N-Segment-Sewing)).
- Re-emparejado rápido: con patrón ya cosido, right-click (Edit Sewing) ▶ **Link Lines** ([Linked Editing](https://support.clo3d.com/hc/en-us/articles/24228902330265-Linked-Editing)).

## 3. Indicador de dirección: el Directional Notch

- Cada mitad lleva un **Directional Notch**: marca perpendicular al inicio de la línea. Regla explícita de la doc: "**The point near the directional notch is the start point and the point far from the directional notch is the end point**" ([Edit Sewing](https://support.clo3d.com/hc/en-us/articles/115012380148-Edit-Sewing)).
- La cara/orientación del notch **depende del orden de los clics** (start→end) al crear la línea ([3D Tool Free Sewing](https://support.clo3d.com/hc/en-us/articles/360001754628--3D-Tool-Free-Sewing)).
- Regla UX al coser: **los notches de ambas mitades deben quedar paralelos entre sí** antes de confirmar la segunda mitad ([Free Sewing](https://support.clo3d.com/hc/en-us/articles/115012226527-Free-Sewing)).
- Corrección: **Reverse Sewing (Ctrl+B)** vía right-click sobre la sewing line con Edit Sewing, tanto en toolbar 2D como 3D — invierte el directional notch ([Popup Reverse Sewing](https://support.clo3d.com/hc/en-us/articles/115000496727--Popup-Reverse-Sewing), [Edit 3D Sewing](https://support.clo3d.com/hc/en-us/articles/360007764034-Edit-3D-Sewing)).

## 4. Feedback de cosido cruzado / mal definido

- **Cruce visible pre-simulación**: "When Directional Notches are crossed, **the Sewing Lines in the 3D window are crossed as well**" — las líneas entre piezas forman una X en 3D. Si se simula así, **una de las piezas se voltea y se cose invertida** sobre la otra. El feedback es la propia geometría de las líneas 3D, no un mensaje de error ([Popup Reverse Sewing](https://support.clo3d.com/hc/en-us/articles/115000496727--Popup-Reverse-Sewing)).
- **Mismatch de longitud**: al crear la segunda mitad, la **diferencia de longitud sigue al cursor**; si supera **1 mm el valor se pinta en rojo** para alertar ([Free Sewing](https://support.clo3d.com/hc/en-us/articles/115012226527-Free-Sewing)).
- **Check Sewing Length**: "Sewing line pairs with a noticeable difference in sewing length **will be highlighted**" — auditoría a posteriori de pares descompensados ([Clo3D Manual PDF](https://www.slideshare.net/slideshow/clo3d-manualpdf/266025255)).

## 5. Hover / preview durante la creación

- Al pasar el cursor sobre outline o internal line, **el segmento se resalta en azul claro** (light-blue); un Pattern Symbol seleccionado se resalta en **amarillo**.
- Segment Sewing: el hover **activa una preview de la sewing line** antes de confirmar ([Clo3D Manual PDF](https://www.slideshare.net/slideshow/clo3d-manualpdf/266025255)).
- Free Sewing, segunda mitad: aparece un **punto-guía azul** en la posición de longitud igual a la primera mitad y **el cursor hace snap** a ese punto ([Free Sewing](https://support.clo3d.com/hc/en-us/articles/115012226527-Free-Sewing), [3D Tool Free Sewing](https://support.clo3d.com/hc/en-us/articles/360001754628--3D-Tool-Free-Sewing)).

## 6. Toggles Show/Hide

- **2D**: Main Menu ▶ Display ▶ **Show 2D Sewing** (también icono en toolbar 2D; atajo Shift+B según el manual PDF) — muestra/oculta todas las sewing lines de la ventana 2D ([Show 2D Sewing](https://support.clo3d.com/hc/en-us/articles/115012381308-Show-2D-Sewing)).
- **3D**: hover sobre el primer icono del **Vertical View Toggle Menu** de la ventana 3D ▶ opción de mostrar/ocultar **sewing lines que conectan patrones**; mismo menú aloja **Show 3D Seamlines** ([3D Vertical Toggle Icons](https://support.clo3d.com/hc/en-us/articles/115001025968-3D-Vertical-Toggle-Icons), [3D Garment Display](https://support.clo3d.com/hc/en-us/articles/115012227167-3D-Garment-Display)).
- **Por línea**: Edit Sewing u Object Browser ▶ right-click ▶ **Show/Hide Sewing** — las líneas seleccionadas (o todas) desaparecen de 2D **y** 3D a la vez ([Popup Show/Hide Sewing](https://support.clo3d.com/hc/en-us/articles/115000528428--Popup-Show-Hide-Sewing)).
- Bug conocido en algunos Mac: sewing lines poco visibles en 3D/render tras updates ([community post](https://support.clo3d.com/hc/en-us/community/posts/21044688663705-How-do-I-clearly-see-the-sewing-line-in-a-3d-window-or-render-window)).

## 7. El seam en el garment simulado

- Propiedad **[Property] 3D Seamline**: seleccionar una sewing line ▶ Property Editor ▶ ajustar **Intensity** y **Thickness** del seamline renderizado; **Intensity 0 oculta ese seamline concreto**. Es la representación "realista" de la costura sobre la malla simulada ([Property 3D Seamline](https://support.clo3d.com/hc/en-us/articles/115013404848--Property-3D-Seamline)).
- Complementos de realismo: **Seamline Puckering** (fruncido a lo largo del seam) ([Seamline Puckering](https://support.clo3d.com/hc/en-us/articles/115012381028-Seamline-Puckering)) y **Sewing Tension** ([Sewing Tension](https://support.clo3d.com/hc/en-us/articles/360001749347-Sewing-Tension)).

## 8. Notches y matching points

- **Notch tool** (toolbar 2D): crea notches sobre el contorno; al añadir **seam allowance, el notch se replica también sobre el allowance**. Propiedades editables (Edit Notch Properties); **Notch Placement** vía dropdown del Property Editor (p. ej. Center sobre una esquina) ([Notch](https://support.clo3d.com/hc/en-us/articles/115015735467-Notch), [Create Notch](https://support.clo3d.com/hc/en-us/articles/115013214287-Create-Notch), [Edit Notch Properties](https://support.clo3d.com/hc/en-us/articles/115013369268-Edit-Notch-Properties)).
- "Matching points" como concepto explícito solo aparece en hilos de comunidad ([Matching lines](https://support.clo3d.com/hc/en-us/community/posts/360039554673-Matching-lines)); el mecanismo oficial de matching es el trío notch + directional notch + check de longitud.

## Lecciones de UX trasladables a OpenClo

1. Par de costura = unidad atómica (borrado en cascada) identificada por color compartido (color chip en browser).
2. Dirección codificada con una sola marca perpendicular en el start point — sin flechas; paralelismo de notches = invariante visual de corrección.
3. El error de cruce se enseña, no se bloquea: líneas 3D en X como preview del defecto antes de simular, con fix de 1 atajo (Ctrl+B).
4. Validación de longitud en línea (valor flotante junto al cursor, rojo > 1 mm) + snap a punto azul de longitud igual.
5. Toggles independientes: sewing lines (constructivo, 2D y 3D) vs 3D seamline (render, por línea con intensity/thickness).

*Caveats: support.clo3d.com bloquea fetch directo (403); detalles extraídos de snippets de búsqueda + manual PDF de terceros. La afirmación "par = mismo color exacto" no aparece literalmente en la doc; se infiere del color chip por sewing line.*

## Sources

- https://support.clo3d.com/hc/en-us/articles/115000414567-Fold-Seam-Line
- https://support.clo3d.com/hc/en-us/articles/115000496727--Popup-Reverse-Sewing
- https://support.clo3d.com/hc/en-us/articles/115000497727--2D-Tool-M-N-Segment-Sewing
- https://support.clo3d.com/hc/en-us/articles/115000498767--2D-Tool-Segment-Sewing
- https://support.clo3d.com/hc/en-us/articles/115000528308--Popup-Activate-Deactivate-Sewing-Lines
- https://support.clo3d.com/hc/en-us/articles/115000528428--Popup-Show-Hide-Sewing
- https://support.clo3d.com/hc/en-us/articles/115000528508--Popup-Delete-Sewing
- https://support.clo3d.com/hc/en-us/articles/115000531308--2D-Tool-Free-Sewing
- https://support.clo3d.com/hc/en-us/articles/115001025968-3D-Vertical-Toggle-Icons
- https://support.clo3d.com/hc/en-us/articles/115002674488--2D-Tool-M-N-Free-Sewing
- https://support.clo3d.com/hc/en-us/articles/115012226527-Free-Sewing
- https://support.clo3d.com/hc/en-us/articles/115012227167-3D-Garment-Display
- https://support.clo3d.com/hc/en-us/articles/115012380148-Edit-Sewing
- https://support.clo3d.com/hc/en-us/articles/115012380848-M-N-Free-Sewing
- https://support.clo3d.com/hc/en-us/articles/115012380868-M-N-Segment-Sewing
- https://support.clo3d.com/hc/en-us/articles/115012381028-Seamline-Puckering
- https://support.clo3d.com/hc/en-us/articles/115012381248-Segment-Sewing
- https://support.clo3d.com/hc/en-us/articles/115012381308-Show-2D-Sewing
- https://support.clo3d.com/hc/en-us/articles/115013214287-Create-Notch
- https://support.clo3d.com/hc/en-us/articles/115013215727-Create-Seam-Allowance
- https://support.clo3d.com/hc/en-us/articles/115013215747-Select-Seam-Allowance
- https://support.clo3d.com/hc/en-us/articles/115013215787-Show-Hide-Seam-Allowance
- https://support.clo3d.com/hc/en-us/articles/115013369268-Edit-Notch-Properties
- https://support.clo3d.com/hc/en-us/articles/115013370348-Delete-Seam-Allowance
- https://support.clo3d.com/hc/en-us/articles/115013370408-Edit-Seam-Allowance-Properties
- https://support.clo3d.com/hc/en-us/articles/115013404848--Property-3D-Seamline
- https://support.clo3d.com/hc/en-us/articles/115015631887-Edit-2D-Seam-Allowance-Properties
- https://support.clo3d.com/hc/en-us/articles/115015714428-2D-Seam-Allowance
- https://support.clo3d.com/hc/en-us/articles/115015735467-Notch
- https://support.clo3d.com/hc/en-us/articles/24228902330265-Linked-Editing
- https://support.clo3d.com/hc/en-us/articles/360000078487-Sewing
- https://support.clo3d.com/hc/en-us/articles/360001749347-Sewing-Tension
- https://support.clo3d.com/hc/en-us/articles/360001754628--3D-Tool-Free-Sewing
- https://support.clo3d.com/hc/en-us/articles/360001754668--3D-Tool-M-N-Free-Sewing
- https://support.clo3d.com/hc/en-us/articles/360001771047--3D-Tool-Segment-Sewing
- https://support.clo3d.com/hc/en-us/articles/360001771067--3D-Tool-M-N-Segment-Sewing
- https://support.clo3d.com/hc/en-us/articles/360007764034-Edit-3D-Sewing
- https://support.clo3d.com/hc/en-us/articles/360007863993-3D-Sewing
- https://support.clo3d.com/hc/en-us/community/posts/16731894454297-Custom-manual-seam-allowance-intersection-angle
- https://support.clo3d.com/hc/en-us/community/posts/21044688663705-How-do-I-clearly-see-the-sewing-line-in-a-3d-window-or-render-window
- https://support.clo3d.com/hc/en-us/community/posts/360039554673-Matching-lines
- https://support.clo3d.com/hc/en-us/community/posts/360042298713-Showing-seam-allowance-on-3D-windown-when-working-with-sheer-fabric
- https://support.clo3d.com/hc/en-us/community/posts/4403216834073-Suggestion-set-the-seam-allowance-width
- https://support.clo3d.com/hc/en-us/community/posts/7268770155289-Seam-allowance-on-darts
- https://support.clo3d.com/hc/en-us/sections/115003578728-NOTCH-SEAM-ALLOWANCE
- https://www.slideshare.net/slideshow/clo3d-manualpdf/266025255
- https://www.youtube.com/watch?v=UhNccdYFH5M
