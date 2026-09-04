# Revisión adversarial de la interfaz de Vina: el desastre no es la piel

**Fecha:** 2026-09-04 · **Contra:** `main` en `cfa77c27` (lo desplegado el 02-09) · **Pedido de Samuel:** *"la interfaz gráfica es un desastre en general. Necesitamos corregir todos los errores presentes y mejorar el aspecto visual. El concepto es hacerla lo más simple y práctica posible pero tan poderosa como un CAD convencional; para lograrlo, colocar más elementos dinámicos sobre y alrededor de los objetos."*

**Hereda:** `docs/reports/2026-08-14-auditoria-ui-deriva-de-diseno.md` (la auditoría que parió el contrato) y `.claude/skills/contrato-de-interfaz/SKILL.md` (el contrato). Esta revisión no repite el censo del 14-08: mide qué cambió desde entonces, qué se rompió con lo que entró después, y estresa la premisa nueva.

**Evidencia:** capturas y medidas en `docs/reports/ui-audit-2026-09-04/` (local; la carpeta `ui-audit-*` está ignorada por git a propósito, igual que la del 14-08) y en el artefacto visual, con las capturas junto a cada hallazgo: https://claude.ai/code/artifact/e920969f-e9c9-4703-be34-2b6edbca119b (privado hasta que se comparta). Los informes íntegros de los tres revisores están en § 5, § 6 y § 7. Cada cifra de este documento tiene su fuente en § 10.

---

## 0. Veredicto

**"Desastre": confirmado, pero está en otro sitio del que suena.** Hay tres capas de deriva y solo una tiene guardián.

1. **La piel** (tokens, materiales, colores): **contenida, no corregida.** El trinquete del 14-08 hace lo que promete: ningún contador subió en tres semanas. Pero tampoco bajó: 142 `var()` con respaldo, 941 colores literales, 64 `:hover` sin `:focus-visible`, 26 `z-index` literales, los mismos techos desde el 16-08. El bloque de estilos en línea de `AppShell.tsx` que la auditoría usó como ejemplo de su tesis sigue intacto (solo migró el `zIndex`). La piel no empeoró; eso es todo lo que se puede decir a su favor.

2. **El emplazamiento** (dónde vive cada cosa en pantalla): **sin dueño, y es donde está el desastre que Samuel ve.** Entre el 29-08 y el 02-09 entraron tres superficies flotantes nuevas sobre el lienzo (la tira de herramienta, la fila de capas, los chips de cota), cada una posicionada por su propia regla contra su propio marco (el panel 2D, la ventana, el patrón). En la laptop de María (1366×768, vista dividida) se pisan: la fila de capas tapa los tres botones de modo de la barra de IA, corta la pista de la herramienta, y dos chips de cota se solapan al 93 % en una pieza pequeña. El submenú Vista se sale 301 px de la pantalla. Nada de esto lo detecta el trinquete (mira CSS, no layout) ni la suite unitaria (jsdom no calcula posiciones). El censo vivo, que sí lo ve, no se corrió desde el 14-08; corrido hoy, falla exactamente en esos tres botones.

3. **La gramática** (cómo una herramienta decide sobre qué actúa, qué pasa cuando no puede, y dónde se escribe un número): **24 islas, y seis trampas.** De 24 hooks de herramienta 2D, 19 hacen `return` mudo cuando el clic no encuentra sujeto; hay 6 campos de selección paralelos y el Supr global mira dos; 11 funciones de hit-test, 8 radios de enganche distintos y 10 estados de hover locales; 4 superficies distintas para escribir un número; ninguna herramienta devuelve a la flecha. Y **seis teclas sueltas (C, D, E, I, P, W) meten a María en un modo que dibuja su cabina en la tira, pone el cursor en cruz, y no hace nada**: `E` es "Elipse (círculo)", y #1111 es María pidiendo el círculo mientras la app ya le enseña sus opciones. Los issues #1094, #1115, #1117, #1102, #1122 y #1132 no son seis bugs: son seis síntomas de que no existe un "sujeto" compartido ni un "no pasó nada" compartido.

**Sobre la premisa** ("más elementos dinámicos sobre y alrededor de los objetos"): **acierta el sitio y falla la cantidad** (Petra Haft, § 5). "Sobre el objeto" es correcto, es lo que separa un CAD de un formulario, y María lo pide siete veces en su audio ("un menú flotante", "cuánto lo muevo"). Pero una pieza seleccionada **ya carga 16 elementos interactivos** (9 tiradores, 2 cotas, 5 botones), por encima del techo de 12 que Petra propone, y con 4 chips ya se pisan. María misma refutó "más elementos" sobre la superficie donde ya se aplicó: *"se cruzan los números, es como ruido visual, de qué me sirve"* (#1108). La simplicidad no va a venir de más elementos: va a venir de que el mismo gesto signifique lo mismo en todas partes, de un solo lugar para el número, de un solo mensaje cuando nada pasa, y de un solo componente que decida dónde caben. Con la gramática puesta harán falta menos elementos, no más.

**El tamaño** (Plumb Lindgren, § 7): **no es un rediseño.** Ocho ediciones XS/S independientes (unas 35 líneas sumadas) arreglan las colisiones, el submenú, el Supr, los roles de capa y el censo; una campaña mecánica por archivo limpia la piel; solo tres cosas necesitan una decisión de diseño antes de tocar código (los chips que se pisan, el "no pasó nada", y si las cuatro superficies de número se unifican). Un brainstorming global de "rediseño de la interfaz" excede el tamaño medido en 11 de 14 ítems.

**El orden**, por (daño a María × certeza) ÷ costo: primero las ediciones de esta semana (§ 7.1); segundo dos specs cortos, el dueño del emplazamiento y el "no pasó nada" compartido; tercero la gramática (el sujeto activo y el resorte a la flecha), que es la que vuelve barato todo lo demás y la que la tanda 6 ya estaba esperando; la piel va de última y en bloque mecánico, porque está contenida.

---

## 1. Qué se midió y cómo

| Fuente | Qué da | Confianza |
|---|---|---|
| `node scripts/ui-contract-lint.mjs` + historial de `scripts/ui-contract-baseline.json` | los ocho contadores del contrato hoy y su curva desde el 14-08 | alta (determinista) |
| Capturador propio (Playwright, contexto efímero, 16 estados, 1366×768 / 1280×720 / 1600×1000) | capturas, firmas de superficie flotante por estado, % del lienzo tapado por cromo (`elementFromPoint` en una cuadrícula de 40×24), tamaños de fuente visibles, botones sin nombre | alta para lo mecánico; el ojo es mío |
| Medidor de colisiones (rectángulos + `elementFromPoint` en los centros de los botones, 5 viewports) | px² de solape entre fila de capas, barra de IA, pista, badge; alcanzabilidad de los modos de la barra; pares de cotas y de etiquetas de regla que se pisan; desborde del submenú | alta |
| Medidor de contraste (color computado del texto y fondo compuesto, WCAG 2) | contraste real de la tinta sobre el papel y del texto sobre cada acento | alta; el acento `oklch` se convirtió a sRGB a mano y se registra en § 10 |
| Barrido de teclas en el navegador (a-z, con y sin Shift) + prueba de gesto en el modo `circle` + prueba de clic en modo alambre | qué teclas activan un modo sin manejador; si un clic en ese modo hace algo; si la pieza sigue teniendo blanco en alambre | alta |
| `scripts/ui-surface-audit.mjs` (el censo del 14-08, mismo script, 1600×1000) | comparación directa con el 14-08: firmas, botones, contraste, foco, solapamientos | media: hoy alcanza 39/42 estados |
| Trazado delegado (reasonix, DeepSeek V4 flash, 24 hooks → 1 tabla, $0,14) | sujeto, silencio, Supr, Escape, hover y superficie de número por herramienta, con file:line | 7 de 7 citas verificadas a mano contra el código |
| Tres revisores con lentes disjuntos (Opus): Petra Haft (gramática y premisa, 836 líneas), Iris Tane (visual), Plumb Lindgren (tamaño) | § 5, § 6, § 7 | juicio; cada uno cita file:line o captura; sus citas nuevas se verificaron antes de entrar aquí (una se refutó, § 4) |

Lo que NO se hizo: no se abrieron issues ni se tocó código. No se revisó la app en el móvil ni con teclado solamente. No se midió el visor 3D en profundidad (solo su cromo).

---

## 2. Lo que está roto hoy en la laptop de María (medido)

Todo esto se reproduce con el DXF de María (`tests/fixtures/garments/maria_patrones_samuel_2M.dxf`, 5 piezas) en `main`. Las cifras son a 1366×768 en vista dividida salvo que se diga otra cosa; 1366×643 es el viewport real de su Chrome (#1095).

| # | Qué | Medida | Causa (file:line) | Issue |
|---|---|---|---|---|
| **F1** | La fila de capas tapa la barra de IA | 7980 px² de solape (10108 a 1366×643, 8474 a 1280×720). `elementFromPoint` en el centro de los tres botones de modo (chat, comandos, ajustes) devuelve `.fila-de-capas`: **no se pueden clicar**. El censo del 14-08, corrido hoy, falla exactamente en esos tres estados | `FilaDeCapas.css:7-10` se ancla a `right:12px; bottom:12px` del panel 2D; `barPosition.ts` centra la barra contra la ventana. El mismo choque ya se arregló dos veces en el 3D (`floating.css:6-10`, `SnapshotBar.css:1-5`: `bottom: 94px`, "a bottom:12 quedaba recortado detrás del bar"), y la fila nació sin mirar ese precedente | nuevo |
| **F2** | La pista de la herramienta queda cortada | 3612 px² bajo la fila; se lee "Clic en una cota para escribirla · arrástrala…" y ahí termina. Es la única instrucción de la herramienta en pantalla | la pista es un `<text>` del svg al pie del lienzo (`HintText.tsx`); la fila flota encima a `--z-menu`. Mismo símbolo que F1 | nuevo |
| **F3** | El submenú Vista se sale de la pantalla | 24 ítems, 956 px de alto: sobran **301 px** a 768, 426 a 643, y **72 px incluso a 1000**. Sin scroll, sin señal | `LogoMenu.tsx:252` y `:297` renderizan `.logo-menu__submenu` sin desborde (`floating.css:149-164`). El hermano #1095 se arregló con `menuOverflow.ts`, que solo usa `ContextMenu.tsx` | hermano de #1095 |
| **F4** | Los chips de cota se pisan | pieza de 228×20,4 mm seleccionada: los dos chips "20,4 mm" se solapan **1115 px²** (93 % de un chip) y "228 mm" pisa a "20,4 mm" (329 px²). A 1600×1000 sigue (667 px²) | `chipScreenPosition` (`cotasGeometry.ts:11`) recibe **una** cota: no puede saber de las otras; y `COTA_OFFSET_PX` tiene un segundo consumidor (`CotaLines.tsx:14`), así que mover el chip sin mover la línea rompe el anclaje | nuevo |
| **F5** | El número que María lee y escribe no cumple AA | chip de cota relleno: blanco sobre `--accent-2d` (`oklch(0.66 0.16 248)` = `#2b97ee`) **3,10:1** a 11 px. Chip hueco: ese mismo azul sobre blanco, otros **3,10:1** (este se me había escapado). Cromo 3D: blanco sobre `#4a9eff` **2,75:1**. AA para texto de menos de 18 px pide 4,5:1. Y la línea de cota sobre el papel da **2,70:1**, bajo el 3:1 de objeto gráfico. **Refutado de mi primera lectura:** la fila de capas NO falla — mi medidor ignoraba el alfa (`--accent-subtle` es un 13 %) y daba 3,62:1; compuesto bien da **12,24:1** | `tokens.css:50` eligió el azul para "selección + costuras" sin probarle texto encima; `cotas.css` le puso 11 px blancos | nuevo |
| **F6** | Las etiquetas de la regla se solapan | 22 de 61 etiquetas pisan a su vecina a 1366×768 (46 de 61 a 1280×720); las negativas forman la tira "-1200110010009008007…" | `rulerTicks.ts:33-34, 66-67` ya ralea las marcas menores (`minMinorGapPx`); no hay equivalente para el paso mayor, clavado en `minorPerMajor = 10` | nuevo |
| **F7** | **Siete** teclas meten a María en un modo que no hace nada | `C` → Editar curvatura, `D` → Pinza, `E` → Elipse (círculo), `I` → Trazar, `P` → Medir POM, `T` → Editar pespunte, `W` → Fijar. En las siete la tira dibuja la cabina (nombre, atajo, opciones) y el cursor se pone en cruz. Con `E`, un clic y un arrastre sobre el patrón: 5 piezas → 5 piezas, selección vacía. **Un modo que no puedes ver es una trampa que ya disparaste** (Petra) | El registro real vive en `src/shortcuts/defaults.ts` (28 atajos `tool.*`); el `getShortcuts()` de `registry.ts` **no tiene ningún consumidor**. Y el despachador es una cadena de `if` sin `default`: activar un id inexistente compila y no avisa. `T` se me escapó al principio porque `topstitchEdit` sí aparece en el despachador… en el `switch` del cursor, que no es conducir un gesto | #1111 (E) |
| **F8** | El Escape de Slash & Spread nunca se registra | `useEditorInteractions.ts:445` lista `slashAndSpreadTool.handleKeyDown` en las dependencias del efecto y ningún `handlers.push` lo monta; el hook lo implementa en `useSlashAndSpreadTool.ts:407-418` para nada | nuevo |
| **F9** | La tira sigue alcanzable por teclado detrás del modal del piquete | `NotchPrecisionModal` no usa portal, no atrapa el foco y no marca nada inerte (`NotchPrecisionModal.tsx:48-64` solo escucha Enter y Escape). La tira sigue montada debajo y en la MISMA esquina: las dos declaran `top:28px; right:12px`. Shift+Tab desde el campo con autofoco lleva el foco a controles invisibles. **Refutado de mi primera lectura:** que el modal esté en `--z-menu` NO es deriva — se bajó ahí a propósito («deliberately no scrim», dice el archivo) y `src/styles/__tests__/zIndexScale.test.ts` lo fija con esa razón escrita. El defecto es de foco, no de pintado | #1125 |

Tres más, de otra clase:

| # | Qué | Medida | Causa |
|---|---|---|---|
| **F10** | Superficies permanentes con rol de menú — **declarado, no arreglado** | la tira y la fila declaran `z-index: var(--z-menu)` (200), el mismo rol que el menú del logo. El contrato § 3 dice que solo menús transitorios, toasts y la paleta pueden tapar el documento. Pero la escala de capas está gobernada por `zIndexScale.test.ts`, que ratifica rol por rol y con su razón escrita, y la enmienda del 15-08 documenta exactamente el desastre de mover capas sin medir. Con F1 resuelto por posición no queda colisión, así que **el rol se queda como está hasta que haya una decisión escrita**. Lo que sí se corrige es el `25` literal de `SurfaceModePill.css:8`, que es el valor exacto de `--z-panel` | `ToolStrip2D.css:9`, `FilaDeCapas.css:10`, `SurfaceModePill.css:8` |
| **F11** | El visor 3D trae su propio material y su propio acento | `rgba(30,30,30,·)` en 5 archivos y `#4a9eff` en 6, ninguno en `tokens.css`; `FitMapToggle.tsx` lleva 38 líneas con color literal (`#fff` ×6, `#ffff00`, `#666`, `#555`…) y 5 `z-index` literales: es el peor archivo TSX del repo en R3 y R8. Resultado: cuatro azules de acento en la misma pantalla (índigo del cromo, `#2b97ee` de las cotas, `#4a9eff` del cromo 3D, `#4a90d9` del botón activo de `FitMapToggle.tsx:120`), dos declarados y dos no | `FitMapToggle.tsx`, `SurfaceModePill.css:15,26`, `SnapshotBar.css:42`, `CollisionBodyPanel.css:79-80`, `Viewport3D.tsx:1008-1011` |
| **F12** | Ninguna prueba mide la posición de la fila | `FilaDeCapas.test.tsx` corre en jsdom (0 `getBoundingClientRect`, 0 `elementFromPoint`); ningún e2e menciona `fila-de-capas` ni `logo-menu`. F1, F2 y F3 pasaron todos los gates en verde | el contrato ya lo avisa: "la suite unitaria es CIEGA al apilamiento"; el patrón que faltaba está en `tests/e2e/emplazamiento-modales.spec.ts` |

**Lo que no está roto y parecía:** el badge "▲ Solver" que pisa la fila en modo 2D (1470 px²) solo existe en desarrollo (`SolverMetrics.tsx:36`, `import.meta.env.DEV`); María no lo ve. En modo "Renderizado: alambre" la pieza **sí** conserva su blanco (clic en el centro → seleccionada; Petra lo daba por perdido leyendo `pieceBodyStyle.ts:46` y `PieceRenderer.tsx:174`, y el navegador la refuta). Y en 16 estados no hubo ni un `pageerror`, ni un botón sin nombre accesible (0 de 43 a 65 visibles por estado): eso sobrevivió intacto desde el 14-08.

### 2.1 Por qué F1, F2 y F4 son el mismo defecto

Cinco superficies, cuatro marcos:

| Superficie | Se ancla a | Regla |
|---|---|---|
| tira de herramienta | esquina superior derecha del **panel 2D** | `top:28px; right:12px; width:min(300px, 100%-24px)` |
| fila de capas | esquina inferior derecha del **panel 2D** | `right:12px; bottom:12px` |
| barra de IA | centro de la **ventana** | `(window.innerWidth - BAR_WIDTH) / 2`, arrastrable |
| pista de herramienta | pie del **svg**, alineada a la izquierda | `<text>` en coordenadas del lienzo |
| chips de cota | el **tramo** del patrón que miden | posición por geometría, sin conocer a los demás chips |

En una pantalla de 1600 px en modo 2D no se tocan: hay sitio. En un panel 2D de 683 px (la mitad de 1366) las tres de abajo caben en la misma franja de 60 px y ninguna sabe que las otras existen. No es un bug de la fila ni de la barra: **no hay un componente cuyo trabajo sea repartir el borde del lienzo.** La auditoría del 14-08 lo llamó "el cromo flota encima del documento" (§ 4.2); la Fase 3 lo resolvió solo para los paneles de contenido, a petición de Samuel, dejando docks y barra flotando. Lo que entró después (tira, fila, chips) se sumó al lado flotante sin la regla que el lado flotante no tiene. Y el 3D ya había pagado esta lección: `floating.css:6-10` reserva la franja de la barra con un comentario que lo explica ("si el usuario arrastra el bar, ese es su layout"). La fila se escribió sin buscar a ese hermano.

### 2.2 Lo que María va a decir

Para ella F1 es "la IA no me responde" (los botones están tapados, el campo de texto sí se ve). F2 es "no sé qué hacer con esta herramienta" (justo lo que la tira vino a arreglar). F3 es la misma queja de #1095 en otro menú ("esto está cortado y no sé qué pone"). F4 es "hay dos números encima de mi pieza y no sé cuál es cuál". F7 es "le di a la E y no hace nada, qué ladilla", y ya lo dijo del piquete. Todas son de descubrimiento y de control, las dos palabras de su audio.

---

## 3. La piel: contenida, no corregida

### 3.1 El trinquete está plano

| Regla | 14-08 (nace) | 16-08 | hoy | Techo del plan del 14-08 |
|---|---|---|---|---|
| R1 `var()` con respaldo | 155 → 142 | 142 | **142** | 0 |
| R2 tokens fantasma | 63 → 50 | 50 | **50** | 0 |
| R3 color literal fuera de tokens | 998 → 966 | 966 | **941** | 0 |
| R4 archivos que definen tokens | 2 | 2 | **2** | 1 |
| R5 `:hover` sin `:focus-visible` | 65 | 65 | **64** | paridad |
| R6 `outline:none` | 9 | 9 | **9** | 0 |
| R7 diálogos nativos | 8 → 0 | 0 | **0** | 0 |
| R8 `z-index` literal | 41 → 28 | 26 | **26** | 0 |

Lectura honesta: el 14-08 se hizo la Fase 0 (guardián) y la Fase 1 (lo que María sufría: diálogos, español, atajos, el botón que mentía). Las fases 2 (materiales), 3 y 4 (emplazamiento y paneles, recortadas) y 5 (idioma) se cerraron a medias; **la limpieza mecánica de la piel no se hizo nunca**, y el ejemplo que la auditoría puso en su § 0 sigue tal cual en `AppShell.tsx:263-276`:

```js
background: 'rgba(99, 102, 241, 0.12)',      // --accent-subtle existe
border: '2px dashed var(--accent, #6366f1)',  // respaldo prohibido por R1
background: 'var(--bg-elevated, #1e1e1e)',    // el respaldo es otro color
color: 'var(--text-primary, #fff)',           // ídem
borderRadius: 8, fontSize: 15,                // fuera de la escala
boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',   // la sombra del dock, a mano
```

Solo `zIndex: 50` pasó a `var(--z-hint)`. Tres semanas con el ejemplo en la primera página del informe.

### 3.2 Dónde está concentrada

La deuda de R1 y R2 vive casi entera en cuatro archivos: `AvatarPanel.css` (41 + 10), `BOMTab.css` (29 + 20), `GradingTab.css` (21 + 13) y `LayerPanel.css` (19 + 3). Son **110 de los 142** respaldos (77 %) y **46 de los 50** fantasmas. Son los paneles de contenido, que se escribieron antes que los tokens. R3 está más repartida (941 sitios), pero **el 82 % del lado CSS cabe en 12 archivos** (Plumb), y los cinco primeros (`AvatarPanel.css` 62, `LayerPanel.css` 40, `FitMapToggle.tsx` 37, `BOMTab.css` 32, `NestingTab.tsx` 28) suman 199. Esto importa para el tamaño: limpiar trece archivos es un trabajo mecánico por archivo, delegable; no es "rehacer la interfaz".

### 3.3 El censo vivo, comparado con el mismo script

`scripts/ui-surface-audit.mjs`, 1600×1000, mismo DXF:

| | 14-08 | hoy |
|---|---|---|
| Estados alcanzados | 42/42 | **39/42** (los tres modos de la barra, tapados por F1) |
| Firmas de superficie flotante | 17 | 15 |
| Firmas de botón | 96 | **101** |
| Fallos de contraste (filas) | 138 | 109 |
| Botones sin foco visible (filas) | 162 | 135 |
| Solapamientos (filas) | 27 | **38** |
| Acentos observados | 11 | 11 |

Con tres estados menos, los solapamientos subieron un 41 % y las firmas de botón cinco. Contraste y foco bajaron, pero parte de esa bajada es que hoy se visitan menos estados; no hay que leerla como mejora.

El script no está podrido, está desatendido: el primer intento de hoy murió por timeout en el tercer estado con Vite en frío (los `page.goto` de las líneas 394 y 403 van con el tiempo por defecto mientras la espera hermana de la línea 367 admite 90 s "porque en un Vite realmente frío transformar el grafo completo puede superar 45 s"); el segundo intento pasó. Plumb verificó seis selectores contra el DOM actual: **cero muertos**. Lo que sí tiene es un problema de higiene: escribe en `ui-audit-2026-08-14/` con la fecha fija en la línea 31, así que correrlo hoy pisa la evidencia del 14-08 (se restauró de una copia). Es un guardián que solo vigila si alguien se acuerda de él, y nadie se acordó en tres semanas.

### 3.4 Los materiales, hoy

En 16 estados a 1366×768 hay **11 firmas distintas** de superficie flotante (contra 17 del 14-08 a 1600×1000; no es la misma medida, pero la dirección es buena). Se agrupan en cinco materiales declarados y uno de contrabando:

| Material | Firma | Quién | Declarado |
|---|---|---|---|
| chrome | `rgb(16,16,28)`, borde `#2a2a42`, radio 12, sombra 8/32 | docks 2D y 3D, barra superior del 3D | sí |
| overlay | `rgba(8,8,15,.92)`, blur 16, radio 12 | menú contextual, menú del logo, panel de la barra | sí |
| overlay flush | `rgba(8,8,15,.92)`, sin blur, borde transparente, sombra en capas | tira, fila de capas | sí (enmienda 30-08) |
| bar recessed | `rgba(8,8,15,.78)`, blur 16, píldora | barra de IA | sí |
| cota | blanco / `#2b97ee`, radio 6 | chips | sí (enmienda 30-08) |
| **3D propio** | `rgba(30,30,30,.8-.96)`, acento `#4a9eff`, radio 3-6 | mapas de ajuste, píldora de superficie, barra de capturas, panel de colisión | **no** |

El de contrabando es el que tiene el peor contraste (2,75:1) y el archivo con más literales del repo.

### 3.5 La tipografía

Doce tamaños distintos en pantalla a lo largo de los estados: 8, 8,5, 9, 10, 10,5, 11, 11,2, 12, 12,6, 13,4, 14 y 15 px. Los fraccionarios no son accidentes: son la escala fluida de `tokens.css:100-101` (`--text-sm: clamp(11px, 0.6vw + 3px, 14px)` da 11,196 a 1366 de ancho y 12,6 a 1600). El accidente son los enteros: 253 `font-size` literales en `src/` contra 69 usos de token. Sesenta textos a 9 px en el estado cargado: son las etiquetas de la regla (F6). El texto más pequeño con función es "auto" a 8,5 px en el dock. Iris Tane lo juzga en § 6.

---

## 4. La gramática: 24 islas

Esto es lo que ninguna captura enseña y lo que explica por qué las tandas 1 a 5 cerraron issues y siguen saliendo hermanos (#1115, #1117, #1122, #1132, #1136 nacieron de reviews de esas mismas tandas).

Trazado de los 24 hooks de herramienta 2D (`src/components/PatternEditor/use*.ts`), verificado a mano en 7 citas, más lo que Petra midió encima:

| Pregunta | Respuesta | Herramientas |
|---|---|---|
| ¿De dónde sale el **sujeto**? | 15 hit-test bajo el cursor · 3 de la selección Redux · 3 mixto · 3 crean de cero | selección: offset, slashAndSpread, transform; mixto: seamEdit, measure, extendTrim |
| ¿Qué pasa si **no hay sujeto**? | **19 `return` mudo** (Plumb cuenta 23 guardas en 15 archivos) · 2 toast (solo si la pieza está bloqueada) · 3 n/a | `useSeamAllowanceTool.ts:229`, `useSlashAndSpreadTool.ts:184`, `useSeamEditTool.ts:54` ("Borde libre: no pasa nada, a propósito"), `useScissorsTool.ts:137`, … |
| ¿Hay un **punto de paso** donde poder decirlo? | sí: `useEditorInteractions.ts:654-740`, una cadena plana de ~24 `if (activeTool === X) { tool.handleMouseDown(e); return; }`. Pero los manejadores devuelven `void` (solo 3 devuelven `boolean`): el despachador **no puede saber** si hubo sujeto | la bitácora ya registra `edge:miss` (`useEdgeGesture.ts:82-85`), pero solo 4 herramientas pasan por ahí |
| ¿Quién maneja **Supr**? | el global (`useKeyboardShortcuts.ts:85-95`) mira `selectedSeamId` si la herramienta es de coser, si no `selectedPieceIds`; **6 herramientas lo capturan por su cuenta**; `selectedPOMId` y `saSelection` no los mira nadie (`selectedElasticId` es estado muerto: nunca se escribe). **Tres fallos reproducidos en el navegador**, § 4.1 | pen, polyPen, measure, topstitch, editPattern, más la línea interna en `useEditorInteractions.ts:412-422` |
| ¿Cuántas **selecciones** hay? | **6 campos** en `editorSlice.ts:12-17`: `selectedPieceIds`, `selectedSeamId`, `selectedPOMId`, `selectedElasticId`, `selectedInternalLine`, `saSelection`; ~292 lecturas en 40 archivos (Plumb) | ningún selector compartido para cuatro de ellos: se leen en línea |
| ¿Cuántos **hit-tests**? | **11 funciones** (`snapToAnyEdge`, `snapToEdge`, `snapToOutline`, `findClosestEdgePoint`, `findClosestEdge`, `nearestSegment`, `hitTestNode`, más las de `utils/`), y **8 radios de enganche distintos en 20 sitios** para la misma intención: 5 px (`useEditorInteractions.ts:819`), 6 (`PatternEditor.tsx:540`), 8 (×10), 10 (×3), 12, 15 (×2), 20 (`useTrimTool.ts:15`). `gestureConstants.ts` existe, documentado y con tests; lo usan 5 archivos de 24 | la línea interna tiene 5 px por la izquierda y 6 por la derecha |
| ¿Dónde vive el **hover**? | en **10 `useState` locales**, uno por herramienta, cada uno con su propio hit-test | por eso #1132 (hover pegado) y #1102 (la pluma no engancha) son dos bugs y no uno |
| ¿Qué ve cada **botón**? | el derecho resuelve 5 clases de objeto en cualquier herramienta; el izquierdo, 2 en Seleccionar (Petra § B.2) | "estos puntos los puedo mover con seleccionar o con editar… cuál es la diferencia" (María, 12:48) |
| ¿Cómo se **vuelve a la flecha**? | **nunca**: ninguna herramienta devuelve a Seleccionar (0 resultados fuera de `EmptyState2D.tsx:13`); el Escape global corre en `document` antes que las 12 herramientas registradas en `window` (`ShortcutProvider.tsx:84` vs `useEditorInteractions.ts:443`), así que un Escape hace dos cosas | y el de Slash & Spread no hace ninguna (F8) |
| ¿Dónde se **escribe un número**? | **4 superficies**: chip de cota (rectángulo, margen) · tira de opciones (offset, extendTrim, trim, pespunte, walkSeam) · modal (piquete) · panel "Siguiente punto" (pluma, polipluma) · y 13 herramientas sin ninguna. 564 líneas en 4 componentes más 18 archivos que escriben `toolOptions` (Plumb) | María pide "cuánto" en siete herramientas y hoy se lo contestan de cuatro formas o de ninguna |
| ¿El hit-test ve lo que se **dibuja**? | solo 2 de 24 hooks reciben `drawablePieces` (`PatternEditor.tsx:282`, `:377`). **Pero el efecto que Petra temía NO ocurre:** con la capa 2 oculta, la pieza no se pinta (4 paths en vez de 6) y un clic sobre su sitio con Seleccionar, Coser y Piquete no engancha nada. Refutado en el navegador | la duplicación de listas sigue siendo real; su consecuencia visible, no |
| ¿Errores que **nadie pinta**? | `useOffsetTool.ts:57` guarda `'Select a single piece to offset'` (en inglés) y `PatternEditor.tsx` solo consume `previewOutline`; `useExtendTrimTool.ts:216` `'Failed to extend edge'`, igual; `useSlashAndSpreadTool` acumula `state.error` que ningún overlay lee | tres cadenas muertas que además rompen la ley de idioma si algún día se pintan |

### 4.1 Tres fallos de borrado, reproducidos en el navegador

No estaban en el informe de la mañana: salieron de trazar el mecanismo y luego reproducirlos. Los tres son el mismo defecto — **seis campos de selección y un borrado que mira dos** — y dos son pérdida de datos.

| | Qué pasa | Medido | Causa |
|---|---|---|---|
| **A** | Con Seleccionar y una **línea interna** elegida, Supr borra **la pieza entera** | piezas 2 → 1; la línea se va con ella | `selectInternalLine` deja además `selectedPieceIds = [pieceId]` (`editorSlice.ts:121`), y el atajo global escucha en `document` en burbuja (`ShortcutProvider.tsx:84`) mientras el manejador local de la línea escucha en `window` en burbuja (`useEditorInteractions.ts:443`), o sea después. Gana el global |
| **B** | Una pieza **bloqueada** se selecciona con un clic y Supr la borra | piezas 1 → 0 | `removePieces` no mira `locked` (`projectSlice.ts:462-491`), aunque el menú contextual sí (`gate: notLocked`) y `selectAllVisiblePieces` filtra bloqueadas. El candado protege de mover y de editar, no de borrar |
| **C** | El menú **Edición ▸ Eliminar** ignora la regla de costuras y el candado | leído en el código, y el e2e lo confirma | `LogoMenu.tsx:89-93` reimplementa el borrado a mano. O sea: el arreglo de #1094 vive en el atajo y no en el menú. Dos implementaciones de la misma decisión, una tres semanas atrasada |

El caso A es exactamente el susto de #1094 por otra puerta, y llegó por donde el propio código avisaba: el comentario de `toolActivation.ts:10-12` dice que "dos listas se desincronizan, como pasó con walkSeam". Aquí no eran dos listas: eran seis campos y una regla escrita dos veces.

Lo que esto dice, sin adornos:

- **#1117** ("Slash & Spread y Extender/Recortar mueren en silencio") no es un issue de dos herramientas: es el comportamiento por defecto de 19. Arreglarlo herramienta por herramienta es abrir 17 issues más. El arreglo de verdad cabe en un sitio (el despachador) si los manejadores le devuelven "hubo sujeto o no".
- **#1115** ("Supr global gana a los sujetos locales") y **#1094** (Supr con costura borró una pieza) son la consecuencia de tener seis selecciones y un Supr que mira dos. La tanda 1 tapó el caso de coser con `SEWING_TOOL_IDS`, y el comentario del propio archivo (`toolActivation.ts:10-12`) ya avisa que "dos listas se desincronizan, como pasó con walkSeam". Petra lo reduce a una frase: **lo que se ve es lo que se borra**. La tira ya imprime el sujeto (`sujeto.ts`, que sirve a 5 caminos de 27); si Supr borrara eso mismo, #1115 desaparece.
- **#1102** y **#1132** son el precio de once hit-tests y ocho radios: la pluma no engancha al punto que Medir sí engancha porque no comparten motor. Petra lo cierra sin diseñar nada: `resolveSnap` (`usePolyPenTool.ts:143-179`) es "el mejor resolutor del repo"; hay que copiarlo, no inventar otro.
- **#1111** es una trampa antes que una feature: la tecla ya existe, la cabina ya se dibuja, y no hay herramienta detrás (F7).
- **La metadata que parecía la puerta no lo es.** Las definiciones de herramienta declaran `requiresSelection` ('piece' en 20, 'edge' en 4, 'internalLine' en 1, 'none' en 32), y la tentación es usarla como gate del "no pasó nada". No sirve: describe lo que necesita el **copiloto**, no el gesto del ratón. `seamAllowance` declara `requiresSelection: 'piece'` y funciona perfectamente sin ninguna selección, por hit-test; lo mismo `grainline`, `internalShape` y `point`. Usarla pondría un cartel de "selecciona una pieza" sobre cuatro herramientas que no lo necesitan. Las que de verdad piden selección son **cuatro**, medidas una a una: `offsetOutline`, `slashAndSpread`, `extendTrim` y `transform`.
- Y la premisa de Samuel toca justo aquí: cada elemento dinámico nuevo (un chip, una asa, un menú junto a la selección) necesita saber **cuál es el sujeto** y **qué hacer cuando no lo hay**. Hoy eso lo decide cada hook.

---

## 5. La premisa, estresada (Petra Haft)

Informe íntegro: `docs/reports/ui-audit-2026-09-04/revisores/petra-gramatica-2d.md` (836 líneas: inventario de objetos, matriz de gramática actual y propuesta, máquina de estados, conflictos de atajos, convenciones de Illustrator/Figma/CLO3D/Rhino/Fusion 360/Onshape, la premisa, la divulgación progresiva y el corte). Aquí lo que decide.

**La regla de reparto, una sola:**

> **SOBRE** el objeto va lo que es una propiedad del objeto y se puede escribir. **ALREDEDOR** va lo que es un verbo sobre el objeto seleccionado. En un **PANEL** va lo que es una lista, un catálogo o una configuración. En **NINGÚN SITIO** va lo que solo informa sin que nadie pueda hacer nada.
>
> La prueba de descarte: *si al ver ese elemento María no puede hacer nada distinto de lo que haría sin él, el elemento no va sobre el lienzo.*

| Cosa | Dónde | Estado |
|---|---|---|
| Ancho y alto de la pieza; margen del borde bajo el cursor; largo y ángulo del tramo de una interna | SOBRE | ya está (cotas vivas, 5b-3) |
| Largo del borde con Medir, distancia al punto más cercano (#1104); profundidad y cantidad del piquete (mata `NotchPrecisionModal`, que hoy tapa el objeto que edita, #1125); intake de la pinza (`cotas.ts:230` devuelve `[]` para `dart`) | SOBRE | nuevo: son la misma cota |
| Mover, escalar, girar (9 tiradores); duplicar, espejar, bloquear, borrar (`FloatingActionBar`, tope 5); qué se está editando (la tira) y cómo se usa la herramienta (la pista) | ALREDEDOR | ya está; **encender la línea de sujeto y la pista para las 27 herramientas** (faltan 22 y 13) |
| Capas, colorways, telas, catálogo; ajustes del solver, presupuesto, conexiones | PANEL | ya está |
| Etiquetas de medidas del avatar que se cruzan (#1108); todos los márgenes a la vez (#1135); membresía de capa en el lienzo | NINGÚN SITIO tal como están | #1108: se muestra la que se apunta, no las nueve. #1135: no cabe (abajo) |

**El techo de densidad, con número:** 12 elementos de overlay clicables simultáneos por pantalla; 3 por objeto no seleccionado; separación mínima de 24 px entre centros (dos veces `EDGE_HIT_PX`); el overlay no pasa del 15 % del lienzo ni tapa más del 20 % de la caja de la pieza seleccionada. Los tres criterios se miden con un e2e. Contra lo que hay hoy: **una pieza seleccionada ya carga 16** (9 tiradores `transform.ts:4` + 2 cotas `cotas.ts:92-111` + 5 botones `actionCuration.ts:414`); el DXF real de María con #1135 ("ver todos los márgenes") daría 48 a 240 chips, entre el 10 % y el 50 % del lienzo: **no cabe**, y hay que decírselo con esa palabra. Lo que sí cabe es que solo la pieza seleccionada enseñe todos sus bordes. La única regla de densidad escrita en el repo es el tope de 5 de `FloatingActionBar` y el `selectedPieceIds.length !== 1 → nada` de `sujeto.ts:143`; hay que copiarlas, no diluirlas.

**Dónde empujar la premisa:** leer un número sin abrir nada (extender el chip de margen a Medir: largo del borde, distancia al vecino, ángulo, las cuatro peticiones de #1104 son la misma cosa); escribir el número donde se lee (ratificado, no se reabre); el tirador en vez del campo (la caja de transformación es el argumento entero a favor); matar los modales que tapan lo que editan.

**Dónde frenarla:** "un elemento por función" (58 definiciones por un elemento cada una es una cabina de avión); elementos que solo informan (un número que no se puede editar es una etiqueta, y las etiquetas se apilan: #1108 es María refutándolo); elementos sobre objetos no seleccionados (la densidad explota); y **un elemento dinámico que tapa un problema de gramática** (#1117: la respuesta on-object sería un halo sobre la pieza seleccionada; la respuesta de gramática es *el press manda el objeto*: cero elementos nuevos, un bug menos, y la herramienta funciona sin haber seleccionado nada).

**Lo que propone en vez de más elementos** (matriz y máquina de estados completas en su § B.4 y § C.3):

1. **Un sujeto activo**, derivado, con tres consumidores: la tira lo imprime, Supr lo borra, el press lo apunta. `sujeto.ts` ya es el 20 % de eso.
2. **El objeto bajo el cursor se ilumina antes del clic**, en las 27 herramientas, con un solo resolutor y los radios de `gestureConstants.ts` (usarlos, no cambiarlos).
3. **Escape siempre vuelve a la flecha**; dos Escapes salen de cualquier sitio; las herramientas de un solo acto son de resorte (colocan y vuelven), y el doble clic en el dock las deja pegadas.
4. **La pista y la línea de sujeto, siempre**: 13 pistas y 22 líneas de sujeto que faltan hoy.
5. Modificadores prestados, no inventados: Shift acumula en todas partes (hoy acumula en 4 sitios y ajusta ángulos en 1), Alt atraviesa/duplica/mide, Espacio sostenido es pan, doble clic baja de nivel.

**La divulgación progresiva** no tiene "modo experto": la novata y la experta usan el mismo gesto; la experta llega a más sitios con él. Día 1: la flecha, Escape, la pista, la tira, las cotas. Semana 1: doble clic entra, Shift acumula, el resorte. Mes 1: Espacio, Alt, flechas con Shift/Alt.

**El corte de Petra:** no rediseñar el dock ni la paleta de 58; no borrar las 16 herramientas sin gesto (es decisión de producto cuáles nacen y cuáles mueren, pero el precio del silencio es F7); no diseñar el círculo (dice dónde entra en la gramática: arrastre desde el centro, Shift uniforme, `E` liberada); no tocar `DRAG_THRESHOLD_PX` / `EDGE_HIT_PX` / `VERTEX_HIT_PX` (están bien; hay que usarlos); no inventar un gesto donde hay convención.

**El veredicto, textual:** *"La premisa acierta el SITIO y falla la CANTIDAD. La simplicidad no viene de más elementos; viene de que el mismo gesto signifique lo mismo en todas partes. Primero la gramática, después los elementos; y con la gramática puesta, harán falta menos."*

Lo que verifiqué de su informe antes de dejarlo entrar: los modos sin gesto (barrido de teclas en el navegador — ella contaba siete y **tenía razón**: yo descarté `T` por un `grep` que cayó en el `switch` del cursor, F7), el Escape de Slash & Spread sin registrar (F8), los 2 de 24 con `drawablePieces`, el `resolveSnap`. Lo que le refuté: el modo alambre sí deja clicar la pieza, y una pieza en capa oculta **no** es blanco de Seleccionar, Coser ni Piquete — no se pinta y no engancha (§ 2 y § 4).

---

## 6. Lo visual (Iris Tane)

Informe íntegro: `docs/reports/ui-audit-2026-09-04/revisores/iris-critica-visual.md` (490 líneas: jerarquía, densidad, tipografía, color, alineación, tres cortes, veredicto). Aquí lo que confirma, lo que corrige y lo que corta.

**Mis seis puntos, con su ojo:** cinco confirmados y peores. La fila de capas a 1280 cae entera dentro de la barra de IA (266×28 px). La pista al pie tiene su línea de base a 4 px del borde de la fila, y la auditoría del 14-08 § 2.1 ya la había marcado "medio tapada": se le arregló la tinta y se le duplicó el tapón. A 1600 hay dos chips "20,4 mm" idénticos superpuestos con 12 px de desfase. La regla pone un rótulo de 27 px en un paso de 24 px, ilegible al zoom con que la app abre, y son 60 de unos 80 nodos de texto de la pantalla. El sexto, matizado: la tira mide 300×52, no 300×60, y sí hospeda parámetros (Medir, Margen, capturas 07 y 08); lo que sobra es su **caso vacío** ("Seleccionar · Z" a 300 px para trece caracteres), no la tira.

**Color:** los azules son cuatro verificados (Iris cuenta cinco): `--accent` `#6366f1` en el cromo, `--accent-2d` `#2b97ee` en las cotas, `#4a9eff` en el cromo 3D y `#4a90d9` en `FitMapToggle.tsx:120`, el fondo del botón activo, a 40 px de un botón que sí usa `--accent` (captura 14). Los grises intrusos que midió (`rgb(30,30,30)`, `rgb(36,36,36)`) son la paleta fantasma de `AvatarPanel.css` transparentándose por los respaldos del `var()`: nombres de token que no existen, con respaldos de familia VS Code. Y lo que hay que decir a favor, textual: *"de siete materiales a dos con variantes declaradas. Es el logro real del contrato y hay que decirlo."*

**Tipografía:** la escala declarada es fluida y no es el problema (`--text-xs: clamp(10px, 0.55vw + 3px, 13px)`, `--text-sm: clamp(11px, 0.6vw + 3px, 14px)`: de ahí salen los 11,196 px a 1366 y los 12,6 a 1600 de § 3.5; no son accidentes, son el token). El accidente es que hay **253 `font-size` literales contra 69 usos de token**, la escala efectiva de seis pasos es aritmética de +1 px (razones de 1,06 a 1,08) y entrega tres tamaños distinguibles, y los 10 y 11 px literales subieron desde agosto.

**Alineación:** seis orígenes de coordenadas y cuatro `z-index` literales entre las superficies del lienzo; ninguna comparte retícula. La flecha del estado vacío ("o descríbelo a la IA ↓", captura 01) apunta a lienzo vacío porque el bloque se centra en el panel y la barra en la ventana: el mismo defecto de marcos de § 2.1, en la primera pantalla que María ve.

**Sus tres cortes** (mayor rendimiento visual por menor riesgo, sin espacio en blanco ni tipografía nueva): (1) una guarda de rótulo en `rulerTicks.ts` como la que ya protege las marcas menores en la línea 67; (2) `bottom: 12px` → el valor que `floating.css:10` ya calculó, en `FilaDeCapas.css`; (3) `#4a90d9` y `#4a9eff` → `var(--accent)`. Los tres coinciden con Plumb y entran en § 7.1.

**Su veredicto:** la fortaleza de Vina es que las decisiones quedan escritas (tokens, contrato, enmiendas con fecha); la debilidad es que **el trinquete congeló el daño en vez de bajarlo**: ninguno de los ocho contadores cedió, y un defecto ya nombrado en agosto empeoró en tres semanas.

---

## 7. Tamaño y orden (Plumb Lindgren, y el juicio)

Plumb midió cada hallazgo (callsites por grep, líneas mínimas, decisiones de diseño necesarias). Informe íntegro: `docs/reports/ui-audit-2026-09-04/revisores/plumb-tamanos.md`. Su tabla, con mis ítems renombrados a los F de este documento:

| Hallazgo | Tamaño | Modo | Líneas | Decisiones |
|---|---|---|---|---|
| F1 + F2 fila ↔ barra ↔ pista | **XS** | edit | 1 declaración | 0 |
| F3 submenú Vista | **S** | edit | 2 (CSS) / ~35 con señal de "hay más" | 1 |
| F4 chips que se pisan | **M** | brainstorming → edit | ~40-70 | 2 (dónde vive la pasada; qué hace el chip perdedor) |
| F5 acentos (contraste + literales) | **S** | edit + 1 decisión | ~34 (+38 `FitMapToggle`) | 1 (¿`#4a9eff` y el oklch son un rol propio o `--accent`?) |
| F6 etiquetas de regla | **S** | edit | ~10 | 1 (escalar por décadas o ralear) |
| F7 modos sin gesto | **XS** para la trampa | edit | 1 guarda en `registry.ts` | 0 para quitar la trampa; 1 de producto para cada herramienta que quiera nacer |
| F8 Escape de Slash & Spread | **XS** | edit | 1 | 0 |
| F9 + F10 roles de z | **S** | edit | 3 | 1 |
| F11 material del 3D | **S** ×5 archivos | edit | ~20-60 c/u | 0 (1 si falta token) |
| Supr no borra 4 de 6 sujetos (#1115, síntoma) | **S** | edit | ~15 | 1 |
| "No pasó nada" (23 guardas, 15 archivos; #1117) | **M** | brainstorming | ~100-160 | 2 (por qué canal habla, quién lo dice) |
| Piel R1/R3 (13 archivos = 80 %) | **S** ×13 | edit por archivo | ~20-60 c/u | 0 |
| Censo vivo (timeout + fecha) | **XS** | edit | 2 | 0 |
| Unificar las 6 selecciones | **L** | spec | ~292 ocurrencias / 40 archivos | 3+ |
| Unificar 11 hit-tests / 10 hovers | **L** | spec, o no hacer | > 500 | 3+ |
| Unificar las 4 superficies de número | **L** | brainstorming + spec | 564 + 18 archivos | 1 (grande) |

**Su veredicto global:** no es un rediseño; son 8 ediciones XS/S independientes (unas 35 líneas sumadas) más una campaña mecánica por archivo; solo F4, el "no pasó nada" y las superficies de número requieren decisión de diseño; las dos unificaciones grandes no tienen síntoma reportado por María y entran en spec o no entran, pero no esta semana. "Un `brainstorming` global o un spec de 'rediseño de la interfaz' excede el tamaño medido en 11 de 14 ítems."

### 7.1 Mi orden

Coincido con Plumb en el tamaño y con Petra en la dirección, y los junto así:

**Tanda 8, esta semana, ediciones sin decisión pendiente** (un PR, un e2e por colisión que mida con `elementFromPoint` a 1366×643):

1. F1 + F2: `FilaDeCapas.css:10` reserva la franja de la barra como ya lo hacen `floating.css:6-10` y `SnapshotBar.css:1-5`. Lo correcto es que los tres sitios compartan un token (`--bar-band`, 58 + 24 + 12), no un cuarto `94px` a mano.
2. F3: el submenú del logo pasa por `menuOverflow.ts` como el contextual (o, mínimo, `max-height` + scroll + la señal de "hay más" que #1095 ya diseñó).
3. F7: `registry.ts:41-42` no registra atajo sin manejador. Las seis teclas quedan libres hasta que la herramienta exista; `E` la reclama el círculo cuando nazca (#1111).
4. F8: una línea, `handlers.push(slashAndSpreadTool.handleKeyDown)`.
5. F9 + F10: `NotchPrecisionModal` a `--z-modal`; la tira y la fila a un rol de superficie acoplada (`--z-panel` o uno nuevo declarado en `tokens.css`), no a `--z-menu`.
6. Supr: `deleteSelection` mira los seis campos, en el orden de la tira. Es el parche de #1115 hasta que exista el sujeto activo.
7. Censo: timeout de 90 s en los dos `goto`; la fecha de salida sale de un argumento; y **se corre antes de cada deploy** en el gate local. Sin eso F1 vuelve con la próxima superficie.

**Tanda 9, con una decisión cada una:** F6 (la regla: escalar el paso mayor por décadas, mi recomendación, porque ralear etiquetas cambia lo que María lee); F5 (el acento 2D sube de luminosidad hasta 4,5:1 con texto blanco, o los chips usan tinta oscura sobre chip claro; y `#4a9eff` se declara como `--accent-3d` o muere en `--accent`); F4 (dos decisiones: la pasada de colisión vive en `CotasLayer` con todas las cotas a la vista, y el chip perdedor se desplaza a lo largo de su línea de cota, nunca desaparece).

**Dos specs cortos, en paralelo, antes de la tanda 6:**

- **El dueño del emplazamiento.** Un componente que reparte el borde del lienzo 2D entre tira, fila, pista y barra de acciones, con el techo de Petra como regla (12 elementos, 24 px, 15 %, 20 %) y un e2e que lo mida. Sin esto, cada superficie nueva repite F1.
- **El "no pasó nada" compartido.** Los manejadores devuelven `boolean`; el despachador (`useEditorInteractions.ts:654-740`) habla por los 19 que callan (pista, bitácora, y un toast solo cuando el gesto tenía intención clara). Cierra #1117 y sus 17 hermanos que no se han abierto.

**La gramática, como spec de la tanda 6** (ya estaba esperando a Petra): el sujeto activo con sus tres consumidores; el resalte universal con un resolutor y los radios de `gestureConstants.ts`; Escape a la flecha y el resorte; pista y línea de sujeto para las 27. Cierra #1115, #1102, #1132 y parte de #1104 y #1112. Las unificaciones grandes (seis selecciones, once hit-tests, cuatro superficies de número) **no se hacen como proyecto**: se disuelven a medida que el sujeto activo, el resolutor único y las cotas vivas C les quitan lectores.

**La piel, de última y delegada:** trece archivos, uno por commit, R1 y R3 bajando en cada uno, `--update` del baseline. `FitMapToggle.tsx` primero, porque además carga F5 y F11.

---

## 8. Lo que deliberadamente NO se propone

- **Rediseñar la piel.** Los tokens, las dos fuentes (Schibsted Grotesk + monoespaciada), los iconos de Lucide y los cinco materiales declarados están bien. La deuda de piel es mecánica y está localizada (§ 3.2); se limpia, no se rediseña.
- **Acoplar los docks y la barra a canaletas.** Samuel lo decidió el 14-08 (spec Fase 3+4 § 2.1): flotan a propósito. Esta revisión no lo re-litiga; lo que pide es que lo que flota tenga un dueño que reparta el borde, no que deje de flotar.
- **Más espacio en blanco, otra tipografía, otro set de iconos.** El contrato lo prohíbe con razón: María trabaja horas viendo el patrón.
- **Un "modo simple" y un "modo experto".** Dos gramáticas son peor que una mala. La divulgación progresiva de Petra va por defaults y por lo que se enseña al pasar, no por modos.
- **Arreglar F1 moviendo la barra de IA, o con un tercer número a ojo.** El precedente ya está escrito dos veces en el 3D; se reutiliza como token compartido. Mover la barra sería mover el síntoma: la próxima superficie flotante volvería a chocar.
- **Un brainstorming de "rediseño de la interfaz".** Excede el tamaño medido en 11 de 14 ítems (Plumb). Los dos specs cortos de § 7.1 son el tamaño correcto de la conversación de diseño.
- **Construir las seis herramientas muertas para cerrar F7.** F7 se cierra quitando la trampa. Cuáles herramientas nacen es una decisión de producto aparte, y la primera es el círculo.

---

## 9. Lo bueno, que no hay que romper

- **Cero botones sin nombre accesible** en 16 estados (43 a 65 visibles por estado). Lo mismo que el 14-08. Cuidarlo al tocar la fila y la tira.
- **La pista de la herramienta pasa AA** (5,28:1 a 11 px, `rgb(107,100,89)` sobre el papel). La de 1,11:1 del 14-08 quedó arreglada de verdad; lo que le falta hoy es que la fila no la tape.
- **La tira de herramienta hace lo que prometió**: nombre, atajo efectivo, sujeto ("Editando: la línea seleccionada · 4 cotas") y las opciones de la herramienta (Medir: "Mostrar el ángulo", "Distancia acumulada"). Es la primera superficie que le enseña a María el atajo que pidió aprender. Petra quiere lo mismo para las 27.
- **Los chips de cota funcionan**: clic escribe, arrastre ajusta, Tab pasa, Esc suelta, y dicen "mm". El problema es de colisión y contraste, no de gramática.
- **La caja de transformación y el tope de 5 de `FloatingActionBar`**: el argumento entero a favor de la premisa, y la única regla de densidad escrita.
- **`sujeto.ts` y `resolveSnap` (`usePolyPenTool.ts:143-179`)**: el 20 % del sujeto activo y "el mejor resolutor del repo" ya existen. La gramática se construye copiándolos, no desde cero.
- **El menú contextual ya avisa que hay más** (#1095, `menuOverflow.ts`). Hay que llevárselo al submenú del logo (F3), no reinventarlo.
- **El estado vacío, la paleta de comandos y el menú de aplicación** siguen siendo el modelo a seguir, como dijo la auditoría del 14-08.
- **El español**: en 16 estados no apareció ni una cadena visible en inglés. Las tres que quedan están en errores que nadie pinta (§ 4).
- **La bitácora de la caja negra** ya registra `edge:miss` (`useEdgeGesture.ts:82-85`): el "no pasó nada" compartido tiene por dónde nacer.
- **El precedente de `floating.css:6-10`**: alguien ya escribió, con comentario, cómo convivir con la barra. Lo que faltó fue mirarlo.

---

## 10. Registro de verificación

| Cifra | Cómo se obtuvo | Dónde está |
|---|---|---|
| Contadores R1-R8 y su historia | `node scripts/ui-contract-lint.mjs`; `git log -- scripts/ui-contract-baseline.json` y `git show <sha>:scripts/ui-contract-baseline.json` por commit | § 3.1 |
| Concentración de R1/R2/R3 por archivo | `node scripts/ui-contract-lint.mjs --list R1` (y R2, R3), agrupado por archivo; el 82 % de R3-CSS en 12 archivos es de Plumb | § 3.2 |
| Capturas y firmas por estado, % tapado, fuentes, botones | capturador propio (`ui-audit-2026-09-04/medidas.json`, 14 PNG) | § 2, § 3.4, § 3.5 |
| Solapes en px², alcanzabilidad de los modos, pares de cotas y de regla, desborde del submenú | medidor de colisiones (`ui-audit-2026-09-04/medidas2.json`, 5 viewports) | § 2 |
| Contrastes | medidor de contraste (`ui-audit-2026-09-04/medidas3.json`); `oklch(0.66 0.16 248)` → `rgb(43,151,238)` por la conversión OKLab → sRGB lineal → gamma; blanco sobre él 3,10:1; blanco sobre `#6366f1` 4,47:1 (la fila usa `rgb(226,232,240)`, 3,62:1); blanco sobre `#4a9eff` 2,75:1 | § 2 F5 |
| Teclas → modo sin manejador | barrido a-z con y sin Shift leyendo `editor.activeTool`, tira y cursor; cruce con `grep -oE "activeTool === '…'"` en `useEditorInteractions.ts` (26 ids) y `grep -c "'<id>'"` en despachador, `PatternEditor.tsx`, hooks y `types.ts`; en `circle`: clic + arrastre, `pieces` 5→5, selección `[]` | § 2 F7 |
| Escape de Slash & Spread | `grep -n "slashAndSpreadTool.handleKeyDown" useEditorInteractions.ts` → solo la línea 445 (dependencias) | § 2 F8 |
| Modo alambre conserva el blanco | `editor/setRenderMode2D 'wireframe'` + clic en el centro de la pieza → `selectedPieceIds` con la pieza, `elementFromPoint` = `path` | § 2 |
| Censo 14-08 vs hoy | `scripts/ui-surface-audit.mjs` corrido dos veces hoy (`ui-audit-2026-09-04/censo/RESUMEN.md`) contra la copia del 14-08 (`ui-audit-2026-08-14/RESUMEN.md`, restaurada); los timeouts en `:394`/`:403` vs `:367` y los 6 selectores vivos son de Plumb | § 3.3 |
| Tabla de las 24 herramientas | trazado delegado a reasonix (JSON de 35 k caracteres) con 7 citas verificadas a mano: `useKeyboardShortcuts.ts:85-95`, `editorSlice.ts:12-17`, `useOffsetTool.ts:57`, `useSlashAndSpreadTool.ts:184`, `useSeamAllowanceTool.ts:229`, `useSeamEditTool.ts:53-54`, `toolActivation.ts:12` (7/7 exactas) | § 4 |
| Ocho radios, 20 sitios; 16 elementos por pieza seleccionada; 2 de 24 con `drawablePieces`; `resolveSnap` | Petra Haft, con file:line; `drawablePieces` re-verificado (`grep -c` en `PatternEditor.tsx` = 3: definición + 2 consumidores) | § 4, § 5 |
| Precedente de la franja de la barra | `floating.css:1-12`, `SnapshotBar.css:1-6` leídos; `NotchPrecisionModal.css:9-12` leído | § 2 F1, F9 |
| Once hit-tests, diez hovers | `grep -E "^export (function|const) (snapTo|hitTest|nearest|findNearest|findClosest|resolve…)"` en `PatternEditor/` y `utils/`; `grep -l "useState<.*hover"` en los hooks | § 4 |
| Material y acento del 3D | `grep -rnoE "rgba\(30, ?30, ?30"` y `grep -rnoE "#4a9eff\|74, ?158, ?255"` en `Viewport3D/` | § 3.4 |
| Ningún test mide la fila | `grep -rln fila-de-capas tests/e2e` (vacío); `grep -c "getBoundingClientRect\|elementFromPoint" FilaDeCapas.test.tsx` (0) | § 2 F12 |
| Issues abiertos sin commit que los toque | `gh issue list` cruzado con `git log --grep="#N"` para #1092-#1136: sin commit #1102, #1103, #1104, #1108, #1111, #1115, #1117, #1122, #1124, #1125, #1126, #1135, #1136; con commit pero abiertos (verificar antes de tocar): #1092-#1099, #1105, #1106, #1110, #1132 | § 4, § 7 |
| El badge Solver solo en dev | `SolverMetrics.tsx:36` | § 2 |

---

## 11. Qué se arregló, el mismo día

Commit `28455c04` en `fix/revision-ui-2026-09-04`. 47 archivos, +3137 −373. Los tests se escribieron **primero y en rojo**, con sus hashes congelados antes de implementar; la implementación fue de nueve lotes en paralelo con archivos disjuntos, cada uno con una revisión adversarial encima.

| Hallazgo | Estado | Cómo se cerró |
|---|---|---|
| **F1 · F2** fila de capas ↔ barra ↔ pista | **arreglado** | La fila reserva la franja de la barra con `--band-bar`, el token que ahora comparten los tres sitios que ya calculaban ese 94 a mano (`floating.css`, `SnapshotBar.css`, `FilaDeCapas.css`). e2e a 1366×643, 1280×720 y 1366×768 |
| **F3** submenú Vista fuera de pantalla | **arreglado** | Pasa por el patrón de desborde de #1095: `computeScrollFade`, contenedor con scroll y la señal de "hay más". El e2e exige además que la página no desborde |
| **F4** chips de cota que se pisan | **arreglado** | Pasada de colisión en `separarChips`, generalizando el `pairOffset` que ya existía. Cada chip se desliza por su línea; el de margen, que no tiene línea, por la perpendicular de su normal — o sea a lo largo del borde que mide |
| **F5** contraste de las cotas | **arreglado** | Nace `--accent-2d-fuerte` (mismo tono, 5,04:1 con blanco). `--accent-2d` no se toca: es el azul aprobado con mockups |
| **F6** rótulos de la regla | **arreglado** | El paso del rótulo escala por la escalera 1-2-5. La marca larga se queda donde estaba; solo se ralea el número. Barrido de 30 780 combinaciones: hueco mínimo 2,00 px → 44,30 px |
| **F7** siete teclas muertas | **arreglado** | Salen de `DEFAULT_SHORTCUTS` a `ATAJOS_2D_SIN_GESTO` con su tecla reservada. El e2e que certificaba la activación del modo inerte ahora afirma lo contrario |
| **F8** Escape de Slash & Spread | **arreglado** | Su `handlers.push`, más un test que exige que dependencias y registros cuadren en los dos sentidos |
| **F9** tira alcanzable bajo el modal (#1125) | **arreglado** | `inert` en la tira mientras el modal está abierto. El z-index NO se tocó |
| **F10** roles de capa de tira y fila | **declarado, no arreglado** | Sin colisión ya no hay síntoma, y mover un rol de la escala sin decisión escrita es la premisa falsa del 15-08 otra vez. Sí se cerró el `25` literal de `SurfaceModePill.css` |
| **F11** cuatro azules y el material 3D | **arreglado** | Un solo azul de estado; lo que codifica dato (escala del mapa de tensión, leyenda de ajuste, familia de los anclajes 3D) queda intacto y con test que lo protege |
| **F12** ninguna prueba medía la posición | **arreglado** | Dos suites e2e nuevas (13 casos) que miden con `elementFromPoint` en el viewport de María |
| **Supr A · B · C** (#1115) | **arreglado** | `resolverBorrado` decide una vez y la usan las dos puertas. La línea interna se borra a sí misma, el candado protege, y el menú obedece la regla de #1094 |
| **G** silencio sin sujeto (#1117) | **arreglado** | Las cuatro herramientas que toman el sujeto de la selección lo dicen en la tira antes del clic. Mueren tres cadenas de error en inglés que nadie pintaba |
| **K** deuda de tokens | **arreglado en su 80 %** | R1 142→25, R2 50→**0**, R3 941→711, R5 64→39, R8 26→24. Techo nuevo fijado |
| **N** censo vivo | **arreglado** | 90 s de espera en los dos `goto` y la fecha de salida por argumento, para que no vuelva a pisar la evidencia del 14-08 |

### 11.1 Lo que la revisión adversarial encontró encima

Los nueve revisores no fueron decorativos. Lo que cazaron y se arregló después:

- **Una regresión de contraste que el arreglo mismo introdujo.** Al pasar literales a tokens, seis sitios que pintaban texto con un azul claro quedaron en `var(--accent)`: de ~5,0:1 a ~4,1:1 sobre el cromo, **cruzando AA de cumplir a no cumplir**. El trinquete no lo ve porque cuenta literales, no mide contraste. De ahí sale `--accent-ink` y un test que fija el contraste de los tres roles del acento.
- **Dos realces invisibles**: el `:hover` de la equis de una captura y el del botón de un cuerpo de colisión se pintaban con el mismo token que el fondo sobre el que caen.
- **Un escape más ancho que la tecla.** El oyente crudo de teclado del visor 3D se salta el registro de atajos y su filtro de contexto: en modo 2D, `W` cambiaba la herramienta 3D en silencio, y `Shift+A`, `Shift+F` y `F10` hacían lo suyo. Quitar la mitad 2D de `w` habría dejado la causa. Ahora el oyente comprueba el modo.
- **Que "deslizar por la tangente" no aplicaba al único par que de verdad convive**, el del margen, porque su cota tiene `a === b` y no dibuja hilo.

### 11.2 Qué NO se hizo, y por qué

- **Las tres unificaciones grandes** (seis campos de selección, once hit-tests, cuatro superficies para escribir un número). Plumb las midió en L y con 3+ decisiones de diseño cada una; el informe de la mañana ya decía que se disuelven a medida que el sujeto activo y el resolutor único les quitan lectores, no como proyecto. Siguen siendo el spec de la tanda 6.
- **Los dos specs cortos** (el dueño del emplazamiento; el "no pasó nada" para las 19 herramientas). Lo que entró es la mitad acotada de cada uno: el token compartido de la franja, y las cuatro herramientas que de verdad piden selección.
- **Renombrar "Slash & Spread"**. Es el nombre con el que la herramienta está rotulada en el dock, la tira y la paleta. Escribir otro en la pista rompería la ley de un-término-por-concepto, que es peor. El nombre en inglés es deuda real y anterior, de toda la herramienta, y se arregla en su registro.
- **Las siete herramientas sin gesto.** Cuáles nacen y cuáles mueren es decisión de producto. Lo que se quitó es la trampa; el círculo (#1111) es el primero de la cola y su tecla lo espera.

### 11.3 Gates

`npx tsc -b --noEmit` limpio · **7742 unitarios en verde** · **65 e2e en Chromium** sobre las once suites afectadas · `eslint --max-warnings=0` sin nada en lo tocado · trinquete sin subidas, con el techo nuevo fijado.

Un rojo preexistente, verificado contra `main` sin tocar y por tanto ajeno a este cambio: `maria-198-resize-con-ancla` › "agranda solo hacia el este".
